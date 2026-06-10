/* Carta Temporum — dividers module. Registered via window.cartaInits.
   A pair of brass dividers: prick two points upon the sea, read the distance
   in leagues and nautical miles, and ask the winds how many days under sail —
   in both directions, for the wind is no man's servant. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function init_dividers(carta) {
  const map = carta.map;
  const INK = '#3d2f1e', INK_SOFT = '#5b4636', MADDER = '#8a3b2e';
  const PARCH = '#f0e4c8', BRASS = '#a98e4f';
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;
  const NM_R = 3440.065; // earth radius in nautical miles

  const EMPTY = { type: 'FeatureCollection', features: [] };

  /* ---------- styles ---------- */

  const style = document.createElement('style');
  style.textContent = `
    #dividers-btn {
      position: fixed; bottom: 120px; right: 10px; width: 36px; height: 36px;
      z-index: 30; cursor: pointer; background: ${PARCH};
      border: 1.5px solid ${INK}; border-radius: 3px;
      box-shadow: 2px 3px 8px rgba(40,28,14,0.35);
      display: flex; align-items: center; justify-content: center; padding: 0;
    }
    #dividers-btn:hover { background: #ead9b2; }
    #dividers-btn.active {
      background: #e2cfa6; border-color: ${MADDER};
      box-shadow: inset 1px 2px 5px rgba(61,47,30,0.35);
    }
    #dividers-hint {
      position: fixed; bottom: 124px; right: 54px; z-index: 30; display: none;
      font-family: 'IM Fell English', serif; font-style: italic; font-size: 12.5px;
      color: ${INK}; background: ${PARCH}; border: 1px solid ${INK_SOFT};
      padding: 5px 10px; box-shadow: 2px 3px 8px rgba(40,28,14,0.3);
      max-width: 280px; pointer-events: none;
    }
    #dividers-card {
      position: fixed; right: 38px; bottom: 160px; width: 300px; z-index: 31;
      display: none; font-family: 'IM Fell English', serif; color: ${INK};
      background: ${PARCH}; border: 1.5px solid ${INK};
      box-shadow: 5px 6px 18px rgba(40,28,14,0.45); padding: 10px 14px;
    }
    #dividers-card h3 {
      font-family: 'IM Fell English SC', serif; font-weight: normal;
      margin: 0 0 4px; font-size: 16px; letter-spacing: 1.5px; color: ${MADDER};
    }
    #dividers-card .dv-dist { font-size: 13.5px; margin: 3px 0; }
    #dividers-card .dv-days { font-size: 12.5px; font-style: italic; color: ${INK_SOFT}; margin: 4px 0 1px; line-height: 1.4; }
    #dividers-card .dv-close {
      position: absolute; top: 4px; right: 8px; cursor: pointer; background: none;
      border: none; color: ${INK_SOFT}; font-size: 13px; font-family: serif;
    }
    .dividers-pin { pointer-events: none; }
    /* teardrop pin tip is at the bottom of the box; lift the inner wrapper
       (never the marker root) so the tip marks the measured point */
    .dividers-pin .dp-in { display: block; line-height: 0; transform: translateY(-8px); }
  `;
  document.head.appendChild(style);

  /* ---------- svg ---------- */

  function dividersSVG() {
    if (window.cartaIcons) return window.cartaIcons.dividersTool();
    return `<svg width="26" height="26" viewBox="0 0 24 24">
      <g stroke="${INK}" fill="none" stroke-width="1.5" stroke-linecap="round">
        <path d="M12 2.2 V4"/>
        <circle cx="12" cy="5.6" r="1.9" fill="${BRASS}" stroke-width="1.2"/>
        <path d="M10.9 7.2 L6.3 20.2"/>
        <path d="M13.1 7.2 L17.7 20.2"/>
        <path d="M8.1 15.2 Q12 17.4 15.9 15.2" stroke-width="0.9" stroke-dasharray="1.6 1.3"/>
      </g></svg>`;
  }

  function pinSVG() {
    if (window.cartaIcons) return window.cartaIcons.surveyPin();
    return `<svg width="18" height="18" viewBox="0 0 18 18">
      <g stroke="${INK}" fill="none" stroke-linecap="round">
        <circle cx="9" cy="9" r="2.8" stroke-width="1.2"/>
        <path d="M9 1.8 V5 M9 13 V16.2 M1.8 9 H5 M13 9 H16.2" stroke-width="1"/>
      </g>
      <circle cx="9" cy="9" r="1" fill="${MADDER}"/></svg>`;
  }

  /* ---------- map source/layer (above 'routes') ---------- */

  map.addSource('dividers', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'dividers-line', type: 'line', source: 'dividers',
    paint: { 'line-color': INK, 'line-opacity': 0.85, 'line-width': 1.4 },
  });

  /* ---------- dom ---------- */

  const btn = document.createElement('button');
  btn.id = 'dividers-btn';
  btn.title = 'Dividers — measure the seas';
  btn.innerHTML = dividersSVG();
  document.body.appendChild(btn);

  const hint = document.createElement('div');
  hint.id = 'dividers-hint';
  document.body.appendChild(hint);

  const card = document.createElement('div');
  card.id = 'dividers-card';
  card.innerHTML = `<button class="dv-close" title="Put away the dividers">✕</button>
    <h3>The Dividers</h3>
    <div class="dv-dist"></div>
    <div class="dv-days"></div>`;
  document.body.appendChild(card);
  card.querySelector('.dv-close').addEventListener('click', () => exitTool(false));

  /* ---------- spherical helpers ---------- */

  function toVec(ll) {
    const la = ll[1] * D2R, lo = ll[0] * D2R;
    return [Math.cos(la) * Math.cos(lo), Math.cos(la) * Math.sin(lo), Math.sin(la)];
  }
  function toLL(v) {
    return [Math.atan2(v[1], v[0]) * R2D, Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D];
  }
  function unwrapTo(lon, ref) {
    while (lon - ref > 180) lon -= 360;
    while (lon - ref < -180) lon += 360;
    return lon;
  }
  function arcAngle(a, b) {
    const va = toVec(a), vb = toVec(b);
    const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
    return Math.acos(dot);
  }
  // slerp factory: returns f(t) -> [lon,lat] along the great circle a→b.
  function slerper(a, b) {
    const va = toVec(a), vb = toVec(b);
    const w = arcAngle(a, b), sw = Math.sin(w);
    if (w < 1e-9 || sw < 1e-9) return () => a.slice(); // coincident or antipodal
    return (t) => {
      const k1 = Math.sin((1 - t) * w) / sw, k2 = Math.sin(t * w) / sw;
      return toLL([va[0] * k1 + vb[0] * k2, va[1] * k1 + vb[1] * k2, va[2] * k1 + vb[2] * k2]);
    };
  }

  function haversineNM(a, b) { return arcAngle(a, b) * NM_R; }

  // Great-circle line A→B: ~64 slerped points, lon-unwrapped so the string
  // never jumps the antimeridian; plus a perpendicular tick every 60 nm (1°).
  function measurementGeoJSON(a, b) {
    const gc = slerper(a, b);
    const N = 64;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const p = gc(i / N);
      if (i > 0) p[0] = unwrapTo(p[0], pts[i - 1][0]);
      pts.push(p);
    }
    const features = [{
      type: 'Feature', properties: { kind: 'line' },
      geometry: { type: 'LineString', coordinates: pts },
    }];
    const arcDeg = arcAngle(a, b) * R2D;
    for (let k = 1; k < arcDeg; k++) {
      const t = k / arcDeg;
      const p = gc(t), q = gc(Math.min(1, t + 0.002));
      // unwrap tick centre to the line's local longitude frame
      const ref = pts[Math.min(N, Math.round(t * N))][0];
      p[0] = unwrapTo(p[0], ref);
      q[0] = unwrapTo(q[0], p[0]);
      const cosLat = Math.max(0.05, Math.cos(p[1] * D2R));
      let ux = (q[0] - p[0]) * cosLat, uy = q[1] - p[1];
      const n = Math.hypot(ux, uy);
      if (n < 1e-12) continue;
      ux /= n; uy /= n;
      const L = 0.22; // half-length of tick, degrees
      const px = -uy, py = ux;
      features.push({
        type: 'Feature', properties: { kind: 'tick' },
        geometry: {
          type: 'LineString',
          coordinates: [
            [p[0] + (px * L) / cosLat, p[1] + py * L],
            [p[0] - (px * L) / cosLat, p[1] - py * L],
          ],
        },
      });
    }
    return { type: 'FeatureCollection', features };
  }

  /* ---------- state ---------- */

  let state = 'idle'; // idle | await-a | await-b | done
  let pointA = null, pointB = null;
  let pins = [];
  let fetchAbort = null;
  let hintTimer = null;

  function showHint(text) {
    clearTimeout(hintTimer);
    hint.textContent = text;
    hint.style.display = 'block';
  }
  function flashHint(text, ms) {
    showHint(text);
    hintTimer = setTimeout(() => { hint.style.display = 'none'; }, ms);
  }

  function addPin(ll) {
    const el = document.createElement('div');
    el.className = 'dividers-pin';
    el.innerHTML = `<span class="dp-in">${pinSVG()}</span>`;
    const m = new maplibregl.Marker({ element: el }).setLngLat(ll).addTo(map);
    pins.push(m);
  }

  function clearMeasurement() {
    if (fetchAbort) { fetchAbort.abort(); fetchAbort = null; }
    for (const p of pins) p.remove();
    pins = [];
    pointA = pointB = null;
    map.getSource('dividers').setData(EMPTY);
    card.style.display = 'none';
  }

  function armTool() {
    if (carta.activeTool && carta.activeTool !== 'dividers') {
      flashHint('Another instrument is in hand.', 1800);
      return false;
    }
    carta.activeTool = 'dividers';
    btn.classList.add('active');
    return true;
  }

  function exitTool(deferRelease) {
    state = 'idle';
    clearMeasurement();
    btn.classList.remove('active');
    clearTimeout(hintTimer);
    hint.style.display = 'none';
    const release = () => { if (carta.activeTool === 'dividers') carta.activeTool = null; };
    if (deferRelease) setTimeout(release, 0); else release();
  }

  /* ---------- measurement & the winds ---------- */

  async function renderMeasurement(a, b) {
    map.getSource('dividers').setData(measurementGeoJSON(a, b));
    const nm = haversineNM(a, b);
    card.querySelector('.dv-dist').textContent =
      `${Math.round(nm / 3)} leagues — ${Math.round(nm)} nautical miles`;
    const days = card.querySelector('.dv-days');
    days.textContent = 'fetching the winds…';
    card.style.display = 'block';

    if (fetchAbort) fetchAbort.abort();
    const ac = (fetchAbort = new AbortController());
    const q = (p, r) => `/api/route?from=${p[0].toFixed(4)},${p[1].toFixed(4)}&to=${r[0].toFixed(4)},${r[1].toFixed(4)}`;
    try {
      const [thither, back] = await Promise.all([
        fetch(q(a, b), { signal: ac.signal }),
        fetch(q(b, a), { signal: ac.signal }),
      ]);
      if (ac.signal.aborted) return;
      if (!thither.ok || !back.ok) {
        days.textContent = '…the sea road thither could not be found.';
        return;
      }
      const [ft, fb] = await Promise.all([thither.json(), back.json()]);
      if (ac.signal.aborted) return;
      const dT = Math.round(ft.properties.days), dB = Math.round(fb.properties.days);
      days.textContent =
        `Under sail: ${dT} days thither, ${dB} days back — the wind is no man's servant.`;
    } catch (e) {
      if (e.name !== 'AbortError') {
        days.textContent = '…the sea road thither could not be found.';
      }
    }
  }

  /* ---------- interaction ---------- */

  btn.addEventListener('click', () => {
    if (carta.activeTool === 'dividers') { exitTool(false); return; }
    if (!armTool()) return;
    state = 'await-a';
    showHint('Prick two points upon the sea — port marks will not take the prick.');
  });

  map.on('click', (e) => {
    if (carta.activeTool !== 'dividers') return;
    const ll = [e.lngLat.lng, e.lngLat.lat];
    if (state === 'await-b') {
      pointB = ll;
      addPin(ll);
      state = 'done';
      showHint('Prick anew to measure again — Esc to put the dividers away.');
      renderMeasurement(pointA, pointB);
    } else { // await-a, or a fresh prick after a complete measurement
      clearMeasurement();
      pointA = ll;
      addPin(ll);
      state = 'await-b';
      showHint('Now prick the second point.');
    }
  });

  // Right-click puts the dividers away. The app's own contextmenu handler
  // (isochrones) is registered after module init and checks the tool lock,
  // so the lock must be released only after this event has fully dispatched.
  map.on('contextmenu', (e) => {
    if (carta.activeTool !== 'dividers') return;
    e.preventDefault();
    if (e.originalEvent) e.originalEvent.preventDefault();
    exitTool(true);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && carta.activeTool === 'dividers') exitTool(false);
  });

  /* ---------- public surface (tests) ---------- */

  window.cartaDividers = {
    measure(a, b) {
      if (!armTool()) return false;
      clearMeasurement();
      pointA = a.slice(); pointB = b.slice();
      addPin(pointA); addPin(pointB);
      state = 'done';
      renderMeasurement(pointA, pointB);
      return true;
    },
    clear() { exitTool(false); },
  };
});
