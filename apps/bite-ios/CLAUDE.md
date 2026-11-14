# bite-ios

Requires Xcode 26.4+ and the `mwdat-ios` Claude Code plugin (`claude plugin install mwdat-ios@mwdat-ios-marketplace`) for DAT guidance. The API address is baked in with `BITE_API_URL` and can be changed in the app (Server button).

## Run in the simulator (no glasses)

```sh
xcodebuild -project DisplayAccess.xcodeproj -scheme DisplayAccess \
  -destination 'platform=iOS Simulator,name=iPhone 17' -derivedDataPath /tmp/bite-dd \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= BITE_API_URL=http://127.0.0.1:8000 build
xcrun simctl install "iPhone 17" /tmp/bite-dd/Build/Products/Debug-iphonesimulator/DisplayAccess.app
SIMCTL_CHILD_BITE_AUTO_PREVIEW=inApp xcrun simctl launch "iPhone 17" fi.junction2026.bossit.bite
```

`BITE_AUTO_PREVIEW=inApp|chrome` starts mock Display glasses; `chrome` serves the display at `http://127.0.0.1:9000` for the Chrome "Meta Ray-Ban Display Simulator" extension. `BITE_AUTO_LOG=1`, `BITE_AUTO_TODAY=1` and `BITE_AUTO_WATCH=1` drive the flow without taps.

Unsigned simulator builds (`CODE_SIGNING_ALLOWED=NO`) crash in `Wearables.configure()`; always ad-hoc sign as above.

## Run on an iPhone with glasses

Developer Mode on in the iPhone and in the Meta AI app (Settings → App Info → tap the version 5 times). Use your own Apple ID team:

```sh
xcodebuild -project DisplayAccess.xcodeproj -scheme DisplayAccess -destination 'id=<iPhone UDID>' \
  -allowProvisioningUpdates DEVELOPMENT_TEAM=<team id> BITE_API_URL=http://<mac ip>:8000 build
xcrun devicectl device install app --device <iPhone UDID> <path to DisplayAccess.app>
```

Free personal teams cannot sign the Hotspot or Wi-Fi Info entitlements; this project does not use them.

## Verify

```sh
xcodebuild -project DisplayAccess.xcodeproj -scheme DisplayAccess \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= build
```
