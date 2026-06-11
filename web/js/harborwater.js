/* Carta Temporum — harborwater module (Part B, Rung 2): a CustomLayerInterface
   that draws animated engraved wave-lines across each charted harbour's water.
   The layer is inserted UNDER the hb-land fill, so the land masks it exactly
   as it masks the static water-lining — which stays beneath as the fallback:
   if this layer fails or the tier is low, the chart looks as it did before.
   Tier ≥ 3 only. Registered via window.cartaInits. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function init_harborwater(carta) {
  const map = carta.map;
  if (((carta.gfx && carta.gfx.tier) || 0) < 3) return;

  const VS = `
attribute vec4 a_pos;            // x,y: mercator; z: row phase; w: glint seed
uniform mat4 u_matrix;
uniform float u_time;
uniform float u_amp;
uniform float u_freq;
varying float v_b;
void main() {
  float y = a_pos.y + sin(a_pos.x * u_freq + u_time * 0.7 + a_pos.z) * u_amp
                    + sin(a_pos.x * u_freq * 2.7 + u_time * 1.3 + a_pos.z * 2.0) * u_amp * 0.35;
  // sun-glints: each stroke flashes brighter on its own slow cycle
  v_b = 0.78 + 1.9 * pow(max(0.0, sin(u_time * 0.8 + a_pos.w * 47.0)), 8.0);
  gl_Position = u_matrix * vec4(a_pos.x, y, 0.0, 1.0);
}`;
  const FS = `
precision mediump float;
uniform float u_alpha;
varying float v_b;
void main() { gl_FragColor = vec4(0.24, 0.20, 0.14, 1.0) * (u_alpha * v_b); }`;

  function buildVerts(boxes) {
    const ROWS = 46, SEGS = 56;
    const verts = [];
    let freqSum = 0;
    for (const b of boxes) {
      const sw = maplibregl.MercatorCoordinate.fromLngLat([b.w, b.s]);
      const ne = maplibregl.MercatorCoordinate.fromLngLat([b.e, b.n]);
      const x0 = Math.min(sw.x, ne.x), x1 = Math.max(sw.x, ne.x);
      const y0 = Math.min(sw.y, ne.y), y1 = Math.max(sw.y, ne.y);
      freqSum += (2 * Math.PI * 34) / (x1 - x0); // ~34 wavelengths across the box
      for (let r = 0; r < ROWS; r++) {
        const y = y0 + ((r + 0.5) / ROWS) * (y1 - y0);
        const phase = (r * 2.399) % (2 * Math.PI); // golden-angle stagger
        const reach = r % 2 ? 0.72 : 0.45;         // long swell strokes, short chop
        for (let s = 0; s < SEGS; s++) {
          const xa = x0 + (s / SEGS) * (x1 - x0);
          const xb = x0 + ((s + reach) / SEGS) * (x1 - x0); // gaps: strokes, not rules
          const glint = Math.random();
          verts.push(xa, y, phase, glint, xb, y, phase, glint);
        }
      }
    }
    return { verts: new Float32Array(verts), freq: freqSum / boxes.length };
  }

  function makeLayer(boxes) {
    const built = buildVerts(boxes);
    // amplitude ≈ a third of the row spacing of the smallest box
    const b0 = boxes[0];
    const m0 = maplibregl.MercatorCoordinate.fromLngLat([b0.w, b0.s]);
    const m1 = maplibregl.MercatorCoordinate.fromLngLat([b0.e, b0.n]);
    const amp = Math.abs(m1.y - m0.y) / 46 * 0.34;

    return {
      id: 'hb-water-anim',
      type: 'custom',
      renderingMode: '2d',
      onAdd(_, gl) {
        const compile = (kind, src) => {
          const sh = gl.createShader(kind);
          gl.shaderSource(sh, src);
          gl.compileShader(sh);
          if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            throw new Error('harborwater shader: ' + gl.getShaderInfoLog(sh));
          }
          return sh;
        };
        this.prog = gl.createProgram();
        gl.attachShader(this.prog, compile(gl.VERTEX_SHADER, VS));
        gl.attachShader(this.prog, compile(gl.FRAGMENT_SHADER, FS));
        gl.linkProgram(this.prog);
        if (!gl.getProgramParameter(this.prog, gl.LINK_STATUS)) {
          throw new Error('harborwater link: ' + gl.getProgramInfoLog(this.prog));
        }
        this.aPos = gl.getAttribLocation(this.prog, 'a_pos');
        this.uMatrix = gl.getUniformLocation(this.prog, 'u_matrix');
        this.uTime = gl.getUniformLocation(this.prog, 'u_time');
        this.uAmp = gl.getUniformLocation(this.prog, 'u_amp');
        this.uFreq = gl.getUniformLocation(this.prog, 'u_freq');
        this.uAlpha = gl.getUniformLocation(this.prog, 'u_alpha');
        this.buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.bufferData(gl.ARRAY_BUFFER, built.verts, gl.STATIC_DRAW);
        this.n = built.verts.length / 4;
        this.t0 = performance.now();
      },
      render(gl, matrix) {
        const z = map.getZoom();
        const alpha = Math.max(0, Math.min(1, (z - 10.4) / 1.2)) * 0.22;
        if (alpha <= 0 || document.hidden) return; // beneath harbor zoom: free
        gl.useProgram(this.prog);
        gl.uniformMatrix4fv(this.uMatrix, false, matrix);
        gl.uniform1f(this.uTime, (performance.now() - this.t0) / 1000);
        gl.uniform1f(this.uAmp, amp);
        gl.uniform1f(this.uFreq, built.freq);
        gl.uniform1f(this.uAlpha, alpha);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
        gl.enableVertexAttribArray(this.aPos);
        gl.vertexAttribPointer(this.aPos, 4, gl.FLOAT, false, 0, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.LINES, 0, this.n);
        map.triggerRepaint(); // keep the sea moving while it is in view
      },
    };
  }

  let added = false;
  function tryAdd() {
    if (added || !carta.harborBoxes || !carta.harborBoxes.length || !map.getLayer('hb-land')) return;
    added = true;
    try {
      map.addLayer(makeLayer(carta.harborBoxes), 'hb-land');
    } catch (e) {
      console.warn('harborwater: demoted to static water-lining', e);
      if (map.getLayer('hb-water-anim')) map.removeLayer('hb-water-anim');
    }
  }
  carta.bus.on('harbors-ready', tryAdd);
  tryAdd();
});
