// House rules: every theme must compile and carry no price, discount or unverified claim.
const test = require('node:test');
const assert = require('node:assert');
const { themes } = require('../src/frame');
const Tokens = require('../src/themes/_tokens');

for (const [name, t] of Object.entries(themes)) {
  test(`theme ${name} compiles and passes house rules`, () => {
    assert.ok(t.css.includes('.band'));
    assert.deepEqual(Tokens.lint(t.tokens), [], `${name}: ${Tokens.lint(t.tokens).join(' ')}`);
  });
}

// Translations follow the same house rules (prices, discounts, claims) in every language.
const config = require('../config.json');
for (const [lang, dict] of Object.entries(config.translations || {})) {
  test(`translations ${lang} pass house rules`, () => {
    const plain = Object.entries(dict).filter(([k]) => k !== 'Offer price' && !/\{(was|pct)\}/.test(k)).map(([, v]) => v);
    assert.deepEqual(Tokens.lint({ bandText: plain.join(' | ') }), [], `${lang}: ${Tokens.lint({ bandText: plain.join(' | ') }).join(' ')}`);
  });
}
test('translate swaps texts and band parts', () => {
  const t = Tokens.compile({ label: 'Autumn', foodLabel: 'Autumn pantry', bandText: 'Free delivery over €29 | Thousands of Indian & Asian groceries', layers: [{ kind: 'text', text: 'Shop now' }] });
  const nl = Tokens.translate(t, config.translations.nl_XX);
  assert.equal(nl.label, 'Herfst');
  assert.equal(nl.bandText, 'Gratis bezorging vanaf €29 | Duizenden Indiase & Aziatische boodschappen');
  assert.equal(nl.layers[0].text, 'Nu bestellen');
});
