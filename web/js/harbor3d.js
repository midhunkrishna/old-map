/* Carta Temporum — harbor3d module (Part B, Rung 3): "A Living Harbour".
   Opt-in: a cartouche toggle (offered at gfx tier ≥ 3 only) lazy-loads the
   vendored Three.js and raises high-fidelity procedural period vessels at
   the charted anchorages — sheer hulls with wales and gunports, quarterdecks,
   bowsprits, tapered masts with tops and yards, bellied sails, standing
   rigging drawn in ink, streaming pennants, anchor cables — every one a
   paper-diorama engraving in the round, riding gently at anchor. Ships are
   drawn at symbolic scale, as the period chartmakers drew them. Any failure
   strikes the toggle and falls back to the engraved ship marks ("the harbour
   sleeps"). Registered via window.cartaInits. */
'use strict';

/* ---------- shipwright ----------
   A self-contained factory for the period vessels — materials, prototypes,
   instances. Shared by the map-embedded Living Harbour below and by the
   standalone diorama (harbordiorama.js); both pass the same cached Three.js
   module, so the protos and materials build once per engine. */
window.cartaShipwright = function cartaShipwright(THREE) {
  const D2RAD = Math.PI / 180;
  const LENGTHS = { canoe: 7, sloop: 18, brigantine: 24, merchantman: 30, 'man-of-war': 42 };
  // Period plans drew their ships hugely out of scale, and so do we: at this
  // chart's maxZoom a true-size man-of-war is a 13px lozenge.
  const SYMBOLIC_SCALE = 3.4;
  let MAT = null;
  const protos = {};

  function materials() {
    if (MAT) return MAT;
    MAT = {
      hull: new THREE.MeshLambertMaterial({ color: 0x8a6a45 }),
      wale: new THREE.MeshLambertMaterial({ color: 0x4a3826 }),
      castle: new THREE.MeshLambertMaterial({ color: 0x7d5f3e }),
      deck: new THREE.MeshLambertMaterial({ color: 0xd8c49a }),
      mast: new THREE.MeshLambertMaterial({ color: 0x6b5436 }),
      sail: new THREE.MeshLambertMaterial({ color: 0xf0e4c8, side: THREE.DoubleSide }),
      flag: new THREE.MeshLambertMaterial({ color: 0x8a3b2e, side: THREE.DoubleSide }),
      port: new THREE.MeshLambertMaterial({ color: 0x2e241a }),
      lantern: new THREE.MeshBasicMaterial({ color: 0xffd890 }),
      ring: new THREE.MeshBasicMaterial({ color: 0x5b4636, transparent: true, opacity: 0.22, side: THREE.DoubleSide }),
      ink: new THREE.LineBasicMaterial({ color: 0x3d2f1e, transparent: true, opacity: 0.55 }),
      edge: new THREE.LineBasicMaterial({ color: 0x3d2f1e, transparent: true, opacity: 0.4 }),
    };
    return MAT;
  }

  // Deck plan: pointed bow at +x, rounded stern; width multiplier for wales.
  function deckShape(L, W, wMul) {
    const w = (wMul || 1);
    const s = new THREE.Shape();
    s.moveTo(L * 0.5, 0);
    s.quadraticCurveTo(L * 0.18, W * 0.62 * w, -L * 0.34, W * 0.5 * w);
    s.quadraticCurveTo(-L * 0.5, W * 0.32 * w, -L * 0.5, 0);
    s.quadraticCurveTo(-L * 0.5, -W * 0.32 * w, -L * 0.34, -W * 0.5 * w);
    s.quadraticCurveTo(L * 0.18, -W * 0.62 * w, L * 0.5, 0);
    return s;
  }

  // Bellied trapezoid sail, wider at the foot, more belly low. Animated by
  // scale.z in the render loop (userData.billow).
  function sailGeo(wHead, wFoot, h, belly) {
    const NX = 8, NY = 4;
    const pos = [], idx = [], uv = [];
    for (let j = 0; j <= NY; j++) {
      const v = j / NY;                 // 0 head … 1 foot
      const w = wHead + (wFoot - wHead) * v;
      for (let i = 0; i <= NX; i++) {
        const u = i / NX;
        const x = (u - 0.5) * w;
        const y = (0.5 - v) * h;
        const z = belly * (1 - Math.pow(2 * u - 1, 2)) * (0.45 + 0.55 * v);
        pos.push(x, y, z);
        uv.push(u, 1 - v);
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
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function squareSail(group, x, y, wHead, wFoot, h, belly) {
    const m = materials();
    const sail = new THREE.Mesh(sailGeo(wHead, wFoot, h, belly), m.sail);
    sail.rotation.y = Math.PI / 2; // square to the keel, belly aft
    sail.position.set(x, y, 0);
    sail.userData.billow = true;
    group.add(sail);
    return sail;
  }

  function spar(group, x, y, w, r) {
    const m = materials();
    const yard = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r * 0.7, w, 5), m.mast);
    yard.rotation.x = Math.PI / 2; // athwartships
    yard.position.set(x, y, 0);
    group.add(yard);
  }

  function riggingLines(pts) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return new THREE.LineSegments(g, materials().ink);
  }

  function buildProto(type) {
    const m = materials();
    const g = new THREE.Group();
    const L = LENGTHS[type] || 18, W = L * 0.27, H = L * 0.13;
    const rig = []; // rigging line endpoints, pushed in pairs

    if (type === 'canoe') {
      const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(deckShape(L, W * 1.2), { depth: H, bevelEnabled: false }), m.hull);
      hull.rotation.x = -Math.PI / 2;
      hull.position.y = H;
      g.add(hull);
      const hut = new THREE.Mesh(new THREE.BoxGeometry(L * 0.3, H, W * 0.5), m.deck);
      hut.position.y = H * 1.6;
      g.add(hut);
      return g;
    }

    /* hull, wales, deck */
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(deckShape(L, W), { depth: H, bevelEnabled: false }), m.hull);
    hull.rotation.x = -Math.PI / 2;
    hull.position.y = H;
    g.add(hull);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(hull.geometry, 30), m.edge);
    edges.rotation.x = -Math.PI / 2;
    edges.position.y = H;
    g.add(edges); // the engraver's outline
    for (const wy of [0.5, 0.78]) { // wales: dark strakes proud of the planking
      const wale = new THREE.Mesh(new THREE.ExtrudeGeometry(deckShape(L, W, 1.045), { depth: H * 0.1, bevelEnabled: false }), m.wale);
      wale.rotation.x = -Math.PI / 2;
      wale.position.y = H * wy + H * 0.1;
      g.add(wale);
    }
    const deck = new THREE.Mesh(new THREE.ShapeGeometry(deckShape(L, W * 0.94)), m.deck);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = H + 0.02;
    g.add(deck);

    /* castles: quarterdeck aft (all), forecastle (man-of-war) */
    const qd = new THREE.Mesh(new THREE.ExtrudeGeometry(deckShape(L * 0.62, W * 0.86), { depth: H * 0.62, bevelEnabled: false }), m.castle);
    qd.rotation.x = -Math.PI / 2;
    qd.position.set(-L * 0.27, H + H * 0.62, 0);
    g.add(qd);
    if (type === 'man-of-war') {
      const fc = new THREE.Mesh(new THREE.BoxGeometry(L * 0.16, H * 0.45, W * 0.7), m.castle);
      fc.position.set(L * 0.3, H + H * 0.22, 0);
      g.add(fc);
    }

    /* gunports */
    const portRows = type === 'man-of-war' ? 2 : type === 'merchantman' ? 1 : 0;
    if (portRows) {
      const n = type === 'man-of-war' ? 7 : 4;
      const portGeo = new THREE.BoxGeometry(L * 0.035, L * 0.028, 0.02);
      for (let row = 0; row < portRows; row++) {
        for (let i = 0; i < n; i++) {
          const x = -L * 0.36 + (i / (n - 1)) * L * 0.62;
          const zHalf = W * (0.56 - Math.pow(Math.abs(x) / (L * 0.55), 2) * 0.3);
          for (const side of [-1, 1]) {
            const port = new THREE.Mesh(portGeo, m.port);
            port.position.set(x, H * (0.42 + row * 0.34), side * zHalf);
            g.add(port);
          }
        }
      }
    }

    /* bowsprit */
    const spritLen = L * 0.42;
    const sprit = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.008, L * 0.014, spritLen, 5), m.mast);
    sprit.position.set(L * 0.52 + spritLen * 0.42, H + spritLen * 0.11, 0);
    sprit.rotation.z = -Math.PI / 2 + 0.22; // steeved upward
    g.add(sprit);
    const spritTip = [L * 0.52 + spritLen * 0.85, H + spritLen * 0.21, 0];

    /* masts, tops, yards, sails */
    const mastDefs = {
      sloop: [{ x: L * 0.08, h: L * 1.0 }],
      brigantine: [{ x: L * 0.2, h: L * 0.95, sq: true }, { x: -L * 0.18, h: L * 0.88 }],
      merchantman: [{ x: L * 0.27, h: L * 0.9, sq: true }, { x: 0, h: L * 1.05, sq: true }, { x: -L * 0.3, h: L * 0.7, sq: true }],
      'man-of-war': [{ x: L * 0.27, h: L * 0.95, sq: true }, { x: 0, h: L * 1.12, sq: true }, { x: -L * 0.3, h: L * 0.75, sq: true }],
    }[type] || [];

    let foremastHead = null;
    mastDefs.forEach((d, mi) => {
      const lowerH = d.h * 0.58, topH = d.h * 0.5;
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.013, L * 0.02, lowerH, 6), m.mast);
      lower.position.set(d.x, H + lowerH / 2, 0);
      g.add(lower);
      const top = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.04, L * 0.04, L * 0.012, 8), m.mast);
      top.position.set(d.x, H + lowerH, 0);
      g.add(top); // the fighting top
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(L * 0.007, L * 0.011, topH, 5), m.mast);
      upper.position.set(d.x, H + lowerH + topH / 2 - L * 0.02, 0);
      g.add(upper);
      const headY = H + lowerH + topH - L * 0.04;
      if (mi === 0) foremastHead = [d.x, headY, 0];

      const isSquare = d.sq || type === 'sloop' && false;
      if (isSquare) {
        const wC = W * 2.1 * (mi === mastDefs.length - 1 ? 0.8 : 1);
        spar(g, d.x, H + lowerH * 0.92, wC, L * 0.01);
        squareSail(g, d.x, H + lowerH * 0.66, wC * 0.82, wC * 0.95, lowerH * 0.5, W * 0.34);
        spar(g, d.x, headY - topH * 0.12, wC * 0.72, L * 0.008);
        squareSail(g, d.x, H + lowerH + topH * 0.42, wC * 0.55, wC * 0.74, topH * 0.55, W * 0.26);
      } else {
        // fore-and-aft gaff sail abaft the mast, along the centerline
        const gaffH = lowerH * 0.85, boomL = L * 0.5;
        const sail = new THREE.Mesh(sailGeo(boomL * 0.7, boomL, gaffH, W * 0.2), m.sail);
        sail.rotation.y = 0; // in the keel plane
        sail.position.set(d.x - boomL / 2 - L * 0.02, H + gaffH * 0.62, 0);
        sail.userData.billow = true;
        g.add(sail);
        rig.push(d.x, headY, 0, d.x - boomL - L * 0.02, H + gaffH * 1.1, 0); // the gaff
      }

      /* standing rigging: shrouds & stays */
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          rig.push(d.x, H + lowerH, 0, d.x - L * 0.03 - k * L * 0.035, H, side * W * 0.46);
        }
      }
      if (mi === 0) rig.push(d.x, headY, 0, spritTip[0], spritTip[1], spritTip[2]); // forestay
      else rig.push(d.x, headY, 0, mastDefs[mi - 1].x, H + mastDefs[mi - 1].h * 0.58, 0);
      if (mi === mastDefs.length - 1) rig.push(d.x, headY, 0, -L * 0.48, H * 1.4, 0); // backstay
    });

    /* jib: foremast head to bowsprit tip */
    if (foremastHead && type !== 'sloop') {
      const jib = new THREE.Shape();
      jib.moveTo(0, 0);
      jib.lineTo(foremastHead[0] - spritTip[0], foremastHead[1] - spritTip[1]);
      jib.lineTo(foremastHead[0] - spritTip[0] + L * 0.06, 0);
      jib.lineTo(0, 0);
      const jibMesh = new THREE.Mesh(new THREE.ShapeGeometry(jib), m.sail);
      jibMesh.position.set(spritTip[0], spritTip[1], 0);
      jibMesh.userData.billow = true;
      g.add(jibMesh);
    }
    if (type === 'sloop' && foremastHead) {
      rig.push(foremastHead[0], foremastHead[1], 0, spritTip[0], spritTip[1], spritTip[2]);
      const jib = new THREE.Shape();
      jib.moveTo(0, 0);
      jib.lineTo(foremastHead[0] - spritTip[0], foremastHead[1] - spritTip[1]);
      jib.lineTo(foremastHead[0] - spritTip[0] + L * 0.05, 0);
      const jibMesh = new THREE.Mesh(new THREE.ShapeGeometry(jib), m.sail);
      jibMesh.position.set(spritTip[0], spritTip[1], 0);
      jibMesh.userData.billow = true;
      g.add(jibMesh);
    }

    /* pennant: a long streamer at the main masthead */
    if (mastDefs.length) {
      const main = mastDefs.length >= 2 ? mastDefs[1] : mastDefs[0];
      const headY = H + main.h * 1.04;
      const pen = new THREE.Mesh(new THREE.PlaneGeometry(L * 0.22, L * 0.022, 6, 1), m.flag);
      pen.position.set(main.x - L * 0.12, headY, 0);
      pen.userData.flutter = true;
      g.add(pen);
    }

    /* anchor cable, stern lantern, waterline ring */
    rig.push(L * 0.46, H * 0.7, 0, L * 0.85, 0.2, W * 0.18);
    if (type === 'man-of-war') {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(L * 0.016, 6, 5), m.lantern);
      lamp.position.set(-L * 0.5, H * 2.1, 0);
      g.add(lamp);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(L * 0.58, L * 0.64, 28), m.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.4;
    g.add(ring);

    g.add(riggingLines(rig));
    return g;
  }

  function shipInstance(type) {
    if (!protos[type]) protos[type] = buildProto(type);
    const inst = protos[type].clone(); // shares geometry & materials
    const anim = { billow: [], flutter: [] };
    inst.traverse((o) => {
      if (o.userData.billow) anim.billow.push(o);
      if (o.userData.flutter) anim.flutter.push(o);
    });
    return { inst, anim };
  }

  return { materials, buildProto, shipInstance, LENGTHS, SYMBOLIC_SCALE };
};

/* The map-embedded Living Harbour (Rung 3: the hb-water-3d / hb-ships-3d
   custom layers + applyCamera) has been retired. The harbour now rises as a
   standalone rotatable diorama on its own canvas (harbordiorama.js), which
   reuses the shipwright above together with cartaTownBuilder and
   cartaTreeSystem. The map keeps the flat engraved plan, extrusion slabs and
   marks as its in-place preview. */
