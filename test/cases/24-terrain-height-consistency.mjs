// vertex_d_psp.md §5 — the heightAt invariant. heightAt is the single ground-
// elevation oracle (canoe grounding, prop footings, shore grass all read it), so it
// must be deterministic, build-stable, and — once Phase 1's coast bin lands —
// bit-identical to the brute-force coast search. Part (c) (bake-vs-oracle drift)
// auto-activates when T.bake appears in Phase 2; until then it self-skips.
import { loadRealTerrain, makeWindow, makeThree } from '../lib/stubs.mjs';

export default async function () {
  const win = makeWindow(), rec = {};
  const cartaTerrain = await loadRealTerrain(win, rec);
  const THREE = makeThree(rec);

  const ring = [[-9.16, 38.69], [-9.12, 38.69], [-9.12, 38.72], [-9.16, 38.72], [-9.16, 38.69]];
  const lands = [{ properties: { harbor: 'lisbon', kind: 'land' }, geometry: { type: 'Polygon', coordinates: [ring] } }];
  const hills = [{ c: [-9.14, 38.705], rx: 950, ry: 430, h: 52, rot: 8 }];
  const c = { lng: -9.14, lat: 38.705 }, R = Math.PI / 180;
  const project = (lng, lat) => ({ x: (lng - c.lng) * 110540 * Math.cos(c.lat * R), z: -(lat - c.lat) * 110540 });

  const T = cartaTerrain(THREE).build(lands, hills, project);

  // deterministic sample points (LCG, never Math.random)
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pts = [];
  for (let i = 0; i < 100; i++) pts.push([(rnd() - 0.5) * 5000, (rnd() - 0.5) * 5000]);

  // (a) oracle determinism: heightAt called twice is strictly equal
  for (const [x, z] of pts) {
    if (T.heightAt(x, z) !== T.heightAt(x, z)) throw new Error(`heightAt non-deterministic at ${x},${z}`);
  }

  // (b) build determinism: a second build agrees at every point
  const T2 = cartaTerrain(THREE).build(lands, hills, project);
  for (const [x, z] of pts) {
    if (T2.heightAt(x, z) !== T.heightAt(x, z)) throw new Error(`build-to-build drift at ${x},${z}`);
  }

  // (d) binning exactness: binned (production) ≡ brute-force (test escape hatch)
  const Tb = cartaTerrain(THREE).build(lands, hills, project, { bruteForceCoast: true });
  let maxAbs = 0;
  for (const [x, z] of pts) {
    const a = T.heightAt(x, z), b = Tb.heightAt(x, z);
    if (a !== b) throw new Error(`coast bin not bit-identical at ${x},${z}: ${a} vs ${b}`);
    maxAbs = Math.max(maxAbs, Math.abs(a));
  }

  // (c) bake-vs-oracle drift — pending until Phase 2 exposes T.bake
  if (T.bake && typeof T.bake.sample === 'function') {
    // (activated in Phase 2; tolerances per §3.3)
    throw new Error('T.bake present but part (c) not yet implemented for this phase');
  } else {
    console.log('[24] part (c) bake-vs-oracle: pending (no T.bake until Phase 2)');
  }

  console.log(`[24] a/b/d PASS over 100 points (max |heightAt| ${maxAbs.toFixed(1)} m); coast bin bit-identical`);
}
