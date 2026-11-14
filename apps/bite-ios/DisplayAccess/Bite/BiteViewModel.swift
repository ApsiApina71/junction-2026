//
// BiteViewModel.swift
//
// Bite (Junction 2026): food tracking on Meta Ray-Ban Display, with Bo the bear.
// The glasses camera sends frames to glasses-api (apps/glasses-api), which decides when the
// wearer is eating, logs the meal and returns a sentence to speak. Two ways to use it:
//   - Log meal: pinch once; the glasses take up to two photos and the meal is logged.
//   - Watch: the glasses send a frame every few seconds and Bo logs meals by himself.
//

import AVFoundation
import Foundation
import MWDATCamera
import MWDATCore
import Observation
import UIKit

enum BiteError: LocalizedError, Equatable {
  case noSession
  case noCamera
  case cameraPermissionDenied
  case cameraTimeout
  case stream(String)
  case badServerURL(String)
  case server(Int, String)
  case notFood

  var errorDescription: String? {
    switch self {
    case .noSession: "Glasses are not connected."
    case .noCamera: "Couldn't open the glasses camera."
    case .cameraPermissionDenied: "Camera access was not allowed in Meta AI."
    case .cameraTimeout: "The camera took too long. Try again."
    case .stream(let message): "Camera problem: \(message)"
    case .badServerURL(let url): "Server address is not valid: \(url)"
    case .server(let code, _): "Bo's server answered \(code)."
    case .notFood: "Bo couldn't see your food."
    }
  }
}

@Observable
@MainActor
final class BiteViewModel {
  static let serverURLKey = "bite.serverURL"
  private static let watchInterval: Duration = .seconds(3)

  private(set) var today: TodayLog = .empty
  private(set) var isBusy = false
  private(set) var isWatching = false
  private(set) var statusText = "Ready"

  @ObservationIgnored private let displayViewModel: DisplayViewModel
  @ObservationIgnored private let wearables: WearablesInterface
  @ObservationIgnored private let speaker = AVSpeechSynthesizer()
  @ObservationIgnored private var camera: GlassesCamera?
  @ObservationIgnored private var watchTask: Task<Void, Never>?
  @ObservationIgnored private var lastScene: String?
  @ObservationIgnored private var photos: [Int: UIImage] = [:]

  init(displayViewModel: DisplayViewModel, wearables: WearablesInterface) {
    self.displayViewModel = displayViewModel
    self.wearables = wearables
  }

  var goalKcal: Int { today.goalKcal ?? 2000 }

  static var serverURL: String {
    get {
      UserDefaults.standard.string(forKey: serverURLKey)
        ?? (Bundle.main.object(forInfoDictionaryKey: "BiteAPIURL") as? String ?? "")
    }
    set { UserDefaults.standard.set(newValue, forKey: serverURLKey) }
  }

  // MARK: - Screens

  func showHome(deviceIdentifier: DeviceIdentifier? = nil) async {
    await refreshToday()
    await displayViewModel.send(
      BiteDisplay.home(
        today: today, goalKcal: goalKcal, isWatching: isWatching,
        onLogMeal: { [weak self] in Task { @MainActor in await self?.logMeal() } },
        onWatch: { [weak self] in Task { @MainActor in await self?.toggleWatching() } },
        onToday: { [weak self] in Task { @MainActor in await self?.showToday() } }
      ),
      deviceIdentifier: deviceIdentifier
    )
  }

  func showToday() async {
    await refreshToday()
    await displayViewModel.send(
      BiteDisplay.today(
        today: today, goalKcal: goalKcal,
        onBack: { [weak self] in Task { @MainActor in await self?.showHome() } }
      )
    )
  }

  private func showResult(say: String?) async {
    guard let entry = today.entries.first else {
      await showHome()
      return
    }
    let photo = await mealPhoto(entry.id)
    await displayViewModel.send(
      BiteDisplay.result(
        entry: entry, photo: photo, today: today, goalKcal: goalKcal, say: say ?? today.summary,
        isWatching: isWatching,
        onLogAnother: { [weak self] in
          Task { @MainActor in
            guard let self else { return }
            if self.isWatching {
              await self.showWatching(detail: "Eat as usual. I'll log it.")
            } else {
              await self.logMeal()
            }
          }
        },
        onToday: { [weak self] in Task { @MainActor in await self?.showToday() } }
      ))
  }

  private func showProblem(_ error: Error) async {
    let message = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
    statusText = message
    NSLog("[Bite] problem: \(error)")
    say(error as? BiteError == .notFood ? "Hmm, I can't see your food. Try again closer." : "Oops, let's try again.")
    await displayViewModel.send(
      BiteDisplay.problem(
        "Oops!", detail: message,
        onRetry: { [weak self] in Task { @MainActor in await self?.logMeal() } },
        onHome: { [weak self] in Task { @MainActor in await self?.showHome() } }
      ))
  }

  // MARK: - Log meal (one pinch)

  func logMeal() async {
    guard !isBusy else { return }
    isBusy = true
    defer { isBusy = false }

    do {
      statusText = "Bo is looking…"
      await displayViewModel.send(
        BiteDisplay.status("Bo is looking…", detail: "Keep your plate in view.", mood: .looking))
      let camera = try await openCamera()

      // glasses-api logs food after it has been seen twice, so take a second photo if needed.
      var response = try await BiteAPI.postFrame(try await camera.capturePhoto(), serverURL: Self.serverURL)
      if response.event == "pending" || response.event == "busy" {
        statusText = "Bo is tasting…"
        await displayViewModel.send(
          BiteDisplay.status("Bo is tasting…", detail: "Estimating your portion.", mood: .thinking))
        response = try await BiteAPI.postFrame(try await camera.capturePhoto(), serverURL: Self.serverURL)
      }
      if !isWatching { closeCamera() }

      if let todayLog = response.today { today = todayLog }
      lastScene = response.scene
      switch response.event {
      case "logged", "updated", "closed":
        statusText = response.say ?? "Logged"
        if let sentence = response.say { say(sentence) }
        await showResult(say: response.say)
      default:
        throw BiteError.notFood
      }
    } catch {
      if !isWatching { closeCamera() }
      await showProblem(error)
    }
  }

  // MARK: - Watch (automatic)

  func toggleWatching() async {
    if isWatching {
      stopWatching()
      say("Okay, I'll stop watching.")
      await showHome()
      return
    }
    do {
      _ = try await openCamera()
      isWatching = true
      statusText = "Watching your meal"
      say("I'm watching. Enjoy your meal!")
      await showWatching(detail: "Eat as usual. I'll log it.")
      watchTask = Task { [weak self] in await self?.watchLoop() }
    } catch {
      await showProblem(error)
    }
  }

  func stopWatching() {
    watchTask?.cancel()
    watchTask = nil
    isWatching = false
    closeCamera()
    statusText = "Ready"
  }

  private func watchLoop() async {
    while !Task.isCancelled, isWatching {
      try? await Task.sleep(for: Self.watchInterval)
      guard !Task.isCancelled, isWatching, !isBusy, let camera else { continue }
      do {
        // Prefer the live video frame; fall back to a photo when no frame has arrived.
        var frame = camera.latestFrameJPEG()
        if frame == nil { frame = try? await camera.capturePhoto() }
        guard let frame else { continue }
        let response = try await BiteAPI.postFrame(frame, serverURL: Self.serverURL)
        guard response.event != "busy" else { continue }
        if let todayLog = response.today { today = todayLog }
        let sceneChanged = response.scene != lastScene
        lastScene = response.scene
        if let sentence = response.say { say(sentence) }
        switch response.event {
        case "logged", "closed":
          await showResult(say: response.say)
        case "updated":
          await showWatching(detail: "Still eating – I'm counting what's left.")
        case "pending":
          await showWatching(detail: "I see food… one more look.")
        default:
          if sceneChanged { await showWatching(detail: "Eat as usual. I'll log it.") }
        }
      } catch {
        NSLog("[Bite] watch frame failed: \(error)")
      }
    }
  }

  private func showWatching(detail: String) async {
    await displayViewModel.send(
      BiteDisplay.watching(
        today: today, goalKcal: goalKcal, scene: lastScene, detail: detail,
        onStop: { [weak self] in Task { @MainActor in await self?.toggleWatching() } }
      ))
  }

  // MARK: - Data

  func refreshToday() async {
    do {
      today = try await BiteAPI.today(serverURL: Self.serverURL)
    } catch {
      NSLog("[Bite] couldn't load today: \(error)")
    }
  }

  /// The picture the glasses took when the meal was logged (stored by glasses-api).
  private func mealPhoto(_ entryID: Int) async -> UIImage? {
    if let cached = photos[entryID] { return cached }
    guard let photo = try? await BiteAPI.entryImage(entryID, serverURL: Self.serverURL) else { return nil }
    photos[entryID] = photo
    return photo
  }

  func clearToday() async {
    for entry in today.entries {
      _ = try? await BiteAPI.deleteEntry(entry.id, serverURL: Self.serverURL)
    }
    await refreshToday()
  }

  // MARK: - Camera

  private func openCamera() async throws -> GlassesCamera {
    if let camera { return camera }
    guard let session = displayViewModel.currentDeviceSession() else { throw BiteError.noSession }
    if try await wearables.checkPermissionStatus(.camera) != .granted {
      guard try await wearables.requestPermission(.camera) == .granted else {
        throw BiteError.cameraPermissionDenied
      }
    }
    let newCamera = try await GlassesCamera.open(on: session)
    camera = newCamera
    return newCamera
  }

  private func closeCamera() {
    camera?.close()
    camera = nil
  }

  // MARK: - Speech

  private func say(_ text: String) {
    let audio = AVAudioSession.sharedInstance()
    try? audio.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
    try? audio.setActive(true)
    speaker.stopSpeaking(at: .immediate)
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = AVSpeechSynthesisVoice(language: today.lang)
    utterance.pitchMultiplier = 1.15
    speaker.speak(utterance)
  }
}

// MARK: - Glasses camera

/// Keeps a low-resolution stream open on the display session: the latest frame feeds
/// Watch mode, and `capturePhoto()` takes a full photo for Log meal.
final class GlassesCamera: @unchecked Sendable {
  private let camera: Camera
  private let tokens = ListenerTokenBag()
  private let lock = NSLock()
  private var latestFrame: UIImage?
  private var photoContinuation: CheckedContinuation<Data, Error>?

  private init(camera: Camera) {
    self.camera = camera
  }

  @MainActor
  static func open(on session: DeviceSession) async throws -> GlassesCamera {
    let config = StreamConfiguration(videoCodec: .raw, resolution: .medium, frameRate: 15)
    guard let camera = try session.addCamera(config: config) else { throw BiteError.noCamera }
    let glassesCamera = GlassesCamera(camera: camera)
    try await glassesCamera.start()
    return glassesCamera
  }

  private func start() async throws {
    let stream = camera.stream
    stream.videoFramePublisher.listen { [weak self] frame in
      guard let image = frame.makeUIImage() else { return }
      self?.lock.withLock { self?.latestFrame = image }
    }.store(in: tokens)
    stream.photoDataPublisher.listen { [weak self] photo in
      self?.finishPhoto(.success(photo.data))
    }.store(in: tokens)
    stream.errorPublisher.listen { [weak self] error in
      NSLog("[Bite] stream error: \(error)")
      self?.finishPhoto(.failure(BiteError.stream(error.localizedDescription)))
    }.store(in: tokens)

    let streaming = AsyncStream<StreamState> { continuation in
      stream.statePublisher.listen { state in
        NSLog("[Bite] stream state: \(state)")
        continuation.yield(state)
      }.store(in: tokens)
    }
    stream.start()
    try await withTimeout(.seconds(20)) {
      for await state in streaming where state == .streaming { return }
      throw BiteError.noCamera
    }
  }

  func latestFrameJPEG() -> Data? {
    lock.withLock { latestFrame }?.jpegData(compressionQuality: 0.7)
  }

  func capturePhoto() async throws -> Data {
    try await withTimeout(.seconds(20)) { [self] in
      try await withCheckedThrowingContinuation { continuation in
        lock.withLock { photoContinuation = continuation }
        if !camera.stream.capturePhoto(format: .jpeg) {
          finishPhoto(.failure(BiteError.noCamera))
        }
      }
    }
  }

  private func finishPhoto(_ result: Result<Data, Error>) {
    let pending: CheckedContinuation<Data, Error>? = lock.withLock {
      let current = photoContinuation
      photoContinuation = nil
      return current
    }
    pending?.resume(with: result)
  }

  func close() {
    finishPhoto(.failure(CancellationError()))
    tokens.clear()
    camera.stop()
  }
}

/// Runs `operation`, failing with `BiteError.cameraTimeout` if it takes longer than `limit`.
private func withTimeout<T: Sendable>(
  _ limit: Duration, _ operation: @escaping @Sendable () async throws -> T
) async throws -> T {
  try await withThrowingTaskGroup(of: T.self) { group in
    group.addTask { try await operation() }
    group.addTask {
      try await Task.sleep(for: limit)
      throw BiteError.cameraTimeout
    }
    defer { group.cancelAll() }
    guard let result = try await group.next() else { throw BiteError.cameraTimeout }
    return result
  }
}

// MARK: - glasses-api

struct TodayEntry: Decodable, Identifiable, Equatable {
  let id: Int
  let time: String
  let title: String
  let kcal: Int
  let kcalServed: Int
  let eatenShare: Double
  let portionLeft: Double
  let open: Bool

  enum CodingKeys: String, CodingKey {
    case id, time, title, kcal, open
    case kcalServed = "kcal_served"
    case eatenShare = "eaten_share"
    case portionLeft = "portion_left"
  }
}

struct TodayLog: Decodable, Equatable {
  let kcal: Int
  let proteinG: Int
  let carbsG: Int
  let fatG: Int
  let goalKcal: Int?
  let summary: String
  let lang: String
  let entries: [TodayEntry]

  static let empty = TodayLog(
    kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, goalKcal: nil, summary: "", lang: "en-US", entries: [])

  enum CodingKeys: String, CodingKey {
    case kcal
    case proteinG = "protein_g"
    case carbsG = "carbs_g"
    case fatG = "fat_g"
    case goalKcal = "goal_kcal"
    case summary
    case lang
    case entries
  }
}

struct FrameResponse: Decodable {
  let event: String
  let say: String?
  let scene: String?
  let today: TodayLog?
}

enum BiteAPI {
  static func postFrame(_ jpeg: Data, serverURL: String) async throws -> FrameResponse {
    var request = try makeRequest(serverURL, path: "frames")
    request.httpMethod = "POST"
    request.setValue("image/jpeg", forHTTPHeaderField: "Content-Type")
    request.httpBody = jpeg
    return try await send(request)
  }

  static func today(serverURL: String) async throws -> TodayLog {
    try await send(try makeRequest(serverURL, path: "today"))
  }

  static func entryImage(_ id: Int, serverURL: String) async throws -> UIImage? {
    let (data, response) = try await URLSession.shared.data(
      for: try makeRequest(serverURL, path: "entries/\(id)/image"))
    guard (response as? HTTPURLResponse)?.statusCode == 200 else { return nil }
    return UIImage(data: data)
  }

  static func deleteEntry(_ id: Int, serverURL: String) async throws -> TodayLog {
    var request = try makeRequest(serverURL, path: "entries/\(id)")
    request.httpMethod = "DELETE"
    return try await send(request)
  }

  private static func makeRequest(_ serverURL: String, path: String) throws -> URLRequest {
    let base = serverURL.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let url = URL(string: base)?.appendingPathComponent(path), url.scheme != nil else {
      throw BiteError.badServerURL(base)
    }
    var request = URLRequest(url: url, timeoutInterval: 60)
    if let token = Bundle.main.object(forInfoDictionaryKey: "BiteAPIToken") as? String, !token.isEmpty {
      request.setValue(token, forHTTPHeaderField: "X-Api-Token")
    }
    return request
  }

  private static func send<T: Decodable>(_ request: URLRequest) async throws -> T {
    let (data, response) = try await URLSession.shared.data(for: request)
    let status = (response as? HTTPURLResponse)?.statusCode ?? 0
    guard status == 200 else {
      throw BiteError.server(status, String(decoding: data.prefix(300), as: UTF8.self))
    }
    return try JSONDecoder().decode(T.self, from: data)
  }
}

// MARK: - Demo assets (simulator)

enum BiteDemoAssets {
  /// Writes the bundled demo meal photo to a file so the mock glasses camera can use it.
  static func demoMealURL() -> URL? {
    guard let image = UIImage(named: "demoMeal"), let data = image.jpegData(compressionQuality: 0.9) else {
      return nil
    }
    let url = FileManager.default.temporaryDirectory.appendingPathComponent("bite-demo-meal.jpg")
    try? data.write(to: url)
    return url
  }
}
