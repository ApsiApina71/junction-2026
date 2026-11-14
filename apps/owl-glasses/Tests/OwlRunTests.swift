//
// OwlRunTests.swift
//
// Tests for the rule in `DisplayAccess/Owl/OwlRunLog.swift`: a step is verified only by a final
// check answer for this run, this step and this attempt. Also the key-frame rule of
// `OwlHEVC.swift`. Run on the Mac with `Tests/run.sh` (the Xcode project has no test target).
//

import CoreImage
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
    confidence: nil, decidedBy: "rules", stepDone: stepDone, nextCheckMs: nil)
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
expect(OwlCheckRules.verdict(result: result("ok", stepDone: true), ticket: now, current: now) == .verified, "ok + step_done verifies")

// "ok" without step_done is a live green frame, not a verification.
expect(OwlCheckRules.verdict(result: result("ok"), ticket: now, current: now) == .cannotCheck(.serverError), "ok without step_done does not verify")

// A problem is a problem, even if step_done were wrongly set.
expect(OwlCheckRules.verdict(result: result("warning", problem: "wrong_item", stepDone: true), ticket: now, current: now) == .problem, "a warning is never verified")

// Unsure, still checking and no answer at all are all "cannot check".
expect(OwlCheckRules.verdict(result: result("unsure"), ticket: now, current: now) == .cannotCheck(.cantSee), "unsure cannot check")
expect(OwlCheckRules.verdict(result: result("checking", problem: "wrong_item"), ticket: now, current: now) == .cannotCheck(.timedOut), "still checking is a timeout")
expect(OwlCheckRules.verdict(result: nil, failure: .offline, ticket: now, current: now) == .cannotCheck(.offline), "no answer: offline")
expect(OwlCheckRules.verdict(result: nil, ticket: now, current: now) == .cannotCheck(.serverError), "no answer: server error by default")
expect(OwlCheckRules.verdict(result: result("something-new"), ticket: now, current: now) == .cannotCheck(.cantSee), "an unknown status never verifies")

// Late answers: from an older attempt, another step, another run, or after the worker left the step.
let green = result("ok", stepDone: true)
expect(OwlCheckRules.verdict(result: green, ticket: OwlCheckTicket(runID: "run-1", stepID: "step-2", attempt: 2), current: now) == .stale, "an older attempt is stale")
expect(OwlCheckRules.verdict(result: green, ticket: OwlCheckTicket(runID: "run-1", stepID: "step-1", attempt: 3), current: now) == .stale, "another step is stale")
expect(OwlCheckRules.verdict(result: green, ticket: OwlCheckTicket(runID: "run-0", stepID: "step-2", attempt: 3), current: now) == .stale, "another run is stale")
expect(OwlCheckRules.verdict(result: green, ticket: now, current: nil) == .stale, "an answer after the worker left the step is stale")
expect(!OwlCheckRules.isCurrent(OwlCheckTicket(runID: "run-1", stepID: "step-2", attempt: 4), now), "a live answer for a newer attempt is not this one")

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

// Checks the worker switched off themselves are still "not verified".
var optedOut = OwlRunLog(runID: "run-1")
optedOut.continueUnverified(pick, why: .checksOff)
expect(optedOut.outcome(of: pick) == .unverified && OwlCheckBlock.checksOff.isWorkersChoice, "checks off by choice is not verified")
expect(!OwlCheckBlock.offline.isWorkersChoice && OwlCheckBlock.cameraPaused.isWorkersChoice, "only the worker's own switches count as their choice")
expect(optedOut.summary(of: process).unverified >= 1 && !optedOut.summary(of: process).allVerified, "an opted-out run is never 'all verified'")

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
expect(OwlCheckRules.otherLinesRight(wrongSize) == 2, "two other lines are right")
expect(OwlCheckRules.otherLinesRight(result("unsure", lines: wrongSize.lines)) == nil, "not said for an unsure result")
expect(OwlCheckRules.otherLinesRight(result("checking", problem: "wrong_item", lines: wrongSize.lines)) == nil, "not said while still checking")
expect(OwlCheckRules.otherLinesRight(result("warning", problem: "missing", lines: [line("Coffee 500 g", "missing", seen: 0), line("Tea", "who-knows")])) == nil, "not said when a line has an unknown status")
expect(OwlCheckRules.otherLinesRight(result("warning", problem: "missing", lines: [line("A", "missing", seen: 0), line("B", "wrong_item"), line("C", "ok")])) == nil, "not said when more than one line is wrong")
expect(OwlCheckRules.otherLinesRight(result("warning", problem: "too_many", lines: [line("A", "ok"), line("B", "ok")])) == nil, "not said when the problem is an extra item outside the lines")
expect(OwlCheckRules.otherLinesRight(result("warning", problem: "not_matching")) == nil, "not said for a visual step")

// The line to fix and what was seen instead.
expect(OwlCheckRules.lineToFix(wrongSize)?.name == "Oat drink 1 l", "the wrong item comes first")
expect(OwlCheckRules.lineToFix(result("warning", lines: [line("A", "too_many"), line("B", "missing", seen: 0)]))?.name == "B", "missing comes before too many")
expect(OwlCheckRules.lineToFix(result("ok", lines: [line("A", "ok")])) == nil, "nothing to fix when every line is right")
expect(OwlCheckRules.seenInstead(wrongSize.lines![0]) == "Oat drink 0.5 l", "the count is taken off the note")
expect(OwlCheckRules.seenInstead(line("A", "wrong_item", note: "2 × Tea 100 g, 1 × Jam")) == "Tea 100 g", "the first seen item is used")
expect(OwlCheckRules.seenInstead(line("A", "wrong_item", note: "Oat drink 0.5 l")) == "Oat drink 0.5 l", "a note without a count is used as it is")
expect(OwlCheckRules.seenInstead(line("A", "missing")) == nil, "no note, nothing seen instead")
expect(OwlCheckRules.seenInstead(line("Kaurajuoma 1 l", "wrong_item", note: "1 × Kaurajuoma 0,5 l")) == "Kaurajuoma 0,5 l", "a decimal comma is not a separator")
expect(OwlCheckRules.seenInstead(line("A", "wrong_item", note: "1 × Kaurajuoma 0,5 l, 2 × Tee 100 g")) == "Kaurajuoma 0,5 l", "first of several, with a decimal comma")
let fiLine = line("Kaurajuoma 1 l", "wrong_item", note: "1 × Kaurajuoma 0,5 l")
let fiDiff = OwlCheckRules.difference(expected: fiLine.name, seen: OwlCheckRules.seenInstead(fiLine) ?? "")
expect(fiDiff?.expected == "1 l" && fiDiff?.seen == "0,5 l", "the Finnish size difference is found")

// Where two product names differ.
let diff = OwlCheckRules.difference(expected: "Oat drink 1 l", seen: "Oat drink 0.5 l")
expect(diff?.common == "Oat drink" && diff?.expected == "1 l" && diff?.seen == "0.5 l", "shared name, differing size")
let fi = OwlCheckRules.difference(expected: "Kaurajuoma 1 l", seen: "kaurajuoma 0,5 l")
expect(fi?.common == "Kaurajuoma" && fi?.expected == "1 l" && fi?.seen == "0,5 l", "Finnish names, case ignored")
expect(OwlCheckRules.difference(expected: "Coffee 500 g", seen: "Tea 100 g") == nil, "no shared words: no split")
expect(OwlCheckRules.difference(expected: "Oat drink", seen: "Oat drink") == nil, "same name: no split")
expect(OwlCheckRules.difference(expected: "Oat drink", seen: "Oat drink 1 l") == nil, "one name inside the other: no split")

// One problem is announced once.
expect(OwlCheckRules.signature(wrongSize) == OwlCheckRules.signature(wrongSize), "the same problem has the same signature")
let otherProblem = result("warning", problem: "missing", lines: [line("Coffee 500 g", "missing", seen: 0)])
expect(OwlCheckRules.signature(wrongSize) != OwlCheckRules.signature(otherProblem), "a different problem has a different signature")

// Key frames: only a frame with a random access picture can start a decode. A frame taken
// for a key frame by mistake decodes to flat grey, which is what every picture was in the simulator.
/// One NAL unit of `type` with `payload` bytes after its two-byte header, behind a length of `lengthSize` bytes.
func nal(_ type: UInt8, payload: Int = 6, lengthSize: Int = 4) -> [UInt8] {
  let length = payload + 2
  let prefix = (0..<lengthSize).map { UInt8((length >> (8 * (lengthSize - 1 - $0))) & 0xFF) }
  return prefix + [type << 1, 0x01] + [UInt8](repeating: 0xAB, count: payload)
}
expect(OwlHEVC.holdsRandomAccessPicture(nal(32) + nal(33) + nal(34) + nal(19, payload: 400)) == true, "parameter sets and an IDR picture: a key frame")
expect(OwlHEVC.holdsRandomAccessPicture(nal(19)) == true, "an IDR picture alone: a key frame")
expect(OwlHEVC.holdsRandomAccessPicture(nal(20)) == true, "IDR without leading pictures: a key frame")
expect(OwlHEVC.holdsRandomAccessPicture(nal(21)) == true, "a CRA picture: a key frame")
expect(OwlHEVC.holdsRandomAccessPicture(nal(16)) == true, "a BLA picture: a key frame")
expect(OwlHEVC.holdsRandomAccessPicture(nal(1, payload: 60)) == false, "a trailing picture is not a key frame")
expect(OwlHEVC.holdsRandomAccessPicture(nal(0, payload: 40)) == false, "a non-reference trailing picture is not a key frame")
expect(OwlHEVC.holdsRandomAccessPicture(nal(39) + nal(1)) == false, "extra information and a trailing picture: not a key frame")
expect(OwlHEVC.holdsRandomAccessPicture(nal(35) + nal(1) + nal(19)) == true, "a key frame is found after other units")
expect(OwlHEVC.holdsRandomAccessPicture(nal(19, lengthSize: 2), lengthSize: 2) == true, "two-byte lengths are read")
expect(OwlHEVC.holdsRandomAccessPicture(nal(1, lengthSize: 2), lengthSize: 2) == false, "two-byte lengths, not a key frame")
expect(OwlHEVC.holdsRandomAccessPicture([]) == nil, "no data: unknown")
expect(OwlHEVC.holdsRandomAccessPicture([0, 0, 0, 1, 0x26, 0x01, 0xAB, 0xAB]) == nil, "start codes instead of lengths: unknown")
expect(OwlHEVC.holdsRandomAccessPicture(Array(nal(1, payload: 60).dropLast(5))) == nil, "a cut frame: unknown")
expect(OwlHEVC.holdsRandomAccessPicture(nal(1) + [0, 0]) == nil, "bytes left over after the last unit: unknown")
expect(OwlHEVC.holdsRandomAccessPicture(nal(19), lengthSize: 0) == nil, "an impossible length size: unknown")
expect(OwlHEVC.holdsRandomAccessPicture(nal(19), lengthSize: 5) == nil, "a length size over four bytes: unknown")

// Freshness: a picture is evidence only when the picture itself is new. A frame that arrives
// but is not kept (no key frame for a long time) must not make an older picture look fresh.
let pinch = Date(timeIntervalSince1970: 1_000)
expect(OwlHEVC.isFresh(taken: pinch.addingTimeInterval(0.4), now: pinch.addingTimeInterval(0.5), maxAge: 1.5, newerThan: pinch), "a picture from after the pinch is evidence")
expect(!OwlHEVC.isFresh(taken: pinch.addingTimeInterval(-0.2), now: pinch.addingTimeInterval(0.5), maxAge: 1.5, newerThan: pinch), "a picture from before the pinch is not, however recent")
expect(!OwlHEVC.isFresh(taken: pinch, now: pinch.addingTimeInterval(0.5), maxAge: 1.5, newerThan: pinch), "a picture from the instant of the pinch is not after it")
expect(!OwlHEVC.isFresh(taken: pinch.addingTimeInterval(-20), now: pinch, maxAge: 3, newerThan: nil), "a picture kept for 20 seconds is too old for a live check")
expect(OwlHEVC.isFresh(taken: pinch.addingTimeInterval(-2), now: pinch, maxAge: 3, newerThan: nil), "two seconds old is still a live picture")
expect(!OwlHEVC.isFresh(taken: nil, now: pinch, maxAge: 3, newerThan: nil), "no picture is never fresh")

// Back while Owl is checking: the worker gets a new attempt, and the old one's answer is dropped
// even when it says the step is done.
let packStep = step("step-2", index: 2)
let checking = OwlCheckTicket(runID: "run-1", stepID: "step-2", attempt: 3)
let afterBack = OwlCheckTicket(runID: "run-1", stepID: "step-2", attempt: 4)
let lateYes = result("ok", stepDone: true)
if case .stale = OwlCheckRules.verdict(result: lateYes, failure: nil, ticket: checking, current: afterBack) {
  passed += 1
} else {
  failures += 1
  print("FAILED: an answer that arrives after Back must be dropped")
}
var backLog = OwlRunLog(runID: "run-1")
expect(!backLog.verify(packStep, result: lateYes, ticket: checking, current: afterBack), "a late yes after Back does not verify the step")
expect(backLog.outcome(of: packStep) != OwlStepOutcome.verified, "the step is not shown as verified after Back")

// A pinch right after Owl itself changed the card was aimed at a button that is gone: it is
// dropped, so "Back" on a correction never becomes "Done" on the step card that replaced it.
expect(OwlCheckRules.pinchCounts(sinceSwap: nil), "a card the worker opened takes a pinch at once")
expect(!OwlCheckRules.pinchCounts(sinceSwap: 0.05), "a pinch 50 ms after the card changed is dropped")
expect(!OwlCheckRules.pinchCounts(sinceSwap: 0.9), "a pinch 0.9 s after the card changed is dropped")
expect(OwlCheckRules.pinchCounts(sinceSwap: 1.0), "after a second the pinch counts again")
expect(OwlCheckRules.pinchCounts(sinceSwap: 30), "long after, it counts")

// An answer that was not a real look at the camera is named as such.
expect(OwlCheckRules.unrealSource(decidedBy: "demo") == .scriptedDemo, "demo mode is a scripted demo")
expect(OwlCheckRules.unrealSource(decidedBy: "mock") == .sampleAnswer, "a mock answer is a sample answer")
expect(OwlCheckRules.unrealSource(decidedBy: "jev") == nil, "a decision by Jev is a real check")
expect(OwlCheckRules.unrealSource(decidedBy: "rules") == nil, "a decision by the rules is a real check")
expect(OwlCheckRules.unrealSource(decidedBy: nil) == nil, "no decider named: nothing claimed")

// JUN-97: Owl's markers are read from a picture, other QR codes are not.
func qr(_ text: String) -> CGImage? {
  guard let filter = CIFilter(name: "CIQRCodeGenerator") else { return nil }
  filter.setValue(Data(text.utf8), forKey: "inputMessage")
  guard let code = filter.outputImage?.transformed(by: CGAffineTransform(scaleX: 8, y: 8)) else { return nil }
  // A white border, as on paper.
  let paper = CIImage(color: .white).cropped(to: code.extent.insetBy(dx: -64, dy: -64))
  return CIContext().createCGImage(code.composited(over: paper), from: paper.extent)
}

if let marker = qr("owl:cp:proc-pick-pack:step-2") {
  expect(OwlMarkers.read(in: marker) == ["owl:cp:proc-pick-pack:step-2"], "a checkpoint marker is read")
} else {
  expect(false, "could not draw a QR code")
}
if let other = qr("https://example.com") {
  expect(OwlMarkers.read(in: other).isEmpty, "a QR code that is not Owl's is ignored")
}
expect(OwlMarkers.isOwlMarker("owl:zone:zone-c"), "a zone marker is Owl's")
expect(!OwlMarkers.isOwlMarker("owl:other"), "other owl: texts are not markers")

let decoder = JSONDecoder()
decoder.keyDecodingStrategy = .convertFromSnakeCase
let locationJSON = """
  {"employee_id":"emp-sami","tracking":true,"zone":{"id":"zone-c","name":"Aisle C"},"entered_at":"2026-11-14T10:00:00Z",
   "history":[],"unlocked":[{"process_id":"proc-pick-pack","step_id":"step-2"}]}
  """
if let location = try? decoder.decode(OwlLocation.self, from: Data(locationJSON.utf8)) {
  expect(location.isUnlocked(processID: "proc-pick-pack", stepID: "step-2"), "an unlocked step is open")
  expect(!location.isUnlocked(processID: "proc-pick-pack", stepID: "step-4"), "another checkpoint stays locked")
  expect(location.zone?.name == "Aisle C", "the zone is read")
} else {
  expect(false, "the location answer decodes")
}
let checkpointJSON = """
  {"id":"step-2","index":2,"title":"Pick","instruction":"Pick.","check":{"kind":"order"},
   "checkpoint":{"zone_id":"zone-c","label":"Aisle C · Shelf 12"}}
  """
expect((try? decoder.decode(OwlStep.self, from: Data(checkpointJSON.utf8)))?.checkpoint?.label == "Aisle C · Shelf 12", "a step's checkpoint decodes")

// JUN-96: the training period.
let trainingJSON = """
  {"employee_id":"emp-sami","starts":"2026-11-10","ends":"2026-11-14","day":5,"days":5,"days_left":0,"active":true,
   "target":[{"process_id":"p","step_id":"step-1","title":"Take a box","required":3,"done_without_help":3,"met":true},
             {"process_id":"p","step_id":"step-4","title":"Pack heavy items first","required":3,"done_without_help":2,"met":false}],
   "practise":[{"process_id":"p","step_id":"step-4","title":"Pack heavy items first"}],
   "suggestion":"more_practice","seen_at":null,"confirmed":null}
  """
if let training = try? decoder.decode(OwlTraining.self, from: Data(trainingJSON.utf8)) {
  expect(training.missing.map(\.title) == ["Pack heavy items first"], "only the steps not met are missing")
  expect(training.result == "more_practice", "the suggestion is the result until a trainer confirms")
  expect(training.remainingDays() == 0, "the last day has no days left")
} else {
  expect(false, "the training answer decodes")
}
let confirmedJSON = """
  {"starts":"2026-11-10","ends":"2099-11-14","target":[],"suggestion":"more_practice",
   "confirmed":{"result":"ready","by":"Laura","at":"2026-11-14T12:00:00Z","note":null}}
  """
if let confirmed = try? decoder.decode(OwlTraining.self, from: Data(confirmedJSON.utf8)) {
  expect(confirmed.result == "ready", "the trainer's confirmed result wins over Owl's suggestion")
  expect((confirmed.remainingDays() ?? 0) > 0, "days left are counted from the end date")
}

print("\(passed) passed, \(failures) failed")
exit(failures == 0 ? 0 : 1)
