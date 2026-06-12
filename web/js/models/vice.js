/* Carta Temporum — building models: Logistics & Vice.
   The port-economy factories — 'counting' (whitewashed, barred ground
   windows, scale-beam sign, strongbox, walled forecourt; Batavia Waag
   variant with arches and crane beam), 'boarding' (shabby lodging house,
   sagging washing lines, lean-to, broken fence), 'tent' (driftwood
   A-frames, sailcloth, a beached-hull hovel, fire ring — the beaches of
   Nassau and Tortuga), 'brothel' (red door lantern, madder shutters,
   balcony, bright linens), 'gambling' (shuttered tight, dice signboard,
   barrel-table and stools). Also kits: 'strongbox', 'stocks'.
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

  const WALL_TINT = { english: 0xc99a72, spanish: 0xf0e8d8, dutch: 0xa55f43, french: 0xbfb49a };
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
  // window centres/widths of harbortown's facadeTexture, as fractions of the
  // wall width — so painted overlays (shutters) land on the painted casements
  const WIN = {
    english: { c: [-0.3125, 0, 0.3125], w: 0.167 },
    spanish: { c: [-0.234, 0.224], w: 0.219 },
    dutch: { c: [-0.349, -0.12, 0.109, 0.339], w: 0.135 },
    french: { c: [-0.229, 0.208], w: 0.167 },
  };

  /* ---------- painted canvases ---------- */

  // The counting house front: whitewash, barred ground windows, sashes
  // above; the Waag variant opens in three arches.
  function countingFacade(ctx, waag) {
    return ctx.canvasTex(waag ? 'vc-waag' : 'vc-counting', 192, 192, (x) => {
      const rnd = painterRand(waag ? 'vc-waag' : 'vc-counting');
      x.fillStyle = '#efe9d6';
      x.fillRect(0, 0, 192, 192);
      // the whitewash mottles faintly — kept neater than most walls in port
      for (let i = 0; i < 18; i++) {
        x.fillStyle = 'rgba(150,130,95,' + (0.03 + rnd() * 0.04).toFixed(3) + ')';
        x.beginPath(); x.arc(rnd() * 192, rnd() * 192, 5 + rnd() * 12, 0, Math.PI * 2); x.fill();
      }
      for (let i = 0; i < 12; i++) {       // thin weathering runs from the eaves
        x.fillStyle = 'rgba(120,100,70,' + (0.03 + rnd() * 0.04).toFixed(3) + ')';
        x.fillRect(rnd() * 192, rnd() * 50, 2 + rnd() * 4, 50 + rnd() * 110);
      }
      x.fillStyle = 'rgba(80,65,45,0.12)';
      x.fillRect(0, 185, 192, 7);
      // upper sash windows, with lintel and sill
      for (const wx of [22, 82, 142]) {
        x.fillStyle = '#f6f0de'; x.fillRect(wx - 3, 23, 34, 48);
        x.fillStyle = 'rgba(61,47,30,0.5)'; x.fillRect(wx - 3, 19, 34, 2.5);
        x.fillStyle = '#32281c'; x.fillRect(wx, 26, 28, 42);
        x.strokeStyle = '#f6f0de'; x.lineWidth = 1.6;
        x.beginPath();
        x.moveTo(wx + 14, 26); x.lineTo(wx + 14, 68);
        x.moveTo(wx, 47); x.lineTo(wx + 28, 47);
        x.stroke();
        x.fillStyle = '#e6dcc0'; x.fillRect(wx - 5, 71, 38, 3);
        x.fillStyle = 'rgba(100,82,56,' + (0.07 + rnd() * 0.05).toFixed(3) + ')';
        x.fillRect(wx + 6, 74, 16, 9 + rnd() * 10);
      }
      if (waag) {
        // three round arches across the ground floor
        for (const ax of [38, 96, 154]) {
          x.fillStyle = '#2e2418';
          x.fillRect(ax - 17, 130, 34, 62);
          x.beginPath(); x.arc(ax, 130, 17, Math.PI, 0); x.fill();
          x.strokeStyle = '#cdc0a0'; x.lineWidth = 3;
          x.beginPath(); x.arc(ax, 130, 19, Math.PI, 0); x.stroke();
        }
      } else {
        // barred ground windows — the money sleeps inside. Square iron
        // bars set into the reveal, a cross-stay riveted at the waist.
        for (const wx of [28, 130]) {
          x.fillStyle = '#f6f0de'; x.fillRect(wx - 3, 113, 40, 52);
          x.fillStyle = 'rgba(61,47,30,0.5)'; x.fillRect(wx - 3, 109, 40, 2.5);
          x.fillStyle = '#32281c'; x.fillRect(wx, 116, 34, 46);
          x.strokeStyle = '#2a2620'; x.lineWidth = 2.6;
          for (let bx = wx + 5; bx < wx + 34; bx += 7) {
            x.beginPath(); x.moveTo(bx, 116); x.lineTo(bx, 162); x.stroke();
          }
          x.beginPath(); x.moveTo(wx, 139); x.lineTo(wx + 34, 139); x.stroke();
          x.strokeStyle = 'rgba(216,208,184,0.55)'; x.lineWidth = 1;   // the light catches each bar
          for (let bx = wx + 6; bx < wx + 34; bx += 7) {
            x.beginPath(); x.moveTo(bx, 116); x.lineTo(bx, 162); x.stroke();
          }
          x.fillStyle = '#e6dcc0'; x.fillRect(wx - 5, 165, 44, 3);
          x.fillStyle = 'rgba(100,82,56,0.1)';
          x.fillRect(wx + 8, 168, 18, 16);
        }
        // a door with a proper surround
        x.fillStyle = '#d8d0b8'; x.fillRect(80, 120, 32, 6);
        x.fillStyle = '#f6f0de'; x.fillRect(82, 126, 28, 66);
        x.fillStyle = '#32281c'; x.fillRect(85, 129, 22, 63);
      }
      x.fillStyle = 'rgba(61,47,30,0.3)';
      x.fillRect(0, 0, 192, 6);
    });
  }

  // The gambling den's sign: a pair of dice on dark felt.
  function diceSign(ctx) {
    return ctx.canvasTex('vc-sign-dice', 32, 32, (x) => {
      const rnd = painterRand('vc-sign-dice');
      x.fillStyle = '#2e3a2e';
      x.fillRect(0, 0, 32, 32);
      x.strokeStyle = 'rgba(20,16,10,0.45)';       // the board's plank seams
      x.lineWidth = 1;
      for (const py of [10.5, 21.5]) {
        x.beginPath(); x.moveTo(1, py); x.lineTo(31, py); x.stroke();
      }
      x.fillStyle = '#e8e2d0';
      x.fillRect(5, 7, 10, 10);
      x.fillRect(17, 15, 10, 10);
      x.fillStyle = '#241c14';
      for (const [px, py] of [[7, 9], [9, 11], [11, 13],                       // three
        [19, 17], [24, 17], [21.5, 19], [19, 22], [24, 22]]) {                 // five
        x.fillRect(px, py, 2, 2);
      }
      x.strokeStyle = 'rgba(216,200,144,0.9)';     // painted border ring, paint chipped
      x.lineWidth = 1.6;
      x.strokeRect(2, 2, 28, 28);
      x.fillStyle = 'rgba(20,16,10,0.4)';
      for (let i = 0; i < 9; i++) x.fillRect(rnd() * 30, rnd() * 30, 1.5, 1.5);
    });
  }

  /* ---------- the counting house ---------- */
  reg.register('counting', function counting(ctx, spec) {
    const { THREE, box, roofOn, mats, mergeColored, lump } = ctx;
    const sd = spec.seed;
    const waag = /waag/i.test(spec.name || '') || /waag/i.test(spec.note || '');
    const W = 9, D = 7, H = 6.2;
    const g = new THREE.Group();
    box(g, mats.stoneMat, W + 0.6, 0.5, D + 0.6, 0);
    box(g, new THREE.MeshLambertMaterial({
      color: tintJitter(THREE, 0xf2eee0, sd, 60),
      map: countingFacade(ctx, waag),
    }), W, H, D, 0);
    roofOn(g, 'hip', roofMatJittered(ctx, spec.style, sd, 63), W, 2.4, D, 0, H);
    const parts = [];
    // the brass plaque beside the door, polished by every caller's glove
    parts.push([new THREE.BoxGeometry(0.16, 0.2, 0.04).translate(0.85, 1.55, D / 2 + 0.02), 0xb08d3a]);
    // the scale-beam sign, hung from a wall bracket
    const sgx = W * 0.3;
    parts.push([new THREE.BoxGeometry(0.08, 0.08, 0.9).translate(sgx, 3.6, D / 2 + 0.45), 0x3a3430]);
    parts.push([new THREE.BoxGeometry(0.04, 0.45, 0.04).translate(sgx, 3.38, D / 2 + 0.8), 0x3a3430]);
    parts.push([new THREE.BoxGeometry(1.0, 0.06, 0.06).translate(sgx, 3.15, D / 2 + 0.8), 0x3a3430]);
    for (const s of [-1, 1]) {
      parts.push([new THREE.BoxGeometry(0.025, 0.3, 0.025).translate(sgx + s * 0.48, 2.98, D / 2 + 0.8), 0x3a3430]);
      parts.push([lump(0.11).scale(1, 0.32, 1).translate(sgx + s * 0.48, 2.82, D / 2 + 0.8), 0xb08d3a]);
    }
    // the strongbox by the door
    const bside = sd(8) < 0.5 ? -1 : 1;
    const bx = bside * 1.3, bz = D / 2 + 0.5;
    parts.push([new THREE.BoxGeometry(0.75, 0.42, 0.5).translate(bx, 0.21, bz), 0x4a3a28]);
    parts.push([new THREE.BoxGeometry(0.79, 0.1, 0.54).translate(bx, 0.47, bz), 0x3c2e20]);
    parts.push([new THREE.BoxGeometry(0.06, 0.52, 0.52).translate(bx - 0.22, 0.26, bz), 0x6e6a62]);
    parts.push([new THREE.BoxGeometry(0.06, 0.52, 0.52).translate(bx + 0.22, 0.26, bz), 0x6e6a62]);
    if (waag) {
      // the weigh-house crane beam at the gable peak
      parts.push([new THREE.BoxGeometry(0.3, 0.3, 1.8).translate(0, H + 1.2, D / 2 + 0.7), 0x5e402a]);
      parts.push([new THREE.BoxGeometry(0.05, 1.9, 0.05).translate(0, H + 0.2, D / 2 + 1.4), 0x3a3026]);
      parts.push([new THREE.BoxGeometry(0.18, 0.22, 0.18).translate(0, H - 0.8, D / 2 + 1.4), 0x6e6a62]);
    } else {
      // the neat walled forecourt, gate posts at the gap, raked gravel within
      const fz = D / 2 + 3.2;
      for (const s of [-1, 1]) {
        parts.push([new THREE.BoxGeometry(W / 2 - 1, 0.7, 0.35).translate(s * (W / 4 + 0.5), 0.35, fz), 0xcfc4a8]);
        parts.push([new THREE.BoxGeometry(0.35, 0.7, 3.2).translate(s * W / 2, 0.35, D / 2 + 1.6), 0xcfc4a8]);
        parts.push([new THREE.BoxGeometry(0.28, 1.05, 0.28).translate(s * 1.0, 0.52, fz), 0xbfb494]);
      }
      parts.push([new THREE.BoxGeometry(W - 0.7, 0.06, 2.9).translate(0, 0.03, D / 2 + 1.62), 0xd9d0b8]);
    }
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    g.userData.angleFromStreet = true;
    return g;
  });

  /* ---------- the boarding house ---------- */
  reg.register('boarding', function boarding(ctx, spec) {
    const { THREE, box, roofOn, mats, mergeColored } = ctx;
    const style = spec.style, sd = spec.seed;
    const st = (style === 'english' || style === 'dutch') ? 3 : 2;
    const W = 7, D = 5.5, H = st * 2.6;
    const g = new THREE.Group();
    // the wall is sunk and stretched a touch so the lean leaves no gap: the
    // lifted base edge stays buried, the dipped top corner stays in the roof
    const wall = box(g, new THREE.MeshLambertMaterial({
      color: tintJitter(THREE, 0x9d8e74, sd, 60),
      map: ctx.facadeTexture(style, st),
    }), W, H + 0.15, D, 0, -0.08);
    wall.rotation.z = (sd(2) < 0.5 ? -1 : 1) * 0.015;     // the whole house leans a little
    const roofH = 1.9;
    roofOn(g, 'gable', roofMatJittered(ctx, style, sd, 63), W, roofH, D, 0, H);
    const parts = [];
    // the roof wears two patches of whatever shingle came to hand
    const ra = Math.atan2(roofH, (D + 1) / 2);
    const patch = (px, t, w, l, col) => {
      parts.push([new THREE.BoxGeometry(w, 0.06, l).rotateX(ra)
        .translate(px, H + roofH * t + 0.05, (1 - t) * (D + 1) / 2 + 0.03), col]);
    };
    patch(-1.6, 0.5, 1.5, 1.1, 0x8d7a58);
    patch(1.9, 0.22, 1.1, 0.9, 0x6e5f49);
    // the chimney went crooked years ago and nobody climbed up after it
    parts.push([new THREE.BoxGeometry(0.8, 2.6, 0.8).rotateZ(0.07).translate(W / 2 - 1.2, H + 0.9, -0.6), 0x6e5a44]);
    parts.push([new THREE.BoxGeometry(1.0, 0.2, 1.0).rotateZ(0.07).translate(W / 2 - 1.32, H + 2.1, -0.6), 0x5e4c3a]);
    // two sagging washing lines, hung with grey linen
    const washline = (px, pz, alongX, n) => {
      const L = 4;
      for (const e of [0, 1]) {
        parts.push([new THREE.BoxGeometry(0.1, 2.2, 0.1)
          .translate(px + (alongX ? e * L : 0), 1.1, pz + (alongX ? 0 : e * L)), 0x6b4a2e]);
      }
      for (const e of [0, 1]) {                            // the line dips to the middle
        const seg = new THREE.BoxGeometry(alongX ? L / 2 + 0.1 : 0.04, 0.04, alongX ? 0.04 : L / 2 + 0.1);
        if (alongX) seg.rotateZ((e ? -1 : 1) * 0.16); else seg.rotateX((e ? 1 : -1) * 0.16);
        parts.push([seg.translate(px + (alongX ? L * (0.25 + e * 0.5) : 0), 1.95,
          pz + (alongX ? 0 : L * (0.25 + e * 0.5))), 0x8a7a5c]);
      }
      const drab = [0xcfc6ae, 0x9aa4a8, 0xc2b49a, 0xb0a48a];
      for (let i = 0; i < n; i++) {
        const t = (i + 1) / (n + 1), dy = 1.86 - 0.3 * Math.sin(Math.PI * t);
        parts.push([new THREE.BoxGeometry(alongX ? 0.5 : 0.05, 0.55, alongX ? 0.05 : 0.5)
          .translate(px + (alongX ? L * t : 0), dy - 0.27, pz + (alongX ? 0 : L * t)),
        drab[Math.floor(sd(30 + i) * drab.length)]]);
      }
    };
    washline(W / 2 + 1.1, -1.8, false, 3);
    washline(-2, -D / 2 - 1.6, true, 4);
    // the lean-to against the gable wall
    parts.push([new THREE.BoxGeometry(0.09, 1.4, 0.09).translate(-W / 2 - 1.5, 0.7, -0.9), 0x6b4a2e]);
    parts.push([new THREE.BoxGeometry(0.09, 1.4, 0.09).translate(-W / 2 - 1.5, 0.7, 0.9), 0x6b4a2e]);
    parts.push([new THREE.BoxGeometry(1.9, 0.08, 2.2).rotateZ(0.5).translate(-W / 2 - 0.85, 1.75, 0), 0x8a7350]);
    // the fence gave up some years back
    const fx = W / 2 - 1, fz = D / 2 + 2.2;
    for (let i = 0; i < 3; i++) {
      parts.push([new THREE.BoxGeometry(0.09, 0.8, 0.09).translate(fx - i * 0.9, 0.4, fz), 0x6b4f30]);
    }
    parts.push([new THREE.BoxGeometry(1.8, 0.07, 0.05).translate(fx - 0.9, 0.6, fz), 0x7d5e3a]);
    parts.push([new THREE.BoxGeometry(1.6, 0.07, 0.05).rotateZ(0.35).rotateY(0.4)
      .translate(fx - 2.4, 0.25, fz + 0.3), 0x7d5e3a]);
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    g.userData.angleFromStreet = true;
    g.userData.smoke = [{ x: W / 2 - 1.3, y: H + 2.35, z: -0.6, s: 0.6 }];
    return g;
  });

  /* ---------- the beach camp ---------- */
  reg.register('tent', function tent(ctx, spec) {
    const { THREE, mats, mergeColored, lump } = ctx;
    const sd = spec.seed;
    const g = new THREE.Group();
    const parts = [];
    // camp timber greys toward driftwood, every stick its own age
    let wi = 0;
    const grey = new THREE.Color(0x8a8478);
    const wd = (hex) => new THREE.Color(hex).lerp(grey, sd(80 + (wi++)) * 0.4).getHex();
    // a driftwood A-frame hung with sagging sailcloth
    const aframe = (x0, z0, ry, len, Hh, Dh, pale) => {
      const put = (geo, col) => parts.push([geo.rotateY(ry).translate(x0, 0, z0), col]);
      const L = Math.hypot(Hh, Dh) + 0.15, th = Math.atan2(Hh, Dh);
      put(new THREE.BoxGeometry(len + 0.6, 0.1, 0.1).translate(0, Hh, 0), wd(0x8a7458));
      for (const s of [-1, 1]) {
        const panel = new THREE.BoxGeometry(len, 0.06, L).translate(0, 0, L / 2).rotateX(th);
        if (s < 0) panel.rotateY(Math.PI);
        put(panel.translate(0, Hh, 0), s < 0 ? pale : 0xcfc7b0);
      }
      const phi = Math.atan2(Dh, Hh), Lp = L + 0.5;
      for (const ex of [-len / 2, len / 2]) {
        for (const s of [-1, 1]) {
          put(new THREE.BoxGeometry(0.09, Lp, 0.09).translate(0, Lp / 2, 0)
            .rotateX(-s * phi).translate(ex, 0, s * Dh * 0.95), wd(0x7d6a48));
        }
      }
    };
    aframe(-2.6, 0.8, 0.3 + (sd(11) - 0.5) * 0.4, 2.6, 1.7, 1.3, 0xd9d2bd);
    aframe(2.0, -0.9, -0.5 + (sd(12) - 0.5) * 0.4, 2.2, 1.5, 1.2, 0xd4ccb4);
    if (sd(13) < 0.5) aframe(0.2, 3.2, 1.1 + (sd(14) - 0.5) * 0.4, 2.0, 1.4, 1.1, 0xddd6c2);
    // the beached-hull hovel: an upturned boat with a plank lean-to
    const hry = (sd(15) - 0.5) * 0.6, hx = 4.6, hz = 2.4;
    parts.push([new THREE.CylinderGeometry(1.25, 1.45, 4.4, 8, 1, false, 0, Math.PI)
      .rotateZ(Math.PI / 2).scale(1, 0.72, 1).rotateY(hry).translate(hx, 0, hz), 0x4a3826]);
    parts.push([new THREE.BoxGeometry(4.4, 0.14, 0.18).translate(0, 1.0, 0)
      .rotateY(hry).translate(hx, 0, hz), 0x33271c]);
    parts.push([new THREE.BoxGeometry(2.0, 0.07, 1.7).rotateX(0.85).translate(0, 0.75, 1.9)
      .rotateY(hry).translate(hx, 0, hz), 0x8a7350]);
    // the palmetto windbreak, fronds woven between posts
    const wry = (sd(16) - 0.5) * 0.5;
    for (let i = 0; i < 5; i++) {
      parts.push([new THREE.BoxGeometry(0.08, 1.3, 0.08).translate((i - 2) * 0.55, 0.65, 0)
        .rotateY(wry).translate(-4.2, 0, -1.6), 0x7d6a48]);
    }
    parts.push([new THREE.BoxGeometry(2.5, 0.95, 0.16).translate(0, 0.8, 0)
      .rotateY(wry).translate(-4.2, 0, -1.6), 0x8a9456]);
    parts.push([lump(0.34).scale(1.4, 0.6, 1).translate(-0.6, 1.45, 0)
      .rotateY(wry).translate(-4.2, 0, -1.6), 0x7d8a4f]);
    parts.push([lump(0.3).scale(1.3, 0.55, 1).translate(0.7, 1.4, 0)
      .rotateY(wry).translate(-4.2, 0, -1.6), 0x74824a]);
    // the fire ring at the heart of the camp
    const fx = 0, fz = 1.2;
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2 + sd(17);
      parts.push([lump(0.13).translate(fx + Math.cos(a) * 0.55, 0.08, fz + Math.sin(a) * 0.55), 0x8d8275]);
    }
    parts.push([lump(0.32).scale(1, 0.25, 1).translate(fx, 0.06, fz), 0x3a342c]);
    parts.push([new THREE.BoxGeometry(0.6, 0.05, 0.07).rotateY(0.5).translate(fx, 0.12, fz), 0x241c14]);
    parts.push([new THREE.BoxGeometry(0.5, 0.05, 0.07).rotateY(-0.8).translate(fx, 0.16, fz), 0x2e2418]);
    parts.push([lump(0.11).translate(fx + 0.06, 0.13, fz - 0.05), 0xd96f2e]);   // embers still live
    // the drying rack: a split fish or three on a driftwood spar
    const dx = -1.6, dz = -2.6;
    parts.push([new THREE.BoxGeometry(0.07, 1.15, 0.07).translate(dx - 0.7, 0.57, dz), wd(0x7d6a48)]);
    parts.push([new THREE.BoxGeometry(0.07, 1.15, 0.07).translate(dx + 0.7, 0.57, dz), wd(0x7d6a48)]);
    parts.push([new THREE.BoxGeometry(1.6, 0.05, 0.05).translate(dx, 1.1, dz), wd(0x8a7458)]);
    for (let i = 0; i < 3; i++) {
      parts.push([lump(0.11).scale(0.5, 1.6, 0.25).translate(dx - 0.45 + i * 0.45, 0.86, dz), 0xc9c2ae]);
    }
    // driftwood, strewn where the tide left it
    for (let i = 0; i < 4; i++) {
      parts.push([new THREE.BoxGeometry(0.45 + sd(90 + i) * 0.5, 0.07, 0.09)
        .rotateY(sd(94 + i) * Math.PI)
        .translate(-2.2 + sd(98 + i) * 5.5, 0.04, 4.0 + sd(102 + i) * 1.4), wd(0x8a7458)]);
    }
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    g.userData.angleFromStreet = true;
    g.userData.smoke = [{ x: fx, y: 0.4, z: fz, s: 0.5 }];
    return g;
  });

  /* ---------- the brothel ---------- */
  reg.register('brothel', function brothel(ctx, spec) {
    const { THREE, box, roofOn, mats, mergeColored, lump } = ctx;
    const style = spec.style, sd = spec.seed;
    const W = 7.5, D = 6, H = 5.8;
    const g = new THREE.Group();
    box(g, mats.stoneMat, W + 0.5, 0.4, D + 0.5, 0);
    box(g, new THREE.MeshLambertMaterial({
      color: tintJitter(THREE, WALL_TINT[style] || 0xc99a72, sd, 60),
      map: ctx.facadeTexture(style, 2),
    }), W, H, D, 0);
    roofOn(g, 'gable', roofMatJittered(ctx, style, sd, 63), W, 2.1, D, 0, H);
    const parts = [];
    // madder-red shutters at the upper windows; one window glows warm
    const win = WIN[style] || WIN.english;
    const glowI = Math.floor(sd(44) * win.c.length);
    for (const c of win.c) {
      const off = (win.w * W) / 2 + 0.32;
      for (const s of [-1, 1]) {
        parts.push([new THREE.BoxGeometry(0.5, 1.2, 0.07)
          .translate(c * W + s * off, H * 0.75, D / 2 + 0.05), 0x9c3a32]);
      }
    }
    parts.push([new THREE.BoxGeometry(win.w * W * 0.8, 1.0, 0.03)
      .translate(win.c[glowI] * W, H * 0.75, D / 2 + 0.03), 0xe8a440]);
    // the balcony along the first floor
    parts.push([new THREE.BoxGeometry(W * 0.6, 0.12, 1.0).translate(0, H / 2, D / 2 + 0.5), 0x7a5636]);
    parts.push([new THREE.BoxGeometry(W * 0.6, 0.07, 0.07).translate(0, H / 2 + 0.85, D / 2 + 0.95), 0x6b4a2e]);
    for (let i = 0; i < 6; i++) {
      parts.push([new THREE.BoxGeometry(0.06, 0.8, 0.06)
        .translate((i / 5 - 0.5) * W * 0.55, H / 2 + 0.45, D / 2 + 0.95), 0x6b4a2e]);
    }
    for (const s of [-1, 1]) {
      parts.push([new THREE.BoxGeometry(0.07, 0.07, 0.9).translate(s * W * 0.3, H / 2 + 0.85, D / 2 + 0.5), 0x6b4a2e]);
    }
    // the red-cased lantern by the door says all that need be said
    parts.push([new THREE.BoxGeometry(0.22, 0.3, 0.22).translate(1.0, 2.3, D / 2 + 0.14), 0x8a2424]);
    parts.push([lump(0.09).translate(1.0, 2.3, D / 2 + 0.2), 0xe05838]);
    // the washing line hangs brighter here
    const lx = (sd(9) < 0.5 ? -1 : 1) * (W / 2 + 1.1);
    for (const e of [0, 1]) {
      parts.push([new THREE.BoxGeometry(0.1, 2.1, 0.1).translate(lx, 1.05, -1.7 + e * 3.6), 0x6b4a2e]);
    }
    parts.push([new THREE.BoxGeometry(0.04, 0.04, 3.6).rotateX(0.05).translate(lx, 1.95, 0.1), 0x8a7a5c]);
    // petticoats and good linen — rose, white and saffron, no grey here
    const bright = [0xd98aa0, 0xe6e2d2, 0xd8b04a, 0xc4566a];
    for (let i = 0; i < 4; i++) {
      parts.push([new THREE.BoxGeometry(0.05, 0.45 + sd(46 + i) * 0.25, 0.5).translate(lx, 1.6, -1.2 + i * 0.85),
      bright[Math.floor(sd(40 + i) * bright.length)]]);
    }
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    g.userData.angleFromStreet = true;
    return g;
  });

  /* ---------- the gambling den ---------- */
  reg.register('gambling', function gambling(ctx, spec) {
    const { THREE, box, roofOn, mats, mergeColored, lump } = ctx;
    const style = spec.style, sd = spec.seed;
    const W = 8, D = 6.5, H = 5.6;
    const g = new THREE.Group();
    box(g, mats.stoneMat, W + 0.5, 0.4, D + 0.5, 0);
    box(g, new THREE.MeshLambertMaterial({
      color: tintJitter(THREE, WALL_TINT[style] || 0xc99a72, sd, 60),
      map: ctx.facadeTexture(style, 2),
    }), W, H, D, 0);
    roofOn(g, 'gable', roofMatJittered(ctx, style, sd, 63), W, 2.0, D, 0, H);
    const parts = [];
    // the ground shutters stay closed at every hour
    const win = WIN[style] || WIN.english;
    const groundC = style === 'spanish' ? [-0.234] : win.c.filter((c) => Math.abs(c) > 0.15);
    for (const c of groundC) {
      parts.push([new THREE.BoxGeometry(win.w * W + 0.2, 1.45, 0.07)
        .translate(c * W, H * 0.27, D / 2 + 0.05), 0x5e4630]);
      parts.push([new THREE.BoxGeometry(0.07, 1.45, 0.04)
        .translate(c * W, H * 0.27, D / 2 + 0.1), 0x4a3826]);
    }
    // sign bracket (with its drop rod — the board must hang from something)
    // and door lantern
    const sgx = W * 0.3;
    parts.push([new THREE.BoxGeometry(0.09, 0.09, 0.95).translate(sgx, 3.4, D / 2 + 0.48), 0x4a3a28]);
    parts.push([new THREE.BoxGeometry(0.05, 0.4, 0.05).translate(sgx, 3.28, D / 2 + 0.82), 0x4a3a28]);
    parts.push([new THREE.BoxGeometry(0.2, 0.28, 0.2).translate(-1.1, 2.3, D / 2 + 0.12), 0x3a3430]);
    parts.push([lump(0.085).translate(-1.1, 2.3, D / 2 + 0.18), 0xf0b54a]);
    // a barrel for a table, stools drawn up to it
    const side = sd(5) < 0.5 ? -1 : 1;
    const bx = side * W * 0.25, bz = D / 2 + 1.5;
    parts.push([new THREE.CylinderGeometry(0.36, 0.32, 0.85, 6).translate(bx, 0.42, bz), 0x7a5636]);
    parts.push([new THREE.CylinderGeometry(0.55, 0.55, 0.06, 7).translate(bx, 0.88, bz), 0x9b8158]);
    for (let i = 0; i < 3; i++) {
      const a = sd(50 + i) * Math.PI * 2;
      parts.push([new THREE.CylinderGeometry(0.22, 0.26, 0.5, 5)
        .translate(bx + Math.cos(a) * 1.1, 0.25, bz + Math.sin(a) * 0.95), 0x6b4a2e]);
    }
    // dropped cards and a thrown die, where the night's luck ran out
    for (let i = 0; i < 4; i++) {
      const a = sd(60 + i) * Math.PI * 2, r = 0.6 + sd(66 + i) * 0.8;
      parts.push([new THREE.BoxGeometry(0.1, 0.015, 0.14).rotateY(sd(72 + i) * Math.PI)
        .translate(bx + Math.cos(a) * r, 0.04, bz + Math.sin(a) * r * 0.8), 0xe8e2d0]);
    }
    parts.push([new THREE.BoxGeometry(0.06, 0.06, 0.06).rotateY(0.6).translate(bx + 0.45, 0.03, bz + 0.55), 0xe8e2d0]);
    g.add(new THREE.Mesh(mergeColored(parts), mats.clutterMat));
    // the dice signboard
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.78, 0.78),
      new THREE.MeshLambertMaterial({ map: diceSign(ctx) }));
    plate.position.set(sgx, 2.82, D / 2 + 0.82);
    g.add(plate);
    g.userData.angleFromStreet = true;
    return g;
  });

  /* ---------- kits for the instanced prop pass (step 4) ---------- */

  // the iron-banded strongbox
  reg.registerKit('strongbox', function strongbox(ctx) {
    const { THREE } = ctx;
    return ctx.mergeColored([
      [new THREE.BoxGeometry(0.75, 0.42, 0.5).translate(0, 0.21, 0), 0x4a3a28],
      [new THREE.BoxGeometry(0.79, 0.1, 0.54).translate(0, 0.47, 0), 0x3c2e20],
      [new THREE.BoxGeometry(0.06, 0.52, 0.52).translate(-0.22, 0.26, 0), 0x6e6a62],
      [new THREE.BoxGeometry(0.06, 0.52, 0.52).translate(0.22, 0.26, 0), 0x6e6a62],
      [new THREE.BoxGeometry(0.12, 0.14, 0.05).translate(0, 0.3, 0.26), 0x8a8378],
    ]);
  });

  // the stocks: two posts and the holed board
  reg.registerKit('stocks', function stocks(ctx) {
    const { THREE } = ctx;
    return ctx.mergeColored([
      [new THREE.BoxGeometry(0.16, 1.0, 0.16).translate(-0.75, 0.5, 0), 0x5e402a],
      [new THREE.BoxGeometry(0.16, 1.0, 0.16).translate(0.75, 0.5, 0), 0x5e402a],
      [new THREE.BoxGeometry(1.5, 0.18, 0.12).translate(0, 0.95, 0), 0x7a5636],
      [new THREE.BoxGeometry(1.5, 0.18, 0.12).translate(0, 0.74, 0), 0x7a5636],
      [new THREE.BoxGeometry(0.12, 0.12, 0.04).translate(-0.35, 0.845, 0.06), 0x241c14],
      [new THREE.BoxGeometry(0.12, 0.12, 0.04).translate(0, 0.845, 0.06), 0x241c14],
      [new THREE.BoxGeometry(0.12, 0.12, 0.04).translate(0.35, 0.845, 0.06), 0x241c14],
    ]);
  });
})();
