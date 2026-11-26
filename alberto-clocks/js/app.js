/* ==========================================================
   Alberto Watch Company — Single-Page Application
   Plain JavaScript: no libraries, no frameworks.
   ========================================================== */
(function () {
  'use strict';

  /* ---------------- helpers ---------------- */
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var esc = function (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var money = function (n) {
    return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
  };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } }
  };
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var DATA = null;
  var LINEUP = {};      // id -> lineup
  var PRODUCT = {};     // id -> product
  var userPos = null;   // { lat, lng } from geolocation

  var PAGES = {
    home: 'Home', products: 'Products', technology: 'Technology', prices: 'Price List',
    gallery: 'Gallery', stores: 'Store Locator', support: 'Support', about: 'About Us',
    contact: 'Contact Us', sitemap: 'Site Map'
  };

  /* ---------------- data loading ----------------
     The data store is data/products.json. Browsers block fetch() for
     pages opened straight from disk (file://), so data/products.js
     carries an identical copy as a fallback.                        */
  function loadData() {
    if (location.protocol === 'file:' || !window.fetch) {
      return Promise.resolve(window.ALBERTO_DATA);
    }
    return fetch('data/products.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function () { return window.ALBERTO_DATA; });
  }

  /* ==========================================================
     ROUTER
     ========================================================== */
  var currentPage = null;

  function parseHash() {
    var parts = (location.hash || '#/home').replace(/^#\/?/, '').split('/');
    var page = PAGES[parts[0]] ? parts[0] : 'home';
    return { page: page, param: parts[1] || null };
  }

  function route() {
    var r = parseHash();
    var next = $('.page[data-page="' + r.page + '"]');
    var prev = currentPage ? $('.page[data-page="' + currentPage + '"]') : null;

    // page-specific updates
    if (r.page === 'products') selectLineup(r.param || 'all');

    if (prev !== next) {
      if (prev) prev.classList.remove('is-active');
      next.classList.add('is-active');
      currentPage = r.page;
      window.scrollTo(0, 0);
      $('#main').focus({ preventScroll: true });
    }

    document.title = PAGES[r.page] + (r.page === 'products' && r.param && LINEUP[r.param] ? ' · ' + LINEUP[r.param].name : '') + ' · Alberto Watch Company';
    setActiveNav(r);
    closeMobileNav();
    observeReveals();
    syncHeroVideo(r.page === 'home');
  }

  /* Hero background video: muted, endless loop. It only plays while
     the Home page is showing, and stays paused for visitors who ask
     the system for reduced motion.                                  */
  function syncHeroVideo(onHome) {
    var v = $('#heroVideo');
    if (!v) return;
    v.muted = true;
    if (onHome && !reduceMotion) {
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* autoplay blocked: first frame stays as a still */ });
    } else {
      v.pause();
    }
  }

  function initHero() {
    var cue = $('.scroll-cue');
    if (cue) cue.addEventListener('click', function (e) {
      e.preventDefault();
      $('#homeLineups').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
    });
  }

  function setActiveNav(r) {
    $$('[data-route]').forEach(function (a) {
      var match = a.getAttribute('data-route') === r.page;
      // inside the products dropdown, only the selected line-up is active
      var lu = a.getAttribute('data-lineup');
      if (lu) match = r.page === 'products' && (r.param || 'all') === lu;
      a.classList.toggle('active', match);
      if (match) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  /* ==========================================================
     HEADER: nav, mobile menu, dropdown, visitor counter
     ========================================================== */
  function initNav() {
    var toggle = $('#navToggle'), nav = $('#mainNav');
    toggle.addEventListener('click', function () {
      var open = !nav.classList.contains('open');
      nav.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open);
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    // click feedback (colour pulse) on every menu link
    nav.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (!a) return;
      a.classList.remove('clicked'); void a.offsetWidth; a.classList.add('clicked');

      // on small screens, the "Products" item opens its sub-menu
      var li = a.parentElement;
      if (li.classList.contains('has-drop') && window.innerWidth <= 1100) {
        e.preventDefault();
        li.classList.toggle('open');
      }
    });

    // keyboard: Escape closes dropdown
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') $$('.has-drop.open').forEach(function (li) { li.classList.remove('open'); });
    });
  }

  function closeMobileNav() {
    var nav = $('#mainNav');
    if (!nav.classList.contains('open')) return;
    nav.classList.remove('open');
    $('#navToggle').setAttribute('aria-expanded', 'false');
    $$('.has-drop.open').forEach(function (li) { li.classList.remove('open'); });
  }

  function buildDropdown() {
    var html = '<li><a href="#/products/all" data-route="products" data-lineup="all">All products<small>' + DATA.products.length + ' timepieces</small></a></li>';
    DATA.lineups.forEach(function (l) {
      html += '<li><a href="#/products/' + l.id + '" data-route="products" data-lineup="' + l.id + '">' + esc(l.name) + '<small>' + esc(l.tagline) + '</small></a></li>';
    });
    $('#productsDrop').innerHTML = html;
  }

  /* Visitor counter.
     There is no server, so visits are counted in localStorage: one
     new visit per browser session, added to a base figure set in
     the JSON data store (company.visitorBase).                    */
  function initVisitors() {
    var base = DATA.company.visitorBase || 0;
    var visits = store.get('alberto_visits', 0);
    var counted = false;
    try { counted = sessionStorage.getItem('alberto_session') === '1'; } catch (e) {}
    if (!counted) {
      visits += 1;
      store.set('alberto_visits', visits);
      try { sessionStorage.setItem('alberto_session', '1'); } catch (e) {}
    }
    countUp($('#visitorCount'), base + visits);
  }

  function countUp(el, target) {
    if (reduceMotion) { el.textContent = target.toLocaleString(); return; }
    var start = performance.now(), dur = 1400, from = Math.max(0, target - 400);
    (function tick(now) {
      var t = Math.min(1, (now - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = Math.round(from + (target - from) * eased).toLocaleString();
      if (t < 1) requestAnimationFrame(tick);
    })(start);
  }

  /* ==========================================================
     TICKER: date, time, location (HTML5 Geolocation)
     ========================================================== */
  function initTicker() {
    var track = $('#tickerTrack');
    var group = $('.ticker-group', track);
    // duplicate the content so the scroll loops seamlessly
    var clone = group.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    track.appendChild(clone);

    function setTk(key, text) {
      $$('[data-tk="' + key + '"]').forEach(function (el) { el.textContent = text; });
    }

    function tick() {
      var now = new Date();
      setTk('date', now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }));
      setTk('time', now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      WatchRender.setTime($('#heroClock'), now);
      $('#heroTime').textContent = now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    tick();
    setInterval(tick, 1000);

    // Location
    var tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) {}
    var tzLabel = tz ? tz.split('/').pop().replace(/_/g, ' ') + ' (time zone)' : 'Unknown';

    if (!('geolocation' in navigator)) { setTk('loc', tzLabel + ' — geolocation not supported'); return; }

    requestLocation(function (pos) {
      var lat = pos.lat.toFixed(4), lng = pos.lng.toFixed(4);
      setTk('loc', 'Lat ' + lat + ', Long ' + lng);
      reverseGeocode(pos).then(function (place) {
        if (place) setTk('loc', place + '  (' + lat + ', ' + lng + ')');
      });
    }, function (msg) {
      setTk('loc', tzLabel + ' — ' + msg);
    });
  }

  var geoWaiters = null;
  function requestLocation(ok, fail) {
    if (userPos) { ok(userPos); return; }
    if (geoWaiters) { geoWaiters.push([ok, fail]); return; }
    geoWaiters = [[ok, fail]];
    navigator.geolocation.getCurrentPosition(function (p) {
      userPos = { lat: p.coords.latitude, lng: p.coords.longitude };
      geoWaiters.forEach(function (w) { w[0](userPos); });
      geoWaiters = null;
    }, function (err) {
      var msg = err.code === 1 ? 'location permission denied' : 'location unavailable';
      geoWaiters.forEach(function (w) { w[1] && w[1](msg); });
      geoWaiters = null;
    }, { timeout: 12000, maximumAge: 600000 });
  }

  // Turns coordinates into "City, Country" using a free, key-less service.
  // If offline, the ticker simply keeps showing the coordinates.
  function reverseGeocode(pos) {
    if (!window.fetch) return Promise.resolve(null);
    var url = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + pos.lat + '&longitude=' + pos.lng + '&localityLanguage=en';
    return fetch(url).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      if (!j) return null;
      var city = j.city || j.locality || j.principalSubdivision;
      return [city, j.countryName].filter(Boolean).join(', ') || null;
    }).catch(function () { return null; });
  }

  /* ==========================================================
     PRODUCT CARDS & POPUP
     ========================================================== */
  function art(p, opts) {
    opts = opts || {};
    opts.label = opts.label || p.name;
    if (p.image) {
      var w = opts.width || 800;
      return '<img class="timepiece photo" src="' + p.image + '?auto=format&fit=crop&w=' + w + '&h=' + w + '&q=80"' +
        ' alt="' + esc(opts.label) + '" loading="lazy" data-pid="' + p.id + '" onerror="albertoImgFallback(this)">';
    }
    return WatchRender.render(p.look, opts);
  }

  // If a photo fails to load (offline or removed), show the drawn SVG instead.
  window.albertoImgFallback = function (img) {
    var p = PRODUCT[img.getAttribute('data-pid')];
    if (!p) return;
    var box = document.createElement('span');
    box.innerHTML = WatchRender.render(p.look, { label: img.alt });
    if (box.firstElementChild) img.replaceWith(box.firstElementChild);
  };

  function productCard(p, i) {
    var l = LINEUP[p.lineup];
    return '<button type="button" class="product-card" data-product="' + p.id + '" style="animation-delay:' + Math.min(i * 40, 400) + 'ms" aria-label="View details: ' + esc(p.name) + '">' +
      '<span class="badge">' + esc(l.name) + '</span>' +
      '<span class="art">' + art(p) + '</span>' +
      '<span class="info">' +
        '<span class="brand-tag">' + esc(p.brand) + '</span>' +
        '<h3>' + esc(p.name) + '</h3>' +
        '<span class="row"><span class="price">' + money(p.price) + '</span><span class="more">View details →</span></span>' +
      '</span>' +
    '</button>';
  }

  var lastFocus = null;

  function openProduct(id) {
    var p = PRODUCT[id];
    if (!p) return;
    var l = LINEUP[p.lineup];
    $('#modalBody').innerHTML =
      '<div class="modal-art">' + art(p, { live: p.look.type !== 'smart' && p.look.type !== 'smartround' }) + '</div>' +
      '<div class="modal-info">' +
        '<p class="eyebrow">' + esc(p.brand) + ' · ' + esc(l.name) + '</p>' +
        '<h2 id="modalTitle">' + esc(p.name) + '</h2>' +
        '<p class="modal-price">' + money(p.price) + '</p>' +
        '<p>' + esc(p.description) + '</p>' +
        '<dl class="spec">' +
          '<dt>Movement</dt><dd>' + esc(p.movement) + '</dd>' +
          '<dt>Case size</dt><dd>' + esc(p.caseSize) + '</dd>' +
          '<dt>Material</dt><dd>' + esc(p.material) + '</dd>' +
          '<dt>Water resistance</dt><dd>' + esc(p.water) + '</dd>' +
          '<dt>Year</dt><dd>' + esc(p.year) + '</dd>' +
          '<dt>Reference</dt><dd>ALB-' + p.id.toUpperCase() + '</dd>' +
        '</dl>' +
        '<ul class="chips">' + p.features.map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>' +
        '<div class="modal-actions">' +
          '<a class="btn btn-gold" href="#/contact" data-enquire="' + p.id + '">Enquire about this piece</a>' +
          '<a class="btn btn-ghost" href="#/products/' + p.lineup + '">More ' + esc(l.name) + '</a>' +
        '</div>' +
      '</div>';
    WatchRender.setTime($('#modalBody'), new Date());
    showDialog($('#productModal'));
  }

  function showDialog(el) {
    lastFocus = document.activeElement;
    el.hidden = false;
    el.classList.remove('closing');
    el.classList.add('opening');
    document.body.style.overflow = 'hidden';
    var btn = $('[data-close]', el.querySelector('.modal-panel') || el) || $('button', el);
    setTimeout(function () { btn && btn.focus(); }, 30);
  }

  function hideDialog(el) {
    if (el.hidden) return;
    el.classList.remove('opening');
    el.classList.add('closing');
    setTimeout(function () {
      el.hidden = true;
      el.classList.remove('closing');
      if ($('#productModal').hidden && $('#lightbox').hidden) document.body.style.overflow = '';
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }, reduceMotion ? 0 : 240);
  }

  function initDialogs() {
    var modal = $('#productModal');
    modal.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]')) hideDialog(modal);
      var enq = e.target.closest('[data-enquire]');
      if (enq) {
        var p = PRODUCT[enq.getAttribute('data-enquire')];
        $('#contactSubject').value = 'Enquiry: ' + p.name + ' (ALB-' + p.id.toUpperCase() + ')';
        hideDialog(modal);
      }
      if (e.target.closest('a[href^="#/products"]')) hideDialog(modal);
    });

    // any product card or price row anywhere opens the popup
    document.addEventListener('click', function (e) {
      var card = e.target.closest('[data-product]');
      if (card) openProduct(card.getAttribute('data-product'));
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { hideDialog(modal); hideDialog($('#lightbox')); }
      if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-product]')) openProduct(e.target.getAttribute('data-product'));
      if (e.key === 'Tab') trapFocus(e);
    });
  }

  function trapFocus(e) {
    var open = !$('#productModal').hidden ? $('#productModal') : (!$('#lightbox').hidden ? $('#lightbox') : null);
    if (!open) return;
    var f = $$('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])', open);
    if (!f.length) return;
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  /* ==========================================================
     HOME
     ========================================================== */
  function renderHome() {
    $('#heroClock').innerHTML = WatchRender.render(
      { type: 'wall', case: '#c19a5b', dial: '#191512', accent: '#e9dcc0', markers: 'index', second: '#e3c891' },
      { live: true, label: 'Live clock' }
    );

    $('#homeLineups').innerHTML = DATA.lineups.map(function (l) {
      var items = DATA.products.filter(function (p) { return p.lineup === l.id; });
      var hero = items[0];
      return '<a class="lineup-card reveal" href="#/products/' + l.id + '">' +
        art(hero, { label: l.name }) +
        '<span class="count">' + items.length + ' pieces</span>' +
        '<h3>' + esc(l.name) + '</h3>' +
        '<p>' + esc(l.tagline) + '</p>' +
      '</a>';
    }).join('');

    var featured = (DATA.featured || []).map(function (id) { return PRODUCT[id]; }).filter(Boolean);
    $('#featured').innerHTML = featured.map(productCard).join('');
  }

  /* ==========================================================
     PRODUCTS (line-up selection)
     ========================================================== */
  function renderLineupTabs() {
    var tabs = [{ id: 'all', name: 'All' }].concat(DATA.lineups);
    $('#lineupTabs').innerHTML = tabs.map(function (t) {
      return '<button class="tab" role="tab" data-lineup-tab="' + t.id + '" aria-selected="false">' + esc(t.name) + '</button>';
    }).join('');
    $('#lineupTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-lineup-tab]');
      if (b) location.hash = '#/products/' + b.getAttribute('data-lineup-tab');
    });
  }

  function selectLineup(id) {
    if (id !== 'all' && !LINEUP[id]) id = 'all';
    $$('[data-lineup-tab]').forEach(function (b) {
      b.setAttribute('aria-selected', b.getAttribute('data-lineup-tab') === id ? 'true' : 'false');
    });
    var list = id === 'all' ? DATA.products : DATA.products.filter(function (p) { return p.lineup === id; });
    $('#products-title').textContent = id === 'all' ? 'The collection' : LINEUP[id].name;
    $('#lineupDesc').textContent = id === 'all'
      ? 'Select a product line-up to see every watch and clock in it.'
      : LINEUP[id].description;
    $('#resultCount').textContent = 'Showing ' + list.length + ' timepiece' + (list.length === 1 ? '' : 's');
    $('#productGrid').innerHTML = list.map(productCard).join('');
  }

  /* ==========================================================
     TECHNOLOGY
     ========================================================== */
  var ICONS = {
    gear: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><g class="spin"><circle cx="24" cy="24" r="7"/><path d="M24 4v6M24 38v6M4 24h6M38 24h6M9.9 9.9l4.2 4.2M33.9 33.9l4.2 4.2M9.9 38.1l4.2-4.2M33.9 14.1l4.2-4.2"/><circle cx="24" cy="24" r="14"/></g></svg>',
    rotor: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><circle cx="24" cy="24" r="19"/><g class="spin"><path d="M24 24 L10 30 A15 15 0 0 0 38 30 Z" fill="currentColor" fill-opacity=".25"/></g><circle cx="24" cy="24" r="3" fill="currentColor"/></svg>',
    crystal: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><path d="M24 4 L34 14 L34 34 L24 44 L14 34 L14 14 Z"/><path d="M14 14 L24 20 L34 14 M24 20 V44"/><path d="M4 24h6M38 24h6" stroke-dasharray="2 2"/></svg>',
    sun: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><circle cx="24" cy="24" r="8"/><g class="spin"><path d="M24 4v6M24 38v6M4 24h6M38 24h6M10 10l4 4M34 34l4 4M10 38l4-4M34 14l4-4"/></g></svg>',
    pulse: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><rect x="12" y="6" width="24" height="36" rx="7"/><path d="M14 25h6l2-6 4 12 2-6h6"/></svg>',
    drop: '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><path d="M24 5 C 24 5 10 21 10 30 a14 14 0 0 0 28 0 C 38 21 24 5 24 5 Z"/><path d="M17 31 a7 7 0 0 0 7 7"/></svg>'
  };
  var TECH_MATCH = {
    mech: function (p) { return /manual|mechanical|tuning/i.test(p.movement); },
    auto: function (p) { return /automatic/i.test(p.movement); },
    quartz: function (p) { return /quartz/i.test(p.movement); },
    eco: function (p) { return /eco-drive|solar/i.test(p.movement + ' ' + p.name); },
    smart: function (p) { return p.lineup === 'smart'; },
    water: function (p) { var m = /(\d+)\s*m\b/.exec(p.water); return (m && +m[1] >= 100) || /ATM/.test(p.water); }
  };

  // Extra presentation details for each technology card (photo + key figure)
  var UNSPLASH = 'https://images.unsplash.com/photo-';
  var TECH_EXTRA = {
    mech:   { img: '1509048191080-d2984bad6ae5', fig: '28,800', unit: 'vibrations per hour' },
    auto:   { img: '1526045431048-f857369baa09', fig: '40–80 h', unit: 'power reserve' },
    quartz: { img: '1434056886845-dac89ffe9b56', fig: '32,768', unit: 'vibrations per second' },
    eco:    { img: '1495856458515-0637185db551', fig: 'Months', unit: 'of power from one charge' },
    smart:  { img: '1617625802912-cde586faf331', fig: '24/7', unit: 'heart-rate & activity tracking' },
    water:  { img: '1596516109370-29001ec8ec36', fig: '100 m+', unit: 'tested before it leaves us' }
  };

  // "Which movement is right for you?" comparison
  var TECH_COMPARE = {
    cols: ['mech', 'auto', 'quartz', 'eco', 'smart'],
    rows: [
      ['Power source', ['Hand-wound mainspring', 'Your wrist movement winds it', 'Battery', 'Any light, stored in a cell', 'Rechargeable battery']],
      ['Accuracy', ['A few seconds a day', 'A few seconds a day', 'About ±15 s a month', 'About ±15 s a month', 'Synced to your phone']],
      ['Upkeep', ['Wind every 1–2 days', 'None if worn daily', 'New battery every 2–3 years', 'No battery changes', 'Charge every day to few weeks']],
      ['Best for', ['Collectors & tradition', 'Everyday luxury', 'Easy, accurate daily wear', 'Set-and-forget wear', 'Fitness & notifications']]
    ]
  };

  function renderTech() {
    var stats = [
      ['28,800', 'Balance-wheel beats per hour'],
      ['32,768', 'Quartz vibrations per second'],
      ['±15 s', 'Quartz accuracy per month'],
      ['80 h', 'Power reserve, modern automatics']
    ];
    $('#techStats').innerHTML = stats.map(function (s) {
      return '<li class="reveal"><b>' + esc(s[0]) + '</b><span>' + esc(s[1]) + '</span></li>';
    }).join('');

    $('#techGrid').innerHTML = DATA.technology.map(function (t, i) {
      var x = TECH_EXTRA[t.id] || {};
      var match = TECH_MATCH[t.id] ? DATA.products.filter(TECH_MATCH[t.id]) : [];
      var faces = match.slice(0, 4).map(function (p) {
        return '<button type="button" class="tc-face" data-product="' + p.id + '" title="' + esc(p.name) + '" aria-label="View ' + esc(p.name) + '">' +
          (p.image ? '<img src="' + p.image + '?auto=format&fit=crop&w=96&h=96&q=70" alt="" loading="lazy">' : '') + '</button>';
      }).join('');
      var more = match.length > 4 ? '<span class="tc-face tc-more">+' + (match.length - 4) + '</span>' : '';
      return '<article class="tech-card reveal" id="tech-' + t.id + '">' +
        '<div class="tc-media">' +
          (x.img ? '<img src="' + UNSPLASH + x.img + '?auto=format&fit=crop&w=720&h=440&q=75" alt="" loading="lazy">' : '') +
          '<span class="tc-num">' + (i < 9 ? '0' : '') + (i + 1) + '</span>' +
          '<span class="tc-icon">' + (ICONS[t.icon] || '') + '</span>' +
        '</div>' +
        '<div class="tc-body">' +
          (x.fig ? '<p class="tc-fig"><b>' + esc(x.fig) + '</b> ' + esc(x.unit) + '</p>' : '') +
          '<h3>' + esc(t.title) + '</h3>' +
          '<p>' + esc(t.body) + '</p>' +
          (match.length ? '<div class="tc-seen"><div class="tc-faces">' + faces + more + '</div>' +
            '<span>Found in <b>' + match.length + '</b> of our pieces</span></div>' : '') +
        '</div>' +
      '</article>';
    }).join('');

    var byId = {};
    DATA.technology.forEach(function (t) { byId[t.id] = t; });
    var head = '<thead><tr><th scope="col"><span class="sr-only">Feature</span></th>' + TECH_COMPARE.cols.map(function (id) {
      return '<th scope="col"><span class="tcmp-icon">' + (ICONS[byId[id].icon] || '') + '</span>' + esc(byId[id].title.replace(/ movements| winding| accuracy| & solar| sensors/i, '')) + '</th>';
    }).join('') + '</tr></thead>';
    var fromRow = '<tr><th scope="row">Our prices from</th>' + TECH_COMPARE.cols.map(function (id) {
      var m = DATA.products.filter(TECH_MATCH[id]);
      return '<td class="tcmp-price">' + (m.length ? money(Math.min.apply(null, m.map(function (p) { return p.price; }))) : '—') + '</td>';
    }).join('') + '</tr>';
    var body = TECH_COMPARE.rows.map(function (r) {
      return '<tr><th scope="row">' + esc(r[0]) + '</th>' + r[1].map(function (c) { return '<td>' + esc(c) + '</td>'; }).join('') + '</tr>';
    }).join('');
    $('#techCompare').innerHTML = head + '<tbody>' + body + fromRow + '</tbody>';
  }

  /* ==========================================================
     PRICE LIST
     ========================================================== */
  function initPrices() {
    var sel = $('#priceFilter');
    DATA.lineups.forEach(function (l) { sel.insertAdjacentHTML('beforeend', '<option value="' + l.id + '">' + esc(l.name) + '</option>'); });
    ['#priceSearch', '#priceFilter', '#priceSort'].forEach(function (s) {
      $(s).addEventListener('input', renderPrices);
    });
    renderPrices();
  }

  function renderPrices() {
    var q = $('#priceSearch').value.trim().toLowerCase();
    var f = $('#priceFilter').value;
    var sort = $('#priceSort').value;
    var order = DATA.lineups.map(function (l) { return l.id; });

    var list = DATA.products.filter(function (p) {
      return (f === 'all' || p.lineup === f) &&
        (!q || (p.name + ' ' + p.brand + ' ' + p.movement).toLowerCase().indexOf(q) > -1);
    });
    list.sort(function (a, b) {
      if (sort === 'asc') return a.price - b.price;
      if (sort === 'desc') return b.price - a.price;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return order.indexOf(a.lineup) - order.indexOf(b.lineup) || a.price - b.price;
    });

    var html = '', group = null;
    list.forEach(function (p) {
      if (sort === 'lineup' && p.lineup !== group) {
        group = p.lineup;
        html += '<tr class="group"><td colspan="5">' + esc(LINEUP[group].name) + '</td></tr>';
      }
      html += '<tr data-product="' + p.id + '" tabindex="0">' +
        '<td><span class="pname">' + art(p, { width: 120 }) + esc(p.name) + '</span></td>' +
        '<td>' + esc(p.brand) + '</td>' +
        '<td>' + esc(LINEUP[p.lineup].name) + '</td>' +
        '<td>' + esc(p.movement) + '</td>' +
        '<td class="num">' + money(p.price) + '</td></tr>';
    });
    if (!list.length) html = '<tr><td colspan="5" class="muted" style="text-align:center;padding:40px">No timepieces match your search.</td></tr>';
    $('#priceBody').innerHTML = html;
  }

  /* ==========================================================
     GALLERY + LIGHTBOX
     ========================================================== */
  var galleryList = [], lbIndex = 0;

  function initGallery() {
    var tabs = [{ id: 'all', name: 'All' }].concat(DATA.lineups);
    $('#galleryTabs').innerHTML = tabs.map(function (t, i) {
      return '<button class="tab" data-gtab="' + t.id + '" aria-selected="' + (i === 0) + '">' + esc(t.name) + '</button>';
    }).join('');
    $('#galleryTabs').addEventListener('click', function (e) {
      var b = e.target.closest('[data-gtab]');
      if (!b) return;
      $$('[data-gtab]').forEach(function (x) { x.setAttribute('aria-selected', x === b); });
      renderGallery(b.getAttribute('data-gtab'));
    });
    $('#galleryGrid').addEventListener('click', function (e) {
      var it = e.target.closest('[data-gi]');
      if (it) openLightbox(+it.getAttribute('data-gi'));
    });

    var lb = $('#lightbox');
    $('.lb-prev', lb).addEventListener('click', function () { stepLightbox(-1); });
    $('.lb-next', lb).addEventListener('click', function () { stepLightbox(1); });
    lb.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target === lb) hideDialog(lb);
    });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
    });
    // swipe on touch screens
    var x0 = null;
    lb.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
      x0 = null;
    });

    renderGallery('all');
  }

  function renderGallery(id) {
    galleryList = id === 'all' ? DATA.products.slice() : DATA.products.filter(function (p) { return p.lineup === id; });
    $('#galleryGrid').innerHTML = galleryList.map(function (p, i) {
      return '<button type="button" class="g-item" data-gi="' + i + '" style="animation-delay:' + Math.min(i * 35, 400) + 'ms" aria-label="View larger: ' + esc(p.name) + '">' +
        '<div class="g-art">' + art(p) + '</div>' +
        '<figcaption>' + esc(p.name) + '</figcaption></button>';
    }).join('');
  }

  function openLightbox(i) { lbIndex = i; paintLightbox(); showDialog($('#lightbox')); }
  function stepLightbox(d) { lbIndex = (lbIndex + d + galleryList.length) % galleryList.length; paintLightbox(); }
  function paintLightbox() {
    var p = galleryList[lbIndex];
    $('#lbImage').innerHTML = art(p, { live: true, width: 1400 });
    WatchRender.setTime($('#lbImage'), new Date());
    $('#lbCaption').innerHTML = esc(p.name) + '<small>' + esc(p.brand) + ' · ' + money(p.price) + ' · ' + (lbIndex + 1) + ' / ' + galleryList.length + '</small>';
  }

  /* ==========================================================
     STORE LOCATOR
     ========================================================== */
  function km(a, b) {
    var R = 6371, toRad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * toRad, dLng = (b.lng - a.lng) * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  /* Each showroom's own time zone, so "Open now" is correct wherever the visitor is */
  var STORE_TZ = { nyc: 'America/New_York', mia: 'America/New_York', chi: 'America/Chicago', la: 'America/Los_Angeles' };
  var STORE_ICON = {
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    route: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 11l18-8-8 18-2-8z"/></svg>'
  };
  var storeFilter = 'all';
  var storeSelected = null;

  // Works out "Open now · closes 19:00" in the showroom's local time.
  function storeStatus(s) {
    var m = /Mon–Sat\s*(\d+)–(\d+)\s*·\s*Sun\s*(\d+)–(\d+)/.exec(s.hours);
    if (!m) return null;
    try {
      var parts = {};
      new Intl.DateTimeFormat('en-US', { timeZone: STORE_TZ[s.id], weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
      var day = parts.weekday, now = (+parts.hour % 24) + (+parts.minute) / 60;
      var today = day === 'Sun' ? [+m[3], +m[4]] : [+m[1], +m[2]];
      var tomorrowOpen = day === 'Sat' ? +m[3] : +m[1];
      var local = new Date().toLocaleTimeString('en-US', { timeZone: STORE_TZ[s.id], hour: 'numeric', minute: '2-digit' });
      if (now >= today[0] && now < today[1]) return { open: true, text: 'Open now', sub: 'Closes ' + today[1] + ':00', local: local };
      if (now < today[0]) return { open: false, text: 'Closed', sub: 'Opens ' + today[0] + ':00', local: local };
      return { open: false, text: 'Closed', sub: 'Opens tomorrow ' + tomorrowOpen + ':00', local: local };
    } catch (e) { return null; }
  }

  function storeInitials(city) {
    var c = city.replace(/\s*\(.*\)/, '');
    var w = c.split(/\s+/);
    return w.length > 1 ? (w[0][0] + w[1][0]).toUpperCase() : c.slice(0, 3).toUpperCase();
  }

  function telHref(p) { return 'tel:' + p.replace(/[^\d+]/g, ''); }
  function dirHref(s) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.address); }

  function renderStoreStats() {
    var workshops = DATA.stores.filter(function (s) { return s.services.indexOf('Repair workshop') > -1; }).length;
    var stats = [[DATA.stores.length, 'Showrooms'], [workshops, 'Repair workshops'], ['7', 'Days a week'], ['Free', 'Battery check']];
    $('#storeStats').innerHTML = stats.map(function (s) {
      return '<li><b>' + esc(String(s[0])) + '</b><span>' + esc(s[1]) + '</span></li>';
    }).join('');

    var all = [];
    DATA.stores.forEach(function (s) { s.services.forEach(function (x) { if (all.indexOf(x) < 0) all.push(x); }); });
    $('#storeFilters').innerHTML = ['all'].concat(all).map(function (x) {
      return '<button type="button" class="loc-chip" data-sfilter="' + esc(x) + '" aria-pressed="' + (x === storeFilter) + '">' + (x === 'all' ? 'All showrooms' : esc(x)) + '</button>';
    }).join('');
  }

  function renderStores() {
    var list = DATA.stores
      .filter(function (s) { return storeFilter === 'all' || s.services.indexOf(storeFilter) > -1; })
      .map(function (s) { return { s: s, d: userPos ? km(userPos, s) : null }; });
    if (userPos) list.sort(function (a, b) { return a.d - b.d; });
    var nearestId = userPos && list.length ? list[0].s.id : null;
    if (!list.some(function (it) { return it.s.id === storeSelected; })) storeSelected = list.length ? list[0].s.id : null;

    $('#storeGrid').innerHTML = list.length ? list.map(function (it, i) {
      var s = it.s, st = storeStatus(s);
      var isSel = s.id === storeSelected, isNear = s.id === nearestId;
      var dist = it.d === null ? '' :
        '<span class="loc-dist"><b>' + Math.round(it.d * 0.621371).toLocaleString() + '</b> mi · ' + Math.round(it.d).toLocaleString() + ' km</span>';
      return '<article class="loc-card' + (isSel ? ' is-selected' : '') + (isNear ? ' is-nearest' : '') + '" style="animation-delay:' + i * 70 + 'ms">' +
        (isNear ? '<span class="loc-ribbon">Nearest to you</span>' : '') +
        '<button type="button" class="loc-pick" data-store="' + s.id + '" aria-pressed="' + isSel + '" aria-label="Show ' + esc(s.city) + ' on the map">' +
          '<span class="loc-badge">' + storeInitials(s.city) + '</span>' +
          '<span class="loc-head">' +
            '<span class="loc-city">' + esc(s.city) + '</span>' +
            '<span class="loc-addr">' + esc(s.address) + '</span>' +
          '</span>' +
          dist +
        '</button>' +
        '<div class="loc-meta">' +
          (st ? '<span class="loc-status ' + (st.open ? 'open' : 'closed') + '"><i></i>' + st.text + ' <em>· ' + st.sub + '</em></span>' : '') +
          '<span class="loc-hours">' + STORE_ICON.clock + esc(s.hours) + '</span>' +
        '</div>' +
        '<ul class="loc-tags">' + s.services.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
        '<div class="loc-actions">' +
          '<a class="btn btn-ghost btn-sm" href="' + dirHref(s) + '" target="_blank" rel="noopener">' + STORE_ICON.route + 'Directions</a>' +
          '<a class="btn btn-ghost btn-sm" href="' + telHref(s.phone) + '">' + STORE_ICON.phone + esc(s.phone) + '</a>' +
        '</div>' +
      '</article>';
    }).join('') : '<p class="muted loc-empty">No showroom offers that service yet.</p>';

    renderNetwork(nearestId);
    renderStoreMap();
  }

  /* ---------- US network map (pure SVG, works offline) ---------- */
  // Simplified outline of the lower 48 states as [lat, lng] points
  var US_OUTLINE = [
    [48.4, -124.7], [46.2, -124], [43.4, -124.3], [42, -124.4], [40.4, -124.4], [38.9, -123.7], [37.8, -122.5], [36.6, -121.9],
    [34.5, -120.6], [34, -118.5], [33.4, -117.6], [32.5, -117.1], [32.7, -114.7], [31.3, -111], [31.3, -108.2], [31.8, -106.5],
    [29.6, -104.5], [29.8, -101.4], [27.5, -99.5], [25.9, -97.2], [27.8, -97.4], [29.4, -94.7], [29.7, -93.8], [29.5, -92.3],
    [29.1, -90.2], [30.2, -88.5], [30.4, -86.5], [29.9, -85], [29.1, -83], [27.8, -82.7], [26.2, -81.8], [25.2, -80.8],
    [25.8, -80.1], [27.2, -80.2], [29.9, -81.3], [31.5, -81.2], [32.8, -79.9], [33.9, -78], [34.6, -77], [35.2, -75.5],
    [36.9, -76], [38.9, -74.9], [40.5, -74], [40.9, -72.5], [41.3, -72], [41.5, -71], [41.7, -70], [42.1, -70.2], [42.6, -70.7],
    [43.6, -70.2], [44.4, -68.3], [44.8, -66.95], [47.3, -68.3], [47.4, -69.2], [45, -71.5], [45, -74.7], [43.6, -76.2],
    [43.3, -79.1], [42.3, -79.8], [41.7, -81.7], [41.7, -83.4], [42.3, -83.1], [43, -82.4], [45.3, -83.4], [46, -84.5],
    [46.5, -84.4], [47.5, -88], [48, -89.5], [48.6, -93], [49, -95.2], [49, -123.3], [48.4, -124.7]
  ];
  var NET = { lng0: -126, lng1: -65.5, lat0: 23.6, lat1: 50.2, w: 1000 };
  NET.k = NET.w / ((NET.lng1 - NET.lng0) * Math.cos(38 * Math.PI / 180));
  NET.h = Math.round((NET.lat1 - NET.lat0) * NET.k);
  function proj(lat, lng) {
    return [((lng - NET.lng0) * Math.cos(38 * Math.PI / 180) * NET.k).toFixed(1), ((NET.lat1 - lat) * NET.k).toFixed(1)];
  }

  function renderNetwork(nearestId) {
    var box = $('#storeNetwork');
    if (!box) return;
    var outline = 'M' + US_OUTLINE.map(function (p) { return proj(p[0], p[1]).join(' '); }).join(' L') + 'Z';
    var hub = DATA.stores[0], H = proj(hub.lat, hub.lng);
    var arcs = DATA.stores.slice(1).map(function (s, i) {
      var P = proj(s.lat, s.lng), mx = (+H[0] + +P[0]) / 2, my = (+H[1] + +P[1]) / 2;
      var d = Math.hypot(P[0] - H[0], P[1] - H[1]);
      return '<path class="net-arc" style="animation-delay:' + i * 0.6 + 's" d="M' + H.join(' ') + ' Q' + mx.toFixed(1) + ' ' + (my - d * 0.28).toFixed(1) + ' ' + P.join(' ') + '"/>';
    }).join('');
    var labelPos = { nyc: [16, -14, 'start'], mia: [16, 6, 'start'], chi: [0, -26, 'middle'], la: [14, 32, 'start'] };
    var pins = DATA.stores.map(function (s) {
      var P = proj(s.lat, s.lng), L = labelPos[s.id] || [16, 5, 'start'];
      var cls = 'net-pin' + (s.id === storeSelected ? ' is-selected' : '') + (s.id === nearestId ? ' is-nearest' : '');
      return '<g class="' + cls + '" data-store="' + s.id + '" tabindex="0" role="button" aria-label="Show ' + esc(s.city) + ' on the map" transform="translate(' + P.join(' ') + ')">' +
        '<circle class="net-ring" r="10"/><circle class="net-halo" r="16"/><circle class="net-dot" r="6.5"/>' +
        '<text x="' + L[0] + '" y="' + L[1] + '" text-anchor="' + L[2] + '">' + esc(s.city.replace(/\s*\(.*\)/, '')) + '</text>' +
      '</g>';
    }).join('');
    var you = '';
    if (userPos && userPos.lat > NET.lat0 && userPos.lat < NET.lat1 && userPos.lng > NET.lng0 && userPos.lng < NET.lng1) {
      var U = proj(userPos.lat, userPos.lng);
      you = '<g class="net-you" transform="translate(' + U.join(' ') + ')"><circle r="5"/><text x="10" y="4">You</text></g>';
    }
    box.innerHTML =
      '<svg viewBox="-20 -30 ' + (NET.w + 40) + ' ' + (NET.h + 50) + '" role="img" aria-label="Alberto showrooms: ' + DATA.stores.map(function (s) { return esc(s.city); }).join(', ') + '">' +
        '<defs><pattern id="netDots" width="11" height="11" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6"/></pattern>' +
        '<radialGradient id="netGlow"><stop offset="0" stop-color="#c19a5b" stop-opacity=".35"/><stop offset="1" stop-color="#c19a5b" stop-opacity="0"/></radialGradient></defs>' +
        '<path class="net-land" d="' + outline + '"/><path class="net-land-dots" d="' + outline + '" fill="url(#netDots)"/>' +
        '<circle cx="' + H[0] + '" cy="' + H[1] + '" r="120" fill="url(#netGlow)"/>' +
        arcs + you + pins +
      '</svg>' +
      '<div class="net-legend"><span><i class="lg-hub"></i>Flagship &amp; showrooms</span><span><i class="lg-arc"></i>Linked to the New York workshop</span>' +
        (you ? '<span><i class="lg-you"></i>You</span>' : '') + '</div>';
  }

  var mapShownFor = null;
  function renderStoreMap() {
    var s = DATA.stores.filter(function (x) { return x.id === storeSelected; })[0];
    var box = $('#storeMap');
    if (!s) { box.innerHTML = ''; mapShownFor = null; return; }
    var st = storeStatus(s);
    var info =
      '<div class="lm-head">' +
        '<p class="eyebrow">On the map</p>' +
        '<h3>' + esc(s.city) + '</h3>' +
        '<p class="lm-addr">' + STORE_ICON.pin + esc(s.address) + '</p>' +
      '</div>';
    var foot =
      '<div class="lm-foot">' +
        (st ? '<div><span class="k">Local time</span><span class="v">' + esc(st.local) + '</span></div>' +
              '<div><span class="k">Status</span><span class="v ' + (st.open ? 'ok' : 'no') + '">' + st.text + '</span></div>' : '') +
        '<div class="lm-btns">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-book="' + s.id + '">Book a visit here</button>' +
          '<a class="btn btn-gold btn-sm" href="' + dirHref(s) + '" target="_blank" rel="noopener">Get directions ↗</a>' +
        '</div>' +
      '</div>';
    if (mapShownFor === s.id) { // keep the iframe, refresh the text only
      $('.lm-head', box).outerHTML = info;
      $('.lm-foot', box).outerHTML = foot;
      return;
    }
    mapShownFor = s.id;
    var src = 'https://www.google.com/maps/embed?origin=mfe&pb=!1m3!2m1!1s' + encodeURIComponent(s.address).replace(/%20/g, '+') + '!6i15';
    box.innerHTML = info +
      '<div class="lm-frame"><iframe title="Map: ' + esc(s.city) + ' showroom" src="' + src + '" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>' +
      '<span class="lm-pulse" aria-hidden="true"></span></div>' + foot;
  }

  function initStores() {
    renderStoreStats();
    renderStores();
    setInterval(function () { if (currentPage === 'stores') renderStores(); }, 60000); // keep "Open now" fresh

    $('#storeFilters').addEventListener('click', function (e) {
      var b = e.target.closest('[data-sfilter]');
      if (!b) return;
      storeFilter = b.getAttribute('data-sfilter');
      $$('[data-sfilter]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      renderStores();
    });
    function pickStore(id, scroll) {
      storeSelected = id;
      if (storeFilter !== 'all' && !DATA.stores.some(function (s) { return s.id === id && s.services.indexOf(storeFilter) > -1; })) {
        storeFilter = 'all';
        $('[data-sfilter]').forEach(function (x) { x.setAttribute('aria-pressed', x.getAttribute('data-sfilter') === 'all'); });
      }
      renderStores();
      if (scroll) $('#storeMap').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    }
    $('#storeGrid').addEventListener('click', function (e) {
      var b = e.target.closest('[data-store]');
      if (b) pickStore(b.getAttribute('data-store'), window.innerWidth <= 980);
    });
    var net = $('#storeNetwork');
    net.addEventListener('click', function (e) {
      var g = e.target.closest('[data-store]');
      if (g) pickStore(g.getAttribute('data-store'), true);
    });
    net.addEventListener('keydown', function (e) {
      var g = e.target.closest('[data-store]');
      if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); pickStore(g.getAttribute('data-store'), true); }
    });
    $('#storeMap').addEventListener('click', function (e) {
      var b = e.target.closest('[data-book]');
      if (!b) return;
      $('#visitStore').value = b.getAttribute('data-book');
      fillVisitTimes();
      $('#bookVisit').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      setTimeout(function () { $('#visitForm [name="reason"]').focus({ preventScroll: true }); }, reduceMotion ? 0 : 500);
    });
    initVisitForm();

    $('#findNearest').addEventListener('click', function () {
      var hint = $('#storeHint'), btn = this;
      if (!('geolocation' in navigator)) { hint.textContent = 'Your browser does not support geolocation.'; return; }
      hint.textContent = 'Finding your location…';
      btn.classList.add('is-busy');
      requestLocation(function () {
        btn.classList.remove('is-busy');
        storeSelected = null; // select the nearest one
        renderStores();
        hint.textContent = 'Sorted by distance from your current location.';
      }, function (msg) {
        btn.classList.remove('is-busy');
        hint.textContent = 'We couldn\'t get your location (' + msg + '). Showing all showrooms.';
      });
    });
  }

  /* Booking form: time slots follow the chosen showroom's opening hours */
  function isoDate(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fillVisitTimes() {
    var s = DATA.stores.filter(function (x) { return x.id === $('#visitStore').value; })[0];
    var sel = $('#visitTime'), keep = sel.value;
    var m = s && /Mon–Sat\s*(\d+)–(\d+)\s*·\s*Sun\s*(\d+)–(\d+)/.exec(s.hours);
    var dv = $('#visitDate').value;
    if (!m || !dv) { sel.innerHTML = '<option value="">' + (s ? 'Pick a date first' : 'Pick a showroom first') + '</option>'; return; }
    var sunday = new Date(dv + 'T12:00:00').getDay() === 0;
    var from = sunday ? +m[3] : +m[1], to = sunday ? +m[4] : +m[2], opts = '<option value="">Choose a time…</option>';
    for (var h = from; h < to; h++) {
      ['00', '30'].forEach(function (mm) { var t = h + ':' + mm; opts += '<option' + (t === keep ? ' selected' : '') + '>' + t + '</option>'; });
    }
    sel.innerHTML = opts;
  }
  function initVisitForm() {
    $('#visitStore').innerHTML = '<option value="">Choose a showroom…</option>' + DATA.stores.map(function (s) {
      return '<option value="' + s.id + '">' + esc(s.city) + '</option>';
    }).join('');
    var d = $('#visitDate'), today = new Date(), max = new Date();
    max.setDate(max.getDate() + 60);
    d.min = isoDate(today); d.max = isoDate(max);
    $('#visitStore').addEventListener('change', fillVisitTimes);
    d.addEventListener('change', fillVisitTimes);
    $('#visitForm').addEventListener('reset', function () { setTimeout(fillVisitTimes, 0); });
    fillVisitTimes();
    initForm($('#visitForm'), 'alberto_visits_booked', 'Thanks {name}! Your visit is booked — we\'ll email you a confirmation.');
  }

  /* ==========================================================
     SUPPORT, ABOUT, CONTACT
     ========================================================== */
  var CONTACT_ICONS = {
    mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>'
  };

  function contactBlock() {
    var c = DATA.company;
    return '<h3>Alberto Watch Company</h3><ul class="contact-list">' +
      '<li>' + CONTACT_ICONS.mail + '<div><span class="k">Email</span><a class="v" href="mailto:' + c.email + '">' + esc(c.email) + '</a></div></li>' +
      '<li>' + CONTACT_ICONS.phone + '<div><span class="k">Phone</span><a class="v" href="tel:' + c.phone.replace(/[^\d+]/g, '') + '">' + esc(c.phone) + '</a></div></li>' +
      '<li>' + CONTACT_ICONS.pin + '<div><span class="k">Address</span><span class="v">' + esc(c.address) + '</span></div></li>' +
      '<li>' + CONTACT_ICONS.clock + '<div><span class="k">Hours</span><span class="v">' + esc(c.hours) + '</span></div></li>' +
      '<li>' + CONTACT_ICONS.mail + '<div><span class="k">Repairs &amp; service</span><a class="v" href="mailto:' + c.supportEmail + '">' + esc(c.supportEmail) + '</a></div></li>' +
    '</ul>';
  }

  function renderSupport() {
    $('#serviceGrid').innerHTML = DATA.services.map(function (s) {
      return '<article class="service reveal"><h3>' + esc(s.title) + '</h3><p class="from">from ' + money(s.from) + '</p><p>' + esc(s.body) + '</p></article>';
    }).join('');
    $('#serviceSelect').innerHTML = '<option value="">Choose a service…</option>' + DATA.services.map(function (s) {
      return '<option>' + esc(s.title) + '</option>';
    }).join('') + '<option>Other / not sure</option>';
    $('#faqList').innerHTML = DATA.faq.map(function (f) {
      return '<details><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>';
    }).join('');
    // accordion: only one answer open at a time
    $$('#faqList details').forEach(function (d) {
      d.addEventListener('toggle', function () {
        if (d.open) $$('#faqList details').forEach(function (o) { if (o !== d) o.open = false; });
      });
    });
  }

  function renderAbout() {
    $('#aboutCopy').innerHTML = DATA.company.about.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    $('#aboutContact').innerHTML = contactBlock();
    $('#contactCard').innerHTML = contactBlock();
    $('#aboutStats').innerHTML = DATA.company.stats.map(function (s) {
      return '<div class="stat reveal"><b>' + esc(s.value) + '</b><span>' + esc(s.label) + '</span></div>';
    }).join('');
    $('#footerTagline').textContent = DATA.company.tagline;
    $('#year').textContent = new Date().getFullYear();
  }

  /* Form validation with friendly messages. Submissions are kept in
     localStorage because this front-end project has no server.      */
  function initForm(form, key, okMsg) {
    form.addEventListener('input', function (e) {
      if (e.target.classList.contains('invalid')) validateField(e.target);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var fields = $$('input, select, textarea', form);
      var bad = fields.filter(function (f) { return !validateField(f); });
      var status = $('.form-status', form);
      if (bad.length) {
        status.className = 'form-status err';
        status.textContent = 'Please fix the highlighted field' + (bad.length > 1 ? 's' : '') + '.';
        bad[0].focus();
        return;
      }
      var entry = { date: new Date().toISOString() };
      fields.forEach(function (f) { entry[f.name] = f.value.trim(); });
      var all = store.get(key, []); all.push(entry); store.set(key, all);
      form.reset();
      status.className = 'form-status ok';
      status.textContent = okMsg.replace('{name}', entry.name.split(' ')[0]);
      toast('Sent — thank you!');
    });
  }

  function validateField(f) {
    var err = f.parentElement.querySelector('.field-error');
    var msg = '';
    if (!f.checkValidity()) {
      if (f.validity.valueMissing) msg = 'This field is required.';
      else if (f.validity.typeMismatch && f.type === 'email') msg = 'Please enter a valid email address.';
      else if (f.validity.tooShort) msg = 'Please enter at least ' + f.minLength + ' characters.';
      else if (f.validity.patternMismatch) msg = 'Please enter a valid phone number.';
      else msg = 'Please check this field.';
    }
    f.classList.toggle('invalid', !!msg);
    f.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (msg && !err) { err = document.createElement('span'); err.className = 'field-error'; f.parentElement.appendChild(err); }
    if (err) err.textContent = msg;
    return !msg;
  }

  var toastTimer;
  function toast(text) {
    var t = $('#toast');
    t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ==========================================================
     SITE MAP
     ========================================================== */
  function renderSitemap() {
    var sec = function (title, href, links) {
      return '<section><h3><a href="' + href + '">' + esc(title) + '</a></h3><ul>' +
        (links || []).map(function (l) { return '<li><a href="' + l[1] + '"' + (l[2] ? ' data-product="' + l[2] + '" onclick="return false"' : '') + '>' + esc(l[0]) + '</a></li>'; }).join('') +
      '</ul></section>';
    };
    var html = sec('Home', '#/home', [['Product line-up', '#/home'], ['Featured timepieces', '#/home']]);
    html += sec('Products', '#/products/all', [['All products', '#/products/all']].concat(DATA.lineups.map(function (l) { return [l.name, '#/products/' + l.id]; })));
    DATA.lineups.forEach(function (l) {
      html += sec(l.name, '#/products/' + l.id, DATA.products.filter(function (p) { return p.lineup === l.id; }).map(function (p) { return [p.name, '#', p.id]; }));
    });
    html += sec('Technology', '#/technology', DATA.technology.map(function (t) { return [t.title, '#/technology']; }));
    html += sec('Price List', '#/prices', [['Search, filter & sort prices', '#/prices']]);
    html += sec('Gallery', '#/gallery', DATA.lineups.map(function (l) { return [l.name + ' gallery', '#/gallery']; }));
    html += sec('Store Locator', '#/stores', DATA.stores.map(function (s) { return [s.city, '#/stores']; }));
    html += sec('Support', '#/support', [['Services & prices', '#/support'], ['FAQ', '#/support'], ['Request a repair', '#/support']]);
    html += sec('About Us', '#/about', [['Our story', '#/about'], ['Contact details', '#/about']]);
    html += sec('Contact Us', '#/contact', [['Email, phone & address', '#/contact'], ['Send a message', '#/contact']]);
    $('#sitemapList').innerHTML = html;
  }

  /* ==========================================================
     Reveal-on-scroll (fade in)
     ========================================================== */
  var io = null;
  function observeReveals() {
    var items = $$('.page.is-active .reveal:not(.in)');
    if (!('IntersectionObserver' in window) || reduceMotion) { items.forEach(function (el) { el.classList.add('in'); }); return; }
    if (!io) io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { threshold: 0.01, rootMargin: '0px 0px -40px 0px' });
    items.forEach(function (el, i) { el.style.transitionDelay = Math.min(i * 60, 360) + 'ms'; io.observe(el); });
  }

  /* ==========================================================
     BOOT
     ========================================================== */
  function boot(data) {
    if (!data) {
      document.body.insertAdjacentHTML('afterbegin', '<p style="padding:20px;background:#a33;color:#fff">Could not load data/products.json.</p>');
      return;
    }
    DATA = data;
    DATA.lineups.forEach(function (l) { LINEUP[l.id] = l; });
    DATA.products.forEach(function (p) { PRODUCT[p.id] = p; });

    buildDropdown();
    initNav();
    initVisitors();
    renderHome();
    initHero();
    renderLineupTabs();
    renderTech();
    initPrices();
    initGallery();
    initStores();
    renderSupport();
    renderAbout();
    renderSitemap();
    initDialogs();
    initForm($('#repairForm'), 'alberto_repairs', 'Thanks {name}! Our workshop will email you an estimate within one business day.');
    initForm($('#contactForm'), 'alberto_messages', 'Thanks {name}! Our concierge team will reply within 24 hours.');
    initTicker();

    window.addEventListener('hashchange', route);
    route();
  }

  document.addEventListener('DOMContentLoaded', function () { loadData().then(boot); });
})();
