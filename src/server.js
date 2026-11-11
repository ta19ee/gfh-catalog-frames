// GFH catalog frames on Fly.io (https://gfh-catalog-frames.fly.dev). One process that:
//  - serves the public files Meta reads: feeds, framed images, status page (no login);
//  - serves Frame Studio at /studio/ behind its own login (STUDIO_PASSWORD), independent of the GFH hub;
//  - rebuilds the catalog images every 6 hours (fetch → render → feed), or on "Rebuild now";
//  - optionally backs up Studio changes to GitHub (GITHUB_TOKEN), so the repo stays a copy.
// Everything that changes lives on the volume (DATA_DIR, default /data); see docker-entrypoint.sh.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const studio = require('./studio');
const data = require('./studio-data');

const { ROOT } = data;
const PORT = Number(process.env.PORT) || 8080;
const PUBLIC = path.join(ROOT, 'public');
const PUBLIC_URL = (process.env.PUBLIC_URL || 'https://gfh-catalog-frames.fly.dev').replace(/\/$/, '');
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const PASSWORD = process.env.STUDIO_PASSWORD || '';
const BUILD_HOURS = String(process.env.BUILD_HOURS || '0,6,12,18').split(',').map(Number); // UTC, at :30
const SESSION_DAYS = 14;

const { send, body, TYPES } = studio;
const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---- login --------------------------------------------------------------------------------
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
function sessionCookie() {
  const exp = String(Date.now() + SESSION_DAYS * 864e5);
  return `gfh_frames=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_DAYS * 86400}`;
}
function loggedIn(req) {
  const m = (req.headers.cookie || '').match(/(?:^|;\s*)gfh_frames=(\d+)\.([a-f0-9]{64})/);
  if (!m || Number(m[1]) < Date.now()) return false;
  const a = Buffer.from(sign(m[1]));
  const b = Buffer.from(m[2]);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function passwordOk(p) {
  if (!PASSWORD) return false;
  const a = crypto.createHash('sha256').update(String(p)).digest();
  const b = crypto.createHash('sha256').update(PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
// At most 10 wrong passwords per IP per 15 minutes.
const attempts = new Map();
function tooMany(ip) {
  const now = Date.now();
  const a = (attempts.get(ip) || []).filter((t) => now - t < 15 * 6e4);
  attempts.set(ip, a);
  return a.length >= 10;
}

const page = (title, inner) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title><link rel="icon" href="/studio/logo.png">
<body style="font:16px system-ui;background:#f5f6fa;color:#1d1d1f;display:grid;place-items:center;min-height:100vh;margin:0">
<main style="background:#fff;padding:32px;border-radius:14px;box-shadow:0 2px 12px #0001;width:min(360px,90vw)">
<img src="/studio/logo.png" alt="" style="height:40px"><h2 style="margin:12px 0 4px">Frame Studio</h2>${inner}</main>`;
const loginPage = (msg = '') => page('Frame Studio login', `<p style="color:#666;margin-top:0">GFH catalog frames</p>
${msg ? `<p style="color:#b00020">${msg}</p>` : ''}
${PASSWORD ? `<form method="post" action="/login"><input type="password" name="password" placeholder="Password" autofocus required style="width:100%;box-sizing:border-box;padding:10px;font:inherit;border:1px solid #ccc;border-radius:8px">
<button style="margin-top:12px;width:100%;padding:10px;font:inherit;font-weight:600;border:0;border-radius:8px;background:#E30613;color:#fff">Log in</button></form>`
    : '<p>Login is not set up yet. Set it with:<br><code>fly secrets set STUDIO_PASSWORD=… -a gfh-catalog-frames</code></p>'}`);

function formBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 1e4) reject(new Error('too large')); });
    req.on('end', () => resolve(Object.fromEntries(new URLSearchParams(s))));
  });
}

// ---- public files ---------------------------------------------------------------------------
// Images have content hashes in their names, so they can be cached for a long time.
function servePublic(req, res, pathname) {
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(PUBLIC, '.' + pathname);
  if (!file.startsWith(PUBLIC + path.sep) || file.startsWith(path.join(PUBLIC, 'studio'))) return false;
  let st;
  try { st = fs.statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  const ext = path.extname(file);
  const type = { ...TYPES, '.csv': 'text/csv; charset=utf-8', '.json': 'application/json' }[ext] || 'application/octet-stream';
  const cache = pathname.startsWith('/img/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': st.size, 'Cache-Control': cache, 'Last-Modified': st.mtime.toUTCString() });
  if (req.method === 'HEAD') return res.end(), true;
  fs.createReadStream(file).pipe(res);
  return true;
}

// ---- rebuild (fetch → render → feed) ---------------------------------------------------------
const build = { running: false, step: '', startedAt: null, finishedAt: null, ok: null, reason: '', lines: [] };
const STEPS = [['Fetching products', 'src/fetch.js'], ['Rendering images', 'src/render.js'], ['Writing feeds', 'src/feed.js']];
function runStep(script) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd: ROOT, env: process.env });
    const keep = (chunk) => String(chunk).split('\n').filter(Boolean).forEach((l) => {
      build.lines.push(l);
      if (build.lines.length > 200) build.lines.shift();
      console.log(`[${path.basename(script)}] ${l}`);
    });
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('close', (code) => resolve(code === 0));
  });
}
async function rebuild(reason) {
  if (build.running) return false;
  Object.assign(build, { running: true, startedAt: new Date().toISOString(), finishedAt: null, ok: null, reason, lines: [] });
  log(`rebuild started (${reason})`);
  let ok = true;
  const steps = [...STEPS];
  // Fresh volume: first copy what the GitHub Pages build already rendered.
  if (process.env.SEED_URL && !fs.existsSync(path.join(PUBLIC, 'manifest.json'))) steps.unshift(['Copying images from GitHub Pages', 'src/seed.js']);
  for (const [label, script] of steps) {
    build.step = label;
    if (!(await runStep(script))) { ok = false; build.lines.push(`${label} failed: the previous feed stays live`); break; }
  }
  Object.assign(build, { running: false, step: '', finishedAt: new Date().toISOString(), ok });
  log(`rebuild ${ok ? 'finished' : 'failed'}`);
  return true;
}
// Every BUILD_HOURS (UTC) at :30.
let lastSlot = '';
setInterval(() => {
  const d = new Date();
  const slot = d.toISOString().slice(0, 13);
  // The very first build (fresh volume, images still to copy from Pages) starts by hand.
  const waitingForSeed = process.env.SEED_URL && !fs.existsSync(path.join(PUBLIC, 'manifest.json'));
  if (!waitingForSeed && d.getUTCMinutes() >= 30 && BUILD_HOURS.includes(d.getUTCHours()) && slot !== lastSlot) {
    lastSlot = slot;
    rebuild('schedule');
  }
}, 60e3);
// From the server shell: fly ssh console -a gfh-catalog-frames -C "pkill -USR2 -f '^node src/server.js'"
process.on('SIGUSR2', () => rebuild('shell'));

// ---- GitHub backup of Studio changes (optional) ----------------------------------------------
// Pushes changed config.json, theme files and layer images to the repo, so it stays a copy.
const BACKUP_STATE = path.join(PUBLIC, '..', 'data', '.github-backup.json');
function backupFiles() {
  const out = { 'config.json': data.CONFIG };
  for (const f of fs.readdirSync(data.THEMES)) if (f.endsWith('.js') && !f.startsWith('_')) out[`src/themes/${f}`] = path.join(data.THEMES, f);
  const layers = path.join(ROOT, 'assets', 'layers');
  if (fs.existsSync(layers)) for (const f of fs.readdirSync(layers)) out[`assets/layers/${f}`] = path.join(layers, f);
  return out;
}
let backupBusy = Promise.resolve();
function backup(message) {
  const token = process.env.GITHUB_TOKEN;
  const repo = data.readConfig().repo;
  if (!token || !repo) return;
  backupBusy = backupBusy.then(async () => {
    let seen = {};
    try { seen = JSON.parse(fs.readFileSync(BACKUP_STATE, 'utf8')); } catch {}
    const gh = async (method, p, b) => {
      const r = await fetch(`https://api.github.com/repos/${repo}${p}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'gfh-catalog-frames' }, body: b && JSON.stringify(b) });
      if (r.status === 404 && method === 'GET') return null;
      if (!r.ok) throw new Error(`GitHub ${r.status} ${p}`);
      return r.json();
    };
    for (const [rel, file] of Object.entries(backupFiles())) {
      const buf = fs.readFileSync(file);
      const hash = crypto.createHash('sha1').update(buf).digest('hex');
      if (seen[rel] === hash) continue;
      const cur = await gh('GET', `/contents/${rel}?ref=main`);
      const same = cur && Buffer.from(cur.content, 'base64').equals(buf);
      if (!same) await gh('PUT', `/contents/${rel}`, { message: `Frame Studio: ${message}`, content: buf.toString('base64'), branch: 'main', ...(cur ? { sha: cur.sha } : {}) });
      seen[rel] = hash;
      fs.writeFileSync(BACKUP_STATE, JSON.stringify(seen));
    }
  }).catch((e) => log('GitHub backup failed:', e.message));
}

// ---- server -----------------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, PUBLIC_URL);
  const p = decodeURIComponent(url.pathname);
  const ip = String(req.headers['fly-client-ip'] || req.socket.remoteAddress);
  try {
    if (p === '/healthz') return send(res, 200, { ok: true });
    if (p === '/login' && req.method === 'POST') {
      if (tooMany(ip)) return send(res, 429, loginPage('Too many attempts. Try again in 15 minutes.'), 'text/html; charset=utf-8');
      const { password } = await formBody(req);
      if (!passwordOk(password)) {
        attempts.get(ip).push(Date.now());
        return send(res, 401, loginPage('Wrong password.'), 'text/html; charset=utf-8');
      }
      res.writeHead(303, { 'Set-Cookie': sessionCookie(), Location: '/studio/' });
      return res.end();
    }
    if (p === '/logout') {
      res.writeHead(303, { 'Set-Cookie': 'gfh_frames=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0', Location: '/login' });
      return res.end();
    }
    if (p === '/login') return send(res, 200, loginPage(), 'text/html; charset=utf-8');
    if (p === '/studio/logo.png') return send(res, 200, fs.readFileSync(path.join(ROOT, 'assets', 'gfh-logo.png')), 'image/png');

    // Studio + API: login required.
    if (p === '/studio' || p.startsWith('/studio/') || p.startsWith('/api/')) {
      if (!loggedIn(req)) {
        if (p.startsWith('/api/')) return send(res, 401, { error: 'Logged out: reload the page and log in again' });
        res.writeHead(303, { Location: '/login' });
        return res.end();
      }
      if (p === '/studio') { res.writeHead(301, { Location: '/studio/' }); return res.end(); }
      if (req.method !== 'GET' && req.headers.origin && req.headers.origin !== PUBLIC_URL) return send(res, 403, { error: 'forbidden' });
      if (p.startsWith('/studio/')) {
        const file = req.method === 'GET' && studio.staticFile(p.slice('/studio'.length));
        if (file) return send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
        return send(res, 404, { error: 'not found' });
      }
      if (p === '/api/build' && req.method === 'GET') return send(res, 200, build);
      if (p === '/api/build' && req.method === 'POST') {
        const started = await Promise.race([rebuild('Studio'), new Promise((r) => setTimeout(() => r(true), 50))]);
        return send(res, started ? 200 : 409, started ? { ok: true } : { error: 'A rebuild is already running' });
      }
      if (p === '/api/pull' && req.method === 'POST') {
        // Online, "Load full catalog" means: fetch the latest products from Shopify now.
        if (build.running) return send(res, 409, { error: 'A rebuild is running; it fetches the catalog too' });
        const ok = await runStep('src/fetch.js');
        return ok ? send(res, 200, { ok: true, message: build.lines[build.lines.length - 1] || 'Catalog updated' }) : send(res, 500, { error: build.lines[build.lines.length - 1] || 'Fetch failed' });
      }
      const handled = await studio.api(req, res, url);
      if (handled === false) return send(res, 404, { error: 'not found' });
      if (req.method === 'PUT' || p === '/api/upload') backup(`${req.method} ${p}`);
      return;
    }

    // Everything else is public (feeds, images, status page).
    if ((req.method === 'GET' || req.method === 'HEAD') && servePublic(req, res, p)) return;
    if (p === '/' || p === '/index.html') return send(res, 200, page('GFH catalog frames', '<p>The first build has not finished yet.</p><p><a href="/studio/">Open Frame Studio</a></p>'), 'text/html; charset=utf-8');
    send(res, 404, { error: 'not found' });
  } catch (e) {
    send(res, 400, { error: e.message });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  log(`catalog frames on :${PORT} (${PUBLIC_URL}); rebuilds at ${BUILD_HOURS.map((h) => `${h}:30`).join(', ')} UTC${PASSWORD ? '' : '; STUDIO_PASSWORD not set: Studio locked'}`);
  // No catalog yet (fresh volume): fetch one so the Studio has products.
  if (!fs.existsSync(path.join(ROOT, 'data', 'products.json'))) runStep('src/fetch.js');
});
