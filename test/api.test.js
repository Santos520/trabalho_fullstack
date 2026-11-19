const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

let processServer;
let baseUrl;
let tempDir;
let adminToken;
let clientToken;
let gameId;
let bookingId;
let secondClientToken;

async function availablePort() {
  const socket = net.createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const { port } = socket.address();
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function request(route, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${baseUrl}/api/${route}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  return { status: response.status, data: await response.json() };
}

before(async () => {
  const port = await availablePort();
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gamevault-api-test-'));
  baseUrl = `http://127.0.0.1:${port}`;
  processServer = spawn(process.execPath, ['server.js'], {
    cwd: path.resolve(__dirname, '..'),
    env: { ...process.env, PORT: String(port), DATA_FILE: path.join(tempDir, 'data.json'), OPENAI_API_KEY: '', DISABLE_REMOTE_COVERS: '1', CLOUDINARY_CLOUD_NAME: '', CLOUDINARY_API_KEY: '', CLOUDINARY_API_SECRET: '' },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`Servidor não iniciou a tempo. Saída: ${output}`)), 10000);
    processServer.stdout.on('data', chunk => {
      output += chunk.toString();
      if (output.includes('GameVault running')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    processServer.stderr.on('data', chunk => { output += chunk.toString(); });
    processServer.once('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
    processServer.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Servidor encerrou antes de iniciar (${code}): ${output}`));
    });
  });
});

after(() => {
  if (processServer && !processServer.killed) processServer.kill();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test('catálogo público lista jogos com capa e busca', async () => {
  const all = await request('games');
  assert.equal(all.status, 200);
  assert.ok(all.data.length >= 30);
  assert.ok(all.data.some(game => game.title === 'Hades' && game.cover));
  assert.ok(all.data.some(game => game.ai && game.ai.length > 0), 'o catálogo contém insights de IA exibidos na página principal');
  const filtered = await request('games?q=Hades');
  assert.ok(filtered.data.length > 0);
  assert.ok(filtered.data.every(game => game.title.toLowerCase().includes('hades')));
});

test('catálogo inclui a seleção recente de Monster Hunter com capas', async () => {
  const response = await request('games?q=Monster%20Hunter');
  assert.equal(response.status, 200);
  const titles = response.data.map(game => game.title);
  for (const title of [
    'Monster Hunter: World',
    'Monster Hunter World: Iceborne',
    'Monster Hunter Rise',
    'Monster Hunter Rise: Sunbreak',
    'Monster Hunter Stories',
    'Monster Hunter Stories 2: Wings of Ruin',
    'Monster Hunter Wilds',
    'Monster Hunter Stories 3: Twisted Reflection'
  ]) assert.ok(titles.includes(title), `${title} deve estar no catálogo`);
  assert.ok(response.data.every(game => game.cover.startsWith('https://')));
});

test('capas usam IDs corretos e não associam Minecraft/Zelda a jogos Steam diferentes', async () => {
  const response = await request('games');
  const coverOf = title => response.data.find(game => game.title === title)?.cover || '';
  assert.match(coverOf('God of War Ragnarök'), /\/2322010\/header\.jpg$/);
  assert.match(coverOf('Call of Duty: Modern Warfare III'), /\/2519060\/header\.jpg$/);
  assert.match(coverOf('Minecraft'), /Minecraft_capa\.png$/);
  assert.match(coverOf('The Legend of Zelda: Breath of the Wild'), /The_Legend_of_Zelda_Breath_of_the_Wild\.jpg$/);
  assert.match(coverOf('Fortnite'), /Fortnite\.jpg$/i);
  assert.doesNotMatch(coverOf('Minecraft'), /\/steam\/apps\/1672970\//);
  assert.doesNotMatch(coverOf('The Legend of Zelda: Breath of the Wild'), /\/steam\/apps\/1151640\//);
});

test('cadastro valida campos e cria sessão; login valida credenciais', async () => {
  assert.equal((await request('auth', { method: 'POST', body: { action: 'register', email: 'errado', password: '123' } })).status, 400);
  const registration = await request('auth', { method: 'POST', body: { action: 'register', name: 'Teste API', email: 'api-test@example.com', password: 'senha-segura-123' } });
  assert.equal(registration.status, 201);
  assert.equal(registration.data.role, 'client');
  clientToken = registration.data.token;
  assert.equal((await request('auth', { method: 'POST', body: { action: 'register', name: 'Duplicado', email: 'api-test@example.com', password: 'senha-segura-123' } })).status, 409);
  const login = await request('auth', { method: 'POST', body: { email: 'api-test@example.com', password: 'senha-segura-123' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.email, 'api-test@example.com');
  assert.equal((await request('auth', { method: 'POST', body: { email: 'api-test@example.com', password: 'incorreta' } })).status, 401);
  const secondRegistration = await request('auth', { method: 'POST', body: { action: 'register', name: 'Segundo Teste', email: 'api-test-2@example.com', password: 'senha-segura-123' } });
  secondClientToken = secondRegistration.data.token;
});

test('login admin e rotas protegidas respeitam permissões', async () => {
  assert.equal((await request('dashboard')).status, 401);
  assert.equal((await request('dashboard', { token: clientToken })).status, 401);
  const login = await request('auth', { method: 'POST', body: { email: 'admin@gamevault.com', password: 'admin123' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.role, 'admin');
  adminToken = login.data.token;
  assert.equal((await request('dashboard', { token: adminToken })).status, 200);
  assert.equal((await request('me', { token: clientToken })).status, 200);
});

test('admin cria, edita e remove jogos; clientes não podem administrar', async () => {
  const game = await request('games', { method: 'POST', token: adminToken, body: { title: 'Jogo de teste', category: 'Aventura', platform: 'PC', year: 2024, cover: 'https://example.com/cover.jpg' } });
  assert.equal(game.status, 201);
  gameId = game.data.id;
  assert.equal((await request('games', { method: 'POST', token: clientToken, body: { title: 'Negado', category: 'Teste', platform: 'PC', year: 2024 } })).status, 401);
  const updated = await request(`games/${gameId}`, { method: 'PUT', token: adminToken, body: { ...game.data, title: 'Jogo de teste editado' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.title, 'Jogo de teste editado');
  assert.equal((await request(`games/${gameId}`, { method: 'DELETE', token: adminToken })).status, 200);
});

test('admin autoriza ou recusa solicitações de empréstimo', async () => {
  assert.equal((await request('bookings')).status, 401);
  assert.equal((await request('bookings', { token: clientToken })).status, 401);
  const games = await request('games');
  const selectedGame = games.data[0];
  gameId = selectedGame.id;
  const futureDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const created = await request('bookings', { method: 'POST', token: clientToken, body: { gameId, date: futureDate } });
  assert.equal(created.status, 201);
  bookingId = created.data.id;
  assert.equal(created.data.status, 'Solicitado');
  assert.equal((await request(`bookings/${bookingId}`, { method: 'PATCH', token: clientToken })).status, 409);
  assert.equal((await request('bookings', { method: 'POST', token: clientToken, body: { gameId, date: futureDate } })).status, 409);
  assert.equal((await request('bookings', { method: 'DELETE', token: secondClientToken })).status, 404);
  const canceled = await request(`bookings/${bookingId}`, { method: 'DELETE', token: clientToken });
  assert.equal(canceled.status, 200);
  assert.equal(canceled.data.status, 'Cancelado');
  assert.equal((await request(`bookings/${bookingId}`, { method: 'DELETE', token: clientToken })).status, 409);
  assert.equal((await request('bookings', { method: 'POST', token: clientToken, body: { gameId, date: '2026-02-30' } })).status, 400);
  assert.equal((await request('bookings', { method: 'POST', token: clientToken, body: { gameId, date: '2000-01-01' } })).status, 400);
  const rescheduled = await request('bookings', { method: 'POST', token: clientToken, body: { gameId, date: futureDate } });
  assert.equal(rescheduled.status, 201);
  const pending = await request('bookings', { token: adminToken });
  assert.ok(pending.data.some(item => item.id === rescheduled.data.id && item.client === 'Teste API'));
  assert.equal((await request(`bookings/${rescheduled.data.id}`, { method: 'PATCH', token: clientToken, body: { status: 'Confirmada' } })).status, 409);
  const authorized = await request(`bookings/${rescheduled.data.id}`, { method: 'PATCH', token: adminToken, body: { status: 'Confirmada' } });
  assert.equal(authorized.status, 200);
  assert.equal(authorized.data.status, 'Confirmada');
  assert.equal((await request('me', { token: clientToken })).data.bookings.some(item => item.id === rescheduled.data.id), true);
  const returned = await request(`bookings/${rescheduled.data.id}`, { method: 'PATCH', token: clientToken });
  assert.equal(returned.status, 200);
  assert.equal(returned.data.status, 'Devolvido');
  const toReject = await request('bookings', { method: 'POST', token: clientToken, body: { gameId, date: futureDate } });
  assert.equal(toReject.status, 201);
  const rejected = await request(`bookings/${toReject.data.id}`, { method: 'PATCH', token: adminToken, body: { status: 'Recusado' } });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.data.status, 'Recusado');
  assert.equal((await request('bookings', { method: 'POST', token: clientToken, body: { gameId, date: futureDate } })).status, 201);
});

test('avaliações validam nota e comentário e admin pode responder', async () => {
  assert.equal((await request('reviews', { method: 'POST', token: clientToken, body: { gameId, rating: 8, comment: 'Ruim' } })).status, 400);
  const review = await request('reviews', { method: 'POST', token: clientToken, body: { gameId, rating: 5, comment: 'Excelente teste!' } });
  assert.equal(review.status, 201);
  const reply = await request(`reviews/${review.data.id}`, { method: 'PATCH', token: adminToken, body: { reply: 'Obrigado pelo teste!' } });
  assert.equal(reply.status, 200);
  assert.equal(reply.data.reply, 'Obrigado pelo teste!');
  assert.ok((await request('reviews', { token: adminToken })).data.some(item => item.id === review.data.id));
});

test('curadoria responde sem chave e valida pedido vazio', async () => {
  const recommendations = await request('ai', { method: 'POST', body: { mood: 'quero relaxar e jogar com amigos' } });
  assert.equal(recommendations.status, 200);
  assert.equal(recommendations.data.source, 'curadoria local');
  assert.ok(recommendations.data.games.length > 0);
  assert.equal((await request('ai', { method: 'POST', body: { mood: '' } })).status, 400);
});

test('IA combina modo cooperativo e duração, e respeita gêneros negados', async () => {
  const combined = await request('ai', { method: 'POST', body: { mood: 'Quero jogos cooperativos curtos para jogar com amigos' } });
  assert.equal(combined.status, 200);
  assert.ok(combined.data.games.some(game => Number(game.players.match(/\d+/g)?.at(-1)) > 1 && Number(game.duration.match(/\d+/g)?.at(-1)) <= 60));
  assert.ok(combined.data.games.every(game => game.recommendationReason));

  const avoidHorror = await request('ai', { method: 'POST', body: { mood: 'Quero ação, mas sem terror' } });
  assert.equal(avoidHorror.status, 200);
  assert.ok(avoidHorror.data.games.every(game => game.title !== 'Ghostwire: Tokyo'));

  const noMatch = await request('ai', { method: 'POST', body: { mood: 'Quero jogos de corrida' } });
  assert.match(noMatch.data.answer, /não encontrei uma combinação exata/i);
});

test('IA recomenda jogos adequados para jogar em casal', async () => {
  const response = await request('ai', { method: 'POST', body: { mood: 'para jogar em casal' } });
  assert.equal(response.status, 200);
  const titles = response.data.games.map(game => game.title);
  assert.equal(titles[0], 'It Takes Two');
  assert.ok(titles.includes('It Takes Two'));
  assert.ok(titles.includes('Minecraft'));
  assert.ok(!titles.includes('Hades'));
  assert.ok(!titles.includes('Elden Ring'));
});

test('busca Steam valida consulta e importação exige perfil admin', async () => {
  assert.equal((await request('catalog/steam?q=x')).status, 400);
  assert.equal((await request(`catalog/steam?q=${'a'.repeat(81)}`)).status, 400);
  assert.equal((await request('catalog/steam/import', { method: 'POST', token: clientToken, body: { appId: '440' } })).status, 401);
  assert.equal((await request('catalog/steam/import', { method: 'POST', token: adminToken, body: { appId: 'inválido' } })).status, 400);
});

test('Swagger UI e OpenAPI documentam os contratos reais sem depender de CDN', async () => {
  const page = await fetch(`${baseUrl}/docs`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /swagger-ui/);
  for (const asset of ['swagger-ui.css', 'swagger-ui-bundle.js', 'swagger-ui-standalone-preset.js', 'swagger-init.js']) {
    const response = await fetch(`${baseUrl}/docs/${asset}?v=1`);
    assert.equal(response.status, 200, asset);
    assert.ok((await response.text()).length > 0);
  }
  assert.equal((await fetch(`${baseUrl}/docs/server.js`)).status, 404);
  const response = await fetch(`${baseUrl}/docs/openapi.json`);
  assert.equal(response.status, 200);
  const spec = await response.json();
  await require('@apidevtools/swagger-parser').validate(spec);
  assert.equal(spec.openapi, '3.0.0');
  assert.equal(spec.servers[0].url, '/');
  const expected = {
    '/api/auth': ['post'], '/api/games': ['get', 'post'], '/api/games/{id}': ['put', 'delete'],
    '/api/catalog/steam': ['get'], '/api/catalog/steam/import': ['post'], '/api/dashboard': ['get'],
    '/api/me': ['get'], '/api/bookings': ['get', 'post'], '/api/bookings/{id}': ['patch', 'delete'],
    '/api/reviews': ['get', 'post'], '/api/reviews/{id}': ['patch'], '/api/ai': ['post']
  };
  for (const [route, methods] of Object.entries(expected)) {
    for (const method of methods) assert.ok(spec.paths[route]?.[method], `${method} ${route}`);
  }
  assert.equal(spec.components.securitySchemes.bearerAuth.scheme, 'bearer');
  assert.equal(spec.components.securitySchemes.bearerAuth.bearerFormat, undefined);
  assert.deepEqual(spec.paths['/api/games'].post.security, [{ bearerAuth: [] }]);
  assert.deepEqual(spec.paths['/api/games'].get.security, []);
  assert.equal((await fetch(`${baseUrl}/`)).status, 200);
});

test('upload de capas valida autenticação, entidade, multipart e configuração', async () => {
  const selected = (await request('games?q=Hades')).data[0];
  const route = `games/${selected.id}/cover`;
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
  const send = async (form, { token = adminToken, target = route, headers = {} } = {}) => {
    const res = await fetch(`${baseUrl}/api/${target}`, { method: 'POST', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: form, signal: AbortSignal.timeout(3000) });
    return { status: res.status, data: await res.json() };
  };
  const form = (bytes = png, type = 'image/png', field = 'imagem') => {
    const data = new FormData();
    data.append(field, new Blob([bytes], { type }), 'capa.png');
    return data;
  };
  assert.equal((await send(form(), { token: '' })).status, 401);
  assert.equal((await send(form(), { token: clientToken })).status, 401);
  assert.equal((await send(form(), { target: 'games/inexistente/cover' })).status, 404);
  assert.equal((await send('{}', { headers: { 'Content-Type': 'application/json' } })).status, 415);
  const empty = new FormData(); empty.append('imagem', 'sem arquivo');
  assert.equal((await send(empty)).status, 400);
  assert.equal((await send(form(Buffer.from('texto'), 'text/plain'))).status, 415);
  assert.equal((await send(form(Buffer.from('texto'), 'image/png'))).status, 415);
  assert.equal((await send(form(png, 'image/jpeg'))).status, 415);
  assert.equal((await send(form(png, 'image/png', 'arquivo'))).status, 400);
  const extra = form(); extra.append('folder', 'arbitraria');
  assert.equal((await send(extra)).status, 400);
  const two = form(); two.append('imagem', new Blob([png], { type: 'image/png' }), 'outra.png');
  assert.equal((await send(two)).status, 400);
  assert.equal((await send(form(Buffer.alloc(5 * 1024 * 1024 + 1)))).status, 413);
  assert.equal((await send('--boundary\r\nContent-Disposition: form-data; name="imagem"; filename="a.png"\r\nContent-Type: image/png\r\n\r\n', { headers: { 'Content-Type': 'multipart/form-data; boundary=boundary' } })).status, 400);
  const unavailable = await send(form());
  assert.equal(unavailable.status, 503);
  assert.equal((await send(form(), { target: `games//${selected.id}//cover//` })).status, 503);
  assert.doesNotMatch(JSON.stringify(unavailable.data), /api_secret|stack|Error:/);
  assert.equal((await request('games?q=Hades')).data[0].cover, selected.cover);
  const spec = await (await fetch(`${baseUrl}/docs/openapi.json`)).json();
  const upload = spec.paths['/api/games/{id}/cover'].post;
  assert.equal(upload.requestBody.content['multipart/form-data'].schema.properties.imagem.format, 'binary');
  assert.deepEqual(upload.security, [{ bearerAuth: [] }]);
});

