# Produtos Fase C (Preços) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto, a execução é orquestrada pelo CTO: tasks 1–4 com o `back-end-executor` e 5–7 com o `front-end-executor`, com revisores após cada bloco.

**Goal:** promoção por datas, atacado de uma faixa, histórico de custo e preço de venda, preço pela margem e máscara R$ da direita para a esquerda no cadastro de produtos.

**Architecture:**
- Promoção e atacado viram colunas em `produtos` (V8), e o histórico fica numa tabela só de inserção, gravada pelo `ProdutoService` na mesma transação.
- A regra "qual preço vale" é um objeto de domínio puro (`PrecoDeVenda`), com a data vinda de um `Clock` em `America/Sao_Paulo`.
- No frontend, um `CampoMoeda` genérico com lógica pura em `lib/moeda.ts`; a aba Preços ganha os blocos novos e a página ganha a aba Histórico.

**Tech Stack:** Java 21, Spring Boot 3.5, JPA/Hibernate 6, Flyway, PostgreSQL 16, Testcontainers; React 19, TS, RHF + Zod 4, TanStack Query v5, shadcn/ui (radix-ui), Vitest.

**Spec:** [`docs/modules/produtos-precos.md`](../../modules/produtos-precos.md) (DEC-033). Os executores leem a spec inteira; este plano registra só as decisões de implementação.

## Global Constraints
- **Banco:**
  - migration nova `V8__produtos_precos.sql`; V1–V7 não são editadas (DEC-020);
  - dinheiro em `NUMERIC(12,2)` e quantidade em `NUMERIC(12,3)`, nunca ponto flutuante no backend.
- **Fuso:** `America/Sao_Paulo`, via bean `Clock`; nenhum `LocalDate.now()` sem o clock.
- **Erros por campo:** as chaves de `campos` são exatamente `promocao.preco`, `promocao.inicio`, `promocao.fim`, `atacado.preco` e `atacado.quantidadeMinima`.
- **Mensagens:** as copiadas da spec §4.3/§4.4, em pt-BR com acentos.
- **Isolamento:** tudo por empresa (DEC-016); produto de outra empresa → 404.
- **Dependências:** nenhuma nova, nem no backend nem no frontend.
- **Commits:** em pt-BR, no padrão `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Fora desta fase:** nada de fiscal e nada de endpoint de "preço vigente".

## Review Focus
1. **Fuso horário:** com o relógio em `2026-11-16T01:30:00Z` (22:30 de 15/11 em São Paulo) e a promoção terminando em 2026-11-15, a situação ainda é `VIGENTE`. Teste na Task 2.
2. **Preço de venda reduzido até a promoção:** baixar o preço de venda para igual ou abaixo do promocional gravado dá 400 em `promocao.preco`, não um erro genérico. No front, a tela salta para a aba Preços com o bloco aberto. Testes nas Tasks 3 e 6.
3. **Unidade trocada para não fracionada:** com atacado a partir de 2,5, o save dá 400 em `atacado.quantidadeMinima` com a mensagem da sigla. Teste na Task 3.
4. **Edição sobre valor existente no `CampoMoeda`:** com o campo em "10,00", digitar 5 dá "100,05". Com todo o texto selecionado, digitar 5 dá "0,05". Teste na Task 5.
5. **Produto antigo, sem promoção nem atacado, editado e salvo:** o PATCH com `promocao: null` e `atacado: null` funciona, e só o que mudou gera histórico. Promoção encerrada salva sem erro. Testes nas Tasks 3 e 4.

---

### Task 1: V8 e mapeamento JPA

**Files:**
- Create: `backend/src/main/resources/db/migration/V8__produtos_precos.sql`
- Create: `backend/src/main/java/com/geitus/app/catalog/CampoHistoricoPreco.java` (enum `CUSTO`, `PRECO_VENDA`)
- Create: `backend/src/main/java/com/geitus/app/catalog/HistoricoPreco.java`
- Create: `backend/src/main/java/com/geitus/app/catalog/HistoricoPrecoRepository.java`
- Modify: `backend/src/main/java/com/geitus/app/catalog/Produto.java`
- Test: `backend/src/test/java/com/geitus/app/catalog/MigracaoV8IT.java`, nos moldes de `MigracaoV7IT`

**Interfaces:**
- **Produces:**
  - em `Produto`, os campos `precoPromocional`, `promocaoInicio` e `promocaoFim` (`BigDecimal`, `LocalDate`, `LocalDate`) e `precoAtacado` e `quantidadeMinimaAtacado` (`BigDecimal`), com getters;
  - entidade `HistoricoPreco(Long empresaId, Produto produto, CampoHistoricoPreco campo, BigDecimal valorAnterior, BigDecimal valorNovo, Long usuarioId)`, com `alteradoEm` preenchido em `@PrePersist` (padrão de `ProdutoCodigoBarras.criadoEm`);
  - `HistoricoPrecoRepository extends JpaRepository<HistoricoPreco, Long>`.
- A coluna `produto_id` é mapeada por `@ManyToOne(fetch = LAZY)` com `insertable/updatable` coerentes com a FK composta, seguindo `ProdutoCodigoBarras`.

- [ ] **Step 1:** escrever o `MigracaoV8IT`, que migra até a V7, insere produtos e depois aplica a V8:
  - `produtosExistentesMantidosComColunasNovasNulas`;
  - `historicoComecaVazio`;
  - `rejeitaPromocaoIncompleta` (só o preço → violação de `ck_produto_promocao_completa`);
  - `rejeitaFimAntesDoInicio`;
  - `rejeitaAtacadoIncompleto`;
  - `rejeitaQuantidadeMinimaAteUm` (1.000);
  - `rejeitaHistoricoComUsuarioDeOutraEmpresa` (FK composta);
  - `rejeitaHistoricoSemMudanca` (anterior = novo);
  - `rejeitaPrecoVendaNovoNulo`;
  - `excluirProdutoApagaHistoricoEmCascata`.
- [ ] **Step 2:** rodar `./mvnw -q verify -Dit.test=MigracaoV8IT -Dtest=none -Dsurefire.failIfNoSpecifiedTests=false`. Esperado: FAIL (a V8 não existe).
- [ ] **Step 3:** escrever a V8 conforme a spec §3, com estes nomes:
  - `ck_produto_preco_promocional_positivo`, `ck_produto_promocao_completa`, `ck_produto_promocao_periodo`;
  - `ck_produto_preco_atacado_positivo`, `ck_produto_atacado_completo`, `ck_produto_quantidade_minima_atacado`;
  - `uq_usuario_empresa_id`, `fk_historico_preco_produto`, `fk_historico_preco_usuario`;
  - `ck_historico_preco_campo`, `ck_historico_preco_mudanca`, `ck_historico_preco_venda_nao_nulo`;
  - `ix_historico_preco_produto`.
  Mapear as colunas e a entidade com `ddl-auto: validate`.
- [ ] **Step 4:** rodar o IT do Step 2 e `./mvnw -q verify`. Esperado: PASS, sem regressão nos ITs existentes.
- [ ] **Step 5:** commit `feat(produtos): migration V8 com promocao, atacado e historico de precos`.

### Task 2: Regras de domínio de preço

**Files:**
- Create: `backend/src/main/java/com/geitus/app/config/RelogioConfig.java`, com o bean `Clock relogio()` = `Clock.system(ZoneId.of("America/Sao_Paulo"))`
- Create: em `backend/src/main/java/com/geitus/app/catalog/`, os arquivos `SituacaoPromocao.java`, `OrigemPreco.java`, `PrecoAplicado.java` e `PrecoDeVenda.java`
- Test: `backend/src/test/java/com/geitus/app/catalog/PrecoDeVendaTest.java` e `SituacaoPromocaoTest.java`

**Interfaces:**
- **Produces:**
  - `enum SituacaoPromocao { AGENDADA, VIGENTE, ENCERRADA; static SituacaoPromocao de(LocalDate inicio, LocalDate fim, LocalDate hoje) }`;
  - `static LocalDate SituacaoPromocao.hoje(Clock clock)` = `LocalDate.now(clock)`, o único lugar que converte o relógio em data;
  - `enum OrigemPreco { NORMAL, PROMOCIONAL, ATACADO }`;
  - `record PrecoAplicado(BigDecimal precoUnitario, OrigemPreco origem)`;
  - `final class PrecoDeVenda { static PrecoAplicado resolver(Produto produto, BigDecimal quantidade, LocalDate data) }`.

- [ ] **Step 1:** escrever os testes, montando o produto com `ProdutoTesteBuilder` (estendido com promoção e atacado). Preço de venda 10,00; promoção 8,90 de 01/11 a 15/11; atacado 8,50 a partir de 12.
  - `semPromocaoNemAtacado_normal`;
  - `promocaoNoPrimeiroEUltimoDia_promocional`;
  - `promocaoUmDiaAntesEUmDepois_normal`;
  - `quantidadeNoMinimo_atacado` (12 → 8,50);
  - `quantidadeAbaixoDoMinimo_normal` (11,999);
  - `promocaoEAtacado_menorVence` (8,50, `ATACADO`);
  - `empateEntrePromocaoEAtacado_promocional`;
  - `quantidadeZeroOuNegativa_lancaIllegalArgument`;
  - `SituacaoPromocaoTest`: `inicioIgualFimIgualHoje_vigente`, `antesDoInicio_agendada`, `depoisDoFim_encerrada`;
  - `diaDeSaoPauloNaoUtc`: relógio fixo em `2026-11-16T01:30:00Z` com zona SP, `hoje(clock)` = 2026-11-15 e fim 2026-11-15 → `VIGENTE`.
- [ ] **Step 2:** rodar `./mvnw -q test -Dtest='PrecoDeVendaTest,SituacaoPromocaoTest'`. Esperado: FAIL (as classes não existem).
- [ ] **Step 3:** implementar. A comparação de preços usa `compareTo`. O retorno preserva o valor gravado, sem reescalar.
- [ ] **Step 4:** rodar os testes. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): regra de preco aplicado e situacao da promocao`.

### Task 3: Contrato e validações de promoção e atacado

**Files:**
- Create: em `backend/src/main/java/com/geitus/app/catalog/dto/`, os arquivos `PromocaoRequest.java`, `AtacadoRequest.java`, `PromocaoResponse.java` e `AtacadoResponse.java`
- Modify:
  - `dto/ProdutoRequest.java`: `PromocaoRequest promocao` e `AtacadoRequest atacado`, ambos `@Valid` e anuláveis;
  - `dto/ProdutoResponse.java`: `PromocaoResponse promocao`, `boolean emPromocao`, `AtacadoResponse atacado`;
  - `DadosProduto.java`: os mesmos cinco valores, além dos atuais;
  - `Produto.java`, `ProdutoService.java`;
  - `ProdutoRequestBuilder`, `ProdutoTesteBuilder`.
- Test: `ProdutoServiceTest`, `ProdutoControllerTest`, `ProdutoResponseTest`

**Interfaces:**
- **Consumes:** a Task 1 (colunas) e a Task 2 (`SituacaoPromocao.de`, `SituacaoPromocao.hoje`, bean `Clock`).
- **Produces:**
  - `record PromocaoRequest(@NotNull @Digits(integer=10, fraction=2) BigDecimal preco, @NotNull LocalDate inicio, @NotNull LocalDate fim)`;
  - `record AtacadoRequest(@NotNull @Digits(integer=10, fraction=2) BigDecimal preco, @NotNull @Digits(integer=9, fraction=3) BigDecimal quantidadeMinima)`;
  - `record PromocaoResponse(BigDecimal preco, LocalDate inicio, LocalDate fim, SituacaoPromocao situacao)`;
  - `record AtacadoResponse(BigDecimal preco, BigDecimal quantidadeMinima)`;
  - `ProdutoResponse.de(Produto produto, CategoriaArvore arvore, boolean podeExcluir, LocalDate hoje)`. Todos os chamadores passam `SituacaoPromocao.hoje(clock)`, calculado uma vez por requisição.
- O `ProdutoService` recebe `Clock` no construtor.
- Mensagens de "obrigatório" do Bean Validation nos records: "Informe o preço promocional.", "Informe o início da promoção.", "Informe o fim da promoção.", "Informe o preço de atacado." e "Informe a quantidade mínima do atacado.". Assim os erros chegam com a chave `promocao.preco` etc. pelo handler atual.

- [ ] **Step 1:** escrever os testes do service, com 400 e o `campo()` esperado:
  - `promocaoFimAntesDoInicio` → `promocao.fim`;
  - `promocaoPrecoZero` → `promocao.preco`;
  - `promocaoIgualAoPrecoDeVenda` → `promocao.preco` ("Preço promocional deve ser menor que o preço de venda.");
  - `promocaoAbaixoDoPrecoMinimo` → `promocao.preco` ("Preço promocional não pode ser menor que o preço mínimo.");
  - `precoVendaReduzidoAbaixoDaPromocaoGravada` → `promocao.preco` (Review Focus 2);
  - `atacadoIgualAoPrecoDeVenda` → `atacado.preco` ("Preço de atacado deve ser menor que o preço de venda.");
  - `atacadoAbaixoDoMinimo` → `atacado.preco` ("Preço de atacado não pode ser menor que o preço mínimo.");
  - `quantidadeMinimaUm` → `atacado.quantidadeMinima` ("A quantidade mínima do atacado deve ser maior que 1.");
  - `quantidadeFracionadaEmUnidadeNaoFracionada` → `atacado.quantidadeMinima` ("A unidade UN não aceita quantidade fracionada.");
  - `mesmaQuantidadeEmUnidadeFracionada_ok` (KG, 2,5);
  - `unidadeTrocadaParaNaoFracionadaComAtacadoFracionado` → `atacado.quantidadeMinima` (Review Focus 3);
  - `promocaoEncerradaPodeSerSalva` e `patchComPromocaoEAtacadoNulosRemove`;
  - no controller: `promocaoSemInicio_400ComCampoPromocaoInicio` (Bean Validation, chave aninhada);
  - no response: `situacaoEEmPromocaoComClockFixo` (vigente → `emPromocao` true; agendada → false; sem promoção → `promocao` null e `emPromocao` false).
- [ ] **Step 2:** rodar `./mvnw -q test -Dtest='ProdutoServiceTest,ProdutoControllerTest,ProdutoResponseTest'`. Esperado: FAIL nos testes novos.
- [ ] **Step 3:** implementar `private static void validarPromocaoEAtacado(ProdutoRequest request, UnidadeMedida unidade)` no `ProdutoService`.
  - É chamado depois de `resolverVinculos`, porque precisa da unidade resolvida para saber se ela é fracionada.
  - Ordem das verificações: promoção (período → preço > 0 → < preço de venda → ≥ mínimo) e depois atacado (preço > 0 → < venda → ≥ mínimo → quantidade > 1 → fração).
  - Na mensagem de fração, a sigla é a da unidade de venda.
  - `Produto.atualizarDadosBasicos` e o construtor copiam os cinco campos de `DadosProduto`; promoção ou atacado nulo grava nulo nos campos correspondentes.
- [ ] **Step 4:** rodar os testes do Step 2 e depois `./mvnw -q test`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): promocao e atacado no cadastro com validacoes`.

### Task 4: Histórico de preços (gravação e endpoint)

**Files:**
- Create: em `backend/src/main/java/com/geitus/app/catalog/dto/`, os arquivos `HistoricoPrecoResponse.java` e `PaginaResponse.java`
- Modify: `HistoricoPrecoRepository.java`, `ProdutoService.java`, `ProdutoController.java`
- Test: `ProdutoServiceTest`, `ProdutoControllerTest`, `CatalogoServiceIT` (ou um `HistoricoPrecoIT` novo)

**Interfaces:**
- **Consumes:** a entidade e o repositório da Task 1 e o `ProdutoService` da Task 3.
- **Produces:**
  - `record HistoricoPrecoResponse(CampoHistoricoPreco campo, BigDecimal valorAnterior, BigDecimal valorNovo, String usuarioNome, LocalDateTime alteradoEm)`;
  - `record PaginaResponse<T>(List<T> itens, int pagina, int tamanho, long totalItens)`, genérico e reutilizável na Fase E;
  - `ProdutoService.historicoDePrecosParaUsuario(Long idUsuario, UUID produtoId, int pagina, int tamanho)` → `PaginaResponse<HistoricoPrecoResponse>`;
  - endpoint `GET /api/produtos/{id}/historico-precos?pagina=0&tamanho=20`, com `@RequestParam(defaultValue)`. Fora de `0 ≤ pagina` ou `1 ≤ tamanho ≤ 100` → `RegraDeNegocioException` (400).
- **Repository:** query JPQL paginada com `join Usuario u on u.id = h.usuarioId`, que projeta direto em `HistoricoPrecoResponse`, filtra por `h.empresaId` e `h.produto.id` e ordena por `alteradoEm desc, id desc`. A contagem vem do `Page`.
- **Usuário do histórico:**
  - `cadastrar` e `atualizarDadosBasicos` passam a receber `Long idUsuario`, além de `empresaId`;
  - os métodos públicos `...ParaUsuario` já têm o id;
  - `resolverEmpresaId` continua igual.

- [ ] **Step 1:** escrever os testes:
  - `cadastroComCusto_registraPrecoECusto`;
  - `cadastroSemCusto_registraSoPreco`;
  - `edicaoMudaSoPreco_umaLinha` (anterior e novo corretos);
  - `edicaoMudaSoCusto_umaLinha`;
  - `custoRemovido_valorNovoNulo`;
  - `edicaoSemMudancaDePrecoOuCusto_nenhumaLinha` (inclui mudar só a promoção);
  - `dezVsDezZeroZero_nenhumaLinha`;
  - `usuarioDaLinhaEhOAutenticado`;
  - `saveQueFalhaPor409_naoGravaHistorico` (IT: SKU duplicado);
  - `produtoAntigoEditadoComPromocaoEAtacadoNulos_soOQueMudou` (Review Focus 5);
  - endpoint:
    - `ordemMaisRecentePrimeiro`;
    - `paginacao` (tamanho 2, página 1);
    - `tamanho101_400`, `paginaNegativa_400`;
    - `produtoDeOutraEmpresa_404`;
    - `uuidMalformado_400`;
    - `semToken_401`;
    - `operador_200`.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar `private void registrarHistorico(Produto produto, Long usuarioId, BigDecimal custoAnterior, BigDecimal precoAnterior)`.
  - No cadastro, os anteriores são nulos. Grava uma linha por campo quando `!mesmoValor(anterior, novo)`, com `compareTo` e tratamento de null.
  - Na edição, captura os valores antes de `atualizarDadosBasicos` e chama depois do `save`, na mesma transação.
  - O produto novo precisa estar persistido antes da linha (save e depois o histórico).
- [ ] **Step 4:** rodar os testes e `./mvnw -q verify`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): historico de custo e preco de venda com consulta paginada`.

### Task 5: `lib/moeda.ts` e `CampoMoeda`

**Files:**
- Create: `frontend/src/lib/moeda.ts` e `frontend/src/lib/moeda.test.ts`
- Create: `frontend/src/components/ui/campo-moeda.tsx` e `frontend/src/components/ui/campo-moeda.test.tsx`
- Modify:
  - `frontend/src/features/products/abas/AbaGeral.tsx`: preço de venda;
  - `frontend/src/features/products/abas/AbaPrecos.tsx`: custo e preço mínimo;
  - `frontend/src/features/products/CamposFormulario.tsx`: um `CampoMoedaFormulario` integrado ao RHF via `Controller`, com label, erro e ajuda iguais aos do `CampoTexto`.

**Interfaces:**
- **Produces:**
  - `digitosParaValor(digitos: string): string`: dígitos para a string decimal com ponto, ou `''` quando vazio ("1234" → "12.34", "1" → "0.01");
  - `valorParaDigitos(valor: string): string`: "12.34" → "1234", "10" → "1000", "" → "";
  - `formatarMoedaDigitando(valor: string): string`: "12.34" → "12,34", "1234.56" → "1.234,56", "" → "";
  - `interpretarValorColado(texto: string): string | null` → a string decimal ou `null`;
  - `MAXIMO_DIGITOS_MOEDA = 12`;
  - `<CampoMoeda id value onChange(valor: string) onBlur disabled aria-invalid aria-describedby />`, com `value` e `onChange` na string decimal com ponto.
- **Implementação:**
  - controla o texto via `onBeforeInput`/`onKeyDown` (Backspace e Delete) e `onPaste`;
  - recalcula a partir dos dígitos e devolve o cursor para o fim depois de cada mudança;
  - com seleção total ou parcial, a digitação substitui todos os dígitos.

- [ ] **Step 1:** escrever os testes:
  - lib:
    - os cinco exemplos da tabela §6.1;
    - `zerosAEsquerdaDescartados` ("0012" → "0.12");
    - `limiteDe12Digitos`;
    - colagem: `12,5` → "12.50", `12.50` → "12.50", `1.234,56` → "1234.56", `R$ 9,90` → "9.90", `abc` → null;
  - componente (user-event):
    - digitar 1, 2, 3, 4 exibe "12,34", e o `onChange` recebe "12.34";
    - Backspace volta para "1,23";
    - apagar tudo deixa vazio, e o `onChange` recebe "";
    - letras são ignoradas;
    - o 13º dígito é ignorado;
    - colar "12,5" exibe "12,50";
    - `comValor10_digitar5_exibe100Virgula05`;
    - `selecionarTudo_digitar5_exibe0Virgula05` (Review Focus 4);
    - o prefixo "R$" é visível e o label está associado.
- [ ] **Step 2:** rodar `npm test -- moeda campo-moeda`. Esperado: FAIL.
- [ ] **Step 3:** implementar e trocar os três campos de dinheiro existentes. O schema Zod do formulário continua recebendo string.
- [ ] **Step 4:** rodar `npm test`, `npm run lint` e `npm run typecheck`. Esperado: PASS, com os testes existentes de `ProdutoPage` ajustados para digitar na máscara.
- [ ] **Step 5:** commit `feat(ui): campo de dinheiro com mascara da direita para a esquerda`.

### Task 6: Aba Preços (margem, avisos, promoção, atacado)

**Files:**
- Modify:
  - `frontend/src/types/produto.ts` (`PromocaoProduto`, `AtacadoProduto`, `SituacaoPromocao`, os campos em `Produto` e `ProdutoRequest`);
  - `features/products/produtoFormulario.ts`, `features/products/abas/AbaPrecos.tsx`, `features/products/abas/AbaGeral.tsx` (aviso abaixo do custo), `features/products/ProdutoPage.tsx` (mapear `campos` aninhados);
  - `frontend/src/test/fixturesProduto.ts`.
- Test: `produtoFormulario.test.ts` e `ProdutoPage.test.tsx`

**Interfaces:**
- **Consumes:** `CampoMoedaFormulario` (Task 5) e o contrato da Task 3.
- **Produces (form values):** `promocaoAtiva: boolean`, `precoPromocional: string`, `promocaoInicio: string` (yyyy-mm-dd), `promocaoFim: string`, `atacadoAtivo: boolean`, `precoAtacado: string`, `quantidadeMinimaAtacado: string`.
  - Os campos entram em `CAMPOS_POR_ABA.precos`.
  - `montarRequest` envia `promocao: null` / `atacado: null` com o interruptor desligado.
- **Mapeamento de erros do servidor:** `promocao.preco` → `precoPromocional`, `promocao.inicio` → `promocaoInicio`, `promocao.fim` → `promocaoFim`, `atacado.preco` → `precoAtacado`, `atacado.quantidadeMinima` → `quantidadeMinimaAtacado`.
  - Ao mapear um erro do bloco, o interruptor correspondente é ligado.
- **Funções puras:**
  - `calcularPrecoPelaMargem(custo: string, margem: string): string | null`, que devolve a string decimal com 2 casas (meio para cima) ou `null` quando o custo ≤ 0 ou vazio, ou a margem < 0, ≥ 100 ou inválida;
  - `situacaoPromocaoLocal(inicio: string, fim: string, hoje: string): SituacaoPromocao | null`, para o selo enquanto o usuário edita (data local do navegador);
  - `precoAbaixoDoCusto(preco: string, custo: string): boolean`.
- **Schema Zod (`superRefine`):** espelha §4.3/§4.4 com as mesmas mensagens. A regra de fração usa a unidade selecionada, via `fracionada` das opções de unidade já carregadas (passada ao schema como contexto ou validada no componente; preferir validar no submit com a lista de unidades e marcar o erro no campo).

- [ ] **Step 1:** escrever os testes:
  - puros:
    - `calcularPrecoPelaMargem('10','50')` → "20.00";
    - `('7','30')` → "10.00";
    - `('10','100')` → null;
    - `('','30')` → null;
    - `('0','30')` → null;
    - `('3','33,33')` → "4.50" (margem com vírgula);
  - `situacaoPromocaoLocal`: os três casos;
  - página:
    - o aviso de abaixo do custo aparece na aba Geral, na aba Preços e nos blocos de promoção e atacado (preço abaixo do custo), e o save prossegue;
    - "Calcular preço" atualiza o preço de venda e mostra a confirmação;
    - o botão fica desabilitado sem custo, com a dica;
    - ligar a promoção abre os campos, e desligar envia `promocao: null`;
    - o Zod barra fim antes do início;
    - o selo mostra "Vigente até 15/11";
    - um 400 com `campos` `promocao.preco` salta para a aba Preços, liga o bloco e mostra o erro no campo (Review Focus 2);
    - a ajuda do atacado mostra "A partir de 12 UN, cada unidade sai por R$ 4,20";
    - produto existente sem promoção salva com `promocao: null, atacado: null`.
- [ ] **Step 2:** rodar `npm test -- produtoFormulario ProdutoPage`. Esperado: FAIL nos testes novos.
- [ ] **Step 3:** implementar a aba conforme a spec §6.2. Usar `Switch`, se existir em `components/ui`; senão, um checkbox estilizado (sem dependência nova). Datas em `<input type="date">`.
- [ ] **Step 4:** rodar `npm test`, `npm run lint` e `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): promocao, atacado e preco pela margem na aba Precos`.

### Task 7: Aba Histórico e selo na listagem

**Files:**
- Create: `frontend/src/features/products/abas/AbaHistorico.tsx`
- Modify:
  - `frontend/src/services/produtoService.ts` (`listarHistoricoDePrecos(id: string, pagina: number, tamanho = 20): Promise<PaginaResponse<HistoricoPreco>>`);
  - `frontend/src/types/produto.ts` (`HistoricoPreco`, `PaginaResponse<T>`);
  - `features/products/produtoFormulario.ts` (`ABAS_PRODUTO` ganha `'historico'` e `ROTULO_ABA.historico = 'Histórico'`);
  - `features/products/ProdutoPage.tsx`;
  - `features/products/ProdutosListaPage.tsx`.
- Test: `ProdutoPage.test.tsx`, `ProdutosListaPage.test.tsx` e `produtoService.test.ts`

**Interfaces:**
- **Consumes:** o endpoint da Task 4.
- **Query:**
  - `useInfiniteQuery` com a chave `['produtos', id, 'historico-precos']`, `enabled` só quando a aba está ativa e o produto existe;
  - `getNextPageParam` pelo `totalItens`;
  - no sucesso do save, `invalidateQueries` dessa chave.
- **Aba:** só no modo edição, como última (Geral, Preços, Estoque, Códigos, Histórico), sem campos de formulário (fora de `CAMPOS_POR_ABA`).

- [ ] **Step 1:** escrever os testes:
  - a aba não existe em `/produtos/novo`;
  - abrir a aba busca a primeira página;
  - a linha mostra "Preço de venda", "R$ 10,00 → R$ 11,50", "+15,00%" e o nome do usuário;
  - a variação fica vazia quando o anterior é nulo;
  - "Carregar mais" aparece quando `totalItens` > itens carregados e busca `pagina=1`;
  - estados de carregando, erro com "Tentar de novo" e vazio, com o texto da spec §6.3;
  - salvar invalida o histórico;
  - listagem: com `emPromocao` true, aparece o selo "Promoção", o preço promocional e o preço normal riscado (`<s>` ou `line-through`, com texto acessível "de R$ 10,00 por R$ 8,90"); sem promoção vigente, fica como hoje;
  - service: a URL com `pagina` e `tamanho`.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npm test`, `npm run lint`, `npm run typecheck` e `npm run build`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): aba Historico de precos e selo Promocao na listagem`.

### Task 8 (CTO): integração e documentação
- [ ] Aplicar a V8 no `geitus_db` de dev com backup antes, conferindo os produtos antes e depois.
- [ ] Smoke da API:
  - criar uma promoção vigente;
  - o 400 de cada regra;
  - o histórico depois de editar o preço;
  - o 404 entre empresas.
- [ ] Verificação no navegador:
  - máscara;
  - margem → preço;
  - selo;
  - aba Histórico;
  - erro com salto para a aba Preços.
- [ ] Atualizar o status da spec §1 com os ajustes, `produtos.md`, `docs/modules/README.md` (Fase C ✔), os READMEs, `technical-debt.md` (se surgir dívida) e a memória.
- [ ] Rodar `./mvnw verify`, `npm run lint && npm run typecheck && npm test && npm run build` e `git status`.
