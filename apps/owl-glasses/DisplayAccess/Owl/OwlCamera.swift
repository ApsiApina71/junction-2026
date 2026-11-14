//
// OwlCamera.swift
//
// The glasses camera on the display session. Owl only uses stream frames, never photo
// capture: Meta's known issue says capture holds back display updates on Display glasses
// until the photo has transferred.
//
// The stream is HEVC (`.hvc1`), not `.raw`: raw frames stop when the app goes to the
// background (DAT docs, VideoCodec), and the worker's phone is locked in a pocket. Owl
// keeps the frames since the last key frame and decodes them only when it needs a picture
// (Owl Check, Help, Record's reference photo). Record writes the HEVC frames of one step
// to an MP4 without re-encoding (`ClipRecorder`); the server converts it for the display.
//

import AVFoundation
import CoreImage
import CoreMedia
import Foundation
import MWDATCamera
import MWDATCore
import UIKit
import VideoToolbox

final class OwlCamera: @unchecked Sendable {
  private let camera: Camera
  private let tokens = ListenerTokenBag()
  private let lock = NSLock()
  /// Compressed frames from the last key frame on, enough to decode the newest one.
  private var gop: [CMSampleBuffer] = []
  /// The last few compressed frames, for the clip fallback (at least a few frames long).
  private var recent: [CMSampleBuffer] = []
  /// The newest decoded frame, when the stream delivers decoded frames (the simulator can).
  private var latestPixels: CVPixelBuffer?
  private var latestFrameAt: Date?
  private var recorder: ClipRecorder?
  private var frameCount = 0
  private let decoder = FrameDecoder()
  /// Simulator testing: always send clips, as if the phone could not decode (OWL_FORCE_CLIP=1).
  private static let forceClip = ProcessInfo.processInfo.environment["OWL_FORCE_CLIP"] == "1"

  /// Called on stream errors after the camera has started (glasses taken off, link lost).
  var onError: (@Sendable (String) -> Void)?

  private init(camera: Camera) {
    self.camera = camera
  }

  @MainActor
  static func open(on session: DeviceSession) async throws -> OwlCamera {
    let config = StreamConfiguration(videoCodec: .hvc1, resolution: .medium, frameRate: 15)
    guard let camera = try session.addCamera(config: config) else { throw OwlError.noCamera }
    let owlCamera = OwlCamera(camera: camera)
    try await owlCamera.start()
    return owlCamera
  }

  private func start() async throws {
    let stream = camera.stream
    stream.videoFramePublisher.listen { [weak self] frame in
      self?.receive(frame.sampleBuffer)
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
    let started = ContinuousClock.now
    stream.start()
    try await withOwlTimeout(.seconds(20)) {
      for await state in states where state == .streaming { return }
      throw OwlError.noCamera
    }
    // JUN-82: how long the stream takes to start, to decide whether to keep it on between steps.
    NSLog("[Owl] perf: camera stream started in \(Int((ContinuousClock.now - started) / .milliseconds(1))) ms")
  }

  private func receive(_ sample: CMSampleBuffer) {
    let pixels = CMSampleBufferGetImageBuffer(sample)
    let recorder = lock.withLock {
      frameCount += 1
      if frameCount == 1 || frameCount % 300 == 0 {
        NSLog("[Owl] camera frames: \(frameCount) (\(pixels == nil ? "hevc" : "decoded"))")
      }
      latestFrameAt = Date()
      if let pixels {
        latestPixels = pixels
      } else {
        if sample.owlIsKeyFrame {
          gop = [sample]
        } else if !gop.isEmpty, gop.count < 300 {
          gop.append(sample)
        }
        recent.append(sample)
        if recent.count > 15 { recent.removeFirst(recent.count - 15) }
      }
      return self.recorder
    }
    recorder?.append(sample)
  }

  /// The newest stream frame for owl-api: a JPEG whose longest side is at most `maxSide`,
  /// or the frames since the last key frame as a short HEVC clip when decoding fails.
  /// Nil when no frame arrived in the last `maxAge` seconds (stream stalled or glasses off).
  func latestJPEG(maxSide: CGFloat = 1024, maxAge: TimeInterval = 3) -> OwlFrame? {
    if !Self.forceClip, let jpeg = photoJPEG(maxSide: maxSide, maxAge: maxAge) { return .jpeg(jpeg) }
    let (gop, recent, at) = lock.withLock { (gop, recent, latestFrameAt) }
    // From the earliest key frame among the recent frames, or the whole group of pictures.
    let fromRecent = recent.firstIndex(where: \.owlIsKeyFrame).map { Array(recent[$0...]) } ?? []
    let frames = fromRecent.count > gop.count ? fromRecent : gop
    guard let at, Date().timeIntervalSince(at) <= maxAge, frames.count >= 2,
      let clip = ClipRecorder.writeSync(frames)
    else { return nil }
    NSLog("[Owl] sending a \(frames.count)-frame clip instead of a JPEG")
    return .clip(clip)
  }

  /// The newest stream frame decoded on the phone, as JPEG. Nil when it cannot be decoded.
  func photoJPEG(maxSide: CGFloat = 1024, maxAge: TimeInterval = 3) -> Data? {
    let (gop, pixels, at) = lock.withLock { (gop, latestPixels, latestFrameAt) }
    guard let at, Date().timeIntervalSince(at) <= maxAge else { return nil }
    guard let frame = pixels ?? decoder.decodeLast(of: gop) else { return nil }
    return UIImage.owlImage(from: frame)?.owlScaled(maxSide: maxSide).jpegData(compressionQuality: 0.75)
  }

  /// Waits up to `timeout` for a fresh frame (the stream needs a moment after opening).
  func nextJPEG(timeout: Duration = .seconds(4)) async -> OwlFrame? {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)
    while clock.now < deadline {
      if let jpeg = latestJPEG() { return jpeg }
      try? await Task.sleep(for: .milliseconds(150))
    }
    return nil
  }

  /// A picture taken after `date`, or nil when none arrives within `timeout`. A final check
  /// asks for one taken after the worker's pinch, so a frame from before the fix never
  /// decides whether the step is done (JUN-57).
  func frame(after date: Date, timeout: Duration = .seconds(2.5)) async -> OwlFrame? {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: timeout)
    while clock.now < deadline {
      let arrived = lock.withLock { latestFrameAt }
      if let arrived, arrived > date, let frame = latestJPEG(maxAge: 1.5) { return frame }
      try? await Task.sleep(for: .milliseconds(100))
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
    lock.withLock {
      recorder = nil
      gop = []
      recent = []
      latestPixels = nil
    }
    tokens.clear()
    camera.stop()
  }
}

/// Decodes HEVC stream frames with VideoToolbox. The glasses can lower the resolution
/// mid-stream, so the session is rebuilt whenever the format changes.
final class FrameDecoder: @unchecked Sendable {
  private let lock = NSLock()
  private var session: VTDecompressionSession?
  private var format: CMFormatDescription?

  /// Decodes `samples` (a key frame and the frames after it) and returns the last picture.
  func decodeLast(of samples: [CMSampleBuffer]) -> CVPixelBuffer? {
    guard let first = samples.first, let format = CMSampleBufferGetFormatDescription(first) else {
      return nil
    }
    return lock.withLock {
      guard let session = session(for: format) else { return nil }
      var last: CVPixelBuffer?
      for sample in samples {
        let status = VTDecompressionSessionDecodeFrame(
          session, sampleBuffer: sample, flags: [], infoFlagsOut: nil
        ) { status, _, image, _, _ in
          if status == noErr, let image { last = image }
        }
        if status != noErr {
          NSLog("[Owl] decode failed: \(status)")
          // An invalid session (for example after the app went to the background) is rebuilt next time.
          invalidate()
          return nil
        }
      }
      return last
    }
  }

  private func session(for format: CMFormatDescription) -> VTDecompressionSession? {
    if let session, let current = self.format, CMFormatDescriptionEqual(current, otherFormatDescription: format) {
      return session
    }
    invalidate()
    var newSession: VTDecompressionSession?
    let attributes = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA] as CFDictionary
    let status = VTDecompressionSessionCreate(
      allocator: nil, formatDescription: format, decoderSpecification: nil,
      imageBufferAttributes: attributes, outputCallback: nil, decompressionSessionOut: &newSession)
    guard status == noErr, let newSession else {
      NSLog("[Owl] decoder create failed: \(status)")
      return nil
    }
    let size = CMVideoFormatDescriptionGetDimensions(format)
    NSLog("[Owl] decoder for \(size.width)×\(size.height)")
    session = newSession
    self.format = format
    return newSession
  }

  private func invalidate() {
    if let session { VTDecompressionSessionInvalidate(session) }
    session = nil
    format = nil
  }
}

extension CMSampleBuffer {
  /// True for HEVC key frames (no `NotSync` attachment).
  var owlIsKeyFrame: Bool {
    guard let attachments = CMSampleBufferGetSampleAttachmentsArray(self, createIfNecessary: false)
      as? [[CFString: Any]], let first = attachments.first
    else { return true }
    return !(first[kCMSampleAttachmentKey_NotSync] as? Bool ?? false)
  }
}

/// Writes one step's stream frames to an MP4. HEVC frames are copied as they are, starting
/// at a key frame; decoded frames (simulator) are encoded to H.264. The server converts the
/// clip to a display-sized H.264 MP4 (≤ 400 px per side, faststart).
final class ClipRecorder: @unchecked Sendable {
  private let url: URL
  private let lock = NSLock()
  private var writer: AVAssetWriter?
  private var input: AVAssetWriterInput?
  private var adaptor: AVAssetWriterInputPixelBufferAdaptor?
  private var frames = 0
  private var failed = false
  private var lastTime = CMTime.invalid

  init(url: URL) {
    self.url = url
  }

  func append(_ sample: CMSampleBuffer) {
    let time = CMSampleBufferGetPresentationTimeStamp(sample)
    let pixels = CMSampleBufferGetImageBuffer(sample)
    lock.withLock {
      guard !failed else { return }
      if writer == nil {
        // A compressed clip has to start at a key frame to be playable, and passthrough needs a
        // format hint (AVAssetWriter throws an Objective-C exception without one).
        guard pixels != nil || (sample.owlIsKeyFrame && CMSampleBufferGetFormatDescription(sample) != nil)
        else { return }
        setUp(sample: sample, pixels: pixels, at: time)
      }
      guard let input, input.isReadyForMoreMediaData else { return }
      if let pixels, let adaptor {
        if adaptor.append(pixels, withPresentationTime: time) { frames += 1; lastTime = time }
      } else if pixels == nil, input.append(sample) {
        frames += 1
        lastTime = time
      }
    }
  }

  private func setUp(sample: CMSampleBuffer, pixels: CVPixelBuffer?, at time: CMTime) {
    do {
      try? FileManager.default.removeItem(at: url)
      let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
      writer.shouldOptimizeForNetworkUse = true
      let input: AVAssetWriterInput
      if let pixels {
        input = AVAssetWriterInput(
          mediaType: .video,
          outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: CVPixelBufferGetWidth(pixels),
            AVVideoHeightKey: CVPixelBufferGetHeight(pixels),
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1_200_000],
          ])
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: nil)
      } else {
        input = AVAssetWriterInput(
          mediaType: .video, outputSettings: nil,
          sourceFormatHint: CMSampleBufferGetFormatDescription(sample))
      }
      input.expectsMediaDataInRealTime = true
      writer.add(input)
      guard writer.startWriting() else {
        failed = true
        NSLog("[Owl] clip writer: \(String(describing: writer.error))")
        return
      }
      writer.startSession(atSourceTime: time)
      self.writer = writer
      self.input = input
    } catch {
      failed = true
      NSLog("[Owl] clip writer: \(error)")
    }
  }

  /// Writes HEVC `samples` (starting at a key frame) to a temporary MP4 and returns its bytes.
  static func writeSync(_ samples: [CMSampleBuffer]) -> Data? {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("owl-frame-\(UUID().uuidString).mp4")
    defer { try? FileManager.default.removeItem(at: url) }
    let recorder = ClipRecorder(url: url)
    for sample in samples { recorder.append(sample) }
    let done = DispatchSemaphore(value: 0)
    let box = ResultBox()
    Task.detached {
      box.url = await recorder.finish()
      done.signal()
    }
    guard done.wait(timeout: .now() + 2) == .success, let written = box.url else { return nil }
    return try? Data(contentsOf: written)
  }

  private final class ResultBox: @unchecked Sendable {
    var url: URL?
  }

  func finish() async -> URL? {
    let (writer, input, frames, lastTime) = lock.withLock { (self.writer, self.input, self.frames, self.lastTime) }
    guard let writer, let input, frames > 0 else { return nil }
    input.markAsFinished()
    // Give the last frame a duration (1/15 s), so a short clip is not empty.
    if lastTime.isValid { writer.endSession(atSourceTime: lastTime + CMTime(value: 1, timescale: 15)) }
    await writer.finishWriting()
    NSLog("[Owl] clip: \(frames) frames, \(writer.status == .completed ? "ok" : "failed \(String(describing: writer.error))")")
    return writer.status == .completed ? url : nil
  }
}

extension UIImage {
  private static let ciContext = CIContext()

  /// A picture of a decoded video frame.
  static func owlImage(from pixels: CVPixelBuffer) -> UIImage? {
    let image = CIImage(cvPixelBuffer: pixels)
    guard let cgImage = ciContext.createCGImage(image, from: image.extent) else { return nil }
    return UIImage(cgImage: cgImage)
  }

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
