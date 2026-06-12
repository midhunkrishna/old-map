/* Carta Temporum — building models: Religious.
   Factories for the houses of worship — the four national church variants
   (with an English churchyard kit), the half-size chapel with its wooden
   belfry, the Spanish convent with cloister and tower, and the plain
   dissenters' meeting house.
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

  // The parish church, in the nation's manner: Spanish basilica with its
  // tiled dome tower, Dutch cross-plan kerk under a leaded dome, French
  // chapel with a shingled flèche, English tower with corner pinnacles
  // and a leaded spire. (Moved verbatim from harbortown.js churchOf.)
  reg.register('church', function church(ctx, spec) {
    const { THREE, box, roofOn, buttresses, mats } = ctx;
    const style = spec.style;
    const g = new THREE.Group();
    if (style === 'spanish') {
      box(g, mats.stoneMat, 17, 0.7, 9, 0);
      box(g, mats.churchWallMat, 16, 6, 8, 0);
      buttresses(g, mats.stoneMat, 16, 8, 3.6);
      roofOn(g, 'gable', mats.tileMat, 16, 2.4, 8, 0, 6);
      box(g, mats.churchWallMat, 5, 13, 5, 9.6);
      box(g, mats.churchWallMat, 4.2, 2.8, 4.2, 9.6, 13);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(2.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.tileMat);
      dome.position.set(9.6, 15.8, 0);
      g.add(dome);
      box(g, mats.wale, 0.18, 1.8, 0.18, 9.6, 18.3);
      box(g, mats.wale, 1, 0.18, 0.18, 9.6, 18.9);
    } else if (style === 'dutch') {
      box(g, mats.stoneMat, 17, 0.7, 8.5, 0);
      box(g, mats.churchWallMat, 16, 6, 7.5, 0);
      box(g, mats.churchWallMat, 7.5, 6, 15, 0);
      roofOn(g, 'gable', mats.tileMat, 16, 2.8, 7.5, 0, 6);
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 4, 8), mats.churchWallMat);
      drum.position.y = 8;
      g.add(drum);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mats.leadMat);
      dome.scale.y = 0.75;
      dome.position.y = 10;
      g.add(dome);
      const lantern = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2, 6), mats.leadMat);
      lantern.position.y = 13.2;
      g.add(lantern);
    } else if (style === 'french') {
      box(g, mats.stoneMat, 13, 0.6, 7, 0);
      box(g, mats.churchWallMat, 12, 4.5, 6.5, 0);
      buttresses(g, mats.stoneMat, 12, 6.5, 2.8);
      roofOn(g, 'gable', mats.shingleMat, 12, 3.4, 6.5, 0, 4.5);
      box(g, mats.churchWallMat, 1.8, 2.4, 1.8, 3, 7.9);
      const fl = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.6, 4), mats.shingleMat);
      fl.position.set(3, 11.5, 0);
      g.add(fl);
    } else {
      box(g, mats.stoneMat, 16, 0.7, 8.5, 0);
      box(g, mats.churchWallMat, 15, 5.5, 7.5, 0);
      buttresses(g, mats.stoneMat, 15, 7.5, 3.4);
      roofOn(g, 'gable', mats.shingleMat, 15, 2.6, 7.5, 0, 5.5);
      box(g, mats.churchWallMat, 5.2, 11.5, 5.2, 9.2);
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
        box(g, mats.stoneMat, 0.9, 8, 0.9, 9.2 + cx * 2.5, 0, cz * 2.5);
      }
      box(g, mats.stoneMat, 6, 0.8, 6, 9.2, 11.5);
      for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
        const pin = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 4), mats.stoneMat);
        pin.position.set(9.2 + cx * 2.6, 13, cz * 2.6);
        g.add(pin);
      }
      const spire = new THREE.Mesh(new THREE.ConeGeometry(2.3, 5, 4), mats.leadMat);
      spire.position.set(9.2, 14.8, 0);
      g.add(spire);
    }
    // English churchyards: a low boundary wall about the ground (segments
    // with gaps for gate and corners) and a hash-scattered handful of
    // gravestones. One merged mesh; the other nations bury elsewhere.
    if (style !== 'spanish' && style !== 'dutch' && style !== 'french') {
      const { mergeColored } = ctx;
      const parts = [
        [new THREE.BoxGeometry(8.5, 0.7, 0.35).translate(-5.75, 0.35, 7), 0xa89a7e],
        [new THREE.BoxGeometry(8.5, 0.7, 0.35).translate(5.75, 0.35, 7), 0xa89a7e],
        [new THREE.BoxGeometry(0.35, 0.7, 12.5).translate(-11.6, 0.35, 0.4), 0xa89a7e],
        [new THREE.BoxGeometry(0.35, 0.7, 12.5).translate(11.6, 0.35, 0.4), 0xa89a7e],
        // pale coping along the wall heads
        [new THREE.BoxGeometry(8.5, 0.12, 0.45).translate(-5.75, 0.76, 7), 0xbfb194],
        [new THREE.BoxGeometry(8.5, 0.12, 0.45).translate(5.75, 0.76, 7), 0xbfb194],
        [new THREE.BoxGeometry(0.45, 0.12, 12.5).translate(-11.6, 0.76, 0.4), 0xbfb194],
        [new THREE.BoxGeometry(0.45, 0.12, 12.5).translate(11.6, 0.76, 0.4), 0xbfb194],
        // lychgate posts at the gate gap
        [new THREE.BoxGeometry(0.22, 1.7, 0.22).translate(-1.25, 0.85, 7), 0x6b4a2e],
        [new THREE.BoxGeometry(0.22, 1.7, 0.22).translate(1.25, 0.85, 7), 0x6b4a2e],
        [new THREE.BoxGeometry(3.1, 0.18, 0.3).translate(0, 1.78, 7), 0x6b4a2e],
        [new THREE.ConeGeometry(1.65, 0.55, 4).rotateY(Math.PI / 4).scale(1.25, 1, 0.32).translate(0, 2.15, 7), 0x6e5a45],
      ];
      const n = 2 + Math.floor(spec.seed(3) * 3);            // 2-4 stones
      for (let i = 0; i < n; i++) {
        parts.push([new THREE.BoxGeometry(0.5, 0.85, 0.12)
          .rotateZ((spec.seed(80 + i) - 0.5) * 0.45)         // a settling lean
          .rotateY((spec.seed(60 + i) - 0.5) * 0.9)
          .translate(-8 + spec.seed(20 + i) * 6, 0.4, 4.6 + spec.seed(40 + i) * 1.7), 0x9a958a]);
      }
      if (n >= 4) {                                          // a table-tomb for the larger yards
        parts.push([new THREE.BoxGeometry(0.85, 0.5, 0.55).translate(7.5, 0.25, 5.2), 0x9a958a]);
        parts.push([new THREE.BoxGeometry(1.05, 0.12, 0.72).rotateY(0.12).translate(7.5, 0.56, 5.2), 0x8f8a7e]);
      }
      g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    }
    // St Michael's reads larger than its parish kin; userData.scale
    // overrides the 1.3 landmark scale, so that factor is baked in.
    if ((spec.name || '').match(/st michael/i)) g.userData.scale = 1.3 * 1.15;
    return g;
  });

  // The chapel: a half-size nave under a thatch-toned gable, the bell on
  // a wooden post beside the door instead of any tower. French weathered
  // palette. Three meshes.
  reg.register('chapel', function chapel(ctx, spec) {
    const { THREE, box, roofOn, mats, mergeColored, lump } = ctx;
    const g = new THREE.Group();
    g.userData.angleFromStreet = true;
    box(g, new THREE.MeshLambertMaterial({ color: 0xcfc4ac, map: ctx.facadeTexture('french', 1) }), 6.5, 3, 4.2, 0);
    roofOn(g, 'gable', new THREE.MeshLambertMaterial({ color: 0x9a8a5e, map: ctx.roofTexture('english'), side: THREE.DoubleSide }), 6.5, 2, 4.2, 0, 3);
    g.add(new THREE.Mesh(mergeColored([
      [new THREE.BoxGeometry(7.4, 0.4, 5).translate(0, 0.2, 0), 0xaa9c80],                  // plinth
      [new THREE.BoxGeometry(0.26, 4.3, 0.26).translate(2.9, 2.15, 2.9), 0x7e7468],         // belfry post
      [lump(0.22).scale(1, 1.25, 1).translate(2.9, 3.7, 2.9), 0x4a3f2e],                    // the bell
      [new THREE.ConeGeometry(0.6, 0.55, 4).rotateY(Math.PI / 4).translate(2.9, 4.6, 2.9), 0x8a7a52], // gable cap
      [new THREE.CylinderGeometry(0.015, 0.015, 2.5, 3).translate(2.72, 2.3, 2.9), 0xb9a87c], // bell rope
      [new THREE.BoxGeometry(0.14, 0.08, 0.2).translate(2.72, 1.05, 2.9), 0x5a4a36],        // its cleat
      [new THREE.BoxGeometry(7.2, 0.16, 0.5).translate(0, 5.05, 0), 0x857550],              // thatch ridge cap
      [new THREE.BoxGeometry(0.07, 0.6, 0.07).translate(-3.55, 5.3, 0), 0x5e4a33],          // wooden cross finial
      [new THREE.BoxGeometry(0.32, 0.07, 0.07).translate(-3.55, 5.42, 0), 0x5e4a33],
    ]), mats.clutterMat));
    return g;
  });

  // The convent: a lime-washed nave in the Spanish manner, a big square
  // tower at the east end (taller for San Francisco, the tallest in
  // Havana), and behind it the two-storey cloister — twin wings and an
  // end range about a green inner court. Five meshes.
  reg.register('convent', function convent(ctx, spec) {
    const { THREE, box, roofOn, mats, mergeColored, lump } = ctx;
    const g = new THREE.Group();
    g.userData.angleFromStreet = true;
    box(g, mats.churchWallMat, 11, 5, 6, 0);
    roofOn(g, 'gable', mats.tileMat, 11, 2.2, 6, 0, 5);
    const H = (spec.name || '').match(/san francisco/i) ? 16 : 11.5;
    box(g, mats.churchWallMat, 4.2, H, 4.2, 6.9);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.1, 2.4, 4), mats.tileMat);
    cap.rotation.y = Math.PI / 4;
    cap.position.set(6.9, H + 1.2, 0);
    g.add(cap);
    const parts = [];
    const bx = (w, h, d, px, py, pz, hex) => parts.push([new THREE.BoxGeometry(w, h, d).translate(px, py, pz), hex]);
    bx(12, 0.6, 7, 0, 0.3, 0.2, 0xaa9c80);             // nave plinth
    bx(4.8, 0.6, 4.8, 6.9, 0.3, 0, 0xaa9c80);          // tower plinth
    bx(12.4, 0.5, 12.2, 0, 0.25, -9, 0xaa9c80);        // cloister plinth
    // wings tuck 0.05 into the nave's back wall (at -7.7 a 0.2 m daylight
    // slit opened between wing front and nave)
    bx(3, 5, 9, -4.2, 2.5, -7.55, 0xf0e8d8);           // west wing
    bx(3, 5, 9, 4.2, 2.5, -7.55, 0xf0e8d8);            // east wing
    bx(11.4, 5, 3, 0, 2.5, -13.2, 0xf0e8d8);           // end range
    bx(3.5, 0.35, 9.5, -4.2, 5.15, -7.55, 0xb35a36);   // tile caps over the wings
    bx(3.5, 0.35, 9.5, 4.2, 5.15, -7.55, 0xb35a36);
    bx(11.9, 0.35, 3.5, 0, 5.15, -13.2, 0xb35a36);
    bx(2.2, 0.1, 2.2, 0, 0.55, -8.5, 0x6f8a42);        // the court garden
    bx(10.6, 0.18, 0.5, 0, 7.25, 0, 0x9a4a2c);         // tile ridge caps over the nave
    for (let i = 0; i < 4; i++) {                      // arcade hint along the court sides
      for (const cx of [-2.5, 2.5]) {
        parts.push([new THREE.CylinderGeometry(0.13, 0.16, 1.9, 5).translate(cx, 1.45, -4.6 - i * 2.2), 0xe8dfc8]);
      }
    }
    bx(0.16, 0.12, 8.6, -2.5, 2.45, -7.6, 0xe8dfc8);   // arcade rails
    bx(0.16, 0.12, 8.6, 2.5, 2.45, -7.6, 0xe8dfc8);
    for (const tx of [-1.1, 1.1]) {                    // citrus trees in the court
      parts.push([new THREE.CylinderGeometry(0.07, 0.1, 0.8, 5).translate(tx, 0.95, -8.5), 0x5a3f28]);
      parts.push([lump(0.5).scale(1.05, 0.9, 1.05).translate(tx, 1.6, -8.5), 0x4e7032]);
    }
    bx(1.05, 1.5, 0.12, 6.9, H - 1.4, 2.1, 0x241d14);  // belfry openings, painted dark
    bx(0.12, 1.5, 1.05, 4.8, H - 1.4, 0, 0x241d14);
    bx(0.12, 1.5, 1.05, 9, H - 1.4, 0, 0x241d14);
    parts.push([lump(0.16).scale(1, 1.3, 1).translate(6.9, H - 1.55, 2.14), 0x6f5d36]); // the bell
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    return g;
  });

  // The meeting house: a plain steeple-less gabled hall, big clear-glazed
  // windows and not a buttress in sight — the dissenters' answer to the
  // parish church. English palette, shingle. Three meshes.
  reg.register('meeting', function meeting(ctx, spec) {
    const { THREE, box, roofOn, mats, mergeColored } = ctx;
    const g = new THREE.Group();
    g.userData.angleFromStreet = true;
    const tex = ctx.canvasTex('meeting-facade', 192, 192, (x) => {
      const rnd = painterRand('meeting-facade');
      x.fillStyle = '#e3dcc4';
      x.fillRect(0, 0, 192, 192);
      for (let i = 0; i < 18; i++) {                   // weathering streaks
        x.fillStyle = 'rgba(120,100,70,' + (0.03 + rnd() * 0.04).toFixed(3) + ')';
        x.fillRect(rnd() * 192, rnd() * 60, 2 + rnd() * 4, 60 + rnd() * 120);
      }
      const win = (wx, wy, ww, wh) => {                // big clear-glazed window
        x.fillStyle = '#f4ecd8'; x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
        x.fillStyle = '#a8b8b0'; x.fillRect(wx, wy, ww, wh);
        x.fillStyle = 'rgba(232,240,234,0.3)';         // sky in the upper panes
        x.fillRect(wx, wy, ww, wh * 0.3);
        x.strokeStyle = '#f4ecd8'; x.lineWidth = 1.1;  // muntin grid, four by five
        x.beginPath();
        for (let gx = wx + ww / 4; gx < wx + ww - 1; gx += ww / 4) { x.moveTo(gx, wy); x.lineTo(gx, wy + wh); }
        for (let gy = wy + wh / 5; gy < wy + wh - 1; gy += wh / 5) { x.moveTo(wx, gy); x.lineTo(wx + ww, gy); }
        x.stroke();
      };
      for (const wx of [20, 76, 132]) win(wx, 26, 40, 52);   // upper row
      for (const wx of [20, 132]) win(wx, 118, 40, 52);      // ground row, door between
      x.fillStyle = '#f4ecd8';                               // plain but crisp door surround
      x.fillRect(78, 134, 5, 58); x.fillRect(109, 134, 5, 58);
      x.fillRect(76, 128, 40, 6);
      x.fillStyle = 'rgba(61,47,30,0.55)'; x.fillRect(76, 134, 40, 2);  // shadow under the lintel
      x.fillStyle = '#33281b'; x.fillRect(83, 136, 26, 56);  // plain door
      x.fillStyle = 'rgba(61,47,30,0.25)'; x.fillRect(0, 0, 192, 5);    // modest cornice
    });
    box(g, new THREE.MeshLambertMaterial({ color: 0xf2ecd9, map: tex }), 11, 5.5, 8, 0);
    roofOn(g, 'gable', mats.shingleMat, 11, 2.4, 8, 0, 5.5);
    g.add(new THREE.Mesh(mergeColored([
      [new THREE.BoxGeometry(11.8, 0.5, 8.8).translate(0, 0.25, 0), 0xaa9c80],   // plinth
      [new THREE.BoxGeometry(2.2, 0.55, 1.2).translate(0, 0.275, 4.4), 0xb0a285], // door step, grounded
      [new THREE.BoxGeometry(0.95, 0.35, 0.75).translate(1.9, 0.18, 4.85), 0xaa9c80], // mounting block
      [new THREE.BoxGeometry(0.5, 0.3, 0.75).translate(2.1, 0.5, 4.85), 0xaa9c80],
    ]), mats.clutterMat));
    return g;
  });
})();
