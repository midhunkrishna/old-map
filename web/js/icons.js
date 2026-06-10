/* Carta Temporum — shared engraved icon library.
   Defines window.cartaIcons immediately (not a cartaInit module).
   All map glyph art lives here so every module draws in one style.
   Style: filled silhouettes (ink/deep-madder) + paper-tone sails and
   highlights + a few short engraved detail strokes. No gradients. */
'use strict';
(function () {
  const INK = '#3d2f1e', SOFT = '#5b4636', MADDER = '#8a3b2e', DEEP = '#6e1f14';
  const PAPER = '#f0e4c8', PARCH = '#e7d8ba';

  /* ---------- side-profile rigging helpers ---------- */

  // Full square sail: head sags on the yard, leech/luff bow outward,
  // foot bellies down. One curved seam gives the canvas volume.
  function sail(x1, yTop, x2, yBot, fill, line) {
    const cx = (x1 + x2) / 2, my = (yTop + yBot) / 2, bow = (x2 - x1) * 0.13;
    return `<path d="M${x1} ${yTop} Q${cx} ${yTop + 1.1} ${x2} ${yTop}
        Q${x2 + bow} ${my} ${x2} ${yBot} Q${cx} ${yBot + 1.7} ${x1} ${yBot}
        Q${x1 - bow} ${my} ${x1} ${yTop} Z"
        fill="${fill}" stroke="${line}" stroke-width="0.7"/>
      <path d="M${cx} ${yTop + 1} Q${cx + 1} ${my} ${cx} ${yBot + 0.9}"
        stroke="${line}" stroke-width="0.45" fill="none" opacity="0.5"/>`;
  }

  // Two-masted side-profile ship, bow to the RIGHT, drawn in a 34x30 box.
  // Colors parameterized so the deco variant can print in softer tones.
  function sideShipBody(c) {
    return `
      <path d="M21.5 19.3 V6.4 M13 19 V3" stroke="${c.line}" stroke-width="1.15"/>
      <path d="M13 3.2 L33.4 14.7" stroke="${c.line}" stroke-width="0.5" opacity="0.6"/>
      <path d="M26 9.6 L32.8 14.4 L26.4 16.6 Z" fill="${c.sail}" stroke="${c.line}" stroke-width="0.6"/>
      ${sail(9.2, 6.8, 16.6, 10.9, c.sail, c.line)}
      ${sail(8.4, 11.9, 17.4, 17.2, c.sail, c.line)}
      ${sail(18.6, 7.6, 24.6, 11.1, c.sail, c.line)}
      ${sail(18, 12.1, 25.2, 16.8, c.sail, c.line)}
      <path d="M3.6 15.6 L5.6 23 Q16.5 27.2 26.8 23.3 L31 17.4 Q22 20.4 6.4 18.6 Z" fill="${c.hull}"/>
      <path d="M7 21.3 Q16.5 24.6 25.4 21.5" stroke="${c.sail}" stroke-width="0.7" fill="none" opacity="0.85"/>
      <path d="M4.9 17.6 L8.6 18.3" stroke="${c.sail}" stroke-width="0.55" fill="none" opacity="0.7"/>
      <path d="M29.4 18 L33.7 14.5" stroke="${c.line}" stroke-width="1.1" stroke-linecap="round"/>
      <path d="M13 2.4 L18.6 3.9 L13 5.4 Z" fill="${c.pennant}"/>
      <g stroke="${c.wave}" stroke-width="1" fill="none" stroke-linecap="round">
        <path d="M3.4 25 q2.3 1.5 4.6 0"/><path d="M13.6 25.8 q2.3 1.5 4.6 0"/>
        <path d="M23.8 25 q2.3 1.5 4.6 0"/>
      </g>`;
  }

  /* ---------- pirate flag motifs (paper-tone, on the flag rect) ---------- */
  // Flag rect spans x12.6..22, y2.3..8.2 — motif coords must stay inside it.
  function flagGlyph(motif, fc) {
    const w = PAPER;
    switch (motif) {
      case 'skull-bones':
        return `<circle cx="17.3" cy="4.5" r="1.5" fill="${w}"/>
          <circle cx="16.75" cy="4.3" r="0.34" fill="${fc}"/><circle cx="17.85" cy="4.3" r="0.34" fill="${fc}"/>
          <path d="M14.7 6.3 L19.9 7.4 M19.9 6.3 L14.7 7.4" stroke="${w}" stroke-width="0.85" stroke-linecap="round"/>`;
      case 'skull-hourglass':
        return `<circle cx="15.7" cy="5.1" r="1.35" fill="${w}"/>
          <circle cx="15.25" cy="4.9" r="0.3" fill="${fc}"/><circle cx="16.15" cy="4.9" r="0.3" fill="${fc}"/>
          <path d="M18.5 3.5 h2.7 l-2.7 3.5 h2.7 z" fill="${w}"/>`;
      case 'skeleton-heart':
        return `<circle cx="16.2" cy="4.1" r="0.95" fill="${w}"/>
          <path d="M16.2 5 V7 M14.9 5.7 H17.5 M16.2 7 L15.3 7.9 M16.2 7 L17.1 7.9" stroke="${w}" stroke-width="0.65" stroke-linecap="round"/>
          <path d="M19.8 6 C18.4 4.9 18.7 3.7 19.8 4.3 C20.9 3.7 21.2 4.9 19.8 6 Z" fill="${w}"/>`;
      case 'full-skeleton':
        return `<circle cx="17.4" cy="3.9" r="0.95" fill="${w}"/>
          <path d="M17.4 4.8 V6.7 M16 5.5 H18.8 M16.7 6.1 H18.1 M17.4 6.7 L16.4 7.8 M17.4 6.7 L18.4 7.8" stroke="${w}" stroke-width="0.6" stroke-linecap="round"/>`;
      case 'arm-cutlass':
        return `<path d="M14.8 7.5 q1.1 -1.8 2.5 -2.1" stroke="${w}" stroke-width="0.95" fill="none" stroke-linecap="round"/>
          <path d="M17 5.7 L20.5 3.3" stroke="${w}" stroke-width="0.95" stroke-linecap="round"/>
          <path d="M16.6 4.7 L17.8 6.2" stroke="${w}" stroke-width="0.65" stroke-linecap="round"/>`;
      default:
        return '';
    }
  }

  /* ---------- furled canvas hanging from a top-down yard: one shallow swag,
     not scallops — anything busier turns to hatching at 15px ---------- */
  function furl(y, halfW) {
    return `<path d="M${12 - halfW + 1.9} ${y + 0.7} Q12 ${y + 2.3} ${12 + halfW - 1.9} ${y + 0.7}"
      stroke="${SOFT}" stroke-width="0.9" fill="none" opacity="0.85"/>`;
  }

  window.cartaIcons = {
    INK, SOFT, MADDER, DEEP, PAPER, PARCH,

    /* ===== ports ===== */

    // Fouled anchor: filled stock and flukes, rope twist on the shank.
    anchor(size, color) {
      const c = color || INK;
      return `<svg width="${size}" height="${size}" viewBox="0 0 16 16">
        <circle cx="8" cy="2.6" r="1.35" fill="none" stroke="${c}" stroke-width="1.1"/>
        <path d="M4.9 4.9 H11.1 V6.1 H4.9 Z" fill="${c}" rx="0.5"/>
        <path d="M8 3.9 V12.9" stroke="${c}" stroke-width="1.45" stroke-linecap="round"/>
        <path d="M2.7 9.4 q1.3 4 5.3 4 q4 0 5.3 -4" fill="none" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M2.7 9.4 L1.3 11.9 L4.3 11.6 Z" fill="${c}"/>
        <path d="M13.3 9.4 L14.7 11.9 L11.7 11.6 Z" fill="${c}"/>
        <path d="M6.9 7.2 q1.1 1 2.2 0 M6.9 8.6 q1.1 1 2.2 0" stroke="${SOFT}" stroke-width="0.65" fill="none"/>
      </svg>`;
    },

    // Skull over filled crossbones, hatched cranium, paper teeth.
    skull(size) {
      return `<svg width="${size}" height="${size}" viewBox="0 0 16 16">
        <g stroke="${DEEP}" stroke-width="1.9" stroke-linecap="round">
          <path d="M3.1 11.1 L12.9 14.7 M12.9 11.1 L3.1 14.7"/></g>
        <g fill="${DEEP}">
          <circle cx="3" cy="10.9" r="0.8"/><circle cx="13" cy="10.9" r="0.8"/>
          <circle cx="3" cy="14.9" r="0.8"/><circle cx="13" cy="14.9" r="0.8"/></g>
        <path d="M8 1.4 a4.7 4.7 0 0 1 4.7 4.7 q0 2.1 -1.4 3.1 V10.6 H4.7 V9.2 q-1.4 -1 -1.4 -3.1 A4.7 4.7 0 0 1 8 1.4 Z" fill="${DEEP}"/>
        <circle cx="6.25" cy="5.9" r="1.1" fill="${PAPER}"/><circle cx="9.75" cy="5.9" r="1.1" fill="${PAPER}"/>
        <path d="M8 7.2 L7.2 8.6 H8.8 Z" fill="${PAPER}"/>
        <rect x="6.1" y="9.4" width="3.8" height="1.9" rx="0.5" fill="${PAPER}"/>
        <path d="M7.1 9.5 v1.6 M8 9.5 v1.6 M8.9 9.5 v1.6" stroke="${DEEP}" stroke-width="0.5"/>
        <path d="M4.4 4.3 q-0.4 1 -0.2 2.1 M5.4 3.2 q-0.5 1.2 -0.3 2.6" stroke="${PAPER}" stroke-width="0.45" fill="none" opacity="0.65"/>
      </svg>`;
    },

    /* ===== wreck: broken hull half-sunken, tattered sail, waves over ===== */
    wreck() {
      return `<svg width="20" height="20" viewBox="0 0 20 20">
        <path d="M11 11.2 L14.2 2.9" stroke="${DEEP}" stroke-width="1.2" stroke-linecap="round"/>
        <path d="M13.9 3.4 L8.6 4.7 L9.5 6.1 L8.3 7.5 L9.7 8.7 L9 10.2 L12.2 9.2 Z"
          fill="${PAPER}" stroke="${SOFT}" stroke-width="0.5" stroke-linejoin="round"/>
        <path d="M6.6 10.9 L5.3 7.6" stroke="${DEEP}" stroke-width="1.15" stroke-linecap="round"/>
        <path d="M5.3 7.6 L3.3 8.9" stroke="${SOFT}" stroke-width="0.8" stroke-linecap="round"/>
        <path d="M2.8 9.9 L4.7 15.1 Q9.6 17.5 14.3 15.2 L17.3 10.2 Q11 12.8 4.5 11.2 Z" fill="${DEEP}"/>
        <path d="M5.5 13.5 Q9.8 15.3 13.5 13.6" stroke="${PAPER}" stroke-width="0.55" fill="none" opacity="0.8"/>
        <g stroke="${SOFT}" stroke-width="1.1" fill="none" stroke-linecap="round">
          <path d="M1.4 12.5 q2 1.5 4 0 q2 1.5 4 0"/>
          <path d="M9.7 14.9 q2 1.5 4 0 q2.1 1.5 4.2 0"/>
          <path d="M13.6 10.9 q1.8 1.3 3.6 0"/>
        </g>
      </svg>`;
    },

    gulls() {
      return `<svg width="22" height="10" viewBox="0 0 22 10">
        <g stroke="${INK}" fill="none" stroke-width="1.2" stroke-linecap="round">
          <path d="M2 6.4 Q4.5 3.4 7 6.2 M7 6.2 Q9.5 3.4 12 6.4"/>
          <path d="M12 4.2 Q14 1.9 16 4 M16 4 Q18 1.9 20 4.2" opacity="0.65" stroke-width="1"/>
        </g></svg>`;
    },

    /* ===== timeline pirate ship (26x26, flag motif preserved) ===== */
    pirateShip(flag) {
      const fc = flag.motif === 'red-plain' ? DEEP : INK;
      return `<svg width="26" height="26" viewBox="0 0 26 26">
        <path d="M12 17.8 V2.3" stroke="${INK}" stroke-width="1.15"/>
        <path d="M12 9.2 L25.4 14.6" stroke="${INK}" stroke-width="0.5" opacity="0.6"/>
        <path d="M16.6 11.4 L24.6 14.8 L17 16.6 Z" fill="${PAPER}" stroke="${INK}" stroke-width="0.6"/>
        ${sail(9.3, 8.8, 14.7, 11.2, PAPER, INK)}
        ${sail(8.5, 12.2, 15.5, 16.2, PAPER, INK)}
        <path d="M3.2 15.4 L4.8 21 Q12.8 24.4 20.4 21.3 L23.8 16.6 Q17 18.8 5.6 17.4 Z" fill="${INK}"/>
        <path d="M5.9 19.7 Q13 22.2 19.5 19.8" stroke="${PAPER}" stroke-width="0.6" fill="none" opacity="0.85"/>
        <path d="M4.3 16.7 L7.3 17.2" stroke="${PAPER}" stroke-width="0.5" fill="none" opacity="0.7"/>
        <path d="M22.4 17 L25.6 14.5" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>
        <g stroke="${SOFT}" stroke-width="0.95" fill="none" stroke-linecap="round">
          <path d="M3 22.7 q2.1 1.4 4.2 0"/><path d="M16.2 22.9 q2.1 1.4 4.2 0"/>
        </g>
        <path d="M12.5 2.3 H22 V8.2 H12.5 Z" fill="${fc}" stroke="${INK}" stroke-width="0.5"/>
        ${flagGlyph(flag.motif, fc)}
      </svg>`;
    },

    /* ===== voyage ship (34x30, bow right; mirrored by consumer CSS) ===== */
    voyageShip() {
      return `<svg width="34" height="30" viewBox="0 0 34 30">
        ${sideShipBody({ hull: INK, line: INK, sail: PAPER, pennant: MADDER, wave: SOFT })}
      </svg>`;
    },

    /* ===== deco ship for the open ocean (46x46, soft tones) ===== */
    decoShip() {
      return `<svg width="46" height="46" viewBox="0 0 46 46">
        <g transform="translate(3.5 6) scale(1.15)">
        ${sideShipBody({ hull: SOFT, line: SOFT, sail: PARCH, pennant: SOFT, wave: SOFT })}
        </g></svg>`;
    },

    /* ===== fleet man-of-war (broadside, 22 box, pennant colored) ===== */
    manOfWar(pennant, size) {
      const s = size || 22;
      return `<svg width="${s}" height="${s}" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M6.3 14.8 V6 M11 14.8 V2.8 M15.7 14.8 V6.6" stroke="${INK}" stroke-width="0.95"/>
        ${sail(4.5, 6.8, 8.2, 10.6, PAPER, INK)}
        ${sail(8.7, 5.4, 13.3, 10.2, PAPER, INK)}
        ${sail(13.9, 7.4, 17.4, 10.8, PAPER, INK)}
        <path d="M1.9 13.2 L3.6 17.6 Q11 19.9 18.4 17.7 L20.3 12.9 Q14.5 14.9 4.4 14.1 Z" fill="${INK}"/>
        <g fill="${PAPER}">
          <circle cx="5.6" cy="15.9" r="0.6"/><circle cx="8.3" cy="16.3" r="0.6"/>
          <circle cx="11" cy="16.4" r="0.6"/><circle cx="13.7" cy="16.3" r="0.6"/>
          <circle cx="16.4" cy="15.8" r="0.6"/></g>
        <path d="M19.6 13.4 L21.7 11.6" stroke="${INK}" stroke-width="0.9" stroke-linecap="round"/>
        <path d="M11 2.5 L15.8 3.6 L11 4.7 Z" fill="${pennant}" stroke="${INK}" stroke-width="0.45"/>
        <g stroke="${SOFT}" stroke-width="0.85" fill="none" stroke-linecap="round">
          <path d="M2.6 19.6 q1.9 1.3 3.8 0"/><path d="M13.8 19.8 q1.9 1.3 3.8 0"/>
        </g>
      </svg>`;
    },

    /* ===== harbor top-down vessels (viewBox 0 0 24 36, bow up) ===== */
    harborShip(type) {
      const masts = { canoe: 0, sloop: 1, brigantine: 2, merchantman: 3, 'man-of-war': 3 }[type] || 1;
      const h = { canoe: 15, sloop: 20, brigantine: 22, merchantman: 24, 'man-of-war': 27 }[type] || 20;
      const w = Math.round(h * 0.62);
      if (type === 'canoe') {
        return `<svg width="${w}" height="${h}" viewBox="0 0 24 36">
          <path d="M12 4 C14.2 12 14.2 24 12 32 C9.8 24 9.8 12 12 4 Z"
            fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/>
          <path d="M10.6 13 H13.4 M10.4 24 H13.6" stroke="${INK}" stroke-width="1.1"/>
          <circle cx="12" cy="18.6" r="1.5" fill="${INK}"/>
        </svg>`;
      }
      const ys = masts === 1 ? [17] : masts === 2 ? [13.5, 22.5] : [11.5, 18, 25];
      const yardW = type === 'man-of-war' ? 8.2 : type === 'merchantman' ? 7 : 6.2;
      let rig = `<path d="M12 4 L12 0.8" stroke="${INK}" stroke-width="1.2"/>`;
      for (const y of ys) {
        rig += `<path d="M${12 - yardW} ${y} H${12 + yardW}" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
          ${furl(y, yardW)}
          <circle cx="12" cy="${y}" r="1.25" fill="${INK}"/>`;
      }
      const plank = masts >= 3
        ? `<path d="M12 6.4 V30.6" stroke="${SOFT}" stroke-width="0.6" opacity="0.6"/>` : '';
      const gunwale = type === 'man-of-war'
        ? `<path d="M9.3 9.5 C8.4 14 8.3 24 9.4 28.6 M14.7 9.5 C15.6 14 15.7 24 14.6 28.6"
            stroke="${SOFT}" stroke-width="1" fill="none" stroke-dasharray="0.5 2.3" stroke-linecap="round"/>
          <path d="M8.9 30.3 Q12 32.4 15.1 30.3" stroke="${DEEP}" stroke-width="1.1" fill="none"/>` : '';
      return `<svg width="${w}" height="${h}" viewBox="0 0 24 36">
        <path d="M12 4 C16 8.5 16.8 13.5 16.8 19.5 L16.8 27 C16.8 31 14.8 32.8 12 32.8
          C9.2 32.8 7.2 31 7.2 27 L7.2 19.5 C7.2 13.5 8 8.5 12 4 Z"
          fill="${PAPER}" stroke="${INK}" stroke-width="1.6"/>
        ${plank}
        <path d="M12 4 L14 7.6 Q12 6.7 10 7.6 Z" fill="${INK}"/>
        ${gunwale}${rig}
      </svg>`;
    },

    /* ===== harbor shore furniture ===== */
    battery() {
      return `<svg width="18" height="13" viewBox="0 0 18 13">
        <path d="M3.4 11.9 L10.6 11.9 L9.6 9.3 L4.6 9.3 Z" fill="${SOFT}"/>
        <path d="M2.6 9.9 L13.4 4.5 L14.5 6.6 L3.7 12 Z" fill="${INK}"/>
        <path d="M13.2 4.2 L16.3 4.9" stroke="${INK}" stroke-width="2.3" stroke-linecap="round"/>
        <circle cx="7" cy="10" r="2.45" fill="${PAPER}" stroke="${INK}" stroke-width="1.15"/>
        <path d="M7 8 V12 M5 10 H9" stroke="${INK}" stroke-width="0.75"/>
        <circle cx="7" cy="10" r="0.55" fill="${INK}"/>
        <circle cx="1.6" cy="11.8" r="0.95" fill="${INK}"/><circle cx="3.2" cy="12.2" r="0.8" fill="${INK}"/>
      </svg>`;
    },
    church() {
      return `<svg width="13" height="17" viewBox="0 0 13 17">
        <path d="M6.5 0.8 V4.4 M4.9 2.4 H8.1" stroke="${INK}" stroke-width="1.15"/>
        <path d="M3.2 8.4 L6.5 4.2 L9.8 8.4 Z" fill="${INK}"/>
        <path d="M3.9 8.4 H9.1 V15.7 H3.9 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>
        <path d="M5.6 15.6 V13.3 q0.9 -1.1 1.8 0 V15.6 Z" fill="${INK}"/>
        <circle cx="6.5" cy="10.6" r="0.85" fill="none" stroke="${INK}" stroke-width="0.8"/>
      </svg>`;
    },
    building() {
      return `<svg width="11" height="11" viewBox="0 0 11 11">
        <path d="M2 4.8 H9 V9.8 H2 Z" fill="${PAPER}" stroke="${INK}" stroke-width="1.2"/>
        <path d="M0.9 5 L5.5 1.2 L10.1 5 Z" fill="${INK}"/>
        <path d="M4.6 9.7 V7.3 H6.4 V9.7 Z" fill="${INK}"/>
      </svg>`;
    },
    gallows() {
      return `<svg width="15" height="17" viewBox="0 0 15 17">
        <g stroke="${DEEP}" fill="none" stroke-linecap="round">
          <path d="M3.4 15.9 V2.1" stroke-width="1.7"/>
          <path d="M3.4 2.1 H11.2" stroke-width="1.7"/>
          <path d="M3.4 6 L7.1 2.1" stroke-width="1.15"/>
          <path d="M10.3 2.1 V5.5" stroke-width="1.1"/>
        </g>
        <circle cx="10.3" cy="7.2" r="1.65" fill="none" stroke="${DEEP}" stroke-width="1.25"/>
        <path d="M9.5 5.3 H11.1" stroke="${DEEP}" stroke-width="0.8"/>
        <path d="M1.2 15.9 H8.2" stroke="${DEEP}" stroke-width="1.25" stroke-linecap="round"/>
        <path d="M1.9 15.9 q2.2 -1.9 4.6 0 Z" fill="${DEEP}"/>
      </svg>`;
    },

    /* ===== harbor annotation glyphs (13px plates, viewBox 0 0 14 14) ===== */
    detailIcon(type) {
      const ink = SOFT, red = DEEP;
      const plate = (body) => `<svg width="13" height="13" viewBox="0 0 14 14">${body}</svg>`;
      switch (type) {
        case 'fort':
          return plate(`<path d="M7 1.2 L9.3 4.7 L12.8 7 L9.3 9.3 L7 12.8 L4.7 9.3 L1.2 7 L4.7 4.7 Z" fill="${ink}"/>
            <rect x="5.6" y="5.6" width="2.8" height="2.8" fill="${PAPER}"/>
            <circle cx="7" cy="7" r="0.55" fill="${ink}"/>`);
        case 'battery':
          return plate(`<path d="M3.4 11.8 L8.4 11.8 L7.6 9.8 L4.2 9.8 Z" fill="${ink}" opacity="0.75"/>
            <path d="M2.2 9.4 L10.4 5.1 L11.5 7.2 L3.3 11.5 Z" fill="${ink}"/>
            <path d="M10.3 4.9 L12.6 5.5" stroke="${ink}" stroke-width="1.9" stroke-linecap="round"/>
            <circle cx="5.4" cy="10.6" r="1.9" fill="${PAPER}" stroke="${ink}" stroke-width="1"/>
            <circle cx="5.4" cy="10.6" r="0.5" fill="${ink}"/>`);
        case 'anchorage':
          return window.cartaIcons.anchor(12, ink);
        case 'gallows':
          return plate(`<g stroke="${red}" fill="none" stroke-linecap="round">
            <path d="M3.4 12.6 V2.1 H10.1" stroke-width="1.6"/>
            <path d="M3.4 5.3 L6.5 2.1" stroke-width="1.1"/>
            <path d="M9.5 2.1 V4.4" stroke-width="1"/></g>
            <circle cx="9.5" cy="5.9" r="1.55" fill="none" stroke="${red}" stroke-width="1.15"/>
            <path d="M1.7 12.6 H7.2" stroke="${red}" stroke-width="1.15" stroke-linecap="round"/>
            <path d="M2.2 12.6 q1.8 -1.5 3.8 0 Z" fill="${red}"/>`);
        case 'careen':
          return plate(`<g transform="rotate(-26 7 8)">
            <path d="M2.3 9 Q7 12.4 11.7 9 L10.5 6.3 H3.5 Z" fill="${ink}"/>
            <path d="M3.6 9.4 Q7 11.4 10.4 9.4" stroke="${PAPER}" stroke-width="0.5" fill="none"/>
            <path d="M7 6.3 V2.2" stroke="${ink}" stroke-width="1.15" stroke-linecap="round"/></g>`);
        case 'wreck':
          return plate(`<g transform="rotate(10 7 8)">
            <path d="M7.4 8.2 L9.6 2.8" stroke="${red}" stroke-width="1" stroke-linecap="round"/>
            <path d="M9.4 3.2 L6 4.2 L6.8 5.4 L6 6.6 L8.2 6.2 Z" fill="${PAPER}" stroke="${ink}" stroke-width="0.45"/>
            <path d="M2.4 7.4 L3.6 10.6 Q7 12.3 10.2 10.7 L11.8 7.3 Q7 9 3.6 8.1 Z" fill="${red}"/></g>
            <path d="M1.4 9.3 q1.7 1.3 3.4 0 M8.8 10.8 q1.7 1.3 3.4 0" stroke="${ink}" stroke-width="0.95" fill="none" stroke-linecap="round"/>`);
        case 'town':
          return plate(`<g fill="${ink}">
            <path d="M2 12 V7 L4.5 4.5 L7 7 V12 Z"/>
            <path d="M7.5 12 V8 L9.5 6 L11.5 8 V12 Z"/></g>
            <rect x="3.7" y="9.2" width="1.6" height="2.8" fill="${PAPER}"/>
            <rect x="8.8" y="9.6" width="1.4" height="2.4" fill="${PAPER}"/>`);
        case 'market':
          return plate(`<g stroke="${ink}" fill="none" stroke-linecap="round">
            <path d="M7 2.4 V11.6" stroke-width="1.25"/>
            <path d="M3 4 H11" stroke-width="1.1"/>
            <path d="M5 11.8 H9" stroke-width="1.3"/></g>
            <path d="M3 4.4 L1.7 7.6 H4.3 Z" fill="${ink}"/>
            <path d="M11 4.4 L9.7 7.6 H12.3 Z" fill="${ink}"/>
            <circle cx="7" cy="2.3" r="0.7" fill="${ink}"/>`);
        case 'yard':
          return plate(`<path d="M2 11.9 H12" stroke="${ink}" stroke-width="1.4" stroke-linecap="round"/>
            <g stroke="${ink}" fill="none" stroke-linecap="round">
              <path d="M3.6 11.8 Q3.6 5.2 9.4 3.4" stroke-width="1.25"/>
              <path d="M6.1 11.8 Q6.1 7.4 10.7 5.5" stroke-width="1"/>
              <path d="M8.6 11.8 Q8.6 9.4 11.8 7.9" stroke-width="0.8"/></g>
            <rect x="3" y="10" width="1.3" height="1.9" fill="${ink}"/>`);
        default: // landmark
          return plate(`<path d="M7 12.4 V2.2" stroke="${ink}" stroke-width="1.25" stroke-linecap="round"/>
            <path d="M7 2.4 L11.6 4 L7 5.6 Z" fill="${ink}"/>
            <path d="M5 12.4 q2 -1.5 4 0 Z" fill="${ink}"/>`);
      }
    },

    /* ===== event glyphs (17x17) ===== */
    eventGlyph(type) {
      let body = '';
      switch (type) {
        case 'battle': // crossed cutlasses: tapered filled blades, madder guards
          body = `<path d="M2.9 2 Q4 1.9 4.5 2.5 Q9.3 7.6 13.6 12.7 L12.5 13.6 Q7.7 8.4 3 3.6 Q2.4 2.6 2.9 2 Z" fill="${INK}"/>
            <path d="M14.1 2 Q13 1.9 12.5 2.5 Q7.7 7.6 3.4 12.7 L4.5 13.6 Q9.3 8.4 14 3.6 Q14.6 2.6 14.1 2 Z" fill="${INK}"/>
            <g stroke="${MADDER}" fill="none" stroke-width="1.4" stroke-linecap="round">
              <path d="M2.3 11.4 q1.2 2.4 3.4 3.3"/><path d="M14.7 11.4 q-1.2 2.4 -3.4 3.3"/></g>
            <circle cx="5.9" cy="15.2" r="0.8" fill="${MADDER}"/><circle cx="11.1" cy="15.2" r="0.8" fill="${MADDER}"/>`;
          break;
        case 'storm': // bold spiral, madder eye, rain dashes
          body = `<path d="M8.5 8.5 a1.4 1.4 0 0 1 1.4 1.4 a2.6 2.6 0 0 1 -2.6 2.6
              a4.1 4.1 0 0 1 -4.1 -4.1 a5.5 5.5 0 0 1 5.5 -5.5 a6.6 6.6 0 0 1 6.1 4.2"
              stroke="${INK}" fill="none" stroke-width="1.6" stroke-linecap="round"/>
            <circle cx="8.5" cy="8.5" r="1.05" fill="${MADDER}"/>
            <g stroke="${SOFT}" stroke-width="1.05" stroke-linecap="round">
              <path d="M12.2 12.2 l-1 2.1"/><path d="M14.2 10.6 l-1 2.1"/><path d="M15.5 8.4 l-0.9 2"/></g>`;
          break;
        case 'quake': // cracked filled tower splitting apart, madder fissure
          body = `<path d="M4.4 15.5 V5.2 H6.4 V3 H8.2 V5.2 H8.6 L7.6 8 L9 10.4 L8 13 L8.9 15.5 Z"
              fill="${SOFT}" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>
            <path d="M10.6 15.5 L10 12.8 L10.8 10.2 L9.6 7.8 L10.3 5.2 H10.6 V3 H12.4 V5.2 H13.6 V15.5 Z"
              fill="${SOFT}" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>
            <path d="M1.6 15.6 H6.8 M10.4 15.6 H15.6" stroke="${INK}" stroke-width="1.1" stroke-linecap="round"/>
            <path d="M7.4 15.8 L8.8 13.4 L8.2 11.8" stroke="${MADDER}" fill="none" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="2.9" cy="14.3" r="0.75" fill="${SOFT}"/><circle cx="14.4" cy="14.2" r="0.65" fill="${SOFT}"/>`;
          break;
        case 'sack': // filled flame with side licks, three tones
          body = `<path d="M8.2 1.6 Q9.4 4 11.2 5.6 Q13.6 7.9 13 11 Q12.4 14.2 8.7 15.4
              Q5 14.4 4.2 11.2 Q3.6 8.8 5 7.2 Q4.8 8.8 6 9.4 Q5.4 6.4 7.4 4.4 Q8.5 3.2 8.2 1.6 Z"
              fill="${DEEP}"/>
            <path d="M8.8 5.8 Q11.4 8.4 10.6 11.2 Q10.1 13 8.7 13.7 Q7.1 13 6.7 11.2 Q6.1 8.4 8.8 5.8 Z" fill="${MADDER}"/>
            <path d="M8.7 8.8 Q9.8 10.6 8.7 12.5 Q7.6 10.6 8.7 8.8 Z" fill="${PAPER}"/>`;
          break;
        case 'trial': // weighted noose + scroll of sentence
          body = `<path d="M6.4 0.8 V5.4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/>
            <path d="M5.2 5 h2.4 M5.3 6.2 h2.2 M5.4 7.4 h2" stroke="${MADDER}" stroke-width="1.05" stroke-linecap="round"/>
            <circle cx="6.4" cy="11.3" r="3.9" stroke="${INK}" fill="none" stroke-width="1.6"/>
            <path d="M11.3 8.6 H15.6 V15 H11.3 Z" fill="${PAPER}" stroke="${INK}" stroke-width="0.9"/>
            <path d="M11.3 8.6 q-1.1 0.5 -0.7 1.5 M15.6 15 q1.1 -0.5 0.7 -1.5" stroke="${INK}" stroke-width="0.8" fill="none"/>
            <path d="M12.2 10.6 h2.4 M12.2 11.9 h2 M12.2 13.2 h2.4" stroke="${SOFT}" stroke-width="0.7"/>`;
          break;
        default:
          body = `<circle cx="8.5" cy="8.5" r="4" stroke="${INK}" fill="none" stroke-width="1.2"/>`;
      }
      return `<svg width="17" height="17" viewBox="0 0 17 17">${body}</svg>`;
    },

    /* ===== dividers tool + survey pin ===== */
    dividersTool() {
      return `<svg width="26" height="26" viewBox="0 0 24 24">
        <path d="M11.2 1.8 H12.8 V3.6 H11.2 Z" fill="${INK}"/>
        <path d="M10.85 7.1 L6 19.5 L7.3 20 L12 8.1 Z" fill="${INK}"/>
        <path d="M13.15 7.1 L18 19.5 L16.7 20 L12 8.1 Z" fill="${INK}"/>
        <path d="M6 19.5 L5.5 21.4 M18 19.5 L18.5 21.4" stroke="${DEEP}" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="12" cy="5.5" r="2.1" fill="${MADDER}" stroke="${DEEP}" stroke-width="1"/>
        <circle cx="11.3" cy="4.9" r="0.55" fill="${PAPER}"/>
        <path d="M8.1 15.3 Q12 17.5 15.9 15.3" stroke="${MADDER}" stroke-width="0.95" fill="none" stroke-dasharray="1.6 1.3"/>
      </svg>`;
    },
    // Filled teardrop; the TIP sits at the bottom edge — consumers shift the
    // inner wrapper up by half the box so the tip marks the exact point.
    surveyPin() {
      return `<svg width="18" height="18" viewBox="0 0 18 18">
        <path d="M9 17 C6.4 13.2 4.6 11.7 4.6 8.9 a4.4 4.4 0 1 1 8.8 0 C13.4 11.7 11.6 13.2 9 17 Z"
          fill="${MADDER}" stroke="${DEEP}" stroke-width="1"/>
        <circle cx="9" cy="8.7" r="1.7" fill="${PAPER}"/>
        <circle cx="9" cy="8.7" r="0.6" fill="${DEEP}"/>
      </svg>`;
    },
    voyagePin(kind) {
      const glyph = kind === 'a'
        ? `<g stroke="${DEEP}" fill="none" stroke-width="1.05" stroke-linecap="round">
             <circle cx="9" cy="5.7" r="1"/>
             <path d="M9 6.7 V10.8 M7.2 8 H10.8"/>
             <path d="M6.5 9.1 q0.9 2.2 2.5 2.2 q1.6 0 2.5 -2.2"/>
           </g>`
        : `<g stroke="${DEEP}" fill="none" stroke-width="1.6" stroke-linecap="round">
             <path d="M6.9 6.2 L11.1 10.4 M11.1 6.2 L6.9 10.4"/>
           </g>`;
      return `<svg width="18" height="18" viewBox="0 0 18 18">
        <path d="M9 17.2 C5.9 13 4 11.5 4 8.3 a5 5 0 1 1 10 0 C14 11.5 12.1 13 9 17.2 Z"
          fill="${PAPER}" stroke="${DEEP}" stroke-width="1.2"/>${glyph}</svg>`;
    },
  };
})();
