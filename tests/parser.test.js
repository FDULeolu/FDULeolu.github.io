/* Run: node tests/parser.test.js */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseSiteContent, inline } = require('../assets/js/content.js');

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log('  ok  ' + label);
  } else {
    failures++;
    console.error('FAIL  ' + label + (detail !== undefined ? '  →  ' + detail : ''));
  }
}

const raw = fs.readFileSync(path.join(__dirname, '..', 'content.md'), 'utf8');
const { meta, sections } = parseSiteContent(raw);

/* ---- meta ---- */
check('meta.name', meta.name === 'Yizhou Lu', meta.name);
check('meta.email', meta.email === 'yizhoulu1112@gmail.com', meta.email);
check('meta.scholar has &user=', /user=KKpXYUQAAAAJ/.test(meta.scholar), meta.scholar);
check('meta.github', meta.github === 'https://github.com/FDULeolu', meta.github);
check('meta.cv stays commented out', meta.cv === undefined, meta.cv);
check('meta.status', /Fall 2027/.test(meta.status), meta.status);
check('meta.goatcounter', meta.goatcounter === 'https://yizhou.goatcounter.com/count', meta.goatcounter);
check('meta.goatcounter_home', meta.goatcounter_home === 'https://yizhou.goatcounter.com', meta.goatcounter_home);

/* ---- section inventory ---- */
const types = sections.map(s => s.type).join(',');
check('8 sections', sections.length === 8, String(sections.length));
check('section types', types === 'constellation,about,news,timeline,timeline,publications,columns,contact', types);
const slugs = sections.map(s => s.slug).join(',');
check('slugs', slugs === 'research,about,news,education,experience,publications,honors-service,contact', slugs);

/* ---- research constellation ---- */
const research = sections[0];
check('research: 6 topics', research.bullets.length === 6, String(research.bullets.length));
check('research: intro paragraph', research.paragraphs.length === 1);

/* ---- about ---- */
const about = sections[1];
check('about: 2 paragraphs', about.paragraphs.length === 2, String(about.paragraphs.length));
check('about: photo directive', about.directives.photo === 'assets/img/personal_image.png');
check('about: 1 callout', about.callouts.length === 1 && about.callouts[0].length === 1);
check('about: callout mentions PhD', /PhD position/.test(about.callouts[0][0]));

/* ---- news ---- */
const news = sections[2];
check('news: 9 bullets', news.bullets.length === 9, String(news.bullets.length));
check('news: visible=5', news.directives.visible === '5');
check('news: commented entries dropped', !news.bullets.some(b => /Yang Yuan/.test(b)));
check('news: first entry dated May 2026', /^\*\*May 2026\*\*/.test(news.bullets[0]), news.bullets[0]);

/* ---- education ---- */
const edu = sections[3];
check('education: in nav now', edu.directives.nav === undefined);
check('education: 1 item', edu.items.length === 1);
check('education: logo + role + period', !!(edu.items[0].props.logo && edu.items[0].props.role && edu.items[0].props.period));

/* ---- experience ---- */
const exp = sections[4];
check('experience: 4 items', exp.items.length === 4, String(exp.items.length));
check('experience: all items have logo/role/host/period',
  exp.items.every(it => it.props.logo && it.props.role && it.props.host && it.props.period));
check('experience: princeton first', /Princeton/.test(exp.items[0].title), exp.items[0].title);

/* ---- publications ---- */
const pubs = sections[5];
check('pubs: note directive', pubs.directives.note === '* denotes equal contribution');
check('pubs: 3 items', pubs.items.length === 3, String(pubs.items.length));
check('pubs: all have authors/venue/links',
  pubs.items.every(it => it.props.authors && it.props.venue && it.props.links));
check('pubs: template comment dropped', !pubs.items.some(it => /Paper Title/.test(it.title)));

/* ---- columns ---- */
const cols = sections[6];
check('columns: 3 groups', cols.items.length === 3, String(cols.items.length));
check('columns: nav_label Honors', cols.directives.nav_label === 'Honors');
check('columns: Awards has 2 entries', cols.items[0].bullets.length === 2);
check('columns: Teaching has 1 entry', cols.items[1].bullets.length === 1);
check('columns: Service has 2 entries', cols.items[2].bullets.length === 2);

/* ---- contact ---- */
const contact = sections[7];
check('contact: headline directive', /science together/.test(contact.directives.headline));
check('contact: 1 paragraph', contact.paragraphs.length === 1);

/* ---- inline markdown ---- */
check('inline: bold', inline('**May 2026** — hi') === '<strong>May 2026</strong> — hi',
  inline('**May 2026** — hi'));

const authors = inline('Yizhou Min*, **Yizhou Lu***, Lanqi Li*, Zhen Zhang, Jiaye Teng');
check('inline: equal-contribution stars survive', authors.includes('<strong>Yizhou Lu</strong>*'), authors);
check('inline: no stray <em> in authors', !authors.includes('<em>'), authors);

check('inline: italic word', inline('a *predictive* science') === 'a <em>predictive</em> science',
  inline('a *predictive* science'));

const host = inline('*Hosts:* [Prof. **Chi Jin**](https://a.b) and [**Chengshuai Shi**](https://c.d)');
check('inline: italic label + bold-in-link', host.startsWith('<em>Hosts:</em>') &&
  host.includes('<a href="https://a.b" target="_blank" rel="noopener">Prof. <strong>Chi Jin</strong></a>'), host);

const boldLink = inline('**[AI for Math Workshop, ICML 2026](https://ai4math2026.github.io/)**');
check('inline: bold wrapping a link',
  boldLink === '<strong><a href="https://ai4math2026.github.io/" target="_blank" rel="noopener">AI for Math Workshop, ICML 2026</a></strong>',
  boldLink);

check('inline: html escaped', inline('a < b & "c"') === 'a &lt; b &amp; &quot;c&quot;', inline('a < b & "c"'));
check('inline: url ampersand escaped', inline('[s](https://x.y?a=1&b=2)').includes('href="https://x.y?a=1&amp;b=2"'),
  inline('[s](https://x.y?a=1&b=2)'));
check('inline: code span', inline('run `python3 -m http.server`').includes('<code>python3 -m http.server</code>'));
check('inline: mailto link stays internal-style', !inline('[mail](mailto:a@b.c)').includes('target='),
  inline('[mail](mailto:a@b.c)'));

console.log('');
if (failures) {
  console.error(failures + ' check(s) failed');
  process.exit(1);
} else {
  console.log('All checks passed.');
}
