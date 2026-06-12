# Harbour Detail View — Enhancement Plan

> **Status:** Part A first pass implemented (items 1, 3–9, 11, 12; item 2
> still waits on survey data). Part B implemented through all three rungs:
> tier probe + tier-0 fallback page, Rung 1 extrusion diorama + auto-tilt,
> Rung 2 shader water with sun-glints and chop (`harborwater.js`), Rung 3
> opt-in living harbour (`harbor3d.js`, lazy-loads vendored Three.js).
> The living harbour now models the whole scene: high-fidelity period vessels
> (wales, gunports, tops, yards, bellied sails, ink rigging, pennants),
> a procedural period town (instanced gabled row-houses fronting each block,
> churches with spires, fort ramparts from the surveyed polygons with ensigns,
> batteries, gallows), and hachured hill topography where geography has it
> (Nassau's ridge, Tortuga's mountain, the heights above Havana, La Popa at
> Cartagena) — ships and relief at symbolic scale, buildings at true footprint
> scale, as the period chartmakers had it.
>
> **Town rebuild (prompt 9):** the scene graph moved to `harbortown.js`
> (`harbor3d.js` keeps ships, water and lifecycle, untouched). New: streets,
> plazas and Batavia's canals laid as textured WebGL ground (cart ruts,
> cobbles, stone quays); planked wharves on piles with cranes, bollards and
> cargo; forts rebuilt with battered masonry ramparts, merlons, Spanish
> garita sentry boxes / corner towers, and guns run out over the parapet;
> relief sculpted with two undulation octaves, height-coloured slopes
> (sand→scrub→rock) and leaning palms; landmark churches and halls drawn a
> touch over scale. maxZoom rose 16.2 → 17.6 and a level-of-detail tier
> (z ≥ 14.7) reveals dormers, doorsteps, hanging tavern signs, plaza wells
> and wharf cargo only when the camera is close. The Rung-1 extrusion slabs
> hide while the modelled town is up. Street-front housing is stride-sampled
> so every Havana/Cartagena street gets its share of the housing budget.
>
> **Zoom-artifact fix (prompt 10):** the scene shimmered and crawled while
> zooming because absolute mercator coordinates (magnitude ~0.5) were
> reaching the GPU in float32, which only resolves ~1.5 m at that scale —
> every frame of camera motion cancelled differently. Both custom layers now
> render relative to the map centre (`applyCamera` in harbor3d.js folds
> T(ref) into the projection matrix in JS double precision and stands the
> camera at ref); water-sheet vertices are local to their box; and every
> instanced mesh lives under a per-harbour anchor group with small
> local-metre instance matrices (`anchorAt`/`addInst` in harbortown.js).
> Street crossings also z-fought at one shared height — ribbon heights are
> now staggered 0.10–0.20 m.
>
> **Deeper zoom + vegetation (prompt 11):** maxZoom rose 17.6 → 18.6. The
> towns grew green: broadleaf shade trees (northern ports) and palms (the
> Spanish Main; Tortuga takes both) fill the gaps left in street frontages,
> block yards and garden courts, and ring every plaza; the greens render a
> grassed cloth distinct from trodden fort courtyards, scattered with
> close-zoom grass tufts; the hills carry scrub bushes above their palm
> line. All instanced under the harbour anchors (~830 trees, ~170 bushes,
> ~900 tufts).
>
> **Default-on:** the Living Harbour now raises itself automatically at
> gfx tier ≥ 3 — the cartouche checkbox became the remembered opt-out
> (it was originally opt-in, which read as "the harbour looks flat" to
> anyone who never found the toggle).
>
> **Density & shoreline clipping (user feedback):** the un-surveyed
> countryside was bare parchment and shoreline houses flickered "in
> waves". (1) The land polygons now carry stippled groves and scrub
> (~30k instanced trees, ~10k bushes) clumped across the country, kept
> clear of the town grid, plazas and hills, and thinning to bare sand
> within ~35 m of the waterline — the beach reveals itself as the
> period engravers drew it. (2) The flicker was the animated water
> sheet: it spans land too (masked only visually), and crests rising
> above datum wrote depth that clipped house bases wave by wave — the
> swell now stays wholly below the chart datum. Town density also rose
> (~3,900 houses; deeper block infill), and the close-zoom detail tier
> starts at z 14.2.
>
> **Level-of-detail forest + canopy (user feedback, researched).** Asked to
> hide the ugly blocks, vary the greens, clump the trees, and carry an order
> of magnitude more of them via a SpeedTree-style LOD. Research: SpeedTree
> renders near trees as geometry, mid as simplified meshes, far as billboard
> impostors, culling off-screen — the WebGL analogue is InstancedMesh + an
> octahedral/​billboard far tier + frustum culling (three.js forums render
> 200k this way). Forest ecology models clumping as a Thomas/Poisson cluster
> process (cluster centres + Gaussian spread). Implemented:
> - **Blocks hidden** — when the Living Harbour is up, the flat `hb-block*`
>   fills (and the Rung-1 slabs) switch off; the modelled houses stand alone.
> - **`harbortrees.js`** — a LOD tree field. The town builder emits a flat
>   spec list (no per-tree InstancedMesh); each frame it is frustum-culled
>   and distance-bucketed into near (trunk+crown geometry), mid (billboard
>   cross) and far (single billboard sprite) InstancedMeshes whose live
>   counts are rewritten — one draw call per tier per kind, instance matrices
>   kept centre-relative for precision. ~120k trees in the field, only the
>   visible few thousand drawn.
> - **Greens varied** — per-instance HSL jitter over several base hues per
>   species (palm/leaf/scrub), so no two crowns match.
> - **Clumping + continuous canopy** — groves placed by a Thomas process, but
>   the real density comes from a **canopy ground layer**: instanced green
>   tiles cover all countryside, held off the town grid and hills and faded
>   out within ~22–55 m of the waterline, so the inland reads as unbroken
>   woodland that *reveals the bare-sand beach* at the shore (the Cities-
>   Skylines look the feedback asked for), trees riding on top for relief.
>
> **Canopy polish (user feedback).** Four refinements to the ground layer:
> the tile texture is now near-white/neutral so the per-tile instanceColor
> drives the hue (it was a green texture × green tint = double-dark); tiles
> *taper* from large in the heart of the wood to small at the rim, so the
> margin is fine and ragged instead of a jagged wall of big squares; the
> tint lerps from green in the interior to sand at the edge for a soft
> shore/town blend; and the bare skirt around each hill is ruffled with
> angular harmonics so it is no longer a tell-tale clean ellipse.
>
> **Hills (user feedback).** Broad, low mounds were invisible and the bare
> skirt around them showed as an ellipse. Fixes: (1) **retuned the hill
> footprints** — height spread over kilometres reads as nothing, so Tortuga
> is now a compact turtle-back mountain, Nassau gets a real ridge behind the
> town, Havana keeps two tighter knolls (only compact, tall footprints
> silhouette under the map's 60° max pitch). (2) **Draped the canopy up the
> slope** — green tiles laid on the hill surface (same u,v→world map as the
> mesh, lifted to its height) below a bare rocky tree line, so the hill is
> forested and the elliptical void is gone. (3) **Made the hill opaque** —
> it had `transparent:true` with an alpha-skirt texture, which rendered the
> whole slope see-through; the draped canopy now covers the base instead.

*Response to prompt.txt entries 3–4. Diagnosis: the harbor data is rich (50+
features per plan: streets, blocks, forts, wharves, shoals, ships) but the
rendering is thin flat fills on empty parchment. At harbor zoom the isochrone
color fades out by design and the global land hatching is hidden under the
harbor blanket — and nothing replaces them, so the screen is ~90% blank beige.
Period harbor plans (Moll, des Barres — the genre this chart imitates) are
dense with texture exactly where this view goes empty.*

The plan has two halves: **Part A** (2D engraved fidelity — the baseline art
that must work everywhere) and **Part B** (WebGL/3D enhancements layered on
top, each with a graceful downgrade). Part A is also Part B's fallback: every
3D feature degrades to the 2D engraved plan, never to a blank screen.

---

## Part A — 2D engraved fidelity (baseline)

Ordered by impact-per-effort.

### The water (the biggest void — ~70% of the screen)

1. **Water-lining** *(small)* — 2–3 concentric ink lines hugging the coast,
   each fainter and further out; the signature look of every engraved harbor
   chart. Line layers under the `hb-land` fill using `line-gap-width`.
2. **Soundings & anchorages** *(medium, needs survey data per harbor)* —
   scattered depth numerals in fathoms (IM Fell italic, e.g. "3¼"); anchor
   glyphs at holding grounds. Deferred until depth data is compiled.
3. **Shoal stipple** *(small)* — dot-stipple `fill-pattern` (same
   generated-canvas trick as the existing `land-hatch`) over the shoal tint,
   keeping the madder dashed edge.

### The town fabric

4. **Engraved blocks** *(small)* — raise block opacity, 45° hatch pattern,
   and a 1px darker line translated SE so blocks cast the conventional
   engraved shadow.
5. **Land hatch at harbor zoom** *(small)* — apply the existing `land-hatch`
   pattern to `hb-land`.
6. **Street names along streets** *(medium)* — all 12–14 streets per harbor
   carry names in the data but never render. DOM labels at street midpoints,
   rotated to the street bearing, IM Fell italic, declutter-registered
   (PBF glyph fonts can't serve IM Fell, so no symbol layer).

### Chart furniture (cheap, high charm)

7. **Per-harbor compass rose + scale bar** *(small)* — small rosette and a
   segmented "Scale of One Mile" bar placed in open water (corner chosen by
   point-in-polygon test against the land rings), gated to z≥11.
8. **Fort emphasis** *(small)* — bolder double outline (`line-gap-width`)
   and slightly deeper madder wash on the star forts.
9. **Ship dressing** *(small)* — anchored ships get a faint ripple ring and
   read slightly larger at close zoom.
10. **Hill hachures** *(medium-large, needs terrain data)* — radiating
    hachure strokes for Nassau's ridge and Havana's hills. Deferred.

### Polish

11. **Blanket seam** *(small)* — widen/soften the blur ring where the plan
    hides the coarse Natural Earth coastline.
12. **Reveal choreography** *(small)* — stagger the zoom-fade per layer:
    ink lines draw in first (z 8.8–9.4), color washes follow (z 9.4–10.2),
    so the plan "draws itself in" on descent.

**First pass = items 1, 3, 4, 5, 7, 8, 9, 11, 12 (+6).** Items 2 and 10 wait
on data.

---

## Part B — WebGL / 3D enhancements ("game-level" path)

MapLibre GL is already WebGL; these rungs climb from map-native 3D to a full
scene graph. Aesthetic rule: **paper diorama, not photorealism** — parchment
extrusions with ink edges, so 3D deepens the engraved identity instead of
fighting it.

### Rung 1 — Tilted paper-diorama town *(days; no new dependencies)*
- `fill-extrusion` layers for blocks, forts, churches (data is already
  polygonal); plausible heights by kind.
- Camera pitch unlocked only at harbor zoom (z≥11); cinematic ease to ~55°
  pitch on harbor entry, flat again on leaving ("the chart lifts off the
  table").
- Sun-consistent `fill-extrusion` shading; lantern night mode tints it.

### Rung 2 — Custom shader water *(week-scale; WebGL2 preferred)*
- A `CustomLayerInterface` layer rendering animated engraved wave-lines
  (drifting ink ripples near shore), replacing the static water-lining
  *visually* while it remains underneath as the fallback.
- Optional atmosphere pass at harbor zoom (dusk + lantern get richer).

### Rung 3 — Three.js scene layer *(weeks; opt-in, lazy-loaded)*
- threebox/Three.js custom layer sharing the MapLibre camera: glTF rigged
  ships at anchor with sail/flag animation, real lighting and shadows,
  battery smoke. Asset creation (stylized paper-ship models) is the real
  cost, not integration. Vendored as a single file; loaded only on demand.

### Graceful degradation (required for every rung)

One capability probe at boot, published as `carta.gfx = { tier, reasons }`;
every Part B feature gates on the tier and demotes silently on any runtime
failure (try/catch around layer add + render; a failing layer is removed,
never retried in-session).

| Tier | Detection | Experience |
|---|---|---|
| 0 — no WebGL | `canvas.getContext('webgl')` probe fails | MapLibre cannot start at all today. Show a styled parchment fallback page: title, port list, a static engraved chart image, and a note ("this chart wants WebGL"). No blank screen, no console-only failure. |
| 1 — software / weak GL | `WEBGL_debug_renderer_info` reports SwiftShader/llvmpipe/Mesa-soft, or first-seconds frame-time probe is poor, or `prefers-reduced-motion` | Full **Part A** 2D engraved plan. Pitch stays locked, no extrusions, no shader water. (Particle FX already self-shed via flowfx's frame-EMA.) |
| 2 — healthy WebGL1 | default | Rung 1: extrusion diorama + tilt camera. Water stays 2D-engraved. |
| 3 — WebGL2 + healthy | `getContext('webgl2')` succeeds + tier-2 checks pass | Rung 2 shader water replaces static water-lining visually (static lines remain underneath — if the custom layer throws, removing it restores the engraved look with zero work). |
| 4 — opt-in | user toggle ("A Living Harbour"), tier ≥ 3 | Rung 3 Three.js ships. Any load/init failure → silent fall back to tier 3/2; the toggle reports "the harbour sleeps" rather than erroring. |

Additional rules:
- **2D-first invariant**: Part A layers are always present; 3D layers are
  additive overlays. Removing every Part B layer must leave a complete chart.
- **User override**: a settings affordance to force a lower tier (persisted
  in localStorage with the other ordnances), for battery or taste.
- **Reduced motion**: caps animated water and ship animation regardless of
  tier (consistent with intro/ripple/sealife behavior).
- **No mid-session thrash**: tier is decided once at boot; runtime failures
  demote specific features, never re-probe in a loop.

### Suggested order
Part A first pass → Rung 1 (+ tier probe, which Part A also uses for the
Tier-0 fallback page) → Rung 2 → Rung 3 as a separate, opt-in project.

---

## Rebuild: the harbour as a rotatable diorama (standalone artifact)

Rung 3 was rebuilt as a **standalone 3D artifact**, disconnected from the map.
A separate full-screen Three.js canvas builds the island in **metres at the
world origin** and orbits it 360° with `PerspectiveCamera` + `OrbitControls`
— so the harbour reads at eye level, and the small local coordinates retire
the float32 shimmer entirely (no more mercator projection plumbing).

- **`web/js/harbordiorama.js`** (new) — the host: own canvas/renderer/camera,
  `OrbitControls` (360° azimuth, polar clamped above the water), fade + camera
  tween transition, `open(id)`/`close()`, lighting (`HemisphereLight` +
  `DirectionalLight` sun with `PCFSoftShadowMap`) and a CSS vignette. Entered by
  a **"View Harbour ⚓"** button (over a port) and **auto-enter past z≈14**.
- **`web/js/harborterrain.js`** (new) — the land: a heightfield draped over the
  real coastline polygons (`carta.harborStructures.lands`); offshore it dips
  below sea level so a flat shader-water sheet cuts a clean shoreline. Colour
  ramps light **sand at the beach → grass inland → rock on the heights**, with a
  surf band at the waterline. Owns the authoritative `HILLS` relief table
  (Tortuga's turtle-back, Nassau's ridge, Havana's knolls, Cartagena's La Popa).
  Water = `ShaderMaterial`, the swell trains from the old `makeWaterLayer`
  ported into a vertex shader + a fresnel rim.
- **`web/vendor/OrbitControls.module.js`** (new, three **r160** to match the
  vendored core) + an import map in `index.html`.
- **`harbortown.js`** — `build(S, frame)`: when a metric `{ project, heightAt }`
  frame is injected, `groundMatrix` places the whole town in origin-metres
  anchored to the terrain (a Y/Z swap + −Y flip, det +1 so winding holds);
  the hill-mounds and flat canopy-ground tiles stand down (terrain owns them).
  Legacy mercator path retained but now unused.
- **`harbortrees.js`** — `cartaTreeSystem(THREE, frame)` + `update(camera)`: the
  SpeedTree-style LOD now keyed to the orbit camera, with **camera-facing
  billboard** vertex shaders (the map path relied on a locked bearing); bands
  scaled to the island so the whole wood reads at rest and near trees gain real
  geometry on dolly-in. Trees climb the hills via `heightAt`.
- **`harbor3d.js`** — the map-embedded custom layers + toggle were removed; what
  remains is the shared **`window.cartaShipwright(THREE)`** factory (materials /
  `buildProto` / `shipInstance`), reused by the diorama.
- **`harbors.js`** — added the entry button + auto-enter; reverted the slab- and
  mark-hiding that the old in-map 3D needed. The flat plan, extrusion slabs and
  Rung-2 ink water stay as the map's in-place preview.

Gated at `gfx.tier ≥ 3`; below that the button is absent and the map behaves as
before. Verified across tiers (zero console errors) and visually at Port Royal,
Havana, Tortuga and Cartagena.

---

## Diorama enhancement pass (eight asks)

1. **Dynamic tree density on zoom** — each tree carries a stable `rank`; the
   metric LOD now reveals a fraction that rises from ~0.45 (wide) to 1.0 (close),
   so the viewport fills with more trees as you dolly in (`harbortrees.js`).
2. **Birds** — `web/js/harborbirds.js`: ~52 low-poly gulls with flapping wing
   triangles wheeling on circular/figure-eight paths over the harbour, banking
   into turns; drawn a touch out of scale (like the ships) to read at range.
3. **POI markers + cards** — `web/js/harborpoi.js`: every named work (forts,
   churches, public buildings, batteries, wharves, gallows, greens) and every
   ship gets a DOM marker (glyph + name) projected world→screen each frame, with
   a hover/click card carrying the period note. Names/notes come straight from
   `data/harbors/*.json` via `carta.harborPlans`. A **Labels** toggle on the
   artifact window. Year-filtered like the chart.
4. **Reflections + shimmer + bloom (behind Studio light)** — the water shader
   gains a `uShine` path: sky reflection, a moving Blinn-Phong **sun glitter**,
   and high-frequency **shimmer**; plus a real **bloom** post-pass (vendored r160
   `EffectComposer`/`RenderPass`/`UnrealBloomPass` under `web/vendor/jsm/`). All
   of it rides the Studio-light toggle — straight render with no post cost when off.
8. **Ships carry class/capacity** — `SHIP_SPECS` by type (researched period
   figures) with name/note overrides for the named vessels (Capitana, Almiranta,
   VOC Retourschip, Fourth-rate/station ships, guarda-costa, register ship); the
   ship card shows class · guns · crew · tons + its own note.
5. **BUG fixed: clusters follow the streets** — block-infill houses now orient to
   the nearest street (`nearestStreetAngle`, common metric frame) instead of the
   block's main axis ± random 90° (`harbortown.js`).
6. **Curvy streets** — `ribbonGeo` resamples the centreline through a centripetal
   `CatmullRomCurve3` with gentle width variation when building the diorama town,
   so roads meander with character instead of long rectangles.
7. **High-poly near trees** — the NEAR tier uses a higher-poly build (more sides,
   individual palm fronds, broadleaf boughs); kept framerate-safe by a tight
   near cap + frustum culling, so only the close handful are ever high-poly.

All gated at `tier ≥ 3`; verified across tiers at Havana / Cartagena / Tortuga /
Port Royal with zero console errors.

## Diorama polish pass (five asks)

1. **Fewer, finer gulls.** Flock halved (52 → 26) and each gull rebuilt at ~4×
   the detail — higher-res body/head, a beak, a fanned tail, and swept
   multi-segment wings with camber (`harborbirds.js`).
2. **Slower birds.** Glide speed and wingbeat roughly halved for a lazier,
   more convincing wheel.
3. **Streets fade out.** Curvy ribbons no longer stop at a hard square edge:
   `ribbonGeo` now pinches the lane width in and fades a per-vertex alpha to
   zero over the last ~18 m of each end (diorama street material → vertexColors
   RGBA, transparent, no depth-write). Roads and trails dissolve naturally
   (`harbortown.js`).
4. **Golden hour.** The whole diorama is lit as an evening — a low warm sun
   raking long shadows, peach sky + warm distance fog, a dusky-gold PMREM env,
   and a water shader that now reflects a real golden sun (broad warm sheen +
   sharp glitter the bloom turns to glow + a horizon glow toward the sun's
   azimuth), all tinted by `uSunCol`. The water's `uSunDir` is pointed at the
   scene's actual sun (`harbordiorama.js`, `harborterrain.js`).
5. **Townsfolk on the streets.** Prototyped in `harborpeople.js` (walking
   low-poly figures pinned to the ground via `frame.heightAt()`) but **removed**
   on review — the figures read as ugly at the diorama's scale. The module is
   deleted and no longer loaded.

Verified at tier 3 (Havana) with the golden-hour glow on the water and faded
street ends, and zero console errors; tier 1/2 fallback re-checked intact (no
diorama, map + extrusions + Rung-2 water preserved).

## Canoe tour — bug-fix pass

1. **No water inside the hull.** The open U-hull let the sea sheet show through
   from inside. Added a continuous, opaque **floorboard** sealing the interior
   just above the waterline (`floorGeometry`) and raised the boat's `DRAFT` to
   0.5 so the floor stays above the swell through the whole wave cycle — the
   outer hull still dips under, so she sits *in* the water, but the bilge reads
   as dry planks. Verified by an offscreen down-look render: the floor samples
   are wood, never water.
2. **Detailed near birds.** Exposed the flock's detailed gull from
   `harborbirds.js` (`gull()`) and the canoe now reuses it for its close
   companions (≈1.5 m span) instead of the 2-triangle placeholder.
3. **Ships sit on the water.** Anchored ships were pinned at a fixed `y` ≈ 1 m
   above the real (wave-displaced) surface. Added `terrain.waterAt(x,z,t)` (the
   CPU twin of the water vertex shader) and the diorama now floats each ship on
   that swell each frame, tilting with the surface — so they ride the waves
   instead of hovering. The canoe floats on the same `waterAt` (one source).
4. **Speed control.** Tour HUD gains −/+ buttons (and the scroll wheel) that
   scale a cruise speed by ×1.5, clamped 0–6 km/h; the canoe eases to it.
5. **Near foliage refines.** In tour mode the diorama feeds a small `camDist`
   so the tree LOD promotes nearby trees to their hero (max-poly) tier.
6. **Keys.** W rows forward, S/D reverse (the gaze still steers); the canoe
   supports reverse (negative way).

Reused models where they existed (the gull); generic per-object 10× LOD for
houses/ships is not implemented (no LOD pipeline for those). Verified at tier 3
with zero console errors; tier 1/2 fallback intact.

## Canoe tour — second bug-fix pass (water, ships, HD detail)

1. **Dry hull from EVERY angle.** The floorboard sealed the midships but
   tapered out near bow/stern, so the sea sheet still peeked inside the end
   wedges at glancing angles. Added an invisible **depth lid** spanning the
   whole hull opening (`lidGeometry`: full half-beam at every station,
   `colorWrite:false`, renderOrder 0.5 — after the opaque interior, before the
   transparent water) so every water fragment inside the hull volume fails the
   depth test, whatever the camera does. Verified by an offscreen leak scan
   over 7 pitches/yaws (down, bow-steep/glance/low, stern, both sides):
   **0 leaked water pixels in 81 samples per view**.
2. **Hero birds within 50 m.** New `heroGull()` in `harborbirds.js` — a
   real-bird low-poly seagull in the spirit of the classic game asset: white
   faceted body, grey mantle, two-jointed wings (the outer "hand" flaps with a
   lag), black wingtips, orange bill with the hooked tip, eyes, fanned tail,
   tucked orange feet (~860 tris). The canoe's companions use it outright, and
   every flock bird swaps to its hero twin inside 50 m of the seated viewer
   (verified: swap-in and swap-out both fire).
3. **Ships were authored one hull-height in the air.** The real root cause of
   the "ships floating" reports: the symbolic protos in `harbor3d.js` placed
   the hull extrusion (which runs UP from the mesh origin) at `position.y = H`,
   so every hull's keel sat exactly H×3.4 ≈ 8–13 m above its anchor point —
   measured empirically (sloop hull world-y ∈ [7.96, 15.91] before, [0, 7.96]
   after). Fixed the proto authoring (hull/edges to the keel line, quarterdeck
   onto the deck, ring riding the new waterline) and the diorama now sinks each
   ship draft-deep (0.22·H) into the per-frame swell. Screenshot-verified from
   9 m above the water: hulls meet the waterline.
4. **Speed on the arrows.** The −/+ HUD buttons are gone; ↑ steps the cruise
   ×1.5 up, ↓ steps it down (still clamped 0–6 km/h, scroll wheel still works,
   readout stays). Verified via dispatched key events: 0 → 1.2 → 1.8 → 1.2.
5. **Ultra tree tier.** `harbortrees.js` gains a fourth LOD band: trees within
   130 m of the camera take a new max-poly hero build (palms: 14-side trunk,
   12 blade fronds in two droop tiers, coconut cluster, frond-base collar;
   leaf trees: 16×12 crown, four boughs with clumps, under-crown fill, root
   flare; scrub: triple clump). Verified: 72 ultra-tier trees drawn standing
   in the Havana wood.
6. **W/S only.** D no longer reverses (verified: holding D moves the boat
   0.00 m; W and S move it at the 1 : 0.55 thrust ratio).
7. **High-definition period vessels.** New `harborshiphd.js`: fully-modelled
   ships of 1650–1730, researched from the period record — the merchantman as
   a Dutch **fluyt** (pear-section hull with pronounced tumblehome, rounded
   high stern, square fore & main, lateen mizzen), the sloop as a
   **Bermuda/Jamaica sloop** (single raked mast, big gaff main, long steeved
   bowsprit, two jibs, tiller), a brigantine, and a two-decker **man-of-war**
   (beakhead, gilded figurehead, quarter galleries, three stern lanterns,
   14 guns a side). Sea-of-Thieves-leaning art direction: weathered procedural
   plank textures, glowing stern windows, warm lantern point light. Lofted
   hulls (30 stations), real wales, keel/rudder/anchor, fighting tops,
   crosstrees, shrouds **with ratlines**, deck clutter (4–6 k tris each).
   Authored keel-at-origin on the same SYMBOLIC_SCALE footprint, so in tour
   mode any anchored mark within 150 m of the canoe swaps seamlessly to its HD
   twin (hysteresis 150/175 m, ≤3 live, lazily built & cached). Verified: the
   swap shows the HD vessel and hides the symbolic one, and all five types
   build clean.
8. **Realistic water around the boat.** A 72 m high-detail water patch rides
   with the canoe (120×120 grid, renderOrder 2): the SAME three swell trains
   as the sheet & physics (stays in phase), plus short chop, scrolling
   high-frequency ripple normals, a fresnel blend from deep teal to the golden
   horizon, and a Blinn-Phong sun glitter — the standard "pretty water"
   recipe, fading to nothing at its rim so it melts into the base sheet. Wake
   foam re-ordered above it.

Verified end-to-end at tier 3 (0 console errors) plus the full tier-1/2/3
regression and the prior canoe physics harness (cruise settles at 1.0 m/s).

## Canoe tour — third pass (birds, trees, shore, minimap)

1. **Birds rebuilt to the reference.** One seagull model now serves every bird
   at every distance (no more paper-dart flock model): flat-shaded plump white
   body, raised neck and head, yellow-orange bill with the hooked tip, eyes,
   LONG narrow angular two-jointed wings — light grey above with BLACK
   fingered tips (notched primaries) — short white fan tail, tucked orange
   feet (~900 tris; 26 birds is still trivial).
2. **Birds flew in reverse.** `Object3D.lookAt()` points an object's **+Z**
   at the target, but the gulls are authored nose-toward-−Z — every bird flew
   tail-first (the old spherical body hid it). Flight code now looks at the
   MIRROR of the next path point (flock and canoe companions both); verified
   across 26 birds × 3 path moments: 78 beak-first, 0 reversed.
3. **Nine tree silhouettes.** The lollipop wood is gone: coconut palm (leaning
   curved trunk, drooping fronds, coconuts), royal palm (tall straight trunk,
   green crownshaft, upswept crown), broadleaf (boughs + irregular clustered
   crown), canopy giant (ceiba-like flat tiers, buttress roots in ultra),
   spreading acacia (forked trunk, wide flat top), column cypress (stacked
   cones), dead snag (bare reaching branches), bush scrub and sea-grape
   mounds. Every tree picks its variant from a stable position hash (separate
   from the reveal rank, so all variants appear at all distances); geometry
   tiers are now per-variant, billboards stay per base kind. Verified: 24
   distinct live tier geometries drawn around the island.
4. **Shore grass.** The canoe module scatters instanced grass tufts (crossed
   alpha-tested blade sprites) along the shore within ~42 m of the boat —
   greener near the wet sand, drier straw higher, and standing reeds right at
   the waterline. Cells hash deterministically from world position so
   re-seeding as the boat moves never pops a tuft. Verified: 380 tufts at a
   beach approach; screenshot shows the grassy hem and reeds.
5. **Tour minimap.** Bottom-left while touring: a small engraved chart of the
   harbour (parchment land from the surveyed coastline rings over a verdigris
   sea, anchored ships as dots, neatline + N arrow) with a red canoe arrow
   tracking position AND heading at ~7 Hz over a pre-rendered base. Verified:
   visible in tour, painted, and the arrow follows the boat (east→right,
   north→up).
6. **(Found en route)** POI labels (z-index 4, clickable) could drift over and
   steal clicks from the diorama buttons (z-index 3) — all interactive
   controls now sit at z-index 5.

Verified at tier 3 with zero console errors; full tier-1/2/3 regression green.

## Birds — sculpted seagull (reference-fidelity pass)

The user supplied four reference renders of an artist-made low-poly seagull;
ours (assembled from scaled sphere/cone/cylinder primitives) didn't compare.
Root causes identified: primitive composition with visible seams vs ONE
sculpted hull; regular UV-sphere tessellation vs irregular jittered facets;
rectangle wings vs true planform with feathered edges.

Rebuilt procedurally in `harborbirds.js` (per the approved plan; asset-vendor
fallback was prepared but not needed):
- **Sculpting toolkit**: `loft()` (section-lofted hulls with hash-alternated
  triangle diagonals), `sheet()` (wing/tail surfaces with cambered mid-row and
  SCALLOPED trailing edges), `finger()` (separated primary feathers), and
  `facet()` — deterministic vertex jitter while indexed (no cracks), exploded
  to per-face vertices, flat normals, and per-FACE colour with facet-to-facet
  value variation: the "low poly art" treatment.
- **The gull**: one continuous body hull bill-base→skull→neck→breast→tail
  (12 stations × 10), grey saddle; yellow lofted bill with hooked tip and red
  gonys spot; black eyes; scalloped white fan tail; tucked feet; two-jointed
  wings with true planform (chord grows to the wrist, hand sweeps back to a
  point), scalloped secondaries, five separated black primary fingers, black
  tip fringe with two white mirror spots. ~600 tris; single flat-shaded
  vertex-coloured material.
- Flight logic untouched (mirror-lookAt fix, banking, wrist-lag flap all kept).

Quality gate: side-by-side renders at the reference framings (side glide,
top-¾, close-¾) iterated 3 rounds → `/tmp/gull_compare_v3.png`. In-scene tour
and flock verified; 78/0 beak-first; colour story (black tips, yellow bill,
white body, red spot) verified from vertex colours; tiers 1/2/3 regression
zero errors.
