// Phase 0 / Task 0.A — the system-requirements fine print is injected into the
// diorama DOM in overview and hidden in tour (via the .touring rule). This is a
// DOM-only addition with no rendering change, so no existing golden moves; this
// new case guards the fine-print's presence, text, and the touring-hide rule.
//
// The DOM stub (test/lib/stubs.mjs) has no querySelector, so we assert via the
// host's child list and the injected <style> element's textContent.
import { loadDiorama } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

function injectedStyle(win) {
  return (win.document.head._kids || []).find((k) => k.tagName === 'STYLE') || null;
}
function hostEl(win) {
  return (win.document.body._kids || []).find((k) => k.id === 'carta-diorama') || null;
}

export default async function () {
  const h = await loadDiorama();
  await h.dio.open('lisbon');

  const host = hostEl(h.win);
  if (!host) throw new Error('sysreq-dom: #carta-diorama host not found in document.body');

  const sysreq = (host._kids || []).find(
    (k) => k.classList && k.classList.contains('dio-sysreq')
  );
  const style = injectedStyle(h.win);

  assertSnapshot('sysreq-dom', {
    present: !!sysreq,
    text: sysreq ? sysreq.textContent : null,
    cssHasTouringHide: !!(style && style.textContent.includes('.touring .dio-sysreq')),
  });
}
