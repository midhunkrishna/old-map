/* Carta Temporum — overlays module (kingdoms, winds, currents, fleets, danger).
   Registered via window.cartaInits; receives the shared `carta` surface. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function initOverlays(carta) {
  const map = carta.map;
  const INK = '#3d2f1e';
  const MADDER = '#8a3b2e';
  const DANGER_C = '#6e1f14';
  const WIND_C = 'rgba(82,100,121,0.55)'; // slate ink-blue (matches living wind)
  const CURRENT_C = '#3a6b5a';            // verdigris sea-green (matches living sea)

  /* ---------- persisted state ---------- */
  const LS_KEY = 'cartaOverlays.v1';
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { /* ignore */ }
  const state = {
    on: Object.assign(
      { kingdoms: false, winds: false, currents: false, fleets: false, danger: false,
        living: false, sound: false },
      saved.on || {}),
    collapsed: !!saved.collapsed,
  };
  const REDUCED_MOTION = !!(window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (REDUCED_MOTION) state.on.living = false; // defaults unchecked under reduced motion
  function persist() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ } }

  // Subscribers (flowfx, sound) hear every toggle; callbacks run synchronously
  // inside the row's click so AudioContext gesture rules are satisfied.
  const ordCbs = [];
  function emitOrd() {
    for (const cb of ordCbs) { try { cb(state.on); } catch (e) { console.error('ordnances', e); } }
  }
  carta.ordnances = { state: state.on, onChange(cb) { ordCbs.push(cb); } };

  // When the Living Sea runs, the static wind/current arrow layers yield to
  // the particle animation.
  const vis = (k) => {
    let on = state.on[k];
    if ((k === 'winds' || k === 'currents') && state.on.living) on = false;
    return on ? 'visible' : 'none';
  };
  const decade = () => {
    const y = (window.cartaTime && window.cartaTime.year) || 1730;
    return Math.min(1730, Math.max(1650, Math.round(y / 10) * 10));
  };
  const kingdomFilter = (D) => ['all', ['<=', ['get', 'from'], D], ['>=', ['get', 'to'], D]];

  /* ---------- styles ---------- */
  const styleEl = document.createElement('style');
  styleEl.textContent = `
#ord-panel {
  position: fixed; left: 38px; z-index: 20; width: 340px; box-sizing: border-box;
  font-family: 'IM Fell English', Georgia, serif; color: var(--ink);
  background:
    radial-gradient(ellipse at 30% 10%, rgba(255,250,230,0.5), transparent 60%),
    var(--paper-card);
  border: 2px solid var(--ink); outline: 1px solid var(--ink); outline-offset: 3px;
  box-shadow: 6px 8px 22px var(--shadow);
}
#ord-head {
  cursor: pointer; user-select: none; padding: 7px 14px 6px; text-align: center;
  font-family: 'IM Fell English SC', 'IM Fell English', serif;
  font-size: 15px; letter-spacing: 2.5px;
  border-bottom: 1px solid rgba(61,47,30,0.35);
}
#ord-panel.ord-closed #ord-head { border-bottom: none; }
#ord-head .ord-caret { float: right; color: var(--ink-soft); font-size: 12px; line-height: 1.6; }
#ord-body { padding: 8px 16px 10px; }
.ord-row { display: flex; align-items: center; gap: 9px; font-size: 13.5px; padding: 3.5px 0; cursor: pointer; }
.ord-row input { accent-color: var(--ink-soft); margin: 0; cursor: pointer; }
.ord-row .ord-swatch { display: inline-flex; width: 30px; justify-content: center; align-items: center; }
.ord-row.ord-dead { text-decoration: line-through; opacity: 0.55; cursor: default; }
.ord-row.ord-dead input { cursor: default; }
.ord-chip {
  display: inline-block; width: 10px; height: 10px;
  border: 1px solid var(--ink-soft); margin-right: 6px; vertical-align: -1px;
}
.ov-fleet { cursor: pointer; }
.ov-fleet svg { filter: drop-shadow(0.5px 0.5px 0 rgba(240,228,200,0.9)); display: block; }
.ov-fleet:hover svg { transform: scale(1.25); }
`;
  document.head.appendChild(styleEl);

  /* ---------- glyphs ---------- */
  function manOfWarSVG(pennant, size) {
    if (window.cartaIcons) return window.cartaIcons.manOfWar(pennant, size);
    const s = size || 22;
    return `<svg width="${s}" height="${s}" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 14.5 L19.5 14.5 L17.2 17.8 L5.2 17.8 Z" fill="rgba(240,228,200,0.85)" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M6.5 14.5 V6.5 M11 14.5 V3.4 M15.5 14.5 V7" stroke="${INK}" stroke-width="1"/>
      <path d="M4.6 8.4 H8.4 M8.8 6 H13.2 M13.7 9 H17.3 M5 11 H8 M9 9 H13 M14 11.5 H17" stroke="${INK}" stroke-width="0.8"/>
      <path d="M11 3.4 L15.6 4.4 L11 5.4 Z" fill="${pennant}" stroke="${INK}" stroke-width="0.5"/>
    </svg>`;
  }
  const SWATCHES = {
    kingdoms: '<span style="display:inline-flex;gap:2px">'
      + ['#a8603c', '#a85a6e', '#6e85a8'].map((c) =>
        `<i style="width:8px;height:8px;background:${c};opacity:0.7;border:1px solid var(--ink-soft)"></i>`).join('')
      + '</span>',
    winds: `<svg width="28" height="10" viewBox="0 0 28 10"><path d="M1 5 H21 M21 5 l-5 -3 M21 5 l-5 3" stroke="rgba(82,100,121,0.9)" stroke-width="1.2" fill="none"/></svg>`,
    currents: `<svg width="28" height="10" viewBox="0 0 28 10"><path d="M1 5 H21 M21 5 l-5 -3 M21 5 l-5 3" stroke="${CURRENT_C}" stroke-width="2" fill="none" opacity="0.85"/></svg>`,
    fleets: manOfWarSVG(MADDER, 18),
    danger: `<span style="display:inline-block;width:16px;height:10px;background:rgba(110,31,20,0.22);border:1px dashed rgba(110,31,20,0.7)"></span>`,
    living: `<svg width="28" height="12" viewBox="0 0 28 12">
      <path d="M1 7.5 q3.5 -5 7 0 t7 0 t7 0" stroke="rgba(82,100,121,0.85)" stroke-width="1.3" fill="none" stroke-linecap="round"/>
      <path d="M4.5 10.5 q3.5 -4 7 0 t7 0" stroke="rgba(58,107,90,0.7)" stroke-width="1" fill="none" stroke-linecap="round"/>
    </svg>`,
    sound: `<svg width="14" height="14" viewBox="0 0 14 14">
      <path d="M7 1.6 C4.6 1.6 3.5 3.3 3.5 5.8 c0 2.2 -0.9 3.3 -1.8 4.1 h10.6 c-0.9 -0.8 -1.8 -1.9 -1.8 -4.1 c0 -2.5 -1.1 -4.2 -3.5 -4.2 z" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>
      <path d="M5.6 11.5 a1.5 1.5 0 0 0 2.8 0" fill="none" stroke="${INK}" stroke-width="1.1"/>
    </svg>`,
  };

  /* ---------- panel ---------- */
  const ROWS = [
    { key: 'kingdoms', label: 'Kingdoms & Empires' },
    { key: 'winds', label: 'Trade Winds' },
    { key: 'currents', label: 'Currents' },
    { key: 'fleets', label: 'Men-of-War' },
    { key: 'danger', label: 'Pirate Waters' },
    { key: 'living', label: 'A Living Sea' },
    { key: 'sound', label: 'Sounds of the Sea ♪' },
  ];
  const panel = document.createElement('div');
  panel.id = 'ord-panel';
  const head = document.createElement('div');
  head.id = 'ord-head';
  head.innerHTML = `Ordnances of the Chart <span class="ord-caret">▾</span>`;
  const body = document.createElement('div');
  body.id = 'ord-body';
  panel.appendChild(head);
  panel.appendChild(body);

  const rowEls = {};
  for (const r of ROWS) {
    const row = document.createElement('label');
    row.className = 'ord-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!state.on[r.key];
    const swatch = document.createElement('span');
    swatch.className = 'ord-swatch';
    swatch.innerHTML = SWATCHES[r.key];
    const name = document.createElement('span');
    name.textContent = r.label;
    row.appendChild(input);
    row.appendChild(swatch);
    row.appendChild(name);
    input.addEventListener('change', () => {
      state.on[r.key] = input.checked;
      persist();
      applyOverlay(r.key);
      emitOrd();
    });
    body.appendChild(row);
    rowEls[r.key] = { row, input };
  }
  if (REDUCED_MOTION) {
    rowEls.living.row.title = 'Honours your reduced-motion preference; enable at will.';
  }

  function setCollapsed(c) {
    state.collapsed = c;
    body.style.display = c ? 'none' : '';
    panel.classList.toggle('ord-closed', c);
    head.querySelector('.ord-caret').textContent = c ? '▸' : '▾';
    persist();
  }
  head.addEventListener('click', () => setCollapsed(!state.collapsed));
  if (state.collapsed) setCollapsed(true);

  function positionPanel() {
    const c = document.getElementById('cartouche');
    let top = 420;
    if (c) top = c.getBoundingClientRect().bottom + 12;
    panel.style.top = top + 'px';
    // Never run past the bottom of short viewports: scroll instead.
    panel.style.maxHeight = 'calc(100vh - ' + top + 'px - 24px)';
    panel.style.overflowY = 'auto';
  }
  document.body.appendChild(panel);
  positionPanel();
  window.addEventListener('resize', positionPanel);

  // The cartouche grows later (legend un-hides once a port is picked, content
  // changes height) — track it and keep the panel below it.
  const cartouche = document.getElementById('cartouche');
  if (cartouche) {
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(positionPanel).observe(cartouche);
    } else if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(positionPanel).observe(cartouche, {
        attributes: true, attributeFilter: ['class', 'style'],
        childList: true, subtree: true,
      });
    }
  }

  function disableRow(key) {
    state.on[key] = false;
    const r = rowEls[key];
    r.input.checked = false;
    r.input.disabled = true;
    r.row.classList.add('ord-dead');
    r.row.title = 'data unavailable';
    emitOrd();
  }

  /* ---------- overlay visibility switch ---------- */
  const LAYER_GROUPS = {
    kingdoms: ['ov-kingdoms-fill', 'ov-kingdoms-line'],
    winds: ['ov-wind-lines', 'ov-wind-calms'],
    currents: ['ov-currents', 'ov-currents-hit'],
    danger: ['ov-danger-fill', 'ov-danger-line'],
  };
  function applyOverlay(key) {
    if (key === 'fleets') { renderFleets(); return; }
    if (key === 'sound') return; // no layers; the sound module subscribes via carta.ordnances
    if (key === 'living') {
      // Particles take over from the static arrows (and hand back) — the
      // flowfx module itself reacts through carta.ordnances.onChange.
      for (const k of ['winds', 'currents']) {
        for (const id of LAYER_GROUPS[k]) {
          if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(k));
        }
      }
      return;
    }
    for (const id of LAYER_GROUPS[key] || []) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis(key));
    }
    if (!state.on[key]) carta.hideCard();
  }

  /* ---------- kingdoms & empires ---------- */
  const empireColors = {}; // empire name -> hex, learnt from the data

  function addKingdoms(fc) {
    for (const f of fc.features || []) {
      const p = f.properties || {};
      if (p.empire && p.color && !empireColors[p.empire]) empireColors[p.empire] = p.color;
    }
    const D = decade();
    map.addSource('ov-kingdoms', { type: 'geojson', data: fc });
    map.addLayer({
      id: 'ov-kingdoms-fill', type: 'fill', source: 'ov-kingdoms',
      filter: kingdomFilter(D),
      layout: { visibility: vis('kingdoms') },
      paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.22 },
    }, 'coast50');
    map.addLayer({
      id: 'ov-kingdoms-line', type: 'line', source: 'ov-kingdoms',
      filter: kingdomFilter(D),
      layout: { visibility: vis('kingdoms') },
      paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.5, 'line-width': 1, 'line-dasharray': [4, 2] },
    }, 'coast50');
    map.on('mousemove', 'ov-kingdoms-fill', (e) => {
      const p = e.features[0].properties;
      carta.showCard(`<h3>${p.label}</h3>
        <div class="meta"><span class="ord-chip" style="background:${p.color}"></span>${p.empire} · anno ${decade()}</div>
        <p>${p.note || ''}</p>`);
    });
    map.on('mouseleave', 'ov-kingdoms-fill', () => carta.hideCard());
    renderFleets(); // pennant colors may now resolve properly
  }

  /* ---------- trade winds ---------- */
  function addWind(fc) {
    map.addSource('ov-wind', { type: 'geojson', data: fc });
    map.addLayer({
      id: 'ov-wind-lines', type: 'line', source: 'ov-wind',
      filter: ['==', ['get', 'kind'], 'wind'],
      layout: { visibility: vis('winds') },
      paint: {
        'line-color': WIND_C,
        'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.8, 6, 1.6],
      },
    });
    map.addLayer({
      id: 'ov-wind-calms', type: 'circle', source: 'ov-wind',
      filter: ['==', ['get', 'kind'], 'calm'],
      layout: { visibility: vis('winds') },
      paint: { 'circle-radius': 1.5, 'circle-color': 'rgba(91,70,54,0.3)' },
    });
    applySmoothArrows(); // smooth field may have resolved before the fetch
  }

  /* ---------- currents ---------- */
  function addCurrents(fc) {
    map.addSource('ov-currents', { type: 'geojson', data: fc });
    map.addLayer({
      id: 'ov-currents', type: 'line', source: 'ov-currents',
      layout: { visibility: vis('currents') },
      paint: {
        'line-color': CURRENT_C,
        'line-opacity': 0.65,
        'line-width': ['interpolate', ['linear'], ['get', 'kn'], 0.5, 1.0, 1.8, 2.6],
      },
    });
    map.addLayer({
      id: 'ov-currents-hit', type: 'line', source: 'ov-currents',
      layout: { visibility: vis('currents') },
      paint: { 'line-color': '#000', 'line-opacity': 0.001, 'line-width': 10 },
    });
    map.on('mousemove', 'ov-currents-hit', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      const p = e.features[0].properties;
      carta.showCard(`<h3>${p.name}</h3>
        <div class="meta" style="color:${CURRENT_C}">Ocean current</div>
        <p>${p.kn} knots of set.</p>`);
    });
    map.on('mouseleave', 'ov-currents-hit', () => {
      map.getCanvas().style.cursor = '';
      carta.hideCard();
    });
    applySmoothArrows(); // smooth field may have resolved before the fetch
  }

  /* ---------- smooth streamline arrows ----------
     Once cartaWind's gridded field is built from the real land mask, regrow
     the static arrows as short curved streamlines integrated through the
     smoothed field — arrow mode then shows the same seamless flow as the
     Living Sea (no belt/box edges). If the mask fetch failed the server
     arrows stay as fallback. */
  let smoothWindFC = null, smoothCurrentsFC = null;

  // Integrate a short curved polyline through the field, plus arrowhead barbs.
  function streamline(lon0, lat0, kind, steps, h) {
    const Wd = window.cartaWind;
    let lon = lon0, lat = lat0, du = 0, dv = 0;
    const line = [[+lon.toFixed(2), +lat.toFixed(2)]];
    for (let s = 0; s < steps; s++) {
      const f = Wd.fieldAt(lon, lat, kind);
      const m = Math.hypot(f.u, f.v);
      if (m < 1e-3) break;
      du = f.u / m; dv = f.v / m;
      const cos = Math.max(0.2, Math.cos(lat * Math.PI / 180));
      const nlon = lon + du * h / cos;
      const nlat = lat + dv * h;
      if (kind === 'ocean' && !Wd.isWater(nlon, nlat)) break; // arrows stop ashore
      lon = nlon; lat = nlat;
      line.push([+lon.toFixed(2), +lat.toFixed(2)]);
    }
    if (line.length < 3) return null;
    const hl = h * 1.1;
    const cos = Math.max(0.2, Math.cos(lat * Math.PI / 180));
    const A = 150 * Math.PI / 180;
    const barb = (a) => [
      +(lon + (du * Math.cos(a) - dv * Math.sin(a)) * hl / cos).toFixed(2),
      +(lat + (du * Math.sin(a) + dv * Math.cos(a)) * hl).toFixed(2),
    ];
    const tip = line[line.length - 1];
    return [line, [tip, barb(A)], [tip, barb(-A)]];
  }

  function buildSmoothArrows() {
    const Wd = window.cartaWind;
    const wf = [], cf = [];
    for (let lat = -68; lat <= 68; lat += 4) {       // winds: sea + land
      for (let lon = -178; lon < 180; lon += 4) {
        const f = Wd.fieldAt(lon, lat, 'wind');
        if (Math.hypot(f.u, f.v) < 0.3) continue;     // calm belts stipple instead
        const g = streamline(lon, lat, 'wind', 5, 0.8);
        if (g) {
          wf.push({ type: 'Feature', properties: { kind: 'wind' },
            geometry: { type: 'MultiLineString', coordinates: g } });
        }
      }
    }
    for (let lat = -68; lat <= 68; lat += 2) {       // calm-belt stipple (analytic)
      for (let lon = -178; lon < 180; lon += 3) {
        if (!Wd.windAt(lon, lat).directed) {
          wf.push({ type: 'Feature', properties: { kind: 'calm' },
            geometry: { type: 'Point', coordinates: [lon, lat] } });
        }
      }
    }
    smoothWindFC = { type: 'FeatureCollection', features: wf };
    for (let lat = -68; lat <= 68; lat += 2.5) {     // currents: water only
      for (let lon = -177.5; lon < 180; lon += 2.5) {
        if (!Wd.isWater(lon, lat)) continue;
        const f = Wd.fieldAt(lon, lat, 'ocean');
        const kn = Math.hypot(f.u, f.v);
        if (kn < 0.12) continue;
        const g = streamline(lon, lat, 'ocean', 6, 0.55);
        if (!g) continue;
        const named = Wd.currentAt(lon, lat);
        cf.push({ type: 'Feature',
          properties: { kn: +kn.toFixed(1), name: (named && named.name) || 'Ocean current' },
          geometry: { type: 'MultiLineString', coordinates: g } });
      }
    }
    smoothCurrentsFC = { type: 'FeatureCollection', features: cf };
  }

  function applySmoothArrows() {
    const ws = map.getSource('ov-wind');
    if (ws && smoothWindFC) ws.setData(smoothWindFC);
    const cs = map.getSource('ov-currents');
    if (cs && smoothCurrentsFC) cs.setData(smoothCurrentsFC);
  }

  if (window.cartaWind && window.cartaWind.ready) {
    window.cartaWind.ready.then((maskOk) => {
      if (!maskOk) return; // mask fetch failed: keep the server arrows
      try { buildSmoothArrows(); applySmoothArrows(); } catch (e) { console.warn('smooth arrows', e); }
    });
  }

  /* ---------- pirate waters (danger zones) ---------- */
  let dangerZones = null;
  const INTENSITY_WORDS = { 1: 'Perilous', 2: 'Very perilous', 3: 'Most perilous' };

  function dangerFC(D) {
    return {
      type: 'FeatureCollection',
      features: (dangerZones || []).filter((z) => z.decade === D).map((z) => ({
        type: 'Feature',
        properties: { name: z.name, intensity: z.intensity, note: z.note, op: 0.07 * z.intensity },
        geometry: { type: 'Polygon', coordinates: [z.polygon] },
      })),
    };
  }

  function addDanger(zones) {
    dangerZones = zones;
    map.addSource('ov-danger', { type: 'geojson', data: dangerFC(decade()) });
    map.addLayer({
      id: 'ov-danger-fill', type: 'fill', source: 'ov-danger',
      layout: { visibility: vis('danger') },
      paint: { 'fill-color': DANGER_C, 'fill-opacity': ['get', 'op'] },
    });
    map.addLayer({
      id: 'ov-danger-line', type: 'line', source: 'ov-danger',
      layout: { visibility: vis('danger') },
      paint: { 'line-color': DANGER_C, 'line-opacity': 0.4, 'line-width': 1, 'line-dasharray': [3, 2] },
    });
    map.on('mousemove', 'ov-danger-fill', (e) => {
      const p = e.features[0].properties;
      carta.showCard(`<h3>${p.name}</h3>
        <div class="meta" style="color:${DANGER_C}">${INTENSITY_WORDS[p.intensity] || 'Perilous'} waters · anno ${decade()}</div>
        <p>${p.note || ''}</p>`);
    });
    map.on('mouseleave', 'ov-danger-fill', () => carta.hideCard());
  }

  /* ---------- men-of-war (fleet stations) ---------- */
  let stations = null;
  let fleetMarkers = [];
  const NATION_TO_EMPIRE = {
    'england': 'England', 'great britain': 'England',
    'dutch republic': 'Netherlands', 'ottoman empire': 'Ottoman',
    'spain': 'Spain', 'france': 'France', 'portugal': 'Portugal', 'morocco': 'Morocco',
  };
  function nationColor(nation) {
    const emp = NATION_TO_EMPIRE[(nation || '').toLowerCase()];
    return (emp && empireColors[emp]) || MADDER;
  }
  function fleetCardHTML(s) {
    return `<h3>${s.station}</h3>
      <div class="meta">${s.nation} · anno ${s.decade}</div>
      <p>${s.ships} men-of-war${s.flagship ? ` · flagship <i>${s.flagship}</i>` : ''}.</p>
      <p>${s.note || ''}</p>`;
  }

  function renderFleets() {
    // Close the card if it belongs to a marker we're about to destroy.
    if (fleetMarkers.some((f) => f.el.matches(':hover'))) carta.hideCard();
    for (const f of fleetMarkers) f.m.remove();
    fleetMarkers = [];
    if (!stations || !state.on.fleets) return;
    const D = decade();
    for (const s of stations) {
      if (s.decade !== D) continue;
      const el = document.createElement('div');
      el.className = 'ov-fleet';
      el.innerHTML = manOfWarSVG(nationColor(s.nation));
      el.addEventListener('mouseenter', () => carta.showCard(fleetCardHTML(s)));
      el.addEventListener('mouseleave', () => carta.hideCard());
      const m = new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map);
      fleetMarkers.push({ m, el, s });
    }
    dedupFleets();
  }

  // If two stations crowd within 24 px, the larger squadron keeps the water.
  function dedupFleets() {
    if (!fleetMarkers.length) return;
    const c = map.getCenter().lng;
    const proj = (lon, lat) => {
      while (lon - c > 180) lon -= 360;
      while (lon - c < -180) lon += 360;
      return map.project([lon, lat]);
    };
    const pts = fleetMarkers.map((f) => ({ f, pt: proj(f.s.lon, f.s.lat) }));
    pts.sort((a, b) => b.f.s.ships - a.f.s.ships);
    const kept = [];
    for (const p of pts) {
      let hide = false;
      for (const k of kept) {
        const dx = p.pt.x - k.x, dy = p.pt.y - k.y;
        if (dx * dx + dy * dy < 24 * 24) { hide = true; break; }
      }
      p.f.el.style.display = hide ? 'none' : '';
      if (!hide) kept.push(p.pt);
    }
  }
  map.on('moveend', dedupFleets);

  /* ---------- decade reactivity ---------- */
  // The year ticks every frame while the slider runs; all our consumers are
  // decade-grained, so skip the work until the decade actually changes.
  let lastDecade = decade();
  if (window.cartaTime) {
    window.cartaTime.on(() => {
      const D = decade();
      if (D === lastDecade) return;
      lastDecade = D;
      if (map.getLayer('ov-kingdoms-fill')) {
        map.setFilter('ov-kingdoms-fill', kingdomFilter(D));
        map.setFilter('ov-kingdoms-line', kingdomFilter(D));
      }
      const ds = map.getSource('ov-danger');
      if (ds && dangerZones) ds.setData(dangerFC(D));
      renderFleets();
    });
  }

  /* ---------- data loading (each fails independently) ---------- */
  const ok = (r) => { if (!r.ok) throw new Error(r.status); return r.json(); };
  fetch('/data/overlays/kingdoms.json').then(ok).then(addKingdoms)
    .catch(() => disableRow('kingdoms'));
  fetch('/api/wind').then(ok).then(addWind)
    .catch(() => disableRow('winds'));
  fetch('/api/currents').then(ok).then(addCurrents)
    .catch(() => disableRow('currents'));
  fetch('/data/overlays/fleets.json').then(ok).then((d) => { stations = d.stations || []; renderFleets(); })
    .catch(() => disableRow('fleets'));
  fetch('/data/overlays/danger.json').then(ok).then((d) => addDanger(d.zones || []))
    .catch(() => disableRow('danger'));
});
