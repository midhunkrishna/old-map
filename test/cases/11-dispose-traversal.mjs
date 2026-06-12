// Characterize built.dispose() (~643-647): terrain.dispose(), poi.dispose(),
// and scene.traverse(o => o.geometry?.dispose()). We count geometry disposes and
// poi disposes during a close (which calls built.dispose()).
import { loadDiorama, makeWindow, makeCarta } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const win = makeWindow();
  let poiDisposed = 0;
  // POI present so the poi.dispose() branch is exercised.
  win.cartaHarborPOI = (THREE) => ({
    build: () => ({ setVisible() {}, update() {}, dispose() { poiDisposed++; } }),
  });

  const h = await loadDiorama({ win, carta: makeCarta() });
  await h.dio.open('lisbon');
  const disposesBefore = h.rec.geometryDisposes || 0;

  h.dio.close(); // reduced-motion → synchronous → built.dispose() runs now

  assertSnapshot('dispose-traversal', {
    // placeholder terrain dispose() disposes its land + water geometries (2),
    // plus the scene.traverse pass disposes each mesh geometry it finds.
    geometryDisposesDuringClose: (h.rec.geometryDisposes || 0) - disposesBefore > 0,
    poiDisposed,                                  // 1
    poiDisposedExactlyOnce: poiDisposed === 1,
  });
}
