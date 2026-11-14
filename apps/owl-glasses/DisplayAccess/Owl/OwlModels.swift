//
// OwlModels.swift
//
// The owl-api shapes from docs/specs/owl-contract.md (JUN-27). Decoded with
// `.convertFromSnakeCase`, so `reference_image_url` becomes `referenceImageUrl` etc.
// Status fields are plain strings with helpers, so a new value from the server never
// breaks decoding on the glasses.
//

import Foundation

struct OwlEmployee: Codable, Equatable, Sendable {
  let id: String
  let name: String
  let language: String
  let role: String?
  let company: String?
  let welcome: String?
  let processIds: [String]
  /// The pair of glasses this employee wears, or nil.
  let glassesId: String?
  /// How Owl talks to this worker (JUN-81). Nil means every option off.
  let access: OwlAccess?
  /// A shift manager: the glasses show the manager screens and ring for help (JUN-100).
  var shiftManager: Bool? = nil
  /// The language of `welcome`, when it is not `language` (JUN-108: a Finnish welcome for a
  /// worker whose glasses otherwise speak English). Nil means `language`.
  var welcomeLanguage: String? = nil
}

/// The manager on shift in the worker's company (`GET /shift/manager`, JUN-100).
struct OwlShiftManager: Codable, Equatable, Sendable {
  let employeeId: String
  let name: String
}

/// Inclusive profiles (JUN-81), set in Owl Studio. All off by default.
struct OwlAccess: Codable, Equatable, Sendable {
  /// Low vision or eyes busy: everything on the display is also spoken, slower.
  var audioFirst = false
  /// Deaf, hard of hearing or a loud workplace: every spoken line is also a caption.
  var displayFirst = false
  /// Short, plain sentences.
  var easyLanguage = false

  init(audioFirst: Bool = false, displayFirst: Bool = false, easyLanguage: Bool = false) {
    self.audioFirst = audioFirst
    self.displayFirst = displayFirst
    self.easyLanguage = easyLanguage
  }

  init(from decoder: Decoder) throws {
    let values = try decoder.container(keyedBy: CodingKeys.self)
    audioFirst = try values.decodeIfPresent(Bool.self, forKey: .audioFirst) ?? false
    displayFirst = try values.decodeIfPresent(Bool.self, forKey: .displayFirst) ?? false
    easyLanguage = try values.decodeIfPresent(Bool.self, forKey: .easyLanguage) ?? false
  }
}

struct OwlProcess: Codable, Equatable, Sendable, Identifiable {
  let id: String
  let title: String
  let summary: String?
  let company: String?
  let language: String?
  let status: String
  let source: String?
  let expert: String?
  let steps: [OwlStep]

  var isPublished: Bool { status == "published" }
}

struct OwlStep: Codable, Equatable, Sendable, Identifiable {
  let id: String
  let index: Int
  let title: String
  let instruction: String
  let say: String?
  let referenceImageUrl: String?
  let clipUrl: String?
  let check: OwlCheck
  let source: OwlSource?
  /// Where the step is done (JUN-97). While location tracking is on, the step stays locked
  /// until the worker reaches this checkpoint.
  var checkpoint: OwlCheckpoint? = nil
}

struct OwlCheckpoint: Codable, Equatable, Sendable {
  let zoneId: String
  /// "Aisle C · Shelf 12".
  let label: String
}

struct OwlCheck: Codable, Equatable, Sendable {
  /// `visual`, `order` or `none`.
  let kind: String
  let criteria: [String]?
  let orderLines: [OwlOrderLine]?
  /// What Owl must see to mark the step done by itself, with no Done pinch (JUN-102).
  let doneWhen: String?

  var usesCamera: Bool { kind == "visual" || kind == "order" }
}

struct OwlOrderLine: Codable, Equatable, Sendable {
  let sku: String?
  let name: String
  let qty: Int
}

struct OwlSource: Codable, Equatable, Sendable {
  let doc: String
  let section: String?
  let quote: String?
}

struct OwlCheckResult: Codable, Equatable, Sendable {
  /// `ok`, `warning`, `checking` or `unsure`.
  let status: String
  /// `wrong_item`, `missing`, `too_many`, `not_matching` or nil.
  let problem: String?
  let text: String?
  let say: String?
  let hint: String?
  let lines: [OwlCheckLine]?
  let confidence: Double?
  let decidedBy: String?
  let stepDone: Bool
  /// When to look again (JUN-82): soon while a problem is confirmed, slower when the step
  /// looks right, nil when there is nothing more to check until the next step or pinch.
  let nextCheckMs: Int?

  var isOK: Bool { status == "ok" }
  var isWarning: Bool { status == "warning" }
  var isUnsure: Bool { status == "unsure" }
}

struct OwlCheckLine: Codable, Equatable, Sendable {
  let name: String
  let expected: Int
  let seen: Int
  /// `ok`, `wrong_item`, `missing` or `too_many`.
  let status: String
  let note: String?

  var isOK: Bool { status == "ok" }
}

struct OwlAnswer: Codable, Equatable, Sendable {
  let found: Bool
  let text: String
  let say: String?
  let language: String?
  let sources: [OwlSource]
}

struct OwlHelpSession: Codable, Equatable, Sendable, Identifiable {
  let id: String
  /// `waiting`, `connected` or `ended`.
  let status: String
  let employeeId: String?
  let processId: String?
  let stepId: String?
  let latestFrameUrl: String?
  /// When the latest frame arrived.
  let frameAt: String?
  let updatedAt: String?
  let messages: [OwlHelpMessage]
  // JUN-100: help from the shift manager's own glasses.
  /// The manager who is rung, and their name (kept after a fallback to Studio).
  var assignee: String? = nil
  var assigneeName: String? = nil
  /// `manager` or `studio`.
  var routed: String? = nil
  /// Why it went to Studio: `no_answer` or `later`.
  var fallback: String? = nil
  // Only in `GET /help/incoming`, for the manager's glasses.
  var employeeName: String? = nil
  var processTitle: String? = nil
  var stepIndex: Int? = nil
  var stepTitle: String? = nil

  var isEnded: Bool { status == "ended" }
  /// Someone helps: an expert in Studio or the manager who accepted.
  var isConnected: Bool { status == "connected" || status == "accepted" }
  var isRinging: Bool { status == "ringing" }
  var isWithManager: Bool { routed == "manager" }
}

struct OwlIncomingHelp: Codable, Sendable {
  let sessions: [OwlHelpSession]
}

struct OwlHelpMessage: Codable, Equatable, Sendable, Identifiable {
  let id: Int
  /// `worker`, `expert` or `manager`.
  let from: String
  let text: String
  let at: String?
  /// The worker's view with a ring where the expert pointed (shown with the expert's words).
  let imageUrl: String?
}

struct OwlRecording: Codable, Equatable, Sendable, Identifiable {
  let id: String
  let title: String
  let expert: String?
  /// `recording`, `processing`, `done` or `failed`.
  let status: String
  let steps: [OwlRecordedStep]
  let processId: String?
}

struct OwlRecordedStep: Codable, Equatable, Sendable {
  let index: Int
  let narration: String
  let photoUrl: String?
  let clipUrl: String?
}

/// The worker's own learning progress (`GET /employees/{id}/progress`, JUN-73). Only the
/// glasses show it, to the worker; it is a learning aid, not a score.
struct OwlProgress: Codable, Equatable, Sendable {
  let employeeId: String
  let tasksDone: Int
  let stepsDone: Int
  let problemsCaught: Int
  let problemsFixed: Int
  /// Newest first.
  let runs: [OwlRun]
  /// Whether the newest finished run was faster than the first one, or nil when unknown.
  let fasterThanFirst: Bool?
}

struct OwlRun: Codable, Equatable, Sendable {
  let runId: String
  let processId: String
  let title: String
  let startedAt: String?
  let finishedAt: String?
  let seconds: Double?
  let stepsDone: Int
  let problemsCaught: Int
  let problemsFixed: Int
}

/// What the worker agreed to (`/employees/{id}/consent`, JUN-80). `at` is nil until asked.
struct OwlConsent: Codable, Equatable, Sendable {
  let employeeId: String?
  let cameraChecks: Bool
  let recording: Bool
  let at: String?
  /// Location tracking during training, from the camera picture (JUN-97). nil from an older server.
  var location: Bool? = nil
}

/// What the glasses show, for the stage page (`POST /stage`, JUN-79).
struct OwlStageScreen: Encodable, Equatable, Sendable {
  let kind: String
  let title: String
  let text: String?
}

struct OwlStageUpdate: Encodable, Sendable {
  struct Step: Encodable, Sendable {
    let processId: String
    let stepId: String
    let index: Int
    let total: Int
  }

  let glassesId: String
  let employeeId: String?
  let language: String?
  let screen: OwlStageScreen
  let said: String?
  let step: Step?
}

/// Which step the worker seems to be doing (`POST /steps/recognize`, JUN-34). It guides;
/// the glasses never move on by themselves.
struct OwlStepRecognition: Codable, Equatable, Sendable {
  /// `ok` or `unsure`.
  let status: String
  let stepId: String?
  let similarities: [String: Double]?
  let margin: Double?
  /// `vjepa2` or `baseline`.
  let backend: String?
  /// V-JEPA 2's own action name ("Putting something into something"); for the stage only.
  let action: String?
}

/// The worker's training period and target level (`GET /employees/{id}/training`, JUN-96).
/// Owl gives the evidence, a person decides: `suggestion` is Owl's, `confirmed` the trainer's.
/// The worker sees all of it on the glasses first: Studio shows the suggestion after `seenAt`.
struct OwlTraining: Codable, Equatable, Sendable {
  struct Target: Codable, Equatable, Sendable {
    let processId: String
    let stepId: String?
    /// The step's name in the worker's language, e.g. "Pack heavy items first".
    let title: String?
    /// The task's name in the worker's language.
    let task: String?
    let required: Int?
    let doneWithoutHelp: Int?
    let met: Bool?

    var reached: Bool { met ?? ((doneWithoutHelp ?? 0) >= (required ?? 1)) }
  }

  struct Confirmed: Codable, Equatable, Sendable {
    /// `ready` or `more_practice`.
    let result: String
    let by: String?
    let at: String?
    let note: String?
  }

  let employeeId: String?
  /// Dates, `ends` is the last day of the period.
  let starts: String?
  let ends: String?
  let day: Int?
  let days: Int?
  let daysLeft: Int?
  let active: Bool?
  let target: [Target]
  /// The target rows not met yet.
  let practise: [Target]?
  /// `ready`, `more_practice`, or nil until the last day.
  let suggestion: String?
  let seenAt: String?
  let confirmed: Confirmed?
  /// The training plan is for a customer service desk: the glasses offer the customer
  /// service mode while the period is active (JUN-98).
  var customerService: Bool? = nil

  var offersCustomerService: Bool { customerService == true && active == true }

  /// The trainer's result once confirmed, else Owl's suggestion.
  var result: String? { confirmed?.result ?? suggestion }
  var missing: [Target] { practise ?? target.filter { !$0.reached } }

  /// Days left after today; 0 on the last day. nil when unknown.
  func remainingDays(from now: Date = Date()) -> Int? {
    if let daysLeft { return max(daysLeft, 0) }
    guard let ends, let end = try? Date(ends, strategy: Date.ISO8601FormatStyle().year().month().day()) else { return nil }
    let calendar = Calendar.current
    return max(calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: end)).day ?? 0, 0)
  }
}

/// Where the worker is during training (`/location`, JUN-97). Only the current zone and
/// today's zones; deleted when the training period ends. owl-api recognises the place from
/// the camera picture of a locked step (`POST /location/frame`).
struct OwlLocation: Codable, Equatable, Sendable {
  /// What one look at the camera was recognised as. A step opens after two looks in a row.
  struct Match: Codable, Equatable, Sendable {
    let zoneId: String?
    let processId: String?
    let stepId: String?
    let score: Double?
    let decidedBy: String?
  }

  struct Zone: Codable, Equatable, Sendable {
    let id: String
    let name: String
  }

  struct StepRef: Codable, Equatable, Sendable {
    let processId: String
    let stepId: String
  }

  let employeeId: String?
  /// On only during the training period and with the worker's consent.
  let tracking: Bool
  let zone: Zone?
  let enteredAt: String?
  let unlocked: [StepRef]?
  var match: Match? = nil
  /// When owl-api wants the next picture.
  var nextCheckMs: Int? = nil
  /// False when the step has no picture of its place: only the trainer or Help opens it.
  var canRecognize: Bool? = nil

  func isUnlocked(processID: String, stepID: String) -> Bool {
    (unlocked ?? []).contains { $0.processId == processID && $0.stepId == stepID }
  }
}
