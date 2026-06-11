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

(window.cartaInits = window.cartaInits || []).push(function init_harbor3d(carta) {
  const map = carta.map;
  if (((carta.gfx && carta.gfx.tier) || 0) < 3) return; // toggle not offered below tier 3

  const LS_KEY = 'cartaHarbor3d.v1';
  const LENGTHS = { canoe: 7, sloop: 18, brigantine: 24, merchantman: 30, 'man-of-war': 42 };
  // Period plans drew their ships hugely out of scale, and so do we: at this
  // chart's maxZoom a true-size man-of-war is a 13px lozenge.
  const SYMBOLIC_SCALE = 3.4;
  const D2RAD = Math.PI / 180;

  window.cartaHarbor3d = { active: false };
  let THREE = null;
  let failed = false;
  let MAT = null;
  const protos = {};

  /* ---------- shipwright ---------- */

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

  /* ---------- the town ashore ----------
     Rebuilt in harbortown.js: streets and plazas laid as real WebGL ground,
     planked wharves on piles with their cranes, battered masonry forts with
     merlons and guns, nation-styled houses carrying close-zoom detail
     (dormers, stoops, hanging signs), landmark churches a touch over scale,
     and sculpted, palm-grown relief. This module raises it all and drives
     the level-of-detail tier from the camera. */

  function buildTownAndLand() {
    if (!window.cartaTownBuilder) return { group: new THREE.Group(), lod: [], stats: {} };
    return window.cartaTownBuilder(THREE, carta, materials()).build(carta.harborStructures);
  }

  /* ---------- diorama water ----------
     A translucent swell sheet per harbour, foam whitening on the crests —
     after the fluid-diorama reference. It is inserted UNDER the hb-land
     fill, so the land masks it; ships render in a later pass against the
     shared depth buffer, so hulls sit properly IN the water. */

  let sharedRenderer = null;
  function rendererFor(gl) {
    if (!sharedRenderer) {
      sharedRenderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      sharedRenderer.autoClear = false;
    }
    return sharedRenderer;
  }

  // MapLibre hands us a matrix over absolute mercator coordinates, whose
  // magnitudes drown metres in float32 on the GPU — the whole scene
  // shimmers and crawls while the camera zooms. We render relative to the
  // map centre instead: the projection matrix folds T(ref) in (multiplied
  // here in JS, in double precision) and the camera stands at ref, so every
  // translation that reaches the GPU stays small.
  function applyCamera(camera, matrix) {
    const ref = maplibregl.MercatorCoordinate.fromLngLat(map.getCenter(), 0);
    camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix)
      .multiply(new THREE.Matrix4().makeTranslation(ref.x, ref.y, ref.z));
    camera.position.set(ref.x, ref.y, ref.z);
  }

  // The sheet dissolves into the engraved sea at its rim — no hard edge.
  function waterAlphaMap() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 160;
    const x = c.getContext('2d');
    x.fillStyle = '#000';
    x.fillRect(0, 0, 256, 160);
    x.save();
    x.translate(128, 80);
    x.scale(1, 160 / 256);
    const g = x.createRadialGradient(0, 0, 0, 0, 0, 126);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.72, '#fff');
    g.addColorStop(1, '#000');
    x.fillStyle = g;
    x.fillRect(-128, -128, 256, 256);
    x.restore();
    return new THREE.CanvasTexture(c);
  }

  function makeWaterLayer(boxes) {
    return {
      id: 'hb-water-3d',
      type: 'custom',
      renderingMode: '3d',
      onAdd(_, gl) {
        const alpha = waterAlphaMap();
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xeaf2f5, 1.1));
        const sun = new THREE.DirectionalLight(0xfff6e0, 2.0);
        sun.position.set(0.5, -0.6, 1);
        this.scene.add(sun);
        this.sheets = [];
        for (const b of boxes) {
          const sw = maplibregl.MercatorCoordinate.fromLngLat([b.w, b.s]);
          const ne = maplibregl.MercatorCoordinate.fromLngLat([b.e, b.n]);
          const x0 = Math.min(sw.x, ne.x), x1 = Math.max(sw.x, ne.x);
          const y0 = Math.min(sw.y, ne.y), y1 = Math.max(sw.y, ne.y);
          // The sheet's vertices stay local (centered on the box) — baking
          // absolute mercator coords into float32 attributes makes the
          // water shimmer and crawl as the camera moves.
          const geo = new THREE.PlaneGeometry(x1 - x0, y1 - y0, 72, 48);
          const count = geo.attributes.position.count;
          geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(0.4), 3));
          const mat = new THREE.MeshPhongMaterial({
            vertexColors: true, transparent: true, opacity: 0.78, alphaMap: alpha,
            shininess: 90, specular: 0x9fd4e8, side: THREE.DoubleSide,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
          this.scene.add(mesh);
          const mm = maplibregl.MercatorCoordinate
            .fromLngLat([(b.w + b.e) / 2, (b.s + b.n) / 2], 0).meterInMercatorCoordinateUnits();
          // three trains of swell, by wavelength and bearing
          const kv = [[58, 20, 1.1, 0.55], [27, 110, 1.9, 0.3], [13, 65, 3.1, 0.15]].map(
            ([lam, dir, om, w]) => [
              Math.cos(dir * D2RAD) * 2 * Math.PI / (lam * mm),
              Math.sin(dir * D2RAD) * 2 * Math.PI / (lam * mm),
              om, w,
            ]);
          this.sheets.push({ mesh, b, amp: mm * 0.9, kv });
        }
        this.t0 = performance.now();
      },
      render(gl, matrix) {
        if (map.getZoom() < 10.4 || document.hidden) return;
        const t = (performance.now() - this.t0) / 1000;
        const c = map.getCenter();
        for (const sh of this.sheets) {
          const b = sh.b; // animate only the harbour in view; the rest lie still
          if (c.lng < b.w - 0.06 || c.lng > b.e + 0.06 || c.lat < b.s - 0.06 || c.lat > b.n + 0.06) continue;
          const pos = sh.mesh.geometry.attributes.position;
          const col = sh.mesh.geometry.attributes.color;
          const a = sh.amp, kv = sh.kv;
          for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i);
            let z = 0;
            for (const [kx, ky, om, w] of kv) z += Math.sin(x * kx + y * ky + t * om) * w;
            // The whole crest stays below the chart datum: the sheet spans
            // land too (the land fill masks it visually), and any wave that
            // rose above ground wrote depth that clipped the shoreline
            // houses in and out, wave by wave.
            pos.setZ(i, a * (z - 1.15));
            const f = Math.max(0, z - 0.5) / 0.5; // the crests break white
            const ff = f * f;
            col.setXYZ(i, 0.15 + 0.85 * ff, 0.4 + 0.58 * ff, 0.52 + 0.48 * ff);
          }
          pos.needsUpdate = true;
          col.needsUpdate = true;
          sh.mesh.geometry.computeVertexNormals();
        }
        applyCamera(this.camera, matrix);
        const r = rendererFor(gl);
        r.resetState();
        r.render(this.scene, this.camera);
        map.triggerRepaint();
      },
    };
  }

  /* ---------- the custom layer ---------- */

  function makeShipsLayer(ships) {
    return {
      id: 'hb-ships-3d',
      type: 'custom',
      renderingMode: '3d',
      onAdd(_, gl) {
        this.camera = new THREE.Camera();
        this.scene = new THREE.Scene();
        this.scene.add(new THREE.AmbientLight(0xf0e4c8, 1.1));
        this.scene.add(new THREE.HemisphereLight(0xfff6e0, 0xcab389, 0.9));
        const sun = new THREE.DirectionalLight(0xfff2d0, 1.7);
        sun.position.set(0.6, 1, 0.8);
        this.scene.add(sun);
        this.ships = [];
        for (const s of ships) {
          const mc = maplibregl.MercatorCoordinate.fromLngLat(s.lngLat, 0);
          const sc = mc.meterInMercatorCoordinateUnits() * SYMBOLIC_SCALE;
          const base = new THREE.Matrix4()
            .makeTranslation(mc.x, mc.y, 0)
            .scale(new THREE.Vector3(sc, -sc, sc))
            .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
            .multiply(new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(90 - s.heading)));
          const { inst, anim } = shipInstance(s.type);
          inst.matrixAutoUpdate = false;
          this.scene.add(inst);
          this.ships.push({ group: inst, anim, base, phase: (s.lngLat[0] * 7919) % Math.PI });
        }
        const t3 = buildTownAndLand();
        this.scene.add(t3.group);
        this.lod = t3.lod;
        this.lodOn = null;
        window.cartaHarbor3d.stats = t3.stats;
        // the level-of-detail tree field (frustum-culled, billboarded at range)
        this.trees = null;
        if (window.cartaTreeSystem && t3.treeField && t3.treeField.length) {
          this.trees = window.cartaTreeSystem(THREE, map);
          this.trees.init(t3.treeField);
          this.scene.add(this.trees.group);
          window.cartaHarbor3d.stats.treeField = t3.treeField.length;
        }
        this.townFlutter = [];
        t3.group.traverse((o) => { if (o.userData.flutter) this.townFlutter.push(o); });
        this.renderer = rendererFor(gl);
        this.t0 = performance.now();
      },
      render(gl, matrix) {
        if (map.getZoom() < 10.4 || document.hidden) return; // asleep below harbor zoom
        const hi = map.getZoom() >= 14.2; // the close-zoom detail tier
        if (hi !== this.lodOn) {
          this.lodOn = hi;
          for (const o of this.lod) o.visible = hi;
        }
        const t = (performance.now() - this.t0) / 1000;
        const roll = new THREE.Matrix4();
        for (const s of this.ships) {
          roll.makeRotationZ(Math.sin(t * 0.9 + s.phase) * 0.022); // riding at anchor
          s.group.matrix.copy(s.base).multiply(roll);
          for (const sail of s.anim.billow) sail.scale.z = 1 + 0.14 * Math.sin(t * 1.2 + s.phase);
          for (const pen of s.anim.flutter) pen.rotation.y = Math.sin(t * 2.6 + s.phase) * 0.45;
        }
        for (let i = 0; i < this.townFlutter.length; i++) {
          this.townFlutter[i].rotation.y = Math.sin(t * 2.2 + i * 1.7) * 0.35;
        }
        if (this.trees) this.trees.update(matrix);
        applyCamera(this.camera, matrix);
        this.renderer.resetState();
        this.renderer.render(this.scene, this.camera);
        map.triggerRepaint();
      },
      onRemove() {
        if (this.renderer) this.renderer.resetState();
      },
    };
  }

  /* ---------- toggle & lifecycle ---------- */

  const shipsReady = () => new Promise((res) => {
    if (carta.harborShips) res();
    else carta.bus.on('harbors-ready', res);
  });

  async function enable() {
    if (failed) { sleeps(); return; }
    try {
      if (!THREE) THREE = await import('/vendor/three.module.min.js');
      await shipsReady();
      if (!map.getLayer('hb-water-3d') && map.getLayer('hb-land') && carta.harborBoxes) {
        map.addLayer(makeWaterLayer(carta.harborBoxes), 'hb-land');
      }
      if (!map.getLayer('hb-ships-3d')) {
        map.addLayer(makeShipsLayer(carta.harborShips));
      }
      window.cartaHarbor3d.active = true;
      carta.bus.emit('harbor3d-changed');
      try { localStorage.setItem(LS_KEY, '1'); } catch (e) { /* ignore */ }
    } catch (e) {
      console.warn('harbor3d: failed, falling back to engraved ships', e);
      failed = true;
      disable(true);
      sleeps();
    }
  }

  function disable(silent) {
    for (const id of ['hb-ships-3d', 'hb-water-3d']) {
      if (map.getLayer(id)) { try { map.removeLayer(id); } catch (e) { /* gone */ } }
    }
    window.cartaHarbor3d.active = false;
    carta.bus.emit('harbor3d-changed');
    if (!silent) { try { localStorage.setItem(LS_KEY, '0'); } catch (e) { /* ignore */ } }
  }

  function sleeps() {
    if (box) box.checked = false;
    carta.showCard('<h3>The harbour sleeps</h3><p>The living harbour could not be raised on this device; the engraved ships keep their stations.</p>');
    setTimeout(carta.hideCard, 3500);
  }

  const toggles = document.querySelector('#cartouche .toggles');
  let box = null;
  if (toggles) {
    const label = document.createElement('label');
    label.innerHTML = '<input type="checkbox" id="t-h3d"> A Living Harbour ⛵';
    label.title = 'ships in the round, riding at anchor (close zoom)';
    toggles.appendChild(label);
    box = label.querySelector('input');
    box.addEventListener('change', () => (box.checked ? enable() : disable()));
  }

  // On by default where the hardware allows (we only get here at tier ≥ 3);
  // the cartouche toggle is the remembered opt-out.
  let saved = '1';
  try { saved = localStorage.getItem(LS_KEY) || '1'; } catch (e) { /* ignore */ }
  if (saved === '1' && box) {
    box.checked = true;
    enable();
  }
});
