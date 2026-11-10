// Frame Studio: a local web app for designing catalog frames on real products.
// Usage: npm run studio   → http://localhost:4321
// It only listens on localhost and writes theme files into src/themes/ and the schedule
// into config.json. Nothing goes live until the GitHub workflow runs with the pushed files.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { cleanTitle, isFood } = require('./titles');
const data = require('./studio-data');

const { ROOT, THEME_DIR, CONFIG, readConfig, readThemes } = data;
const PORT = Number(process.env.PORT) || 4321;
const NAME_OK = /^[a-z0-9][a-z0-9-]{0,40}$/;

function saveTheme(name, tokens) {
  if (!NAME_OK.test(name)) throw new Error('Theme name: lowercase letters, digits and dashes only');
  if (typeof tokens !== 'object' || Array.isArray(tokens)) throw new Error('Bad theme');
  require('./themes/_tokens').compile(tokens); // throws on a broken theme
  const file = path.join(THEME_DIR, `${name}.js`);
  // Keep the comment block at the top of an existing theme file.
  const header = fs.existsSync(file) ? (fs.readFileSync(file, 'utf8').match(/^(\s*\/\/.*\n)+/) || [''])[0] : `// ${name} theme, created in Frame Studio ${new Date().toISOString().slice(0, 10)}.\n`;
  fs.writeFileSync(file, `${header}module.exports = ${JSON.stringify(tokens, null, 2)};\n`);
}

function saveSchedule({ theme, schedule }) {
  const themes = readThemes();
  if (!themes[theme]) throw new Error(`Unknown default theme ${theme}`);
  const clean = (schedule || []).map((s) => {
    if (!themes[s.theme]) throw new Error(`Unknown theme ${s.theme}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s.from) || !/^\d{4}-\d{2}-\d{2}$/.test(s.to) || s.from > s.to) throw new Error(`Bad dates for ${s.theme}`);
    return { theme: s.theme, from: s.from, to: s.to };
  });
  const cfg = readConfig();
  cfg.theme = theme;
  cfg.schedule = clean;
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
}

// Exact JPEG through the same headless-Chrome path as the nightly render.
let browserP = null;
async function renderExact(tokens, productId) {
  const frame = require('./frame');
  const Tokens = require('./themes/_tokens');
  const Page = require('./themes/_page');
  const cfg = readConfig();
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'products.json'), 'utf8')).find((x) => x.id === productId);
  if (!p) throw new Error('Unknown product');
  const t = Tokens.compile(tokens);
  const html = Page.build(t, {
    ...Tokens.resolve(t, frame.facts(p)),
    title: cleanTitle(p.title, cfg.maxTitleChars),
    photo: frame.photoUrl(p.image),
    logo: frame.LOGO,
    bandText: t.bandText || cfg.freeDeliveryText,
  });
  browserP = browserP || frame.launch();
  const out = path.join(ROOT, 'previews', 'studio-exact.jpg');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const { failed } = await frame.renderAll(await browserP, [{ html, out }], { concurrency: 1 });
  if (failed.length) throw new Error(failed[0].error);
  return fs.readFileSync(out);
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
// Everything in studio/ is served as is; lib/ and logo.png come from the shared modules and assets.
function staticFile(pathname) {
  if (pathname === '/') pathname = '/index.html';
  if (pathname === '/logo.png') return path.join(ROOT, 'assets', 'gfh-logo.png');
  if (pathname === '/lib/_tokens.js' || pathname === '/lib/_page.js') return path.join(THEME_DIR, pathname.slice(5));
  const dir = path.join(ROOT, 'studio');
  const file = path.resolve(dir, '.' + pathname);
  return file.startsWith(dir + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : null;
}

function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e6) reject(new Error('too large')); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
  });
}

const send = (res, code, data, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(data) : data);
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    // Only accept same-origin writes (blocks other websites from posting to this local server).
    if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== `http://localhost:${PORT}` && req.headers.origin !== `http://127.0.0.1:${PORT}`) return send(res, 403, { error: 'forbidden' });
    const file = req.method === 'GET' && !url.pathname.startsWith('/api/') && staticFile(decodeURIComponent(url.pathname));
    if (file) return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
    if (req.method === 'GET' && url.pathname === '/api/state') {
      return send(res, 200, data.state());
    }
    const m = url.pathname.match(/^\/api\/themes\/([^/]+)$/);
    if (req.method === 'PUT' && m) { saveTheme(m[1], await body(req)); return send(res, 200, { ok: true }); }
    if (req.method === 'PUT' && url.pathname === '/api/schedule') { saveSchedule(await body(req)); return send(res, 200, { ok: true }); }
    if (req.method === 'POST' && url.pathname === '/api/render') {
      const { tokens, productId } = await body(req);
      return send(res, 200, await renderExact(tokens, productId), 'image/jpeg');
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is already in use: Frame Studio may already be running. Open http://localhost:${PORT}, or stop the other one and try again.`);
  else console.error(e);
  process.exit(1);
});
server.listen(PORT, '127.0.0.1', () => {
  const link = `http://localhost:${PORT}`;
  console.log(`Frame Studio running at ${link}  (Ctrl+C to stop)`);
  if (!process.argv.includes('--no-open')) exec(process.platform === 'win32' ? `start "" ${link}` : `open ${link} || xdg-open ${link}`);
});
