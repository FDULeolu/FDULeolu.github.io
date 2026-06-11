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

const summary = await page.evaluate(() => ({
  title: document.title,
  navLinks: [...document.querySelectorAll('.nav-link')].map(a => a.textContent),
  sections: [...document.querySelectorAll('#sections section')].map(s => s.id),
  heroName: document.getElementById('heroName')?.getAttribute('aria-label'),
  newsVisible: document.querySelectorAll('.news-list:not(.news-older) .news-item').length,
  newsOlder: document.querySelectorAll('.news-older .news-item').length,
  pubs: document.querySelectorAll('.pub').length,
  tlItems: document.querySelectorAll('.tl-item').length,
  cols: document.querySelectorAll('.col').length,
  hasCanvas: !!document.getElementById('heroCanvas'),
  canvasPainted: (() => {
    const c = document.getElementById('heroCanvas');
    if (!c) return false;
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
    return false;
  })(),
  bodyClasses: document.body.className,
  lenis: !!window.__lenis,
  gsap: typeof window.gsap !== 'undefined'
}));

console.log(JSON.stringify(summary, null, 2));

await page.screenshot({ path: `${OUT}/01-hero-desktop.png` });

// scroll through sections for reveal animations + screenshots
for (const [i, id] of ['about', 'news', 'experience', 'publications', 'contact'].entries()) {
  await page.evaluate(id => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'instant', block: 'start' });
  }, id);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/0${i + 2}-${id}.png` });
}

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

// anchor navigation from navbar
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
await page.click('.nav-link[href="#publications"]');
await page.waitForTimeout(1600);
const anchorY = await page.evaluate(() => {
  const r = document.getElementById('publications').getBoundingClientRect();
  return Math.round(r.top);
});
console.log('anchor scroll lands publications at top offset:', anchorY);

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
