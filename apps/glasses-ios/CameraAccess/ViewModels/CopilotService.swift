//
// CopilotService.swift
//
// Junction 2026 prototype: sends a photo from the glasses to copilot-api and speaks the answer.
//

import AVFoundation
import Foundation

/// The answer from `POST /check` on copilot-api.
struct ProductCheck: Decodable, Equatable {
  let identified: Bool
  let productName: String
  let onList: Bool
  let listItem: String?
  let verdict: String
  let speech: String

  enum CodingKeys: String, CodingKey {
    case identified
    case productName = "product_name"
    case onList = "on_list"
    case listItem = "list_item"
    case verdict
    case speech
  }
}

enum CopilotSettings {
  static let apiURLKey = "copilotAPIURL"
  static let tokenKey = "copilotAppToken"

  /// Defaults to the `CopilotAPIURL` Info.plist value, which the build fills in.
  static var apiURL: String {
    get {
      UserDefaults.standard.string(forKey: apiURLKey)
        ?? (Bundle.main.object(forInfoDictionaryKey: "CopilotAPIURL") as? String ?? "")
    }
    set { UserDefaults.standard.set(newValue, forKey: apiURLKey) }
  }

  static var token: String {
    get { UserDefaults.standard.string(forKey: tokenKey) ?? "" }
    set { UserDefaults.standard.set(newValue, forKey: tokenKey) }
  }
}

enum CopilotError: LocalizedError {
  case badURL(String)
  case server(Int, String)

  var errorDescription: String? {
    switch self {
    case .badURL(let url): return "Copilot server URL is not valid: \(url)"
    case .server(let code, let body): return "Copilot server error \(code): \(body)"
    }
  }
}

enum CopilotService {
  static func check(jpeg: Data) async throws -> ProductCheck {
    let base = CopilotSettings.apiURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: base)?.appendingPathComponent("check"), url.scheme != nil else {
      throw CopilotError.badURL(base)
    }

    let boundary = "Boundary-\(UUID().uuidString)"
    var request = URLRequest(url: url, timeoutInterval: 60)
    request.httpMethod = "POST"
    request.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
    if !CopilotSettings.token.isEmpty {
      request.setValue(CopilotSettings.token, forHTTPHeaderField: "X-App-Token")
    }

    var body = Data()
    body.append("--\(boundary)\r\n")
    body.append("Content-Disposition: form-data; name=\"image\"; filename=\"glasses.jpg\"\r\n")
    body.append("Content-Type: image/jpeg\r\n\r\n")
    body.append(jpeg)
    body.append("\r\n--\(boundary)--\r\n")
    request.httpBody = body

    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else {
      throw CopilotError.server(status, String(decoding: data.prefix(300), as: UTF8.self))
    }
    return try JSONDecoder().decode(ProductCheck.self, from: data)
  }
}

/// Speaks answers. With the glasses connected as the phone's Bluetooth audio device,
/// the speech plays from the glasses' open-ear speakers.
@MainActor
final class CopilotSpeaker {
  private let synthesizer = AVSpeechSynthesizer()

  func say(_ text: String, keepRecordingSession: Bool) {
    if !keepRecordingSession {
      let session = AVAudioSession.sharedInstance()
      try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
      try? session.setActive(true)
    }
    synthesizer.stopSpeaking(at: .immediate)
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: "en-US")
    synthesizer.speak(utterance)
  }
}

private extension Data {
  mutating func append(_ string: String) {
    append(Data(string.utf8))
  }
}
