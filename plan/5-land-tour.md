# Land Tour (walk on foot) — implementation handoff

**Goal.** Let the canoe-touring user **disembark onto a walkable beach, explore the town and
island on foot** (first-person, WASD + free mouse-look), and **re-embark**. Collision against
buildings and tree trunks; ground-following at a ~6 ft eye height; pace that varies by surface
and turning; a disembark/embark camera animation; a minimap showing the parked canoe and the
live walker. 60 fps on the certified reference GPU (Apple M1 / GTX-1660-class), three.js
r160, vanilla JS, no bundler.

**Status of this document.** Every `file:line` anchor was verified against the working tree at
commit **`223d1d7`** (`town: tier-5 fine townhouses + wealth-gradient test`). An implementer
should need only this doc + the repo. Where a step is non-obvious, a short code sketch is given;
the sketches are illustrative, not literal patches. This doc was reviewed adversarially before
handoff (failure-mode, correctness, and solution-fit passes); the locked decisions below fold in
those findings.

**Hard constraints.**
- **Module convention:** every `web/js/*.js` is a plain script hanging one factory off `window`
  (e.g. `window.cartaHarborCanoe`, `harborcanoe.js`; `window.cartaTownBuilder`, `harbortown.js:13`;
  `window.cartaRenderEngine`, `render/engine.js`). Scripts load via `<script>` tags in
  `web/index.html` and `web/rig.html`. No import graph beyond the three.js importmap. The new
  `web/js/harborwalker.js` follows this exactly: `window.cartaHarborWalker = function (THREE) { … }`.
- **Tests stay green.** `node test/run.mjs` currently runs **27** cases (`test/cases/00..27`).
  Add `test/cases/28-land-tour.mjs`. **Note (harness scope):** the stub host (`test/lib/stubs.mjs`)
  evaluates only `harbordiorama.js`, `harborterrain.js`, `render/engine.js` — `harbortown.js`,
  `harbortrees.js`, `harborcanoe.js`, and the new `harborwalker.js` are **not** loaded there. So
  collision-capture edits inside `harbortown.js`/`harbortrees.js` cannot break cases 00–27, but
  any new mode logic in `harbordiorama.js` can — guard new branches so the town/canoe/walker
  absence (try/catch already present at the diorama's town step) degrades cleanly.
- **No new per-frame allocation in the walk hot loop.** Preallocate scratch vectors/eulers at
  `build()` scope, exactly as the canoe does (`harborcanoe.js:670-674`).

**Locked decisions** (the first four are the product owner's; the rest resolve the design review).
1. **Controls:** WASD + **free** mouse-look. Mouse sets look (yaw/pitch) independently; W/S move
   along facing, A/D strafe, optional **Shift** = faster. (Decoupled — movement is relative to
   facing; look does not steer movement.)
2. **Walkable area:** the **whole island**, hills included. Only a **cliff gate at the landing
   point** (and the water/boundary edge) blocks; ordinary hill grades are freely climbable. No
   per-step slope block while walking.
3. **Re-embark:** **proximity AND facing** — `"E to embark"` only when within ~3.5 m of the
   parked canoe AND looking roughly toward it (`dot(forward, toCanoe) > ~0.3`).
4. **Step-over:** anything < 3 ft (≈0.91 m) tall is simply **not registered** as an obstacle
   (logs, barrels, middens, rocks). Only dwellings and tree trunks collide.
5. **Collision = circles, v1.** Houses are bounding **circles** (`r ≈ hypot(w/2,d/2)·1.08`), same
   ejection math as tree trunks — one code path, no oriented-rect projection, no `cos/sin`
   capture. Conservative (slightly over-blocks; never clips through a wall). *Promote* to a baked
   1-bit obstacle bitmask (sampled like the heightmap) **only if** circle-only over-blocks the
   tightest street rows (Nassau) — a single screenshot test decides. (Resolves review HIGH
   "rect under-sized for box houses" + SIMPLIFY "drop OBB".)
6. **No new spatial grid, v1.** Reuse the trees module's existing cell grid for trunks; brute-force
   with a range-gate over the few-hundred house circles. (Resolves SIMPLIFY "cut the 8 m grid".)
7. **`sampleH()` indirection everywhere** for terrain height — `frame.bake` is **null** on devices
   without `THREE.DataTexture` (`harborterrain.js:1003`; the canoe tour already runs on `heightAt`
   in that case). Never call `bake.sample` directly. (Resolves review HIGH "null-bake crash".)
8. **Cliff gate = height-gain over a ~12 m inland baseline**, not a ±3 m finite difference (which
   the beach **berm** trips, `harborterrain.js:230-231`). (Resolves review HIGH "cliff gate
   misclassifies the beach".)
9. **`harborwalker.js` implements the rig *interface*, it does not "mirror the canoe."** Copy only
   the contract (`build → {group, spawn, update, pos, dispose}`) and the camera-seat block
   (`harborcanoe.js:823-830`). The canoe's water/grass/fish/wake/spray/audio scaffolding
   (`harborcanoe.js:475-700`) is irrelevant — do not copy it. The walker `build()` is ~60 lines.

---

## 1. Repo orientation (read first)

- **The mode machine** lives in `web/js/harbordiorama.js`. `let mode = 'overview' | 'tour'`
  (`:39`). The engine (`render/engine.js`) owns the rAF loop `frame()` (`:207`): it computes
  `dt/t`, runs `preUpdateHook` (top of loop — the camera **tween** slot, `harbordiorama.js:367`),
  ticks `controls.update()` only in overview, then runs `modeHook(dt,t,now)`
  (`harbordiorama.js:1113`), then `frameHook` (audio), then updaters, then renders.
- **`modeHook`** (`:1113`) is where per-frame mode work happens. The `mode==='tour' && canoe`
  branch (`:1117`) calls `canoe.update(dt, t, {camYaw,camPitch,rowing,reverse,cruise}, camera)`
  and drives the minimap at ~7 Hz (`:1125`). Add a parallel `walking` branch here.
- **The camera-seat idiom** (the one thing the walker copies): a rig owns the camera each frame —
  `harborcanoe.js:823-830`:
  ```js
  _seat.copy(EYE).applyEuler(rig.rotation).add(rig.position); camera.position.copy(_seat);
  _eLook.set(input.camPitch||0, yaw, 0, 'YXZ'); _qLook.setFromEuler(_eLook);
  _eTilt.set(pitch*0.25,0,roll*0.25,'YXZ'); _qTilt.setFromEuler(_eTilt);
  camera.quaternion.copy(_qLook).multiply(_qTilt);
  ```
  The walker drops the boat-tilt (`_qTilt`) and sets position directly from `(px, groundY+eyeH+bob, pz)`.
- **`frame` / `built`.** `buildScene(id)` assembles the scene and the `frame` coordinate object
  (`harbordiorama.js` ~`:499-517`): `frame.project(lng,lat)→{x,z}`, `frame.heightAt`, `frame.bake`
  (`{sample,x0,z0,w,d,n}` or **null**), `frame.centroid`, `frame.radius`. `built` exposes
  `.frame`, `.radius`, `.terrain` (`.seaLevel===0`, `.waterAt`), `.lands` (GeoJSON rings),
  `.shipDots`. The walker's collision/surface data is hung on `built` here.
- **`window.cartaDiorama` (`carDio`)** is the public API + verification hook surface:
  `active, open(id), close(), _cam, _controls, _camDist, _tourPos, _frame, _canoe, _trees,
  _timings, _perf()`. The rig (`tools/rig.mjs`) reads these via `page.evaluate`. New dev hooks go
  here (`_enterWalk`, `_walker`, `_obstacles`).
- **Input** (`harbordiorama.js:288-342`): pointer-lock on the canvas; `mousemove` updates module
  vars `camYaw`/`camPitch` (guarded `mode!=='tour'`); `keydown` sets `fwdKey`/`revKey`
  (guarded); a **separate** `keydown` listener (`:333`) handles Esc; `keyup` (`:321`) clears
  `fwdKey`/`revKey` with **no** mode guard; `wheel` (`:327`) and `mousedown` (`:291`) guarded.

## 2. Coordinate frame & invariants (memorize before touching collision)

- World metres, **X east / Y up / Z south**, origin = harbour centroid, `seaLevel = 0`.
- **`frame.project(lng,lat)` negates latitude:** `z = -(lat - c.lat)·M_PER_DEG_LAT`
  (`harbordiorama.js:423`). The town builder's **internal** `streetSegs[harbor]`
  (`harbortown.js:1633-1638`) uses `llM` with **+lat** and a different origin — a different frame.
  **Collision/surface data MUST be projected through `frame.project`, never reused from
  `streetSegs`,** or streets land mirrored-in-Z (symptom: faster pace over grass, sand pace on
  cobbles — silent, no crash; the test in §9 pins it).
- **`bake.sample` clamps off-grid:** gx/gz are clamped to [0,1] (`harborterrain.js:274-275`), so
  any `(x,z)` outside the baked bbox returns the **edge texel**, i.e. a flat fake floor. The bbox
  is only `footprint + margin` (`harborterrain.js:243-244`). **Implication:** the walker needs an
  explicit boundary (§4) or the player strolls out over the sea on an invisible shelf.
- `heightAt` returns seabed (`d·0.7`, floored at `SEABED=-34`) below the waterline
  (`harborterrain.js:226`); the beach is a smooth ~3 % ramp to `BASE_INLAND=7 m` over
  `BEACH_RAMP=240 m`, with a **berm** step (smoothstep, +0.3 m over d≈16–26 m, `:230-231`); hills
  add large relief where they meet the shore — that seam is the only real "cliff".

---

## 3. Phase 1 — Collision + surface data (no behaviour change)

Goal: hang everything the walker queries on `built`, with the least-invasive capture, and a
`sampleH()` height accessor that tolerates a null `bake`.

### 3.1 `sampleH()` height accessor (do this first — everything depends on it)
In `buildScene`, after `frame.bake` is set, define and stash:
```js
const _bake = frame.bake;
frame.sampleH = _bake ? ((x,z) => _bake.sample(x,z)) : ((x,z) => frame.heightAt(x,z));
```
Use `frame.sampleH` for **all** walker ground/slope/gate reads. (The canoe tour already proves
`heightAt`-only devices work, so walking must too.)

### 3.2 Dwelling footprints → circles (`web/js/harbortown.js`)
⚠️ **Capture at the single common entry `pushHouse(style, harbor, lon, lat, ang, w, d)`
(`:1482`), right after its `if (perHarbor[harbor] > 520) return;` cap — NOT at the box-house
struct (`:1545`).** The recent *wealth-gradient* commits forked `pushHouse` into three branches:
tiers 1–3 (tents/shacks/cottages) → instanced humble kits (`:1491`); tier 5 → fine townhouse
(`:1511`); only tier 4 / fall-through reaches the `h` struct (`:1545`). **Every** dwelling still
passes through `pushHouse`, so one capture there covers all of them; hooking the `h` struct alone
leaves the **majority** of dwellings walk-through. The kits expose **no** footprint dims (`box`
in `shanties.js`/`townhouses.js` is just a `BoxGeometry` helper), so the plot `w×d` is the only
uniform silhouette available. Store raw geo (project later, §3.5):
```js
// inside pushHouse, after the perHarbor cap, before the tier fork:
footprintsRaw.push({ lon, lat, w, d });   // ang not needed for a circle
```
Use a **bounding circle** `r = hypot(w/2, d/2) · 1.08` (the `·1.08` mirrors the box-house render
inflation `w*1.08`/`d*1.08`, `:1549-1551`; conservative for kits). `input` is already filtered to
this harbour (`filterStructures(id)`), so `footprintsRaw` is per-harbour.
*Optional follow-up (not v1):* large civic landmarks (church, fort) build on separate
`groundMatrix` paths; add their circles to the same list if walking through them reads badly.

### 3.3 Streets → segments (`harbortown.js`)
Re-project `S.streets` through **`frame.project`** into `{x1,z1,x2,z2,w}` (width from
`STREET_W[style]`, `:86`). Do this in the diorama (§3.5) from the raw `S.streets`, or return raw
LineStrings + style from `build()` and project in the diorama. **Do not** use `streetSegs`.

### 3.4 Tree trunks (`web/js/harbortrees.js`)
The module already holds `trees` (`:589`), records `{gm,bm,px,py,pz,kind,variant,…}` pushed at
`:811`, already `frame.project`-ed (`:663`), and **already builds a uniform cell grid** `cells`
(`:921`, but only when `metric && trees.length`, `:703`). Add two accessors to the return object
(`:1152`, currently `{group, init, update, get stats, get tiers}`):
```js
trunks: () => trees.map(t => ({ x: t.px, z: t.pz, r: 0.35 })),
// near(x,z,rad): uses `cells` when present, else a brute scan — never assume cells != null
nearTrunks: (x, z, rad) => { /* query cells bin(s) around (x,z); fallback: filter trees */ },
```
`nearTrunks` **must** handle `cells === null` (non-metric / empty) by scanning `trees` directly,
or tree collision silently no-ops. The diorama path is always metric, but state the precondition.

### 3.5 Assemble on `built` (`harbordiorama.js`, in `buildScene`)
After the town + trees builds, with `frame` available:
```js
built.obstacles = {
  houses: footprintsRaw.map(f => { const p = frame.project(f.lon, f.lat);
    return { x: p.x, z: p.z, r: Math.hypot(f.w/2, f.d/2) * 1.08 }; }),
};
built.streets = S.streets.map(st => /* project each segment via frame.project, attach width */);
built.trunks  = built._treesModule;   // hold the trees module so the walker can call nearTrunks()
carDio._obstacles = { houses: built.obstacles.houses.length, streets: built.streets.length };
```
**No spatial grid built here.** Houses are a few hundred (brute-force + range-gate in the walker);
trunks go through the trees module's existing bins.

### 3.6 Extend the `build()` returns
- `harbortown.js:3127` `return { group, lod, stats, treeField }` → add `footprints, streets`
  (raw). Confirm no consumer spreads the return in a way the new keys break (they don't — it's
  destructured by name in the diorama).
- `harbortrees.js:1152` → add `trunks, nearTrunks`.

**Verify (Phase 1):** rig prints `carDio._obstacles` — nonzero, plausible (Nassau ~hundreds of
houses, thousands of trunks, tens of streets). No scene change.

---

## 4. Phase 2 — The walker rig (`web/js/harborwalker.js`)

Interface contract (mirrors the canoe's *shape* only):
`build(frame, opts) → { group, spawn(x,z,yaw), update(dt,t,input,camera), pos(), dispose() }`.

**State (build scope):** `px, pz, yaw=0, pitch=0, eyeH=1.83, bobPh=0, lastYaw=0`. Preallocated
scratch: `_e = new THREE.Euler(0,0,0,'YXZ')`. `group` is empty (optionally a debug marker).
**Constants:** `BODY_R=0.45`, `EYE_STAND=1.83`, `WALK_SAND=1.2`, `WALK_STREET=1.7`, `RUN=1.8`,
`TURN_SLOW_MIN=0.45`, `BOB_AMP=0.06`, `MAX_DROP=0.6 /*m per frame*/`.

**`spawn(x,z,yaw0)`** sets `px=x, pz=z, yaw=yaw0`, `eyeH=EYE_STAND`, zeroes `bobPh`. Before
committing, run **one ejection pass** (§4.collision) so a beachfront house/palm at the landing
point doesn't trap the walker on frame 1; if ejection moves the point, re-validate it's on land
(`sampleH > seaLevel+0.1`).

**`update(dt,t,input,camera)`** — `dt = min(0.05, max(1e-4, dt))`:
1. **Look:** `yaw = input.camYaw; pitch = clamp(input.camPitch, -1.5, 1.5)`. (Set by the host
   from mouse deltas — decoupled from movement.)
2. **Move intent:** forward `(fx,fz)=(-sin yaw, -cos yaw)` (canoe convention, `harborcanoe.js:731`);
   right `(rx,rz)=(-cos yaw,  sin yaw)`. **Verify the strafe sign** against the canoe so A/D aren't
   inverted (sketch: pressing D should move toward screen-right). `mvF = (W?1:0)-(S?1:0)`,
   `mvR = (D?1:0)-(A?1:0)`. Desired dir `dx=fx*mvF+rx*mvR, dz=fz*mvF+rz*mvR`, normalized.
3. **Speed:** base = `onStreet(px,pz) ? WALK_STREET : WALK_SAND` (street test = min point-to-segment
   distance over `built.streets` < `w/2`; brute-force, tens of segments). Turn slowdown:
   `turnRate = |yaw-lastYaw|/dt; speed = base · lerp(1, TURN_SLOW_MIN, clamp(turnRate/3,0,1))`;
   `lastYaw = yaw`. Shift: `speed *= input.run ? RUN : 1`.
4. **Proposed move, step-capped:** `stepLen = min(speed·dt, BODY_R·0.9)` (cap < `BODY_R` to defeat
   tunnelling); `nx = px + dx·stepLen, nz = pz + dz·stepLen`.
5. **Boundary:** reject the move (keep `px,pz`) if `sampleH(nx,nz) < seaLevel + 0.1` (walking into
   sea) **or** `(nx,nz)` is outside the bake bbox (`x0..x0+w`, `z0..z0+d` from `frame.bake`, or a
   `hypot(nx,nz) > radius·1.0` fallback when `bake` is null). This is the missing outer bound.
6. **Collision (circle ejection + reject-fallback):** gather nearby blockers — house circles within
   range (`dx²+dz² > (R+stepLen)²` skip) + `frame_trees.nearTrunks(nx,nz,BODY_R+0.5)`. For each
   blocker `(cx,cz,cr)`: if `d = hypot(nx-cx,nz-cz) < cr+BODY_R`, push the point out along the
   normal to exactly `cr+BODY_R`. After **one** ejection pass, if still penetrating any blocker,
   **reject the whole move** (`nx=px,nz=pz`) — canoe semantics (`harborcanoe.js:734`), bounded, no
   oscillation. Else commit `px=nx, pz=nz`.
7. **Ground-follow + vertical clamp (mandatory):** `gy = sampleH(px,pz)`; `targetEye = gy+EYE_STAND`;
   clamp the per-frame change `eyeBase = prev ± min(|targetEye-prev|, MAX_DROP)` to avoid camera
   punch-through on steep grade (cartagena). `bob = sin(bobPh)·BOB_AMP·(speed/WALK_STREET)`;
   advance `bobPh += speed·dt·2.2`.
8. **Seat camera:** `camera.position.set(px, eyeBase + bob, pz);
   _e.set(pitch, yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(_e);`

**`pos()`** → `{ x: px, z: pz, heading: yaw }` (same shape `drawMini` expects). **`dispose()`**
releases `group` (cheap — nothing heavy to free).

**Dev hook** `carDio._enterWalk(x,z,yaw)` (see §6): flips straight into walking with **no**
animation. It must assert `eng` running + `built` + `built.obstacles` ready; for embark testability
it should ensure a canoe exists and is parked (build+park one at the spawn if none).

**Verify (Phase 2):** `rig --walk` drops in; `_walker.pos()` tracks input; collision halts at a
wall (no tunnel, no jitter); `sampleH(pos) ≈ camera.y - eyeH ± bob`; cannot walk into the sea.

---

## 5. Phase 3 — Disembark / embark + first-person camera animation

### 5.1 Disembark eligibility (in `modeHook`'s tour branch, from `canoe.boatPos()`)
March a probe along the boat's forward heading in ~1 m steps out to ~8 m; the **shore entry** is
the first probe where `sampleH > seaLevel + 0.1`; the **landing point** `L` is ~2 m past it.
Eligible when **all** hold:
- `L` exists within range and the boat is within ~6 m of it (canoe naturally slows at shore,
  `harborcanoe.js:733`);
- **on land:** `sampleH(L) > seaLevel + 0.1`;
- **not a cliff (height-gain gate):** `sampleH(Lx+12·fx, Lz+12·fz) - sampleH(L) < 3.5` — a beach
  rises < ~3.5 m over 12 m inland; a hill/cliff seam rises far more. This is robust to the berm
  (a ±3 m finite difference is **not** — it can read >0.15 straddling the berm edge and refuse an
  obvious beach).
Set `landE = true` and show the prompt `"E to disembark"`. Re-validate the gate at the **ejected**
spawn point (§4 spawn) before committing.

### 5.2 Prompt DOM
Add a `.dio-eprompt` element beside `tourHint`/`pauseHint` (`harbordiorama.js:239`-ish); toggle
`.show` and set text. **Clear it on every mode transition** (enter/exit walk, close, Esc).

### 5.3 `E` key
Extend the tour `keydown` listener (`:313`). On `E` when `mode==='tour' && landE` → `enterWalk(L)`.
The walking-mode `keydown` branch handles `E` when `embarkE` → `embark()`.

### 5.4 Parked canoe (no teleport, no freeze-tilt)
`enterWalk` stores `parked = canoe.boatPos()` and **stops calling the full `canoe.update`** (it
seats the camera at `:824-830`, which would fight the walker). It does **not** call `canoe.spawn()`
on resume — the canoe's `px/pz/theta/v` are closures inside `build()` and stay at `parked`, so
re-embark resumes from the parked pose automatically (calling `spawn()` would teleport it back to
the ship-average spawn — don't). To avoid the boat freezing at a random swell phase, add a
**camera-free float** to the canoe module:
```js
// harborcanoe.js — add to the returned object:
float(dt, t) { /* place hull on waterAt(px,pz,t): rig.position/rotation only; NO camera, NO paddle */ }
```
Call `canoe.float(dt,t)` from the walking branch each frame so the moored canoe bobs gently.

### 5.5 First-person camera tween `tweenWalkCam(fromPose, toPose, ms, onTick, done)`
The spherical `tweenCamera` (`:798`) only lerps orbit params — unusable for FP. Add a tween that
drives `camera.position` + `camera.quaternion` directly, reusing the **existing `tween` slot** the
engine ticks at the top of the loop (`eng.setPreUpdateHook`, `:367`).
- **Disembark keyframes:** `from` = the canoe's current eye pose captured at `enterWalk`
  (≈3 ft above water); `to` = standing pose at the spawn (`gy + EYE_STAND`). Interpolate eye
  height and add a `sin(k·π)·30°` **Y-swing** (tilt out, rotate back while rising) — the Z term of
  the YXZ euler. **Embark** is the reverse: `from` = standing pose, `to` = the canoe seat pose
  (then hand control back to `canoe.update`). *(The 30° swing is droppable polish if Phase 3 runs
  long; the core loop is disembark→walk→embark.)*
- **Abort-safety (critical).** While `tween != null`:
  - `modeHook`'s walking branch **early-outs entirely** (no `walker.update`, no `embarkE` compute,
    no minimap churn) — the tween owns the camera.
  - **Esc and window-blur are swallowed** (no transition) until the tween's `done()` fires.
  - Provide a single `cancelWalkTween()` that **force-completes** state (sets final `eyeH`, clears
    `.dio-eprompt`, swaps body classes) — never just `tween=null`. `close()` nulls `tween` at
    `:1091`; teardown (`close()`/`exitWalk`) must call `cancelWalkTween()` (or fully reset
    walker+camera), or walking is left half-initialized.

### 5.6 `embark()`
Eligible (set in §6's walking branch) when within ~3.5 m of `parked` **and** facing it
(`dot(forward, normalize(parked - pos)) > 0.3`). On `E`: run `tweenWalkCam` reverse; in `done()`,
`exitWalk()` resumes `canoe.update` (state intact at `parked`) → back to tour on the water.

**Verify (Phase 3):** rig asserts `_landE`/`_embarkE` booleans at known poses; `camera.position.y`
sweeps from the canoe eye to `gy+1.83` during the tween; Esc mid-tween is a no-op; a hill/water
seam refuses disembark while a flat beach allows it.

---

## 6. Phase 4 — Host wiring, minimap, polish

### 6.1 Mode machine (`harbordiorama.js`)
- `mode` union → `'overview' | 'tour' | 'walking'`. New host state: `walker, parked, landE, embarkE`.
- **Input guards — exact list** (admit `'walking'` where `mode==='tour'` is checked):
  `mousedown` (`:291`), `mousemove` (`:298`), `pointerlockchange` (`:306`), the movement `keydown`
  (`:314`), `wheel` (`:327`), and the **separate Esc `keydown`** (`:333`). **`keyup` (`:321`) is
  unconditional — leave it.** Movement `keydown`/`keyup` must also set W/A/S/D/Shift flags for the
  walker. `mousemove` already feeds `camYaw`/`camPitch` (reused as-is).
- **State hygiene:** `enterTour` resets `fwdKey/revKey/camYaw/camPitch` (`:955`). `enterWalk` and
  `exitWalk` must likewise **reset W/A/S/D/Shift and (for enterWalk) initialise `yaw=camYaw`** so
  key/look state doesn't bleed across transitions.
- **`modeHook` walking branch** (parallel to `:1117`): if `tween` → early-out (§5.5). Else
  `walker.update(dt,t,{camYaw,camPitch,W,A,S,D,run}, camera)`; `canoe.float(dt,t)`;
  `carDio._tourPos = walker.pos()`; compute `embarkE`; `drawMini(walker.pos())` at ~7 Hz.
- **`enterWalk(L)` / `exitWalk()`** beside `enterTour`/`exitTour` (`:939`/`:986`). Walking camera:
  `fov:65, near:0.08, far:radius*10` (set on enter, restore on exit). `enterWalk` builds the walker
  (lazy, like the canoe), `walker.spawn(L.x,L.z, yawTowardInland)`, stores `parked`, starts the
  disembark tween, adds a `walking` body class (so the `.touring .dio-minimap` rule keeps the map
  visible — add a sibling `.walking` selector).
- **Two exit restore targets:** `embark()→exitWalk` restores the **tour** camera (`fov:70,near:0.1`,
  matching `:960`); **`close()` while walking** restores the **overview** camera (`fov:38`, matching
  `:997-1000`). Specify both.
- **`close()` (`:1078`) and Esc (`:333`) must handle `mode==='walking'`:** `close()` currently only
  `exitTour`s for `'tour'` — add: dispose the walker, clear `built.obstacles`, dispose the (frozen)
  canoe, restore overview camera. Esc in walking steps **back to the canoe** (`exitWalk`→tour), not
  to overview. Missing these = stuck/leaked mode.

### 6.2 Minimap
The live walker arrow works through `drawMini(walker.pos())` (`:870`, same `{x,z,heading}`). Add a
**parked-canoe glyph in the per-frame `drawMini` layer** (NOT `drawMiniBase:819`, which is
pre-rendered before `parked` exists) — draw a small boat/anchor mark at
`(W/2 + parked.x·miniScale, W/2 + parked.z·miniScale)`. The walker arrow's `heading` is the
**facing** yaw (decoupled look) — acceptable; document it so it doesn't read as a bug.

### 6.3 Polish
Tune `WALK_SAND/WALK_STREET`, `TURN_SLOW_MIN`, `BOB_AMP`, `RUN`. Promote to the baked obstacle/
surface bitmask **only if** circle-only over-blocks tight rows (the one open fit question, §10).

---

## 7. Performance budget
Per walk frame: 1 `sampleH` (ground) + the street scan (tens of segments) + house collision
(few-hundred circles, range-gated → a handful pass) + `nearTrunks` (bin lookup, not all ~8 k
trees). The cliff gate's extra `sampleH` calls run **only** during the disembark probe, not every
frame. No allocation in the loop (preallocated scratch). Comfortably 60 fps on M1/1660. `dt` capped
at 0.05 and `stepLen < BODY_R` keep collision tunnel-free even after a background-tab stall.

## 8. Critical files
- `web/js/harborwalker.js` — **new** rig (~60 lines; interface + camera-seat only; no canoe scaffolding).
- `web/js/harbordiorama.js` — `sampleH`, `built.obstacles/streets` assembly, mode machine,
  `enterWalk/exitWalk`, `tweenWalkCam`+`cancelWalkTween`, input guards, minimap glyph, `close()`/Esc
  walking branches, dev hooks (`_enterWalk`, `_walker`, `_obstacles`).
- `web/js/harbortown.js` — footprint capture at `pushHouse` (`:1482`, all tiers); `frame.project`
  streets; extend `build()` return (`:3127`). `models/shanties.js`/`townhouses.js` need **no** change.
- `web/js/harbortrees.js` — `trunks()` + `nearTrunks()` (`:1152`); reuse `cells` (`:921`), handle null.
- `web/js/harborcanoe.js` — add `float(dt,t)` (camera-free moored bob); do **not** add a teleport.
- `tools/rig.mjs` + `web/rig.html` — `--walk` flag + `carDio._enterWalk` hook.

## 9. Test & verification
- **New `test/cases/28-land-tour.mjs`** (stub host loads only diorama/terrain/engine, so assert the
  diorama-side logic; mock `built.obstacles`/`built.streets` if needed): obstacle counts nonzero;
  **`onStreet` true at a hand-checked on-cobble coordinate** (catches the lat-flip frame bug — a
  count-only test won't); collision halts at a wall; ground-follow `≈ sampleH`; eye-height sweep
  0.91↔1.83 during a tween; `landE` true on a flat-beach pose, false on a hill/water seam.
- **Rig:** add `--walk` (mirrors `--tour`, `tools/rig.mjs:56`) + `carDio._enterWalk(x,z,yaw)`.
  `node tools/rig.mjs --port nassau --walk --still --out tmp/walk-nassau.png`, and `--port
  cartagena` (hilliest — exercises the cliff gate, hill-forest trunk collision, vertical clamp).
- **Manual:** open → tour → row to a gentle beach → `E` → walk streets/backyards (collision, surface
  pace, bob, hill climb) → face the canoe near it → `E` → back on the water. Confirm a cliff face
  refuses disembark and the player can't walk into the sea.
- **Suite stays green** — now **27** cases plus the new 28.

## 10. Risks & open questions
- **Circle-only over-block in the tightest street rows (Nassau)** — the one genuine open question.
  Decide with a single `--walk --still` screenshot; if the player is wedged between two generous
  circles in a real alley, promote to the baked 1-bit obstacle+surface bitmask (sampled exactly
  like `bake.sample` — the codebase's native pattern). Until then, circles.
- **Null-bake reachability** — `sampleH` makes walking correct on `heightAt`-only devices; the M1/
  1660 cert GPU has WebGL2 R32F so `bake` is non-null there. Low risk, handled.
- **Inland cliffs are climbable** — per the locked decision (whole island), the walker floats up
  even a steep inland face (crags are props, not obstacles). Accepted; the vertical clamp keeps it
  visually smooth. Add an optional per-step soft slope-block later if it reads badly.
- **Demo-critical watch:** walking into the sea (boundary, §4.5) and clipping house corners
  (conservative circles, §3.2) are the two things most likely to look broken — both are explicitly
  closed above; verify them first in the rig.

## Sequencing recap
1. **Data layer:** `sampleH`; `pushHouse` capture; `frame.project` streets; trees `trunks/nearTrunks`;
   `built.obstacles/streets`; `carDio._obstacles`. (No grid.)
2. **Walker rig:** `harborwalker.js` (interface + camera-seat), ground-follow + clamp + bob, circle
   collision + reject-fallback + step cap, boundary, `_enterWalk` dev hook.
3. **Disembark/embark:** height-gain gate, prompts, `E` keys, `enterWalk/exitWalk`, parked canoe +
   `canoe.float`, `tweenWalkCam` + `cancelWalkTween` (abort-safe).
4. **Wiring/polish:** guard sweep, state resets, `close()`/Esc walking branches, minimap glyph, pace
   tuning; bitmask only if circles over-block.
