/* Carta Temporum — tours module (guided story tours).
   Registered via window.cartaInits. A "Tales" button on the timeline bar
   opens a parchment menu of tours; each tour choreographs the camera and
   the year slider through its steps, with a caption card above the bar. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function init_tours(carta) {
  const map = carta.map;
  const { INK, INK_SOFT, MADDER_D, PAPER } = carta.COLORS;

  /* ---------- styles ---------- */

  const css = document.createElement('style');
  css.textContent = `
#tales-btn {
  font-family: 'IM Fell English', serif; font-size: 11.5px; cursor: pointer;
  color: ${MADDER_D}; white-space: nowrap; background: none; border: none; padding: 0;
}
#tales-btn:hover { text-decoration: underline; }
#tales-menu {
  position: absolute; bottom: calc(100% + 10px); left: 50%; transform: translateX(-50%);
  width: min(460px, 78vw); z-index: 31;
  padding: 8px 10px 9px;
}
#tales-menu .tm-head {
  font-family: 'IM Fell English SC', serif; font-size: 12px; letter-spacing: 2.5px;
  color: ${INK_SOFT}; padding: 0 4px 5px; border-bottom: 1px solid rgba(61,47,30,0.35);
}
#tales-menu .tour-item { padding: 6px 8px 7px; cursor: pointer; }
#tales-menu .tour-item + .tour-item { border-top: 1px dotted rgba(61,47,30,0.3); }
#tales-menu .tour-item:hover { background: rgba(138,59,46,0.12); }
#tales-menu .ti-title { font-family: 'IM Fell English SC', serif; font-size: 13.5px; letter-spacing: 0.5px; }
#tales-menu .ti-blurb { font-size: 11px; font-style: italic; color: ${INK_SOFT}; line-height: 1.35; margin-top: 1px; }
#tour-caption {
  position: fixed; left: 50%; bottom: 132px; transform: translateX(-50%);
  width: min(580px, 72vw); z-index: 31;
  padding: 8px 34px 8px 14px;
}
#tour-caption .tc-title {
  font-family: 'IM Fell English SC', serif; font-size: 14px; letter-spacing: 1.5px; color: ${INK};
}
#tour-caption .tc-text { font-size: 12.5px; line-height: 1.45; margin: 4px 0 3px; }
#tour-caption .tc-step { font-size: 10px; font-style: italic; color: ${INK_SOFT}; }
#tour-caption .tc-x {
  position: absolute; top: 6px; right: 10px; cursor: pointer; background: none; border: none;
  color: ${INK_SOFT}; font-size: 14px; font-family: serif; padding: 0;
}
#tour-caption .tc-x:hover { color: ${MADDER_D}; }`;
  document.head.appendChild(css);

  /* ---------- state ---------- */

  let tours = [];
  let menuEl = null;
  let captionEl = null;
  const tour = { def: null, i: 0, active: false, timer: 0, fb: 0, moveHandler: null };

  /* ---------- caption card ---------- */

  function showCaption(def, st, i) {
    if (!captionEl) {
      captionEl = document.createElement('div');
      captionEl.id = 'tour-caption';
      captionEl.className = 'carta-panel';
      document.body.appendChild(captionEl);
    }
    captionEl.innerHTML = `<button class="tc-x" title="end the tale">✕</button>
      <div class="tc-title">${def.title}</div>
      <p class="tc-text">${st.caption}</p>
      <div class="tc-step">step ${i + 1} of ${def.steps.length} · Anno ${st.year}</div>`;
    captionEl.querySelector('.tc-x').addEventListener('click', cancelTour);
  }

  function removeCaption() {
    if (captionEl) { captionEl.remove(); captionEl = null; }
  }

  /* ---------- cancellation ---------- */

  const onUserInput = () => cancelTour();
  const onKey = (e) => { if (e.key === 'Escape') cancelTour(); };

  function addCancelListeners() {
    const canvas = map.getCanvas();
    canvas.addEventListener('pointerdown', onUserInput);
    canvas.addEventListener('wheel', onUserInput, { passive: true });
    canvas.addEventListener('touchstart', onUserInput, { passive: true });
    document.addEventListener('keydown', onKey);
  }

  function removeCancelListeners() {
    const canvas = map.getCanvas();
    canvas.removeEventListener('pointerdown', onUserInput);
    canvas.removeEventListener('wheel', onUserInput);
    canvas.removeEventListener('touchstart', onUserInput);
    document.removeEventListener('keydown', onKey);
  }

  function clearStep() {
    if (tour.timer) { clearTimeout(tour.timer); tour.timer = 0; }
    if (tour.fb) { clearTimeout(tour.fb); tour.fb = 0; }
    if (tour.moveHandler) { map.off('moveend', tour.moveHandler); tour.moveHandler = null; }
  }

  // ends the tour; camera and year stay where they are
  function cancelTour() {
    if (!tour.active) return;
    tour.active = false;
    tour.def = null;
    clearStep();
    removeCaption();
    removeCancelListeners();
    document.body.classList.remove('touring');
  }

  /* ---------- playback ---------- */

  function runStep() {
    if (!tour.active) return;
    const def = tour.def, i = tour.i;
    if (i >= def.steps.length) { cancelTour(); return; }
    const st = def.steps[i];
    if (window.cartaTimelineSet) window.cartaTimelineSet(st.year);
    else if (window.cartaTime) window.cartaTime.set(st.year);
    showCaption(def, st, i);

    const onEnd = () => {
      if (tour.moveHandler !== onEnd) return;   // stale (cancelled/raced)
      tour.moveHandler = null;
      if (tour.fb) { clearTimeout(tour.fb); tour.fb = 0; }
      tour.timer = setTimeout(() => {
        tour.timer = 0;
        tour.i++;
        runStep();
      }, st.hold_ms || 4000);
    };
    tour.moveHandler = onEnd;
    map.once('moveend', onEnd);
    // fallback: if the camera is already at the target, moveend never fires
    tour.fb = setTimeout(() => {
      tour.fb = 0;
      if (tour.moveHandler === onEnd) { map.off('moveend', onEnd); onEnd(); }
    }, (st.fly_ms || 3000) + 1500);
    map.flyTo({ center: st.center, zoom: st.zoom, duration: st.fly_ms || 3000 });
  }

  function startTour(def) {
    cancelTour();
    closeMenu();
    if (carta.activeTool) {
      carta.showCard('<h3>Stow your tools first</h3><p>A tool is in hand upon the chart — put it up before the tale begins.</p>');
      setTimeout(carta.hideCard, 2600);
      return;
    }
    tour.def = def;
    tour.i = 0;
    tour.active = true;
    document.body.classList.add('touring');
    addCancelListeners();
    runStep();
  }

  /* ---------- menu & button ---------- */

  function onDocDown(e) {
    if (menuEl && !menuEl.contains(e.target) && e.target.id !== 'tales-btn') closeMenu();
  }

  function closeMenu() {
    if (!menuEl) return;
    menuEl.remove();
    menuEl = null;
    document.removeEventListener('pointerdown', onDocDown);
  }

  function openMenu(bar) {
    menuEl = document.createElement('div');
    menuEl.id = 'tales-menu';
    menuEl.className = 'carta-panel';
    menuEl.innerHTML = '<div class="tm-head">Tales of These Waters</div>' +
      tours.map((t, i) =>
        `<div class="tour-item" data-i="${i}">
          <div class="ti-title">${t.title}</div>
          <div class="ti-blurb">${t.blurb}</div>
        </div>`).join('');
    menuEl.addEventListener('click', (e) => {
      const it = e.target.closest('.tour-item');
      if (it) startTour(tours[+it.dataset.i]);
    });
    bar.appendChild(menuEl);
    document.addEventListener('pointerdown', onDocDown);
  }

  function attachButton(retries) {
    const bar = document.getElementById('tl-bar');
    const head = bar && bar.querySelector('.tl-head');
    if (!head) {
      if (retries > 0) setTimeout(() => attachButton(retries - 1), 300);
      else console.warn('tours: #tl-bar .tl-head not found, Tales button not attached');
      return;
    }
    const btn = document.createElement('button');
    btn.id = 'tales-btn';
    btn.type = 'button';
    btn.textContent = 'Tales 📜';
    btn.title = 'guided tales of the age';
    btn.addEventListener('click', () => {
      if (menuEl) closeMenu();
      else openMenu(bar);
    });
    // between the bar title and the Pyrates toggle
    head.insertBefore(btn, head.querySelector('.tl-pyr'));
  }

  /* ---------- load ---------- */

  fetch('/data/tours.json')
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((data) => {
      tours = data.tours || [];
      if (!tours.length) return;
      attachButton(10);
    })
    .catch((e) => console.warn('tours: load failed, module disabled', e));
});
