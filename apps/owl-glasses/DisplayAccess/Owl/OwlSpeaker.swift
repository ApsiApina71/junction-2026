//
// OwlSpeaker.swift
//
// Owl's voice. Text-to-speech on the phone, played through the glasses speakers: with the
// `.playback` category iOS routes output to the glasses over Bluetooth A2DP (Meta DAT docs,
// "Microphones and speakers"). The `audio` background mode keeps it working with the phone
// locked in a pocket.
//

import AVFoundation
import Foundation

@MainActor
final class OwlSpeaker {
  private let synthesizer = AVSpeechSynthesizer()

  /// The worker's language (BCP 47, e.g. "fi" or "en-US"), from `Employee.language`. The voice
  /// and the app's own sentences (`OwlText`) follow it.
  var language = "en"
  /// Easy-language versions of the app's own sentences (JUN-81).
  var easy = false
  /// Slower speech for audio-first workers (JUN-81).
  var slow = false
  /// Every spoken line, already translated: display-first workers see it as a caption.
  var onSpoken: ((String) -> Void)?

  /// True when audio goes to a Bluetooth device (the glasses), not the phone speaker.
  var isOnGlasses: Bool {
    AVAudioSession.sharedInstance().currentRoute.outputs.contains {
      $0.portType == .bluetoothA2DP || $0.portType == .bluetoothHFP || $0.portType == .bluetoothLE
    }
  }

  /// Speaks `text`. By default it interrupts anything Owl was still saying; with
  /// `interrupt: false` it is queued after it.
  /// `language`: a text already written in another language than the worker's, such as a
  /// welcome in `welcome_language` (JUN-108). It is spoken with that language's voice, as is.
  func say(_ text: String, interrupt: Bool = true, language other: String? = nil) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    let audio = AVAudioSession.sharedInstance()
    do {
      try audio.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
      try audio.setActive(true)
    } catch {
      NSLog("[Owl] audio session: \(error)")
    }
    if interrupt { synthesizer.stopSpeaking(at: .immediate) }
    let utterance = AVSpeechUtterance(string: other == nil ? OwlText.localize(trimmed, to: language, easy: easy) : trimmed)
    utterance.voice = Self.voice(for: other ?? language)
    if slow { utterance.rate = AVSpeechUtteranceDefaultSpeechRate * 0.8 }
    onSpoken?(utterance.speechString)
    NSLog("[Owl] say (\(utterance.voice?.language ?? "?")): \(utterance.speechString)")
    synthesizer.speak(utterance)
  }

  /// A voice for `language`: the exact tag, then any voice of that language, then English.
  static func voice(for language: String) -> AVSpeechSynthesisVoice? {
    if language.contains("-"), let exact = AVSpeechSynthesisVoice(language: language) { return exact }
    let code = OwlText.languageCode(language)
    let voices = AVSpeechSynthesisVoice.speechVoices()
    let matching = voices.filter { OwlText.languageCode($0.language) == code }
    return matching.first { $0.quality == .enhanced } ?? matching.first
      ?? AVSpeechSynthesisVoice(language: "en-US")
  }

  func stop() {
    synthesizer.stopSpeaking(at: .immediate)
  }

  // MARK: - The hoot

  private let engine = AVAudioEngine()
  private let player = AVAudioPlayerNode()
  private lazy var hootBuffer: AVAudioPCMBuffer? = Self.makeHoot()

  /// The small "hoo-hoo" when a step is verified (JUN-108). Made here, not a sound file:
  /// two soft falling tones, played through the glasses like Owl's voice.
  func hoot() {
    guard let buffer = hootBuffer else { return }
    let audio = AVAudioSession.sharedInstance()
    do {
      try audio.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
      try audio.setActive(true)
      if !engine.attachedNodes.contains(player) {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: buffer.format)
      }
      if !engine.isRunning { try engine.start() }
      player.scheduleBuffer(buffer, at: nil, options: .interrupts)
      player.play()
    } catch {
      NSLog("[Owl] hoot: \(error)")
    }
  }

  private static func makeHoot() -> AVAudioPCMBuffer? {
    let rate = 44_100.0
    guard let format = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 1) else { return nil }
    // hoo (0.20 s) · pause (0.07 s) · hoo (0.26 s), each falling a little in pitch.
    let notes: [(start: Double, length: Double, from: Double, to: Double)] = [
      (0.0, 0.20, 470, 410), (0.27, 0.26, 440, 360),
    ]
    let total = 0.56
    let count = AVAudioFrameCount(total * rate)
    guard let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: count),
      let samples = buffer.floatChannelData?[0]
    else { return nil }
    buffer.frameLength = count
    for i in 0..<Int(count) { samples[i] = 0 }
    for note in notes {
      var phase = 0.0
      let first = Int(note.start * rate)
      let frames = Int(note.length * rate)
      for n in 0..<frames {
        let t = Double(n) / Double(frames)
        let frequency = note.from + (note.to - note.from) * t
        phase += 2 * .pi * frequency / rate
        // Soft in, soft out: a breathy hoot, not a beep.
        let envelope = sin(.pi * t) * sin(.pi * t)
        let tone = sin(phase) + 0.25 * sin(2 * phase) + 0.08 * sin(3 * phase)
        samples[first + n] = Float(0.32 * envelope * tone)
      }
    }
    return buffer
  }
}
