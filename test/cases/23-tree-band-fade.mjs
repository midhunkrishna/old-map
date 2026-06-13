// clod.md §8.5 — the tree tier cross-fade dual-write, characterized through the real
// harbortrees.js with both cartaLod (band hysteresis) and cartaLodFade (dither)
// loaded. A tree parked on the NEAR/MID boundary margin must appear in BOTH tiers
// with complementary coverage (+c in the inner geometry tier, −c in the outer
// billboard tier, equal magnitude); a tree clearly inside a band appears once with
// full coverage. Pose-pure → identical on a second run.
import { loadTrees } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

function writtenFades(tiers, band) {
  const out = [];
  for (const key of Object.keys(tiers[band])) {
    const tier = tiers[band][key];
    if (!tier) continue;
    const af = tier.geometry.attributes.aFade;
    for (let i = 0; i < tier.count; i++) out.push(Math.round(af.array[i] * 1000) / 1000);
  }
  return out;
}

function probe() {
  const { make, THREE } = loadTrees({}, { lod: true, lodfade: true });
  const frame = { project: (lng, lat) => ({ x: lng, z: lat }), centroid: { lng: 0, lat: 0 }, radius: 1500 };
  // NEAR edge nE = max(160, 0.16·1500) = 240 m; FW = min(12.5, 240·0.04) = 9.6 m →
  // margin (230.4, 249.6). Place one tree in-margin (240) and one clearly near (200).
  const field = [
    { lngLat: [240, 0], kind: 'leaf', scale: 1, y: 0 },   // on the NEAR/MID boundary
    { lngLat: [200, 0], kind: 'leaf', scale: 1, y: 0 },   // clearly inside NEAR
  ];
  const D2R = Math.PI / 180;
  const lodCtx = { heightPx: 1944, fovScale: 1944 / (2 * Math.tan(38 * D2R / 2)), pixels() {}, distForPixels() {} };
  const cam = { fov: 38, position: new THREE.Vector3(0, 0, 0), projectionMatrix: new THREE.Matrix4(), matrixWorldInverse: new THREE.Matrix4() };

  const trees = make(THREE, frame);
  trees.init(field);
  trees.update(cam, 200, lodCtx);   // camDist small → reveal = 1 (both revealed)

  const drawn = trees.stats.drawn;
  const nearF = writtenFades(trees.tiers, 'near');
  const midF = writtenFades(trees.tiers, 'mid');
  return { drawn: { ultra: drawn.ultra, near: drawn.near, mid: drawn.mid, far: drawn.far }, nearF, midF };
}

export default async function () {
  const a = probe();
  const b = probe();
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error('tree fade not pose-pure across runs');

  // the margin tree dual-writes: a partial +c in near and the exact −c in mid
  const plusC = a.nearF.find((v) => v > 0 && v < 1);
  if (plusC == null) throw new Error(`no partial +c in near tier: ${JSON.stringify(a.nearF)}`);
  const minusC = a.midF.find((v) => v < 0);
  if (minusC == null) throw new Error(`no −c in mid tier: ${JSON.stringify(a.midF)}`);
  if (Math.abs(plusC + minusC) > 1e-6) throw new Error(`+c/−c not complementary: ${plusC} vs ${minusC}`);

  // the clearly-near tree is a single full-coverage write
  if (!a.nearF.includes(1)) throw new Error(`expected a full-coverage near write (1.0): ${JSON.stringify(a.nearF)}`);

  // the margin tree consumed a slot in BOTH near and mid
  if (!(a.drawn.near >= 1 && a.drawn.mid >= 1)) throw new Error(`dual-write not reflected in counts: ${JSON.stringify(a.drawn)}`);

  assertSnapshot('tree-band-fade', a);
}
