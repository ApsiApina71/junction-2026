# owl-glasses

Onboarding Owl on Meta Ray-Ban Display glasses (DAT iOS). Requires Xcode 26.4+ and the `mwdat-ios` Claude Code plugin (`claude plugin install mwdat-ios@mwdat-ios-marketplace`) for DAT guidance. Search `search_dat_docs` before every DAT API call. The owl-api address is baked in with `OWL_API_URL` and can be changed in the app (Server button).

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

`OWL_AUTO_PREVIEW=inApp|chrome` starts mock Display glasses; `chrome` serves the display at `http://127.0.0.1:9000` for the Chrome "Meta Ray-Ban Display Simulator" extension.

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
