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
    case .carMaintenance: "Onboarding Owl"
    }
  }

  var description: String {
    switch self {
    case .carMaintenance:
      "Say \u{201C}Hey Meta, start Owl\u{201D}. The worker learns each task on the glasses; the phone stays in the pocket."
    }
  }

  var iconName: String {
    switch self {
    case .carMaintenance: "graduationcap.fill"
    }
  }

  var iconBackground: Color {
    switch self {
    case .carMaintenance: Color(red: 0.35, green: 0.27, blue: 0.62)
    }
  }
}

struct SampleAppsView: View {
  var displayViewModel: DisplayViewModel
  var owlViewModel: OwlViewModel
  var phonePreview: PhonePreviewViewModel
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
  @State private var employeeIDDraft = ""
  @State private var testQuestion = "What if an item is out of stock?"
  @State private var testNote: String?

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

      owlPanel

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
      Text("Open Owl on glasses")
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
      await owlViewModel.open(deviceIdentifier: deviceIdentifier)
    }
  }

  // MARK: - Owl (Junction 2026)

  /// Phone side, for the employer's one-time setup and for testing. The worker never uses it.
  private var owlPanel: some View {
    VStack(spacing: 10) {
      Text(owlViewModel.statusText)
        .font(.headline)
        .multilineTextAlignment(.center)
      if let employee = owlViewModel.employee {
        Text("\(employee.name) · \(employee.company ?? "") · \(owlViewModel.processes.count) tasks")
          .font(.caption)
          .foregroundStyle(.secondary)
      }
      HStack(spacing: 16) {
        SwiftUI.Button("Permissions") {
          Task { testNote = await owlViewModel.setUpPermissions() }
        }
        SwiftUI.Button("Server") {
          serverURLDraft = OwlAPI.serverURL
          employeeIDDraft = OwlViewModel.employeeID
          showServerSettings = true
        }
        SwiftUI.Button("Record") {
          Task { await owlViewModel.startRecording() }
        }
      }
      .font(.subheadline)
      if phonePreview.isEnabled {
        simulatorControls
      }
      if let testNote {
        Text(testNote)
          .font(.caption)
          .foregroundStyle(.secondary)
      }
    }
    .padding(16)
    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 16))
    .alert("Owl server", isPresented: $showServerSettings) {
      TextField("http://10.0.x.x:8000", text: $serverURLDraft)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .keyboardType(.URL)
      TextField("Employee id", text: $employeeIDDraft)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
      SwiftUI.Button("Save") {
        OwlAPI.serverURL = serverURLDraft
        OwlViewModel.employeeID = employeeIDDraft
      }
      SwiftUI.Button("Cancel", role: .cancel) {}
    } message: {
      Text("Address of owl-api on your Mac, and the worker's employee id.")
    }
    .task {
      // Simulator test hooks (see CLAUDE.md): OWL_AUTO_PREVIEW=inApp|chrome starts mock
      // glasses, OWL_AUTO_VOICE=1 says "Hey Meta, start Owl", OWL_AUTO_RUN=1 starts the
      // first task, OWL_AUTO_ASK=<question> asks it by voice, OWL_AUTO_RECORD=1 records.
      let env = ProcessInfo.processInfo.environment
      guard developerPreviewMode == nil, let mode = env["OWL_AUTO_PREVIEW"] else { return }
      selectedDeveloperPreviewMode = mode == "chrome" ? .chrome : .inApp
      isDeveloperPreviewPresented = true
      isDeveloperPreviewTransitioning = true
      let ready = await setDeveloperPreviewMode(selectedDeveloperPreviewMode)
      isDeveloperPreviewTransitioning = false
      guard ready else { return }
      if env["OWL_AUTO_VOICE"] == "1" {
        try? await Task.sleep(for: .seconds(2))
        testNote = phonePreview.sendLaunchApp() ?? "Sent \u{201C}Hey Meta, start Owl\u{201D}"
      } else {
        await sendSample(item, deviceIdentifier: phonePreviewDeviceIdentifier)
      }
      try? await Task.sleep(for: .seconds(4))
      if env["OWL_AUTO_RUN"] == "1", let first = owlViewModel.processes.first(where: \.isPublished) {
        await owlViewModel.startProcess(first.id)
      }
      if let question = env["OWL_AUTO_ASK"], !question.isEmpty {
        await owlViewModel.ask()
        try? await Task.sleep(for: .seconds(2))
        phonePreview.simulateSpeech(question)
      }
      if env["OWL_AUTO_RECORD"] == "1" {
        // One narrated 4 s step, then finish.
        await owlViewModel.startRecording()
        await owlViewModel.startRecordedStep()
        try? await Task.sleep(for: .seconds(2))
        phonePreview.simulateSpeech("Take a medium box and put the order sheet on top.")
        try? await Task.sleep(for: .seconds(2))
        await owlViewModel.endRecordedStep()
        await owlViewModel.finishRecording()
      }
    }
  }

  /// Simulator only: drive the mock glasses like a worker would.
  private var simulatorControls: some View {
    VStack(spacing: 8) {
      HStack(spacing: 16) {
        SwiftUI.Button("Hey Meta, start Owl") {
          testNote = phonePreview.sendLaunchApp() ?? "Sent \u{201C}Hey Meta, start Owl\u{201D}"
        }
        SwiftUI.Button(owlViewModel.glassesOn ? "Take off" : "Put on") {
          phonePreview.setWorn(!owlViewModel.glassesOn)
        }
      }
      HStack {
        TextField("Spoken question", text: $testQuestion)
          .textFieldStyle(.roundedBorder)
        SwiftUI.Button("Speak") {
          phonePreview.simulateSpeech(testQuestion)
        }
      }
      Picker("Owl Check answer", selection: Binding(
        get: { owlViewModel.mockCheck ?? "" },
        set: { owlViewModel.mockCheck = $0.isEmpty ? nil : $0 }
      )) {
        Text("Real").tag("")
        Text("OK").tag("ok")
        Text("Warning").tag("warning")
        Text("Unsure").tag("unsure")
      }
      .pickerStyle(.segmented)
    }
    .font(.subheadline)
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
