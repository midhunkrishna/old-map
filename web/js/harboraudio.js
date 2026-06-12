/* Carta Temporum — harbour diorama audio: a recorded CC0 wave loop and a
   per-town CC0 lo-fi track (web/audio/, see CREDITS.md) layered over the
   original synthesis, which stays as the fallback whenever a file is missing
   or still loading. Recipes follow sound.js (lazy AudioContext built from the
   click that opened the diorama, quiet master, filtered-noise surf, FM gulls).
   The master fade-in is armed only once the context is actually running, so
   nothing ever cuts in at full level. Exposed as window.cartaHarborAudio; the
   diorama host calls start(id) / setMode('overview'|'tour') / stop() /
   frame(dt), and the canoe fires the reactive one-shots
   splash/lap/creak/gullNear (all rate-limited, all routed through a shared
   compressed bus so overlaps never spike). */
'use strict';

window.cartaHarborAudio = (function () {
  const MASTER_GAIN = 0.12;   // house level (see sound.js)
  const RAMP_IN = 5.0;        // s — gentle fade-in on start
  const RAMP_BACK = 2.5;      // s — shorter fade when the tab becomes visible again
  const FADE_OUT = 1.5;       // s — fade on stop, then suspend
  const GULL_HOLD = 10;       // s — no gull cries this soon after start
  const WAVES_URL = '/audio/waves.m4a';            // CC0, see web/audio/CREDITS.md
  const TRACK_URLS = ['/audio/town_a.m4a', '/audio/town_b.m4a', '/audio/town_c.m4a'];

  let ctx = null;
  let master = null;
  let surfGain = null;        // base value carries the mode tie-in; LFO rides on top
  let surfLfoDepth = null;    // swell depth, rescaled with the duck so the breathing
                              // stays ±20% of the base instead of swamping it
  let musicGain = null;
  let running = false;
  let mode = 'overview';
  let harborId = '';
  let rng = Math.random;      // reseeded per harbour
  let town = null;            // per-town music character
  let gullTimer = 0, musicTimer = 0, suspendTimer = 0, bellTimer = 0;
  let visitCount = 0;         // bumped per start(); varies the track entry offset
  let trackPass = 0;          // bumped per recorded-track pass, same purpose
  let fxBus = null;           // shared one-shot bus (compressed, see buildGraph)
  let lapGain = null;         // continuous hull-lap layer (built on first lap())
  let lapLevel = 0;           // current requested lap level, pre mode-boost
  let lastSplashAt = -1e9, lastCreakAt = -1e9, lastGullNearAt = -1e9, lastLapAt = -1e9;
  let startGen = 0;           // bumped on start/stop so stale async work no-ops
  let startedAtMs = 0;        // performance.now() of the last start()
  const bufCache = {};        // url -> AudioBuffer | 'loading' | 'failed'
  let wavesSrc = null, wavesGain = null;           // recorded surf loop
  let trackTimer = 0, trackSrc = null, trackEnv = null;  // recorded music player

  /* ---------- seeded per-town character ---------- */
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const MODES = {
    dorian:     [0, 2, 3, 5, 7, 9, 10],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    aeolian:    [0, 2, 3, 5, 7, 8, 10],
  };
  function townCharacter(id) {
    const r = mulberry32(hashStr(String(id)));
    const names = ['dorian', 'mixolydian', 'aeolian'];
    return {
      scale: MODES[names[(r() * names.length) | 0]],
      rootMidi: 50 + ((r() * 10) | 0),              // D3..B3-ish
      noteDur: 0.9 + r() * 0.4,                     // ~50-65 BPM pulse, never hurried
      timbre: (r() * 3) | 0,                        // 0 pluck, 1 pad, 2 flute
      restLo: 6 + r() * 4,                          // 6–10 s …
      restHi: 11 + r() * 4,                         // … to 11–15 s between phrases
      trackUrl: TRACK_URLS[hashStr(String(id)) % TRACK_URLS.length],
      trackRate: 0.97 + r() * 0.06,                 // ±3% so shared tracks differ per town
      bell: r() < 0.45,                             // some towns keep a distant church bell
      bellHz: 165 + r() * 65,                       // E3-ish fundamental, never bright
      seed: r,
    };
  }
  const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- graph (built lazily, from the diorama's opening click) ---------- */
  function buildGraph() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();

    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    // Surf: decorrelated stereo pink-ish noise -> lowpass ~380 Hz, breathing.
    const len = 2 * ctx.sampleRate;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let b0 = 0, b1 = 0, b2 = 0;                  // Paul Kellet pink approximation
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + w * 0.0990460;
        b1 = 0.96300 * b1 + w * 0.2965164;
        b2 = 0.57000 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
      }
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    lp.Q.value = 0.7;
    surfGain = ctx.createGain();
    surfGain.gain.value = 0.5;
    noise.connect(lp);
    lp.connect(surfGain);
    surfGain.connect(master);
    noise.start();

    // One slow swell LFO drives both the filter (±140 Hz) and the gain (±20%).
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoToFreq = ctx.createGain();
    lfoToFreq.gain.value = 140;
    lfo.connect(lfoToFreq);
    lfoToFreq.connect(lp.frequency);
    surfLfoDepth = ctx.createGain();
    surfLfoDepth.gain.value = 0.1;                 // ±20% of base; applyMode rescales
    lfo.connect(surfLfoDepth);
    surfLfoDepth.connect(surfGain.gain);
    lfo.start();

    musicGain = ctx.createGain();
    musicGain.gain.value = 0.38;                   // ~0.046 effective under master
    musicGain.connect(master);

    // One-shot bus: every reactive hit (splash, creak, near gull) passes a
    // gentle compressor so simultaneous events never spike past house level.
    fxBus = ctx.createGain();
    fxBus.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -28;
    comp.knee.value = 12;
    comp.ratio.value = 8;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    fxBus.connect(comp);
    comp.connect(master);
    return true;
  }

  function panNode(pan) {
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      return p;
    }
    return ctx.createGain();                       // no panner: plain pass-through
  }

  /* ---------- gulls: descending FM cries, panned, in 1–3 cry runs ---------- */
  function gullCry(t, pan, amp, dest) {
    amp = amp || 1;
    dest = dest || master;
    const o = ctx.createOscillator();              // sweep 2.3 kHz down to ~1.1 kHz
    o.type = 'sine';
    o.frequency.setValueAtTime(2300, t);
    o.frequency.exponentialRampToValueAtTime(1700, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(1100, t + 0.22);
    const mod = ctx.createOscillator();            // light vibrato warble
    mod.frequency.value = 34;
    const modGain = ctx.createGain();
    modGain.gain.value = 120;
    mod.connect(modGain);
    modGain.connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045 * amp, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.24);
    const p = panNode(pan);
    o.connect(g);
    g.connect(p);
    p.connect(dest);
    o.start(t); o.stop(t + 0.26);
    mod.start(t); mod.stop(t + 0.26);
    // a breathy throat-noise burst under the cry
    const nb = ctx.createBufferSource();
    const nlen = Math.floor(0.12 * ctx.sampleRate);
    const nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
    const nd = nbuf.getChannelData(0);
    for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
    nb.buffer = nbuf;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 1.2;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.012 * amp, t + 0.02);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    nb.connect(bp); bp.connect(ng); ng.connect(p);
    nb.start(t); nb.stop(t + 0.13);
  }
  function gulls() {
    if (performance.now() - startedAtMs < GULL_HOLD * 1000) return;  // let the fade settle
    const cries = 1 + ((Math.random() * 3) | 0);   // 1–3 cries per visit
    const pan = Math.random() * 1.6 - 0.8;
    for (let i = 0; i < cries; i++) {
      // ±20% per-cry level, capped at the nominal recipe so the ambient flock
      // can drift quieter but never louder — it should sit in the scene
      const amp = Math.min(1.0, 0.8 + Math.random() * 0.4);
      gullCry(ctx.currentTime + 0.02 + i * (0.28 + Math.random() * 0.14),
              pan + (Math.random() - 0.5) * 0.2, amp);
    }
  }
  function scheduleGulls() {
    clearTimeout(gullTimer);
    const gen = startGen;
    const lo = mode === 'tour' ? 8 : 12;
    const hi = mode === 'tour' ? 18 : 25;
    gullTimer = setTimeout(() => {
      if (gen !== startGen) return;                // a queued tick survives clearTimeout
      if (running && ctx && ctx.state === 'running' && !document.hidden) gulls();
      scheduleGulls();
    }, (lo + Math.random() * (hi - lo)) * 1000);
  }

  /* ---------- reactive one-shots (called by the canoe; never throw) ---------- */
  function live() { return running && ctx && ctx.state === 'running' && fxBus; }

  // Paddle splash: a bright decaying noise burst, lowpassed, scaled by stroke
  // power. Internally rate-limited so a flurry of strokes stays one texture.
  function splash(power01) {
    try {
      if (!live()) return;
      const now = performance.now();
      if (now - lastSplashAt < 120) return;
      lastSplashAt = now;
      const p01 = Math.min(1, Math.max(0, +power01 || 0));
      const t = ctx.currentTime;
      const dur = 0.16 + p01 * 0.12;
      const len = Math.ceil(dur * ctx.sampleRate);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = 0.85 + Math.random() * 0.3;   // slight pitch scatter
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(2400 + Math.random() * 1000, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.012 + 0.05 * p01, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(lp); lp.connect(g); g.connect(fxBus);
      src.start(t); src.stop(t + dur + 0.02);
    } catch (e) { /* one-shots must never break the caller */ }
  }

  // Continuous hull-lap: filtered noise breathing at ~1.2 Hz, ramped toward
  // the boat speed. Idle sits at a faint wash; silence until first call.
  function ensureLap() {
    if (lapGain) return;
    const len = Math.floor(1.5 * ctx.sampleRate);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.9;
    const am = ctx.createGain();                   // 1.2 Hz lapping pulse
    am.gain.value = 0.55;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.2;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.45;
    lfo.connect(lfoG); lfoG.connect(am.gain);
    lapGain = ctx.createGain();
    lapGain.gain.value = 0.0001;
    src.connect(bp); bp.connect(am); am.connect(lapGain); lapGain.connect(master);
    src.start(); lfo.start();
  }
  function applyLap(tc) {
    if (!lapGain || !ctx) return;
    const boost = mode === 'tour' ? 1.3 : 1.0;     // waterline: the hull leans in
    lapGain.gain.setTargetAtTime(Math.max(0.0001, lapLevel * boost), ctx.currentTime, tc);
  }
  function lap(speed01) {
    try {
      if (!running || !ctx) return;
      ensureLap();
      lastLapAt = performance.now();
      const s = Math.min(1, Math.max(0, +speed01 || 0));
      lapLevel = 0.015 + 0.16 * s;
      applyLap(0.5);
    } catch (e) { /* never throw */ }
  }

  // Wooden creak when drifting near jetties/hulls: a low sine groan plus a
  // resonant rasp, fading with distance and capped at one per 4 s.
  function creak(dist) {
    try {
      if (!live()) return;
      const dm = +dist;
      if (!(dm >= 0) || dm > 60) return;
      const now = performance.now();
      if (now - lastCreakAt < 4000) return;
      lastCreakAt = now;
      const vol = 0.05 * (1 - dm / 60);
      const t = ctx.currentTime;
      const o = ctx.createOscillator();            // slow downward groan
      o.type = 'sine';
      o.frequency.setValueAtTime(95 + Math.random() * 25, t);
      o.frequency.exponentialRampToValueAtTime(58, t + 0.5);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.linearRampToValueAtTime(vol, t + 0.12);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      o.connect(og); og.connect(fxBus);
      o.start(t); o.stop(t + 0.65);
      const nlen = Math.floor(0.4 * ctx.sampleRate);
      const nbuf = ctx.createBuffer(1, nlen, ctx.sampleRate);
      const nd = nbuf.getChannelData(0);
      for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
      const nb = ctx.createBufferSource();         // fibrous rasp on top
      nb.buffer = nbuf;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(420 + Math.random() * 160, t);
      bp.frequency.exponentialRampToValueAtTime(240, t + 0.4);
      bp.Q.value = 9;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.0001, t);
      ng.gain.linearRampToValueAtTime(vol * 0.6, t + 0.08);
      ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      nb.connect(bp); bp.connect(ng); ng.connect(fxBus);
      nb.start(t); nb.stop(t + 0.45);
    } catch (e) { /* never throw */ }
  }

  // A close fly-by gull: the ambient cry recipe, near-centre pan and a touch
  // louder, through the compressed bus. At most one burst per 3 s.
  function gullNear() {
    try {
      if (!live()) return;
      const now = performance.now();
      if (now - lastGullNearAt < 3000) return;
      lastGullNearAt = now;
      const pan = (Math.random() - 0.5) * 0.5;
      const cries = 1 + ((Math.random() * 2) | 0);
      for (let i = 0; i < cries; i++) {
        gullCry(ctx.currentTime + 0.02 + i * (0.26 + Math.random() * 0.12),
                pan + (Math.random() - 0.5) * 0.15, 1.5, fxBus);
      }
    } catch (e) { /* never throw */ }
  }

  /* ---------- music voices ---------- */
  function pluckBuffer(freq) {                      // Karplus–Strong, rendered once per note
    const sr = ctx.sampleRate;
    const N = Math.max(2, Math.round(sr / freq));
    const len = Math.floor(sr * 1.6);
    const buf = ctx.createBuffer(1, len, sr);
    const d = buf.getChannelData(0);
    const ring = new Float32Array(N);
    for (let i = 0; i < N; i++) ring[i] = Math.random() * 2 - 1;
    let idx = 0;
    for (let i = 0; i < len; i++) {
      const cur = ring[idx];
      ring[idx] = 0.996 * 0.5 * (cur + ring[(idx + 1) % N]);
      d[i] = cur;
      idx = (idx + 1) % N;
    }
    return buf;
  }
  function playNote(freq, t, dur, vel) {
    const p = panNode((rng() - 0.5) * 0.5);
    p.connect(musicGain);
    if (town.timbre === 0) {                        // plucked string
      const src = ctx.createBufferSource();
      src.buffer = pluckBuffer(freq);
      const g = ctx.createGain();
      g.gain.value = vel * 0.5;
      src.connect(g); g.connect(p);
      src.start(t); src.stop(t + 1.6);
    } else if (town.timbre === 1) {                 // soft detuned sine pad
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel * 0.3, t + dur * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.9);
      g.connect(p);
      for (const det of [-4, 4]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = freq;
        o.detune.value = det;
        o.connect(g);
        o.start(t); o.stop(t + dur * 2);
      }
    } else {                                        // flute-ish triangle with vibrato
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = freq;
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.6;
      const vibG = ctx.createGain();
      vibG.gain.value = freq * 0.005;
      vib.connect(vibG); vibG.connect(o.frequency);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel * 0.22, t + 0.12);
      g.gain.setTargetAtTime(vel * 0.16, t + 0.2, 0.3);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.25);
      o.connect(g); g.connect(p);
      o.start(t); o.stop(t + dur * 1.3);
      vib.start(t); vib.stop(t + dur * 1.3);
    }
  }
  function drone(t, dur) {                          // held root/fifth, far underneath
    const midi = town.rootMidi - 12 + (rng() < 0.6 ? 0 : 7);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + dur * 0.3);
    g.gain.setValueAtTime(0.05, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(musicGain);
    for (const det of [-3, 3]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midiHz(midi);
      o.detune.value = det;
      o.connect(g);
      o.start(t); o.stop(t + dur + 0.05);
    }
  }
  function phrase() {                               // 4–8 notes, mostly stepwise walk
    const n = 4 + ((rng() * 5) | 0);
    const sc = town.scale;
    let deg = (rng() * sc.length) | 0;
    let oct = 0;
    let t = ctx.currentTime + 0.05;
    let total = 0;
    // sometimes a quiet pedal tone holds underneath the whole phrase
    if (rng() < 0.35) drone(t, n * town.noteDur * 1.15 + town.noteDur);
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      if (last && rng() < 0.7) { deg = 0; if (oct > 0) oct = 0; }  // settle home
      const midi = town.rootMidi + 12 * oct + sc[deg];
      const dur = town.noteDur * (last ? 1.8 : (rng() < 0.3 ? 1.5 : 1));
      playNote(midiHz(midi), t, dur, 0.7 + rng() * 0.3);
      t += dur; total += dur;
      const step = rng() < 0.75 ? (rng() < 0.5 ? -1 : 1) : (rng() < 0.5 ? -2 : 2);
      deg += step;
      while (deg < 0) { deg += sc.length; oct = Math.max(-1, oct - 1); }
      while (deg >= sc.length) { deg -= sc.length; oct = Math.min(1, oct + 1); }
    }
    return total;
  }
  function scheduleMusic(extra) {
    clearTimeout(musicTimer);
    const gen = startGen;
    const rest = town.restLo + Math.random() * (town.restHi - town.restLo);
    musicTimer = setTimeout(() => {
      if (gen !== startGen) return;                // a queued tick survives clearTimeout
      let played = 0;
      // the generative layer stays silent while a recorded town track exists
      if (running && ctx && ctx.state === 'running' && !document.hidden &&
          !bufOf(town.trackUrl)) played = phrase();
      scheduleMusic(played);
    }, ((extra || 0) + rest) * 1000);
  }

  /* ---------- distant church bell: a few inharmonic sine partials behind a
     lowpass, tolling once per 2–4 min in the towns the hash grants one. The
     whole strike peaks ~0.005 effective — felt more than heard. ---------- */
  function bellToll(t, pan) {
    const lp = ctx.createBiquadFilter();           // distance dulls the strike
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const p = panNode(pan);
    lp.connect(p);
    p.connect(master);
    // classic bell stack: hum, prime, tierce, quint — ratio / level / decay s
    const partials = [[0.5, 0.9, 6.5], [1, 1, 4.5], [1.19, 0.55, 3], [1.5, 0.3, 2]];
    for (const [ratio, lvl, dec] of partials) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = town.bellHz * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.014 * lvl, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      o.connect(g); g.connect(lp);
      o.start(t); o.stop(t + dec + 0.05);
    }
  }
  function scheduleBell() {
    clearTimeout(bellTimer);
    if (!town || !town.bell) return;
    const gen = startGen;
    bellTimer = setTimeout(() => {
      if (gen !== startGen || !running) return;
      if (ctx && ctx.state === 'running' && !document.hidden) {
        const pan = (Math.random() - 0.5) * 0.8;   // one fixed spot per toll group
        const tolls = 1 + ((Math.random() * 2) | 0);
        for (let i = 0; i < tolls; i++) bellToll(ctx.currentTime + 0.05 + i * 3.2, pan);
      }
      scheduleBell();
    }, (120 + Math.random() * 120) * 1000);
  }

  /* ---------- recorded layers: CC0 wave loop + per-town lo-fi track ----------
     Fetched lazily on first start(); every failure leaves the synth fallback
     untouched, so missing files only mean "the old ambience". */
  function fetchBuf(url) {
    if (bufCache[url]) return;
    bufCache[url] = 'loading';
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
      .then((ab) => new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)))
      .then((buf) => {
        bufCache[url] = buf;
        if (running && url === WAVES_URL) startWaves();
      })
      .catch(() => { bufCache[url] = 'failed'; });
  }
  function bufOf(url) {
    const b = bufCache[url];
    return b && b !== 'loading' && b !== 'failed' ? b : null;
  }

  // The wave loop runs forever once started (gain-managed; the context is
  // suspended whenever the diorama is closed, so it costs nothing then).
  // applyMode() fades it in and ducks the synth surf underneath it.
  function startWaves() {
    if (wavesSrc || !ctx) return;
    const buf = bufOf(WAVES_URL);
    if (!buf) return;
    wavesGain = ctx.createGain();
    wavesGain.gain.value = 0.0001;
    wavesGain.connect(master);
    wavesSrc = ctx.createBufferSource();
    wavesSrc.buffer = buf;
    wavesSrc.loop = true;
    wavesSrc.loopStart = 0.25;                     // stay clear of AAC edge padding;
    wavesSrc.loopEnd = buf.duration - 0.25;        // content is crossfade-seamless
    wavesSrc.connect(wavesGain);
    wavesSrc.start();
    applyMode(2.0);                                // slow first swell-in
  }

  // Music plays one pass of the town's track (short loops repeat to ~75 s),
  // long fades both ends, then rests 20–40 s so it stays ambient.
  function playTrack() {
    const buf = bufOf(town.trackUrl);
    if (!buf) return 0;
    const rate = town.trackRate;
    const one = buf.duration / rate;
    const loopIt = buf.duration < 45;              // short seamless loops repeat
    // hash-varied entry point so a pass never opens on the same beat twice
    trackPass++;
    const off01 = (hashStr(harborId + ':' + visitCount + ':' + trackPass) % 9973) / 9973;
    let offset = off01 * buf.duration;
    let dur;
    if (loopIt) {
      dur = Math.ceil(75 / one) * one;             // loops wrap, any phase works
    } else {
      // one-pass tracks: enter somewhere in the first half, keep ≥30 s of tail
      offset = Math.min(offset * 0.5, Math.max(0, buf.duration - 30));
      dur = (buf.duration - offset) / rate;
    }
    const t = ctx.currentTime;
    const fi = Math.min(5, dur * 0.25);
    const fo = Math.min(6, dur * 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + fi);
    g.gain.setValueAtTime(1, t + dur - fo);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    g.connect(musicGain);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    src.loop = loopIt;
    src.connect(g);
    src.start(t, offset);
    src.stop(t + dur + 0.05);
    trackSrc = src;
    trackEnv = g;
    return dur;
  }
  function scheduleTrack(delay) {
    clearTimeout(trackTimer);
    const gen = startGen;
    trackTimer = setTimeout(() => {
      if (gen !== startGen || !running || !ctx) return;
      if (bufCache[town.trackUrl] === 'failed') return;   // generative layer covers
      let played = 0;
      if (ctx.state === 'running' && !document.hidden) played = playTrack();
      // not ready yet (still loading / hidden): retry shortly; otherwise rest
      scheduleTrack(played > 0 ? played + 20 + Math.random() * 20 : 5);
    }, Math.max(0.1, delay) * 1000);
  }
  function stopTrack() {
    clearTimeout(trackTimer);
    if (trackSrc && ctx) {
      try {
        trackEnv.gain.cancelScheduledValues(ctx.currentTime);
        trackEnv.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
        trackSrc.stop(ctx.currentTime + FADE_OUT);
      } catch (e) { /* already stopped */ }
    }
    trackSrc = null;
    trackEnv = null;
  }

  /* ---------- mode tie-in: at the waterline the water leans closer and the
     music steps back; ~2 s transitions either way. With the recorded wave
     loop active the synth surf ducks to a faint underlay. ---------- */
  function applyMode(tc) {
    if (!ctx || !surfGain) return;
    tc = tc || 0.7;                                // one shared time-constant: every
    const tNow = ctx.currentTime;                  // layer below moves as a single mix
    const surfBase = wavesSrc
      ? (mode === 'tour' ? 0.18 : 0.13)            // faint underlay ~¼ of the loop gain
      : (mode === 'tour' ? 0.7 : 0.5);
    surfGain.gain.setTargetAtTime(surfBase, tNow, tc);
    // keep the swell at ±20% of wherever the base sits; a fixed 0.1 depth was
    // nearly the whole level once the surf had ducked under the recorded loop
    if (surfLfoDepth) surfLfoDepth.gain.setTargetAtTime(surfBase * 0.2, tNow, tc);
    if (wavesGain) wavesGain.gain.setTargetAtTime(mode === 'tour' ? 0.75 : 0.55, tNow, tc);
    musicGain.gain.setTargetAtTime(mode === 'tour' ? 0.26 : 0.38, tNow, tc);
    applyLap(tc);
  }

  /* ---------- lifecycle ---------- */
  // The fade-in must begin only once the context is genuinely producing
  // sound; ramping while suspended/resuming meant the user heard the bed cut
  // in at whatever level the ramp had silently reached.
  function fadeMasterIn(dur) {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(0.0001, Math.min(master.gain.value, MASTER_GAIN)), t);
    master.gain.linearRampToValueAtTime(MASTER_GAIN, t + dur);
  }
  function whenRunning(cb) {
    if (ctx.state === 'running') { cb(); return; }
    const gen = startGen;
    const onChange = () => {
      if (ctx.state !== 'running') return;
      ctx.removeEventListener('statechange', onChange);
      if (running && gen === startGen) cb();
    };
    ctx.addEventListener('statechange', onChange);
    ctx.resume().catch(() => {});
    // open() awaits the engine before us; if the click's activation has
    // lapsed, the next pointer event unlocks the context instead.
    window.addEventListener('pointerdown', () => {
      if (running && ctx && ctx.state !== 'running') ctx.resume().catch(() => {});
    }, { once: true });
  }

  function start(id) {
    if (!buildGraph()) return;
    clearTimeout(suspendTimer);
    if (id !== harborId || !town) {
      harborId = id;
      rng = mulberry32(hashStr(String(id)) ^ 0x9e3779b9);
      town = townCharacter(id);
    }
    running = true;
    mode = 'overview';
    startGen++;
    visitCount++;
    startedAtMs = performance.now();
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0.0001, ctx.currentTime);   // silent until running
    whenRunning(() => fadeMasterIn(RAMP_IN));
    fetchBuf(WAVES_URL);                           // lazy; no-ops once cached
    fetchBuf(town.trackUrl);
    startWaves();                                  // immediate if already cached
    applyMode();
    scheduleGulls();
    scheduleBell();
    scheduleMusic(4 + Math.random() * 4);          // synth fallback phrase, unhurried
    scheduleTrack(8 + Math.random() * 7);          // first recorded phrase ≥8 s in
  }

  function setMode(m) {
    if (m !== 'tour') m = 'overview';
    if (m === mode) return;
    mode = m;
    if (!running) return;
    applyMode();
    scheduleGulls();                               // re-roll with the new cadence
  }

  function stop() {
    running = false;
    startGen++;
    clearTimeout(gullTimer);
    clearTimeout(musicTimer);
    clearTimeout(bellTimer);
    if (!ctx) return;
    stopTrack();
    lapLevel = 0;                                  // next visit starts hull-quiet
    if (lapGain) lapGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + FADE_OUT);
    clearTimeout(suspendTimer);
    suspendTimer = setTimeout(() => {
      if (!running && ctx && ctx.state === 'running') ctx.suspend().catch(() => {});
    }, FADE_OUT * 1000 + 150);
  }

  function frame(/* dt */) {
    // watchdog: if the canoe stops reporting speed, the hull-lap eases out
    if (running && lapGain && lapLevel > 0 && performance.now() - lastLapAt > 600) {
      lapLevel = 0;
      applyLap(1.0);
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      // park the master at silence first, so the eventual resume cannot
      // re-enter at full level (the old harsh cut-in on tab return)
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0.0001, ctx.currentTime);
      ctx.suspend().catch(() => {});
    } else if (running) {
      whenRunning(() => fadeMasterIn(RAMP_BACK));
    }
  });

  return {
    start, setMode, stop, frame,
    splash, lap, creak, gullNear,
    get ctx() { return ctx; },
  };
})();
