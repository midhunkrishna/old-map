/* Carta Temporum — harbor plans module (close-zoom streets, forts, ships).
   Registered via window.cartaInits; receives the shared `carta` surface. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function initHarbors(carta) {
  const map = carta.map;
  const IDS = ['nassau', 'port-royal', 'tortuga', 'havana', 'charleston',
    'cartagena', 'bridgetown', 'batavia'];
  // The roads multiplier: each harbour's anchorage fills out to roughly this
  // × the charted ship count, the extras being small craft placed around the
  // charted marks (3D diorama only — the engraved chart stays as surveyed).
  const ROADS_SHIPS_MULT = 1.8;

  const { SEA, INK, INK_SOFT, MADDER, MADDER_D: MADDER_DEEP, PAPER } = carta.COLORS;
  const LAND = '#ddc89f', SHOAL = '#d9c69e'; // harbor-plan pigments, used nowhere else

  /* ---------- styles ---------- */
  const styleEl = document.createElement('style');
  styleEl.textContent = `
.hb-m { width: 0; height: 0; }
.hb-m .hb-icon {
  position: absolute; left: 0; top: 0; display: flex; cursor: pointer;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 0 2px rgba(240,228,200,0.9));
}
.hb-m .hb-icon svg { display: block; }
.hb-m .hb-name {
  position: absolute; left: 0; top: 9px; transform: translateX(-50%);
  font-family: 'IM Fell English', serif; font-size: 11px; color: ${INK};
  white-space: nowrap; cursor: pointer;
  text-shadow: 0 0 3px ${SEA}, 0 0 4px ${SEA};
}
.hb-m:hover .hb-name { text-decoration: underline; }
.hb-m .hb-area {
  position: absolute; left: 0; top: 0; transform: translate(-50%, -50%);
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 12.5px;
  letter-spacing: 2px; color: rgba(75, 60, 38, 0.85); white-space: nowrap;
  pointer-events: none; text-shadow: 0 0 3px ${SEA}, 0 0 4px ${SEA};
}
#hb-scroll {
  position: fixed; left: 50%; top: 34px; transform: translateX(-50%);
  z-index: 12; max-width: 540px; box-sizing: border-box; padding: 7px 26px 8px;
  text-align: center; pointer-events: none; color: ${INK};
  background:
    radial-gradient(ellipse at 30% 0%, rgba(255,250,230,0.55), transparent 65%),
    ${PAPER};
  border: 2px solid ${INK}; outline: 1px solid ${INK}; outline-offset: 3px;
  box-shadow: 5px 7px 18px rgba(35,25,12,0.35);
  opacity: 0; transition: opacity 0.6s ease;
}
#hb-scroll.hb-on { opacity: 1; }
#hb-scroll .hb-t {
  font-family: 'IM Fell English SC', 'IM Fell English', serif;
  font-size: 16px; letter-spacing: 1.6px; line-height: 1.25;
}
#hb-scroll .hb-s {
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 10px;
  color: ${INK_SOFT}; margin-top: 2px; line-height: 1.35;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
#hb-scroll .hb-view {
  display: none; pointer-events: auto; cursor: pointer; margin: 7px auto 0;
  font-family: 'IM Fell English SC', 'IM Fell English', serif;
  font-size: 12px; letter-spacing: 1.2px; color: ${INK};
  padding: 4px 16px 5px; background: rgba(255,250,230,0.6);
  border: 1.5px solid ${INK}; outline: 1px solid ${INK}; outline-offset: 2px;
}
#hb-scroll.hb-view-on .hb-view { display: inline-block; }
#hb-scroll .hb-view:hover { background: rgba(255,250,230,0.95); }
.hb-m .hb-ripple {
  position: absolute; left: 0; top: 0; width: 36px; height: 22px;
  transform: translate(-50%, -50%); border: 1px solid rgba(61,47,30,0.28);
  border-radius: 50%; pointer-events: none;
}
.hb-m .hb-ripple::after {
  content: ''; position: absolute; inset: 4px;
  border: 1px solid rgba(61,47,30,0.16); border-radius: 50%;
}
.hb-m.hb-close .hb-icon svg { transform: scale(1.22); }
.hb-m .hb-street {
  position: absolute; left: 0; top: 0;
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 10.5px;
  letter-spacing: 1.4px; color: rgba(75,60,38,0.92); white-space: nowrap;
  pointer-events: none; text-shadow: 0 0 3px ${LAND}, 0 0 4px ${LAND};
}
.hb-m .hb-rose { position: absolute; left: 0; top: 0; transform: translate(-50%,-50%); opacity: 0.7; pointer-events: none; }
.hb-m .hb-rose svg { display: block; }
.hb-m .hb-scalebar { position: absolute; left: 0; top: 0; transform: translate(-50%,-50%); color: ${INK}; pointer-events: none; }
.hb-m .hb-scalebar .sb-bar { display: flex; height: 5px; border: 1px solid ${INK}; background: ${PAPER}; box-sizing: border-box; }
.hb-m .hb-scalebar .sb-seg { flex: 1; }
.hb-m .hb-scalebar .sb-seg.f { background: ${INK}; }
.hb-m .hb-scalebar .sb-cap {
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 9.5px;
  text-align: center; margin-top: 2px; white-space: nowrap;
  text-shadow: 0 0 3px ${SEA}, 0 0 4px ${SEA};
}
`;
  document.head.appendChild(styleEl);

  /* ---------- glyphs ---------- */
  function shipSVG(type, heading) {
    // Top-down engraved vessel, bow pointing up (heading 0 = north).
    if (window.cartaIcons) return window.cartaIcons.harborShip(type);
    const masts = { canoe: 0, sloop: 1, brigantine: 2, merchantman: 3, 'man-of-war': 3 }[type] || 1;
    const h = { canoe: 15, sloop: 20, brigantine: 22, merchantman: 24, 'man-of-war': 27 }[type] || 20;
    const w = Math.round(h * 0.62);
    if (type === 'canoe') {
      return `<svg width="${w}" height="${h}" viewBox="0 0 24 36">
        <path d="M12 4 C14.2 12 14.2 24 12 32 C9.8 24 9.8 12 12 4 Z"
          fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/>
        <path d="M10.6 13 H13.4 M10.4 18 H13.6 M10.6 23 H13.4" stroke="${INK}" stroke-width="1.1"/>
      </svg>`;
    }
    const ys = masts === 1 ? [17] : masts === 2 ? [13.5, 22.5] : [11.5, 18, 25];
    const yardW = type === 'man-of-war' ? 8.6 : type === 'merchantman' ? 7.4 : 6.4;
    let rig = `<path d="M12 4 L12 0.8" stroke="${INK}" stroke-width="1.2"/>`;
    for (const y of ys) {
      rig += `<path d="M${12 - yardW} ${y} H${12 + yardW}" stroke="${INK}" stroke-width="1.5"/>
        <circle cx="12" cy="${y}" r="1.5" fill="${INK}"/>`;
    }
    const gunwale = type === 'man-of-war'
      ? `<path d="M9.3 9 C8.3 14 8.2 24 9.4 29 M14.7 9 C15.7 14 15.8 24 14.6 29"
          stroke="${INK_SOFT}" stroke-width="0.8" fill="none"/>` : '';
    return `<svg width="${w}" height="${h}" viewBox="0 0 24 36">
      <path d="M12 4 C16 8.5 16.8 13.5 16.8 19.5 L16.8 27 C16.8 31 14.8 32.8 12 32.8
        C9.2 32.8 7.2 31 7.2 27 L7.2 19.5 C7.2 13.5 8 8.5 12 4 Z"
        fill="${PAPER}" stroke="${INK}" stroke-width="1.5"/>
      ${gunwale}${rig}
    </svg>`;
  }
  function batterySVG() {
    if (window.cartaIcons) return window.cartaIcons.battery();
    return `<svg width="18" height="13" viewBox="0 0 18 13">
      <path d="M2.2 4.6 L13.5 6.6 L13.1 8.8 L1.8 6.8 Z" fill="${INK}"/>
      <path d="M13.2 5.2 L16 5.9" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="6.5" cy="9.6" r="2.6" fill="${PAPER}" stroke="${INK}" stroke-width="1.1"/>
      <path d="M6.5 7.4 V11.8 M4.4 9.6 H8.6" stroke="${INK}" stroke-width="0.8"/>
    </svg>`;
  }
  function churchSVG() {
    if (window.cartaIcons) return window.cartaIcons.church();
    return `<svg width="13" height="17" viewBox="0 0 13 17">
      <path d="M6.5 1 V4.4 M4.9 2.6 H8.1" stroke="${INK}" stroke-width="1.1"/>
      <path d="M3.4 8.2 L6.5 4.6 L9.6 8.2 Z" fill="${INK}"/>
      <path d="M3.9 8.2 H9.1 V15.6 H3.9 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>
      <path d="M6.5 15.6 V12.4 M5 10 H8" stroke="${INK}" stroke-width="0.9"/>
    </svg>`;
  }
  function buildingSVG() {
    if (window.cartaIcons) return window.cartaIcons.building();
    return `<svg width="11" height="11" viewBox="0 0 11 11">
      <path d="M2 4.4 H9 V9.6 H2 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>
      <path d="M1.2 4.6 L5.5 1.4 L9.8 4.6" fill="none" stroke="${INK}" stroke-width="1.2"/>
    </svg>`;
  }
  function gallowsSVG() {
    if (window.cartaIcons) return window.cartaIcons.gallows();
    return `<svg width="15" height="17" viewBox="0 0 15 17">
      <g stroke="${MADDER_DEEP}" fill="none" stroke-width="1.4" stroke-linecap="round">
        <path d="M3.5 15.8 V2 H11"/>
        <path d="M3.5 5.5 L7 2"/>
        <path d="M10.2 2 V6"/>
      </g>
      <circle cx="10.2" cy="7.4" r="1.5" fill="none" stroke="${MADDER_DEEP}" stroke-width="1.2"/>
      <path d="M1.6 15.8 H7" stroke="${MADDER_DEEP}" stroke-width="1.2"/>
    </svg>`;
  }

  /* ---------- load & assemble ---------- */
  const PT_KINDS = ['battery', 'church', 'building', 'gallows', 'ship', 'label'];
  const markers = []; // { el, iconEl, nameEl, kind, lngLat, yearBuilt, yearDestroyed }
  const blanketBoxes = []; // { id, title, basis, w, s, e, n } (un-margined land bbox)
  const ships3d = []; // { lngLat, heading, type, harbor } for the living harbour
  const yearOf = () => (window.cartaTime ? window.cartaTime.year : 1730);

  Promise.all(IDS.map((id) =>
    fetch('/data/harbors/' + id + '.json')
      .then((r) => { if (!r.ok) throw new Error(id); return r.json(); })
      .catch(() => null)))
    .then((plans) => setup(plans.filter(Boolean)))
    .catch((e) => console.error('harbors init', e));

  function setup(plans) {
    if (!plans.length) return;
    carta.harborPlans = {};
    const byKind = {}; // kind -> features (non-point, layer-rendered)
    const blankets = [];
    // Footprints & points for the living harbour's 3D town (harbor3d.js).
    const structures = { blocks: [], forts: [], points: [], streets: [], greens: [], canals: [], wharves: [], lands: [] };

    for (const plan of plans) {
      const id = (plan.properties && plan.properties.id) || 'harbor';
      carta.harborPlans[id] = plan;
      const title = (plan.properties && plan.properties.title) || id;

      // Land bbox + 15% margin → blanket polygon hiding the coarse NE coast.
      let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
      for (const f of plan.features) {
        if (f.properties.kind !== 'land') continue;
        for (const ring of f.geometry.coordinates) {
          for (const [x, y] of ring) {
            if (x < w) w = x; if (x > e) e = x;
            if (y < s) s = y; if (y > n) n = y;
          }
        }
      }
      if (w <= e) {
        const mx = (e - w) * 0.15, my = (n - s) * 0.15;
        blanketBoxes.push({
          id, title, basis: (plan.properties && plan.properties.survey_basis) || '',
          w: w - mx, s: s - my, e: e + mx, n: n + my,
        });
        blankets.push({
          type: 'Feature', properties: { harbor: id },
          geometry: {
            type: 'Polygon',
            coordinates: [[[w - mx, s - my], [e + mx, s - my], [e + mx, n + my], [w - mx, n + my], [w - mx, s - my]]],
          },
        });
      }

      const chartedShips = []; // this plan's surveyed marks, seeds for the roads
      for (const f of plan.features) {
        const k = f.properties.kind;
        f.properties.harbor = id;
        if (k === 'street' && f.properties.name) makeStreetLabel(f);
        if (k === 'ship') {
          const entry = {
            lngLat: f.geometry.coordinates,
            heading: f.properties.heading || 0,
            type: f.properties.type || 'sloop',
            harbor: id,
          };
          ships3d.push(entry);
          chartedShips.push(entry);
        }
        if (k === 'church' || k === 'building' || k === 'battery' || k === 'gallows') {
          structures.points.push({ kind: k, lngLat: f.geometry.coordinates, harbor: id });
        }
        if (k === 'block') structures.blocks.push(f);
        if (k === 'fort') structures.forts.push(f);
        if (k === 'street') structures.streets.push(f);
        if (k === 'green') structures.greens.push(f);
        if (k === 'canal') structures.canals.push(f);
        if (k === 'wharf') structures.wharves.push(f);
        if (k === 'land') structures.lands.push(f);
        if (PT_KINDS.includes(k)) { makeMarker(f, title); continue; }
        (byKind[k] = byKind[k] || []).push(f);
      }
      addRoadsVessels(plan, id, chartedShips);
      const box = blanketBoxes.find((b) => b.id === id);
      if (box) placeFurniture(plan, box);
    }

    addLayers(byKind, blankets);
    // Shared with the Part B modules (shader water, living harbour).
    carta.harborBoxes = blanketBoxes;
    carta.harborShips = ships3d;
    carta.harborStructures = structures;
    carta.bus.emit('harbors-ready');
    // The flat engraved plan + extrusion slabs + marks are the in-map preview;
    // the full town now lives in the standalone diorama (harbordiorama.js) on
    // its own canvas, so nothing on the map needs to stand down for it.
    window.cartaTime && window.cartaTime.on(() => { applyYearFilters(); updateMarkers(); });
    map.on('zoom', updateMarkers);
    map.on('move', updateScroll);
    carta.declutterProviders.push(declutterProvider);
    updateMarkers();
    updateScroll();
  }

  /* ---------- layers ---------- */
  const FILTERED_LAYERS = [];
  const yearFilter = () => ['all',
    ['<=', ['coalesce', ['get', 'year_built'], 0], yearOf()],
    ['>', ['coalesce', ['get', 'year_destroyed'], 99999], yearOf()]];
  const ramp = (v) => ['interpolate', ['linear'], ['zoom'], 8.8, 0, 9.6, v];
  // Reveal choreography: the ink draws in first (ramp), the color washes
  // follow half a zoom later — the plan inks itself, then takes its tints.
  const rampWash = (v) => ['interpolate', ['linear'], ['zoom'], 9.4, 0, 10.2, v];

  // Engraved patterns, canvas-generated like app.js's land-hatch.
  function makePattern(name, size, draw) {
    if (map.hasImage(name)) return;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d');
    draw(x, size);
    map.addImage(name, x.getImageData(0, 0, size, size), { pixelRatio: 2 });
  }

  function addLayers(byKind, blankets) {
    makePattern('hb-stipple', 48, (x, s) => {
      x.fillStyle = 'rgba(91,70,54,0.5)';
      for (let i = 0; i < 46; i++) {
        x.beginPath();
        x.arc(Math.random() * s, Math.random() * s, 0.5 + Math.random() * 0.5, 0, Math.PI * 2);
        x.fill();
      }
    });
    makePattern('hb-hatch', 24, (x, s) => {
      x.strokeStyle = 'rgba(61,47,30,0.30)';
      x.lineWidth = 0.8;
      for (let d = -s; d < s * 2; d += 6) {
        x.beginPath();
        x.moveTo(d, s);
        x.lineTo(d + s, 0);
        x.stroke();
      }
    });

    const fc = (feats) => ({ type: 'FeatureCollection', features: feats || [] });
    map.addSource('hb-blanket', { type: 'geojson', data: fc(blankets) });
    for (const k of ['land', 'shoal', 'green', 'block', 'canal', 'street', 'wharf', 'fort']) {
      map.addSource('hb-' + k, { type: 'geojson', data: fc(byKind[k]) });
    }
    const add = (def) => {
      def.minzoom = 8.8;
      if (def.source !== 'hb-blanket') { def.filter = yearFilter(); FILTERED_LAYERS.push(def.id); }
      map.addLayer(def, 'iso-lines');
    };

    add({
      id: 'hb-blanket', type: 'fill', source: 'hb-blanket',
      paint: { 'fill-color': SEA, 'fill-opacity': ramp(1) },
    });
    add({
      id: 'hb-blanket-edge', type: 'line', source: 'hb-blanket',
      paint: {
        'line-color': SEA, 'line-width': 56, 'line-blur': 48,
        'line-opacity': ramp(0.92),
      },
    });
    // Water-lining: concentric ink lines standing off the coast, each fainter.
    // line-gap-width draws both sides; the land fill above hides the inshore one.
    [7, 14, 22].forEach((gap, i) => add({
      id: 'hb-waterline-' + i, type: 'line', source: 'hb-land',
      paint: {
        'line-color': INK, 'line-width': 1, 'line-gap-width': gap,
        'line-opacity': ramp([0.42, 0.26, 0.15][i]),
      },
    }));
    add({
      id: 'hb-land', type: 'fill', source: 'hb-land',
      paint: { 'fill-color': LAND, 'fill-opacity': ramp(1) },
    });
    add({
      id: 'hb-land-hatch', type: 'fill', source: 'hb-land',
      paint: { 'fill-pattern': 'land-hatch', 'fill-opacity': ramp(0.9) },
    });
    add({
      id: 'hb-land-line', type: 'line', source: 'hb-land',
      paint: { 'line-color': INK, 'line-width': 1.2, 'line-opacity': ramp(1) },
    });
    add({
      id: 'hb-shoal', type: 'fill', source: 'hb-shoal',
      paint: { 'fill-color': SHOAL, 'fill-opacity': rampWash(0.55) },
    });
    add({
      id: 'hb-shoal-stipple', type: 'fill', source: 'hb-shoal',
      paint: { 'fill-pattern': 'hb-stipple', 'fill-opacity': rampWash(0.6) },
    });
    add({
      id: 'hb-shoal-line', type: 'line', source: 'hb-shoal',
      paint: {
        'line-color': MADDER, 'line-width': 1, 'line-dasharray': [0.4, 1.8],
        'line-opacity': ramp(0.75),
      },
    });
    add({
      id: 'hb-green', type: 'fill', source: 'hb-green',
      paint: { 'fill-color': '#a8b08a', 'fill-opacity': rampWash(0.5) },
    });
    // Blocks cast the conventional engraved shadow to the south-east: a dark
    // outline nudged 1px in viewport space, drawn under the block fill.
    add({
      id: 'hb-block-shadow', type: 'line', source: 'hb-block',
      paint: {
        'line-color': INK, 'line-width': 1.1, 'line-opacity': rampWash(0.4),
        'line-translate': [1.2, 1.2], 'line-translate-anchor': 'viewport',
      },
    });
    add({
      id: 'hb-block', type: 'fill', source: 'hb-block',
      paint: { 'fill-color': '#c2a182', 'fill-opacity': rampWash(0.72) },
    });
    add({
      id: 'hb-block-hatch', type: 'fill', source: 'hb-block',
      paint: { 'fill-pattern': 'hb-hatch', 'fill-opacity': rampWash(0.55) },
    });
    add({
      id: 'hb-block-line', type: 'line', source: 'hb-block',
      paint: { 'line-color': INK_SOFT, 'line-width': 0.8, 'line-opacity': ramp(0.8) },
    });
    add({
      id: 'hb-canal-casing', type: 'line', source: 'hb-canal',
      paint: {
        'line-color': INK,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3.1, 14, 7.8],
        'line-opacity': ramp(0.85),
      },
    });
    add({
      id: 'hb-canal', type: 'line', source: 'hb-canal',
      paint: {
        'line-color': SEA,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1.5, 14, 6],
        'line-opacity': ramp(1),
      },
    });
    add({
      id: 'hb-street', type: 'line', source: 'hb-street',
      paint: {
        'line-color': INK_SOFT,
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 14, 2.4],
        'line-opacity': ramp(0.6),
      },
    });
    add({
      id: 'hb-wharf', type: 'line', source: 'hb-wharf',
      paint: { 'line-color': INK, 'line-width': 2.5, 'line-opacity': ramp(0.9) },
    });
    add({
      id: 'hb-fort', type: 'fill', source: 'hb-fort',
      paint: { 'fill-color': MADDER, 'fill-opacity': rampWash(0.3) },
    });
    // The forts anchor a period plan: a bold double outline.
    add({
      id: 'hb-fort-line', type: 'line', source: 'hb-fort',
      layout: { 'line-join': 'bevel' },
      paint: { 'line-color': MADDER, 'line-width': 2, 'line-opacity': ramp(1) },
    });
    add({
      id: 'hb-fort-line-outer', type: 'line', source: 'hb-fort',
      layout: { 'line-join': 'bevel' },
      paint: {
        'line-color': MADDER, 'line-width': 0.7, 'line-gap-width': 4.5,
        'line-opacity': ramp(0.85),
      },
    });

    // Rung 1 — the paper diorama (tier ≥ 2 only; demotes silently on failure).
    if (((carta.gfx && carta.gfx.tier) || 0) >= 2) {
      try {
        add({
          id: 'hb-block-3d', type: 'fill-extrusion', source: 'hb-block',
          paint: {
            'fill-extrusion-color': '#c9ad8b',
            'fill-extrusion-height': 9,
            'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 11.4, 0, 12.2, 0.85],
          },
        });
        add({
          id: 'hb-fort-3d', type: 'fill-extrusion', source: 'hb-fort',
          paint: {
            'fill-extrusion-color': '#b38a74',
            'fill-extrusion-height': 6,
            'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 11.4, 0, 12.2, 0.8],
          },
        });
      } catch (e) {
        console.warn('harbors: extrusions unavailable, staying flat', e);
        for (const id of ['hb-block-3d', 'hb-fort-3d']) if (map.getLayer(id)) map.removeLayer(id);
      }
    }
  }

  function applyYearFilters() {
    for (const id of FILTERED_LAYERS) {
      if (map.getLayer(id)) map.setFilter(id, yearFilter());
    }
  }

  /* ---------- DOM markers ---------- */
  const KIND_NAMES = {
    battery: 'Battery', church: 'Church', building: 'Building', gallows: 'Gallows',
  };
  const SHIP_NAMES = {
    canoe: 'Canoe', sloop: 'Sloop', brigantine: 'Brigantine',
    merchantman: 'Merchantman', 'man-of-war': 'Man-of-war',
  };

  function makeMarker(f, harborTitle) {
    const p = f.properties, kind = p.kind;
    const ll = f.geometry.coordinates;
    const el = document.createElement('div');
    el.className = 'hb-m hb-k-' + kind;
    el.style.display = 'none';
    let iconEl = null, nameEl = null;

    if (kind === 'label') {
      nameEl = document.createElement('span');
      nameEl.className = 'hb-area';
      nameEl.textContent = p.name || '';
      el.appendChild(nameEl);
    } else {
      iconEl = document.createElement('span');
      iconEl.className = 'hb-icon';
      if (kind === 'ship') {
        const rip = document.createElement('span');
        rip.className = 'hb-ripple';
        el.appendChild(rip); // the water stirs beneath her
        iconEl.innerHTML = shipSVG(p.type || 'sloop');
        iconEl.style.transform = `translate(-50%,-50%) rotate(${p.heading || 0}deg)`;
      } else {
        iconEl.innerHTML = kind === 'battery' ? batterySVG()
          : kind === 'church' ? churchSVG()
          : kind === 'gallows' ? gallowsSVG() : buildingSVG();
      }
      el.appendChild(iconEl);
      if (kind !== 'ship' && p.name) {
        nameEl = document.createElement('span');
        nameEl.className = 'hb-name';
        nameEl.textContent = p.name;
        el.appendChild(nameEl);
      }
      el.addEventListener('mouseenter', () => carta.showCard(cardHTML(p, harborTitle)));
      el.addEventListener('mouseleave', carta.hideCard);
    }

    new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(ll).addTo(map);
    markers.push({
      el, nameEl, kind, lngLat: ll,
      yearBuilt: p.year_built || 0,
      yearDestroyed: p.year_destroyed || Infinity,
    });
  }

  function cardHTML(p, harborTitle) {
    if (p.kind === 'ship') {
      const t = SHIP_NAMES[p.type] || 'Sloop';
      return `<h3>${t} at anchor</h3>
        <div class="meta">${harborTitle}</div>
        <p>${p.note || p.name || ''}</p>`;
    }
    const guns = p.guns ? `<p><em>A battery of ${p.guns} guns.</em></p>` : '';
    return `<h3>${p.name || KIND_NAMES[p.kind] || ''}</h3>
      <div class="meta">${KIND_NAMES[p.kind] || 'Place'} · ${harborTitle}</div>
      ${guns}${p.note ? `<p>${p.note}</p>` : ''}`;
  }

  /* ---------- street names ----------
     Every street in the data carries a name; set it along the street's
     middle segment, rotated to the road, in the chart's own hand (PBF glyph
     fonts cannot serve IM Fell, so these are DOM labels, not a symbol layer). */
  function makeStreetLabel(f) {
    const cs = f.geometry.coordinates;
    if (!cs || cs.length < 2) return;
    const mi = Math.max(1, Math.floor(cs.length / 2));
    const a = cs[mi - 1], b = cs[mi];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const cosLat = Math.cos(mid[1] * Math.PI / 180);
    let ang = -Math.atan2(b[1] - a[1], (b[0] - a[0]) * cosLat) * 180 / Math.PI;
    if (ang > 90) ang -= 180; else if (ang < -90) ang += 180; // never read upside-down
    const el = document.createElement('div');
    el.className = 'hb-m hb-k-street';
    el.style.display = 'none';
    const nameEl = document.createElement('span');
    nameEl.className = 'hb-street';
    nameEl.textContent = f.properties.name;
    nameEl.style.transform = `translate(-50%,-50%) rotate(${ang.toFixed(1)}deg)`;
    el.appendChild(nameEl);
    new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(mid).addTo(map);
    markers.push({
      el, nameEl, kind: 'street', lngLat: mid,
      yearBuilt: f.properties.year_built || 0,
      yearDestroyed: f.properties.year_destroyed || Infinity,
    });
  }

  /* ---------- chart furniture: compass rose & scale of one mile ----------
     Placed in open water — blanket corners tested against the land rings. */
  function landRings(plan) {
    const rings = [];
    for (const f of plan.features) {
      if (f.properties.kind !== 'land') continue;
      const g = f.geometry;
      if (g.type === 'Polygon') rings.push(g.coordinates[0]);
      else if (g.type === 'MultiPolygon') for (const p of g.coordinates) rings.push(p[0]);
    }
    return rings;
  }
  function inRing(lon, lat, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1], xj = ring[j][0], yj = ring[j][1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  /* ---------- the crowded roads: extra vessels riding at anchor ----------
     The chart marks only the notable ships; the living harbour fills the
     anchorage out to ~ROADS_SHIPS_MULT× with small craft — sloops, fishing
     boats, the odd brigantine or trader — clustered about the charted marks.
     Placement is deterministic (FNV hash of the harbour id), kept off the
     land and shoal rings, spaced for swinging room, headings loosely on the
     same tide as the parent mark. These join carta.harborShips for the
     diorama only; no engraved marker is made for them. */
  function hash01(id, n) {
    let h = 2166136261;
    for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
    h = Math.imul(h ^ (n + 1), 2654435761);
    h ^= h >>> 13; h = Math.imul(h, 1274126177); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  const ROADS_TYPES = ['sloop', 'sloop', 'sloop', 'canoe', 'brigantine', 'brigantine', 'merchantman'];
  function addRoadsVessels(plan, id, charted) {
    const anchors = charted.filter((s) => s.type !== 'canoe');
    if (!anchors.length) return;
    const solid = []; // land + shoal rings — anywhere a hull cannot swing
    for (const f of plan.features) {
      const k = f.properties.kind;
      if (k !== 'land' && k !== 'shoal') continue;
      const g = f.geometry;
      if (g.type === 'Polygon') solid.push(g.coordinates[0]);
      else if (g.type === 'MultiPolygon') for (const p of g.coordinates) solid.push(p[0]);
    }
    const mLng = 111320 * Math.cos(anchors[0].lngLat[1] * Math.PI / 180);
    const placed = charted.map((s) => s.lngLat);
    // lively, not crowded: the roads fill toward the multiplier but the whole
    // harbour is capped at 13 hulls, charted marks included
    const want = Math.min(
      Math.round(charted.length * (ROADS_SHIPS_MULT - 1)),
      Math.max(0, 13 - charted.length));
    let made = 0;
    for (let k = 0; made < want && k < want * 8; k++) {
      const b = k * 5;
      const parent = anchors[(hash01(id, b) * anchors.length) | 0];
      // 45–180 m off a charted mark: the longer throws (with the land/shoal
      // check rejecting anything inshore) spread the extras toward the outer
      // road instead of packing the inner anchorage
      const dist = 45 + hash01(id, b + 1) * 135;
      const ang = hash01(id, b + 2) * Math.PI * 2;
      const lng = parent.lngLat[0] + (dist * Math.sin(ang)) / mLng;
      const lat = parent.lngLat[1] + (dist * Math.cos(ang)) / 111320;
      if (solid.some((r) => inRing(lng, lat, r))) continue;   // she must stay afloat
      if (placed.some(([px, py]) => {
        const dx = (lng - px) * mLng, dy = (lat - py) * 111320;
        return dx * dx + dy * dy < 40 * 40;                   // swinging room
      })) continue;
      const type = ROADS_TYPES[(hash01(id, b + 3) * ROADS_TYPES.length) | 0];
      const heading = ((parent.heading + (hash01(id, b + 4) - 0.5) * 40) % 360 + 360) % 360;
      ships3d.push({ lngLat: [lng, lat], heading, type, harbor: id });
      placed.push([lng, lat]);
      made++;
    }
  }

  function placeFurniture(plan, box) {
    const rings = landRings(plan);
    const ix = (box.e - box.w) * 0.16, iy = (box.n - box.s) * 0.16;
    const corners = [ // NE, NW, SE, SW — preference order
      [box.e - ix, box.n - iy], [box.w + ix, box.n - iy],
      [box.e - ix, box.s + iy], [box.w + ix, box.s + iy],
    ];
    const free = corners.filter(([x, y]) => !rings.some((r) => inRing(x, y, r)));
    if (free[0]) makeRose(free[0]);
    if (free[1]) makeScale(free[1]);
  }
  function harborRoseSVG(s) {
    const c = s / 2;
    const star = (rO, rI, n, rot) => {
      let pts = '';
      for (let i = 0; i < n * 2; i++) {
        const r = i % 2 === 0 ? rO : rI;
        const a = (i * Math.PI) / n + rot;
        pts += `${(c + r * Math.sin(a)).toFixed(1)},${(c - r * Math.cos(a)).toFixed(1)} `;
      }
      return pts.trim();
    };
    return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
      <circle cx="${c}" cy="${c}" r="${c - 2}" fill="none" stroke="${INK_SOFT}" stroke-width="0.8"/>
      <circle cx="${c}" cy="${c}" r="${(c * 0.62).toFixed(1)}" fill="none" stroke="${INK_SOFT}" stroke-width="0.5"/>
      <polygon points="${star(c * 0.55, c * 0.11, 8, Math.PI / 8)}" fill="${INK_SOFT}" opacity="0.55"/>
      <polygon points="${star(c - 3, c * 0.15, 8, 0)}" fill="${INK}" opacity="0.85"/>
      <polygon points="${star(c - 3, c * 0.15, 8, 0)}" fill="none" stroke="${PAPER}" stroke-width="0.5"/>
      <text x="${c}" y="8" text-anchor="middle" font-size="8.5" fill="${MADDER_DEEP}" font-family="serif">N</text>
    </svg>`;
  }
  function makeRose(ll) {
    const el = document.createElement('div');
    el.className = 'hb-m';
    el.style.display = 'none';
    el.innerHTML = `<span class="hb-rose">${harborRoseSVG(64)}</span>`;
    new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(ll).addTo(map);
    markers.push({ el, nameEl: null, kind: 'rose', lngLat: ll, yearBuilt: 0, yearDestroyed: Infinity });
  }
  function makeScale(ll) {
    const el = document.createElement('div');
    el.className = 'hb-m';
    el.style.display = 'none';
    el.innerHTML = `<span class="hb-scalebar"><span class="sb-bar">
      <span class="sb-seg f"></span><span class="sb-seg"></span><span class="sb-seg f"></span><span class="sb-seg"></span>
    </span><span class="sb-cap">Scale of One Mile</span></span>`;
    new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(ll).addTo(map);
    markers.push({
      el, nameEl: null, kind: 'scale', lngLat: ll,
      barEl: el.querySelector('.sb-bar'),
      yearBuilt: 0, yearDestroyed: Infinity,
    });
  }

  function updateMarkers() {
    const z = map.getZoom(), y = yearOf();
    for (const m of markers) {
      const minZ = m.kind === 'label' ? 9.6
        : m.kind === 'street' ? 12.2
        : (m.kind === 'rose' || m.kind === 'scale') ? 11 : 9.2;
      const on = z >= minZ && m.yearBuilt <= y && y < m.yearDestroyed;
      m.el.style.display = on ? '' : 'none';
      if (m.nameEl && m.kind !== 'label' && m.kind !== 'street') {
        m.nameEl.style.display = z >= 11 ? '' : 'none';
      }
      if (m.kind === 'ship') m.el.classList.toggle('hb-close', z >= 13.2);
      if (m.kind === 'scale' && on && m.barEl) {
        // one statute mile, projected at this latitude and zoom
        const px = (1609.34 / (111320 * Math.cos(m.lngLat[1] * Math.PI / 180)))
          / 360 * 512 * Math.pow(2, z);
        m.barEl.style.width = Math.max(36, Math.min(420, px)).toFixed(0) + 'px';
      }
    }
    carta.requestDeclutter();
  }

  function declutterProvider() {
    const items = [];
    for (const m of markers) {
      if (!m.nameEl || m.el.style.display === 'none'
        || m.nameEl.style.display === 'none') continue;
      const flat = m.kind === 'label' || m.kind === 'street';
      items.push({ el: m.nameEl, lngLat: m.lngLat, dy: flat ? 0 : 9, pr: m.kind === 'street' ? 50 : 70 });
    }
    return items;
  }

  /* ---------- harbor title scroll ---------- */
  const scroll = document.createElement('div');
  scroll.id = 'hb-scroll';
  scroll.innerHTML = '<div class="hb-t"></div><div class="hb-s"></div>'
    + '<button class="hb-view" type="button">View Harbour ⚓</button>';
  document.body.appendChild(scroll);
  let scrollId = null;

  // The rotatable diorama (Rung 3): a "View Harbour" button when over a port,
  // plus an auto-enter once zoomed in close. tier ≥ 3 only.
  const dioOK = () => ((carta.gfx && carta.gfx.tier) || 0) >= 3 && window.cartaDiorama;
  const viewBtn = scroll.querySelector('.hb-view');
  let autoSuppressId = null; // don't auto-reopen the port we just closed until we leave it
  viewBtn.addEventListener('click', () => { if (dioOK() && scrollId) window.cartaDiorama.open(scrollId); });
  carta.bus.on('diorama-closed', () => { autoSuppressId = scrollId; });

  function updateScroll() {
    let hit = null;
    if (map.getZoom() >= 11) {
      const c = map.getCenter();
      for (const b of blanketBoxes) {
        if (c.lng >= b.w && c.lng <= b.e && c.lat >= b.s && c.lat <= b.n) { hit = b; break; }
      }
    }
    if (hit) {
      if (scrollId !== hit.id) {
        scroll.querySelector('.hb-t').textContent = hit.title;
        scroll.querySelector('.hb-s').textContent = hit.basis;
        scrollId = hit.id;
        enterPitch();
      }
      scroll.classList.add('hb-on');
      scroll.classList.toggle('hb-view-on', !!dioOK());
      // Auto-raise the diorama once zoomed in close, unless we just closed it
      // here (the guard clears when the chart pans off this port).
      if (dioOK() && map.getZoom() >= 14 && !window.cartaDiorama.active
        && autoSuppressId !== hit.id) {
        window.cartaDiorama.open(hit.id);
      }
    } else {
      if (scrollId) leavePitch();
      scroll.classList.remove('hb-on', 'hb-view-on');
      scrollId = null;
      autoSuppressId = null;
    }
  }

  /* ---------- Rung 1 camera: the chart lifts off the table ----------
     Entering a charted harbour eases the camera to a diorama tilt; leaving
     lays the chart flat again. Tier ≥ 2 and full motion only — every lower
     tier keeps the plain overhead plan. */
  const tiltOK = () => ((carta.gfx && carta.gfx.tier) || 0) >= 2 && !carta.reducedMotion.matches;
  let tilted = false;
  function enterPitch() {
    if (!tiltOK() || tilted) return;
    tilted = true;
    map.easeTo({ pitch: 52, duration: 1900 });
  }
  function leavePitch() {
    if (!tilted) return;
    tilted = false;
    map.easeTo({ pitch: 0, duration: 1100 });
  }
});
