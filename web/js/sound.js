/* Carta Temporum — sound module: synthesized ambience (surf wash, rigging
   creaks, distant gulls), WebAudio only, no assets. Registered via
   window.cartaInits. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function init_sound(carta) {
  const map = carta.map;
  const MASTER_GAIN = 0.12;

  let ctx = null;
  let master = null;
  let surfGain = null;   // intrinsic value carries the zoom tie-in; LFO adds on top
  let on = false;
  let eventTimer = 0;

  /* ---------- graph (built once, inside a user gesture) ---------- */
  function buildGraph() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);

    // Surf: looped white noise -> lowpass ~420 Hz, breathing slowly.
    const len = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.7;
    surfGain = ctx.createGain();
    surfGain.gain.value = 1;
    noise.connect(lp);
    lp.connect(surfGain);
    surfGain.connect(master);
    noise.start();

    // One slow swell LFO (0.07 Hz) drives both filter freq (±150 Hz) and
    // surf gain (±20%).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoToFreq = ctx.createGain();
    lfoToFreq.gain.value = 150;
    lfo.connect(lfoToFreq);
    lfoToFreq.connect(lp.frequency);
    const lfoToGain = ctx.createGain();
    lfoToGain.gain.value = 0.2;
    lfo.connect(lfoToGain);
    lfoToGain.connect(surfGain.gain);
    lfo.start();

    scheduleEvent();
  }

  /* ---------- sparse events ---------- */
  function creak() {
    const t = ctx.currentTime + 0.02;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(80, t);
    o.frequency.linearRampToValueAtTime(60, t + 0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 320;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22, t + 0.07);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(f);
    f.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + 0.45);
  }

  function gull() {
    for (let i = 0; i < 2; i++) {
      const t = ctx.currentTime + 0.02 + i * 0.18;
      const o = ctx.createOscillator(); // chirp carrier 1.2 -> 2.2 kHz
      o.type = 'sine';
      o.frequency.setValueAtTime(1200, t);
      o.frequency.exponentialRampToValueAtTime(2200, t + 0.09);
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.14);
      const mod = ctx.createOscillator(); // light FM warble
      mod.frequency.value = 38;
      const modGain = ctx.createGain();
      modGain.gain.value = 110;
      mod.connect(modGain);
      modGain.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.connect(g);
      g.connect(master);
      o.start(t);
      o.stop(t + 0.16);
      mod.start(t);
      mod.stop(t + 0.16);
    }
  }

  function scheduleEvent() {
    clearTimeout(eventTimer);
    eventTimer = setTimeout(() => {
      if (on && ctx && ctx.state === 'running' && !document.hidden) {
        (Math.random() < 0.55 ? creak : gull)();
      }
      scheduleEvent();
    }, 12000 + Math.random() * 28000); // every 12–40 s
  }

  /* ---------- zoom tie-in: closer to shore, louder the surf ---------- */
  function surfForZoom() {
    if (!ctx || !surfGain) return;
    const z = map.getZoom();
    const k = Math.min(1, Math.max(0, (z - 7) / 3));
    surfGain.gain.setTargetAtTime(1 + 0.35 * k, ctx.currentTime, 0.4);
  }
  map.on('zoom', () => { if (on) surfForZoom(); });

  /* ---------- lifecycle ---------- */
  function setEnabled(b) {
    on = !!b;
    if (on) {
      buildGraph(); // must be reached from a user gesture the first time
      if (!ctx) return;
      if (ctx.state !== 'running') ctx.resume().catch(() => {});
      surfForZoom();
      scheduleEvent();
    } else if (ctx && ctx.state === 'running') {
      ctx.suspend().catch(() => {});
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend().catch(() => {});
    else if (on) ctx.resume().catch(() => {});
  });

  window.cartaSound = {
    setEnabled,
    enabled: () => on,
    get ctx() { return ctx; },
  };

  /* ---------- Ordnances wiring (overlays inits before us) ---------- */
  if (carta.ordnances) {
    // The change callback fires synchronously inside the row's click, so
    // building/resuming the AudioContext from it satisfies gesture rules.
    carta.ordnances.onChange((st) => setEnabled(!!st.sound));
    if (carta.ordnances.state.sound) {
      // Persisted-on at boot: no gesture yet — arm a one-time pointerdown.
      on = true;
      window.addEventListener('pointerdown', () => { if (on) setEnabled(true); }, { once: true });
    }
  }
});
