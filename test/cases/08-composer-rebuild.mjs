// Characterize composer rebuild per open (buildScene → buildComposer each open):
// opening twice builds a fresh composer bound to the new scene/camera; the old
// composer is disposed.
import { loadDiorama } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const h = await loadDiorama();
  await h.dio.open('lisbon');
  const first = h.rec.lastComposer;
  const firstScene = first.passes.find((p) => p.isRenderPass).scene;

  await h.dio.open('porto');
  const second = h.rec.lastComposer;
  const secondScene = second.passes.find((p) => p.isRenderPass).scene;

  assertSnapshot('composer-rebuild', {
    composersBuilt: h.rec.composers.length,          // 2
    distinctInstances: first !== second,             // true
    distinctScenes: firstScene !== secondScene,      // true (new scene per open)
    firstComposerDisposed: first._disposed > 0,      // true
    secondRenderPassSceneIsLive: secondScene === h.scene(),
  });
}
