# Módulo PDV (etapa 11) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto, a execução é orquestrada pelo CTO:
> - as tasks 1–5 ficam com o `back-end-executor`, em sequência;
> - as tasks 6–8 ficam com o `front-end-executor`, em paralelo com o backend (o contrato está na spec §5.3);
> - os revisores entram depois.

**Goal:** vender no balcão com carrinho no navegador, cálculo e gravação atômica no servidor, desconto, pagamento dividido, venda em espera, cancelamento e caixa conferido por forma.

**Architecture:**
- **Backend:**
  - domínio novo `sales`:
    - `sales/carrinho` — regras puras: interpretador de código e calculadora;
    - `sales/venda` — finalização, cancelamento e consultas;
    - `sales/configuracao`;
  - `cashier` ganha forma, recebimento, estorno e contagem por forma;
  - `inventory` ganha baixa e estorno por venda.
  - O `sales` depende dos outros domínios só por interfaces que eles publicam.
- **Frontend:**
  - `features/pdv/` com a tela `/pdv`, cujo carrinho fica em `localStorage` e o cálculo vem do servidor;
  - o fechamento do caixa por forma;
  - a seção PDV em Configurações.

**Tech Stack:** Java 21, Spring Boot 3.5, JPA/Hibernate 6, Flyway, PostgreSQL 16, Testcontainers; React 19, TS, TanStack Query v5, Vitest.

**Spec:** [`docs/modules/pdv.md`](../../modules/pdv.md) (DEC-042), que manda nas regras (§3), mensagens, banco (§4) e contrato (§5.3). Leia também [`docs/modules/caixa.md`](../../modules/caixa.md) (§10, ajustes) e a V16.

## Global Constraints
- **Migrations:** só a nova `V17__pdv.sql`; V1–V16 intocadas. Se a tabela do `Numerador` tiver CHECK de tipo, a V17 o amplia para `VENDA`.
- **Dependências:** nenhuma nova, no backend ou no frontend.
- **Horários:** `TIMESTAMPTZ` com `OffsetDateTime.now(clock).truncatedTo(MICROS)`; os DTOs saem com `-03:00` (`HorarioDoCaixa` ou equivalente compartilhado). "Hoje" é `LocalDate.now(clock)`.
- **Dinheiro:**
  - `BigDecimal` com escala 2, arredondamento `HALF_UP`;
  - quantidades com escala 3;
  - custo com escala 4;
  - limite de 9.999.999.999,99.
- **Isolamento:**
  - empresa, usuário e perfil vêm sempre do `ResolvedorDoUsuarioAutenticado` (perfil do banco);
  - produto, embalagem, cliente e venda são buscados na empresa do usuário;
  - de outra empresa → 404 com campo;
  - OPERADOR em venda de sessão de outro → 404.
- **Mensagens:** exatamente as da spec §3, em pt-BR, com valores `R$ 1.234,56` e quantidades sem zeros à direita.
- **Commits:**
  - em pt-BR, com pathspec `-- backend/` ou `-- frontend/`;
  - sem `add -A`, `stash` ou `reset`;
  - mensagem terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Scanner dispara 13 dígitos + Enter em menos de 50 ms, várias vezes seguidas, com um cálculo ainda pendente.** Esperado:
   - nenhuma leitura se perde e a ordem das linhas é a ordem das leituras;
   - o total final é o do último cálculo, porque os pedidos antigos são cancelados.

   Teste na Task 7.
2. **Produto inativado, ou embalagem removida, entre o bipe e o finalizar.** Esperado:
   - 409/404 com o campo `itens[i]` e a mensagem do item ("Produto inativo — não pode ser vendido." ou "A embalagem {rótulo} não existe mais.");
   - a linha fica marcada em vermelho e o carrinho continua inteiro.

   Testes nas Tasks 5 e 8.
3. **`localStorage` com carrinho corrompido, de versão antiga, ou de outra empresa ou usuário.** Esperado: o carrinho é ignorado e começa vazio, sem erro na tela. O formato tem `versao: 1` e a chave inclui empresa e usuário. Teste na Task 7.
4. **Desconto do total em R$ maior que o subtotal depois de remover uma linha.** Esperado:
   - o cálculo devolve o erro no campo `desconto` ("O desconto passa do subtotal.");
   - a tela mostra o erro e bloqueia o F10 até corrigir, sem quebrar o total.

   Testes nas Tasks 4 e 7.
5. **O ADMIN fecha o caixa do operador em outra aba enquanto ele vende.** Esperado:
   - ao finalizar, 409 "Abra o caixa para vender." (ou "Termine o fechamento…");
   - o carrinho continua no navegador, e a tela mostra o estado do caixa com o botão de abrir.

   Testes nas Tasks 5 e 8.

---

### Task 1: V17

**Files:**
- Create: `backend/src/main/resources/db/migration/V17__pdv.sql`, exatamente a spec §4.1–§4.6, com:
  - os gatilhos de imutabilidade de `vendas` (só `CONCLUIDA → CANCELADA`), `itens_venda`, `pagamentos_venda` e `contagens_caixa`;
  - `movimentos_caixa`:
    - `forma` com carga `DINHEIRO` e `DEFAULT` removido depois;
    - tipos `RECEBIMENTO` e `ESTORNO`;
    - `venda_id` e os CHECKs;
  - a regra de `EM_CONFERENCIA` e da justificativa considerando qualquer forma (gatilho);
  - estoque:
    - `CANCELAMENTO_VENDA` (ENTRADA) nos CHECKs de motivo e de motivo por tipo;
    - `item_venda_id`;
    - `UNIQUE (empresa_id, item_venda_id, motivo)`;
    - troca do `ck_estoque_saldo_nao_negativo` por `ck_movimento_estoque_saldo_nao_negativo_fora_da_venda CHECK (saldo_novo >= 0 OR motivo = 'VENDA')`;
  - `configuracoes_pdv`.
- Test: `backend/src/test/java/com/geitus/app/sales/MigracaoV17IT.java`.

- [ ] **Step 1: Testes** (Flyway até V16 com dados: 2 empresas, sessões com movimentos e saldos; depois V17):
  - `movimentosAtuaisViramDinheiro`;
  - `recebimentoExigeVendaEValorPositivo`;
  - `aberturaSangriaSuprimentoSoEmDinheiro`;
  - `vendaSoMudaDeConcluidaParaCancelada` (e DELETE recusado);
  - `itemEPagamentoImutaveis`;
  - `totalIncoerenteRecusado`;
  - `cancelamentoIncoerenteRecusado`;
  - `chaveRepetidaNaEmpresaRecusada`;
  - `numeroRepetidoNaEmpresaRecusado`;
  - `saldoNegativoSoComMotivoVenda` (AJUSTE que deixa negativo recusado; VENDA aceita);
  - `estornoDeEstoqueUnicoPorItem`;
  - `contagemPorFormaImutavelEUnica`;
  - `emConferenciaComDiferencaSoNoCartaoAceita`;
  - `fechadaComDiferencaNoCartaoSemJustificativaRecusada`;
  - `fksDeOutraEmpresaRecusadas` (venda com sessão, cliente e produto de outra empresa);
  - `itemSemFkDeEmbalagem` (excluir a embalagem não afeta o item);
  - `produtoVendidoNaoExcluido`;
  - `configuracaoPdvPadrao` (sem linha = padrão; CHECK de 0 a 100).
- [ ] **Step 2:** `./mvnw -q test -Dtest=MigracaoV17IT` → FAIL. Escrever a V17. → PASS. `./mvnw -q verify` (as entidades ainda não mudam; se o `ddl-auto: validate` exigir, ajuste só o mapeamento mínimo de `MovimentoDeCaixa.forma` nesta task).
- [ ] **Step 3: Commit** `feat(pdv): migration V17 com vendas, caixa por forma e estoque por venda`.

### Task 2: Caixa por forma

**Files:**
- Modify: `cashier/sessao/*`:
  - `MovimentoDeCaixa`: `forma`, `vendaId`, tipos novos;
  - `SessoesDeCaixaService`;
  - `RespostasDaSessao`;
  - `dto/ContagemRequest`: `Map<FormaDePagamento, BigDecimal> contagens`, `justificativa`;
  - `dto/SessaoDeCaixaResponse`: `porForma: List<ValoresPorForma(forma, esperado, contado, diferenca)>`, `formasDaContagem: List<FormaDePagamento>`, e `dinheiroNaGaveta` mantido.
- Create:
  - `cashier/FormaDePagamento.java` (`DINHEIRO`, `DEBITO`, `CREDITO`, `PIX`, com o rótulo "Dinheiro", "Débito", "Crédito", "PIX");
  - `cashier/sessao/ContagemDeCaixaPorForma.java` (entidade);
  - `cashier/RecebimentosDoCaixa.java` (interface pública).
- Test: atualizar os ITs do caixa ao contrato novo e criar `cashier/sessao/ContagemPorFormaIT.java`.

**Interfaces (Produces, usados na Task 5):**
- `RecebimentosDoCaixa`:
  - `SessaoAbertaParaVenda travarSessaoParaVenda(UsuarioAutenticado usuario)` → record `(Long sessaoId, UUID sessaoUuid, String pontoNome)`. Lança `CaixaConflitoException` com "Abra o caixa para vender." (sem sessão) ou "Termine o fechamento do caixa antes de vender." (em conferência). Faz o `FOR UPDATE`.
  - `void registrarRecebimentos(Long empresaId, Long sessaoId, Long vendaId, Long usuarioId, Map<FormaDePagamento, BigDecimal> recebidos)`.
  - `SessaoDaVenda travarSessaoDaVenda(Long empresaId, Long sessaoId)` → record `(StatusDaSessao status, Long abertaPor)`, com `FOR UPDATE`.
  - `void registrarEstornos(Long empresaId, Long sessaoId, Long vendaId, Long usuarioId, Map<FormaDePagamento, BigDecimal> valores, boolean escondeValor)`. Lança 409 "Não há dinheiro suficiente na gaveta para devolver ({R$ x})." ou, com `escondeValor`, sem o valor.
- `sessaoAbertaDoUsuario` é removido (substituído por `travarSessaoParaVenda`).

- [ ] **Step 1: Testes** (`ContagemPorFormaIT`; movimentos de recebimento inseridos via `RecebimentosDoCaixa` direto):
  - `esperadoPorForma` (dinheiro inclui recebimento − estorno);
  - `sangriaLimitadaAoDinheiro` (recebimento em PIX não conta);
  - `formasDaContagemSoComMovimento`;
  - `formaFaltando400` ("Informe o valor contado de Débito.");
  - `formaSemMovimento400`;
  - `todasZeroFecha`;
  - `diferencaSoNoCartaoVaiParaConferenciaNoCego`;
  - `naoCegoComJustificativaFecha`;
  - `contagemRepetidaMesmosValores200` e `outrosValores409`;
  - `cegoOperadorSemEsperadoDeNenhumaForma`;
  - `recebimentoEEstornoComValorNuloParaOperadorNoCego`;
  - `travarSessaoParaVendaSemCaixa409` e `emConferencia409`;
  - `estornoDinheiroAcimaDaGaveta409` (com e sem valor).
- [ ] **Step 2:** atualizar `SessoesDeCaixaIT`, `ModoCegoIT`, `ConcorrenciaDoCaixaIT` e `HistoricoDoCaixaIT` ao contrato novo da contagem (`{"contagens":{"DINHEIRO":…}}`), mantendo as mesmas asserções.
- [ ] **Step 3:** rodar → FAIL; implementar; `./mvnw -q verify` → PASS (o `ImagemDoProdutoIT` pode falhar só por loopback no sandbox).
- [ ] **Step 4: Commit** `feat(caixa): recebimentos, estornos e conferencia por forma de pagamento`.

### Task 3: Estoque por venda

**Files:**
- Modify:
  - `inventory/MotivoMovimento.java` (`CANCELAMENTO_VENDA("Cancelamento de venda", false, ENTRADA)`);
  - `inventory/MovimentoEstoque.java` (`itemVendaId`);
  - `inventory/EstoqueService.java`.
- Create: `inventory/EstoqueDaVenda.java` (interface pública), com a implementação no próprio `inventory`.
- Test: `inventory/EstoqueDaVendaIT.java`.

**Interfaces (Produces):**
- `record BaixaDeItem(Long produtoId, Long itemVendaId, BigDecimal quantidadeEstoque)`.
- `Map<Long, BigDecimal> EstoqueDaVenda.travarSaldos(Long empresaId, Collection<Long> produtoIds)`: trava em ordem de `id` e devolve os saldos atuais (0 sem linha).
- `void EstoqueDaVenda.baixar(Long empresaId, Long usuarioId, List<BaixaDeItem> baixas)`: `SAIDA`/`VENDA`, origem `VENDA`, com saldo negativo permitido; só para produtos com `controla_estoque`.
- `void EstoqueDaVenda.estornar(Long empresaId, Long usuarioId, List<BaixaDeItem> baixas)`: `ENTRADA`/`CANCELAMENTO_VENDA`, origem `VENDA`.

- [ ] **Step 1: Testes:**
  - `baixaDeixaSaldoNegativo`;
  - `ajusteManualContinuaSemNegativo`;
  - `baixaIgnoraProdutoSemControle`;
  - `estornoDevolveSaldo`;
  - `travaEmOrdemDeId` (duas transações com conjuntos invertidos não dão deadlock: `CyclicBarrier`, 5 rodadas);
  - `historicoDoProdutoMostraVendaECancelamento` (motivos com rótulo);
  - `podeExcluirFalsoDepoisDeVenda`.
- [ ] **Step 2:** FAIL → implementar → PASS; `./mvnw -q verify`.
- [ ] **Step 3: Commit** `feat(estoque): baixa e estorno de estoque por venda`.

### Task 4: Carrinho, cálculo, resolução de itens e configuração

**Files:**
- Create:
  - `sales/package-info.java`;
  - `sales/carrinho/{InterpretadorDeCodigo, CodigoInterpretado, CalculadoraDaVenda, LinhaParaCalculo, CalculoDaVenda, LinhaCalculada, DescontoInformado, TipoDesconto, PagamentoInformado, ErroDoCalculo}.java`;
  - `sales/carrinho/{ResolucaoDeItens, PdvItensController}.java` (`GET /api/pdv/itens`);
  - `sales/carrinho/CalculoController.java` (`POST /api/pdv/calculo`);
  - `sales/carrinho/MontagemDoCarrinho.java`: carrega produtos, embalagens e cliente da empresa, lê as etiquetas de novo e monta as `LinhaParaCalculo`. É usada pelo `/calculo` e pela Task 5;
  - `sales/configuracao/{ConfiguracaoDoPdv, ConfiguracaoDoPdvRepository, ConfiguracaoDoPdvService, ConfiguracaoDoPdvController}.java` e os DTOs;
  - `sales/dto/{CarrinhoRequest, ItemDoCarrinhoRequest, CalculoResponse, ItemResolvidoResponse}.java`.
- Modify: `config/SecurityConfig.java` (`/api/pdv/**` autenticado; `/api/configuracoes/pdv`: GET autenticado, o resto ADMIN sem método) e `shared/error/GlobalExceptionHandler.java` (as exceções novas).
- Test:
  - `sales/carrinho/InterpretadorDeCodigoTest.java`;
  - `sales/carrinho/CalculadoraDaVendaTest.java`;
  - `sales/carrinho/PdvItensIT.java`;
  - `sales/carrinho/CalculoIT.java`;
  - `sales/configuracao/ConfiguracaoDoPdvIT.java`.

**Interfaces (Produces, usados na Task 5):**
- `CalculoDaVenda CalculadoraDaVenda.calcular(List<LinhaParaCalculo> linhas, DescontoInformado descontoDoTotal, List<PagamentoInformado> pagamentos, boolean ehAdmin, BigDecimal descontoMaximoOperador, LocalDate hoje)`. É puro, sem banco.
- `CalculoDaVenda`:
  - `linhas()`, `subtotal()`, `descontoItens()`, `descontoTotal()`, `total()`, `pago()`, `troco()`, `faltaPagar()`;
  - `recebidosPorForma(): Map<FormaDePagamento, BigDecimal>`;
  - `erros(): List<ErroDoCalculo(String campo, String mensagem)>`;
  - `avisos(): List<ErroDoCalculo>`.
- `LinhaCalculada(int ordem, Produto produto, ProdutoEmbalagem embalagem, boolean etiqueta, String codigoLido, BigDecimal quantidade, BigDecimal quantidadeEstoque, BigDecimal precoUnitario, OrigemPrecoDaVenda origem, BigDecimal valorBruto, BigDecimal descontoItem, BigDecimal descontoRateado, BigDecimal valorLiquido)`.
- `OrigemPrecoDaVenda` = `NORMAL`, `PROMOCIONAL`, `ATACADO`, `EMBALAGEM`, `ETIQUETA`.
- `List<LinhaParaCalculo> MontagemDoCarrinho.montar(UsuarioAutenticado usuario, CarrinhoRequest carrinho)`:
  - 404 com campo `itens[i]` para produto ou embalagem inexistente ("A embalagem {rótulo} não existe mais." quando ela some);
  - 409 com campo para produto inativo;
  - 404 `clienteId` para cliente inexistente ou inativo.
- `ConfiguracaoDoPdvService.daEmpresa(Long empresaId): ConfiguracaoDoPdv(venderSemEstoque, descontoMaximoOperador)`.
- O `/calculo` devolve 200 com `erros` (regras) e 404/409 (dados inexistentes ou inativos).

- [ ] **Step 1: Testes** (`InterpretadorDeCodigoTest`):
  - `542*3` → código 542, quantidade 3;
  - `0542*3` → 542;
  - `542*0,750` e `542*0.750` → 0.750;
  - `*3`, `542*` e `542*-1` → erro de quantidade;
  - etiqueta `2000542010000` com a configuração padrão → `Etiqueta`;
  - `2000000010000` (código 000000) → não é etiqueta;
  - `ração x` → `Busca`;
  - `7891234567895` → código de barras com quantidade 1.
- [ ] **Step 2: Testes** (`CalculadoraDaVendaTest`), um por regra de §3.2–§3.4 e §8 "Domínio":
  - etiqueta KG R$ 25/kg com R$ 10 → 0,400 KG;
  - etiqueta UN a R$ 5 → 2 UN;
  - UN a R$ 3 → 1 UN por R$ 10;
  - atacado de 12 com 7 + 5 em duas linhas → `ATACADO` nas duas;
  - embalagem fora do atacado;
  - Nexgard 1 CX R$ 209,90 + 1 UN R$ 89,90 → total 299,80, `quantidadeEstoque` 3 e 1;
  - desconto % e R$;
  - repartição 3 linhas de 10,00 com desconto total de 1,00 → 0,33/0,33/0,34 (o resto na maior; empate → a primeira);
  - limite 10,00% passa e 10,01% → erro "O desconto passa do limite do operador (10%).";
  - ADMIN sem limite;
  - preço mínimo em embalagem por unidade;
  - `descontoTotalMaiorQueSubtotal` (Review Focus 4: erro em `desconto` "O desconto passa do subtotal.");
  - total zero → erro;
  - cartão acima do total → erro;
  - falta pagar;
  - troco;
  - dinheiro todo em troco → sem recebimento em dinheiro.
- [ ] **Step 3: ITs:**
  - **`PdvItensIT`:** os tipos `UNIDADE`, `EMBALAGEM` e `ETIQUETA`; inativo 409; inexistente 404; busca só ativos, até 20; produto de outra empresa 404; o custo não sai.
  - **`CalculoIT`:** o servidor relê a etiqueta e ignora a quantidade enviada; embalagem removida → 404 `itens[0]`; cliente inativo → 404 `clienteId`; OPERADOR e ADMIN com o mesmo desconto de 15% (erro só para o OPERADOR, perfil do banco).
  - **`ConfiguracaoDoPdvIT`:** padrão; ADMIN altera; OPERADOR → 403; ADMIN rebaixado com token antigo → 403; 101% → 400.
- [ ] **Step 4:** FAIL → implementar → PASS; `./mvnw -q verify`.
- [ ] **Step 5: Commit** `feat(pdv): interpretacao de codigo, calculo do carrinho e configuracao do pdv`.

### Task 5: Finalizar, consultar e cancelar venda

**Files:**
- Create:
  - `sales/venda/{Venda, ItemDaVenda, PagamentoDaVenda, StatusDaVenda, VendaRepository, ConsultaDeVendas, FiltroDeVendas, VendasService, VendaController}.java`;
  - `sales/venda/dto/{FinalizarVendaRequest, VendaResponse, ItemDaVendaResponse, PagamentoResponse, CancelamentoRequest}.java`.
- Modify: `shared/numeracao/TipoNumeracao.java` (`VENDA`).
- Test:
  - `sales/venda/FinalizarVendaIT.java`;
  - `sales/venda/CancelarVendaIT.java`;
  - `sales/venda/ConcorrenciaDaVendaIT.java`;
  - `sales/venda/ConsultaDeVendasIT.java`.

**Interfaces:**
- Consumes: Tasks 2, 3 e 4.
- Ordem na finalização (spec §3.6):
  1. resolver o usuário;
  2. `travarSessaoParaVenda`;
  3. chave;
  4. `MontagemDoCarrinho.montar`;
  5. `travarSaldos`;
  6. `calcular`;
  7. conferir `totalEsperado`;
  8. erros → 400 (com campo) ou 409 (estoque com "Vender sem estoque" desligada);
  9. gravar a venda, os itens e os pagamentos;
  10. `baixar`;
  11. `registrarRecebimentos`.
- `VendaResponse` conforme a spec §5.3; o custo não sai.

- [ ] **Step 1: Testes** (`FinalizarVendaIT`):
  - `vendaSimples201ComNumeroSequencial` (dois números seguidos);
  - `semCaixa409` e `caixaEmConferencia409`;
  - `caixaFechadoPorAdminEmOutraAba409` (Review Focus 5);
  - `chaveRepetida200MesmaVenda` e `chaveComOutrosDados409`;
  - `totalMudou409` (promoção alterada entre o cálculo e o finalizar);
  - `semEstoqueDesligado409ComCampo` e `semEstoqueLigadoDeixaNegativo`;
  - `produtoSemControleSemMovimento`;
  - `nexgardBaixa4ERecebe299_80`;
  - `pagamentoDivididoComTrocoRecebeLiquidoEmDinheiro`;
  - `produtoInativadoAntesDeFinalizar409ItensI` e `embalagemRemovidaAntesDeFinalizar404ItensI` (Review Focus 2);
  - `clienteFotografado`;
  - `itensComFotografiaECusto` (no banco) e `respostaSemCusto`.
- [ ] **Step 2: Testes** (`CancelarVendaIT`):
  - `cancelaEstornaEstoqueECaixa`;
  - `caixaFechado409`;
  - `operadorEmVendaDeOutro404`;
  - `adminCancelaDeOutro200`;
  - `estornoDinheiroAcimaDaGaveta409`;
  - `cancelarDeNovoMesmoMotivo200` e `outroMotivo409`;
  - `motivoVazio400`.
- [ ] **Step 3: Testes** (`ConcorrenciaDaVendaIT`):
  - `duasVendasDoUltimoItemComSemEstoqueDesligadoUmaRecebe409`;
  - `duasFinalizacoesMesmaChaveUmaVenda`;
  - `vendaECancelamentoSimultaneosSemDeadlock`.
- [ ] **Step 4: Testes** (`ConsultaDeVendasIT`):
  - OPERADOR só das próprias sessões;
  - padrão = a sessão atual;
  - filtros `status`, `de`, `ate`, `numero`;
  - `podeCancelar` coerente;
  - venda de outra empresa 404.
- [ ] **Step 5:** FAIL → implementar → PASS; `./mvnw -q verify`.
- [ ] **Step 6: Commit** `feat(pdv): finalizacao, consulta e cancelamento de vendas`.

### Task 6: Serviços, Configurações › PDV e fechamento do caixa por forma (frontend)

**Files:**
- Create:
  - `types/pdv.ts`;
  - `services/pdvService.ts` (`resolverCodigo`, `buscarProdutos`, `calcular(carrinho, signal)`, `finalizar`, `listarVendas`, `buscarVenda`, `cancelarVenda`) e `services/configuracaoPdvService.ts`, com os testes;
  - `features/settings/SecaoPdv.tsx`, com o teste.
- Modify:
  - `types/caixa.ts` e `services/caixaService.ts` (`contar(id, { contagens, justificativa })`; sessão com `porForma` e `formasDaContagem`);
  - `features/cash-register/JanelaFecharCaixa.tsx`, `ResumoDoFechamento.tsx`, `ListaDeMovimentos.tsx` (recebimento e estorno com "Venda nº", valor nulo no cego) e `DetalheDaSessao.tsx`;
  - `features/settings/ConfiguracoesPage.tsx`;
  - `components/layout/RootLayout.tsx` (PDV ativo, `to: '/pdv'`).

- [ ] **Step 1: Testes:**
  - fechar o caixa com Dinheiro e Débito no modo não cego (esperado e diferença ao lado de cada um, justificativa única quando qualquer um difere) e no modo cego (os resultados por forma depois de "Conferir");
  - o resumo com a tabela por forma;
  - movimentos de recebimento com "Venda nº 128";
  - Configurações › PDV: o interruptor e o percentual (0–100, vírgula) salvam, e o erro reverte.
- [ ] **Step 2:** FAIL → implementar → `npm run lint && npm run typecheck && npm test && npm run build` → PASS.
- [ ] **Step 3: Commit** `feat(pdv): servicos do pdv, configuracao e fechamento do caixa por forma`.

### Task 7: Tela `/pdv`: carrinho, leitura, cálculo e desconto

**Files:**
- Create em `features/pdv/`:
  - `PdvPage.tsx`;
  - `useCarrinho.ts` (estado mais `localStorage` com chave `geitus.pdv.{empresaId}.{usuarioId}` e `versao: 1`);
  - `useCalculo.ts` (debounce de 150 ms e `AbortController`);
  - `CampoDeLeitura.tsx` (fila de leituras em ordem);
  - `ListaDeLinhas.tsx`, `PainelDoTotal.tsx`;
  - `JanelaBusca.tsx` (F2), `JanelaCliente.tsx` (F3), `JanelaDesconto.tsx` (F4 / Shift+F4);
  - `atalhosDoPdv.ts`;
  - `bipeDeErro.ts` (Web Audio, volume 0,1, com falha silenciosa);
  - os testes.
- Modify: `routes/router.tsx` (`/pdv`).

**Interfaces (Produces, Task 8):** `useCarrinho()` → `{ linhas, desconto, cliente, adicionar, alterarQuantidade, trocarEmbalagem, remover, aplicarDesconto, definirCliente, limpar, substituir(carrinho) }`.

- [ ] **Step 1: Testes:**
  - `542*3` resolve e soma na mesma linha;
  - etiqueta vira linha nova;
  - código não encontrado mostra o erro no campo e toca o bipe (mock);
  - troca "UN ▾" para "CX c/ 3 UN";
  - os atalhos F2, F3, F4, Shift+F4, ↑/↓, + / − e Del;
  - o foco volta ao campo depois de cada janela;
  - **Review Focus 1:** 5 leituras disparadas sem esperar, com o primeiro cálculo pendente → 5 linhas em ordem, os pedidos antigos abortados e o total do último;
  - **Review Focus 3:** `localStorage` com JSON inválido, `versao` 0 ou de outra empresa → carrinho vazio, sem erro;
  - **Review Focus 4:** o erro de `desconto` vindo do cálculo aparece e bloqueia o F10;
  - sem caixa mostra "Abra o caixa para vender." com o botão; em conferência mostra o link para o Caixa;
  - o aviso "Estoque insuficiente (saldo 2 UN)" na linha;
  - recarregar mantém o carrinho.
- [ ] **Step 2:** FAIL → implementar → os 4 comandos → PASS.
- [ ] **Step 3: Commit** `feat(pdv): tela do pdv com leitura, carrinho, calculo e desconto`.

### Task 8: Pagamento, finalizar, espera e vendas do caixa

**Files:**
- Create em `features/pdv/`:
  - `JanelaPagamento.tsx` (F10);
  - `JanelaTotalMudou.tsx`;
  - `vendasEmEspera.ts` (até 5, mesma chave base `…espera`);
  - `JanelaVendasEmEspera.tsx` (F7);
  - `JanelaVendasDoCaixa.tsx` (F8, com o detalhe e o cancelamento);
  - os testes.

- [ ] **Step 1: Testes:**
  - as teclas 1–4 preenchem o que falta;
  - pagamento dividido com troco;
  - cartão acima do total mostra o erro;
  - Enter finaliza → "Venda nº 128 concluída · Troco R$ 5,00", carrinho vazio e foco no campo;
  - 409 "O total da venda mudou." → a janela com o antigo e o novo; "Confirmar" reenvia com o novo `totalEsperado` e **a mesma chave**;
  - rede caiu → a mesma chave no retry;
  - **Review Focus 2:** 409/404 com `itens[i]` → a linha marcada em vermelho e o carrinho mantido;
  - **Review Focus 5:** 409 "Abra o caixa para vender." → o carrinho mantido e a tela no estado sem caixa;
  - espera: F6 põe em espera; o limite de 5; retomar com carrinho aberto pergunta; descartar confirma;
  - F8: a lista, o detalhe e o cancelamento com motivo; o 409 do caixa fechado mostra a mensagem.
- [ ] **Step 2:** FAIL → implementar → os 4 comandos → PASS.
- [ ] **Step 3: Commit** `feat(pdv): pagamento, finalizacao, vendas em espera e cancelamento`.

---

## Depois das tasks (CTO)
- **Revisores:**
  - `data-reviewer` e `security-reviewer`;
  - `back-end-reviewer` e `front-end-reviewer`;
  - `product-ux-reviewer` e `qa-reviewer`.
- **Dev:**
  - backup `-Fc` antes da V17;
  - subir o backend;
  - smoke da API (venda com etiqueta, Nexgard, dividido, cancelamento, fechamento por forma);
  - navegador com o usuário de teste.
- **Docs:** "Ajustes na implementação" na spec, README dos módulos (PDV ✔), DT-032 e DT-039 marcadas como resolvidas e as DTs novas.
