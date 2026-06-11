/* Carta Temporum — sealife module: small theatre upon the open sea.
   1. The hand's wake: ink ripple-rings spread where the cursor passes over
      navigable water, as if a finger trailed in the chart's sea.
   2. Hurricanoes: while the Living Sea runs, now and again a slate spiral
      of storm crosses the western ocean along the old hurricane roads and
      dissipates — a small terror, decently labelled.
   Both draw on one 2D canvas above the chart, below all markers.
   Registered via window.cartaInits. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function init_sealife(carta) {
  const map = carta.map;
  if (carta.reducedMotion.matches) return;

  const W = window.cartaWind; // for isWater; rings degrade gracefully without it

  /* ---------- canvas: above the flowfx canvas, below all DOM markers ---------- */

  const { cnv, ctx, dpr: dprCap } = carta.makeOverlayCanvas('sealife-canvas');

  /* ---------- the hand's wake ---------- */

  const rings = [];           // { lon, lat, born, dur, maxR }
  const RING_MAX = 36;
  let lastSpawn = 0, lastX = -99, lastY = -99;

  map.getContainer().addEventListener('mousemove', (e) => {
    const now = performance.now();
    if (now - lastSpawn < 90) return;
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    if (dx * dx + dy * dy < 144) return; // a resting hand makes no wake
    const rect = map.getContainer().getBoundingClientRect();
    const ll = map.unproject([e.clientX - rect.left, e.clientY - rect.top]);
    const lon = carta.geo.normLon(ll.lng);
    if (W && W.isWater && !W.isWater(lon, ll.lat)) return;
    lastSpawn = now; lastX = e.clientX; lastY = e.clientY;
    rings.push({ lon: ll.lng, lat: ll.lat, born: now, dur: 1000 + Math.random() * 400, maxR: 10 + Math.random() * 8 });
    if (rings.length > RING_MAX) rings.shift();
    start();
  });

  /* ---------- hurricanoes ---------- */

  let storm = null;           // { pts, born, dur, sizeDeg }
  let livingOn = false;

  // The old hurricane roads: bred east of the Caribbee Islands, walking
  // west-north-west, recurving north up the American coast.
  function spawnStorm() {
    const j = (a) => a + (Math.random() - 0.5) * 6;
    storm = {
      pts: [
        [j(-44), j(13)], [j(-60), j(16)], [j(-74), j(22)], [j(-77), j(30)], [j(-66) , j(39)],
      ],
      born: performance.now(),
      dur: 38000,
      sizeDeg: 2.6 + Math.random() * 1.4,
    };
    start();
  }

  // de Casteljau over the 5 control points: a smooth storm-walk
  function trackAt(pts, t) {
    let a = pts;
    while (a.length > 1) {
      const b = [];
      for (let i = 0; i < a.length - 1; i++) {
        b.push([a[i][0] + (a[i + 1][0] - a[i][0]) * t, a[i][1] + (a[i + 1][1] - a[i][1]) * t]);
      }
      a = b;
    }
    return a[0];
  }

  setInterval(() => {
    if (!livingOn || storm || document.hidden) return;
    if (Math.random() < 0.10) spawnStorm(); // expected wait ≈ 50 s
  }, 5000);

  if (carta.ordnances) {
    const apply = (st) => {
      livingOn = !!st.living;
      if (!livingOn) storm = null;
    };
    carta.ordnances.onChange(apply);
    apply(carta.ordnances.state);
  }

  /* ---------- render loop ---------- */

  let raf = 0;
  const ramp = (t, a, b) => Math.min(1, Math.min(t / a, (1 - t) / b)); // fade in/out

  function drawStorm(now, world) {
    const t = (now - storm.born) / storm.dur;
    if (t >= 1) { storm = null; return; }
    if (map.getZoom() > 6.8) return; // a town plan has no weather
    const pos = trackAt(storm.pts, t);
    const p = carta.projectWrapped(pos);
    const cw = cnv.width / dprCap(), ch = cnv.height / dprCap();
    const rpx = (storm.sizeDeg / 360) * world * (0.7 + 0.3 * Math.sin(t * Math.PI));
    if (p.x < -rpx || p.x > cw + rpx || p.y < -rpx || p.y > ch + rpx) return;
    const alpha = 0.55 * ramp(t, 0.12, 0.18);
    const spin = -((now - storm.born) / 1000) * 1.5; // widdershins, as in the north

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = `rgba(60,72,92,${alpha.toFixed(3)})`;
    ctx.lineCap = 'round';
    for (let arm = 0; arm < 4; arm++) {
      ctx.beginPath();
      for (let k = 0; k <= 36; k++) {
        const f = k / 36;
        const th = spin + (arm * Math.PI) / 2 + f * 3.2 * Math.PI;
        const r = rpx * Math.pow(f, 1.35);
        const x = r * Math.cos(th), y = r * Math.sin(th) * 0.92; // a touch oblate
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.5, rpx * 0.05), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (map.getZoom() >= 2.6) {
      ctx.fillStyle = `rgba(110,31,20,${(alpha * 1.4).toFixed(3)})`;
      ctx.font = 'italic 13px "IM Fell English", serif';
      ctx.fillText('a hurricano', p.x + rpx * 0.75, p.y - rpx * 0.75);
    }
  }

  function frame() {
    raf = 0;
    if (document.hidden) return;
    const dpr = dprCap();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cnv.width, cnv.height);

    const now = performance.now();
    const moving = map.isMoving();
    const world = 512 * Math.pow(2, map.getZoom());

    if (!moving) {
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i];
        const t = (now - r.born) / r.dur;
        if (t >= 1) { rings.splice(i, 1); continue; }
        const p = carta.projectWrapped([r.lon, r.lat]);
        const ease = 1 - Math.pow(1 - t, 2);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.5 + ease * r.maxR, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(91,70,54,${(0.34 * (1 - t)).toFixed(3)})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
        if (t > 0.25) { // the second, fainter ring astern
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1 + (ease - 0.25) * r.maxR * 0.55, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(91,70,54,${(0.2 * (1 - t)).toFixed(3)})`;
          ctx.stroke();
        }
      }
      if (storm) drawStorm(now, world);
    }

    if (rings.length || storm) raf = requestAnimationFrame(frame);
  }

  function start() { if (!raf && !document.hidden) raf = requestAnimationFrame(frame); }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) start();
  });
  map.on('move', start); // storms must keep their sea-room while panning

  // test hook: conjure a storm at once
  window.cartaSealife = { _stormNow: spawnStorm, get storm() { return storm; }, get rings() { return rings.length; } };
});
