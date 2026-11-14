//
// OwlStrings.swift
//
// Every word Owl's own screens show or say, in English and Finnish (JUN-41). The worker's
// language comes from the employee record; other languages fall back to English until they
// are written here. Text from owl-api (steps, check results, answers) already arrives in
// the worker's language and is not in this file.
//
// Dynamic words (product and task names) are never inflected: Finnish sentences are built
// so the name can stand in its basic form.
//

import Foundation

@MainActor
enum OwlStrings {
  /// BCP 47 tag of the worker's language. Set when the employee is loaded.
  static var language = "en"

  private static func t(_ en: String, _ fi: String) -> String {
    language.lowercased().hasPrefix("fi") ? fi : en
  }

  // Buttons
  static var done: String { t("Done", "Valmis") }
  static var continueUnverified: String { t("Continue unverified", "Jatka tarkistamatta") }
  static var watchHow: String { t("Watch how", "Katso malli") }
  static var ask: String { t("Ask", "Kysy") }
  static var help: String { t("Help", "Apua") }
  static var checkAgain: String { t("Check again", "Tarkista uudelleen") }
  static var back: String { t("Back", "Takaisin") }
  static var backToStep: String { t("Back to step", "Takaisin vaiheeseen") }
  static var home: String { t("Home", "Alkuun") }
  static var start: String { t("Start", "Aloita") }
  static var tryAgain: String { t("Try again", "Yritä uudelleen") }
  static var cancel: String { t("Cancel", "Peruuta") }
  static var replay: String { t("Watch again", "Katso uudelleen") }
  static var askAgain: String { t("Ask again", "Kysy uudelleen") }
  static var endHelp: String { t("End help", "Lopeta apu") }
  static var recordStep: String { t("Record step", "Tallenna vaihe") }
  static var endStep: String { t("End step", "Lopeta vaihe") }
  static var finish: String { t("Finish", "Valmis") }
  static var recordTask: String { t("Record a task", "Tallenna tehtävä") }

  // Welcome and tasks
  static func welcome(_ name: String) -> String { t("Welcome, \(name)", "Tervetuloa, \(name)") }
  static var hello: String { t("Hi, I'm Owl", "Hei, olen Owl") }
  static var welcomeBody: String {
    t("I'll show you each step of your work.", "Näytän sinulle työn jokaisen vaiheen.")
  }
  static func firstTask(_ title: String) -> String { t("First task: \(title)", "Ensimmäinen tehtävä: \(title)") }
  static var yourTasks: String { t("Your tasks", "Tehtäväsi") }
  static var noTasks: String {
    t("No tasks yet. Ask your supervisor.", "Ei vielä tehtäviä. Kysy esihenkilöltäsi.")
  }
  static func steps(_ count: Int) -> String {
    count == 1 ? t("1 step", "1 vaihe") : t("\(count) steps", "\(count) vaihetta")
  }
  static func recordedBy(_ name: String) -> String { t("Shown by \(name)", "Näyttäjä: \(name)") }
  static var gettingTasks: String { t("Getting your tasks", "Haen tehtäviäsi") }

  // A step
  static func stepOf(_ index: Int, _ count: Int) -> String { t("Step \(index) of \(count)", "Vaihe \(index)/\(count)") }
  static func photoBy(_ name: String) -> String { t("Photo: \(name)", "Kuva: \(name)") }
  static var order: String { t("ORDER", "TILAUS") }
  static var owlChecks: String { t("OWL CHECKS", "OWL TARKISTAA") }
  static var notSeenYet: String { t("OWL DID NOT SEE", "OWL EI NÄHNYT") }
  static var liveStarting: String { t("Owl is getting ready", "Owl valmistautuu") }
  static var liveWatching: String { t("Owl is watching", "Owl katsoo") }
  static var liveChecking: String { t("Owl is checking", "Owl tarkistaa") }
  static var liveLooksRight: String {
    t("Looks right. Pinch Done and I'll check.", "Näyttää oikealta. Nipistä Valmis, niin tarkistan.")
  }
  static var liveCantSee: String { t("Owl can't see it well", "Owl ei näe kunnolla") }
  static var liveNoCheck: String { t("Pinch Done when you are ready", "Nipistä Valmis, kun olet valmis") }
  static var liveFixed: String { t("That looks right now.", "Nyt näyttää oikealta.") }
  static func liveNeedsFix(_ what: String) -> String { t("\(what). Pinch Done and I'll check.", "\(what). Nipistä Valmis, niin tarkistan.") }

  /// Why Owl cannot check, as one line on the step card.
  static func blocked(_ why: OwlCheckBlock) -> String {
    switch why {
    case .cameraOff: t("Camera is off. Owl can't check this step.", "Kamera ei ole käytössä. Owl ei voi tarkistaa tätä vaihetta.")
    case .cameraFailed: t("The camera did not start. Owl can't check this step.", "Kamera ei käynnistynyt. Owl ei voi tarkistaa tätä vaihetta.")
    case .offline: t("No connection. Owl can't check this step.", "Ei yhteyttä. Owl ei voi tarkistaa tätä vaihetta.")
    case .serverError: t("Owl can't check right now.", "Owl ei voi tarkistaa juuri nyt.")
    case .cantSee: t("Owl can't see it well.", "Owl ei näe kunnolla.")
    case .timedOut: t("The check took too long.", "Tarkistus kesti liian kauan.")
    }
  }

  // A correction
  static var checkThis: String { t("Check this", "Tarkista tämä") }
  /// What to do about a problem, as the headline: the action first, taken from the result
  /// itself, so it names the real product and not a fixed example.
  static func correctionTitle(_ result: OwlCheckResult) -> String {
    if let line = OwlRun.lineToFix(result) {
      switch line.status {
      case "wrong_item": return t("Use \(line.name)", "Ota tilalle \(line.name)")
      case "missing": return t("Add \(line.name)", "Lisää \(line.name)")
      case "too_many":
        let extra = max(1, line.seen - line.expected)
        return t("Take out \(extra) × \(line.name)", "Ota pois \(extra) × \(line.name)")
      default: break
      }
    }
    switch result.problem {
    case "wrong_item": return t("Swap the wrong item", "Vaihda väärä tuote")
    case "missing": return t("One item is missing", "Yksi tuote puuttuu")
    case "too_many": return t("Take the extra item out", "Ota ylimääräinen tuote pois")
    default: return t("Not quite like the photo", "Ei aivan kuten kuvassa")
    }
  }
  static var onTheOrder: String { t("ON THE ORDER", "TILAUKSESSA") }
  static var inTheBox: String { t("IN THE BOX", "LAATIKOSSA") }
  static func otherLinesRight(_ count: Int) -> String {
    count == 1 ? t("1 other line is right", "1 muu rivi on oikein") : t("\(count) other lines are right", "\(count) muuta riviä on oikein")
  }

  // Checking and cannot check
  static var checking: String { t("Checking", "Tarkistan") }
  static var holdStill: String { t("Hold it still for a moment.", "Pidä hetki paikallaan.") }
  static var cannotCheck: String { t("Owl can't check this step", "Owl ei voi tarkistaa tätä vaihetta") }
  static func cannotCheckBody(_ why: OwlCheckBlock) -> String {
    switch why {
    case .cameraOff:
      t("The camera is not allowed. Your supervisor can allow it on the phone.", "Kameraa ei ole sallittu. Esihenkilösi voi sallia sen puhelimesta.")
    case .cameraFailed: t("The glasses camera did not start. Try again in a moment.", "Lasien kamera ei käynnistynyt. Yritä hetken päästä uudelleen.")
    case .offline: t("There is no connection to Owl's server.", "Yhteyttä Owlin palvelimeen ei ole.")
    case .serverError: t("Owl's server has a problem.", "Owlin palvelimessa on vika.")
    case .cantSee: t("Hold the work in view and try again.", "Pidä työ näkyvissä ja yritä uudelleen.")
    case .timedOut: t("The check took too long. Try again.", "Tarkistus kesti liian kauan. Yritä uudelleen.")
    }
  }
  static var notVerifiedNote: String {
    t("The summary will say this step was not verified.", "Yhteenvedossa lukee, että tätä vaihetta ei tarkistettu.")
  }

  // The summary
  static var verified: String { t("Verified", "Tarkistettu") }
  static var notVerified: String { t("Not verified", "Ei tarkistettu") }
  static var noCheckLabel: String { t("No check", "Ei tarkistusta") }
  static var wellDone: String { t("Well done", "Hienoa") }
  static var finished: String { t("Finished", "Valmis") }
  static func finishedNotVerified(_ count: Int) -> String {
    t("Finished, \(count) not verified", "Valmis, \(count) tarkistamatta")
  }
  static func allVerifiedBody(_ count: Int) -> String {
    count == 1
      ? t("Owl verified the checked step.", "Owl tarkisti tarkistettavan vaiheen.")
      : t("Owl verified all \(count) checked steps.", "Owl tarkisti kaikki \(count) tarkistettavaa vaihetta.")
  }
  static var notVerifiedBody: String {
    t("Ask your shift lead to look at the steps Owl could not verify.", "Pyydä vuoropäällikköä katsomaan vaiheet, joita Owl ei voinut tarkistaa.")
  }
  static var noChecksBody: String { t("This task has no checks.", "Tässä tehtävässä ei ole tarkistuksia.") }
  static func sayFinished(_ summary: OwlRunSummary) -> String {
    if summary.allVerified { return t("Well done. Every checked step is verified.", "Hienoa. Kaikki tarkistettavat vaiheet on tarkistettu.") }
    if summary.unverified > 0 {
      return summary.unverified == 1
        ? t("You finished. One step was not verified.", "Olet valmis. Yhtä vaihetta ei tarkistettu.")
        : t("You finished. \(summary.unverified) steps were not verified.", "Olet valmis. \(summary.unverified) vaihetta jäi tarkistamatta.")
    }
    return t("You finished the task.", "Tehtävä on valmis.")
  }

  // Watch how
  static var videoPlaying: String { t("Playing the clip", "Toistan videota") }
  static var videoProblem: String { t("The video can't play right now", "Videota ei voi toistaa juuri nyt") }
  static var videoProblemBody: String {
    t("The step still works. Follow the photo and the instruction.", "Vaihe toimii silti. Seuraa kuvaa ja ohjetta.")
  }
  static var afterClip: String { t("That is how it is done", "Näin se tehdään") }
  static var sayVideoProblem: String { t("The video can't play right now.", "Videota ei voi toistaa juuri nyt.") }

  // Ask
  static var listening: String { t("Listening", "Kuuntelen") }
  static var askPrompt: String { t("Ask your question.", "Kysy kysymyksesi.") }
  static var askOwl: String { t("Ask Owl", "Kysy Owlilta") }
  static var thinking: String { t("Owl is thinking", "Owl miettii") }
  static func source(_ name: String) -> String { t("Source: \(name)", "Lähde: \(name)") }
  static var notInInstructions: String { t("Not in the instructions", "Ei ohjeissa") }
  static var fromInstructions: String { t("From your company's instructions", "Yrityksesi ohjeista") }
  static var sayYes: String { t("Yes?", "Niin?") }

  // Help
  static var helpLabel: String { t("Help", "Apu") }
  static var callingExpert: String { t("Calling an expert", "Kutsun asiantuntijaa") }
  static var expertWithYou: String { t("An expert is with you", "Asiantuntija on kanssasi") }
  static var helpBody: String {
    t("They see what you see. Keep the problem in view.", "Hän näkee saman kuin sinä. Pidä ongelma näkyvissä.")
  }
  static var sayCallingExpert: String {
    t("Calling an expert. They will see what you see.", "Kutsun asiantuntijan. Hän näkee saman kuin sinä.")
  }
  static var sayHelpEnded: String { t("Help has ended. Your view is no longer shared.", "Apu päättyi. Näkymääsi ei enää jaeta.") }

  // Record
  static var record: String { t("Record", "Tallennus") }
  static func recordingStep(_ index: Int) -> String { t("Recording step \(index)", "Tallennan vaihetta \(index)") }
  static func stepsRecorded(_ count: Int) -> String {
    count == 1 ? t("1 step recorded", "1 vaihe tallennettu") : t("\(count) steps recorded", "\(count) vaihetta tallennettu")
  }
  static var recordHintDoing: String { t("Do the step and say what you do.", "Tee vaihe ja kerro, mitä teet.") }
  static var recordHintNext: String { t("Pinch Record step for the next one.", "Nipistä Tallenna vaihe seuraavaa varten.") }
  static var recordHintFirst: String { t("Pinch Record step, then do the step and say what you do.", "Nipistä Tallenna vaihe, tee vaihe ja kerro, mitä teet.") }
  static var savingStep: String { t("Saving the step", "Tallennan vaihetta") }
  static var uploadingClip: String { t("Sending the clip.", "Lähetän videon.") }
  static var writingSteps: String { t("Owl is writing the steps", "Owl kirjoittaa vaiheita") }
  static var takesAMoment: String { t("This takes a moment.", "Tämä kestää hetken.") }
  static var recorded: String { t("Recorded", "Tallennettu") }
  static func reviewInStudio(_ title: String) -> String {
    t("A person reviews \(title) in Owl Studio before anyone learns from it.", "Tehtävä \(title) tarkistetaan Owl Studiossa ennen kuin kukaan oppii siitä.")
  }

  // When something is in the way (JUN-42)
  static func problemTitle(_ kind: OwlProblemKind) -> String {
    switch kind {
    case .cameraNeeded: t("Owl can't use the camera", "Owl ei saa käyttää kameraa")
    case .microphoneNeeded: t("Owl can't hear you", "Owl ei kuule sinua")
    case .offline: t("No connection", "Ei yhteyttä")
    case .server: t("Owl can't help right now", "Owl ei voi auttaa juuri nyt")
    case .notAllowed: t("Ask your supervisor", "Kysy esihenkilöltäsi")
    case .notAssigned: t("These glasses are not set up yet", "Näitä laseja ei ole vielä otettu käyttöön")
    case .video: videoProblem
    case .other: t("Something went wrong", "Jokin meni vikaan")
    }
  }
  static func problemBody(_ kind: OwlProblemKind) -> String {
    switch kind {
    case .cameraNeeded:
      t("Your supervisor allows the camera once, on the phone. You can still follow the steps.", "Esihenkilösi sallii kameran kerran puhelimesta. Voit silti seurata vaiheita.")
    case .microphoneNeeded:
      t("Your supervisor allows the microphone once, on the phone.", "Esihenkilösi sallii mikrofonin kerran puhelimesta.")
    case .offline:
      t("Saved tasks still work. Owl can't check or answer until the connection is back.", "Tallennetut tehtävät toimivat. Owl ei voi tarkistaa eikä vastata ennen kuin yhteys palaa.")
    case .server: t("Owl's server has a problem. Try again in a moment.", "Owlin palvelimessa on vika. Yritä hetken päästä uudelleen.")
    case .notAllowed: t("Owl's server did not accept these glasses.", "Owlin palvelin ei hyväksynyt näitä laseja.")
    case .notAssigned:
      t("Ask your supervisor to give them to you in Owl Studio.", "Pyydä esihenkilöäsi antamaan ne sinulle Owl Studiossa.")
    case .video: videoProblemBody
    case .other: t("Try again, or ask your supervisor.", "Yritä uudelleen tai kysy esihenkilöltäsi.")
    }
  }
  static var sayWelcomeBack: String { t("Welcome back.", "Tervetuloa takaisin.") }
  static var sayCantHelp: String { t("Owl can't help right now.", "Owl ei voi auttaa juuri nyt.") }
}

/// What is in the way, so each case gets its own screen (JUN-42).
enum OwlProblemKind: String, Sendable, CaseIterable {
  case cameraNeeded
  case microphoneNeeded
  case offline
  case server
  case notAllowed
  case notAssigned
  case video
  case other
}
