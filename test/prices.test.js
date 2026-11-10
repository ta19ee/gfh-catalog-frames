const test = require('node:test');
const assert = require('node:assert');
const { record, reduction } = require('../src/prices');

const day = (n) => new Date(Date.parse('2026-09-01') + n * 864e5).toISOString().slice(0, 10);

test('no reduction without 30 days of history', () => {
  const h = {};
  record(h, [{ id: 'v', price: '4.99' }], day(0));
  record(h, [{ id: 'v', price: '3.49' }], day(10));
  assert.equal(reduction(h.v, day(10)), null);
});

test('reduction uses the lowest price of the 30 days before it', () => {
  const h = {};
  record(h, [{ id: 'v', price: '4.99' }], day(0));
  record(h, [{ id: 'v', price: '4.49' }], day(20));
  record(h, [{ id: 'v', price: '4.99' }], day(25));
  record(h, [{ id: 'v', price: '3.49' }], day(40));
  assert.deepEqual(reduction(h.v, day(41)), { ref: 4.49, pct: 22 });
});

test('price increase or old reduction shows nothing', () => {
  const h = {};
  record(h, [{ id: 'v', price: '3.49' }], day(0));
  record(h, [{ id: 'v', price: '4.99' }], day(40));
  assert.equal(reduction(h.v, day(41)), null);
  const g = {};
  record(g, [{ id: 'v', price: '4.99' }], day(0));
  record(g, [{ id: 'v', price: '3.49' }], day(40));
  assert.equal(reduction(g.v, day(80)), null); // reduced 40 days ago: now just the price
});
