const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');

test('modelo PostgreSQL tem cinco tabelas relacionadas e restrições principais', () => {
  for (const table of ['admins', 'clients', 'games', 'bookings', 'reviews']) {
    assert.match(schema, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(`, 'i'));
  }
  assert.match(schema, /client_id TEXT NOT NULL REFERENCES clients\(id\)/i);
  assert.match(schema, /game_id TEXT NOT NULL REFERENCES games\(id\)/i);
  assert.match(schema, /reviewed_by TEXT REFERENCES admins\(id\)/i);
  assert.match(schema, /CHECK \(rating BETWEEN 1 AND 5\)/i);
  assert.match(schema, /CHECK \(status IN \('Solicitado', 'Confirmada', 'Recusado', 'Devolvido', 'Cancelado'\)\)/i);
});

test('PostgreSQL é dependência e Render pede as credenciais fora do repositório', () => {
  const packageJson = require('../package.json');
  const renderConfig = fs.readFileSync(path.join(__dirname, '..', 'render.yaml'), 'utf8');
  assert.ok(packageJson.dependencies?.pg);
  assert.match(renderConfig, /key: DATABASE_URL\s+sync: false/);
  assert.match(renderConfig, /key: ADMIN_PASSWORD\s+sync: false/);
});
