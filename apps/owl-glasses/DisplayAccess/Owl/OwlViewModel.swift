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
  @ObservationIgnored private var cameraDenied = false
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
  /// The attempt whose final check is running, or nil.
  @ObservationIgnored private var finishingAttempt: Int?
  @ObservationIgnored private var isPlayingClip = false

  // Help
  @ObservationIgnored private var helpID: String?
  @ObservationIgnored private var helpTask: Task<Void, Never>?
  @ObservationIgnored private var lastSpokenExpertMessage = 0
  @ObservationIgnored private var helpEndedWhileOff = false

  // Record
  @ObservationIgnored private var recording: OwlRecording?
  @ObservationIgnored private var isRecordingStep = false
  @ObservationIgnored private var narration: [String] = []

  /// For the simulator only: forces a `/check` answer from the mock API (`ok`, `warning`, ...).
  @ObservationIgnored var mockCheck: String? = ProcessInfo.processInfo.environment["OWL_MOCK_CHECK"]

  private enum StepCard: Equatable {
    case step
    case correction
    case checking
    case cannotCheck(OwlCheckBlock, String?)
  }

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
    stopCheckLoop()
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
    await show(OwlScreens.status("Owl", detail: OwlStrings.gettingTasks, mood: .listening), deviceIdentifier: deviceIdentifier)
    watchGlasses()
    await loadTasks()
    guard isCurrent(number) else { return displayViewModel.isConnected }
    if glassesNotAssigned {
      await showProblem(.notAssigned, retry: { await $0.open() })
      return displayViewModel.isConnected
    }
    if !welcomed, let employee {
      welcomed = true
      speaker.say(employee.welcome ?? OwlStrings.welcomeBody)
      await showScreen {
        OwlScreens.welcome(employee: employee, onStart: self.action { await $0.showTasks(refresh: false) })
      }
    } else {
      await showTasks(refresh: false)
    }
    return displayViewModel.isConnected
  }

  /// The published tasks assigned to this worker in Owl Studio (`process_ids`), in that
  /// order: publishing a task and giving it to a worker are two steps. With no worker
  /// known, every published task.
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
    await drawTasks()
    guard refresh else { return }
    let before = myProcesses.map(\.id)
    await loadTasks()
    guard isCurrent(number), !glassesNotAssigned, myProcesses.map(\.id) != before else { return }
    await drawTasks()
  }

  private func drawTasks() async {
    let tasks = myProcesses
    let employee = employee
    statusText = isOffline ? "Offline: \(tasks.count) saved tasks" : "\(tasks.count) tasks"
    let select: @Sendable (String) -> Void = { [weak self] id in
      Task { @MainActor in await self?.startProcess(id) }
    }
    await showScreen {
      OwlScreens.taskList(
        employee: employee, processes: tasks, onSelect: select,
        onRecord: self.action { await $0.startRecording() })
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
      // Steps in the worker's own language when the process has a translation.
      let processes = try await api.processes(language: employee.language)
      self.employee = employee
      self.processes = processes
      isOffline = false
      OwlCache.save(employee: employee, processes: processes)
      use(language: employee.language)
      phoneState = nil
    } catch OwlError.glassesNotAssigned {
      NSLog("[Owl] glasses \(Self.glassesID) are not assigned")
      glassesNotAssigned = true
      employee = nil
      processes = []
    } catch {
      NSLog("[Owl] loading tasks failed: \(error)")
      isOffline = (error as? OwlError)?.isServiceProblem ?? true
      // No network: saved tasks still work (spec), without Owl Check. They are reused only
      // for the worker they were saved for: on a shared pair of glasses, one worker never
      // gets another worker's list.
      let known = fresh ?? employee
      if let cached = OwlCache.load(), known == nil || cached.employee.id == known?.id {
        employee = fresh ?? cached.employee
        processes = cached.processes
      } else if let fresh {
        employee = fresh
        processes = []
      }
      if let employee { use(language: employee.language) }
      phoneState = Self.phoneState(for: kind(of: error), detail: nil)
    }
  }

  private func use(language: String) {
    speaker.language = language
    OwlStrings.language = language
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
    await openStep(speak: true)
  }

  /// Shows the current step and starts watching it. `speak` is false when the worker comes
  /// back to a step they have already heard (after Ask, Help or a clip). `after` is said
  /// first, in the same breath ("Step done.").
  private func openStep(speak: Bool, after: String? = nil) async {
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
    live = step.check.usesCamera ? .starting : .noCheck
    statusText = "Step \(step.index)/\(process.steps.count): \(step.title)"
    let words = [after, speak ? step.say : nil].compactMap { $0 }.joined(separator: " ")
    if !words.isEmpty { speaker.say(words) }
    await render(number)
    guard isCurrent(number), step.check.usesCamera else { return }
    await startWatching(number)
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
    switch card {
    case .checking:
      await showScreen {
        OwlScreens.checking(step: step, onBack: self.action { await $0.cancelFinalCheck() })
      }
    case .cannotCheck(let why, let hint):
      // Without a camera there is nothing to try again.
      let canRetry = why != .cameraOff
      await showScreen {
        OwlScreens.cannotCheck(
          step: step, why: why, hint: hint,
          onCheckAgain: canRetry ? self.action { await $0.finishStep() } : nil,
          onContinue: self.action { await $0.continueUnverified(why) },
          onBack: self.action { await $0.closeCard() })
      }
    case .correction:
      guard let correction else { return }
      await showScreen {
        // "Check again" and the step card's "Done" are the same action, so a pinch that lands
        // just as the card changes still means what the worker meant: check this step.
        OwlScreens.correction(
          process: process, step: step, result: correction, image: image,
          onCheckAgain: self.action { await $0.finishStep() },
          onBack: self.action { await $0.closeCard() })
      }
    case .step:
      let live = live
      let log = log
      await showScreen {
        OwlScreens.step(
          process: process, step: step, image: image, live: live, log: log,
          onDone: self.action { await $0.finishStep() },
          onWatch: step.clipUrl == nil ? nil : self.action { await $0.watchHow() },
          onAsk: self.action { await $0.ask() },
          onHelp: self.action { await $0.startHelp() })
      }
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
    guard let camera = await openCamera() else {
      guard isCurrent(number) else { return }
      phoneState = Self.phoneState(for: cameraDenied ? .cameraNeeded : .other, detail: "The glasses camera did not start.")
      await setLive(.blocked(cameraDenied ? .cameraOff : .cameraFailed), number)
      return
    }
    guard isCurrent(number) else { return }
    await setLive(.watching, number)
    checkTask = Task { [weak self] in
      while !Task.isCancelled {
        try? await Task.sleep(for: Self.checkInterval)
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
      let result = try await api.check(
        frame: frame, processID: process.id, stepID: step.id, runID: runID, final: false,
        language: language, mock: mockCheck)
      guard isCurrent(number), OwlRun.isCurrent(ticket, self.ticket), finishingAttempt == nil else {
        NSLog("[Owl] check \(step.id): a late live answer was dropped")
        return
      }
      checkFailures = 0
      NSLog("[Owl] check \(step.id) live: \(result.status)")
      await applyLive(result, number)
    } catch {
      guard isCurrent(number), OwlRun.isCurrent(ticket, self.ticket) else { return }
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

  private func applyLive(_ result: OwlCheckResult, _ number: Int) async {
    if phoneState != nil, glassesOn { phoneState = nil }
    switch result.status {
    case "warning":
      let signature = OwlRun.signature(result)
      if signature == dismissed {
        // The worker closed this card. Owl keeps the hint on the step card and waits.
        await setLive(.needsFix(OwlStrings.correctionTitle(result)), number)
        return
      }
      dismissed = nil
      let isNew = signature != announced
      announced = signature
      // Each problem is said once, however many frames show it.
      if isNew, let say = result.say { speaker.say(say) }
      guard isNew || correction == nil, card == .step || card == .correction else { return }
      correction = result
      card = .correction
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
        if card == .correction { card = .step }
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

  /// "Back" on a correction or a cannot-check card: back to the step card, same task, same
  /// step.
  private func closeCard() async {
    if card == .correction, let correction {
      dismissed = OwlRun.signature(correction)
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
    guard let step, finishingAttempt == nil else { return }
    let number = scene
    guard step.check.usesCamera else {
      log.confirm(step)
      await nextStep()
      return
    }
    if case .blocked(let why) = live, why == .cameraOff || why == .cameraFailed, camera == nil {
      card = .cannotCheck(why, nil)
      await render(number)
      return
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

    switch OwlRun.verdict(result: result, failure: failure, ticket: ticket, current: self.ticket) {
    case .stale:
      // The worker pressed Back or left the step while Owl was checking.
      NSLog("[Owl] check \(step.id) final: a late answer was dropped")
    case .verified:
      guard let result, log.verify(step, result: result, ticket: ticket, current: self.ticket) else { return }
      NSLog("[Owl] check \(step.id) final: verified")
      phoneState = nil
      await nextStep(after: result.say)
    case .problem:
      guard let result else { return }
      NSLog("[Owl] check \(step.id) final: \(result.problem ?? "problem")")
      let signature = OwlRun.signature(result)
      if signature != announced, let say = result.say { speaker.say(say) }
      announced = signature
      dismissed = nil
      correction = result
      card = .correction
      statusText = "Check this: \(result.text ?? result.problem ?? "")"
      await render(number)
    case .cannotCheck(let why):
      NSLog("[Owl] check \(step.id) final: cannot check (\(why.rawValue))")
      // The hint is spoken only now, on the check the worker asked for.
      speaker.say(result?.say ?? result?.hint ?? OwlStrings.cannotCheck)
      card = .cannotCheck(why, result?.hint)
      statusText = "Owl can't check step \(step.index): \(why.rawValue)"
      await render(number)
    }
  }

  /// One final check, on a picture taken after the pinch. Bounded, so the worker never
  /// waits on a spinner: it ends with an answer or with the reason there is none.
  private func finalCheck(after pinch: Date, ticket: OwlCheckTicket) async -> (OwlCheckResult?, OwlCheckBlock?) {
    guard let process, let step else { return (nil, .serverError) }
    guard let camera = await openCamera() else { return (nil, cameraDenied ? .cameraOff : .cameraFailed) }
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: Self.finalCheckLimit)
    var newerThan = pinch
    while clock.now < deadline {
      guard OwlRun.isCurrent(ticket, self.ticket) else { return (nil, nil) }
      guard let frame = await camera.frame(after: newerThan) else { return (nil, .cantSee) }
      do {
        let api = api
        let runID = runID
        let language = language
        let mock = mockCheck
        let result = try await withOwlTimeout(Self.finalCheckLimit) {
          try await api.check(
            frame: frame, processID: process.id, stepID: step.id, runID: runID, final: true,
            language: language, mock: mock)
        }
        checkFailures = 0
        if result.status != "checking" { return (result, nil) }
        // The engine is still busy with the frame before. Ask again with a newer picture.
        newerThan = Date()
        try? await Task.sleep(for: .milliseconds(600))
      } catch {
        NSLog("[Owl] final check failed: \(error)")
        if case .rateLimited = error as? OwlError {
          try? await Task.sleep(for: .seconds(2))
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
      newScene()
      closeCamera()
      let summary = log.summary(of: process)
      statusText =
        summary.unverified > 0
        ? "Finished \(process.title): \(summary.unverified) of \(summary.checked) checks not verified"
        : "Finished \(process.title): \(summary.verified) checks verified"
      speaker.say([after, OwlStrings.sayFinished(summary)].compactMap { $0 }.joined(separator: " "))
      await showScreen {
        OwlScreens.done(process: process, summary: summary, onHome: self.action { await $0.showTasks() })
      }
    }
  }

  private func block(for error: Error) -> OwlCheckBlock {
    switch error as? OwlError {
    case .offline: .offline
    case .cameraTimeout: .timedOut
    case .cameraPermissionDenied: .cameraOff
    case .noCamera, .stream: .cameraFailed
    default: .serverError
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
    statusText = "Playing the expert's clip"
    isPlayingClip = true
    var finished = false
    await displayViewModel.playVideo(url: url.absoluteString) { [weak self] played in
      guard let self, !finished else { return }
      finished = true
      // The worker may have moved on while the clip played.
      guard self.isCurrent(number) else { return }
      self.isPlayingClip = false
      Task {
        if played {
          await self.showScreen {
            OwlScreens.afterClip(
              step: step, onReplay: self.action { await $0.watchHow() },
              onBack: self.action { await $0.backToStep() })
          }
        } else {
          await self.showProblem(.video)
        }
      }
    }
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
      await showScreen {
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

  private func startHelp() async {
    let number = newScene()
    guard let camera = await openCamera() else {
      guard isCurrent(number) else { return }
      await showProblem(cameraDenied ? .cameraNeeded : .other, detail: OwlError.noCamera.errorDescription)
      return
    }
    guard isCurrent(number) else { return }
    helpID = nil
    lastSpokenExpertMessage = 0
    speaker.say(OwlStrings.sayCallingExpert)
    await showScreen { OwlScreens.help(session: nil, marked: nil, onEnd: self.action { await $0.endHelp() }) }
    helpTask = Task { [weak self] in
      while !Task.isCancelled {
        guard let self, self.isCurrent(number) else { return }
        // Nothing is shared while the glasses are off.
        if self.glassesOn { await self.helpTick(camera: camera, number) }
        try? await Task.sleep(for: Self.helpInterval)
      }
    }
  }

  private func helpTick(camera: OwlCamera, _ number: Int) async {
    do {
      let session: OwlHelpSession
      if let frame = camera.latestJPEG(maxSide: 800) {
        session = try await api.sendHelpFrame(
          frame, helpID: helpID, employeeID: employee?.id, processID: process?.id, stepID: step?.id)
      } else if let helpID {
        session = try await api.help(helpID)
      } else {
        return
      }
      guard !Task.isCancelled, isCurrent(number) else { return }
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
        // The expert can point: their latest marked picture of the worker's own view.
        let pointed = session.messages.last { $0.from == "expert" }?.imageUrl
        let marked = await image(pointed)
        guard isCurrent(number) else { return }
        await showScreen {
          OwlScreens.help(session: session, marked: marked, onEnd: self.action { await $0.endHelp() })
        }
      }
    } catch {
      NSLog("[Owl] help failed: \(error)")
      statusText = "Help: \((error as? LocalizedError)?.errorDescription ?? "\(error)")"
    }
  }

  /// Ends Help: sharing stops at once, and owl-api deletes the shared pictures.
  private func endHelp() async {
    helpTask?.cancel()
    helpTask = nil
    if let helpID {
      let api = api
      Task { _ = try? await api.endHelp(helpID) }
    }
    helpID = nil
    if process != nil { await backToStep() } else { await showTasks(refresh: false) }
  }

  // MARK: - Record (JUN-32)

  func startRecording() async {
    stopEverything()
    let number = newScene()
    await showScreen { OwlScreens.status(OwlStrings.record, detail: OwlStrings.takesAMoment, mood: .listening) }
    do {
      let started = try await api.startRecording(
        title: "New task \(Date().formatted(date: .omitted, time: .shortened))",
        expert: employee?.name ?? "Expert")
      guard isCurrent(number) else { return }
      recording = started
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
    await showScreen {
      OwlScreens.record(
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
    await showScreen { OwlScreens.status(OwlStrings.savingStep, detail: OwlStrings.uploadingClip) }
    guard let photo else {
      await showProblem(.other, detail: OwlError.noCamera.errorDescription, retry: { await $0.showRecord() })
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
      await showProblem(kind(of: error), detail: (error as? LocalizedError)?.errorDescription, retry: { await $0.showRecord() })
    }
  }

  func finishRecording() async {
    guard let recording else { return }
    closeCamera()
    await showScreen { OwlScreens.status(OwlStrings.writingSteps, detail: OwlStrings.takesAMoment) }
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
        let title = current.title
        await showScreen {
          OwlScreens.status(
            OwlStrings.recorded, detail: OwlStrings.reviewInStudio(title), mood: .done,
            onCancel: self.action { await $0.showTasks() })
        }
      } else {
        await showProblem(.server, detail: "Owl couldn't write the steps.")
      }
    } catch {
      await showProblem(kind(of: error), detail: (error as? LocalizedError)?.errorDescription, retry: { await $0.finishRecording() })
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
    let inTask = process != nil
    // Glasses that belong to no one have nowhere to go back to.
    let home: OwlAction? =
      kind == .notAssigned ? nil : action { await inTask ? $0.backToStep() : $0.showTasks(refresh: false) }
    await showScreen {
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
        title: "No connection to owl-api",
        detail: "Saved tasks still work on the glasses. Checks, Ask and Help need the server: check the address under Server.",
        symbol: "wifi.slash", tone: .problem)
    case .server:
      OwlPhoneState(
        title: "owl-api has a problem",
        detail: detail ?? "The server answered with an error. Steps still work; checks are not counted until it answers again.",
        symbol: "exclamationmark.triangle.fill", tone: .problem)
    case .notAllowed:
      OwlPhoneState(
        title: "owl-api refused the token", detail: "Set the API token under Server.", symbol: "lock.fill",
        tone: .problem)
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
    // "Done" and "Check again" are one action: the final check of this step.
    case "done", "again": await finishStep()
    // "Back" on a correction or a cannot-check card.
    case "back": await closeCard()
    // "Back" while a final check is running.
    case "cancel": await cancelFinalCheck()
    case "continue": await continueUnverified(.cantSee)
    case "step": await backToStep()
    case "watch": await watchHow()
    case "ask": await ask()
    case "answer": await answer(argument)
    case "endask": await endAsk()
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
