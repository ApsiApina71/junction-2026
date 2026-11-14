//
// OwlRun.swift
//
// What one run of a task knows about each step, kept apart from the screens so it can be
// tested on its own (JUN-57, `Tests/OwlRunTests.swift`).
//
// The rule: a step with a check is verified only by a final check answer for this run,
// this step and this attempt that says the step is done. A green live frame, an answer
// that arrives late, an answer for another step, or no answer at all never counts. The
// worker can still go on ("Continue unverified"), and the summary says so.
//
// Foundation only: no UIKit and no DAT, so the tests run on the Mac.
//

import Foundation

/// How a step ended.
enum OwlStepOutcome: String, Codable, Equatable, Sendable {
  /// Owl's final check passed.
  case verified
  /// The worker went on without a passed check.
  case unverified
  /// The step has no check; the worker confirmed it.
  case noCheck
}

/// Why Owl cannot check a step.
enum OwlCheckBlock: String, Codable, Equatable, Sendable {
  /// The camera is not allowed for Owl.
  case cameraOff
  /// The camera is allowed but did not start.
  case cameraFailed
  case offline
  case serverError
  /// Owl looked and could not tell (too far, covered, blurry), or no fresh picture came.
  case cantSee
  case timedOut
}

/// One request for a final check. Its answer counts only while the ticket is the current one.
struct OwlCheckTicket: Equatable, Sendable {
  let runID: String
  let stepID: String
  /// Grows every time the worker asks again or leaves the step (Ask, Help, Watch how, Back).
  let attempt: Int
}

/// What a final check answer means for the step.
enum OwlFinalVerdict: Equatable, Sendable {
  case verified
  /// Owl saw something to fix: show the correction.
  case problem
  case cannotCheck(OwlCheckBlock)
  /// The answer belongs to another run, step or attempt. Ignore it completely.
  case stale
}

enum OwlRun {
  /// What a final check answer means. `result` is nil when no answer came; `failure` says why.
  static func verdict(
    result: OwlCheckResult?, failure: OwlCheckBlock? = nil, ticket: OwlCheckTicket,
    current: OwlCheckTicket?
  ) -> OwlFinalVerdict {
    guard ticket == current else { return .stale }
    guard let result else { return .cannotCheck(failure ?? .serverError) }
    switch result.status {
    case "warning":
      return .problem
    case "ok":
      // "ok" without `step_done` is not a verification: the engine did not say the step is done.
      return result.stepDone ? .verified : .cannotCheck(.serverError)
    case "checking":
      return .cannotCheck(.timedOut)
    default:
      return .cannotCheck(.cantSee)
    }
  }

  /// A live answer is used only for the step and attempt it was asked for.
  static func isCurrent(_ ticket: OwlCheckTicket, _ current: OwlCheckTicket?) -> Bool {
    ticket == current
  }

  /// Tells one problem from the next, so Owl says each one once.
  static func signature(_ result: OwlCheckResult) -> String {
    let wrong = (result.lines ?? []).filter { !$0.isOK }.map { "\($0.name):\($0.status):\($0.seen):\($0.note ?? "")" }
    return ([result.problem ?? "", result.text ?? ""] + wrong).joined(separator: "|")
  }

  private static let lineStatuses: Set<String> = ["ok", "wrong_item", "missing", "too_many"]
  private static let fixOrder = ["wrong_item", "missing", "too_many"]

  /// The order line to fix first, in the engine's own order: wrong item, missing, too many.
  static func lineToFix(_ result: OwlCheckResult) -> OwlCheckLine? {
    let lines = result.lines ?? []
    for status in fixOrder {
      if let line = lines.first(where: { $0.status == status }) { return line }
    }
    return nil
  }

  /// How many of the other order lines are right, to say so beside a correction. Nil unless
  /// this very result proves it: a decided warning with lines whose every status is known,
  /// exactly one line to fix and at least one line right. A friendly summary never says
  /// more than the evidence.
  static func otherLinesRight(_ result: OwlCheckResult) -> Int? {
    guard result.isWarning, let lines = result.lines, !lines.isEmpty,
      lines.allSatisfy({ lineStatuses.contains($0.status) })
    else { return nil }
    let wrong = lines.filter { !$0.isOK }.count
    let right = lines.count - wrong
    return wrong == 1 && right > 0 ? right : nil
  }

  /// What was seen in place of a line, from the engine's note ("1 × Oat drink 0.5 l"). The note
  /// lists several items as "1 × A, 2 × B"; a comma inside a name ("0,5 l") is not a separator.
  static func seenInstead(_ line: OwlCheckLine) -> String? {
    guard var text = line.note?.trimmingCharacters(in: .whitespaces), !text.isEmpty else { return nil }
    if let next = text.range(of: #",\s+(?=\d+\s*×)"#, options: .regularExpression) {
      text = String(text[..<next.lowerBound])
    }
    if let count = text.range(of: #"^\d+\s*×\s*"#, options: .regularExpression) {
      text = String(text[count.upperBound...])
    }
    text = text.trimmingCharacters(in: .whitespaces)
    return text.isEmpty ? nil : text
  }

  /// Splits two product names into what they share and where they differ:
  /// "Oat drink 1 l" and "Oat drink 0.5 l" share "Oat drink" and differ in "1 l" / "0.5 l".
  /// Nil when they share no leading words or do not differ.
  static func difference(expected: String, seen: String) -> (common: String, expected: String, seen: String)? {
    let a = expected.split(separator: " ").map(String.init)
    let b = seen.split(separator: " ").map(String.init)
    var shared = 0
    while shared < a.count, shared < b.count, a[shared].caseInsensitiveCompare(b[shared]) == .orderedSame {
      shared += 1
    }
    guard shared > 0, shared < a.count, shared < b.count else { return nil }
    return (a[..<shared].joined(separator: " "), a[shared...].joined(separator: " "), b[shared...].joined(separator: " "))
  }
}

/// The outcome of every step of one run.
struct OwlRunLog: Equatable, Sendable {
  let runID: String
  private(set) var outcomes: [String: OwlStepOutcome] = [:]
  private(set) var blocks: [String: OwlCheckBlock] = [:]

  init(runID: String) {
    self.runID = runID
  }

  func outcome(of step: OwlStep) -> OwlStepOutcome? {
    outcomes[step.id]
  }

  /// The worker confirmed a step. Only a step without a check can be confirmed this way;
  /// a step with a check that was not verified is recorded as unverified.
  mutating func confirm(_ step: OwlStep) {
    outcomes[step.id] = step.check.usesCamera ? .unverified : .noCheck
  }

  /// Records a passed final check. Returns false, and records nothing, unless the answer is
  /// for this run, this step and the current attempt, and says the step is done.
  @discardableResult
  mutating func verify(
    _ step: OwlStep, result: OwlCheckResult, ticket: OwlCheckTicket, current: OwlCheckTicket?
  ) -> Bool {
    guard ticket.runID == runID, ticket.stepID == step.id,
      OwlRun.verdict(result: result, ticket: ticket, current: current) == .verified
    else { return false }
    outcomes[step.id] = .verified
    blocks[step.id] = nil
    return true
  }

  /// The worker went on without a passed check.
  mutating func continueUnverified(_ step: OwlStep, why: OwlCheckBlock) {
    guard step.check.usesCamera else {
      outcomes[step.id] = .noCheck
      return
    }
    outcomes[step.id] = .unverified
    blocks[step.id] = why
  }

  func summary(of process: OwlProcess) -> OwlRunSummary {
    OwlRunSummary(
      rows: process.steps.map { step in
        // A step with a check and no recorded outcome was not verified.
        let outcome = outcomes[step.id] ?? (step.check.usesCamera ? .unverified : .noCheck)
        return OwlRunSummary.Row(index: step.index, title: step.title, outcome: outcome)
      })
  }
}

/// What the last screen of a run says.
struct OwlRunSummary: Equatable, Sendable {
  struct Row: Equatable, Sendable {
    let index: Int
    let title: String
    let outcome: OwlStepOutcome
  }

  let rows: [Row]

  var verified: Int { rows.filter { $0.outcome == .verified }.count }
  var unverified: Int { rows.filter { $0.outcome == .unverified }.count }
  /// Steps that have a check.
  var checked: Int { verified + unverified }
  var hasChecks: Bool { checked > 0 }
  /// True only when the task has checks and every one of them passed.
  var allVerified: Bool { hasChecks && unverified == 0 }
}
