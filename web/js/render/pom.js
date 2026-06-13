/* Carta Temporum — parallax occlusion mapping (parallax_occulusion.md §5.3).
   A fragment-shader relief layer injected into the town wall/street/roof materials
   via onBeforeCompile: window reveals, door recesses, cobble and mortar depth that
   recess and shift correctly as the camera orbits — with the low western sun the
   raking response carries most of the perceived depth.

   Technique: steep coarse march + contact-refinement + secant finish, on a second
   "relief" canvas per painter (R = height, G = painted AO). A Schüler cotangent
   frame from screen-space derivatives gives the tangent space (no precomputed
   tangents). Distance + grazing fades keep it cheap and stable; beyond fadeEnd the
   branch is uniform-coherent so cost collapses to one tap.

   Repo idiom: a classic IIFE publishing window.cartaPOM. Loaded by <script> before
   harbortown.js. patch() is guarded at every call site, so the headless harness
   (never loads this) and non-diorama callers degrade to plain textures.

   NOTE: there is no global THREE in this app (the diorama imports it dynamically),
   so patch() takes THREE via opts.THREE — the one deviation from the doc's spec. */
'use strict';
window.cartaPOM = (function () {
  const patched = [];   // { material, uniforms } registry for setQuality / debugging

  // --- GLSL: declarations + the march/frame helpers (injected at #include <common>,
  //     i.e. global scope, before main()) ---
  const PARS = [
    'uniform sampler2D uHeightMap;   // R = height (1 = proud), G = painted AO',
    'uniform float uPomScale;        // relief depth, UV units',
    'uniform vec2  uPomLayers;       // (min, max) coarse march layers',
    'uniform vec2  uPomFade;         // (start, end) view-space metres',
    'uniform float uPomAO;           // painted-AO strength',
    'uniform float uPomNrm;          // normal-perturbation strength',
    '',
    'mat3 pomCotangentFrame(vec3 N, vec3 p, vec2 uv) {',
    '  vec3 dp1 = dFdx(p), dp2 = dFdy(p);',
    '  vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);',
    '  vec3 dp2perp = cross(dp2, N);',
    '  vec3 dp1perp = cross(N, dp1);',
    '  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x;',
    '  vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;',
    '  float invmax = inversesqrt(max(dot(T, T), dot(B, B)));',
    '  return mat3(T * invmax, B * invmax, N);',
    '}',
    'float pomDepth(vec2 uv) { return 1.0 - textureLod(uHeightMap, uv, 0.0).r; }',
    'vec2 pomMarch(vec2 uv, vec3 vTS, float layers) {',
    '  vec2 P = (vTS.xy / max(vTS.z, 0.08)) * uPomScale;',
    '  float ls = 1.0 / layers;',
    '  vec2 duv = P * ls;',
    '  float depth = 0.0;',
    '  vec2 cur = uv;',
    '  float d = pomDepth(cur);',
    '  for (int i = 0; i < 32; i++) {',
    '    if (depth >= d || float(i) >= layers) break;',
    '    cur -= duv; depth += ls; d = pomDepth(cur);',
    '  }',
    '  cur += duv; depth -= ls;',
    '  vec2 fduv = duv * 0.125; float fls = ls * 0.125;',
    '  d = pomDepth(cur);',
    '  for (int i = 0; i < 8; i++) {',
    '    if (depth >= d) break;',
    '    cur -= fduv; depth += fls; d = pomDepth(cur);',
    '  }',
    '  float after  = d - depth;',
    '  float before = pomDepth(cur + fduv) - (depth - fls);',
    '  float w = clamp(after / (after - before + 1e-5), 0.0, 1.0);',
    '  return mix(cur, cur + fduv, w);',
    '}',
  ].join('\n');

  // --- GLSL: replaces #include <map_fragment> wholesale (the stock chunk samples
  //     vMapUv, which we need to displace first) ---
  function MAP_FRAG(clampUv) {
    return [
      'vec2 pomUv = vMapUv;',
      'float pomF = 0.0;',
      'mat3 pomTBN = mat3(1.0);',
      '{',
      '  float pomDist = length(vViewPosition);',
      '  vec3 pomV = normalize(vViewPosition);',
      '  vec3 pomN = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);',
      '  pomTBN = pomCotangentFrame(pomN, -vViewPosition, vMapUv);',
      '  vec3 pomVts = normalize(transpose(pomTBN) * pomV);',
      '  pomF = (1.0 - smoothstep(uPomFade.x, uPomFade.y, pomDist))',
      '       * smoothstep(0.05, 0.25, pomVts.z);',
      '  if (pomF > 0.001) {',
      '    float layers = mix(uPomLayers.y, uPomLayers.x, pomVts.z);',
      '    pomUv = mix(vMapUv, pomMarch(vMapUv, pomVts, layers), pomF);',
      (clampUv ? '    pomUv = clamp(pomUv, vec2(0.002), vec2(0.998));' : ''),
      '  }',
      '}',
      'vec4 sampledDiffuseColor = texture2D(map, pomUv);',
      'diffuseColor *= sampledDiffuseColor;',
      'diffuseColor.rgb *= mix(1.0, texture2D(uHeightMap, pomUv).g, uPomAO * pomF);',
    ].join('\n');
  }

  // --- GLSL: appended after #include <normal_fragment_begin> (lights the relief) ---
  const NORMAL_FRAG = [
    'if (pomF > 0.001) {',
    '  vec2 pomTexel = 1.0 / vec2(textureSize(uHeightMap, 0));',
    '  float pomD0 = pomDepth(pomUv);',
    '  float pomDx = pomDepth(pomUv + vec2(pomTexel.x, 0.0)) - pomD0;',
    '  float pomDy = pomDepth(pomUv + vec2(0.0, pomTexel.y)) - pomD0;',
    '  vec3 pomNts = normalize(vec3(pomDx, pomDy, pomTexel.x / max(uPomScale * 4.0, 1e-4)));',
    '  normal = normalize(mix(normal, normalize(pomTBN * pomNts), uPomNrm * pomF));',
    '}',
  ].join('\n');

  // opts: { THREE, heightMap, scale, minLayers, maxLayers, fadeStart, fadeEnd,
  //         ao = 0.6, clampUv = false, normalStrength = 0.4 }
  function patch(material, opts) {
    const THREE = opts.THREE;
    const U = {
      uHeightMap: { value: opts.heightMap },
      uPomScale: { value: opts.scale },
      uPomLayers: { value: new THREE.Vector2(opts.minLayers, opts.maxLayers) },
      uPomFade: { value: new THREE.Vector2(opts.fadeStart, opts.fadeEnd) },
      uPomAO: { value: opts.ao == null ? 0.6 : opts.ao },
      uPomNrm: { value: opts.normalStrength == null ? 0.4 : opts.normalStrength },
    };
    const prev = material.onBeforeCompile;                 // composability guard
    material.onBeforeCompile = function (sh, renderer) {
      if (prev) prev(sh, renderer);
      Object.assign(sh.uniforms, U);
      const rep = (src, find, ins) => {
        if (!src.includes(find)) throw new Error('cartaPOM: missing chunk ' + find);  // fail loud
        return src.replace(find, ins);
      };
      sh.fragmentShader = rep(sh.fragmentShader, '#include <common>', PARS + '\n#include <common>');
      sh.fragmentShader = rep(sh.fragmentShader, '#include <map_fragment>', MAP_FRAG(opts.clampUv));
      sh.fragmentShader = rep(sh.fragmentShader, '#include <normal_fragment_begin>',
        '#include <normal_fragment_begin>\n' + NORMAL_FRAG);
    };
    material.customProgramCacheKey = function () { return 'cartaPOM|' + (opts.clampUv ? 'c' : 'w'); };
    patched.push({ material, uniforms: U });
    return material;
  }

  function setQuality(s) {   // dev/console hook only; not called per frame
    for (const p of patched) p.uniforms.uPomLayers.value.multiplyScalar(s);
  }

  return { patch, setQuality, _patched: patched, PARS, MAP_FRAG, NORMAL_FRAG };
})();
