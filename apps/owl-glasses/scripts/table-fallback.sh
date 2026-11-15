#!/bin/bash
# The table pitch without the glasses (JUN-109): the iOS Simulator with mock Display glasses,
# Meta's Chrome display preview, and the real owl-api on this laptop.
#
#   apps/owl-glasses/scripts/table-fallback.sh [owl-api url]      (default http://127.0.0.1:8000)
#
# It builds and installs the app (once), puts an https front before owl-api (clips play over
# https only), trusts that front in the simulator, sets the glasses to glasses-1 (Jose), turns
# Stage mirroring on and starts the recycling task. The mock camera plays the can clip.
# Then: Chrome at http://127.0.0.1:9000 with the "Meta Ray-Ban Display Simulator" extension
# shows the display, and <owl-api>/stage shows the stage view.
set -euo pipefail

UPSTREAM="${1:-http://127.0.0.1:8000}"
SIM="${OWL_SIM:-iPhone 17}"
PORT="${OWL_TLS_PORT:-8443}"
BUNDLE="fi.junction2026.bossit.owl"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
STATE="${HOME}/.owl-table"
DERIVED="${STATE}/build"
APP="${DERIVED}/Build/Products/Debug-iphonesimulator/DisplayAccess.app"
mkdir -p "$STATE"

say() { printf '\033[1m%s\033[0m\n' "$*"; }

say "1/6 owl-api at ${UPSTREAM}"
if ! curl -sf "${UPSTREAM}/health" >/dev/null; then
  echo "owl-api does not answer at ${UPSTREAM}/health. Start it first (see docs/runbooks/owl-junction-demo.md)." >&2
  exit 1
fi

say "2/6 https front on https://localhost:${PORT}"
if [ ! -f "$STATE/localhost.pem" ]; then
  # A CA that only the simulator trusts, and a certificate for localhost signed by it.
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$STATE/ca.key" -out "$STATE/ca.pem" -days 30 \
    -subj "/CN=Owl table fallback CA" 2>/dev/null
  openssl req -newkey rsa:2048 -nodes -keyout "$STATE/localhost.key" -out "$STATE/localhost.csr" \
    -subj "/CN=localhost" 2>/dev/null
  printf "subjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\n" > "$STATE/ext.cnf"
  openssl x509 -req -in "$STATE/localhost.csr" -CA "$STATE/ca.pem" -CAkey "$STATE/ca.key" -CAcreateserial \
    -out "$STATE/localhost.pem" -days 30 -extfile "$STATE/ext.cnf" 2>/dev/null
fi
if lsof -ti "tcp:${PORT}" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "something already listens on ${PORT}; using it"
else
  nohup python3 -I "$HERE/scripts/tls-front.py" "$STATE/localhost.pem" "$STATE/localhost.key" "$PORT" "$UPSTREAM" \
    > "$STATE/front.log" 2>&1 &
  for _ in $(seq 1 20); do curl -sf --cacert "$STATE/ca.pem" "https://localhost:${PORT}/health" >/dev/null && break; sleep 0.3; done
fi
curl -sf --cacert "$STATE/ca.pem" "https://localhost:${PORT}/health" >/dev/null || { echo "the https front did not start, see $STATE/front.log" >&2; exit 1; }

say "3/6 simulator ${SIM}"
xcrun simctl boot "$SIM" 2>/dev/null || true
open -a "$(xcode-select -p)/../Applications/DeviceHub.app" 2>/dev/null || open -a Simulator 2>/dev/null || true
xcrun simctl keychain "$SIM" add-root-cert "$STATE/ca.pem"

say "4/6 app (built once into ${DERIVED})"
if [ ! -d "$APP" ] || [ "${OWL_REBUILD:-0}" = "1" ]; then
  xcodebuild -project "$HERE/DisplayAccess.xcodeproj" -scheme DisplayAccess \
    -destination "platform=iOS Simulator,name=${SIM}" -derivedDataPath "$DERIVED" \
    CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= OWL_API_URL="https://localhost:${PORT}" build -quiet \
    2>&1 | grep -E "error:|BUILD FAILED" || true
fi
xcrun simctl terminate "$SIM" "$BUNDLE" 2>/dev/null || true
xcrun simctl install "$SIM" "$APP"

say "5/6 glasses-1 (Jose), Stage mirroring on"
xcrun simctl spawn "$SIM" defaults write "$BUNDLE" owl.glassesID glasses-1
xcrun simctl spawn "$SIM" defaults write "$BUNDLE" owl.stageMirroring -bool true
xcrun simctl spawn "$SIM" defaults delete "$BUNDLE" owl.serverURL 2>/dev/null || true
xcrun simctl spawn "$SIM" defaults delete "$BUNDLE" owl.employeeID 2>/dev/null || true

say "6/6 the recycling task"
# Every run starts as Jose's first: no progress, the step waits for its place again.
curl -sf -X DELETE "${UPSTREAM}/employees/emp-jose/progress" >/dev/null || echo "(could not reset Jose's progress)"
# Chrome preview, then: the welcome, the camera and location consent, and the first task.
SIMCTL_CHILD_OWL_AUTO_PREVIEW=chrome SIMCTL_CHILD_OWL_STAGE=1 \
  SIMCTL_CHILD_OWL_AUTO_SCRIPT="wait:4;allowlocation;wait:2;run" \
  xcrun simctl launch "$SIM" "$BUNDLE" -AppleLanguages "(en)" >/dev/null

# The app serves the display preview on :9000. Owl waits on a quiet "getting ready" screen
# until a Chrome page shows it, so the order cannot go wrong: open it now.
for _ in $(seq 1 60); do curl -s -o /dev/null http://127.0.0.1:9000 && break; sleep 0.5; done
open -a "Google Chrome" http://127.0.0.1:9000 2>/dev/null || true

cat <<EOF

Running. Chrome opened http://127.0.0.1:9000: turn on the "Meta Ray-Ban Display Simulator"
extension there if the display is not showing yet. Owl starts once the display is up.
Show these side by side:
  display  http://127.0.0.1:9000  in Chrome
  stage    ${UPSTREAM}/stage
Once per Chrome session, before the first run: open https://localhost:${PORT}/health in Chrome and
choose Advanced → Proceed, so Chrome plays the expert's clip from the local https front.
Play it again: run this script again (about 15 s).
EOF
