# owl-glasses

Onboarding Owl on Meta Ray-Ban Display glasses (DAT iOS). Requires Xcode 26.4+ and the `mwdat-ios` Claude Code plugin (`claude plugin install mwdat-ios@mwdat-ios-marketplace`) for DAT guidance. Search `search_dat_docs` before every DAT API call. The owl-api address and token are baked in with `OWL_API_URL` and `OWL_API_TOKEN` and can be changed in the app (Server button); the https tunnel URL from the owl-api session works as the address too.

## Where to put code

- `DisplayAccess/Owl/` is a folder-synced Xcode group: new `.swift` files there build automatically, no project edits.
- `DisplayAccess/Owl/Display/`: glasses screens and art (Display DSL, no SwiftUI), JUN-36. A new screen is a function in `OwlScreens.swift` built from `screen { } buttons: { }` and `header(...)`, its words go in `OwlStrings.swift` in English and Finnish, with an easy-language version when the sentence is not already short and plain (`t(en, fi, easy:, _:)`), and it gets a name in `OwlScreenGallery.swift` so it can be looked at. It must fit 600×600 without scrolling and have at least one button, waits included: the touchpad pauses or stops the session when nothing interactive is shown. The way out of a wait goes through `waitAction`, which ignores the second half of a double pinch.
- `DisplayAccess/Owl/OwlRunLog.swift`: the rule for a verified step (JUN-57). `DisplayAccess/Owl/OwlHEVC.swift`: which stream frame is a key frame (JUN-91). Both Foundation only, so `Tests/run.sh` can test them on the Mac.
- Everything else in `DisplayAccess/Owl/`: flow, camera, speech, voice invocations, owl-api client. In `OwlViewModel.swift` every flow starts with `newScene()` and checks `isCurrent(number)` after each wait, so late work never changes the next screen.

## Run in the simulator (no glasses)

```sh
xcodebuild -project DisplayAccess.xcodeproj -scheme DisplayAccess \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath /tmp/owl-dd \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= OWL_API_URL=http://127.0.0.1:8000 build
xcrun simctl install "iPhone 17" /tmp/owl-dd/Build/Products/Debug-iphonesimulator/DisplayAccess.app
SIMCTL_CHILD_OWL_AUTO_PREVIEW=inApp xcrun simctl launch "iPhone 17" fi.junction2026.bossit.owl
```

`OWL_AUTO_PREVIEW=inApp|chrome` starts mock Display glasses; `chrome` serves the display at `http://127.0.0.1:9000` for the Chrome "Meta Ray-Ban Display Simulator" extension. More hooks (prefix each with `SIMCTL_CHILD_`, export values with spaces):

| Variable | Does |
|---|---|
| `OWL_AUTO_VOICE=1` | Says "Hey Meta, start Owl" on the mock glasses instead of opening Owl directly |
| `OWL_AUTO_RUN=1` | Starts the first published task |
| `OWL_AUTO_ASK=<question>` | Opens Ask and speaks the question into the mock glasses |
| `OWL_AUTO_RECORD=1` | Records one narrated 4 s step and finishes the recording |
| `OWL_MOCK_CHECK=ok\|warning\|unsure\|checking` | Sends `mock=` with every `/check` so the mock owl-api returns that answer |
| `OWL_FORCE_CLIP=1` | Sends short HEVC clips (`clip`) instead of JPEGs (`image`), the fallback for when the phone cannot decode in the background |
| `OWL_PREVIEW_SCREEN=<name>` | Shows one designed screen with sample data instead of starting Owl, e.g. `correction`, `step-fi`, `step-long`, `done-unverified` (all names in `OwlScreenGallery.names`; `-easy` for the easy-language words, `-fi` for Finnish, `-long` for the longest copy, in that order: `cannot-check-easy-fi`) |
| `OWL_HIDE_PREVIEW=1` | Closes the preview sheet once the mock glasses run, so a screenshot shows the phone's own screen: the status line and, when something is in the way, what the employer can do about it |
| `OWL_STAGE=1` | Turns on Stage mirroring (JUN-79) without the phone toggle; watch it at `<owl-api>/stage` |
| `OWL_AUTO_SCRIPT=<steps>` | Debug builds: runs `;`-separated steps in order, e.g. `open;run;mock:warning;wait:4;mock:ok;again;done;ask;speak:Mitä jos tuote on loppu?;help;wait:10;endhelp;record;agreerecord;recordstep;wait:3;endstep;finish`. Steps: `open start run process:<id> done again back cancel continue step watch progress recognize allow decline agreerecord camera forget forgetyes forgetno resetconsent ask answer:<q> endask help endhelp record recordstep endstep cancelsave finish mock:<answer> wait:<s> bg:<step> speak:<text> takeoff puton heymeta`. `agreerecord` is the "I agree" button of the recording consent that `record` shows the first time: it saves the consent and starts the recording. `done` and `again` are the same final check; `back` closes a correction or a cannot-check card, `cancel` stops a final check that is running, `continue` goes on unverified, `step` returns to the step card. `bg:<step>` starts a step without waiting for it, so the script can act during a wait: `bg:endstep;wait:3;cancelsave` cancels a step upload, `bg:finish;wait:3;start` leaves the "writing the steps" wait |

The glasses id is a setting: `xcrun simctl spawn "iPhone 17" defaults write fi.junction2026.bossit.owl owl.glassesID glasses-1`. With the preview on, the preview sheet also has buttons for "Hey Meta", taking the glasses off, a spoken question and the mock Check answer. Logs: `xcrun simctl spawn "iPhone 17" log stream --predicate 'eventMessage CONTAINS "[Owl]"'`. The mock camera streams `Assets.xcassets/owlDemoFeed` (falls back to `demoMeal`) as a generated HEVC clip, because MockDeviceKit streams video files only. A check that logs `perf: 6 KB` is looking at a flat grey picture (JUN-91); a real frame is 80 to 90 KB.

Clips play over https only, also in the simulator. Without a tunnel: make a test CA and a certificate for `localhost` with `openssl`, trust the CA in the simulator (`xcrun simctl keychain <device> add-root-cert ca.pem`), start owl-api with `--ssl-keyfile`/`--ssl-certfile` and `PUBLIC_BASE_URL=https://localhost:8443`, and point the app at it (`defaults write fi.junction2026.bossit.owl owl.serverURL https://localhost:8443`).

Unsigned simulator builds (`CODE_SIGNING_ALLOWED=NO`) crash in `Wearables.configure()`; always ad-hoc sign as above.

## Run on an iPhone with glasses

Developer Mode on in the iPhone and in the Meta AI app (Settings → App Info → tap the version 5 times). Use your own Apple ID team:

```sh
xcodebuild -project DisplayAccess.xcodeproj -scheme DisplayAccess -destination 'id=<iPhone UDID>' \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=<team id> OWL_API_URL=http://<mac ip>:8000 build
xcrun devicectl device install app --device <iPhone UDID> <path to DisplayAccess.app>
```

Free personal teams cannot sign the Hotspot or Wi-Fi Info entitlements; this project does not use them. DAT analytics and crash reporting are opted out in `Info.plist` (`MWDAT` → `Analytics` / `CrashReporting` → `OptOut`).

## Verify

```sh
xcodebuild -project DisplayAccess.xcodeproj -scheme DisplayAccess \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath /tmp/owl-dd \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= build
plutil -lint DisplayAccess/Info.plist
/usr/libexec/PlistBuddy -c 'Print :MWDAT:Analytics:OptOut' -c 'Print :MWDAT:CrashReporting:OptOut' DisplayAccess/Info.plist
./Tests/run.sh
```
