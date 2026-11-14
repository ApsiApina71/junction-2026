/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

import MWDATCore
import MWDATMockDevice
import SwiftUI
import UIKit

enum SampleAppItem: String, CaseIterable, Identifiable {
  case carMaintenance = "car-maintenance"

  var id: String { rawValue }

  var title: String {
    switch self {
    case .carMaintenance: "Bite with Bo"
    }
  }

  var description: String {
    switch self {
    case .carMaintenance:
      "Bo the bear tracks what you eat. Look at your food and pinch Log meal on your glasses."
    }
  }

  var iconName: String {
    switch self {
    case .carMaintenance: "fork.knife"
    }
  }

  var iconBackground: Color {
    switch self {
    case .carMaintenance: Color(red: 0.62, green: 0.38, blue: 0.16)
    }
  }
}

struct SampleAppsView: View {
  var displayViewModel: DisplayViewModel
  var biteViewModel: BiteViewModel
  var developerPreviewMode: DeveloperPreviewMode?
  var isDeveloperPreviewChanging: Bool
  var phonePreviewDisplay: (any MockDisplayKit)?
  var phonePreviewDeviceIdentifier: DeviceIdentifier?
  var chromePreviewURL: URL?
  var developerPreviewErrorMessage: String?
  var setDeveloperPreviewMode: (DeveloperPreviewMode?) async -> Bool

  private let item: SampleAppItem = .carMaintenance
  @State private var isDeveloperPreviewPresented = false
  @State private var isDeveloperPreviewTransitioning = false
  @State private var selectedDeveloperPreviewMode = DeveloperPreviewMode.defaultMode
  @State private var copiedChromePreviewURL: URL?
  @State private var showServerSettings = false
  @State private var serverURLDraft = ""

  var body: some View {
    VStack(spacing: 16) {
      Image(systemName: item.iconName)
        .font(.system(size: 32, weight: .semibold))
        .foregroundStyle(.white)
        .frame(width: 72, height: 72)
        .background(item.iconBackground, in: RoundedRectangle(cornerRadius: 16))
        .padding(.top, 48)

      Text(item.title)
        .font(.title3.weight(.semibold))
        .foregroundStyle(.primary)
        .multilineTextAlignment(.center)

      Text(item.description)
        .font(.subheadline)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)

      biteTodaySummary

      Spacer()

      developerPreviewEntry
      if let standaloneDisplayErrorMessage {
        VStack(spacing: 4) {
          Label("Couldn’t start display", systemImage: "exclamationmark.circle.fill")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.red)
          Text(verbatim: standaloneDisplayErrorMessage)
            .font(.caption)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
        }
      }
      tryItButton
    }
    .padding(.horizontal, 24)
    .padding(.bottom, 16)
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .toolbar(.hidden, for: .navigationBar)
    .sheet(isPresented: $isDeveloperPreviewPresented) {
      developerPreviewSheet
    }
  }

  private var developerPreviewEntry: some View {
    SwiftUI.Button(action: presentDeveloperPreview) {
      HStack(spacing: 14) {
        Image(systemName: "hammer.fill")
          .font(.title3)
          .foregroundStyle(.blue)
          .frame(width: 32)

        VStack(alignment: .leading, spacing: 3) {
          Text("Developer preview")
            .font(.body.weight(.semibold))
          Text("Preview and test the experience without physical glasses.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }

        Spacer(minLength: 8)

        if isDeveloperPreviewSetupBusy {
          ProgressView()
        } else {
          Image(systemName: "chevron.right")
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.tertiary)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(18)
      .background(
        Color(uiColor: .systemGroupedBackground),
        in: RoundedRectangle(cornerRadius: 20)
      )
    }
    .buttonStyle(.plain)
    .disabled(isDeveloperPreviewSetupBusy)
  }

  private var developerPreviewSheet: some View {
    NavigationStack {
      ScrollView {
        VStack(spacing: 20) {
          Picker(
            "Preview surface",
            selection: Binding(
              get: { selectedDeveloperPreviewMode },
              set: { changeDeveloperPreviewMode($0) }
            )
          ) {
            ForEach(DeveloperPreviewMode.availableModes) { mode in
              Text(mode.title)
                .tag(mode)
            }
          }
          .pickerStyle(.segmented)
          .disabled(isDeveloperPreviewControlBusy)

          developerPreviewStage
          developerPreviewContentControl
        }
        .frame(maxWidth: 560)
        .padding(20)
        .frame(maxWidth: .infinity)
      }
      .background(Color(uiColor: .systemGroupedBackground))
      .navigationTitle("Developer preview")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .confirmationAction) {
          SwiftUI.Button("Done", action: dismissDeveloperPreview)
            .disabled(isDeveloperPreviewControlBusy)
        }
      }
    }
    .interactiveDismissDisabled(developerPreviewMode != nil || isDeveloperPreviewControlBusy)
  }

  @ViewBuilder
  private var developerPreviewStage: some View {
    switch selectedDeveloperPreviewMode {
    case .inApp:
      inAppStage
    case .chrome:
      chromeStage
    }
  }

  @ViewBuilder
  private var inAppStage: some View {
    if let phonePreviewDisplay {
      previewSurfaceCard {
        Label("In-app simulator", systemImage: "iphone")
          .font(.subheadline.weight(.semibold))

        GeometryReader { geometry in
          let side = min(geometry.size.width, geometry.size.height)
          PhoneDisplayPreview(display: phonePreviewDisplay)
            .id(phonePreviewDeviceIdentifier)
            .frame(width: side, height: side)
            .background(.black)
            .clipShape(RoundedRectangle(cornerRadius: 20))
            .overlay {
              RoundedRectangle(cornerRadius: 20)
                .stroke(.white.opacity(0.16))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityLabel("In-app display simulator")
        }
      }
    } else {
      previewSurfaceCard {
        Label("In-app simulator", systemImage: "iphone")
          .font(.subheadline.weight(.semibold))

        Spacer()

        VStack(spacing: 12) {
          Image(systemName: "iphone")
            .font(.system(size: 42))
            .foregroundStyle(.blue)
          Text("Tap Preview in app to start.")
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)

        Spacer()
      }
    }
  }

  private var chromeStage: some View {
    previewSurfaceCard {
      Label("Preview in Chrome", systemImage: "desktopcomputer")
        .font(.subheadline.weight(.semibold))

      VStack(alignment: .leading, spacing: 20) {
        instructionRow(number: 1, text: "Start the preview server.")
        instructionRow(number: 2, text: "Open the preview link in Chrome.") {
          if let chromePreviewURL {
            let isCopied = copiedChromePreviewURL == chromePreviewURL
            HStack(spacing: 8) {
              Text(verbatim: chromePreviewURL.absoluteString)
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .textSelection(.enabled)
                .frame(maxWidth: .infinity, alignment: .leading)

              SwiftUI.Button {
                UIPasteboard.general.url = chromePreviewURL
                copiedChromePreviewURL = chromePreviewURL
              } label: {
                Label(
                  isCopied ? "Copied" : "Copy",
                  systemImage: isCopied ? "checkmark" : "doc.on.doc"
                )
              }
              .buttonStyle(.bordered)
              .controlSize(.small)
              .accessibilityHint("Copies the Chrome simulator URL")
              .task(id: copiedChromePreviewURL) {
                guard copiedChromePreviewURL != nil else { return }
                do {
                  try await Task.sleep(for: .seconds(2))
                } catch {
                  return
                }
                copiedChromePreviewURL = nil
              }
            }
          } else {
            Text("Available after the server starts.")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
        instructionRow(
          number: 3,
          text: "Enable the Meta Ray-Ban Display Simulator extension in Chrome."
        )
      }
      .padding(.leading, 8)

      Spacer(minLength: 0)
    }
  }

  private func previewSurfaceCard<Content: View>(
    @ViewBuilder content: () -> Content
  ) -> some View {
    VStack(alignment: .leading, spacing: 16) {
      content()
    }
    .padding(20)
    .frame(maxWidth: 392)
    .aspectRatio(1, contentMode: .fit)
    .background(.background, in: RoundedRectangle(cornerRadius: 24))
    .frame(maxWidth: .infinity)
  }

  private func instructionRow(
    number: Int,
    text: String
  ) -> some View {
    instructionRow(number: number, text: text) {
      EmptyView()
    }
  }

  private func instructionRow<Detail: View>(
    number: Int,
    text: String,
    @ViewBuilder detail: () -> Detail
  ) -> some View {
    HStack(alignment: .top, spacing: 12) {
      Text(verbatim: "\(number).")
        .font(.subheadline.monospacedDigit().weight(.semibold))
        .foregroundStyle(.secondary)
        .frame(width: 20, alignment: .trailing)

      VStack(alignment: .leading, spacing: 10) {
        Text(text)
          .font(.subheadline)
          .fixedSize(horizontal: false, vertical: true)
        detail()
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private var tryItButton: some View {
    SwiftUI.Button {
      Task { await sendSample(item, deviceIdentifier: nil) }
    } label: {
      Text(biteViewModel.isBusy ? biteViewModel.statusText : "Open Bite on glasses")
        .font(.body.weight(.semibold))
        .foregroundStyle(.white)
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .background(
          LinearGradient(
            colors: [Color(red: 0.30, green: 0.45, blue: 0.95), Color(red: 0.15, green: 0.25, blue: 0.85)],
            startPoint: .leading,
            endPoint: .trailing
          ),
          in: Capsule()
        )
    }
    .buttonStyle(.plain)
  }

  @ViewBuilder
  private var developerPreviewContentControl: some View {
    if let statusTitle = developerPreviewStatusTitle {
      HStack(spacing: 10) {
        Image(systemName: "checkmark.circle.fill")
        Text(statusTitle)
          .font(.body.weight(.semibold))
      }
      .foregroundStyle(.green)
      .frame(maxWidth: .infinity)
      .padding(.vertical, 14)
      .background(.green.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
      .accessibilityElement(children: .combine)
    } else {
      VStack(spacing: 12) {
        if let selectedPreviewErrorMessage {
          VStack(spacing: 4) {
            Label("Couldn’t start preview", systemImage: "exclamationmark.circle.fill")
              .font(.subheadline.weight(.semibold))
              .foregroundStyle(.red)
            Text(verbatim: selectedPreviewErrorMessage)
              .font(.caption)
              .foregroundStyle(.secondary)
              .multilineTextAlignment(.center)
              .fixedSize(horizontal: false, vertical: true)
          }
        }

        SwiftUI.Button {
          Task { await startSelectedDeveloperPreview() }
        } label: {
          HStack(spacing: 10) {
            if isDeveloperPreviewControlBusy {
              ProgressView()
                .tint(.white)
            }
            Text(developerPreviewButtonTitle)
              .font(.body.weight(.semibold))
          }
          .frame(maxWidth: .infinity)
          .padding(.vertical, 8)
        }
        .buttonStyle(.borderedProminent)
        .disabled(!canLoadDeveloperPreview)
      }
    }
  }

  private var isDeveloperPreviewSetupBusy: Bool {
    isDeveloperPreviewTransitioning || isDeveloperPreviewChanging
  }

  private var isDeveloperPreviewControlBusy: Bool {
    isDeveloperPreviewSetupBusy || displayViewModel.isSending
  }

  private func presentDeveloperPreview() {
    selectedDeveloperPreviewMode = developerPreviewMode ?? DeveloperPreviewMode.defaultMode
    isDeveloperPreviewPresented = true
  }

  private func changeDeveloperPreviewMode(_ mode: DeveloperPreviewMode) {
    guard mode != selectedDeveloperPreviewMode else { return }
    let previousSelectedMode = selectedDeveloperPreviewMode
    selectedDeveloperPreviewMode = mode
    guard developerPreviewMode != nil else { return }

    isDeveloperPreviewTransitioning = true
    Task {
      let didDisablePreview = await setDeveloperPreviewMode(nil)
      isDeveloperPreviewTransitioning = false
      if !didDisablePreview {
        selectedDeveloperPreviewMode = developerPreviewMode ?? previousSelectedMode
      }
    }
  }

  private func dismissDeveloperPreview() {
    guard developerPreviewMode != nil else {
      isDeveloperPreviewPresented = false
      return
    }

    isDeveloperPreviewTransitioning = true
    Task {
      let didDisablePreview = await setDeveloperPreviewMode(nil)
      isDeveloperPreviewTransitioning = false
      if didDisablePreview {
        isDeveloperPreviewPresented = false
      }
    }
  }

  private var canLoadDeveloperPreview: Bool {
    guard !isDeveloperPreviewControlBusy, !hasLoadedSelectedPreview else { return false }

    guard developerPreviewErrorMessage == nil else { return true }
    guard let developerPreviewMode else { return true }
    guard developerPreviewMode == selectedDeveloperPreviewMode else { return false }

    switch selectedDeveloperPreviewMode {
    case .inApp:
      return phonePreviewDeviceIdentifier != nil && phonePreviewDisplay != nil
    case .chrome:
      return phonePreviewDeviceIdentifier != nil && chromePreviewURL != nil
    }
  }

  private var developerPreviewButtonTitle: String {
    if isDeveloperPreviewSetupBusy {
      return selectedDeveloperPreviewMode.preparingTitle
    }
    if displayViewModel.isSending {
      return selectedDeveloperPreviewMode.preparingTitle
    }
    if selectedPreviewErrorMessage != nil {
      return "Try again"
    }
    return selectedDeveloperPreviewMode.actionTitle
  }

  private var hasLoadedSelectedPreview: Bool {
    guard let phonePreviewDeviceIdentifier else { return false }
    return developerPreviewMode == selectedDeveloperPreviewMode
      && displayViewModel.lastSentPreviewDeviceIdentifier == phonePreviewDeviceIdentifier
  }

  private var developerPreviewStatusTitle: String? {
    if hasLoadedSelectedPreview {
      return selectedDeveloperPreviewMode.activeTitle
    }
    if selectedPreviewErrorMessage == nil,
      selectedDeveloperPreviewMode == .chrome,
      developerPreviewMode == .chrome,
      chromePreviewURL != nil
    {
      return "Preview server running"
    }
    return nil
  }

  private var standaloneDisplayErrorMessage: String? {
    guard !isDeveloperPreviewPresented, developerPreviewMode == nil else { return nil }
    return displayViewModel.errorMessage
  }

  private var selectedPreviewErrorMessage: String? {
    if let developerPreviewErrorMessage {
      return developerPreviewErrorMessage
    }
    guard developerPreviewMode == selectedDeveloperPreviewMode else { return nil }
    return displayViewModel.errorMessage
  }

  private func startSelectedDeveloperPreview() async {
    isDeveloperPreviewTransitioning = true
    let didPreparePreview = await setDeveloperPreviewMode(selectedDeveloperPreviewMode)
    isDeveloperPreviewTransitioning = false
    guard didPreparePreview else { return }

    await sendSample(item, deviceIdentifier: phonePreviewDeviceIdentifier)
  }

  private func sendSample(
    _ item: SampleAppItem,
    deviceIdentifier: DeviceIdentifier?
  ) async {
    switch item {
    case .carMaintenance:
      await biteViewModel.showHome(deviceIdentifier: deviceIdentifier)
    }
  }

  // MARK: - Bite (Junction 2026)

  private var biteTodaySummary: some View {
    VStack(spacing: 10) {
      Text("Today: \(biteViewModel.today.kcal) / \(biteViewModel.goalKcal) kcal")
        .font(.headline)
      ForEach(biteViewModel.today.entries.prefix(4)) { entry in
        HStack {
          Text(entry.time).foregroundStyle(.secondary)
          Text(entry.title)
          if entry.open {
            Text("eating").font(.caption).foregroundStyle(.orange)
          }
          Spacer()
          Text("\(entry.kcal) kcal").foregroundStyle(.secondary)
        }
        .font(.subheadline)
      }
      HStack(spacing: 16) {
        SwiftUI.Button("Log meal") {
          Task { await biteViewModel.logMeal() }
        }
        .disabled(biteViewModel.isBusy)
        SwiftUI.Button(biteViewModel.isWatching ? "Stop" : "Watch") {
          Task { await biteViewModel.toggleWatching() }
        }
        SwiftUI.Button("Server") {
          serverURLDraft = BiteViewModel.serverURL
          showServerSettings = true
        }
        SwiftUI.Button("Reset day", role: .destructive) {
          Task { await biteViewModel.clearToday() }
        }
      }
      .font(.subheadline)
      Text(biteViewModel.statusText)
        .font(.caption)
        .foregroundStyle(.secondary)
    }
    .padding(16)
    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    .alert("Bite server", isPresented: $showServerSettings) {
      TextField("http://172.20.10.x:8000", text: $serverURLDraft)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .keyboardType(.URL)
      SwiftUI.Button("Save") { BiteViewModel.serverURL = serverURLDraft }
      SwiftUI.Button("Cancel", role: .cancel) {}
    } message: {
      Text("Address of glasses-api on your Mac.")
    }
    .task {
      await biteViewModel.refreshToday()
    }
    .task {
      // Simulator test hooks: OWL_AUTO_PREVIEW=inApp|chrome starts a mock display, and
      // OWL_AUTO_LOG=1 logs a meal from the mock camera once the display is up.
      let env = ProcessInfo.processInfo.environment
      guard developerPreviewMode == nil, let mode = env["OWL_AUTO_PREVIEW"] else { return }
      selectedDeveloperPreviewMode = mode == "chrome" ? .chrome : .inApp
      isDeveloperPreviewPresented = true
      await startSelectedDeveloperPreview()
      try? await Task.sleep(for: .seconds(3))
      if env["OWL_AUTO_LOG"] == "1" {
        await biteViewModel.logMeal()
      }
      if env["OWL_AUTO_TODAY"] == "1" {
        try? await Task.sleep(for: .seconds(6))
        await biteViewModel.showToday()
      }
      if env["OWL_AUTO_WATCH"] == "1" {
        await biteViewModel.toggleWatching()
      }
    }
  }

}

private extension DeveloperPreviewMode {
  static var availableModes: [Self] {
    #if targetEnvironment(simulator)
    allCases
    #else
    [.inApp]
    #endif
  }

  static var defaultMode: Self {
    availableModes[0]
  }

  var title: String {
    switch self {
    case .inApp: "In app"
    case .chrome: "Chrome"
    }
  }

  var actionTitle: String {
    switch self {
    case .inApp: "Preview in app"
    case .chrome: "Start preview server"
    }
  }

  var preparingTitle: String {
    switch self {
    case .inApp: "Starting in-app preview…"
    case .chrome: "Starting preview server…"
    }
  }

  var activeTitle: String {
    switch self {
    case .inApp: "Previewing in app"
    case .chrome: "Preview ready in Chrome"
    }
  }
}

private struct PhoneDisplayPreview: UIViewRepresentable {
  let display: any MockDisplayKit

  func makeUIView(context: Context) -> UIView {
    display.createPreviewView()
  }

  func updateUIView(_ uiView: UIView, context: Context) {}
}
