# Carta Temporum — an isochronic chart of the sailing world, 1650–1730

An interactive map of **real sailing times** at the height of the golden age of piracy.
Pick a port — Nassau, Port Royal, London, Île Sainte-Marie, Batavia, any of 67 — and the
chart draws **isochrones**: bands of equal sailing time (7 days … 180 days) computed from a
physical model of the age-of-sail wind system, calibrated against documented 1690–1740
passage records.

And the chart is alive:

- **Sail a voyage**: pick a port, click "⛵ Sail a voyage hence…", choose a destination —
  the engine lays the time-optimal course and an engraved ship sails it before your
  eyes, slowing in the doldrums and flying in the forties, trailing a madder wake, with
  a running day-count and a captain's log ("Crossed the Line; Neptune came aboard…").
  Voyages are shareable: `#voyage=p.nassau~p.london`.
- **Right-click anywhere at sea** to chart isochrones from that exact point of ocean —
  no port required.
- **The dividers**: a period measuring tool — prick two points, get leagues, nautical
  miles, and the model's sailing time *both* ways (45 days thither, 36 back: the wind
  is no man's servant).
- **A Living Sea**: ink-particle trade winds and currents streaming across the chart,
  isochrone bands that ripple outward when you pick a port, and an optional
  WebAudio-synthesized soundscape of surf, rigging creaks and gulls.
- **History pulses**: 38 dated events (battles, sacks, hurricanes, hangings) flare on
  the chart as the timeline crosses them; scrub past June 1692 and two-thirds of Port
  Royal sinks into the harbor before your eyes. Click any pirate ship to unfurl its
  whole career as a dated trail.
- **Three guided Tales**: Morgan & the Sack of Panama, the Pirate Round, and the
  Wrecks of 1715 — camera-and-timeline story rides, cancelled by a touch of the map.

Also on the chart:

- **A draggable timeline, 1650–1730** ("The Years of the Brethren"): drag the year and the
  chart changes with it — kingdoms repaint to the decade's borders, fleet stations
  redeploy, pirate cruising grounds bloom and collapse, wrecks appear only once they have
  sunk, and 29 documented pirates cruise the seas along their researched seasonal tracks.
  Hover a pirate ship for the dossier: ship, colours flown (graded *documented / by
  tradition / unknown*), crew and notable shipmates, prizes and lading, fate, and a period
  portrait.
- **Five chart overlays** ("Ordnances of the Chart"): Kingdoms & Empires (78 territorial
  features across 16 powers, decade-resolved), Trade Winds (pilot-chart arrows of the
  model's wind belts, with calm stipple in the doldrums), Currents (20 named currents
  sized by drift), Men-of-War (113 standing naval stations by decade), and Pirate Waters
  (60 danger zones tracing piracy's rise and collapse).
- **Eight harbors charted at street level** (Nassau, Port Royal, Tortuga, Havana,
  Charleston, Cartagena, Bridgetown, Batavia): zoom in and the coarse coastline gives way
  to a georeferenced town plan — streets, blocks, star forts, batteries, wharves,
  churches, canals, gallows, and ships riding at anchor — built from period surveys and
  surviving colonial street grids. Nine more harbors carry typed point annotations.
- **Major pirate havens** with full dossiers: population, defences, trade, an annals
  timeline, and period engravings.
- **18 great shipping roads**: the Atlantic passages, flota and galeones tracks, the
  triangular trade, the VOC Brouwer route, both legs of the Manila galleon, the Mocha
  pilgrim fleet, the Pirate Round.
- **32 real shipwrecks** (Whydah Gally, Queen Anne's Revenge, the 1715 and 1733 plate
  fleets, San José…) with "Ship's Manifest" hover cards: a period-voiced epitaph, souls
  aboard and lost, documented cargo manifest, treasure values, salvage history and depth.
  Crowded wrecks fold into "×N" medallions that spread on zoom; positions are
  symbol-coded by archaeological precision; engraved gulls wheel over wrecks lost within
  living memory of the chart's set year.
- A detailed period basemap: Natural Earth coastlines at three scales, rivers, lakes,
  coral reefs, the 200 m soundings line, shelf tinting, engraved land texture, ~60 period
  sea and region names — with screen-space label decluttering so the chart stays legible
  at every zoom.

See `DATA.md` for the model, its sources, and the calibration table.

## Run

Requires Go ≥ 1.22. No other dependencies (MapLibre is vendored, coastlines are local).
Period illustrations are hot-loaded from Wikimedia Commons (all public domain, verified);
everything else works offline.

```sh
go run ./cmd/server            # serves http://127.0.0.1:8047
go run ./cmd/server -calibrate # print model-vs-history calibration table and exit
```

Isochrones are computed on first request per port (~2 s) and cached in `data/cache/`;
all ports are precomputed in the background at startup. Delete the cache after changing
the model.

## Architecture

- **Server** (Go, `cmd/server`, `internal/engine`): rasterizes Natural Earth coastlines
  into a 0.15° ocean grid, runs 16-direction Dijkstra with a wind/current/point-of-sail
  cost model, extracts isochrone polygons via marching squares, and serves GeoJSON over a
  small HTTP API (`/api/meta`, `/api/isochrone?port=…` or `?lon=&lat=`, `/api/route?from=&to=`
  for time-optimal sailing tracks, `/api/calibration`, `/api/wind`, `/api/currents`).
- **Frontend** (`web/`): MapLibre GL JS with a hand-built antique-chart style — parchment
  and ink, period typography (IM Fell), engraved-style SVG markers, paper texture and
  neatline. No build step. `app.js` owns the base chart and a shared module surface
  (`window.carta`, `window.cartaTime`); `overlays.js`, `timeline.js`, `harbors.js`,
  `voyage.js`, `dividers.js`, `flowfx.js`/`ripple.js`/`sound.js`, `events.js` and
  `tours.js` plug into it. `windmodel.js` is a client-side port of the Go wind/current
  model shared by the particle FX and the captain's log.

## Data

| File | Contents |
|---|---|
| `data/ports.json` | 67 ports c. 1730 with nation, role, history, population, defences, trade, annals |
| `data/routes.json` | 18 documented sailing routes with historically-shaped waypoints |
| `data/wrecks.json` | 32 wrecks (1622–1735) with positions, stories, sources |
| `data/wrecks_enrichment.json` | per-wreck depth, treasure, salvage, manifest, souls, epitaph |
| `data/passages.json` | 22 documented passage times used for calibration |
| `data/port_details.json` | typed close-zoom annotations for 17 famous harbors |
| `data/harbors/` | street-level GeoJSON town plans for 8 harbors (+ survey notes) |
| `data/overlays/` | kingdoms by decade, naval fleet stations, piracy danger zones (+ notes) |
| `data/timeline/pirates.json` | 29 pirates 1650–1730: seasonal tracks, crews, ladings, colours |
| `data/images.json` | 44 verified public-domain Wikimedia illustrations (ports, wrecks, pirates) |
| `data/events.json` | 38 dated events 1650–1730 (battles, storms, sacks, trials, the 1692 quake) |
| `data/tours.json` | 3 guided story tours with camera + timeline choreography |
| `data/land/` | Natural Earth coastlines, rivers, lakes, reefs, bathymetry (public domain) |
| `data/research/` | research notes & verification passes behind the datasets |
