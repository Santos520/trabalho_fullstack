'use strict';
// GameVault v2: SPA sem build. Rotas por hash (o servidor estático só entrega arquivos, sem query string).

// ---------- Funções puras (também testadas em test/frontend.test.js) ----------
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const COVER_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const COVER_MAX_BYTES = 5 * 1024 * 1024;
function validateCover(file) {
  if (!file) return 'Escolha uma imagem.';
  if (!COVER_TYPES.includes(file.type)) return 'Use uma imagem PNG, JPEG ou WebP.';
  if (file.size > COVER_MAX_BYTES) return 'A imagem deve ter no máximo 5 MB.';
  return '';
}
function parseRoute(hash) {
  const [rawPath, query = ''] = String(hash || '').replace(/^#/, '').split('?');
  const path = ('/' + rawPath.replace(/^\/+/, '')).replace(/\/+$/, '') || '/';
  return { path, params: new URLSearchParams(query) };
}
function catalogHref(params, changes = {}) {
  const next = new URLSearchParams(params || '');
  for (const [key, value] of Object.entries(changes)) value ? next.set(key, value) : next.delete(key);
  const query = next.toString();
  return '#/catalogo' + (query ? `?${query}` : '');
}
const STATUS = { Solicitado: ['Aguardando aprovação', 'info'], Confirmada: ['Emprestado', 'success'], Recusado: ['Recusado', 'danger'], Devolvido: ['Devolvido', 'muted'], Cancelado: ['Cancelado', 'muted'] };
const statusInfo = status => STATUS[status] || [status, 'muted'];
function sortGames(games, { category = '', sort = 'relevancia' } = {}) {
  const list = category ? games.filter(game => game.category === category) : games.slice();
  if (sort === 'az') list.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  if (sort === 'recentes') list.sort((a, b) => b.year - a.year);
  if (sort === 'antigos') list.sort((a, b) => a.year - b.year);
  return list;
}
function categoryCounts(games) {
  const counts = new Map();
  games.forEach(game => counts.set(game.category, (counts.get(game.category) || 0) + 1));
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'));
}
const todayUTC = () => new Date().toISOString().slice(0, 10); // a API valida a data em UTC
const formatDate = iso => { const [y, m, d] = String(iso || '').split('-'); return d ? `${d}/${m}/${y}` : String(iso || ''); };
const firstName = name => String(name || '').trim().split(/\s+/)[0] || '';

if (typeof module === 'object' && module.exports) module.exports = { esc, validateCover, parseRoute, catalogHref, statusInfo, sortGames, categoryCounts, formatDate, firstName };

// ---------- Navegador ----------
const ICONS = {
  home: '<path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-3.5 3.8-5 7-5s6 1.5 7 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c2 .6 3.4 2.2 4 5"/>',
  check: '<path d="m5 12 5 5 9-10"/>', alert: '<path d="M12 3 2 20h20zM12 10v4M12 17v.5"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/>'
};
const ic = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;
const NAV = [['/', 'Descobrir', 'Início', 'home'], ['/catalogo', 'Catálogo', 'Catálogo', 'grid'], ['/curadoria', 'Curadoria IA', 'Curadoria', 'spark'], ['/conta', 'Minha área', 'Conta', 'user']];
const ADMIN_NAV = [['/admin', 'Painel', 'chart'], ['/admin/emprestimos', 'Empréstimos', 'calendar'], ['/admin/jogos', 'Jogos', 'grid'], ['/admin/avaliacoes', 'Avaliações', 'star']];
const PRESETS = ['curto e cooperativo', 'relaxar sozinho', 'desafio bem difícil', 'história marcante', 'jogar com amigos no sofá'];
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const readUser = () => { try { return JSON.parse(localStorage.getItem('gamevault_user') || 'null'); } catch { return null; } };
const state = { user: readUser(), games: null, token: 0, charts: [], hero: [], heroIndex: 0, steam: [] };
const isAdmin = () => state.user?.role === 'admin';

async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (state.user?.token) headers.Authorization = `Bearer ${state.user.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let response;
  try { response = await fetch(`/api/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new Error('Sem conexão com o servidor. Verifique a internet e tente novamente.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) handleAuthError(response.status, path);
  if (!response.ok) throw Object.assign(new Error(data.error || `Erro ${response.status}`), { status: response.status });
  return data;
}
function handleAuthError(status, path) {
  if (status !== 401 || path === 'auth' || !state.user) return;
  setUser(null);
  openAuth('login', 'Sua sessão expirou. Entre novamente.');
}
// XHR em vez de fetch para mostrar o progresso do envio.
function uploadCover(id, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('imagem', file);
    xhr.open('POST', `/api/games/${encodeURIComponent(id)}/cover`);
    if (state.user?.token) xhr.setRequestHeader('Authorization', `Bearer ${state.user.token}`);
    xhr.upload.onprogress = event => event.lengthComputable && onProgress?.(event.loaded / event.total);
    xhr.onerror = () => reject(new Error('Sem conexão com o servidor. Tente novamente.'));
    xhr.onload = () => {
      let data = {};
      try { data = JSON.parse(xhr.responseText); } catch { /* resposta sem JSON */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(data);
      handleAuthError(xhr.status, 'cover');
      reject(new Error(data.error || `Erro ${xhr.status}`));
    };
    xhr.send(form);
  });
}
async function getGames(force = false) {
  if (!state.games || force) state.games = await api('games');
  return state.games;
}
function setUser(user) {
  state.user = user;
  try { user ? localStorage.setItem('gamevault_user', JSON.stringify(user)) : localStorage.removeItem('gamevault_user'); } catch { /* armazenamento bloqueado */ }
  renderChrome(parseRoute(location.hash).path);
}

// ---------- Componentes de marcação ----------
const coverImg = (game, cls = '', alt = '') => `<span class="cover ${cls}" style="--cover:${esc(game.color || '#2a2350')}"><span class="cover-fallback" aria-hidden="true">${esc(game.image || '🎮')}</span>${game.cover ? `<img src="${esc(game.cover)}" alt="${esc(alt)}" loading="lazy" onerror="this.remove()">` : ''}</span>`;
const gameCard = (game, extra = '') => `<a class="game-card" href="#/jogo/${encodeURIComponent(game.id)}">${coverImg(game)}${game.featured ? `<span class="badge">${ic('star', 'icon-fill')} Destaque</span>` : ''}<span class="game-card-body"><strong>${esc(game.title)}</strong><small>${esc(game.category)} · ${esc(game.year)}</small>${extra}</span></a>`;
const pill = status => { const [label, tone] = statusInfo(status); return `<span class="pill pill-${tone}">${esc(label)}</span>`; };
const stars = n => `<span class="stars-read" aria-label="${n} de 5 estrelas">${'★'.repeat(n)}<span aria-hidden="true">${'★'.repeat(5 - n)}</span></span>`;
const shelf = (title, games, href) => games.length ? `<section class="section"><div class="section-head"><h2>${esc(title)}</h2>${href ? `<a class="link" href="${href}">Ver tudo</a>` : ''}</div><div class="shelf">${games.map(game => gameCard(game)).join('')}</div></section>` : '';
const pageHead = (title, subtitle = '', action = '') => `<header class="page-head"><div><h1>${title}</h1>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${action}</header>`;
const emptyState = ({ icon = 'search', title, text = '', actions = '', tone = '' }) => `<div class="state ${tone}"><span class="state-icon">${ic(icon)}</span><h2>${esc(title)}</h2>${text ? `<p>${esc(text)}</p>` : ''}${actions ? `<div class="state-actions">${actions}</div>` : ''}</div>`;
const errorState = message => emptyState({ icon: 'alert', tone: 'state-error', title: 'Não foi possível carregar', text: message, actions: '<button class="btn btn-primary" data-retry>Tentar de novo</button>' });
const loginState = text => emptyState({ icon: 'user', title: 'Entre na sua conta', text, actions: '<button class="btn btn-primary" data-auth="login">Entrar</button><button class="btn btn-ghost" data-auth="register">Criar conta</button>' });
const skeletonCards = n => `<div class="game-grid">${'<div class="skeleton-card" aria-hidden="true"><span class="sk sk-cover"></span><span class="sk sk-line"></span><span class="sk sk-line short"></span></div>'.repeat(n)}</div>`;
const skeletonRows = n => `<div class="stack">${'<div class="sk sk-row" aria-hidden="true"></div>'.repeat(n)}</div>`;
const loading = (html, label = 'Carregando…') => `<div aria-busy="true"><span class="sr-only">${label}</span>${html}</div>`;
const field = (label, input) => `<label class="field"><span>${label}</span>${input}</label>`;
const chipLink = (label, active, href) => `<a class="chip${active ? ' is-active' : ''}" href="${href}"${active ? ' aria-current="true"' : ''}>${esc(label)}</a>`;

function paint(token, html) {
  if (token !== state.token) return false;
  $('#view').innerHTML = html;
  return true;
}

// ---------- Moldura (sidebar, bottom nav, conta) ----------
function isActive(href, path) {
  if (href === '/') return path === '/';
  if (href === '/catalogo') return path === '/catalogo' || path.startsWith('/jogo/');
  if (href === '/admin') return path === '/admin';
  return path === href || path.startsWith(href + '/');
}
function renderChrome(path) {
  const user = state.user;
  const navLink = ([href, label, , icon], active) => `<a href="#${href}" class="nav-item"${active ? ' aria-current="page"' : ''}>${ic(icon)}<span>${label}</span></a>`;
  const main = NAV.filter(([href]) => !(isAdmin() && href === '/conta'));
  $('#sideNav').innerHTML = main.map(item => navLink(item, isActive(item[0], path))).join('') +
    (isAdmin() ? `<p class="nav-label">Administração</p>${ADMIN_NAV.map(([href, label, icon]) => navLink([href, label, '', icon], isActive(href, path))).join('')}` : '');
  const bottom = isAdmin() ? [...main, ['/admin', 'Admin', 'Admin', 'shield']] : NAV;
  $('#bottomNav').innerHTML = bottom.map(([href, , short, icon]) => {
    const active = href === '/admin' ? path.startsWith('/admin') : isActive(href, path);
    return `<a href="#${href}"${active ? ' aria-current="page"' : ''}>${ic(icon)}<span>${short}</span></a>`;
  }).join('');
  $('#sideAccount').innerHTML = user
    ? `<div class="account-card"><span class="avatar" aria-hidden="true">${esc(firstName(user.name).charAt(0).toUpperCase())}</span><span class="account-who"><strong>${esc(user.name)}</strong><small>${isAdmin() ? 'Administrador' : 'Jogador'}</small></span><button class="icon-btn" data-logout aria-label="Sair da conta">${ic('logout')}</button></div>`
    : `<div class="account-card account-card-guest"><p>Entre para pedir jogos emprestados e avaliar.</p><button class="btn btn-primary btn-block" data-auth="login">Entrar</button></div>`;
  const button = $('#accountBtn');
  button.innerHTML = user ? `<span class="avatar" aria-hidden="true">${esc(firstName(user.name).charAt(0).toUpperCase())}</span><span class="account-name">${esc(firstName(user.name))}</span>` : 'Entrar';
  button.className = user ? 'account-btn is-user' : 'account-btn';
  button.setAttribute('aria-label', user ? `${isAdmin() ? 'Abrir painel' : 'Abrir minha área'} (${user.name})` : 'Entrar');
}

// ---------- Rotas ----------
const ROUTES = [
  [/^\/$/, renderHome],
  [/^\/catalogo$/, renderCatalog],
  [/^\/jogo\/([^/]+)$/, renderGame],
  [/^\/curadoria$/, renderCuration],
  [/^\/conta$/, renderAccount],
  [/^\/admin(?:\/(emprestimos|jogos|avaliacoes))?$/, renderAdmin]
];
async function router() {
  const { path, params } = parseRoute(location.hash);
  const token = ++state.token;
  state.charts.forEach(chart => chart.destroy());
  state.charts = [];
  renderChrome(path);
  const search = $('#searchInput');
  if (document.activeElement !== search) search.value = path === '/catalogo' ? params.get('q') || '' : '';
  const route = ROUTES.find(([pattern]) => pattern.test(path));
  try {
    if (!route) return paint(token, emptyState({ title: 'Página não encontrada', text: 'Este endereço não existe no GameVault.', actions: '<a class="btn btn-primary" href="#/">Voltar ao início</a>' }));
    await route[1](token, path.match(route[0]).slice(1), params);
  } catch (error) {
    paint(token, errorState(error.message));
  }
}

async function renderHome(token) {
  paint(token, loading(`<div class="sk sk-hero"></div>${skeletonCards(5)}`));
  const games = await getGames();
  if (!games.length) return paint(token, emptyState({ icon: 'grid', title: 'O catálogo está vazio', text: 'Nenhum jogo foi cadastrado ainda.', actions: isAdmin() ? '<a class="btn btn-primary" href="#/admin/jogos">Cadastrar jogos</a>' : '' }));
  const featured = games.filter(game => game.featured);
  state.hero = (featured.length ? featured : games).slice(0, 6);
  state.heroIndex = 0;
  const recent = [...games].sort((a, b) => b.year - a.year).slice(0, 10);
  const categories = categoryCounts(games).slice(0, 6);
  paint(token, `
    <h1 class="sr-only">GameVault: descubra jogos</h1>
    <section class="spotlight" id="spotlightSection" tabindex="0" aria-roledescription="carrossel" aria-label="Jogos em destaque. Use as setas para trocar.">
      <div class="spotlight-stage" id="spotlight" aria-live="polite"></div>
      <div class="spotlight-rail" role="tablist" aria-label="Escolher destaque">${state.hero.map((game, index) => `<button type="button" role="tab" class="spot-thumb" data-hero="${index}" aria-label="Destaque ${index + 1}: ${esc(game.title)}">${coverImg(game, 'thumb')}<span>${esc(game.title)}</span></button>`).join('')}</div>
    </section>
    ${shelf('Em destaque', featured.slice(0, 10), catalogHref('', { destaque: '1' }))}
    ${shelf('Lançamentos mais recentes', recent, catalogHref('', { ordem: 'recentes' }))}
    <section class="section"><div class="section-head"><h2>Navegue por categoria</h2></div>
      <div class="category-grid">${categories.map(([name, count], index) => `<a class="category-tile tile-${index % 6}" href="${catalogHref('', { categoria: name })}"><strong>${esc(name)}</strong><span>${count} jogo${count > 1 ? 's' : ''}</span></a>`).join('')}</div>
    </section>
    <section class="curation-cta">${ic('spark')}<div><h2>Não sabe o que jogar?</h2><p>Conte seu clima, como “curto, cooperativo e sem terror”, e a curadoria sugere jogos do catálogo.</p></div><a class="btn btn-primary" href="#/curadoria">Pedir sugestão</a></section>`);
  setHero(0);
  const section = $('#spotlightSection');
  section.onkeydown = event => { if (event.key === 'ArrowLeft') setHero(state.heroIndex - 1); if (event.key === 'ArrowRight') setHero(state.heroIndex + 1); };
  section.ontouchstart = event => { section.dataset.x = event.changedTouches[0].clientX; };
  section.ontouchend = event => { const delta = Number(section.dataset.x) - event.changedTouches[0].clientX; if (Math.abs(delta) > 45) setHero(state.heroIndex + (delta > 0 ? 1 : -1)); };
}
function setHero(index) {
  const total = state.hero.length;
  if (!total || !$('#spotlight')) return;
  state.heroIndex = (index + total) % total;
  const game = state.hero[state.heroIndex];
  $('#spotlight').innerHTML = `${coverImg(game, 'spotlight-art')}<div class="spotlight-copy">
    <p class="eyebrow">Em destaque · ${String(state.heroIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</p>
    <h2>${esc(game.title)}</h2><p class="meta">${esc(game.year)} · ${esc(game.category)} · ${esc(game.platform)}</p>
    ${game.description ? `<p class="spotlight-text">${esc(game.description)}</p>` : ''}
    <div class="actions"><a class="btn btn-primary" href="#/jogo/${encodeURIComponent(game.id)}">${isAdmin() ? 'Ver jogo' : 'Pedir emprestado'}</a><a class="btn btn-ghost" href="${catalogHref('', { destaque: '1' })}">Mais destaques</a></div></div>`;
  $$('[data-hero]').forEach((button, i) => button.setAttribute('aria-selected', String(i === state.heroIndex)));
}

async function renderCatalog(token, _, params) {
  const q = params.get('q') || '';
  const featured = params.get('destaque') === '1';
  const category = params.get('categoria') || '';
  const sort = params.get('ordem') || 'relevancia';
  paint(token, pageHead('Catálogo', 'Carregando jogos…') + loading(skeletonCards(8)));
  const [all, found] = await Promise.all([getGames(), api(`games?q=${encodeURIComponent(q)}&featured=${featured}`)]);
  const list = sortGames(found, { category, sort });
  const filtered = q || featured || category;
  const summary = `${list.length} jogo${list.length === 1 ? '' : 's'}${q ? ` para “${esc(q)}”` : ''}${category ? ` em ${esc(category)}` : ''}`;
  const sorts = [['relevancia', 'Relevância'], ['az', 'Título (A–Z)'], ['recentes', 'Mais recentes'], ['antigos', 'Mais antigos']];
  paint(token, pageHead('Catálogo', summary) + `
    <div class="catalog">
      <aside class="filters" aria-label="Filtros do catálogo">
        <div class="filter-group"><h2>Exibir</h2><div class="chips">${chipLink('Todos', !featured, catalogHref(params, { destaque: '' }))}${chipLink('★ Destaques', featured, catalogHref(params, { destaque: '1' }))}</div></div>
        <div class="filter-group"><h2>Categoria</h2><div class="chips">${chipLink('Todas', !category, catalogHref(params, { categoria: '' }))}${categoryCounts(all).map(([name]) => chipLink(name, name === category, catalogHref(params, { categoria: name }))).join('')}</div></div>
        <div class="filter-group filter-sort"><label for="sortSelect"><h2>Ordenar</h2></label><select id="sortSelect" data-sort>${sorts.map(([value, label]) => `<option value="${value}"${value === sort ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
        ${filtered ? '<a class="link" href="#/catalogo">Limpar filtros</a>' : ''}
      </aside>
      <div class="results">${list.length ? `<div class="game-grid">${list.map(game => gameCard(game)).join('')}</div>` : emptyState({ title: 'Nenhum jogo encontrado', text: 'Tente outro termo, troque a categoria ou peça uma sugestão à curadoria.', actions: '<a class="btn btn-ghost" href="#/catalogo">Limpar filtros</a><a class="btn btn-primary" href="#/curadoria">Pedir à curadoria</a>' })}</div>
    </div>`);
}

async function renderGame(token, [rawId]) {
  const id = decodeURIComponent(rawId);
  paint(token, loading('<div class="sk sk-hero"></div>' + skeletonRows(3)));
  let game = (await getGames()).find(item => item.id === id);
  if (!game) game = (await getGames(true)).find(item => item.id === id);
  if (!game) return paint(token, emptyState({ title: 'Jogo não encontrado', text: 'Ele pode ter sido removido do catálogo.', actions: '<a class="btn btn-primary" href="#/catalogo">Ver catálogo</a>' }));
  const related = state.games.filter(item => item.id !== id && item.category === game.category).slice(0, 8);
  const facts = [['clock', 'Sessão', game.duration], ['users', 'Jogadores', game.players], ['shield', 'Classificação', game.age], ['chart', 'Dificuldade', game.level]].filter(([, , value]) => value);
  paint(token, `<article class="detail">
    <div class="detail-backdrop" aria-hidden="true">${coverImg(game)}</div>
    <nav class="crumbs" aria-label="Você está em"><a href="#/catalogo">Catálogo</a><span aria-hidden="true">/</span><a href="${catalogHref('', { categoria: game.category })}">${esc(game.category)}</a><span aria-hidden="true">/</span><span aria-current="page">${esc(game.title)}</span></nav>
    <div class="detail-body">
      <header class="detail-head">
        ${coverImg(game, 'detail-cover', `Capa de ${game.title}`)}
        <div><div class="chips"><span class="chip">${esc(game.category)}</span><span class="chip">${esc(game.platform)}</span><span class="chip">${esc(game.year)}</span>${game.featured ? `<span class="chip is-active">${ic('star', 'icon-fill')} Destaque</span>` : ''}</div>
        <h1>${esc(game.title)}</h1></div>
      </header>
      <aside class="action-panel" aria-label="Ações do jogo">${actionPanel(game)}</aside>
      <div class="detail-main">
        ${game.description ? `<p class="lead">${esc(game.description)}</p>` : ''}
        ${game.ai && game.ai !== game.description ? `<aside class="ai-tip">${ic('spark')}<div><strong>Dica da curadoria</strong><p>${esc(game.ai)}</p></div></aside>` : ''}
        ${facts.length ? `<dl class="facts">${facts.map(([icon, label, value]) => `<div>${ic(icon)}<dt>${label}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>` : ''}
      </div>
    </div>
    ${shelf(`Mais em ${game.category}`, related, catalogHref('', { categoria: game.category }))}
  </article>`);
}
function actionPanel(game) {
  const id = esc(game.id);
  if (!state.user) return `<h2>Pedir emprestado</h2><p>Entre ou crie uma conta para pedir este jogo e avaliar.</p><button class="btn btn-primary btn-block" data-auth="login">Entrar</button><button class="btn btn-ghost btn-block" data-auth="register">Criar conta</button>`;
  if (isAdmin()) return `<h2>Gerenciar jogo</h2><p>Atualize os dados, troque a capa ou remova do catálogo.</p><button class="btn btn-primary btn-block" data-edit-game="${id}">Editar dados</button><button class="btn btn-ghost btn-block" data-cover="${id}">${ic('upload')} Trocar capa</button><button class="btn btn-danger btn-block" data-delete-game="${id}">Excluir jogo</button>`;
  return `<h2>Pedir emprestado</h2><p>Escolha a data de retirada. O administrador aprova o pedido e você acompanha em Minha área.</p>
    <form id="bookingForm" data-game="${id}" class="stack">${field('Data de retirada', `<input type="date" name="date" min="${todayUTC()}" value="${todayUTC()}" required>`)}<button class="btn btn-primary btn-block">Solicitar empréstimo</button></form>
    <hr><button class="btn btn-ghost btn-block" data-review="${id}">${ic('star')} Avaliar este jogo</button>`;
}

function renderCuration(token) {
  paint(token, pageHead('Curadoria IA', 'Descreva o que você quer jogar e receba até três sugestões do catálogo.') + `
    <form class="curation-form" id="curationForm">
      <label class="sr-only" for="mood">Como você quer jogar hoje?</label>
      <textarea id="mood" name="mood" rows="3" maxlength="500" required placeholder="Ex.: curto, cooperativo e sem terror"></textarea>
      <div class="chips" aria-label="Sugestões de pedido">${PRESETS.map(text => `<button type="button" class="chip" data-preset="${esc(text)}">${esc(text)}</button>`).join('')}</div>
      <button class="btn btn-primary">${ic('spark')} Sugerir jogos</button>
    </form>
    <div id="curationResult" aria-live="polite"></div>`);
}
async function submitCuration(form) {
  const result = $('#curationResult');
  const button = form.querySelector('button:not([type=button])');
  button.disabled = true;
  result.innerHTML = loading(`<div class="sk sk-row"></div>${skeletonCards(3)}`, 'Consultando a curadoria…');
  try {
    const [data, catalog] = await Promise.all([api('ai', { method: 'POST', body: { mood: form.mood.value } }), getGames()]);
    // /api/ai não resolve capas; o catálogo (GET /games) já traz a URL final.
    const withCover = game => ({ ...game, cover: catalog.find(item => item.id === game.id)?.cover || game.cover });
    result.innerHTML = `<div class="ai-answer"><span class="source">${ic('spark')} ${esc(data.source)}</span><p>${esc(data.answer)}</p></div>
      ${data.games.length ? `<div class="game-grid">${data.games.map(game => gameCard(withCover(game), game.recommendationReason ? `<em>${esc(game.recommendationReason)}</em>` : '')).join('')}</div>` : ''}`;
  } catch (error) {
    result.innerHTML = `<p class="form-error" role="alert">${esc(error.message)}</p>`;
  } finally { button.disabled = false; }
}

async function renderAccount(token, _, params) {
  if (!state.user) return paint(token, loginState('Acompanhe seus empréstimos e avaliações em um só lugar.'));
  if (isAdmin()) return location.replace('#/admin');
  paint(token, pageHead(`Olá, ${esc(firstName(state.user.name))}`) + loading(skeletonRows(4)));
  const [data, games] = await Promise.all([api('me'), getGames()]);
  const tab = params.get('aba') === 'avaliacoes' ? 'avaliacoes' : 'emprestimos';
  const bookings = data.bookings.slice().reverse();
  const count = status => bookings.filter(item => item.status === status).length;
  const gameOf = id => games.find(game => game.id === id) || { title: 'Jogo removido' };
  const bookingRow = item => `<article class="row-card">
      ${coverImg(gameOf(item.gameId), 'thumb')}
      <div class="row-main"><strong>${esc(item.game || 'Jogo removido')}</strong><div class="row-meta">${pill(item.status)}<span>Retirada em ${esc(formatDate(item.date))}</span></div></div>
      ${item.status === 'Solicitado' ? `<button class="btn btn-danger btn-sm" data-cancel-booking="${esc(item.id)}">Cancelar pedido</button>` : ''}
      ${item.status === 'Confirmada' ? `<button class="btn btn-primary btn-sm" data-return-booking="${esc(item.id)}">Devolver</button>` : ''}
    </article>`;
  const reviewRow = item => `<article class="row-card review-card"><div class="row-main"><strong>${esc(item.game || 'Jogo removido')}</strong>${stars(item.rating)}<p>${esc(item.comment)}</p>${item.reply ? `<p class="reply"><b>Resposta do GameVault:</b> ${esc(item.reply)}</p>` : ''}</div></article>`;
  paint(token, pageHead(`Olá, ${esc(firstName(data.client.name))}`, esc(data.client.email), '<button class="btn btn-ghost" data-logout>Sair da conta</button>') + `
    <div class="stats">
      <div class="stat"><small>Aguardando aprovação</small><strong class="tone-info">${count('Solicitado')}</strong></div>
      <div class="stat"><small>Emprestados agora</small><strong class="tone-success">${count('Confirmada')}</strong></div>
      <div class="stat"><small>Avaliações</small><strong class="tone-accent">${data.reviews.length}</strong></div>
    </div>
    <div class="toolbar"><nav class="chips" aria-label="Seções da conta">${chipLink('Empréstimos', tab === 'emprestimos', '#/conta')}${chipLink('Minhas avaliações', tab === 'avaliacoes', '#/conta?aba=avaliacoes')}</nav><button class="btn btn-ghost" data-review="">${ic('star')} Nova avaliação</button></div>
    ${tab === 'emprestimos'
      ? (bookings.length ? `<div class="stack">${bookings.map(bookingRow).join('')}</div>` : emptyState({ icon: 'calendar', title: 'Você ainda não pediu jogos', text: 'Escolha um jogo no catálogo e solicite o empréstimo.', actions: '<a class="btn btn-primary" href="#/catalogo">Explorar catálogo</a>' }))
      : (data.reviews.length ? `<div class="stack">${data.reviews.slice().reverse().map(reviewRow).join('')}</div>` : emptyState({ icon: 'star', title: 'Nenhuma avaliação ainda', text: 'Conte como foi a partida e ajude outros jogadores.', actions: '<button class="btn btn-primary" data-review="">Avaliar um jogo</button>' }))}`);
}

// ---------- Admin ----------
const adminTabs = active => `<nav class="admin-tabs chips" aria-label="Seções do admin">${ADMIN_NAV.map(([href, label]) => chipLink(label, href === active, '#' + href)).join('')}</nav>`;
async function renderAdmin(token, [section], params) {
  if (!state.user) return paint(token, loginState('Entre com a conta de administrador.'));
  if (!isAdmin()) return paint(token, emptyState({ icon: 'shield', title: 'Área restrita', text: 'Apenas administradores acessam o painel.', actions: '<a class="btn btn-primary" href="#/conta">Ir para minha área</a>' }));
  const view = { emprestimos: adminBookings, jogos: adminGames, avaliacoes: adminReviews }[section] || adminDashboard;
  await view(token, params);
}
async function adminDashboard(token) {
  const head = pageHead('Painel', 'Visão geral do acervo, pedidos e avaliações') + adminTabs('/admin');
  paint(token, head + loading(`<div class="stats">${'<div class="sk sk-stat"></div>'.repeat(4)}</div>${skeletonRows(2)}`));
  const data = await api('dashboard');
  const pending = data.recent.filter(item => item.status === 'Solicitado').slice(-5).reverse();
  const recent = data.recent.slice(-6).reverse();
  if (!paint(token, head + `
    <div class="stats">
      <div class="stat"><small>Jogos no catálogo</small><strong>${data.games}</strong></div>
      <a class="stat" href="#/admin/emprestimos"><small>Aguardando aprovação</small><strong class="tone-info">${data.pendingBookings || 0}</strong></a>
      <div class="stat"><small>Empréstimos</small><strong class="tone-success">${data.bookings}</strong></div>
      <div class="stat"><small>Avaliações</small><strong class="tone-accent">${data.reviews}</strong></div>
      <div class="stat"><small>Clientes</small><strong>${data.clients}</strong></div>
    </div>
    <div class="chart-grid">
      <section class="panel chart-wide"><div class="panel-head"><h2>Empréstimos por jogo</h2><button type="button" class="chip" id="barToggle" aria-pressed="false">Ver horizontal</button></div><div class="chart-frame"><canvas id="chartBookings" aria-label="Gráfico de empréstimos por jogo" role="img"></canvas></div></section>
      <section class="panel"><div class="panel-head"><h2>Jogos por categoria</h2></div><div class="chart-frame"><canvas id="chartCategories" aria-label="Gráfico de jogos por categoria" role="img"></canvas></div></section>
      <section class="panel chart-wide"><div class="panel-head"><h2>Média das avaliações</h2><span class="muted">de 1 a 5</span></div><div class="chart-frame chart-short"><canvas id="chartRatings" aria-label="Gráfico da nota média por jogo" role="img"></canvas></div></section>
      <section class="panel"><div class="panel-head"><h2>Aguardando aprovação</h2><a class="link" href="#/admin/emprestimos">Ver todos</a></div>
        ${pending.length ? pending.map(item => `<div class="queue-row"><div><strong>${esc(item.game || 'Jogo removido')}</strong><small>${esc(item.client || 'Cliente')} · ${esc(formatDate(item.date))}</small></div><div class="actions"><button class="btn btn-danger btn-sm" data-decide="${esc(item.id)}" data-status="Recusado">Recusar</button><button class="btn btn-primary btn-sm" data-decide="${esc(item.id)}" data-status="Confirmada">Autorizar</button></div></div>`).join('') : '<p class="muted">Nenhum pedido pendente. ✓</p>'}
      </section>
    </div>
    <section class="panel"><div class="panel-head"><h2>Atividade recente</h2></div>${recent.length ? recent.map(item => `<div class="queue-row"><div><strong>${esc(item.client || 'Cliente')}</strong><small>${esc(item.game || 'Jogo')} · ${esc(formatDate(item.date))}</small></div>${pill(item.status)}</div>`).join('') : '<p class="muted">Ainda não há empréstimos registrados.</p>'}</section>`)) return;
  drawCharts(data);
}
function drawCharts(data) {
  if (typeof Chart === 'undefined') { $$('.chart-frame').forEach(frame => { frame.innerHTML = '<p class="muted">Gráficos indisponíveis: o Chart.js não carregou.</p>'; }); return; }
  const css = getComputedStyle(document.documentElement);
  const token = name => css.getPropertyValue(name).trim();
  const palette = ['--accent', '--violet-text', '--info', '--success', '--pink', '--sky', '--danger'].map(token);
  Chart.defaults.color = token('--muted');
  Chart.defaults.borderColor = token('--line');
  Chart.defaults.font.family = 'Manrope, system-ui, sans-serif';
  const base = { responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, plugins: { legend: { display: false } } };
  const top = data.gameStats.slice(0, 8);
  const categoryAxis = { type: 'category', grid: { display: false } };
  const valueAxis = { type: 'linear', beginAtZero: true, ticks: { precision: 0 } };
  const scales = { x: categoryAxis, y: valueAxis };
  // Barras no gradiente da marca; acompanha a orientação (colunas ou horizontal).
  const barFill = ({ chart }) => {
    const { ctx, chartArea: area } = chart;
    if (!area) return token('--accent-strong');
    const fill = chart.options.indexAxis === 'y' ? ctx.createLinearGradient(area.left, 0, area.right, 0) : ctx.createLinearGradient(0, area.bottom, 0, area.top);
    fill.addColorStop(0, token('--violet'));
    fill.addColorStop(1, token('--accent-strong'));
    return fill;
  };
  const bar = new Chart($('#chartBookings'), { type: 'bar', data: { labels: top.map(item => item.title), datasets: [{ label: 'Empréstimos', data: top.map(item => item.bookings), backgroundColor: barFill, borderRadius: 6, maxBarThickness: 36 }] }, options: { ...base, scales } });
  $('#barToggle').onclick = event => {
    const horizontal = bar.options.indexAxis !== 'y';
    bar.options.indexAxis = horizontal ? 'y' : 'x';
    bar.options.scales = horizontal ? { x: valueAxis, y: categoryAxis } : scales;
    event.currentTarget.textContent = horizontal ? 'Ver colunas' : 'Ver horizontal';
    event.currentTarget.setAttribute('aria-pressed', String(horizontal));
    bar.update();
  };
  const categories = Object.entries(data.categoryStats).sort((a, b) => b[1] - a[1]);
  const other = categories.slice(6).reduce((sum, [, n]) => sum + n, 0);
  const doughnut = new Chart($('#chartCategories'), { type: 'doughnut', data: { labels: categories.slice(0, 6).map(([name]) => name).concat(other ? ['Outras'] : []), datasets: [{ data: categories.slice(0, 6).map(([, n]) => n).concat(other ? [other] : []), backgroundColor: palette, borderColor: token('--surface'), borderWidth: 3 }] }, options: { ...base, cutout: '64%', plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, padding: 12 } } } } });
  const rated = data.gameStats.filter(item => Number(item.avgRating) > 0).slice(0, 10);
  state.charts.push(bar, doughnut);
  if (!rated.length) { $('#chartRatings').replaceWith(Object.assign(document.createElement('p'), { className: 'muted', textContent: 'Ainda não há avaliações para comparar.' })); return; }
  state.charts.push(new Chart($('#chartRatings'), { type: 'line', data: { labels: rated.map(item => item.title), datasets: [{ label: 'Nota média', data: rated.map(item => Number(item.avgRating)), borderColor: token('--accent'), backgroundColor: 'rgba(255, 92, 154, 0.14)', pointBackgroundColor: token('--accent'), tension: 0.3, fill: true }] }, options: { ...base, scales: { x: { grid: { display: false } }, y: { min: 0, max: 5, ticks: { stepSize: 1 } } } } }));
}

async function adminBookings(token, params) {
  const head = pageHead('Empréstimos', 'Aprove ou recuse pedidos. O empréstimo só vale depois da sua autorização.') + adminTabs('/admin/emprestimos');
  paint(token, head + loading(skeletonRows(4)));
  const [bookings, games] = await Promise.all([api('bookings'), getGames()]);
  const list = bookings.slice().reverse();
  const gameOf = id => games.find(game => game.id === id) || { title: 'Jogo removido' };
  const pending = list.filter(item => item.status === 'Solicitado');
  const filter = params.get('status') || '';
  const history = list.filter(item => item.status !== 'Solicitado' && (!filter || item.status === filter));
  const filterLink = (label, value) => chipLink(label, filter === value, `#/admin/emprestimos${value ? `?status=${encodeURIComponent(value)}` : ''}`);
  paint(token, head + `
    <section class="section"><div class="section-head"><h2>Aguardando aprovação <span class="count">${pending.length}</span></h2></div>
      ${pending.length ? `<div class="stack">${pending.map(item => `<article class="row-card">${coverImg(gameOf(item.gameId), 'thumb')}<div class="row-main"><strong>${esc(item.game)}</strong><div class="row-meta"><span>${esc(item.client)}${item.clientEmail ? ` · ${esc(item.clientEmail)}` : ''}</span><span>Retirada em ${esc(formatDate(item.date))}</span></div></div><div class="actions"><button class="btn btn-danger btn-sm" data-decide="${esc(item.id)}" data-status="Recusado">Recusar</button><button class="btn btn-primary btn-sm" data-decide="${esc(item.id)}" data-status="Confirmada">Autorizar</button></div></article>`).join('')}</div>`
        : emptyState({ icon: 'check', title: 'Nenhum pedido pendente', text: 'Novas solicitações aparecem aqui para sua autorização.' })}
    </section>
    <section class="section"><div class="section-head"><h2>Histórico</h2></div>
      <nav class="chips" aria-label="Filtrar histórico">${filterLink('Todos', '')}${['Confirmada', 'Recusado', 'Devolvido', 'Cancelado'].map(status => filterLink(statusInfo(status)[0], status)).join('')}</nav>
      ${history.length ? `<div class="stack">${history.map(item => `<article class="row-card"><div class="row-main"><strong>${esc(item.game)}</strong><div class="row-meta"><span>${esc(item.client)} · ${esc(formatDate(item.date))}</span></div></div>${pill(item.status)}</article>`).join('')}</div>` : '<p class="muted">Nenhum registro neste filtro.</p>'}
    </section>`);
}

async function adminGames(token) {
  const head = pageHead('Jogos', 'Cadastre, edite, troque capas e importe da Steam.', `<button class="btn btn-primary" data-new-game>${ic('plus')} Novo jogo</button>`) + adminTabs('/admin/jogos');
  paint(token, head + loading(skeletonRows(5)));
  const games = await getGames(true);
  paint(token, head + `
    <section class="panel steam">
      <div class="panel-head"><h2>Importar da Steam</h2></div>
      <p class="muted">Busque um título e traga nome, descrição, ano e capa com um clique.</p>
      <form class="inline-form" id="steamForm" role="search">${field('Buscar na Steam', '<input name="query" minlength="2" maxlength="80" required placeholder="Ex.: Hollow Knight">')}<button class="btn btn-primary">Buscar</button></form>
      <div id="steamResults" aria-live="polite"></div>
    </section>
    <div class="toolbar">${field('Filtrar tabela', '<input id="tableFilter" type="search" placeholder="Título, categoria ou plataforma">')}<span class="muted" id="tableSummary" aria-live="polite"></span></div>
    <p class="muted" id="tableNote"></p>
    <div id="gamesTable">${skeletonRows(4)}</div>
    <div class="pagination"><button class="btn btn-ghost btn-sm" id="pagePrev">Anterior</button><span id="pageStatus"></span><button class="btn btn-ghost btn-sm" id="pageNext">Próxima</button><label class="page-size">Linhas <select id="pageSize"><option>5</option><option selected>10</option><option>20</option></select></label></div>`);
  initializeGamesTable(games, token);
}
function tableHtml(rows, sortedBy = () => false) {
  const cols = [['title', 'Jogo'], ['category', 'Categoria'], ['platform', 'Plataforma'], ['year', 'Ano']];
  const head = cols.map(([id, label]) => { const sorted = sortedBy(id); return `<th scope="col" aria-sort="${sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}"><button type="button" class="th-sort" data-sort-col="${id}">${label}<span aria-hidden="true">${sorted === 'asc' ? ' ↑' : sorted === 'desc' ? ' ↓' : ' ↕'}</span></button></th>`; }).join('');
  const body = rows.length ? rows.map(game => `<tr>
      <td data-label="Jogo"><span class="cell-game">${coverImg(game, 'thumb')}<a href="#/jogo/${encodeURIComponent(game.id)}">${esc(game.title)}</a></span></td>
      <td data-label="Categoria">${esc(game.category)}</td><td data-label="Plataforma">${esc(game.platform)}</td><td data-label="Ano">${esc(game.year)}</td>
      <td class="cell-actions"><button class="btn btn-ghost btn-sm" data-edit-game="${esc(game.id)}">Editar</button><button class="btn btn-ghost btn-sm" data-cover="${esc(game.id)}">Capa</button><button class="btn btn-danger btn-sm" data-delete-game="${esc(game.id)}">Excluir</button></td>
    </tr>`).join('') : '<tr><td colspan="5" class="table-empty">Nenhum jogo corresponde ao filtro.</td></tr>';
  return `<table class="data-table"><caption class="sr-only">Catálogo de jogos</caption><thead><tr>${head}<th scope="col"><span class="sr-only">Ações</span></th></tr></thead><tbody>${body}</tbody></table>`;
}
async function initializeGamesTable(games, token) {
  let core = null;
  try { core = await import('https://esm.sh/@tanstack/table-core@8.21.3'); } catch (error) { console.error('TanStack Table indisponível:', error); }
  if (token !== state.token) return;
  const host = $('#gamesTable');
  const filter = $('#tableFilter');
  if (!core) {
    // shortcut: sem o TanStack, a tabela mostra tudo sem ordenar/paginar; vale enquanto o catálogo for pequeno.
    $('#tableNote').textContent = 'Ordenação e paginação indisponíveis (TanStack Table não carregou). Mostrando todos os jogos.';
    $('.pagination').hidden = true;
    const draw = () => { const q = filter.value.toLowerCase(); const rows = games.filter(game => `${game.title} ${game.category} ${game.platform}`.toLowerCase().includes(q)); host.innerHTML = tableHtml(rows); $('#tableSummary').textContent = `${rows.length} jogo(s)`; };
    filter.oninput = draw;
    return draw();
  }
  const { createTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel, getPaginationRowModel } = core;
  let tableState = {};
  const resolve = (updater, previous) => typeof updater === 'function' ? updater(previous) : updater;
  const table = createTable({
    data: games,
    columns: ['title', 'category', 'platform', 'year'].map(accessorKey => ({ accessorKey })),
    state: {}, globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(), getFilteredRowModel: getFilteredRowModel(), getSortedRowModel: getSortedRowModel(), getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: updater => update({ sorting: resolve(updater, tableState.sorting) }),
    onGlobalFilterChange: updater => update({ globalFilter: resolve(updater, tableState.globalFilter), pagination: { ...tableState.pagination, pageIndex: 0 } }),
    onPaginationChange: updater => update({ pagination: resolve(updater, tableState.pagination) })
  });
  function update(partial) { tableState = { ...tableState, ...partial }; table.setOptions(previous => ({ ...previous, state: tableState })); draw(); }
  function draw() {
    if (!document.body.contains(host)) return;
    const rows = table.getRowModel().rows.map(row => row.original);
    host.innerHTML = tableHtml(rows, id => table.getColumn(id).getIsSorted());
    const total = table.getFilteredRowModel().rows.length;
    const { pageIndex, pageSize } = table.getState().pagination;
    $('#tableSummary').textContent = total ? `Mostrando ${pageIndex * pageSize + 1}–${pageIndex * pageSize + rows.length} de ${total}` : 'Nenhum resultado';
    $('#pageStatus').textContent = `Página ${pageIndex + 1} de ${Math.max(table.getPageCount(), 1)}`;
    $('#pagePrev').disabled = !table.getCanPreviousPage();
    $('#pageNext').disabled = !table.getCanNextPage();
  }
  host.onclick = event => { const button = event.target.closest('[data-sort-col]'); if (button) table.getColumn(button.dataset.sortCol).toggleSorting(); };
  filter.oninput = () => table.setGlobalFilter(filter.value);
  $('#pagePrev').onclick = () => table.previousPage();
  $('#pageNext').onclick = () => table.nextPage();
  $('#pageSize').onchange = event => table.setPageSize(Number(event.target.value));
  update({ ...table.initialState, sorting: [], globalFilter: '', pagination: { pageIndex: 0, pageSize: 10 } });
}
async function searchSteam(form) {
  const result = $('#steamResults');
  result.innerHTML = loading(skeletonRows(2), 'Buscando na Steam…');
  try {
    const data = await api(`catalog/steam?q=${encodeURIComponent(form.query.value.trim())}`);
    state.steam = data.games;
    const titles = new Set((state.games || []).map(game => game.title.toLowerCase()));
    result.innerHTML = data.games.length ? `<div class="steam-results">${data.games.map((game, index) => {
      const added = titles.has(game.title.toLowerCase());
      return `<article class="steam-result"><img src="${esc(game.cover)}" alt="" loading="lazy"><div><strong>${esc(game.title)}</strong><a class="link" href="${esc(game.storeUrl)}" target="_blank" rel="noopener noreferrer">Ver na Steam ↗</a></div><button class="btn ${added ? 'btn-ghost' : 'btn-primary'} btn-sm" data-steam="${index}"${added ? ' disabled' : ''}>${added ? 'Já no catálogo' : '+ Importar'}</button></article>`;
    }).join('')}</div>` : '<p class="muted">Nenhum jogo encontrado na Steam.</p>';
  } catch (error) { result.innerHTML = `<p class="form-error" role="alert">${esc(error.message)}</p>`; }
}
async function importSteam(button) {
  const game = state.steam[Number(button.dataset.steam)];
  button.disabled = true;
  button.textContent = 'Importando…';
  try {
    const imported = await api('catalog/steam/import', { method: 'POST', body: { appId: game.appId } });
    button.textContent = imported.alreadyImported ? 'Já importado' : 'Importado ✓';
    button.className = 'btn btn-ghost btn-sm';
    toast(imported.alreadyImported ? `${imported.title} já estava no catálogo.` : `${imported.title} foi importado.`);
    const games = await getGames(true);
    if (parseRoute(location.hash).path === '/admin/jogos') initializeGamesTable(games, state.token);
  } catch (error) {
    button.disabled = false;
    button.textContent = '+ Importar';
    toast(error.message, 'danger');
  }
}

async function adminReviews(token, params) {
  const head = pageHead('Avaliações', 'Leia o que os jogadores acharam e responda.') + adminTabs('/admin/avaliacoes');
  paint(token, head + loading(skeletonRows(3)));
  const all = (await api('reviews')).slice().reverse();
  const onlyOpen = params.get('filtro') === 'sem-resposta';
  const list = onlyOpen ? all.filter(item => !item.reply) : all;
  paint(token, head + `<nav class="chips" aria-label="Filtrar avaliações">${chipLink('Todas', !onlyOpen, '#/admin/avaliacoes')}${chipLink(`Sem resposta (${all.filter(item => !item.reply).length})`, onlyOpen, '#/admin/avaliacoes?filtro=sem-resposta')}</nav>
    ${list.length ? `<div class="stack">${list.map(item => `<article class="row-card review-card"><div class="row-main">
      <strong>${esc(item.game || 'Jogo removido')}</strong>${stars(item.rating)}<small class="muted">${esc(item.client || 'Cliente')}</small><p>${esc(item.comment)}</p>
      <form class="reply-form" data-reply="${esc(item.id)}">${field('Resposta', `<textarea name="reply" rows="2" placeholder="Escreva uma resposta para o jogador…">${esc(item.reply)}</textarea>`)}<div class="actions">${item.reply ? '<button type="button" class="btn btn-ghost btn-sm" data-clear-reply>Remover resposta</button>' : ''}<button class="btn btn-primary btn-sm">Salvar resposta</button></div></form>
    </div></article>`).join('')}</div>` : emptyState({ icon: 'star', title: onlyOpen ? 'Tudo respondido' : 'Nenhuma avaliação ainda', text: 'As avaliações dos jogadores aparecem aqui.' })}`);
}

// ---------- Sheets, confirmação e toasts ----------
function openSheet(html) {
  const dialog = $('#sheet');
  $('#sheetBody').innerHTML = html;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('input:not([type=hidden]), select, textarea')?.focus();
}
const closeSheet = () => $('#sheet').open && $('#sheet').close();
function confirmAction({ title, text, ok = 'Confirmar', danger = false }) {
  const dialog = $('#confirm');
  $('#confirmTitle').textContent = title;
  $('#confirmText').textContent = text;
  $('#confirmOk').textContent = ok;
  $('#confirmOk').className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  dialog.returnValue = '';
  dialog.showModal();
  // submit é síncrono; close (Esc) fica como fallback.
  return new Promise(resolve => {
    const form = dialog.querySelector('form');
    const done = ok => { form.removeEventListener('submit', onSubmit); dialog.removeEventListener('close', onClose); resolve(ok); };
    const onSubmit = event => done(event.submitter?.value === 'ok');
    const onClose = () => done(dialog.returnValue === 'ok');
    form.addEventListener('submit', onSubmit);
    dialog.addEventListener('close', onClose);
  });
}
function toast(message, kind = 'success', link) {
  const item = document.createElement('div');
  item.className = `toast toast-${kind}`;
  item.innerHTML = `${ic(kind === 'danger' ? 'alert' : 'check')}<span>${esc(message)}</span>${link ? `<a href="${link.href}">${esc(link.label)}</a>` : ''}`;
  $('#toasts').append(item);
  setTimeout(() => item.remove(), 5000);
}
function setBusy(form, busy, label) {
  const button = form.querySelector('button:not([type=button])');
  if (!button) return;
  if (busy) { button.dataset.label = button.textContent; button.textContent = label; } else if (button.dataset.label) button.textContent = button.dataset.label;
  button.disabled = busy;
}
const showFormError = (form, message) => { const box = form.querySelector('.form-error'); box.textContent = message; box.hidden = !message; };

function openAuth(mode = 'login', message = '') {
  const login = mode === 'login';
  openSheet(`<h2 id="sheetTitle">${login ? 'Bom te ver por aqui' : 'Crie sua conta'}</h2>
    <p class="muted">${esc(message || (login ? 'Entre para pedir empréstimos e avaliar jogos.' : 'Leva um minuto. Depois é só escolher o jogo.'))}</p>
    <div class="segmented" role="group" aria-label="Tipo de acesso"><button type="button" data-auth="login" aria-pressed="${login}">Entrar</button><button type="button" data-auth="register" aria-pressed="${!login}">Criar conta</button></div>
    <form id="authForm" data-mode="${mode}" class="stack">
      ${login ? '' : field('Nome', '<input name="name" autocomplete="name" required>')}
      ${field('E-mail', '<input name="email" type="email" autocomplete="email" required placeholder="voce@email.com">')}
      ${field('Senha', `<input name="password" type="password" ${login ? 'autocomplete="current-password"' : 'autocomplete="new-password" minlength="6"'} required>`)}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-primary btn-block">${login ? 'Entrar' : 'Criar conta'}</button>
    </form>`);
}
async function submitAuth(form) {
  const body = Object.fromEntries(new FormData(form));
  if (form.dataset.mode === 'register') body.action = 'register';
  setBusy(form, true, 'Aguarde…');
  try {
    const session = await api('auth', { method: 'POST', body });
    setUser(session);
    closeSheet();
    toast(`Olá, ${firstName(session.name)}!`);
    router();
  } catch (error) { showFormError(form, error.message); setBusy(form, false); }
}

async function openReviewSheet(gameId = '') {
  const games = (await getGames()).slice().sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  openSheet(`<h2 id="sheetTitle">Avaliar jogo</h2><p class="muted">Conte como foi a partida.</p>
    <form id="reviewForm" class="stack">
      ${field('Jogo', `<select name="gameId" required>${games.map(game => `<option value="${esc(game.id)}"${game.id === gameId ? ' selected' : ''}>${esc(game.title)}</option>`).join('')}</select>`)}
      <fieldset class="star-input"><legend>Nota</legend><div>${[5, 4, 3, 2, 1].map(n => `<input type="radio" id="rate${n}" name="rating" value="${n}"${n === 5 ? ' checked' : ''}><label for="rate${n}">${ic('star')}<span class="sr-only">${n} estrela${n > 1 ? 's' : ''}</span></label>`).join('')}</div></fieldset>
      ${field('Comentário', '<textarea name="comment" rows="4" required placeholder="O que você achou?"></textarea>')}
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-primary btn-block">Enviar avaliação</button>
    </form>`);
}
async function submitReview(form) {
  const data = Object.fromEntries(new FormData(form));
  if (!data.comment.trim()) return showFormError(form, 'Escreva um comentário.');
  setBusy(form, true, 'Enviando…');
  try {
    await api('reviews', { method: 'POST', body: { gameId: data.gameId, rating: Number(data.rating), comment: data.comment } });
    closeSheet();
    toast('Avaliação enviada. Obrigado!', 'success', { href: '#/conta?aba=avaliacoes', label: 'Ver' });
    if (parseRoute(location.hash).path === '/conta') location.hash = '#/conta?aba=avaliacoes';
  } catch (error) { showFormError(form, error.message); setBusy(form, false); }
}

async function openGameSheet(id = '') {
  const games = await getGames();
  const game = id ? games.find(item => item.id === id) : { platform: 'PC / Console' };
  if (!game) return toast('Jogo não encontrado.', 'danger');
  const list = (key) => [...new Set(games.map(item => item[key]))].sort().map(value => `<option value="${esc(value)}">`).join('');
  openSheet(`<h2 id="sheetTitle">${id ? 'Editar jogo' : 'Novo jogo'}</h2>
    <form id="gameForm" data-id="${esc(id)}" class="stack">
      ${field('Título', `<input name="title" value="${esc(game.title)}" required>`)}
      <div class="form-row">${field('Categoria', `<input name="category" list="categoryList" value="${esc(game.category)}" required>`)}${field('Ano', `<input name="year" type="number" min="1970" max="2100" value="${esc(game.year)}" required>`)}</div>
      ${field('Plataforma', `<input name="platform" list="platformList" value="${esc(game.platform)}" required>`)}
      <datalist id="categoryList">${list('category')}</datalist><datalist id="platformList">${list('platform')}</datalist>
      ${field('Descrição', `<textarea name="description" rows="3">${esc(game.description)}</textarea>`)}
      ${field('URL da capa (opcional)', `<input name="cover" type="url" value="${esc(game.cover)}" placeholder="https://…">`)}
      <label class="file-pick">${ic('upload')}<span id="gameCoverName">Ou envie uma imagem (PNG, JPEG ou WebP, até 5 MB)</span><input id="gameCoverFile" class="sr-only" type="file" accept="image/png,image/jpeg,image/webp"></label>
      <label class="check"><input name="featured" type="checkbox"${game.featured ? ' checked' : ''}> Mostrar em destaque</label>
      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-primary btn-block">Salvar jogo</button>
    </form>`);
}
async function submitGame(form) {
  const id = form.dataset.id;
  const data = Object.fromEntries(new FormData(form));
  data.featured = form.featured.checked;
  data.year = Number(data.year);
  const file = $('#gameCoverFile').files[0];
  const coverError = file ? validateCover(file) : '';
  if (coverError) return showFormError(form, coverError);
  setBusy(form, true, 'Salvando…');
  try {
    const saved = await api(id ? `games/${encodeURIComponent(id)}` : 'games', { method: id ? 'PUT' : 'POST', body: data });
    if (file) {
      try { await uploadCover(saved.id, file); }
      catch (error) { toast(`Jogo salvo, mas a capa não foi enviada: ${error.message}`, 'danger'); }
    }
    closeSheet();
    toast(id ? 'Jogo atualizado.' : 'Jogo cadastrado.');
    state.games = null;
    router();
  } catch (error) { showFormError(form, error.message); setBusy(form, false); }
}

async function openCoverSheet(id) {
  const game = (await getGames()).find(item => item.id === id);
  if (!game) return toast('Jogo não encontrado.', 'danger');
  openSheet(`<h2 id="sheetTitle">Trocar capa · ${esc(game.title)}</h2>
    <form id="coverForm" data-id="${esc(id)}" class="stack">
      <div class="cover-compare"><figure><figcaption>Atual</figcaption>${coverImg(game, 'preview', `Capa atual de ${game.title}`)}</figure><figure><figcaption>Nova</figcaption><span class="cover preview" id="coverPreview"><span class="cover-fallback" aria-hidden="true">${ic('image')}</span></span></figure></div>
      <label class="dropzone" id="dropzone">${ic('upload')}<strong>Arraste uma imagem ou clique para escolher</strong><small id="coverFileInfo">PNG, JPEG ou WebP · até 5 MB</small><input id="coverFile" type="file" accept="image/png,image/jpeg,image/webp" class="sr-only" required></label>
      <div class="progress" id="coverProgress" hidden><span></span><small>Enviando para o Cloudinary…</small></div>
      <p class="form-error" role="alert" hidden></p>
      <div class="actions"><button type="button" class="btn btn-ghost" data-close-sheet>Cancelar</button><button class="btn btn-primary" disabled>Enviar capa</button></div>
    </form>`);
  const input = $('#coverFile');
  const choose = file => {
    const form = $('#coverForm');
    const error = validateCover(file);
    showFormError(form, error);
    form.querySelector('button:not([type=button])').disabled = Boolean(error);
    if (error) return;
    const transfer = new DataTransfer(); // mantém o arquivo arrastado no input
    transfer.items.add(file);
    input.files = transfer.files;
    $('#coverFileInfo').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`;
    $('#coverPreview').innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Prévia da nova capa">`;
  };
  input.onchange = () => input.files[0] && choose(input.files[0]);
  const zone = $('#dropzone');
  zone.ondragover = event => { event.preventDefault(); zone.classList.add('is-over'); };
  zone.ondragleave = () => zone.classList.remove('is-over');
  zone.ondrop = event => { event.preventDefault(); zone.classList.remove('is-over'); const file = event.dataTransfer.files[0]; if (file) choose(file); };
}
async function submitCover(form) {
  const file = $('#coverFile').files[0];
  const error = validateCover(file);
  if (error) return showFormError(form, error);
  const progress = $('#coverProgress');
  progress.hidden = false;
  showFormError(form, '');
  setBusy(form, true, 'Enviando…');
  try {
    await uploadCover(form.dataset.id, file, ratio => progress.style.setProperty('--progress', `${Math.round(ratio * 100)}%`));
    closeSheet();
    toast('Capa atualizada.');
    state.games = null;
    router();
  } catch (uploadError) {
    progress.hidden = true;
    showFormError(form, uploadError.message);
    setBusy(form, false);
  }
}

// ---------- Ações delegadas ----------
async function runAction(work, success) {
  try { await work(); if (success) toast(success); state.games = null; await router(); }
  catch (error) { toast(error.message, 'danger'); }
}
async function onClick(event) {
  const target = event.target.closest('button, a');
  if (!target) return;
  const data = target.dataset;
  if ('closeSheet' in data) return closeSheet();
  if ('retry' in data) return router();
  if (data.auth) return openAuth(data.auth);
  if ('logout' in data) { setUser(null); toast('Você saiu da conta.'); if (/^\/(conta|admin)/.test(parseRoute(location.hash).path)) location.hash = '#/'; else router(); return; }
  if (data.hero) return setHero(Number(data.hero));
  if (data.preset) { const mood = $('#mood'); mood.value = data.preset; return mood.focus(); }
  if ('review' in data) return openReviewSheet(data.review);
  if ('newGame' in data) return openGameSheet();
  if (data.editGame) return openGameSheet(data.editGame);
  if (data.cover) return openCoverSheet(data.cover);
  if (data.steam) return importSteam(target);
  if (data.cancelBooking && await confirmAction({ title: 'Cancelar pedido?', text: 'O pedido de empréstimo será cancelado.', ok: 'Cancelar pedido', danger: true })) return runAction(() => api(`bookings/${encodeURIComponent(data.cancelBooking)}`, { method: 'DELETE' }), 'Pedido cancelado.');
  if (data.returnBooking && await confirmAction({ title: 'Devolver jogo?', text: 'Confirme que você devolveu o jogo.', ok: 'Devolver' })) return runAction(() => api(`bookings/${encodeURIComponent(data.returnBooking)}`, { method: 'PATCH', body: {} }), 'Devolução registrada. Que tal avaliar?');
  if (data.decide) {
    const approve = data.status === 'Confirmada';
    if (await confirmAction({ title: approve ? 'Autorizar empréstimo?' : 'Recusar pedido?', text: approve ? 'O jogador verá o empréstimo como autorizado.' : 'O jogador verá o pedido como recusado.', ok: approve ? 'Autorizar' : 'Recusar', danger: !approve })) {
      return runAction(() => api(`bookings/${encodeURIComponent(data.decide)}`, { method: 'PATCH', body: { status: data.status } }), approve ? 'Empréstimo autorizado.' : 'Pedido recusado.');
    }
    return;
  }
  if (data.deleteGame) {
    const game = state.games?.find(item => item.id === data.deleteGame);
    if (!await confirmAction({ title: `Excluir “${game?.title || 'jogo'}”?`, text: 'As avaliações deste jogo também serão removidas. Jogos com empréstimos não podem ser excluídos.', ok: 'Excluir', danger: true })) return;
    return runAction(async () => { await api(`games/${encodeURIComponent(data.deleteGame)}`, { method: 'DELETE' }); if (parseRoute(location.hash).path.startsWith('/jogo/')) location.hash = '#/admin/jogos'; }, 'Jogo excluído.');
  }
  if ('clearReply' in data) { const form = target.closest('form'); form.reply.value = ''; form.requestSubmit(); }
}
async function onSubmit(event) {
  const form = event.target;
  if (form.method === 'dialog' || form.id === 'searchForm') return;
  event.preventDefault();
  if (form.id === 'authForm') return submitAuth(form);
  if (form.id === 'reviewForm') return submitReview(form);
  if (form.id === 'gameForm') return submitGame(form);
  if (form.id === 'coverForm') return submitCover(form);
  if (form.id === 'curationForm') return submitCuration(form);
  if (form.id === 'steamForm') return searchSteam(form);
  if (form.id === 'bookingForm') {
    setBusy(form, true, 'Enviando…');
    try {
      await api('bookings', { method: 'POST', body: { gameId: form.dataset.game, date: form.date.value } });
      toast('Pedido enviado! Acompanhe em Minha área.', 'success', { href: '#/conta', label: 'Ver' });
    } catch (error) { toast(error.message, 'danger'); }
    return setBusy(form, false);
  }
  if (form.dataset.reply) {
    setBusy(form, true, 'Salvando…');
    return runAction(() => api(`reviews/${encodeURIComponent(form.dataset.reply)}`, { method: 'PATCH', body: { reply: form.reply.value } }), form.reply.value.trim() ? 'Resposta salva.' : 'Resposta removida.');
  }
}

function boot() {
  let timer;
  const search = $('#searchInput');
  const goSearch = () => {
    const { path, params } = parseRoute(location.hash);
    const href = catalogHref(path === '/catalogo' ? params : '', { q: search.value.trim() });
    if (path === '/catalogo') { history.replaceState(null, '', href); router(); } else location.hash = href;
  };
  search.oninput = () => { clearTimeout(timer); timer = setTimeout(goSearch, 300); };
  $('#searchForm').onsubmit = event => { event.preventDefault(); clearTimeout(timer); goSearch(); };
  $('#accountBtn').onclick = () => { if (!state.user) return openAuth('login'); location.hash = isAdmin() ? '#/admin' : '#/conta'; };
  $('#sheet').addEventListener('click', event => { if (event.target === event.currentTarget) closeSheet(); });
  document.addEventListener('click', onClick);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('change', event => {
    if (event.target.matches('[data-sort]')) location.hash = catalogHref(parseRoute(location.hash).params, { ordem: event.target.value === 'relevancia' ? '' : event.target.value });
    if (event.target.id === 'gameCoverFile') { const file = event.target.files[0]; $('#gameCoverName').textContent = file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB` : 'Ou envie uma imagem (PNG, JPEG ou WebP, até 5 MB)'; }
  });
  window.addEventListener('hashchange', () => {
    const typing = document.activeElement === search; // busca digitada no topo não perde o foco
    if (!typing) window.scrollTo(0, 0);
    router().then(() => { if (!typing && !$('#sheet').open) $('#view').focus({ preventScroll: true }); });
  });
  router();
}
if (typeof document !== 'undefined') boot();
