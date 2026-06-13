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

  // a realistic (but Node-fast) bake for the drift check; tolerance scales with texel
  const T = cartaTerrain(THREE).build(lands, hills, project, { hmRes: 513 });

  // deterministic sample points (LCG, never Math.random)
  let s = 12345;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pts = [];
  for (let i = 0; i < 100; i++) pts.push([(rnd() - 0.5) * 5000, (rnd() - 0.5) * 5000]);

  // (a) oracle determinism: heightAt called twice is strictly equal
  for (const [x, z] of pts) {
    if (T.heightAt(x, z) !== T.heightAt(x, z)) throw new Error(`heightAt non-deterministic at ${x},${z}`);
  }

  // (b) build determinism: a second build agrees at every point. (hmRes tiny — the
  // bake doesn't affect heightAt, and this keeps three full builds fast.)
  const T2 = cartaTerrain(THREE).build(lands, hills, project, { hmRes: 33 });
  for (const [x, z] of pts) {
    if (T2.heightAt(x, z) !== T.heightAt(x, z)) throw new Error(`build-to-build drift at ${x},${z}`);
  }

  // (d) binning exactness: binned (production) ≡ brute-force (test escape hatch)
  const Tb = cartaTerrain(THREE).build(lands, hills, project, { bruteForceCoast: true, hmRes: 33 });
  let maxAbs = 0;
  for (const [x, z] of pts) {
    const a = T.heightAt(x, z), b = Tb.heightAt(x, z);
    if (a !== b) throw new Error(`coast bin not bit-identical at ${x},${z}: ${a} vs ${b}`);
    maxAbs = Math.max(maxAbs, Math.abs(a));
  }

  // (c) bake-vs-oracle drift (auto-activates in Phase 2 once T.bake exists). The
  // bilinear bakeSample IS the on-GPU surface, so |bake.sample − heightAt| in Node
  // is the render-side drift. Tolerances per §3.3.
  if (T.bake && typeof T.bake.sample === 'function') {
    const drift = (x, z) => Math.abs(T.bake.sample(x, z) - T.heightAt(x, z));
    const wr = ring.map(([lng, lat]) => project(lng, lat));   // ring in world metres
    // tolerance scales with texel size (§3.3 relaxed formula): strict 0.05 at 2048.
    const texel = Math.max(T.bake.w, T.bake.d) / (T.bake.n - 1);
    const beachTol = texel * texel * 0.018 / 8 + 0.02;
    const globalFloor = Math.max(0.1, beachTol);   // a global point can land on the steep coast too

    // (c.1) beach band: walk each segment, step inland (the side where heightAt>0),
    // keep 0.5 < h < 3 (≈150–200 pts). Steep gradient → worst bilinear case.
    let beachN = 0, beachMax = 0;
    for (let s = 0; s < wr.length - 1; s++) {
      const a = wr[s], b = wr[s + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      let nx = -(b.z - a.z), nz = (b.x - a.x); const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      for (let t = 0; t < segLen; t += 50) {
        const u = t / segLen, px = a.x + (b.x - a.x) * u, pz = a.z + (b.z - a.z) * u;
        const sign = T.heightAt(px + nx * 30, pz + nz * 30) > 0 ? 1 : -1;
        for (const d of [6, 10, 16, 21, 26, 40]) {
          const x = px + nx * sign * d, z = pz + nz * sign * d, h = T.heightAt(x, z);
          if (h > 0.5 && h < 3) { const e = drift(x, z); beachMax = Math.max(beachMax, e); beachN++;
            if (e >= beachTol) throw new Error(`beach drift ${e.toFixed(3)} ≥ ${beachTol.toFixed(3)} at (${x | 0},${z | 0}) h=${h.toFixed(2)}`); }
        }
      }
    }

    // (c.3) global: 200 LCG points over the bake extent
    let gmax = 0;
    for (let i = 0; i < 200; i++) {
      const x = T.bake.x0 + rnd() * T.bake.w, z = T.bake.z0 + rnd() * T.bake.d;
      const e = drift(x, z), tol = Math.max(globalFloor, 0.01 * Math.abs(T.heightAt(x, z)));
      gmax = Math.max(gmax, e);
      if (e > tol) throw new Error(`global drift ${e.toFixed(3)} > ${tol.toFixed(3)} at (${x | 0},${z | 0})`);
    }
    console.log(`[24] part (c) bake drift OK: beach max ${beachMax.toFixed(3)} m (${beachN} pts), global max ${gmax.toFixed(3)} m`);
  } else {
    console.log('[24] part (c) bake-vs-oracle: pending (no T.bake)');
  }

  console.log(`[24] a/b/d PASS over 100 points (max |heightAt| ${maxAbs.toFixed(1)} m); coast bin bit-identical`);
}
