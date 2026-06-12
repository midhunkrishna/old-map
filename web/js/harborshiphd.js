/* Carta Temporum — harborshiphd module: the high-definition period vessels.
   When the canoe tour brings the viewer within a ship's length of an anchored
   mark, the engraved symbolic vessel yields to one of these: a fully-modelled
   ship of 1650–1730, built from the period record —
   — sloop: a Bermuda/Jamaica sloop; single raked mast, big gaff main, long
     steeved bowsprit and jib, low freeboard, sweeping sheer, tiller steering.
   — merchantman: a Dutch fluyt; pear-shaped section with pronounced tumblehome
     to a narrow deck, rounded high stern, fore & main square-rigged with a
     lateen mizzen — the Atlantic cargo hauler of the age.
   — brigantine: square-rigged fore, gaff main.
   — man-of-war: a small two-decker; beakhead bow, stern gallery with glowing
     windows and three lanterns, two tiers of guns.
   The art direction leans Sea-of-Thieves: chunky planking, beaten-up strakes,
   warm lantern light for the golden hour. Hulls are authored keel-at-y=0, bow
   toward +X, Y up — the same frame and SYMBOLIC_SCALE footprint as the
   symbolic shipwright (harbor3d.js), so the diorama can swap one for the other
   with the same placeMatrix and the same draft.
   window.cartaShipwrightHD(THREE, SW) → { shipInstance(type) → { inst, anim } } */
'use strict';

window.cartaShipwrightHD = function cartaShipwrightHD(THREE, SW) {
  const LENGTHS = (SW && SW.LENGTHS) || { canoe: 7, sloop: 18, brigantine: 24, merchantman: 30, 'man-of-war': 42 };
  const protos = {};
  let MAT = null;

  /* ---------- painted canvases: weathered planking & decking ---------- */
  function plankTexture(base, seam, weather) {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 256, 256);
    let rnd = 13;
    const rand = () => { rnd = (rnd * 16807) % 2147483647; return rnd / 2147483647; };
    for (let row = 0; row < 16; row++) {        // strakes with per-plank tint
      const y = row * 16;
      let px = -((rand() * 40) | 0);
      while (px < 256) {
        const w = 50 + ((rand() * 60) | 0);
        x.fillStyle = `rgba(${(rand() * 30) | 0},${(rand() * 22) | 0},${(rand() * 12) | 0},${0.10 + rand() * weather})`;
        x.fillRect(px, y, w, 16);
        x.fillStyle = seam;
        x.fillRect(px, y, 2, 16);               // butt joint
        px += w;
      }
      x.fillStyle = seam;
      x.fillRect(0, y + 15, 256, 1.4);          // strake seam
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    return tex;
  }

  function materials() {
    if (MAT) return MAT;
    MAT = {
      hull: new THREE.MeshStandardMaterial({ map: plankTexture('#7a5836', 'rgba(28,18,8,0.7)', 0.28), color: 0xb9986a, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide, vertexColors: true }),
      wale: new THREE.MeshStandardMaterial({ color: 0x3c2c1a, roughness: 0.9 }),
      deck: new THREE.MeshStandardMaterial({ map: plankTexture('#a98c5d', 'rgba(48,34,16,0.65)', 0.18), color: 0xd9c193, roughness: 0.92, side: THREE.DoubleSide }),
      castle: new THREE.MeshStandardMaterial({ map: plankTexture('#6d4e2e', 'rgba(24,15,6,0.7)', 0.3), color: 0xb08c5c, roughness: 0.88 }),
      mast: new THREE.MeshStandardMaterial({ color: 0x6e5638, roughness: 0.85 }),
      sail: new THREE.MeshStandardMaterial({ color: 0xeadfc2, roughness: 0.95, side: THREE.DoubleSide }),
      sailDark: new THREE.MeshStandardMaterial({ color: 0xd9c9a4, roughness: 0.95, side: THREE.DoubleSide }),
      // vertex-coloured variants for the lofted sails only: seam striping,
      // reef bands and patches live in the colour attribute. The flat jib /
      // lateen ShapeGeometries carry no colour attribute and MUST keep the
      // plain materials above (a vertexColors material over a colourless
      // geometry renders black).
      sailV: new THREE.MeshStandardMaterial({ color: 0xeadfc2, roughness: 0.95, side: THREE.DoubleSide, vertexColors: true }),
      sailVDark: new THREE.MeshStandardMaterial({ color: 0xd9c9a4, roughness: 0.95, side: THREE.DoubleSide, vertexColors: true }),
      iron: new THREE.MeshStandardMaterial({ color: 0x23211e, roughness: 0.6, metalness: 0.55 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xc89a4a, roughness: 0.45, metalness: 0.6 }),
      window: new THREE.MeshStandardMaterial({ color: 0xffc879, emissive: 0xffaa3d, emissiveIntensity: 1.5, roughness: 0.4 }),
      lantern: new THREE.MeshStandardMaterial({ color: 0xffd890, emissive: 0xffb347, emissiveIntensity: 2.0, roughness: 0.3 }),
      flag: new THREE.MeshStandardMaterial({ color: 0x8a3b2e, roughness: 0.9, side: THREE.DoubleSide }),
      cable: new THREE.MeshStandardMaterial({ color: 0x6b5a3a, roughness: 0.95 }),
      rope: new THREE.LineBasicMaterial({ color: 0x2e2418, transparent: true, opacity: 0.85 }),
      ratline: new THREE.LineBasicMaterial({ color: 0x2e2418, transparent: true, opacity: 0.55 }),
    };
    return MAT;
  }

  /* ---------- the lofted hull ----------
     Stations along x (stern −L/2 → bow +L/2); at each, a section from the keel
     up: quick bilge turn, full sides, then tumblehome pulling the top strake
     inboard (`tum`). Sheer rises toward bow and (more) toward the stern. */
  function hullLoft(L, W, H, o) {
    o = o || {};
    // station/section density ~1.5x the first pass: at canoe range the old
    // 30x18 loft showed flats along the tumblehome turn. Small craft (ship's
    // boats) pass their own lower counts.
    const nS = o.nS || 42, nU = o.nU || 26;
    const tum = o.tumblehome != null ? o.tumblehome : 0.12;
    const sternRound = o.sternRound != null ? o.sternRound : 0.5; // 1 = fluyt-round
    const pos = [], uv = [], idx = [], col = [];
    const wl = H * 0.30;                          // she rides at about this waterline
    const railsTop = [];                          // [x, yTop, halfW] per station, for rails/deck
    for (let i = 0; i < nS; i++) {
      const t = i / (nS - 1);                     // 0 stern → 1 bow
      const x = -L / 2 + t * L;
      // beam plan: full midships, fine entry, stern per sternRound
      const bow = Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.62 + 0.38) * 0.5), 1.4);
      const stern = t < 0.3 ? Math.pow(t / 0.3, sternRound) * (1 - 0.25 * sternRound) + 0.25 * sternRound : 1;
      const b = W * Math.min(bow, stern) * Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * t) * 0.92), 0.35);
      // sheer line: deck dips midships, rises at bow, rises more at the stern
      const sheer = 0.16 * Math.pow(Math.abs(2 * t - 1), 2) + (t < 0.5 ? (0.5 - t) * (o.sternRise || 0.3) : 0);
      const yTop = H * (1 + sheer);
      // keel rocker: the bottom sweeps up into stem & sternpost
      const yBot = H * 0.55 * Math.pow(Math.max(0, Math.abs(2 * t - 1) - 0.72) / 0.28, 1.6);
      railsTop.push([x, yTop, b * (1 - tum)]);
      for (let j = 0; j < nU; j++) {
        const v = j / (nU - 1);                   // 0 port rail … 0.5 keel … 1 starboard rail
        const side = v < 0.5 ? -1 : 1;
        const vv = Math.abs(v - 0.5) * 2;         // 0 keel … 1 rail
        // section half-width: bilge fills fast, tumblehome above vv≈0.62
        let w = Math.pow(Math.min(vv, 0.62) / 0.62, 0.55);
        if (vv > 0.62) w = 1 - tum * Math.pow((vv - 0.62) / 0.38, 1.6);
        const y = yBot + (yTop - yBot) * vv;
        pos.push(x, y, side * b * w);
        uv.push(t * 6, vv * 1.6);
        // painterly vertex colour: every strake its own weathered tone, a pale
        // tallow 'white stuff' pay below the waterline (the pre-copper age),
        // and a streak of weed-grime where wind and water meet
        const strake = Math.floor(vv * 9) + (side < 0 ? 9 : 0);
        const h1 = Math.sin(strake * 37.7 + 4.1) * 0.5 + 0.5;
        const h2 = Math.sin(i * 13.3 + strake * 71.9) * 0.5 + 0.5;
        let cr = 0.90 + 0.14 * h1 + 0.06 * h2;
        let cg = 0.88 + 0.11 * h1 + 0.05 * h2;
        let cb = 0.86 + 0.08 * h1 + 0.04 * h2;
        // plank butt joints: each strake's planks end at staggered stations —
        // a dark tick where the butts land, the shift-of-butts the eye reads
        // as real planking instead of one endless board
        const butt = Math.sin(i * 91.7 + strake * 53.1);
        if (butt > 0.84) { cr *= 0.70; cg *= 0.68; cb *= 0.66; }
        // trenail rows: the faint dots of the wooden fastenings, one row per
        // strake on a staggered cadence — barely-there grain at canoe range
        else if (((i * 7 + strake * 13) % 9) === 0) { cr *= 0.94; cg *= 0.94; cb *= 0.93; }
        // iron-sick darkening: rust weeping down the topsides from the
        // chainplate bolts below each channel (o.streaks = station fractions)
        if (o.streaks && vv > 0.42 && vv < 0.88) {
          for (let s = 0; s < o.streaks.length; s++) {
            const d = Math.abs(t - (o.streaks[s] - 0.03));
            if (d < 0.045) {
              const f = (1 - d / 0.045) * Math.min(1, (vv - 0.42) / 0.3) * 0.5; // strongest just below the channel, fading down
              cr *= 1 - 0.20 * f; cg *= 1 - 0.30 * f; cb *= 1 - 0.34 * f;
            }
          }
        }
        if (y < wl) {
          const f = Math.min(1, (wl - y) / (H * 0.18));
          cr += f * 0.55; cg += f * 0.52; cb += f * 0.38;
        } else if (y < wl + H * 0.14) {
          const f = 1 - (y - wl) / (H * 0.14);
          cr *= 1 - 0.36 * f; cg *= 1 - 0.26 * f; cb *= 1 - 0.40 * f;
        }
        col.push(cr, cg, cb);
      }
    }
    for (let i = 0; i < nS - 1; i++) {
      for (let j = 0; j < nU - 1; j++) {
        const a = i * nU + j, b2 = a + 1, c = a + nU, d = c + 1;
        idx.push(a, b2, c, b2, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return { geo: g, railsTop, nS, nU };
  }

  /* hull section half-width at height fraction vv (0 keel … 1 rail), from a
     station's rail half-width — the inverse of the loft's tumblehome formula.
     Anything mounted on the SKIN (gunports, barrels, boarding steps) must use
     this, not the rail width: above the bilge the hull is up to 1/(1−tum)
     WIDER than the rail, and fittings placed at rail width sat buried inside
     the planking, flickering through it as she rolled. */
  function sectionHalfW(railHw, tum, vv) {
    const b = railHw / (1 - tum);
    if (vv > 0.62) return b * (1 - tum * Math.pow((vv - 0.62) / 0.38, 1.6));
    return b * Math.pow(Math.min(vv, 0.62) / 0.62, 0.55);
  }

  // bake a small geometry into shared arrays under a transform — many tiny
  // fittings (deadeyes, gunport frames, lids) become one mesh, one draw call
  function bake(geo, mat4, pos, norm, idx) {
    const p = geo.attributes.position, n = geo.attributes.normal, ix = geo.index;
    const off = pos.length / 3;
    const v = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(mat4);
    for (let i = 0; i < p.count; i++) {
      v.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(mat4);
      pos.push(v.x, v.y, v.z);
      v.set(n.getX(i), n.getY(i), n.getZ(i)).applyNormalMatrix(nm).normalize();
      norm.push(v.x, v.y, v.z);
    }
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + off);
  }

  function bakedMesh(pos, norm, idx, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    g.setIndex(idx);
    return new THREE.Mesh(g, mat);
  }

  // the deck: a strip laid between the rails a bit below the bulwark top,
  // crowned along the centreline — the athwartships camber that sheds green
  // water to the scuppers, and catches the low light from a canoe alongside
  function deckGeo(railsTop, drop) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < railsTop.length; i++) {
      const [x, yTop, hw] = railsTop[i];
      const w = hw * 0.96;
      const y = yTop - drop;
      pos.push(x, y, -w, x, y + w * 0.14, 0, x, y, w);
      uv.push(i * 0.45, 0, i * 0.45, w * 0.25, i * 0.45, w * 0.5);
    }
    for (let i = 0; i < railsTop.length - 1; i++) {
      const a = i * 3;
      idx.push(a, a + 3, a + 1, a + 1, a + 3, a + 4);
      idx.push(a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // wales: dark strakes proud of the planking, swept along the sheer
  function waleAt(g, railsTop, frac, r, m) {
    const pts = railsTop.map(([x, yTop, hw]) => new THREE.Vector3(x, yTop * frac, 0));
    for (let i = 0; i < pts.length; i++) pts[i].z = 0;   // centreline sweep; two copies offset
    for (const side of [-1, 1]) {
      const p2 = railsTop.map(([x, yTop, hw]) => new THREE.Vector3(x, yTop * frac, side * hw * (0.9 + 0.16 * frac)));
      const curve = new THREE.CatmullRomCurve3(p2);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, r, 5, false), m.wale);
      g.add(tube);
    }
  }

  /* period canvas, the way the paintings show it: a sail is sewn from ~60 cm
     cloths, edge to edge, so the surface reads as faint vertical stripes with
     a darker double seam between every pair; a reef band crosses near the
     head (courses carried one or two, topsails up to four); a hard-worked
     suit shows a patched repair. All of it lives in the colour attribute —
     `patchSeed` (truthy) drops one repair patch, its corner set by the seed. */
  function sailGeo(wHead, wFoot, h, belly, patchSeed) {
    const NX = 12, NY = 8;
    const pos = [], idx = [], uvs = [], col = [];
    const pu = patchSeed ? 0.30 + 0.35 * (Math.sin(patchSeed * 12.9) * 0.5 + 0.5) : 0;
    const pv = patchSeed ? 0.30 + 0.30 * (Math.sin(patchSeed * 31.7) * 0.5 + 0.5) : 0;
    for (let j = 0; j <= NY; j++) {
      const v = j / NY;
      const w = wHead + (wFoot - wHead) * v;
      for (let i = 0; i <= NX; i++) {
        const u = i / NX;
        pos.push((u - 0.5) * w, (0.5 - v) * h, belly * (1 - Math.pow(2 * u - 1, 2)) * (0.45 + 0.55 * v));
        uvs.push(u, 1 - v);
        // six cloths across: per-cloth weave tint, seam line on the even columns
        const cloth = Math.min(5, Math.floor(u * 6));
        let c = 0.955 + 0.07 * (Math.sin(cloth * 47.9 + 2.7) * 0.5 + 0.5);
        if (i > 0 && i < NX && i % 2 === 0) c *= 0.88;        // the double seam
        if (j === 2) c *= 0.91;                               // reef band near the head
        let cr = c, cg = c, cb = c * 0.985;
        if (patchSeed && u >= pu && u <= pu + 0.26 && v >= pv && v <= pv + 0.24) {
          cr *= 0.90; cg *= 0.87; cb *= 0.80;                 // the repair, off-tone canvas
        }
        col.push(cr, cg, cb);
      }
    }
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  /* ---------- rig parts ---------- */
  function mast(g, m, x, deckY, h, rake) {
    const grp = new THREE.Group();
    grp.position.set(x, deckY, 0);
    grp.rotation.z = -(rake || 0);
    const lowerH = h * 0.55, topH = h * 0.36, tgH = h * 0.22;
    const lower = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.014, h * 0.022, lowerH, 9), m.mast);
    lower.position.y = lowerH / 2;
    grp.add(lower);
    // woldings: the tarred rope bands girding a made lower mast, baked to one mesh
    const wPos = [], wNorm = [], wIdx = [], wMat = new THREE.Matrix4();
    for (let b = 1; b <= 3; b++) {
      const wy = lowerH * (b / 4);
      const wr = (h * 0.022 + (h * 0.014 - h * 0.022) * (wy / lowerH)) * 1.22;
      const band = new THREE.CylinderGeometry(wr, wr, h * 0.012, 9);
      wMat.identity().setPosition(0, wy, 0);
      bake(band, wMat, wPos, wNorm, wIdx);
      band.dispose();
    }
    grp.add(bakedMesh(wPos, wNorm, wIdx, m.wale));
    const topPlat = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.05, h * 0.055, h * 0.012, 10), m.castle);
    topPlat.position.y = lowerH;
    grp.add(topPlat);                          // the fighting top
    const rim = new THREE.Mesh(new THREE.TorusGeometry(h * 0.05, h * 0.006, 5, 12), m.mast);
    rim.rotation.x = Math.PI / 2; rim.position.y = lowerH + h * 0.012;
    grp.add(rim);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.009, h * 0.013, topH, 7), m.mast);
    upper.position.y = lowerH + topH / 2 - h * 0.02;
    grp.add(upper);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(h * 0.016, h * 0.008, h * 0.07), m.mast);
    cross.position.y = lowerH + topH - h * 0.03;
    grp.add(cross);                            // crosstrees
    const tg = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.006, h * 0.009, tgH, 6), m.mast);
    tg.position.y = lowerH + topH + tgH / 2 - h * 0.045;
    grp.add(tg);
    g.add(grp);
    return { grp, lowerH, topH, tgH, h, x, deckY };
  }

  function yardWithSail(mastInfo, m, relY, span, sailH, belly, mat, patchSeed) {
    const { grp } = mastInfo;
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(span * 0.012, span * 0.012, span, 7), m.mast);
    yard.rotation.x = Math.PI / 2;
    yard.position.y = relY;
    grp.add(yard);
    const sail = new THREE.Mesh(sailGeo(span * 0.86, span * 0.97, sailH, belly, patchSeed), mat || m.sailV);
    sail.rotation.y = Math.PI / 2;
    sail.position.y = relY - sailH * 0.52;
    sail.userData.billow = true;
    grp.add(sail);
    return sail;
  }

  /* standing rigging, the period way: a channel (chain-wale) stands the
     shrouds off the tumblehome; each shroud sets up on a pair of deadeyes
     with a lanyard between; ratline rungs ladder the gang for the topmen.
     Deadeye discs are appended to `dead` and merged into one mesh later. */
  function shrouds(g, m, mastInfo, hullHalfW, nLines, dead) {
    const pts = [], rats = [];
    const { x, deckY, lowerH } = mastInfo;
    const headY = deckY + lowerH;
    const chanY = deckY * 0.86;                  // the channel rides on the upper wale
    const chanOut = hullHalfW * 1.16;            // its outboard edge
    const spread = lowerH * 0.085;
    const dr = lowerH * 0.016;                   // deadeye radius
    // chainplates: the iron straps that carry each deadeye's pull from the
    // channel down the topside to the hull — baked to one mesh per gang
    const cpPos = [], cpNorm = [], cpIdx = [], cpMat = new THREE.Matrix4();
    const strap = new THREE.BoxGeometry(dr * 0.6, dr * 5, dr * 0.45);
    for (const side of [-1, 1]) {
      const chan = new THREE.Mesh(
        new THREE.BoxGeometry(spread * (nLines + 0.8), dr * 0.9, hullHalfW * 0.22), m.wale);
      chan.position.set(x - lowerH * 0.06 - spread * (nLines - 1) * 0.5, chanY, side * hullHalfW * 1.07);
      g.add(chan);
      const upY = chanY + dr * 3.4;              // upper deadeye, turned into the shroud
      const loY = chanY + dr * 0.7;              // lower deadeye, strapped to the channel
      for (let k = 0; k < nLines; k++) {
        const ax = x - lowerH * 0.06 - k * spread;
        const az = side * chanOut;
        pts.push(x, headY, side * 0.1, ax, upY, az);   // the shroud proper
        rats.push(ax, upY, az, ax, loY, az);           // the lanyard between deadeyes
        dead.push([ax, upY, az, dr], [ax, loY, az, dr]);
        // the strap leans in from the channel's edge to the hull side below —
        // stood off at 1.12 × half-beam: at 1.05 it sat flush with the skin's
        // midship bulge and z-fought through the planking
        cpMat.makeRotationX(side * 0.28).setPosition(ax, chanY - dr * 3, side * (hullHalfW * 1.12));
        bake(strap, cpMat, cpPos, cpNorm, cpIdx);
      }
      // futtock shrouds: the spider of lines from the top's rim down and in
      // to the lower mast — the under-top rigging a canoe sees looking up
      const rimR = mastInfo.h * 0.05;
      for (let k = -1; k <= 1; k++) {
        rats.push(
          x + k * rimR * 0.6, headY + dr * 0.5, side * rimR * 0.92,
          x + k * rimR * 0.2, headY - lowerH * 0.13, side * rimR * 0.25);
      }
      for (let r = 1; r <= 7; r++) {            // the ratline rungs
        const f = r / 8;
        const y = upY + (headY - upY) * f;
        rats.push(
          x - lowerH * 0.06 * (1 - f), y, side * (0.1 + (chanOut - 0.1) * (1 - f)),
          x + (-lowerH * 0.06 - (nLines - 1) * spread) * (1 - f), y, side * (0.1 + (chanOut - 0.1) * (1 - f)),
        );
      }
    }
    strap.dispose();
    g.add(bakedMesh(cpPos, cpNorm, cpIdx, m.iron));
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(sg, m.rope));
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rats, 3));
    g.add(new THREE.LineSegments(rg, m.ratline));
  }

  // all the ship's deadeyes as a single merged mesh
  function deadeyes(g, m, dead) {
    if (!dead.length) return;
    const disc = new THREE.CylinderGeometry(1, 1, 0.55, 7);
    disc.rotateX(Math.PI / 2);                   // face outboard
    const pos = [], norm = [], idx = [], mat4 = new THREE.Matrix4();
    for (const [dx, dy, dz, r] of dead) {
      mat4.makeScale(r, r, r).setPosition(dx, dy, dz);
      bake(disc, mat4, pos, norm, idx);
    }
    disc.dispose();
    g.add(bakedMesh(pos, norm, idx, m.wale));
  }

  function ropes(g, m, segs) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    g.add(new THREE.LineSegments(sg, m.rope));
  }

  /* the great stays — wormed, parcelled and served with tarred marline, the
     heaviest cordage aloft and the most legible from a canoe looking up:
     drawn as proper dark tubes with a touch of sag, not hairline ink */
  function servedStay(g, m, L, ax, ay, az, bx, by, bz) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(ax, ay, az),
      new THREE.Vector3((ax + bx) / 2, (ay + by) / 2 - L * 0.018, (az + bz) / 2),
      new THREE.Vector3(bx, by, bz),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, L * 0.0026, 5, false), m.wale));
  }

  /* the anchor buoy: a small double-cone of wood riding its buoy rope right
     over where the bower lies off the bow — the period mark that says
     'anchored here' to every passing boat */
  function anchorBuoy(g, m, L, W, H) {
    const wl = H * 0.30;
    const grp = new THREE.Group();
    const up = new THREE.Mesh(new THREE.ConeGeometry(L * 0.012, L * 0.024, 6), m.castle);
    up.position.y = L * 0.010;
    grp.add(up);
    const dn = new THREE.Mesh(new THREE.ConeGeometry(L * 0.012, L * 0.018, 6), m.castle);
    dn.rotation.x = Math.PI;
    dn.position.y = -L * 0.010;
    grp.add(dn);
    grp.position.set(L * 0.82, wl + L * 0.004, W * 0.9);
    grp.rotation.z = 0.22;                       // heeled a little on her rope
    g.add(grp);
    // the buoy rope, dipping under toward the anchor's crown
    const rope = [L * 0.82, wl + L * 0.002, W * 0.9, L * 0.79, wl - L * 0.012, W * 0.82];
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rope, 3));
    g.add(new THREE.LineSegments(rg, m.rope));
  }

  function lanternMesh(m, s) {
    const grp = new THREE.Group();
    const glass = new THREE.Mesh(new THREE.SphereGeometry(s, 8, 7), m.lantern);
    grp.add(glass);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.15, s * 1.15, s * 1.7, 6, 1, true), m.iron);
    grp.add(cage);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(s * 1.3, s * 0.8, 6), m.gold);
    cap.position.y = s * 1.2;
    grp.add(cap);
    return grp;
  }

  /* the battery: each barrel runs out through a framed gunport; a man-of-war
     shows her lids swung up against the side, red linings catching the light.
     Ports and lids are baked into one merged mesh apiece. */
  function cannons(g, m, L, railsTop, rows, perSide, tum) {
    const geo = new THREE.CylinderGeometry(L * 0.0075, L * 0.0095, L * 0.05, 7);
    const portGeo = new THREE.BoxGeometry(L * 0.034, L * 0.032, L * 0.012);
    const lidGeo = new THREE.BoxGeometry(L * 0.034, L * 0.028, L * 0.004);
    const pPos = [], pNorm = [], pIdx = [];
    const lPos = [], lNorm = [], lIdx = [];
    const mat4 = new THREE.Matrix4(), hinge = new THREE.Matrix4();
    const withLids = rows > 1;                   // the two-decker carries port lids
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < perSide; i++) {
        const t = 0.24 + (i / (perSide - 1)) * 0.5;
        const si = Math.min(railsTop.length - 1, Math.round(t * (railsTop.length - 1)));
        const [x, yTop, hw] = railsTop[si];
        for (const side of [-1, 1]) {
          const vv = 0.52 + row * 0.22;          // height fraction up the side
          const gy = yTop * vv;
          // mount everything on the hull SKIN at gun height — railsTop carries
          // the rail width AFTER tumblehome, and at port height the fluyt's
          // side is ~30% wider: ports placed at rail width sat inside the
          // planking and the battery cut in and out of the hull
          const skin = sectionHalfW(hw, tum || 0, vv);
          const gun = new THREE.Mesh(geo, m.iron);
          gun.rotation.z = Math.PI / 2;
          gun.rotation.y = side * Math.PI / 2;
          gun.position.set(x, gy, side * (skin + L * 0.012));
          gun.rotation.x = side * 0.06;
          g.add(gun);
          // the dark port the barrel runs out of, straddling the skin
          mat4.identity().setPosition(x, gy, side * (skin + L * 0.002));
          bake(portGeo, mat4, pPos, pNorm, pIdx);
          if (withLids) {                        // lid hinged at the head, swung open
            hinge.makeRotationX(side * 1.15).setPosition(x, gy + L * 0.018, side * (skin + L * 0.004));
            mat4.makeTranslation(0, L * 0.014, 0).premultiply(hinge);
            bake(lidGeo, mat4, lPos, lNorm, lIdx);
          }
        }
      }
    }
    portGeo.dispose(); lidGeo.dispose();
    g.add(bakedMesh(pPos, pNorm, pIdx, m.iron));
    if (withLids) g.add(bakedMesh(lPos, lNorm, lIdx, m.flag));
  }

  function deckClutter(g, m, L, deckY) {
    // barrels, a hatch grating, a capstan — the lived-in deck
    for (const [bx, bz] of [[-L * 0.1, L * 0.05], [-L * 0.13, -L * 0.04], [L * 0.12, L * 0.03]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.018, L * 0.015, L * 0.04, 9), m.castle);
      b.position.set(bx, deckY + L * 0.02, bz);
      g.add(b);
    }
    // the main hatch: a coaming with a proper grating, slats baked to one mesh
    const coam = new THREE.Mesh(new THREE.BoxGeometry(L * 0.1, L * 0.014, L * 0.07), m.castle);
    coam.position.set(L * 0.05, deckY + L * 0.005, 0);
    g.add(coam);
    const pos = [], norm = [], idx = [], mat4 = new THREE.Matrix4();
    const slatA = new THREE.BoxGeometry(L * 0.092, L * 0.005, L * 0.0045);
    const slatB = new THREE.BoxGeometry(L * 0.0045, L * 0.005, L * 0.062);
    for (let i = 0; i < 6; i++) {
      mat4.identity().setPosition(L * 0.05, deckY + L * 0.0135, (i - 2.5) * L * 0.011);
      bake(slatA, mat4, pos, norm, idx);
    }
    for (let i = 0; i < 8; i++) {
      mat4.identity().setPosition(L * 0.05 - L * 0.0385 + i * L * 0.011, deckY + L * 0.0125, 0);
      bake(slatB, mat4, pos, norm, idx);
    }
    slatA.dispose(); slatB.dispose();
    g.add(bakedMesh(pos, norm, idx, m.wale));
    // the capstan, with drumhead and bars shipped ready to weigh
    const capstan = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.014, L * 0.02, L * 0.045, 8), m.castle);
    capstan.position.set(-L * 0.02, deckY + L * 0.022, 0);
    g.add(capstan);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.02, L * 0.017, L * 0.008, 8), m.wale);
    head.position.set(-L * 0.02, deckY + L * 0.047, 0);
    g.add(head);
    for (const ry of [0, Math.PI / 2]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(L * 0.09, L * 0.004, L * 0.004), m.mast);
      bar.position.set(-L * 0.02, deckY + L * 0.05, 0);
      bar.rotation.y = ry;
      g.add(bar);
    }
  }

  // the bower, fished up to the cathead the way she'd lie at a Caribbean road
  function anchor(g, m, L, x, y, side) {
    const sgn = Math.sign(side) || 1;
    // the cathead: a stout beam over the bow that holds the anchor clear
    const catY = y + L * 0.026;
    const cat = new THREE.Mesh(new THREE.BoxGeometry(L * 0.013, L * 0.013, Math.abs(side) * 0.55), m.wale);
    cat.position.set(x + L * 0.004, catY, side * 0.78);
    cat.rotation.x = -sgn * 0.18;                // cocked a little skyward
    g.add(cat);
    const grp = new THREE.Group();
    const shank = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.005, L * 0.005, L * 0.07, 6), m.iron);
    grp.add(shank);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(L * 0.05, L * 0.007, L * 0.007), m.mast);
    stock.position.y = L * 0.028;
    grp.add(stock);
    const fluke = new THREE.Mesh(new THREE.TorusGeometry(L * 0.018, L * 0.005, 5, 8, Math.PI), m.iron);
    fluke.position.y = -L * 0.034;
    fluke.rotation.z = Math.PI;
    grp.add(fluke);
    grp.position.set(x, y, side);
    grp.rotation.x = 0.15;
    g.add(grp);
    // cat-fall from the beam's end down to the ring
    const fall = [x + L * 0.004, catY + L * 0.004, side * 1.04, x, y + L * 0.036, side];
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fall, 3));
    g.add(new THREE.LineSegments(fg, m.rope));
  }

  /* hawse holes either side of the stem, and the bower cable veered out the
     starboard one, sagging in a catenary to the water ahead — the line that
     reads 'riding at anchor', not 'under way' */
  function hawseCable(g, m, L, W, H) {
    const wl = H * 0.30;                          // the loft's waterline
    const hx = L * 0.435, hy = H * 0.72, hz = W * 0.30;
    const pos = [], norm = [], idx = [], mat4 = new THREE.Matrix4();
    const hole = new THREE.CylinderGeometry(L * 0.008, L * 0.008, L * 0.006, 8);
    hole.rotateZ(Math.PI / 2);                    // disc faces fore-and-aft
    for (const side of [-1, 1]) {
      mat4.identity().setPosition(hx, hy, side * hz);
      bake(hole, mat4, pos, norm, idx);
    }
    hole.dispose();
    g.add(bakedMesh(pos, norm, idx, m.wale));
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector3(
        hx + t * L * 0.17,
        hy + (wl - hy) * Math.pow(t, 1.55),       // slack hemp, hanging
        hz + t * W * 0.18));
    }
    const cable = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, L * 0.003, 5, false), m.cable);
    g.add(cable);
  }

  /* the ship's boat — every vessel of the age kept one. The small fry tow
     her astern on a painter; the big ships stow her amidships on spare spars
     over the main hatch. */
  function shipsBoat(g, m, L, H, deckMidY, sternY, towed, rig) {
    const bl = L * 0.17;
    const loft = hullLoft(bl, bl * 0.14, bl * 0.11, { tumblehome: 0.02, sternRound: 0.85, nS: 22, nU: 14 });
    const boat = new THREE.Group();
    boat.add(new THREE.Mesh(loft.geo, m.hull));
    for (const tx of [-bl * 0.18, bl * 0.18]) {
      const thwart = new THREE.Mesh(new THREE.BoxGeometry(bl * 0.06, bl * 0.02, bl * 0.24), m.castle);
      thwart.position.set(tx, bl * 0.1, 0);
      boat.add(thwart);
    }
    if (towed) {
      const wl = H * 0.30;
      boat.position.set(-L * 0.5 - bl * 0.85, wl - bl * 0.03, L * 0.02);
      boat.rotation.y = 0.12;                     // sheering a little on her line
      g.add(boat);
      // the painter, from her stem up to the taffrail
      rig.push(-L * 0.5 - bl * 0.38, wl + bl * 0.08, L * 0.02, -L * 0.498, sternY * 0.95, 0);
    } else {
      boat.position.set(L * 0.05, deckMidY + L * 0.024, 0);
      g.add(boat);
      for (const sx of [-bl * 0.26, bl * 0.26]) { // the spare spars she rests on
        const spar = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.004, L * 0.004, L * 0.1, 6), m.mast);
        spar.rotation.x = Math.PI / 2;
        spar.position.set(L * 0.05 + sx, deckMidY + L * 0.02, 0);
        g.add(spar);
      }
    }
  }

  /* the head: paired rails sweeping from the bow bulwark forward and down to
     converge at the stem head — the signature curve of the age-of-sail prow.
     Head timbers brace the gang between; the figurehead rides just beyond.
     Rails and timbers bake to a single mesh. */
  function headrails(g, m, L, H, railsTop) {
    const n = railsTop.length - 1;
    const s0 = railsTop[Math.round(n * 0.86)];     // [x, yTop, hw] near the bow
    const figX = L * 0.565, figY = H * 1.0;
    const pos = [], norm = [], idx = [];
    const mat4 = new THREE.Matrix4();
    for (const side of [-1, 1]) {
      for (const k of [0, 1]) {                    // upper & lower head rail
        const y0 = s0[1] * (1 - k * 0.18);
        const pts = [
          new THREE.Vector3(s0[0], y0, side * s0[2] * 1.02),
          new THREE.Vector3(L * 0.50, y0 - H * (0.10 + k * 0.10), side * s0[2] * 0.55),
          new THREE.Vector3(L * 0.545, figY - H * (0.05 + k * 0.16), side * s0[2] * 0.2),
          new THREE.Vector3(figX, figY - k * H * 0.10, 0),
        ];
        const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, L * 0.0042, 5, false);
        bake(tube, mat4.identity(), pos, norm, idx);
        tube.dispose();
      }
      // head timbers bracing the pair of rails
      const strut = new THREE.BoxGeometry(L * 0.006, H * 0.22, L * 0.006);
      mat4.identity().setPosition(L * 0.5, s0[1] * 0.92 - H * 0.12, side * s0[2] * 0.55);
      bake(strut, mat4, pos, norm, idx);
      mat4.identity().setPosition(L * 0.535, figY - H * 0.12, side * s0[2] * 0.3);
      bake(strut, mat4, pos, norm, idx);
      strut.dispose();
    }
    // the stem head knee the rails land on
    const knee = new THREE.BoxGeometry(L * 0.03, H * 0.2, L * 0.012);
    mat4.identity().setPosition(L * 0.545, figY - H * 0.08, 0);
    bake(knee, mat4, pos, norm, idx);
    knee.dispose();
    g.add(bakedMesh(pos, norm, idx, m.wale));
    return [figX, figY];
  }

  /* the stern dressed for the period: a taffrail arcing over the transom,
     gilt mouldings boxing the gallery lights, a name-board band below them */
  function sternworks(g, m, L, W, sternY, isFluyt) {
    const w = W * (isFluyt ? 0.55 : 0.85);
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const u = i / 4 - 1;
      pts.push(new THREE.Vector3(-L * (0.5 + 0.012 * (1 - u * u)), sternY * (1.02 + 0.10 * (1 - u * u)), u * w));
    }
    const taff = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, L * 0.005, 5, false), m.wale);
    g.add(taff);
    for (const yf of [0.60, 0.85]) {               // mouldings above & below the lights
      const band = new THREE.Mesh(new THREE.BoxGeometry(L * 0.006, L * 0.010, w * 1.9), m.gold);
      band.position.set(-L * 0.496, sternY * yf, 0);
      g.add(band);
    }
  }

  /* the helm, period-correct: the man-of-war carries the new-fangled wheel
     (introduced ~1703); fluyt and brigantine keep the older whipstaff, the
     vertical lever working the tiller below; the sloop steers by tiller.
     A binnacle with a lit lamp stands before the helmsman. */
  function helm(g, m, L, type, x, y) {
    if (type === 'man-of-war') {
      const wheel = new THREE.Group();
      wheel.position.set(x, y + L * 0.026, 0);
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(L * 0.018, L * 0.0028, 5, 10), m.wale));
      const sPos = [], sNorm = [], sIdx = [], mat4 = new THREE.Matrix4();
      const spoke = new THREE.CylinderGeometry(L * 0.0016, L * 0.0016, L * 0.048, 5);
      for (let i = 0; i < 5; i++) {
        mat4.makeRotationZ(i * Math.PI / 5);
        bake(spoke, mat4, sPos, sNorm, sIdx);
      }
      spoke.dispose();
      wheel.add(bakedMesh(sPos, sNorm, sIdx, m.castle));
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.007, L * 0.007, L * 0.024, 7), m.castle);
      drum.rotation.x = Math.PI / 2;
      drum.position.z = -L * 0.016;
      wheel.add(drum);
      const post = new THREE.Mesh(new THREE.BoxGeometry(L * 0.008, L * 0.026, L * 0.008), m.castle);
      post.position.set(x, y + L * 0.012, -L * 0.016);
      g.add(post);
      g.add(wheel);
    } else if (type !== 'sloop') {
      const staff = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.0035, L * 0.005, L * 0.08, 6), m.mast);
      staff.position.set(x, y + L * 0.036, 0);
      staff.rotation.x = 0.22;                     // leaned over as the helmsman holds her
      g.add(staff);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(L * 0.0055, 6, 5), m.gold);
      knob.position.set(x, y + L * 0.075, L * 0.009);
      g.add(knob);
    }
    const bin = new THREE.Mesh(new THREE.BoxGeometry(L * 0.016, L * 0.026, L * 0.014), m.castle);
    bin.position.set(x + L * 0.032, y + L * 0.013, 0);
    g.add(bin);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(L * 0.004, L * 0.007, L * 0.008), m.window);
    lamp.position.set(x + L * 0.041, y + L * 0.017, 0);
    g.add(lamp);                                   // the binnacle lamp, lit at dusk
  }

  // pin rails inside the bulwark abreast each mast, belaying pins merged
  function pinRails(g, m, L, stations, hullHalfW) {
    const pos = [], norm = [], idx = [], mat4 = new THREE.Matrix4();
    const rail = new THREE.BoxGeometry(L * 0.05, L * 0.005, L * 0.012);
    const pin = new THREE.CylinderGeometry(L * 0.0015, L * 0.0015, L * 0.014, 5);
    for (const [mx, my] of stations) {
      for (const side of [-1, 1]) {
        const z = side * hullHalfW * 0.9;
        mat4.identity().setPosition(mx - L * 0.04, my + L * 0.026, z);
        bake(rail, mat4, pos, norm, idx);
        for (let p = 0; p < 4; p++) {
          mat4.identity().setPosition(mx - L * 0.058 + p * L * 0.012, my + L * 0.03, z);
          bake(pin, mat4, pos, norm, idx);
        }
      }
    }
    rail.dispose(); pin.dispose();
    g.add(bakedMesh(pos, norm, idx, m.wale));
  }

  /* boarding steps: the ladder of treads up the tumblehome at the gangway,
     waterline to rail — how anyone actually got aboard, and the first thing
     a visitor in a canoe alongside would look for. Baked to one mesh. */
  function boardingSteps(g, m, L, railsTop, tum) {
    const si = Math.round(0.46 * (railsTop.length - 1));
    const [sx, yTop, hw] = railsTop[si];
    const pos = [], norm = [], idx = [], mat4 = new THREE.Matrix4();
    const tread = new THREE.BoxGeometry(L * 0.022, L * 0.005, L * 0.007);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const vv = 0.38 + k * 0.135;             // just above the waterline up to the rail
        const z = sectionHalfW(hw, tum, vv) + L * 0.0025;
        mat4.identity().setPosition(sx, yTop * vv, side * z);
        bake(tread, mat4, pos, norm, idx);
      }
    }
    tread.dispose();
    g.add(bakedMesh(pos, norm, idx, m.wale));
  }

  /* ---------- the ships ---------- */
  function buildProto(type) {
    const m = materials();
    const g = new THREE.Group();
    const L = LENGTHS[type] || 18;
    const W = L * 0.135, H = L * 0.115;          // half-beam, hull side height

    if (type === 'canoe') {                      // a planked pirogue, open
      const loft = hullLoft(L, W * 0.85, H * 0.7, { tumblehome: 0.02, sternRound: 0.9 });
      g.add(new THREE.Mesh(loft.geo, m.hull));
      g.add(new THREE.Mesh(deckGeo(loft.railsTop, H * 0.45), m.deck));
      for (const tx of [-L * 0.2, 0.05, L * 0.25]) {
        const thwart = new THREE.Mesh(new THREE.BoxGeometry(L * 0.035, L * 0.012, W * 1.5), m.castle);
        thwart.position.set(tx, H * 0.62, 0);
        g.add(thwart);
      }
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(L * 0.35, L * 0.01, L * 0.035), m.mast);
      paddle.position.set(0, H * 0.5, W * 0.3);
      paddle.rotation.y = 0.2;
      g.add(paddle);
      return g;
    }

    const isFluyt = type === 'merchantman';
    const isMow = type === 'man-of-war';
    const tum = isFluyt ? 0.30 : isMow ? 0.16 : 0.08;
    const loft = hullLoft(L, W, H, {
      tumblehome: tum,
      sternRound: isFluyt ? 0.9 : 0.35,
      sternRise: isFluyt ? 0.5 : isMow ? 0.42 : 0.26,
      // station fractions of the masts (x/L + 0.5): the loft weeps rust
      // below where each gang of chainplates bolts to the side
      streaks: type === 'sloop' ? [0.6]
        : type === 'brigantine' ? [0.72, 0.36]
        : [0.78, 0.5, 0.2],
    });
    const hull = new THREE.Mesh(loft.geo, m.hull);
    g.add(hull);
    waleAt(g, loft.railsTop, 0.52, L * 0.008, m);
    waleAt(g, loft.railsTop, 0.74, L * 0.0065, m);
    const deckDrop = H * 0.28;
    const deckY = (t) => loft.railsTop[Math.round(t * (loft.nS - 1))][1] - deckDrop;
    g.add(new THREE.Mesh(deckGeo(loft.railsTop, deckDrop), m.deck));

    // keel, stem & rudder
    const keel = new THREE.Mesh(new THREE.BoxGeometry(L * 0.92, H * 0.1, W * 0.07), m.wale);
    keel.position.y = H * 0.03;
    g.add(keel);
    const rudder = new THREE.Mesh(new THREE.BoxGeometry(L * 0.018, H * 0.85, W * 0.32), m.wale);
    rudder.position.set(-L * 0.505, H * 0.45, 0);
    rudder.rotation.y = Math.PI / 2;
    g.add(rudder);
    {
      // gudgeon & pintle straps: the iron bands that hang the rudder on the
      // sternpost, wrapping both faces of the blade — sized a hair deeper
      // than the blade so the straps stand proud (no coplanar faces to fight)
      const gPos = [], gNorm = [], gIdx = [], gMat = new THREE.Matrix4();
      const strap = new THREE.BoxGeometry(L * 0.05, H * 0.05, L * 0.022);
      for (const hf of [0.18, 0.45, 0.72]) {
        gMat.identity().setPosition(-L * 0.502, H * 0.85 * hf + H * 0.06, 0);
        bake(strap, gMat, gPos, gNorm, gIdx);
      }
      strap.dispose();
      g.add(bakedMesh(gPos, gNorm, gIdx, m.iron));
    }

    // stern: transom (or fluyt round-up) with glowing cabin windows + lantern(s)
    const sternY = loft.railsTop[0][1];
    const nWin = isMow ? 5 : isFluyt ? 2 : 3;
    for (let i = 0; i < nWin; i++) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(L * 0.004, L * 0.02, L * 0.024), m.window);
      win.position.set(-L * 0.493, sternY * 0.72, (i - (nWin - 1) / 2) * L * 0.038 * (isFluyt ? 0.6 : 1));
      g.add(win);
    }
    if (isMow) {                                  // quarter galleries
      for (const side of [-1, 1]) {
        const gal = new THREE.Mesh(new THREE.BoxGeometry(L * 0.05, L * 0.035, L * 0.02), m.castle);
        gal.position.set(-L * 0.45, sternY * 0.72, side * W * 0.92);
        g.add(gal);
        const gw = new THREE.Mesh(new THREE.BoxGeometry(L * 0.052, L * 0.014, L * 0.005), m.window);
        gw.position.set(-L * 0.45, sternY * 0.73, side * W * 0.96);
        g.add(gw);
      }
    } else if (type !== 'sloop') {                // quarter badges: the merchant's
      // modest answer to the gallery — one framed light on each quarter
      for (const side of [-1, 1]) {
        const zf = isFluyt ? 0.70 : 0.86;
        const badge = new THREE.Mesh(new THREE.BoxGeometry(L * 0.034, L * 0.028, L * 0.012), m.castle);
        badge.position.set(-L * 0.44, sternY * 0.70, side * W * zf);
        g.add(badge);
        const bw = new THREE.Mesh(new THREE.BoxGeometry(L * 0.018, L * 0.015, L * 0.004), m.window);
        bw.position.set(-L * 0.44, sternY * 0.70, side * W * (zf + 0.07));
        g.add(bw);
        const frame = new THREE.Mesh(new THREE.BoxGeometry(L * 0.026, L * 0.022, L * 0.002), m.gold);
        frame.position.set(-L * 0.44, sternY * 0.70, side * W * (zf + 0.065));
        g.add(frame);
      }
    }
    const nLan = isMow ? 3 : 1;
    for (let i = 0; i < nLan; i++) {
      const lan = lanternMesh(m, L * 0.012);
      lan.position.set(-L * 0.5, sternY * 1.22, (i - (nLan - 1) / 2) * L * 0.05);
      g.add(lan);
    }
    // one warm point light for the closest pass (cheap: a single light per ship)
    const glow = new THREE.PointLight(0xffb347, 0.7, L * 0.8, 1.8);
    glow.position.set(-L * 0.48, sternY * 1.2, 0);
    g.add(glow);

    // stern castle / quarterdeck cabin
    // cabin kept inside the bulwarks: at 1.5 × half-beam its flat flanks
    // poked through the tumblehome-narrowed topsides as bare slabs
    const qd = new THREE.Mesh(new THREE.BoxGeometry(L * (isFluyt ? 0.2 : 0.26), H * 0.5, W * (isFluyt ? 1.0 : 1.3)), m.castle);
    qd.position.set(-L * 0.36, sternY * 0.92, 0);
    g.add(qd);
    if (isMow) {
      const fc = new THREE.Mesh(new THREE.BoxGeometry(L * 0.14, H * 0.36, W * 1.3), m.castle);
      fc.position.set(L * 0.3, deckY(0.78) + H * 0.2, 0);
      g.add(fc);
    }
    // the beakhead: headrails for every square-rigger; the sloop keeps her
    // plain stem. The figurehead rides where the rails converge — a gilded
    // lion for the man-of-war, a carved scroll (volute) for the others.
    if (type !== 'sloop') {
      const [figX, figY] = headrails(g, m, L, H, loft.railsTop);
      if (isMow) {
        const fig = new THREE.Mesh(new THREE.SphereGeometry(W * 0.16, 8, 6), m.gold);
        fig.position.set(figX + L * 0.022, figY + H * 0.04, 0);
        g.add(fig);
      } else {
        const scroll = new THREE.Mesh(new THREE.ConeGeometry(W * 0.09, L * 0.045, 6), m.gold);
        scroll.rotation.z = -Math.PI / 2 + 0.5;
        scroll.position.set(figX + L * 0.012, figY + H * 0.02, 0);
        g.add(scroll);
      }
    }
    sternworks(g, m, L, W, sternY, isFluyt);

    // guns
    if (isMow) cannons(g, m, L, loft.railsTop, 2, 7, tum);
    else if (type === 'merchantman') cannons(g, m, L, loft.railsTop, 1, 4, tum);
    else cannons(g, m, L, loft.railsTop, 1, 3, tum);
    boardingSteps(g, m, L, loft.railsTop, tum);

    deckClutter(g, m, L, deckY(0.5));
    helm(g, m, L, type, -L * 0.21, deckY(0.29));
    anchor(g, m, L, L * 0.42, H * 0.9, W * 1.05);
    hawseCable(g, m, L, W, H);
    if (isMow || isFluyt) anchorBuoy(g, m, L, W, H); // the big ships buoy their bowers

    // bowsprit (steeved up) + spritsail yard, the period's head rig
    const spritLen = L * 0.42;
    const sprit = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.007, L * 0.013, spritLen, 7), m.mast);
    sprit.position.set(L * 0.5 + spritLen * 0.4, H * 1.1 + spritLen * 0.13, 0);
    sprit.rotation.z = -Math.PI / 2 + 0.3;
    g.add(sprit);
    const spritTip = [L * 0.5 + spritLen * 0.78, H * 1.1 + spritLen * 0.27, 0];
    // gammoning: the turns of tarred rope lashing the sprit down to the stem
    // head — without it the great forestay would pluck the spar out of her
    {
      const gPos = [], gNorm = [], gIdx = [], gMat = new THREE.Matrix4();
      const wrap = new THREE.TorusGeometry(L * 0.016, L * 0.0028, 5, 10);
      wrap.rotateY(Math.PI / 2);                  // loops athwart the sprit's run
      const cx = L * 0.5 + spritLen * 0.4, cy = H * 1.1 + spritLen * 0.13;
      for (let k = 0; k < 3; k++) {
        const gx = L * 0.527 + k * L * 0.011;
        gMat.identity().setPosition(gx, cy + (gx - cx) * 0.31 - L * 0.004, 0);
        bake(wrap, gMat, gPos, gNorm, gIdx);
      }
      wrap.dispose();
      g.add(bakedMesh(gPos, gNorm, gIdx, m.wale));
    }
    // the bobstay: from the sprit's outer third down to the stem at the
    // waterline, holding the spar against the forestay's upward pull — the
    // one heavy line every period bow shows and the first pass missed
    servedStay(g, m, L,
      L * 0.5 + spritLen * 0.62, H * 1.1 + spritLen * 0.20, 0,
      L * 0.475, H * 0.42, 0);
    if (type !== 'sloop') {
      // spritsail yard, slung under the sprit — carried by every square-rigger
      // of the age, the fluyt included (her spritsail set under the bowsprit)
      const sy = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.005, L * 0.005, W * 1.8, 6), m.mast);
      sy.rotation.x = Math.PI / 2;
      sy.position.set(L * 0.56, H * 1.05 + spritLen * 0.12, 0);
      g.add(sy);                                  // spritsail yard
    }

    /* ----- masts & canvas per type ----- */
    const rig = [], dead = [], pinStations = [];
    const hullHalfW = W * 0.95;
    if (type === 'sloop') {
      // one raked mast, gaff main + jib — the Jamaica sloop silhouette
      const mi = mast(g, m, L * 0.1, deckY(0.62), L * 0.95, 0.1);
      shrouds(g, m, { ...mi, x: L * 0.1, deckY: deckY(0.62) }, hullHalfW, 3, dead);
      // gaff mainsail: head on the gaff, foot on the boom, along the centreline
      const gaffH = L * 0.5, boomL = L * 0.55;
      const main = new THREE.Mesh(sailGeo(boomL * 0.72, boomL, gaffH, W * 0.5, 3), m.sailV);
      main.position.set(L * 0.1 - boomL * 0.52, deckY(0.62) + gaffH * 0.66, 0);
      main.userData.billow = true;
      g.add(main);
      const boom = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.006, L * 0.006, boomL, 6), m.mast);
      boom.rotation.z = Math.PI / 2;
      boom.position.set(L * 0.1 - boomL / 2, deckY(0.62) + gaffH * 0.32, 0);
      g.add(boom);
      const gaff = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.005, L * 0.005, boomL * 0.74, 6), m.mast);
      gaff.rotation.z = Math.PI / 2 - 0.45;
      gaff.position.set(L * 0.1 - boomL * 0.33, deckY(0.62) + gaffH * 1.02, 0);
      g.add(gaff);
      // two jibs to the long sprit
      const headY = deckY(0.62) + mi.lowerH + mi.topH * 0.8;
      for (const [k, sh] of [[0.0, 1], [0.5, 0.66]]) {
        const jib = new THREE.Shape();
        const dx = spritTip[0] - (L * 0.1), dy = headY - spritTip[1];
        jib.moveTo(0, 0); jib.lineTo(-dx * (1 - k * 0.4), dy * sh); jib.lineTo(-dx * 0.18, 0); jib.lineTo(0, 0);
        const jm = new THREE.Mesh(new THREE.ShapeGeometry(jib), m.sailDark);
        jm.position.set(spritTip[0] - k * spritLen * 0.3, spritTip[1], 0);
        jm.userData.billow = true;
        g.add(jm);
      }
      servedStay(g, m, L, L * 0.1, headY, 0, spritTip[0], spritTip[1], 0); // the forestay, served
      rig.push(L * 0.1, headY, 0, -L * 0.48, sternY, 0);
      // running rigging: mainsheet from the boom end, peak halyard to the gaff
      const boomEnd = [L * 0.1 - boomL, deckY(0.62) + gaffH * 0.32, 0];
      rig.push(boomEnd[0], boomEnd[1], 0, -L * 0.38, deckY(0.18) + L * 0.01, 0);
      rig.push(L * 0.1 - boomL * 0.66, deckY(0.62) + gaffH * 1.18, 0, L * 0.1, headY, 0);
      // topping lift: boom end up to the masthead — what holds the boom's
      // weight with the sail at rest, riding at anchor
      rig.push(boomEnd[0], boomEnd[1], 0, L * 0.1, headY, 0);
      dead.push([boomEnd[0], boomEnd[1], 0, L * 0.004]);   // the sheet block
      pinStations.push([L * 0.1, deckY(0.62)]);
      // tiller at the quarterdeck
      const tiller = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.005, L * 0.007, L * 0.16, 6), m.mast);
      tiller.rotation.z = Math.PI / 2 - 0.18;
      tiller.position.set(-L * 0.4, sternY * 0.95, 0);
      g.add(tiller);
    } else {
      // square-rigged fore & main; mizzen lateen (fluyt, man-of-war) or gaff main (brigantine)
      const defs = type === 'brigantine'
        ? [{ x: L * 0.22, h: L * 0.92, sq: true }, { x: -L * 0.14, h: L * 0.85, sq: false }]
        : [{ x: L * 0.28, h: L * 0.88, sq: true }, { x: 0, h: L * 1.02, sq: true },
           { x: -L * 0.3, h: L * 0.66, sq: 'lateen' }];
      defs.forEach((d, di) => {
        const dy = deckY(Math.min(0.95, 0.5 + d.x / L));
        const mi = mast(g, m, d.x, dy, d.h, 0);
        shrouds(g, m, { ...mi, x: d.x, deckY: dy }, hullHalfW, isMow ? 4 : 3, dead);
        if (d.sq === true) {
          const span = W * 3.1 * (di === 2 ? 0.7 : 1);
          // a patched repair on the main course and the fore topsail — one or
          // two hard-worked cloths per ship, the way a working suit looked
          yardWithSail(mi, m, mi.lowerH * 0.88, span, mi.lowerH * 0.52, W * 0.5, m.sailV, di === 1 ? 2 : 0);
          yardWithSail(mi, m, mi.lowerH + mi.topH * 0.78, span * 0.74, mi.topH * 0.62, W * 0.36, m.sailVDark, di === 0 ? 5 : 0);
          if (isMow) yardWithSail(mi, m, mi.lowerH + mi.topH + mi.tgH * 0.6, span * 0.5, mi.tgH * 0.62, W * 0.22, m.sailV);
          // running rigging at the yardarms: lifts up to the masthead, braces
          // leading aft to the rail, the course sheet to the deck — with a
          // block (merged with the deadeyes) where each line meets the yard
          const yl = dy + mi.lowerH * 0.88;        // course yard height
          const yt = dy + mi.lowerH + mi.topH * 0.78;
          for (const s of [-1, 1]) {
            const ye = s * span * 0.5, yte = s * span * 0.37;
            rig.push(d.x, yl, ye, d.x - L * 0.005, dy + mi.lowerH, s * 0.1);          // lift
            rig.push(d.x, yl, ye, d.x - L * 0.16, dy + L * 0.02, s * hullHalfW * 0.92); // brace
            rig.push(d.x, yt, yte, d.x - L * 0.12, yl, s * span * 0.32);              // topsail brace
            rig.push(d.x, yl - L * 0.004, ye * 0.92, d.x - L * 0.05, dy + L * 0.015, s * hullHalfW * 0.8); // sheet
            dead.push([d.x, yl, ye, L * 0.004], [d.x, yt, yte, L * 0.0035]);
          }
        } else if (d.sq === 'lateen') {
          // the mizzen lateen: a long yard slung fore-high/aft-low, triangular canvas
          const yardL = d.h * 0.9;
          const ly = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.005, L * 0.005, yardL, 6), m.mast);
          ly.rotation.z = 0.8;
          ly.position.set(d.x + yardL * 0.1, dy + d.h * 0.52, 0);
          g.add(ly);
          const lat = new THREE.Shape();
          lat.moveTo(0, 0); lat.lineTo(-yardL * 0.62, -d.h * 0.42); lat.lineTo(yardL * 0.28, -d.h * 0.1); lat.lineTo(0, 0);
          const lm = new THREE.Mesh(new THREE.ShapeGeometry(lat), m.sailDark);
          lm.position.set(d.x + yardL * 0.28, dy + d.h * 0.7, 0);
          lm.userData.billow = true;
          g.add(lm);
        } else {
          const gaffH = d.h * 0.5, boomL = L * 0.42;
          const main = new THREE.Mesh(sailGeo(boomL * 0.7, boomL, gaffH, W * 0.4, 4), m.sailV);
          main.position.set(d.x - boomL * 0.52, dy + gaffH * 0.7, 0);
          main.userData.billow = true;
          g.add(main);
        }
        if (di === 0) {
          // the forestay, served: foremast head down to the bowsprit
          servedStay(g, m, L, d.x, dy + mi.lowerH + mi.topH, 0, spritTip[0], spritTip[1], 0);
        } else {
          rig.push(d.x, dy + mi.lowerH + mi.topH, 0, defs[di - 1].x, dy + defs[di - 1].h * 0.58, 0); // topmast stay
          if (di === 1) {
            // the mainstay, the stoutest rope in the ship: main masthead
            // forward and down to the foremast's foot at the deck
            servedStay(g, m, L, d.x, dy + mi.lowerH, 0, defs[0].x + L * 0.05, deckY(0.9) + L * 0.02, 0);
          }
        }
        pinStations.push([d.x, dy]);
      });
      // jib on fore-stay
      const jib = new THREE.Shape();
      const fHead = [defs[0].x, deckY(0.78) + defs[0].h * 0.8];
      jib.moveTo(0, 0); jib.lineTo(fHead[0] - spritTip[0], fHead[1] - spritTip[1]); jib.lineTo((fHead[0] - spritTip[0]) * 0.25, 0); jib.lineTo(0, 0);
      const jm = new THREE.Mesh(new THREE.ShapeGeometry(jib), m.sailDark);
      jm.position.set(spritTip[0], spritTip[1], 0);
      jm.userData.billow = true;
      g.add(jm);
    }
    // the ship's boat: towed astern by the small fry, stowed amidships by the rest
    shipsBoat(g, m, L, H, deckY(0.5), sternY, type === 'sloop' || type === 'brigantine', rig);
    ropes(g, m, rig);
    deadeyes(g, m, dead);
    pinRails(g, m, L, pinStations, hullHalfW);

    // the ensign staff raked over the taffrail, the colours flown at its peak
    const staffH = sternY * 0.55;
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.0022, L * 0.0038, staffH, 5), m.mast);
    staff.position.set(-L * 0.515, sternY * 1.02 + staffH / 2, 0);
    staff.rotation.z = 0.12;
    g.add(staff);
    const truck = new THREE.Mesh(new THREE.SphereGeometry(L * 0.004, 6, 5), m.gold);
    truck.position.set(-L * 0.515 - staffH * 0.12, sternY * 1.02 + staffH, 0);
    g.add(truck);
    const ens = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.14, L * 0.09, 6, 2), m.flag);
    ens.position.set(-L * 0.59, sternY * 1.02 + staffH * 0.82, 0);
    ens.userData.flutter = true;
    g.add(ens);

    return g;
  }

  function shipInstance(type) {
    if (!protos[type]) protos[type] = buildProto(type);
    const inst = protos[type].clone();
    const anim = { billow: [], flutter: [] };
    inst.traverse((o) => {
      if (o.userData.billow) anim.billow.push(o);
      if (o.userData.flutter) anim.flutter.push(o);
    });
    return { inst, anim };
  }

  return { shipInstance, LENGTHS };
};
