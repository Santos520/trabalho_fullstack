const state = { user: JSON.parse(localStorage.getItem('gamevault_user') || 'null'), filter: 'all', games: [], steamResults: [], heroGames: null, heroIndex: 0 };
const grid = document.querySelector('#experienceGrid');
const modal = document.querySelector('#modal');
const modalContent = document.querySelector('#modalContent');
const esc = text => String(text ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const api = async (url, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (state.user?.token) headers.Authorization = `Bearer ${state.user.token}`;
  const response = await fetch(`/api/${url}`, { ...options, headers });
  const data = await response.json();
  if (response.status === 401 && url !== 'auth') { logout(); openLogin('Sua sessão expirou. Entre novamente.'); }
  if (!response.ok) throw new Error(data.error);
  return data;
};
const jsonBody = data => ({ headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
function openModal(html, wide = false) { modalContent.innerHTML = html; modal.querySelector('.modal-box').classList.toggle('modal-box-wide', wide); modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); }
function renderCards(items) { grid.innerHTML = items.length ? items.map(game => `<article class="experience-card" data-id="${game.id}"><div class="card-visual" style="background-color:${game.color};"><span class="cover-placeholder" aria-hidden="true">${esc(game.image || '🎮')}</span>${game.cover ? `<img class="game-cover" src="${esc(game.cover)}" alt="Capa de ${esc(game.title)}" loading="lazy" onload="this.parentElement.classList.add('has-cover')" onerror="this.remove()">` : ''}</div><div class="card-body"><h3>${esc(game.title)}</h3><div class="card-meta"><span>${esc(game.category)}</span><span>${esc(game.platform)}</span></div>${game.ai ? `<div class="card-ai-insight"><span>✦ DICA DA IA</span><p>${esc(game.ai)}</p></div>` : ''}<div class="card-info"><small>👥 ${esc(game.players)} | ⏱️ ${esc(game.duration)} | 🎯 ${esc(game.level)}</small></div>${game.featured ? '<span class="card-badge">✦ Mais procurado</span>' : ''}</div></article>`).join('') : '<p>Nenhum jogo encontrado.</p>'; document.querySelectorAll('.experience-card').forEach(card => card.onclick = () => openGame(card.dataset.id)); }
async function loadGames() { const query = document.querySelector('#searchInput').value; state.games = await api(`games?q=${encodeURIComponent(query)}&featured=${state.filter === 'featured'}`); if (!state.heroGames) { const preferred = ['It Takes Two', 'Hades', 'Minecraft', 'Baldur\'s Gate 3', 'Elden Ring']; const featured = state.games.filter(game => game.featured); state.heroGames = [...preferred.map(title => featured.find(game => game.title === title)).filter(Boolean), ...featured.filter(game => !preferred.includes(game.title))].slice(0, 7); if (!state.heroGames.length) state.heroGames = state.games.slice(0, 7); renderHeroCarousel(); } renderCards(state.games); }
function renderHeroCarousel() {
  const game = state.heroGames?.[state.heroIndex];
  if (!game) return;
  const carousel = document.querySelector('#heroCarousel');
  carousel.classList.add('is-changing');
  clearTimeout(carousel.changeTimer);
  carousel.changeTimer = setTimeout(() => carousel.classList.remove('is-changing'), 180);
  const image = document.querySelector('#heroCarouselImage');
  image.onerror = () => image.classList.add('cover-unavailable');
  image.onload = () => image.classList.remove('cover-unavailable');
  image.alt = `Arte de ${game.title}`;
  image.src = game.cover || '';
  document.querySelector('#heroCarouselMeta').textContent = `${game.year} · ${game.category} · ${game.platform}`;
  document.querySelector('#heroCarouselTitle').textContent = game.title;
  document.querySelector('#heroCarouselDescription').textContent = game.description || game.ai || 'Conheça este jogo em destaque no catálogo.';
  document.querySelector('#heroCarouselCount').textContent = `${String(state.heroIndex + 1).padStart(2, '0')} / ${String(state.heroGames.length).padStart(2, '0')}`;
  const dots = document.querySelector('#heroCarouselDots');
  dots.innerHTML = state.heroGames.map((item, index) => `<button type="button" class="carousel-dot${index === state.heroIndex ? ' active' : ''}" data-carousel-index="${index}" aria-label="Mostrar destaque ${index + 1}: ${esc(item.title)}" aria-current="${index === state.heroIndex ? 'true' : 'false'}"></button>`).join('');
  dots.querySelectorAll('[data-carousel-index]').forEach(dot => dot.onclick = () => { state.heroIndex = Number(dot.dataset.carouselIndex); renderHeroCarousel(); });
  document.querySelector('#heroCarouselPrevious').onclick = () => moveHeroCarousel(-1);
  document.querySelector('#heroCarouselNext').onclick = () => moveHeroCarousel(1);
  carousel.onkeydown = event => { if (event.key === 'ArrowLeft') moveHeroCarousel(-1); if (event.key === 'ArrowRight') moveHeroCarousel(1); };
  carousel.ontouchstart = event => { carousel.dataset.touchStart = event.changedTouches[0].clientX; };
  carousel.ontouchend = event => { const delta = Number(carousel.dataset.touchStart) - event.changedTouches[0].clientX; if (Math.abs(delta) > 45) moveHeroCarousel(delta > 0 ? 1 : -1); };
  document.querySelector('#heroCarouselLink').onclick = event => {
    event.preventDefault();
    document.querySelector('#searchInput').value = game.title;
    state.filter = 'all';
    document.querySelectorAll('.filter-btn').forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
    loadGames().then(() => document.querySelector('#jogos').scrollIntoView({ behavior: 'smooth' }));
  };
}
function moveHeroCarousel(direction) { if (!state.heroGames?.length) return; state.heroIndex = (state.heroIndex + direction + state.heroGames.length) % state.heroGames.length; renderHeroCarousel(); }
function openGame(id) { const game = state.games.find(item => item.id === id); if (!state.user) return openLogin(`Entre ou cadastre-se para ver os detalhes de “${esc(game.title)}”.`); openModal(`<div class="detail-art" style="background-color:${game.color}"><img src="${esc(game.cover)}" alt="Capa de ${esc(game.title)}" onerror="this.style.display='none'"><strong>${esc(game.title)}</strong></div><div class="detail-info"><span>${esc(game.category)}</span><span>${esc(game.platform)}</span><span>${game.year}</span><span>${esc(game.level)}</span></div><p>${esc(game.description)}</p><p class="ia-note"><b>IA sugere:</b> ${esc(game.ai)}</p><form class="form" id="bookingForm"><label>Escolha uma data<input name="date" type="date" min="${new Date().toISOString().slice(0, 10)}" required></label><button class="btn btn-coral">Solicitar empréstimo ↗</button></form>`); document.querySelector('#bookingForm').onsubmit = async event => { event.preventDefault(); try { const date = new FormData(event.target).get('date'); await api('bookings', { method: 'POST', ...jsonBody({ gameId: game.id, date }) }); openModal('<h2>Empréstimo solicitado.</h2><p>Seu pedido foi registrado e pode ser acompanhado na sua área.</p><button class="btn btn-dark" onclick="openAccount()">Ver minhas interações</button>'); } catch (error) { alert(error.message); } }; }
function openLogin(message = '') { openModal(`<p class="eyebrow">ÁREA DO JOGADOR</p><h2>Bom ter você<br><em>por aqui.</em></h2>${message ? `<p>${message}</p>` : ''}<form class="form" id="loginForm"><label>E-mail<input name="email" type="email" placeholder="voce@email.com" required></label><label>Senha<input name="password" type="password" required></label><button class="btn btn-dark">Entrar</button></form><p class="switch">Ainda não tem conta? <button id="registerLink">Criar cadastro</button></p>`); document.querySelector('#loginForm').onsubmit = async e => { e.preventDefault(); try { state.user = await api('auth', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(e.target)))}); localStorage.setItem('gamevault_user', JSON.stringify(state.user)); closeModal(); updateAccountButton(); } catch (error) { alert(error.message); } }; document.querySelector('#registerLink').onclick = openRegister; }
function openRegister() { openModal(`<p class="eyebrow">PRIMEIRO PASSO</p><h2>Abra sua<br><em>estante.</em></h2><form class="form" id="registerForm"><label>Nome<input name="name" required></label><label>E-mail<input name="email" type="email" required></label><label>Crie uma senha<input name="password" type="password" minlength="6" required></label><button class="btn btn-coral">Criar minha conta ↗</button></form><p class="switch">Já tem uma conta? <button id="loginLink">Entrar</button></p>`); document.querySelector('#registerForm').onsubmit = async e => { e.preventDefault(); try { state.user = await api('auth', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...Object.fromEntries(new FormData(e.target)), action:'register'})}); localStorage.setItem('gamevault_user', JSON.stringify(state.user)); closeModal(); updateAccountButton(); } catch (error) { alert(error.message); } }; document.querySelector('#loginLink').onclick = () => openLogin(); }
async function openAccount() { if (!state.user) return openLogin(); const data = await api('me'); openModal(`<p class="eyebrow">MINHA ÁREA</p><h2>Olá, ${data.client.name.split(' ')[0]}.</h2><div class="dashboard"><div class="dashboard-nav"><button class="active">Empréstimos</button><button onclick="openReviewForm()">Avaliar</button></div>${data.bookings.length ? data.bookings.map(item => `<div class="admin-row"><span><b>${esc(item.game)}</b><br>${esc(item.date)} · ${item.status === 'Solicitado' ? 'Aguardando autorização do administrador' : item.status === 'Recusado' ? 'Solicitação recusada' : esc(item.status)}</span>${item.status === 'Solicitado' ? `<button class="btn btn-dark" onclick="cancelLoan('${item.id}')">Cancelar</button>` : item.status === 'Confirmada' ? `<button class="btn btn-dark" onclick="returnLoan('${item.id}')">Devolver</button>` : ''}</div>`).join('') : '<p>Você ainda não tem empréstimos.</p>'}${data.reviews.length ? '<p class="eyebrow" style="margin-top:20px">MINHAS AVALIAÇÕES</p>' + data.reviews.map(item => `<div class="admin-row"><span><b>${esc(item.game)}</b> · ${'★'.repeat(item.rating)}<br>${esc(item.comment)}${item.reply ? `<br><i>Resposta: ${esc(item.reply)}</i>` : ''}</span></div>`).join('') : ''}<button class="btn btn-dark" style="margin-top:20px" onclick="logout()">Sair</button></div>`); }
async function openAdmin() {
  const data = await api('dashboard');
  const timestamp = Date.now();
  const categoryEntries = Object.entries(data.categoryStats).sort((a, b) => b[1] - a[1]);
  const topCategories = categoryEntries.slice(0, 6);
  const otherCategories = categoryEntries.slice(6).reduce((total, [, count]) => total + count, 0);
  const categoryLabels = topCategories.map(([name]) => name).concat(otherCategories ? ['Outras'] : []);
  const categoryValues = topCategories.map(([, count]) => count).concat(otherCategories ? [otherCategories] : []);
  const recent = [...data.recent].reverse().slice(0, 5);

  openModal(`<div class="admin-overview"><div class="admin-page-heading"><div><p class="eyebrow">GAMEVAULT · PAINEL ADMINISTRATIVO</p><h2>Visão <em>geral.</em></h2></div><span class="admin-live"><i></i> Painel atualizado</span></div>${adminNav(0)}<div class="stats admin-stats"><div class="stat"><small>JOGOS NO CATÁLOGO</small><strong>${data.games}</strong></div><div class="stat"><small>AGUARDANDO AUTORIZAÇÃO</small><strong>${data.pendingBookings || 0}</strong></div><div class="stat"><small>EMPRÉSTIMOS</small><strong>${data.bookings}</strong></div><div class="stat"><small>AVALIAÇÕES</small><strong>${data.reviews}</strong></div></div><div class="admin-chart-grid"><section class="admin-chart-card"><div class="admin-chart-heading"><h3>Empréstimos por jogo</h3><span>Top 8</span></div><div class="admin-chart-frame"><canvas id="chart-bookings-${timestamp}"></canvas></div></section><section class="admin-chart-card"><div class="admin-chart-heading"><h3>Jogos por categoria</h3><span>${categoryEntries.length} categorias</span></div><div class="admin-chart-frame"><canvas id="chart-category-${timestamp}"></canvas></div></section><section class="admin-chart-card admin-chart-card-wide"><div class="admin-chart-heading"><h3>Média das avaliações</h3><span>Escala de 1 a 5</span></div><div class="admin-chart-frame admin-chart-frame-short"><canvas id="chart-ratings-${timestamp}"></canvas></div></section></div><section class="admin-recent"><div class="admin-chart-heading"><h3>Atividade recente</h3><button class="admin-text-button" onclick="openAdminBookings()">Ver empréstimos ↗</button></div>${recent.length ? recent.map(item => `<div class="admin-row"><span><b>${esc(item.client || 'Cliente')}</b><br>${esc(item.game || 'Jogo')} · ${esc(item.date)} · ${esc(item.status)}</span></div>`).join('') : '<p class="admin-empty">Ainda não há empréstimos registrados.</p>'}</section></div>`, true);

  if (typeof Chart === 'undefined') return;
  Chart.defaults.font.family = 'Manrope, "Segoe UI", system-ui, sans-serif';
  Chart.defaults.font.size = 12;
  Chart.defaults.color = '#CFC7DF';
  const chartColors = ['#F2768B', '#A990F5', '#69C6B4', '#F2C17D', '#7D9CE8', '#E49BC7', '#6FB0D2'];
  const commonOptions = { responsive: true, maintainAspectRatio: false, devicePixelRatio: Math.max(window.devicePixelRatio || 1, 2), animation: { duration: 300 }, plugins: { legend: { labels: { color: '#CFC7DF', usePointStyle: true, boxWidth: 9, padding: 14, font: { family: 'Manrope, "Segoe UI", system-ui, sans-serif', size: 11 } }, display: false } } };
  new Chart(document.getElementById(`chart-bookings-${timestamp}`), {
    type: 'bar',
    data: { labels: data.gameStats.slice(0, 8).map(game => game.title), datasets: [{ label: 'Empréstimos', data: data.gameStats.slice(0, 8).map(game => game.bookings), backgroundColor: chartColors, borderRadius: 6, maxBarThickness: 34 }] },
    options: { ...commonOptions, scales: { x: { ticks: { color: '#B8AEC9', maxRotation: 32, minRotation: 0, autoSkip: true, font: { family: 'Manrope, "Segoe UI", system-ui, sans-serif', size: 11 } }, grid: { display: false } }, y: { beginAtZero: true, ticks: { color: '#AFA6C1', precision: 0, font: { family: 'Manrope, "Segoe UI", system-ui, sans-serif', size: 11 } }, grid: { color: 'rgba(183, 174, 201, 0.12)' } } } }
  });
  new Chart(document.getElementById(`chart-category-${timestamp}`), {
    type: 'doughnut',
    data: { labels: categoryLabels, datasets: [{ data: categoryValues, backgroundColor: chartColors, borderColor: '#211B35', borderWidth: 3, hoverOffset: 5 }] },
    options: { ...commonOptions, cutout: '64%', plugins: { ...commonOptions.plugins, legend: { display: true, position: 'bottom', labels: { color: '#CFC7DF', usePointStyle: true, boxWidth: 9, padding: 12, font: { family: 'Manrope, "Segoe UI", system-ui, sans-serif', size: 11 } } } } }
  });
  const ratedGames = data.gameStats.filter(game => Number(game.avgRating) > 0).slice(0, 10);
  new Chart(document.getElementById(`chart-ratings-${timestamp}`), {
    type: 'line',
    data: { labels: ratedGames.map(game => game.title), datasets: [{ label: 'Nota média', data: ratedGames.map(game => Number(game.avgRating)), borderColor: '#A990F5', backgroundColor: 'rgba(169, 144, 245, 0.12)', pointBackgroundColor: '#F2768B', pointRadius: 3, tension: 0.32, fill: true, borderWidth: 2 }] },
    options: { ...commonOptions, plugins: { ...commonOptions.plugins, legend: { display: false } }, scales: { x: { ticks: { color: '#B8AEC9', maxRotation: 0, autoSkip: true, font: { family: 'Manrope, "Segoe UI", system-ui, sans-serif', size: 11 } }, grid: { display: false } }, y: { min: 0, max: 5, ticks: { color: '#AFA6C1', stepSize: 1, font: { family: 'Manrope, "Segoe UI", system-ui, sans-serif', size: 11 } }, grid: { color: 'rgba(183, 174, 201, 0.12)' } } } }
  });
}
function openReviewForm() { openModal(`<p class="eyebrow">DEPOIS DA PARTIDA</p><h2>Conte como<br><em>foi.</em></h2><form class="form" id="reviewForm"><label>Jogo<select name="gameId">${state.games.map(game => `<option value="${game.id}">${esc(game.title)}</option>`).join('')}</select></label><label>Nota<select name="rating"><option value="5">5 · Inesquecível</option><option value="4">4 · Muito bom</option><option value="3">3 · Bom</option><option value="2">2 · Fraco</option><option value="1">1 · Ruim</option></select></label><label>Comentário<textarea name="comment" required></textarea></label><button class="btn btn-coral">Enviar avaliação ↗</button></form>`); document.querySelector('#reviewForm').onsubmit = async e => { e.preventDefault(); await api('reviews', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...Object.fromEntries(new FormData(e.target)), clientId:state.user.id})}); openAccount(); }; }
function logout() { state.user = null; localStorage.removeItem('gamevault_user'); closeModal(); updateAccountButton(); }
function updateAccountButton() { document.querySelector('#accountBtn').textContent = state.user ? `Olá, ${state.user.name.split(' ')[0]}` : 'Entrar'; }
document.querySelector('#aiForm').onsubmit = async event => {
  event.preventDefault();
  const result = document.querySelector('#aiResult');
  result.textContent = 'Consultando curadoria…';
  try {
    const data = await api('ai', { method: 'POST', ...jsonBody(Object.fromEntries(new FormData(event.target))) });
    result.innerHTML = `<p><b>${esc(data.source)}:</b> ${esc(data.answer)}</p>${data.games.map(game => `<button class="btn btn-dark ai-suggestion" data-ai-game="${esc(game.id)}"><strong>${esc(game.title)}</strong><small>${esc(game.recommendationReason || game.genre)}</small></button>`).join(' ')}`;
    result.className = 'ia-note';
    result.querySelectorAll('[data-ai-game]').forEach(button => button.onclick = () => openRecommendedGame(button.dataset.aiGame));
  } catch (error) { result.textContent = error.message; }
};
document.querySelector('#closeModal').onclick = closeModal; modal.onclick = e => { if (e.target === modal) closeModal(); }; document.querySelector('#accountBtn').onclick = () => state.user?.role === 'admin' ? openAdmin() : openAccount(); document.querySelector('#searchInput').oninput = loadGames; document.querySelectorAll('.filter-btn').forEach(button => button.onclick = () => { document.querySelector('.filter-btn.active').classList.remove('active'); button.classList.add('active'); state.filter = button.dataset.filter; loadGames(); }); updateAccountButton(); loadGames();

async function returnLoan(id) { await api(`bookings/${id}`, { method: 'PATCH', ...jsonBody({}) }); openAccount(); }

async function openRecommendedGame(id) {
  if (!state.games.some(game => game.id === id)) state.games = await api('games');
  openGame(id);
}

async function cancelLoan(id) { if (!confirm('Cancelar esta solicitação de empréstimo?')) return; try { await api(`bookings/${id}`, { method: 'DELETE' }); await openAccount(); } catch (error) { alert(error.message); } }

async function searchSteam(event) {
  event.preventDefault();
  const result = document.querySelector('#steamSearchResults');
  const query = new FormData(event.target).get('query');
  result.innerHTML = '<p class="search-status">Buscando jogos e capas…</p>';
  try {
    const data = await api(`catalog/steam?q=${encodeURIComponent(query)}`);
    state.steamResults = data.games;
    result.innerHTML = data.games.length ? data.games.map((game, index) => {
      const alreadyAdded = state.games.some(item => item.title.toLowerCase() === game.title.toLowerCase());
      return `<article class="steam-result"><img src="${esc(game.cover)}" alt="Capa de ${esc(game.title)}" loading="lazy"><div><strong>${esc(game.title)}</strong><a href="${esc(game.storeUrl)}" target="_blank" rel="noopener noreferrer">Ver na Steam</a></div><button class="btn ${alreadyAdded ? 'btn-muted' : 'btn-coral'}" data-steam-index="${index}" ${alreadyAdded ? 'disabled' : ''}>${alreadyAdded ? 'Já está no catálogo' : '＋ Importar'}</button></article>`;
    }).join('') : '<p>Nenhum jogo encontrado.</p>';
    result.querySelectorAll('[data-steam-index]').forEach(button => button.onclick = () => importSteamGame(Number(button.dataset.steamIndex), button));
  } catch (error) { result.innerHTML = `<p class="search-status">${esc(error.message)}</p>`; }
}

async function importSteamGame(index, button) {
  const selected = state.steamResults[index];
  button.disabled = true;
  button.textContent = 'Importando…';
  try {
    const imported = await api('catalog/steam/import', { method: 'POST', ...jsonBody({ appId: selected.appId }) });
    state.steamResults[index].imported = true;
    button.textContent = imported.alreadyImported ? 'Já importado' : 'Importado ✓';
    button.classList.remove('btn-coral');
    button.classList.add('btn-muted');
    state.games = await api('games');
    await loadGames();
  } catch (error) {
    button.disabled = false;
    button.textContent = '＋ Importar';
    alert(error.message);
  }
}

const adminNav = active => `<div class="dashboard-nav admin-dashboard-nav"><button ${active === 0 ? 'class="active"' : ''} onclick="openAdmin()">Visão geral</button><button ${active === 1 ? 'class="active"' : ''} onclick="openAdminBookings()">Empréstimos</button><button ${active === 2 ? 'class="active"' : ''} onclick="openAdminGames()">Jogos</button><button ${active === 3 ? 'class="active"' : ''} onclick="openAdminReviews()">Avaliações</button><span class="nav-spacer"></span><button class="admin-logout" onclick="logout()">Sair da conta ↗</button></div>`;

async function openAdminBookings() {
  const list = await api('bookings');
  const pending = list.filter(item => item.status === 'Solicitado');
  const history = list.filter(item => item.status !== 'Solicitado');
  openModal(`<div class="admin-page-heading"><div><p class="eyebrow">GAMEVAULT · ADMIN</p><h2>Solicitações de<br><em>empréstimo.</em></h2></div><span class="admin-pending-count">${pending.length} pendente${pending.length === 1 ? '' : 's'}</span></div><div class="dashboard">${adminNav(1)}<p class="admin-section-copy">Revise os pedidos. O empréstimo só fica autorizado depois que você confirmar.</p>${pending.length ? pending.map(item => `<article class="booking-review-card"><div class="booking-review-info"><span class="status-pill status-requested">Aguardando autorização</span><h3>${esc(item.game)}</h3><p><b>${esc(item.client)}</b>${item.clientEmail ? ` · ${esc(item.clientEmail)}` : ''}</p><small>Data solicitada: ${esc(item.date)}</small></div><div class="booking-review-actions"><button class="btn btn-coral" onclick="decideBooking('${item.id}', 'Confirmada')">Autorizar</button><button class="btn btn-outline" onclick="decideBooking('${item.id}', 'Recusado')">Recusar</button></div></article>`).join('') : '<div class="admin-empty-card"><span>✓</span><div><b>Nenhum pedido pendente</b><p>Novas solicitações aparecerão aqui para sua autorização.</p></div></div>'}<h3 class="admin-history-title">Histórico de decisões</h3>${history.length ? history.slice().reverse().map(item => `<div class="admin-row booking-history-row"><span><b>${esc(item.game)}</b><br>${esc(item.client)} · ${esc(item.date)}</span><span class="status-pill ${item.status === 'Confirmada' ? 'status-approved' : item.status === 'Recusado' ? 'status-rejected' : 'status-finished'}">${esc(item.status)}</span></div>`).join('') : '<p class="admin-empty">As solicitações decididas aparecerão aqui.</p>'}</div>`, true);
}

async function decideBooking(id, status) {
  const action = status === 'Confirmada' ? 'autorizar' : 'recusar';
  if (!confirm(`Confirma ${action} este empréstimo?`)) return;
  try {
    await api(`bookings/${id}`, { method: 'PATCH', ...jsonBody({ status }) });
    await openAdminBookings();
  } catch (error) { alert(error.message); }
}

async function openAdminGames() {
  const games = await api('games');
  state.games = games;
  openModal(`<p class="eyebrow">GAMEVAULT · ADMIN</p><h2>Gerenciar<br><em>jogos.</em></h2><div class="dashboard">${adminNav(2)}<section class="steam-import"><p class="eyebrow">CATÁLOGO AUTOMÁTICO</p><h3>Encontre e importe jogos</h3><p>Busque na Steam e adicione título, descrição, ano e capa ao seu catálogo com um clique.</p><form class="steam-search-form" id="steamSearchForm"><input name="query" placeholder="Buscar um jogo, ex.: Hades" minlength="2" maxlength="80" required><button class="btn btn-coral">Buscar ↗</button></form><div id="steamSearchResults"></div></section><button class="btn btn-dark" onclick="openGameForm()">＋ Adicionar manualmente</button><div style="margin-top:16px"></div>${games.map(game => `<div class="admin-row"><span><b>${esc(game.title)}</b><br>${esc(game.category)} · ${esc(game.platform)} · ${game.year}</span><span><button class="btn btn-dark" onclick="openGameForm('${game.id}')">Editar</button> <button class="btn btn-dark" onclick="deleteGame('${game.id}')">Excluir</button></span></div>`).join('')}</div>`, true);
  document.querySelector('#steamSearchForm').onsubmit = searchSteam;
}

async function openGameForm(id, imported = {}) {
  const game = id ? (await api('games')).find(item => item.id === id) : imported;
  openModal(`<p class="eyebrow">GAMEVAULT · ADMIN</p><h2>${id ? 'Editar' : 'Novo'}<br><em>jogo.</em></h2><form class="form" id="gameForm"><label>Título<input name="title" value="${esc(game.title)}" required></label><label>Categoria<input name="category" value="${esc(game.category || '')}" required></label><label>Plataforma<input name="platform" value="${esc(game.platform || 'PC / Console')}" required></label><label>Ano<input name="year" type="number" value="${esc(game.year || (id ? new Date().getFullYear() : ''))}" placeholder="Ano de lançamento" required></label><label>URL da capa (opcional)<input name="cover" value="${esc(game.cover)}" placeholder="https://..."></label><label>Descrição<textarea name="description">${esc(game.description)}</textarea></label><label><span><input name="featured" type="checkbox" ${game.featured ? 'checked' : ''}> Jogo em destaque</span></label><button class="btn btn-coral">Salvar jogo ↗</button></form>`);
  document.querySelector('#gameForm').onsubmit = async event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    data.featured = event.target.featured.checked;
    try { await api(id ? `games/${id}` : 'games', { method: id ? 'PUT' : 'POST', ...jsonBody(data) }); await loadGames(); openAdminGames(); } catch (error) { alert(error.message); }
  };
}

async function deleteGame(id) {
  if (!confirm('Excluir este jogo?')) return;
  try { await api(`games/${id}`, { method: 'DELETE' }); await loadGames(); openAdminGames(); } catch (error) { alert(error.message); }
}

async function openAdminReviews() {
  const list = await api('reviews');
  openModal(`<p class="eyebrow">GAMEVAULT · ADMIN</p><h2>Avaliações<br><em>dos jogadores.</em></h2><div class="dashboard">${adminNav(3)}${list.length ? list.map(item => `<div class="admin-row"><span><b>${esc(item.game)}</b> · ${'★'.repeat(item.rating)} · ${esc(item.client)}<br>${esc(item.comment)}${item.reply ? `<br><i>Resposta: ${esc(item.reply)}</i>` : ''}</span><button class="btn btn-dark" onclick="replyReview('${item.id}')">Responder</button></div>`).join('') : '<p>Nenhuma avaliação ainda.</p>'}</div>`, true);
}

async function replyReview(id) {
  const reply = prompt('Escreva a resposta para o jogador:');
  if (!reply) return;
  await api(`reviews/${id}`, { method: 'PATCH', ...jsonBody({ reply }) });
  openAdminReviews();
}
