//
// OwlArt.swift
//
// Everything on the glasses that the Display DSL cannot draw itself (JUN-36): the owl and
// the small pictures that carry the evidence of a step. The DSL has three text styles and
// two colours, so sizes, emphasis and colour live in these images. Text that the worker
// must read as an instruction stays native text in `OwlScreens`.
//
// The display is additive: black is see-through and every lit pixel covers the work. So
// the pictures are transparent, thin and small, and colour is used for two meanings only:
// green for "Owl verified this", warm yellow for "look at this". Each also has a shape,
// so the meaning never depends on colour alone.
//

import UIKit

/// The owl's expression. It always follows what Owl is really doing, never decoration.
enum OwlMood: String, Sendable, CaseIterable {
  case welcome
  case watching
  case listening
  case thinking
  /// A calm heads-up: something to look at.
  case alert
  /// Owl cannot see or cannot check.
  case unsure
  case done
  case resting
}

@MainActor
enum OwlArt {
  static let width: CGFloat = 520

  static let white = UIColor.white
  static let soft = UIColor(white: 1, alpha: 0.74)
  static let dim = UIColor(white: 1, alpha: 0.36)
  static let faint = UIColor(white: 1, alpha: 0.12)
  static let good = UIColor(red: 0.39, green: 0.90, blue: 0.65, alpha: 1)
  static let attention = UIColor(red: 1.0, green: 0.78, blue: 0.36, alpha: 1)

  // MARK: - The owl

  /// Head and shoulders, for the corner of a card while the worker is busy.
  static func avatar(_ mood: OwlMood) -> UIImage? {
    UIImage(named: "owl" + mood.rawValue.prefix(1).uppercased() + mood.rawValue.dropFirst())
  }

  /// The whole owl, for the moments when nothing is being worked on (welcome, finished, resting).
  static func figure(_ mood: OwlMood, height: CGFloat = 230) -> UIImage? {
    let name = "owlFull" + mood.rawValue.prefix(1).uppercased() + mood.rawValue.dropFirst()
    guard let owl = UIImage(named: name) ?? avatar(mood) else { return nil }
    return canvas(height: height) { _ in
      let scale = min(height / owl.size.height, width / owl.size.width)
      let size = CGSize(width: owl.size.width * scale, height: owl.size.height * scale)
      owl.draw(in: CGRect(x: (width - size.width) / 2, y: height - size.height, width: size.width, height: size.height))
    }
  }

  // MARK: - A step

  /// Where the worker is in the task, for the bottom of the step picture.
  struct Progress {
    let index: Int
    let count: Int
    let outcomes: [OwlStepOutcome?]
  }

  /// The evidence of a step in one picture: the expert's photo, a short list beside it (the
  /// order lines, or what Owl looks for), and where the worker is in the task. `photoHeight`
  /// shrinks when the words on the card need the room. `wrap` lets a list line run over
  /// several lines instead of being cut.
  static func stepBanner(
    photo: UIImage?, photoTag: String?, checkLabel: String?, checkLines: [(bold: String?, text: String)],
    progress: Progress?, photoHeight: CGFloat = 160, wrap: Bool = false
  ) -> UIImage {
    let hasText = checkLabel != nil && !checkLines.isEmpty
    let listHeight: CGFloat = hasText ? (wrap ? 104 : CGFloat(26 + min(checkLines.count, 4) * 26)) : 0
    let bodyHeight: CGFloat = photo != nil ? max(photoHeight, listHeight) : listHeight
    let barTop = bodyHeight > 0 ? bodyHeight + 12 : 0
    return canvas(height: barTop + (progress == nil ? (bodyHeight > 0 ? -12 : 1) : 8)) { context in
      var textLeft: CGFloat = 0
      if let photo {
        // With a list beside it the photo keeps its shape; alone it fills the width.
        let rect =
          hasText
          ? CGRect(x: 0, y: 0, width: min(232, photoHeight * photo.size.width / max(photo.size.height, 1)), height: photoHeight)
          : CGRect(x: 0, y: 0, width: width, height: photoHeight)
        drawFilled(photo, in: rect, radius: 18, context: context)
        if let photoTag, photoHeight >= 120 { drawTag(photoTag, at: CGPoint(x: rect.minX + 8, y: rect.maxY - 30)) }
        textLeft = rect.maxX + 18
      }
      if hasText, let checkLabel {
        let column = CGRect(x: textLeft, y: 2, width: width - textLeft, height: bodyHeight)
        draw(checkLabel, in: CGRect(x: column.minX, y: column.minY, width: column.width, height: 18), font: .systemFont(ofSize: 12.5, weight: .bold), color: soft, kern: 1.2)
        var y = column.minY + 26
        for line in checkLines.prefix(4) {
          var x = column.minX
          if let bold = line.bold {
            let font = UIFont.systemFont(ofSize: 19, weight: .heavy)
            draw(bold, in: CGRect(x: x, y: y, width: 44, height: 26), font: font, color: white)
            x += (bold as NSString).size(withAttributes: [.font: font]).width + 8
          }
          if wrap {
            draw(line.text, in: CGRect(x: x, y: y, width: column.maxX - x, height: bodyHeight - y), font: .systemFont(ofSize: 21, weight: .semibold), color: white, wraps: true)
            break
          }
          let font = fit(line.text, weight: .medium, from: 19, to: 14, width: column.maxX - x)
          draw(line.text, in: CGRect(x: x, y: y + (19 - font.pointSize) / 2, width: column.maxX - x, height: 26), font: font, color: white)
          y += 26
        }
      }
      if let progress {
        drawProgress(top: barTop, index: progress.index, count: progress.count, outcomes: progress.outcomes)
      }
    }
  }

  private static func drawProgress(top: CGFloat, index: Int, count: Int, outcomes: [OwlStepOutcome?]) {
    guard count > 0 else { return }
    let gap: CGFloat = 6
    let segment = (width - gap * CGFloat(count - 1)) / CGFloat(count)
    for i in 0..<count {
      let rect = CGRect(x: CGFloat(i) * (segment + gap), y: top + 1, width: segment, height: 6)
      let path = UIBezierPath(roundedRect: rect, cornerRadius: 3)
      if i + 1 < index {
        switch i < outcomes.count ? outcomes[i] : nil {
        case .verified:
          good.setFill()
          path.fill()
        case .unverified:
          // Hollow: this step was passed without a verification.
          attention.setStroke()
          let outline = UIBezierPath(roundedRect: rect.insetBy(dx: 0.75, dy: 0.75), cornerRadius: 2.25)
          outline.lineWidth = 1.5
          outline.stroke()
        default:
          soft.setFill()
          path.fill()
        }
      } else {
        (i + 1 == index ? white : UIColor(white: 1, alpha: 0.2)).setFill()
        path.fill()
      }
    }
  }

  // MARK: - A correction

  /// What the order says beside what Owl saw. What is needed is the large, bright side;
  /// what was seen is the smaller, supporting side with the "look here" mark.
  static func evidence(
    leftLabel: String, leftSmall: String?, leftBig: String, rightLabel: String, rightSmall: String?, rightBig: String
  ) -> UIImage {
    let height: CGFloat = 132
    return canvas(height: height) { _ in
      let gap: CGFloat = 12
      let needed = (width - gap) * 0.58
      drawCell(CGRect(x: 0, y: 0, width: needed, height: height), label: leftLabel, small: leftSmall, big: leftBig, needed: true)
      drawCell(
        CGRect(x: needed + gap, y: 0, width: width - needed - gap, height: height), label: rightLabel, small: rightSmall,
        big: rightBig, needed: false)
    }
  }

  private static func drawCell(_ rect: CGRect, label: String, small: String?, big: String, needed: Bool) {
    let tint = needed ? white : attention
    let box = UIBezierPath(roundedRect: rect.insetBy(dx: 1.5, dy: 1.5), cornerRadius: 18)
    tint.withAlphaComponent(needed ? 0.12 : 0.08).setFill()
    box.fill()
    tint.withAlphaComponent(needed ? 1 : 0.6).setStroke()
    box.lineWidth = needed ? 2.5 : 1.5
    box.stroke()
    let inner = rect.insetBy(dx: 16, dy: 12)
    draw(label, in: CGRect(x: inner.minX, y: inner.minY, width: inner.width - (needed ? 0 : 26), height: 16), font: .systemFont(ofSize: 12, weight: .bold), color: needed ? white : tint, kern: 1.1)
    if !needed {
      // A round "look here" mark, so the meaning does not rest on the colour.
      let dot = CGRect(x: inner.maxX - 20, y: inner.minY - 2, width: 20, height: 20)
      tint.setFill()
      UIBezierPath(ovalIn: dot).fill()
      draw("!", in: dot.offsetBy(dx: 0, dy: 1.5), font: .systemFont(ofSize: 14, weight: .black), color: .black, align: .center)
    }
    if let small {
      let font = fit(small, weight: .medium, from: 17, to: 13, width: inner.width)
      draw(small, in: CGRect(x: inner.minX, y: inner.minY + 24, width: inner.width, height: 22), font: font, color: soft)
    }
    let top = inner.minY + (small == nil ? 34 : 46)
    let largest: CGFloat = needed ? (small == nil ? 40 : 50) : (small == nil ? 26 : 32)
    let font = fit(big, weight: needed ? .heavy : .bold, from: largest, to: 17, width: inner.width)
    draw(big, in: CGRect(x: inner.minX, y: top + (50 - font.pointSize) / 2, width: inner.width, height: font.pointSize + 10), font: font, color: tint)
  }

  // MARK: - The summary

  /// One row per step: verified, not verified or no check, as a shape and a word.
  static func summary(_ rows: [OwlRunSummary.Row], verified: String, notVerified: String, noCheck: String) -> UIImage {
    let rowHeight: CGFloat = rows.count > 6 ? 28 : 34
    return canvas(height: CGFloat(rows.count) * rowHeight) { _ in
      for (i, row) in rows.enumerated() {
        let y = CGFloat(i) * rowHeight
        let mark = CGRect(x: 2, y: y + (rowHeight - 22) / 2, width: 22, height: 22)
        let word: String
        let tint: UIColor
        switch row.outcome {
        case .verified:
          word = verified
          tint = good
          tint.setFill()
          UIBezierPath(ovalIn: mark).fill()
          let check = UIBezierPath()
          check.move(to: CGPoint(x: mark.minX + 6, y: mark.midY + 0.5))
          check.addLine(to: CGPoint(x: mark.minX + 9.5, y: mark.midY + 4))
          check.addLine(to: CGPoint(x: mark.maxX - 5.5, y: mark.midY - 4))
          check.lineWidth = 2.6
          check.lineCapStyle = .round
          check.lineJoinStyle = .round
          UIColor.black.setStroke()
          check.stroke()
        case .unverified:
          word = notVerified
          tint = attention
          let ring = UIBezierPath(ovalIn: mark.insetBy(dx: 1.5, dy: 1.5))
          ring.lineWidth = 2.4
          ring.setLineDash([4, 3.4], count: 2, phase: 0)
          tint.setStroke()
          ring.stroke()
        case .noCheck:
          word = noCheck
          tint = dim
          let dash = UIBezierPath(roundedRect: CGRect(x: mark.minX + 5, y: mark.midY - 1.3, width: 12, height: 2.6), cornerRadius: 1.3)
          tint.setFill()
          dash.fill()
        }
        let wordFont = UIFont.systemFont(ofSize: 14, weight: .semibold)
        let wordWidth = (word as NSString).size(withAttributes: [.font: wordFont]).width + 2
        draw(word, in: CGRect(x: width - wordWidth, y: y + (rowHeight - 18) / 2, width: wordWidth, height: 20), font: wordFont, color: row.outcome == .noCheck ? soft : tint, align: .right)
        let title = "\(row.index)  \(row.title)"
        draw(title, in: CGRect(x: 36, y: y + (rowHeight - 22) / 2, width: width - 36 - wordWidth - 12, height: 24), font: .systemFont(ofSize: 18, weight: .medium), color: white)
      }
    }
  }

  // MARK: - Help

  /// The worker's own view with the expert's ring on it, kept whole and small.
  static func framed(_ image: UIImage, height: CGFloat = 214) -> UIImage {
    canvas(height: height) { context in
      let scale = min(height / image.size.height, width / image.size.width)
      let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
      drawFilled(image, in: CGRect(x: (width - size.width) / 2, y: 0, width: size.width, height: size.height), radius: 16, context: context)
    }
  }

  // MARK: - Drawing

  private static func canvas(height: CGFloat, _ body: (CGContext) -> Void) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 2
    format.opaque = false
    let size = CGSize(width: width, height: max(height, 1))
    return UIGraphicsImageRenderer(size: size, format: format).image { body($0.cgContext) }
  }

  private static func drawFilled(_ image: UIImage, in rect: CGRect, radius: CGFloat, context: CGContext) {
    context.saveGState()
    UIBezierPath(roundedRect: rect, cornerRadius: radius).addClip()
    let scale = max(rect.width / max(image.size.width, 1), rect.height / max(image.size.height, 1))
    let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    image.draw(in: CGRect(x: rect.midX - size.width / 2, y: rect.midY - size.height / 2, width: size.width, height: size.height))
    context.restoreGState()
  }

  private static func drawTag(_ text: String, at point: CGPoint) {
    let font = UIFont.systemFont(ofSize: 12.5, weight: .semibold)
    let size = (text as NSString).size(withAttributes: [.font: font])
    let rect = CGRect(x: point.x, y: point.y, width: size.width + 16, height: 22)
    UIColor(white: 0, alpha: 0.62).setFill()
    UIBezierPath(roundedRect: rect, cornerRadius: 11).fill()
    draw(text, in: CGRect(x: rect.minX + 8, y: rect.minY + 3, width: size.width + 2, height: 18), font: font, color: white)
  }

  private static func draw(
    _ text: String, in rect: CGRect, font: UIFont, color: UIColor, align: NSTextAlignment = .left, kern: CGFloat = 0,
    wraps: Bool = false
  ) {
    let style = NSMutableParagraphStyle()
    style.alignment = align
    style.lineBreakMode = wraps ? .byWordWrapping : .byTruncatingTail
    (text as NSString).draw(
      with: rect, options: [.usesLineFragmentOrigin, .truncatesLastVisibleLine],
      attributes: [.font: font, .foregroundColor: color, .paragraphStyle: style, .kern: kern], context: nil)
  }

  /// The largest font from `size` down to `minimum` at which `text` fits `width` on one line.
  private static func fit(_ text: String, weight: UIFont.Weight, from size: CGFloat, to minimum: CGFloat, width: CGFloat) -> UIFont {
    var current = size
    while current > minimum {
      let font = UIFont.systemFont(ofSize: current, weight: weight)
      if (text as NSString).size(withAttributes: [.font: font]).width <= width { return font }
      current -= 1
    }
    return .systemFont(ofSize: minimum, weight: weight)
  }
}
