# Continuous Level of Detail (CLOD) — Implementation Handoff

**Project:** Carta Temporum harbour diorama (vanilla JS, vendored Three.js r160, no bundler, **no npm at runtime**)
**Status:** Implementation-handoff document. An implementer with only this doc + the repo can build the recommended work without re-research. No code has been changed yet.
**Recommended work:** a dither cross-fade transition layer (`web/js/lodfade.js`) over the existing discrete LODs (§5, §6).
**Companion plan:** `vertex_d_psp.md` (same directory, exists) — terrain vertex-displacement / pre-subdivided-plane plan; terrain CLOD is owned there (§4.2).
**Reference GPU (locked):** Apple M1 / GTX-1660-class is the 60 fps certification target. Dev machine is an Apple M4 — see the derating policy in §7.

> Naming note: the technique discussed as the "Hopkins Progressive Mesh" is **Hugues
> Hoppe's *Progressive Meshes*** (SIGGRAPH '96). This document uses Hoppe's
> terminology (edge collapse, vertex split, geomorph).

---

## 1. Repo orientation (read this before touching anything)

### 1.1 Engine / updaters contract

`web/js/render/engine.js` (236 lines) is the extracted rendering engine. It owns the
`WebGLRenderer` (WebGL2, `antialias: true`, pixel ratio ≤ 1.8 — `engine.js:52-58`),
the camera, OrbitControls, the PMREM env, the per-radius light rig, the bloom
composer, and the rAF loop. The loop (`engine.js:174-195`):

1. `preUpdateHook` (host tween), then `controls.update()` in overview only;
2. `modeHook(dt, t, now)` — the host's tour/overview camera book-keeping;
3. `frameHook(dt)` — audio;
4. `for (const a of updaters) a.update(t, camera)` (`engine.js:190`) — the
   `animated[]` array the host registers via `eng.setUpdaters(...)` (`engine.js:166`,
   called from `harbordiorama.js:598`);
5. render decision: `envOn && composer ? composer.render() : renderer.render(scene, camera)`
   (`engine.js:193-194`). **Studio mode (default) renders through the bloom
   EffectComposer**, i.e. into non-MSAA render targets — this kills
   alpha-to-coverage as a dither option (§5.1).

`web/js/harbordiorama.js` (967 lines) is the host: dynamic imports, scene CONTENT
assembly (`buildScene`, `:449-602`), the coordinate frame, the `animated[]` updaters,
tour mode, audio, DOM. **The transition layer touches only host/content code; the
engine is untouched.**

### 1.2 Host per-frame state (`carDio._*`)

Set in `modeHook` (`harbordiorama.js:932-958`):

- `carDio._tourPos` — the canoe's boat position `{x, z, heading}` while in tour
  (`:942`), `null` in overview (`:946`). The ship HD swap and hero gulls key off it.
- `carDio._camDist` — in tour, pinned to `built.radius * 0.18` (`:940`) so foliage
  stays at full detail around the boat; in overview, camera→target distance (`:955`).
  Flows into `trees.update(cam, carDio._camDist)` via the trees updater (`:503`).
- `carDio._cam` — the camera (`:957`).

Tour max cruise speed: `VMAX = 8.94` m/s (20 mph), `harborcanoe.js:508`; stepped
cruise input plumbed at `harborcanoe.js:715-724`. Use 8.94 m/s for all
"at max cruise" acceptance criteria.

### 1.3 Ship updater structure (the HD swap)

In `buildScene`, ships are built per record from `carta.harborShips`
(`harbordiorama.js:508-520`). Each ship's `inst` is a **cloned `Group` that shares
geometry and materials with its prototype** (`harbor3d.js:359-361` — comment says so
explicitly). The ships updater is an inline object pushed onto `animated`
(`harbordiorama.js:526-560`):

- Constants `HD_IN = 150, HD_OUT = 175, HD_CAP = 3` at `harbordiorama.js:525`.
- Per frame, `tp = carDio._tourPos` (tour only, `:527`); per ship,
  `d = Math.hypot(s.px - tp.x, s.pz - tp.z)` (`:533`) — **planar distance from the
  boat, not the camera**.
- Swap state machine `:534-546`: enter HD at `d < HD_IN` under `HD_CAP`, lazily
  building the HD model (`SWHD.shipInstance(s.type)`, `:535-543`); leave at
  `d > HD_OUT`; force base when not in tour (`:546`).
- **The pop**: `:547-548` flips `s.hd.inst.visible` / `s.inst.visible` in one frame.
- Matrix + sail animation are written **only to the live instance**
  (`:555-558` — `live = s.hdOn ? s.hd : s`).

Materials: base ships use shared `MeshLambertMaterial`s (`harbor3d.js:27-56`); HD
ships use shared `MeshStandardMaterial`s plus `LineBasicMaterial` ropes/ratlines
that are **already `transparent`** with opacity 0.85 / 0.55
(`harborshiphd.js:54-78`). HD `shipInstance` clones a cached prototype, **sharing
materials across all HD ships of a type** (`harborshiphd.js:1119-1127`) — so a
per-ship fade requires per-instance material clones (§5.3).

### 1.4 Tree tier vocabulary (`web/js/harbortrees.js`, 1010 lines)

- **Bands** (metres, diorama/metric path): `ULTRA = 130` (hero geometry),
  `NEAR = 280` (full geometry), `MID = 780` (billboard cross), `FAR = 2400`
  (billboard sprite) — `harbortrees.js:29-30`; NEAR/MID/FAR are **rescaled to the
  harbour radius** at `:37-42` (`NEAR = max(160, R*0.16)` etc.). Always read the
  rescaled values.
- **Caps** per band: `{ultra: 400, near: 2500, mid: 16000, far: 60000}` (`:31-32`).
- **Tiers**: one `InstancedMesh` per band × key (`makeTier`, `:589-597`;
  construction `:599-623`). Geometry bands (`ultra`/`near`) key by **variant**
  (nine silhouettes, `variantGeo(v, true|false)` at `:276`, hero vs normal);
  billboard bands (`mid`/`far`) key by **kind** (`palm`/`leaf`/`scrub`).
  `instanceMatrix` is `DynamicDrawUsage`; frustum culling is per-instance in JS
  (`im.frustumCulled = false`, `:593`).
- **Per-frame bucketing**: `updateMetric(camera, camDist)` (`:925-1002`) rewrites
  every visible instance's matrix + colour each frame: reveal gate by stable rank
  (`:934`, `:939`; rank computed at `:643-650`), distance² band pick (`:948`),
  cap-overflow drop (`:952`), then counts + `needsUpdate` uploads (`:958-968`).
- **Materials**: `foliageMat` is `MeshLambertMaterial` + `onBeforeCompile` wind
  shimmer / translucency patch (`:539-571`, `windT` uniform at `:538`, ticked at
  `:872`). Billboards are `MeshBasicMaterial` with `alphaTest: 0.42` and an
  `onBeforeCompile` camera-facing vertex patch (`billboardMat`, `:56-69`).
- Tree tiers do **not** cast shadows (only the town group and ships are flagged
  `castShadow` in `buildScene`).
- The legacy map-embedded path (`update(matrix)` via MapLibre, `:873-…`) must stay
  untouched — fades apply to the metric path only.

### 1.5 Test harness rules

- `node test/run.mjs` — zero-dependency characterization harness; re-execs with
  `--experimental-vm-modules` (`test/run.mjs:12-24`), collects `test/cases/*.mjs`
  plus the optional `test/cases/gl/` layer (`run.mjs:26-40`).
- `test/lib/stubs.mjs` drives the **unmodified** `harbordiorama.js`: it rewrites
  the 5 dynamic `import('/vendor/...')` calls, evaluates the source as a module in
  a vm sandbox, and pre-loads `web/js/render/engine.js` via `vm.Script`
  (`stubs.mjs:581-595`) and `harborterrain.js` likewise (`:632-636`). Collaborators
  (shipwright, canoe, trees, birds) are window-installed recording fakes — see
  `test/cases/07-updater-order.mjs` (updater drive pattern) and
  `10-mode-switch.mjs` (tour entry via the recorded `dio-tour` button click and a
  stub `cartaHarborCanoe`).
- Goldens: `test/lib/assert.mjs` `assertSnapshot(name, value)` canonicalizes
  (sorted keys, 6-sig-digit floats) and compares against `test/golden/<name>.json`;
  `UPDATE_GOLDEN=1` **writes** goldens (`assert.mjs:44-49`; banner at `run.mjs:74`).
  **Rule: existing goldens are never regenerated.** `UPDATE_GOLDEN=1` may be run
  only to capture goldens for NEW cases, and afterwards
  `git status --porcelain test/golden` must show only **added** files, never
  modified ones.
- The gl layer (`test/cases/gl/smoke.mjs`) auto-skips when the optional native
  `gl` module is absent (`smoke.mjs:14-20`). **headless-gl is WebGL1** — GLSL ES
  1.00 only (no `float[16](...)` const arrays); the gl dither case must generate
  its ES 1.00 shader from the JS Bayer array (§8.4). `package.json` exists for the
  harness only; `build.sh` ships `web/` + `data/` — **nothing from node_modules
  ever ships**.

### 1.6 Invariants

- **No npm at runtime.** Vendored three r160 under `web/vendor/`; plain
  `<script>` tags in `web/index.html:95-121` (load order matters — `lodfade.js`
  must load before `harbortrees.js` at `index.html:106` and `harbordiorama.js` at
  `:115`).
- **Determinism.** Rendering for a given camera pose must be a pure function of
  that pose: fades carry **no time term** (distance-driven only), the dither is
  keyed on `gl_FragCoord` (stable frame-to-frame). This is contractual (goldens).
- **Painterly aesthetic.** Flat-shaded, vertex-coloured, low-poly. No techniques
  that need TAA to hide noise (rules out `material.alphaHash`, §5.1).

---

## 2. Current-state audit (anchors verified against current code)

### 2.1 Inventory

| Subsystem | Mechanism | Thresholds | Evidence |
|---|---|---|---|
| **Ships** | Discrete swap: cloned base Group (shared materials) ↔ one-off HD shipwright model, lazily built, capped | `HD_IN = 150`, `HD_OUT = 175` m hysteresis, `HD_CAP = 3` | `harbordiorama.js:525` (constants), `:526-560` (updater), `:534-546` (state machine), `:547-548` (binary `visible` flip) |
| **Ship HD models** | High-detail builder (lofted hulls, `LineSegments` rigging, vertex-coloured sails), few k tris each | built on demand, `harbordiorama.js:535-543` | `web/js/harborshiphd.js` (1131 lines); clone shares materials `:1119-1127` |
| **Trees** | 4 distance bands × instanced tiers, per-frame frustum cull + distance bucketing, instance buffers rewritten every frame | `ULTRA=130, NEAR=280, MID=780, FAR=2400` (radius-rescaled `:37-42`); caps `:31-32` | `harbortrees.js:29-33`, `:589-623` (tiers), `:925-1002` (`updateMetric`), `:948` (band pick), `:952` (cap drop) |
| **Tree reveal gating** | Stable per-tree rank in `[0,1)` gates existence by camera distance; reveal 0.45 → 1.0 | `:934` formula | `harbortrees.js:643-650` (rank), `:930-939` (gate) |
| **Town** | Close-zoom tier tagged `userData.lod = true`; diorama keeps it always visible (instancing + culling carry it) | zoom gate legacy-only (z≈14.7) | `harbortown.js:9-10` (contract comment), `:713-718` (`mark()`), `:1874-1878`, `:2384-2400` (lod-tagged instanced sets) |
| **Gulls** | Hero-model swap near the seated viewer; head/tail articulation frozen at range | hero ~50 m of tour camera; articulation cutoff 250 m (`62500 = 250²`) | `harbordiorama.js:579-580`; `harborbirds.js:488-493` (cutoff), `:561-563` (`heroGull`), `:204` (16 vs 12 loft rings) |
| **Terrain** | Single baked grid, no LOD | step 9–30 m, ≤ ~230 cells | `harborterrain.js:174-177` |
| **Water** | Single sheet, ≤ 200×200 segments, vertex-animated | n/a | `harborterrain.js:911-913` |

### 2.2 Where popping is visible (the problem)

1. **Ship HD swap — worst pop.** `harbordiorama.js:547-548` flips visibility in one
   frame between unrelated topologies. The 25 m hysteresis prevents flicker, not
   the pop. Most visible paddling toward an anchored ship.
2. **Tree near↔mid boundary** (geometry → billboard cross): a 3-D canopy collapses
   to a painted quad cross in one frame (`harbortrees.js:948`). The tour constantly
   crosses this band. ultra↔near is milder (similar silhouettes).
3. **Tree reveal-rank popping** (`:939`) — deterministic but hard appears.
4. **Cap-overflow vanishing** (`:952`) — over-budget trees vanish with no fade.
5. **Gull articulation freeze at 250 m** (`harborbirds.js:488-493`) — barely
   perceptible; no action.
6. **Town lod tier** — never gates in the diorama; no pop; no action.

The scene has no triangle-count problem (whole-scene counts are low hundreds of
thousands worst case); it has **discrete-transition pops** (items 1–4). Per-frame
CPU instance rewriting (`harbortrees.js:925-1002`) and draw calls bound frame time,
not vertex throughput. That decides every verdict below.

---

## 3. Decision record

| Candidate | Verdict | Reason (compressed) |
|---|---|---|
| Runtime PM / streamed index buffers (Hoppe '96/'97) | **REJECT** | Adds CPU+upload load to the bound resource to relieve the unbound one. Meshes are 10²–10³ tris; a 5k-tri ship refined at 60 fps ≈ 1.8 MB/s of index upload + JS edit cost + GC churn, to save vertex work the GPU doesn't feel. Procedural flat-shaded geometry has attribute seams on nearly every edge (the gull builder deliberately explodes to non-indexed faces, `harborbirds.js:124-141`), so collapse ratios are poor exactly where the style lives. |
| Nexus / CORTO vendoring | **REJECT** | Built for multi-hundred-MB streamed scans; this project has 30 KB procedural ships generated in RAM. No input asset, nothing to stream, and the vendoring cost (JS runtime + CORTO WASM + C++ `nxsbuild`) is all downside in a no-npm static site. |
| Per-instance tree CLOD | **REJECT** | Structurally incompatible with `InstancedMesh` (one index buffer per draw); billboards already win the far field. The tree problem is the hard tier boundary, fixed by §5 for ~zero cost. `BatchedMesh` would be a rewrite of a working, tuned system for no gain. |
| Nanite-style cluster DAG | **REJECT** | Not portable to WebGL2 (no compute-driven draw submission, no 64-bit atomics); category error at this scale. WebGPU ports exist (Scthe/nanite-webgpu) but need WebGPU + WASM preprocessing. |
| `THREE.LOD` adoption | **REJECT** | The bespoke tier system (caps, reveal ranks, instancing) is better tuned; `THREE.LOD` has no cross-fade anyway. |
| `material.alphaHash` | **REJECT** | r160 has it built in, but hash noise needs temporal AA this renderer doesn't have; violates the determinism/painterly invariants. Ordered Bayer dither instead. |
| **Dither cross-fade on ship/tree transitions** | **RECOMMEND** | Kills every visible pop between already-paid-for LODs; works across unrelated topologies; deterministic; ~zero cost. This is the work specified in §5–§6. |
| Build-time meshopt LOD chain for HD ships | **DEFER** | Trigger + first step in §4.1. |
| Terrain CDLOD morph | **DEFER → `vertex_d_psp.md`** | Trigger + first step in §4.2. |

## 4. Deferred items — pickup conditions

#### 4.1 meshopt build-time LOD chain for HD ships — DEFERRED

- **Trigger (any of):** (a) Phase-0 measurement (§6, Phase 0) shows the HD-ship
  draw set costing > 1 ms GPU per frame on target-class hardware (> 0.6 ms
  measured on the M4 under the §7 derating); (b) `HD_CAP` is raised above 3;
  (c) a new ship type ships with > 10k tris.
- **First step:** `npm i -D meshoptimizer` (devDependency only — runtime stays
  dependency-free; `build.sh` never ships node_modules). Write
  `cmd/bake-ship-lods.mjs`: load `harborshiphd.js` in a vm sandbox (reuse the
  loader pattern in `test/lib/stubs.mjs:581-595` with the real vendored three),
  build each prototype, extract `BufferGeometry` position/index arrays, run
  `meshopt_simplify` to 50% and 25% index sets **sharing the vertex buffer**, and
  serialize them as a plain JS data file `web/js/models/shiplod.js`. Runtime then
  swaps `geometry.index` once per threshold crossing (O(1) `setIndex`, not
  per-frame streaming); geomorph is optionally available since vertex
  correspondence exists. This is the only PM-lineage technique in the plan and it
  lives offline, where Hoppe's machinery is cheap.

#### 4.2 Terrain CDLOD — DEFERRED to `vertex_d_psp.md` (exists, same directory)

- Today the terrain is a single ≤ ~230-cell grid (`harborterrain.js:174-177`) —
  fine as is; no terrain work in this plan.
- **Trigger:** the `vertex_d_psp.md` plan is picked up (i.e. when canoe-level
  beach/berm detail demands more grid density than the static ~230² grid, per that
  doc's §1), or any change pushes the land mesh past ~150k tris.
- **First step:** implement `vertex_d_psp.md` Phase 1 as written there. The right
  terrain CLOD is CDLOD-style **vertex-shader morphing** over quadtree patches
  (Strugar 2009) — zero index streaming, crack-free — not ROAM, not PM. The only
  contract this document imposes: any *discrete* boundary the terrain plan
  introduces must reuse the `lodfade.js` conventions (§5.2) so transitions feel
  uniform; the continuous morph itself is the CDLOD vertex lerp and needs no
  dither.

---

## 5. Design spec: the transition layer (`web/js/lodfade.js`)

**Principle: keep every existing LOD decision exactly where it is; add only a fade
dimension to the boundaries.** No new LOD selection logic, no index streaming, no
new runtime dependencies, engine untouched.

### 5.1 Locked technique decisions

- **`discard`, not alpha-to-coverage.** A2C requires an MSAA target; the default
  Studio render path goes through the bloom `EffectComposer`
  (`engine.js:193-194`), whose render targets are not multisampled — A2C would
  silently degrade to a binary alpha test exactly in the default mode. `discard`
  works identically in both render paths.
- **Ordered 4×4 Bayer keyed on `gl_FragCoord`**, not `alphaHash` — deterministic,
  stable frame-to-frame, no TAA needed.
- **Ships: per-object uniform on cloned materials** (§5.3). HD instances share
  prototype materials (`harborshiphd.js:1119-1127`), so a per-ship fade is
  impossible on shared materials; clone-per-HD-instance is bounded (≤ `HD_CAP`=3
  ships × ~17 materials) and, with a shared `customProgramCacheKey`, compiles
  **one** extra program per base material type, not per clone.
- **Trees: per-instance float attribute `aFade`** on shared tier materials (§5.4)
  — thousands of instances per draw rule out per-object uniforms.
- **Signed-coverage encoding** for exact complementary coverage (§5.2): the
  incoming LOD keeps the dither-covered fragment set, the outgoing LOD keeps
  exactly its complement; coverage sums to exactly 1 in the band (no
  double-bright, no gap flicker) using a single attribute/uniform and a single
  shader snippet.

### 5.2 `web/js/lodfade.js` — exact contents (~90 lines)

Plain script, repo style: `'use strict';` + `window.cartaLodFade = (function () { ... })();`
Include in `web/index.html` immediately **before** `<script src="/js/harbortrees.js">`
(currently line 106).

**Exports:**

```js
window.cartaLodFade = {
  BAYER4,          // Uint8Array(16), row-major 4×4 ordered-dither matrix, values 0..15
  fadeFor,         // (d, dNear, dFar) -> coverage in [0,1]
  ditherChunkGLSL, // string: the GLSL3 fragment snippet below (built from BAYER4)
  patchMaterial,   // (mat, { perInstance }) -> attaches the injection; returns mat
};
```

**`BAYER4`** (the standard 4×4 ordered-dither matrix; this JS array is the single
source of truth — the GLSL string and the WebGL1 test shader are both generated
from it):

```js
const BAYER4 = new Uint8Array([
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
]);
```

**`fadeFor`** — pure, time-free, the only fade-progress function in the codebase:

```js
// Coverage of the NEAR/HD LOD: 1 at d <= dNear, 0 at d >= dFar, smoothstep between.
function fadeFor(d, dNear, dFar) {
  const t = Math.min(1, Math.max(0, (d - dNear) / (dFar - dNear)));
  return 1 - t * t * (3 - 2 * t);
}
```

**Fragment snippet (GLSL3 — three r160 compiles WebGL2 shaders as
`#version 300 es`, so const array initializers and integer ops are legal).**
Injected by replacing `#include <clipping_planes_fragment>` (the first include
inside `main()` in the lambert/standard/basic fragment shaders — discards early,
before lighting):

```glsl
const float LODF_BAYER[16] = float[16](
   0.0,  8.0,  2.0, 10.0,
  12.0,  4.0, 14.0,  6.0,
   3.0, 11.0,  1.0,  9.0,
  15.0,  7.0, 13.0,  5.0);
float lodfThreshold() {
  int ix = int(gl_FragCoord.x) & 3;
  int iy = int(gl_FragCoord.y) & 3;
  return LODF_BAYER[iy * 4 + ix] / 16.0 + 1.0 / 32.0;   // (b + 0.5)/16: thresholds in (0,1)
}
// vLodFade: signed coverage. |v| = coverage c in [0,1].
//   v >= 0: KEEP the covered set      (incoming LOD)  -> discard when NOT covered
//   v <  0: KEEP the complement set   (outgoing LOD)  -> discard when covered
// c = 1.0 keeps every fragment (max threshold = 15/16 + 1/32 = 0.96875 < 1.0);
// c = 0.0 discards every fragment on the v >= 0 branch.
{
  float lodfC = abs(vLodFade);
  bool lodfCovered = lodfC >= lodfThreshold();
  if (lodfCovered == (vLodFade < 0.0)) discard;
}
#include <clipping_planes_fragment>
```

Complementarity is exact: for the same pixel and the same magnitude `c`, the
`+c` instance keeps the fragment iff the `-c` instance discards it.

**`patchMaterial(mat, { perInstance })`** — composition-safe injection:

```js
function patchMaterial(mat, opts) {
  const perInstance = !!(opts && opts.perInstance);
  if (!perInstance) mat.userData.uLodFade = { value: 1.0 };
  const prev = mat.onBeforeCompile;                       // compose with foliage/billboard patches
  mat.onBeforeCompile = (sh, renderer) => {
    if (prev) prev(sh, renderer);
    if (perInstance) {
      // declaration + varying plumbed through the vertex stage
      sh.vertexShader = 'attribute float aFade;\nvarying float vLodFade;\n'
        + sh.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\n  vLodFade = aFade;');
    } else {
      sh.uniforms.uLodFade = mat.userData.uLodFade;
      sh.vertexShader = 'uniform float uLodFade;\nvarying float vLodFade;\n'
        + sh.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\n  vLodFade = uLodFade;');
    }
    sh.fragmentShader = 'varying float vLodFade;\n'
      + sh.fragmentShader.replace('#include <clipping_planes_fragment>', ditherChunkGLSL);
  };
  const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
  mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|lodfade' + (perInstance ? 'I' : 'U');
  return mat;
}
```

Notes:
- `billboardMat` replaces `#include <project_vertex>`, `foliageMat` replaces
  `#include <begin_vertex>` — both leave `begin_vertex` / the other include
  intact, so composition via the `prev` call is safe. **Order: `patchMaterial`
  must be called after the material's own `onBeforeCompile` is assigned** (it
  wraps it). `MeshBasicMaterial`'s shader also contains both includes; verified
  pattern in three r160's `meshbasic` glsl.
- `onBeforeCompile` must be attached before the material's first render — both
  integration points (§5.3, §5.4) do this at material-creation time.
- The dither composes with the billboards' `alphaTest: 0.42` (independent
  discards). Where the billboard texture is transparent the complement-sum breaks
  locally; acceptable — the painterly billboards never read as solid silhouettes
  anyway. Note in the risk table.
- `fadeFor` and the snippet contain **no time term, no `Date`/`performance`
  reference** — enforced by test 13 (§8.2).

### 5.3 Ship HD↔base cross-fade — integration in `harbordiorama.js`

All edits live inside `buildScene`'s ships updater (`harbordiorama.js:521-561`).
`HD_IN = 150 / HD_OUT = 175 / HD_CAP = 3` are **untouched**; the `hdOn` state
machine (`:534-546`) keeps owning lazy build, cap accounting and hysteresis.

**Constants:** `const FADE_W = 10; // m — fade band [HD_IN - FADE_W, HD_IN] = [140, 150]`

**Fade and the state machine (per ship, per frame), v1 = fade the HD model only;
the base ship simply stays visible underneath until the HD is fully opaque:**

```
f = (s.hdOn && tp) ? LF.fadeFor(d, HD_IN - FADE_W, HD_IN) : 0     // pure in d
                                                                   // d from :533 (boat-planar)
s.hd.inst.visible = s.hdOn && f > 0
s.inst.visible    = !s.hdOn || f < 1
each HD fade uniform u.value = f                                   // s.hd.fadeU array, see below
each HD line material  .opacity = baseOpacity * f                  // ropes/ratlines
s.hd.inst.userData.lodFade = f; s.inst.userData.lodFade = 1        // observability (test 14, ?lodstats)
```

Resulting states (who renders, who sets `.visible` — only this updater, lines
currently at `:547-548`):

| Condition | base `.visible` | HD `.visible` | HD fade |
|---|---|---|---|
| `!hdOn` (incl. `d > 175` after exit, or overview) | true | false | — |
| `hdOn && d >= 150` (hysteresis zone 150–175, retreating) | true | false (`f = 0`) | 0 |
| `hdOn && 140 < d < 150` (**the band — both rendered, 10 m ≤ 25 m**) | true | true | `fadeFor(d,140,150)` ∈ (0,1) |
| `hdOn && d <= 140` | false (`f = 1`) | true | 1 |

Approach at max cruise (8.94 m/s) crosses the 10 m band in ~1.1 s — a full dither
ramp, no pop. Retreat is symmetric through the band; the hysteresis zone now
matters only for build/cap churn, never visually (the dither hides re-entry).

**Matrix + animation while both are visible** (today only the live instance gets
them, `:555-558`): when `s.inst.visible && s.hd && s.hd.inst.visible`, copy `m`
into **both** `inst.matrix`es and run the billow/flutter loops for **both** anim
sets (cost: ≤ 3 ships × a few sails; negligible). Outside the band, exactly
today's single-instance writes.

**Material cloning (once, at HD build time — extend the lazy-build block
`:536-543`):** after `scene.add(s.hd.inst)`,

```js
s.hd.fadeU = []; s.hd.lineMats = [];
s.hd.inst.traverse((o) => {
  if (o.isMesh && o.material) {
    o.material = o.material.clone();              // per-ship fade needs per-ship material
    LF.patchMaterial(o.material, { perInstance: false });
    s.hd.fadeU.push(o.material.userData.uLodFade);
  } else if (o.isLine && o.material) {
    o.material = o.material.clone();              // already transparent; fade via opacity
    s.hd.lineMats.push({ m: o.material, base: o.material.opacity });
  }
});
```

Guard everything behind `const LF = window.cartaLodFade; if (!LF) { /* exactly
today's binary :547-548 path */ }` — feature detection is the rollback story
(§9). Clone cost: one-time per HD ship build (already a lazy, accepted hitch);
program count: +2 (one Standard-variant, one for any Basic/emissive variant)
thanks to the shared cache key. Per-frame cost: setting ≤ 3 × ~17 uniform values —
zero allocation.

**Not in v1:** dithering the base ship out (complementary `-f` on the base). The
base stays fully covered under the dithering HD; they overlap in depth and the HD
simply wins where it draws. If A/B screenshots at d ≈ 145 show objectionable
double-structure (sails of both rigs visible), v2 adds `patchMaterial` with
`perInstance: false` on **cloned base materials for in-band ships only** carrying
`-f`. Decision procedure: §10.

### 5.4 Tree tier boundary fade — integration in `harbortrees.js`

All edits live in `init` (metric branch, `:601-615`), `makeTier` (`:589-597`) and
`updateMetric` (`:925-1002`). Legacy path untouched.

1. **Attribute.** In `makeTier`, add a cap-sized instanced attribute, prefilled
   with 1.0 (full coverage — so untouched slots and the legacy path render exactly
   as today):

   ```js
   const aFade = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1);
   aFade.setUsage(THREE.DynamicDrawUsage);
   geo.setAttribute('aFade', aFade);
   ```

   Apply `LF.patchMaterial(mat, { perInstance: true })` to every **metric-path**
   tier material (foliage and billboard) at creation in `init`, after their own
   `onBeforeCompile` is set. `underMesh`/`logMesh` are out of scope (near-band
   dressing; their range pop is invisible at `NEAR`).

2. **Band margins.** After the radius rescale (`:37-42`), compute per-boundary
   fade half-widths and their squared edge distances once:

   ```js
   const FW = (B) => Math.min(12.5, B * 0.04);     // half-width, m: both-rendered span 2·FW ≤ 25 m
   // boundaries: ULTRA, NEAR, MID   (FAR keeps its hard cut — sprites at FAR are sub-pixel)
   // precompute (B-FW)² and (B+FW)² per boundary; updateMetric compares d² first and
   // takes the sqrt only for trees inside a margin zone (a few % of the field).
   ```

3. **Bucketing rewrite (`:938-957`).** For each surviving tree, after the band
   pick at `:948`:
   - Compute the per-tree coverage modifier
     `rf = clamp((reveal - t.rank) / 0.03, 0, 1)` — the reveal fade (replaces the
     hard `> reveal` cut at `:939` with: skip only when `rf === 0`).
   - If `d²` lies inside a boundary's margin zone `((B-FW)², (B+FW)²)`:
     `tNorm = (sqrt(d2) - (B - FW)) / (2*FW)`; inner-tier coverage
     `c = (1 - tNorm*tNorm*(3-2*tNorm)) * rf` (same smoothstep as `fadeFor`).
     Write the tree into **both** adjacent tiers — inner tier slot gets
     `aFade = +c`, outer tier slot gets `aFade = -c` (exact complement, §5.2) —
     each write also doing the existing `setMatrixAt`/`setColorAt` (geometry bands
     use `t.gm`, billboard bands `t.bm`, per the `:949-954` key/geometry rules).
     A dual-written tree consumes one slot in each tier's cap, as the budget
     intends.
   - Otherwise: single write as today with `aFade = rf` (almost always 1.0).
   - **Cap softening** at `:952`: when writing slot `i` in a band with cap `C`,
     if `i >= 0.95*C`, multiply the slot's coverage magnitude by
     `(C - i) / (0.05*C)` (sign preserved). Deterministic per pose (tree iteration
     order is fixed).
   - Clamp coverage magnitude to a floor of `1/32` on the `-c` side (avoid `-0`).
   - In the upload block (`:958-968`), add
     `tier.geometry.attributes.aFade.needsUpdate = true` next to the existing
     `instanceMatrix` flag. **Zero per-frame allocation**: all writes go into the
     preallocated `Float32Array`s, same as the matrix path.

   Write traffic: +4 B per instance per frame on top of the existing 64 B matrix
   + 12 B colour (~+5%); dual-writes add < 10% instances (margin zones are thin).

4. **Determinism.** `c` is a pure function of camera pose and the tree's stable
   position/rank — no time term anywhere (the wind shimmer `windT` already
   animates and is out of scope/unchanged).

---

## 6. Phased plan — numbered tasks, acceptance, verification

### Phase 0 — Measurement baseline (½ day; can falsify the deferred §4.1)

1. Add a debug overlay behind `?lodstats` (host-side, `harbordiorama.js`):
   `renderer.info.render.calls / .triangles`, `trees.stats`
   (`harbortrees.js:1008`), and `performance.now()` brackets around
   `updateMetric` and the ships updater (accumulated, displayed at ~2 Hz).
   The overlay must not run (nor allocate) without the flag.
2. Record on the M4: overview orbit + full canoe tour at max cruise past an
   anchored ship and along the shoreline. Record the per-section numbers.
3. Budgets (target-class; see §7 for the M4 derating): frame ≤ 16.6 ms; JS
   updaters total ≤ 4 ms; `updateMetric` ≤ 2.5 ms at the worst tour viewpoint.

**Acceptance:** overlay shows live numbers in both modes; zero overhead without
the flag. **Verification:** `node --check web/js/harbordiorama.js`;
`node test/run.mjs` green (overlay code must not disturb the recorded
constructor/DOM shapes the goldens capture — keep it inside the `?lodstats`
guard).

### Phase 1 — `lodfade.js` + ship HD↔base cross-fade (1 day)

1. Create `web/js/lodfade.js` exactly per §5.2. `node --check web/js/lodfade.js`.
2. Add `<script src="/js/lodfade.js"></script>` to `web/index.html` before line
   106 (`harbortrees.js`).
3. Implement §5.3 in the ships updater (`harbordiorama.js:521-561`), guarded on
   `window.cartaLodFade`.
4. Add test case 13 and the stubs loader extension (§8.2); capture its golden
   with `UPDATE_GOLDEN=1`.
5. Add test case 14 (§8.3); capture its golden.

**Acceptance:**
- No visible pop at the 150 m ship boundary when paddling toward an anchored ship
  at max cruise (8.94 m/s); ramp reads as a brief dissolve (~1.1 s).
- Both-LODs-rendered band ≤ 25 m (spec: 10 m).
- Outside the band: bit-identical behaviour to today (single visible instance,
  no extra uniform writes beyond `f`-clamping, no clones until first HD build).
- Ships-updater frame-cost delta ≤ 0.3 ms on the dev machine (M4, `?lodstats`,
  worst case: 3 in-band ships).
- A/B screenshots at d = 149 m vs 151 m and d = 141 m vs 139 m differ only by
  dither ramp / final swap state.

**Verification:** `node --check` on both touched JS files; `node test/run.mjs` —
all pre-existing cases green, `git status --porcelain test/golden` shows only
added `lod-fade.json` / `ship-swap-band.json`.

### Phase 2 — Tree tier fades (1–2 days)

1. Implement §5.4 steps 1–2 (`makeTier` attribute, material patching, margin
   precompute).
2. Implement §5.4 step 3 (`updateMetric` dual-write + reveal fade + cap
   softening).
3. Extend case 13's golden table? **No** — goldens are never regenerated; add the
   tree fade maths as a NEW case 15 (§8.5) with its own golden.

**Acceptance:**
- near↔mid boundary invisible at tour speed (no "cardboarding" ribbon ~NEAR
  metres ahead of the canoe); ultra↔near and reveal appears dissolve.
- Both-tiers-rendered span ≤ 25 m per boundary (spec: `2·min(12.5, 0.04·B)`).
- `updateMetric` delta ≤ 0.3 ms on the M4 at the worst tour viewpoint vs the
  Phase-0 baseline (margin dual-writes < 10% extra instances; shrink `FW` if
  threatened).
- Zero per-frame allocation delta (DevTools allocation sampling over 60 s of
  tour: no new recurring allocations from the fade path).
- Legacy (non-metric) path: byte-identical behaviour (attribute exists, all 1.0,
  materials unpatched).

**Verification:** `node --check web/js/harbortrees.js`; `node test/run.mjs`
green; only the new case-15 golden added.

### Phase 3 — OPTIONAL, gated: meshopt LOD chain

Closed unless a §4.1 trigger fires; if Phase-0/1 numbers show HD ships cheap
(expected), record the measured numbers HERE and mark §4.1 trigger (a) as
checked-and-not-fired, with the date and the numbers.

### Definition of Done (Phases 0–2)

- [ ] `node --check` clean on every touched file (`lodfade.js`,
      `harbordiorama.js`, `harbortrees.js`).
- [ ] `node test/run.mjs`: all cases PASS (gl cases may SKIP without `gl`);
      **zero modified files under `test/golden/`**, only `lod-fade.json`,
      `ship-swap-band.json`, `tree-band-fade.json` (+ gl golden if captured) added.
- [ ] New cases 13, 14, 15 (+ gl dither case) present and green.
- [ ] §6 acceptance criteria measured and noted (numbers recorded in this file's
      Phase sections) on the M4 under the §7 derating.
- [ ] One validation run on M1 / GTX-1660-class hardware before sign-off: full
      tour at max cruise holds 60 fps (1% lows ≥ 55), former pop sites visually
      clean.
- [ ] No change to `web/js/render/engine.js`, no new runtime dependency, no
      change to `build.sh` inputs beyond the two web files + one include line.

### Rollback notes

- The integration is feature-detected: deleting the `lodfade.js` include (or the
  file) reverts ships to the exact `:547-548` binary swap and leaves trees
  rendering with the all-1.0 attribute (= today's hard cuts) — **provided the
  guards in §5.3/§5.4 are kept**; treat the guards as part of the spec.
- Full revert = `git revert` of the Phase commits; no data, golden, or engine
  migration to unwind. New goldens belong to new cases, so reverting code +
  cases + goldens together leaves the suite exactly as before.
- If only the tree fade misbehaves: `FW = () => 0` disables dual-writes (hard
  cuts return) without touching the ship path.

---

## 7. Performance budgets + measurement derating policy (locked)

- **Certification target:** 60 fps on Apple M1 / GTX-1660-class ("mid-tier
  reference device" — resolved, no longer open).
- **Derating (dev machine is Apple M4):** any frame-time budget B that must hold
  on the target certifies locally only if the M4 measures **≤ 0.6 × B**. So:
  frame ≤ 10 ms on the M4 (for the 16.6 ms target), updaters total ≤ 2.4 ms,
  `updateMetric` ≤ 1.5 ms. Per-phase *delta* budgets (≤ 0.3 ms) are M4-measured
  numbers as written.
- **One validation run on target-class hardware before sign-off** (DoD item).
  Measure 1% lows over a scripted tour segment, not just the mean; plus draw
  calls (within +4 of baseline — ≤ 3 dual-rendered ships and the tree tiers add
  no draws), instance-upload bytes (within +6% — the aFade attribute), and a 60 s
  heap-allocation delta (the fade path allocates nothing per frame).

---

## 8. Verification detail — the new test cases

### 8.1 Existing suite

`test/cases/00-12` characterize the engine loop, composer, lifecycle, updater
order, mode switch. The transition layer changes none of those contracts
(`render/engine.js` untouched; the ships updater keeps its position and call
shape in `animated[]` — case 07's order golden is unaffected). They must stay
green un-regenerated.

### 8.2 `test/cases/13-lod-fade.mjs` — pure fade maths (new golden `lod-fade.json`)

- Stubs extension: add `loadLodFade()` to `test/lib/stubs.mjs` mirroring the
  terrain loader (`stubs.mjs:632-636`): read `web/js/lodfade.js`, run as
  `vm.Script` in a bare window context, return `win.cartaLodFade`.
- Assertions (exact):
  - `fadeFor(140, 140, 150) === 1`, `fadeFor(150, 140, 150) === 0`,
    `fadeFor(145, 140, 150) === 0.5`, `fadeFor(0,...) === 1`,
    `fadeFor(1e9,...) === 0`;
  - monotonic non-increasing over `d = 138..152` step 0.25;
  - determinism: two calls with identical args strictly equal; **source-level
    check**: the `lodfade.js` source contains no `performance.`, `Date.`,
    `Math.random` substrings (the contractual no-time-term guarantee);
  - `ditherChunkGLSL` contains `discard` and all 16 `BAYER4` values.
- **Golden snapshot** (`assertSnapshot('lod-fade', …)`):
  `{ bayer: [...BAYER4], samples: fadeFor(d, 140, 150) for d = 138..152 step 1 }`.
  This pins the matrix and the curve; any future change to either is a deliberate
  golden change in a NEW case, never a regeneration.

### 8.3 `test/cases/14-ship-swap-band.mjs` — transition-determinism characterization (new golden `ship-swap-band.json`)

Drive the real, unmodified ships updater through the stub host, exactly the
07/10 pattern:

- Install a stub `cartaHarborCanoe` (as `10-mode-switch.mjs:16-24`) whose
  `boatPos()` returns the next entry of a scripted position list, placing the
  boat at planar distances `[200, 174, 160, 149, 145, 141, 139, 145, 151, 176, 145]`
  from a single stubbed ship (one `carta.harborShips` record; stub
  `cartaShipwright`/`cartaShipwrightHD` recording fakes per case 07, with
  `shipInstance` returning insts whose `traverse` exposes one fake mesh with a
  clonable material object — the lazy HD build path must succeed).
- Enter tour via the recorded `dio-tour` click handler; tick the loop once per
  scripted distance (the stub rAF drive case 07 uses).
- After each tick, record `{ d, baseVisible: s.inst.visible, hdVisible:
  s.hd?.inst.visible ?? false, fade: s.hd?.inst.userData.lodFade ?? null }`
  (the updater writes `userData.lodFade` per §5.3 precisely so this is
  observable; `visible` flags are on the fake insts).
- **Golden snapshot**: the full sequence. It must show: base-only at 200/174/160
  (no entry — `hdOn` flips only below `HD_IN = 150`); dual-visible with
  `0 < fade < 1` at 149/145/141; HD-only at 139; dual again at 145 retreating;
  base-only with `hdOn` still latched at 151 (`fade 0`, `hdVisible false` — the
  hysteresis zone); exit past 176; re-entry dual at the final 145. Hysteresis
  (`HD_OUT`) and `HD_CAP` accounting thereby proven preserved.
- Determinism: run the same scripted sequence twice in one case; assert the two
  recordings deep-equal before snapshotting.

### 8.4 `test/cases/gl/lod-dither.mjs` — real-GL pattern lock (new golden, auto-skips)

- Auto-skip without `gl`, per `gl/smoke.mjs:14-20`. **headless-gl is WebGL1**, so
  do NOT paste `ditherChunkGLSL` (GLSL3). Instead `loadLodFade()` (§8.2) and
  generate an ES 1.00 fragment shader in JS from `BAYER4` (an if-chain or a
  `mod()`-based lookup over the 16 values, threshold formula `(b + 0.5)/16` —
  same numbers, same comparison `c >= thr` keep-covered semantics).
- Render a fullscreen quad at 64×64 with coverage 0.5; `readPixels`; snapshot
  `{ keptFraction025, keptFraction05, keptFraction1, hashOfBuffer05 }` (hash =
  hex of a simple FNV-1a over the pixel buffer). `keptFraction1 === 1.0` proves
  the c = 1 keep-all property; 0.5 must land within 1/16 of 0.5.
- Frame-to-frame stability: render twice, assert the two buffers byte-identical
  **before** snapshotting (this is the no-TAA determinism proof).

### 8.5 `test/cases/15-tree-band-fade.mjs` — tree fade maths (new golden `tree-band-fade.json`)

The dual-write maths is embedded in `updateMetric`; characterize it through the
real `harbortrees.js` loaded standalone (vm.Script, like the terrain loader) with
a metric frame stub: `init` a hand-placed field of ~6 trees straddling the NEAR
boundary ± margin, stub camera at known position, call
`trees.update(camera, camDist)` once, then read back each tier's `count` and the
written `aFade` values/matrix slots from the recorded `InstancedBufferAttribute`
fakes. Snapshot `{ tierCounts, fades }`. Asserts: in-margin trees appear in both
tiers with `+c`/`-c` of equal magnitude; out-of-margin trees appear once with
fade 1; rank-gated tree appears with `rf < 1`. Run twice → identical (pose-pure).

### 8.6 Manual pass

Scripted tour watching the three former pop sites (§2.2 items 1–3) with
`?lodstats` confirming budgets — on the M4 per §7, once on target-class hardware
for sign-off.

---

## 9. Out of scope / do not touch

- `web/js/render/engine.js` — no edits; the loop/updater/render-decision
  contracts are golden-locked (cases 00-12).
- Terrain and water (`harborterrain.js`) — owned by `vertex_d_psp.md` (§4.2).
- Town lod tier (`harbortown.js`) — never pops in the diorama; leave the zoom
  gate and `mark()` alone.
- Gull articulation cutoff (`harborbirds.js:488-493`) — imperceptible; no fade.
- `underMesh`/`logMesh` tree dressing; the legacy (MapLibre) tree path; the
  `FAR` outer cut (sub-pixel sprites).
- Existing goldens under `test/golden/` — never regenerate.
- `HD_IN`/`HD_OUT`/`HD_CAP`, tree band radii/caps, reveal formula constants —
  tuned values, unchanged; the fade layer only wraps them.
- No new runtime dependencies; no bundler; no changes to `build.sh`/deploy.

---

## 10. Open items (implementer-assigned, with decision procedure)

1. **Ship base-side complementary fade (v2 of §5.3).** Decide after Phase 1:
   capture A/B screenshots at d ≈ 145 m (mid-band). If the doubled rig
   (both ships' sails simultaneously legible) is objectionable, add cloned,
   `-f`-patched base materials for in-band ships only; re-run case 14 (its
   golden then belongs to a NEW case or this is a deliberate, reviewed golden
   change for the new behaviour — prefer extending as case 14b).
2. **`FADE_W` / `FW` tuning.** Start at the §5.3/§5.4 values (10 m ships;
   `min(12.5, 0.04·B)` trees). Procedure: if a §6 delta budget is breached,
   halve the tree `FW` first (dual-writes are the only scaling cost); if the
   dither ramp is perceptible as stipple at max cruise, widen toward the 25 m
   ceiling — never past it.
3. **Shadow-pass pops** (ships cast shadows; the depth material is not dither
   patched, so the cast shadow still swaps binarily at f 0↔1 edges). Expected
   imperceptible (both ships shadow the same water). Procedure: if visible in
   the Phase-1 manual pass, set `customDepthMaterial` on HD meshes with the same
   patch — a bounded follow-up, not v1.

---

## Appendix A — research survey (compressed; kept for the rejection record)

- **Hoppe '96 *Progressive Meshes***: coarse base mesh + ordered vertex splits;
  any intermediate mesh reachable; geomorphs from explicit vertex correspondence.
  Runtime cost = CPU index/vertex edits streamed to GPU per frame — designed for
  one huge scanned mesh, the opposite of this scene's cost profile.
  [Paper](https://cseweb.ucsd.edu/~viscomp/classes/cse163/sp18/hoppe96.pdf),
  [Wikipedia](https://en.wikipedia.org/wiki/Progressive_meshes).
- **Hoppe '97 view-dependent PM**: per-frame vertex-hierarchy refinement; same
  economics. [Paper](https://people.eecs.berkeley.edu/~jrs/meshpapers/Hoppe.pdf).
- **ROAM '97**: bintree split/merge terrain CLOD; superseded by brute-force grids
  + GPU. Modern descendant **CDLOD** (Strugar 2009,
  [github.com/fstrugar/CDLOD](https://github.com/fstrugar/CDLOD)): quadtree
  patches + vertex-shader morph — the §4.2 terrain direction.
- **meshoptimizer** ([meshoptimizer.org](https://meshoptimizer.org/)):
  `meshopt_simplify` emits new index buffers over the existing vertex buffer
  (LOD chains + geomorph correspondence); official JS/WASM build runs in a plain
  Node script at build time — fits the no-runtime-dependency constraint (§4.1).
- **Nexus** ([github.com/cnr-isti-vclab/nexus](https://github.com/cnr-isti-vclab/nexus)):
  batched multiresolution DAG streamed over HTTP for multi-hundred-MB scans;
  no input asset and nothing to stream here; rejected.
- **Nanite** ([Epic docs](https://dev.epicgames.com/documentation/unreal-engine/nanite-virtualized-geometry-in-unreal-engine)):
  cluster-DAG meshlets, GPU-driven cut + software raster; not portable to WebGL2;
  WebGPU hobby port exists ([Scthe/nanite-webgpu](https://github.com/Scthe/nanite-webgpu));
  category error at this scale.
- **Dithered LOD cross-fade**: the industry-standard small-mesh answer (every
  major engine ships it); pairs with discrete LOD, works across unrelated
  topologies; three r160 alternative `material.alphaHash` rejected (needs TAA).
