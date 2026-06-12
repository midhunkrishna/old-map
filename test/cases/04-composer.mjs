// Characterize the bloom composer (buildComposer ~656-664):
// 2 passes (RenderPass + UnrealBloomPass), bloom params [0.72,0.6,0.8],
// composer.size == window size, RenderPass holds the live scene+camera.
import { loadDiorama } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const h = await loadDiorama();
  await h.dio.open('lisbon');
  const comp = h.rec.lastComposer;
  const renderPass = comp.passes.find((p) => p.isRenderPass);
  const bloom = comp.passes.find((p) => p.isBloomPass);
  assertSnapshot('composer', {
    passCount: comp.passes.length,                       // 2
    passKinds: comp.passes.map((p) => p.isRenderPass ? 'render' : p.isBloomPass ? 'bloom' : 'other'),
    bloomParams: bloom.params,                           // [0.72, 0.6, 0.8]
    bloomResolution: [bloom.resolution.x, bloom.resolution.y], // [1280, 720]
    composerSize: comp.size,                             // [1280, 720]
    renderPassSceneIsLive: renderPass.scene === h.scene(),
    renderPassCameraIsLive: renderPass.camera === h.dio._cam,
  });
}
