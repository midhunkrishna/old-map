/* Carta Temporum — harbor diorama (Part B, Rung 3 rebuilt): the harbour as a
   rotatable artifact. Disconnected from the map: a separate full-screen Three.js
   canvas, the island built in metres at the world origin, orbited 360° with a
   PerspectiveCamera + OrbitControls — so it can be read at eye level, and the
   small local coordinates put the float32 shimmer to rest for good.

   The host owns the canvas/renderer/camera and the open/close transition. It
   assembles the scene from three collaborators sharing one coordinate frame
   ({ project, heightAt }): cartaTerrain (land + water), cartaTownBuilder (the
   town ashore), cartaTreeSystem (the LOD foliage), and the shipwright. Offered
   at gfx tier ≥ 3 only. Registered via window.cartaInits. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function initDiorama(carta) {
  const map = carta.map;
  if (((carta.gfx && carta.gfx.tier) || 0) < 3) return; // not offered below tier 3

  const M_PER_DEG_LAT = 110540; // metres per degree latitude (matches harbortown.js)
  const D2RAD = Math.PI / 180;
  const reduced = () => carta.reducedMotion && carta.reducedMotion.matches;

  let THREE = null;
  let OrbitControls = null;
  let SW = null;          // the shipwright (harbor3d.js), bound once Three.js loads
  let loaded = false;
  let failed = false;

  let host = null, canvas = null, overlay = null;
  let eng = null;                              // the rendering engine (window.cartaRenderEngine)
  let scene = null;                            // the active scene's content (host-owned)
  let envOn = true;                            // mirrors eng.envOn for the host's UI/render reads
  let poi = null, labelsOn = true;             // POI markers + cards, toggleable
  let PostFX = null;                           // post-fx classes, handed to the engine
  let built = null;        // { dispose } for the current scene's teardown
  let tween = null;        // active camera tween, if any

  // first-person canoe tour (a second mode inside the diorama)
  let mode = 'overview';   // 'overview' | 'tour'
  let canoe = null;        // window.cartaHarborCanoe rig, built lazily
  let camYaw = 0, camPitch = 0, rowing = false;  // look + row input, from the mouse
  let fwdKey = false, revKey = false;            // W forward, S/D reverse
  let cruiseStep = 0;                            // stepped cruise: 0 (coast) .. CRUISE_STEPS (20 mph)
  const CRUISE_STEPS = 8;                        // even increments up to the cap
  const CRUISE_MAX_MS = 8.94;                    // 20 mph ≈ 8.94 m/s ≈ 32.2 km/h

  const carDio = { active: false, open, close };
  window.cartaDiorama = carDio;

  // dev instrumentation gate: ?perf=1 turns on the engine's frame counters + a
  // small on-screen HUD. Read once, guarded so headless harnesses (no location /
  // URLSearchParams) and odd embeds degrade silently to off.
  const PERF = (function () {
    try {
      return typeof location !== 'undefined' && typeof URLSearchParams !== 'undefined' &&
        new URLSearchParams(location.search).has('perf');
    } catch (e) { return false; }
  })();
  let perfAccum = 0;   // throttles the HUD text to ~4 Hz

  /* ---------- DOM scaffold ---------- */

  function ensureDom() {
    if (host) return;
    const style = document.createElement('style');
    style.textContent = `
#carta-diorama {
  position: fixed; inset: 0; z-index: 40; display: none;
  background: #0d1418; pointer-events: none;
}
#carta-diorama.on { pointer-events: auto; }
#carta-diorama canvas { display: block; width: 100%; height: 100%; }
#carta-diorama .dio-veil {
  position: absolute; inset: 0; pointer-events: none; opacity: 0;
  background:
    radial-gradient(ellipse at 50% 40%, rgba(247,238,214,0.0), rgba(228,214,184,0.9) 80%),
    #e7dcc0;
  transition: opacity 0.6s ease;
}
#carta-diorama .dio-vig {
  position: absolute; inset: 0; pointer-events: none;
  box-shadow: inset 0 0 220px 60px rgba(20,14,6,0.55);
  background: radial-gradient(ellipse at 50% 46%, transparent 52%, rgba(24,16,6,0.32) 100%);
}
#carta-diorama .dio-close {
  position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%);
  z-index: 5; pointer-events: auto; cursor: pointer;
  font-family: 'IM Fell English SC', 'IM Fell English', serif;
  font-size: 14px; letter-spacing: 1.4px; color: #2a1d0e;
  padding: 7px 22px 8px; background: rgba(231,220,192,0.94);
  border: 2px solid #2a1d0e; outline: 1px solid #2a1d0e; outline-offset: 3px;
  box-shadow: 4px 5px 14px rgba(20,14,6,0.4);
}
#carta-diorama .dio-close:hover { background: #f3ead0; }
#carta-diorama .dio-env {
  position: absolute; right: 22px; bottom: 26px; z-index: 5;
  pointer-events: auto; cursor: pointer; user-select: none;
  font-family: 'IM Fell English SC', 'IM Fell English', serif;
  font-size: 12px; letter-spacing: 1px; color: #2a1d0e;
  padding: 6px 14px 7px; background: rgba(231,220,192,0.82);
  border: 1.5px solid #2a1d0e; outline: 1px solid #2a1d0e; outline-offset: 2px;
  opacity: 0.6;
}
#carta-diorama .dio-env.on { opacity: 1; background: rgba(255,247,219,0.96); }
#carta-diorama .dio-env:hover { background: #f3ead0; }
#carta-diorama .dio-labels { right: 140px; }
#carta-diorama .dio-tour { right: 232px; }
#carta-diorama .dio-return {
  position: absolute; left: 50%; bottom: 26px; transform: translateX(-50%);
  z-index: 5; pointer-events: auto; cursor: pointer; display: none;
  font-family: 'IM Fell English SC', 'IM Fell English', serif;
  font-size: 14px; letter-spacing: 1.4px; color: #2a1d0e;
  padding: 7px 22px 8px; background: rgba(231,220,192,0.94);
  border: 2px solid #2a1d0e; outline: 1px solid #2a1d0e; outline-offset: 3px;
  box-shadow: 4px 5px 14px rgba(20,14,6,0.4);
}
#carta-diorama .dio-return:hover { background: #f3ead0; }
#carta-diorama.touring .dio-close,
#carta-diorama.touring .dio-tour,
#carta-diorama.touring .dio-labels { display: none; }
/* the Return button is only reachable once the look is released (pointer unlock) */
#carta-diorama.touring.paused .dio-return { display: block; }
#carta-diorama .dio-tourhint {
  position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%);
  z-index: 3; pointer-events: none; display: none; text-align: center;
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 13px;
  color: #efe3c6; text-shadow: 0 1px 5px rgba(0,0,0,0.7);
}
#carta-diorama.touring .dio-tourhint { display: block; }
#carta-diorama.touring.paused .dio-tourhint { display: none; }
#carta-diorama .dio-pausehint {
  position: absolute; left: 50%; bottom: 64px; transform: translateX(-50%);
  z-index: 3; pointer-events: none; display: none; text-align: center;
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 13px;
  color: #efe3c6; text-shadow: 0 1px 5px rgba(0,0,0,0.7);
}
#carta-diorama.touring.paused .dio-pausehint { display: block; }
#carta-diorama .dio-speed {
  position: absolute; right: 22px; bottom: 70px; z-index: 5; display: none;
  flex-direction: column; align-items: center; gap: 7px; pointer-events: auto;
  font-family: 'IM Fell English SC', 'IM Fell English', serif;
}
#carta-diorama.touring .dio-speed { display: flex; }
#carta-diorama .dio-spd-read {
  min-width: 70px; text-align: center; font-size: 12px; letter-spacing: 0.5px;
  color: #efe3c6; text-shadow: 0 1px 4px rgba(0,0,0,0.75);
}
#carta-diorama .dio-spd-btn {
  cursor: pointer; user-select: none; text-align: center;
  width: 36px; font-size: 12px; line-height: 1; color: #2a1d0e;
  padding: 6px 0 7px; background: rgba(231,220,192,0.82);
  border: 1.5px solid #2a1d0e; outline: 1px solid #2a1d0e; outline-offset: 2px;
  transition: background 0.25s ease, box-shadow 0.25s ease;
}
#carta-diorama .dio-spd-btn:hover { background: #f3ead0; }
#carta-diorama .dio-spd-btn.spd-ok {
  background: #aad084; box-shadow: 0 0 14px rgba(96,176,60,0.95); transition: none;
}
#carta-diorama .dio-spd-btn.spd-bad {
  background: #dd8d7a; box-shadow: 0 0 14px rgba(196,58,38,0.95); transition: none;
}
@media (prefers-reduced-motion: reduce) {
  #carta-diorama .dio-spd-btn { transition: none; }
  #carta-diorama .dio-spd-btn.spd-ok, #carta-diorama .dio-spd-btn.spd-bad { box-shadow: none; }
}
#carta-diorama .dio-minimap {
  position: absolute; left: 22px; bottom: 22px; z-index: 5; display: none;
  width: 190px; height: 190px; pointer-events: none;
  border: 2px solid #2a1d0e; outline: 1px solid #2a1d0e; outline-offset: 3px;
  box-shadow: 4px 5px 14px rgba(20,14,6,0.45);
  background: #e7dcc0;
}
#carta-diorama.touring .dio-minimap { display: block; }
#carta-diorama .dio-hint {
  position: absolute; left: 22px; bottom: 28px; z-index: 5; pointer-events: none;
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 12px;
  color: #efe3c6; line-height: 1.5; text-shadow: 0 1px 5px rgba(0,0,0,0.7);
  opacity: 0; transition: opacity 0.8s ease;
}
#carta-diorama .dio-hint.show { opacity: 0.85; }
#carta-diorama .dio-sysreq {
  position: absolute; left: 50%; bottom: 8px; transform: translateX(-50%);
  z-index: 3; pointer-events: none; white-space: nowrap;
  font-family: 'IM Fell English', serif; font-style: italic; font-size: 10.5px;
  color: #efe3c6; opacity: 0.55; text-shadow: 0 1px 4px rgba(0,0,0,0.6);
}
#carta-diorama.touring .dio-sysreq { display: none; }
#carta-diorama .dio-perf {
  position: absolute; right: 10px; top: 10px; z-index: 6; pointer-events: none;
  font: 11px/1.45 ui-monospace, Menlo, monospace; white-space: pre;
  color: #d8ffe0; background: rgba(10,14,10,0.62); padding: 6px 9px; border-radius: 4px;
  text-shadow: none;
}
#carta-diorama .dio-title {
  position: absolute; left: 50%; top: 22px; transform: translateX(-50%);
  z-index: 3; pointer-events: none; text-align: center; color: #f2e6c8;
  font-family: 'IM Fell English SC', 'IM Fell English', serif;
  font-size: 18px; letter-spacing: 2px; text-shadow: 0 2px 8px rgba(0,0,0,0.6);
}`;
    document.head.appendChild(style);

    host = document.createElement('div');
    host.id = 'carta-diorama';
    canvas = document.createElement('canvas');
    const vig = document.createElement('div'); vig.className = 'dio-vig';
    overlay = document.createElement('div'); overlay.className = 'dio-veil';
    const title = document.createElement('div'); title.className = 'dio-title';
    const closeBtn = document.createElement('div');
    closeBtn.className = 'dio-close';
    closeBtn.textContent = 'Return to the chart ✕';
    closeBtn.addEventListener('click', close);
    const envBtn = document.createElement('div');
    envBtn.className = 'dio-env on';
    envBtn.textContent = 'Studio light ☀';
    envBtn.title = 'soft image-based lighting';
    envBtn.addEventListener('click', () => applyEnv(!envOn));
    const labelsBtn = document.createElement('div');
    labelsBtn.className = 'dio-env dio-labels on';
    labelsBtn.textContent = 'Labels ⚓';
    labelsBtn.title = 'points of interest';
    labelsBtn.addEventListener('click', () => {
      labelsOn = !labelsOn;
      labelsBtn.classList.toggle('on', labelsOn);
      if (poi) poi.setVisible(labelsOn);
    });
    const tourBtn = document.createElement('div');
    tourBtn.className = 'dio-env dio-tour on';
    tourBtn.textContent = 'Tour the harbour ⛵';
    tourBtn.title = 'paddle a canoe in first person';
    tourBtn.addEventListener('click', enterTour);
    const returnBtn = document.createElement('div');
    returnBtn.className = 'dio-return';
    returnBtn.textContent = 'Return to overview ⟲';
    returnBtn.addEventListener('click', exitTour);
    const tourHint = document.createElement('div');
    tourHint.className = 'dio-tourhint';
    tourHint.innerHTML = 'Hold left mouse / W to row · S to reverse · Move mouse to look · ↑/↓ or scroll to set cruise · Esc to release';
    const pauseHint = document.createElement('div');
    pauseHint.className = 'dio-pausehint';
    pauseHint.innerHTML = 'View released — click to look around again, or step back below';
    // speed column: ↑/↓ (keys, wheel, or these buttons) step the cruise through
    // CRUISE_STEPS even increments up to 20 mph; each press flashes the matching
    // chevron green (accepted) or red (already at the limit)
    const speedBox = document.createElement('div');
    speedBox.className = 'dio-speed';
    const spdUp = document.createElement('div');
    spdUp.className = 'dio-spd-btn'; spdUp.textContent = '▲'; spdUp.title = 'faster (↑)';
    spdUp.addEventListener('click', () => stepCruise(1));
    const speedRead = document.createElement('span'); speedRead.className = 'dio-spd-read'; speedRead.textContent = '0.0 km/h';
    const spdDown = document.createElement('div');
    spdDown.className = 'dio-spd-btn'; spdDown.textContent = '▼'; spdDown.title = 'slower (↓)';
    spdDown.addEventListener('click', () => stepCruise(-1));
    speedBox.append(spdUp, speedRead, spdDown);
    host._speedRead = speedRead;
    host._spdUp = spdUp;
    host._spdDown = spdDown;
    const hint = document.createElement('div');
    hint.className = 'dio-hint';
    hint.innerHTML = 'Drag to turn the harbour · Right-drag to pan · Scroll to zoom in';
    // a quiet system-requirements note, centred at the very bottom in overview
    // (hidden in tour via the .touring rule — see the CSS above)
    const sysreq = document.createElement('div');
    sysreq.className = 'dio-sysreq';
    sysreq.textContent = 'For best experience: an M1 / GTX 1660-class GPU or better';
    // the tour minimap: an engraved thumbnail of the harbour with the canoe on it
    const mini = document.createElement('canvas');
    mini.className = 'dio-minimap';
    mini.width = 380; mini.height = 380;        // 2× backing for a crisp engraving
    host._mini = mini;
    host.append(canvas, vig, overlay, title, closeBtn, envBtn, labelsBtn, tourBtn, returnBtn, tourHint, pauseHint, speedBox, mini, hint, sysreq);
    // dev-only frame HUD (?perf=1): created here so it sits above the canvas
    if (PERF) {
      const pf = document.createElement('div');
      pf.className = 'dio-perf';
      pf.textContent = 'perf…';
      host.append(pf);
      host._perf = pf;
    }
    document.body.appendChild(host);
    host._title = title;
    host._envBtn = envBtn;
    host._hint = hint;

    // first-person look + row input. Row only fires while the pointer is locked;
    // a click on the canvas while released (paused) re-captures the look.
    const locked = () => document.pointerLockElement === canvas;
    canvas.addEventListener('mousedown', (e) => { if (mode === 'tour' && e.button === 0 && locked()) rowing = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) rowing = false; });
    window.addEventListener('blur', () => { rowing = false; });
    canvas.addEventListener('click', () => {
      if (mode === 'tour' && !locked() && canvas.requestPointerLock) canvas.requestPointerLock();
    });
    document.addEventListener('mousemove', (e) => {
      if (mode !== 'tour' || !locked()) return;
      const sens = 0.0022;
      camYaw -= e.movementX * sens;
      camPitch = Math.max(-1.55, Math.min(1.55, camPitch - e.movementY * sens));
    });
    // losing the lock (Esc, or the browser) pauses the tour rather than exiting:
    // the cursor returns so the "Return to overview" button becomes clickable.
    document.addEventListener('pointerlockchange', () => {
      if (mode !== 'tour') return;
      const on = locked();
      if (!on) rowing = false;
      host.classList.toggle('paused', !on);
    });
    // W forward · S reverse (the gaze still steers); ↑/↓ step the cruise speed
    // one even increment either way (0–20 mph); the scroll wheel does the same
    window.addEventListener('keydown', (e) => {
      if (mode !== 'tour') return;
      const k = e.key.toLowerCase();
      if (k === 'w') fwdKey = true;
      else if (k === 's') revKey = true;
      else if (e.key === 'ArrowUp') { e.preventDefault(); stepCruise(1); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); stepCruise(-1); }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w') fwdKey = false;
      else if (k === 's') revKey = false;
    });
    canvas.addEventListener('wheel', (e) => {
      if (mode !== 'tour') return;
      e.preventDefault();
      stepCruise(e.deltaY < 0 ? 1 : -1);
    }, { passive: false });

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !carDio.active) return;
      if (mode === 'tour') {
        // first Esc releases the look (browser exits pointer lock → paused);
        // a second Esc, now unlocked, steps fully back to the overview.
        if (!locked()) exitTour();
      } else {
        close();
      }
    });
  }

  /* ---------- lazy engine ---------- */

  async function ensureEngine() {
    if (loaded) return true;
    if (failed) return false;
    try {
      THREE = await import('/vendor/three.module.min.js');
      ({ OrbitControls } = await import('/vendor/OrbitControls.module.js'));
      if (window.cartaShipwright) SW = window.cartaShipwright(THREE);
      try {
        const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }] = await Promise.all([
          import('/vendor/jsm/postprocessing/EffectComposer.js'),
          import('/vendor/jsm/postprocessing/RenderPass.js'),
          import('/vendor/jsm/postprocessing/UnrealBloomPass.js'),
        ]);
        PostFX = { EffectComposer, RenderPass, UnrealBloomPass };
      } catch (e) { console.warn('diorama: post-fx unavailable', e); PostFX = null; }
      // the rendering engine owns renderer/camera/controls/env/composer + the loop
      eng = window.cartaRenderEngine(THREE, canvas, OrbitControls, PostFX);
      eng.createRenderer();
      eng.buildEnv();
      eng.setFrameHook(frameHook);   // audio per frame
      eng.setPreUpdateHook((dt, t, now) => { if (tween) tween(now); }); // tween runs at the TOP of the loop, before controls.update()
      eng.setModeHook(modeHook);     // tour/overview camera book-keeping
      carDio._controls = eng.controls;     // exposed for verification harnesses
      carDio._perf = function () { return eng ? eng.perf : null; };  // console: cartaDiorama._perf()
      loaded = true;
      return true;
    } catch (e) {
      console.warn('diorama: engine failed', e);
      failed = true;
      return false;
    }
  }

  /* ---------- image-based lighting (PMREM) ---------- */

  // On: IBL fills the ambient and the hemisphere light backs off, for a softer,
  // grounded "studio" look. Off: the plain hemisphere + sun. The engine owns the
  // env texture + scene.environment + hemi.intensity; the host keeps the water
  // coupling (reflections + sun glitter ride with the Studio light; bloom too).
  function applyEnv(on) {
    if (!eng) return;
    eng.setEnv(on, (on2) => {
      envOn = on2;
      const water = built && built.terrain && built.terrain.water;
      if (water && water.material.uniforms.uShine) water.material.uniforms.uShine.value = on2 ? 1 : 0;
      if (host && host._envBtn) host._envBtn.classList.toggle('on', on2);
    });
  }

  /* ---------- coordinate frame ---------- */

  // The port centroid and footprint radius, in lng/lat, from the land rings
  // (fallback: the blanket bbox centre).
  function portCentroid(id) {
    const plan = carta.harborPlans && carta.harborPlans[id];
    let sx = 0, sy = 0, n = 0;
    if (plan) {
      for (const f of plan.features) {
        if (f.properties.kind !== 'land') continue;
        for (const ring of f.geometry.coordinates) {
          for (const [x, y] of ring) { sx += x; sy += y; n++; }
        }
      }
    }
    if (n) return { lng: sx / n, lat: sy / n };
    const b = (carta.harborBoxes || []).find((x) => x.id === id);
    if (b) return { lng: (b.w + b.e) / 2, lat: (b.s + b.n) / 2 };
    const c = map.getCenter();
    return { lng: c.lng, lat: c.lat };
  }

  // project(lng,lat) → { x, z } metres about the port centroid, x east / z south,
  // matching harbortown.js's ringMeters() convention (Y-up world).
  function makeProject(c) {
    const mx = M_PER_DEG_LAT * Math.cos(c.lat * D2RAD);
    return function project(lng, lat) {
      return { x: (lng - c.lng) * mx, z: -(lat - c.lat) * M_PER_DEG_LAT };
    };
  }

  // Radius of the projected land footprint (metres), for camera framing.
  function footprintRadius(id, project) {
    const plan = carta.harborPlans && carta.harborPlans[id];
    let r = 600;
    if (plan) {
      for (const f of plan.features) {
        if (f.properties.kind !== 'land') continue;
        for (const ring of f.geometry.coordinates) {
          for (const [lng, lat] of ring) {
            const p = project(lng, lat);
            r = Math.max(r, Math.hypot(p.x, p.z));
          }
        }
      }
    }
    return r;
  }

  /* ---------- placeholder island (until cartaTerrain lands in Phase 2) ---------- */

  function placeholderTerrain(frame, radius) {
    const grp = new THREE.Group();
    const R = radius * 1.05;
    const seaLevel = 0;
    // a soft radial dome, sand at the rim → grass inland
    const heightAt = (x, z) => {
      const r = Math.hypot(x, z) / R;
      if (r >= 1) return -3;
      const e = 1 - r;
      return seaLevel + Math.pow(e, 1.4) * (radius * 0.10);
    };
    const seg = 96;
    const geo = new THREE.CircleGeometry(R, seg, 0, Math.PI * 2);
    geo.rotateX(-Math.PI / 2); // into the XZ plane (Y up)
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0xd8c79b), grass = new THREE.Color(0x7e8e54);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = heightAt(x, z);
      pos.setY(i, Math.max(seaLevel, y));
      const e = Math.min(1, Math.max(0, y / (radius * 0.10)));
      tmp.copy(sand).lerp(grass, Math.min(1, e * 1.6));
      col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const land = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
    land.receiveShadow = true;
    grp.add(land);

    const wGeo = new THREE.PlaneGeometry(R * 6, R * 6);
    wGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(wGeo, new THREE.MeshPhongMaterial({
      color: 0x3f6f86, transparent: true, opacity: 0.86, shininess: 80, specular: 0x9fd4e8,
    }));
    water.position.y = seaLevel - 0.4;
    grp.add(water);

    return { group: grp, heightAt, seaLevel, water, dispose() { geo.dispose(); wGeo.dispose(); } };
  }

  /* ---------- scene assembly ---------- */

  function buildScene(id) {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xe6b073);   // golden-hour haze on the horizon

    const c = portCentroid(id);
    const project = makeProject(c);
    const radius = footprintRadius(id, project);
    const frame = { project, heightAt: null, centroid: c, radius };
    // the engine holds the active scene, then sizes the control distances, the
    // camera near/far, and the golden-hour light/sun/shadow/fog rig to the radius.
    eng.setActiveScene(scene);
    const { sunDir } = eng.configureForRadius(radius);
    applyEnv(envOn);   // image-based lighting (toggle), set after the lights exist
    carDio._sunDir = sunDir;   // handed to the water below

    // terrain (real once Phase 2 lands; placeholder until then)
    const landFs = ((carta.harborStructures && carta.harborStructures.lands) || [])
      .filter((f) => f.properties.harbor === id);
    const terrain = (window.cartaTerrain && carta.harborStructures)
      ? window.cartaTerrain(THREE).build(landFs,
          (window.cartaTerrain.HILLS && window.cartaTerrain.HILLS[id]) || [], project)
      : placeholderTerrain(frame, radius);
    frame.heightAt = terrain.heightAt;
    scene.add(terrain.group || terrain.mesh);
    if (terrain.water && !terrain.group) scene.add(terrain.water);
    // point the water's sun glitter at the real (low, golden) sun
    if (terrain.water && terrain.water.material.uniforms.uSunDir && carDio._sunDir) {
      terrain.water.material.uniforms.uSunDir.value.copy(carDio._sunDir);
    }

    const animated = [];
    if (terrain.update) animated.push(terrain);

    // ----- the town ashore (harbortown.js in metric mode) -----
    let town = null;
    if (window.cartaTownBuilder && SW) {
      try {
        town = window.cartaTownBuilder(THREE, carta, SW.materials())
          .build(filterStructures(id), frame);
        scene.add(town.group);
        town.group.traverse((o) => { if (o.isMesh || o.isInstancedMesh) o.castShadow = true; });
        const flutter = [];
        town.group.traverse((o) => { if (o.userData.flutter) flutter.push(o); });
        if (flutter.length) animated.push({ update(t) { for (let i = 0; i < flutter.length; i++) flutter[i].rotation.y = Math.sin(t * 2.2 + i * 1.7) * 0.35; } });
      } catch (e) { console.warn('diorama: town failed', e); }
    }

    // ----- the LOD foliage (harbortrees.js, metric + camera-faced) -----
    if (window.cartaTreeSystem && town && town.treeField && town.treeField.length) {
      try {
        const trees = window.cartaTreeSystem(THREE, frame);
        trees.init(town.treeField);
        scene.add(trees.group);
        carDio._trees = trees;
        animated.push({ update(t, cam, lodCtx) { trees.update(cam, carDio._camDist, lodCtx); } });
      } catch (e) { console.warn('diorama: trees failed', e); }
    }

    // ----- town clutter gate (bollards, barrels, wells, dormers…): the legacy
    // map hid these past zoom ~14.7; the diorama left them on at every distance.
    // Bring the gate back on a screen-space rule — a 1 m prop drops out below ~3 px
    // — so the wide establishing shot stops paying ~40 sub-pixel draw calls. The
    // loop runs only on a state change, so steady-state cost is one comparison. -----
    if (town && town.lod && town.lod.length) {
      const townLod = town.lod;
      let on = true;
      animated.push({ update(t, cam, lod) {
        const gate = lod ? Math.min(lod.distForPixels(1, 3), radius * 0.6)
                         : radius * 0.5;                  // stub/legacy fallback
        const want = carDio._camDist < (on ? gate * 1.12 : gate);   // 12 % hysteresis
        if (want !== on) { on = want; for (const m of townLod) m.visible = on; }
      } });
    }

    // ----- ships riding at anchor (bobbing on the swell, not hovering above it) -----
    let prewarmShips = null;   // set below if any ships; the host warms HD on enterTour
    const ships = [];
    for (const s of (SW ? (carta.harborShips || []) : [])) {
      if (s.harbor !== id) continue;
      const p = project(s.lngLat[0], s.lngLat[1]);
      const { inst, anim } = SW.shipInstance(s.type);
      inst.matrixAutoUpdate = false;
      inst.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(inst);
      // the proto's origin is the keel line: sink her draft-deep into the swell
      const draft = (SW.LENGTHS[s.type] || 18) * 0.13 * SW.SYMBOLIC_SCALE * 0.22;
      ships.push({ inst, anim, type: s.type, draft, hd: null, hdOn: false, hdMember: false,
        px: p.x, pz: p.z, ang: 90 - (s.heading || 0), phase: (s.lngLat[0] * 7919) % Math.PI });
    }
    if (ships.length) {
      const mPitch = new THREE.Matrix4(), mRoll = new THREE.Matrix4();
      const waterAt = terrain.waterAt || ((x, z) => ({ y: terrain.seaLevel, nx: 0, nz: 0 }));
      let SWHD = null;   // the detailed shipwright, raised lazily as the canoe nears
      const HD_CAP = 3, PX_HD = 400, HYST = 1.17;   // HD when ≈400 px (≈ Phase 1 distances)

      function ensureSWHD() {
        if (!SWHD && window.cartaShipwrightHD) SWHD = window.cartaShipwrightHD(THREE, SW);
        return SWHD;
      }
      function buildHd(s) {
        if (s.hd) return s.hd;                       // built already (or {inst:null} on failure)
        if (!ensureSWHD()) return null;
        try {
          s.hd = SWHD.shipInstance(s.type);
          s.hd.inst.matrixAutoUpdate = false;
          s.hd.inst.visible = false;
          s.hd.inst.traverse((o) => { if (o.isMesh) o.castShadow = true; });
          scene.add(s.hd.inst);
        } catch (e) { console.warn('diorama: hd ship failed', e); s.hd = { inst: null }; }
        return s.hd;
      }
      // idle prewarm (Phase 3 task 1): build every ship's HD hull hidden and warm
      // its shaders off the critical path, so the first canoe approach never hitches
      // on a mid-frame compile/allocation. Generation-guarded by the host.
      prewarmShips = () => {
        for (const s of ships) buildHd(s);
        try { if (eng.renderer && eng.renderer.compile) eng.renderer.compile(scene, eng.camera); } catch (e) { /* ignore */ }
      };

      animated.push({ update(t, cam, lodCtx) {
        const tp = (mode === 'tour') ? carDio._tourPos : null;
        if (tp && lodCtx) {
          // each ship's on-screen size (raw LENGTHS, so swap distances match Phase 1);
          // threshold hysteresis: want HD at ≥400 px, hold until <400/1.17 px.
          const cand = [];
          for (let i = 0; i < ships.length; i++) {
            const s = ships[i];
            const d = Math.hypot(s.px - tp.x, s.pz - tp.z);
            s._px = lodCtx.pixels(SW.LENGTHS[s.type] || 18, d);
            const want = s.hdMember ? (s._px >= PX_HD / HYST) : (s._px >= PX_HD);
            if (want) cand.push(i);
          }
          // award the HD_CAP slots to the largest-on-screen; an incumbent carries a
          // 1.17 bonus, so a ship sitting at the cap boundary can't flicker in and
          // out of its slot (A3 cap fairness + zero oscillation).
          const eff = (i) => ships[i]._px * (ships[i].hdMember ? HYST : 1);
          cand.sort((a, b) => eff(b) - eff(a) || a - b);
          const award = new Set(cand.slice(0, HD_CAP));
          for (let i = 0; i < ships.length; i++) {
            const s = ships[i];
            const on = award.has(i);
            s.hdMember = on;
            if (on && (!s.hd || !s.hd.inst)) buildHd(s);   // lazy fallback if prewarm hasn't run
            s.hdOn = on && !!(s.hd && s.hd.inst);
            if (s.hd && s.hd.inst) s.hd.inst.visible = s.hdOn;
            s.inst.visible = !s.hdOn;
          }
        } else {
          for (const s of ships) {
            s.hdMember = false; s.hdOn = false;
            if (s.hd && s.hd.inst) s.hd.inst.visible = false;
            s.inst.visible = true;
          }
        }
        // swell placement — the W_TRAINS swell math is untouched, just applied to
        // whichever hull is live this frame
        for (const s of ships) {
          const w = waterAt(s.px, s.pz, t);
          const m = placeMatrix(s.px, w.y - s.draft, s.pz, s.ang, SW.SYMBOLIC_SCALE);
          const pitch = w.nz * 0.6;
          const roll = w.nx * 0.6 + Math.sin(t * 0.9 + s.phase) * 0.02;
          m.multiply(mPitch.makeRotationX(pitch)).multiply(mRoll.makeRotationZ(roll));
          const live = s.hdOn ? s.hd : s;
          (s.hdOn ? s.hd.inst : s.inst).matrix.copy(m);
          for (const sail of live.anim.billow) sail.scale.z = 1 + 0.14 * Math.sin(t * 1.2 + s.phase);
          for (const pen of live.anim.flutter) pen.rotation.y = Math.sin(t * 2.6 + s.phase) * 0.45;
        }
      } });
    }

    // ----- points of interest (markers + cards) -----
    poi = null;
    if (window.cartaHarborPOI) {
      try {
        poi = window.cartaHarborPOI(THREE).build(id, frame);
        poi.setVisible(labelsOn);
        animated.push({ update(t, cam) { poi.update(cam); } });
      } catch (e) { console.warn('diorama: poi failed', e); }
    }

    // ----- gulls wheeling over the harbour -----
    if (window.cartaHarborBirds) {
      try {
        const birds = window.cartaHarborBirds(THREE).build(radius);
        scene.add(birds.group);
        carDio._birds = birds.group;
        // any gull within ~50 m of the seated viewer swaps to the hero model
        animated.push({ update(t, cam, lodCtx) { birds.update(t, carDio._tourPos ? cam.position : null, lodCtx, cam.position); } });
      } catch (e) { console.warn('diorama: birds failed', e); }
    }

    carDio._frame = frame;
    carDio._dbg = { id, town: !!town, townKids: town ? town.group.children.length : 0, ships: ships.length, stats: town ? town.stats : null };
    built = {
      _id: id, frame, terrain, radius, animated, town, prewarmShips,
      lands: landFs,                                       // for the tour minimap
      shipDots: ships.map((s) => ({ x: s.px, z: s.pz })),  //   "      "      "
      dispose() {
        try { terrain.dispose && terrain.dispose(); } catch (e) { /* ignore */ }
        try { if (poi) { poi.dispose(); poi = null; } } catch (e) { /* ignore */ }
        scene.traverse((o) => { if (o.geometry) o.geometry.dispose && o.geometry.dispose(); });
      },
    };

    // bloom composer (rebuilt per open so its passes track the new scene/camera)
    eng.setUpdaters(animated);
    eng.buildComposer();
    applyEnv(envOn);   // sync env + water uShine + composer path now everything exists
    return frame;
  }

  // Place authored-Y-up geometry on the ground: matches harbortown's frame
  // (Y/Z swap + a −Y flip → det +1, winding preserved) but with a scale.
  let _swap = null;
  function placeMatrix(x, y, z, angDeg, scale) {
    if (!_swap) _swap = new THREE.Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1);
    const sc = scale || 1;
    return new THREE.Matrix4()
      .makeTranslation(x, y, z)
      .multiply(_swap)
      .multiply(new THREE.Matrix4().makeScale(sc, -sc, sc))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeRotationY((angDeg || 0) * D2RAD));
  }

  // The structures for one harbour (the town builder iterates per-harbour).
  function filterStructures(id) {
    const S = carta.harborStructures || {};
    const out = {};
    for (const k of ['blocks', 'forts', 'points', 'streets', 'greens', 'canals', 'wharves', 'lands']) {
      out[k] = (S[k] || []).filter((f) => ((f.properties && f.properties.harbor) || f.harbor) === id);
    }
    return out;
  }

  /* ---------- camera framing & tween ---------- */

  function restingView(radius) {
    // azimuth seeded from the map's bearing, a 3/4 polar angle
    const az = (map.getBearing() || 0) * D2RAD;
    return { radius: radius * 2.5, polar: 1.06, azimuth: az };
  }

  function applySpherical(s) {
    const camera = eng.camera, controls = eng.controls;
    const sp = new THREE.Spherical(s.radius, s.polar, s.azimuth);
    camera.position.setFromSpherical(sp);
    camera.position.y += built ? built.radius * 0.04 : 0;
    controls.target.set(0, built ? built.radius * 0.05 : 0, 0);
    camera.lookAt(controls.target);
    controls.update();
  }

  function tweenCamera(from, to, ms, done) {
    const start = performance.now();
    tween = function (now) {
      let k = Math.min(1, (now - start) / ms);
      k = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
      applySpherical({
        radius: from.radius + (to.radius - from.radius) * k,
        polar: from.polar + (to.polar - from.polar) * k,
        azimuth: from.azimuth + (to.azimuth - from.azimuth) * k,
      });
      if (k >= 1) { tween = null; done && done(); }
    };
  }

  /* ---------- the tour minimap ---------- */

  // The harbour as a small engraved chart, bottom-left while touring: parchment
  // sea, hatched land from the surveyed coastline rings, anchored ships as
  // dots, and the canoe as a red arrow that tracks position and heading.
  let miniBase = null, miniScale = 1, lastMiniT = 0;

  function drawMiniBase() {
    if (!built || !host._mini) { miniBase = null; return; }
    const W = host._mini.width, cx2 = W / 2;
    miniScale = (W / 2 - 18) / (built.radius * 1.12);
    const base = document.createElement('canvas');
    base.width = base.height = W;
    const x = base.getContext('2d');
    // the sea: a wash of period verdigris over parchment
    x.fillStyle = '#cfd9c8';
    x.fillRect(0, 0, W, W);
    x.fillStyle = 'rgba(127,166,168,0.55)';
    x.fillRect(0, 0, W, W);
    // land rings
    x.fillStyle = '#e3d6b4';
    x.strokeStyle = '#5d4a2e';
    x.lineWidth = 2.5;
    for (const f of (built.lands || [])) {
      const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
      for (const poly of polys) {
        const ring = poly[0];
        if (!ring || ring.length < 4) continue;
        x.beginPath();
        ring.forEach(([lng, lat], i) => {
          const p = built.frame.project(lng, lat);
          const px = cx2 + p.x * miniScale, py = cx2 + p.z * miniScale;
          if (i === 0) x.moveTo(px, py); else x.lineTo(px, py);
        });
        x.closePath();
        x.fill();
        x.stroke();
      }
    }
    // anchored ships
    x.fillStyle = '#3d2f1e';
    for (const s of (built.shipDots || [])) {
      x.beginPath();
      x.arc(cx2 + s.x * miniScale, cx2 + s.z * miniScale, 4, 0, Math.PI * 2);
      x.fill();
    }
    // a thin neatline + N arrow, the chartmaker's signature
    x.strokeStyle = '#2a1d0e';
    x.lineWidth = 2;
    x.strokeRect(5, 5, W - 10, W - 10);
    x.fillStyle = '#2a1d0e';
    x.font = 'bold 22px serif';
    x.fillText('N', W - 34, 32);
    x.beginPath(); x.moveTo(W - 27, 38); x.lineTo(W - 27, 58); x.moveTo(W - 27, 38);
    x.lineTo(W - 32, 46); x.moveTo(W - 27, 38); x.lineTo(W - 22, 46); x.stroke();
    miniBase = base;
  }

  function drawMini(bp) {
    if (!miniBase || !host._mini || !bp) return;
    const W = host._mini.width, cx2 = W / 2;
    const x = host._mini.getContext('2d');
    x.clearRect(0, 0, W, W);
    x.drawImage(miniBase, 0, 0);
    const px = cx2 + bp.x * miniScale, py = cx2 + bp.z * miniScale;
    // the canoe: a red arrow on the heading (θ=0 → bow toward −Z → up-chart)
    const fx = -Math.sin(bp.heading || 0), fz = -Math.cos(bp.heading || 0);
    const ang = Math.atan2(fz, fx);
    x.save();
    x.translate(px, py);
    x.rotate(ang);
    x.fillStyle = '#8a2318';
    x.strokeStyle = '#f3ead0';
    x.lineWidth = 1.6;
    x.beginPath();
    x.moveTo(10, 0); x.lineTo(-7, 5.5); x.lineTo(-4, 0); x.lineTo(-7, -5.5);
    x.closePath();
    x.fill();
    x.stroke();
    x.restore();
  }

  /* ---------- first-person canoe tour ---------- */

  // average of this port's anchored ships → a guaranteed patch of water beside
  // the harbour (the boat spawns here); null falls back to a marched-out spawn.
  function tourSpawnXZ(id) {
    let sx = 0, sz = 0, n = 0;
    for (const s of (carta.harborShips || [])) {
      if (s.harbor !== id) continue;
      const p = built.frame.project(s.lngLat[0], s.lngLat[1]);
      sx += p.x; sz += p.z; n++;
    }
    return n ? { x: sx / n, z: sz / n } : null;
  }

  // Stepped cruise: ↑/↓ (keys, wheel, or buttons) move one even increment between
  // 0 (coast) and 20 mph. Every press flashes the matching chevron — green when
  // the step is taken, red when the limit (top or bottom) is already reached.
  function cruiseMs() { return (cruiseStep / CRUISE_STEPS) * CRUISE_MAX_MS; }

  function updateSpeedRead() {
    if (host && host._speedRead) host._speedRead.textContent = (cruiseMs() * 3.6).toFixed(1) + ' km/h';
  }

  function flashSpd(btn, ok) {
    if (!btn) return;
    btn.classList.remove('spd-ok', 'spd-bad');
    void btn.offsetWidth;                          // restart on rapid presses
    btn.classList.add(ok ? 'spd-ok' : 'spd-bad');
    clearTimeout(btn._flashT);
    btn._flashT = setTimeout(() => btn.classList.remove('spd-ok', 'spd-bad'), 250);
  }

  function stepCruise(dir) {
    if (dir > 0) {
      const ok = cruiseStep < CRUISE_STEPS;
      if (ok) cruiseStep++;
      flashSpd(host && host._spdUp, ok);
    } else {
      const ok = cruiseStep > 0;
      if (ok) cruiseStep--;
      flashSpd(host && host._spdDown, ok);
    }
    updateSpeedRead();
  }

  function enterTour() {
    if (mode !== 'overview' || !carDio.active || !built) return;
    if (!window.cartaHarborCanoe) { console.warn('diorama: canoe module unavailable'); return; }
    if (!canoe) {
      try {
        canoe = window.cartaHarborCanoe(THREE).build(built.frame, {
          seaLevel: built.terrain.seaLevel,
          sunDir: carDio._sunDir,
          spawnXZ: tourSpawnXZ(built._id),
          waterAt: built.terrain.waterAt,   // float on the very same swell as the sheet
        });
      } catch (e) { console.warn('diorama: canoe failed', e); return; }
    }
    carDio._canoe = canoe;          // exposed for verification harnesses
    scene.add(canoe.group);
    camYaw = canoe.spawn();      // heading faces the harbour; look starts there too
    camPitch = 0; rowing = false; fwdKey = false; revKey = false;
    cruiseStep = 0; updateSpeedRead();     // reset the readout to 0.0 km/h
    tween = null;
    const camera = eng.camera, controls = eng.controls;
    controls.enabled = false;
    camera.fov = 70;
    camera.near = 0.1;                 // see the canoe floor right under the eye
    camera.far = built.radius * 10;    // fog hides everything past radius*9; tightens depth precision
    camera.updateProjectionMatrix();
    eng.setMode('tour');
    // warm the HD hulls off the critical path so the first approach doesn't hitch;
    // generation-guarded against a close()/open() landing during the idle window.
    if (built.prewarmShips) {
      const gen = built;
      const warm = () => { if (built === gen && carDio.active && mode === 'tour') built.prewarmShips(); };
      if (window.requestIdleCallback) window.requestIdleCallback(warm, { timeout: 600 });
      else setTimeout(warm, 120);
    }
    host.classList.add('touring');
    host.classList.remove('paused');
    if (host._hint) host._hint.classList.remove('show');
    drawMiniBase();                    // the engraved thumbnail behind the canoe arrow
    mode = 'tour';
    try { if (window.cartaHarborAudio) window.cartaHarborAudio.setMode('tour'); } catch (e) { /* ignore */ }
    // a quick veil flash to cover the cut down to the waterline
    overlay.style.transition = 'opacity 0.32s ease';
    overlay.style.opacity = '0.85';
    requestAnimationFrame(() => { overlay.style.opacity = '0'; });
    if (canvas.requestPointerLock) canvas.requestPointerLock();
  }

  function exitTour() {
    if (mode !== 'tour') return;
    mode = 'overview';          // set first so the pointer-lock-change re-entry is a no-op
    eng.setMode('overview');
    try { if (window.cartaHarborAudio) window.cartaHarborAudio.setMode('overview'); } catch (e) { /* ignore */ }
    rowing = false;
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    if (canoe) { scene.remove(canoe.group); canoe.dispose(); canoe = null; }
    host.classList.remove('touring', 'paused');
    const camera = eng.camera, controls = eng.controls;
    controls.enabled = true;
    camera.fov = 38;
    camera.near = built ? Math.max(2, built.radius * 0.012) : 1;
    camera.far = built ? built.radius * 16 : 60000;
    camera.updateProjectionMatrix();
    overlay.style.transition = 'opacity 0.32s ease';
    overlay.style.opacity = '0.85';
    requestAnimationFrame(() => { overlay.style.opacity = '0'; });
    if (built) applySpherical(restingView(built.radius));
  }

  /* ---------- open / close ---------- */

  async function open(id) {
    ensureDom();
    if (carDio.active && built && built._id === id) return;
    if (!(await ensureEngine())) { sleeps(); return; }

    if (mode === 'tour') exitTour();
    if (canoe) { try { canoe.dispose(); } catch (e) { /* ignore */ } canoe = null; }
    if (built) { built.dispose(); built = null; }
    mode = 'overview'; eng.setMode('overview'); host.classList.remove('touring', 'paused');
    const frame = buildScene(id);
    built._id = id;

    const b = (carta.harborBoxes || []).find((x) => x.id === id);
    host._title.textContent = b ? b.title : '';

    onResize();
    host.style.display = 'block';
    host.classList.add('on');
    overlay.style.transition = 'none';
    overlay.style.opacity = '1';
    // force reflow so the veil starts opaque, then fades to reveal the scene
    void overlay.offsetWidth;
    overlay.style.transition = 'opacity 0.6s ease';

    carDio.active = true;
    eng.startClock(performance.now());   // engine owns t0/lastT for the loop
    // ambience rides along; a failure here must never break the diorama
    try { if (window.cartaHarborAudio) window.cartaHarborAudio.start(id); } catch (e) { /* ignore */ }

    // a brief controls hint (pan isn't otherwise discoverable)
    if (host._hint) {
      host._hint.classList.add('show');
      clearTimeout(host._hintT);
      host._hintT = setTimeout(() => host._hint.classList.remove('show'), 5200);
    }

    const rest = restingView(built.radius);
    if (reduced()) {
      applySpherical(rest);
      overlay.style.opacity = '0';
    } else {
      const top = { radius: rest.radius * 1.15, polar: 0.06, azimuth: rest.azimuth };
      applySpherical(top);
      requestAnimationFrame(() => { overlay.style.opacity = '0'; });
      tweenCamera(top, rest, 1100);
    }
    eng.start();
  }

  function close() {
    if (!carDio.active) return;
    if (mode === 'tour') exitTour();   // release pointer lock + dispose the canoe first
    try { if (window.cartaHarborAudio) window.cartaHarborAudio.stop(); } catch (e) { /* ignore */ }
    overlay.style.opacity = '1';
    const finish = () => {
      carDio.active = false;
      host.classList.remove('on');
      host.style.display = 'none';
      eng.stop();
      if (canoe) { try { canoe.dispose(); } catch (e) { /* ignore */ } canoe = null; }
      if (built) { built.dispose(); built = null; }
      scene = null; tween = null;
      carta.bus && carta.bus.emit && carta.bus.emit('diorama-closed');
    };
    if (reduced()) finish();
    else setTimeout(finish, 600);
  }

  function sleeps() {
    if (carta.showCard) {
      carta.showCard('<h3>The harbour sleeps</h3><p>This harbour could not be raised in the round on this device; the engraved chart keeps its stations.</p>');
      setTimeout(carta.hideCard, 3500);
    }
  }

  /* ---------- loop & resize (driven by the engine) ---------- */

  // The host's per-frame work, plugged into the engine loop. The engine computes
  // dt/t, ticks OrbitControls in overview, runs the updaters, and decides the
  // render. The host's tween runs via the engine's preUpdateHook (top of the loop,
  // before controls.update()); modeHook runs the tour/overview camera book-keeping;
  // frameHook carries the audio. (Faithful move of the original loop ~925-960:
  // tween → tour|overview branch → carDio._cam → audio → updaters → render.)
  function modeHook(dt, t, now) {
    if (!scene || !carDio.active) return;     // matches the original loop's early-out
    const camera = eng.camera, controls = eng.controls;
    // tween now runs via the engine's preUpdateHook (TOP of the loop), not here
    if (mode === 'tour' && canoe) {
      // first person: the canoe owns the camera (seat + look); orbit is paused
      canoe.update(dt, t, { camYaw, camPitch, rowing: rowing || fwdKey, reverse: revKey, cruise: cruiseMs() }, camera);
      // keep the foliage at full detail around the boat (trees LOD reads this)
      carDio._camDist = built.radius * 0.18;
      // where the boat is, for proximity detail (HD ships, hero birds)
      carDio._tourPos = canoe.boatPos();
      // the minimap arrow tracks at ~7 Hz; the base chart is pre-rendered
      if (t - lastMiniT > 0.15) { lastMiniT = t; drawMini(carDio._tourPos); }
    } else {
      carDio._tourPos = null;
      // engine has already ticked controls.update() this frame (overview owner);
      // keep panning useful: don't let the target wander off the island
      if (built) {
        const R = built.radius * 1.15, tg = controls.target;
        const d = Math.hypot(tg.x, tg.z);
        if (d > R) { tg.x *= R / d; tg.z *= R / d; }
        tg.y = Math.max(0, Math.min(built.radius * 0.4, tg.y));
      }
      carDio._camDist = camera.position.distanceTo(controls.target);
    }
    carDio._cam = camera;
  }

  function frameHook(dt) {
    try { if (window.cartaHarborAudio) window.cartaHarborAudio.frame(dt); } catch (e) { /* ignore */ }
    // dev HUD: refresh at ~4 Hz from the engine's perf snapshot (off unless ?perf=1)
    if (PERF && host && host._perf && eng) {
      perfAccum += dt;
      if (perfAccum >= 0.25) {
        perfAccum = 0;
        const p = eng.perf;
        if (p) {
          host._perf.textContent =
            p.calls + ' calls  ' + (p.triangles / 1000).toFixed(0) + 'k tris\n' +
            p.geometries + ' geo  cpu ' + p.cpuMs.toFixed(2) + 'ms\n' +
            'frame med ' + p.median.toFixed(1) + '  p95 ' + p.p95.toFixed(1) + '  max ' + p.max.toFixed(1) + 'ms';
        }
      }
    }
  }

  function onResize() {
    eng.onResize();
  }
});
