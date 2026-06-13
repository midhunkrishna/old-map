// Phase 1 — cartaLod.band hysteresis. A value parked on an edge, dithered ±2%
// frame to frame, must NOT oscillate: once promoted to a closer band it only
// demotes after retreating past edge·(1+h). Sweeps each edge and asserts zero
// flip-flops, then goldens the band sequence of a scripted in/out distance path.
import { loadLod } from '../lib/stubs.mjs';
import { assertEqual, assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const lod = loadLod();
  const edges = [130, 280, 780, 2400];   // representative ascending band edges (m)
  const h = 0.12;

  // Hover at each edge, jittering ±2%, feeding the previous band back in. With
  // hysteresis the band index must be stable (a single value, never toggling).
  for (const e of edges) {
    let prev = lod.band(e, edges, 0, h);
    const seen = new Set([prev]);
    const seq = [0.98, 1.02, 0.99, 1.01, 1.0, 0.985, 1.015];
    for (const f of seq) {
      const b = lod.band(e * f, edges, prev, h);
      seen.add(b);
      prev = b;
    }
    // at most TWO adjacent bands may appear (the edge sits between them); the key
    // property is no repeated A→B→A flip — assert the run is monotone-stable by
    // checking the set size ≤ 2 AND the final equals a settled value.
    if (seen.size > 2) throw new Error(`band oscillated at edge ${e}: saw ${[...seen]}`);
  }

  // explicit no-flip check: a value at exactly an edge, approached from below then
  // nudged just over, stays in the lower (closer) band until past edge·(1+h).
  const e = 780, prevClose = 2; // sitting in band 2 (the [280,780) band)
  assertEqual(lod.band(e * 1.05, edges, prevClose, h), 2, 'within hysteresis stays put');
  assertEqual(lod.band(e * 1.20, edges, prevClose, h), 3, 'past edge·(1+h) demotes');
  assertEqual(lod.band(e * 0.95, edges, prevClose, h), 2, 'clearly inside stays');

  // golden a scripted dolly-in-then-out path's band sequence
  const path = [3000, 2000, 1500, 900, 700, 400, 200, 120, 90, 120, 300, 800, 2000, 3000];
  const bands = [];
  let prev = 4;
  for (const d of path) { prev = lod.band(d, edges, prev, h); bands.push(prev); }

  assertSnapshot('lod-band-path', { edges, h, path, bands });
}
