const test = require('node:test');
const assert = require('node:assert');
const { cleanTitle, isFood } = require('../src/titles');

test('strips Best Before prefixes', () => {
  assert.equal(cleanTitle("Best Before 20th December'26 Kingsford Corn Starch - 420g"), 'Kingsford Corn Starch - 420g');
  assert.equal(cleanTitle("Best Before Feb '26 - TRS Barley Flour - 1Kg"), 'TRS Barley Flour - 1Kg');
  assert.equal(cleanTitle("Best Before 30 Nov '26 - Shagun Black Pepper Whole- 100g"), 'Shagun Black Pepper Whole- 100g');
  assert.equal(cleanTitle('Best Before: 20/12/2026 - Haldiram Boondi'), 'Haldiram Boondi');
  assert.equal(cleanTitle("(Best Before Dec '26) Haldiram Boondi"), 'Haldiram Boondi');
});

test('strips Best Before suffixes', () => {
  assert.equal(cleanTitle("Haldiram Boondi 200g - Best Before 30 Nov '26"), 'Haldiram Boondi 200g');
  assert.equal(cleanTitle("Haldiram Boondi 200g (Best Before Feb '26)"), 'Haldiram Boondi 200g');
});

test('leaves normal titles alone and truncates long ones', () => {
  assert.equal(cleanTitle("Haldiram's - Boondi 200g"), "Haldiram's - Boondi 200g");
  const long = cleanTitle('White Ceramic Aroma Oil & Wax Burner with Fragrance Essential Oil Pack and Extra Long Words', 70);
  assert.ok(long.length <= 70 && long.endsWith('…'));
});

test('food detection by product type', () => {
  for (const t of ['Snacks', 'Flour & Flour Products', 'Herbs & Spices', 'Fresh & Frozen Vegetables']) assert.ok(isFood(t), t);
  for (const t of ['', 'Toothpaste', 'Household', 'Health & Beauty']) assert.ok(!isFood(t), t);
});

const Tokens = require('../src/themes/_tokens');
test('rules resolve tag text and badges', () => {
  const t = Tokens.compile({ label: 'Autumn', foodLabel: 'Autumn pantry', rules: [
    { field: 'tag', value: 'Vegan', action: 'badge', text: 'Vegan' },
    { field: 'newDays', value: '30', action: 'badge', text: 'New' },
    { field: 'vendor', value: 'haldiram', action: 'tag', text: "Haldiram's" },
  ] });
  const now = Date.parse('2026-11-10');
  assert.deepEqual(Tokens.resolve(t, { tags: ['vegan'], food: true }, now), { label: 'Autumn pantry', badge: 'Vegan' });
  assert.deepEqual(Tokens.resolve(t, { createdAt: '2026-11-01', food: false }, now), { label: 'Autumn', badge: 'New' });
  assert.deepEqual(Tokens.resolve(t, { vendor: 'Haldiram', createdAt: '2025-01-01' }, now), { label: "Haldiram's", badge: '' });
});
test('lint flags prices, discounts and unverified claims', () => {
  assert.equal(Tokens.lint({ label: 'Winter' }).length, 0);
  assert.ok(Tokens.lint({ label: '50% korting' }).length);
  assert.ok(Tokens.lint({ bandText: '100.000+ happy customers' }).length);
  assert.ok(Tokens.lint({ rules: [{ text: 'Best price' }] }).length);
});
test('delivery threshold is not flagged as a price', () => {
  assert.deepEqual(Tokens.lint({ bandText: 'Free delivery over €29 | Thousands of Indian & Asian groceries' }), []);
  assert.deepEqual(Tokens.lint({ bandText: 'Gratis bezorging vanaf €29' }), []);
  assert.ok(Tokens.lint({ bandText: 'Only €3,49' }).length);
});
