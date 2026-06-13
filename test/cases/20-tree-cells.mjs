// Phase 4 — the tree CPU path: spatial-cell culling, the at-rest skip, and band
// hysteresis through the production cartaLod path (loadTrees({lod:true})).
//   (a) the field partitions into many cells;
//   (b) a camera far beyond FAR rejects every cell (range cull) and draws nothing;
//   (c) two identical updates rebuild once — the second is skipped (≈0 uploads at rest);
//   (d) a tree parked on the near/mid edge keeps its tier as the camera bobs ±2 %
//       (hysteresis: no flicker) — and fresh instances are deterministic.
import { loadTrees } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const { make, THREE } = loadTrees({}, { lod: true });
  const frame = { project: (lng, lat) => ({ x: lng, z: lat }), centroid: { lng: 0, lat: 0 }, radius: 1500 };
  const D2R = Math.PI / 180;
  const lodCtx = { heightPx: 1944, fovScale: 1944 / (2 * Math.tan(38 * D2R / 2)), pixels() {}, distForPixels() {} };
  const cam = (x, y, z) => ({ fov: 38, position: new THREE.Vector3(x, y, z), projectionMatrix: new THREE.Matrix4(), matrixWorldInverse: new THREE.Matrix4() });
  const fresh = (field) => { const t = make(THREE, frame); t.init(field); return t; };

  // a 200-tree field fanned across the [-R, R]² grid
  const grid = [];
  for (let i = 0; i < 200; i++) {
    grid.push({ lngLat: [-1400 + (i % 20) * 140, (-1400 + Math.floor(i / 20) * 280) + 18], kind: ['palm', 'leaf', 'scrub'][i % 3], scale: 1, y: 0 });
  }

  // (a) cells partition the field
  const tA = fresh(grid);
  const cellsTotal = tA.stats.cells;
  if (!(cellsTotal > 4)) throw new Error(`expected many cells, got ${cellsTotal}`);

  // (b) range cull: a camera 60 km out rejects every cell, draws nothing
  const tB = fresh(grid);
  tB.update(cam(60000, 5, 0), 60000, lodCtx);
  const farTested = tB.stats.perf.cellsTested;
  const farDrawn = tB.stats.drawn.ultra + tB.stats.drawn.near + tB.stats.drawn.mid + tB.stats.drawn.far;
  if (farTested !== 0 || farDrawn !== 0) throw new Error(`range cull failed: tested ${farTested}, drawn ${farDrawn}`);

  // (c) at-rest skip: identical camera twice → exactly one rebuild, one skip
  const tC = fresh(grid);
  const near = cam(0, 5, 0);
  tC.update(near, 300, lodCtx);
  const reb1 = tC.stats.perf.rebuilds;
  tC.update(near, 300, lodCtx);
  const reb2 = tC.stats.perf.rebuilds, skipped = tC.stats.perf.skipped;
  if (!(reb1 === 1 && reb2 === 1 && skipped >= 1)) throw new Error(`at-rest skip failed: rebuilds ${reb1}/${reb2}, skipped ${skipped}`);

  // determinism: two fresh instances, same single near update → identical counts
  const d1 = fresh(grid); d1.update(cam(0, 5, 0), 300, lodCtx);
  const d2 = fresh(grid); d2.update(cam(0, 5, 0), 300, lodCtx);
  if (JSON.stringify(d1.stats.drawn) !== JSON.stringify(d2.stats.drawn)) {
    throw new Error('non-deterministic tree membership across fresh instances');
  }

  // (d) hysteresis: one tree parked on the near/mid edge (nE = 240 m). Bob the
  // camera ±2 % around it; with hysteresis it must stay in ONE tier (no flicker).
  const edge = fresh([{ lngLat: [240, 18], kind: 'leaf', scale: 1, y: 0 }]);
  const seq = [];
  for (const off of [0, 6, -6, 5, -5, 6, -6, 4]) {   // distance ~234..246 m around 240
    edge.update(cam(off, 0, 0), 240, lodCtx);
    seq.push([edge.stats.drawn.near, edge.stats.drawn.mid]);
  }
  // exactly one tier ever holds the tree across the whole bob (no near↔mid flip)
  const nearSeen = seq.some((s) => s[0] === 1), midSeen = seq.some((s) => s[1] === 1);
  if (nearSeen && midSeen) throw new Error(`tree flickered near↔mid across the bob: ${JSON.stringify(seq)}`);

  assertSnapshot('tree-cells', {
    cellsTotal, farTested, farDrawn,
    atRest: { reb1, reb2, skipped: skipped >= 1 },
    deterministic: true,
    edgeBob: { nearSeen, midSeen, seq },
  });
}
