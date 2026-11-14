//
// OwlScreens.swift
//
// Owl's screens on Meta Ray-Ban Display (JUN-36), built from the DAT Display DSL only, no
// SwiftUI. Each function takes contract data and returns one screen; the flow in
// `OwlViewModel` decides which one to show.
//
// How they are built, following Meta's guidance for the display:
// - Light is additive. Nothing is lit that the worker does not need: one card, the owl
//   small in its corner while a step is being worked on, large only on welcome and at the end.
// - Space is negotiated. Every screen fits the 600×600 display without scrolling, so the
//   step, the instruction and what Owl knows are readable together above the buttons.
// - Focus is the cursor. One primary action per screen, every action reachable with the
//   Neural Band, and every screen has a button (with none, a tap on the touchpad pauses
//   the session).
// - The evidence leads: the expert's photo, the order lines, the size that differs.
// - The owl's face follows the real state. Green and "verified" appear only after a
//   final check passed (JUN-57).
//

import MWDATDisplay
import UIKit

typealias OwlAction = @Sendable () -> Void

/// What Owl knows right now about the step on screen. It drives the owl's face, the live
/// line and what the primary button means.
enum OwlLive: Equatable, Sendable {
  /// The step has no check: the worker confirms it.
  case noCheck
  /// The camera is opening.
  case starting
  case watching
  /// A check is running, or a problem was seen once and waits for the next frame.
  case checking
  /// The last live frame looked right. Not a verification.
  case looksRight
  /// Owl saw something to fix and the worker closed the correction. The text says what.
  case needsFix(String)
  /// Step recognition thinks the worker is on another step (JUN-34). Only a hint.
  case suggests(String)
  /// Owl looked and could not tell. The hint says what would help.
  case cantSee(String?)
  /// Owl cannot check this step at all right now.
  case blocked(OwlCheckBlock)
}

@MainActor
enum OwlScreens {
  // MARK: - Welcome and tasks

  /// First start: the personal welcome, in the worker's language.
  static func welcome(employee: OwlEmployee?, onStart: @escaping OwlAction) -> FlexBox {
    screen {
      if let owl = OwlArt.figure(.welcome, height: 176) {
        Image(image: owl, sizePreset: .fill)
      }
      Text(employee.map { OwlStrings.welcome($0.name) } ?? OwlStrings.hello, style: .heading)
      Text(employee?.welcome ?? OwlStrings.welcomeBody, style: .body)
    } buttons: {
      Button(label: OwlStrings.start, style: .primary, iconName: .triangleRight, onClick: onStart)
        .actionRole(.primary)
    }
  }

  /// Every published task of this worker. The list scrolls with the focus, so a task
  /// published a minute ago is reachable however many there are.
  static func taskList(
    employee: OwlEmployee?, processes: [OwlProcess], onSelect: @escaping @Sendable (String) -> Void,
    onRecord: @escaping OwlAction, onProgress: OwlAction? = nil
  ) -> FlexBox {
    let who = [employee?.name, employee?.company].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · ")
    return FlexBox(direction: .column, spacing: 10) {
      card {
        header(.listening, meta: who.isEmpty ? nil : who, title: OwlStrings.yourTasks)
        if processes.isEmpty {
          Text(OwlStrings.noTasks, style: .body, color: .secondary)
        }
      }
      for process in processes {
        FlexBox(direction: .column, spacing: 2) {
          Text(process.title, style: .body)
          Text(
            ([OwlStrings.steps(process.steps.count)] + (process.expert.map { [OwlStrings.recordedBy($0)] } ?? []))
              .joined(separator: " · "),
            style: .meta, color: .secondary)
        }
        .padding(20)
        .background(.card)
        .onTap { onSelect(process.id) }
      }
      buttonRow {
        if let onProgress {
          Button(label: OwlStrings.myProgress, style: .secondary, iconName: .star, onClick: onProgress)
        }
        Button(label: OwlStrings.recordTask, style: .secondary, iconName: .videoCamera, onClick: onRecord)
      }
    }
  }

  // MARK: - Learn and Check

  /// One step: where the worker is, what to do, what it should look like, and what Owl
  /// knows right now. `log` holds how the earlier steps ended.
  static func step(
    process: OwlProcess, step: OwlStep, image: UIImage?, live: OwlLive, log: OwlRunLog?,
    onDone: @escaping OwlAction, onWatch: OwlAction?, onAsk: @escaping OwlAction,
    onHelp: @escaping OwlAction, caption: String? = nil, cameraOn: Bool? = nil, onCamera: OwlAction? = nil
  ) -> FlexBox {
    // Display-first workers read what Owl just said, on its own line under what Owl knows.
    let spoken = caption.map { "\u{201C}\($0)\u{201D}" }
    let lines = liveLine(live) + (spoken.map { "\n\($0)" } ?? "")
    let check = checkLines(step)
    let banner = OwlArt.stepBanner(
      photo: image, photoTag: process.expert.map(OwlStrings.photoBy), checkLabel: check.label,
      checkLines: check.lines,
      progress: OwlArt.Progress(index: step.index, count: process.steps.count, outcomes: process.steps.map { log?.outcome(of: $0) }),
      photoHeight: photoHeight(title: step.title, instruction: step.instruction, live: lines))
    return screen {
      header(mood(live), meta: OwlStrings.stepOf(step.index, process.steps.count), title: step.title)
      Image(image: banner, sizePreset: .fill)
      Text(step.instruction, style: .body)
      Text(liveLine(live), style: .meta, color: .secondary)
      if let spoken {
        Text(spoken, style: .meta, color: .primary)
      }
    } buttons: {
      // Always "Done", whatever Owl knows: the meaning of the focused button never changes
      // under the worker's pinch. When Owl cannot check, Done leads to the choice between
      // checking again and continuing unverified, never straight past the check.
      Button(label: OwlStrings.done, style: .primary, iconName: .checkmark, onClick: onDone)
        .actionRole(.primary)
      if let onWatch {
        Button(label: OwlStrings.watchHow, style: .secondary, iconName: .triangleRightCircle, onClick: onWatch)
      }
      Button(label: OwlStrings.ask, style: .secondary, iconName: .speechBubble, onClick: onAsk)
      Button(label: OwlStrings.help, style: .secondary, iconName: .person, onClick: onHelp)
      // The worker pauses or resumes the camera with one pinch (JUN-80).
      if let onCamera, let cameraOn {
        Button(
          label: cameraOn ? OwlStrings.pauseCamera : OwlStrings.cameraOn, style: .secondary,
          iconName: cameraOn ? .videoCameraOff : .videoCamera, onClick: onCamera)
      }
    }
  }

  /// Owl saw something to fix. The title says what to do, the picture shows the order
  /// beside what Owl saw, and the owl stays calm: a correction is help, not a telling-off.
  static func correction(
    process: OwlProcess, step: OwlStep, result: OwlCheckResult, image: UIImage? = nil,
    onCheckAgain: @escaping OwlAction, onBack: @escaping OwlAction
  ) -> FlexBox {
    let picture = evidence(result) ?? notSeen(step: step, result: result, image: image, expert: process.expert)
    return screen {
      header(
        .alert, meta: "\(OwlStrings.stepOf(step.index, process.steps.count)) · \(OwlStrings.checkThis)",
        title: OwlStrings.correctionTitle(result))
      if let picture {
        Image(image: picture, sizePreset: .fill)
      }
      if picture == nil, let text = result.text ?? result.hint {
        Text(text, style: .body)
      }
      // Said only when this very result proves it.
      if let others = OwlCheckRules.otherLinesRight(result) {
        Text(OwlStrings.otherLinesRight(others), style: .meta, color: .secondary)
      }
    } buttons: {
      Button(label: OwlStrings.checkAgain, style: .primary, iconName: .twoArrowsClockwise, onClick: onCheckAgain)
        .actionRole(.primary)
      Button(label: OwlStrings.back, style: .secondary, iconName: .arrowLeft, onClick: onBack)
    }
  }

  /// A final check is running. Back keeps the task and the step.
  static func checking(step: OwlStep, onBack: @escaping OwlAction) -> FlexBox {
    screen {
      header(.thinking, meta: step.title, title: OwlStrings.checking)
      Text(OwlStrings.holdStill, style: .body)
    } buttons: {
      Button(label: OwlStrings.back, style: .secondary, iconName: .arrowLeft, onClick: onBack)
        .actionRole(.primary)
    }
  }

  /// Owl could not check. The worker can try again or go on, and going on is named for
  /// what it is: a row that always shows its words and its consequence, never just an icon.
  static func cannotCheck(
    step: OwlStep, why: OwlCheckBlock, hint: String?, onCheckAgain: OwlAction?,
    onContinue: @escaping OwlAction, onBack: @escaping OwlAction
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 10) {
      card {
        header(.unsure, meta: step.title, title: OwlStrings.cannotCheck)
        Text(hint ?? OwlStrings.cannotCheckBody(why), style: .body)
      }
      FlexBox(direction: .column, spacing: 2) {
        Text(OwlStrings.continueUnverified, style: .body)
        Text(OwlStrings.notVerifiedNote, style: .meta, color: .secondary)
      }
      .padding(20)
      .background(.card)
      .onTap(onContinue)
      buttonRow {
        if let onCheckAgain {
          Button(label: OwlStrings.checkAgain, style: .primary, iconName: .twoArrowsClockwise, onClick: onCheckAgain)
            .actionRole(.primary)
          Button(label: OwlStrings.back, style: .secondary, iconName: .arrowLeft, onClick: onBack)
        } else {
          Button(label: OwlStrings.back, style: .primary, iconName: .arrowLeft, onClick: onBack)
            .actionRole(.primary)
        }
      }
    }
  }

  /// The task is finished. Every step is listed with how it ended; "Well done" appears only
  /// when every check passed.
  static func done(
    process: OwlProcess, summary: OwlRunSummary, checksWereOff: Bool = false, onHome: @escaping OwlAction,
    onProgress: OwlAction? = nil
  ) -> FlexBox {
    let title =
      summary.allVerified
      ? OwlStrings.wellDone
      : (summary.unverified > 0 ? OwlStrings.finishedNotVerified(summary.unverified) : OwlStrings.finished)
    let body =
      summary.allVerified
      ? OwlStrings.allVerifiedBody(summary.verified)
      : (summary.unverified > 0
        ? (checksWereOff ? OwlStrings.checksOffBody : OwlStrings.notVerifiedBody) : OwlStrings.noChecksBody)
    return screen {
      header(
        summary.allVerified ? .done : (summary.unverified > 0 ? .unsure : .listening), meta: process.title,
        title: title)
      Image(
        image: OwlArt.summary(
          summary.rows, verified: OwlStrings.verified, notVerified: OwlStrings.notVerified,
          noCheck: OwlStrings.noCheckLabel), sizePreset: .fill)
      Text(body, style: .meta, color: .secondary)
    } buttons: {
      Button(label: OwlStrings.home, style: .primary, iconName: .house, onClick: onHome)
        .actionRole(.primary)
      if let onProgress {
        Button(label: OwlStrings.myProgress, style: .secondary, iconName: .star, onClick: onProgress)
      }
    }
  }

  // MARK: - Consent and progress

  /// Consent, asked once (JUN-80): what the camera does, then a choice with a pinch. The
  /// texts come translated. Neither answer is drawn as the right one: both are rows that
  /// always show their words, the same size and the same weight.
  static func consent(
    title: String, lines: [String], allowLabel: String, declineLabel: String,
    onAllow: @escaping OwlAction, onDecline: @escaping OwlAction
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 10) {
      card {
        header(.listening, meta: nil, title: title)
        for line in lines.prefix(4) {
          Text(line, style: .meta, color: .primary)
        }
      }
      choice(allowLabel, onAllow)
      choice(declineLabel, onDecline)
    }
  }

  /// One answer to a question, as a row that can be picked with the Neural Band.
  private static func choice(_ label: String, _ action: @escaping OwlAction) -> FlexBox {
    FlexBox(direction: .column) {
      Text(label, style: .body)
    }
    .padding(18)
    .background(.card)
    .onTap(action)
  }

  /// The worker's own progress (JUN-76): a few encouraging lines, for the worker only, and
  /// the way to erase them.
  static func progress(
    title: String, lines: [String], onHome: @escaping OwlAction, onForget: OwlAction? = nil
  ) -> FlexBox {
    screen {
      header(.done, meta: nil, title: title)
      for line in lines.prefix(4) {
        Text(line, style: .body)
      }
    } buttons: {
      Button(label: OwlStrings.home, style: .primary, iconName: .house, onClick: onHome)
        .actionRole(.primary)
      if let onForget {
        Button(label: OwlStrings.forgetMe, style: .secondary, iconName: .x, onClick: onForget)
      }
    }
  }

  // MARK: - Watch how (JUN-56)

  /// After the expert's clip: back to the step, or watch it once more.
  static func afterClip(step: OwlStep, onReplay: @escaping OwlAction, onBack: @escaping OwlAction) -> FlexBox {
    screen {
      header(.listening, meta: step.title, title: OwlStrings.afterClip)
      Text(step.instruction, style: .body)
    } buttons: {
      Button(label: OwlStrings.backToStep, style: .primary, iconName: .arrowLeft, onClick: onBack)
        .actionRole(.primary)
      Button(label: OwlStrings.replay, style: .secondary, iconName: .triangleRightCircle, onClick: onReplay)
    }
  }

  // MARK: - Ask

  /// Owl is listening to the glasses microphone.
  static func listening(prompt: String, heard: String?, onCancel: @escaping OwlAction) -> FlexBox {
    screen {
      header(.listening, meta: OwlStrings.askOwl, title: OwlStrings.listening)
      Text(heard ?? prompt, style: .body, color: heard == nil ? .secondary : .primary)
    } buttons: {
      Button(label: OwlStrings.cancel, style: .secondary, iconName: .x, onClick: onCancel)
        .actionRole(.primary)
    }
  }

  /// The answer from the company's own documents, with its source. When the documents do
  /// not say, Owl says so and looks it.
  static func answer(
    question: String, answer: OwlAnswer, onAskAgain: @escaping OwlAction, onBack: @escaping OwlAction
  ) -> FlexBox {
    screen {
      header(
        answer.found ? .listening : .unsure, meta: "\u{201C}\(question)\u{201D}",
        title: answer.found ? nil : OwlStrings.notInInstructions)
      Text(answer.text, style: .body)
      if let source = answer.sources.first {
        Text(
          OwlStrings.source(source.doc + (source.section.map { " · \($0)" } ?? "")), style: .meta,
          color: .secondary)
      }
    } buttons: {
      Button(label: OwlStrings.back, style: .primary, iconName: .arrowLeft, onClick: onBack)
        .actionRole(.primary)
      Button(label: OwlStrings.askAgain, style: .secondary, iconName: .speechBubble, onClick: onAskAgain)
    }
  }

  // MARK: - Help

  /// The remote expert sees the glasses view. `marked` is the worker's own view with the
  /// expert's ring on it, shown with the expert's words.
  static func help(session: OwlHelpSession?, marked: UIImage?, onEnd: @escaping OwlAction) -> FlexBox {
    let lastExpert = session?.messages.last { $0.from == "expert" }
    let connected = session?.isConnected == true
    return screen {
      header(
        connected ? .listening : .thinking, meta: OwlStrings.helpLabel,
        title: connected ? OwlStrings.expertWithYou : OwlStrings.callingExpert)
      if let marked {
        Image(image: OwlArt.framed(marked), sizePreset: .fill)
      }
      Text(lastExpert?.text ?? OwlStrings.helpBody, style: .body)
    } buttons: {
      Button(label: OwlStrings.endHelp, style: .primary, iconName: .phoneSlash, onClick: onEnd)
        .actionRole(.primary)
    }
  }

  // MARK: - Record

  /// Record mode for experts: one step at a time.
  static func record(
    title: String, stepCount: Int, isRecordingStep: Bool, narration: String?,
    onStartStep: @escaping OwlAction, onEndStep: @escaping OwlAction, onFinish: @escaping OwlAction,
    onBack: @escaping OwlAction
  ) -> FlexBox {
    screen {
      header(
        isRecordingStep ? .watching : .listening, meta: "\(OwlStrings.record) · \(title)",
        title: isRecordingStep ? "● " + OwlStrings.recordingStep(stepCount + 1) : OwlStrings.stepsRecorded(stepCount))
      Text(
        narration
          ?? (isRecordingStep
            ? OwlStrings.recordHintDoing : (stepCount == 0 ? OwlStrings.recordHintFirst : OwlStrings.recordHintNext)),
        style: .body, color: narration == nil ? .secondary : .primary)
    } buttons: {
      if isRecordingStep {
        Button(label: OwlStrings.endStep, style: .primary, iconName: .checkmark, onClick: onEndStep)
          .actionRole(.primary)
      } else {
        Button(label: OwlStrings.recordStep, style: .primary, iconName: .videoCamera, onClick: onStartStep)
          .actionRole(.primary)
        if stepCount > 0 {
          Button(label: OwlStrings.finish, style: .secondary, iconName: .checkmarkCircle, onClick: onFinish)
        }
        // Record opened by mistake, or a break in the middle: the way back to the tasks. The
        // recording is kept, and Record opens it again.
        Button(label: OwlStrings.back, style: .secondary, iconName: .arrowLeft, onClick: onBack)
      }
    }
  }

  // MARK: - Waiting and problems

  /// Owl is working on something. Every wait has a way out: the touchpad pauses or stops the
  /// session when nothing interactive is shown, and no wait may hold the worker.
  static func status(
    _ title: String, detail: String, mood: OwlMood = .thinking, leave: String? = nil,
    leaveIcon: IconName = .arrowLeft, onCancel: @escaping OwlAction
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 10) {
      card {
        header(mood, meta: nil, title: title)
        Text(detail, style: .body, color: .secondary)
      }
      buttonRow {
        Button(label: leave ?? OwlStrings.back, style: .secondary, iconName: leaveIcon, onClick: onCancel)
          .actionRole(.primary)
      }
    }
  }

  /// Something is in the way (JUN-42). Each kind says what happened and what still works.
  static func problem(
    _ kind: OwlProblemKind, detail: String? = nil, onRetry: OwlAction?, onHome: OwlAction?,
    homeLabel: String? = nil
  ) -> FlexBox {
    screen {
      header(kind == .notAssigned ? .resting : .unsure, meta: nil, title: OwlStrings.problemTitle(kind))
      Text(OwlStrings.problemBody(kind), style: .body)
      if let detail, !detail.isEmpty, kind == .server || kind == .other {
        Text(detail, style: .meta, color: .secondary)
      }
    } buttons: {
      if let onRetry {
        Button(label: OwlStrings.tryAgain, style: .primary, iconName: .twoArrowsClockwise, onClick: onRetry)
          .actionRole(.primary)
        if let onHome {
          Button(label: homeLabel ?? OwlStrings.home, style: .secondary, iconName: homeLabel == nil ? .house : .arrowLeft, onClick: onHome)
        }
      } else if let onHome {
        Button(label: homeLabel ?? OwlStrings.home, style: .primary, iconName: homeLabel == nil ? .house : .arrowLeft, onClick: onHome)
          .actionRole(.primary)
      }
    }
  }

  // MARK: - What the step card says

  /// The owl's face for a live state. Happy is kept for a passed final check.
  static func mood(_ live: OwlLive) -> OwlMood {
    switch live {
    case .noCheck, .looksRight, .suggests: .listening
    case .starting, .checking: .thinking
    case .watching: .watching
    case .needsFix: .alert
    case .cantSee, .blocked: .unsure
    }
  }

  static func liveLine(_ live: OwlLive) -> String {
    switch live {
    case .noCheck: OwlStrings.liveNoCheck
    case .starting: OwlStrings.liveStarting
    case .watching: OwlStrings.liveWatching
    case .checking: OwlStrings.liveChecking
    case .looksRight: OwlStrings.liveLooksRight
    case .needsFix(let what): OwlStrings.liveNeedsFix(what)
    case .suggests(let text): text
    case .cantSee(let hint): hint ?? OwlStrings.liveCantSee
    case .blocked(let why): OwlStrings.blocked(why)
    }
  }

  /// What Owl checks in this step: the order lines, or the things to see.
  private static func checkLines(_ step: OwlStep) -> (label: String?, lines: [(bold: String?, text: String)]) {
    switch step.check.kind {
    case "order":
      let lines = (step.check.orderLines ?? []).map { (bold: Optional("\($0.qty) ×"), text: $0.name) }
      return (OwlStrings.order, lines)
    case "visual":
      return (OwlStrings.owlChecks, (step.check.criteria ?? []).map { (bold: nil, text: $0) })
    default:
      return (nil, [])
    }
  }

  /// The picture for an order problem: the line to fix, with the part that differs large.
  private static func evidence(_ result: OwlCheckResult) -> UIImage? {
    guard let line = OwlCheckRules.lineToFix(result) else { return nil }
    if line.status == "wrong_item", let seen = OwlCheckRules.seenInstead(line) {
      if let diff = OwlCheckRules.difference(expected: line.name, seen: seen) {
        return OwlArt.evidence(
          leftLabel: OwlStrings.onTheOrder, leftSmall: diff.common, leftBig: diff.expected,
          rightLabel: OwlStrings.inTheBox, rightSmall: diff.common, rightBig: diff.seen)
      }
      return OwlArt.evidence(
        leftLabel: OwlStrings.onTheOrder, leftSmall: nil, leftBig: line.name, rightLabel: OwlStrings.inTheBox,
        rightSmall: nil, rightBig: seen)
    }
    return OwlArt.evidence(
      leftLabel: OwlStrings.onTheOrder, leftSmall: line.name, leftBig: "× \(line.expected)",
      rightLabel: OwlStrings.inTheBox, rightSmall: line.name, rightBig: "× \(line.seen)")
  }

  /// The picture for a visual step: the expert's photo beside the one thing Owl did not see.
  /// Nil unless the engine's sentence names one of the step's own criteria.
  private static func notSeen(step: OwlStep, result: OwlCheckResult, image: UIImage?, expert: String?) -> UIImage? {
    guard result.problem == "not_matching", let text = result.text?.lowercased() else { return nil }
    let criteria = step.check.criteria ?? []
    guard
      let failed = criteria.first(where: { text.contains($0.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: ". "))) })
    else { return nil }
    return OwlArt.stepBanner(
      photo: image, photoTag: expert.map(OwlStrings.photoBy), checkLabel: OwlStrings.notSeenYet,
      checkLines: [(bold: nil, text: failed)], progress: nil, photoHeight: 150, wrap: true)
  }

  /// How tall the expert's photo can be so the whole step fits the 600 px display. A long
  /// title or instruction takes its room from the picture, never the other way round.
  /// The numbers are the renderer's line heights, measured in the simulator.
  private static func photoHeight(title: String, instruction: String, live: String) -> CGFloat {
    let titleLines = title.count > 21 ? 2 : 1
    let instructionLines = max(1, Int((Double(instruction.count) / 43).rounded(.up)))
    let liveLines = live.split(separator: "\n").reduce(0) { $0 + ($1.count > 46 ? 2 : 1) }
    let words = max(84, 30 + 46 * titleLines) + 37 * instructionLines + 28 * liveLines
    let room = 458 - words - 30 - 40  // the card, less its gaps and padding
    return min(160, max(CGFloat(room) / 1.06 - 20, 92))
  }

  // MARK: - Building blocks

  /// The owl in the corner, one quiet line and the title.
  private static func header(_ mood: OwlMood, meta: String?, title: String?) -> FlexBox {
    FlexBox(direction: .row, spacing: 14, crossAlignment: .center) {
      if let face = OwlArt.avatar(mood) {
        FlexBox(direction: .column) {
          Image(image: face, sizePreset: .fill)
        }
        .flexGrow(2)
      }
      FlexBox(direction: .column, spacing: 2) {
        if let meta {
          Text(meta, style: .meta, color: .secondary)
        }
        if let title {
          Text(title, style: .heading)
        }
      }
      .flexGrow(9)
    }
  }

  private static func screen(
    @ComponentBuilder _ content: () -> [any ViewComponent], @ButtonGroupBuilder buttons: () -> [Button]
  ) -> FlexBox {
    let body = card(content)
    let actions = buttonRow(buttons)
    return FlexBox(direction: .column, spacing: 10) {
      body
      actions
    }
  }

  private static func card(@ComponentBuilder _ content: () -> [any ViewComponent]) -> FlexBox {
    FlexBox(direction: .column, spacing: 10, content: content)
      .padding(20)
      .background(.card)
  }

  private static func buttonRow(@ButtonGroupBuilder _ content: () -> [Button]) -> FlexBox {
    let group = ButtonGroup(content: content)
    return FlexBox(direction: .row, spacing: 8, alignment: .center, crossAlignment: .center) {
      group
    }
  }
}
