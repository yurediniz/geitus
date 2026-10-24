# Produtos Fase B4 (Custo na entrada por compra) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto, a execução é orquestrada pelo CTO: as tasks 1–2 ficam com o `back-end-executor` e a 3 com o `front-end-executor`, em paralelo, com revisores depois.

**Goal:** a entrada manual por compra exige o custo, o custo do produto passa a ser o último de entrada, e a tela e o histórico mostram a origem do custo.

**Architecture:**
- **Backend:**
  - o `inventory` valida o custo e grava o movimento;
  - o `catalog` aplica o custo no produto por uma interface sua, `CustoDeEntrada`, implementada no próprio catalog e chamada pelo inventory na mesma transação. Assim o catalog não depende do inventory;
  - a origem do custo fica no produto (`custo_origem`, `custo_origem_em`);
  - a quantidade e a embalagem da última compra vêm do inventory pela interface já existente `UsoDoProdutoNoEstoque`, ampliada.
- **Frontend:** o campo "Custo" no modal de ajuste, a nota de origem em Preços e as linhas novas do Histórico.

**Tech Stack:** Java 21, Spring Boot 3.5, JPA/Hibernate 6, Flyway, PostgreSQL 16, Testcontainers; React 19, TS, RHF + Zod 4, TanStack Query v5, Vitest.

**Spec:** [`docs/modules/produtos-custo-entrada.md`](../../modules/produtos-custo-entrada.md) (DEC-038). Os executores leem a spec inteira; as mensagens estão em §2.3 e os textos de tela em §4 e §7.

## Global Constraints
- **Migrations:** só a nova `V13__custo_entrada.sql`; V1–V12 intocadas (DEC-020). A V13 preserva os dados e marca as linhas antigas de custo como `EDICAO`.
- **Valores:**
  - o custo informado tem até 10 inteiros e 2 casas, e é maior que zero;
  - o custo unitário no movimento é `NUMERIC(14,4)`, calculado como `informado ÷ quantidade da embalagem` com `HALF_UP` em 4 casas;
  - o custo do produto é o unitário com `HALF_UP` em 2 casas.
- **Escopo do custo:** só ENTRADA + COMPRA + AJUSTE_MANUAL. O estoque inicial do cadastro não muda.
- **Data e hora:** a origem usa o `Clock` injetado (padrão do projeto).
- **Contrato:** `custo` no ajuste; `custoInformado` e `custoUnitario` no movimento; `custoOrigem` no produto; `origem` e `entrada` no histórico.
- **Dependências e escopo:** nenhuma dependência nova; nada de fornecedor (é a B5) nem de Compras.
- **Commits:** em pt-BR, com pathspec `-- backend/` ou `-- frontend/` (os executores dividem o worktree), sem `add -A`/`stash`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Saída sem saldo depois de uma compra no mesmo segundo, ou compra que falha na validação de saldo ou fração.** Esperado: o custo do produto **não** muda e nenhuma linha de histórico fica. Teste na Task 2.
2. **Cadastro do produto salvo com o mesmo custo de antes, depois de uma entrada por compra.** Esperado: a origem continua `ENTRADA_COMPRA`, sem virar `EDICAO` só por salvar. Teste na Task 2.
3. **Compra em CX c/ 3 a R$ 100,00.** Esperado: o movimento grava 33,3333, o produto 33,33, e a prévia da tela mostra "= R$ 33,33 por UN". A mesma conta nos dois lados. Testes nas Tasks 2 e 3.
4. **Chave repetida (duplo clique) com o mesmo custo.** Esperado: 200 com o movimento original e **uma** linha de histórico só. Com outro custo, 409. Teste na Task 2.
5. **Produto sem custo** (custo nulo) recebendo a primeira compra. Esperado: o histórico registra "vazio → R$ 10,00 · Entrada de compra", e a dica "Último custo" não aparece no modal. Testes nas Tasks 2 e 3.

---

### Task 1: V13 e mapeamento

**Files:**
- Create: `backend/src/main/resources/db/migration/V13__custo_entrada.sql`.
- Modify:
  - `inventory/MovimentoEstoque.java`: `custoInformado` (`BigDecimal`, 12,2) e `custoUnitario` (14,4), ambos `updatable=false`;
  - `catalog/Produto.java`: `custoOrigem` (enum `OrigemDoCusto { ENTRADA_COMPRA, EDICAO }`, `@Enumerated(STRING)`) e `custoOrigemEm` (`LocalDateTime`);
  - `catalog/HistoricoPreco.java`: `origem` (`OrigemDoCusto`, nulo) e `movimentoId` (`Long`, nulo; só o id, porque o catalog não conhece a entidade do inventory).
- Create: `catalog/OrigemDoCusto.java`.
- Test: `backend/src/test/java/com/geitus/app/inventory/MigracaoV13IT.java`, no padrão do `MigracaoV12IT`.

**Interfaces:**
- **Produces:** os campos acima, com getters. O `Produto` ganha os métodos:
  - `void registrarCustoDeEntrada(BigDecimal custo, LocalDateTime em)`: define o custo, a origem `ENTRADA_COMPRA` e a data;
  - `void marcarCustoEditado(LocalDateTime em)`: define a origem `EDICAO` e a data; com custo nulo, limpa a origem.
- **V13, exatamente a spec §5:**
  - `UNIQUE (empresa_id, id)` em `movimentos_estoque`;
  - as colunas e CHECKs do movimento, só com ENTRADA + COMPRA + AJUSTE_MANUAL;
  - a coerência com o retrato (`custo_unitario = round(custo_informado / embalagem_quantidade, 4)`, ou igual ao informado sem retrato);
  - as colunas e CHECKs do produto;
  - o histórico: `origem`, o `UPDATE` das linhas de `CUSTO` para `EDICAO` e depois a CHECK `(campo = 'CUSTO') = (origem IS NOT NULL)`;
  - `movimento_id` com a FK composta e a CHECK `movimento_id IS NULL OR origem = 'ENTRADA_COMPRA'`.

- [ ] Escrever `MigracaoV13IT`:
  - linha antiga de `CUSTO` vira `EDICAO`, e `PRECO_VENDA` fica nulo;
  - compra antiga sem custo continua válida;
  - custo numa SAIDA → CHECK;
  - só um dos dois campos de custo → CHECK;
  - custo ≤ 0 → CHECK;
  - com retrato 3, `custo_informado` 100 e `custo_unitario` 33.3333 passam, e 33.3300 viola;
  - produto com origem e sem custo → CHECK;
  - origem sem data → CHECK;
  - histórico `CUSTO` sem origem → CHECK;
  - `movimento_id` com origem `EDICAO` → CHECK;
  - FK do `movimento_id` para movimento de outra empresa → violação.
- [ ] Ver falhar, escrever a V13 e o mapeamento, e rodar `./mvnw verify` (contexto sobe em `validate`).
- [ ] Commit `feat(estoque): migration V13 do custo na entrada por compra`.

### Task 2: Regras no backend (ajuste, produto, histórico e responses)

**Files:**
- Create:
  - `catalog/CustoDeEntrada.java` (`@Component`, no catalog);
  - `catalog/UltimaEntradaDeCompra.java` (record);
  - `catalog/dto/CustoOrigemResponse.java`.
- Modify:
  - `inventory/dto/AjusteEstoqueRequest.java`: `BigDecimal custo`, com `@Digits(integer=10, fraction=2, message=…)`;
  - `inventory/EstoqueService.java`: valida e chama o `CustoDeEntrada`;
  - `inventory/dto/MovimentoEstoqueResponse.java`: `custoInformado` e `custoUnitario`;
  - `catalog/UsoDoProdutoNoEstoque.java` e `inventory/EstoqueDoCatalogo.java`: a consulta da última compra;
  - `catalog/ProdutoService.java`: marca `EDICAO` quando o custo muda no cadastro ou na edição, e grava o histórico de custo com a origem `EDICAO`;
  - `catalog/HistoricoDePrecos.java`: a origem e o movimento;
  - `catalog/dto/ProdutoResponse.java`: `custoOrigem`;
  - `catalog/dto/HistoricoPrecoResponse.java`: `origem` e `entrada`.
- Test: `inventory/EstoqueServiceIT.java` (custo), `catalog/CatalogoServiceIT.java` ou o IT do produto (origem), e `HistoricoDePrecos`.

**Interfaces:**
- **Consumes:** Task 1.
- **Produces:**
  - `CustoDeEntrada.registrar(Produto produto, BigDecimal custoUnitario, Long movimentoId, Long usuarioId)`:
    - arredonda a 2 casas;
    - se o valor mudou, grava o histórico `CUSTO` com a origem `ENTRADA_COMPRA` e o `movimentoId`;
    - chama `produto.registrarCustoDeEntrada(...)` com `LocalDateTime.now(relogio)`.
  - `record UltimaEntradaDeCompra(BigDecimal quantidade, String embalagemRotulo, LocalDateTime em)`.
  - `UsoDoProdutoNoEstoque.ultimaEntradaDeCompra(Long empresaId, Long produtoId) → Optional<UltimaEntradaDeCompra>`. Na listagem não é usada, para não somar consultas; só no detalhe e nas respostas de gravação.
  - `record CustoOrigemResponse(OrigemDoCusto tipo, LocalDateTime em, BigDecimal quantidade, String embalagemRotulo)`. `quantidade` e `embalagemRotulo` são nulos em `EDICAO`.
  - `HistoricoPrecoResponse` ganha `OrigemDoCusto origem` e `EntradaResponse entrada`, com `record EntradaResponse(BigDecimal quantidade, String embalagemRotulo)`, preenchido pelo movimento ligado. Ler em lote para a página: no máximo uma consulta a mais por página.
- **Regras em `EstoqueService.validarAjusteManual`, nesta ordem, depois das atuais:**
  1. `custo` informado fora de ENTRADA + COMPRA → 400 "O custo só é informado na entrada por compra." (`custo`);
  2. ENTRADA + COMPRA sem custo → 400 "Informe o custo da compra." (`custo`);
  3. custo ≤ 0 → 400 "O custo deve ser maior que zero." (`custo`).
- **Gravação:**
  - com embalagem, `custoUnitario = custo ÷ embalagem.quantidade` (escala 4, `HALF_UP`); sem embalagem, `custoUnitario = custo`;
  - o movimento é gravado com os dois campos, depois o `CustoDeEntrada.registrar(...)`, tudo na transação do ajuste.
- **Idempotência:** `mesmoPedido` também compara o `custo` com o `custoInformado` gravado. Diferente → 409; igual → o original.
- **`ProdutoService`:**
  - quando o custo do request é diferente do atual (por `compareTo`, inclusive nulo ↔ valor), chama `produto.marcarCustoEditado(agora)` e grava o histórico com a origem `EDICAO`;
  - quando o custo é igual, não mexe na origem (Review Focus 2);
  - no cadastro com custo, a origem é `EDICAO`.

- [ ] Testes (IT contra Postgres):
  - compra em UN com custo 10,00 num produto sem custo → movimento 10.00/10.0000, custo do produto 10.00, origem `ENTRADA_COMPRA`, histórico "vazio → 10,00" com o movimento;
  - 2 CX c/ 18 UN a 180,00 → 10.0000;
  - CX c/ 3 a 100,00 → 33.3333 e 33.33;
  - custo igual ao atual → nenhum histórico novo e `custo_origem_em` atualizado;
  - compra sem custo, custo 0, custo em SAIDA, custo em ENTRADA com DEVOLUCAO_CLIENTE, custo em AJUSTE → 400 com as mensagens;
  - saída que falha por saldo depois → o custo intacto (Review Focus 1);
  - compra com fração inválida → nada gravado;
  - chave repetida com o mesmo custo → 200 e um histórico só; com outro custo → 409 (Review Focus 4);
  - PATCH do produto mudando o custo → `EDICAO` e histórico `EDICAO`;
  - PATCH com o mesmo custo depois de uma compra → continua `ENTRADA_COMPRA` (Review Focus 2);
  - PATCH apagando o custo → origem nula;
  - `GET` do produto → `custoOrigem` com a quantidade 36 e "CX c/ 18 UN";
  - histórico → `origem` e `entrada` nas linhas;
  - outra empresa não enxerga nada.
- [ ] Implementar e rodar `./mvnw verify`.
- [ ] Commit `feat(estoque): custo obrigatorio na entrada por compra e origem do custo do produto`.

### Task 3: Frontend (modal, Preços e Histórico)

**Files:**
- Modify:
  - `frontend/src/types/estoque.ts`: `custo` no request; `custoInformado` e `custoUnitario` no movimento;
  - `frontend/src/types/produto.ts`: `custoOrigem` e `OrigemDoCusto`; `origem` e `entrada` no histórico de preços;
  - `features/products/estoque/ajusteEstoque.ts` (+ teste);
  - `features/products/estoque/ModalAjusteEstoque.tsx` (+ teste);
  - `features/products/secoes/SecaoPrecos.tsx` (nota de origem);
  - `features/products/secoes/SecaoHistorico.tsx` e o componente dos movimentos.
- Test: `ModalAjusteEstoque.test.tsx`, `ajusteEstoque.test.ts` e `ProdutoPage.test.tsx`.

**Interfaces:**
- **Consumes:** o contrato da Task 2.
- **Produces, em `ajusteEstoque.ts`:**
  - `custoPorUnidade(custoInformado: string, quantidadePorEmbalagem: number | null): string | null`, em centavos com `HALF_UP` (a mesma conta do produto);
  - `textoDaPreviaComCusto(...)`, com o texto exato da spec §7.1: "· Custo: R$ 9,50 → R$ 10,00 por UN" e "· Custo: R$ 10,00 por UN (sem mudança)".
- **Textos exatos (spec §4 e §7):**
  - rótulo: "Custo por UN" / "Custo da CX c/ 18 UN";
  - dica: "Último custo: R$ 9,50 por UN.";
  - em embalagem: "= R$ 10,00 por UN";
  - erros: "Informe o custo da compra." e "O custo deve ser maior que zero.";
  - sucesso: "… Custo atualizado para R$ 10,00." (só quando mudou);
  - nota em Preços: "Último custo de entrada: R$ 10,00 em 24/10/2026 (2 CX c/ 18 UN)." e "Custo editado manualmente em 24/10/2026.";
  - Histórico: "· Entrada de compra (2 CX c/ 18 UN)" e "· Editado"; no movimento, "· R$ 180,00 por CX (R$ 10,00 por UN)", ou "· R$ 10,00 por UN" sem embalagem.
- **Campo:** é o `CampoMoeda`; aparece só em Entrada + Compra, logo abaixo de Quantidade/Em; trocar de tipo ou motivo descarta o valor.

- [ ] Testes:
  - **Campo:** aparece em Entrada + Compra e some nos outros casos (com o valor descartado); rótulo em UN e em CX.
  - **Dicas:** a do último custo, só com custo no produto; "= R$ 33,33 por UN" para CX c/ 3 e 100,00 (Review Focus 3).
  - **Prévia:** com a mudança de custo e "(sem mudança)".
  - **Erros:** confirmar sem custo; custo 0.
  - **Envio e sucesso:** o envio tem `custo` (o valor da embalagem, não o dividido); a mensagem de sucesso só com custo mudado.
  - **Preços:** a nota de origem nas três formas.
  - **Histórico:** as linhas com a origem e o movimento com o custo.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] Commit `feat(estoque): custo na entrada por compra na tela e origem do custo`.

### Task 4: CTO

- [ ] **Revisores:** `data-reviewer` (V13, obrigatório), `back-end-reviewer`, `front-end-reviewer` e `product-ux-reviewer` (modal e nota); `qa-reviewer` no fim.
- [ ] **Dev:** backup do banco, V13 aplicada na subida e conferência (linhas antigas `EDICAO`).
- [ ] **Smoke da API** e conferência no navegador (modal, nota e Histórico).
- [ ] **Documentação:** status da spec e ajustes, `produtos.md`, `produtos-estoque.md` (a compra exige custo), README dos módulos, READMEs, dívida técnica e memória.
- [ ] **Validação final:** `./mvnw verify` e o conjunto do frontend.
