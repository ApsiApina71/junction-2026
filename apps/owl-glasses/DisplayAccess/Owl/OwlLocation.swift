//
// OwlLocation.swift
//
// Location during training (JUN-97). GPS does not work indoors, so Owl reads the printed
// QR markers the glasses camera sees during a step. The phone decodes them with Vision;
// only the marker's text goes to owl-api, never the picture, and only when it changes.
//
// Markers: `owl:zone:<zone_id>` (an area, e.g. an aisle) or `owl:cp:<process_id>:<step_id>`
// (the checkpoint of one step).
//

import CoreGraphics
import Foundation
import Vision

enum OwlMarkers {
  /// A failing reader is logged once, not every second.
  nonisolated(unsafe) private static var saidError = false

  /// Owl's markers in the picture, nearest (largest) first. Other QR codes are ignored.
  static func read(in image: CGImage) -> [String] {
    let request = VNDetectBarcodesRequest()
    request.symbologies = [.qr]
    #if targetEnvironment(simulator)
      // The simulator has no Neural Engine context for Vision.
      request.usesCPUOnly = true
    #endif
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do {
      try handler.perform([request])
    } catch {
      if !saidError {
        saidError = true
        NSLog("[Owl] markers: \(error)")
      }
      return []
    }
    return (request.results ?? [])
      .sorted { $0.boundingBox.width * $0.boundingBox.height > $1.boundingBox.width * $1.boundingBox.height }
      .compactMap(\.payloadStringValue)
      .filter(isOwlMarker)
  }

  static func isOwlMarker(_ text: String) -> Bool {
    text.hasPrefix("owl:zone:") || text.hasPrefix("owl:cp:")
  }
}
