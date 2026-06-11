/* ==========================================================================
   motion.js — the motion layer. GSAP + ScrollTrigger + Lenis when available;
   degrades gracefully to a fully readable static page when they are not.

   Exposed as window.SiteMotion:
     init()        called by content.js right after rendering (pre-paint)
     enter()       hero entrance timeline (called on the next frame)
     revealNow(el) force-reveal dynamically shown content (older news)
   ========================================================================== */

(function (global) {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;
  var hasGsap = typeof global.gsap !== 'undefined' && typeof global.ScrollTrigger !== 'undefined';
  var gsap = global.gsap;
  var entered = false;

  /* ------------------------------------------------------------------ *
   *  Always-on basics (no library required)                             *
   * ------------------------------------------------------------------ */

  function initNavState() {
    var nav = document.getElementById('siteNav');
    if (!nav) return;
    var update = function () {
      nav.classList.toggle('is-scrolled', (window.scrollY || 0) > 40);
    };
    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  /* scroll-position based so the research stop on the hero runway can be
     a "virtual" nav target */
  function initScrollSpy() {
    var pts = [];
    var ticking = false;
    var current = '';

    function compute() {
      pts = [];
      var vh = window.innerHeight;
      var y = window.scrollY || 0;
      if (typeof global.__researchY === 'number') {
        pts.push({ id: global.__constellationSlug || 'research', y: global.__researchY * 0.45 });
      }
      document.querySelectorAll('#sections section[id]').forEach(function (s) {
        pts.push({ id: s.id, y: s.getBoundingClientRect().top + y - vh * 0.55 });
      });
      pts.sort(function (a, b) { return a.y - b.y; });
    }

    function update() {
      ticking = false;
      var y = window.scrollY || 0;
      var active = '';
      for (var i = 0; i < pts.length; i++) {
        if (y >= pts[i].y) active = pts[i].id;
      }
      if (active === current) return;
      current = active;
      document.querySelectorAll('.nav-link').forEach(function (a) {
        a.classList.toggle('is-active', !!active && a.getAttribute('href') === '#' + active);
      });
    }

    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });

    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { compute(); update(); }, 200);
    }, { passive: true });

    if (hasGsap) global.ScrollTrigger.addEventListener('refresh', compute);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { compute(); update(); });
    }

    compute();
    update();
  }

  /* ------------------------------------------------------------------ *
   *  Lenis smooth scrolling                                             *
   * ------------------------------------------------------------------ */

  function initLenis() {
    if (!global.Lenis || reduced || coarse) return null;
    try {
      var lenis = new global.Lenis({ lerp: 0.115, smoothWheel: true });
      global.__lenis = lenis;
      lenis.on('scroll', global.ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
      return lenis;
    } catch (e) {
      console.warn('[motion] lenis init failed:', e);
      return null;
    }
  }

  /* ------------------------------------------------------------------ *
   *  Spring paging                                                      *
   *  Inside a page's content you scroll freely. Past its edge you enter *
   *  a spring zone: release with little penetration and you bounce back *
   *  to the edge; pull deep enough and the page springs to the next.    *
   * ------------------------------------------------------------------ */

  function initSpring(lenis) {
    if (!lenis) return;

    var zones = [];          // { A, B } — spring gaps between page rest points
    var dir = 1;
    var springing = false;
    var pointerDown = false;
    var idleTimer = 0;

    var RELEASE = 0.22;      // idle penetration that commits to the next page
    var EARLY = 0.55;        // penetration that commits while still moving

    function compute() {
      var vh = window.innerHeight;
      var y = window.scrollY || 0;
      var max = Math.max(0, document.documentElement.scrollHeight - vh);
      var items = [{ rest: 0, end: 0 }];

      if (typeof global.__researchY === 'number') {
        items.push({ rest: global.__researchY, end: global.__researchY });
      }

      document.querySelectorAll('#sections .section').forEach(function (s) {
        var top = Math.round(s.getBoundingClientRect().top + y);
        items.push({ rest: top, end: top + Math.max(0, s.offsetHeight - vh) });
      });
      items.push({ rest: max, end: max });

      items.sort(function (a, b) { return a.rest - b.rest; });

      zones = [];
      for (var i = 0; i < items.length - 1; i++) {
        var A = Math.min(items[i].end, items[i + 1].rest);
        var B = items[i + 1].rest;
        if (B - A > 24) zones.push({ A: A, B: B });
      }
    }

    function findZone(y) {
      for (var i = 0; i < zones.length; i++) {
        if (y > zones[i].A + 2 && y < zones[i].B - 2) return zones[i];
      }
      return null;
    }

    function go(target, bounce) {
      springing = true;
      if (!bounce && global.SiteSky) global.SiteSky.meteorMaybe();
      lenis.scrollTo(target, {
        duration: bounce ? 0.85 : 1.25,
        easing: bounce
          ? function (t) { var s = 1.4; t -= 1; return 1 + t * t * ((s + 1) * t + s); }
          : function (t) { return 1 - Math.pow(1 - t, 3.6); },
        onComplete: function () { springing = false; }
      });
    }

    function settle() {
      if (springing || pointerDown || document.hidden) return;
      var y = window.scrollY || 0;
      var z = findZone(y);
      if (!z) return;
      var len = z.B - z.A;
      var pen = dir > 0 ? (y - z.A) / len : (z.B - y) / len;
      if (pen >= RELEASE) go(dir > 0 ? z.B : z.A, false);
      else go(dir > 0 ? z.A : z.B, true);
    }

    lenis.on('scroll', function (e) {
      var v = e && typeof e.velocity === 'number' ? e.velocity : 0;
      if (v > 0.05) dir = 1;
      else if (v < -0.05) dir = -1;
      if (springing) return;

      // deep pull while slowing → commit early (feels like the spring lets go)
      if (Math.abs(v) < 45 && !pointerDown) {
        var y = window.scrollY || 0;
        var z = findZone(y);
        if (z) {
          var len = z.B - z.A;
          var pen = dir > 0 ? (y - z.A) / len : (z.B - y) / len;
          if (pen >= EARLY) {
            clearTimeout(idleTimer);
            go(dir > 0 ? z.B : z.A, false);
            return;
          }
        }
      }

      clearTimeout(idleTimer);
      idleTimer = setTimeout(settle, 140);
    });

    ['wheel', 'touchmove', 'keydown'].forEach(function (ev) {
      window.addEventListener(ev, function () {
        // user input takes over from an in-flight spring
        springing = false;
      }, { passive: true });
    });
    window.addEventListener('pointerdown', function () { pointerDown = true; }, { passive: true });
    window.addEventListener('pointerup', function () { pointerDown = false; }, { passive: true });

    compute();
    global.ScrollTrigger.addEventListener('refresh', compute);
    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(compute, 180);
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   *  Hero entrance                                                      *
   * ------------------------------------------------------------------ */

  function setInitialStates() {
    gsap.set('.hero-kicker', { opacity: 0, y: 14 });
    gsap.set('.hero-name .char', { yPercent: 118 });
    gsap.set('.hero-tagline', { opacity: 0, y: 18 });
    gsap.set('.hero-meta > *', { opacity: 0, y: 18 });
    gsap.set('.hero-foot', { opacity: 0 });
  }

  function enter() {
    if (!hasGsap || reduced || entered) return;
    entered = true;

    var tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.to('.hero-name .char', {
      yPercent: 0,
      duration: 1.1,
      ease: 'expo.out',
      stagger: { each: 0.042, from: 'start' }
    }, 0.12)
      .to('.hero-kicker', { opacity: 1, y: 0, duration: 0.7 }, 0.55)
      .to('.hero-tagline', { opacity: 1, y: 0, duration: 0.85 }, 0.8)
      .to('.hero-meta > *', { opacity: 1, y: 0, duration: 0.7, stagger: 0.12 }, 1.0)
      .to('.hero-foot', { opacity: 1, duration: 0.9 }, 1.35);
  }

  /* ------------------------------------------------------------------ *
   *  Scroll-driven effects                                              *
   * ------------------------------------------------------------------ */

  function initScrollEffects() {
    var ScrollTrigger = global.ScrollTrigger;
    // (the hero runway morph is driven directly by constellation.js)

    // top progress bar
    var fill = document.getElementById('progressFill');
    if (fill) {
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: function (self) {
          fill.style.transform = 'scaleX(' + self.progress.toFixed(4) + ')';
        }
      });
    }

    // section rules draw themselves in
    gsap.utils.toArray('[data-rule]').forEach(function (rule) {
      gsap.fromTo(rule, { scaleX: 0 }, {
        scaleX: 1,
        duration: 1.2,
        ease: 'power3.inOut',
        scrollTrigger: { trigger: rule, start: 'top 90%' }
      });
    });

    // batched reveals
    var reveals = gsap.utils.toArray('[data-reveal]');
    gsap.set(reveals, { opacity: 0, y: 34 });
    ScrollTrigger.batch(reveals, {
      start: 'top 88%',
      once: true,
      onEnter: function (batch) {
        gsap.to(batch, {
          opacity: 1,
          y: 0,
          duration: 0.95,
          ease: 'power3.out',
          stagger: 0.085,
          overwrite: true
        });
      }
    });

    // ghost numerals drift slower than the page (depth)
    gsap.utils.toArray('.section-ghost').forEach(function (ghost) {
      gsap.fromTo(ghost, { yPercent: 22 }, {
        yPercent: -16,
        ease: 'none',
        scrollTrigger: {
          trigger: ghost.parentElement,
          start: 'top bottom',
          end: 'bottom top',
          scrub: true
        }
      });
    });

    // refresh once webfonts have settled (layout shifts)
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
    }
  }

  /* ------------------------------------------------------------------ *
   *  Pointer micro-interactions                                         *
   * ------------------------------------------------------------------ */

  function initTilt() {
    if (coarse || reduced) return;
    document.querySelectorAll('[data-tilt]').forEach(function (card) {
      var rx = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' });
      var ry = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' });

      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width;
        var py = (e.clientY - r.top) / r.height;
        ry((px - 0.5) * 13);
        rx((0.5 - py) * 10);
        card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
      });

      card.addEventListener('pointerleave', function () {
        rx(0);
        ry(0);
      });
    });
  }

  function initMagnetic() {
    if (coarse || reduced) return;
    document.querySelectorAll('.btn-accent, .pill-link').forEach(function (elm) {
      var qx = gsap.quickTo(elm, 'x', { duration: 0.4, ease: 'power3.out' });
      var qy = gsap.quickTo(elm, 'y', { duration: 0.4, ease: 'power3.out' });

      elm.addEventListener('pointermove', function (e) {
        var r = elm.getBoundingClientRect();
        var dx = e.clientX - (r.left + r.width / 2);
        var dy = e.clientY - (r.top + r.height / 2);
        qx(Math.max(-7, Math.min(7, dx * 0.22)));
        qy(Math.max(-5, Math.min(5, dy * 0.3)));
      });

      elm.addEventListener('pointerleave', function () {
        qx(0);
        qy(0);
      });
    });
  }

  /* ------------------------------------------------------------------ *
   *  Public API                                                         *
   * ------------------------------------------------------------------ */

  global.SiteMotion = {
    init: function () {
      initNavState();
      initScrollSpy();

      if (!hasGsap) {
        document.body.classList.add('no-motion');
        return;
      }

      gsap.registerPlugin(global.ScrollTrigger);

      if (reduced) {
        // keep everything visible and static; no smoothing, no reveals
        return;
      }

      document.body.classList.add('has-motion');
      var lenis = initLenis();
      setInitialStates();
      initScrollEffects();
      initSpring(lenis);
      initTilt();
      initMagnetic();
    },

    enter: enter,

    revealNow: function (container) {
      if (!hasGsap || reduced || !container) return;
      var nodes = container.querySelectorAll('[data-reveal]');
      if (nodes.length) gsap.set(nodes, { opacity: 1, y: 0, overwrite: true });
    }
  };

})(typeof window !== 'undefined' ? window : globalThis);
