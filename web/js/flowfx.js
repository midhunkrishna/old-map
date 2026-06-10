/* Carta Temporum — flowfx module: ink-particle flow animation of the trade
   winds and surface currents on a 2D canvas above the WebGL chart but below
   every DOM marker. Advects along cartaWind's smoothed grid field, so trails
   curve seamlessly (no belt or box edges). Registered via window.cartaInits. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function init_flowfx(carta) {
  const map = carta.map;
  const W = window.cartaWind;
  if (!W) return;

  const D2R = Math.PI / 180;

  /* Distinct pigments: wind = slate ink-blue, ocean = verdigris sea-green. */
  const WIND_SLOW = 'rgba(82,100,121,0.28)';
  const WIND_FAST = 'rgba(82,100,121,0.42)';
  const OCEAN_SLOW = 'rgba(58,107,90,0.45)';
  const OCEAN_FAST = 'rgba(58,107,90,0.6)';
  const WIND_WIDTH = 0.9;
  const OCEAN_W_SLOW = 1.5, OCEAN_W_FAST = 2.2;

  const WIND_BASE = 1300, OCEAN_BASE = 850;
  const WIND_FLOOR = 400, OCEAN_FLOOR = 250;
  const PX_PER_FRAME = 2.0;    // visual speed at magnitude 1, in CSS px/frame
  const MAX_SEG_PX = 40;       // skip drawing teleport/wrap segments
  const OCEAN_VIS = 0.9;       // knots → visual units

  /* ---------- canvas: above the WebGL canvas, below all DOM markers ---------- */
  const cnv = document.createElement('canvas');
  cnv.id = 'fx-canvas';
  cnv.style.position = 'absolute';
  cnv.style.inset = '0';
  cnv.style.pointerEvents = 'none';
  const cc = map.getCanvasContainer();
  cc.insertBefore(cnv, map.getCanvas().nextSibling);
  const ctx = cnv.getContext('2d');

  const dprCap = () => Math.min(window.devicePixelRatio || 1, 1.5);
  function resize() {
    const c = map.getContainer();
    const dpr = dprCap();
    cnv.width = Math.max(1, c.clientWidth * dpr);
    cnv.height = Math.max(1, c.clientHeight * dpr);
    cnv.style.width = c.clientWidth + 'px';
    cnv.style.height = c.clientHeight + 'px';
  }
  resize();
  map.on('resize', resize);

  /* ---------- particle populations (typed arrays) ---------- */
  function makePop(n) {
    return {
      n,
      lon: new Float32Array(n), lat: new Float32Array(n),
      plon: new Float32Array(n), plat: new Float32Array(n),
      age: new Float32Array(n), maxAge: new Float32Array(n),
    };
  }
  let windCount = WIND_BASE, oceanCount = OCEAN_BASE;
  let windPop = makePop(windCount);
  let oceanPop = makePop(oceanCount);

  let windOn = false;
  let currentsOn = false;
  const enabled = () => windOn || currentsOn;
  let raf = 0;
  let clearedForMove = true;
  let fieldReady = false;

  /* ---------- adaptive load shedding ---------- */
  let frameEMA = 0, slowFrames = 0, lastT = 0, lastStrokes = 0;
  function shedLoad() {
    windCount = Math.max(WIND_FLOOR, Math.round(windCount * 0.85));
    oceanCount = Math.max(OCEAN_FLOOR, Math.round(oceanCount * 0.85));
    if (windCount > windPop.n) windCount = windPop.n;
    if (oceanCount > oceanPop.n) oceanCount = oceanPop.n;
  }

  function viewBox() {
    const b = map.getBounds();
    const padX = (b.getEast() - b.getWest()) * 0.15;
    const padY = (b.getNorth() - b.getSouth()) * 0.15;
    return {
      w: b.getWest() - padX, e: b.getEast() + padX,
      s: Math.max(-72, b.getSouth() - padY), n: Math.min(72, b.getNorth() + padY),
    };
  }

  function spawnWind(p, i, bb) {
    p.age[i] = (Math.random() * 60) | 0;
    p.maxAge[i] = 240 + ((Math.random() * 160) | 0);
    let lon = 0, lat = 0;
    for (let t = 0; t < 8; t++) {
      lon = bb.w + Math.random() * (bb.e - bb.w);
      lat = bb.s + Math.random() * (bb.n - bb.s);
      if (Math.abs(lat) <= 72) break;
    }
    p.lon[i] = lon;
    p.lat[i] = Math.max(-72, Math.min(72, lat));
    p.plon[i] = p.lon[i];
    p.plat[i] = p.lat[i];
  }

  // Ocean particles live only on navigable water; prefer water that moves.
  function spawnOcean(p, i, bb) {
    p.age[i] = (Math.random() * 50) | 0;
    p.maxAge[i] = 200 + ((Math.random() * 140) | 0);
    let wLon = NaN, wLat = NaN, bestKn2 = -1;
    for (let t = 0; t < 14; t++) {
      const lon = bb.w + Math.random() * (bb.e - bb.w);
      const lat = bb.s + Math.random() * (bb.n - bb.s);
      if (!W.isWater(lon, lat)) continue;
      const f = W.fieldAt(lon, lat, 'ocean');
      const kn2 = f.u * f.u + f.v * f.v;
      if (kn2 > bestKn2) { bestKn2 = kn2; wLon = lon; wLat = lat; }
      if (kn2 > 0.6) break;  // strong stream found: concentrate there
    }
    if (isNaN(wLon)) {        // no water in view; retry next frame
      p.lon[i] = bb.w; p.lat[i] = bb.s;
      p.age[i] = 1; p.maxAge[i] = 0;
    } else {
      p.lon[i] = wLon; p.lat[i] = wLat;
    }
    p.plon[i] = p.lon[i];
    p.plat[i] = p.lat[i];
  }

  function seed() {
    const bb = viewBox();
    for (let i = 0; i < windPop.n; i++) spawnWind(windPop, i, bb);
    for (let i = 0; i < oceanPop.n; i++) spawnOcean(oceanPop, i, bb);
  }

  /* ---------- projection: one anchor per frame, no map.project per particle.
     x = o.x + lon/360*world, y = o.y + mercY(lat)*world with mercY(0)=0.
     Validated against map.project each frame; deviation (e.g. a rotated
     map) falls back to per-particle map.project — correctness first. */
  const mercY = (lat) => -Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / (2 * Math.PI);

  function projSetup() {
    const world = 512 * Math.pow(2, map.getZoom());
    const o = map.project(new maplibregl.LngLat(0, 0));
    const centerLng = map.getCenter().lng;
    let exact = true;
    const c = map.getCenter();
    const tests = [
      [c.lng, Math.max(-60, Math.min(60, c.lat))],
      [c.lng + 41, 33], [c.lng - 57, -28],
    ];
    for (const [tl, tt] of tests) {
      const got = map.project(new maplibregl.LngLat(tl, tt));
      const x = o.x + tl / 360 * world;
      const y = o.y + mercY(tt) * world;
      if (Math.abs(got.x - x) > 1 || Math.abs(got.y - y) > 1) { exact = false; break; }
    }
    return { world, ox: o.x, oy: o.y, centerLng, exact };
  }

  /* ---------- per-frame advection + render ---------- */
  // Segment buckets (x0,y0,x1,y1 quads): ≤4 batched strokes per frame.
  const bWindSlow = [], bWindFast = [], bOceanSlow = [], bOceanFast = [];

  function frame() {
    raf = 0;
    if (!enabled() || document.hidden) return;
    if (map.isMoving()) {
      // Trails smear under reprojection: clear once and idle until still.
      if (!clearedForMove) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, cnv.width, cnv.height);
        clearedForMove = true;
      }
      lastT = 0;
      raf = requestAnimationFrame(frame);
      return;
    }
    clearedForMove = false;
    const dpr = dprCap();
    const cw = cnv.width / dpr, ch = cnv.height / dpr;
    const pr = projSetup();
    const step = PX_PER_FRAME * 360 / pr.world; // degrees per frame at magnitude 1
    const bb = viewBox();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';

    bWindSlow.length = bWindFast.length = bOceanSlow.length = bOceanFast.length = 0;
    const { world, ox, oy, centerLng, exact } = pr;

    // Push segment a→b into bucket, drawn at every visible world copy.
    function pushSeg(bucket, lon0, lat0, lon1, lat1) {
      let x0, y0, x1, y1;
      if (exact) {
        let lw = lon0 - centerLng;
        lw -= 360 * Math.round(lw / 360);
        x0 = ox + (lw + centerLng) / 360 * world;
        x1 = x0 + (lon1 - lon0) / 360 * world;
        y0 = oy + mercY(lat0) * world;
        y1 = oy + mercY(lat1) * world;
      } else {
        let l0 = lon0, l1 = lon1;
        while (l0 - centerLng > 180) { l0 -= 360; l1 -= 360; }
        while (l0 - centerLng < -180) { l0 += 360; l1 += 360; }
        const a = map.project(new maplibregl.LngLat(l0, lat0));
        const b = map.project(new maplibregl.LngLat(l1, lat1));
        x0 = a.x; y0 = a.y; x1 = b.x; y1 = b.y;
      }
      const dx = x1 - x0, dy = y1 - y0;
      if (dx * dx + dy * dy > MAX_SEG_PX * MAX_SEG_PX) return;
      for (let c = -1; c <= 1; c++) {
        const off = c * world;
        if (Math.max(x0, x1) + off < -8 || Math.min(x0, x1) + off > cw + 8) continue;
        bucket.push(x0 + off, y0, x1 + off, y1);
      }
    }

    /* winds */
    if (windOn) {
      const p = windPop;
      for (let i = 0; i < windCount; i++) {
        let lon = p.lon[i], lat = p.lat[i];
        const plon = lon, plat = lat;
        const cosLat = Math.max(0.2, Math.cos(lat * D2R));
        const w = W.windAt(lon, lat);
        let fast = false;
        if (!w.directed) {
          // variable airs: slow random walk (the field's calm residual is
          // intentionally left to the smoothing, not the renderer)
          lon += (Math.random() - 0.5) * step * 0.6 / cosLat;
          lat += (Math.random() - 0.5) * step * 0.6;
        } else {
          const f = W.fieldAt(lon, lat, 'wind');
          lon += f.u * step / cosLat;
          lat += f.v * step;
          fast = f.u * f.u + f.v * f.v > 0.64;
        }
        if (++p.age[i] > p.maxAge[i] || lon < bb.w || lon > bb.e || lat < bb.s || lat > bb.n) {
          spawnWind(p, i, bb);
          continue;
        }
        p.lon[i] = lon; p.lat[i] = lat;
        p.plon[i] = plon; p.plat[i] = plat;
        pushSeg(fast ? bWindFast : bWindSlow, plon, plat, lon, lat);
      }
    }

    /* ocean currents */
    if (currentsOn) {
      const p = oceanPop;
      for (let i = 0; i < oceanCount; i++) {
        let lon = p.lon[i], lat = p.lat[i];
        const plon = lon, plat = lat;
        const cosLat = Math.max(0.2, Math.cos(lat * D2R));
        const f = W.fieldAt(lon, lat, 'ocean');
        const kn2 = f.u * f.u + f.v * f.v;
        lon += f.u * OCEAN_VIS * step / cosLat;
        lat += f.v * OCEAN_VIS * step;
        if (kn2 < 0.0009) p.age[i] += 6;       // becalmed water fades fast
        p.age[i]++;
        const ashore = !W.isWater(lon, lat);   // dies at the coast, as it should
        if (ashore || p.age[i] > p.maxAge[i] || lon < bb.w || lon > bb.e || lat < bb.s || lat > bb.n) {
          spawnOcean(p, i, bb);
          continue;
        }
        p.lon[i] = lon; p.lat[i] = lat;
        p.plon[i] = plon; p.plat[i] = plat;
        pushSeg(kn2 > 0.49 ? bOceanFast : bOceanSlow, plon, plat, lon, lat);
      }
    }

    /* batched strokes: at most 4 per frame */
    let strokes = 0;
    function strokeBucket(arr, style, width) {
      if (!arr.length) return;
      ctx.beginPath();
      for (let k = 0; k < arr.length; k += 4) {
        ctx.moveTo(arr[k], arr[k + 1]);
        ctx.lineTo(arr[k + 2], arr[k + 3]);
      }
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.stroke();
      strokes++;
    }
    strokeBucket(bWindSlow, WIND_SLOW, WIND_WIDTH);
    strokeBucket(bWindFast, WIND_FAST, WIND_WIDTH);
    strokeBucket(bOceanSlow, OCEAN_SLOW, OCEAN_W_SLOW);
    strokeBucket(bOceanFast, OCEAN_FAST, OCEAN_W_FAST);
    lastStrokes = strokes;

    /* adaptive shedding on the EMA of frame-to-frame time */
    const now = performance.now();
    const dt = lastT ? Math.min(150, now - lastT) : 16;
    lastT = now;
    frameEMA = frameEMA ? frameEMA * 0.9 + dt * 0.1 : dt;
    if (frameEMA > 20) {
      if (++slowFrames >= 60) { shedLoad(); slowFrames = 0; }
    } else {
      slowFrames = 0;
    }

    raf = requestAnimationFrame(frame);
  }

  /* ---------- lifecycle ---------- */
  function start() { if (!raf && enabled() && !document.hidden) raf = requestAnimationFrame(frame); }
  function stop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    lastT = 0;
  }
  function clearCanvas() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cnv.width, cnv.height);
    clearedForMove = true;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else start();
  });

  function setEnabled(wind, current) {
    const was = enabled();
    windOn = !!wind;
    currentsOn = !!current;
    if (!enabled()) {
      stop();
      clearCanvas();
      return;
    }
    if (!fieldReady) return; // started by the ready handler below
    seed();
    if (!was) clearCanvas();
    start();
  }

  window.cartaFlow = {
    setEnabled, enabled,
    stats() { return { frameMs: frameEMA, wind: windCount, ocean: oceanCount, strokes: lastStrokes }; },
    // test hook: override population sizes (reallocates and reseeds)
    _setCounts(wn, on) {
      windCount = Math.max(1, wn | 0);
      oceanCount = Math.max(1, on | 0);
      windPop = makePop(windCount);
      oceanPop = makePop(oceanCount);
      if (enabled() && fieldReady) seed();
    },
  };

  if (W.ready && W.ready.then) {
    W.ready.then(() => {
      fieldReady = true;
      if (enabled()) { seed(); clearCanvas(); start(); }
    });
  } else {
    fieldReady = true;
  }

  /* ---------- Ordnances wiring (overlays inits before us) ---------- */
  const applyState = (st) => setEnabled(st.living && st.winds, st.living && st.currents);
  if (carta.ordnances) {
    carta.ordnances.onChange(applyState);
    applyState(carta.ordnances.state);
  }
});
