# Technical Debt / Pendencias Tecnicas

Este arquivo registra pendencias tecnicas, dividas tecnicas e melhorias internas nao bloqueantes do Geitus.

Os itens abaixo nao devem interromper o fluxo de desenvolvimento, mas precisam ser revisitados em momentos apropriados. Este documento nao substitui o `docs/decision-log.md`: decisoes arquiteturais continuam sendo registradas no decision log.

---

## DT-001 — Reduzir exposicao de setters em Produto

- **ID:** DT-001
- **Modulo:** Produtos
- **Origem:** Etapa 7B1
- **Prioridade:** media
- **Status:** finalizado
- **Descricao:** A entidade Produto possui setters publicos. Futuramente, reduzir a visibilidade ou concentrar alteracoes em metodos de dominio pode diminuir o risco de bypass das regras do `ProdutoService`.
- **Impacto:** Nao bloqueia a Etapa 7B2, mas pode afetar manutencao conforme o modulo crescer.
- **Quando revisar:** Apos endpoints de Produtos ou antes de PDV/Estoque.
- **Observacoes:** Resolvido na refatoracao pos-7C. Setters individuais removidos de `Produto`; alteracoes so via construtor completo e `atualizarDadosBasicos`. Testes ajustados para o novo construtor.

## DT-002 — Simplificar construcao no metodo cadastrar do ProdutoService

- **ID:** DT-002
- **Modulo:** Produtos
- **Origem:** Etapa 7B1
- **Prioridade:** baixa
- **Status:** finalizado
- **Descricao:** Ha redundancia interna na construcao/cadastro do produto.
- **Impacto:** Nao afeta comportamento, testes ou seguranca.
- **Quando revisar:** Proxima refatoracao pequena do modulo Produtos.
- **Observacoes:** Resolvido na refatoracao pos-7C. `cadastrar` usa o construtor completo em uma linha, sem repassar nome/preco duas vezes.

## DT-003 — Aplicar validacao de tamanho maximo nos DTOs de Produto

- **ID:** DT-003
- **Modulo:** Produtos
- **Origem:** Etapa 7B1
- **Prioridade:** media
- **Status:** finalizado
- **Descricao:** Ao criar os DTOs dos endpoints REST, aplicar Bean Validation de tamanho maximo alinhado aos limites definidos na migration `V3__produtos.sql`.
- **Impacto:** Evita erro de banco por strings maiores que o permitido e melhora a resposta da API.
- **Quando revisar:** Etapa 7B2.
- **Observacoes:** Resolvido na Etapa 7B2. `ProdutoRequest` aplica `@Size` em nome (150), categoria (100), unidade (20), codigoBarras e sku (50), alinhado exatamente aos limites da migration `V3__produtos.sql`, com teste cobrindo campo acima do tamanho maximo em `ProdutoControllerTest`.

## DT-004 — Warnings conhecidos de fast-refresh no frontend

- **ID:** DT-004
- **Modulo:** Frontend/Base
- **Origem:** Etapas anteriores
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** O lint passa, mas ha warnings conhecidos de fast-refresh em `button.tsx` e `useAuth.tsx`.
- **Impacto:** Nao bloqueia build, testes ou fluxo atual.
- **Quando revisar:** Refatoracao frontend futura.
- **Observacoes:** Nao corrigir fora de uma limpeza pequena ou quando o warning passar a atrapalhar o fluxo de desenvolvimento.

## DT-005 — Simplificar caminhos duplicados no ProdutoService

- **ID:** DT-005
- **Modulo:** Produtos
- **Origem:** Etapa 7B2
- **Prioridade:** media
- **Status:** finalizado
- **Descricao:** Os endpoints REST passaram a usar metodos `*ParaUsuario`, que resolvem a empresa a partir do usuario autenticado, mas os metodos antigos por `empresaId` (da Etapa 7B1) foram mantidos e ficaram sem consumidor externo, gerando dois caminhos publicos para a mesma regra de negocio.
- **Impacto:** Nao afeta seguranca (o isolamento por empresa continua correto), mas aumenta a superficie publica do service e pode confundir futuros consumidores.
- **Quando revisar:** Antes de outros modulos (Caixa, PDV, Estoque) passarem a depender do `ProdutoService`.
- **Observacoes:** Resolvido na refatoracao pos-7C. Metodos por `empresaId` passaram a package-private (unica API publica: `*ParaUsuario`); `@Transactional` concentrado no ponto de entrada; dead code `listarPorEmpresa` e `ProdutoRepository.findByEmpresa_Id` removidos.

## DT-006 — Validar casas decimais de estoqueMinimo no ProdutoRequest

- **ID:** DT-006
- **Modulo:** Produtos
- **Origem:** Etapa 7B2
- **Prioridade:** baixa
- **Status:** finalizado
- **Descricao:** A coluna `estoque_minimo` e `NUMERIC(12,3)`, mas o DTO `ProdutoRequest` nao possui `@Digits(integer = 12, fraction = 3)` para barrar excesso de casas decimais antes de chegar ao banco.
- **Impacto:** Um valor com mais de 3 casas decimais cairia como erro generico de banco/handler, em vez de um 400 amigavel.
- **Quando revisar:** Proxima manutencao pequena dos DTOs de Produto.
- **Observacoes:** Resolvido na refatoracao pos-7C. `ProdutoRequest` recebeu `@Digits`: `preco_venda`/`custo` (integer=10, fraction=2) e `estoque_minimo` (integer=9, fraction=3), alinhados a migration V3. Teste cobre estoque minimo com casas decimais em excesso -> 400.

## DT-007 — Cobrir teste de codigo de barras duplicado no ProdutoControllerTest

- **ID:** DT-007
- **Modulo:** Produtos
- **Origem:** Etapa 7B2
- **Prioridade:** baixa
- **Status:** finalizado
- **Descricao:** O `ProdutoControllerTest` cobre SKU duplicado no cadastro e na atualizacao, mas nao ha teste simetrico para codigo de barras duplicado, embora a regra de negocio trate os dois campos da mesma forma.
- **Impacto:** Nao afeta comportamento; e uma lacuna pequena de cobertura de teste no controller.
- **Quando revisar:** Proxima manutencao pequena dos testes de Produtos.
- **Observacoes:** Resolvido na refatoracao pos-7C. Adicionado teste de cadastro com codigo de barras duplicado -> 400 com a mensagem da regra, simetrico ao de SKU.

## DT-008 — Completar testes de 401 para os endpoints de Produtos

- **ID:** DT-008
- **Modulo:** Produtos
- **Origem:** Etapa 7B2
- **Prioridade:** baixa
- **Status:** finalizado
- **Descricao:** O `ProdutoControllerTest` cobre 401 sem token para listar e cadastrar, mas nao ha teste explicito de 401 para buscarPorId, atualizar, inativar e reativar. O comportamento e garantido pela configuracao global de seguranca, mas sem teste dedicado por endpoint.
- **Impacto:** Baixo risco de regressao silenciosa se a configuracao global de seguranca mudar no futuro.
- **Quando revisar:** Proxima manutencao pequena dos testes de Produtos.
- **Observacoes:** Resolvido na refatoracao pos-7C. Adicionados 4 testes de 401 sem token (buscarPorId, atualizar, inativar, reativar).

## DT-009 — Avaliar indice para busca textual de produtos se o volume crescer

- **ID:** DT-009
- **Modulo:** Produtos
- **Origem:** Etapa 7B2
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** O filtro de busca (`GET /api/produtos?busca=`) usa `LIKE` sobre nome/SKU/codigo de barras, que nao aproveita indice B-tree padrao para buscas por substring.
- **Impacto:** Aceitavel para o volume esperado do MVP (poucos milhares de produtos por empresa); pode degradar performance se o catalogo crescer muito.
- **Quando revisar:** Quando houver indicio real de lentidao na busca de produtos.
- **Observacoes:** Considerar indice trigram (`pg_trgm`) ou full-text search do PostgreSQL; nao ha necessidade agora.

## DT-010 — Fechar o Swagger UI por perfil antes de producao

- **ID:** DT-010
- **Modulo:** Seguranca/Backend
- **Origem:** Etapa 5 (auditoria de seguranca)
- **Prioridade:** alta (pre-producao)
- **Status:** aberto
- **Descricao:** Os caminhos do Swagger UI/api-docs sao liberados incondicionalmente no `SecurityConfig`; a restricao a desenvolvimento e apenas documental (DEC-012). Se o mesmo build subir em producao, o mapa da API fica publico.
- **Impacto:** Sem efeito em desenvolvimento; risco de exposicao da superficie da API em producao.
- **Quando revisar:** Obrigatoriamente antes de qualquer deploy de producao.
- **Observacoes:** Condicionar a liberacao a um profile (`@Profile("dev")`) ou desabilitar `springdoc.*.enabled` fora de dev. Tambem registrado em `docs/modules/autenticacao.md`.

## DT-011 — Rate limiting e protecao contra forca bruta no login

- **ID:** DT-011
- **Modulo:** Seguranca/Backend
- **Origem:** Etapa 5 (auditoria de seguranca)
- **Prioridade:** media (pre-producao)
- **Status:** aberto
- **Descricao:** O `POST /api/auth/login` nao possui rate limiting nem lockout; forca bruta e credential stuffing nao sao mitigados. Ha tambem um canal teorico de timing (BCrypt so executa para usuario existente).
- **Impacto:** Aceitavel em desenvolvimento; risco real com usuarios de producao.
- **Quando revisar:** Antes de producao com usuarios reais.
- **Observacoes:** Fora do escopo do MVP por decisao explicita da Etapa 5; nao implementar sem tarefa propria.

## DT-012 — Amarrar o bootstrap de dev-admin a profile nao-producao

- **ID:** DT-012
- **Modulo:** Seguranca/Backend
- **Origem:** Etapa 5 (auditoria de seguranca)
- **Prioridade:** media (pre-producao)
- **Status:** aberto
- **Descricao:** O `DevAdminBootstrap` e habilitado apenas pela property `geitus.bootstrap.dev-admin` (env `GEITUS_BOOTSTRAP_DEV_ADMIN`). Se a variavel vazar para producao, um admin e criado.
- **Impacto:** Baixo em desenvolvimento; relevante em producao.
- **Quando revisar:** Antes de producao.
- **Observacoes:** Adicionar trava adicional por profile (`@Profile("!prod")` ou equivalente), mantendo a property.

## DT-013 — Migrar token de localStorage para cookie httpOnly + refresh token

- **ID:** DT-013
- **Modulo:** Seguranca/Frontend
- **Origem:** Etapa 5 (decisao pragmatica do MVP)
- **Prioridade:** media (pos-MVP)
- **Status:** aberto
- **Descricao:** O JWT fica no `localStorage` (exposto a XSS) e nao ha refresh token; a sessao dura ate a expiracao do token. Toda leitura/escrita passa por `tokenStorage.ts` para facilitar a troca de estrategia.
- **Impacto:** Risco de XSS aceito conscientemente no MVP; documentado em `frontend/README.md` e `docs/modules/autenticacao.md`.
- **Quando revisar:** Evolucao de seguranca pos-MVP ou antes de producao com dados sensiveis.
- **Observacoes:** A migracao para cookie httpOnly implica revisitar CSRF/CORS (`allowCredentials`).

## DT-014 — Cobrir resolverEmpresaId (usuario inativo/inexistente) no ProdutoService

- **ID:** DT-014
- **Modulo:** Produtos
- **Origem:** Refatoracao pos-7C (revisao QA)
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** O ramo `resolverEmpresaId` do `ProdutoService` (usuario do token inexistente ou inativo -> `CredenciaisInvalidasException`) nao e exercitado por teste: o `ProdutoServiceTest` chama os metodos internos por `empresaId` e o `ProdutoControllerTest` mocka o service inteiro.
- **Impacto:** Fluxo de autorizacao por tenant sem cobertura direta; baixo risco pois a logica e simples e identica ao padrao ja testado em `EmpresaServiceTest`.
- **Quando revisar:** Proxima manutencao dos testes de Produtos.
- **Observacoes:** Adicionar teste de service cobrindo `cadastrarParaUsuario`/`buscarPorIdParaUsuario` com usuario inativo/inexistente.

## DT-015 — Mapear DataIntegrityViolationException para 409 na criacao de usuario

- **ID:** DT-015
- **Modulo:** Usuarios
- **Origem:** Revisao (back-end-reviewer e data-reviewer) do modulo de Usuarios
- **Prioridade:** baixa
- **Status:** RESOLVIDO (DEC-026, 2026-07-23)
- **Descricao:** Ha uma janela TOCTOU entre `existsByEmail` e `save` no `UsuarioService.criarParaUsuario`: duas requisicoes concorrentes com o mesmo e-mail escapam do 409 na aplicacao; a segunda gravacao falha na constraint `uq_usuario_email` e emerge como `DataIntegrityViolationException` -> **500** em vez de **409**.
- **Impacto:** Integridade protegida pelo banco (nao ha duplicata), mas o status fica incoerente numa corrida (janela estreita). Baixo impacto no MVP.
- **Quando revisar:** Proxima manutencao do modulo Usuarios ou ao endurecer o tratamento de erros.
- **Observacoes:** Mapear `DataIntegrityViolationException` no `GlobalExceptionHandler` para 409 com mensagem generica de conflito. **Resolvido** na maturacao de Produtos (DEC-026): handler global de `DataIntegrityViolationException` -> 409 cobre Usuarios, Empresa e Produtos.

## DT-016 — E-mail de usuario case-sensitive

- **ID:** DT-016
- **Modulo:** Usuarios/Seguranca
- **Origem:** Revisao (data-reviewer) do modulo de Usuarios (pre-existente ao baseline)
- **Prioridade:** media (pre-producao)
- **Status:** aberto
- **Descricao:** `existsByEmail`/`findByEmail` e a constraint `uq_usuario_email` comparam a string crua; a criacao so faz `trim()`, sem `lower()`. Permite coexistirem `Ana@x.com` e `ana@x.com` como contas distintas, e o login fica sensivel a caixa.
- **Impacto:** Risco de identidade/UX (contas duplicadas por caixa; login confuso). Pre-existente, nao introduzido pela gestao de usuarios.
- **Quando revisar:** Ao evoluir a identidade (relaciona-se com a DEC-024) ou antes de producao.
- **Observacoes:** Normalizar e-mail para minusculas na escrita + indice unico sobre `lower(email)` via migration propria.

## DT-017 — Escapar curingas do LIKE na busca textual

- **ID:** DT-017
- **Modulo:** Backend (Produtos e Usuarios)
- **Origem:** Revisao (back-end-reviewer) do modulo de Usuarios
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** Nas buscas por termo (`ProdutoRepository` e `UsuarioRepository`), os caracteres `%` e `_` no termo agem como curinga (LIKE injection — nao e SQL injection). Padrao herdado do `ProdutoRepository`.
- **Impacto:** Resultados de busca podem ser mais amplos que o esperado quando o usuario digita `%`/`_`. Sem risco de seguranca de dados.
- **Quando revisar:** Tratar nos dois repositorios juntos numa proxima manutencao de busca.
- **Observacoes:** Escapar `%`/`_` no termo (ex.: `ESCAPE`) ou sanear na aplicacao.

## DT-018 — Revogacao de token na inativacao de usuario

- **ID:** DT-018
- **Modulo:** Seguranca
- **Origem:** Revisao (security-reviewer) do modulo de Usuarios
- **Prioridade:** media (pos-MVP)
- **Status:** aberto
- **Descricao:** Um usuario inativado apos a emissao do JWT continua com token valido em rotas que nao recarregam o usuario (ex.: `catalog`), ate a expiracao. O `/auth/me` e as rotas de `iam` ja bloqueiam inativos; outros modulos nao rechecam `ativo`.
- **Impacto:** Janela de acesso de usuario recem-inativado ate o token expirar. Limitacao inerente ao JWT stateless sem revogacao. Relaciona-se com a **DT-013** (refresh token).
- **Quando revisar:** Junto com refresh token / denylist de tokens (pos-MVP).
- **Observacoes:** Alternativas: revalidar `ativo` por request (custo) ou denylist/versao de sessao ao inativar.

## DT-019 — Testes de integracao de repositorio contra Postgres (Testcontainers)

- **ID:** DT-019
- **Modulo:** Testes/Infra
- **Origem:** Revisao (back-end-reviewer) do modulo de Usuarios
- **Prioridade:** media
- **Status:** RESOLVIDO para Produtos (DEC-027, 2026-07-23); estende-se aos demais modulos conforme forem cobertos
- **Descricao:** As queries de repositorio (JPQL/derivadas) sao validadas hoje apenas por smoke manual do CTO contra o `geitus_db` (Docker), pois `@WebMvcTest`+`@MockBean` nao instancia repositorios e nao ha `@DataJpaTest`/Testcontainers no projeto. A licao do `lower(bytea)` mostra que mocks nao pegam esses defeitos.
- **Impacto:** Cobertura automatica ausente para queries; risco depende de smoke manual (e Docker disponivel).
- **Quando revisar:** Quando o volume de queries de repositorio crescer (Vendas/Estoque) ou ao endurecer o CI.
- **Observacoes:** Adicionar **Testcontainers** (dependencia de teste) + `@DataJpaTest` contra Postgres; decisao de dependencia + impacto no CI (Docker no CI) a cargo do CTO. **Adotado** na maturacao de Produtos (DEC-027): `ProdutoRepositoryIT` cobre isolamento, unicidade e busca contra Postgres real. Requer Docker no ambiente de teste/CI. Aplicar o mesmo padrao aos proximos modulos com queries (Vendas/Estoque).

## DT-020 — Paginacao das listagens (Clientes e Produtos)

- **ID:** DT-020
- **Modulo:** Backend/Frontend (Clientes, Produtos)
- **Origem:** Design do modulo Clientes (DEC-029)
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** `GET /api/clientes` (assim como `GET /api/produtos`) retorna a lista completa da empresa, sem paginacao. Mantido assim por consistencia e simplicidade no MVP.
- **Impacto:** Em empresas com milhares de clientes/produtos, a listagem pode ficar lenta e pesada para a tela.
- **Quando revisar:** Quando uma empresa real passar de alguns milhares de registros ou quando o PDV exigir busca incremental com limite.
- **Observacoes:** Avaliar `Pageable`/limite na API e paginacao ou rolagem infinita na tela, junto com o indice de busca textual (analogo a DT-009).
