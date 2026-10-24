# Módulo Caixa (etapa 10) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto, a execução é orquestrada pelo CTO: as tasks 1–3 ficam com o `back-end-executor` e as 4–6 com o `front-end-executor`, em paralelo (o contrato está na spec §5.3), com revisores depois.

**Goal:** pontos de caixa, sessões de caixa com abertura, sangria, suprimento, contagem e fechamento (cego ou com o esperado visível), histórico e a tela Configurações com a seção Caixa.

**Architecture:**
- **Backend:** domínio novo `cashier`, com três subpacotes:
  - `cashier/ponto` — `PontoDeCaixa`, `PontosDeCaixaService` e `PontoDeCaixaController`;
  - `cashier/configuracao` — `ConfiguracaoDoCaixa`, service e controller sob `/api/configuracoes/caixa`;
  - `cashier/sessao` — `SessaoDeCaixa`, `MovimentoDeCaixa`, `SessoesDeCaixaService` e `SessaoDeCaixaController`.
  - O esperado é sempre uma soma dos movimentos, e o fechamento é uma fotografia gravada na sessão. Gatilhos da V16 garantem a imutabilidade.
- **Frontend:**
  - `features/cash-register/` com a página `/caixa`, as janelas de abrir, lançar e fechar, e `/caixa/historico`;
  - `features/settings/` com `/configuracoes`;
  - serviços `caixaService.ts` e `configuracaoCaixaService.ts`.

**Tech Stack:** Java 21, Spring Boot 3.5, JPA/Hibernate 6, Flyway, PostgreSQL 16, Testcontainers; React 19, TS, RHF + Zod 4, TanStack Query v5, Vitest.

**Spec:** [`docs/modules/caixa.md`](../../modules/caixa.md) (DEC-041). Os executores leem a spec inteira. As mensagens exatas estão em §3, e o contrato em §5.3.

## Global Constraints
- **Migrations:** só a nova `V16__caixa.sql`; V1–V15 intocadas.
- **Dependências:** nenhuma nova, no backend ou no frontend.
- **Horários:**
  - colunas `TIMESTAMPTZ`;
  - entidades com `OffsetDateTime`, sempre `OffsetDateTime.now(clock)` do bean `Clock` de `RelogioConfig`;
  - nunca `LocalDateTime.now()` nem `DEFAULT now()` nas tabelas novas;
  - nos DTOs, convertidos para `clock.getZone()` (`atZoneSameInstant(...).toOffsetDateTime()`), para sair `…-03:00`;
  - "hoje" e os filtros `de`/`ate` usam `LocalDate.now(clock)` e o início do dia em `America/Sao_Paulo`.
- **Dinheiro:**
  - `BigDecimal` com escala 2 (`NUMERIC(12,2)`);
  - entrada com `@Digits(integer = 10, fraction = 2)`;
  - máximo 9.999.999.999,99, e isso vale também para o esperado resultante (Review Focus 3).
- **Isolamento:**
  - empresa e usuário sempre do JWT, resolvidos pelo `UsuarioAutenticado` (Task 1), com o perfil lido do banco;
  - recurso de outra empresa → 404;
  - OPERADOR em sessão de outra pessoa → 404.
- **Mensagens:** exatamente as da spec §3, com nomes de usuário e ponto interpolados e valores no formato `R$ 1.234,56`.
- **Feedback no frontend:** feedback fixo no topo (padrão `FeedbackCatalogo`), sem toast. Chaves de idempotência com `gerarUuid()` de `lib/uuid.ts`, geradas ao abrir a janela.
- **Commits:** em pt-BR, com pathspec `-- backend/` ou `-- frontend/`, sem `add -A`/`stash`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Rede cai depois da contagem no modo cego.**
   - **Backend:** o operador clica "Conferir" de novo com o mesmo valor e recebe 200 com o resultado gravado, sem 409. Teste na Task 3.
   - **Frontend:** o retry mostra o resultado e o passo da justificativa. Teste na Task 5.
2. **Sessão aberta às 23:30 de São Paulo** (02:30 UTC do dia seguinte). Esperado:
   - no filtro `de=ate=2026-10-24` ela aparece, e no `2026-10-25` não;
   - o aviso "Aberto desde…" só aparece no dia 25.

   Teste na Task 3, com `Clock` fixo e a JVM em UTC.
3. **Suprimento que leva o esperado acima de R$ 9.999.999.999,99.** Esperado: 400 "O valor passa do limite do caixa." no campo `valor`, nunca 500 de estouro numérico. Teste na Task 3.
4. **Duas abas: o caixa é fechado na aba A e a aba B tenta uma sangria.** Esperado:
   - 409 "Este caixa já foi fechado.";
   - a aba B mostra a mensagem, recarrega a sessão atual e volta à tela sem caixa aberto.

   Teste na Task 5.
5. **ADMIN com o próprio caixa aberto fecha o caixa de uma OPERADORA.** Esperado:
   - a sessão dela registra o ADMIN em `fechada_por`;
   - a sessão do ADMIN continua aberta e intacta;
   - a tela do ADMIN volta ao próprio caixa.

   Testes nas Tasks 3 e 5.

---

### Task 1: Base compartilhada e V16

**Files:**
- **Create:**
  - `backend/src/main/resources/db/migration/V16__caixa.sql`, exatamente as tabelas, constraints, índices, gatilhos e a carga do "Caixa 1" da spec §4;
  - `iam/UsuarioAutenticado.java`: record `(Long usuarioId, Long empresaId, String nome, Perfil perfil)` com `boolean ehAdmin()`;
  - `iam/ResolvedorDoUsuarioAutenticado.java` (`@Component`).
- **Move:**
  - `catalog/Paginacao.java` → `shared/paginacao/Paginacao.java`;
  - `catalog/dto/PaginaResponse.java` → `shared/paginacao/PaginaResponse.java`;
  - só os `import`s mudam nos usos atuais (DT-032).
- **Test:**
  - `cashier/MigracaoV16IT.java`;
  - `iam/ResolvedorDoUsuarioAutenticadoTest.java`.

**Interfaces:**
- Produces:
  - `UsuarioAutenticado ResolvedorDoUsuarioAutenticado.resolver(Long idUsuario)`: usuário inexistente ou inativo → `CredenciaisInvalidasException`;
  - `com.geitus.app.shared.paginacao.{Paginacao, PaginaResponse}`.

- [ ] **Step 1: Testes da migration** (`MigracaoV16IT`, Testcontainers, Flyway até V15 com 2 empresas e 1 usuário cada, depois V16):
  - `criaCaixa1ParaCadaEmpresaExistente`: 2 linhas em `pontos_caixa`, `nome = 'Caixa 1'`, ativas;
  - `recusaNomeDePontoRepetidoSemDiferenciarMaiusculas`: inserir `'caixa 1'` na mesma empresa → `DataIntegrityViolationException`;
  - `recusaDuasSessoesAbertasNoMesmoPonto` e `recusaDuasSessoesAbertasDoMesmoUsuario`, incluindo uma `EM_CONFERENCIA` mais uma `ABERTA`;
  - `permiteNovaSessaoDepoisDeFechada`;
  - `recusaUpdateEDeleteDeMovimento`;
  - `recusaDeleteDeSessao` e `recusaUpdateDeSessaoFechada`;
  - `recusaTrocarFundoTrocoOuPontoDeSessaoAberta`;
  - `recusaTrocarContagemJaGravada` (`EM_CONFERENCIA` → mudar `valor_contado`);
  - `recusaFechadaComDiferencaSemJustificativa`;
  - `recusaDiferencaIncoerente` (`diferenca <> valor_contado - valor_esperado`);
  - `recusaEmConferenciaComDiferencaZero`;
  - `recusaSegundaAberturaNaMesmaSessao`;
  - `recusaChaveRepetidaNaEmpresa`;
  - `recusaSangriaSemMotivo` e `recusaSuprimentoZero`;
  - `gravaEInstanteComFuso`: insere `'2026-10-24T08:02:00-03:00'` e lê `2026-10-24T11:02:00Z` com a sessão do JDBC em UTC.
- [ ] **Step 2:** Rodar `./mvnw -q test -Dtest=MigracaoV16IT` → FAIL (V16 não existe).
- [ ] **Step 3:** Escrever a `V16__caixa.sql` com estas regras:
  - **Gatilhos:** uma função `plpgsql` por tabela, com `RAISE EXCEPTION` e mensagem em pt-BR.
  - **Gatilho de sessão:** permite só as transições `ABERTA → EM_CONFERENCIA`, `ABERTA → FECHADA` e `EM_CONFERENCIA → FECHADA`, mais o preenchimento da contagem e do fechamento.
  - **Carga:** `INSERT … SELECT id, gen_random_uuid(), 'Caixa 1', true, now() FROM empresa`. A carga é o único `now()` permitido.
- [ ] **Step 4:** Rodar de novo → PASS.
- [ ] **Step 5: `ResolvedorDoUsuarioAutenticadoTest`:**
  - devolve empresa, nome e perfil do banco;
  - usuário inativo → `CredenciaisInvalidasException`;
  - id inexistente → `CredenciaisInvalidasException`.

  Implementar o componente. Mover `Paginacao`/`PaginaResponse` e ajustar os imports. `./mvnw -q test` → BUILD SUCCESS.
- [ ] **Step 6: Commit** `feat(caixa): migration V16 e base compartilhada do usuario autenticado e da paginacao`.

### Task 2: Pontos de caixa e configuração

**Files:**
- **Create:**
  - `cashier/package-info.java`;
  - `cashier/ponto/{PontoDeCaixa, PontoDeCaixaRepository, PontosDeCaixaService, PontoDeCaixaController}.java`;
  - `cashier/ponto/dto/{PontoDeCaixaRequest, PontoDeCaixaResponse, SituacaoDoPontoResponse}.java`;
  - `cashier/configuracao/{ConfiguracaoDoCaixa, ConfiguracaoDoCaixaRepository, ConfiguracaoDoCaixaService, ConfiguracaoDoCaixaController}.java`;
  - `cashier/configuracao/dto/{ConfiguracaoDoCaixaRequest, ConfiguracaoDoCaixaResponse}.java`;
  - `cashier/CaixaConflitoException.java` (409, com `campo` opcional, tratada no `GlobalExceptionHandler` como as outras de conflito);
  - `cashier/CaixaNaoEncontradoException.java` (404).
- **Modify:**
  - `config/SecurityConfig.java`:
    - `POST /api/caixa/pontos` e `PATCH /api/caixa/pontos/**` → ADMIN;
    - `PUT /api/configuracoes/caixa` → ADMIN;
    - o resto de `/api/caixa/**` e o `GET /api/configuracoes/caixa` → authenticated;
  - `shared/error/GlobalExceptionHandler.java`.
- **Test:**
  - `cashier/ponto/PontosDeCaixaIT.java`;
  - `cashier/configuracao/ConfiguracaoDoCaixaIT.java` (MockMvc + Testcontainers, no padrão do `EstoqueServiceIT`).

**Interfaces:**
- Consumes: `ResolvedorDoUsuarioAutenticado` (Task 1).
- Produces (usados na Task 3):
  - `PontoDeCaixa PontosDeCaixaService.buscarAtivoParaAbrir(Long empresaId, UUID pontoId)`: 404 se não existe, 409 "Este ponto de caixa está inativo." se inativo;
  - `boolean ConfiguracaoDoCaixaService.fechamentoCego(Long empresaId)`: `true` sem linha;
  - `PontoDeCaixa` com `getId()`, `getUuid()`, `getNome()`, `isAtivo()`.
  - `SituacaoDoPontoResponse(String status, UUID sessaoId, String abertaPorNome, OffsetDateTime abertaEm)`.
  - **Interface `SessoesAbertasPorPonto`** em `cashier/ponto`, com:
    - `Map<Long, SituacaoDoPonto> situacoes(Long empresaId)`;
    - `Map<Long, BigDecimal> ultimosFundos(Long empresaId)`;
    - `boolean temSessaoAberta(Long empresaId, Long pontoId)`.

    A implementação `cashier/sessao/SessoesAbertasPorPontoJpa` é criada **nesta task**, com consultas nativas sobre `sessoes_caixa` e `usuario` (as tabelas já existem pela V16). Assim o pacote de ponto não depende do de sessão. Os testes desta task inserem sessões por `JdbcTemplate`.

- [ ] **Step 1: Testes** (`PontosDeCaixaIT`):
  - `listaGaranteCaixa1ParaEmpresaSemPonto`: apagar os pontos da empresa no setup → `GET /api/caixa/pontos` devolve 1 "Caixa 1";
  - duas chamadas concorrentes → continua 1;
  - `naoRecriaCaixa1QuandoTodosInativos`;
  - `criaPontoAdmin201` e `operadorNaoCria403`;
  - `nomeRepetidoComOutraCaixa409` (campo `nome`);
  - `nomeVazioOuMaisDe40Caracteres400`;
  - `limiteDe50Pontos409`;
  - `renomeia200`;
  - `inativarComSessaoAberta409` ("Feche o caixa deste ponto antes de inativá-lo.");
  - `inativaEReativa200`;
  - `pontoDeOutraEmpresa404`;
  - `filtroAtivo`.
- [ ] **Step 2: Testes** (`ConfiguracaoDoCaixaIT`):
  - `padraoECegoLigado` (sem linha → `fechamentoCego: true`);
  - `adminAlteraEGravaQuemEQuando` (`atualizadoPorNome` e `atualizadoEm` com `-03:00`);
  - `operadorLe200EAltera403`;
  - `corpoSemCampo400`.
- [ ] **Step 3:** Rodar → FAIL. Implementar:
  - a garantia do "Caixa 1" (`existsByEmpresaId` falso → inserir; a violação da unicidade é tratada como "já existe" e a leitura é refeita);
  - o `SecurityConfig` e o handler.
- [ ] **Step 4:** `./mvnw -q test -Dtest='PontosDeCaixaIT,ConfiguracaoDoCaixaIT'` → PASS.
- [ ] **Step 5: Commit** `feat(caixa): pontos de caixa e configuracao do fechamento cego`.

### Task 3: Sessões, movimentos, contagem e fechamento

**Files:**
- **Create:**
  - `cashier/sessao/{SessaoDeCaixa, StatusDaSessao, MovimentoDeCaixa, TipoDeMovimentoDeCaixa}.java`;
  - `cashier/sessao/{SessaoDeCaixaRepository, MovimentoDeCaixaRepository}.java`;
  - `cashier/sessao/{SessoesDeCaixaService, SessaoDeCaixaController}.java`;
  - `cashier/sessao/dto/{AbrirCaixaRequest, MovimentoDeCaixaRequest, ContagemRequest, FechamentoRequest, SessaoDeCaixaResponse, MovimentoDeCaixaResponse}.java`;
  - `cashier/sessao/FiltroDeSessoes.java`.
- **Test:**
  - `cashier/sessao/SessoesDeCaixaIT.java`;
  - `cashier/sessao/ModoCegoIT.java`;
  - `cashier/sessao/ConcorrenciaDoCaixaIT.java`;
  - `cashier/sessao/HistoricoDoCaixaIT.java`.

**Interfaces:**
- Consumes: Tasks 1 e 2.
- Produces (o PDV usará): `Optional<SessaoDeCaixa> SessoesDeCaixaService.sessaoAbertaDoUsuario(Long empresaId, Long usuarioId)`.
- **Repositório:**
  - `SessaoDeCaixaRepository.travarPorUuid(Long empresaId, UUID uuid)` com `@Lock(PESSIMISTIC_WRITE)`;
  - `MovimentoDeCaixaRepository.esperado(Long sessaoId)`: `coalesce(sum(case when tipo = 'SANGRIA' then -valor else valor end), 0)`.
- **Status dos endpoints:**
  - abrir e lançar: 201 na primeira gravação, 200 na repetição da chave;
  - contagem e fechamento: 200.

- [ ] **Step 1: Testes** (`SessoesDeCaixaIT`), um por regra da spec §8 "Backend". Nomes:
  - **abertura:**
    - `abreComFundoZero201`;
    - `fundoNegativoOuTresCasas400`;
    - `pontoInativo409`;
    - `pontoOcupado409ComNomeDeQuemAbriu` ("O Caixa 1 já está aberto por Ana Souza.");
    - `usuarioComOutroCaixa409` ("Você já tem um caixa aberto no Caixa 2.");
    - `chaveRepetida200MesmaSessao`;
    - `chaveRepetidaOutroFundo409`;
  - **sessão atual:** `atualDevolve204SemCaixa`;
  - **sangria:**
    - `sangriaIgualAoEsperadoDeixaZero`;
    - `sangriaUmCentavoAcima409ComValor` ("A sangria passa do dinheiro na gaveta (R$ 50,00).");
    - `motivoVazio400`;
    - `lancamentoEmConferencia409`;
    - `lancamentoEmFechada409`;
  - **limite do caixa:** `suprimentoQuePassaDoLimite400` (Review Focus 3: fundo 9.999.999.999,00 + suprimento 1,00 → 400 campo `valor` "O valor passa do limite do caixa.");
  - **contagem:**
    - `contagemSemDiferencaFechaNosDoisModos`;
    - `contagemComDiferencaNaoCegoComJustificativaFecha`;
    - `contagemComDiferencaNaoCegoSemJustificativaFicaEmConferencia`;
    - `contagemRepetidaMesmoValor200` (Review Focus 1);
    - `contagemOutroValor409` ("A contagem deste caixa já foi registrada.");
  - **fechamento:**
    - `fechamentoSemJustificativaOuEspacos400`;
    - `fechamentoRepetidoMesmaJustificativa200`;
    - `fechamentoOutraJustificativa409`;
    - `trocarModoDepoisDaContagemNaoMudaSessao`;
  - **permissões:**
    - `operadorEmSessaoDeOutro404` (detalhe, movimento, contagem, fechamento);
    - `adminFechaSessaoDeOutroERegistraAdmin`, e a sessão própria do ADMIN continua `ABERTA` (Review Focus 5);
    - `sessaoDeOutraEmpresa404`.
- [ ] **Step 2: Testes** (`ModoCegoIT`):
  - `operadorNaoRecebeDinheiroNaGavetaEmAberta` em `atual`, `detalhe`, histórico e `GET /api/caixa/pontos`;
  - `adminRecebe`;
  - `depoisDaContagemTodosRecebem`;
  - `justificativaJuntoComContagemNoCego400` ("Informe a justificativa depois de ver a diferença.");
  - `sangriaAcimaNoCegoParaOperadorSemValor` ("A sangria passa do dinheiro esperado na gaveta.").
- [ ] **Step 3: Testes** (`ConcorrenciaDoCaixaIT`, `CyclicBarrier` como no `EstoqueServiceIT`):
  - `duasSangriasQueJuntasPassamUmaRecebe409`;
  - `duasAberturasNoMesmoPontoUmaRecebe409` (violação do índice parcial → a mesma mensagem de ponto ocupado).
- [ ] **Step 4: Testes** (`HistoricoDoCaixaIT`, `Clock` fixo via `@TestConfiguration`, `-Duser.timezone=UTC` no teste):
  - `operadorSoVeAsSuas`;
  - `filtrosPontoEStatus`;
  - `sessaoAs2330DeSaoPauloCaiNoDia24` (Review Focus 2);
  - `ordemMaisRecentePrimeiro`;
  - `paginaSemMovimentos`.
- [ ] **Step 5:** Rodar → FAIL. Implementar o service com esta ordem em cada lançamento, contagem e fechamento:
  1. resolver o usuário;
  2. travar a sessão por `(empresa, uuid)`;
  3. aplicar a regra do dono (OPERADOR não dono → `CaixaNaoEncontradoException`);
  4. conferir o estado;
  5. calcular o esperado;
  6. validar;
  7. gravar.

  A idempotência da chave segue o `EstoqueService`: busca por `(empresa, chave)` antes de gravar, e a violação da unique depois da corrida é tratada como repetição. A abertura captura a violação dos índices parciais e devolve o 409 certo, identificando o índice pelo nome da constraint.
- [ ] **Step 6:** `./mvnw -q verify` → BUILD SUCCESS, com todos os testes do projeto.
- [ ] **Step 7: Commit** `feat(caixa): abertura, sangria, suprimento, contagem e fechamento das sessoes de caixa`.

### Task 4: Serviços, navegação e Configurações (frontend)

**Files:**
- **Create:**
  - `types/caixa.ts` (os tipos de §5.3: `PontoDeCaixa`, `SituacaoDoPonto`, `SessaoDeCaixa`, `MovimentoDeCaixa`, `StatusDaSessao`, `ConfiguracaoDoCaixa`, `FiltrosDoHistoricoDeCaixa`);
  - `services/caixaService.ts` e `services/configuracaoCaixaService.ts`, com os testes;
  - `features/cash-register/caixaQuery.ts` (prefixo `['caixa']`; `chaveDosPontos(ativo?)`, `CHAVE_DA_SESSAO_ATUAL`, `chaveDaSessao(id)`, `chaveDoHistorico(filtros)`, `CHAVE_DA_CONFIGURACAO_DO_CAIXA`);
  - `features/settings/ConfiguracoesPage.tsx`, `features/settings/SecaoCaixa.tsx` e `features/settings/PontosDeCaixa.tsx`, com os testes.
- **Modify:**
  - `components/layout/RootLayout.tsx`: "Caixa" com `to: '/caixa'`, sem `emBreve`; "Configurações" (ícone `Settings`) só para ADMIN;
  - `routes/router.tsx`: `caixa`, `caixa/historico` e `configuracoes` (dentro de `AdminRoute`).

**Interfaces:**
- Produces (Tasks 5 e 6):
  - `caixaService.{listarPontos, criarPonto, renomearPonto, inativarPonto, reativarPonto, sessaoAtual, abrir, lancar, contar, fechar, listarSessoes, buscarSessao}`;
  - `sessaoAtual()` devolve `SessaoDeCaixa | null` (o 204 vira `null`);
  - `configuracaoCaixaService.{buscar, salvar}`.

- [ ] **Step 1: Testes:**
  - `caixaService.test.ts`: rotas, corpos e `sessaoAtual` com 204 → `null`;
  - `ConfiguracoesPage.test.tsx`:
    - o interruptor salva e mostra "Configuração salva";
    - em erro, reverte e mostra a mensagem;
    - adicionar ponto, renomear em linha, inativar com 409 mostra "Feche o caixa deste ponto antes de inativá-lo.";
  - `RootLayout`: OPERADOR não vê "Configurações", e `/configuracoes` como OPERADOR redireciona (AdminRoute).
- [ ] **Step 2:** `npm test` → FAIL. Implementar. A frase do interruptor está na spec §6.7.
- [ ] **Step 3:** `npm run lint && npm run typecheck && npm test` → PASS.
- [ ] **Step 4: Commit** `feat(caixa): servicos do caixa, navegacao e tela de configuracoes`.

### Task 5: Tela `/caixa`

**Files:**
- **Create em `features/cash-register/`:**
  - `CaixaPage.tsx`;
  - `PontosParaAbrir.tsx`;
  - `CaixaAberto.tsx`;
  - `JanelaAbrirCaixa.tsx`;
  - `JanelaMovimento.tsx` (sangria e suprimento);
  - `JanelaFecharCaixa.tsx`;
  - `ResumoDoFechamento.tsx`;
  - `formatacaoCaixa.ts` (moeda, "Sobra de"/"Falta de", "Aberto desde 23/10 às 08:02").
- **Test:** `CaixaPage.test.tsx`, `JanelaFecharCaixa.test.tsx` e `formatacaoCaixa.test.ts`.

**Interfaces:**
- Consumes: Task 4.
- Produces: `formatarDiferenca(valor: number): { texto: string; tom: 'ok' | 'alerta' }` e `abertoEmOutroDia(abertaEm: string, hoje: Date): boolean` (data em `America/Sao_Paulo` via `Intl.DateTimeFormat` com `timeZone`).

- [ ] **Step 1: Testes** (MSW ou mocks dos serviços, no padrão das páginas existentes):
  - **sem caixa:** lista os pontos ativos com a situação;
  - **um único ponto:** "Abrir o Caixa 1" direto;
  - **abrir:**
    - o fundo vem de `ultimoFundoTroco`, com foco no campo, e Enter abre;
    - o botão fica desabilitado no envio, e a mesma chave é reenviada no retry;
  - **nenhum ponto ativo:** ADMIN vê o link para Configurações; OPERADOR vê "Peça ao administrador";
  - **destaque:** "Dinheiro na gaveta R$ 320,00"; no cego, o OPERADOR vê a frase de §6.3;
  - **sangria:** acima do esperado mostra o 409 do servidor;
  - **aviso:** "Aberto desde 23/10 às 08:02" com abertura no dia anterior;
  - **aba B com caixa fechado na aba A:** 409 "Este caixa já foi fechado." → mostra a mensagem, invalida a sessão atual e volta para a escolha de ponto (Review Focus 4);
  - **ADMIN:**
    - "Ver caixa" num ponto de outra pessoa abre a sessão pelo id, com o aviso "Você está fechando o caixa aberto por Ana Souza." na janela de fechar;
    - depois de fechar, volta ao próprio caixa aberto (Review Focus 5).
- [ ] **Step 2: Testes** (`JanelaFecharCaixa.test.tsx`):
  - **não cego:**
    - a diferença atualiza ao digitar ("Confere" / "Falta de R$ 2,00");
    - a justificativa aparece com diferença e é obrigatória;
    - contagem e justificativa vão no mesmo POST;
  - **cego:**
    - só o campo e "Conferir";
    - depois aparecem o resultado e a justificativa, e "Fechar caixa" chama `fechar`;
  - **retry:** a contagem repetida com 200 mostra o resultado (Review Focus 1);
  - **retomada:** sessão `EM_CONFERENCIA` ao abrir a tela → "Contagem registrada · falta a justificativa" e a janela já no passo da justificativa.
- [ ] **Step 3:** Rodar → FAIL. Implementar com `CampoMoeda` e o feedback fixo. Depois de cada mutação, invalidar o prefixo `['caixa']`.
- [ ] **Step 4:** `npm run lint && npm run typecheck && npm test && npm run build` → PASS.
- [ ] **Step 5: Commit** `feat(caixa): tela do caixa com abertura, lancamentos e fechamento`.

### Task 6: Histórico `/caixa/historico`

**Files:**
- **Create:**
  - `features/cash-register/HistoricoDoCaixaPage.tsx`;
  - `features/cash-register/DetalheDaSessao.tsx` (`Sheet`);
  - `features/cash-register/useFiltrosDoHistorico.ts` (filtros na URL, como `useFiltrosDaListaDeFornecedores`).
- **Test:** `HistoricoDoCaixaPage.test.tsx`.
- **Modify:** `CaixaPage.tsx` (link "Histórico").

- [ ] **Step 1: Testes:**
  - colunas e cores da diferença;
  - "Aberto" e "Em conferência" nas sessões não fechadas;
  - filtros de ponto, situação, de e até refletidos na URL e na chamada;
  - paginação com `PaginacaoLista`;
  - o clique abre o `Sheet` com os movimentos e a justificativa;
  - estados vazio ("Nenhum caixa neste período.") e erro com "Tentar de novo".
- [ ] **Step 2:** Rodar → FAIL. Implementar.
- [ ] **Step 3:** `npm run lint && npm run typecheck && npm test && npm run build` → PASS.
- [ ] **Step 4: Commit** `feat(caixa): historico das sessoes de caixa`.

---

## Depois das tasks (CTO)
- **Revisores:**
  - `data-reviewer` (V16) e `security-reviewer` (perfis, dono, modo cego);
  - `back-end-reviewer` e `front-end-reviewer`;
  - `product-ux-reviewer` e `qa-reviewer`.
- **Dev:**
  - backup `pg_dump -Fc` antes da V16;
  - subir o backend;
  - smoke da API com o usuário de teste;
  - navegador nos dois modos, incluindo o ADMIN fechando o caixa de um OPERADOR.
- **Docs:** "Ajustes na implementação" na spec, `docs/modules/README.md` (Caixa ✔) e as DTs novas que surgirem.
