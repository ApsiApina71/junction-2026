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

  /// True when audio goes to a Bluetooth device (the glasses), not the phone speaker.
  var isOnGlasses: Bool {
    AVAudioSession.sharedInstance().currentRoute.outputs.contains {
      $0.portType == .bluetoothA2DP || $0.portType == .bluetoothHFP || $0.portType == .bluetoothLE
    }
  }

  /// Speaks `text`. By default it interrupts anything Owl was still saying; with
  /// `interrupt: false` it is queued after it.
  func say(_ text: String, interrupt: Bool = true) {
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
    let utterance = AVSpeechUtterance(string: OwlText.localize(trimmed, to: language))
    utterance.voice = Self.voice(for: language)
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
}
