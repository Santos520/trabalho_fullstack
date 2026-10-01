# GameVault

MVP full stack de uma biblioteca de jogos eletrônicos para PC, consoles e dispositivos móveis. O catálogo apresenta capas reais, busca, filtros, empréstimos, avaliações, curadoria por IA e painel administrativo.

## Executar localmente

Instale as dependências:

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

Sem `DATABASE_URL`, o modo local utiliza `data.json`. Para desenvolver com PostgreSQL, copie `.env.example` para `.env`, preencha `DATABASE_URL` com a connection string do Neon e defina `DATABASE_SSL=true`. As tabelas são criadas automaticamente na primeira inicialização. Em desenvolvimento, o login admin padrão é `admin@gamevault.com` / `admin123`; defina credenciais próprias antes de publicar.

## Testes automatizados

Execute `npm test` para iniciar uma instância isolada da API e testar catálogo/capas, cadastro/login, permissões, CRUD administrativo, empréstimos e decisão do admin, avaliações, curadoria e o esquema relacional. Os testes usam arquivos temporários e não alteram o banco ou `data.json` real.

## Contas demonstrativas

- Cliente: `marina@exemplo.com` / `123456`
- Admin: `admin@gamevault.com` / `admin123`

## O que esta implementado

- Catálogo expandido com mais de 30 jogos eletrônicos reais e capas via Steam CDN.
- Busca por título, gênero ou plataforma e filtro de jogos mais procurados.
- Detalhes protegidos por login e solicitação de empréstimos.
- Cadastro e login de clientes.
- UUID do cliente persistido no `localStorage`.
- Solicitação de empréstimos e acompanhamento na área do cliente.
- Avaliacao com nota e comentario.
- Login administrativo e dashboard com indicadores de jogos, empréstimos e avaliações.
- Três gráficos no dashboard: empréstimos por jogo, categorias e avaliações.
- Curadoria limitada ao catálogo, capaz de combinar estilo, modo de jogo, duração e gêneros a evitar. O catálogo também exibe em cada card o campo “Dica da IA”; as sugestões mostram por que foram escolhidas e avisam quando não há correspondência exata.
- API REST em Node com jogos, clientes, empréstimos, avaliações e admins.
- CRUD completo de jogos no painel administrativo (criar, editar e excluir).
- Autenticação por token: rotas de admin e da área do cliente exigem login; senhas guardadas com hash (scrypt).
- Validações no servidor (e-mail duplicado, nota de 1 a 5, data, jogo existente, empréstimo ativo duplicado).
- Empréstimos começam como solicitações pendentes; o admin pode autorizar ou recusar no painel. Clientes só podem devolver empréstimos autorizados e cancelar solicitações pendentes.
- Botão de logout do admin disponível em todas as abas administrativas; visão geral com gráficos responsivos e área de rolagem adequada.
- Busca no catálogo público Steam Store e importação admin com um clique, preenchendo capa, descrição, gênero e ano sem cadastro manual dos metadados.
- Capas usam IDs Steam corrigidos; títulos fora da Steam usam imagens verificadas e jogos novos sem capa tentam busca exata por título, com placeholder ilustrado se a fonte estiver indisponível. Não há sincronização de bibliotecas Steam/PSN/Xbox.
- Resposta real da OpenAI exibida quando configurada, com recomendações limitadas aos jogos do catálogo e fallback local em caso de indisponibilidade.
- Devolução de empréstimos pelo cliente e resposta do admin às avaliações.
- Persistência relacional PostgreSQL com cinco tabelas relacionadas quando `DATABASE_URL` está configurada; `data.json` continua disponível como fallback de desenvolvimento.

## Banco de dados e modelo ER

O esquema PostgreSQL contém `admins`, `clients`, `games`, `bookings` e `reviews`, com chaves estrangeiras, índice de busca por status/data, nota limitada a 1–5 e payload JSON para os campos opcionais do catálogo. O diagrama Entidade-Relacionamento está em [docs/modelo-er.md](docs/modelo-er.md); o DDL aplicado pelo backend está em [db/schema.sql](db/schema.sql).

## Deploy

1. Crie um banco PostgreSQL no Neon e copie a connection string com SSL.
2. Publique o repositório no Render usando [render.yaml](render.yaml). Configure `DATABASE_URL`, `ADMIN_EMAIL` e `ADMIN_PASSWORD` como variáveis secretas do serviço; a aplicação não inicia em produção sem PostgreSQL e senha inicial do admin.
3. Publique o frontend na Vercel usando [vercel.json](vercel.json). Se o serviço Render tiver outro nome/URL, ajuste o destino `/api/*` para apontar ao seu backend.
4. Opcionalmente configure `OPENAI_API_KEY` no Render para habilitar respostas da OpenAI; sem a chave a curadoria local continua funcionando.

As tabelas são migradas automaticamente ao iniciar o backend. Os segredos (connection string, senha admin e chave OpenAI) devem ser inseridos diretamente nos painéis do Neon/Render/Vercel e nunca commitados no repositório.

## Endpoints da API

| Método | Rota | Acesso |
| --- | --- | --- |
| POST | `/api/auth` | Público (login ou cadastro com `action: "register"`) |
| GET | `/api/games?q=&featured=` | Público |
| POST / PUT / DELETE | `/api/games` e `/api/games/:id` | Admin |
| GET | `/api/me` | Cliente logado |
| POST | `/api/bookings` | Cliente logado |
| GET | `/api/bookings` | Admin (solicitações e histórico) |
| PATCH | `/api/bookings/:id` | Admin (autoriza/recusa solicitação) ou cliente (devolve após autorização) |
| DELETE | `/api/bookings/:id` | Cliente logado (cancela solicitação ainda não confirmada) |
| POST | `/api/reviews` | Cliente logado |
| GET | `/api/reviews` e PATCH `/api/reviews/:id` | Admin (listar e responder) |
| GET | `/api/dashboard` | Admin |
| POST | `/api/ai` | Público |
| GET | `/api/catalog/steam?q=` | Público (busca título e capa na Steam Store) |
| POST | `/api/catalog/steam/import` | Admin (importa jogo pelo `appId`) |

A descoberta de jogos usa endpoints públicos da Steam Store e não exige uma chave de API. No painel **Jogos**, pesquise pelo título e selecione **Importar** para adicionar ao catálogo com dados e capa. A integração depende de acesso de rede à Steam; se estiver indisponível, o catálogo local continua funcionando.

## Estrutura do projeto

- `server.js`: backend (rotas, validações, autenticação e persistência).
- `db.js`, `db/schema.sql`: adaptador PostgreSQL e criação/migração do esquema relacional.
- `docs/modelo-er.md`: diagrama Entidade-Relacionamento para a apresentação.
- `public/index.html`, `public/styles.css`, `public/app.js`: frontend.
- `data.json`: fallback local gerado ao rodar (não vai para o Git).

## Requisitos do trabalho x onde estão no projeto

| Item | Onde está |
| --- | --- |
| Frontend | `public/` (HTML, CSS e JavaScript puro, com Chart.js no dashboard) |
| Backend / API REST | `server.js` (Node.js com módulo `http`) |
| CRUD | Jogos (admin), empréstimos e avaliações |
| Login e controle de acesso | `POST /api/auth`, token no header `Authorization`, papéis cliente e admin |
| Persistência de dados | PostgreSQL (`db/schema.sql`, `db.js`) ou `data.json` local |
| Modelo E-R | [docs/modelo-er.md](docs/modelo-er.md) |
| Dashboard com gráficos | Painel admin, aba Visão geral |
| Integração com IA | `POST /api/ai` (OpenAI ou fallback local) |
| Deploy | `render.yaml` (backend) e `vercel.json` (frontend) |

## Mini RSO

### Histórico das alterações

O projeto começou como uma biblioteca chamada **Ludoteca**, com uma quantidade pequena de jogos misturando títulos eletrônicos e jogos de tabuleiro. A interface usava ícones e emojis como representação visual dos jogos, e o foco inicial era apenas consultar o catálogo e fazer reservas.

#### 1. Mudança do catálogo

- **Antes:** o catálogo tinha jogos de tabuleiro, como Catan, Azul, Ticket to Ride, Carcassonne e Splendor, junto com alguns jogos eletrônicos.
- **Depois:** removi os jogos de tabuleiro e deixei o projeto exclusivamente com jogos eletrônicos para PC, consoles e dispositivos móveis.
- **Resultado:** o catálogo foi ampliado para mais de 30 jogos reais, com exemplos de RPG, ação, aventura, simulação, luta, terror, sobrevivência, ficção científica, metroidvania e jogos cooperativos.

#### 2. Mudança de identidade e aparência

- **Antes:** o projeto utilizava o nome Ludoteca e uma identidade visual voltada para uma biblioteca geral de jogos.
- **Depois:** o nome foi alterado para **GameVault**, incluindo marca, textos da interface, credencial administrativa, armazenamento da sessão e configurações de deploy.
- **Resultado:** a interface passou a usar uma identidade escura com paleta vermelha e roxa, textos brancos e maior contraste.

#### 3. Capas dos jogos

- **Antes:** os cards exibiam emojis e ícones, como espada, dragão, casa e foguete.
- **Depois:** os cards passaram a carregar capas reais dos jogos por URLs de imagem, principalmente da Steam CDN e, quando necessário, de outra fonte pública.
- **Resultado:** os textos não ficam mais sobre as imagens. A capa aparece na parte superior e o título, categoria, plataforma, jogadores, duração, dificuldade e selo de destaque ficam abaixo, em branco.

#### 4. Busca e descoberta

- **Antes:** a navegação era baseada em uma lista pequena e pouco variada.
- **Depois:** adicionei busca por título, gênero e plataforma, filtro de jogos mais procurados e informações complementares de cada título.
- **Resultado:** o usuário consegue encontrar jogos por estilo, plataforma, duração, quantidade de jogadores e nível de dificuldade.

#### 5. Empréstimos, login e avaliações

- **Antes:** a funcionalidade era descrita como reserva de jogos.
- **Depois:** a nomenclatura foi alterada para **empréstimos**, com solicitação de data, acompanhamento na área do cliente e avaliação após a experiência.
- **Resultado:** o sistema possui cadastro, login automático para cliente ou administrador, área pessoal e comentários com notas.

#### 6. Curadoria por IA

- **Antes:** a recomendação usava um fallback fixo e podia repetir sempre os mesmos jogos ou citar títulos que não pertenciam ao catálogo.
- **Depois:** a IA passou a analisar palavras-chave do pedido, como relaxar, ação, RPG, terror, competição, cooperação, aventura e história.
- **Resultado:** a recomendação muda de acordo com o que o usuário escreve, seleciona jogos existentes no site, evita repetir o mesmo título quando há alternativas e usa jogos destacados do próprio catálogo como fallback.

#### 7. Dashboard administrativo

- **Antes:** o painel apresentava reservas, visitas, avaliações e um gráfico de faixa etária, além de uma ação de confirmação.
- **Depois:** substituí reservas por empréstimos e removi o número de visitas, o gráfico de faixa etária e o botão “Confirmar”.
- **Resultado:** o dashboard ficou focado em jogos, empréstimos, avaliações, empréstimos por jogo, categorias e médias de avaliação.

#### 8. Tecnologia, persistência e modelo relacional

- **Antes:** os dados ficavam em arrays na memória e em `data.json`, sem banco SQL durável para a hospedagem.
- **Depois:** mantive o backend Node.js com HTTP nativo e adicionei PostgreSQL via `pg`, com `data.json` como fallback local.
- **Resultado:** cinco tabelas relacionadas (`admins`, `clients`, `games`, `bookings`, `reviews`), migração de esquema ao iniciar e diagrama ER pronto para apresentação. O backend usa `DATABASE_URL` para persistência durável.

#### 9. Documentação e organização

- Atualizei o README para refletir o nome GameVault, as credenciais, os endpoints e as funcionalidades atuais.
- Registrei neste RSO a evolução do projeto, as decisões de negócio, as mudanças visuais e as funcionalidades adicionadas ou removidas.

#### 10. Cena gamer do destaque principal

- **Antes:** o destaque da página inicial usava um círculo colorido e um quadrado inclinado como elementos decorativos.
- **Depois:** substituí as formas geométricas por uma imagem de um controle de videogame integrado ao cenário.
- **Resultado:** o controle recebeu tratamento em escala de cinza e alto contraste para ficar branco, enquanto o fundo foi escurecido.
- Adicionei iluminação neon vermelha e roxa, uma grade futurista em movimento e os indicadores `PLAYER 01`, `READY` e `GAMEVAULT LIVE`.
- A imagem do controle ganhou uma animação suave de flutuação e o bloco deixou de ser inclinado, deixando a composição mais reta, gamer e coerente com o restante do GameVault.

#### 11. Persistência, segurança e validações

- **Antes:** os dados ficavam apenas em arrays na memória e eram perdidos ao reiniciar o servidor; as rotas do painel e da área do cliente não exigiam login; as senhas ficavam em texto puro.
- **Depois:** os dados passaram a ser gravados em `data.json`, as rotas protegidas exigem token e as senhas são salvas com hash (scrypt). O servidor valida cadastro, datas, notas e duplicidade de empréstimos.
- **Resultado:** o sistema mantém cadastros, empréstimos e avaliações entre execuções e não confia mais no `clientId` enviado pelo navegador.

#### 12. Gestão de jogos e avaliações pelo admin

- **Antes:** o catálogo só podia ser alterado no código e as respostas às avaliações existiam na API, mas não apareciam na interface.
- **Depois:** o painel ganhou as abas **Jogos** (criar, editar e excluir) e **Avaliações** (responder). O cliente pode devolver empréstimos e ver as respostas às suas avaliações.
- **Resultado:** o fluxo completo (catálogo, empréstimo, devolução, avaliação e resposta) funciona pela interface. Jogos com empréstimos vinculados não podem ser excluídos.
