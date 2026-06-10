/* Carta Temporum — voyage module. Registered via window.cartaInits.
   Pick an origin port ("Sail a voyage hence…" or bus 'voyage-from'), click a
   destination upon the chart (or pick a port from the list), and an engraved
   ship sails the time-optimal track from /api/route with a growing madder
   wake, a Day-counter, speed controls and a captain's log.
   Shareable: #voyage=p.nassau~p.london (or lon,lat tokens). */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function initVoyage(carta) {
  const map = carta.map;
  const INK = carta.INK || '#3d2f1e';
  const INK_SOFT = carta.INK_SOFT || '#5b4636';
  const MADDER = '#8a3b2e', DEEP = '#6e1f14', PAPER = '#f0e4c8', PARCH = '#e7d8ba';
  const SPEEDS = [5, 10, 20, 40];          // model-days per second
  const TROPIC = 23.44;
  const D2R = Math.PI / 180;
  const EMPTY = { type: 'FeatureCollection', features: [] };

  /* ---------- styles ---------- */

  const css = document.createElement('style');
  css.textContent = `
#vg-hud {
  position: fixed; left: 50%; bottom: 118px; transform: translateX(-50%);
  z-index: 29; box-sizing: border-box; max-width: min(640px, 78vw);
  display: flex; align-items: center; gap: 10px;
  background: ${PAPER}; border: 1px solid ${INK}; color: ${INK};
  box-shadow: inset 0 0 0 2.5px ${PAPER}, inset 0 0 0 3.5px rgba(61,47,30,0.55), 2px 4px 10px rgba(61,47,30,0.35);
  padding: 6px 14px 7px; font-family: 'IM Fell English', serif; font-size: 13px;
  user-select: none;
}
#vg-hud .vg-day {
  font-family: 'IM Fell English SC', 'IM Fell English', serif;
  font-size: 13.5px; letter-spacing: 0.8px; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
#vg-hud .vg-prompt { font-style: italic; color: ${INK_SOFT}; }
#vg-hud button {
  font-family: 'IM Fell English', serif; font-size: 12px; line-height: 1.2;
  background: ${INK}; color: ${PARCH}; border: none; cursor: pointer;
  padding: 3px 9px; flex: none;
}
#vg-hud button:hover { background: ${MADDER}; }
#vg-hud button.vg-x { background: transparent; color: ${INK_SOFT}; border: 1px solid ${INK_SOFT}; padding: 2px 7px; }
#vg-hud button.vg-x:hover { background: rgba(61,47,30,0.1); color: ${DEEP}; }
#vg-log {
  position: fixed; left: 16px; bottom: 34px; z-index: 28; width: 252px;
  box-sizing: border-box; padding: 6px 10px 7px;
  background: ${PAPER}; border: 1px solid ${INK}; color: ${INK};
  box-shadow: inset 0 0 0 2.5px ${PAPER}, inset 0 0 0 3.5px rgba(61,47,30,0.55), 2px 4px 10px rgba(61,47,30,0.35);
  font-family: 'IM Fell English', serif; font-size: 11.5px;
}
#vg-log .vg-lt {
  font-family: 'IM Fell English SC', serif; font-size: 11px; letter-spacing: 2px;
  color: ${DEEP}; border-bottom: 1px solid rgba(61,47,30,0.3); padding-bottom: 2px; margin-bottom: 3px;
}
#vg-log .vg-scroll { max-height: 86px; overflow-y: auto; scrollbar-width: thin; }
#vg-log .vg-le { font-style: italic; line-height: 1.45; margin: 1px 0; color: ${INK_SOFT}; }
#vg-log .vg-le b { font-style: normal; font-weight: normal; font-family: 'IM Fell English SC', serif; color: ${INK}; }
/* NB: never set position/transform on the marker ROOT (it would override
   .maplibregl-marker{position:absolute}); all of it lives on the inner
   wrapper — same pattern as .tl-ship / .wm in style.css. */
.vg-ship { pointer-events: none; }
.vg-ship .vgs-in { position: relative; display: block; width: 34px; height: 30px; will-change: transform; }
.vg-ship svg { display: block; filter: drop-shadow(0.5px 0.5px 0 rgba(240,228,200,0.9)); }
.vg-pin { pointer-events: none; }
/* teardrop pin: tip sits at the bottom of the 18px box, so lift the inner
   wrapper (never the marker root) so the tip marks the exact point */
.vg-pin .vgp-in { position: relative; display: block; transform: translateY(-8.2px); }
`;
  document.head.appendChild(css);

  /* ---------- sources & layers (above iso bands, under route hit) ---------- */

  map.addSource('voyage', { type: 'geojson', data: EMPTY });
  map.addSource('voyage-wake', { type: 'geojson', data: EMPTY });
  map.addLayer({
    id: 'voyage', type: 'line', source: 'voyage', maxzoom: 11.5,
    paint: { 'line-color': INK_SOFT, 'line-opacity': 0.5, 'line-width': 1.6, 'line-dasharray': [1, 2.2] },
  }, 'routes-hit');
  map.addLayer({
    id: 'voyage-wake', type: 'line', source: 'voyage-wake', maxzoom: 11.5,
    paint: { 'line-color': MADDER, 'line-opacity': 0.85, 'line-width': 2.2 },
  }, 'routes-hit');

  /* ---------- svg ---------- */

  function shipSVG() {
    // Side profile, bow to the RIGHT (east); mirrored when standing westerly.
    if (window.cartaIcons) return window.cartaIcons.voyageShip();
    return `<svg width="34" height="30" viewBox="0 0 34 30">
      <g stroke="${INK}" fill="none" stroke-width="1.25" stroke-linecap="round">
        <path d="M4.5 20.5 Q17 26.5 29.5 20.5 L26.5 15.5 H7.5 Z" fill="rgba(91,70,54,0.4)"/>
        <path d="M12 15.5 V3.5 M21 15.5 V5.5"/>
        <path d="M12 4.5 q6.5 4 0 10.5 M12 5.5 q-5 3.5 0 9.5" stroke-width="1"/>
        <path d="M21 6.5 q5.5 3.5 0 8.5 M21 6.5 q-4.5 3 0 8.5" stroke-width="1"/>
        <path d="M26.5 15.5 L32.5 12.5"/>
      </g>
      <path d="M12 3.2 L17 4.5 L12 5.8 Z" fill="${MADDER}"/>
    </svg>`;
  }
  function pinSVG(kind) {
    if (window.cartaIcons) return window.cartaIcons.voyagePin(kind);
    const glyph = kind === 'a'
      ? `<g stroke="${DEEP}" fill="none" stroke-width="1.2" stroke-linecap="round">
           <circle cx="9" cy="5.6" r="1.3"/>
           <path d="M9 6.9 V12.8 M6.4 9 h5.2 M5.2 10.6 q1 2.8 3.8 2.8 q2.8 0 3.8 -2.8"/>
         </g>`
      : `<g stroke="${DEEP}" fill="none" stroke-width="1.5" stroke-linecap="round">
           <path d="M5.8 5.8 L12.2 12.2 M12.2 5.8 L5.8 12.2"/>
         </g>`;
    return `<svg width="18" height="18" viewBox="0 0 18 18">
      <circle cx="9" cy="9" r="7.6" fill="${PAPER}" stroke="${DEEP}" stroke-width="1.2"/>${glyph}</svg>`;
  }

  /* ---------- helpers ---------- */

  const portById = (id) => carta.meta.ports.find((p) => p.id === id);
  const shortName = (n) => String(n).split(' (')[0].split(',')[0];
  const normLon = (l) => ((l + 540) % 360) - 180;

  function resolveEnd(x) {
    if (typeof x === 'string') {
      if (x.slice(0, 2) === 'p.') {
        const p = portById(x.slice(2));
        return p ? { lon: p.lon, lat: p.lat, name: p.name, id: p.id } : null;
      }
      x = x.split(',').map(Number);
    }
    if (Array.isArray(x)) x = { lon: +x[0], lat: +x[1] };
    if (!x || !isFinite(x.lon) || !isFinite(x.lat)) return null;
    return {
      lon: x.lon, lat: x.lat, id: x.id || null,
      name: x.name || `the open sea (${carta.fmtLL(x.lon, x.lat)})`,
    };
  }
  const enc = (e) => (e.id ? 'p.' + e.id : `${e.lon.toFixed(2)},${e.lat.toFixed(2)}`);

  function bearingOf(a, b) {
    const dy = b[1] - a[1];
    let dx = b[0] - a[0];
    if (dx > 180) dx -= 360; else if (dx < -180) dx += 360;
    dx *= Math.cos(((a[1] + b[1]) / 2) * D2R);
    return (Math.atan2(dx, dy) / D2R + 360) % 360;
  }
  const angDiff = (to, from) => ((to - from + 540) % 360) - 180;

  function segNm(a, b) {
    const dy = b[1] - a[1];
    let dx = b[0] - a[0];
    if (dx > 180) dx -= 360; else if (dx < -180) dx += 360;
    dx *= Math.cos(((a[1] + b[1]) / 2) * D2R);
    return 60 * Math.hypot(dx, dy);
  }

  function calmAt(lon, lat) {
    if (window.cartaWind && window.cartaWind.flowAt) {
      try { return !!window.cartaWind.flowAt(normLon(lon), lat).calm; } catch (_) { /* fall through */ }
    }
    return Math.abs(lat) < 6; // doldrums band fallback
  }

  /* ---------- ui scraps ---------- */

  let hud = null, logPanel = null, logScroll = null;

  function setHUD(html) {
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'vg-hud';
      document.body.appendChild(hud);
    }
    hud.innerHTML = html;
  }
  function removeHUD() { if (hud) { hud.remove(); hud = null; } }
  function removeLog() { if (logPanel) { logPanel.remove(); logPanel = null; logScroll = null; } }

  function buildLog() {
    removeLog();
    logPanel = document.createElement('div');
    logPanel.id = 'vg-log';
    logPanel.innerHTML = `<div class="vg-lt">Captain’s Log</div><div class="vg-scroll"></div>`;
    document.body.appendChild(logPanel);
    logScroll = logPanel.querySelector('.vg-scroll');
  }

  function errorCard(kind) {
    const msg = kind === 'land'
      ? 'That mark lies upon dry land, or in waters too shoal for a square-rigged ship. Prick your destination upon the open sea.'
      : 'No sea road could be found betwixt these points — the way is barred by land or lies beyond the chart.';
    carta.showCard(`<h3>No passage</h3><p>${msg}</p>`);
    setTimeout(carta.hideCard, 5000);
  }

  /* ---------- state ---------- */

  let v = null;                // active voyage
  let armedFrom = null;        // origin port while awaiting a destination
  let armedSelVal = '';        // #port-select value to restore after intercept
  let loadToken = 0;           // cancels superseded /api/route fetches

  /* ---------- arming (destination pick) ---------- */

  function arm(p) {
    if (carta.activeTool && carta.activeTool !== 'voyage') return; // another tool holds the click
    if (v) stopVoyage();
    loadToken++;
    armedFrom = resolveEnd({ lon: p.lon, lat: p.lat, name: p.name, id: p.id });
    if (!armedFrom) return;
    const sel = document.getElementById('port-select');
    armedSelVal = sel ? sel.value : '';
    carta.activeTool = 'voyage';
    setHUD(`<span class="vg-prompt">Whither away? Click the destination upon the chart — or pick a port from the list.</span>
      <button class="vg-x" id="vg-cancel" title="think better of it (Esc)">✕</button>`);
    hud.querySelector('#vg-cancel').onclick = () => { disarm(); removeHUD(); };
  }

  function disarm() {
    if (!armedFrom) return;
    armedFrom = null;
    if (carta.activeTool === 'voyage') carta.activeTool = null;
  }

  map.on('click', (e) => {
    if (!armedFrom || e.defaultPrevented) return;
    const A = armedFrom;
    disarm();
    startVoyage(A, resolveEnd([e.lngLat.lng, e.lngLat.lat]));
  });

  // While armed, a port chosen from the list is the DESTINATION — intercept in
  // capture phase on document so app.js's own change handler never runs.
  document.addEventListener('change', (e) => {
    if (!armedFrom || !e.target || e.target.id !== 'port-select') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    e.stopPropagation();
    const p = portById(e.target.value);
    e.target.value = armedSelVal;
    const A = armedFrom;
    disarm();
    if (p) startVoyage(A, resolveEnd({ lon: p.lon, lat: p.lat, name: p.name, id: p.id }));
    else removeHUD();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && armedFrom) { disarm(); removeHUD(); }
  });

  /* ---------- route fetch ---------- */

  async function startVoyage(A, B) {
    if (!A || !B) { removeHUD(); return; }
    if (v) stopVoyage();
    const token = ++loadToken;
    setHUD(`<span class="vg-prompt"><span class="compass-spin" style="display:inline-block">✦</span> Laying the course…</span>`);
    let res, feature;
    try {
      res = await fetch(`/api/route?from=${A.lon.toFixed(3)},${A.lat.toFixed(3)}&to=${B.lon.toFixed(3)},${B.lat.toFixed(3)}`);
      if (token !== loadToken) return;
      if (!res.ok) {
        let kind = '';
        try { kind = (await res.json()).error; } catch (_) { /* non-JSON */ }
        removeHUD();
        errorCard(kind);
        return;
      }
      feature = await res.json();
    } catch (err) {
      if (token !== loadToken) return;
      console.error('voyage: route fetch failed', err);
      removeHUD();
      errorCard('');
      return;
    }
    if (token !== loadToken) return;
    beginVoyage(feature, A, B);
  }

  /* ---------- the voyage itself ---------- */

  function makeMarker(cls, html, lngLat) {
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = html;
    return new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(lngLat).addTo(map);
  }

  function beginVoyage(f, A, B) {
    const coords = f.geometry.coordinates;
    const hours = f.properties.hours;
    if (!coords || coords.length < 2 || !hours || hours.length !== coords.length) {
      errorCard('');
      removeHUD();
      return;
    }
    // First slow stretch: consecutive segments under 1.5 kn lasting > 2 days.
    let slowH = null, acc = 0, accStart = 0;
    for (let i = 1; i < coords.length && slowH == null; i++) {
      const dh = hours[i] - hours[i - 1];
      const kn = dh > 0 ? segNm(coords[i - 1], coords[i]) / dh : 99;
      if (kn < 1.5) {
        if (acc === 0) accStart = hours[i - 1];
        acc += dh;
        if (acc > 48) slowH = accStart + 48;
      } else acc = 0;
    }

    v = {
      coords, hours, A, B,
      days: f.properties.days || hours[hours.length - 1] / 24,
      totalDays: Math.max(1, Math.ceil(f.properties.days || hours[hours.length - 1] / 24)),
      t: 0, speedIdx: 1, playing: false, arrived: false,
      raf: 0, lastTs: 0, bearing: null, dayShown: -1,
      fired: {}, seas: {}, calm: calmAt(coords[0][0], coords[0][1]), calmEntered: false,
      slowH,
      wake: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [coords[0], coords[0]] } },
    };

    map.getSource('voyage').setData(f);
    map.getSource('voyage-wake').setData(v.wake);
    v.pinA = makeMarker('vg-pin', `<span class="vgp-in">${pinSVG('a')}</span>`, coords[0]);
    v.pinB = makeMarker('vg-pin', `<span class="vgp-in">${pinSVG('b')}</span>`, coords[coords.length - 1]);
    v.ship = makeMarker('vg-ship', `<span class="vgs-in">${shipSVG()}</span>`, coords[0]);
    v.shipIn = v.ship.getElement().querySelector('.vgs-in');

    carta.cartaHash.write({ voyage: `${enc(A)}~${enc(B)}`, port: null, origin: null });

    const bb = new maplibregl.LngLatBounds();
    for (const c of coords) bb.extend(c);
    map.fitBounds(bb, { padding: { top: 80, bottom: 160, left: 400, right: 90 }, maxZoom: 5.5, duration: 1800 });

    setHUD(`<span class="vg-day" id="vg-day"></span>
      <button id="vg-play" title="heave to / make sail">⏸</button>
      <button id="vg-speed" title="speed of the telling"></button>
      <button class="vg-x" id="vg-close" title="abandon the voyage">✕</button>`);
    hud.querySelector('#vg-play').onclick = () => {
      if (!v) return;
      if (v.playing) { pause(); return; }
      if (v.arrived) { v.arrived = false; v.t = 0; v.bearing = null; }
      play();
    };
    hud.querySelector('#vg-speed').onclick = () => { if (v) { v.speedIdx = (v.speedIdx + 1) % SPEEDS.length; renderSpeedBtn(); } };
    hud.querySelector('#vg-close').onclick = () => stopVoyage();
    renderSpeedBtn();

    buildLog();
    logEntry(`Departed <b>${shortName(A.name)}</b> upon the morning tide, bound for ${shortName(B.name)}.`);

    render(0);
    play();
  }

  function renderSpeedBtn() {
    const b = hud && hud.querySelector('#vg-speed');
    if (b && v) b.textContent = `${SPEEDS[v.speedIdx]} d/s`;
  }

  function play() {
    if (!v || v.playing) return;
    v.playing = true;
    v.lastTs = performance.now();
    const b = hud && hud.querySelector('#vg-play');
    if (b) b.textContent = '⏸';
    cancelAnimationFrame(v.raf);
    v.raf = requestAnimationFrame(tick);
  }
  function pause() {
    if (!v) return;
    v.playing = false;
    cancelAnimationFrame(v.raf);
    const b = hud && hud.querySelector('#vg-play');
    if (b) b.textContent = v.arrived ? '⟲' : '⏵';
  }

  function tick(ts) {
    if (!v || !v.playing) return;
    v.raf = requestAnimationFrame(tick);
    // Clamp like the timeline does: a hidden tab must not fast-forward weeks.
    const dt = Math.min(0.1, Math.max(0, (ts - v.lastTs) / 1000));
    v.lastTs = ts;
    v.t += dt * SPEEDS[v.speedIdx];
    render(dt);
  }

  function render(dt) {
    const { coords, hours } = v;
    const lastH = hours[hours.length - 1];
    let h = v.t * 24;
    let arriving = false;
    if (h >= lastH) { h = lastH; v.t = lastH / 24; arriving = true; }

    // binary search: greatest k with hours[k] <= h
    let lo = 0, hi = hours.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (hours[mid] <= h) lo = mid; else hi = mid;
    }
    const k = lo;
    const span = hours[k + 1] - hours[k];
    const fr = span > 0 ? (h - hours[k]) / span : 0;
    const a = coords[k], b = coords[k + 1];
    const pos = [a[0] + (b[0] - a[0]) * fr, a[1] + (b[1] - a[1]) * fr];

    v.ship.setLngLat(pos);
    const tb = bearingOf(a, b);
    v.bearing = v.bearing == null ? tb : (v.bearing + angDiff(tb, v.bearing) * Math.min(1, dt * 5 + 0.04) + 360) % 360;
    const bg = v.bearing;
    v.shipIn.style.transform = Math.sin(bg * D2R) < 0
      ? `rotate(${(bg - 270).toFixed(1)}deg) scaleX(-1)`   // westerly: mirror, never sail keel-up
      : `rotate(${(bg - 90).toFixed(1)}deg)`;

    const wakeCoords = coords.slice(0, k + 1);
    wakeCoords.push(pos);
    v.wake.geometry.coordinates = wakeCoords;
    map.getSource('voyage-wake').setData(v.wake);

    const day = Math.min(v.totalDays, Math.floor(v.t) + 1);
    if (day !== v.dayShown) {
      v.dayShown = day;
      const el = hud && hud.querySelector('#vg-day');
      if (el) el.textContent = `Day ${day} of ${v.totalDays} — out of ${shortName(v.A.name)}, bound for ${shortName(v.B.name)}`;
    }

    checkLog(pos, h, day);

    if (arriving && !v.arrived) {
      v.arrived = true;
      logEntry(`Came to anchor at <b>${shortName(v.B.name)}</b> after ${Math.round(v.days)} days.`);
      pause();
    }
    v.prev = pos;
  }

  /* ---------- captain's log ---------- */

  function logEntry(html) {
    if (!logScroll || !v) return;
    const day = Math.max(1, Math.min(v.totalDays, Math.floor(v.t) + 1));
    const div = document.createElement('div');
    div.className = 'vg-le';
    div.innerHTML = `<b>Day ${day}</b> — ${html}`;
    logScroll.appendChild(div);
    logScroll.scrollTop = logScroll.scrollHeight;
  }
  function fireOnce(key, html) {
    if (v.fired[key]) return;
    v.fired[key] = true;
    logEntry(html);
  }

  function checkLog(pos, h) {
    const prev = v.prev || pos;
    const [lon, lat] = pos;
    const pLat = prev[1];
    if (pLat !== lat) {
      if ((pLat < 0) !== (lat < 0)) fireOnce('line', 'Crossed the Line; Neptune came aboard.');
      if ((pLat < TROPIC) !== (lat < TROPIC)) fireOnce('cancer', 'Crossed the Tropick of Cancer.');
      if ((pLat < -TROPIC) !== (lat < -TROPIC)) fireOnce('capricorn', 'Crossed the Tropick of Capricorn.');
    }
    const calm = calmAt(lon, lat);
    if (calm !== v.calm) {
      v.calm = calm;
      if (calm) { v.calmEntered = true; fireOnce('calm-in', 'Becalmed in the doldrums — whistling for a wind.'); }
      else if (v.calmEntered) fireOnce('calm-out', 'The wind freshens; the sails fill and we make way.');
    }
    if (v.slowH != null && h >= v.slowH) fireOnce('slow', 'Scant airs; the men grow quarrelsome.');
    const cosLat = Math.cos(lat * D2R);
    for (const s of carta.SEA_LABELS || []) {
      if (v.seas[s.t]) continue;
      const dLon = normLon(lon - s.lon) * cosLat;
      const dLat = lat - s.lat;
      if (dLon * dLon + dLat * dLat < 36) {
        v.seas[s.t] = true;
        logEntry(`Raised <b>${s.t}</b>.`);
      }
    }
  }

  /* ---------- teardown ---------- */

  function stopVoyage() {
    loadToken++;
    if (v) {
      cancelAnimationFrame(v.raf);
      v.ship.remove();
      v.pinA.remove();
      v.pinB.remove();
      v = null;
    }
    const src = map.getSource('voyage'), wsrc = map.getSource('voyage-wake');
    if (src) src.setData(EMPTY);
    if (wsrc) wsrc.setData(EMPTY);
    removeHUD();
    removeLog();
    carta.cartaHash.write({ voyage: null });
  }

  /* ---------- wiring ---------- */

  carta.bus.on('voyage-from', (p) => { if (p) arm(p); });
  carta.bus.on('origin', () => {            // a new isochrone origin supplants any voyage
    if (armedFrom) { disarm(); removeHUD(); }
    if (v) stopVoyage();
  });

  window.cartaVoyage = {
    start(a, b) { return startVoyage(resolveEnd(a), resolveEnd(b)); },
    stop() { disarm(); stopVoyage(); },
    setSpeed(n) {
      if (!v) return;
      let best = 0;
      for (let i = 0; i < SPEEDS.length; i++) if (Math.abs(SPEEDS[i] - n) < Math.abs(SPEEDS[best] - n)) best = i;
      v.speedIdx = best;
      renderSpeedBtn();
    },
    get state() {
      return v ? { t: v.t, day: v.dayShown, playing: v.playing, arrived: v.arrived } : null;
    },
  };

  // #voyage=p.nassau~p.london — boot straight into the telling.
  const h0 = carta.cartaHash.read();
  if (h0.voyage) {
    const parts = String(h0.voyage).split('~');
    const A = resolveEnd(parts[0]), B = resolveEnd(parts[1]);
    if (A && B) startVoyage(A, B);
  }
});
