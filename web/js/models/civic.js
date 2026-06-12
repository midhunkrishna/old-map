/* Carta Temporum — building models: Defense & Government.
   Factories for the public works — the generic cupola'd hall, the shore
   battery (with its hash-optional powder hut and shot pyramid), the
   gallows (with its hash-optional gibbet at the Points), the governor's
   mansion and the prison.
   Contract: factory(ctx, spec) → THREE.Group in local metres, origin at
   ground, +z the front; ctx supplies mats/helpers, spec the point data. */
'use strict';
(function () {
  // Shared registry — identical boilerplate in every model file; the first
  // one loaded creates it, the rest reuse it.
  if (!window.cartaBuildingModels) {
    window.cartaBuildingModels = {
      factories: {},
      kits: {},
      register(kind, fn) { this.factories[kind] = fn; },
      registerKit(name, fn) { this.kits[name] = fn; },
      get(kind) { return this.factories[kind] || null; },
    };
  }
  const reg = window.cartaBuildingModels;

  // a deterministic 0..1 stream for canvas painters — each cached canvas is
  // painted exactly once, keyed by string, so the stream seeds from the key
  const painterRand = (key) => {
    let s = 2166136261;
    for (let i = 0; i < key.length; i++) s = ((s ^ key.charCodeAt(i)) * 16777619) >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };

  // The generic public hall: a two-storey block under a hipped roof, a
  // cupola and leaded cap above. Also the fallback for unknown kinds.
  reg.register('building', function building(ctx, spec) {
    const { THREE, box, roofOn, mats } = ctx;
    const style = spec.style;
    const g = new THREE.Group();
    box(g, mats.stoneMat, 15, 0.7, 10, 0);
    box(g, new THREE.MeshLambertMaterial({ color: 0xe7dcc0, map: ctx.facadeTexture(style, 2) }), 14, 6.5, 9, 0);
    roofOn(g, 'hip', style === 'spanish' ? mats.tileMat : mats.shingleMat, 14, 2.8, 9, 0, 6.5);
    const cupola = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 8), mats.churchWallMat);
    cupola.position.y = 9.8;
    g.add(cupola);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.4, 8), mats.leadMat);
    cap.position.y = 11.3;
    g.add(cap);
    return g;
  });

  // The shore battery: a low masonry platform, parapet to seaward, a pair
  // of guns run out over it.
  reg.register('battery', function battery(ctx, spec) {
    const { THREE, box, mats } = ctx;
    const g = new THREE.Group();
    box(g, mats.masonMat, 9, 1.5, 5.5, 0);
    box(g, mats.masonMat, 9, 0.7, 0.8, 0, 1.5, 2.4);
    for (const off of [-1.4, 1.4]) {
      const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 3.8, 6), mats.port);
      gun.rotation.z = Math.PI / 2 - 0.06;
      gun.position.set(2.2, 2.1, off);
      g.add(gun);
    }
    // Some batteries keep their stores beside the guns: a tiny gabled
    // powder hut and a pyramid of shot, hash-optional, one merged mesh.
    if (spec.seed(9) < 0.6) {
      const { mergeColored, lump } = ctx;
      const parts = [
        [new THREE.BoxGeometry(1.8, 1.3, 1.5).translate(-3, 2.15, -1.3), 0xd8cdb4],
        [new THREE.ConeGeometry(1.25, 0.7, 4).rotateY(Math.PI / 4).scale(1.05, 1, 0.8).translate(-3, 3.15, -1.3), 0x6e5a45],
        [new THREE.BoxGeometry(0.55, 0.85, 0.07).translate(-3, 1.95, -0.52), 0x14110d],  // tarred plank door
        [new THREE.BoxGeometry(0.3, 0.16, 0.05).translate(-3, 2.55, -0.51), 0xe9dfc4],   // warning board
      ];
      let bi = 0;                                              // shot pyramid, stacked a little loose
      for (const [sx, sz] of [[-0.17, -0.17], [0.17, -0.17], [-0.17, 0.17], [0.17, 0.17]]) {
        parts.push([lump(0.17).translate(
          0.7 + sx + (spec.seed(30 + bi) - 0.5) * 0.07, 1.66,
          -1.9 + sz + (spec.seed(50 + bi) - 0.5) * 0.07), 0x26221c]);
        bi++;
      }
      parts.push([lump(0.17).translate(0.7 + (spec.seed(38) - 0.5) * 0.06, 1.92, -1.9 + (spec.seed(58) - 0.5) * 0.06), 0x26221c]);
      g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    }
    return g;
  });

  // The gallows: two posts and the beam, kept dark against the sky.
  reg.register('gallows', function gallows(ctx, spec) {
    const { THREE, mats } = ctx;
    const g = new THREE.Group();
    for (const off of [-1.1, 1.1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5, 5), mats.wale);
      post.position.set(off, 2.5, 0);
      g.add(post);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 0.3), mats.wale);
    beam.position.y = 4.9;
    g.add(beam);
    // Gallows Point and its kin hang their dead in irons: a short jib,
    // a chain, and the dark shape in its cage — hash-optional, and only
    // at sites named for a Point. One merged mesh.
    if (spec.seed(7) < 0.5 && (spec.name || '').match(/point/i)) {
      const { mergeColored, lump } = ctx;
      const parts = [
        [new THREE.BoxGeometry(0.22, 3.8, 0.22).translate(2.6, 1.9, 0), 0x4a3826],   // jib post
        [new THREE.BoxGeometry(1.4, 0.2, 0.2).translate(3.2, 3.7, 0), 0x4a3826],     // jib arm
        [new THREE.CylinderGeometry(0.016, 0.016, 0.7, 4).translate(3.75, 3.25, 0), 0x3a352c], // chain line
        [new THREE.TorusGeometry(0.055, 0.02, 4, 6).translate(3.75, 3.5, 0), 0x3a352c],        // links, turned
        [new THREE.TorusGeometry(0.055, 0.02, 4, 6).rotateY(Math.PI / 2).translate(3.75, 3.36, 0), 0x3a352c],
        [new THREE.TorusGeometry(0.055, 0.02, 4, 6).translate(3.75, 3.22, 0), 0x3a352c],
        [lump(0.3).scale(1, 1.6, 1).translate(3.75, 2.35, 0), 0x2a241c],             // the dead man
        [new THREE.BoxGeometry(0.72, 0.05, 0.72).translate(3.75, 2.95, 0), 0x3a352c], // cage hoops
        [new THREE.BoxGeometry(0.72, 0.05, 0.72).translate(3.75, 1.75, 0), 0x3a352c],
      ];
      for (const [cx, cz] of [[-0.33, -0.33], [0.33, -0.33], [-0.33, 0.33], [0.33, 0.33]]) {
        parts.push([new THREE.BoxGeometry(0.045, 1.2, 0.045).translate(3.75 + cx, 2.35, cz), 0x3a352c]);
      }
      g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    }
    return g;
  });

  // The governor's mansion: a two-storey hipped double-pile behind a
  // walled forecourt — gate posts, gravel path, a pair of fruit trees and
  // the ensign on its pole. The facade is its own painted canvas (sash
  // grid, pedimented door), tinted per nation; the Spanish add an arcaded
  // portal, the English sometimes a cupola. Five meshes.
  reg.register('governor', function governor(ctx, spec) {
    const { THREE, box, roofOn, mats, mergeColored, lump } = ctx;
    const style = spec.style;
    const g = new THREE.Group();
    g.userData.angleFromStreet = true;
    const tex = ctx.canvasTex('gov-facade-' + style, 192, 192, (x) => {
      const rnd = painterRand('gov-facade-' + style);
      const BG = { spanish: '#d9b87e', dutch: '#9c5340', english: '#a05a42', french: '#cdbb97' };
      x.fillStyle = BG[style] || BG.english;
      x.fillRect(0, 0, 192, 192);
      for (let i = 0; i < 22; i++) {                       // weathering streaks
        x.fillStyle = 'rgba(70,52,36,' + (0.03 + rnd() * 0.05).toFixed(3) + ')';
        x.fillRect(rnd() * 192, rnd() * 50, 2 + rnd() * 4, 70 + rnd() * 120);
      }
      if (style === 'dutch' || style === 'english') {      // brick coursing
        x.strokeStyle = 'rgba(50,26,18,0.22)';
        x.lineWidth = 1;
        for (let cy = 8; cy < 192; cy += 8) { x.beginPath(); x.moveTo(0, cy); x.lineTo(192, cy); x.stroke(); }
      }
      if (style === 'french') {                            // modest timber studs
        x.fillStyle = 'rgba(91,70,54,0.4)';
        for (let sx = 10; sx < 192; sx += 30) x.fillRect(sx, 0, 3, 192);
      }
      const sash = (wx, wy, ped) => {                      // 24x34 sash window
        x.fillStyle = '#f4ecd8'; x.fillRect(wx - 3, wy - 3, 30, 40);
        if (ped) {                                         // piano-nobile pediment
          x.beginPath();
          x.moveTo(wx - 5, wy - 4); x.lineTo(wx + 29, wy - 4); x.lineTo(wx + 12, wy - 12);
          x.closePath(); x.fill();
          x.strokeStyle = 'rgba(61,47,30,0.45)'; x.lineWidth = 1;
          x.beginPath(); x.moveTo(wx - 5, wy - 4); x.lineTo(wx + 29, wy - 4); x.stroke();
        } else {
          x.fillStyle = 'rgba(40,28,16,0.5)'; x.fillRect(wx - 3, wy - 4.5, 30, 2.5);
        }
        x.fillStyle = '#2f2517'; x.fillRect(wx, wy, 24, 34);
        x.strokeStyle = '#f4ecd8'; x.lineWidth = 1.5;      // sash glazing bars
        x.beginPath();
        x.moveTo(wx + 12, wy); x.lineTo(wx + 12, wy + 34);
        for (const gy of [11, 17, 23]) { x.moveTo(wx, wy + gy); x.lineTo(wx + 24, wy + gy); }
        x.stroke();
        if (style === 'dutch') {                           // green shutters
          x.fillStyle = '#3e5e3a';
          x.fillRect(wx - 11, wy, 8, 34);
          x.fillRect(wx + 27, wy, 8, 34);
        }
      };
      for (const wx of [12, 48, 84, 120, 156]) sash(wx, 23, true); // piano nobile, five pedimented bays
      for (const wx of [12, 48, 120, 156]) sash(wx, 119);      // ground row, door centred
      if (style === 'dutch') {                                 // white trim band
        x.fillStyle = 'rgba(244,236,216,0.9)';
        x.fillRect(0, 93, 192, 5);
      }
      x.fillStyle = '#f4ecd8';                                 // the pedimented door
      x.fillRect(76, 136, 6, 56); x.fillRect(110, 136, 6, 56); // pilasters
      x.beginPath(); x.moveTo(72, 136); x.lineTo(120, 136); x.lineTo(96, 118); x.closePath(); x.fill();
      x.fillStyle = '#33281b';
      x.fillRect(82, 140, 28, 52);
      x.strokeStyle = 'rgba(244,236,216,0.5)';                 // planked door
      x.lineWidth = 1.4;
      for (let px = 87; px < 110; px += 6) { x.beginPath(); x.moveTo(px, 142); x.lineTo(px, 190); x.stroke(); }
      x.fillStyle = '#2f2517';                                 // fanlight over the door
      x.beginPath(); x.arc(96, 139, 12, Math.PI, 0); x.closePath(); x.fill();
      x.strokeStyle = '#f4ecd8'; x.lineWidth = 1.1;            // radiating glazing bars
      x.beginPath();
      for (const a of [0.5, 1.05, 1.57, 2.09, 2.64]) {
        x.moveTo(96, 139); x.lineTo(96 - Math.cos(a) * 12, 139 - Math.sin(a) * 12);
      }
      x.stroke();
      // quoin stones down the corners — bold for Spain, fainter elsewhere
      const QA = { spanish: 0.55, english: 0.32, french: 0.32, dutch: 0.22 };
      x.fillStyle = 'rgba(160,140,105,' + (QA[style] || 0.32) + ')';
      for (let qy = 6; qy < 192; qy += 22) { x.fillRect(0, qy, 9, 12); x.fillRect(183, qy + 11, 9, 12); }
      x.fillStyle = 'rgba(61,47,30,0.32)';                     // cornice
      x.fillRect(0, 0, 192, 6);
      if (style === 'english') {                               // dentil course at the eave
        x.fillStyle = 'rgba(61,47,30,0.3)';
        for (let dx = 2; dx < 192; dx += 8) x.fillRect(dx, 6, 4, 3);
      }
    });
    box(g, new THREE.MeshLambertMaterial({ color: 0xf2ead8, map: tex }), 12, 6.4, 9, 0);
    roofOn(g, 'hip', (style === 'spanish' || style === 'dutch') ? mats.tileMat : mats.shingleMat, 12, 2.6, 9, 0, 6.4);
    // everything untextured merges into one vertex-coloured mesh
    const parts = [];
    const bx = (w, h, d, px, py, pz, hex) => parts.push([new THREE.BoxGeometry(w, h, d).translate(px, py, pz), hex]);
    bx(13, 0.6, 10, 0, 0.3, 0, 0xaa9c80);                      // plinth
    bx(0.9, 2.4, 0.9, -3, 8.6, 0, 0x7a4434);                   // kitchen chimney
    bx(4.6, 0.9, 0.4, -3.7, 0.45, 12, 0xb0a285);               // forecourt walls
    bx(4.6, 0.9, 0.4, 3.7, 0.45, 12, 0xb0a285);
    bx(0.4, 0.9, 7.4, -6, 0.45, 8.3, 0xb0a285);
    bx(0.4, 0.9, 7.4, 6, 0.45, 8.3, 0xb0a285);
    bx(0.55, 1.5, 0.55, -1.35, 0.75, 12, 0xa89a7e);            // gate posts
    bx(0.55, 1.5, 0.55, 1.35, 0.75, 12, 0xa89a7e);
    parts.push([lump(0.28).translate(-1.35, 1.62, 12), 0xa89a7e]);
    parts.push([lump(0.28).translate(1.35, 1.62, 12), 0xa89a7e]);
    bx(1.9, 0.08, 7.4, 0, 0.04, 8.3, 0xd6c9a4);                // gravel path
    bx(3.6, 0.55, 0.45, -3.7, 0.28, 11.3, 0x4c6634);           // clipped hedges inside the wall
    bx(3.6, 0.55, 0.45, 3.7, 0.28, 11.3, 0x4c6634);
    bx(0.45, 0.55, 4.6, -5.45, 0.28, 8.6, 0x4c6634);
    bx(0.45, 0.55, 4.6, 5.45, 0.28, 8.6, 0x4c6634);
    for (let i = 0; i < 8; i++) {                              // flower dots along the path
      parts.push([lump(0.09).translate(i % 2 ? 1.2 : -1.2, 0.12, 5.6 + i * 0.85),
        i % 3 === 0 ? 0xc05a50 : (i % 3 === 1 ? 0xd8c050 : 0xc987a8)]);
    }
    if (style === 'spanish') {                                 // tile ridge caps
      bx(5.5, 0.22, 0.55, 0, 9.05, 0, 0x9a4a2c);
    } else if (style === 'dutch') {                            // shaped gable accent
      // stepped against the front eave: base buried in the roof slope, the
      // step resting on it (at y 7/7.5 the pair floated above the roof)
      bx(2.4, 0.5, 0.3, 0, 6.55, 4.62, 0xf0e8d8);
      bx(1.2, 0.5, 0.3, 0, 7.05, 4.62, 0xf0e8d8);
    }
    for (const tx of [-3.9, 3.9]) {                            // a pair of fruit trees
      parts.push([new THREE.CylinderGeometry(0.12, 0.17, 1.6, 5).translate(tx, 0.8, 8.4), 0x6b4a2e]);
      parts.push([lump(0.85).scale(1.1, 0.9, 1.1).translate(tx, 2, 8.4), 0x5d7a3c]);
      parts.push([lump(0.55).translate(tx + 0.45, 2.5, 8), 0x69884a]);
    }
    if (style === 'spanish') {                                 // arcaded portal
      for (let i = 0; i < 5; i++) {
        parts.push([new THREE.CylinderGeometry(0.2, 0.25, 3, 6).translate(-4 + i * 2, 1.5, 5.1), 0xf0e8d8]);
      }
      bx(10, 0.5, 0.6, 0, 3.25, 5.1, 0xf0e8d8);
      bx(10.6, 0.2, 1.5, 0, 3.6, 4.9, 0xb35a36);               // tile shade strip
    } else if (style === 'english' && spec.seed(5) < 0.5) {    // sometimes a cupola
      parts.push([new THREE.CylinderGeometry(0.8, 0.8, 1.2, 8).translate(0, 9.5, 0), 0xf0e9d6]);
      parts.push([new THREE.ConeGeometry(1.05, 1.1, 8).translate(0, 10.6, 0), 0x7d8388]);
    }
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    // the ensign at the court corner
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 11, 5), mats.mast);
    mast.position.set(4.9, 5.5, 10.6);
    g.add(mast);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2), mats.flag);
    flag.position.set(3.1, 9.8, 10.6);
    flag.userData.flutter = true;
    g.add(flag);
    g.userData.smoke = [{ x: -3, y: 10, z: 0, s: 0.8 }];
    return g;
  });

  // The prison: a grim little masonry box — barred slots, an iron-banded
  // plank door, the stocks waiting out front. Three meshes.
  reg.register('prison', function prison(ctx, spec) {
    const { THREE, box, roofOn, mats, mergeColored } = ctx;
    const g = new THREE.Group();
    g.userData.angleFromStreet = true;
    // heavy rusticated masonry, damp-stained at the base — deterministic LCG
    const wallTex = ctx.canvasTex('prison-wall', 128, 128, (x) => {
      let s = 7;
      const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
      x.fillStyle = '#b3a78c';
      x.fillRect(0, 0, 128, 128);
      for (let cy = 0; cy < 128; cy += 18) {                   // block-by-block tone shifts
        const off = (cy / 18) % 2 ? 16 : 0;
        for (let cx = -16; cx < 128; cx += 32) {
          x.fillStyle = 'rgba(120,108,86,' + (0.08 + rnd() * 0.12) + ')';
          x.fillRect(cx + off, cy, 32, 18);
        }
      }
      x.strokeStyle = 'rgba(46,36,24,0.55)';                   // deep rusticated joints
      x.lineWidth = 2;
      for (let cy = 0; cy <= 128; cy += 18) { x.beginPath(); x.moveTo(0, cy); x.lineTo(128, cy); x.stroke(); }
      for (let cy = 0; cy < 128; cy += 18) {
        const off = (cy / 18) % 2 ? 16 : 0;
        for (let cx = off; cx <= 128; cx += 32) { x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx, cy + 18); x.stroke(); }
      }
      for (let i = 0; i < 14; i++) {                           // damp staining at the base
        x.fillStyle = 'rgba(58,66,48,' + (0.06 + rnd() * 0.1) + ')';
        x.fillRect(rnd() * 128, 128 - 8 - rnd() * 22, 6 + rnd() * 18, 30);
      }
    });
    box(g, new THREE.MeshLambertMaterial({ color: 0xb6aa8f, map: wallTex }), 4.2, 2.8, 4.2, 0);
    roofOn(g, 'gable', mats.shingleMat, 4.2, 1.2, 4.2, 0, 2.8);
    const parts = [];
    const bx = (w, h, d, px, py, pz, hex) => parts.push([new THREE.BoxGeometry(w, h, d).translate(px, py, pz), hex]);
    bx(4.8, 0.4, 4.8, 0, 0.2, 0, 0xaa9c80);                    // plinth
    bx(1.1, 1.9, 0.14, 0, 0.95, 2.12, 0x2e2418);               // heavy plank door
    bx(1.3, 0.16, 0.18, 0, 1.5, 2.13, 0x4a4a48);               // iron bands
    bx(1.3, 0.16, 0.18, 0, 0.6, 2.13, 0x4a4a48);
    for (const wx of [-1.35, 1.35]) {                          // barred slots, front
      bx(0.55, 0.7, 0.12, wx, 1.9, 2.12, 0x1f1a12);
      bx(0.05, 0.74, 0.14, wx - 0.13, 1.9, 2.13, 0x8d8d88);
      bx(0.05, 0.74, 0.14, wx + 0.13, 1.9, 2.13, 0x8d8d88);
    }
    for (const sx of [-1, 1]) bx(0.12, 0.6, 0.5, sx * 2.12, 1.9, 0, 0x1f1a12); // flank slots
    bx(0.7, 0.3, 0.12, 0, 2.25, 2.12, 0x1f1a12);               // barred fanlight over the door
    bx(0.04, 0.34, 0.14, -0.15, 2.25, 2.13, 0x8d8d88);
    bx(0.04, 0.34, 0.14, 0.15, 2.25, 2.13, 0x8d8d88);
    bx(0.18, 1.15, 0.18, -0.85, 0.57, 3.6, 0x6a5a43);          // the stocks, weathered grey-brown
    bx(0.18, 1.15, 0.18, 0.85, 0.57, 3.6, 0x6a5a43);
    bx(1.9, 0.5, 0.14, 0, 1, 3.6, 0x77674c);                   // the holed board
    for (const hx of [-0.45, 0, 0.45]) bx(0.17, 0.17, 0.16, hx, 1, 3.6, 0x241d12);
    bx(1.8, 0.06, 1.1, 0, 0.03, 3.55, 0xb89d5c);               // straw scattered underfoot
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    return g;
  });
})();
