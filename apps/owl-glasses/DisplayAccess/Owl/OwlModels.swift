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
