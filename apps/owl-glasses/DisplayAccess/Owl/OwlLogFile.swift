//
// OwlLogFile.swift
//
// Debug builds: the app's log lines also go to a file on the phone (JUN-53). On the real
// glasses the app is usually started by "Hey Meta" or from Meta AI, not from the Mac, so a
// console was never attached when the camera failed. The file is read afterwards with
//
//   xcrun devicectl device copy from --device <UDID> --domain-type appDataContainer \
//     --domain-identifier fi.junction2026.bossit.owl --source Library/Caches/owl-log.txt \
//     --destination owl-log.txt
//
// The file holds what the console shows: Owl's own lines, never a customer's words (JUN-98).
//

import Foundation

enum OwlLogFile {
  /// Keeps the file small: past this size it starts again.
  private static let maxBytes = 4_000_000

  static var url: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("owl-log.txt")
  }

  static func start() {
    #if DEBUG
    let path = url.path
    if let size = (try? FileManager.default.attributesOfItem(atPath: path)[.size]) as? Int, size > maxBytes {
      try? FileManager.default.removeItem(atPath: path)
    }
    // NSLog writes to stderr as well, and stderr goes to the file, a line at a time.
    setenv("CFLOG_FORCE_STDERR", "1", 1)
    guard freopen(path, "a", stderr) != nil else { return }
    setvbuf(stderr, nil, _IOLBF, 0)
    NSLog("[Owl] log file started (\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] ?? "?"))")
    #endif
  }
}
