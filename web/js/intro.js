/* Carta Temporum — intro module: a cinematic opening on a fresh visit.
   The chart wakes at the full breadth of the world, the title bleeds onto
   the parchment like fresh ink, and the camera bears away slowly for the
   Caribbean while Nassau's isochrones bloom. Any touch of the chart ends
   it at once. Skipped for shared links (hash present) and reduced motion.
   Registered via window.cartaInits. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function init_intro(carta) {
  const map = carta.map;
  const h = carta.cartaHash.read();
  if (h.port || h.origin || h.voyage) return; // came by a shared link: straight to it
  if (carta.reducedMotion.matches) return;

  const { INK, INK_SOFT, MADDER_D } = carta.COLORS;

  /* ---------- styles ---------- */

  const css = document.createElement('style');
  css.textContent = `
#intro-veil {
  position: fixed; inset: 0; z-index: 60; pointer-events: none;
  display: flex; align-items: center; justify-content: center;
  background: radial-gradient(ellipse at center, rgba(231,216,186,0.42) 0%, rgba(231,216,186,0) 62%);
  transition: opacity 1.4s ease;
}
#intro-veil.intro-out { opacity: 0; }
#intro-title { text-align: center; color: ${INK}; }
#intro-title .in-flourish {
  font-size: 26px; color: ${MADDER_D}; opacity: 0;
  animation: intro-bleed 2.2s ease 0.3s forwards;
}
#intro-title h1 {
  margin: 6px 0 10px; font-family: 'IM Fell English SC', 'IM Fell English', serif;
  font-weight: normal; font-size: clamp(34px, 6.5vw, 64px); letter-spacing: 10px;
  opacity: 0; animation: intro-bleed 3s ease 0.8s forwards;
  text-shadow: 0 0 18px rgba(240,228,200,0.95), 0 0 6px rgba(240,228,200,0.95);
}
#intro-title .in-sub {
  font-family: 'IM Fell English', serif; font-style: italic;
  font-size: clamp(13px, 1.8vw, 17px); line-height: 1.6; color: ${INK_SOFT};
  opacity: 0; animation: intro-bleed 2.6s ease 2s forwards;
  text-shadow: 0 0 12px rgba(240,228,200,0.95), 0 0 5px rgba(240,228,200,0.95);
}
#intro-title .in-rule {
  width: 180px; height: 1px; margin: 12px auto; background: ${INK_SOFT};
  transform: scaleX(0); animation: intro-rule 1.8s ease 1.6s forwards;
}
#intro-title.intro-title-out { transition: opacity 2s ease, transform 2s ease; opacity: 0 !important; transform: scale(1.04); }
#intro-title.intro-title-out * { animation-play-state: paused; }
#intro-hint {
  position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 60;
  pointer-events: none; font-family: 'IM Fell English', serif; font-style: italic;
  font-size: 14px; color: ${INK}; padding: 4px 16px;
  text-shadow: 0 0 10px rgba(240,228,200,0.95), 0 0 4px rgba(240,228,200,0.95);
  opacity: 0; transition: opacity 1.6s ease;
}
#intro-hint.intro-hint-in { opacity: 1; }
@keyframes intro-bleed {
  from { opacity: 0; filter: blur(7px); }
  60%  { opacity: 1; }
  to   { opacity: 1; filter: blur(0); }
}
@keyframes intro-rule { to { transform: scaleX(1); } }
`;
  document.head.appendChild(css);

  /* ---------- the telling ---------- */

  const veil = document.createElement('div');
  veil.id = 'intro-veil';
  veil.innerHTML = `<div id="intro-title">
    <div class="in-flourish">❦</div>
    <h1>Carta Temporum</h1>
    <div class="in-rule"></div>
    <div class="in-sub">being a true chart of sailing times upon all the oceans<br>
      in the years of the brethren of the coast</div>
  </div>`;
  document.body.appendChild(veil);
  const hint = document.createElement('div');
  hint.id = 'intro-hint';
  hint.textContent = 'Choose a port — or prick any point of open sea with a right-click.';
  document.body.appendChild(hint);

  // Open at the breadth of the world; app.js's default selectPort('nassau')
  // keeps this zoom (its easeTo preserves zoom below 6), so the wide view
  // holds until the cinematic bears away below.
  map.jumpTo({ center: [-42, 20], zoom: 1.55 });

  let flying = false;
  const timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function finish(fast) {
    for (const t of timers) clearTimeout(t);
    timers.length = 0;
    window.removeEventListener('pointerdown', cancel, true);
    window.removeEventListener('wheel', cancel, true);
    window.removeEventListener('keydown', cancel, true);
    window.removeEventListener('touchstart', cancel, true);
    if (fast) {
      veil.remove();
      hint.remove();
    } else {
      veil.classList.add('intro-out');
      hint.classList.remove('intro-hint-in');
      setTimeout(() => { veil.remove(); hint.remove(); }, 1600);
    }
  }

  function cancel() {
    if (flying) { flying = false; map.stop(); }
    finish(true);
  }

  window.addEventListener('pointerdown', cancel, true);
  window.addEventListener('wheel', cancel, true);
  window.addEventListener('keydown', cancel, true);
  window.addEventListener('touchstart', cancel, true);

  later(() => {
    flying = true;
    map.easeTo({
      center: [-63, 22], zoom: 3.35, duration: 12500,
      easing: (t) => t * t * (3 - 2 * t), // smoothstep: a slow weigh of anchor
      essential: false,
    });
  }, 1900);
  later(() => {
    const title = veil.querySelector('#intro-title');
    if (title) title.classList.add('intro-title-out');
    hint.classList.add('intro-hint-in');
  }, 11000);
  later(() => { flying = false; finish(false); }, 15200);
});
