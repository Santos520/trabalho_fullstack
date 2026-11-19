const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const app = require('../public/app.js');

test('rotas por hash normalizam caminho e preservam filtros', () => {
  assert.deepEqual([app.parseRoute('').path, app.parseRoute('#/').path, app.parseRoute('#/jogo/abc/').path], ['/', '/', '/jogo/abc']);
  const { path: route, params } = app.parseRoute('#/catalogo?q=hades&destaque=1');
  assert.equal(route, '/catalogo');
  assert.equal(params.get('q'), 'hades');
  assert.equal(app.catalogHref(params, { destaque: '', categoria: 'RPG' }), '#/catalogo?q=hades&categoria=RPG');
  assert.equal(app.catalogHref('', {}), '#/catalogo');
});

test('validação local da capa espelha os limites do upload', () => {
  assert.equal(app.validateCover({ type: 'image/webp', size: 1024 }), '');
  assert.match(app.validateCover({ type: 'image/gif', size: 1024 }), /PNG, JPEG ou WebP/);
  assert.match(app.validateCover({ type: 'image/png', size: 5 * 1024 * 1024 + 1 }), /5 MB/);
  assert.match(app.validateCover(undefined), /Escolha/);
});

test('ordenação, categorias, status e escape', () => {
  const games = [{ title: 'Hades', category: 'Ação', year: 2020 }, { title: 'Elden Ring', category: 'Ação', year: 2022 }, { title: 'Stardew', category: 'Simulação', year: 2016 }];
  assert.deepEqual(app.sortGames(games, { sort: 'az' }).map(game => game.title), ['Elden Ring', 'Hades', 'Stardew']);
  assert.deepEqual(app.sortGames(games, { category: 'Ação', sort: 'recentes' }).map(game => game.year), [2022, 2020]);
  assert.deepEqual(app.categoryCounts(games), [['Ação', 2], ['Simulação', 1]]);
  assert.deepEqual(app.statusInfo('Confirmada'), ['Emprestado', 'success']);
  assert.equal(app.formatDate('2026-11-24'), '24/11/2026');
  assert.equal(app.esc('<img src=x onerror="a">'), '&lt;img src=x onerror=&quot;a&quot;&gt;');
});

test('index.html tem a casca que o app.js usa', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  for (const id of ['view', 'searchForm', 'searchInput', 'accountBtn', 'sideNav', 'sideAccount', 'bottomNav', 'sheet', 'sheetBody', 'confirm', 'confirmTitle', 'confirmText', 'confirmOk', 'toasts']) {
    assert.match(html, new RegExp(`id="${id}"`), `faltando #${id}`);
  }
  assert.match(html, /<script src="\/app\.js" defer><\/script>/);
});
