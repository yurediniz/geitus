# Incremento cadastral do Produto — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Executado pelo **fluxo do CTO** (dispatch de `back-end-executor` e `front-end-executor` + revisores). Steps usam checkbox (`- [ ]`).

**Goal:** Adicionar ao Produto os campos `marca`, `descricao`, `estoque_maximo`, `ponto_reposicao`, `preco_minimo` (migration V4 aditiva) e os derivados `margem`/`markup` (sem coluna), com validações não-negativas e cruzadas, no backend e no frontend.

**Architecture:** Migration V4 append-only adiciona colunas nullable à tabela `produtos`; a entidade e os DTOs ganham os campos; o service normaliza/valida; a `ProdutoResponse` calcula margem/markup. O frontend soma os campos ao formulário (comuns + bloco avançado) e exibe os derivados na lista. Nada de status-enum, fiscal, variações, lote/série ou multi-estoque.

**Tech Stack:** Java 21, Spring Boot 3.5, Flyway, PostgreSQL, JUnit + Testcontainers; React 19, TS, Vite, Tailwind v4, shadcn/ui, RHF + Zod, TanStack Query, Vitest.

**Spec canônica:** [`docs/modules/produtos.md`](../../modules/produtos.md). **Design:** [`docs/superpowers/specs/2026-07-24-produtos-incremento-cadastral-design.md`](../specs/2026-07-24-produtos-incremento-cadastral-design.md).

## Global Constraints

- **Migrations append-only:** V1/V2/V3 intactas; a nova é **V4**. Todas as colunas novas são **nullable** (sem recriar o banco). `ddl-auto: validate` deve continuar passando.
- **Isolamento por empresa (DEC-016):** empresa sempre do usuário autenticado (`idUsuario` do JWT); nunca `empresaId` externo. Não muda nada aqui.
- **RBAC (DEC-025):** escrita (POST/PATCH) exige ADMIN; leitura livre. Não muda; os novos campos entram nos endpoints existentes.
- **Unicidade/conflito (DEC-026):** SKU/código de barras duplicado → 409. Não muda.
- **Dinheiro/quantidade:** `BigDecimal` exato; `preco_minimo` `NUMERIC(12,2)`; `estoque_maximo`/`ponto_reposicao` `NUMERIC(12,3)`. Nunca ponto flutuante.
- **Normalização:** texto em branco/vazio → `null` com trim (idiom `normalizarOuNulo` já existente no `ProdutoService`).
- **DTOs:** entidade JPA nunca exposta. **Git:** branch `develop`; commits pt-BR; commits pequenos.
- **Fora do escopo:** status-enum (fica o booleano `ativo`), fiscal, variações, lote/série/validade, multi-estoque, tabelas de preço/promoções, imagem/upload, peso/dimensões, marca/categoria como entidade, múltiplos códigos/GTIN/PLU.

---

## Backend

### Task B1 — Migration V4 + entidade + DTOs (campos brutos)

**Files:**
- Create: `backend/src/main/resources/db/migration/V4__produtos_incremento_cadastral.sql`
- Modify: `backend/src/main/java/com/geitus/app/catalog/Produto.java`
- Modify: `backend/src/main/java/com/geitus/app/catalog/dto/ProdutoRequest.java`
- Modify: `backend/src/main/java/com/geitus/app/catalog/dto/ProdutoResponse.java`
- Test: `backend/src/test/java/com/geitus/app/catalog/ProdutoRepositoryIT.java` (novo caso de persistência dos campos)

**Interfaces:**
- Produces: `Produto` com getters `getMarca()`, `getDescricao()`, `getEstoqueMaximo()`, `getPontoReposicao()`, `getPrecoMinimo()`; `atualizarDadosBasicos(...)` com os 5 novos parâmetros ao final; `ProdutoRequest` com os campos `marca`, `descricao`, `estoqueMaximo`, `pontoReposicao`, `precoMinimo`; `ProdutoResponse` com os mesmos campos brutos.

- [ ] **Step 1: Migration V4.** Criar o arquivo com:

```sql
-- V4: incremento cadastral do Produto (marca, descricao e hints de estoque/preco).
-- Colunas nullable, append-only (V1/V2/V3 intactas). Ver docs/modules/produtos.md.
ALTER TABLE produtos
    ADD COLUMN marca            VARCHAR(100),
    ADD COLUMN descricao        VARCHAR(1000),
    ADD COLUMN estoque_maximo   NUMERIC(12,3),
    ADD COLUMN ponto_reposicao  NUMERIC(12,3),
    ADD COLUMN preco_minimo     NUMERIC(12,2);

ALTER TABLE produtos
    ADD CONSTRAINT ck_produto_estoque_maximo_nao_negativo  CHECK (estoque_maximo  IS NULL OR estoque_maximo  >= 0),
    ADD CONSTRAINT ck_produto_ponto_reposicao_nao_negativo CHECK (ponto_reposicao IS NULL OR ponto_reposicao >= 0),
    ADD CONSTRAINT ck_produto_preco_minimo_nao_negativo    CHECK (preco_minimo    IS NULL OR preco_minimo    >= 0);
```

- [ ] **Step 2: Entidade.** Em `Produto.java`, adicionar os campos com `@Column` correspondente (`marca` length 100; `descricao` length 1000; `estoque_maximo`/`ponto_reposicao` precision 12 scale 3; `preco_minimo` precision 12 scale 2), os getters, e incluir os 5 campos **ao final** da assinatura de `atualizarDadosBasicos(...)` e do corpo (atribuindo cada um). Manter o construtor coerente se ele chama `atualizarDadosBasicos`.

- [ ] **Step 3: DTO de request.** Em `ProdutoRequest.java`, adicionar `String marca`, `String descricao`, `BigDecimal estoqueMaximo`, `BigDecimal pontoReposicao`, `BigDecimal precoMinimo` com Bean Validation: `@Size(max=100)` em marca, `@Size(max=1000)` em descricao, `@DecimalMin(value="0.0") @Digits(integer=9, fraction=3)` em estoqueMaximo/pontoReposicao, `@DecimalMin(value="0.0") @Digits(integer=10, fraction=2)` em precoMinimo (espelhar o padrão dos campos numéricos já existentes).

- [ ] **Step 4: DTO de response (campos brutos).** Em `ProdutoResponse.java`, adicionar os 5 campos e mapeá-los em `de(Produto)` a partir dos getters. (Os derivados margem/markup vêm na Task B3.)

- [ ] **Step 5: Teste de integração (IT).** Em `ProdutoRepositoryIT.java`, adicionar um teste que salva um `Produto` com os novos campos preenchidos e relê, assertando os valores persistidos (contra Postgres real, garantindo que o schema V4 e o mapeamento batem).

- [ ] **Step 6: Rodar `./mvnw verify` (Docker ativo).** Esperado: BUILD SUCCESS; a migration V4 aplica no container do IT.

- [ ] **Step 7: Commit.**

```bash
git add backend/src/main/resources/db/migration/V4__produtos_incremento_cadastral.sql \
        backend/src/main/java/com/geitus/app/catalog/Produto.java \
        backend/src/main/java/com/geitus/app/catalog/dto/ProdutoRequest.java \
        backend/src/main/java/com/geitus/app/catalog/dto/ProdutoResponse.java \
        backend/src/test/java/com/geitus/app/catalog/ProdutoRepositoryIT.java
git commit -m "feat(produtos): adiciona marca, descricao e hints de estoque/preco (V4)"
```

**Deliverable:** schema V4 + entidade + DTOs alinhados. **Portão:** `data-reviewer` (V4) **obrigatório**.

---

### Task B2 — Service: normalização + validações (não-negativas + cruzadas)

**Files:**
- Modify: `backend/src/main/java/com/geitus/app/catalog/ProdutoService.java`
- Modify: `backend/src/main/java/com/geitus/app/catalog/ProdutoController.java`
- Test: `backend/src/test/java/com/geitus/app/catalog/ProdutoServiceTest.java`

**Interfaces:**
- Consumes: `Produto.atualizarDadosBasicos(...)` (Task B1), `ProdutoRequest` (Task B1).
- Produces: `cadastrar(...)`/`atualizarDadosBasicos(...)`/`cadastrarParaUsuario(...)`/`atualizarDadosBasicosParaUsuario(...)` com os 5 novos parâmetros ao final; validações lançando `RegraDeNegocioException` (→ 400).

- [ ] **Step 1: Testes (primeiro).** Em `ProdutoServiceTest.java`, adicionar casos:
  - `estoqueMaximo`/`pontoReposicao`/`precoMinimo` negativos → `RegraDeNegocioException`.
  - **Cruzada:** `precoMinimo > precoVenda` → `RegraDeNegocioException` ("Preço mínimo não pode ser maior que o preço de venda.").
  - **Cruzada:** `estoqueMaximo < estoqueMinimo` → `RegraDeNegocioException` ("Estoque máximo não pode ser menor que o estoque mínimo.").
  - Normalização: `marca`/`descricao` com `"  "`/`""` → persistidos como `null`; valor com espaços → `trim`.
  - Feliz: cadastro/atualização com os campos válidos preserva os valores.

- [ ] **Step 2: Rodar os testes e ver falhar.** `./mvnw -B test -Dtest=ProdutoServiceTest` — Esperado: FAIL (métodos ainda não recebem os campos).

- [ ] **Step 3: Ampliar assinaturas e regras.** Em `ProdutoService.java`:
  - Adicionar os 5 parâmetros ao final de `cadastrar`, `atualizarDadosBasicos`, `cadastrarParaUsuario`, `atualizarDadosBasicosParaUsuario`, repassando à entidade.
  - `normalizarOuNulo` em `marca` e `descricao`.
  - Em `validarDadosBasicos` (ou método novo `validarCamposCadastrais`), receber os novos numéricos: rejeitar negativos; quando `precoMinimo != null && precoVenda != null && precoMinimo > precoVenda` → exceção; quando `estoqueMaximo != null && estoqueMinimo != null && estoqueMaximo < estoqueMinimo` → exceção.

- [ ] **Step 4: Controller.** Em `ProdutoController.java`, repassar `request.marca()`, `request.descricao()`, `request.estoqueMaximo()`, `request.pontoReposicao()`, `request.precoMinimo()` nas chamadas de cadastrar e atualizar.

- [ ] **Step 5: Rodar `./mvnw -B test -Dtest=ProdutoServiceTest`.** Esperado: PASS.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/main/java/com/geitus/app/catalog/ProdutoService.java \
        backend/src/main/java/com/geitus/app/catalog/ProdutoController.java \
        backend/src/test/java/com/geitus/app/catalog/ProdutoServiceTest.java
git commit -m "feat(produtos): valida e normaliza os novos campos cadastrais"
```

**Deliverable:** validações e normalização. **Portão:** `back-end-reviewer` + `qa-reviewer`.

---

### Task B3 — Derivados margem/markup na resposta

**Files:**
- Modify: `backend/src/main/java/com/geitus/app/catalog/dto/ProdutoResponse.java`
- Test: `backend/src/test/java/com/geitus/app/catalog/ProdutoResponseTest.java` (novo)

**Interfaces:**
- Produces: `ProdutoResponse` com os campos `BigDecimal margem` e `BigDecimal markup` (nullable), calculados em `de(Produto)`.

- [ ] **Step 1: Teste (primeiro).** Criar `ProdutoResponseTest.java`:
  - Produto com `precoVenda=10.00`, `custo=8.00` → `markup = 25.00` ((10−8)/8×100), `margem = 20.00` ((10−8)/10×100).
  - Produto com `custo=null` → `margem` e `markup` `null`.
  - Produto com `custo=0` → `markup` `null` (evita divisão por zero); `margem` `100.00` se `precoVenda>0`.
  - Arredondamento a 2 casas (HALF_UP).

- [ ] **Step 2: Rodar e ver falhar.** `./mvnw -B test -Dtest=ProdutoResponseTest` — Esperado: FAIL.

- [ ] **Step 3: Implementar os derivados.** Em `ProdutoResponse.java`, adicionar `margem` e `markup` ao record e calcular em `de(Produto)`:
  - `markup = custo != null && custo.signum() > 0 ? (preco − custo)/custo × 100 (setScale 2, HALF_UP) : null`.
  - `margem = custo != null && preco != null && preco.signum() > 0 ? (preco − custo)/preco × 100 (setScale 2, HALF_UP) : null`.

- [ ] **Step 4: Rodar `./mvnw -B test -Dtest=ProdutoResponseTest`.** Esperado: PASS.

- [ ] **Step 5: `./mvnw verify` completo (Docker ativo).** Esperado: BUILD SUCCESS.

- [ ] **Step 6: Commit.**

```bash
git add backend/src/main/java/com/geitus/app/catalog/dto/ProdutoResponse.java \
        backend/src/test/java/com/geitus/app/catalog/ProdutoResponseTest.java
git commit -m "feat(produtos): expõe margem e markup derivados na resposta"
```

**Deliverable:** derivados margem/markup. **Portão:** `back-end-reviewer`.

---

## Frontend

### Task F1 — Tipos + serviço

**Files:**
- Modify: `frontend/src/types/produto.ts`
- Test: `frontend/src/services/produtoService.test.ts` (ajuste se necessário)

**Interfaces:**
- Produces: `Produto` (tipo) com `marca: string | null`, `descricao: string | null`, `estoqueMaximo: number | null`, `pontoReposicao: number | null`, `precoMinimo: number | null`, `margem: number | null`, `markup: number | null`; `ProdutoRequest` com `marca`, `descricao`, `estoqueMaximo`, `pontoReposicao`, `precoMinimo` (nullable).

- [ ] **Step 1: Atualizar tipos.** Em `produto.ts`, adicionar os campos acima ao tipo `Produto` (incluindo `margem`/`markup` só-leitura) e ao `ProdutoRequest` (sem margem/markup — são derivados).

- [ ] **Step 2: Typecheck.** `npm run typecheck` — Esperado: sem erros.

- [ ] **Step 3: Commit.**

```bash
git add frontend/src/types/produto.ts frontend/src/services/produtoService.test.ts
git commit -m "feat(produtos): tipos dos novos campos e derivados"
```

**Deliverable:** contrato de tipos. **Portão:** `front-end-reviewer`.

---

### Task F2 — ProdutosPage: formulário + validação + exibição

**Files:**
- Modify: `frontend/src/features/products/ProdutosPage.tsx`
- Test: `frontend/src/features/products/ProdutosPage.test.tsx`

**Interfaces:**
- Consumes: tipos de F1; contrato do backend (B1–B3).

- [ ] **Step 1: Testes (primeiro).** Em `ProdutosPage.test.tsx`, adicionar casos:
  - Validação cruzada: preço mínimo > preço de venda mostra erro; estoque máximo < estoque mínimo mostra erro (form não submete).
  - Salvar com os novos campos preenchidos monta o request correto (marca, descricao, estoqueMaximo, pontoReposicao, precoMinimo).
  - Item da lista exibe margem/markup quando o produto tem custo; e a marca quando informada.

- [ ] **Step 2: Rodar e ver falhar.** `npm test -- ProdutosPage` — Esperado: FAIL.

- [ ] **Step 3: Schema Zod.** Adicionar ao `produtoSchema`: `marca` (texto opcional ≤100), `descricao` (texto opcional ≤1000), `precoMinimo`/`estoqueMaximo`/`pontoReposicao` (numeroOpcional não-negativo). `superRefine`: quando `precoMinimo` e `precoVenda` presentes e `Number(precoMinimo) > Number(precoVenda)` → issue em `precoMinimo`; quando `estoqueMaximo` e `estoqueMinimo` presentes e `Number(estoqueMaximo) < Number(estoqueMinimo)` → issue em `estoqueMaximo`.

- [ ] **Step 4: Formulário.** Adicionar `marca` junto de Categoria/Unidade (campos comuns). No bloco avançado "Custo e identificação", acrescentar **Preço mínimo (opcional)** (`type=number` step 0.01), **Estoque máximo (opcional)** (step 0.001), **Ponto de reposição (opcional)** (step 0.001) e **Descrição (opcional)** como `<textarea>`. Atualizar `valoresIniciais`, `valoresDoProduto` e `montarRequest` (texto→null; número→null) com os novos campos.

- [ ] **Step 5: Exibição na lista.** No `ProdutoItem`, adicionar a marca (quando houver) junto do nome/categoria; no bloco de dados, exibir **Margem** e **Markup** formatados como `X,XX%` (via `toLocaleString('pt-BR')`) quando não-nulos, e preço mínimo/estoque máximo/ponto de reposição quando informados (com "Não informado" para nulos, no padrão atual).

- [ ] **Step 6: Rodar `npm test -- ProdutosPage`.** Esperado: PASS.

- [ ] **Step 7: `npm run lint && npm run typecheck && npm test && npm run build`.** Esperado: tudo verde.

- [ ] **Step 8: Commit.**

```bash
git add frontend/src/features/products/ProdutosPage.tsx frontend/src/features/products/ProdutosPage.test.tsx
git commit -m "feat(produtos): campos cadastrais novos, validacao cruzada e margem/markup na tela"
```

**Deliverable:** tela com os novos campos + derivados. **Portão:** `front-end-reviewer` + `product-ux-reviewer`.

---

## Documentação

### Task D1 — Spec do módulo + DEC-028

**Files:**
- Modify: `docs/modules/produtos.md`
- Modify: `docs/decision-log.md`

- [ ] **Step 1: Atualizar `produtos.md`.** Na tabela do modelo de dados, adicionar as 5 colunas novas; documentar os derivados margem/markup (não são colunas); acrescentar as validações (não-negativos + cruzadas) na seção de validações; refletir os campos na seção de UX. Referenciar a migration V4.

- [ ] **Step 2: Registrar DEC-028** em `decision-log.md` (incremento cadastral do Produto alinhado à modelagem; fiscal/variações/lote/série/status-enum seguem fora do MVP).

- [ ] **Step 3: Commit.**

```bash
git add docs/modules/produtos.md docs/decision-log.md
git commit -m "docs(produtos): registra DEC-028 e o incremento cadastral"
```

**Deliverable:** documentação alinhada. **Portão:** (CTO).

---

## Ordem e paralelismo

- Backend **B1 → B2 → B3** (sequencial: B2/B3 dependem dos campos de B1). Frontend **F1 → F2** (dependem do contrato do backend; começar após B1). **D1** ao final.
- **Revisores por portão:** `data-reviewer` (V4) **obrigatório** em B1; `back-end-reviewer`/`qa-reviewer` em B2/B3; `front-end-reviewer`/`product-ux-reviewer` em F1/F2.
- **Validação final:** `./mvnw verify` (Docker) + `npm run lint/typecheck/test/build` + smoke visual (ADMIN cadastra com os novos campos; margem/markup aparecem; validação cruzada barra; OPERADOR segue em leitura).

## Self-review (cobertura da spec)

- marca/descricao → B1 (schema/DTO), B2 (normalização), F2 (form/lista). ✓
- estoque_maximo/ponto_reposicao/preco_minimo → B1, B2 (não-negativo + cruzada), F2. ✓
- margem/markup derivados → B3 (backend), F2 (exibição). ✓
- Validações cruzadas → B2 (service) + F2 (Zod). ✓
- Migration V4 aditiva + data-reviewer → B1. ✓
- Fora do escopo preservado (sem status-enum/fiscal/variações) → Global Constraints. ✓
- DEC-028 + spec do módulo → D1. ✓
