#!/usr/bin/env bash
# Builds owlboarding.com into one folder: the launch site (apps/owl-lens-site, static, no build step) at the root and
# the public Owl Studio demo (apps/owl-studio, sample data in the browser, no backend and no credentials) under
# /studio/. ADR-005. The earlier launch site, apps/owl-site, stays in the repo but is no longer built here.
#
#   infra/build-site.sh [out-dir]          # out-dir defaults to site-dist/ at the repository root; it must not exist
#   SKIP_INSTALL=1 infra/build-site.sh     # when npm ci already ran in owl-studio (the Site workflow)
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/site-dist}"

if [ -e "$out" ]; then
  echo "build-site: $out already exists; give a new folder or remove it first." >&2
  exit 1
fi

build() {
  local app="$1" script="$2"
  echo "build-site: $app ($script)"
  (
    cd "$root/apps/$app"
    if [ "${SKIP_INSTALL:-}" != 1 ]; then npm ci; fi
    npm run "$script"
  )
}

build owl-studio build:preview

mkdir -p "$out"
# The launch site is one static page with its model and clips; README.md is not published.
cp -R "$root/apps/owl-lens-site/." "$out/"
rm -f "$out/README.md"
if [ -e "$out/studio" ]; then
  echo "build-site: the launch site has its own studio/ folder; the Studio demo needs that path." >&2
  exit 1
fi
cp -R "$root/apps/owl-studio/dist-preview" "$out/studio"

# The two pages people land on must be there.
test -f "$out/index.html"
test -f "$out/models/owl-glasses.glb"
test -f "$out/studio/index.html"
grep -q 'Owl Studio demo' "$out/studio/index.html"
echo "build-site: $out ($(find "$out" -type f | wc -l | tr -d ' ') files)"
