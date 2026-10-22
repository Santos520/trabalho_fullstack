# Plano de implementação — Swagger e capas

**Objetivo:** cumprir os dois materiais acadêmicos preservando contratos e arquitetura do GameVault.
**Referência:** `docs/auditoria-fullstack.md` e enunciado fornecido.
**Execução:** no workspace atual, sem commits/push e sem alterações em dados externos.

## Tarefa 1 — Swagger

- [x] Adicionar testes HTTP para /docs, assets e /docs/openapi.json, incluindo os métodos reais, segurança Bearer opaca e schemas; observar falha antes da implementação.
- [x] Instalar swagger-ui-dist (runtime), swagger-autogen e @apidevtools/swagger-parser (desenvolvimento).
- [x] Criar docs/openapi.js com contratos completos; swagger.js gera swagger-output.json a partir das marcações em server.js, confere cobertura e valida OpenAPI.
- [x] Criar api-docs.js para servir UI e assets locais com caminhos limitados e integrar ao http.createServer existente. Preservar scripts e adicionar npm run swagger.
- [x] Executar geração, validação e testes de regressão.

## Tarefa 2 — Multer/Cloudinary

- [x] Testar endpoint protegido, jogo inexistente, multipart inválido, arquivo ausente, tipos/signaturas inválidos, tamanho, campos extras e indisponibilidade do provedor; observar falhas.
- [x] Instalar multer/cloudinary. Criar image-upload.js: processamento em memória e serviço Cloudinary por stream nativo com configuração de ambiente e pasta fixa.
- [x] Integrar POST /api/games/:id/cover antes do CRUD, preservando autorização. Salvar cover e coverPublicId no payload existente. Propagar falhas locais, reverter capa e compensar upload em falha de gravação. Serializar substituições por jogo para evitar vazamentos por uploads concorrentes.
- [x] Testar sucesso e substituição com provedor simulado, falha de persistência, falha de limpeza, corrida com remoção, persistência JSON e prioridade de capa própria sobre mapa. Não fazer upload real.
- [x] Acrescentar contrato multipart à geração OpenAPI e variáveis vazias ao .env.example.

## Tarefa 3 — Entrega

- [x] Atualizar README com instalação, geração, /docs no backend Render, autenticação, curl multipart, variáveis e limitações.
- [x] Rodar npm run swagger, npm test, checagens de sintaxe, integridade de dependências e git diff --check.
- [x] Revisar o diff, registrar resultados e limitações em docs/auditoria-fullstack.md; preservar PDFs e mudanças originais.

## Pontos de revisão

Arquivos MIME forjado, multipart truncado, falha de disco, exclusão durante upload e uploads concorrentes não podem produzir sucesso falso nem apagar a capa atual. URL da UI deve usar a origem do backend para funcionar em qualquer porta, sem credenciais no documento.

## Registro de execução

- Baseline 14/14; documentação 15/15; upload inicial 21/21; revisão e cenários adicionais 29/29.
- Decisão: preservar o workspace atual conforme enunciado, sem worktree, commit ou push.
- Decisão: manter http/pg/JS e streams nativos; sem Express/Prisma/Zod/tsx/streamifier.
- Correções após revisão: acesso a assets por Object.hasOwn, guard sem parsing externo, persistência de estado proposto antes da publicação e fila compartilhada de mutações.
- Escrita JSON atômica adicionada após reprodução de corrupção em escrita parcial.
- Limitações de nuvem/banco real e decisões de limpeza documentadas no relatório de auditoria.
