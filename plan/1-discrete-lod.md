# Discrete LOD for the Harbour Diorama — Implementation Handoff

Status: **handoff-grade plan**. All file:line anchors below were re-verified against the
working tree on 2026-06-12 (post engine-extraction: `web/js/render/engine.js` exists,
`harbordiorama.js` is rewired through it). An implementer receiving only this document and
the repo should not need to re-research anything; every open decision is assigned with a
decision procedure (§7).

Target: improve visual fidelity at 60 fps, Three.js r160 (vendored,
`web/vendor/three.module.min.js`), vanilla-JS `window.carta*` IIFE modules, no bundler, no
npm in prod, painterly vertex-coloured low-poly aesthetic, deterministic builds,
`node test/run.mjs` stays green throughout.

**Locked decisions (do not relitigate):**
1. **Reference GPU = Apple M1 / NVIDIA GTX 1660 class.** That is the 60 fps certification
   target. The dev machine is an Apple **M4**, which substantially overestimates mid-tier
   headroom — see the derating policy in §5.0.
2. A **system-requirements fine-print line** is added to the diorama UI in Phase 0
   (task 0.A, fully specified below).

**Short answer to "are we already doing this?"** — Yes, in four independent, hand-rolled
systems (ships, trees, town clutter, gull articulation), one of which (trees) is genuinely
sophisticated. But: there is no shared LOD policy, no screen-space-error metric anywhere
(all thresholds are raw metres), only one of the four has hysteresis, none has a fade/dither
transition (every swap is a hard pop), one mechanism is dead code in the diorama (town
`lod[]`), one plumbing path is silently broken (`camDist` never reaches the tree updater —
§1.3), and the largest estimated draw-call cost in the scene (26 multi-mesh gulls,
~600 draws) has **no** geometric LOD at all.

---

## 0. Repo orientation for the implementer

Read this before touching anything. Everything here is verified against the current tree.

### 0.1 Module idiom

Every file in `web/js/` is a `'use strict'` IIFE (or a top-level function expression)
that publishes exactly one global: `window.cartaDiorama`, `window.cartaRenderEngine`,
`window.cartaTreeSystem`, `window.cartaTownBuilder`, `window.cartaHarborBirds`,
`window.cartaShipwright` / `window.cartaShipwrightHD`, `window.cartaTerrain`, …
There are **no ES modules** in `web/js` (the only ESM is the vendored
`web/vendor/three.module.min.js` and its addons, dynamically imported by the host).
New shared code follows the same pattern: a new file `web/js/render/lod.js` publishes
`window.cartaLod` and is added to the page's script list — **no** `import`/`export`.

Determinism is a hard rule: geometry/placement decisions never use `Math.random`. The
repo's idioms are sine-hash (`harbortrees.js:644`:
`(Math.sin(p.x*12.9898 + p.z*78.233) * 43758.5453) % 1`) and seeded integer hashes
(`hash2`, and `harbortown.js:781` `dhash(a, b, n)`). Any new jitter/selection logic must
use these, keyed on world position + a constant salt.

### 0.2 The host: `carDio` (harbordiorama.js)

`web/js/harbordiorama.js:46-47` — `const carDio = { active: false, open, close };
window.cartaDiorama = carDio;`. The host owns:
- DOM/UI (`ensureDom()` starts at `harbordiorama.js:51`; one injected `<style>` template
  literal `:53-175`; nodes created `:177-239`; `host.append(...)` at `:240`,
  `document.body.appendChild(host)` at `:241`).
- The **coordinate frame** contract handed to every content builder:
  `harbordiorama.js:456` — `const frame = { project, heightAt: null, centroid: c, radius }`,
  with `frame.heightAt = terrain.heightAt` filled at `:471`. `project(lng,lat) → {x,z}`
  metres about the port centroid (x east / z south, `:375-383`); `heightAt(x,z) → y`;
  `radius` = projected land-footprint radius in metres (`footprintRadius`, `:385`).
  **Every system that places things on land must use this same `heightAt`** — that
  consistency is an invariant (§6).
- Per-frame LOD inputs published on the global:
  - `carDio._camDist` — `:955` overview (camera→`controls.target` distance); `:940` tour
    (**hard-set to `built.radius * 0.18`**, intended to pin tree reveal at full density —
    but see the broken plumbing in §1.3).
  - `carDio._tourPos` — `:942` (canoe position in tour) / `:946` (`null` otherwise);
    consumed by the ships updater (`:527`) and the birds updater (`:580`).
- Mode cameras: tour `camera.fov = 70` (`:808`), overview `camera.fov = 38` (`:837`).

### 0.3 The render engine and the `animated[]` updater loop

`web/js/render/engine.js` (`window.cartaRenderEngine`, 236 lines) owns the
`WebGLRenderer` (created `:52-58`; `antialias: true` `:53`; **`setPixelRatio` capped at
1.8** `:54`; fov-38 `PerspectiveCamera` `:58`), OrbitControls, the PMREM env, the
per-radius rig (`configureForRadius` `:119-148`, fog at `:145` = `radius*3 .. radius*9`),
the bloom composer (`:153-162`), resize (`:211-218`), and the rAF loop:

```
engine.js:174  function frame() {
engine.js:182    preUpdateHook (host tween)
engine.js:186    controls.update()            // overview only
engine.js:188    modeHook / :189 frameHook
engine.js:190    for (const a of updaters) { try { a.update(t, camera); } catch …
engine.js:193    envOn && composer ? composer.render() : renderer.render(scene, camera)
```

The host registers its `animated[]` array via `eng.setUpdaters(animated)`; each entry is
`{ update(t, camera) }`. Existing updaters: trees (`harbordiorama.js:503` —
`trees.update(cam, carDio._camDist)`), ships (`:526-560`), birds (`:580`), water, canoe,
etc. **`engine.js:190` is the seam for the shared LOD context** (§3.2): a third argument
is additive and backwards-compatible (existing updaters ignore it).

### 0.4 Town instancing: `anchorAt` / `addInst` / `mark` (harbortown.js)

`window.cartaTownBuilder`. Inside its `build(structures, frame)`:
- `anchorAt(harbor, lngLat)` (`harbortown.js:726`) — re-anchors the depth-stable local
  origin per harbour before placing instances (kills zoom shimmer, comment `:719-725`).
- `addInst(geo, mat, specs, opts)` (`:761`) — creates one `InstancedMesh` from a spec
  list; if `opts.lod` is truthy it calls `mark(im)` (`:772`).
- `mark(mesh)` (`:718`) — `mesh.userData.lod = true; mesh.visible = !!frame; lod.push(mesh)`.
  The `lod` array is created at `:702` and returned from `build()`. The comment at
  `:713-716` explains the legacy map gated these by zoom ≈ 14.7 and the diorama starts
  them **visible with no gate**. Grep-verified: **nothing in the repo reads `town.lod`**
  after build — it is dead in the diorama. Examples of marked clutter: well `:879-884`,
  bollards/barrels/crates `:1229-1231`, dormers/stoops/sign-arms `:1874-1878`, house
  name-plates `:1941`, the ~35-line yard/market clutter block `:2384-2418`.

### 0.5 Tree tier vocabulary (harbortrees.js)

`window.cartaTreeSystem(THREE, arg)`. `metric = !!(arg && typeof arg.project === 'function')`
(`:26`) — the diorama passes `frame`, so metric mode is on; the legacy maplibre path
(matrix arg) also lives in this file — **do not break it**.
- **Bands** (`:29-41`): `ULTRA = 130` m (hero geometry), `NEAR = max(160, 0.16R)`
  (full geometry), `MID = max(650, 0.55R)` (billboard card), `FAR = max(3000, 6R)`
  (smaller card; culled beyond). `R = frame.radius`.
- **CAP** (`:31-33`): per-band instance budgets, metric mode
  `{ ultra: 400, near: 2500, mid: 16000, far: 60000 }`; plus `UNDER_CAP = 1500`,
  `LOG_CAP = 80` (`:584`).
- **Tiers**: `makeTier` (`:589-596`) makes one `InstancedMesh` per (band × key) with
  `DynamicDrawUsage` and `frustumCulled = false` (`:593` — "we cull per instance
  ourselves"). Geometry bands key by **variant** (`VARNAMES`, ~10 procedural tree
  variants → `tiers.near[v]`/`tiers.ultra[v]`, `:604-605`), billboard bands key by
  **kind** (`KINDS` → `tiers.mid[k]`/`tiers.far[k]`, `:608-609`). ≈ 28 InstancedMeshes.
- **Reveal**: each tree carries a stable `rank ∈ [0,1)` (`:644`; hill trees capped at
  `rank ≤ 0.44`, `:776`). Per frame, `reveal = max(0.45, min(1, …))` rises as the camera
  closes (`:932-934`) and gates `t.rank > reveal → skip` (`:939`). Deterministic,
  unfaded.
- **Hot loop**: `updateMetric(camera, camDist)` (`:925-1002`) — frustum+distance test
  per tree, band select at `:948`
  (`band = d2 < ultra2 ? 'ultra' : d2 < near2 ? 'near' : d2 < mid2 ? 'mid' : 'far'`),
  `setMatrixAt`+`setColorAt` per visible instance, then the flush loop `:958-967` sets
  `instanceMatrix.needsUpdate`/`instanceColor.needsUpdate` on **all** tiers
  (`:964-965`), every frame. Hill planting budget `TARGET=6000, MAXHILL=8000` (`:704`).
- Materials: geometry tiers use lit `foliageMat` (`MeshLambertMaterial`, `:539-581`,
  `onBeforeCompile` wind+backlight patch at `:543`); billboard tiers use **unlit**
  `billboardMat` (`MeshBasicMaterial`, `:56-69`, vertex-shader camera-facing patch
  `:58-67`).
- Public API (`:1004-1009`): `{ group, init, update, get stats() }` —
  `stats = { total, drawn: counts }` with per-band counts.

### 0.6 Ships (harbor3d.js / harborshiphd.js / the host updater)

- Symbolic shipwright `window.cartaShipwright` (`harbor3d.js`): `LENGTHS = { canoe: 7,
  sloop: 18, brigantine: 24, merchantman: 30, 'man-of-war': 42 }` (`:20`),
  `SYMBOLIC_SCALE = 3.4` (`:23`); both exported (`:370`).
- HD shipwright `window.cartaShipwrightHD` (`harborshiphd.js`, ~1100-line builder with
  canvas textures), instantiated lazily by the host.
- Host ships updater `harbordiorama.js:526-560`: `HD_IN = 150, HD_OUT = 175, HD_CAP = 3`
  (`:525`); lazy `SWHD` raise inside the frame loop (`:535-543`); promote/demote
  `:534-546`; hard visibility toggle `:547-548`; the **swell/billow placement math
  `:550-558`** (waterAt → placeMatrix → pitch/roll → billow/flutter) — this block is an
  untouchable invariant (§6) along with the terrain's `W_TRAINS` wave-train constants
  (`harborterrain.js:29`) it rides on.

### 0.7 Birds (harborbirds.js)

`window.cartaHarborBirds(THREE).build(radius)` (`:422`): protos `buildProto(false)` /
`buildProto(true)` at `:424-425` (signature `buildProto(juv, hero)`, `:190`; `hero`
raises the body loft from 12 to 16 rings, `:204` — **the flock never passes `hero`**),
`N = 26` birds (`:426`), clone loop `:431-453` (`rewire((juv?protoJuv:proto).clone(true))`
at `:433` — clones share geometry/materials). Each clone is a deep `Group` of ~24 `Mesh`
nodes (body, 2 fairings, head+bill+2 eyes, tail, 2 feet, 2×(arm+hand+5 fingers)) —
**estimate; Phase 0 confirms the true draw-call bill via `renderer.info`**. Articulation
LOD: `update(t, focus)` (`:471`) skips head/tail pivot writes past 250 m
(`< 62500 = 250²`, `:491-493`; the skipped block is `:533-547`); `focus` is
`carDio._tourPos`-derived — `null` in overview (`harbordiorama.js:580`), so overview
articulates everything. Hero builders `gull`/`heroGull` (`:562-563`) pass `hero=true`
but are used only for the canoe's close gulls, not the flock.

### 0.8 Test harness

- `node test/run.mjs` — re-execs itself with `--experimental-vm-modules`, runs every
  `test/cases/*.mjs` (currently `00-smoke` … `12-lifecycle`) plus optional
  `test/cases/gl/*.mjs` (auto-SKIP if the `gl` package is absent). Exit code 1 on any FAIL.
- `test/lib/stubs.mjs` — `loadDiorama()` boots the host against DOM/THREE stubs (no GPU);
  `test/lib/assert.mjs` — `assertSnapshot(name, value)` canonicalizes (sorted keys,
  6-significant-digit floats) and diffs against `test/golden/<name>.json`.
- **Golden policy (hard rule):** `UPDATE_GOLDEN=1` is for **NEW cases only**. Existing
  goldens must never be regenerated by this work. After adding a new case:
  `UPDATE_GOLDEN=1 node test/run.mjs`, then `git status test/golden` must show only
  **added** files and `git diff test/golden` must be empty.
- Per-file syntax gate: `node --check web/js/<file>` for every touched file.

### 0.9 Hard invariants (violating any of these = the change is wrong)

1. `node test/run.mjs` green at every phase boundary; existing goldens byte-identical.
2. The `W_TRAINS` swell math (`harborterrain.js:29-36`, consumed at `:249-252`, `:770`)
   and the ships' swell placement block (`harbordiorama.js:550-558`) are untouchable.
3. One `heightAt` everywhere: anything placed on land samples `frame.heightAt`.
4. Determinism: no `Math.random` in any geometry/placement/selection decision; sine-hash
   or `hash2`/`dhash` only.
5. Painterly aesthetic: vertex-colour palettes, faceted lighting and the materials'
   colour math stay as authored; LOD work changes *when* things draw, not *how they look*
   when fully shown.
6. 60 fps on the reference GPU (M1 / GTX 1660 class) — certified per the derating policy
   in §5.0.
7. Module idiom: `'use strict'` IIFE + one `window.carta*` global; no ES modules in
   `web/js`; no new npm runtime dependencies.

---

## 1. Current-state audit (anchors verified 2026-06-12)

### 1.1 Inventory of existing discrete-LOD mechanisms

| # | System | File:line | Levels | Thresholds | Hysteresis | Transition | Selector runs |
|---|--------|-----------|--------|------------|------------|------------|---------------|
| A | Ships HD swap | `harbordiorama.js:524-560` | symbolic (harbor3d.js) ↔ HD (harborshiphd.js) | `HD_IN=150`, `HD_OUT=175` m from canoe, `HD_CAP=3` live (`:525`) | **yes** (25 m) | hard `visible` toggle (`:547-548`) | per frame, O(ships) — fine |
| B | Tree tiers | `harbortrees.js:29-41, 925-1002` | ultra geo / near geo / mid billboard / far billboard / culled | `ULTRA=130`; `NEAR=max(160,0.16R)`; `MID=max(650,0.55R)`; `FAR=max(3000,6R)` | **none** | hard band reassignment per frame (`:948`) | per frame, O(all trees) — the hot path |
| C | Tree density reveal | `harbortrees.js:932-934` (reveal), `:939` (rank gate), `:644` (rank), `:776` (hill rank ≤ 0.44) | per-tree on/off by stable rank vs camera distance | reveal 0.45→1.0 over `[0.4R, 2.6R]` | none | instant appear/disappear | per frame |
| D | Town clutter gate | `harbortown.js:718` (`mark()`), `:702` (`lod[]`), `:772` (`opts.lod`) | detail tier visible/hidden | *(legacy map zoom ≈ 14.7 — comment `:713-716`)* | n/a | n/a | **never — dead in the diorama** |
| E | Bird articulation | `harborbirds.js:491-493` (gate), `:533-547` (skipped block) | full articulation ↔ head/tail pivots frozen | 250 m (`62500 = 250²`) from tour camera | none | n/a (animation only) | per frame, O(26) |
| F | Bird hero build | `harborbirds.js:190` (`buildProto(juv, hero)`), `:204` (16 vs 12 rings), `:562-563` | hero loft vs flock loft | n/a — flock protos `:424-425` never pass `hero` | — | — | build-time only |

Supporting plumbing:
- `carDio._camDist` — `harbordiorama.js:955` (overview), `:940` (tour, faked to
  `radius*0.18`) — **but see §1.3: it never arrives**.
- `carDio._tourPos` — `harbordiorama.js:942/:946`, consumed at `:527` (ships) and `:580`
  (birds).
- `web/js/render/engine.js:190` — the updater loop `a.update(t, camera)`; the natural
  seam for a shared LOD context.
- Vendored r160 has `THREE.LOD` **with the `hysteresis` parameter**, `BatchedMesh`
  (exported), and a `WEBGL_multi_draw` reference (each grep-verified, 1 hit apiece in
  `web/vendor/three.module.min.js`) — none used by repo code today.

### 1.2 Weaknesses observed in the code

**A — Ships (`harbordiorama.js`)**
1. *Hard pop with a model change.* `s.hd.inst.visible = s.hdOn; s.inst.visible = !s.hdOn`
   (`:547-548`) swaps a symbolic hull for a different HD hull in one frame at 150 m — the
   most visible pop in the diorama (large isolated silhouettes on open water).
2. *First-encounter hitch.* The HD shipwright and each HD proto are built lazily **inside
   the frame loop** when the canoe crosses 150 m (`:535-543`): the ~1100-line builder +
   canvas textures + first-draw shader compilation land in one frame. No
   `renderer.compile()` prewarm, no idle-time build.
3. *Promotion order is array order, not nearest/biggest-first.* With >3 ships inside
   150 m the cap goes to whichever ships appear first in `ships[]` (`:530-546`).

**B — Trees (`harbortrees.js` `updateMetric`)**
1. *No hysteresis on band edges* (`:948`) — a tree at 130/NEAR/MID m flips tier whenever
   the camera bobs on the swell or the orbit damps; the geometry↔billboard flip is the
   visible one.
2. *Lighting mismatch at the NEAR boundary.* Geometry tiers are lit Lambert (`:539`),
   mid/far billboards are **unlit** `MeshBasicMaterial` (`:57`) — crossing the band
   changes luminance, not just shape.
3. *O(N) CPU loop every frame regardless of camera motion* (`:938-957`), then
   `needsUpdate` on all ~28 tiers (`:964-965`) → full capacity-sized buffer re-uploads
   (near tier: 2500 × 64 B per variant) even when nothing changed. Colours never change
   after init yet are rewritten and re-uploaded every frame.
4. *No screen-space awareness.* Bands are metres; fov differs by mode (38° vs 70°,
   `harbordiorama.js:837/:808`) so the same 200 m tree is ~2× larger on screen in
   overview, with identical band math.
5. *Reveal pop* (`:939`) — instant appear/disappear, deterministic but unfaded.
6. 28 InstancedMeshes with `frustumCulled = false` (`:593`) — every tier with count > 0
   issues a draw call.

**C — Town (`harbortown.js`)** — the gate is dead (§0.4). All ~40 clutter InstancedMeshes
draw at every camera distance, including the wide establishing shot where they are
sub-pixel; three.js per-mesh sphere culling never rejects a town-wide instance spread.

**D — Birds (`harborbirds.js`)** — no geometric LOD; ~24 meshes × 26 birds ≈ 600 draw
calls (estimate — confirm in Phase 0), every frame, both modes, mostly for 10–20 px birds.
The articulation skip only saves two pivot writes and only in tour.

**Cross-cutting** — no shared policy (thresholds ignore fov/viewport/pixel-ratio); no
transition machinery; no measurement (`renderer.info` never read).

### 1.3 Verified latent bug: `camDist` plumbing is severed

`harbordiorama.js:503` calls `trees.update(cam, carDio._camDist)` — but
`harbortrees.js:870` is `function update(arg)` and `:873` forwards only one argument:
`return updateMetric(arg);`. So `updateMetric(camera, camDist)` (`:925`) always receives
`camDist === undefined` and falls back to `Math.hypot(cx, cy, cz)` (camera distance from
the **origin**, `:933`). Consequences: (a) the tour-mode `_camDist = 0.18R` pin (`:940`)
is inoperative — tour reveal only looks right because the canoe happens to sit near the
origin; (b) overview reveal uses distance-to-origin instead of distance-to-target, which
diverges when the user pans. Fix is one line (forward the second arg) — scheduled as
Phase 1 task 1.6 with a characterization test, because fixing it changes reveal behaviour
and must be captured deliberately.

---

## 2. Research survey

*(Kept for context; conclusions are baked into §3. Skim unless questioning a decision.)*

### 2.1 THREE.LOD + hysteresis (built-in)
[`THREE.LOD`](https://threejs.org/docs/pages/LOD.html) holds children per distance and
swaps in `update(camera)`; `addLevel(obj, distance, hysteresis)` exists in the vendored
r160. Good for **one-off objects**; useless for instanced fields (per-Object3D). Known
cost: per-frame distance checks and the classic pop ("discrete LOD … causes jarring
popping" — [survey, arXiv 2510.09997](https://arxiv.org/pdf/2510.09997v1)).

### 2.2 Screen-space error (SSE) instead of raw distance
The standard metric (Simplygon, Cesium, Nanite): select the LOD whose projected geometric
error is below a pixel threshold.

```
pixels(s, d) = s * viewportHeightPx / (2 * d * tan(fovY/2))
d_swap(s, E) = s * viewportHeightPx / (2 * E * tan(fovY/2))
```

Distance thresholds should be **derived** from fov + viewport height, not hard-coded
metres — this fixes the 38°↔70° mismatch and adapts to window size/pixel ratio.
Sources: [Simplygon](https://documentation.simplygon.com/SimplygonSDK_10.1.400.0/concepts/deviationscreensize.html),
[Nanite-style SSE notes](https://deepwiki.com/liameitimie/learn-nanite/4.2-screen-space-error-metrics),
[GameDev.net](https://gamedev.net/forums/topic/483880-lod-determination/).

### 2.3 Dithered / cross-fade LOD transitions
Industry default for hiding the pop on the opaque pipeline: during a transition window
both LODs draw; each discards fragments against a screen-space Bayer matrix with
complementary thresholds. Unity ([LOD cross-fade](https://docs.unity3d.com/6000.2/Documentation/Manual/lod/lod-transitions-lod-group.html)),
Cesium for Unreal ([dithered opacity masking](https://cesium.com/blog/2022/10/20/smoother-lod-transitions-in-cesium-for-unreal/)),
classic screen-door transparency ([DigitalRune](https://digitalrune.github.io/DigitalRune-Documentation/html/fa431d48-b457-4c70-a590-d44b0840ab1e.htm)),
[Godot proposal](https://github.com/godotengine/godot-proposals/issues/5240),
[dither shader](https://github.com/samuelbigos/godot_dither_shader),
[URP tutorial](https://danielilett.com/2020-04-19-tut5-5-urp-dither-transparency/).
Alpha-to-coverage is available (`antialias: true`, `engine.js:53`) but a plain 4×4 Bayer
`discard` is simpler, deterministic, renderer-agnostic — and at this art style's
resolution the dither reads as painterly stipple. Distance-band-driven fades (across the
hysteresis window) are fully deterministic and preferred over time-based ones.

### 2.4 Impostors / octahedral impostors
The Fortnite technique ([Shaderbits](https://shaderbits.com/blog/octahedral-impostors));
three.js implementations exist ([forum](https://discourse.threejs.org/t/octahedral-impostors-for-three-js/80318),
[200k-tree demo](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735),
[live](https://octahedral-impostor.vercel.app/)). **Rejected**: the tree system already
has a hand-painted billboard far tier matching the engraved aesthetic; an octahedral
atlas adds bake passes, memory, and a generic-game look.

### 2.5 HLOD (merged distant clusters)
Replace groups of distant objects with one merged proxy. Trees are already 1 draw per
tier — small win. But the principle is exactly what the **birds** need (merge ~24 meshes
→ 1 for distant gulls) and what distant **town clutter** gets by simply hiding it.

### 2.6 BatchedMesh (r159+) and per-instance LOD ranges
[`BatchedMesh`](https://threejs.org/docs/pages/BatchedMesh.html) is in the vendored
build. [@three.ez/batched-mesh-extensions](https://github.com/agargaro/batched-mesh-extensions/)
adds BVH culling and per-instance LOD as geometry ranges;
[@three.ez/instanced-mesh](https://github.com/agargaro/instanced-mesh) likewise. Could
merge the ~20 geometry-tier draws into ~2 and make band changes a range write. Real but
**optional** (Phase 5): vendoring cost vs ~28 draw calls that are not the bottleneck.

### 2.7 meshoptimizer simplifier (auto-LOD chains)
[meshoptimizer](https://github.com/zeux/meshoptimizer)'s `MeshoptSimplifier`
([npm](https://www.npmjs.com/package/meshoptimizer), [thread](https://discourse.threejs.org/t/mesh-simplification-using-meshoptimizer/63002))
could auto-generate ship LODs. **Rejected**: all geometry is procedurally authored with
explicit detail parameters (`hero` flags, the symbolic shipwright *is* ship LOD-1); a
simplifier would mangle vertex-colour seams and deliberate facets.

### 2.8 GPU-driven (feasibility, WebGL2)
GPU-driven selection/indirect draws need compute + `multiDrawIndirect` — WebGL2 has
neither. Visibility-buffer/Nanite approaches need storage buffers — WebGPU territory.
**Infeasible.** What *is* cheaply GPU-driven here: per-instance dither fade computed in
the vertex shader from camera distance (no CPU per instance per frame) — adopted in
§3.4; the existing billboard vertex patch (`harbortrees.js:58-67`) is already this
pattern.

---

## 3. Design

### 3.1 Principles
- Four working systems, golden characterization tests, deterministic hash placement, no
  bundler, painterly aesthetic ⇒ **evolve in place**. One small shared *policy*
  (SSE-derived thresholds + hysteresis + dither helper) owned by the render engine; each
  module keeps its own *mechanism*.
- Rejected: THREE.LOD everywhere (doesn't fit instanced fields), octahedral impostors,
  meshoptimizer, GPU-driven selection, immediate BatchedMesh rewrite (optional Phase 5).

### 3.2 The shared LOD context (`web/js/render/lod.js` + engine)

New file `web/js/render/lod.js`, repo idiom:

```js
/* Carta Temporum — shared discrete-LOD policy: SSE math, band hysteresis,
   Bayer-dither shader chunk. Pure functions — unit-tested without GL. */
'use strict';
window.cartaLod = (function () {
  // pixels covered by world-size s at distance d, given fovScale = H/(2·tan(fovY/2))
  function pixels(s, d, fovScale) { return s * fovScale / Math.max(d, 1e-3); }
  // distance at which world-size s covers px pixels (the SSE swap distance)
  function distForPixels(s, px, fovScale) { return s * fovScale / Math.max(px, 1e-3); }
  // band(d, edges, prev, h): edges ascending; promote on crossing, demote at edge*(1+h)
  function band(d, edges, prev, h) {
    h = h == null ? 0.12 : h;
    let b = 0;
    while (b < edges.length && d >= edges[b] * (b >= prev ? 1 : (1 + h))) b++;
    return b;                       // 0 = closest band
  }
  const DITHER = [
    'uniform float uFade;',
    'float bayer4(vec2 p) {',
    '  vec2 q = floor(mod(p, 4.0));',
    '  float i = q.x + q.y * 4.0;',
    '  float m = mod(i * 9.0, 16.0);',   // compact permutation ~ Bayer order
    '  return (m + 0.5) / 16.0;',
    '}',
  ].join('\n');
  const DITHER_TEST = 'if (uFade < 0.999 && bayer4(gl_FragCoord.xy) > uFade) discard;';
  return { pixels, distForPixels, band, DITHER, DITHER_TEST };
})();
```

In `engine.js`, computed once per frame before the updater loop and passed as a third
argument (additive — existing updaters ignore it):

```js
// engine.js — module scope
const _lod = {
  t: 0, fovScale: 1, heightPx: 1,
  pixels(s, d) { return s * this.fovScale / Math.max(d, 1e-3); },
  distForPixels(s, px) { return s * this.fovScale / Math.max(px, 1e-3); },
};
function refreshLod(t) {
  _lod.t = t;
  _lod.heightPx = renderer.domElement.height;   // backing-store px (pixelRatio ≤ 1.8, :54)
  _lod.fovScale = _lod.heightPx / (2 * Math.tan(camera.fov * Math.PI / 360));
}
// in frame(), replacing engine.js:190:
//   refreshLod(t);
//   for (const a of updaters) { try { a.update(t, camera, _lod); } catch (e) { /* ignore */ } }
```

Hysteresis fraction default 0.12: the ships' existing 150→175 ratio (1.17) proves the
idiom; 10–15 % exceeds swell bob (±0.5 m) and orbit-damping overshoot at all radii.

### 3.3 SSE-derived thresholds (per module)

With `H` = canvas backing height and `fovScale = H / (2·tan(fov/2))`: at H ≈ 1944
(1080 × 1.8 cap), overview 38° → fovScale ≈ 2823; tour 70° → ≈ 1388. The same metre
threshold is ~2× too eager in tour today. Converting current thresholds to implied pixel
sizes (tree height ≈ 10 m·scale; ship length `LENGTHS[type] × 3.4`):

| Swap | Today (m) | Implied px (38°) | Implied px (70°) | Initial SSE rule |
|------|-----------|------------------|------------------|------------------|
| tree ultra↔near | 130 | ~217 | ~107 | promote at tree ≥ **110 px** → `d = lod.distForPixels(10·scale, 110)` |
| tree near↔billboard | `0.16R` | ~94–176 | ~46–87 | geometry while ≥ **48 px** |
| tree mid↔far card | `0.55R` | ~27–51 | — | far card below **14 px** |
| tree cull | `6R` | ~3 | — | cull below **2 px** |
| ship symbolic↔HD | 150 (tour) | — | ~570 (L=42) | HD when ship ≥ **400 px** (man-of-war ≈ 146 m — matches today; sloop promotes at ≈ 62 m — HD budget spent where it shows) |
| gull merged↔articulated | 250 (anim only) | — | ~8 | full gull while ≥ **12 px** |
| town clutter tier | *(none)* | — | — | show while a 1 m prop ≥ **3 px** → `camDist < lod.distForPixels(1, 3)` |

These pixel targets are **initial values chosen to reproduce today's metre edges at
reference fov/height**; the tuning procedure is §7-O1. All derived distances are clamped
to `[0.5×, 2×]` of today's metre values so band membership cannot run away on unusual
windows (determinism risk, §6).

Ships use `SW.LENGTHS[s.type] * SW.SYMBOLIC_SCALE` (`harbor3d.js:20,:23`) as `s` — the
per-type swap distance falls out automatically, and sorting candidates by `pixels()`
fixes weakness A3 (cap goes to the biggest-on-screen).

### 3.4 Dithered transitions (ships and trees — where pop is visible)

Shared chunk `cartaLod.DITHER`/`DITHER_TEST` (§3.2), patched in via the repo's existing
`onBeforeCompile` idiom (`harbortrees.js:543`, `:58`).

- **Ships:** on band change start a 0.35 s fade; during it both hulls render, HD with
  `uFade = k`, symbolic with `uFade = 1 − k` (complementary thresholds → every pixel
  covered exactly once; no transparency sorting; `discard` applies in the depth/shadow
  pass too). Two uniforms per ship, driven from the ships updater.
- **Trees:** per-instance fade with **zero CPU writes** — computed in the vertex shader
  across the hysteresis window and passed as a varying:

```glsl
// vertex (instanced tiers): vFade = 0..1 across the band edge ± hysteresis
float dCam = distance((modelMatrix * instanceMatrix * vec4(0.,0.,0.,1.)).xyz, cameraPosition);
vFade = clamp((uBandFar - dCam) / max(uBandFar - uBandNear, 1.0), 0.0, 1.0);
```

  The outgoing tier uses `1 − vFade`. The CPU assigns a tree to **both** tiers while it
  sits inside the hysteresis window (bounded — see Risks). The same chunk fades the
  rank-reveal pop (weakness B5) over the last 10 % of each tree's reveal distance.
- **Lighting-pop fix (cheap, do first):** switch `billboardMat` from `MeshBasicMaterial`
  to `MeshLambertMaterial` keeping the identical billboard vertex patch (`:58-67`) and
  camera-facing normals. This alone removes most of the perceived tree pop.

### 3.5 What stays exactly as is
Variant geometry builders; all placement hashes/ranks; the symbolic shipwright; caps
(`CAP`, `HD_CAP`, `UNDER_CAP`, `LOG_CAP`); fog (already the far "LOD" past `9R`); the
tour `_camDist` value at `harbordiorama.js:940` (once the plumbing is fixed it becomes
the documented "density override" input to reveal, no longer a dead hack).

---

## 4. Phased implementation plan

Order is binding: 0 → 1 → {2 ∥ 3} → 4 → (5 optional). Phase 2 is independent of 3 and is
the cheapest fidelity-per-day. **At every phase boundary:** `node --check` each touched
file, `node test/run.mjs` green, `git diff test/golden` empty.

---

### Phase 0 — Fine print + measurement (no behaviour change to rendering)

**Files touched:** `web/js/harbordiorama.js`, `web/js/render/engine.js`,
`test/cases/13-sysreq-dom.mjs` (new), `test/golden/sysreq-dom.json` (new).

#### Task 0.A — system-requirements fine print (locked decision 2)

1. In the injected style template literal inside `ensureDom()`
   (`harbordiorama.js:53-175`), append after the `.dio-hint.show` rule (`:168`), before
   the `.dio-title` block (`:169`):

```css
#carta-diorama .dio-sysreq {
  position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%);
  z-index: 3; pointer-events: none; white-space: nowrap;
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 10.5px;
  color: #efe3c6; opacity: 0.55; text-shadow: 0 1px 4px rgba(0,0,0,0.6);
}
#carta-diorama.touring .dio-sysreq { display: none; }
```

2. Create the node next to the hint (`:232-234`):

```js
const sysreq = document.createElement('div');
sysreq.className = 'dio-sysreq';
sysreq.textContent = 'For best experience: an M1 / GTX 1660-class GPU or better';
```

3. Add `sysreq` to the `host.append(...)` list (`:240`).

Placement rationale (decided): bottom-left is taken by `.dio-hint` (left:22/bottom:28,
`:162-168`) and, in touring, by `.dio-minimap` (left:22/bottom:22, `:154-161`);
bottom-right is taken by the `.dio-env` button row (right:22/bottom:26). Centered-bottom
at `bottom: 8px` clears the `.dio-close` button (spans ≈ 26–59 px from the bottom edge).
**Hidden in tour mode** (the `.touring` rule): the centre-bottom slot hosts
`.dio-return` when paused, and the line is onboarding info, not mid-tour info.

#### Task 0.B — perf counters behind `?perf=1`

1. `engine.js`: add a `perf` flag read once
   (`new URLSearchParams(location.search).has('perf')`), a 600-entry ring buffer of
   frame `dt`, and after the render decision (`:193-194`) capture
   `renderer.info.render.calls / .triangles` and `renderer.info.memory.geometries`.
2. Expose `get perf()` on the engine API object (`:225-235`) returning
   `{ calls, triangles, geometries, median, p95, max }` (compute percentiles on read,
   not per frame). Per-updater timing (a `performance.now()` pair around each
   `a.update`) only when `perf` is on.
3. Optional GPU timer: feature-check
   `renderer.getContext().getExtension('EXT_disjoint_timer_query_webgl2')` (the vendored
   three does not touch it — grep-verified); **degrade silently** when absent
   (Safari/Firefox).
4. Minimal HUD: a `.dio-perf` div (same injected style string; top-right; monospace ok —
   it is a dev tool, exempt from the parchment aesthetic), updated at most 4 Hz from the
   existing frame hook, only when `perf` is on.
5. Capture baselines for the three scripted paths in §5.2 (manual, M4) and commit the
   JSON under `test/perf/baseline-m4.json` (plain data file, **not** under
   `test/golden/`, not asserted by the runner).
6. Record the **measured** overview/tour draw-call totals — this confirms or corrects
   the ~600-gull-draw estimate before Phase 2 sizes its win.

#### New test case

`test/cases/13-sysreq-dom.mjs` — boot via `loadDiorama()`, `open()` a port, snapshot
`{ present: !!host.querySelector('.dio-sysreq'), text, cssHasTouringHide:
style.textContent.includes('.touring .dio-sysreq') }` to a **new** golden
`sysreq-dom.json`. (Follow `03-radius-rig.mjs` for harness usage; check what the DOM
stub supports — if `querySelector` is unavailable in `test/lib/stubs.mjs`, assert via
the host's child list instead.)

**Acceptance criteria**
- Overview shows the fine-print line centered at the bottom, opacity 0.55, not
  hit-testable (`pointer-events: none`); it disappears in tour mode; no overlap with
  `.dio-close` at 1280×720 and 2560×1440 window sizes (manual check).
- `?perf=1` shows calls/tris/CPU-ms; without the flag, zero added per-frame work beyond
  one boolean test (no ring-buffer writes, no info reads).
- Rendering output is unchanged: all existing goldens byte-identical.

**Verification**
```
node --check web/js/harbordiorama.js && node --check web/js/render/engine.js
node test/run.mjs                       # all pre-existing cases PASS
UPDATE_GOLDEN=1 node test/run.mjs       # writes ONLY test/golden/sysreq-dom.json
git status test/golden                  # only the new file; git diff test/golden empty
```

**Definition of Done:** acceptance met, baseline JSON committed, measured draw-call
numbers recorded in the Phase 2 task notes below (replacing the ~600 estimate).

---

### Phase 1 — Shared policy (numerically ≈ today at reference fov/window)

**Files touched:** `web/js/render/lod.js` (new), `web/js/render/engine.js`,
`web/js/harbordiorama.js`, `web/js/harbortrees.js`, the page's script list (add
`render/lod.js` before `harbordiorama.js`), `test/cases/14-lod-math.mjs` (new),
`test/cases/15-lod-band-hysteresis.mjs` (new), extend `test/cases/07-updater-order.mjs`
and `10-mode-switch.mjs`.

**Tasks**
1. Add `web/js/render/lod.js` exactly as sketched in §3.2 (`window.cartaLod`).
2. `engine.js`: add `_lod` + `refreshLod(t)`; change `:190` to pass `_lod` as the third
   updater argument. Nothing else in the loop moves.
3. Ships updater (`harbordiorama.js:526-560`): derive
   `hdIn = clamp(lod.distForPixels(SW.LENGTHS[s.type] * SW.SYMBOLIC_SCALE, 400), 75, 300)`
   per ship; `hdOut = hdIn * 1.17` (today's ratio). At reference fov/height the
   man-of-war reproduces today's 150/175. Keep `HD_CAP = 3`.
4. Trees: compute band edges once per frame at the top of `updateMetric` from the lod
   context — `distForPixels(10, {110, 48, 14, 2})` — each clamped to `[0.5×, 2×]` of the
   current metre constants (`ULTRA`/`NEAR`/`MID`/`FAR`, `:29-41`). The per-tree band
   *select* logic at `:948` is unchanged in this phase (hysteresis lands in Phase 4).
   When the third updater arg is absent (legacy map path, stubs), fall back to the
   existing metre constants — behaviour identical.
5. Thread the lod context: `harbordiorama.js:503` trees entry becomes
   `{ update(t, cam, lodCtx) { trees.update(cam, carDio._camDist, lodCtx); } }`; ships
   updater signature gains the arg likewise.
6. **Fix the severed `camDist` plumbing (§1.3):** `harbortrees.js:870/:873` —
   `function update(arg, camDist, lodCtx) { … if (metric) return updateMetric(arg, camDist, lodCtx); }`.
   This re-activates the tour `0.18R` pin and overview target-distance reveal. Capture
   the new reveal behaviour in case 16 (below) so the change is deliberate, not silent.

**New test cases (pure, no GL)**
- `14-lod-math.mjs` — `pixels`/`distForPixels` round-trip; fov 38 vs 70 threshold ratio
  equals `tan(35°)/tan(19°)`; clamping behaviour at the `[0.5×, 2×]` rails. New golden
  `lod-math.json` if snapshot-style, else plain asserts.
- `15-lod-band-hysteresis.mjs` — sweep `d` ±2 % around each edge with `prev` feedback →
  assert **zero oscillation**; golden the band sequence for a scripted distance path
  (`lod-band-path.json`, new).
- Extend `07-updater-order.mjs`: assert updaters now receive a third argument with
  `{ fovScale, heightPx, pixels, distForPixels }` (additive assertion — do not
  regenerate its golden; if the golden encodes call shapes, add a separate new
  assertion/golden instead).
- Extend `10-mode-switch.mjs`: after a mode switch, derived distances change by the
  expected tan ratio (assert via `cartaLod` math against the stub camera fov — pure).

**Acceptance criteria**
- At reference fov/height (38°, H = 1944): derived tree edges equal today's
  `ULTRA/NEAR/MID/FAR` within ±2 %; man-of-war HD edge = 150 m ± 2 %; **draw calls and
  band counts unchanged** at the three scripted paths (compare `eng.perf` to the
  Phase 0 baseline; band counts via `trees.stats.drawn`).
- Policy frame cost (refreshLod + edge derivation) < 0.05 ms on M4.
- Reveal change from task 1.6 captured: `trees.stats.drawn` at three fixed synthetic
  camera distances snapshotted in `16-tree-band-membership.mjs` (new, golden
  `tree-band-membership.json`); run twice in one process → identical (idempotent
  re-init).
- All pre-existing goldens byte-identical.

**Verification**
```
node --check web/js/render/lod.js web/js/render/engine.js web/js/harbordiorama.js web/js/harbortrees.js
node test/run.mjs
UPDATE_GOLDEN=1 node test/run.mjs    # writes ONLY lod-math/lod-band-path/tree-band-membership
git status test/golden && git diff test/golden
```

**Definition of Done:** acceptance met; visual A/B at the reference window shows no
change in overview at rest; tour reveal behaviour reviewed once by eye after task 1.6.

---

### Phase 2 — Town gate resurrection + bird far-LOD (the cheap draw-call wins)

**Files touched:** `web/js/harbordiorama.js` (~15 lines), `web/js/harborbirds.js`
(~80 lines), `test/cases/17-town-gate.mjs` (new), `test/cases/18-bird-lod.mjs` (new).

**Tasks**
1. Town gate: in `buildScene` after `built.town = …build(…)` (`harbordiorama.js:487`),
   keep a reference to `town.lod` (built at `harbortown.js:702`, populated via `:718`).
   Add an updater:

```js
if (built.town && built.town.lod && built.town.lod.length) {
  let on = true;
  animated.push({ update(t, cam, lod) {
    const gate = lod ? Math.min(lod.distForPixels(1, 3), built.radius * 0.6)
                     : built.radius * 0.5;            // stub/legacy fallback
    const want = carDio._camDist < (on ? gate * 1.12 : gate);   // 12 % hysteresis
    if (want !== on) { on = want; for (const m of built.town.lod) m.visible = on; }
  } });
}
```

   Note the loop runs **only on state change** — zero steady-state cost.
2. Bird far tier: in `harborbirds.js`, at `build()` time (after `:425`), bake one merged
   static-pose mesh per proto: traverse the proto, `toNonIndexed()` each mesh geometry,
   bake its world transform **in a fixed mid-glide pose** (set the wing/wrist rotations
   to the glide values from `:509-520` with `glide = 1` before baking), merge into one
   `BufferGeometry` with vertex colours sampled from each part's material colour, one
   `MeshLambertMaterial({ vertexColors: true })`. Two merged protos (adult, juv).
3. Per bird, add `far = mergedProto.clone()` to the group, `visible = false`. In
   `update(t, focus)` add the swap: compute the bird's pixel size via the lod context
   (thread it through the host updater at `harbordiorama.js:580` exactly as trees in
   Phase 1) with `s ≈ 9 × bd.scale` (wingspan); `full = px ≥ 12` with 12 % hysteresis.
   When `!full`: show `far`, position/lookAt it (copy the existing position/orientation
   writes), and **skip** the whole articulation block (`:502-547`). When `full`: show
   the articulated group as today.
4. Keep the existing 250 m articulation skip (`:491-493`) untouched for the
   full-articulation path.

**Acceptance criteria**
- Overview draw calls drop by ~40 (town clutter) + (measured gull bill × far fraction)
  — using Phase 0's measured numbers; target overview total ≤ ~300 calls if the ~600
  estimate held, else proportionally (record actual before/after from `eng.perf`).
- No visible change at tour range: clutter gate distance in tour exceeds the canoe's
  practical viewing distance; near gulls (≥ 12 px) remain fully articulated.
- Far-gull silhouette at the swap is indistinguishable at ≤ 12 px in a screenshot A/B.
- Determinism: merged protos are built once at `build()`; no per-frame allocation.

**New test cases**
- `17-town-gate.mjs` — stubbed diorama: set `carDio._camDist` synthetically across the
  gate ± hysteresis; snapshot the visibility sequence of one marked mesh →
  `town-gate.json` (new). Assert zero oscillation at the edge.
- `18-bird-lod.mjs` — build birds against the THREE stub; assert merged protos exist,
  per-bird far node count == 1 mesh, swap sequence over a scripted px path →
  `bird-lod.json` (new).

**Verification**
```
node --check web/js/harbordiorama.js web/js/harborbirds.js
node test/run.mjs
UPDATE_GOLDEN=1 node test/run.mjs    # ONLY town-gate.json, bird-lod.json
git status test/golden && git diff test/golden
```

**Definition of Done:** acceptance met; before/after `eng.perf` captures for path (a)
and (b) committed to `test/perf/`; screenshots of the wide establishing shot pre/post
(clutter gate) show no perceptible difference.

---

### Phase 3 — Ship polish (hitch + pop + cap fairness)

**Files touched:** `web/js/harbordiorama.js` (ships updater `:526-560` region + tour
entry), `web/js/render/lod.js` (dither chunk already there), `web/js/harborshiphd.js`
(only if a material hook is needed for `uFade` — prefer patching from the host via
`onBeforeCompile` on the HD materials), `test/cases/19-ship-hd-policy.mjs` (new).

**Tasks**
1. **Idle prewarm:** on `enterTour` (the host's tour entry path that sets
   `camera.fov = 70` at `:808`), schedule via `requestIdleCallback` (fallback
   `setTimeout(…, 120)`): raise `SWHD = window.cartaShipwrightHD(THREE, SW)` and build
   one `shipInstance(type)` per distinct type present in `ships[]`, add to the scene
   `visible = false`, then `renderer.compile(scene, camera)` (engine getter
   `eng.renderer`). Guard with a `built` generation token so `close()`/`open()` during
   idle work no-ops (the disposal race in §6).
2. **Px-sorted cap:** replace the first-come promotion (`:530-546`): collect ships with
   `px = lod.pixels(L*3.4, d) ≥ 400-with-hysteresis`, sort by `px` descending
   (deterministic tiebreak: ship array index), award `HD_CAP` slots in order; demote the
   rest. Hysteresis via `cartaLod.band` per ship (h = 0.17, today's ratio).
3. **Dithered cross-fade:** add `uFade` uniforms to both hulls' materials via
   `onBeforeCompile` + `cartaLod.DITHER`/`DITHER_TEST` (symbolic materials live in
   `harbor3d.js` `materials`; HD materials in the proto — patch both at first use, cache
   the patched flag on the material). On promotion/demotion run a 0.35 s complementary
   fade (`k` advanced by `dt` inside the existing updater), both hulls visible during the
   window, then collapse to the single-visible state (`:547-548` logic preserved as the
   end state). **The swell placement block `:550-558` is copied to drive whichever hulls
   are visible — its math is not edited** (invariant §6.2: during a fade, apply the same
   computed matrix to both hulls).
4. Keep `HD_CAP = 3` and the try/catch around HD instantiation (`:537-542`).

**Acceptance criteria**
- First HD encounter produces **zero frames > 4 ms above the path's median** on M4
  (Phase 0 ring buffer, path (c)); previously one large hitch.
- Swap is invisible in an A/B screen recording at the 400 px edge (reviewer judgement,
  two reviewers or one reviewer twice on different days).
- With 4+ ships clustered inside the window, the HD slots go to the largest-on-screen
  (assert in case 19).
- No transparency artifacts: fade uses `discard` only — no `transparent = true`, no
  render-order changes; shadows still cast during fades.

**New test case**
- `19-ship-hd-policy.mjs` — synthetic `_tourPos` walk toward/away across the window with
  4 stub ships of mixed types → snapshot the `hdOn` sequence (`ship-hd-policy.json`,
  new); assert cap never exceeded, largest-px wins, zero oscillation at the edge.

**Verification**
```
node --check web/js/harbordiorama.js web/js/render/lod.js web/js/harborshiphd.js
node test/run.mjs
UPDATE_GOLDEN=1 node test/run.mjs    # ONLY ship-hd-policy.json
git status test/golden && git diff test/golden
```

**Definition of Done:** acceptance met; hitch capture (frame-time ring dump) attached to
the PR; manual tour past a man-of-war reviewed.

---

### Phase 4 — Tree CPU + transitions (the big one)

**Files touched:** `web/js/harbortrees.js`, `web/js/render/lod.js` (if the vertex-fade
GLSL is shared), `test/cases/20-tree-cells.mjs` (new), extend `16-tree-band-membership`.

**Tasks**
1. **Cell partition:** at `init()`, bucket `trees[]` into a fixed grid (default 24×24
   over `[-R, R]²` — decision procedure §7-O3). Per frame in `updateMetric`:
   frustum-test each cell's bounding sphere + min-distance test against `FAR`; iterate
   trees only in surviving cells. The per-tree tests (`:939-945`) stay as the inner
   filter.
2. **Hysteresis:** store `t.band` (int) per tree; replace the `:948` ternary with
   `cartaLod.band(d, edges, t.band, 0.12)`.
3. **Colour-write-once + ranged uploads:** write `setColorAt` only at init/membership
   change; per frame call `setMatrixAt` only for trees whose tier or matrix slot
   changed; track per-tier dirty counts and use
   `instanceMatrix.addUpdateRange(0, count*16)` (clear + re-add per frame; r160 API —
   verify the vendored build exposes `addUpdateRange` on `InstancedBufferAttribute`,
   else fall back to `updateRange`) so uploads are `count`-sized, not capacity-sized.
   Skip the entire flush for a tier whose membership and matrices are unchanged and the
   camera moved < ε (ε = 0.5 m).
4. **Lambert billboards:** swap `billboardMat`'s base class to `MeshLambertMaterial`
   (keep map/alphaTest/DoubleSide and the vertex patch `:58-67`; set the patched normal
   to the camera-facing vector). Check the far tier's `renderOrder = 1` (`:595`) still
   layers correctly.
5. **Dithered band + reveal fades:** per §3.4 — vertex-shader distance fade across the
   hysteresis window for tiers that can fade (ultra/near/mid); trees inside the window
   are written to both tiers (bounded: the window is ~12 % of the edge, typically a few
   dozen trees; hard-cap the doubled set at 128 per frame, nearest-first by the existing
   loop order). Reveal fade over the last 10 % of each tree's reveal distance using the
   same chunk.
6. Re-pin `16-tree-band-membership` expectations if membership at the three synthetic
   distances legitimately changes (hysteresis at exactly-on-edge distances): this is the
   ONE case whose golden may be **replaced by a new golden file**
   (`tree-band-membership-v2.json` asserted by the updated case; delete usage of the old
   name in the case but leave the old golden file in place so history shows intent — or
   migrate the case file name to `16b-`; either way, no silent regeneration).

**Acceptance criteria (reference budgets, with M4 ceilings per §5.0)**
- `trees.update()` CPU: ≤ 1.0 ms reference → **≤ 0.6 ms on M4** at ~10 k trees,
  overview path (a); ≤ 0.5 ms reference → **≤ 0.3 ms on M4** in tour path (c).
- Zero band flicker with the camera bobbing ±1 m at every edge (case 15 logic applied to
  the integrated path; plus manual orbit-damping test).
- Buffer uploads: per-frame bytes uploaded for an at-rest camera ≈ 0 (assert via
  instrumentation in case 20: tiers' dirty flags false when camera static).
- No luminance pop at the NEAR boundary in an A/B screenshot pair (billboard vs geometry
  under the evening sun).
- Legacy maplibre tree path (`update(matrix)`, `:874+`) untouched and still working
  (smoke: the non-metric branch executes in a stub).

**New test case**
- `20-tree-cells.mjs` — synthetic field, fixed cameras: assert (a) cell rejection
  reduces tested-tree count below a threshold, (b) static camera ⇒ no dirty tiers,
  (c) membership identical to the non-celled reference implementation for the same
  inputs → golden `tree-cells.json` (new).

**Verification**
```
node --check web/js/harbortrees.js web/js/render/lod.js
node test/run.mjs
UPDATE_GOLDEN=1 node test/run.mjs    # ONLY tree-cells.json (+ the explicit v2 membership golden if needed)
git status test/golden && git diff test/golden
```

**Definition of Done:** acceptance met on M4; §5.0 hardware validation run completed on
M1/GTX-1660-class hardware (this is the certification gate for the whole project);
before/after perf JSONs committed.

---

### Phase 5 (OPTIONAL) — BatchedMesh consolidation

Only if Phase 4's measurements show the scene draw-call-bound on the reference GPU
(decision procedure: path (a) GPU time > 12 ms on M1-class while CPU < 6 ms and calls >
500). Merge near+ultra variant tiers into 1–2 `BatchedMesh` with per-instance geometry
ranges (vendor `@three.ez/batched-mesh-extensions` into `web/vendor/` if used — license
check, pin version, no npm at runtime). Files: `web/js/harbortrees.js`, `web/vendor/`.
Acceptance: tree draw calls 28 → ~8, identical band membership versus case 16/20
goldens. Not specified further here; re-plan if triggered.

---

## 5. Measurement plan

### 5.0 Reference-GPU derating policy (locked decision 1)

- Certification target: **60 fps (16.7 ms) on Apple M1 / NVIDIA GTX 1660 class**.
- The dev machine is an **Apple M4**; its measurements substantially overestimate
  mid-tier headroom. **Policy: any frame-time budget in this document is certified from
  an M4 measurement only if the M4 number is ≤ 60 % of the budget.** Phase tables above
  state both numbers explicitly (e.g. "≤ 1.0 ms reference → ≤ 0.6 ms on M4").
- Whole-frame gate on M4: p95 frame time ≤ **10 ms** (0.6 × 16.7) on all three scripted
  paths at every phase boundary.
- **Before final sign-off (end of Phase 4), at least one validation run of the three
  scripted paths on real M1- or GTX-1660-class hardware is required**, showing p95
  ≤ 16.7 ms and no >25 ms spikes on path (c). If no such machine is available, sign-off
  is blocked — escalate to the project owner; do not certify from M4 numbers alone.

### 5.1 Instruments (Phase 0)
1. **Counters (free):** `renderer.info.render.calls/.triangles`,
   `.memory.geometries`, read after the render decision; exposed via `eng.perf`.
   `EffectComposer` adds its own passes' calls — record with Studio light ON and OFF
   (the `envOn && composer` branch, `engine.js:193-194`).
2. **CPU frame time:** ring buffer of `dt` in the loop (it already computes `dt`,
   `:179`); median/p95/max over 600 frames. Per-updater timing behind `?perf=1` only.
3. **GPU time:** `EXT_disjoint_timer_query_webgl2` when present; silent CPU-only
   fallback otherwise (Safari, often Firefox).

### 5.2 Methodology
Three deterministic scripted camera paths, fixture ports `lisbon`/`porto` (as in
`test/cases/03-radius-rig.mjs`):
(a) overview rest → slow dolly to `controls.minDistance`;
(b) 360° orbit at rest radius;
(c) tour run past the shore grove and a man-of-war at cruise step 4.
For each: 600-frame capture of `{calls, tris, cpuMs, gpuMs}` before/after each phase,
stored as JSON under `test/perf/` (machine-dependent — **never** under `test/golden/`,
never asserted in CI; diffed by hand per phase, tagged with the machine name).

### 5.3 Visual A/B
Screenshot pairs at the band edges (tree NEAR edge, ship 400 px distance) pre/post
dither — the acceptance evidence for "pop removed" (Phases 3–4).

---

## 6. Risks + mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| SSE thresholds depend on window height/pixel ratio → band membership varies per machine, threatening determinism expectations | high | `lod.js` math is pure; tests pin `heightPx`/fov via a synthetic lod context; runtime distances clamped to `[0.5×, 2×]` of today's metre values (Phase 1 task 4) |
| `camDist` plumbing fix (1.6) changes reveal behaviour silently | med | captured as an explicit new golden (case 16) + one manual review of tour reveal |
| Dither `discard` breaks early-Z / costs fill rate on big tree tiers | med | patch only tiers that can fade; `uFade==1`/`vFade==1` path skips the discard branch; measure in Phase 4 before enabling anywhere near `far` (14 px — likely never needs it) |
| Both-LOD overlap during fades doubles instance counts at edges | med | hard cap (≤ 128 trees in-window per frame, ≤ `HD_CAP` ships); distance-window fades bound it naturally |
| Bird merged-LOD changes silhouette at the swap | med | swap at ≤ 12 px + hysteresis; frozen mid-glide pose (most common silhouette); optional dither fade if A/B fails (§7-O2) |
| Colour-once/ranged-upload refactor desyncs `instanceColor` on `open()` of a second port | med | `init()` rebuilds tiers; case 20 asserts two-port open idempotence (extends the `03-radius-rig` two-port pattern) |
| Idle prewarm races `exitTour`/`close` disposal | low | generation token on `built`; prewarm only fills module-level proto caches in `harborshiphd.js` + pre-adds invisible instances guarded by the token |
| Engine 3rd-arg change breaks `07-updater-order` | low | additive arg; extend the case without regenerating its golden |
| `addUpdateRange` absent from vendored r160's `InstancedBufferAttribute` | low | Phase 4 task 3 includes the explicit grep/feature check; fall back to `updateRange` (single range) |

---

## 7. Open items assigned to the implementer (each with a decision procedure)

- **O1 — Final pixel thresholds** (110/48/14/2 trees; 400 ships; 12 gulls; 3 town).
  Procedure: Phase 1 fixes them to reproduce today's metre edges at reference
  fov/height (acceptance: ±2 %); after Phase 4, tune only if visual A/B shows a band
  edge inside the "noticeable" zone, moving one threshold at a time and re-running the
  scripted captures. Never tune past the `[0.5×, 2×]` clamps.
- **O2 — Far-gull pose count** (1 frozen glide vs 2–3 cycled poses). Procedure: ship
  with 1 pose; if the Phase 2 A/B at 12 px shows visible "freezing" against nearby
  articulated birds, add a second pose cycled by the deterministic per-bird `phase`
  (`harborbirds.js:443`) — never `Math.random`.
- **O3 — Tree cell grid size** (default 24×24). Procedure: in case 20, sweep
  {16, 24, 32} on the synthetic field; pick the smallest tested-trees-per-frame at
  path (a); ties → 24.
- **O4 — DOM-stub capability for case 13.** Procedure: read `test/lib/stubs.mjs` first;
  if its DOM stub lacks `querySelector`, assert via the host element's recorded
  children/className list instead. Do not extend the stub unless required.
- **O5 — Hardware validation machine** (§5.0). Procedure: borrow/CI an M1 Mac or a
  GTX-1660 box for one capture session at the end of Phase 4; if unavailable, sign-off
  is BLOCKED — escalate, do not certify.

---

## 8. Out of scope / do not touch

- `web/js/harborterrain.js` — especially `W_TRAINS` (`:29-36`) and everything derived
  from it (`:249-252`, `:770`): the swell math is an invariant.
- The ships' swell/billow placement block `harbordiorama.js:550-558` (re-pointing which
  hull receives the matrix is allowed in Phase 3; the math is not).
- All placement hashing/ranks (`harbortrees.js:644`, `:776`; `harbortown.js:781`
  `dhash`, `hash2` everywhere) and any geometry builder's vertex/colour math.
- The legacy maplibre tree path (`harbortrees.js:874+`, non-metric branch) and the
  legacy town zoom gate semantics (`harbortown.js:713-716` comment) — the diorama work
  must not change legacy map behaviour.
- `web/vendor/three.module.min.js` (no edits; Phase 5 may *add* a vendored file, never
  modify this one).
- Existing golden files in `test/golden/` — never regenerated; new cases get new files.
- The tour canoe rig, audio, minimap, speed control, POI system.
- No new runtime dependencies, no bundler, no ES-module conversion of `web/js`, no
  octahedral impostors, no meshoptimizer, no GPU-driven culling (§2.4–2.8 verdicts are
  final for this effort).

---

## Appendix A — verified anchor quick-reference (2026-06-12)

```
ships HD swap        harbordiorama.js:524 (SWHD), :525 (HD_IN/HD_OUT/HD_CAP), :526-560 (updater),
                     :534-546 (promote/demote), :547-548 (visible toggle), :550-558 (swell math)
camDist plumbing     harbordiorama.js:940 (tour 0.18R), :955 (overview), :503 (trees feed —
                     SECOND ARG DROPPED at harbortrees.js:870/:873, see §1.3)
tourPos              harbordiorama.js:942/:946 (set), :527 (ships), :580 (birds)
mode fov             harbordiorama.js:808 (tour 70°), :837 (overview 38°)
DOM/UI               harbordiorama.js:51 (ensureDom), :53-175 (style string),
                     :154-161 (.dio-minimap), :162-168 (.dio-hint), :177-239 (nodes),
                     :232-234 (hint node), :240 (host.append), :241 (body append)
frame contract       harbordiorama.js:456 (frame = {project, heightAt, centroid, radius}),
                     :471 (heightAt fill), :375-383 (project), :385 (footprintRadius)
carDio               harbordiorama.js:46-47
tree bands           harbortrees.js:26 (metric), :29-41 (bands/CAP/recalibration),
                     :584 (UNDER_CAP/LOG_CAP), :589-596 (makeTier, :593 frustumCulled=false),
                     :604-609 (tier creation), :644 (rank), :704 (TARGET/MAXHILL),
                     :776 (hill rank ≤ 0.44), :870/:873 (update dispatch — arg dropped),
                     :925-1002 (updateMetric), :932-934 (reveal), :939 (rank gate),
                     :948 (band select), :958-967 (tier flush, :964-965 needsUpdate),
                     :1004-1009 (API incl. stats)
tree materials       harbortrees.js:56-69 (billboardMat, MeshBasicMaterial :57, vertex patch :58-67),
                     :539-581 (foliageMat, Lambert, onBeforeCompile :543)
town dead gate       harbortown.js:702 (lod[]), :713-716 (comment), :718 (mark),
                     :726 (anchorAt), :761 (addInst), :772 (opts.lod → mark)
town clutter (lod)   harbortown.js:879-884, :1229-1231, :1874-1878, :1941, :2384-2418
bird LOD             harborbirds.js:190 (buildProto(juv,hero)), :204 (16/12 rings),
                     :422 (build), :424-425 (flock protos, hero unset), :426 (N=26),
                     :431-453 (clone loop), :471 (update(t,focus)), :491-493 (250 m gate),
                     :533-547 (head/tail skip), :562-563 (gull/heroGull hero=true)
ships data           harbor3d.js:20 (LENGTHS), :23 (SYMBOLIC_SCALE), :370 (exports)
engine               render/engine.js:38 (cartaRenderEngine), :52-58 (renderer; :53 antialias,
                     :54 pixelRatio≤1.8, :58 fov38), :119-148 (configureForRadius, :145 fog),
                     :166-170 (hook setters), :174-195 (loop; :190 updater call,
                     :193-194 render decision), :211-218 (resize), :225-235 (API)
swell invariant      harborterrain.js:29-36 (W_TRAINS), :249-252, :770 (consumers)
vendored r160        BatchedMesh ✓, LOD hysteresis ✓, WEBGL_multi_draw ✓ (1 grep hit each)
tests                test/run.mjs (re-exec, runner), test/cases/00-12 + gl/smoke.mjs,
                     test/lib/assert.mjs (assertSnapshot, 6-sig-digit canon, UPDATE_GOLDEN=1),
                     test/lib/stubs.mjs (loadDiorama), goldens in test/golden/
```

## Appendix B — sources

[THREE.LOD docs](https://threejs.org/docs/pages/LOD.html) ·
[three.js LOD example](https://threejs.org/examples/webgl_lod.html) ·
[three.js forum: understanding LOD](https://discourse.threejs.org/t/help-to-understand-the-three-js-lod-level-of-details/42960) ·
[sbcode LOD](https://sbcode.net/threejs/lod/) ·
[Wael Yasmina: LOD performance](https://waelyasmina.net/articles/enhancing-three-js-app-performance-with-lod/) ·
[BatchedMesh docs](https://threejs.org/docs/pages/BatchedMesh.html) ·
[@three.ez/batched-mesh-extensions](https://github.com/agargaro/batched-mesh-extensions/) ·
[@three.ez/instanced-mesh (InstancedMesh2)](https://github.com/agargaro/instanced-mesh) ·
[InstancedMesh2 forum thread](https://discourse.threejs.org/t/three-ez-instancedmesh2-enhanced-instancedmesh-with-frustum-culling-fast-raycasting-bvh-sorting-visibility-management-lod-skinning-and-more/69344) ·
[Cesium: dithered LOD transitions](https://cesium.com/blog/2022/10/20/smoother-lod-transitions-in-cesium-for-unreal/) ·
[Unity: LOD cross-fade](https://docs.unity3d.com/6000.2/Documentation/Manual/lod/lod-transitions-lod-group.html) ·
[Screen-door transparency (DigitalRune)](https://digitalrune.github.io/DigitalRune-Documentation/html/fa431d48-b457-4c70-a590-d44b0840ab1e.htm) ·
[Godot dithered LOD proposal](https://github.com/godotengine/godot-proposals/issues/5240) ·
[Godot dither shader](https://github.com/samuelbigos/godot_dither_shader) ·
[Dither transparency tutorial](https://danielilett.com/2020-04-19-tut5-5-urp-dither-transparency/) ·
[Shaderbits: octahedral impostors](https://shaderbits.com/blog/octahedral-impostors) ·
[three.js octahedral impostors](https://discourse.threejs.org/t/octahedral-impostors-for-three-js/80318) ·
[Forest of octahedral impostors](https://discourse.threejs.org/t/a-forest-of-octahedral-impostors/85735) ·
[Simplygon: deviation & screen size](https://documentation.simplygon.com/SimplygonSDK_10.1.400.0/concepts/deviationscreensize.html) ·
[Nanite screen-space error metrics](https://deepwiki.com/liameitimie/learn-nanite/4.2-screen-space-error-metrics) ·
[GameDev.net: LOD determination](https://gamedev.net/forums/topic/483880-lod-determination/) ·
[meshoptimizer](https://github.com/zeux/meshoptimizer) ·
[meshoptimizer in three.js](https://discourse.threejs.org/t/mesh-simplification-using-meshoptimizer/63002) ·
[DLoD popping survey (arXiv)](https://arxiv.org/pdf/2510.09997v1)
