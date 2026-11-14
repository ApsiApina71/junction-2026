//
// BearArt.swift
//
// Bite (Junction 2026): draws Bo the bear and the daily progress card as images for the
// glasses display. Black is transparent on the additive display, so everything is drawn
// in bright colours on black.
//

import UIKit

enum BearMood {
  case happy
  case looking
  case thinking
  case oops
}

enum BearArt {
  private static let fur = UIColor(red: 0.84, green: 0.55, blue: 0.27, alpha: 1)
  private static let furLight = UIColor(red: 0.96, green: 0.80, blue: 0.58, alpha: 1)
  private static let ink = UIColor(red: 0.20, green: 0.11, blue: 0.05, alpha: 1)
  private static let ringTrack = UIColor(white: 0.28, alpha: 1)
  private static let ringGood = UIColor(red: 0.42, green: 0.86, blue: 0.47, alpha: 1)
  private static let ringNear = UIColor(red: 1.00, green: 0.75, blue: 0.30, alpha: 1)
  private static let ringOver = UIColor(red: 1.00, green: 0.42, blue: 0.38, alpha: 1)

  /// A wide card: Bo on the left, today's calorie ring on the right.
  static func dayCard(mood: BearMood, eatenKcal: Int, goalKcal: Int, caption: String) -> UIImage {
    let size = CGSize(width: 560, height: 220)
    return render(size: size) { ctx in
      drawBear(in: CGRect(x: 10, y: 10, width: 200, height: 200), mood: mood, ctx: ctx)

      let ringRect = CGRect(x: 250, y: 20, width: 180, height: 180)
      let progress = goalKcal > 0 ? CGFloat(eatenKcal) / CGFloat(goalKcal) : 0
      drawRing(in: ringRect, progress: progress, ctx: ctx)

      drawText(
        "\(eatenKcal)", in: CGRect(x: ringRect.minX, y: ringRect.midY - 34, width: ringRect.width, height: 44),
        size: 38, weight: .bold, color: .white)
      drawText(
        "of \(goalKcal) kcal", in: CGRect(x: ringRect.minX, y: ringRect.midY + 10, width: ringRect.width, height: 24),
        size: 18, weight: .medium, color: UIColor(white: 0.8, alpha: 1))

      drawText(
        caption, in: CGRect(x: 440, y: 92, width: 120, height: 60),
        size: 20, weight: .semibold, color: furLight, alignment: .left)
    }
  }

  /// Watch mode: Bo, what he sees right now, and the open meal's progress.
  static func watchCard(
    sceneText: String, sceneColor: UIColor, openTitle: String?, portionLeft: Double?,
    eatenKcal: Int, goalKcal: Int
  ) -> UIImage {
    render(size: CGSize(width: 560, height: 220)) { ctx in
      drawBear(in: CGRect(x: 10, y: 20, width: 180, height: 180), mood: .looking, ctx: ctx)

      // What Bo sees: a coloured dot and a label
      sceneColor.setFill()
      ctx.fillEllipse(in: CGRect(x: 214, y: 30, width: 20, height: 20))
      drawText(sceneText, in: CGRect(x: 244, y: 22, width: 310, height: 34),
               size: 24, weight: .semibold, color: sceneColor, alignment: .left)

      if let openTitle, let portionLeft {
        drawText("Eating: \(openTitle)", in: CGRect(x: 214, y: 76, width: 340, height: 30),
                 size: 22, weight: .semibold, color: .white, alignment: .left)
        drawBar(in: CGRect(x: 214, y: 116, width: 330, height: 20), fraction: portionLeft, color: furLight, ctx: ctx)
        drawText("\(Int((portionLeft * 100).rounded()))% left · leftovers are subtracted",
                 in: CGRect(x: 214, y: 142, width: 340, height: 24),
                 size: 17, weight: .medium, color: UIColor(white: 0.8, alpha: 1), alignment: .left)
      } else {
        drawText("Eat as usual – I log it myself.", in: CGRect(x: 214, y: 80, width: 340, height: 30),
                 size: 21, weight: .medium, color: UIColor(white: 0.85, alpha: 1), alignment: .left)
      }
      drawText("Today \(eatenKcal) / \(goalKcal) kcal", in: CGRect(x: 214, y: 178, width: 340, height: 30),
               size: 21, weight: .bold, color: ringGood, alignment: .left)
    }
  }

  /// A logged meal: the photo the glasses took, calories and how much is left.
  static func mealCard(photo: UIImage?, kcal: Int, kcalServed: Int, portionLeft: Double, isOpen: Bool) -> UIImage {
    render(size: CGSize(width: 560, height: 220)) { ctx in
      let photoRect = CGRect(x: 10, y: 10, width: 200, height: 200)
      if let photo {
        ctx.saveGState()
        UIBezierPath(roundedRect: photoRect, cornerRadius: 18).addClip()
        let scale = max(photoRect.width / photo.size.width, photoRect.height / photo.size.height)
        let size = CGSize(width: photo.size.width * scale, height: photo.size.height * scale)
        photo.draw(in: CGRect(
          x: photoRect.midX - size.width / 2, y: photoRect.midY - size.height / 2,
          width: size.width, height: size.height))
        ctx.restoreGState()
      } else {
        drawBear(in: photoRect, mood: .happy, ctx: ctx)
      }

      drawText("\(kcal) kcal", in: CGRect(x: 236, y: 26, width: 320, height: 54),
               size: 46, weight: .bold, color: .white, alignment: .left)
      let detail = kcal == kcalServed ? "Seen by your glasses" : "of \(kcalServed) served – rest left on the plate"
      drawText(detail, in: CGRect(x: 236, y: 84, width: 320, height: 26),
               size: 18, weight: .medium, color: UIColor(white: 0.8, alpha: 1), alignment: .left)

      drawBar(in: CGRect(x: 236, y: 132, width: 300, height: 20), fraction: 1 - portionLeft, color: ringGood, ctx: ctx)
      let eaten = Int(((1 - portionLeft) * 100).rounded())
      drawText(isOpen ? "Eating now · \(eaten)% eaten" : "Meal closed", in: CGRect(x: 236, y: 160, width: 320, height: 26),
               size: 18, weight: .semibold, color: furLight, alignment: .left)
    }
  }

  /// Today: the calorie ring and the three macro bars.
  static func todayCard(eatenKcal: Int, goalKcal: Int, proteinG: Int, carbsG: Int, fatG: Int) -> UIImage {
    render(size: CGSize(width: 560, height: 220)) { ctx in
      let ringRect = CGRect(x: 14, y: 20, width: 180, height: 180)
      let progress = goalKcal > 0 ? CGFloat(eatenKcal) / CGFloat(goalKcal) : 0
      drawRing(in: ringRect, progress: progress, ctx: ctx)
      drawText("\(eatenKcal)", in: CGRect(x: ringRect.minX, y: ringRect.midY - 34, width: ringRect.width, height: 44),
               size: 38, weight: .bold, color: .white)
      drawText("of \(goalKcal) kcal", in: CGRect(x: ringRect.minX, y: ringRect.midY + 10, width: ringRect.width, height: 24),
               size: 18, weight: .medium, color: UIColor(white: 0.8, alpha: 1))

      // Rough daily reference amounts, only to scale the bars.
      let macros: [(String, Int, Int, UIColor)] = [
        ("Protein", proteinG, 100, UIColor(red: 0.45, green: 0.75, blue: 1.0, alpha: 1)),
        ("Carbs", carbsG, 250, furLight),
        ("Fat", fatG, 70, UIColor(red: 1.0, green: 0.62, blue: 0.75, alpha: 1)),
      ]
      for (index, macro) in macros.enumerated() {
        let y = 30 + CGFloat(index) * 60
        drawText("\(macro.0) \(macro.1) g", in: CGRect(x: 220, y: y, width: 330, height: 26),
                 size: 20, weight: .semibold, color: .white, alignment: .left)
        drawBar(in: CGRect(x: 220, y: y + 30, width: 320, height: 16),
                fraction: Double(macro.1) / Double(macro.2), color: macro.3, ctx: ctx)
      }
    }
  }

  /// Bo alone, for status screens.
  static func bear(mood: BearMood) -> UIImage {
    render(size: CGSize(width: 220, height: 220)) { ctx in
      drawBear(in: CGRect(x: 10, y: 10, width: 200, height: 200), mood: mood, ctx: ctx)
    }
  }

  // MARK: - Drawing

  private static func render(size: CGSize, draw: (CGContext) -> Void) -> UIImage {
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: size, format: format).image { context in
      UIColor.black.setFill()
      context.fill(CGRect(origin: .zero, size: size))
      draw(context.cgContext)
    }
  }

  private static func drawBear(in rect: CGRect, mood: BearMood, ctx: CGContext) {
    let unit = rect.width / 200
    func r(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGRect {
      CGRect(x: rect.minX + x * unit, y: rect.minY + y * unit, width: w * unit, height: h * unit)
    }

    // Ears
    fur.setFill()
    ctx.fillEllipse(in: r(18, 14, 58, 58))
    ctx.fillEllipse(in: r(124, 14, 58, 58))
    furLight.setFill()
    ctx.fillEllipse(in: r(32, 28, 30, 30))
    ctx.fillEllipse(in: r(138, 28, 30, 30))

    // Head
    fur.setFill()
    ctx.fillEllipse(in: r(22, 32, 156, 150))

    // Muzzle
    furLight.setFill()
    ctx.fillEllipse(in: r(62, 100, 76, 62))

    // Nose
    ink.setFill()
    ctx.fillEllipse(in: r(88, 108, 24, 17))

    // Eyes
    ink.setStroke()
    ink.setFill()
    ctx.setLineWidth(5 * unit)
    ctx.setLineCap(.round)
    switch mood {
    case .happy:
      // Closed, smiling eyes
      for x in [58.0, 118.0] {
        ctx.addArc(
          center: CGPoint(x: rect.minX + (x + 12) * unit, y: rect.minY + 90 * unit),
          radius: 11 * unit, startAngle: .pi, endAngle: 0, clockwise: false)
        ctx.strokePath()
      }
    case .looking:
      // Big round eyes with sparkle
      for x in [56.0, 118.0] {
        ink.setFill()
        ctx.fillEllipse(in: r(x, 70, 26, 26))
        UIColor.white.setFill()
        ctx.fillEllipse(in: r(x + 14, 74, 8, 8))
      }
    case .thinking:
      // Eyes looking up
      for x in [58.0, 120.0] {
        ink.setFill()
        ctx.fillEllipse(in: r(x, 72, 20, 20))
        UIColor.white.setFill()
        ctx.fillEllipse(in: r(x + 6, 72, 9, 9))
      }
    case .oops:
      // Little x eyes
      for x in [60.0, 120.0] {
        ctx.move(to: CGPoint(x: rect.minX + x * unit, y: rect.minY + 74 * unit))
        ctx.addLine(to: CGPoint(x: rect.minX + (x + 20) * unit, y: rect.minY + 94 * unit))
        ctx.move(to: CGPoint(x: rect.minX + (x + 20) * unit, y: rect.minY + 74 * unit))
        ctx.addLine(to: CGPoint(x: rect.minX + x * unit, y: rect.minY + 94 * unit))
        ctx.strokePath()
      }
    }

    // Mouth
    ink.setStroke()
    ctx.setLineWidth(4 * unit)
    if mood == .oops {
      ctx.addArc(
        center: CGPoint(x: rect.minX + 100 * unit, y: rect.minY + 152 * unit),
        radius: 10 * unit, startAngle: .pi, endAngle: 0, clockwise: false)
    } else {
      ctx.addArc(
        center: CGPoint(x: rect.minX + 100 * unit, y: rect.minY + 132 * unit),
        radius: 14 * unit, startAngle: 0.15 * .pi, endAngle: 0.85 * .pi, clockwise: false)
    }
    ctx.strokePath()

    // Cheeks
    UIColor(red: 1.0, green: 0.55, blue: 0.55, alpha: 1).setFill()
    ctx.fillEllipse(in: r(40, 112, 18, 12))
    ctx.fillEllipse(in: r(142, 112, 18, 12))
  }

  private static func drawRing(in rect: CGRect, progress: CGFloat, ctx: CGContext) {
    let lineWidth: CGFloat = 18
    let inset = rect.insetBy(dx: lineWidth / 2, dy: lineWidth / 2)
    let center = CGPoint(x: inset.midX, y: inset.midY)
    let radius = inset.width / 2
    let start = -CGFloat.pi / 2

    ctx.setLineWidth(lineWidth)
    ctx.setLineCap(.round)
    ringTrack.setStroke()
    ctx.addArc(center: center, radius: radius, startAngle: 0, endAngle: 2 * .pi, clockwise: false)
    ctx.strokePath()

    let clamped = min(max(progress, 0), 1)
    guard clamped > 0 else { return }
    let color = progress > 1 ? ringOver : (progress > 0.9 ? ringNear : ringGood)
    color.setStroke()
    ctx.addArc(
      center: center, radius: radius, startAngle: start, endAngle: start + clamped * 2 * .pi, clockwise: false)
    ctx.strokePath()
  }

  private static func drawBar(in rect: CGRect, fraction: Double, color: UIColor, ctx: CGContext) {
    ringTrack.setFill()
    UIBezierPath(roundedRect: rect, cornerRadius: rect.height / 2).fill()
    let clamped = CGFloat(min(max(fraction, 0), 1))
    guard clamped > 0 else { return }
    color.setFill()
    let filled = CGRect(x: rect.minX, y: rect.minY, width: max(rect.height, rect.width * clamped), height: rect.height)
    UIBezierPath(roundedRect: filled, cornerRadius: rect.height / 2).fill()
  }

  private static func drawText(
    _ text: String, in rect: CGRect, size: CGFloat, weight: UIFont.Weight, color: UIColor,
    alignment: NSTextAlignment = .center
  ) {
    let style = NSMutableParagraphStyle()
    style.alignment = alignment
    style.lineBreakMode = .byWordWrapping
    let attributes: [NSAttributedString.Key: Any] = [
      .font: UIFont.systemFont(ofSize: size, weight: weight),
      .foregroundColor: color,
      .paragraphStyle: style,
    ]
    (text as NSString).draw(in: rect, withAttributes: attributes)
  }
}
