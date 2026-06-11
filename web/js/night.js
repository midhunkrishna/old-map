/* Carta Temporum — night module: "By lantern light". A toggle that lowers
   dusk over the chart, draws the true day/night terminator creeping west
   as a shaded hemisphere, and hangs a flickering lantern that follows the
   cursor in a warm pool of light. Pure chart furniture: one animated fill
   layer and two blend-mode veils. Registered via window.cartaInits. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function init_night(carta) {
  const map = carta.map;
  const D2R = carta.geo.D2R;
  const LS_KEY = 'cartaNight.v1';
  const REDUCED_MOTION = carta.reducedMotion.matches;

  /* ---------- styles ---------- */

  const css = document.createElement('style');
  css.textContent = `
#night-dusk {
  position: fixed; inset: 0; pointer-events: none; z-index: 18;
  mix-blend-mode: multiply; background: rgba(30,38,66,0.34); display: none;
}
#night-lantern {
  position: fixed; inset: 0; pointer-events: none; z-index: 19;
  mix-blend-mode: screen; display: none;
  background: radial-gradient(circle 30vmin at var(--lx, 50%) var(--ly, 55%),
    rgba(255,178,86,0.30), rgba(255,150,60,0.10) 46%, rgba(0,0,0,0) 72%);
}
body.night-flicker #night-lantern { animation: night-flicker 2.7s ease-in-out infinite; }
@keyframes night-flicker {
  0%, 100% { opacity: 0.92; }
  9%  { opacity: 1; }
  21% { opacity: 0.88; }
  33% { opacity: 0.99; }
  47% { opacity: 0.93; }
  58% { opacity: 1; }
  74% { opacity: 0.87; }
  86% { opacity: 0.97; }
}
`;
  document.head.appendChild(css);

  const dusk = document.createElement('div');
  dusk.id = 'night-dusk';
  const lantern = document.createElement('div');
  lantern.id = 'night-lantern';
  document.body.appendChild(dusk);
  document.body.appendChild(lantern);

  /* ---------- the night hemisphere ---------- */

  // Terminator for a sun at (sunLon, decl): tan(lat) = -cos(lon - sunLon)/tan(decl).
  // The night ring runs the curve, then closes over the winter pole.
  function nightFC(sunLon, decl) {
    const d = Math.abs(decl) < 1.2 ? (decl < 0 ? -1.2 : 1.2) : decl; // dodge the equinox singularity
    const tanD = Math.tan(d * D2R);
    const ring = [];
    for (let k = 0; k <= 90; k++) {
      const lon = sunLon - 180 + k * 4;
      const lat = Math.atan2(-Math.cos((lon - sunLon) * D2R), tanD) / D2R;
      ring.push([lon, Math.max(-84, Math.min(84, lat))]);
    }
    const poleLat = d > 0 ? -85 : 85; // winter pole lies in the dark
    ring.push([sunLon + 180, poleLat], [sunLon - 180, poleLat], ring[0]);
    const polys = [-360, 0, 360].map((off) =>
      [ring.map(([ln, lt]) => [ln + off, lt])]);
    return {
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } }],
    };
  }

  let layered = false;
  function ensureLayer() {
    if (layered) return;
    layered = true;
    map.addSource('night-shade', { type: 'geojson', data: nightFC(sunLon, decl()) });
    map.addLayer({
      id: 'night-shade', type: 'fill', source: 'night-shade',
      paint: { 'fill-color': '#141c33', 'fill-opacity': 0.34 },
    });
  }

  /* ---------- state & animation ---------- */

  let on = false;
  let timer = 0;
  // Sun over the Indian Ocean: dusk has just crossed the Western Ocean, so
  // the terminator stands in view of the chart's home waters at first light.
  let sunLon = 55;
  const t0 = performance.now();
  // The seasons turn slowly under the lamp: declination swings ±18° over ~8 min.
  const decl = () => 18 * Math.sin(((performance.now() - t0) / 480000) * Math.PI * 2 + 0.4);

  function tick() {
    sunLon -= REDUCED_MOTION ? 0 : 0.55; // the sun stands westward
    if (sunLon < -180) sunLon += 360;
    const src = map.getSource('night-shade');
    if (src) src.setData(nightFC(sunLon, decl()));
  }

  function onMove(e) {
    lantern.style.setProperty('--lx', e.clientX + 'px');
    lantern.style.setProperty('--ly', e.clientY + 'px');
  }

  function setNight(v) {
    on = !!v;
    try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
    if (on) {
      ensureLayer();
      map.setLayoutProperty('night-shade', 'visibility', 'visible');
      tick();
      if (!timer) timer = setInterval(tick, 700);
      dusk.style.display = 'block';
      lantern.style.display = 'block';
      if (!REDUCED_MOTION) document.body.classList.add('night-flicker');
      window.addEventListener('mousemove', onMove);
    } else {
      if (layered) map.setLayoutProperty('night-shade', 'visibility', 'none');
      if (timer) { clearInterval(timer); timer = 0; }
      dusk.style.display = 'none';
      lantern.style.display = 'none';
      document.body.classList.remove('night-flicker');
      window.removeEventListener('mousemove', onMove);
    }
  }

  /* ---------- the toggle ---------- */

  const toggles = document.querySelector('#cartouche .toggles');
  let box = null;
  if (toggles) {
    const label = document.createElement('label');
    label.innerHTML = '<input type="checkbox" id="t-night"> By lantern light 🕯';
    label.title = 'dusk falls upon the chart; the lantern follows your hand';
    toggles.appendChild(label);
    box = label.querySelector('input');
    box.addEventListener('change', () => setNight(box.checked));
  }

  let saved = false;
  try { saved = localStorage.getItem(LS_KEY) === '1'; } catch (e) { /* ignore */ }
  if (saved && box) {
    box.checked = true;
    setNight(true);
  }

  window.cartaNight = {
    set: setNight,
    get on() { return on; },
    _sun(lon) { sunLon = lon; tick(); }, // test hook
  };
});
