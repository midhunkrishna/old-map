/* Carta Temporum — shared discrete-LOD policy: screen-space-error (SSE) math,
   band hysteresis, and a Bayer-dither shader chunk. Pure functions, no GL, so
   they unit-test headless (test/cases/14, 15). The render engine builds a small
   per-frame lod context from these and threads it to every updater as a third
   argument; modules keep their own LOD *mechanism* and consult this *policy*.

   Repo idiom: a classic IIFE publishing exactly one global (window.cartaLod).
   No import/export — the page loads it via a <script> tag before the engine. */
'use strict';
window.cartaLod = (function () {
  // pixels covered by world-size s at distance d, given fovScale = H/(2·tan(fovY/2))
  function pixels(s, d, fovScale) { return s * fovScale / Math.max(d, 1e-3); }
  // distance at which world-size s covers px pixels (the SSE swap distance)
  function distForPixels(s, px, fovScale) { return s * fovScale / Math.max(px, 1e-3); }
  // band(d, edges, prev, h): edges ascending, 0 = closest band. Hysteresis keeps a
  // value in its previous band across a dead zone [edge, edge·(1+h)]: to advance
  // FARTHER than where we were (b >= prev) the edge is stretched by (1+h), so a
  // value loitering on an edge holds its band instead of flip-flopping; to fall
  // back CLOSER (b < prev) the nominal edge applies. (The §3.2 sketch had this
  // multiplier inverted, which produced anti-hysteresis — corrected here.)
  function band(d, edges, prev, h) {
    h = h == null ? 0.12 : h;
    let b = 0;
    while (b < edges.length && d >= edges[b] * (b >= prev ? (1 + h) : 1)) b++;
    return b;                       // 0 = closest band
  }
  // The Bayer 4×4 ordered-dither chunk used for cross-fade transitions (Phase 4 /
  // clod.md). uFade in [0,1]; a fragment is kept when its dither threshold ≤ uFade,
  // so complementary uFade/(1−uFade) on two tiers covers every pixel exactly once
  // with no transparency sorting (discard applies in the depth/shadow pass too).
  const DITHER = [
    'uniform float uFade;',
    'float bayer4(vec2 p) {',
    '  vec2 q = floor(mod(p, 4.0));',
    '  float i = q.x + q.y * 4.0;',
    '  float m = mod(i * 9.0, 16.0);',   // compact permutation ~ Bayer order
    '  return (m + 0.5) / 16.0;',
    '}',
  ].join('\n');
  const DITHER_TEST = 'if (uFade < 0.999 && bayer4(gl_FragCoord.xy) > uFade) discard;';
  return { pixels, distForPixels, band, DITHER, DITHER_TEST };
})();
