# Produtos Fase B3 (Embalagens de venda) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto, a execução é orquestrada pelo CTO: as tasks 1–4 ficam com o `back-end-executor` e as 5–7 com o `front-end-executor`, com revisores após cada bloco.

**Goal:** um produto com estoque único e uma lista de embalagens (unidade, quantidade, preço opcional, "de compra", códigos de barras), que substituem a unidade de compra, com preço efetivo, margem, histórico de preço e ajuste de estoque informado em embalagens.

**Architecture:**
- **Backend:**
  - nova entidade `ProdutoEmbalagem` no pacote `catalog`, filha do `Produto`;
  - os códigos de barras das embalagens continuam em `produto_codigos_barras`, com `embalagem_id`, e a unicidade por empresa já existente vale para todos;
  - o `ProdutoService` perde a validação de códigos de barras e o histórico de preços para dois colaboradores (pedido do back-end-reviewer na B2) antes de ganhar as embalagens;
  - o `inventory` aceita `embalagemId` no ajuste e guarda o retrato da embalagem no movimento.
- **Frontend:**
  - nova seção `SecaoEmbalagens` na tela única (entre Preços e Estoque), com funções puras em `lib/embalagem.ts`;
  - o bloco "Unidade e embalagem" sai do Estoque;
  - o modal de ajuste ganha o seletor de embalagem.

**Tech Stack:** Java 21, Spring Boot 3.5, JPA/Hibernate 6 (`ddl-auto: validate`), Flyway, PostgreSQL 16, Testcontainers; React 19, TS, RHF + Zod 4, TanStack Query v5, Vitest.

**Spec:** [`docs/modules/produtos-embalagens.md`](../../modules/produtos-embalagens.md) (DEC-037). Os executores leem a spec inteira; as mensagens estão na §2.3.

## Global Constraints
- **Migrations:** só a nova `V12__produtos_embalagens.sql`; V1–V11 intocadas (DEC-020). A migration preserva dados e para com `RAISE EXCEPTION` nos casos da spec §4.
- **Isolamento:** por empresa (DEC-016), com FKs compostas. O `uuid` da embalagem é gerado na aplicação (DEC-019) e é o único identificador exposto.
- **Limites:** até 10 embalagens por produto, até 5 códigos de barras por embalagem, e os 20 da unidade continuam.
- **Quantidades e dinheiro:**
  - a quantidade da embalagem é `NUMERIC(12,3)`, maior que 1, inteira se a unidade de venda não for fracionada;
  - dinheiro em `NUMERIC(12,2)`, com arredondamento `HALF_UP` a centavos;
  - promoção vigente no fuso `America/Sao_Paulo`, pelo `Clock` já injetado.
- **Rótulo:** `{sigla} c/ {quantidade sem zeros à direita} {sigla de venda}` ("CX c/ 3 UN", "SC c/ 25,5 KG"), com vírgula decimal. A mesma regra vale no backend e no frontend.
- **Mensagens:** as exatas da spec §2.3 e §6.
- **Contrato:**
  - a API perde `unidadeCompraId`, `fatorConversao`, `unidadeCompra` e `conversaoTexto`;
  - `codigosBarras` do produto continua só com os códigos da unidade.
- **Dependências e escopo:** nenhuma dependência nova; nada de PDV, fiscal ou Compras.
- **Commits:** em pt-BR, no padrão `tipo(escopo): descrição`, com pathspec `-- backend/` ou `-- frontend/` (os dois executores dividem o worktree) e terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Código de barras que muda de lugar no mesmo salvamento.** Exemplos: sai da unidade e entra na embalagem; sai da embalagem A e entra na B; a embalagem é removida e o código vai para uma nova. Esperado: 200, sem 409 nem 500 de unicidade. O Hibernate insere antes de apagar, então as remoções são aplicadas e enviadas ao banco (`flush`) antes das inclusões, ou a linha do código é reaproveitada. Teste na Task 3.
2. **Embalagem trocada no mesmo salvamento.** A CX c/ 3 é removida e outra CX c/ 3 (sem `id`) é adicionada; ou duas embalagens trocam de unidade e quantidade entre si. Esperado: 200, sem violar `UNIQUE (produto_id, unidade_id, quantidade)`. Teste na Task 3.
3. **Unidade de venda trocada de KG (fracionada) para UN com uma embalagem "SC c/ 25,5".** Esperado: 400 na `embalagens[0].quantidade` com a mensagem de fração. Da mesma forma, trocar a unidade de venda para CX com uma embalagem CX dá 400 na `embalagens[0].unidadeId`. Teste na Task 3.
4. **Produto sem custo, ou com preço mínimo vazio, com embalagens.** Esperado: margem e markup `null` ("—"), nenhuma checagem de mínimo e nenhum 500. Preço próprio exatamente igual a quantidade × mínimo passa. Teste na Task 3.
5. **Ajuste em embalagem num produto que deixou de ter aquela embalagem** (o modal ficou aberto com o `embalagemId` antigo). Esperado: 404 com mensagem clara, e não 500. Com a chave de idempotência repetida, o movimento já gravado volta, mesmo que a embalagem tenha sido removida depois. Teste na Task 4.

---

### Task 1: Colaboradores do `ProdutoService` (sem mudança de comportamento)

**Files:**
- Create:
  - `backend/src/main/java/com/geitus/app/catalog/ValidadorDeCodigosDeBarras.java` (`@Component`);
  - `backend/src/main/java/com/geitus/app/catalog/HistoricoDePrecos.java` (`@Component`);
  - `backend/src/main/java/com/geitus/app/catalog/MargemEMarkup.java` (utilitário estático).
- Modify:
  - `catalog/ProdutoService.java`: remove os métodos movidos (`validarCodigos`… `codigoNovoValidado`, `registrarHistorico`, `registrarSeMudou`, `mesmoValor`) e as constantes que só eles usam;
  - `catalog/dto/ProdutoResponse.java`: `calcularMargem` e `calcularMarkup` passam a usar `MargemEMarkup`.
- Test: `ValidadorDeCodigosDeBarrasTest` e `MargemEMarkupTest`, novos e unitários; os testes atuais do `ProdutoService` e os ITs continuam verdes, sem edição.

**Interfaces:**
- **Produces:**
  - `ValidadorDeCodigosDeBarras.validar(Long empresaId, List<String> informados, int limite, String campo, Set<String> gravadosNoProduto, Long produtoAtualId) → List<CodigoBarrasValidado>`:
    - normaliza a lista;
    - recusa repetidos, mais que `limite`, código longo e dígito GS1 inválido (400 no `campo`);
    - confere a unicidade na empresa fora do produto atual (409);
    - um código em `gravadosNoProduto` mantém o formato gravado.
  - `ValidadorDeCodigosDeBarras.exigirSemRepetidosEntreListas(List<List<String>> listas, Function<Integer,String> campoDaLista)`: 400 "Código de barras repetido na lista." no campo da segunda ocorrência. Já é usado pela Task 3.
  - `HistoricoDePrecos.registrarSeMudou(Produto produto, Long usuarioId, CampoHistoricoPreco campo, BigDecimal anterior, BigDecimal novo)`. A Task 3 acrescenta uma sobrecarga com `String embalagemRotulo`.
  - `MargemEMarkup.margem(BigDecimal preco, BigDecimal custo) → BigDecimal|null` e `MargemEMarkup.markup(BigDecimal preco, BigDecimal custo) → BigDecimal|null`, com as fórmulas, a escala e o arredondamento que o `ProdutoResponse` usa hoje.

- [ ] Escrever `MargemEMarkupTest`: preço 209,90 e custo 150,00 → margem 28,54 e markup 39,93; custo nulo → ambos `null`; custo 0 → markup `null`.
- [ ] Escrever `ValidadorDeCodigosDeBarrasTest` com repositório simulado: limite (`limite=5` dá 400 com "Informe no máximo 5 códigos de barras por embalagem." quando o chamador passa essa mensagem; o limite de 20 da unidade mantém a mensagem atual), repetido, dígito inválido e código gravado mantido.
- [ ] Mover o código e rodar `./mvnw verify`: todos os testes atuais passam.
- [ ] Commit `refactor(produtos): extrai validacao de codigos, historico de precos e margem do ProdutoService`.

> A mensagem do limite entra como parâmetro: `validar(..., int limite, String mensagemDoLimite, String campo, ...)`.

### Task 2: V12, entidades e unidade de compra migrada

**Files:**
- Create:
  - `backend/src/main/resources/db/migration/V12__produtos_embalagens.sql`;
  - `catalog/ProdutoEmbalagem.java`;
  - `catalog/RotuloDaEmbalagem.java` (utilitário estático).
- Modify:
  - `catalog/Produto.java`:
    - remove `unidadeCompra` e `fatorConversao`;
    - adiciona `@OneToMany(mappedBy="produto", cascade=ALL, orphanRemoval=true) @OrderBy("ordem") List<ProdutoEmbalagem> embalagens`;
    - a coleção `codigosBarras` passa a ter `@SQLRestriction("embalagem_id IS NULL")`.
  - `catalog/ProdutoCodigoBarras.java`: `@ManyToOne(fetch=LAZY) @JoinColumn(name="embalagem_id") ProdutoEmbalagem embalagem`, nulo para os códigos da unidade.
  - `catalog/DadosProduto.java` e `ProdutoRepository.java`: removem `unidadeCompra`; o `JOIN FETCH` de `unidadeCompra` vira `LEFT JOIN FETCH p.embalagens e LEFT JOIN FETCH e.unidade` onde a consulta precisar. Atenção ao produto cartesiano com `codigosBarras`: usar `@BatchSize` ou duas consultas, como já é feito para os códigos.
  - `catalog/unidade/UnidadeMedidaRepository.java`: as duas consultas de uso trocam `p.unidade_compra_id` por `EXISTS (SELECT 1 FROM produto_embalagens e WHERE e.unidade_id = u.id AND e.produto_id = p.id)`, com o produto contado uma vez.
  - `ProdutoService` e o DTO só no mínimo para compilar: a conversão de compra sai, e `embalagens` vem na Task 3.
- Test: `backend/src/test/java/com/geitus/app/catalog/MigracaoV12IT.java` (`postgres:16`, migra até a V11, insere os dados, aplica a V12, como o `MigracaoV11IT`).

**Interfaces:**
- **Produces:**
  - `ProdutoEmbalagem`:
    - campos `uuid`, `empresa`, `produto`, `unidade` (`UnidadeMedida`), `quantidade` (`BigDecimal`), `preco` (`BigDecimal`, nulo), `deCompra` (`boolean`), `ordem` (`short`), `criadoEm`, `atualizadoEm` e `codigosBarras` (`mappedBy="embalagem"`, `@OrderBy("ordem")`);
    - `String rotulo()`, que delega a `RotuloDaEmbalagem.de(unidade.getSigla(), quantidade, produto.getUnidade().getSigla())`.
  - `RotuloDaEmbalagem.de(String sigla, BigDecimal quantidade, String siglaDeVenda) → String`: `stripTrailingZeros().toPlainString()`, com ponto trocado por vírgula.
  - `Produto.embalagem(UUID id) → Optional<ProdutoEmbalagem>` e `Produto.getEmbalagens()`.
- **V12:** exatamente a spec §4, nesta ordem:
  1. `produto_embalagens`;
  2. `embalagem_id` e a FK em `produto_codigos_barras`;
  3. `DO $$` que conta os produtos inconvertíveis e faz `RAISE EXCEPTION` se houver;
  4. `INSERT … SELECT` das embalagens de compra;
  5. `DROP` das colunas, das constraints e do índice da unidade de compra;
  6. histórico (`embalagem_rotulo`, CHECK do campo recriada com `PRECO_EMBALAGEM`, CHECK nova de coerência);
  7. retrato em `movimentos_estoque`.

- [ ] Escrever `MigracaoV12IT`:
  - produto com unidade de compra CX e fator 18 → 1 embalagem com `quantidade=18`, `de_compra=true`, `preco IS NULL`, `ordem=0` e `uuid` não nulo;
  - fator 1 com a mesma unidade → nenhuma embalagem;
  - colunas `unidade_compra_id` e `fator_conversao` inexistentes;
  - fator 0,5 com unidade diferente → a migração falha;
  - fator 2,5 com unidade de venda não fracionada → falha;
  - CHECKs: `quantidade <= 1`, `preco <= 0`, duas `de_compra` no mesmo produto, mesma unidade e quantidade;
  - código de barras com `embalagem_id` de outro produto → violação de FK;
  - o mesmo código na unidade e numa embalagem → `uq_codigo_barras_empresa`;
  - histórico `PRECO_EMBALAGEM` sem rótulo → CHECK; `PRECO_VENDA` com rótulo → CHECK;
  - movimento com retrato incompleto, com retrato em AJUSTE, ou com `abs(quantidade) <> quantidade_embalagens * embalagem_quantidade` → CHECK.
- [ ] Rodar o IT e ver falhar; escrever a V12 e as entidades; rodar `./mvnw verify`, com o contexto subindo em `ddl-auto: validate`.
- [ ] Teste de `RotuloDaEmbalagem`: (CX, 3.000, UN) → "CX c/ 3 UN"; (SC, 25.500, KG) → "SC c/ 25,5 KG".
- [ ] Teste do cadastro de unidades: uma unidade usada só em embalagem conta 1 produto e não pode ser excluída (409 atual).
- [ ] Commit `feat(produtos): migration V12 e entidade de embalagem do produto`.

### Task 3: Embalagens no cadastro do produto (API, regras, preço e histórico)

**Files:**
- Create:
  - `catalog/dto/EmbalagemRequest.java`;
  - `catalog/dto/EmbalagemResponse.java`;
  - `catalog/PrecoDaEmbalagem.java` (record) e `catalog/OrigemPrecoEmbalagem.java` (`PROPRIO`, `UNIDADE`, `PROMOCAO_DA_UNIDADE`);
  - `catalog/EmbalagensDoProduto.java` (`@Component` com as regras e a reconciliação, para não engordar o `ProdutoService`).
- Modify:
  - `catalog/dto/ProdutoRequest.java`: `@Valid @Size(max=10, message="Informe no máximo 10 embalagens.") List<EmbalagemRequest> embalagens`, e `unidadeCompraId`/`fatorConversao` removidos;
  - `catalog/dto/ProdutoResponse.java`: `List<EmbalagemResponse> embalagens`, e `unidadeCompra`, `fatorConversao` e `conversaoTexto` removidos;
  - `catalog/PrecoDeVenda.java`: `static PrecoAplicado vigenteSemAtacado(Produto produto, LocalDate data)` (NORMAL ou PROMOCIONAL);
  - `catalog/ProdutoService.java`: chama `EmbalagensDoProduto` no cadastro e na atualização (PATCH sem `embalagens` mantém a lista atual);
  - `catalog/CampoHistoricoPreco.java` (`PRECO_EMBALAGEM`), `HistoricoPreco.java` (`embalagemRotulo`), `HistoricoDePrecos.java` e `dto/HistoricoPrecoResponse.java` (`embalagemRotulo`);
  - `ProdutoConflitoException`, se precisar do campo indexado.
- Test: `EmbalagensDoProdutoTest` (unitário, regras), `PrecoDaEmbalagemTest` e `ProdutoEmbalagensIT` (MockMvc + Testcontainers, como os ITs de produto).

**Interfaces:**
- **Consumes:** Task 1 (`ValidadorDeCodigosDeBarras`, `HistoricoDePrecos`, `MargemEMarkup`) e Task 2 (`ProdutoEmbalagem`, `RotuloDaEmbalagem`).
- **Produces:**
  - `record EmbalagemRequest(UUID id, @NotNull UUID unidadeId, @NotNull BigDecimal quantidade, BigDecimal preco, boolean deCompra, List<String> codigosBarras)`.
  - `record EmbalagemResponse(UUID id, UnidadeResumo unidade, BigDecimal quantidade, String rotulo, BigDecimal preco, BigDecimal precoEfetivo, OrigemPrecoEmbalagem origemPreco, BigDecimal custo, BigDecimal margem, BigDecimal markup, boolean deCompra, List<CodigoBarrasResponse> codigosBarras)`. O `custo` é quantidade × custo da unidade, ou `null`.
  - `PrecoDaEmbalagem.calcular(BigDecimal precoProprio, BigDecimal quantidade, PrecoAplicado vigenteDaUnidade) → PrecoDaEmbalagem(BigDecimal preco, OrigemPrecoEmbalagem origem)`.
  - `EmbalagensDoProduto.aplicar(Produto produto, List<EmbalagemRequest> informadas, Long usuarioId)`:
    - valida tudo antes de gravar;
    - reconcilia por `id` (um `id` de outro produto ou inexistente → 404 "Embalagem não encontrada.");
    - registra o histórico;
    - aplica as remoções com `flush` antes das inclusões (Review Focus 1 e 2).
- **Campos de erro indexados:** `embalagens[j].unidadeId`, `embalagens[j].quantidade`, `embalagens[j].preco`, `embalagens[j].deCompra` e `embalagens[j].codigosBarras`. O frontend da Task 5 usa esses nomes.
- **Ordem das validações por embalagem** (a primeira que falhar responde):
  1. unidade ativa (ou a atual), diferente da de venda;
  2. quantidade > 1;
  3. fração;
  4. repetida;
  5. de compra única;
  6. preço > 0 e mínimo por unidade;
  7. códigos.
- **Conflito de código numa embalagem:** 409 "Este código já está em uso na embalagem {rótulo} do produto {nome}.". O `ProdutoRepository` ganha a consulta que devolve o nome do produto e o rótulo da embalagem dona do código (ou só o nome, se for da unidade). A corrida é tratada pelo nome da constraint `uq_codigo_barras_empresa`, como em `gravar` na B2.

- [ ] Escrever `PrecoDaEmbalagemTest`:
  - (209.90, 3, 89.90 NORMAL) → 209.90 PROPRIO;
  - (null, 3, 89.90 NORMAL) → 269.70 UNIDADE;
  - (null, 3, 79.90 PROMOCIONAL) → 239.70 PROMOCAO_DA_UNIDADE;
  - (null, 25.5, 12.99 NORMAL) → 331.25 (HALF_UP).
- [ ] Escrever `EmbalagensDoProdutoTest`, uma asserção por mensagem da spec §2.3, com o campo indexado. Inclui:
  - quantidade 1 → "A embalagem precisa conter mais de 1 UN.";
  - 2,5 em UN → "UN não aceita quantidade fracionada. Informe um número inteiro.";
  - preço mínimo de 70,00 e embalagem de 3:
    - a comparação é `preco < minimo × quantidade`, sem divisão;
    - o valor por unidade da mensagem é truncado a centavos (`RoundingMode.DOWN`), para nunca mostrar um valor igual ao mínimo;
    - 210,00 passa;
    - 209,99 dá "O preço da embalagem dá R$ 69,99 por UN, abaixo do preço mínimo (R$ 70,00).";
    - 209,90 dá "… R$ 69,96 por UN …";
  - 11 embalagens;
  - 6 códigos;
  - duas de compra;
  - repetida;
  - a mesma unidade da de venda.
- [ ] Escrever `ProdutoEmbalagensIT`:
  - **Ciclo da lista:**
    - criar com 2 embalagens e códigos → response com rótulo, preço efetivo, margem do Nexgard (custo 50 → 28,54 e 39,93);
    - PATCH sem `embalagens` → mantidas;
    - PATCH mantendo o `id` e trocando o preço → os códigos preservados e o histórico `PRECO_EMBALAGEM` 209,90 → 199,90 com `embalagemRotulo` "CX c/ 3 UN";
    - remover uma embalagem com preço → os códigos somem e o histórico registra → vazio.
  - **Conflitos:** código da embalagem igual ao da unidade de outro produto → 409 com "no produto {nome}"; igual ao de embalagem de outro produto → 409 com "na embalagem CX c/ 3 UN do produto {nome}".
  - **Review Focus 1–4:**
    - código movido da unidade para a embalagem e entre embalagens no mesmo PATCH → 200;
    - embalagem removida e recriada igual → 200;
    - unidade de venda trocada (KG→UN com SC c/ 25,5; UN→CX com embalagem CX) → 400;
    - sem custo → margem `null`.
  - **Acesso:** `id` de embalagem de outro produto → 404; OPERADOR no PATCH → 403; empresa B não vê a embalagem da empresa A.
  - **Promoção:** promoção vigente → embalagem sem preço com `PROMOCAO_DA_UNIDADE`; vencida → `UNIDADE`.
  - **Busca:** `GET /api/produtos?busca={código da embalagem}` acha o produto.
- [ ] Implementar e rodar `./mvnw verify`.
- [ ] Commit `feat(produtos): embalagens no cadastro do produto com preco, margem e historico`.

### Task 4: Ajuste de estoque em embalagens

**Files:**
- Modify:
  - `inventory/dto/AjusteEstoqueRequest.java`: `UUID embalagemId`, opcional;
  - `inventory/MovimentoEstoque.java`: `embalagemRotulo`, `embalagemQuantidade`, `quantidadeEmbalagens`;
  - `inventory/EstoqueService.java`;
  - `inventory/dto/MovimentoEstoqueResponse.java`: `embalagem: {rotulo, quantidadePorEmbalagem, quantidadeDeEmbalagens} | null`.
- Test: os testes do `EstoqueService` e o IT do ajuste existentes, ampliados.

**Interfaces:**
- **Consumes:** `Produto.embalagem(UUID)` e `ProdutoEmbalagem.rotulo()` (Task 2).
- **Regras, nesta ordem, só quando `embalagemId` vem:**
  1. tipo AJUSTE → 400 "A contagem é feita na unidade de venda." no campo `embalagemId`;
  2. embalagem do produto não encontrada → 404 "Embalagem não encontrada.";
  3. `quantidade` inteira e > 0 → senão 400 "Informe um número inteiro de embalagens." no campo `quantidade`;
  4. o total em unidades é `quantidade × embalagem.quantidade`, e daí em diante vale a regra da Fase D (saldo negativo e fração) sobre o total.
- **Idempotência:** a chave repetida devolve o movimento gravado **antes** de procurar a embalagem (Review Focus 5).

- [ ] Testes:
  - Entrada de 2 com a CX c/ 18 UN e saldo 10 → movimento +36, saldo 46 e retrato ("CX c/ 18 UN", 18, 2);
  - Saída de 3 CX c/ 18 UN com saldo 46 → 400 de saldo insuficiente; com saldo 54 → −54 e saldo 0;
  - AJUSTE com embalagem → 400;
  - embalagem de outro produto → 404;
  - 1,5 embalagem → 400;
  - chave repetida depois de remover a embalagem → 200 com o movimento original;
  - `GET .../movimentos` traz o `embalagem` do retrato.
- [ ] Implementar e rodar `./mvnw verify`.
- [ ] Commit `feat(estoque): ajuste de entrada e saida informado em embalagens`.

### Task 5: Frontend — tipos, serviço, modelo do formulário e funções puras

**Files:**
- Create:
  - `frontend/src/lib/embalagem.ts`;
  - `frontend/src/lib/embalagem.test.ts`.
- Modify:
  - `types/produto.ts`: `Embalagem`, `EmbalagemRequest` e `OrigemPrecoEmbalagem`; remove `unidadeCompra`, `fatorConversao` e `conversaoTexto`;
  - `types/estoque.ts`: `embalagemId` no request e `embalagem` no movimento;
  - `features/products/produtoFormulario.ts`:
    - `embalagens` no Zod;
    - `SECOES_PRODUTO` com `'embalagens'` entre `'precos'` e `'estoque'`, e `ROTULO_SECAO.embalagens = 'Embalagens'`;
    - `CAMPOS_POR_SECAO`, `valoresIniciais`, `valoresDoProduto` e `montarRequest`;
    - remove `unidadeCompraId` e `fatorConversao`;
  - `features/products/produtoFormulario.test.ts`.

**Interfaces:**
- **Produces:**
  - `rotuloDaEmbalagem(sigla: string, quantidade: string, siglaDeVenda: string): string`, com o mesmo resultado do backend ("SC c/ 25,5 KG");
  - `precoCalculadoDaEmbalagem(quantidade: string, precoVigente: string): string | null` (centavos, HALF_UP);
  - `conversaoDoSaldo(saldo: number, embalagem: {sigla: string; quantidade: number}, siglaDeVenda: string, fracionada: boolean): string | null`: com a CX c/ 3: "55 UN (18 CX + 1 UN)" e "54 UN (18 CX)"; `null` quando o saldo é menor que 1 embalagem ou ≤ 0;
  - `embalagemPrincipal<T extends {deCompra: boolean}>(lista: T[]): T | undefined`: a de compra, senão a primeira.
- **Valor do formulário:** `EmbalagemFormValues = { id?: string; unidadeId: string; quantidade: string; preco: string; deCompra: boolean; codigosBarras: string[] }`. A `quantidade` é texto com vírgula, como os campos de estoque; o `preco` está no formato do `CampoMoeda`.
- **Zod**, com as mesmas mensagens da spec §2.3 e os caminhos `embalagens.{j}.campo`:
  - unidade obrigatória e diferente de `unidadeId`;
  - quantidade > 1 e fração conforme `unidades.fracionada` (via `superRefine` com a lista de unidades, como a regra de fração do estoque inicial);
  - até 10;
  - uma de compra;
  - sem repetição;
  - até 5 códigos.
- **Mapeamento dos erros da API:** `embalagens[1].quantidade` → `embalagens.1.quantidade`.

- [ ] Testes de `lib/embalagem.ts` com os exemplos acima e "SC c/ 25,5 KG".
- [ ] Testes do modelo: `montarRequest` com embalagem nova (sem `id`) e mantida (com `id`), preço vazio → `null`, quantidade "2,5" → `2.5`; `valoresDoProduto` com embalagens; cada mensagem do Zod; o mapeamento do erro indexado da API.
- [ ] `npm run lint && npm run typecheck && npm test`.
- [ ] Commit `feat(produtos): modelo de embalagens no formulario do produto`.

### Task 6: Frontend — seção Embalagens, Estoque e Códigos

**Files:**
- Create:
  - `features/products/secoes/SecaoEmbalagens.tsx`;
  - `features/products/secoes/BlocoEmbalagem.tsx`.
- Modify:
  - `ProdutoPage.tsx`: a seção nova e os atalhos;
  - `secoes/SecaoEstoque.tsx`: remove `BlocoUnidadeEmbalagem` e mostra `conversaoDoSaldo`;
  - `secoes/SecaoCodigos.tsx`: a linha com link para Embalagens;
  - `secoes/SecaoGeral.tsx`: tira a limpeza de `unidadeCompraId`;
  - `CampoCodigosBarras.tsx`: só se precisar aceitar `limite` e `name` por parâmetro.
- Delete: `secoes/BlocoUnidadeEmbalagem.tsx`.
- Test: `ProdutoPage.test.tsx`.

**Interfaces:**
- **Consumes:** Task 5.
- **Reaproveitado:** `CampoCodigosBarras` (Enter e aviso de etiqueta), `CampoMoeda`, `calcularMargemMarkup` e `useFieldArray` do RHF.
- **Textos** exatos da spec §5.1 e §5.2:
  - ajuda: "Outras formas de vender ou comprar este produto, como a caixa com 3. O estoque continua em {sigla}.";
  - dica do preço vazio: "3 × R$ 89,90 = R$ 269,70", ou "3 × R$ 79,90 (promoção) = R$ 239,70";
  - aviso abaixo do custo: "Preço abaixo do custo da embalagem ({R$ custo}).";
  - botão: "Adicionar embalagem"; remover: "Remover embalagem {rótulo}";
  - switch: "Embalagem de compra";
  - Códigos: "Os códigos de barras das embalagens ficam em Embalagens.".
- **Preço vigente da unidade na tela:** o promocional, quando a promoção está ativa no formulário e a data de hoje (local) cai entre início e fim; senão, o preço de venda. O cálculo fica em `lib/embalagem.ts` como `precoVigenteDaUnidade(valores, hoje: string)`.

- [ ] Testes:
  - **Atalhos e estado inicial:** a ordem dos atalhos (Geral, Códigos, Preços, Embalagens, Estoque, Histórico); o estado vazio com "Adicionar embalagem".
  - **Editar embalagens:**
    - adicionar e preencher CX, 3 e preço vazio → a dica "3 × R$ 89,90 = R$ 269,70";
    - com a promoção ativa hoje → a dica com "(promoção)";
    - margem e markup com custo;
    - código de barras com Enter;
    - ligar "Embalagem de compra" na segunda desliga a primeira;
    - o seletor sem a unidade de venda;
    - remover;
    - limite de 10 (o botão some ou fica desabilitado com o motivo).
  - **Erros:** um erro do Zod em `embalagens.0.quantidade` rola até o campo e mostra "1 erro" no atalho Embalagens; um 400 da API em `embalagens[0].preco` aparece no campo.
  - **Estoque:** sem o bloco "Unidade e embalagem"; saldo 55 com CX c/ 18 → "55 UN (3 CX + 1 UN)".
  - **Códigos:** a linha com link para Embalagens só aparece quando há embalagem.
  - **OPERADOR:** a seção só leitura.
  - **Salvar:** envia `embalagens` no request.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] Commit `feat(produtos): secao Embalagens na tela do produto`.

### Task 7: Frontend — ajuste em embalagens e Histórico

**Files:**
- Modify:
  - `features/products/estoque/ModalAjusteEstoque.tsx` e `ajusteEstoque.ts`;
  - `features/products/estoque/SecaoMovimentosEstoque.tsx` (ou o componente que lista os movimentos);
  - `features/products/secoes/ListaHistorico.tsx`: linhas de `PRECO_EMBALAGEM`;
  - `services/estoqueService.ts`.
- Test: `ModalAjusteEstoque.test.tsx`, `ajusteEstoque.test.ts` e `ProdutoPage.test.tsx` (Histórico).

**Interfaces:**
- **Consumes:** Task 5 (tipos e `embalagemPrincipal`) e Task 4 (contrato).
- **O seletor "Em:":**
  - aparece só em Entrada e Saída e só se o produto tem embalagens;
  - opções: a sigla de venda e o rótulo de cada embalagem;
  - padrão: a sigla de venda, ou a embalagem de compra na Entrada com motivo Compra;
  - com embalagem, a quantidade é inteira;
  - prévia: "2 CX c/ 18 UN = +36 UN · saldo 10 → 46".
- **Textos do Histórico:**
  - movimento: "+36 UN (2 CX c/ 18 UN)";
  - preço: "Preço da embalagem CX c/ 3 UN: R$ 209,90 → R$ 199,90" e "… → sem preço próprio".

- [ ] Testes:
  - **Seletor:**
    - aparece em Entrada e Saída e não em Contagem;
    - na Entrada com Compra, o padrão é a de compra;
    - a prévia;
    - quantidade 1,5 com embalagem → erro "Informe um número inteiro de embalagens.";
    - o envio tem `embalagemId` e a quantidade em embalagens;
    - o produto sem embalagens não tem o seletor.
  - **Histórico:** as duas formas de linha.
- [ ] `npm run lint && npm run typecheck && npm test && npm run build`.
- [ ] Commit `feat(estoque): ajuste em embalagens e historico das embalagens`.

### Task 8: CTO — revisão, smoke, navegador e documentação

- [ ] **Revisores depois da Task 4:**
  - `data-reviewer` (obrigatório: V12, migração da unidade de compra, FKs compostas, CHECKs do retrato e do histórico);
  - `back-end-reviewer`;
  - `security-reviewer` (isolamento da embalagem por empresa e por produto, `embalagemId` no ajuste).
- [ ] **Revisores depois da Task 7:** `front-end-reviewer`, `product-ux-reviewer` (seção e modal) e `qa-reviewer`.
- [ ] **Aplicar a V12 no dev** com backup antes, conferindo antes e depois: 0 produtos com unidade de compra hoje; as colunas saem.
- [ ] **Smoke da API** (script no scratchpad, credenciais lidas do `.env` sem imprimir):
  - Nexgard com CX c/ 3 UN a 209,90 e UN 89,90;
  - margem;
  - conflito de código;
  - código movido;
  - ajuste de 2 CX;
  - histórico;
  - busca pelo código da caixa;
  - limpeza dos dados de teste.
- [ ] **Navegador, com o painel visível ou capturas para forçar quadros:**
  - a seção Embalagens;
  - a dica do preço;
  - a conversão do saldo;
  - o modal com o seletor;
  - o Histórico;
  - o celular.
- [ ] **Documentação:**
  - status da spec e seção de ajustes;
  - `produtos.md`, `docs/modules/README.md`, os READMEs, `categorias-e-unidades.md` (uso da unidade);
  - a dívida técnica;
  - a memória.
- [ ] **Validação final:** `./mvnw verify` e `npm run lint && npm run typecheck && npm test && npm run build`; `git status`.
