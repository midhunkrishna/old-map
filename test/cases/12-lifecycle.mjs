// Characterize the lifecycle: open → ticks → close. close() in reduced-motion
// runs synchronously: cancelAnimationFrame fires, bus emits 'diorama-closed',
// active flips false.
import { loadDiorama } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const h = await loadDiorama();
  await h.dio.open('lisbon');
  const activeAfterOpen = h.dio.active;
  h.flushFrames(4);
  const cancelsBefore = h.win._rafCancels;

  h.dio.close();

  assertSnapshot('lifecycle', {
    activeAfterOpen,                                         // true
    cancelAnimationFrameCalled: h.win._rafCancels > cancelsBefore, // true
    busEmits: h.carta.bus._emits,                           // ['diorama-closed']
    activeAfterClose: h.dio.active,                         // false
  });
}
