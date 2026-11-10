// Renders a contact sheet per theme from data/products.json so a design can be checked
// before it goes live. Writes previews/<theme>.jpg (and the single frames in previews/<theme>/).
// Usage: node src/preview.js [theme ...] [--n 12]     (no theme = all themes)
const fs = require('fs');
const path = require('path');
const { themes, pageHtml, launch, renderAll, ROOT } = require('./frame');

const args = process.argv.slice(2);
const nArg = args.indexOf('--n');
const n = nArg > -1 ? Number(args.splice(nArg, 2)[1]) : 12;
const names = args.length ? args : Object.keys(themes);
for (const t of names) if (!themes[t]) { console.error(`unknown theme "${t}" (have: ${Object.keys(themes).join(', ')})`); process.exit(1); }

(async () => {
  const products = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8')).slice(0, n);
  const browser = await launch();
  for (const theme of names) {
    const dir = path.join(ROOT, 'previews', theme);
    fs.mkdirSync(dir, { recursive: true });
    const jobs = products.map((p) => ({ html: pageHtml(theme, p), out: path.join(dir, `${p.id}.jpg`) }));
    const { failed } = await renderAll(browser, jobs);
    for (const f of failed) console.warn(`  ${theme}: ${path.basename(f.job.out)} ${f.error}`);
    const ok = jobs.filter((j) => fs.existsSync(j.out));

    // Contact sheet: 4 columns of 360px thumbnails.
    const cols = 4, w = 360, rows = Math.ceil(ok.length / cols);
    const cells = ok.map((j) => `<img src="data:image/jpeg;base64,${fs.readFileSync(j.out).toString('base64')}">`).join('');
    const page = await browser.newPage();
    await page.setViewport({ width: cols * w + (cols + 1) * 16, height: rows * w + (rows + 1) * 16 + 60 });
    await page.setContent(`<body style="margin:0;background:#ddd;font:600 24px system-ui;padding:16px">
<div style="height:44px">Theme: ${theme} · ${ok.length} products</div>
<div style="display:grid;grid-template-columns:repeat(${cols},${w}px);gap:16px">${cells.replace(/<img /g, `<img style="width:${w}px;height:${w}px" `)}</div></body>`, { waitUntil: 'load' });
    const sheet = path.join(ROOT, 'previews', `${theme}.jpg`);
    await page.screenshot({ path: sheet, type: 'jpeg', quality: 80, fullPage: true });
    await page.close();
    console.log(`${theme}: ${sheet}`);
  }
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
