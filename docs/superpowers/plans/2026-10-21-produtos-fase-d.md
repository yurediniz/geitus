# Produtos Fase D (Estoque básico) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto, a execução é orquestrada pelo CTO: as tasks 1–4 ficam com o `back-end-executor` e as 5–7 com o `front-end-executor`, com revisores após cada bloco.

**Goal:** estoque por produto, com saldo derivado de movimentações imutáveis, ajuste com motivo, estoque inicial no cadastro, indicadores na listagem e bloqueio de exclusão de produto movimentado.

**Architecture:**
- **Backend:**
  - pacote novo `com.geitus.app.inventory`, com `movimentos_estoque` (só inserção) e `estoque_saldos` (saldo ≥ 0), gravados na mesma transação;
  - toda escrita de estoque e a exclusão do produto travam a linha do produto (`buscarPorUuidParaAtualizar`, `FOR UPDATE`) e depois a do saldo;
  - o catálogo fala com o estoque só por duas interfaces definidas em `catalog`.
- **Frontend:**
  - a aba Estoque ganha saldo, interruptor, estoque inicial e o modal de ajuste;
  - a aba Histórico ganha a seção Estoque;
  - a listagem ganha a coluna Estoque.

**Tech Stack:** Java 21, Spring Boot 3.5, JPA/Hibernate 6, Flyway, PostgreSQL 16, Testcontainers; React 19, TS, RHF + Zod 4, TanStack Query v5, shadcn/ui (radix-ui Dialog), Vitest.

**Spec:** [`docs/modules/produtos-estoque.md`](../../modules/produtos-estoque.md) (DEC-034). Os executores leem a spec inteira; este plano registra só as decisões de implementação. As interfaces entre `catalog` e `inventory` deste plano (Task 3) **substituem** a lista de métodos sugerida na spec §4.7, que será atualizada no fechamento.

## Global Constraints
- **Banco:**
  - migration nova `V9__estoque_basico.sql`; V1–V8 intocadas (DEC-020);
  - quantidades em `NUMERIC(12,3)`, nunca ponto flutuante no backend.
- **Isolamento:** por empresa (DEC-016) e FKs compostas `(empresa_id, …)`. Movimentos e saldos referenciam o produto com **ON DELETE RESTRICT**.
- **Permissões:** ajuste só ADMIN; leitura de movimentos para qualquer autenticado. A empresa sempre vem do JWT, e o usuário do movimento é sempre o autenticado.
- **Mensagens:** as copiadas da spec §4, em pt-BR com acentos. Chaves de `campos`: `quantidade`, `motivo`, `observacao`, `tipo`, `estoqueInicial`, `pontoReposicao`, `estoqueMaximo` e `unidadeId`.
- **Reuso:**
  - `PaginaResponse` (de `catalog/dto`), com os mesmos limites de paginação do histórico de preços (reutilizar a validação, sem duplicar);
  - `CampoMoeda` não se aplica a quantidade.
- **Dependências e escopo:** nenhuma dependência nova; nada de fiscal, PDV ou custo médio.
- **Commits:** em pt-BR, no padrão `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Primeiro movimento de um produto em paralelo** (dois ajustes sem linha de saldo): sem erro 500 e sem saldo errado. O `INSERT ... ON CONFLICT DO NOTHING` seguido de `FOR UPDATE` resolve. Teste na Task 2.
2. **Ajuste e exclusão ao mesmo tempo:** a exclusão não pode apagar um produto que acabou de receber um ajuste. A trava do produto serializa as duas operações, e uma violação de FK no DELETE vira 409, nunca 500. Teste na Task 3.
3. **Rede lenta com reenvio da mesma `chave` depois de um erro:** responde 200 com o movimento original e não grava um segundo movimento. No front, a mesma chave é reaproveitada até o modal fechar com sucesso. Testes nas Tasks 2 e 6.
4. **Produto com controle desligado e saldo guardado:** a resposta mantém `estoqueAtual`, `situacaoEstoque` vem `null`, o ajuste dá 400 e, ao religar, o saldo volta. Testes nas Tasks 3 e 6.
5. **Quantidade digitada com vírgula** ("2,5") em KG é aceita e enviada como 2.5. Em UN, "2,5" mostra o erro de fração sem enviar. Teste na Task 6.

---

### Task 1: V9 e mapeamento

**Files:**
- Create: `backend/src/main/resources/db/migration/V9__estoque_basico.sql`
- Create, em `backend/src/main/java/com/geitus/app/inventory/`:
  - `MovimentoEstoque.java`, `EstoqueSaldo.java`;
  - `TipoMovimento.java` (`ENTRADA`, `SAIDA`, `AJUSTE`);
  - `MotivoMovimento.java` (os valores de §4.3, com `String rotulo()` e `Set<TipoMovimento> tipos()`; `ESTOQUE_INICIAL` e `VENDA` com `manual() == false`);
  - `OrigemMovimento.java` (`AJUSTE_MANUAL`, `CADASTRO`, `VENDA`);
  - `MovimentoEstoqueRepository.java`, `EstoqueSaldoRepository.java`.
- Modify: `catalog/Produto.java` (`controlaEstoque` boolean, getter e uso em `DadosProduto`)
- Test: `backend/src/test/java/com/geitus/app/inventory/MigracaoV9IT.java`, nos moldes de `MigracaoV8IT`

**Interfaces:**
- **Produces:**
  - entidade `MovimentoEstoque(Produto produto, TipoMovimento tipo, MotivoMovimento motivo, OrigemMovimento origem, BigDecimal quantidade, BigDecimal saldoAnterior, BigDecimal saldoNovo, String observacao, Long usuarioId, UUID chaveIdempotencia)`, com a empresa vinda do produto (padrão `HistoricoPreco`), `uuid` e `criadoEm` em `@PrePersist` e todas as colunas `updatable = false`;
  - entidade `EstoqueSaldo` com `aplicar(BigDecimal variacao)`, que atualiza `saldo` e `atualizadoEm`;
  - em `EstoqueSaldoRepository`:
    - `@Modifying` nativo `garantirLinha(Long empresaId, Long produtoId)` (`INSERT ... ON CONFLICT (empresa_id, produto_id) DO NOTHING`);
    - `@Lock(PESSIMISTIC_WRITE) buscarParaAtualizar(Long empresaId, Long produtoId): Optional<EstoqueSaldo>`;
    - `saldos(Long empresaId, Collection<Long> produtoIds): List<SaldoPorProduto>` (projeção `produtoId`, `saldo`);
  - em `MovimentoEstoqueRepository`:
    - `findByEmpresaIdAndChaveIdempotencia(Long, UUID)`;
    - consulta paginada por produto, projetando direto num DTO com `usuarioNome` (padrão `HistoricoPrecoRepository`);
    - `contagens(Long empresaId, Collection<Long> produtoIds): List<ContagemDeMovimentos>` (`produtoId`, `total`, `naoIniciais`);
    - `existsByEmpresaIdAndProdutoUnidadeIdComMovimento(...)`, ou uma JPQL `existeMovimentoDeProdutoDaUnidade(Long empresaId, Long unidadeId)`.

- [ ] **Step 1:** escrever o `MigracaoV9IT`:
  - `produtosExistentesPassamAControlarEstoque`;
  - `tabelasComecamVazias`;
  - `rejeitaSaldoNegativo`;
  - `rejeitaSaldoNovoIncoerente`;
  - `rejeitaEntradaComQuantidadeNegativa`;
  - `rejeitaSaidaComQuantidadePositiva`;
  - `rejeitaQuantidadeZero`;
  - `rejeitaCadastroComMotivoDiferenteDeEstoqueInicial`;
  - `rejeitaMotivoForaDaLista`;
  - `rejeitaExcluirProdutoComMovimento` (23503);
  - `rejeitaExcluirProdutoComSaldo` (23503);
  - `rejeitaMovimentoComUsuarioDeOutraEmpresa`;
  - `chaveDeIdempotenciaUnicaPorEmpresa` (a mesma chave em empresas diferentes é aceita);
  - `umSaldoPorProduto`.
- [ ] **Step 2:** rodar `./mvnw -q verify -Dit.test=MigracaoV9IT -Dtest=none -Dsurefire.failIfNoSpecifiedTests=false`. Esperado: FAIL.
- [ ] **Step 3:** escrever a V9 conforme a spec §3, com estes nomes:
  - `fk_estoque_saldo_produto`, `uq_estoque_saldo_produto`, `ck_estoque_saldo_nao_negativo`;
  - `fk_movimento_estoque_produto`, `fk_movimento_estoque_usuario`, `uq_movimento_estoque_chave`;
  - `ck_movimento_estoque_tipo`, `ck_movimento_estoque_motivo`, `ck_movimento_estoque_origem`;
  - `ck_movimento_estoque_quantidade`, `ck_movimento_estoque_coerencia`, `ck_movimento_estoque_sinal`, `ck_movimento_estoque_cadastro`, `ck_movimento_estoque_saldos`;
  - `ix_movimento_estoque_produto`.

  Mapear as entidades com `ddl-auto: validate`.
- [ ] **Step 4:** rodar o IT do Step 2 e `./mvnw -q verify`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(estoque): migration V9 com saldos e movimentos de estoque`.

### Task 2: Serviço de estoque (ajuste, idempotência, concorrência) e endpoints

**Files:**
- Create, em `backend/src/main/java/com/geitus/app/inventory/`:
  - `EstoqueService.java`, `EstoqueController.java`;
  - `dto/AjusteEstoqueRequest.java`, `dto/MovimentoEstoqueResponse.java`.
- Test: `inventory/EstoqueServiceTest.java`, `inventory/EstoqueControllerTest.java` e `inventory/EstoqueServiceIT.java`

**Interfaces:**
- **Consumes:**
  - a Task 1;
  - `ProdutoRepository.buscarPorUuidParaAtualizar(UUID, Long)`, que já existe;
  - `PaginaResponse` e a validação de paginação, extraída para um helper reutilizável em `catalog` (por exemplo, `Paginacao.validar(int pagina, int tamanho)`), usado pelo histórico de preços e aqui;
  - a resolução da empresa do usuário, no mesmo padrão dos outros services.
- **Produces:**
  - `record AjusteEstoqueRequest(@NotNull TipoMovimento tipo, @NotNull @DecimalMin("0") @Digits(integer=9, fraction=3) BigDecimal quantidade, @NotNull MotivoMovimento motivo, @Size(max=200) String observacao, @NotNull UUID chave)`;
  - `record MovimentoEstoqueResponse(UUID id, TipoMovimento tipo, MotivoMovimento motivo, OrigemMovimento origem, BigDecimal quantidade, BigDecimal saldoAnterior, BigDecimal saldoNovo, String observacao, String usuarioNome, LocalDateTime criadoEm)`;
  - `EstoqueService.ajustarParaUsuario(Long idUsuario, UUID produtoId, AjusteEstoqueRequest request): ResultadoAjuste`, com `record ResultadoAjuste(MovimentoEstoqueResponse movimento, boolean criado)`; o controller devolve 201 se `criado` e 200 se não;
  - `EstoqueService.movimentosParaUsuario(Long idUsuario, UUID produtoId, int pagina, int tamanho): PaginaResponse<MovimentoEstoqueResponse>`;
  - `MovimentoEstoque registrarMovimento(Produto produto, TipoMovimento tipo, MotivoMovimento motivo, OrigemMovimento origem, BigDecimal variacao, String observacao, Long usuarioId, UUID chave)` (package-private), que garante a linha, trava, aplica, grava e é usado também pelo estoque inicial (Task 3);
  - endpoints `POST /api/produtos/{id}/estoque/ajustes` e `GET /api/produtos/{id}/estoque/movimentos`.
- **Ordem no ajuste:**
  1. resolver a empresa;
  2. se a `chave` já existe na empresa: mesmo produto, tipo, motivo e quantidade → devolver com `criado = false`; senão → 409;
  3. `buscarPorUuidParaAtualizar` (404);
  4. controle desligado → 400;
  5. motivo do tipo e manual → 400 `motivo`;
  6. `OUTRO` sem observação → 400 `observacao`;
  7. fração em unidade não fracionada → 400 `quantidade`;
  8. trava do saldo;
  9. calcular a variação (AJUSTE: saldo contado − saldo; igual → 400 "O saldo já é 12 UN."; SAÍDA maior que o saldo → 400 "Saldo insuficiente: há 3 UN.");
  10. gravar.
- **Chave concorrente:** violação de `uq_movimento_estoque_chave` (dois pedidos simultâneos com a mesma chave) → nova leitura e devolver o existente.
- **Formatação na mensagem:** a quantidade aparece sem zeros à direita ("3 UN", "2,5 KG", com vírgula).
- **Quantidade > 0:** obrigatória em ENTRADA e SAÍDA (400 `quantidade`, "Informe uma quantidade maior que zero."); no AJUSTE, 0 é permitido (zerar o estoque).

- [ ] **Step 1:** escrever os testes:
  - serviço (unitário):
    - `entradaSomaAoSaldo`;
    - `saidaSubtraiDoSaldo`;
    - `saidaIgualAoSaldoZera`;
    - `saidaAcimaDoSaldo_400` (saldo 3, saída 3.001, "Saldo insuficiente: há 3 UN.");
    - `ajusteParaCimaEParaBaixo`;
    - `ajusteParaOMesmoSaldo_400` ("O saldo já é 12 UN.");
    - `fracaoEmUN_400` e `fracaoEmKG_ok`;
    - `motivoDeOutroTipo_400`;
    - `motivoEstoqueInicialManual_400`;
    - `outroSemObservacao_400`;
    - `produtoSemControle_400`;
    - `chaveRepetidaMesmosDados_devolveOExistenteSemGravar`;
    - `chaveRepetidaOutrosDados_409`;
  - IT:
    - `ajustesConcorrentesMantemACadeia` (dois threads, primeiro movimento do produto, sem linha de saldo: final = soma, sem erro, `saldo_anterior` de um = `saldo_novo` do outro);
    - `chaveConcorrenteGravaUmSo`;
    - `movimentosOrdenadosEPaginados`;
    - `produtoDeOutraEmpresa_404`;
  - controller:
    - `operadorAjustando_403`;
    - `semToken_401`;
    - `ajusteCriado_201` e `chaveRepetida_200`;
    - `uuidMalformado_400`;
    - `operadorLendoMovimentos_200`;
    - `paginaGrandeDemais_400`;
    - `tipoInvalido_400`.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `./mvnw -q verify`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(estoque): ajuste de estoque com motivo, idempotencia e consulta de movimentos`.

### Task 3: Integração com o catálogo (estoque inicial, resposta, exclusão, unidade, níveis)

**Files:**
- Create, em `backend/src/main/java/com/geitus/app/catalog/`:
  - `UsoDoProdutoNoEstoque.java` (interface);
  - `RegistroDeEstoqueInicial.java` (interface);
  - `ResumoDeEstoque.java` (record);
  - `SituacaoEstoque.java` (enum com `static SituacaoEstoque de(boolean controla, BigDecimal saldo, BigDecimal pontoReposicao, BigDecimal estoqueMinimo)`, que devolve `null` sem controle).
- Create: `backend/src/main/java/com/geitus/app/inventory/EstoqueDoCatalogo.java`, que implementa as duas interfaces delegando ao `EstoqueService` e aos repositórios.
- Modify:
  - `catalog/ProdutoService.java`, `catalog/dto/ProdutoRequest.java` (`@NotNull Boolean controlaEstoque` e `BigDecimal estoqueInicial`), `catalog/dto/ProdutoResponse.java`, `catalog/DadosProduto.java`;
  - `catalog/unidade/UnidadeMedidaService.java`;
  - os builders de teste.
- Test: `ProdutoServiceTest`, `ProdutoControllerTest`, `ProdutoResponseTest`, `SituacaoEstoqueTest`, `UnidadeMedidaServiceTest`, `CatalogoServiceIT` (ou um `EstoqueCatalogoIT` novo)

**Interfaces:**
- **Consumes:** a Task 2 (`registrarMovimento`).
- **Produces:**
  - `record ResumoDeEstoque(BigDecimal saldo, long totalMovimentos, long movimentosNaoIniciais)`, com `boolean temMovimentos()` e `boolean permiteExcluir()` (`movimentosNaoIniciais == 0`); `ResumoDeEstoque.VAZIO` com saldo 0;
  - `UsoDoProdutoNoEstoque`:
    - `Map<Long, ResumoDeEstoque> resumos(Long empresaId, Collection<Long> produtoIds)`, em lote, com 2 consultas no máximo;
    - `boolean algumProdutoDaUnidadeTemMovimentos(Long empresaId, Long unidadeId)`;
  - `RegistroDeEstoqueInicial`:
    - `void registrar(Produto produto, BigDecimal quantidade, Long usuarioId)`;
    - `void removerParaExclusao(Long empresaId, Long produtoId)`, que apaga o movimento inicial e o saldo e só é chamado quando `permiteExcluir()`;
  - `ProdutoResponse.de(Produto, CategoriaArvore, boolean podeExcluir, LocalDate hoje, ResumoDeEstoque estoque)`, com os campos novos `controlaEstoque`, `estoqueAtual` e `situacaoEstoque`;
  - `podeExcluir(Produto)` passa a usar `resumos(...).permiteExcluir()`, e a listagem chama `resumos` uma vez para todos os ids.
- **Regras no `ProdutoService`:**
  - `cadastrar`: com `estoqueInicial` não nulo, exige `controlaEstoque` (400 `estoqueInicial`), quantidade > 0, fração conforme a unidade e escala ≤ 3, e chama `registrar` depois do `save`, na mesma transação;
  - `atualizarDadosBasicos`:
    - `estoqueInicial` não nulo → 400 `estoqueInicial` ("O estoque inicial só pode ser informado no cadastro. Use Ajustar estoque.");
    - unidade de venda diferente da atual com `temMovimentos()` → 400 `unidadeId`;
  - níveis: mínimo ≤ ponto (400 `pontoReposicao`, "O ponto de reposição não pode ser menor que o estoque mínimo.") e ponto ≤ máximo (400 `estoqueMaximo`, "O estoque máximo não pode ser menor que o ponto de reposição."), além da regra que já existe;
  - `excluir`: `buscarPorUuidParaAtualizar` (trava), resumo, `!permiteExcluir()` → 409 ("Este produto já teve movimentação de estoque e não pode ser excluído. Inative-o."); se `temMovimentos()`, chama `removerParaExclusao` e depois o delete. Uma violação de FK no flush do DELETE é capturada → 409 com a mesma mensagem. O log INFO ganha `estoqueInicial={quantidade}` quando havia.
- **`UnidadeMedidaService.atualizarParaUsuario`:** passar de `fracionada = true` para `false` com `algumProdutoDaUnidadeTemMovimentos` → 400 ("Esta unidade é usada por produtos com movimentação de estoque.").

- [ ] **Step 1:** escrever os testes:
  - `SituacaoEstoqueTest`: sem controle → null; saldo 0 → `SEM_ESTOQUE`; saldo = ponto → `BAIXO`; sem ponto, saldo = mínimo → `BAIXO`; acima dos dois → `NORMAL`; sem níveis e saldo > 0 → `NORMAL`;
  - service:
    - `cadastroComEstoqueInicialRegistraEntrada`;
    - `cadastroComEstoqueInicialSemControle_400`;
    - `estoqueInicialFracionadoEmUN_400`;
    - `estoqueInicialNoPatch_400`;
    - `trocarUnidadeComMovimento_400`;
    - `trocarUnidadeSemMovimento_ok`;
    - `pontoMenorQueMinimo_400`;
    - `maximoMenorQuePonto_400`;
    - `podeExcluirSemMovimento`;
    - `podeExcluirSoComEstoqueInicial`;
    - `naoPodeExcluirComAjuste`;
    - `respostaComControleDesligadoMantemSaldoESituacaoNula` (Review Focus 4);
  - IT:
    - `excluirComSoEstoqueInicialApagaMovimentoESaldo` (204, e as tabelas ficam vazias para o produto);
    - `excluirComAjuste_409`;
    - `cadastroQueFalhaNaoGravaEstoqueInicial` (SKU duplicado ou spy);
    - `exclusaoEAjusteConcorrentes_nuncaDao500` (Review Focus 2: uma termina e a outra recebe 409 ou o ajuste recebe 404);
    - `listagemCarregaEstoqueEmLote` (contar consultas com o `Statistics` do Hibernate ou um datasource-proxy já disponível; se não houver ferramenta, confirmar pelo número de chamadas ao `resumos` com um spy);
  - `UnidadeMedidaServiceTest`: `desligarFracionadaComProdutoMovimentado_400` e `desligarFracionadaSemMovimento_ok`;
  - controller: `controlaEstoqueAusente_400`.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `./mvnw -q verify`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): estoque inicial, situacao do estoque e exclusao condicionada a movimentacao`.

### Task 4: Fechamento do backend
- [ ] Rodar `./mvnw verify` e conferir a contagem de testes.
- [ ] Atualizar o OpenAPI (anotações `@Operation`/`@Schema` nos endpoints e DTOs novos, no padrão do `ProdutoController`).
- [ ] Commit `docs(estoque): documenta os endpoints de estoque no OpenAPI`, se houver mudança.

### Task 5: Tipos, serviço e formulário (controle, estoque inicial, níveis)

**Files:**
- Create: `frontend/src/types/estoque.ts`, `frontend/src/services/estoqueService.ts` e `frontend/src/services/estoqueService.test.ts`
- Modify:
  - `frontend/src/types/produto.ts` (em `Produto`: `controlaEstoque`, `estoqueAtual: number`, `situacaoEstoque: SituacaoEstoque | null`; em `ProdutoRequest`: `controlaEstoque`, `estoqueInicial?: number | null`);
  - `features/products/produtoFormulario.ts` (form values `controlaEstoque: boolean` com padrão `true` e `estoqueInicial: string`; Zod: estoque inicial > 0, até 3 casas, aceita vírgula; mínimo ≤ ponto ≤ máximo com as mensagens da Task 3; `montarRequest` só envia `estoqueInicial` no modo novo);
  - `features/products/abas/AbaEstoque.tsx`;
  - `frontend/src/test/fixturesProduto.ts`.
- Test: `produtoFormulario.test.ts` e `ProdutoPage.test.tsx`

**Interfaces:**
- **Produces:**
  - `type TipoMovimento = 'ENTRADA' | 'SAIDA' | 'AJUSTE'`;
  - `type MotivoMovimento` (os 9 valores);
  - `type SituacaoEstoque = 'NORMAL' | 'BAIXO' | 'SEM_ESTOQUE'`;
  - `interface MovimentoEstoque` (campos da resposta da Task 2);
  - `interface AjusteEstoqueRequest`;
  - `ajustarEstoque(produtoId: string, dados: AjusteEstoqueRequest): Promise<MovimentoEstoque>`;
  - `listarMovimentosDeEstoque(produtoId: string, pagina: number, tamanho = 20): Promise<PaginaResponse<MovimentoEstoque>>`;
  - `chaveDosMovimentosDeEstoque(id)` = `['produtos', id, 'movimentos-estoque']`, no mesmo arquivo das chaves do histórico de preços;
  - `lib/quantidade.ts`:
    - `interpretarQuantidade(texto: string): number | null` (aceita "2,5" e "2.5"; até 3 casas; `null` se inválido);
    - `formatarQuantidade` reaproveitando o de `formatacaoProduto.ts`, se já existir.
- **Campos numéricos de estoque:** inputs de texto com `inputMode="decimal"`, não `type="number"`, para aceitar vírgula. Mínimo, ponto e máximo também mudam para esse padrão.

- [ ] **Step 1:** escrever os testes:
  - `interpretarQuantidade`: '2,5' → 2.5; '2.5' → 2.5; '1,2345' → null; 'abc' → null; '' → null;
  - Zod: ponto < mínimo → erro em `pontoReposicao`; máximo < ponto → erro em `estoqueMaximo`; estoque inicial "0" → erro; "2,5" em UN → erro de fração no envio (padrão do atacado);
  - página:
    - o modo novo mostra "Estoque inicial (opcional)" com a sigla;
    - o modo edição não mostra o campo e mostra o saldo "12 UN" com o selo;
    - o interruptor desligado esconde o saldo, o estoque inicial e os níveis;
    - desligar um produto salvo com saldo > 0 mostra o aviso "O saldo atual de 12 UN fica guardado e volta se você religar o controle.";
    - o POST envia `estoqueInicial: 2.5` para "2,5" em KG (Review Focus 5);
    - o PATCH não envia `estoqueInicial`;
    - um 400 do servidor em `pontoReposicao` salta para a aba Estoque.
- [ ] **Step 2:** rodar `npm test -- produtoFormulario ProdutoPage estoqueService quantidade`. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npm test`, `npm run lint` e `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): controle de estoque e estoque inicial na aba Estoque`.

### Task 6: Modal "Ajustar estoque"

**Files:**
- Create: `frontend/src/features/products/estoque/ModalAjusteEstoque.tsx`, `ModalAjusteEstoque.test.tsx`, `ajusteEstoque.ts` e `ajusteEstoque.test.ts`
- Modify: `features/products/abas/AbaEstoque.tsx` (botão e modal) e `features/products/ProdutoPage.tsx`, se precisar passar o produto ou o perfil

**Interfaces:**
- **Consumes:** `ajustarEstoque`, `chaveDosMovimentosDeEstoque` e `interpretarQuantidade` (Task 5).
- **Produces (funções puras em `ajusteEstoque.ts`):**
  - `motivosDoTipo(tipo: TipoMovimento): MotivoMovimento[]`, sem os de sistema e na ordem da spec §4.3;
  - `ROTULO_MOTIVO: Record<MotivoMovimento, string>`;
  - `ROTULO_TIPO: Record<TipoMovimento, string>` ("Entrada", "Saída", "Contar e ajustar para");
  - `calcularPrevia(tipo, quantidade: number, saldo: number): { saldoNovo: number, erro: string | null }`, com os erros "Saldo insuficiente: há 3 UN." e "O saldo já é 12 UN.", formatados com a sigla;
  - `textoMovimento(m: MovimentoEstoque, sigla: string)`, usado na Task 7.
- **Comportamento:**
  - Radix Dialog; o foco começa no grupo de tipo; Enter confirma (sem salvar o produto: o modal fica fora do `<form>` do produto ou em portal, com teste); Esc fecha;
  - `chave = crypto.randomUUID()` gerada ao **abrir** e mantida até fechar com sucesso, inclusive em nova tentativa depois de erro;
  - "Confirmar" desabilitado durante o envio, com guarda síncrona `useRef` (padrão da Fase B);
  - no sucesso: fecha, mostra o toast "Estoque atualizado: 10 UN." e invalida `['produtos']` (prefixo, que cobre detalhe, listagem e movimentos);
  - um 400 com `campos` marca o campo; um 409 mostra a mensagem no topo do modal;
  - o botão "Ajustar estoque" aparece para ADMIN, no modo edição e com controle ligado. Fica desabilitado, com a dica "Salve o produto antes de ajustar o estoque.", quando o formulário tem alterações.

- [ ] **Step 1:** escrever os testes:
  - puros:
    - `motivosDoTipo('ENTRADA')` → `['COMPRA','DEVOLUCAO_CLIENTE','OUTRO']`;
    - `('SAIDA')` → os 5;
    - `('AJUSTE')` → `['CONTAGEM','OUTRO']`;
    - `calcularPrevia('SAIDA', 4, 3)` → erro "Saldo insuficiente: há 3 UN.";
    - `('AJUSTE', 12, 12)` → erro "O saldo já é 12 UN.";
    - `('AJUSTE', 10, 12)` → saldoNovo 10;
  - modal:
    - o motivo é filtrado e muda ao trocar o tipo;
    - "Contar e ajustar para" pré-seleciona Contagem e muda o rótulo para "Saldo contado";
    - "Outro" exige observação;
    - a prévia "Saldo: 12 UN → 10 UN";
    - uma saída acima do saldo bloqueia o envio;
    - "2,5" em UN dá erro de fração sem envio;
    - duplo clique em Confirmar faz uma chamada só;
    - um erro de rede seguido de nova tentativa usa a mesma `chave` (Review Focus 3);
    - um 400 em `quantidade` aparece no campo;
    - o sucesso fecha, mostra o toast e invalida;
    - Enter no modal não envia o formulário do produto;
  - aba:
    - o botão some para OPERADOR, no modo novo e com controle desligado;
    - fica desabilitado com alterações pendentes.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npm test`, `npm run lint` e `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): modal de ajuste de estoque`.

### Task 7: Histórico de estoque e coluna na listagem

**Files:**
- Create: `frontend/src/features/products/estoque/SecaoMovimentosEstoque.tsx` e `frontend/src/features/products/estoque/SeloSituacaoEstoque.tsx`
- Modify: `features/products/abas/AbaHistorico.tsx` (seções "Estoque" e "Preços", cada uma com `useInfiniteQuery` próprio, só com a aba aberta) e `features/products/ProdutosListaPage.tsx` (coluna Estoque)
- Test: `ProdutoPage.test.tsx` e `ProdutosListaPage.test.tsx`

**Interfaces:**
- **Consumes:** `listarMovimentosDeEstoque`, `chaveDosMovimentosDeEstoque` e `textoMovimento`.
- **`SeloSituacaoEstoque({ situacao })`:**
  - `BAIXO` → "Estoque baixo" (tom de aviso);
  - `SEM_ESTOQUE` → "Sem estoque" (tom destrutivo suave);
  - `NORMAL` e `null` → nada.

  Usa só tokens de tema que já existem.
- **Seção Estoque:**
  - a linha mostra "Saída · Perda/avaria", "−2 UN" e "12 → 10", mais a observação, o usuário e a data no mesmo formato do histórico de preços;
  - estado vazio: "Nenhuma movimentação de estoque ainda.";
  - com controle desligado, mostra os movimentos que existirem e a nota "Este produto não controla estoque no momento.".

- [ ] **Step 1:** escrever os testes:
  - as duas seções aparecem na edição, e Estoque vem primeiro;
  - a linha de estoque mostra o texto, o sinal e a sigla;
  - "Carregar mais" de estoque busca `pagina=1` sem afetar a seção de preços;
  - estados de carregando, erro com "Tentar de novo" e vazio;
  - listagem: "12 UN" com "Estoque baixo"; "0 UN" com "Sem estoque"; "—" sem controle; produto `NORMAL` sem selo.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npm test`, `npm run lint`, `npm run typecheck` e `npm run build`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): historico de movimentacoes de estoque e coluna Estoque na listagem`.

### Task 8 (CTO): integração e documentação
- [ ] Aplicar a V9 no `geitus_db` de dev com backup antes, conferindo antes e depois (30 produtos com `controla_estoque = true`, tabelas vazias).
- [ ] Smoke da API:
  - estoque inicial;
  - entrada, saída e contagem;
  - saldo insuficiente;
  - chave repetida (200, um movimento);
  - exclusão com só o estoque inicial (204) e com ajuste (409);
  - troca de unidade bloqueada;
  - OPERADOR → 403, se houver usuário OPERADOR de teste.
- [ ] Verificação no navegador: estoque inicial no cadastro, modal (prévia, motivos, erro de saldo), selos na listagem e a seção Estoque no Histórico.
- [ ] Atualizar:
  - o status da spec;
  - `produtos.md`, `docs/modules/README.md` (Fase D ✔), os READMEs;
  - `technical-debt.md` (DT-028 parcialmente resolvida);
  - a revisão da "Ordem recomendada de desenvolvimento" do `CLAUDE.md` (propor ao usuário, sem alterar por conta própria);
  - a memória.
- [ ] Rodar `./mvnw verify`, `npm run lint && npm run typecheck && npm test && npm run build` e `git status`.
