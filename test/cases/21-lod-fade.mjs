// clod.md §8.2 — the transition layer's pure fade maths (web/js/lodfade.js).
// fadeFor is the only fade-progress function and carries the no-time-term
// guarantee; this case pins the curve + the Bayer matrix and proves source purity.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLodFade } from '../lib/stubs.mjs';
import { assertEqual, assertSnapshot } from '../lib/assert.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export default async function () {
  const LF = loadLodFade();

  // anchor values
  assertEqual(LF.fadeFor(140, 140, 150), 1, 'fadeFor at dNear = 1');
  assertEqual(LF.fadeFor(150, 140, 150), 0, 'fadeFor at dFar = 0');
  assertEqual(LF.fadeFor(145, 140, 150), 0.5, 'fadeFor at midpoint = 0.5');
  assertEqual(LF.fadeFor(0, 140, 150), 1, 'fadeFor below band = 1');
  assertEqual(LF.fadeFor(1e9, 140, 150), 0, 'fadeFor above band = 0');

  // monotonic non-increasing across the band
  let prev = Infinity;
  for (let d = 138; d <= 152; d += 0.25) {
    const v = LF.fadeFor(d, 140, 150);
    if (v > prev + 1e-12) throw new Error(`fadeFor not monotonic at d=${d}: ${v} > ${prev}`);
    prev = v;
  }

  // determinism
  assertEqual(LF.fadeFor(143.7, 140, 150), LF.fadeFor(143.7, 140, 150), 'fadeFor deterministic');

  // source-level no-time-term guarantee
  const src = readFileSync(join(REPO_ROOT, 'web', 'js', 'lodfade.js'), 'utf8');
  for (const banned of ['performance.', 'Date.', 'Math.random']) {
    if (src.includes(banned)) throw new Error(`lodfade.js must contain no time term — found "${banned}"`);
  }

  // the dither chunk discards and embeds all 16 Bayer values
  if (!LF.ditherChunkGLSL.includes('discard')) throw new Error('ditherChunkGLSL must discard');
  for (const b of LF.BAYER4) {
    if (!LF.ditherChunkGLSL.includes(' ' + b.toFixed(1)) && !LF.ditherChunkGLSL.includes('(' + b.toFixed(1))) {
      throw new Error(`ditherChunkGLSL missing Bayer value ${b}`);
    }
  }

  const samples = [];
  for (let d = 138; d <= 152; d += 1) samples.push(LF.fadeFor(d, 140, 150));
  assertSnapshot('lod-fade', { bayer: Array.from(LF.BAYER4), samples });
}
