# Produtos Fase B2 (Número, código, balança, tela única) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto, a execução é orquestrada pelo CTO: as tasks 1–4 ficam com o `back-end-executor` e as 5–8 com o `front-end-executor`, com revisores após cada bloco.

**Goal:** número sequencial imutável em produtos e clientes, código do produto numérico opcional com "Vendido na balança", configuração e leitura da etiqueta de balança, formulário do produto em tela única com atalhos, e margem/markup em todos os preços.

**Architecture:**
- **Backend:**
  - `shared/numeracao/Numerador` (UPDATE … RETURNING na transação) gera os números;
  - `catalog` ganha `codigo` e `vendidoBalanca` no produto;
  - um subpacote `catalog/balanca` traz a configuração, o leitor (domínio puro) e os endpoints;
  - a busca da listagem aceita número e código quando o termo é numérico.
- **Frontend:**
  - a `ProdutoPage` troca as abas (radix Tabs) por seções empilhadas com uma barra de atalhos fixa (scroll-spy com `IntersectionObserver`);
  - a nova página `/produtos/balanca`;
  - Clientes mostram o Nº.

**Tech Stack:** Java 21, Spring Boot 3.5, JPA/Hibernate 6, Flyway, PostgreSQL 16, Testcontainers; React 19, TS, RHF + Zod 4, TanStack Query v5, Vitest.

**Spec:** [`docs/modules/produtos-codigo-e-balanca.md`](../../modules/produtos-codigo-e-balanca.md) (DEC-036). Os executores leem a spec inteira.

## Global Constraints
- **Migrations:** só a nova `V11__numero_codigo_balanca.sql`; V1–V10 intocadas (DEC-020).
- **Isolamento:** por empresa (DEC-016). O `numero` nunca vem do request e é `updatable = false`.
- **Código do produto:** `Integer` de 1 a 999999; exibido sem zeros; na digitação, zeros à esquerda são aceitos e removidos.
- **Mensagens:** as exatas da spec §2 e §3.
- **Paginação, listagem e SQL nativo:** seguem os padrões da Fase E (`ConsultaDeProdutos` só com fragmentos fixos e parâmetros nomeados).
- **Dependências e escopo:** nenhuma dependência nova; nada de fiscal nem de PDV.
- **Commits:** em pt-BR, no padrão `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Dois cadastros simultâneos de produto (ou de cliente):** números diferentes e consecutivos, nunca 500 nem número repetido; um cadastro que falha (por exemplo, SKU duplicado) não "queima" número. Teste na Task 1.
2. **Código "000542" digitado num produto e "542" em outro:** 409 "Este código já está em uso no produto {nome}." (são o mesmo código). Na busca, "0542" encontra o produto de código 542. Testes nas Tasks 2 e 4.
3. **Configuração da etiqueta trocada para 4 dígitos de código com produtos de código 12345 "Vendidos na balança":** salvar a configuração funciona e devolve a lista de afetados; salvar um desses produtos sem mudar o código dá 400 com a mensagem de tamanho. Testes nas Tasks 3 e 2.
4. **Tela única: erro de validação no Estoque com o usuário no topo da página:** a página rola até o campo e foca nele, e o atalho "Estoque" mostra "1". Erro do servidor em `codigo` (409) leva à seção Códigos. Teste na Task 6.
5. **Produto antigo (sem código) editado e salvo:** o PATCH com `codigo: null` e `vendidoBalanca: false` passa, e o `numero` não muda. Testes nas Tasks 2 e 6.

---

### Task 1: V11 e `Numerador`

**Files:**
- Create: `backend/src/main/resources/db/migration/V11__numero_codigo_balanca.sql`
- Create: `backend/src/main/java/com/geitus/app/shared/numeracao/Numerador.java` e `TipoNumeracao.java` (`PRODUTO`, `CLIENTE`)
- Modify:
  - `catalog/Produto.java`: `numero` (`Long`, `nullable=false`, `updatable=false`), `codigo` (`Integer`) e `vendidoBalanca` (`boolean`);
  - `customer/Cliente.java`: `numero` (`Long`, `updatable=false`).
- Test: `backend/src/test/java/com/geitus/app/catalog/MigracaoV11IT.java` (`postgres:16`, como o `MigracaoV10IT`) e `shared/numeracao/NumeradorIT.java`

**Interfaces:**
- **Produces:**
  - `@Component class Numerador { @Transactional(propagation = MANDATORY) long proximo(Long empresaId, TipoNumeracao tipo) }`:
    - `INSERT INTO numeracoes (empresa_id, tipo, ultimo_numero) VALUES (?, ?, 0) ON CONFLICT DO NOTHING`;
    - `UPDATE numeracoes SET ultimo_numero = ultimo_numero + 1 WHERE empresa_id = ? AND tipo = ? RETURNING ultimo_numero`;
    - via `JdbcTemplate`/`NamedParameterJdbcTemplate`.
  - Construtores e fábricas de `Produto` e `Cliente` passam a receber o `numero`. Um `getNumero()` em cada.
- **V11, nesta ordem:**
  1. `ADD COLUMN`;
  2. preencher `numero` com `row_number() OVER (PARTITION BY empresa_id ORDER BY criado_em, id)`;
  3. `SET NOT NULL`;
  4. as UNIQUEs;
  5. CHECKs de `codigo` e `vendido_balanca`;
  6. índice único parcial `uq_produto_empresa_codigo ON produtos (empresa_id, codigo) WHERE codigo IS NOT NULL`;
  7. `CREATE TABLE numeracoes` e o preenchimento com o máximo por empresa e tipo;
  8. `CREATE TABLE configuracoes_etiqueta_balanca`, com os CHECKs de §3.1, `ck_etiqueta_tamanho_total` (soma = 13, com `length(prefixo)`) e `uq_etiqueta_empresa`.
- **Nomes:** `uq_produto_empresa_numero`, `uq_cliente_empresa_numero`, `ck_produto_codigo_intervalo`, `ck_produto_balanca_exige_codigo`, `ck_numeracao_tipo`, `ck_numeracao_nao_negativa`.

- [ ] **Step 1:** escrever os testes:
  - `MigracaoV11IT`:
    - `produtosRecebemNumerosPorEmpresaEmOrdemDeCadastro` (duas empresas, 3 + 2 produtos → 1..3 e 1..2);
    - `clientesRecebemNumeros`;
    - `numeracoesComOMaximo`;
    - `codigoNuloEBalancaFalse`;
    - `rejeitaBalancaSemCodigo`;
    - `rejeitaCodigoZeroEUmMilhao`;
    - `codigoUnicoPorEmpresaMasRepetivelEntreEmpresas`;
    - `rejeitaEtiquetaComSomaDiferenteDe13`;
    - `aceitaEtiquetaPadrao`;
    - `numeroUnicoPorEmpresa`.
  - `NumeradorIT`:
    - `sequencia1_2_3`;
    - `empresasIndependentes`;
    - `vinteEmParaleloSaoDistintosEConsecutivos` (`CyclicBarrier`, `TransactionTemplate`);
    - `rollbackNaoConsomeNumero`.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar. Os construtores de `Produto` e `Cliente` exigem o `numero`; ajuste os builders de teste existentes (`ProdutoTesteBuilder` etc.) para fornecer números.
- [ ] **Step 4:** rodar `./mvnw -q verify`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(catalogo): numero de registro e migration V11`.

### Task 2: Produto e Cliente: número, código e balança

**Files:**
- Modify:
  - `catalog/ProdutoService.java` (cadastrar com `numerador.proximo(empresaId, PRODUTO)`; validações do código), `catalog/dto/ProdutoRequest.java` (`Integer codigo`, `Boolean vendidoBalanca`), `catalog/dto/ProdutoResponse.java` (`numero`, `codigo`, `vendidoBalanca`) e `catalog/DadosProduto.java`;
  - `customer/ClienteService.java` (número na criação) e `customer/dto/ClienteResponse.java` (`numero`).
- Test: `ProdutoServiceTest`, `ProdutoControllerTest`, `ClienteServiceTest`/`ClienteControllerTest` e `CatalogoServiceIT`

**Interfaces:**
- **Consumes:**
  - a Task 1;
  - `ConfiguracaoEtiquetaBalanca` da Task 3, para saber `digitosCodigo`. Para não depender da ordem, use uma interface pequena em `catalog`: `TamanhoDoCodigoNaEtiqueta { int digitosCodigo(Long empresaId) }`, implementada na Task 3. Até lá, uma implementação padrão devolve 6.
- **Regras de `codigo`:**
  - nulo é permitido;
  - fora de 1..999999 → 400 `codigo`;
  - `vendidoBalanca` sem código → 400 `codigo`;
  - `vendidoBalanca` com `String.valueOf(codigo).length() > digitosCodigo` → 400 `codigo` ("Este código tem mais dígitos do que a etiqueta da balança comporta (4).");
  - repetido na empresa (excluindo o próprio produto na edição) → 409 `codigo` ("Este código já está em uso no produto {nome}.");
  - violação de `uq_produto_empresa_codigo` numa corrida → 409 com a mesma mensagem.
- **JSON:** o `codigo` é `Integer` no JSON. O front remove os zeros à esquerda e envia número; nada de deserializer próprio.
- **`numero` no request:** ignorado (não existe no DTO). Teste que um JSON com `"numero": 999` não altera nada.

- [ ] **Step 1:** escrever os testes:
  - `cadastroGeraNumeroSequencial`;
  - `edicaoNaoMudaONumero`;
  - `codigoRepetido_409ComCampoENome`;
  - `codigoForaDoIntervalo_400`;
  - `balancaSemCodigo_400`;
  - `codigoGrandeDemaisParaEtiqueta_400` (com `digitosCodigo` = 4 e código 12345);
  - `produtoAntigoSemCodigoSalva` (Review Focus 5);
  - `respostaTrazNumeroCodigoEBalanca`;
  - `clienteRecebeNumeroNaCriacao` e `clienteRespostaTrazNumero`;
  - `numeroNoJsonEIgnorado`.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `./mvnw -q verify`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): codigo do produto e vendido na balanca; numero em produtos e clientes`.

### Task 3: Etiqueta de balança (configuração, leitor, endpoints)

**Files:**
- Create, em `backend/src/main/java/com/geitus/app/catalog/balanca/`:
  - `ConfiguracaoEtiquetaBalanca.java` (entidade);
  - `TipoInformacaoEtiqueta.java` (`VALOR`, `PESO`);
  - `ConfiguracaoEtiqueta.java` (record de valor, com `static ConfiguracaoEtiqueta padrao()` e `validar()`);
  - `LeitorEtiquetaBalanca.java`;
  - `LeituraEtiqueta.java` (record);
  - `ConfiguracaoEtiquetaRepository.java`, `EtiquetaBalancaService.java`, `EtiquetaBalancaController.java`;
  - `dto/` (`ConfiguracaoEtiquetaRequest/Response`, `TesteEtiquetaRequest/Response`, `SalvarEtiquetaResponse`, `ProdutoAfetadoResponse`).
- Modify: `config/SecurityConfig.java` (`PUT /api/etiqueta-balanca` ADMIN; GET e `POST /teste` autenticado) e `ProdutoRepository` (`findByEmpresa_IdAndCodigo`; consulta dos produtos com balança e código ≥ 10^digitos)
- Test: `LeitorEtiquetaBalancaTest`, `ConfiguracaoEtiquetaTest`, `EtiquetaBalancaControllerTest` e `EtiquetaBalancaIT`

**Interfaces:**
- **Produces:**
  - `record ConfiguracaoEtiqueta(String prefixo, int digitosCodigo, int digitosPreenchimento, TipoInformacaoEtiqueta tipoInformacao, int digitosInformacao, int casasDecimais, boolean digitoVerificador)`, com:
    - `padrao()` = `("2", 6, 0, VALOR, 6, 3, false)`;
    - `void validar()`, que lança `RegraDeNegocioException` com a mensagem "A etiqueta precisa ter 13 dígitos no total (hoje: {n})." e os campos dos intervalos.
  - `final class LeitorEtiquetaBalanca { static Optional<LeituraEtiqueta> ler(String codigoLido, ConfiguracaoEtiqueta config) }`, com `record LeituraEtiqueta(int codigoProduto, TipoInformacaoEtiqueta tipo, BigDecimal valor)`. O valor tem `scale = casasDecimais` (por exemplo `10.000`).
  - `EtiquetaBalancaService.configuracaoDaEmpresa(Long empresaId): ConfiguracaoEtiqueta`, que implementa o `TamanhoDoCodigoNaEtiqueta` da Task 2.
  - Endpoints conforme a spec §8. No teste, o produto é procurado pelo código lido na empresa do JWT.
  - O DV usa o `CodigoBarras.digitoVerificadorValido` que já existe.

- [ ] **Step 1:** escrever os testes:
  - leitor:
    - `exemploRealDoUsuario` (`2000542010000` → 542, VALOR, 10.000);
    - modelos prontos (um exemplo calculado de cada um, incluindo um com DV válido);
    - `doze_e_quatorze_digitos_vazio`;
    - `prefixoDiferente_vazio`;
    - `naoNumerico_vazio`;
    - `dvInvalido_vazio`;
    - `peso3Casas`;
    - `preenchimentoIgnorado`;
  - configuração:
    - `padraoValido`;
    - `somaDiferenteDe13_400` com a mensagem;
    - cada intervalo fora → 400;
  - controller e IT:
    - `getSemConfiguracaoDevolvePadrao` (`padrao: true`);
    - `putValidoGravaEDevolve`;
    - `putOperador_403`;
    - `putDevolveProdutosComCodigoGrandeDemais` (Review Focus 3);
    - `testeComProdutoEncontrado` (nome e unidade);
    - `testeProdutoNaoCadastrado`;
    - `testeForaDoFormato`;
    - `isolamentoPorEmpresa` (a configuração e o teste não enxergam outra empresa).
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `./mvnw -q verify`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): configuracao e leitura da etiqueta de balanca`.

### Task 4: Busca por número e código + fechamento do backend

**Files:**
- Modify: `catalog/listagem/FiltroDeProdutos.java` (`Long termoNumerico`, nulo quando o termo não é só dígitos ou passa de 18 dígitos), `ConsultaDeProdutos.java` (dentro do OR da busca, `OR p.numero = :termoNumerico OR p.codigo = :termoNumerico`, como fragmento fixo, só quando há `termoNumerico`), `ProdutoService` (montar o `termoNumerico` a partir do termo sem espaços e sem zeros à esquerda) e a OpenAPI
- Test: `ConsultaDeProdutosIT` e `ListagemDeProdutosIT`

- [ ] **Step 1:** escrever os testes:
  - `buscaPorCodigoComESemZeros` ("542", "0542" e "000542" encontram o produto de código 542);
  - `buscaPeloNumero` ("15" encontra o produto nº 15);
  - `termoNumericoTambemBuscaTextoECodigoDeBarras`;
  - `termoNaoNumericoNaoUsaNumero`;
  - `termoComMaisDe18DigitosNaoQuebra`.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `./mvnw verify` e reportar as linhas "Tests run" reais.
- [ ] **Step 5:** commit `feat(produtos): busca por numero e codigo do produto`.

### Task 5: Tipos e serviços do frontend + `lib/codigoProduto`

**Files:**
- Modify:
  - `frontend/src/types/produto.ts` (`numero: number`, `codigo: number | null`, `vendidoBalanca: boolean` em `Produto`; `codigo`/`vendidoBalanca` em `ProdutoRequest`);
  - `types/cliente.ts` (`numero`);
  - `test/fixturesProduto.ts` e as fixtures de cliente.
- Create:
  - `frontend/src/lib/codigoProduto.ts`, com `interpretarCodigoProduto(texto: string): number | null | 'invalido'`: vazio → null; só dígitos, até 6 depois de remover os zeros à esquerda e > 0 → número; senão → `'invalido'`;
  - `frontend/src/types/etiquetaBalanca.ts` e `frontend/src/services/etiquetaBalancaService.ts` (`buscarConfiguracaoEtiqueta()`, `salvarConfiguracaoEtiqueta(c)`, `testarEtiqueta(codigoLido, configuracao)`);
  - `frontend/src/lib/etiquetaBalanca.ts`, com o espelho do leitor (`lerEtiqueta(codigo, config)`, mesma regra da Task 3, usado no aviso do §3.4 e na prévia) e `MODELOS_DE_ETIQUETA` (os 4 modelos da spec).
- Test: `codigoProduto.test.ts`, `etiquetaBalanca.test.ts` (os mesmos casos do `LeitorEtiquetaBalancaTest`) e `etiquetaBalancaService.test.ts`

- [ ] **Step 1:** escrever os testes:
  - `interpretarCodigoProduto`: "000542" → 542, "" → null, "0" → 'invalido', "1234567" → 'invalido', "12a" → 'invalido';
  - `lerEtiqueta("2000542010000", padrão)` → `{codigoProduto: 542, tipo: 'VALOR', valor: 10}`;
  - os modelos prontos somam 13.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npm test`, `npm run lint` e `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): tipos, servicos e regras de codigo e etiqueta no frontend`.

### Task 6: Formulário do produto em tela única

**Files:**
- Create:
  - `frontend/src/features/products/secoes/AtalhosDasSecoes.tsx` (barra fixa com scroll-spy);
  - `frontend/src/features/products/secoes/useSecaoVisivel.ts` (`IntersectionObserver`);
  - `frontend/src/features/products/secoes/SecaoGeral.tsx`, `SecaoCodigos.tsx`, `SecaoPrecos.tsx`, `SecaoEstoque.tsx` e `SecaoHistorico.tsx`, renomeando e adaptando as `abas/*` atuais (remova a pasta `abas` ao final).
- Modify:
  - `features/products/ProdutoPage.tsx`: tira os Tabs; seções em `<section id="secao-…" aria-labelledby>` empilhadas;
  - `features/products/produtoFormulario.ts`: `SECOES_PRODUTO = ['geral','codigos','precos','estoque','historico']`, `CAMPOS_POR_SECAO` (com `codigo` e `vendidoBalanca` em `codigos`, e `unidadeCompraId`/`fatorConversao` em `estoque`), o `primeiroCampoComErro` na ordem das seções, o Zod do código (`interpretarCodigoProduto`), "balança exige código" e o mapeamento do servidor `codigo` → campo `codigo`.
- Test: `ProdutoPage.test.tsx` (reescrever as partes de abas) e `produtoFormulario.test.ts`

**Comportamento:**
- **Atalhos:**
  - `nav aria-label="Seções do produto"` sticky abaixo do cabeçalho;
  - cada atalho é um link `href="#secao-x"` com `onClick` que faz `scrollIntoView({behavior:'smooth', block:'start'})` e foca o título da seção (`tabIndex=-1`);
  - o ativo recebe `aria-current="true"`;
  - o badge de erros aparece por seção.
- **Erro ao salvar:** `primeiroCampoComErro` → `scrollIntoView` do campo e `focus`. Não há troca de aba.
- **Geral:** "Nº do Produto" com o `numero` na edição e "Será gerado ao salvar" no cadastro. O `CampoCodigosBarras` sai da Geral.
- **Códigos:**
  - campo "Código do produto" (texto com `inputMode="numeric"`, até 6 dígitos);
  - checkbox "Vendido na balança";
  - com a balança marcada, o código vazio e um produto em edição: botão "Usar o número do produto";
  - SKU com "Gerar automaticamente";
  - a lista de códigos de barras completa.
- **Estoque:** o bloco "Unidade e embalagem" vem da Geral.
- **Histórico:** as consultas só ficam `enabled` depois que a seção é intersectada pela primeira vez (`useSecaoVisivel`).
- **"Salvar e cadastrar outro":** foca o Nome.
- **Mantidos:** o modo leitura do OPERADOR, Ctrl+Enter e o aviso de saída.

- [ ] **Step 1:** escrever os testes (com um mock de `IntersectionObserver` em `test/setup` ou local):
  - `secoesNaOrdem`;
  - `cliqueNoAtalhoRolaEFocaOTitulo` (o mock de `scrollIntoView` foi chamado e o foco está no h2 da seção);
  - `atalhoAtivoAcompanhaASecaoVisivel`;
  - `erroNoEstoqueRolaFocaEContaNoAtalho` (Review Focus 4);
  - `erro409EmCodigoLevaASecaoCodigos`;
  - `historicoSoCarregaQuandoVisivel`;
  - `geralMostraNumeroNaEdicaoESeraGeradoNoCadastro`;
  - `geralSemCampoDeCodigoDeBarras`;
  - `codigoComZerosEnviadoComoNumero` (PATCH com `codigo: 542`);
  - `balancaSemCodigoBloqueia`;
  - `usarNumeroDoProdutoPreencheOCodigo`;
  - `unidadeEEmbalagemNaSecaoEstoque`;
  - `cadastrarOutroFocaNome`;
  - `produtoAntigoSalvaComCodigoNulo` (Review Focus 5).
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npm test`, `npm run lint` e `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): formulario do produto em tela unica com atalhos`.

### Task 7: Preços: margem e markup em todos os preços + calculadora

**Files:**
- Modify: `features/products/secoes/SecaoPrecos.tsx` e `features/products/produtoFormulario.ts`
- Test: `produtoFormulario.test.ts` e `ProdutoPage.test.tsx`

**Interfaces:**
- **Produces:**
  - `calcularPrecoPeloMarkup(custo: string, markup: string): string | null` (custo × (1 + markup/100), meio para cima; markup de 0 a 9999,99);
  - `calcularPrecoPelaMargem`, que já existe;
  - `calcularMargemMarkup`, que já existe, reaproveitada para os preços promocional e de atacado.

- [ ] **Step 1:** escrever os testes:
  - `calcularPrecoPeloMarkup('10','30')` → "13.00";
  - `('10','0')` → "10.00";
  - `('','30')` → null;
  - `('10','10000')` → null;
  - página:
    - margem e markup ao lado da promoção (R$ 8,90 com custo R$ 6,00 → "32,58%" e "48,33%");
    - o mesmo no atacado;
    - "—" sem custo;
    - a escolha "Pelo markup" calcula R$ 13,00 e "Pela margem" calcula R$ 14,29;
    - a explicação de margem e markup visível, com os exemplos da spec §5.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npm test`, `npm run lint` e `npm run typecheck`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): margem e markup em todos os precos e calculadora pelo markup`.

### Task 8: Página "Balança", lista, clientes e aviso de etiqueta

**Files:**
- Create: `frontend/src/features/catalog/EtiquetaBalancaPage.tsx` (e o teste)
- Modify:
  - `features/products/CatalogoNav.tsx` (aba "Balança", `/produtos/balanca`) e `routes/router.tsx`;
  - `features/products/listagem/TabelaProdutos.tsx` e `CardsProdutos.tsx` (linha secundária "Nº 15 · Cód. 542 · SKU");
  - `features/customers/ClientesPage.tsx` e `ClienteFormulario.tsx` (Nº no card e no formulário);
  - `features/products/CampoCodigosBarras.tsx` (o aviso do §3.4, com a configuração da etiqueta buscada via query).
- Test: `EtiquetaBalancaPage.test.tsx`, `ProdutosListaPage.test.tsx`, `ClientesPage.test.tsx` e `CampoCodigosBarras.test.tsx`

**Comportamento da página:**
- **Campos de §3.1** e o select "Modelo" (os 4 de `MODELOS_DE_ETIQUETA` e "Personalizado").
- **Prévia do formato:** "2 · CCCCCC · VVVVVV (R$, 3 casas) · sem dígito verificador" e o total de dígitos ("13 de 13").
- **Soma ≠ 13:** desabilita Salvar e mostra a mensagem.
- **"Testar etiqueta":** campo e botão que chamam `testarEtiqueta` com a configuração da tela e mostram a mensagem.
- **Salvar:** mostra o aviso com a lista de produtos afetados, quando houver.
- **OPERADOR:** campos desabilitados, sem Salvar (o teste continua disponível).

- [ ] **Step 1:** escrever os testes:
  - página:
    - abre com o padrão;
    - o modelo preenche os campos;
    - a prévia;
    - soma ≠ 13 desabilita Salvar;
    - o teste mostra "Produto 542 · …";
    - o salvar com afetados mostra o aviso;
    - OPERADOR só lê;
  - CatalogoNav com a aba "Balança";
  - lista: "Nº 15 · Cód. 542" na tabela e nos cards;
  - clientes: "Nº 12" no card e no formulário;
  - código de barras `2000542010000` com a configuração padrão mostra o aviso de etiqueta e continua podendo ser adicionado.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npm run lint`, `npm run typecheck`, `npm test` e `npm run build`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): pagina de etiqueta de balanca, numero na lista e em clientes`.

### Task 9 (CTO): integração e documentação
- [ ] Aplicar a V11 no dev com backup antes, conferindo antes e depois (30 produtos numerados 1..30, clientes numerados, `numeracoes` com os máximos).
- [ ] Smoke da API:
  - cadastro gera o próximo número;
  - código repetido → 409;
  - balança sem código → 400;
  - configuração padrão;
  - teste `2000542010000` → produto 542 (depois de pôr o código 542 num produto de teste);
  - busca por "0542".
- [ ] Navegador:
  - tela única com os atalhos;
  - erro rolando até o campo;
  - a seção Códigos com balança e o atalho "Usar o número";
  - a calculadora pelo markup;
  - a aba Balança com o teste da etiqueta;
  - a lista com Nº e código;
  - Clientes com Nº.
- [ ] Atualizar o status da spec, `produtos.md`, `docs/modules/README.md`, os READMEs, `clientes.md` (número), a dívida técnica e a memória.
- [ ] Rodar `./mvnw verify`, `npm run lint && npm run typecheck && npm test && npm run build` e `git status`.
