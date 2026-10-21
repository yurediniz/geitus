# Fase B — Identificação do produto e formulário em abas — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Executado pelo **fluxo do CTO** (`back-end-executor` / `front-end-executor` + revisores). Steps usam checkbox (`- [ ]`).

**Goal:** Múltiplos códigos de barras validados, nome curto, SKU sugerido, marca/fornecedor com autocomplete, exclusão de produto, UUID público do produto e formulário em página própria com abas — com a migration V7 limpando as colunas antigas.

**Architecture:** Backend em `catalog`: regra pura `CodigoBarras` (formato + dígito GS1), entidade filha `ProdutoCodigoBarras` (coleção do `Produto`, `orphanRemoval`), novos endpoints no `ProdutoController`. Frontend: a `ProdutosPage` monolítica vira `ProdutosListaPage` + `ProdutoPage` (rotas `/produtos/novo` e `/produtos/:id`) com abas Radix e um componente por aba; `useBlocker` protege alterações não salvas.

**Tech Stack:** Java 21, Spring Boot 3.5, Flyway, PostgreSQL 16, JUnit 5 + Mockito + Testcontainers; React 19 + TS, React Router 7 (data router), Tailwind v4, shadcn/ui sobre `radix-ui` (Tabs/Dialog/Popover já disponíveis), RHF + Zod, TanStack Query, Vitest.

**Spec:** [`docs/modules/produtos-identificacao-e-formulario.md`](../../modules/produtos-identificacao-e-formulario.md) · DEC-032 · Design: [`../specs/2026-10-21-produtos-fase-b-design.md`](../specs/2026-10-21-produtos-fase-b-design.md)

## Global Constraints

- **Migration nova: `V7__produtos_identificacao.sql`**; V1–V6 intactas (V6 já aplicada no `geitus_db`). Backup do `geitus_db` antes do primeiro boot com a V7 (feito pelo CTO).
- Códigos de barras: 0–20 por produto, `VARCHAR(50)`, sem espaços, únicos por empresa (`uq_codigo_barras_empresa`); formatos `EAN8` | `UPCA` | `EAN13` | `OUTRO` (só dígitos e tamanho 8/12/13 → EAN8/UPCA/EAN13 com dígito GS1 mod 10 obrigatório; demais → `OUTRO`).
- Mensagens fixas (literais):
  - dígito inválido: `"Código de barras {codigo} com dígito verificador inválido. Confira a leitura."`
  - código em outro produto (409): `"O código de barras {codigo} já está cadastrado no produto \"{nome}\"."`
  - repetido no envio: `"Código de barras repetido na lista."`
  - mais de 20: `"Informe no máximo 20 códigos de barras."`
  - exclusão bloqueada (409): `"Este produto já teve movimentação e não pode ser excluído. Inative-o para que não apareça na venda."`
  - aviso de formato (frontend): `"Formato não reconhecido (não é EAN-8, EAN-13 nem UPC-A). Confira antes de salvar."`
- SKU sugerido: `P` + 6 dígitos (`P000001`), maior `^P[0-9]{6,}$` da empresa + 1; sem reserva.
- Nome curto: até 30; `nomeCurtoEfetivo` = nome curto ou `nome.substring(0, min(30, len)).strip()`.
- Sugestões: `campo` ∈ {`marca`, `fornecedor`}; até 10 distintos da empresa, ordem por frequência desc e depois alfabética (`lower`); termo até 50.
- **UUID público do produto** nas rotas; nenhum id numérico na resposta. RBAC (DEC-025): escrita/sugestão de SKU/DELETE → ADMIN; GET e sugestões → autenticado.
- Sem dependência nova. Commits pequenos em pt-BR com `Co-Authored-By`.
- Revisores obrigatórios: `data-reviewer` (Task 1) e `security-reviewer` (Task 2).

## Review Focus

1. **Produto migrado com código EAN-13 de dígito inválido (gravado como `OUTRO`) editado sem mexer no código** → salva normalmente; o código antigo é mantido como `OUTRO`. Só um código **novo** com dígito inválido é bloqueado. → Task 2 (service + IT) e Task 4 (tela não bloqueia código já gravado).
2. **Leitor de código de barras** digitando o código + Enter no campo "Adicionar código" → adiciona o código e **não** envia o formulário; espaços/quebra de linha nas pontas são removidos. → Task 4.
3. **Mesmo código em produtos de empresas diferentes** → permitido; o 409 nunca revela nome de produto de outra empresa. → Task 2.
4. **"Salvar e cadastrar outro" com erro (400/409)** → não limpa o formulário nem perde o que foi digitado. → Task 3.
5. **Aviso de alterações não salvas** não aparece depois de salvar com sucesso, nem para o OPERADOR em modo leitura, nem ao trocar de aba dentro da página. → Task 3.

---

## Backend

### Task 1: Migration V7 + teste de migração

**Files:**
- Create: `backend/src/main/resources/db/migration/V7__produtos_identificacao.sql`
- Test: `backend/src/test/java/com/geitus/app/catalog/MigracaoV7IT.java`

**Interfaces:**
- Produces (schema, conforme spec §3): `produtos.uuid UUID NOT NULL` + `uq_produto_uuid`, `produtos.nome_curto VARCHAR(30)`, `produtos.fornecedor VARCHAR(100)`, `uq_produto_empresa_id UNIQUE (empresa_id, id)`; tabela `produto_codigos_barras (id, empresa_id, produto_id, codigo, formato, ordem, criado_em)` com `fk_codigo_barras_produto FOREIGN KEY (empresa_id, produto_id) REFERENCES produtos (empresa_id, id) ON DELETE CASCADE`, `uq_codigo_barras_empresa UNIQUE (empresa_id, codigo)`, `ck_codigo_barras_codigo CHECK (codigo = btrim(codigo) AND codigo <> '' AND position(' ' in codigo) = 0)`, `ck_codigo_barras_formato CHECK (formato IN ('EAN8','UPCA','EAN13','OUTRO'))`, `ck_codigo_barras_ordem CHECK (ordem >= 0)`, `idx_codigo_barras_produto (produto_id)`; remoção de `produtos.codigo_barras`, `produtos.categoria`, `produtos.unidade` e `uq_produto_empresa_codigo_barras`.

- [ ] **Step 1: `MigracaoV7IT`** no molde do `MigracaoV6IT` (Flyway programático `target("6")` → dados via JDBC → `target("7")`). Testes:
  - `codigoAntigoViraCodigoNaTabelaComFormato` — `7891000315507` → `EAN13`; `96385074` → `EAN8`; `036000291452` → `UPCA`; `7891000315508` (dígito errado) → `OUTRO`; `ABC-123` → `OUTRO`; todos com `ordem = 0`. *(Review Focus 1: dado migrado preservado)*
  - `codigoComEspacosInternosENormalizado` — `" 789 1000 315507 "` vira `7891000315507` `EAN13`.
  - `produtoSemCodigoFicaSemCodigos` — `null`/`""` → nenhuma linha.
  - `uuidsPreenchidosEUnicos` — todos os produtos com `uuid` não nulo e distintos.
  - `colunasAntigasRemovidas` — `information_schema.columns` não tem `codigo_barras`, `categoria`, `unidade` em `produtos`.
  - `isolamentoPorEmpresa` — o mesmo código em duas empresas → uma linha em cada; vínculos na empresa certa.
  - `constraintsNovas` — código duplicado na empresa → violação; formato inválido → violação; código com espaço → violação; `DELETE` do produto apaga os códigos (cascade); código apontando produto de outra empresa → violação (FK composta).
- [ ] **Step 2:** `cd backend && ./mvnw -Dtest=NONE -Dsurefire.failIfNoSpecifiedTests=false -Dit.test=MigracaoV7IT verify` → FAIL.
- [ ] **Step 3: V7** — SQL puro, comentado no estilo da V6. Detecção de formato em SQL: `codigo ~ '^[0-9]+$'` e `length` 8/12/13 + dígito GS1 calculado (função SQL temporária `pg_temp.gs1_valido(text)` ou expressão com `generate_series`); se o dígito não confere → `OUTRO`. Normalização: `regexp_replace(codigo_barras, '\s', '', 'g')`.
- [ ] **Step 4:** comando do Step 2 → `Tests run: 7, Failures: 0`. `./mvnw verify` completo **vai falhar** (entidade `Produto` ainda mapeia `codigo_barras`) — esperado até a Task 2; registrar.
- [ ] **Step 5:** CTO aciona **`data-reviewer`**. **Step 6: Commit** `feat(produtos): migration V7 com codigos de barras, uuid e remocao das colunas antigas`.

### Task 2: Códigos de barras, identificação, exclusão e API

**Files:**
- Create: `backend/src/main/java/com/geitus/app/catalog/CodigoBarras.java` (regra pura), `catalog/ProdutoCodigoBarras.java` (entidade), `catalog/FormatoCodigoBarras.java` (enum `EAN8, UPCA, EAN13, OUTRO`), `catalog/dto/CodigoBarrasResponse.java`
- Modify: `catalog/Produto.java`, `ProdutoService.java`, `ProdutoController.java`, `ProdutoRepository.java`, `dto/ProdutoRequest.java`, `dto/ProdutoResponse.java`, `config/SecurityConfig.java`
- Test: `CodigoBarrasTest.java` (novo), `ProdutoServiceTest.java`, `ProdutoControllerTest.java`, `ProdutoResponseTest.java`, `ProdutoRepositoryIT.java`, `CatalogoServiceIT.java`, `MigracaoV6IT` intocado

**Interfaces:**
- Produces:
  - `CodigoBarras`: `static String normalizar(String)` (remove todo espaço em branco; `null`/vazio → `null`), `static FormatoCodigoBarras detectarFormato(String normalizado)` (só dígitos e 8/12/13 → candidato; o formato é atribuído só se o dígito conferir, senão `OUTRO`), `static boolean digitoVerificadorValido(String digitos)` (GS1 mod 10: pesos 3/1 da direita para a esquerda excluindo o verificador), `static boolean ehCandidatoGs1(String normalizado)` (só dígitos e tamanho 8/12/13).
  - `ProdutoCodigoBarras(Produto produto, String codigo, FormatoCodigoBarras formato, int ordem)`; getters; `@ManyToOne(optional=false)` produto, `empresa` copiada do produto (coluna `empresa_id`, `updatable=false`).
  - `Produto`: `UUID uuid` (gerado no construtor, `updatable=false`), `nomeCurto`, `fornecedor`, `@OneToMany(mappedBy="produto", cascade=ALL, orphanRemoval=true) @OrderBy("ordem") List<ProdutoCodigoBarras> codigosBarras`; `void substituirCodigos(List<ProdutoCodigoBarras>)`; remove `codigoBarras`; `String nomeCurtoEfetivo()`.
  - `ProdutoRequest`: + `@Size(max=30) String nomeCurto`, `@Size(max=100) String fornecedor`, `@Size(max=20, message="Informe no máximo 20 códigos de barras.") List<@Size(max=50) String> codigosBarras`; − `codigoBarras`.
  - `ProdutoResponse`: `UUID id` (= uuid), + `nomeCurto`, `nomeCurtoEfetivo`, `fornecedor`, `List<CodigoBarrasResponse> codigosBarras` (`record CodigoBarrasResponse(String codigo, FormatoCodigoBarras formato)`), `boolean podeExcluir`; − `codigoBarras`.
  - `ProdutoService` (assinaturas públicas com `UUID produtoId`): `cadastrarParaUsuario(Long, ProdutoRequest)`, `atualizarDadosBasicosParaUsuario(Long, UUID, ProdutoRequest)`, `inativarParaUsuario(Long, UUID)`, `reativarParaUsuario(Long, UUID)`, `buscarPorIdParaUsuario(Long, UUID)`, `listarParaUsuario(Long, String busca, Boolean ativo)`, **`excluirParaUsuario(Long, UUID)`**, **`String sugerirSkuParaUsuario(Long)`**, **`List<String> sugestoesParaUsuario(Long, String campo, String termo)`**, **`boolean podeExcluir(Produto)`** (hoje sempre `true`; package-visible para teste com spy/subclasse; Javadoc: ponto de extensão das Fases C/D).
  - `ProdutoRepository`: `Optional<Produto> findByUuidAndEmpresa_Id(UUID, Long)` (com `JOIN FETCH` de unidade/categoria/compra e `LEFT JOIN FETCH codigosBarras` onde couber, ou `@EntityGraph`); `Optional<String> produtoComCodigo(Long empresaId, String codigo, Long ignorarProdutoId)` (nome do produto que já tem o código; `ignorarProdutoId` nulo no cadastro); `List<String> skusNoPadrao(Long empresaId)` (nativa `sku ~ '^P[0-9]{6,}$'`) **ou** `Optional<Long> maiorNumeroSku(Long empresaId)`; `List<String> sugestoes(Long empresaId, String coluna, String termo, int limite)` (duas queries nativas fixas — `marca` e `fornecedor` — **nunca** concatenar o nome da coluna); busca: `buscarPorEmpresaComBusca` passa a casar nome, nome curto, SKU e `EXISTS` em códigos (`LIKE` com `ESCAPE '\'` e padrão escapado no service, como em Clientes).
  - Rotas: `GET/PATCH/DELETE /api/produtos/{id}` (UUID), `PATCH /api/produtos/{id}/inativar|reativar`, `GET /api/produtos/sku/sugestao` → `{ "sku": "P000031" }` (`record SkuSugestaoResponse(String sku)`), `GET /api/produtos/sugestoes?campo=&termo=` → `List<String>`; campo inválido → 400 `"Campo de sugestão inválido."`; DELETE → 204.
  - `SecurityConfig` (antes do matcher GET de produtos): `GET /api/produtos/sku/sugestao` → ADMIN; `DELETE /api/produtos/**` → ADMIN.

- [ ] **Step 1: Testes primeiro.**
  - `CodigoBarrasTest`: válidos `7891000315507` (EAN13), `96385074` (EAN8), `036000291452` (UPCA); inválidos com último dígito trocado (`7891000315508`, `96385075`, `036000291453`) → candidatos GS1 com dígito inválido; `12345678901234` (14), `123456789` (9), `ABC123` → `OUTRO`; `normalizar(" 7891 000315507\n")` → `"7891000315507"`; `normalizar("  ")` → `null`.
  - `ProdutoServiceTest`:
    - `codigoNovoComDigitoInvalidoLanca400ComMensagemFixa`;
    - `codigoJaGravadoComoOutroEMantidoAoEditar` — produto com código `7891000315508` gravado `OUTRO`; PATCH com a mesma lista → salva, formato continua `OUTRO` *(Review Focus 1)*;
    - `codigoFormatoDesconhecidoAceitoComoOutro`;
    - `codigoEmOutroProdutoDaEmpresaLanca409ComNome`;
    - `codigoRepetidoNoEnvioLanca400`;
    - `maisDe20CodigosLanca400` (defesa além do Bean Validation);
    - `patchSubstituiListaDeCodigosNaOrdem`;
    - `nomeCurtoEfetivoUsaNomeCurtoOuTrunca` — com nome curto `"Golden Frango 15kg"` → ele mesmo; sem nome curto e nome `"Ração Golden Adulto Frango e Arroz 15kg"` → `"Ração Golden Adulto Frango e A"` (30 caracteres); nome `"Arroz 5kg"` → `"Arroz 5kg"`;
    - `sugerirSkuUsaMaiorDoPadraoMaisUm` (`P000001`, `P000007`, `ABC`, `p000009` → `P000008`), `sugerirSkuSemPadraoComecaEmP000001`, `sugerirSkuAcimaDe999999` (`P999999` → `P1000000`);
    - `sugestoesCampoInvalidoLanca400`;
    - `excluirRemoveQuandoPodeExcluir`, `excluirBloqueadoLanca409ComMensagemFixa` (sobrescrevendo `podeExcluir` → `false`), `excluirDeOutraEmpresaLanca404`.
  - `ProdutoControllerTest`: rotas por UUID (id numérico ausente: `$.id` é UUID e não há campo numérico); UUID malformado → 400; `DELETE` ADMIN → 204, OPERADOR → 403; `GET /sku/sugestao` ADMIN → 200, OPERADOR → 403; `GET /sugestoes?campo=marca` autenticado → 200, `campo=x` → 400; `codigosBarras` com 21 itens → 400 com `campos`.
  - `ProdutoRepositoryIT`: `codigoUnicoPorEmpresaPermiteMesmoCodigoEmOutraEmpresa` *(Review Focus 3)*; `buscaEncontraPorQualquerCodigo` (segundo código da lista); `buscaPorNomeCurto`; `buscaTrataPercentualESublinhadoComoLiterais`; `sugestoesDistintasPorFrequencia` (marcas `Golden`×3, `golden`×1, `Premier`×1 → `["Golden", "Premier"]` com grafia do mais usado); `sugestoesIsolamPorEmpresa`; `maiorNumeroSkuDaEmpresa`.
  - `CatalogoServiceIT`: `excluirProdutoApagaCodigos` (conta linhas em `produto_codigos_barras` antes/depois com JDBC); `produtoComCodigoOutroMigradoEditadoSemMudar` (insere via JDBC um código `OUTRO` de 13 dígitos inválidos e edita pelo service) *(Review Focus 1)*.
- [ ] **Step 2:** `./mvnw test -Dtest='CodigoBarras*,Produto*'` → FAIL.
- [ ] **Step 3: Implementar.** Regras do service, na ordem: normalizar a lista (descartar vazios) → repetidos no envio (400) → > 20 (400) → para cada código: se já existe **neste produto** com o mesmo texto, manter o formato gravado; senão `detectarFormato` e, se `ehCandidatoGs1` e dígito inválido → 400 → unicidade na empresa (`produtoComCodigo` ignorando o próprio produto) → 409 com o nome. `podeExcluir` documentado como ponto de extensão. `ProdutoResponse` sem campo numérico. `sugestoes`: termo aparado, até 50, sem termo = top 10.
- [ ] **Step 4:** `./mvnw verify` inteiro → verde (incl. `MigracaoV7IT`).
- [ ] **Step 5:** CTO: backup do `geitus_db`, smoke real (V7 aplicada; códigos migrados; sugestão de SKU; sugestões de marca; DELETE; busca por código) e **`security-reviewer`** + **`back-end-reviewer`**.
- [ ] **Step 6: Commit** `feat(produtos): codigos de barras multiplos, nome curto, sku sugerido, exclusao e uuid publico`.

---

## Frontend

### Task 3: Base, rotas e página do produto com abas

**Files:**
- Create: `frontend/src/lib/codigoBarras.ts` (+ test), `frontend/src/components/ui/tabs.tsx`, `frontend/src/components/ui/native-select.tsx`, `frontend/src/features/products/ProdutosListaPage.tsx` (+ test), `frontend/src/features/products/ProdutoPage.tsx` (+ test), `frontend/src/features/products/produtoFormulario.ts` (+ test), `frontend/src/features/products/abas/AbaGeral.tsx`, `AbaPrecos.tsx`, `AbaEstoque.tsx`, `AbaCodigos.tsx` (esqueleto com SKU; lista de códigos na Task 4), `frontend/src/features/products/useAvisoAlteracoesNaoSalvas.ts`
- Modify: `frontend/src/types/produto.ts`, `frontend/src/services/produtoService.ts` (+ test), `frontend/src/routes/router.tsx`
- Delete: `frontend/src/features/products/ProdutosPage.tsx` e `ProdutosPage.test.tsx` (conteúdo migrado; os testes viram os de `ProdutosListaPage`/`ProdutoPage`)

**Interfaces:**
- Consumes: contrato da Task 2.
- Produces:
  - Tipos: `Produto.id: string` (UUID), `nomeCurto: string | null`, `nomeCurtoEfetivo: string`, `fornecedor: string | null`, `codigosBarras: { codigo: string; formato: 'EAN8' | 'UPCA' | 'EAN13' | 'OUTRO' }[]`, `podeExcluir: boolean`, sem `codigoBarras`; `ProdutoRequest` com `nomeCurto`, `fornecedor`, `codigosBarras: string[]`.
  - `produtoService`: `buscarProduto(id: string)`, `atualizarProduto(id: string, dados)`, `inativarProduto(id: string)`, `reativarProduto(id: string)`, **`excluirProduto(id: string)`** (`apiDelete`), **`sugerirSku(): Promise<string>`**, **`listarSugestoes(campo: 'marca' | 'fornecedor', termo: string): Promise<string[]>`**.
  - `lib/codigoBarras.ts`: `normalizarCodigo(s: string): string`, `detectarFormato(s: string): 'EAN8' | 'UPCA' | 'EAN13' | 'OUTRO'`, `ehCandidatoGs1(s: string): boolean`, `digitoVerificadorValido(s: string): boolean` — mesmos casos do `CodigoBarrasTest`.
  - `produtoFormulario.ts`: schema Zod `produtoSchema`, `valoresIniciais(unidadePadraoId?: string)`, `valoresDoProduto(p: Produto)`, `montarRequest(v): ProdutoRequest`, `CAMPOS_POR_ABA: Record<'geral' | 'precos' | 'estoque' | 'codigos', (keyof ProdutoFormValues)[]>` (usado para o indicador de erro por aba).
  - `useAvisoAlteracoesNaoSalvas(ativo: boolean)` → `{ dialogo: ReactNode }`: usa `useBlocker(({ currentLocation, nextLocation }) => ativo && currentLocation.pathname !== nextLocation.pathname)` + `beforeunload` quando `ativo`; diálogo "Descartar alterações?" com "Continuar editando" / "Descartar".
  - `Tabs` shadcn sobre `radix-ui` (`Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`); `NativeSelect` (select estilizado com os tokens do `Input`, `aria-invalid`).

Comportamento (spec §6):
- **Rotas:** `produtos` → `ProdutosListaPage`, `produtos/novo` e `produtos/:id` → `ProdutoPage` (antes de `produtos/categorias` não colidir: declarar `categorias` e `unidades` antes de `:id`).
- **Lista:** busca e status em `useSearchParams` (`?busca=&status=`); "Novo produto" → `/produtos/novo`; "Editar" → `/produtos/{id}`; a mensagem de sucesso vinda da página do produto chega por `location.state` e aparece no feedback sticky.
- **Página:** cabeçalho (nome ou "Novo produto", "← Voltar para produtos", selo de status); abas Geral/Preços/Estoque/Códigos com os campos já existentes redistribuídos como na spec §6.2 (Geral inclui o grupo "Unidade e embalagem"; Códigos tem o SKU; a lista de códigos e o "Gerar automaticamente" entram na Task 4 — já reserve o lugar); indicador de erro por aba (`CAMPOS_POR_ABA`) e, ao salvar com erro, ativar a primeira aba com erro e focar o campo; "Salvar" → navega para `/produtos` com sucesso; "Salvar e cadastrar outro" (só no novo) → reseta mantendo `unidadeId`, `categoriaId`, `marca`, `fornecedor`, foco no Nome — **só em caso de sucesso** *(Review Focus 4)*; aviso de alterações não salvas ativo quando `isDirty && !salvandoComSucesso && !somenteLeitura` *(Review Focus 5)*; OPERADOR: campos `disabled`, sem botões de escrita.
- [ ] **Step 1: Testes:** `codigoBarras.test.ts` (mesmos casos do backend); `produtoService.test.ts` (rotas por UUID, DELETE, `sku/sugestao`, `sugestoes?campo=marca&termo=gol`); `ProdutosListaPage.test.tsx` (estado na URL preservado ao montar com `?busca=arroz&status=inativos`; navegação de Novo/Editar; sucesso vindo de `location.state`); `ProdutoPage.test.tsx` (abas e teclado; erro de preço → aba Preços marcada e ativada ao salvar; Salvar navega; "Salvar e cadastrar outro" mantém unidade/categoria/marca/fornecedor e foca Nome; com 409 não reseta *(RF4)*; aviso ao clicar em "Voltar" com alteração e "Descartar" navega; sem aviso após salvar e para OPERADOR *(RF5)*; trocar de aba não dispara aviso; OPERADOR em modo leitura). Migrar os testes úteis do antigo `ProdutosPage.test.tsx` (unidade/categoria/conversão, UN pré-selecionada, inativas na edição).
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `lint`, `typecheck`, `test`, `build`.
- [ ] **Step 5: Commit** `refactor(produtos): pagina propria do produto com abas e lista com estado na url`.

### Task 4: Códigos, SKU, sugestões, nome curto e exclusão

**Files:**
- Create: `frontend/src/features/products/CampoCodigosBarras.tsx` (+ test), `frontend/src/features/products/CampoSugestao.tsx` (+ test)
- Modify: `abas/AbaCodigos.tsx`, `abas/AbaGeral.tsx`, `ProdutoPage.tsx` (+ test)

**Interfaces:**
- Consumes: Task 3 (`lib/codigoBarras.ts`, `produtoService`, `produtoFormulario.ts`).
- Produces: `CampoCodigosBarras` props `{ valor: string[]; formatosGravados: Record<string, 'EAN8' | 'UPCA' | 'EAN13' | 'OUTRO'>; onChange(v: string[]): void; desabilitado?: boolean; erro?: string }`; `CampoSugestao` props `{ id: string; rotulo: string; campo: 'marca' | 'fornecedor'; valor: string; onChange(v: string): void; desabilitado?: boolean; maxLength: number }` (combobox com debounce 250 ms, padrão ARIA combobox/listbox, aceita valor novo livre).

Comportamento:
- **Códigos:** campo "Adicionar código" — **Enter adiciona e não envia o formulário** *(Review Focus 2)*; normaliza; ignora vazio; impede repetido ("Este código já está na lista."); máximo 20; cada item mostra o código, selo do formato (`EAN-13`, `EAN-8`, `UPC-A`, `Outro formato`), aviso de `OUTRO` (texto fixo), botão remover e setas ↑/↓ para reordenar (rótulos acessíveis com o código); **candidato GS1 com dígito inválido**: bloqueia a adição com `"Dígito verificador inválido. Confira a leitura."` — **exceto** se o código já estava gravado no produto (`formatosGravados[codigo] === 'OUTRO'`) *(Review Focus 1)*; 409/400 do backend sobre códigos aparece na aba Códigos (com indicador).
- **SKU:** botão "Gerar automaticamente" (ADMIN) chama `sugerirSku()` e preenche; 409 de SKU ao salvar orienta "Gere outro SKU ou informe um diferente.".
- **Marca e Fornecedor principal:** `CampoSugestao`.
- **Nome curto:** contador `n/30` e prévia "No cupom: {efetivo}" (calculada no front com a mesma regra).
- **Excluir:** botão no cabeçalho (ADMIN e `podeExcluir`); diálogo "Excluir {nome}?" com texto "Esta ação não pode ser desfeita. Os códigos de barras do produto também serão excluídos."; sucesso → `/produtos` com mensagem "Produto excluído."; 409 → mensagem do backend no diálogo.
- [ ] **Step 1: Testes:** Enter no campo de código adiciona e não chama `cadastrarProduto` *(RF2)*; código com espaços normalizado; repetido bloqueado; 21º bloqueado; selo de formato; aviso de `OUTRO`; dígito inválido bloqueado, mas código gravado `OUTRO` mantido ao editar e salvar *(RF1)*; reordenar envia a nova ordem; Gerar SKU preenche; `CampoSugestao` sugere e aceita valor novo; prévia do nome curto; excluir com confirmação e 409.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `lint`, `typecheck`, `test`, `build`.
- [ ] **Step 5:** CTO: verificação no navegador + `front-end-reviewer` e `product-ux-reviewer`.
- [ ] **Step 6: Commit** `feat(produtos): codigos de barras, sku sugerido, autocomplete, nome curto e exclusao na pagina do produto`.

---

### Task 5: Fechamento
- [ ] `./mvnw verify` + validação completa do frontend (evidência do CTO); `qa-reviewer` (spec §8 + Review Focus).
- [ ] Docs: spec → implementado (com ajustes das revisões); `produtos.md`; READMEs (V7, endpoints novos, rotas `/produtos/novo` e `/produtos/:id`); fechar DT-017 para Produtos.
- [ ] Commit `docs(produtos): atualiza specs e READMEs com a Fase B implementada`; `git status` limpo; relatório; integração na `develop` após confirmação.
