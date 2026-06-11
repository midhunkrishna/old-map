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

  function groundMatrix(lngLat, angDeg) {
    const mc = maplibregl.MercatorCoordinate.fromLngLat(lngLat, 0);
    const s = mc.meterInMercatorCoordinateUnits();
    return new THREE.Matrix4()
      .makeTranslation(mc.x, mc.y, 0)
      .scale(new THREE.Vector3(s, -s, s))
      .multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2))
      .multiply(new THREE.Matrix4().makeRotationY((angDeg || 0) * D2RAD));
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

  // Facade with windows, doors, framing — painted neutral parchment; the
  // instanceColor lays on the wall tint. 192px so the casements survive
  // the close zoom the chart now allows.
  function facadeTexture(style, stories) {
    return canvasTex('facade-' + style + stories, 192, 192, (x) => {
      x.fillStyle = '#ddd2b4';
      x.fillRect(0, 0, 192, 192);
      // weathering streaks
      for (let i = 0; i < 26; i++) {
        x.fillStyle = 'rgba(120,100,70,' + (0.03 + Math.random() * 0.05) + ')';
        const sx = Math.random() * 192;
        x.fillRect(sx, Math.random() * 60, 2 + Math.random() * 5, 60 + Math.random() * 130);
      }
      const rowH = 192 / stories;
      const win = (wx, wy, ww, wh, arched) => {
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
    });
  }

  function roofTexture(style) {
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
          x.fillStyle = 'rgba(60,48,32,' + (0.06 + Math.random() * 0.1) + ')';
          x.fillRect(Math.random() * 120, Math.random() * 120, 10, 8);
        }
      }
    });
  }

  function masonryTexture() {
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
        x.fillStyle = 'rgba(60,50,34,' + (0.05 + Math.random() * 0.08) + ')';
        x.fillRect((Math.random() * 9 | 0) * 14, (Math.random() * 8 | 0) * 16, 28, 16);
      }
    }, true);
  }

  // Street cloth: u runs along the street. Packed earth, twin cart ruts,
  // gutter lines; the Spanish and Dutch get cobbles.
  function streetTexture(style) {
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
          x.fillStyle = 'rgba(90,74,50,' + (0.08 + Math.random() * 0.12) + ')';
          x.fillRect(Math.random() * 96, Math.random() * 96, 1.6, 1.6);
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
  function ribbonGeo(pts, width, y, uRep) {
    const n = pts.length;
    if (n < 2) return null;
    const pos = [], uv = [], idx = [];
    const hw = width / 2;
    let run = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const pPrev = pts[Math.max(0, i - 1)], pNext = pts[Math.min(n - 1, i + 1)];
      let dx = pNext[0] - pPrev[0], dy = pNext[1] - pPrev[1];
      const dl = Math.hypot(dx, dy) || 1;
      dx /= dl; dy /= dl;
      if (i > 0) run += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]);
      // local frame: x = east, z = -north
      pos.push(p[0] - dy * hw, y, -(p[1] + dx * hw));
      pos.push(p[0] + dy * hw, y, -(p[1] - dx * hw));
      uv.push(run / uRep, 0, run / uRep, 1);
      if (i < n - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
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
    build(S) {
      const m = shipMats;
      const group = new THREE.Group();
      const lod = [];
      const stats = { houses: 0, streets: S ? S.streets.length : 0, byGroup: {}, streets3d: 0, palms: 0, fortWalls: 0, wharves: 0 };
      if (!S) return { group, lod, stats };

      const wallGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
      const roofGeos = { gable: gableGeo(), hip: hipGeo() };
      const stoneMat = new THREE.MeshLambertMaterial({ color: 0xaa9c80 });
      const masonMat = new THREE.MeshLambertMaterial({ color: 0xfff6e6, map: masonryTexture() });
      const woodMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
      const brickMat = new THREE.MeshLambertMaterial({ color: 0x7a4434 });

      const mark = (mesh) => { mesh.userData.lod = true; mesh.visible = false; lod.push(mesh); return mesh; };

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

      /* ===== the ground: streets, plazas, canals ===== */

      const streetMats = {};
      for (const f of S.streets) {
        const cs = f.geometry.coordinates;
        if (!cs || cs.length < 2) continue;
        const style = HARBOR_STYLE[f.properties.harbor] || 'english';
        const { clon, clat, pts } = ringMeters(cs);
        anchorAt(f.properties.harbor, [clon, clat]);
        // staggered heights: crossings at one shared height z-fight,
        // flickering as depth precision shifts with zoom
        const geo = ribbonGeo(pts, STREET_W[style], 0.1 + (stats.streets3d % 5) * 0.025, 9);
        if (!geo) continue;
        if (!streetMats[style]) {
          streetMats[style] = new THREE.MeshLambertMaterial({ map: streetTexture(style) });
        }
        const mesh = new THREE.Mesh(geo, streetMats[style]);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(groundMatrix([clon, clat], 0));
        group.add(mesh);
        stats.streets3d++;
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
            bollardSpec.push(at(toLL(ax + ex * t - uy * 2.1, ay + ey * t + ux * 2.1), 1.0));
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
        crane.add(new THREE.LineSegments(stay, m.ink));
        crane.matrixAutoUpdate = false;
        crane.matrix.copy(groundMatrix(toLL(head[0], head[1]), ang).multiply(localM(1, 1, 1, 0.7)));
        group.add(crane);
      }
      addInst(new THREE.CylinderGeometry(0.22, 0.26, 1.6, 5), woodMat, pileSpec);
      addInst(new THREE.CylinderGeometry(0.14, 0.17, 0.6, 5), m.wale, bollardSpec, { lod: true });
      addInst(new THREE.CylinderGeometry(0.5, 0.42, 0.95, 8), woodMat, barrelSpec, { lod: true });
      addInst(wallGeo, plankMat, crateSpec, { lod: true });

      /* ===== the houses, in the nation's manner ===== */

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
      let total = 0;

      function pushHouse(style, harbor, lon, lat, ang, w, d) {
        perHarbor[harbor] = (perHarbor[harbor] || 0) + 1;
        if (perHarbor[harbor] > 520) return;
        const stories = pickStories(style, harbor);
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
          dormer: (style === 'english' || style === 'dutch') && stories >= 2 && Math.random() < 0.45,
          stoop: Math.random() < 0.6,
          sign: style === 'english' && stories >= 2 && Math.random() < 0.1,
        };
        (groups[style + '|' + stories] = groups[style + '|' + stories] || []).push(h);
        total++;
        if ((style === 'english' && Math.random() < 0.6) || (style === 'french' && Math.random() < 0.35)) {
          chimneys.push({ h, end: Math.random() < 0.5 ? -1 : 1 });
        }
        if (harbor === 'cartagena' && stories >= 2 && Math.random() < 0.55) {
          balconies.push(h);
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
              (streetCand[harbor] = streetCand[harbor] || []).push([
                style, harbor, clon + px / mx, clat + py / M_PER_DEG_LAT,
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
            pushHouse(style, f.properties.harbor,
              clon + px / mx, clat + py / M_PER_DEG_LAT, Math.atan2(ey, ex) / D2RAD,
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
            pushHouse(style, f.properties.harbor,
              clon + px / mx, clat + py / M_PER_DEG_LAT,
              mainAng + (Math.random() < 0.5 ? 0 : 90),
              wBase - 1 + Math.random() * 2.4, 5 + Math.random() * 2);
          }
          placed++;
        }
      }

      const dormerWallS = [], dormerRoofS = [], stoopS = [], signArmS = [], signPlateS = [];
      for (const [key, list] of Object.entries(groups)) {
        const [style, storiesStr] = key.split('|');
        const stories = +storiesStr;
        const roofKind = (style === 'spanish' || style === 'french') ? 'hip' : 'gable';
        const wallMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: facadeTexture(style, stories) });
        const roofMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: roofTexture(style), side: THREE.DoubleSide });
        const wallTints = WALL_TINTS[style].map((c) => new THREE.Color(c));
        const roofTints = ROOF_TINTS[style].map((c) => new THREE.Color(c));
        const wallS = [], plinthS = [], roofS = [];
        for (const h of list) {
          const g = groundMatrix(h.lngLat, h.ang);
          wallS.push({ harbor: h.harbor, m: g.clone().multiply(localM(h.w, h.hw, h.d, 0)), color: wallTints[h.tint] });
          plinthS.push({ harbor: h.harbor, m: g.clone().multiply(localM(h.w + 0.4, 0.55, h.d + 0.4, 0)) });
          // the deep miniature overhang: roofs sit proud of their walls
          roofS.push({ harbor: h.harbor, m: g.clone().multiply(localM(h.w + 1.0, h.hr, h.d + 1.1, h.hw)), color: roofTints[h.tint] });
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
          if (h.sign) {             // the tavern sign, hung out over the way
            const base = g.clone().multiply(new THREE.Matrix4().makeTranslation(h.w * 0.28, h.hw * 0.7, h.d / 2));
            signArmS.push({ harbor: h.harbor, m: base.clone().multiply(localM(0.12, 0.12, 1.3, 0)) });
            signPlateS.push({
              harbor: h.harbor,
              m: base.multiply(new THREE.Matrix4().makeTranslation(0, -0.55, 0.95))
                .multiply(localM(0.9, 0.7, 0.08, 0)),
            });
          }
        }
        addInst(wallGeo, wallMat, wallS);
        addInst(wallGeo, stoneMat, plinthS);
        addInst(roofGeos[roofKind], roofMat, roofS);
        stats.byGroup[key] = list.length;
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
      addInst(gunGeo, m.port, cannonSpec);
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

      function churchOf(style) {
        const g = new THREE.Group();
        if (style === 'spanish') {
          box(g, stoneMat, 17, 0.7, 9, 0);
          box(g, churchWallMat, 16, 6, 8, 0);
          buttresses(g, stoneMat, 16, 8, 3.6);
          roofOn(g, 'gable', tileMat, 16, 2.4, 8, 0, 6);
          box(g, churchWallMat, 5, 13, 5, 9.6);
          box(g, churchWallMat, 4.2, 2.8, 4.2, 9.6, 13);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(2.5, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), tileMat);
          dome.position.set(9.6, 15.8, 0);
          g.add(dome);
          box(g, m.wale, 0.18, 1.8, 0.18, 9.6, 18.3);
          box(g, m.wale, 1, 0.18, 0.18, 9.6, 18.9);
        } else if (style === 'dutch') {
          box(g, stoneMat, 17, 0.7, 8.5, 0);
          box(g, churchWallMat, 16, 6, 7.5, 0);
          box(g, churchWallMat, 7.5, 6, 15, 0);
          roofOn(g, 'gable', tileMat, 16, 2.8, 7.5, 0, 6);
          const drum = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, 4, 8), churchWallMat);
          drum.position.y = 8;
          g.add(drum);
          const dome = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), leadMat);
          dome.scale.y = 0.75;
          dome.position.y = 10;
          g.add(dome);
          const lantern = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2, 6), leadMat);
          lantern.position.y = 13.2;
          g.add(lantern);
        } else if (style === 'french') {
          box(g, stoneMat, 13, 0.6, 7, 0);
          box(g, churchWallMat, 12, 4.5, 6.5, 0);
          buttresses(g, stoneMat, 12, 6.5, 2.8);
          roofOn(g, 'gable', shingleMat, 12, 3.4, 6.5, 0, 4.5);
          box(g, churchWallMat, 1.8, 2.4, 1.8, 3, 7.9);
          const fl = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.6, 4), shingleMat);
          fl.position.set(3, 11.5, 0);
          g.add(fl);
        } else {
          box(g, stoneMat, 16, 0.7, 8.5, 0);
          box(g, churchWallMat, 15, 5.5, 7.5, 0);
          buttresses(g, stoneMat, 15, 7.5, 3.4);
          roofOn(g, 'gable', shingleMat, 15, 2.6, 7.5, 0, 5.5);
          box(g, churchWallMat, 5.2, 11.5, 5.2, 9.2);
          for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
            box(g, stoneMat, 0.9, 8, 0.9, 9.2 + cx * 2.5, 0, cz * 2.5);
          }
          box(g, stoneMat, 6, 0.8, 6, 9.2, 11.5);
          for (const cx of [-1, 1]) for (const cz of [-1, 1]) {
            const pin = new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.6, 4), stoneMat);
            pin.position.set(9.2 + cx * 2.6, 13, cz * 2.6);
            g.add(pin);
          }
          const spire = new THREE.Mesh(new THREE.ConeGeometry(2.3, 5, 4), leadMat);
          spire.position.set(9.2, 14.8, 0);
          g.add(spire);
        }
        return g;
      }

      // Landmarks read above the rooftops: a touch over true scale, as the
      // chartmakers drew the buildings that mattered.
      const LANDMARK_SCALE = { church: 1.3, building: 1.2 };
      for (const p of S.points) {
        const style = HARBOR_STYLE[p.harbor] || 'english';
        let g;
        if (p.kind === 'church') {
          g = churchOf(style);
        } else if (p.kind === 'building') {
          g = new THREE.Group();
          box(g, stoneMat, 15, 0.7, 10, 0);
          box(g, new THREE.MeshLambertMaterial({ color: 0xe7dcc0, map: facadeTexture(style, 2) }), 14, 6.5, 9, 0);
          roofOn(g, 'hip', style === 'spanish' ? tileMat : shingleMat, 14, 2.8, 9, 0, 6.5);
          const cupola = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.6, 8), churchWallMat);
          cupola.position.y = 9.8;
          g.add(cupola);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.4, 8), leadMat);
          cap.position.y = 11.3;
          g.add(cap);
        } else if (p.kind === 'battery') {
          g = new THREE.Group();
          box(g, masonMat, 9, 1.5, 5.5, 0);
          box(g, masonMat, 9, 0.7, 0.8, 0, 1.5, 2.4);
          for (const off of [-1.4, 1.4]) {
            const gun = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 3.8, 6), m.port);
            gun.rotation.z = Math.PI / 2 - 0.06;
            gun.position.set(2.2, 2.1, off);
            g.add(gun);
          }
        } else { // gallows
          g = new THREE.Group();
          for (const off of [-1.1, 1.1]) {
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 5, 5), m.wale);
            post.position.set(off, 2.5, 0);
            g.add(post);
          }
          const beam = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, 0.3), m.wale);
          beam.position.y = 4.9;
          g.add(beam);
        }
        const sc = LANDMARK_SCALE[p.kind] || 1;
        g.matrixAutoUpdate = false;
        g.matrix.copy(groundMatrix(p.lngLat, 0).multiply(new THREE.Matrix4().makeScale(sc, sc, sc)));
        group.add(g);
      }

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
      for (const [hillHarbor, hills] of Object.entries(HILLS)) {
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
          const offHill = (px, py) => {
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
          for (let gx = bx0; gx < bx1; gx += step) {
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

          // ρ: one grove centre per ~2,600 m²; each grove ~ Gaussian σ≈12 m
          const centres = Math.min(650, Math.floor(area / 2600));
          for (let c = 0; c < centres; c++) {
            const cx = bx0 + Math.random() * (bx1 - bx0);
            const cy = by0 + Math.random() * (by1 - by0);
            if (!insideRing(pts, cx, cy)) { continue; }
            const sigma = 8 + Math.random() * 14;                // grove radius
            const groveKind = Math.random() < (style === 'spanish' ? 0.62 : 0.32)
              ? 'palm' : (Math.random() < 0.7 ? 'leaf' : 'scrub');
            const members = 16 + ((Math.random() * 30) | 0);     // density of the grove
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
