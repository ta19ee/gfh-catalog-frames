// Writes the Meta supplementary feeds (rows matched on id = Shopify variant ID):
//   feed.csv        id,image_link                     (square image only; the safe default)
//   feed-multi.csv  id,image_link + tagged 4:5 / 9:16 images for placement-aware catalog ads
//                   (Meta image tags ASPECT_RATIO_4_5_PREFERRED / ASPECT_RATIO_9_16_PREFERRED).
//                   Test it on a small product set in Commerce Manager before switching to it.
const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { FORMATS } = require('./themes/_page');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'manifest.json'), 'utf8'));
const url = (file) => `${config.siteUrl}/img/${file}`;
const extra = (manifest.formats || []).filter((f) => FORMATS[f] && FORMATS[f].metaTag);

const simple = ['id,image_link'];
const multiHead = ['id', 'image_link'];
extra.forEach((f, i) => multiHead.push(`image[${i}].url`, `image[${i}].tag[0]`));
const multi = [multiHead.join(',')];
let products = 0;
for (const { groups } of Object.values(manifest.products)) {
  products++;
  for (const g of groups) {
    for (const v of g.variants) {
      simple.push(`${v},${url(g.files['1x1'])}`);
      multi.push([v, url(g.files['1x1']), ...extra.flatMap((f) => [url(g.files[f]), FORMATS[f].metaTag])].join(','));
    }
  }
}
fs.writeFileSync(path.join(ROOT, 'public', 'feed.csv'), simple.join('\n') + '\n');
fs.writeFileSync(path.join(ROOT, 'public', 'feed-multi.csv'), multi.join('\n') + '\n');

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sample = Object.values(manifest.products).slice(0, 24).map((m) => `<img src="img/${m.groups[0].files['1x1']}" width="180" height="180" loading="lazy">`).join('');
const formatsRow = Object.values(manifest.products).slice(0, 1).flatMap((m) => Object.entries(m.groups[0].files).map(([f, file]) => `<figure style="margin:0"><img src="img/${file}" height="240" loading="lazy"><figcaption>${FORMATS[f].label}</figcaption></figure>`)).join('');
fs.writeFileSync(
  path.join(ROOT, 'public', 'index.html'),
  `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>GFH catalog frames</title>
<body style="font:16px system-ui;margin:24px"><p>Theme: <b>${esc(manifest.theme)}</b> · formats ${esc((manifest.formats || []).join(', '))} · built ${esc(manifest.builtAt || '')} · ${products} products · ${simple.length - 1} feed rows ·
<a href="feed.csv">feed.csv</a> · <a href="feed-multi.csv">feed-multi.csv</a> · <a href="studio/">Frame Studio</a></p>
<div style="display:flex;gap:12px;align-items:end;margin-bottom:16px">${formatsRow}</div>
<div style="display:flex;flex-wrap:wrap;gap:8px">${sample}</div>
${(manifest.failed || []).length ? `<h3>Not framed (Meta keeps the normal Shopify photo)</h3><ul>${manifest.failed.map((x) => `<li>${esc(x.id)} ${esc(x.title)}: ${esc(x.error)}</li>`).join('')}</ul>` : ''}`,
);

// GitHub Pages sites must stay under 1 GB.
const bytes = fs.readdirSync(path.join(ROOT, 'public', 'img')).reduce((n, f) => n + fs.statSync(path.join(ROOT, 'public', 'img', f)).size, 0);
console.log(`feed rows=${simple.length - 1} products=${products} images=${(bytes / 1e6).toFixed(1)} MB`);
if (bytes > 950e6) {
  console.error('Images exceed 950 MB: GitHub Pages allows 1 GB. Remove a format from config.formats or lower jpegQuality.');
  process.exit(1);
}
