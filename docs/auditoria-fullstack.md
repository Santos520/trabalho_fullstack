# Auditoria e implementação acadêmica — 22/10/2026

## Estado original (antes da implementação)

- Raiz: `trabalho_fullstack-main`; branch `main`, remoto `origin` no GitHub. Nenhuma alteração em arquivos rastreados; somente `slides/` não versionada. Nenhum AGENTS.md encontrado no workspace.
- Backend CommonJS em `server.js`, com `http.createServer`, roteamento por método e segmentos de URL. Não há Express, controllers, Prisma, Zod ou aplicação TypeScript. `neon.ts` é configuração auxiliar do Neon, sem `tsconfig.json` ou etapa de compilação.
- Frontend estático em `public/`, com fetch para `/api/`, sessões no localStorage, Chart.js externo e formulários administrativos. Vercel publica `public/` e encaminha `/api/*` ao Render.
- Validações manuais no servidor; senhas com scrypt, tokens opacos em memória e perfis admin/client. Tokens não são JWT e deixam de funcionar ao reiniciar o processo.
- `db.js` usa pg e transações para gravar snapshots em cinco tabelas relacionadas. Os atributos opcionais dos jogos ficam em `games.payload` JSONB. `db/schema.sql` contém DDL idempotente; não existe diretório de migrations Prisma. Sem DATABASE_URL, usa JSON local; produção exige PostgreSQL.
- Scripts originais: start e test. Sem build, lint ou compilação TypeScript configurados. Dependências inicialmente não instaladas; `npm ci` restaurou o lockfile existente.
- Baseline: `npm test` aprovou **14/14** testes (HTTP de catálogo, autenticação, permissões, CRUD, empréstimos, avaliações, curadoria, validação Steam e inspeção estática do DDL). `node --check` aprovou server.js, db.js e public/app.js. O sandbox bloqueou subprocessos com EPERM; a execução autorizada fora dele passou.
- Não havia `.env` nem data.json no workspace. Não foram acessadas credenciais ou alterados dados de produção. PostgreSQL, Steam e OpenAI reais não foram exercitados pelo baseline.

## Materiais consultados

Os PDFs locais `slides/Full Stack - Swagger.pdf` (14 páginas) e `slides/Full Stack - Multer Cloudinary (2).pdf` (18 páginas) foram lidos por extração de texto e inspeção das capturas incorporadas. Mostram Swagger Autogen/OpenAPI, Swagger UI, Multer em memória, upload_stream/streamifier e persistência Prisma/Zod em fotos de carros. O enunciado complementa os critérios de validação e segurança. Nenhuma credencial dos exemplos deve ser reutilizada.

## Problemas preexistentes

- Fortnite aparece duas vezes no seed; addMissingSeedGames recoloca jogos seed excluídos ao reiniciar.
- save() local registra erros de escrita sem propagá-los, permitindo sucesso HTTP sem persistência.
- resolveCover prioriza mapas fixos antes de game.cover, ocultando capas cadastradas para títulos seed.
- Roteamento aceita sufixos extras em diversas rotas; staticFile usa comparação de prefixo, não confere diretórios e não trata erros de stream. Escopo desta entrega: adicionar despacho seguro para documentação, sem refatorar todas as rotas.
- Autenticação/sessões, hash síncrono, corpo JSON sem limite, CORS aberto e snapshot global de dados têm limitações para escala e endurecimento futuro. Não fazem parte da substituição por JWT, ORM ou framework.
- DDL é verificado estaticamente; isso não comprova conexão ou transação real no PostgreSQL. Não há testes reais de serviços externos.

## Decisões

Manter http nativo e as rotas existentes. Servir Swagger UI com swagger-ui-dist e especificação OpenAPI 3.0.0 gerada por swagger-autogen usando marcações explícitas no verdadeiro roteador, complementada com contratos revisados. Não instalar Express, tipos TS, tsx, Prisma, Zod ou streamifier: JavaScript e streams nativos atendem o projeto.

Adicionar POST `/api/games/{id}/cover` (admin), campo multipart `imagem`, sem campos textuais adicionais. Multer memoryStorage, limite 5 MiB, PNG/JPEG/WebP e conferência de assinatura. Cloudinary usa pasta fixa gamevault/covers e retorna secure_url/public_id, persistidos em cover/coverPublicId no payload atual, sem migration. Upload inválido não deve alcançar o provedor. Reverter em memória e excluir a imagem nova se persistência falhar; remover imagem anterior somente após persistir. Falhas de limpeza são registradas sem segredos e podem exigir reconciliação manual.

Sem bloqueio crítico identificado. O usuário autorizou prosseguimento automático, trabalho no workspace e ausência de commits/push; essas instruções prevalecem sobre gates genéricos das habilidades. Implementação e revisão serão locais.

## Implementação entregue

### Swagger

- Criados `swagger.js`, `docs/openapi.js`, `swagger-output.json` e `api-docs.js`; alterados `server.js`, `package.json`, lockfile e testes. README atualizado.
- Dependência de execução: swagger-ui-dist 5.34.0. Desenvolvimento: swagger-autogen 2.23.7 e @apidevtools/swagger-parser 13.1.0. A instalação advertiu sobre glob/inflight transitivos obsoletos do gerador; não há substituição forçada de dependências.
- `npm run swagger` descobre as marcações explícitas no verdadeiro roteador, exige correspondência com os contratos complementares, valida OpenAPI 3.0.0 e grava JSON reproduzível. O arquivo gerado deve acompanhar o deploy; o servidor não precisa das dependências de desenvolvimento para servir a documentação.
- GET `/docs` e `/docs/` servem Swagger UI com assets locais e JSON em `/docs/openapi.json`. Servidor relativo `/` funciona na porta configurada e na origem do backend Render. Vercel continua servindo somente frontend e proxy de `/api/*`.
- 18 operações: POST auth; GET/POST games; PUT/DELETE games/{id}; POST games/{id}/cover; GET catalog/steam; POST catalog/steam/import; GET dashboard; GET me; GET/POST bookings; PATCH/DELETE bookings/{id}; GET/POST reviews; PATCH reviews/{id}; POST ai.
- Schemas, parâmetros, obrigatoriedade, códigos HTTP, exemplos e autorização por token opaco/papel estão documentados. Nenhum token ou credencial real foi incluído. O esquema não declara JWT inexistente.

### Multer e Cloudinary

- Criado `image-upload.js`; integrado endpoint no servidor; acrescentadas três variáveis vazias a `.env.example`; criados testes HTTP, testes de persistência assíncrona e fixture externa em `fixtures/cloudinary-preload.cjs`.
- Dependências: multer 2.5.0 e cloudinary 2.11.0. Buffer em memoryStorage, upload_stream com streams nativos, pasta fixa gamevault/covers e timeout do SDK em 15 segundos. Sem streamifier porque Node já fornece Readable/pipeline.
- POST `/api/games/{id}/cover` exige admin e jogo existente; aceita um arquivo `imagem`, PNG/JPEG/WebP menor que 5 MiB. Confere MIME e assinatura, proíbe campos extras e arquivos adicionais e trata multipart truncado. A decodificação completa fica com o Cloudinary.
- Retorno 201 com o jogo atualizado. Campos cover e coverPublicId persistidos em payload JSONB/JSON existente. Não foi instalado Prisma/Zod nem criada migration; não se aplica o erro Prisma P2003. Referência inexistente retorna 404 antes de chamar o serviço.
- Mídia nova é compensada em falha de persistência ou alteração/exclusão durante upload. Limpeza anterior somente depois de confirmar gravação; falha de limpeza não transforma sucesso persistido em erro. Logs de limpeza contêm apenas public_id para reconciliação.
- Corrigida prioridade da capa própria. save() agora propaga erros e usa escrita temporária/rename para manter o JSON anterior em escrita parcial. A nova capa só entra em memória depois da confirmação da gravação; uma fila compartilhada pelas mutações impede snapshots concorrentes com URL provisória. Fila de uploads por jogo evita perda de referência em substituições concorrentes.
- Nenhum formulário ou contrato anterior foi removido. O upload é utilizável via Swagger/curl; o formulário administrativo existente continua aceitando URL.

## Verificação final e revisão

Baseline: 14/14 testes. Após implementação e correções: **29/29 testes aprovados**, sem falhas ou skips. Falhas observadas nas fases RED eram esperadas e foram corrigidas: /docs ausente, upload ausente, escrita parcial, publicação prematura em persistência assíncrona e despacho de upload com barras repetidas. Um teste filtrado pelo nome ficou pendente no runner do Node; somente esse runner e seus subprocessos foram encerrados. As verificações finais usam a suíte completa.

Foram verificados:

- Geração e validação estrutural OpenAPI; 18 operações com correspondência de métodos/caminhos.
- HTTP /docs, assets JS/CSS, JSON, catálogo e regressão dos fluxos anteriores.
- Sem admin, perfil client, jogo inexistente, conteúdo não multipart, arquivo ausente, MIME proibido/forjado/divergente, campo incorreto/extra, múltiplos arquivos, tamanho excedido e multipart truncado.
- Sucesso por Cloudinary simulado com persistência real em arquivo temporário; prioridade sobre capa fixa e remoção das capas substituídas.
- Falha de configuração 503; falha de provedor/stream 502 sem detalhes internos; erro de gravação 500 sem substituir capa; remoção do recurso novo em compensação.
- Limpeza remota falha sem desfazer gravação confirmada; escrita parcial mantém JSON original; exclusão durante upload não recria jogo; uploads concorrentes preservam a última capa.
- Persistência assíncrona simulada mantém capa antiga visível até confirmar e bloqueia mutação concorrente para não copiar public_id provisório.
- Revisão independente encontrou propriedades herdadas na lista de assets, parsing indevido de request-target e publicação prematura da capa. Os três foram corrigidos e receberam cobertura de regressão. Nenhuma alteração foi feita pelo revisor.
- npm ls --depth=0 sem dependências ausentes e npm audit --omit=dev com **zero vulnerabilidades de produção**.
- Checagens de sintaxe em todos os JS próprios e git diff --check. Sem build/lint/tsconfig configurados; não se declara compilação TypeScript ou build inexistente como aprovado.

## Limitações, pendências e decisões de escopo

- Problema conhecido ainda não corrigido neste checkpoint: operações comuns de cadastro, edição, exclusão e empréstimo alteram o estado em memória antes de confirmar `save()`, sem desfazer a alteração se a persistência falhar. Na reprodução isolada de `POST /api/games` com falha simulada de gravação, a API retornou HTTP 400 e o novo jogo permaneceu em memória (`server.js:618`). A gravação posterior de outro snapshot pode persistir essa alteração rejeitada. A lógica permanece preservada por decisão explícita; sua correção será uma tarefa independente. O tratamento específico de upload de capas não elimina esse problema das demais operações.
- Preencher CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY e CLOUDINARY_API_SECRET no backend para uso real. Não havia `.env` local; nenhuma credencial foi solicitada nem inventada. Nenhum arquivo foi enviado a serviços externos durante os testes.
- PostgreSQL/Neon real, transações/restrições reais, Cloudinary real, Steam/OpenAI reais e deploy não foram testados nesta tarefa por ausência de infraestrutura/credenciais de teste. A inspeção do DDL e a simulação de persistência assíncrona não substituem teste com PostgreSQL.
- A interface Swagger foi validada por HTTP e inspeção dos assets/initializer, sem automação visual de navegador.
- Exclusão de jogo ou alteração manual de URL não remove mídia anterior automaticamente. Limpeza que falhar, timeout com resultado desconhecido e encerramento abrupto podem deixar recursos para reconciliação manual; isso está descrito no README. Não há transação distribuída ou fila durável de limpeza.
- A fila de mutações atende um processo único, coerente com o estado global atual. Outras mutações podem aguardar chamadas já em curso. Escala em múltiplas instâncias, sessões persistentes, corpo JSON limitado, problemas de seed, CORS e endurecimento geral continuam fora do escopo.
- Mantidos http nativo, pg e JS, em vez de migrar o projeto para o exemplo Express/Prisma/TS dos slides. Custo dessa decisão: contratos/rotas explícitos precisam ser atualizados juntos. Essa preservação evita refatoração ampla e migrations desnecessárias.
- Nenhum commit, push, reset, limpeza de dados ou migration destrutiva foi executado. PDFs locais e alterações anteriores preservados. Ferramentas temporárias de auditoria e cache estão ignorados no Git.
