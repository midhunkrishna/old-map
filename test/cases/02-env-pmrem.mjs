// Characterize the PMREM environment build (buildEnv ~352-369):
// env texture non-null; the source gradient canvas is 8x64.
import { loadDiorama } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const h = await loadDiorama();
  await h.dio.open('lisbon'); // ensureEngine → buildEnv
  const r = h.rec;
  assertSnapshot('env-pmrem', {
    canvasTextureW: r.canvasTexture.w,  // 8
    canvasTextureH: r.canvasTexture.h,  // 64
    pmremSourceMapping: r.pmremSource ? r.pmremSource.mapping : null, // EquirectangularReflectionMapping (301)
  });
}
