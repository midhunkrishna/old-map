// Phase 1 — the shared SSE policy (web/js/render/lod.js). Pure math, no GL.
// Verifies pixels/distForPixels are inverses and that the overview(38°)→tour(70°)
// swap-distance ratio equals tan(35°)/tan(19°) — the geometric fact the tree and
// ship band normalization rides on.
import { loadLod } from '../lib/stubs.mjs';
import { assertEqual, assertSnapshot } from '../lib/assert.mjs';

const D2R = Math.PI / 180;
const close = (a, b, eps, msg) => {
  if (Math.abs(a - b) > eps) throw new Error(`${msg}: ${a} vs ${b} (eps ${eps})`);
};

export default async function () {
  const lod = loadLod();

  // fovScale = H / (2·tan(fovY/2)); backing height H = 1080·1.8 cap = 1944.
  const H = 1944;
  const fs38 = H / (2 * Math.tan(38 * D2R / 2));
  const fs70 = H / (2 * Math.tan(70 * D2R / 2));

  // round-trip: distForPixels(s, pixels(s, d)) === d for any s, d
  for (const [s, d] of [[10, 130], [42, 150], [1, 3], [24, 800]]) {
    const px = lod.pixels(s, d, fs38);
    const back = lod.distForPixels(s, px, fs38);
    close(back, d, 1e-6, `round-trip s=${s} d=${d}`);
  }

  // the same metre threshold subtends fewer pixels at the wider tour fov, so to
  // hold a fixed pixel budget the swap distance shrinks by exactly fs70/fs38.
  const ratio = fs70 / fs38;
  close(ratio, Math.tan(19 * D2R) / Math.tan(35 * D2R), 1e-9, 'fovScale ratio');
  // equivalently the overview/tour swap-distance ratio is tan(35°)/tan(19°)
  const swap38 = lod.distForPixels(10, 110, fs38);
  const swap70 = lod.distForPixels(10, 110, fs70);
  close(swap38 / swap70, Math.tan(35 * D2R) / Math.tan(19 * D2R), 1e-9, 'swap ratio');

  // the dither chunk exposes the uFade uniform + discard test the cross-fades use
  assertEqual(lod.DITHER.includes('uniform float uFade;'), true, 'DITHER declares uFade');
  assertEqual(lod.DITHER_TEST.includes('discard'), true, 'DITHER_TEST discards');

  assertSnapshot('lod-math', {
    fovScale: { overview38: fs38, tour70: fs70 },
    swapDistForTree110px: { overview: swap38, tour: swap70 },
    pixelsOfManOfWarAt150m: lod.pixels(42, 150, fs70),   // ≈400 → today's HD edge
  });
}
