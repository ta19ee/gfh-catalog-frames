// One-off: copy what the GitHub Pages build already made onto the Fly volume, so the first
// Fly rebuild only renders what is missing (and the 30-day price history carries over).
// Usage: SEED_URL=https://ta19ee.github.io/gfh-catalog-frames node src/seed.js
// Skips files that already exist; safe to run again.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const BASE = (process.env.SEED_URL || 'https://ta19ee.github.io/gfh-catalog-frames').replace(/\/$/, '');

async function get(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url).catch(() => null);
    if (r && r.ok) return Buffer.from(await r.arrayBuffer());
    if (r && r.status === 404) return null;
    await new Promise((s) => setTimeout(s, 2000 * (i + 1)));
  }
  return null;
}

(async () => {
  const manifestBuf = await get(`${BASE}/manifest.json`);
  if (!manifestBuf) { console.log(`seed: nothing published at ${BASE} yet`); return; }
  const manifest = JSON.parse(manifestBuf);
  fs.mkdirSync(path.join(PUBLIC, 'img'), { recursive: true });
  fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
  const hist = await get(`${BASE}/price-history.json`);
  if (hist && !fs.existsSync(path.join(PUBLIC, 'price-history.json'))) fs.writeFileSync(path.join(PUBLIC, 'price-history.json'), hist);
  const files = [...new Set(Object.values(manifest.products).flatMap((m) => m.groups.flatMap((g) => Object.values(g.files))))];
  const todo = files.filter((f) => !fs.existsSync(path.join(PUBLIC, 'img', f)));
  console.log(`seed: ${files.length} images published, ${todo.length} to copy`);
  let n = 0;
  let missing = 0;
  const worker = async () => {
    while (todo.length) {
      const f = todo.shift();
      const buf = await get(`${BASE}/img/${f}`);
      if (buf) fs.writeFileSync(path.join(PUBLIC, 'img', f), buf);
      else missing++;
      if (++n % 1000 === 0) console.log(`  ${n} copied`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`seed: done (${missing} not found)`);
})().catch((e) => { console.error(e); process.exit(1); });
