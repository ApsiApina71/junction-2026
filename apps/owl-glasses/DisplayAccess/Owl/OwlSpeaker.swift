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

  /// BCP-47 language for the voice, e.g. "en-US". Owl sets it from the glasses speech locale.
  var language = "en-US"

  /// True when audio goes to a Bluetooth device (the glasses), not the phone speaker.
  var isOnGlasses: Bool {
    AVAudioSession.sharedInstance().currentRoute.outputs.contains {
      $0.portType == .bluetoothA2DP || $0.portType == .bluetoothHFP || $0.portType == .bluetoothLE
    }
  }

  /// Speaks `text`, interrupting anything Owl was still saying.
  func say(_ text: String) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return }
    let audio = AVAudioSession.sharedInstance()
    do {
      try audio.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
      try audio.setActive(true)
    } catch {
      NSLog("[Owl] audio session: \(error)")
    }
    synthesizer.stopSpeaking(at: .immediate)
    let utterance = AVSpeechUtterance(string: trimmed)
    utterance.voice = AVSpeechSynthesisVoice(language: language)
    synthesizer.speak(utterance)
  }

  func stop() {
    synthesizer.stopSpeaking(at: .immediate)
  }
}
