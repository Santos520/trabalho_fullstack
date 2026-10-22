const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const net = require('node:net');

let child, temp, url, token, gameId, dataFile, log;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
async function jsonRequest(route, method = 'GET', body) {
  const response = await fetch(`${url}/api/${route}`, { method, headers: { Authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
}
async function upload(id = gameId, suffix = '') {
  const form = new FormData();
  form.append('imagem', new Blob([png, suffix], { type: 'image/png' }), 'capa.png');
  const response = await fetch(`${url}/api/games/${id}/cover`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form, signal: AbortSignal.timeout(3000) });
  return { status: response.status, data: await response.json() };
}
const calls = () => fs.existsSync(log) ? fs.readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];

before(async () => {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'gamevault-upload-'));
  dataFile = path.join(temp, 'data.json'); log = path.join(temp, 'cloudinary.log');
  child = spawn(process.execPath, ['--require', './fixtures/cloudinary-preload.cjs', 'server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATA_FILE: dataFile, NODE_ENV: 'test', OPENAI_API_KEY: '', DISABLE_REMOTE_COVERS: '1', ADMIN_EMAIL: 'admin@gamevault.com', ADMIN_PASSWORD: 'admin123', CLOUDINARY_CLOUD_NAME: 'test', CLOUDINARY_API_KEY: 'fake', CLOUDINARY_API_SECRET: 'fake', CLOUDINARY_TEST_LOG: log, TEST_PARTIAL_WRITE_FLAG: path.join(temp, 'partial-write'), TEST_CLEANUP_FAIL_FLAG: path.join(temp, 'cleanup-fail') },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('API de teste não iniciou')), 10000);
    child.stdout.on('data', chunk => {
      const port = chunk.toString().match(/GameVault running at http:\/\/localhost:(\d+)/)?.[1];
      if (port) { url = `http://127.0.0.1:${port}`; clearTimeout(timeout); resolve(); }
    });
    child.once('error', reject);
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`API encerrou: ${code}`)); });
    child.stderr.resume();
  });
  const login = await jsonRequest('auth', 'POST', { email: 'admin@gamevault.com', password: 'admin123' });
  token = login.data.token;
  gameId = (await jsonRequest('games?q=Hades')).data[0].id;
});
after(async () => {
  if (child && child.exitCode === null) { const exit = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exit; }
  if (temp) fs.rmSync(temp, { recursive: true, force: true });
});

test('upload válido persiste URL/public_id e substitui capa fixa sem alterar metadados', async () => {
  const result = await upload();
  assert.equal(result.status, 201);
  assert.equal(result.data.title, 'Hades');
  assert.match(result.data.cover, /^https:\/\/res\.cloudinary\.com\//);
  assert.equal(result.data.coverPublicId, 'gamevault/covers/test-1');
  const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8')).games.find(game => game.id === gameId);
  assert.equal(saved.cover, result.data.cover);
  assert.equal(saved.coverPublicId, result.data.coverPublicId);
  assert.equal((await jsonRequest('games?q=Hades')).data[0].cover, result.data.cover);
  assert.equal(calls()[0].options.folder, 'gamevault/covers');
  assert.equal(calls()[0].options.resource_type, 'image');
});

test('substituições concorrentes preservam a última capa e removem as anteriores', async () => {
  const results = await Promise.all([upload(gameId, 'slow'), upload()]);
  assert.ok(results.every(result => result.status === 201));
  const current = (await jsonRequest('games?q=Hades')).data[0];
  const destroyed = calls().filter(call => call.action === 'destroy').map(call => call.publicId);
  assert.ok(destroyed.includes('gamevault/covers/test-1'));
  for (const result of results) {
    if (result.data.coverPublicId !== current.coverPublicId) assert.ok(destroyed.includes(result.data.coverPublicId));
  }
  assert.ok(!destroyed.includes(current.coverPublicId));
});

test('falha do provedor preserva capa atual e não revela detalhes', async () => {
  const previous = (await jsonRequest('games?q=Hades')).data[0];
  const result = await upload(gameId, 'provider-fail');
  assert.equal(result.status, 502);
  assert.doesNotMatch(JSON.stringify(result.data), /secret-provider-error|stack/);
  assert.equal((await jsonRequest('games?q=Hades')).data[0].cover, previous.cover);
});

test('erro do stream retorna 502 sem encerrar o servidor nem alterar capa', async () => {
  const previous = (await jsonRequest('games?q=Hades')).data[0];
  const result = await upload(gameId, 'stream-fail');
  assert.equal(result.status, 502);
  assert.doesNotMatch(JSON.stringify(result.data), /secret-stream-error|stack/);
  assert.equal((await jsonRequest('games?q=Hades')).data[0].cover, previous.cover);
});

test('falha ao limpar imagem antiga não desfaz uma substituição já persistida', async () => {
  const flag = path.join(temp, 'cleanup-fail');
  fs.writeFileSync(flag, '1');
  try {
    const result = await upload();
    assert.equal(result.status, 201);
    assert.equal((await jsonRequest('games?q=Hades')).data[0].cover, result.data.cover);
    assert.equal(JSON.parse(fs.readFileSync(dataFile, 'utf8')).games.find(game => game.id === gameId).cover, result.data.cover);
  } finally { fs.unlinkSync(flag); }
});

test('falha de persistência reverte a capa e exclui somente o novo recurso', async () => {
  const previous = (await jsonRequest('games?q=Hades')).data[0];
  fs.renameSync(dataFile, `${dataFile}.backup`);
  fs.mkdirSync(dataFile);
  try {
    const result = await upload();
    assert.equal(result.status, 500);
    assert.doesNotMatch(JSON.stringify(result.data), /EPERM|EISDIR|C:\\|stack/);
    assert.equal((await jsonRequest('games?q=Hades')).data[0].cover, previous.cover);
    const events = calls();
    const lastUpload = events.filter(call => call.action === 'upload').at(-1);
    assert.ok(events.some(call => call.action === 'destroy' && call.publicId === lastUpload.publicId));
    assert.ok(!events.some(call => call.action === 'destroy' && call.publicId === previous.coverPublicId));
  } finally {
    fs.rmdirSync(dataFile);
    fs.renameSync(`${dataFile}.backup`, dataFile);
  }
});

test('escrita parcial preserva o JSON anterior e remove o arquivo temporário', async () => {
  const previous = fs.readFileSync(dataFile, 'utf8');
  fs.writeFileSync(path.join(temp, 'partial-write'), '1');
  try {
    const result = await upload();
    assert.equal(result.status, 500);
    assert.equal(fs.readFileSync(dataFile, 'utf8'), previous);
    assert.ok(!fs.readdirSync(temp).some(name => name.endsWith('.tmp')));
  } finally { fs.writeFileSync(dataFile, previous); }
});

test('exclusão durante upload não recria jogo e limpa imagem sem vínculo', async () => {
  const created = await jsonRequest('games', 'POST', { title: 'Temporário', category: 'Teste', platform: 'PC', year: 2024 });
  const pending = upload(created.data.id, 'slow');
  // Espera o upload chegar ao provedor sem depender de tempo de rede.
  const expectedCount = calls().filter(call => call.action === 'upload').length + 1;
  for (let attempt = 0; calls().filter(call => call.action === 'upload').length < expectedCount && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal((await jsonRequest(`games/${created.data.id}`, 'DELETE')).status, 200);
  const result = await pending;
  assert.equal(result.status, 409);
  assert.equal((await jsonRequest('games?q=Temporário')).data.length, 0);
  const lastUpload = calls().filter(call => call.action === 'upload').at(-1);
  assert.ok(calls().some(call => call.action === 'destroy' && call.publicId === lastUpload.publicId));
});

test('barras repetidas seguem o mesmo despacho do upload sem bloquear a fila', async () => {
  assert.equal((await upload(`/${gameId}/`)).status, 201);
});
