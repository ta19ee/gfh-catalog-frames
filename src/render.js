// Renders the framed JPEGs for every in-stock product into public/img/:
// one per format in config.formats (1x1, 4x5, 9x16, 2x3) and per price group (only when the
// theme shows prices and a product's variants differ in price).
// Images are cached by theme + design + format + photo + title + label + price, so a run only
// re-renders new or changed products. Switching theme re-renders everything.
// Also updates public/price-history.json (our own 30-day price history, see prices.js).
// Usage: node src/render.js [--limit N]      (THEME=winter overrides the schedule)
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { activeTheme, pageHtml, keyFor, priceGroups, launch, renderAll, themes, Page, ROOT } = require('./frame');
const prices = require('./prices');

const IMG_DIR = path.join(ROOT, 'public', 'img');
const MANIFEST = path.join(ROOT, 'public', 'manifest.json');
const HISTORY = path.join(ROOT, 'public', 'price-history.json');

(async () => {
  const theme = activeTheme();
  if (!themes[theme]) throw new Error(`unknown theme ${theme}`);
  const formats = (config.formats || ['1x1']).filter((f) => Page.FORMATS[f]);
  if (!formats.includes('1x1')) formats.unshift('1x1'); // image_link is always square
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;
  const today = new Date().toISOString().slice(0, 10);

  const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
  const history = prices.record(await prices.load(`${config.siteUrl}/price-history.json`, HISTORY), all.flatMap((p) => p.variants), today);
  const products = all.filter((p) => p.variants.some((v) => v.available)).slice(0, limit);
  if (!products.length) throw new Error('no in-stock products: refusing to publish an empty feed');

  fs.mkdirSync(IMG_DIR, { recursive: true });
  const manifest = { theme, formats, builtAt: new Date().toISOString(), products: {} };
  const jobs = [];
  for (const p of products) {
    const groups = priceGroups(theme, p, history, today).map((g) => {
      const files = {};
      for (const fmt of formats) {
        const file = `${p.id}-${fmt}-${keyFor(theme, p, fmt, g.price)}.jpg`;
        files[fmt] = file;
        if (!fs.existsSync(path.join(IMG_DIR, file))) jobs.push({ id: p.id, title: p.title, fmt, html: pageHtml(theme, p, fmt, g.price), out: path.join(IMG_DIR, file) });
      }
      return { variants: g.variants, price: g.price, files };
    });
    manifest.products[p.id] = { groups };
  }

  // Drop images that are no longer referenced (old theme, changed photo or price, sold-out product).
  const keep = new Set(Object.values(manifest.products).flatMap((m) => m.groups.flatMap((g) => Object.values(g.files))));
  let removed = 0;
  for (const f of fs.readdirSync(IMG_DIR)) if (!keep.has(f)) { fs.unlinkSync(path.join(IMG_DIR, f)); removed++; }

  console.log(`theme=${theme} formats=${formats.join(',')} products=${products.length} to_render=${jobs.length} removed=${removed}`);
  const browser = await launch();
  const { done, failed } = await renderAll(browser, jobs, { onProgress: (n) => n % 200 === 0 && console.log(`  ${n} processed`) });
  await browser.close();

  // A product is published only when all its images rendered; otherwise Meta keeps the Shopify photo.
  const failedIds = new Set(failed.map((f) => f.job.id));
  for (const id of failedIds) delete manifest.products[id];
  for (const { job, error } of failed) console.warn(`skip ${job.id} ${job.fmt} ${job.title}: ${error}`);
  manifest.failed = [...failedIds].map((id) => {
    const f = failed.find((x) => x.job.id === id);
    return { id, title: f.job.title, error: f.error };
  });
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest));
  fs.writeFileSync(HISTORY, JSON.stringify(history));
  console.log(`rendered=${done} failed=${failed.length} live_products=${Object.keys(manifest.products).length}`);
  if (failedIds.size / products.length > 0.2) process.exit(1); // too many failures: don't publish
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
