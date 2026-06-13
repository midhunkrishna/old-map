/* Carta Temporum — harbortown module: the town ashore, rebuilt.
   A factory consumed by harbor3d.js once Three.js is loaded. It raises the
   whole miniature port from the surveyed harbor plans: cobbled and rutted
   streets laid as real WebGL ground, plazas with their wells, Batavia's
   canals between stone quays, planked wharves on piles with their cranes,
   masonry forts with battered walls, merlons, sentry garitas and guns,
   nation-styled row houses with close-zoom detail (dormers, stoops, hanging
   signs), churches and public halls at landmark scale, and sculpted relief
   with palms. Meshes tagged userData.lod = true are the close-zoom detail
   tier; harbor3d.js shows them past z≈14.7. */
'use strict';

window.cartaTownBuilder = function cartaTownBuilder(THREE, carta, shipMats) {
  const D2RAD = Math.PI / 180;
  const M_PER_DEG_LAT = 110540;

  /* ---------- frames ----------
     groundMatrix puts a local frame on the ellipsoid: x east, y up,
     z south, meters. ringMeters flattens a lon/lat ring to local meters
     about its centroid. */

  // The diorama injects a metric frame { project, heightAt }; when present the
  // whole town is placed in metres at the world origin (x east, y up, z south),
  // anchored to the terrain. When absent we keep the legacy mercator placement
  // for the map-embedded Living Harbour (harbor3d.js), until that path retires.
  let frame = null;
  // Remap mercator (x east, y south, z alt) → diorama (x east, y up, z south):
  // a Y/Z swap. Combined with the -Y flip below the determinant is +1, so the
  // authored geometry keeps its winding (no inside-out faces).
  const SWAP_YZ = new THREE.Matrix4().set(
    1, 0, 0, 0,
    0, 0, 1, 0,
    0, 1, 0, 0,
    0, 0, 0, 1);

  function groundMatrix(lngLat, angDeg) {
    const ang = (angDeg || 0) * D2RAD;
    if (frame) {
      const p = frame.project(lngLat[0], lngLat[1]);
      const y = frame.heightAt ? frame.heightAt(p.x, p.z) : 0;
      return new THREE.Matrix4()
        .makeTranslation(p.x, y, p.z)
        .multiply(SWAP_YZ)
        .multiply(new THREE.Matrix4().makeScale(1, -1, 1))
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
        .multiply(new THREE.Matrix4().makeRotationY(ang));
    }
    const mc = maplibregl.MercatorCoordinate.fromLngLat(lngLat, 0);
    const s = mc.meterInMercatorCoordinateUnits();
    return new THREE.Matrix4()
      .makeTranslation(mc.x, mc.y, 0)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeRotationY(ang));
  }
  const localM = (sx, sy, sz, yOff) => new THREE.Matrix4()
    .makeTranslation(0, yOff || 0, 0)
    .multiply(new THREE.Matrix4().makeScale(sx, sy, sz));

  function ringMeters(ring) {
    let clon = 0, clat = 0;
    for (const [x, y] of ring) { clon += x; clat += y; }
    clon /= ring.length; clat /= ring.length;
    const mx = M_PER_DEG_LAT * Math.cos(clat * D2RAD);
    return { clon, clat, mx, pts: ring.map(([x, y]) => [(x - clon) * mx, (y - clat) * M_PER_DEG_LAT]) };
  }

  /* ---------- the nations build differently ---------- */

  const HARBOR_STYLE = {
    nassau: 'english', 'port-royal': 'english', charleston: 'english', bridgetown: 'english',
    havana: 'spanish', cartagena: 'spanish', tortuga: 'french', batavia: 'dutch',
  };
  const WALL_TINTS = {
    english: [0xb56a4a, 0xe2d6b5, 0xc99a72],
    spanish: [0xf0e8d8, 0xe8d3a8, 0xe6c8c0],
    dutch: [0xa55f43, 0xe2d6b5, 0x9a6a50],
    french: [0xd9c9a4, 0xe6dcc0, 0xc9b288],
  };
  const ROOF_TINTS = {
    english: [0x6e5a45, 0x59493a, 0x7a6450],
    spanish: [0xb35a36, 0xa14e30, 0xc26a40],
    dutch: [0x8e4a32, 0x7a3e2a, 0x9c5638],
    french: [0x6e5a45, 0x86715a, 0x59493a],
  };
  const STREET_W = { english: 6.4, spanish: 5.2, dutch: 5.6, french: 5.2 };

  /* ---------- painted canvases ---------- */

  const texCache = {};
  function canvasTex(key, w, h, paint, repeat) {
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    texCache[key] = tex;
    return tex;
  }

  // Deterministic per-painter RNG (Lehmer LCG seeded from the cache key) so the
  // weathering strokes are stable across builds — a prerequisite for POM, where the
  // relief canvas must mirror the albedo stroke-for-stroke (parallax_occulusion.md
  // Phase 1a). Geometry-side Math.random (house placement etc.) is untouched.
  function lcg(key) {
    let s = 0;
    for (let i = 0; i < key.length; i++) s = (s * 31 + key.charCodeAt(i)) % 2147483647;
    s = (s % 2147483646) + 1;   // 1..2147483646 (avoid the 0 fixed point)
    return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  }

  // Facade with windows, doors, framing — painted neutral parchment; the
  // instanceColor lays on the wall tint. 192px so the casements survive
  // the close zoom the chart now allows.
  function facadeTexture(style, stories, type) {
    const key = 'facade-' + style + stories + (type || '');
    const rand = lcg(key);
    return canvasTex(key, 192, 192, (x) => {
      x.fillStyle = '#ddd2b4';
      x.fillRect(0, 0, 192, 192);
      // weathering streaks
      for (let i = 0; i < 26; i++) {
        x.fillStyle = 'rgba(120,100,70,' + (0.03 + rand() * 0.05) + ')';
        const sx = rand() * 192;
        x.fillRect(sx, rand() * 60, 2 + rand() * 5, 60 + rand() * 130);
      }
      const rowH = 192 / stories;
      const wins = [];          // every painted casement, for the trade deltas below
      let curStory = 0;
      const win = (wx, wy, ww, wh, arched) => {
        wins.push({ wx, wy, ww, wh, s: curStory });
        x.fillStyle = '#f4ecd8';
        x.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);            // surround
        x.fillStyle = 'rgba(61,47,30,0.55)';
        x.fillRect(wx - 3, wy - 4.5, ww + 6, 2.5);             // lintel
        x.fillStyle = '#3a2e1f';
        if (arched) {
          x.fillRect(wx, wy + ww / 2, ww, wh - ww / 2);
          x.beginPath();
          x.arc(wx + ww / 2, wy + ww / 2, ww / 2, Math.PI, 0);
          x.fill();
        } else {
          x.fillRect(wx, wy, ww, wh);
          x.strokeStyle = '#f4ecd8';
          x.lineWidth = 1.6;                                   // casement glazing bars
          x.beginPath();
          x.moveTo(wx + ww / 2, wy); x.lineTo(wx + ww / 2, wy + wh);
          x.moveTo(wx, wy + wh / 3); x.lineTo(wx + ww, wy + wh / 3);
          x.moveTo(wx, wy + wh * 2 / 3); x.lineTo(wx + ww, wy + wh * 2 / 3);
          x.stroke();
        }
      };
      for (let s = 0; s < stories; s++) {
        curStory = s;
        const yTop = 192 - (s + 1) * rowH;
        const wy = yTop + rowH * 0.24, wh = rowH * 0.46;
        if (style === 'spanish') {
          for (const wx of [30, 118]) {
            if (s === 0 && wx === 118) continue;               // door takes its place
            win(wx, wy, 42, wh, true);
            if (s > 0) {                                       // reja: the iron grille
              x.strokeStyle = 'rgba(40,30,20,0.6)';
              x.lineWidth = 1.4;
              for (let gx = wx + 4; gx < wx + 42; gx += 7) {
                x.beginPath(); x.moveTo(gx, wy); x.lineTo(gx, wy + wh * 0.7); x.stroke();
              }
              x.strokeRect(wx - 4, wy - 1, 50, wh * 0.72);
            }
          }
          x.fillStyle = 'rgba(179,90,54,0.5)';                 // tile drip course
          x.fillRect(0, yTop + 2, 192, 3.5);
        } else if (style === 'dutch') {
          for (const wx of [16, 60, 104, 148]) win(wx, wy - rowH * 0.08, 26, wh + rowH * 0.18);
          x.fillStyle = 'rgba(244,236,216,0.85)';
          x.fillRect(0, yTop + rowH - 5, 192, 3.5);            // white sill band
        } else if (style === 'french') {
          for (const wx of [36, 120]) {
            win(wx, wy, 32, wh);
            x.fillStyle = '#6b4a2e';                           // shutters thrown open
            x.fillRect(wx - 14, wy, 10, wh);
            x.fillRect(wx + 36, wy, 10, wh);
            x.strokeStyle = 'rgba(40,30,20,0.4)';
            x.lineWidth = 1;
            for (const sx of [wx - 14, wx + 36]) {
              for (let ly = wy + 3; ly < wy + wh; ly += 4) {
                x.beginPath(); x.moveTo(sx + 1, ly); x.lineTo(sx + 9, ly); x.stroke();
              }
            }
          }
        } else { // english
          for (const wx of [20, 80, 140]) win(wx, wy, 32, wh);
          if (s > 0) {                                         // jetty beam between floors
            x.fillStyle = 'rgba(91,70,54,0.7)';
            x.fillRect(0, yTop + rowH - 5, 192, 5);
          }
        }
      }
      if (style === 'english' && stories > 1) {                // timber studs & braces
        x.fillStyle = 'rgba(91,70,54,0.3)';
        for (let sx = 8; sx < 192; sx += 34) x.fillRect(sx, 0, 3, 192);
        x.strokeStyle = 'rgba(91,70,54,0.22)';
        x.lineWidth = 3;
        x.beginPath(); x.moveTo(4, 192); x.lineTo(64, 96); x.moveTo(188, 192); x.lineTo(128, 96); x.stroke();
      }
      if (style === 'spanish') {                               // quoins down the corners
        x.fillStyle = 'rgba(160,140,105,0.55)';
        for (let qy = 6; qy < 192; qy += 22) {
          x.fillRect(0, qy, 9, 12);
          x.fillRect(183, qy + 11, 9, 12);
        }
      }
      // the door
      x.fillStyle = '#33281b';
      const dw = style === 'spanish' ? 36 : 26, dh = rowH * 0.6;
      x.fillRect(96 - dw / 2, 192 - dh, dw, dh);
      x.strokeStyle = 'rgba(244,236,216,0.5)';                 // planked door
      x.lineWidth = 1.4;
      for (let px = 96 - dw / 2 + 5; px < 96 + dw / 2; px += 6) {
        x.beginPath(); x.moveTo(px, 192 - dh + 2); x.lineTo(px, 190); x.stroke();
      }
      if (style === 'spanish') {                               // arched portal & surround
        x.fillStyle = '#33281b';
        x.beginPath();
        x.arc(96, 192 - dh, dw / 2, Math.PI, 0);
        x.fill();
        x.strokeStyle = '#f4ecd8';
        x.lineWidth = 4;
        x.beginPath();
        x.arc(96, 192 - dh, dw / 2 + 2, Math.PI, 0);
        x.stroke();
      }
      x.fillStyle = 'rgba(61,47,30,0.32)';                     // cornice
      x.fillRect(0, 0, 192, 6);
      /* ----- the promoted trades repaint their ground floor -----
         Small deltas over the base facade, so each type stays in the
         street's idiom; all deterministic (no random in the deltas). */
      if (type) {
        const ground = wins.filter((w2) => w2.s === 0);
        if (type === 'tavern') {              // amber light behind the casements
          for (const w2 of ground) {
            const glow = x.createLinearGradient(0, w2.wy, 0, w2.wy + w2.wh);
            glow.addColorStop(0, '#f2c468');         // candle-bright at the head
            glow.addColorStop(1, '#c98334');         // ember-warm down at the sill
            x.fillStyle = glow;
            x.fillRect(w2.wx, w2.wy, w2.ww, w2.wh);
            x.strokeStyle = 'rgba(110,70,25,0.6)';   // bars dark against the glow
            x.lineWidth = 1.6;
            x.beginPath();
            x.moveTo(w2.wx + w2.ww / 2, w2.wy); x.lineTo(w2.wx + w2.ww / 2, w2.wy + w2.wh);
            x.moveTo(w2.wx, w2.wy + w2.wh / 2); x.lineTo(w2.wx + w2.ww, w2.wy + w2.wh / 2);
            x.stroke();
            x.fillStyle = 'rgba(226,168,78,0.16)';   // lamplight spills below the sill
            x.fillRect(w2.wx - 4, w2.wy + w2.wh + 3, w2.ww + 8, 9);
          }
        } else if (type === 'gambling') {     // shuttered tight against curious eyes
          for (const w2 of ground) {
            x.fillStyle = '#5e4430';
            x.fillRect(w2.wx - 2, w2.wy - 2, w2.ww + 4, w2.wh + 4);
            x.strokeStyle = 'rgba(30,22,14,0.55)';
            x.lineWidth = 1;
            for (let ly = w2.wy + 2; ly < w2.wy + w2.wh; ly += 4) {
              x.beginPath(); x.moveTo(w2.wx - 1, ly); x.lineTo(w2.wx + w2.ww + 1, ly); x.stroke();
            }
            x.fillStyle = 'rgba(30,22,14,0.7)';      // the centre seam
            x.fillRect(w2.wx + w2.ww / 2 - 1, w2.wy - 2, 2, w2.wh + 4);
          }
          const cm = ground[0];
          if (cm) {                           // a chalk tally scrawled on one shutter
            x.strokeStyle = 'rgba(235,228,210,0.75)';
            x.lineWidth = 1.2;
            x.beginPath();
            for (let t = 0; t < 4; t++) {
              x.moveTo(cm.wx + 4 + t * 3, cm.wy + 5); x.lineTo(cm.wx + 4 + t * 3, cm.wy + 12);
            }
            x.moveTo(cm.wx + 2, cm.wy + 12); x.lineTo(cm.wx + 15, cm.wy + 5);  // the cross-stroke
            x.stroke();
          }
        } else if (type === 'counting') {     // iron bars over the ground lights
          for (const w2 of ground) {
            for (let gx = w2.wx + 3; gx < w2.wx + w2.ww; gx += 6) {
              x.strokeStyle = 'rgba(25,20,14,0.85)';
              x.lineWidth = 2;
              x.beginPath(); x.moveTo(gx, w2.wy); x.lineTo(gx, w2.wy + w2.wh); x.stroke();
              x.strokeStyle = 'rgba(0,0,0,0.3)';     // each bar casts its thin shadow
              x.lineWidth = 1;
              x.beginPath(); x.moveTo(gx + 2, w2.wy + 1); x.lineTo(gx + 2, w2.wy + w2.wh); x.stroke();
            }
          }
        } else if (type === 'brothel') {      // madder-dyed shutters thrown wide
          for (const w2 of ground) {
            x.fillStyle = '#963b4a';
            x.fillRect(w2.wx - 12, w2.wy, 9, w2.wh);
            x.fillRect(w2.wx + w2.ww + 3, w2.wy, 9, w2.wh);
            x.strokeStyle = 'rgba(40,20,22,0.45)';
            x.lineWidth = 1;
            for (const sx2 of [w2.wx - 12, w2.wx + w2.ww + 3]) {
              for (let ly = w2.wy + 3; ly < w2.wy + w2.wh; ly += 4) {
                x.beginPath(); x.moveTo(sx2 + 1, ly); x.lineTo(sx2 + 8, ly); x.stroke();
              }
            }
          }
        } else if (type === 'boarding') {     // meaner, smaller lights on every floor
          for (const w2 of wins) {
            x.fillStyle = '#cdc1a0';
            x.fillRect(w2.wx - 4, w2.wy - 6, w2.ww + 8, w2.wh + 10);
            x.fillStyle = '#322a1e';
            x.fillRect(w2.wx + w2.ww * 0.22, w2.wy + w2.wh * 0.18, w2.ww * 0.56, w2.wh * 0.6);
          }
          const ck = wins[1] || wins[0];
          if (ck) {                           // one pane gone to a crack, never mended
            const cx2 = ck.wx + ck.ww * 0.5, cy2 = ck.wy + ck.wh * 0.45;
            x.strokeStyle = 'rgba(205,193,160,0.7)';
            x.lineWidth = 1;
            x.beginPath();
            x.moveTo(cx2 - 4, cy2 - 5); x.lineTo(cx2, cy2); x.lineTo(cx2 + 5, cy2 + 2);
            x.moveTo(cx2, cy2); x.lineTo(cx2 - 2, cy2 + 5);
            x.stroke();
          }
        } else if (type === 'provisioner') {  // blank stores below, hoist loft above
          for (const w2 of ground) {
            x.fillStyle = '#ddd2b4';
            x.fillRect(w2.wx - 6, w2.wy - 7, w2.ww + 12, w2.wh + 12);
          }
          x.fillStyle = '#3a2e1f';            // small high lights
          x.fillRect(24, 192 - rowH + 8, 16, 12);
          x.fillRect(152, 192 - rowH + 8, 16, 12);
          x.fillStyle = '#33281b';            // the big double cart-door
          x.fillRect(66, 192 - rowH * 0.78, 60, rowH * 0.78);
          x.strokeStyle = 'rgba(244,236,216,0.5)';
          x.lineWidth = 2;
          x.beginPath(); x.moveTo(96, 194 - rowH * 0.78); x.lineTo(96, 190); x.stroke();
          x.fillStyle = '#4a3826';            // loft door under the hoist beam
          x.fillRect(82, 10, 28, 30);
          x.strokeStyle = '#f4ecd8';
          x.strokeRect(82, 10, 28, 30);
          x.fillStyle = '#2e2a26';            // the hoist wheel above the loft door
          x.beginPath(); x.arc(96, 7, 3, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#cdc1a0';
          x.fillRect(95.2, 6.2, 1.6, 1.6);    // its worn wooden hub
        } else if (type === 'smithy') {       // the wide bay stands open and black
          const bayY = 192 - rowH * 0.8;
          x.fillStyle = '#171310';
          x.fillRect(34, bayY, 124, rowH * 0.8);
          const forge = x.createLinearGradient(34, 0, 72, 0);  // the forge glows deep at one side
          forge.addColorStop(0, 'rgba(214,108,40,0.55)');
          forge.addColorStop(1, 'rgba(214,108,40,0)');
          x.fillStyle = forge;
          x.fillRect(34, bayY + rowH * 0.25, 38, rowH * 0.55);
          x.fillStyle = 'rgba(91,70,54,0.95)';     // the lintel beam over it
          x.fillRect(30, bayY - 6, 132, 6);
        }
      }
    });
  }

  function roofTexture(style) {
    const rand = lcg('roof-' + style);
    return canvasTex('roof-' + style, 128, 128, (x) => {
      x.fillStyle = '#d8cdb0';
      x.fillRect(0, 0, 128, 128);
      if (style === 'spanish' || style === 'dutch') {          // barrel tiles / pantiles
        for (let i = 0; i < 128; i += 9) {
          x.strokeStyle = 'rgba(60,30,18,0.45)';
          x.lineWidth = 2.2;
          x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke();
          x.strokeStyle = 'rgba(255,240,210,0.25)';
          x.lineWidth = 2;
          x.beginPath(); x.moveTo(i + 4.5, 0); x.lineTo(i + 4.5, 128); x.stroke();
        }
        x.strokeStyle = 'rgba(60,30,18,0.22)';
        x.lineWidth = 1;
        for (let j = 8; j < 128; j += 13) { x.beginPath(); x.moveTo(0, j); x.lineTo(128, j); x.stroke(); }
      } else {                                                 // wood shingles
        x.strokeStyle = 'rgba(40,32,22,0.4)';
        x.lineWidth = 1.4;
        for (let j = 6; j < 128; j += 11) {
          x.beginPath(); x.moveTo(0, j); x.lineTo(128, j); x.stroke();
          for (let i = (j % 22 ? 6 : 14); i < 128; i += 17) {
            x.beginPath(); x.moveTo(i, j); x.lineTo(i, j - 9); x.stroke();
          }
        }
        for (let i = 0; i < 30; i++) {                         // weathered shingles
          x.fillStyle = 'rgba(60,48,32,' + (0.06 + rand() * 0.1) + ')';
          x.fillRect(rand() * 120, rand() * 120, 10, 8);
        }
      }
    });
  }

  function masonryTexture() {
    const rand = lcg('masonry');
    return canvasTex('masonry', 128, 128, (x) => {
      x.fillStyle = '#a8997d';
      x.fillRect(0, 0, 128, 128);
      x.strokeStyle = 'rgba(70,58,40,0.5)';
      x.lineWidth = 1.6;
      for (let j = 0; j < 128; j += 16) {
        x.beginPath(); x.moveTo(0, j); x.lineTo(128, j); x.stroke();
        for (let i = (j % 32 ? 0 : 14); i < 128; i += 28) {
          x.beginPath(); x.moveTo(i, j); x.lineTo(i, j + 16); x.stroke();
        }
      }
      for (let i = 0; i < 24; i++) {                           // uneven stones
        x.fillStyle = 'rgba(60,50,34,' + (0.05 + rand() * 0.08) + ')';
        x.fillRect((rand() * 9 | 0) * 14, (rand() * 8 | 0) * 16, 28, 16);
      }
    }, true);
  }

  // Street cloth: u runs along the street. Packed earth, twin cart ruts,
  // gutter lines; the Spanish and Dutch get cobbles.
  function streetTexture(style) {
    const rand = lcg('street-' + style);
    return canvasTex('street-' + style, 96, 96, (x) => {
      x.fillStyle = style === 'spanish' || style === 'dutch' ? '#a99875' : '#b5a47c';
      x.fillRect(0, 0, 96, 96);
      if (style === 'spanish' || style === 'dutch') {          // cobbles
        for (let j = 0; j < 96; j += 8) {
          for (let i = (j % 16 ? 0 : 5); i < 96; i += 10) {
            x.strokeStyle = 'rgba(80,66,46,0.5)';
            x.lineWidth = 1;
            x.beginPath();
            x.ellipse(i + 5, j + 4, 4.6, 3.4, 0, 0, Math.PI * 2);
            x.stroke();
          }
        }
      } else {                                                 // sand & gravel
        for (let i = 0; i < 240; i++) {
          x.fillStyle = 'rgba(90,74,50,' + (0.08 + rand() * 0.12) + ')';
          x.fillRect(rand() * 96, rand() * 96, 1.6, 1.6);
        }
      }
      // cart ruts run the length of the way
      x.strokeStyle = 'rgba(80,64,44,0.55)';
      x.lineWidth = 4;
      for (const ry of [34, 62]) {
        x.beginPath(); x.moveTo(0, ry); x.lineTo(96, ry); x.stroke();
      }
      x.strokeStyle = 'rgba(70,56,38,0.5)';                    // edge gutters
      x.lineWidth = 2;
      for (const gy of [3, 93]) {
        x.beginPath(); x.moveTo(0, gy); x.lineTo(96, gy); x.stroke();
      }
    }, true);
  }

  // Canopy ground seen from above. Near-white/neutral, carrying only relief
  // (light crowns, soft shadow pockets); the per-tile instanceColor supplies
  // the hue, so the ground never double-darkens — green in the heart of the
  // wood, paling to sand at the rim.
  function canopyTexture() {
    return canvasTex('canopy', 128, 128, (x) => {
      x.fillStyle = '#e7ead8';
      x.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 220; i++) {                          // overlapping crowns
        const v = 214 + ((Math.random() * 40) | 0);
        x.fillStyle = `rgba(${v},${v + 6},${v - 26},${0.4 + Math.random() * 0.4})`;
        const r = 6 + Math.random() * 12;
        x.beginPath();
        x.arc(Math.random() * 128, Math.random() * 128, r, 0, Math.PI * 2);
        x.fill();
      }
      for (let i = 0; i < 90; i++) {                           // soft shadow pockets
        x.fillStyle = 'rgba(120,128,92,0.26)';
        x.beginPath();
        x.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 5, 0, Math.PI * 2);
        x.fill();
      }
    }, true);
  }

  function plazaTexture(kind) {
    return canvasTex('plaza-' + kind, 128, 128, (x) => {
      x.fillStyle = kind === 'green' ? '#aab37e' : '#c3b893';
      x.fillRect(0, 0, 128, 128);
      const n = kind === 'green' ? 560 : 380;
      for (let i = 0; i < n; i++) {                            // worn grass stipple
        const g = Math.random();
        x.fillStyle = kind === 'green'
          ? (g < 0.7 ? 'rgba(96,112,58,0.35)' : 'rgba(150,150,100,0.3)')
          : (g < 0.55 ? 'rgba(120,124,80,0.3)' : 'rgba(96,80,54,0.22)');
        x.fillRect(Math.random() * 128, Math.random() * 128, 2, 1.4);
      }
      if (kind === 'green') {                                  // mowing strokes
        x.strokeStyle = 'rgba(110,124,66,0.25)';
        x.lineWidth = 1;
        for (let i = 0; i < 40; i++) {
          const px = Math.random() * 128, py = Math.random() * 128;
          x.beginPath(); x.moveTo(px, py); x.lineTo(px + 6, py + 2); x.stroke();
        }
      }
    }, true);
  }

  function plankTexture() {
    return canvasTex('plank', 96, 96, (x) => {
      x.fillStyle = '#a98e66';
      x.fillRect(0, 0, 96, 96);
      x.strokeStyle = 'rgba(60,45,28,0.55)';                   // planks athwart the pier
      x.lineWidth = 1.6;
      for (let i = 0; i < 96; i += 7) {
        x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 96); x.stroke();
      }
      for (let i = 0; i < 60; i++) {
        x.fillStyle = 'rgba(60,45,28,' + (0.06 + Math.random() * 0.1) + ')';
        x.fillRect((Math.random() * 14 | 0) * 7, Math.random() * 96, 6, 8);
      }
    }, true);
  }

  function hillTexture() {
    return canvasTex('hill', 512, 256, (x) => {
      x.fillStyle = '#cfc4a0';
      x.fillRect(0, 0, 512, 256);
      x.strokeStyle = 'rgba(70,55,34,0.38)';
      x.lineWidth = 1;
      for (let i = 0; i < 900; i++) {                          // hachures, after the engravers
        const px = Math.random() * 512, py = Math.random() * 256, l = 5 + Math.random() * 7;
        x.beginPath();
        x.moveTo(px, py);
        x.lineTo(px + l * 0.4, py + l);
        x.stroke();
      }
      const shade = x.createLinearGradient(0, 96, 0, 256);     // southern shadow
      shade.addColorStop(0, 'rgba(75,60,38,0)');
      shade.addColorStop(1, 'rgba(75,60,38,0.2)');
      x.fillStyle = shade;
      x.fillRect(0, 0, 512, 256);
      x.globalCompositeOperation = 'destination-in';           // skirt fades to nothing
      x.save();
      x.translate(256, 128);
      x.scale(1, 0.5);
      const g2 = x.createRadialGradient(0, 0, 0, 0, 0, 250);
      g2.addColorStop(0, 'rgba(0,0,0,0.94)');
      g2.addColorStop(0.55, 'rgba(0,0,0,0.84)');
      g2.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g2;
      x.fillRect(-256, -512, 512, 1024);
      x.restore();
    });
  }

  /* ---------- geometries ---------- */

  function roofFromTris(tris) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    const uv = [];
    for (const [px, py] of tris.map((v) => [v[0], v[1]])) uv.push(px + 0.5, py);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }
  function gableGeo() {
    const A = [-0.5, 0, 0.5], B = [0.5, 0, 0.5], C = [0.5, 1, 0], D = [-0.5, 1, 0];
    const E = [-0.5, 0, -0.5], F = [0.5, 0, -0.5];
    return roofFromTris([A, B, C, A, C, D, F, E, D, F, D, C, B, F, C, E, A, D]);
  }
  function hipGeo() {
    const A = [-0.5, 0, 0.5], B = [0.5, 0, 0.5], E = [-0.5, 0, -0.5], F = [0.5, 0, -0.5];
    const R1 = [-0.22, 1, 0], R2 = [0.22, 1, 0];
    return roofFromTris([
      A, B, R2, A, R2, R1,
      F, E, R1, F, R1, R2,
      B, F, R2,
      E, A, R1,
    ]);
  }

  // Battered rampart: a trapezoid prism, thick at the footing. Unit length
  // along x (scaled per wall), unit height in y, real meters across.
  function fortWallGeo() {
    const shape = new THREE.Shape();
    shape.moveTo(-1.9, 0);
    shape.lineTo(1.9, 0);
    shape.lineTo(1.25, 1);
    shape.lineTo(-1.25, 1);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    g.rotateY(Math.PI / 2);          // extrusion axis → x
    g.translate(-0.5, 0, 0);         // center the length
    return g;
  }

  // A ribbon along a polyline: u follows the length (one repeat ≈ uRep m),
  // v spans the width. Lies flat at the given height.
  // Resample a polyline through a centripetal Catmull-Rom spline so the way
  // reads as a real curving road, not a chain of long rectangles.
  function smoothPath(pts) {
    if (pts.length < 3) return pts;
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const v = pts.map(([x, y]) => new THREE.Vector3(x, 0, y));
    const curve = new THREE.CatmullRomCurve3(v, false, 'centripetal', 0.5);
    const samples = Math.max(pts.length, Math.min(220, Math.round(len / 5)));
    return curve.getPoints(samples).map((q) => [q.x, q.z]);
  }

  function ribbonGeo(pts0, width, y, uRep, curvy) {
    const pts = curvy ? smoothPath(pts0) : pts0;
    const n = pts.length;
    if (n < 2) return null;
    const pos = [], uv = [], idx = [], col = [];
    const hw = width / 2;
    // total run, so we can fade the road in/out from its ends (curvy ways only) —
    // real streets and trails do not stop at a hard square edge.
    let total = 0;
    for (let i = 1; i < n; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const fade = curvy ? Math.min(total * 0.28, 18) : 0;  // metres of taper at each end
    let run = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const pPrev = pts[Math.max(0, i - 1)], pNext = pts[Math.min(n - 1, i + 1)];
      let dx = pNext[0] - pPrev[0], dy = pNext[1] - pPrev[1];
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      if (i > 0) run += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      // distance from the nearer end → a smooth 0→1 fade factor
      let f = 1;
      if (fade > 0) {
        const dEnd = Math.min(run, total - run);
        const t = Math.min(1, Math.max(0, dEnd / fade));
        f = t * t * (3 - 2 * t);                          // smoothstep
      }
      // a little width variation gives the lane some character (curvy ways only),
      // and the ends pinch in as they fade so the road tapers to nothing
      const wob = curvy ? (0.9 + 0.16 * Math.sin(i * 0.5 + p[0] * 0.03)) : 1;
      const w = hw * wob * (curvy ? (0.35 + 0.65 * f) : 1);
      // local frame: x = east, z = -north
      pos.push(p[0] - dy * w, y, -(p[1] + dx * w));
      pos.push(p[0] + dy * w, y, -(p[1] - dx * w));
      uv.push(run / uRep, 0, run / uRep, 1);
      col.push(1, 1, 1, f, 1, 1, 1, f);                   // RGBA — alpha carries the fade
      if (i < n - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (curvy) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function insideRing(pts, px, py) {
    let isIn = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      if ((pts[i][1] > py) !== (pts[j][1] > py)
        && px < ((pts[j][0] - pts[i][0]) * (py - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) isIn = !isIn;
    }
    return isIn;
  }
  function distSeg(ax, ay, bx, by, px, py) {
    const dx = bx - ax, dy = by - ay;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2));
    return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
  }
  function distToLine(line, px, py) {
    let d = Infinity;
    for (let i = 0; i < line.length - 1; i++) {
      d = Math.min(d, distSeg(line[i][0], line[i][1], line[i + 1][0], line[i + 1][1], px, py));
    }
    return d;
  }

  // Rejection-sample n points inside a local-meter ring.
  function scatterIn(pts, n, cb) {
    let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
    for (const [px, py] of pts) {
      bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px);
      by0 = Math.min(by0, py); by1 = Math.max(by1, py);
    }
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 12) {
      const px = bx0 + Math.random() * (bx1 - bx0);
      const py = by0 + Math.random() * (by1 - by0);
      if (!insideRing(pts, px, py)) continue;
      cb(px, py);
      placed++;
    }
  }

  // A flat polygon floor in the local frame.
  function polyGeo(pts, y, uRep) {
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    const g = new THREE.ShapeGeometry(shape);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const ex = p.getX(i), ny = p.getY(i);
      uv.setXY(i, ex / uRep, ny / uRep);
      p.setXYZ(i, ex, y, -ny);       // lie flat: x east, z = -north
    }
    g.computeVertexNormals();
    return g;
  }

  /* ---------- the builder ---------- */

  return {
    // dev/test-only painter hook (parallax_occulusion.md Phase 1a); nothing in web/js reads it
    _paint: { lcg, facadeTexture, roofTexture, masonryTexture, streetTexture, texCache },
    build(S, fr) {
      frame = fr || null;       // metric (diorama) when provided, else legacy mercator
      const m = shipMats;
      /* the two material sets differ: harbor3d's symbolic set carries ink &
         port, the diorama's HD shipwright set (harborshiphd.js) does not —
         without these fallbacks the fort guns and crane stays render in
         three.js's default white materials in the diorama */
      const inkMat = m.ink || new THREE.LineBasicMaterial({ color: 0x3d2f1e, transparent: true, opacity: 0.55 });
      const ironGunMat = m.port || new THREE.MeshLambertMaterial({ color: 0x23211e });
      const group = new THREE.Group();
      const lod = [];
      const stats = { houses: 0, streets: S ? S.streets.length : 0, byGroup: {}, streets3d: 0, palms: 0, fortWalls: 0, wharves: 0, jetties: 0, landmarks: 0, promoted: 0, byType: {} };
      if (!S) return { group, lod, stats };

      const wallGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const roofGeos = { gable: gableGeo(), hip: hipGeo() };
      const stoneMat = new THREE.MeshLambertMaterial({ color: 0xaa9c80 });
      const masonMat = new THREE.MeshLambertMaterial({ color: 0xfff6e6, map: masonryTexture() });
      const woodMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
      const brickMat = new THREE.MeshLambertMaterial({ color: 0x7a4434 });

      // Close-zoom detail tier. The legacy map path (harbor3d) gates these by
      // zoom (z ≈ 14.7) and starts them hidden; the diorama is itself the
      // close view (eye-level, first person) and has no zoom gate, so there
      // the tier stays visible — everything in it is instanced and
      // frustum-culled, the far side of the island culls away on its own.
      const mark = (mesh) => { mesh.userData.lod = true; mesh.visible = !!frame; lod.push(mesh); return mesh; };

      /* Instanced meshes live under a per-harbour anchor group and carry
         small local matrices. Absolute mercator translations baked into a
         float32 instance buffer drown metres of precision on the GPU, and
         the town shimmers and crawls as the camera zooms. The inverse
         multiply below happens in JS, in double precision. */
      const anchors = {};
      function anchorAt(harbor, lngLat) {
        if (!anchors[harbor]) {
          const m0 = groundMatrix(lngLat, 0);
          const g = new THREE.Group();
          g.matrixAutoUpdate = false;
          g.matrix.copy(m0);
          group.add(g);
          anchors[harbor] = { group: g, inv: m0.clone().invert() };
        }
        return anchors[harbor];
      }
      /* ===== vegetation, gathered as the town builds =====
         Trees are NOT instanced here. They are emitted as a flat field of
         lightweight specs and handed to the level-of-detail tree system
         (harbortrees.js), which frustum-culls them and renders near trees as
         geometry, distant ones as billboards — so the country can carry an
         order of magnitude more of them. Grass stays town-anchored. */
      const grassSpec = [];
      const groundSpec = [];
      const treeField = [];
      const CANOPY_TINTS = [0x8a9a5e, 0x7e8e54, 0x96a56c, 0x889a60, 0xa0af77]
        .map((c) => new THREE.Color(c));
      const SAND_TINT = new THREE.Color(0xcabd96);   // the bare shore, for blending
      // a tree in the nation's latitude: palms for the Spanish Main,
      // broadleaf shade for the northern ports, Tortuga takes both
      function plantTree(harbor, style, ll, kindHint) {
        const sc = 0.7 + Math.random() * 0.6;
        let kind = kindHint;
        if (!kind) {
          kind = (style === 'spanish' || (style === 'french' && Math.random() < 0.5)) ? 'palm' : 'leaf';
        }
        treeField.push({ lngLat: ll, kind, scale: sc, tint: Math.random() });
      }

      // specs: [{ harbor, m, color? }] with m the absolute ground matrix.
      function addInst(geo, mat, specs, opts) {
        const byH = {};
        for (const s of specs) (byH[s.harbor] = byH[s.harbor] || []).push(s);
        for (const [h, list] of Object.entries(byH)) {
          const a = anchors[h];
          if (!a) continue;
          const im = new THREE.InstancedMesh(geo, mat, list.length);
          list.forEach((s, i) => {
            im.setMatrixAt(i, a.inv.clone().multiply(s.m));
            if (s.color) im.setColorAt(i, s.color);
          });
          if (opts && opts.lod) mark(im);
          a.group.add(im);
        }
      }

      /* pass-4 furnishings: market stalls about the plazas, street furniture
         (signposts, hitching posts, horse-troughs), tenders at the wharf
         heads, hearth smoke, bee skeps and second blossom hues in the yards.
         All hash-deterministic, instanced per harbour, close-zoom tier. */
      const dhash = (a, b, n) => {
        const s = Math.sin(a * 7919.33 + b * 6101.71 + n * 83.17) * 43758.5453;
        return s - Math.floor(s);
      };
      const stallAS = [], stallBS = [], tripodS = [];
      const troughS = [], signpostS = [], hitchS = [], skepS = [], smokeS = [];
      const yardShrub2S = [], yardFlower2S = [];

      /* ===== the ground: streets, plazas, canals ===== */

      const streetMats = {};
      for (const f of S.streets) {
        const cs = f.geometry.coordinates;
        if (!cs || cs.length < 2) continue;
        const style = HARBOR_STYLE[f.properties.harbor] || 'english';
        const { clon, clat, mx, pts } = ringMeters(cs);
        anchorAt(f.properties.harbor, [clon, clat]);
        // staggered heights: crossings at one shared height z-fight,
        // flickering as depth precision shifts with zoom
        const geo = ribbonGeo(pts, STREET_W[style], 0.1 + (stats.streets3d % 5) * 0.025, 9, !!frame);
        if (!geo) continue;
        if (!streetMats[style]) {
          // in the diorama the ribbon carries a per-vertex alpha that fades its
          // ends out (vertexColors RGBA); transparent + no depth-write so the
          // taper blends over the ground instead of cutting a hard edge
          streetMats[style] = frame
            ? new THREE.MeshLambertMaterial({ map: streetTexture(style), vertexColors: true, transparent: true, depthWrite: false })
            : new THREE.MeshLambertMaterial({ map: streetTexture(style) });
        }
        const mesh = new THREE.Mesh(geo, streetMats[style]);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(groundMatrix([clon, clat], 0));
        group.add(mesh);
        stats.streets3d++;
        if (pts.length > 2 && dhash(clon, clat, 71) < 0.22) {  // a stone horse-trough by the way
          const i = (pts.length / 2) | 0;
          const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
          const ex = bx - ax, ey = by - ay, el = Math.hypot(ex, ey) || 1;
          const off = (STREET_W[style] / 2 + 1.0) * (dhash(clon, clat, 72) < 0.5 ? 1 : -1);
          troughS.push({ harbor: f.properties.harbor,
            m: groundMatrix([clon + ((ax + bx) / 2 - ey / el * off) / mx,
              clat + ((ay + by) / 2 + ex / el * off) / M_PER_DEG_LAT], Math.atan2(ey, ex) / D2RAD) });
        }
      }

      const greenMat = new THREE.MeshLambertMaterial({ map: plazaTexture('green'), side: THREE.DoubleSide });
      const plazaMat = new THREE.MeshLambertMaterial({ map: plazaTexture('court'), side: THREE.DoubleSide });
      const wellPositions = [];
      for (const f of S.greens) {
        const ring = f.geometry.coordinates[0];
        if (!ring || ring.length < 4) continue;
        const harbor = f.properties.harbor;
        const style = HARBOR_STYLE[harbor] || 'english';
        const { clon, clat, mx, pts } = ringMeters(ring);
        const mesh = new THREE.Mesh(polyGeo(pts, 0.08, 11), greenMat);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(groundMatrix([clon, clat], 0));
        group.add(mesh);
        anchorAt(harbor, [clon, clat]);
        wellPositions.push({ harbor, ll: [clon, clat] });
        const toLL = (px, py) => [clon + px / mx, clat + py / M_PER_DEG_LAT];
        for (const [vx, vy] of pts.slice(0, -1)) {   // shade trees ring the common
          if (Math.random() < 0.3) continue;
          plantTree(harbor, style, toLL(vx * 0.82, vy * 0.82));
        }
        let area = 0;
        for (let i = 0; i < pts.length - 1; i++) area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
        area = Math.abs(area) / 2;
        scatterIn(pts, Math.min(60, Math.floor(area / 35)), (px, py) => {
          const sc = 0.6 + Math.random() * 0.8;
          grassSpec.push({
            harbor,
            m: groundMatrix(toLL(px, py), Math.random() * 360)
              .multiply(new THREE.Matrix4().makeScale(sc, sc, sc)),
          });
        });
        /* market day: 2-4 stalls about the well — awning stalls, basket
           stalls, the odd weighing tripod. Set out between the well at the
           centre and the shade trees at the rim (which stand at 0.82 of the
           ring), hash-placed so the same plaza always keeps its market. */
        if (area > 140) {
          const nSt = 2 + ((dhash(clon, clat, 1) * 2.6) | 0);
          for (let k = 0; k < nSt; k++) {
            const a = dhash(clon, clat, 2 + k) * Math.PI * 2 + k * 2.2;
            const r = 4 + dhash(clon, clat, 7 + k) * 3.5;       // clear of the well
            const px = Math.cos(a) * r, py = Math.sin(a) * r;
            if (!insideRing(pts, px / 0.68, py / 0.68)) continue;  // clear of the tree ring
            const spec = { harbor, m: groundMatrix(toLL(px, py), a / D2RAD + 90) };
            const v = dhash(clon, clat, 20 + k);
            (v < 0.45 ? stallAS : v < 0.8 ? stallBS : tripodS).push(spec);
          }
        }
      }
      if (wellPositions.length) {       // the town well at each plaza, close-zoom
        const lift = (s, y) => ({
          harbor: s.harbor,
          m: groundMatrix(s.ll, 0).multiply(new THREE.Matrix4().makeTranslation(0, y, 0)),
        });
        addInst(new THREE.CylinderGeometry(1.1, 1.2, 0.9, 8), masonMat,
          wellPositions.map((s) => lift(s, 0.45)), { lod: true });
        addInst(new THREE.CylinderGeometry(0.09, 0.09, 1.9, 5), woodMat,
          wellPositions.map((s) => lift(s, 1.4)), { lod: true });
        addInst(new THREE.ConeGeometry(1.5, 1.1, 6), woodMat,
          wellPositions.map((s) => lift(s, 2.6)), { lod: true });
      }

      const canalMat = new THREE.MeshLambertMaterial({ color: 0x5e7d78, transparent: true, opacity: 0.92 });
      const quaySpec = [];
      for (const f of S.canals) {
        const cs = f.geometry.coordinates;
        if (!cs || cs.length < 2) continue;
        const { clon, clat, pts } = ringMeters(cs);
        const geo = ribbonGeo(pts, 9, 0.04, 14);
        if (!geo) continue;
        const mesh = new THREE.Mesh(geo, canalMat);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(groundMatrix([clon, clat], 0));
        group.add(mesh);
        anchorAt(f.properties.harbor, [clon, clat]);
        const harbor = f.properties.harbor;
        const mx = M_PER_DEG_LAT * Math.cos(clat * D2RAD);
        for (let i = 0; i < pts.length - 1; i++) {     // stone quays both banks
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
          const ex = bx - ax, ey = by - ay;
          const len = Math.hypot(ex, ey);
          if (len < 3) continue;
          const ux = ex / len, uy = ey / len;
          for (const side of [-1, 1]) {
            const cxm = (ax + bx) / 2 - uy * side * 5.1, cym = (ay + by) / 2 + ux * side * 5.1;
            quaySpec.push({
              harbor,
              m: groundMatrix([clon + cxm / mx, clat + cym / M_PER_DEG_LAT], Math.atan2(ey, ex) / D2RAD)
                .multiply(localM(len, 0.9, 1.1, 0)),
            });
          }
        }
      }
      addInst(wallGeo, masonMat, quaySpec);

      /* ===== the wharves: planked decks on piles, with their cranes ===== */

      const plankMat = new THREE.MeshLambertMaterial({ map: plankTexture() });
      const pileSpec = [], bollardSpec = [], barrelSpec = [], crateSpec = [];
      const fishRackS = [], dinghyS = [];      // the working strand by each wharf root
      const sackS = [], anchorS = [], cartS = [], timberS = [];  // dockside inventory
      const jettyDeckS = [], skiffS = [], headGearS = [];        // the small jetties
      const mooringS = [];                     // rings and cleats at the pier heads
      const ropeCoilS = [], fenderS = [], careenS = []; // wharf polish; the careened hull ashore
      for (const f of S.wharves) {
        const cs = f.geometry.coordinates;
        if (!cs || cs.length < 2) continue;
        const { clon, clat, mx, pts } = ringMeters(cs);
        const geo = ribbonGeo(pts, 5, 0.7, 7);
        if (!geo) continue;
        const mesh = new THREE.Mesh(geo, plankMat);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(groundMatrix([clon, clat], 0));
        group.add(mesh);
        stats.wharves++;
        anchorAt(f.properties.harbor, [clon, clat]);
        const harbor = f.properties.harbor;
        const toLL = (px, py) => [clon + px / mx, clat + py / M_PER_DEG_LAT];
        const at = (ll, y, ang) => ({
          harbor,
          m: groundMatrix(ll, ang || 0).multiply(new THREE.Matrix4().makeTranslation(0, y, 0)),
        });
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
          const ex = bx - ax, ey = by - ay;
          const len = Math.hypot(ex, ey);
          const ux = ex / len, uy = ey / len;
          const nPiles = Math.max(1, Math.floor(len / 3.5));
          for (let k = 0; k <= nPiles; k++) {
            const t = k / nPiles;
            for (const side of [-1, 1]) {
              pileSpec.push(at(toLL(ax + ex * t - uy * side * 2.2, ay + ey * t + ux * side * 2.2), 0.4));
            }
          }
          for (let k = 0; k < Math.max(1, Math.floor(len / 8)); k++) {
            const t = (k + 0.5) / Math.max(1, Math.floor(len / 8));
            const bpx = ax + ex * t - uy * 2.1, bpy = ay + ey * t + ux * 2.1;
            bollardSpec.push(at(toLL(bpx, bpy), 1.0));
            if (dhash(bpx, bpy, 33) < 0.35) {  // a rope coil dropped over the bollard
              ropeCoilS.push(at(toLL(bpx, bpy), 1.12));
            }
            if (Math.random() < 0.6) {
              barrelSpec.push(at(toLL(ax + ex * t + uy * 1.2 + (Math.random() - 0.5) * 2,
                ay + ey * t - ux * 1.2 + (Math.random() - 0.5) * 2), 1.18));
            }
            if (Math.random() < 0.35) {
              crateSpec.push(at(toLL(ax + ex * t - uy * 0.5, ay + ey * t + ux * 0.5), 0.7, Math.random() * 90));
            }
          }
        }
        // the wharf crane stands at the pier head
        const head = pts[pts.length - 1];
        const prev = pts[pts.length - 2];
        const ang = Math.atan2(head[1] - prev[1], head[0] - prev[0]) / D2RAD;
        const crane = new THREE.Group();
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 6.5, 6), woodMat);
        post.position.y = 3.95;
        crane.add(post);
        const jib = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5.2, 5), woodMat);
        jib.rotation.z = -1.05;
        jib.position.set(2.2, 6.1, 0);
        crane.add(jib);
        const stay = new THREE.BufferGeometry().setAttribute('position',
          new THREE.Float32BufferAttribute([0, 7.2, 0, 4.3, 7.4, 0, 4.3, 7.4, 0, 4.3, 2.2, 0], 3));
        crane.add(new THREE.LineSegments(stay, inkMat));
        crane.matrixAutoUpdate = false;
        crane.matrix.copy(groundMatrix(toLL(head[0], head[1]), ang).multiply(localM(1, 1, 1, 0.7)));
        group.add(crane);
        // the strand at the wharf root: drying racks for the catch, and the
        // odd dinghy hauled out and turned turtle, oars beside it. Set back
        // along the wharf line (toward the shore) and off to one side.
        const root = pts[0], rnext = pts[1];
        const rang = Math.atan2(rnext[1] - root[1], rnext[0] - root[0]);
        const rux = Math.cos(rang), ruy = Math.sin(rang);
        if (Math.random() < 0.55) {
          fishRackS.push(at(toLL(root[0] - rux * 2 - ruy * 4.5, root[1] - ruy * 2 + rux * 4.5),
            0, rang / D2RAD + 90));
        }
        if (Math.random() < 0.4) {
          dinghyS.push(at(toLL(root[0] - rux * 3.5 + ruy * 4.5, root[1] - ruy * 3.5 - rux * 4.5),
            0, Math.random() * 360));
        }
        /* dockside inventory of the trade, deterministically hashed from the
           wharf position: hogsheads rolled out in a row, sack piles, an
           anchor laid out awaiting fitting, squared timber, a hand cart, a
           gangplank run down at the moored berth. */
        const wh = (n) => {
          const s = Math.sin(clon * 6311.9 + clat * 9277.1 + n * 53.71) * 43758.5453;
          return s - Math.floor(s);
        };
        let wlen = 0;
        const runs = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
          runs.push([wlen, l, i]);
          wlen += l;
        }
        const pAt = (d) => {                 // point + bearing at run-length d
          let r = runs[runs.length - 1];
          for (const cand of runs) if (d <= cand[0] + cand[1]) { r = cand; break; }
          const t = Math.min(1, Math.max(0, (d - r[0]) / (r[1] || 1)));
          const [ax, ay] = pts[r[2]], [bx, by] = pts[r[2] + 1];
          return [ax + (bx - ax) * t, ay + (by - ay) * t, Math.atan2(by - ay, bx - ax)];
        };
        const deckAt = (d, off, y, rotDeg, sc) => {
          const [px, py, ra] = pAt(d);
          return groundMatrix(toLL(px - Math.sin(ra) * off, py + Math.cos(ra) * off),
            ra / D2RAD + (rotDeg || 0))
            .multiply(new THREE.Matrix4().makeTranslation(0, y, 0))
            .multiply(new THREE.Matrix4().makeScale(sc || 1, sc || 1, sc || 1));
        };
        if (wlen > 12) {
          if (wh(0) < 0.6) {                 // hogsheads in a row, mid-wharf
            const d0 = wlen * (0.25 + wh(1) * 0.4);
            for (let k = 0; k < 3; k++) {
              barrelSpec.push({ harbor, m: deckAt(d0 + k * 1.3, 1.15, 1.32, 0, 1.25) });
            }
          }
          if (wh(27) < 0.7) {                // hogsheads landed at the crane's foot
            const nB = 2 + (wh(28) < 0.4 ? 1 : 0);
            for (let k = 0; k < nB; k++) {
              barrelSpec.push({ harbor,
                m: deckAt(Math.max(2, wlen - 1.4 - k * 1.2), -0.7 - wh(29 + k) * 0.8, 1.18, 0, 0.95 + wh(32 + k) * 0.25) });
            }
          }
          for (const fd of [0.35, 0.68]) {   // fender boards hung down the wharf face
            if (wh(34 + Math.round(fd * 10)) < 0.6) {
              fenderS.push({ harbor, m: deckAt(wlen * fd, 2.56, 0.38) });
            }
          }
          if (wh(2) < 0.5) {                 // sacks — the sugar and flour
            sackS.push({ harbor, m: deckAt(wlen * (0.5 + wh(3) * 0.35), -1.0, 0.7, wh(12) * 360) });
          }
          if (wh(4) < 0.28) {                // an anchor near the root
            anchorS.push({ harbor, m: deckAt(2.5 + wh(13) * 3, 0.8, 0.7, wh(14) * 360) });
          }
          if (wh(5) < 0.32) {                // the hand cart between loads
            cartS.push({ harbor, m: deckAt(wlen * (0.15 + wh(15) * 0.2), -0.9, 0.7, 160 + wh(16) * 40) });
          }
          if (wh(6) < 0.4) {                 // squared timber awaiting the carpenter
            timberS.push({ harbor,
              m: deckAt(wlen * (0.3 + wh(7) * 0.4), 1.2, 0.7)
                .multiply(new THREE.Matrix4().makeScale(2.4, 1.25, 1.3)) });
          }
          if (wh(8) < 0.55) {                // gangplank down to the moored boat
            crateSpec.push({ harbor,
              m: deckAt(Math.max(2, wlen - 2.5), 1.9, 0.72)
                .multiply(new THREE.Matrix4().makeRotationX(0.5))
                .multiply(localM(0.8, 0.07, 3.6, 0)) });
          }
          for (const side of [-1, 1]) {      // mooring rings bolted at the pier head
            mooringS.push({ harbor, m: deckAt(Math.max(1, wlen - 0.7), side * 1.9, 0.74, side * 90) });
          }
          if (wh(23) < 0.55) {               // lobster pots stacked out at the head
            headGearS.push({ harbor, m: deckAt(Math.max(2, wlen - 1.8), -1.2, 0.72, wh(24) * 360) });
            if (wh(25) < 0.5) {
              headGearS.push({ harbor, m: deckAt(Math.max(2.5, wlen - 3.1), 1.1, 0.72, wh(26) * 360) });
            }
          }
        }
        if (wh(20) < 0.5) {                  // a rowing tender rides off the head,
          const hl = Math.hypot(head[0] - prev[0], head[1] - prev[1]) || 1;
          const hx = (head[0] - prev[0]) / hl, hy = (head[1] - prev[1]) / hl;
          const side = wh(21) < 0.5 ? -1 : 1; // tying the anchored fleet to shore
          const g2 = groundMatrix(toLL(head[0] + hx * 3.0 - hy * side * 1.8,
            head[1] + hy * 3.0 + hx * side * 1.8), ang + (wh(22) - 0.5) * 60);
          if (frame) g2.elements[13] = 0;     // afloat at sea level
          skiffS.push({ harbor, m: g2 });
        }
      }

      /* ===== small jetties: the working shore between the wharves =====
         Where the town fronts the water and no surveyed wharf serves, a
         humble plank jetty runs out over the shallows — paired piles, a
         slightly uneven two-run deck, mooring posts, a skiff tied alongside,
         crab pots and a rope coil at the head. Deterministically hashed from
         the shore position, thinned to one per ~80–150 m of built-up
         shoreline; when the terrain frame is reachable the head must reach
         water and the root must hold the shore. */
      const jh = (a, b, n) => {
        const s = Math.sin(a * 8191.7 + b * 5407.3 + n * 97.13) * 43758.5453;
        return s - Math.floor(s);
      };
      const careenDone = {};   // at most one careened hull per harbour
      for (const f of S.lands) {
        const harbor = f.properties.harbor;
        const streetsLL = S.streets.filter((st) => st.properties.harbor === harbor);
        if (!streetsLL.length) continue;
        const wharfRootsLL = S.wharves.filter((w) => w.properties.harbor === harbor)
          .map((w) => w.geometry.coordinates[0]);
        const rings = f.geometry.type === 'MultiPolygon'
          ? f.geometry.coordinates.map((p) => p[0]) : [f.geometry.coordinates[0]];
        for (const ring of rings) {
          if (!ring || ring.length < 4) continue;
          const { clon, clat, mx, pts } = ringMeters(ring);
          const toL = ([x, y]) => [(x - clon) * mx, (y - clat) * M_PER_DEG_LAT];
          const toLL = (px, py) => [clon + px / mx, clat + py / M_PER_DEG_LAT];
          const streetsL = streetsLL.map((st) => st.geometry.coordinates.map(toL));
          const wharfL = wharfRootsLL.map(toL);
          anchorAt(harbor, [clon, clat]);
          // pinned to sea level: the deck rides just above high water,
          // whatever the shore terrain does under its root
          const seaAt = (px, py, ang, y) => {
            const g2 = groundMatrix(toLL(px, py), ang || 0);
            if (frame) g2.elements[13] = 0;
            return g2.multiply(new THREE.Matrix4().makeTranslation(0, y || 0, 0));
          };
          let walk = 0;
          let nextAt = 40 + jh(clon, clat, 0) * 90;
          let lastJetty = 0;        // run-length of the last jetty accepted
          for (let i = 0; i < pts.length - 1; i++) {
            const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
            const segLen = Math.hypot(bx - ax, by - ay);
            if (segLen < 0.01) continue;
            while (nextAt <= walk + segLen) {
              const t = (nextAt - walk) / segLen;
              const sx = ax + (bx - ax) * t, sy = ay + (by - ay) * t;
              const dHere = nextAt;
              nextAt += 80 + jh(sx, sy, 1) * 70;
              // a built-up stretch left unserved too long relaxes the gates,
              // so no waterfront frontage runs >200 m without wharf or jetty
              const starved = dHere - lastJetty > 200;
              // only where the town fronts the water
              let near = Infinity;
              for (const st of streetsL) near = Math.min(near, distToLine(st, sx, sy));
              if (near > (starved ? 100 : 70)) continue;
              // the surveyed wharves keep their own ground
              let wd = Infinity;
              for (const [wx, wy] of wharfL) wd = Math.min(wd, Math.hypot(wx - sx, wy - sy));
              if (wd < (starved ? 28 : 45)) continue;
              // outward: the water lies outside the land ring
              let nx = (by - ay) / segLen, ny = -(bx - ax) / segLen;
              if (insideRing(pts, sx + nx * 8, sy + ny * 8)) { nx = -nx; ny = -ny; }
              const L = 8 + jh(sx, sy, 2) * 12;
              if (frame && frame.heightAt) {   // confirm against the real terrain
                const hd = toLL(sx + nx * L, sy + ny * L);
                const ph = frame.project(hd[0], hd[1]);
                if (frame.heightAt(ph.x, ph.z) > 0.05) continue;   // head must reach water
                const rt = toLL(sx - nx * 2, sy - ny * 2);
                const pr = frame.project(rt[0], rt[1]);
                if (frame.heightAt(pr.x, pr.z) < -0.1) continue;   // root must hold the shore
              }
              const ang = Math.atan2(ny, nx) / D2RAD;
              /* the shoreline work scene: where a jetty might have stood, a
                 hull is instead careened on her side for repair — propped by
                 timber shores, the carpenter's sawhorse and plank beside her.
                 Roughly one harbour in 2-3 keeps such a scene. */
              if (!careenDone[harbor] && dhash(clon, clat, 131) < 0.4 && jh(sx, sy, 30) < 0.35) {
                careenS.push({ harbor,
                  m: groundMatrix(toLL(sx - nx * 3.4, sy - ny * 3.4),
                    ang + 90 + (jh(sx, sy, 31) - 0.5) * 30) });
                careenDone[harbor] = true;
                lastJetty = dHere;
                continue;
              }
              const deckY = 0.65 + jh(sx, sy, 3) * 0.25;           // just above high water
              const Lmid = L * (0.4 + jh(sx, sy, 4) * 0.2);
              const deckRuns = [[-2, Lmid], [Lmid, L]];
              if (jh(sx, sy, 12) < 0.3) {    // an aged deck: a plank run lost mid-span
                const g0 = Lmid + (L - Lmid) * (0.3 + jh(sx, sy, 13) * 0.3);
                deckRuns[1] = [Lmid, g0];
                deckRuns.push([g0 + 0.9, L]);
              }
              deckRuns.forEach(([d0, d1], si) => {                 // uneven runs, root ashore
                const mid = (d0 + d1) / 2;
                jettyDeckS.push({ harbor,
                  m: seaAt(sx + nx * mid, sy + ny * mid, ang,
                    deckY + (jh(sx, sy, 5 + si) - 0.5) * 0.12)
                    .multiply(localM(d1 - d0, 0.12, 1.8, 0)) });
              });
              for (let d = 0; d <= L; d += 2.8) {                  // paired piles, heads proud
                for (const side of [-1, 1]) {
                  pileSpec.push({ harbor,
                    m: seaAt(sx + nx * d - ny * side * 0.7, sy + ny * d + nx * side * 0.7, 0, deckY - 0.55) });
                }
              }
              for (let k = 0; k < 3; k++) {                        // mooring posts down one side
                const d = L * (0.25 + k * 0.3);
                bollardSpec.push({ harbor,
                  m: seaAt(sx + nx * d - ny * 0.75, sy + ny * d + nx * 0.75, 0, deckY + 0.4) });
              }
              pileSpec.push({ harbor,                              // a taller pile off the head
                m: seaAt(sx + nx * (L + 0.9), sy + ny * (L + 0.9), 0, deckY + 0.5) });
              if (jh(sx, sy, 6) < 0.5) {                           // a skiff tied alongside
                const d = L * (0.4 + jh(sx, sy, 7) * 0.35);
                const side = jh(sx, sy, 8) < 0.5 ? -1 : 1;
                skiffS.push({ harbor,
                  m: seaAt(sx + nx * d - ny * side * 2.1, sy + ny * d + nx * side * 2.1,
                    ang + (jh(sx, sy, 9) - 0.5) * 24, 0) });
              }
              if (jh(sx, sy, 10) < 0.55) {                         // crab pots & rope at the head
                headGearS.push({ harbor,
                  m: seaAt(sx + nx * (L - 1.3), sy + ny * (L - 1.3), jh(sx, sy, 11) * 360, deckY + 0.12) });
              }
              mooringS.push({ harbor,        // a cleat at the head for the skiff's line
                m: seaAt(sx + nx * (L - 0.5), sy + ny * (L - 0.5), jh(sx, sy, 14) * 360, deckY + 0.12) });
              lastJetty = dHere;
              stats.jetties++;
            }
            walk += segLen;
          }
        }
      }
      addInst(new THREE.CylinderGeometry(0.22, 0.26, 1.6, 5), woodMat, pileSpec);
      addInst(new THREE.CylinderGeometry(0.14, 0.17, 0.6, 5), m.wale, bollardSpec, { lod: true });
      addInst(new THREE.CylinderGeometry(0.5, 0.42, 0.95, 8), woodMat, barrelSpec, { lod: true });
      addInst(wallGeo, plankMat, crateSpec, { lod: true });
      addInst(wallGeo, plankMat, jettyDeckS);   // jetty decks stay at every distance

      /* ===== the houses, in the nation's manner ===== */

      // the shared metric frame, used by candidates, shores and streets alike
      const llM = (lng, lat) => [lng * M_PER_DEG_LAT * Math.cos(lat * D2RAD), lat * M_PER_DEG_LAT];

      // shoreline polylines per harbour, in the same shared metric frame —
      // for telling the shore-front houses (they hang their nets to dry)
      const shoreL = {};
      for (const f of S.lands) {
        const rings = f.geometry.type === 'MultiPolygon'
          ? f.geometry.coordinates.map((p) => p[0]) : [f.geometry.coordinates[0]];
        const arr = (shoreL[f.properties.harbor] = shoreL[f.properties.harbor] || []);
        for (const ring of rings) if (ring && ring.length >= 4) arr.push(ring.map(([x, y]) => llM(x, y)));
      }
      const nearShore = (h) => {
        const ss = shoreL[h.harbor];
        if (!ss) return false;
        const [px, py] = llM(h.lngLat[0], h.lngLat[1]);
        for (const ln of ss) if (distToLine(ln, px, py) < 45) return true;
        return false;
      };

      /* the landmarks claim their ground: no row-house candidate stands
         within 14 m of a surviving 1730 point, so slipways and garden
         courts keep clear. Same year filter as the landmark pass below. */
      const landmarkPts = {};
      for (const p of S.points) {
        if ((p.year_built || 0) > 1730) continue;
        if ((p.year_destroyed == null ? Infinity : p.year_destroyed) <= 1730) continue;
        (landmarkPts[p.harbor] = landmarkPts[p.harbor] || []).push(llM(p.lngLat[0], p.lngLat[1]));
      }
      const nearLandmark = (harbor, lon, lat) => {
        const list = landmarkPts[harbor];
        if (!list) return false;
        const [px, py] = llM(lon, lat);
        for (const [qx, qy] of list) {
          if ((px - qx) * (px - qx) + (py - qy) * (py - qy) < 196) return true;
        }
        return false;
      };

      // where does the house stand? by the water, on the square, or back
      // in the lanes — the trades sort themselves accordingly
      function classifyHouse(harbor, lon, lat) {
        const [px, py] = llM(lon, lat);
        const ss = shoreL[harbor];
        if (ss) for (const ln of ss) if (distToLine(ln, px, py) < 45) return 'waterfront';
        for (const wp of wellPositions) {
          if (wp.harbor !== harbor) continue;
          const [qx, qy] = llM(wp.ll[0], wp.ll[1]);
          if ((px - qx) * (px - qx) + (py - qy) * (py - qy) < 3025) return 'plaza';
        }
        return 'back';
      }

      /* per-port promotion weights: a row-house may be raised to a trade
         by location class. Vice ports run hot (~20-25% of frontage),
         trade ports cooler (~10-15%), Tortuga tiny but tavern-heavy. */
      /* the tavern leads everywhere a sailor drinks: back lanes carry a
         tavern weight too (Port Royal's "one house in four a bar"), with
         brothel/gambling trimmed below it; class sums are unchanged, so
         each port's overall trade fraction stays where it was. Tavern is
         listed first in every table so the hash walk favours it. */
      const PORT_PROMO = {
        'nassau': { waterfront: { tavern: 0.10, provisioner: 0.04, smithy: 0.03, counting: 0.02 },
          plaza: { tavern: 0.08, counting: 0.04, smithy: 0.03 },
          back: { tavern: 0.07, boarding: 0.05, brothel: 0.03, gambling: 0.03 } },
        'port-royal': { waterfront: { tavern: 0.10, provisioner: 0.05, smithy: 0.03, counting: 0.04 },
          plaza: { tavern: 0.08, counting: 0.05, gambling: 0.03 },
          back: { tavern: 0.08, boarding: 0.05, brothel: 0.04, gambling: 0.03 } },
        'tortuga': { waterfront: { tavern: 0.12, smithy: 0.02 },
          plaza: { tavern: 0.10 },
          back: { tavern: 0.05, boarding: 0.03, brothel: 0.01 } },
        'batavia': { waterfront: { provisioner: 0.08, counting: 0.04, tavern: 0.03, smithy: 0.02 },
          plaza: { counting: 0.05, tavern: 0.03 },
          back: { tavern: 0.025, boarding: 0.025, gambling: 0.01 } },
        'bridgetown': { waterfront: { provisioner: 0.06, tavern: 0.04, counting: 0.03, smithy: 0.02 },
          plaza: { tavern: 0.04, counting: 0.03 },
          back: { tavern: 0.025, boarding: 0.025, brothel: 0.01 } },
        'cartagena': { waterfront: { provisioner: 0.05, tavern: 0.03, counting: 0.03, smithy: 0.02 },
          plaza: { counting: 0.04, tavern: 0.03 },
          back: { tavern: 0.02, boarding: 0.02 } },
        'charleston': { waterfront: { provisioner: 0.06, counting: 0.04, tavern: 0.04, smithy: 0.02 },
          plaza: { tavern: 0.03, counting: 0.03 },
          back: { tavern: 0.02, boarding: 0.02 } },
        'havana': { waterfront: { provisioner: 0.06, tavern: 0.05, counting: 0.03, smithy: 0.03 },
          plaza: { tavern: 0.04, counting: 0.04 },
          back: { tavern: 0.035, boarding: 0.03, gambling: 0.015, brothel: 0.01 } },
      };
      const TYPE_SIGN = { tavern: 1, brothel: 1, gambling: 1, counting: 1 };
      const typeStories = (type, style) => {
        if (type === 'smithy') return 1;
        if (type === 'boarding') return (style === 'english' || style === 'dutch') ? 3 : 2;
        return 2;   // tavern, brothel, gambling, counting, provisioner
      };

      function pickStories(style, harbor) {
        if (style === 'english') {
          let s = 1 + (Math.random() < 0.55 ? 1 : 0) + (Math.random() < 0.22 ? 1 : 0);
          if (harbor === 'port-royal' && Math.random() < 0.45) s++;
          return Math.min(4, s);
        }
        if (style === 'dutch') return 2 + (Math.random() < 0.5 ? 1 : 0);
        if (style === 'spanish') return 1 + (Math.random() < 0.4 ? 1 : 0);
        return 1 + (Math.random() < 0.3 ? 1 : 0);
      }

      const groups = {};
      const chimneys = [], balconies = [];
      const perHarbor = {};
      const classTot = {}, classPromo = {};   // promotion bookkeeping per harbor|class
      let total = 0;

      function pushHouse(style, harbor, lon, lat, ang, w, d) {
        perHarbor[harbor] = (perHarbor[harbor] || 0) + 1;
        if (perHarbor[harbor] > 520) return;
        /* promotion: a positional hash walks the port's weight table for
           the house's location class — the same house is always the same
           trade. Empty string means an ordinary dwelling. */
        let type = '';
        const promo = PORT_PROMO[harbor];
        if (promo) {
          const cls = classifyHouse(harbor, lon, lat);
          const tw = promo[cls];
          if (tw) {
            const ck = harbor + '|' + cls;
            classTot[ck] = (classTot[ck] || 0) + 1;
            const r = dhash(lon, lat, 201);
            let acc = 0;
            for (const t in tw) { acc += tw[t]; if (r < acc) { type = t; break; } }
            // defensive cap: no street class runs past 35% trades (vs weight typos)
            if (type && (classPromo[ck] || 0) + 1 > Math.ceil(classTot[ck] * 0.35)) type = '';
            if (type) classPromo[ck] = (classPromo[ck] || 0) + 1;
          }
        }
        const stories = type ? typeStories(type, style) : pickStories(style, harbor);
        anchorAt(harbor, [lon, lat]);
        const h = {
          harbor,
          lngLat: [lon, lat],
          ang,
          w: Math.max(3.8, w * 1.08),
          hw: 0.6 + stories * 3.0,
          d: d * 1.08,
          hr: style === 'spanish' ? 1.3 + Math.random() * 0.5
            : style === 'dutch' ? 3.2 + Math.random() * 1
            : 2.4 + Math.random() * 0.8,
          tint: (Math.random() * 3) | 0,
          stories,
          type,
          dormer: (style === 'english' || style === 'dutch') && stories >= 2 && Math.random() < 0.45,
          stoop: Math.random() < 0.6,
          sign: type ? !!TYPE_SIGN[type]
            : style === 'english' && stories >= 2 && Math.random() < 0.1,
        };
        const key = style + '|' + stories + (type ? '|' + type : '');
        (groups[key] = groups[key] || []).push(h);
        total++;
        if (type === 'smithy' || type === 'tavern') {
          // the forge and the taproom hearth never go cold
          chimneys.push({ h, end: dhash(lon, lat, 202) < 0.5 ? -1 : 1, lit: true });
        } else if ((style === 'english' && Math.random() < 0.6) || (style === 'french' && Math.random() < 0.35)) {
          chimneys.push({ h, end: Math.random() < 0.5 ? -1 : 1 });
        }
        if (harbor === 'cartagena' && stories >= 2 && Math.random() < 0.55) {
          balconies.push(h);
        }
        if (type) {
          stats.promoted++;
          stats.byType[type] = (stats.byType[type] || 0) + 1;
        }
      }

      /* Havana and Cartagena are surveyed as street grids without block
         polygons — there the houses front the streets themselves. They
         build first, so the block harbours cannot exhaust the budget. */
      const blocked = new Set(S.blocks.map((f) => f.properties.harbor));
      const streetCand = {};       // harbor → candidate house specs
      for (const f of S.streets) {
        const harbor = f.properties.harbor;
        if (blocked.has(harbor)) continue;
        const style = HARBOR_STYLE[harbor] || 'spanish';
        const wBase = style === 'spanish' ? 8 : 7;
        const cs = f.geometry.coordinates;
        if (!cs || cs.length < 2) continue;
        const { clon, clat, mx, pts } = ringMeters(cs);
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
          const ex = bx - ax, ey = by - ay;
          const len = Math.hypot(ex, ey);
          if (len < 9) continue;
          const ux = ex / len, uy = ey / len;
          const n = Math.max(1, Math.floor(len / (wBase + 3)));
          for (const side of [-1, 1]) {
            for (let k = 0; k < n; k++) {
              const t = (k + 0.5) / n;
              const d = 6 + Math.random() * 2;
              const off = side * (d / 2 + 3.6);
              const px = ax + ex * t - uy * off;
              const py = ay + ey * t + ux * off;
              if (Math.random() < 0.22) {     // a gap in the frontage — a tree, perhaps
                if (Math.random() < 0.45) plantTree(harbor, style, [clon + px / mx, clat + py / M_PER_DEG_LAT]);
                continue;
              }
              const cLon = clon + px / mx, cLat = clat + py / M_PER_DEG_LAT;
              if (nearLandmark(harbor, cLon, cLat)) continue;   // the landmark keeps its ground
              (streetCand[harbor] = streetCand[harbor] || []).push([
                style, harbor, cLon, cLat,
                Math.atan2(ey, ex) / D2RAD, wBase - 1 + Math.random() * 2.4, d,
              ]);
            }
          }
        }
      }
      // An even hand with the budget: stride-sample the candidates so every
      // street gets its share, rather than the first streets taking all.
      for (const cand of Object.values(streetCand)) {
        const step = Math.max(1, cand.length / 520);
        for (let i = 0; i < cand.length && total <= 4000; i += step) {
          pushHouse(...cand[Math.floor(i)]);
        }
      }

      // Street segments per harbour, in a common metric frame, so block-infill
      // houses can face the nearest road (else clusters ignore the streetlines).
      const streetSegs = {};
      const streetLines = [];      // per street, lon/lat + metric, for the signposts
      for (const f of S.streets) {
        const cs = f.geometry.coordinates;
        if (!cs || cs.length < 2) continue;
        const arr = (streetSegs[f.properties.harbor] = streetSegs[f.properties.harbor] || []);
        streetLines.push({ harbor: f.properties.harbor, cs, line: cs.map(([x, y]) => llM(x, y)) });
        for (let i = 0; i < cs.length - 1; i++) {
          const [x1, y1] = llM(cs[i][0], cs[i][1]), [x2, y2] = llM(cs[i + 1][0], cs[i + 1][1]);
          arr.push([x1, y1, x2, y2, Math.atan2(y2 - y1, x2 - x1) / D2RAD]);
        }
      }
      function nearestStreetAngle(harbor, lng, lat, fallback) {
        const segs = streetSegs[harbor];
        if (!segs || !segs.length) return fallback;
        const [px, py] = llM(lng, lat);
        let best = Infinity, ang = fallback;
        for (const s of segs) {
          const dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy || 1;
          let t = ((px - s[0]) * dx + (py - s[1]) * dy) / l2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const cx = s[0] + t * dx, cy = s[1] + t * dy;
          const d = (px - cx) * (px - cx) + (py - cy) * (py - cy);
          if (d < best) { best = d; ang = s[4]; }
        }
        return ang;
      }

      /* signposts where the ways cross: a street's end lying on another
         street is a junction; every n-th (hashed) gets a post with one or
         two angled boards, set back to the roadside, deduped within 16 m. */
      const signPlaced = {};
      streetLines.forEach((st, si) => {
        for (const ei of [0, st.cs.length - 1]) {
          const [lng, lat] = st.cs[ei];
          const [px, py] = llM(lng, lat);
          let crossing = false;
          for (let sj = 0; sj < streetLines.length && !crossing; sj++) {
            if (sj === si || streetLines[sj].harbor !== st.harbor) continue;
            if (distToLine(streetLines[sj].line, px, py) < 7) crossing = true;
          }
          if (!crossing || dhash(lng, lat, 61) > 0.4) continue;
          const list = (signPlaced[st.harbor] = signPlaced[st.harbor] || []);
          let dup = false;
          for (const [qx, qy] of list) if (Math.hypot(qx - px, qy - py) < 16) { dup = true; break; }
          if (dup) continue;
          list.push([px, py]);
          const ang = nearestStreetAngle(st.harbor, lng, lat, 0);
          const aR = ang * D2RAD;
          const off = (STREET_W[HARBOR_STYLE[st.harbor] || 'english'] / 2 + 1.1)
            * (dhash(lng, lat, 62) < 0.5 ? 1 : -1);
          const mxL = M_PER_DEG_LAT * Math.cos(lat * D2RAD);
          signpostS.push({ harbor: st.harbor,
            m: groundMatrix([lng - Math.sin(aR) * off / mxL,
              lat + Math.cos(aR) * off / M_PER_DEG_LAT], ang + dhash(lng, lat, 63) * 40 - 20) });
        }
      });

      for (const f of S.blocks) {
        const ring = f.geometry.coordinates[0];
        if (!ring || ring.length < 4 || total > 4000) continue;
        const style = HARBOR_STYLE[f.properties.harbor] || 'english';
        const wBase = style === 'dutch' ? 5 : style === 'spanish' ? 8 : 7;
        const { clon, clat, mx, pts } = ringMeters(ring);
        for (let i = 0; i < pts.length - 1; i++) {
          const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
          const ex = bx - ax, ey = by - ay;
          const len = Math.hypot(ex, ey);
          if (len < 7) continue;
          const midx = (ax + bx) / 2, midy = (ay + by) / 2;
          const inL = Math.hypot(midx, midy) || 1;
          const inx = -midx / inL, iny = -midy / inL;
          const n = Math.max(1, Math.floor(len / (wBase + 3.5)));
          for (let k = 0; k < n; k++) {
            const t = (k + 0.5) / n;
            const d = (style === 'dutch' ? 7 : 5.2) + Math.random() * 2;
            const px = ax + ex * t + inx * (d / 2 + 0.6);
            const py = ay + ey * t + iny * (d / 2 + 0.6);
            if (Math.random() < 0.15) {       // a yard, a garden, a gap
              if (Math.random() < 0.45) {
                plantTree(f.properties.harbor, style,
                  [clon + px / mx, clat + py / M_PER_DEG_LAT]);
              }
              continue;
            }
            const cLon = clon + px / mx, cLat = clat + py / M_PER_DEG_LAT;
            if (nearLandmark(f.properties.harbor, cLon, cLat)) continue;
            pushHouse(style, f.properties.harbor,
              cLon, cLat, Math.atan2(ey, ex) / D2RAD,
              Math.min(wBase - 0.5 + Math.random() * 2.6, len / n - 1.2), d);
          }
        }
        // the blocks were packed, not hollow: infill behind the frontages
        let area = 0, mainAng = 0, longest = 0;
        let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
          area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
          const el = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
          if (el > longest) { longest = el; mainAng = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]) / D2RAD; }
          bx0 = Math.min(bx0, pts[i][0]); bx1 = Math.max(bx1, pts[i][0]);
          by0 = Math.min(by0, pts[i][1]); by1 = Math.max(by1, pts[i][1]);
        }
        area = Math.abs(area) / 2;
        const inside = (px, py) => {
          let isIn = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            if ((pts[i][1] > py) !== (pts[j][1] > py)
              && px < ((pts[j][0] - pts[i][0]) * (py - pts[i][1])) / (pts[j][1] - pts[i][1]) + pts[i][0]) isIn = !isIn;
          }
          return isIn;
        };
        const nIn = Math.min(20, Math.floor(area / 320));
        let placed = 0, tries = 0;
        while (placed < nIn && tries++ < nIn * 14) {
          const px = bx0 + 4 + Math.random() * (bx1 - bx0 - 8);
          const py = by0 + 4 + Math.random() * (by1 - by0 - 8);
          if (!inside(px, py)) continue;
          if (Math.random() < 0.22) {         // a garden court within the block
            plantTree(f.properties.harbor, style,
              [clon + px / mx, clat + py / M_PER_DEG_LAT]);
          } else {
            const lng = clon + px / mx, lat = clat + py / M_PER_DEG_LAT;
            if (nearLandmark(f.properties.harbor, lng, lat)) { placed++; continue; }
            // face the nearest street, so the block reads as fronting its roads
            const ang = nearestStreetAngle(f.properties.harbor, lng, lat, mainAng) + (Math.random() - 0.5) * 6;
            pushHouse(style, f.properties.harbor, lng, lat, ang,
              wBase - 1 + Math.random() * 2.4, 5 + Math.random() * 2);
          }
          placed++;
        }
      }

      const dormerWallS = [], dormerRoofS = [], stoopS = [], signArmS = [], signPlateS = [];
      // the promoted trades: painted signboards per type, and their props
      const typedPlateS = {};                  // type → plate specs (own painted material)
      const lanternS = [], forgeYardS = [], hoistSackS = [], strongboxS = [];
      const LANTERN_WHITE = new THREE.Color(0xffffff), LANTERN_RED = new THREE.Color(0xc04038);
      /* roofs and plinths keep batching by style|stories alone — the type
         only changes the facade map — so the trades add no roof draws */
      const roofAcc = {}, plinthAcc = {};
      // yard clutter about the houses, close-zoom tier (one instanced draw
      // per kind per harbour): flowering shrubs, kitchen gardens, firewood,
      // benches, rain barrels, leaning planks, rock piles, ground litter
      const yardShrubS = [], yardGardenS = [], yardWoodS = [], yardBenchS = [];
      const yardPlankS = [], yardScrapS = [], yardBarrelS = [];
      const yardFlowerS = [], tavernS = [];    // window boxes; tables by tavern doors
      const clothesS = [], netS = [];          // washing lines; nets drying on shore walls
      const leanToS = [], privyS = [], shingleS = [], boundaryS = [];  // mid-size filler
      const fenceBrokenS = [], brambleS = [];                          // wear & neglect
      const middenS = [], brokenBarrelS = [], wheelS = [], shardS = []; // trash, kept rare
      const doorWoodS = [], bootScrapeS = [], shutterS = [], fruitTreeS = []; // street life; walled-yard green
      const WHITEWASH = new THREE.Color(0xf2ead8);
      for (const [key, list] of Object.entries(groups)) {
        const keyParts = key.split('|');
        const style = keyParts[0], storiesStr = keyParts[1], type = keyParts[2] || '';
        const stories = +storiesStr;
        const wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: facadeTexture(style, stories, type) });
        const wallTints = WALL_TINTS[style].map((c) => new THREE.Color(c));
        const roofTints = ROOF_TINTS[style].map((c) => new THREE.Color(c));
        // facade window centres in texture px (192 wide), outermost casements —
        // for hanging propped-open shutters on the prosperous houses. The
        // French facade paints its own; the Spanish upper rows carry rejas.
        const winSlots = { english: [36, 156], dutch: [29, 161] }[style];
        const baseKey = style + '|' + stories;
        const wallS = [];
        const plinthS = (plinthAcc[baseKey] = plinthAcc[baseKey] || []);
        const roofS = (roofAcc[baseKey] = roofAcc[baseKey] || []);
        for (const h of list) {
          const g = groundMatrix(h.lngLat, h.ang);
          /* prosperity, hashed from the house position: the tidy house wears
             fresh whitewash, the poor one darker weather-peeled walls and a
             rougher yard — the patchiness that makes a street read real. */
          const yr = (n) => {
            const s = Math.sin(h.lngLat[0] * 9173.51 + h.lngLat[1] * 7841.33 + n * 74.77) * 43758.5453;
            return s - Math.floor(s);
          };
          let pros = yr(60);
          if (h.type === 'counting') pros = Math.max(pros, 0.75);          // money keeps the whitewash fresh
          else if (h.type === 'boarding' || h.type === 'brothel') pros = Math.min(pros, 0.3);
          let wallC = wallTints[h.tint], roofC = roofTints[h.tint];
          if (pros > 0.72) wallC = wallC.clone().lerp(WHITEWASH, 0.45);
          else if (pros < 0.22) {
            wallC = wallC.clone().multiplyScalar(0.72 + pros);
            roofC = roofC.clone().multiplyScalar(0.85);
          }
          wallS.push({ harbor: h.harbor, m: g.clone().multiply(localM(h.w, h.hw, h.d, 0)), color: wallC });
          plinthS.push({ harbor: h.harbor, m: g.clone().multiply(localM(h.w + 0.4, 0.55, h.d + 0.4, 0)) });
          // the deep miniature overhang: roofs sit proud of their walls
          roofS.push({ harbor: h.harbor, m: g.clone().multiply(localM(h.w + 1.0, h.hr, h.d + 1.1, h.hw)), color: roofC });
          if (h.dormer) {           // a dormer through the front slope
            const dx = (Math.random() - 0.5) * h.w * 0.4;
            const base = g.clone().multiply(new THREE.Matrix4().makeTranslation(dx, h.hw + h.hr * 0.28, h.d * 0.22));
            dormerWallS.push({ harbor: h.harbor, m: base.clone().multiply(localM(1.2, 1.0, 1.2, 0)) });
            dormerRoofS.push({ harbor: h.harbor, m: base.multiply(localM(1.5, 0.7, 1.5, 1.0)) });
          }
          if (h.stoop) {            // the doorstep
            stoopS.push({
              harbor: h.harbor,
              m: g.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0, h.d / 2 + 0.45))
                .multiply(localM(1.7, 0.4, 0.9, 0)),
            });
          }
          if (h.sign) {             // the trade sign, hung out over the way
            const base = g.clone().multiply(new THREE.Matrix4().makeTranslation(h.w * 0.28, h.hw * 0.7, h.d / 2));
            signArmS.push({ harbor: h.harbor, m: base.clone().multiply(localM(0.12, 0.12, 1.3, 0)) });
            const plate = {
              harbor: h.harbor,
              m: base.multiply(new THREE.Matrix4().makeTranslation(0, -0.55, 0.95))
                .multiply(localM(0.9, 0.7, 0.08, 0)),
            };
            if (h.type && TYPE_SIGN[h.type]) {  // a painted board names the trade
              (typedPlateS[h.type] = typedPlateS[h.type] || []).push(plate);
            } else {
              signPlateS.push(plate);
            }
          }
          /* ----- the yard: the lived-in ground about the house -----
             Deterministically hashed from the house position, so the same
             house always keeps the same yard. Everything sits at the back
             (-z) or along the gable sides; the door and stoop face +z and
             stay clear, and nothing strays more than ~2.5 m from the wall,
             so the streets keep their width. */
          const yardAt = (lx, lz, rotDeg, sc) => g.clone()
            .multiply(new THREE.Matrix4().makeTranslation(lx, 0, lz))
            .multiply(new THREE.Matrix4().makeRotationY((rotDeg || 0) * D2RAD))
            .multiply(new THREE.Matrix4().makeScale(sc || 1, sc || 1, sc || 1));
          const sideX = yr(0) < 0.5 ? -1 : 1;
          const backZ = -(h.d / 2 + 0.9);
          if (yr(1) < 0.3) {        // a flowering shrub by the gable wall —
            (yr(50) < 0.5 ? yardShrubS : yardShrub2S).push({ harbor: h.harbor,  // hash picks the blossom hue
              m: yardAt(sideX * (h.w / 2 + 0.8), (yr(2) - 0.5) * h.d * 0.6, yr(3) * 360, 0.75 + yr(4) * 0.5) });
          }
          if (!h.type && pros > 0.12 && yr(5) < (pros > 0.7 ? 0.3 : 0.16)) {  // a kitchen-garden out back — the tidy house keeps a fuller one
            yardGardenS.push({ harbor: h.harbor,
              m: yardAt((yr(6) - 0.5) * h.w * 0.5, backZ - 1.5, (yr(7) - 0.5) * 14, 0.85 + yr(8) * 0.3) });
          }
          const hasLeanTo = yr(96) < 0.13;
          if (hasLeanTo) {          // a lean-to shed against the side wall
            leanToS.push({ harbor: h.harbor,
              m: yardAt(-sideX * (h.w / 2 + 0.9), (yr(73) - 0.5) * h.d * 0.3, -sideX * 90, 0.9 + yr(74) * 0.25) });
          }
          if (yr(9) < 0.22 && !hasLeanTo) {  // firewood stacked along the side wall
            yardWoodS.push({ harbor: h.harbor,
              m: yardAt(-sideX * (h.w / 2 + 0.5), (yr(10) - 0.5) * h.d * 0.5, 90, 0.85 + yr(11) * 0.35) });
          }
          if (!h.type && yr(12) < 0.18) {  // a bench by the door, off to the corner
            yardBenchS.push({ harbor: h.harbor,
              m: yardAt(sideX * h.w * 0.33, h.d / 2 + 0.8, 180 + (yr(13) - 0.5) * 16) });
          }
          if (yr(14) < 0.25) {      // the rain barrel at the back corner
            yardBarrelS.push({ harbor: h.harbor,
              m: yardAt(sideX * (h.w / 2 - 0.5), backZ + 0.3, 0, 0.8 + yr(15) * 0.3) });
          }
          if (yr(16) < 0.14) {      // planks leaning on the back wall
            yardPlankS.push({ harbor: h.harbor,
              m: yardAt((yr(17) - 0.5) * h.w * 0.6, backZ + 0.45, 180) });
          }
          if (yr(18) < 0.18) {      // back-yard scraps: a rock pile and litter
            yardScrapS.push({ harbor: h.harbor,
              m: yardAt((yr(19) - 0.5) * (h.w + 2), backZ - 0.8 - yr(20) * 1.4, yr(21) * 360, 0.8 + yr(22) * 0.5) });
          }
          if (yr(23) < 0.22) {      // more of the same along the gable side
            yardScrapS.push({ harbor: h.harbor,
              m: yardAt(sideX * (h.w / 2 + 0.4 + yr(24)), backZ * 0.4, yr(25) * 360) });
          }
          if (pros > 0.25 && yr(36) < 0.15) {  // a window box abloom under a front casement
            (yr(51) < 0.5 ? yardFlowerS : yardFlower2S).push({ harbor: h.harbor,
              m: g.clone().multiply(new THREE.Matrix4()
                .makeTranslation((yr(37) - 0.5) * h.w * 0.5, 2.3, h.d / 2 + 0.18)) });
          }
          if (yr(100) < 0.1) {      // a firewood bundle dropped by the door
            doorWoodS.push({ harbor: h.harbor,
              m: yardAt(-sideX * h.w * 0.28, h.d / 2 + 0.7, yr(101) * 360, 0.85 + yr(102) * 0.3) });
          }
          if (h.stoop && yr(103) < 0.15) {  // a boot-scraper set beside the doorstep
            bootScrapeS.push({ harbor: h.harbor, m: yardAt(1.15, h.d / 2 + 0.5, 0) });
          }
          if (pros > 0.72 && h.stories >= 2 && winSlots && yr(104) < 0.45) {
            // shutters propped open at an upper casement of the prosperous house
            const wx2 = ((winSlots[yr(105) < 0.5 ? 0 : 1] - 96) / 192) * h.w;
            shutterS.push({ harbor: h.harbor,
              m: g.clone().multiply(new THREE.Matrix4()
                .makeTranslation(wx2, h.hw * (1 - 0.47 / h.stories), h.d / 2)) });
          }
          if (yr(110) < 0.13) {     // a water butt under the front eave corner, catching the rain
            yardBarrelS.push({ harbor: h.harbor,
              m: yardAt(-sideX * (h.w / 2 - 0.5), h.d / 2 + 0.55, 0, 0.7 + yr(111) * 0.25) });
          }
          if (h.stories >= 3 && yr(45) < 0.35) {  // a hitching post before the bigger houses
            hitchS.push({ harbor: h.harbor,
              m: yardAt(h.w * 0.42, h.d / 2 + 1.3, (yr(52) - 0.5) * 20) });
          }
          if (!h.type && yr(46) < 0.05) {  // a bee skep in the back yard, rare
            skepS.push({ harbor: h.harbor,
              m: yardAt((yr(47) - 0.5) * h.w * 0.5, backZ - 0.7, yr(48) * 360, 0.9 + yr(49) * 0.35) });
          }
          if (h.sign && (!h.type || h.type === 'tavern' || h.type === 'gambling')) {
            tavernS.push({ harbor: h.harbor,   // trade spills out: a table and stools,
              m: yardAt(-h.w * 0.3, h.d / 2 + 1.6, yr(38) * 360) });   // beside the door, never in it
          }
          /* ----- the promoted trades set out their props ----- */
          if (h.type === 'tavern' || h.type === 'gambling' || h.type === 'brothel') {
            /* a lantern hung on the wall beside the door — its top loop reads
               as the hook; base at 1.8 m puts the light just over head height.
               The brothel's burns red. */
            lanternS.push({ harbor: h.harbor,
              m: g.clone().multiply(new THREE.Matrix4().makeTranslation(-h.w * 0.18, 1.8, h.d / 2 + 0.14)),
              color: h.type === 'brothel' ? LANTERN_RED : LANTERN_WHITE });
          }
          if (h.type === 'smithy') {           // the forge yard to one side of the open bay,
            forgeYardS.push({ harbor: h.harbor,                  // clear of the bay's centre line
              m: yardAt(sideX * h.w * 0.28, h.d / 2 + 2.1, yr(120) * 40 - 20) });
          }
          if (h.type === 'provisioner') {
            /* the hoist and its dangling sack: the kit's beam sits at local
               y 3.4 with the wall plane at z 0, so lifting it by hw-3.5 lays
               the beam just under the eave, the sack swinging at the loft door */
            hoistSackS.push({ harbor: h.harbor,
              m: g.clone().multiply(new THREE.Matrix4().makeTranslation(0, Math.max(0, h.hw - 3.5), h.d / 2)) });
          }
          if (h.type === 'counting') {         // the strongbox by the counting-house door
            strongboxS.push({ harbor: h.harbor,
              m: yardAt(h.w * 0.3, h.d / 2 + 1.0, yr(121) * 30 - 15, 0.9) });
          }
          if (yr(39) < 0.13) {      // washing strung out to dry behind the house
            clothesS.push({ harbor: h.harbor,
              m: yardAt((yr(40) - 0.5) * h.w * 0.4, backZ - 1.7, (yr(41) - 0.5) * 40) });
          }
          if (yr(43) < 0.4 && nearShore(h)) {  // a net drying on the sun-side wall
            const aR = h.ang * D2RAD;          // pick the wall facing nearest south
            const sun = [
              [-Math.cos(aR), 0, -(h.d / 2 + 0.22), 180],
              [Math.sin(aR), -(h.w / 2 + 0.22), 0, -90],
              [-Math.sin(aR), h.w / 2 + 0.22, 0, 90],
            ].sort((p, q) => q[0] - p[0])[0];
            netS.push({ harbor: h.harbor, m: yardAt(sun[1], sun[2], sun[3]) });
          }
          /* ----- wear, mid-size filler, and the rare piece of trash ----- */
          if (pros < 0.1) {         // the abandoned yard: bramble and rank grass
            brambleS.push({ harbor: h.harbor,
              m: yardAt((yr(75) - 0.5) * h.w * 0.6, backZ - 1.0, yr(76) * 360, 0.9 + yr(77) * 0.6) });
            for (let k = 0; k < 3; k++) {
              grassSpec.push({ harbor: h.harbor,
                m: yardAt((yr(78 + k) - 0.5) * (h.w + 2), backZ * (0.3 + yr(81 + k) * 0.7), 0, 1.2 + yr(84 + k) * 0.8) });
            }
          }
          if (pros < 0.32 && yr(85) < 0.3) {  // a fence section gone to ruin
            fenceBrokenS.push({ harbor: h.harbor,
              m: yardAt(sideX * (h.w / 2 + 1.5), h.d * 0.1, 90 + (yr(64) - 0.5) * 20) });
          } else if (pros > 0.45 && yr(64) < 0.18) {  // a low stone wall between yards
            boundaryS.push({ harbor: h.harbor,
              m: yardAt(sideX * (h.w / 2 + 1.7), 0, 90).multiply(localM(h.d + 1.6, 0.55, 0.32, 0)) });
            if (!h.type && yr(106) < 0.4) {  // and within the walled yard, a small fruit tree
              fruitTreeS.push({ harbor: h.harbor,
                m: yardAt(sideX * (h.w / 2 + 1.0), backZ - 0.6 - yr(107), yr(108) * 360, 0.8 + yr(109) * 0.45) });
            }
          }
          if (yr(97) < 0.07) {      // spare shingles stacked for the next repair
            shingleS.push({ harbor: h.harbor,
              m: yardAt((yr(63) - 0.5) * h.w * 0.5, backZ - 0.4, yr(62) * 360) });
          }
          if (yr(98) < 0.08) {      // the privy hut in the back corner
            privyS.push({ harbor: h.harbor,
              m: yardAt(-sideX * (h.w / 2 - 0.4), backZ - 1.3, 180 + (yr(99) - 0.5) * 30) });
          }
          if (yr(86) < 0.07) {      // the midden by the back door — oyster shells
            middenS.push({ harbor: h.harbor,
              m: yardAt((yr(87) - 0.5) * h.w * 0.4, backZ - 0.5, yr(88) * 360, 0.8 + yr(89) * 0.4) });
          }
          if (yr(90) < 0.06) {      // a barrel broken down to its staves
            brokenBarrelS.push({ harbor: h.harbor,
              m: yardAt(sideX * (h.w / 2 - 0.8), backZ - 0.3, yr(61) * 360) });
          }
          if (yr(91) < 0.05) {      // a sprung cartwheel left leaning on the wall
            wheelS.push({ harbor: h.harbor,
              m: yardAt((yr(92) - 0.5) * h.w * 0.5, backZ + 0.55, 180) });
          }
          if (yr(93) < 0.06) {      // pottery shards swept into the alley
            shardS.push({ harbor: h.harbor,
              m: yardAt(sideX * (h.w / 2 + 1.2), (yr(94) - 0.5) * h.d * 0.7, yr(95) * 360) });
          }
          for (let k = 0; k < 2; k++) {   // grass tufts along the wall bases
            if (yr(26 + k * 3) < 0.5) continue;
            const gx = (k ? -1 : 1) * (h.w / 2 + 0.3);
            const sc = 0.5 + yr(27 + k * 3) * 0.6;
            grassSpec.push({ harbor: h.harbor,
              m: yardAt(gx, (yr(28 + k * 3) - 0.5) * h.d * 0.8, 0, sc) });
          }
        }
        addInst(wallGeo, wallMat, wallS);
        stats.byGroup[key] = list.length;
      }
      // roofs and plinths flush once per style|stories — the trade types
      // share these draws, so promotion adds no roof or plinth batches
      for (const list of Object.values(plinthAcc)) addInst(wallGeo, stoneMat, list);
      for (const [baseKey, list] of Object.entries(roofAcc)) {
        const style = baseKey.split('|')[0];
        const roofKind = (style === 'spanish' || style === 'french') ? 'hip' : 'gable';
        const roofMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: roofTexture(style), side: THREE.DoubleSide });
        addInst(roofGeos[roofKind], roofMat, list);
      }
      stats.houses = total;

      addInst(wallGeo, brickMat, chimneys.map(({ h, end }) => ({
        harbor: h.harbor,
        m: groundMatrix(h.lngLat, h.ang)
          .multiply(new THREE.Matrix4().makeTranslation(end * (h.w / 2 - 0.7), 0, 0))
          .multiply(localM(0.9, h.hw + h.hr + 1.1, 0.9, 0)),
      })));
      addInst(wallGeo, woodMat, balconies.flatMap((h) => [-1, 1].map((side) => ({
        harbor: h.harbor,   // Cartagena hangs her balconies on both faces
        m: groundMatrix(h.lngLat, h.ang)
          .multiply(new THREE.Matrix4().makeTranslation(0, h.hw * 0.52, side * (h.d / 2 + 0.45)))
          .multiply(localM(h.w * 0.55, 0.9, 0.9, 0)),
      }))));
      addInst(wallGeo, new THREE.MeshLambertMaterial({ color: 0xe6dcc0 }), dormerWallS, { lod: true });
      addInst(roofGeos.gable, new THREE.MeshLambertMaterial({ color: 0x6e5a45, side: THREE.DoubleSide }), dormerRoofS, { lod: true });
      addInst(wallGeo, stoneMat, stoopS, { lod: true });
      addInst(wallGeo, woodMat, signArmS, { lod: true });
      addInst(wallGeo, new THREE.MeshLambertMaterial({ color: 0x8a3b2e }), signPlateS, { lod: true });
      /* painted boards for the promoted trades: a small glyph per type,
         one extra instanced draw per type per harbour, only when present */
      const signBoard = (x, base, border) => { // the weathered board every glyph hangs on
        x.fillStyle = base; x.fillRect(0, 0, 32, 32);
        x.strokeStyle = 'rgba(0,0,0,0.14)';    // plank seams across the grain
        x.lineWidth = 1;
        for (const gy of [8, 16, 24]) {
          x.beginPath(); x.moveTo(0, gy); x.lineTo(32, gy); x.stroke();
        }
        x.fillStyle = 'rgba(0,0,0,0.16)';      // rain-darkened along the foot
        x.fillRect(0, 28, 32, 4);
        x.strokeStyle = border; x.lineWidth = 2;  // the painted border, gone thin
        x.strokeRect(2, 2, 28, 28);
      };
      const SIGN_GLYPHS = {
        tavern: (x) => {                       // the tankard
          signBoard(x, '#7a4a26', '#f0e2c0');
          x.fillStyle = '#f0e2c0'; x.fillRect(10, 9, 10, 15);
          x.fillRect(8, 9, 14, 3);             // the head of foam
          x.strokeStyle = '#f0e2c0'; x.lineWidth = 2.5;
          x.beginPath(); x.arc(22, 16, 4.5, -Math.PI / 2, Math.PI / 2); x.stroke();
        },
        gambling: (x) => {                     // the pair of dice
          signBoard(x, '#3b3b4a', '#ece6d4');
          x.fillStyle = '#ece6d4'; x.fillRect(5, 6, 10, 10); x.fillRect(17, 16, 10, 10);
          x.fillStyle = '#2a2a36';
          for (const [px2, py2] of [[8, 9], [12, 13], [20, 19], [24, 19], [20, 23], [24, 23]]) {
            x.fillRect(px2, py2, 2, 2);
          }
        },
        counting: (x) => {                     // the merchant's balance
          signBoard(x, '#ece4cc', '#3a2e1f');
          x.strokeStyle = '#3a2e1f'; x.lineWidth = 2;
          x.beginPath();
          x.moveTo(16, 6); x.lineTo(16, 24);   // the post
          x.moveTo(6, 9); x.lineTo(26, 9);     // the beam
          x.moveTo(6, 9); x.lineTo(6, 16); x.moveTo(26, 9); x.lineTo(26, 16);
          x.stroke();
          x.fillStyle = '#3a2e1f';             // the pans
          x.beginPath(); x.arc(6, 17, 4, 0, Math.PI); x.fill();
          x.beginPath(); x.arc(26, 17, 4, 0, Math.PI); x.fill();
        },
        brothel: (x) => {                      // the bunch of grapes — the period's quiet word for it
          signBoard(x, '#564238', '#8a6a4a');
          x.strokeStyle = '#5e6a3c'; x.lineWidth = 1.5;
          x.beginPath(); x.moveTo(17, 5); x.lineTo(15.5, 10); x.stroke();   // the stalk
          x.fillStyle = '#5e6a3c';             // a single leaf at the stalk
          x.beginPath(); x.ellipse(20.5, 7.5, 3.2, 1.8, 0.5, 0, Math.PI * 2); x.fill();
          x.fillStyle = '#6a4460';             // the bunch, tapering down
          for (const [gx2, gy2] of [[11.5, 13], [16, 12.5], [20.5, 13], [13.5, 17], [18, 17], [16, 21], [16, 25]]) {
            x.beginPath(); x.arc(gx2, gy2, 2.6, 0, Math.PI * 2); x.fill();
          }
          x.fillStyle = '#8a5c80';             // the light catches two grapes
          x.beginPath(); x.arc(15.2, 12, 0.9, 0, Math.PI * 2); x.fill();
          x.beginPath(); x.arc(15.2, 20.3, 0.9, 0, Math.PI * 2); x.fill();
        },
      };
      for (const [t, list] of Object.entries(typedPlateS)) {
        if (!list.length || !SIGN_GLYPHS[t]) continue;
        const plateMat = new THREE.MeshLambertMaterial({
          color: 0xffffff, map: canvasTex('sign-' + t, 32, 32, SIGN_GLYPHS[t]),
        });
        addInst(wallGeo, plateMat, list, { lod: true });
      }

      /* ----- yard clutter: shared geometry, instanced per harbour -----
         Each kind is a single two-tone geometry (colours baked per vertex,
         one Lambert material), so the whole pass costs one draw call per
         kind per harbour at close zoom. */
      function mergeColored(parts) {     // parts: [geometry, hexColour][]
        let vn = 0;
        for (const [pg] of parts) vn += pg.attributes.position.count;
        const pos = new Float32Array(vn * 3), nor = new Float32Array(vn * 3), col = new Float32Array(vn * 3);
        const idx = [];
        let vo = 0;
        const c = new THREE.Color();
        for (const [pg, hex] of parts) {
          const p = pg.attributes.position, nm = pg.attributes.normal;
          c.set(hex);
          for (let i = 0; i < p.count; i++) {
            pos[(vo + i) * 3] = p.getX(i); pos[(vo + i) * 3 + 1] = p.getY(i); pos[(vo + i) * 3 + 2] = p.getZ(i);
            if (nm) { nor[(vo + i) * 3] = nm.getX(i); nor[(vo + i) * 3 + 1] = nm.getY(i); nor[(vo + i) * 3 + 2] = nm.getZ(i); }
            col[(vo + i) * 3] = c.r; col[(vo + i) * 3 + 1] = c.g; col[(vo + i) * 3 + 2] = c.b;
          }
          if (pg.index) for (let i = 0; i < pg.index.count; i++) idx.push(vo + pg.index.getX(i));
          else for (let i = 0; i < p.count; i++) idx.push(vo + i);
          vo += p.count;
        }
        const out = new THREE.BufferGeometry();
        out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        out.setAttribute('color', new THREE.BufferAttribute(col, 3));
        out.setIndex(idx);
        return out;
      }
      const lump = (r) => new THREE.IcosahedronGeometry(r, 0);
      // a flowering shrub: green clump with bright blossom studs; two blossom
      // palettes, hash-chosen per house, so the gardens vary down a street
      const shrubOf = (b) => mergeColored([
        [lump(0.55).scale(1.15, 0.8, 1.15).translate(0, 0.42, 0), 0x5d7a3c],
        [lump(0.34).translate(0.42, 0.3, 0.2), 0x69884a],
        [lump(0.08).translate(0.3, 0.78, 0.25), b[0]],
        [lump(0.07).translate(-0.35, 0.62, -0.1), b[1]],
        [lump(0.07).translate(-0.05, 0.85, -0.3), b[0]],
        [lump(0.06).translate(0.5, 0.5, -0.35), b[2]],
      ]);
      const shrubGeo = shrubOf([0xc4566a, 0xd8b04a, 0xe6e2d2]);   // rose-led
      const shrubGeo2 = shrubOf([0xe6e2d2, 0xc98a3a, 0xc4566a]);  // white-and-ochre
      // a kitchen garden: a soil bed with two ridged rows of greens, ringed
      // by a low wattle fence (baked into the same geometry — no extra draw)
      const gardenParts = [[new THREE.BoxGeometry(2.6, 0.22, 1.8).translate(0, 0.11, 0), 0x6a4f33]];
      for (const rz of [-0.45, 0.45]) {
        gardenParts.push([new THREE.BoxGeometry(2.3, 0.14, 0.34).translate(0, 0.26, rz), 0x59422b]);
        for (let gi = 0; gi < 4; gi++) {
          gardenParts.push([new THREE.ConeGeometry(0.16, 0.42, 4).translate(-0.9 + gi * 0.6, 0.48, rz), 0x6f8a42]);
        }
      }
      {
        const fx = 1.6, fz = 1.2;        // fence line just outside the bed
        for (const [px, pz] of [[-fx, -fz], [0, -fz], [fx, -fz], [-fx, fz], [0, fz], [fx, fz], [-fx, 0], [fx, 0]]) {
          gardenParts.push([new THREE.BoxGeometry(0.07, 0.55, 0.07).translate(px, 0.27, pz), 0x6b4f30]);
        }
        for (const [rx, rz, w, alongX] of [[0, -fz, 3.2, 1], [0, fz, 3.2, 1], [-fx, 0, 2.4, 0], [fx, 0, 2.4, 0]]) {
          for (const ry of [0.2, 0.42]) {  // two woven rails
            gardenParts.push([new THREE.BoxGeometry(alongX ? w : 0.05, 0.06, alongX ? 0.05 : w)
              .translate(rx, ry, rz), 0x7d5e3a]);
          }
        }
      }
      const gardenGeo = mergeColored(gardenParts);
      // stacked firewood, logs lying along x
      const woodParts = [];
      const logTones = [0x6b4a2e, 0x7a5636, 0x5e402a];
      let li = 0;
      for (const [nLogs, ly] of [[4, 0.12], [3, 0.32], [2, 0.5]]) {
        for (let gi = 0; gi < nLogs; gi++) {
          woodParts.push([new THREE.CylinderGeometry(0.11, 0.11, 1.2, 5).rotateZ(Math.PI / 2)
            .translate(0, ly, (gi - (nLogs - 1) / 2) * 0.24), logTones[li++ % 3]]);
        }
      }
      const woodpileGeo = mergeColored(woodParts);
      // a plain bench
      const benchGeo = mergeColored([
        [new THREE.BoxGeometry(1.5, 0.09, 0.42).translate(0, 0.46, 0), 0x7a5a38],
        [new THREE.BoxGeometry(0.12, 0.46, 0.38).translate(-0.6, 0.23, 0), 0x5e442c],
        [new THREE.BoxGeometry(0.12, 0.46, 0.38).translate(0.6, 0.23, 0), 0x5e442c],
      ]);
      // planks leaning on a wall (tip tilted toward -z, the wall side)
      const plankLeanGeo = mergeColored([
        [new THREE.BoxGeometry(0.3, 2.3, 0.07).translate(0, 1.15, 0).rotateX(-0.42), 0x9b8158],
        [new THREE.BoxGeometry(0.26, 1.9, 0.06).translate(0.34, 0.95, 0.05).rotateX(-0.5), 0x8a7350],
      ]);
      // back-yard scraps: a rock pile with flat shards strewn about it —
      // one combined kit, so rocks and litter share a single instanced draw
      const scrapsGeo = mergeColored([
        [lump(0.3).scale(1.2, 0.75, 1).translate(0, 0.16, 0), 0x8d8275],
        [lump(0.2).translate(0.34, 0.1, 0.18), 0x7c7264],
        [lump(0.16).translate(-0.28, 0.09, -0.14), 0x968b7c],
        [new THREE.BoxGeometry(0.5, 0.03, 0.2).translate(0.62, 0.02, 0.35).rotateY(0.6), 0x7a6a4d],
        [new THREE.BoxGeometry(0.35, 0.03, 0.16).translate(-0.55, 0.02, -0.3).rotateY(-0.9), 0x6a5a40],
        [new THREE.BoxGeometry(0.2, 0.05, 0.12).translate(0.15, 0.03, -0.55).rotateY(1.7), 0x8a7a5c],
      ]);
      // a window box abloom: planter, greens, bright blossom studs — the
      // same two-palette treatment as the shrubs
      const flowerBoxOf = (b) => mergeColored([
        [new THREE.BoxGeometry(1.1, 0.22, 0.3).translate(0, 0, 0.05), 0x6b4a2e],
        [lump(0.16).translate(-0.3, 0.16, 0.08), 0x5d7a3c],
        [lump(0.15).translate(0.05, 0.18, 0.1), 0x69884a],
        [lump(0.14).translate(0.35, 0.15, 0.08), 0x5d7a3c],
        [lump(0.06).translate(-0.3, 0.28, 0.15), b[0]],
        [lump(0.05).translate(0.08, 0.3, 0.17), b[1]],
        [lump(0.05).translate(0.38, 0.26, 0.15), b[0]],
      ]);
      const flowerBoxGeo = flowerBoxOf([0xc4566a, 0xd8b04a]);
      const flowerBoxGeo2 = flowerBoxOf([0xe6e2d2, 0xc98a3a]);
      // the tavern front: a round table with three stools about it
      const tavernParts = [
        [new THREE.CylinderGeometry(0.55, 0.55, 0.07, 8).translate(0, 0.72, 0), 0x8a6a42],
        [new THREE.CylinderGeometry(0.07, 0.1, 0.7, 5).translate(0, 0.36, 0), 0x5e442c],
      ];
      for (const [sx, sz] of [[0.95, 0.2], [-0.75, 0.6], [0.15, -0.95]]) {
        tavernParts.push([new THREE.CylinderGeometry(0.22, 0.22, 0.06, 6).translate(sx, 0.42, sz), 0x7a5a38]);
        tavernParts.push([new THREE.CylinderGeometry(0.05, 0.07, 0.42, 5).translate(sx, 0.21, sz), 0x5e442c]);
      }
      const tavernGeo = mergeColored(tavernParts);
      // a drying rack: crossed poles, a ridge pole, the split catch hung over it
      const rackParts = [];
      for (const rx of [-0.9, 0.9]) {
        rackParts.push([new THREE.CylinderGeometry(0.05, 0.06, 1.6, 4).rotateZ(0.45).translate(rx, 0.7, 0), 0x6b4f30]);
        rackParts.push([new THREE.CylinderGeometry(0.05, 0.06, 1.6, 4).rotateZ(-0.45).translate(rx, 0.7, 0), 0x6b4f30]);
      }
      rackParts.push([new THREE.CylinderGeometry(0.04, 0.04, 2.4, 4).rotateZ(Math.PI / 2).translate(0, 1.32, 0), 0x7d5e3a]);
      for (let fi = 0; fi < 6; fi++) {
        rackParts.push([new THREE.BoxGeometry(0.07, 0.34, 0.16).translate(-0.8 + fi * 0.32, 1.12, 0), 0xb8a98a]);
      }
      const rackGeo = mergeColored(rackParts);
      // a dinghy hauled out and turned turtle, an oar dropped beside her
      const oarShaft = new THREE.BoxGeometry(0.07, 0.05, 1.9).translate(0, 0.03, 0);
      const oarBlade = new THREE.BoxGeometry(0.18, 0.04, 0.5).translate(0, 0.03, 1.1);
      oarShaft.rotateY(0.5); oarShaft.translate(1.3, 0, 0.5);
      oarBlade.rotateY(0.5); oarBlade.translate(1.3, 0, 0.5);
      const dinghyGeo = mergeColored([
        [lump(1).scale(1.5, 0.38, 0.55).translate(0, 0.3, 0), 0x7a5a38],     // the upturned hull
        [new THREE.BoxGeometry(2.5, 0.08, 0.14).translate(0, 0.66, 0), 0x5e442c], // keel strip
        [oarShaft, 0x9b8158],
        [oarBlade, 0x9b8158],
      ]);
      const yardBarrelGeo = new THREE.CylinderGeometry(0.5, 0.42, 0.95, 8).translate(0, 0.48, 0);
      // a skiff afloat, right side up, tied alongside a jetty
      const skiffGeo = mergeColored([
        [lump(1).scale(1.55, 0.42, 0.58).translate(0, 0.28, 0), 0x7a5a38],   // the hull
        [lump(1).scale(1.3, 0.3, 0.44).translate(0, 0.44, 0), 0x33281b],     // the open hold
        [new THREE.BoxGeometry(0.14, 0.05, 0.95).translate(0.4, 0.72, 0), 0x9b8158],   // thwarts
        [new THREE.BoxGeometry(0.14, 0.05, 0.85).translate(-0.55, 0.7, 0), 0x9b8158],
      ]);
      // crab pots stacked at the jetty head, a rope coil beside them
      const headGearGeo = mergeColored([
        [new THREE.BoxGeometry(0.6, 0.32, 0.6).translate(0, 0.16, 0), 0x5a4a33],
        [new THREE.BoxGeometry(0.66, 0.05, 0.66).translate(0, 0.34, 0), 0x7d5e3a],
        [new THREE.BoxGeometry(0.55, 0.3, 0.55).translate(0.04, 0.5, -0.03), 0x52432e],
        [new THREE.BoxGeometry(0.6, 0.05, 0.6).translate(0.04, 0.66, -0.03), 0x7d5e3a],
        [new THREE.TorusGeometry(0.26, 0.08, 5, 10).rotateX(Math.PI / 2).translate(0.78, 0.08, 0.2), 0x8a7350],
      ]);
      // a sack pile — the sugar and flour of the trade
      const sackGeo = mergeColored([
        [lump(0.3).scale(1.3, 0.7, 1).translate(0, 0.16, 0), 0xb3a079],
        [lump(0.28).scale(1.25, 0.7, 1).translate(0.48, 0.15, 0.32), 0xa6916b],
        [lump(0.27).scale(1.2, 0.7, 1).translate(-0.44, 0.15, 0.28), 0xbfae87],
        [lump(0.26).scale(1.2, 0.65, 0.95).translate(0.04, 0.42, 0.18), 0xae9c74],
      ]);
      // an anchor laid out on the wharf, awaiting fitting
      const IRON = 0x474a50;
      const anchorGeo = mergeColored([
        [new THREE.CylinderGeometry(0.06, 0.08, 2.1, 5).rotateZ(Math.PI / 2).translate(0, 0.12, 0), IRON],
        [new THREE.BoxGeometry(0.1, 0.1, 1.1).translate(0.8, 0.12, 0), IRON],          // the stock
        [new THREE.TorusGeometry(0.16, 0.045, 5, 10).translate(1.15, 0.16, 0), IRON],  // the ring
        [new THREE.CylinderGeometry(0.05, 0.07, 0.95, 5).rotateX(Math.PI / 2).rotateY(0.55).translate(-0.82, 0.12, 0.28), IRON],
        [new THREE.CylinderGeometry(0.05, 0.07, 0.95, 5).rotateX(Math.PI / 2).rotateY(-0.55).translate(-0.82, 0.12, -0.28), IRON],
        [new THREE.ConeGeometry(0.14, 0.4, 4).rotateX(Math.PI / 2).rotateY(0.55).translate(-1.05, 0.12, 0.62), IRON],
        [new THREE.ConeGeometry(0.14, 0.4, 4).rotateX(-Math.PI / 2).rotateY(-0.55).translate(-1.05, 0.12, -0.62), IRON],
      ]);
      // a two-wheeled hand cart left between loads
      const cartGeo = mergeColored([
        [new THREE.BoxGeometry(1.1, 0.08, 1.6).translate(0, 0.6, 0), 0x8a6a42],
        [new THREE.BoxGeometry(1.1, 0.26, 0.06).translate(0, 0.74, -0.78), 0x7a5a38],
        [new THREE.BoxGeometry(1.1, 0.26, 0.06).translate(0, 0.74, 0.78), 0x7a5a38],
        [new THREE.CylinderGeometry(0.05, 0.05, 1.34, 5).rotateZ(Math.PI / 2).translate(0, 0.45, 0.1), 0x5e442c],
        [new THREE.CylinderGeometry(0.45, 0.45, 0.09, 8).rotateZ(Math.PI / 2).translate(-0.64, 0.45, 0.1), 0x5e442c],
        [new THREE.CylinderGeometry(0.45, 0.45, 0.09, 8).rotateZ(Math.PI / 2).translate(0.64, 0.45, 0.1), 0x5e442c],
        [new THREE.BoxGeometry(0.06, 0.06, 1.3).rotateX(-0.4).translate(-0.42, 0.36, -1.2), 0x8a6a42],
        [new THREE.BoxGeometry(0.06, 0.06, 1.3).rotateX(-0.4).translate(0.42, 0.36, -1.2), 0x8a6a42],
      ]);
      // a clothes-line: two posts, the line sagging between, linen out to dry
      const clothesParts = [
        [new THREE.BoxGeometry(0.08, 2.0, 0.08).translate(-1.6, 1.0, 0), 0x6b4f30],
        [new THREE.BoxGeometry(0.08, 2.0, 0.08).translate(1.6, 1.0, 0), 0x6b4f30],
        [new THREE.BoxGeometry(1.16, 0.03, 0.03).rotateZ(-0.13).translate(-1.05, 1.86, 0), 0xcfc6b4],
        [new THREE.BoxGeometry(1.1, 0.03, 0.03).translate(0, 1.79, 0), 0xcfc6b4],
        [new THREE.BoxGeometry(1.16, 0.03, 0.03).rotateZ(0.13).translate(1.05, 1.86, 0), 0xcfc6b4],
      ];
      for (const [lx, lw, lc] of [[-0.85, 0.6, 0xe8e2d2], [0.05, 0.5, 0xc9d0d6], [0.9, 0.55, 0xddd2b8]]) {
        clothesParts.push([new THREE.BoxGeometry(lw, 0.62, 0.03).translate(lx, 1.48, 0), lc]);
      }
      const clothesGeo = mergeColored(clothesParts);
      // a market stall: trestle table, four poles, a striped canvas awning
      // (strips baked as alternating colours), the goods heaped on the board
      const trestleParts = () => [
        [new THREE.BoxGeometry(2.2, 0.08, 1.0).translate(0, 0.78, 0), 0x8a6a42],
        [new THREE.BoxGeometry(0.1, 0.74, 0.9).translate(-0.85, 0.37, 0), 0x5e442c],
        [new THREE.BoxGeometry(0.1, 0.74, 0.9).translate(0.85, 0.37, 0), 0x5e442c],
      ];
      const stallAParts = trestleParts();
      for (const [px2, pz2] of [[-1.15, -0.65], [1.15, -0.65], [-1.15, 0.65], [1.15, 0.65]]) {
        stallAParts.push([new THREE.BoxGeometry(0.07, 2.3, 0.07).translate(px2, 1.15, pz2), 0x6b4f30]);
      }
      for (let si2 = 0; si2 < 6; si2++) {     // the striped awning, pitched a touch
        stallAParts.push([new THREE.BoxGeometry(0.44, 0.04, 1.8).rotateX(0.14)
          .translate(-1.1 + si2 * 0.44, 2.28, 0.08), si2 % 2 ? 0xe8e0cc : 0xa84a3a]);
      }
      stallAParts.push([lump(0.22).translate(-0.5, 0.95, 0.1), 0x7f9a4a]);
      stallAParts.push([lump(0.18).translate(0.1, 0.92, -0.15), 0xc9842f]);
      stallAParts.push([lump(0.2).translate(0.6, 0.94, 0.12), 0xb05030]);
      const stallAGeo = mergeColored(stallAParts);
      // a basket stall: the open trestle with the produce baskets on and by it
      const stallBParts = trestleParts();
      for (const [bx2, by2, bz2] of [[-0.55, 0.82, 0.05], [0.25, 0.82, -0.12], [0.95, 0, 0.62]]) {
        stallBParts.push([new THREE.CylinderGeometry(0.26, 0.2, 0.24, 6).translate(bx2, by2 + 0.12, bz2), 0xb08a4e]);
        stallBParts.push([lump(0.14).translate(bx2, by2 + 0.28, bz2), bz2 > 0.3 ? 0x7f9a4a : 0xc9842f]);
      }
      const stallBGeo = mergeColored(stallBParts);
      // an open-sided weighing tripod, the pan slung beneath the apex
      const tripodParts = [];
      for (let li2 = 0; li2 < 3; li2++) {
        tripodParts.push([new THREE.CylinderGeometry(0.05, 0.06, 2.5, 4).translate(0, 1.25, 0)
          .rotateZ(0.34).translate(0.55, 0, 0).rotateY(li2 * 2.094), 0x6b4f30]);
      }
      tripodParts.push([new THREE.BoxGeometry(0.03, 0.7, 0.03).translate(0, 1.9, 0), 0x474a50]);
      tripodParts.push([new THREE.CylinderGeometry(0.3, 0.34, 0.08, 7).translate(0, 1.5, 0), 0x474a50]);
      tripodParts.push([lump(0.18).translate(0, 1.65, 0), 0xb3a079]);
      const tripodGeo = mergeColored(tripodParts);
      // a signpost: a post and one or two boards angled down different ways
      const signpostGeo = mergeColored([
        [new THREE.CylinderGeometry(0.07, 0.09, 2.6, 5).translate(0, 1.3, 0), 0x6b4f30],
        [new THREE.BoxGeometry(1.0, 0.18, 0.05).translate(0.45, 0, 0).rotateY(0.4).translate(0, 2.3, 0), 0x9b8158],
        [new THREE.BoxGeometry(0.85, 0.16, 0.05).translate(0.4, 0, 0).rotateY(-2.2).translate(0, 2.0, 0), 0x8a7350],
      ]);
      // a hitching post with its cross-rail
      const hitchGeo = mergeColored([
        [new THREE.CylinderGeometry(0.07, 0.09, 1.1, 5).translate(0, 0.55, 0), 0x5e442c],
        [new THREE.CylinderGeometry(0.05, 0.05, 0.9, 4).rotateZ(Math.PI / 2).translate(0, 1.0, 0), 0x6b4f30],
      ]);
      // a stone horse-trough, the water dark within
      const troughGeo = mergeColored([
        [new THREE.BoxGeometry(1.7, 0.5, 0.75).translate(0, 0.25, 0), 0x99917f],
        [new THREE.BoxGeometry(1.5, 0.06, 0.55).translate(0, 0.52, 0), 0x4e6664],
      ]);
      // a bee skep: coiled straw in a tapering stack, the entrance at its foot
      const skepGeo = mergeColored([
        [new THREE.CylinderGeometry(0.4, 0.44, 0.22, 7).translate(0, 0.11, 0), 0xc2a35e],
        [new THREE.CylinderGeometry(0.34, 0.4, 0.2, 7).translate(0, 0.31, 0), 0xb6975a],
        [new THREE.CylinderGeometry(0.25, 0.33, 0.18, 7).translate(0, 0.49, 0), 0xc2a35e],
        [new THREE.CylinderGeometry(0.12, 0.24, 0.14, 7).translate(0, 0.63, 0), 0xb6975a],
        [new THREE.BoxGeometry(0.12, 0.08, 0.06).translate(0, 0.08, 0.42), 0x4a3a26],
      ]);
      // a lean-to shed against the side wall: two posts, a mono-pitch roof
      // sloping off the house, one boarded end, a barrel kept dry beneath
      const leanToGeo = mergeColored([
        [new THREE.BoxGeometry(0.12, 1.5, 0.12).translate(-1.0, 0.75, 0.95), 0x6b4f30],
        [new THREE.BoxGeometry(0.12, 1.5, 0.12).translate(1.0, 0.75, 0.95), 0x6b4f30],
        [new THREE.BoxGeometry(2.4, 0.07, 1.6).rotateX(0.42).translate(0, 1.75, 0.25), 0x8a7350],
        [new THREE.BoxGeometry(0.1, 1.2, 1.4).translate(-1.05, 0.6, 0.2), 0x9b8158],
        [new THREE.CylinderGeometry(0.32, 0.28, 0.6, 7).translate(0.3, 0.3, 0.2), 0x7a5a38],
      ]);
      // the privy hut out back: a plank box, tipped roof, a planked door
      const privyGeo = mergeColored([
        [new THREE.BoxGeometry(1.1, 2.0, 1.1).translate(0, 1.0, 0), 0x8a7350],
        [new THREE.BoxGeometry(1.3, 0.08, 1.3).rotateX(0.18).translate(0, 2.08, 0), 0x5e442c],
        [new THREE.BoxGeometry(0.5, 1.4, 0.06).translate(0, 0.7, 0.56), 0x5e442c],
      ]);
      // spare shingles stacked in slightly skewed courses, awaiting repairs
      const shingleGeo = mergeColored([
        [new THREE.BoxGeometry(0.9, 0.12, 0.6).translate(0, 0.06, 0), 0x8a7350],
        [new THREE.BoxGeometry(0.85, 0.12, 0.55).rotateY(0.12).translate(0.02, 0.18, 0.02), 0x7a6448],
        [new THREE.BoxGeometry(0.8, 0.12, 0.5).rotateY(-0.1).translate(-0.03, 0.3, 0), 0x8a7350],
      ]);
      // a wattle fence section gone to ruin: one post askew, the rail down
      const fenceBrokenGeo = mergeColored([
        [new THREE.BoxGeometry(0.08, 0.7, 0.08).translate(-0.9, 0.35, 0), 0x6b4f30],
        [new THREE.BoxGeometry(0.08, 0.5, 0.08).rotateZ(0.5).translate(0.85, 0.22, 0), 0x6b4f30],
        [new THREE.BoxGeometry(1.9, 0.06, 0.05).rotateZ(-0.16).translate(0, 0.5, 0), 0x7d5e3a],
        [new THREE.BoxGeometry(1.1, 0.06, 0.05).rotateZ(0.9).translate(0.45, 0.2, 0.1), 0x8a7350],
      ]);
      // the abandoned yard's bramble: dark tangled clumps, dead canes through
      const brambleGeo = mergeColored([
        [lump(0.6).scale(1.4, 0.7, 1.2).translate(0, 0.3, 0), 0x4a5c34],
        [lump(0.4).translate(0.6, 0.25, 0.3), 0x52643a],
        [lump(0.35).translate(-0.55, 0.22, -0.2), 0x44542f],
        [new THREE.CylinderGeometry(0.02, 0.03, 0.9, 4).rotateZ(0.7).translate(0.3, 0.6, 0), 0x5e4a30],
        [new THREE.CylinderGeometry(0.02, 0.03, 0.8, 4).rotateZ(-0.5).rotateY(1.2).translate(-0.2, 0.55, 0.2), 0x5e4a30],
      ]);
      // the midden by the back door: pale heaps of oyster shell and bone
      const middenGeo = mergeColored([
        [lump(0.4).scale(1.3, 0.5, 1.1).translate(0, 0.14, 0), 0xd8cfb8],
        [lump(0.22).translate(0.4, 0.1, 0.25), 0xc9bfa4],
        [lump(0.16).translate(-0.35, 0.08, -0.2), 0xe2dac4],
        [new THREE.BoxGeometry(0.3, 0.03, 0.18).rotateY(0.8).translate(0.6, 0.02, -0.3), 0xb8ad90],
      ]);
      // a barrel broken down: the sawn half-tub, sprung staves on the ground
      const brokenBarrelGeo = mergeColored([
        [new THREE.CylinderGeometry(0.48, 0.42, 0.45, 8).translate(0, 0.22, 0), 0x6b4a2e],
        [new THREE.CylinderGeometry(0.4, 0.4, 0.04, 8).translate(0, 0.42, 0), 0x33281b],
        [new THREE.BoxGeometry(0.85, 0.03, 0.12).rotateY(0.5).translate(0.55, 0.02, 0.35), 0x7a5636],
        [new THREE.BoxGeometry(0.8, 0.03, 0.11).rotateY(-0.7).translate(-0.5, 0.02, 0.4), 0x5e402a],
      ]);
      // a sprung cartwheel, a spoke gone, left leaning against the wall
      const wheelGeo = (() => {
        const parts = [[new THREE.TorusGeometry(0.5, 0.05, 5, 12), 0x6b4a2e]];
        for (let si3 = 0; si3 < 3; si3++) {   // three spokes where four should be
          parts.push([new THREE.BoxGeometry(0.06, 0.92, 0.05).rotateZ(si3 * 1.05 + 0.3), 0x8a7350]);
        }
        parts.push([new THREE.CylinderGeometry(0.09, 0.09, 0.1, 6).rotateX(Math.PI / 2), 0x474a50]);
        const g3 = mergeColored(parts);
        g3.rotateX(-0.3);                     // leaning back against the wall
        g3.translate(0, 0.52, 0);
        return g3;
      })();
      // pottery shards swept into the alley, the pot's base on its side
      const shardsGeo = mergeColored([
        [new THREE.BoxGeometry(0.22, 0.03, 0.16).rotateY(0.7).translate(0.1, 0.02, 0), 0xa05838],
        [new THREE.BoxGeometry(0.18, 0.03, 0.13).rotateY(-0.9).translate(-0.25, 0.02, 0.2), 0x8a4a30],
        [new THREE.BoxGeometry(0.15, 0.03, 0.1).rotateY(1.8).translate(0.3, 0.02, 0.3), 0xb06a44],
        [new THREE.BoxGeometry(0.2, 0.03, 0.14).rotateY(0.2).translate(-0.1, 0.02, -0.3), 0x96503a],
        [new THREE.CylinderGeometry(0.12, 0.09, 0.16, 6).rotateZ(1.2).translate(0.05, 0.06, -0.15), 0xa05838],
      ]);
      // a mooring ring on its base plate, bolted at the pier head
      const mooringGeo = mergeColored([
        [new THREE.CylinderGeometry(0.16, 0.18, 0.08, 6).translate(0, 0.04, 0), IRON],
        [new THREE.TorusGeometry(0.14, 0.035, 5, 10).rotateY(Math.PI / 2).rotateZ(0.5).translate(0, 0.16, 0), IRON],
      ]);
      // a firewood bundle dropped by the door: short logs in two courses
      const doorWoodGeo = mergeColored([
        [new THREE.CylinderGeometry(0.07, 0.07, 0.8, 5).rotateZ(Math.PI / 2).translate(0, 0.07, 0), 0x6b4a2e],
        [new THREE.CylinderGeometry(0.07, 0.07, 0.8, 5).rotateZ(Math.PI / 2).translate(0, 0.07, 0.15), 0x7a5636],
        [new THREE.CylinderGeometry(0.07, 0.07, 0.8, 5).rotateZ(Math.PI / 2).translate(0, 0.07, -0.14), 0x5e402a],
        [new THREE.CylinderGeometry(0.07, 0.07, 0.78, 5).rotateZ(Math.PI / 2).translate(0.02, 0.2, 0.01), 0x6b4a2e],
        [new THREE.CylinderGeometry(0.07, 0.07, 0.76, 5).rotateZ(Math.PI / 2).translate(-0.02, 0.2, -0.13), 0x7a5636],
      ]);
      // the iron boot-scraper beside the doorstep: two posts and a blade
      const bootScrapeGeo = mergeColored([
        [new THREE.BoxGeometry(0.05, 0.22, 0.05).translate(-0.14, 0.11, 0), IRON],
        [new THREE.BoxGeometry(0.05, 0.22, 0.05).translate(0.14, 0.11, 0), IRON],
        [new THREE.BoxGeometry(0.3, 0.04, 0.02).translate(0, 0.2, 0), IRON],
      ]);
      // a pair of shutters propped open beside a casement, painted green —
      // hinged at the window jambs, swung out toward the street
      const shutterGeo = mergeColored([
        [new THREE.BoxGeometry(0.5, 1.1, 0.06).translate(0.25, 0, 0).rotateY(-0.7).translate(0.55, 0, 0.04), 0x5e6e54],
        [new THREE.BoxGeometry(0.5, 1.1, 0.06).translate(-0.25, 0, 0).rotateY(0.7).translate(-0.55, 0, 0.04), 0x5e6e54],
      ]);
      // a small fruit tree for the walled yard: a short trunk, two leaf
      // lobes, ripe fruit studded through the crown
      const fruitTreeGeo = mergeColored([
        [new THREE.CylinderGeometry(0.09, 0.13, 1.1, 5).translate(0, 0.55, 0), 0x6b4f30],
        [lump(0.75).scale(1.1, 0.85, 1.05).translate(-0.15, 1.5, 0), 0x6f8a42],
        [lump(0.55).scale(1, 0.8, 0.95).translate(0.45, 1.25, 0.15), 0x7f9a4a],
        [lump(0.07).translate(0.2, 1.6, 0.45), 0xc9842f],
        [lump(0.06).translate(-0.45, 1.35, 0.3), 0xb05030],
        [lump(0.06).translate(0.55, 1.05, -0.25), 0xc9842f],
      ]);
      // a rope coil dropped over a bollard: two stacked rings of line
      const ropeCoilGeo = mergeColored([
        [new THREE.TorusGeometry(0.2, 0.06, 5, 10).rotateX(Math.PI / 2), 0x8a7350],
        [new THREE.TorusGeometry(0.17, 0.05, 5, 10).rotateX(Math.PI / 2).translate(0.02, 0.09, 0), 0x9b8158],
      ]);
      // the careened hull on the beach: rolled onto her bilge, keel up to
      // the weather, propped by three timber shores; the carpenter's
      // sawhorse, its plank, and a spare board dropped on the sand
      const careenParts = [
        [lump(1).scale(2.7, 0.8, 1.0).translate(0, 0.8, 0).rotateX(1.05).translate(0, 0.45, 0), 0x7a5a38],
        [new THREE.BoxGeometry(4.4, 0.14, 0.2).translate(0, 1.66, 0).rotateX(1.05).translate(0, 0.45, 0), 0x5e442c],
      ];
      for (const [sx3, st3] of [[-1.5, 0.45], [0.1, 0.55], [1.5, 0.45]]) {
        careenParts.push([new THREE.CylinderGeometry(0.07, 0.09, 2.1, 5)
          .translate(0, 1.05, 0).rotateX(-st3).translate(sx3, 0, 2.2), 0x6b4f30]);
      }
      careenParts.push([new THREE.BoxGeometry(0.12, 0.85, 0.6).rotateZ(0.08).translate(-2.6, 0.42, -2.0), 0x5e442c]);
      careenParts.push([new THREE.BoxGeometry(0.12, 0.85, 0.6).rotateZ(-0.08).translate(-1.1, 0.42, -2.0), 0x5e442c]);
      careenParts.push([new THREE.BoxGeometry(2.6, 0.08, 0.34).translate(-1.85, 0.88, -2.0), 0x9b8158]);
      careenParts.push([new THREE.BoxGeometry(1.8, 0.05, 0.3).rotateY(0.4).translate(-2.4, 0.03, -0.9), 0x8a7350]);
      const careenGeo = mergeColored(careenParts);
      // hearth smoke: three still grey puffs rising in a slight S, their
      // alpha thinning with height (RGBA vertex colours, no animation)
      const smokeGeo = (() => {
        const puffs = [[0, 0.4, 0, 0.5, 0.5], [0.32, 1.25, 0.12, 0.42, 0.34], [-0.18, 2.05, -0.1, 0.36, 0.18]];
        const parts = puffs.map(([px2, py2, pz2, r2]) => lump(r2).translate(px2, py2, pz2));
        let vn2 = 0;
        for (const p of parts) vn2 += p.attributes.position.count;
        const pos2 = new Float32Array(vn2 * 3), nor2 = new Float32Array(vn2 * 3), col2 = new Float32Array(vn2 * 4);
        const idx2 = [];
        let vo2 = 0;
        parts.forEach((pg, pi) => {
          const al = puffs[pi][4], p = pg.attributes.position, nm = pg.attributes.normal;
          for (let i = 0; i < p.count; i++) {
            pos2[(vo2 + i) * 3] = p.getX(i); pos2[(vo2 + i) * 3 + 1] = p.getY(i); pos2[(vo2 + i) * 3 + 2] = p.getZ(i);
            nor2[(vo2 + i) * 3] = nm.getX(i); nor2[(vo2 + i) * 3 + 1] = nm.getY(i); nor2[(vo2 + i) * 3 + 2] = nm.getZ(i);
            col2[(vo2 + i) * 4] = 0.62; col2[(vo2 + i) * 4 + 1] = 0.62;
            col2[(vo2 + i) * 4 + 2] = 0.65; col2[(vo2 + i) * 4 + 3] = al;
          }
          if (pg.index) for (let i = 0; i < pg.index.count; i++) idx2.push(vo2 + pg.index.getX(i));
          else for (let i = 0; i < p.count; i++) idx2.push(vo2 + i);
          vo2 += p.count;
        });
        const g2 = new THREE.BufferGeometry();
        g2.setAttribute('position', new THREE.BufferAttribute(pos2, 3));
        g2.setAttribute('normal', new THREE.BufferAttribute(nor2, 3));
        g2.setAttribute('color', new THREE.BufferAttribute(col2, 4));
        g2.setIndex(idx2);
        return g2;
      })();
      const smokeMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
      for (const { h, end, lit } of chimneys) {  // a quarter of the hearths are lit —
        const r2 = dhash(h.lngLat[0], h.lngLat[1], 81);
        if (!lit && r2 > 0.27) continue;         // but forge and taproom always smoke
        const sc2 = 0.8 + Math.min(r2, 0.27) * 1.5;
        smokeS.push({ harbor: h.harbor,
          m: groundMatrix(h.lngLat, h.ang)
            .multiply(new THREE.Matrix4().makeTranslation(end * (h.w / 2 - 0.7), h.hw + h.hr + 1.2, 0))
            .multiply(new THREE.Matrix4().makeScale(sc2, sc2, sc2)) });
      }
      // a fishing net drying against the wall: a dark lattice, alpha-cut
      const netMat = new THREE.MeshLambertMaterial({
        map: canvasTex('net', 64, 64, (x) => {
          x.clearRect(0, 0, 64, 64);
          x.strokeStyle = 'rgba(40,34,24,0.95)';
          x.lineWidth = 1.6;
          for (let i = -64; i < 64; i += 8) {
            x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 64, 64); x.stroke();
            x.beginPath(); x.moveTo(i + 64, 0); x.lineTo(i, 64); x.stroke();
          }
        }),
        transparent: true, alphaTest: 0.25, side: THREE.DoubleSide,
      });
      const netGeo = new THREE.PlaneGeometry(2.3, 1.8).rotateX(-0.24).translate(0, 0.92, 0.2);
      const clutterMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      for (const s of timberS) yardWoodS.push(s);   // wharf timber shares the woodpile draw
      addInst(shrubGeo, clutterMat, yardShrubS, { lod: true });
      addInst(gardenGeo, clutterMat, yardGardenS, { lod: true });
      addInst(woodpileGeo, clutterMat, yardWoodS, { lod: true });
      addInst(benchGeo, clutterMat, yardBenchS, { lod: true });
      addInst(plankLeanGeo, clutterMat, yardPlankS, { lod: true });
      addInst(scrapsGeo, clutterMat, yardScrapS, { lod: true });
      addInst(yardBarrelGeo, woodMat, yardBarrelS, { lod: true });
      addInst(flowerBoxGeo, clutterMat, yardFlowerS, { lod: true });
      addInst(tavernGeo, clutterMat, tavernS, { lod: true });
      addInst(rackGeo, clutterMat, fishRackS, { lod: true });
      addInst(dinghyGeo, clutterMat, dinghyS, { lod: true });
      addInst(skiffGeo, clutterMat, skiffS, { lod: true });
      addInst(headGearGeo, clutterMat, headGearS, { lod: true });
      addInst(sackGeo, clutterMat, sackS, { lod: true });
      addInst(anchorGeo, clutterMat, anchorS, { lod: true });
      addInst(cartGeo, clutterMat, cartS, { lod: true });
      addInst(clothesGeo, clutterMat, clothesS, { lod: true });
      addInst(netGeo, netMat, netS, { lod: true });
      addInst(shrubGeo2, clutterMat, yardShrub2S, { lod: true });
      addInst(flowerBoxGeo2, clutterMat, yardFlower2S, { lod: true });
      addInst(stallAGeo, clutterMat, stallAS, { lod: true });
      addInst(stallBGeo, clutterMat, stallBS, { lod: true });
      addInst(tripodGeo, clutterMat, tripodS, { lod: true });
      addInst(signpostGeo, clutterMat, signpostS, { lod: true });
      addInst(hitchGeo, clutterMat, hitchS, { lod: true });
      addInst(troughGeo, clutterMat, troughS, { lod: true });
      addInst(skepGeo, clutterMat, skepS, { lod: true });
      addInst(leanToGeo, clutterMat, leanToS, { lod: true });
      addInst(privyGeo, clutterMat, privyS, { lod: true });
      addInst(shingleGeo, clutterMat, shingleS, { lod: true });
      addInst(wallGeo, stoneMat, boundaryS, { lod: true });
      addInst(fenceBrokenGeo, clutterMat, fenceBrokenS, { lod: true });
      addInst(brambleGeo, clutterMat, brambleS, { lod: true });
      addInst(middenGeo, clutterMat, middenS, { lod: true });
      addInst(brokenBarrelGeo, clutterMat, brokenBarrelS, { lod: true });
      addInst(wheelGeo, clutterMat, wheelS, { lod: true });
      addInst(shardsGeo, clutterMat, shardS, { lod: true });
      addInst(mooringGeo, clutterMat, mooringS, { lod: true });
      addInst(doorWoodGeo, clutterMat, doorWoodS, { lod: true });
      addInst(bootScrapeGeo, clutterMat, bootScrapeS, { lod: true });
      addInst(shutterGeo, clutterMat, shutterS, { lod: true });
      addInst(fruitTreeGeo, clutterMat, fruitTreeS, { lod: true });
      addInst(ropeCoilGeo, clutterMat, ropeCoilS, { lod: true });
      addInst(new THREE.BoxGeometry(0.95, 0.6, 0.12), woodMat, fenderS, { lod: true });
      addInst(careenGeo, clutterMat, careenS, { lod: true });
      // (smokeS flushes after the landmark pass below, so the building
      //  factories can emit smoke into the same shared instanced draw)
      stats.clutter = yardShrubS.length + yardGardenS.length + yardWoodS.length + yardBenchS.length
        + yardPlankS.length + yardScrapS.length + yardBarrelS.length
        + yardFlowerS.length + tavernS.length + fishRackS.length + dinghyS.length
        + sackS.length + anchorS.length + cartS.length + skiffS.length
        + headGearS.length + clothesS.length + netS.length
        + yardShrub2S.length + yardFlower2S.length + hitchS.length + skepS.length
        + signpostS.length + troughS.length;
      stats.stalls = stallAS.length + stallBS.length + tripodS.length;
      stats.filler = leanToS.length + privyS.length + shingleS.length + boundaryS.length;
      stats.debris = middenS.length + brokenBarrelS.length + wheelS.length
        + shardS.length + brambleS.length + fenceBrokenS.length;
      stats.moorings = mooringS.length;
      stats.streetLife = doorWoodS.length + bootScrapeS.length + shutterS.length;
      stats.fruitTrees = fruitTreeS.length;
      stats.careened = careenS.length;
      stats.wharfPolish = ropeCoilS.length + fenderS.length;

      /* ===== the forts: battered masonry, merlons, garitas, guns ===== */

      const rampartGeo = fortWallGeo();
      const wallsSpec = [], merlonSpec = [], cannonSpec = [], garitaSpec = [], towerSpec = [];
      const WALL_H = 7.5;
      for (const f of S.forts) {
        const style = HARBOR_STYLE[f.properties.harbor] || 'english';
        const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
        for (const poly of polys) {
          const ring = poly[0];
          if (!ring || ring.length < 4) continue;
          const { clon, clat, mx, pts } = ringMeters(ring);
          const harbor = f.properties.harbor;
          anchorAt(harbor, [clon, clat]);
          const toLL = (px, py) => [clon + px / mx, clat + py / M_PER_DEG_LAT];
          // the parade ground inside the walls
          const court = new THREE.Mesh(polyGeo(pts, 0.3, 10), plazaMat);
          court.matrixAutoUpdate = false;
          court.matrix.copy(groundMatrix([clon, clat], 0));
          group.add(court);
          for (let i = 0; i < pts.length - 1; i++) {
            const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
            const ex = bx - ax, ey = by - ay;
            const len = Math.hypot(ex, ey);
            if (len < 1.5) continue;
            const ang = Math.atan2(ey, ex) / D2RAD;
            const midx = (ax + bx) / 2, midy = (ay + by) / 2;
            const outL = Math.hypot(midx, midy) || 1;
            const ox = midx / outL, oy = midy / outL;     // roughly outward
            wallsSpec.push({
              harbor,
              m: groundMatrix(toLL(midx, midy), ang).multiply(localM(len + 1.4, WALL_H, 1, 0)),
            });
            const ux = ex / len, uy = ey / len;
            for (let mD = 1.4; mD < len; mD += 2.8) {     // merlons along the outer lip
              const px = ax + ux * mD;
              const py = ay + uy * mD;
              merlonSpec.push({
                harbor,
                m: groundMatrix(toLL(px + ox * 1.45, py + oy * 1.45), ang).multiply(localM(1.3, 1.0, 0.6, WALL_H)),
              });
            }
            for (let gD = 7; gD < len; gD += 14) {        // guns run out over the parapet
              const px = ax + ux * gD, py = ay + uy * gD;
              cannonSpec.push({
                harbor,
                m: groundMatrix(toLL(px + ox * 1.0, py + oy * 1.0), Math.atan2(oy, ox) / D2RAD),
              });
            }
          }
          for (let i = 0; i < pts.length - 1; i++) {      // every salient gets its watch
            const [vx, vy] = pts[i];
            const vL = Math.hypot(vx, vy) || 1;
            const spec = { harbor, ll: toLL(vx + (vx / vL) * 0.8, vy + (vy / vL) * 0.8) };
            if (style === 'spanish') garitaSpec.push(spec);
            else towerSpec.push(spec);
          }
          // the ensign over the gate
          const pole = new THREE.Group();
          const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 17, 5), m.mast);
          mast.position.y = 8.5;
          pole.add(mast);
          const flag = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 3.2), m.flag);
          flag.position.set(-2.9, 15.2, 0);
          flag.userData.flutter = true;
          pole.add(flag);
          pole.matrixAutoUpdate = false;
          pole.matrix.copy(groundMatrix([clon, clat], 0));
          group.add(pole);
        }
      }
      stats.fortWalls = wallsSpec.length;
      addInst(rampartGeo, masonMat, wallsSpec);
      addInst(wallGeo, masonMat, merlonSpec);
      const gunGeo = new THREE.CylinderGeometry(0.18, 0.3, 3.4, 6)
        .rotateZ(-Math.PI / 2 + 0.05).translate(0.8, WALL_H + 0.45, 0); // muzzle out over the parapet
      addInst(gunGeo, ironGunMat, cannonSpec);
      const liftLL = (s, y) => ({
        harbor: s.harbor,
        m: groundMatrix(s.ll, 0).multiply(new THREE.Matrix4().makeTranslation(0, y, 0)),
      });
      // Spanish sentry boxes corbelled at each salient; round towers for the rest
      addInst(new THREE.CylinderGeometry(1.0, 0.8, 2.4, 8), masonMat,
        garitaSpec.map((s) => liftLL(s, WALL_H + 1.2)));
      addInst(new THREE.ConeGeometry(1.25, 1.5, 8), new THREE.MeshLambertMaterial({ color: 0xb35a36 }),
        garitaSpec.map((s) => liftLL(s, WALL_H + 3.1)));
      addInst(new THREE.CylinderGeometry(1.6, 2.0, WALL_H + 2.2, 8), masonMat,
        towerSpec.map((s) => liftLL(s, (WALL_H + 2.2) / 2)));

      /* ===== churches, halls, batteries, the gallows ===== */

      const churchWallMat = new THREE.MeshLambertMaterial({ color: 0xf0e9d6, map: facadeTexture('spanish', 1) });
      const leadMat = new THREE.MeshLambertMaterial({ color: 0x7d8388 });
      const tileMat = new THREE.MeshLambertMaterial({ color: 0xb35a36, map: roofTexture('spanish'), side: THREE.DoubleSide });
      const shingleMat = new THREE.MeshLambertMaterial({ color: 0x6e5a45, map: roofTexture('english'), side: THREE.DoubleSide });

      const box = (g, mat, sx, sy, sz, x, y, z) => {
        const mesh = new THREE.Mesh(wallGeo, mat);
        mesh.scale.set(sx, sy, sz);
        mesh.position.set(x, y || 0, z || 0);
        g.add(mesh);
        return mesh;
      };
      const roofOn = (g, kind, mat, sx, sy, sz, x, y) => {
        const mesh = new THREE.Mesh(roofGeos[kind], mat);
        mesh.scale.set(sx + 1, sy, sz + 1);
        mesh.position.set(x || 0, y, 0);
        g.add(mesh);
      };
      const buttresses = (g, mat, len, width, h, x0) => {
        for (let i = 0; i < 4; i++) {
          const bx = (x0 || 0) + (i / 3 - 0.5) * len * 0.78;
          for (const side of [-1, 1]) {
            box(g, mat, 0.8, h, 0.9, bx, 0, side * (width / 2 + 0.4));
          }
        }
      };

      /* The building factories live in web/js/models/*.js, registered on
         window.cartaBuildingModels. Each factory takes (ctx, spec) and
         returns a THREE.Group in local metres, origin at ground, +z front.
         ctx hands them harbortown's materials, painted textures, geometry
         helpers and emit hooks, so their output is indistinguishable from
         the geometry that used to be built inline here. */
      const ctx = {
        THREE,
        mats: {
          stoneMat, masonMat, woodMat, brickMat,
          churchWallMat, leadMat, tileMat, shingleMat,
          clutterMat, smokeMat,
          ink: inkMat, wale: m.wale, port: ironGunMat, flag: m.flag, mast: m.mast,
        },
        facadeTexture,
        roofTexture,
        canvasTex,
        box,
        roofOn,
        buttresses,
        mergeColored,
        lump,
        dhash,
        style: (harbor) => HARBOR_STYLE[harbor] || 'english',
        emit: {
          // hearth/forge smoke joins the town's shared instanced draw;
          // m is an absolute ground matrix (groundMatrix-derived)
          smoke: (harbor, mAbs) => { smokeS.push({ harbor, m: mAbs }); },
          tree: () => {},   // TODO(step 3): wire to plantTree
          grass: () => {},  // TODO(step 3): wire to grassSpec
        },
      };

      // Landmarks read above the rooftops: a touch over true scale, as the
      // chartmakers drew the buildings that mattered.
      const LANDMARK_SCALE = { church: 1.3, building: 1.2 };
      const reg = window.cartaBuildingModels;

      /* trade props from the shared kit registry. Kits arrive with the
         model files and may be missing — every access is guarded; a
         missing kit simply leaves the trade unpropped. Kit contract:
         fn(ctx) → vertex-coloured BufferGeometry. */
      const flushKit = (name, specs) => {
        if (!specs.length) return;
        let kitG = null;
        try {
          if (reg && reg.kits && typeof reg.kits[name] === 'function') kitG = reg.kits[name](ctx);
        } catch (err) {
          console.warn('harbortown: kit "' + name + '" failed', err);
          kitG = null;
        }
        if (!kitG || !kitG.isBufferGeometry) return;
        addInst(kitG, clutterMat, specs, { lod: true });
      };
      flushKit('lantern', lanternS);
      flushKit('forgeYard', forgeYardS);
      flushKit('hoistSack', hoistSackS);
      flushKit('strongbox', strongboxS);
      // ('stocks' belongs to the prison landmark alone — not flushed here)
      for (const p of S.points) {
        // the 1730 snapshot: not yet built, or already lost, stays off the chart
        if ((p.year_built || 0) > 1730) continue;
        if ((p.year_destroyed == null ? Infinity : p.year_destroyed) <= 1730) continue;
        const style = HARBOR_STYLE[p.harbor] || 'english';
        const spec = {
          ...p,
          style,
          seed: (n) => dhash(p.lngLat[0], p.lngLat[1], n),
        };
        const fallback = reg && reg.get('building');
        let factory = (reg && reg.get(p.kind)) || fallback;
        if (!factory) continue;
        let g = null;
        try {
          g = factory(ctx, spec);
        } catch (err) {
          console.warn('harbortown: factory for kind "' + p.kind + '" failed', err);
          if (fallback && factory !== fallback) {
            try { g = fallback(ctx, spec); } catch (e2) { g = null; }
          }
        }
        if (!g) continue;
        const sc = g.userData.scale || LANDMARK_SCALE[p.kind] || 1;
        const ang = g.userData.angleFromStreet
          ? nearestStreetAngle(p.harbor, p.lngLat[0], p.lngLat[1], 0) : 0;
        g.matrixAutoUpdate = false;
        g.matrix.copy(groundMatrix(p.lngLat, ang).multiply(new THREE.Matrix4().makeScale(sc, sc, sc)));
        /* the smoke convention: a factory lists puffs as local offsets in
           userData.smoke = [{x,y,z,s}]; composed with the placed matrix
           they join the town's one shared instanced smoke draw below */
        if (Array.isArray(g.userData.smoke)) {
          for (const sp of g.userData.smoke) {
            const s3 = sp.s || 1;
            smokeS.push({ harbor: p.harbor,
              m: g.matrix.clone()
                .multiply(new THREE.Matrix4().makeTranslation(sp.x || 0, sp.y || 0, sp.z || 0))
                .multiply(new THREE.Matrix4().makeScale(s3, s3, s3)) });
          }
        }
        group.add(g);
        stats.landmarks++;
      }
      addInst(smokeGeo, smokeMat, smokeS, { lod: true });
      stats.smoke = smokeS.length;

      /* ===== the land itself =====
         Sculpted relief where geography has it; the gaussian mound is
         roughened by two fixed undulations so the ridge reads as ground,
         and the slopes are coloured by height — sand, scrub, bare rock. */

      // Compact footprints read as hills; a height spread over kilometres reads
      // as nothing. Tortuga is the turtle-back mountain it is named for; Nassau
      // gets a real ridge behind the town; Havana keeps two low knolls.
      const HILLS = {
        nassau: [{ c: [-77.335, 25.0705], rx: 950, ry: 430, h: 52, rot: 8 }],
        tortuga: [{ c: [-72.787, 20.058], rx: 1150, ry: 680, h: 165, rot: 12 }],
        havana: [
          { c: [-82.337, 23.146], rx: 460, ry: 240, h: 60, rot: -28 },
          { c: [-82.341, 23.150], rx: 250, ry: 150, h: 36, rot: -10 },
        ],
        cartagena: [{ c: [-75.535, 10.4185], rx: 520, ry: 230, h: 85, rot: -30 }],
      };
      const reliefH = (h) => Math.max(110, h * 4.5);
      const RIM = Math.exp(-2.6);
      const heightAt = (u, v) => {
        const r2 = u * u + v * v;
        const base = (Math.exp(-r2 * 2.6) - RIM) / (1 - RIM);
        const rough = 1 + 0.16 * Math.sin(u * 6.3 + v * 2.1 + 1.7) + 0.1 * Math.sin(u * 2.9 - v * 7.7 + 0.6);
        return Math.max(0, base * rough);
      };
      const C_SAND = new THREE.Color(0.83, 0.77, 0.6);
      const C_SCRUB = new THREE.Color(0.58, 0.61, 0.42);
      const C_ROCK = new THREE.Color(0.56, 0.49, 0.4);
      // Opaque: the slopes must not be see-through. The base no longer needs
      // the old alpha skirt to blend into parchment — the draped canopy now
      // covers it.
      const hillMat = new THREE.MeshLambertMaterial({ map: hillTexture(), vertexColors: true });
      // Legacy mercator only: the diorama's terrain mesh owns the relief.
      if (!frame) for (const [hillHarbor, hills] of Object.entries(HILLS)) {
        for (const hill of hills) {
          anchorAt(hillHarbor, hill.c);
          const geo = new THREE.PlaneGeometry(2, 2, 56, 40);
          geo.rotateX(-Math.PI / 2);
          const pos = geo.attributes.position;
          const cols = new Float32Array(pos.count * 3);
          const tmp = new THREE.Color();
          for (let i = 0; i < pos.count; i++) {
            const u = pos.getX(i), v = -pos.getZ(i);
            const y = heightAt(u, v);
            pos.setY(i, y);
            if (y < 0.4) tmp.copy(C_SAND).lerp(C_SCRUB, y / 0.4);
            else tmp.copy(C_SCRUB).lerp(C_ROCK, (y - 0.4) / 0.6);
            cols[i * 3] = tmp.r; cols[i * 3 + 1] = tmp.g; cols[i * 3 + 2] = tmp.b;
          }
          geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
          geo.computeVertexNormals();
          const mesh = new THREE.Mesh(geo, hillMat);
          mesh.matrixAutoUpdate = false;
          const H = reliefH(hill.h);
          mesh.matrix.copy(groundMatrix(hill.c, hill.rot)
            .multiply(localM(hill.rx, H, hill.ry, 0)));
          group.add(mesh);
          // growth on the slopes
          const rotR = hill.rot * D2RAD;
          const mx = M_PER_DEG_LAT * Math.cos(hill.c[1] * D2RAD);
          const plantOnHill = (n, yMin, yMax, cb) => {
            let placed = 0, tries = 0;
            while (placed < n && tries++ < n * 12) {
              const u = (Math.random() * 2 - 1) * 0.85, v = (Math.random() * 2 - 1) * 0.85;
              const y = heightAt(u, v);
              if (y < yMin || y > yMax) continue;
              const lx = u * hill.rx, lz = -v * hill.ry;
              const east = lx * Math.cos(rotR) + lz * Math.sin(rotR);
              const north = lx * Math.sin(rotR) - lz * Math.cos(rotR);
              cb([hill.c[0] + east / mx, hill.c[1] + north / M_PER_DEG_LAT], y * H);
              placed++;
            }
          };
          // Drape the wood up the slope: canopy tiles laid on the hill
          // surface (same u,v→world map as the mesh, lifted to its height),
          // below a bare rocky tree line — so the hill is forested, not a
          // bare elliptical patch, and the canopy climbs it continuously.
          const toHillLL = (u, v) => {
            const lx = u * hill.rx, lz = -v * hill.ry;
            const east = lx * Math.cos(rotR) + lz * Math.sin(rotR);
            const north = lx * Math.sin(rotR) - lz * Math.cos(rotR);
            return [hill.c[0] + east / mx, hill.c[1] + north / M_PER_DEG_LAT];
          };
          const wood = Math.min(1400, Math.round(hill.rx * hill.ry / 700));
          let pc = 0, ptries = 0;
          while (pc < wood && ptries++ < wood * 8) {
            const u = Math.random() * 2 - 1, v = Math.random() * 2 - 1;
            if (u * u + v * v > 1.3) continue;
            const y = heightAt(u, v);
            if (y < 0.03 || y > 0.82) continue;          // above the shore, below bare summit
            const sz = 11 + Math.random() * 9;
            groundSpec.push({
              harbor: hillHarbor,
              m: groundMatrix(toHillLL(u, v), Math.random() * 360)
                .multiply(new THREE.Matrix4().makeTranslation(0, y * H, 0))
                .multiply(localM(sz, 1, sz, 0.05)),
              color: CANOPY_TINTS[(Math.random() * CANOPY_TINTS.length) | 0],
            });
            pc++;
          }
          const want = Math.min(160, 40 + Math.round(hill.rx / 30));
          plantOnHill(want, 0.12, 0.6, (ll, hgt) => {           // palms low
            treeField.push({ lngLat: ll, kind: 'palm', scale: 0.8 + Math.random() * 0.5, tint: Math.random(), y: hgt });
          });
          plantOnHill(want * 3, 0.06, 0.82, (ll, hgt) => {      // broadleaf & scrub up the slope
            treeField.push({
              lngLat: ll, kind: Math.random() < 0.5 ? 'leaf' : 'scrub',
              scale: 0.7 + Math.random() * 0.9, tint: Math.random(), y: hgt,
            });
          });
        }
      }

      /* ===== the countryside, as a Thomas cluster process =====
         The survey covers the town; everything beyond was bare parchment.
         Real forests are not scattered evenly — ecology models them as a
         Poisson cluster (Thomas) process: cluster centres dropped at random,
         then trees laid around each centre with a Gaussian falloff (σ), so
         growth clumps into groves with clearings between, exactly as seed
         dispersal makes it. Each grove takes a dominant species, so palm
         groves and broadleaf stands read as stands, not a salad. Cover
         thins to bare sand within ~35 m of the waterline and keeps clear of
         the town grid and the sculpted hills (which grow their own). */
      for (const f of S.lands) {
        const harbor = f.properties.harbor;
        const style = HARBOR_STYLE[harbor] || 'english';
        const rings = f.geometry.type === 'MultiPolygon'
          ? f.geometry.coordinates.map((p) => p[0]) : [f.geometry.coordinates[0]];
        for (const ring of rings) {
          if (!ring || ring.length < 4) continue;
          const { clon, clat, mx, pts } = ringMeters(ring);
          let area = 0;
          for (let i = 0; i < pts.length - 1; i++) {
            area += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
          }
          area = Math.abs(area) / 2;
          if (area < 5000) continue;
          anchorAt(harbor, [clon, clat]);
          const toL = ([x, y]) => [(x - clon) * mx, (y - clat) * M_PER_DEG_LAT];
          const blocksL = S.blocks.filter((b) => b.properties.harbor === harbor)
            .map((b) => b.geometry.coordinates[0].map(toL));
          const greensL = S.greens.filter((g) => g.properties.harbor === harbor)
            .map((g) => g.geometry.coordinates[0].map(toL));
          const streetsL = S.streets.filter((st) => st.properties.harbor === harbor)
            .map((st) => st.geometry.coordinates.map(toL));
          // hill skirts get a wobbled boundary — a clean ellipse of bare
          // ground never occurs in nature, so harmonics ruffle its edge
          const hillsL = (HILLS[harbor] || []).map((h, i) => ({
            c: toL(h.c), rx: h.rx, ry: h.ry,
            p1: i * 1.7 + 0.5, p2: i * 2.9 + 1.3,
          }));
          // the hill carries its own draped canopy; the flat canopy stops at
          // its skirt. A small overlap (0.95) avoids a bare ring at the seam.
          // In the diorama the hills are real terrain, so the wood climbs them;
          // only the legacy mercator hill-mounds need their skirt kept clear.
          const offHill = frame ? () => true : (px, py) => {
            for (const h of hillsL) {
              const ang = Math.atan2(py - h.c[1], px - h.c[0]);
              const wob = 1.0 + 0.30 * Math.sin(ang * 3 + h.p1) + 0.17 * Math.sin(ang * 5 + h.p2);
              const dx = (px - h.c[0]) / h.rx, dy = (py - h.c[1]) / h.ry;
              if (dx * dx + dy * dy < 0.95 * wob) return false;
            }
            return true;
          };
          const clear = (px, py) => {
            if (distToLine(pts, px, py) < 35 || !insideRing(pts, px, py)) return false;
            for (const b of blocksL) if (insideRing(b, px, py)) return false;
            for (const g of greensL) if (insideRing(g, px, py)) return false;
            for (const st of streetsL) { if (distToLine(st, px, py) < 16) return false; }
            return offHill(px, py);
          };
          let bx0 = Infinity, bx1 = -Infinity, by0 = Infinity, by1 = -Infinity;
          for (const [px, py] of pts) {
            bx0 = Math.min(bx0, px); bx1 = Math.max(bx1, px);
            by0 = Math.min(by0, py); by1 = Math.max(by1, py);
          }

          /* Continuous canopy ground — the *countryside* is covered, not
             stippled. A grid of green tiles fills every eligible cell beyond
             the town, so there are no bare patches; the cover stops at the
             beach buffer (revealing bare-sand shore) and is held off the
             built-up grid (which keeps its engraved streets and yards) and
             the sculpted hills (which carry their own growth). */
          // distance from a point to the canopy's *edge* — whichever boundary
          // (shore, town, or hill skirt) is nearest. Tiles taper and pale
          // toward that edge, so the canopy thins and lightens to sand instead
          // of ending on a hard jagged line.
          const townEdge = (px, py) => {
            let d = Infinity;
            for (const st of streetsL) d = Math.min(d, distToLine(st, px, py) - 24);
            for (const b of blocksL) if (insideRing(b, px, py)) return -1;
            for (const g of greensL) if (insideRing(g, px, py)) return -1;
            return d;
          };
          const step = Math.max(13, Math.sqrt(area / 7200));
          // finer half-step grid so small edge tiles can pack in
          // (diorama: terrain owns the ground surface — no flat canopy tiles)
          if (!frame) for (let gx = bx0; gx < bx1; gx += step) {
            for (let gy = by0; gy < by1; gy += step) {
              const px = gx + (Math.random() - 0.5) * step * 0.6;
              const py = gy + (Math.random() - 0.5) * step * 0.6;
              if (!insideRing(pts, px, py)) continue;
              const tEdge = townEdge(px, py);
              if (tEdge < 0 || !offHill(px, py)) continue;             // over town / on a hill
              const dSh = distToLine(pts, px, py);
              const edge = Math.min(dSh - 22, tEdge);                  // metres into the canopy
              if (edge < 0) continue;                                  // the beach / town verge
              // a soft, ragged fringe: the closer to the edge, the likelier a gap
              const depth = Math.min(1, edge / 70);
              if (Math.random() > 0.35 + depth * 0.65) continue;
              // tiles shrink toward the edge → a fine, broken margin, not a wall
              const sz = step * (0.55 + depth * 1.05);
              // green in the heart, paling to sand at the rim
              const tint = CANOPY_TINTS[(Math.random() * CANOPY_TINTS.length) | 0].clone()
                .lerp(SAND_TINT, (1 - depth) * 0.7);
              groundSpec.push({
                harbor,
                m: groundMatrix([clon + px / mx, clat + py / M_PER_DEG_LAT], Math.random() * 360)
                  .multiply(localM(sz, 1, sz, 0.05 + Math.random() * 0.06)),
                color: tint,
              });
            }
          }

          // ρ: denser groves for the diorama — one centre per ~1,500 m²,
          // each grove ~ Gaussian σ≈12 m, more members per grove
          const dense = !!frame;
          const centres = Math.min(dense ? 1300 : 650, Math.floor(area / (dense ? 1700 : 2600)));
          for (let c = 0; c < centres; c++) {
            const cx = bx0 + Math.random() * (bx1 - bx0);
            const cy = by0 + Math.random() * (by1 - by0);
            if (!insideRing(pts, cx, cy)) { continue; }
            const sigma = 8 + Math.random() * 14;                // grove radius
            const groveKind = Math.random() < (style === 'spanish' ? 0.62 : 0.32)
              ? 'palm' : (Math.random() < 0.7 ? 'leaf' : 'scrub');
            const members = (dense ? 22 : 16) + ((Math.random() * (dense ? 34 : 30)) | 0); // density of the grove
            for (let k = 0; k < members; k++) {
              // Box–Muller Gaussian offset from the centre
              const r = sigma * Math.sqrt(-2 * Math.log(1 - Math.random()));
              const th = Math.random() * Math.PI * 2;
              const px = cx + r * Math.cos(th), py = cy + r * Math.sin(th);
              if (!clear(px, py)) continue;
              const ll = [clon + px / mx, clat + py / M_PER_DEG_LAT];
              // mostly the grove's species, a few interlopers
              const kind = Math.random() < 0.82 ? groveKind
                : (Math.random() < 0.5 ? 'leaf' : 'scrub');
              treeField.push({ lngLat: ll, kind, scale: 0.7 + Math.random() * 0.7, tint: Math.random() });
            }
          }
        }
      }

      /* ===== the canopy ground + grass, town-anchored (instanced) ===== */
      const tileGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2); // lies flat, +Y up
      addInst(tileGeo, new THREE.MeshLambertMaterial({
        map: canopyTexture(), vertexColors: false, side: THREE.DoubleSide,
      }), groundSpec);
      addInst(new THREE.ConeGeometry(0.4, 0.8, 4).translate(0, 0.4, 0),
        new THREE.MeshLambertMaterial({ color: 0x88965a }), grassSpec, { lod: true });
      stats.grass = grassSpec.length;
      stats.ground = groundSpec.length;
      stats.trees = treeField.length;

      return { group, lod, stats, treeField };
    },
  };
};
