/* Carta Temporum — harbour diorama rendering engine (extracted from harbordiorama.js).

   A conventional WebGL rendering engine: it owns the WebGLRenderer, the
   PerspectiveCamera, OrbitControls (created, configured, AND ticked each frame as
   the default overview controller), the PMREM environment build, the per-radius
   light/sun/shadow/fog rig + camera near/far + control distances, the bloom
   composer, the rAF loop (dt clamp, frame/mode hooks, updater iteration, the
   composer-vs-renderer render decision), resize, and dispose.

   The host (harbordiorama.js) keeps the THREE/OrbitControls/PostFX dynamic imports,
   all scene CONTENT assembly, the coordinate frame, the animated[] array, the
   bespoke TOUR mode, audio, and DOM/UI. The host passes THREE/canvas/OrbitControls/
   PostFX in; it plugs its per-frame work into the loop via setFrameHook/setModeHook.

   Mode-signaling contract (the loop body is a faithful move of the original
   harbordiorama loop ~985-1020):
     - The host calls setMode('overview'|'tour') from enterTour/exitTour.
     - Each frame the engine computes dt (clamp 0.05) and t, then:
         * in OVERVIEW it ticks controls.update() ITSELF (the default overview
           controller), then calls modeHook(dt, t, now) so the host can run its
           overview-only book-keeping (tween, target clamp using the freshly
           updated controls.target, camDist, carDio._cam/_tourPos);
         * in TOUR it calls modeHook(dt, t, now) and does NOT tick controls — the
           host drives the camera (canoe rig) and sets carDio._cam/_tourPos/_camDist.
       The modeHook is responsible for the host's tween + carDio._cam each frame; the
       engine owns controls.update() in overview, exactly as the original loop did
       (controls.update() ran before the host's overview target clamp).
     - frameHook(dt) is called after the mode branch (the audio.frame slot).
     - Then `for (a of updaters) a.update(t, camera)` and the render decision
       `envOn && composer ? composer.render() : renderer.render(scene, camera)`.

   The env<->water coupling stays in the host: setEnv(on, onWaterSync) toggles
   scene.environment + hemi.intensity, then calls onWaterSync(on) so the host can
   sync the terrain water uShine uniform + the env button class. The engine never
   reaches into terrain/water. */
'use strict';

window.cartaRenderEngine = function cartaRenderEngine(THREE, canvas, OrbitControls, PostFX) {
  let renderer = null, camera = null, controls = null;
  let env = null, hemi = null, envOn = true;       // PMREM image-based lighting, toggleable
  let scene = null;                                // the active scene (host-owned content)
  let composer = null, bloomPass = null;           // bloom (behind Studio light)
  let updaters = [];                               // animated[] from the host
  let frameHook = null, modeHook = null;           // host per-frame hooks
  let preUpdateHook = null;                         // host hook run at the TOP of the loop (tween), before controls.update()
  let mode = 'overview';                            // 'overview' | 'tour'
  let raf = 0, t0 = 0, lastT = 0;
  let running = false;

  /* ---------- renderer + camera + controls ---------- */

  function createRenderer() {
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
    return { renderer, camera, controls };
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

  /* ---------- env toggle (water coupling stays in the host) ---------- */

  // On: IBL fills the ambient and the hemisphere light backs off, for a softer,
  // grounded "studio" look. Off: the plain hemisphere + sun. The host's
  // onWaterSync callback rides the same toggle (water reflections + sun glitter +
  // the env-button class); bloom too, via the loop's render decision.
  function setEnv(on, onWaterSync) {
    envOn = on;
    if (scene) scene.environment = (on && env) ? env : null;
    if (hemi) hemi.intensity = on ? 0.5 : 0.95;
    if (onWaterSync) onWaterSync(on);
  }

  /* ---------- active scene + per-radius rig ---------- */

  function setActiveScene(s) {
    scene = s;
    return scene;
  }

  // Control distances, camera near/far, and the golden-hour light rig, sized to the
  // port footprint radius. Adds the hemisphere + sun lights and the distance fog to
  // the active scene; returns the lights + the normalized sun direction for the host.
  function configureForRadius(radius) {
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
    const sunDir = sun.position.clone().normalize();   // handed to the water by the host
    return { hemi, sun, sunDir };
  }

  /* ---------- bloom composer ---------- */

  // Rebuilt per open so its passes track the new scene/camera.
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

  /* ---------- per-frame hooks + mode ---------- */

  function setUpdaters(list) { updaters = list || []; }
  function setFrameHook(fn) { frameHook = fn; }
  function setModeHook(fn) { modeHook = fn; }
  function setPreUpdateHook(fn) { preUpdateHook = fn; }
  function setMode(m) { mode = m; }

  /* ---------- the loop ---------- */

  function frame() {
    raf = requestAnimationFrame(frame);
    if (!scene || !running) return;
    const now = performance.now();
    const t = (now - t0) / 1000;
    const dt = Math.min(0.05, t - lastT); lastT = t;
    // host pre-update (the tween) runs at the TOP of the loop, before the
    // overview controller's controls.update() — exactly as the original loop did.
    if (preUpdateHook) preUpdateHook(dt, t, now);
    if (mode === 'overview') {
      // engine owns the default overview controller's per-frame tick; the host's
      // modeHook then runs its overview book-keeping against the updated target.
      controls.update();
    }
    if (modeHook) modeHook(dt, t, now);
    if (frameHook) frameHook(dt);
    for (const a of updaters) { try { a.update(t, camera); } catch (e) { /* ignore */ } }
    // Studio light routes through the bloom composer (the sun glitter & bright
    // sails glow); matte mode renders straight, with no post cost.
    if (envOn && composer) composer.render();
    else renderer.render(scene, camera);
  }

  function start() {
    running = true;
    if (t0 === 0) t0 = performance.now();
    if (!raf) frame();
  }

  function startClock(now) { t0 = now; lastT = 0; }
  function stop() {
    running = false;
    cancelAnimationFrame(raf); raf = 0;
  }

  /* ---------- resize + dispose ---------- */

  function onResize() {
    if (!renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (composer) composer.setSize(w, h);
  }

  function dispose() {
    try { if (composer) composer.dispose(); } catch (e) { /* ignore */ }
    try { if (renderer) renderer.dispose(); } catch (e) { /* ignore */ }
  }

  return {
    createRenderer, buildEnv,
    setActiveScene, configureForRadius, buildComposer,
    setEnv, setUpdaters, setFrameHook, setModeHook, setPreUpdateHook, setMode,
    start, stop, startClock, onResize, dispose,
    get camera() { return camera; },
    get controls() { return controls; },
    get renderer() { return renderer; },
    get composer() { return composer; },
    get envOn() { return envOn; },
  };
};
