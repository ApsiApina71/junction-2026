//
// OwlRunTests.swift
//
// Tests for the rule in `DisplayAccess/Owl/OwlRun.swift`: a step is verified only by a final
// check answer for this run, this step and this attempt. Run on the Mac with `Tests/run.sh`
// (the Xcode project has no test target).
//

import Foundation

nonisolated(unsafe) var failures = 0
nonisolated(unsafe) var passed = 0

func expect(_ condition: @autoclosure () -> Bool, _ message: String, line: Int = #line) {
  if condition() {
    passed += 1
  } else {
    failures += 1
    print("FAILED line \(line): \(message)")
  }
}

func step(_ id: String, index: Int, kind: String = "order") -> OwlStep {
  OwlStep(
    id: id, index: index, title: "Step \(index)", instruction: "Do it.", say: nil,
    referenceImageUrl: nil, clipUrl: nil,
    check: OwlCheck(kind: kind, criteria: nil, orderLines: nil), source: nil)
}

func result(
  _ status: String, problem: String? = nil, stepDone: Bool = false, lines: [OwlCheckLine]? = nil,
  text: String? = nil
) -> OwlCheckResult {
  OwlCheckResult(
    status: status, problem: problem, text: text, say: nil, hint: nil, lines: lines,
    confidence: nil, decidedBy: "rules", stepDone: stepDone)
}

func line(_ name: String, _ status: String, expected: Int = 1, seen: Int = 1, note: String? = nil) -> OwlCheckLine {
  OwlCheckLine(name: name, expected: expected, seen: seen, status: status, note: note)
}

let pick = step("step-2", index: 2)
let seal = step("step-5", index: 5, kind: "visual")
let noCheck = step("step-9", index: 9, kind: "none")
let process = OwlProcess(
  id: "proc", title: "Pick and pack", summary: nil, company: nil, language: "en", status: "published",
  source: "record", expert: "Laura", steps: [pick, seal, noCheck])
let now = OwlCheckTicket(runID: "run-1", stepID: "step-2", attempt: 3)

// A final answer that says done, for the current ticket, verifies.
expect(OwlRun.verdict(result: result("ok", stepDone: true), ticket: now, current: now) == .verified, "ok + step_done verifies")

// "ok" without step_done is a live green frame, not a verification.
expect(OwlRun.verdict(result: result("ok"), ticket: now, current: now) == .cannotCheck(.serverError), "ok without step_done does not verify")

// A problem is a problem, even if step_done were wrongly set.
expect(OwlRun.verdict(result: result("warning", problem: "wrong_item", stepDone: true), ticket: now, current: now) == .problem, "a warning is never verified")

// Unsure, still checking and no answer at all are all "cannot check".
expect(OwlRun.verdict(result: result("unsure"), ticket: now, current: now) == .cannotCheck(.cantSee), "unsure cannot check")
expect(OwlRun.verdict(result: result("checking", problem: "wrong_item"), ticket: now, current: now) == .cannotCheck(.timedOut), "still checking is a timeout")
expect(OwlRun.verdict(result: nil, failure: .offline, ticket: now, current: now) == .cannotCheck(.offline), "no answer: offline")
expect(OwlRun.verdict(result: nil, ticket: now, current: now) == .cannotCheck(.serverError), "no answer: server error by default")
expect(OwlRun.verdict(result: result("something-new"), ticket: now, current: now) == .cannotCheck(.cantSee), "an unknown status never verifies")

// Late answers: from an older attempt, another step, another run, or after the worker left the step.
let green = result("ok", stepDone: true)
expect(OwlRun.verdict(result: green, ticket: OwlCheckTicket(runID: "run-1", stepID: "step-2", attempt: 2), current: now) == .stale, "an older attempt is stale")
expect(OwlRun.verdict(result: green, ticket: OwlCheckTicket(runID: "run-1", stepID: "step-1", attempt: 3), current: now) == .stale, "another step is stale")
expect(OwlRun.verdict(result: green, ticket: OwlCheckTicket(runID: "run-0", stepID: "step-2", attempt: 3), current: now) == .stale, "another run is stale")
expect(OwlRun.verdict(result: green, ticket: now, current: nil) == .stale, "an answer after the worker left the step is stale")
expect(!OwlRun.isCurrent(OwlCheckTicket(runID: "run-1", stepID: "step-2", attempt: 4), now), "a live answer for a newer attempt is not this one")

// The run log records a verification only from a matching, passed final check.
var log = OwlRunLog(runID: "run-1")
expect(!log.verify(pick, result: green, ticket: OwlCheckTicket(runID: "run-1", stepID: "step-2", attempt: 2), current: now), "a stale green does not verify")
expect(log.outcome(of: pick) == nil, "nothing recorded for a stale green")
expect(!log.verify(pick, result: result("ok"), ticket: now, current: now), "a live green does not verify")
expect(!log.verify(seal, result: green, ticket: now, current: now), "a green for another step does not verify this one")
var otherRun = OwlRunLog(runID: "run-2")
expect(!otherRun.verify(pick, result: green, ticket: now, current: now), "a green from another run does not verify")
expect(log.verify(pick, result: green, ticket: now, current: now), "a matching passed final check verifies")
expect(log.outcome(of: pick) == .verified, "verified is recorded")

// No green carries forward: the next step starts with no outcome.
expect(log.outcome(of: seal) == nil, "the next step has no outcome yet")

// Continuing without a check is recorded, with the reason.
log.continueUnverified(seal, why: .offline)
expect(log.outcome(of: seal) == .unverified, "continue unverified is recorded")
expect(log.blocks[seal.id] == .offline, "the reason is kept")

// A step without a check is confirmed, never verified.
log.confirm(noCheck)
expect(log.outcome(of: noCheck) == .noCheck, "a step without a check is 'no check'")
var sloppy = OwlRunLog(runID: "run-1")
sloppy.confirm(pick)
expect(sloppy.outcome(of: pick) == .unverified, "confirming a step that has a check records it as unverified")
sloppy.continueUnverified(noCheck, why: .offline)
expect(sloppy.outcome(of: noCheck) == .noCheck, "a step without a check cannot be 'unverified'")

// The summary is honest.
let summary = log.summary(of: process)
expect(summary.verified == 1 && summary.unverified == 1 && summary.checked == 2, "counts: one verified, one not")
expect(!summary.allVerified, "not all verified when one step was skipped")
expect(summary.rows.map(\.outcome) == [.verified, .unverified, .noCheck], "one row per step, in order")
let empty = OwlRunLog(runID: "run-3").summary(of: process)
expect(empty.unverified == 2 && !empty.allVerified, "a step with a check and no outcome counts as not verified")
var all = OwlRunLog(runID: "run-1")
all.verify(pick, result: green, ticket: now, current: now)
let sealTicket = OwlCheckTicket(runID: "run-1", stepID: "step-5", attempt: 1)
all.verify(seal, result: green, ticket: sealTicket, current: sealTicket)
all.confirm(noCheck)
expect(all.summary(of: process).allVerified, "all verified when every check passed")
let plain = OwlProcess(id: "p2", title: "Sweep", summary: nil, company: nil, language: "en", status: "published", source: "docs", expert: nil, steps: [noCheck])
expect(!OwlRunLog(runID: "r").summary(of: plain).allVerified && !OwlRunLog(runID: "r").summary(of: plain).hasChecks, "a task without checks is never 'all verified'")

// "Other lines are right" only when this result proves it.
let wrongSize = result(
  "warning", problem: "wrong_item",
  lines: [
    line("Oat drink 1 l", "wrong_item", expected: 2, seen: 1, note: "1 × Oat drink 0.5 l"),
    line("Coffee 500 g", "ok"), line("Rye crispbread", "ok"),
  ])
expect(OwlRun.otherLinesRight(wrongSize) == 2, "two other lines are right")
expect(OwlRun.otherLinesRight(result("unsure", lines: wrongSize.lines)) == nil, "not said for an unsure result")
expect(OwlRun.otherLinesRight(result("checking", problem: "wrong_item", lines: wrongSize.lines)) == nil, "not said while still checking")
expect(OwlRun.otherLinesRight(result("warning", problem: "missing", lines: [line("Coffee 500 g", "missing", seen: 0), line("Tea", "who-knows")])) == nil, "not said when a line has an unknown status")
expect(OwlRun.otherLinesRight(result("warning", problem: "missing", lines: [line("A", "missing", seen: 0), line("B", "wrong_item"), line("C", "ok")])) == nil, "not said when more than one line is wrong")
expect(OwlRun.otherLinesRight(result("warning", problem: "too_many", lines: [line("A", "ok"), line("B", "ok")])) == nil, "not said when the problem is an extra item outside the lines")
expect(OwlRun.otherLinesRight(result("warning", problem: "not_matching")) == nil, "not said for a visual step")

// The line to fix and what was seen instead.
expect(OwlRun.lineToFix(wrongSize)?.name == "Oat drink 1 l", "the wrong item comes first")
expect(OwlRun.lineToFix(result("warning", lines: [line("A", "too_many"), line("B", "missing", seen: 0)]))?.name == "B", "missing comes before too many")
expect(OwlRun.lineToFix(result("ok", lines: [line("A", "ok")])) == nil, "nothing to fix when every line is right")
expect(OwlRun.seenInstead(wrongSize.lines![0]) == "Oat drink 0.5 l", "the count is taken off the note")
expect(OwlRun.seenInstead(line("A", "wrong_item", note: "2 × Tea 100 g, 1 × Jam")) == "Tea 100 g", "the first seen item is used")
expect(OwlRun.seenInstead(line("A", "wrong_item", note: "Oat drink 0.5 l")) == "Oat drink 0.5 l", "a note without a count is used as it is")
expect(OwlRun.seenInstead(line("A", "missing")) == nil, "no note, nothing seen instead")
expect(OwlRun.seenInstead(line("Kaurajuoma 1 l", "wrong_item", note: "1 × Kaurajuoma 0,5 l")) == "Kaurajuoma 0,5 l", "a decimal comma is not a separator")
expect(OwlRun.seenInstead(line("A", "wrong_item", note: "1 × Kaurajuoma 0,5 l, 2 × Tee 100 g")) == "Kaurajuoma 0,5 l", "first of several, with a decimal comma")
let fiLine = line("Kaurajuoma 1 l", "wrong_item", note: "1 × Kaurajuoma 0,5 l")
let fiDiff = OwlRun.difference(expected: fiLine.name, seen: OwlRun.seenInstead(fiLine) ?? "")
expect(fiDiff?.expected == "1 l" && fiDiff?.seen == "0,5 l", "the Finnish size difference is found")

// Where two product names differ.
let diff = OwlRun.difference(expected: "Oat drink 1 l", seen: "Oat drink 0.5 l")
expect(diff?.common == "Oat drink" && diff?.expected == "1 l" && diff?.seen == "0.5 l", "shared name, differing size")
let fi = OwlRun.difference(expected: "Kaurajuoma 1 l", seen: "kaurajuoma 0,5 l")
expect(fi?.common == "Kaurajuoma" && fi?.expected == "1 l" && fi?.seen == "0,5 l", "Finnish names, case ignored")
expect(OwlRun.difference(expected: "Coffee 500 g", seen: "Tea 100 g") == nil, "no shared words: no split")
expect(OwlRun.difference(expected: "Oat drink", seen: "Oat drink") == nil, "same name: no split")
expect(OwlRun.difference(expected: "Oat drink", seen: "Oat drink 1 l") == nil, "one name inside the other: no split")

// One problem is announced once.
expect(OwlRun.signature(wrongSize) == OwlRun.signature(wrongSize), "the same problem has the same signature")
let otherProblem = result("warning", problem: "missing", lines: [line("Coffee 500 g", "missing", seen: 0)])
expect(OwlRun.signature(wrongSize) != OwlRun.signature(otherProblem), "a different problem has a different signature")

print("\(passed) passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
