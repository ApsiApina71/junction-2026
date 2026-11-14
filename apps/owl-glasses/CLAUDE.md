# owl-glasses

Onboarding Owl on Meta Ray-Ban Display glasses (DAT iOS). Requires Xcode 26.4+ and the `mwdat-ios` Claude Code plugin (`claude plugin install mwdat-ios@mwdat-ios-marketplace`) for DAT guidance. Search `search_dat_docs` before every DAT API call. The owl-api address and token are baked in with `OWL_API_URL` and `OWL_API_TOKEN` and can be changed in the app (Server button); the https tunnel URL from the owl-api session works as the address too.

## Where to put code

- `DisplayAccess/Owl/` is a folder-synced Xcode group: new `.swift` files there build automatically, no project edits.
- `DisplayAccess/Owl/Display/`: glasses screens and art (Display DSL, no SwiftUI), owned by JUN-36.
- Everything else in `DisplayAccess/Owl/`: flow, camera, speech, voice invocations, owl-api client.

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
| `OWL_STAGE=1` | Turns on Stage mirroring (JUN-79) without the phone toggle; watch it at `<owl-api>/stage` |
| `OWL_AUTO_SCRIPT=<steps>` | Debug builds: runs `;`-separated steps in order, e.g. `open;run;mock:warning;wait:4;mock:ok;again;done;ask;speak:Mitä jos tuote on loppu?;help;wait:10;endhelp;record;recordstep;wait:3;endstep;finish`. Steps: `open start run process:<id> done again back watch progress allow decline agreerecord camera forget resetconsent ask answer:<q> help endhelp record recordstep endstep finish mock:<answer> wait:<s> speak:<text> takeoff puton heymeta` |

The glasses id is a setting: `xcrun simctl spawn "iPhone 17" defaults write fi.junction2026.bossit.owl owl.glassesID glasses-1`. With the preview on, the preview sheet also has buttons for "Hey Meta", taking the glasses off, a spoken question and the mock Check answer. Logs: `xcrun simctl spawn "iPhone 17" log stream --predicate 'eventMessage CONTAINS "[Owl]"'`. The mock camera streams `Assets.xcassets/owlDemoFeed` (falls back to `demoMeal`) as a generated HEVC clip, because MockDeviceKit streams video files only.

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
```
