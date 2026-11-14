#!/bin/sh
# Runs the tests of the flow rules that need no glasses and no simulator (OwlRunLog.swift).
set -eu
cd "$(dirname "$0")/.."
out="${TMPDIR:-/tmp}/owl-run-tests"
# main.swift so the test file can use top-level code.
tmp="$(mktemp -d)"
cp Tests/OwlRunTests.swift "$tmp/main.swift"
swiftc -swift-version 6 -o "$out" DisplayAccess/Owl/OwlModels.swift DisplayAccess/Owl/OwlRunLog.swift "$tmp/main.swift"
rm -rf "$tmp"
"$out"
