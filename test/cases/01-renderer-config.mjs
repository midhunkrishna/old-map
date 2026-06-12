// Characterize the renderer/camera construction config (ensureEngine ~321-326).
import { loadDiorama } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const h = await loadDiorama();
  await h.dio.open('lisbon'); // open triggers ensureEngine
  const r = h.rec;
  const rend = r.rendererInstance;
  const cam = h.dio._cam;
  assertSnapshot('renderer-config', {
    antialias: r.renderer.opts.antialias,           // true
    alpha: r.renderer.opts.alpha,                   // false
    pixelRatio: r.renderer.pixelRatio,              // min(devicePixelRatio=2, 1.8) → 1.8
    shadowMapEnabled: rend.shadowMap.enabled,       // true
    shadowMapType: rend.shadowMap.type,             // PCFSoftShadowMap (2)
    outputColorSpace: rend.outputColorSpace,        // 'srgb'
    cameraFov: cam.fov,                             // 38
    // construction-time camera args (buildScene later rewrites near/far for radius)
    cameraConstruct: r.cameraConstruct,             // { fov:38, aspect:1280/720, near:1, far:60000 }
  });
}
