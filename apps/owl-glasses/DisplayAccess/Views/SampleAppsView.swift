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
    case .carMaintenance: "Owl Boarding"
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
  var registrationState: RegistrationState
  var deviceItemStates: [DeviceItemState]
  var requiresDATAppUpdate: Bool
  var requiresFirmwareUpdate: Bool
  var connectGlasses: () -> Void
  var openDATGlassesAppUpdate: () -> Void
  var openFirmwareUpdate: () -> Void

  private let item: SampleAppItem = .carMaintenance
  @State private var isDeveloperPreviewPresented = false
  @State private var isDeveloperPreviewTransitioning = false
  @State private var selectedDeveloperPreviewMode = DeveloperPreviewMode.defaultMode
  @State private var copiedChromePreviewURL: URL?
  @State private var showServerSettings = false
  @State private var serverURLDraft = ""
  @State private var employeeIDDraft = ""
  @State private var glassesIDDraft = ""
  @State private var tokenDraft = ""
  @State private var testQuestion = "What if an item is out of stock?"
  @State private var testNote: String?
  @State private var stageMirroring = OwlViewModel.stageMirroring
  @State private var isOpening = false
  @State private var isAskingPermissions = false

  private let t = PhoneText.t

  var body: some View {
    ScrollViewReader { scroller in
    ScrollView {
      VStack(spacing: 16) {
        header
        wearerCard
        problemCards
        statusCard
        OwlSectionLabel(text: t("Setup", "Käyttöönotto"))
          .padding(.top, 8)
        setupRows
        if let testNote {
          Text(testNote)
            .font(.footnote)
            .foregroundStyle(OwlTheme.textSecondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 4)
        }
        developerPreviewEntry
          .padding(.top, 8)
          .id("bottom")
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
    }
    .task {
      #if DEBUG
      // Simulator screenshots: OWL_PHONE_SCROLL=bottom shows the end of the home screen.
      if ProcessInfo.processInfo.environment["OWL_PHONE_SCROLL"] == "bottom" {
        try? await Task.sleep(for: .seconds(2))
        scroller.scrollTo("bottom", anchor: .bottom)
      }
      #endif
    }
    }
    .scrollIndicators(.hidden)
    // The one primary action stays in view above the tab bar, however many problem cards
    // there are; the scroll content ends above it, so nothing hides under the bar.
    .safeAreaInset(edge: .bottom, spacing: 0) { primaryBar }
    .background(OwlTheme.window.ignoresSafeArea())
    .refreshable { await owlViewModel.refreshForPhone() }
    .toolbar(.hidden, for: .navigationBar)
    .sheet(isPresented: $isDeveloperPreviewPresented) {
      developerPreviewSheet
    }
    .alert(t("Owl's server", "Owlin palvelin"), isPresented: $showServerSettings) {
      TextField("https://…trycloudflare.com", text: $serverURLDraft)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .keyboardType(.URL)
      TextField(t("Glasses id (glasses-1)", "Lasien tunnus (glasses-1)"), text: $glassesIDDraft)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
      TextField(t("Employee id (testing only)", "Työntekijän tunnus (vain testaukseen)"), text: $employeeIDDraft)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
      SecureField(t("API token (optional)", "API-avain (valinnainen)"), text: $tokenDraft)
      SwiftUI.Button(t("Save", "Tallenna")) {
        OwlAPI.serverURL = serverURLDraft
        OwlViewModel.employeeID = employeeIDDraft
        OwlViewModel.glassesID = glassesIDDraft
        OwlAPI.token = tokenDraft
        Task { await owlViewModel.refreshForPhone() }
      }
      SwiftUI.Button(t("Cancel", "Peruuta"), role: .cancel) {}
    } message: {
      Text(
        t(
          "The owl-api address (LAN or the https tunnel), the name of these glasses in Owl Studio, and the API token. Leave the employee id empty: owl-api says who wears the glasses.",
          "owl-api:n osoite (lähiverkko tai https-tunneli), näiden lasien nimi Owl Studiossa ja API-avain. Jätä työntekijän tunnus tyhjäksi: owl-api kertoo, kuka laseja käyttää."))
    }
    .task { await owlViewModel.refreshForPhone() }
    .task { await runTestHooks() }
  }

  // MARK: - Home (the employer's phone, JUN-101 look)

  private var primaryBar: some View {
    VStack(spacing: 6) {
      OwlPrimaryButton(
        title: t("Open Owl on glasses", "Avaa Owl laseilla"), symbol: "eyeglasses", busy: isOpening, action: openOnGlasses)
      Text(t("Or say \u{201C}Hey Meta, start Owl\u{201D} with the glasses on.", "Tai sano laseilla \u{201C}Hey Meta, start Owl\u{201D}."))
        .font(.caption)
        .foregroundStyle(OwlTheme.textSecondary)
        .multilineTextAlignment(.center)
    }
    .padding(.horizontal, 16)
    .padding(.top, 14)
    .padding(.bottom, 10)
    .background(
      LinearGradient(
        stops: [.init(color: OwlTheme.window.opacity(0), location: 0), .init(color: OwlTheme.window, location: 0.25)],
        startPoint: .top, endPoint: .bottom)
    )
  }

  private var header: some View {
    HStack(spacing: 12) {
      OwlLogo(size: 34)
      VStack(alignment: .leading, spacing: 1) {
        Text("Owl Boarding")
          .font(.title3.weight(.bold))
          .foregroundStyle(OwlTheme.text)
        Text(owlViewModel.employee?.company ?? t("Learn every task on the glasses", "Opi jokainen tehtävä laseilla"))
          .font(.footnote)
          .foregroundStyle(OwlTheme.textSecondary)
      }
      Spacer()
    }
    .padding(.horizontal, 4)
    .padding(.top, 8)
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isHeader)
  }

  private var wearerCard: some View {
    OwlCard {
      HStack(spacing: 14) {
        Image("owlWelcome")
          .resizable()
          .scaledToFit()
          .frame(width: 58, height: 58)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 3) {
          Text(t("Wearing the glasses", "Laseja käyttää"))
            .font(.caption.weight(.semibold))
            .foregroundStyle(OwlTheme.textSecondary)
          if let employee = owlViewModel.employee {
            Text(employee.name)
              .font(.title2.weight(.bold))
              .foregroundStyle(OwlTheme.text)
            Text([employee.role, employee.company].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
              .font(.subheadline)
              .foregroundStyle(OwlTheme.textSecondary)
          } else {
            Text(owlViewModel.phoneGlassesNotAssigned ? t("Nobody yet", "Ei vielä kukaan") : t("Not known yet", "Ei vielä tiedossa"))
              .font(.title3.weight(.semibold))
              .foregroundStyle(OwlTheme.text)
            Text(t("Glasses \(OwlViewModel.glassesID)", "Lasit \(OwlViewModel.glassesID)"))
              .font(.subheadline)
              .foregroundStyle(OwlTheme.textSecondary)
          }
        }
        Spacer(minLength: 0)
      }
      if owlViewModel.employee != nil {
        Divider().overlay(OwlTheme.border)
        let tasks = owlViewModel.myProcesses
        if tasks.isEmpty {
          Text(t("No tasks yet. Give one to this worker in Owl Studio.", "Ei vielä tehtäviä. Anna tehtävä tälle työntekijälle Owl Studiossa."))
            .font(.subheadline)
            .foregroundStyle(OwlTheme.textSecondary)
        } else {
          VStack(alignment: .leading, spacing: 10) {
            ForEach(tasks) { task in
              HStack(spacing: 10) {
                Image(systemName: "checklist")
                  .font(.subheadline)
                  .foregroundStyle(OwlTheme.textSecondary)
                  .frame(width: 22)
                Text(task.title)
                  .font(.body.weight(.medium))
                  .foregroundStyle(OwlTheme.text)
                Spacer(minLength: 8)
                Text(t(task.steps.count == 1 ? "1 step" : "\(task.steps.count) steps", task.steps.count == 1 ? "1 vaihe" : "\(task.steps.count) vaihetta"))
                  .font(.footnote)
                  .foregroundStyle(OwlTheme.textSecondary)
              }
              .accessibilityElement(children: .combine)
            }
          }
        }
      }
    }
  }

  /// The glasses-app update, or (debug builds, simulator screenshots) OWL_PHONE_STATE=update.
  private var showsGlassesAppUpdate: Bool {
    #if DEBUG
    if ProcessInfo.processInfo.environment["OWL_PHONE_STATE"] == "update" { return true }
    #endif
    return requiresDATAppUpdate
  }

  @ViewBuilder
  private var problemCards: some View {
    if showsGlassesAppUpdate {
      OwlProblemCard(
        symbol: "arrow.down.app.fill", title: t("Update the Owl app on the glasses", "Päivitä Owl-sovellus laseille"),
        detail: t(
          "The glasses need a newer version before Owl can open. Keep their battery above 10%.",
          "Lasit tarvitsevat uudemman version ennen kuin Owl aukeaa. Pidä lasien akku yli 10 %:ssa."),
        tone: .attention, fix: t("Update in Meta AI", "Päivitä Meta AI:ssa"), onFix: openDATGlassesAppUpdate)
    }
    if requiresFirmwareUpdate {
      OwlProblemCard(
        symbol: "arrow.triangle.2.circlepath", title: t("Update the glasses", "Päivitä lasit"),
        detail: t(
          "The glasses' software is too old for Owl. Restart the glasses after the update.",
          "Lasien ohjelmisto on liian vanha Owlille. Käynnistä lasit uudelleen päivityksen jälkeen."),
        tone: .attention, fix: t("Update in Meta AI", "Päivitä Meta AI:ssa"), onFix: openFirmwareUpdate)
    }
    if registrationState != .registered, developerPreviewMode == nil {
      OwlProblemCard(
        symbol: "eyeglasses", title: t("Connect the glasses", "Yhdistä lasit"),
        detail: t(
          "Owl Boarding needs your permission in Meta AI to use the glasses.",
          "Owl Boarding tarvitsee luvan Meta AI:ssa käyttääkseen laseja."),
        tone: .attention, fix: t("Connect in Meta AI", "Yhdistä Meta AI:ssa"), onFix: connectGlasses)
    }
    if let state = owlViewModel.phoneState {
      // The same state the glasses show, with what the employer can do about it (JUN-42).
      OwlProblemCard(
        symbol: state.symbol, title: state.title, detail: state.detail,
        tone: state.tone == .problem ? .problem : .attention,
        fix: state.fix.map(fixTitle), onFix: state.fix.map { fix in { perform(fix) } })
    }
    if let message = standaloneDisplayErrorMessage, !showsGlassesAppUpdate {
      OwlProblemCard(
        symbol: "exclamationmark.triangle.fill", title: t("Owl couldn't open on the glasses", "Owl ei auennut laseilla"),
        detail: message, tone: .problem, fix: t("Try again", "Yritä uudelleen"), onFix: openOnGlasses)
    }
  }

  private var statusCard: some View {
    OwlCard {
      OwlStatusRow(
        symbol: "server.rack", title: t("Owl's server", "Owlin palvelin"), chip: serverChip.text, tone: serverChip.tone,
        detail: URL(string: OwlAPI.serverURL)?.host() ?? OwlAPI.serverURL)
      Divider().overlay(OwlTheme.border)
      OwlStatusRow(
        symbol: "eyeglasses", title: t("Glasses", "Lasit"), chip: glassesChip.text, tone: glassesChip.tone,
        detail: glassesChip.detail)
    }
  }

  private var serverChip: (text: String, tone: OwlChip.Tone) {
    switch owlViewModel.serverReachable {
    case true?: (t("Connected", "Yhdistetty"), .ok)
    case false?: (t("No connection", "Ei yhteyttä"), .problem)
    case nil: (t("Checking", "Tarkistetaan"), .neutral)
    }
  }

  private var glassesChip: (text: String, tone: OwlChip.Tone, detail: String) {
    let id = OwlViewModel.glassesID
    if showsGlassesAppUpdate || requiresFirmwareUpdate {
      return (t("Update needed", "Päivitys tarvitaan"), .attention, id)
    }
    if displayViewModel.isConnected {
      let now = owlViewModel.statusText
      return (t("Owl is open", "Owl on auki"), .ok, now.isEmpty || now == "Ready" ? id : "\(id) · \(now)")
    }
    if developerPreviewMode != nil {
      return (t("Preview", "Esikatselu"), .neutral, t("Simulated glasses", "Simuloidut lasit"))
    }
    if registrationState != .registered {
      return (t("Not set up", "Ei käyttöönotettu"), .attention, id)
    }
    if let device = deviceItemStates.first(where: { !$0.isPhonePreview && $0.linkState == .connected }) {
      return (t("Connected", "Yhdistetty"), .ok, "\(device.deviceName) · \(id)")
    }
    return (
      t("Not nearby", "Ei lähellä"), .attention,
      t("Turn the glasses on and keep them near the phone.", "Kytke lasit päälle ja pidä ne puhelimen lähellä.")
    )
  }

  private var setupRows: some View {
    OwlCard(padding: 14) {
      OwlActionRow(
        symbol: "hand.raised.fill", title: t("Permissions", "Luvat"),
        detail: t("Camera and microphone on the glasses", "Lasien kamera ja mikrofoni"), busy: isAskingPermissions
      ) { perform(.permissions) }
      Divider().overlay(OwlTheme.border).padding(.leading, 48)
      OwlActionRow(
        symbol: "server.rack", title: t("Server", "Palvelin"),
        detail: t("Address, glasses id and token", "Osoite, lasien tunnus ja avain")
      ) { perform(.server) }
      Divider().overlay(OwlTheme.border).padding(.leading, 48)
      OwlActionRow(
        symbol: "record.circle", title: t("Record a task", "Nauhoita tehtävä"),
        detail: t("An expert shows the steps on the glasses", "Asiantuntija näyttää vaiheet laseilla")
      ) { Task { await owlViewModel.startRecording() } }
      Divider().overlay(OwlTheme.border).padding(.leading, 48)
      // The audience sees the glasses on owl-api's /stage page (JUN-79). Off by default.
      Toggle(isOn: $stageMirroring) {
        HStack(spacing: 14) {
          Image(systemName: "rectangle.on.rectangle")
            .font(.body.weight(.semibold))
            .foregroundStyle(OwlTheme.text)
            .frame(width: 34, height: 34)
            .background(OwlTheme.raised, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
          VStack(alignment: .leading, spacing: 2) {
            Text(t("Stage mirroring", "Lavanäyttö"))
              .font(.body.weight(.medium))
              .foregroundStyle(OwlTheme.text)
            Text(t("Show the glasses on the stage page", "Näytä lasien näkymä lavasivulla"))
              .font(.footnote)
              .foregroundStyle(OwlTheme.textSecondary)
          }
        }
      }
      .tint(OwlTheme.accent)
      .padding(.vertical, 6)
      .onChange(of: stageMirroring) { _, on in OwlViewModel.stageMirroring = on }
    }
  }

  private func fixTitle(_ fix: OwlPhoneState.Fix) -> String {
    switch fix {
    case .permissions: t("Allow in Meta AI", "Salli Meta AI:ssa")
    case .server: t("Server settings", "Palvelimen asetukset")
    }
  }

  private func perform(_ fix: OwlPhoneState.Fix) {
    switch fix {
    case .permissions:
      isAskingPermissions = true
      Task {
        testNote = await owlViewModel.setUpPermissions()
        isAskingPermissions = false
      }
    case .server:
      serverURLDraft = OwlAPI.serverURL
      employeeIDDraft = OwlViewModel.employeeID
      glassesIDDraft = OwlViewModel.glassesID
      tokenDraft = OwlAPI.token
      showServerSettings = true
    }
  }

  private func openOnGlasses() {
    guard !isOpening else { return }
    isOpening = true
    Task {
      await sendSample(item, deviceIdentifier: nil)
      isOpening = false
    }
  }

  /// Tools for building and testing Owl without glasses, out of the way at the bottom.
  private var developerPreviewEntry: some View {
    OwlCard(padding: 14) {
      OwlActionRow(
        symbol: "hammer.fill", title: t("Developer tools", "Kehittäjätyökalut"),
        detail: t("Preview Owl without glasses", "Kokeile Owlia ilman laseja"), busy: isDeveloperPreviewSetupBusy,
        action: presentDeveloperPreview)
    }
    .disabled(isDeveloperPreviewSetupBusy)
    .opacity(0.85)
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
          if phonePreview.isEnabled {
            simulatorControls
            Text(owlViewModel.statusText)
              .font(.caption)
              .foregroundStyle(.secondary)
          }
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

  // MARK: - Simulator test hooks

  private func runTestHooks() async {
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
    // OWL_HIDE_PREVIEW=1 closes the preview sheet once the mock glasses run, so a screenshot
    // shows the phone's own screen (the employer's view of a problem, JUN-42).
    if env["OWL_HIDE_PREVIEW"] == "1" { isDeveloperPreviewPresented = false }
    if let name = env["OWL_PREVIEW_SCREEN"], !name.isEmpty {
      // One designed screen with sample data (JUN-36, see OwlScreenGallery).
      await owlViewModel.previewScreen(name, deviceIdentifier: phonePreviewDeviceIdentifier)
      return
    }
    if env["OWL_AUTO_VOICE"] == "1" {
      try? await Task.sleep(for: .seconds(2))
      testNote = phonePreview.sendLaunchApp() ?? "Sent \u{201C}Hey Meta, start Owl\u{201D}"
    } else {
      await sendSample(item, deviceIdentifier: phonePreviewDeviceIdentifier)
    }
    try? await Task.sleep(for: .seconds(4))
    if env["OWL_AUTO_RUN"] == "1", let first = owlViewModel.myProcesses.first {
      await owlViewModel.startProcess(first.id)
    }
    if let question = env["OWL_AUTO_ASK"], !question.isEmpty {
      await owlViewModel.ask()
      try? await Task.sleep(for: .seconds(2))
      phonePreview.simulateSpeech(question)
    }
    #if DEBUG
    // OWL_AUTO_SCRIPT="run;mock:warning;wait:4;again;..." drives the whole flow; `speak:<text>`,
    // `takeoff` and `puton` act on the mock glasses.
    if let script = env["OWL_AUTO_SCRIPT"] {
      for step in script.split(separator: ";").map(String.init) {
        if step.hasPrefix("speak:") {
          phonePreview.simulateSpeech(String(step.dropFirst(6)))
        } else if step == "takeoff" || step == "puton" {
          phonePreview.setWorn(step == "puton")
        } else if step == "heymeta" {
          testNote = phonePreview.sendLaunchApp() ?? "Sent Hey Meta"
        } else {
          await owlViewModel.runTestStep(step)
        }
      }
      NSLog("[Owl] test: script finished")
    }
    // OWL_STEP_FILE=<path>: each line appended to the file runs as one more step, so a
    // recording can take one screen at a time (`echo help >> <path>`).
    if let path = env["OWL_STEP_FILE"] {
      var done = 0
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(300))
        let lines = ((try? String(contentsOfFile: path, encoding: .utf8)) ?? "")
          .split(separator: "\n").map(String.init).filter { !$0.isEmpty }
        guard lines.count > done else { continue }
        for step in lines[done...] {
          NSLog("[Owl] test: take \(step)")
          if step.hasPrefix("speak:") {
            phonePreview.simulateSpeech(String(step.dropFirst(6)))
          } else {
            await owlViewModel.runTestStep(step)
          }
        }
        done = lines.count
      }
    }
    #endif
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
