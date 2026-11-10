// Writes public/feed.csv: a Meta supplementary feed that swaps image_link for every
// variant of every framed product. Meta matches rows on id = Shopify variant ID.
const fs = require('fs');
const path = require('path');
const config = require('../config.json');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.json'), 'utf8'));

const rows = ['id,image_link'];
for (const { file, variants } of Object.values(manifest.products)) {
  for (const v of variants) rows.push(`${v},${config.siteUrl}/img/${file}`);
}
fs.writeFileSync(path.join(ROOT, 'public', 'feed.csv'), rows.join('\n') + '\n');

const sample = Object.values(manifest.products).slice(0, 24).map((m) => `<img src="img/${m.file}" width="180" height="180" loading="lazy">`).join('');
fs.writeFileSync(
  path.join(ROOT, 'public', 'index.html'),
  `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>GFH catalog frames</title>
<body style="font:16px system-ui;margin:24px"><p>Theme: <b>${manifest.theme}</b> · built ${manifest.builtAt || ''} · ${Object.keys(manifest.products).length} products · ${rows.length - 1} feed rows · <a href="feed.csv">feed.csv</a> · <a href="studio/">Frame Studio</a></p>
<div style="display:flex;flex-wrap:wrap;gap:8px">${sample}</div>
${(manifest.failed || []).length ? `<h3>Not framed (Meta keeps the normal Shopify photo)</h3><ul>${manifest.failed.map((x) => `<li>${x.id} ${String(x.title).replace(/</g, '&lt;')}: ${x.error}</li>`).join('')}</ul>` : ''}`,
);
console.log(`feed rows=${rows.length - 1}`);
