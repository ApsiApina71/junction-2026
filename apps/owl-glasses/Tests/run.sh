#!/bin/sh
# Runs the tests of the rules that need no glasses and no simulator (OwlRunLog.swift, OwlHEVC.swift, OwlLocation.swift, OwlAssist.swift, the training and location models).
set -eu
cd "$(dirname "$0")/.."
out="${TMPDIR:-/tmp}/owl-run-tests"
# main.swift so the test file can use top-level code.
tmp="$(mktemp -d)"
cp Tests/OwlRunTests.swift "$tmp/main.swift"
swiftc -swift-version 6 -o "$out" DisplayAccess/Owl/OwlModels.swift DisplayAccess/Owl/OwlRunLog.swift DisplayAccess/Owl/OwlHEVC.swift DisplayAccess/Owl/OwlLocation.swift DisplayAccess/Owl/OwlAssist.swift "$tmp/main.swift"
rm -rf "$tmp"
"$out"
