// Data the Studio needs (local server and the hosted copy on GitHub Pages).
const fs = require('fs');
const path = require('path');
const { cleanTitle, isFood } = require('./titles');
const { reduction } = require('./prices');

const ROOT = path.join(__dirname, '..');
const THEME_DIR = path.join(__dirname, 'themes');
const CONFIG = path.join(ROOT, 'config.json');

const readConfig = () => JSON.parse(fs.readFileSync(CONFIG, 'utf8'));

function readThemes() {
  const out = {};
  for (const f of fs.readdirSync(THEME_DIR)) {
    if (!f.endsWith('.js') || f.startsWith('_')) continue;
    const file = path.join(THEME_DIR, f);
    delete require.cache[require.resolve(file)];
    out[f.slice(0, -3)] = require(file);
  }
  return out;
}

function readProducts({ inStockOnly = false, max = Infinity } = {}) {
  const file = path.join(ROOT, 'data', 'products.json');
  if (!fs.existsSync(file)) return [];
  const cfg = readConfig();
  let history = {};
  try { history = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'price-history.json'), 'utf8')); } catch {}
  const today = new Date().toISOString().slice(0, 10);
  return JSON.parse(fs.readFileSync(file, 'utf8'))
    .map((p) => ({
      id: p.id,
      title: cleanTitle(p.title, cfg.maxTitleChars),
      rawTitle: p.title,
      type: p.type || '',
      vendor: p.vendor || '',
      tags: p.tags || [],
      createdAt: p.createdAt || null,
      food: isFood(p.type),
      photo: p.image + (p.image.includes('?') ? '&' : '?') + 'width=900',
      inStock: p.variants.some((v) => v.available),
      // Price of the first in-stock variant, with a reduction only if our price history proves it.
      price: (() => {
        const v = p.variants.find((x) => x.available) || p.variants[0];
        if (!v) return null;
        const r = reduction(history[v.id], today);
        return { now: Number(v.price), ref: r ? r.ref : null, pct: r ? r.pct : null };
      })(),
    }))
    .filter((p) => !inStockOnly || p.inStock)
    .slice(0, max);
}

function activeTheme(cfg, today = new Date().toISOString().slice(0, 10)) {
  for (const s of cfg.schedule || []) if (today >= s.from && today <= s.to) return s.theme;
  return cfg.theme;
}

function state(opts) {
  const cfg = readConfig();
  return {
    themes: readThemes(),
    products: readProducts(opts),
    config: { theme: cfg.theme, schedule: cfg.schedule || [], freeDeliveryText: cfg.freeDeliveryText, active: activeTheme(cfg), repo: cfg.repo || '' },
  };
}

module.exports = { ROOT, THEME_DIR, CONFIG, readConfig, readThemes, readProducts, activeTheme, state };
