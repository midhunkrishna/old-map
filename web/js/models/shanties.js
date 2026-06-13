/* Carta Temporum — building models: Humble Dwellings.
   The poor majority of a 1730 harbour — sailcloth tents and lean-tos, plank
   shanties (shed/gable/exposed-frame), shacks raised on pilings over the water,
   and wattle-and-daub cottages with their leeward cook-shed. Registered as
   KITS (fn(ctx) → vertex-coloured BufferGeometry) for the instanced prop pass,
   NOT one-per-point factories: a shanty town is hundreds of dwellings, so they
   must instance. Per-instance scale/lean/colour jitter (applied at placement in
   harbortown's wealth pass) multiplies these few silhouettes into a crowd.
   Vocabulary: POLYGON Pirate Pack (humble.png) + the surveyed Caribbean record
   (palmetto/wattle huts, no chimney → a separate cook-shed). Inspiration, not copy.
   Contract: kit(ctx) → BufferGeometry in local metres, origin at ground, +z front;
   ctx supplies THREE, mergeColored([[geo,hex]…]) and lump(r). Geometry templates
   are deterministic (no Math.random); all run-to-run variety is per-instance. */
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

  /* ---------- the poor palette (carried in vertex colour, drawn matte by
     clutterMat; per-instance setColorAt tints the whole dwelling at placement) */
  const PLANK = [0x9b8662, 0x8a7458, 0xa8946c, 0x8f877a, 0x7d6a48];   // weathered, bleached
  const BEAM = 0x6b5638, DARK = 0x3a2e22, DOOR = 0x4a3826;            // structure / shadowed gaps
  const ROOFW = 0x6b5a44;                                             // plank roofing
  const CANVAS = [0xd9d2bd, 0xcfc7b0, 0xd4ccb4];                      // worn sailcloth
  const THATCH = [0x9a8a52, 0x8a7d46, 0xb0a05e];                      // palmetto / palm
  const DAUB = 0xcabf9c, COB = 0xc2b48e;                              // wattle-and-daub
  const PILE = 0x5e402a, WET = 0x4a3826;                              // wet piling timber

  // The kit list, exported so harbortown's wealth pass knows what to flush and
  // which tier/class each silhouette belongs to. tier: 1 tent · 2 shack · 3 cottage.
  // wet:true → built over water (placed at the waterfront edge only).
  const HUMBLE_KITS = [
    { name: 'tent.ridge',   tier: 1 },
    { name: 'tent.leanto',  tier: 1 },
    { name: 'shanty.shed',  tier: 2 },
    { name: 'shanty.gable', tier: 2 },
    { name: 'shanty.frame', tier: 2 },
    { name: 'shanty.leanto', tier: 2 },
    { name: 'stilt.shed',   tier: 2, wet: true },
    { name: 'cottage.thatch', tier: 3 },
  ];
  reg.humbleKits = HUMBLE_KITS;

  // ---- tiny shared geometry helpers (built per-call from ctx.THREE) ----
  const mk = (THREE) => {
    // a flat triangle (gable-end fill, lean-to gusset); mergeColored handles the
    // non-indexed buffer, computeVertexNormals gives it a matte facing.
    const tri = (a, b, c) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c]), 3));
      g.computeVertexNormals();
      return g;
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    return { tri, box };
  };

  /* ====================== tents (tier 1) ====================== */

  // a sailcloth ridge tent: a ridge pole on shear-legs, two sagging canvas
  // slopes, guy lines pegged out, a dark open flap at the front.
  reg.registerKit('tent.ridge', function tentRidge(ctx) {
    const { THREE, mergeColored, lump } = ctx; const { box, tri } = mk(THREE);
    const P = [];
    const RH = 1.55, half = 1.15, len = 2.4;
    P.push([box(len + 0.3, 0.07, 0.07).translate(0, RH, 0), BEAM]);                       // ridge pole
    for (const s of [-1, 1]) {                                                            // two canvas slopes
      P.push([box(len, 0.05, Math.hypot(RH, half) + 0.1).rotateX(s * Math.atan2(RH, half))
        .translate(0, RH / 2, s * half / 2), CANVAS[s < 0 ? 0 : 1]]);
    }
    for (const ex of [-len / 2, len / 2]) {                                               // shear-leg pairs
      for (const s of [-1, 1]) P.push([box(0.06, RH + 0.5, 0.06).rotateX(-s * 0.62)
        .translate(ex, (RH + 0.5) / 2 - 0.2, s * half * 0.7), BEAM]);
    }
    P.push([tri([-len / 2, 0, half], [len / 2, 0, half], [0, RH, 0]), DARK]);             // dark open flap (front)
    for (let i = 0; i < 4; i++) P.push([box(0.04, 0.04, 0.5).rotateX(0.9)                 // guy lines, pegged
      .translate((i % 2 ? 1 : -1) * (len / 2 + 0.1), 0.3, (i < 2 ? 1 : -1) * (half + 0.3)), BEAM]);
    P.push([lump(0.12).scale(1, 0.4, 1).translate(0.7, 0.05, half + 0.4), 0x6f655a]);     // a stowed bundle
    return mergeColored(P);
  });

  // a one-slope sailcloth lean-to over a low timber frame — the simplest shelter.
  reg.registerKit('tent.leanto', function tentLeanto(ctx) {
    const { THREE, mergeColored, lump } = ctx; const { box, tri } = mk(THREE);
    const P = [];
    const back = 1.7, front = 0.7, d = 1.8;
    for (const x of [-1, 1]) {
      P.push([box(0.07, back, 0.07).translate(x * 1.0, back / 2, -d / 2), BEAM]);          // tall back posts
      P.push([box(0.07, front, 0.07).translate(x * 1.0, front / 2, d / 2), BEAM]);         // short front posts
    }
    P.push([box(2.3, 0.05, d + 0.4).rotateX(Math.atan2(back - front, d))                   // canvas slope
      .translate(0, (back + front) / 2, 0), CANVAS[2]]);
    for (const x of [-1, 1]) P.push([tri([x, back, -d / 2], [x, front, d / 2], [x, 0, d / 2]), CANVAS[0]]);  // side gussets
    P.push([box(2.0, 0.5, 0.1).translate(0, 0.25, -d / 2), 0x6f655a]);                     // a low back board
    P.push([lump(0.14).scale(1.3, 0.5, 1).translate(-0.5, 0.07, d / 2 + 0.3), 0x6a6054]);  // gear by the door
    return mergeColored(P);
  });

  /* ====================== shacks (tier 2) ====================== */

  // a plank shack under a single shed (mono-pitch) roof — the dominant humble
  // silhouette. Back wall taller than the front, roof tilts to throw the rain off.
  reg.registerKit('shanty.shed', function shantyShed(ctx) {
    const { THREE, mergeColored } = ctx; const { box } = mk(THREE);
    const P = [];
    const w = 3.0, d = 2.6, fH = 1.9, bH = 2.5;
    P.push([box(w, fH, d).translate(0, fH / 2, 0), PLANK[0]]);                              // body (front height)
    P.push([box(w, bH - fH, d * 0.96).translate(0, fH + (bH - fH) / 2, -d * 0.02), PLANK[1]]); // raised back band
    P.push([box(w + 0.4, 0.14, d + 0.5).rotateX(-Math.atan2(bH - fH, d))                   // shed roof
      .translate(0, (fH + bH) / 2 + 0.18, -0.05), ROOFW]);
    P.push([box(0.78, 1.4, 0.08).translate(-0.55, 0.7, d / 2 + 0.01), DOOR]);               // door
    P.push([box(0.55, 0.5, 0.06).translate(0.7, 1.2, d / 2 + 0.01), DARK]);                 // window hole
    P.push([box(0.06, 0.55, 0.55).translate(0.7, 1.2, d / 2 + 0.04), BEAM]);                // shutter slats hint
    P.push([box(1.4, 0.1, 0.06).rotateZ(0.22).translate(0.6, 1.65, d / 2 + 0.02), PLANK[3]]); // a nailed-on patch
    return mergeColored(P);
  });

  // a small gable shack — two plank slopes, triangular ends filled.
  reg.registerKit('shanty.gable', function shantyGable(ctx) {
    const { THREE, mergeColored } = ctx; const { box, tri } = mk(THREE);
    const P = [];
    const w = 2.8, d = 2.6, eH = 1.85, rH = 2.55;
    P.push([box(w, eH, d).translate(0, eH / 2, 0), PLANK[2]]);                              // body
    for (const s of [-1, 1]) P.push([box(w + 0.4, 0.12, d / 2 + 0.5)                        // two roof slopes
      .rotateX(s * Math.atan2(rH - eH, d / 2)).translate(0, (eH + rH) / 2 + 0.05, s * (d / 4 + 0.05)), ROOFW]);
    for (const s of [-1, 1]) {                                                              // gable-end fills
      P.push([tri([-w / 2, eH, s * d / 2], [w / 2, eH, s * d / 2], [0, rH, s * d / 2 * 0.0]), PLANK[1]]);
    }
    P.push([box(0.78, 1.35, 0.08).translate(0.4, 0.675, d / 2 + 0.01), DOOR]);              // door
    P.push([box(0.5, 0.45, 0.06).translate(-0.75, 1.2, d / 2 + 0.01), DARK]);               // window
    return mergeColored(P);
  });

  // an exposed-frame, half-built shanty — corner posts, plate and sill rails,
  // a few planks nailed up with daylight between them. Reads "thrown together".
  reg.registerKit('shanty.frame', function shantyFrame(ctx) {
    const { THREE, mergeColored } = ctx; const { box } = mk(THREE);
    const P = [];
    const w = 2.7, d = 2.4, H = 2.1;
    for (const x of [-1, 1]) for (const z of [-1, 1])                                       // 4 corner posts
      P.push([box(0.12, H, 0.12).translate(x * w / 2, H / 2, z * d / 2), BEAM]);
    for (const y of [0.15, H - 0.1]) {                                                      // sill + top plate
      P.push([box(w, 0.1, 0.1).translate(0, y, -d / 2), BEAM]);
      P.push([box(w, 0.1, 0.1).translate(0, y, d / 2), BEAM]);
      P.push([box(0.1, 0.1, d).translate(-w / 2, y, 0), BEAM]);
      P.push([box(0.1, 0.1, d).translate(w / 2, y, 0), BEAM]);
    }
    P.push([box(0.1, H, 0.1).rotateZ(-0.5).translate(-w / 4, H / 2, -d / 2), BEAM]);        // a diagonal brace
    for (let i = 0; i < 4; i++) P.push([box(0.34, H - 0.4, 0.05)                            // sparse planking, gaps
      .translate(-w / 2 + 0.35 + i * 0.62, (H - 0.4) / 2 + 0.1, -d / 2), PLANK[i % 3]]);
    for (let i = 0; i < 3; i++) P.push([box(0.05, H - 0.5, 0.4)
      .translate(w / 2, (H - 0.5) / 2 + 0.1, -d / 2 + 0.45 + i * 0.7), PLANK[(i + 1) % 3]]);
    P.push([box(w + 0.4, 0.12, d * 0.7).rotateX(-0.2).translate(0, H + 0.1, -d * 0.15), ROOFW]); // partial roof
    return mergeColored(P);
  });

  // a lean-to shack: one tall plank wall, a single slope down to two posts,
  // half-enclosed sides. A barrel or two by the opening.
  reg.registerKit('shanty.leanto', function shantyLeanto(ctx) {
    const { THREE, mergeColored } = ctx; const { box, tri } = mk(THREE);
    const P = [];
    const w = 2.6, d = 2.2, back = 2.2, front = 1.3;
    P.push([box(w, back, 0.12).translate(0, back / 2, -d / 2), PLANK[0]]);                  // tall back wall
    for (const x of [-1, 1]) {
      P.push([box(0.1, front, 0.1).translate(x * w / 2, front / 2, d / 2), BEAM]);          // front posts
      P.push([tri([x * w / 2, back, -d / 2], [x * w / 2, front, d / 2], [x * w / 2, 0, d / 2]), PLANK[3]]); // side fill
    }
    P.push([box(w + 0.3, 0.12, d + 0.3).rotateX(Math.atan2(back - front, d))                // roof slope
      .translate(0, (back + front) / 2 + 0.06, 0), ROOFW]);
    P.push([box(w, 0.7, 0.1).translate(0, 0.35, d / 2), PLANK[2]]);                         // low front board
    for (let i = 0; i < 2; i++) P.push([new THREE.CylinderGeometry(0.28, 0.3, 0.7, 7)       // barrels
      .translate(-0.7 + i * 1.3, 0.35, d / 2 + 0.45), 0x6a5236]);
    return mergeColored(P);
  });

  /* ============ stilt shack over the water (tier 2, wet) ============ */

  // a shed shack raised on pilings at the waterfront edge — platform, ladder,
  // cross-braced legs that drop below the origin (into the swell). The signature
  // poor-waterfront silhouette.
  reg.registerKit('stilt.shed', function stiltShed(ctx) {
    const { THREE, mergeColored } = ctx; const { box } = mk(THREE);
    const P = [];
    const w = 2.8, d = 2.4, floor = 1.2, bodyH = 1.7;
    for (const x of [-1, 1]) for (const z of [-1, 1]) {                                     // 4 pilings, into water
      P.push([box(0.16, floor + 1.0, 0.16).translate(x * w / 2 * 0.9, floor - (floor + 1.0) / 2, z * d / 2 * 0.9), PILE]);
    }
    P.push([box(0.1, 0.1, d * 0.9).rotateX(0.5).translate(-w / 2 * 0.9, floor * 0.4, 0), WET]); // a cross-brace
    P.push([box(0.1, 0.1, d * 0.9).rotateX(-0.5).translate(w / 2 * 0.9, floor * 0.4, 0), WET]);
    P.push([box(w + 0.2, 0.12, d + 0.2).translate(0, floor, 0), PLANK[4]]);                 // platform deck
    P.push([box(w - 0.2, bodyH, d - 0.2).translate(0, floor + bodyH / 2, 0), PLANK[0]]);    // body
    P.push([box(w + 0.3, 0.13, d + 0.4).rotateX(-0.18).translate(0, floor + bodyH + 0.18, -0.05), ROOFW]); // shed roof
    P.push([box(0.7, 1.3, 0.07).translate(-0.5, floor + 0.65, d / 2 - 0.1 + 0.01), DOOR]);  // door
    P.push([box(0.5, 0.45, 0.06).translate(0.7, floor + 1.1, d / 2 - 0.1 + 0.01), DARK]);   // window
    P.push([box(0.5, 0.07, 1.7).rotateX(0.6).translate(0, floor * 0.55, d / 2 + 0.7), BEAM]); // ladder/ramp to shore
    return mergeColored(P);
  });

  /* ====================== cottage (tier 3) ====================== */

  // a wattle-and-daub cottage with a steep overhung thatch roof, a hint of timber
  // framing, and a separate leeward cook-shed (the period detail: no chimney on
  // the house, the cooking fire kept in its own little hut for safety).
  reg.registerKit('cottage.thatch', function cottageThatch(ctx) {
    const { THREE, mergeColored, lump } = ctx; const { box, tri } = mk(THREE);
    const P = [];
    const w = 3.2, d = 2.9, eH = 2.1, rH = 3.0;
    P.push([box(w, eH, d).translate(0, eH / 2, 0), DAUB]);                                  // daub body
    P.push([box(w + 0.04, 0.12, 0.12).translate(0, eH * 0.55, d / 2), BEAM]);               // a framing rail
    for (const x of [-1, 1]) P.push([box(0.12, eH, 0.12).translate(x * w / 2, eH / 2, d / 2), BEAM]); // corner studs
    for (const s of [-1, 1]) P.push([box(w + 1.0, 0.16, d / 2 + 0.8)                        // overhung thatch slopes
      .rotateX(s * Math.atan2(rH - eH, d / 2)).translate(0, (eH + rH) / 2 + 0.06, s * (d / 4 + 0.05)), THATCH[0]]);
    P.push([box(w + 0.6, 0.18, 0.2).translate(0, rH, 0), THATCH[2]]);                       // thatched ridge cap
    for (const s of [-1, 1]) P.push([tri([-w / 2, eH, s * d / 2], [w / 2, eH, s * d / 2], [0, rH, s * d / 2]), COB]); // gable fill
    P.push([box(0.85, 1.5, 0.08).translate(0, 0.75, d / 2 + 0.01), DOOR]);                  // door
    P.push([box(0.5, 0.45, 0.06).translate(-1.0, 1.35, d / 2 + 0.01), DARK]);               // window
    // the leeward cook-shed: a tiny open hut set off to the side
    const cx = w / 2 + 1.1;
    P.push([box(1.3, 1.4, 1.3).translate(cx, 0.7, -0.4), PLANK[1]]);
    for (const s of [-1, 1]) P.push([box(1.6, 0.1, 0.95).rotateX(s * 0.5)
      .translate(cx, 1.55, -0.4 + s * 0.4), THATCH[1]]);
    P.push([lump(0.18).scale(1, 0.4, 1).translate(cx, 0.05, 0.5), 0x33302a]);               // a fire-ring smudge
    return mergeColored(P);
  });
})();
