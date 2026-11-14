//
// BiteDisplay.swift
//
// Bite (Junction 2026): the screens sent to the glasses display. Kept free of SwiftUI so
// the Display DSL names (Text, Button, Image) are unambiguous.
//

import MWDATDisplay
import UIKit

enum BiteDisplay {
  /// Start screen: Bo, today's ring and the actions.
  static func home(
    today: TodayLog, goalKcal: Int, isWatching: Bool,
    onLogMeal: @escaping @Sendable () -> Void,
    onWatch: @escaping @Sendable () -> Void,
    onToday: @escaping @Sendable () -> Void
  ) -> FlexBox {
    let meals = today.entries.count
    return FlexBox(direction: .column, spacing: 12) {
      FlexBox(direction: .column, spacing: 4) {
        Image(
          image: BearArt.dayCard(
            mood: .happy, eatenKcal: today.kcal, goalKcal: goalKcal,
            caption: meals == 1 ? "1 meal" : "\(meals) meals"),
          sizePreset: .fill, cornerRadius: .medium)
        Text("Hi, I'm Bo!", style: .heading)
        Text("Log a meal, or let me watch and log it myself.", style: .meta, color: .secondary)
      }
      .padding(20)
      .background(.card)

      FlexBox(direction: .row, spacing: 8, alignment: .center, crossAlignment: .center) {
        ButtonGroup {
          Button(label: "Log meal", style: .primary, iconName: .forkKnife, onClick: onLogMeal)
            .actionRole(.primary)
          Button(
            label: isWatching ? "Stop" : "Watch", style: .secondary,
            iconName: isWatching ? .videoCameraOff : .eye, onClick: onWatch)
          Button(label: "Today", style: .secondary, iconName: .calendar, onClick: onToday)
        }
      }
    }
  }

  /// Short status while a photo is taken or analysed.
  static func status(_ title: String, detail: String, mood: BearMood) -> FlexBox {
    FlexBox(direction: .row, spacing: 16, crossAlignment: .center) {
      FlexBox(direction: .column) {
        Image(image: BearArt.bear(mood: mood), sizePreset: .fill, cornerRadius: .medium)
      }
      .flexGrow(2)
      FlexBox(direction: .column, spacing: 4) {
        Text(title, style: .heading)
        Text(detail, style: .meta, color: .secondary)
      }
      .flexGrow(3)
    }
    .padding(24)
    .background(.card)
  }

  /// Watch mode: what Bo sees right now and how the open meal is going.
  static func watching(
    today: TodayLog, goalKcal: Int, scene: String?, detail: String,
    onStop: @escaping @Sendable () -> Void
  ) -> FlexBox {
    let (sceneText, sceneColor) = sceneLabel(scene)
    let open = today.entries.first(where: \.open)
    return FlexBox(direction: .column, spacing: 12) {
      FlexBox(direction: .column, spacing: 4) {
        Image(
          image: BearArt.watchCard(
            sceneText: sceneText, sceneColor: sceneColor, openTitle: open?.title,
            portionLeft: open?.portionLeft, eatenKcal: today.kcal, goalKcal: goalKcal),
          sizePreset: .fill, cornerRadius: .medium)
        Text("Bo is watching", style: .heading)
        Text(detail, style: .meta, color: .secondary)
      }
      .padding(20)
      .background(.card)

      FlexBox(direction: .row, spacing: 8, alignment: .center, crossAlignment: .center) {
        ButtonGroup {
          Button(label: "Stop watching", style: .primary, iconName: .videoCameraOff, onClick: onStop)
            .actionRole(.primary)
        }
      }
    }
  }

  /// A logged meal: the photo from the glasses, calories eaten and what Bo said.
  static func result(
    entry: TodayEntry, photo: UIImage?, today: TodayLog, goalKcal: Int, say: String,
    isWatching: Bool,
    onLogAnother: @escaping @Sendable () -> Void,
    onToday: @escaping @Sendable () -> Void
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      FlexBox(direction: .column, spacing: 4) {
        Image(
          image: BearArt.mealCard(
            photo: photo, kcal: entry.kcal, kcalServed: entry.kcalServed,
            portionLeft: entry.portionLeft, isOpen: entry.open),
          sizePreset: .fill, cornerRadius: .medium)
        Text(entry.title, style: .heading)
        Text("Today \(today.kcal) / \(goalKcal) kcal", style: .meta, color: .secondary)
        Text(say, style: .body)
      }
      .padding(20)
      .background(.card)

      FlexBox(direction: .row, spacing: 8, alignment: .center, crossAlignment: .center) {
        ButtonGroup {
          Button(
            label: isWatching ? "Keep watching" : "Log another", style: .primary,
            iconName: isWatching ? .eye : .plus, onClick: onLogAnother)
            .actionRole(.primary)
          Button(label: "Today", style: .secondary, iconName: .calendar, onClick: onToday)
        }
      }
    }
  }

  /// Today: ring, macros and every meal with how much of it was eaten.
  static func today(
    today: TodayLog, goalKcal: Int,
    onBack: @escaping @Sendable () -> Void
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      FlexBox(direction: .column, spacing: 6) {
        Image(
          image: BearArt.todayCard(
            eatenKcal: today.kcal, goalKcal: goalKcal,
            proteinG: today.proteinG, carbsG: today.carbsG, fatG: today.fatG),
          sizePreset: .fill, cornerRadius: .medium)
        if today.entries.isEmpty {
          Text("No meals yet. Bo is hungry!", style: .body, color: .secondary)
        }
        for entry in today.entries.prefix(3) {
          Text("\(entry.time)  \(entry.title) · \(entry.kcal) kcal", style: .body)
          Text(entryDetail(entry), style: .meta, color: .secondary)
        }
      }
      .padding(20)
      .background(.card)

      FlexBox(direction: .row, spacing: 8, alignment: .center, crossAlignment: .center) {
        ButtonGroup {
          Button(label: "Back", style: .primary, iconName: .arrowLeft, onClick: onBack)
            .actionRole(.primary)
        }
      }
    }
  }

  /// Something went wrong; offer a retry.
  static func problem(
    _ title: String, detail: String,
    onRetry: @escaping @Sendable () -> Void,
    onHome: @escaping @Sendable () -> Void
  ) -> FlexBox {
    FlexBox(direction: .column, spacing: 12) {
      FlexBox(direction: .row, spacing: 16, crossAlignment: .center) {
        FlexBox(direction: .column) {
          Image(image: BearArt.bear(mood: .oops), sizePreset: .fill, cornerRadius: .medium)
        }
        .flexGrow(2)
        FlexBox(direction: .column, spacing: 4) {
          Text(title, style: .heading)
          Text(detail, style: .meta, color: .secondary)
        }
        .flexGrow(3)
      }
      .padding(24)
      .background(.card)

      FlexBox(direction: .row, spacing: 8, alignment: .center, crossAlignment: .center) {
        ButtonGroup {
          Button(label: "Try again", style: .primary, iconName: .twoArrowsClockwise, onClick: onRetry)
            .actionRole(.primary)
          Button(label: "Home", style: .secondary, iconName: .house, onClick: onHome)
        }
      }
    }
  }

  // MARK: - Helpers

  /// glasses-api only logs the wearer's own food; this shows which case Bo is in.
  private static func sceneLabel(_ scene: String?) -> (String, UIColor) {
    switch scene {
    case "my_food": ("Your plate ✓", UIColor(red: 0.42, green: 0.86, blue: 0.47, alpha: 1))
    case "other_food": ("Not your plate – not logged", UIColor(red: 1.0, green: 0.75, blue: 0.30, alpha: 1))
    case "no_food": ("No food in view", UIColor(white: 0.75, alpha: 1))
    default: ("Looking…", UIColor(white: 0.75, alpha: 1))
    }
  }

  private static func entryDetail(_ entry: TodayEntry) -> String {
    if entry.open {
      return "Eating now · \(Int((entry.portionLeft * 100).rounded()))% left"
    }
    if entry.eatenShare < 1 {
      return "Ate \(Int((entry.eatenShare * 100).rounded()))% of \(entry.kcalServed) kcal – leftovers subtracted"
    }
    return "Finished"
  }
}
