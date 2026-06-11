/* ==========================================================================
   content.js — loads content.md, parses the markdown dialect, renders the page.

   The dialect:
     ---  key: value  ---        site-wide config (frontmatter)
     ## Title                    a section
     @key: value                 section directive (type, nav, visible, ...)
     ### Title                   an item inside a section
     - key: value                item property (lowercase key)
     - Free bullet text          plain list entry
     > Quoted line               callout block
     Plain lines                 paragraphs
     <!-- ... -->                comments (ignored)
   Inline markdown: **bold**, *italic*, `code`, [text](url)
   ========================================================================== */

(function (global) {
  'use strict';

  /* ------------------------------------------------------------------ *
   *  Inline markdown                                                    *
   * ------------------------------------------------------------------ */

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function miniEmphasis(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[\s(])\*([A-Za-z0-9([\u00C0-\u024F][^*]*?)\*/g, '$1<em>$2</em>');
  }

  function inline(src) {
    var stash = [];
    function keep(html) {
      stash.push(html);
      return '\u0000' + (stash.length - 1) + '\u0000';
    }

    var s = escapeHtml(src);

    // code spans first (protected)
    s = s.replace(/`([^`]+)`/g, function (_, c) {
      return keep('<code>' + c + '</code>');
    });

    // links (protected so emphasis can't break URLs)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, txt, url) {
      var ext = /^https?:\/\//i.test(url);
      var attrs = ext ? ' target="_blank" rel="noopener"' : '';
      return keep('<a href="' + url + '"' + attrs + '>' + miniEmphasis(txt) + '</a>');
    });

    s = miniEmphasis(s);

    // restore protected fragments
    s = s.replace(/\u0000(\d+)\u0000/g, function (_, i) {
      return stash[+i];
    });

    return s;
  }

  function slugify(s) {
    return String(s)
      .toLowerCase()
      .replace(/&/g, ' ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
  }

  /* ------------------------------------------------------------------ *
   *  Parser                                                             *
   * ------------------------------------------------------------------ */

  function parseSiteContent(raw) {
    var text = String(raw).replace(/\r\n?/g, '\n');
    var meta = {};
    var body = text;

    var fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
    if (fm) {
      fm[1].split('\n').forEach(function (line) {
        var t = line.trim();
        if (!t || t.charAt(0) === '#') return;
        var m = t.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
        if (m) meta[m[1]] = m[2].trim();
      });
      body = text.slice(fm[0].length);
    }

    body = body.replace(/<!--[\s\S]*?-->/g, '');

    var sections = [];
    var sec = null;
    var item = null;
    var para = [];
    var quote = [];

    function flushPara() {
      if (para.length) {
        var p = para.join(' ');
        if (item) item.paragraphs.push(p);
        else if (sec) sec.paragraphs.push(p);
      }
      para = [];
    }

    function flushQuote() {
      if (quote.length && sec) sec.callouts.push(quote.slice());
      quote = [];
    }

    function flushAll() { flushPara(); flushQuote(); }

    body.split('\n').forEach(function (line) {
      var t = line.trim();
      var m;

      if ((m = t.match(/^###\s+(.+)$/))) {
        flushAll();
        if (!sec) return;
        item = { title: m[1].trim(), props: {}, bullets: [], paragraphs: [] };
        sec.items.push(item);
        return;
      }

      if ((m = t.match(/^##\s+(.+)$/))) {
        flushAll();
        item = null;
        sec = {
          title: m[1].trim(),
          directives: {},
          paragraphs: [],
          bullets: [],
          callouts: [],
          items: []
        };
        sec.slug = slugify(sec.title);
        sections.push(sec);
        return;
      }

      if ((m = t.match(/^@([a-z_]+):\s*(.*)$/))) {
        flushAll();
        if (sec) sec.directives[m[1]] = m[2].trim();
        return;
      }

      if ((m = t.match(/^>\s?(.*)$/))) {
        flushPara();
        if (m[1].trim()) quote.push(m[1].trim());
        return;
      }

      if ((m = t.match(/^[-*]\s+(.+)$/))) {
        flushAll();
        var entry = m[1].trim();
        var prop = entry.match(/^([a-z][a-z0-9_]*):\s+(.*)$/);
        if (prop && item) {
          item.props[prop[1]] = prop[2].trim();
        } else if (item) {
          item.bullets.push(entry);
        } else if (sec) {
          sec.bullets.push(entry);
        }
        return;
      }

      if (!t) {
        flushAll();
        return;
      }

      flushQuote();
      para.push(t);
    });

    flushAll();

    sections.forEach(function (s) {
      if (s.directives.id) s.slug = s.directives.id;
      s.type = s.directives.type || 'generic';
    });

    return { meta: meta, sections: sections };
  }

  /* Export for node-based tests; in the browser, continue to rendering. */
  var api = { parseSiteContent: parseSiteContent, inline: inline, slugify: slugify };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    return;
  }
  global.SiteContent = api;
  if (typeof document === 'undefined') return;

  /* ------------------------------------------------------------------ *
   *  Icons (inline SVG, no icon-font dependency)                        *
   * ------------------------------------------------------------------ */

  var ICONS = {
    email: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>',
    scholar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 1 9l11 6 9-4.91V17h2V9L12 3zM5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82z"/></svg>',
    github: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
    cv: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7v2h6.59L5 17.59 6.41 19 15 10.41V17h2V7H7z"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" aria-hidden="true" width="12" height="12" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>'
  };

  /* ------------------------------------------------------------------ *
   *  Render helpers                                                     *
   * ------------------------------------------------------------------ */

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html !== undefined) node.innerHTML = html;
    return node;
  }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function socialLinks(meta, opts) {
    opts = opts || {};
    var out = [];
    if (meta.email) out.push({ label: 'Email', href: 'mailto:' + meta.email, icon: 'email' });
    if (meta.scholar) out.push({ label: 'Scholar', href: meta.scholar, icon: 'scholar', ext: true });
    if (meta.github) out.push({ label: 'GitHub', href: meta.github, icon: 'github', ext: true });
    if (meta.cv && !opts.skipCv) out.push({ label: 'CV', href: meta.cv, icon: 'cv', ext: true });
    return out.map(function (l) {
      return '<a class="pill-link" href="' + escapeHtml(l.href) + '"' +
        (l.ext ? ' target="_blank" rel="noopener"' : '') + '>' +
        ICONS[l.icon] + '<span>' + l.label + '</span></a>';
    }).join('');
  }

  function statusPill(meta) {
    if (!meta.status) return '';
    return '<span class="status-pill"><i class="dot" aria-hidden="true"></i>' +
      escapeHtml(meta.status) + '</span>';
  }

  function parseLinkList(value) {
    var links = [];
    var re = /\[([^\]]+)\]\(([^)\s]+)\)/g;
    var m;
    while ((m = re.exec(value))) links.push({ label: m[1], href: m[2] });
    return links;
  }

  /* ------------------------------------------------------------------ *
   *  Hero / nav / marquee / footer                                      *
   * ------------------------------------------------------------------ */

  function renderHero(meta) {
    var kicker = document.getElementById('heroKicker');
    var name = document.getElementById('heroName');
    var tagline = document.getElementById('heroTagline');
    var heroMeta = document.getElementById('heroMeta');

    kicker.textContent = meta.kicker || '';

    var fullName = meta.name || 'Hello';
    name.setAttribute('aria-label', fullName);
    name.innerHTML = fullName.split(/\s+/).map(function (word) {
      var chars = word.split('').map(function (ch) {
        return '<span class="char-mask"><span class="char">' + escapeHtml(ch) + '</span></span>';
      }).join('');
      return '<span class="word" aria-hidden="true">' + chars + '</span>';
    }).join('') + '<span class="char-mask" aria-hidden="true"><span class="char name-dot">.</span></span>';

    tagline.innerHTML = inline(meta.tagline || '');

    heroMeta.innerHTML =
      statusPill(meta) +
      '<div class="hero-links">' + socialLinks(meta) + '</div>';

    // monogram from initials
    var brand = document.getElementById('navBrand');
    var initials = fullName.split(/\s+/).map(function (w) { return w.charAt(0); }).join('').toUpperCase();
    brand.innerHTML = escapeHtml(initials) + '<span class="brand-dot">.</span>';
  }

  function renderNav(meta, sections) {
    var navLinks = document.getElementById('navLinks');
    var menuLinks = document.getElementById('menuLinks');
    var navable = sections.filter(function (s) { return s.directives.nav !== 'no'; });

    navLinks.innerHTML = navable.map(function (s) {
      var label = s.directives.nav_label || s.title;
      return '<a class="nav-link" href="#' + s.slug + '">' + escapeHtml(label) + '</a>';
    }).join('');

    menuLinks.innerHTML = navable.map(function (s, i) {
      var num = pad2(sections.indexOf(s) + 1);
      var label = s.directives.nav_label || s.title;
      return '<a class="menu-link" href="#' + s.slug + '" style="--i:' + i + '">' +
        '<span class="menu-link-num">' + num + '</span>' + escapeHtml(label) + '</a>';
    }).join('');

    document.getElementById('menuFoot').innerHTML = socialLinks(meta);

    if (meta.cv) {
      var cvBtn = document.getElementById('navCv');
      cvBtn.href = meta.cv;
      cvBtn.hidden = false;
      cvBtn.textContent = 'CV';
    }
  }

  function renderFooter(meta) {
    var footer = document.getElementById('siteFooter');
    var map = '';
    if (meta.clustrmaps) {
      var mapImg = '<img src="' + escapeHtml(meta.clustrmaps) + '" alt="Visitor map" loading="lazy">';
      map = meta.clustrmaps_link
        ? '<a class="footer-map" href="' + escapeHtml(meta.clustrmaps_link) + '" target="_blank" rel="noopener">' + mapImg + '</a>'
        : '<span class="footer-map">' + mapImg + '</span>';
    }
    footer.innerHTML =
      '<div class="footer-inner">' +
      '<div><p class="footer-copy">' + inline(meta.footer || '') + '</p>' +
      '<p class="footer-note">Rendered from a single markdown file.</p></div>' +
      map +
      '</div>';
  }

  /* ------------------------------------------------------------------ *
   *  Section renderers                                                  *
   * ------------------------------------------------------------------ */

  function sectionShell(section, index, bodyHtml, extraClass) {
    var num = pad2(index + 1);
    return '' +
      '<section class="section section--' + section.type + (extraClass ? ' ' + extraClass : '') +
      '" id="' + section.slug + '">' +
      '<div class="section-ghost" aria-hidden="true">' + num + '</div>' +
      '<div class="section-wrap">' +
      '<header class="section-head" data-reveal>' +
      '<span class="section-index">' + num + '</span>' +
      '<h2 class="section-title">' + escapeHtml(section.title) + '</h2>' +
      '<span class="section-rule" data-rule></span>' +
      '</header>' +
      '<div class="section-body">' + bodyHtml + '</div>' +
      '</div>' +
      '</section>';
  }

  /* The constellation section renders into the hero stage overlay: the
     3D engine (constellation.js) then carries the topics on anchor stars. */
  function renderResearchOverlay(section, index) {
    var overlay = document.getElementById('researchOverlay');
    if (!overlay) return;

    global.__constellationSlug = section.slug;

    var intro = section.paragraphs.map(function (p) {
      return '<p class="sky-intro">' + inline(p) + '</p>';
    }).join('');

    var labels = section.bullets.map(function (b, i) {
      return '<span class="topic-label" data-topic="' + i + '">' + inline(b) + '</span>';
    }).join('');

    overlay.innerHTML =
      '<div class="research-head" id="researchHead">' +
      '<div class="section-head">' +
      '<span class="section-index">' + pad2(index + 1) + '</span>' +
      '<h2 class="section-title">' + escapeHtml(section.title) + '</h2>' +
      '<span class="section-rule"></span>' +
      '</div>' +
      intro +
      '</div>' +
      '<div class="topic-layer" id="topicLayer">' + labels + '</div>';
  }

  function renderAbout(section) {
    var d = section.directives;
    var photo = '';
    if (d.photo) {
      photo =
        '<figure class="about-photo" data-reveal>' +
        '<div class="tilt" data-tilt>' +
        '<img src="' + escapeHtml(d.photo) + '" alt="' + escapeHtml(d.photo_alt || '') + '">' +
        '<div class="tilt-shine" aria-hidden="true"></div>' +
        '</div>' +
        (d.photo_caption ? '<figcaption class="mono-label">' + escapeHtml(d.photo_caption) + '</figcaption>' : '') +
        '</figure>';
    }

    var prose = section.paragraphs.map(function (p) {
      return '<p data-reveal>' + inline(p) + '</p>';
    }).join('');

    var callouts = section.callouts.map(function (lines) {
      return '<aside class="callout" data-reveal>' + lines.map(function (l) {
        return '<p>' + inline(l) + '</p>';
      }).join('') + '</aside>';
    }).join('');

    return '<div class="about-grid">' + photo +
      '<div class="about-prose">' + prose + callouts + '</div></div>';
  }

  function newsItem(bullet) {
    var m = bullet.match(/^\*\*(.+?)\*\*\s*[—–-]+\s*([\s\S]+)$/);
    var date = m ? m[1] : '';
    var text = m ? m[2] : bullet;
    return '<li class="news-item" data-reveal>' +
      '<span class="news-date">' + escapeHtml(date) + '</span>' +
      '<p class="news-text">' + inline(text) + '</p>' +
      '</li>';
  }

  function renderNews(section) {
    var visible = parseInt(section.directives.visible, 10) || 5;
    var recent = section.bullets.slice(0, visible);
    var older = section.bullets.slice(visible);

    var html = '<ol class="news-list">' + recent.map(newsItem).join('') + '</ol>';

    if (older.length) {
      html +=
        '<ol class="news-list news-older is-hidden" id="newsOlder">' +
        older.map(newsItem).join('') +
        '</ol>' +
        '<button class="news-toggle btn btn-ghost" id="newsToggle" type="button" ' +
        'aria-expanded="false" aria-controls="newsOlder">' +
        '<span data-label>View older updates</span>' + ICONS.chevron +
        '</button>';
    }
    return html;
  }

  function renderTimeline(section) {
    var items = section.items.map(function (it) {
      var logo = it.props.logo
        ? '<div class="tl-logo"><img src="' + escapeHtml(it.props.logo) + '" alt=""' +
          (it.props.logo_mode ? ' data-logo-mode="' + escapeHtml(it.props.logo_mode) + '"' : '') +
          ' loading="lazy"></div>'
        : '<div class="tl-logo tl-logo--ghost" aria-hidden="true">' + escapeHtml(it.title.charAt(0)) + '</div>';

      var rows = '';
      ['role', 'degree', 'detail', 'host'].forEach(function (key) {
        if (it.props[key]) {
          rows += '<p class="tl-detail' + (key === 'host' ? ' tl-host' : '') + '">' + inline(it.props[key]) + '</p>';
        }
      });

      return '<article class="tl-item" data-reveal>' + logo +
        '<div class="tl-body">' +
        '<h3 class="tl-title">' + inline(it.title) + '</h3>' +
        rows +
        (it.props.period ? '<p class="tl-period mono-label">' + escapeHtml(it.props.period) + '</p>' : '') +
        '</div></article>';
    }).join('');

    return '<div class="timeline">' + items + '</div>';
  }

  function renderPublications(section) {
    var note = section.directives.note
      ? '<p class="pub-note mono-label">' + escapeHtml(section.directives.note) + '</p>'
      : '';

    var items = section.items.map(function (it, i) {
      var links = parseLinkList(it.props.links || '').map(function (l) {
        return '<a class="pill-link" href="' + escapeHtml(l.href) + '" target="_blank" rel="noopener">' +
          '<span>' + escapeHtml(l.label) + '</span>' + ICONS.arrow + '</a>';
      }).join('');

      return '<li class="pub" data-reveal>' +
        '<span class="pub-num">' + pad2(i + 1) + '</span>' +
        '<div class="pub-body">' +
        (it.props.venue ? '<span class="pub-venue">' + escapeHtml(it.props.venue) + '</span>' : '') +
        '<h3 class="pub-title">' + inline(it.title) + '</h3>' +
        (it.props.authors ? '<p class="pub-authors">' + inline(it.props.authors) + '</p>' : '') +
        (links ? '<div class="pub-links">' + links + '</div>' : '') +
        '</div></li>';
    }).join('');

    return note + '<ol class="pub-list">' + items + '</ol>';
  }

  function renderColumns(section) {
    var cols = section.items.map(function (it) {
      var rows = it.bullets.map(function (b) {
        var splitAt = b.indexOf(' — ');
        var main = splitAt === -1 ? b : b.slice(0, splitAt);
        var metaTxt = splitAt === -1 ? '' : b.slice(splitAt + 3);
        return '<li>' +
          '<span class="col-main">' + inline(main) + '</span>' +
          (metaTxt ? '<span class="col-meta">' + inline(metaTxt) + '</span>' : '') +
          '</li>';
      }).join('');
      return '<div class="col" data-reveal>' +
        '<h3 class="col-title mono-label">' + escapeHtml(it.title) + '</h3>' +
        '<ul class="col-list">' + rows + '</ul>' +
        '</div>';
    }).join('');

    return '<div class="cols">' + cols + '</div>';
  }

  function renderContact(section, meta) {
    var headline = section.directives.headline || section.title;
    var sub = section.paragraphs.map(function (p) {
      return '<p class="contact-sub" data-reveal>' + inline(p) + '</p>';
    }).join('');

    var email = meta.email
      ? '<div class="contact-email" data-reveal>' +
        '<a class="email-big" href="mailto:' + escapeHtml(meta.email) + '">' + escapeHtml(meta.email) + '</a>' +
        '<button class="copy-btn btn btn-ghost" id="copyEmail" type="button" data-email="' + escapeHtml(meta.email) + '">' +
        ICONS.copy + '<span data-label>Copy</span></button>' +
        '</div>'
      : '';

    return '<div class="contact">' +
      '<p class="contact-headline" data-reveal>' + inline(headline) + '</p>' +
      sub + email +
      '<div class="contact-links" data-reveal>' + statusPill(meta) + socialLinks(meta) + '</div>' +
      '</div>';
  }

  function renderGeneric(section) {
    var html = section.paragraphs.map(function (p) {
      return '<p class="about-prose" data-reveal>' + inline(p) + '</p>';
    }).join('');
    if (section.bullets.length) {
      html += '<ul class="col-list">' + section.bullets.map(function (b) {
        return '<li data-reveal><span class="col-main">' + inline(b) + '</span></li>';
      }).join('') + '</ul>';
    }
    return html;
  }

  function renderSections(meta, sections) {
    var host = document.getElementById('sections');
    var html = sections.map(function (section, i) {
      var body;
      switch (section.type) {
        case 'constellation':
          renderResearchOverlay(section, i);
          return '';
        case 'about': body = renderAbout(section); break;
        case 'news': body = renderNews(section); break;
        case 'timeline': body = renderTimeline(section); break;
        case 'publications': body = renderPublications(section); break;
        case 'columns': body = renderColumns(section); break;
        case 'contact': body = renderContact(section, meta); break;
        default: body = renderGeneric(section);
      }
      return sectionShell(section, i, body);
    }).join('');
    host.innerHTML = html;
  }

  /* ------------------------------------------------------------------ *
   *  Institution logos → warm-white mono marks (canvas luminance matte) *
   * ------------------------------------------------------------------ */

  function whitenLogo(img) {
    if (img.dataset.mono) return;
    try {
      var c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      if (!c.width || !c.height) return;
      var x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      var data = x.getImageData(0, 0, c.width, c.height);
      var px = data.data;

      // default mode: drop only near-white pixels (backgrounds, knockout
      // details), everything else becomes warm white.
      // outline mode (e.g. Princeton): keep only the DARK strokes — colored
      // fills go transparent too, leaving a clean white line-art mark.
      var outline = img.dataset.logoMode === 'outline';
      var cut = outline ? 135 : 232;
      var ramp = outline ? 40 : 50;

      for (var i = 0; i < px.length; i += 4) {
        var a = px[i + 3];
        if (!a) continue;
        var lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        var keep = lum >= cut ? 0 : lum > cut - ramp ? (cut - lum) / ramp : 1;
        px[i] = 245; px[i + 1] = 242; px[i + 2] = 235;
        px[i + 3] = Math.round(a * keep);
      }
      x.putImageData(data, 0, 0);
      img.dataset.mono = '1';
      img.src = c.toDataURL('image/png');
      var chip = img.closest('.tl-logo');
      if (chip) chip.classList.add('is-dark');
    } catch (e) {
      /* tainted canvas or decode failure: keep the original logo */
    }
  }

  function whitenLogos() {
    document.querySelectorAll('.tl-logo img').forEach(function (img) {
      if (img.complete && img.naturalWidth) {
        whitenLogo(img);
      } else {
        img.addEventListener('load', function () { whitenLogo(img); }, { once: true });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   *  Behaviors (work with or without GSAP)                              *
   * ------------------------------------------------------------------ */

  function initNewsToggle() {
    var btn = document.getElementById('newsToggle');
    var older = document.getElementById('newsOlder');
    if (!btn || !older) return;
    var label = btn.querySelector('[data-label]');
    btn.addEventListener('click', function () {
      var expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      older.classList.toggle('is-hidden', expanded);
      label.textContent = expanded ? 'View older updates' : 'Hide older updates';
      if (!expanded && global.SiteMotion) global.SiteMotion.revealNow(older);
      if (global.ScrollTrigger) global.ScrollTrigger.refresh();
    });
  }

  function initCopyEmail() {
    var btn = document.getElementById('copyEmail');
    if (!btn) return;
    var label = btn.querySelector('[data-label]');
    var timer = null;
    btn.addEventListener('click', function () {
      var email = btn.getAttribute('data-email');
      var done = function () {
        btn.classList.add('is-copied');
        label.textContent = 'Copied';
        clearTimeout(timer);
        timer = setTimeout(function () {
          btn.classList.remove('is-copied');
          label.textContent = 'Copy';
        }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(email).then(done, done);
      } else {
        var ta = document.createElement('textarea');
        ta.value = email;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch (e) { /* noop */ }
        document.body.removeChild(ta);
        done();
      }
    });
  }

  function initMenu() {
    var burger = document.getElementById('navBurger');
    var overlay = document.getElementById('menuOverlay');
    if (!burger || !overlay) return;

    function open() {
      overlay.hidden = false;
      // force reflow so the transition runs
      void overlay.offsetHeight;
      overlay.classList.add('is-open');
      burger.classList.add('is-open');
      burger.setAttribute('aria-expanded', 'true');
      burger.setAttribute('aria-label', 'Close menu');
      document.body.style.overflow = 'hidden';
      if (global.__lenis) global.__lenis.stop();
    }

    function close() {
      overlay.classList.remove('is-open');
      burger.classList.remove('is-open');
      burger.setAttribute('aria-expanded', 'false');
      burger.setAttribute('aria-label', 'Open menu');
      document.body.style.overflow = '';
      if (global.__lenis) global.__lenis.start();
      setTimeout(function () {
        if (!overlay.classList.contains('is-open')) overlay.hidden = true;
      }, 480);
    }

    burger.addEventListener('click', function () {
      if (overlay.classList.contains('is-open')) close();
      else open();
    });

    overlay.addEventListener('click', function (e) {
      if (e.target.closest('a')) close();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay.classList.contains('is-open')) close();
    });

    global.__closeMenu = close;
  }

  function initAnchors() {
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]');
      if (!a) return;
      var id = a.getAttribute('href').slice(1);

      // virtual anchors (e.g. the research stop on the hero runway)
      var overrides = global.__anchorOverrides;
      if (overrides && id in overrides && typeof overrides[id] === 'number') {
        e.preventDefault();
        if (global.__lenis) global.__lenis.scrollTo(overrides[id], { duration: 1.3 });
        else global.scrollTo({ top: overrides[id], behavior: 'smooth' });
        return;
      }

      var target = id ? document.getElementById(id) : document.body;
      if (!target && id !== 'top') return;
      e.preventDefault();
      var dest = id === 'top' ? 0 : target;
      if (global.__lenis) {
        global.__lenis.scrollTo(dest, { duration: 1.2 });
      } else if (dest === 0) {
        global.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  }

  /* ------------------------------------------------------------------ *
   *  Boot                                                               *
   * ------------------------------------------------------------------ */

  function showError() {
    var heroMeta = document.getElementById('heroMeta');
    var name = document.getElementById('heroName');
    name.textContent = 'Yizhou Lu';
    heroMeta.innerHTML =
      '<div class="load-error" role="alert">' +
      '<p><strong>content.md could not be loaded.</strong></p>' +
      '<p>If you opened this file directly (file://), browsers block local fetches. ' +
      'Run a tiny server from the project folder instead:</p>' +
      '<p><code>python3 -m http.server 4173</code> → <code>http://localhost:4173</code></p>' +
      '<p>或者直接双击项目根目录下的 <code>preview.command</code> 一键预览。</p>' +
      '</div>';
    document.body.classList.remove('is-loading');
  }

  function boot(raw) {
    var parsed = parseSiteContent(raw);
    var meta = parsed.meta;
    var sections = parsed.sections;

    renderHero(meta);
    renderNav(meta, sections);
    renderSections(meta, sections);
    renderFooter(meta);

    // collapse the hero runway when no constellation section exists
    var hasResearch = sections.some(function (s) { return s.type === 'constellation'; });
    if (!hasResearch) document.body.classList.add('no-research');

    whitenLogos();
    initNewsToggle();
    initCopyEmail();
    initMenu();
    initAnchors();

    // bind topics to the 3D constellation, then hand over to the motion layer
    if (global.HeroConstellation) global.HeroConstellation.bindTopics();
    if (global.SiteMotion) global.SiteMotion.init();

    requestAnimationFrame(function () {
      document.body.classList.remove('is-loading');
      if (global.SiteMotion) global.SiteMotion.enter();
    });
  }

  fetch('content.md', { cache: 'no-cache' })
    .then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    })
    .then(boot)
    .catch(function (err) {
      console.error('[site] failed to load content.md:', err);
      showError();
    });

})(typeof window !== 'undefined' ? window : globalThis);
