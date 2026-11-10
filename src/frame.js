// Shared frame logic: loads themes, picks the active theme, builds the page HTML,
// computes cache keys and renders HTML to JPEG with a small pool of browser tabs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config.json');
const { cleanTitle, isFood } = require('./titles');
const { reduction, covered } = require('./prices');

const ROOT = path.join(__dirname, '..');
const THEME_DIR = path.join(__dirname, 'themes');
const Page = require('./themes/_page');
const Tokens = require('./themes/_tokens');
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'gfh-logo.png')).toString('base64');

// Every src/themes/<name>.js (not starting with "_") is a theme: a plain object of design tokens.
function loadThemes() {
  const out = {};
  for (const f of fs.readdirSync(THEME_DIR)) {
    if (!f.endsWith('.js') || f.startsWith('_')) continue;
    const name = f.slice(0, -3);
    const file = path.join(THEME_DIR, f);
    delete require.cache[require.resolve(file)];
    const tokens = require(file);
    out[name] = { name, tokens, ...Tokens.compile(tokens) };
  }
  return out;
}
const themes = loadThemes();

// THEME env var wins, then the first matching date range in config.schedule, then config.theme.
function activeTheme(today = new Date().toISOString().slice(0, 10)) {
  if (process.env.THEME) return process.env.THEME;
  for (const s of config.schedule || []) if (today >= s.from && today <= s.to) return s.theme;
  return config.theme;
}

const photoUrl = (src) => src + (src.includes('?') ? '&' : '?') + 'width=900';
const facts = (p) => ({ type: p.type, vendor: p.vendor, title: p.title, tags: p.tags || [], createdAt: p.createdAt, collections: p.collections || [], category: p.category || '', food: isFood(p.type),
  onSale: (p.variants || []).some((v) => Number(v.compareAt) > Number(v.price)) });

// The design a product gets: a matching segment in config.segments, else the live theme.
const themeFor = (active, p) => Tokens.segmentTheme(config.segments, active, facts(p));
const labelFor = (t, p) => Tokens.resolve(t, facts(p));

// Layer images live in assets/layers/ and are embedded so the cloud render needs no extra requests.
const assetCache = new Map();
function assetSrc(src) {
  if (!src || !/^assets\/layers\/[\w.-]+$/.test(src)) return src;
  if (!assetCache.has(src)) {
    const file = path.join(ROOT, src);
    const ext = path.extname(file).slice(1).toLowerCase();
    const type = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
    assetCache.set(src, fs.existsSync(file) ? `data:${type};base64,${fs.readFileSync(file).toString('base64')}` : '');
  }
  return assetCache.get(src);
}

function frameOptions(t, p, price, fmt = '1x1') {
  const f = facts(p);
  return {
    ...labelFor(t, p),
    layers: Tokens.layersFor(t, { ...f, title: cleanTitle(p.title, config.maxTitleChars) }, price, fmt).map((l) => (l.kind === 'image' ? { ...l, src: assetSrc(l.src) } : l)),
    title: cleanTitle(p.title, config.maxTitleChars),
    sub: t.subText || '',
    photo: photoUrl(p.image),
    logo: LOGO,
    bandText: t.bandText || config.freeDeliveryText,
    price: price || null,
  };
}

function themeOf(themeName) {
  const t = themes[themeName];
  if (!t) throw new Error(`unknown theme "${themeName}" (have: ${Object.keys(themes).join(', ')})`);
  return t;
}

// The theme with its texts in one language (config.languages / config.translations); null = main.
function localized(t, lang) {
  if (!lang) return t;
  return Tokens.translate(t, (config.translations || {})[lang], config.freeDeliveryText);
}

// price: { now, ref, pct } or null. fmt: '1x1' | '4x5' | '9x16' | '2x3'. lang: e.g. 'nl_XX' or null
function pageHtml(themeName, p, fmt = '1x1', price = null, lang = null) {
  const t = localized(themeOf(themeName), lang);
  return Page.build(t, frameOptions(t, p, price, fmt), fmt);
}

// Variants that would show the same image. Without a price block that is the whole product;
// with one, variants are split by price (and verified reduction).
function priceGroups(themeName, p, history = {}, today = new Date().toISOString().slice(0, 10)) {
  const t = themeOf(themeName);
  if (!t.price || !t.price.show) return [{ variants: p.variants.map((v) => v.id), price: null }];
  const groups = new Map();
  for (const v of p.variants) {
    const h = history[v.id];
    const price = Tokens.priceView(t.price, { now: Number(v.price), compareAt: v.compareAt, verified: reduction(h, today, { maxAgeDays: t.price.maxAgeDays }), covered: covered(h) });
    const k = JSON.stringify(price);
    if (!groups.has(k)) groups.set(k, { variants: [], price });
    groups.get(k).variants.push(v.id);
  }
  return [...groups.values()];
}

// Hash of the exact page that is rendered, so an image is re-rendered exactly when it would look
// different (theme, layout code, photo, title, label, badge, price, format), and never otherwise.
function keyFor(themeName, p, fmt = '1x1', price = null, lang = null) {
  return crypto.createHash('sha1').update(fmt + '|' + pageHtml(themeName, p, fmt, price, lang)).digest('hex').slice(0, 12);
}

async function launch() {
  const puppeteer = require('puppeteer-core');
  const executablePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
}

// Each product photo is downloaded once and reused for all its formats (one CDN request per
// product instead of one per image). Small LRU so memory stays low.
const photoCache = new Map();
async function photoData(url) {
  if (photoCache.has(url)) {
    const v = photoCache.get(url);
    photoCache.delete(url);
    photoCache.set(url, v); // most recently used
    return v;
  }
  const p = (async () => {
    const r = await fetch(url, { headers: { 'User-Agent': 'GFH-catalog-frames/1.0' } });
    if (!r.ok) throw new Error(`photo ${r.status}`);
    const type = r.headers.get('content-type') || 'image/jpeg';
    return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  })();
  photoCache.set(url, p);
  p.catch(() => photoCache.delete(url));
  while (photoCache.size > 40) photoCache.delete(photoCache.keys().next().value);
  return p;
}

// Swap the photo URL in the page for the downloaded copy.
async function inlinePhoto(html) {
  const m = html.match(/<div class="plate"><img src="([^"]+)"/);
  if (!m || m[1].startsWith('data:')) return html;
  const url = m[1].replace(/&amp;/g, '&');
  return html.replace(m[0], `<div class="plate"><img src="${await photoData(url)}"`);
}

// jobs: [{ html, out, fmt }]. Returns { done, failed: [{ job, error }] }.
async function renderAll(browser, jobs, { concurrency = Number(process.env.CONCURRENCY) || config.concurrency, onProgress } = {}) {
  const queue = [...jobs];
  let done = 0;
  const failed = [];
  const worker = async () => {
    const page = await browser.newPage();
    while (queue.length) {
      const job = queue.shift();
      const f = Page.FORMATS[job.fmt || '1x1'];
      await page.setViewport({ width: f.w, height: f.h, deviceScaleFactor: 1 });
      let error = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          if (attempt) await new Promise((r) => setTimeout(r, 3000 * attempt)); // CDN throttling: back off
          await page.setContent(await inlinePhoto(job.html), { waitUntil: 'load', timeout: 45000 });
          await page.evaluate(async () => {
            await document.fonts.ready;
            await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
          });
          const ok = await page.evaluate(() => [...document.images].every((i) => i.naturalWidth > 0));
          if (!ok) throw new Error('product photo failed to load');
          await page.screenshot({ path: job.out, type: 'jpeg', quality: config.jpegQuality || 80 });
          error = null;
          break;
        } catch (e) {
          error = e.message;
        }
      }
      if (error) failed.push({ job, error });
      else done++;
      if (onProgress) onProgress(done + failed.length);
    }
    await page.close();
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length || 1) }, worker));
  return { done, failed };
}

module.exports = { localized, themeFor, Page, Tokens, frameOptions, priceGroups, themeOf, facts, loadThemes, LOGO, photoUrl, themes, activeTheme, pageHtml, keyFor, launch, renderAll, ROOT };
