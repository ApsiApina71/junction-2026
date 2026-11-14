//
// OwlText.swift
//
// The glasses app's own sentences in the worker's language (JUN-75). owl-api already sends
// its texts (`say`, `text`, steps, answers) in the employee's language; this table covers
// what the app says and writes by itself: spoken lines, the step card's status line and the
// error messages. The English sentence is the key, so the flow keeps plain English in code
// and `OwlSpeaker` and the step status translate in one place.
//
// Add a language by adding a table and a case in `table(for:)`.
//

import Foundation

enum OwlText {
  /// `text` in `language` (BCP 47, e.g. "fi" or "fi-FI"), or `text` itself when there is no
  /// translation, such as for server texts that already come in the worker's language.
  static func localize(_ text: String, to language: String?) -> String {
    guard let table = table(for: language) else { return text }
    return table[text] ?? text
  }

  /// The language part of a BCP 47 tag: "fi-FI" → "fi".
  static func languageCode(_ language: String?) -> String {
    (language ?? "en").split(whereSeparator: { $0 == "-" || $0 == "_" }).first.map { $0.lowercased() } ?? "en"
  }

  /// The worker's own progress as a few encouraging sentences (JUN-76). Never a score:
  /// it counts what the worker finished and fixed, not mistakes. After a task it talks about
  /// that run; from "My progress" about everything so far.
  static func progressLines(_ progress: OwlProgress?, afterTask: Bool, language: String?) -> [String] {
    let fi = languageCode(language) == "fi"
    guard let progress else {
      return [fi ? "Owl ei saanut edistymistäsi juuri nyt." : "Owl couldn't load your progress right now."]
    }
    var lines: [String] = []
    let run = afterTask ? progress.runs.first : nil
    if afterTask {
      if progress.tasksDone <= 1 {
        lines.append(fi ? "Teit ensimmäisen tehtäväsi." : "You finished your first task.")
      }
    } else {
      let n = progress.tasksDone
      lines.append(
        fi
          ? (n == 1 ? "Olet tehnyt yhden tehtävän." : "Olet tehnyt \(n) tehtävää.")
          : (n == 1 ? "You have finished 1 task." : "You have finished \(n) tasks."))
    }
    let fixed = run?.problemsFixed ?? progress.problemsFixed
    let caught = run?.problemsCaught ?? progress.problemsCaught
    if fixed > 0 {
      lines.append(
        fi
          ? (fixed == 1 ? "Korjasit yhden ongelman, jonka Owl huomasi." : "Korjasit \(fixed) ongelmaa, jotka Owl huomasi.")
          : (fixed == 1 ? "You fixed 1 problem Owl caught." : "You fixed \(fixed) problems Owl caught."))
    } else if caught == 0 {
      lines.append(fi ? "Ei ongelmia matkalla. Hyvää työtä." : "No problems on the way. Good work.")
    }
    switch progress.fasterThanFirst {
    case true?: lines.append(fi ? "Nopeammin kuin ensimmäisellä kerralla." : "Faster than your first time.")
    case false?: lines.append(fi ? "Ota rauhassa, vauhti tulee harjoittelemalla." : "Take your time. Speed comes with practice.")
    case nil: break
    }
    return lines
  }

  private static func table(for language: String?) -> [String: String]? {
    switch languageCode(language) {
    case "fi": finnish
    default: nil
    }
  }

  private static let finnish: [String: String] = [
    // Spoken
    "Yes?": "Niin?",
    "Task done!": "Tehtävä tehty!",
    "Your progress": "Edistymisesi",
    "Well done! You finished the task.": "Hienoa! Teit tehtävän loppuun.",
    "The video isn't available right now.": "Video ei ole nyt saatavilla.",
    "The video couldn't play.": "Videota ei voitu toistaa.",
    "Calling an expert. They will see what you see.": "Kutsun asiantuntijan. Hän näkee saman kuin sinä.",
    "Recording. Pinch Record step, then do the step and say what you do.":
      "Nauhoitus alkaa. Nipistä Record step, tee vaihe ja kerro samalla, mitä teet.",
    "Step saved.": "Vaihe tallennettu.",
    "Done. Review the new task in Owl Studio.": "Valmis. Tarkista uusi tehtävä Owl Studiossa.",
    "Owl can't help right now.": "Owl ei pysty auttamaan juuri nyt.",

    // Step card status line
    "Owl is watching.": "Owl seuraa.",
    "Owl is checking…": "Owl tarkistaa…",
    "✓ Looks right. Pinch Done.": "✓ Näyttää oikealta. Nipistä Done.",
    "Pinch Done when ready.": "Nipistä Done, kun olet valmis.",
    "Camera is off. Pinch Done when ready.": "Kamera ei ole käytössä. Nipistä Done, kun olet valmis.",
    "Owl can't see now. Pinch Done when ready.": "Owl ei näe nyt. Nipistä Done, kun olet valmis.",
    "Owl can't see right now. Pinch Done when ready.": "Owl ei näe juuri nyt. Nipistä Done, kun olet valmis.",
    "Owl couldn't see it.": "Owl ei nähnyt sitä.",
    "Owl couldn't see it. Try again.": "Owl ei nähnyt sitä. Yritä uudelleen.",
    "Video needs the https server.": "Video tarvitsee https-palvelimen.",

    // Errors (OwlError)
    "Glasses are not connected.": "Lasit eivät ole yhteydessä.",
    "These glasses are not assigned to anyone yet. Ask your supervisor.":
      "Näitä laseja ei ole vielä annettu kenellekään. Kysy esihenkilöltäsi.",
    "Couldn't open the glasses camera.": "Lasien kameraa ei saatu auki.",
    "Camera is not allowed for Owl. Ask your supervisor.": "Owl ei saa käyttää kameraa. Kysy esihenkilöltäsi.",
    "Microphone is not allowed for Owl. Ask your supervisor.":
      "Owl ei saa käyttää mikrofonia. Kysy esihenkilöltäsi.",
    "The camera took too long.": "Kamera ei vastannut ajoissa.",
    "No connection to Owl's server.": "Ei yhteyttä Owlin palvelimeen.",
    "Owl's server said no. Ask your supervisor.": "Owlin palvelin kieltäytyi. Kysy esihenkilöltäsi.",
    "Owl couldn't find that task.": "Owl ei löytänyt tehtävää.",
    "Owl is busy. Trying again.": "Owl on kiireinen. Yritän uudelleen.",
    "Owl got an answer it didn't understand.": "Owl sai vastauksen, jota se ei ymmärtänyt.",
  ]
}
