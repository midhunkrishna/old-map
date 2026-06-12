// Characterize the loop's render decision (loop ~1018-1019):
// env ON → composer.render() advances, renderer.render() does not;
// env OFF → renderer.render() advances.
// applyEnv is not directly exposed, but the env button's click handler is
// (envBtn.addEventListener('click', () => applyEnv(!envOn))). We toggle via it.
import { loadDiorama } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

// Find the dio-env (Studio light) button among the host's children: it's the
// element whose recorded click handler toggles env. We locate it via the host
// tree captured on document.body.
function findEnvButton(win) {
  const host = win.document.body._kids.find((k) => k.id === 'carta-diorama');
  return host._kids.find((k) => k.classList && k.classList.contains('dio-env') && !k.classList.contains('dio-labels') && !k.classList.contains('dio-tour'));
}

export default async function () {
  const h = await loadDiorama();
  await h.dio.open('lisbon');

  // env ON (default): tick and observe composer advances, renderer stays put
  let r0 = h.rec.renderCount, c0 = h.rec.composerRenderCount || 0;
  h.flushFrames(3);
  const envOn = {
    composerAdvanced: (h.rec.composerRenderCount || 0) - c0,
    rendererAdvanced: h.rec.renderCount - r0,
  };

  // toggle env OFF via the Studio-light button click handler
  const envBtn = findEnvButton(h.win);
  envBtn.dispatch('click');
  r0 = h.rec.renderCount; c0 = h.rec.composerRenderCount || 0;
  h.flushFrames(3);
  const envOff = {
    composerAdvanced: (h.rec.composerRenderCount || 0) - c0,
    rendererAdvanced: h.rec.renderCount - r0,
  };

  assertSnapshot('render-decision', {
    envOn: { composer: envOn.composerAdvanced > 0, renderer: envOn.rendererAdvanced === 0 },
    envOff: { composer: envOff.composerAdvanced === 0, renderer: envOff.rendererAdvanced > 0 },
  });
}
