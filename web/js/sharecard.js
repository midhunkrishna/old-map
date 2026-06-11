/* Carta Temporum — sharecard module: when a voyage comes to anchor, offer a
   framed PNG of the passage — the chart as sailed, the day count, and the
   shareable #voyage link — fit for showing about the tavern. Listens for
   'voyage-arrived' / 'voyage-ended' on the bus. Registered via
   window.cartaInits. */
'use strict';

(window.cartaInits = window.cartaInits || []).push(function init_sharecard(carta) {
  const map = carta.map;
  const { INK, INK_SOFT, PAPER, MADDER, MADDER_D } = carta.COLORS;
  const shortName = carta.geo.shortName;

  /* ---------- styles ---------- */

  const css = document.createElement('style');
  css.textContent = `
#vg-hud button#sc-btn { background: ${MADDER_D}; }
#vg-hud button#sc-btn:hover { background: ${MADDER}; }
#sc-modal {
  position: fixed; inset: 0; z-index: 70; display: flex;
  align-items: center; justify-content: center; background: rgba(40,30,18,0.45);
}
#sc-modal .sc-paper {
  position: relative; max-width: min(760px, 92vw);
  max-height: 92vh; overflow: auto; padding: 14px 16px 12px;
  box-shadow: inset 0 0 0 2.5px ${PAPER}, inset 0 0 0 3.5px rgba(61,47,30,0.55), 4px 8px 24px rgba(20,14,6,0.5);
}
#sc-modal .sc-head {
  font-family: 'IM Fell English SC', serif; font-size: 13px; letter-spacing: 2.5px;
  color: ${INK_SOFT}; padding-bottom: 6px;
}
#sc-modal img { display: block; width: 100%; border: 1px solid rgba(61,47,30,0.4); }
#sc-modal .sc-row { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
#sc-modal .sc-row button {
  font-family: 'IM Fell English', serif; font-size: 12.5px; cursor: pointer;
  background: ${INK}; color: ${PAPER}; border: none; padding: 5px 12px;
}
#sc-modal .sc-row button:hover { background: ${MADDER}; }
#sc-modal .sc-x {
  position: absolute; top: 8px; right: 12px; cursor: pointer; background: none;
  border: none; color: ${INK_SOFT}; font-size: 15px; padding: 0;
}
#sc-modal .sc-x:hover { color: ${MADDER_D}; }
#sc-modal .sc-note { font-size: 11px; font-style: italic; color: ${INK_SOFT}; margin: 6px 0 0; }
`;
  document.head.appendChild(css);

  /* ---------- state ---------- */

  let last = null;     // info from the latest arrival
  let modal = null;

  carta.bus.on('voyage-arrived', (info) => { last = info; addButton(); });
  carta.bus.on('voyage-ended', () => { last = null; removeButton(); closeModal(); });

  function addButton() {
    const hud = document.getElementById('vg-hud');
    if (!hud || hud.querySelector('#sc-btn')) return;
    const b = document.createElement('button');
    b.id = 'sc-btn';
    b.textContent = '🖼 Share this passage';
    b.title = 'a picture of the passage, fit for the tavern wall';
    b.onclick = openModal;
    hud.insertBefore(b, hud.querySelector('#vg-close'));
  }
  function removeButton() {
    const b = document.getElementById('sc-btn');
    if (b) b.remove();
  }
  function closeModal() {
    if (modal) { modal.remove(); modal = null; }
  }

  /* ---------- the picture ---------- */

  // The GL canvas keeps no drawing buffer between frames: ask for a repaint
  // and read the pixels inside that very render pass.
  function snapshot() {
    return new Promise((resolve) => {
      map.once('render', () => {
        try { resolve(map.getCanvas().toDataURL('image/png')); }
        catch (e) { resolve(null); }
      });
      map.triggerRepaint();
    });
  }
  const loadImg = (src) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });

  // Cover-crop src into the dest rect; returns the mapping so chart points
  // can be re-projected onto the card.
  function drawCover(x, src, dx, dy, dw, dh) {
    const sw = src.width, sh = src.height;
    const scale = Math.max(dw / sw, dh / sh);
    const cw = dw / scale, ch = dh / scale;
    const cx = (sw - cw) / 2, cy = (sh - ch) / 2;
    x.drawImage(src, cx, cy, cw, ch, dx, dy, dw, dh);
    return { cx, cy, cw, ch, scale, dx, dy, dw, dh };
  }

  function rose(x, cx, cy, r) {
    x.save();
    x.translate(cx, cy);
    x.strokeStyle = INK_SOFT;
    x.fillStyle = INK_SOFT;
    x.lineWidth = 1;
    x.beginPath();
    x.arc(0, 0, r, 0, Math.PI * 2);
    x.stroke();
    x.beginPath();
    for (let i = 0; i < 16; i++) {
      const rr = i % 2 === 0 ? r * 0.85 : r * 0.18;
      const a = (i * Math.PI) / 8;
      x[i ? 'lineTo' : 'moveTo'](rr * Math.sin(a), -rr * Math.cos(a));
    }
    x.closePath();
    x.fill();
    x.restore();
  }

  async function buildCard(info) {
    const shot = await snapshot();
    if (!shot) return null;
    const img = await loadImg(shot);
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (_) { /* draw with fallbacks */ }
    }

    const W = 1280, H = 900, M = 44;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');

    x.fillStyle = PAPER;
    x.fillRect(0, 0, W, H);

    const headH = 64, footH = 118;
    const inX = M, inY = M + headH, inW = W - 2 * M, inH = H - 2 * M - headH - footH;
    const mapRect = drawCover(x, img, inX, inY, inW, inH);

    // living-sea particles, if streaming, with the same crop
    const fx = document.getElementById('fx-canvas');
    if (fx && fx.width > 1) drawCover(x, fx, inX, inY, inW, inH);

    // endpoint pricks, where they fall within the picture
    const cnv = map.getCanvas();
    const pxRatio = cnv.width / cnv.clientWidth;
    for (const [end, fill] of [[info.A, INK], [info.B, MADDER_D]]) {
      const p = carta.projectWrapped([end.lon, end.lat]);
      const sx = p.x * pxRatio, sy = p.y * pxRatio;
      if (sx < mapRect.cx || sx > mapRect.cx + mapRect.cw || sy < mapRect.cy || sy > mapRect.cy + mapRect.ch) continue;
      const ex = inX + (sx - mapRect.cx) * mapRect.scale;
      const ey = inY + (sy - mapRect.cy) * mapRect.scale;
      x.beginPath();
      x.arc(ex, ey, 7, 0, Math.PI * 2);
      x.fillStyle = PAPER; x.fill();
      x.lineWidth = 2; x.strokeStyle = fill; x.stroke();
      x.beginPath();
      x.arc(ex, ey, 2.6, 0, Math.PI * 2);
      x.fillStyle = fill; x.fill();
    }

    // engraved double frame
    x.strokeStyle = INK;
    x.lineWidth = 2.5;
    x.strokeRect(M - 14, M - 14, W - 2 * (M - 14), H - 2 * (M - 14));
    x.lineWidth = 1;
    x.strokeRect(M - 8, M - 8, W - 2 * (M - 8), H - 2 * (M - 8));
    x.strokeRect(inX, inY, inW, inH);

    // title band
    x.fillStyle = INK;
    x.textAlign = 'center';
    x.font = `28px 'IM Fell English SC', serif`;
    x.fillText('C A R T A   T E M P O R U M', W / 2, M + 36);
    x.fillStyle = MADDER_D;
    x.font = `16px serif`;
    x.fillText('❦', W / 2, M + 56);

    // caption
    const y0 = inY + inH;
    x.fillStyle = INK;
    x.font = `34px 'IM Fell English SC', serif`;
    x.fillText(`${shortName(info.A.name)}  →  ${shortName(info.B.name)}`, W / 2, y0 + 48);
    x.fillStyle = INK_SOFT;
    x.font = `italic 19px 'IM Fell English', serif`;
    const yr = (window.cartaTime && window.cartaTime.year) || 1730;
    x.fillText(`${info.days} days under sail · Anno Domini ${yr}`, W / 2, y0 + 78);
    x.font = `italic 13px 'IM Fell English', serif`;
    x.fillText('an isochronic chart of the sailing world — sail it yourself at the link', W / 2, y0 + 100);

    rose(x, M + 26, H - M - 26, 16);
    rose(x, W - M - 26, H - M - 26, 16);
    return c;
  }

  /* ---------- the modal ---------- */

  async function openModal() {
    if (!last) return;
    closeModal();
    const card = await buildCard(last);
    if (!card) {
      carta.showCard('<h3>The engraver is indisposed</h3><p>No picture could be taken of the chart.</p>');
      setTimeout(carta.hideCard, 3000);
      return;
    }
    const url = card.toDataURL('image/png');
    const fname = `carta-${shortName(last.A.name)}-${shortName(last.B.name)}-${last.days}d.png`
      .toLowerCase().replace(/[^a-z0-9.-]+/g, '-');

    modal = document.createElement('div');
    modal.id = 'sc-modal';
    modal.innerHTML = `<div class="sc-paper carta-panel">
      <button class="sc-x" title="put it away">✕</button>
      <div class="sc-head">A PICTURE OF THE PASSAGE</div>
      <img alt="The passage, charted">
      <div class="sc-row">
        <button id="sc-dl">⬇ Keep the picture</button>
        <button id="sc-link">⚓ Copy the voyage link</button>
        <button id="sc-share" style="display:none">⛵ Share…</button>
      </div>
      <p class="sc-note">The link replays this very voyage for whoever opens it.</p>
    </div>`;
    modal.querySelector('img').src = url;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
    modal.querySelector('.sc-x').onclick = closeModal;
    modal.querySelector('#sc-dl').onclick = () => {
      const a = document.createElement('a');
      a.href = url;
      a.download = fname;
      a.click();
    };
    const linkBtn = modal.querySelector('#sc-link');
    linkBtn.onclick = async () => {
      try {
        await navigator.clipboard.writeText(last.link || location.href);
        linkBtn.textContent = '⚓ Copied';
        setTimeout(() => { if (modal) linkBtn.textContent = '⚓ Copy the voyage link'; }, 1800);
      } catch (e) {
        linkBtn.textContent = '⚓ Could not copy';
      }
    };
    const shareBtn = modal.querySelector('#sc-share');
    if (navigator.share) {
      card.toBlob((blob) => {
        if (!blob || !modal) return;
        const file = new File([blob], fname, { type: 'image/png' });
        const payload = navigator.canShare && navigator.canShare({ files: [file] })
          ? { files: [file], title: 'Carta Temporum', url: last.link }
          : { title: 'Carta Temporum', text: `${shortName(last.A.name)} → ${shortName(last.B.name)}, ${last.days} days under sail`, url: last.link };
        shareBtn.style.display = '';
        shareBtn.onclick = () => navigator.share(payload).catch(() => { /* user thought better of it */ });
      });
    }
  }
});
