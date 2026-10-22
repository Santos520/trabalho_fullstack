// Contratos revisados do roteador http nativo. As marcações em server.js são
// descobertas pelo swagger-autogen e conferidas antes de aplicar estes detalhes.
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const str = { type: 'string' };
const integer = { type: 'integer' };
const object = (properties, required = []) => ({ type: 'object', properties, ...(required.length ? { required } : {}) });
const array = items => ({ type: 'array', items });
const response = (description, schema) => ({ description, ...(schema ? { content: { 'application/json': { schema } } } : {}) });
const input = (schema, required = true) => ({ required, content: { 'application/json': { schema } } });
const id = { name: 'id', in: 'path', required: true, description: 'Identificador do registro retornado pela API.', schema: str };
const query = (name, schema, description) => ({ name, in: 'query', schema, description });
const schemas = {
  Error: object({ error: str }, ['error']),
  Session: object({ id: str, name: str, email: str, role: { enum: ['admin', 'client'], type: 'string' }, token: str }, ['id', 'name', 'email', 'role', 'token']),
  Client: object({ id: str, name: str, email: str }, ['id', 'name', 'email']),
  Login: object({ email: { ...str, example: 'jogador@example.com' }, password: { ...str, format: 'password' } }, ['email', 'password']),
  Registration: object({ action: { type: 'string', enum: ['register'] }, name: str, email: str, password: { ...str, minLength: 6, format: 'password' } }, ['action', 'name', 'email', 'password']),
  GameInput: object({ title: { ...str, example: 'Meu jogo' }, category: { ...str, example: 'Aventura' }, platform: { ...str, example: 'PC' }, year: { type: 'integer', minimum: 1970, maximum: 2100, example: 2024 }, cover: { ...str, description: 'URL http(s) ou string vazia.' }, description: str, featured: { oneOf: [{ type: 'boolean' }, { type: 'string', enum: ['on'] }] } }, ['title', 'category', 'platform', 'year']),
  Game: object({ id: str, title: str, category: str, platform: str, year: integer, featured: { type: 'boolean' }, cover: str, coverPublicId: str, color: str, image: str, duration: str, players: str, age: str, level: str, genre: str, description: str, ai: str, visits: integer, steamAppId: str, alreadyImported: { type: 'boolean' }, recommendationReason: str }, ['id', 'title', 'category', 'platform', 'year']),
  CatalogGame: object({ appId: str, title: str, cover: str, storeUrl: str }, ['appId', 'title', 'cover', 'storeUrl']),
  Booking: object({ id: str, clientId: str, gameId: str, date: { type: 'string', format: 'date' }, status: { type: 'string', enum: ['Solicitado', 'Confirmada', 'Recusado', 'Devolvido', 'Cancelado'] }, note: str, reviewedBy: str, reviewedAt: { type: 'string', format: 'date-time' }, client: str, clientEmail: str, game: str }, ['id', 'clientId', 'gameId', 'date', 'status']),
  Review: object({ id: str, clientId: str, gameId: str, rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: str, reply: str, client: str, game: str }, ['id', 'clientId', 'gameId', 'rating', 'comment', 'reply']),
  Dashboard: object({ clients: integer, bookings: integer, pendingBookings: integer, reviews: integer, games: integer, gameStats: array(object({ id: str, title: str, category: str, bookings: integer, avgRating: { oneOf: [str, { type: 'number' }], description: 'String com uma casa decimal, ou zero numérico sem avaliações.' }, reviewCount: integer })), categoryStats: { type: 'object', additionalProperties: integer }, recent: array(ref('Booking')) }),
  Me: object({ client: ref('Client'), bookings: array(ref('Booking')), reviews: array(ref('Review')) }, ['client', 'bookings', 'reviews']),
  Recommendation: object({ source: str, answer: str, games: array(ref('Game')) }, ['source', 'answer', 'games'])
};
const errors = {
  400: 'Corpo JSON ou campos inválidos.', 401: 'Sessão ausente, inválida ou perfil sem permissão.',
  403: 'Perfil não permitido.', 404: 'Registro não encontrado.', 409: 'Conflito com o estado atual.',
  422: 'A Steam não informou o ano de lançamento.', 502: 'Serviço externo indisponível.'
};
function operation(tag, summary, { role, body, parameters = [], ok = { 200: ref('Game') }, codes = [], description = '' } = {}) {
  return {
    tags: [tag], summary, description: `${role ? `Acesso: ${role}. ` : ''}${description}`,
    security: role ? [{ bearerAuth: [] }] : [],
    ...(parameters.length ? { parameters } : {}), ...(body ? { requestBody: body } : {}),
    responses: {
      ...Object.fromEntries(Object.entries(ok).map(([code, schema]) => [code, response('Operação concluída.', schema)])),
      ...Object.fromEntries([...new Set([...codes, ...(role ? [401] : [])])].map(code => [code, response(errors[code], ref('Error'))]))
    }
  };
}
const paths = {
  '/api/games/{id}/cover': { post: {
    tags: ['Jogos'], summary: 'Enviar ou substituir capa do jogo',
    description: 'Acesso: admin. Envie somente imagem (PNG, JPEG ou WebP), menor que 5 MiB; MIME e assinatura precisam corresponder. Sem campos textuais. Pasta fixa gamevault/covers. Salva URL HTTPS e public_id no payload do jogo, preserva a capa anterior se falhar e tenta remover recursos sem vínculo. O Cloudinary verifica se a imagem é decodificável.',
    security: [{ bearerAuth: [] }], parameters: [id],
    requestBody: { required: true, content: { 'multipart/form-data': { schema: { type: 'object', required: ['imagem'], additionalProperties: false, properties: { imagem: { type: 'string', format: 'binary', description: 'PNG, JPEG ou WebP menor que 5 MiB.' } } } } } },
    responses: {
      201: response('Capa persistida; retorna o jogo atualizado.', ref('Game')),
      ...Object.fromEntries(Object.entries({ 400: 'Arquivo ausente, multipart inválido ou campos extras.', 401: 'Requer sessão admin.', 404: 'Jogo não encontrado.', 409: 'Jogo alterado ou excluído durante o upload.', 413: 'Arquivo excede o limite.', 415: 'Content-Type, tipo ou assinatura inválida.', 500: 'Falha de persistência; capa anterior preservada e limpeza tentada.', 502: 'Falha de comunicação ou resposta inválida do Cloudinary.', 503: 'Cloudinary não configurado.' }).map(([code, message]) => [code, response(message, ref('Error'))]))
    }
  } },
  '/api/auth': { post: operation('Autenticação', 'Entrar ou cadastrar cliente', { body: input({ anyOf: [ref('Login'), ref('Registration')] }), ok: { 200: ref('Session'), 201: ref('Session') }, codes: [400, 401, 409], description: 'action=register cria cliente; os demais valores fazem login. E-mail é normalizado. Registro exige nome, e-mail contendo @ e senha de 6 caracteres. Token opaco em memória; reinício encerra sessões.' }) },
  '/api/games': {
    get: operation('Jogos', 'Consultar catálogo', { parameters: [query('q', str, 'Busca parcial por título, categoria ou plataforma, sem diferenciar maiúsculas.'), query('featured', { type: 'boolean' }, 'Somente o valor literal true filtra destaques.')], ok: { 200: array(ref('Game')) }, description: 'Omite visits; resolve capa por URL própria, mapa local ou fontes remotas.' }),
    post: operation('Jogos', 'Cadastrar jogo', { role: 'admin', body: input(ref('GameInput')), ok: { 201: ref('Game') }, codes: [400] })
  },
  '/api/games/{id}': {
    put: operation('Jogos', 'Atualizar jogo', { role: 'admin', parameters: [id], body: input(ref('GameInput')), codes: [400, 404], description: 'Título, categoria, plataforma e ano são obrigatórios em toda atualização. Campos opcionais omitidos são redefinidos conforme o cadastro; demais atributos existentes são preservados.' }),
    delete: operation('Jogos', 'Excluir jogo e suas avaliações', { role: 'admin', parameters: [id], ok: { 200: object({ deleted: { type: 'boolean' } }, ['deleted']) }, codes: [404, 409], description: 'Qualquer empréstimo vinculado, inclusive concluído, impede exclusão.' })
  },
  '/api/catalog/steam': { get: operation('Steam', 'Buscar jogos na Steam Store', { parameters: [{ ...query('q', { ...str, minLength: 2, maxLength: 80 }, 'Título a procurar.'), required: true }], ok: { 200: object({ source: str, games: array(ref('CatalogGame')) }, ['source', 'games']) }, codes: [400, 502] }) },
  '/api/catalog/steam/import': { post: operation('Steam', 'Importar metadados de um jogo', { role: 'admin', body: input(object({ appId: { type: 'string', pattern: '^\\d{1,12}$', example: '1145360' } }, ['appId'])), ok: { 200: ref('Game'), 201: ref('Game') }, codes: [400, 404, 422, 502], description: '200 e alreadyImported=true se o appId já estiver cadastrado; 201 em nova importação.' }) },
  '/api/dashboard': { get: operation('Administração', 'Consultar indicadores e histórico', { role: 'admin', ok: { 200: ref('Dashboard') } }) },
  '/api/me': { get: operation('Conta', 'Consultar perfil e interações do cliente', { role: 'client', ok: { 200: ref('Me') } }) },
  '/api/bookings': {
    get: operation('Empréstimos', 'Listar empréstimos e solicitações', { role: 'admin', parameters: [query('status', str, 'Filtro exato por status; valor desconhecido retorna lista vazia.')], ok: { 200: array(ref('Booking')) } }),
    post: operation('Empréstimos', 'Solicitar empréstimo', { role: 'client', body: input(object({ gameId: str, date: { type: 'string', format: 'date' } }, ['gameId', 'date'])), ok: { 201: ref('Booking') }, codes: [400, 409], description: 'Data válida a partir de hoje (UTC). Não permite empréstimo ativo duplicado do mesmo jogo/cliente. Status inicial Solicitado.' })
  },
  '/api/bookings/{id}': {
    patch: operation('Empréstimos', 'Decidir solicitação ou devolver empréstimo', { role: 'admin ou client', parameters: [id], body: input(object({ status: { type: 'string', enum: ['Confirmada', 'Recusado'] } }), false), codes: [400, 403, 404, 409], ok: { 200: ref('Booking') }, description: 'Admin informa status obrigatório para decidir uma solicitação pendente. Cliente envia sem corpo para devolver empréstimo próprio Confirmada; corpo é ignorado nessa operação.' }),
    delete: operation('Empréstimos', 'Cancelar solicitação própria', { role: 'client', parameters: [id], ok: { 200: ref('Booking') }, codes: [404, 409], description: 'Somente empréstimos com status Solicitado podem ser cancelados.' })
  },
  '/api/reviews': {
    get: operation('Avaliações', 'Listar avaliações', { role: 'admin', ok: { 200: array(ref('Review')) } }),
    post: operation('Avaliações', 'Avaliar jogo', { role: 'client', body: input(object({ gameId: str, rating: { type: 'integer', minimum: 1, maximum: 5 }, comment: { ...str, minLength: 1 } }, ['gameId', 'rating', 'comment'])), ok: { 201: ref('Review') }, codes: [400], description: 'Comentário não pode ser vazio após trim; o cliente é obtido do token.' })
  },
  '/api/reviews/{id}': { patch: operation('Avaliações', 'Responder avaliação', { role: 'admin', parameters: [id], body: input(object({ reply: str })), ok: { 200: ref('Review') }, codes: [400, 404], description: 'reply omitido ou vazio remove a resposta anterior.' }) },
  '/api/ai': { post: operation('Curadoria', 'Recomendar jogos do catálogo', { body: input(object({ mood: { ...str, minLength: 1, example: 'Quero relaxar e jogar com amigos' } }, ['mood'])), ok: { 200: ref('Recommendation') }, codes: [400], description: 'Usa no máximo 500 caracteres do pedido. Retorna até três jogos; se OpenAI não estiver configurada ou falhar, usa curadoria local.' }) }
};

module.exports = {
  openapi: '3.0.0',
  info: { title: 'GameVault API', version: '1.0.0', description: 'Biblioteca de jogos: catálogo, empréstimos, avaliações, curadoria e administração. Faça login em POST /api/auth e cole somente o token retornado em Authorize. Permissões por perfil estão descritas em cada operação; a API existente responde 401 também para perfil incorreto. Respostas de erro seguem {error: string}.' },
  servers: [{ url: '/', description: 'Mesma origem e porta da documentação (local ou backend Render).' }],
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Token opaco de POST /api/auth. Não é JWT; não persiste entre reinícios.' } }, schemas },
  paths
};
