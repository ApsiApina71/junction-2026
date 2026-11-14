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
}

struct OwlCheck: Codable, Equatable, Sendable {
  /// `visual`, `order` or `none`.
  let kind: String
  let criteria: [String]?
  let orderLines: [OwlOrderLine]?

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

  var isEnded: Bool { status == "ended" }
  var isConnected: Bool { status == "connected" }
}

struct OwlHelpMessage: Codable, Equatable, Sendable, Identifiable {
  let id: Int
  /// `worker` or `expert`.
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
