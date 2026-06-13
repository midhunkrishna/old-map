// Phase 1 task 1.6 — the severed camDist plumbing is reconnected: trees.update
// now forwards camDist into updateMetric, so the distance-gated reveal responds
// to how far the camera sits from its target (overview) or the 0.18R tour pin,
// not the camera's distance from the world origin. This DELIBERATELY changes
// reveal; we capture it here so the change is reviewed, not silent.
//
// The Frustum stub never culls, so trees.stats.drawn depends only on distance,
// per-tree rank, the SSE-normalized band edges, and caps — all deterministic.
import { loadTrees, loadLod } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const { make, THREE } = loadTrees();

  // a frame whose project() treats lng/lat as plain metres about the origin; no
  // heightAt → trees sit at y = 0 and the hill-forest dressing is skipped.
  const frame = {
    project: (lng, lat) => ({ x: lng, z: lat }),
    centroid: { lng: 0, lat: 0 },
    radius: 1500,
  };

  // 60 trees fanned out along +x from 20 m to 1200 m; mixed kinds so every band's
  // tiers can fill. lngLat carries [xMetres, latForSpeciesMix].
  const field = [];
  for (let i = 0; i < 60; i++) {
    const x = 20 + i * 20;
    field.push({ lngLat: [x, 18 + (i % 5)], kind: ['palm', 'leaf', 'scrub'][i % 3], scale: 1, y: 0 });
  }

  // overview reference lod context (k = 1 → band edges are exactly today's metres)
  const D2R = Math.PI / 180;
  const heightPx = 1944, fovScale = heightPx / (2 * Math.tan(38 * D2R / 2));
  const lodCtx = { heightPx, fovScale, pixels() {}, distForPixels() {} };

  const cam = {
    fov: 38,
    position: new THREE.Vector3(0, 5, 0),
    projectionMatrix: new THREE.Matrix4(),
    matrixWorldInverse: new THREE.Matrix4(),
  };

  function drawnAt(trees, camDist) {
    trees.update(cam, camDist, lodCtx);
    const d = trees.stats.drawn;
    return { ultra: d.ultra, near: d.near, mid: d.mid, far: d.far };
  }

  // three fixed synthetic reveal distances: close-in (full reveal), mid, and a
  // wide framing (reveal clamps toward its 0.45 floor → fewer trees drawn).
  const trees = make(THREE, frame);
  trees.init(field);
  const close = drawnAt(trees, 200);
  const mid = drawnAt(trees, 1200);
  const wide = drawnAt(trees, 3000);

  // idempotent re-init: a SECOND tree system over the same field/distances must
  // produce identical counts (no hidden run-to-run state; Math.random touches
  // only cosmetic yaw, never band membership).
  const trees2 = make(THREE, frame);
  trees2.init(field);
  const close2 = drawnAt(trees2, 200);

  if (JSON.stringify(close) !== JSON.stringify(close2)) {
    throw new Error(`tree band membership not idempotent:\n  ${JSON.stringify(close)}\n  ${JSON.stringify(close2)}`);
  }

  assertSnapshot('tree-band-membership', { close, mid, wide });
}
