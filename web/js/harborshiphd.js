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
      hull: new THREE.MeshStandardMaterial({ map: plankTexture('#7a5836', 'rgba(28,18,8,0.7)', 0.28), color: 0xb9986a, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide }),
      wale: new THREE.MeshStandardMaterial({ color: 0x3c2c1a, roughness: 0.9 }),
      deck: new THREE.MeshStandardMaterial({ map: plankTexture('#a98c5d', 'rgba(48,34,16,0.65)', 0.18), color: 0xd9c193, roughness: 0.92, side: THREE.DoubleSide }),
      castle: new THREE.MeshStandardMaterial({ map: plankTexture('#6d4e2e', 'rgba(24,15,6,0.7)', 0.3), color: 0xb08c5c, roughness: 0.88 }),
      mast: new THREE.MeshStandardMaterial({ color: 0x6e5638, roughness: 0.85 }),
      sail: new THREE.MeshStandardMaterial({ color: 0xeadfc2, roughness: 0.95, side: THREE.DoubleSide }),
      sailDark: new THREE.MeshStandardMaterial({ color: 0xd9c9a4, roughness: 0.95, side: THREE.DoubleSide }),
      iron: new THREE.MeshStandardMaterial({ color: 0x23211e, roughness: 0.6, metalness: 0.55 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xc89a4a, roughness: 0.45, metalness: 0.6 }),
      window: new THREE.MeshStandardMaterial({ color: 0xffc879, emissive: 0xffaa3d, emissiveIntensity: 1.5, roughness: 0.4 }),
      lantern: new THREE.MeshStandardMaterial({ color: 0xffd890, emissive: 0xffb347, emissiveIntensity: 2.0, roughness: 0.3 }),
      flag: new THREE.MeshStandardMaterial({ color: 0x8a3b2e, roughness: 0.9, side: THREE.DoubleSide }),
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
    const nS = 30, nU = 18;
    const tum = o.tumblehome != null ? o.tumblehome : 0.12;
    const sternRound = o.sternRound != null ? o.sternRound : 0.5; // 1 = fluyt-round
    const pos = [], uv = [], idx = [];
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
    g.setIndex(idx);
    g.computeVertexNormals();
    return { geo: g, railsTop, nS, nU };
  }

  // the deck: a strip laid between the rails a bit below the bulwark top
  function deckGeo(railsTop, drop) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i < railsTop.length; i++) {
      const [x, yTop, hw] = railsTop[i];
      const w = hw * 0.96;
      pos.push(x, yTop - drop, -w, x, yTop - drop, w);
      uv.push(i * 0.45, 0, i * 0.45, w * 0.5);
    }
    for (let i = 0; i < railsTop.length - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
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

  function sailGeo(wHead, wFoot, h, belly) {
    const NX = 10, NY = 6;
    const pos = [], idx = [], uvs = [];
    for (let j = 0; j <= NY; j++) {
      const v = j / NY;
      const w = wHead + (wFoot - wHead) * v;
      for (let i = 0; i <= NX; i++) {
        const u = i / NX;
        pos.push((u - 0.5) * w, (0.5 - v) * h, belly * (1 - Math.pow(2 * u - 1, 2)) * (0.45 + 0.55 * v));
        uvs.push(u, 1 - v);
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

  function yardWithSail(mastInfo, m, relY, span, sailH, belly, mat) {
    const { grp } = mastInfo;
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(span * 0.012, span * 0.012, span, 7), m.mast);
    yard.rotation.x = Math.PI / 2;
    yard.position.y = relY;
    grp.add(yard);
    const sail = new THREE.Mesh(sailGeo(span * 0.86, span * 0.97, sailH, belly), mat || m.sail);
    sail.rotation.y = Math.PI / 2;
    sail.position.y = relY - sailH * 0.52;
    sail.userData.billow = true;
    grp.add(sail);
    return sail;
  }

  // standing rigging: shrouds with ratline rungs, as ink lines
  function shrouds(g, m, mastInfo, hullHalfW, nLines) {
    const pts = [], rats = [];
    const { x, deckY, lowerH } = mastInfo;
    const headY = deckY + lowerH;
    for (const side of [-1, 1]) {
      const anchors = [];
      for (let k = 0; k < nLines; k++) {
        const ax = x - lowerH * 0.06 - k * lowerH * 0.085;
        const az = side * hullHalfW;
        anchors.push([ax, deckY, az]);
        pts.push(x, headY, side * 0.1, ax, deckY, az);
      }
      for (let r = 1; r <= 7; r++) {            // the ratline rungs
        const f = r / 8;
        const y = deckY + (headY - deckY) * f;
        const a0 = anchors[0], aN = anchors[nLines - 1];
        rats.push(
          x + (a0[0] - x) * (1 - f), y, side * (0.1 + (hullHalfW - 0.1) * (1 - f)),
          x + (aN[0] - x) * (1 - f), y, side * (0.1 + (hullHalfW - 0.1) * (1 - f)),
        );
      }
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.add(new THREE.LineSegments(sg, m.rope));
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rats, 3));
    g.add(new THREE.LineSegments(rg, m.ratline));
  }

  function ropes(g, m, segs) {
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
    g.add(new THREE.LineSegments(sg, m.rope));
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

  function cannons(g, m, L, railsTop, rows, perSide) {
    const geo = new THREE.CylinderGeometry(L * 0.0075, L * 0.0095, L * 0.05, 7);
    for (let row = 0; row < rows; row++) {
      for (let i = 0; i < perSide; i++) {
        const t = 0.24 + (i / (perSide - 1)) * 0.5;
        const si = Math.min(railsTop.length - 1, Math.round(t * (railsTop.length - 1)));
        const [x, yTop, hw] = railsTop[si];
        for (const side of [-1, 1]) {
          const gun = new THREE.Mesh(geo, m.iron);
          gun.rotation.z = Math.PI / 2;
          gun.rotation.y = side * Math.PI / 2;
          gun.position.set(x, yTop * (0.52 + row * 0.22), side * (hw * (1.02 + 0.06 * (1 - row))));
          gun.rotation.x = side * 0.06;
          g.add(gun);
        }
      }
    }
  }

  function deckClutter(g, m, L, deckY) {
    // barrels, a hatch grating, a capstan — the lived-in deck
    for (const [bx, bz] of [[-L * 0.1, L * 0.05], [-L * 0.13, -L * 0.04], [L * 0.12, L * 0.03]]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.018, L * 0.015, L * 0.04, 9), m.castle);
      b.position.set(bx, deckY + L * 0.02, bz);
      g.add(b);
    }
    const hatch = new THREE.Mesh(new THREE.BoxGeometry(L * 0.1, L * 0.012, L * 0.07), m.wale);
    hatch.position.set(L * 0.05, deckY + L * 0.006, 0);
    g.add(hatch);
    const capstan = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.014, L * 0.02, L * 0.045, 8), m.castle);
    capstan.position.set(-L * 0.02, deckY + L * 0.022, 0);
    g.add(capstan);
  }

  function anchor(g, m, L, x, y, side) {
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
    const loft = hullLoft(L, W, H, {
      tumblehome: isFluyt ? 0.30 : isMow ? 0.16 : 0.08,
      sternRound: isFluyt ? 0.9 : 0.35,
      sternRise: isFluyt ? 0.5 : isMow ? 0.42 : 0.26,
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
    const qd = new THREE.Mesh(new THREE.BoxGeometry(L * (isFluyt ? 0.2 : 0.26), H * 0.5, W * (isFluyt ? 1.0 : 1.5)), m.castle);
    qd.position.set(-L * 0.36, sternY * 0.92, 0);
    g.add(qd);
    if (isMow) {
      const fc = new THREE.Mesh(new THREE.BoxGeometry(L * 0.14, H * 0.36, W * 1.3), m.castle);
      fc.position.set(L * 0.3, deckY(0.78) + H * 0.2, 0);
      g.add(fc);
      // beakhead: the gallant prow forward of the stem
      const beak = new THREE.Mesh(new THREE.ConeGeometry(W * 0.3, L * 0.12, 6), m.castle);
      beak.rotation.z = -Math.PI / 2;
      beak.position.set(L * 0.54, H * 0.85, 0);
      g.add(beak);
      const fig = new THREE.Mesh(new THREE.SphereGeometry(W * 0.16, 8, 6), m.gold);
      fig.position.set(L * 0.6, H * 0.9, 0);
      g.add(fig);                                 // the gilded figurehead
    }

    // guns
    if (isMow) cannons(g, m, L, loft.railsTop, 2, 7);
    else if (type === 'merchantman') cannons(g, m, L, loft.railsTop, 1, 4);
    else cannons(g, m, L, loft.railsTop, 1, 3);

    deckClutter(g, m, L, deckY(0.5));
    anchor(g, m, L, L * 0.42, H * 0.9, W * 1.05);

    // bowsprit (steeved up) + spritsail yard, the period's head rig
    const spritLen = L * 0.42;
    const sprit = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.007, L * 0.013, spritLen, 7), m.mast);
    sprit.position.set(L * 0.5 + spritLen * 0.4, H * 1.1 + spritLen * 0.13, 0);
    sprit.rotation.z = -Math.PI / 2 + 0.3;
    g.add(sprit);
    const spritTip = [L * 0.5 + spritLen * 0.78, H * 1.1 + spritLen * 0.27, 0];
    if (!isFluyt && type !== 'sloop') {
      const sy = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.005, L * 0.005, W * 1.8, 6), m.mast);
      sy.rotation.x = Math.PI / 2;
      sy.position.set(L * 0.56, H * 1.05 + spritLen * 0.12, 0);
      g.add(sy);                                  // spritsail yard
    }

    /* ----- masts & canvas per type ----- */
    const rig = [];
    const hullHalfW = W * 0.95;
    if (type === 'sloop') {
      // one raked mast, gaff main + jib — the Jamaica sloop silhouette
      const mi = mast(g, m, L * 0.1, deckY(0.62), L * 0.95, 0.1);
      shrouds(g, m, { ...mi, x: L * 0.1, deckY: deckY(0.62) }, hullHalfW, 3);
      // gaff mainsail: head on the gaff, foot on the boom, along the centreline
      const gaffH = L * 0.5, boomL = L * 0.55;
      const main = new THREE.Mesh(sailGeo(boomL * 0.72, boomL, gaffH, W * 0.5), m.sail);
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
      rig.push(L * 0.1, headY, 0, spritTip[0], spritTip[1], 0);
      rig.push(L * 0.1, headY, 0, -L * 0.48, sternY, 0);
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
        shrouds(g, m, { ...mi, x: d.x, deckY: dy }, hullHalfW, isMow ? 4 : 3);
        if (d.sq === true) {
          const span = W * 3.1 * (di === 2 ? 0.7 : 1);
          yardWithSail(mi, m, mi.lowerH * 0.88, span, mi.lowerH * 0.52, W * 0.5, m.sail);
          yardWithSail(mi, m, mi.lowerH + mi.topH * 0.78, span * 0.74, mi.topH * 0.62, W * 0.36, m.sailDark);
          if (isMow) yardWithSail(mi, m, mi.lowerH + mi.topH + mi.tgH * 0.6, span * 0.5, mi.tgH * 0.62, W * 0.22, m.sail);
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
          const main = new THREE.Mesh(sailGeo(boomL * 0.7, boomL, gaffH, W * 0.4), m.sail);
          main.position.set(d.x - boomL * 0.52, dy + gaffH * 0.7, 0);
          main.userData.billow = true;
          g.add(main);
        }
        if (di === 0) rig.push(d.x, dy + mi.lowerH + mi.topH, 0, spritTip[0], spritTip[1], 0);
        else rig.push(d.x, dy + mi.lowerH + mi.topH, 0, defs[di - 1].x, dy + defs[di - 1].h * 0.58, 0);
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
    ropes(g, m, rig);

    // the ensign at the stern, streaming
    const ens = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.14, L * 0.09, 6, 2), m.flag);
    ens.position.set(-L * 0.52, sternY * 1.45, 0);
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
