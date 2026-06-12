/* Carta Temporum — building models: Waterfront & Commercial.
   The working-shore factories — 'tavern' (painted amber-lit facade, hanging
   signboard, smoking chimney, tables and barrels), 'shipwright' (slipway
   ground-ways, ribbed hull frame on stocks, sawpit, timber, tar pot; grand
   Havana/Arsenal variant with double slipway and crane), 'smithy' (open
   forge bay, oversized brick chimney, always smoking), 'provisioner' (high
   small windows, hoist beam and sack over the loading door, barrel rows).
   Also kits: 'lantern', 'forgeYard', 'hoistSack' for the instanced prop pass.
   Contract: factory(ctx, spec) → THREE.Group in local metres, origin at
   ground, +z the front; ctx supplies mats/helpers, spec the point data.
   Deterministic: all variation rolls through spec.seed — no Math.random. */
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

  /* ---------- the nations' working palette (plan §1a) ---------- */
  // english brick/clapboard, spanish lime-wash white/ochre, dutch brick with
  // white trim, french weathered silver-grey plank.
  const WALL_TINT = { english: 0xc99a72, spanish: 0xf0e8d8, dutch: 0xa55f43, french: 0xbfb49a };
  const BAY_TINT = { english: 0xb56a4a, spanish: 0xe8d3a8, dutch: 0xa55f43, french: 0xb8ae96 };
  const roofMatOf = (ctx, style) =>
    (style === 'spanish' || style === 'dutch') ? ctx.mats.tileMat : ctx.mats.shingleMat;

  // ±8% HSL jitter rolled from the seed, so two of a kind in one port never
  // wear quite the same coat
  const tintJitter = (THREE, hex, sd, k) => new THREE.Color(hex)
    .offsetHSL((sd(k) - 0.5) * 0.03, (sd(k + 1) - 0.5) * 0.16, (sd(k + 2) - 0.5) * 0.16);
  const roofMatJittered = (ctx, style, sd, k) => {
    const m = roofMatOf(ctx, style).clone();
    m.color.copy(tintJitter(ctx.THREE, m.color.getHex(), sd, k));
    return m;
  };

  // a deterministic 0..1 stream for canvas painters — each cached canvas is
  // painted exactly once, keyed by string, so the stream seeds from the key
  const painterRand = (key) => {
    let s = 2166136261;
    for (let i = 0; i < key.length; i++) s = ((s ^ key.charCodeAt(i)) * 16777619) >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };

  /* ---------- painted canvases ---------- */

  // The wall ground, in each nation's manner: brick coursing for the english
  // and dutch, stucco mottle under an uneven ochre wash for the spanish,
  // weathered plank seams for the french — then the chartmaker's grime.
  function styleWall(x, style, rnd) {
    if (style === 'english' || style === 'dutch') {
      x.strokeStyle = 'rgba(122,68,52,0.16)';
      x.lineWidth = 1;
      for (let y = 8; y < 192; y += 7) {
        x.beginPath(); x.moveTo(0, y + (rnd() - 0.5) * 1.4); x.lineTo(192, y + (rnd() - 0.5) * 1.4); x.stroke();
      }
      x.fillStyle = 'rgba(122,68,52,0.12)';            // header bricks, here and there
      for (let i = 0; i < 36; i++) x.fillRect(rnd() * 188, rnd() * 186, 2.5, 5);
    } else if (style === 'spanish') {
      for (let i = 0; i < 30; i++) {                   // the stucco mottles with age
        x.fillStyle = 'rgba(' + (rnd() < 0.5 ? '200,150,60' : '120,100,70') + ',' + (0.04 + rnd() * 0.05).toFixed(3) + ')';
        x.beginPath(); x.arc(rnd() * 192, rnd() * 192, 6 + rnd() * 15, 0, Math.PI * 2); x.fill();
      }
      x.fillStyle = 'rgba(200,150,60,0.08)';           // the ochre wash sits unevenly
      x.fillRect(0, 128, 192, 64);
    } else {                                           // french: silvered plank
      x.strokeStyle = 'rgba(80,65,45,0.18)';
      x.lineWidth = 1.2;
      for (let px = 6; px < 192; px += 9 + rnd() * 4) {
        x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (rnd() - 0.5) * 3, 192); x.stroke();
      }
    }
    for (let i = 0; i < 22; i++) {                     // weathering streaks from the eaves
      x.fillStyle = 'rgba(120,100,70,' + (0.03 + rnd() * 0.05).toFixed(3) + ')';
      x.fillRect(rnd() * 192, rnd() * 60, 2 + rnd() * 5, 60 + rnd() * 130);
    }
    x.fillStyle = 'rgba(80,65,45,0.14)';               // ground grime at the base
    x.fillRect(0, 184, 192, 8);
  }

  // window dressing: lintel above, sill below, a grime run trailing under
  function reveal(x, rnd, wx, wy, ww, wh) {
    x.fillStyle = 'rgba(61,47,30,0.55)';
    x.fillRect(wx - 3, wy - 4.5, ww + 6, 2.5);
    x.fillStyle = '#e9dfc4';
    x.fillRect(wx - 5, wy + wh + 1, ww + 10, 3);
    x.fillStyle = 'rgba(61,47,30,0.3)';
    x.fillRect(wx - 5, wy + wh + 4, ww + 10, 1.5);
    x.fillStyle = 'rgba(100,82,56,' + (0.08 + rnd() * 0.06).toFixed(3) + ')';
    x.fillRect(wx + ww * 0.2, wy + wh + 5, ww * 0.6, 10 + rnd() * 14);
  }

  // The tavern front: amber-lit ground windows either side of a wide door,
  // dark casements above. Cached per style.
  function tavernFacade(ctx, style) {
    return ctx.canvasTex('wf-tavern-' + style, 192, 192, (x) => {
      const rnd = painterRand('wf-tavern-' + style);
      x.fillStyle = '#ddd2b4';
      x.fillRect(0, 0, 192, 192);
      styleWall(x, style, rnd);
      // upper row: dark casements
      for (const wx of [22, 83, 144]) {
        x.fillStyle = '#f4ecd8'; x.fillRect(wx - 3, 23, 32, 48);
        x.fillStyle = '#3a2e1f'; x.fillRect(wx, 26, 26, 42);
        x.strokeStyle = '#f4ecd8'; x.lineWidth = 1.6;
        x.beginPath();
        x.moveTo(wx + 13, 26); x.lineTo(wx + 13, 68);
        x.moveTo(wx, 47); x.lineTo(wx + 26, 47);
        x.stroke();
        reveal(x, rnd, wx, 26, 26, 42);
      }
      // ground row: the windows glow amber — the house never sleeps
      for (const wx of [14, 148]) {
        x.fillStyle = '#f4ecd8'; x.fillRect(wx - 3, 113, 36, 52);
        x.fillStyle = '#e8a440'; x.fillRect(wx, 116, 30, 46);
        x.strokeStyle = '#6b4a20'; x.lineWidth = 1.6;
        x.beginPath();
        x.moveTo(wx + 15, 116); x.lineTo(wx + 15, 162);
        x.moveTo(wx, 139); x.lineTo(wx + 30, 139);
        x.stroke();
        reveal(x, rnd, wx, 116, 30, 46);
        if (style === 'french') {                  // shutters thrown wide
          x.fillStyle = '#6b4a2e';
          x.fillRect(wx - 13, 116, 9, 46);
          x.fillRect(wx + 34, 116, 9, 46);
        }
      }
      // the wide door
      x.fillStyle = '#33281b';
      x.fillRect(73, 126, 46, 66);
      x.strokeStyle = 'rgba(244,236,216,0.5)';
      x.lineWidth = 1.4;
      for (let px = 78; px < 119; px += 6) {
        x.beginPath(); x.moveTo(px, 128); x.lineTo(px, 190); x.stroke();
      }
      if (style === 'spanish') {                   // arched portal & surround
        x.fillStyle = '#33281b';
        x.beginPath(); x.arc(96, 126, 23, Math.PI, 0); x.fill();
        x.strokeStyle = '#f4ecd8'; x.lineWidth = 4;
        x.beginPath(); x.arc(96, 126, 25, Math.PI, 0); x.stroke();
      }
      if (style === 'english') {                   // jetty beam between floors
        x.fillStyle = 'rgba(91,70,54,0.7)';
        x.fillRect(0, 91, 192, 5);
      }
      if (style === 'dutch') {                     // white sill bands
        x.fillStyle = 'rgba(244,236,216,0.85)';
        x.fillRect(0, 91, 192, 3.5);
        x.fillRect(0, 186, 192, 3.5);
      }
      x.fillStyle = 'rgba(61,47,30,0.32)';         // cornice
      x.fillRect(0, 0, 192, 6);
    });
  }

  // The hanging sign: punchbowl, wheel of fortune or globe, hash-chosen.
  function signTexture(ctx, idx) {
    const key = ['punch', 'wheel', 'globe'][idx % 3];
    return ctx.canvasTex('wf-sign-' + key, 32, 32, (x) => {
      const rnd = painterRand('wf-sign-' + key);
      if (key === 'punch') {
        x.fillStyle = '#27313a'; x.fillRect(0, 0, 32, 32);
        x.fillStyle = '#e8dfc8';
        x.beginPath(); x.arc(16, 14, 9, 0, Math.PI); x.fill();
        x.fillRect(13, 22, 6, 3);
        x.strokeStyle = '#c9bd9e'; x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(12, 10); x.lineTo(13, 5); x.moveTo(19, 10); x.lineTo(20, 5); x.stroke();
      } else if (key === 'wheel') {
        x.fillStyle = '#3a3026'; x.fillRect(0, 0, 32, 32);
        x.strokeStyle = '#d8c890'; x.lineWidth = 2.4;
        x.beginPath(); x.arc(16, 16, 10, 0, Math.PI * 2); x.stroke();
        x.lineWidth = 1.6;
        x.beginPath();
        x.moveTo(6, 16); x.lineTo(26, 16);
        x.moveTo(16, 6); x.lineTo(16, 26);
        x.moveTo(9, 9); x.lineTo(23, 23);
        x.moveTo(23, 9); x.lineTo(9, 23);
        x.stroke();
        x.fillStyle = '#d8c890';
        x.beginPath(); x.arc(16, 16, 2.2, 0, Math.PI * 2); x.fill();
      } else {
        x.fillStyle = '#2e3a44'; x.fillRect(0, 0, 32, 32);
        x.fillStyle = '#7da3a0';
        x.beginPath(); x.arc(16, 14, 10, 0, Math.PI * 2); x.fill();
        x.strokeStyle = '#3f5c5a'; x.lineWidth = 1.4;
        x.beginPath();
        x.moveTo(6, 14); x.lineTo(26, 14);
        x.ellipse(16, 14, 4.5, 10, 0, 0, Math.PI * 2);
        x.stroke();
        x.fillStyle = '#c9bd9e'; x.fillRect(14, 25, 4, 4);
      }
      // the board itself: plank seams, a painted border ring, chipped paint
      x.strokeStyle = 'rgba(20,16,10,0.45)';
      x.lineWidth = 1;
      for (const py of [10.5, 21.5]) {
        x.beginPath(); x.moveTo(1, py); x.lineTo(31, py); x.stroke();
      }
      x.strokeStyle = 'rgba(201,189,158,0.9)';
      x.lineWidth = 1.6;
      x.strokeRect(2, 2, 28, 28);
      x.fillStyle = 'rgba(20,16,10,0.4)';
      for (let i = 0; i < 9; i++) x.fillRect(rnd() * 30, rnd() * 30, 1.5, 1.5);
    });
  }

  // The provisioner's front: small windows set high, a loading door above
  // the big double door.
  function provFacade(ctx, style) {
    return ctx.canvasTex('wf-prov-' + style, 192, 192, (x) => {
      const rnd = painterRand('wf-prov-' + style);
      x.fillStyle = '#ddd2b4';
      x.fillRect(0, 0, 192, 192);
      styleWall(x, style, rnd);
      for (const yTop of [0, 96]) {
        for (const wx of [22, 58, 134, 170]) {
          x.fillStyle = '#f4ecd8'; x.fillRect(wx - 11, 14 + yTop, 22, 26);
          x.fillStyle = '#3a2e1f'; x.fillRect(wx - 8, 17 + yTop, 16, 20);
          reveal(x, rnd, wx - 8, 17 + yTop, 16, 20);
          if (style === 'dutch') {                 // green shutters, Batavia manner
            x.fillStyle = '#4f6b3a';
            x.fillRect(wx - 15, 17 + yTop, 6, 20);
            x.fillRect(wx + 9, 17 + yTop, 6, 20);
          }
        }
      }
      // loading door, first floor centre, under the hoist — the hoisted
      // goods have scuffed the wall below it
      x.fillStyle = '#f4ecd8'; x.fillRect(78, 10, 36, 50);
      x.fillStyle = '#33281b'; x.fillRect(81, 13, 30, 44);
      x.fillStyle = 'rgba(100,82,56,0.14)';
      x.fillRect(84, 60, 24, 60);
      // the big double door
      x.fillStyle = '#f4ecd8'; x.fillRect(66, 124, 60, 68);
      x.fillStyle = '#33281b'; x.fillRect(70, 128, 52, 64);
      x.strokeStyle = 'rgba(244,236,216,0.6)'; x.lineWidth = 2;
      x.beginPath(); x.moveTo(96, 128); x.lineTo(96, 192); x.stroke();
      x.lineWidth = 1.2;
      for (let px = 75; px < 122; px += 6) {
        x.beginPath(); x.moveTo(px, 130); x.lineTo(px, 190); x.stroke();
      }
      x.fillStyle = 'rgba(61,47,30,0.32)';
      x.fillRect(0, 0, 192, 6);
    });
  }

  /* ---------- the tavern ---------- */
  reg.register('tavern', function tavern(ctx, spec) {
    const { THREE, box, roofOn, mats, mergeColored, lump } = ctx;
    const style = spec.style, sd = spec.seed;
    const W = style === 'spanish' ? 9 : 8, D = 6, H = style === 'dutch' ? 6 : 5.6;
    const g = new THREE.Group();
    box(g, mats.stoneMat, W + 0.6, 0.45, D + 0.6, 0);
    box(g, new THREE.MeshLambertMaterial({
      color: tintJitter(THREE, WALL_TINT[style] || 0xc99a72, sd, 60),
      map: tavernFacade(ctx, style),
    }), W, H, D, 0);
    roofOn(g, 'gable', roofMatJittered(ctx, style, sd, 63), W, 2.2, D, 0, H);
    const parts = [];
    // the chimney never goes cold
    const cx = -W / 2 + 0.9;
    parts.push([new THREE.BoxGeometry(1.1, H + 3.4, 1.1).translate(cx, (H + 3.4) / 2, 0), 0x7a4434]);
    parts.push([new THREE.BoxGeometry(1.4, 0.3, 1.4).translate(cx, H + 3.25, 0), 0x6a3a2c]);
    // sign bracket on the front wall
    const sgx = W * 0.3;
    parts.push([new THREE.BoxGeometry(0.09, 0.09, 1.0).translate(sgx, 3.45, D / 2 + 0.5), 0x4a3a28]);
    parts.push([new THREE.BoxGeometry(0.09, 0.45, 0.09).translate(sgx, 3.3, D / 2 + 0.85), 0x4a3a28]);
    // door lantern, hung from a bracket arm (the door sits at facade centre)
    parts.push([new THREE.BoxGeometry(0.07, 0.07, 0.55).translate(1.1, 2.62, D / 2 + 0.27), 0x3a3430]);
    parts.push([new THREE.BoxGeometry(0.04, 0.22, 0.04).translate(1.1, 2.48, D / 2 + 0.5), 0x3a3430]);
    parts.push([new THREE.BoxGeometry(0.2, 0.28, 0.2).translate(1.1, 2.24, D / 2 + 0.5), 0x3a3430]);
    parts.push([lump(0.085).translate(1.1, 2.24, D / 2 + 0.56), 0xf0b54a]);
    // the bench by the door, polished by years of waiting
    parts.push([new THREE.BoxGeometry(1.5, 0.09, 0.42).translate(-1.9, 0.42, D / 2 + 0.4), 0x6b4a2e]);
    parts.push([new THREE.BoxGeometry(0.09, 0.42, 0.36).translate(-2.5, 0.21, D / 2 + 0.4), 0x5e402a]);
    parts.push([new THREE.BoxGeometry(0.09, 0.42, 0.36).translate(-1.3, 0.21, D / 2 + 0.4), 0x5e402a]);
    // a table, stools and barrels out front, on the seed's side
    const side = sd(3) < 0.5 ? -1 : 1;
    const fx = side * W * 0.22, fz = D / 2 + 1.6;
    parts.push([new THREE.CylinderGeometry(0.7, 0.7, 0.08, 7).translate(fx, 0.74, fz), 0x9b8158]);
    parts.push([new THREE.BoxGeometry(0.18, 0.72, 0.18).translate(fx, 0.36, fz), 0x5e402a]);
    for (let i = 0; i < 3; i++) {
      const a = sd(20 + i) * Math.PI * 2;
      parts.push([new THREE.CylinderGeometry(0.22, 0.26, 0.5, 5)
        .translate(fx + Math.cos(a) * 1.25, 0.25, fz + Math.sin(a) * 1.05), 0x6b4a2e]);
    }
    for (let i = 0; i < 2; i++) {
      parts.push([new THREE.CylinderGeometry(0.34, 0.3, 0.7, 6)
        .translate(-side * W * 0.3 + i * 0.8, 0.35, D / 2 + 0.55), 0x7a5636]);
    }
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    // the painted signboard, hung from the bracket
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.8, 0.8),
      new THREE.MeshLambertMaterial({ map: signTexture(ctx, Math.floor(sd(7) * 3)) }));
    plate.position.set(sgx, 2.85, D / 2 + 0.85);
    g.add(plate);
    g.userData.angleFromStreet = true;
    g.userData.smoke = [{ x: cx, y: H + 3.6, z: 0, s: 1.0 }];
    return g;
  });

  /* ---------- the shipwright's yard ---------- */
  reg.register('shipwright', function shipwright(ctx, spec) {
    const { THREE, mats, mergeColored, lump } = ctx;
    const sd = spec.seed;
    const grand = spec.harbor === 'havana' ||
      /arsenal/i.test(spec.name || '') || /arsenal/i.test(spec.note || '');
    const g = new THREE.Group();
    const parts = [];
    // yard timber greys toward driftwood, each stick its own age
    let wi = 0;
    const grey = new THREE.Color(0x8a8478);
    const wd = (hex) => new THREE.Color(hex).lerp(grey, sd(70 + (wi++)) * 0.35).getHex();
    // two timber ground-ways running toward the water, sleepers crossing under
    const slipway = (x0) => {
      for (const wx of [-1.1, 1.1]) {
        parts.push([new THREE.BoxGeometry(0.5, 0.32, 14).translate(x0 + wx, 0.16, -3), wd(0x6b4a2e)]);
      }
      for (let i = 0; i < 7; i++) {
        parts.push([new THREE.BoxGeometry(3.2, 0.2, 0.5).translate(x0, 0.1, 3.4 - i * 2), wd(0x5e402a)]);
      }
    };
    // the ribbed hull frame on its stocks: keel, blocks, five rib pairs,
    // angled shores propping the whole against the sky
    const frame = (x0, k) => {
      const kl = 7.5 * k;
      parts.push([new THREE.BoxGeometry(0.35, 0.5, kl).translate(x0, 1.0 * k, -2), wd(0x7a5636)]);
      for (let i = 0; i < 3; i++) {
        parts.push([new THREE.BoxGeometry(0.9, 0.85 * k, 0.7)
          .translate(x0, 0.42 * k, -2 + (i - 1) * kl * 0.38), wd(0x5e402a)]);
      }
      for (let i = 0; i < 5; i++) {
        const z = -2 + (i - 2) * kl * 0.19;
        const rh = (1.5 + 1.1 * Math.sin(Math.PI * (i + 0.5) / 5)) * k;
        for (const s of [-1, 1]) {
          parts.push([new THREE.BoxGeometry(0.16, rh, 0.3).translate(0, rh / 2, 0)
            .rotateZ(-s * 0.5).translate(x0 + s * 0.25, 1.1 * k, z), wd(0x9b8158)]);
        }
      }
      for (const s of [-1, 1]) {
        for (const zo of [-1, 1]) {
          parts.push([new THREE.BoxGeometry(0.12, 2.0 * k, 0.12).translate(0, 1.0 * k, 0)
            .rotateZ(s * 0.55).translate(x0 + s * 1.05 * k, 0, -2 + zo * kl * 0.26), wd(0x8a7350)]);
        }
      }
      // the ground about the stocks lies deep in chips and shavings
      parts.push([new THREE.CylinderGeometry(1.7, 1.95, 0.05, 9).translate(x0, 0.025, -1.2), 0xc9b488]);
    };
    slipway(grand ? -2.6 : 0);
    frame(grand ? -2.6 : 0, grand ? 1.35 : 1);
    if (grand) { slipway(2.6); frame(2.6, 1.05); }
    // the plank shed, back of the yard
    const xs = grand ? 6.8 : 4.6;
    parts.push([new THREE.BoxGeometry(4.6, 2.6, 3.4).translate(xs, 1.3, 2.8), 0x7a5a38]);
    parts.push([new THREE.BoxGeometry(5.2, 0.09, 2.1).rotateX(0.45).translate(xs, 3.2, 3.65), 0x8a7350]);
    parts.push([new THREE.BoxGeometry(5.2, 0.09, 2.1).rotateX(-0.45).translate(xs, 3.2, 1.95), 0x9b8158]);
    // the sawpit, a plank across it, another leaning by
    const xp = grand ? -7 : -4.2;
    parts.push([new THREE.BoxGeometry(2.6, 0.3, 1.4).translate(xp, 0.15, 2.4), 0x6b4a2e]);
    parts.push([new THREE.BoxGeometry(2.2, 0.08, 1.0).translate(xp, 0.34, 2.4), 0x241c14]);
    parts.push([new THREE.BoxGeometry(0.5, 0.06, 1.9).translate(xp + 0.3, 0.42, 2.4), 0x9b8158]);
    parts.push([new THREE.BoxGeometry(0.32, 2.2, 0.07).translate(0, 1.1, 0)
      .rotateX(-0.5).translate(xp - 1.5, 0, 2.9), 0x8a7350]);
    // squared timber, stacked
    const xt = grand ? 7.4 : 4.8;
    for (let i = 0; i < 3; i++) {
      parts.push([new THREE.BoxGeometry(0.32, 0.32, 4.4).translate(xt + (i - 1) * 0.4, 0.16, -1.5), wd([0x7a5636, 0x6b4a2e, 0x9b8158][i])]);
    }
    for (let i = 0; i < 2; i++) {
      parts.push([new THREE.BoxGeometry(0.32, 0.32, 4.2).translate(xt + (i - 0.5) * 0.4, 0.48, -1.5), wd([0x5e402a, 0x8a7350][i])]);
    }
    // a coil of rigging rope dropped by the shed
    parts.push([new THREE.CylinderGeometry(0.36, 0.4, 0.14, 8).translate(xs - 2.6, 0.07, 1.4), 0xb89b6a]);
    parts.push([new THREE.CylinderGeometry(0.13, 0.13, 0.18, 6).translate(xs - 2.6, 0.09, 1.4), 0x9d8458]);
    // the tar pot, smoking gently, the pitch barrel waiting beside
    const tx = -2.8 + (sd(5) - 0.5) * 0.8, tz = -0.5;
    parts.push([new THREE.CylinderGeometry(0.4, 0.5, 0.7, 7).translate(tx, 0.35, tz), 0x2e2520]);
    parts.push([new THREE.CylinderGeometry(0.42, 0.42, 0.08, 7).translate(tx, 0.72, tz), 0x1c1612]);
    parts.push([new THREE.CylinderGeometry(0.3, 0.27, 0.62, 6).translate(tx + 0.9, 0.31, tz + 0.35), 0x4a3a28]);
    parts.push([new THREE.CylinderGeometry(0.24, 0.24, 0.05, 6).translate(tx + 0.9, 0.62, tz + 0.35), 0x1c1612]);
    if (grand) {
      // the Arsenal's crane, jib out over the slipways
      parts.push([new THREE.BoxGeometry(0.45, 5.5, 0.45).translate(0, 2.75, 1.8), 0x6b4a2e]);
      parts.push([new THREE.BoxGeometry(0.3, 0.3, 4.2).translate(0, 0, -2.1)
        .rotateX(0.5).translate(0, 5.3, 1.8), 0x7a5636]);
      parts.push([new THREE.BoxGeometry(0.05, 1.8, 0.05).translate(0, 3.6, -1.85), 0x3a3026]);
    }
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    g.userData.angleFromStreet = true;
    g.userData.smoke = [{ x: tx, y: 0.95, z: tz, s: 0.7 }];
    return g;
  });

  /* ---------- the smithy ---------- */
  reg.register('smithy', function smithy(ctx, spec) {
    const { THREE, roofOn, mats, mergeColored, lump } = ctx;
    const style = spec.style, sd = spec.seed;
    const W = 6, D = 5, H = 3;
    const tone = tintJitter(THREE, BAY_TINT[style] || 0xb56a4a, sd, 60).getHex();
    const g = new THREE.Group();
    const jx = (sd(4) - 0.5) * 0.5;
    const parts = [
      // three walls and the dark of the bay — the front stands open
      [new THREE.BoxGeometry(W, H, 0.35).translate(0, H / 2, -D / 2 + 0.2), tone],
      [new THREE.BoxGeometry(0.35, H, D).translate(-W / 2 + 0.2, H / 2, 0), tone],
      [new THREE.BoxGeometry(0.35, H, D).translate(W / 2 - 0.2, H / 2, 0), tone],
      [new THREE.BoxGeometry(W - 0.8, H - 0.4, 0.12).translate(0, (H - 0.4) / 2, -D / 2 + 0.45), 0x241c14],
      // the header beam across the open bay, horseshoes nailed up for luck —
      // deep enough to close the sight line under the eave (sky bled through)
      [new THREE.BoxGeometry(W - 0.7, 0.55, 0.18).translate(0, H - 0.3, D / 2 - 0.12), 0x5e402a],
      // the forge bed in the dark of the bay, its mouth aglow
      [lump(0.4).scale(1.3, 0.8, 1).translate(-W / 2 + 1.4, 0.45, -D / 2 + 1.6), 0x3a3430],
      [lump(0.16).translate(-W / 2 + 1.45, 0.58, -D / 2 + 1.85), 0xf08c3a],
      // the chimney outsizes the house
      [new THREE.BoxGeometry(1.5, H + 3.8, 1.5).translate(-W / 2 + 1.1, (H + 3.8) / 2, -D / 2 + 0.9), 0x7a4434],
      [new THREE.BoxGeometry(1.9, 0.35, 1.9).translate(-W / 2 + 1.1, H + 3.7, -D / 2 + 0.9), 0x5e342a],
      // anvil on its stump
      [new THREE.CylinderGeometry(0.3, 0.36, 0.55, 6).translate(0.4, 0.27, 0.3), 0x5e402a],
      [new THREE.BoxGeometry(0.7, 0.28, 0.26).translate(0.4, 0.7, 0.3), 0x4a4a50],
      [new THREE.BoxGeometry(0.3, 0.16, 0.2).translate(0.85, 0.66, 0.3), 0x4a4a50],
      // the quenching trough
      [new THREE.BoxGeometry(1.4, 0.45, 0.55).translate(-1.4, 0.22, 1.4), 0x5e402a],
      [new THREE.BoxGeometry(1.2, 0.08, 0.4).translate(-1.4, 0.42, 1.4), 0x5a6a6e],
      // scrap iron by the door
      [lump(0.26).scale(1.2, 0.6, 1).translate(2.1 + jx, 0.14, 1.8), 0x4f4a44],
      [lump(0.18).translate(2.5 + jx, 0.1, 1.4), 0x5c564e],
      [new THREE.BoxGeometry(0.7, 0.05, 0.18).rotateY(0.7).translate(1.8 + jx, 0.04, 2.2), 0x6a5a40],
      // hitching post for the customers' horses
      [new THREE.BoxGeometry(0.14, 1.1, 0.14).translate(W / 2 + 1.0, 0.55, D / 2 + 0.8), 0x5e402a],
      [new THREE.BoxGeometry(0.5, 0.09, 0.09).translate(W / 2 + 1.0, 1.08, D / 2 + 0.8), 0x6b4a2e],
    ];
    for (let i = 0; i < 5; i++) {        // the horseshoe row on the lintel
      parts.push([new THREE.BoxGeometry(0.1, 0.12, 0.05).translate(-1.0 + i * 0.5, H - 0.3, D / 2 - 0.01), 0x33312e]);
    }
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    roofOn(g, 'gable', roofMatJittered(ctx, style, sd, 63), W, 1.5, D, 0, H);
    g.userData.angleFromStreet = true;
    g.userData.smoke = [{ x: -W / 2 + 1.1, y: H + 4.1, z: -D / 2 + 0.9, s: 1.6 }];
    return g;
  });

  /* ---------- the provisioner ---------- */
  reg.register('provisioner', function provisioner(ctx, spec) {
    const { THREE, box, roofOn, mats, mergeColored, lump } = ctx;
    const style = spec.style, sd = spec.seed;
    const W = 10, D = 7, H = 6.4;
    const coral = spec.harbor === 'bridgetown';
    const wallTint = tintJitter(THREE, coral ? 0xe9e2cf : (WALL_TINT[style] || 0xc99a72), sd, 60);
    const g = new THREE.Group();
    box(g, mats.stoneMat, W + 0.6, 0.5, D + 0.6, 0);
    box(g, new THREE.MeshLambertMaterial({ color: wallTint, map: provFacade(ctx, style) }), W, H, D, 0);
    roofOn(g, 'gable', roofMatJittered(ctx, style, sd, 63), W, coral ? 1.5 : 2.2, D, 0, H);
    const parts = [];
    if (coral) {
      // Bridgetown coral-stone parapet, proud of the roofline
      parts.push([new THREE.BoxGeometry(W + 0.4, 0.7, 0.3).translate(0, H + 0.35, D / 2), 0xe9e2cf]);
      parts.push([new THREE.BoxGeometry(W + 0.4, 0.7, 0.3).translate(0, H + 0.35, -D / 2), 0xe9e2cf]);
      parts.push([new THREE.BoxGeometry(0.3, 0.7, D).translate(-W / 2, H + 0.35, 0), 0xe2dac4]);
      parts.push([new THREE.BoxGeometry(0.3, 0.7, D).translate(W / 2, H + 0.35, 0), 0xe2dac4]);
    }
    // hoist beam over the loading door, rope and sack dangling — the beam
    // anchors into the wall just under the eave (not floating over the roof)
    parts.push([new THREE.BoxGeometry(0.25, 0.25, 1.5).translate(0, H - 0.3, D / 2 + 0.45), 0x5e402a]);
    parts.push([new THREE.BoxGeometry(0.05, 1.7, 0.05).translate(0, H - 1.15, D / 2 + 1.1), 0x3a3026]);
    parts.push([lump(0.42).scale(0.85, 1.1, 0.85).translate(0, H - 2.35, D / 2 + 1.1), 0xcab68e]);
    // barrel row along the front wall
    for (let i = 0; i < 5; i++) {
      parts.push([new THREE.CylinderGeometry(0.32, 0.28, 0.64, 6)
        .translate(-W / 2 + 1.2 + i * 0.75, 0.32, D / 2 + 0.7), [0x7a5636, 0x6b4a2e][i % 2]]);
    }
    // sack pile by the door, one more leant against the jamb
    const sside = sd(6) < 0.5 ? -1 : 1;
    parts.push([lump(0.4).scale(1, 0.7, 1).translate(sside * 2.2, 0.2, D / 2 + 1.1), 0xcab68e]);
    parts.push([lump(0.34).scale(1, 0.7, 1).translate(sside * 2.8, 0.17, D / 2 + 0.9), 0xbfa97e]);
    parts.push([lump(0.3).scale(1, 0.75, 1).translate(sside * 2.45, 0.6, D / 2 + 1.0), 0xcab68e]);
    parts.push([lump(0.3).scale(0.8, 1.25, 0.7).rotateZ(sside * 0.3).translate(sside * 1.7, 0.32, D / 2 + 0.3), 0xbfa97e]);
    // stacked crates wearing the merchant's stencil mark
    parts.push([new THREE.BoxGeometry(0.62, 0.62, 0.62).translate(-sside * 2.0, 0.31, D / 2 + 1.5), 0x9b8158]);
    parts.push([new THREE.BoxGeometry(0.56, 0.56, 0.56).translate(-sside * 2.06, 0.88, D / 2 + 1.45), 0x8a7350]);
    parts.push([new THREE.BoxGeometry(0.18, 0.18, 0.03).translate(-sside * 2.0, 0.34, D / 2 + 1.82), 0x33281b]);
    // the handcart, resting on its handles
    const hx = -sside * (W / 2 + 1.4);
    parts.push([new THREE.BoxGeometry(1.6, 0.1, 0.9).rotateZ(0.22).translate(hx, 0.55, 1.0), 0x8a7350]);
    parts.push([new THREE.CylinderGeometry(0.36, 0.36, 0.09, 8).rotateZ(Math.PI / 2)
      .translate(hx + 0.55, 0.36, 0.52), 0x5e402a]);
    parts.push([new THREE.CylinderGeometry(0.36, 0.36, 0.09, 8).rotateZ(Math.PI / 2)
      .translate(hx + 0.55, 0.36, 1.48), 0x5e402a]);
    parts.push([new THREE.BoxGeometry(0.9, 0.07, 0.07).rotateZ(0.22).translate(hx - 1.05, 0.28, 0.7), 0x6b4a2e]);
    parts.push([new THREE.BoxGeometry(0.9, 0.07, 0.07).rotateZ(0.22).translate(hx - 1.05, 0.28, 1.3), 0x6b4a2e]);
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    g.userData.angleFromStreet = true;
    return g;
  });

  /* ---------- kits for the instanced prop pass (step 4) ---------- */

  // a small lantern: case, glow, cap and loop
  reg.registerKit('lantern', function lantern(ctx) {
    const { THREE, lump } = ctx;
    return ctx.mergeColored([
      [new THREE.BoxGeometry(0.2, 0.28, 0.2).translate(0, 0.34, 0), 0x3a3430],
      [lump(0.085).translate(0, 0.34, 0.06), 0xf0b54a],   // glow pokes out the front face
      [new THREE.BoxGeometry(0.24, 0.05, 0.24).translate(0, 0.5, 0), 0x2e2a26],
      [new THREE.BoxGeometry(0.04, 0.12, 0.04).translate(0, 0.57, 0), 0x2e2a26],
    ]);
  });

  // the forge yard: anvil on its stump, trough, scrap — one merged kit
  reg.registerKit('forgeYard', function forgeYard(ctx) {
    const { THREE, lump } = ctx;
    return ctx.mergeColored([
      [new THREE.CylinderGeometry(0.3, 0.36, 0.55, 6).translate(0, 0.27, 0), 0x5e402a],
      [new THREE.BoxGeometry(0.7, 0.28, 0.26).translate(0, 0.7, 0), 0x4a4a50],
      [new THREE.BoxGeometry(0.3, 0.16, 0.2).translate(0.45, 0.66, 0), 0x4a4a50],
      [new THREE.BoxGeometry(1.3, 0.42, 0.5).translate(-1.1, 0.21, 0.7), 0x5e402a],
      [new THREE.BoxGeometry(1.1, 0.07, 0.36).translate(-1.1, 0.39, 0.7), 0x5a6a6e],
      [lump(0.24).scale(1.2, 0.6, 1).translate(0.9, 0.13, 0.8), 0x4f4a44],
      [lump(0.16).translate(1.25, 0.09, 0.5), 0x5c564e],
      [new THREE.BoxGeometry(0.6, 0.05, 0.16).rotateY(0.7).translate(0.7, 0.03, 1.15), 0x6a5a40],
    ]);
  });

  // hoist beam, rope and dangling sack — origin at the wall plane, ground level
  reg.registerKit('hoistSack', function hoistSack(ctx) {
    const { THREE, lump } = ctx;
    return ctx.mergeColored([
      [new THREE.BoxGeometry(0.22, 0.22, 1.5).translate(0, 3.4, 0.6), 0x5e402a],
      [new THREE.BoxGeometry(0.05, 1.5, 0.05).translate(0, 2.55, 1.2), 0x3a3026],
      [lump(0.4).scale(0.85, 1.1, 0.85).translate(0, 1.5, 1.2), 0xcab68e],
    ]);
  });
})();
