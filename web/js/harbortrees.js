/* Carta Temporum — harbortrees module: a level-of-detail tree field for the
   Living Harbour. The town builder (harbortown.js) emits a flat field of tree
   specs; this raises them the way game forests do (the SpeedTree model, ported
   to WebGL): near trees as full geometry, mid trees as a billboard cross, far
   trees as a single billboard sprite, and everything off-screen or beyond range
   culled out of the frame entirely. That lets the country carry an order of
   magnitude more trees than instancing them all would. Each frame the field is
   frustum-culled and distance-bucketed into InstancedMeshes whose live counts
   are rewritten — one draw call per tier per kind. Consumed by harbor3d.js.

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
  const VARNAMES = [].concat(VARIANTS.palm, VARIANTS.leaf, VARIANTS.scrub);
  function pickVariant(kind, r) {
    if (kind === 'palm') return r < 0.6 ? 'palmCoco' : 'palmRoyal';
    if (kind === 'scrub') return r < 0.55 ? 'scrubBush' : 'scrubMound';
    return r < 0.32 ? 'leafBroad' : r < 0.55 ? 'leafCanopy' : r < 0.76 ? 'leafSpread'
      : r < 0.92 ? 'leafColumn' : 'leafSnag';
  }

  function clump(r, sx, sy, sz, x, y, z, u, hiSeg) {
    return new THREE.SphereGeometry(r, u ? (hiSeg || 11) : 8, u ? 8 : 6)
      .scale(sx, sy, sz).translate(x, y, z);
  }

  function variantGeo(name, u) {
    const parts = [];
    if (name === 'palmCoco') {
      // a leaning coconut palm: curved trunk, two tiers of drooping fronds
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
        const fr = new THREE.ConeGeometry(0.42, u ? 3.6 : 3.0, u ? 6 : 4)
          .scale(1, 1, 0.3).translate(0, 1.8, 0);
        fr.rotateX(Math.PI / (i % 2 ? 2.05 : 2.55));
        fr.rotateY((i / nFr) * Math.PI * 2);
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
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.17, 0.3, 6.6, u ? 12 : 8, u ? 3 : 1).translate(0, 3.3, 0)));
      parts.push(new THREE.CylinderGeometry(0.14, 0.18, 1.0, u ? 10 : 7).translate(0, 7.0, 0)); // crownshaft, tinted
      const nFr = u ? 10 : 7;
      for (let i = 0; i < nFr; i++) {
        const fr = new THREE.ConeGeometry(0.38, u ? 3.2 : 2.7, u ? 6 : 4).scale(1, 1, 0.28).translate(0, 1.5, 0);
        fr.rotateX(Math.PI / (i % 2 ? 2.5 : 3.1));    // held higher than the coco
        fr.rotateY((i / nFr) * Math.PI * 2 + 0.3);
        fr.translate(0, 7.5, 0);
        parts.push(fr);
      }
    } else if (name === 'leafBroad') {
      // a broadleaf: stout trunk, boughs, an IRREGULAR clustered crown
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.17, 0.3, 2.8, u ? 12 : 7, u ? 3 : 1).translate(0, 1.4, 0)));
      const arms = u ? [-1, 1, -0.45, 0.6] : [-1, 1];
      for (const s of arms) {
        const b = new THREE.CylinderGeometry(0.07, 0.13, 1.9, u ? 7 : 5).translate(0, 0.95, 0);
        b.rotateZ(s * 0.7); b.rotateY(s * 1.3); b.translate(s * 0.4, 2.4, 0);
        parts.push(taggedTrunk(b));
      }
      parts.push(clump(1.5, 1, 0.85, 1, 0.2, 4.1, 0.1, u, 13));
      parts.push(clump(1.1, 1, 0.8, 1, -1.2, 3.5, 0.5, u));
      parts.push(clump(1.0, 1, 0.85, 1, 1.3, 3.4, -0.5, u));
      parts.push(clump(0.9, 1, 0.8, 1, 0.1, 3.2, -1.1, u));
      if (u) {
        parts.push(clump(0.8, 1, 0.8, 1, -0.5, 4.7, -0.4, u));
        parts.push(taggedTrunk(new THREE.CylinderGeometry(0.28, 0.46, 0.5, 9).translate(0, 0.25, 0)));
      }
    } else if (name === 'leafCanopy') {
      // a canopy giant (ceiba-like): tall clear trunk, flat stacked tiers
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.2, 0.42, 4.6, u ? 12 : 8, u ? 3 : 1).translate(0, 2.3, 0)));
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
    } else if (name === 'leafSpread') {
      // a spreading acacia: short forked trunk, one wide flat-topped crown
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.16, 0.3, 2.0, u ? 10 : 7).translate(0, 1.0, 0)));
      for (const s of [-1, 1]) {
        const limb = new THREE.CylinderGeometry(0.08, 0.15, 1.9, u ? 7 : 5).translate(0, 0.95, 0);
        limb.rotateZ(s * 0.85); limb.translate(s * 0.15, 1.9, 0);
        parts.push(taggedTrunk(limb));
      }
      parts.push(clump(1.9, 1.45, 0.42, 1.1, 0, 3.4, 0, u, 13));
      parts.push(clump(1.3, 1.3, 0.45, 1, -1.8, 3.1, 0.3, u));
      parts.push(clump(1.3, 1.3, 0.45, 1, 1.8, 3.15, -0.3, u));
      if (u) parts.push(clump(0.9, 1.2, 0.5, 1, 0.2, 3.0, 1.3, u));
    } else if (name === 'leafColumn') {
      // a column cypress: stacked narrowing cones, barely any trunk showing
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.1, 0.18, 0.9, u ? 9 : 6).translate(0, 0.45, 0)));
      const tiers = u ? 4 : 3;
      for (let i = 0; i < tiers; i++) {
        const r = 1.25 - i * (0.75 / tiers), h = 2.1, y = 0.8 + i * 1.45;
        parts.push(new THREE.ConeGeometry(r, h, u ? 10 : 7).translate(0, y + h / 2, 0));
      }
    } else if (name === 'leafSnag') {
      // a dead snag: bare silvered trunk and reaching branches, no crown
      parts.push(taggedTrunk(new THREE.CylinderGeometry(0.08, 0.26, 3.6, u ? 9 : 6, u ? 3 : 1).translate(0, 1.8, 0)));
      const nB = u ? 5 : 3;
      for (let i = 0; i < nB; i++) {
        const b = new THREE.CylinderGeometry(0.03, 0.08, 1.5 - i * 0.15, 5).translate(0, 0.7, 0);
        b.rotateZ(0.7 + (i % 2) * 0.4); b.rotateY(i * 2.2);
        b.translate(0, 1.6 + i * 0.5, 0);
        parts.push(taggedTrunk(b));
      }
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
    const idx = [];
    let vo = 0;
    for (const g of geos) {
      const p = g.attributes.position, nAttr = g.attributes.normal, uvAttr = g.attributes.uv;
      const isTrunk = !!g.userData.trunk;
      for (let i = 0; i < p.count; i++) {
        pos[(vo + i) * 3] = p.getX(i); pos[(vo + i) * 3 + 1] = p.getY(i); pos[(vo + i) * 3 + 2] = p.getZ(i);
        if (nAttr) { nor[(vo + i) * 3] = nAttr.getX(i); nor[(vo + i) * 3 + 1] = nAttr.getY(i); nor[(vo + i) * 3 + 2] = nAttr.getZ(i); }
        if (uvAttr) { uv[(vo + i) * 2] = uvAttr.getX(i); uv[(vo + i) * 2 + 1] = uvAttr.getY(i); }
        crown[vo + i] = isTrunk ? 0 : 1;
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
    out.setIndex(idx);
    return out;
  }

  // Trunk verts darken to bark; crown verts take the instanceColor tint — a
  // small patch on MeshLambertMaterial's shader.
  function foliageMat(tex) {
    const m = new THREE.MeshLambertMaterial(tex
      ? { map: tex, transparent: true, alphaTest: 0.42, side: THREE.DoubleSide }
      : {});
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute float isCrown;\nvarying float vCrown;\n'
        + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCrown = isCrown;');
      sh.fragmentShader = 'varying float vCrown;\n'
        + sh.fragmentShader.replace('#include <color_fragment>',
          '#include <color_fragment>\n  diffuseColor.rgb = mix(vec3(0.34,0.25,0.15), diffuseColor.rgb, vCrown);');
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
  }

  const _frustum = new THREE.Frustum();
  const _m = new THREE.Matrix4();
  const _rel = new THREE.Matrix4();
  const _sphere = new THREE.Sphere(new THREE.Vector3(), 0);
  let counts = { ultra: 0, near: 0, mid: 0, far: 0 };

  function update(arg) {
    if (!trees.length) return;
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
  }

  return {
    group,
    init,
    update,
    get stats() { return { total: trees.length, drawn: counts }; },
  };
};
