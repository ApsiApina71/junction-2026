//
// OwlScreenGallery.swift
//
// Every Owl screen with sample data, for looking at them in the real DAT renderer (JUN-36).
// In the simulator, `OWL_PREVIEW_SCREEN=<name>` shows one screen on the mock glasses
// (see CLAUDE.md). Add `-fi` for Finnish and `-long` for the longest copy the contract
// allows, for example `correction-fi` or `step-long`.
//
// The sample data mirrors `apps/owl-api/fixtures/` (the pick and pack task of Kide Logistics).
//

import MWDATCore
import MWDATDisplay
import UIKit

@MainActor
enum OwlScreenGallery {
  static let names = [
    "welcome", "tasks", "tasks-offline", "tasks-nothing-saved", "tasks-none", "step", "step-starting", "step-looks-right", "step-cant-see", "step-blocked", "step-visual",
    "step-no-check", "correction", "correction-missing", "correction-too-many", "correction-names",
    "correction-visual", "checking", "cannot-check", "cannot-check-offline", "done", "done-unverified",
    "done-no-checks", "after-clip", "listening", "listening-heard", "answer", "answer-not-found", "help",
    "help-connected", "help-marked", "record", "record-step", "status", "problem-camera", "problem-microphone",
    "problem-offline", "problem-server", "problem-not-allowed", "problem-not-assigned", "problem-video",
    "consent", "progress", "progress-training", "training-ready", "training-more", "training-confirmed", "goto", "step-tracking", "location-consent", "help-choice", "help-calling", "help-manager", "help-manager-answer", "manager-home", "manager-incoming", "manager-live", "manager-live-talk", "manager-live-said", "customer-service", "assist", "assist-heard", "assist-busy", "assist-hint", "assist-unsure", "forget", "step-caption", "step-camera-paused", "step-suggests", "done-checks-off",
  ]

  /// The screen for a gallery name, or nil when the name is unknown.
  static func screen(_ fullName: String) -> FlexBox? {
    var name = fullName
    let long = name.hasSuffix("-long")
    if long { name.removeLast(5) }
    let finnish = name.hasSuffix("-fi")
    if finnish { name.removeLast(3) }
    // `-easy`: the easy-language profile's words, e.g. `cannot-check-easy`, `done-unverified-easy-fi`.
    let easy = name.hasSuffix("-easy")
    if easy { name.removeLast(5) }
    OwlStrings.language = finnish ? "fi" : "en"
    OwlStrings.easy = easy

    let data = Sample(finnish: finnish, long: long)
    let process = data.process
    let pick = process.steps[1]
    let pack = process.steps[3]
    let none: OwlAction = {}
    let photo = UIImage(named: "owlDemoFeed")
    var log = OwlRunLog(runID: "gallery")
    log.verify(
      process.steps[0], result: data.ok(final: true), ticket: OwlCheckTicket(runID: "gallery", stepID: "step-1", attempt: 1),
      current: OwlCheckTicket(runID: "gallery", stepID: "step-1", attempt: 1))

    func stepCard(_ step: OwlStep, _ live: OwlLive, image: UIImage? = photo, log: OwlRunLog? = log) -> FlexBox {
      OwlScreens.step(
        process: process, step: step, image: image, live: live, log: log, onDone: none,
        onWatch: step.clipUrl == nil ? nil : none, onAsk: none, onHelp: none)
    }

    switch name {
    case "welcome":
      return OwlScreens.welcome(employee: data.employee, onStart: none)
    case "tasks":
      return OwlScreens.taskList(employee: data.employee, processes: data.processes, onSelect: { _ in }, onRecord: none)
    case "tasks-offline":
      return OwlScreens.taskList(
        employee: data.employee, processes: data.processes, offline: true, onSelect: { _ in }, onRecord: none,
        onProgress: none, onRetry: none)
    case "tasks-nothing-saved":
      return OwlScreens.taskList(
        employee: nil, processes: [], offline: true, onSelect: { _ in }, onRecord: none, onRetry: none)
    case "tasks-none":
      return OwlScreens.taskList(employee: data.employee, processes: [], onSelect: { _ in }, onRecord: none, onProgress: none)
    case "step":
      return stepCard(pick, .watching)
    case "step-starting":
      return stepCard(pick, .starting)
    case "step-looks-right":
      return stepCard(pick, .looksRight)
    case "step-cant-see":
      return stepCard(pick, .cantSee(data.moveCloser))
    case "step-blocked":
      return stepCard(pick, .blocked(.offline))
    case "step-visual":
      var later = log
      later.continueUnverified(pick, why: .offline)
      later.continueUnverified(process.steps[2], why: .cantSee)
      return stepCard(pack, .watching, log: later)
    case "step-no-check":
      return stepCard(data.noCheckStep, .noCheck, image: nil)
    case "correction":
      return OwlScreens.correction(process: process, step: pick, result: data.wrongSize, onCheckAgain: none, onBack: none)
    case "correction-missing":
      return OwlScreens.correction(process: process, step: pick, result: data.missing, onCheckAgain: none, onBack: none)
    case "correction-too-many":
      return OwlScreens.correction(process: process, step: pick, result: data.tooMany, onCheckAgain: none, onBack: none)
    case "correction-names":
      return OwlScreens.correction(process: process, step: pick, result: data.otherProduct, onCheckAgain: none, onBack: none)
    case "correction-visual":
      return OwlScreens.correction(process: process, step: pack, result: data.notMatching, image: photo, onCheckAgain: none, onBack: none)
    case "checking":
      return OwlScreens.checking(step: pick, onBack: none)
    case "cannot-check":
      return OwlScreens.cannotCheck(step: pick, why: .cantSee, hint: data.moveCloser, onCheckAgain: none, onContinue: none, onBack: none)
    case "cannot-check-offline":
      return OwlScreens.cannotCheck(step: pick, why: .offline, hint: nil, onCheckAgain: none, onContinue: none, onBack: none)
    case "done":
      return OwlScreens.done(process: process, summary: data.summary(unverified: []), onHome: none)
    case "done-unverified":
      return OwlScreens.done(process: process, summary: data.summary(unverified: [2, 4]), onHome: none)
    case "done-no-checks":
      let plain = OwlProcess(
        id: "proc-sweep", title: data.finnish ? "Lakaise pakkauspöytä" : "Sweep the packing bench", summary: nil,
        company: nil, language: nil, status: "published", source: "docs", expert: nil, steps: [data.noCheckStep])
      return OwlScreens.done(process: plain, summary: OwlRunLog(runID: "gallery").summary(of: plain), onHome: none)
    case "after-clip":
      return OwlScreens.afterClip(step: pick, onReplay: none, onBack: none)
    case "listening":
      return OwlScreens.listening(prompt: OwlStrings.askPrompt, heard: nil, onCancel: none)
    case "listening-heard":
      return OwlScreens.listening(prompt: OwlStrings.askPrompt, heard: data.question, onCancel: none)
    case "answer":
      return OwlScreens.answer(question: data.question, answer: data.answer, onAskAgain: none, onBack: none)
    case "answer-not-found":
      return OwlScreens.answer(question: data.otherQuestion, answer: data.notFound, onAskAgain: none, onBack: none)
    case "help":
      return OwlScreens.help(session: nil, marked: nil, onEnd: none)
    case "help-connected":
      return OwlScreens.help(session: data.help, marked: nil, onEnd: none)
    case "help-marked":
      return OwlScreens.help(session: data.help, marked: photo, onEnd: none)
    case "record":
      return OwlScreens.record(
        title: process.title, stepCount: 2, isRecordingStep: false, narration: nil, onStartStep: none, onEndStep: none,
        onFinish: none, onBack: none)
    case "record-step":
      return OwlScreens.record(
        title: process.title, stepCount: 2, isRecordingStep: true, narration: data.narration, onStartStep: none,
        onEndStep: none, onFinish: none, onBack: none)
    case "status":
      return OwlScreens.status(OwlStrings.writingSteps, detail: OwlStrings.takesAMoment, onCancel: none)
    case "problem-camera":
      return OwlScreens.problem(.cameraNeeded, onRetry: nil, onHome: none, homeLabel: OwlStrings.backToStep)
    case "problem-microphone":
      return OwlScreens.problem(.microphoneNeeded, onRetry: nil, onHome: none, homeLabel: OwlStrings.backToStep)
    case "problem-offline":
      return OwlScreens.problem(.offline, onRetry: none, onHome: none)
    case "problem-server":
      return OwlScreens.problem(.server, detail: "Owl's server answered 503.", onRetry: none, onHome: none)
    case "problem-not-allowed":
      return OwlScreens.problem(.notAllowed, onRetry: none, onHome: none)
    case "problem-not-assigned":
      return OwlScreens.problem(.notAssigned, onRetry: none, onHome: none)
    case "problem-video":
      return OwlScreens.problem(.video, onRetry: nil, onHome: none, homeLabel: OwlStrings.backToStep)
    case "consent":
      return OwlScreens.consent(
        title: data.finnish ? "Owlin kamera" : "Owl's camera", lines: data.consentLines,
        allowLabel: data.finnish ? "Salli tarkistukset" : "Allow checks", declineLabel: data.finnish ? "Ei tarkistuksia" : "No checks",
        onAllow: none, onDecline: none)
    case "progress":
      return OwlScreens.progress(
        title: data.finnish ? "Edistymisesi" : "Your progress", lines: data.progressLines, onHome: none, onForget: none)
    case "progress-training":
      return OwlScreens.progress(
        title: data.finnish ? "Edistymisesi" : "Your progress", lines: data.progressLines, training: data.trainingLines,
        onHome: none, onForget: none)
    case "training-ready":
      return OwlScreens.trainingResult(ready: true, practise: [], confirmedBy: nil, onOK: none)
    case "training-more":
      return OwlScreens.trainingResult(ready: false, practise: data.practise, confirmedBy: nil, onOK: none)
    case "training-confirmed":
      return OwlScreens.trainingResult(ready: false, practise: data.practise, confirmedBy: "Laura", onOK: none)
    case "help-choice":
      return OwlScreens.helpChoice(managerName: "Mika", onManager: none, onExpert: none, onBack: none)
    case "help-calling":
      return OwlScreens.calling(managerName: "Mika", onEnd: none)
    case "help-manager", "help-manager-answer":
      return OwlScreens.help(
        session: data.managerHelp, marked: nil, onEnd: none, watcher: "Mika",
        heard: name == "help-manager-answer" ? data.workerAnswer : nil, onAnswer: none)
    case "manager-home":
      return OwlScreens.managerHome(name: "Mika", onTasks: none)
    case "manager-incoming":
      return OwlScreens.incoming(
        worker: "Sami", task: process.title, place: "\(OwlStrings.stepOf(pick.index, process.steps.count)) · \(pick.title)",
        onAccept: none, onLater: none)
    case "manager-live", "manager-live-talk", "manager-live-said":
      return OwlScreens.liveView(
        worker: "Sami", place: "\(OwlStrings.stepOf(pick.index, process.steps.count)) · \(pick.title)", frame: photo,
        workerSaid: name == "manager-live-said" ? data.workerAnswer : nil, listening: name == "manager-live-talk",
        heard: name == "manager-live-talk" ? data.managerSays : nil, onTalk: none, onEnd: none)
    case "customer-service":
      return OwlScreens.taskList(
        employee: data.employee, processes: [], onSelect: { _ in }, onRecord: none, onProgress: none, onCustomerService: none)
    case "assist":
      return OwlScreens.assist(heard: nil, hint: nil, busy: false, onHint: none, onEnd: none)
    case "assist-heard":
      return OwlScreens.assist(heard: data.heard, hint: nil, busy: false, onHint: none, onEnd: none)
    case "assist-busy":
      return OwlScreens.assist(heard: data.heard, hint: nil, busy: true, onHint: none, onEnd: none)
    case "assist-hint":
      return OwlScreens.assist(heard: data.heard, hint: data.assist, busy: false, onHint: none, onEnd: none)
    case "assist-unsure":
      return OwlScreens.assist(
        heard: nil, hint: OwlAssist(bullets: [data.finnish ? "Ei käsikirjassa, kysy työkaverilta" : "Not in the handbook, ask a colleague"], say: nil, sources: [], unsure: true),
        busy: false, auto: true, onHint: none, onEnd: none)
    case "goto":
      return OwlScreens.goTo(
        process: process, step: pick, label: data.long ? "Aisle C · Shelf 12 · Bottom row, left end" : "Aisle C · Shelf 12",
        image: photo, onHelp: none, onHome: none)
    case "step-tracking":
      return OwlScreens.step(
        process: process, step: pick, image: photo, live: .watching, log: log, onDone: none, onWatch: none, onAsk: none,
        onHelp: none, cameraOn: true, onCamera: none, tracking: OwlStrings.locationIn("Aisle C"))
    case "location-consent":
      return OwlScreens.consent(
        title: OwlStrings.locationTitle, lines: OwlStrings.locationLines, allowLabel: OwlStrings.allowLocation,
        declineLabel: OwlStrings.noLocation, onAllow: none, onDecline: none)
    case "forget":
      return OwlScreens.confirmForget(onKeep: none, onErase: none)
    case "step-caption":
      return OwlScreens.step(
        process: process, step: pick, image: photo, live: .watching, log: log, onDone: none, onWatch: none, onAsk: none,
        onHelp: none, caption: data.finnish ? "Kerää tilauksen kolme tuotetta laatikkoon." : "Pick the three items on the order into the box.",
        cameraOn: true, onCamera: none)
    case "step-camera-paused":
      return OwlScreens.step(
        process: process, step: pick, image: photo, live: .blocked(.cameraPaused), log: log, onDone: none, onWatch: none,
        onAsk: none, onHelp: none, cameraOn: false, onCamera: none)
    case "step-suggests":
      return OwlScreens.step(
        process: process, step: pack, image: photo,
        live: .suggests(data.finnish ? "Näyttää vaiheelta 5. Nipistä Valmis jatkaaksesi." : "Looks like step 5. Pinch Done to go on."),
        log: log, onDone: none, onWatch: none, onAsk: none, onHelp: none, cameraOn: true, onCamera: none)
    case "done-checks-off":
      return OwlScreens.done(
        process: process, summary: data.summary(unverified: [1, 2, 3, 4, 5]), checksWereOff: true, onHome: none, onProgress: none)
    default:
      return nil
    }
  }
}

extension OwlViewModel {
  /// Shows one gallery screen on the (mock) glasses. Simulator hook `OWL_PREVIEW_SCREEN`.
  func previewScreen(_ name: String, deviceIdentifier: DeviceIdentifier?) async {
    guard let screen = OwlScreenGallery.screen(name) else {
      NSLog("[Owl] no gallery screen named \(name). Names: \(OwlScreenGallery.names.joined(separator: ", "))")
      return
    }
    NSLog("[Owl] gallery: \(name)")
    await displayViewModel.send(screen, deviceIdentifier: deviceIdentifier)
  }
}

/// The contract's sample data, in English or Finnish, at normal or maximum length.
@MainActor
private struct Sample {
  let finnish: Bool
  let long: Bool

  private func t(_ en: String, _ fi: String) -> String { finnish ? fi : en }

  var employee: OwlEmployee {
    OwlEmployee(
      id: "emp-sami", name: "Sami", language: finnish ? "fi" : "en", role: t("Warehouse picker", "Keräilijä"),
      company: "Kide Logistics",
      welcome: t(
        "Welcome to Kide Logistics, Sami! Today's task: Pick and pack an order. I'm Owl. I'll show you each step.",
        "Tervetuloa, Sami! Olet nyt osa yritystä Kide Logistics. Tämän päivän tehtävä: Kerää ja pakkaa tilaus. Olen Owl ja näytän sinulle jokaisen vaiheen."),
      processIds: ["proc-pick-pack"], glassesId: "glasses-1", access: nil)
  }

  var orderLines: [OwlOrderLine] {
    [
      OwlOrderLine(sku: "OAT-1L", name: t("Oat drink 1 l", "Kaurajuoma 1 l"), qty: 2),
      OwlOrderLine(sku: "COF-500", name: t("Coffee 500 g", "Kahvi 500 g"), qty: 1),
      OwlOrderLine(sku: "RYE-CRISP", name: t("Rye crispbread", "Ruisnäkkileipä"), qty: 1),
    ]
  }

  private func step(
    _ index: Int, _ title: String, _ instruction: String, kind: String, criteria: [String] = [], clip: Bool = true
  ) -> OwlStep {
    OwlStep(
      id: "step-\(index)", index: index, title: title, instruction: instruction, say: nil,
      referenceImageUrl: "/media/proc-pick-pack/step-\(index).jpg",
      clipUrl: clip ? "/media/proc-pick-pack/step-\(index).mp4" : nil,
      check: OwlCheck(kind: kind, criteria: criteria, orderLines: kind == "order" ? orderLines : nil), source: nil)
  }

  var process: OwlProcess {
    let steps: [OwlStep]
    if long {
      // The longest copy the contract allows: 32 characters in a title, 140 in an instruction.
      steps = [
        step(1, t("Take a medium cardboard box (M)", "Ota keskikokoinen pahvilaatikko"), longInstruction, kind: "visual", criteria: longCriteria),
        step(2, t("Pick every item on the order now", "Kerää kaikki tilauksen tuotteet"), longInstruction, kind: "order"),
        step(3, t("Check the order against the box", "Tarkista tilaus laatikkoa vasten"), longInstruction, kind: "order", clip: false),
        step(4, t("Pack the heavy items at the base", "Pakkaa painavat tuotteet pohjalle"), longInstruction, kind: "visual", criteria: longCriteria),
        step(5, t("Seal the box and stick the label", "Sulje laatikko ja kiinnitä tarra"), longInstruction, kind: "visual", criteria: longCriteria),
      ]
    } else {
      steps = [
        step(
          1, t("Take a medium box", "Ota keskikokoinen laatikko"),
          t("Take a medium box (M) and put the order sheet on top of it.", "Ota keskikokoinen laatikko (M) ja laita tilauslista sen päälle."),
          kind: "visual",
          criteria: [t("An open cardboard box is on the table", "Avoin pahvilaatikko on pöydällä"), t("The order sheet is visible", "Tilauslista on näkyvissä")]),
        step(
          2, t("Pick the items", "Kerää tuotteet"),
          t("Pick every item on the order from the shelf into the box.", "Kerää jokainen tilauksen tuote hyllystä laatikkoon."), kind: "order"),
        step(
          3, t("Check the order", "Tarkista tilaus"),
          t("Hold the open box in view. Owl checks the items against the order.", "Pidä avointa laatikkoa näkyvissä. Owl vertaa tuotteita tilaukseen."),
          kind: "order", clip: false),
        step(
          4, t("Pack heavy items first", "Pakkaa painavat ensin"),
          t("Heavy items at the bottom, light on top. Fill gaps with paper.", "Painavat tuotteet pohjalle, kevyet päälle. Täytä tyhjä tila paperilla."),
          kind: "visual",
          criteria: [
            t("Cartons lie at the bottom of the box", "Tölkit ovat laatikon pohjalla"), t("Crispbread is on top", "Näkkileipä on päällimmäisenä"),
            t("Gaps are filled with paper", "Tyhjä tila on täytetty paperilla"),
          ]),
        step(
          5, t("Seal and label", "Sulje ja kiinnitä tarra"),
          t("Tape the box shut and put the shipping label on top.", "Teippaa laatikko kiinni ja kiinnitä lähetystarra laatikon päälle."),
          kind: "visual",
          criteria: [t("The box is taped shut", "Laatikko on teipattu kiinni"), t("The shipping label is on the top side", "Lähetystarra on laatikon yläpinnassa")]),
      ]
    }
    return OwlProcess(
      id: "proc-pick-pack", title: t("Pick and pack an order", "Kerää ja pakkaa tilaus"), summary: nil, company: "Kide Logistics",
      language: finnish ? "fi" : "en", status: "published", source: "record", expert: "Laura", steps: steps)
  }

  private var longInstruction: String {
    t(
      "Take the medium box from the lower shelf, open it fully, fold the flaps out and lay the printed order sheet flat on top of it now.",
      "Ota keskikokoinen laatikko alahyllyltä, avaa se kokonaan, taita läpät ulospäin ja aseta tulostettu tilauslista sen päälle heti.")
  }

  private var longCriteria: [String] {
    [
      t("The open cardboard box stands on the packing table", "Avoin pahvilaatikko on pakkauspöydän päällä"),
      t("The printed order sheet is fully visible", "Tulostettu tilauslista on kokonaan näkyvissä"),
      t("Nothing else is on the packing table", "Pakkauspöydällä ei ole mitään muuta"),
    ]
  }

  var noCheckStep: OwlStep {
    OwlStep(
      id: "step-9", index: 3, title: t("Wash your hands", "Pese kädet"),
      instruction: t("Wash your hands before you touch any food items.", "Pese kädet ennen kuin kosket elintarvikkeisiin."), say: nil,
      referenceImageUrl: nil, clipUrl: nil, check: OwlCheck(kind: "none", criteria: [], orderLines: nil), source: nil)
  }

  /// Four tasks, so the list shows that a newly published one is reachable.
  var processes: [OwlProcess] {
    let base = process
    func other(_ id: String, _ title: String, steps: Int, expert: String?) -> OwlProcess {
      OwlProcess(
        id: id, title: title, summary: nil, company: base.company, language: base.language, status: "published",
        source: "record", expert: expert, steps: Array(base.steps.prefix(steps)))
    }
    return [
      base, other("proc-restock", t("Restock the oat shelf", "Täytä kaurahylly"), steps: 3, expert: "Laura"),
      other("proc-returns", t("Handle a returned parcel", "Käsittele palautus"), steps: 4, expert: "Mikko"),
      other("proc-rec-4", t("Close the packing bench", "Sulje pakkauspiste"), steps: 2, expert: "Laura"),
    ]
  }

  private func line(_ index: Int, _ status: String, seen: Int? = nil, note: String? = nil) -> OwlCheckLine {
    let order = orderLines[index]
    return OwlCheckLine(name: order.name, expected: order.qty, seen: seen ?? order.qty, status: status, note: note)
  }

  private func check(_ status: String, _ problem: String?, _ text: String, lines: [OwlCheckLine]?, done: Bool = false) -> OwlCheckResult {
    OwlCheckResult(
      status: status, problem: problem, text: text, say: nil, hint: nil, lines: lines, confidence: nil, decidedBy: "rules",
      stepDone: done, nextCheckMs: nil)
  }

  func ok(final: Bool) -> OwlCheckResult {
    check("ok", nil, t("Step done.", "Vaihe valmis."), lines: [line(0, "ok"), line(1, "ok"), line(2, "ok")], done: final)
  }

  var wrongSize: OwlCheckResult {
    check(
      "warning", "wrong_item", t("Wrong item: Oat drink 0.5 l. The order says Oat drink 1 l.", "Väärä tuote: Kaurajuoma 0,5 l. Tilauksessa: Kaurajuoma 1 l."),
      lines: [line(0, "wrong_item", seen: 1, note: t("1 × Oat drink 0.5 l", "1 × Kaurajuoma 0,5 l")), line(1, "ok"), line(2, "ok")])
  }

  var missing: OwlCheckResult {
    check(
      "warning", "missing", t("Missing: Coffee 500 g.", "Puuttuu: Kahvi 500 g."),
      lines: [line(0, "ok"), line(1, "missing", seen: 0), line(2, "ok")])
  }

  var tooMany: OwlCheckResult {
    check(
      "warning", "too_many", t("Too many: Oat drink 1 l.", "Liikaa: Kaurajuoma 1 l."),
      lines: [line(0, "too_many", seen: 3), line(1, "ok"), line(2, "ok")])
  }

  /// A wrong product that shares no words with the ordered one: both names in full.
  var otherProduct: OwlCheckResult {
    check(
      "warning", "wrong_item", t("Wrong item: Green tea 100 g. The order says Coffee 500 g.", "Väärä tuote: Vihreä tee 100 g. Tilauksessa: Kahvi 500 g."),
      lines: [line(0, "ok"), line(1, "wrong_item", seen: 0, note: t("1 × Green tea 100 g", "1 × Vihreä tee 100 g")), line(2, "ok")])
  }

  var notMatching: OwlCheckResult {
    check(
      "warning", "not_matching", t("Not like the expert's photo: gaps are filled with paper.", "Ei kuin mallikuvassa: tyhjä tila on täytetty paperilla."),
      lines: nil)
  }

  var moveCloser: String { t("Move closer to the box", "Tule lähemmäs laatikkoa") }

  func summary(unverified: [Int]) -> OwlRunSummary {
    var log = OwlRunLog(runID: "gallery")
    for step in process.steps {
      if unverified.contains(step.index) {
        log.continueUnverified(step, why: .offline)
      } else {
        let ticket = OwlCheckTicket(runID: "gallery", stepID: step.id, attempt: 1)
        log.verify(step, result: ok(final: true), ticket: ticket, current: ticket)
      }
    }
    return log.summary(of: process)
  }

  var question: String { t("What if an item is out of stock?", "Mitä teen, jos tuote on loppu?") }
  var otherQuestion: String { t("When is the lunch break?", "Milloin on lounastauko?") }

  var answer: OwlAnswer {
    OwlAnswer(
      found: true,
      text: t(
        "Mark the line as missing on the order and tell the shift lead. Never swap in another product.",
        "Merkitse rivi puuttuvaksi tilaukseen ja kerro vuoropäällikölle. Älä koskaan korvaa tuotetta toisella."),
      say: nil, language: finnish ? "fi" : "en",
      sources: [OwlSource(doc: t("Warehouse handbook", "Varaston käsikirja"), section: t("Out of stock", "Tuote loppu"), quote: nil)])
  }

  var notFound: OwlAnswer {
    OwlAnswer(
      found: false, text: t("That's not in our instructions. Ask your shift lead.", "Tätä ei ole ohjeissamme. Kysy vuoropäälliköltä."),
      say: nil, language: finnish ? "fi" : "en", sources: [])
  }

  var help: OwlHelpSession {
    OwlHelpSession(
      id: "help-1", status: "connected", employeeId: "emp-sami", processId: "proc-pick-pack", stepId: "step-2",
      latestFrameUrl: nil, frameAt: nil, updatedAt: nil,
      messages: [
        OwlHelpMessage(id: 1, from: "worker", text: t("Which oat drink is it?", "Mikä kaurajuoma se on?"), at: nil, imageUrl: nil),
        OwlHelpMessage(id: 2, from: "expert", text: t("The blue carton on the top shelf. Check that it says 1 l.", "Sininen tölkki ylähyllyllä. Tarkista, että siinä lukee 1 l."), at: nil, imageUrl: nil),
      ])
  }

  var consentLines: [String] {
    finnish
      ? [
        "Owl katsoo vain vaiheen aikana ja tarkistaa työsi.",
        "Jokainen kuva lähetetään tekoälypalvelulle, joka tarkistaa sen. Owl ei tallenna kuvaa.", "Voit keskeyttää kameran milloin tahansa.",
      ]
      : [
        "Owl looks only during a step, to check your work.", "Each picture goes to an AI service that checks it. Owl does not save it.",
        "You can pause the camera any time.",
      ]
  }

  var progressLines: [String] {
    finnish
      ? ["Olet tehnyt 3 tehtävää.", "Korjasit 2 ongelmaa, jotka Owl huomasi.", "Nopeammin kuin ensimmäisellä kerralla."]
      : ["You have finished 3 tasks.", "You fixed 2 problems Owl caught.", "Faster than your first time."]
  }

  /// JUN-100 demo: Mika, the shift manager, helps Sami from his own glasses.
  var managerSays: String {
    long
      ? t("The oat drink is the blue carton on the top shelf, left of the coffee. Take two, and check that it says one litre.",
          "Kaurajuoma on sininen tölkki ylähyllyllä kahvin vasemmalla puolella. Ota kaksi ja tarkista, että siinä lukee yksi litra.")
      : t("Blue carton, top shelf. Take two.", "Sininen tölkki, ylähylly. Ota kaksi.")
  }

  var workerAnswer: String {
    long
      ? t("I found them but there is only one left on the shelf, should I take the 0.5 litre ones instead?",
          "Löysin ne, mutta hyllyssä on vain yksi, otanko puolen litran tölkit?")
      : t("Found it, thanks!", "Löytyi, kiitos!")
  }

  var managerHelp: OwlHelpSession {
    OwlHelpSession(
      id: "help-2", status: "connected", employeeId: "emp-sami", processId: "proc-pick-pack", stepId: "step-2",
      latestFrameUrl: nil, frameAt: nil, updatedAt: nil,
      messages: [OwlHelpMessage(id: 1, from: "manager", text: managerSays, at: nil, imageUrl: nil)])
  }

  /// JUN-98 demo: Noa at the counter of Café Kide.
  var heard: String {
    long
      ? t("…and I bought these coffee beans yesterday but I haven't opened them, can I still return them, or do I need the receipt?",
          "…ostin nämä kahvipavut eilen mutta en ole avannut niitä, voinko vielä palauttaa ne, vai tarvitsenko kuitin?")
      : t("Can I return these coffee beans unopened?", "Voinko palauttaa avaamattomat kahvipavut?")
  }

  var assist: OwlAssist {
    let bullets = [
      t("Unopened coffee beans: returnable within 14 days", "Avaamattomat kahvipavut: palautus 14 päivän sisällä"),
      t("Receipt needed; refund to the same card", "Kuitti tarvitaan; hyvitys samalle kortille"),
      t("Opened coffee cannot be returned", "Avattua kahvia ei voi palauttaa"),
    ]
    return OwlAssist(
      bullets: long ? bullets.map { $0 + t(" (ask the shift lead if unsure)", " (kysy vuoroesihenkilöltä)") } : bullets, say: nil,
      sources: [OwlSource(doc: t("Café Kide: counter handbook", "Café Kide: tiskin käsikirja"), section: t("Returns and refunds", "Palautukset"), quote: nil)],
      unsure: false)
  }

  /// JUN-96 demo: Sami on day 4 of 5, one step short of the target.
  var practise: [String] {
    long
      ? [t("Pack heavy items first", "Pakkaa painavat tuotteet ensin"), t("Label the parcel", "Merkitse paketti")]
      : [t("Pack heavy items first", "Pakkaa painavat tuotteet ensin")]
  }

  var trainingLines: OwlTrainingLines {
    OwlTrainingLines(
      days: OwlStrings.trainingDays(day: 4, of: 5, left: 1, active: true),
      lines: practise.map { OwlStrings.trainingTarget($0, done: 2, of: 3) })
  }

  var narration: String {
    t("Heavy cartons go at the bottom, then the crispbread on top so it doesn't break.", "Painavat tölkit pohjalle ja näkkileipä päälle, ettei se murru.")
  }
}
