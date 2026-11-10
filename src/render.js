// Renders one framed 1080x1080 JPEG per in-stock product into public/img/.
// Images are cached by theme + design + photo + title, so a daily run only re-renders
// new or changed products. Switching theme re-renders everything.
// Usage: node src/render.js [--limit N]      (THEME=winter overrides the schedule)
const fs = require('fs');
const path = require('path');
const { activeTheme, pageHtml, keyFor, launch, renderAll, themes, ROOT } = require('./frame');

const IMG_DIR = path.join(ROOT, 'public', 'img');
const MANIFEST = path.join(ROOT, 'public', 'manifest.json');

(async () => {
  const theme = activeTheme();
  if (!themes[theme]) throw new Error(`unknown theme ${theme}`);
  const limitArg = process.argv.indexOf('--limit');
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  const all = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8'));
  const products = all.filter((p) => p.variants.some((v) => v.available)).slice(0, limit);
  if (!products.length) throw new Error('no in-stock products: refusing to publish an empty feed');

  fs.mkdirSync(IMG_DIR, { recursive: true });
  const manifest = { theme, builtAt: new Date().toISOString(), products: {} };
  const jobs = [];
  for (const p of products) {
    const file = `${p.id}-${keyFor(theme, p)}.jpg`;
    manifest.products[p.id] = { file, variants: p.variants.map((v) => v.id) };
    if (!fs.existsSync(path.join(IMG_DIR, file))) jobs.push({ id: p.id, title: p.title, html: pageHtml(theme, p), out: path.join(IMG_DIR, file) });
  }

  // Drop images that are no longer referenced (old theme, changed photo, sold-out product).
  const keep = new Set(Object.values(manifest.products).map((m) => m.file));
  let removed = 0;
  for (const f of fs.readdirSync(IMG_DIR)) if (!keep.has(f)) { fs.unlinkSync(path.join(IMG_DIR, f)); removed++; }

  console.log(`theme=${theme} products=${products.length} to_render=${jobs.length} removed=${removed}`);
  const browser = await launch();
  const { done, failed } = await renderAll(browser, jobs, { onProgress: (n) => n % 200 === 0 && console.log(`  ${n} processed`) });
  await browser.close();
  for (const { job, error } of failed) {
    delete manifest.products[job.id]; // Meta keeps the plain Shopify photo for these
    console.warn(`skip ${job.id} ${job.title}: ${error}`);
  }
  manifest.failed = failed.map(({ job, error }) => ({ id: job.id, title: job.title, error }));
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest));
  console.log(`rendered=${done} failed=${failed.length} live_images=${Object.keys(manifest.products).length}`);
  if (failed.length / products.length > 0.2) process.exit(1); // too many failures: don't publish
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
