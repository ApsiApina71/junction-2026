//
// OwlPhoneTheme.swift
//
// The phone app in Owl Studio's look (JUN-101): Meta's UI toolkit for Meta Ray-Ban Display,
// dark first. The colours are the toolkit's own tokens, so the phone, Studio and the glasses
// read as one product. The phone's words follow the phone's language (English or Finnish).
//

import SwiftUI

enum OwlTheme {
  // Meta UI toolkit tokens (mrbd 130.33.0, dark).
  static let window = Color(hex: 0x000000)  // --uit-color-background-window
  static let card = Color(hex: 0x1E1E21)  // --uit-color-background-input-field / button-secondary
  static let raised = Color(hex: 0x30333A)  // --uit-color-background-elevation1
  static let raised2 = Color(hex: 0x41454E)  // --uit-color-background-elevation2
  static let text = Color.white  // --uit-color-text-primary
  static let textSecondary = Color(hex: 0xCFD3D9)  // --uit-color-text-secondary
  static let accent = Color(hex: 0x2694FE)  // --uit-color-text-accent
  static let positive = Color(hex: 0x26A756)  // --uit-color-persistent-positive
  static let warning = Color(hex: 0xC58600)  // --uit-color-persistent-warning
  static let negative = Color(hex: 0xFF5668)  // --uit-color-persistent-negative
  static let info = Color(hex: 0x9081FF)  // --uit-color-persistent-info
  static let border = Color.white.opacity(0.25)  // --uit-color-border-primary

  /// Studio's radii at its desktop zoom (xsmall 16 and medium 32 at 0.64).
  static let cardRadius: CGFloat = 20
  static let rowRadius: CGFloat = 14
}

extension Color {
  init(hex: UInt32) {
    self.init(
      red: Double((hex >> 16) & 0xFF) / 255, green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255)
  }
}

/// The phone's own words: the phone's language, not the worker's (the employer holds it).
enum PhoneText {
  static var finnish: Bool { Locale.preferredLanguages.first?.hasPrefix("fi") == true }
  static func t(_ en: String, _ fi: String) -> String { finnish ? fi : en }
}

// MARK: - Building blocks

/// A dark card, Studio's elevation1 surface.
struct OwlCard<Content: View>: View {
  var padding: CGFloat = 18
  @ViewBuilder var content: Content

  var body: some View {
    VStack(alignment: .leading, spacing: 12) { content }
      .padding(padding)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(OwlTheme.card, in: RoundedRectangle(cornerRadius: OwlTheme.cardRadius, style: .continuous))
  }
}

/// A small heading over a group, like Studio's section labels.
struct OwlSectionLabel: View {
  let text: String
  var body: some View {
    Text(text)
      .font(.footnote.weight(.semibold))
      .foregroundStyle(OwlTheme.textSecondary)
      .textCase(nil)
      .padding(.horizontal, 4)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Studio's status chip: green when all is well, amber when it needs a look, red when broken.
struct OwlChip: View {
  enum Tone { case ok, attention, problem, neutral }
  let text: String
  let tone: Tone

  var color: Color {
    switch tone {
    case .ok: OwlTheme.positive
    case .attention: OwlTheme.warning
    case .problem: OwlTheme.negative
    case .neutral: OwlTheme.textSecondary
    }
  }

  var body: some View {
    HStack(spacing: 6) {
      Circle().fill(color).frame(width: 7, height: 7)
      Text(text)
        .font(.caption.weight(.semibold))
        .foregroundStyle(OwlTheme.text)
        .lineLimit(1)
    }
    .padding(.horizontal, 10)
    .padding(.vertical, 5)
    .background(color.opacity(0.18), in: Capsule())
    .overlay(Capsule().strokeBorder(color.opacity(0.45)))
    .accessibilityElement(children: .combine)
  }
}

/// One status line: what it is, a chip, and the detail under it.
struct OwlStatusRow: View {
  let symbol: String
  let title: String
  let chip: String
  let tone: OwlChip.Tone
  var detail: String?

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: symbol)
        .font(.body.weight(.semibold))
        .foregroundStyle(OwlTheme.textSecondary)
        .frame(width: 26, height: 26)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 4) {
        HStack(alignment: .firstTextBaseline) {
          Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(OwlTheme.text)
          Spacer(minLength: 8)
          OwlChip(text: chip, tone: tone)
        }
        if let detail {
          Text(detail)
            .font(.footnote)
            .foregroundStyle(OwlTheme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// The one primary action of a screen: a full-width accent pill.
struct OwlPrimaryButton: View {
  let title: String
  var symbol: String?
  var busy = false
  let action: () -> Void

  var body: some View {
    SwiftUI.Button(action: action) {
      HStack(spacing: 10) {
        if busy {
          ProgressView().tint(.white)
        } else if let symbol {
          Image(systemName: symbol)
        }
        Text(title)
      }
      .font(.body.weight(.semibold))
      .foregroundStyle(.white)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 17)
      .background(OwlTheme.accent, in: Capsule())
    }
    .buttonStyle(.plain)
  }
}

/// A fix inside a problem card: a smaller pill in the card's colour.
struct OwlFixButton: View {
  let title: String
  let tint: Color
  let action: () -> Void

  var body: some View {
    SwiftUI.Button(action: action) {
      Text(title)
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.black)
        .padding(.horizontal, 18)
        .padding(.vertical, 10)
        .background(tint, in: Capsule())
    }
    .buttonStyle(.plain)
  }
}

/// A secondary action: a row with an icon, words and a chevron, Studio's list item.
struct OwlActionRow: View {
  let symbol: String
  let title: String
  var detail: String?
  var busy = false
  let action: () -> Void

  var body: some View {
    SwiftUI.Button(action: action) {
      HStack(spacing: 14) {
        Image(systemName: symbol)
          .font(.body.weight(.semibold))
          .foregroundStyle(OwlTheme.text)
          .frame(width: 34, height: 34)
          .background(OwlTheme.raised, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        VStack(alignment: .leading, spacing: 2) {
          Text(title)
            .font(.body.weight(.medium))
            .foregroundStyle(OwlTheme.text)
          if let detail {
            Text(detail)
              .font(.footnote)
              .foregroundStyle(OwlTheme.textSecondary)
              .fixedSize(horizontal: false, vertical: true)
          }
        }
        Spacer(minLength: 8)
        if busy {
          ProgressView()
        } else {
          Image(systemName: "chevron.right")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(OwlTheme.textSecondary.opacity(0.7))
        }
      }
      .padding(.vertical, 10)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
  }
}

/// What is in the way, in plain words, with the one thing that fixes it.
struct OwlProblemCard: View {
  let symbol: String
  let title: String
  let detail: String
  let tone: OwlChip.Tone
  var fix: String?
  var onFix: (() -> Void)?

  private var tint: Color {
    switch tone {
    case .problem: OwlTheme.negative
    case .attention: OwlTheme.warning
    case .ok: OwlTheme.positive
    case .neutral: OwlTheme.textSecondary
    }
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack(alignment: .top, spacing: 12) {
        Image(systemName: symbol)
          .font(.title3.weight(.semibold))
          .foregroundStyle(tint)
          .frame(width: 28)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 4) {
          Text(title)
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(OwlTheme.text)
          Text(detail)
            .font(.footnote)
            .foregroundStyle(OwlTheme.textSecondary)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      if let fix, let onFix {
        OwlFixButton(title: fix, tint: tint, action: onFix)
          .padding(.leading, 40)
      }
    }
    .padding(16)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(tint.opacity(0.14), in: RoundedRectangle(cornerRadius: OwlTheme.cardRadius, style: .continuous))
    .overlay(RoundedRectangle(cornerRadius: OwlTheme.cardRadius, style: .continuous).strokeBorder(tint.opacity(0.4)))
    .accessibilityElement(children: .contain)
  }
}

/// The owl silhouette (shared brand logo), tinted like Studio's.
struct OwlLogo: View {
  var size: CGFloat = 34
  var body: some View {
    Image("owlLogo")
      .renderingMode(.template)
      .resizable()
      .scaledToFit()
      .foregroundStyle(OwlTheme.text)
      .frame(width: size, height: size)
      .accessibilityHidden(true)
  }
}
