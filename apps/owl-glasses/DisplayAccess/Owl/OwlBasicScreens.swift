//
// OwlBasicScreens.swift
//
// Plain glasses screens so the flow works end to end before the designed screens land
// (JUN-36, `Owl/Display/OwlScreens.swift`). Same function signatures as the designed
// ones, so switching is a rename of `OwlBasicScreens` to `OwlScreens` in OwlViewModel.
// Display DSL only, no SwiftUI. Every interactive screen has buttons, since the touchpad
// pauses or stops the session when nothing interactive is shown.
//

import MWDATDisplay
import UIKit

typealias OwlAction = @Sendable () -> Void

enum OwlBasicScreens {
  /// First start: the personal welcome.
  static func welcome(employee: OwlEmployee?, onStart: @escaping OwlAction) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      card {
        Text(employee.map { "Hi, \($0.name)!" } ?? "Hi! I'm Owl.", style: .heading)
        Text(employee?.welcome ?? "I'll show you each step of your work.", style: .body)
      }
      buttons {
        Button(label: "Start", style: .primary, iconName: .triangleRight, onClick: onStart)
          .actionRole(.primary)
      }
    }
  }

  /// The published tasks to learn, and Record for experts.
  static func taskList(
    processes: [OwlProcess], onSelect: @escaping @Sendable (String) -> Void,
    onRecord: @escaping OwlAction, onProgress: OwlAction? = nil
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      card {
        Text("Your tasks", style: .heading)
        if processes.isEmpty {
          Text("No tasks yet. Ask your supervisor.", style: .meta, color: .secondary)
        }
      }
      FlexBox(direction: .column, spacing: 8) {
        for process in processes.prefix(3) {
          Button(
            label: process.title, style: .primary, iconName: .graduationCap,
            onClick: { onSelect(process.id) })
        }
        if let onProgress {
          Button(label: "My progress", style: .secondary, iconName: .star, onClick: onProgress)
        }
        Button(label: "Record a task", style: .secondary, iconName: .videoCamera, onClick: onRecord)
      }
    }
  }

  /// One step: instruction, the expert's reference image and what Owl sees.
  static func step(
    process: OwlProcess, step: OwlStep, image: UIImage?, status: String?,
    onDone: @escaping OwlAction, onWatch: OwlAction?, onAsk: @escaping OwlAction,
    onHelp: @escaping OwlAction
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 10) {
      card {
        Text("Step \(step.index)/\(process.steps.count) · \(step.title)", style: .meta, color: .secondary)
        if let image {
          Image(image: image, sizePreset: .fill, cornerRadius: .medium)
        }
        Text(step.instruction, style: .body)
        if let status {
          Text(status, style: .meta, color: .secondary)
        }
      }
      buttons {
        Button(label: "Done", style: .primary, iconName: .checkmark, onClick: onDone)
          .actionRole(.primary)
        if let onWatch {
          Button(label: "Watch", style: .secondary, iconName: .triangleRightCircle, onClick: onWatch)
        }
        Button(label: "Ask", style: .secondary, iconName: .speechBubble, onClick: onAsk)
        Button(label: "Help", style: .secondary, iconName: .person, onClick: onHelp)
      }
    }
  }

  /// Owl Check found a problem: per-line ✓ / ✗ and what to fix.
  static func checkResult(
    step: OwlStep, result: OwlCheckResult, onCheckAgain: @escaping OwlAction,
    onBack: @escaping OwlAction
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 10) {
      card {
        Text(result.isOK ? "Looks right" : "Check this", style: .heading)
        if let text = result.text ?? result.hint {
          Text(text, style: .body)
        }
        for line in (result.lines ?? []).prefix(4) {
          Text(
            "\(line.isOK ? "✓" : "✗") \(line.name) \(line.seen)/\(line.expected)"
              + (line.note.map { " · \($0)" } ?? ""),
            style: .meta, color: line.isOK ? .secondary : .primary)
        }
      }
      buttons {
        Button(label: "Check again", style: .primary, iconName: .twoArrowsClockwise, onClick: onCheckAgain)
          .actionRole(.primary)
        Button(label: "Back", style: .secondary, iconName: .arrowLeft, onClick: onBack)
      }
    }
  }

  /// The process is finished.
  static func done(process: OwlProcess, onHome: @escaping OwlAction) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      card {
        Text("Well done!", style: .heading)
        Text("You finished \(process.title.lowercased()).", style: .body)
      }
      buttons {
        Button(label: "Home", style: .primary, iconName: .house, onClick: onHome)
          .actionRole(.primary)
      }
    }
  }

  /// The worker's own progress: a few encouraging lines, only for the worker.
  static func progress(title: String, lines: [String], onHome: @escaping OwlAction) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      card {
        Text(title, style: .heading)
        for line in lines.prefix(4) {
          Text(line, style: .body)
        }
      }
      buttons {
        Button(label: "Home", style: .primary, iconName: .house, onClick: onHome)
          .actionRole(.primary)
      }
    }
  }

  /// Owl is listening to the glasses microphone.
  static func listening(prompt: String, heard: String?, onCancel: @escaping OwlAction) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      card {
        Text("Listening…", style: .heading)
        Text(heard ?? prompt, style: heard == nil ? .meta : .body, color: heard == nil ? .secondary : .primary)
      }
      buttons {
        Button(label: "Cancel", style: .secondary, iconName: .x, onClick: onCancel)
          .actionRole(.primary)
      }
    }
  }

  /// Ask: the answer from the company's documents, with its source.
  static func answer(
    question: String, answer: OwlAnswer, onAskAgain: @escaping OwlAction,
    onBack: @escaping OwlAction
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 10) {
      card {
        Text("“\(question)”", style: .meta, color: .secondary)
        Text(answer.text, style: .body)
        if let source = answer.sources.first {
          Text("Source: \(source.doc)\(source.section.map { " · \($0)" } ?? "")", style: .meta, color: .secondary)
        }
      }
      buttons {
        Button(label: "Back", style: .primary, iconName: .arrowLeft, onClick: onBack)
          .actionRole(.primary)
        Button(label: "Ask again", style: .secondary, iconName: .speechBubble, onClick: onAskAgain)
      }
    }
  }

  /// Help: the remote expert sees the glasses view.
  static func help(session: OwlHelpSession?, onEnd: @escaping OwlAction) -> FlexBox {
    let lastExpert = session?.messages.last { $0.from == "expert" }
    return FlexBox(direction: .column, spacing: 12) {
      card {
        Text(session?.isConnected == true ? "Expert is with you" : "Calling an expert…", style: .heading)
        Text(lastExpert?.text ?? "They see what you see. Keep the problem in view.", style: .body)
      }
      buttons {
        Button(label: "End help", style: .primary, iconName: .phoneSlash, onClick: onEnd)
          .actionRole(.primary)
      }
    }
  }

  /// Record mode for experts: one step at a time.
  static func record(
    title: String, stepCount: Int, isRecordingStep: Bool, narration: String?,
    onStartStep: @escaping OwlAction, onEndStep: @escaping OwlAction, onFinish: @escaping OwlAction
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      card {
        Text(isRecordingStep ? "● Recording step \(stepCount + 1)" : "Record: \(title)", style: .heading)
        Text(
          narration
            ?? (isRecordingStep
              ? "Do the step and say what you do." : "\(stepCount) steps recorded. Pinch to record the next one."),
          style: .body)
      }
      buttons {
        if isRecordingStep {
          Button(label: "End step", style: .primary, iconName: .checkmark, onClick: onEndStep)
            .actionRole(.primary)
        } else {
          Button(label: "Record step", style: .primary, iconName: .videoCamera, onClick: onStartStep)
            .actionRole(.primary)
          if stepCount > 0 {
            Button(label: "Finish", style: .secondary, iconName: .checkmarkCircle, onClick: onFinish)
          }
        }
      }
    }
  }

  /// Short status while Owl works.
  static func status(_ title: String, detail: String) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      card {
        Text(title, style: .heading)
        Text(detail, style: .meta, color: .secondary)
      }
    }
  }

  /// Something went wrong.
  static func problem(
    _ title: String, detail: String, onRetry: OwlAction?, onHome: @escaping OwlAction
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      card {
        Text(title, style: .heading)
        Text(detail, style: .body)
      }
      buttons {
        if let onRetry {
          Button(label: "Try again", style: .primary, iconName: .twoArrowsClockwise, onClick: onRetry)
            .actionRole(.primary)
        }
        Button(label: "Home", style: onRetry == nil ? .primary : .secondary, iconName: .house, onClick: onHome)
      }
    }
  }

  // MARK: - Helpers

  private static func card(@ComponentBuilder _ content: () -> [any ViewComponent]) -> FlexBox {
    FlexBox(direction: .column, spacing: 6, content: content)
      .padding(20)
      .background(.card)
  }

  private static func buttons(@ButtonGroupBuilder _ content: () -> [Button]) -> FlexBox {
    let group = ButtonGroup(content: content)
    return FlexBox(direction: .row, spacing: 8, alignment: .center, crossAlignment: .center) {
      group
    }
  }
}
