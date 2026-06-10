/* Carta Temporum — isochronic chart of the sailing world, anno 1730 */
'use strict';

const SEA = '#e7d8ba';
const INK = '#3d2f1e';
const INK_SOFT = '#5b4636';

// Aged homage to Bartholomew's isochronic palette: madder near home,
// ochre and verdigris in the middle distance, indigo wash at the rim of the world.
const PALETTE = {
  7: '#dca8a1', 14: '#dfb79e', 21: '#dfc49c', 30: '#dccf9e', 45: '#cfcda3',
  60: '#bcc9a5', 90: '#a4c0a8', 120: '#8fb3ab', 150: '#7ea5ab', 180: '#6f95a6',
};
const ROUTE_COLORS = {
  trade: '#6b5a3e', treasure: '#8a3b2e', slave: '#4a4038',
  'east-india': '#46596b', pirate: '#1c1c1c',
};
const ROUTE_KIND_NAMES = {
  trade: 'Merchant road', treasure: 'Treasure road', slave: 'Slaving road',
  'east-india': 'East India road', pirate: 'Pirate cruise',
};

const SEA_LABELS = [
  { t: 'THE WESTERN OCEAN', lon: -40, lat: 36, s: 22 },
  { t: 'THE SPANISH MAIN', lon: -73.5, lat: 13.8, s: 13 },
  { t: 'GULPH OF MEXICO', lon: -91.5, lat: 24.5, s: 13 },
  { t: 'OCEANUS ÆTHIOPICUS', lon: -13, lat: -18, s: 18 },
  { t: 'MARE INDICUM', lon: 76, lat: -12, s: 18 },
  { t: 'MAR PACIFICO', lon: -128, lat: -12, s: 20 },
  { t: 'THE GUINEA COAST', lon: 1.5, lat: 1.8, s: 12 },
  { t: 'THE NORTH SEA', lon: 3.2, lat: 56.2, s: 11 },
  { t: 'THE SARGASSO SEA', lon: -55, lat: 29, s: 12 },
  { t: 'THE CARIBBEE ISLANDS', lon: -61.5, lat: 15.8, s: 10 },
  { t: 'THE BANKS OF NEWFOUNDLAND', lon: -50, lat: 44.3, s: 10 },
  { t: 'BAY OF BENGAL', lon: 87, lat: 13, s: 12 },
  { t: 'THE CHINA SEA', lon: 116, lat: 16.5, s: 12 },
  { t: 'THE RED SEA', lon: 38.5, lat: 20.5, s: 9 },
  { t: 'HUDSON’S BAY', lon: -86.5, lat: 58.5, s: 11 },
  { t: 'THE MOZAMBIQUE CHANNEL', lon: 41.5, lat: -19.5, s: 9 },
];

// Period region names, after the fashion of Moll and Delisle. Land labels
// are upright; sea labels italic — the old convention.
const REGION_LABELS = [
  { t: 'NEW FRANCE', lon: -72, lat: 47.5, s: 13 },
  { t: 'NEW ENGLAND', lon: -71.5, lat: 44.0, s: 11 },
  { t: 'VIRGINIA', lon: -78.8, lat: 37.6, s: 11 },
  { t: 'CAROLINA', lon: -80.8, lat: 34.6, s: 11 },
  { t: 'FLORIDA', lon: -81.6, lat: 28.6, s: 11 },
  { t: 'LOUISIANA', lon: -91.5, lat: 32.5, s: 11 },
  { t: 'NEW SPAIN', lon: -102, lat: 24.5, s: 15 },
  { t: 'CALIFORNIA', lon: -113.5, lat: 28.5, s: 10 },
  { t: 'THE MOSQUITO SHORE', lon: -84.8, lat: 13.9, s: 9 },
  { t: 'TIERRA FIRME', lon: -70, lat: 7.5, s: 12 },
  { t: 'GUIANA', lon: -58.5, lat: 4.5, s: 10 },
  { t: 'PERU', lon: -74.5, lat: -10, s: 13 },
  { t: 'BRAZIL', lon: -51, lat: -10, s: 15 },
  { t: 'CHILI', lon: -70.8, lat: -34.5, s: 11 },
  { t: 'LA PLATA', lon: -61, lat: -33, s: 11 },
  { t: 'PATAGONIA', lon: -68.5, lat: -45, s: 11 },
  { t: 'GREAT BRITAIN', lon: -1.8, lat: 53.6, s: 10 },
  { t: 'IRELAND', lon: -8.2, lat: 53.3, s: 9 },
  { t: 'FRANCE', lon: 2.5, lat: 47.2, s: 11 },
  { t: 'SPAIN', lon: -4, lat: 40.2, s: 11 },
  { t: 'MUSCOVY', lon: 42, lat: 57, s: 13 },
  { t: 'THE OTTOMAN EMPIRE', lon: 33, lat: 39.5, s: 11 },
  { t: 'BARBARY', lon: 2, lat: 32.8, s: 11 },
  { t: 'MOROCCO', lon: -7.5, lat: 31.5, s: 10 },
  { t: 'EGYPT', lon: 30.5, lat: 26.5, s: 10 },
  { t: 'SENEGAMBIA', lon: -12.5, lat: 14.2, s: 9 },
  { t: 'GUINEA', lon: -4, lat: 9, s: 11 },
  { t: 'CONGO', lon: 16, lat: -4, s: 10 },
  { t: 'ANGOLA', lon: 17, lat: -11.5, s: 10 },
  { t: 'ABYSSINIA', lon: 38, lat: 10.5, s: 10 },
  { t: 'ZANGUEBAR', lon: 38.5, lat: -6, s: 9 },
  { t: 'MONOMOTAPA', lon: 30, lat: -19.5, s: 10 },
  { t: 'MADAGASCAR', lon: 46.5, lat: -19.5, s: 10 },
  { t: 'ARABIA FELIX', lon: 46.5, lat: 18.5, s: 10 },
  { t: 'PERSIA', lon: 54, lat: 32, s: 12 },
  { t: 'THE MOGUL’S EMPIRE', lon: 77.5, lat: 24.5, s: 12 },
  { t: 'GREAT TARTARY', lon: 95, lat: 50, s: 14 },
  { t: 'CHINA', lon: 110, lat: 33, s: 14 },
  { t: 'SIAM', lon: 101, lat: 15.5, s: 9 },
  { t: 'SUMATRA', lon: 101.5, lat: -0.5, s: 9 },
  { t: 'JAVA', lon: 110.5, lat: -7.4, s: 9 },
  { t: 'BORNEO', lon: 114, lat: 0.8, s: 9 },
  { t: 'NEW GUINEA', lon: 141, lat: -5.5, s: 10 },
  { t: 'NEW HOLLAND', lon: 132, lat: -25, s: 15 },
  { t: 'JAPAN', lon: 138.5, lat: 36.8, s: 10 },
];

let map, meta, routes, wrecks, portDetails;
let wreckExtra = {}, imageIndex = {};
let portMarkers = [], wreckMarkers = [], decoMarkers = [], detailMarkers = [], isoLabelMarkers = [];
let clusterMarkers = [];
let originMarker = null;
let currentPort = null;
let isoAbort = null;

const $ = (id) => document.getElementById(id);

// Merge-aware hash state: #port=nassau&voyage=p.nassau~p.london&origin=-40,30
// Values are our own simple tokens (no & or =), kept unencoded for legibility.
const cartaHash = {
  read() {
    const out = {};
    for (const part of location.hash.replace(/^#/, '').split('&')) {
      const i = part.indexOf('=');
      if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
    }
    return out;
  },
  write(patch) {
    const h = this.read();
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === '') delete h[k]; else h[k] = v;
    }
    const s = Object.entries(h).map(([k, v]) => `${k}=${v}`).join('&');
    history.replaceState(null, '', s ? '#' + s : location.pathname + location.search);
  },
};

function fmtLL(lon, lat) {
  const L = ((lon + 540) % 360) - 180; // normalize for display
  return `${Math.abs(lat).toFixed(0)}°${lat >= 0 ? 'N' : 'S'} ${Math.abs(L).toFixed(0)}°${L >= 0 ? 'E' : 'W'}`;
}

/* ---------- decorative geometry ---------- */

function graticule(step) {
  const features = [];
  for (let lon = -180; lon <= 180; lon += step) {
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[lon, -80], [lon, 84]] } });
  }
  for (let lat = -80; lat <= 80; lat += step) {
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[-180, lat], [180, lat]] } });
  }
  return { type: 'FeatureCollection', features };
}

function rhumbWeb(centers) {
  const features = [];
  for (const [clon, clat] of centers) {
    for (let k = 0; k < 32; k++) {
      const a = (k * Math.PI) / 16;
      const len = 65;
      let elon = clon + Math.sin(a) * len;
      let elat = clat + Math.cos(a) * len * 0.75;
      elat = Math.max(-78, Math.min(82, elat));
      features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[clon, clat], [elon, elat]] } });
    }
  }
  return { type: 'FeatureCollection', features };
}

/* ---------- svg icons ---------- */

function anchorSVG(size, color) {
  if (window.cartaIcons) return window.cartaIcons.anchor(size, color);
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16">
    <g stroke="${color}" fill="none" stroke-width="1.4" stroke-linecap="round">
      <circle cx="8" cy="3" r="1.7"/><path d="M8 4.7 V13 M4.6 7.6 h6.8 M2.8 9.8 q1.2 3.8 5.2 3.8 q4 0 5.2-3.8"/>
    </g></svg>`;
}
function skullSVG(size) {
  if (window.cartaIcons) return window.cartaIcons.skull(size);
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16">
    <g stroke="#6e1f14" stroke-width="1.5" stroke-linecap="round">
      <path d="M3 12 L13 15 M13 12 L3 15"/></g>
    <circle cx="8" cy="6" r="4.4" fill="#6e1f14"/>
    <circle cx="6.4" cy="5.4" r="1" fill="#f0e4c8"/><circle cx="9.6" cy="5.4" r="1" fill="#f0e4c8"/>
    <rect x="6.6" y="8.2" width="2.8" height="1.6" fill="#f0e4c8" rx="0.5"/></svg>`;
}
function wreckSVG() {
  if (window.cartaIcons) return window.cartaIcons.wreck();
  return `<svg width="20" height="20" viewBox="0 0 20 20">
    <g transform="rotate(14 10 10)" stroke="#6e1f14" fill="none" stroke-width="1.4" stroke-linecap="round">
      <path d="M4 12 Q10 16.5 16 12" /><path d="M4.5 12 H15.5" stroke-width="1"/>
      <path d="M10 12 V4.5"/><path d="M10 6 L14.5 8.5"/><path d="M10 5 L6.5 7" stroke-dasharray="1.5 1.2"/>
    </g>
    <path d="M3 16 q2 1.4 4 0 q2 1.4 4 0 q2 1.4 4 0" stroke="#5b4636" fill="none" stroke-width="1"/></svg>`;
}
function starSVG(size, color) {
  let pts = '';
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 9 : 3.2;
    const a = (i * Math.PI) / 8;
    pts += `${10 + r * Math.sin(a)},${10 - r * Math.cos(a)} `;
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 20 20">
    <polygon points="${pts}" fill="${color}" stroke="#f0e4c8" stroke-width="0.7"/><circle cx="10" cy="10" r="1.6" fill="#f0e4c8"/></svg>`;
}
function roseSVG(size) {
  let pts8 = '', pts8b = '';
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 46 : 9;
    const a = (i * Math.PI) / 8;
    const p = `${50 + r * Math.sin(a)},${50 - r * Math.cos(a)} `;
    if (i % 2 === 0 && (i / 2) % 2 === 0) pts8 += p; else pts8b += p;
  }
  let star = '', star2 = '';
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? 46 : 8;
    const a = (i * Math.PI) / 8 + Math.PI / 8;
    (i % 2 === 0 ? (star += `${50 + r * 0.55 * Math.sin(a)},${50 - r * 0.55 * Math.cos(a)} `) : (star2 += ''));
  }
  return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" opacity="0.6">
    <circle cx="50" cy="50" r="47" fill="none" stroke="${INK_SOFT}" stroke-width="0.8"/>
    <circle cx="50" cy="50" r="40" fill="none" stroke="${INK_SOFT}" stroke-width="0.4"/>
    <polygon points="${makeStar(50, 50, 28, 6, 8, Math.PI / 8)}" fill="${INK_SOFT}" opacity="0.55"/>
    <polygon points="${makeStar(50, 50, 44, 8, 8, 0)}" fill="${INK}" opacity="0.8"/>
    <polygon points="${makeStar(50, 50, 44, 8, 8, 0)}" fill="none" stroke="#f0e4c8" stroke-width="0.5"/>
    <text x="50" y="12" text-anchor="middle" font-size="11" fill="#6e1f14" font-family="serif">N</text>
  </svg>`;
}
function makeStar(cx, cy, rOut, rIn, n, rot) {
  let pts = '';
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? rOut : rIn;
    const a = (i * Math.PI) / n + rot;
    pts += `${cx + r * Math.sin(a)},${cy - r * Math.cos(a)} `;
  }
  return pts.trim();
}
// Tiny engraved-style glyphs for harbor annotations, keyed by type.
function detailIconSVG(type) {
  if (window.cartaIcons) return window.cartaIcons.detailIcon(type);
  const ink = INK_SOFT, red = '#6e1f14';
  switch (type) {
    case 'fort':
      return `<svg width="13" height="13" viewBox="0 0 14 14"><path d="M7 1.5 L9 5 L12.5 7 L9 9 L7 12.5 L5 9 L1.5 7 L5 5 Z" fill="${ink}"/><rect x="5.7" y="5.7" width="2.6" height="2.6" fill="#f0e4c8"/></svg>`;
    case 'battery':
      return `<svg width="13" height="13" viewBox="0 0 14 14"><path d="M2 9 L10 5.5 L11 7.5 L3 11 Z" fill="${ink}"/><circle cx="4.5" cy="11" r="1.6" fill="none" stroke="${ink}" stroke-width="1"/></svg>`;
    case 'anchorage':
      return anchorSVG(12, ink);
    case 'gallows':
      return `<svg width="13" height="13" viewBox="0 0 14 14"><g stroke="${red}" fill="none" stroke-width="1.4" stroke-linecap="round"><path d="M3.5 12.5 V2 H9.5 M9.5 2 V4.2"/><circle cx="9.5" cy="6" r="1.6"/></g></svg>`;
    case 'careen':
      return `<svg width="13" height="13" viewBox="0 0 14 14"><g stroke="${ink}" fill="none" stroke-width="1.2" stroke-linecap="round" transform="rotate(-28 7 8)"><path d="M2.5 8.5 Q7 11.5 11.5 8.5 L10.5 6.5 H3.5 Z" fill="rgba(91,70,54,0.3)"/><path d="M7 6.5 V2.5"/></g></svg>`;
    case 'wreck':
      return `<svg width="13" height="13" viewBox="0 0 14 14"><g stroke="${red}" fill="none" stroke-width="1.3" stroke-linecap="round" transform="rotate(15 7 7)"><path d="M2.5 8.5 Q7 11.5 11.5 8.5"/><path d="M7 8.5 V3"/><path d="M7 4 L10 5.5"/></g></svg>`;
    case 'town':
      return `<svg width="13" height="13" viewBox="0 0 14 14"><g fill="${ink}"><path d="M2 12 V7 L4.5 4.5 L7 7 V12 Z"/><path d="M7.5 12 V8 L9.5 6 L11.5 8 V12 Z"/></g></svg>`;
    case 'market':
      return `<svg width="13" height="13" viewBox="0 0 14 14"><g stroke="${ink}" fill="none" stroke-width="1.2" stroke-linecap="round"><path d="M7 2.5 V11.5 M3 4 H11 M3 4 L2 7.5 H4 Z M11 4 L10 7.5 H12 Z"/><path d="M5 11.5 H9"/></g></svg>`;
    case 'yard':
      return `<svg width="13" height="13" viewBox="0 0 14 14"><g stroke="${ink}" fill="none" stroke-width="1.3" stroke-linecap="round"><path d="M2.5 11.5 H11.5"/><path d="M4 11.5 Q4 5 9 3.5"/><path d="M6.5 11.5 Q6.5 7 10.5 5.5"/></g></svg>`;
    default: // landmark
      return `<svg width="13" height="13" viewBox="0 0 14 14"><g stroke="${ink}" stroke-width="1.3" stroke-linecap="round"><path d="M7 12 V3" fill="none"/><path d="M7 3 L11 4.5 L7 6 Z" fill="${ink}"/></g></svg>`;
  }
}

const DETAIL_TYPE_NAMES = {
  fort: 'Fortification', battery: 'Battery', anchorage: 'Anchorage', gallows: 'Place of execution',
  careen: 'Careening place', wreck: 'Wreck', town: 'Town', market: 'Market & trade', yard: 'Shipyard',
  landmark: 'Landmark',
};

function serpentSVG() {
  return `<svg width="90" height="44" viewBox="0 0 90 44">
    <g stroke="${INK_SOFT}" fill="none" stroke-width="1.6" stroke-linecap="round">
      <path d="M6 28 q8 -16 16 0 q8 16 16 0 q8 -16 16 0 q6 12 13 4"/>
      <path d="M67 32 q6 -6 10 -14 q3 -6 9 -5 q-2 5 1 8" />
    </g>
    <circle cx="84.5" cy="15.5" r="1.2" fill="${INK_SOFT}"/>
    <path d="M6 28 l-4 -7 l7 1 z" fill="${INK_SOFT}"/></svg>`;
}
function shipSVG() {
  if (window.cartaIcons) return window.cartaIcons.decoShip();
  return `<svg width="46" height="46" viewBox="0 0 46 46">
    <g stroke="${INK_SOFT}" fill="none" stroke-width="1.3" stroke-linecap="round">
      <path d="M8 32 Q23 40 38 32 L35 27 H11 Z" fill="rgba(91,70,54,0.25)"/>
      <path d="M16 27 V10 M30 27 V13"/>
      <path d="M16 11 q7 4 0 13 M16 12 q-6 4 0 11 M30 14 q6 3.5 0 11 M30 14 q-5 3.5 0 11"/>
      <path d="M16 10 L22 12" />
    </g></svg>`;
}

/* ---------- map style ---------- */

function buildStyle() {
  const isoBandLayers = Object.keys(PALETTE).map(Number).sort((a, b) => b - a).map((d) => ({
    id: `iso-band-${d}`, type: 'fill', source: 'iso', maxzoom: 11.6,
    filter: ['all', ['==', ['get', 'kind'], 'band'], ['==', ['get', 'days'], d]],
    // Fade out where the harbor plans take over — a whole screen inside one
    // band is no information, and it frames the town plans in flat color.
    paint: { 'fill-color': PALETTE[d], 'fill-opacity': ['interpolate', ['linear'], ['zoom'], 10.6, 0.92, 11.5, 0] },
  }));

  return {
    version: 8,
    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
    sources: {
      land50: { type: 'geojson', data: '/data/land/ne_50m_land.geojson' },
      land10: { type: 'geojson', data: '/data/land/ne_10m_land.geojson' },
      islands10: { type: 'geojson', data: '/data/land/ne_10m_minor_islands.geojson' },
      lakes: { type: 'geojson', data: '/data/land/ne_10m_lakes.geojson' },
      rivers: { type: 'geojson', data: '/data/land/ne_10m_rivers_lake_centerlines.geojson' },
      reefs: { type: 'geojson', data: '/data/land/ne_10m_reefs.geojson' },
      deeps: { type: 'geojson', data: '/data/land/ne_10m_bathymetry_K_200.geojson' },
      graticule: { type: 'geojson', data: graticule(10) },
      graticuleFine: { type: 'geojson', data: graticule(1) },
      rhumbs: { type: 'geojson', data: rhumbWeb([[-37, 24], [-152, -8], [78, -28]]) },
      iso: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      routes: { type: 'geojson', data: routes },
    },
    layers: [
      { id: 'bg', type: 'background', paint: { 'background-color': SEA } },
      {
        // Deep water (beyond the 200 m line) very faintly darker, so the
        // continental shelf reads as pale shallows on the bare chart.
        id: 'deep-tint', type: 'fill', source: 'deeps',
        paint: { 'fill-color': '#9aa48e', 'fill-opacity': 0.13 },
      },
      ...isoBandLayers,
      {
        id: 'graticule', type: 'line', source: 'graticule',
        paint: { 'line-color': INK_SOFT, 'line-opacity': 0.14, 'line-width': 0.7 },
      },
      {
        id: 'graticule-fine', type: 'line', source: 'graticuleFine', minzoom: 6,
        paint: { 'line-color': INK_SOFT, 'line-opacity': 0.08, 'line-width': 0.5 },
      },
      {
        // The 200 m line drawn as a dotted "soundings" contour, chart-style.
        id: 'soundings', type: 'line', source: 'deeps', minzoom: 3.5,
        paint: { 'line-color': INK_SOFT, 'line-opacity': 0.25, 'line-width': 0.8, 'line-dasharray': [0.5, 1.8] },
      },
      {
        id: 'rhumbs', type: 'line', source: 'rhumbs',
        maxzoom: 7,
        paint: { 'line-color': INK_SOFT, 'line-opacity': 0.09, 'line-width': 0.7 },
      },
      {
        id: 'wash50', type: 'line', source: 'land50', maxzoom: 5,
        paint: { 'line-color': '#8a6a4a', 'line-opacity': 0.3, 'line-width': 7, 'line-blur': 6 },
      },
      {
        id: 'wash10', type: 'line', source: 'land10', minzoom: 5,
        paint: { 'line-color': '#8a6a4a', 'line-opacity': 0.3, 'line-width': 9, 'line-blur': 8 },
      },
      {
        id: 'land50', type: 'fill', source: 'land50', maxzoom: 5,
        paint: { 'fill-color': '#ddc89f', 'fill-opacity': 1 },
      },
      {
        id: 'land10', type: 'fill', source: 'land10', minzoom: 5,
        paint: { 'fill-color': '#ddc89f', 'fill-opacity': 1 },
      },
      {
        id: 'islands10', type: 'fill', source: 'islands10', minzoom: 5,
        paint: { 'fill-color': '#ddc89f', 'fill-opacity': 1 },
      },
      {
        id: 'lakes', type: 'fill', source: 'lakes', minzoom: 2.5,
        filter: ['<=', ['coalesce', ['get', 'scalerank'], 0], 4],
        paint: { 'fill-color': SEA, 'fill-opacity': 0.9 },
      },
      {
        id: 'lakes-line', type: 'line', source: 'lakes', minzoom: 3.5,
        filter: ['<=', ['coalesce', ['get', 'scalerank'], 0], 4],
        paint: { 'line-color': INK, 'line-opacity': 0.4, 'line-width': 0.5 },
      },
      {
        id: 'rivers', type: 'line', source: 'rivers', minzoom: 3.2,
        filter: ['<=', ['coalesce', ['get', 'scalerank'], 0], 9],
        paint: {
          'line-color': '#4f5a4a', 'line-opacity': 0.42,
          'line-width': ['interpolate', ['linear'], ['zoom'], 3.2, 0.4, 7, 1.1, 10, 1.8],
        },
      },
      {
        id: 'reefs', type: 'line', source: 'reefs', minzoom: 4.5,
        paint: { 'line-color': '#8a3b2e', 'line-opacity': 0.5, 'line-width': 1.1, 'line-dasharray': [0.6, 1.4] },
      },
      {
        id: 'coast50', type: 'line', source: 'land50', maxzoom: 5,
        paint: { 'line-color': INK, 'line-opacity': 0.75, 'line-width': 0.9 },
      },
      {
        id: 'coast10', type: 'line', source: 'land10', minzoom: 5,
        paint: { 'line-color': INK, 'line-opacity': 0.75, 'line-width': 1 },
      },
      {
        id: 'coast-islands', type: 'line', source: 'islands10', minzoom: 5,
        paint: { 'line-color': INK, 'line-opacity': 0.7, 'line-width': 0.8 },
      },
      {
        // Capped where the harbor plans take over: contour and route lines
        // crossing a town plan read as clutter, not chart.
        id: 'iso-lines', type: 'line', source: 'iso', maxzoom: 11.5,
        filter: ['==', ['get', 'kind'], 'line'],
        paint: { 'line-color': '#41311f', 'line-opacity': 0.5, 'line-width': ['interpolate', ['linear'], ['zoom'], 2, 0.8, 8, 1.6] },
      },
      {
        id: 'routes-hit', type: 'line', source: 'routes', maxzoom: 11.5,
        paint: { 'line-color': '#000', 'line-opacity': 0.001, 'line-width': 14 },
      },
      {
        id: 'routes', type: 'line', source: 'routes', maxzoom: 11.5,
        paint: {
          'line-color': ['match', ['get', 'category'],
            'trade', ROUTE_COLORS.trade, 'treasure', ROUTE_COLORS.treasure,
            'slave', ROUTE_COLORS.slave, 'east-india', ROUTE_COLORS['east-india'],
            'pirate', ROUTE_COLORS.pirate, INK_SOFT],
          'line-opacity': 0.75,
          'line-width': ['interpolate', ['linear'], ['zoom'], 2, 1.4, 8, 2.6],
          'line-dasharray': [3, 2.2],
        },
      },
    ],
  };
}

/* ---------- markers ---------- */

function addPortMarkers() {
  for (const p of meta.ports) {
    const el = document.createElement('div');
    el.className = `pm tier-${p.tier}${p.pirate ? ' pirate' : ''}`;
    el.innerHTML = (p.pirate ? skullSVG(15) : anchorSVG(13, p.kinds.includes('treasure') ? '#8a3b2e' : INK))
      + `<div class="pm-label">${p.name}</div>`;
    el.addEventListener('click', (e) => { e.stopPropagation(); openPortPanel(p); });
    el.addEventListener('mouseenter', () => showCard(portCardHTML(p)));
    el.addEventListener('mouseleave', hideCard);
    const m = new maplibregl.Marker({ element: el, anchor: 'top' }).setLngLat([p.lon, p.lat]).addTo(map);
    portMarkers.push({ m, el, p });
  }
}

function gullsSVG() {
  if (window.cartaIcons) return window.cartaIcons.gulls();
  return `<svg width="22" height="10" viewBox="0 0 22 10">
    <g stroke="#3d2f1e" fill="none" stroke-width="1" stroke-linecap="round">
      <path d="M2 6 Q4.5 3.5 7 6 M7 6 Q9.5 3.5 12 6"/>
      <path d="M12 4 Q14 2 16 4 M16 4 Q18 2 20 4" opacity="0.7"/>
    </g></svg>`;
}

function addWreckMarkers() {
  for (const w of wrecks) {
    const el = document.createElement('div');
    el.className = 'wm prec-' + (w.precision || 'exact');
    el.innerHTML = `<span class="wm-in"><span class="gulls">${gullsSVG()}</span>${wreckSVG()}</span>`;
    el.addEventListener('mouseenter', () => showCard(wreckCardHTML(w)));
    el.addEventListener('mouseleave', hideCard);
    const m = new maplibregl.Marker({ element: el }).setLngLat([w.lon, w.lat]).addTo(map);
    wreckMarkers.push({ m, el, w });
  }
}

function addDecoMarkers() {
  for (const s of SEA_LABELS) {
    const el = document.createElement('div');
    el.className = 'sea-label deco';
    el.style.fontSize = s.s + 'px';
    el.textContent = s.t;
    el._lngLat = [s.lon, s.lat];
    decoMarkers.push({ m: new maplibregl.Marker({ element: el }).setLngLat([s.lon, s.lat]).addTo(map), el, kind: 'sea' });
  }
  for (const r of REGION_LABELS) {
    const el = document.createElement('div');
    el.className = 'region-label deco';
    el.style.fontSize = r.s + 'px';
    el.textContent = r.t;
    el._lngLat = [r.lon, r.lat];
    decoMarkers.push({ m: new maplibregl.Marker({ element: el }).setLngLat([r.lon, r.lat]).addTo(map), el, kind: 'region' });
  }
  const art = [
    { svg: serpentSVG(), lon: -33, lat: 3 }, { svg: serpentSVG(), lon: 88, lat: -38 },
    { svg: shipSVG(), lon: -52, lat: 33 }, { svg: shipSVG(), lon: 62, lat: -8 },
    { svg: shipSVG(), lon: -30, lat: -28 },
  ];
  for (const a of art) {
    const el = document.createElement('div');
    el.className = 'deco';
    el.innerHTML = a.svg;
    decoMarkers.push({ m: new maplibregl.Marker({ element: el }).setLngLat([a.lon, a.lat]).addTo(map), el, kind: 'art' });
  }
  for (const r of [{ lon: -37, lat: 24, s: 150 }, { lon: -152, lat: -8, s: 110 }, { lon: 78, lat: -28, s: 110 }]) {
    const el = document.createElement('div');
    el.className = 'deco';
    el.innerHTML = roseSVG(r.s);
    decoMarkers.push({ m: new maplibregl.Marker({ element: el }).setLngLat([r.lon, r.lat]).addTo(map), el, kind: 'rose' });
  }
}

function addDetailMarkers() {
  for (const [portId, items] of Object.entries(portDetails)) {
    const portName = (meta.ports.find((p) => p.id === portId) || {}).name || '';
    for (const d of items) {
      const el = document.createElement('div');
      el.className = 'detail-m';
      el.innerHTML = `<span class="dicon">${detailIconSVG(d.type)}</span><span class="dname">${d.name}</span>`;
      el.addEventListener('mouseenter', () => showCard(
        `<h3>${d.name}</h3><div class="meta">${DETAIL_TYPE_NAMES[d.type] || 'Place'} · ${portName}</div><p>${d.note}</p>`));
      el.addEventListener('mouseleave', hideCard);
      detailMarkers.push({ m: new maplibregl.Marker({ element: el }).setLngLat([d.lon, d.lat]).addTo(map), el, d });
    }
  }
}

// project() that follows the world copy the markers are actually drawn on:
// wrap the longitude toward the map center before projecting.
function projectWrapped(lngLat) {
  const c = map.getCenter().lng;
  let lon = lngLat[0];
  while (lon - c > 180) lon -= 360;
  while (lon - c < -180) lon += 360;
  return map.project([lon, lngLat[1]]);
}

function updateVisibility() {
  gateMarkers();
  clusterWrecks(map.getZoom(), $('t-wrecks').checked);
  requestDeclutter();
}

// Cheap per-frame gating during continuous zoom; cluster rebuilds wait for
// zoomend/moveend (updateVisibility) so we don't churn DOM every frame.
function updateVisibilityLight() {
  gateMarkers();
  requestDeclutter();
}

function gateMarkers() {
  const z = map.getZoom();
  // Precision rings and gulls are close-zoom furniture; at chart scale they
  // read as stray ellipses around the wreck marks.
  document.body.classList.toggle('lowzoom', z < 6);
  const portsOn = $('t-ports').checked;
  for (const { el, p } of portMarkers) {
    const minZ = p.tier === 1 ? 0 : p.tier === 2 ? 3.0 : 4.2;
    el.style.display = portsOn && z >= minZ ? '' : 'none';
    // Names lag icons by a little zoom, so the chart fills in stages.
    const labelMinZ = p.tier === 1 ? 1.8 : p.tier === 2 ? 3.4 : 4.6;
    const lbl = el.querySelector('.pm-label');
    if (lbl) lbl.style.display = z >= labelMinZ ? '' : 'none';
  }
  for (const { el, kind } of decoMarkers) {
    const show = kind === 'sea' ? z <= 5.2
      : kind === 'art' ? z <= 4.5
      : kind === 'region' ? z >= 2.4 && z <= 6.8
      : z <= 4.8;
    el.style.display = show ? '' : 'none';
  }
  // Icons appear first; names only when there's room to read them. Entries
  // with a year (the Sunken City, Kingston) only exist from that year on.
  const yr = window.cartaTime ? window.cartaTime.year : 1730;
  for (const { el, d } of detailMarkers) {
    const born = !d.year || d.year <= yr;
    el.style.display = born && z >= 8.2 ? '' : 'none';
    const name = el.querySelector('.dname');
    if (name) name.style.display = z >= 9.8 ? '' : 'none';
  }
  // Day-count labels retire with the bands at harbor zoom.
  const isoOn = $('t-iso').checked && z <= 11.5;
  for (const m of isoLabelMarkers) m.getElement().style.display = isoOn ? '' : 'none';
}

/* ---------- wreck clustering ----------
   At chart scale, wrecks that crowd one another fold into a single
   "×N" medallion; zooming in (or clicking the medallion) spreads them out. */

function clusterWrecks(z, wrecksOn) {
  // If the card is showing for a marker we're about to destroy, close it —
  // its mouseleave will never fire.
  if (clusterMarkers.some((c) => c.getElement().matches(':hover'))) hideCard();
  for (const c of clusterMarkers) c.remove();
  clusterMarkers = [];
  const year = window.cartaTime ? window.cartaTime.year : 1730;
  // A wreck exists on the chart only once she has sunk; gulls still wheel
  // over those lost within living memory.
  const visible = [];
  for (const wm of wreckMarkers) {
    if (!wrecksOn || z < 2.4 || wm.w.year > year) { wm.el.style.display = 'none'; continue; }
    wm.el.classList.toggle('recent', year - wm.w.year <= 12);
    visible.push(wm);
  }
  if (!visible.length) return;
  if (z >= 6.8) { // fully revealed
    for (const { el } of visible) el.style.display = '';
    return;
  }
  // Geographic bucketing (cell ≈ 46 px at this zoom, but fixed in lon/lat):
  // buckets don't shift when the map pans, and zoom steps recreate the same
  // medallions in place instead of letting them wander.
  const cellDeg = (46 * 360) / (512 * Math.pow(2, Math.round(z)));
  const buckets = new Map();
  for (const wm of visible) {
    const key = `${Math.floor(wm.w.lon / cellDeg)}_${Math.floor(wm.w.lat / cellDeg)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(wm);
  }
  for (const group of buckets.values()) {
    if (group.length === 1) { group[0].el.style.display = ''; continue; }
    // Anchor the medallion on a real wreck (always at sea), the one nearest
    // the group's centre — never on a computed centroid that may fall on land.
    let cx = 0, cy = 0;
    for (const g of group) { g.el.style.display = 'none'; cx += g.w.lon; cy += g.w.lat; }
    cx /= group.length; cy /= group.length;
    let anchor = group[0];
    let best = Infinity;
    for (const g of group) {
      const d = (g.w.lon - cx) ** 2 + (g.w.lat - cy) ** 2;
      if (d < best) { best = d; anchor = g; }
    }
    const el = document.createElement('div');
    el.className = 'wreck-cluster';
    el.innerHTML = `<span class="wc-in">${wreckSVG()}<span class="wc-count">×${group.length}</span></span>`;
    el.addEventListener('mouseenter', () => showCard(
      `<h3>✠ ${group.length} wrecks hereabouts</h3>
       <ul class="wc-list">${group.map((g) => `<li>${g.w.name} <span>(${g.w.year})</span></li>`).join('')}</ul>
       <p class="src">Draw nearer to chart each wreck distinctly.</p>`));
    el.addEventListener('mouseleave', hideCard);
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const b = new maplibregl.LngLatBounds();
      for (const g of group) b.extend([g.w.lon, g.w.lat]);
      map.fitBounds(b, { padding: 120, maxZoom: 8, duration: 1400 });
    });
    const m = new maplibregl.Marker({ element: el }).setLngLat([anchor.w.lon, anchor.w.lat]).addTo(map);
    clusterMarkers.push(m);
  }
}

/* ---------- label decluttering ----------
   Greedy screen-space collision pruning: higher-priority labels keep their
   place, lower ones vanish until there is room. Hidden via `visibility` so
   boxes stay measurable. */

let declutterScheduled = false;
function requestDeclutter() {
  if (declutterScheduled) return;
  declutterScheduled = true;
  requestAnimationFrame(() => { declutterScheduled = false; declutter(); });
}

function labelSize(el, fallbackText, fallbackPx) {
  if (el._dw && el._dh) return [el._dw, el._dh];
  const w = el.offsetWidth, h = el.offsetHeight;
  if (w > 0 && h > 0) { el._dw = w; el._dh = h; return [w, h]; }
  const t = fallbackText || el.textContent || '';
  return [t.length * (fallbackPx || 11) * 0.72, (fallbackPx || 11) * 1.4];
}

function declutterItems() {
  const items = [];
  for (const { el, p } of portMarkers) {
    const lbl = el.querySelector('.pm-label');
    if (!lbl || el.style.display === 'none' || lbl.style.display === 'none') continue;
    items.push({
      el: lbl, lngLat: [p.lon, p.lat], dy: 16,
      pr: (p.tier === 1 ? 100 : p.tier === 2 ? 80 : 60) + (p.pirate ? 8 : 0),
    });
  }
  for (const m of isoLabelMarkers) {
    const el = m.getElement();
    if (el.style.display === 'none') continue;
    items.push({ el, lngLat: m.getLngLat().toArray(), dy: 0, pr: 90 });
  }
  if (originMarker && originMarker._isPseudo) {
    const lbl = originMarker.getElement().querySelector('.origin-label');
    if (lbl) items.push({ el: lbl, lngLat: originMarker.getLngLat().toArray(), dy: 16, pr: 99 });
  }
  for (const { el, kind } of decoMarkers) {
    if (el.style.display === 'none' || (kind !== 'sea' && kind !== 'region')) continue;
    const ll = el._lngLat;
    items.push({ el, lngLat: ll, dy: 0, pr: kind === 'sea' ? 40 : 25 });
  }
  for (const { el, d } of detailMarkers) {
    const name = el.querySelector('.dname');
    if (el.style.display === 'none' || !name || name.style.display === 'none') continue;
    items.push({ el: name, lngLat: [d.lon, d.lat], dy: 8, pr: 55 });
  }
  // Modules (overlays, timeline, harbors) may contribute their own labels.
  for (const provider of (window.carta && window.carta.declutterProviders) || []) {
    try { items.push(...(provider() || [])); } catch (e) { console.error('declutter provider', e); }
  }
  return items;
}

function declutter() {
  if (!map) return;
  const items = declutterItems().sort((a, b) => b.pr - a.pr);
  const W = map.getContainer().clientWidth, H = map.getContainer().clientHeight;
  const kept = [];
  const PAD = 3;
  for (const it of items) {
    const pt = projectWrapped(it.lngLat);
    if (pt.x < -200 || pt.x > W + 200 || pt.y < -100 || pt.y > H + 100) {
      it.el.style.visibility = '';
      continue; // offscreen: leave alone, it cannot visually collide
    }
    const [w, h] = labelSize(it.el);
    const box = { x1: pt.x - w / 2 - PAD, x2: pt.x + w / 2 + PAD, y1: pt.y + it.dy - PAD, y2: pt.y + it.dy + h + PAD };
    let hit = false;
    for (const k of kept) {
      if (box.x1 < k.x2 && box.x2 > k.x1 && box.y1 < k.y2 && box.y2 > k.y1) { hit = true; break; }
    }
    if (hit) { it.el.style.visibility = 'hidden'; } else { it.el.style.visibility = ''; kept.push(box); }
  }
}

/* ---------- cards & panels ---------- */

function showCard(html) { const c = $('info-card'); c.innerHTML = html; c.classList.remove('hidden'); }
function hideCard() { $('info-card').classList.add('hidden'); }

function portCardHTML(p) {
  return `<h3>${p.name}</h3>
    <div class="meta">${p.nation} · ${p.kinds.join(' · ')}</div>
    ${p.pirate ? '<span class="card-tag">PIRATE HAVEN</span>' : ''}
    <p>${p.blurb}</p>
    <p class="src">Click for particulars — and to chart the seas from here.</p>`;
}
function figureHTML(im, width) {
  if (!im || !im.commons_file) return '';
  const f = encodeURIComponent(im.commons_file.replace(/^File:/, ''));
  return `<figure class="chart-fig">
    <img src="https://commons.wikimedia.org/wiki/Special:FilePath/${f}?width=${width}"
         alt="${im.title}" loading="lazy" onerror="this.parentElement.style.display='none'">
    <figcaption>${im.title}${im.creator ? ' — ' + im.creator : ''}, ${im.year}</figcaption>
  </figure>`;
}

function wreckCardHTML(w) {
  const x = wreckExtra[w.id] || {};
  const souls = x.souls && (x.souls.aboard || x.souls.lost)
    ? `<p class="souls">${x.souls.aboard ? `${x.souls.aboard} souls aboard` : ''}${x.souls.lost ? ` · ${x.souls.lost} lost` : ''}${x.souls.survived != null ? ` · ${x.souls.survived} saved` : ''}</p>` : '';
  const manifest = x.manifest && x.manifest.length
    ? `<div class="manifest-title">Ship's Manifest</div><ul class="manifest">${x.manifest.slice(0, 4).map((m) => `<li>${m}</li>`).join('')}</ul>` : '';
  const treasure = x.treasure && x.treasure.summary
    ? `<p><em>In her hold:</em> ${x.treasure.summary}${x.treasure.modern_estimate ? ` <span class="tval">(${x.treasure.modern_estimate})</span>` : ''}</p>` : '';
  const depth = x.depth_m != null ? ` · ${Math.round(x.depth_m / 1.8288 * 10) / 10} fathoms down` : '';
  return `<h3>✠ ${w.name} <span style="font-weight:normal">(${w.year})</span></h3>
    <div class="meta">${w.ship_type} · ${w.nationality}${w.captain ? ' · ' + w.captain : ''}${depth}</div>
    ${x.epitaph ? `<p class="epitaph">${x.epitaph}</p>` : `<p>${w.story}</p>`}
    ${souls}
    ${manifest}
    ${treasure}
    ${x.salvage ? `<p><em>Salvage:</em> ${x.salvage}</p>` : `<p><em>Fate of the wreck:</em> ${w.discovery}</p>`}
    ${figureHTML(imageIndex['wreck:' + w.id], 300)}
    <p class="src">Position ${w.precision} · ${(w.sources || []).join('; ')}</p>`;
}

function openPortPanel(p) {
  const panel = $('port-panel');
  const hasDetail = portDetails[p.id];
  const facts = [
    ['Souls', p.population], ['Defences', p.defenses], ['Trade', p.trade],
  ].filter(([, v]) => v);
  panel.innerHTML = `
    <button class="close" id="pp-close">✕</button>
    <h3>${p.name}</h3>
    <div class="meta">${p.nation} · ${p.kinds.join(' · ')}</div>
    ${p.pirate ? '<span class="card-tag">PIRATE HAVEN</span>' : ''}
    ${figureHTML(imageIndex['port:' + p.id], 340)}
    <p>${p.detail || p.blurb}</p>
    ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
    ${p.events && p.events.length ? `<div class="annals-title">Annals</div><ul class="annals">${p.events.map((e) => `<li>${e}</li>`).join('')}</ul>` : ''}
    ${hasDetail ? '<p class="src">This harbour is charted in detail — sail closer to see its forts, anchorages and gallows.</p>' : ''}
    <button class="go" id="pp-go">⚓ Chart sailing times from ${p.name}</button>
    <button class="go" id="pp-sail">⛵ Sail a voyage hence…</button>
    ${hasDetail ? `<button class="go" id="pp-zoom">🗺 View the harbour</button>` : ''}`;
  panel.classList.remove('hidden');
  $('pp-close').onclick = () => panel.classList.add('hidden');
  $('pp-go').onclick = () => { selectPort(p.id); panel.classList.add('hidden'); };
  $('pp-sail').onclick = () => {
    panel.classList.add('hidden');
    if (window.carta) window.carta.bus.emit('voyage-from', p);
  };
  const zb = $('pp-zoom');
  if (zb) zb.onclick = () => {
    const plan = window.carta && window.carta.harborPlans && window.carta.harborPlans[p.id];
    const center = plan && plan.properties && plan.properties.center;
    map.flyTo({ center: center || [p.lon, p.lat], zoom: center ? 12.6 : 9.5, duration: 2600 });
  };
}

/* ---------- isochrones ---------- */

// selectOrigin charts isochrones from a port ({portId}) or from any point of
// open sea ({lonlat: [lon, lat]}). selectPort remains the thin port wrapper.
async function selectOrigin(origin) {
  let p, url;
  if (origin.portId) {
    p = meta.ports.find((x) => x.id === origin.portId);
    if (!p) return;
    currentPort = origin.portId;
    $('port-select').value = origin.portId;
    cartaHash.write({ port: origin.portId, origin: null, voyage: null });
    url = '/api/isochrone?port=' + encodeURIComponent(origin.portId);
  } else {
    const [lon, lat] = origin.lonlat;
    p = { name: `the open sea (${fmtLL(lon, lat)})`, lon, lat, pseudo: true };
    currentPort = null;
    $('port-select').value = '';
    cartaHash.write({ origin: `${lon.toFixed(2)},${lat.toFixed(2)}`, port: null, voyage: null });
    url = `/api/isochrone?lon=${lon.toFixed(3)}&lat=${lat.toFixed(3)}`;
  }
  if (window.carta) window.carta.bus.emit('origin', origin);
  // Bring the chosen origin to the centre of the chart, gently.
  const z = map.getZoom();
  map.easeTo({ center: [p.lon, p.lat], zoom: z > 6 ? 4.5 : z, duration: 1600 });
  if (isoAbort) isoAbort.abort();
  isoAbort = new AbortController();
  $('loading').classList.remove('hidden');
  try {
    const res = await fetch(url, { signal: isoAbort.signal });
    if (!res.ok) {
      let msg = 'No isochrones could be charted from that point.';
      try {
        const err = await res.json();
        if (err.error === 'land') msg = 'That is dry land, or too far from navigable water — prick a point upon the open sea.';
      } catch (_) { /* non-JSON error body */ }
      showCard(`<h3>Beyond the chart</h3><p>${msg}</p>`);
      setTimeout(hideCard, 4000);
      return;
    }
    const fc = await res.json();
    map.getSource('iso').setData(fc);
    renderIsoLabels(fc);
    renderOrigin(p);
    renderLegend();
    if (window.carta) window.carta.bus.emit('iso-rendered', fc);
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  } finally {
    $('loading').classList.add('hidden');
  }
}

function selectPort(id) { return selectOrigin({ portId: id }); }

function renderOrigin(p) {
  if (originMarker) originMarker.remove();
  const el = document.createElement('div');
  el.style.pointerEvents = 'none';
  el.innerHTML = `<span class="origin-in">${starSVG(26, '#8a3b2e')}${p.pseudo
    ? `<div class="origin-label">From ${p.name}</div>` : ''}</span>`;
  originMarker = new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map);
  originMarker._isPseudo = !!p.pseudo;
}

function renderIsoLabels(fc) {
  for (const m of isoLabelMarkers) m.remove();
  isoLabelMarkers = [];
  const perDay = {};
  for (const f of fc.features) {
    if (f.properties.kind !== 'label') continue;
    const d = f.properties.days;
    perDay[d] = perDay[d] || [];
    if (perDay[d].length >= 3) continue;
    perDay[d].push(f.geometry.coordinates);
  }
  for (const [d, pts] of Object.entries(perDay)) {
    for (const c of pts) {
      const el = document.createElement('div');
      el.className = 'iso-label';
      el.textContent = `${d} days`;
      isoLabelMarkers.push(new maplibregl.Marker({ element: el }).setLngLat(c).addTo(map));
    }
  }
  requestDeclutter();
}

function renderLegend() {
  const bands = $('legend-bands');
  bands.innerHTML = '';
  const days = Object.keys(PALETTE).map(Number).sort((a, b) => a - b);
  for (const d of days) {
    const div = document.createElement('div');
    div.className = 'legend-band';
    div.style.background = PALETTE[d];
    div.innerHTML = `<span>${d}</span>`;
    bands.appendChild(div);
  }
  $('legend').classList.remove('hidden');
}

/* ---------- ui wiring ---------- */

// Harbors charted at street level (data/harbors/) — badged in the dropdown.
const HARBOR_PLAN_IDS = ['nassau', 'port-royal', 'tortuga', 'havana', 'charleston',
  'cartagena', 'bridgetown', 'batavia'];

function buildPortSelect() {
  const sel = $('port-select');
  sel.innerHTML = '<option value="" disabled selected>— choose a port —</option>';
  const groups = [
    ['Pirate Havens', meta.ports.filter((p) => p.pirate)],
    ['Ports of Trade & War', meta.ports.filter((p) => !p.pirate)],
  ];
  for (const [label, list] of groups) {
    const og = document.createElement('optgroup');
    og.label = label;
    for (const p of list.sort((a, b) => a.name.localeCompare(b.name))) {
      const o = document.createElement('option');
      o.value = p.id;
      const detailed = HARBOR_PLAN_IDS.includes(p.id);
      o.textContent = detailed ? `${p.name} ❖` : p.name;
      if (detailed) o.title = 'Harbour charted in street detail';
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  sel.insertAdjacentHTML('afterend',
    '<div class="select-note">❖ — harbour charted in street detail</div>');
  sel.addEventListener('change', () => selectPort(sel.value));

  const chips = $('chips');
  for (const id of ['nassau', 'port-royal', 'london', 'cadiz', 'ile-sainte-marie', 'batavia']) {
    const p = meta.ports.find((x) => x.id === id);
    if (!p) continue;
    const b = document.createElement('button');
    b.textContent = p.name.split(',')[0];
    if (p.pirate) b.className = 'pirate';
    b.onclick = () => selectPort(id);
    chips.appendChild(b);
  }
}

function wireToggles() {
  $('t-ports').addEventListener('change', updateVisibility);
  $('t-wrecks').addEventListener('change', updateVisibility);
  $('t-routes').addEventListener('change', (e) => {
    const v = e.target.checked ? 'visible' : 'none';
    map.setLayoutProperty('routes', 'visibility', v);
    map.setLayoutProperty('routes-hit', 'visibility', v);
  });
  $('t-iso').addEventListener('change', (e) => {
    const v = e.target.checked ? 'visible' : 'none';
    for (const d of Object.keys(PALETTE)) map.setLayoutProperty(`iso-band-${d}`, 'visibility', v);
    map.setLayoutProperty('iso-lines', 'visibility', v);
    for (const m of isoLabelMarkers) m.getElement().style.display = e.target.checked ? '' : 'none';
  });
}

function wireRouteHover() {
  map.on('mousemove', 'routes-hit', (e) => {
    map.getCanvas().style.cursor = 'pointer';
    const f = e.features[0];
    showCard(`<h3>${f.properties.name}</h3>
      <div class="meta" style="color:${ROUTE_COLORS[f.properties.category] || INK}">${ROUTE_KIND_NAMES[f.properties.category] || ''}</div>
      <p>${f.properties.blurb}</p>`);
  });
  map.on('mouseleave', 'routes-hit', () => {
    map.getCanvas().style.cursor = '';
    hideCard();
  });
}

function animateRoutes() {
  const phases = [[3, 2.2], [2.4, 2.2, 0.6, 0], [1.8, 2.2, 1.2, 0], [1.2, 2.2, 1.8, 0], [0.6, 2.2, 2.4, 0]];
  let i = 0;
  setInterval(() => {
    if (!map.getLayer('routes') || !$('t-routes').checked) return;
    i = (i + 1) % phases.length;
    map.setPaintProperty('routes', 'line-dasharray', phases[i]);
  }, 220);
}

function wireAbout() {
  $('about-link').onclick = async (e) => {
    e.preventDefault();
    $('about-modal').classList.remove('hidden');
    const tbody = document.querySelector('#cal-table tbody');
    if (tbody.children.length) return;
    try {
      const rows = await (await fetch('/api/calibration')).json();
      const nameOf = (id) => (meta.ports.find((p) => p.id === id) || { name: id }).name;
      for (const r of rows) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${nameOf(r.From)} → ${nameOf(r.To)}</td>
          <td>${Math.round(r.ModelDays)} d</td><td>${r.DaysTypical} d</td><td>${r.DaysLow}–${r.DaysHigh} d</td>`;
        tbody.appendChild(tr);
      }
    } catch (err) { console.error(err); }
  };
  $('about-close').onclick = () => $('about-modal').classList.add('hidden');
  $('about-modal').addEventListener('click', (e) => {
    if (e.target === $('about-modal')) $('about-modal').classList.add('hidden');
  });
}

/* ---------- boot ---------- */

async function boot() {
  let imageList;
  [meta, routes, wrecks, portDetails, wreckExtra, imageList] = await Promise.all([
    fetch('/api/meta').then((r) => r.json()),
    fetch('/data/routes.json').then((r) => r.json()),
    fetch('/data/wrecks.json').then((r) => r.json()),
    fetch('/data/port_details.json').then((r) => r.json()),
    fetch('/data/wrecks_enrichment.json').then((r) => r.json()).catch(() => ({})),
    fetch('/data/images.json').then((r) => r.json()).catch(() => ({ images: [] })),
  ]);
  for (const im of (imageList.images || [])) {
    const key = im.subject_type + ':' + im.subject_id;
    if (!imageIndex[key]) imageIndex[key] = im; // first entry wins (engravings listed first)
  }

  routes = {
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature',
      properties: { name: r.name, category: r.category, blurb: r.blurb },
      geometry: { type: 'LineString', coordinates: r.waypoints },
    })),
  };

  map = new maplibregl.Map({
    container: 'map',
    style: buildStyle(),
    center: [-45, 26],
    zoom: 2.7,
    minZoom: 1.4,
    maxZoom: 14.5,
    dragRotate: false,
    pitchWithRotate: false,
    attributionControl: { compact: true, customAttribution: 'Coastlines: Natural Earth · Carta Temporum' },
  });
  map.touchZoomRotate.disableRotation();
  window.cartaMap = map;
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');

  map.on('load', () => {
    // Engraved stipple texture for land at close zoom.
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.strokeStyle = 'rgba(91, 70, 54, 0.20)';
    ctx.lineWidth = 0.7;
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 64, y = Math.random() * 64, l = 2 + Math.random() * 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + l, y + l * 0.35);
      ctx.stroke();
    }
    map.addImage('land-hatch', ctx.getImageData(0, 0, 64, 64), { pixelRatio: 2 });
    map.addLayer({
      id: 'land-texture', type: 'fill', source: 'land10', minzoom: 6.2,
      paint: { 'fill-pattern': 'land-hatch' },
    }, 'coast10');

    addPortMarkers();
    addWreckMarkers();
    addDecoMarkers();
    addDetailMarkers();
    updateVisibility();
    wireRouteHover();
    animateRoutes();

    // Shared surface for the feature modules (overlays, timeline, harbors,
    // voyage, dividers, FX, events, tours).
    window.carta = {
      map, meta, routes, wrecks, portDetails,
      showCard, hideCard, requestDeclutter, updateVisibility,
      selectOrigin, projectWrapped, fmtLL, cartaHash,
      SEA_LABELS, REGION_LABELS,
      declutterProviders: [],
      PALETTE, INK, INK_SOFT, SEA,
      // Tool lock: modules that consume map clicks (voyage destination pick,
      // dividers) set this to their name and restore null when done.
      activeTool: null,
      bus: {
        _l: {},
        on(ev, cb) { (this._l[ev] = this._l[ev] || []).push(cb); },
        emit(ev, ...a) { for (const f of this._l[ev] || []) { try { f(...a); } catch (e) { console.error('bus:' + ev, e); } } },
      },
    };
    window.cartaTime = {
      year: 1730,
      _listeners: [],
      set(y) { this.year = y; for (const f of this._listeners) { try { f(y); } catch (e) { console.error(e); } } },
      on(f) { this._listeners.push(f); },
    };
    window.cartaTime.on(() => updateVisibility());
    for (const init of (window.cartaInits || [])) {
      try { init(window.carta); } catch (e) { console.error('module init failed', e); }
    }

    // Right-click (long-press on touch) anywhere at sea charts isochrones
    // from that point — unless a tool (voyage, dividers) holds the click.
    map.on('contextmenu', (e) => {
      if (window.carta && window.carta.activeTool) return;
      e.preventDefault();
      if (e.originalEvent) e.originalEvent.preventDefault();
      selectOrigin({ lonlat: [e.lngLat.lng, e.lngLat.lat] });
    });

    const h = cartaHash.read();
    if (h.voyage) {
      // A voyage hash boots the voyage module; no default origin select.
    } else if (h.origin) {
      const [lon, lat] = h.origin.split(',').map(Number);
      if (isFinite(lon) && isFinite(lat)) selectOrigin({ lonlat: [lon, lat] });
      else selectPort('nassau');
    } else {
      selectPort(h.port || 'nassau');
    }
  });
  map.on('zoom', updateVisibilityLight);
  map.on('move', requestDeclutter);
  map.on('moveend', updateVisibility);
  map.on('resize', updateVisibility);

  buildPortSelect();
  wireToggles();
  wireAbout();
}

boot();
