/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

//
// SettingsView.swift
//
// Registration and device connection screen. Shows glasses registration state
// and lists connected devices with real-time link state updates.
//

import MWDATCore
import SwiftUI

struct SettingsViewModel {
  let registrationState: RegistrationState
  let deviceItemStates: [DeviceItemState]
  let requiresFirmwareUpdate: Bool
  let requiresDATAppUpdate: Bool
  private let connectGlassesAction: () -> Void
  private let disconnectGlassesAction: () -> Void
  private let openFirmwareUpdateAction: () -> Void
  private let openDATGlassesAppUpdateAction: () -> Void

  init(
    registrationState: RegistrationState,
    deviceItemStates: [DeviceItemState],
    requiresFirmwareUpdate: Bool,
    requiresDATAppUpdate: Bool,
    connectGlasses: @escaping () -> Void,
    disconnectGlasses: @escaping () -> Void,
    openFirmwareUpdate: @escaping () -> Void,
    openDATGlassesAppUpdate: @escaping () -> Void
  ) {
    self.registrationState = registrationState
    self.deviceItemStates = deviceItemStates
    self.requiresFirmwareUpdate = requiresFirmwareUpdate
    self.requiresDATAppUpdate = requiresDATAppUpdate
    self.connectGlassesAction = connectGlasses
    self.disconnectGlassesAction = disconnectGlasses
    self.openFirmwareUpdateAction = openFirmwareUpdate
    self.openDATGlassesAppUpdateAction = openDATGlassesAppUpdate
  }

  var hasCompatibilityIssue: Bool {
    requiresFirmwareUpdate || requiresDATAppUpdate
  }

  func connectGlasses() {
    connectGlassesAction()
  }

  func disconnectGlasses() {
    disconnectGlassesAction()
  }

  func openFirmwareUpdate() {
    openFirmwareUpdateAction()
  }

  func openDATGlassesAppUpdate() {
    openDATGlassesAppUpdateAction()
  }
}

struct SettingsView: View {
  let viewModel: SettingsViewModel
  private let t = PhoneText.t

  var body: some View {
    ScrollView {
      VStack(spacing: 16) {
        HStack(spacing: 12) {
          OwlLogo(size: 30)
          Text(t("Settings", "Asetukset"))
            .font(.title2.weight(.bold))
            .foregroundStyle(OwlTheme.text)
          Spacer()
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
        .accessibilityAddTraits(.isHeader)

        if viewModel.requiresDATAppUpdate {
          OwlProblemCard(
            symbol: "arrow.down.app.fill", title: t("Update the Owl app on the glasses", "Päivitä Owl-sovellus laseille"),
            detail: t(
              "The glasses need a newer version before Owl can open. Keep their battery above 10%.",
              "Lasit tarvitsevat uudemman version ennen kuin Owl aukeaa. Pidä lasien akku yli 10 %:ssa."),
            tone: .attention, fix: t("Update in Meta AI", "Päivitä Meta AI:ssa"), onFix: viewModel.openDATGlassesAppUpdate)
        }
        if viewModel.requiresFirmwareUpdate {
          OwlProblemCard(
            symbol: "arrow.triangle.2.circlepath", title: t("Update the glasses", "Päivitä lasit"),
            detail: t(
              "The glasses' software is too old for Owl. Restart the glasses after the update.",
              "Lasien ohjelmisto on liian vanha Owlille. Käynnistä lasit uudelleen päivityksen jälkeen."),
            tone: .attention, fix: t("Update in Meta AI", "Päivitä Meta AI:ssa"), onFix: viewModel.openFirmwareUpdate)
        }

        OwlSectionLabel(text: "Meta AI")
        OwlCard {
          OwlStatusRow(
            symbol: "link", title: t("Owl Boarding in Meta AI", "Owl Boarding Meta AI:ssa"),
            chip: registration.text, tone: registration.tone, detail: registration.detail)
          registrationAction
        }

        OwlSectionLabel(text: t("Glasses", "Lasit"))
        OwlCard {
          if viewModel.deviceItemStates.isEmpty {
            Text(t("No glasses found. Pair them in Meta AI first.", "Laseja ei löytynyt. Yhdistä ne ensin Meta AI:ssa."))
              .font(.subheadline)
              .foregroundStyle(OwlTheme.textSecondary)
          } else {
            ForEach(Array(viewModel.deviceItemStates.enumerated()), id: \.element.id) { index, state in
              if index > 0 { Divider().overlay(OwlTheme.border) }
              DeviceRow(state: state)
            }
          }
        }

        OwlSectionLabel(text: t("About", "Tietoja"))
        OwlCard {
          HStack {
            Text("Owl Boarding")
              .font(.body.weight(.medium))
              .foregroundStyle(OwlTheme.text)
            Spacer()
            Text(Self.version)
              .font(.subheadline)
              .foregroundStyle(OwlTheme.textSecondary)
          }
          Text("owlboarding.com")
            .font(.footnote)
            .foregroundStyle(OwlTheme.textSecondary)
        }
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
    }
    .scrollIndicators(.hidden)
    .background(OwlTheme.window.ignoresSafeArea())
    .toolbar(.hidden, for: .navigationBar)
  }

  private static var version: String {
    let info = Bundle.main.infoDictionary
    let short = info?["CFBundleShortVersionString"] as? String ?? "1.0"
    let build = info?["CFBundleVersion"] as? String ?? "1"
    return "\(short) (\(build))"
  }

  private var registration: (text: String, tone: OwlChip.Tone, detail: String) {
    switch viewModel.registrationState {
    case .registered:
      (t("Connected", "Yhdistetty"), .ok, t("Owl can use the glasses' display, camera and microphone.", "Owl voi käyttää lasien näyttöä, kameraa ja mikrofonia."))
    case .registering:
      (t("Connecting", "Yhdistetään"), .neutral, t("Finish in the Meta AI app.", "Viimeistele Meta AI -sovelluksessa."))
    case .available:
      (t("Not connected", "Ei yhdistetty"), .attention, t("Connect once, then Owl opens on the glasses.", "Yhdistä kerran, sitten Owl aukeaa laseilla."))
    case .unavailable:
      (t("Unavailable", "Ei käytettävissä"), .problem, t("Install the Meta AI app and pair the glasses.", "Asenna Meta AI -sovellus ja yhdistä lasit."))
    @unknown default:
      (t("Unknown", "Tuntematon"), .neutral, "")
    }
  }

  @ViewBuilder
  private var registrationAction: some View {
    switch viewModel.registrationState {
    case .registered:
      SwiftUI.Button(role: .destructive) {
        viewModel.disconnectGlasses()
      } label: {
        Text(t("Disconnect", "Katkaise yhteys"))
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(OwlTheme.negative)
          .padding(.horizontal, 16)
          .padding(.vertical, 9)
          .background(OwlTheme.raised, in: Capsule())
      }
      .buttonStyle(.plain)
      .padding(.leading, 38)
    case .unavailable, .available:
      OwlFixButton(title: t("Connect in Meta AI", "Yhdistä Meta AI:ssa"), tint: OwlTheme.accent, action: viewModel.connectGlasses)
        .padding(.leading, 38)
    case .registering:
      ProgressView().padding(.leading, 38)
    @unknown default:
      EmptyView()
    }
  }
}

// MARK: - DeviceRow

private struct DeviceRow: View {
  var state: DeviceItemState
  private let t = PhoneText.t

  var body: some View {
    OwlStatusRow(
      symbol: "eyeglasses", title: state.deviceName, chip: status.text, tone: status.tone,
      detail: state.deviceTypeValue)
  }

  private var status: (text: String, tone: OwlChip.Tone) {
    if state.compatibility == .deviceUpdateRequired {
      return (t("Update needed", "Päivitys tarvitaan"), .attention)
    }
    switch state.linkState {
    case .disconnected: return (t("Not connected", "Ei yhteyttä"), .problem)
    case .connecting: return (t("Connecting", "Yhdistetään"), .neutral)
    case .connected: return (t("Connected", "Yhdistetty"), .ok)
    @unknown default: return (t("Unknown", "Tuntematon"), .neutral)
    }
  }
}
