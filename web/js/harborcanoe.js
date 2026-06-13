/* Carta Temporum — harborcanoe module: the first-person "Tour the harbour" mode.
   Drops the viewer into a bespoke, real-scale canoe afloat beside the harbour and
   lets them paddle around in first person with free look. The host
   (harbordiorama.js) owns pointer lock and the look angles (yaw/pitch from the
   mouse) and the row input (left mouse); this module owns the boat itself: the
   rig, the inertial boat physics, the ported swell that floats it, the seated
   camera, and the close-range eye-candy (wake, fish, floaters, low gulls).

   Built lazily on first enterTour(); gated, like the rest of the diorama, at
   gfx tier ≥ 3. Shares the diorama's { project, heightAt } metric frame.

   build(frame, opts) → { group, spawn(), update(dt, t, input, camera), dispose() }
     frame = { project, heightAt, centroid, radius }   (from harbordiorama)
     opts  = { seaLevel, sunDir, spawnXZ }
     input = { camYaw, camPitch, rowing, reverse, cruise } (from the host each frame;
               cruise = stepped target speed in m/s, 0..8.94 ≈ 20 mph)            */
'use strict';

window.cartaHarborCanoe = function cartaHarborCanoe(THREE) {

  /* ---- swell, ported verbatim from harborterrain.js makeWater() so the canoe
          floats in phase with the visible water sheet (same trains/uAmp/uMean). */
  const UAMP = 0.34, UMEAN = -0.42;
  const TRAINS = [[58, 20, 1.1, 0.55], [27, 110, 1.9, 0.30], [13, 65, 3.1, 0.15]].map(
    ([lam, dir, om, w]) => ({
      kx: Math.cos(dir * Math.PI / 180) * 2 * Math.PI / lam,
      kz: Math.sin(dir * Math.PI / 180) * 2 * Math.PI / lam,
      om, w,
    }));

  // Dominant swell train: with phase = k·x + ωt the waves travel along −k̂.
  // A floating gull weathervanes bow-on INTO the swell (facing +k̂) and drifts
  // slowly down-wave; the heading the bow convention (−sinθ,−cosθ) needs:
  const _k0 = Math.hypot(TRAINS[0].kx, TRAINS[0].kz);
  const SWELL_DX = -TRAINS[0].kx / _k0, SWELL_DZ = -TRAINS[0].kz / _k0; // wave travel dir
  const SWELL_HDG = Math.atan2(SWELL_DX, SWELL_DZ);  // bow = −travel = into the swell

  // height + (un-normalised) surface tilt at a world point, in phase with uTime=t.
  // (build() prefers opts.waterAt — the terrain's own — so there is one source.)
  function swell(x, z, t) {
    let h = 0, dx = 0, dz = 0;
    for (const k of TRAINS) {
      const ph = x * k.kx + z * k.kz + t * k.om;
      h += Math.sin(ph) * k.w;
      dx += Math.cos(ph) * k.w * k.kx;
      dz += Math.cos(ph) * k.w * k.kz;
    }
    return { y: UMEAN + UAMP * (h - 1.05), nx: -dx * UAMP, nz: -dz * UAMP };
  }

  /* ---------- the bespoke canoe rig (bow toward −Z, ~6 m × 1.6 m × 0.6 m) ---------- */

  const LEN = 6.0, BEAM = 0.82, DEPTH = 0.62;   // half-length along z is LEN/2
  const FLOOR_Y = -0.12;                         // dry floorboard, well above the waterline

  // a parametric U-hull surface: stations along the keel (z), a U cross-section at
  // each (port gunwale → keel → starboard gunwale). DoubleSide so the interior
  // bilge reads when you look down. Returns the BufferGeometry + the edge rings we
  // reuse for the gunwale rails and ribs.
  function hullGeometry() {
    const nZ = 26, nU = 11;
    const halfL = LEN / 2;
    const verts = [], idx = [];
    const portEdge = [], starEdge = [];
    const stations = [];                     // cross-section point rows, for ribs
    const meta = [];                         // { z, halfBeam, depth } per station, for the floor
    for (let i = 0; i < nZ; i++) {
      const tz = i / (nZ - 1);
      const z = -halfL + tz * LEN;
      // sharp-ish ends: beam & depth taper to ~0 at bow/stern
      const taper = Math.pow(Math.sin(Math.PI * tz), 0.62);
      const halfBeam = BEAM * taper;
      const depth = DEPTH * (0.34 + 0.66 * taper);
      meta.push({ z, halfBeam, depth });
      const row = [];
      for (let j = 0; j < nU; j++) {
        const phi = -Math.PI / 2 + Math.PI * (j / (nU - 1));
        const x = halfBeam * Math.sin(phi);
        const y = -depth * Math.cos(phi);    // gunwale (y≈0) down to keel (y≈−depth)
        const v = [x, y, z];
        verts.push(x, y, z);
        row.push(v);
        if (j === 0) portEdge.push(v);
        if (j === nU - 1) starEdge.push(v);
      }
      stations.push(row);
    }
    for (let i = 0; i < nZ - 1; i++) {
      for (let j = 0; j < nU - 1; j++) {
        const a = i * nU + j, b = a + 1, c = a + nU, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { geo: g, portEdge, starEdge, stations, meta };
  }

  // A continuous, opaque floorboard sealing the hull interior at local y=floorY.
  // Because floorY sits ABOVE the local waterline (the boat rides with DRAFT),
  // this panel occludes the sea sheet that passes through the hull from above —
  // so the interior reads as dry planks, never water. Half-width at each station
  // is where the U-section crosses floorY: cosφ=−floorY/depth, halfW=halfBeam·sinφ.
  function floorGeometry(meta, floorY) {
    const verts = [], idx = [];
    const rows = [];
    for (const m of meta) {
      let hw = 0;
      if (m.depth > -floorY + 0.02) {
        const c = -floorY / m.depth;                 // cosφ ∈ (0,1)
        hw = m.halfBeam * Math.sqrt(Math.max(0, 1 - c * c)) * 0.97;
      }
      rows.push(hw);
      verts.push(-hw, floorY, m.z, hw, floorY, m.z);
    }
    for (let i = 0; i < meta.length - 1; i++) {
      if (rows[i] <= 0.001 && rows[i + 1] <= 0.001) continue;
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // The dry-hull guarantee: an invisible depth mask spanning the WHOLE hull
  // opening (full half-beam at every station, not the floorboard's inset strip).
  // It writes depth only (colorWrite:false) after the opaque pass has drawn the
  // interior, and before the transparent water sheets render — so every water
  // fragment inside the hull volume fails the depth test, from any angle. The
  // visible floorboard handles the look; this handles the physics of occlusion
  // (the floorboard alone tapers out near bow/stern and let the sea peek
  // through the end wedges at glancing angles).
  function lidGeometry(meta, lidY) {
    const verts = [], idx = [];
    for (const m of meta) {
      const hw = m.halfBeam;                      // right out to the gunwale
      verts.push(-hw, lidY, m.z, hw, lidY, m.z);
    }
    for (let i = 0; i < meta.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // a tube swept through a list of [x,y,z] points (for rails & ribs)
  function tube(points, radius, mat) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
    const geo = new THREE.TubeGeometry(curve, Math.max(8, points.length * 2), radius, 6, false);
    return new THREE.Mesh(geo, mat);
  }

  function buildRig() {
    const rig = new THREE.Group();
    const woodOut = new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.82, metalness: 0.0, side: THREE.DoubleSide });
    const woodIn = new THREE.MeshStandardMaterial({ color: 0x9c7748, roughness: 0.78, metalness: 0.0 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x553921, roughness: 0.85 });
    const rail = new THREE.MeshStandardMaterial({ color: 0x7a5733, roughness: 0.7 });

    const H = hullGeometry();
    const hull = new THREE.Mesh(H.geo, woodOut);
    hull.castShadow = true; hull.receiveShadow = true;
    rig.add(hull);

    // a continuous, opaque floorboard sealing the interior just above the
    // waterline — this occludes the sea sheet from inside, so the bilge reads as
    // dry planks (never water), and it is what you see when you look down.
    const plankMat = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.82, side: THREE.DoubleSide });
    const floor = new THREE.Mesh(floorGeometry(H.meta, FLOOR_Y), plankMat);
    floor.receiveShadow = true;
    rig.add(floor);
    // the invisible depth lid over the whole opening: water never renders inside
    // the hull, whatever the viewing angle (see lidGeometry above)
    const lid = new THREE.Mesh(lidGeometry(H.meta, -0.03),
      new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide }));
    lid.renderOrder = 0.5;            // after the opaque interior, before the water
    rig.add(lid);
    // fore/aft plank seams laid on top of the floorboard for grain
    const seamMat = new THREE.MeshStandardMaterial({ color: 0x5f4527, roughness: 0.85 });
    for (let p = -2; p <= 2; p++) {
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, LEN * 0.7), seamMat);
      seam.position.set(p * 0.16, FLOOR_Y + 0.012, 0.1);
      rig.add(seam);
    }
    // ribs: curved tubes following the cross-section at a few stations (frames
    // that rise from the floorboard up the inner hull)
    const ribStations = [4, 9, 13, 17, 22];
    for (const si of ribStations) {
      const r = tube(H.stations[si], 0.028, dark);
      r.receiveShadow = true;
      rig.add(r);
    }
    // gunwale rails along both top edges
    rig.add(tube(H.portEdge, 0.045, rail), tube(H.starEdge, 0.045, rail));

    // thwarts (cross seats) + the viewer's seat
    for (const z of [-1.4, -0.2, 1.0]) {
      const tw = new THREE.Mesh(new THREE.BoxGeometry(BEAM * 1.9, 0.05, 0.16), woodIn);
      tw.position.set(0, -0.04, z);
      tw.castShadow = true;
      rig.add(tw);
    }
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.34), woodIn);
    seat.position.set(0, -0.05, 1.35);
    seat.castShadow = true;
    rig.add(seat);

    // ----- period props (resting on the floorboard) -----
    // coiled rope (a flattened torus) up by the bow
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 8, 18), new THREE.MeshStandardMaterial({ color: 0xb8a06a, roughness: 0.95 }));
    rope.rotation.x = Math.PI / 2; rope.scale.y = 0.5;
    rope.position.set(0.15, FLOOR_Y + 0.05, -1.9);
    rig.add(rope);
    // a fishing net / basket amidships
    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.16, 0.26, 12, 1, true), new THREE.MeshStandardMaterial({ color: 0x7c6038, roughness: 0.95, side: THREE.DoubleSide }));
    basket.position.set(-0.18, FLOOR_Y + 0.13, -0.6);
    rig.add(basket);
    // a clay jug
    const jug = new THREE.Group();
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), new THREE.MeshStandardMaterial({ color: 0xa6663a, roughness: 0.9 }));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.12, 10), belly.material);
    neck.position.y = 0.13;
    jug.add(belly, neck);
    jug.position.set(0.2, FLOOR_Y + 0.13, 0.5);
    rig.add(jug);

    // a small lantern — emissive so it picks up the bloom under Studio light
    const lantern = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.12), new THREE.MeshStandardMaterial({ color: 0xffcf7a, emissive: 0xffb347, emissiveIntensity: 1.6, roughness: 0.4 }));
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.07, 4), rail);
    cap.position.y = 0.12; cap.rotation.y = Math.PI / 4;
    lantern.add(glass, cap);
    lantern.position.set(-0.12, FLOOR_Y + 0.16, -1.55);
    rig.add(lantern);
    const lanternLight = new THREE.PointLight(0xffb347, 0.6, 4.0, 2.0);
    lanternLight.position.copy(lantern.position);
    rig.add(lanternLight);

    // a dim warm fill low in the hull so the bilge reads even when the sun rakes
    // from one side (verify: looking down shows planks, not a black well)
    const fill = new THREE.PointLight(0xffe6c0, 0.5, 6.0, 1.6);
    fill.position.set(0, 0.3, 0.2);
    rig.add(fill);

    // ----- the paddle (animated) -----
    const paddle = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 8), new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.8 }));
    shaft.rotation.z = Math.PI / 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.012, 0.18), new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.8 }));
    blade.position.x = -0.95;
    paddle.add(shaft, blade);
    paddle.position.set(0, 0.02, 0.45);          // resting across the thwarts
    rig.add(paddle);

    rig.userData.paddle = paddle;
    return rig;
  }

  /* ---------- close-range water: a high-detail patch riding with the boat ----------
     The big terrain sheet is built for the overview; at eye level its triangles
     are coarse and its shading flat. This patch (~72 m, fine grid) follows the
     boat and renders the water the classic way (per the standard "pretty water"
     recipe): the SAME three swell trains for displacement so it stays in phase
     with the sheet and the physics, plus small chop waves, a fresnel blend from
     deep teal to the golden sky, a Blinn-Phong sun glitter, and scrolling
     high-frequency normal ripples. It fades to nothing at its rim so it melts
     into the base sheet with no visible seam, and the hull's depth lid keeps it
     out of the boat like any other water. */
  const PATCH_HALF = 36;
  function makeDetailWater(sunDir) {
    const SEG = 120;
    const geo = new THREE.PlaneGeometry(PATCH_HALF * 2, PATCH_HALF * 2, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const kv = TRAINS.map((k) => new THREE.Vector4(k.kx, k.kz, k.om, k.w));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: UAMP },
        uMean: { value: UMEAN },
        uK: { value: kv },
        uHalf: { value: PATCH_HALF },
        uDeep: { value: new THREE.Color(0x255266) },
        uSky: { value: new THREE.Color(0xe8c489) },     // the golden-hour horizon
        uSunCol: { value: new THREE.Color(0xffc15a) },
        uSunDir: { value: (sunDir ? sunDir.clone() : new THREE.Vector3(0.5, 0.8, 0.37)).normalize() },
      },
      vertexShader: `
        uniform float uTime, uAmp, uMean, uHalf;
        uniform vec4 uK[3];
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vEdge;
        void main() {
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          // fade everything bespoke toward the rim so the patch meets the sheet
          vEdge = 1.0 - smoothstep(0.58, 1.0, length(position.xz) / uHalf);
          float h = 0.0, dx = 0.0, dz = 0.0;
          for (int i = 0; i < 3; i++) {                  // the shared swell
            float ph = wp.x * uK[i].x + wp.z * uK[i].y + uTime * uK[i].z;
            h  += sin(ph) * uK[i].w;
            dx += cos(ph) * uK[i].w * uK[i].x;
            dz += cos(ph) * uK[i].w * uK[i].y;
          }
          // short chop riding the swell, eye-level detail the sheet can't carry
          float c1 = sin(wp.x * 1.45 + wp.z * 0.55 + uTime * 2.4);
          float c2 = sin(wp.x * 0.62 - wp.z * 2.10 - uTime * 1.9);
          float chop = (c1 * 0.045 + c2 * 0.035) * vEdge;
          float cdx = (cos(wp.x * 1.45 + wp.z * 0.55 + uTime * 2.4) * 0.045 * 1.45
                     + cos(wp.x * 0.62 - wp.z * 2.10 - uTime * 1.9) * 0.035 * 0.62) * vEdge;
          float cdz = (cos(wp.x * 1.45 + wp.z * 0.55 + uTime * 2.4) * 0.045 * 0.55
                     - cos(wp.x * 0.62 - wp.z * 2.10 - uTime * 1.9) * 0.035 * 2.10) * vEdge;
          wp.y = uMean + uAmp * (h - 1.05) + chop + 0.04 * vEdge;
          vNormal = normalize(vec3(-dx * uAmp - cdx, 1.0, -dz * uAmp - cdz));
          vWorld = wp;
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: `
        precision highp float;
        uniform vec3 uDeep, uSky, uSunDir, uSunCol;
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vNormal;
        varying float vEdge;
        void main() {
          // scrolling high-frequency ripple normals (two directions, two scales)
          float rx = 0.060 * sin(vWorld.x * 2.7 + vWorld.z * 0.8 + uTime * 2.1)
                   + 0.045 * sin(vWorld.x * 5.3 - vWorld.z * 1.9 - uTime * 3.1);
          float rz = 0.060 * sin(vWorld.z * 2.9 - vWorld.x * 0.7 - uTime * 2.3)
                   + 0.045 * sin(vWorld.z * 4.7 + vWorld.x * 1.6 + uTime * 2.7);
          vec3 N = normalize(vNormal + vec3(rx, 0.0, rz) * vEdge);
          vec3 V = normalize(cameraPosition - vWorld);
          // fresnel: looking down → deep teal; toward the horizon → golden sky
          float fres = pow(1.0 - max(dot(V, N), 0.0), 3.0);
          vec3 col = mix(uDeep, uSky, clamp(fres, 0.0, 1.0));
          // Blinn-Phong sun: a sharp glitter and a broad warm sheen
          vec3 L = normalize(uSunDir);
          vec3 Hv = normalize(L + V);
          float ndh = max(dot(N, Hv), 0.0);
          col += uSunCol * (pow(ndh, 240.0) * 2.6 + pow(ndh, 22.0) * 0.55);
          // a touch of upwelling brightness where the swell tips toward the eye
          col += uDeep * max(N.x * V.x + N.z * V.z, 0.0) * 0.25;
          gl_FragColor = vec4(col, 0.94 * vEdge);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 2;             // over the base sheet (1); under the wake foam (3)
    mesh.frustumCulled = false;       // displaced in-shader; let it always draw
    return mesh;
  }

  /* ---------- shoreline grass: tufts where the boat meets the land ----------
     When the canoe noses up to a beach the bare sand band reads dead. This
     scatters instanced grass tufts (two crossed alpha-tested blades) along the
     shore: every ground cell within ~42 m whose elevation sits in the
     beach-grass band gets a tuft, deterministically hashed from its world cell
     so re-seeding as the boat moves never makes a tuft pop or wander. Greener
     low near the wet sand, drier straw higher up. Reeds (taller, greener)
     stand right at the waterline. */
  const GRASS_R = 42, GRASS_STEP = 1.7, GRASS_CAP = 1100;
  function grassTexture() {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.strokeStyle = '#ffffff';                 // tinted per instance
    x.lineWidth = 2.6;
    for (let i = 0; i < 9; i++) {              // a sheaf of bent blades
      const bx = 8 + i * 6, sway = (i % 3 - 1) * 10 + (i % 2) * 5;
      x.beginPath();
      x.moveTo(bx, 64);
      x.quadraticCurveTo(bx + sway * 0.3, 34, bx + sway, 6 + (i % 4) * 7);
      x.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    return tex;
  }
  function makeGrass(heightAt) {
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    const quad2 = quad.clone().rotateY(Math.PI / 2);
    // merge the two crossed quads
    const pos = [], uv = [], idx = [];
    for (const q of [quad, quad2]) {
      const off = pos.length / 3;
      const p = q.attributes.position, u = q.attributes.uv;
      for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(u.getX(i), u.getY(i)); }
      for (let i = 0; i < q.index.count; i++) idx.push(off + q.index.getX(i));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({
      map: grassTexture(), alphaTest: 0.35, side: THREE.DoubleSide, transparent: true,
    });
    const im = new THREE.InstancedMesh(geo, mat, GRASS_CAP);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;
    const _m = new THREE.Matrix4();
    const _c = new THREE.Color();
    const GREEN = new THREE.Color(0x5d7a38), STRAW = new THREE.Color(0xa3995a), REED = new THREE.Color(0x47643a);
    const hash = (a, b) => {
      const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
      return h - Math.floor(h);
    };
    let seedX = 1e9, seedZ = 1e9;
    function reseed(bx, bz) {
      if (Math.hypot(bx - seedX, bz - seedZ) < 4) return;
      seedX = bx; seedZ = bz;
      let n = 0;
      const c0x = Math.floor((bx - GRASS_R) / GRASS_STEP), c1x = Math.ceil((bx + GRASS_R) / GRASS_STEP);
      const c0z = Math.floor((bz - GRASS_R) / GRASS_STEP), c1z = Math.ceil((bz + GRASS_R) / GRASS_STEP);
      for (let cx = c0x; cx <= c1x && n < GRASS_CAP; cx++) {
        for (let cz = c0z; cz <= c1z && n < GRASS_CAP; cz++) {
          const h1 = hash(cx, cz);
          if (h1 > 0.72) continue;                    // thin the field
          const x = (cx + h1) * GRASS_STEP, z = (cz + hash(cz, cx)) * GRASS_STEP;
          if ((x - bx) * (x - bx) + (z - bz) * (z - bz) > GRASS_R * GRASS_R) continue;
          const h = heightAt(x, z);
          const reed = h > -0.18 && h < 0.06;          // standing in the shallows
          if (!reed && (h < 0.06 || h > 1.7)) continue; // the beach-grass band
          const s = reed ? 0.9 + h1 * 0.7 : 0.35 + h1 * 0.55 + (h / 1.7) * 0.25;
          _m.makeRotationY(h1 * 6.28);
          _m.scale(_seed3.set(s * (0.8 + h1 * 0.6), s, s * (0.8 + h1 * 0.6)));
          _m.setPosition(x, reed ? -0.25 : h - 0.04, z);
          im.setMatrixAt(n, _m);
          if (reed) _c.copy(REED).offsetHSL(0, 0, (h1 - 0.5) * 0.06);
          else _c.copy(GREEN).lerp(STRAW, Math.min(1, h / 1.5)).offsetHSL((h1 - 0.5) * 0.02, 0, (h1 - 0.5) * 0.08);
          im.setColorAt(n, _c);
          n++;
        }
      }
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    return { mesh: im, reseed };
  }
  const _seed3 = new THREE.Vector3();

  /* ---------- a small low-flying gull for close company (self-contained) ---------- */
  function buildGull() {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe9e3d4 });
    const wingMat = new THREE.MeshLambertMaterial({ color: 0xf3efe6, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bodyMat);
    body.scale.set(0.45, 0.45, 1.8);
    g.add(body);
    const wing = (s) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, s * 3.0, 0.1, -0.3, s * 2.4, -0.1, 0.6], 3));
      geo.computeVertexNormals();
      return new THREE.Mesh(geo, wingMat);
    };
    const wR = wing(1), wL = wing(-1);
    g.add(wR, wL);
    g.userData.wR = wR; g.userData.wL = wL;
    return g;
  }

  /* ---------- module ---------- */

  function build(frame, opts) {
    opts = opts || {};
    const seaLevel = (opts.seaLevel != null) ? opts.seaLevel : 0;
    const heightAt = frame.heightAt;
    const radius = frame.radius;
    const waterAt = opts.waterAt || swell;     // prefer the terrain's own swell (one source)

    const group = new THREE.Group();          // host adds this to the scene
    const rig = buildRig();                    // moves with the boat
    const world = new THREE.Group();           // stays in world coords (wake/fish/…)
    group.add(rig, world);

    // ----- boat state -----
    let px = 0, pz = 0;                         // position (metres, world XZ)
    let theta = 0;                             // heading (matches the look yaw convention)
    let v = 0;                                 // forward speed (m/s, ≥ 0)
    let strokePh = 0;                          // paddle stroke phase
    let prevDip = 0;                           // last frame's blade-dip, for exit drips
    // audio hook timers (window.cartaHarborAudio is optional — every call is
    // guarded, so a missing/partial audio module never throws)
    let lapTimer = 0, creakTimer = 0;
    // anchored-ship positions [{x,z}] for the rigging-creak hook; the host does
    // not pass these yet (built.shipDots stays internal to harbordiorama.js) —
    // wire `ships: built.shipDots` into enterTour()'s build opts to enable it
    const ships = opts.ships || null;
    // Gunwale (local y=0) rides this far above the waterline. Big enough that the
    // sealed floorboard (FLOOR_Y) stays above the sea sheet through the whole
    // swell, so no water ever shows inside; the outer hull still dips under, so
    // from outside she sits IN the water, not on top of it.
    const DRAFT = 0.5;

    // tuning
    const THRUST = 2.6, VREF = 3.2, DRAG_LIN = 0.55, DRAG_QUAD = 0.16;
    const VMAX = 8.94;                         // hard cap: 20 mph, the stepped cruise's ceiling
    const EYE = new THREE.Vector3(0, 0.5, 1.3);   // seat/eye offset, local (aft of centre)

    // ----- close-range water: the high-detail patch riding with the boat -----
    const detailWater = makeDetailWater(opts.sunDir);
    world.add(detailWater);

    // ----- shoreline grass: the beach comes alive as the boat closes in -----
    const grass = makeGrass(heightAt);
    world.add(grass.mesh);

    // ----- ambient: wake foam (world-space, pooled) -----
    const WAKE_N = 44;
    const wakeMat = new THREE.MeshBasicMaterial({ color: 0xeef6f6, transparent: true, opacity: 0, depthWrite: false });
    const wakeGeo = new THREE.PlaneGeometry(1, 1);
    const wake = [];
    for (let i = 0; i < WAKE_N; i++) {
      const m = new THREE.Mesh(wakeGeo, wakeMat.clone());
      m.rotation.x = -Math.PI / 2; m.visible = false;
      m.renderOrder = 3;            // foam reads OVER the detail water patch (2)
      world.add(m);
      wake.push({ mesh: m, life: 0, max: 1, x: 0, z: 0, grow: 1 });
    }
    let wakePtr = 0, wakeTimer = 0;
    function spawnWake(x, z, scale, max) {
      const w = wake[wakePtr]; wakePtr = (wakePtr + 1) % WAKE_N;
      w.x = x; w.z = z; w.life = max; w.max = max; w.grow = scale;
      w.mesh.scale.set(scale, scale, scale);
      w.mesh.visible = true;
    }

    // ----- ambient: airborne spray droplets (paddle catch + bow against swell) -----
    // one pooled THREE.Points; ballistic arcs integrated with dt, no per-frame allocs.
    const SPRAY_N = 60;
    const sprayPos = new Float32Array(SPRAY_N * 3);
    for (let i = 0; i < SPRAY_N; i++) sprayPos[i * 3 + 1] = -9999;   // park dead drops far below
    const sprayGeo = new THREE.BufferGeometry();
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
    const sprayMat = new THREE.PointsMaterial({
      color: 0xeef6f6, size: 0.09, sizeAttenuation: true,
      transparent: true, opacity: 0.85, depthWrite: false,
    });
    const sprayPts = new THREE.Points(sprayGeo, sprayMat);
    sprayPts.frustumCulled = false;
    sprayPts.renderOrder = 3;
    world.add(sprayPts);
    const spray = [];
    for (let i = 0; i < SPRAY_N; i++) spray.push({ x: 0, y: -9999, z: 0, vx: 0, vy: 0, vz: 0, life: 0 });
    let sprayPtr = 0;
    function emitSpray(x, y, z, n, power, dirx, dirz) {
      for (let k = 0; k < n; k++) {
        const p = spray[sprayPtr]; sprayPtr = (sprayPtr + 1) % SPRAY_N;
        p.x = x; p.y = y; p.z = z;
        const sp = power * (0.6 + Math.random() * 0.8);
        p.vx = dirx * sp * 0.6 + (Math.random() - 0.5) * power;
        p.vz = dirz * sp * 0.6 + (Math.random() - 0.5) * power;
        p.vy = sp * (0.9 + Math.random() * 0.7);
        p.life = 0.45 + Math.random() * 0.35;
      }
    }

    // ----- ambient: faint mist puffs where the bow slaps into a swell -----
    // a tiny pooled set of soft sprites; they rise, swell and fade
    const MIST_N = 5;
    const mistTex = (() => {
      const c = document.createElement('canvas');
      c.width = 32; c.height = 32;
      const x = c.getContext('2d');
      const gr = x.createRadialGradient(16, 16, 2, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,0.85)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
      return new THREE.CanvasTexture(c);
    })();
    const mist = [];
    for (let i = 0; i < MIST_N; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: mistTex, color: 0xeef6f6, transparent: true, opacity: 0, depthWrite: false,
      }));
      sp.visible = false;
      sp.renderOrder = 3;
      world.add(sp);
      mist.push({ sp, life: 0, max: 0.8, x: 0, y: 0, z: 0 });
    }
    let mistPtr = 0, mistTimer = 0;    // timer keeps the small pool from churning
    function spawnMist(x, y, z) {
      const m = mist[mistPtr]; mistPtr = (mistPtr + 1) % MIST_N;
      m.x = x; m.y = y; m.z = z; m.life = m.max;
      m.sp.visible = true;
    }

    // ----- ambient: fish darting just under the surface -----
    const fish = [];
    const fishMat = new THREE.MeshStandardMaterial({ color: 0x2b3a44, roughness: 0.5 });
    for (let i = 0; i < 5; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), fishMat);
      m.scale.set(0.4, 0.3, 1.4);
      world.add(m);
      fish.push({ mesh: m, a: Math.random() * 6.28, r: 3 + Math.random() * 6, spd: 0.3 + Math.random() * 0.5, depth: 0.5 + Math.random() * 1.1, cx: 0, cz: 0, jump: 0 });
    }

    // ----- ambient: floating bits (barrel / driftwood / seaweed) -----
    const floaters = [];
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 12), new THREE.MeshStandardMaterial({ color: 0x6b4a2c, roughness: 0.9 }));
    barrel.rotation.z = Math.PI / 2;
    const drift = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.18), new THREE.MeshStandardMaterial({ color: 0x4a3a26, roughness: 0.95 }));
    const weed = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5), new THREE.MeshStandardMaterial({ color: 0x3c5a3a, roughness: 1, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    weed.rotation.x = -Math.PI / 2;
    // remember each base orientation so the swell tilt rides on top of it (rather
    // than standing the barrel upright or flattening the seaweed)
    for (const m of [barrel, drift, weed]) {
      world.add(m);
      floaters.push({ mesh: m, x: 0, z: 0, spin: Math.random() * 0.4 - 0.2, off: Math.random() * 6.28, baseX: m.rotation.x, baseZ: m.rotation.z });
    }

    // ----- ambient: a few low gulls — the HERO model (real-bird detail: white
    //       body, grey mantle, black wingtips, orange bill and feet, two-joint
    //       wings) since these fly well within 50 m of the viewer -----
    const gulls = [];
    const gullSrc = window.cartaHarborBirds ? window.cartaHarborBirds(THREE) : null;
    for (let i = 0; i < 4; i++) {
      const juv = i === 3;                     // one brown first-winter bird
      const gl = (gullSrc && gullSrc.heroGull) ? gullSrc.heroGull(juv)
        : (gullSrc && gullSrc.gull) ? gullSrc.gull(juv) : buildGull();
      gl.scale.setScalar(juv ? 0.46 : 0.5);    // ~1.5 m span up close
      gl.userData._wR = gl.userData.wingR || gl.userData.wR;
      gl.userData._wL = gl.userData.wingL || gl.userData.wL;
      world.add(gl);
      gulls.push({
        mesh: gl, a: i * 1.7,
        pr: 12 + i * 6,                    // wild-bird standoff: 12–30 m orbits
        alt: 3 + i * 2.3,                  // 3–10 m up
        spd: (0.34 - i * 0.05) * (i === 3 ? -1 : 1),
        flapF: 2.8 + i * 0.35,             // ~3 Hz
        fph: i * 2.1,                      // accumulated flap phase (irregular beat)
        skim: i % 2 === 0,                 // half make low water-skimming fly-bys
        lander: i === 1 || i === 3,        // these settle on the water now and then
        hover: i === 2,                    // this one hangs into the wind
        follow: i === 1 ? 0 : -1,          // gull 1 loosely trails gull 0
        passer: i === 0,                   // only this one makes the rare close fly-by
        passT: 0, passK: 0, passTimer: 24, // one close pass every ~20–40 s
        mode: 0,                           // 0 fly | 1 descend | 2 float | 3 takeoff
        mTimer: 14 + i * 9,                // seconds until the next landing
        lx: 0, lz: 0,                      // landing / float spot (world)
        hdg: 0,                            // heading while on the water
        fold: 0,                           // 0 spread .. 1 folded (eased)
        blend: 0,                          // ease from takeoff exit back onto the orbit
        hoverK: 0,                         // 0 orbit .. 1 hovering into the wind
        soar: 0,                           // eased 0..1 shoreline-updraft soaring
        lift: 0,                           // metres gained riding the slope lift
        flare: 0,                          // eased 0..1 landing flare (final approach)
        preen: 0,                          // eased 0..1 preen bout while afloat
        stepN: -1,                         // last surface-patter step index (takeoff)
        nearOn: false,                     // close-pass audio latch (hysteresis)
        escortT: 0, escortK: 0,            // boat-pacing escort run (timer + ease)
        escortTimer: 18 + i * 7,           // rare: re-checked every ~15–30 s
        escortSide: 1,                     // which beam the escort holds
      });
    }

    // ----- helpers -----
    const _n = new THREE.Vector3();
    const _qLook = new THREE.Quaternion();
    const _qTilt = new THREE.Quaternion();
    const _eLook = new THREE.Euler(0, 0, 0, 'YXZ');
    const _eTilt = new THREE.Euler(0, 0, 0, 'YXZ');
    const _seat = new THREE.Vector3();

    function placeOnWater(mesh, x, z, t, yOff) {
      const w = waterAt(x, z, t);
      mesh.position.set(x, w.y + (yOff || 0), z);
      return w;
    }

    function spawn() {
      if (opts.spawnXZ) { px = opts.spawnXZ.x; pz = opts.spawnXZ.z; }
      else {
        // march outward from origin until we're over water
        px = 0; pz = 0;
        for (let r = radius * 0.2; r < radius * 1.5; r += radius * 0.05) {
          if (heightAt(r, 0) < seaLevel - 0.4) { px = r; break; }
        }
      }
      // face the harbour centroid (origin): F(θ)=(−sinθ,−cosθ) ∝ (−px,−pz)
      theta = Math.atan2(px, pz);
      v = 0; strokePh = 0;
      // seed floaters around the spawn so they're in view but not on top of us
      for (let i = 0; i < floaters.length; i++) {
        const ang = theta + (i - 1) * 0.6;
        floaters[i].x = px - Math.sin(ang) * (5 + i * 2) + (Math.random() - 0.5) * 3;
        floaters[i].z = pz - Math.cos(ang) * (5 + i * 2) + (Math.random() - 0.5) * 3;
      }
      return theta;
    }

    function update(dt, t, input, camera) {
      dt = Math.min(0.05, Math.max(0.0001, dt));
      const yaw = input.camYaw || 0;

      // --- steering: ease heading toward the gaze, faster with way on ---
      let dTheta = yaw - theta;
      while (dTheta > Math.PI) dTheta -= 2 * Math.PI;
      while (dTheta < -Math.PI) dTheta += 2 * Math.PI;
      const turnRate = Math.min(2.2, 0.25 + v / VREF);
      const applied = dTheta * Math.min(1, turnRate * dt);
      theta += applied;

      // --- speed: rowing/W thrust, S/D reverse, stepped cruise, else water drag ---
      // The stepped cruise (0..VMAX m/s) is a target the paddling works toward;
      // mouse/W rowing still adds its surge on top, and drag settles any excess
      // back to the step. At step 0 the old manual behaviour is untouched.
      const fwd = input.rowing, rev = input.reverse;
      const cruise = input.cruise || 0;
      if (fwd) v += THRUST * dt;
      else if (rev) v -= THRUST * 0.9 * dt;            // back-paddle: firm enough to be felt
      if (!rev && cruise > 0 && v < cruise) {
        v += (cruise - v) * Math.min(1, dt * 3.0);                  // stroke toward the set step
      } else {
        v -= (DRAG_LIN * v + DRAG_QUAD * v * Math.abs(v)) * dt;     // coast (handles reverse too)
      }
      if (v > VMAX) v = VMAX; if (v < -2.4) v = -2.4;   // reverse cap ~2.4 m/s (was -1.1, barely moved)

      // --- propose a move along the heading; stay on water ---
      const fx = -Math.sin(theta), fz = -Math.cos(theta);   // forward unit (bow toward −Z at θ=0)
      const nx = px + fx * v * dt, nz = pz + fz * v * dt;
      const blocked = (heightAt(nx, nz) > seaLevel - 0.3) || (Math.hypot(nx, nz) > radius * 0.98);
      if (blocked) { v *= 0.25; } else { px = nx; pz = nz; }

      // --- float on the swell: bob + pitch (along heading) + roll (across) ---
      const w = waterAt(px, pz, t);
      const boatY = w.y + DRAFT;
      // surface tilt projected onto the hull axes (normal ≈ (nx,1,nz))
      const pitch = (w.nx * fx + w.nz * fz) * 0.8;                 // nose up/down
      const sx = -fz, sz = fx;                                    // starboard (right) unit
      let roll = (w.nx * sx + w.nz * sz) * 0.8;
      roll += -applied / dt * v * 0.04;                          // lean into the turn
      roll = Math.max(-0.5, Math.min(0.5, roll));

      rig.position.set(px, boatY, pz);
      rig.rotation.set(pitch, theta, roll, 'YXZ');

      // the detail water rides along (its swell is a world-space function, so
      // sliding the grid under it is seamless)
      detailWater.position.set(px, 0, pz);
      detailWater.material.uniforms.uTime.value = t;
      grass.reseed(px, pz);          // re-scatter the shore tufts as we move

      // --- paddle stroke animation ---
      // The paddler also keeps stroking while a cruise step is set, so the boat
      // still reads as paddled — cadence rises with the step (and with effort).
      const paddle = rig.userData.paddle;
      if (input.rowing || (cruise > 0 && v > 0.05)) {
        // apparent paddle force: digging hard from a standstill, easing to a
        // lazy maintenance stroke at speed — cadence and spray follow it
        const effort = Math.max(0, 1 - v / VMAX);    // 1 at rest → 0 at hull speed
        strokePh += dt * (2.3 + 1.3 * effort + cruise * 0.22);
        const s = strokePh;
        const dip = Math.sin(s);                 // >0 ≈ blade in the water
        paddle.position.set(0.55, 0.05 - 0.12 * Math.max(0, dip), 0.45 - 0.5 * Math.cos(s));
        paddle.rotation.set(-0.5 * dip, 0.25 * Math.cos(s), 0.2, 'XYZ');
        // catch splash → a quick wake fleck plus a burst of airborne droplets
        if (dip > 0.95) {
          const bx = px + fx * 0.4 - Math.sin(theta + 1.4) * 0.9;
          const bz = pz + fz * 0.4 - Math.cos(theta + 1.4) * 0.9;
          spawnWake(bx, bz, 0.25 + 0.2 * effort, 0.7);
          const sw = waterAt(bx, bz, t);
          emitSpray(bx, sw.y + 0.05, bz, (2 + 4 * effort) | 0, 0.6 + 0.9 * effort,
                    -Math.sin(theta + 1.4), -Math.cos(theta + 1.4));
          // audio: one splash at the instant of the catch (not every frame of it)
          if (prevDip <= 0.95) {
            window.cartaHarborAudio && cartaHarborAudio.splash
              && cartaHarborAudio.splash(Math.min(1, Math.max(0, effort)));
          }
        }
        // exit drips: as the blade lifts clear, a weak trail of droplets falls
        // off it (low power, lobbed slightly forward with the recovery)
        if (prevDip > 0.12 && dip <= 0.12) {
          const bx = px + fx * 0.4 - Math.sin(theta + 1.4) * 0.95;
          const bz = pz + fz * 0.4 - Math.cos(theta + 1.4) * 0.95;
          const sw = waterAt(bx, bz, t);
          emitSpray(bx, sw.y + 0.3, bz, (1 + 3 * effort) | 0, 0.25 + 0.3 * effort, fx * 0.4, fz * 0.4);
        }
        prevDip = dip;
      } else {
        paddle.position.lerp(_seat.set(0, 0.02, 0.45), Math.min(1, dt * 4));
        paddle.rotation.set(0, 0, 0.05, 'XYZ');
        prevDip = 0;
      }

      // --- audio: water lapping the hull, once a second-ish, scaled by way on ---
      lapTimer -= dt;
      if (lapTimer <= 0) {
        lapTimer = 1.1;
        window.cartaHarborAudio && cartaHarborAudio.lap
          && cartaHarborAudio.lap(Math.min(1, Math.abs(v) / 3.0));
      }
      // --- audio: rigging creak drifting over from an anchored ship (only if
      //     the host passed ship positions; see `ships` above) ---
      if (ships && ships.length) {
        creakTimer -= dt;
        if (creakTimer <= 0) {
          creakTimer = 1.3;
          let best2 = 1e12;
          for (let i = 0; i < ships.length; i++) {
            const ddx = ships[i].x - px, ddz = ships[i].z - pz;
            const dd = ddx * ddx + ddz * ddz;
            if (dd < best2) best2 = dd;
          }
          if (best2 < 3600) {                        // within 60 m of the nearest hull
            window.cartaHarborAudio && cartaHarborAudio.creak
              && cartaHarborAudio.creak(Math.sqrt(best2));
          }
        }
      }

      // --- seat the camera: position from the rig, orientation from the look ---
      _seat.copy(EYE).applyEuler(rig.rotation).add(rig.position);
      camera.position.copy(_seat);
      _eLook.set(input.camPitch || 0, yaw, 0, 'YXZ');
      _qLook.setFromEuler(_eLook);
      _eTilt.set(pitch * 0.25, 0, roll * 0.25, 'YXZ');           // a touch of boat tilt
      _qTilt.setFromEuler(_eTilt);
      camera.quaternion.copy(_qLook).multiply(_qTilt);

      // --- wake: trail foam off the stern while making way ---
      wakeTimer -= dt;
      if (v > 0.4 && wakeTimer <= 0) {
        wakeTimer = 0.07;
        const sxw = px - fx * (LEN / 2), szw = pz - fz * (LEN / 2);
        spawnWake(sxw + (Math.random() - 0.5) * 0.6, szw + (Math.random() - 0.5) * 0.6, 0.5 + v * 0.15, 1.1);
        // a little foam fleck on the centreline of the run for a frothier wake
        spawnWake(sxw + fx * 0.7, szw + fz * 0.7, 0.3 + v * 0.08, 0.8);
        if (input.rowing) spawnWake(px + fx * (LEN / 2), pz + fz * (LEN / 2), 0.3, 0.5); // bow moustache
        // bow spray: only when driving against a rising swell at the bow
        const bx = px + fx * (LEN / 2), bz = pz + fz * (LEN / 2);
        const bw = waterAt(bx, bz, t);
        const into = bw.nx * fx + bw.nz * fz;        // swell face tilting toward the bow
        if (v > 1.3 && into > 0.05) {
          emitSpray(bx, bw.y + 0.06, bz, 3, 0.7 + (v - 1.3) * 0.5 + into * 1.2, fx, fz);
          if (mistTimer <= 0) {                        // the faint blown-back haze
            spawnMist(bx + fx * 0.4, bw.y + 0.35, bz + fz * 0.4);
            mistTimer = 0.28;
          }
        }
      }
      for (const wk of wake) {
        if (wk.life <= 0) { if (wk.mesh.visible) wk.mesh.visible = false; continue; }
        wk.life -= dt;
        const k = wk.life / wk.max;
        const ww = waterAt(wk.x, wk.z, t);
        wk.mesh.position.set(wk.x, ww.y + 0.03, wk.z);
        const sc = wk.grow * (1 + (1 - k) * 2.2);
        wk.mesh.scale.set(sc, sc, sc);
        wk.mesh.material.opacity = 0.5 * k;
      }

      // --- spray droplets: ballistic arcs, parked far below once spent ---
      for (let i = 0; i < SPRAY_N; i++) {
        const p = spray[i];
        if (p.life <= 0) { sprayPos[i * 3 + 1] = -9999; continue; }
        p.life -= dt;
        p.vy -= 9.8 * dt;                 // gravity
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.y < waterAt(p.x, p.z, t).y) { p.life = 0; sprayPos[i * 3 + 1] = -9999; continue; }
        sprayPos[i * 3] = p.x; sprayPos[i * 3 + 1] = p.y; sprayPos[i * 3 + 2] = p.z;
      }
      sprayGeo.attributes.position.needsUpdate = true;   // 180 floats/frame, negligible

      // --- mist puffs: rise, swell and fade ---
      mistTimer -= dt;
      for (const m of mist) {
        if (m.life <= 0) { if (m.sp.visible) m.sp.visible = false; continue; }
        m.life -= dt;
        const k = m.life / m.max;
        m.y += 0.35 * dt;
        m.sp.position.set(m.x, m.y, m.z);
        const sc = 0.7 + (1 - k) * 1.1;
        m.sp.scale.set(sc, sc * 0.7, 1);
        m.sp.material.opacity = 0.22 * k;
      }

      // --- fish: lazy circles near the boat, occasional jump ---
      for (const f of fish) {
        f.cx += (px - f.cx) * Math.min(1, dt * 0.3);
        f.cz += (pz - f.cz) * Math.min(1, dt * 0.3);
        f.a += f.spd * dt;
        const fxp = f.cx + Math.cos(f.a) * f.r, fzp = f.cz + Math.sin(f.a) * f.r;
        const fw = waterAt(fxp, fzp, t);
        if (f.jump > 0) { f.jump -= dt; f.mesh.position.set(fxp, fw.y + Math.sin((0.4 - f.jump) * 7) * 0.5, fzp); }
        else { f.mesh.position.set(fxp, fw.y - f.depth, fzp); if (Math.random() < 0.0015) f.jump = 0.4; }
        f.mesh.rotation.y = -f.a + Math.PI / 2;
      }

      // --- floaters: bob on the swell (tilt rides on top of the base pose) ---
      for (const fl of floaters) {
        const fw = placeOnWater(fl.mesh, fl.x, fl.z, t, 0.04);
        fl.mesh.rotation.z = fl.baseZ + fl.spin + fw.nx * 0.6;
        fl.mesh.rotation.x = fl.baseX + fw.nz * 0.6;
      }

      // --- low gulls near the boat: wheeling passes, water-skims, an
      //     occasional hover into the wind, and — the landers — settling onto
      //     the swell beside the canoe, floating a while, then taking off ---
      for (const g of gulls) {
        const mesh = g.mesh;
        const wR = mesh.userData._wR, wL = mesh.userData._wL;
        const oR = wR.userData.outer, oL = wL.userData.outer;
        const tail = mesh.userData.tail, head = mesh.userData.head;
        let flapAmp = 0, glide = 0, flapMul = 1, doFlap = true;

        if (g.mode === 2) {
          // FLOAT: sit on the swell, wings folded, weathervaning and drifting
          g.fold = Math.min(1, g.fold + dt * 2.2);
          // weathervane bow-on INTO the dominant swell (with a small hunt
          // either side) and drift slowly down-wave — not a heading on rails
          let dh = SWELL_HDG - g.hdg;
          while (dh > Math.PI) dh -= 2 * Math.PI;
          while (dh < -Math.PI) dh += 2 * Math.PI;
          g.hdg += dh * Math.min(1, dt * 0.5) + Math.sin(t * 0.34 + g.a) * 0.1 * dt;
          g.lx += (SWELL_DX * 0.07 + Math.sin(t * 0.2 + g.a) * 0.03) * dt;
          g.lz += (SWELL_DZ * 0.07 + Math.cos(t * 0.26 + g.a) * 0.03) * dt;
          const fw = waterAt(g.lx, g.lz, t);
          const ffx = -Math.sin(g.hdg), ffz = -Math.cos(g.hdg);
          mesh.position.set(g.lx, fw.y + 0.1, g.lz);
          mesh.rotation.set((fw.nx * ffx + fw.nz * ffz) * 0.6, g.hdg,
                            (fw.nx * -ffz + fw.nz * ffx) * 0.6, 'YXZ');
          doFlap = false;
          if (tail) { tail.rotation.x = 0.04; tail.rotation.z = 0; }
          // occasional preen bout: the head sweeps back and down toward a
          // wing, nuzzles a moment, then comes back up (slow eased gate)
          const pg = Math.sin(t * 0.21 + g.a * 4.1) > 0.8 ? 1 : 0;
          g.preen += (pg - g.preen) * Math.min(1, dt * 2.5);
          if (head) {
            const side = Math.sin(g.a * 9.7) > 0 ? 1 : -1;
            head.rotation.y = side * 1.05 * g.preen;
            head.rotation.x = 0.06 * Math.sin(t * 1.7 + g.a)
                            + (0.42 + 0.08 * Math.sin(t * 5.0)) * g.preen;
            head.rotation.z = 0;
          }
          g.mTimer -= dt;
          // flush early if the canoe bears down within ~8 m (never run one over)
          const dcx = g.lx - px, dcz = g.lz - pz;
          const flushed = dcx * dcx + dcz * dcz < 64;
          if (g.mTimer <= 0 || flushed) {            // up and away
            if (flushed) g.hdg = Math.atan2(-dcx, -dcz);   // climb out AWAY from the boat
            g.mode = 3; g.mTimer = 0; g.stepN = -1; g.preen = 0;
            spawnWake(g.lx, g.lz, 0.45, 0.8);
            emitSpray(g.lx, fw.y + 0.06, g.lz, 4, 0.9, -Math.sin(g.hdg), -Math.cos(g.hdg));
            // audio: wings off the water right beside the canoe
            window.cartaHarborAudio && cartaHarborAudio.gullNear && cartaHarborAudio.gullNear();
          }
        } else if (g.mode === 3) {
          // TAKEOFF: flap hard, run along the surface pattering, climb out
          g.mTimer += dt;
          g.fold = Math.max(0, g.fold - dt * 3);
          const k = g.mTimer;
          const ffx = -Math.sin(g.hdg), ffz = -Math.cos(g.hdg);
          mesh.position.x += ffx * (1.6 + k * 2.4) * dt;
          mesh.position.z += ffz * (1.6 + k * 2.4) * dt;
          mesh.position.y += (0.35 + k * 1.5) * dt;
          mesh.rotation.set(0.25 * Math.min(1, k * 2), g.hdg, 0, 'YXZ');  // nose up
          const wyT = waterAt(mesh.position.x, mesh.position.z, t).y;
          if (mesh.position.y - wyT < 0.45) {
            // 2-3 discrete surface-patter STEPS on a fixed cadence — each one
            // a synced spray fleck + wake ring as a foot slaps the water
            const stepN = (k * 4.2) | 0;
            if (stepN !== g.stepN && stepN >= 1 && stepN <= 3) {
              g.stepN = stepN;
              emitSpray(mesh.position.x, wyT + 0.05, mesh.position.z, 2, 0.6, ffx, ffz);
              spawnWake(mesh.position.x, mesh.position.z, 0.28, 0.45);
            }
          }
          flapAmp = 0.95; flapMul = 1.35;
          if (mesh.position.y - wyT > g.alt + 0.5 || k > 3.2) {
            g.mode = 0; g.mTimer = 26 + (0.5 + 0.5 * Math.sin(g.a * 5.1)) * 18; g.blend = 1;
            g.a = Math.atan2(mesh.position.z - pz, mesh.position.x - px);
          }
        } else if (g.mode === 1) {
          // DESCEND: set-winged glide down onto the chosen patch of water —
          // unless the canoe has closed on the spot, in which case wave off
          const dlx = g.lx - px, dlz = g.lz - pz;
          if (dlx * dlx + dlz * dlz < 81) {
            g.mode = 0; g.blend = 1; g.mTimer = 18;
            g.a = Math.atan2(mesh.position.z - pz, mesh.position.x - px);
            flapAmp = 0.6;
          } else {
          const twy = waterAt(g.lx, g.lz, t).y + 0.1;
          const ddx = g.lx - mesh.position.x, ddy = twy - mesh.position.y,
                ddz = g.lz - mesh.position.z;
          const d = Math.hypot(ddx, ddy, ddz);
          const step = Math.min(1, (2.6 * dt) / Math.max(0.001, d));
          mesh.position.x += ddx * step;
          mesh.position.y += ddy * step;
          mesh.position.z += ddz * step;
          // beak is −Z, so look at the mirror of the travel direction
          mesh.lookAt(mesh.position.x - ddx, mesh.position.y - ddy * 0.4, mesh.position.z - ddz);
          // landing flare: inside ~3 m the bird rocks nose-up, brakes with
          // deep strokes, fans the tail harder and drops its feet to the water
          g.flare += ((d < 3 ? 1 : 0) - g.flare) * Math.min(1, dt * 3.0);
          mesh.rotateX(0.45 * g.flare);              // nose-up rock (beak is −Z)
          flapAmp = 0.1 + 0.55 * g.flare;
          glide = 1 - 0.65 * g.flare;
          if (tail) { tail.rotation.x = 0.35 + 0.25 * g.flare; tail.rotation.z = 0; }
          if (d < 0.18) {                            // touchdown splash
            g.mode = 2; g.mTimer = 6 + (0.5 + 0.5 * Math.sin(g.a * 3.3)) * 5;
            g.hdg = Math.atan2(-ddx, -ddz);          // carry the approach heading
            spawnWake(g.lx, g.lz, 0.55, 0.9);
            emitSpray(g.lx, twy, g.lz, 5, 0.8, 0, 0);
          }
          }
        } else {
          // FLY: the wheeling pass (with the hover bird hanging into the wind,
          // high and off to the side — never parked over the bow)
          if (g.hover) {
            const ahead = fx * Math.cos(g.a) + fz * Math.sin(g.a);
            const gate = (Math.sin(t * 0.05 + 2.1) > 0.86 && ahead < 0.6) ? 1 : 0;
            g.hoverK += (gate - g.hoverK) * Math.min(1, dt * 1.2);
          }
          const hk = g.hoverK;
          // the rare close fly-by: every ~20–40 s the passer swings in for one
          // skim run, never nearer than ~7 m, then eases back out to standoff
          if (g.passer) {
            if (g.passT > 0) { g.passT -= dt; g.passK = Math.min(1, g.passK + dt * 1.2); }
            else {
              g.passK = Math.max(0, g.passK - dt * 0.8);
              g.passTimer -= dt;
              if (g.passTimer <= 0) {
                if (g.escortK <= 0 && g.escortT <= 0) g.passT = 4.5;  // never mid-escort
                g.passTimer = 20 + 20 * (0.5 + 0.5 * Math.sin(g.a * 7.3 + t));
              }
            }
            // boat-pacing escort: when the canoe is running fast this bird
            // occasionally swings in and matches speed alongside for a few
            // seconds — the way gulls pace a moving boat. Checked rarely,
            // fired only above ~5 m/s, and it peels away if the boat slows.
            if (g.escortT > 0) {
              g.escortT -= dt;
              g.escortK = Math.min(1, g.escortK + dt * 0.9);
              if (v < 4.0) g.escortT = 0;            // boat slowed — peel away
            } else {
              g.escortK = Math.max(0, g.escortK - dt * 0.6);
              g.escortTimer -= dt;
              if (g.escortTimer <= 0) {
                if (v > 5.0 && g.passT <= 0 && g.passK <= 0) {
                  g.escortT = 3 + 2 * (0.5 + 0.5 * Math.sin(g.a * 4.9 + t));  // 3–5 s
                  g.escortSide = Math.sin(t * 0.7 + g.a) > 0 ? 1 : -1;
                }
                g.escortTimer = 14 + 14 * (0.5 + 0.5 * Math.sin(g.a * 6.1 + t * 0.13));
              }
            }
          }
          const pk = g.passK * g.passK * (3 - 2 * g.passK);   // smoothstep ease
          const ek = g.escortK * g.escortK * (3 - 2 * g.escortK);
          g.a += g.spd * dt * (1 - 0.96 * hk) * (1 + 0.8 * pk); // quick through the pass
          const sg = Math.sign(g.spd) || 1;
          // a slow tide on the radius so the orbits never read as fixed circles
          let pr = g.pr * (0.82 + 0.30 * (0.5 + 0.5 * Math.sin(t * 0.11 + g.a * 0.5)));
          pr += (7.0 - pr) * pk;                     // the close pass bottoms out ~7 m
          let gx = px + Math.cos(g.a) * pr, gz = pz + Math.sin(g.a) * pr;
          const wy = waterAt(gx, gz, t).y;
          // skimmers drop almost to the water on part of the loop; others bob;
          // the close pass hugs the water like a real skim run
          const lowMix = g.skim ? (0.5 + 0.5 * Math.sin(g.a)) : 1;
          let gy = wy + (0.5 + (g.alt - 0.5) * lowMix) * (1 - 0.85 * pk) + 0.6 * pk
                 + Math.sin(g.a * 2) * 0.3 + hk * 2.5;
          // look at the mirror of the next point so the beak leads (nose is −Z)
          let tx = px + Math.cos(g.a + 0.1 * sg) * pr;
          let tz = pz + Math.sin(g.a + 0.1 * sg) * pr;
          if (g.follow >= 0) {
            // gulls rarely fly alone: shadow the leader from a loose trailing
            // offset (behind and above its tangent, wandering — not formation)
            const L = gulls[g.follow];
            if (L.mode === 0) {
              const lp = L.mesh.position;
              const lsg = Math.sign(L.spd) || 1;
              const fx2 = lp.x + Math.sin(L.a) * lsg * 5.5 + Math.sin(t * 0.23 + g.a) * 2.0;
              const fz2 = lp.z - Math.cos(L.a) * lsg * 5.5 + Math.cos(t * 0.31 + g.a) * 2.0;
              const fy2 = lp.y + 1.2 + Math.sin(t * 0.4 + g.a) * 0.8;
              gx += (fx2 - gx) * 0.7; gy += (fy2 - gy) * 0.7; gz += (fz2 - gz) * 0.7;
              tx += (lp.x - tx) * 0.7; tz += (lp.z - tz) * 0.7;   // head where the leader is
            }
          }
          if (ek > 0) {
            // hold station abeam at 10–15 m, slightly ahead of the seat, beak
            // on the boat's track — boat-relative, so the speed match is exact
            const eD = (12.5 + 2.5 * Math.sin(t * 0.5 + g.a)) * g.escortSide;
            const lead = 3 + Math.sin(t * 0.8 + g.a) * 2;
            const ex = px + sx * eD + fx * lead, ez = pz + sz * eD + fz * lead;
            const ey = waterAt(ex, ez, t).y + 2.0 + Math.sin(t * 1.3 + g.a) * 0.5;
            gx += (ex - gx) * ek; gy += (ey - gy) * ek; gz += (ez - gz) * ek;
            tx += (gx + fx * 5 - tx) * ek; tz += (gz + fz * 5 - tz) * ek;
          }
          if (g.blend > 0) {                         // ease back in after a takeoff
            g.blend = Math.max(0, g.blend - dt * 0.6);
            gx += (mesh.position.x - gx) * g.blend;
            gy += (mesh.position.y - gy) * g.blend;
            gz += (mesh.position.z - gz) * g.blend;
          }
          mesh.position.set(gx, gy, gz);
          mesh.lookAt(2 * gx - tx, gy, 2 * gz - tz);

          // glide low (skimming into wind), flap when climbing; never in hover
          // an escorting bird works to hold the pace: mostly flapping, level
          glide = (0.5 - 0.5 * Math.tanh(Math.cos(g.a) * 1.6) * (g.skim ? 1 : 0.4)) * (1 - hk) * (1 - 0.7 * ek);
          flapAmp = 0.7 * (1 - 0.85 * glide) * (1 + 0.45 * hk + 0.15 * ek);
          // bank tracks the actual turn: the tighter the radius, the steeper
          // the bank — so wander and close passes stay turn-correlated
          const bank = -sg * Math.min(0.45, 0.10 + 2.2 / pr) * (1 - hk) * (1 - 0.85 * ek);
          mesh.rotateZ(bank);
          mesh.rotateX(0.32 * hk);
          if (tail) { tail.rotation.x = 0.10 + 0.20 * glide + 0.35 * hk; tail.rotation.z = bank * 0.5; }
          if (head) head.rotation.z = -bank * 0.7;   // gaze stays level through the bank
          if (g.lander && g.blend <= 0) {
            g.mTimer -= dt;
            if (g.mTimer <= 0) {
              // settle on open water well off the canoe — a wild bird's standoff
              const la = g.a + 0.5 * sg;
              const ld = 10 + 15 * (0.5 + 0.5 * Math.sin(g.a * 3.7));
              g.lx = px + Math.cos(la) * ld;
              g.lz = pz + Math.sin(la) * ld;
              if (heightAt(g.lx, g.lz) < seaLevel - 0.35) g.mode = 1;
              else g.mTimer = 6;                     // shore below — try again soon
            }
          }
        }

        // wings, shared across the airborne modes: skewed-sine flap (fast
        // downstroke), lagging wrist, washout twist, glide dihedral + droop
        if (doFlap) {
          // irregular beat: the phase is accumulated, and now and then a bird
          // throws in a quick double-beat or holds the wings a moment
          const irr = Math.sin(t * 0.6 + g.flapF * 11.7);
          const rate = irr > 0.93 ? 1.8 : (irr < -0.95 ? 0.12 : 1.0);
          g.fph += dt * g.flapF * flapMul * rate;
          const ph = g.fph;
          let fc = Math.sin(ph);
          fc = fc >= 0 ? Math.pow(fc, 0.65) : -Math.pow(-fc, 1.5);
          const inner = 0.10 + 0.43 * glide + fc * flapAmp;
          wR.rotation.z = -inner;
          wL.rotation.z = inner;
          // wing-load bend: the wrist lag deepens through a full flap (the
          // outer wing rotates later on the loaded downstroke) and flattens
          // back out in a glide
          let lc = Math.sin(ph - (0.7 + 0.45 * (1 - glide)));
          lc = lc >= 0 ? Math.pow(lc, 0.65) : -Math.pow(-lc, 1.5);
          const outer = lc * flapAmp * (0.7 + 0.12 * (1 - glide)) - 0.31 * glide;
          const wash = 0.15 * Math.cos(ph) * (1 - glide);
          if (oR) { oR.rotation.z = -outer; oR.rotation.x = wash; }
          if (oL) { oL.rotation.z = outer; oL.rotation.x = wash; }
          if (head && g.mode === 0) head.rotation.x = -0.05 * fc * (1 - glide);
        } else {
          wR.rotation.z = -0.1;                      // tucked against the body
          wL.rotation.z = 0.1;
          if (oR) { oR.rotation.z = -0.06; oR.rotation.x = 0; }
          if (oL) { oL.rotation.z = 0.06; oL.rotation.x = 0; }
        }
        // fold sweep: arms and hands swing back along the body on the water,
        // easing out again through the takeoff run (0 in normal flight)
        wR.rotation.y = -0.8 * g.fold;
        wL.rotation.y = 0.8 * g.fold;
        if (oR) oR.rotation.y = -1.5 * g.fold;
        if (oL) oL.rotation.y = 1.5 * g.fold;
        // feet: tucked in flight (base pose rot.x = 0.22), dropped through the
        // landing flare; outside the descent the flare eases back to tucked
        if (g.mode !== 1) g.flare = Math.max(0, g.flare - dt * 2.5);
        const feet = mesh.userData.feet;
        if (feet) {
          const fr = 0.22 - 1.25 * g.flare;
          feet[0].rotation.x = fr;
          feet[1].rotation.x = fr;
        }
      }
    }

    function dispose() {
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose && o.geometry.dispose();
        if (o.material) {
          const mm = Array.isArray(o.material) ? o.material : [o.material];
          for (const m of mm) m.dispose && m.dispose();
        }
      });
    }

    // where the boat is (and which way she points), for the host's proximity
    // detail (HD ships, hero birds) and the tour minimap
    const _bp = { x: 0, y: 0, z: 0, heading: 0 };
    function boatPos() {
      _bp.x = px; _bp.y = rig.position.y; _bp.z = pz; _bp.heading = theta;
      return _bp;
    }

    // While the user is ashore (walking mode), the canoe waits moored at its last
    // position: it keeps bobbing on the swell but never touches the camera or the
    // paddle. The host calls this instead of update() so the boat reads as parked,
    // not frozen mid-stroke. px/pz/theta are retained, so resuming update() picks
    // up exactly where it left off (no spawn(), no teleport).
    function float(dt, t) {
      const w = waterAt(px, pz, t);
      const fx = -Math.sin(theta), fz = -Math.cos(theta);
      const pitch = (w.nx * fx + w.nz * fz) * 0.8;
      const sx = -fz, sz = fx;
      const roll = (w.nx * sx + w.nz * sz) * 0.8;
      rig.position.set(px, w.y + DRAFT, pz);
      rig.rotation.set(pitch, theta, roll, 'YXZ');
    }

    return { group, spawn, update, dispose, boatPos, float };
  }

  return { build };
};
