/* ==========================================================================
   sky.js — the global night-sky backdrop. Zero dependencies.

   A fixed canvas behind the whole page with tiny parallax stars,
   occasional twinkle, and shooting stars (meteors). Meteors fire
   ambiently and can also be triggered by smoke tests.

   Exposed as window.SiteSky: { meteor(), meteorMaybe() }
   ========================================================================== */

(function (global) {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var field = (function () {
    var canvas = document.getElementById('skyCanvas');
    if (!canvas) return null;
    var ctx = canvas.getContext('2d');

    var W = 0, H = 0;
    var stars = [];
    var meteors = [];
    var rafId = 0;
    var lastDraw = 0;
    var lastY = -1;
    var nextAmbient = Infinity;
    var lastMeteor = -Infinity;
    var pageVisible = !document.hidden;

    function build() {
      var rnd = mulberry32(20261111);
      var count = Math.max(70, Math.min(190, Math.round((W * H) / 15000)));
      stars = [];
      for (var i = 0; i < count; i++) {
        stars.push({
          x: rnd() * W,
          y: rnd() * H,
          r: 0.4 + rnd() * 1.05,
          a: 0.06 + rnd() * 0.3,
          depth: 0.04 + rnd() * 0.13,
          tw: rnd() < 0.24 ? 0.5 + rnd() * 1.3 : 0,
          ph: rnd() * 6.2832,
          warm: rnd() < 0.18
        });
      }
    }

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      draw(performance.now(), true);
    }

    function spawnMeteor() {
      if (reduced) return;
      lastMeteor = performance.now();
      var dir = Math.random() < 0.5 ? 1 : -1;
      var ang = (32 + Math.random() * 16) * Math.PI / 180;
      meteors.push({
        x0: (dir > 0 ? 0.02 + Math.random() * 0.55 : 0.43 + Math.random() * 0.55) * W,
        y0: (0.02 + Math.random() * 0.32) * H,
        vx: Math.cos(ang) * dir,
        vy: Math.sin(ang),
        dist: (0.34 + Math.random() * 0.22) * Math.max(W, H),
        dur: 850 + Math.random() * 500,
        tail: 110 + Math.random() * 90,
        t0: performance.now()
      });
      kick();
    }

    function draw(t, force) {
      var y = window.scrollY || 0;
      var busy = meteors.length > 0;
      if (!force && !busy && Math.abs(y - lastY) < 0.5 && t - lastDraw < 42) return;
      lastDraw = t;
      lastY = y;

      ctx.clearRect(0, 0, W, H);

      var i, s;
      for (i = 0; i < stars.length; i++) {
        s = stars[i];
        var sy = s.y - y * s.depth;
        sy = ((sy % H) + H) % H;
        var a = s.a * (s.tw && !reduced ? 0.55 + 0.45 * Math.sin(t * 0.001 * s.tw + s.ph) : 1);
        ctx.fillStyle = s.warm
          ? 'rgba(242, 190, 150, ' + a.toFixed(3) + ')'
          : 'rgba(225, 222, 215, ' + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(s.x, sy, s.r, 0, 6.2832);
        ctx.fill();
      }

      if (busy) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        meteors = meteors.filter(function (m) {
          var p = (t - m.t0) / m.dur;
          if (p >= 1) return false;
          var hx = m.x0 + m.vx * m.dist * p;
          var hy = m.y0 + m.vy * m.dist * p;
          var tx = hx - m.vx * m.tail * Math.min(1, p * 3);
          var ty = hy - m.vy * m.tail * Math.min(1, p * 3);
          var alpha = Math.sin(Math.PI * p) * 0.85;
          var g = ctx.createLinearGradient(hx, hy, tx, ty);
          g.addColorStop(0, 'rgba(255, 250, 240, ' + alpha.toFixed(3) + ')');
          g.addColorStop(0.3, 'rgba(242, 185, 140, ' + (alpha * 0.45).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(242, 168, 126, 0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255, 252, 245, ' + (alpha * 0.9).toFixed(3) + ')';
          ctx.beginPath();
          ctx.arc(hx, hy, 1.5, 0, 6.2832);
          ctx.fill();
          return true;
        });
        ctx.globalCompositeOperation = 'source-over';
      }
    }

    function loop(t) {
      rafId = 0;
      if (!pageVisible || reduced) return;
      draw(t, false);
      if (t > nextAmbient) {
        spawnMeteor();
        nextAmbient = t + 13000 + Math.random() * 17000;
      }
      rafId = requestAnimationFrame(loop);
    }

    function kick() {
      if (!rafId && pageVisible && !reduced) rafId = requestAnimationFrame(loop);
    }

    document.addEventListener('visibilitychange', function () {
      pageVisible = !document.hidden;
      if (pageVisible) kick();
    });

    var rt = 0;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(resize, 140);
    }, { passive: true });

    resize();
    if (!reduced) {
      nextAmbient = performance.now() + 6000 + Math.random() * 9000;
      kick();
    }

    return {
      meteor: spawnMeteor,
      meteorMaybe: function () {
        var now = performance.now();
        if (now - lastMeteor > 6500 && Math.random() < 0.7) spawnMeteor();
      }
    };
  })();

  global.SiteSky = {
    meteor: field ? field.meteor : function () {},
    meteorMaybe: field ? field.meteorMaybe : function () {}
  };

})(typeof window !== 'undefined' ? window : globalThis);
