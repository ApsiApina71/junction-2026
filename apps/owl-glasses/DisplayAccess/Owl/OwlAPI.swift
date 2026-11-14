//
// OwlAPI.swift
//
// HTTP client for owl-api (docs/specs/owl-contract.md). Every call maps failures to
// `OwlError`, so the flow can tell "no network" from "server error" and keep going.
//

import Foundation
import UIKit

enum OwlError: LocalizedError, Equatable {
  case noGlasses
  case noCamera
  case cameraPermissionDenied
  case microphonePermissionDenied
  case cameraTimeout
  case stream(String)
  case badServerURL(String)
  case offline
  case unauthorized
  case notFound
  case rateLimited
  case server(Int, String)
  case decoding(String)

  var errorDescription: String? {
    switch self {
    case .noGlasses: "Glasses are not connected."
    case .noCamera: "Couldn't open the glasses camera."
    case .cameraPermissionDenied: "Camera is not allowed for Owl. Ask your supervisor."
    case .microphonePermissionDenied: "Microphone is not allowed for Owl. Ask your supervisor."
    case .cameraTimeout: "The camera took too long."
    case .stream(let message): "Camera problem: \(message)"
    case .badServerURL(let url): "Server address is not valid: \(url)"
    case .offline: "No connection to Owl's server."
    case .unauthorized: "Owl's server said no. Ask your supervisor."
    case .notFound: "Owl couldn't find that task."
    case .rateLimited: "Owl is busy. Trying again."
    case .server(let code, let detail): detail.isEmpty ? "Owl's server answered \(code)." : detail
    case .decoding: "Owl got an answer it didn't understand."
    }
  }

  /// Network and server trouble: the step keeps working without the check.
  var isServiceProblem: Bool {
    switch self {
    case .offline, .rateLimited, .server, .decoding: true
    default: false
    }
  }
}

struct OwlAPI: Sendable {
  static let serverURLKey = "owl.serverURL"

  /// The owl-api base URL: set in the app (Server button), else baked in with OWL_API_URL.
  static var serverURL: String {
    get {
      UserDefaults.standard.string(forKey: serverURLKey)
        ?? (Bundle.main.object(forInfoDictionaryKey: "OwlAPIURL") as? String ?? "")
    }
    set { UserDefaults.standard.set(newValue, forKey: serverURLKey) }
  }

  let baseURL: String
  let token: String?

  init(baseURL: String = OwlAPI.serverURL) {
    self.baseURL = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    let token = Bundle.main.object(forInfoDictionaryKey: "OwlAPIToken") as? String
    self.token = token?.isEmpty == false && token?.hasPrefix("$(") == false ? token : nil
  }

  // MARK: - Endpoints

  func health() async throws -> Bool {
    struct Health: Decodable { let status: String }
    let health: Health = try await send(try request("health"))
    return health.status == "ok"
  }

  func employee(_ id: String) async throws -> OwlEmployee {
    try await send(try request("employees/\(id)"))
  }

  func processes() async throws -> [OwlProcess] {
    struct List: Decodable { let processes: [OwlProcess] }
    let list: List = try await send(try request("processes"))
    return list.processes
  }

  func process(_ id: String) async throws -> OwlProcess {
    try await send(try request("processes/\(id)"))
  }

  /// One camera stream frame for the current step. `final` is the worker's "Done" pinch.
  func check(
    frame jpeg: Data, processID: String, stepID: String, runID: String, final: Bool,
    language: String?, mock: String? = nil
  ) async throws -> OwlCheckResult {
    var form = MultipartForm()
    form.addFile("image", filename: "frame.jpg", contentType: "image/jpeg", data: jpeg)
    form.addField("process_id", processID)
    form.addField("step_id", stepID)
    form.addField("run_id", runID)
    form.addField("final", final ? "true" : "false")
    if let language { form.addField("language", language) }
    // The mock owl-api picks its answer from this field (simulator testing only).
    if let mock, !mock.isEmpty { form.addField("mock", mock) }
    return try await send(try request("check", form: form))
  }

  func ask(
    _ question: String, employeeID: String?, processID: String?, stepID: String?, language: String?
  ) async throws -> OwlAnswer {
    struct Body: Encodable {
      let question: String
      let employeeId: String?
      let processId: String?
      let stepId: String?
      let language: String?
    }
    return try await send(
      try request(
        "ask",
        json: Body(
          question: question, employeeId: employeeID, processId: processID, stepId: stepID,
          language: language)))
  }

  // Record (JUN-32)

  func startRecording(title: String, expert: String) async throws -> OwlRecording {
    struct Body: Encodable { let title: String; let expert: String }
    return try await send(try request("record", json: Body(title: title, expert: expert)))
  }

  func addRecordedStep(
    recordingID: String, narration: String, photo jpeg: Data, clip: URL?
  ) async throws -> OwlRecording {
    var form = MultipartForm()
    form.addField("narration", narration)
    form.addFile("photo", filename: "photo.jpg", contentType: "image/jpeg", data: jpeg)
    if let clip, let data = try? Data(contentsOf: clip) {
      form.addFile("clip", filename: clip.lastPathComponent, contentType: "video/mp4", data: data)
    }
    return try await send(try request("record/\(recordingID)/steps", form: form, timeout: 120))
  }

  func finishRecording(_ id: String) async throws -> OwlRecording {
    var finish = try request("record/\(id)/finish")
    finish.httpMethod = "POST"
    return try await send(finish)
  }

  func recording(_ id: String) async throws -> OwlRecording {
    try await send(try request("record/\(id)"))
  }

  // Help (JUN-33)

  func sendHelpFrame(
    _ jpeg: Data, helpID: String?, employeeID: String?, processID: String?, stepID: String?
  ) async throws -> OwlHelpSession {
    var form = MultipartForm()
    form.addFile("image", filename: "frame.jpg", contentType: "image/jpeg", data: jpeg)
    form.addField("employee_id", employeeID ?? "")
    form.addField("process_id", processID ?? "")
    form.addField("step_id", stepID ?? "")
    form.addField("help_id", helpID ?? "")
    return try await send(try request("help/frames", form: form))
  }

  func help(_ id: String) async throws -> OwlHelpSession {
    try await send(try request("help/\(id)"))
  }

  func sayToHelp(_ id: String, text: String) async throws -> OwlHelpSession {
    struct Body: Encodable { let from: String; let text: String }
    return try await send(try request("help/\(id)/say", json: Body(from: "worker", text: text)))
  }

  func endHelp(_ id: String) async throws -> OwlHelpSession {
    var end = try request("help/\(id)/end")
    end.httpMethod = "POST"
    return try await send(end)
  }

  // Media

  /// Downloads an image for the display. Relative paths (`/media/...`) resolve against the server.
  func image(_ urlString: String) async throws -> UIImage? {
    guard let url = resolve(urlString) else { return nil }
    var request = URLRequest(url: url, timeoutInterval: 20)
    authorize(&request)
    let (data, response) = try await load(request)
    guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
    return UIImage(data: data)
  }

  func resolve(_ urlString: String) -> URL? {
    if let url = URL(string: urlString), url.scheme != nil { return url }
    guard let base = URL(string: baseURL), base.scheme != nil else { return nil }
    return URL(string: urlString, relativeTo: base)?.absoluteURL
  }

  // MARK: - Plumbing

  private func request(_ path: String, timeout: TimeInterval = 30) throws -> URLRequest {
    guard let base = URL(string: baseURL), base.scheme != nil else {
      throw OwlError.badServerURL(baseURL)
    }
    var request = URLRequest(url: base.appendingPathComponent(path), timeoutInterval: timeout)
    authorize(&request)
    return request
  }

  private func request(_ path: String, json body: some Encodable) throws -> URLRequest {
    var request = try request(path)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    let encoder = JSONEncoder()
    encoder.keyEncodingStrategy = .convertToSnakeCase
    request.httpBody = try encoder.encode(body)
    return request
  }

  private func request(_ path: String, form: MultipartForm, timeout: TimeInterval = 30) throws
    -> URLRequest
  {
    var request = try request(path, timeout: timeout)
    request.httpMethod = "POST"
    request.setValue(form.contentType, forHTTPHeaderField: "Content-Type")
    request.httpBody = form.body
    return request
  }

  private func authorize(_ request: inout URLRequest) {
    if let token { request.setValue(token, forHTTPHeaderField: "X-Api-Token") }
  }

  private func load(_ request: URLRequest) async throws -> (Data, URLResponse) {
    do {
      return try await URLSession.shared.data(for: request)
    } catch let error as URLError {
      NSLog("[Owl] network: \(error.code.rawValue) \(request.url?.path ?? "")")
      throw OwlError.offline
    }
  }

  private func send<T: Decodable>(_ request: URLRequest) async throws -> T {
    let (data, response) = try await load(request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    switch status {
    case 200..<300:
      break
    case 401: throw OwlError.unauthorized
    case 404: throw OwlError.notFound
    case 429: throw OwlError.rateLimited
    default:
      let detail = (try? JSONDecoder().decode(ErrorDetail.self, from: data))?.detail ?? ""
      NSLog("[Owl] \(request.url?.path ?? "") answered \(status): \(detail)")
      throw OwlError.server(status, detail)
    }
    do {
      let decoder = JSONDecoder()
      decoder.keyDecodingStrategy = .convertFromSnakeCase
      return try decoder.decode(T.self, from: data)
    } catch {
      NSLog("[Owl] decode \(T.self): \(error)")
      throw OwlError.decoding("\(error)")
    }
  }
}

/// The body of an owl-api error answer.
private struct ErrorDetail: Decodable {
  let detail: String
}

/// A small multipart/form-data body builder.
struct MultipartForm {
  private let boundary = "owl-\(UUID().uuidString)"
  private var parts = Data()

  var contentType: String { "multipart/form-data; boundary=\(boundary)" }
  var body: Data { parts + Data("--\(boundary)--\r\n".utf8) }

  mutating func addField(_ name: String, _ value: String) {
    parts.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".utf8))
  }

  mutating func addFile(_ name: String, filename: String, contentType: String, data: Data) {
    parts.append(
      Data(
        "--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"; filename=\"\(filename)\"\r\nContent-Type: \(contentType)\r\n\r\n"
          .utf8))
    parts.append(data)
    parts.append(Data("\r\n".utf8))
  }
}
