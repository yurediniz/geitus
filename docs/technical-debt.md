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
- **Status:** aberto
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
- **Observacoes:** Componente em `iam` (ex.: resolvedor da empresa do usuario autenticado) reutilizado pelos services; relaciona-se com a futura empresa ativa da DEC-024.

## DT-028 — Auditoria e integridade da exclusao de produto (Fases C/D)

- **ID:** DT-028
- **Modulo:** Backend (Catalogo — Produtos)
- **Origem:** Revisoes (security-reviewer e data-reviewer) da Fase B
- **Prioridade:** media (obrigatoria antes de existir venda/estoque)
- **Status:** aberto
- **Descricao:** A exclusao fisica de produto (DEC-032) hoje so deixa um log INFO com ids. `podeExcluir` sempre devolve `true` (ainda nao ha vendas nem movimentacoes) e e chamado por produto na listagem.
- **Impacto:** Sem auditoria persistente, uma exclusao por engano ou ma-fe nao e rastreavel; sem defesa no banco, uma tabela futura com `ON DELETE CASCADE` apagaria historico.
- **Quando revisar:** Na Fase C (historico de precos) e obrigatoriamente na Fase D (movimentos) e no PDV (etapa 11).
- **Observacoes:**
  - `movimentos_estoque` e itens de venda devem referenciar produto por FK composta `(empresa_id, produto_id)` com `ON DELETE RESTRICT`. Nunca referenciar `produto_codigos_barras`; gravar o codigo lido como texto (snapshot).
  - O historico de precos pode ter cascade feito pelo banco, sem coleção com cascade mapeada no `Produto`.
  - `podeExcluir` real em lote (sem N+1).
  - Converter a violacao de FK no DELETE em 409 com a mensagem de exclusao bloqueada.
  - Registrar a exclusao numa tabela de auditoria sem FK para `produtos`.

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
  - `@Version` no produto (ultima gravacao vence);
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
