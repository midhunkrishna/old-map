/* Carta Temporum — harborbirds module: a wheeling flock of gulls over the
   diorama harbour. The bird is a SCULPTED low-poly seagull built the way the
   classic game-asset gulls are: one continuous lofted body hull (bill→skull→
   neck→breast→tail) with deterministically jittered vertices and per-face flat
   shading, so the facets fall irregularly and catch the light one by one; wings
   with a true planform — narrow at the shoulder, broad at the wrist, swept to
   a point — a scalloped feather trailing edge, five separated primary fingers,
   grey above with BLACK tips carrying white mirror spots; a yellow hooked bill
   with the red gonys spot; a scalloped white fan tail; tucked feet.
   Everything is vertex-coloured; the body/head/tail stay on the flat-shaded
   material (faceted character) while the WING surfaces use a smooth-shaded
   twin with averaged normals and denser spanwise sampling, so the flapping
   silhouette doesn't read jagged from the canoe.

   Wings are two-jointed (shoulder pivot + wrist pivot in userData.outer) and
   the flap code drives both with a lag — the gull's wrist-flick — plus a
   washout twist of the hand on the downstroke. The head (skull/bill/eyes)
   rides a neck pivot (userData.head) that counter-rotates against bank and
   flap-bob: gaze stabilization. Adult and juvenile plumages share one skeleton.

   Authored nose toward −Z. NOTE Object3D.lookAt() points an object's +Z at
   the target, so the flight code looks at the MIRROR of the next path point —
   that puts the beak, not the tail, on the direction of travel.

   Consumed by harbordiorama.js; gated, like everything, at tier ≥ 3. */
'use strict';

window.cartaHarborBirds = function cartaHarborBirds(THREE) {

  /* ================= sculpting helpers ================= */

  function hsh(a, b, c) {
    const h = Math.sin(a * 127.1 + b * 311.7 + (c || 0) * 74.7) * 43758.5453;
    return h - Math.floor(h);
  }

  // Section-loft: stations = [{z, y, rx, ry}] rings of `around` points, capped
  // at both ends. Quads are split on alternating diagonals (by hash) so the
  // triangulation reads organic, not gridded.
  function loft(stations, around) {
    const pos = [], idx = [];
    for (let i = 0; i < stations.length; i++) {
      const st = stations[i];
      for (let j = 0; j < around; j++) {
        const phi = (j / around) * Math.PI * 2;
        pos.push(Math.sin(phi) * st.rx, st.y + Math.cos(phi) * st.ry, st.z);
      }
    }
    for (let i = 0; i < stations.length - 1; i++) {
      for (let j = 0; j < around; j++) {
        const a = i * around + j, b = i * around + (j + 1) % around;
        const c = a + around, d = b + around;
        if (hsh(i, j) > 0.5) idx.push(a, c, b, b, c, d);
        else idx.push(a, c, d, a, d, b);
      }
    }
    // end caps (fans to the station centres)
    const c0 = pos.length / 3;
    pos.push(0, stations[0].y, stations[0].z);
    for (let j = 0; j < around; j++) idx.push(c0, (j + 1) % around, j);
    const c1 = pos.length / 3;
    const last = stations[stations.length - 1], off = (stations.length - 1) * around;
    pos.push(0, last.y, last.z);
    for (let j = 0; j < around; j++) idx.push(c1, off + j, off + (j + 1) % around);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  // A wing/tail sheet from column samples: cols = [{x, zLE, zTE, y}], with a
  // cambered mid row. Trailing-edge SCALLOPS: odd columns push their TE point
  // back by `scallop` — the feather tips along the edge. Optional per-column
  // `leLift` raises the leading-edge row only: the forewing's aerofoil camber,
  // a crisper down-light/up-shadow break along the front of the wing.
  function sheet(cols, scallop, side) {
    const pos = [], idx = [];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const te = c.zTE + ((i % 2) ? (c.scallop != null ? c.scallop : scallop) : 0);
      const midZ = (c.zLE + te) / 2;
      pos.push(c.x, c.y + (c.leLift || 0), c.zLE,
               c.x, c.y + (c.arch || 0), midZ,
               c.x, c.y, te);
    }
    for (let i = 0; i < cols.length - 1; i++) {
      for (let r = 0; r < 2; r++) {
        const a = i * 3 + r, b = a + 1, c = a + 3, d = c + 1;
        const flip = hsh(i, r) > 0.5;
        if (side > 0) { if (flip) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b); }
        else { if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, d, c, a, b, d); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  // a single tapered feather "finger" quad strip
  function finger(x0, y0, z0, dx, dy, dz, w, side) {
    const pos = [], idx = [];
    const nx = side, hw = w / 2;
    for (const t of [0, 0.35, 0.7, 1]) {
      const ww = hw * (1 - t * 0.8);
      pos.push(x0 + dx * t, y0 + dy * t, z0 + dz * t - ww,
               x0 + dx * t, y0 + dy * t, z0 + dz * t + ww);
    }
    for (let i = 0; i < 3; i++) {
      const a = i * 2;
      if (nx > 0) idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      else idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  // The low-poly-art treatment: jitter shared vertices (no cracks — done while
  // indexed), explode to per-face vertices, flat normals, then paint each FACE
  // a single colour from the painter + a touch of per-facet value variation.
  // opts.smooth: compute AVERAGED normals while still indexed and carry them
  // through toNonIndexed — per-face colour stays, but shading is smooth (used
  // on the wings, with the smooth material, so edges stop reading jagged in
  // motion while the body keeps its faceted character).
  // opts.ampAt(i): per-vertex jitter scale (calms wing edge loops).
  function facet(geo, amp, painter, opts) {
    const smooth = !!(opts && opts.smooth);
    const ampAt = opts && opts.ampAt;
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const a = ampAt ? amp * ampAt(i) : amp;
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i,
        x + (hsh(x * 3.1, y * 4.7, z * 2.3) - 0.5) * a,
        y + (hsh(y * 5.3, z * 2.9, x * 3.7) - 0.5) * a,
        z + (hsh(z * 4.1, x * 2.1, y * 5.9) - 0.5) * a);
    }
    if (smooth) geo.computeVertexNormals();   // averaged across shared verts
    const g = geo.toNonIndexed();             // attributes (incl. normals) carry over
    if (!smooth) g.computeVertexNormals();    // flat per-face normals
    const q = g.attributes.position;
    const col = new Float32Array(q.count * 3);
    const c = new THREE.Color();
    for (let f = 0; f < q.count; f += 3) {
      const cx = (q.getX(f) + q.getX(f + 1) + q.getX(f + 2)) / 3;
      const cy = (q.getY(f) + q.getY(f + 1) + q.getY(f + 2)) / 3;
      const cz = (q.getZ(f) + q.getZ(f + 1) + q.getZ(f + 2)) / 3;
      c.set(painter(cx, cy, cz, f / 3));
      const v = 0.94 + hsh(f, cx, cz) * 0.12;        // facet-to-facet variation
      col[f * 3] = c.r * v; col[f * 3 + 1] = c.g * v; col[f * 3 + 2] = c.b * v;
      col[f * 3 + 3] = c.r * v; col[f * 3 + 4] = c.g * v; col[f * 3 + 5] = c.b * v;
      col[f * 3 + 6] = c.r * v; col[f * 3 + 7] = c.g * v; col[f * 3 + 8] = c.b * v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.dispose();
    return g;
  }

  let _mat = null;
  function gullMat() {
    if (!_mat) {
      _mat = new THREE.MeshLambertMaterial({
        vertexColors: true, flatShading: true, side: THREE.DoubleSide,
      });
    }
    return _mat;
  }

  // smooth-shaded twin for the wing surfaces (flatShading ignores vertex
  // normals, so the wings need their own material to use the averaged ones)
  let _matS = null;
  function gullMatSmooth() {
    if (!_matS) {
      _matS = new THREE.MeshLambertMaterial({
        vertexColors: true, flatShading: false, side: THREE.DoubleSide,
      });
    }
    return _matS;
  }

  /* ================= the seagull ================= */

  const WHITE = 0xf4f1e6, GREY = 0xb9bfc2, GREYD = 0x9aa2a6, BLACK = 0x1d1d1d;
  const BILL = 0xdfa52a, RED = 0xb53a28, FEET = 0xd98e2b;

  // `hero` raises the body loft ring count for the canoe's close-range gulls
  // (the flock keeps the cheaper hull; wings are shared and already smooth)
  function buildProto(juv, hero) {
    const g = new THREE.Group();
    const mat = gullMat();

    // adult vs juvenile (first-winter) plumage: juveniles wear brown-mottled
    // grey-buff above, dusky white below, an all-dark bill and a dark tail band
    const cW = juv ? 0xe6dec9 : WHITE, cG = juv ? 0xb09a78 : GREY,
          cGD = juv ? 0x8d7a60 : GREYD, cBK = juv ? 0x2e241c : BLACK,
          cBill = juv ? 0x4a3a2a : BILL, cSpot = juv ? 0x4a3a2a : RED,
          cBand = juv ? 0x5a4734 : GREYD, cMirror = juv ? 0x2e241c : 0xf2f2f2;
    const fleck = (base, f, x, z) =>
      (juv && hsh(f * 0.37, x * 1.7, z * 2.3) > 0.74) ? 0x7d6648 : base;

    /* ---- body: one continuous hull, neck collar → breast → tail ---- */
    const around = hero ? 16 : 12;
    const bodyGeo = loft([
      { z: -1.18, y: 0.33, rx: 0.23, ry: 0.29 },  // neck collar (the head plugs in)
      { z: -1.05, y: 0.26, rx: 0.27, ry: 0.33 },  // neck flows down
      { z: -0.62, y: 0.08, rx: 0.4, ry: 0.5 },    // breast rises
      { z: -0.12, y: 0.0, rx: 0.5, ry: 0.6 },     // deepest
      { z: 0.42, y: 0.02, rx: 0.46, ry: 0.52 },
      { z: 0.95, y: 0.07, rx: 0.36, ry: 0.38 },   // belly tapers
      { z: 1.45, y: 0.13, rx: 0.22, ry: 0.22 },
      { z: 1.8, y: 0.16, rx: 0.12, ry: 0.12 },    // tail root
      { z: 2.05, y: 0.18, rx: 0.035, ry: 0.035 },
    ], around);
    // jitter is calmed on the shoulder stations (1–3 span the wing root) so
    // the faceted hull doesn't pop against the smooth-shaded wing roots
    const body = new THREE.Mesh(facet(bodyGeo, 0.05, (x, y, z, f) =>
      fleck((y > 0.33 && z > -0.55 && z < 1.35) ? cG : cW, f, x, z), {
        ampAt: (i) => { const st = (i / around) | 0; return (st >= 1 && st <= 3) ? 0.45 : 1; },
      }), mat); // grey saddle
    g.add(body);

    // smooth shoulder fairings: a small lens over each wing-root seam, smooth
    // shaded like the wings, so the junction blends where smooth shading
    // meets the faceted torso instead of popping along the seam
    for (const sx of [-1, 1]) {
      const fair = new THREE.Mesh(facet(new THREE.SphereGeometry(1, 7, 5), 0,
        (x, y, z, f) => fleck(cG, f, x, z), { smooth: true }), gullMatSmooth());
      fair.scale.set(0.13, 0.10, 0.55);
      fair.position.set(sx * 0.40, 0.28, -0.45);
      g.add(fair);
    }

    /* ---- head: skull + bill + eyes on a NECK PIVOT so the flight code can
            counter-rotate it — a real gull's head holds level while the body
            banks and bobs (gaze stabilization). The rearmost station is a plug
            that hides inside the body's neck collar, so the small stabilizing
            rotations never open a seam. ---- */
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.36, -1.12);
    const headGeo = loft([
      { z: -1.95, y: 0.42, rx: 0.03, ry: 0.03 },
      { z: -1.82, y: 0.43, rx: 0.17, ry: 0.19 },
      { z: -1.6, y: 0.44, rx: 0.26, ry: 0.29 },   // skull
      { z: -1.32, y: 0.4, rx: 0.24, ry: 0.27 },
      { z: -1.04, y: 0.3, rx: 0.19, ry: 0.24 },   // neck plug, hidden in the collar
    ], hero ? 12 : 10);                           // hero skull a touch rounder up close
    const headMesh = new THREE.Mesh(facet(headGeo, 0.04, (x, y, z, f) =>
      fleck(cW, f, x, z)), mat);
    headMesh.position.set(0, -0.36, 1.12);        // geometry is in body space
    headPivot.add(headMesh);

    /* ---- bill: deep base, taper, hooked tip; yellow with the red gonys spot ---- */
    const billGeo = loft([
      { z: -1.86, y: 0.37, rx: 0.1, ry: 0.13 },
      { z: -2.1, y: 0.36, rx: 0.08, ry: 0.1 },
      { z: -2.3, y: 0.34, rx: 0.055, ry: 0.07 },
      { z: -2.46, y: 0.27, rx: 0.012, ry: 0.015 },  // tip hooks down
    ], 7);
    const bill = new THREE.Mesh(facet(billGeo, 0.012, (x, y, z) =>
      (z < -2.36 && y < 0.3) ? cSpot : cBill), mat);
    bill.position.set(0, -0.36, 1.12);
    headPivot.add(bill);

    /* ---- eyes ---- */
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(
        facet(new THREE.SphereGeometry(0.05, 6, 5), 0, () => 0x141414), mat);
      eye.position.set(sx * 0.22, 0.14, -0.52);   // head-pivot space
      headPivot.add(eye);
    }
    g.add(headPivot);
    g.userData.head = headPivot;

    /* ---- tail: short white fan, scalloped rear edge ---- */
    const tailCols = [];
    for (let i = 0; i <= 10; i++) {
      const u = i / 10;                               // across the fan
      const x = (u - 0.5) * 1.05;
      const len = 0.75 - Math.abs(u - 0.5) * 0.35;    // centre feathers longest
      tailCols.push({ x, y: 0.16 - Math.abs(u - 0.5) * 0.06, zLE: 1.72, zTE: 1.72 + len, scallop: 0.09 });
    }
    // tail lives on its own pivot at the root so the flight code can pitch it
    // down (spread for lift in slow flight) and twist it into turns
    const tailPivot = new THREE.Group();
    tailPivot.position.set(0, 0.16, 1.72);
    // the fan pivots constantly, so at hero range it gets the wings' treatment:
    // denser columns, softened scallops, smooth normals, calmed edge-row jitter
    // (the torso keeps its faceted character)
    const tailMesh = new THREE.Mesh(facet(sheet(tailCols, 0.09, 1), 0.02, (x, y, z) =>
      z > 2.32 ? cBand : cW,
      { smooth: true, ampAt: (i) => (i % 3 === 1 ? 1 : 0.35) }), gullMatSmooth());
    tailMesh.position.set(0, -0.16, -1.72);     // geometry is in body space; offset back onto the pivot
    tailPivot.add(tailMesh);
    g.add(tailPivot);
    g.userData.tail = tailPivot;

    /* ---- feet: tucked, yellow-orange; refs kept so the close-range flight
            code can drop them through a landing flare (base pose x=0.22) ---- */
    const feet = [];
    for (const sx of [-1, 1]) {
      const foot = new THREE.Mesh(
        facet(new THREE.BoxGeometry(0.13, 0.05, 0.34), 0.015, () => FEET), mat);
      foot.position.set(sx * 0.17, -0.42, 0.85);
      foot.rotation.x = 0.22;
      g.add(foot);
      feet.push(foot);
    }
    g.userData.feet = feet;

    /* ---- wings: arm (shoulder→wrist) + hand (wrist→tip) + primary fingers ---- */
    function makeWing(s) {
      const wing = new THREE.Group();                 // shoulder pivot
      wing.position.set(s * 0.34, 0.26, -0.5);

      // wing sheets are SMOOTH-shaded (averaged normals) with calmed jitter on
      // the LE/TE edge rows — the silhouette stays sculpted, the shading and
      // edges stop reading jagged in motion. Sheet verts come 3 per column
      // (LE, mid, TE), so i%3===1 is the interior row.
      const wingOpts = { smooth: true, ampAt: (i) => (i % 3 === 1 ? 1 : 0.35) };

      // ARM: chord grows toward the wrist, scalloped secondaries on the TE
      const armCols = [];
      const ARM = 2.3;
      for (let i = 0; i <= 15; i++) {
        const u = i / 15;
        armCols.push({
          x: s * ARM * u,
          y: u * 0.14,                                // gentle dihedral
          zLE: -0.5 - u * 0.28,                       // leading edge eases forward
          zTE: 0.62 + u * 0.18,                       // chord ~1.1 → ~1.4
          scallop: 0.10,
          arch: 0.08,
          leLift: 0.06,                               // forewing leading-edge camber
        });
      }
      const arm = new THREE.Mesh(facet(sheet(armCols, 0.10, s), 0.035, (x, y, z, f) =>
        fleck(Math.abs(x) > ARM * 0.7 ? cGD : cG, f, x, z), wingOpts), gullMatSmooth());
      wing.add(arm);

      // HAND: hinged at the wrist; sweeps back, tapers, droops at the tip
      const elbow = new THREE.Group();
      elbow.position.set(s * ARM, 0.12, 0);
      const HAND = 2.4;
      const droop = (u) => -u * u * 0.16;             // gentle, not hanging
      const sweepLE = (u) => -0.78 + u * u * 0.85;
      const teAt = (u) => 0.8 - u * 1.72 + u * u * 1.06;  // chord 1.58 → ~0.07: a sharp POINT, the fingers carry on
      const handCols = [];
      for (let i = 0; i <= 13; i++) {
        const u = i / 13;
        // elliptical tip rounding: the last columns pull LE/TE toward the
        // chord centre so the point reads rounded, not a spike
        const lez = sweepLE(u), tez = teAt(u), mid = (lez + tez) / 2;
        const tr = u > 0.9
          ? Math.max(0.3, Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.9) / 0.1, 2)))) : 1;
        handCols.push({
          x: s * HAND * u, y: droop(u),
          zLE: mid + (lez - mid) * tr, zTE: mid + (tez - mid) * tr,
          scallop: 0.07 * (1 - u * 0.4),              // scallops soften toward the tip
          arch: 0.05,
          leLift: 0.05 * (1 - u),                     // camber fades to a knife tip
        });
      }
      // solid black outer third with TWO crisp white mirror spots (as birdd)
      const spotZ = (u) => (sweepLE(u) + teAt(u)) / 2;
      const hand = new THREE.Mesh(facet(sheet(handCols, 0.07, s), 0.03, (x, y, z, f) => {
        const u = Math.abs(x) / HAND;
        if (u > 0.76) {                               // black only fringes the tip
          for (const su of [0.83, 0.94]) {
            if (Math.abs(u - su) < 0.045 && Math.abs(z - spotZ(su)) < 0.15) return cMirror;
          }
          return cBK;
        }
        return fleck(u > 0.42 ? cGD : cG, f, x, z);
      }, wingOpts), gullMatSmooth());
      elbow.add(hand);

      // five separated primary fingers, ROOTED on the hand's trailing edge and
      // continuing the spanwise line with a backward rake (birdd)
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const u = 0.7 + 0.075 * i;                    // root station along the hand
        const len = 1.2 - t * 0.5;
        const fin = new THREE.Mesh(facet(
          finger(s * HAND * u, droop(u) - 0.01, teAt(u) - 0.22,
                 s * len * (0.85 - t * 0.3), -len * 0.1, len * (0.3 + t * 0.55), 0.14, s),
          0.008, () => cBK, { smooth: true }), gullMatSmooth());
        elbow.add(fin);
      }

      wing.add(elbow);
      wing.userData.outer = elbow;
      return wing;
    }
    const wingR = makeWing(1), wingL = makeWing(-1);
    g.add(wingR, wingL);
    g.userData.wingR = wingR;
    g.userData.wingL = wingL;
    g.userData.wingIdx = [g.children.indexOf(wingR), g.children.indexOf(wingL)];
    g.userData.tailIdx = g.children.indexOf(g.userData.tail);
    g.userData.headIdx = g.children.indexOf(g.userData.head);
    return g;
  }

  // re-grab per-clone wing refs (clones share geometry/materials)
  function rewire(b, proto) {
    const [ir, il] = proto.userData.wingIdx;
    b.userData.wingR = b.children[ir];
    b.userData.wingL = b.children[il];
    b.userData.tail = b.children[proto.userData.tailIdx];
    b.userData.head = b.children[proto.userData.headIdx];
    // the wrist pivot rides as the wing group's last child
    b.userData.wingR.userData.outer = b.userData.wingR.children[b.userData.wingR.children.length - 1];
    b.userData.wingL.userData.outer = b.userData.wingL.children[b.userData.wingL.children.length - 1];
    return b;
  }

  /* ================= the flock ================= */
  // build(radius) → { group, update(t, focus), dispose }
  // (every bird is the full seagull; `focus` is accepted for API compatibility)
  function build(radius) {
    const group = new THREE.Group();
    const proto = buildProto(false);
    const protoJuv = buildProto(true);   // same skeleton/indices, brown plumage
    const N = 26;
    const alt0 = radius * 0.07;
    // gulls drawn a touch out of scale (as the ships are) so they read at range
    const sizeMul = Math.max(2.2, radius * 0.0016);
    const birds = [];
    for (let i = 0; i < N; i++) {
      const juv = (i % 5) === 4;                    // ~1 in 5 is a brown first-winter bird
      const b = rewire((juv ? protoJuv : proto).clone(true), proto);
      group.add(b);
      const r01 = (i * 2654435761 % 1000) / 1000;   // cheap deterministic spread
      const r02 = (i * 40503 % 997) / 997;
      birds.push({
        mesh: b,
        cx: (r01 - 0.5) * radius * 0.5,             // path centre, near the harbour
        cz: (r02 - 0.5) * radius * 0.5,
        pr: radius * (0.22 + r01 * 0.5),            // path radius
        alt: alt0 + r02 * radius * 0.11,
        spd: (0.09 + r02 * 0.11) * (i % 2 ? 1 : -1), // direction & speed
        fig8: r01 > 0.6,                            // some fly figure-eights
        phase: r01 * Math.PI * 2,
        flapF: 2.6 + r02 * 1.6,                     // ~3 Hz wingbeat, gull-like
        driftF: 0.03 + r01 * 0.04,                  // slow wander so paths aren't fixed loops
        scale: sizeMul * (0.8 + r01 * 0.5) * (juv ? 0.93 : 1),
        soar: 0,                                    // eased 0..1 updraft-soaring state
        lift: 0,                                    // metres gained riding the slope lift
      });
      b.scale.setScalar(birds[i].scale);
    }

    const _t = new THREE.Vector3();
    // path centre & radius wander slowly with t so the flock doesn't read as
    // fixed circles; altitude carries a slow climb/descend used to gate glides
    function pathAt(bd, a, t) {
      const pr = bd.pr * (0.84 + 0.32 * (0.5 + 0.5 * Math.sin(t * bd.driftF + bd.phase * 1.7)));
      const cx = bd.cx + Math.sin(t * bd.driftF + bd.phase) * radius * 0.045;
      const cz = bd.cz + Math.cos(t * bd.driftF * 0.8 + bd.phase) * radius * 0.045;
      const x = cx + Math.cos(a) * pr;
      const z = cz + Math.sin(a) * pr * (bd.fig8 ? Math.cos(a) : 1);
      const y = bd.alt
        + Math.sin(a * 2 + bd.phase) * radius * 0.012
        + Math.sin(t * 0.08 + bd.phase) * radius * 0.03;   // slow climb/descend
      return [x, y, z];
    }

    let lastT = -1;
    function update(t, focus) {
      const dt = lastT < 0 ? 0.016 : Math.min(0.1, Math.max(0.0001, t - lastT));
      lastT = t;
      for (const bd of birds) {
        const s = Math.sign(bd.spd) || 1;
        const a = t * bd.spd + bd.phase;
        const [x, y, z] = pathAt(bd, a, t);
        const [nx, ny, nz] = pathAt(bd, a + 0.04 * s, t);
        // shoreline updraft: out over the rim, where the hills meet the water,
        // a bird occasionally sets its wings and SOARS — riding the slope lift
        // slowly upward along the shore — then sinks back once past it
        const sGate = (x * x + z * z > radius * radius * 0.25 &&
                       Math.sin(t * 0.05 + bd.phase * 2.7) > 0.5) ? 1 : 0;
        bd.soar += (sGate - bd.soar) * Math.min(1, dt * 0.7);
        bd.lift = sGate ? Math.min(radius * 0.05, bd.lift + dt * radius * 0.007)
                        : Math.max(0, bd.lift - dt * radius * 0.005);
        bd.mesh.position.set(x, y + bd.lift, z);
        // cheap LOD: past ~250 m of the tour camera the head/tail pivots are
        // sub-pixel — skip their updates (the wingbeat still runs) to pay back
        // the cost of the added articulation. focus=null means no LOD.
        const near = !focus ||
          ((x - focus.x) * (x - focus.x) + (y - focus.y) * (y - focus.y)
           + (z - focus.z) * (z - focus.z)) < 62500;
        // lookAt points +Z at the target; the nose is −Z, so look at the
        // MIRROR of the next point — the beak leads, the tail trails
        _t.set(2 * x - nx, 2 * y - ny + bd.lift, 2 * z - nz);
        bd.mesh.lookAt(_t);

        // flap↔glide gate: glide while descending (slow-y term falling), flap while
        // climbing. tanh on the derivative of the slow climb term gives a smooth 0..1.
        // A soaring bird holds set wings regardless — the updraft does the work.
        const glide = Math.max(bd.soar,
          0.5 - 0.5 * Math.tanh(Math.cos(t * 0.08 + bd.phase) * 2.0));

        // wingbeat: fast power downstroke, slower upstroke (skewed sine)
        const ph = t * bd.flapF + bd.phase;
        let fc = Math.sin(ph);
        fc = fc >= 0 ? Math.pow(fc, 0.65) : -Math.pow(-fc, 1.5);
        const amp = 0.8 * (1 - 0.85 * glide);              // wings nearly still in a glide
        const dihedral = 0.10 + 0.45 * glide;              // inner wing raised into a V
        const inner = dihedral + fc * amp;
        bd.mesh.userData.wingR.rotation.z = -inner;
        bd.mesh.userData.wingL.rotation.z = inner;
        // wrist lags the shoulder (the flick); in a glide the tip droops to a
        // negative dihedral, as a real gull trims its hand. Wing-load bend:
        // the lag deepens through a full flap (the outer wing rotates later
        // on the loaded downstroke) and flattens back out in a glide.
        let lc = Math.sin(ph - (0.7 + 0.45 * (1 - glide)));
        lc = lc >= 0 ? Math.pow(lc, 0.65) : -Math.pow(-lc, 1.5);
        const outer = lc * amp * (0.7 + 0.12 * (1 - glide)) - 0.31 * glide;
        bd.mesh.userData.wingR.userData.outer.rotation.z = -outer;
        bd.mesh.userData.wingL.userData.outer.rotation.z = outer;
        // wingtip washout: the hand twists nose-down through the power
        // downstroke (cos<0 on the downstroke), washing out the tip
        const wash = 0.16 * Math.cos(ph) * (1 - glide);
        bd.mesh.userData.wingR.userData.outer.rotation.x = wash;
        bd.mesh.userData.wingL.userData.outer.rotation.x = wash;

        // bank into the turn (varying), subtle flap-driven body pitch
        const bank = -s * (0.30 + 0.12 * Math.sin(t * 0.5 + bd.phase));
        bd.mesh.rotateZ(bank);
        bd.mesh.rotateX(0.05 * fc * (1 - glide));
        if (near) {
          // tail spreads/pitches down in the slow glide and twists into the turn
          const tail = bd.mesh.userData.tail;
          if (tail) {
            tail.rotation.x = 0.10 + 0.22 * glide;
            tail.rotation.z = bank * 0.5;
          }
          // head stabilization: the head counter-rotates to hold level while the
          // body banks and the flap pitches it — the gull's steady-gaze trick
          const head = bd.mesh.userData.head;
          if (head) {
            head.rotation.z = -bank * 0.7;
            head.rotation.x = -0.05 * fc * (1 - glide);
          }
        }
      }
    }

    function dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }

    return { group, update, dispose };
  }

  // single gulls for re-use (the canoe's close companions); both names return
  // the same sculpted seagull — pass truthy `juv` for the brown first-winter
  // plumage variant (optional; existing callers unaffected)
  // hero quality: denser body loft for close range (wings are shared)
  function gull(juv) { return buildProto(!!juv, true); }
  function heroGull(juv) { return buildProto(!!juv, true); }

  return { build, gull, heroGull };
};
