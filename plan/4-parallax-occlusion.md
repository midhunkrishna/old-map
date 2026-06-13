# Parallax Occlusion Mapping (POM) for the Harbour Diorama — implementation handoff

**Goal.** Fake geometric detail in the fragment shader — "the illusion of polygons" — so brick courses,
plank gaps, roof tiles and cobbles read as real relief at canoe/close-zoom range, with zero added
geometry, at 60 fps on the certified reference GPU (three.js r160, WebGL2, vanilla JS, no bundler,
vendored `web/vendor/three.module.min.js`).

**Status of this document.** Every `file:line` anchor below was verified against the working tree at
commit `b493d27`. All previously open questions are resolved inline (§4.3, §4.4, §9). An implementer
should need only this doc + the repo.

**Hard constraints.**
- Deterministic painters for any canvas that feeds POM (albedo and relief must agree stroke-for-stroke).
- No npm/bundler in prod — plain JS + `onBeforeCompile` string patches, loaded by `<script>` tag.
- `node test/run.mjs` stays green (cases `test/cases/00..12` + `gl/smoke`); **goldens in `test/golden/`
  are never regenerated** (`UPDATE_GOLDEN=1` is forbidden for this work).
- Painterly, engraved-chart art style: **subtle relief, not photoreal**. POM amplifies the painted look.

**Locked decisions.**
1. **Reference GPU: Apple M1 / GTX-1660-class is the 60 fps certification target.** The dev machine is
   an Apple M4, which is substantially faster. **Derating policy:** all locally measured budgets must
   hold at **≤ 60 % of the frame budget on the M4** (i.e. p95 ≤ 10 ms at dpr 1.8 where the target is
   16.6 ms on M1-class), and **one validation pass on M1/GTX-1660-class hardware is required before POM
   ships enabled by default**. Layer-count and fade defaults are tied to the gfx-tier system (§5.6),
   never to dev-machine feel.
2. Self-shadowing OFF in v1 (§5.7). Ship hulls get native `bumpMap`, not POM (§5.1).
3. The determinism refactor of the painters lands as its own commit before any shader work (Phase 1a).

---

## 1. Repo orientation (read first)

- **Module convention.** Every `web/js` file is a plain script that hangs one factory off `window`
  (`window.cartaTownBuilder` in `harbortown.js:13`, `window.cartaShipwrightHD` in `harborshiphd.js:21`,
  `window.cartaRenderEngine` in `render/engine.js:38`). Scripts load via `web/index.html` tags
  (lines 93–127); there is no import graph apart from the three.js importmap (line 13).
- **Canvas-painter idiom.** Textures are 2D-canvas paintings cached in `texCache`
  (`harbortown.js:90`) through `canvasTex(key, w, h, paint, repeat)` (`harbortown.js:91-101`:
  creates the canvas, runs `paint(ctx, w, h)`, wraps in `CanvasTexture`, sets `RepeatWrapping` iff
  `repeat`, `anisotropy = 4`). The ship painter `plankTexture` (`harborshiphd.js:27-52`) is the
  **determinism precedent**: a seeded Lehmer LCG (`let rnd = 13; rnd = (rnd * 16807) % 2147483647`,
  lines 32–33). `harbortown.js` also uses positional hashes for placement determinism
  (`dhash` at `harbortown.js:781-784`, `yr` at `harbortown.js:1631-1634`) but its painters still call
  raw `Math.random` (facade weathering `harbortown.js:112-114`, roof shingles `371-372`, masonry
  stones `390-392`, street gravel `414-416`) — tolerated today because paint never moves geometry.
- **Instancing.** `addInst(geo, mat, specs, opts)` (`harbortown.js:761-775`) builds one
  `InstancedMesh` per harbour per spec list around per-harbour anchor groups (double-precision
  inverse multiply in JS, `harbortown.js:720-736`). **Materials are shared across harbours and
  instances** — patch count = material count, not building count. Per-instance tint via
  `setColorAt` multiplies *after* the map sample, so POM (which only bends the UV) composes free.
- **lod gating.** `mark(mesh)` (`harbortown.js:718`) tags close-zoom meshes `userData.lod = true`;
  `addInst(..., { lod: true })` routes through it. Wall/roof/street meshes are NOT lod-gated (always
  visible in the diorama); only clutter is.
- **Harness rules.** `test/run.mjs` re-execs node with `--experimental-vm-modules` and runs every
  `test/cases/*.mjs` + `test/cases/gl/*.mjs`. The stub host (`test/lib/stubs.mjs`) evaluates ONLY
  `harbordiorama.js`, `harborterrain.js`, `render/engine.js` in a vm sandbox with recording fakes;
  `harbortown.js` is **not** loaded there (`window.cartaTownBuilder` is absent, so the diorama's town
  step is skipped via its try/catch at `harbordiorama.js:483-493`). Consequences: (a) changes confined
  to `harbortown.js` + a new `pom.js` cannot break cases 00–12; (b) **do not add an entry to the
  diorama's `animated[]` array** (`harbordiorama.js:479-503`, fed to `eng.setUpdaters` at line 598) —
  case 07/`updater-order` goldens count those updaters. POM needs no per-frame uniform anyway (§5.4).
- **gfx tiers.** `probeGfx()` (`web/js/app.js:1023-1048`): tier 0 no GL, 1 software GL, 2 WebGL1,
  3 WebGL2; user override via `localStorage.cartaGfxTier`. The diorama is offered at tier ≥ 3 only
  (`harbordiorama.js:16`), so **every POM context is WebGL2 / GLSL ES 3.00** — `dFdx/dFdy`,
  `textureLod`, `textureSize`, `transpose()` are core, no extension dance.
- **The builder call.** `harbordiorama.js:486`: `town = window.cartaTownBuilder(THREE, carta,
  SW.materials())` — `carta.gfx.tier` is reachable inside the builder; all tier wiring lives in
  `harbortown.js`, zero edits to `harbordiorama.js`/`engine.js`.

## 2. Out of scope / do not touch

- **The vertex-colour painterly look stays.** Instance tints (`harbortown.js:1638-1644`), street
  ribbon RGBA taper (`ribbonGeo` `harbortown.js:619,628`), terrain vertex colours — untouched.
- **The water shader (`harborterrain.js:923-1110`) is untouched.** It already perturbs normals
  analytically (`986-991`) and ray-marches the shore field (`1019-1028`).
- **Terrain hachure cloth** (`hillTexture` `harborterrain.js:892-907`, 512², repeat 5×5) stays flat —
  engraved-map style. The wet-band `onBeforeCompile` patch (`harborterrain.js:255-270`) stays as-is
  (it is the injection precedent POM copies, not a target).
- **Rock outcrops** (`propMat` `harborterrain.js:506`) have no texture map at all (flat-shaded
  vertex-colour `MeshStandardMaterial`) — POM not applicable; do not add a map.
- Tree foliage/billboards (`harbortrees.js:543-569` sway patch, `56-69` billboard re-projection),
  smoke, sails, flags, grass: rejected surfaces (deforming/alpha-tested/billboarded).
- No npm, no bundler, no new test goldens, no `gl_FragDepth`, no engine.js changes.

---

## 3. Current-state audit (anchors verified)

| Surface | Material (file:line) | Texture (file:line, size, wrap) | Flat-at-close-range? |
|---|---|---|---|
| Building facades | `wallMat = MeshLambertMaterial({ color: 0xffffff, map: facadeTexture(style, stories, type) })` — `harbortown.js:1615`, one per `style\|stories\|type` group (group loop 1611–1626), instanced via `addInst(wallGeo, wallMat, wallS)` at 1848 | `facadeTexture(style, stories, type)` `harbortown.js:106-343`, 192², **clamp** (no repeat flag). Windows via `win()` helper 119–141; per-trade ground-floor deltas 226–341; weathering `Math.random` 112–114 | **Yes — worst offender.** Reveals/beams are paint. |
| Roofs | `roofMat = MeshLambertMaterial({ color: 0xffffff, map: roofTexture(style), side: DoubleSide })` `harbortown.js:1857` | `roofTexture(style)` `345-376`, 128², **clamp**; shingle `Math.random` 370–373 | Yes; tile rows read as stripes. |
| Streets | `streetMats[style]` `harbortown.js:806-808`: diorama path `MeshLambertMaterial({ map, vertexColors: true, transparent: true, depthWrite: false })` | `streetTexture(style)` `399-431`, 96², **RepeatWrapping (repeat flag passed at line 430 — verified, see §4.3)** | **Yes — grazing angles.** |
| Masonry (forts/quays) | `masonMat` `harbortown.js:709` | `masonryTexture()` `378-395`, 128², **RepeatWrapping (line 394)**; stone `Math.random` 390–392 | Yes. |
| Terrain | `MeshStandardMaterial` `harborterrain.js:244-246` | `hillTexture()` `892-907` | Deliberately flat (out of scope). |
| HD ship hull/deck | `MAT.hull` / `MAT.deck` `harborshiphd.js:57,59` (`MeshStandardMaterial`, hull has `vertexColors`) | `plankTexture(...)` `27-52`, 256², repeat, **seeded LCG** | Mild; curved + animated. P4 bump only. |
| Low ships | `harbor3d.js` plain Lambert colours | — | Far-range; irrelevant. |
| Diorama fallback land | `MeshLambertMaterial({ vertexColors: true })` `harbordiorama.js:432` | — | n/a |

No `normalMap`/`bumpMap` anywhere in `web/js` (grep-verified). Camera context: dpr cap 1.8
(`engine.js:54`), fov 38 (`engine.js:58`), `controls.minDistance = max(8, radius*0.02)`
(`engine.js:122`), polar clamp 0.12π–0.49π (`engine.js:65-66`), golden-hour sun low in the west
(`engine.js:134-135`), updaters get `(t, camera)` (`engine.js:190`), render decision
composer-vs-renderer (`engine.js:193-194`). TOUR mode: host drives the camera, engine skips
`controls.update()` (`engine.js:183-188`).

**Shader-injection precedents to copy:**
- Wet-sand band (`harborterrain.js:255-270`): string-replaces `#include <common>`,
  `#include <begin_vertex>`, `#include <color_fragment>`, `#include <roughnessmap_fragment>`; adds a
  varying + uniform. Exactly the POM injection shape.
- Lambert + InstancedMesh + chunk replacement: `harbortrees.js:543-569`; billboard `project_vertex`
  replacement `harbortrees.js:58-67`.
- Vendored r160 module confirmed to contain `getTangentFrame` (Schüler cotangent frame) and `vMapUv`
  (per-map UV varying, r152+), and to gate `scene.environment` to `isMeshStandardMaterial` — i.e.
  **Lambert materials never bind the PMREM env map** (this matters for texture-unit accounting, §5.5).

---

## 4. Resolved design questions

### 4.1 Technique: steep parallax + contact-refinement + secant finish

Survey conclusion (unchanged from research; references in §10): classical POM with a
contact-refinement inner pass (CRPM, Riccardi 2019 — error ~1/N² for POM-like cost) is the right
point on the curve. Cone-step/QDM rejected: tiles are tiny (96–256 px), relief shallow (≤ 5 cm
implied), and both need precompute/plumbing the no-bundler constraint makes hostile. Silhouettes
stay straight (POM bends UVs inside the polygon only) — acceptable at ≤ 4 cm relief; street ribbon
edges already alpha-fade, masking the worst case.

### 4.2 Height source: a second RGBA "relief" canvas per painter (not albedo-alpha)

- Street albedo alpha is already meaningful (`transparent: true` + per-vertex RGBA taper,
  `harbortown.js:806-808`, `ribbonGeo` 619/628); canvas `source-over` makes authoring an independent
  alpha channel miserable; Lambert multiplies `texelColor.a` into `diffuseColor.a`.
- **Channel layout:** `R = height` (0 = deepest recess, 255 = proud), `G = painted AO`
  (darkens recesses; cheap painterly depth cue), `B, A = spare` (B reserved for wetness/gloss).
  Texture settings: default `colorSpace` (CanvasTexture default = NoColorSpace, raw sampling — note
  the existing albedo `canvasTex` never sets colorSpace either), default mip filtering,
  `anisotropy = 4`, **wrap mode copied from the paired albedo** (repeat for street/masonry, clamp
  for facade/roof).
- *Rejected:* deriving height from albedo luminance — wrong exactly where it matters (tavern amber
  windows would bulge, dark shutters recess arbitrarily).

### 4.3 RESOLVED — street ribbon UV wrap

**Verdict: already RepeatWrapping; the old doc's "unverified, passes no repeat flag" claim was
stale.** `streetTexture` passes `repeat = true` as the 5th arg of `canvasTex` (`harbortown.js:430`),
so `wrapS = wrapT = RepeatWrapping`. `ribbonGeo` (`harbortown.js:585-632`) emits
`uv = (run / uRep, {0,1})` (line 618) with `uRep = 9` for streets (call site 800): **u tiles along
the street length with a 9 m period and exceeds [0,1]; v spans exactly [0,1] across the
5.2–6.4 m width** (`STREET_W` `harbortown.js:86`).

**Consequences:** (a) the POM march for street (and masonry) materials must NOT clamp the marched
UV — wrapping is free and required (a clamp would smear texels at every 9 m seam); (b) the street
relief texture must also be created with `repeat = true`; (c) marching across v at the ribbon edge
wraps gutter-to-gutter — harmless because both v edges paint the same gutter stroke
(`harbortown.js:425-429`, gutters at y = 3 and 93 of 96) and offsets are ≤ `uPomScale` ≈ 0.005 UV.
Facade/roof textures are clamp-wrapped → those materials get a `POM_CLAMP` define (§5.3).

### 4.4 RESOLVED — non-uniform instance scale vs relief depth

Wall instances scale the unit `wallGeo` box by `localM(h.w, h.hw, h.d, 0)` (`harbortown.js:1644`),
so 1 UV unit = a different metre count per house. **Real ranges, read from the generators:**

- `pushHouse` (`harbortown.js:1347-1405`): `h.w = max(3.8, w·1.08)`, `h.d = d·1.08`,
  `h.hw = 0.6 + stories·3.0`.
- Stories (`pickStories` 1330–1339, `typeStories` 1324–1328): english 1–4 (Port-Royal bonus),
  dutch 2–3, spanish 1–2, french 1–2; trades: smithy 1, boarding 2–3, others 2.
  → `h.hw ∈ {3.6, 6.6, 9.6, 12.6}` and is **constant within a material group** (groups key on
  `style|stories|type`, `harbortown.js:1389`).
- Caller w/d ranges (×1.08 applied): street-front (`1440-1443`) w ∈ [6.48, 10.15], d ∈ [6.48, 8.64];
  block frontage (`1546-1548`) w ∈ [4.86, 9.83] (dutch low end; also `min(·, len/n − 1.2)` can clamp
  narrow lots down to the 3.8 floor), d ∈ [5.62, 9.72]; block infill (`1584-1585`) w ∈ [6.48, 10.15],
  d ∈ [5.4, 7.56].

**Chosen mitigation (locked): per-material depth calibration on the fixed axis + accept bounded
horizontal variance.** Set each wall group's uniform to
`uPomScale = min(POM_DEPTH_M / h.hw(group), 0.012)` with `POM_DEPTH_M = 0.04`. Because `hw` is exact
per group, vertical relief depth is exactly 4 cm on every house. The u axis inherits the `w/hw`
aspect: for the dominant 2-storey groups (hw 6.6) `w/hw ∈ [0.74, 1.54]`, i.e. horizontal parallax
varies ≤ ×1.55 typical, ×2.7 only on rare length-clamped narrow lots. At 4 cm total relief that
variance is below the perceptual threshold of the painterly style (acceptance test in Phase 1).
Streets/masonry/roofs use fixed per-material scales (table §5.6) calibrated the same way:
streets u-period 9 m → `0.03 / 9 ≈ 0.0033`; quay masonry face height 0.9 m (`localM(len, 0.9, 1.1)`
`harbortown.js:913`) → `0.03 / 0.9 = 0.033` capped to `0.012`; roofs `0.012`.
The Schüler cotangent frame (§5.3) is derived per-fragment from actual screen-space gradients, so
direction handling under anisotropic scale is automatic — only the depth *magnitude* varies, as
bounded above.

### 4.5 RESOLVED — where the "shared POM uniform" is driven

**Nowhere — by design.** Distance fade uses `length(vViewPosition)` in-shader (Lambert is
per-fragment in r160 and already carries `vViewPosition`); no time uniform is needed; layer counts
are static per material, set once at build from the gfx tier (read inside `cartaTownBuilder` from
the `carta` argument, `harbordiorama.js:486`). This avoids touching `engine.js`/`harbordiorama.js`
and keeps the `animated[]`/updater goldens byte-stable. `cartaPOM` keeps a registry of patched
materials and exposes `cartaPOM.setQuality(q)` as a console/dev hook only (§5.4).

---

## 5. Design specification

### 5.1 Surface priority

| Priority | Surface | Material patched | Relief content | Depth |
|---|---|---|---|---|
| **P1** | Facades | every `wallMat` (`harbortown.js:1615`) | window/door recess, lintel/sill/stud/quoin raise, micro-grain | 4 cm (§4.4) |
| **P2** | Streets | `streetMats[style]` (`harbortown.js:806-808`) | cobble domes, rut troughs, gutters | 3 cm |
| **P3** | Masonry | `masonMat` (`harbortown.js:709`) | mortar recess, stone bulge | 3 cm |
| **P4** | Roofs | each `roofMat` (`harbortown.js:1857`) | barrel-tile ridges / shingle steps | 4 cm, `gl_FrontFacing`-gated (DoubleSide) |
| Optional | HD ship hull/deck | `MAT.hull`/`MAT.deck` (`harborshiphd.js:57,59`) | native three `bumpMap` from a relief sibling of `plankTexture` — **no POM** (doubly-curved, animated, strakes already read) | — |
| Rejected | terrain, water, trees, smoke/sails/flags, low ships, fallback land | see §2 | | |

### 5.2 Relief canvas generation — `web/js/harbortown.js`

**New API beside `canvasTex` (same `texCache`):**

```js
// Seeded Lehmer LCG, the harborshiphd.js:32-33 pattern, seeded from the key.
function lcg(key) {
  let s = 2166136261 >>> 0;                       // FNV-1a over the key string
  for (let i = 0; i < key.length; i++) { s ^= key.charCodeAt(i); s = Math.imul(s, 16777619) >>> 0; }
  let rnd = (s % 2147483646) + 1;                 // Lehmer state must be in [1, m-1]
  return () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
}

// Relief stroke colour: R = height 0..1, G = AO 0..1 (default: recesses darker).
const HV = (h, ao) => `rgb(${Math.round(h * 255)},${Math.round((ao == null ? 0.55 + 0.45 * h : ao) * 255)},0)`;

// Paired albedo+relief painter. paint(x, rx, w, h, rand):
//   x  = albedo 2D ctx (existing painter body, unchanged ops)
//   rx = relief 2D ctx, or a no-op Proxy when the relief for reliefKey is already
//        cached (per-trade albedo variants share one relief — see keying below)
//   rand = lcg(key) — painters MUST use rand, never Math.random
// Returns the albedo texture; the relief lands in texCache[reliefKey].
function canvasTexR(key, reliefKey, w, h, paint, repeat) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const haveRelief = !!texCache[reliefKey];
  const rc = haveRelief ? null : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const rx = haveRelief
    ? new Proxy({}, { get: () => () => ({}), set: () => true })   // swallow relief strokes
    : rc.getContext('2d');
  if (!haveRelief) { rx.fillStyle = HV(0.5); rx.fillRect(0, 0, w, h); }  // neutral mid-plane
  paint(c.getContext('2d'), rx, w, h, lcg(key));
  const tex = new THREE.CanvasTexture(c);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  texCache[key] = tex;
  if (!haveRelief) {
    // height hygiene: 1-px blur so the march never hits hard steps (deterministic)
    const b = document.createElement('canvas'); b.width = w; b.height = h;
    const bx = b.getContext('2d');
    bx.filter = 'blur(1px)'; bx.drawImage(rc, 0, 0);
    const rt = new THREE.CanvasTexture(b);
    if (repeat) rt.wrapS = rt.wrapT = THREE.RepeatWrapping;
    rt.anisotropy = 4;
    texCache[reliefKey] = rt;
  }
  return tex;
}
```

**Painter conversion (Phase tasks reference these):**
- `facadeTexture(style, stories, type)` → `canvasTexR('facade-' + style + stories + (type || ''),
  reliefKey, 192, 192, paint, /*repeat*/ undefined)` where
  `reliefKey = 'facade-' + style + stories + ((type === 'provisioner' || type === 'smithy') ? type : '') + '-h'`
  — per-trade deltas change colour only, except provisioner (cart-door/loft, `harbortown.js:308-328`)
  and smithy (open bay, `329-340`) which change apertures and get their own relief.
  Height values (paint via `rx.fillStyle = HV(h)` mirroring the albedo stroke geometry):
  wall field 0.5 (base fill), window glass 0.15, window surround 0.65, lintel 0.8, sill band 0.7,
  shutters 0.7, timber studs/braces & jetty beams 0.75, quoins 0.7, door 0.1, door/portal surround
  0.75, cornice 0.7, smithy bay 0.05, provisioner cart-door 0.1. The `win()` helper
  (`harbortown.js:119-141`) is the seam: give it the relief ctx and let it emit surround/lintel/glass
  heights alongside its colour strokes. Weathering streaks: colour-only (no relief stroke), but
  switch `Math.random` → `rand` (lines 112–114).
- `roofTexture(style)` → relief: tile verticals as alternating ridge/valley strokes (ridge 0.75 at
  the highlight line +4.5 px, valley 0.3 at the dark line — `harbortown.js:350-357`), shingle rows:
  step edge 0.35 under each course line, field 0.55; `Math.random` → `rand` (370–373).
- `masonryTexture()` → relief: mortar lines 0.2 over stone field 0.6, per-stone ±0.1 via `rand`
  (390–392 switch to `rand`, and now also emit the height delta so stones bulge unevenly).
- `streetTexture(style)` → relief: cobble ellipses as radial-gradient domes (centre 0.75 → edge
  0.35), cart ruts 0.25, gutters 0.2, field 0.5; gravel stipple colour-only with `rand` (414–416).
- Texture-key economy: facade reliefs key on `style|stories` (+ the 2 trade overrides). Real combo
  count from §4.4 stories ranges: english 4 + dutch 2 + spanish 2 + french 2 = 10, + ≤ 8 trade
  overrides = **≤ 18 facade reliefs** (~196 KB each with mips ⇒ ≤ 3.5 MB), + 4 street + 1 masonry +
  4 roof (~0.7 MB). **Total new GPU memory ≤ 4.2 MB.**

### 5.3 Shader injection — new `web/js/render/pom.js`

One plain script exposing `window.cartaPOM`:

```js
window.cartaPOM = (function () {
  const patched = [];   // { material, uniforms } registry for setQuality / debugging
  function patch(material, opts) {
    // opts: { heightMap: THREE.Texture, scale, minLayers, maxLayers,
    //         fadeStart, fadeEnd, ao = 0.6, clampUv = false, normalStrength = 0.4 }
    const U = {
      uHeightMap: { value: opts.heightMap },
      uPomScale: { value: opts.scale },
      uPomLayers: { value: new THREE.Vector2(opts.minLayers, opts.maxLayers) },
      uPomFade: { value: new THREE.Vector2(opts.fadeStart, opts.fadeEnd) },
      uPomAO: { value: opts.ao ?? 0.6 },
      uPomNrm: { value: opts.normalStrength ?? 0.4 },
    };
    const prev = material.onBeforeCompile;             // composability guard
    material.onBeforeCompile = (sh, renderer) => {
      if (prev) prev(sh, renderer);
      Object.assign(sh.uniforms, U);
      const rep = (src, find, ins) => {
        if (!src.includes(find)) throw new Error('cartaPOM: missing chunk ' + find); // fail loud
        return src.replace(find, ins);
      };
      sh.fragmentShader = rep(sh.fragmentShader, '#include <common>', PARS + '\n#include <common>');
      sh.fragmentShader = rep(sh.fragmentShader, '#include <map_fragment>', MAP_FRAG(opts.clampUv));
      sh.fragmentShader = rep(sh.fragmentShader, '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n' + NORMAL_FRAG);
    };
    material.customProgramCacheKey = () =>
      'cartaPOM|' + (opts.clampUv ? 'c' : 'w');         // distinguish patched program variants
    patched.push({ material, uniforms: U });
    return material;
  }
  function setQuality(s) {  // dev/console hook only; not called per-frame anywhere
    for (const p of patched) p.uniforms.uPomLayers.value.multiplyScalar(s);
  }
  return { patch, setQuality, _patched: patched };
})();
```

**`PARS` (prepended before `#include <common>` in the fragment shader):**

```glsl
uniform sampler2D uHeightMap;   // R = height (1 = proud), G = painted AO
uniform float uPomScale;        // relief depth, UV units (§4.4 calibration)
uniform vec2  uPomLayers;       // (min, max) coarse march layers
uniform vec2  uPomFade;         // (start, end) view-space metres
uniform float uPomAO;           // painted-AO strength
uniform float uPomNrm;          // normal-perturbation strength

// Schüler cotangent frame from screen-space derivatives — the same construction
// r160 ships as getTangentFrame in normalmap_pars_fragment, inlined so we do not
// depend on USE_NORMALMAP being defined. N, p in view space; uv = vMapUv.
mat3 pomCotangentFrame(vec3 N, vec3 p, vec2 uv) {
  vec3 dp1 = dFdx(p), dp2 = dFdy(p);
  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N);
  vec3 dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;
  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float invmax = inversesqrt(max(dot(T, T), dot(B, B)));
  return mat3(T * invmax, B * invmax, N);
}

// depth-from-top (0 at the proud surface, 1 at the deepest recess).
// textureLod at mip 0: tiles are <= 192 px (always resident); implicit-derivative
// sampling inside a divergent loop is what causes mip thrash, so it is avoided.
float pomDepth(vec2 uv) { return 1.0 - textureLod(uHeightMap, uv, 0.0).r; }

// Steep coarse march + contact-refinement inner pass (8 fine steps) + secant.
vec2 pomMarch(vec2 uv, vec3 vTS, float layers) {
  vec2 P = (vTS.xy / max(vTS.z, 0.08)) * uPomScale;  // total UV shift at depth 1
  float ls = 1.0 / layers;
  vec2 duv = P * ls;
  float depth = 0.0;
  vec2 cur = uv;
  float d = pomDepth(cur);
  for (int i = 0; i < 32; i++) {                     // hard cap >= maxLayers (24)
    if (depth >= d || float(i) >= layers) break;
    cur -= duv; depth += ls; d = pomDepth(cur);
  }
  cur += duv; depth -= ls;                            // back up one coarse layer
  vec2 fduv = duv * 0.125; float fls = ls * 0.125;    // refine at 1/8 stride
  d = pomDepth(cur);
  for (int i = 0; i < 8; i++) {
    if (depth >= d) break;
    cur -= fduv; depth += fls; d = pomDepth(cur);
  }
  float after  = d - depth;                           // secant between the
  float before = pomDepth(cur + fduv) - (depth - fls);// bracketing fine samples
  float w = clamp(after / (after - before + 1e-5), 0.0, 1.0);
  return mix(cur, cur + fduv, w);
}
```

**`MAP_FRAG(clampUv)` (replaces `#include <map_fragment>` wholesale — required because the stock
chunk samples `vMapUv`, a varying we cannot mutate):**

```glsl
vec2 pomUv = vMapUv;
float pomF = 0.0;
mat3 pomTBN = mat3(1.0);
{
  float pomDist = length(vViewPosition);             // Lambert is per-fragment in r160
  vec3 pomV = normalize(vViewPosition);              // fragment -> camera, view space
  vec3 pomN = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);  // DoubleSide roofs
  pomTBN = pomCotangentFrame(pomN, -vViewPosition, vMapUv);
  vec3 pomVts = normalize(transpose(pomTBN) * pomV);
  pomF = (1.0 - smoothstep(uPomFade.x, uPomFade.y, pomDist))   // distance fade
       * smoothstep(0.05, 0.25, pomVts.z);                     // grazing fade (ray-length blowup)
  if (pomF > 0.001) {                                // uniform-coherent beyond the fade:
    float layers = mix(uPomLayers.y, uPomLayers.x, pomVts.z);  // grazing -> more layers
    pomUv = mix(vMapUv, pomMarch(vMapUv, pomVts, layers), pomF);
    POM_CLAMP_LINE                                   // see below
  }
}
vec4 sampledDiffuseColor = texture2D(map, pomUv);
diffuseColor *= sampledDiffuseColor;
// painted recess occlusion — the cheapest depth cue, very on-style for engraving
diffuseColor.rgb *= mix(1.0, texture2D(uHeightMap, pomUv).g, uPomAO * pomF);
```

`POM_CLAMP_LINE` = `pomUv = clamp(pomUv, vec2(0.002), vec2(0.998));` when `clampUv: true`
(facades, roofs — clamp-wrapped textures, prevents border bleed past box-face edges), and empty for
repeat-wrapped streets/masonry (§4.3 — clamping there would smear the 9 m tile seams).
Notes: `texture2D` is `#define`d to `texture` by three's GLSL3 prologue; the branch on `pomF` is
coherent across distant fragments, so beyond `fadeEnd` cost is one tap, identical to today. The
march reads only `uHeightMap` — never `map` — so albedo mip selection stays derivative-driven and
clean. **Never write `gl_FragDepth`** (kills early-Z for the whole material; relief is too shallow
to need it).

**`NORMAL_FRAG` (appended after `#include <normal_fragment_begin>`, which runs later in `main()` —
`pomUv/pomF/pomTBN` declared above are still in scope):** lights the relief; with the low western
sun this raking response carries most of the perceived depth.

```glsl
if (pomF > 0.001) {
  vec2 pomTexel = 1.0 / vec2(textureSize(uHeightMap, 0));
  float pomD0 = pomDepth(pomUv);                                    // 2 extra taps (forward diff)
  float pomDx = pomDepth(pomUv + vec2(pomTexel.x, 0.0)) - pomD0;
  float pomDy = pomDepth(pomUv + vec2(0.0, pomTexel.y)) - pomD0;
  // depth gradient = -height gradient; z balances slope strength against texel size
  vec3 pomNts = normalize(vec3(pomDx, pomDy, pomTexel.x / max(uPomScale * 4.0, 1e-4)));
  normal = normalize(mix(normal, normalize(pomTBN * pomNts), uPomNrm * pomF));
}
```

### 5.4 Patch call sites (all inside `harbortown.js`; zero diorama/engine edits)

In the group loop after `harbortown.js:1615` (facades), after `:709` (masonry), inside the
`streetMats[style]` creation at `:806-808` (diorama branch only — the legacy non-frame branch may
share the same patch, but gate both on tier), and after `:1857` (roofs):

```js
const POM_ON = !!(carta && carta.gfx && carta.gfx.tier >= 3) && window.cartaPOM;  // diorama implies tier 3
if (POM_ON) window.cartaPOM.patch(wallMat, {
  heightMap: texCache[facadeReliefKey], scale: Math.min(0.04 / (0.6 + stories * 3.0), 0.012),
  minLayers: 8, maxLayers: 16, fadeStart: 18, fadeEnd: 50, clampUv: true,
});
```

`window.cartaPOM` is guarded so the node harness (which never loads `pom.js`) and any future
non-diorama caller degrade to plain textures.

### 5.5 Texture-unit accounting (per patched program)

WebGL2 guarantees ≥ 16 fragment texture units. Verified bindings for the patched materials
(vendored r160; `scene.environment` is gated to `isMeshStandardMaterial`, so **no env map ever
binds on Lambert**; one shadow-casting directional light, `engine.js:134-143`):

| Material | map | directionalShadowMap[0] | uHeightMap | total |
|---|---|---|---|---|
| `wallMat` (Lambert) | 1 | 1 | 1 | **3 / 16** |
| `streetMats[style]` (Lambert) | 1 | 1 | 1 | **3 / 16** |
| `masonMat` (Lambert) | 1 | 1 | 1 | **3 / 16** |
| `roofMat` (Lambert) | 1 | 1 | 1 | **3 / 16** |
| P4 `MAT.hull`/`MAT.deck` (Standard, native bumpMap) | 1 | 1 | bump 1 + env 1 | **4 / 16** |

POM fits with 13 units of headroom everywhere.

### 5.6 Step budgets, fade, tier defaults

| Material | minLayers → maxLayers | refine | fadeStart/fadeEnd (m) | scale (UV) | clampUv |
|---|---|---|---|---|---|
| facades | 8 → 16 | 8 | 18 / 50 | `min(0.04/hw, 0.012)` per group | yes |
| streets | 8 → 20 | 8 | 12 / 35 | 0.0033 (3 cm over the 9 m u-tile) | **no** (§4.3) |
| masonry | 8 → 12 | 8 | 18 / 45 | 0.012 | no |
| roofs | 6 → 12 | 8 | 18 / 50 | 0.012 | yes |

Worst case per fragment at full strength: 24 coarse+fine height taps + 1 secant tap + 2 normal taps
+ 1 AO (reuses the post-march sample coordinates) ≈ 26–28 taps of a ≤ 192² texture resident in
L1/L2; beyond `fadeEnd`, 1 tap (coherent branch). At dpr 1.8 ≈ 3.5 M shaded fragments (1080p), a
facade-filled close view ≲ 60 % coverage ⇒ ~2.1 M marching fragments — the standard POM regime
(Tatarchuk). Divergence, not bandwidth, is the cost: hence angle-scaled layers + hard distance
cutoff.

**Tier policy (locked decision 1):** the diorama only exists at tier 3, so tier gates ON/OFF, and
the table above is the tier-3 default. Dev override for the measurement sweep and field debugging:
`localStorage.cartaPomMax = '0'|'8'|'16'|'24'` — read once in `harbortown.js` when computing
`maxLayers` (`0` ⇒ skip patching entirely). Defaults may only be raised after the M1-class
validation pass (§7); on the M4 they must pass at the derated budget (p95 ≤ 10 ms).

### 5.7 Self-shadowing: OFF in v1

The sun is extremely low (`engine.js:134-135`) → height-field shadow rays run near-horizontal:
maximum step count, maximum artifact regime, and ~2× march cost. The painted-AO G channel plus the
2048² PCF shadow map (`engine.js:141`) already supply the darkening cue. Keep a `uPomShadow`
stub flag in `pom.js` (default 0, no shader code in v1); revisit only if Phases 1–3 leave ≥ 2 ms
headroom **on the target-class GPU**, not the M4.

---

## 6. Phased implementation plan

### Phase 1a — determinism refactor (own commit, no visual-system changes)

Tasks:
1. Add `lcg(key)` + `HV` helpers beside `canvasTex` (`harbortown.js:90-101`).
2. Switch `Math.random` → per-painter `rand = lcg(key)` inside `facadeTexture` (112–114),
   `roofTexture` (370–373), `masonryTexture` (390–392), `streetTexture` (414–416). Geometry-side
   `Math.random` (pushHouse etc.) is untouched.
3. Expose the painter test hook on the builder return: in the `return { build(S, fr) {...} }`
   object (`harbortown.js:691+`), add
   `_paint: { facadeTexture, roofTexture, masonryTexture, streetTexture, texCache }` — dev/test
   only, nothing in `web/js` reads it.
4. New characterization case `test/cases/13-pom-determinism.mjs` (see §7 Verification).

Acceptance: painters produce identical stroke streams across runs; visual A/B in the browser shows
the same *style* of weathering (re-seeded pixels are an accepted one-time delta — the harness has no
pixel assertions).
DoD: `node --check web/js/harbortown.js`; `node test/run.mjs` green incl. the new case; goldens
untouched (`git status test/golden` clean).
Rollback: revert the single commit; no consumer depends on the seeds.

### Phase 1b — scaffolding

Tasks:
1. Create `web/js/render/pom.js` exactly per §5.3.
2. Add `<script src="/js/render/pom.js"></script>` to `web/index.html` **between line 104
   (`/js/models/religious.js`) and line 105 (`/js/harbortown.js`)** — before any potential consumer,
   after the vendor importmap.
3. Add `canvasTexR` to `harbortown.js` per §5.2 (no painter converted yet).
4. Extend `test/cases/13-pom-determinism.mjs` with the patcher contract sub-check (§7).

Acceptance: app loads with zero console errors; no material patched yet; `window.cartaPOM` defined.
DoD: `node --check web/js/render/pom.js web/js/harbortown.js`; harness green; diorama visually
identical (POM not yet applied).
Rollback: delete the script tag + file; `canvasTexR` is dead code until Phase 1c.

### Phase 1c — facades end-to-end (the proving ground)

Tasks:
1. Convert `facadeTexture` to `canvasTexR` with the relief strokes and `reliefKey` economy of §5.2
   (the `win()` helper carries the height emits; provisioner/smithy own reliefs).
2. Patch `wallMat` at `harbortown.js:1615` per §5.4 (per-group `scale` from `stories`).
3. Run the measurement plan (§7) at the facade pose; run the visual A/B checklist.

Acceptance criteria:
- Window reveals visibly recess and shift correctly orbiting ±20°; door recesses read.
- No UV bleed past box-face edges (clampUv); no swim at the 50 m fade crossing; silhouettes
  identical to pre-POM.
- Instance tints (whitewash/poor, `harbortown.js:1636-1643`) unchanged.
- §4.4 variance check: orbit a street with mixed lot widths; no house reads cartoonishly deep.
- Perf: p95 ≤ **10 ms on the M4** (derated) at the facade pose, 16 layers, dpr 1.8; `renderer.info.render.calls` unchanged vs POM off.
DoD: harness green; `node --check`; budget met; A/B checklist recorded in the PR description.
Rollback: set `localStorage.cartaPomMax = '0'` (runtime kill switch) or revert the patch-call site;
relief canvases are inert without the patch.

### Phase 2 — streets + masonry

Tasks:
1. Convert `streetTexture` (relief with **repeat = true**, §4.3) and `masonryTexture` to `canvasTexR`.
2. Patch `streetMats[style]` (`harbortown.js:806-808`) and `masonMat` (`:709`) per §5.4/§5.6 — no UV
   clamp on either.
3. Repeat the perf sweep at a street-grazing pose (worst divergence).

Acceptance: cobble relief reads at grazing without stair-banding or shimmer against the ribbon's
alpha taper (streets are `transparent: true, depthWrite: false` — POM precedes the alpha multiply,
blending is unaffected by construction; confirm visually); no seam artifacts at the 9 m u-tile
boundary; quay mortar recesses under raking light. Perf: derated budget holds at the grazing pose.
DoD: harness green; `node --check`; checklist recorded.
Rollback: per-material — remove the two patch calls.

### Phase 3 — roofs

Tasks:
1. Convert `roofTexture` to `canvasTexR` (barrel ridge/valley, shingle steps per §5.2).
2. Patch each `roofMat` (`harbortown.js:1857`) with `clampUv: true`. The `gl_FrontFacing` flip in
   `MAP_FRAG` already handles `side: DoubleSide` (back faces are interior-invisible anyway).
3. Verify roof UVs: `roofFromTris` (`harbortown.js:531-538`) emits u = x+0.5, v = y, both ∈ [0,1] —
   clamp semantics match facades.

Acceptance: tile rows gain depth when orbiting low; ridge/eave silhouette lines unchanged; the
orbit's polar clamp (`engine.js:65-66`) means mostly near-normal viewing — 12 layers suffice.
DoD: harness green; budget holds; checklist recorded.
Rollback: remove the roof patch call.

### Phase 4 (optional, only with ≥ 2 ms headroom measured on target-class hardware)

- Ship hull/deck: build a relief sibling of `plankTexture` (`harborshiphd.js:27-52`, already seeded)
  and assign as native `bumpMap` (+`bumpScale ≈ 0.01`) on `MAT.hull`/`MAT.deck`
  (`harborshiphd.js:57,59`) — zero shader work, 1 extra unit (§5.5).
- Evaluate the `uPomShadow` flag (§5.7).

---

## 7. Measurement & verification plan

**Perf harness (dev-only, not committed to test/).** In TOUR mode the host drives the camera
(`engine.js:183-188`), so park a deterministic pose via console: pick the densest harbour, place
the camera 10 m from a facade row, fixed azimuth. Measure `performance.now()` deltas over 600
frames; report p50/p95. Sweep `localStorage.cartaPomMax` ∈ {0, 8, 16, 24} (reload per step), plot
p95. `renderer.info.render.calls` must be identical across the sweep (POM adds zero draw calls).
GPU timer queries (`EXT_disjoint_timer_query_webgl2`) are too patchily supported; wall-clock frame
time at a fixed pose is the decision metric. Repeat at a street-grazing pose.

**Acceptance (derating policy, locked):** p95 ≤ 10 ms on the M4 at default layers, dpr 1.8, both
poses, env on and off (the bloom path differs — `engine.js:193-194`). Before flipping POM
default-on in a release: one validation pass on M1/GTX-1660-class hardware, p95 ≤ 16.6 ms at the
same poses. If 16 layers fails there, ship 8+CRPM (visually beats plain steep-32).

**Static checks per phase:** `node --check web/js/harbortown.js web/js/render/pom.js`
(plus `web/js/harborshiphd.js` in Phase 4).

**Harness:** `node test/run.mjs` — cases 00–12 + `gl/smoke` + the new case must pass; goldens never
regenerated. The stub host never evaluates `harbortown.js`/`pom.js` (§1), so existing cases are
structurally isolated from this work; treat any 00–12 failure as a regression in your change, not
flakiness.

**New characterization case — `test/cases/13-pom-determinism.mjs` (concrete spec):**
1. Build a minimal sandbox (do NOT modify `test/lib/stubs.mjs`): a `window`/`document` whose
   `createElement('canvas')` returns a stub canvas with a **recording** 2D context — a Proxy that
   appends `[prop, args]` tuples (method calls and `fillStyle`/`lineWidth`/`filter` sets) to a
   per-canvas `ops` array (the permissive proxy in `stubs.mjs:74-90` swallows ops; this case needs
   its own recorder). `THREE` stub: `{ CanvasTexture: class { constructor(c) { this.c = c; } },
   RepeatWrapping: 1000 }` — the `cartaTownBuilder` factory body constructs nothing else at
   factory scope.
2. Evaluate `web/js/harbortown.js` source (`readFileSync` + `vm.runInNewContext`) twice, in two
   fresh sandboxes whose `Math.random` implementations **throw** (`() => { throw new Error('painter
   used Math.random'); }`).
3. In each sandbox: `const tb = window.cartaTownBuilder(THREEstub, {}, null);` then call
   `tb._paint.facadeTexture('english', 2, 'tavern')`, `tb._paint.facadeTexture('english', 2, '')`,
   `tb._paint.roofTexture('spanish')`, `tb._paint.streetTexture('dutch')`,
   `tb._paint.masonryTexture()`.
4. Assert: (a) no throw — painters are `Math.random`-free; (b) the JSON-serialized `ops` arrays for
   every painted canvas (albedo and relief, keys `facade-english2tavern`, `facade-english2-h`, …)
   are **identical across the two sandbox runs**; (c) `tb._paint.texCache['facade-english2-h']`
   exists and `['facade-english2tavern-h']` does **not** (relief key economy holds).
5. Patcher contract sub-check: evaluate `web/js/render/pom.js` in the sandbox; call
   `cartaPOM.patch(fakeMat, { heightMap: {}, scale: 0.01, minLayers: 8, maxLayers: 16, fadeStart: 18,
   fadeEnd: 50 })` where `fakeMat = {}`; invoke `fakeMat.onBeforeCompile({ uniforms: {},
   vertexShader: '', fragmentShader: '#include <common>\n#include <map_fragment>\n#include
   <normal_fragment_begin>' })` and assert the result contains `pomMarch` and `uHeightMap`; then
   assert it **throws** on a fragmentShader missing `#include <map_fragment>` (fail-loud pin against
   vendored-three chunk renames).

**Visual A/B checklist** (run env on AND off): listed per phase in §6; plus global: night/golden
lighting unchanged at distance; no shimmer at the fade boundary; silhouettes everywhere identical
to pre-POM.

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Untangented geometry (facades/streets are plain `BufferGeometry`) | High (blocks all) | Schüler cotangent frame in-fragment (§5.3) — the construction r160 itself ships as `getTangentFrame` (verified in the vendored module). Works on instanced, non-uniformly scaled boxes because it derives from actual screen-space gradients. Fallback if noisy: facades are axis-aligned boxes in object space — analytic TBN from `objectNormal`; not expected to be needed. |
| Non-uniform instance scale → relief depth varies per house | Medium | **Resolved §4.4**: per-group v-axis calibration (exact), bounded u-axis variance (≤ ×1.55 typical), scale cap 0.012; Phase 1c acceptance test. |
| Grazing artifacts (stair-banding, ray blowup, mip shimmer) | Medium | Angle-scaled layers, CRPM refine, grazing fade on `vTS.z`, `textureLod(…, 0.0)` in the march, 1-px blurred height maps. |
| Vendored-three chunk renames (`map_fragment`, `vMapUv`, `normal_fragment_begin`) | Medium | Patcher throws loudly on a missing replace target (§5.3); pinned by the test-case sub-check §7.5. Chunk names verified present in the current vendored r160. |
| Determinism refactor changes existing albedo pixels (re-seeded weathering) | Low | Intentional one-time delta, own commit (Phase 1a); harness has no pixel assertions. |
| Street transparency interaction | Low | POM precedes the alpha multiply (`color_fragment` runs after `map_fragment`); `depthWrite: false` unaffected; grazing fade hides taper-edge shimmer — Phase 2 acceptance. |
| `DoubleSide` roofs march the wrong way on back faces | Low | `gl_FrontFacing` normal flip in `MAP_FRAG` (§5.3). |
| Program-cache collisions patched/unpatched | Low | `customProgramCacheKey` per option set (§5.3). |
| Frame budget blown on low-end | Medium | `localStorage.cartaPomMax = '0'` kill switch (skips patching ⇒ zero residual cost); derating policy + M1-class validation gate before default-on (§5.6, §7). |
| Goldens drift via diorama/engine edits | High if violated | **No edits to `harbordiorama.js`/`render/engine.js`/`animated[]`** (§1, §4.5). |

## 9. Open items (implementer-assigned, with decision procedure)

1. **Does the canoe tour pass < 8 m from facades?** (TOUR bypasses `controls.minDistance`,
   `engine.js:122,183-188`.) Procedure: during one full tour loop, log
   `min(distance(camera.position, instance bounding sphere))` over the wall InstancedMeshes each
   second (console snippet over `town.group`); if min < 8 m, re-run the Phase 1c sweep at that pose
   and, if the derated budget fails, raise `fadeStart` to (min + 2) m for facades rather than
   raising layers.
2. **Final AO/normal strengths per surface** (`uPomAO` ∈ [0.3, 0.6], `uPomNrm` ∈ [0.3, 0.5]).
   Procedure: A/B at the fixed poses against the art guardrail — "the engraver carved the plate
   deeper", not photoreal brick; pick the lowest values where relief still reads at 10 m; record
   chosen constants in the patch-call sites.
3. **Relief height values fine-tuning** (§5.2 table is the starting point). Procedure: adjust only
   within ±0.1 per stroke class; re-run case 13 (values are baked into the op stream, so the test
   self-updates — no goldens involved).

## 10. Sources

- [LearnOpenGL — Parallax Mapping](https://learnopengl.com/Advanced-Lighting/Parallax-Mapping)
- [Brown Graphics — Steep Parallax Mapping](http://graphics.cs.brown.edu/games/SteepParallax/)
- [Wikipedia — Parallax mapping](https://en.wikipedia.org/wiki/Parallax_mapping) · [Parallax occlusion mapping](https://en.wikipedia.org/wiki/Parallax_occlusion_mapping) · [Relief mapping](https://en.wikipedia.org/wiki/Relief_mapping_(computer_graphics))
- [Tatarchuk — Practical Parallax Occlusion Mapping (PDF)](https://web.engr.oregonstate.edu/~mjb/cs519/Projects/Papers/Parallax_Occlusion_Mapping.pdf) · [approximate soft shadows paper](https://www.researchgate.net/publication/234785493_Practical_parallax_occlusion_mapping_with_approximate_soft_shadows_for_detailed_surface_rendering)
- [Catlike Coding — Rendering 20: Parallax](https://catlikecoding.com/unity/tutorials/rendering/part-20/)
- [Riccardi — Contact Refinement Parallax Mapping](https://andreariccardi.artstation.com/blog/3VPo/a-new-approach-for-parallax-mapping-presenting-the-contact-refinement-parallax-mapping-technique) · [reference shader (MIT)](https://github.com/a-riccardi/shader-toy/blob/master/ShaderToy/Assets/Shaders/ParallaxOcclusionMapping.cginc) · [Godot port](https://godotshaders.com/shader/contact-refinement-parallax-mapping/)
- Cone-step / QDM (rejected, §4.1): [Relaxed Cone Stepping (GPU Gems 3)](https://www.researchgate.net/publication/255571970_Relaxed_Cone_Stepping_for_Relief_Mapping) · [Robust Cone Step Mapping (2024)](https://www.researchgate.net/publication/382149069_Robust_Cone_Step_Mapping) · [BTH displacement-mapping survey](https://www.diva-portal.org/smash/get/diva2:831762/FULLTEXT01.pdf)
- Self-shadowing context: [godot-proposals #1843](https://github.com/godotengine/godot-proposals/issues/1843) · [CryEngine POM docs](https://www.cryengine.com/docs/static/engines/cryengine-3/categories/1114113/pages/1048721)
- three.js: [forum — Parallax Occlusion Mapping](https://discourse.threejs.org/t/parallel-occlusion-mapping/75252) · [shapespark/parallax-mapping](https://github.com/shapespark/parallax-mapping) · [pixy.js POM sample](http://mebiusbox.github.io/contents/pixyjs/samples/shader_parallax_occlusion.html)
- [Schüler cotangent frame — Interplay of Light](https://interplayoflight.wordpress.com/2013/01/21/normal-mapping-without-precomputed-tangents/) · [Geeks3D summary](https://www.geeks3d.com/20130122/normal-mapping-without-precomputed-tangent-space-vectors/)
