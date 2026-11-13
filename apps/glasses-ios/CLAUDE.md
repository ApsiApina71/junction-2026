# glasses-ios

Requires Xcode 26.4+. The Mac's address for the API is baked in with `COPILOT_API_URL` and can be changed in the app (server button).

## Run (physical iPhone, glasses paired in Meta AI with Developer Mode on)

```sh
xcodebuild -project CameraAccess.xcodeproj -scheme CameraAccess \
  -destination 'platform=iOS,name=<iPhone name>' -allowProvisioningUpdates \
  DEVELOPMENT_TEAM=<team id> COPILOT_API_URL=http://<mac ip>:8000 build
xcrun devicectl device install app --device <iPhone name> <path to CameraAccess.app>
```

## Verify

```sh
xcodebuild -project CameraAccess.xcodeproj -scheme CameraAccess \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= build
```

Unsigned simulator builds (`CODE_SIGNING_ALLOWED=NO`) crash in `Wearables.configure()`; use ad-hoc signing as above.
