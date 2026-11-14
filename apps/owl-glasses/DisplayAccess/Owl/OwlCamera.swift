//
// OwlCamera.swift
//
// The glasses camera on the display session. Owl only uses stream frames, never photo
// capture: Meta's known issue says capture holds back display updates on Display glasses
// until the photo has transferred. The latest frame feeds Owl Check and Help, and Record
// writes the frames of one step to a small H.264 MP4 (`ClipRecorder`).
//

import AVFoundation
import CoreMedia
import Foundation
import MWDATCamera
import MWDATCore
import UIKit

final class OwlCamera: @unchecked Sendable {
  private let camera: Camera
  private let tokens = ListenerTokenBag()
  private let lock = NSLock()
  private var latestFrame: VideoFrame?
  private var latestFrameAt: Date?
  private var recorder: ClipRecorder?

  /// Called on stream errors after the camera has started (glasses taken off, link lost).
  var onError: (@Sendable (String) -> Void)?

  private init(camera: Camera) {
    self.camera = camera
  }

  @MainActor
  static func open(on session: DeviceSession) async throws -> OwlCamera {
    let config = StreamConfiguration(videoCodec: .raw, resolution: .medium, frameRate: 15)
    guard let camera = try session.addCamera(config: config) else { throw OwlError.noCamera }
    let owlCamera = OwlCamera(camera: camera)
    try await owlCamera.start()
    return owlCamera
  }

  private func start() async throws {
    let stream = camera.stream
    stream.videoFramePublisher.listen { [weak self] frame in
      self?.receive(frame)
    }.store(in: tokens)
    stream.errorPublisher.listen { [weak self] error in
      NSLog("[Owl] stream error: \(error)")
      self?.onError?(error.localizedDescription)
    }.store(in: tokens)

    let states = AsyncStream<StreamState> { continuation in
      stream.statePublisher.listen { state in
        NSLog("[Owl] stream state: \(state)")
        continuation.yield(state)
      }.store(in: tokens)
    }
    stream.start()
    try await withOwlTimeout(.seconds(20)) {
      for await state in states where state == .streaming { return }
      throw OwlError.noCamera
    }
  }

  private var frameCount = 0

  private func receive(_ frame: VideoFrame) {
    let recorder = lock.withLock {
      frameCount += 1
      if frameCount == 1 || frameCount % 300 == 0 { NSLog("[Owl] camera frames: \(frameCount)") }
      latestFrame = frame
      latestFrameAt = Date()
      return self.recorder
    }
    recorder?.append(frame.sampleBuffer)
  }

  /// The newest stream frame as JPEG, scaled so its longest side is at most `maxSide`.
  /// Nil when no frame arrived in the last `maxAge` seconds (stream stalled or glasses off).
  func latestJPEG(maxSide: CGFloat = 1024, maxAge: TimeInterval = 3) -> Data? {
    let (frame, at) = lock.withLock { (latestFrame, latestFrameAt) }
    guard let frame, let at, Date().timeIntervalSince(at) <= maxAge,
      let image = frame.makeUIImage()
    else { return nil }
    return image.owlScaled(maxSide: maxSide).jpegData(compressionQuality: 0.75)
  }

  /// Waits up to `timeout` for a fresh frame (the stream needs a moment after opening).
  func nextJPEG(timeout: Duration = .seconds(4)) async -> Data? {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)
    while clock.now < deadline {
      if let jpeg = latestJPEG() { return jpeg }
      try? await Task.sleep(for: .milliseconds(150))
    }
    return nil
  }

  // MARK: - Clips (Record mode)

  func startClip() throws {
    let url = FileManager.default.temporaryDirectory
      .appendingPathComponent("owl-clip-\(UUID().uuidString).mp4")
    let newRecorder = ClipRecorder(url: url)
    lock.withLock { recorder = newRecorder }
  }

  /// Stops the clip and returns the MP4 file, or nil if no frames were written.
  func finishClip() async -> URL? {
    let current = lock.withLock {
      let current = recorder
      recorder = nil
      return current
    }
    return await current?.finish()
  }

  func close() {
    lock.withLock { recorder = nil }
    tokens.clear()
    camera.stop()
  }
}

/// Writes raw stream frames to an H.264 MP4. The server re-encodes it to display size
/// (≤ 400 px per side, faststart), so this keeps the source size.
final class ClipRecorder: @unchecked Sendable {
  private let url: URL
  private let lock = NSLock()
  private var writer: AVAssetWriter?
  private var input: AVAssetWriterInput?
  private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
  private var frames = 0
  private var failed = false

  init(url: URL) {
    self.url = url
  }

  func append(_ sampleBuffer: CMSampleBuffer) {
    guard let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let time = CMSampleBufferGetPresentationTimeStamp(sampleBuffer)
    lock.withLock {
      guard !failed else { return }
      if writer == nil { setUp(width: CVPixelBufferGetWidth(pixelBuffer), height: CVPixelBufferGetHeight(pixelBuffer), at: time) }
      guard let input, let adaptor, input.isReadyForMoreMediaData else { return }
      if adaptor.append(pixelBuffer, withPresentationTime: time) { frames += 1 }
    }
  }

  private func setUp(width: Int, height: Int, at time: CMTime) {
    do {
      try? FileManager.default.removeItem(at: url)
      let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
      writer.shouldOptimizeForNetworkUse = true
      let input = AVAssetWriterInput(
        mediaType: .video,
        outputSettings: [
          AVVideoCodecKey: AVVideoCodecType.h264,
          AVVideoWidthKey: width,
          AVVideoHeightKey: height,
          AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_200_000],
        ])
      input.expectsMediaDataInRealTime = true
      let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
      writer.add(input)
      guard writer.startWriting() else {
        failed = true
        NSLog("[Owl] clip writer: \(String(describing: writer.error))")
        return
      }
      writer.startSession(atSourceTime: time)
      self.writer = writer
      self.input = input
      self.adaptor = adaptor
    } catch {
      failed = true
      NSLog("[Owl] clip writer: \(error)")
    }
  }

  func finish() async -> URL? {
    let (writer, input, frames) = lock.withLock { (self.writer, self.input, self.frames) }
    guard let writer, let input, frames > 0 else { return nil }
    input.markAsFinished()
    await writer.finishWriting()
    return writer.status == .completed ? url : nil
  }
}

extension UIImage {
  /// A copy whose longest side is at most `maxSide` points (scale 1).
  func owlScaled(maxSide: CGFloat) -> UIImage {
    let longest = max(size.width, size.height)
    guard longest > maxSide else { return self }
    let factor = maxSide / longest
    let target = CGSize(width: (size.width * factor).rounded(), height: (size.height * factor).rounded())
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    return UIGraphicsImageRenderer(size: target, format: format).image { _ in
      draw(in: CGRect(origin: .zero, size: target))
    }
  }
}

/// Runs `operation`, failing with `OwlError.cameraTimeout` if it takes longer than `limit`.
func withOwlTimeout<T: Sendable>(
  _ limit: Duration, _ operation: @escaping @Sendable () async throws -> T
) async throws -> T {
  try await withThrowingTaskGroup(of: T.self) { group in
    group.addTask { try await operation() }
    group.addTask {
      try await Task.sleep(for: limit)
      throw OwlError.cameraTimeout
    }
    defer { group.cancelAll() }
    guard let result = try await group.next() else { throw OwlError.cameraTimeout }
    return result
  }
}
