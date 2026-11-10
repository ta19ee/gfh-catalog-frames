// Copies the Studio into public/studio/ (hosted, read-only data + pull-request saves)
// and writes public/studio/state.json with the themes, schedule and in-stock products.
const fs = require('fs');
const path = require('path');
const data = require('./studio-data');

const OUT = path.join(data.ROOT, 'public', 'studio');
fs.mkdirSync(path.join(OUT, 'lib'), { recursive: true });
for (const f of ['index.html', 'studio.js', 'backend.js']) fs.copyFileSync(path.join(data.ROOT, 'studio', f), path.join(OUT, f));
for (const f of ['_tokens.js', '_page.js']) fs.copyFileSync(path.join(data.THEME_DIR, f), path.join(OUT, 'lib', f));
fs.copyFileSync(path.join(data.ROOT, 'assets', 'gfh-logo.png'), path.join(OUT, 'logo.png'));
const state = data.state({ inStockOnly: true });
// The full catalog (public storefront data) so the local Studio can download it: npm run pull
fs.mkdirSync(path.join(data.ROOT, 'public', 'data'), { recursive: true });
fs.copyFileSync(path.join(data.ROOT, 'data', 'products.json'), path.join(data.ROOT, 'public', 'data', 'products.json'));
fs.writeFileSync(path.join(OUT, 'state.json'), JSON.stringify(state));
console.log(`studio: ${Object.keys(state.themes).length} themes, ${state.products.length} products`);
