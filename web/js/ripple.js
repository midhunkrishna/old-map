/* Carta Temporum — ripple module: when fresh isochrones land, the bands
   bloom outward from the origin like a dropped stone (staggered fade-in,
   inner band first). Registered via window.cartaInits. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function init_ripple(carta) {
  const map = carta.map;
  const BANDS = Object.keys(carta.PALETTE).map(Number).sort((a, b) => a - b);
  const DELAY_MS = 80;   // per-band stagger
  const DUR_MS = 350;    // per-band fade duration
  const prm = carta.reducedMotion;

  // The original fill-opacity zoom-fade envelope, captured once and restored
  // verbatim when each band's bloom completes — the harbor-plan crossfade
  // (0.92 @ z10.6 → 0 @ z11.5) must survive this module exactly.
  let orig = null;
  let raf = 0;

  function captureOnce() {
    if (orig) return;
    orig = {};
    for (const d of BANDS) {
      if (map.getLayer('iso-band-' + d)) {
        orig[d] = map.getPaintProperty('iso-band-' + d, 'fill-opacity');
      }
    }
  }

  function restoreAll() {
    if (!orig) return;
    for (const d of BANDS) {
      if (orig[d] !== undefined && map.getLayer('iso-band-' + d)) {
        map.setPaintProperty('iso-band-' + d, 'fill-opacity', orig[d]);
      }
    }
  }

  function cancel() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  carta.bus.on('iso-rendered', () => {
    captureOnce();
    cancel();
    const isoBox = document.getElementById('t-iso');
    if ((isoBox && !isoBox.checked) || (prm && prm.matches)) {
      restoreAll(); // snap: no animation wanted
      return;
    }
    const t0 = performance.now();
    const done = new Set();
    function step(now) {
      raf = 0;
      let pending = false;
      BANDS.forEach((d, k) => {
        if (done.has(d)) return;
        const id = 'iso-band-' + d;
        if (orig[d] === undefined || !map.getLayer(id)) { done.add(d); return; }
        const t = (now - t0 - k * DELAY_MS) / DUR_MS;
        if (t >= 1) {
          map.setPaintProperty(id, 'fill-opacity', orig[d]); // exact original back
          done.add(d);
          return;
        }
        pending = true;
        const s = t <= 0 ? 0 : easeOutCubic(t);
        map.setPaintProperty(id, 'fill-opacity',
          ['interpolate', ['linear'], ['zoom'], 10.6, 0.92 * s, 11.5, 0]);
      });
      if (pending) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
  });

  // If the isochrone toggle is thrown mid-bloom, abandon the animation and
  // hand the layers back in their original state (visibility is app.js's).
  const isoBox = document.getElementById('t-iso');
  if (isoBox) {
    isoBox.addEventListener('change', () => {
      if (!isoBox.checked) { cancel(); restoreAll(); }
    });
  }
});
