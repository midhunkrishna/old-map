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
  let renderer = null, scene = null, camera = null, controls = null;
  let env = null, hemi = null, envOn = true;   // PMREM image-based lighting, toggleable
  let poi = null, labelsOn = true;             // POI markers + cards, toggleable
  let PostFX = null, composer = null, bloomPass = null; // bloom (behind Studio light)
  let raf = 0, t0 = 0;
  let built = null;        // { dispose } for the current scene's teardown
  let tween = null;        // active camera tween, if any

  // first-person canoe tour (a second mode inside the diorama)
  let mode = 'overview';   // 'overview' | 'tour'
  let canoe = null;        // window.cartaHarborCanoe rig, built lazily
  let lastT = 0;           // for per-frame dt
  let camYaw = 0, camPitch = 0, rowing = false;  // look + row input, from the mouse
  let fwdKey = false, revKey = false;            // W forward, S/D reverse
  let cruiseKmh = 0;                             // button/scroll cruise speed (0–6 km/h)

  const carDio = { active: false, open, close };
  window.cartaDiorama = carDio;

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
  position: absolute; right: 22px; bottom: 26px; z-index: 5; display: none;
  align-items: center; gap: 8px; pointer-events: auto;
  font-family: 'IM Fell English SC', 'IM Fell English', serif;
}
#carta-diorama.touring .dio-speed { display: flex; }
#carta-diorama .dio-spd-read {
  min-width: 70px; text-align: center; font-size: 12px; letter-spacing: 0.5px;
  color: #efe3c6; text-shadow: 0 1px 4px rgba(0,0,0,0.75);
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
    // speed readout: cruise is set from the keyboard (↑ faster · ↓ slower, ×1.5
    // steps, 0–6 km/h) or the scroll wheel — no buttons to mouse for mid-sail
    const speedBox = document.createElement('div');
    speedBox.className = 'dio-speed';
    const speedRead = document.createElement('span'); speedRead.className = 'dio-spd-read'; speedRead.textContent = '0.0 km/h';
    speedBox.append(speedRead);
    host._speedRead = speedRead;
    const hint = document.createElement('div');
    hint.className = 'dio-hint';
    hint.innerHTML = 'Drag to turn the harbour · Right-drag to pan · Scroll to zoom in';
    // the tour minimap: an engraved thumbnail of the harbour with the canoe on it
    const mini = document.createElement('canvas');
    mini.className = 'dio-minimap';
    mini.width = 380; mini.height = 380;        // 2× backing for a crisp engraving
    host._mini = mini;
    host.append(canvas, vig, overlay, title, closeBtn, envBtn, labelsBtn, tourBtn, returnBtn, tourHint, pauseHint, speedBox, mini, hint);
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
    // ×1.5 either way (0–6 km/h); the scroll wheel does the same
    window.addEventListener('keydown', (e) => {
      if (mode !== 'tour') return;
      const k = e.key.toLowerCase();
      if (k === 'w') fwdKey = true;
      else if (k === 's') revKey = true;
      else if (e.key === 'ArrowUp') { e.preventDefault(); nudgeCruise(1.5); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); nudgeCruise(1 / 1.5); }
    });
    window.addEventListener('keyup', (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w') fwdKey = false;
      else if (k === 's') revKey = false;
    });
    canvas.addEventListener('wheel', (e) => {
      if (mode !== 'tour') return;
      e.preventDefault();
      nudgeCruise(e.deltaY < 0 ? 1.5 : 1 / 1.5);
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
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
      camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 1, 60000);
      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.11;       // snappier settle
      controls.enablePan = true;           // pan to a quarter of the town, then dolly right in
      controls.screenSpacePanning = true;
      controls.panSpeed = 0.9;
      controls.minPolarAngle = 0.12 * Math.PI;
      controls.maxPolarAngle = 0.49 * Math.PI; // never dip under the water
      controls.rotateSpeed = 0.85;
      controls.zoomSpeed = 3.0;            // brisk dolly
      carDio._controls = controls;         // exposed for verification harnesses
      buildEnv();
      loaded = true;
      return true;
    } catch (e) {
      console.warn('diorama: engine failed', e);
      failed = true;
      return false;
    }
  }

  /* ---------- image-based lighting (PMREM) ---------- */

  // A tiny sky→horizon→parchment gradient, pre-filtered into an environment map.
  // Standard materials (the terrain) pick up its soft directional ambient.
  function buildEnv() {
    if (env || !THREE.PMREMGenerator) return;
    try {
      const c = document.createElement('canvas');
      c.width = 8; c.height = 64;
      const x = c.getContext('2d');
      const g = x.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0.0, '#caa6c4');    // dusky violet zenith
      g.addColorStop(0.42, '#e6b98a');   // warm evening sky
      g.addColorStop(0.52, '#ffcf86');   // golden horizon glow
      g.addColorStop(1.0, '#7a6240');    // warm ground bounce
      x.fillStyle = g; x.fillRect(0, 0, 8, 64);
      const tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      const pmrem = new THREE.PMREMGenerator(renderer);
      env = pmrem.fromEquirectangular(tex).texture;
      pmrem.dispose(); tex.dispose();
    } catch (e) { console.warn('diorama: env failed', e); env = null; }
  }

  // On: IBL fills the ambient and the hemisphere light backs off, for a softer,
  // grounded "studio" look. Off: the plain hemisphere + sun.
  function applyEnv(on) {
    envOn = on;
    if (scene) scene.environment = (on && env) ? env : null;
    if (hemi) hemi.intensity = on ? 0.5 : 0.95;
    // water reflections + sun glitter ride with the Studio light; bloom too
    const water = built && built.terrain && built.terrain.water;
    if (water && water.material.uniforms.uShine) water.material.uniforms.uShine.value = on ? 1 : 0;
    if (host && host._envBtn) host._envBtn.classList.toggle('on', on);
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
    // dolly from right down among the buildings out to a wide establishing shot
    // (pan-enabled, so you can bring a quarter of the town to the target first)
    controls.minDistance = Math.max(8, radius * 0.02);
    controls.maxDistance = radius * 4.5;
    // tight near/far for the scene kills the depth-precision flicker that showed
    // at the wide top-down view (the 1 : 60000 range was far too deep)
    camera.near = Math.max(2, radius * 0.012);
    camera.far = radius * 16;
    camera.updateProjectionMatrix();

    // lighting — evening golden hour: a low, warm sun raking across the harbour,
    // a peach sky fill and a cool-ish ground bounce so shadows read long and warm.
    hemi = new THREE.HemisphereLight(0xffdca6, 0x6b5d44, 0.95);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffca6a, 2.1);   // deep gold, low in the west
    sun.position.set(radius * 1.7, radius * 0.62, radius * 0.95); // low angle → long shadows
    sun.castShadow = true;
    const sc = sun.shadow.camera;
    sc.left = -radius * 1.3; sc.right = radius * 1.3;
    sc.top = radius * 1.3; sc.bottom = -radius * 1.3;
    sc.near = 1; sc.far = radius * 5;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0006;
    scene.add(sun);
    // warm distance haze so the far shore melts into the golden sky
    scene.fog = new THREE.Fog(0xe6b073, radius * 3.0, radius * 9.0);
    applyEnv(envOn);   // image-based lighting (toggle), set after the lights exist
    carDio._sunDir = sun.position.clone().normalize();   // handed to the water below

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
        animated.push({ update(t, cam) { trees.update(cam, carDio._camDist); } });
      } catch (e) { console.warn('diorama: trees failed', e); }
    }

    // ----- ships riding at anchor (bobbing on the swell, not hovering above it) -----
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
      ships.push({ inst, anim, type: s.type, draft, hd: null, hdOn: false,
        px: p.x, pz: p.z, ang: 90 - (s.heading || 0), phase: (s.lngLat[0] * 7919) % Math.PI });
    }
    if (ships.length) {
      const mPitch = new THREE.Matrix4(), mRoll = new THREE.Matrix4();
      const waterAt = terrain.waterAt || ((x, z) => ({ y: terrain.seaLevel, nx: 0, nz: 0 }));
      let SWHD = null;   // the detailed shipwright, raised lazily as the canoe nears
      const HD_IN = 150, HD_OUT = 175, HD_CAP = 3;
      animated.push({ update(t) {
        const tp = (mode === 'tour') ? carDio._tourPos : null;
        let hdLive = 0;
        for (const s of ships) if (s.hdOn) hdLive++;
        for (const s of ships) {
          // near the canoe, the symbolic mark yields to the high-definition vessel
          if (tp) {
            const d = Math.hypot(s.px - tp.x, s.pz - tp.z);
            if (!s.hdOn && d < HD_IN && hdLive < HD_CAP) {
              if (!SWHD && window.cartaShipwrightHD) SWHD = window.cartaShipwrightHD(THREE, SW);
              if (SWHD && !s.hd) {
                try {
                  s.hd = SWHD.shipInstance(s.type);
                  s.hd.inst.matrixAutoUpdate = false;
                  s.hd.inst.traverse((o) => { if (o.isMesh) o.castShadow = true; });
                  scene.add(s.hd.inst);
                } catch (e) { console.warn('diorama: hd ship failed', e); s.hd = { inst: null }; }
              }
              if (s.hd && s.hd.inst) { s.hdOn = true; hdLive++; }
            } else if (s.hdOn && d > HD_OUT) { s.hdOn = false; hdLive--; }
          } else if (s.hdOn) { s.hdOn = false; }
          if (s.hd && s.hd.inst) s.hd.inst.visible = s.hdOn;
          s.inst.visible = !s.hdOn;
          // float on the actual water surface and tilt with the swell
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
        animated.push({ update(t, cam) { birds.update(t, carDio._tourPos ? cam.position : null); } });
      } catch (e) { console.warn('diorama: birds failed', e); }
    }

    carDio._frame = frame;
    carDio._dbg = { id, town: !!town, townKids: town ? town.group.children.length : 0, ships: ships.length, stats: town ? town.stats : null };
    built = {
      _id: id, frame, terrain, radius, animated, town,
      lands: landFs,                                       // for the tour minimap
      shipDots: ships.map((s) => ({ x: s.px, z: s.pz })),  //   "      "      "
      dispose() {
        try { terrain.dispose && terrain.dispose(); } catch (e) { /* ignore */ }
        try { if (poi) { poi.dispose(); poi = null; } } catch (e) { /* ignore */ }
        scene.traverse((o) => { if (o.geometry) o.geometry.dispose && o.geometry.dispose(); });
      },
    };

    // bloom composer (rebuilt per open so its passes track the new scene/camera)
    buildComposer();
    applyEnv(envOn);   // sync env + water uShine + composer path now everything exists
    return frame;
  }

  function buildComposer() {
    if (!PostFX) return;
    if (composer) { try { composer.dispose(); } catch (e) { /* ignore */ } }
    const w = window.innerWidth, h = window.innerHeight;
    composer = new PostFX.EffectComposer(renderer);
    composer.setSize(w, h);
    composer.addPass(new PostFX.RenderPass(scene, camera));
    bloomPass = new PostFX.UnrealBloomPass(new THREE.Vector2(w, h), 0.72, 0.6, 0.8);
    composer.addPass(bloomPass);
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

  // −/+ (and the scroll wheel) scale a cruise speed by ×1.5, clamped 0–6 km/h.
  function nudgeCruise(factor) {
    const MAX = 6;
    if (factor > 1) cruiseKmh = Math.min(MAX, cruiseKmh < 0.6 ? 1.2 : cruiseKmh * factor);
    else cruiseKmh = (cruiseKmh * factor < 0.5) ? 0 : cruiseKmh * factor;
    if (host && host._speedRead) host._speedRead.textContent = cruiseKmh.toFixed(1) + ' km/h';
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
    cruiseKmh = 0; nudgeCruise(1 / 1.5);   // reset the readout to 0.0 km/h
    tween = null;
    controls.enabled = false;
    camera.fov = 70;
    camera.near = 0.1;                 // see the canoe floor right under the eye
    camera.far = built.radius * 10;    // fog hides everything past radius*9; tightens depth precision
    camera.updateProjectionMatrix();
    host.classList.add('touring');
    host.classList.remove('paused');
    if (host._hint) host._hint.classList.remove('show');
    drawMiniBase();                    // the engraved thumbnail behind the canoe arrow
    mode = 'tour';
    // a quick veil flash to cover the cut down to the waterline
    overlay.style.transition = 'opacity 0.32s ease';
    overlay.style.opacity = '0.85';
    requestAnimationFrame(() => { overlay.style.opacity = '0'; });
    if (canvas.requestPointerLock) canvas.requestPointerLock();
  }

  function exitTour() {
    if (mode !== 'tour') return;
    mode = 'overview';          // set first so the pointer-lock-change re-entry is a no-op
    rowing = false;
    if (document.pointerLockElement === canvas && document.exitPointerLock) document.exitPointerLock();
    if (canoe) { scene.remove(canoe.group); canoe.dispose(); canoe = null; }
    host.classList.remove('touring', 'paused');
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
    mode = 'overview'; host.classList.remove('touring', 'paused');
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
    t0 = performance.now();
    lastT = 0;

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
    if (!raf) loop();
  }

  function close() {
    if (!carDio.active) return;
    if (mode === 'tour') exitTour();   // release pointer lock + dispose the canoe first
    overlay.style.opacity = '1';
    const finish = () => {
      carDio.active = false;
      host.classList.remove('on');
      host.style.display = 'none';
      cancelAnimationFrame(raf); raf = 0;
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

  /* ---------- loop & resize ---------- */

  function loop() {
    raf = requestAnimationFrame(loop);
    if (!scene || !carDio.active) return;
    const now = performance.now();
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, t - lastT); lastT = t;
    if (tween) tween(now);
    if (mode === 'tour' && canoe) {
      // first person: the canoe owns the camera (seat + look); orbit is paused
      canoe.update(dt, t, { camYaw, camPitch, rowing: rowing || fwdKey, reverse: revKey, cruise: cruiseKmh / 3.6 }, camera);
      // keep the foliage at full detail around the boat (trees LOD reads this)
      carDio._camDist = built.radius * 0.18;
      // where the boat is, for proximity detail (HD ships, hero birds)
      carDio._tourPos = canoe.boatPos();
      // the minimap arrow tracks at ~7 Hz; the base chart is pre-rendered
      if (t - lastMiniT > 0.15) { lastMiniT = t; drawMini(carDio._tourPos); }
    } else {
      carDio._tourPos = null;
      controls.update();
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
    for (const a of built.animated) { try { a.update(t, camera); } catch (e) { /* ignore */ } }
    // Studio light routes through the bloom composer (the sun glitter & bright
    // sails glow); matte mode renders straight, with no post cost.
    if (envOn && composer) composer.render();
    else renderer.render(scene, camera);
  }

  function onResize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) composer.setSize(w, h);
  }
});
