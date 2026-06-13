#!/usr/bin/env bash
# Builds the fully static site into dist/ for Cloudflare Pages.
#
#   web/        the static frontend + generated engine artifacts
#   dist/       what gets published (web/ + the data/ files the page fetches,
#               minus the server-only isochrone cache)
set -euo pipefail
cd "$(dirname "$0")"

echo "==> building WASM engine -> web/oldmap.wasm"
GOOS=js GOARCH=wasm go build -o web/oldmap.wasm ./cmd/wasm

echo "==> copying wasm_exec.js"
WE="$(go env GOROOT)/lib/wasm/wasm_exec.js"
[ -f "$WE" ] || WE="$(go env GOROOT)/misc/wasm/wasm_exec.js"
cp "$WE" web/wasm_exec.js

echo "==> exporting grid.bin, *.json, and 67 port isochrones (this computes; ~2-3 min cold)"
go run ./cmd/server -export web

echo "==> assembling dist/"
rm -rf dist
mkdir -p dist/data
cp -R web/. dist/
rm -f dist/rig.html        # dev-only diorama rig (driven by tools/rig.mjs), never shipped
rm -f dist/kitview.html    # dev-only building-kit grid viewer, never shipped
# Ship only the data the frontend fetches at runtime; skip the server cache.
rsync -a --exclude 'cache/' data/ dist/data/

echo "==> done. publish dir: dist/  ($(du -sh dist | cut -f1))"
