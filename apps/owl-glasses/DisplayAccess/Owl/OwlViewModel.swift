//
// OwlViewModel.swift
//
// Owl Boarding on the glasses (JUN-29). The worker never takes out the phone:
// "Hey Meta, start Owl" opens Owl on the display, buttons are picked with the Neural Band,
// questions are spoken into the glasses and answers come on the display and in the
// glasses speakers. The phone in the pocket only computes and talks to owl-api.
//
//   Learn & Check: step cards, Owl Check on camera stream frames, "Watch how" clips.
//   Ask (JUN-31): glasses speech → POST /ask → display + voice.
//   Help (JUN-33): frames to a remote expert, expert messages spoken and shown.
//   Record (JUN-32): pinch per step → stream clip + reference frame + narration → owl-api.
//
// Screens come from `OwlScreens` (JUN-36). Two rules run through the flow (JUN-57):
//
// - A step with a check is done only when a final check on a picture taken after the
//   worker's pinch says so. When Owl cannot check, the worker can still go on, and the
//   summary says which steps were not verified.
// - Work that was started for one screen never changes the next one. Every flow takes a
//   scene number when it starts and drops its answers once the number has moved on
//   (`scene`), and a check answer counts only for the ticket it was asked with (`ticket`).
//

import Foundation
import MWDATCore
import MWDATDisplay
import Observation
import UIKit

/// What the phone shows about Owl on the glasses (JUN-42): the state the glasses are in, in
/// plain words for the employer who holds the phone.
struct OwlPhoneState: Equatable, Sendable {
  enum Tone: Sendable {
    case attention
    case problem
  }

  let title: String
  let detail: String
  /// SF Symbol name.
  let symbol: String
  let tone: Tone
}

@Observable
@MainActor
final class OwlViewModel {
  static let employeeIDKey = "owl.employeeID"
  static let glassesIDKey = "owl.glassesID"
  private static let checkInterval: Duration = .milliseconds(1500)
  private static let helpInterval: Duration = .seconds(2)
  /// The longest a worker waits for a final check before Owl says it cannot check.
  private static let finalCheckLimit: Duration = .seconds(9)

  private(set) var statusText = "Ready"
  private(set) var employee: OwlEmployee?
  private(set) var processes: [OwlProcess] = []
  private(set) var isOffline = false
  private(set) var glassesOn = true
  private(set) var lastHeard: String?
  /// What is in the way right now, for the phone. Nil when all is well.
  private(set) var phoneState: OwlPhoneState?

  @ObservationIgnored let displayViewModel: DisplayViewModel
  @ObservationIgnored private let wearables: WearablesInterface
  @ObservationIgnored let speaker = OwlSpeaker()
  @ObservationIgnored let invocations: OwlInvocations
  @ObservationIgnored private let listener: OwlListener
  @ObservationIgnored private var camera: OwlCamera?
  /// When Owl itself last changed the step or correction card under the worker's finger.
  @ObservationIgnored private var cardSwappedAt: ContinuousClock.Instant?
  /// Set when the check answers of this run are scripted (demo mode) or samples (mock), so
  /// the display says so.
  @ObservationIgnored private var unrealSource: OwlUnrealSource?
  /// The upload of the step that was just recorded, so the expert can give it up (Record).
  @ObservationIgnored private var stepUpload: Task<OwlRecording, Error>?
  /// Step uploads the expert gave up that owl-api has not been told about yet. They are sent
  /// before anything else of the recording, so a step that was taken back is never in the task.
  @ObservationIgnored private var droppedSteps: [String] = []
  @ObservationIgnored private var cameraDenied = false
  /// What the worker agreed to (JUN-80). Without camera checks Owl is a guide without checks.
  private(set) var consent: OwlConsent?
  /// The worker paused the camera with one pinch; checks stay off until they turn it on.
  private(set) var cameraPaused = false
  /// Where the worker is during training (JUN-97). Nil or `tracking == false` outside the
  /// training period or without the worker's consent.
  @ObservationIgnored private var whereabouts: OwlLocation?
  @ObservationIgnored private var lockTask: Task<Void, Never>?
  /// The worker's training period, read when Owl opens (JUN-96, JUN-98).
  @ObservationIgnored private var training: OwlTraining?
  /// Customer service mode (JUN-98). The conversation is only in memory and only while the
  /// mode is on.
  @ObservationIgnored private var conversation = OwlConversation()
  @ObservationIgnored private var assistHint: OwlAssist?
  @ObservationIgnored private var assistBusy = false
  @ObservationIgnored private var assistAuto = false
  @ObservationIgnored private var assistScene: Int?
  @ObservationIgnored private var autoHintTask: Task<Void, Never>?
  @ObservationIgnored private var assistDrawnAt = Date.distantPast
  @ObservationIgnored private var lastHintAt: Date?
  /// Help was called from customer service: the counter comes back after the call.
  @ObservationIgnored private var helpFromCounter = false
  /// Owl's own spoken words are not the customer's: the mic hears them until about then.
  @ObservationIgnored private var assistQuietUntil = Date.distantPast
  private var checksAllowed: Bool { consent?.cameraChecks == true && !cameraPaused }
  /// The worker's inclusive profile (JUN-81).
  private var access: OwlAccess { employee?.access ?? OwlAccess() }
  /// True while the step card is on the display, so display-first captions can go on it.
  @ObservationIgnored private var onStepCard = false
  /// Display-first: the last spoken line, shown on the step card under what Owl knows.
  @ObservationIgnored private var lastCaption: String?
  /// What the display shows now, for the stage page (JUN-79).
  @ObservationIgnored private var stageScreen = OwlStageScreen(kind: "start", title: "Owl Boarding", text: nil)
  @ObservationIgnored private var stageFrameTask: Task<Void, Never>?
  /// Step recognition (JUN-34): short clips while a step runs, only as a hint.
  @ObservationIgnored private var recognizeTask: Task<Void, Never>?
  @ObservationIgnored private var suggestedStepID: String?
  @ObservationIgnored private var images: [String: UIImage] = [:]
  @ObservationIgnored private var welcomed = false
  @ObservationIgnored private var glassesNotAssigned = false
  @ObservationIgnored private var deviceStateToken: AnyListenerToken?
  @ObservationIgnored private var watchedDevice: DeviceIdentifier?

  /// Grows whenever the glasses move to another kind of screen: a step, Ask, Help, a clip,
  /// the task list, a problem. Work started for the old screen compares its own number when
  /// its answer arrives and drops the answer if the number has moved on, so a late check,
  /// download or spoken line never changes the new screen, its focus or the run.
  @ObservationIgnored private var scene = 0
  /// What the display shows now, so it can be sent again (glasses back on, display woke).
  @ObservationIgnored private var currentScreen: (() async -> Void)?

  // Learn & Check
  @ObservationIgnored private var process: OwlProcess?
  @ObservationIgnored private var stepIndex = 0
  @ObservationIgnored private var runID = UUID().uuidString
  /// How every step of this run ended. Only a passed final check writes "verified".
  @ObservationIgnored private var log = OwlRunLog(runID: "")
  /// The step being checked and the attempt at it. Nil when no step is on screen. A check
  /// answer counts only if it carries this exact ticket.
  @ObservationIgnored private var ticket: OwlCheckTicket?
  @ObservationIgnored private var attempt = 0
  /// Which card of the step is on the display.
  @ObservationIgnored private var card: StepCard = .step
  @ObservationIgnored private var live: OwlLive = .noCheck
  /// What Owl saw that needs fixing. Shown on the correction card.
  @ObservationIgnored private var correction: OwlCheckResult?
  /// The problem Owl has already said out loud, so each one is said once.
  @ObservationIgnored private var announced: String?
  /// The problem whose card the worker closed. It is not put back in front of them unasked.
  @ObservationIgnored private var dismissed: String?
  @ObservationIgnored private var saidLooksRight = false
  @ObservationIgnored private var checkTask: Task<Void, Never>?
  @ObservationIgnored private var checkFailures = 0
  /// When to send the next live frame (JUN-82), from the last answer's `next_check_ms`.
  @ObservationIgnored private var nextCheckDelay: Duration? = checkInterval
  /// Performance numbers for JUN-82: frames sent in the current task, and since when.
  @ObservationIgnored private var framesSent = 0
  @ObservationIgnored private var framesSince = ContinuousClock.now
  /// The attempt whose final check is running, or nil.
  @ObservationIgnored private var finishingAttempt: Int?
  @ObservationIgnored private var isPlayingClip = false

  // Help
  @ObservationIgnored private var helpID: String?
  @ObservationIgnored private var helpTask: Task<Void, Never>?
  @ObservationIgnored private var lastSpokenExpertMessage = 0
  // Help from the shift manager (JUN-100), the worker's side.
  /// `manager` while the call goes to the shift manager's glasses.
  @ObservationIgnored private var helpTo: String?
  @ObservationIgnored private var helpManagerName: String?
  @ObservationIgnored private var helpDrawn: String?
  @ObservationIgnored private var saidNoAnswer = false
  /// What the worker said back, shown under the manager's words.
  @ObservationIgnored private var helpHeard: String?
  @ObservationIgnored private var helpSession: OwlHelpSession?
  @ObservationIgnored private var helpMarked: UIImage?
  // The manager's side.
  @ObservationIgnored private var incomingTask: Task<Void, Never>?
  @ObservationIgnored private var ringingShown: String?
  @ObservationIgnored private var incomingScene: Int?
  @ObservationIgnored private var callID: String?
  @ObservationIgnored private var callTask: Task<Void, Never>?
  @ObservationIgnored private var callWorker = ""
  @ObservationIgnored private var callPlace: String?
  @ObservationIgnored private var callFrame: UIImage?
  @ObservationIgnored private var callFrameAt: String?
  @ObservationIgnored private var callWorkerSaid: String?
  @ObservationIgnored private var callListening = false
  @ObservationIgnored private var callHeard: String?
  @ObservationIgnored private var helpEndedWhileOff = false

  // Record
  @ObservationIgnored private var recording: OwlRecording?
  @ObservationIgnored private var isRecordingStep = false
  @ObservationIgnored private var narration: [String] = []

  /// For the simulator only: forces a `/check` answer from the mock API (`ok`, `warning`, ...).
  @ObservationIgnored var mockCheck: String? = ProcessInfo.processInfo.environment["OWL_MOCK_CHECK"]

  private enum StepCard: Equatable {
    case step
    /// The step opens only at its checkpoint (JUN-97).
    case locked
    case correction
    case checking
    case cannotCheck(OwlCheckBlock, String?)
  }

  init(displayViewModel: DisplayViewModel, wearables: WearablesInterface) {
    self.displayViewModel = displayViewModel
    self.wearables = wearables
    self.invocations = OwlInvocations(wearables: wearables)
    self.listener = OwlListener(wearables: wearables)
    OwlCamera.removeLeftoverClips()
    // The first screen is drawn before owl-api has said who wears the glasses: the last
    // worker's language if there was one, otherwise the phone's.
    if let last = savedTasks()?.employee {
      speaker.language = last.language
      OwlStrings.language = last.language
      OwlStrings.easy = last.access?.easyLanguage == true
    } else {
      usePhoneLanguage()
    }

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

  /// "Stage mirroring" (JUN-79): the glasses screen, spoken lines and one camera frame a second
  /// go to owl-api's stage page for the audience. Off by default; OWL_STAGE=1 turns it on.
  static var stageMirroring: Bool {
    get {
      ProcessInfo.processInfo.environment["OWL_STAGE"] == "1"
        || UserDefaults.standard.bool(forKey: "owl.stageMirroring")
    }
    set { UserDefaults.standard.set(newValue, forKey: "owl.stageMirroring") }
  }

  /// Optional override for testing: a fixed employee instead of the glasses' assignment.
  static var employeeID: String {
    get { UserDefaults.standard.string(forKey: employeeIDKey) ?? "" }
    set { UserDefaults.standard.set(newValue, forKey: employeeIDKey) }
  }

  private var api: OwlAPI { OwlAPI() }
  private var language: String? { employee?.language }
  private var step: OwlStep? {
    guard let process, process.steps.indices.contains(stepIndex) else { return nil }
    return process.steps[stepIndex]
  }

  // MARK: - Scenes

  /// Starts a new scene: whatever was running for the last one is stopped or will be ignored.
  @discardableResult
  private func newScene() -> Int {
    scene += 1
    ticket = nil
    finishingAttempt = nil
    onStepCard = false
    stopCheckLoop()
    stopRecognition()
    stopLocked()
    if isPlayingClip {
      // Playback stops when the worker moves on (JUN-56).
      isPlayingClip = false
      Task { await displayViewModel.stopVideo() }
    }
    return scene
  }

  private func isCurrent(_ number: Int) -> Bool {
    number == scene
  }

  // MARK: - Open

  /// Opens Owl on the glasses: the welcome on the first start, otherwise the task list.
  /// Returns false when the display could not be reached.
  @discardableResult
  func open(deviceIdentifier: DeviceIdentifier? = nil) async -> Bool {
    stopEverything()
    let number = newScene()
    await show(
      OwlScreens.status(
        "Owl Boarding", detail: OwlStrings.gettingTasks, mood: .listening, leave: OwlStrings.tryAgain,
        leaveIcon: .twoArrowsClockwise, onCancel: waitAction { await $0.open() }),
      deviceIdentifier: deviceIdentifier)
    watchGlasses()
    await loadTasks()
    guard isCurrent(number) else { return displayViewModel.isConnected }
    if glassesNotAssigned {
      await showProblem(.notAssigned, retry: { await $0.open() })
      return displayViewModel.isConnected
    }
    // A shift manager's glasses wait for help requests (JUN-100).
    if employee?.shiftManager == true {
      startIncomingPoll()
      await showManagerHome()
      return displayViewModel.isConnected
    }
    if let employee, await needsConsent(employee) {
      guard isCurrent(number) else { return displayViewModel.isConnected }
      await askConsent(then: { await $0.open() })
      return displayViewModel.isConnected
    }
    guard isCurrent(number) else { return displayViewModel.isConnected }
    // The end of the training period: the worker sees the result before anything else, and
    // before the trainer sees it in Studio (JUN-96).
    let training = if let employee { try? await api.training(employeeID: employee.id) } else { nil as OwlTraining? }
    self.training = training
    guard isCurrent(number) else { return displayViewModel.isConnected }
    if let employee, let training, training.result != nil, !trainingResultSeen(employee.id, training) {
      await showTrainingResult(training, then: { await $0.open() })
      return displayViewModel.isConnected
    }
    // During training, location is asked once, on its own screen (JUN-97), and only when one
    // of the worker's tasks has a place to go to.
    let hasCheckpoints = myProcesses.contains { $0.steps.contains { $0.checkpoint != nil } }
    if let employee, training?.active == true, hasCheckpoints, !locationAsked(employee.id) {
      await askLocationConsent(then: { await $0.open() })
      return displayViewModel.isConnected
    }
    await refreshLocation()
    guard isCurrent(number) else { return displayViewModel.isConnected }
    if !welcomed, let employee {
      welcomed = true
      statusText = "Welcome, \(employee.name)"
      // The welcome can be in another language than the rest (JUN-108): its own voice.
      if let welcome = employee.welcome {
        speaker.say(welcome, language: employee.welcomeLanguage)
      } else {
        speaker.say(OwlStrings.welcomeBody)
      }
      sayChoices(OwlStrings.sayPinchToStart)
      await showScreen(stage: .init(kind: "welcome", title: OwlStrings.welcome(employee.name), text: employee.welcome)) {
        OwlScreens.welcome(employee: employee, onStart: self.action { await $0.showTasks(refresh: false) })
      }
    } else {
      await showTasks(refresh: false)
    }
    return displayViewModel.isConnected
  }

  /// The published tasks assigned to this worker in Owl Studio (`process_ids`), in that
  /// order: publishing a task and giving it to a worker are two steps (JUN-74). With no
  /// worker known, every published task.
  var myProcesses: [OwlProcess] {
    let published = processes.filter(\.isPublished)
    guard let employee else { return published }
    return employee.processIds.compactMap { id in published.first { $0.id == id } }
  }

  /// The task list. With `refresh` it asks owl-api again, so a task that was published and
  /// assigned a minute ago shows up when the worker comes back to the list.
  func showTasks(refresh: Bool = true) async {
    stopEverything()
    let number = newScene()
    process = nil
    await drawTasks(readAloud: true)
    guard refresh else { return }
    let before = tasksShown
    let wearer = employee?.id
    await loadTasks()
    guard isCurrent(number) else { return }
    if glassesNotAssigned {
      // The glasses were taken from this worker in Owl Studio while the list was open.
      await showProblem(.notAssigned, retry: { await $0.open() })
    } else if employee?.id != wearer {
      // Someone else wears the glasses now: their consent and their welcome come first.
      await open()
    } else if tasksShown != before {
      // Anything the list shows has changed: a task added, removed, renamed or re-recorded,
      // the worker's language or profile, or the connection. The display has no way to keep
      // the focus where it was, so the list is redrawn only then.
      await drawTasks(readAloud: false)
    }
  }

  /// Everything the task list shows, as one value to compare: who it is for, their language
  /// and profile, each task's title, steps and expert, and whether owl-api answered.
  private var tasksShown: [String] {
    let who = [
      employee?.name, employee?.company, employee?.language, OwlStrings.easy ? "easy" : nil,
      access.audioFirst ? "audio" : nil, access.displayFirst ? "display" : nil,
    ].map { $0 ?? "" }
    let tasks = myProcesses.map { "\($0.id)|\($0.title)|\($0.steps.count)|\($0.expert ?? "")" }
    return who + tasks + [isOffline ? "offline" : "online"]
  }

  private func drawTasks(readAloud: Bool) async {
    let tasks = myProcesses
    let offersCustomerService = training?.offersCustomerService == true
    let employee = employee
    let offline = isOffline
    statusText = offline ? "Offline: \(tasks.count) saved tasks" : "\(tasks.count) tasks"
    if readAloud, access.audioFirst, !tasks.isEmpty {
      speaker.say(OwlStrings.yourTasks + ": " + tasks.map(\.title).joined(separator: ". ") + ".", interrupt: false)
      sayChoices(OwlStrings.sayPinchToOpen(tasks.count))
    }
    let select: @Sendable (String) -> Void = { [weak self] id in
      Task { @MainActor in await self?.startProcess(id) }
    }
    await showScreen(stage: .init(kind: "tasks", title: OwlStrings.yourTasks, text: tasks.map(\.title).joined(separator: " · "))) {
      OwlScreens.taskList(
        employee: employee, processes: tasks, offline: offline, onSelect: select,
        onRecord: self.action { await $0.startRecording() },
        onProgress: employee == nil ? nil : self.action { await $0.showProgress() },
        onRetry: self.action { await $0.showTasks() },
        onCustomerService: offersCustomerService ? self.action { await $0.startCustomerService() } : nil)
    }
  }

  private func loadTasks() async {
    glassesNotAssigned = false
    var fresh: OwlEmployee?
    do {
      let employeeID = Self.employeeID.trimmingCharacters(in: .whitespaces)
      let glassesID = Self.glassesID.trimmingCharacters(in: .whitespaces)
      let employee =
        employeeID.isEmpty
        ? try await api.employee(forGlasses: glassesID) : try await api.employee(employeeID)
      fresh = employee
      if employee.id != self.employee?.id { welcomed = false }
      // Steps in the worker's own language when the process has a translation; easy-language
      // workers ask for the `-x-easy` version, and get the original when there is none.
      let processes = try await api.processes(
        language: employee.access?.easyLanguage == true ? "\(employee.language)-x-easy" : employee.language)
      self.employee = employee
      self.processes = processes
      isOffline = false
      OwlCache.save(employee: employee, processes: processes, glassesID: glassesID, employeeID: employeeID)
      use(employee)
      keepStepPictures()
      phoneState = nil
    } catch OwlError.glassesNotAssigned {
      NSLog("[Owl] glasses \(Self.glassesID) are not assigned")
      glassesNotAssigned = true
      employee = nil
      processes = []
      // Nobody's glasses: not the last worker's language, the phone's.
      usePhoneLanguage()
    } catch {
      NSLog("[Owl] loading tasks failed: \(error)")
      isOffline = (error as? OwlError)?.isServiceProblem ?? true
      // No network: saved tasks still work (spec), without Owl Check. They are reused only
      // for the worker they were saved for: on a shared pair of glasses, one worker never
      // gets another worker's list.
      let known = fresh ?? employee
      if let cached = savedTasks(), known == nil || cached.employee.id == known?.id {
        employee = fresh ?? cached.employee
        processes = cached.processes
      } else if let fresh {
        employee = fresh
        processes = []
      }
      if let employee { use(employee) }
      phoneState = Self.phoneState(for: kind(of: error), detail: nil)
    }
  }

  /// The tasks saved on this phone for the glasses and worker it is set up for now.
  private func savedTasks() -> (employee: OwlEmployee, processes: [OwlProcess])? {
    OwlCache.load(
      glassesID: Self.glassesID.trimmingCharacters(in: .whitespaces),
      employeeID: Self.employeeID.trimmingCharacters(in: .whitespaces))
  }

  /// The worker's language and profile, for the voice and for the screens' own words.
  private func use(_ employee: OwlEmployee) {
    speaker.language = employee.language
    OwlStrings.language = employee.language
    // The screens' own words follow the easy-language profile too, not only what Owl says.
    OwlStrings.easy = employee.access?.easyLanguage == true
    applyProfile(employee)
  }

  /// With no worker known, Owl's own words follow the phone: Finnish on a Finnish phone,
  /// otherwise English.
  private func usePhoneLanguage() {
    let language = Locale.preferredLanguages.first?.hasPrefix("fi") == true ? "fi" : "en"
    speaker.language = language
    OwlStrings.language = language
    OwlStrings.easy = false
  }

  // MARK: - Learn & Check

  func startProcess(_ id: String) async {
    guard let process = processes.first(where: { $0.id == id }) else { return }
    stopEverything()
    self.process = process
    stepIndex = 0
    runID = UUID().uuidString
    log = OwlRunLog(runID: runID)
    attempt = 0
    framesSent = 0
    framesSince = .now
    await openStep(speak: true)
  }

  /// Shows the current step and starts watching it. `speak` is false when the worker comes
  /// back to a step they have already heard (after Ask, Help or a clip). `after` is said
  /// first, in the same breath ("Step done.").
  private func openStep(speak: Bool, after: String? = nil) async {
    // The worker pinched Done while Owl said "Looks like step N", and this is step N:
    // tell the server, so it learns from the confirmed view (JUN-34).
    if let suggested = suggestedStepID, let process, let step, step.id == suggested {
      let api = api
      let runID = runID
      Task.detached { try? await api.confirmStep(runID: runID, processID: process.id, stepID: suggested) }
      NSLog("[Owl] recognize: worker confirmed \(suggested)")
    }
    guard let process, let step else { return }
    let number = newScene()
    attempt += 1
    ticket = OwlCheckTicket(runID: runID, stepID: step.id, attempt: attempt)
    card = .step
    correction = nil
    announced = nil
    dismissed = nil
    saidLooksRight = false
    checkFailures = 0
    lastCaption = nil
    live = step.check.usesCamera ? .starting : .noCheck
    statusText = "Step \(step.index)/\(process.steps.count): \(step.title)"
    let words = [after, speak ? step.say : nil].compactMap { $0 }.joined(separator: " ")
    if !words.isEmpty { speaker.say(words) }
    if speak, access.audioFirst {
      speaker.say(readAloud(step), interrupt: false)
      // On the first step of a task the buttons are named once.
      if stepIndex == 0 {
        let others = [
          step.clipUrl == nil ? nil : OwlStrings.watchHow, OwlStrings.ask, OwlStrings.help,
          consent?.cameraChecks == true && step.check.usesCamera ? OwlStrings.pauseCamera : nil,
        ].compactMap { $0 }
        sayChoices(OwlStrings.sayStepButtons(others))
      }
    }
    if step.checkpoint != nil, whereabouts?.tracking == true {
      // Help or the trainer may have opened it meanwhile.
      await refreshLocation()
      guard isCurrent(number) else { return }
    }
    if isLocked(step) {
      card = .locked
      live = .noCheck
      statusText = "Step \(step.index) locked: go to \(step.checkpoint?.label ?? "")"
      await render(number)
      guard isCurrent(number) else { return }
      await startLocked(number)
      return
    }
    await render(number)
    guard isCurrent(number) else { return }
    if step.check.usesCamera {
      await startWatching(number)
    } else if !recognizes(step) {
      // No check in this step: no frames, and the stream is off to save battery (JUN-82),
      // unless step recognition needs it.
      closeCamera()
    }
    guard isCurrent(number) else { return }
    if recognizes(step) { await startRecognition(number) }
  }

  private func backToStep() async {
    await openStep(speak: false)
  }

  /// Draws the card of the current step. Reads the state after every wait, so it always
  /// draws what is true now.
  private func render(_ number: Int) async {
    guard isCurrent(number), let process, let step else { return }
    let image = await image(step.referenceImageUrl)
    guard isCurrent(number), self.step?.id == step.id else { return }
    if card == .correction, correction == nil { card = .step }
    let place = "Step \(step.index)/\(process.steps.count) · \(step.title)"
    switch card {
    case .locked:
      let label = step.checkpoint?.label ?? ""
      await showScreen(stage: .init(kind: "locked", title: OwlStrings.goTo(label), text: place)) {
        OwlScreens.goTo(
          process: process, step: step, label: label, image: image,
          onHelp: self.cardAction { await $0.startHelp() },
          onHome: self.action { await $0.showTasks() })
      }
    case .checking:
      await showScreen(stage: .init(kind: "check", title: OwlStrings.checking, text: place)) {
        OwlScreens.checking(step: step, onBack: self.action { await $0.cancelFinalCheck() })
      }
    case .cannotCheck(let why, let hint):
      // Without a camera there is nothing to try again.
      let canRetry = why != .cameraOff
      await showScreen(stage: .init(kind: "check", title: OwlStrings.cannotCheck, text: hint ?? OwlStrings.cannotCheckBody(why))) {
        OwlScreens.cannotCheck(
          step: step, why: why, hint: hint,
          onCheckAgain: canRetry ? self.action { await $0.finishStep() } : nil,
          onContinue: self.action { await $0.continueUnverified(why) },
          onBack: self.action { await $0.closeCard() })
      }
    case .correction:
      guard let correction else { return }
      let rows = (correction.lines ?? []).map { "\($0.isOK ? "✓" : "✗") \($0.name) \($0.seen)/\($0.expected)" }
      await showScreen(stage: .init(kind: "check", title: OwlStrings.correctionTitle(correction), text: rows.isEmpty ? correction.text : rows.joined(separator: " · "))) {
        // "Check again" and the step card's "Done" are the same action, so a pinch that lands
        // just as the card changes still means what the worker meant: check this step.
        OwlScreens.correction(
          process: process, step: step, result: correction, image: image,
          onCheckAgain: self.cardAction { await $0.finishStep() },
          onBack: self.cardAction { await $0.closeCard() })
      }
    case .step:
      let live = live
      let log = log
      let caption = captionLine
      let cameraOn: Bool? = step.check.usesCamera && consent?.cameraChecks == true ? !cameraPaused : nil
      let stage = OwlStageScreen(
        kind: "step", title: place,
        text: [step.instruction, OwlScreens.liveLine(live), caption].compactMap { $0 }.joined(separator: " · "))
      let unreal = unrealSource
      let tracking = trackingLine
      await showScreen(stage: stage) {
        OwlScreens.step(
          process: process, step: step, image: image, live: live, log: log,
          onDone: self.cardAction { await $0.finishStep() },
          onWatch: step.clipUrl == nil ? nil : self.cardAction { await $0.watchHow() },
          onAsk: self.cardAction { await $0.ask() },
          onHelp: self.cardAction { await $0.startHelp() },
          caption: caption, cameraOn: cameraOn, onCamera: self.cardAction { await $0.toggleCamera() },
          unreal: unreal, tracking: tracking)
      }
      onStepCard = true
    }
  }

  /// Changes what Owl knows about the step. The step card is drawn again only when it is
  /// the card on screen and the state really changed.
  private func setLive(_ new: OwlLive, _ number: Int) async {
    guard isCurrent(number), new != live else { return }
    live = new
    if card == .step { await render(number) }
  }

  private func startWatching(_ number: Int) async {
    checkTask?.cancel()
    guard checksAllowed else {
      // No consent, or paused: the camera stays off and the worker confirms with Done.
      closeCamera()
      await setLive(.blocked(cameraPaused ? .cameraPaused : .checksOff), number)
      return
    }
    guard let camera = await openCamera() else {
      guard isCurrent(number) else { return }
      phoneState = Self.phoneState(for: cameraDenied ? .cameraNeeded : .other, detail: "The glasses camera did not start.")
      await setLive(.blocked(cameraDenied ? .cameraOff : .cameraFailed), number)
      return
    }
    guard isCurrent(number) else { return }
    // When the tasks came from the phone's memory because owl-api did not answer, the card
    // says so from its first moment, not "Owl is watching". Owl keeps trying all the same.
    await setLive(isOffline ? .blocked(.offline) : .watching, number)
    nextCheckDelay = Self.checkInterval
    checkTask = Task { [weak self] in
      while !Task.isCancelled {
        // Owl looks only as often as the moment needs (JUN-82): owl-api says when to look again.
        guard let delay = self?.nextCheckDelay else {
          NSLog("[Owl] check: server says no more checks until the next step or a pinch")
          return
        }
        try? await Task.sleep(for: delay)
        guard let self, !Task.isCancelled, self.isCurrent(number) else { return }
        // Owl keeps watching while a correction is shown, so it notices the fix by itself.
        guard self.glassesOn, self.finishingAttempt == nil, let ticket = self.ticket else { continue }
        guard let frame = camera.latestJPEG() else {
          NSLog("[Owl] check: no fresh camera frame")
          continue
        }
        await self.liveCheck(frame, ticket: ticket, number)
      }
    }
  }

  private func stopCheckLoop() {
    checkTask?.cancel()
    checkTask = nil
  }

  /// One stream frame while the worker works. Its answer is used only if nothing has
  /// changed since it was asked: same scene, same ticket, no final check under way.
  private func liveCheck(_ frame: OwlFrame, ticket: OwlCheckTicket, _ number: Int) async {
    guard let process, let step, step.id == ticket.stepID else { return }
    do {
      let sentAt = ContinuousClock.now
      let result = try await api.check(
        frame: frame, processID: process.id, stepID: step.id, runID: runID, final: false,
        language: language, employeeID: employee?.id, mock: mockCheck)
      logCheck(step, frame: frame, sentAt: sentAt, result: result, final: false)
      guard isCurrent(number), OwlCheckRules.isCurrent(ticket, self.ticket), finishingAttempt == nil else {
        NSLog("[Owl] check \(step.id): a late live answer was dropped")
        return
      }
      checkFailures = 0
      isOffline = false
      // A server that does not pace the checks gets the default interval.
      nextCheckDelay = result.nextCheckMs.map { .milliseconds($0) } ?? Self.checkInterval
      await applyLive(result, number)
    } catch {
      guard isCurrent(number), OwlCheckRules.isCurrent(ticket, self.ticket) else { return }
      if case .consentRequired = error as? OwlError {
        await checksRefused(number)
        return
      }
      if case .rateLimited = error as? OwlError { return }
      checkFailures += 1
      NSLog("[Owl] check failed (\(checkFailures)): \(error)")
      if checkFailures >= 3 {
        // The server or the network is down. Owl says it cannot check and keeps trying
        // quietly; the step is never shown as verified (contract: 500, 502, 503, no answer).
        phoneState = Self.phoneState(for: kind(of: error), detail: nil)
        await setLive(.blocked(block(for: error)), number)
      }
    }
  }

  /// owl-api has no consent on record (JUN-80): stop checking, keep guiding.
  private func checksRefused(_ number: Int) async {
    NSLog("[Owl] check refused: consent required")
    if let employee {
      consent = OwlConsent(
        employeeId: employee.id, cameraChecks: false, recording: consent?.recording ?? false, at: consent?.at,
        location: consent?.location)
    }
    stopCheckLoop()
    closeCamera()
    correction = nil
    card = .step
    live = .blocked(.checksOff)
    await render(number)
  }

  /// The numbers behind JUN-82: frame size, round trip, when to look again, frames a minute.
  private func logCheck(_ step: OwlStep, frame: OwlFrame, sentAt: ContinuousClock.Instant, result: OwlCheckResult, final: Bool) {
    unrealSource = OwlCheckRules.unrealSource(decidedBy: result.decidedBy)
    framesSent += 1
    let minutes = max((ContinuousClock.now - framesSince) / .seconds(60), 1.0 / 60)
    NSLog(
      "[Owl] check \(step.id) \(final ? "final" : "live"): \(result.status) · perf: \(frame.byteCount / 1024) KB, round trip \(Int((ContinuousClock.now - sentAt) / .milliseconds(1))) ms, next \(result.nextCheckMs.map { "\($0) ms" } ?? "none"), \(String(format: "%.1f", Double(framesSent) / minutes)) frames/min")
  }

  private func applyLive(_ result: OwlCheckResult, _ number: Int) async {
    if phoneState != nil, glassesOn { phoneState = nil }
    switch result.status {
    case "warning":
      let signature = OwlCheckRules.signature(result)
      if signature == dismissed {
        // The worker closed this card. Owl keeps the hint on the step card and waits.
        await setLive(.needsFix(OwlStrings.correctionTitle(result)), number)
        return
      }
      dismissed = nil
      announce(result)
      // Draw the card for a new problem; one that is already on the card stays as it is.
      let shown = correction.map(OwlCheckRules.signature)
      guard shown != signature, card == .step || card == .correction else { return }
      correction = result
      card = .correction
      // Owl changed the card by itself: a pinch already on its way was aimed at the old one.
      cardSwappedAt = .now
      statusText = "Check this: \(result.text ?? result.problem ?? "")"
      await render(number)
    case "ok":
      if correction != nil || dismissed != nil {
        // The worker fixed it. Owl says so and goes back to the step. The step is still not
        // done: Done asks for the check that counts.
        correction = nil
        announced = nil
        dismissed = nil
        saidLooksRight = true
        speaker.say(OwlStrings.liveFixed)
        live = .looksRight
        if card == .correction {
          card = .step
          cardSwappedAt = .now
        }
        statusText = "Fixed. Waiting for Done."
        if card == .step { await render(number) }
      } else {
        if !saidLooksRight {
          saidLooksRight = true
          speaker.say(OwlStrings.liveLooksRight)
        }
        await setLive(.looksRight, number)
      }
    case "checking":
      // Seen once, waiting for the next frame. Nothing to show yet.
      break
    default:
      if correction == nil { await setLive(.cantSee(result.hint), number) }
    }
  }

  /// Says a problem once, however many frames show it. Audio-first workers also hear the
  /// rows, so nothing is only on the display (JUN-81).
  private func announce(_ result: OwlCheckResult) {
    let signature = OwlCheckRules.signature(result)
    guard signature != announced else { return }
    announced = signature
    if let say = result.say { speaker.say(say) }
    if access.audioFirst, let lines = result.lines, !lines.isEmpty {
      let rows = lines.map { "\($0.name): \($0.seen) / \($0.expected)\($0.note.map { ", \($0)" } ?? "")." }
      speaker.say(rows.joined(separator: " "), interrupt: false)
    }
    if result.status == "warning" { sayChoices(OwlStrings.sayFixThenPinch) }
  }

  /// "Back" on a correction or a cannot-check card: back to the step card, same task, same
  /// step.
  private func closeCard() async {
    if card == .correction, let correction {
      dismissed = OwlCheckRules.signature(correction)
      live = .needsFix(OwlStrings.correctionTitle(correction))
    }
    correction = nil
    card = .step
    await render(scene)
  }

  /// "Back" while a final check runs: the answer, when it comes, belongs to an old attempt
  /// and is ignored.
  private func cancelFinalCheck() async {
    guard let step, finishingAttempt != nil else { return }
    finishingAttempt = nil
    attempt += 1
    ticket = OwlCheckTicket(runID: runID, stepID: step.id, attempt: attempt)
    card = correction == nil ? .step : .correction
    await render(scene)
  }

  /// The worker's "Done" or "Check again" pinch. A step with a check is done only when a
  /// final check on a picture taken after this pinch passes. When Owl cannot check, the
  /// worker chooses between checking again and continuing unverified.
  private func finishStep() async {
    NSLog("[Owl] finish step \(step?.id ?? "")")
    guard let step, finishingAttempt == nil else { return }
    let number = scene
    guard step.check.usesCamera else {
      log.confirm(step)
      await nextStep()
      return
    }
    if case .blocked(let why) = live {
      if why.isWorkersChoice {
        // The worker switched the checks off (JUN-80). Done goes on; the summary says so.
        log.continueUnverified(step, why: why)
        NSLog("[Owl] step \(step.id) done without a check (\(why.rawValue))")
        await nextStep()
        return
      }
      if why == .cameraOff || why == .cameraFailed, camera == nil {
        card = .cannotCheck(why, nil)
        await render(number)
        return
      }
    }
    // A new attempt: answers still on their way for the old one no longer count.
    attempt += 1
    let ticket = OwlCheckTicket(runID: runID, stepID: step.id, attempt: attempt)
    self.ticket = ticket
    finishingAttempt = attempt
    let pinched = Date()
    card = .checking
    await render(number)

    let (result, failure) = await finalCheck(after: pinched, ticket: ticket)
    if finishingAttempt == ticket.attempt { finishingAttempt = nil }
    guard isCurrent(number) else { return }

    switch OwlCheckRules.verdict(result: result, failure: failure, ticket: ticket, current: self.ticket) {
    case .stale:
      // The worker pressed Back or left the step while Owl was checking.
      NSLog("[Owl] check \(step.id) final: a late answer was dropped")
    case .verified:
      guard let result, log.verify(step, result: result, ticket: ticket, current: self.ticket) else { return }
      NSLog("[Owl] check \(step.id) final: verified")
      phoneState = nil
      // ✓ on the step's bar, and the small hoot (JUN-108).
      speaker.hoot()
      await nextStep(after: result.say)
    case .problem:
      guard let result else { return }
      NSLog("[Owl] check \(step.id) final: \(result.problem ?? "problem")")
      announce(result)
      dismissed = nil
      correction = result
      card = .correction
      statusText = "Check this: \(result.text ?? result.problem ?? "")"
      await render(number)
    case .cannotCheck(let why):
      NSLog("[Owl] check \(step.id) final: cannot check (\(why.rawValue))")
      if why == .checksOff {
        await checksRefused(number)
        return
      }
      // The hint is spoken only now, on the check the worker asked for.
      speaker.say(result?.say ?? result?.hint ?? OwlStrings.cannotCheck)
      if access.audioFirst {
        // The card's own words and its two choices, for a worker who cannot read them.
        if result?.say != nil || result?.hint != nil { speaker.say(OwlStrings.cannotCheck + ".", interrupt: false) }
        if result?.hint == nil { speaker.say(OwlStrings.cannotCheckBody(why), interrupt: false) }
        sayChoices(OwlStrings.sayCannotCheckChoices)
      }
      card = .cannotCheck(why, result?.hint)
      statusText = "Owl can't check step \(step.index): \(why.rawValue)"
      await render(number)
    }
  }

  /// One final check, on a picture taken after the pinch. Bounded, so the worker never
  /// waits on a spinner: it ends with an answer or with the reason there is none. The one
  /// limit covers everything from the pinch on: opening the camera, waiting for a picture,
  /// every request and every retry. No part gets a limit of its own on top.
  private func finalCheck(after pinch: Date, ticket: OwlCheckTicket) async -> (OwlCheckResult?, OwlCheckBlock?) {
    guard let process, let step else { return (nil, .serverError) }
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: Self.finalCheckLimit)
    /// What is left of the limit. Too little to start anything counts as none.
    func left() -> Duration? {
      let remaining = deadline - clock.now
      return remaining > .milliseconds(250) ? remaining : nil
    }
    // The camera is normally open already. When it is not, opening it spends the same limit.
    let camera: OwlCamera
    do {
      guard let opened = try await withOwlTimeout(Self.finalCheckLimit, { await self.openCamera() }) else {
        return (nil, cameraDenied ? .cameraOff : .cameraFailed)
      }
      camera = opened
    } catch {
      return (nil, .timedOut)
    }
    var newerThan = pinch
    while let remaining = left() {
      guard OwlCheckRules.isCurrent(ticket, self.ticket) else { return (nil, nil) }
      guard let frame = await camera.frame(after: newerThan, timeout: min(.milliseconds(2500), remaining)) else {
        // No picture from after the pinch. With time left that is "cannot see"; without, the limit ran out.
        return (nil, left() == nil ? .timedOut : .cantSee)
      }
      guard let remaining = left() else { break }
      do {
        let api = api
        let runID = runID
        let language = language
        let employeeID = employee?.id
        let mock = mockCheck
        let sentAt = ContinuousClock.now
        let result = try await withOwlTimeout(remaining) {
          try await api.check(
            frame: frame, processID: process.id, stepID: step.id, runID: runID, final: true,
            language: language, employeeID: employeeID, mock: mock)
        }
        logCheck(step, frame: frame, sentAt: sentAt, result: result, final: true)
        checkFailures = 0
        isOffline = false
        if result.status != "checking" { return (result, nil) }
        // The engine is still busy with the frame before. Ask again with a newer picture.
        newerThan = Date()
        try? await Task.sleep(for: min(.milliseconds(600), left() ?? .zero))
      } catch {
        NSLog("[Owl] final check failed: \(error)")
        if case .rateLimited = error as? OwlError {
          try? await Task.sleep(for: min(.seconds(2), left() ?? .zero))
          continue
        }
        return (nil, block(for: error))
      }
    }
    return (nil, .timedOut)
  }

  /// The worker goes on without a passed check. It is recorded as exactly that.
  private func continueUnverified(_ why: OwlCheckBlock) async {
    guard let step else { return }
    log.continueUnverified(step, why: why)
    NSLog("[Owl] step \(step.id) continued unverified (\(why.rawValue))")
    await nextStep()
  }

  private func nextStep(after: String? = nil) async {
    guard let process else { return }
    if stepIndex + 1 < process.steps.count {
      stepIndex += 1
      await openStep(speak: true, after: after)
    } else {
      await finishTask(process, after: after)
    }
  }

  /// The last step is done: every step is listed with how it ended (JUN-57), and the
  /// worker's own progress is one pinch away (JUN-76).
  private func finishTask(_ process: OwlProcess, after: String?) async {
    newScene()
    closeCamera()
    let summary = log.summary(of: process)
    let checksWereOff = !log.blocks.isEmpty && log.blocks.values.allSatisfy(\.isWorkersChoice)
    statusText =
      summary.unverified > 0
      ? "Finished \(process.title): \(summary.unverified) of \(summary.checked) checks not verified"
      : "Finished \(process.title): \(summary.verified) checks verified"
    // Only the summary is said: the last step's own "Well done" before it made Owl say it twice.
    speaker.say(OwlStrings.sayFinished(summary))
    if access.audioFirst {
      // The list on the display, step by step, then what the pinch does.
      speaker.say(summary.rows.map(OwlStrings.sayOutcome).joined(separator: " "), interrupt: false)
      sayChoices(OwlStrings.sayPinchForHome)
    }
    let rows = summary.rows.map { "\($0.outcome == .verified ? "✓" : ($0.outcome == .unverified ? "○" : "–")) \($0.title)" }
    let hasEmployee = employee != nil
    let unreal = unrealSource
    await showScreen(stage: .init(kind: "done", title: statusText, text: rows.joined(separator: " · "))) {
      OwlScreens.done(
        process: process, summary: summary, checksWereOff: checksWereOff,
        onHome: self.action { await $0.showTasks() },
        onProgress: hasEmployee ? self.action { await $0.showProgress(afterTask: true) } : nil,
        unreal: unreal)
    }
  }

  private func block(for error: Error) -> OwlCheckBlock {
    switch error as? OwlError {
    case .offline: .offline
    case .cameraTimeout: .timedOut
    case .cameraPermissionDenied: .cameraOff
    case .noCamera, .stream: .cameraFailed
    case .consentRequired: .checksOff
    default: .serverError
    }
  }

  // MARK: - Progress (JUN-76)

  /// The worker's own progress on the glasses, shown and spoken. Encouraging, never a score.
  /// `erased`: shown and said first, right after the worker erased their progress.
  func showProgress(afterTask: Bool = false, erased: Bool = false) async {
    guard let employee else { return await showTasks() }
    let number = newScene()
    process = nil
    await showScreen { OwlScreens.status(OwlStrings.myProgress, detail: OwlStrings.takesAMoment, mood: .thinking, onCancel: self.action { await $0.showTasks() }) }
    async let fetchedTraining = try? await api.training(employeeID: employee.id)
    let progress = try? await api.progress(employeeID: employee.id)
    let training = await fetchedTraining ?? nil
    guard isCurrent(number) else { return }
    let lines =
      (erased ? [OwlStrings.progressErased] : [])
      + OwlText.progressLines(progress, afterTask: afterTask, language: employee.language)
    let trainingLines = training.map(trainingLines)
    let title = t(afterTask ? "Task done!" : "Your progress")
    statusText = title
    speaker.say(([trainingLines?.days].compactMap { $0 } + (trainingLines?.lines ?? []) + lines).joined(separator: " "))
    // Nothing to erase right after erasing, and nothing when Owl could not read the progress.
    let canForget = progress != nil && !erased
    if canForget { sayChoices(OwlStrings.sayPinchForHome) }
    await showScreen(stage: .init(kind: "progress", title: title, text: lines.joined(separator: " "))) {
      OwlScreens.progress(
        title: title, lines: lines, training: trainingLines, onHome: self.action { await $0.showTasks() },
        onForget: canForget ? self.action { await $0.confirmForget() } : nil)
    }
  }

  // MARK: - Training period (JUN-96)

  /// The training part of "My progress": the days left, then what is still missing from the
  /// target level, or the result once there is one.
  private func trainingLines(_ training: OwlTraining) -> OwlTrainingLines {
    var lines: [String] = []
    if let result = training.result {
      lines.append(OwlStrings.trainingResultLine(result == "ready"))
    }
    let missing = training.missing
    if missing.isEmpty, !training.target.isEmpty {
      if training.result == nil { lines.append(OwlStrings.trainingAllReached) }
    } else {
      lines += missing.map {
        OwlStrings.trainingTarget(targetTitle($0), done: $0.doneWithoutHelp ?? 0, of: $0.required ?? 1)
      }
    }
    let days = training.remainingDays().map { OwlStrings.trainingDays(day: training.day, of: training.days, left: $0, active: training.active ?? true) }
    return OwlTrainingLines(days: days, lines: lines)
  }

  /// The target's own name from owl-api, else the step's or the task's title on the phone.
  private func targetTitle(_ target: OwlTraining.Target) -> String {
    if let title = target.title, !title.isEmpty { return title }
    let process = processes.first { $0.id == target.processId }
    return process?.steps.first { $0.id == target.stepId }?.title ?? process?.title ?? target.processId
  }

  /// "Ready" or "More practice", shown and spoken. Owl tells owl-api the worker saw it, so the
  /// trainer sees it only after the worker did.
  func showTrainingResult(_ training: OwlTraining, then next: @escaping @MainActor (OwlViewModel) async -> Void) async {
    guard let employee else { return await next(self) }
    newScene()
    let ready = training.result == "ready"
    let practise = training.missing.map(targetTitle)
    let title = ready ? OwlStrings.trainingReadyTitle : OwlStrings.trainingMoreTitle
    let body = ready ? OwlStrings.trainingReadyBody : OwlStrings.trainingMoreBody(practise)
    let confirmedBy = training.confirmed.map { $0.by ?? "" }
    let who = confirmedBy.map { OwlStrings.trainingConfirmed(by: $0) } ?? OwlStrings.trainingNotConfirmed
    statusText = "Training result: \(training.result ?? "")"
    speaker.say([title + ".", body, ready ? nil : OwlStrings.trainingNotAFail, who].compactMap { $0 }.joined(separator: " "))
    sayChoices(OwlStrings.sayPinchForHome)
    await showScreen(stage: .init(kind: "training", title: title, text: body)) {
      OwlScreens.trainingResult(
        ready: ready, practise: practise, confirmedBy: confirmedBy,
        onOK: self.action { await next($0) })
    }
    markTrainingResultSeen(employee.id, training)
    Task { [api] in try? await api.trainingSeen(employeeID: employee.id) }
  }

  /// Seen on this phone: the same result is shown once, and again when the trainer confirms it.
  private func trainingResultKey(_ employeeID: String, _ training: OwlTraining) -> String {
    "owl.trainingSeen.\(employeeID).\(training.result ?? "")\(training.confirmed == nil ? "" : ".confirmed")"
  }

  private func trainingResultSeen(_ employeeID: String, _ training: OwlTraining) -> Bool {
    UserDefaults.standard.bool(forKey: trainingResultKey(employeeID, training))
  }

  private func markTrainingResultSeen(_ employeeID: String, _ training: OwlTraining) {
    UserDefaults.standard.set(true, forKey: trainingResultKey(employeeID, training))
  }

  /// "Forget me" asks once more: erasing cannot be undone, and keeping is the first choice.
  private func confirmForget() async {
    guard employee != nil else { return }
    newScene()
    statusText = "Asking before erasing progress"
    speaker.say("\(OwlStrings.forgetTitle) \(OwlStrings.forgetBody)")
    sayChoices(OwlStrings.sayTwoChoices(OwlStrings.keepProgress, OwlStrings.eraseProgress))
    await showScreen(stage: .init(kind: "progress", title: OwlStrings.forgetTitle, text: OwlStrings.forgetBody)) {
      OwlScreens.confirmForget(
        onKeep: self.action { await $0.showProgress() },
        onErase: self.action { await $0.forgetMe() })
    }
  }

  /// The worker erases their own learning data on owl-api.
  private func forgetMe() async {
    guard let employee else { return }
    let number = newScene()
    do {
      try await api.forgetProgress(employeeID: employee.id)
      guard isCurrent(number) else { return }
      await showProgress(erased: true)
    } catch {
      guard isCurrent(number) else { return }
      await showProblem(kind(of: error), detail: (error as? LocalizedError)?.errorDescription, retry: { await $0.forgetMe() })
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
  /// Audio first: what the pinch does and what else can be chosen, after whatever Owl is
  /// saying. Nothing a worker has to choose between is only on the display.
  private func sayChoices(_ text: String) {
    guard access.audioFirst else { return }
    speaker.say(text, interrupt: false)
  }

  private func readAloud(_ step: OwlStep) -> String {
    var parts = [step.instruction]
    if let criteria = step.check.criteria, !criteria.isEmpty, step.check.usesCamera {
      parts.append(t("Owl checks:") + " " + criteria.joined(separator: ". ") + ".")
    }
    return parts.joined(separator: " ")
  }

  /// Display-first: every spoken line also goes on the step card as a caption, on its own
  /// line under what Owl knows, so a check update never hides what was said.
  private func caption(_ text: String) {
    guard access.displayFirst, step != nil, text != lastCaption else { return }
    lastCaption = text
    // When the step card is not up yet (openStep speaks first), it shows the caption when drawn.
    if onStepCard {
      let number = scene
      Task { await self.render(number) }
    }
  }

  /// The caption for the step card, or nil when Owl's own line already says the same.
  private var captionLine: String? {
    guard access.displayFirst, let lastCaption, !OwlScreens.liveLine(live).contains(lastCaption) else { return nil }
    return lastCaption
  }

  // MARK: - Step recognition (JUN-34)

  /// Steps that have an expert clip to compare with and no order check. Only with consent and
  /// the camera on.
  private func recognizes(_ step: OwlStep) -> Bool {
    step.clipUrl != nil && (step.check.kind == "none" || step.check.kind == "visual") && checksAllowed
  }

  private func startRecognition(_ number: Int) async {
    stopRecognition()
    guard let process, let step, let camera = await openCamera(), isCurrent(number) else { return }
    let stepID = step.id
    recognizeTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(3))
      while !Task.isCancelled {
        guard let self, self.isCurrent(number), self.step?.id == stepID, self.checksAllowed, self.glassesOn else { return }
        // About the last 2 s of the stream. On real glasses it is made from decoded frames,
        // because a 2 s window of the stream seldom holds a key frame. The clip file never
        // stays on the phone.
        try? await Task.sleep(for: .seconds(2))
        guard !Task.isCancelled else { return }
        guard let clip = await camera.recentClip() else {
          NSLog("[Owl] recognize: no clip this round (no fresh frames)")
          try? await Task.sleep(for: .seconds(4))
          continue
        }
        NSLog("[Owl] recognize: sending a \(clip.count / 1024) KB clip")
        do {
          let result = try await self.api.recognizeStep(
            clip: clip, processID: process.id, runID: self.runID, employeeID: self.employee?.id)
          NSLog("[Owl] recognize: \(result.status) \(result.stepId ?? "-") margin \(result.margin ?? 0) (\(result.backend ?? "?"))")
          guard !Task.isCancelled, self.isCurrent(number), self.step?.id == stepID else { return }
          await self.showRecognition(result, process: process, current: stepID, number)
        } catch OwlError.consentRequired {
          return
        } catch {
          NSLog("[Owl] recognize failed: \(error)")
        }
        try? await Task.sleep(for: .seconds(6))
      }
    }
  }

  private func stopRecognition() {
    guard recognizeTask != nil else { return }
    recognizeTask?.cancel()
    recognizeTask = nil
    suggestedStepID = nil
    camera?.discardClip()
  }

  /// "Looks like step N": a hint on the step card. Owl never moves on by itself; when the
  /// worker seems to be on the next step, the Done pinch is how they move on.
  private func showRecognition(_ result: OwlStepRecognition, process: OwlProcess, current: String, _ number: Int) async {
    guard result.status == "ok", let id = result.stepId, id != current,
      let seen = process.steps.first(where: { $0.id == id }),
      let here = process.steps.first(where: { $0.id == current })
    else { return }
    // A correction or a check that is under way comes first.
    guard correction == nil, card == .step else { return }
    // Only the next step is said. The worker can act on it (pinch Done), and a wrong guess
    // costs nothing, because Done still runs the check. "Looks like step 4" on step 1 gives the
    // worker nothing to do, and the model is right about six times in ten (JUN-34).
    guard seen.index == here.index + 1 else { return }
    let text = t(OwlText.looksLikeStep(seen.index, isNext: true, language: language))
    await setLive(.suggests(text), number)
    if suggestedStepID != id {
      suggestedStepID = id
      speaker.say(text)
    }
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

  // MARK: - Location during training (JUN-97)

  /// "Location on · Aisle C" while tracking is on, for the step card.
  private var trackingLine: String? {
    guard let whereabouts, whereabouts.tracking else { return nil }
    return whereabouts.zone.map { OwlStrings.locationIn($0.name) } ?? OwlStrings.locationOn
  }

  private func isLocked(_ step: OwlStep) -> Bool {
    guard let process, step.checkpoint != nil, let whereabouts, whereabouts.tracking else { return false }
    return !whereabouts.isUnlocked(processID: process.id, stepID: step.id)
  }

  /// Asks owl-api whether tracking is on, where the worker is and which steps are open.
  private func refreshLocation() async {
    guard let employee, consent?.location != false || whereabouts != nil else { return }
    do {
      whereabouts = try await api.location(employeeID: employee.id)
    } catch {
      // An older server, or no connection: no tracking, so no step is locked.
      whereabouts = nil
    }
  }

  /// A locked step: about every 2 s one camera picture goes to owl-api, which says whether
  /// the worker has reached the place. Two looks in a row at the right place open the step.
  /// Without a camera Owl only asks owl-api, in case the trainer or Help opened the step.
  private func startLocked(_ number: Int) async {
    let camera = await openCamera()
    guard isCurrent(number) else { return }
    if camera == nil { NSLog("[Owl] location: no camera, the step waits for the trainer or Help") }
    lockTask = Task { [weak self] in
      var delay: Duration = .seconds(1)
      var camera = camera
      while !Task.isCancelled {
        try? await Task.sleep(for: delay)
        guard let self, !Task.isCancelled, self.isCurrent(number), self.card == .locked else { return }
        guard let employee = self.employee, let process = self.process, let step = self.step else { return }
        delay = camera == nil ? .seconds(5) : .seconds(2)
        do {
          if let frame = self.glassesOn ? camera?.latestJPEG(maxSide: 768) : nil {
            let location = try await self.api.locationFrame(
              frame, employeeID: employee.id, processID: process.id, stepID: step.id)
            // owl-api paces the looks, never faster than every 2 s.
            delay = .milliseconds(max(location.nextCheckMs ?? 2000, 2000))
            if let match = location.match {
              NSLog("[Owl] location: looks like \(match.stepId ?? match.zoneId ?? "?") (\(match.decidedBy ?? "model"))")
            }
            self.whereabouts = location
            if location.canRecognize == false {
              // No picture of this place yet: no more pictures, only the trainer or Help.
              NSLog("[Owl] location: owl-api cannot recognise this place, waiting for the trainer or Help")
              camera = nil
              self.closeCamera()
            }
          } else if camera == nil {
            await self.refreshLocation()
          } else {
            continue
          }
        } catch OwlError.consentRequired {
          self.whereabouts = nil
        } catch OwlError.server(409, _) {
          // The training period is over: nothing is tracked and nothing stays locked.
          self.whereabouts = nil
        } catch {
          // No connection or a slow answer: try again with the next picture.
          NSLog("[Owl] location: \(error)")
          continue
        }
        guard self.isCurrent(number), let step = self.step else { return }
        if !self.isLocked(step) {
          let arrived = self.whereabouts?.tracking == true
          // Opening the step starts a new scene, which cancels this task: the step opens in
          // a task of its own, or its own requests would be cancelled with this one.
          Task { await self.openStep(speak: true, after: arrived ? OwlStrings.youAreThere : nil) }
          return
        }
      }
    }
  }

  private func stopLocked() {
    lockTask?.cancel()
    lockTask = nil
  }

  private static func locationAskedKey(_ employeeID: String) -> String { "owl.locationAsked.\(employeeID)" }

  private func locationAsked(_ employeeID: String) -> Bool {
    consent?.location == true || UserDefaults.standard.bool(forKey: Self.locationAskedKey(employeeID))
  }

  /// What location tracking is, who sees it and when it is deleted, before anything is
  /// tracked. Its own choice, apart from the camera checks.
  private func askLocationConsent(then next: @escaping @MainActor (OwlViewModel) async -> Void) async {
    guard let employee else { return }
    newScene()
    let lines = OwlStrings.locationLines
    statusText = "Asking for location consent"
    speaker.say(([OwlStrings.locationTitle + "."] + lines).joined(separator: " "))
    sayChoices(OwlStrings.sayTwoChoices(OwlStrings.allowLocation, OwlStrings.noLocation))
    func answer(_ allowed: Bool) -> OwlAction {
      action {
        UserDefaults.standard.set(true, forKey: Self.locationAskedKey(employee.id))
        await $0.saveConsent(
          cameraChecks: $0.consent?.cameraChecks ?? false, recording: $0.consent?.recording ?? false, location: allowed)
        $0.speaker.say(allowed ? OwlStrings.locationThanks : OwlStrings.locationDeclined)
        await next($0)
      }
    }
    await showScreen(stage: .init(kind: "consent", title: OwlStrings.locationTitle, text: lines.joined(separator: " "))) {
      OwlScreens.consent(
        title: OwlStrings.locationTitle, lines: lines, allowLabel: OwlStrings.allowLocation,
        declineLabel: OwlStrings.noLocation, onAllow: answer(true), onDecline: answer(false))
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
      _ = try? await api.setConsent(
        employeeID: employee.id, cameraChecks: saved.cameraChecks, recording: saved.recording, location: saved.location)
      return false
    }
    return true
  }

  /// Explains on the display and aloud what the camera does, and lets the worker choose.
  private func askConsent(then next: @escaping @MainActor (OwlViewModel) async -> Void) async {
    guard employee != nil else { return }
    newScene()
    // What really happens (JUN-59): the picture leaves the phone to be checked by the AI
    // service the company uses, and Owl's own server does not store it.
    let lines = [
      "Owl looks only during a step, to check your work.",
      "Each picture goes to an AI service that checks it. Owl does not save it.",
      "You can pause the camera any time.",
    ].map { self.t($0) }
    statusText = "Asking for camera consent"
    speaker.say(lines.joined(separator: " "))
    let title = t("Owl's camera")
    let allow = t("Allow checks")
    let decline = t("No checks")
    sayChoices(OwlStrings.sayTwoChoices(allow, decline))
    await showScreen(stage: .init(kind: "consent", title: title, text: lines.joined(separator: " "))) {
      OwlScreens.consent(
        title: title, lines: lines, allowLabel: allow, declineLabel: decline,
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

  private func saveConsent(cameraChecks: Bool, recording: Bool, location: Bool? = nil) async {
    guard let employee else { return }
    let now = ISO8601DateFormatter().string(from: Date())
    let location = location ?? consent?.location
    var saved = OwlConsent(employeeId: employee.id, cameraChecks: cameraChecks, recording: recording, at: now, location: location)
    do {
      saved = try await api.setConsent(
        employeeID: employee.id, cameraChecks: cameraChecks, recording: recording, location: location)
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
    guard let step, ticket != nil else { return }
    let number = scene
    cameraPaused.toggle()
    if cameraPaused {
      stopCheckLoop()
      stopRecognition()
      closeCamera()
      correction = nil
      card = .step
      speaker.say("Camera paused. Checks are off.")
      live = .blocked(.cameraPaused)
      await render(number)
    } else {
      speaker.say("Camera on. Owl is watching again.")
      live = .starting
      await render(number)
      await startWatching(number)
      guard isCurrent(number) else { return }
      if recognizes(step) { await startRecognition(number) }
    }
  }

  // MARK: - Watch how (JUN-56)

  /// Plays the expert's clip of this step. Afterwards the worker goes back to the step or
  /// watches it again; if the clip cannot play, the step still works without it.
  private func watchHow() async {
    guard let step, let clip = step.clipUrl, let url = api.resolve(clip) else { return }
    let number = newScene()
    guard url.scheme == "https" else {
      // The DAT VideoPlayer plays https URLs only.
      NSLog("[Owl] clip needs https: \(url.absoluteString)")
      await showProblem(.video)
      return
    }
    // The display's player shows a dead picture for a clip it cannot fetch and reports nothing,
    // so Owl looks first: a missing clip gets its own screen, and the step goes on without it.
    statusText = "Opening the expert's clip"
    await showScreen {
      OwlScreens.status(
        OwlStrings.openingClip, detail: step.title, mood: .watching,
        onCancel: self.waitAction { await $0.backToStep() })
    }
    guard await api.clipIsThere(url) else {
      guard isCurrent(number) else { return }
      NSLog("[Owl] clip cannot be fetched: \(url.path)")
      await showProblem(.video)
      return
    }
    guard isCurrent(number) else { return }
    statusText = "Playing the expert's clip"
    isPlayingClip = true
    let playback = ClipPlayback()
    await displayViewModel.playVideo(url: url.absoluteString, onStarted: { playback.started = true }) { [weak self] played in
      guard let self, !playback.finished else { return }
      playback.finished = true
      // The worker may have moved on while the clip played.
      guard self.isCurrent(number) else { return }
      self.isPlayingClip = false
      Task {
        if played {
          await self.showScreen(stage: .init(kind: "clip", title: OwlStrings.afterClip, text: step.instruction)) {
            OwlScreens.afterClip(
              step: step, onReplay: self.action { await $0.watchHow() },
              onBack: self.action { await $0.backToStep() })
          }
        } else {
          await self.showProblem(.video)
        }
      }
    }
    // A player that has not started after a while will not start. Owl ends it and says so.
    Task { [weak self] in
      try? await Task.sleep(for: Self.clipStartLimit)
      guard let self, self.isCurrent(number), self.isPlayingClip, !playback.started, !playback.finished else { return }
      playback.finished = true
      NSLog("[Owl] clip did not start in \(Self.clipStartLimit)")
      self.isPlayingClip = false
      await self.displayViewModel.stopVideo()
      await self.showProblem(.video)
    }
  }

  /// How long the display's player gets to start a clip before Owl gives up on it.
  private static let clipStartLimit: Duration = .seconds(8)

  /// What Owl knows about the clip that is playing.
  @MainActor private final class ClipPlayback {
    var started = false
    var finished = false
  }

  // MARK: - Customer service (JUN-98)

  /// Turns the mode on: the glasses listen until the worker pinches End. Owl says it is on,
  /// and every screen of the mode shows "Owl is listening".
  func startCustomerService() async {
    guard let session = displayViewModel.currentDeviceSession(), employee != nil else { return }
    stopEverything()
    let number = newScene()
    assistScene = number
    statusText = "Customer service: listening"
    listener.onPartial = { [weak self] text in
      guard let self, self.assistScene == number, Date() > self.assistQuietUntil else { return }
      self.conversation.partial = text
      // Someone is talking: the question is being answered, no hint needed.
      self.autoHintTask?.cancel()
      Task { await self.drawAssist(number, throttle: true) }
    }
    listener.onFinal = { [weak self] text in
      guard let self, self.assistScene == number, Date() > self.assistQuietUntil else { return }
      self.conversation.append(text)
      self.autoHintTask?.cancel()
      if OwlConversation.looksLikeQuestion(text) { self.offerHintLater(number) }
      Task { await self.drawAssist(number, throttle: true) }
    }
    listener.onError = { [weak self] _, message in
      Task {
        guard let self, self.assistScene == number else { return }
        self.endConversation()
        await self.showProblem(.microphoneNeeded, detail: message)
      }
    }
    do {
      try await listener.start(on: session, mode: .continuous)
      guard isCurrent(number) else { return }
      assistQuietUntil = Date().addingTimeInterval(3)
      speaker.say(OwlStrings.sayAssistOn)
      await drawAssist(number)
    } catch {
      endConversation()
      guard isCurrent(number) else { return }
      await showProblem(kind(of: error), detail: (error as? LocalizedError)?.errorDescription)
    }
  }

  /// The stretch goal: a customer's question that nobody answers for about 5 seconds gets a
  /// hint by itself. Any new words cancel it.
  private func offerHintLater(_ number: Int) {
    autoHintTask = Task { [weak self] in
      try? await Task.sleep(for: .seconds(5))
      guard let self, !Task.isCancelled, self.assistScene == number, !self.assistBusy else { return }
      // From here the hint is on its way: new words must not cancel its request.
      self.autoHintTask = nil
      await self.hint(auto: true)
    }
  }

  /// Hint: suggested answers for the last ~30 seconds, on the display only.
  func hint(auto: Bool = false) async {
    guard let employee, let number = assistScene, isCurrent(number), !assistBusy else { return }
    autoHintTask?.cancel()
    let transcript = conversation.recent(after: lastHintAt)
    guard !transcript.isEmpty else {
      assistHint = nil
      statusText = OwlStrings.assistNothingHeard
      await drawAssist(number)
      return
    }
    assistBusy = true
    assistAuto = auto
    await drawAssist(number)
    let started = ContinuousClock.now
    do {
      let hint = try await api.assist(employeeID: employee.id, transcript: transcript, language: language)
      // How fast a hint is (goal: under 3 s). The words themselves are never logged.
      NSLog("[Owl] perf: hint in \(Int((ContinuousClock.now - started) / .milliseconds(1))) ms, \(hint.bullets.count) bullets\(auto ? ", offered" : "")")
      assistHint = hint
      lastHintAt = Date()
    } catch OwlError.server(let status, _) where status == 409 || status == 403 {
      // The training period ended, or this is not a customer service role.
      assistBusy = false
      endConversation()
      speaker.say(OwlStrings.assistOnlyInTraining)
      await showTasks()
      return
    } catch {
      NSLog("[Owl] hint failed: \(error)")
      assistHint = OwlAssist(bullets: [OwlStrings.assistCouldNot], say: nil, sources: [], unsure: true)
    }
    assistBusy = false
    guard assistScene == number else { return }
    await drawAssist(number)
  }

  private func drawAssist(_ number: Int, throttle: Bool = false) async {
    guard assistScene == number, isCurrent(number) else { return }
    // Words arrive many times a second; the display is redrawn at most once a second, and
    // never over a hint or a hint on its way.
    if throttle {
      guard !assistBusy, assistHint == nil, Date().timeIntervalSince(assistDrawnAt) > 1 else { return }
    }
    assistDrawnAt = Date()
    let heard = conversation.lastWords()
    let hint = assistHint
    let busy = assistBusy
    let auto = assistAuto
    // The stage page sees the bullets, never the conversation.
    let stage = OwlStageScreen(
      kind: "assist", title: OwlStrings.customerService, text: hint?.bullets.joined(separator: " · "))
    await showScreen(stage: stage) {
      OwlScreens.assist(
        heard: heard, hint: hint, busy: busy, auto: auto,
        onHint: self.action { await $0.hintAgain() },
        onEnd: self.action { await $0.endCustomerService() },
        onHelp: self.action { await $0.helpFromCustomerService() })
    }
  }

  /// Help from the counter: listening stops (the conversation is dropped), the call starts,
  /// and customer service comes back when it ends.
  private func helpFromCustomerService() async {
    endConversation()
    helpFromCounter = true
    await startHelp()
  }

  /// A new Hint pinch: the last hint is cleared and a new one asked for what was said since.
  private func hintAgain() async {
    assistHint = nil
    await hint()
  }

  func endCustomerService() async {
    guard assistScene != nil else { return await showTasks() }
    endConversation()
    speaker.say(OwlStrings.sayAssistOff)
    await showTasks()
  }

  /// Stops listening and forgets the conversation.
  private func endConversation() {
    guard assistScene != nil else { return }
    assistScene = nil
    autoHintTask?.cancel()
    autoHintTask = nil
    listener.stop()
    listener.onPartial = nil
    listener.onFinal = nil
    conversation = OwlConversation()
    assistHint = nil
    assistBusy = false
    assistAuto = false
    lastHintAt = nil
  }

  // MARK: - Ask (JUN-31)

  func ask() async {
    guard let session = displayViewModel.currentDeviceSession() else { return }
    let number = newScene()
    lastHeard = nil
    let cancel = action { await $0.endAsk() }
    await showScreen { OwlScreens.listening(prompt: OwlStrings.askPrompt, heard: nil, onCancel: cancel) }
    listener.onPartial = { [weak self] text in
      guard let self, self.isCurrent(number) else { return }
      self.lastHeard = text
      Task {
        guard self.isCurrent(number) else { return }
        await self.show(OwlScreens.listening(prompt: OwlStrings.askPrompt, heard: text, onCancel: cancel))
      }
    }
    listener.onFinal = { [weak self] question in
      Task {
        guard let self, self.isCurrent(number) else { return }
        await self.answer(question)
      }
    }
    listener.onError = { [weak self] _, message in
      Task {
        guard let self, self.isCurrent(number) else { return }
        await self.showProblem(.microphoneNeeded, detail: message)
      }
    }
    do {
      try await listener.start(on: session, mode: .utterance)
      guard isCurrent(number) else { return }
      speaker.say(OwlStrings.sayYes)
    } catch {
      guard isCurrent(number) else { return }
      await showProblem(kind(of: error), detail: (error as? LocalizedError)?.errorDescription)
    }
  }

  /// Asks owl-api. Also used by the phone's test field.
  func answer(_ question: String) async {
    listener.stop()
    let number = newScene()
    lastHeard = question
    statusText = "Asked: \(question)"
    await showScreen {
      OwlScreens.status(
        OwlStrings.thinking, detail: "\u{201C}\(question)\u{201D}", onCancel: self.action { await $0.endAsk() })
    }
    do {
      let answer = try await api.ask(
        question, employeeID: employee?.id, processID: process?.id, stepID: step?.id,
        language: language)
      // Cancelled or moved on: no screen and no voice.
      guard isCurrent(number) else { return }
      speaker.say(answer.say ?? answer.text)
      if access.audioFirst, let source = answer.sources.first {
        speaker.say("\(t("Source:")) \(source.doc)\(source.section.map { ", \($0)" } ?? "").", interrupt: false)
      }
      await showScreen(stage: .init(kind: "answer", title: question, text: answer.text + (answer.sources.first.map { " — \($0.doc)" } ?? ""))) {
        OwlScreens.answer(
          question: question, answer: answer,
          onAskAgain: self.action { await $0.ask() },
          onBack: self.action { await $0.endAsk() })
      }
    } catch {
      guard isCurrent(number) else { return }
      await showProblem(
        kind(of: error), detail: (error as? LocalizedError)?.errorDescription,
        retry: { await $0.answer(question) })
    }
  }

  private func endAsk() async {
    listener.stop()
    if process != nil { await backToStep() } else { await showTasks(refresh: false) }
  }

  // MARK: - Help (JUN-33)

  /// Help: with a shift manager on shift, the worker chooses between the manager's glasses
  /// and an expert in Owl Studio (JUN-100); otherwise Owl calls Studio at once.
  private func startHelp() async {
    let number = newScene()
    if let employee, let manager = try? await api.shiftManager(forWorker: employee.id) {
      guard isCurrent(number) else { return }
      statusText = "Help: who helps?"
      speaker.say(OwlStrings.whoHelps)
      sayChoices(OwlStrings.sayTwoChoices(OwlStrings.callShiftManager(manager.name), OwlStrings.askStudioExpert))
      await showScreen(stage: .init(kind: "help", title: OwlStrings.whoHelps, text: OwlStrings.callShiftManager(manager.name))) {
        OwlScreens.helpChoice(
          managerName: manager.name,
          onManager: self.action { await $0.callForHelp(to: "manager", managerName: manager.name) },
          onExpert: self.action { await $0.callForHelp(to: nil, managerName: nil) },
          onBack: self.action { await $0.endHelp() })
      }
      return
    }
    guard isCurrent(number) else { return }
    await callForHelp(to: nil, managerName: nil)
  }

  /// Shares the glasses view: with the shift manager's glasses (`to: "manager"`) or with an
  /// expert in Owl Studio.
  private func callForHelp(to: String?, managerName: String?) async {
    let number = newScene()
    guard let camera = await openCamera() else {
      guard isCurrent(number) else { return }
      await showProblem(cameraDenied ? .cameraNeeded : .other, detail: OwlError.noCamera.errorDescription)
      return
    }
    guard isCurrent(number) else { return }
    helpID = nil
    lastSpokenExpertMessage = 0
    helpTo = to
    helpManagerName = managerName
    helpDrawn = nil
    saidNoAnswer = false
    helpHeard = nil
    helpSession = nil
    helpMarked = nil
    if let managerName, to == "manager" {
      statusText = "Calling \(managerName)"
      speaker.say(OwlStrings.callingManager(managerName))
      await showScreen(stage: .init(kind: "help", title: OwlStrings.callingManager(managerName), text: OwlStrings.managerWillSee(managerName))) {
        OwlScreens.calling(managerName: managerName, onEnd: self.action { await $0.endHelp() })
      }
    } else {
      speaker.say(OwlStrings.sayCallingExpert)
      await showScreen(stage: .init(kind: "help", title: OwlStrings.callingExpert, text: OwlStrings.helpBody)) {
        OwlScreens.help(session: nil, marked: nil, onEnd: self.action { await $0.endHelp() })
      }
    }
    helpTask = Task { [weak self] in
      while !Task.isCancelled {
        guard let self, self.isCurrent(number) else { return }
        // Nothing is shared while the glasses are off.
        if self.glassesOn { await self.helpTick(camera: camera, number) }
        // The manager's live view is about one picture a second (JUN-100).
        let live = self.helpSession?.isWithManager == true && self.helpSession?.isConnected == true
        try? await Task.sleep(for: live ? .seconds(1) : Self.helpInterval)
      }
    }
  }

  private func helpTick(camera: OwlCamera, _ number: Int) async {
    do {
      let session: OwlHelpSession
      if let frame = camera.latestJPEG(maxSide: 800) {
        session = try await api.sendHelpFrame(
          frame, helpID: helpID, employeeID: employee?.id, processID: process?.id, stepID: step?.id,
          to: helpID == nil ? helpTo : nil)
      } else if let helpID {
        session = try await api.help(helpID)
      } else {
        return
      }
      guard !Task.isCancelled, isCurrent(number) else { return }
      helpID = session.id
      helpSession = session
      // The manager's or the expert's words are spoken and shown.
      let newMessages = session.messages.filter { $0.from != "worker" && $0.id > lastSpokenExpertMessage }
      for message in newMessages {
        speaker.say(message.text)
        lastSpokenExpertMessage = message.id
      }
      if session.isEnded {
        speaker.say(OwlStrings.sayHelpEnded)
        await endHelp()
        return
      }
      // Rung, but nobody answered or the manager chose Later: Studio takes over, and the
      // worker hears why.
      if helpTo == "manager", !session.isWithManager, !saidNoAnswer {
        saidNoAnswer = true
        let name = session.assigneeName ?? helpManagerName ?? OwlStrings.shiftManager
        speaker.say(session.fallback == "no_manager" ? OwlStrings.noManagerOnShift : OwlStrings.noAnswer(name))
      }
      statusText =
        session.isRinging ? "Ringing \(session.assigneeName ?? "the shift manager")"
        : session.isWithManager && session.isConnected ? "\(session.assigneeName ?? "Manager") is watching"
        : session.isConnected ? "Expert connected" : "Waiting for an expert"
      if !newMessages.isEmpty {
        // The expert or the shift manager can mark the worker's view (JUN-60, JUN-107).
        let lastHelper = session.messages.last { $0.from != "worker" }
        helpMarked = await image(lastHelper?.imageUrl)
        guard isCurrent(number) else { return }
      }
      await drawHelp(number)
    } catch OwlError.server(409, _) {
      // The other side ended the call (or owl-api did): stop sharing at once.
      guard isCurrent(number) else { return }
      speaker.say(OwlStrings.sayHelpEnded)
      await endHelp()
    } catch {
      NSLog("[Owl] help failed: \(error)")
      statusText = "Help: \((error as? LocalizedError)?.errorDescription ?? "\(error)")"
    }
  }

  /// Draws the help screen when what it shows has changed: the calling screen while the
  /// manager's glasses ring, "Mika is watching your view" the whole call, else Studio help.
  private func drawHelp(_ number: Int) async {
    guard isCurrent(number), let session = helpSession else { return }
    let key = "\(session.status)|\(session.routed ?? "")|\(session.messages.last?.id ?? 0)|\(helpHeard ?? "")"
    guard key != helpDrawn else { return }
    helpDrawn = key
    if session.isWithManager, session.isRinging {
      let name = session.assigneeName ?? helpManagerName ?? OwlStrings.shiftManager
      await showScreen(stage: .init(kind: "help", title: OwlStrings.callingManager(name), text: nil)) {
        OwlScreens.calling(managerName: name, onEnd: self.action { await $0.endHelp() })
      }
      return
    }
    let watcher = session.isWithManager ? session.assigneeName ?? helpManagerName : nil
    let marked = helpMarked
    let heard = helpHeard
    let last = session.messages.last { $0.from != "worker" }
    let title = watcher.map(OwlStrings.isWatching) ?? (session.isConnected ? OwlStrings.expertWithYou : OwlStrings.callingExpert)
    await showScreen(stage: .init(kind: "help", title: title, text: last?.text)) {
      OwlScreens.help(
        session: session, marked: marked, onEnd: self.action { await $0.endHelp() }, watcher: watcher, heard: heard,
        onAnswer: session.isConnected ? self.action { await $0.answerHelp() } : nil)
    }
  }

  /// The worker answers by voice: one sentence, sent to whoever helps.
  private func answerHelp() async {
    guard let session = displayViewModel.currentDeviceSession(), let helpID else { return }
    let number = scene
    listener.onPartial = nil
    listener.onFinal = { [weak self] text in
      Task {
        guard let self, self.isCurrent(number) else { return }
        self.helpHeard = text
        _ = try? await self.api.sayToHelp(helpID, text: text)
        await self.drawHelp(number)
      }
    }
    listener.onError = { _, message in NSLog("[Owl] help answer: \(message)") }
    do {
      try await listener.start(on: session, mode: .utterance)
      speaker.say(OwlStrings.sayYes)
    } catch {
      NSLog("[Owl] help answer: \(error)")
    }
  }

  /// Ends Help: sharing stops at once, and owl-api deletes the shared pictures.
  private func endHelp() async {
    if helpID != nil { NSLog("[Owl] help: ending \(helpID ?? ""), glasses on \(glassesOn)") }
    helpTask?.cancel()
    helpTask = nil
    listener.stop()
    if let helpID {
      let api = api
      Task { _ = try? await api.endHelp(helpID) }
    }
    helpID = nil
    helpTo = nil
    helpSession = nil
    helpMarked = nil
    if helpFromCounter {
      helpFromCounter = false
      await startCustomerService()
    } else if process != nil {
      await backToStep()
    } else {
      await showTasks(refresh: false)
    }
  }

  // MARK: - The shift manager's glasses (JUN-100)

  private func showManagerHome() async {
    let number = newScene()
    incomingScene = nil
    statusText = "Shift manager: waiting for help requests"
    let name = employee?.name
    await showScreen(stage: .init(kind: "manager", title: OwlStrings.shiftManager, text: OwlStrings.managerIdle)) {
      OwlScreens.managerHome(name: name, onTasks: self.action { await $0.showTasks(refresh: false) })
    }
    _ = number
  }

  /// Every 2 s, while no call is on: a request ringing for this manager is shown at once.
  private func startIncomingPoll() {
    guard incomingTask == nil else { return }
    incomingTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: .seconds(2))
        guard let self else { return }
        guard let manager = self.employee, manager.shiftManager == true else {
          self.incomingTask = nil
          return
        }
        guard self.callID == nil, self.glassesOn else { continue }
        guard let sessions = try? await self.api.incomingHelp(managerID: manager.id), self.callID == nil else { continue }
        if let ringing = sessions.first(where: \.isRinging) {
          if self.ringingShown != ringing.id { await self.showIncoming(ringing) }
        } else if self.ringingShown != nil {
          // The worker hung up, or the request went to Studio.
          self.ringingShown = nil
          if let shown = self.incomingScene, self.isCurrent(shown) { await self.showManagerHome() }
        }
      }
    }
  }

  private func showIncoming(_ request: OwlHelpSession) async {
    let number = newScene()
    incomingScene = number
    ringingShown = request.id
    let worker = request.employeeName ?? OwlStrings.helpLabel
    let place = request.stepIndex.map { OwlStrings.stepNamed($0, request.stepTitle) }
    statusText = "Help request from \(worker)"
    speaker.say(OwlStrings.sayNeedsHelp(worker))
    sayChoices(OwlStrings.sayTwoChoices(OwlStrings.accept, OwlStrings.later))
    await showScreen(stage: .init(kind: "manager", title: OwlStrings.needsHelp(worker), text: place)) {
      OwlScreens.incoming(
        worker: worker, task: request.processTitle, place: place,
        onAccept: self.action { await $0.acceptCall(request, place: place) },
        onLater: self.action { await $0.laterCall(request.id) })
    }
  }

  private func acceptCall(_ request: OwlHelpSession, place: String?) async {
    guard let manager = employee, callID == nil else { return }
    do {
      _ = try await api.acceptHelp(request.id, managerID: manager.id)
    } catch {
      // Gone meanwhile: the worker ended it, or it went to Studio.
      NSLog("[Owl] accept: \(error)")
      speaker.say(OwlStrings.callEnded)
      return await showManagerHome()
    }
    let number = newScene()
    callID = request.id
    ringingShown = nil
    callWorker = request.employeeName ?? OwlStrings.helpLabel
    // The step only: the task's name as well would take two lines over the picture.
    callPlace = place ?? request.processTitle
    callFrame = nil
    callFrameAt = nil
    callWorkerSaid = nil
    callListening = false
    callHeard = nil
    statusText = "In a call with \(callWorker)"
    await drawCall(number)
    callTask = Task { [weak self] in
      while !Task.isCancelled {
        guard let self, self.isCurrent(number), let id = self.callID else { return }
        if let session = try? await self.api.help(id) {
          guard self.isCurrent(number) else { return }
          if session.isEnded {
            await self.closeCall(sayEnded: true)
            return
          }
          var changed = false
          if session.frameAt != self.callFrameAt, let url = session.latestFrameUrl,
            let picture = try? await self.api.image(url)
          {
            // Not cached: every picture is new, and none is kept after the call.
            self.callFrame = picture.owlScaled(maxSide: 480)
            self.callFrameAt = session.frameAt
            changed = true
          }
          let said = session.messages.last { $0.from == "worker" }?.text
          if said != self.callWorkerSaid {
            self.callWorkerSaid = said
            changed = true
          }
          if changed { await self.drawCall(number) }
        }
        try? await Task.sleep(for: .seconds(1))
      }
    }
  }

  private func drawCall(_ number: Int) async {
    guard isCurrent(number), callID != nil else { return }
    let worker = callWorker
    let place = callPlace
    let frame = callFrame
    let said = callWorkerSaid
    let listening = callListening
    let heard = callHeard
    await showScreen(stage: .init(kind: "manager", title: OwlStrings.viewOf(worker), text: said)) {
      OwlScreens.liveView(
        worker: worker, place: place, frame: frame, workerSaid: said, listening: listening, heard: heard,
        onTalk: self.action { await $0.talk() }, onEnd: self.action { await $0.endCall() })
    }
  }

  /// Talk: one pinch, the manager speaks, recognition ends with the sentence, and the
  /// worker's glasses speak and show it.
  private func talk() async {
    guard let session = displayViewModel.currentDeviceSession(), let id = callID, !callListening else { return }
    let number = scene
    callListening = true
    callHeard = nil
    listener.onPartial = { [weak self] text in
      guard let self, self.isCurrent(number) else { return }
      self.callHeard = text
      Task { await self.drawCall(number) }
    }
    listener.onFinal = { [weak self] text in
      Task {
        guard let self, self.isCurrent(number) else { return }
        self.callListening = false
        self.callHeard = nil
        _ = try? await self.api.sayToHelp(id, text: text, from: "manager")
        await self.drawCall(number)
      }
    }
    listener.onError = { [weak self] _, message in
      NSLog("[Owl] talk: \(message)")
      Task { @MainActor in
        self?.callListening = false
        await self?.drawCall(number)
      }
    }
    await drawCall(number)
    do {
      try await listener.start(on: session, mode: .utterance)
    } catch {
      callListening = false
      await drawCall(number)
    }
  }

  private func laterCall(_ id: String) async {
    guard let manager = employee else { return }
    _ = try? await api.laterHelp(id, managerID: manager.id)
    ringingShown = nil
    await showManagerHome()
  }

  private func endCall() async {
    if let id = callID {
      let api = api
      Task { _ = try? await api.endHelp(id) }
    }
    await closeCall(sayEnded: false)
  }

  /// The call is over: the last picture is dropped from memory.
  private func closeCall(sayEnded: Bool) async {
    callTask?.cancel()
    callTask = nil
    listener.stop()
    callID = nil
    callFrame = nil
    callFrameAt = nil
    callWorkerSaid = nil
    callListening = false
    if sayEnded { speaker.say(OwlStrings.callEnded) }
    await showManagerHome()
  }

  // MARK: - Record (JUN-32)

  func startRecording() async {
    stopEverything()
    let number = newScene()
    // The expert agrees that their clips are stored, and to warn people nearby (JUN-80).
    if consent?.recording != true, employee != nil {
      let lines = [
        "Your clips and voice are stored to teach new workers.", "Faces are blurred before anything is stored.",
        "Tell people nearby that you are filming.",
      ].map { self.t($0) }
      speaker.say(lines.joined(separator: " "))
      let title = t("Recording")
      let agree = t("I agree")
      let cancel = t("Cancel")
      await showScreen(stage: .init(kind: "consent", title: title, text: lines.joined(separator: " "))) {
        OwlScreens.consent(
          title: title, lines: lines, allowLabel: agree, declineLabel: cancel,
          onAllow: self.action {
            await $0.saveConsent(cameraChecks: $0.consent?.cameraChecks ?? false, recording: true)
            await $0.startRecording()
          },
          onDecline: self.action { await $0.showTasks(refresh: false) })
      }
      return
    }
    // A recording left with Back is opened again, with the steps it already has.
    if recording != nil { return await showRecord() }
    await showScreen {
      OwlScreens.status(
        OwlStrings.record, detail: OwlStrings.takesAMoment, mood: .listening,
        onCancel: self.waitAction { await $0.showTasks(refresh: false) })
    }
    do {
      let started = try await api.startRecording(
        title: "New task \(Date().formatted(date: .omitted, time: .shortened))",
        expert: employee?.name ?? "Expert")
      guard isCurrent(number) else { return }
      recording = started
      droppedSteps = []
      speaker.say(OwlStrings.recordHintFirst)
      await showRecord()
    } catch {
      guard isCurrent(number) else { return }
      await showProblem(kind(of: error), detail: (error as? LocalizedError)?.errorDescription, retry: { await $0.startRecording() })
    }
  }

  private func showRecord(narration text: String? = nil) async {
    guard let recording else { return }
    let stepCount = recording.steps.count
    let isRecordingStep = isRecordingStep
    if !isRecordingStep { statusText = "Record: \(recording.title), \(stepCount) steps" }
    await showScreen(stage: .init(kind: "record", title: isRecordingStep ? "Recording step \(stepCount + 1)" : "Record: \(recording.title)", text: text)) {
      OwlScreens.record(
        title: recording.title, stepCount: stepCount, isRecordingStep: isRecordingStep,
        narration: text,
        onStartStep: self.action { await $0.startRecordedStep() },
        onEndStep: self.action { await $0.endRecordedStep() },
        onFinish: self.action { await $0.finishRecording() },
        onBack: self.action { await $0.showTasks(refresh: false) })
    }
  }

  func startRecordedStep() async {
    // Only inside a recording: a step clip that no recording waits for would never be ended.
    guard !isRecordingStep, recording != nil, let session = displayViewModel.currentDeviceSession() else { return }
    guard let camera = await openCamera() else {
      await showProblem(cameraDenied ? .cameraNeeded : .other, detail: OwlError.noCamera.errorDescription)
      return
    }
    narration = []
    do {
      try camera.startClip()
    } catch {
      await showProblem(.other, detail: (error as? LocalizedError)?.errorDescription)
      return
    }
    isRecordingStep = true
    statusText = "Recording a step"
    listener.onPartial = nil
    listener.onFinal = { [weak self] text in
      guard let self, self.isRecordingStep else { return }
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
    // Sent or not, the clip does not stay on the phone: a step that failed is recorded again.
    defer { if let clip { try? FileManager.default.removeItem(at: clip) } }
    guard let photo else {
      await showProblem(.other, detail: OwlError.noCamera.errorDescription, retry: { await $0.showRecord() })
      return
    }
    let text = narration.joined(separator: " ")
    let api = api
    let key = UUID().uuidString
    let dropped = droppedSteps
    let upload = Task {
      for key in dropped { _ = try await api.dropRecordedStep(recordingID: recording.id, key: key) }
      return try await api.addRecordedStep(recordingID: recording.id, key: key, narration: text, photo: photo, clip: clip)
    }
    stepUpload = upload
    defer { stepUpload = nil }
    statusText = "Saving step \(recording.steps.count + 1)"
    // A slow connection must not hold the expert here: Cancel gives this step up.
    await showScreen {
      OwlScreens.status(
        OwlStrings.savingStep, detail: OwlStrings.uploadingClip, leave: OwlStrings.cancel, leaveIcon: .x,
        onCancel: self.waitAction { $0.stepUpload?.cancel() })
    }
    do {
      self.recording = try await upload.value
      droppedSteps.removeAll { dropped.contains($0) }
      NSLog("[Owl] recorded step \(self.recording?.steps.count ?? 0) of \(recording.id): clip \(clip != nil), narration \"\(text)\"")
      speaker.say("Step saved.")
      await showRecord()
    } catch {
      guard upload.isCancelled else {
        await showProblem(kind(of: error), detail: (error as? LocalizedError)?.errorDescription, retry: { await $0.showRecord() })
        return
      }
      // owl-api may store the step although the upload was given up, so the step is taken back by
      // its key: now if owl-api answers, otherwise before the next step or the finish.
      droppedSteps.append(key)
      await sendDroppedSteps(of: recording.id)
      NSLog("[Owl] step upload given up; owl-api \(droppedSteps.isEmpty ? "has dropped the step" : "will be told before the next step")")
      speaker.say(OwlStrings.stepNotSaved)
      // On the display too: a Deaf expert must not take the old count for a saved step.
      await showRecord(narration: OwlStrings.stepNotSaved)
    }
  }

  /// Tells owl-api which step uploads were given up. What cannot be sent now stays for later.
  private func sendDroppedSteps(of recordingID: String) async {
    while let key = droppedSteps.first {
      guard let current = try? await api.dropRecordedStep(recordingID: recordingID, key: key) else { return }
      droppedSteps.removeFirst()
      if recording?.id == recordingID { recording = current }
    }
  }

  func finishRecording() async {
    guard let recording, !isRecordingStep else { return }
    let number = newScene()
    closeCamera()
    statusText = "Writing the steps of \(recording.title)"
    // Back ends only the waiting: owl-api goes on writing, and the draft waits in Owl Studio.
    await showScreen {
      OwlScreens.status(
        OwlStrings.writingSteps, detail: OwlStrings.takesAMoment,
        onCancel: self.waitAction { await $0.showTasks(refresh: false) })
    }
    do {
      for key in droppedSteps { _ = try await api.dropRecordedStep(recordingID: recording.id, key: key) }
      droppedSteps = []
      var current = try await api.finishRecording(recording.id)
      // owl-api has the recording now. It is over for the glasses, also when the worker has left this wait.
      self.recording = nil
      for _ in 0..<45 where current.status == "processing" || current.status == "recording" {
        try await Task.sleep(for: .seconds(2))
        guard isCurrent(number) else { return }
        current = try await api.recording(recording.id)
      }
      NSLog("[Owl] recording \(current.id): \(current.status), process \(current.processId ?? "-")")
      guard isCurrent(number) else { return }
      if current.status == "done" {
        statusText = "Recorded: \(current.title)"
        speaker.say("Done. Review the new task in Owl Studio.")
        let title = current.title
        await showScreen(stage: .init(kind: "record", title: OwlStrings.recorded, text: OwlStrings.reviewInStudio(title))) {
          OwlScreens.status(
            OwlStrings.recorded, detail: OwlStrings.reviewInStudio(title), mood: .done,
            onCancel: self.action { await $0.showTasks() })
        }
      } else {
        await showProblem(.server, detail: "Owl couldn't write the steps.")
      }
    } catch {
      guard isCurrent(number) else { return }
      // Finishing again is only possible while the glasses still hold the recording.
      var again: (@MainActor (OwlViewModel) async -> Void)?
      if self.recording != nil { again = { await $0.finishRecording() } }
      await showProblem(kind(of: error), detail: (error as? LocalizedError)?.errorDescription, retry: again)
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
      phoneState = OwlPhoneState(
        title: "Glasses taken off",
        detail: "Owl is paused: it has stopped watching, listening and sharing. It continues when the glasses are put back on.",
        symbol: "pause.circle.fill", tone: .attention)
      speaker.stop()
      listener.stop()
      if helpTask != nil {
        // Sharing the view stops when the glasses come off (JUN-33).
        helpEndedWhileOff = true
        Task { await endHelp() }
      }
    case .donned where !glassesOn:
      glassesOn = true
      statusText = "Welcome back"
      phoneState = nil
      speaker.say(helpEndedWhileOff ? "\(OwlStrings.sayWelcomeBack) \(OwlStrings.sayHelpEnded)" : OwlStrings.sayWelcomeBack)
      helpEndedWhileOff = false
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
      phoneState = OwlPhoneState(
        title: "Paused by the glasses", detail: "The glasses paused Owl. It continues when the worker opens it again.",
        symbol: "pause.circle.fill", tone: .attention)
    case .stopped:
      stopEverything()
      newScene()
      closeCamera()
      listener.detach()
      statusText = "Owl closed on the glasses"
      phoneState = OwlPhoneState(
        title: "Owl is closed on the glasses", detail: "Say \u{201C}Hey Meta, start Owl\u{201D} to open it again.",
        symbol: "eyeglasses", tone: .attention)
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
    phoneState = nil
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

  // MARK: - Problems (JUN-42)

  /// Shows what is in the way on the glasses, and the same on the phone. Each kind says
  /// what happened and what still works.
  private func showProblem(
    _ kind: OwlProblemKind, detail: String? = nil, retry: (@MainActor (OwlViewModel) async -> Void)? = nil
  ) async {
    newScene()
    NSLog("[Owl] problem: \(kind.rawValue) \(detail ?? "")")
    let state = Self.phoneState(for: kind, detail: detail)
    statusText = state.title
    phoneState = state
    speaker.say(kind == .server || kind == .other ? OwlStrings.sayCantHelp : OwlStrings.problemTitle(kind))
    if access.audioFirst {
      // What still works and what to do is on the display: said aloud too, with what the pinch does.
      speaker.say(OwlStrings.problemBody(kind), interrupt: false)
      sayChoices(retry != nil ? OwlStrings.sayPinchToTryAgain : OwlStrings.sayPinchToGoBack)
    }
    let inTask = process != nil
    // Glasses that belong to no one have nowhere to go back to.
    let home: OwlAction? =
      kind == .notAssigned ? nil : action { await inTask ? $0.backToStep() : $0.showTasks(refresh: false) }
    await showScreen(stage: .init(kind: "problem", title: OwlStrings.problemTitle(kind), text: OwlStrings.problemBody(kind))) {
      OwlScreens.problem(
        kind, detail: detail,
        onRetry: retry.map { retry in self.action { await retry($0) } },
        onHome: home, homeLabel: inTask ? OwlStrings.backToStep : nil)
    }
  }

  private func kind(of error: Error) -> OwlProblemKind {
    switch error as? OwlError {
    case .offline: .offline
    case .cameraPermissionDenied: .cameraNeeded
    case .microphonePermissionDenied: .microphoneNeeded
    case .unauthorized: .notAllowed
    case .glassesNotAssigned: .notAssigned
    case .server, .decoding, .rateLimited, .notFound: .server
    default: .other
    }
  }

  /// The same state for the phone, in the employer's words: what happened and what to do.
  private static func phoneState(for kind: OwlProblemKind, detail: String?) -> OwlPhoneState {
    switch kind {
    case .cameraNeeded:
      OwlPhoneState(
        title: "Camera not allowed",
        detail: "Tap Permissions and allow the camera in Meta AI. Until then the worker can follow the steps, but Owl cannot check them.",
        symbol: "camera.fill", tone: .problem)
    case .microphoneNeeded:
      OwlPhoneState(
        title: "Microphone not allowed",
        detail: "Tap Permissions and allow the microphone in Meta AI. Ask and narration do not work until then.",
        symbol: "mic.slash.fill", tone: .problem)
    case .offline:
      OwlPhoneState(
        title: "No connection to Owl's server",
        detail: "Saved tasks still work on the glasses. Checks, Ask and Help need the server: check the address under Server.",
        symbol: "wifi.slash", tone: .problem)
    case .server:
      OwlPhoneState(
        title: "Owl's server has a problem",
        detail: detail ?? "The server answered with an error. Steps still work; checks are not counted until it answers again.",
        symbol: "exclamationmark.triangle.fill", tone: .problem)
    case .notAllowed:
      OwlPhoneState(
        title: "Owl's server refused the token", detail: "Set the API token under Server.",
        symbol: "lock.fill", tone: .problem)
    case .notAssigned:
      OwlPhoneState(
        title: "These glasses are not assigned",
        detail: "In Owl Studio, open People and give \(glassesID) to a worker.", symbol: "person.fill.questionmark",
        tone: .attention)
    case .video:
      OwlPhoneState(
        title: "The clip cannot play",
        detail: "The glasses play clips over https only. Start the https tunnel and set its address under Server.",
        symbol: "play.slash.fill", tone: .attention)
    case .other:
      OwlPhoneState(
        title: "Something went wrong", detail: detail ?? "Try again.", symbol: "exclamationmark.circle.fill",
        tone: .problem)
    }
  }

  // MARK: - Helpers

  private func stopEverything() {
    endConversation()
    stopCheckLoop()
    stopRecognition()
    helpTask?.cancel()
    helpTask = nil
    // A call left behind would keep ringing the manager: owl-api ends it and deletes its pictures.
    if let helpID {
      let api = api
      Task { _ = try? await api.endHelp(helpID) }
      self.helpID = nil
      helpTo = nil
      helpSession = nil
      helpFromCounter = false
    }
    listener.stop()
    isRecordingStep = false
    camera?.discardClip()
  }

  /// Sends a screen and remembers it, so it can be sent again later. `stage` describes it
  /// for the stage page (JUN-79).
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

  private func image(_ urlString: String?) async -> UIImage? {
    guard let urlString else { return nil }
    if let cached = images[urlString] { return cached }
    guard let image = try? await api.image(urlString) else {
      // No connection: the picture kept from the last time the tasks were loaded.
      return OwlCache.image(for: urlString)
    }
    // The display is 600×600; smaller images keep the Bluetooth link fast.
    let scaled = image.owlScaled(maxSide: 480)
    images[urlString] = scaled
    OwlCache.save(image: scaled, for: urlString)
    return scaled
  }

  /// Fetches the step pictures of the worker's tasks once the tasks are known, so a step
  /// still has its picture when the connection is gone (the spec: saved tasks work offline).
  private func keepStepPictures() {
    let urls = myProcesses.flatMap(\.steps).compactMap(\.referenceImageUrl)
    OwlCache.removeImages(except: urls)
    Task { [weak self] in
      for url in urls { _ = await self?.image(url) }
    }
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

  /// A button of the step or correction card. For a moment after Owl itself changed the card
  /// (a correction appeared, or cleared because the worker fixed it), a pinch is ignored: it
  /// was aimed at a button that is no longer in focus, and must not become Done, Watch or Back.
  private func cardAction(_ body: @escaping @MainActor (OwlViewModel) async -> Void) -> OwlAction {
    action { model in
      guard model.pinchCounts() else { return }
      await body(model)
    }
  }

  private func pinchCounts() -> Bool {
    let sinceSwap = cardSwappedAt.map { (ContinuousClock.now - $0) / .seconds(1) }
    guard OwlCheckRules.pinchCounts(sinceSwap: sinceSwap) else {
      NSLog("[Owl] pinch ignored: Owl changed the card \(Int((sinceSwap ?? 0) * 1000)) ms ago")
      return false
    }
    return true
  }

  /// The way out of a waiting screen. A pinch in its first moment is ignored: it is the second
  /// half of a double pinch on the button that led to the wait, not a wish to leave it.
  private func waitAction(_ body: @escaping @MainActor (OwlViewModel) async -> Void) -> OwlAction {
    let shown = ContinuousClock.now
    return action { model in
      guard ContinuousClock.now - shown > .milliseconds(1200) else { return }
      await body(model)
    }
  }
}

/// The last employee and processes, so a known task still works without network.
enum OwlCache {
  private struct Saved: Codable {
    let employee: OwlEmployee
    let processes: [OwlProcess]
    /// The glasses and the worker setting the tasks were saved for. Saved tasks are for one
    /// worker on one pair of glasses: a phone pointed at other glasses starts with none.
    var glassesID: String?
    var employeeID: String?
  }

  private static var url: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("owl-cache.json")
  }

  static func save(employee: OwlEmployee, processes: [OwlProcess], glassesID: String, employeeID: String) {
    let saved = Saved(employee: employee, processes: processes, glassesID: glassesID, employeeID: employeeID)
    guard let data = try? JSONEncoder().encode(saved) else { return }
    try? data.write(to: url, options: .atomic)
  }

  /// The saved tasks, when they were saved for these glasses and this worker setting.
  static func load(glassesID: String, employeeID: String) -> (employee: OwlEmployee, processes: [OwlProcess])? {
    guard let data = try? Data(contentsOf: url),
      let saved = try? JSONDecoder().decode(Saved.self, from: data),
      saved.glassesID == glassesID, saved.employeeID == employeeID
    else { return nil }
    return (saved.employee, saved.processes)
  }

  // Step pictures of the saved tasks, for when there is no connection.

  private static var imageFolder: URL {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
      .appendingPathComponent("owl-step-pictures", isDirectory: true)
  }

  /// One file per picture, named after the path of its address: the server's address changes
  /// with every tunnel, the path does not.
  private static func imageFile(for urlString: String) -> URL? {
    let path = URL(string: urlString)?.path ?? urlString
    let name = String(path.map { $0.isLetter || $0.isNumber || $0 == "." || $0 == "-" ? $0 : "_" }.suffix(120))
    return name.isEmpty ? nil : imageFolder.appendingPathComponent(name)
  }

  static func save(image: UIImage, for urlString: String) {
    guard let file = imageFile(for: urlString), let data = image.jpegData(compressionQuality: 0.8) else { return }
    try? FileManager.default.createDirectory(at: imageFolder, withIntermediateDirectories: true)
    try? data.write(to: file, options: .atomic)
  }

  static func image(for urlString: String) -> UIImage? {
    guard let file = imageFile(for: urlString), let data = try? Data(contentsOf: file) else { return nil }
    return UIImage(data: data)
  }

  /// Deletes the pictures of tasks that are no longer this worker's.
  static func removeImages(except urlStrings: [String]) {
    let keep = Set(urlStrings.compactMap { imageFile(for: $0)?.lastPathComponent })
    let files = (try? FileManager.default.contentsOfDirectory(atPath: imageFolder.path)) ?? []
    for name in files where !keep.contains(name) {
      try? FileManager.default.removeItem(at: imageFolder.appendingPathComponent(name))
    }
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
    // "Done" and "Check again" are one action: the final check of this step.
    case "done", "again": if pinchCounts() { await finishStep() }
    // `afterswap:<step>` waits until Owl itself changes the card, then runs the step at once:
    // the pinch that was on its way when the card changed.
    case "afterswap":
      let before = cardSwappedAt
      for _ in 0..<200 where cardSwappedAt == before { try? await Task.sleep(for: .milliseconds(50)) }
      await runTestStep(argument)
    // "Back" on a correction or a cannot-check card.
    case "back": if pinchCounts() { await closeCard() }
    // "Back" while a final check is running.
    case "cancel": await cancelFinalCheck()
    // "Continue unverified" exists only on the cannot-check card, and records that card's reason.
    case "continue":
      if case .cannotCheck(let why, _) = card { await continueUnverified(why) } else { NSLog("[Owl] test: no cannot-check card to continue from") }
    case "step": await backToStep()
    case "watch": await watchHow()
    case "ask": await ask()
    case "answer": await answer(argument)
    case "endask": await endAsk()
    // At the counter, Help is the counter's own Help button: the counter comes back after it.
    case "help": if assistScene != nil { await helpFromCustomerService() } else { await startHelp() }
    case "endhelp": await endHelp()
    // JUN-100: the worker's two choices, and their spoken answer.
    case "callmanager":
      if let id = employee?.id, let manager = try? await api.shiftManager(forWorker: id) {
        await callForHelp(to: "manager", managerName: manager.name)
      }
    case "callexpert": await callForHelp(to: nil, managerName: nil)
    case "reply": await answerHelp()
    // The manager's glasses.
    case "accept":
      if let id = ringingShown, let manager = employee,
        let request = try? await api.incomingHelp(managerID: manager.id).first(where: { $0.id == id })
      {
        await acceptCall(request, place: request.stepIndex.map { OwlStrings.stepNamed($0, request.stepTitle) })
      }
    case "later": if let id = ringingShown { await laterCall(id) }
    case "talk": await talk()
    case "endcall": await endCall()
    case "record": await startRecording()
    case "recordstep": await startRecordedStep()
    case "endstep": await endRecordedStep()
    case "finish": await finishRecording()
    case "progress": await showProgress()
    case "training":
      if let id = employee?.id, let training = try? await api.training(employeeID: id) {
        await showTrainingResult(training, then: { await $0.showTasks() })
      }
    case "recognize": if let current = self.step, recognizes(current) { await startRecognition(scene) }
    case "allow": await saveConsent(cameraChecks: true, recording: consent?.recording ?? false); await open()
    case "decline": await saveConsent(cameraChecks: false, recording: consent?.recording ?? false); await open()
    case "agreerecord":
      // What the "I agree" button does: the consent is saved and the recording starts.
      await saveConsent(cameraChecks: consent?.cameraChecks ?? false, recording: true)
      await startRecording()
    case "camera": await toggleCamera()
    // "Forget me" asks first; `forgetyes` and `forgetno` are its two choices.
    case "forget": await confirmForget()
    case "forgetyes": await forgetMe()
    case "forgetno": await showProgress()
    case "resetconsent":
      if let id = employee?.id {
        UserDefaults.standard.removeObject(forKey: Self.consentKey(id))
        UserDefaults.standard.removeObject(forKey: Self.locationAskedKey(id))
      }
      consent = nil
    case "mock": mockCheck = argument.isEmpty ? nil : argument
    case "customerservice": await startCustomerService()
    case "hint": await hintAgain()
    case "endcustomerservice": await endCustomerService()
    case "allowlocation", "declinelocation":
      if let id = employee?.id { UserDefaults.standard.set(true, forKey: Self.locationAskedKey(id)) }
      await saveConsent(
        cameraChecks: consent?.cameraChecks ?? false, recording: consent?.recording ?? false,
        location: name == "allowlocation")
      await open()
    // `bg:<step>` starts a step and goes on, so the script can act while that step waits.
    case "bg": Task { await self.runTestStep(argument) }
    // "Cancel" while a recorded step is being sent.
    case "cancelsave": stepUpload?.cancel()
    case "wait": try? await Task.sleep(for: .seconds(Double(argument) ?? 1))
    default: NSLog("[Owl] test: unknown step \(name)")
    }
    NSLog("[Owl] test: now \(statusText)")
  }
}
#endif
