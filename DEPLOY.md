# Deploying Carta Temporum to Cloudflare Pages

The app runs **fully static** — no server. The Go sailing engine is compiled to
WebAssembly and runs in a Web Worker in the browser. Named-port isochrones are
precomputed at build time; arbitrary sea-point isochrones and routes are
computed on demand in WASM.

## What the build produces

`./build.sh` writes everything to `dist/` (the publish directory):

| Artifact | What it is |
|---|---|
| `oldmap.wasm`, `wasm_exec.js` | the sailing engine (WebAssembly) + Go's JS loader |
| `grid.bin` | packed navigable ocean grid (~720 KB) the engine loads on init |
| `iso/<port>.json` | 67 precomputed port isochrones (served instantly on click) |
| `meta.json`, `wind.json`, `currents.json`, `flowmask.json`, `calibration.json` | the former `/api/*` endpoints, precomputed (pure functions of the model) |
| `js/`, `css/`, `vendor/`, `index.html` | the frontend |
| `data/` | static map data the page fetches (land, routes, harbors, …), minus the server-only cache |

`dist/` is ~500 MB raw but ~111 MB gzipped at the edge, and a visitor only
downloads the port isochrones they actually click (~1.5 MB gzipped each).

## Deploy (recommended: direct upload)

No git or Cloudflare build pipeline required.

```bash
./build.sh                                   # build dist/
npx wrangler login                           # one-time, opens browser
npx wrangler pages deploy dist --project-name oldmap
```

The first run creates the Pages project and prints the live `*.pages.dev` URL.
Redeploy by rerunning the two commands. (`wrangler.toml` sets
`pages_build_output_dir = "dist"`, so `npx wrangler pages deploy` with no args
works too.)

## Alternative: Git integration (build on Cloudflare)

Commit the repo (the `.gitignore` keeps `dist/`, build artifacts, and
`data/cache/` out of git — but `data/land/` etc. must be committed because the
build computes the grid from them). In the Cloudflare Pages dashboard:

- Build command: `bash build.sh`
- Build output directory: `dist`
- Environment variable: `GO_VERSION = 1.25.1`

Note the build runs ~2–3 min to compute the 67 port isochrones.

## Local preview of the static build

```bash
./build.sh
cd dist && python3 -m http.server 8055      # then open http://localhost:8055
```

(`go run ./cmd/server` still works for development too — it serves the same
static files, and the legacy `/api/*` handlers remain for the `-export` step.)

## Rebuilding artifacts only

```bash
GOOS=js GOARCH=wasm go build -o web/oldmap.wasm ./cmd/wasm   # engine
go run ./cmd/server -export web                              # grid.bin + *.json + iso/
```
