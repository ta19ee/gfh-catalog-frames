// Our own price history per Shopify variant, so a reduction can be shown honestly.
// EU rule (Omnibus, art. 6a): the reference price shown next to a reduction must be the lowest
// price applied in the 30 days before the reduction. Shopify's compare-at price is not used.
//
// History format: { [variantId]: { first: "YYYY-MM-DD", runs: [[since, price], ...] } }
// It is published with the site (price-history.json) and read back on the next run.
const DAY = 864e5;
const d = (s) => Date.parse(s + 'T00:00:00Z');

function record(history, variants, today) {
  for (const v of variants) {
    const price = Number(v.price);
    if (!isFinite(price)) continue;
    const h = (history[v.id] = history[v.id] || { first: today, runs: [] });
    const last = h.runs[h.runs.length - 1];
    if (!last || last[1] !== price) h.runs.push([today, price]);
    // Keep 120 days, plus the run that was active at the start of that window.
    const cutoff = d(today) - 120 * DAY;
    while (h.runs.length > 1 && d(h.runs[1][0]) <= cutoff) h.runs.shift();
  }
  return history;
}

// Returns { ref, pct } when the current price is a verified reduction, else null.
function reduction(h, today, { maxAgeDays = 30 } = {}) {
  if (!h || !h.runs.length) return null;
  const [since, now] = h.runs[h.runs.length - 1];
  const start = d(since);
  if ((d(today) - start) / DAY > maxAgeDays) return null; // not a current reduction any more
  if (d(h.first) > start - 30 * DAY) return null; // we have not seen the full 30 days before it
  let low = Infinity;
  for (let i = 0; i < h.runs.length - 1; i++) {
    const runStart = d(h.runs[i][0]);
    const runEnd = d(h.runs[i + 1][0]);
    if (runEnd > start - 30 * DAY && runStart < start) low = Math.min(low, h.runs[i][1]);
  }
  if (!isFinite(low) || low <= now) return null;
  return { ref: low, pct: Math.round(((low - now) / low) * 100) };
}

// True when we have seen this variant for the full 30 days before its current price started.
function covered(h) {
  if (!h || !h.runs.length) return false;
  const start = d(h.runs[h.runs.length - 1][0]);
  return d(h.first) <= start - 30 * DAY;
}

async function load(url, localFile) {
  const fs = require('fs');
  try { return JSON.parse(fs.readFileSync(localFile, 'utf8')); } catch {}
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch {}
  return {};
}

module.exports = { record, reduction, covered, load };
