const { test } = require('node:test');
const assert = require('node:assert/strict');
const { serveDocs } = require('../api-docs');

test('nomes herdados do protótipo não são tratados como assets Swagger', () => {
  for (const name of ['toString', 'constructor', '__proto__']) {
    let status;
    const response = { writeHead(code) { status = code; }, end() {} };
    assert.doesNotThrow(() => serveDocs({ url: `/docs/${name}`, method: 'GET' }, response));
    assert.equal(status, 404);
  }
});

test('request-target fora da documentação não lança erro no despacho', () => {
  assert.doesNotThrow(() => {
    assert.equal(serveDocs({ url: '//%', method: 'GET' }, {}), false);
  });
});
