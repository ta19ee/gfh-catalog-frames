const test = require('node:test');
const assert = require('node:assert');
const Tokens = require('../src/themes/_tokens');

test('segments pick a design per category, first match wins', () => {
  const segs = [
    { field: 'type', value: 'beauty', theme: 'neutral', during: '' },
    { field: 'collection', value: 'snacks', theme: 'christmas', during: 'winter' },
  ];
  assert.equal(Tokens.segmentTheme(segs, 'autumn', { type: 'Health & Beauty' }), 'neutral');
  assert.equal(Tokens.segmentTheme(segs, 'autumn', { collections: ['indian-snacks'] }), 'autumn'); // only during winter
  assert.equal(Tokens.segmentTheme(segs, 'winter', { collections: ['indian-snacks'] }), 'christmas');
  assert.equal(Tokens.segmentTheme(segs, 'winter', { type: 'Rice' }), 'winter');
  assert.equal(Tokens.segmentTheme([{ field: 'category', value: 'snack foods', theme: 'neutral' }], 'autumn', { category: 'Food > Snack Foods > Chips' }), 'neutral');
});

test('price view: history by default, Shopify compare-at only when chosen and not contradicted', () => {
  const facts = { now: 1.59, compareAt: 1.99, verified: null, covered: false };
  assert.deepEqual(Tokens.priceView({ reference: 'history' }, facts), { now: 1.59, ref: null, pct: null });
  assert.deepEqual(Tokens.priceView({ reference: 'shopify' }, facts), { now: 1.59, ref: 1.99, pct: 20 });
  // our history covers 30 days and shows no reduction: the compare-at is dropped
  assert.deepEqual(Tokens.priceView({ reference: 'shopify' }, { ...facts, covered: true }), { now: 1.59, ref: null, pct: null });
  // a verified reduction always wins
  assert.deepEqual(Tokens.priceView({ reference: 'shopify' }, { ...facts, verified: { ref: 1.79, pct: 11 } }), { now: 1.59, ref: 1.79, pct: 11 });
  // below the minimum %: nothing
  assert.deepEqual(Tokens.priceView({ reference: 'shopify', minPct: 25 }, facts), { now: 1.59, ref: null, pct: null });
});

test('layers fill product fields and hide price layers without a real reduction', () => {
  const t = Tokens.compile({ layers: [
    { kind: 'text', text: '{vendor}', x: 1, y: 1, w: 10, h: 5 },
    { kind: 'text', text: '-{pct}%', x: 1, y: 1, w: 10, h: 5 },
    { kind: 'icon', icon: 'leaf', x: 1, y: 1, w: 5, h: 5, when: { field: 'tag', value: 'vegan' }, formats: { '9x16': { y: 40 } } },
  ] });
  const p = { vendor: 'TRS', tags: ['vegan'] };
  const none = Tokens.layersFor(t, p, { now: 2, ref: null, pct: null }, '9x16');
  assert.deepEqual(none.map((l) => l.text || l.icon), ['TRS', 'leaf']);
  assert.equal(none[1].y, 40); // per-format position
  const sale = Tokens.layersFor(t, { vendor: 'TRS' }, { now: 2, ref: 2.5, pct: 20 });
  assert.deepEqual(sale.map((l) => l.text), ['TRS', '-20%']);
  assert.deepEqual(Tokens.lint({ layers: [{ text: '-{pct}%' }] }), []); // guarded: only with a real reduction
  assert.ok(Tokens.lint({ layers: [{ text: '50% off' }] }).length);
});
