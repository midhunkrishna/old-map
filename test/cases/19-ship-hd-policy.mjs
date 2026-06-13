// Phase 3 — the ship HD cap-fairness policy. Four ships of distinct types sit at
// one spot; a canoe approaches and retreats. Since px ∝ length at equal distance,
// the HD_CAP=3 slots must go to the three LARGEST (man-of-war, merchantman,
// brigantine) — the sloop is always the odd one out — and no ship may flicker in
// or out of its slot. (The idle prewarm + dithered cross-fade are validated by
// the plan's manual hitch capture / A-B recording; this case pins the selection.)
import { loadDiorama, makeWindow, makeCarta } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

const TYPES = ['man-of-war', 'merchantman', 'brigantine', 'sloop'];   // descending length

function shipStub() {
  return {
    inst: { isMesh: false, visible: true, matrixAutoUpdate: true,
      matrix: { copy() {} }, traverse(cb) { cb(this); } },
    anim: { billow: [], flutter: [] },
  };
}

export default async function () {
  const win = makeWindow();
  const symByType = {}, hdByType = {};

  win.cartaShipwright = (THREE) => ({
    materials: () => ({}),
    SYMBOLIC_SCALE: 3.4,
    LENGTHS: { canoe: 7, sloop: 18, brigantine: 24, merchantman: 30, 'man-of-war': 42 },
    shipInstance: (type) => { const s = shipStub(); symByType[type] = s.inst; return s; },
  });
  win.cartaShipwrightHD = (THREE, SW) => ({
    shipInstance: (type) => { const s = shipStub(); hdByType[type] = s.inst; return s; },
  });

  // a canoe whose seat position we drive between frames (modeHook copies boatPos()
  // into carDio._tourPos each tour frame)
  const pos = { x: 1000, z: 0, heading: 0 };
  win.cartaHarborCanoe = (THREE) => ({
    build: () => ({ group: { traverse() {} }, spawn: () => 0, update() {}, boatPos: () => pos, dispose() {} }),
  });

  // four ships, distinct types, all at the lisbon centroid (≈ project origin)
  const carta = makeCarta({
    harborShips: TYPES.map((type) => ({ harbor: 'lisbon', type, lngLat: [-9.14, 38.705], heading: 0 })),
  });

  const h = await loadDiorama({ win, carta });
  await h.dio.open('lisbon');

  // enter tour via the button so mode flips to 'tour'
  const kids = win.document.body._kids.find((k) => k.id === 'carta-diorama')._kids;
  kids.find((k) => k.classList && k.classList.contains('dio-tour')).dispatch('click', { button: 0 });

  const hdOnOf = (type) => !!(hdByType[type] && hdByType[type].visible);

  // the four ships share a projected position; drive the canoe along +x from it
  const sp = h.dio._frame.project(-9.14, 38.705);

  // approach from far, then retreat (distance measured to the ship cluster)
  const dpath = [1000, 300, 160, 110, 85, 65, 50, 38, 30, 38, 50, 65, 85, 110, 160, 300, 1000];
  const rows = [];
  for (const d of dpath) {
    pos.x = sp.x + d; pos.z = sp.z;
    h.flushFrames(1);
    rows.push({ d, on: TYPES.map(hdOnOf) });
  }

  // cap never exceeded
  let maxOn = 0;
  for (const r of rows) maxOn = Math.max(maxOn, r.on.filter(Boolean).length);
  if (maxOn > 3) throw new Error(`HD cap exceeded: ${maxOn} ships HD at once`);

  // at the closest pass the three largest are HD and the sloop is not
  const closest = rows[8].on;   // d = 30
  if (!(closest[0] && closest[1] && closest[2] && !closest[3])) {
    throw new Error(`largest-wins violated at d=30: ${JSON.stringify(closest)}`);
  }

  // zero oscillation: each ship's hdOn over the whole path has ≤1 rising and ≤1
  // falling edge (a single contiguous HD block, or none)
  for (let ti = 0; ti < TYPES.length; ti++) {
    let rises = 0, falls = 0;
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].on[ti], cur = rows[i].on[ti];
      if (cur && !prev) rises++;
      if (!cur && prev) falls++;
    }
    if (rises > 1 || falls > 1) throw new Error(`${TYPES[ti]} oscillated: ${rises} rises, ${falls} falls`);
  }

  assertSnapshot('ship-hd-policy', { maxOn, rows: rows.map((r) => ({ d: r.d, on: r.on.map((b) => (b ? 1 : 0)) })) });
}
