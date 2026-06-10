/* Carta Temporum — events module (history-pulse markers).
   Registered via window.cartaInits. Engraved event glyphs appear while the
   timeline sits within two years of the event; crossing an event's year
   fires a one-shot engraved pulse at its place on the chart. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function init_events(carta) {
  const map = carta.map;
  const INK = '#3d2f1e', INK_SOFT = '#5b4636', MADDER = '#8a3b2e', MADDER_D = '#6e1f14';
  const PARCH = '#e7d8ba';

  const YEAR_WINDOW = 2;      // marker shown iff |event.year - now| <= 2
  const MIN_ZOOM = 2.6;       // ...and the chart is zoomed in this far
  const LABEL_ZOOM = 4;       // name labels only at z >= 4
  const PULSE_CAP = 6;        // max concurrent pulses
  const JUMP_SPAN = 6;        // |dy| beyond this = decade-jump drag
  const JUMP_PULSES = 4;      // ...pulse only the closest few

  /* ---------- styles ---------- */
  /* NB: never position/transform the marker ROOT — inner-wrapper only
     (see web/css/style.css). */
  const css = document.createElement('style');
  css.textContent = `
.ev-mark { cursor: pointer; }
.ev-mark .ev-in { position: relative; display: block; width: 17px; height: 17px; }
.ev-mark svg { display: block; filter: drop-shadow(0.5px 0.5px 0 rgba(240,228,200,0.9)); }
.ev-mark:hover svg { transform: scale(1.3); }
.ev-label {
  position: absolute; top: 16px; left: 50%; transform: translateX(-50%);
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 10px;
  color: ${MADDER_D}; white-space: nowrap; line-height: 1.1; pointer-events: none;
  text-shadow: 0 0 3px ${PARCH}, 0 0 3px ${PARCH}, 0 0 4px ${PARCH};
}
.ev-pulse { pointer-events: none; }
.ev-pulse .evp-in { position: relative; display: block; width: 64px; height: 64px; }
.ev-pulse .evp-ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 1.5px solid ${MADDER}; box-shadow: inset 0 0 0 1px rgba(61,47,30,0.35);
  opacity: 0; animation: evp-ring 1.7s ease-out forwards;
}
.ev-pulse .evp-ring.r2 { animation-delay: 0.3s; }
.ev-pulse .evp-glyph {
  position: absolute; left: 50%; top: 50%; width: 17px; height: 17px;
  margin: -8.5px 0 0 -8.5px; animation: evp-glyph 2s ease-out forwards;
}
@keyframes evp-ring {
  0% { transform: scale(0.12); opacity: 0.95; }
  100% { transform: scale(1); opacity: 0; }
}
@keyframes evp-glyph {
  0% { opacity: 1; transform: scale(1.45); }
  55% { opacity: 0.85; }
  100% { opacity: 0; transform: scale(0.9); }
}`;
  document.head.appendChild(css);

  /* ---------- engraved type glyphs (~15px in a 17px plate) ---------- */

  function glyphSVG(type) {
    if (window.cartaIcons) return window.cartaIcons.eventGlyph(type);
    const g = `stroke="${INK}" fill="none" stroke-width="1.2" stroke-linecap="round"`;
    let body = '';
    switch (type) {
      case 'battle': // crossed cutlasses, madder guards
        body = `<g ${g}><path d="M3.5 3 Q8 8 13.2 13.8"/><path d="M13.5 3 Q9 8 3.8 13.8"/></g>
          <g stroke="${MADDER}" fill="none" stroke-width="1.2" stroke-linecap="round">
            <path d="M2.4 12.4 q1.5 2.1 3.2 2.7"/><path d="M14.6 12.4 q-1.5 2.1 -3.2 2.7"/></g>`;
        break;
      case 'storm': // engraved spiral, madder eye
        body = `<path d="M8.5 8.5 a1.4 1.4 0 0 1 1.4 1.4 a2.6 2.6 0 0 1 -2.6 2.6
            a4.1 4.1 0 0 1 -4.1 -4.1 a5.5 5.5 0 0 1 5.5 -5.5 a6.6 6.6 0 0 1 6.1 4.2"
            ${g}/><circle cx="8.5" cy="8.5" r="0.9" fill="${MADDER}"/>`;
        break;
      case 'quake': // cracked tower, madder fissure
        body = `<path d="M5 15.5 V5.5 H6.8 V3.8 H8 v1.7 H9 V3.8 h1.2 v1.7 H12 V15.5 Z"
            stroke="${INK}" fill="rgba(91,70,54,0.18)" stroke-width="1.1" stroke-linejoin="round"/>
          <path d="M8.6 15.3 L8.1 12.4 L9.4 10.4 L8.3 7.6" stroke="${MADDER}" fill="none"
            stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>`;
        break;
      case 'sack': // flame, madder heart
        body = `<path d="M8.5 2.2 Q12.8 6.6 11.6 10.8 Q11 13.6 8.5 14.8 Q6 13.6 5.4 10.8 Q4.2 6.6 8.5 2.2 Z"
            stroke="${INK}" fill="rgba(91,70,54,0.15)" stroke-width="1.1" stroke-linejoin="round"/>
          <path d="M8.5 6.2 Q10.4 9.2 8.5 12.4 Q6.6 9.2 8.5 6.2 Z" fill="${MADDER}"/>`;
        break;
      case 'trial': // noose, madder whipping turns
        body = `<path d="M8.5 1.5 V5.4" ${g}/>
          <circle cx="8.5" cy="10.2" r="4.4" stroke="${INK}" fill="none" stroke-width="1.2"/>
          <path d="M7.3 5.4 h2.4 M7.4 6.6 h2.2" stroke="${MADDER}" stroke-width="1" stroke-linecap="round"/>`;
        break;
      default:
        body = `<circle cx="8.5" cy="8.5" r="4" ${g}/>`;
    }
    return `<svg width="17" height="17" viewBox="0 0 17 17">${body}</svg>`;
  }

  function cardHTML(ev) {
    const kind = ev.type.charAt(0).toUpperCase() + ev.type.slice(1);
    return `<h3>${ev.title}</h3>
      <div class="meta">${kind} · ${ev.year}</div>
      <p>${ev.note}</p>
      ${ev.sources && ev.sources.length ? `<p class="src">${ev.sources.join(' · ')}</p>` : ''}`;
  }

  /* ---------- persistent markers ---------- */

  let events = [];
  const marks = [];   // { ev, marker, el, labelEl, lngLat, shown }

  function buildMarkers() {
    for (const ev of events) {
      const el = document.createElement('div');
      el.className = 'ev-mark';
      el.innerHTML = `<span class="ev-in">${glyphSVG(ev.type)}<div class="ev-label">${ev.title}</div></span>`;
      el.style.display = 'none';   // hidden until the timeline nears its year
      el.addEventListener('mouseenter', () => carta.showCard(cardHTML(ev)));
      el.addEventListener('mouseleave', carta.hideCard);
      const lngLat = [ev.lon, ev.lat];
      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lngLat).addTo(map);
      marks.push({ ev, marker, el, labelEl: el.querySelector('.ev-label'), lngLat, shown: false });
    }
  }

  function updateVisible() {
    const y = window.cartaTime ? window.cartaTime.year : 1730;
    const zoomOk = map.getZoom() >= MIN_ZOOM;
    let changed = false;
    for (const m of marks) {
      const show = zoomOk && Math.abs(m.ev.year - y) <= YEAR_WINDOW;
      if (show !== m.shown) {
        m.shown = show;
        m.el.style.display = show ? '' : 'none';
        changed = true;
      }
    }
    if (changed) carta.requestDeclutter();
  }

  // name labels join the app-wide declutter pass (z >= 4 only)
  carta.declutterProviders.push(() => {
    const z = map.getZoom();
    const items = [];
    for (const m of marks) {
      if (!m.shown) continue;
      if (z < LABEL_ZOOM) { m.labelEl.style.display = 'none'; continue; }
      m.labelEl.style.display = '';
      items.push({ el: m.labelEl, lngLat: m.lngLat, dy: 9, pr: 50 });
    }
    return items;
  });

  /* ---------- history pulses ---------- */

  let prevYear = null;
  let activePulses = 0;

  function spawnPulse(ev) {
    activePulses++;
    const el = document.createElement('div');
    el.className = 'ev-pulse';
    el.innerHTML = `<span class="evp-in">
      <span class="evp-ring r1"></span><span class="evp-ring r2"></span>
      <span class="evp-glyph">${glyphSVG(ev.type)}</span></span>`;
    const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
      .setLngLat([ev.lon, ev.lat]).addTo(map);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      activePulses--;
      marker.remove();
    };
    // glyph fade (2s) outlives both rings; remove when it ends
    el.addEventListener('animationend', (e) => {
      if (e.target.classList.contains('evp-glyph')) finish();
    });
    setTimeout(finish, 2600);   // safety net (hidden tab, reduced motion)
  }

  function firePulses(y) {
    const prev = prevYear;
    prevYear = y;
    if (prev == null || y === prev || document.hidden) return;
    // strictly between prev and y, inclusive of the y side, either direction
    let hits = events.filter((ev) =>
      y > prev ? (ev.year > prev && ev.year <= y) : (ev.year >= y && ev.year < prev));
    if (!hits.length) return;
    if (Math.abs(y - prev) > JUMP_SPAN) {
      hits = hits.slice().sort((a, b) => Math.abs(a.year - y) - Math.abs(b.year - y))
        .slice(0, JUMP_PULSES);
    }
    for (const ev of hits) {
      if (activePulses >= PULSE_CAP) break;
      spawnPulse(ev);
    }
  }

  /* ---------- load & wire ---------- */

  fetch('/data/events.json')
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((data) => {
      events = data.events || [];
      if (!events.length) return;
      prevYear = window.cartaTime ? window.cartaTime.year : 1730;
      buildMarkers();
      if (window.cartaTime) window.cartaTime.on((y) => { firePulses(y); updateVisible(); });
      map.on('zoomend', updateVisible);
      updateVisible();
      carta.requestDeclutter();
    })
    .catch((e) => console.warn('events: load failed, module disabled', e));
});
