/* Browser smoke test: node tests/verify.mjs
   Requires: npm i --no-save playwright-core && npx playwright install chromium
   Captures console/page errors, checks rendered DOM, exercises interactions,
   and saves screenshots to local/shots/. */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = 'http://127.0.0.1:4173/';
const OUT = 'local/shots';
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const failedRequests = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

page.on('console', msg => {
  if (msg.type() === 'error') errors.push('[console] ' + msg.text());
});
page.on('pageerror', err => errors.push('[pageerror] ' + err.message));
page.on('requestfailed', req => {
  failedRequests.push(req.url() + ' → ' + (req.failure()?.errorText || '?'));
});

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('#sections section', { timeout: 8000 });
await page.waitForTimeout(1800); // let the hero entrance finish

const painted = sel => `(() => {
  const c = document.querySelector('${sel}');
  if (!c) return false;
  const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
  return false;
})()`;

const summary = await page.evaluate(`({
  title: document.title,
  navLinks: [...document.querySelectorAll('.nav-link')].map(a => a.textContent),
  sections: [...document.querySelectorAll('#sections section')].map(s => s.id),
  heroName: document.getElementById('heroName')?.getAttribute('aria-label'),
  newsVisible: document.querySelectorAll('.news-list:not(.news-older) .news-item').length,
  newsOlder: document.querySelectorAll('.news-older .news-item').length,
  pubs: document.querySelectorAll('.pub').length,
  tlItems: document.querySelectorAll('.tl-item').length,
  monoLogos: document.querySelectorAll('.tl-logo.is-dark').length,
  cols: document.querySelectorAll('.col').length,
  topicLabels: document.querySelectorAll('#topicLayer .topic-label').length,
  topicLayer3d: !!document.querySelector('#topicLayer.is-3d'),
  topicNodeCount: window.__topicNodeCount,
  topicLinkCount: window.__topicLinkCount,
  researchHead: !!document.getElementById('researchHead'),
  aboutIndex: document.querySelector('#about .section-index')?.textContent,
  researchY: window.__researchY,
  heroCanvasPainted: ${painted('#heroCanvas')},
  skyCanvasPainted: ${painted('#skyCanvas')},
  bodyClasses: document.body.className,
  lenis: !!window.__lenis,
  gsap: typeof window.gsap !== 'undefined'
})`);

console.log(JSON.stringify(summary, null, 2));

const expectedNav = 'About,News,Education,Experience,Publications,Honors,Contact';
if (summary.navLinks.join(',') !== expectedNav) errors.push('[nav] got: ' + summary.navLinks.join(','));
if (summary.sections.length !== 7) errors.push('[sections] got ' + summary.sections.length);
if (summary.topicLabels !== 6) errors.push('[research] topic labels: ' + summary.topicLabels);
if (!summary.topicLayer3d) errors.push('[research] topic layer not bound to 3D engine');
if (summary.topicNodeCount !== summary.topicLabels) errors.push('[research] topic nodes: ' + summary.topicNodeCount);
if (summary.topicLinkCount < summary.topicLabels * 3) errors.push('[research] topic links: ' + summary.topicLinkCount);
if (summary.researchHead) errors.push('[research] visible header still rendered');
if (summary.aboutIndex !== '01') errors.push('[sections] about index: ' + summary.aboutIndex);
if (typeof summary.researchY !== 'number') errors.push('[research] __researchY not published');
if (!summary.skyCanvasPainted) errors.push('[sky] backdrop canvas not painted');

await page.screenshot({ path: `${OUT}/01-hero-desktop.png` });

// ---- spring test 1: pull deep inside the hero zone → springs to Research ----
await page.mouse.move(720, 450);
await page.mouse.wheel(0, 520);
await page.waitForTimeout(3000);
const s1 = await page.evaluate(() => ({ y: Math.round(window.scrollY), ry: window.__researchY }));
console.log('spring release hero → research:', JSON.stringify(s1));
if (Math.abs(s1.y - s1.ry) > 4) errors.push('[spring] hero→research expected ' + s1.ry + ', got ' + s1.y);
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/01b-research.png` });

// some topic labels must be visible (front-side stars) in research state
const visibleLabels = await page.evaluate(() =>
  [...document.querySelectorAll('#topicLayer .topic-label')]
    .filter(el => parseFloat(el.style.opacity || '0') > 0.3).length);
console.log('visible topic labels at research:', visibleLabels);
if (visibleLabels < 2) errors.push('[research] only ' + visibleLabels + ' labels visible');

// ---- spring test 2: a small pull bounces back to research ----
await page.mouse.wheel(0, 170);
await page.waitForTimeout(2400);
const s2 = await page.evaluate(() => Math.round(window.scrollY));
console.log('spring bounce-back at research:', s2);
if (Math.abs(s2 - s1.ry) > 6) errors.push('[spring] bounce expected ' + s1.ry + ', got ' + s2);

// ---- spring test 3: a deep pull releases to About ----
await page.mouse.wheel(0, 620);
await page.waitForTimeout(3000);
const s3 = await page.evaluate(() => {
  const about = document.getElementById('about');
  return {
    y: Math.round(window.scrollY),
    aboutTop: Math.round(about.getBoundingClientRect().top + window.scrollY)
  };
});
console.log('spring release research → about:', JSON.stringify(s3));
if (Math.abs(s3.y - s3.aboutTop) > 4) errors.push('[spring] research→about expected ' + s3.aboutTop + ', got ' + s3.y);

// meteor API smoke
await page.evaluate(() => window.SiteSky.meteor());
await page.waitForTimeout(400);

// scroll through sections for reveal animations + screenshots
for (const [i, id] of ['about', 'news', 'education', 'experience', 'publications', 'contact'].entries()) {
  await page.evaluate(id => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, id);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/0${i + 2}-${id}.png` });
}

// logos are lazy-loaded; by now they must all be converted to mono marks
const monoLogos = await page.evaluate(() =>
  document.querySelectorAll('.tl-logo.is-dark').length);
console.log('mono logos after viewing timeline:', monoLogos);
if (monoLogos !== 5) errors.push('[logos] mono-converted: ' + monoLogos);

// news toggle
await page.evaluate(() => document.getElementById('news')?.scrollIntoView({ behavior: 'instant' }));
await page.waitForTimeout(600);
await page.click('#newsToggle');
await page.waitForTimeout(700);
const olderShown = await page.evaluate(() =>
  !document.getElementById('newsOlder').classList.contains('is-hidden'));
console.log('news toggle works:', olderShown);
await page.screenshot({ path: `${OUT}/07-news-expanded.png` });

// copy email button
await page.evaluate(() => document.getElementById('contact')?.scrollIntoView({ behavior: 'instant' }));
await page.waitForTimeout(800);
await page.click('#copyEmail').catch(e => errors.push('[copy click] ' + e.message));
await page.waitForTimeout(300);
const copied = await page.evaluate(() =>
  document.getElementById('copyEmail')?.classList.contains('is-copied'));
console.log('copy email feedback:', copied);

// anchor navigation from navbar (sections now align to the viewport top)
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await page.click('.nav-link[href="#publications"]');
await page.waitForTimeout(1900);
const anchorY = await page.evaluate(() => {
  const r = document.getElementById('publications').getBoundingClientRect();
  return Math.round(r.top);
});
console.log('anchor scroll lands publications at top offset:', anchorY);
if (Math.abs(anchorY) > 4) errors.push('[anchor] publications offset ' + anchorY);

// full page
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/08-fullpage.png`, fullPage: true });

// ---- mobile pass ----
const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
mob.on('console', msg => { if (msg.type() === 'error') errors.push('[mobile console] ' + msg.text()); });
mob.on('pageerror', err => errors.push('[mobile pageerror] ' + err.message));
await mob.goto(BASE, { waitUntil: 'networkidle' });
await mob.waitForSelector('#sections section', { timeout: 8000 });
await mob.waitForTimeout(1800);
await mob.screenshot({ path: `${OUT}/09-mobile-hero.png` });

const burgerVisible = await mob.isVisible('#navBurger');
console.log('mobile burger visible:', burgerVisible);
await mob.click('#navBurger');
await mob.waitForTimeout(700);
await mob.screenshot({ path: `${OUT}/10-mobile-menu.png` });
const menuOpen = await mob.evaluate(() =>
  document.getElementById('menuOverlay').classList.contains('is-open'));
console.log('mobile menu opens:', menuOpen);

await mob.click('.menu-link[href="#publications"]');
await mob.waitForTimeout(1500);
const menuClosed = await mob.evaluate(() => document.getElementById('menuOverlay').hidden);
console.log('menu closes after click:', menuClosed);
await mob.screenshot({ path: `${OUT}/11-mobile-publications.png` });

// research state on mobile (no lenis there: jump straight to the rest point;
// CSS proximity-snap would re-anchor a programmatic jump, so disable it the
// way a real finger-drag pauses it)
await mob.waitForFunction(() => {
  const y = window.scrollY;
  const settled = window.__lastY === y;
  window.__lastY = y;
  return settled;
}, null, { polling: 350, timeout: 10000 });
await mob.evaluate(() => {
  document.documentElement.style.scrollSnapType = 'none';
  window.scrollTo({ top: window.__researchY || 0, behavior: 'instant' });
});
await mob.waitForTimeout(1400);
const mobState = await mob.evaluate(() => ({
  y: Math.round(window.scrollY),
  ry: window.__researchY,
  labels: [...document.querySelectorAll('#topicLayer .topic-label')]
    .filter(el => parseFloat(el.style.opacity || '0') > 0.3).length
}));
console.log('mobile research state:', JSON.stringify(mobState));
if (Math.abs(mobState.y - mobState.ry) > 8) errors.push('[research] mobile scroll landed at ' + mobState.y);
if (mobState.labels < 1) errors.push('[research] no visible labels on mobile');
await mob.screenshot({ path: `${OUT}/12-mobile-research.png` });

// horizontal overflow check
const overflow = await mob.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('mobile horizontal overflow px:', overflow);

await browser.close();

console.log('\n---- failed requests ----');
console.log(failedRequests.length ? failedRequests.join('\n') : '(none)');
console.log('---- errors ----');
console.log(errors.length ? errors.join('\n') : '(none)');

if (errors.length) process.exit(1);
console.log('\nBrowser verification passed.');
