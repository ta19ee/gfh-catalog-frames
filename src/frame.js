// Shared frame logic: loads themes, picks the active theme, builds the page HTML,
// computes cache keys and renders HTML to JPEG with a small pool of browser tabs.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('../config.json');
const { cleanTitle, isFood } = require('./titles');
const { reduction } = require('./prices');

const ROOT = path.join(__dirname, '..');
const THEME_DIR = path.join(__dirname, 'themes');
const Page = require('./themes/_page');
const Tokens = require('./themes/_tokens');
const LOGO = 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'assets', 'gfh-logo.png')).toString('base64');
const read = (f) => fs.readFileSync(f, 'utf8');
const SHARED_VERSION = ['_page.js', '_tokens.js'].map((f) => read(path.join(THEME_DIR, f))).join('') + read(__filename) + read(path.join(__dirname, 'titles.js')) + config.freeDeliveryText;

// Every src/themes/<name>.js (not starting with "_") is a theme: a plain object of design tokens.
function loadThemes() {
  const out = {};
  for (const f of fs.readdirSync(THEME_DIR)) {
    if (!f.endsWith('.js') || f.startsWith('_')) continue;
    const name = f.slice(0, -3);
    const file = path.join(THEME_DIR, f);
    delete require.cache[require.resolve(file)];
    const tokens = require(file);
    out[name] = { name, tokens, ...Tokens.compile(tokens), version: JSON.stringify(tokens) };
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
const facts = (p) => ({ type: p.type, vendor: p.vendor, title: p.title, tags: p.tags || [], createdAt: p.createdAt, food: isFood(p.type) });
const labelFor = (t, p) => Tokens.resolve(t, facts(p));

function frameOptions(t, p, price) {
  return {
    ...labelFor(t, p),
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

// price: { now, ref, pct } or null. fmt: '1x1' | '4x5' | '9x16' | '2x3'
function pageHtml(themeName, p, fmt = '1x1', price = null) {
  const t = themeOf(themeName);
  return Page.build(t, frameOptions(t, p, price), fmt);
}

// Variants that would show the same image. Without a price block that is the whole product;
// with one, variants are split by price (and verified reduction).
function priceGroups(themeName, p, history = {}, today = new Date().toISOString().slice(0, 10)) {
  const t = themeOf(themeName);
  if (!t.price || !t.price.show) return [{ variants: p.variants.map((v) => v.id), price: null }];
  const groups = new Map();
  for (const v of p.variants) {
    const r = reduction(history[v.id], today, { maxAgeDays: t.price.maxAgeDays });
    const price = { now: Number(v.price), ref: r ? r.ref : null, pct: r ? r.pct : null };
    const k = JSON.stringify(price);
    if (!groups.has(k)) groups.set(k, { variants: [], price });
    groups.get(k).variants.push(v.id);
  }
  return [...groups.values()];
}

// Changes when the theme file, shared layout, format, photo, title, label/badge or price changes.
function keyFor(themeName, p, fmt = '1x1', price = null) {
  const t = themeOf(themeName);
  return crypto.createHash('sha1').update([themeName, t.version, SHARED_VERSION, fmt, p.image, p.title, JSON.stringify(labelFor(t, p)), JSON.stringify(price)].join('|')).digest('hex').slice(0, 12);
}

async function launch() {
  const puppeteer = require('puppeteer-core');
  const executablePath = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });
}

// jobs: [{ html, out }]. Returns { done, failed: [{ job, error }] }.
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
          await page.setContent(job.html, { waitUntil: 'load', timeout: 45000 });
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

module.exports = { Page, Tokens, frameOptions, priceGroups, themeOf, facts, loadThemes, LOGO, photoUrl, themes, activeTheme, pageHtml, keyFor, launch, renderAll, ROOT };
