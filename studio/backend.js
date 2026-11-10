// Where the Studio loads from and saves to.
// - local  (npm run studio): the Node server on localhost writes files directly.
// - hosted (GitHub Pages /studio/): read-only data from state.json; saving opens a GitHub
//   pull request with the change, so nothing reaches the catalog until someone merges it.
(() => {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
  const TOKEN_KEY = 'gfh-studio-github-token';
  const store = {
    get: () => { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } },
    set: (v) => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch {} },
  };

  const header = (name, existing) => (existing && (existing.match(/^(\s*\/\/.*\n)+/) || [''])[0]) || `// ${name} theme, created in Frame Studio ${new Date().toISOString().slice(0, 10)}.\n`;
  const themeFile = (name, tokens, existing) => `${header(name, existing)}module.exports = ${JSON.stringify(tokens, null, 2)};\n`;
  const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
  const unb64 = (s) => decodeURIComponent(escape(atob(s.replace(/\n/g, ''))));

  const local = {
    mode: 'local',
    canRender: true,
    async load() { return (await fetch('/api/state')).json(); },
    async saveTheme(name, tokens) {
      const r = await fetch(`/api/themes/${name}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tokens) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      return `Saved src/themes/${name}.js`;
    },
    async saveSchedule(body) {
      const r = await fetch('/api/schedule', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      return 'Saved schedule to config.json';
    },
    async saveSegments(body) {
      const r = await fetch('/api/segments', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      return 'Saved segments to config.json';
    },
    async pull() {
      const r = await fetch('/api/pull', { method: 'POST' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error);
      return j.message;
    },
    async render(tokens, productId, fmt, price) {
      const r = await fetch('/api/render', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tokens, productId, fmt, price }) });
      if (!r.ok) throw new Error((await r.json()).error);
      return r.blob();
    },
  };

  let repo = '';
  async function gh(method, path, body) {
    let token = store.get();
    if (!token) {
      token = (prompt('Saving opens a GitHub pull request.\n\nPaste a GitHub fine-grained token for ' + repo + ' with "Contents" and "Pull requests" read & write. It is kept only in this browser.') || '').trim();
      if (!token) throw new Error('No GitHub token: nothing saved');
      store.set(token);
    }
    const r = await fetch(`https://api.github.com/repos/${repo}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 401) store.set('');
    if (r.status === 404 && method === 'GET') return null;
    const j = r.status === 204 ? {} : await r.json();
    if (!r.ok) throw new Error(`GitHub ${r.status}: ${j.message || 'error'}`);
    return j;
  }

  // One branch + one commit + one pull request per save.
  async function pullRequest(filePath, makeContent, title, body) {
    const base = await gh('GET', '/git/ref/heads/main');
    const branch = `studio/${filePath.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${Date.now()}`;
    await gh('POST', '/git/refs', { ref: `refs/heads/${branch}`, sha: base.object.sha });
    const existing = await gh('GET', `/contents/${filePath}?ref=main`);
    const content = makeContent(existing ? unb64(existing.content) : '');
    await gh('PUT', `/contents/${filePath}`, { message: title, content: b64(content), branch, ...(existing ? { sha: existing.sha } : {}) });
    const pr = await gh('POST', '/pulls', { title, head: branch, base: 'main', body });
    return pr.html_url;
  }

  const hosted = {
    mode: 'hosted',
    canRender: false,
    async load() {
      const s = await (await fetch('state.json', { cache: 'no-store' })).json();
      repo = s.config.repo;
      return s;
    },
    async saveTheme(name, tokens) {
      const url = await pullRequest(`src/themes/${name}.js`, (old) => themeFile(name, tokens, old), `Frame Studio: update ${name} theme`,
        `Theme \`${name}\` edited in the hosted Frame Studio.\n\nMerging this re-renders the catalog images on the next run if \`${name}\` is the live theme.`);
      window.open(url, '_blank', 'noopener');
      return `Pull request opened: ${url}`;
    },
    async saveSchedule(body) {
      const url = await pullRequest('config.json', (old) => {
        const cfg = JSON.parse(old);
        cfg.theme = body.theme;
        cfg.schedule = body.schedule;
        return JSON.stringify(cfg, null, 2) + '\n';
      }, 'Frame Studio: update theme schedule', 'Schedule edited in the hosted Frame Studio.');
      window.open(url, '_blank', 'noopener');
      return `Pull request opened: ${url}`;
    },
    async saveSegments(body) {
      const url = await pullRequest('config.json', (old) => {
        const cfg = JSON.parse(old);
        cfg.segments = body.segments;
        return JSON.stringify(cfg, null, 2) + '\n';
      }, 'Frame Studio: update design segments', 'Segments edited in the hosted Frame Studio.');
      window.open(url, '_blank', 'noopener');
      return `Pull request opened: ${url}`;
    },
    async pull() { throw new Error('The hosted Studio always shows the full catalog of the last build.'); },
    async render() { throw new Error('Exact render is only in the local Studio (npm run studio).'); },
    forgetToken() { store.set(''); },
  };

  window.StudioBackend = isLocal ? local : hosted;
  window.StudioBackend.themeFile = themeFile;
})();
