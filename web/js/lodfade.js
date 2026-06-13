/* Carta Temporum — LOD transition layer (clod.md §5). A dither cross-fade over the
   existing discrete LODs: it adds only a fade dimension to the swap boundaries, no
   new LOD selection, no index streaming, no engine changes, no runtime dependency.

   Technique (locked, clod.md §5.1): ordered 4×4 Bayer dither keyed on gl_FragCoord
   with `discard` (works in both the matte and the bloom/EffectComposer paths, which
   are not multisampled so alpha-to-coverage would silently degrade). Signed coverage
   so an incoming LOD and its outgoing partner cover each pixel exactly once — no
   double-bright, no gap flicker. Deterministic: no time term anywhere.

   Repo idiom: a classic IIFE publishing one global. Load via <script> in index.html
   before harbortrees.js. Pure and time-free (no clock or RNG), so it is identical
   headless and on the GPU. */
'use strict';
window.cartaLodFade = (function () {
  // The standard 4×4 ordered-dither matrix (values 0..15). This JS array is the
  // single source of truth — the GLSL string below is generated from it.
  const BAYER4 = new Uint8Array([
    0, 8, 2, 10,
    12, 4, 14, 6,
    3, 11, 1, 9,
    15, 7, 13, 5,
  ]);

  // Coverage of the NEAR/HD LOD: 1 at d <= dNear, 0 at d >= dFar, smoothstep between.
  // The only fade-progress function in the codebase — pure and time-free.
  function fadeFor(d, dNear, dFar) {
    const t = Math.min(1, Math.max(0, (d - dNear) / (dFar - dNear)));
    return 1 - t * t * (3 - 2 * t);
  }

  // Fragment snippet (GLSL3 — r160 compiles WebGL2 as #version 300 es, so a const
  // float[16] initializer and integer ops are legal). Injected by replacing the
  // first include inside main() so it discards early, before lighting.
  const ditherChunkGLSL = [
    'const float LODF_BAYER[16] = float[16](',
    '   0.0,  8.0,  2.0, 10.0,',
    '  12.0,  4.0, 14.0,  6.0,',
    '   3.0, 11.0,  1.0,  9.0,',
    '  15.0,  7.0, 13.0,  5.0);',
    'float lodfThreshold() {',
    '  int ix = int(gl_FragCoord.x) & 3;',
    '  int iy = int(gl_FragCoord.y) & 3;',
    '  return LODF_BAYER[iy * 4 + ix] / 16.0 + 1.0 / 32.0;',   // (b+0.5)/16 → thresholds in (0,1)
    '}',
    // vLodFade: signed coverage. |v| = coverage c in [0,1].
    //   v >= 0: KEEP the covered set (incoming) → discard when NOT covered
    //   v <  0: KEEP the complement  (outgoing) → discard when covered
    // c=1 keeps every fragment (max threshold 15/16 + 1/32 = 0.96875 < 1.0).
    '{',
    '  float lodfC = abs(vLodFade);',
    '  bool lodfCovered = lodfC >= lodfThreshold();',
    '  if (lodfCovered == (vLodFade < 0.0)) discard;',
    '}',
    '#include <clipping_planes_fragment>',
  ].join('\n');

  // Composition-safe injection. perInstance → a per-instance `aFade` attribute
  // (trees, thousands of instances); else a per-material `uLodFade` uniform (ships).
  function patchMaterial(mat, opts) {
    const perInstance = !!(opts && opts.perInstance);
    if (!perInstance) mat.userData.uLodFade = { value: 1.0 };
    const prev = mat.onBeforeCompile;            // compose with foliage/billboard patches
    mat.onBeforeCompile = function (sh, renderer) {
      if (prev) prev(sh, renderer);
      if (perInstance) {
        sh.vertexShader = 'attribute float aFade;\nvarying float vLodFade;\n'
          + sh.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\n  vLodFade = aFade;');
      } else {
        sh.uniforms.uLodFade = mat.userData.uLodFade;
        sh.vertexShader = 'uniform float uLodFade;\nvarying float vLodFade;\n'
          + sh.vertexShader.replace('#include <begin_vertex>',
            '#include <begin_vertex>\n  vLodFade = uLodFade;');
      }
      sh.fragmentShader = 'varying float vLodFade;\n'
        + sh.fragmentShader.replace('#include <clipping_planes_fragment>', ditherChunkGLSL);
    };
    const prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey.bind(mat) : null;
    mat.customProgramCacheKey = function () { return (prevKey ? prevKey() : '') + '|lodfade' + (perInstance ? 'I' : 'U'); };
    return mat;
  }

  return { BAYER4, fadeFor, ditherChunkGLSL, patchMaterial };
})();
