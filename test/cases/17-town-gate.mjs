// Phase 2 — the resurrected town-clutter gate. A stub town exposes a lod[] of
// marked clutter meshes; we sweep the camera distance up through the gate and
// back down and record the marked mesh's visibility. The gate must make exactly
// one hide (rising) and one show (falling), with the show threshold strictly
// nearer than the hide threshold (12% hysteresis) — i.e. zero edge oscillation.
import { loadDiorama, makeWindow, makeCarta } from '../lib/stubs.mjs';
import { assertSnapshot } from '../lib/assert.mjs';

export default async function () {
  const win = makeWindow();
  // the town build is gated behind the shipwright (SW.materials()); stub it.
  win.cartaShipwright = (THREE) => ({
    materials: () => ({}), SYMBOLIC_SCALE: 1, LENGTHS: { sloop: 18 },
    shipInstance: () => ({ inst: { isMesh: false, visible: true, matrixAutoUpdate: true, matrix: { copy() {} }, traverse(cb) { cb(this); } }, anim: { billow: [], flutter: [] } }),
  });
  const marks = [{ visible: true }, { visible: true }];   // two marked clutter meshes
  win.cartaTownBuilder = (THREE, c, mats) => ({
    build: () => ({
      group: { children: [], isMesh: false, userData: {}, traverse(cb) { cb(this); } },
      treeField: [], stats: {}, lod: marks,
    }),
  });

  const h = await loadDiorama({ win, carta: makeCarta() });
  await h.dio.open('lisbon');
  const cam = h.dio._cam;
  const target = h.dio._controls.target;
  target.set(0, 0, 0);

  const radius = h.dio._frame.radius;
  const sweep = [];
  for (let d = 100; d <= 3200; d += 100) sweep.push(d);     // dolly out
  for (let d = 3200; d >= 100; d -= 100) sweep.push(d);     // dolly back in

  const vis = [];
  for (const d of sweep) {
    cam.position.set(d, 0, 0);   // controls.update() is a no-op stub; camDist = |pos−target| = d
    h.flushFrames(1);
    vis.push(marks[0].visible ? 1 : 0);
  }

  // both marked meshes must move together (single shared gate)
  if (marks[0].visible !== marks[1].visible) throw new Error('town-gate: marked meshes diverged');

  // transition analysis
  let transitions = 0, hideAt = null, showAt = null;
  for (let i = 1; i < vis.length; i++) {
    if (vis[i] !== vis[i - 1]) {
      transitions++;
      const d = sweep[i];
      if (vis[i] === 0 && hideAt === null) hideAt = d;        // first hide (rising)
      if (vis[i] === 1 && i > sweep.length / 2 && showAt === null) showAt = d; // show (falling)
    }
  }
  if (transitions !== 2) throw new Error(`town-gate: expected 2 transitions (one hide, one show), got ${transitions}`);
  if (!(hideAt > showAt)) throw new Error(`town-gate: no hysteresis gap (hideAt ${hideAt} ≤ showAt ${showAt})`);

  assertSnapshot('town-gate', { radius, transitions, hideAt, showAt });
}
