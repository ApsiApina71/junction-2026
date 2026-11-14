#!/bin/sh
# JUN-100 demo: Sami (glasses-1) on the iPhone 17 simulator calls Mika, the shift manager
# (glasses-7), on the iPhone 18 Pro simulator. Mika accepts, sees Sami's view, says where the
# oat drink is, Sami answers, and Mika ends the call.
#
# Needs owl-api in demo mode (OWL_DEMO=1) at $1 (default http://127.0.0.1:8000), started with
# OWL_RESET=1 for a clean run, and a Debug build installed on both simulators (see CLAUDE.md).
set -eu
server="${1:-http://127.0.0.1:8000}"
app=fi.junction2026.bossit.owl
for device in "iPhone 17" "iPhone 18 Pro"; do
  xcrun simctl boot "$device" 2>/dev/null || true
  xcrun simctl spawn "$device" defaults write $app owl.serverURL "$server"
done
xcrun simctl spawn "iPhone 17" defaults write $app owl.glassesID glasses-1
xcrun simctl spawn "iPhone 18 Pro" defaults write $app owl.glassesID glasses-7

# Mika: waits on the shift manager screen, accepts the call, talks, ends it.
SIMCTL_CHILD_OWL_AUTO_PREVIEW=inApp \
SIMCTL_CHILD_OWL_AUTO_SCRIPT="wait:8;open;wait:36;accept;wait:4;talk;wait:1;speak:Blue carton on the top shelf. Take two.;wait:12;endcall" \
  xcrun simctl launch --terminate-running-process "iPhone 18 Pro" $app

# Sami: consent, first step, Help, Call shift manager, then answers by voice.
SIMCTL_CHILD_OWL_AUTO_PREVIEW=inApp \
SIMCTL_CHILD_OWL_AUTO_SCRIPT="wait:8;open;wait:4;allow;wait:5;open;wait:5;declinelocation;wait:5;start;wait:3;run;wait:5;help;wait:3;callmanager;wait:12;reply;wait:1;speak:Found it, thanks!;wait:20" \
  xcrun simctl launch --terminate-running-process "iPhone 17" $app

echo "Open DeviceHub to watch both simulators. The call starts after about 40 s."
