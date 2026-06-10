/* Carta Temporum — timeline module (draggable 1650–1730 slider, pirate ships).
   Registered via window.cartaInits; receives the shared `carta` surface.
   Publishes the selected year through window.cartaTime. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function initTimeline(carta) {
  const map = carta.map;
  const YR_MIN = 1650, YR_MAX = 1730, YR_SPAN = YR_MAX - YR_MIN;
  const INK = '#3d2f1e', INK_SOFT = '#5b4636', MADDER = '#8a3b2e', PAPER = '#f0e4c8', PARCH = '#e7d8ba';

  const ERAS = [
    [1650, 1670, 'The Buccaneers'],
    [1670, 1690, 'The Buccaneer Admirals'],
    [1690, 1702, 'The Pirate Round'],
    [1702, 1713, 'The Privateering War'],
    [1713, 1726, 'The Great Pyrate Rampage'],
    [1726, 1731, 'The King’s Peace'],
  ];
  const eraName = (y) => { for (const [a, b, n] of ERAS) if (y >= a && y < b) return n; return ERAS[ERAS.length - 1][2]; };

  const SEASON_Q = { spring: 0.125, summer: 0.375, autumn: 0.625, winter: 0.875 };
  const CONF_TAG = { documented: 'as documented at trial', traditional: 'by tradition', unknown: 'colours unknown' };
  // images.json slugs that do not equal pirates.json ids (matched on nickname).
  const PORTRAIT_ALIAS = { 'edward-thatch': 'blackbeard' };

  /* ---------- styles ---------- */

  const css = document.createElement('style');
  css.textContent = `
#tl-bar {
  position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%);
  width: min(720px, 60vw); z-index: 30; box-sizing: border-box;
  background: ${PAPER};
  border: 1px solid ${INK};
  box-shadow: inset 0 0 0 2.5px ${PAPER}, inset 0 0 0 3.5px rgba(61,47,30,0.55), 2px 4px 10px rgba(61,47,30,0.35);
  padding: 6px 16px 8px; color: ${INK};
  font-family: 'IM Fell English', serif; user-select: none;
}
#tl-bar .tl-head { display: flex; justify-content: space-between; align-items: baseline; padding: 0 2px; }
#tl-bar .tl-title { font-family: 'IM Fell English SC', serif; font-size: 12px; letter-spacing: 2.5px; color: ${INK_SOFT}; }
#tl-bar .tl-pyr { font-size: 11.5px; cursor: pointer; color: #6e1f14; white-space: nowrap; }
#tl-bar .tl-pyr input { accent-color: ${INK_SOFT}; vertical-align: -2px; }
#tl-bar .tl-main { display: flex; align-items: center; gap: 12px; margin-top: 2px; }
#tl-bar .tl-play {
  flex: none; width: 27px; height: 27px; border-radius: 50%; cursor: pointer;
  border: 1px solid ${INK_SOFT}; background: transparent; color: ${INK};
  font-size: 12px; line-height: 1; font-family: serif; padding: 0;
}
#tl-bar .tl-play:hover { background: rgba(61,47,30,0.08); }
#tl-bar .tl-track { flex: 1; position: relative; height: 44px; cursor: pointer; touch-action: none; }
#tl-bar .tl-scale {
  position: absolute; left: 0; right: 0; top: 23px; height: 7px;
  border: 1px solid ${INK}; display: flex; background: ${PARCH};
  box-shadow: 0.5px 1px 0 rgba(61,47,30,0.4);
}
#tl-bar .tl-seg { flex: 1; } #tl-bar .tl-seg.f { background: ${INK_SOFT}; }
#tl-bar .tl-tick {
  position: absolute; top: 4px; transform: translateX(-50%);
  font-family: 'IM Fell English SC', serif; font-size: 9.5px; letter-spacing: 0.5px;
  color: ${INK_SOFT}; line-height: 1; pointer-events: none;
}
#tl-bar .tl-tick::after { content: ''; position: absolute; left: 50%; top: 11px; width: 1px; height: 7px; background: ${INK_SOFT}; }
#tl-bar .tl-handle {
  position: absolute; top: 11px; width: 17px; height: 32px; margin-left: -8.5px;
  cursor: grab; z-index: 2; touch-action: none;
}
#tl-bar .tl-handle:active { cursor: grabbing; }
#tl-bar .tl-handle:focus { outline: none; }
#tl-bar .tl-handle:focus-visible svg .tl-dia { stroke: ${MADDER}; stroke-width: 1.6; }
#tl-bar .tl-right { flex: none; width: 132px; text-align: center; }
#tl-bar .tl-year { font-family: 'IM Fell English SC', serif; font-size: 21px; letter-spacing: 1px; line-height: 1.1; }
#tl-bar .tl-era { font-size: 10.5px; font-style: italic; color: ${INK_SOFT}; line-height: 1.2; }
/* NB: never set 'position' (or transform) on the marker root itself — it
   overrides .maplibregl-marker{position:absolute} and throws the marker
   into document flow. All positioning lives on the inner wrapper. */
.tl-ship { cursor: pointer; }
.tl-ship .tls-in { position: relative; display: block; width: 26px; height: 26px; }
.tl-ship svg { display: block; filter: drop-shadow(0.5px 0.5px 0 rgba(240,228,200,0.9)); }
.tl-ship:hover svg { transform: scale(1.25); }
.tl-ship-label {
  position: absolute; top: 25px; left: 50%; transform: translateX(-50%);
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 10.5px;
  color: #6e1f14; white-space: nowrap; line-height: 1.1; pointer-events: none;
  text-shadow: 0 0 3px ${PARCH}, 0 0 3px ${PARCH}, 0 0 4px ${PARCH};
}
/* career-trail waypoint dots (same inner-wrapper rule as .tl-ship) */
.tl-wp { cursor: pointer; }
.tl-wp .tlw-in { position: relative; display: block; width: 6px; height: 6px; }
.tl-wp svg { display: block; }
.tl-wp:hover svg { transform: scale(1.6); }
.tl-wp-year {
  position: absolute; top: 7px; left: 50%; transform: translateX(-50%);
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 9.5px;
  color: #6e1f14; white-space: nowrap; line-height: 1; pointer-events: none;
  text-shadow: 0 0 3px ${PARCH}, 0 0 3px ${PARCH}, 0 0 4px ${PARCH};
}
`;
  document.head.appendChild(css);

  /* ---------- timeline bar ---------- */

  const bar = document.createElement('div');
  bar.id = 'tl-bar';
  let ticksHTML = '', segsHTML = '';
  for (let y = YR_MIN; y <= YR_MAX; y += 10) {
    ticksHTML += `<span class="tl-tick" style="left:${((y - YR_MIN) / YR_SPAN) * 100}%">${y}</span>`;
  }
  for (let i = 0; i < 8; i++) segsHTML += `<span class="tl-seg${i % 2 ? '' : ' f'}"></span>`;
  bar.innerHTML = `
    <div class="tl-head">
      <span class="tl-title">The Years of the Brethren</span>
      <label class="tl-pyr"><input type="checkbox" id="tl-pyr-cb" checked> ☠ Pyrates</label>
    </div>
    <div class="tl-main">
      <button class="tl-play" title="let the years run">⏵</button>
      <div class="tl-track">
        ${ticksHTML}
        <div class="tl-scale">${segsHTML}</div>
        <div class="tl-handle" tabindex="0" role="slider" aria-label="Year"
             aria-valuemin="${YR_MIN}" aria-valuemax="${YR_MAX}" aria-valuenow="${YR_MAX}">
          <svg width="17" height="32" viewBox="0 0 17 32">
            <path class="tl-dia" d="M8.5 1 L14.5 12 L8.5 31 L2.5 12 Z" fill="${MADDER}" stroke="${INK}" stroke-width="1"/>
            <path d="M8.5 31 L14.5 12 L8.5 12 Z" fill="${INK}" opacity="0.45"/>
            <circle cx="8.5" cy="12" r="1.7" fill="${PAPER}"/>
          </svg>
        </div>
      </div>
      <div class="tl-right">
        <div class="tl-year"></div>
        <div class="tl-era"></div>
      </div>
    </div>`;
  document.body.appendChild(bar);

  const track = bar.querySelector('.tl-track');
  const handle = bar.querySelector('.tl-handle');
  const playBtn = bar.querySelector('.tl-play');
  const yearEl = bar.querySelector('.tl-year');
  const eraEl = bar.querySelector('.tl-era');
  const pyrCb = bar.querySelector('#tl-pyr-cb');

  const state = { pos: YR_MAX };   // continuous position; published year = round(pos)

  let pubScheduled = false;
  function publish() {            // throttle cartaTime.set to animation frames
    if (pubScheduled) return;
    pubScheduled = true;
    requestAnimationFrame(() => {
      pubScheduled = false;
      const y = Math.round(state.pos);
      if (window.cartaTime && window.cartaTime.year !== y) window.cartaTime.set(y);
    });
  }

  function renderBar() {
    const y = Math.round(state.pos);
    handle.style.left = (((state.pos - YR_MIN) / YR_SPAN) * 100) + '%';
    handle.setAttribute('aria-valuenow', y);
    yearEl.textContent = 'Anno ' + y;
    eraEl.textContent = eraName(y);
  }

  function setPos(p, immediate) {
    state.pos = Math.max(YR_MIN, Math.min(YR_MAX, p));
    renderBar();
    if (immediate) {
      const y = Math.round(state.pos);
      if (window.cartaTime && window.cartaTime.year !== y) window.cartaTime.set(y);
    } else publish();
  }

  // drag (anywhere on the track, handle included)
  track.addEventListener('pointerdown', (e) => {
    stopPlay();
    track.setPointerCapture(e.pointerId);
    handle.focus({ preventScroll: true });
    const move = (ev) => {
      const r = track.getBoundingClientRect();
      setPos(YR_MIN + ((ev.clientX - r.left) / r.width) * YR_SPAN);
    };
    move(e);
    const done = () => {
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', done);
      track.removeEventListener('pointercancel', done);
      track.removeEventListener('lostpointercapture', done);
      setPos(Math.round(state.pos)); // settle on the whole year
    };
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', done);
    track.addEventListener('pointercancel', done);
    track.addEventListener('lostpointercapture', done);
    e.preventDefault();
  });

  handle.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { stopPlay(); setPos(Math.round(state.pos) - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { stopPlay(); setPos(Math.round(state.pos) + 1); e.preventDefault(); }
  });

  // ⏵ let the years run — ~3 years/second until 1730
  let playing = false, lastTs = 0;
  function stopPlay() { playing = false; playBtn.textContent = '⏵'; }
  function tickPlay(ts) {
    if (!playing) return;
    const dt = Math.min(0.1, (ts - lastTs) / 1000);
    lastTs = ts;
    setPos(state.pos + dt * 3);
    if (state.pos >= YR_MAX) { setPos(YR_MAX); stopPlay(); return; }
    requestAnimationFrame(tickPlay);
  }
  playBtn.addEventListener('click', () => {
    if (playing) { stopPlay(); return; }
    if (state.pos >= YR_MAX) return;
    playing = true;
    playBtn.textContent = '⏸';
    lastTs = performance.now();
    requestAnimationFrame(tickPlay);
  });

  // test/automation hook: moves the handle and fires cartaTime synchronously
  window.cartaTimelineSet = (y) => setPos(y, true);

  renderBar();

  /* ---------- pirate ships ---------- */

  function flagGlyph(motif) {
    // tiny white motif shapes, drawn inside the flag rect (x 13..22, y 2.5..8)
    const w = PAPER;
    switch (motif) {
      case 'skull-bones':
        return `<circle cx="17.5" cy="4.4" r="1.2" fill="${w}"/>
          <path d="M15.6 6.4 L19.4 7.3 M19.4 6.4 L15.6 7.3" stroke="${w}" stroke-width="0.7"/>`;
      case 'skull-hourglass':
        return `<circle cx="16" cy="4.9" r="1.1" fill="${w}"/>
          <path d="M18.3 3.6 h2 l-2 3 h2 z" fill="${w}"/>`;
      case 'skeleton-heart':
        return `<circle cx="16.4" cy="4" r="0.85" fill="${w}"/>
          <path d="M16.4 4.8 V6.8 M15.2 5.5 H17.6 M16.4 6.8 L15.6 7.6 M16.4 6.8 L17.2 7.6" stroke="${w}" stroke-width="0.6"/>
          <circle cx="19.1" cy="5" r="0.6" fill="${w}"/>`;
      case 'full-skeleton':
        return `<circle cx="17.5" cy="3.9" r="0.85" fill="${w}"/>
          <path d="M17.5 4.7 V6.8 M16.2 5.5 H18.8 M17.5 6.8 L16.6 7.7 M17.5 6.8 L18.4 7.7" stroke="${w}" stroke-width="0.6"/>`;
      case 'arm-cutlass':
        return `<path d="M15.2 7.4 q1 -1.6 2.3 -1.9" stroke="${w}" stroke-width="0.8" fill="none"/>
          <path d="M17.3 5.6 L19.8 3.7" stroke="${w}" stroke-width="0.8"/>
          <path d="M17.1 4.9 L17.9 6" stroke="${w}" stroke-width="0.6"/>`;
      default:
        return '';
    }
  }

  function pirateShipSVG(flag) {
    if (window.cartaIcons) return window.cartaIcons.pirateShip(flag);
    const flagColor = flag.motif === 'red-plain' ? '#8a2418' : '#1c1c1c';
    return `<svg width="26" height="26" viewBox="0 0 26 26">
      <g stroke="${INK}" fill="none" stroke-width="1.2" stroke-linecap="round">
        <path d="M5 18.5 Q13 22.5 21 18.5 L19.5 15.5 H6.5 Z" fill="rgba(91,70,54,0.3)"/>
        <path d="M12 15.5 V3.5"/>
        <path d="M12 6.5 q5.5 3.5 0 8.5" stroke-width="1"/>
        <path d="M12 7.5 q-4.5 3 0 7.5" stroke-width="1"/>
      </g>
      <path d="M12.6 2.5 H22 V8 H12.6 Z" fill="${flagColor}" stroke="${INK}" stroke-width="0.5"/>
      ${flagGlyph(flag.motif)}
    </svg>`;
  }

  function figureHTML(im) {
    if (!im) return '';
    const f = encodeURIComponent(im.commons_file.replace(/^File:/, ''));
    return `<figure class="chart-fig">
      <img src="https://commons.wikimedia.org/wiki/Special:FilePath/${f}?width=300"
           alt="${im.title}" loading="lazy" onerror="this.parentElement.style.display='none'">
      <figcaption>${im.title}${im.creator ? ' — ' + im.creator : ''}, ${im.year}</figcaption>
    </figure>`;
  }

  const trackTime = (pt) => pt.year + (SEASON_Q[pt.season] != null ? SEASON_Q[pt.season] : 0.5);

  // Interpolate only across short coastal hops; beyond this the straight
  // line between track points may cross land, so snap to a real point.
  const INTERP_MAX_DEG = 4;
  function gapDeg(a, b) {
    const dLat = b.lat - a.lat;
    let dLon = b.lon - a.lon;
    if (dLon > 180) dLon -= 360; else if (dLon < -180) dLon += 360;
    dLon *= Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
    return Math.sqrt(dLat * dLat + dLon * dLon);
  }

  // position along the documented track at time T (clamped to the ends)
  function trackPosAt(trk, T) {
    if (T <= trackTime(trk[0])) return [trk[0].lon, trk[0].lat];
    const last = trk[trk.length - 1];
    if (T >= trackTime(last)) return [last.lon, last.lat];
    for (let i = 1; i < trk.length; i++) {
      const t0 = trackTime(trk[i - 1]), t1 = trackTime(trk[i]);
      if (T <= t1) {
        const a = trk[i - 1], b = trk[i];
        if (gapDeg(a, b) >= INTERP_MAX_DEG) {
          // long passage: hold the ship at the nearest-in-time track point
          // (track points are authored at sea; the straight line is not)
          return (T - t0 <= t1 - T) ? [a.lon, a.lat] : [b.lon, b.lat];
        }
        const f = t1 > t0 ? (T - t0) / (t1 - t0) : 0;
        return [a.lon + (b.lon - a.lon) * f,
                a.lat + (b.lat - a.lat) * f];
      }
    }
    return [last.lon, last.lat];
  }

  function nearestNote(trk, T) {
    let best = trk[0], bd = Infinity;
    for (const pt of trk) {
      const d = Math.abs(trackTime(pt) - T);
      if (d < bd) { bd = d; best = pt; }
    }
    return best;
  }

  let pirateImages = {};
  const portraitFor = (p) => pirateImages[p.id] || pirateImages[PORTRAIT_ALIAS[p.id]] || null;

  function dossierHTML(p) {
    const y = window.cartaTime ? window.cartaTime.year : YR_MAX;
    const conf = CONF_TAG[p.flag.confidence] || CONF_TAG.unknown;
    const crew = (p.notable_crew || []).slice(0, 3).map((c) => `${c.name}, ${c.role}`).join('; ');
    const lading = (p.lading || []).slice(0, 3).join('; ');
    const note = nearestNote(p.track, y + 0.5);
    return `<h3>☠ ${p.name} <span style="font-weight:normal">(${p.active_from}–${p.active_to})</span></h3>
      <div class="meta">${p.ship} · ${p.ship_type}</div>
      <p><em>Colours:</em> ${p.flag.description} <span style="font-style:italic;color:${INK_SOFT}">— ${conf}</span></p>
      <p><em>Company:</em> ${p.crew_size ? '~' + p.crew_size + ' men' : 'unknown'}${crew ? '; with ' + crew : ''}</p>
      ${lading ? `<p><em>Prizes &amp; lading:</em> ${lading}</p>` : ''}
      ${note && note.note ? `<p><em>This season:</em> ${note.note}</p>` : ''}
      <p><em>Fate:</em> ${p.fate}</p>
      ${trail.p === p ? `<p style="font-style:italic;color:${INK_SOFT}">(click the ship again to furl the trail)</p>` : ''}
      ${figureHTML(portraitFor(p))}`;
  }

  /* ---------- career trails ---------- */

  const TRAIL_SRC = 'tl-trail';
  const TRAIL_EMPTY = { type: 'FeatureCollection', features: [] };
  map.addSource(TRAIL_SRC, { type: 'geojson', data: TRAIL_EMPTY });
  map.addLayer({
    id: 'tl-trail-line', type: 'line', source: TRAIL_SRC,
    paint: { 'line-color': MADDER, 'line-opacity': 0.65, 'line-width': 1.6, 'line-dasharray': [2, 2] },
  }, map.getLayer('routes-hit') ? 'routes-hit' : undefined);

  // Unwrap longitudes with the same ±360 normalization as gapDeg, carried
  // cumulatively so the career line never jumps the antimeridian.
  function unwrapLons(trk) {
    const out = [];
    let prev = trk[0].lon;
    for (const pt of trk) {
      let lon = pt.lon;
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
      out.push(lon);
      prev = lon;
    }
    return out;
  }

  const trail = { p: null, dots: [] };   // dots: { marker, el, labelEl, lngLat }

  function wpCardHTML(p, pt) {
    const season = pt.season ? pt.season.charAt(0).toUpperCase() + pt.season.slice(1) + ' ' : '';
    return `<h3>☠ ${p.name.split(' (')[0]} — ${season}${pt.year}</h3>
      ${pt.note ? `<p>${pt.note}</p>` : '<p style="font-style:italic">No note survives for this season.</p>'}`;
  }

  function clearTrail() {
    if (!trail.p) return;
    trail.p = null;
    for (const d of trail.dots) d.marker.remove();
    trail.dots = [];
    map.getSource(TRAIL_SRC).setData(TRAIL_EMPTY);
    carta.requestDeclutter();
  }

  function showTrail(p) {
    clearTrail();
    if (!p.track || !p.track.length) return;
    trail.p = p;
    const lons = unwrapLons(p.track);
    const coords = p.track.map((pt, i) => [lons[i], pt.lat]);
    map.getSource(TRAIL_SRC).setData({
      type: 'FeatureCollection',
      features: [{ type: 'Feature', properties: { pirate: p.id }, geometry: { type: 'LineString', coordinates: coords } }],
    });
    let lastLabelYear = null;
    p.track.forEach((pt, i) => {
      const el = document.createElement('div');
      el.className = 'tl-wp';
      const labelled = pt.year !== lastLabelYear;   // first point of each year only
      if (labelled) lastLabelYear = pt.year;
      el.innerHTML = `<span class="tlw-in"><svg width="6" height="6" viewBox="0 0 6 6">
        <path d="M3 0 L6 3 L3 6 L0 3 Z" fill="${MADDER}" stroke="${INK}" stroke-width="0.5"/>
        </svg>${labelled ? `<div class="tl-wp-year">${pt.year}</div>` : ''}</span>`;
      el.addEventListener('mouseenter', () => carta.showCard(wpCardHTML(p, pt)));
      el.addEventListener('mouseleave', carta.hideCard);
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(coords[i]).addTo(map);
      trail.dots.push({ marker, el, labelEl: el.querySelector('.tl-wp-year'), lngLat: coords[i] });
    });
    carta.requestDeclutter();
  }

  // waypoint year labels join the declutter pass; reads the live dots array
  // so removed dots never leave stale entries. Labels show at z >= 3.5 only.
  carta.declutterProviders.push(() => {
    if (!trail.dots.length) return [];
    const z = map.getZoom();
    const items = [];
    for (const d of trail.dots) {
      if (!d.labelEl) continue;
      if (z < 3.5) { d.labelEl.style.display = 'none'; continue; }
      d.labelEl.style.display = '';
      items.push({ el: d.labelEl, lngLat: d.lngLat, dy: 8, pr: 45 });
    }
    return items;
  });

  /* ---------- ship markers ---------- */

  const ships = [];   // { p, marker, el, labelEl, added, lngLat }
  const pyratesOn = () => pyrCb.checked;

  function buildShips(pirates) {
    for (const p of pirates) {
      const el = document.createElement('div');
      el.className = 'tl-ship';
      el.innerHTML = `<span class="tls-in">${pirateShipSVG(p.flag)}<div class="tl-ship-label">${p.name.split(' (')[0]}</div></span>`;
      const s = { p, el, labelEl: el.querySelector('.tl-ship-label'), added: false, lngLat: [0, 0] };
      el.addEventListener('mouseenter', () => carta.showCard(dossierHTML(p)));
      el.addEventListener('mouseleave', carta.hideCard);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const z = map.getZoom();
        map.flyTo({ center: s.lngLat, zoom: z < 5 ? 5 : z, duration: 2200 });
        if (trail.p === p) clearTrail(); else showTrail(p);
        carta.showCard(dossierHTML(p));   // refresh the furl hint on the open card
      });
      s.marker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([0, 0]);
      ships.push(s);
    }
  }

  function updateShips(y) {
    const T = y + 0.5;
    for (const s of ships) {
      const active = y >= s.p.active_from && y <= s.p.active_to;
      if (!active) {
        if (s.added) {
          s.marker.remove(); s.added = false;
          if (trail.p === s.p) clearTrail();   // its ship left the chart
        }
        continue;
      }
      s.lngLat = trackPosAt(s.p.track, T);
      s.marker.setLngLat(s.lngLat);
      if (!s.added) { s.marker.addTo(map); s.added = true; }
      s.el.style.display = pyratesOn() ? '' : 'none';
    }
    carta.requestDeclutter();
  }

  pyrCb.addEventListener('change', () => {
    for (const s of ships) if (s.added) s.el.style.display = pyratesOn() ? '' : 'none';
    if (!pyratesOn()) clearTrail(); // no ships, no trail
    carta.requestDeclutter();
  });

  // ship name labels join the app-wide declutter pass
  carta.declutterProviders.push(() => {
    if (!pyratesOn()) return [];
    const items = [];
    for (const s of ships) {
      if (!s.added || s.el.style.display === 'none') continue;
      items.push({ el: s.labelEl, lngLat: s.lngLat, dy: 14, pr: 95 });
    }
    return items;
  });

  if (window.cartaTime) window.cartaTime.on((y) => {
    if (y !== Math.round(state.pos)) { state.pos = y; renderBar(); } // follow external sets
    updateShips(y);
  });

  Promise.all([
    fetch('/data/timeline/pirates.json').then((r) => r.json()),
    fetch('/data/images.json').then((r) => r.json()).catch(() => ({ images: [] })),
  ]).then(([pdata, imdata]) => {
    for (const im of (imdata.images || [])) {
      if (im.subject_type === 'pirate' && !pirateImages[im.subject_id]) pirateImages[im.subject_id] = im;
    }
    buildShips(pdata.pirates || []);
    updateShips(window.cartaTime ? window.cartaTime.year : YR_MAX);
  }).catch((e) => console.error('timeline: pirates load failed', e));
});
