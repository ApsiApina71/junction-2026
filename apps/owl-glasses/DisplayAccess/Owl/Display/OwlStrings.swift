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
  /// The easy-language profile (JUN-81): short sentences, everyday words, one thing at a time.
  /// The same words as `OwlText`'s easy tables use ("helper", "Owl looks", "Good").
  static var easy = false

  /// The sentence in the worker's language. `easy` and `easyFi` are the easy-language
  /// versions, given only where the ordinary sentence is not already short and plain.
  private static func t(_ en: String, _ fi: String, easy easyEn: String? = nil, _ easyFi: String? = nil) -> String {
    let finnish = language.lowercased().hasPrefix("fi")
    if easy, let simple = finnish ? easyFi : easyEn { return simple }
    return finnish ? fi : en
  }

  // Buttons
  static var done: String { t("Done", "Valmis") }
  static var continueUnverified: String { t(
    "Continue unverified", "Jatka tarkistamatta",
    easy: "Go on without a check", "Jatka ilman tarkistusta") }
  static var watchHow: String { t("Watch how", "Katso malli", easy: "Watch the video", "Katso video") }
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
  /// The welcome's heading in the welcome's own language (JUN-108).
  static func welcome(_ name: String, in welcomeLanguage: String?) -> String {
    guard let welcomeLanguage else { return welcome(name) }
    return welcomeLanguage.lowercased().hasPrefix("fi") ? "Tervetuloa, \(name)" : "Welcome, \(name)"
  }
  static var hello: String { t("Hi, I'm Owl", "Hei, olen Owl") }
  static var welcomeBody: String {
    t(
      "I'll show you each step of your work.", "Näytän sinulle työn jokaisen vaiheen.",
      easy: "I show you each step.", "Näytän sinulle jokaisen vaiheen.")
  }
  static func firstTask(_ title: String) -> String { t("First task: \(title)", "Ensimmäinen tehtävä: \(title)") }
  static var yourTasks: String { t("Your tasks", "Tehtäväsi") }
  static var noTasks: String {
    t(
      "No tasks yet. Ask your supervisor.", "Ei vielä tehtäviä. Kysy esihenkilöltäsi.",
      easy: "You have no tasks yet. Ask your boss.", "Sinulla ei ole vielä tehtäviä. Kysy esihenkilöltäsi.")
  }
  /// The list is from the phone's memory: say so, and say what will not work.
  static var savedTasksOnly: String {
    t(
      "No connection. These are saved tasks, and Owl can't check steps now.",
      "Ei yhteyttä. Nämä ovat tallennettuja tehtäviä, eikä Owl voi nyt tarkistaa vaiheita.",
      easy: "Owl has no connection. You can do these tasks. Owl cannot check them now.",
      "Owlilla ei ole yhteyttä. Voit tehdä nämä tehtävät. Owl ei voi nyt tarkistaa niitä.")
  }
  /// No connection and nothing saved: the reason is the connection, not the supervisor.
  static var nothingSaved: String {
    t(
      "Owl can't reach its server, and no tasks are saved on this phone yet.",
      "Owl ei saa yhteyttä palvelimeensa, eikä puhelimeen ole vielä tallennettu tehtäviä.",
      easy: "Owl has no connection. There are no tasks on this phone yet.",
      "Owlilla ei ole yhteyttä. Puhelimessa ei ole vielä tehtäviä.")
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
  static var owlChecks: String { t("OWL CHECKS", "OWL TARKISTAA", easy: "LOOK FOR", "KATSO") }
  static var notSeenYet: String { t("OWL DID NOT SEE", "OWL EI NÄHNYT") }
  static var liveStarting: String { t("Owl is getting ready", "Owl valmistautuu") }
  static var liveWatching: String { t("Owl is watching", "Owl katsoo", easy: "Owl looks", "Owl katsoo") }
  static var liveChecking: String { t("Owl is checking", "Owl tarkistaa") }
  static var liveLooksRight: String {
    t(
      "Looks right. Pinch Done and I'll check.", "Näyttää oikealta. Nipistä Valmis, niin tarkistan.",
      easy: "Good. Pinch Done. Then Owl checks.", "Hyvä. Nipistä Valmis. Sitten Owl tarkistaa.")
  }
  static var liveCantSee: String { t(
    "Owl can't see it well", "Owl ei näe kunnolla",
    easy: "Owl cannot see your work", "Owl ei näe työtäsi") }
  static var liveNoCheck: String { t("Pinch Done when you are ready", "Nipistä Valmis, kun olet valmis") }
  static var liveFixed: String { t(
    "That looks right now.", "Nyt näyttää oikealta.",
    easy: "Good. It is right now.", "Hyvä. Nyt se on oikein.") }
  static func liveNeedsFix(_ what: String) -> String { t(
    "\(what). Pinch Done and I'll check.", "\(what). Nipistä Valmis, niin tarkistan.",
    easy: "\(what). Pinch Done. Then Owl checks.", "\(what). Nipistä Valmis. Sitten Owl tarkistaa.") }

  /// Why Owl cannot check, as one line on the step card.
  static func blocked(_ why: OwlCheckBlock) -> String {
    switch why {
    case .cameraOff: t(
      "Camera is off. Owl can't check this step.", "Kamera ei ole käytössä. Owl ei voi tarkistaa tätä vaihetta.",
      easy: "The camera is off. Owl cannot check.", "Kamera on pois. Owl ei voi tarkistaa.")
    case .cameraFailed: t(
      "The camera did not start. Owl can't check this step.",
      "Kamera ei käynnistynyt. Owl ei voi tarkistaa tätä vaihetta.",
      easy: "The camera did not start. Owl cannot check.", "Kamera ei käynnistynyt. Owl ei voi tarkistaa.")
    case .offline: t(
      "No connection. Owl can't check this step.", "Ei yhteyttä. Owl ei voi tarkistaa tätä vaihetta.",
      easy: "Owl has no connection. Owl cannot check.", "Owlilla ei ole yhteyttä. Owl ei voi tarkistaa.")
    case .serverError: t(
      "Owl can't check right now.", "Owl ei voi tarkistaa juuri nyt.",
      easy: "Owl cannot check now.", "Owl ei voi tarkistaa nyt.")
    case .cantSee: t(
      "Owl can't see it well.", "Owl ei näe kunnolla.",
      easy: "Owl cannot see your work.", "Owl ei näe työtäsi.")
    case .timedOut: t("The check took too long.", "Tarkistus kesti liian kauan.")
    case .checksOff: t(
      "Camera checks are off. Pinch Done when ready.",
      "Kameratarkistukset ovat pois päältä. Nipistä Valmis, kun olet valmis.",
      easy: "No camera. Pinch Done when you are ready.", "Kamera ei ole päällä. Nipistä Valmis, kun olet valmis.")
    case .cameraPaused: t(
      "Camera paused. Pinch Done when ready.", "Kamera on tauolla. Nipistä Valmis, kun olet valmis.",
      easy: "The camera is off. Pinch Done when you are ready.", "Kamera on pois. Nipistä Valmis, kun olet valmis.")
    }
  }

  /// Shown beside the step count when the check answers are not real looks at the camera,
  /// so a picture or a film of the display says so by itself.
  static func unreal(_ source: OwlUnrealSource) -> String {
    switch source {
    case .scriptedDemo: t("scripted demo", "käsikirjoitettu demo")
    case .sampleAnswer: t("sample answer", "esimerkkivastaus")
    }
  }

  // A correction
  static var checkThis: String { t("Check this", "Tarkista tämä") }
  /// What to do about a problem, as the headline: the action first, taken from the result
  /// itself, so it names the real product and not a fixed example.
  static func correctionTitle(_ result: OwlCheckResult) -> String {
    if let line = OwlCheckRules.lineToFix(result) {
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
    case "wrong_item": return t(
      "Swap the wrong item", "Vaihda väärä tuote",
      easy: "Change the wrong item", "Vaihda väärä tuote")
    case "missing": return t("One item is missing", "Yksi tuote puuttuu")
    case "too_many": return t("Take the extra item out", "Ota ylimääräinen tuote pois")
    default:
      // A visual check with the step's own line (JUN-106: "That's a deposit bottle. It goes to
      // the return crate."): the server's words, as they are, when they fit the title.
      if let text = result.text?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty, text.count <= 90,
        (result.lines ?? []).isEmpty
      {
        return text
      }
      return t(
      "Not quite like the photo", "Ei aivan kuten kuvassa",
      easy: "This is not like the photo", "Tämä ei ole kuin kuvassa")
    }
  }
  static var onTheOrder: String { t("ON THE ORDER", "TILAUKSESSA") }
  static var inTheBox: String { t("IN THE BOX", "LAATIKOSSA") }
  static func otherLinesRight(_ count: Int) -> String {
    count == 1 ? t(
      "1 other line is right", "1 muu rivi on oikein",
      easy: "1 other is right", "1 muu on oikein") : t(
      "\(count) other lines are right", "\(count) muuta riviä on oikein",
      easy: "\(count) others are right", "\(count) muuta on oikein")
  }

  // Checking and cannot check
  static var checking: String { t("Checking", "Tarkistan", easy: "Owl checks", "Owl tarkistaa") }
  static var holdStill: String { t(
    "Hold it still for a moment.", "Pidä hetki paikallaan.",
    easy: "Hold still.", "Pidä paikallaan.") }
  static var cannotCheck: String { t(
    "Owl can't check this step", "Owl ei voi tarkistaa tätä vaihetta",
    easy: "Owl cannot check this step", "Owl ei voi tarkistaa tätä vaihetta") }
  static func cannotCheckBody(_ why: OwlCheckBlock) -> String {
    switch why {
    case .cameraOff:
      t(
        "The camera is not allowed. Your supervisor can allow it on the phone.",
        "Kameraa ei ole sallittu. Esihenkilösi voi sallia sen puhelimesta.",
        easy: "Owl may not use the camera. Your boss can allow it.",
        "Owl ei saa käyttää kameraa. Esihenkilösi voi sallia sen.")
    case .cameraFailed: t(
      "The glasses camera did not start. Try again in a moment.",
      "Lasien kamera ei käynnistynyt. Yritä hetken päästä uudelleen.",
      easy: "The camera did not start. Try again soon.", "Kamera ei käynnistynyt. Yritä pian uudelleen.")
    case .offline: t(
      "There is no connection to Owl's server.", "Yhteyttä Owlin palvelimeen ei ole.",
      easy: "Owl has no connection.", "Owlilla ei ole yhteyttä.")
    case .serverError: t(
      "Owl's server has a problem.", "Owlin palvelimessa on vika.",
      easy: "Owl has a problem.", "Owlissa on vika.")
    case .cantSee: t(
      "Hold the work in view and try again.", "Pidä työ näkyvissä ja yritä uudelleen.",
      easy: "Owl cannot see your work. Hold it in front of you.", "Owl ei näe työtäsi. Pidä se edessäsi.")
    case .timedOut: t("The check took too long. Try again.", "Tarkistus kesti liian kauan. Yritä uudelleen.")
    case .checksOff: t(
      "Camera checks are off.", "Kameratarkistukset ovat pois päältä.",
      easy: "The camera is off.", "Kamera on pois.")
    case .cameraPaused: t("The camera is paused.", "Kamera on tauolla.", easy: "The camera is off.", "Kamera on pois.")
    }
  }
  static var notVerifiedNote: String {
    t(
      "The summary will say this step was not verified.", "Yhteenvedossa lukee, että tätä vaihetta ei tarkistettu.",
      easy: "At the end Owl says: this step was not checked.", "Lopuksi Owl kertoo: tätä vaihetta ei tarkistettu.")
  }

  // The summary
  static var verified: String { t("Verified", "Tarkistettu", easy: "Checked", "Tarkistettu") }
  static var notVerified: String { t("Not verified", "Ei tarkistettu", easy: "Not checked", "Ei tarkistettu") }
  static var noCheckLabel: String { t("No check", "Ei tarkistusta") }
  static var wellDone: String { t("Well done", "Hienoa", easy: "Good job", "Hyvä") }
  static var finished: String { t("Finished", "Valmis") }
  static func finishedNotVerified(_ count: Int) -> String {
    t(
      "Finished, \(count) not verified", "Valmis, \(count) tarkistamatta",
      easy: "Finished. \(count) not checked.", "Valmis. \(count) tarkistamatta.")
  }
  static func allVerifiedBody(_ count: Int) -> String {
    count == 1
      ? t(
        "Owl verified the checked step.", "Owl tarkisti tarkistettavan vaiheen.",
        easy: "Owl checked the step. It is right.", "Owl tarkisti vaiheen. Se on oikein.")
      : t(
        "Owl verified all \(count) checked steps.", "Owl tarkisti kaikki \(count) tarkistettavaa vaihetta.",
        easy: "Owl checked \(count) steps. All are right.", "Owl tarkisti \(count) vaihetta. Kaikki ovat oikein.")
  }
  static var notVerifiedBody: String {
    t(
      "Ask your shift lead to look at the steps Owl could not verify.",
      "Pyydä vuoropäällikköä katsomaan vaiheet, joita Owl ei voinut tarkistaa.",
      easy: "Owl could not check some steps. Ask your boss to look.",
      "Owl ei voinut tarkistaa kaikkia vaiheita. Pyydä esihenkilöä katsomaan.")
  }
  static var noChecksBody: String { t("This task has no checks.", "Tässä tehtävässä ei ole tarkistuksia.") }
  static var checksOffBody: String {
    t(
      "Camera checks were off, so Owl did not check these steps.",
      "Kameratarkistukset olivat pois päältä, joten Owl ei tarkistanut näitä vaiheita.",
      easy: "The camera was off. Owl did not check these steps.", "Kamera oli pois. Owl ei tarkistanut näitä vaiheita.")
  }
  static var myProgress: String { t("My progress", "Edistymiseni") }
  // Erasing the worker's own progress: asked once more, with both choices in words.
  static var forgetNote: String { t("Owl erases your progress.", "Owl poistaa edistymisesi.") }
  static var forgetTitle: String { t("Erase your progress?", "Poistetaanko edistymisesi?") }
  static var forgetBody: String {
    t(
      "Owl forgets the tasks you finished and the problems you fixed. It cannot be brought back.",
      "Owl unohtaa tekemäsi tehtävät ja korjaamasi ongelmat. Niitä ei saa takaisin.",
      easy: "Owl forgets what you did. You cannot get it back.", "Owl unohtaa, mitä olet tehnyt. Et saa sitä takaisin.")
  }
  static var keepProgress: String { t("Keep my progress", "Säilytä edistymiseni") }
  static var eraseProgress: String { t("Erase my progress", "Poista edistymiseni") }
  static var progressErased: String { t("Your progress is erased.", "Edistymisesi on poistettu.") }
  static var forgetMe: String { t("Forget me", "Unohda minut", easy: "Erase my progress", "Poista edistymiseni") }
  // Training period and target level (JUN-96). Never a fail: "more practice" means training
  // goes on with support. Task names stand alone, so Finnish needs no inflection.
  static var training: String { t("Training", "Koulutus") }
  /// "Training day 4 of 5 · 1 day left". `left`: days after today. `active`: today is inside
  /// the period. `day`/`days` may be unknown.
  static func trainingDays(day: Int?, of days: Int?, left: Int, active: Bool) -> String {
    if !active { return t(
      "Your training period has ended.", "Koulutusjaksosi on päättynyt.",
      easy: "Your training is over.", "Koulutuksesi on loppunut.") }
    if left < 1 { return t("Last day of training.", "Koulutuksen viimeinen päivä.") }
    let rest = left == 1 ? t("1 day left", "1 päivä jäljellä") : t("\(left) days left", "\(left) päivää jäljellä")
    guard let day, let days else { return t("Training: ", "Koulutus: ") + rest }
    return t("Training day \(day) of \(days)", "Koulutuspäivä \(day)/\(days)") + " · " + rest
  }
  /// "Packing: 2 of 3 done without help".
  static func trainingTarget(_ title: String, done: Int, of required: Int) -> String {
    t(
      "\(title): \(min(done, required)) of \(required) done without help",
      "\(title): \(min(done, required)) / \(required) tehty ilman apua",
      easy: "\(title): \(min(done, required)) of \(required) alone", "\(title): \(min(done, required)) / \(required) itse")
  }
  static var trainingAllReached: String {
    t("You reached every target. Well done.", "Saavutit kaikki tavoitteet. Hienoa.",
      easy: "You did all of it. Good job.", "Teit kaiken. Hyvä.")
  }
  static var trainingReadyTitle: String { t("Ready", "Valmis työhön") }
  static var trainingReadyBody: String {
    t(
      "You reached the level of your training. You can do these tasks on your own.",
      "Saavutit koulutuksen tavoitetason. Osaat tehdä nämä tehtävät itse.",
      easy: "You learned the work. You can do it alone.", "Opit työn. Osaat tehdä sen itse.")
  }
  static var trainingMoreTitle: String { t("More practice", "Lisää harjoitusta") }
  static func trainingMoreBody(_ titles: [String]) -> String {
    let list = titles.joined(separator: ", ")
    return list.isEmpty
      ? t("Training goes on with Owl and support.", "Koulutus jatkuu Owlin ja tuen kanssa.",
          easy: "You learn more with Owl.", "Opit lisää Owlin kanssa.")
      : t(
        "Practise these with Owl: \(list). Training goes on with support.",
        "Harjoittele näitä Owlin kanssa: \(list). Koulutus jatkuu tuen kanssa.",
        easy: "Practise these with Owl: \(list).", "Harjoittele näitä Owlin kanssa: \(list).")
  }
  static var trainingNotAFail: String {
    t("This is not a fail. Everyone learns at their own pace.", "Tämä ei ole epäonnistuminen. Jokainen oppii omaan tahtiinsa.",
      easy: "This is okay. You learn at your own speed.", "Tämä on ok. Opit omaan tahtiisi.")
  }
  static var trainingNotConfirmed: String {
    t("Owl suggests this. Your trainer goes through it with you.", "Tämä on Owlin ehdotus. Kouluttajasi käy sen läpi kanssasi.",
      easy: "Your trainer talks about this with you.", "Kouluttajasi puhuu tästä kanssasi.")
  }
  static func trainingConfirmed(by name: String) -> String {
    name.isEmpty
      ? t("Your trainer confirmed this.", "Kouluttajasi vahvisti tämän.",
          easy: "Your trainer agrees.", "Kouluttajasi on samaa mieltä.")
      : t("\(name) confirmed this.", "\(name) vahvisti tämän.",
          easy: "\(name) agrees.", "\(name) on samaa mieltä.")
  }
  static func trainingResultLine(_ ready: Bool) -> String {
    ready ? t("Result: Ready.", "Tulos: Valmis työhön.") : t("Result: More practice.", "Tulos: Lisää harjoitusta.")
  }
  static var ok: String { t("OK", "OK") }
  // Customer service mode (JUN-98). Owl listens only while the mode is on, and says so.
  static var customerService: String { t("Customer service", "Asiakaspalvelu") }
  static var customerServiceStart: String {
    t(
      "At the counter, pinch Customer service. Owl listens and suggests answers.",
      "Nipistä tiskillä Asiakaspalvelu. Owl kuuntelee ja ehdottaa vastauksia.",
      easy: "At the counter, pinch Customer service.", "Nipistä tiskillä Asiakaspalvelu.")
  }
  static var owlListening: String { t("Owl is listening", "Owl kuuntelee") }
  static var hint: String { t("Hint", "Vihje") }
  static var end: String { t("End", "Lopeta") }
  static var assistIdle: String {
    t("Pinch Hint when you need an answer.", "Nipistä Vihje, kun tarvitset vastauksen.",
      easy: "Stuck? Pinch Hint.", "Jumissa? Nipistä Vihje.")
  }
  static var assistNothingHeard: String {
    t("Owl has not heard a question yet.", "Owl ei ole vielä kuullut kysymystä.")
  }
  static var assistLooking: String { t("Looking in the handbook…", "Etsin käsikirjasta…") }
  static var assistSuggestion: String { t("Suggestion", "Ehdotus") }
  static var assistOffered: String { t("Owl offers a hint", "Owl tarjoaa vihjeen") }
  static var assistCouldNot: String {
    t("Owl couldn't find a hint now. Ask a colleague.", "Owl ei löytänyt vihjettä nyt. Kysy työkaverilta.",
      easy: "Owl has no hint now. Ask a co-worker.", "Owlilla ei ole nyt vihjettä. Kysy työkaverilta.")
  }
  static var sayAssistOn: String {
    t("Customer service on. Owl is listening.", "Asiakaspalvelu päällä. Owl kuuntelee.")
  }
  static var sayAssistOff: String {
    t("Owl stopped listening. Nothing was saved.", "Owl lopetti kuuntelun. Mitään ei tallennettu.")
  }
  static var assistOnlyInTraining: String {
    t("Customer service mode is only for your training period.", "Asiakaspalvelutila on vain koulutusjaksoa varten.",
      easy: "Customer service help is only for your training.", "Asiakaspalvelun apu on vain koulutusta varten.")
  }

  // Location during training (JUN-97). Shown whenever tracking is on.
  static var locationOn: String { t("Location on", "Sijainti päällä") }
  static func locationIn(_ zone: String) -> String { t("Location on · \(zone)", "Sijainti päällä · \(zone)") }
  static func goTo(_ label: String) -> String { t("Go to: \(label)", "Mene: \(label)") }
  static var goToBody: String {
    t(
      "Owl opens this step when it sees you are there.", "Owl avaa vaiheen, kun se näkee, että olet perillä.",
      easy: "Go there and look around.", "Mene sinne ja katso ympärillesi.")
  }
  static var goToStuck: String {
    t(
      "Owl doesn't know the place? Pinch Help.", "Eikö Owl tunnista paikkaa? Nipistä Apua.",
      easy: "Stuck? Pinch Help.", "Jumissa? Nipistä Apua.")
  }
  static var youAreThere: String { t("You are there. The step is open.", "Olet perillä. Vaihe on auki.") }
  static var locationTitle: String { t("Location in training", "Sijainti koulutuksessa") }
  static var locationLines: [String] {
    [
      t(
        "During training, Owl recognises from the camera picture where you are. The picture is not saved.",
        "Koulutuksen aikana Owl tunnistaa kamerakuvasta, missä olet. Kuvaa ei tallenneta.",
        easy: "Owl sees from the camera where you are.", "Owl näkee kamerasta, missä olet."),
      t("Your trainer sees the area you are in.", "Kouluttajasi näkee, millä alueella olet.",
        easy: "Your trainer sees where you are.", "Kouluttajasi näkee, missä olet."),
      t("It is deleted when training ends.", "Tieto poistetaan, kun koulutus päättyy.",
        easy: "Owl deletes it after training.", "Owl poistaa sen koulutuksen jälkeen."),
    ]
  }
  static var allowLocation: String { t("Allow location", "Salli sijainti", easy: "Yes", "Kyllä") }
  static var noLocation: String { t("No location", "Ei sijaintia", easy: "No", "Ei") }
  static var locationThanks: String { t("Thank you.", "Kiitos.") }
  static var locationDeclined: String {
    t("Okay. Owl does not follow where you are.", "Selvä. Owl ei seuraa, missä olet.", easy: "Okay.", "Selvä.")
  }
  static var pauseCamera: String { t("Pause camera", "Keskeytä kamera", easy: "Stop camera", "Sammuta kamera") }
  static var cameraOn: String { t("Camera on", "Kamera päälle", easy: "Start camera", "Käynnistä kamera") }
  static func sayFinished(_ summary: OwlRunSummary) -> String {
    if summary.allVerified { return t(
      "Well done. Every checked step is verified.", "Hienoa. Kaikki tarkistettavat vaiheet on tarkistettu.",
      easy: "Good job. All checks are right.", "Hyvä. Kaikki tarkistukset ovat oikein.") }
    if summary.unverified > 0 {
      return summary.unverified == 1
        ? t(
          "You finished. One step was not verified.", "Olet valmis. Yhtä vaihetta ei tarkistettu.",
          easy: "You finished. Owl could not check one step.", "Olet valmis. Owl ei voinut tarkistaa yhtä vaihetta.")
        : t(
          "You finished. \(summary.unverified) steps were not verified.",
          "Olet valmis. \(summary.unverified) vaihetta jäi tarkistamatta.",
          easy: "You finished. Owl could not check \(summary.unverified) steps.",
          "Olet valmis. Owl ei voinut tarkistaa \(summary.unverified) vaihetta.")
    }
    return t("You finished the task.", "Tehtävä on valmis.")
  }

  // Watch how
  static var videoPlaying: String { t("Playing the clip", "Toistan videota") }
  static var videoProblem: String { t(
    "The video can't play right now", "Videota ei voi toistaa juuri nyt",
    easy: "The video cannot play now", "Video ei toimi nyt") }
  static var videoProblemBody: String {
    t(
      "The step still works. Follow the photo and the instruction.", "Vaihe toimii silti. Seuraa kuvaa ja ohjetta.",
      easy: "You can still do the step. Look at the photo and read the text.",
      "Voit silti tehdä vaiheen. Katso kuvaa ja lue teksti.")
  }
  static var afterClip: String { t(
    "That is how it is done", "Näin se tehdään",
    easy: "This is how you do it", "Näin se tehdään") }
  static var sayVideoProblem: String { t(
    "The video can't play right now.", "Videota ei voi toistaa juuri nyt.",
    easy: "The video cannot play now.", "Video ei toimi nyt.") }

  // Ask
  static var listening: String { t("Listening", "Kuuntelen") }
  static var askPrompt: String { t("Ask your question.", "Kysy kysymyksesi.") }
  static var askOwl: String { t("Ask Owl", "Kysy Owlilta") }
  static var thinking: String { t("Owl is thinking", "Owl miettii") }
  static func source(_ name: String) -> String { t("Source: \(name)", "Lähde: \(name)") }
  static var notInInstructions: String { t(
    "Not in the instructions", "Ei ohjeissa",
    easy: "The instructions do not say this", "Ohjeissa ei kerrota tätä") }
  static var fromInstructions: String { t(
    "From your company's instructions", "Yrityksesi ohjeista",
    easy: "From your workplace's instructions", "Työpaikkasi ohjeista") }
  static var sayYes: String { t("Yes?", "Niin?") }

  // Help
  static var helpLabel: String { t("Help", "Apu") }
  static var callingExpert: String { t(
    "Calling an expert", "Kutsun asiantuntijaa",
    easy: "Calling a helper", "Soitan auttajalle") }
  static var expertWithYou: String { t(
    "An expert is with you", "Asiantuntija on kanssasi",
    easy: "A helper is with you", "Auttaja on kanssasi") }
  static var helpBody: String {
    t(
      "They see what you see. Keep the problem in view.", "Hän näkee saman kuin sinä. Pidä ongelma näkyvissä.",
      easy: "The helper sees what you see. Look at the problem.", "Auttaja näkee saman kuin sinä. Katso ongelmaa.")
  }
  static var sayCallingExpert: String {
    t(
      "Calling an expert. They will see what you see.", "Kutsun asiantuntijan. Hän näkee saman kuin sinä.",
      easy: "Owl calls a helper. The helper sees what you see.",
      "Owl soittaa auttajalle. Auttaja näkee saman kuin sinä.")
  }
  // Help from the shift manager's own glasses (JUN-100). Names stand alone, so Finnish needs
  // no inflection.
  static var whoHelps: String { t("Who can help?", "Kuka auttaa?") }
  static func callShiftManager(_ name: String?) -> String {
    name.map { t("Call \($0), shift manager", "Soita: \($0), vuoropäällikkö") }
      ?? t("Call the shift manager", "Soita vuoropäällikölle")
  }
  static var managerSeesView: String {
    t("They see your view and talk you through it.", "Hän näkee näkymäsi ja neuvoo puheella.",
      easy: "They see what you see and help you.", "Hän näkee saman kuin sinä ja auttaa.")
  }
  static var askStudioExpert: String { t("Ask an expert in Owl Studio", "Kysy asiantuntijalta Owl Studiossa",
    easy: "Ask an expert", "Kysy asiantuntijalta") }
  static func callingManager(_ name: String) -> String {
    t("Calling \(name), shift manager…", "Soitan: \(name), vuoropäällikkö…")
  }
  static func managerWillSee(_ name: String) -> String {
    t("\(name) sees your view when they answer.", "\(name) näkee näkymäsi, kun hän vastaa.",
      easy: "When \(name) answers, they see what you see.", "Kun \(name) vastaa, hän näkee saman kuin sinä.")
  }
  /// Shown the whole call (the rule of JUN-100: the worker always sees who is watching).
  static func isWatching(_ name: String) -> String { t(
    "\(name) is watching your view", "\(name) näkee näkymäsi",
    easy: "\(name) sees what you see", "\(name) näkee saman kuin sinä") }
  static func noAnswer(_ name: String) -> String {
    t("\(name) didn't answer. An expert in Owl Studio will help.", "\(name) ei vastannut. Asiantuntija Owl Studiossa auttaa.",
      easy: "\(name) did not answer. Owl asks an expert.", "\(name) ei vastannut. Owl kysyy asiantuntijalta.")
  }
  static var noManagerOnShift: String {
    t("No shift manager is on shift now. An expert in Owl Studio will help.",
      "Vuoropäällikkö ei ole nyt vuorossa. Asiantuntija Owl Studiossa auttaa.",
      easy: "No shift manager is here now. Owl asks an expert.",
      "Vuoropäällikkö ei ole nyt töissä. Owl kysyy asiantuntijalta.")
  }
  static var answer: String { t("Answer", "Vastaa") }
  static var talk: String { t("Talk", "Puhu") }
  static var speakNow: String { t("Speak now…", "Puhu nyt…") }
  static func youSaid(_ text: String) -> String { t("You: \(text)", "Sinä: \(text)") }
  static var shiftManager: String { t("Shift manager", "Vuoropäällikkö") }
  static var managerIdle: String {
    t("Owl tells you when someone needs help.", "Owl kertoo, kun joku tarvitsee apua.")
  }
  static func needsHelp(_ name: String) -> String { t("Help: \(name)", "Apua: \(name)") }
  static func sayNeedsHelp(_ name: String) -> String { t("\(name) needs help.", "\(name) tarvitsee apua.") }
  static var accept: String { t("Accept", "Vastaa") }
  static var later: String { t("Later", "Myöhemmin") }
  static func viewOf(_ name: String) -> String { t("\(name)'s view", "Näkymä: \(name)") }
  static var waitingForPicture: String { t("Waiting for the picture…", "Odotan kuvaa…") }
  static var pinchTalk: String { t("Pinch Talk and say what to do.", "Nipistä Puhu ja kerro, mitä tehdä.") }
  static func theySaid(_ name: String, _ text: String) -> String { "\(name): \(text)" }
  static func stepNamed(_ index: Int, _ title: String?) -> String {
    t("Step \(index)", "Vaihe \(index)") + (title.map { " · \($0)" } ?? "")
  }
  static var callEnded: String { t("The call ended.", "Puhelu päättyi.") }
  static var myTasks: String { t("My tasks", "Tehtäväni") }
  static var sayHelpEnded: String { t(
    "Help has ended. Your view is no longer shared.", "Apu päättyi. Näkymääsi ei enää jaeta.",
    easy: "Help has ended. Nobody sees what you see now.", "Apu päättyi. Kukaan ei enää näe, mitä sinä näet.") }

  // Record
  static var record: String { t("Record", "Tallennus") }
  static func recordingStep(_ index: Int) -> String { t("Recording step \(index)", "Tallennan vaihetta \(index)") }
  static func stepsRecorded(_ count: Int) -> String {
    count == 1 ? t("1 step recorded", "1 vaihe tallennettu") : t("\(count) steps recorded", "\(count) vaihetta tallennettu")
  }
  static var recordHintDoing: String { t("Do the step and say what you do.", "Tee vaihe ja kerro, mitä teet.") }
  static var recordHintNext: String { t("Pinch Record step for the next one.", "Nipistä Tallenna vaihe seuraavaa varten.") }
  static var recordHintFirst: String { t(
    "Pinch Record step, then do the step and say what you do.", "Nipistä Tallenna vaihe, tee vaihe ja kerro, mitä teet.",
    easy: "Pinch Record step. Do the step. Say what you do.", "Nipistä Tallenna vaihe. Tee vaihe. Kerro, mitä teet.") }
  static var savingStep: String { t("Saving the step", "Tallennan vaihetta") }
  static var uploadingClip: String { t("Sending the clip.", "Lähetän videon.") }
  static var writingSteps: String { t("Owl is writing the steps", "Owl kirjoittaa vaiheita") }
  static var takesAMoment: String { t("This takes a moment.", "Tämä kestää hetken.") }
  static var recorded: String { t("Recorded", "Tallennettu") }
  static var openingClip: String { t("Opening the clip", "Avaan videota") }
  static var stepNotSaved: String { t("Step not saved. Record it again.", "Vaihetta ei tallennettu. Tallenna se uudelleen.") }
  static func reviewInStudio(_ title: String) -> String {
    t("A person reviews \(title) in Owl Studio before anyone learns from it.", "Tehtävä \(title) tarkistetaan Owl Studiossa ennen kuin kukaan oppii siitä.",
      easy: "A person checks \(title) first. Then others can learn it.",
      "Ihminen tarkistaa ensin tehtävän \(title). Sitten muut voivat oppia sen.")
  }

  // When something is in the way (JUN-42)
  static func problemTitle(_ kind: OwlProblemKind) -> String {
    switch kind {
    case .cameraNeeded: t(
      "Owl can't use the camera", "Owl ei saa käyttää kameraa",
      easy: "Owl may not use the camera", "Owl ei saa käyttää kameraa")
    case .microphoneNeeded: t("Owl can't hear you", "Owl ei kuule sinua", easy: "Owl cannot hear you", "Owl ei kuule sinua")
    case .offline: t("No connection", "Ei yhteyttä")
    case .server: t(
      "Owl can't help right now", "Owl ei voi auttaa juuri nyt",
      easy: "Owl cannot help now", "Owl ei voi auttaa nyt")
    case .notAllowed: t("Ask your supervisor", "Kysy esihenkilöltäsi", easy: "Ask your boss", "Kysy esihenkilöltäsi")
    case .notAssigned: t(
      "These glasses are not set up yet", "Näitä laseja ei ole vielä otettu käyttöön",
      easy: "These glasses are not ready yet", "Nämä lasit eivät ole vielä valmiit")
    case .video: videoProblem
    case .other: t("Something went wrong", "Jokin meni vikaan")
    }
  }
  static func problemBody(_ kind: OwlProblemKind) -> String {
    switch kind {
    case .cameraNeeded:
      t(
        "Your supervisor allows the camera once, on the phone. You can still follow the steps.",
        "Esihenkilösi sallii kameran kerran puhelimesta. Voit silti seurata vaiheita.",
        easy: "Your boss can allow the camera on the phone. You can still do the steps.",
        "Esihenkilösi voi sallia kameran puhelimesta. Voit silti tehdä vaiheet.")
    case .microphoneNeeded:
      t(
        "Your supervisor allows the microphone once, on the phone.",
        "Esihenkilösi sallii mikrofonin kerran puhelimesta.",
        easy: "Your boss can allow the microphone on the phone.", "Esihenkilösi voi sallia mikrofonin puhelimesta.")
    case .offline:
      t(
        "Saved tasks still work. Owl can't check or answer until the connection is back.",
        "Tallennetut tehtävät toimivat. Owl ei voi tarkistaa eikä vastata ennen kuin yhteys palaa.",
        easy: "You can still do saved tasks. Owl cannot check now. Owl cannot answer now.",
        "Voit tehdä tallennetut tehtävät. Owl ei voi nyt tarkistaa. Owl ei voi nyt vastata.")
    case .server: t(
      "Owl's server has a problem. Try again in a moment.",
      "Owlin palvelimessa on vika. Yritä hetken päästä uudelleen.",
      easy: "Owl has a problem. Try again soon.", "Owlissa on vika. Yritä pian uudelleen.")
    case .notAllowed: t(
      "Owl's server did not accept these glasses.", "Owlin palvelin ei hyväksynyt näitä laseja.",
      easy: "Owl does not know these glasses.", "Owl ei tunne näitä laseja.")
    case .notAssigned:
      t(
        "Ask your supervisor to give them to you in Owl Studio.",
        "Pyydä esihenkilöäsi antamaan ne sinulle Owl Studiossa.",
        easy: "Ask your boss to set them up for you.", "Pyydä esihenkilöä ottamaan ne käyttöön sinulle.")
    case .video: videoProblemBody
    case .other: t(
      "Try again, or ask your supervisor.", "Yritä uudelleen tai kysy esihenkilöltäsi.",
      easy: "Try again. Or ask your boss.", "Yritä uudelleen. Tai kysy esihenkilöltäsi.")
    }
  }
  static var sayWelcomeBack: String { t("Welcome back.", "Tervetuloa takaisin.") }

  // Audio first (JUN-81): what a pinch does and what else can be chosen, said aloud for a
  // worker who cannot read the buttons. A choice is named by its place, not by a gesture.
  static var sayPinchToStart: String { t("Pinch to start.", "Nipistä, niin aloitetaan.") }
  static func sayPinchToOpen(_ count: Int) -> String {
    count == 1
      ? t("Pinch to open it.", "Nipistä, niin avaan sen.")
      : t("Pinch to open the first one.", "Nipistä, niin avaan ensimmäisen.")
  }
  static func sayStepButtons(_ others: [String]) -> String {
    let list = others.joined(separator: ", ")
    return t(
      "Pinch \(done) when you are ready. The other buttons are: \(list).",
      "Nipistä \(done), kun olet valmis. Muut painikkeet ovat: \(list).")
  }
  static var sayFixThenPinch: String {
    t("Fix it. Then pinch, and Owl checks again.", "Korjaa se. Nipistä sitten, niin Owl tarkistaa uudelleen.")
  }
  static var sayCannotCheckChoices: String {
    t(
      "Pinch, and Owl checks again. The other choice is: \(continueUnverified).",
      "Nipistä, niin Owl tarkistaa uudelleen. Toinen vaihtoehto on: \(continueUnverified).")
  }
  static func sayTwoChoices(_ first: String, _ second: String) -> String {
    t("The first choice is: \(first). The second is: \(second).", "Ensimmäinen vaihtoehto on: \(first). Toinen on: \(second).")
  }
  static func sayOutcome(_ row: OwlRunSummary.Row) -> String {
    let outcome =
      switch row.outcome {
      case .verified: verified
      case .unverified: notVerified
      case .noCheck: noCheckLabel
      }
    return t("Step \(row.index), \(row.title): \(outcome).", "Vaihe \(row.index), \(row.title): \(outcome).")
  }
  static var sayPinchForHome: String { t("Pinch to go back to your tasks.", "Nipistä, niin palaat tehtäviisi.") }
  static var sayPinchToTryAgain: String { t("Pinch to try again.", "Nipistä, niin yritän uudelleen.") }
  static var sayPinchToGoBack: String { t("Pinch to go back.", "Nipistä, niin palaat takaisin.") }
  static var sayCantHelp: String { t(
    "Owl can't help right now.", "Owl ei voi auttaa juuri nyt.",
    easy: "Owl cannot help now.", "Owl ei voi auttaa nyt.") }
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
