// Characterize applyEnv transitions (~374-382) driven true→false→true via the
// Studio-light button. Snapshot: scene.environment non-null, hemi.intensity,
// water.uShine.value, and the env button's 'on' class.
//
// Two variants:
//   stub   — placeholder terrain (MeshPhongMaterial water; uniforms.uShine absent,
//            so the water-shine line is a no-op; this proves the env/hemi/button seam).
//   real   — loads the REAL web/js/harborterrain.js so water is a ShaderMaterial with
//            a genuine uniforms.uShine, proving the host→water uniform coupling.
import { loadDiorama, loadRealTerrain, makeWindow, makeCarta, lightRig } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

function findEnvButton(win) {
  const host = win.document.body._kids.find((k) => k.id === 'carta-diorama');
  return host._kids.find((k) => k.classList && k.classList.contains('dio-env')
    && !k.classList.contains('dio-labels') && !k.classList.contains('dio-tour'));
}

function snap(h, win) {
  const scene = h.scene();
  const { hemi } = lightRig(scene);
  const envBtn = findEnvButton(win);
  let uShine = null;
  scene.traverse((o) => {
    if (o.material && o.material.uniforms && o.material.uniforms.uShine) uShine = o.material.uniforms.uShine.value;
  });
  return {
    environmentNonNull: scene.environment != null,
    hemiIntensity: hemi.intensity,
    waterShine: uShine,
    btnOn: envBtn.classList.contains('on'),
  };
}

async function driveVariant({ real } = {}) {
  const win = makeWindow();
  const rec = {};
  if (real) await loadRealTerrain(win, rec);

  const h = await loadDiorama({ win, rec, carta: makeCarta() });
  await h.dio.open('lisbon');

  const envBtn = findEnvButton(win);
  const onA = snap(h, win);   // env ON (default after open)
  envBtn.dispatch('click');   // → OFF
  const off = snap(h, win);
  envBtn.dispatch('click');   // → ON
  const onB = snap(h, win);
  return { onA, off, onB };
}

export default async function () {
  const stub = await driveVariant({ real: false });
  assertSnapshot('env-transitions-stub', stub);

  const realRun = await driveVariant({ real: true });
  // The genuine seam: with real terrain, water.uShine must track env ON/OFF (1/0).
  if (realRun.onA.waterShine !== 1 || realRun.off.waterShine !== 0 || realRun.onB.waterShine !== 1) {
    throw new Error('env-transitions-real: water uShine did not track env (expected 1→0→1, got '
      + JSON.stringify([realRun.onA.waterShine, realRun.off.waterShine, realRun.onB.waterShine]) + ')');
  }
  assertSnapshot('env-transitions-real', realRun);
}
