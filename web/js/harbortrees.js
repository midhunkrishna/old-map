/* Carta Temporum — harbortrees module: a level-of-detail tree field for the
   Living Harbour. The town builder (harbortown.js) emits a flat field of tree
   specs; this raises them the way game forests do (the SpeedTree model, ported
   to WebGL): near trees as full geometry, mid trees as a billboard cross, far
   trees as a single billboard sprite, and everything off-screen or beyond range
   culled out of the frame entirely. That lets the country carry an order of
   magnitude more trees than instancing them all would. Each frame the field is
   frustum-culled and distance-bucketed into InstancedMeshes whose live counts
   are rewritten — one draw call per tier per kind. Consumed by harbor3d.js.
   In the metric (diorama) frame the system also plants its own hill forests:
   a dense, deterministic scatter over every rise the terrain's heightAt
   reports above the coastal plain (see plantHillForest below).

   Frame convention (MapLibre custom layer / mercator): x = east, y = south,
   z = up (altitude). Near geometry is built Y-up and stood upright by the same
   ground matrix the town uses; billboards are built standing in the X–Z plane
   so they need only translate and scale (the app locks bearing to 0, so a
   billboard facing the fixed viewer never has to spin). */
'use strict';

window.cartaTreeSystem = function cartaTreeSystem(THREE, arg) {
  // Dual frame: the diorama injects a metric { project, heightAt } and drives
  // update(camera); the legacy map-embedded path passes the MapLibre `map` and
  // drives update(matrix). In the diorama the camera orbits freely, so the
  // billboards must turn to face it (a vertex-shader billboard, below).
  const metric = !!(arg && typeof arg.project === 'function');
  const frame = metric ? arg : null;
  const map = metric ? null : arg;
  let NEAR = 280, MID = 780, FAR = 2400;              // distance bands, metres
  const ULTRA = 130;                                  // hero band: max-poly trees (diorama/tour)
  const CAP = metric
    ? { ultra: 400, near: 2500, mid: 16000, far: 60000 } // near is high-poly → tighter cap
    : { near: 3000, mid: 7000, far: 20000 };          // per-band visible budget
  // The diorama camera orbits well back from the island, so scale the bands to
  // its footprint: the whole wood reads as billboards at rest, near trees turn
  // to geometry as you dolly in.
  if (metric && frame.radius) {
    const R = frame.radius;
    NEAR = Math.max(160, R * 0.16);
    MID = Math.max(650, R * 0.55);
    FAR = Math.max(3000, R * 6);
  }

  // metric ground frame (matches harbortown/harbordiorama: Y/Z swap + −Y flip)
  const SWAP = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
  function groundMatM(x, y, z, ang, scale) {
    return new THREE.Matrix4().makeTranslation(x, y, z).multiply(SWAP)
      .multiply(new THREE.Matrix4().makeScale(scale, -scale, scale))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeRotationY(ang));
  }
  // an upright quad whose base sits at the instance origin (camera-faced in shader)
  function billboardQuad() { return new THREE.PlaneGeometry(9, 12).translate(0, 6, 0); }
  // camera-facing billboard: position from the instance translation, orient to
  // the view's right/up so the card always faces the orbiting camera.
  function billboardMat(tex) {
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.42, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
        vec3 ip = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        float scl = length(instanceMatrix[0].xyz);
        vec3 vRight = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 vUp = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 wp = ip + (vRight * position.x + vUp * position.y) * scl;
        vec4 mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
    };
    return m;
  }

  /* ---------- painted billboard sprites ---------- */
  function spriteTex(kind) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 64, 64);
    x.fillStyle = '#5a3f28';                            // trunk
    if (kind !== 'scrub') x.fillRect(30, 38, 4, 24);
    x.fillStyle = '#ffffff';                            // crown (tinted per instance)
    if (kind === 'palm') {
      x.save();
      x.translate(32, 24);
      for (let i = 0; i < 9; i++) {
        x.rotate((Math.PI * 2) / 9);
        x.beginPath();
        x.moveTo(0, 0);
        x.quadraticCurveTo(12, -5, 22, 3);
        x.quadraticCurveTo(11, 3, 0, 0);
        x.fill();
      }
      x.beginPath(); x.arc(0, 0, 4, 0, Math.PI * 2); x.fill();
      x.restore();
    } else {
      const cy = kind === 'scrub' ? 46 : 26;
      const rr = kind === 'scrub' ? 14 : 18;
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        x.beginPath();
        x.arc(32 + Math.cos(a) * rr * 0.6, cy + Math.sin(a) * rr * 0.45, rr * 0.5, 0, Math.PI * 2);
        x.fill();
      }
      x.beginPath(); x.arc(32, cy, rr * 0.8, 0, Math.PI * 2); x.fill();
    }
    x.globalCompositeOperation = 'source-atop';        // a little engraved shade
    const g = x.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(20,30,12,0.5)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 2;
    return tex;
  }

  // Mild, slight green variation — several base hues per kind, each jittered a
  // touch in hue and lightness, so no two trees match.
  const PALETTES = {
    palm: [0x4f6b34, 0x5c7a3e, 0x6b8347, 0x577039],
    leaf: [0x556b30, 0x647a3a, 0x707f48, 0x4e6a33, 0x6d8a4a],
    scrub: [0x6a7445, 0x788550, 0x5f6d3e, 0x83905c],
  };
  function tintColor(kind, t) {
    const pal = PALETTES[kind] || PALETTES.leaf;
    const base = new THREE.Color(pal[(t * pal.length) | 0] || pal[0]);
    const hsl = {};
    base.getHSL(hsl);
    base.setHSL(
      hsl.h + ((t * 7) % 1 - 0.5) * 0.05,
      hsl.s,
      Math.max(0.18, Math.min(0.5, hsl.l + ((t * 13) % 1 - 0.5) * 0.08)),
    );
    return base;
  }

  /* ---------- geometries ----------
     Near tier built Y-up (stood upright by the ground matrix). Billboards
     built standing in X (width) × Z (height) at Y≈0, normal along Y. */
  function taggedTrunk(g) { g.userData.trunk = true; return g; }

  /* ---------- the variant wood ----------
     Nine silhouettes instead of three lollipops, mimicking how a real shore
     wood reads: coconut and royal palms, a broadleaf, a tiered canopy giant,
     a wide spreading acacia, a narrow column cypress, the odd dead snag, and
     two scrub forms. Each tree picks its variant from a stable position hash,
     so the mix is spread evenly and never flickers. `u` = the ultra (hero)
     build for the band right around the camera. */
  const VARIANTS = {
    palm: ['palmCoco', 'palmRoyal'],
    leaf: ['leafBroad', 'leafCanopy', 'leafSpread', 'leafColumn', 'leafSnag'],
    scrub: ['scrubBush', 'scrubMound'],
  };
  // 'forestBlob' is the hill-cover workhorse: never picked by pickVariant,
  // only assigned by the hill-forest pass below.
  const VARNAMES = [].concat(VARIANTS.palm, VARIANTS.leaf, VARIANTS.scrub, ['forestBlob']);
  function pickVariant(kind, r) {
    if (kind === 'palm') return r < 0.6 ? 'palmCoco' : 'palmRoyal';
    if (kind === 'scrub') return r < 0.55 ? 'scrubBush' : 'scrubMound';
    return r < 0.32 ? 'leafBroad' : r < 0.55 ? 'leafCanopy' : r < 0.76 ? 'leafSpread'
      : r < 0.92 ? 'leafColumn' : 'leafSnag';
  }

  // A foliage lobe: a low-poly icosphere displaced by deterministic trig
  // noise (seeded from its own placement, so no two lobes share a silhouette
  // and rebuilds never flicker). Polyhedron geometry is non-indexed, so the
  // recomputed normals come out faceted — the painterly low-poly read.
  // Each vertex carries a `shade` channel: a top-lit gradient plus per-lobe
  // brightness jitter, which the foliage shader turns into colour variation
  // (sun-struck upper lobes lighter and warmer, undersides in shadow).
  function clump(r, sx, sy, sz, x, y, z, u, hiSeg) {
    const seed = x * 12.9898 + y * 78.233 + z * 37.719 + r * 9.13;
    const det = u ? (hiSeg ? 2 : 1) : (hiSeg ? 1 : 0);
    const g = new THREE.IcosahedronGeometry(r, det);
    const p = g.attributes.position;
    const shade = new Float32Array(p.count);
    let lj = Math.sin(seed * 43.7585) * 1000;
    lj -= Math.floor(lj);                              // per-lobe jitter in [0,1)
    const lobeShade = 0.88 + lj * 0.26;
    // unit vector from this lobe back toward the bole axis (for interior AO)
    const od = Math.hypot(x, z);
    const ix = od > 0.2 ? -x / od : 0, iz = od > 0.2 ? -z / od : 0;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i) / r, vy = p.getY(i) / r, vz = p.getZ(i) / r;
      // two octaves of cheap trig noise — lumpy and irregular, never smooth
      const n = Math.sin(vx * 2.9 + seed) + Math.sin(vy * 2.3 + seed * 1.7)
        + Math.sin(vz * 3.3 + seed * 0.6) + 0.5 * Math.sin((vx - vz) * 5.1 + seed * 2.3);
      const k = 1 + 0.085 * n;
      // gravity sag: the fringe of every lobe droops, so the crown stops
      // reading as a cluster of balloons (sag grows toward the lobe equator)
      const hd = vx * vx + vz * vz;
      p.setXYZ(i, vx * r * k, vy * r * k - r * 0.16 * hd, vz * r * k);
      // interior occlusion: faces turned in toward the trunk/crown core sit
      // in each other's shadow — an ambient-occlusion-ish vertex darkening
      const occ = Math.max(0, vx * ix + vz * iz) + Math.max(0, -vy) * 0.35;
      shade[i] = (lobeShade * (0.78 + 0.34 * (vy * 0.5 + 0.5)) + 0.06 * vx)
        * (1 - 0.17 * Math.min(1.3, occ));
    }
    g.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
    g.computeVertexNormals();
    return g.scale(sx, sy, sz).translate(x, y, z);
  }

  // A branch reaching from a fork point out to a foliage lobe — the visible
  // wood between clumps that sells the crown as a built thing.
  function limbTo(fx, fy, fz, tx, ty, tz, r0, r1, seg) {
    const dx = tx - fx, dy = ty - fy, dz = tz - fz;
    const L = Math.hypot(dx, dy, dz) || 1;
    const g = new THREE.CylinderGeometry(r1, r0, L, seg || 5).translate(0, L / 2, 0);
    g.applyQuaternion(new THREE.Quaternion()
      .setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L)));
    g.translate(fx, fy, fz);
    return taggedTrunk(g);
  }

  // The root flare: a short splayed collar where the trunk meets the ground,
  // so trees stop looking like poles stuck in the sand.
  function rootFlare(r, seg, x, z) {
    return taggedTrunk(new THREE.CylinderGeometry(r, r * 1.9, r * 1.6, seg)
      .translate(x || 0, r * 0.8, z || 0));
  }

  // A sparse leaf skirt: lone quads hung just below the canopy fringe (hero
  // tier only), so the silhouette trails off in soft scraps instead of ending
  // on a clean ball. Both windings are emitted (front-lit material).
  function addSkirt(parts, cx, cy, cz, R, seed, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + seed;
      const h1 = Math.abs(Math.sin(seed * 91.7 + i * 37.3));
      const h2 = Math.abs(Math.sin(seed * 53.1 + i * 17.9));
      const q = new THREE.PlaneGeometry(0.55 + h2 * 0.4, 0.4 + h1 * 0.3)
        .rotateX(-0.5 - h1 * 0.6)
        .rotateY(a + 1.57 + (h2 - 0.5))
        .translate(cx + Math.cos(a) * R * (0.85 + h1 * 0.35),
          cy - 0.3 - h2 * 0.9,
          cz + Math.sin(a) * R * (0.85 + h1 * 0.35));
      const back = q.clone();
      back.index.array.reverse();                      // flipped winding
      const bn = back.attributes.normal;
      for (let j = 0; j < bn.count; j++) bn.setXYZ(j, -bn.getX(j), -bn.getY(j), -bn.getZ(j));
      parts.push(q, back);
    }
  }

  // A palm frond: a tapering strip drooping along a parabola, its edges
  // notched into leaflets and the blade folded into a shallow keel. Built
  // rising from the origin along +Y; the local +Z curl becomes droop once
  // the callers rotateX it outward. Both windings are emitted so the thin
  // blade reads from above and below without a DoubleSide material.
  function frondGeo(len, droop, segs) {
    const st = [];
    const maxW = len * 0.17;
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = t * len, zc = droop * t * t * len;
      let w = maxW * (1 - t) * (0.35 + 2.6 * t);
      if (w > maxW) w = maxW;
      if (i % 2) w *= 0.55;                            // leaflet notches
      st.push([[-w, y, zc + w * 0.18], [0, y, zc - w * 0.3], [w, y, zc + w * 0.18]]);
    }
    const pos = [];
    const quad = (a, b, c, d) => {
      for (const tri of [[a, b, c], [a, c, d]]) {
        for (const v of tri) pos.push(v[0], v[1], v[2]);
        for (const v of [tri[0], tri[2], tri[1]]) pos.push(v[0], v[1], v[2]);
      }
    };
    for (let i = 0; i < segs; i++) {
      quad(st[i][0], st[i][1], st[i + 1][1], st[i + 1][0]);
      quad(st[i][1], st[i][2], st[i + 1][2], st[i + 1][1]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }

  function variantGeo(name, u) {
    const parts = [];
    if (name === 'palmCoco') {
      // a leaning coconut palm: curved trunk, two tiers of drooping fronds
      parts.push(rootFlare(0.36, u ? 9 : 6));
      let px = 0;
      for (let s = 0; s < 3; s++) {
        const seg = new THREE.CylinderGeometry(0.3 - s * 0.05, 0.34 - s * 0.05, 1.9, u ? 12 : 7)
          .translate(0, 0.95, 0).rotateZ(-0.07 - s * 0.05).translate(px, s * 1.8, 0);
        px += (0.13 + s * 0.09);
        parts.push(taggedTrunk(seg));
      }
      const cx = px + 0.1, cy = 5.5;
      const nFr = u ? 12 : 8;
      for (let i = 0; i < nFr; i++) {
        // curved, notched fronds — heavy droop on the coco
        const fr = frondGeo((u ? 3.7 : 3.1) * (0.92 + (i % 3) * 0.07),
          0.3 + (i % 3) * 0.06, u ? 6 : 2);
        fr.rotateX(Math.PI / (i % 2 ? 2.15 : 2.7));
        fr.rotateY((i / nFr) * Math.PI * 2 + (i % 3) * 0.13);
        fr.translate(cx, cy, 0);
        parts.push(fr);
      }
      if (u) {
        for (let i = 0; i < 4; i++) {
          parts.push(taggedTrunk(new THREE.SphereGeometry(0.17, 8, 6)
            .translate(cx + Math.cos(i * 1.9) * 0.3, cy - 0.32, Math.sin(i * 1.9) * 0.3)));
        }
        parts.push(taggedTrunk(new THREE.CylinderGeometry(0.34, 0.22, 0.5, 9).translate(cx, cy - 0.2, 0)));
      }
    } else if (name === 'palmRoyal') {
      // a royal palm: tall straight pale trunk, green crownshaft, upswept crown
      parts.push(rootFlare(0.32, u ? 9 : 6));
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.17, 0.3, 6.6, u ? 12 : 8, u ? 3 : 1).translate(0, 3.3, 0)));
      parts.push(new THREE.CylinderGeometry(0.14, 0.18, 1.0, u ? 10 : 7).translate(0, 7.0, 0)); // crownshaft, tinted
      const nFr = u ? 10 : 7;
      for (let i = 0; i < nFr; i++) {
        // upswept crown: shallower droop than the coco, notched all the same
        const fr = frondGeo((u ? 3.3 : 2.8) * (0.94 + (i % 2) * 0.08),
          0.2 + (i % 2) * 0.05, u ? 6 : 2);
        fr.rotateX(Math.PI / (i % 2 ? 2.5 : 3.1));    // held higher than the coco
        fr.rotateY((i / nFr) * Math.PI * 2 + 0.3);
        fr.translate(0, 7.5, 0);
        parts.push(fr);
      }
    } else if (name === 'leafBroad') {
      // a broadleaf: stout leaning trunk, boughs, an IRREGULAR clustered crown
      parts.push(rootFlare(0.3, u ? 9 : 6));
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.17, 0.3, 2.8, u ? 12 : 7, u ? 3 : 1)
        .translate(0, 1.4, 0).rotateZ(0.05)));
      const arms = u ? [-1, 1, -0.45, 0.6] : [-1, 1];
      for (const s of arms) {
        const b = new THREE.CylinderGeometry(0.07, 0.13, 1.9, u ? 7 : 5).translate(0, 0.95, 0);
        b.rotateZ(s * 0.7); b.rotateY(s * 1.3); b.translate(s * 0.4, 2.4, 0);
        parts.push(taggedTrunk(b));
      }
      // crown lobes layered into vertical tiers (real canopies stratify, not
      // one smooth ball) with a couple of hash-dropped "gap" lobes on the hero
      // build so daylight shows through. [r, sy, x, y, z, hiSeg]
      const lobes = [
        [1.5, 0.85, 0.2, 4.1, 0.1, 1],
        [1.1, 0.8, -1.2, 3.5, 0.5, 0],
        [1.0, 0.85, 1.3, 3.4, -0.5, 0],
        [0.9, 0.8, 0.1, 3.2, -1.1, 0],
        [0.85, 0.8, 0.8, 4.4, 0.9, 0],
      ];
      if (u) lobes.push([0.8, 0.8, -0.5, 4.7, -0.4, 0], [0.7, 0.75, -0.9, 4.1, -0.9, 0]);
      for (let li = 0; li < lobes.length; li++) {
        const [lr, lsy, lx, ly, lz, hi] = lobes[li];
        // gap: drop a smaller upper lobe (hero only) → a light hole in the crown
        if (u && lr < 1.0 && hash2(lx * 10, lz * 10, 31) < 0.28) continue;
        const tierOff = li % 2 ? 0.24 : -0.12;       // alternate lobes tier up/down
        parts.push(clump(lr, 1, lsy, 1, lx, ly + tierOff, lz, u, hi ? 13 : 0));
      }
      // a bare twig breaking past the foliage line — real crowns never wrap
      // their limbs clean; the snapped branch sells the silhouette
      parts.push(limbTo(0.5, 3.7, 0.1, 2.9, 4.8, 0.8, 0.045, 0.012, 4));
      if (u) parts.push(limbTo(-0.9, 3.9, -0.3, -3.1, 4.5, -1.3, 0.045, 0.012, 4));
      if (u) {
        // wood showing between the clumps
        parts.push(limbTo(0, 2.6, 0, -1.2, 3.4, 0.5, 0.1, 0.05));
        parts.push(limbTo(0, 2.7, 0, 1.3, 3.3, -0.5, 0.1, 0.05));
        parts.push(limbTo(0, 2.8, 0, 0.1, 3.1, -1.1, 0.09, 0.04));
        addSkirt(parts, 0.1, 3.4, 0, 2.1, 3.1, 9);
      }
    } else if (name === 'leafCanopy') {
      // a canopy giant (ceiba-like): tall clear trunk, flat stacked tiers
      parts.push(rootFlare(0.42, u ? 9 : 6));
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.2, 0.42, 4.6, u ? 12 : 8, u ? 3 : 1)
        .translate(0, 2.3, 0).rotateZ(-0.04)));
      if (u) {                                       // buttress roots
        for (let i = 0; i < 4; i++) {
          const root = new THREE.CylinderGeometry(0.05, 0.3, 1.1, 5).translate(0, 0.5, 0)
            .rotateZ(0.5).rotateY(i * 1.57 + 0.4).translate(0, 0, 0);
          parts.push(taggedTrunk(root));
        }
      }
      parts.push(clump(2.6, 1, 0.3, 1, 0, 4.6, 0, u, 14));
      parts.push(clump(2.0, 1, 0.32, 1, 0.5, 5.5, 0.3, u));
      parts.push(clump(1.3, 1, 0.35, 1, -0.3, 6.3, -0.2, u));
      parts.push(clump(1.0, 1, 0.4, 1, -1.4, 5.1, 0.7, u));   // a ragged outrider tier
      // a dead spar punching out of the crown top — emergent giants always
      // carry one broken leader above the leaf line
      parts.push(limbTo(0.2, 6.0, 0, 1.1, 7.7, -0.6, 0.05, 0.012, 4));
      if (u) parts.push(limbTo(0, 4.8, 0, 3.4, 5.6, 1.0, 0.05, 0.014, 4));
      if (u) {
        parts.push(limbTo(0, 4.1, 0, 0.5, 5.4, 0.3, 0.1, 0.05));
        parts.push(limbTo(0, 4.3, 0, -0.3, 6.2, -0.2, 0.08, 0.04));
        parts.push(limbTo(0, 3.9, 0, -1.4, 5.0, 0.7, 0.08, 0.04));
        addSkirt(parts, 0, 4.7, 0, 2.9, 5.7, 10);
      }
    } else if (name === 'leafSpread') {
      // a spreading acacia: short forked trunk, one wide flat-topped crown
      parts.push(rootFlare(0.3, u ? 9 : 6));
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.16, 0.3, 2.0, u ? 10 : 7).translate(0, 1.0, 0)));
      for (const s of [-1, 1]) {
        const limb = new THREE.CylinderGeometry(0.08, 0.15, 1.9, u ? 7 : 5).translate(0, 0.95, 0);
        limb.rotateZ(s * 0.85); limb.translate(s * 0.15, 1.9, 0);
        parts.push(taggedTrunk(limb));
      }
      parts.push(clump(1.9, 1.45, 0.42, 1.1, 0, 3.4, 0, u, 13));
      parts.push(clump(1.3, 1.3, 0.45, 1, -1.8, 3.1, 0.3, u));
      parts.push(clump(1.3, 1.3, 0.45, 1, 1.8, 3.15, -0.3, u));
      parts.push(clump(1.0, 1.25, 0.45, 1, 0.9, 3.3, 0.9, u));
      // a bare horizontal twig running past the flat crown edge
      parts.push(limbTo(1.0, 3.3, -0.2, 4.4, 3.9, -0.9, 0.045, 0.012, 4));
      if (u) parts.push(limbTo(-1.0, 3.2, 0.3, -4.2, 4.1, 1.0, 0.045, 0.012, 4));
      if (u) {
        parts.push(clump(0.9, 1.2, 0.5, 1, 0.2, 3.0, 1.3, u));
        parts.push(limbTo(0.15, 2.6, 0, -1.8, 3.0, 0.3, 0.09, 0.04));
        parts.push(limbTo(0.15, 2.65, 0, 1.8, 3.05, -0.3, 0.09, 0.04));
        addSkirt(parts, 0, 3.1, 0, 2.7, 1.9, 10);
      }
    } else if (name === 'leafColumn') {
      // a column cypress: stacked narrowing lobes, lumpy, barely any trunk
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.1, 0.18, 0.9, u ? 9 : 6).translate(0, 0.45, 0)));
      const tiers = u ? 5 : 4;
      for (let i = 0; i < tiers; i++) {
        const r = 1.2 - i * (0.78 / tiers), y = 1.1 + i * 1.25;
        parts.push(clump(r, 1, 1.3, 1, (i % 2 ? 0.09 : -0.09), y, (i % 3 ? 0.07 : -0.07), u, i === 0));
      }
    } else if (name === 'leafSnag') {
      // a dead snag: bare silvered trunk and reaching branches, no crown
      parts.push(rootFlare(0.26, u ? 9 : 6));
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.08, 0.26, 3.6, u ? 9 : 6, u ? 3 : 1).translate(0, 1.8, 0)));
      const nB = u ? 5 : 3;
      for (let i = 0; i < nB; i++) {
        const b = new THREE.CylinderGeometry(0.03, 0.08, 1.5 - i * 0.15, 5).translate(0, 0.7, 0);
        b.rotateZ(0.7 + (i % 2) * 0.4); b.rotateY(i * 2.2);
        b.translate(0, 1.6 + i * 0.5, 0);
        parts.push(taggedTrunk(b));
      }
    } else if (name === 'forestBlob') {
      // the hill-forest workhorse: one short trunk, one displaced lobe —
      // under 100 verts in the near build, so thousands clothe the high
      // ground without denting the frame budget
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.13, 0.26, 2.4, 5).translate(0, 1.2, 0)));
      parts.push(clump(1.7, 1, 0.88, 1, 0, 3.2, 0, false, u));
    } else if (name === 'scrubMound') {
      // sea-grape mounds: several low domes hugging the sand
      parts.push(clump(1.0, 1.35, 0.55, 1.35, 0, 0.45, 0, u, 12));
      parts.push(clump(0.75, 1.25, 0.6, 1.25, 1.15, 0.38, 0.4, u));
      parts.push(clump(0.6, 1.2, 0.6, 1.2, -1.0, 0.32, -0.4, u));
      if (u) parts.push(clump(0.5, 1.2, 0.65, 1.2, 0.2, 0.3, 1.2, u));
    } else {                                          // scrubBush
      parts.push(clump(1.0, 1.2, 0.7, 1.2, 0, 0.6, 0, u, 12));
      parts.push(clump(0.7, 1.1, 0.75, 1.1, 0.8, 0.45, 0.35, u));
      if (u) parts.push(clump(0.55, 1.1, 0.8, 1.1, -0.7, 0.4, -0.3, u));
      if (u) parts.push(taggedTrunk(new THREE.CylinderGeometry(0.05, 0.09, 0.5, 5).translate(0.1, 0.2, 0)));
    }
    return mergeGeos(parts);
  }

  // the legacy low build for the map-embedded (non-metric) path
  function nearGeo(kind) {
    if (kind === 'palm') {
      const trunk = new THREE.CylinderGeometry(0.16, 0.30, 5.4, 6).translate(0, 2.7, 0);
      trunk.rotateZ(-0.08);
      const crown = new THREE.ConeGeometry(2.4, 1.7, 8).translate(0.45, 5.6, 0);
      return mergeGeos([taggedTrunk(trunk), crown]);
    }
    if (kind === 'scrub') {
      return mergeGeos([new THREE.SphereGeometry(1.0, 7, 5).scale(1.2, 0.7, 1.2).translate(0, 0.6, 0)]);
    }
    const trunk = new THREE.CylinderGeometry(0.16, 0.26, 3.0, 6).translate(0, 1.5, 0);
    const crown = new THREE.SphereGeometry(2.0, 8, 6).scale(1, 0.88, 1).translate(0, 4.0, 0);
    return mergeGeos([taggedTrunk(trunk), crown]);
  }
  // Undergrowth: one fern/splat cross — two quads, 8 verts — scattered beneath
  // the shore-band canopy and along grove edges. Near-tier gated in update,
  // so the mass costs nothing until the camera is down among the trees.
  function undergrowthGeo() {
    const a = new THREE.PlaneGeometry(1.15, 0.75).translate(0, 0.34, 0).rotateX(-0.18);
    const b = a.clone().rotateY(Math.PI / 2);
    return mergeGeos([a, b]);
  }
  // Deadfall: a fallen log lying along X. Upward-facing verts take a share of
  // the instance tint (isCrown ≈ 0.55) — bark below, moss riding the top.
  function deadfallGeo() {
    const g = mergeGeos([taggedTrunk(
      new THREE.CylinderGeometry(0.14, 0.2, 4.0, 6, 1).rotateZ(Math.PI / 2).translate(0.3, 0.16, 0))]);
    const nor = g.attributes.normal, crown = g.attributes.isCrown;
    for (let i = 0; i < crown.count; i++) crown.setX(i, Math.max(0, nor.getY(i)) * 0.55);
    return g;
  }
  function billboardGeo(cross) {
    const make = () => {
      const g = new THREE.PlaneGeometry(9, 12);  // XY plane, +Z normal
      g.rotateX(Math.PI / 2);                    // → X×Z plane, +Y normal, height +Z
      g.translate(0, 0, 6);
      return g;
    };
    if (!cross) return mergeGeos([make()]);
    const b = make();
    b.rotateZ(Math.PI / 2);                       // second blade, crossed about the trunk
    return mergeGeos([make(), b]);
  }

  function mergeGeos(geos) {
    let vn = 0;
    for (const g of geos) vn += g.attributes.position.count;
    const pos = new Float32Array(vn * 3), nor = new Float32Array(vn * 3);
    const uv = new Float32Array(vn * 2), crown = new Float32Array(vn);
    const shade = new Float32Array(vn);
    const idx = [];
    let vo = 0;
    for (const g of geos) {
      const p = g.attributes.position, nAttr = g.attributes.normal, uvAttr = g.attributes.uv;
      const sAttr = g.attributes.shade;
      const isTrunk = !!g.userData.trunk;
      for (let i = 0; i < p.count; i++) {
        pos[(vo + i) * 3] = p.getX(i); pos[(vo + i) * 3 + 1] = p.getY(i); pos[(vo + i) * 3 + 2] = p.getZ(i);
        if (nAttr) { nor[(vo + i) * 3] = nAttr.getX(i); nor[(vo + i) * 3 + 1] = nAttr.getY(i); nor[(vo + i) * 3 + 2] = nAttr.getZ(i); }
        if (uvAttr) { uv[(vo + i) * 2] = uvAttr.getX(i); uv[(vo + i) * 2 + 1] = uvAttr.getY(i); }
        crown[vo + i] = isTrunk ? 0 : 1;
        // bark gets a streaky per-vertex tone (ridges of light and shadow
        // running round and up the bole); foliage carries its own shade attr
        shade[vo + i] = sAttr ? sAttr.getX(i)
          : isTrunk
            ? 0.88 + 0.13 * Math.sin(Math.atan2(p.getZ(i), p.getX(i)) * 3.0 + p.getY(i) * 1.7)
              + 0.06 * Math.sin(p.getY(i) * 5.3 + 1.1)
            : 1;
      }
      const index = g.index;
      if (index) for (let i = 0; i < index.count; i++) idx.push(vo + index.getX(i));
      else for (let i = 0; i < p.count; i++) idx.push(vo + i);
      vo += p.count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.setAttribute('isCrown', new THREE.BufferAttribute(crown, 1));
    out.setAttribute('shade', new THREE.BufferAttribute(shade, 1));
    out.setIndex(idx);
    return out;
  }

  // Trunk verts darken to bark; crown verts take the instanceColor tint — a
  // small patch on MeshLambertMaterial's shader. Crown verts also sway: a
  // faint wind shimmer, amplitude rising with height up the tree, phased by
  // the instance's world position so the wood never moves in lockstep.
  const windT = { value: 0 };
  function foliageMat(tex) {
    const m = new THREE.MeshLambertMaterial(tex
      ? { map: tex, transparent: true, alphaTest: 0.42, side: THREE.DoubleSide }
      : {});
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = windT;
      sh.vertexShader = 'attribute float isCrown;\nattribute float shade;\nuniform float uTime;\nvarying float vCrown;\nvarying float vShade;\nvarying float vBack;\n'
        + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCrown = isCrown;\n  vShade = shade;'
          + '\n  float swPh = uTime * 1.9 + instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.23;'
          + '\n  float swA = isCrown * max(position.y, 0.0) * 0.012;'
          + '\n  transformed.x += swA * (sin(swPh) + 0.4 * sin(swPh * 2.63 + position.y * 0.7));'
          + '\n  transformed.z += swA * 0.7 * sin(swPh * 0.81 + 1.7);'
          // backlit translucency: when the sun sits behind this crown relative
          // to the camera, leaves transmit light — a rim factor, strongest on
          // verts whose normal faces away from the eye (the far-side lobes)
          + '\n  vec3 bwp = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;'
          + '\n  vec3 bvd = normalize(cameraPosition - bwp);'
          + '\n  vec3 bwn = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);'
          + '\n  float bsun = clamp(-dot(bvd, normalize(vec3(0.6, 0.75, -0.8))), 0.0, 1.0);'
          + '\n  vBack = bsun * (0.35 + 0.65 * (1.0 - max(dot(bwn, bvd), 0.0)));');
      // crown verts: the per-lobe/top-lit shade scales brightness, and the
      // sun-struck lobes (shade > 1) drift warmer — painterly hue variation
      sh.fragmentShader = 'varying float vCrown;\nvarying float vShade;\nvarying float vBack;\n'
        + sh.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\n  diffuseColor.rgb = mix(vec3(0.34,0.25,0.15), diffuseColor.rgb, vCrown);'
          + '\n  diffuseColor.rgb *= vShade;'
          + '\n  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.1, 1.04, 0.72), clamp((vShade - 1.0) * 1.6, 0.0, 0.45) * vCrown);'
          // translucent lift toward warm leaf-green on backlit crowns — the
          // canopy stops reading as a solid painted ball against the sun
          + '\n  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.74, 0.32), vBack * vCrown * clamp(vShade, 0.0, 1.15) * 0.34);');
    };
    return m;
  }

  /* ---------- build ---------- */
  // The group rides at the map centre so instance matrices stay relative
  // (small) — absolute mercator baked into a float32 instance buffer cancels
  // catastrophically on the GPU and the forest crawls as the camera moves.
  const group = new THREE.Group();
  group.matrixAutoUpdate = false;
  const KINDS = ['palm', 'leaf', 'scrub'];
  const tiers = { ultra: {}, near: {}, mid: {}, far: {} };
  const BANDS = metric ? ['ultra', 'near', 'mid', 'far'] : ['near', 'mid', 'far'];
  let trees = [];
  // hill-forest dressing (metric path only): understory ferns + fallen logs
  const UNDER_CAP = 1500, LOG_CAP = 80;
  const under = [], logs = [];
  let underMesh = null, logMesh = null;
  let siteLat = null;                  // harbour latitude, from the field centroid

  function makeTier(name, geo, mat, cap) {
    const im = new THREE.InstancedMesh(geo, mat, cap);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.count = 0;
    im.frustumCulled = false;        // we cull per instance ourselves
    im.renderOrder = name === 'far' ? 1 : 0;
    group.add(im);
    return im;
  }

  function init(field) {
    const sprites = { palm: spriteTex('palm'), leaf: spriteTex('leaf'), scrub: spriteTex('scrub') };
    if (metric) {
      // geometry tiers per VARIANT (nine silhouettes); billboards per base kind
      for (const v of VARNAMES) {
        tiers.near[v] = makeTier('near', variantGeo(v, false), foliageMat(null), CAP.near);
        tiers.ultra[v] = makeTier('ultra', variantGeo(v, true), foliageMat(null), CAP.ultra);
      }
      for (const k of KINDS) {
        tiers.mid[k] = makeTier('mid', billboardQuad(), billboardMat(sprites[k]), CAP.mid);
        tiers.far[k] = makeTier('far', billboardQuad(), billboardMat(sprites[k]), CAP.far);
      }
      underMesh = makeTier('near', undergrowthGeo(), foliageMat(null), UNDER_CAP);
      underMesh.material.side = THREE.DoubleSide;      // thin splats read both ways
      logMesh = makeTier('near', deadfallGeo(), foliageMat(null), LOG_CAP);
      // the harbour's latitude steers the species mix (palmier in the tropics)
      if (field.length) siteLat = field.reduce((s, t) => s + t.lngLat[1], 0) / field.length;
    } else {
      for (const k of KINDS) {
        tiers.near[k] = makeTier('near', nearGeo(k), foliageMat(null), CAP.near);
        tiers.mid[k] = makeTier('mid', billboardGeo(true), foliageMat(sprites[k]), CAP.mid);
        tiers.far[k] = makeTier('far', billboardGeo(false), foliageMat(sprites[k]), CAP.far);
      }
    }
    if (metric) { group.matrix.identity(); group.matrixWorldNeedsUpdate = true; }
    trees = field.map((t) => {
      const kind = KINDS.includes(t.kind) ? t.kind : 'leaf';
      const color = tintColor(t.kind, t.tint);
      if (metric) {
        const p = frame.project(t.lngLat[0], t.lngLat[1]);
        const y = (frame.heightAt ? frame.heightAt(p.x, p.z) : 0) + (t.y || 0);
        const gm = groundMatM(p.x, y, p.z, Math.random() * Math.PI * 2, t.scale);
        // per-specimen silhouette: a stable position hash leans the bole a few
        // degrees and stretches/squashes the whole tree, so no two instances
        // of a variant share an outline (breaks the round-blob read).
        let sh = (Math.sin(p.x * 3.917 + p.z * 9.721) * 17731.33) % 1;
        if (sh < 0) sh += 1;
        gm.multiply(new THREE.Matrix4().makeRotationZ((sh - 0.5) * 0.09))
          .multiply(new THREE.Matrix4().makeScale(
            0.94 + ((sh * 7.31) % 1) * 0.12,
            0.88 + sh * 0.26,
            0.94 + ((sh * 13.7) % 1) * 0.12));
        const bm = new THREE.Matrix4().makeTranslation(p.x, y, p.z)
          .multiply(new THREE.Matrix4().makeScale(t.scale, t.scale, t.scale));
        // a stable per-tree rank in [0,1) for distance-gated reveal (#1)
        const rank = (Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453) % 1;
        // an INDEPENDENT position hash picks the silhouette, so every variant
        // appears at every reveal distance
        let vr = (Math.sin(p.x * 7.131 + p.z * 3.713) * 24634.6345) % 1;
        if (vr < 0) vr += 1;
        return { gm, bm, px: p.x, py: y, pz: p.z, kind, variant: pickVariant(kind, vr),
          color, rank: rank < 0 ? rank + 1 : rank };
      }
      const mc = maplibregl.MercatorCoordinate.fromLngLat(t.lngLat, 0);
      const s = mc.meterInMercatorCoordinateUnits();
      const yOff = t.y || 0;          // hill trees sit up their slope
      const gm = new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z)
        .scale(new THREE.Vector3(s, -s, s))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeTranslation(0, yOff, 0))
        .multiply(new THREE.Matrix4().makeRotationY(Math.random() * Math.PI * 2))
        .multiply(new THREE.Matrix4().makeScale(t.scale, t.scale, t.scale));
      const bm = new THREE.Matrix4()
        .makeTranslation(mc.x, mc.y, mc.z + yOff * s)
        .scale(new THREE.Vector3(s * t.scale, s * t.scale, s * t.scale));
      return { gm, bm, x: mc.x, y: mc.y, kind, color };
    });
    if (metric && frame.heightAt) plantHillForest();
  }

  // a stable position hash in [0,1) — seeded per use so streams don't correlate
  function hash2(x, z, s) {
    const v = Math.sin(x * 127.1 + z * 311.7 + s * 74.7) * 43758.5453;
    return v - Math.floor(v);
  }

  /* ---------- the hill forests ----------
     The town field plants the plain; the high ground arrived dotted. This
     pass clothes the hills in dense low-poly forest by sampling the live
     frame.heightAt over the island disc at init (no baked hill shape — the
     terrain can change under us). It follows real coastal hillsides:
     broadleaf forest on the lower slopes, scrub taking over with altitude,
     a bare-rock band at the steep summits; groves clump with clearings
     between (low-frequency noise mask), concave gullies pack denser and
     convex spurs thinner (heightAt curvature), cliffs stay bare (heightAt
     slope), and trees shrink slightly as they climb. The mass is the
     <100-vert forestBlob + kind billboards in the mid/far tiers; only the
     low fringe near the shore (the canoe path) keeps full silhouettes.
     Everything is deterministic position hash — rebuilds never flicker. */
  function plantHillForest() {
    under.length = 0; logs.length = 0;       // idempotent across re-inits
    const H = frame.heightAt, R = (frame.radius || 600) * 1.15;
    const HILL_MIN = 8.5;                      // the coastal plain tops out at ~7 m
    // coarse prepass: peak height + hill footprint area, to size the grid
    let maxH = HILL_MIN + 1, hillCells = 0;
    const cs = Math.max(12, R / 40);
    for (let gx = -R; gx <= R; gx += cs) {
      for (let gz = -R; gz <= R; gz += cs) {
        const h = H(gx, gz);
        if (h > maxH) maxH = h;
        if (h > HILL_MIN) hillCells++;
      }
    }
    if (maxH < HILL_MIN + 6) return;           // no hills worth foresting
    const TARGET = 6000, MAXHILL = 8000;       // instance budget for the cover
    const area = hillCells * cs * cs;          // m² of high ground
    const step = Math.min(16, Math.max(5, Math.sqrt(area * 0.5 / TARGET)));
    const d = step;                            // finite-difference reach
    const zone = (maxH - HILL_MIN) || 1;
    // species mix per harbour: latitude seeds the palm/scrub/broadleaf ratio
    // (field centroid when known, else a stable per-harbour hash), so Nassau
    // reads palmier than Charleston without any per-town data
    const lat = siteLat == null ? hash2(R, maxH, 42) * 44 - 22 : siteLat;
    const tropic = Math.max(0, Math.min(1, (30 - Math.abs(lat)) / 14));
    // per-harbour cover: a stable hash off the hill itself runs some islands
    // nearly full forest and others patchy meadow — identical cover on every
    // town reads as artificial as identical trees did
    const coverBias = 0.55 + hash2(maxH * 3.7, R * 0.013, 51) * 0.6;
    const palmShare = 0.05 + 0.4 * tropic;
    const scrubBase = 0.25 + 0.08 * (1 - tropic);
    // Sun azimuth in the ground plane (frame x=east, z=south): slopes whose
    // uphill gradient faces the sun read drier/yellower, shaded gullies deeper.
    const SUN_AZ_X = 0.6, SUN_AZ_Z = -0.8;
    // Low-frequency dry/lush field (~50–70 m wavelength): breaks the single
    // hillside hue into species/moisture patches — the #1 distance-realism
    // driver. Returns ≈[-1,1]; >0 dry/scrubby, <0 lush gully.
    const dryField = (x, z) =>
      0.5 * (Math.sin(x * 0.018 + Math.sin(z * 0.011) * 1.3)
        + Math.sin(z * 0.015 - Math.sin(x * 0.009) * 1.3));
    // Per-instance canopy colour: palette jitter, then pushed yellow-olive on
    // dry/sun-facing ground and deep blue-green in shaded gullies, mixing the
    // low-frequency field with slope aspect (uphill gradient vs sun azimuth).
    const canopyTint = (kind, x, z, gx, gz) => {
      const c = tintColor(kind, hash2(x, z, 10));
      const hsl = {}; c.getHSL(hsl);
      const gl = Math.hypot(gx, gz) || 1e-3;
      const aspect = ((gx / gl) * SUN_AZ_X + (gz / gl) * SUN_AZ_Z) * Math.min(1, gl * 6);
      const dry = Math.max(-1, Math.min(1, dryField(x, z) + aspect * 0.7));
      c.setHSL(
        hsl.h - dry * (dry > 0 ? 0.07 : 0.05),
        Math.max(0.12, Math.min(0.6, hsl.s - dry * 0.05)),
        Math.max(0.14, Math.min(0.52, hsl.l + dry * 0.06)),
      );
      return c;
    };
    let planted = 0, outliers = 0;
    // plant one hill tree (and its understory); `edge` trees run smaller —
    // a graded fringe instead of a hard grove wall. `gx,gz` = local uphill
    // gradient (for colour aspect); `big` raises an emergent canopy giant.
    const put = (x, y, z, e, edge, gx, gz, big, stunt) => {
      const kr = hash2(x, z, 4);
      const palmP = palmShare * Math.max(0, 1 - e / 0.35); // palms hug the low ground
      const dry = dryField(x, z);
      // krummholz (stunt): always scrub — wind-pruned mats above the treeline
      const kind = stunt ? 'scrub' : kr < palmP ? 'palm'
        // dry patches grow scrubbier — a second foliage type interleaved in
        : kr < palmP + scrubBase + e * 0.6 + Math.max(0, dry) * 0.22 ? 'scrub' : 'leaf';
      const variant = kind === 'palm' ? pickVariant('palm', hash2(x, z, 5))
        : kind === 'scrub' ? pickVariant('scrub', hash2(x, z, 5))
          : big ? 'leafCanopy'              // emergent: a real silhouette poking up
            : (e < 0.12 && hash2(x, z, 6) < 0.18) ? pickVariant('leaf', hash2(x, z, 5))
              : 'forestBlob';
      const scale = (0.85 + hash2(x, z, 7) * 0.5) * (1 - 0.32 * e)
        * (edge ? 0.84 : 1) * (big ? 1.4 : 1) * (stunt ? 0.55 : 1);
      const gm = groundMatM(x, y, z, hash2(x, z, 8) * Math.PI * 2, scale);
      const sh = hash2(x, z, 9);             // per-specimen lean + stretch
      gm.multiply(new THREE.Matrix4().makeRotationZ((sh - 0.5) * 0.09))
        .multiply(new THREE.Matrix4().makeScale(
          0.94 + ((sh * 7.31) % 1) * 0.12,
          0.88 + sh * 0.26,
          0.94 + ((sh * 13.7) % 1) * 0.12));
      const bm = new THREE.Matrix4().makeTranslation(x, y, z)
        .multiply(new THREE.Matrix4().makeScale(scale, scale, scale));
      // hill cover must read as forest even from the widest framing, so
      // every rank sits below the minimum reveal fraction (0.45)
      trees.push({ gm, bm, px: x, py: y, pz: z, kind, variant,
        color: canopyTint(kind, x, z, gx || 0, gz || 0), rank: hash2(x, z, 11) * 0.44 });
      // undergrowth: 1–2 fern splats under the canopy, shore band only — the
      // stretch of forest the canoe tour actually passes through
      if (e < 0.25 && under.length < UNDER_CAP) {
        const n = 1 + (hash2(x, z, 15) < 0.45 ? 1 : 0);
        for (let i = 0; i < n && under.length < UNDER_CAP; i++) {
          const ua = hash2(x, z, 16 + i * 2) * Math.PI * 2;
          const ud = 0.9 + hash2(x, z, 17 + i * 2) * 1.9;
          const ux = x + Math.cos(ua) * ud, uz = z + Math.sin(ua) * ud;
          const uy = H(ux, uz);
          if (uy < HILL_MIN * 0.5) continue;
          const uc = tintColor('leaf', hash2(ux, uz, 20)).multiplyScalar(0.55);
          under.push({ m: groundMatM(ux, uy, uz, hash2(ux, uz, 21) * Math.PI * 2,
            0.5 + hash2(ux, uz, 22) * 0.55), px: ux, py: uy, pz: uz, color: uc });
        }
      }
    };
    for (let gx = -R; gx <= R && planted < MAXHILL; gx += step) {
      for (let gz = -R; gz <= R && planted < MAXHILL; gz += step) {
        const x = gx + (hash2(gx, gz, 1) - 0.5) * step * 1.7;
        const z = gz + (hash2(gx, gz, 2) - 0.5) * step * 1.7;
        const y = H(x, z);
        if (y < HILL_MIN) continue;
        const e = Math.min(1, (y - HILL_MIN) / (zone * 0.92)); // 0 foot → 1 summit
        const hE = H(x + d, z), hW = H(x - d, z), hN = H(x, z + d), hS = H(x, z - d);
        const slope = Math.hypot(hE - hW, hN - hS) / (2 * d);
        if (slope > 1.1) continue;             // cliff faces stay bare rock
        // ragged upper treeline: the cut altitude wanders ±15% spatially, so
        // the forest never stops along a contour line. Above it, no forest —
        // only patchy krummholz: stunted wind-pruned scrub hugging the rock.
        const tl = 0.86 * (1 + 0.15 * Math.sin(x * 0.016 + Math.sin(z * 0.021) * 1.8));
        if (e > tl) {
          const kpatch = Math.sin(x * 0.045 + Math.sin(z * 0.033) * 1.6)
            + Math.sin(z * 0.05 + x * 0.012);
          if (kpatch > 0.6 && hash2(x, z, 33) < 0.3) {
            put(x, y, z, e, true, hE - hW, hN - hS, false, true);
            planted++;
          }
          continue;
        }
        const lap = (hE + hW + hN + hS - 4 * y) / (d * d); // + gully, − spur
        // grove mask: low-frequency trig noise → clumped woods with clearings;
        // a second, higher octave roughens the grove line so edges stay
        // ragged, and the lower base widens the clearings (patchy, not
        // uniformly stubbled)
        const m = Math.sin(x * 0.021 + Math.sin(z * 0.017) * 1.7)
          + Math.sin(z * 0.027 + Math.sin(x * 0.013) * 1.7)
          + 0.5 * Math.sin(x * 0.063 - z * 0.051)
          + 0.35 * Math.sin(x * 0.11 + z * 0.087 + Math.sin(z * 0.041) * 2.2);
        let density = (0.78 + 0.3 * m) * coverBias;
        density *= 1 - 0.7 * e * e;            // the forest thins with altitude
        density *= Math.max(0.2, 1 - slope * 0.5);
        density += Math.max(-0.3, Math.min(0.35, lap * 9));
        const r3 = hash2(x, z, 3);
        if (r3 > density) {
          // just past the grove line: rarely seed a standalone outlier 5–15 m
          // beyond the wood, the way real forests trail off tree by tree
          if (r3 < density + 0.05 && outliers < 160 && hash2(x, z, 12) < 0.22) {
            const oa = hash2(x, z, 13) * Math.PI * 2;
            const od = 5 + hash2(x, z, 14) * 10;
            const ox = x + Math.cos(oa) * od, oz = z + Math.sin(oa) * od;
            const oy = H(ox, oz);
            if (oy > HILL_MIN) {
              put(ox, oy, oz, Math.min(1, (oy - HILL_MIN) / (zone * 0.92)), true,
                H(ox + d, oz) - H(ox - d, oz), H(ox, oz + d) - H(ox, oz - d));
              outliers++; planted++;
            }
          }
          continue;
        }
        // a mask value near the threshold means the neighbourhood density is
        // dropping — this tree stands at the grove edge (cheap edge proxy).
        // deep, dense cells rarely raise an emergent giant (~5%, clustered) so
        // the canopy line breaks against the sky instead of running flat.
        const emergent = density - r3 > 0.34 && e < 0.7 && hash2(x, z, 30) < 0.05;
        put(x, y, z, e, density - r3 < 0.16, hE - hW, hN - hS, emergent);
        planted++;
        // deadfall: a rare mossy log in the deep grove interior
        if (density - r3 > 0.3 && e < 0.7 && logs.length < LOG_CAP && hash2(x, z, 23) < 0.025) {
          const lx = x + (hash2(x, z, 24) - 0.5) * 3, lz = z + (hash2(x, z, 25) - 0.5) * 3;
          const lc = tintColor('leaf', hash2(lx, lz, 26)).multiplyScalar(0.7); // moss tint
          logs.push({ m: groundMatM(lx, H(lx, lz), lz, hash2(lx, lz, 27) * Math.PI * 2,
            0.75 + hash2(lx, lz, 28) * 0.6), px: lx, py: H(lx, lz), pz: lz, color: lc });
        }
      }
    }
  }

  const _frustum = new THREE.Frustum();
  const _m = new THREE.Matrix4();
  const _rel = new THREE.Matrix4();
  const _sphere = new THREE.Sphere(new THREE.Vector3(), 0);
  let counts = { ultra: 0, near: 0, mid: 0, far: 0 };

  function update(arg) {
    if (!trees.length) return;
    windT.value = performance.now() * 0.001;   // drives the foliage shimmer
    if (metric) return updateMetric(arg);
    const matrix = arg;
    _m.fromArray(matrix);
    _frustum.setFromProjectionMatrix(_m);
    const cmc = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter(), 0);
    // ride the group at the centre; instance matrices are written relative to it
    group.matrix.makeTranslation(cmc.x, cmc.y, cmc.z);
    group.matrixWorldNeedsUpdate = true;
    const mpu = cmc.meterInMercatorCoordinateUnits();
    const near2 = (NEAR * mpu) ** 2, mid2 = (MID * mpu) ** 2, far2 = (FAR * mpu) ** 2;
    const rad = 8 * mpu;
    const idx = {
      near: { palm: 0, leaf: 0, scrub: 0 },
      mid: { palm: 0, leaf: 0, scrub: 0 },
      far: { palm: 0, leaf: 0, scrub: 0 },
    };
    for (const t of trees) {
      const dx = t.x - cmc.x, dy = t.y - cmc.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > far2) continue;
      _sphere.center.set(t.x, t.y, 0);
      _sphere.radius = rad;
      if (!_frustum.intersectsSphere(_sphere)) continue;
      const band = d2 < near2 ? 'near' : d2 < mid2 ? 'mid' : 'far';
      const i = idx[band][t.kind];
      if (i >= CAP[band]) continue;
      const tier = tiers[band][t.kind];
      _rel.copy(band === 'near' ? t.gm : t.bm);   // make it centre-relative
      _rel.elements[12] -= cmc.x;
      _rel.elements[13] -= cmc.y;
      _rel.elements[14] -= cmc.z;
      tier.setMatrixAt(i, _rel);
      tier.setColorAt(i, t.color);
      idx[band][t.kind] = i + 1;
    }
    for (const band of ['near', 'mid', 'far']) {
      for (const k of KINDS) {
        const tier = tiers[band][k];
        tier.count = idx[band][k];
        tier.instanceMatrix.needsUpdate = true;
        if (tier.instanceColor) tier.instanceColor.needsUpdate = true;
      }
    }
    counts = {
      near: idx.near.palm + idx.near.leaf + idx.near.scrub,
      mid: idx.mid.palm + idx.mid.leaf + idx.mid.scrub,
      far: idx.far.palm + idx.far.leaf + idx.far.scrub,
    };
  }

  // Diorama path: bucket by 3-D distance from the orbiting camera, frustum-cull,
  // and write small origin-relative matrices (no centre ride needed).
  function updateMetric(camera, camDist) {
    _m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    _frustum.setFromProjectionMatrix(_m);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    const ultra2 = ULTRA * ULTRA, near2 = NEAR * NEAR, mid2 = MID * MID, far2 = FAR * FAR;
    // #1 — reveal more of the field as the camera comes in: a fraction rising
    // from ~0.45 at the wide view to 1.0 close in, gating each tree by its rank.
    const R = frame.radius || 1500;
    const dCam = camDist || Math.hypot(cx, cy, cz);
    const reveal = Math.max(0.45, Math.min(1, 1 - (dCam - R * 0.4) / (R * 2.2) * 0.55));
    const idx = { ultra: {}, near: {}, mid: {}, far: {} };
    for (const v of VARNAMES) { idx.ultra[v] = 0; idx.near[v] = 0; }
    for (const k of KINDS) { idx.mid[k] = 0; idx.far[k] = 0; }
    for (const t of trees) {
      if (t.rank > reveal) continue;
      const dx = t.px - cx, dy = t.py - cy, dz = t.pz - cz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > far2) continue;
      _sphere.center.set(t.px, t.py + 6, t.pz);
      _sphere.radius = 9;
      if (!_frustum.intersectsSphere(_sphere)) continue;
      // right next to the camera (the canoe gliding past the shore) the tree
      // takes the hero geometry — max polygon count
      const band = d2 < ultra2 ? 'ultra' : d2 < near2 ? 'near' : d2 < mid2 ? 'mid' : 'far';
      const geomBand = band === 'ultra' || band === 'near';
      const key = geomBand ? t.variant : t.kind;     // geometry per variant, cards per kind
      const i = idx[band][key];
      if (i >= CAP[band]) continue;
      const tier = tiers[band][key];
      tier.setMatrixAt(i, geomBand ? t.gm : t.bm);
      tier.setColorAt(i, t.color);
      idx[band][key] = i + 1;
    }
    counts = { ultra: 0, near: 0, mid: 0, far: 0 };
    for (const band of BANDS) {
      const keys = (band === 'ultra' || band === 'near') ? VARNAMES : KINDS;
      for (const k of keys) {
        const tier = tiers[band][k];
        tier.count = idx[band][k];
        tier.instanceMatrix.needsUpdate = true;
        if (tier.instanceColor) tier.instanceColor.needsUpdate = true;
        counts[band] += idx[band][k];
      }
    }
    // hill-forest dressing: undergrowth lives only in the near band and logs
    // within the mid band, so the mass never costs at the wide framing
    if (underMesh) {
      let n = 0;
      for (const u of under) {
        const dx = u.px - cx, dy = u.py - cy, dz = u.pz - cz;
        if (dx * dx + dy * dy + dz * dz > near2) continue;
        _sphere.center.set(u.px, u.py + 0.4, u.pz);
        _sphere.radius = 1.4;
        if (!_frustum.intersectsSphere(_sphere)) continue;
        underMesh.setMatrixAt(n, u.m);
        underMesh.setColorAt(n, u.color);
        if (++n >= UNDER_CAP) break;
      }
      underMesh.count = n;
      underMesh.instanceMatrix.needsUpdate = true;
      if (underMesh.instanceColor) underMesh.instanceColor.needsUpdate = true;
      let nl = 0;
      for (const L of logs) {
        const dx = L.px - cx, dy = L.py - cy, dz = L.pz - cz;
        if (dx * dx + dy * dy + dz * dz > mid2) continue;
        _sphere.center.set(L.px, L.py + 0.3, L.pz);
        _sphere.radius = 2.6;
        if (!_frustum.intersectsSphere(_sphere)) continue;
        logMesh.setMatrixAt(nl, L.m);
        logMesh.setColorAt(nl, L.color);
        if (++nl >= LOG_CAP) break;
      }
      logMesh.count = nl;
      logMesh.instanceMatrix.needsUpdate = true;
      if (logMesh.instanceColor) logMesh.instanceColor.needsUpdate = true;
      counts.near += n + nl;
    }
  }

  return {
    group,
    init,
    update,
    get stats() { return { total: trees.length, drawn: counts }; },
  };
};
