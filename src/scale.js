// Automatic scale-up for large rebuilds (e.g. a theme switch re-renders ~16k images).
// The small machine (shared-cpu-2x) runs out of CPU credits after ~2,000 images and then crawls
// (~10 h for a full re-render). So when a rebuild has more than SCALE_UP_AT images to render,
// the server resizes its own Fly machine to BIG (performance-4x, 8 GB, CONCURRENCY 8, ~30 min),
// which restarts it; on boot it continues the rebuild and afterwards resizes back to what it was.
// Needs the FLY_API_TOKEN secret (a deploy token for this app); without it nothing changes.
// State lives on the volume, so it survives the restarts:  data/.scale-state.json
const fs = require('fs');
const path = require('path');
const os = require('os');

const API = process.env.FLY_API_HOSTNAME || 'https://api.machines.dev';
const STATE = path.join(__dirname, '..', 'data', '.scale-state.json');
const THRESHOLD = Number(process.env.SCALE_UP_AT) || 2000; // images to render
const BIG = { guest: { cpu_kind: 'performance', cpus: 4, memory_mb: 8192 }, concurrency: '8' };
const MAX_HOURS = 3; // never stay big longer than this, whatever happens
const MAX_STARTS = 3; // rebuild attempts while big (guards against a crash loop)

const enabled = () => Boolean(process.env.FLY_API_TOKEN && process.env.FLY_APP_NAME && process.env.FLY_MACHINE_ID);

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch { return null; }
}
function writeState(s) {
  if (s) fs.writeFileSync(STATE, JSON.stringify(s, null, 2));
  else fs.rmSync(STATE, { force: true });
}

// Is this machine (as it runs now) the big size? Read from the running VM, not the state file.
const isBig = (cpus = Number(process.env.VM_CPUS) || os.cpus().length) => cpus >= BIG.guest.cpus; // VM_CPUS: for local tests

// What to do at boot, from the saved state. Pure, so it can be tested.
//   'rebuild'  scaled up for a rebuild: run it now
//   'down'     big but should not be (finished, too old, too many attempts): resize back
//   'clear'    back on the normal size: forget the state
//   'none'     nothing saved
function bootAction(state, { big, now = Date.now() }) {
  if (!state) return 'none';
  if (!big) return 'clear';
  if (state.phase !== 'up') return (state.downTries || 0) < 2 ? 'down' : 'clear'; // don't loop if resizing back keeps failing
  if (now - Date.parse(state.at) > MAX_HOURS * 36e5) return 'down';
  if ((state.starts || 0) >= MAX_STARTS) return 'down';
  return 'rebuild';
}

const shouldScaleUp = (toRender, { big }) => !big && toRender > THRESHOLD;

async function machine(method, body) {
  const url = `${API}/v1/apps/${process.env.FLY_APP_NAME}/machines/${process.env.FLY_MACHINE_ID}`;
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${process.env.FLY_API_TOKEN}`, 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  if (!r.ok) throw new Error(`Fly API ${method} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// Resize this machine. Fly restarts it, so normally this process ends shortly after.
async function resize(guest, concurrency) {
  const m = await machine('GET');
  const config = { ...m.config, guest: { ...m.config.guest, ...guest }, env: { ...(m.config.env || {}), CONCURRENCY: String(concurrency) } };
  return machine('POST', { config });
}

// Remember the current size, then resize to BIG.
async function scaleUp(reason) {
  const m = await machine('GET');
  const original = { guest: m.config.guest, concurrency: (m.config.env || {}).CONCURRENCY || '3' };
  writeState({ phase: 'up', reason, at: new Date().toISOString(), starts: 0, original });
  try {
    await resize(BIG.guest, BIG.concurrency);
  } catch (e) {
    writeState(null);
    throw e;
  }
}

async function scaleDown() {
  const s = readState() || {};
  const original = s.original || { guest: { cpu_kind: 'shared', cpus: 2, memory_mb: 2048 }, concurrency: '3' };
  writeState({ ...s, phase: 'down', downAt: new Date().toISOString(), downTries: (s.downTries || 0) + 1 });
  await resize(original.guest, original.concurrency);
}

module.exports = { enabled, readState, writeState, isBig, bootAction, shouldScaleUp, scaleUp, scaleDown, THRESHOLD, BIG, MAX_HOURS, MAX_STARTS };
