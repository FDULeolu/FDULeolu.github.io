/* ==========================================================================
   constellation.js — the hero's rotating 3D constellation, which now owns
   the whole hero runway. Zero dependencies.

   The hero section is a tall scroll runway with a sticky stage. As you
   scroll (progress p = scrollY / travel):

     p 0.00–0.28   hero state: name + tagline over the slowly turning sky
     p 0.28–0.66   handover: the text recedes and the camera dollies into the
                   constellation
     p 0.66–1.00   research state: topic labels ride their topic nodes,
                   appearing as they rotate to the front and dimming away
                   as they turn to the back

   Exposes window.HeroConstellation = { bindTopics() } and publishes
   window.__researchY (the scroll position of the research "page") for the
   spring-scroll and scrollspy layers.
   ========================================================================== */

(function (global) {
  'use strict';

  var hero = document.getElementById('hero');
  var stage = document.querySelector('.hero-stage');
  var canvas = document.getElementById('heroCanvas');
  if (!hero || !stage || !canvas) return;

  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var coarse = window.matchMedia('(pointer: coarse)').matches;

  var heroInner = document.getElementById('heroInner');
  var heroFoot = document.getElementById('heroFoot');

  var W = 0, H = 0, R = 0, travel = 0;
  var points = [];
  var links = [];
  var topicNodes = [];       // semantic constellation points, one per topic
  var labels = [];           // DOM elements

  var rotY = Math.random() * Math.PI * 2;
  var mx = 0, my = 0, tmx = 0, tmy = 0;

  var rafId = 0;
  var lastT = 0;
  var heroVisible = true;
  var pageVisible = !document.hidden;
  var domDirty = true;
  var lastP = -1;
  var transitionsCleared = false;

  /* --- helpers --- */

  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function smoothstep(a, b, x) {
    var t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }

  var glow = (function () {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(242, 168, 126, 0.85)');
    grad.addColorStop(0.25, 'rgba(232, 136, 86, 0.35)');
    grad.addColorStop(1, 'rgba(232, 136, 86, 0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return c;
  })();

  /* --- build the point cloud --- */

  function build() {
    var count = W < 720 ? 110 : 200;
    R = Math.max(W, H) * 0.5;
    points = [];
    topicNodes = [];

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
        anchor: -1,
        topic: false,
        ph: Math.random() * 6.2832,
        sp: 0.5 + Math.random() * 0.9,
        sx: 0, sy: 0, sc: 0, zz: 0
      });
    }

    addTopicNodes();
    buildLinks();
  }

  function addTopicNodes() {
    var n = labels.length;
    if (!n) {
      global.__topicNodeCount = 0;
      return;
    }

    var golden = Math.PI * (3 - Math.sqrt(5));
    var shell = R * (W < 720 ? 0.38 : 0.42);
    var phase = 0.45;

    for (var i = 0; i < n; i++) {
      var yNorm = n === 1 ? 0 : 1 - 2 * ((i + 0.5) / n);
      var radial = Math.sqrt(Math.max(0, 1 - yNorm * yNorm));
      var theta = i * golden + phase;
      var pt = {
        x: Math.cos(theta) * radial * shell * 0.86,
        y: yNorm * shell * 0.56,
        z: Math.sin(theta) * radial * shell * 0.86,
        ember: true,
        anchor: i,
        topic: true,
        ph: i * 1.37,
        sp: 0.55 + (i % 4) * 0.12,
        sx: 0, sy: 0, sc: 0, zz: 0,
        pi: points.length
      };
      points.push(pt);
      topicNodes.push(pt);
    }

    global.__topicNodeCount = topicNodes.length;
  }

  function buildLinks() {
    links = [];
    var seen = {};
    var maxD = R * 0.36;
    var maxD2 = maxD * maxD;

    function addLink(a, b, w, topicLink) {
      if (a === b) return;
      if (a > b) { var tmp = a; a = b; b = tmp; }
      var key = a + '-' + b;
      w = Math.max(0.12, Math.min(1, w));
      if (seen[key]) {
        seen[key].w = Math.max(seen[key].w, w);
        seen[key].topic = seen[key].topic || !!topicLink;
        return;
      }
      var link = { a: a, b: b, w: w, topic: !!topicLink };
      seen[key] = link;
      links.push(link);
    }

    for (var a = 0; a < points.length; a++) {
      for (var b = a + 1; b < points.length; b++) {
        var dx = points[a].x - points[b].x;
        var dy = points[a].y - points[b].y;
        var dz = points[a].z - points[b].z;
        var d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < maxD2) addLink(a, b, 1 - Math.sqrt(d2) / maxD, points[a].topic || points[b].topic);
      }
    }

    connectTopicNodes(addLink);
    global.__topicLinkCount = links.filter(function (L) { return L.topic; }).length;
  }

  function connectTopicNodes(addLink) {
    topicNodes.forEach(function (node) {
      var near = [];
      for (var i = 0; i < points.length; i++) {
        var other = points[i];
        if (other === node || other.topic) continue;
        var dx = node.x - other.x;
        var dy = node.y - other.y;
        var dz = node.z - other.z;
        near.push({ i: i, d: Math.sqrt(dx * dx + dy * dy + dz * dz) });
      }
      near.sort(function (a, b) { return a.d - b.d; });
      near.slice(0, 3).forEach(function (hit) {
        addLink(node.pi, hit.i, 0.9, true);
      });
    });

    if (topicNodes.length > 2) {
      topicNodes.forEach(function (node, i) {
        var next = topicNodes[(i + 1) % topicNodes.length];
        addLink(node.pi, next.pi, 0.48, true);
      });
    }
  }

  /* --- geometry / runway --- */

  function resize() {
    W = Math.max(1, stage.offsetWidth);
    H = Math.max(1, stage.offsetHeight);
    travel = Math.max(0, hero.offsetHeight - stage.offsetHeight);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    build();
    publishResearchY();
    domDirty = true;
    if (reduced) draw(performance.now(), true);
  }

  function publishResearchY() {
    if (travel > 0 && labels.length) {
      global.__researchY = Math.round(travel * 0.8);
      global.__anchorOverrides = global.__anchorOverrides || {};
      global.__anchorOverrides[global.__constellationSlug || 'research'] = global.__researchY;
    } else {
      global.__researchY = null;
    }
  }

  /* --- scroll-driven DOM (hero text out, research head in) --- */

  function applyDom(p) {
    if (Math.abs(p - lastP) < 0.0005 && !domDirty) return;
    if (p <= 0.0005 && lastP <= 0.0005 && !domDirty) return;
    // never touch the DOM before the user starts moving, so the page-load
    // entrance plays untouched
    if (lastP < 0 && p <= 0.0005) { lastP = p; return; }
    lastP = p;
    domDirty = false;

    if (!transitionsCleared && p > 0.0005) {
      transitionsCleared = true;
      if (heroInner) heroInner.style.transition = 'none';
      if (heroFoot) heroFoot.style.transition = 'none';
    }

    var textK = 1 - smoothstep(0.26, 0.5, p);
    var footK = 1 - smoothstep(0.06, 0.24, p);
    if (heroInner) {
      heroInner.style.opacity = textK.toFixed(3);
      heroInner.style.transform =
        'translate3d(0, ' + (-(1 - textK) * 54).toFixed(1) + 'px, 0) scale(' +
        (1 - 0.05 * (1 - textK)).toFixed(4) + ')';
      heroInner.style.pointerEvents = textK < 0.4 ? 'none' : '';
    }
    if (heroFoot && transitionsCleared) {
      heroFoot.style.opacity = footK.toFixed(3);
    }
  }

  /* --- render --- */

  function draw(t, force) {
    var dt = lastT ? Math.min(t - lastT, 64) / 1000 : 0.016;
    lastT = t;

    var y = window.scrollY || 0;
    var p = travel > 0 ? clamp01(y / travel) : 0;
    var morph = smoothstep(0.28, 0.66, p);
    var labelK = smoothstep(0.52, 0.74, p);

    applyDom(p);

    if (!reduced) {
      rotY += dt * (0.05 + 0.028 * morph);
      mx += (tmx - mx) * 0.045;
      my += (tmy - my) * 0.045;
    }

    var rotX = 0.24 + my * 0.16 + (reduced ? 0 : Math.sin(t * 0.00006) * 0.04);
    var ry = rotY + mx * 0.3;

    var cosY = Math.cos(ry), sinY = Math.sin(ry);
    var cosX = Math.cos(rotX), sinX = Math.sin(rotX);

    var zoom = 1 + 0.3 * morph;
    var focal = Math.max(W, H) * 0.62;
    var cx = W / 2;
    var cy = H * (0.46 + 0.05 * morph);

    var i, pnt;
    for (i = 0; i < points.length; i++) {
      pnt = points[i];
      var x1 = pnt.x * cosY + pnt.z * sinY;
      var z1 = -pnt.x * sinY + pnt.z * cosY;
      var y1 = pnt.y * cosX - z1 * sinX;
      var z2 = pnt.y * sinX + z1 * cosX;

      var sc = focal / (focal + z2 + R * 1.15);
      var breathe = reduced ? 0 : Math.sin(t * 0.001 * pnt.sp + pnt.ph) * 5 * sc;

      pnt.sx = cx + x1 * sc * zoom;
      pnt.sy = cy + y1 * sc * zoom + breathe;
      pnt.sc = sc;
      pnt.zz = z2;
    }

    ctx.clearRect(0, 0, W, H);

    // links
    var linkBoost = 1 + 0.55 * morph;
    var L, pa, pb, depth;
    for (i = 0; i < links.length; i++) {
      L = links[i];
      pa = points[L.a];
      pb = points[L.b];
      depth = Math.max(0, Math.min(1, ((pa.sc + pb.sc) / 2 - 0.52) / 0.5));
      var topicK = L.topic ? smoothstep(0.42, 0.72, p) : 0;
      var alpha = L.topic
        ? L.w * (0.2 + 0.28 * labelK) * Math.max(depth, 0.18) * linkBoost * topicK
        : L.w * 0.26 * depth * linkBoost;
      if (alpha < 0.008) continue;
      ctx.strokeStyle = L.topic
        ? 'rgba(242, 168, 126, ' + alpha.toFixed(3) + ')'
        : 'rgba(216, 209, 198, ' + alpha.toFixed(3) + ')';
      ctx.lineWidth = L.topic ? 1.35 : 1;
      ctx.beginPath();
      ctx.moveTo(pa.sx, pa.sy);
      ctx.lineTo(pb.sx, pb.sy);
      ctx.stroke();
    }

    // points
    var pointBoost = 1 + 0.3 * morph;
    for (i = 0; i < points.length; i++) {
      pnt = points[i];
      depth = Math.max(0, Math.min(1, (pnt.sc - 0.5) / 0.55));
      if (depth <= 0.02) continue;

      if (pnt.anchor !== -1) {
        // anchor stars: brighter, carry the labels
        var front = clamp01(0.3 - pnt.zz / (R * 0.4));
        var heat = labelK * (0.3 + 0.7 * front);
        var gs = (34 + 26 * heat) * pnt.sc * pointBoost;
        ctx.globalAlpha = 0.4 + 0.6 * Math.max(depth, heat);
        ctx.drawImage(glow, pnt.sx - gs / 2, pnt.sy - gs / 2, gs, gs);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(248, 200, 164, ' + (0.55 + 0.45 * Math.max(depth, heat)).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(pnt.sx, pnt.sy, (1.7 + 1.1 * heat) * pnt.sc * pointBoost, 0, 6.2832);
        ctx.fill();

        // four-point sparkle grows with heat
        if (heat > 0.05) {
          var len = (5 + 7 * heat) * pnt.sc;
          ctx.strokeStyle = 'rgba(250, 240, 228, ' + (0.75 * heat).toFixed(3) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pnt.sx - len, pnt.sy); ctx.lineTo(pnt.sx + len, pnt.sy);
          ctx.moveTo(pnt.sx, pnt.sy - len); ctx.lineTo(pnt.sx, pnt.sy + len);
          ctx.stroke();
        }
      } else if (pnt.ember) {
        var gs2 = 32 * pnt.sc * pointBoost;
        ctx.globalAlpha = 0.4 + 0.6 * depth;
        ctx.drawImage(glow, pnt.sx - gs2 / 2, pnt.sy - gs2 / 2, gs2, gs2);
        ctx.globalAlpha = 1;
        ctx.fillStyle = 'rgba(242, 168, 126, ' + (0.95 * depth).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(pnt.sx, pnt.sy, 1.7 * pnt.sc * pointBoost, 0, 6.2832);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(228, 222, 213, ' + (0.78 * depth * pointBoost).toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(pnt.sx, pnt.sy, 1.25 * pnt.sc * pointBoost, 0, 6.2832);
        ctx.fill();
      }
    }

    // topic labels ride their own 3D topic nodes: they surface as the node
    // rotates to the front and melt away as it turns to the back
    if (labels.length && topicNodes.length) {
      for (i = 0; i < topicNodes.length && i < labels.length; i++) {
        pnt = topicNodes[i];
        var f = clamp01(0.3 - pnt.zz / (R * 0.4));
        var edge =
          smoothstep(0.01 * W, 0.07 * W, pnt.sx) *
          (1 - smoothstep(0.93 * W, 0.99 * W, pnt.sx)) *
          smoothstep(0.06 * H, 0.14 * H, pnt.sy) *
          (1 - smoothstep(0.86 * H, 0.96 * H, pnt.sy));
        var a2 = labelK * f * edge;
        var el = labels[i];
        el.style.opacity = a2.toFixed(3);
        el.style.transform =
          'translate3d(' + pnt.sx.toFixed(1) + 'px, ' + pnt.sy.toFixed(1) + 'px, 0) ' +
          'translate(-50%, calc(-100% - ' + (14 + 6 * f).toFixed(1) + 'px))';
      }
    }
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

  if (reduced) {
    // no autonomous motion: redraw only when the user scrolls or resizes
    window.addEventListener('scroll', function () {
      draw(performance.now(), true);
    }, { passive: true });
  }

  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }, { passive: true });

  /* --- public API --- */

  global.HeroConstellation = {
    bindTopics: function () {
      var layer = document.getElementById('topicLayer');
      labels = layer
        ? Array.prototype.slice.call(layer.querySelectorAll('.topic-label'))
        : [];
      if (layer && labels.length) layer.classList.add('is-3d');
      travel = Math.max(0, hero.offsetHeight - stage.offsetHeight);
      build();
      publishResearchY();
      domDirty = true;
      if (reduced) draw(performance.now(), true);
    }
  };

  resize();
  if (reduced) draw(performance.now(), true);
  else start();
})(typeof window !== 'undefined' ? window : globalThis);
