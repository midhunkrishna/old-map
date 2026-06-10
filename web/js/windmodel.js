/* Carta Temporum — client-side port of the Go wind/current model
   (internal/engine/wind.go). Defines window.cartaWind immediately (not a
   cartaInit module); consumed by flowfx.js (particles) and voyage.js (log). */
'use strict';

(function () {
  const D2R = Math.PI / 180;

  // Calibrated mean speed through water with a fair wind on the beam (knots).
  const BASE_SPEED_KN = 3.7;

  // Annual-mean wind for a position: the compass direction the wind blows
  // FROM (degrees), a strength multiplier, and whether the belt has a
  // dominant direction (false for doldrums/variables). Belt boundaries are
  // an exact port of internal/engine/wind.go WindAt.
  function windAt(lon, lat) {
    if (lat > 66) return { from: 270, strength: 0.25, directed: true };  // polar; effectively closed water
    if (lat > 58) return { from: 265, strength: 0.80, directed: true };  // subpolar westerlies
    if (lat > 36) return { from: 258, strength: 1.02, directed: true };  // N mid-latitude westerlies (from WSW)
    if (lat > 28) return { from: 0, strength: 0.62, directed: false };   // horse latitudes / variables
    if (lat > 6) {
      if (lon > 44 && lon < 100 && lat < 26) {
        return { from: 0, strength: 0.85, directed: false };             // N Indian Ocean monsoon, annualized
      }
      return { from: 52, strength: 1.05, directed: true };               // NE trade winds
    }
    if (lat > -5) {
      if (lon > 42 && lon < 100) {
        return { from: 0, strength: 0.80, directed: false };             // equatorial Indian Ocean
      }
      return { from: 0, strength: 0.42, directed: false };               // doldrums (ITCZ)
    }
    if (lat > -27) return { from: 132, strength: 1.05, directed: true }; // SE trade winds
    if (lat > -36) return { from: 0, strength: 0.62, directed: false };  // S variables
    if (lat > -52) return { from: 282, strength: 1.25, directed: true }; // roaring forties
    if (lat > -62) return { from: 275, strength: 1.00, directed: true };
    return { from: 270, strength: 0.25, directed: true };                // ice latitude
  }

  // The major named surface currents of the age of sail, as rectangles with
  // a mean set (dirTo = direction the water flows TOWARD, degrees) and drift
  // (kn). Exact port of the Go `currents` table (20 boxes).
  const CURRENTS = [
    { latMin: 24, latMax: 35, lonMin: -82, lonMax: -75, dirTo: 40, kn: 1.8, name: 'Gulf Stream' },
    { latMin: 33, latMax: 42, lonMin: -75, lonMax: -58, dirTo: 65, kn: 1.0, name: 'Gulf Stream' },
    { latMin: 42, latMax: 52, lonMin: -55, lonMax: -15, dirTo: 78, kn: 0.5, name: 'North Atlantic Drift' },
    { latMin: 16, latMax: 30, lonMin: -22, lonMax: -12, dirTo: 205, kn: 0.6, name: 'Canary Current' },
    { latMin: 8, latMax: 20, lonMin: -58, lonMax: -20, dirTo: 272, kn: 0.6, name: 'North Equatorial Current' },
    { latMin: 10, latMax: 18, lonMin: -79, lonMax: -60, dirTo: 285, kn: 0.7, name: 'Caribbean Current' },
    { latMin: 20, latMax: 24, lonMin: -87, lonMax: -80, dirTo: 30, kn: 1.0, name: 'Yucatán Current' },
    { latMin: -16, latMax: 1, lonMin: -37, lonMax: 8, dirTo: 285, kn: 0.6, name: 'South Equatorial Current' },
    { latMin: -28, latMax: -16, lonMin: -48, lonMax: -38, dirTo: 215, kn: 0.5, name: 'Brazil Current' },
    { latMin: -32, latMax: -15, lonMin: 5, lonMax: 15, dirTo: 330, kn: 0.6, name: 'Benguela Current' },
    { latMin: -36, latMax: -26, lonMin: 25, lonMax: 35, dirTo: 230, kn: 1.4, name: 'Agulhas Current' },
    { latMin: -14, latMax: -7, lonMin: 48, lonMax: 95, dirTo: 272, kn: 0.6, name: 'Indian South Equatorial Current' },
    { latMin: 24, latMax: 34, lonMin: 122, lonMax: 140, dirTo: 45, kn: 1.4, name: 'Kuroshio' },
    { latMin: 35, latMax: 45, lonMin: 145, lonMax: 180, dirTo: 82, kn: 0.5, name: 'North Pacific Drift' },
    { latMin: 35, latMax: 45, lonMin: -180, lonMax: -140, dirTo: 95, kn: 0.5, name: 'North Pacific Drift' },
    { latMin: 23, latMax: 35, lonMin: -128, lonMax: -115, dirTo: 155, kn: 0.5, name: 'California Current' },
    { latMin: 9, latMax: 19, lonMin: -180, lonMax: -115, dirTo: 272, kn: 0.5, name: 'North Equatorial Current' },
    { latMin: 9, latMax: 19, lonMin: 125, lonMax: 180, dirTo: 272, kn: 0.5, name: 'North Equatorial Current' },
    { latMin: -30, latMax: -8, lonMin: -82, lonMax: -72, dirTo: 345, kn: 0.7, name: 'Humboldt Current' },
    { latMin: -10, latMax: -3, lonMin: -175, lonMax: -90, dirTo: 275, kn: 0.5, name: 'South Equatorial Current' },
  ];

  // Smallest absolute angular difference between two bearings, degrees.
  function angDiff(a, b) {
    let d = (a - b) % 360;
    if (d < -180) d += 360;
    if (d > 180) d -= 360;
    return Math.abs(d);
  }

  // currentAt sums the set/drift of every current box containing the point
  // into east (u) / north (v) components in knots; null in still water.
  function currentAt(lon, lat) {
    let u = 0, v = 0, best = null, bestKn = -1;
    for (const c of CURRENTS) {
      if (lat >= c.latMin && lat <= c.latMax && lon >= c.lonMin && lon <= c.lonMax) {
        u += c.kn * Math.sin(c.dirTo * D2R);
        v += c.kn * Math.cos(c.dirTo * D2R);
        if (c.kn > bestKn) { bestKn = c.kn; best = c; }
      }
    }
    if (!best) return null;
    return { u, v, kn: Math.hypot(u, v), name: best.name };
  }

  // Currents in knots mapped into trade-wind units (trades ≈ 1.0 magnitude).
  const CURRENT_SCALE = 0.45;

  // flowAt: combined surface flow — wind vector (blowing TOWARD from+180,
  // magnitude proportional to belt strength, so trades ≈ 1.05) plus the
  // scaled current vector. calm=true inside undirected belts.
  function flowAt(lon, lat) {
    const w = windAt(lon, lat);
    let u = 0, v = 0;
    if (w.directed) {
      const toward = (w.from + 180) * D2R;
      u = w.strength * Math.sin(toward);
      v = w.strength * Math.cos(toward);
    }
    const c = currentAt(lon, lat);
    if (c) { u += c.u * CURRENT_SCALE; v += c.v * CURRENT_SCALE; }
    return { u, v, calm: !w.directed };
  }

  /* ---------- smooth gridded flow field ----------
     Built once at load from the analytic model above plus the server's
     land/water mask (/api/flowmask). Box-blurring the belt/box vectors turns
     hard belt boundaries and rectangular current boxes into seamless curving
     streams (the masked ocean blur lets the Gulf Stream hug the coast and
     arc into the North Atlantic Drift instead of smearing inland). */
  const GW = 360, GH = 161, GLAT0 = -80, GLON0 = -180;
  let mask = null;   // Uint8Array GW*GH, 1 = navigable ocean (row 0 = lat -80)
  let windU = null, windV = null, oceanU = null, oceanV = null;

  // One separable box-blur pass over a GW×GH scalar field, in place.
  // Lon-wrapping horizontally, lat-clamped vertically. With a mask, only
  // mask=1 cells contribute (and weight) — land contributes nothing.
  function blurPass(src, tmp, msk, radius) {
    for (let j = 0; j < GH; j++) {           // horizontal, wraps in lon
      const row = j * GW;
      for (let i = 0; i < GW; i++) {
        let s = 0, wt = 0;
        for (let k = -radius; k <= radius; k++) {
          const idx = row + ((i + k + GW) % GW);
          if (!msk || msk[idx]) { s += src[idx]; wt++; }
        }
        tmp[row + i] = wt ? s / wt : 0;
      }
    }
    for (let i = 0; i < GW; i++) {           // vertical, clamps at lat edges
      for (let j = 0; j < GH; j++) {
        let s = 0, wt = 0;
        for (let k = -radius; k <= radius; k++) {
          let jj = j + k;
          if (jj < 0) jj = 0; else if (jj > GH - 1) jj = GH - 1;
          const idx = jj * GW + i;
          if (!msk || msk[idx]) { s += tmp[idx]; wt++; }
        }
        src[j * GW + i] = wt ? s / wt : 0;
      }
    }
  }

  function buildFields(m) {
    mask = m;
    const n = GW * GH;
    windU = new Float32Array(n); windV = new Float32Array(n);
    oceanU = new Float32Array(n); oceanV = new Float32Array(n);
    for (let j = 0; j < GH; j++) {
      const lat = GLAT0 + j;
      for (let i = 0; i < GW; i++) {
        const lon = GLON0 + i, idx = j * GW + i;
        const w = windAt(lon, lat);
        if (w.directed) {
          const t = (w.from + 180) * D2R;
          windU[idx] = w.strength * Math.sin(t);
          windV[idx] = w.strength * Math.cos(t);
        } else {
          windV[idx] = 0.15;  // calm residual, due north (renderer jitters)
        }
        if (mask[idx]) {
          const c = currentAt(lon, lat);
          if (c) { oceanU[idx] = c.u; oceanV[idx] = c.v; }  // knots
        }
      }
    }
    const tmp = new Float32Array(n);
    for (let p = 0; p < 3; p++) {  // wide smooth shear zones between belts
      blurPass(windU, tmp, null, 3);
      blurPass(windV, tmp, null, 3);
    }
    for (let p = 0; p < 4; p++) {  // boxes merge into continuous streams
      blurPass(oceanU, tmp, mask, 2);
      blurPass(oceanV, tmp, mask, 2);
    }
    for (let k = 0; k < n; k++) {  // hard zero on land
      if (!mask[k]) { oceanU[k] = 0; oceanV[k] = 0; }
    }
  }

  // Bilinear sample of the smoothed field; wind in belt-strength units,
  // ocean in knots. {u:0,v:0} until the build completes.
  function fieldAt(lon, lat, kind) {
    const U = kind === 'ocean' ? oceanU : windU;
    const V = kind === 'ocean' ? oceanV : windV;
    if (!U) return { u: 0, v: 0 };
    const fi = (((lon - GLON0) % 360) + 360) % 360;
    let fj = lat - GLAT0;
    if (fj < 0) fj = 0; else if (fj > GH - 1) fj = GH - 1;
    const i0 = fi | 0, j0 = fj | 0;
    const i1 = (i0 + 1) % GW, j1 = j0 + 1 > GH - 1 ? GH - 1 : j0 + 1;
    const tx = fi - i0, ty = fj - j0;
    const a = j0 * GW + i0, b = j0 * GW + i1, c = j1 * GW + i0, d = j1 * GW + i1;
    const u0 = U[a] + (U[b] - U[a]) * tx, u1 = U[c] + (U[d] - U[c]) * tx;
    const v0 = V[a] + (V[b] - V[a]) * tx, v1 = V[c] + (V[d] - V[c]) * tx;
    return { u: u0 + (u1 - u0) * ty, v: v0 + (v1 - v0) * ty };
  }

  function isWater(lon, lat) {
    if (!mask) return true;
    const i = Math.round((((lon - GLON0) % 360) + 360) % 360) % GW;
    let j = Math.round(lat - GLAT0);
    if (j < 0) j = 0; else if (j > GH - 1) j = GH - 1;
    return mask[j * GW + i] === 1;
  }

  // ready resolves true when the field is built from the real mask, false
  // when the mask fetch failed (all-water fallback field; static arrows
  // then keep the server data).
  const ready = fetch('/api/flowmask')
    .then((r) => { if (!r.ok) throw new Error('flowmask ' + r.status); return r.json(); })
    .then((d) => {
      if (d.w !== GW || d.h !== GH || d.lat0 !== GLAT0 || d.lon0 !== GLON0) {
        throw new Error('flowmask grid mismatch');
      }
      const bin = atob(d.mask);
      const m = new Uint8Array(GW * GH);
      for (let k = 0; k < m.length && k < bin.length; k++) m[k] = bin.charCodeAt(k);
      buildFields(m);
      return true;
    })
    .catch((e) => {
      console.warn('cartaWind: flowmask unavailable, all-water field', e);
      mask = null;
      buildFields(new Uint8Array(GW * GH).fill(1));
      mask = null;  // isWater stays permissive in the fallback
      return false;
    });

  window.cartaWind = {
    windAt, currentAt, flowAt, angDiff,
    fieldAt, isWater, ready,
    currents: CURRENTS,
    BASE_SPEED_KN,
  };
})();
