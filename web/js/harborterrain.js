/* Carta Temporum — harborterrain module: the land the diorama stands on.
   A factory consumed by harbordiorama.js. From the surveyed coastline polygons
   it raises a real landmass: a heightfield draped over the island footprint —
   a gentle rise from the beach inland, with the named relief (Tortuga's
   turtle-back, Nassau's ridge, Havana's knolls, La Popa at Cartagena) folded in
   as ridged, spurred hills with off-centre summits and concave footslopes. The terrain dips BELOW sea level just offshore, so a flat
   water sheet laid at the datum cuts a clean curved shoreline regardless of the
   grid — the intersection IS the coast. The slopes are coloured by height and
   slope (light sand at the shore → soil → grass → bare rock), with a bright
   wet-sand surf band right at the waterline. Water is a shader sheet: the swell
   math (three trains) ported from harbor3d.js's makeWaterLayer into a vertex
   shader, with a fresnel rim, a baked shore-distance field driving a shallows
   gradient and an animated foam band, and a strandline of instanced rocks,
   driftwood, dune grass and shells dressing the beach. Everything is in metres
   at the world origin, so it shares the diorama's { project, heightAt } frame. */
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

  // Deterministic position hash, the strand/canoe recipe — shared by the
  // colour mottling, the strandline scatter and the outcrop placement.
  const hash01 = (a, b) => { const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return h - Math.floor(h); };

  const RIM = Math.exp(-2.6);
  // Real coastal hills are not gaussian domes: they are stacks of spurs and
  // drainages around an off-centre summit — steep on one face, a long shoulder
  // on the other, convex at the shoulder, concave where the footslope feathers
  // into the plain. All of that here, deterministically from the hill's own
  // seed; still 0 at the rim → ~1 at the peak, so the charted reliefH rules.
  function hillProfile(u, v, s) {
    s = s || 0;
    // domain warp: bend every contour line so no slice is a perfect ellipse
    const wu = u + 0.13 * Math.sin(v * 3.1 + s * 5.0) + 0.06 * Math.sin(v * 7.7 - s * 2.3);
    const wv = v + 0.13 * Math.sin(u * 2.7 - s * 3.7) + 0.06 * Math.sin(u * 8.3 + s * 1.9);
    const r2 = wu * wu + wv * wv;
    let base = (Math.exp(-r2 * 2.6) - RIM) / (1 - RIM);
    if (base <= 0) return 0;
    base = base * base * (3 - 2 * base);           // convex shoulder, concave footslope
    const env = base * (1 - base) * 4;             // mid-slope only: summit and plain stay put
    // spur ridges with gullies between them, radiating down from the summit
    const a = Math.atan2(wv, wu);
    const spur = Math.cos(a * 5.0 + s * 11.0) * 0.6 + Math.cos(a * 3.0 - s * 7.0) * 0.4;
    // three octaves of ridged noise: sharp crests, rounded drainages
    const rg = (1 - Math.abs(Math.sin(wu * 4.7 + wv * 3.1 + s * 9.0))) * 0.50
             + (1 - Math.abs(Math.sin(wu * 9.7 - wv * 7.3 - s * 4.0))) * 0.32
             + (1 - Math.abs(Math.sin(wu * 18.9 + wv * 15.1 + s * 6.0))) * 0.18;
    // asymmetry: one face drops away steep, the opposite runs out long
    const tilt = 1 + 0.2 * (wu * Math.cos(s * 3.3) + wv * Math.sin(s * 3.3));
    // the warp can hold base > 0 out to the cull radius — fade on the TRUE
    // radius so the footslope reaches exactly 0 before hillsAt stops summing
    const ft = Math.max(0, Math.min(1, (1.30 - u * u - v * v) / 0.30));
    return Math.max(0, base * tilt * (1 + env * (spur * 0.16 + (rg - 0.55) * 0.55))) * ft * ft * (3 - 2 * ft);
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
    function nearestBrute(px, pz) {
      let d = Infinity;
      for (const r of rings) {
        for (let i = 0; i < r.length - 1; i++) {
          const s = segDist(r[i][0], r[i][1], r[i + 1][0], r[i + 1][1], px, pz);
          if (s < d) d = s;
        }
      }
      return d === Infinity ? 0 : d;
    }
    // Exact uniform-grid spatial bin over the coast segments (vertex_d_psp.md §3.2):
    // a ring-expanding search with a conservative lower-bound early-exit. It examines
    // a SUBSET of segments but is guaranteed to find the true minimum, so the returned
    // distance is bit-identical to the brute force — heightAt is unchanged, no prop
    // moves (§0.4 corollary). Test 24(d) proves the equality. The 4× density bake in
    // Phase 1 makes nearestCoast hot, hence the index.
    let coastBin = null;
    function buildCoastBin() {
      const segs = [];
      let minx = Infinity, minz = Infinity, maxx = -Infinity, maxz = -Infinity;
      for (const r of rings) {
        for (let i = 0; i < r.length - 1; i++) {
          const ax = r[i][0], az = r[i][1], bx = r[i + 1][0], bz = r[i + 1][1];
          segs.push([ax, az, bx, bz]);
          minx = Math.min(minx, ax, bx); maxx = Math.max(maxx, ax, bx);
          minz = Math.min(minz, az, bz); maxz = Math.max(maxz, az, bz);
        }
      }
      if (!segs.length) return null;
      const n = Math.max(1, Math.round(Math.sqrt(segs.length)));
      const cw = (maxx - minx) / n || 1, ch = (maxz - minz) / n || 1;
      const gi = (x) => Math.max(0, Math.min(n - 1, Math.floor((x - minx) / cw)));
      const gj = (z) => Math.max(0, Math.min(n - 1, Math.floor((z - minz) / ch)));
      const cells = new Map();
      for (let s = 0; s < segs.length; s++) {
        const [ax, az, bx, bz] = segs[s];
        const i0 = gi(Math.min(ax, bx)), i1 = gi(Math.max(ax, bx));
        const j0 = gj(Math.min(az, bz)), j1 = gj(Math.max(az, bz));
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
          const k = i * n + j; let a = cells.get(k); if (!a) { a = []; cells.set(k, a); } a.push(s);
        }
      }
      return { segs, n, cw, ch, gi, gj, cells, cell: Math.min(cw, ch) };
    }
    function nearestBinned(px, pz) {
      const B = coastBin;
      const ci = B.gi(px), cj = B.gj(pz);
      let best = Infinity;
      const seen = new Set();
      for (let rad = 0; rad <= B.n; rad++) {
        if (rad > 0 && (rad - 1) * B.cell > best) break;   // no closer segment possible
        for (let i = ci - rad; i <= ci + rad; i++) {
          for (let j = cj - rad; j <= cj + rad; j++) {
            if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== rad) continue;   // ring only
            if (i < 0 || j < 0 || i >= B.n || j >= B.n) continue;
            const arr = B.cells.get(i * B.n + j); if (!arr) continue;
            for (const s of arr) {
              if (seen.has(s)) continue; seen.add(s);
              const g = B.segs[s];
              const dd = segDist(g[0], g[1], g[2], g[3], px, pz);
              if (dd < best) best = dd;
            }
          }
        }
      }
      return best === Infinity ? 0 : best;
    }
    function nearestCoast(px, pz) { return coastBin ? nearestBinned(px, pz) : nearestBrute(px, pz); }
    // opts.bruteForceCoast (test-only escape hatch) forces the O(segments) path so
    // test 24(d) can prove the bin returns bit-identical distances.
    coastBin = (opts && opts.bruteForceCoast) ? null : buildCoastBin();
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
      return {
        cx: c.x, cz: c.z, rx: h.rx, ry: h.ry, cos: Math.cos(th), sin: Math.sin(th),
        H: reliefH(h.h), s: hash01(c.x * 0.013, c.z * 0.017) * 6.283,   // per-hill seed
      };
    });
    function hillsAt(x, z) {
      let y = 0;
      for (const h of hillSpecs) {
        const a = x - h.cx, b = -(z - h.cz);              // b = north component
        const u = (a * h.cos + b * h.sin) / h.rx;
        const v = (-a * h.sin + b * h.cos) / h.ry;
        if (u * u + v * v > 1.35) continue;
        y += hillProfile(u, v, h.s) * h.H;
      }
      return y;
    }

    // the single source of ground elevation
    function heightAt(x, z) {
      const d = inside(x, z) ? nearestCoast(x, z) : -nearestCoast(x, z);
      if (d <= 0) return Math.max(SEABED, d * 0.7);        // seabed, hidden by the sheet
      const plain = Math.min(BASE_INLAND, d * (BASE_INLAND / BEACH_RAMP));
      // berm: the high-tide step — a low storm-swash terrace where the wet
      // sand ends (~16-26 m inland), the beach's one sharp break in grade
      const bt = Math.min(1, Math.max(0, (d - 16) / 10));
      const berm = bt * bt * (3 - 2 * bt) * 0.3;
      return plain + berm + hillsAt(x, z);
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
    // Phase 1 density win (vertex_d_psp.md): a ~460² grid (~423k tris, one static
    // draw) so the berm reads in geometry and shoreline facets halve at canoe level.
    // The coast bin pays for the 4× heightAt bake.
    const step = Math.min(16, Math.max(4.5, Math.max(W, D) / 460));
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
    const C_SCRUB = new THREE.Color(0.53, 0.51, 0.28);        // dry dusty scrub
    const C_ROCK = new THREE.Color(0.54, 0.49, 0.40);
    const C_CRAG = new THREE.Color(0.63, 0.59, 0.51);         // pale broken stone
    const C_SEABED = new THREE.Color(0.30, 0.40, 0.40);
    const C_SURF = new THREE.Color(0.93, 0.90, 0.80);
    const C_PEBBLE = new THREE.Color(0.66, 0.60, 0.50);      // coarse berm shingle
    const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const tmp = new THREE.Color();
    const gw = nx + 1, gh = nz + 1;                          // grid dims, for the gully Laplacian
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i), slope = 1 - nrm.getY(i);
      const vx = pos.getX(i), vz = pos.getZ(i);
      if (y < -0.1) {
        tmp.copy(C_SEABED);
      } else {
        const g = smooth(0.8, 4.5, y);                            // inland greens quickly past the beach
        tmp.copy(C_SAND).lerp(C_GRASS, g);
        // scrub mottling: hashed dapples so the green band is never one flat hue
        const mot = hash01(Math.round(vx * 0.07), Math.round(vz * 0.07));
        tmp.lerp(C_SCRUB, g * mot * 0.5);
        // subtle elevation banding climbing the slopes — the engraver's contours
        tmp.multiplyScalar(1 - 0.05 * (0.5 + 0.5 * Math.sin(y * 0.5 + mot * 2.0)) * smooth(6, 40, y));
        // rock exposures: high ground, and especially the steep convex faces
        const rock = Math.min(1, smooth(70, 260, y) + slope * 0.7 + smooth(0.32, 0.55, slope) * 0.8);
        tmp.lerp(C_ROCK, rock);
        // the very steepest upper faces read as pale broken crag
        tmp.lerp(C_CRAG, smooth(0.45, 0.72, slope) * smooth(30, 110, y) * 0.65);
        // pebbly shingle along the berm crest — a coarser hashed tint band
        // riding the high-tide step the profile raises at ~0.5-1.1 m
        const peb = hash01(Math.round(vx * 0.45), Math.round(vz * 0.45));
        tmp.lerp(C_PEBBLE, smooth(0.45, 0.7, y) * smooth(1.35, 1.05, y) * (0.2 + peb * 0.4));
        // drainage shading: concave gullies (positive grid Laplacian) run a
        // shade darker, so the spur-and-gully relief reads at a distance
        const ix = i % gw, iz = (i / gw) | 0;
        if (ix > 0 && ix < gw - 1 && iz > 0 && iz < gh - 1 && y > 8) {
          const lap = pos.getY(i - 1) + pos.getY(i + 1) + pos.getY(i - gw) + pos.getY(i + gw) - 4 * y;
          tmp.multiplyScalar(1 - Math.min(1, Math.max(0, lap * 0.5)) * smooth(8, 30, y) * 0.12);
        }
        const surf = smooth(1.1, -0.1, y) * smooth(-1.0, 0.15, y);   // wet-sand surf, tight to the waterline
        tmp.lerp(C_SURF, surf * 0.8);
        // rippled tidal sand: hashed micro-troughs (a few cm of implied
        // relief, colour only — no geometry) darken thin bands in the wet
        // band, the look of sand the falling tide has combed
        const rphase = hash01(Math.round(vx * 0.22), Math.round(vz * 0.22));
        const rip = Math.sin(vx * 1.7 + vz * 1.2 + rphase * 6.28);
        tmp.multiplyScalar(1 - surf * Math.max(0, rip) * 0.09 * (0.6 + 0.4 * rphase));
      }
      cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));

    // Standard material so the diorama's image-based lighting (PMREM) reads on
    // the land — rough, non-metal; the engraved hill cloth is the detail map.
    const landMat = new THREE.MeshStandardMaterial({
      vertexColors: true, map: hillTexture(), roughness: 0.96, metalness: 0.0,
    });
    // Wet sand: a darkened, faintly reflective band just above the waterline
    // whose upper edge breathes with the SAME three swell trains the water
    // rides (constants baked from W_TRAINS, so the damp line follows the foam).
    // Fragment-side only — land vertices and colours stay put.
    const wetT = { value: 0 };
    const wetSwell = W_TRAINS.map((k) =>
      `sin(vWetW.x * ${k.kx.toFixed(8)} + vWetW.z * ${k.kz.toFixed(8)} + uWetT * ${k.om.toFixed(4)}) * ${k.w.toFixed(4)}`
    ).join(' + ');
    landMat.onBeforeCompile = (sh) => {
      sh.uniforms.uWetT = wetT;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', 'varying vec3 vWetW;\n#include <common>')
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\n  vWetW = (modelMatrix * vec4(position, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', 'varying vec3 vWetW;\nuniform float uWetT;\n#include <common>')
        .replace('#include <color_fragment>', `#include <color_fragment>
  float wetSwell = ${wetSwell};
  float wetReach = 0.28 + 0.26 * (0.5 + 0.5 * wetSwell);
  float wet = smoothstep(wetReach, 0.02, vWetW.y) * step(0.0, vWetW.y);
  diffuseColor.rgb *= 1.0 - wet * 0.26;`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.5, wet * 0.8);`);
    };
    const mesh = new THREE.Mesh(geo, landMat);
    mesh.receiveShadow = true;
    mesh.castShadow = true;

    /* ----- shore-distance field: signed metres to the coast, baked ----- */
    // One small texture answers "how far is the beach?" for every water
    // fragment: the shallows tint, depth gradient and shoreline foam band all
    // read it. 128² keeps the bake cheap next to the heightfield loop above.
    const SH_RES = 128, SH_RANGE = 90;
    const shData = new Uint8Array(SH_RES * SH_RES);
    for (let j = 0; j < SH_RES; j++) {
      const sz = z0 + (j + 0.5) / SH_RES * D;
      for (let i = 0; i < SH_RES; i++) {
        const sx = x0 + (i + 0.5) / SH_RES * W;
        const d = rings.length ? (inside(sx, sz) ? nearestCoast(sx, sz) : -nearestCoast(sx, sz)) : -SH_RANGE;
        shData[j * SH_RES + i] = Math.round((Math.min(1, Math.max(-1, d / SH_RANGE)) * 0.5 + 0.5) * 255);
      }
    }
    const shoreTex = new THREE.DataTexture(shData, SH_RES, SH_RES, THREE.RedFormat, THREE.UnsignedByteType);
    shoreTex.minFilter = THREE.LinearFilter; shoreTex.magFilter = THREE.LinearFilter;
    shoreTex.needsUpdate = true;

    /* ----- water: a shader sheet with the ported swell + fresnel rim ----- */
    const water = makeWater(Math.max(W, D), {
      tex: shoreTex, min: new THREE.Vector2(x0, z0), span: new THREE.Vector2(W, D), range: SH_RANGE,
    });

    /* ----- built-up mask: no surf rocks piled against masonry -----
       The shared structures registry (window.carta.harborStructures) carries
       the wharves, stone-quay canals, blocks and forts the town builder
       raises. Project their polylines once and keep strandline props a few
       metres clear — a beach doesn't strand cobbles against a quay wall. */
    const builtSegs = [];
    (function collectBuilt() {
      const S = (window.carta && window.carta.harborStructures) || null;
      if (!S) return;
      const hid = lands && lands[0] && lands[0].properties && lands[0].properties.harbor;
      const addLine = (pts) => {
        for (let i = 0; i < pts.length - 1; i++) {
          const a = project(pts[i][0], pts[i][1]), b = project(pts[i + 1][0], pts[i + 1][1]);
          builtSegs.push([a.x, a.z, b.x, b.z]);
        }
      };
      const walk = (c) => {            // LineString / Polygon / Multi* alike
        if (!Array.isArray(c) || !c.length) return;
        if (typeof c[0][0] === 'number') addLine(c); else c.forEach(walk);
      };
      for (const kind of ['wharves', 'canals', 'blocks', 'forts']) {
        for (const f of (S[kind] || [])) {
          if (hid && ((f.properties && f.properties.harbor) || f.harbor) !== hid) continue;
          if (f.geometry && f.geometry.coordinates) walk(f.geometry.coordinates);
        }
      }
    })();
    function nearBuilt(px, pz, r) {
      for (let i = 0; i < builtSegs.length; i++) {
        const s = builtSegs[i];
        if (segDist(s[0], s[1], s[2], s[3], px, pz) < r) return true;
      }
      return false;
    }

    /* ----- strandline dressing: what an ocean beach actually carries -----
       Walking up from the water: cobbles and boulders in the surf, a wrack
       line of shells and pebbles on the wet sand, bleached driftwood at the
       storm line, dry dune grass above the reach of the highest water (the
       canoe module already plants its own grass in the low 0–1.7 m band, so
       ours starts higher). Above that, the working foreshore's clutter: torn
       seaweed mounds, drying crab pots, worked mooring stones, coiled rope and
       rusted barrel hoops, broken spars and staves, a rare upturned rowboat,
       and dark tidepools where the boulder clusters trap the falling tide.
       All instanced, deterministically hashed from world position — same
       recipe as harborcanoe — so the strand never reshuffles. */
    const strand = [];
    for (const r of rings) {
      for (let i = 0; i < r.length - 1 && strand.length < 1500; i++) {
        const ax = r[i][0], az = r[i][1], bx = r[i + 1][0], bz = r[i + 1][1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-6) continue;
        let nx2 = -(bz - az) / len, nz2 = (bx - ax) / len;       // unit normal…
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        if (!inside(mx + nx2 * 6, mz + nz2 * 6)) { nx2 = -nx2; nz2 = -nz2; }  // …pointing inland
        for (let s = 4; s < len; s += 8) {
          const t = s / len;
          strand.push({ x: ax + (bx - ax) * t, z: az + (bz - az) * t, nx: nx2, nz: nz2 });
        }
      }
    }
    const rocks = [], logs = [], blades = [], shells = [], boulders = [], kelp = [],
      weeds = [], pots = [], moors = [], coils = [], debris = [], hulls = [], pools = [];
    for (const p of strand) {
      const h1 = hash01(p.x, p.z), h2 = hash01(p.z, p.x);
      const h3 = hash01(p.x + 7.3, p.z - 4.1), h4 = hash01(p.x - 13.7, p.z + 9.2);
      if (h1 < 0.28 && rocks.length < 220) {                 // surf cobbles + boulders
        const d = -2.5 + h2 * 12;
        const x = p.x + p.nx * d + (h3 - 0.5) * 5, z = p.z + p.nz * d + (h4 - 0.5) * 5;
        const y = heightAt(x, z);
        if (y > -1.5 && y < 1.0 && !nearBuilt(x, z, 15)) rocks.push({ x, z, y, a: h2, b: h3, c: h4 });
      } else if (h1 < 0.35 && logs.length < 44) {            // driftwood at the storm line
        const d = 9 + h2 * 21;
        const x = p.x + p.nx * d + (h3 - 0.5) * 6, z = p.z + p.nz * d + (h4 - 0.5) * 6;
        const y = heightAt(x, z);
        if (y > 0.2 && y < 2.4 && !nearBuilt(x, z, 12)) logs.push({ x, z, y, a: h2, b: h3, c: h4 });
      } else if (h1 < 0.60 && blades.length < 700) {         // dune grass above high water
        const d = 28 + h2 * 47;
        const x = p.x + p.nx * d + (h3 - 0.5) * 7, z = p.z + p.nz * d + (h4 - 0.5) * 7;
        const y = heightAt(x, z);
        if (y > 0.8 && y < 3.6 && !nearBuilt(x, z, 8)) for (let k = 0; k < 3; k++) {
          const ha = hash01(x + k * 3.1, z - k * 1.7), hb = hash01(z + k * 2.3, x + k * 5.9);
          blades.push({ x: x + (ha - 0.5) * 1.6, z: z + (hb - 0.5) * 1.6, y, a: ha, b: hb, c: h4 });
        }
      } else if (h1 < 0.76 && shells.length < 360) {         // the wrack line's shells and pebbles
        const d = 2 + h2 * 7;
        const x = p.x + p.nx * d, z = p.z + p.nz * d;
        const y = heightAt(x, z);
        if (y > 0.04 && y < 0.6 && !nearBuilt(x, z, 12)) for (let k = 0; k < 3; k++) {
          const ha = hash01(x - k * 4.7, z + k * 2.9), hb = hash01(z - k * 6.1, x - k * 3.3);
          shells.push({ x: x + (ha - 0.5) * 1.2, z: z + (hb - 0.5) * 1.2, y, a: ha, b: hb, c: h3 });
        }
      } else if (h1 < 0.795 && boulders.length < 48) {       // a rare boulder cluster
        const d = 1 + h2 * 9;
        const cx2 = p.x + p.nx * d, cz2 = p.z + p.nz * d;
        if (!nearBuilt(cx2, cz2, 18)) {
          const n = 3 + Math.floor(h3 * 3);
          for (let k = 0; k < n && boulders.length < 48; k++) {
            const ha = hash01(cx2 + k * 9.7, cz2 - k * 3.9), hb = hash01(cz2 + k * 4.3, cx2 + k * 8.1);
            const x = cx2 + (ha - 0.5) * 7, z = cz2 + (hb - 0.5) * 7;
            const y = heightAt(x, z);
            if (y > -2.0 && y < 1.6) boulders.push({ x, z, y, a: ha, b: hb, c: h4 });
          }
          // a dark still tidepool trapped at the cluster's foot
          const py = heightAt(cx2, cz2);
          if (py > 0.0 && py < 0.5 && pools.length < 40) pools.push({ x: cx2, z: cz2, y: py, a: h3, b: h4 });
        }
      } else if (h1 < 0.84 && kelp.length < 130) {           // dark kelp ribbons at the wrack line
        const d = 1.5 + h2 * 5;
        const x = p.x + p.nx * d + (h3 - 0.5) * 3, z = p.z + p.nz * d + (h4 - 0.5) * 3;
        const y = heightAt(x, z);
        if (y > 0.02 && y < 0.7 && !nearBuilt(x, z, 12)) kelp.push({ x, z, y, a: h2, b: h3, c: h4 });
      } else if (h1 < 0.875 && weeds.length < 90) {          // storm-torn seaweed mounds
        const d = 1 + h2 * 6;
        const x = p.x + p.nx * d + (h3 - 0.5) * 4, z = p.z + p.nz * d + (h4 - 0.5) * 4;
        const y = heightAt(x, z);
        if (y > 0.02 && y < 0.8 && !nearBuilt(x, z, 12)) weeds.push({ x, z, y, a: h2, b: h3, c: h4 });
      } else if (h1 < 0.90 && pots.length < 40) {            // wooden-slat crab pots drying
        const d = 8 + h2 * 16;
        const x = p.x + p.nx * d + (h3 - 0.5) * 5, z = p.z + p.nz * d + (h4 - 0.5) * 5;
        const y = heightAt(x, z);
        if (y > 0.4 && y < 2.6 && !nearBuilt(x, z, 10)) pots.push({ x, z, y, a: h2, b: h3, c: h4 });
      } else if (h1 < 0.92 && moors.length < 40) {           // worked mooring stones at the water's edge
        const d = 2 + h2 * 7;
        const x = p.x + p.nx * d, z = p.z + p.nz * d;
        const y = heightAt(x, z);
        if (y > 0.15 && y < 1.4 && !nearBuilt(x, z, 12)) moors.push({ x, z, y, a: h2, b: h3, c: h4 });
      } else if (h1 < 0.945 && coils.length < 56) {          // coiled rope high, barrel hoops lower
        const d = 6 + h2 * 18;
        const x = p.x + p.nx * d + (h3 - 0.5) * 5, z = p.z + p.nz * d + (h4 - 0.5) * 5;
        const y = heightAt(x, z);
        if (y > 0.3 && y < 2.6 && !nearBuilt(x, z, 9)) coils.push({ x, z, y, a: h2, b: h3, c: h4, hoop: h3 > 0.55 });
      } else if (h1 < 0.985 && debris.length < 60) {         // broken spars and barrel staves
        const d = 3 + h2 * 15;
        const x = p.x + p.nx * d + (h3 - 0.5) * 6, z = p.z + p.nz * d + (h4 - 0.5) * 6;
        const y = heightAt(x, z);
        if (y > 0.1 && y < 2.0 && !nearBuilt(x, z, 9)) debris.push({ x, z, y, a: h2, b: h3, c: h4 });
      } else if (hulls.length < 3 && h2 < 0.4) {             // a rare beached rowboat, keel up
        const d = 7 + h2 * 10;
        const x = p.x + p.nx * d, z = p.z + p.nz * d;
        const y = heightAt(x, z);
        if (y > 0.4 && y < 1.8 && !nearBuilt(x, z, 22)) hulls.push({ x, z, y, a: h2, b: h3, c: h4, nx: p.nx, nz: p.nz });
      }
    }
    /* ----- second strand pass: a working harbour's losses -----
       Salted hashes so the pass is independent of the first scatter: cork
       net-floats shed at the waterline, the odd washed-up barrel at the storm
       line, a lost cannonball half-sunk in the sand, and — the strand's set
       piece — one or two old wreck skeletons: rows of rotten rib frames
       arching out of the beach where a hull broke up long ago. */
    const corks = [], barrels = [], balls = [], ribs = [];
    for (const p of strand) {
      const g1 = hash01(p.x * 1.73 + 11.3, p.z * 1.31 - 7.7);
      const g2 = hash01(p.z * 2.11 - 3.9, p.x * 1.57 + 5.3);
      const g3 = hash01(p.x - 21.7, p.z + 17.9);
      if (g1 < 0.05 && corks.length < 70) {                // cork floats off a torn net
        const d = 1.5 + g2 * 6;
        const x = p.x + p.nx * d, z = p.z + p.nz * d;
        const y = heightAt(x, z);
        if (y > 0.05 && y < 0.8 && !nearBuilt(x, z, 10)) {
          const n = 2 + Math.floor(g3 * 3);
          for (let k = 0; k < n && corks.length < 70; k++) {
            const ha = hash01(x + k * 2.9, z + k * 6.1), hb = hash01(z - k * 4.3, x + k * 1.9);
            corks.push({ x: x + (ha - 0.5) * 1.4, z: z + (hb - 0.5) * 1.4, y, a: ha, b: hb });
          }
        }
      } else if (g1 < 0.064 && barrels.length < 8) {       // a washed-up barrel, staves sprung
        const d = 7 + g2 * 12;
        const x = p.x + p.nx * d + (g3 - 0.5) * 4, z = p.z + p.nz * d + (g3 - 0.5) * 4;
        const y = heightAt(x, z);
        if (y > 0.3 && y < 2.2 && !nearBuilt(x, z, 12)) barrels.push({ x, z, y, a: g2, b: g3 });
      } else if (g1 < 0.08 && balls.length < 10) {         // a lost cannonball, half sunk
        const d = 3 + g2 * 10;
        const x = p.x + p.nx * d, z = p.z + p.nz * d;
        const y = heightAt(x, z);
        if (y > 0.1 && y < 1.6 && !nearBuilt(x, z, 8)) balls.push({ x, z, y, a: g2, b: g3 });
      }
    }
    let wrecks = 0;
    for (let i = 0; i < strand.length && wrecks < 2; i += 7) {
      const p = strand[i];
      if (hash01(p.x * 0.91 - 31.7, p.z * 0.87 + 23.3) > 0.05) continue;
      const w2 = hash01(p.z * 0.79 + 13.1, p.x * 0.83 - 9.7);
      const d = 5 + w2 * 4;
      const x = p.x + p.nx * d, z = p.z + p.nz * d;
      const y = heightAt(x, z);
      if (y < 0.25 || y > 1.6 || nearBuilt(x, z, 25)) continue;
      wrecks++;
      const kx2 = -p.nz, kz2 = p.nx;                       // keel runs along the shore
      const yaw = Math.atan2(-(p.nz), p.nx);               // rib plane across the keel
      const L2 = 7 + w2 * 4, NR = 6;
      for (let k = 0; k < NR; k++) {
        const u = k / (NR - 1) - 0.5;
        const rx2 = x + kx2 * u * L2, rz2 = z + kz2 * u * L2;
        const hr = hash01(rx2, rz2);
        ribs.push({
          x: rx2, z: rz2, y: heightAt(rx2, rz2), yaw,
          s: (2.0 + w2 * 1.1) * (1 - Math.abs(u) * 0.75), a: hr, b: hash01(rz2, rx2),
        });
      }
      // a few sprung staves strewn around the bones
      for (let k = 0; k < 3; k++) {
        const ha = hash01(x + k * 8.3, z - k * 5.1), hb = hash01(z + k * 3.7, x + k * 9.9);
        const dx2 = x + (ha - 0.5) * 9, dz2 = z + (hb - 0.5) * 9;
        const dy = heightAt(dx2, dz2);
        if (dy > 0.1 && dy < 2.0) debris.push({ x: dx2, z: dz2, y: dy, a: ha, b: hb, c: w2 });
      }
    }
    const propMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true });
    const rockGeo = new THREE.IcosahedronGeometry(1, 0);
    const logGeo = new THREE.CylinderGeometry(0.13, 0.2, 1, 5, 1).rotateZ(Math.PI / 2);
    /* Dune-grass tuft: six curved blade strips fanned from one root — each a
       tapering 3-segment ribbon bent outward on a quadratic, with a baked
       root→tip vertex-colour gradient (dark olive base, pale lit tip) that the
       per-instance colour then tints. One tuft ≈ 36 tris; same instance count
       as the old cones, all the fidelity is per-tuft. */
    function makeGrassTuft() {
      const posA = [], colA = [], idxA = [], SEG = 3, BLADES = 6;
      for (let b = 0; b < BLADES; b++) {
        const hb1 = hash01(b * 3.7 + 1.1, b * 1.3 + 2.9), hb2 = hash01(b * 7.1 + 5.3, b * 9.4 + 0.7);
        const yaw = (b / BLADES) * Math.PI * 2 + hb1 * 0.9;
        const dx = Math.cos(yaw), dz = Math.sin(yaw);
        const H = 0.6 + hb2 * 0.4;                 // hash-varied blade height
        const lean = 0.22 + hb1 * 0.42;            // hash-varied outward bend
        const base = posA.length / 3;
        for (let s = 0; s <= SEG; s++) {
          const u = s / SEG;
          const off = 0.03 + lean * u * u;         // quadratic droop outward
          const w = 0.05 * (1 - u * 0.93);         // taper to a near-point
          const cx2 = dx * off, cz2 = dz * off, y = u * H;
          posA.push(cx2 - dz * w, y, cz2 + dx * w, cx2 + dz * w, y, cz2 - dx * w);
          const g = 0.55 + 0.5 * u;                // root→tip lightening
          colA.push(g * 0.88, g, g * 0.72, g * 0.88, g, g * 0.72);
        }
        for (let s = 0; s < SEG; s++) {
          const r0 = base + s * 2;
          idxA.push(r0, r0 + 1, r0 + 2, r0 + 1, r0 + 3, r0 + 2);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(colA, 3));
      g.setIndex(idxA);
      g.computeVertexNormals();
      return g;
    }
    const tuftGeo = makeGrassTuft();
    // grass sways from its instance position's own phase — local Y (0..1 in
    // tuft space) squared keeps roots planted while tips ride the breeze
    const grassT = { value: 0 };
    const grassMat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
    });
    grassMat.onBeforeCompile = (sh) => {
      sh.uniforms.uGrassT = grassT;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', 'uniform float uGrassT;\n#include <common>')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float gb = transformed.y * transformed.y;
  float gph = uGrassT * 1.8 + instanceMatrix[3][0] * 0.35 + instanceMatrix[3][2] * 0.27;
  transformed.x += gb * (sin(gph) * 0.10 + sin(gph * 2.7) * 0.035);
  transformed.z += gb * cos(gph * 0.9) * 0.07;
#endif`);
    };
    const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(),
      _vp = new THREE.Vector3(), _vs = new THREE.Vector3(), _cl = new THREE.Color();
    function plant(geom, items, shadow, setFn, mat) {
      const im = new THREE.InstancedMesh(geom, mat || propMat, Math.max(1, items.length));
      im.count = items.length;
      im.frustumCulled = false;                  // instances span the whole strand
      im.castShadow = shadow; im.receiveShadow = true;
      items.forEach((it, i) => {
        setFn(it);
        _q.setFromEuler(_e);
        _m4.compose(_vp, _q, _vs);
        im.setMatrixAt(i, _m4);
        im.setColorAt(i, _cl);
      });
      return im;
    }
    const rockIM = plant(rockGeo, rocks, true, (r) => {       // many small, a few big
      const s = 0.3 + r.a * r.a * 1.7, sy = s * (0.5 + r.b * 0.4);
      _e.set((r.c - 0.5) * 0.5, r.b * 6.28, (r.a - 0.5) * 0.5);
      _vp.set(r.x, r.y + sy * 0.2, r.z);
      _vs.set(s * (0.75 + r.c * 0.5), sy, s * (0.75 + r.b * 0.5));
      _cl.setHSL(0.08 + r.b * 0.04, 0.08 + r.c * 0.08, 0.35 + r.a * 0.2);
    });
    const logIM = plant(logGeo, logs, true, (l) => {          // lying, salt-bleached grey
      const L = 1.8 + l.a * 3.4, g = 0.7 + l.b * 0.7;
      _e.set(0, l.b * 6.28, (l.c - 0.5) * 0.12);
      _vp.set(l.x, l.y + 0.16 * g, l.z);
      _vs.set(L, g, g);
      _cl.setHSL(0.1, 0.05 + l.c * 0.04, 0.55 + l.a * 0.18);
    });
    const bladeIM = plant(tuftGeo, blades, false, (b) => {    // green low, straw higher
      const s = 0.9 + b.a * 1.1;
      _e.set((b.a - 0.5) * 0.24, b.b * 6.28, (b.b - 0.5) * 0.24);   // slight hash lean
      _vp.set(b.x, b.y - 0.04, b.z);
      _vs.set(s, s * (0.75 + b.c * 0.5), s);
      _cl.setHSL(0.20 - b.c * 0.07, 0.38, 0.36 + b.a * 0.15);
    }, grassMat);
    const shellIM = plant(rockGeo, shells, false, (sh) => {   // flattened white flecks
      const s = 0.06 + sh.a * 0.1;
      _e.set(0, sh.b * 6.28, 0);
      _vp.set(sh.x, sh.y + s * 0.3, sh.z);
      _vs.set(s * (1 + sh.b * 0.6), s * 0.45, s);
      _cl.setHSL(0.07 + sh.b * 0.04, 0.12 + sh.c * 0.1, 0.68 + sh.a * 0.16);
    });
    const boulderIM = plant(rockGeo, boulders, true, (r) => { // clustered, house-cat to cart sized
      const s = 1.3 + r.a * 2.2, sy = s * (0.55 + r.b * 0.35);
      _e.set((r.c - 0.5) * 0.4, r.b * 6.28, (r.a - 0.5) * 0.4);
      _vp.set(r.x, r.y + sy * 0.25, r.z);
      _vs.set(s * (0.8 + r.c * 0.4), sy, s * (0.8 + r.b * 0.4));
      _cl.setHSL(0.07 + r.b * 0.03, 0.06 + r.c * 0.06, 0.30 + r.a * 0.16);
    });
    const kelpGeo = new THREE.BoxGeometry(1, 0.06, 0.34);
    const kelpIM = plant(kelpGeo, kelp, false, (k) => {       // dark flat ribbons, storm-thrown
      const L = 1.6 + k.a * 2.8;
      _e.set(0, k.b * 6.28, 0);
      _vp.set(k.x, k.y + 0.05, k.z);
      _vs.set(L, 1, 0.6 + k.c * 0.8);
      _cl.setHSL(0.11 + k.b * 0.05, 0.38, 0.10 + k.a * 0.10);
    });
    const weedIM = plant(rockGeo, weeds, false, (w) => {      // wet seaweed mounds
      const s = 0.4 + w.a * 0.9;
      _e.set(0, w.b * 6.28, 0);
      _vp.set(w.x, w.y + s * 0.1, w.z);
      _vs.set(s * (1 + w.c * 0.8), s * 0.28, s);
      _cl.setHSL(0.16 + w.b * 0.05, 0.35, 0.12 + w.a * 0.10);
    });
    const potGeo = new THREE.CylinderGeometry(0.5, 0.62, 0.55, 7, 1);
    const potIM = plant(potGeo, pots, true, (pt) => {         // weathered slat pots
      const s = 0.8 + pt.a * 0.5;
      _e.set((pt.c - 0.5) * 0.2, pt.b * 6.28, (pt.a - 0.5) * 0.2);
      _vp.set(pt.x, pt.y + 0.26 * s, pt.z);
      _vs.set(s, s, s);
      _cl.setHSL(0.08, 0.25 + pt.c * 0.1, 0.28 + pt.a * 0.12);
    });
    const moorIM = plant(rockGeo, moors, true, (m) => {       // squat worked mooring stones
      const s = 0.7 + m.a * 0.7;
      _e.set(0, m.b * 1.57, 0);
      _vp.set(m.x, m.y + s * 0.3, m.z);
      _vs.set(s, s * 0.8, s);
      _cl.setHSL(0.09, 0.05, 0.42 + m.a * 0.12);
    });
    const coilGeo = new THREE.TorusGeometry(0.45, 0.15, 5, 10).rotateX(-Math.PI / 2);
    const coilIM = plant(coilGeo, coils, false, (c) => {      // tan rope coils / rusted hoops
      const s = c.hoop ? 0.5 + c.a * 0.3 : 0.8 + c.a * 0.6;
      _e.set((c.c - 0.5) * (c.hoop ? 0.3 : 0.1), c.b * 6.28, 0);
      _vp.set(c.x, c.y + 0.08, c.z);
      _vs.set(s, c.hoop ? s * 0.3 : s * 1.2, s);
      if (c.hoop) _cl.setHSL(0.06, 0.3, 0.14 + c.a * 0.08);
      else _cl.setHSL(0.10, 0.4, 0.40 + c.a * 0.12);
    });
    const debrisIM = plant(logGeo, debris, false, (d) => {    // staves and spar ends
      const L = 0.9 + d.a * 1.8, g = 0.25 + d.b * 0.3;
      _e.set(0, d.b * 6.28, (d.c - 0.5) * 0.2);
      _vp.set(d.x, d.y + 0.08 * g, d.z);
      _vs.set(L, g, g);
      _cl.setHSL(0.09, 0.15 + d.c * 0.15, 0.35 + d.a * 0.2);
    });
    // an upturned rowboat hull: the top half of a sphere, stretched long
    const hullGeo = new THREE.SphereGeometry(1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const hullIM = plant(hullGeo, hulls, true, (hb) => {      // beached, paint gone grey
      _e.set(0, Math.atan2(hb.nx, hb.nz) + (hb.b - 0.5) * 1.2, 0);
      _vp.set(hb.x, hb.y + 0.06, hb.z);
      _vs.set(1.9 + hb.c * 0.5, 0.55 + hb.b * 0.15, 0.75);
      _cl.setHSL(0.55 + hb.a * 0.1, 0.08, 0.42 + hb.c * 0.1);
    });
    const poolGeo = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
    const poolIM = plant(poolGeo, pools, false, (tp) => {     // dark still tidepools, tilted to the ground
      const e2 = 1.5;
      const gx = (heightAt(tp.x + e2, tp.z) - heightAt(tp.x - e2, tp.z)) / (2 * e2);
      const gz = (heightAt(tp.x, tp.z + e2) - heightAt(tp.x, tp.z - e2)) / (2 * e2);
      _e.set(-Math.atan(gz), 0, Math.atan(gx));
      const s = 0.8 + tp.a * 0.9;
      _vp.set(tp.x, tp.y + 0.06, tp.z);
      _vs.set(s * (1 + tp.b * 0.5), 1, s);
      _cl.setHSL(0.49, 0.35, 0.10 + tp.a * 0.05);
    });
    // wreck bones: half-buried rib frames arching out of the sand, the row
    // tapering toward bow and stern; dark rot-blackened oak
    const ribGeo = new THREE.TorusGeometry(1, 0.055, 5, 9, Math.PI);
    const ribIM = plant(ribGeo, ribs, true, (r) => {
      _e.set((r.b - 0.5) * 0.25, r.yaw, (r.a - 0.5) * 0.2);
      _vp.set(r.x, r.y - r.s * 0.18, r.z);
      _vs.set(r.s, r.s * (0.85 + r.b * 0.3), r.s);
      _cl.setHSL(0.07, 0.18, 0.14 + r.a * 0.08);
    });
    const corkGeo = new THREE.CylinderGeometry(0.09, 0.07, 0.13, 6);
    const corkIM = plant(corkGeo, corks, false, (c) => {      // pale net-floats in clusters
      const s = 0.8 + c.a * 0.6;
      _e.set((c.a - 0.5) * 2.4, c.b * 6.28, (c.b - 0.5) * 2.4);
      _vp.set(c.x, c.y + 0.06 * s, c.z);
      _vs.set(s, s, s);
      _cl.setHSL(0.09, 0.3, 0.5 + c.b * 0.16);
    });
    const barrelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.9, 9, 1).rotateZ(Math.PI / 2);
    const barrelIM = plant(barrelGeo, barrels, true, (bb) => { // beached barrel on its side
      const s = 0.8 + bb.a * 0.4;
      _e.set(0, bb.b * 6.28, 0);
      _vp.set(bb.x, bb.y + 0.26 * s, bb.z);
      _vs.set(s, s, s);
      _cl.setHSL(0.07 + bb.b * 0.02, 0.32, 0.22 + bb.a * 0.1);
    });
    const ballIM = plant(rockGeo, balls, false, (bl) => {     // iron shot, half sunk
      const s = 0.09 + bl.a * 0.05;
      _e.set(0, bl.b * 6.28, 0);
      _vp.set(bl.x, bl.y + s * 0.5, bl.z);
      _vs.set(s, s, s);
      _cl.setHSL(0.6, 0.04, 0.07 + bl.b * 0.05);
    });

    /* ----- rock outcrops where the hillsides break: steep upper slopes ----- */
    const crags = [];
    for (const hs of hillSpecs) {
      for (let k = 0; k < 40 && crags.length < 110; k++) {
        const ha = hash01(hs.cx + k * 17.3, hs.cz - k * 9.1), hb = hash01(hs.cz + k * 5.7, hs.cx + k * 11.9);
        const ang = ha * 6.283, rad = 0.12 + hb * 0.5;
        // unit-ellipse sample → world metres (inverse of the hillsAt mapping)
        const eu = Math.cos(ang) * rad * hs.rx, ev = Math.sin(ang) * rad * hs.ry;
        const x = hs.cx + (eu * hs.cos - ev * hs.sin), z = hs.cz - (eu * hs.sin + ev * hs.cos);
        const y = heightAt(x, z);
        if (y < hs.H * 0.45) continue;                    // upper slopes only
        const gx = (heightAt(x + 3, z) - heightAt(x - 3, z)) / 6;
        const gz = (heightAt(x, z + 3) - heightAt(x, z - 3)) / 6;
        if (gx * gx + gz * gz < 0.06) continue;           // steep faces only
        crags.push({ x, z, y, a: ha, b: hb, c: hash01(x, z) });
      }
    }
    const cragIM = plant(rockGeo, crags, true, (r) => {       // broken outcrop slabs
      const s = 3.0 + r.a * 5.0, sy = s * (0.6 + r.b * 0.5);
      _e.set((r.c - 0.5) * 0.7, r.b * 6.28, (r.a - 0.5) * 0.7);
      _vp.set(r.x, r.y + sy * 0.1, r.z);
      _vs.set(s * (0.7 + r.c * 0.6), sy, s * (0.6 + r.b * 0.5));
      _cl.setHSL(0.08 + r.b * 0.03, 0.05 + r.c * 0.05, 0.36 + r.a * 0.18);
    });

    /* ----- scree: talus fans of broken chips below the steep faces ----- */
    const scree = [];
    for (const hs of hillSpecs) {
      for (let k = 0; k < 60 && scree.length < 96; k++) {
        const ha = hash01(hs.cx - k * 7.9, hs.cz + k * 13.3), hb = hash01(hs.cz - k * 10.1, hs.cx + k * 6.7);
        const ang = ha * 6.283, rad = 0.40 + hb * 0.55;
        const eu = Math.cos(ang) * rad * hs.rx, ev = Math.sin(ang) * rad * hs.ry;
        const x = hs.cx + (eu * hs.cos - ev * hs.sin), z = hs.cz - (eu * hs.sin + ev * hs.cos);
        const y = heightAt(x, z);
        if (y < 6 || y > hs.H * 0.45) continue;           // footslopes only
        const gx = (heightAt(x + 4, z) - heightAt(x - 4, z)) / 8;
        const gz = (heightAt(x, z + 4) - heightAt(x, z - 4)) / 8;
        const g2 = gx * gx + gz * gz;
        if (g2 < 0.04 || g2 > 0.4) continue;              // below a break in slope, not on the crag
        const n = 3 + Math.floor(hb * 4);                 // a strewn patch, biased downhill
        for (let m = 0; m < n && scree.length < 96; m++) {
          const hc = hash01(x + m * 5.3, z - m * 8.7), hd = hash01(z + m * 3.7, x + m * 12.1);
          const sx = x + (hc - 0.5) * 9 - gx * 5, sz = z + (hd - 0.5) * 9 - gz * 5;
          scree.push({ x: sx, z: sz, y: heightAt(sx, sz), a: hc, b: hd, c: hash01(sx, sz) });
        }
      }
    }
    const screeIM = plant(rockGeo, scree, false, (r) => {     // flattened rock chips
      const s = 0.8 + r.a * 1.6;
      _e.set((r.c - 0.5) * 0.5, r.b * 6.28, (r.a - 0.5) * 0.5);
      _vp.set(r.x, r.y + s * 0.08, r.z);
      _vs.set(s * (0.8 + r.c * 0.5), s * 0.28, s * (0.7 + r.b * 0.5));
      _cl.setHSL(0.08 + r.b * 0.03, 0.05 + r.c * 0.04, 0.33 + r.a * 0.16);
    });

    /* ----- spray mist: a pooled Points system over the open-water crests -----
       A few dozen soft white sprites cycling on a fixed period. Each cycle a
       sprite picks a baked offshore candidate point (well past the lee-calm
       ramp); the swell height there AT SPAWN TIME — the same W_TRAINS sum the
       sheet's vertices ride — gates whether it pops at all, so mist only
       appears where a visible crest is peaking. Live ones drift downwind with
       the dominant train, rise and fade over ~1 s. Fixed buffers, zero
       per-frame allocation. */
    const sprayCands = [];
    for (let i = 0; i < strand.length && sprayCands.length < 160; i += 5) {
      const p = strand[i];
      const hc = hash01(p.x * 0.61 + 3.3, p.z * 0.53 - 1.9);
      const d = 55 + hc * 70;
      const x = p.x - p.nx * d, z = p.z - p.nz * d;       // seaward of the strand
      if (!inside(x, z) && nearestCoast(x, z) > 45) sprayCands.push(x, z);
    }
    // rocky shore-break sites: where the foam band meets steep coast. Ground
    // climbing fast just inland of the waterline marks the boulder/outcrop
    // shore; bursts pop a few metres seaward, inside the foam band itself —
    // taller and brighter than the open-water mist (rocks throw water UP).
    const shoreCands = [];
    for (let i = 2; i < strand.length && shoreCands.length < 120; i += 4) {
      const p = strand[i];
      const hc = hash01(p.x * 0.47 - 2.7, p.z * 0.71 + 8.3);
      if (heightAt(p.x + p.nx * 9, p.z + p.nz * 9) < 2.6) continue;  // steep shore only
      const d = 2 + hc * 5;
      const x = p.x - p.nx * d, z = p.z - p.nz * d;
      if (!inside(x, z)) shoreCands.push(x, z);
    }
    const SPRAY_N = 56, SPRAY_CYC = 1.35;
    const SHORE_N = shoreCands.length ? 16 : 0;     // tail of the pool works the rocks
    const windX = Math.cos(20 * D2RAD), windZ = Math.sin(20 * D2RAD);  // dominant train bearing
    const sprSeed = new Float32Array(SPRAY_N);
    for (let i = 0; i < SPRAY_N; i++) sprSeed[i] = hash01(i * 1.7 + 0.4, i * 2.3 + 1.1);
    const sprKind = new Float32Array(SPRAY_N);      // 0 = open-water mist, 1 = shore burst
    for (let i = SPRAY_N - SHORE_N; i < SPRAY_N; i++) sprKind[i] = 1;
    const sprayPos = new Float32Array(SPRAY_N * 3);
    const sprayDat = new Float32Array(SPRAY_N * 2);       // x: alpha, y: life 0..1
    const sprayGeo = new THREE.BufferGeometry();
    const sprayPosAttr = new THREE.BufferAttribute(sprayPos, 3).setUsage(THREE.DynamicDrawUsage);
    const sprayDatAttr = new THREE.BufferAttribute(sprayDat, 2).setUsage(THREE.DynamicDrawUsage);
    sprayGeo.setAttribute('position', sprayPosAttr);
    sprayGeo.setAttribute('aData', sprayDatAttr);
    sprayGeo.setAttribute('aKind', new THREE.BufferAttribute(sprKind, 1));  // static
    sprayGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);  // never recompute
    const sprayMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec2 aData;
        attribute float aKind;
        varying float vA, vK;
        void main() {
          vA = aData.x; vK = aKind;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = (1.2 + aData.y * 3.8) * (1.0 + aKind * 0.9) * 160.0 / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        precision mediump float;
        varying float vA, vK;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * vA * (0.5 + vK * 0.2);
          if (a < 0.01) discard;
          gl_FragColor = vec4(0.93, 0.97, 0.99, a);
        }`,
    });
    const spray = new THREE.Points(sprayGeo, sprayMat);
    spray.frustumCulled = false;
    spray.renderOrder = 2;
    spray.visible = sprayCands.length > 0 || shoreCands.length > 0;
    function updateSpray(t) {
      if (!sprayCands.length && !shoreCands.length) return;
      for (let i = 0; i < SPRAY_N; i++) {
        const onRock = sprKind[i] > 0.5;                  // shore-burst sprites
        const cands = onRock ? shoreCands : sprayCands;
        const nC = cands.length / 2;
        if (!nC) { sprayDat[i * 2] = 0; continue; }
        const u = t / SPRAY_CYC + sprSeed[i];
        const cyc = Math.floor(u), f = u - cyc;
        const ci = Math.min(nC - 1, (hash01(i * 3.7 + cyc * 17.1, cyc * 7.7 - i * 1.3) * nC) | 0);
        const cx2 = cands[ci * 2], cz2 = cands[ci * 2 + 1];
        const t0 = (cyc - sprSeed[i]) * SPRAY_CYC;        // this cycle's spawn time
        let h0 = 0, hN = 0;
        for (let k = 0; k < W_TRAINS.length; k++) {
          const w = W_TRAINS[k], phb = cx2 * w.kx + cz2 * w.kz;
          h0 += Math.sin(phb + t0 * w.om) * w.w;          // crest gate at spawn
          hN += Math.sin(phb + t * w.om) * w.w;           // sheet height now
        }
        // rocks throw spray on smaller swell than an open-water crest needs
        const gate = Math.min(1, Math.max(0, (h0 - (onRock ? 0.35 : 0.5)) * 2.2));
        const j = i * 3;
        sprayPos[j] = cx2 + windX * f * (onRock ? 2 : 5);
        sprayPos[j + 1] = W_UMEAN + W_UAMP * (hN - 1.05) + 0.3 + f * (onRock ? 2.6 : 1.2);
        sprayPos[j + 2] = cz2 + windZ * f * (onRock ? 2 : 5);
        sprayDat[i * 2] = gate * Math.sin(Math.PI * f) * (onRock ? 1.4 : 1);
        sprayDat[i * 2 + 1] = f;
      }
      sprayPosAttr.needsUpdate = true;
      sprayDatAttr.needsUpdate = true;
    }

    const group = new THREE.Group();
    group.add(water, mesh, rockIM, logIM, bladeIM, shellIM, boulderIM, kelpIM,
      weedIM, potIM, moorIM, coilIM, debrisIM, hullIM, poolIM, cragIM, screeIM,
      ribIM, corkIM, barrelIM, ballIM, spray);

    return {
      group, mesh, water, heightAt, seaLevel, waterAt,
      update(t) {
        water.material.uniforms.uTime.value = t; wetT.value = t; grassT.value = t;
        updateSpray(t);
      },
      dispose() {
        geo.dispose(); landMat.dispose(); water.geometry.dispose(); water.material.dispose();
        shoreTex.dispose(); rockGeo.dispose(); logGeo.dispose(); tuftGeo.dispose(); kelpGeo.dispose();
        potGeo.dispose(); coilGeo.dispose(); hullGeo.dispose(); poolGeo.dispose(); propMat.dispose();
        grassMat.dispose(); ribGeo.dispose(); corkGeo.dispose(); barrelGeo.dispose();
        sprayGeo.dispose(); sprayMat.dispose();
      },
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
  function makeWater(span, shore) {
    const size = span * 5.5;                 // run the sheet out to the horizon line
    const seg = Math.min(256, Math.max(40, Math.round(size / 22)));   // density only; W_TRAINS shader byte-identical (§0.3)
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
        uShallow: { value: new THREE.Color(0x3d8a8f) },   // lit turquoise over the shelf
        uSky: { value: new THREE.Color(0xbfd9e4) },       // what glancing water mirrors
        uFoamCol: { value: new THREE.Color(0xeef5ee) },
        uShoreTex: { value: shore.tex },
        uShoreMin: { value: shore.min },
        uShoreSpan: { value: shore.span },
        uShoreRange: { value: shore.range },
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
        uniform vec3 uDeep, uRim, uSunDir, uSunCol, uShallow, uSky, uFoamCol;
        uniform float uOpacity, uTime, uShine, uShoreRange;
        uniform vec4 uK[3];
        uniform sampler2D uShoreTex;
        uniform vec2 uShoreMin, uShoreSpan;
        varying vec3 vWorld;
        varying vec3 vNormal;
        void main() {
          // signed metres to the coastline (+ inland, - at sea), baked field
          vec2 suv = clamp((vWorld.xz - uShoreMin) / uShoreSpan, 0.0, 1.0);
          float sd = (texture2D(uShoreTex, suv).r * 2.0 - 1.0) * uShoreRange;

          // fine ripples: fragment-only normal detail at three scales — the
          // vertex swell is untouched, so floaters stay perfectly in phase
          vec2 q = vWorld.xz;
          float t = uTime;
          vec3 dn = vec3(
            cos(q.x * 1.9 + q.y * 0.8 + t * 2.3) * 0.45 + cos(q.x * 4.3 - q.y * 2.9 - t * 3.1) * 0.30 + cos(q.x * 8.9 + q.y * 6.1 + t * 4.6) * 0.18,
            0.0,
            cos(q.x * 0.7 - q.y * 2.3 + t * 1.9) * 0.45 + cos(q.x * 3.1 + q.y * 5.1 - t * 2.7) * 0.30 + cos(q.x * 6.3 - q.y * 9.7 + t * 4.1) * 0.18);
          vec3 N = normalize(vNormal);
          // wave shadowing: harbour water lies glassy in the lee of the land —
          // ripple amplitude ramps up with distance offshore, near-calm at the
          // shore (which also lets the hillside reflection below read clean)
          float chop = mix(0.25, 1.0, 1.0 - smoothstep(-45.0, -6.0, sd));
          N = normalize(N + dn * 0.09 * chop);

          vec3 V = normalize(cameraPosition - vWorld);
          float cosV = max(dot(V, N), 0.0);
          float rim = pow(1.0 - cosV, 3.0);
          // Schlick fresnel: glancing water mirrors the sky, near-vertical
          // shows the body colour (RiME-style — no real reflection needed)
          float fres = 0.03 + 0.97 * pow(1.0 - cosV, 5.0);

          // depth gradient: deep teal offshore, lit turquoise over the shelf
          float shelf = smoothstep(-uShoreRange, -3.0, sd);
          vec3 col = mix(mix(uDeep, uShallow, shelf * 0.75), uRim, clamp(rim, 0.0, 1.0));
          // the seabed ghosting through the clearest shallows: a warm sand tint
          float shoal = smoothstep(-14.0, -1.0, sd);
          col = mix(col, vec3(0.74, 0.70, 0.54), shoal * 0.32 * (1.0 - fres));
          // big slow patches of mirrored sky and cloud-shadow drifting over the
          // open sea, so the sheet is never one flat hue from shore to horizon
          float skyVar = sin(q.x * 0.012 + t * 0.05) * sin(q.y * 0.014 - t * 0.04)
                       + 0.5 * sin((q.x - q.y) * 0.0074 + t * 0.031);
          col = mix(col, uSky, smoothstep(0.2, 1.4, skyVar) * 0.16);
          col = mix(col, uDeep * 0.85, smoothstep(0.2, 1.4, -skyVar) * 0.14);
          // Schlick mirror of the sky, plus an extra grazing-angle horizon lift
          col = mix(col, uSky, min(1.0, fres * 0.55 + pow(1.0 - cosV, 8.0) * 0.22));
          // near-shore hillside "reflection": march the baked shore field a
          // short way along the view azimuth past the fragment — where land
          // rises beyond, grazing water trades its sky mirror for a darkened
          // upside-down hill-green tint, broken into vertical streaks by the
          // ripple normals. Two extra taps, no render target.
          vec2 az = normalize(vWorld.xz - cameraPosition.xz + vec2(1e-4));
          float sdR = (max(
            texture2D(uShoreTex, clamp((q + az * 9.0 - uShoreMin) / uShoreSpan, 0.0, 1.0)).r,
            texture2D(uShoreTex, clamp((q + az * 20.0 - uShoreMin) / uShoreSpan, 0.0, 1.0)).r) * 2.0 - 1.0) * uShoreRange;
          float refl = smoothstep(-25.0, -3.0, sd)          // only within ~25 m of land
                     * smoothstep(-4.0, 4.0, sdR)           // and only where shore stands beyond
                     * (0.35 + 0.65 * fres)                 // strongest at grazing angles
                     * (1.0 - chop * 0.45)                  // calmer water mirrors more
                     * (0.75 + 0.25 * dn.x);                // ripples break the streaks
          col = mix(col, vec3(0.16, 0.24, 0.14), min(refl * 0.26, 0.2));
          // a faint toon band on the rim for the engraved look
          col += smoothstep(0.6, 0.95, rim) * 0.08;

          // shoreline foam: a breathing band where the sheet meets the sand,
          // pulsed by the same three swell trains the vertices ride
          float ph = 0.0;
          for (int i = 0; i < 3; i++)
            ph += sin(vWorld.x * uK[i].x + vWorld.z * uK[i].y + uTime * uK[i].z) * uK[i].w;
          float surge = 0.5 + 0.5 * sin(ph * 2.4 - sd * 1.1 + uTime * 0.7);
          float lace = sin(q.x * 2.3 + q.y * 3.1 + t * 1.4) * sin(q.x * 5.1 - q.y * 1.7 - t * 1.1);
          float lace2 = sin(q.x * 9.7 + q.y * 7.3 - t * 2.6) * sin(q.x * 6.9 - q.y * 11.3 + t * 2.1);
          float foam = smoothstep(-7.5, -1.2, sd) * smoothstep(0.32, 0.78, surge + lace * 0.26 + lace2 * 0.16);
          foam += smoothstep(-2.0, -0.3, sd) * (0.72 + 0.28 * smoothstep(-0.6, 0.6, lace2));  // lace-bitten white edge
          foam = clamp(foam, 0.0, 1.0);
          col = mix(col, uFoamCol, foam * 0.85);
          // offshore whitecaps: out where the chop runs full (well past the
          // lee-calm ramp) the crest tops break into wind-torn white flecks —
          // reconstructed from the SAME three trains, so every fleck rides a
          // visible crest. The two lace fields bite the band into spume.
          float open2 = 1.0 - smoothstep(-55.0, -28.0, sd);
          // Langmuir windrows: long foam/calm lanes aligned with the dominant
          // train's bearing (20deg), stretched ~10:1 along-wind with irregular
          // tens-of-metres spacing — they brighten/darken the sheet +-4% and
          // herd the whitecaps into lanes instead of an even sprinkle
          vec2 wdir = vec2(0.93969262, 0.34202014);
          float wAl = dot(q, wdir), wAc = dot(q, vec2(-wdir.y, wdir.x));
          float streak = sin(wAc * 0.17 + sin(wAl * 0.016 + t * 0.10) * 1.7)
                       * sin(wAc * 0.41 - wAl * 0.034 + t * 0.06) * 0.7
                       + sin(wAc * 0.09 + wAl * 0.008 - t * 0.04) * 0.3;
          col *= 1.0 + streak * 0.04 * open2;
          // gusts: a slow patch field widens/narrows the crest threshold so
          // caps cluster where the wind is working, then die off between gusts
          float gust = 0.5 + 0.5 * sin(wAl * 0.011 - t * 0.16) * sin(wAc * 0.027 + t * 0.07);
          float crest = smoothstep(mix(0.84, 0.55, gust), 0.92, ph);
          float bite = smoothstep(0.0, 0.7, lace2 * 0.6 + 0.4) * smoothstep(-0.55, 0.45, lace);
          float cap = crest * bite * open2 * (0.55 + 0.45 * smoothstep(-0.4, 0.7, streak + gust - 0.5));
          col = mix(col, uFoamCol, cap * 0.6);
          // backlit crest translucency: thin crest tops between eye and sun
          // scatter the light green-blue — a small teal lift on the back face
          // of crests toward the sun's azimuth, strongest under Studio light
          vec2 sunAz = normalize(uSunDir.xz + vec2(1e-5));
          float toSunF = max(dot(normalize(vWorld.xz - cameraPosition.xz), sunAz), 0.0);
          float backFace = min(max(-dot(N.xz, sunAz) * 6.0, 0.0), 1.0);
          col += vec3(0.04, 0.13, 0.12) * smoothstep(0.6, 0.95, ph) * backFace
               * toSunF * toSunF * toSunF * (0.35 + 0.65 * uShine) * (1.0 - foam) * open2;
          // caustic shimmer dancing on the shallow seabed — two warped sines,
          // suppressed under the foam (white water hides the bottom)
          float ca = sin(q.x * 1.6 + sin(q.y * 2.2 + t * 1.3) * 1.6 + t * 1.1)
                   * sin(q.y * 1.8 + sin(q.x * 2.0 - t * 1.6) * 1.6 - t * 0.9);
          col += smoothstep(0.45, 0.95, ca) * shoal * 0.16 * (1.0 - foam);
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
            float glow = pow(toSun, 4.0) * rim;
            vec3 sun = uSunCol;
            // the sparkle lane: extra glitter confined to a cone that runs
            // from the viewer toward the sun's azimuth, widening with distance
            // — the classic stylized sea-sparkle path
            vec2 laneDir = normalize(vec2(L.x, L.z));
            vec2 toFrag = vWorld.xz - cameraPosition.xz;
            float along = dot(toFrag, laneDir);
            float across = abs(dot(toFrag, vec2(-laneDir.y, laneDir.x)));
            float lane = exp(-pow(across / (9.0 + max(along, 0.0) * 0.12), 2.0)) * smoothstep(0.0, 25.0, along);
            col += uShine * sun * pow(ndh, 48.0) * lane * shim * 1.4 * (1.0 - foam);
            // glitter dies inside the foam — sparkles don't ride on white
            col += uShine * sun * (spec * 3.2 * shim + sheen * 0.9 + glow * 0.7) * (1.0 - foam * 0.7);
            // warm the deep water a touch and tip the rim toward gold
            col = mix(col, sun * 1.1, uShine * rim * 0.35);
          }
          // aerial perspective: the far sheet hazes toward the sky colour
          col = mix(col, uSky, smoothstep(900.0, 2600.0, length(vWorld.xz - cameraPosition.xz)) * 0.4);
          gl_FragColor = vec4(col, mix(uOpacity, 1.0, max(foam, cap) * 0.6));
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
