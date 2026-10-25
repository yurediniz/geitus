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
- **Status:** finalizado — `springdoc.api-docs.enabled` e `springdoc.swagger-ui.enabled` sao `false` no `application.yml` e `true` so no `application-dev.yml`; o `SecurityConfig` so libera os caminhos com a documentacao ligada. Testes: `DocumentacaoDaApiForaDoDevIT` (401 sem token), `DocumentacaoDaApiNoDevIT` (200) e `ConfiguracaoDoApplicationYmlTest`. Producao nao deve ativar o perfil `dev`.
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
- **Status:** finalizado — o `DevAdminBootstrap` exige o perfil `dev` (`@Profile("dev")`) e a property juntos, e recusa senha com menos de 8 caracteres ou igual ao marcador do `.env.example` (testes em `DevAdminBootstrapTest`).
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
- **Observacoes:** **Resolvido para Produtos na Fase B (DEC-032)** — `shared/busca/PadraoLike` usado por Produtos e Clientes; falta Usuarios. Escapar `%`/`_` no termo (ex.: `ESCAPE`) ou sanear na aplicacao. O modulo Clientes (DEC-029) ja nasceu com o escape (`ClienteService` + `ESCAPE` nas queries do `ClienteRepository`) — usar como referencia ao corrigir Produtos e Usuarios.

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
- **Status:** resolvido para Produtos na Fase E (DEC-035); aberto para Clientes (reutilizar `PaginacaoLista` e o padrao `ConsultaDeProdutos`)
- **Descricao:** `GET /api/clientes` (assim como `GET /api/produtos`) retorna a lista completa da empresa, sem paginacao. Mantido assim por consistencia e simplicidade no MVP.
- **Impacto:** Em empresas com milhares de clientes/produtos, a listagem pode ficar lenta e pesada para a tela.
- **Quando revisar:** Quando uma empresa real passar de alguns milhares de registros ou quando o PDV exigir busca incremental com limite.
- **Observacoes:** Avaliar `Pageable`/limite na API e paginacao ou rolagem infinita na tela, junto com o indice de busca textual (analogo a DT-009).

## DT-021 — Excecoes do Spring MVC caem no handler generico (500)

- **ID:** DT-021
- **Modulo:** Backend (transversal — `GlobalExceptionHandler`)
- **Origem:** Revisoes (back-end-reviewer e security-reviewer) do modulo Clientes
- **Prioridade:** media
- **Status:** aberto
- **Descricao:** O handler `@ExceptionHandler(Exception.class)` captura `HttpRequestMethodNotSupportedException` (405), `HttpMediaTypeNotSupportedException` (415) e `NoResourceFoundException` (404) antes do resolver padrao do Spring, respondendo 500. Ex.: `DELETE /api/clientes/{id}` (nao existe DELETE) deveria ser 405. O handler generico tambem nao registra a excecao em log.
- **Impacto:** Status HTTP incorretos, ruido em monitoramento e erros/ataques invisiveis (sem log). Nao vaza detalhe interno (mensagem generica).
- **Quando revisar:** Proxima manutencao do tratamento de erros, antes do primeiro deploy.
- **Observacoes:** Handlers especificos (404/405/415) no formato `ApiError`, ou estender `ResponseEntityExceptionHandler`; logar o 500 com stack trace e sem dados pessoais/corpo da requisicao. Comecar por um teste MockMvc `delete(...)` esperando 405.

## DT-022 — Desligar o UserDetailsService gerado pelo Spring Boot

- **ID:** DT-022
- **Modulo:** Backend (seguranca)
- **Origem:** Revisao (security-reviewer) do modulo Clientes
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** Na subida aparece o WARN "Using generated security password" (`UserDetailsServiceAutoConfiguration`): o Boot cria um usuario `user` em memoria e escreve a senha no log. Hoje nao e utilizavel (httpBasic/formLogin desligados; autenticacao so por JWT).
- **Impacto:** Credencial em log e risco latente se `httpBasic` ou outra cadeia de filtros for reativada.
- **Quando revisar:** Junto com a DT-021 ou no endurecimento pre-deploy.
- **Observacoes:** `@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)` ou um bean `UserDetailsService` que sempre lanca `UsernameNotFoundException`. Requer `security-reviewer`.

## DT-023 — Minimizacao do CPF na listagem de clientes (LGPD)

- **ID:** DT-023
- **Modulo:** Backend/Frontend (Clientes)
- **Origem:** Revisoes (security-reviewer e product-ux-reviewer) do modulo Clientes
- **Prioridade:** media
- **Status:** aberto
- **Descricao:** `GET /api/clientes` devolve o CPF completo de toda a base da empresa para qualquer autenticado (inclusive OPERADOR), sem paginacao (DT-020); a tela de balcao exibe o CPF completo, visivel ao comprador.
- **Impacto:** Vetor de extracao em massa de dado pessoal e exposicao no balcao.
- **Quando revisar:** Junto com a DT-020 (paginacao) ou antes de usuarios reais com volume.
- **Observacoes:** Mascarar o CPF na listagem (ex.: `***.444.777-**`), completo apenas no detalhe/edicao; avaliar com `security-reviewer`. Decisao de produto (a DEC-029 libera leitura a autenticados).

## DT-024 — Repositorios herdam delete/findById sem filtro de empresa

- **ID:** DT-024
- **Modulo:** Backend (Clientes e Produtos)
- **Origem:** Revisao (data-reviewer) do modulo Clientes
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** `ClienteRepository` e `ProdutoRepository` estendem `JpaRepository`, expondo `delete*`, `findById` e `findAll` sem isolamento por empresa, contra "sem exclusao fisica" e a DEC-016. Nenhum codigo de producao usa esses metodos hoje.
- **Impacto:** Risco de uso acidental futuro (exclusao fisica ou leitura cross-tenant).
- **Quando revisar:** Antes de Vendas/Estoque, quando houver mais repositorios.
- **Observacoes:** Estender `Repository<T, Long>` declarando so os metodos usados, ou regra ArchUnit proibindo `delete*`/`findById` fora de teste.

## DT-025 — Extrair resolucao da empresa do usuario autenticado

- **ID:** DT-025
- **Modulo:** Backend (transversal)
- **Origem:** Revisao (back-end-reviewer) do modulo Clientes
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** `resolverEmpresaId(idUsuario)` esta duplicado em 4 services: `ProdutoService`, `ClienteService`, `UnidadeMedidaService` e `CategoriaService` (Fase A, DEC-031). Ja divergem: quando a empresa nao existe, unidade/categoria lancam `CredenciaisInvalidasException` e produto lanca `RegraDeNegocioException("Empresa informada não encontrada.")`.
- **Impacto:** Duplicacao de regra de isolamento (DEC-016) que tende a divergir a cada modulo novo.
- **Quando revisar:** Antes do terceiro modulo de negocio (Caixa).
- **Caixa (DEC-041):** a spec do Caixa cria o resolvedor compartilhado em `iam` e o usa no `cashier`; migrar os 4 services antigos fica opcional.
- **Observacoes:** Componente em `iam` (ex.: resolvedor da empresa do usuario autenticado) reutilizado pelos services; relaciona-se com a futura empresa ativa da DEC-024.

## DT-028 — Auditoria e integridade da exclusao de produto (Fases C/D)

- **ID:** DT-028
- **Modulo:** Backend (Catalogo — Produtos)
- **Origem:** Revisoes (security-reviewer e data-reviewer) da Fase B
- **Prioridade:** media (obrigatoria antes de existir venda/estoque)
- **Status:** parcialmente resolvido (Fase D)
- **Descricao:** A exclusao fisica de produto (DEC-032) hoje so deixa um log INFO com ids. `podeExcluir` sempre devolve `true` (ainda nao ha vendas nem movimentacoes) e e chamado por produto na listagem.
- **Impacto:** Sem auditoria persistente, uma exclusao por engano ou ma-fe nao e rastreavel; sem defesa no banco, uma tabela futura com `ON DELETE CASCADE` apagaria historico.
- **Quando revisar:** Na Fase C (historico de precos) e obrigatoriamente na Fase D (movimentos) e no PDV (etapa 11).
- **Observacoes:**
  - `movimentos_estoque` e itens de venda devem referenciar produto por FK composta `(empresa_id, produto_id)` com `ON DELETE RESTRICT`. Nunca referenciar `produto_codigos_barras`; gravar o codigo lido como texto (snapshot).
  - O historico de precos pode ter cascade feito pelo banco, sem coleção com cascade mapeada no `Produto`.
  - `podeExcluir` real em lote (sem N+1).
  - Converter a violacao de FK no DELETE em 409 com a mensagem de exclusao bloqueada.
  - Registrar a exclusao numa tabela de auditoria sem FK para `produtos`.
  - **Resolvido na Fase D (DEC-034):** `movimentos_estoque` e `estoque_saldos` referenciam o produto por FK composta com `ON DELETE RESTRICT`; `podeExcluir` real e em lote; violacao de FK no DELETE vira 409. **Continua aberto:** a auditoria persistente da exclusao (hoje so o log INFO, que tambem registra a quantidade do estoque inicial apagado).
  - **Atualizacao Fase C (DEC-033):** o historico de precos (`produto_historico_precos`) sai em cascata (`ON DELETE CASCADE`) quando o produto e excluido. Hoje o unico rastro que sobra e o log INFO com ids. A auditoria de exclusao deve guardar um retrato do ultimo preco e custo, ou registrar a decisao de nao guardar.

## DT-029 — Endurecimentos menores da Fase B

- **ID:** DT-029
- **Modulo:** Backend/Frontend (Catalogo — Produtos)
- **Origem:** Revisoes da Fase B
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** Itens nao bloqueantes, deixados para depois:
  - validar o formato de todos os codigos antes da unicidade, com uma consulta `IN` unica;
  - `@Size` por codigo aplicado antes da normalizacao;
  - `substring(0, 30)` do nome curto pode partir emoji (surrogate), nos dois lados;
  - `@Version` no produto (ultima gravacao vence). **Parcialmente resolvido na Fase C:** a edicao usa lock pessimista (`SELECT ... FOR UPDATE`), o que mantem coerente a cadeia do historico de precos. Ainda falta o conflito otimista para quem edita uma versao desatualizada no formulario (antes do PDV);
  - unicidade de codigo `OUTRO` sensivel a maiusculas;
  - UPC-A `036000291452` e EAN-13 `0036000291452` (mesmo GTIN) nao colidem;
  - sugestao de SKU carrega a lista de SKUs no padrao (poderia ser `LIMIT 1`);
  - `mode()` e ordem das sugestoes dependem da collation;
  - termo de texto da busca ainda nao remove espacos Unicode (so o de codigo);
  - no frontend: `useWatch` nas abas, extracao de `errosProduto.ts`, altura 44px dos campos (design system), `readOnly` no modo leitura do OPERADOR, `keepPreviousData` na lista e `AbortSignal` no `httpClient`;
  - da revisao de QA:
    - nome curto com emoji perto do 30o caractere pode partir o par surrogate (cortar por code point) — **antes do cupom/PDV**;
    - codigo pendente igual a um ja na lista bloqueia o salvar (avaliar descartar em silencio — decisao de produto);
    - 404 de produto excluido em outra aba (mensagem e estado do dialogo);
    - "Gerar automaticamente" sobrescreve SKU digitado sem aviso;
    - corrida de cadastros com o mesmo codigo cai no 409 generico sem `campos`;
    - o fallback pelo texto (resposta sem `campos`) no frontend reconhece `"O código de barras "`, mas a mensagem de digito invalido comeca com `"Código de barras "` — hoje sem impacto (o backend sempre manda `campos`), alinhar o fallback.
- **Impacto:** Robustez, desempenho e clareza; nenhum risco imediato.
- **Quando revisar:** Na Fase E (listagem) ou na proxima manutencao do catalogo.

## DT-030 — Fuso dos carimbos de data/hora (`criado_em`, `atualizado_em`, `alterado_em`)

- **ID:** DT-030
- **Modulo:** Backend (transversal)
- **Origem:** Revisoes (data-reviewer, back-end-reviewer, qa-reviewer) da Fase C
- **Prioridade:** media (obrigatoria antes do primeiro deploy)
- **Status:** aberto
- **Descricao:** Os carimbos sao `TIMESTAMP` sem fuso, preenchidos com `LocalDateTime.now()` no fuso da JVM, e alguns `DEFAULT now()` seguem o fuso da sessao do Postgres. As datas de negocio (vigencia de promocao, DEC-033) ja usam o `Clock` `America/Sao_Paulo`. Em dev (Windows em Sao Paulo) nao ha diferenca. Num container em UTC, a aba Historico mostraria a hora 3h adiantada.
- **Impacto:** Hora errada exibida e gravada em historico, auditoria, caixa e vendas.
- **Quando revisar:** Antes do primeiro deploy e antes de Caixa/PDV.
- **Observacoes:** Decisao unica para o projeto inteiro, uma destas: fixar `user.timezone`/`hibernate.jdbc.time_zone`, ou gerar os carimbos com `LocalDateTime.now(clock)`, ou migrar para `TIMESTAMPTZ`. Tambem: `updatable = false` em `Usuario.empresa`, porque a FK composta do historico (V8) faz a troca de empresa falhar no banco.
  - **Caixa (DEC-041):** escolhe `TIMESTAMPTZ` preenchido pelo `Clock` nas tabelas novas (V16). Fica como o padrao para as tabelas antigas, que continuam abertas aqui.

## DT-031 — Endurecimentos menores da Fase C

- **ID:** DT-031
- **Modulo:** Backend/Frontend (Catalogo — Produtos)
- **Origem:** Revisoes da Fase C
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:**
  - **Backend:**
    - centralizar as mensagens repetidas entre DTOs e `ProdutoService`;
    - mover `PaginaResponse` e o "hoje do negocio" (`SituacaoPromocao.hoje`) para `shared` quando outro modulo precisar;
    - extrair do `ProdutoService` (cerca de 850 linhas) a validacao de precos especiais e o historico;
    - validar a escala dos precos especiais tambem no service (hoje so o `@Digits` barra mais de 2 casas);
    - validar a paginacao depois de resolver a empresa.
  - **Frontend:**
    - fabrica unica de chaves de cache;
    - manter os valores ao desligar o interruptor por engano (exige revisar a spec §6.2);
    - unificar campos numericos `type="number"` como texto com `inputMode="decimal"`;
    - avisar quando uma colagem invalida for ignorada;
    - `aria-live` no aviso de preco abaixo do custo e "em reais" no rotulo acessivel do `CampoMoeda`;
    - rotulos "Preco promocional"/"Preco de atacado" em vez de "Ativar ...";
    - placeholder da margem desejada com a margem atual;
    - validacao de 9 digitos inteiros na quantidade do atacado.
  - **Validacao manual:** `CampoMoeda` em Android (Gboard e teclado Samsung) e iOS.
- **Impacto:** Organizacao, acessibilidade e robustez; nenhum risco imediato.
- **Quando revisar:** Na Fase E ou antes de reaproveitar o `CampoMoeda` no Caixa/PDV.

## DT-032 — Endurecimentos e regras futuras do estoque basico (Fase D)

- **ID:** DT-032
- **Modulo:** Backend/Frontend (Estoque — inventory)
- **Origem:** Revisoes da Fase D
- **Prioridade:** media (itens marcados sao obrigatorios antes do PDV)
- **Status:** aberto
- **Descricao:**
  - **Banco:**
    - imutabilidade de `movimentos_estoque` so por convencao: trigger `BEFORE UPDATE` (proibir) e `BEFORE DELETE` (so `origem = 'CADASTRO'`);
    - ordenar o historico so por `id DESC` quando resolver a DT-030 (o `criado_em` usa o relogio da JVM).
  - **Consultas:**
    - `algumProdutoDaUnidadeTemMovimentos` com `count` sobre todos os movimentos; trocar por `EXISTS` a partir de `produtos`.
  - **Concorrencia:**
    - desligar `fracionada` de uma unidade nao trava os produtos, entao um ajuste fracionado simultaneo pode passar (risco baixo).
  - **Seguranca:**
    - perfil do JWT nao e revalidado no banco: um ADMIN rebaixado continua com acesso ate o token expirar (transversal, todas as rotas ADMIN).
  - **API:**
    - `tipo`/`motivo` invalidos dao 400 generico, sem `campos`;
    - deteccao da violacao da chave pelo texto da mensagem (usar o nome da constraint do Hibernate).
  - **Organizacao:**
    - mover `Paginacao`/`PaginaResponse` para `shared` e criar uma excecao de conflito propria do estoque quando Caixa ou Vendas precisarem.
  - **Frontend:**
    - "1.500" em KG e lido como 1,5 (ponto como decimal); avaliar dica ou recusa;
    - modal usa `useState` e validacao em funcoes puras, nao RHF + Zod (excecao consciente pelo tamanho do formulario).
  - **Obrigatorio antes do PDV:** _resolvido no PDV (DEC-042): a venda trava os produtos em ordem de `id`, os movimentos de venda ficam ligados ao item (`item_venda_id`, unico por item e motivo) e a idempotencia e a da venda._
    - toda baixa por venda deve travar o produto antes de inserir (mesma ordem de travas do ajuste) e, numa venda com varios itens, travar os produtos em ordem de `id`;
    - a chave de idempotencia unica por empresa nao aceita varios movimentos por venda: usar chave por item/consequencia ou `(empresa_id, origem, chave)`;
    - registrar a escolha de trava pessimista no lugar do bloqueio otimista do principio 9.
- **Impacto:** Robustez e preparacao do PDV; nenhum risco imediato no uso atual.
- **Quando revisar:** Na spec do PDV (etapa 11) e no endurecimento pre-deploy.

## DT-033 — Endurecimentos da listagem de produtos (Fase E)

- **ID:** DT-033
- **Modulo:** Backend/Frontend (Catalogo — listagem)
- **Origem:** Revisoes da Fase E
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:**
  - **Desempenho:**
    - indice de trigramas (`pg_trgm`) para a busca "contem" quando uma empresa passar de dezenas de milhares de produtos;
    - indice para `status=todos` com ordem por nome e para `-nome`;
    - remover `idx_produto_empresa` da V1, redundante com os novos.
  - **Consistencia:**
    - contagem e ids em comandos separados (READ COMMITTED): avaliar `REPEATABLE_READ`;
    - `CHECK (starts_with(busca_normalizada, nome_normalizado))` como defesa contra escrita direta;
    - equivalencia SQL x Java da V10 so para as 53 letras da lista (usar `normalize(NFD)` se surgir outra escrita).
  - **Migrations futuras com volume:** `CREATE INDEX CONCURRENTLY` e `UPDATE` em lotes.
  - **Frontend:**
    - texto de exemplo da busca cortado em 375 px;
    - "Desfazer" ao inativar;
    - tom proprio para o selo de promocao (brandbook);
    - abrir o produto direto quando a leitura de codigo der um unico resultado;
    - campo "ir para a pagina" so a partir de ~5 paginas;
    - categorias inativas no fim do seletor do filtro.
- **Impacto:** Desempenho em catalogos grandes e refinamentos de UX; nenhum risco imediato.
- **Quando revisar:** Quando um cliente tiver catalogo grande ou na proxima rodada de UX da lista.

## DT-034 — Pendencias e regras futuras da Fase B2 (numero, codigo e balanca)

- **ID:** DT-034
- **Modulo:** Backend/Frontend (Catalogo — identificacao e etiqueta de balanca)
- **Origem:** Revisoes e verificacao no navegador da Fase B2
- **Prioridade:** baixa (media para os itens do PDV, na etapa 11)
- **Status:** aberto
- **Descricao:**
  - **Backend:**
    - extrair colaboradores do `ProdutoService` (codigos, precos, estoque inicial) no inicio da Fase B3, recomendacao do back-end-reviewer;
    - `numeracoes` so fica coerente se toda criacao passar pelo `Numerador`; carga direta no banco exige o SQL de ressincronizacao do Javadoc;
    - bloquear a troca do codigo do produto ja vendido (quando o PDV existir).
  - **Frontend:**
    - o scroll-spy e testado com geometria simulada (jsdom nao tem layout); um teste de navegador (e2e) cobriria a rolagem real.
  - **Produto:**
    - exportar os produtos para o software da balanca (MGV da Toledo);
    - historico de alteracao da configuracao da etiqueta (hoje so o log INFO).
- **Impacto:** Nenhum risco imediato; organizacao do codigo e itens que dependem do PDV.
- **Quando revisar:** No inicio da Fase B3 (ProdutoService) e na especificacao do PDV.

## DT-035 — Pendencias e regras futuras da Fase B3 (embalagens de venda)

- **ID:** DT-035
- **Modulo:** Backend/Frontend (Catalogo — embalagens; Estoque — ajuste)
- **Origem:** Revisoes da Fase B3 (dados, backend, seguranca, frontend, UX e QA)
- **Prioridade:** baixa (media para os itens do PDV, na etapa 11)
- **Status:** aberto
- **Descricao:**
  - **Backend:**
    - `ProdutoService` ainda com ~1100 linhas: extrair a gravacao com o tratamento da corrida e as regras de preco especial;
    - uma consulta por codigo de barras novo no `ValidadorDeCodigosDeBarras` (trocar por uma consulta `IN` por lista);
    - `GlobalExceptionHandler.tratarGenerico` nao registra o erro 500 no log (sem PII);
    - sem limite de tamanho do corpo JSON (definir no proxy reverso no deploy);
    - indice parcial `idx_codigo_barras_embalagem WHERE embalagem_id IS NOT NULL` (ganho pequeno);
    - mensagem do limite de casas da quantidade diferente entre frontend ("Use no maximo 3 casas decimais.") e backend.
  - **Historico:** a linha de preco guarda so o rotulo da embalagem; um `embalagem_uuid` (sem FK) permitiria agrupar as linhas quando a unidade ou a quantidade mudam. A remocao da embalagem aparece como "R$ x → sem preco proprio", igual ao preco apagado.
  - **Frontend:** unificar no schema as regras de fracao que ainda sao conferidas no envio (atacado e estoque inicial).
  - **Para o PDV:**
    - decidir se a embalagem de compra sem codigo de barras aparece como opcao de venda (hoje mostra preco calculado e margem);
    - o atacado decidido pela quantidade total pode nao bater com a dica do preco da embalagem sem preco proprio;
    - regra para remover ou inativar a embalagem ja vendida;
    - sugestao "Montar 1 CX + 1 UN?".
- **Impacto:** Organizacao do codigo, observabilidade e regras que dependem do PDV; nenhum risco imediato.
- **Quando revisar:** Na proxima rodada de refatoracao do catalogo e na especificacao do PDV.

## DT-036 — Pendencias da Fase B4 (custo na entrada por compra)

- **ID:** DT-036
- **Modulo:** Backend/Frontend (Estoque — ajuste; Catalogo — custo)
- **Origem:** Revisoes da Fase B4 e conferencia no navegador
- **Prioridade:** media (o aviso de variacao grande), baixa (o resto)
- **Status:** aberto
- **Descricao:**
  - **Aviso de custo muito diferente do ultimo** (ex.: "O custo novo e 19x o ultimo. Confira se e o da CX ou o da UN."). Na conferencia, um custo digitado errado (R$ 18.000.180,00 por CX) foi gravado sem alerta; o custo do produto aceita o valor, e so a previa mostrava a diferenca.
  - **Total da compra no modal** ("Total: R$ 360,00"), para conferir com a linha da nota.
  - **Seletor "Em" (embalagem) no ajuste aberto pela lista de produtos:** hoje a compra pela lista so entra em unidades.
  - **Concorrencia otimista no PATCH do produto** (`@Version` ou `If-Match`, 409): um formulario aberto antes de uma compra e salvo depois ainda pode reverter o custo como "Editado". O frontend sincroniza o campo intocado, mas nao ha defesa no backend.
  - **Indice parcial da ultima compra** (`movimentos_estoque WHERE custo_informado IS NOT NULL`), quando o PDV gerar muitos movimentos de venda.
  - **Conta multiplicativa na CHECK** do custo unitario, se surgirem valores extremos (custo por unidade >= R$ 10.000 em embalagem > 100.000).
  - **Custo medio ponderado:** fora por decisao do usuario (DEC-038); reavaliar com Compras.
- **Impacto:** Erros de digitacao do custo passam sem alerta; o resto e refinamento.
- **Quando revisar:** O aviso de variacao na proxima rodada de estoque; o resto com Compras e o PDV.

## DT-037 — Pendencias da Fase B5 (fornecedores e marcas)

- **ID:** DT-037
- **Modulo:** Backend/Frontend (Fornecedores; Catalogo — marcas)
- **Origem:** Revisoes da Fase B5 (dados, seguranca, backend, frontend, UX e QA)
- **Prioridade:** baixa (media para a mascara de CPF antes de perfis granulares)
- **Status:** aberto
- **Descricao:**
  - **Dados pessoais:** o OPERADOR ve documento (inclusive CPF de fornecedor PF) e contatos; mascarar para o OPERADOR quando houver perfis granulares (DEC-039). A busca por documento fica na URL (historico do navegador e logs de acesso).
  - **Backend:**
    - tipos de paginacao (`PaginaResponse`, `Paginacao`, `StatusFiltro`) movidos de `catalog` para `shared`;
    - arvore de marcas carregada duas vezes nas escritas do produto;
    - corrida residual: ligar um produto a uma marca durante o renomear dela deixa a busca do produto com o nome antigo ate a proxima edicao;
    - `GlobalExceptionHandler` sem log do 500 e metodo nao suportado respondendo 500 (em vez de 405);
    - validacao de e-mail aceita caracteres de controle (erro pouco claro).
  - **Frontend/UX:**
    - atalhos de secao e endereco recolhido no cadastro do fornecedor;
    - razao social antes do CNPJ;
    - seletor de "Marcas que vende" com varias escolhas;
    - adicionar produto ao fornecedor por scanner/Enter;
    - criar fornecedor no proprio seletor do produto;
    - reordenar o representante principal;
    - busca de CEP sem apagar campos e com foco em "Numero";
    - volta do produto para o fornecedor;
    - modo leitura (OPERADOR) legivel;
    - contagens da arvore de marcas com criterios diferentes (produtos na subarvore, fornecedores so diretos);
    - abas do catalogo no celular sem indicio de rolagem;
    - dica pos-migracao para agrupar as marcas antigas sob fabricantes.
- **Impacto:** Refinamentos de UX e de organizacao; nenhum risco imediato de integridade.
- **Quando revisar:** Na proxima rodada de UX do catalogo; a mascara de CPF com os perfis.

## DT-038 — Pendencias da Fase F (imagem do produto)

- **ID:** DT-038
- **Modulo:** Backend/Frontend (Catalogo — imagem)
- **Origem:** Revisoes da Fase F (dados, seguranca, backend e frontend)
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:**
  - **Seguranca:**
    - ~~o `JwtSecretValidator` aceita o `JWT_SECRET` de exemplo do `.env.example`; aplicar a mesma regra do segredo das imagens;~~ **resolvido:** o `JwtSecretValidator` recusa o valor do `.env.example` e o da documentacao, sem mostrar o valor (teste garante que a constante e igual ao `.env.example`); a senha do banco tambem deixou de ter valor padrao no `application.yml`;
    - **resolvido (revisao de seguranca):** o `DevAdminBootstrap` so roda no perfil `dev` (alem de `GEITUS_BOOTSTRAP_DEV_ADMIN=true`) e recusa senha com menos de 8 caracteres ou igual ao marcador do `.env.example`, sem mostrar o valor; os exemplos de senha (Swagger do login, READMEs e spec de autenticacao) nao usam mais o marcador; o `dev-backend.ps1` avisa quando o `POSTGRES_PASSWORD` e o marcador ou o antigo padrao;
    - quota de armazenamento de imagens por empresa;
    - limite de requisicoes na rota publica com URL valida;
    - logs de acesso do proxy com as URLs assinadas nao devem ser publicos.
    - trava contra producao ativar o perfil `dev` por engano: `server.address: 127.0.0.1` no `application-dev.yml` e aviso no log da subida (antes do primeiro deploy);
    - teste de que `/v3/api-docs` com token valido da 404 fora do dev, e exigir tambem o perfil `dev` (alem da propriedade) para liberar o Swagger;
    - varredura automatica de segredos (secret scanning/push protection no GitHub ou gitleaks no CI), com confirmacao do usuario por mexer no CI.
  - **Backend:**
    - a troca carrega a linha antiga com os bytes (sem bytecode enhancement); avaliar upsert nativo se o volume crescer;
    - 304 com `If-None-Match`;
    - WebP animado e aceito (inofensivo; recusar se preciso);
    - o `application.yml` de teste substitui o principal (OSIV ligado e propriedades ausentes nos testes).
  - **Frontend/UX:**
    - quadro vazio tocavel no celular;
    - foto esmaecida durante o giro;
    - tamanho do quadro no celular empurrando os campos essenciais;
    - "Salvar e cadastrar outro" com falha da imagem perde a mensagem de cadastro;
    - mensagem 400 do servidor na imagem;
    - URL absoluta quando `VITE_API_BASE_URL` apontar para outra origem.
  - **Operacao:** monitorar `pg_total_relation_size('produto_imagens')`; avaliar S3 acima de 5 GB; backups com `pg_dump -Fc`.
  - **Teste em aparelho real:** iPhone com Safari (caminho JPEG e EXIF) e Android com Chrome.
- **Impacto:** Refinamentos e operacao; nenhum risco imediato de integridade.
- **Quando revisar:** Antes do primeiro deploy (segredo de exemplo do JWT) e quando o volume de imagens crescer.

## DT-039 — Modo cego do caixa antes do PDV

- **ID:** DT-039
- **Modulo:** Backend/Frontend (Caixa — cashier)
- **Origem:** Revisoes de seguranca e backend do modulo Caixa (DEC-041)
- **Prioridade:** media (obrigatoria antes do PDV)
- **Status:** finalizado no PDV (DEC-042): o modo cego esconde do OPERADOR os valores de recebimento e estorno na tela do caixa; a lista de vendas (F8) mostra totais, formas e troco (limitacao aceita); `sessaoAbertaDoUsuario` virou `travarSessaoParaVenda(UsuarioAutenticado)`; o PDV trava a sessao antes de inserir movimentos.
- **Descricao:** o modo cego esconde o total da gaveta e o valor dos lancamentos de outra pessoa, mas o OPERADOR ve o valor dos proprios lancamentos e consegue somar o esperado. Com o PDV, entram os recebimentos (tipo `RECEBIMENTO`) e duas rotas que respondem sem gravar:
  - a sangria acima da gaveta (409) permite descobrir o esperado por busca binaria;
  - o suprimento acima do limite (400) tambem responde sem gravar.
- **Impacto:** sem decisao, o modo cego deixa de ter efeito quando houver vendas em dinheiro.
- **Quando revisar:** na spec do PDV (etapa 11).
- **Observacoes:**
  - decidir se o OPERADOR em sessao `ABERTA` no modo cego ve os recebimentos com valor;
  - limitar ou auditar as tentativas de sangria recusadas;
  - o `sessaoAbertaDoUsuario` deve receber `UsuarioAutenticado` (nao ids crus) e o PDV deve travar a sessao antes de inserir o movimento (gatilho `BEFORE INSERT ... FOR SHARE` da V16).

## DT-040 — Pendencias do modulo Caixa

- **ID:** DT-040
- **Modulo:** Backend/Frontend (Caixa — cashier)
- **Origem:** Revisoes do modulo Caixa (dados, seguranca, backend, frontend, UX e QA)
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** itens nao bloqueantes, deixados para depois:
  - **Banco:**
    - gatilho conferindo `valor_esperado` = soma dos movimentos e `ABERTURA` = `fundo_troco`;
    - gatilho `BEFORE TRUNCATE` nas tabelas do caixa;
    - CHECKs `valor_esperado >= 0`, `contada_em >= aberta_em`, `fechada_em >= contada_em` e justificativa aparada;
    - limite de 50 pontos sem trava (dois cadastros simultaneos podem passar de 50);
    - indice `(empresa_id, sessao_caixa_id, id) INCLUDE (tipo, valor)` e `(empresa_id, aberta_por, aberta_em DESC)` quando o volume crescer.
  - **Backend:**
    - a lista de pontos entrega ao OPERADOR o `sessaoId` das sessoes de outras pessoas (sem acesso, mas exposicao desnecessaria);
    - a trava da sessao vem antes da regra do dono;
    - leituras de nome de usuario sem filtro de empresa (alinhar a DT-024);
    - `ViolacaoDeConstraint` depende do `getConstraintName()` do Hibernate; alinhar com o `EstoqueService`, que procura o nome na mensagem;
    - contagem repetida com justificativa numa sessao em conferencia no modo nao cego nao fecha;
    - calculo do esperado e `CASAS_DO_DINHEIRO` duplicados;
    - historico com o ponto lido de forma lazy (usar `JOIN FETCH` na selecao);
    - `@Size` antes de aparar a justificativa;
    - `HistoricoDoCaixaIT` muda o fuso da JVM inteira (fragil com testes em paralelo).
  - **Frontend:**
    - falha da atualizacao em segundo plano do historico mantem os dados antigos sem aviso;
    - uma mutacao para todas as linhas dos pontos;
    - reuso (`ErroAoCarregar`, `textarea`, pecas genericas guardadas em `catalog`/`products`, esquema das janelas);
    - o "hoje" do aviso "Aberto desde" so e recalculado quando a tela redesenha.
  - **UX:**
    - data junto da hora nos movimentos de caixa aberto ha mais de um dia;
    - "Ir para o caixa" no detalhe do historico;
    - proximo nome livre em "Adicionar ponto";
    - confirmar antes de inativar o ultimo ponto ativo;
    - periodos prontos e filtro "Aberto por" no historico;
    - motivos frequentes na sangria;
    - atalhos de teclado junto com o PDV.
  - **Testes:**
    - concorrencia entre contagem e sangria, e entre dois fechamentos;
    - chave de abertura reaproveitada por outro usuario ou numa sangria;
    - limites de dinheiro na abertura e no movimento;
    - filtro `EM_CONFERENCIA` no historico;
    - aviso "Aberto desde" na fronteira da meia-noite no nivel da tela;
    - Configuracoes: renomear com 409, duplo clique no interruptor, limite de 50 na tela.
  - **Validacao manual:** `CampoMoeda` em Android e iOS (DT-031).
- **Impacto:** robustez, desempenho e clareza; nenhum risco imediato.
- **Quando revisar:** na spec do PDV ou na proxima manutencao do caixa.

## DT-041 — Pendencias do PDV

- **ID:** DT-041
- **Modulo:** Backend/Frontend (Vendas — sales, caixa e estoque)
- **Origem:** Revisoes do PDV (dados, seguranca, backend, frontend, UX e QA) e teste no navegador
- **Prioridade:** baixa (itens marcados: antes do primeiro deploy)
- **Status:** aberto
- **Descricao:**
  - **Seguranca:**
    - o fallback do lock de aba (`BroadcastChannel`) tem corrida quando o sistema e aberto por HTTP fora de `localhost` (sem Web Locks); servir sempre por HTTPS — **antes do primeiro deploy**;
    - o carrinho guardado no navegador (com o nome do cliente) continua la depois do logout; avaliar guardar so o id do cliente ou limpar ao sair quando nao houver tentativa pendente;
    - `ehCorpo` nao confere a forma de pagamento guardada (so visual; o servidor recusa);
    - limite de requisicoes por usuario no `/calculo` e na busca (o projeto ainda nao tem nenhum);
    - oraculo da sangria no modo cego por tentativas (vem do Caixa).
  - **Banco:**
    - contagem por forma orfa (gravada sem mudar a situacao da sessao) trava o fechamento; constraint trigger deferida exigindo a sessao fora de `ABERTA`;
    - a ligacao `estoque_saldos` x ultimo movimento ficou so na aplicacao (sem o CHECK de saldo >= 0);
    - o gatilho deferido da venda recalcula a venda a cada linha inserida (otimizar se o volume crescer);
    - indices opcionais: `(empresa_id, usuario_id, concluida_em DESC, id DESC)` e `INCLUDE (forma, tipo, valor)` nos movimentos de caixa;
    - historico das configuracoes do PDV (hoje so a ultima alteracao);
    - o `Numerador` do tipo VENDA serializa as finalizacoes da empresa (aceitavel no MVP).
  - **Backend:**
    - `sales` usa `ProdutoRepository`, `ClienteRepository` e classes do `cashier` direto (avaliar interfaces ou Spring Modulith);
    - `VendasService` grande (extrair a conferencia da chave e o cancelamento);
    - `mesmoPedido` nao compara desconto nem embalagem na chave repetida.
  - **Frontend e UX:**
    - filtro por ponto no F8 (a API nao tem);
    - quantidade digitada para produto por peso vindo da busca;
    - aviso de troco desproporcional; motivos rapidos de sangria; atalhos 1–5 na espera; volume do bipe configuravel;
    - confirmar com operadores reais o campo de dinheiro que preenche da direita para a esquerda (5000 = R$ 50,00);
    - os atalhos F3, F6, F7 e F10 em Chrome/Edge do Windows (o navegador pode tratar antes da pagina);
    - abaixo de 1024 px os botoes do painel ficam cortados (minimo da spec);
    - sincronia entre abas so pelo lock (sem `storage`/`BroadcastChannel` para o carrinho).
  - **Testes:**
    - promocao vencendo entre o calculo e o finalizar de ponta a ponta (troca do `Clock`);
    - cancelamento com queda de rede no F8; selos Promocao e Atacado na tela; "Alterado por" em Configuracoes › PDV;
    - concorrencia contagem x venda.
- **Impacto:** robustez, desempenho e clareza; nenhum risco imediato no uso atual.
- **Quando revisar:** antes do primeiro deploy (itens marcados) e na proxima manutencao do PDV.

## DT-026 — Teto de profundidade e de quantidade na arvore de categorias

- **ID:** DT-026
- **Modulo:** Backend (Catalogo — categorias)
- **Origem:** Revisao (security-reviewer) da Fase A
- **Prioridade:** media (antes de cadastro publico de empresas)
- **Status:** aberto
- **Descricao:** A spec define profundidade ilimitada e nao ha limite de quantidade. `GET /api/categorias` devolve o `caminho` completo de cada categoria, entao uma corrente de N categorias aninhadas custa O(N²) em memoria e em JSON. Um ADMIN de qualquer empresa poderia, por script, criar milhares de niveis e provocar falta de memoria na JVM compartilhada (afeta todas as empresas).
- **Impacto:** Disponibilidade multi-tenant. Hoje o risco e baixo: so ha empresas criadas pelo bootstrap de desenvolvimento.
- **Quando revisar:** Antes de existir onboarding/cadastro publico de empresas, ou antes do primeiro deploy multi-tenant.
- **Observacoes:** Propor teto compativel com o uso esperado ("dezenas a poucas centenas"): ex.: profundidade maxima 10–20 e ate ~2000 categorias por empresa, 400 com mensagem fixa. E decisao de produto (registrar na DEC-031 ou nova DEC).

## DT-027 — Endurecimentos menores do catalogo (Fase A)

- **ID:** DT-027
- **Modulo:** Backend (Catalogo)
- **Origem:** Revisoes (security-reviewer, data-reviewer e back-end-reviewer) da Fase A
- **Prioridade:** baixa
- **Status:** aberto
- **Descricao:** Itens nao bloqueantes, deixados para depois:
  - nome de categoria/unidade aceita caracteres de controle e de direcao Unicode (Cc/Cf) e o proprio separador ` › ` (permite "falsificar" um caminho na tela; sem XSS, impacto visual dentro do tenant);
  - contagens nativas (`contarProdutosQueUsam`, `contarProdutos`) nao filtram `empresa_id` (seguras hoje por receberem id ja isolado e pelas FKs compostas; filtrar deixa o isolamento explicito);
  - `atualizadoEm` sai desatualizado na resposta de PATCH (o `@PreUpdate` roda no flush, depois do DTO montado) — padrao herdado de todos os modulos;
  - a escrita de produto com categoria carrega a arvore duas vezes (validacao e resposta);
  - a listagem de produtos le produtos e arvore em comandos separados (corrida rarissima com exclusao de categoria entre os dois);
  - `ck_unidade_descricao_valida` nao exige descricao aparada (o service apara); so via V7;
  - exclusao de categoria concorrente com cadastro de produto nela termina em 409 generico (FK) em vez de mensagem amigavel;
  - `ClienteRepository`/`ProdutoRepository` e os novos `UnidadeMedidaRepository`/`CategoriaRepository` herdam `delete*`/`findById` (ver DT-024).
- **Impacto:** Baixo; robustez e clareza.
- **Quando revisar:** Na proxima manutencao do catalogo (Fases B–E).
- **Observacoes:** Rejeitar Cc/Cf e `›` no nome via validacao; filtrar `empresa_id` nas contagens; `saveAndFlush` ou timestamp no metodo de dominio.
