//
// OwlViewModel.swift
//
// Onboarding Owl on the glasses (JUN-29). The worker never takes out the phone:
// "Hey Meta, start Owl" opens Owl on the display, buttons are picked with the Neural Band,
// questions are spoken into the glasses and answers come on the display and in the
// glasses speakers. The phone in the pocket only computes and talks to owl-api.
//
//   Learn & Check: step cards, Owl Check on camera stream frames, "Watch how" clips.
//   Ask (JUN-31): glasses speech → POST /ask → display + voice.
//   Help (JUN-33): frames to a remote expert, expert messages spoken.
//   Record (JUN-32): pinch per step → stream clip + reference frame + narration → owl-api.
//
// Screens come from `OwlBasicScreens` until the designed `OwlScreens` (JUN-36) land.
//

import Foundation
import MWDATCore
import MWDATDisplay
import Observation
import UIKit

@Observable
@MainActor
final class OwlViewModel {
  static let employeeIDKey = "owl.employeeID"
  static let glassesIDKey = "owl.glassesID"
  private static let checkInterval: Duration = .milliseconds(1500)
  private static let helpInterval: Duration = .seconds(2)

  private(set) var statusText = "Ready"
  private(set) var employee: OwlEmployee?
  private(set) var processes: [OwlProcess] = []
  private(set) var isOffline = false
  private(set) var glassesOn = true
  private(set) var lastHeard: String?

  @ObservationIgnored let displayViewModel: DisplayViewModel
  @ObservationIgnored private let wearables: WearablesInterface
  @ObservationIgnored let speaker = OwlSpeaker()
  @ObservationIgnored let invocations: OwlInvocations
  @ObservationIgnored private let listener: OwlListener
  @ObservationIgnored private var camera: OwlCamera?
  @ObservationIgnored private var cameraDenied = false
  @ObservationIgnored private var images: [String: UIImage] = [:]
  @ObservationIgnored private var welcomed = false
  @ObservationIgnored private var deviceStateToken: AnyListenerToken?
  @ObservationIgnored private var watchedDevice: DeviceIdentifier?

  // Learn & Check
  @ObservationIgnored private var process: OwlProcess?
  @ObservationIgnored private var stepIndex = 0
  @ObservationIgnored private var runID = UUID().uuidString
  @ObservationIgnored private var stepStatus: String?
  @ObservationIgnored private var checkTask: Task<Void, Never>?
  @ObservationIgnored private var checkFailures = 0
  @ObservationIgnored private var isFinishing = false
  /// What the display shows now, so it can be sent again (glasses back on, display woke).
  @ObservationIgnored private var currentScreen: (() async -> Void)?

  // Help
  @ObservationIgnored private var helpID: String?
  @ObservationIgnored private var helpTask: Task<Void, Never>?
  @ObservationIgnored private var lastSpokenExpertMessage = 0

  // Record
  @ObservationIgnored private var recording: OwlRecording?
  @ObservationIgnored private var isRecordingStep = false
  @ObservationIgnored private var narration: [String] = []

  /// For the simulator only: forces a `/check` answer from the mock API (`ok`, `warning`, ...).
  @ObservationIgnored var mockCheck: String? = ProcessInfo.processInfo.environment["OWL_MOCK_CHECK"]

  init(displayViewModel: DisplayViewModel, wearables: WearablesInterface) {
    self.displayViewModel = displayViewModel
    self.wearables = wearables
    self.invocations = OwlInvocations(wearables: wearables)
    self.listener = OwlListener(wearables: wearables)

    invocations.onLaunch = { [weak self] device in
      await self?.open(deviceIdentifier: device) ?? false
    }
    listener.onLocale = { [weak self] locale in self?.speaker.language = locale }
    displayViewModel.onSessionStateChange = { [weak self] state in
      self?.sessionStateChanged(state)
    }
    invocations.start()
  }

  /// The employer names each pair of glasses once (`glasses-1`); owl-api says who wears it.
  static var glassesID: String {
    get { UserDefaults.standard.string(forKey: glassesIDKey) ?? "glasses-1" }
    set { UserDefaults.standard.set(newValue, forKey: glassesIDKey) }
  }

  /// Optional override for testing: a fixed employee instead of the glasses' assignment.
  static var employeeID: String {
    get { UserDefaults.standard.string(forKey: employeeIDKey) ?? "" }
    set { UserDefaults.standard.set(newValue, forKey: employeeIDKey) }
  }

  @ObservationIgnored private var glassesNotAssigned = false

  private var api: OwlAPI { OwlAPI() }
  private var language: String? { employee?.language }
  private var step: OwlStep? {
    guard let process, process.steps.indices.contains(stepIndex) else { return nil }
    return process.steps[stepIndex]
  }

  // MARK: - Open

  /// Opens Owl on the glasses: the welcome on the first start, otherwise the task list.
  /// Returns false when the display could not be reached.
  @discardableResult
  func open(deviceIdentifier: DeviceIdentifier? = nil) async -> Bool {
    stopEverything()
    await show(OwlBasicScreens.status("Owl", detail: "Getting your tasks…"), deviceIdentifier: deviceIdentifier)
    watchGlasses()
    await loadTasks()
    if glassesNotAssigned {
      await showProblem(OwlError.glassesNotAssigned, retry: { await $0.open() })
      return displayViewModel.isConnected
    }
    if !welcomed, let employee {
      welcomed = true
      if let welcome = employee.welcome { speaker.say(welcome) }
      await showScreen {
        OwlBasicScreens.welcome(employee: employee, onStart: self.action { await $0.showTasks() })
      }
    } else {
      await showTasks()
    }
    return displayViewModel.isConnected
  }

  /// The published tasks assigned to this worker in Owl Studio (`process_ids`), in that order.
  /// Every published task when no worker is known or none is assigned.
  var myProcesses: [OwlProcess] {
    let published = processes.filter(\.isPublished)
    guard let ids = employee?.processIds, !ids.isEmpty else { return published }
    return ids.compactMap { id in published.first { $0.id == id } }
  }

  func showTasks() async {
    stopEverything()
    let published = myProcesses
    statusText = isOffline ? "Offline: saved tasks" : "\(published.count) tasks"
    let select: @Sendable (String) -> Void = { [weak self] id in
      Task { @MainActor in await self?.startProcess(id) }
    }
    await showScreen {
      OwlBasicScreens.taskList(
        processes: published, onSelect: select,
        onRecord: self.action { await $0.startRecording() })
    }
  }

  private func loadTasks() async {
    glassesNotAssigned = false
    do {
      let employeeID = Self.employeeID.trimmingCharacters(in: .whitespaces)
      let glassesID = Self.glassesID.trimmingCharacters(in: .whitespaces)
      let employee =
        employeeID.isEmpty
        ? try await api.employee(forGlasses: glassesID) : try await api.employee(employeeID)
      if employee.id != self.employee?.id { welcomed = false }
      // Steps in the worker's own language when the process has a translation.
      let processes = try await api.processes(language: employee.language)
      self.employee = employee
      self.processes = processes
      isOffline = false
      OwlCache.save(employee: employee, processes: processes)
      speaker.language = employee.language
    } catch OwlError.glassesNotAssigned {
      NSLog("[Owl] glasses \(Self.glassesID) are not assigned")
      glassesNotAssigned = true
      employee = nil
      processes = []
    } catch {
      NSLog("[Owl] loading tasks failed: \(error)")
      isOffline = (error as? OwlError)?.isServiceProblem ?? true
      // No network: the cached process still works (spec), without Owl Check.
      if let cached = OwlCache.load() {
        employee = cached.employee
        processes = cached.processes
      }
    }
  }

  // MARK: - Learn & Check

  func startProcess(_ id: String) async {
    guard let process = processes.first(where: { $0.id == id }) else { return }
    stopEverything()
    self.process = process
    stepIndex = 0
    runID = UUID().uuidString
    await openStep()
  }

  /// Shows the current step, says it and starts Owl Check if the step has one.
  private func openStep() async {
    guard let process, let step else { return }
    checkFailures = 0
    stepStatus = nil
    statusText = "Step \(step.index)/\(process.steps.count): \(step.title)"
    if let say = step.say { speaker.say(say) }
    await sendStep()
    if step.check.usesCamera {
      await startCheckLoop()
    } else {
      setStepStatus("Pinch Done when ready.")
    }
  }

  private func sendStep() async {
    guard let process, let step else { return }
    let image = await image(step.referenceImageUrl)
    await showScreen {
      OwlBasicScreens.step(
        process: process, step: step, image: image, status: self.stepStatus,
        onDone: self.action { await $0.finishStep() },
        onWatch: step.clipUrl == nil ? nil : self.action { await $0.watchHow() },
        onAsk: self.action { await $0.ask() },
        onHelp: self.action { await $0.startHelp() })
    }
  }

  /// Updates the status line on the step card; re-sends only when it changes.
  private func setStepStatus(_ text: String?) {
    guard text != stepStatus else { return }
    stepStatus = text
    Task { await sendStep() }
  }

  private func startCheckLoop() async {
    checkTask?.cancel()
    guard let camera = await openCamera() else {
      setStepStatus(cameraDenied ? "Camera is off. Pinch Done when ready." : "Owl can't see now. Pinch Done when ready.")
      return
    }
    setStepStatus("Owl is watching.")
    checkTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: Self.checkInterval)
        guard let self, !Task.isCancelled else { return }
        guard self.glassesOn, !self.isFinishing else { continue }
        guard let jpeg = camera.latestJPEG() else {
          NSLog("[Owl] check: no fresh camera frame")
          continue
        }
        await self.checkFrame(jpeg, final: false)
      }
    }
  }

  private func stopCheckLoop() {
    checkTask?.cancel()
    checkTask = nil
  }

  /// Sends one stream frame to Owl Check. Returns the result, or nil on a service problem.
  @discardableResult
  private func checkFrame(_ jpeg: OwlFrame, final: Bool) async -> OwlCheckResult? {
    guard let process, let step else { return nil }
    do {
      let result = try await api.check(
        frame: jpeg, processID: process.id, stepID: step.id, runID: runID, final: final,
        language: language, mock: mockCheck)
      checkFailures = 0
      NSLog("[Owl] check \(step.id) final=\(final): \(result.status)")
      guard self.step?.id == step.id else { return nil }
      if !final { await showLive(result, for: step) }
      return result
    } catch {
      checkFailures += 1
      NSLog("[Owl] check failed (\(checkFailures)): \(error)")
      if case .rateLimited = error as? OwlError { return nil }
      if checkFailures >= 3 {
        // Server or network down: keep going without the check (contract: 502/503).
        stopCheckLoop()
        setStepStatus("Owl can't see right now. Pinch Done when ready.")
      }
      return nil
    }
  }

  private func showLive(_ result: OwlCheckResult, for step: OwlStep) async {
    switch result.status {
    case "warning":
      stopCheckLoop()
      if let say = result.say { speaker.say(say) }
      await showCheckProblem(result)
    case "ok":
      // The engine says "ok" once per step; it sends `say: null` after that.
      if let say = result.say { speaker.say(say) }
      setStepStatus("✓ Looks right. Pinch Done.")
    case "checking":
      setStepStatus("Owl is checking…")
    default:
      // `unsure`: show the hint quietly; speak it only on a final check.
      setStepStatus(result.hint ?? "Owl is watching.")
    }
  }

  private func showCheckProblem(_ result: OwlCheckResult) async {
    guard let step else { return }
    statusText = result.text ?? "Check this"
    await showScreen {
      OwlBasicScreens.checkResult(
        step: step, result: result,
        onCheckAgain: self.action { await $0.checkAgain() },
        onBack: self.action { await $0.backToStep() })
    }
  }

  private func checkAgain() async {
    guard let camera, let jpeg = await camera.nextJPEG() else {
      await backToStep()
      return
    }
    await show(OwlBasicScreens.status("Checking…", detail: "Keep it in view."))
    guard let result = await finalCheck(jpeg) else {
      await backToStep()
      return
    }
    if let say = result.say { speaker.say(say) }
    if result.isWarning || (result.problem != nil && !result.isOK) {
      await showCheckProblem(result)
    } else {
      if !result.isOK { setStepStatus(result.hint ?? "Owl couldn't see it.") }
      await backToStep()
    }
  }

  private func backToStep() async {
    if let process, let step {
      statusText = "Step \(step.index)/\(process.steps.count): \(step.title)"
    }
    await sendStep()
    if step?.check.usesCamera == true, checkTask == nil, camera != nil {
      await startCheckLoop()
    }
  }

  /// The worker's "Done" pinch: a final check, then the next step. A step is never done
  /// while Owl sees something wrong; when Owl can't check, the worker's pinch counts.
  private func finishStep() async {
    guard let step, !isFinishing else { return }
    isFinishing = true
    defer { isFinishing = false }
    if step.check.usesCamera, let camera, let jpeg = await camera.nextJPEG(timeout: .seconds(2)) {
      stopCheckLoop()
      await show(OwlBasicScreens.status("Checking…", detail: "Hold still for a moment."))
      if let result = await finalCheck(jpeg) {
        // Speak only what the engine says; it decides when to stay quiet.
        if let say = result.say { speaker.say(say) }
        if result.isWarning || (!result.stepDone && result.problem != nil) {
          await showCheckProblem(result)
          return
        }
        if !result.stepDone && !result.isOK {
          setStepStatus(result.hint ?? "Owl couldn't see it. Try again.")
          await backToStep()
          return
        }
      }
    }
    await nextStep()
  }

  /// A final check. The engine answers "checking" at once while it is still busy with this
  /// run, so wait a moment and send the frame again.
  private func finalCheck(_ jpeg: OwlFrame) async -> OwlCheckResult? {
    for attempt in 0..<4 {
      guard let result = await checkFrame(jpeg, final: true) else { return nil }
      if result.status != "checking" || attempt == 3 { return result }
      try? await Task.sleep(for: .milliseconds(800))
    }
    return nil
  }

  private func nextStep() async {
    guard let process else { return }
    stopCheckLoop()
    if stepIndex + 1 < process.steps.count {
      stepIndex += 1
      await openStep()
    } else {
      closeCamera()
      statusText = "Finished \(process.title)"
      speaker.say("Well done! You finished the task.")
      await showScreen {
        OwlBasicScreens.done(process: process, onHome: self.action { await $0.showTasks() })
      }
    }
  }

  // MARK: - Watch how (played by JUN-56)

  private func watchHow() async {
    guard let clip = step?.clipUrl, let url = api.resolve(clip) else { return }
    stopCheckLoop()
    guard url.scheme == "https" else {
      // The DAT VideoPlayer plays https URLs only.
      speaker.say("The video isn't available right now.")
      setStepStatus("Video needs the https server.")
      await backToStep()
      return
    }
    statusText = "Playing the expert's clip"
    var finished = false
    await displayViewModel.playVideo(url: url.absoluteString) { [weak self] ok in
      guard let self, !finished else { return }
      finished = true
      if !ok { self.speaker.say("The video couldn't play.") }
      Task { await self.backToStep() }
    }
  }

  // MARK: - Ask (JUN-31)

  func ask() async {
    guard let session = displayViewModel.currentDeviceSession() else { return }
    stopCheckLoop()
    lastHeard = nil
    await show(
      OwlBasicScreens.listening(
        prompt: "Ask your question.", heard: nil, onCancel: action { await $0.endAsk() }))
    listener.onPartial = { [weak self] text in
      guard let self else { return }
      self.lastHeard = text
      Task {
        await self.show(
          OwlBasicScreens.listening(
            prompt: "Ask your question.", heard: text, onCancel: self.action { await $0.endAsk() }))
      }
    }
    listener.onFinal = { [weak self] question in
      Task { await self?.answer(question) }
    }
    listener.onError = { [weak self] _, message in
      Task { await self?.showProblem(OwlError.microphonePermissionDenied, detail: message) }
    }
    do {
      try await listener.start(on: session, mode: .utterance)
      speaker.say("Yes?")
    } catch {
      await showProblem(error)
    }
  }

  /// Asks owl-api. Also used by the phone's test field.
  func answer(_ question: String) async {
    listener.stop()
    lastHeard = question
    statusText = "Asked: \(question)"
    await show(OwlBasicScreens.status("Owl is thinking…", detail: "“\(question)”"))
    do {
      let answer = try await api.ask(
        question, employeeID: employee?.id, processID: process?.id, stepID: step?.id,
        language: language)
      speaker.say(answer.say ?? answer.text)
      await showScreen {
        OwlBasicScreens.answer(
          question: question, answer: answer,
          onAskAgain: self.action { await $0.ask() },
          onBack: self.action { await $0.endAsk() })
      }
    } catch {
      await showProblem(error, retry: { await $0.answer(question) })
    }
  }

  private func endAsk() async {
    listener.stop()
    if process != nil { await backToStep() } else { await showTasks() }
  }

  // MARK: - Help (JUN-33)

  private func startHelp() async {
    stopCheckLoop()
    guard let camera = await openCamera() else {
      await showProblem(cameraDenied ? OwlError.cameraPermissionDenied : OwlError.noCamera)
      return
    }
    helpID = nil
    lastSpokenExpertMessage = 0
    speaker.say("Calling an expert. They will see what you see.")
    await showScreen { OwlBasicScreens.help(session: nil, onEnd: self.action { await $0.endHelp() }) }
    helpTask = Task { [weak self] in
      while !Task.isCancelled {
        guard let self else { return }
        await self.helpTick(camera: camera)
        try? await Task.sleep(for: Self.helpInterval)
      }
    }
  }

  private func helpTick(camera: OwlCamera) async {
    do {
      let session: OwlHelpSession
      if let jpeg = camera.latestJPEG(maxSide: 800) {
        session = try await api.sendHelpFrame(
          jpeg, helpID: helpID, employeeID: employee?.id, processID: process?.id, stepID: step?.id)
      } else if let helpID {
        session = try await api.help(helpID)
      } else {
        return
      }
      guard !Task.isCancelled else { return }
      helpID = session.id
      let newMessages = session.messages.filter { $0.from == "expert" && $0.id > lastSpokenExpertMessage }
      for message in newMessages {
        speaker.say(message.text)
        lastSpokenExpertMessage = message.id
      }
      statusText = session.isConnected ? "Expert connected" : "Waiting for an expert"
      if session.isEnded {
        await endHelp()
      } else if !newMessages.isEmpty || session.isConnected {
        await showScreen { OwlBasicScreens.help(session: session, onEnd: self.action { await $0.endHelp() }) }
      }
    } catch {
      NSLog("[Owl] help failed: \(error)")
      statusText = "Help: \((error as? LocalizedError)?.errorDescription ?? "\(error)")"
    }
  }

  private func endHelp() async {
    helpTask?.cancel()
    helpTask = nil
    if let helpID { _ = try? await api.endHelp(helpID) }
    helpID = nil
    if process != nil { await backToStep() } else { await showTasks() }
  }

  // MARK: - Record (JUN-32)

  func startRecording() async {
    stopEverything()
    await show(OwlBasicScreens.status("Record", detail: "Starting…"))
    do {
      recording = try await api.startRecording(
        title: "New task \(Date().formatted(date: .omitted, time: .shortened))",
        expert: employee?.name ?? "Expert")
      speaker.say("Recording. Pinch Record step, then do the step and say what you do.")
      await showRecord()
    } catch {
      await showProblem(error, retry: { await $0.startRecording() })
    }
  }

  private func showRecord(narration text: String? = nil) async {
    guard let recording else { return }
    let stepCount = recording.steps.count
    let isRecordingStep = isRecordingStep
    await showScreen {
      OwlBasicScreens.record(
        title: recording.title, stepCount: stepCount, isRecordingStep: isRecordingStep,
        narration: text,
        onStartStep: self.action { await $0.startRecordedStep() },
        onEndStep: self.action { await $0.endRecordedStep() },
        onFinish: self.action { await $0.finishRecording() })
    }
  }

  func startRecordedStep() async {
    guard !isRecordingStep, let session = displayViewModel.currentDeviceSession() else { return }
    guard let camera = await openCamera() else {
      await showProblem(cameraDenied ? OwlError.cameraPermissionDenied : OwlError.noCamera)
      return
    }
    narration = []
    do {
      try camera.startClip()
    } catch {
      await showProblem(error)
      return
    }
    isRecordingStep = true
    statusText = "Recording a step"
    listener.onPartial = nil
    listener.onFinal = { [weak self] text in
      guard let self else { return }
      self.narration.append(text)
      Task { await self.showRecord(narration: self.narration.joined(separator: " ")) }
    }
    listener.onError = { [weak self] _, message in self?.statusText = "Narration: \(message)" }
    do {
      try await listener.start(on: session, mode: .continuous)
    } catch {
      // Recording still works without narration; Owl Studio can add the text.
      statusText = "No narration: \((error as? LocalizedError)?.errorDescription ?? "\(error)")"
    }
    await showRecord()
  }

  func endRecordedStep() async {
    guard isRecordingStep, let recording, let camera else { return }
    isRecordingStep = false
    listener.stop()
    let photo = camera.photoJPEG(maxSide: 1280)
    let clip = await camera.finishClip()
    await show(OwlBasicScreens.status("Saving step…", detail: "Uploading the clip."))
    guard let photo else {
      await showProblem(OwlError.noCamera, retry: { await $0.showRecord() })
      return
    }
    do {
      let text = narration.joined(separator: " ")
      self.recording = try await api.addRecordedStep(
        recordingID: recording.id, narration: text, photo: photo, clip: clip)
      NSLog("[Owl] recorded step \(self.recording?.steps.count ?? 0) of \(recording.id): clip \(clip != nil), narration \"\(text)\"")
      if let clip { try? FileManager.default.removeItem(at: clip) }
      speaker.say("Step saved.")
      await showRecord()
    } catch {
      await showProblem(error, retry: { await $0.showRecord() })
    }
  }

  func finishRecording() async {
    guard let recording else { return }
    closeCamera()
    await show(OwlBasicScreens.status("Owl is writing the steps…", detail: "This takes a moment."))
    do {
      var current = try await api.finishRecording(recording.id)
      for _ in 0..<45 where current.status == "processing" || current.status == "recording" {
        try await Task.sleep(for: .seconds(2))
        current = try await api.recording(recording.id)
      }
      self.recording = nil
      NSLog("[Owl] recording \(current.id): \(current.status), process \(current.processId ?? "-")")
      if current.status == "done" {
        speaker.say("Done. Review the new task in Owl Studio.")
        await showScreen {
          OwlBasicScreens.status("Recorded", detail: "Review \(current.title) in Owl Studio.")
        }
        try? await Task.sleep(for: .seconds(4))
        await loadTasks()
        await showTasks()
      } else {
        await showProblem(OwlError.server(500, "Owl couldn't write the steps."))
      }
    } catch {
      await showProblem(error, retry: { await $0.finishRecording() })
    }
  }

  // MARK: - Glasses on/off and session

  /// Glasses taken off: Owl pauses and goes quiet. Back on: the screen comes back.
  private func watchGlasses() {
    guard let device = displayViewModel.activeDevice, device != watchedDevice,
      let glasses = wearables.deviceForIdentifier(device)
    else { return }
    watchedDevice = device
    deviceStateToken = glasses.addDeviceStateListener { [weak self] state in
      Task { @MainActor [weak self] in self?.donStateChanged(state.donState) }
    }
  }

  private func donStateChanged(_ state: DonState) {
    switch state {
    case .doffed where glassesOn:
      glassesOn = false
      statusText = "Glasses taken off: paused"
      speaker.stop()
      listener.stop()
    case .donned where !glassesOn:
      glassesOn = true
      statusText = "Welcome back"
      Task { await currentScreen?() }
    default:
      break
    }
  }

  private func sessionStateChanged(_ state: DeviceSessionState) {
    switch state {
    case .started:
      watchGlasses()
    case .paused:
      statusText = "Paused by the glasses"
    case .stopped:
      stopEverything()
      closeCamera()
      listener.detach()
      statusText = "Owl closed on the glasses"
    default:
      break
    }
  }

  // MARK: - Permissions (employer, once)

  /// The employer's one-time setup on the phone: asks Meta AI for camera and microphone.
  /// The worker's flow never asks, because that would need the phone.
  func setUpPermissions() async -> String {
    var lines: [String] = []
    for (permission, name) in [(Permission.camera, "Camera"), (Permission.microphone, "Microphone")] {
      do {
        var status = try await wearables.checkPermissionStatus(permission)
        if status != .granted { status = try await wearables.requestPermission(permission) }
        lines.append("\(name): \(status == .granted ? "allowed" : "not allowed")")
      } catch {
        lines.append("\(name): \(error)")
      }
    }
    cameraDenied = false
    return lines.joined(separator: " · ")
  }

  // MARK: - Camera

  /// Opens the stream on the display session. Never asks for permission (the employer grants
  /// it once in Meta AI); returns nil when it is not allowed or the camera fails.
  private func openCamera() async -> OwlCamera? {
    if let camera { return camera }
    guard let session = displayViewModel.currentDeviceSession() else { return nil }
    do {
      guard try await wearables.checkPermissionStatus(.camera) == .granted else {
        cameraDenied = true
        return nil
      }
      cameraDenied = false
      let camera = try await OwlCamera.open(on: session)
      camera.onError = { message in NSLog("[Owl] camera: \(message)") }
      self.camera = camera
      return camera
    } catch {
      NSLog("[Owl] camera failed: \(error)")
      return nil
    }
  }

  private func closeCamera() {
    camera?.close()
    camera = nil
  }

  // MARK: - Helpers

  private func stopEverything() {
    stopCheckLoop()
    helpTask?.cancel()
    helpTask = nil
    listener.stop()
    isRecordingStep = false
    Task { _ = await camera?.finishClip() }
  }

  /// Sends a screen and remembers it, so it can be sent again later.
  private func showScreen(_ make: @escaping @MainActor () -> FlexBox) async {
    currentScreen = { [weak self] in await self?.show(make()) }
    await show(make())
  }

  private func show(_ screen: FlexBox, deviceIdentifier: DeviceIdentifier? = nil) async {
    guard glassesOn else { return }
    await displayViewModel.send(screen, deviceIdentifier: deviceIdentifier)
  }

  private func showProblem(
    _ error: Error, detail: String? = nil, retry: (@MainActor (OwlViewModel) async -> Void)? = nil
  ) async {
    let owlError = error as? OwlError
    let message = detail ?? (error as? LocalizedError)?.errorDescription ?? "\(error)"
    statusText = message
    NSLog("[Owl] problem: \(error)")
    let title: String =
      switch owlError {
      case .offline: "No connection"
      case .cameraPermissionDenied, .microphonePermissionDenied, .unauthorized: "Not allowed"
      case .server, .decoding, .rateLimited: "Owl can't help right now"
      default: "Oops"
      }
    speaker.say(owlError?.isServiceProblem == true ? "Owl can't help right now." : message)
    await showScreen {
      OwlBasicScreens.problem(
        title, detail: message,
        onRetry: retry.map { retry in self.action { await retry($0) } },
        onHome: self.action { await $0.process != nil ? $0.backToStep() : $0.showTasks() })
    }
  }

  private func image(_ urlString: String?) async -> UIImage? {
    guard let urlString else { return nil }
    if let cached = images[urlString] { return cached }
    guard let image = try? await api.image(urlString) else { return nil }
    // The display is 600×600; smaller images keep the Bluetooth link fast.
    let scaled = image.owlScaled(maxSide: 480)
    images[urlString] = scaled
    return scaled
  }

  /// A display button action that runs `body` on the main actor.
  private func action(_ body: @escaping @MainActor (OwlViewModel) async -> Void) -> OwlAction {
    { [weak self] in
      Task { @MainActor [weak self] in
        guard let self else { return }
        await body(self)
      }
    }
  }
}

/// The last employee and processes, so a known task still works without network.
enum OwlCache {
  private struct Saved: Codable {
    let employee: OwlEmployee
    let processes: [OwlProcess]
  }

  private static var url: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("owl-cache.json")
  }

  static func save(employee: OwlEmployee, processes: [OwlProcess]) {
    guard let data = try? JSONEncoder().encode(Saved(employee: employee, processes: processes)) else { return }
    try? data.write(to: url, options: .atomic)
  }

  static func load() -> (employee: OwlEmployee, processes: [OwlProcess])? {
    guard let data = try? Data(contentsOf: url),
      let saved = try? JSONDecoder().decode(Saved.self, from: data)
    else { return nil }
    return (saved.employee, saved.processes)
  }
}

#if DEBUG
// MARK: - Simulator test script (OWL_AUTO_SCRIPT)

/// Drives the flow like the Neural Band would, for end-to-end runs in the simulator.
/// Steps are separated by `;` (see apps/owl-glasses/CLAUDE.md).
extension OwlViewModel {
  func runTestStep(_ step: String) async {
    let parts = step.split(separator: ":", maxSplits: 1).map(String.init)
    let name = parts.first?.trimmingCharacters(in: .whitespaces) ?? ""
    let argument = parts.count > 1 ? parts[1] : ""
    NSLog("[Owl] test: \(step)")
    switch name {
    case "open": await open()
    case "start": await showTasks()
    case "run": if let first = myProcesses.first { await startProcess(first.id) }
    case "process": await startProcess(argument)
    case "done": await finishStep()
    case "again": await checkAgain()
    case "back": await backToStep()
    case "watch": await watchHow()
    case "ask": await ask()
    case "answer": await answer(argument)
    case "help": await startHelp()
    case "endhelp": await endHelp()
    case "record": await startRecording()
    case "recordstep": await startRecordedStep()
    case "endstep": await endRecordedStep()
    case "finish": await finishRecording()
    case "mock": mockCheck = argument.isEmpty ? nil : argument
    case "wait": try? await Task.sleep(for: .seconds(Double(argument) ?? 1))
    default: NSLog("[Owl] test: unknown step \(name)")
    }
    NSLog("[Owl] test: now \(statusText)")
  }
}
#endif
