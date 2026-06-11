/* ==========================================================================
   constellation.js — a slowly rotating 3D "thought constellation" rendered
   on a 2D canvas with true perspective projection. Zero dependencies.

   - points distributed in a flattened sphere, rotating around Y
   - links precomputed from 3D distance (rotation preserves distance)
   - mouse parallax steers the rotation target
   - fades out as the hero scrolls away; pauses offscreen / hidden tab
   - prefers-reduced-motion: renders a single static frame
   ========================================================================== */

(function () {
  'use strict';

  var canvas = document.getElementById('heroCanvas');
  var hero = document.getElementById('hero');
  if (!canvas || !hero) return;

  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;

  var W = 0, H = 0, DPR = 1;
  var points = [];
  var links = [];
  var R = 0;

  var rotY = Math.random() * Math.PI * 2;
  var mx = 0, my = 0, tmx = 0, tmy = 0;

  var rafId = 0;
  var lastT = 0;
  var heroVisible = true;
  var pageVisible = !document.hidden;

  /* --- pre-rendered glow sprite for ember points --- */
  var glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  (function () {
    var g = glow.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(242, 168, 126, 0.85)');
    grad.addColorStop(0.25, 'rgba(232, 136, 86, 0.35)');
    grad.addColorStop(1, 'rgba(232, 136, 86, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  })();

  function build() {
    var count = W < 720 ? 110 : 200;
    R = Math.max(W, H) * 0.5;
    points = [];

    for (var i = 0; i < count; i++) {
      var u = Math.random() * 2 - 1;
      var theta = Math.random() * Math.PI * 2;
      var s = Math.sqrt(1 - u * u);
      var r = R * (0.32 + 0.68 * Math.cbrt(Math.random()));
      points.push({
        x: s * Math.cos(theta) * r,
        y: u * r * 0.66,
        z: s * Math.sin(theta) * r,
        ember: Math.random() < 0.1,
        ph: Math.random() * Math.PI * 2,
        sp: 0.5 + Math.random() * 0.9,
        sx: 0, sy: 0, sc: 0
      });
    }

    // 3D distance is invariant under rotation → compute pairs once
    links = [];
    var maxD = R * 0.36;
    var maxD2 = maxD * maxD;
    for (var a = 0; a < count; a++) {
      for (var b = a + 1; b < count; b++) {
        var dx = points[a].x - points[b].x;
        var dy = points[a].y - points[b].y;
        var dz = points[a].z - points[b].z;
        var d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < maxD2) {
          links.push({ a: a, b: b, w: 1 - Math.sqrt(d2) / maxD });
        }
      }
    }
  }

  function resize() {
    var rect = hero.getBoundingClientRect();
    W = Math.max(1, rect.width);
    H = Math.max(1, rect.height);
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
    if (reduced) draw(0, true);
  }

  function draw(t, force) {
    var dt = lastT ? Math.min(t - lastT, 64) / 1000 : 0.016;
    lastT = t;

    var fade = 1 - Math.min(1, Math.max(0, (window.scrollY || 0) / (H * 0.85)));
    if (fade <= 0.01 && !force) {
      ctx.clearRect(0, 0, W, H);
      return;
    }

    if (!reduced) {
      rotY += dt * 0.05;
      mx += (tmx - mx) * 0.045;
      my += (tmy - my) * 0.045;
    }

    var rotX = 0.24 + my * 0.16 + (reduced ? 0 : Math.sin(t * 0.00006) * 0.04);
    var ry = rotY + mx * 0.3;

    var cosY = Math.cos(ry), sinY = Math.sin(ry);
    var cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    var focal = Math.max(W, H) * 0.62;
    var cx = W / 2;
    var cy = H * 0.46;

    var i, p;
    for (i = 0; i < points.length; i++) {
      p = points[i];
      var x1 = p.x * cosY + p.z * sinY;
      var z1 = -p.x * sinY + p.z * cosY;
      var y1 = p.y * cosX - z1 * sinX;
      var z2 = p.y * sinX + z1 * cosX;

      var sc = focal / (focal + z2 + R * 1.15);
      var breathe = reduced ? 0 : Math.sin(t * 0.001 * p.sp + p.ph) * 5 * sc;

      p.sx = cx + x1 * sc;
      p.sy = cy + y1 * sc + breathe;
      p.sc = sc;
    }

    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = fade;

    // links
    var L, pa, pb, depth;
    for (i = 0; i < links.length; i++) {
      L = links[i];
      pa = points[L.a];
      pb = points[L.b];
      depth = Math.max(0, Math.min(1, ((pa.sc + pb.sc) / 2 - 0.52) / 0.5));
      var alpha = L.w * 0.26 * depth * fade;
      if (alpha < 0.008) continue;
      ctx.strokeStyle = 'rgba(216, 209, 198, ' + alpha.toFixed(3) + ')';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
    }

    // points
    for (i = 0; i < points.length; i++) {
      p = points[i];
      depth = Math.max(0, Math.min(1, (p.sc - 0.5) / 0.55));
      if (depth <= 0.02) continue;

      if (p.ember) {
        var gs = 32 * p.sc;
        ctx.globalAlpha = fade * (0.4 + 0.6 * depth);
        ctx.drawImage(glow, p.sx - gs / 2, p.sy - gs / 2, gs, gs);
        ctx.globalAlpha = fade;
        ctx.fillStyle = 'rgba(242, 168, 126, ' + (0.95 * depth).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 1.7 * p.sc, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(228, 222, 213, ' + (0.78 * depth).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, 1.25 * p.sc, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.globalAlpha = 1;
  }

  function loop(t) {
    rafId = 0;
    if (!heroVisible || !pageVisible) return;
    draw(t, false);
    rafId = requestAnimationFrame(loop);
  }

  function start() {
    if (reduced || rafId) return;
    lastT = 0;
    rafId = requestAnimationFrame(loop);
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }

  /* --- events --- */

  if (!coarse && !reduced) {
    window.addEventListener('mousemove', function (e) {
      tmx = Math.max(-1, Math.min(1, (e.clientX / W) * 2 - 1));
      tmy = Math.max(-1, Math.min(1, (e.clientY / H) * 2 - 1));
    }, { passive: true });
  }

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      if (heroVisible) start(); else stop();
    }, { threshold: 0 }).observe(hero);
  }

  document.addEventListener('visibilitychange', function () {
    pageVisible = !document.hidden;
    if (pageVisible && heroVisible) start(); else stop();
  });

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }, { passive: true });

  resize();
  if (reduced) draw(0, true);
  else start();
})();
