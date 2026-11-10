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
