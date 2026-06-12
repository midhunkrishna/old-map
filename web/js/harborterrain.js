/* Carta Temporum — harborterrain module: the land the diorama stands on.
   A factory consumed by harbordiorama.js. From the surveyed coastline polygons
   it raises a real landmass: a heightfield draped over the island footprint —
   a gentle rise from the beach inland, with the named relief (Tortuga's
   turtle-back, Nassau's ridge, Havana's knolls, La Popa at Cartagena) folded in
   as gaussian hills. The terrain dips BELOW sea level just offshore, so a flat
   water sheet laid at the datum cuts a clean curved shoreline regardless of the
   grid — the intersection IS the coast. The slopes are coloured by height and
   slope (light sand at the shore → soil → grass → bare rock), with a bright
   wet-sand surf band right at the waterline. Water is a shader sheet: the swell
   math (three trains) ported from harbor3d.js's makeWaterLayer into a vertex
   shader, with a fresnel rim. Everything is in metres at the world origin, so
   it shares the diorama's { project, heightAt } frame. */
'use strict';

window.cartaTerrain = function cartaTerrain(THREE) {
  const D2RAD = Math.PI / 180;
  const M_PER_DEG_LAT = 110540;

  // Compact footprints read as hills; height spread over kilometres reads as
  // nothing. (Authoritative relief table — harbortown.js reads it for slope
  // tree-planting; was previously inlined there.)
  // The swell, in one place: the same trains/amplitude/mean the water vertex
  // shader uses (makeWater below), exposed as a CPU function so floating things
  // (anchored ships, the canoe) ride exactly in phase with the visible sheet.
  const W_UAMP = 0.34, W_UMEAN = -0.42;
  const W_TRAINS = [[58, 20, 1.1, 0.55], [27, 110, 1.9, 0.30], [13, 65, 3.1, 0.15]].map(
    ([lam, dir, om, w]) => ({
      kx: Math.cos(dir * Math.PI / 180) * 2 * Math.PI / lam,
      kz: Math.sin(dir * Math.PI / 180) * 2 * Math.PI / lam, om, w,
    }));
  function waterAt(x, z, t) {
    let h = 0, dx = 0, dz = 0;
    for (const k of W_TRAINS) {
      const ph = x * k.kx + z * k.kz + t * k.om;
      h += Math.sin(ph) * k.w;
      dx += Math.cos(ph) * k.w * k.kx;
      dz += Math.cos(ph) * k.w * k.kz;
    }
    return { y: W_UMEAN + W_UAMP * (h - 1.05), nx: -dx * W_UAMP, nz: -dz * W_UAMP };
  }

  const RIM = Math.exp(-2.6);
  function hillProfile(u, v) {                 // 0 at the rim → 1 at the peak
    const r2 = u * u + v * v;
    const base = (Math.exp(-r2 * 2.6) - RIM) / (1 - RIM);
    const rough = 1 + 0.16 * Math.sin(u * 6.3 + v * 2.1 + 1.7) + 0.1 * Math.sin(u * 2.9 - v * 7.7 + 0.6);
    return Math.max(0, base * rough);
  }
  const reliefH = (h) => Math.max(110, h * 4.5);

  function build(lands, hills, project, opts) {
    opts = opts || {};
    const seaLevel = 0;
    const SEABED = -34;          // how deep the seabed drops offshore
    const BEACH_RAMP = 240;      // metres inland over which the plain rises
    const BASE_INLAND = 7;       // height of the gentle inland plain (m)

    /* ----- projected coastline rings (metres, world frame) ----- */
    const rings = [];
    for (const f of (lands || [])) {
      const polys = f.geometry.type === 'MultiPolygon'
        ? f.geometry.coordinates : [f.geometry.coordinates];
      for (const poly of polys) {
        const outer = poly[0];
        if (!outer || outer.length < 4) continue;
        rings.push(outer.map(([lng, lat]) => { const p = project(lng, lat); return [p.x, p.z]; }));
      }
    }

    // signed distance to the nearest coastline: + inside land, − at sea.
    function segDist(ax, az, bx, bz, px, pz) {
      const dx = bx - ax, dz = bz - az;
      const l2 = dx * dx + dz * dz || 1e-9;
      let t = ((px - ax) * dx + (pz - az) * dz) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const cx = ax + t * dx, cz = az + t * dz;
      return Math.hypot(px - cx, pz - cz);
    }
    function nearestCoast(px, pz) {
      let d = Infinity;
      for (const r of rings) {
        for (let i = 0; i < r.length - 1; i++) {
          const s = segDist(r[i][0], r[i][1], r[i + 1][0], r[i + 1][1], px, pz);
          if (s < d) d = s;
        }
      }
      return d === Infinity ? 0 : d;
    }
    function inside(px, pz) {
      let win = false;
      for (const r of rings) {
        for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
          const xi = r[i][0], zi = r[i][1], xj = r[j][0], zj = r[j][1];
          if (((zi > pz) !== (zj > pz)) && (px < (xj - xi) * (pz - zi) / (zj - zi) + xi)) win = !win;
        }
      }
      return win;
    }

    /* ----- hills in metres about the world origin ----- */
    const hillSpecs = (hills || []).map((h) => {
      const c = project(h.c[0], h.c[1]);
      const th = (h.rot || 0) * D2RAD;
      return { cx: c.x, cz: c.z, rx: h.rx, ry: h.ry, cos: Math.cos(th), sin: Math.sin(th), H: reliefH(h.h) };
    });
    function hillsAt(x, z) {
      let y = 0;
      for (const h of hillSpecs) {
        const a = x - h.cx, b = -(z - h.cz);              // b = north component
        const u = (a * h.cos + b * h.sin) / h.rx;
        const v = (-a * h.sin + b * h.cos) / h.ry;
        if (u * u + v * v > 1.35) continue;
        y += hillProfile(u, v) * h.H;
      }
      return y;
    }

    // the single source of ground elevation
    function heightAt(x, z) {
      const d = inside(x, z) ? nearestCoast(x, z) : -nearestCoast(x, z);
      if (d <= 0) return Math.max(SEABED, d * 0.7);        // seabed, hidden by the sheet
      const plain = Math.min(BASE_INLAND, d * (BASE_INLAND / BEACH_RAMP));
      return plain + hillsAt(x, z);
    }

    /* ----- terrain mesh: a grid over the footprint bbox ----- */
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const r of rings) for (const [x, z] of r) {
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    if (!isFinite(minX)) { minX = -800; maxX = 800; minZ = -800; maxZ = 800; }
    const width = maxX - minX, depth = maxZ - minZ;
    const margin = Math.max(320, Math.max(width, depth) * 0.28);
    const x0 = minX - margin, x1 = maxX + margin, z0 = minZ - margin, z1 = maxZ + margin;
    const W = x1 - x0, D = z1 - z0;
    const step = Math.min(30, Math.max(9, Math.max(W, D) / 230));
    const nx = Math.max(2, Math.ceil(W / step)), nz = Math.max(2, Math.ceil(D / step));

    const geo = new THREE.PlaneGeometry(W, D, nx, nz);
    geo.rotateX(-Math.PI / 2);                              // into XZ, Y up
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, heightAt(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();

    // colour by height + slope, with a bright surf band at the waterline
    const nrm = geo.attributes.normal;
    const cols = new Float32Array(pos.count * 3);
    const C_SAND = new THREE.Color(0.85, 0.79, 0.62);
    const C_GRASS = new THREE.Color(0.42, 0.54, 0.28);
    const C_ROCK = new THREE.Color(0.54, 0.49, 0.40);
    const C_SEABED = new THREE.Color(0.30, 0.40, 0.40);
    const C_SURF = new THREE.Color(0.93, 0.90, 0.80);
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), slope = 1 - nrm.getY(i);
      if (y < -0.1) {
        tmp.copy(C_SEABED);
      } else {
        const g = smooth(0.8, 4.5, y);                            // inland greens quickly past the beach
        tmp.copy(C_SAND).lerp(C_GRASS, g);
        const rock = Math.min(1, smooth(70, 260, y) + slope * 0.7);
        tmp.lerp(C_ROCK, rock);
        const surf = smooth(1.1, -0.1, y) * smooth(-1.0, 0.15, y);   // wet-sand surf, tight to the waterline
        tmp.lerp(C_SURF, surf * 0.8);
      }
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    // Standard material so the diorama's image-based lighting (PMREM) reads on
    // the land — rough, non-metal; the engraved hill cloth is the detail map.
    const landMat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: hillTexture(), roughness: 0.96, metalness: 0.0,
    });
    const mesh = new THREE.Mesh(geo, landMat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;

    /* ----- water: a shader sheet with the ported swell + fresnel rim ----- */
    const water = makeWater(Math.max(W, D));

    const group = new THREE.Group();
    group.add(water, mesh);

    return {
      group, mesh, water, heightAt, seaLevel, waterAt,
      update(t) { water.material.uniforms.uTime.value = t; },
      dispose() { geo.dispose(); landMat.dispose(); water.geometry.dispose(); water.material.dispose(); },
    };
  }

  /* ---------- engraved hill cloth (hachures), reused from harbortown ---------- */
  let _hillTex = null;
  function hillTexture() {
    if (_hillTex) return _hillTex;
    const c = document.createElement('canvas');
    c.width = 512; c.height = 512;
    const x = c.getContext('2d');
    x.fillStyle = '#e8e4d6'; x.fillRect(0, 0, 512, 512);   // near-neutral, so vertex colours drive the hue
    x.strokeStyle = 'rgba(70,55,34,0.10)'; x.lineWidth = 1;
    for (let i = 0; i < 700; i++) {                 // sparse hachures, the engraver's tooth
      const px = Math.random() * 512, py = Math.random() * 512, l = 4 + Math.random() * 6;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + l * 0.4, py + l); x.stroke();
    }
    _hillTex = new THREE.CanvasTexture(c);
    _hillTex.wrapS = _hillTex.wrapT = THREE.RepeatWrapping;
    _hillTex.repeat.set(5, 5);
    return _hillTex;
  }

  /* ---------- water sheet ---------- */
  function makeWater(span) {
    const size = span * 5.5;                 // run the sheet out to the horizon line
    const seg = Math.min(200, Math.max(40, Math.round(size / 22)));
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);

    // three swell trains (wavelength m, bearing°, omega, weight) — the math
    // from harbor3d.js makeWaterLayer, here in 1/metre directly (no mercator).
    const kv = [[58, 20, 1.1, 0.55], [27, 110, 1.9, 0.30], [13, 65, 3.1, 0.15]].map(
      ([lam, dir, om, w]) => new THREE.Vector4(
        Math.cos(dir * Math.PI / 180) * 2 * Math.PI / lam,
        Math.sin(dir * Math.PI / 180) * 2 * Math.PI / lam, om, w));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: 0.34 },
        uMean: { value: -0.42 },             // sit just below the datum; crests stay below the beach
        uK: { value: kv },
        uDeep: { value: new THREE.Color(0x2c5a72) },
        uRim: { value: new THREE.Color(0x9fd0e0) },
        uOpacity: { value: 0.9 },
        uShine: { value: 0 },                // 0 = matte; 1 = reflections + sun glitter (Studio light)
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.37).normalize() },
        uSunCol: { value: new THREE.Color(0xffc15a) },  // golden-hour sun
      },
      vertexShader: `
        uniform float uTime, uAmp, uMean;
        uniform vec4 uK[3];
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main() {
          vec3 p = position;
          float h = 0.0, dx = 0.0, dz = 0.0;
          for (int i = 0; i < 3; i++) {
            float ph = p.x * uK[i].x + p.z * uK[i].y + uTime * uK[i].z;
            h  += sin(ph) * uK[i].w;
            dx += cos(ph) * uK[i].w * uK[i].x;
            dz += cos(ph) * uK[i].w * uK[i].y;
          }
          p.y = uMean + uAmp * (h - 1.05);          // keep the whole crest below the beach
          vNormal = normalize(vec3(-dx * uAmp, 1.0, -dz * uAmp));
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        precision highp float;
        uniform vec3 uDeep, uRim, uSunDir, uSunCol;
        uniform float uOpacity, uTime, uShine;
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main() {
          vec3 N = normalize(vNormal);
          vec3 V = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(V, N), 0.0), 3.0);
          vec3 col = mix(uDeep, uRim, clamp(fres, 0.0, 1.0));
          // a faint toon band on the rim for the engraved look
          col += smoothstep(0.6, 0.95, fres) * 0.08;
          // Studio light: a low golden sun reflected off the swell — a broad
          // warm sheen toward the sun, a sharp glitter the bloom turns to glow,
          // and a high-frequency shimmer. All tinted with the evening sun colour.
          if (uShine > 0.0) {
            vec3 L = normalize(uSunDir);
            vec3 H = normalize(L + V);
            float ndh = max(dot(N, H), 0.0);
            float spec = pow(ndh, 200.0);                 // sharp glitter
            float sheen = pow(ndh, 18.0);                 // broad golden wash
            float shim = 0.55 + 0.45 * sin(vWorld.x * 0.45 + uTime * 3.1) * sin(vWorld.z * 0.5 - uTime * 2.2);
            // a horizon glow that brightens toward the sun's azimuth
            float toSun = max(dot(normalize(vec3(V.x, 0.0, V.z)), normalize(vec3(-L.x, 0.0, -L.z))), 0.0);
            float glow = pow(toSun, 4.0) * fres;
            vec3 sun = uSunCol;
            col += uShine * sun * (spec * 3.2 * shim + sheen * 0.9 + glow * 0.7);
            // warm the deep water a touch and tip the rim toward gold
            col = mix(col, sun * 1.1, uShine * fres * 0.35);
          }
          gl_FragColor = vec4(col, uOpacity);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 1;
    return mesh;
  }

  return { build, HILLS: cartaTerrain.HILLS };
};

// Authoritative relief table (keyed by harbour); the diorama selects per port.
window.cartaTerrain.HILLS = {
  nassau: [{ c: [-77.335, 25.0705], rx: 950, ry: 430, h: 52, rot: 8 }],
  tortuga: [{ c: [-72.787, 20.058], rx: 1150, ry: 680, h: 165, rot: 12 }],
  havana: [
    { c: [-82.337, 23.146], rx: 460, ry: 240, h: 60, rot: -28 },
    { c: [-82.341, 23.150], rx: 250, ry: 150, h: 36, rot: -10 },
  ],
  cartagena: [{ c: [-75.535, 10.4185], rx: 520, ry: 230, h: 85, rot: -30 }],
};
