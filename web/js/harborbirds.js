/* Carta Temporum — harborbirds module: a wheeling flock of gulls over the
   diorama harbour. The bird is a SCULPTED low-poly seagull built the way the
   classic game-asset gulls are: one continuous lofted body hull (bill→skull→
   neck→breast→tail) with deterministically jittered vertices and per-face flat
   shading, so the facets fall irregularly and catch the light one by one; wings
   with a true planform — narrow at the shoulder, broad at the wrist, swept to
   a point — a scalloped feather trailing edge, five separated primary fingers,
   grey above with BLACK tips carrying white mirror spots; a yellow hooked bill
   with the red gonys spot; a scalloped white fan tail; tucked feet.
   Everything is vertex-coloured on a single flat-shaded material.

   Wings are two-jointed (shoulder pivot + wrist pivot in userData.outer) and
   the flap code drives both with a lag — the gull's wrist-flick.

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
  // back by `scallop` — the feather tips along the edge.
  function sheet(cols, scallop, side) {
    const pos = [], idx = [];
    for (let i = 0; i < cols.length; i++) {
      const c = cols[i];
      const te = c.zTE + ((i % 2) ? (c.scallop != null ? c.scallop : scallop) : 0);
      const midZ = (c.zLE + te) / 2;
      pos.push(c.x, c.y, c.zLE,
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
    for (const t of [0, 0.55, 1]) {
      const ww = hw * (1 - t * 0.8);
      pos.push(x0 + dx * t, y0 + dy * t, z0 + dz * t - ww,
               x0 + dx * t, y0 + dy * t, z0 + dz * t + ww);
    }
    for (let i = 0; i < 2; i++) {
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
  function facet(geo, amp, painter) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i,
        x + (hsh(x * 3.1, y * 4.7, z * 2.3) - 0.5) * amp,
        y + (hsh(y * 5.3, z * 2.9, x * 3.7) - 0.5) * amp,
        z + (hsh(z * 4.1, x * 2.1, y * 5.9) - 0.5) * amp);
    }
    const g = geo.toNonIndexed();
    g.computeVertexNormals();
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

  /* ================= the seagull ================= */

  const WHITE = 0xf4f1e6, GREY = 0xb9bfc2, GREYD = 0x9aa2a6, BLACK = 0x1d1d1d;
  const BILL = 0xdfa52a, RED = 0xb53a28, FEET = 0xd98e2b;

  function buildProto() {
    const g = new THREE.Group();
    const mat = gullMat();

    /* ---- body: one continuous hull, bill base → skull → neck → breast → tail ---- */
    const bodyGeo = loft([
      { z: -1.95, y: 0.42, rx: 0.03, ry: 0.03 },
      { z: -1.82, y: 0.43, rx: 0.17, ry: 0.19 },
      { z: -1.6, y: 0.44, rx: 0.26, ry: 0.29 },   // skull
      { z: -1.32, y: 0.4, rx: 0.24, ry: 0.27 },
      { z: -1.05, y: 0.26, rx: 0.27, ry: 0.33 },  // neck flows down
      { z: -0.62, y: 0.08, rx: 0.4, ry: 0.5 },    // breast rises
      { z: -0.12, y: 0.0, rx: 0.5, ry: 0.6 },     // deepest
      { z: 0.42, y: 0.02, rx: 0.46, ry: 0.52 },
      { z: 0.95, y: 0.07, rx: 0.36, ry: 0.38 },   // belly tapers
      { z: 1.45, y: 0.13, rx: 0.22, ry: 0.22 },
      { z: 1.8, y: 0.16, rx: 0.12, ry: 0.12 },    // tail root
      { z: 2.05, y: 0.18, rx: 0.035, ry: 0.035 },
    ], 10);
    const body = new THREE.Mesh(facet(bodyGeo, 0.05, (x, y, z) =>
      (y > 0.33 && z > -0.55 && z < 1.35) ? GREY : WHITE), mat); // grey saddle on the back
    g.add(body);

    /* ---- bill: deep base, taper, hooked tip; yellow with the red gonys spot ---- */
    const billGeo = loft([
      { z: -1.86, y: 0.37, rx: 0.1, ry: 0.13 },
      { z: -2.1, y: 0.36, rx: 0.08, ry: 0.1 },
      { z: -2.3, y: 0.34, rx: 0.055, ry: 0.07 },
      { z: -2.46, y: 0.27, rx: 0.012, ry: 0.015 },  // tip hooks down
    ], 7);
    g.add(new THREE.Mesh(facet(billGeo, 0.012, (x, y, z) =>
      (z < -2.36 && y < 0.3) ? RED : BILL), mat));

    /* ---- eyes ---- */
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(
        facet(new THREE.SphereGeometry(0.05, 6, 5), 0, () => 0x141414), mat);
      eye.position.set(sx * 0.22, 0.5, -1.64);
      g.add(eye);
    }

    /* ---- tail: short white fan, scalloped rear edge ---- */
    const tailCols = [];
    for (let i = 0; i <= 6; i++) {
      const u = i / 6;                                // across the fan
      const x = (u - 0.5) * 1.05;
      const len = 0.75 - Math.abs(u - 0.5) * 0.35;    // centre feathers longest
      tailCols.push({ x, y: 0.16 - Math.abs(u - 0.5) * 0.06, zLE: 1.72, zTE: 1.72 + len, scallop: 0.12 });
    }
    g.add(new THREE.Mesh(facet(sheet(tailCols, 0.12, 1), 0.02, (x, y, z) =>
      z > 2.32 ? GREYD : WHITE), mat));

    /* ---- feet: tucked, yellow-orange ---- */
    for (const sx of [-1, 1]) {
      const foot = new THREE.Mesh(
        facet(new THREE.BoxGeometry(0.13, 0.05, 0.34), 0.015, () => FEET), mat);
      foot.position.set(sx * 0.17, -0.42, 0.85);
      foot.rotation.x = 0.22;
      g.add(foot);
    }

    /* ---- wings: arm (shoulder→wrist) + hand (wrist→tip) + primary fingers ---- */
    function makeWing(s) {
      const wing = new THREE.Group();                 // shoulder pivot
      wing.position.set(s * 0.34, 0.26, -0.5);

      // ARM: chord grows toward the wrist, scalloped secondaries on the TE
      const armCols = [];
      const ARM = 2.3;
      for (let i = 0; i <= 8; i++) {
        const u = i / 8;
        armCols.push({
          x: s * ARM * u,
          y: u * 0.12,                                // gentle dihedral
          zLE: -0.5 - u * 0.28,                       // leading edge eases forward
          zTE: 0.62 + u * 0.18,                       // chord ~1.1 → ~1.4
          scallop: 0.17,
          arch: 0.08,
        });
      }
      const arm = new THREE.Mesh(facet(sheet(armCols, 0.17, s), 0.035, (x) =>
        Math.abs(x) > ARM * 0.7 ? GREYD : GREY), gullMat());
      wing.add(arm);

      // HAND: hinged at the wrist; sweeps back, tapers, droops at the tip
      const elbow = new THREE.Group();
      elbow.position.set(s * ARM, 0.12, 0);
      const HAND = 2.4;
      const droop = (u) => -u * u * 0.16;             // gentle, not hanging
      const sweepLE = (u) => -0.78 + u * u * 0.85;
      const teAt = (u) => 0.8 - u * 1.6 + u * u * 1.07;   // chord 1.58 → ~0.2: a POINT, the fingers carry on
      const handCols = [];
      for (let i = 0; i <= 7; i++) {
        const u = i / 7;
        handCols.push({
          x: s * HAND * u, y: droop(u), zLE: sweepLE(u), zTE: teAt(u),
          scallop: 0.13, arch: 0.05,
        });
      }
      // solid black outer third with TWO crisp white mirror spots (as birdd)
      const spotZ = (u) => (sweepLE(u) + teAt(u)) / 2;
      const hand = new THREE.Mesh(facet(sheet(handCols, 0.13, s), 0.03, (x, y, z) => {
        const u = Math.abs(x) / HAND;
        if (u > 0.76) {                               // black only fringes the tip
          for (const su of [0.83, 0.94]) {
            if (Math.abs(u - su) < 0.045 && Math.abs(z - spotZ(su)) < 0.15) return 0xf2f2f2;
          }
          return BLACK;
        }
        return u > 0.42 ? GREYD : GREY;
      }), gullMat());
      elbow.add(hand);

      // five separated primary fingers, ROOTED on the hand's trailing edge and
      // continuing the spanwise line with a backward rake (birdd)
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const u = 0.7 + 0.075 * i;                    // root station along the hand
        const len = 1.2 - t * 0.5;
        const fin = new THREE.Mesh(facet(
          finger(s * HAND * u, droop(u) - 0.01, teAt(u) - 0.22,
                 s * len * (0.85 - t * 0.3), -len * 0.1, len * (0.3 + t * 0.55), 0.17, s),
          0.012, () => BLACK), gullMat());
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
    return g;
  }

  // re-grab per-clone wing refs (clones share geometry/materials)
  function rewire(b, proto) {
    const [ir, il] = proto.userData.wingIdx;
    b.userData.wingR = b.children[ir];
    b.userData.wingL = b.children[il];
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
    const proto = buildProto();
    const N = 26;
    const alt0 = radius * 0.07;
    // gulls drawn a touch out of scale (as the ships are) so they read at range
    const sizeMul = Math.max(2.2, radius * 0.0016);
    const birds = [];
    for (let i = 0; i < N; i++) {
      const b = rewire(proto.clone(true), proto);
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
        flapF: 3.2 + r02 * 2.0,                     // gentle, slow wingbeat
        scale: sizeMul * (0.8 + r01 * 0.5),
      });
      b.scale.setScalar(birds[i].scale);
    }

    const _t = new THREE.Vector3();
    function pathAt(bd, a) {
      const x = bd.cx + Math.cos(a) * bd.pr;
      const z = bd.cz + Math.sin(a) * bd.pr * (bd.fig8 ? Math.cos(a) : 1);
      const y = bd.alt + Math.sin(a * 2 + bd.phase) * radius * 0.012;
      return [x, y, z];
    }

    function update(t) {
      for (const bd of birds) {
        const a = t * bd.spd + bd.phase;
        const [x, y, z] = pathAt(bd, a);
        const [nx, ny, nz] = pathAt(bd, a + 0.04 * Math.sign(bd.spd || 1));
        bd.mesh.position.set(x, y, z);
        // lookAt points +Z at the target; the nose is −Z, so look at the
        // MIRROR of the next point — the beak leads, the tail trails
        _t.set(2 * x - nx, 2 * y - ny, 2 * z - nz);
        bd.mesh.lookAt(_t);
        bd.mesh.rotateZ(-Math.sign(bd.spd) * 0.32);  // bank into the turn
        const flap = Math.sin(t * bd.flapF + bd.phase) * 0.7;
        const lag = Math.sin(t * bd.flapF + bd.phase - 0.7) * 0.5;
        bd.mesh.userData.wingR.rotation.z = -flap;
        bd.mesh.userData.wingL.rotation.z = flap;
        bd.mesh.userData.wingR.userData.outer.rotation.z = -lag;
        bd.mesh.userData.wingL.userData.outer.rotation.z = lag;
      }
    }

    function dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }

    return { group, update, dispose };
  }

  // single gulls for re-use (the canoe's close companions); both names return
  // the same sculpted seagull — there is only one model
  function gull() { return buildProto(); }
  function heroGull() { return buildProto(); }

  return { build, gull, heroGull };
};
