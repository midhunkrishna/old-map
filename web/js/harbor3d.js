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
    /* Hexes track the HD shipwright's weathered palette (harborshiphd.js:
       hull plank base #7a5836, wale 0x3c2c1a, deck #a98c5d, mast 0x6e5638,
       sail 0xeadfc2, iron 0x23211e) so the 175 m HD→base swap doesn't jump
       colour when a close ship demotes to this symbolic model. */
    /* Depth-fight discipline: the hull skin recedes a couple of polygon-offset
       units while everything layered over it (wales, waterline bands, deck)
       pulls forward — so the ink edges and the thin overlays win the z-buffer
       at ANY range. (The canoe camera runs near=0.1 with a multi-km far plane;
       absolute offsets of a few cm flickered in and out past ~200 m.) */
    MAT = {
      hull: new THREE.MeshLambertMaterial({ color: 0x7e5d3c, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }),
      wale: new THREE.MeshLambertMaterial({ color: 0x3c2c1a, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      castle: new THREE.MeshLambertMaterial({ color: 0x77573a }),
      deck: new THREE.MeshLambertMaterial({ color: 0xcdb488, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      mast: new THREE.MeshLambertMaterial({ color: 0x6e5638 }),
      sail: new THREE.MeshLambertMaterial({ color: 0xeadfc2, side: THREE.DoubleSide }),
      flag: new THREE.MeshLambertMaterial({ color: 0x8a3b2e, side: THREE.DoubleSide }),
      port: new THREE.MeshLambertMaterial({ color: 0x23211e }),
      // the waterline story, sampled from the HD loft's vertex tints: pale
      // tallow 'white stuff' below the waterline, weed-grime just above it
      // grime offsets one tier past tallow: their abutting extrusion caps at
      // 0.30·H are exactly coplanar, and the offset tier decides that fight
      tallow: new THREE.MeshLambertMaterial({ color: 0xddd2b0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      grime: new THREE.MeshLambertMaterial({ color: 0x554a33, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
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

  /* Sheer & bow-rake warp for the hull-frame extrusions (pre-rotation local
     frame: x fore-aft, z up). The rail rises toward bow and — more — toward
     the stern, matching the HD loft's sheer line; the stem rakes forward at
     the top. Weight = (baseY + z)/H so the keel stays put and anything
     riding higher sweeps more. Costs zero triangles. */
  function sheerWarp(geo, L, H, baseY, sternRise) {
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      const t = x / L + 0.5;                       // 0 stern → 1 bow
      const w = Math.max(0, Math.min(1.4, (baseY + z) / H));
      const sheer = 0.14 * Math.pow(Math.abs(2 * t - 1), 2) + (t < 0.5 ? (0.5 - t) * sternRise : 0);
      p.setZ(i, z + H * sheer * w);
      if (x > 0) p.setX(i, x + L * 0.05 * Math.pow(w, 1.5) * Math.pow(x / (L * 0.5), 3));
    }
    p.needsUpdate = true;
    geo.computeVertexNormals();
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
      // extrusion runs UP from the mesh origin: keel at y=0 ⇒ position.y = 0
      const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(deckShape(L, W * 1.2), { depth: H, bevelEnabled: false }), m.hull);
      hull.rotation.x = -Math.PI / 2;
      hull.position.y = 0;
      g.add(hull);
      const hut = new THREE.Mesh(new THREE.BoxGeometry(L * 0.3, H, W * 0.5), m.deck);
      hut.position.y = H * 1.45;
      g.add(hut);
      return g;
    }

    /* hull, wales, deck.  The −π/2-rotated extrusion runs UP from the mesh
       origin, so position.y = 0 puts the keel at the proto's y=0 — the proto's
       origin IS the keel line, and the diorama sinks it draft-deep into the
       swell. (The old +H offset here floated every ship one hull-height in
       the air — glaring once seen from the canoe at water level.) */
    const sternRise = type === 'merchantman' ? 0.5 : type === 'man-of-war' ? 0.42 : 0.26; // same per-type rise as the HD loft
    const hullGeo = new THREE.ExtrudeGeometry(deckShape(L, W), { depth: H, bevelEnabled: false });
    sheerWarp(hullGeo, L, H, 0, sternRise);
    const hull = new THREE.Mesh(hullGeo, m.hull);
    hull.rotation.x = -Math.PI / 2;
    hull.position.y = 0;
    g.add(hull);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(hullGeo, 30), m.edge);
    edges.rotation.x = -Math.PI / 2;
    edges.position.y = 0;
    g.add(edges); // the engraver's outline
    for (const wy of [0.5, 0.78]) { // wales: dark strakes proud of the planking, swept along the sheer
      const wGeo = new THREE.ExtrudeGeometry(deckShape(L, W, 1.045), { depth: H * 0.1, bevelEnabled: false });
      sheerWarp(wGeo, L, H, H * (wy + 0.1), sternRise);
      const wale = new THREE.Mesh(wGeo, m.wale);
      wale.rotation.x = -Math.PI / 2;
      wale.position.y = H * wy + H * 0.1;
      g.add(wale);
    }
    /* waterline bands, kept level (no sheer — water is flat): the diorama
       sinks the hull 0.22·H, so a pale sliver of tallow shows to 0.30·H with
       the dark weed-grime strake riding above it — the HD hulls' colour story
       legible from 300 m out */
    const tallow = new THREE.Mesh(new THREE.ExtrudeGeometry(deckShape(L, W, 1.03), { depth: H * 0.30, bevelEnabled: false }), m.tallow);
    tallow.rotation.x = -Math.PI / 2;
    tallow.position.y = 0;
    g.add(tallow);
    const grime = new THREE.Mesh(new THREE.ExtrudeGeometry(deckShape(L, W, 1.035), { depth: H * 0.12, bevelEnabled: false }), m.grime);
    grime.rotation.x = -Math.PI / 2;
    grime.position.y = H * 0.30;
    g.add(grime);
    /* deck: warped with the SAME sheer as the hull's top cap (baseY = H ⇒
       weight 1, exactly the cap vertices' warp) so it rides a constant 0.02
       above it — the old flat plane crossed the warped cap and the deck
       cut in and out toward bow and stern */
    const deckGeo = new THREE.ShapeGeometry(deckShape(L, W * 0.94));
    sheerWarp(deckGeo, L, H, H, sternRise);
    const deck = new THREE.Mesh(deckGeo, m.deck);
    deck.rotation.x = -Math.PI / 2;
    deck.position.y = H + 0.02;
    g.add(deck);

    /* castles: quarterdeck aft (all), forecastle (man-of-war) */
    const qd = new THREE.Mesh(new THREE.ExtrudeGeometry(deckShape(L * 0.62, W * 0.86), { depth: H * 0.62, bevelEnabled: false }), m.castle);
    qd.rotation.x = -Math.PI / 2;
    qd.position.set(-L * 0.27, H, 0);          // extrusion runs up: base sits on the deck
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
      // deep enough in z (was an absolute 2 cm) to straddle the approximated
      // hull surface — the paper-thin ports sat tangent to the skin and
      // flickered in and out as she rolled
      const portGeo = new THREE.BoxGeometry(L * 0.035, L * 0.028, L * 0.02);
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
        squareSail(g, d.x, H + lowerH * 0.66, wC * 0.82, wC * 0.95, lowerH * 0.5, W * 0.44); // fuller belly: the billow reads at range
        spar(g, d.x, headY - topH * 0.12, wC * 0.72, L * 0.008);
        squareSail(g, d.x, H + lowerH + topH * 0.42, wC * 0.55, wC * 0.74, topH * 0.55, W * 0.34);
      } else {
        // fore-and-aft gaff sail abaft the mast, along the centerline
        const gaffH = lowerH * 0.85, boomL = L * 0.5;
        const sail = new THREE.Mesh(sailGeo(boomL * 0.7, boomL, gaffH, W * 0.28), m.sail);
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
    // anchor-ripple ring: keel-relative, riding just clear of the waterline once
    // the diorama sinks the hull draft-deep (draft = 0.22·H at symbolic scale)
    // 0.5 m of freeboard for the ring: the swell trains run ±0.34 m and the
    // ship only tracks the water at her own centre — at 0.15 m the broad flat
    // ring dipped under the passing crests and visibly cut in and out
    const ring = new THREE.Mesh(new THREE.RingGeometry(L * 0.58, L * 0.64, 28), m.ring);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = H * 0.22 + 0.5;
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
