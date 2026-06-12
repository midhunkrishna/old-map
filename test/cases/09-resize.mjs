// Characterize onResize (~1022-1028): invoking the recorded window 'resize'
// listener propagates new dimensions to renderer.setSize, camera.aspect, composer.setSize.
import { loadDiorama } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const h = await loadDiorama();
  await h.dio.open('lisbon');

  h.win.innerWidth = 800;
  h.win.innerHeight = 600;
  h.fireWindow('resize');

  const cam = h.dio._cam;
  assertSnapshot('resize', {
    rendererSize: h.rec.renderer.size,     // [800, 600]
    cameraAspect: cam.aspect,              // 800/600
    composerSize: h.rec.lastComposer.size, // [800, 600]
  });
}
