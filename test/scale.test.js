const test = require('node:test');
const assert = require('node:assert');
const { bootAction, shouldScaleUp, isBig, THRESHOLD, MAX_HOURS, MAX_STARTS } = require('../src/scale');

const now = Date.parse('2026-11-19T19:00:00Z');
const up = (extra = {}) => ({ phase: 'up', reason: 'Studio', at: '2026-11-19T18:50:00Z', starts: 0, ...extra });

test('scale up only for large rebuilds on the small machine', () => {
  assert.equal(shouldScaleUp(THRESHOLD + 1, { big: false }), true);
  assert.equal(shouldScaleUp(THRESHOLD, { big: false }), false);
  assert.equal(shouldScaleUp(20, { big: false }), false); // the normal 6-hourly rebuild
  assert.equal(shouldScaleUp(16000, { big: true }), false); // already big
});

test('machine size from the CPU count', () => {
  assert.equal(isBig(2), false);
  assert.equal(isBig(4), true);
});

test('boot: continue the rebuild after scaling up', () => {
  assert.equal(bootAction(up(), { big: true, now }), 'rebuild');
});

test('boot: back to normal size when done, too old or crash-looping', () => {
  assert.equal(bootAction({ ...up(), phase: 'down' }, { big: true, now }), 'down');
  assert.equal(bootAction(up({ at: new Date(now - (MAX_HOURS + 1) * 36e5).toISOString() }), { big: true, now }), 'down');
  assert.equal(bootAction(up({ starts: MAX_STARTS }), { big: true, now }), 'down');
});

test('boot: forget the state on the normal machine, and stop retrying a failing resize', () => {
  assert.equal(bootAction(up(), { big: false, now }), 'clear');
  assert.equal(bootAction({ ...up(), phase: 'down' }, { big: false, now }), 'clear');
  assert.equal(bootAction({ ...up(), phase: 'down', downTries: 2 }, { big: true, now }), 'clear');
  assert.equal(bootAction(null, { big: true, now }), 'none');
});
