/* ==========================================================
   Alberto Clocks — SVG timepiece renderer
   Draws every product from its "look" data in products.json,
   so the site needs no image files and works fully offline.
   ========================================================== */
(function (global) {
  'use strict';

  var uid = 0;
  var ROMAN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

  function shade(hex, amt) {
    // amt: -1 .. 1  (negative = darker)
    var c = hex.replace('#', '');
    if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2];
    var n = parseInt(c, 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r);
    g = Math.round((t - g) * p + g);
    b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  function polar(cx, cy, r, deg) {
    var a = (deg - 90) * Math.PI / 180;
    return { x: +(cx + r * Math.cos(a)).toFixed(2), y: +(cy + r * Math.sin(a)).toFixed(2) };
  }

  function defs(id, look) {
    var c = look.case, d = look.dial;
    return '<defs>' +
      '<linearGradient id="cs' + id + '" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + shade(c, 0.45) + '"/>' +
        '<stop offset=".45" stop-color="' + c + '"/>' +
        '<stop offset="1" stop-color="' + shade(c, -0.45) + '"/>' +
      '</linearGradient>' +
      '<radialGradient id="dl' + id + '" cx=".4" cy=".35" r=".8">' +
        '<stop offset="0" stop-color="' + shade(d, 0.12) + '"/>' +
        '<stop offset="1" stop-color="' + shade(d, -0.18) + '"/>' +
      '</radialGradient>' +
      '<linearGradient id="gl' + id + '" x1="0" y1="0" x2="0" y2="1">' +
        '<stop offset="0" stop-color="#fff" stop-opacity=".28"/>' +
        '<stop offset=".5" stop-color="#fff" stop-opacity="0"/>' +
      '</linearGradient>' +
      '<filter id="sh' + id + '" x="-30%" y="-30%" width="160%" height="160%">' +
        '<feDropShadow dx="0" dy="6" stdDeviation="6" flood-color="#000" flood-opacity=".35"/>' +
      '</filter>' +
    '</defs>';
  }

  /* ---------- dial furniture ---------- */
  function markers(cx, cy, r, look) {
    var col = look.accent, out = '', i, p, q;
    // minute track
    for (i = 0; i < 60; i++) {
      if (i % 5 === 0) continue;
      p = polar(cx, cy, r - 2, i * 6); q = polar(cx, cy, r - 5, i * 6);
      out += '<line x1="' + p.x + '" y1="' + p.y + '" x2="' + q.x + '" y2="' + q.y + '" stroke="' + col + '" stroke-width=".7" opacity=".55"/>';
    }
    var style = look.markers || 'index';
    for (i = 0; i < 12; i++) {
      var deg = i * 30;
      if (style === 'roman' || style === 'arabic') {
        var label = style === 'roman' ? ROMAN[i] : String(i === 0 ? 12 : i);
        var fs = style === 'roman' ? r * 0.17 : r * 0.21;
        if (style === 'roman' && label.length > 2) fs *= 0.82;
        p = polar(cx, cy, r * 0.76, deg);
        out += '<text x="' + p.x + '" y="' + p.y + '" fill="' + col + '" font-size="' + fs.toFixed(1) +
          '" font-family="Georgia, \'Times New Roman\', serif" text-anchor="middle" dominant-baseline="central">' + label + '</text>';
      } else {
        var len = i % 3 === 0 ? r * 0.2 : r * 0.12;
        var w = i % 3 === 0 ? 3.2 : 2;
        p = polar(cx, cy, r - 6, deg); q = polar(cx, cy, r - 6 - len, deg);
        out += '<line x1="' + p.x + '" y1="' + p.y + '" x2="' + q.x + '" y2="' + q.y + '" stroke="' + col + '" stroke-width="' + w + '" stroke-linecap="round"/>';
      }
    }
    return out;
  }

  function hands(cx, cy, r, look, live) {
    var col = look.accent, sec = look.second || '#c0392b';
    var hr = 305, mn = 60, sc = 200; // 10:10:33 — the classic showroom pose
    var g = function (cls, deg, body) {
      return '<g class="' + cls + '" transform="rotate(' + deg + ' ' + cx + ' ' + cy + ')">' + body + '</g>';
    };
    return '<g class="hands"' + (live ? ' data-live="1"' : '') + '>' +
      g('h-hour', hr, '<path d="M' + (cx - 3) + ' ' + (cy + 6) + ' L' + (cx - 2.2) + ' ' + (cy - r * 0.5) + ' L' + cx + ' ' + (cy - r * 0.56) + ' L' + (cx + 2.2) + ' ' + (cy - r * 0.5) + ' L' + (cx + 3) + ' ' + (cy + 6) + 'Z" fill="' + col + '"/>') +
      g('h-min', mn, '<path d="M' + (cx - 2.2) + ' ' + (cy + 8) + ' L' + (cx - 1.4) + ' ' + (cy - r * 0.8) + ' L' + cx + ' ' + (cy - r * 0.86) + ' L' + (cx + 1.4) + ' ' + (cy - r * 0.8) + ' L' + (cx + 2.2) + ' ' + (cy + 8) + 'Z" fill="' + col + '"/>') +
      g('h-sec', sc, '<line x1="' + cx + '" y1="' + (cy + r * 0.2) + '" x2="' + cx + '" y2="' + (cy - r * 0.88) + '" stroke="' + sec + '" stroke-width="1.1"/>') +
      '<circle cx="' + cx + '" cy="' + cy + '" r="3.2" fill="' + sec + '"/>' +
      '<circle cx="' + cx + '" cy="' + cy + '" r="1.3" fill="' + col + '"/>' +
    '</g>';
  }

  function brandLine(cx, y, look, text) {
    return '<text x="' + cx + '" y="' + y + '" fill="' + look.accent + '" font-size="6.5" letter-spacing="1.6" opacity=".8" font-family="Georgia, serif" text-anchor="middle">' + text + '</text>';
  }

  /* ---------- watch types ---------- */
  function strap(look, id, x, w, top, bottom) {
    var s = look.strap || '#2b2420';
    return '<rect x="' + x + '" y="' + top[0] + '" width="' + w + '" height="' + top[1] + '" rx="6" fill="' + s + '"/>' +
           '<rect x="' + x + '" y="' + bottom[0] + '" width="' + w + '" height="' + bottom[1] + '" rx="6" fill="' + s + '"/>' +
           '<rect x="' + x + '" y="' + top[0] + '" width="' + w + '" height="' + (top[1] + bottom[0] + bottom[1] - top[0]) + '" rx="6" fill="url(#gl' + id + ')" opacity=".4"/>';
  }

  function roundWatch(id, look, live) {
    var cx = 100, cy = 100;
    var out = strap(look, id, 76, 48, [0, 50], [150, 50]);
    // lugs
    out += '<rect x="72" y="40" width="56" height="120" rx="10" fill="url(#cs' + id + ')"/>';
    // crown
    out += '<rect x="160" y="93" width="9" height="14" rx="2.5" fill="url(#cs' + id + ')"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="62" fill="url(#cs' + id + ')" filter="url(#sh' + id + ')"/>';
    if (look.bezel) {
      out += '<circle cx="' + cx + '" cy="' + cy + '" r="57" fill="' + look.bezel + '"/>';
      for (var i = 0; i < 12; i++) {
        var p = polar(cx, cy, 53, i * 30), q = polar(cx, cy, 57 - (i === 0 ? 7 : 4), i * 30);
        out += '<line x1="' + p.x + '" y1="' + p.y + '" x2="' + q.x + '" y2="' + q.y + '" stroke="#eee" stroke-width="' + (i === 0 ? 2.5 : 1.4) + '" opacity=".85"/>';
      }
      out += '<circle cx="' + cx + '" cy="' + cy + '" r="47" fill="url(#dl' + id + ')"/>';
      out += markers(cx, cy, 46, look);
      out += hands(cx, cy, 46, look, live);
    } else {
      out += '<circle cx="' + cx + '" cy="' + cy + '" r="54" fill="url(#dl' + id + ')" stroke="' + shade(look.case, -0.3) + '" stroke-width="1"/>';
      out += markers(cx, cy, 53, look);
      out += brandLine(cx, 76, look, 'ALBERTO');
      out += hands(cx, cy, 53, look, live);
    }
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="54" fill="url(#gl' + id + ')"/>';
    return out;
  }

  function squareWatch(id, look, live) {
    var cx = 100, cy = 100;
    var out = strap(look, id, 78, 44, [0, 50], [150, 50]);
    out += '<rect x="64" y="46" width="72" height="108" rx="12" fill="url(#cs' + id + ')" filter="url(#sh' + id + ')"/>';
    out += '<rect x="136" y="94" width="8" height="12" rx="4" fill="' + (look.accent) + '" opacity=".8"/>';
    out += '<rect x="71" y="54" width="58" height="92" rx="6" fill="url(#dl' + id + ')"/>';
    // rail-track + roman numerals laid out on rectangle
    var pos = [[100, 64], [113, 69], [121, 82], [121, 100], [121, 118], [113, 131], [100, 137], [87, 131], [79, 118], [79, 100], [79, 82], [87, 69]];
    for (var i = 0; i < 12; i++) {
      out += '<text x="' + pos[i][0] + '" y="' + pos[i][1] + '" fill="' + look.accent + '" font-size="' + (ROMAN[i].length > 2 ? 6.5 : 8) + '" font-family="Georgia, serif" text-anchor="middle" dominant-baseline="central">' + ROMAN[i] + '</text>';
    }
    out += hands(cx, cy, 40, look, live);
    out += '<rect x="71" y="54" width="58" height="92" rx="6" fill="url(#gl' + id + ')"/>';
    return out;
  }

  function pocketWatch(id, look, live) {
    var cx = 100, cy = 112;
    var out = '';
    out += '<path d="M100 28 C 30 10, 10 120, 40 190" fill="none" stroke="' + look.case + '" stroke-width="2.5" stroke-dasharray="3 2.5" opacity=".9"/>';
    out += '<circle cx="100" cy="30" r="13" fill="none" stroke="url(#cs' + id + ')" stroke-width="5"/>';
    out += '<rect x="93" y="40" width="14" height="13" rx="3" fill="url(#cs' + id + ')"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="66" fill="url(#cs' + id + ')" filter="url(#sh' + id + ')"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="58" fill="url(#dl' + id + ')" stroke="' + shade(look.case, -0.35) + '" stroke-width="1.2"/>';
    out += markers(cx, cy, 57, look);
    // sub-seconds
    out += '<circle cx="' + cx + '" cy="' + (cy + 28) + '" r="11" fill="none" stroke="' + look.accent + '" stroke-width=".6" opacity=".6"/>';
    out += hands(cx, cy, 57, look, live);
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="58" fill="url(#gl' + id + ')"/>';
    return out;
  }

  function smartWatch(id, look) {
    var out = strap(look, id, 74, 52, [0, 52], [148, 52]);
    out += '<rect x="56" y="40" width="88" height="120" rx="26" fill="url(#cs' + id + ')" filter="url(#sh' + id + ')"/>';
    out += '<rect x="144" y="70" width="6" height="18" rx="3" fill="' + shade(look.case, 0.2) + '"/>';
    out += '<rect x="62" y="46" width="76" height="108" rx="21" fill="' + look.dial + '"/>';
    out += activity(100, 82, look.accent);
    out += '<text x="100" y="126" fill="#fff" font-size="22" font-family="Helvetica, Arial, sans-serif" font-weight="600" text-anchor="middle">10:10</text>';
    out += '<text x="100" y="140" fill="' + look.accent + '" font-size="7" font-family="Helvetica, Arial, sans-serif" text-anchor="middle" letter-spacing="1">♥ 72 BPM</text>';
    out += '<rect x="62" y="46" width="76" height="108" rx="21" fill="url(#gl' + id + ')"/>';
    return out;
  }

  function smartRound(id, look) {
    var cx = 100, cy = 100;
    var out = strap(look, id, 76, 48, [0, 50], [150, 50]);
    out += '<rect x="72" y="40" width="56" height="120" rx="10" fill="url(#cs' + id + ')"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="62" fill="url(#cs' + id + ')" filter="url(#sh' + id + ')"/>';
    out += '<rect x="160" y="80" width="7" height="12" rx="2" fill="' + shade(look.case, 0.2) + '"/>';
    out += '<rect x="160" y="108" width="7" height="12" rx="2" fill="' + shade(look.case, 0.2) + '"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="53" fill="' + look.dial + '"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="47" fill="none" stroke="' + look.accent + '" stroke-width="3.5" stroke-dasharray="210 400" stroke-linecap="round" transform="rotate(-90 100 100)"/>';
    out += '<text x="100" y="98" fill="#fff" font-size="22" font-family="Helvetica, Arial, sans-serif" font-weight="600" text-anchor="middle">10:10</text>';
    out += '<text x="100" y="114" fill="' + look.accent + '" font-size="7" font-family="Helvetica, Arial, sans-serif" text-anchor="middle" letter-spacing="1">8,432 STEPS</text>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="53" fill="url(#gl' + id + ')"/>';
    return out;
  }

  function activity(cx, cy, col) {
    var rings = [[18, col, 80], [13, '#9cff57', 60], [8, '#38e1ff', 42]];
    var out = '';
    rings.forEach(function (rg) {
      var c = 2 * Math.PI * rg[0];
      out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rg[0] + '" fill="none" stroke="' + rg[1] + '" stroke-opacity=".22" stroke-width="4"/>';
      out += '<circle cx="' + cx + '" cy="' + cy + '" r="' + rg[0] + '" fill="none" stroke="' + rg[1] + '" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + (c * rg[2] / 100).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + cx + ' ' + cy + ')"/>';
    });
    return out;
  }

  function wallClock(id, look, live) {
    var cx = 100, cy = 100;
    var out = '<circle cx="' + cx + '" cy="' + cy + '" r="88" fill="url(#cs' + id + ')" filter="url(#sh' + id + ')"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="78" fill="url(#dl' + id + ')"/>';
    out += markers(cx, cy, 76, look);
    out += hands(cx, cy, 76, look, live);
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="78" fill="url(#gl' + id + ')"/>';
    return out;
  }

  function tableClock(id, look, live) {
    var cx = 100, cy = 92;
    var out = '';
    out += '<rect x="44" y="150" width="112" height="18" rx="6" fill="url(#cs' + id + ')" filter="url(#sh' + id + ')"/>';
    out += '<rect x="56" y="166" width="12" height="10" rx="2" fill="' + shade(look.case, -0.3) + '"/>';
    out += '<rect x="132" y="166" width="12" height="10" rx="2" fill="' + shade(look.case, -0.3) + '"/>';
    out += '<path d="M48 152 Q 48 30 100 26 Q 152 30 152 152 Z" fill="url(#cs' + id + ')"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="47" fill="' + shade(look.case, -0.25) + '"/>';
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="43" fill="url(#dl' + id + ')"/>';
    out += markers(cx, cy, 42, look);
    out += hands(cx, cy, 42, look, live);
    out += '<circle cx="' + cx + '" cy="' + cy + '" r="43" fill="url(#gl' + id + ')"/>';
    return out;
  }

  /**
   * render(look, opts) -> SVG markup string
   * opts.live: mark hands so the app can animate them with real time
   * opts.label: accessible label
   */
  function render(look, opts) {
    opts = opts || {};
    var id = 'w' + (++uid);
    var body;
    switch (look.type) {
      case 'square': body = squareWatch(id, look, opts.live); break;
      case 'pocket': body = pocketWatch(id, look, opts.live); break;
      case 'smart': body = smartWatch(id, look); break;
      case 'smartround': body = smartRound(id, look); break;
      case 'wall': body = wallClock(id, look, opts.live); break;
      case 'table': body = tableClock(id, look, opts.live); break;
      default: body = roundWatch(id, look, opts.live);
    }
    return '<svg class="timepiece" viewBox="0 0 200 200" role="img" aria-label="' + (opts.label || 'Timepiece illustration') + '" xmlns="http://www.w3.org/2000/svg">' +
      defs(id, look) + body + '</svg>';
  }

  /** Point every live hand set inside root at the given Date */
  function setTime(root, date) {
    var s = date.getSeconds() + date.getMilliseconds() / 1000;
    var m = date.getMinutes() + s / 60;
    var h = (date.getHours() % 12) + m / 60;
    var sets = root.querySelectorAll('.hands[data-live]');
    for (var i = 0; i < sets.length; i++) {
      var hs = sets[i];
      rot(hs.querySelector('.h-hour'), h * 30);
      rot(hs.querySelector('.h-min'), m * 6);
      rot(hs.querySelector('.h-sec'), Math.floor(s) * 6);
    }
  }
  function rot(el, deg) {
    if (!el) return;
    var t = el.getAttribute('transform') || '';
    var center = t.replace(/rotate\(\s*[-\d.]+/, '').replace(')', '').trim();
    el.setAttribute('transform', 'rotate(' + deg.toFixed(2) + ' ' + center + ')');
  }

  global.WatchRender = { render: render, setTime: setTime };
})(window);
