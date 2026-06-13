// plan/5 "Land Tour" — the on-foot walker rig (web/js/harborwalker.js), driven
// headless over a fake THREE. Verifies the four mechanics most likely to break:
//   (1) ground-follow — the eye rides ~6 ft above sampleH;
//   (2) collision — walking into a house circle halts before the wall (no clip,
//       no tunnel, no oscillation);
//   (3) sea boundary — you cannot walk off the land into the water;
//   (4) surface pace — a street stride covers more ground than a sand stride.
import { loadWalker } from '../lib/stubs.mjs';

export default async function () {
  const { make, THREE } = loadWalker();

  // a flat walkable plain at y=0.5, with the sea to the west (x < -20 → below water)
  const frame = {
    radius: 1500,
    sampleH: (x, z) => (x < -20 ? -2 : 0.5),
    bake: { x0: -1000, z0: -1000, w: 2000, d: 2000, sample() {} },
  };
  const street = { x1: -40, z1: 0, x2: 60, z2: 0, w: 6 };   // a cobble strip along z=0
  const EAST = -Math.PI / 2, WEST = Math.PI / 2;            // forward=(-sinθ,-cosθ): -π/2→+X, +π/2→−X

  // a camera that records the seated position; the walker only needs position.set
  const cam = () => ({ position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
                       quaternion: { setFromEuler() {} } });
  const C = cam();
  const drive = (w, yaw, keys, n) => { for (let i = 0; i < n; i++) w.update(0.05, i * 0.05, { camYaw: yaw, camPitch: 0, ...keys }, C); };

  // ---- (1) ground-follow ----
  {
    const w = make(THREE).build(frame, { seaLevel: 0, obstacles: { houses: [] }, streets: [street], nearTrunks: () => [] });
    w.spawn(0, 0, EAST);
    drive(w, EAST, {}, 3);                       // stand still
    const eye = C.position.y;
    if (Math.abs(eye - (0.5 + 1.83)) > 0.05) throw new Error(`ground-follow: eye ${eye.toFixed(3)} != ~2.33`);
  }

  // ---- (2) collision: walk east into a house circle at (10,0) r=3 ----
  {
    const w = make(THREE).build(frame, { seaLevel: 0, obstacles: { houses: [{ x: 10, z: 0, r: 3 }] }, streets: [street], nearTrunks: () => [] });
    w.spawn(0, 0, EAST);
    drive(w, EAST, { fwd: true }, 200);
    const x = w.pos().x;
    const wall = 10 - 3 - 0.45;                  // house centre − r − body
    if (x > wall + 0.3) throw new Error(`collision: clipped into the house (x=${x.toFixed(2)} > ${wall.toFixed(2)})`);
    if (x < wall - 1.5) throw new Error(`collision: stopped short / stuck early (x=${x.toFixed(2)})`);
  }

  // ---- (3) sea boundary: walk west toward the water → must not enter the sea ----
  {
    const w = make(THREE).build(frame, { seaLevel: 0, obstacles: { houses: [] }, streets: [street], nearTrunks: () => [] });
    w.spawn(0, 0, WEST);
    drive(w, WEST, { fwd: true }, 600);
    const x = w.pos().x;
    if (x <= -20) throw new Error(`sea boundary: walked into the water (x=${x.toFixed(2)})`);
    if (x > -10) throw new Error(`sea boundary: never advanced toward the shore (x=${x.toFixed(2)})`);
  }

  // ---- (4) surface pace: a street stride outpaces a sand stride ----
  {
    const opt = { seaLevel: 0, obstacles: { houses: [] }, streets: [street], nearTrunks: () => [] };
    const onSt = make(THREE).build(frame, opt); onSt.spawn(0, 0, EAST);    // z=0 → on the cobbles
    const onSand = make(THREE).build(frame, opt); onSand.spawn(0, 30, EAST); // z=30 → off any street
    drive(onSt, EAST, { fwd: true }, 20);
    drive(onSand, EAST, { fwd: true }, 20);
    const ds = onSt.pos().x, dn = onSand.pos().x;
    if (!(ds > dn * 1.1)) throw new Error(`surface pace: street (${ds.toFixed(2)}) not faster than sand (${dn.toFixed(2)})`);
  }

  // ---- (5) low-sand band: dry beach sits BELOW seaLevel+0.1 (water surface is
  // ~0.42 m down), so the walker must cross height ~0.05 sand, not hit a wall there ----
  {
    const beach = { radius: 1500, sampleH: (x) => (x < -30 ? -2 : (x < -5 ? 0.05 : 0.5)), bake: { x0: -1000, z0: -1000, w: 2000, d: 2000, sample() {} } };
    const w = make(THREE).build(beach, { seaLevel: 0, obstacles: { houses: [] }, streets: [], nearTrunks: () => [] });
    w.spawn(0, 0, WEST);                       // start on the 0.5 m plain, walk toward the water
    drive(w, WEST, { fwd: true }, 800);
    const x = w.pos().x;
    if (x > -10) throw new Error(`low-sand band: walled on dry sand at h≈0.05 (x=${x.toFixed(2)}, should cross to ~−30)`);
    if (x < -30) throw new Error(`low-sand band: walked into the water (x=${x.toFixed(2)})`);
  }

  // ---- (6) sprint: Shift (run) covers clearly more ground than a plain walk ----
  {
    const opt = { seaLevel: 0, obstacles: { houses: [] }, streets: [street], nearTrunks: () => [] };
    const walk = make(THREE).build(frame, opt); walk.spawn(0, 0, EAST);
    const run = make(THREE).build(frame, opt); run.spawn(0, 0, EAST);
    drive(walk, EAST, { fwd: true }, 20);
    drive(run, EAST, { fwd: true, run: true }, 20);
    if (!(run.pos().x > walk.pos().x * 2)) throw new Error(`sprint: run (${run.pos().x.toFixed(2)}) not ≫ walk (${walk.pos().x.toFixed(2)})`);
  }
}
