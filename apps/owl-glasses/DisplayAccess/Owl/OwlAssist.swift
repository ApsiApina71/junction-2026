//
// OwlAssist.swift
//
// Customer service mode (JUN-98): while the worker has it on during training, the glasses
// listen to the conversation at the counter, and a Hint pinch shows two or three bullets from
// the company's own documents (`POST /assist`).
//
// The conversation lives only in this value, in the phone's memory: never on disk, never in
// a log line. Only the last ~30 seconds are kept and sent, and everything is dropped when the
// mode ends.
//

import Foundation

struct OwlConversation: Sendable {
  private struct Line: Sendable {
    let text: String
    let at: Date
  }

  private var lines: [Line] = []
  /// What is being said right now, not finished yet.
  var partial: String?

  /// How far back a hint looks, and the most the server takes.
  static let window: TimeInterval = 30
  static let maxCharacters = 4000

  var isEmpty: Bool { lines.isEmpty && (partial ?? "").isEmpty }

  mutating func append(_ text: String, at date: Date = Date()) {
    let text = text.trimmingCharacters(in: .whitespacesAndNewlines)
    partial = nil
    guard !text.isEmpty else { return }
    lines.append(Line(text: text, at: date))
    forget(before: date.addingTimeInterval(-Self.window))
  }

  /// The last `window` seconds as one text, with what is being said now at the end.
  /// `after`: the time of the last hint. When something was said since, only that is sent,
  /// so the next hint answers the new question, not the one before.
  func recent(now: Date = Date(), after: Date? = nil) -> String {
    var since = now.addingTimeInterval(-Self.window)
    if let after, after > since, lines.contains(where: { $0.at > after }) || !(partial ?? "").isEmpty {
      since = after
    }
    var parts = lines.filter { $0.at >= since }.map(\.text)
    if let partial, !partial.isEmpty { parts.append(partial) }
    let text = parts.joined(separator: " ")
    return text.count > Self.maxCharacters ? String(text.suffix(Self.maxCharacters)) : text
  }

  /// The newest words, for the display.
  func lastWords(_ count: Int = 120) -> String? {
    let text = partial.flatMap { $0.isEmpty ? nil : $0 } ?? lines.last?.text
    guard let text else { return nil }
    return text.count > count ? "…" + text.suffix(count) : text
  }

  mutating func forget(before date: Date) {
    lines.removeAll { $0.at < date }
  }

  /// Whether a finished utterance sounds like a customer's question, so Owl can offer a hint
  /// when nobody answers it (the stretch goal of JUN-98).
  static func looksLikeQuestion(_ text: String) -> Bool {
    let text = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    if text.hasSuffix("?") { return true }
    let first = text.split(separator: " ").first.map(String.init) ?? ""
    let openers: Set<String> = [
      "what", "what's", "when", "where", "which", "who", "why", "how", "can", "could", "do", "does", "is", "are",
      "have", "has", "will", "would", "may", "mitä", "mikä", "milloin", "missä", "miten", "kuinka", "voinko", "onko",
      "paljonko", "saako", "voiko",
    ]
    return openers.contains(first)
  }
}

/// The suggested answer (`POST /assist`). Bullets for the display only: the glasses never
/// speak them, the worker speaks to the customer.
struct OwlAssist: Codable, Equatable, Sendable {
  let bullets: [String]
  let say: String?
  let sources: [OwlSource]
  /// Not in the documents: the one bullet says to ask a colleague.
  let unsure: Bool
}
