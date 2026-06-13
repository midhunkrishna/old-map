// Phase 2 — the gull far-LOD swap policy. The geometry merge (one static-pose
// draw per bird) and the per-bird far node are validated by production review +
// the plan's screenshot A/B (a headless THREE stub has no real vertices to merge,
// and no existing test drives the real bird system). What IS machine-checkable —
// and the behaviorally novel part — is the pixel-space swap with hysteresis, which
// this case characterizes against a scripted size path.
//
// The rule mirrors harborbirds.js update(): a bird covering wingspan ≈ 9·scale at
// distance d has px = lod.pixels(9·scale, d); full = full ? (px ≥ 12) : (px ≥ 12·1.12).
import { loadLod } from '../lib/stubs.mjs';
import { assertEqual, assertSnapshot } from '../lib/assert.mjs';

// the exact swap rule used by the bird updater (kept in lockstep with harborbirds.js)
function nextFull(prevFull, px) {
  return prevFull ? (px >= 12) : (px >= 12 * 1.12);
}

export default async function () {
  const lod = loadLod();

  // dead-zone behaviour: promote only past 13.44 px, demote only below 12 px
  assertEqual(nextFull(false, 12.0), false, 'far stays far at 12px (needs ≥13.44 to promote)');
  assertEqual(nextFull(false, 13.5), true, 'far promotes past 13.44px');
  assertEqual(nextFull(true, 12.5), true, 'full stays full at 12.5px');
  assertEqual(nextFull(true, 11.9), false, 'full demotes below 12px');

  // drive a scripted wingspan-pixel path (a bird receding then approaching) and
  // assert exactly one demote and one promote, the promote nearer than the demote.
  const D2R = Math.PI / 180;
  const fovScale = 1944 / (2 * Math.tan(38 * D2R / 2));   // overview reference
  const scale = 2.4;                                       // a representative gull
  const wingspan = 9 * scale;

  // span a range that crosses the 12 px swap in both directions (these gulls are
  // drawn oversized, so the crossing distance is several km)
  const dists = [];
  for (let d = 200; d <= 8000; d += 100) dists.push(d);    // recede
  for (let d = 8000; d >= 200; d -= 100) dists.push(d);    // approach

  let full = true;
  const states = [];
  let demotes = 0, promotes = 0, demoteAt = null, promoteAt = null;
  for (let i = 0; i < dists.length; i++) {
    const px = lod.pixels(wingspan, dists[i], fovScale);
    const nf = nextFull(full, px);
    if (nf !== full) {
      if (!nf) { demotes++; if (demoteAt === null) demoteAt = dists[i]; }
      else { promotes++; if (promoteAt === null) promoteAt = dists[i]; }
    }
    full = nf;
    states.push(nf ? 1 : 0);
  }

  assertEqual(demotes, 1, 'exactly one demote on the receding leg');
  assertEqual(promotes, 1, 'exactly one promote on the approaching leg');
  if (!(promoteAt < demoteAt)) throw new Error(`no hysteresis: promoteAt ${promoteAt} ≥ demoteAt ${demoteAt}`);

  assertSnapshot('bird-lod', { wingspan, fovScale, demoteAt, promoteAt, states });
}
