//
// OwlDemo.swift
//
// Simulator helpers: the video the mock glasses camera streams. MockDeviceKit streams
// video files only (HEVC), so the bundled demo picture is turned into a short HEVC clip.
//

import AVFoundation
import UIKit

enum OwlDemoAssets {
  /// A few seconds of HEVC video of the demo picture, written once per picture to the temp folder.
  static func cameraFeedURL() -> URL? {
    let files = FileManager.default
    let folder = files.temporaryDirectory
    let name = UIImage(named: "owlDemoFeed") != nil ? "owlDemoFeed" : "demoMeal"
    // The picture is in the file name, so a feed an older build wrote from another picture is
    // never streamed again.
    let url = folder.appendingPathComponent("owl-demo-feed-\(name).mp4")
    if files.fileExists(atPath: url.path) { return url }
    for old in (try? files.contentsOfDirectory(atPath: folder.path)) ?? [] where old.hasPrefix("owl-demo-feed") {
      try? files.removeItem(at: folder.appendingPathComponent(old))
    }
    guard let image = UIImage(named: name)?.owlScaled(maxSide: 720).cgImage else { return nil }
    // Written beside the final name first: a half-written feed is never picked up later.
    let draft = folder.appendingPathComponent("owl-demo-feed-writing.mp4")
    guard writeStillVideo(image, to: draft), (try? files.moveItem(at: draft, to: url)) != nil else {
      try? files.removeItem(at: draft)
      return nil
    }
    return url
  }

  private static func writeStillVideo(_ image: CGImage, to url: URL) -> Bool {
    let width = image.width / 2 * 2
    let height = image.height / 2 * 2
    guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return false }
    let input = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.hevc, AVVideoWidthKey: width, AVVideoHeightKey: height,
      ])
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(
      assetWriterInput: input,
      sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        kCVPixelBufferWidthKey as String: width, kCVPixelBufferHeightKey as String: height,
      ])
    writer.add(input)
    guard writer.startWriting() else { return false }
    writer.startSession(atSourceTime: .zero)

    guard let pool = adaptor.pixelBufferPool else { return false }
    var buffer: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
    guard let buffer else { return false }
    CVPixelBufferLockBaseAddress(buffer, [])
    let context = CGContext(
      data: CVPixelBufferGetBaseAddress(buffer), width: width, height: height, bitsPerComponent: 8,
      bytesPerRow: CVPixelBufferGetBytesPerRow(buffer), space: CGColorSpaceCreateDeviceRGB(),
      bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)
    context?.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    CVPixelBufferUnlockBaseAddress(buffer, [])

    let fps: Int32 = 10
    for frame in 0..<(fps * 4) {
      while !input.isReadyForMoreMediaData { usleep(2_000) }
      adaptor.append(buffer, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: fps))
    }
    input.markAsFinished()
    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    return writer.status == .completed
  }
}
