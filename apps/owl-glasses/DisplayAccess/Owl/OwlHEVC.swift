//
// OwlHEVC.swift
//
// Reads just enough of an HEVC frame to tell whether decoding can start from it.
// Foundation only, so `Tests/run.sh` can test it on the Mac.
//

import Foundation

enum OwlHEVC {
  /// Whether a frame holds a random access picture (NAL unit types 16–23), the kind of frame
  /// decoding can start from. The frame is `total` bytes of NAL units, each after a big-endian
  /// length of `lengthSize` bytes; `read` returns `count` bytes at `offset`. Nil when the bytes
  /// do not read as such units.
  static func holdsRandomAccessPicture(
    total: Int, lengthSize: Int, read: (_ offset: Int, _ count: Int) -> [UInt8]?
  ) -> Bool? {
    guard (1...4).contains(lengthSize) else { return nil }
    var offset = 0
    var units = 0
    while offset < total, units < 256 {
      guard offset + lengthSize + 2 <= total, let header = read(offset, lengthSize + 1),
        header.count == lengthSize + 1
      else { return nil }
      let length = header[0..<lengthSize].reduce(0) { $0 << 8 | Int($1) }
      guard length >= 2, offset + lengthSize + length <= total else { return nil }
      // NAL unit header: one zero bit, then six bits of type.
      if (16...23).contains((header[lengthSize] & 0x7E) >> 1) { return true }
      offset += lengthSize + length
      units += 1
    }
    return units > 0 ? false : nil
  }

  static func holdsRandomAccessPicture(_ frame: [UInt8], lengthSize: Int = 4) -> Bool? {
    holdsRandomAccessPicture(total: frame.count, lengthSize: lengthSize) { offset, count in
      offset >= 0 && offset + count <= frame.count ? Array(frame[offset..<offset + count]) : nil
    }
  }
}
