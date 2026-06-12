/* Carta Temporum — harborpoi module: points of interest for the diorama. From
   the surveyed harbour plan it floats a labelled marker over every named work
   (forts, churches, public buildings, batteries, wharves, the gallows, greens)
   and over every ship at anchor; hovering or clicking opens a card with the
   period note and, for vessels, the class, guns, crew and burthen. The markers
   are DOM, projected from their 3-D world position to the screen each frame, so
   they stay crisp in the engraved chart hand. Consumed by harbordiorama.js. */
'use strict';

window.cartaHarborPOI = function cartaHarborPOI(THREE) {
  const carta = window.carta;

  const KIND_GLYPH = {
    fort: '✪', church: '✝', building: '⌂', battery: '▤', gallows: '†',
    green: '❧', wharf: '⚓', ship: '⛵',
    chapel: '✟', convent: '✠', meeting: '◇', tavern: '♨', shipwright: '⚙',
    smithy: '⚒', provisioner: '⛁', counting: '⚖', boarding: '☖', tent: '⛺',
    brothel: '♥', gambling: '⚄', governor: '⚜', prison: '▦',
  };
  const KIND_LABEL = {
    fort: 'Fort', church: 'Church', building: 'Public building', battery: 'Battery',
    gallows: 'Gallows', green: 'Plaza', wharf: 'Wharf', ship: 'Ship at anchor',
    chapel: 'Chapel', convent: 'Convent', meeting: 'Meeting house', tavern: 'Tavern',
    shipwright: "Shipwright's yard", smithy: 'Smithy', provisioner: 'Provisioner',
    counting: 'Counting house', boarding: 'Boarding house', tent: 'Encampment',
    brothel: 'Bawdy house', gambling: 'Gaming house', governor: "Governor's house",
    prison: 'Gaol',
  };
  const SHIP_NAME = {
    'man-of-war': 'Man-of-war', merchantman: 'Merchantman',
    brigantine: 'Brigantine', sloop: 'Sloop', canoe: 'Canoe',
  };
  // period-typical specs by type (researched figures)
  const SHIP_SPECS = {
    'man-of-war': { klass: 'Sixth-rate (RN station ship)', guns: '20–28', crew: '~150', tons: '~430' },
    merchantman: { klass: 'Merchantman', guns: '6–16', crew: '25–40', tons: '150–300' },
    brigantine: { klass: 'Brigantine', guns: '6–12', crew: '25–40', tons: '~120' },
    sloop: { klass: 'Sloop', guns: '4–10', crew: '15–30', tons: '~70' },
    canoe: { klass: 'Canoe / periagua', guns: '—', crew: '4–12', tons: '—' },
  };
  // name/note overrides for the researched named vessels
  const SHIP_OVERRIDES = [
    [/capitana/i, { klass: 'Capitana — fleet flagship galleon', guns: '50–62', crew: '200–300', tons: '~700' }],
    [/almiranta/i, { klass: 'Almiranta — vice-flag galleon', guns: '~30', crew: '150–250', tons: '265–500' }],
    [/retourschip|indiaman/i, { klass: 'VOC Retourschip (East Indiaman)', guns: '30–42', crew: '190–240', tons: '~700' }],
    [/fourth-rate|station flagship/i, { klass: 'Fourth-rate ship of the line', guns: '50–60', crew: '280–350', tons: '700–1000' }],
    [/guarda-?costa/i, { klass: 'Guarda-costa sloop', guns: '6–12', crew: '20–40', tons: '~90' }],
    [/register ship/i, { klass: 'Register ship (licensed trader)', guns: '10–20', crew: '40–70', tons: '300–500' }],
  ];
  function shipSpec(type, name, note) {
    const hay = ((name || '') + ' ' + (note || ''));
    for (const [re, spec] of SHIP_OVERRIDES) if (re.test(hay)) return spec;
    return SHIP_SPECS[type] || SHIP_SPECS.merchantman;
  }

  /* The diorama town is built once as the 1730 snapshot (harbortown.js
     filters its landmarks against 1730 and never rebuilds on the timeline),
     so the labels must judge life and death by the same fixed year — a
     timeline year would float labels over buildings that are not there. */
  const SNAPSHOT_YEAR = 1730;
  const alive = (p) => ((p.year_built || 0) <= SNAPSHOT_YEAR)
    && ((p.year_destroyed || 99999) > SNAPSHOT_YEAR);

  function centroidLngLat(f) {
    const g = f.geometry;
    if (g.type === 'Point') return g.coordinates;
    let ring = null;
    if (g.type === 'Polygon') ring = g.coordinates[0];
    else if (g.type === 'MultiPolygon') ring = g.coordinates[0][0];
    else if (g.type === 'LineString') ring = g.coordinates;
    if (!ring || !ring.length) return null;
    let sx = 0, sy = 0;
    for (const [x, y] of ring) { sx += x; sy += y; }
    return [sx / ring.length, sy / ring.length];
  }

  function harbourTitle(id) {
    const b = (carta.harborBoxes || []).find((x) => x.id === id);
    return b ? b.title : '';
  }

  function poiCardHTML(p, title) {
    return `<h3>${p.name}</h3>`
      + `<div class="dpoi-meta">${KIND_LABEL[p.kind] || p.kind} · ${title}`
      + `${p.year_built ? ` · ${p.year_built}` : ''}</div>`
      + (p.guns ? `<p><em>A battery of ${p.guns} guns.</em></p>` : '')
      + (p.note ? `<p>${p.note}</p>` : '');
  }
  function shipCardHTML(s, title) {
    const spec = shipSpec(s.type, s.name, s.note);
    return `<h3>${s.name || SHIP_NAME[s.type] + ' at anchor'}</h3>`
      + `<div class="dpoi-meta">${spec.klass} · ${title}</div>`
      + `<p><em>${spec.guns} guns · ${spec.crew} crew · ${spec.tons} tons</em></p>`
      + (s.note ? `<p>${s.note}</p>` : '');
  }

  function build(harborId, frame) {
    ensureStyle();
    const host = document.getElementById('carta-diorama');
    const layer = document.createElement('div');
    layer.className = 'dpoi-layer';
    const card = document.createElement('div');
    card.className = 'dpoi-card';
    host.append(layer, card);

    const title = harbourTitle(harborId);
    const items = [];

    function addItem(worldXYZ, glyph, labelText, html) {
      const el = document.createElement('div');
      el.className = 'dpoi';
      el.innerHTML = `<span class="dpoi-g">${glyph}</span><span class="dpoi-n">${labelText}</span>`;
      el.addEventListener('mouseenter', () => showCard(html, el));
      el.addEventListener('mouseleave', hideCard);
      el.addEventListener('click', (e) => { e.stopPropagation(); showCard(html, el, true); });
      layer.appendChild(el);
      items.push({ el, pos: new THREE.Vector3(worldXYZ[0], worldXYZ[1], worldXYZ[2]) });
    }

    let cardPinned = false;
    function showCard(html, el, pin) {
      card.innerHTML = html;
      card.classList.add('on');
      const r = el.getBoundingClientRect();
      card.style.left = Math.min(window.innerWidth - 280, r.left) + 'px';
      card.style.top = (r.bottom + 8) + 'px';
      cardPinned = !!pin;
    }
    function hideCard() { if (!cardPinned) card.classList.remove('on'); }
    card.addEventListener('click', () => { cardPinned = false; card.classList.remove('on'); });

    // ---- POIs from the harbour plan (named works) ----
    const plan = carta.harborPlans && carta.harborPlans[harborId];
    if (plan) {
      for (const f of plan.features) {
        const p = f.properties || {};
        if (!p.name || !KIND_GLYPH[p.kind] || p.kind === 'ship') continue;
        if (!alive(p)) continue;
        const ll = centroidLngLat(f);
        if (!ll) continue;
        const xz = frame.project(ll[0], ll[1]);
        const y = (frame.heightAt ? frame.heightAt(xz.x, xz.z) : 0) + 14;
        addItem([xz.x, y, xz.z], KIND_GLYPH[p.kind], p.name, poiCardHTML(p, title));
      }
    }
    // ---- ships at anchor ----
    for (const s of (carta.harborShips || [])) {
      if (s.harbor !== harborId) continue;
      const xz = frame.project(s.lngLat[0], s.lngLat[1]);
      addItem([xz.x, 16, xz.z], KIND_GLYPH.ship,
        s.name || SHIP_NAME[s.type] || 'Ship', shipCardHTML(s, title));
    }

    const _v = new THREE.Vector3();
    const far = (frame.radius || 1500) * 3.2;
    function update(camera) {
      const W = window.innerWidth, H = window.innerHeight;
      for (const it of items) {
        _v.copy(it.pos).project(camera);
        const dist = camera.position.distanceTo(it.pos);
        if (_v.z > 1 || _v.x < -1.1 || _v.x > 1.1 || _v.y < -1.1 || _v.y > 1.1 || dist > far) {
          it.el.style.display = 'none';
          continue;
        }
        it.el.style.display = '';
        it.el.style.left = ((_v.x * 0.5 + 0.5) * W) + 'px';
        it.el.style.top = ((-_v.y * 0.5 + 0.5) * H) + 'px';
        it.el.style.opacity = String(Math.max(0.2, 1 - dist / far));
      }
    }
    function setVisible(on) { layer.style.display = on ? '' : 'none'; if (!on) card.classList.remove('on'); }
    function dispose() { layer.remove(); card.remove(); }

    return { update, setVisible, dispose };
  }

  let styled = false;
  function ensureStyle() {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = `
.dpoi-layer { position: absolute; inset: 0; z-index: 4; pointer-events: none; }
.dpoi {
  position: absolute; transform: translate(-50%, -50%); white-space: nowrap;
  pointer-events: auto; cursor: pointer; text-align: center;
  font-family: 'IM Fell English', serif; color: #f4ead0;
  text-shadow: 0 1px 4px rgba(0,0,0,0.85), 0 0 6px rgba(0,0,0,0.6);
}
.dpoi-g { display: block; font-size: 15px; line-height: 1; color: #ffe9b8; }
.dpoi-n { display: block; font-size: 11px; letter-spacing: 0.6px; margin-top: 1px; }
.dpoi:hover .dpoi-n { text-decoration: underline; }
.dpoi-card {
  position: fixed; z-index: 6; max-width: 260px; display: none; pointer-events: auto;
  padding: 9px 13px 11px; color: #2a1d0e; background: rgba(240,230,205,0.97);
  border: 2px solid #2a1d0e; outline: 1px solid #2a1d0e; outline-offset: 2px;
  box-shadow: 4px 6px 16px rgba(20,14,6,0.4);
  font-family: 'IM Fell English', serif; font-size: 12px; line-height: 1.4;
}
.dpoi-card.on { display: block; }
.dpoi-card h3 { margin: 0 0 2px; font-family: 'IM Fell English SC', 'IM Fell English', serif; font-size: 15px; }
.dpoi-card .dpoi-meta { font-style: italic; font-size: 10.5px; color: #6b573a; margin-bottom: 4px; }
.dpoi-card p { margin: 4px 0 0; }`;
    document.head.appendChild(s);
  }

  return { build };
};
