// Smoke: load → init → open → close drives end-to-end with no throw.
// Not snapshotted; just proves the harness wiring before the real cases.
import { loadDiorama } from '../lib/stubs.mjs';
import { assertEqual } from '../lib/assert.mjs';

export default async function () {
  const h = await loadDiorama();
  await h.dio.open('lisbon');
  assertEqual(h.dio.active, true, 'active after open');
  h.flushFrames(3);
  h.dio.close();
  assertEqual(h.dio.active, false, 'inactive after close');
}
