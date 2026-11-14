//
// OwlPhoneStatus.swift
//
// The phone side of JUN-42: when something is in the way on the glasses, the employer's
// phone shows the same state in plain words, with what to do about it. The worker never
// needs this screen.
//

import SwiftUI

struct OwlPhoneStatusView: View {
  let state: OwlPhoneState

  private var tint: Color {
    state.tone == .problem ? .red : .orange
  }

  var body: some View {
    HStack(alignment: .top, spacing: 12) {
      Image(systemName: state.symbol)
        .font(.title3)
        .foregroundStyle(tint)
        .frame(width: 28)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 4) {
        Text(state.title)
          .font(.subheadline.weight(.semibold))
        Text(state.detail)
          .font(.footnote)
          .foregroundStyle(.secondary)
          .fixedSize(horizontal: false, vertical: true)
      }
      Spacer(minLength: 0)
    }
    .padding(12)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
    .overlay(RoundedRectangle(cornerRadius: 12).strokeBorder(tint.opacity(0.35)))
    .accessibilityElement(children: .combine)
  }
}
