require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
const ids = () => crypto.randomUUID();
const APP_NAME = 'GameVault';

const steamCovers = {
  'Hades': 1145360,
  'Stardew Valley': 413150,
  'Elden Ring': 1245620,
  'The Sims 4': 1222670,
  'Cyberpunk 2077': 1091500,
  'Hollow Knight': 367520,
  'Baldur\'s Gate 3': 1086940,
  'God of War Ragnarök': 2322010,
  'Final Fantasy VII Remake': 1462040,
  'The Witcher 3': 292030,
  'Hogwarts Legacy': 990080,
  'Palworld': 1623730,
  'Tekken 8': 1778820,
  'Starfield': 1716740,
  'Dragon\'s Dogma 2': 2054970,
  'Call of Duty: Modern Warfare III': 2519060,
  'Persona 5 Royal': 1687950,
  'Sea of Thieves': 1172620,
  'It Takes Two': 1426210,
  'Jedi: Survivor': 1774580,
  'Avatar: Frontiers of Pandora': 2840770,
  'Helldivers 2': 553850,
  'Subnautica': 264710,
  'Blasphemous 2': 2114740,
  'Ghostwire: Tokyo': 1475810,
  'Indiana Jones e o Grande Círculo': 2677660,
  'Prince of Persia: The Lost Crown': 275100,
  'Mortal Kombat 1': 1971870,
  'Monster Hunter: World': 582010,
  'Monster Hunter World: Iceborne': 1118010,
  'Monster Hunter Rise': 1446780,
  'Monster Hunter Rise: Sunbreak': 1880360,
  'Monster Hunter Stories': 2356560,
  'Monster Hunter Stories 2: Wings of Ruin': 1277400,
  'Monster Hunter Wilds': 2246340,
  'Monster Hunter Stories 3: Twisted Reflection': 2749920
};

const staticCoverOverrides = {
  'Minecraft': 'https://upload.wikimedia.org/wikipedia/pt/9/9c/Minecraft_capa.png',
  'Fortnite': 'https://upload.wikimedia.org/wikipedia/uk/5/51/%D0%9F%D0%BE%D1%81%D1%82%D0%B5%D1%80_5_%D0%B3%D0%BB%D0%B0%D0%B2%D0%B8_Fortnite.jpg',
  'The Legend of Zelda: Breath of the Wild': 'https://upload.wikimedia.org/wikipedia/en/c/c6/The_Legend_of_Zelda_Breath_of_the_Wild.jpg'
};
const resolvedCoverCache = new Map();
const coverLookupTimeout = 3500;
const normalizedCoverTitle = title => String(title || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const validImageUrl = value => /^https?:\/\//i.test(String(value || ''));

function coverFor(title) {
  if (staticCoverOverrides[title]) return staticCoverOverrides[title];
  const appId = steamCovers[title];
  return appId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg` : '';
}

async function steamCoverFor(title) {
  const searchUrl = new URL('https://store.steampowered.com/api/storesearch/');
  searchUrl.searchParams.set('term', title);
  searchUrl.searchParams.set('l', 'brazilian');
  searchUrl.searchParams.set('cc', 'br');
  const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(coverLookupTimeout) });
  if (!searchResponse.ok) return '';
  const search = await searchResponse.json();
  const match = (search.items || []).find(item => normalizedCoverTitle(item.name) === normalizedCoverTitle(title));
  if (!match) return '';

  const detailsUrl = new URL('https://store.steampowered.com/api/appdetails/');
  detailsUrl.searchParams.set('appids', String(match.id));
  detailsUrl.searchParams.set('cc', 'br');
  detailsUrl.searchParams.set('l', 'brazilian');
  const detailsResponse = await fetch(detailsUrl, { signal: AbortSignal.timeout(coverLookupTimeout) });
  if (detailsResponse.ok) {
    const details = await detailsResponse.json();
    const app = details[String(match.id)];
    if (app?.success && app.data?.type === 'game' && validImageUrl(app.data.header_image)) return app.data.header_image;
  }
  return `https://cdn.akamai.steamstatic.com/steam/apps/${match.id}/header.jpg`;
}

async function wikipediaCoverFor(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'GameVault/1.0 (game cover metadata)' }, signal: AbortSignal.timeout(coverLookupTimeout) });
  if (!response.ok) return '';
  const summary = await response.json();
  if (normalizedCoverTitle(summary.title) !== normalizedCoverTitle(title)) return '';
  return validImageUrl(summary.thumbnail?.source) ? summary.thumbnail.source : '';
}

async function resolveCover(game) {
  const canonical = coverFor(game.title);
  if (canonical) return canonical;
  if (validImageUrl(game.cover)) return game.cover;
  if (process.env.DISABLE_REMOTE_COVERS === '1') return '';
  const key = normalizedCoverTitle(game.title);
  const cached = resolvedCoverCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  let cover = '';
  try { cover = await wikipediaCoverFor(game.title); } catch (error) {
    console.warn(`Wikipedia indisponível para a capa de "${game.title}":`, error.message);
  }
  if (!cover) {
    try { cover = await steamCoverFor(game.title); } catch (error) {
      console.warn(`Steam indisponível para a capa de "${game.title}":`, error.message);
    }
  }
  resolvedCoverCache.set(key, { url: cover, expiresAt: Date.now() + (cover ? 24 * 60 : 5) * 60 * 1000 });
  return cover;
}

async function gamesWithCovers(items) {
  const result = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      const { visits, ...game } = items[index];
      result[index] = { ...game, cover: await resolveCover(game) };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
  return result;
}

const games = [
  { id: ids(), title: 'Hades', category: 'Ação', platform: 'PC / Console', year: 2020, featured: true, level: 'Desafiador', color: '#7209B7', visits: 589, image: '⚔️', duration: '30-60min', players: '1', age: '16+', genre: 'Roguelike', description: 'Escape do submundo em batalhas fluidas, com uma história que muda a cada tentativa.', ai: 'Segundo nossa consulta a IA, Hades combina bem com jogadores que valorizam ação e narrativa.' },
  { id: ids(), title: 'Stardew Valley', category: 'Simulação', platform: 'PC / Console', year: 2016, featured: false, level: 'Livre', color: '#A100F2', visits: 612, image: '🌾', duration: '45-120min', players: '1', age: '3+', genre: 'Relaxante', description: 'Cuide de uma fazenda, conheça a comunidade e crie seu próprio ritmo.', ai: 'A IA identifica Stardew Valley como uma boa escolha para relaxar e jogar no próprio tempo.' },
  { id: ids(), title: 'Elden Ring', category: 'Ação RPG', platform: 'PC / Console', year: 2022, featured: true, level: 'Muito Difícil', color: '#8338EC', visits: 723, image: '🐉', duration: '60-150min', players: '1-2', age: '18+', genre: 'Fantasia', description: 'Explore um mundo arrebatador cheio de desafios, bosses lendários e segredos ocultos.', ai: 'Para quem ama desafios épicos e exploração profunda em mundos sombrios.' },
  { id: ids(), title: 'The Sims 4', category: 'Simulação', platform: 'PC / Console', year: 2014, featured: false, level: 'Livre', color: '#B5179E', visits: 567, image: '🏠', duration: '30-120min', players: '1', age: '13+', genre: 'Vida Virtual', description: 'Crie e controle vidas virtuais, construa casas e relacionamentos.', ai: 'Perfeito para quem quer criatividade sem limites e histórias pessoais.' },
  { id: ids(), title: 'Cyberpunk 2077', category: 'RPG', platform: 'PC / Console', year: 2020, featured: true, level: 'Intermediário', color: '#7209B7', visits: 645, image: '🤖', duration: '50-180min', players: '1', age: '18+', genre: 'Ficção Científica', description: 'Navegue Night City, customize seu personagem e complete missões em um futuro distópico.', ai: 'Para fãs de narrativas profundas em universos ciber-futuristas.' },
  { id: ids(), title: 'Hollow Knight', category: 'Aventura', platform: 'PC / Console', year: 2017, featured: true, level: 'Desafiador', color: '#A100F2', visits: 489, image: '🦗', duration: '30-100min', players: '1', age: '7+', genre: 'Metroidvania', description: 'Explore cavernas profundas como um pequeno cavaleiro buscando segredos e poder.', ai: 'Ideal para jogadores que adoram exploração e combate preciso.' },
  { id: ids(), title: 'Baldur\'s Gate 3', category: 'RPG', platform: 'PC / Console', year: 2023, featured: true, level: 'Intermediário', color: '#8338EC', visits: 812, image: '🐲', duration: '60-200min', players: '1-4', age: '17+', genre: 'Fantasia Medieval', description: 'A mais completa experiência de D&D em forma de videogame com múltiplas escolhas.', ai: 'Excelente para quem adora histórias ramificadas e decisões impactantes.' },
  { id: ids(), title: 'Minecraft', category: 'Sandbox', platform: 'PC / Console', year: 2011, featured: true, level: 'Livre', color: '#E63946', visits: 789, image: '🧱', duration: '30-180min', players: '1-4', age: '3+', genre: 'Criatividade', description: 'Construa, explore e sobreviva em mundos de blocos infinitos.', ai: 'Para quem gosta de criatividade ilimitada e exploração sem limites.' },
  { id: ids(), title: 'God of War Ragnarök', category: 'Ação', platform: 'PC / Console', year: 2023, featured: true, level: 'Intermediário', color: '#D62828', visits: 634, image: '⛓️', duration: '50-100min', players: '1', age: '18+', genre: 'Épico', description: 'Acompanhe Kratos e Atreus no final épico da saga nórdica.', ai: 'Essencial para fãs de ação cinematográfica e narrativas profundas.' },
  { id: ids(), title: 'The Legend of Zelda: Breath of the Wild', category: 'Aventura', platform: 'Console', year: 2017, featured: false, level: 'Intermediário', color: '#F72585', visits: 578, image: '🗡️', duration: '60-100min', players: '1', age: '10+', genre: 'Aventura', description: 'Explore Hyrule livremente em uma aventura revolucionária.', ai: 'Perfeito para quem quer exploração completa e liberdade de movimento.' },
  { id: ids(), title: 'Fortnite', category: 'Battle Royale', platform: 'PC / Console / Mobile', year: 2017, featured: true, level: 'Intermediário', color: '#A100F2', visits: 956, image: '🎮', duration: '20-60min', players: '1-100', age: '13+', genre: 'Multiplicador', description: 'Compita com outros jogadores em vários modos, construa e sobreviva até o fim da partida.', ai: 'Ideal para quem gosta de competição rápida e múltiplos modos.' },
  { id: ids(), title: 'Fortnite', category: 'Battle Royale', platform: 'PC / Console / Mobile', year: 2017, featured: true, level: 'Intermediário', color: '#A100F2', visits: 956, image: '🎮', duration: '20-60min', players: '1-100', age: '13+', genre: 'Multiplicador', description: 'Compita com outros jogadores em vários modos, construa e sobreviva até o fim da partida.', ai: 'Ideal para quem gosta de competição rápida e múltiplos modos.' },
  { id: ids(), title: 'Final Fantasy VII Remake', category: 'RPG', platform: 'PC / Console', year: 2020, featured: false, level: 'Intermediário', color: '#7209B7', visits: 523, image: '⚡', duration: '50-150min', players: '1', age: '16+', genre: 'Ficção Científica', description: 'Reviva a história clássica em um remake totalmente reimaginado.', ai: 'Para fãs de RPGs épicos com combate ativo e personagens memoráveis.' },
  { id: ids(), title: 'The Witcher 3', category: 'Ação RPG', platform: 'PC / Console', year: 2015, featured: true, level: 'Intermediário', color: '#D62828', visits: 734, image: '🧙', duration: '100-200min', players: '1', age: '18+', genre: 'Fantasia Sombria', description: 'Jogue como Geralt de Rivia em uma jornada épica pelo continente.', ai: 'Perfeito para quem ama narrativas complexas e decisões com peso.' },
  { id: ids(), title: 'Hogwarts Legacy', category: 'RPG', platform: 'PC / Console', year: 2023, featured: true, level: 'Intermediário', color: '#8338EC', visits: 698, image: '🪄', duration: '80-150min', players: '1', age: '13+', genre: 'Magia', description: 'Viva sua experiência mágica em Hogwarts no século 1890.', ai: 'Para fãs de magia e exploração de mundos imersivos.' },
  { id: ids(), title: 'Palworld', category: 'Ação', platform: 'PC / Console', year: 2024, featured: true, level: 'Livre', color: '#F72585', visits: 892, image: '🌍', duration: '40-100min', players: '1-4', age: '12+', genre: 'Aventura', description: 'Explore um mundo misterioso e captue criaturas em uma aventura cheia de mistério.', ai: 'Ideal para quem gosta de captura e exploração contínua.' },
  { id: ids(), title: 'Tekken 8', category: 'Luta', platform: 'PC / Console', year: 2024, featured: false, level: 'Desafiador', color: '#E63946', visits: 445, image: '👊', duration: '5-30min', players: '1-2', age: '14+', genre: 'Competição', description: 'Enfrente os melhores lutadores do mundo em combates intensos.', ai: 'Para quem procura competição séria e combos desafiadores.' },
  { id: ids(), title: 'Starfield', category: 'RPG Sci-Fi', platform: 'PC / Console', year: 2023, featured: true, level: 'Intermediário', color: '#7209B7', visits: 567, image: '🚀', duration: '80-200min', players: '1', age: '17+', genre: 'Exploração Espacial', description: 'Explore o universo em um épico sci-fi desenvolvido pela Bethesda.', ai: 'Para amantes de ficção científica e exploração galáctica.' },
  { id: ids(), title: 'Dragon\'s Dogma 2', category: 'Ação RPG', platform: 'PC / Console', year: 2024, featured: false, level: 'Desafiador', color: '#D62828', visits: 512, image: '🐲', duration: '60-150min', players: '1-4', age: '16+', genre: 'Fantasia', description: 'Recrute peões e enfrente dragões em um mundo fantástico.', ai: 'Para quem ama combates estratégicos contra criatures épicas.' },
  { id: ids(), title: 'Mortal Kombat 1', category: 'Luta', platform: 'PC / Console', year: 2023, featured: false, level: 'Desafiador', color: '#A100F2', visits: 589, image: '⚡', duration: '5-30min', players: '1-2', age: '18+', genre: 'Competição', description: 'Domine combates intensos em uma nova era do universo Mortal Kombat.', ai: 'Para quem gosta de partidas competitivas e desafios rápidos.' },
  { id: ids(), title: 'Call of Duty: Modern Warfare III', category: 'Multiplicador', platform: 'PC / Console', year: 2023, featured: true, level: 'Intermediário', color: '#1f1f1f', visits: 823, image: '🔫', duration: '20-60min', players: '2-12', age: '16+', genre: 'Tiroteio', description: 'Compita em combates frenéticos com jogadores de todo o mundo.', ai: 'Para quem procura ação acelerada e competição online.' },
  { id: ids(), title: 'Persona 5 Royal', category: 'RPG', platform: 'PC / Console', year: 2019, featured: true, level: 'Intermediário', color: '#E63946', visits: 678, image: '😎', duration: '80-150min', players: '1', age: '14+', genre: 'Misticismo Urbano', description: 'Viva como um ladrão de corações enfrentando sombras em Tóquio.', ai: 'Essencial para RPG visuais com estilo incomparável.' },
  { id: ids(), title: 'Sea of Thieves', category: 'Aventura Multiplayer', platform: 'PC / Console', year: 2018, featured: false, level: 'Livre', color: '#7209B7', visits: 534, image: '⛵', duration: '30-120min', players: '1-4', age: '12+', genre: 'Pirata', description: 'Navegue pelos mares em busca de tesouro com seus amigos.', ai: 'Para grupos que querem aventuras cooperativas marítimas.' },
  { id: ids(), title: 'It Takes Two', category: 'Aventura Coop', platform: 'PC / Console', year: 2021, featured: true, level: 'Intermediário', color: '#F72585', visits: 445, image: '💑', duration: '50-90min', players: '2', age: '12+', genre: 'Cooperativo', description: 'Uma jornada de dois jogadores sobre relacionamentos e crescimento.', ai: 'Imprescindível para quem quer jogar em dupla com significado.' },
  { id: ids(), title: 'Jedi: Survivor', category: 'Ação', platform: 'PC / Console', year: 2023, featured: true, level: 'Desafiador', color: '#8338EC', visits: 612, image: '⚡', duration: '40-120min', players: '1', age: '16+', genre: 'Star Wars', description: 'Continue a história de Cal Kestis em uma aventura épica jedi.', ai: 'Essencial para fãs de Star Wars que amam ação e lore.' },
  { id: ids(), title: 'Avatar: Frontiers of Pandora', category: 'Ação', platform: 'Console / PC', year: 2023, featured: true, level: 'Intermediário', color: '#A100F2', visits: 567, image: '🌌', duration: '50-100min', players: '1', age: '16+', genre: 'Ficção Científica', description: 'Explore Pandora como um Na\'vi em um mundo visualmente deslumbrante.', ai: 'Para quem quer explorar gráficos de última geração.' },
  { id: ids(), title: 'Helldivers 2', category: 'Shooter Coop', platform: 'PC / Console', year: 2024, featured: true, level: 'Intermediário', color: '#E63946', visits: 734, image: '🪖', duration: '20-50min', players: '1-4', age: '14+', genre: 'Sci-Fi Militar', description: 'Trabalhe em equipe para completar missões militares contra alienigenas.', ai: 'Para quem ama cooperação tática intensa.' },
  { id: ids(), title: 'Subnautica', category: 'Exploração', platform: 'PC / Console', year: 2018, featured: false, level: 'Livre', color: '#7209B7', visits: 489, image: '🌊', duration: '50-120min', players: '1', age: '10+', genre: 'Sobrevivência', description: 'Sobreviva em um planeta oceânico alieno e explore as profundezas.', ai: 'Para aventureiros que não têm medo de explorar o desconhecido.' },
  { id: ids(), title: 'Blasphemous 2', category: 'Metroidvania', platform: 'PC / Console', year: 2023, featured: false, level: 'Desafiador', color: '#D62828', visits: 378, image: '🗡️', duration: '30-100min', players: '1', age: '16+', genre: 'Sombrio', description: 'Uma aventura gótica repleta de desafios e mistério religioso.', ai: 'Para quem ama pixel art e dificuldade extrema.' },
  { id: ids(), title: 'Ghostwire: Tokyo', category: 'Ação Paranormal', platform: 'PC / Console', year: 2022, featured: true, level: 'Intermediário', color: '#8338EC', visits: 423, image: '👻', duration: '40-80min', players: '1', age: '17+', genre: 'Paranormal', description: 'Investigue o sobrenatural em Tóquio de forma imersiva.', ai: 'Perfeito para fãs de horror atmosférico e suspense.' },
  { id: ids(), title: 'Indiana Jones e o Grande Círculo', category: 'Aventura', platform: 'PC / Console', year: 2024, featured: true, level: 'Intermediário', color: '#F72585', visits: 678, image: '🎩', duration: '60-120min', players: '1', age: '14+', genre: 'Exploração Histórica', description: 'Vivencie as aventuras de Indiana Jones em primeira pessoa.', ai: 'Para fãs de arqueologia e aventura clássica.' },
  { id: ids(), title: 'Prince of Persia: The Lost Crown', category: 'Metroidvania', platform: 'PC / Console', year: 2024, featured: false, level: 'Intermediário', color: '#A100F2', visits: 512, image: '👑', duration: '40-90min', players: '1', age: '12+', genre: 'Ação Clássica', description: 'Retorno épico da franquia com combate e plataforma modernizdados.', ai: 'Para quem ama a série clássica com um toque moderno.' },
  { id: ids(), title: 'Monster Hunter: World', category: 'Ação RPG', platform: 'PC / PlayStation / Xbox', year: 2018, featured: true, level: 'Desafiador', color: '#7257A8', visits: 910, image: '🐲', duration: '45-120min', players: '1-4', age: '16+', genre: 'Caça a monstros · Cooperativo', description: 'Parta em expedições por ecossistemas vivos, rastreie monstros e crie equipamentos com os materiais das caçadas. Jogue solo ou em grupo.', ai: 'Boa pedida para quem quer caçadas cooperativas, exploração e progressão por equipamentos.' },
  { id: ids(), title: 'Monster Hunter World: Iceborne', category: 'Expansão · Ação RPG', platform: 'PC / PlayStation / Xbox', year: 2019, featured: false, level: 'Muito Difícil', color: '#7185A8', visits: 770, image: '❄️', duration: '60-150min', players: '1-4', age: '16+', genre: 'Expansão · Caça a monstros · Cooperativo', description: 'Expansão de Monster Hunter: World com a região gelada Hoarfrost Reach, novas caçadas, monstros e equipamentos. Requer o jogo base.', ai: 'Para quem já concluiu World e quer caçadas mais exigentes em cooperação.' },
  { id: ids(), title: 'Monster Hunter Rise', category: 'Ação RPG', platform: 'PC / Nintendo Switch / PlayStation / Xbox', year: 2021, featured: true, level: 'Desafiador', color: '#A45D4B', visits: 825, image: '🐺', duration: '30-90min', players: '1-4', age: '12+', genre: 'Caça a monstros · Cooperativo', description: 'Defenda a Vila Kamura em caçadas dinâmicas com companheiros, ferramentas de mobilidade e monstros inspirados no folclore japonês.', ai: 'Combina com quem procura ação rápida, caçadas em grupo e mobilidade.' },
  { id: ids(), title: 'Monster Hunter Rise: Sunbreak', category: 'Expansão · Ação RPG', platform: 'PC / Nintendo Switch / PlayStation / Xbox', year: 2022, featured: false, level: 'Muito Difícil', color: '#9A514B', visits: 680, image: '🌙', duration: '45-120min', players: '1-4', age: '12+', genre: 'Expansão · Caça a monstros · Cooperativo', description: 'Expansão de Rise com novas regiões, monstros e missões de Master Rank. Requer Monster Hunter Rise.', ai: 'Uma continuação para quem gosta de caçadas cooperativas e busca desafios maiores.' },
  { id: ids(), title: 'Monster Hunter Stories', category: 'RPG por turnos', platform: 'PC / Nintendo Switch / PlayStation / Xbox', year: 2024, featured: false, level: 'Intermediário', color: '#C8894B', visits: 405, image: '🥚', duration: '30-90min', players: '1', age: '10+', genre: 'RPG · Aventura · Criaturas', description: 'A versão remasterizada da aventura em que você se torna um Rider, cria laços com monstros e explora o mundo em batalhas por turnos.', ai: 'Uma alternativa mais narrativa e tranquila para fãs do universo Monster Hunter.' },
  { id: ids(), title: 'Monster Hunter Stories 2: Wings of Ruin', category: 'RPG por turnos', platform: 'PC / Nintendo Switch', year: 2021, featured: false, level: 'Intermediário', color: '#C8894B', visits: 530, image: '🪽', duration: '40-100min', players: '1', age: '10+', genre: 'RPG · Aventura · Criaturas', description: 'Explore uma jornada narrativa ao lado dos Monsties, crie equipes e enfrente batalhas estratégicas por turnos.', ai: 'Recomendado para quem prefere história, exploração e combate tático a caçadas de ação.' },
  { id: ids(), title: 'Monster Hunter Wilds', category: 'Ação RPG', platform: 'PC / PlayStation 5 / Xbox Series X|S', year: 2025, featured: true, level: 'Desafiador', color: '#8A7654', visits: 960, image: '🏜️', duration: '45-120min', players: '1-4', age: '16+', genre: 'Caça a monstros · Cooperativo · Mundo dinâmico', description: 'Atravesse as Terras Proibidas, um mundo que muda com o clima, e cace monstros sozinho ou com outros jogadores.', ai: 'Para quem quer caçadas cooperativas em um mundo aberto e dinâmico.' },
  { id: ids(), title: 'Monster Hunter Stories 3: Twisted Reflection', category: 'RPG por turnos', platform: 'PC / PlayStation 5 / Xbox Series X|S / Nintendo Switch 2', year: 2026, featured: true, level: 'Intermediário', color: '#9C714F', visits: 620, image: '🐉', duration: '40-100min', players: '1', age: '12+', genre: 'RPG · Aventura · Criaturas', description: 'Uma nova aventura de RPG por turnos no universo Monster Hunter Stories, com exploração e laços entre Riders e monstros.', ai: 'Uma escolha para quem gosta de campanhas narrativas e RPGs por turnos no universo Monster Hunter.' }
];

const recommendationIntents = [
  { id: 'relax', label: 'relaxar', phrases: ['relaxar', 'relaxante', 'tranquilo', 'tranquila', 'calmo', 'calma', 'leve', 'descansar', 'casual', 'cozy', 'aconchegante'], gameTerms: ['relaxante', 'relaxar', 'simulação', 'fazenda', 'vida virtual', 'sandbox', 'criatividade', 'comunidade', 'cozy'] },
  { id: 'action', label: 'ação', phrases: ['ação', 'acao', 'combate', 'luta', 'tiro', 'shooter', 'pancadaria'], gameTerms: ['ação', 'combate', 'luta', 'tiroteio', 'shooter', 'battle royale'] },
  { id: 'adventure', label: 'aventura', phrases: ['aventura', 'explorar', 'exploração', 'exploracao', 'mundo aberto', 'descobrir'], gameTerms: ['aventura', 'exploração', 'metroidvania', 'sobrevivência', 'sandbox', 'explore'] },
  { id: 'story', label: 'história', phrases: ['história', 'historia', 'narrativa', 'enredo', 'campanha', 'personagens', 'escolhas'], gameTerms: ['história', 'narrativa', 'escolhas', 'personagens', 'épico', 'rpg', 'jornada'] },
  { id: 'couple', label: 'jogar em casal ou a dois', phrases: ['casal', 'a dois', 'duas pessoas', '2 pessoas', 'namorado', 'namorada', 'parceiro', 'parceira', 'meu par'], gameTerms: [] },
  { id: 'coop', label: 'jogar acompanhado', phrases: ['amigo', 'amigos', 'dupla', 'em dupla', 'dois jogadores', '2 jogadores', 'coop', 'cooperativo', 'multiplayer', 'junto', 'em grupo'], gameTerms: ['cooperativo', 'coop', 'multiplayer', 'com seus amigos', 'grupos', '1-2', '1-4', '2-12'] },
  { id: 'solo', label: 'jogar sozinho', phrases: ['sozinho', 'sozinha', 'solo', 'singleplayer', 'single player', 'um jogador', '1 jogador'], gameTerms: ['singleplayer', 'solo'] },
  { id: 'competitive', label: 'competir', phrases: ['competitivo', 'competitiva', 'competição', 'competicao', 'ranked', 'rankeada', 'pvp', 'torneio', 'versus'], gameTerms: ['competição', 'battle royale', 'multiplicador', 'luta', 'tiroteio', 'competitivo'] },
  { id: 'challenge', label: 'desafio', phrases: ['difícil', 'dificil', 'desafiador', 'desafiante', 'hardcore', 'soulslike', 'souls like', 'boss'], gameTerms: ['desafiador', 'difícil', 'soulslike', 'roguelike', 'metroidvania', 'combate preciso'] },
  { id: 'horror', label: 'terror ou suspense', phrases: ['terror', 'assustador', 'assustadora', 'medo', 'horror', 'suspense', 'sombrio'], gameTerms: ['paranormal', 'sombrio', 'horror', 'terror', 'sobrevivência'] },
  { id: 'scifi', label: 'ficção científica', phrases: ['ficção científica', 'ficcao cientifica', 'sci fi', 'sci-fi', 'espacial', 'espaço', 'futurista'], gameTerms: ['ficção científica', 'sci fi', 'sci-fi', 'espacial', 'futurista', 'star wars'] },
  { id: 'fantasy', label: 'fantasia', phrases: ['fantasia', 'magia', 'medieval', 'dragão', 'dragao'], gameTerms: ['fantasia', 'magia', 'medieval', 'dragão'] },
  { id: 'simulation', label: 'simulação ou construção', phrases: ['simulação', 'simulacao', 'fazenda', 'construir', 'construção', 'construcao', 'vida virtual', 'criatividade'], gameTerms: ['simulação', 'fazenda', 'construção', 'sandbox', 'vida virtual', 'criatividade'] },
  { id: 'short', label: 'partidas curtas', phrases: ['curto', 'curta', 'rápido', 'rapido', 'rápida', 'rapida', 'pouco tempo', 'partida rápida', 'partidas rápidas', '20 minutos', '30 minutos'], gameTerms: [] }
];

const recommendationStopWords = new Set(['quero', 'queria', 'procuro', 'busco', 'um', 'uma', 'de', 'do', 'da', 'dos', 'das', 'com', 'para', 'por', 'jogar', 'jogo', 'algo', 'mais', 'mai', 'estou', 'hoje', 'que', 'me', 'seria', 'pode', 'ser']);
const normalizeText = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean).map(word => word.endsWith('oes') && word.length > 4 ? `${word.slice(0, -3)}ao` : word.endsWith('s') && word.length > 3 ? word.slice(0, -1) : word).join(' ');
function includesPhrase(text, phrase) { return ` ${text} `.includes(` ${normalizeText(phrase)} `); }

const recommendationProfiles = {
  'it take two': ['couple', 'coop'],
  minecraft: ['couple', 'coop']
};

function detectRecommendationPreferences(mood) {
  const normalized = normalizeText(mood);
  const preferences = [];
  recommendationIntents.forEach(intent => {
    const phrase = intent.phrases.find(item => includesPhrase(normalized, item));
    if (!phrase) return;
    const phrasePosition = normalized.indexOf(normalizeText(phrase));
    const beforePhrase = normalized.slice(0, phrasePosition).trim();
    const negated = /(?:nao quero|nao curto|nao gosto de|sem|evitar|dispenso)(?:\s+\w+){0,2}$/.test(beforePhrase);
    preferences.push({ intent, negated });
  });
  return { normalized, preferences };
}

function gameMatchesIntent(game, intent) {
  const title = normalizeText(game.title);
  const searchable = normalizeText(`${game.title} ${game.category} ${game.genre} ${game.description} ${game.ai} ${game.level}`);
  const playerCounts = String(game.players || '').match(/\d+/g)?.map(Number) || [];
  const maxPlayers = playerCounts.length ? Math.max(...playerCounts) : 1;
  const profileTags = recommendationProfiles[title] || [];
  if (intent.id === 'short') {
    const duration = String(game.duration || '').match(/(\d+)\s*-\s*(\d+)/);
    return Boolean(duration && Number(duration[2]) <= 60);
  }
  if (intent.id === 'couple') {
    if (profileTags.includes('couple') && maxPlayers >= 2) return true;
    const explicitlyForTwo = ['dupla', 'dois jogadores', 'relacionamentos', 'amigos', 'juntos'].some(term => includesPhrase(searchable, term));
    return maxPlayers >= 2 && explicitlyForTwo;
  }
  if (intent.id === 'coop') {
    if (maxPlayers > 1 || profileTags.includes('coop')) return true;
  }
  if (intent.id === 'solo') {
    const minPlayers = Number(String(game.players || '').match(/\d+/)?.[0] || 99);
    if (minPlayers === 1) return true;
  }
  return intent.gameTerms.some(term => includesPhrase(searchable, term));
}

function recommendationMatchWeight(game, intent) {
  if (!gameMatchesIntent(game, intent)) return 0;
  if (intent.id === 'couple') {
    const title = normalizeText(game.title);
    if (title === 'it take two') return 14;
    if (title === 'minecraft') return 10;
    return 6;
  }
  return 5;
}

function recommendGames(mood) {
  const { normalized, preferences } = detectRecommendationPreferences(mood);
  const words = normalized.split(' ').filter(word => word.length > 2 && !recommendationStopWords.has(word));
  const ranked = games.map((game, index) => {
    const title = normalizeText(game.title);
    const genre = normalizeText(`${game.category} ${game.genre}`);
    const searchable = normalizeText(`${title} ${genre} ${game.description} ${game.ai} ${game.level} ${game.platform}`);
    let score = 0;
    const reasons = [];
    let positiveIntentMatches = 0;

    preferences.forEach(({ intent, negated }) => {
      const matchWeight = recommendationMatchWeight(game, intent);
      if (negated && matchWeight) score -= matchWeight + 3;
      if (!negated && matchWeight) {
        score += matchWeight;
        positiveIntentMatches += 1;
        const title = normalizeText(game.title);
        if (intent.id === 'couple' && title === 'it take two') reasons.push('feito para jogar em dupla');
        else if (intent.id === 'couple' && title === 'minecraft') reasons.push('coop criativo em dupla');
        else reasons.push(intent.label);
      }
    });

    let keywordMatches = 0;
    words.forEach(word => {
      if (includesPhrase(title, word)) { score += 5; keywordMatches += 1; }
      else if (includesPhrase(genre, word)) { score += 3; keywordMatches += 1; }
      else if (includesPhrase(searchable, word)) { score += 1; keywordMatches += 1; }
    });

    if (positiveIntentMatches > 1) score += positiveIntentMatches * 2;
    if (keywordMatches && !reasons.length) reasons.push('corresponde aos termos da busca');
    return { game, score, reasons: [...new Set(reasons)].slice(0, 2), positiveIntentMatches, keywordMatches, index };
  });

  const relevant = ranked.filter(item => item.score > 0 && (item.positiveIntentMatches > 0 || item.keywordMatches > 0));
  const ordered = (relevant.length ? relevant : ranked.filter(item => !preferences.some(({ intent, negated }) => negated && gameMatchesIntent(item.game, intent))))
    .sort((left, right) => right.score - left.score || (right.game.visits || 0) - (left.game.visits || 0) || left.index - right.index);
  const fallback = ordered.length ? ordered : ranked.sort((left, right) => (right.game.visits || 0) - (left.game.visits || 0));
  return {
    games: fallback.slice(0, 3),
    noExactMatch: relevant.length === 0,
    preferences: preferences.filter(item => !item.negated).map(item => item.intent.label)
  };
}
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const seedGames = games.slice();
const tokens = new Map();
let database = null;
function hashPassword(password, salt = crypto.randomBytes(8).toString('hex')) { return `${salt}:${crypto.scryptSync(password, salt, 32).toString('hex')}`; }
function checkPassword(password, stored) { return hashPassword(password, stored.split(':')[0]) === stored; }

const clients = [{ id: 'demo-client', name: 'Marina Costa', email: 'marina@exemplo.com', password: hashPassword('123456') }];
const admins = [{ id: 'admin-001', name: 'Rafael Martins', email: process.env.ADMIN_EMAIL || 'admin@gamevault.com', password: hashPassword(process.env.ADMIN_PASSWORD || 'admin123') }];
const bookings = [
  { id: ids(), clientId: 'demo-client', gameId: games[0].id, date: '2026-09-13', status: 'Confirmada', note: 'Partida para quatro pessoas.' }
];
const reviews = [
  { id: ids(), clientId: 'demo-client', gameId: games[1].id, rating: 5, comment: 'A historia e a jogabilidade sao excelentes.', reply: 'Obrigado, Marina. Boa jornada pelo submundo!' }
];

function currentState() { return { games, clients, bookings, reviews, admins }; }

async function save() {
  if (database) return database.saveState(currentState());
  try { fs.writeFileSync(DATA_FILE, JSON.stringify(currentState(), null, 2)); } catch (error) { console.error('Nao foi possivel salvar data.json:', error.message); }
}

function loadJson() {
  if (!fs.existsSync(DATA_FILE)) return false;
  try {
    const saved = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    games.splice(0, games.length, ...(saved.games || []));
    clients.splice(0, clients.length, ...(saved.clients || []));
    bookings.splice(0, bookings.length, ...(saved.bookings || []));
    reviews.splice(0, reviews.length, ...(saved.reviews || []));
    if (Array.isArray(saved.admins) && saved.admins.length) admins.splice(0, admins.length, ...saved.admins);
    return true;
  } catch (error) { console.error('data.json invalido, usando dados iniciais:', error.message); return false; }
}

function addMissingSeedGames() {
  let added = false;
  for (const seedGame of seedGames) {
    if (!games.some(game => game.title.toLowerCase() === seedGame.title.toLowerCase())) {
      games.push(seedGame);
      added = true;
    }
  }
  return added;
}

async function initializeData() {
  const databaseUrl = process.env.DATABASE_URL && !process.env.DATA_FILE;
  if (process.env.NODE_ENV === 'production' && !process.env.DATABASE_URL && !process.env.DATA_FILE) {
    throw new Error('DATABASE_URL é obrigatório em produção. Configure o PostgreSQL do Neon no serviço Render.');
  }
  if (databaseUrl) {
    const { createDatabase } = require('./db');
    database = createDatabase(process.env.DATABASE_URL);
    await database.initialize();
    const saved = await database.loadState();
    const hasDatabaseData = Object.values(saved).some(items => items.length > 0);
    if (hasDatabaseData) {
      games.splice(0, games.length, ...saved.games);
      clients.splice(0, clients.length, ...saved.clients);
      bookings.splice(0, bookings.length, ...saved.bookings);
      reviews.splice(0, reviews.length, ...saved.reviews);
      admins.splice(0, admins.length, ...saved.admins);
    } else if (loadJson()) {
      console.log('Migrando os dados locais do JSON para o PostgreSQL...');
    } else if (process.env.NODE_ENV === 'production' && !process.env.ADMIN_PASSWORD) {
      throw new Error('ADMIN_PASSWORD é obrigatório para criar a primeira conta administrativa em produção.');
    }
    if (!hasDatabaseData || addMissingSeedGames()) await save();
    console.log('Persistência PostgreSQL conectada.');
    return;
  }

  const loaded = loadJson();
  const addedSeedGame = addMissingSeedGames();
  if (!loaded || addedSeedGame) await save();
}

function session(account, role) {
  const token = crypto.randomBytes(24).toString('hex');
  tokens.set(token, { id: account.id, role });
  return { id: account.id, name: account.name, email: account.email, role, token };
}
function currentUser(req) { return tokens.get((req.headers.authorization || '').replace('Bearer ', '')); }
function cleanGame(data, current = {}) {
  const title = String(data.title || '').trim();
  const category = String(data.category || '').trim();
  const platform = String(data.platform || '').trim();
  const year = Number(data.year);
  const cover = String(data.cover || '').trim();
  if (!title || !category || !platform) throw new Error('Titulo, categoria e plataforma sao obrigatorios');
  if (!Number.isInteger(year) || year < 1970 || year > 2100) throw new Error('Ano invalido');
  if (cover && !/^https?:\/\//.test(cover)) throw new Error('A capa deve ser uma URL http(s)');
  const description = String(data.description || '').trim();
  return { color: '#7209B7', image: '🎮', duration: '30-60min', players: '1', age: 'Livre', level: 'Intermediário', genre: category, visits: 0, ai: description, ...current, title, category, platform, year, cover, description, featured: data.featured === true || data.featured === 'on' };
}

function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }); res.end(JSON.stringify(body)); }
function body(req) { return new Promise((resolve, reject) => { let data = ''; req.on('data', chunk => data += chunk); req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(new Error('JSON invalido')); } }); }); }
function findGame(id) { return games.find(item => item.id === id); }
function staticFile(req, res) {
  const requested = req.url === '/' ? 'index.html' : req.url.replace(/^\//, '');
  const file = path.join(publicDir, requested);
  if (!file.startsWith(publicDir) || !fs.existsSync(file)) return json(res, 404, { error: 'Nao encontrado' });
  const ext = path.extname(file);
  const type = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : 'application/javascript';
  res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
  fs.createReadStream(file).pipe(res);
}

async function api(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const user = currentUser(req);
  const need = role => { if (!user || (role && user.role !== role)) { json(res, 401, { error: 'Acesso nao autorizado. Entre novamente.' }); return false; } return true; };
  try {
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS' }); return res.end(); }
    if (req.method === 'GET' && parts[1] === 'games') {
      const query = (url.searchParams.get('q') || '').toLowerCase();
      const featured = url.searchParams.get('featured') === 'true';
      const filtered = games.filter(item => (!query || `${item.title} ${item.category} ${item.platform}`.toLowerCase().includes(query)) && (!featured || item.featured));
      return json(res, 200, await gamesWithCovers(filtered));
    }
    if (req.method === 'GET' && parts[1] === 'catalog' && parts[2] === 'steam' && !parts[3]) {
      const query = (url.searchParams.get('q') || '').trim();
      if (query.length < 2) return json(res, 400, { error: 'Digite pelo menos 2 caracteres para buscar jogos' });
      if (query.length > 80) return json(res, 400, { error: 'A busca deve ter no máximo 80 caracteres' });
      try {
        const endpoint = new URL('https://store.steampowered.com/api/storesearch/');
        endpoint.searchParams.set('term', query);
        endpoint.searchParams.set('l', 'brazilian');
        endpoint.searchParams.set('cc', 'br');
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return json(res, 502, { error: 'O catálogo Steam está temporariamente indisponível' });
        const result = await response.json();
        const results = (result.items || []).slice(0, 12).map(item => ({
          appId: String(item.id),
          title: item.name,
          cover: `https://cdn.akamai.steamstatic.com/steam/apps/${item.id}/header.jpg`,
          storeUrl: `https://store.steampowered.com/app/${item.id}/`
        }));
        return json(res, 200, { source: 'Steam Store', games: results });
      } catch (error) {
        console.error('Falha ao consultar Steam Store:', error.message);
        return json(res, 502, { error: 'Não foi possível consultar a Steam agora. Tente novamente mais tarde.' });
      }
    }
    if (req.method === 'POST' && parts[1] === 'catalog' && parts[2] === 'steam' && parts[3] === 'import') {
      if (!need('admin')) return;
      const data = await body(req);
      const appId = String(data.appId || '').trim();
      if (!/^\d{1,12}$/.test(appId)) return json(res, 400, { error: 'Identificador de jogo Steam inválido' });
      const existing = games.find(game => game.steamAppId === appId);
      if (existing) return json(res, 200, { ...existing, alreadyImported: true });
      try {
        const endpoint = new URL('https://store.steampowered.com/api/appdetails/');
        endpoint.searchParams.set('appids', appId);
        endpoint.searchParams.set('cc', 'br');
        endpoint.searchParams.set('l', 'brazilian');
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return json(res, 502, { error: 'Não foi possível consultar os detalhes deste jogo na Steam' });
        const result = await response.json();
        const details = result[appId]?.data;
        if (!result[appId]?.success || !details || details.type !== 'game') return json(res, 404, { error: 'Jogo não encontrado no catálogo Steam' });
        const importedDuringLookup = games.find(game => game.steamAppId === appId);
        if (importedDuringLookup) return json(res, 200, { ...importedDuringLookup, alreadyImported: true });
        const releaseDate = details.release_date?.date || '';
        const releaseYear = releaseDate.match(/(?:19|20)\d{2}/)?.[0];
        if (!releaseYear) return json(res, 422, { error: 'A Steam não informou o ano de lançamento; este jogo não pode ser importado automaticamente' });
        const genre = details.genres?.[0]?.description || 'Jogo Steam';
        const game = {
          id: ids(),
          title: details.name,
          category: genre,
          platform: 'PC',
          year: Number(releaseYear),
          featured: false,
          level: 'Intermediário',
          color: '#7209B7',
          visits: 0,
          image: '🎮',
          duration: '30-60min',
          players: '1',
          age: 'Livre',
          genre,
          description: details.short_description || '',
          ai: details.short_description || '',
          cover: details.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
          steamAppId: appId
        };
        games.push(game);
        await save();
        return json(res, 201, game);
      } catch (error) {
        console.error('Falha ao importar jogo da Steam:', error.message);
        return json(res, 502, { error: 'Não foi possível importar este jogo agora. Tente novamente mais tarde.' });
      }
    }
    if (req.method === 'GET' && parts[1] === 'dashboard') {
      if (!need('admin')) return;
      const gameStats = games.map(game => ({
        id: game.id,
        title: game.title,
        category: game.category,
        bookings: bookings.filter(b => b.gameId === game.id).length,
        avgRating: reviews.filter(r => r.gameId === game.id).length > 0 ? 
          (reviews.filter(r => r.gameId === game.id).reduce((sum, r) => sum + r.rating, 0) / reviews.filter(r => r.gameId === game.id).length).toFixed(1) : 0,
        reviewCount: reviews.filter(r => r.gameId === game.id).length
      }));
      const categoryStats = {};
      games.forEach(g => {
        categoryStats[g.category] = (categoryStats[g.category] || 0) + 1;
      });
      return json(res, 200, { 
        clients: clients.length, 
        bookings: bookings.length, 
        pendingBookings: bookings.filter(booking => booking.status === 'Solicitado').length,
        reviews: reviews.length, 
        games: games.length,
        gameStats: gameStats.sort((a, b) => b.bookings - a.bookings),
        categoryStats,
        recent: bookings.map(booking => ({ ...booking, client: clients.find(c => c.id === booking.clientId)?.name, game: findGame(booking.gameId)?.title })) 
      });
    }
    if (req.method === 'GET' && parts[1] === 'me') {
      const client = clients.find(item => item.id === user?.id);
      if (!client) return json(res, 401, { error: 'Cliente nao encontrado' });
      return json(res, 200, { client: { id: client.id, name: client.name, email: client.email }, bookings: bookings.filter(item => item.clientId === client.id).map(item => ({ ...item, game: findGame(item.gameId)?.title })), reviews: reviews.filter(item => item.clientId === client.id).map(item => ({ ...item, game: findGame(item.gameId)?.title })) });
    }
    if (req.method === 'GET' && parts[1] === 'bookings') {
      if (!need('admin')) return;
      const status = url.searchParams.get('status');
      const list = bookings.filter(booking => !status || booking.status === status).map(booking => ({
        ...booking,
        client: clients.find(client => client.id === booking.clientId)?.name || 'Cliente removido',
        clientEmail: clients.find(client => client.id === booking.clientId)?.email || '',
        game: findGame(booking.gameId)?.title || 'Jogo removido'
      }));
      return json(res, 200, list);
    }
    if (req.method === 'POST' && parts[1] === 'auth') {
      const data = await body(req);
      const email = String(data.email || '').trim().toLowerCase();
      const password = String(data.password || '');
      if (data.action === 'register') {
        const name = String(data.name || '').trim();
        if (!name || !email.includes('@') || password.length < 6) return json(res, 400, { error: 'Informe nome, e-mail valido e senha com 6 ou mais caracteres' });
        if ([...clients, ...admins].some(item => item.email === email)) return json(res, 409, { error: 'E-mail ja cadastrado' });
        const client = { id: ids(), name, email, password: hashPassword(password) };
        clients.push(client); await save();
        return json(res, 201, session(client, 'client'));
      }
      const admin = admins.find(item => item.email === email);
      const client = clients.find(item => item.email === email);
      const account = admin || client;
      if (!account || !checkPassword(password, account.password)) return json(res, 401, { error: 'E-mail ou senha incorretos' });
      return json(res, 200, session(account, admin ? 'admin' : 'client'));
    }
    if (req.method === 'POST' && parts[1] === 'games') { if (!need('admin')) return; const game = { id: ids(), ...cleanGame(await body(req)) }; games.push(game); await save(); return json(res, 201, game); }
    if (req.method === 'PUT' && parts[1] === 'games') {
      if (!need('admin')) return;
      const index = games.findIndex(item => item.id === parts[2]);
      if (index < 0) return json(res, 404, { error: 'Jogo nao encontrado' });
      games[index] = { id: games[index].id, ...cleanGame(await body(req), games[index]) }; await save();
      return json(res, 200, games[index]);
    }
    if (req.method === 'DELETE' && parts[1] === 'games') {
      if (!need('admin')) return;
      const index = games.findIndex(item => item.id === parts[2]);
      if (index < 0) return json(res, 404, { error: 'Jogo nao encontrado' });
      if (bookings.some(item => item.gameId === parts[2])) return json(res, 409, { error: 'Este jogo possui emprestimos vinculados e nao pode ser excluido' });
      games.splice(index, 1); reviews.splice(0, reviews.length, ...reviews.filter(item => item.gameId !== parts[2])); await save();
      return json(res, 200, { deleted: true });
    }
    if (req.method === 'POST' && parts[1] === 'bookings') {
      if (!need('client')) return;
      const data = await body(req);
      if (!findGame(data.gameId)) return json(res, 400, { error: 'Jogo nao encontrado' });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date || '') || Number.isNaN(Date.parse(`${data.date}T00:00:00Z`)) || new Date(`${data.date}T00:00:00Z`).toISOString().slice(0, 10) !== data.date) return json(res, 400, { error: 'Data invalida' });
      const today = new Date().toISOString().slice(0, 10);
      if (data.date < today) return json(res, 400, { error: 'A data do emprestimo nao pode estar no passado' });
      if (bookings.some(item => item.clientId === user.id && item.gameId === data.gameId && !['Devolvido', 'Cancelado', 'Recusado'].includes(item.status))) return json(res, 409, { error: 'Voce ja tem um emprestimo ativo deste jogo' });
      const booking = { id: ids(), clientId: user.id, gameId: data.gameId, date: data.date, status: 'Solicitado', note: '' };
      bookings.push(booking); await save();
      return json(res, 201, booking);
    }
    if (req.method === 'PATCH' && parts[1] === 'bookings') {
      if (!user) return json(res, 401, { error: 'Acesso nao autorizado. Entre novamente.' });
      if (user.role === 'admin') {
        const booking = bookings.find(item => item.id === parts[2]);
        if (!booking) return json(res, 404, { error: 'Solicitacao de emprestimo nao encontrada' });
        if (booking.status !== 'Solicitado') return json(res, 409, { error: 'Somente solicitacoes pendentes podem ser decididas' });
        const status = String((await body(req)).status || '');
        if (!['Confirmada', 'Recusado'].includes(status)) return json(res, 400, { error: 'Escolha autorizar ou recusar a solicitacao' });
        booking.status = status;
        booking.reviewedBy = user.id;
        booking.reviewedAt = new Date().toISOString();
        await save();
        return json(res, 200, { ...booking, client: clients.find(item => item.id === booking.clientId)?.name, game: findGame(booking.gameId)?.title });
      }
      if (user.role !== 'client') return json(res, 403, { error: 'Apenas clientes podem devolver emprestimos' });
      const booking = bookings.find(item => item.id === parts[2] && item.clientId === user.id);
      if (!booking) return json(res, 404, { error: 'Emprestimo nao encontrado' });
      if (booking.status !== 'Confirmada') return json(res, 409, { error: 'O emprestimo precisa ser autorizado pelo administrador antes da devolucao' });
      booking.status = 'Devolvido'; await save();
      return json(res, 200, booking);
    }
    if (req.method === 'DELETE' && parts[1] === 'bookings') {
      if (!need('client')) return;
      const booking = bookings.find(item => item.id === parts[2] && item.clientId === user.id);
      if (!booking) return json(res, 404, { error: 'Emprestimo nao encontrado' });
      if (booking.status !== 'Solicitado') return json(res, 409, { error: 'Somente emprestimos ainda solicitados podem ser cancelados' });
      booking.status = 'Cancelado'; await save();
      return json(res, 200, booking);
    }
    if (req.method === 'GET' && parts[1] === 'reviews') {
      if (!need('admin')) return;
      return json(res, 200, reviews.map(item => ({ ...item, client: clients.find(c => c.id === item.clientId)?.name, game: findGame(item.gameId)?.title })));
    }
    if (req.method === 'POST' && parts[1] === 'reviews') {
      if (!need('client')) return;
      const data = await body(req);
      const rating = Number(data.rating);
      const comment = String(data.comment || '').trim();
      if (!findGame(data.gameId)) return json(res, 400, { error: 'Jogo nao encontrado' });
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) return json(res, 400, { error: 'A nota deve ser de 1 a 5' });
      if (!comment) return json(res, 400, { error: 'Escreva um comentario' });
      const review = { id: ids(), clientId: user.id, gameId: data.gameId, rating, comment, reply: '' };
      reviews.push(review); await save();
      return json(res, 201, review);
    }
    if (req.method === 'POST' && parts[1] === 'ai') {
      const data = await body(req);
      const mood = String(data.mood || '').trim().slice(0, 500);
      if (!mood) return json(res, 400, { error: 'Descreva como você quer jogar para receber recomendações' });
      const recommendation = recommendGames(mood);
      const suggestions = recommendation.games.map(({ game, reasons }) => ({ ...game, recommendationReason: reasons.join(' · ') || 'Opção popular do catálogo' }));
      const preferenceSummary = recommendation.preferences.length ? `Preferências consideradas: ${recommendation.preferences.join(', ')}. ` : '';
      const localAnswer = recommendation.noExactMatch
        ? `Não encontrei uma combinação exata para “${mood}” no catálogo. ${preferenceSummary}Estas opções populares podem servir de alternativa.`
        : `${preferenceSummary}Minha principal sugestão é ${suggestions[0]?.title}: ${suggestions[0]?.recommendationReason || suggestions[0]?.description || ''}`;
      if (!process.env.OPENAI_API_KEY) return json(res, 200, { source: 'curadoria local', answer: localAnswer, games: suggestions });
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          signal: AbortSignal.timeout(10000),
          body: JSON.stringify({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'Você é um curador de videogames. Responda em português em até 3 frases. Recomende exclusivamente os títulos da lista fornecida; não invente títulos. Explique brevemente por que combinam com o pedido.' },
              { role: 'user', content: JSON.stringify({ pedido: mood, jogosDisponiveis: suggestions.map(({ title, category, genre, description, recommendationReason }) => ({ title, category, genre, description, motivoDaSugestao: recommendationReason })) }) }
            ],
            max_tokens: 160,
            temperature: 0.4
          })
        });
        if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}`);
        const result = await response.json();
        const answer = result.choices?.[0]?.message?.content?.trim();
        if (!answer) throw new Error('Resposta vazia da OpenAI');
        return json(res, 200, { source: 'OpenAI', answer, games: suggestions });
      } catch (error) {
        console.error('Falha na curadoria OpenAI:', error.message);
        return json(res, 200, { source: 'curadoria local (OpenAI indisponível)', answer: localAnswer, games: suggestions });
      }
    }
    if (req.method === 'PATCH' && parts[1] === 'reviews') {
      if (!need('admin')) return;
      const item = reviews.find(review => review.id === parts[2]);
      if (!item) return json(res, 404, { error: 'Avaliacao nao encontrada' });
      item.reply = String((await body(req)).reply || '').trim(); await save();
      return json(res, 200, item);
    }
    return json(res, 404, { error: 'Rota nao encontrada' });
  } catch (error) { return json(res, 400, { error: error.message }); }
}

const server = http.createServer((req, res) => req.url.startsWith('/api/') ? api(req, res) : staticFile(req, res));
initializeData()
  .then(() => server.listen(PORT, () => console.log(`GameVault running at http://localhost:${PORT}`)))
  .catch(error => {
    console.error('Falha ao inicializar o armazenamento:', error.message);
    process.exitCode = 1;
    server.close();
  });
