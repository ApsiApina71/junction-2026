//
// OwlVoice.swift
//
// Hands-free input from the glasses, so the worker never takes out the phone:
//   - `OwlInvocations`: "Hey Meta, start Owl" (DAT voice invocations, experimental).
//     Every invocation is answered exactly once.
//   - `OwlListener`: on-glasses speech recognition (DAT Speech, dev/beta only) for Ask
//     questions and Record narration. Meta's known issue: recognition stops after about
//     a minute, so the listener restarts itself while it should be listening.
//

import Foundation
import MWDATCore
import MWDATSpeech

// MARK: - Voice invocations

@MainActor
final class OwlInvocations {
  /// Opens Owl on the glasses. Returns false if it could not, and the invocation is
  /// answered with a failure.
  var onLaunch: (@MainActor (DeviceIdentifier) async -> Bool)?
  private(set) var lastError: String?

  private let wearables: WearablesInterface
  private var stream: VoiceInvocationsStream?
  private var invocationToken: AnyListenerToken?
  private var errorToken: AnyListenerToken?
  private var activeDevice: DeviceIdentifier?
  private var devicesTask: Task<Void, Never>?

  init(wearables: WearablesInterface) {
    self.wearables = wearables
  }

  /// Follows the device list and keeps the invocation stream on the first glasses with a display.
  func start() {
    guard devicesTask == nil else { return }
    devicesTask = Task { [weak self] in
      guard let wearables = self?.wearables else { return }
      for await deviceIDs in wearables.devicesStream() {
        guard let self, !Task.isCancelled else { return }
        let target =
          deviceIDs.first { wearables.deviceForIdentifier($0)?.supportsDisplay() == true }
          ?? deviceIDs.first
        self.attach(to: target)
      }
    }
  }

  func stop() {
    devicesTask?.cancel()
    devicesTask = nil
    stream?.stop()
    invocationToken = nil
    errorToken = nil
    stream = nil
    activeDevice = nil
  }

  private func attach(to device: DeviceIdentifier?) {
    guard device != activeDevice else { return }
    activeDevice = device
    guard let device else {
      stream?.stop()
      return
    }
    do {
      let stream = try self.stream ?? makeStream()
      self.stream = stream
      try stream.start(deviceIdentifier: device)
      lastError = nil
      NSLog("[Owl] voice invocations on \(device)")
    } catch {
      lastError = "\(error)"
      NSLog("[Owl] voice invocations failed to start: \(error)")
    }
  }

  private func makeStream() throws -> VoiceInvocationsStream {
    let stream = try VoiceInvocationsStream(wearables: wearables)
    invocationToken = stream.invocationsPublisher.listen { [weak self] invocation in
      Task { @MainActor [weak self] in await self?.handle(invocation) }
    }
    errorToken = stream.errorPublisher.listen { [weak self] error in
      NSLog("[Owl] voice invocation error: \(error)")
      Task { @MainActor [weak self] in self?.lastError = "\(error)" }
    }
    return stream
  }

  private func handle(_ invocation: any VoiceInvocation) async {
    guard let launch = invocation as? LaunchApp else {
      NSLog("[Owl] unknown voice invocation: \(invocation)")
      return
    }
    NSLog("[Owl] Hey Meta, start Owl")
    // Answer exactly once, after Owl is on the display (or failed to get there).
    let opened = await onLaunch?(launch.deviceIdentifier) ?? false
    let delivered =
      opened
      ? await launch.responseHandle.sendSuccess(actionOutput: nil)
      : await launch.responseHandle.sendFailure(actionOutput: "Owl couldn't open on the glasses.")
    NSLog("[Owl] invocation answered (opened: \(opened), delivered: \(delivered))")
  }
}

// MARK: - Speech on the glasses

@MainActor
final class OwlListener {
  enum Mode {
    /// Stop after the first final transcription (an Ask question).
    case utterance
    /// Keep listening and collect every final transcription (Record narration).
    case continuous
  }

  /// Partial text while the wearer speaks.
  var onPartial: ((String) -> Void)?
  /// A finished utterance.
  var onFinal: ((String) -> Void)?
  /// The glasses speech locale, e.g. "en-US".
  var onLocale: ((String) -> Void)?
  /// Recognition could not start or keeps failing.
  var onError: ((OwlError?, String) -> Void)?

  private(set) var isListening = false
  private(set) var locale: String?

  private let wearables: WearablesInterface
  private var speech: Speech?
  private var speechSession: DeviceSession?
  private var tokens = ListenerTokenBag()
  private var mode: Mode = .utterance
  private var restarts = 0
  private var lastRestart = Date.distantPast
  private var restartTask: Task<Void, Never>?
  private static let maxQuickRestarts = 5

  init(wearables: WearablesInterface) {
    self.wearables = wearables
  }

  /// Starts recognition on the session's glasses. Does not ask for permission: the employer
  /// grants it once in Meta AI, and the worker never takes out the phone.
  func start(on session: DeviceSession, mode: Mode) async throws {
    self.mode = mode
    restarts = 0
    if try await wearables.checkPermissionStatus(.microphone) != .granted {
      throw OwlError.microphonePermissionDenied
    }
    let speech = try attach(to: session)
    isListening = true
    if speech.state != .started && speech.state != .starting {
      speech.start()
    }
  }

  func stop() {
    isListening = false
    restartTask?.cancel()
    restartTask = nil
    speech?.stop()
  }

  /// Removes Speech from the session (when the session ends).
  func detach() {
    stop()
    tokens.clear()
    tokens = ListenerTokenBag()
    if speech != nil { try? speechSession?.removeSpeech() }
    speech = nil
    speechSession = nil
  }

  private func attach(to session: DeviceSession) throws -> Speech {
    if let speech, speechSession === session { return speech }
    detach()
    guard let speech = try session.addSpeech() else { throw OwlError.noGlasses }
    speech.transcriptionPublisher.listen { [weak self] result in
      Task { @MainActor [weak self] in self?.receive(result) }
    }.store(in: tokens)
    speech.statePublisher.listen { [weak self] state in
      Task { @MainActor [weak self] in self?.stateChanged(state) }
    }.store(in: tokens)
    speech.localePublisher.listen { [weak self] locale in
      Task { @MainActor [weak self] in
        self?.locale = locale
        self?.onLocale?(locale)
      }
    }.store(in: tokens)
    speech.errorPublisher.listen { [weak self] error in
      Task { @MainActor [weak self] in self?.failed(error) }
    }.store(in: tokens)
    self.speech = speech
    speechSession = session
    return speech
  }

  private func receive(_ result: TranscriptionResult) {
    guard isListening else { return }
    let text = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else { return }
    // A confidence of -1 means "no score", not low confidence (DAT docs), so keep it.
    if result.isFinal {
      restarts = 0
      if mode == .utterance { stop() }
      onFinal?(text)
    } else {
      onPartial?(text)
    }
  }

  private func stateChanged(_ state: SpeechState) {
    NSLog("[Owl] speech state: \(state)")
    guard state == .stopped, isListening else { return }
    // Recognition stops by itself after about a minute (Meta known issue): start again.
    scheduleRestart()
  }

  private func failed(_ error: SpeechError) {
    NSLog("[Owl] speech error: \(error)")
    switch error {
    case .alreadyListening:
      return
    case .deviceDisconnected:
      isListening = false
      onError?(.noGlasses, error.localizedDescription)
    default:
      if isListening { scheduleRestart() } else { onError?(nil, error.localizedDescription) }
    }
  }

  private func scheduleRestart() {
    guard restartTask == nil else { return }
    // The ~1 minute stop is expected; only quick repeated failures count against the limit.
    if Date().timeIntervalSince(lastRestart) > 20 { restarts = 0 }
    lastRestart = Date()
    restarts += 1
    guard restarts <= Self.maxQuickRestarts else {
      isListening = false
      onError?(nil, "Speech recognition keeps stopping.")
      return
    }
    restartTask = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(400))
      guard let self, !Task.isCancelled else { return }
      self.restartTask = nil
      guard self.isListening, let speech = self.speech else { return }
      NSLog("[Owl] restarting speech recognition")
      speech.start()
    }
  }
}
