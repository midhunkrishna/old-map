// clod.md §8.3 — the ship HD↔base cross-fade. With lodfade loaded, a single ship is
// approached by the canoe; we record who renders and the HD dither coverage each
// frame. Expected: base-only when far (hdOn off), then a band where BOTH render with
// 0 < fade < 1, then HD opaque (fade 1, base hidden) close in — and the reverse on
// retreat. The swap stays on the px-sorted Phase-3 policy; this adds only the fade.
import { loadDiorama, makeWindow, makeCarta } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

// a fake material that clones (patchMaterial needs userData + hook slots)
function fakeMat() {
  return { isMaterial: true, opacity: 1, userData: {}, onBeforeCompile: null, customProgramCacheKey: null,
    clone() { return fakeMat(); } };
}
function hdInst() {
  const mesh = { isMesh: true, material: fakeMat(), traverse(cb) { cb(this); } };
  return { inst: { isMesh: false, visible: true, matrixAutoUpdate: true, userData: {}, matrix: { copy() {} },
    traverse(cb) { cb(this); cb(mesh); } }, anim: { billow: [], flutter: [] } };
}
function symInst() {
  return { inst: { isMesh: false, visible: true, matrixAutoUpdate: true, userData: {}, matrix: { copy() {} }, traverse(cb) { cb(this); } },
    anim: { billow: [], flutter: [] } };
}

export default async function () {
  // capture the fade sequence via references to the ship insts, grabbed in the stubs
  const win = makeWindow();
  let symRef = null, hdRef = null;
  win.cartaShipwright = () => ({ materials: () => ({}), SYMBOLIC_SCALE: 3.4,
    LENGTHS: { 'man-of-war': 42 }, shipInstance: () => { const s = symInst(); symRef = s.inst; return s; } });
  win.cartaShipwrightHD = () => ({ shipInstance: () => { const s = hdInst(); hdRef = s.inst; return s; } });
  const pos = { x: 1000, z: 0, heading: 0 };
  win.cartaHarborCanoe = () => ({ build: () => ({ group: { traverse() {} }, spawn: () => 0, update() {}, boatPos: () => pos, dispose() {} }) });
  const carta = makeCarta({ harborShips: [{ harbor: 'lisbon', type: 'man-of-war', lngLat: [-9.14, 38.705], heading: 0 }] });

  const h = await loadDiorama({ win, carta, lodfade: true });
  await h.dio.open('lisbon');
  const kids = win.document.body._kids.find((k) => k.id === 'carta-diorama')._kids;
  kids.find((k) => k.classList && k.classList.contains('dio-tour')).dispatch('click', { button: 0 });

  const sp = h.dio._frame.project(-9.14, 38.705);
  const dpath = [400, 200, 110, 97, 90, 82, 76, 70, 76, 90, 110, 200, 400];
  const rows = [];
  for (const d of dpath) {
    pos.x = sp.x + d; pos.z = sp.z;
    h.flushFrames(1);
    const baseVisible = !!(symRef && symRef.visible);
    const hdVisible = !!(hdRef && hdRef.visible);
    const fade = hdRef && hdRef.userData ? (hdRef.userData.lodFade ?? null) : null;
    rows.push({ d, baseVisible, hdVisible, fade: fade == null ? null : Math.round(fade * 1000) / 1000 });
  }

  // band invariants: base visible whenever fade < 1; HD visible whenever fade > 0;
  // fade reaches 1 (HD-only) at the closest pass and 0 (base-only) at the far ends.
  for (const r of rows) {
    if (r.fade != null) {
      if (r.fade < 1 && !r.baseVisible) throw new Error(`base hidden while fade<1 at d=${r.d}`);
      if (r.fade > 0 && !r.hdVisible) throw new Error(`HD hidden while fade>0 at d=${r.d}`);
    }
  }
  const fades = rows.map((r) => r.fade);
  if (!fades.some((f) => f === 1)) throw new Error('HD never reached full opacity at the closest pass');
  if (!fades.some((f) => f === 0 || f === null)) throw new Error('HD never faded out at the far ends');
  // a band frame with strictly partial coverage must exist (both hulls dithering)
  if (!rows.some((r) => r.fade != null && r.fade > 0 && r.fade < 1 && r.baseVisible && r.hdVisible)) {
    throw new Error('no cross-fade band frame (0<fade<1 with both hulls visible)');
  }

  assertSnapshot('ship-swap-band', { rows });
}
