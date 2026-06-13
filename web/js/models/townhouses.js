/* Carta Temporum — building models: Fine Townhouses.
   The wealthy rung of the dwelling ladder (tier 5), clustered by the church,
   fort, governor and plaza. One grand front per nation, the masonry the chart-
   makers drew large: Spanish stucco with an arcaded ground floor, arched windows,
   an iron balcony and a red clay-tile hip; Dutch a tall stepped-gable brick front;
   English a symmetrical brick house under a hipped shingle roof; French a grey
   stuccoed house with shutters and a steep slate gable. Registered as KITS for
   the instanced pass (the rich quarter is still dozens of houses), each grander
   in massing + material than the plain tier-4 box so wealth reads at a glance.
   Vocabulary: POLYGON Pirate Pack (richfolk.png) + the surveyed record; not a copy.
   Contract: kit(ctx) → BufferGeometry in local metres, origin at ground, +z front;
   ctx supplies THREE, mergeColored([[geo,hex]…]). Deterministic templates. */
'use strict';
(function () {
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

  // harbortown's wealth pass picks a fine kit by the harbour's nation style.
  const FINE = [
    { name: 'fine.spanish', style: 'spanish' },
    { name: 'fine.dutch', style: 'dutch' },
    { name: 'fine.english', style: 'english' },
    { name: 'fine.french', style: 'french' },
  ];
  reg.fineKits = FINE;

  const mk = (THREE) => {
    const tri = (a, b, c) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([...a, ...b, ...c]), 3));
      g.computeVertexNormals();
      return g;
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    return { tri, box };
  };

  // the roof, by nation form
  function roof(P, ctx, o, w, d, H) {
    const { THREE } = ctx; const { box, tri } = mk(THREE);
    P.push([box(w + 0.7, 0.18, d + 0.7).translate(0, H + 0.06, 0), o.roof]);   // overhung eave band
    if (o.roofType === 'hip') {
      const big = Math.max(w, d);
      const r = new THREE.CylinderGeometry(0.6, big * 0.64, 1.7, 4).rotateY(Math.PI / 4);
      r.scale(w / big, 1, d / big);
      P.push([r.translate(0, H + 0.85, 0), o.roof]);
    } else if (o.roofType === 'gable') {
      const rH = 1.8;
      for (const s of [-1, 1]) P.push([box(w + 0.7, 0.15, d / 2 + 0.5)
        .rotateX(s * Math.atan2(rH, d / 2)).translate(0, H + rH / 2 + 0.12, s * (d / 4 + 0.05)), o.roof]);
      for (const s of [-1, 1]) P.push([tri([-w / 2, H, s * d / 2], [w / 2, H, s * d / 2], [0, H + rH, s * d / 2]), o.wall]);
    } else if (o.roofType === 'step') {
      // Dutch stepped/spout gable: a tall front parapet climbing in steps to a finial,
      // a low pitched roof tucked behind it.
      const steps = 4;
      for (let i = 0; i < steps; i++) {
        const bw = w - i * (w * 0.19);
        P.push([box(bw, 0.55, 0.45).translate(0, H + 0.28 + i * 0.5, d / 2 - 0.12), o.wall]);
        P.push([box(bw + 0.12, 0.12, 0.5).translate(0, H + 0.55 + i * 0.5, d / 2 - 0.12), o.trim]);   // step coping
      }
      P.push([box(0.5, 0.7, 0.5).translate(0, H + 0.3 + steps * 0.5, d / 2 - 0.12), o.trim]);          // finial
      P.push([box(w, 0.15, d * 0.95).rotateX(-0.18).translate(0, H + 0.45, -0.25), o.roof]);           // roof behind
    }
  }

  // the shared grand front; nation params switch material, roof, balcony, arches.
  function townhouse(ctx, o) {
    const { THREE, mergeColored } = ctx; const { box } = mk(THREE);
    const P = [];
    const w = o.w || 5.0, d = o.d || 4.2, s1 = o.s1 || 2.8, s2 = o.s2 || 2.7;
    const H = s1 + s2;
    P.push([box(w, H, d).translate(0, H / 2, 0), o.wall]);                         // body
    P.push([box(w + 0.12, 0.2, d + 0.12).translate(0, s1, 0), o.trim]);            // string course between storeys
    P.push([box(w + 0.12, 0.22, d + 0.12).translate(0, 0.16, 0), o.plinth || o.trim]); // plinth
    for (const x of [-1, 1]) P.push([box(0.36, H, 0.36).translate(x * (w / 2 - 0.04), H / 2, d / 2 - 0.04), o.trim]); // quoins
    // two rows of three windows, recessed (arched on the Spanish), framed
    for (const row of [0, 1]) {
      const wy = row === 0 ? s1 * 0.56 : s1 + s2 * 0.54;
      for (let i = -1; i <= 1; i++) {
        if (row === 0 && i === 0) continue;   // ground centre is the doorway
        P.push([box(0.92, 1.32, 0.18).translate(i * 1.55, wy, d / 2 - 0.03), o.glass]);     // recessed light
        P.push([box(1.08, 0.13, 0.12).translate(i * 1.55, wy + 0.72, d / 2 + 0.02), o.trim]); // lintel
        P.push([box(1.08, 0.1, 0.16).translate(i * 1.55, wy - 0.7, d / 2 + 0.02), o.trim]);   // sill
        if (o.arch) P.push([new THREE.CylinderGeometry(0.5, 0.5, 0.16, 8, 1, false, 0, Math.PI)
          .rotateX(Math.PI / 2).translate(i * 1.55, wy + 0.66, d / 2 - 0.03), o.glass]);      // arched head
        if (o.shutters) for (const sx of [-1, 1]) P.push([box(0.34, 1.3, 0.07)
          .translate(i * 1.55 + sx * 0.66, wy, d / 2 + 0.02), o.shutters]);                   // thrown-open shutters
      }
    }
    P.push([box(1.2, 2.0, 0.22).translate(0, 1.0, d / 2 - 0.02), o.door]);          // grand doorway
    P.push([box(1.4, 0.16, 0.3).translate(0, 2.05, d / 2 + 0.05), o.trim]);         // door cornice
    if (o.arcade) for (const i of [-1, 1]) {                                        // an arched bay each side of the door
      P.push([box(0.95, 1.7, 0.16).translate(i * 1.55, 0.95, d / 2 - 0.02), o.glass]);
      P.push([new THREE.CylinderGeometry(0.52, 0.52, 0.16, 8, 1, false, 0, Math.PI)
        .rotateX(Math.PI / 2).translate(i * 1.55, 1.78, d / 2 - 0.02), o.glass]);
    }
    if (o.balcony) {                                                               // first-floor iron balcony
      P.push([box(w * 0.72, 0.18, 0.95).translate(0, s1 + 0.12, d / 2 + 0.38), o.trim]);   // slab
      P.push([box(w * 0.72, 0.1, 0.1).translate(0, s1 + 0.92, d / 2 + 0.82), o.iron]);      // top rail
      const n = 7; for (let i = 0; i <= n; i++) P.push([box(0.07, 0.78, 0.07)
        .translate((i / n - 0.5) * w * 0.72, s1 + 0.52, d / 2 + 0.82), o.iron]);            // balusters
    }
    roof(P, ctx, o, w, d, H);
    return mergeColored(P);
  }

  const NATION = {
    // Spanish: lime-washed stucco, arcaded & arched ground floor, iron balcony, tile hip
    spanish: { wall: 0xe7dbbf, trim: 0xd2c6a6, glass: 0x47433c, door: 0x5a3c28, iron: 0x33302a,
      roof: 0xb5623e, plinth: 0xb9ad90, roofType: 'hip', balcony: true, arch: true, arcade: true },
    // Dutch: red brick, white stone trim, the tall stepped gable to the street
    dutch: { wall: 0xa85a44, trim: 0xe6ddc8, glass: 0x403d39, door: 0x42301f, iron: 0x33302a,
      roof: 0x7d4636, plinth: 0x7a4234, roofType: 'step', balcony: false, s1: 3.0, s2: 2.9 },
    // English: warm brick, sash windows, a hipped shingle roof — restrained Georgian
    english: { wall: 0xc1885f, trim: 0xe2d6bd, glass: 0x46443f, door: 0x432f20, iron: 0x33302a,
      roof: 0x6b5a44, plinth: 0x8a7257, roofType: 'hip', balcony: false },
    // French: grey stucco, louvred shutters thrown open, a steep slate gable
    french: { wall: 0xbcb3a1, trim: 0xd6cbb3, glass: 0x44453d, door: 0x4a3f2c, iron: 0x4f4c44,
      roof: 0x56555a, plinth: 0x9a9180, roofType: 'gable', balcony: true, shutters: 0x6b6a50 },
  };

  for (const f of FINE) {
    const o = NATION[f.style];
    reg.registerKit(f.name, function fine(ctx) { return townhouse(ctx, o); });
  }
})();
