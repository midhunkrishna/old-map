/* Carta Temporum — harbor plans module (close-zoom streets, forts, ships).
   Registered via window.cartaInits; receives the shared `carta` surface. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function initHarbors(carta) {
  const map = carta.map;
  const IDS = ['nassau', 'port-royal', 'tortuga', 'havana', 'charleston',
    'cartagena', 'bridgetown', 'batavia'];

  const SEA = '#e7d8ba', LAND = '#ddc89f', INK = '#3d2f1e', INK_SOFT = '#5b4636';
  const MADDER = '#8a3b2e', MADDER_DEEP = '#6e1f14', PAPER = '#f0e4c8';
  const SHOAL = '#d9c69e';

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

      for (const f of plan.features) {
        const k = f.properties.kind;
        f.properties.harbor = id;
        if (PT_KINDS.includes(k)) { makeMarker(f, title); continue; }
        (byKind[k] = byKind[k] || []).push(f);
      }
    }

    addLayers(byKind, blankets);
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

  function addLayers(byKind, blankets) {
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
        'line-color': SEA, 'line-width': 34, 'line-blur': 30,
        'line-opacity': ramp(0.85),
      },
    });
    add({
      id: 'hb-land', type: 'fill', source: 'hb-land',
      paint: { 'fill-color': LAND, 'fill-opacity': ramp(1) },
    });
    add({
      id: 'hb-land-line', type: 'line', source: 'hb-land',
      paint: { 'line-color': INK, 'line-width': 1.2, 'line-opacity': ramp(1) },
    });
    add({
      id: 'hb-shoal', type: 'fill', source: 'hb-shoal',
      paint: { 'fill-color': SHOAL, 'fill-opacity': ramp(0.55) },
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
      paint: { 'fill-color': '#a8b08a', 'fill-opacity': ramp(0.5) },
    });
    add({
      id: 'hb-block', type: 'fill', source: 'hb-block',
      paint: { 'fill-color': '#c2a182', 'fill-opacity': ramp(0.55) },
    });
    add({
      id: 'hb-block-line', type: 'line', source: 'hb-block',
      paint: { 'line-color': INK_SOFT, 'line-width': 0.5, 'line-opacity': ramp(0.8) },
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
      paint: { 'fill-color': MADDER, 'fill-opacity': ramp(0.22) },
    });
    add({
      id: 'hb-fort-line', type: 'line', source: 'hb-fort',
      layout: { 'line-join': 'bevel' },
      paint: { 'line-color': MADDER, 'line-width': 1.4, 'line-opacity': ramp(1) },
    });
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

  function updateMarkers() {
    const z = map.getZoom(), y = yearOf();
    for (const m of markers) {
      const minZ = m.kind === 'label' ? 9.6 : 9.2;
      const on = z >= minZ && m.yearBuilt <= y && y < m.yearDestroyed;
      m.el.style.display = on ? '' : 'none';
      if (m.nameEl && m.kind !== 'label') {
        m.nameEl.style.display = z >= 11 ? '' : 'none';
      }
    }
    carta.requestDeclutter();
  }

  function declutterProvider() {
    const items = [];
    for (const m of markers) {
      if (!m.nameEl || m.el.style.display === 'none'
        || m.nameEl.style.display === 'none') continue;
      items.push({ el: m.nameEl, lngLat: m.lngLat, dy: m.kind === 'label' ? 0 : 9, pr: 70 });
    }
    return items;
  }

  /* ---------- harbor title scroll ---------- */
  const scroll = document.createElement('div');
  scroll.id = 'hb-scroll';
  scroll.innerHTML = '<div class="hb-t"></div><div class="hb-s"></div>';
  document.body.appendChild(scroll);
  let scrollId = null;

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
      }
      scroll.classList.add('hb-on');
    } else {
      scroll.classList.remove('hb-on');
      scrollId = null;
    }
  }
});
