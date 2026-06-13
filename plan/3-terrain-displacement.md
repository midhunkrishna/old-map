# Terrain Vertex Displacement + Clipmap Rings — Implementation Handoff

**Goal.** Emulate hardware tessellation in WebGL2 for the LAND surface: pre-subdivided plane
geometry, vertex-shader displacement from a baked height texture, camera-centred ring density —
so the beach berm, shoreline silhouette, and hill ridges read at canoe level at 60 fps on the
certification target (Apple M1 / GTX-1660-class GPU).

**Scope.** `web/js/harborterrain.js` LAND mesh + one new test case + a one-line stub addition.
This document is the complete implementation spec: an implementer with this doc and the repo
needs no further research. All file:line anchors below were verified against the working tree
at commit `b493d27`.

**Companion plans.** `clod.md` (CLOD evaluation; its §3.3 defers terrain CLOD/morphing to THIS
document — the Phase 4 morph below IS the terrain CLOD, do not duplicate it there) and
`d_lod_muklvar.md` (discrete-LOD audit of ships/trees/birds/town; if its shared LOD policy ever
lands, the ring distances in §3.6 should be expressed in the same screen-space-error units —
until then they are raw metres like every other threshold in the repo).

**Locked decisions (do not reopen):**
1. Reference GPU: **M1 / GTX-1660-class is the 60 fps certification target.** The dev machine
   is an Apple M4 — see the derating policy in §6.
2. `heightAt` stays the analytic CPU function; the texture is a render-side projection of it
   (§3.1). Half-float is rejected (§3.3). CBT/compute tessellation is rejected (§2).
3. The camera reaches the terrain through the engine loop already (verified, §0.2) — no host
   plumbing work exists in this plan.

---

## 0. Repo orientation (read first)

### 0.1 Module idiom

- Vanilla JS, **no bundler, no npm at runtime**, vendored three r160 (`web/vendor/`). Modules
  are classic-script IIFEs assigning `window.carta*` factories: `harborterrain.js` line 18 is
  `window.cartaTerrain = function cartaTerrain(THREE) { ... }` returning
  `{ build, HILLS }` (line 1117). `'use strict'` at top, two-space indent, heavy narrative
  comments — match this voice.
- GLSL lives in template strings (the water shader, `harborterrain.js:944-1110`) or in
  `onBeforeCompile` chunk replacements on `MeshStandardMaterial` (the wet-sand band,
  `harborterrain.js:255-270`; the grass sway, `harborterrain.js:551-561`). **Use the
  `onBeforeCompile` pattern for the displacement** — it preserves PMREM IBL, shadows, fog.
- Everything is deterministic: positions hash from `hash01(a,b)` (`harborterrain.js:47`,
  a sin-hash, portable verbatim to GLSL). No `Math.random()` in scene placement (the only
  exception is the hachure texture, `hillTexture()`, line 899-901 — cosmetic).

### 0.2 The frame contract and the engine loop

- `harbordiorama.js` builds the scene: it constructs `frame = { project, heightAt, centroid,
  radius }`, calls `window.cartaTerrain(THREE).build(landFs, HILLS[id], project)`
  (`harbordiorama.js:467-470`), then sets `frame.heightAt = terrain.heightAt`
  (`harbordiorama.js:471`) and hands `frame` to every collaborator (town, canoe, trees).
- The render engine (`web/js/render/engine.js`, extracted from the diorama) runs the rAF loop
  and calls every registered updater as **`a.update(t, camera)`** (`engine.js:190`). The
  terrain object is pushed into `animated[]` at `harbordiorama.js:480` and `animated` is handed
  to the engine at `harbordiorama.js:598` (`eng.setUpdaters(animated)`).
- **Today `terrain.update(t)` (`harborterrain.js:876-879`) ignores its second argument.** The
  camera is already arriving every frame; Phase 4 just widens the signature to
  `update(t, camera)`. Zero host changes.
- Shadows come from ONE light: the directional golden-hour sun the engine adds per open
  (`engine.js:134-143`: `castShadow = true`, 2048² map, bias −0.0006, ortho box ±1.3·radius).
  The terrain mesh currently **receives AND casts** shadows (`harborterrain.js:272-273`).
  There are no point-light shadows anywhere, so `customDepthMaterial` is needed (§3.5) but
  `customDistanceMaterial` is not.
- Nothing raycasts the terrain (grep `raycast|Raycaster` over `web/js/*.js`: zero hits), so a
  CPU-flat geometry breaks no picking.

### 0.3 The W_TRAINS water system — UNTOUCHABLE

`waterAt(x,z,t)` (`harborterrain.js:34-43`) is the CPU twin of the water vertex shader
(`harborterrain.js:944-963`); both are driven by the same three swell trains
(`W_TRAINS`, lines 28-33). The canoe carries a verbatim copy (`harborcanoe.js:23-29`) and
prefers the terrain's own `waterAt` (`harborcanoe.js:39,480`; handed over at
`harbordiorama.js:796`). Anchored ships bob on it (`harbordiorama.js:523`). The wet-sand band
bakes the same constants into its fragment chunk (`harborterrain.js:252-254`).

**Rule: the vertex displacement of WATER and its CPU twin remain byte-identical. This plan
concerns LAND only.** The only water change ever permitted here is Phase 5's optional
*subdivision density* raise (`seg`, line 912) — same shader source, more vertices.

### 0.4 heightAt and its consumers — the core invariant

`heightAt(x,z)` (`harborterrain.js:152-161`) is the single ground-elevation oracle:
signed coast distance (point-in-polygon `inside` 119-128 + `nearestCoast` 109-118 over
`segDist` 101-108) → seabed `max(-34, d·0.7)` for `d ≤ 0`; inland
`plain = min(7, d·7/240)` + a 0.3 m berm smoothstep over `d ∈ [16,26]` m (lines 158-159)
+ `hillsAt(x,z)` (139-149, summing `hillProfile` 55-78; `reliefH` line 79 — up to
`reliefH(165) = 742.5` m for Tortuga).

Consumers of the **same function object** (all sample it at BUILD time except the canoe):

| Consumer | Anchor | Sensitivity |
|---|---|---|
| Canoe grounding/blocking (runtime, per frame) | `harborcanoe.js:478` (grabs `frame.heightAt`), `:733` (`> seaLevel − 0.3` blocked), `:1128` (fish gate `< seaLevel − 0.35`), `:688` (spawn probe `< seaLevel − 0.4`) | decimetre |
| Canoe shore grass (build) | `harborcanoe.js:431` via `makeGrass(heightAt)` (`:388`, wired `:516`) | cm band 0–1.7 m |
| Town footings (build) | `harbortown.js:40` (`frame.heightAt(p.x, p.z)`) | decimetre |
| Jetty validity (build) | `harbortown.js:1159-1165`: head must reach water (`> 0.05` rejects, `:1162`), root must hold shore (`< −0.1` rejects, `:1165`) | **centimetre, at y≈0** |
| Strandline props (build) | `harborterrain.js:361-505` (rocks/driftwood/grass/shells/boulders/kelp/…/wrecks), second pass `:448-505` | sit directly on surface |
| Crags + scree (build) | `harborterrain.js:712-735`, `:737-765` | multi-metre rocks, slack |
| Tidepool tilt (build) | `harborterrain.js:669-678` (central differences of `heightAt`) | gradient |

**Invariant:** the rendered land surface and `heightAt` must agree, or the canoe grounds
wrongly, props float/sink, jetty placement flips. Today they agree *exactly at mesh vertices*
and drift by linear interpolation across 9–30 m cells in between — the design below must beat
that drift, and §3.3 quantifies the new (smaller) drift with a test enforcing it (§5).

**Corollary (read twice):** because every prop/footing position is baked FROM THE FUNCTION,
a phase that changes mesh resolution or moves displacement to the GPU but leaves `heightAt`'s
return values bit-identical **moves nothing** — not one shell, not one jetty. That is the
safety property each phase's acceptance criteria checks.

### 0.5 Test harness rules

- `node test/run.mjs` self-re-execs with `--experimental-vm-modules`, auto-collects
  `test/cases/*.mjs` (+ optional `test/cases/gl/*.mjs`) — `test/run.mjs:26-40`. Existing
  cases are `00`–`12` plus `gl/smoke.mjs`. New terrain case is `13-…` (§5).
- Golden snapshots live in `test/golden/*.json`, written only under `UPDATE_GOLDEN=1`
  (`test/lib/assert.mjs:44-50`). **Existing goldens are never regenerated by this work**;
  `UPDATE_GOLDEN=1` is permitted only when a NEW case writes its own NEW golden (case 13 as
  specified needs no golden at all — pure assertions).
- `test/lib/stubs.mjs` provides the headless world: `loadRealTerrain(win, rec)`
  (`stubs.mjs:630-638`) evaluates the real `harborterrain.js` into a vm sandbox (classic
  script → `win.cartaTerrain`); `makeThree(rec)` provides stub geometry with REAL
  position/normal Float32 attributes (`stubs.mjs:324-369`) — note stub `PlaneGeometry`
  positions are zero-filled, so **the new test must not read mesh vertices; it tests the
  bake/oracle pair directly** (§5). Stub `DataTexture` is inert (`stubs.mjs:430`) — fine.
  Stub THREE today has `NearestFilter/FloatType/RedFormat/ClampToEdgeWrapping` but **no
  `MeshDepthMaterial` and no `RGBADepthPacking`** — Phase 2 adds both stubs (one line each).
- Case `05-env-transitions.mjs` is the copy-from pattern for loading real terrain headless.

### 0.6 Aesthetic and tier gate

- Painterly, vertex-coloured, low-poly engraving look: tolerant of soft seams and skirts,
  **intolerant of pops** — hence morph bands in Phase 4.
- The diorama as a whole is gated at **gfx tier ≥ 3** (`harbordiorama.js:16`); the tier is
  probed once at boot in `app.js:1019-1048` (tier 3 = WebGL2 present, demoted by reduced-motion
  or user override). **All capability/perf gating decisions for this plan use this tier system
  — never dev-machine feel** (§6). Inside the diorama everything already assumes WebGL2.

---

## 1. Current-state audit (anchors verified)

### 1.1 Land mesh — CPU-baked, single static grid

| Aspect | Where | Detail |
|---|---|---|
| Bbox | `harborterrain.js:164-175` | Coastline bbox + `margin = max(320, 0.28·span)` (line 171); `x0,x1,z0,z1` at 172; `W,D` at 173. |
| Resolution | `:174-175` | `step = min(30, max(9, max(W,D)/230))` → saturates at ~230×230 ≈ **53k verts / ~106k tris**, i.e. **9–30 m between vertices** (~22 m for a Tortuga-sized span). |
| Geometry | `:177-179` | `THREE.PlaneGeometry(W, D, nx, nz)`, rotated into XZ, translated to bbox centre. |
| Displacement | `:181-183` | CPU-baked: `pos.setY(i, heightAt(x, z))` per vertex. No shader displacement on land. |
| Normals | `:184` | `geo.computeVertexNormals()` — CPU, baked. |
| Vertex colours | `:186-240` | Sand→grass→scrub→rock→crag bands from baked `y` + `1 − normal.y` slope; hashed mottling (209-210), contour banding (212), berm shingle (218-221), grid-Laplacian gully darkening (224-227), surf band (229-230), tidal ripple tint (231-236). **Colour resolution = vertex resolution = 9–30 m.** |
| Material | `:244-270` | `MeshStandardMaterial({ vertexColors, map: hillTexture(), roughness 0.96 })`; `onBeforeCompile` (255-270) injects `vWetW` varying + a fragment wet-band driven by baked `W_TRAINS` constants. |
| Mesh flags | `:271-273` | `receiveShadow = true` (272), `castShadow = true` (273). |
| update | `:876-879` | `update(t)` ticks water `uTime`, `wetT`, `grassT`, spray. Camera arg arrives (engine.js:190) and is ignored. |
| dispose | `:880-886` | disposes geo/materials/textures — new resources must be added here. |
| `frustumCulled=false` precedent | `:568` | instanced strand props. |

### 1.2 Water plane density (note only — shader untouchable, §0.3)

`makeWater` (`harborterrain.js:910-915`): `size = span·5.5`, `seg = min(200, max(40, size/22))`
(line 912). For any span ≥ ~800 m, `seg` caps at 200² (≈40k verts) → **55–137 m cells** against
swell wavelengths 58/27/13 m: the vertex swell is under-sampled everywhere; near the canoe the
visible "waves" are mostly the fragment ripple normals while the canoe bobs on the full analytic
`waterAt`. A denser inner ring (same shader) is the cheap Phase 5 win.

### 1.3 Where 9–30 m spacing fails at canoe level

The canoe camera sits ~1–2 m over the water, metres off the beach:

1. **Berm invisible** — a 0.3 m step over a 10 m run (`:158-159`) needs ≤ ~3 m spacing; at
   22 m it averages away (its shingle colour band, `:218-221`, lands on too few verts too).
2. **Polygonal shoreline** — the coast is the y=0 crossing of the heightfield against the flat
   sheet (file header, lines 6-8); at 22 m spacing it is a chain of 22 m straight facets.
3. **Coarse colour bands** — the surf band spans ~1.2 m of height ≈ ~40 m of beach
   (plain slope 7/240): 2–4 vertices across.
4. **Hill ridges alias** — the finest ridged octave `sin(18.9·u)` (`:71`) has wavelength
   `2π·rx/18.9` ≈ 83 m for Havana's 250 m-radius knoll: ~4 samples/wavelength.
5. **Gully Laplacian** (`:224-227`) is computed on the coarse grid: low-res relief cue.

---

## 2. Research basis (condensed; verdicts only)

- **Heightmap + vertex texture fetch (VTF)** is the standard WebGL2 playbook: float textures
  are core; ≥16 vertex-shader texture units guaranteed. *Linear filtering* of float32 needs
  `OES_texture_float_linear` (occasionally missing on mobile) — we sidestep it entirely with
  `texelFetch` + manual bilinear, which also lets JS mirror the arithmetic exactly (§3.2).
- **Geometry clipmaps** (Losasso & Hoppe 2004; GPU Gems 2 ch. 2): nested camera-centred rings,
  static VBOs, height from texture, origins snapped to lattice multiples, transition bands.
  Fixed vertex budget, trivial data structure. **Chosen** (§3.6) — our domain (one bounded
  island, one camera, LOD = horizontal distance) is exactly its sweet spot.
- **CDLOD** (Strugar 2009): quadtree + instanced grid + vertex morph. Better on huge/streamed
  terrains with varying camera pitch; costs quadtree + per-frame CPU selection. **Rejected as a
  whole; its morph idea is borrowed** for the ring blend bands.
- **CBT/ISubd compute tessellation** (Khoury/Dupuy/Riccio 2018; Dupuy 2024): needs compute
  shaders + indirect draw — **infeasible in WebGL2**, belongs to WebGPU; solves planet-scale
  problems we don't have. Rejected.
- **Transform-feedback pre-displacement**: documented fallback only if VTF profiling on weak
  tiers demands it. **Parallax/relief mapping**: fails exactly at the land/water silhouette.
  Rejected.

Full citations at the end of this document.

---

## 3. Design

### 3.1 Single source of truth

**`heightAt` remains the unchanged analytic JS function and the only oracle.** The R32F
heightmap texture is GENERATED by sampling that same function at build time; the GPU surface is
a bilinear reconstruction of those samples; the CPU keeps calling the analytic function. One
generator → the two views cannot diverge structurally; the residual is pure interpolation error,
bounded in §3.3 and enforced by test 13.

To make the bound testable, the build exposes the bake alongside the oracle (Phase 2):

```js
return {
  group, mesh, water, heightAt, seaLevel, waterAt,
  bake: { data, res: N, x0, z0, w: W, d: D, sample: bakeSample },  // NEW
  update(t) {...}, dispose() {...},
};
```

`bakeSample(x,z)` is the JS bilinear twin of the GLSL fetch — **identical arithmetic** (§3.2),
so `|bakeSample − heightAt|` measured in Node IS the render-side drift, no GPU needed.

If a future feature ever needs *exact* CPU/GPU equality, the one-commit escape hatch is to flip
`heightAt` to call `bakeSample` — every consumer reads `frame.heightAt`, so they all follow
automatically. **Not in this plan**; the analytic function stays.

### 3.2 Heightmap bake — exact specification

- **Storage:** `Float32Array(N*N)`, `N = opts.hmRes || 2048` (the existing `opts` arg at
  `build(lands, hills, project, opts)`, line 81, is the override slot; tests pass smaller N
  only if ever needed — case 13 uses the default).
- **Mapping convention (grid-with-endpoints; the JS and GLSL twins must both use it):**
  texel `(i,j)` samples world `x = x0 + (i/(N−1))·W`, `z = z0 + (j/(N−1))·D`, with
  `x0,z0,W,D` from lines 172-173 (bbox+margin). Bake loop:

  ```js
  const N = opts.hmRes || 2048;
  const hm = new Float32Array(N * N);
  for (let j = 0; j < N; j++) {
    const z = z0 + (j / (N - 1)) * D;
    for (let i = 0; i < N; i++) hm[j * N + i] = heightAt(x0 + (i / (N - 1)) * W, z);
  }
  ```

  (Float32Array assignment performs the `Math.fround` rounding implicitly.)
- **Texture:** `new THREE.DataTexture(hm, N, N, THREE.RedFormat, THREE.FloatType)`;
  `minFilter = magFilter = THREE.NearestFilter`; `wrapS = wrapT = THREE.ClampToEdgeWrapping`;
  `generateMipmaps = false`; `needsUpdate = true`. (Nearest ⇒ no
  `OES_texture_float_linear` dependence; filtering is manual.) 2048² R32F = 16.8 MB VRAM.
  Texel size = `max(W,D)/(N−1)` ≈ **2.3 m** on a 4.6 km bbox+margin.
- **JS twin (exported as `bake.sample`):**

  ```js
  function bakeSample(x, z) {
    const gx = Math.min(Math.max((x - x0) / W, 0), 1) * (N - 1);
    const gz = Math.min(Math.max((z - z0) / D, 0), 1) * (N - 1);
    const i = Math.min(N - 2, Math.floor(gx)), j = Math.min(N - 2, Math.floor(gz));
    const fx = gx - i, fz = gz - j;
    const r0 = j * N + i, r1 = r0 + N;
    return (hm[r0] * (1 - fx) + hm[r0 + 1] * fx) * (1 - fz)
         + (hm[r1] * (1 - fx) + hm[r1 + 1] * fx) * fz;
  }
  ```

- **GLSL twin** (injected; mirrors the above exactly):

  ```glsl
  uniform sampler2D uHm;
  uniform vec2 uHmMin;     // (x0, z0)
  uniform vec2 uHmSize;    // (W, D)
  uniform float uHmN;      // N (texels per side)
  float hmTexel(ivec2 c) {
    return texelFetch(uHm, clamp(c, ivec2(0), ivec2(int(uHmN) - 1)), 0).r;
  }
  float hmHeight(vec2 wxz) {
    vec2 g = clamp((wxz - uHmMin) / uHmSize, 0.0, 1.0) * (uHmN - 1.0);
    ivec2 c = ivec2(min(floor(g), vec2(uHmN - 2.0)));
    vec2 f = g - vec2(c);
    float h00 = hmTexel(c), h10 = hmTexel(c + ivec2(1, 0));
    float h01 = hmTexel(c + ivec2(0, 1)), h11 = hmTexel(c + ivec2(1, 1));
    return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
  }
  ```

  (r160 compiles `MeshStandardMaterial` as GLSL3 under WebGL2, so `texelFetch` is available
  inside `onBeforeCompile` chunks. `uHm` must be declared BEFORE first use — inject the block
  by replacing `#include <common>` in the vertex shader.)
- **Bake cost:** 2048² ≈ 4.2 M `heightAt` calls; `nearestCoast`/`inside` scan every coast
  segment per call. Phase 1 adds a **uniform-grid spatial bin over coast segments** used by
  `nearestCoast` with ring-expansion search and a provable early-exit (expand until the best
  distance found ≤ distance to the nearest unsearched cell boundary) — **exact same return
  values, just faster**; exactness is asserted by test 13(d). Budget after binning: < 1 s for
  the bake + existing 53k-vertex loop + 128² shore field (`:279-291`).

### 3.3 Error budget (the invariant, quantified)

Let `Δ` = texel size ≈ 2.3 m. The rendered surface is the bilinear interpolant of exact
`fround(heightAt)` samples; the oracle is analytic. Three regimes:

1. **Quantization (everywhere).** R32F has a 24-bit mantissa: relative error 2⁻²⁴ ≈ 6×10⁻⁸ →
   at the 742.5 m Tortuga peak, ≤ **4.4×10⁻⁵ m**. Negligible.
   *(Half-float, 11-bit mantissa: ulp = 0.5 m in the 512–1024 m range → up to ~25 cm at the
   peaks. This is why half-float is rejected — locked.)*
2. **Smooth regions (C² terrain).** Bilinear error ≤ `Δ²·max|∂²h|/8` per axis. The berm — the
   close-up feature — is `0.3·smoothstep((d−16)/10)`: `|h''| = 0.3·6/10² = 0.018 m⁻¹` →
   `2.3²·0.018/8 ≈ `**1.2 cm**. Beach plain is linear → ~0. Hill crests: the ridged octaves
   give decimetre-scale error at the sharpest crests — no thresholds or waterlines up there;
   crags/scree are multi-metre rocks.
3. **The d = 0 slope crease (the one hotspot).** Slope jumps from 0.7 (seabed, line 154) to
   7/240 ≈ 0.029 (plain, line 155): Δm ≈ 0.671. Linear interpolation across a kink deviates by
   up to `Δm·Δ/4` when the crease sits mid-texel → **≤ 0.39 m vertical sag, exactly at the
   waterline crossing, worst case**. Consequences:
   - The rendered y=0 crossing shifts laterally by at most ~one texel (≤ 2.3 m, typically well
     under 1 m) — vs today's 22 m shoreline facets, still an order-of-magnitude improvement,
     and the sag side is underwater (the sheet hides it).
   - **Functionally zero impact:** every CPU check (canoe `:733`, jetty `:1162-1165`, prop
     seating) uses the analytic oracle, not the texture.
   - If the beach toe ever reads badly in review, the contained refinement (NOT default) is a
     **split bake**: store signed shore distance `d` (slope-1, crease-free near the coast —
     interpolates an order of magnitude better) in one texture and evaluate
     seabed/plain/berm analytically in GLSL from sampled `d`, adding `hillsAt` from a second
     smooth texture. This reuses the §3.2 machinery; it is Phase 5 material.

**Test tolerances derived from the above (used verbatim in §5):** beach band (`0.5 < y < 3`,
i.e. clear of the crease and below the hills): **5 cm**. Crease band (`|y| ≤ 0.5`): assert
`< 0.45 m`, report the max. Everywhere else: `max(0.05, 0.01·|heightAt|)` (1 % of local
relief). Today's mesh, for calibration, drifts up to several DECIMETRES mid-cell on the berm —
the new budget is strictly tighter.

### 3.4 Displacement vertex shader — exact uniform/attribute contract

Injected via a shared helper inside `build()` (it must close over the texture and bbox):

```js
function injectDisplacement(sh, originU) {   // originU: {value: THREE.Vector2} | null
  sh.uniforms.uHm = { value: hmTex };
  sh.uniforms.uHmMin = { value: new THREE.Vector2(x0, z0) };
  sh.uniforms.uHmSize = { value: new THREE.Vector2(W, D) };
  sh.uniforms.uHmN = { value: N };
  if (originU) sh.uniforms.uOrigin = originU;
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', DISPLACE_GLSL + '\n#include <common>')   // §3.2 block
    .replace('#include <begin_vertex>', `#include <begin_vertex>
  ${originU ? 'transformed.xz += uOrigin;' : ''}
  transformed.y = hmHeight(transformed.xz);`);
}
```

| Uniform | Type | Set | Meaning |
|---|---|---|---|
| `uHm` | sampler2D (R32F, Nearest, ClampToEdge) | build | baked heightmap |
| `uHmMin` | vec2 | build | `(x0, z0)` bbox+margin min corner |
| `uHmSize` | vec2 | build | `(W, D)` bbox+margin extent |
| `uHmN` | float | build | texels per side (N) |
| `uOrigin` | vec2 | **per frame** (Phase 4 only) | ring's snapped world origin; Phase 2/3 omit it (grid is already in world XZ via `geo.translate`, line 179) |

Attributes: standard `position` only. Phase 2/3: the existing world-positioned grid with Y
flattened to 0. Phase 4: ring lattices in LOCAL coords (origin-relative), plus skirt vertices
marked by `position.y = −1` (shader: after sampling, `if (position.y < -0.5) transformed.y -=
uSkirt;` with `uSkirt` ≈ 2·cell, a build-time per-ring constant uniform).

**Ordering constraint with the existing wet-band injection:** the wet band currently computes
`vWetW = (modelMatrix * vec4(position, 1.0)).xyz` (`:260`). With flattened geometry,
`position.y` is 0 → the wet band would paint the whole island. **Phase 2 must change that line
to read `transformed` AFTER displacement:**
`vWetW = (modelMatrix * vec4(transformed, 1.0)).xyz;` — and `injectDisplacement` must run
FIRST in `landMat.onBeforeCompile` so `transformed.y` is already displaced.

**Normals.** Phase 2/3 (static topology): keep the existing CPU pipeline — bake heights into
the geometry (lines 181-183), `computeVertexNormals()` (184), bake colours (186-240), and only
THEN flatten: `for (i) pos.setY(i, 0)`. Normals and colours remain correct baked attributes;
the shader reproduces the same surface within §3.3 tolerance. Phase 4 (vertices move with the
camera): normals must come from the heightmap in the shader — replace
`#include <beginnormal_vertex>`'s `objectNormal` with central differences of `hmHeight` at
±one texel (4 extra bilinear samples = 16 texelFetch):
`objectNormal = normalize(vec3(h(x−Δ,z) − h(x+Δ,z), 2.0·Δ, h(x,z−Δ) − h(x,z+Δ)));`

### 3.5 Shadows

Verified current behaviour: the land both casts and receives from the single directional sun
(§0.2). A displaced vertex shader is invisible to the shadow depth pass — without action, hill
self-shadowing and the land's cast shadows would be computed from the FLAT geometry. Phase 2
therefore sets:

```js
const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
depthMat.onBeforeCompile = (sh) => injectDisplacement(sh, null /* or originU per ring */);
mesh.customDepthMaterial = depthMat;
```

Dispose it in `dispose()` (`:880-886`). Phase 4: one depth material per ring sharing that
ring's `uOrigin` uniform object. No `customDistanceMaterial` (no point-light shadows, §0.2).
Headless note: stub THREE lacks `MeshDepthMaterial`/`RGBADepthPacking` — Phase 2 adds
one-line stubs to `test/lib/stubs.mjs` (§4 Phase 2 task 7); also guard in terrain:
`if (THREE.MeshDepthMaterial) { ... }` so the real code never assumes the stub.

### 3.6 Clipmap rings (Phase 4 geometry)

Square rings, each a static pre-subdivided plane (hollow except L0), `G = 96` cells per side,
cell size doubling per level, finest cell 1.5 m:

| Level | Cell | Outer span | Verts (≈) |
|---|---|---|---|
| L0 (full 96² grid) | 1.5 m | 144 m | 9.4k |
| L1 (hollow ring) | 3 m | 288 m | 7.1k |
| L2 | 6 m | 576 m | 7.1k |
| L3 | 12 m | 1.15 km | 7.1k |
| L4 | 24 m | 2.3 km | 7.1k |
| L5 | 48 m | 4.6 km (clamped/extended to bbox+margin) | 7.1k |
| **Total** | | | **~45k verts / ~88k tris (+ ~5k skirt tris)** |

Fewer triangles than today's 106k, with 6–20× finer ground resolution at the canoe.

- **Recentring:** per frame in `terrain.update(t, camera)`, each ring's origin snaps to
  multiples of **2× its own cell** (so child lattices nest inside parent lattices):
  `ox = floor(cam.x / (2c)) * 2c` (likewise z); write the ring's `uOrigin`. Vertices always
  land on the same world lattice → no swimming. Geometry buffers never touched.
  `frustumCulled = false` per ring (precedent `:568`). Optional: skip re-snap when
  `camera.position.y > 1.5·radius` (orbit view; rings still cover everything).
- **Why no height morph:** every ring samples the SAME texture with the SAME bilinear — two
  vertices at the same world XZ get the same height bit-for-bit. So only **XZ morph** is
  needed: in each ring's outer 30 % band, odd lattice vertices slide toward their even
  neighbour (`xz −= fract(xz/(2c))·2c · m`, CDLOD-style, with `m = smoothstep(0.7, 1.0,
  chebyshevDist(xz_local)/halfSpan)` computed in-shader from `position` — no extra attribute).
  At `m = 1` the ring's edge vertices coincide exactly with the parent ring's lattice → the
  boundary is vertex-identical, pop-free and crack-free by construction.
- **Skirts:** 1-cell-deep vertical skirt around each ring edge (marked `position.y = −1`,
  §3.4) as belt-and-braces for any residual T-junction crack; the painterly look forgives it.
- **Draw calls:** 6 ring meshes (skirts merged into each ring's geometry), one cloned
  `MeshStandardMaterial` each (clones share the compiled program) + 6 depth-material clones.
- **Orbit mode** needs no special casing: rings centred under a high camera still tile the
  island; L5 is clamped to the bbox+margin rectangle so coverage never depends on camera.

### 3.7 Colour: from baked vertices to per-pixel fragment (Phase 3)

Rings can't carry baked vertex colours (vertices move), so the colour logic moves to the
fragment shader BEFORE rings land — as its own phase, reviewable in isolation on the static
grid. Port of `:186-240`, keyed on per-pixel height (varying `vHmY` passed from the vertex
displacement) and slope (from the §3.4 shader normal or `dFdx/dFdy` of `vHmY`):
sand→grass lerp (`smooth(0.8,4.5,y)`), hashed scrub mottling (`hash01` is a sin-hash —
portable verbatim: `fract(sin(a*127.1 + b*311.7)*43758.5453)` with `a,b =
round(world.xz·0.07)`), contour banding, rock/crag by slope, berm shingle band, surf band +
tidal ripple tint, and the gully term from a heightmap Laplacian (4 extra `hmHeight` taps at
±2 texels) replacing the grid Laplacian (`:224-227`). The wet-band (`:263-269`) and roughness
injections compose unchanged after it. Per-pixel banding is itself the fidelity upgrade: crisp
wet edge, crisp shingle line. Acceptance is a visual A/B against the Phase 2 build (§4).
Colour constants are copied EXACTLY from lines 189-196; determinism is preserved because the
inputs (height, hashes of quantized world XZ) are camera-independent.

### 3.8 What explicitly does not change

Shoreline mechanism (coast = y=0 intersection with the sheet — finer triangles smooth it for
free); the shore-distance field and all water fragment effects (`:279-291`, `:964-1110`);
`waterAt`/`W_TRAINS`/water vertex shader (§0.3); `heightAt` and everything upstream of it;
prop/town/canoe placement code; the HILLS table (`:1121-1129`); `dispose()` semantics (extend,
don't restructure); the engine.

---

## 4. Phased implementation plan

Every phase: one commit, independently revertible (`git revert <sha>` restores the previous
behaviour with no migration — no phase changes persisted data or goldens). Verification
commands for EVERY phase:

```sh
node --check web/js/harborterrain.js
node test/run.mjs          # all existing cases stay green; goldens untouched
```

plus the manual pass: open the app, visit all four relief harbours
(nassau / tortuga / havana / cartagena — `harborterrain.js:1121-1129`), orbit + canoe tour,
checking canoe grounding, prop seating, jetty waterlines, shadow integrity.

### Phase 0 — harness first (½ day)

1. Add `test/cases/13-terrain-height-consistency.mjs` exactly as specified in §5 (parts a, b,
   d run now; part c auto-activates when `terrain.bake` appears in Phase 2 — until then the
   case logs `bake: pending` and still PASSES on a/b/d... at Phase 0, d is also pending, so
   a/b only).
2. Add the `?stats` capture: in `harbordiorama.js` `open()` (after `eng` exists), behind
   `new URLSearchParams(location.search).has('stats')`, a 1 Hz `console.log` of
   `eng.renderer.info.render.triangles`, `.calls`, `info.memory.geometries/textures`, and the
   last frame dt. ~6 lines; no UI; no behaviour change without the flag.
- **Files:** `test/cases/13-terrain-height-consistency.mjs` (new), `web/js/harbordiorama.js`
  (stats flag only).
- **Acceptance:** `node test/run.mjs` green incl. case 13; `?stats` prints in browser.
- **Rollback:** delete the case file / revert the diorama hunk. Nothing depends on either.

### Phase 1 — conservative density win + exact coast binning (1 day)

1. `harborterrain.js:174`: `step = Math.min(16, Math.max(4.5, Math.max(W, D) / 460))`
   → ~460² grid ≈ 212k verts / 423k tris — one static draw, fine for the target GPU.
2. Implement the coast-segment uniform-grid bin (§3.2) and route `nearestCoast` through it
   (ring-expansion, exact early-exit). `inside()` is O(ring edges) and stays as-is.
3. Activate test 13(d) (binned ≡ brute-force, §5).
4. *Rider:* raise the water `seg` cap (`:912`) from 200 to 256 — density only, shader
   byte-identical (§0.3).
- **Files:** `web/js/harborterrain.js`, `test/cases/13-…` (un-pend part d).
- **Acceptance:** berm visible in geometry at canoe level; shoreline facets halved; build time
  not regressed (binning pays for the 4× bake); test 13(d) proves prop positions unmoved
  (binned `nearestCoast` exact ⇒ `heightAt` bit-identical ⇒ §0.4 corollary).
- **Rollback:** revert commit — restores line 174's formula; props never moved either way.

### Phase 2 — heightmap texture + shader displacement, same topology (2–3 days)

1. After `heightAt` is defined (post line 161), bake `hm`/`bakeSample`/`hmTex` per §3.2.
2. Keep the existing CPU pipeline through colours (lines 181-240) — then flatten:
   `for (let i = 0; i < pos.count; i++) pos.setY(i, 0);` (after line 240; normals/colours
   stay baked, §3.4). Set `geo.boundingSphere`/`boundingBox` from the PRE-flatten extents or
   `mesh.frustumCulled = false` (precedent `:568`) — flat bounds would mis-cull.
3. Add `injectDisplacement` (§3.4) and call it at the top of the existing
   `landMat.onBeforeCompile` (`:255`); fix the `vWetW` line (`:260`) to use `transformed`.
4. Add `mesh.customDepthMaterial` per §3.5 (guarded for stubs).
5. Extend the returned object with `bake` (§3.1) and `dispose()` with `hmTex.dispose()`,
   `depthMat.dispose()`.
6. Test 13(c) auto-activates (it keys on `terrain.bake`).
7. `test/lib/stubs.mjs`: add `MeshDepthMaterial: function (o) { return { ...o, isMaterial:
   true, dispose() {} }; }` and `RGBADepthPacking: 3201` next to the other materials/constants
   (`stubs.mjs:431-463`).
- **Files:** `web/js/harborterrain.js`, `test/lib/stubs.mjs`.
- **Acceptance:** visually indistinguishable from Phase 1 (same vertex count, same colours —
  the only delta is ≤ §3.3 drift); shadows unchanged (hills self-shadow; land still casts);
  wet band still hugs the waterline; test 13(c) passes with §3.3 tolerances;
  `renderer.info.render.triangles` unchanged from Phase 1.
- **Rollback:** revert commit. CPU geometry path returns; no consumer ever saw the texture
  (only the test reads `bake`, and it pends itself when `bake` is absent).

### Phase 3 — fragment-shader colour + shader normals on the static grid (2 days)

1. Port the colour bands per §3.7 into the `landMat.onBeforeCompile` fragment chunk (replace
   `#include <color_fragment>` BEFORE the existing wet-band replacement of the same anchor —
   compose them in one replacement to keep ordering explicit).
2. Switch normals to the shader reconstruction (§3.4 `beginnormal_vertex` injection) so the
   Laplacian/slope inputs are texture-derived; delete the baked `color` attribute and the
   CPU colour loop (186-240) and `computeVertexNormals` (184); stop setting Y entirely
   (geometry is born flat — drop the flatten loop from Phase 2).
3. `vertexColors: true` comes OFF the material (`:245`); keep `map: hillTexture()`.
- **Files:** `web/js/harborterrain.js`.
- **Acceptance:** A/B screenshots vs Phase 2 at orbit + canoe-at-beach: bands match in hue and
  placement (same constants), wet edge/shingle line now crisp; geometry memory drops (no
  color attribute: −2.5 MB at 212k verts); tests green.
- **Rollback:** revert commit → Phase 2 state (baked colours return).

### Phase 4 — clipmap rings + morph + skirts (3–5 days)

1. Replace the single grid with the §3.6 ring set built at `build()` time (a `makeRing(level)`
   helper: indexed BufferGeometry, local lattice, hollow interior for L≥1, skirt verts).
2. Per-ring cloned land material + depth material sharing one `uOrigin` uniform object per
   ring; XZ morph in the vertex chunk (§3.6); `uSkirt` drop.
3. Widen `update(t)` → `update(t, camera)` (`:876`) and snap origins per §3.6 (the engine
   already passes the camera — `engine.js:190`; the terrain is already an updater —
   `harbordiorama.js:480`; **no host change**).
4. Outermost ring clamps to bbox+margin so coverage is camera-independent.
5. Update `dispose()` for all ring geometries/materials.
- **Files:** `web/js/harborterrain.js`.
- **Acceptance:** ≤ ~93k land tris and 6 land draw calls in `?stats`; no pops while paddling
  shore-parallel (morph band) and no cracks (skirts); berm/silhouette/ridges resolve at canoe
  level (1.5 m cells); props/jetties sit exactly as before (positions derive from `heightAt`,
  untouched — §0.4 corollary); orbit view unchanged; tests green (headless build constructs
  rings via the stub geometry factory — keep ring construction free of browser-only APIs).
- **Rollback:** revert commit → Phase 3's static displaced grid (still shader-displaced,
  still fragment-coloured — fully shippable on its own).

### Phase 5 — optional polish (not scheduled)

- Water inner-density ring (same shader, denser plane near the camera; §1.2, §0.3 rule).
- Split-bake SDF refinement of the beach toe if review demands it (§3.3 item 3).
- Tier gating: if target-class validation (§6) fails on tier-3-but-weak mobile GPUs, gate
  rings OFF below a chosen bar using the existing tier probe (`app.js:1019-1048`,
  `carta.gfx.tier` — the diorama already requires ≥ 3, `harbordiorama.js:16`): fall back to
  the Phase 1 static mesh (keep that code path behind `opts.staticTerrain` rather than
  deleting it in Phase 4 if this is anticipated).

---

## 5. Test case 13 — concrete specification

**File:** `test/cases/13-terrain-height-consistency.mjs`. Pattern: copy the real-terrain
loading from `test/cases/05-env-transitions.mjs` / `test/lib/stubs.mjs:630-638`. No golden
file; pure assertions (so `UPDATE_GOLDEN` is irrelevant to it).

```js
import { loadRealTerrain, makeWindow, makeThree } from '../lib/stubs.mjs';

export default async function () {
  const win = makeWindow(), rec = {};
  const cartaTerrain = await loadRealTerrain(win, rec);
  const THREE = makeThree(rec);
  // Fixture: the stub lisbon ring (stubs.mjs:513) + one synthetic hill; equirect projection.
  const ring = [[-9.16, 38.69], [-9.12, 38.69], [-9.12, 38.72], [-9.16, 38.72], [-9.16, 38.69]];
  const lands = [{ properties: { harbor: 'lisbon', kind: 'land' },
                   geometry: { type: 'Polygon', coordinates: [ring] } }];
  const hills = [{ c: [-9.14, 38.705], rx: 950, ry: 430, h: 52, rot: 8 }];
  const c = { lng: -9.14, lat: 38.705 }, R = Math.PI / 180;
  const project = (lng, lat) => ({ x: (lng - c.lng) * 110540 * Math.cos(c.lat * R),
                                   z: -(lat - c.lat) * 110540 });
  const T = cartaTerrain(THREE).build(lands, hills, project);
  // ... assertions (a)-(d) below
}
```

Deterministic sample points: an LCG `let s = 12345; const rnd = () => (s = (s * 1103515245 +
12345) & 0x7fffffff) / 0x7fffffff;` — never `Math.random()`.

- **(a) Determinism of the oracle.** 100 LCG points across the fixture bbox
  (±2500 m about origin): `T.heightAt(x, z)` called twice → strictly `===`.
- **(b) Build determinism.** Build a second terrain `T2` from the same inputs; at the same
  100 points `T2.heightAt(x,z) === T.heightAt(x,z)`.
- **(c) Bake-vs-oracle drift (auto-activates when `T.bake` exists — Phase 2+).** Three strata,
  tolerances from §3.3:
  1. *Beach band:* walk the ring's 4 segments; at every 50 m along each, step inland along the
     segment normal (inland = side where `heightAt > 0` at 30 m) sampling
     `d ∈ {6, 10, 16, 21, 26, 40}` m; keep points with `0.5 < heightAt < 3` (≈150–200 pts).
     Assert `|T.bake.sample(x,z) − T.heightAt(x,z)| < 0.05`.
  2. *Crease band:* same walk at `d ∈ {−3, −1, 0, 1, 3}` m; keep `|heightAt| ≤ 0.5`.
     Assert `< 0.45` and report (console) the observed max — expected ≲ 0.39 (§3.3).
  3. *Global:* 200 LCG points over the full bbox+margin (read extent from `T.bake.x0/z0/w/d`).
     Assert `< Math.max(0.05, 0.01 * Math.abs(T.heightAt(x,z)))`.
- **(d) Binning exactness (auto-activates in Phase 1; keyed on a build flag or simply always
  on once Phase 1 lands).** At the (c.1 ∪ c.3) points, `heightAt` computed with binning must
  equal a brute-force reference. Implementation: the simplest exact check needs no internal
  hook — build once with binning (production path) and assert against (b)'s second build with
  binning disabled via `opts` (add `opts.bruteForceCoast = true` in Phase 1, test-only escape
  hatch): values must be `===` (identical arithmetic, identical order ⇒ bit-equal).

Runtime budget: the default 2048² bake on the 4-segment fixture ring is ~4.2 M cheap calls —
≈1–2 s in Node; acceptable. If the runner ever needs it faster, pass `{ hmRes: 1025 }` and
relax (c.1) to `texel²·0.018/8 + 0.02` with `texel = max(w,d)/(hmRes−1)` — the tolerance
formula, not the number, is the contract.

Pending behaviour: before the relevant phase lands, parts (c)/(d) detect the missing
`T.bake` / `opts.bruteForceCoast` support and self-skip with a logged note — the case still
PASSES on the active parts (do not use the runner's whole-case `{skipped}` mechanism for
partial pendings).

---

## 6. Measurement plan and derating policy (locked decision 1)

- **Certification target: 60 fps (16.6 ms) on M1 / GTX-1660-class.** The dev machine is an
  Apple M4, which is materially faster.
- **Derating rule for local numbers:** a phase passes locally only at **≤ 60 % of the frame
  budget on the M4** — ≤ 10 ms full frame, with the terrain's share (measured by toggling the
  land mesh visible/hidden under `?stats`) ≤ 2 ms. Numbers above that are a local FAIL even if
  the M4 holds 60 fps.
- **One validation pass per shipped phase (1–4) on target-class hardware** (an M1 machine or a
  GTX-1660-class PC): full 16.6 ms budget, orbit + canoe-at-beach on tortuga (largest relief)
  and havana (two hills + town density).
- **Mobile / weak-GPU decisions go through the tier system** (`app.js:1019-1048`,
  `harbordiorama.js:16`) — never "feels fine on the dev machine". If target-class validation
  fails, Phase 5's tier gate is the lever.
- **Capture per phase (orbit + canoe-at-beach, via `?stats`):** frame dt, `render.triangles`,
  `render.calls`, `memory.geometries/textures`, terrain build time (console.time around
  `build()` locally), and a screenshot pair at canoe level (beach silhouette, berm, ridge
  crest) for the visual diff.
- **Expected budget at Phase 4:** ~93k land tris (vs 106k today), 6 land draws, ~2 MB ring
  attributes + 16.8 MB heightmap (vs ~6 MB position+normal+color today); VTF load ≈ 45k verts
  × ~20 texelFetch ≈ 0.9 M fetches/frame — light for the target class.

---

## 7. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| heightAt drift → canoe/prop/jetty misbehaviour | High | `heightAt` analytic and untouched (§3.1); drift is render-side only, quantified (§3.3), test-enforced (§5c); crease worst-case 0.39 m is underwater and visual-only; SDF split-bake is the escape hatch. |
| Coast binning changes `heightAt` values | High | Exact-algorithm requirement (§3.2) + test 13(d) bit-equality. |
| Wet band breaks on flattened geometry | Med | Explicit `vWetW = transformed` fix is a Phase 2 numbered task (§3.4, §4-P2.3). |
| Shadow pass ignores displacement | Med | `customDepthMaterial` with the shared injection (§3.5); acceptance checks hill self-shadowing. |
| Mobile VTF performance | Med | WebGL2 guarantees ≥16 vertex samplers; load estimated §6; tier gate fallback (Phase 5) to the Phase 1 static mesh; transform feedback documented fallback (§2). |
| Headless stubs crash on new THREE surface | Med | Stub additions enumerated (§4-P2.7); terrain guards `THREE.MeshDepthMaterial`; ring build uses only stub-supported geometry APIs (acceptance §4-P4). |
| Ring seams / pops | Low | Height is seam-free by shared-texture construction (§3.6); XZ morph + skirts; painterly style forgiving. |
| Frustum culling with flat geometry | Low | Explicit bounds or `frustumCulled = false` (§4-P2.2; precedent `:568`). |
| Golden/characterization breakage | Low | Cases 00-12 are engine-level; terrain changes additive; goldens never regenerated (§0.5). |
| Bake time regression | Low | Binning (Phase 1) precedes the big bake (Phase 2); budget < 1 s (§3.2). |

---

## 8. Out of scope / DO NOT TOUCH

- `W_TRAINS`, `waterAt` (`harborterrain.js:28-43`), the water vertex shader (`:944-963`) and
  the entire water fragment shader (`:964-1110`) — byte-identical. The canoe's `TRAINS` copy
  (`harborcanoe.js:23-29`) likewise.
- The body and call graph of `heightAt` (`:152-161`) and everything it calls
  (`segDist`/`nearestCoast`/`inside` `:101-128`, `hillProfile` `:55-78`, `reliefH` `:79`,
  `hillsAt` `:139-149`) — return values must stay bit-identical (binning is an exact
  accelerator, not an approximation).
- `web/js/harborcanoe.js`, `web/js/harbortown.js`, `web/js/render/engine.js`,
  `web/js/harbortrees.js` — zero edits. `web/js/harbordiorama.js` only for the Phase 0
  `?stats` flag.
- The HILLS table (`harborterrain.js:1121-1129`).
- All strandline/crag/scree placement logic (`:344-505`, `:712-765`) — positions must not
  move (they won't, if `heightAt` doesn't — §0.4 corollary).
- The shore-distance field semantics (`:279-291`) and every uniform name the host reads
  (`uTime`, `uShine`, `uSunDir` — `harbordiorama.js:475-476` and the env toggle path).
- `test/golden/*.json` — never regenerated. Existing cases 00-12 — never edited.
- The discrete-LOD systems audited in `d_lod_muklvar.md` (ships/trees/birds/town) and any
  CLOD work from `clod.md` — separate plans.

**Implementer-assigned open items (decision procedure included):**
1. *Heightmap resolution if `max(W,D)` falls well under 4.6 km* (small harbours): keep
   N = 2048 (texel < 2.3 m, error only shrinks) unless build time or VRAM measurably hurts on
   target-class validation; then choose the smallest power-of-two+1-free N with texel ≤ 2.5 m.
   Decide by §6 measurements, record in the Phase 2 commit message.
2. *Phase 4 morph band width (25–35 %) and skirt depth (1–2 cells):* tune visually on tortuga
   at canoe level; acceptance is "no pops, no cracks" — pick the smallest values that pass.
3. *Whether Phase 1's static-mesh path survives Phase 4* (`opts.staticTerrain`): keep it only
   if Phase 5 tier gating is anticipated after target-class validation; otherwise delete in
   Phase 4 and rely on `git revert` for rollback.

---

## Sources

- [Losasso & Hoppe — Geometry Clipmaps (SIGGRAPH 2004)](https://hhoppe.com/proj/geomclipmap/) · [ACM](https://dl.acm.org/doi/10.1145/1015706.1015799)
- [Asirvatham & Hoppe — GPU-Based Geometry Clipmaps (GPU Gems 2, ch. 2)](https://hhoppe.com/proj/gpugcm/) · [PDF](https://hhoppe.com/gpugcm.pdf)
- [rotoglup — minimal clipmap terrain engine (~200 LOC)](https://github.com/rotoglup/gpu-geometry-clipmaps-minimal-terrain-engine)
- [Strugar — CDLOD paper](https://aggrobird.com/files/cdlod_latest.pdf) · [reference implementation](https://github.com/fstrugar/CDLOD)
- [Khoury, Dupuy & Riccio — Adaptive GPU Tessellation with Compute Shaders](https://onrendering.com/data/papers/isubd/isubd.pdf) · [demo](https://github.com/jdupuy/opengl-framework/tree/master/demo-isubd-terrain)
- [Dupuy et al. — Concurrent Binary Trees for Large-Scale Game Components (arXiv:2407.02215)](https://arxiv.org/abs/2407.02215)
- [WebGL2 What's New (float textures, vertex samplers)](https://webgl2fundamentals.org/webgl/lessons/webgl2-whats-new.html) · [OES_texture_float_linear — MDN](https://developer.mozilla.org/en-US/docs/Web/API/OES_texture_float_linear)
- [J-Zeitler — WebGL geometry clipmaps](https://github.com/J-Zeitler/geometry-clipmaps) · [Felix Palmer — lod-terrain (three.js)](https://github.com/felixpalmer/lod-terrain)
- [three.js webgl_geometry_terrain example](https://threejs.org/examples/webgl_geometry_terrain.html) · [Pointer — Rendering semi-realistic landscapes in the browser](https://nathanpointer.com/blog/landscapes)
