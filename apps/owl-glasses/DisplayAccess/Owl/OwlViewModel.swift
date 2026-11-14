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
  /// What the worker agreed to (JUN-80). Without camera checks Owl is a guide without checks.
  private(set) var consent: OwlConsent?
  /// The worker paused the camera with one pinch; checks stay off until they turn it on.
  private(set) var cameraPaused = false
  private var checksAllowed: Bool { consent?.cameraChecks == true && !cameraPaused }
  /// The worker's inclusive profile (JUN-81).
  private var access: OwlAccess { employee?.access ?? OwlAccess() }
  /// True while the step card is on the display, so display-first captions can go on it.
  @ObservationIgnored private var onStepCard = false
  /// Display-first: the last spoken line, shown on the step card under the status.
  @ObservationIgnored private var lastCaption: String?
  /// What the display shows now, for the stage page (JUN-79).
  @ObservationIgnored private var stageScreen = OwlStageScreen(kind: "start", title: "Owl", text: nil)
  @ObservationIgnored private var stageFrameTask: Task<Void, Never>?
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
  /// When to send the next live frame (JUN-82), from the last answer's `next_check_ms`.
  /// Nil means Owl does not look again until the next step or a pinch.
  @ObservationIgnored private var nextCheckDelay: Duration? = checkInterval
  /// Performance numbers for JUN-82: frames sent in the current task, and since when.
  @ObservationIgnored private var framesSent = 0
  @ObservationIgnored private var framesSince = ContinuousClock.now
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
    // The glasses recognise speech in their own language setting (DAT Speech `locale`); the
    // app cannot choose it. The voice follows the worker's language instead.
    listener.onLocale = { locale in NSLog("[Owl] glasses speech locale: \(locale)") }
    speaker.onSpoken = { [weak self] text in
      self?.caption(text)
      self?.postStage(said: text)
    }
    startStageFrames()
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
  /// "Stage mirroring" (JUN-79): the glasses screen, spoken lines and one camera frame a second
  /// go to owl-api's stage page for the audience. Off by default; OWL_STAGE=1 turns it on.
  static var stageMirroring: Bool {
    get {
      ProcessInfo.processInfo.environment["OWL_STAGE"] == "1"
        || UserDefaults.standard.bool(forKey: "owl.stageMirroring")
    }
    set { UserDefaults.standard.set(newValue, forKey: "owl.stageMirroring") }
  }

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
    if let employee, await needsConsent(employee) {
      await askConsent(then: { await $0.open() })
      return displayViewModel.isConnected
    }
    if !welcomed, let employee {
      welcomed = true
      if let welcome = employee.welcome { speaker.say(welcome) }
      await showScreen(stage: .init(kind: "welcome", title: "Hi, \(employee.name)!", text: employee.welcome)) {
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
    if access.audioFirst, !published.isEmpty {
      speaker.say(t("Your tasks:") + " " + published.map(\.title).joined(separator: ". ") + ".", interrupt: false)
    }
    let select: @Sendable (String) -> Void = { [weak self] id in
      Task { @MainActor in await self?.startProcess(id) }
    }
    await showScreen(stage: .init(kind: "tasks", title: "Your tasks", text: published.map(\.title).joined(separator: " · "))) {
      OwlBasicScreens.taskList(
        processes: published, onSelect: select,
        onRecord: self.action { await $0.startRecording() },
        onProgress: self.employee == nil ? nil : self.action { await $0.showProgress() })
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
      // Steps in the worker's own language when the process has a translation; easy-language
      // workers ask for the `-x-easy` version, and get the original when there is none.
      let processes = try await api.processes(
        language: employee.access?.easyLanguage == true ? "\(employee.language)-x-easy" : employee.language)
      self.employee = employee
      self.processes = processes
      isOffline = false
      OwlCache.save(employee: employee, processes: processes)
      speaker.language = employee.language
      applyProfile(employee)
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
        speaker.language = cached.employee.language
        applyProfile(cached.employee)
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
    framesSent = 0
    framesSince = .now
    await openStep()
  }

  /// Shows the current step, says it and starts Owl Check if the step has one.
  private func openStep() async {
    guard let process, let step else { return }
    checkFailures = 0
    stepStatus = nil
    lastCaption = nil
    statusText = "Step \(step.index)/\(process.steps.count): \(step.title)"
    if let say = step.say { speaker.say(say) }
    if access.audioFirst { speaker.say(readAloud(step), interrupt: false) }
    await sendStep()
    if step.check.usesCamera {
      await startCheckLoop()
    } else {
      // No check in this step: no frames, and the stream is off to save battery (JUN-82).
      closeCamera()
      setStepStatus("Pinch Done when ready.")
    }
  }

  private func sendStep() async {
    guard let process, let step else { return }
    let image = await image(step.referenceImageUrl)
    let stage = OwlStageScreen(
      kind: "step", title: "Step \(step.index)/\(process.steps.count) · \(step.title)",
      text: [step.instruction, stepStatusWithCaption].compactMap { $0 }.joined(separator: " · "))
    await showScreen(stage: stage) {
      OwlBasicScreens.step(
        process: process, step: step, image: image, status: self.stepStatusWithCaption,
        onDone: self.action { await $0.finishStep() },
        onWatch: step.clipUrl == nil ? nil : self.action { await $0.watchHow() },
        onAsk: self.action { await $0.ask() },
        onHelp: self.action { await $0.startHelp() },
        cameraOn: step.check.usesCamera && self.consent?.cameraChecks == true ? !self.cameraPaused : nil,
        onCamera: self.action { await $0.toggleCamera() })
    }
    onStepCard = true
  }

  /// Updates the status line on the step card; re-sends only when it changes.
  private func setStepStatus(_ english: String?) {
    let text = english.map { t($0) }
    guard text != stepStatus else { return }
    stepStatus = text
    Task { await sendStep() }
  }

  private func startCheckLoop() async {
    checkTask?.cancel()
    guard checksAllowed else {
      // No consent, or paused: the camera stays off and the worker confirms with Done.
      closeCamera()
      setStepStatus(cameraPaused ? "Camera paused. Pinch Done when ready." : "Camera checks are off. Pinch Done when ready.")
      return
    }
    guard let camera = await openCamera() else {
      setStepStatus(cameraDenied ? "Camera is off. Pinch Done when ready." : "Owl can't see now. Pinch Done when ready.")
      return
    }
    setStepStatus("Owl is watching.")
    nextCheckDelay = Self.checkInterval
    checkTask = Task { [weak self] in
      while !Task.isCancelled {
        // Follow owl-api's next_check_ms; nil means nothing more to check in this step.
        guard let delay = self?.nextCheckDelay else {
          NSLog("[Owl] check: server says no more checks until the next step or a pinch")
          return
        }
        try? await Task.sleep(for: delay)
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
      let sentAt = ContinuousClock.now
      let result = try await api.check(
        frame: jpeg, processID: process.id, stepID: step.id, runID: runID, final: final,
        language: language, employeeID: employee?.id, mock: mockCheck)
      checkFailures = 0
      framesSent += 1
      let minutes = max((ContinuousClock.now - framesSince) / .seconds(60), 1.0 / 60)
      NSLog(
        "[Owl] check \(step.id) final=\(final): \(result.status) · perf: \(jpeg.byteCount / 1024) KB, round trip \(Int((ContinuousClock.now - sentAt) / .milliseconds(1))) ms, next \(result.nextCheckMs.map { "\($0) ms" } ?? "none"), \(String(format: "%.1f", Double(framesSent) / minutes)) frames/min")
      if !final { nextCheckDelay = result.nextCheckMs.map { .milliseconds($0) } }
      guard self.step?.id == step.id else { return nil }
      if !final { await showLive(result, for: step) }
      return result
    } catch {
      if case .consentRequired = error as? OwlError {
        // The server has no consent on record: stop checking, keep guiding.
        NSLog("[Owl] check refused: consent required")
        if let employee {
          consent = OwlConsent(employeeId: employee.id, cameraChecks: false, recording: consent?.recording ?? false, at: consent?.at)
        }
        stopCheckLoop()
        closeCamera()
        setStepStatus("Camera checks are off. Pinch Done when ready.")
        return nil
      }
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
    if access.audioFirst, let lines = result.lines, !lines.isEmpty {
      // Read the ✓ / ✗ rows too, so nothing is only on the display.
      let rows = lines.map { "\($0.name): \($0.seen) / \($0.expected)\($0.note.map { ", \($0)" } ?? "")." }
      speaker.say(rows.joined(separator: " "), interrupt: false)
    }
    let rows = (result.lines ?? []).map { "\($0.isOK ? "✓" : "✗") \($0.name) \($0.seen)/\($0.expected)" }
    await showScreen(stage: .init(kind: "check", title: result.text ?? result.hint ?? "Check this", text: rows.isEmpty ? nil : rows.joined(separator: " · "))) {
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
    } else if result.stepDone {
      // The fix was checked and the step is done: no second Done pinch needed.
      await nextStep()
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
      await finishTask(process)
    }
  }

  // MARK: - Progress (JUN-76)

  /// The last step is done: say so, then show the worker's own progress.
  private func finishTask(_ process: OwlProcess) async {
    closeCamera()
    statusText = "Finished \(process.title)"
    speaker.say("Well done! You finished the task.")
    await showProgress(afterTask: true)
  }

  /// The worker's own progress on the glasses, shown and spoken. Encouraging, never a score.
  func showProgress(afterTask: Bool = false) async {
    guard let employee else { return await showTasks() }
    let progress = try? await api.progress(employeeID: employee.id)
    let lines = OwlText.progressLines(progress, afterTask: afterTask, language: employee.language)
    let title = t(afterTask ? "Task done!" : "Your progress")
    if !afterTask || progress != nil {
      // After a task "Well done!" is already playing; queue the progress after it.
      speaker.say(lines.joined(separator: " "), interrupt: !afterTask)
    }
    await showScreen(stage: .init(kind: "progress", title: title, text: lines.joined(separator: " "))) {
      OwlBasicScreens.progress(
        title: title, lines: lines, onHome: self.action { await $0.showTasks() },
        onForget: progress == nil ? nil : self.action { await $0.forgetMe() })
    }
  }

  /// "Forget me": the worker erases their own learning data on owl-api.
  private func forgetMe() async {
    guard let employee else { return }
    do {
      try await api.forgetProgress(employeeID: employee.id)
      speaker.say("Your progress is forgotten.")
      await showProgress()
    } catch {
      await showProblem(error, retry: { await $0.forgetMe() })
    }
  }

  // MARK: - Inclusive profiles (JUN-81)

  /// The app's own sentence in the worker's language, in easy language when the profile asks.
  private func t(_ english: String) -> String {
    OwlText.localize(english, to: language, easy: access.easyLanguage)
  }

  private func applyProfile(_ employee: OwlEmployee) {
    let access = employee.access ?? OwlAccess()
    speaker.easy = access.easyLanguage
    speaker.slow = access.audioFirst
    NSLog("[Owl] profile: audio first \(access.audioFirst), display first \(access.displayFirst), easy \(access.easyLanguage)")
  }

  /// Audio-first: the instruction and what Owl checks, read aloud after the step's own line.
  private func readAloud(_ step: OwlStep) -> String {
    var parts = [step.instruction]
    if let criteria = step.check.criteria, !criteria.isEmpty, step.check.usesCamera {
      parts.append(t("Owl checks:") + " " + criteria.joined(separator: ". ") + ".")
    }
    return parts.joined(separator: " ")
  }

  /// Display-first: every spoken line also goes on the step card as a caption, on its own
  /// line under Owl's status, so a check update never hides what was said.
  private func caption(_ text: String) {
    guard access.displayFirst, step != nil, text != lastCaption else { return }
    lastCaption = text
    // When the step card is not up yet (openStep speaks first), it shows the caption when sent.
    if onStepCard { Task { await sendStep() } }
  }

  private var stepStatusWithCaption: String? {
    guard access.displayFirst, let lastCaption else { return stepStatus }
    // Skip the caption when the status already says the same thing ("✓ Looks right…").
    if let stepStatus, stepStatus.contains(lastCaption) { return stepStatus }
    return [stepStatus, "“\(lastCaption)”"].compactMap { $0 }.joined(separator: " ")
  }

  // MARK: - Stage view (JUN-79)

  /// Sends the current screen (and the line just spoken) to the stage page. Fire and forget:
  /// the stage never slows the worker down.
  private func postStage(said: String?) {
    guard Self.stageMirroring else { return }
    let stepInfo: OwlStageUpdate.Step? =
      if let process, let step, stageScreen.kind == "step" || stageScreen.kind == "check" {
        .init(processId: process.id, stepId: step.id, index: step.index, total: process.steps.count)
      } else { nil }
    let update = OwlStageUpdate(
      glassesId: Self.glassesID, employeeId: employee?.id, language: employee?.language,
      screen: stageScreen, said: said, step: stepInfo)
    let api = api
    Task.detached { try? await api.postStage(update) }
  }

  /// At most one camera frame a second while the camera is on and mirroring is on.
  private func startStageFrames() {
    stageFrameTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(1))
        guard let self, Self.stageMirroring, self.glassesOn, let camera = self.camera,
          let jpeg = camera.photoJPEG(maxSide: 640)
        else { continue }
        let api = self.api
        let glassesID = Self.glassesID
        try? await api.postStageFrame(jpeg, glassesID: glassesID)
      }
    }
  }

  // MARK: - Consent (JUN-80)

  private static func consentKey(_ employeeID: String) -> String { "owl.consent.\(employeeID)" }

  /// True when the worker has not answered yet. owl-api is asked first; the phone keeps the
  /// answer too, so Owl still knows it offline or with an older server.
  private func needsConsent(_ employee: OwlEmployee) async -> Bool {
    if let fromServer = try? await api.consent(employeeID: employee.id), fromServer.at != nil {
      consent = fromServer
      return false
    }
    if let data = UserDefaults.standard.data(forKey: Self.consentKey(employee.id)),
      let saved = try? JSONDecoder().decode(OwlConsent.self, from: data)
    {
      consent = saved
      // Tell owl-api what the worker already chose, so /check accepts the frames.
      _ = try? await api.setConsent(employeeID: employee.id, cameraChecks: saved.cameraChecks, recording: saved.recording)
      return false
    }
    return true
  }

  /// Explains on the display and aloud what the camera does, and lets the worker choose.
  private func askConsent(then next: @escaping @MainActor (OwlViewModel) async -> Void) async {
    guard let employee else { return }
    let lang = employee.language
    let lines = [
      "Owl looks only during a step, to check your work.", "Pictures are not saved.",
      "Nothing goes to Meta. Your data stays with your company.", "You can pause the camera any time.",
    ].map { self.t($0) }
    statusText = "Asking for camera consent"
    speaker.say(lines.joined(separator: " "))
    await showScreen(stage: .init(kind: "consent", title: self.t("Owl's camera"), text: lines.joined(separator: " "))) {
      OwlBasicScreens.consent(
        title: self.t("Owl's camera"), lines: lines,
        allowLabel: self.t("Allow checks"),
        declineLabel: self.t("No checks"),
        onAllow: self.action {
          await $0.saveConsent(cameraChecks: true, recording: $0.consent?.recording ?? false)
          $0.speaker.say("Thank you. Owl will check your work.")
          await next($0)
        },
        onDecline: self.action {
          await $0.saveConsent(cameraChecks: false, recording: $0.consent?.recording ?? false)
          $0.speaker.say("Okay. Owl will guide you without checks.")
          await next($0)
        })
    }
  }

  private func saveConsent(cameraChecks: Bool, recording: Bool) async {
    guard let employee else { return }
    let now = ISO8601DateFormatter().string(from: Date())
    var saved = OwlConsent(employeeId: employee.id, cameraChecks: cameraChecks, recording: recording, at: now)
    do {
      saved = try await api.setConsent(employeeID: employee.id, cameraChecks: cameraChecks, recording: recording)
    } catch {
      NSLog("[Owl] consent not stored on owl-api: \(error)")
    }
    consent = saved
    if let data = try? JSONEncoder().encode(saved) {
      UserDefaults.standard.set(data, forKey: Self.consentKey(employee.id))
    }
    NSLog("[Owl] consent: camera checks \(cameraChecks), recording \(recording)")
  }

  /// "Pause camera" / "Camera on" with one pinch.
  private func toggleCamera() async {
    cameraPaused.toggle()
    if cameraPaused {
      stopCheckLoop()
      closeCamera()
      speaker.say("Camera paused. Checks are off.")
      setStepStatus("Camera paused. Pinch Done when ready.")
    } else {
      speaker.say("Camera on. Owl is watching again.")
      await startCheckLoop()
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
      if access.audioFirst, let source = answer.sources.first {
        speaker.say("\(t("Source:")) \(source.doc)\(source.section.map { ", \($0)" } ?? "").", interrupt: false)
      }
      await showScreen(stage: .init(kind: "answer", title: question, text: answer.text + (answer.sources.first.map { " — \($0.doc)" } ?? ""))) {
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
    // The expert agrees that their clips are stored, and to warn people nearby (JUN-80).
    if consent?.recording != true, let employee {
      let lang = employee.language
      let lines = [
        "Your clips and voice are stored to teach new workers.", "Faces are blurred before anything is stored.",
        "Tell people nearby that you are filming.",
      ].map { self.t($0) }
      speaker.say(lines.joined(separator: " "))
      await showScreen(stage: .init(kind: "consent", title: self.t("Recording"), text: lines.joined(separator: " "))) {
        OwlBasicScreens.consent(
          title: self.t("Recording"), lines: lines,
          allowLabel: self.t("I agree"), declineLabel: self.t("Cancel"),
          onAllow: self.action {
            await $0.saveConsent(cameraChecks: $0.consent?.cameraChecks ?? false, recording: true)
            await $0.startRecording()
          },
          onDecline: self.action { await $0.showTasks() })
      }
      return
    }
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
    await showScreen(stage: .init(kind: "record", title: isRecordingStep ? "Recording step \(stepCount + 1)" : "Record: \(recording.title)", text: text)) {
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
  private func showScreen(stage: OwlStageScreen? = nil, _ make: @escaping @MainActor () -> FlexBox) async {
    onStepCard = false
    stageScreen = stage ?? OwlStageScreen(kind: "screen", title: statusText, text: nil)
    postStage(said: nil)
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
    case "progress": await showProgress()
    case "allow": await saveConsent(cameraChecks: true, recording: consent?.recording ?? false); await open()
    case "decline": await saveConsent(cameraChecks: false, recording: consent?.recording ?? false); await open()
    case "agreerecord": await saveConsent(cameraChecks: consent?.cameraChecks ?? false, recording: true)
    case "camera": await toggleCamera()
    case "forget": await forgetMe()
    case "resetconsent":
      if let id = employee?.id { UserDefaults.standard.removeObject(forKey: Self.consentKey(id)) }
      consent = nil
    case "mock": mockCheck = argument.isEmpty ? nil : argument
    case "wait": try? await Task.sleep(for: .seconds(Double(argument) ?? 1))
    default: NSLog("[Owl] test: unknown step \(name)")
    }
    NSLog("[Owl] test: now \(statusText)")
  }
}
#endif
