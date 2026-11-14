/*
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 * All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 */

//
// DisplayAccessApp.swift
//
// Main entry point for the DisplayAccess app demonstrating the Meta Wearables DAT SDK
// Display module. This app shows how to send visual content to wearable display devices.
//

import MWDATCore
import SwiftUI

private enum AppTab: Hashable {
  case samples
  case settings
}

@main
struct DisplayAccessApp: App {
  @State private var wearablesViewModel: WearablesViewModel
  @State private var displayViewModel: DisplayViewModel
  @State private var owlViewModel: OwlViewModel
  @State private var selectedTab: AppTab = .samples

  init() {
    OwlLogFile.start()
    do {
      try Wearables.configure()
    } catch {
      #if DEBUG
      NSLog("[DisplayAccess] Failed to configure Wearables SDK: \(error)")
      #endif
    }

    let wearables = Wearables.shared
    self._wearablesViewModel = State(wrappedValue: WearablesViewModel(wearables: wearables))
    let displayViewModel = DisplayViewModel(wearables: wearables)
    self._displayViewModel = State(wrappedValue: displayViewModel)
    self._owlViewModel = State(
      wrappedValue: OwlViewModel(displayViewModel: displayViewModel, wearables: wearables))
  }

  var body: some Scene {
    WindowGroup {
      TabView(selection: $selectedTab) {
        NavigationStack {
          SampleAppsView(
            displayViewModel: displayViewModel,
            owlViewModel: owlViewModel,
            phonePreview: wearablesViewModel.phonePreview,
            developerPreviewMode: wearablesViewModel.developerPreviewMode,
            isDeveloperPreviewChanging: wearablesViewModel.isDeveloperPreviewChanging,
            phonePreviewDisplay: wearablesViewModel.phonePreviewDisplay,
            phonePreviewDeviceIdentifier: wearablesViewModel.phonePreviewDeviceIdentifier,
            chromePreviewURL: wearablesViewModel.chromePreviewURL,
            developerPreviewErrorMessage: wearablesViewModel.developerPreviewErrorMessage,
            setDeveloperPreviewMode: setDeveloperPreviewMode,
            registrationState: wearablesViewModel.registrationState,
            deviceItemStates: wearablesViewModel.deviceItemStates,
            requiresDATAppUpdate: displayViewModel.requiresDATAppUpdate,
            requiresFirmwareUpdate: wearablesViewModel.requiresFirmwareUpdate,
            connectGlasses: { Task { await wearablesViewModel.connectGlasses() } },
            openDATGlassesAppUpdate: { wearablesViewModel.openDATGlassesAppUpdate() },
            openFirmwareUpdate: { wearablesViewModel.openFirmwareUpdate() }
          )
        }
        .tabItem {
          Label {
            Text("Owl Boarding")
          } icon: {
            Image("owlTab").renderingMode(.template)
          }
        }
        .tag(AppTab.samples)

        NavigationStack {
          SettingsView(
            viewModel: SettingsViewModel(
              registrationState: wearablesViewModel.registrationState,
              deviceItemStates: wearablesViewModel.deviceItemStates,
              requiresFirmwareUpdate: wearablesViewModel.requiresFirmwareUpdate,
              requiresDATAppUpdate: displayViewModel.requiresDATAppUpdate,
              connectGlasses: {
                Task {
                  await wearablesViewModel.connectGlasses()
                }
              },
              disconnectGlasses: {
                Task {
                  await wearablesViewModel.disconnectGlasses()
                }
              },
              openFirmwareUpdate: {
                wearablesViewModel.openFirmwareUpdate()
              },
              openDATGlassesAppUpdate: {
                wearablesViewModel.openDATGlassesAppUpdate()
              }
            )
          )
        }
        .tabItem {
          Label(PhoneText.t("Settings", "Asetukset"), systemImage: "gearshape")
        }
        .tag(AppTab.settings)
      }
      // Owl Studio's look (JUN-101): dark first, the toolkit's accent.
      .preferredColorScheme(.dark)
      .tint(OwlTheme.accent)
      .toolbarColorScheme(.dark, for: .tabBar)
      .task {
        #if DEBUG
        // Simulator screenshots: OWL_PHONE_TAB=settings opens the Settings tab.
        if ProcessInfo.processInfo.environment["OWL_PHONE_TAB"] == "settings" { selectedTab = .settings }
        #endif
      }
      .alert("Error", isPresented: $wearablesViewModel.showError) {
        Button("OK") { wearablesViewModel.dismissError() }
      } message: {
        Text(wearablesViewModel.errorMessage)
      }

      RegistrationView(viewModel: wearablesViewModel)
    }
  }

  private func setDeveloperPreviewMode(_ mode: DeveloperPreviewMode?) async -> Bool {
    await wearablesViewModel.setDeveloperPreviewMode(
      mode,
      stopDisplaySession: displayViewModel.stopSession
    )
  }
}
