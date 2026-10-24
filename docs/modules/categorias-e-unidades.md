# Catálogo: Categorias e Unidades de medida (Fase A da evolução de Produtos)

> **Status:** implementado em 2026-10-21 (migration V6 aplicada; backend `catalog.unidade`/`catalog.categoria`; telas `/produtos/categorias` e `/produtos/unidades`). Ajustes vindos das revisões estão em §10. Primeira das 6 fases da evolução do cadastro de produtos (DEC-030); decisões de modelagem desta fase em **DEC-031**. Registro de design: [`docs/superpowers/specs/2026-10-20-produtos-fase-a-design.md`](../superpowers/specs/2026-10-20-produtos-fase-a-design.md).

## 1. Visão geral

Hoje `categoria` e `unidade` são **texto livre** no produto. Isso gera variações do mesmo valor ("Mercearia", "mercearia ", "Merc."), impede agrupar por subcategoria e não diz se o produto pode ser vendido em quantidade fracionada.

Esta fase cria dois cadastros próprios — **Unidades de medida** e **Categorias (em árvore)** — e passa o produto a referenciá-los. É a fundação das fases seguintes (filtro por categoria com descendentes na listagem, quantidade fracionada na venda, conversão de compra).

## 2. Escopo

**Inclui:**
- Cadastro de **unidades de medida** por empresa, com 10 unidades padrão.
- Cadastro de **categorias hierárquicas** por empresa (profundidade ilimitada), com mover, inativar e excluir.
- No produto: **unidade de venda** (obrigatória), **categoria** (opcional, qualquer nível), **unidade de compra + fator de conversão** (opcionais).
- **Migração** dos textos atuais de categoria e unidade para registros, sem perda nem duplicação.
- Regra de domínio **"unidade aceita quantidade fracionada?"**, pronta para o PDV (etapa 11) consumir.

**Não inclui (outras fases ou futuro):** nome curto, SKU automático e múltiplos códigos (Fase B); formulário em abas (Fase B); preços (Fase C); estoque (Fase D); filtro da listagem por categoria e busca sem acento (Fase E); imagem (Fase F); categorias com imagem, ordem manual ou atributos; conversões entre unidades além do fator de compra; unidades globais compartilhadas entre empresas.

## 3. Unidades de medida

### 3.1 Modelo — tabela `unidades_medida`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `BIGINT` identity | PK interna (DEC-015), nunca exposta |
| `uuid` | `UUID` NOT NULL UNIQUE | identificador público (DEC-019), gerado na aplicação |
| `empresa_id` | `BIGINT` NOT NULL | FK `empresa`; isolamento (DEC-016) |
| `sigla` | `VARCHAR(20)` NOT NULL | gravada **em maiúsculas**, sem espaços nas pontas; `UNIQUE (empresa_id, sigla)`; CHECK `sigla = upper(sigla)` |
| `descricao` | `VARCHAR(60)` NOT NULL | ex.: "Quilograma" |
| `fracionada` | `BOOLEAN` NOT NULL DEFAULT `false` | aceita quantidade decimal na venda |
| `ativo` | `BOOLEAN` NOT NULL DEFAULT `true` | |
| `criado_em` / `atualizado_em` | `TIMESTAMP` | padrão do projeto |

### 3.2 Unidades padrão

Toda empresa tem estas unidades (criadas pela migration para as empresas existentes e pelo código para empresas novas):

| Sigla | Descrição | Fracionada |
|---|---|---|
| UN | Unidade | não |
| KG | Quilograma | **sim** |
| G | Grama | **sim** |
| L | Litro | **sim** |
| ML | Mililitro | **sim** |
| M | Metro | **sim** |
| CX | Caixa | não |
| PCT | Pacote | não |
| DZ | Dúzia | não |
| FD | Fardo | não |

As unidades padrão são registros comuns: podem ser editadas, inativadas ou excluídas (se não estiverem em uso), como qualquer outra.

### 3.3 Regras
- Sigla obrigatória (1–20 caracteres), normalizada para maiúsculas; descrição obrigatória (1–60).
- Sigla duplicada na empresa → **409**.
- **Excluir** só se nenhum produto a usa como unidade de venda **ou** de compra; senão **409** com a mensagem "Esta unidade está em uso por N produto(s). Inative-a para que não apareça em novos cadastros." (N = contagem).
- Inativar/reativar sempre permitido. Unidade inativa continua válida nos produtos que já a usam, mas **não aparece** no select do formulário (exceto como valor atual do produto em edição).
- Alterar `fracionada` de uma unidade em uso é permitido nesta fase (não há estoque nem vendas); a regra será revisada na Fase D.
- **Regra de domínio para o PDV:** `quantidadeValidaParaUnidade(unidade, quantidade)` — quantidade > 0; se a unidade não for fracionada, a quantidade deve ser inteira. Coberta por teste; ainda sem consumidor.

### 3.4 API — `/api/unidades`

| Endpoint | Perfil | Respostas |
|---|---|---|
| `GET /api/unidades?ativo=` | qualquer autenticado | 200 (ordenado por sigla) |
| `POST /api/unidades` | ADMIN | 201 / 400 / 403 / 409 |
| `PATCH /api/unidades/{id}` | ADMIN | 200 / 400 / 403 / 404 / 409 |
| `PATCH /api/unidades/{id}/inativar` · `/reativar` | ADMIN | 200 / 403 / 404 |
| `DELETE /api/unidades/{id}` | ADMIN | 204 / 403 / 404 / 409 |

`{id}` é o UUID. Resposta: `id`, `sigla`, `descricao`, `fracionada`, `ativo`, `emUso` (quantidade de produtos que a usam), `criadoEm`, `atualizadoEm`.

## 4. Categorias

### 4.1 Modelo — tabela `categorias`

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `BIGINT` identity | PK interna |
| `uuid` | `UUID` NOT NULL UNIQUE | identificador público |
| `empresa_id` | `BIGINT` NOT NULL | FK `empresa` |
| `parent_id` | `BIGINT` NULL | FK `categorias(id)`; `NULL` = categoria raiz |
| `nome` | `VARCHAR(100)` NOT NULL | sem espaços nas pontas |
| `ativo` | `BOOLEAN` NOT NULL DEFAULT `true` | |
| `criado_em` / `atualizado_em` | `TIMESTAMP` | |

- **Nome único entre irmãos, sem diferenciar maiúsculas:** índice único `(empresa_id, COALESCE(parent_id, 0), lower(nome))` — duas raízes "Ração" e "ração" conflitam; "Sachê" pode existir sob "Úmida" e sob "Seca".
- FK de `parent_id` **sem** `ON DELETE CASCADE` (exclusão com filhos é bloqueada pela regra, e o banco garante).
- O pai deve ser da **mesma empresa** (validado no service; nunca aceitar pai de outro tenant).

### 4.2 Regras
- Nome obrigatório (1–100).
- **Criar:** com `parentId` opcional; o pai precisa existir na empresa (senão 404) — pai inativo é permitido.
- **Renomear e mover** (`PATCH` com `nome` e `parentId`): mover para a raiz com `parentId = null`.
- **Ciclos:** uma categoria não pode ser movida para si mesma nem para um descendente → **400** "Uma categoria não pode ficar dentro dela mesma ou de uma subcategoria sua.".
- Nome duplicado entre irmãos (no destino, ao mover) → **409**.
- **Excluir:** bloqueado se houver **subcategorias** (ativas ou não) ou **produtos** vinculados (ativos ou não) → **409**, com mensagem que diz o motivo e as contagens, ex.: "Não é possível excluir: há 2 subcategoria(s) e 5 produto(s) nesta categoria. Mova-os ou inative a categoria." Sem nada vinculado → 204 (exclusão física; categoria é cadastro, não histórico).
- **Inativar:** não altera filhos nem produtos. Uma categoria inativa **e todo o seu ramo** deixam de ser oferecidos no seletor do produto (um produto pode manter a categoria atual mesmo se ela ou um ancestral estiver inativo). Reativar devolve o ramo ao seletor. Sem escrita em cascata — reversível.
- **Caminho:** cada categoria expõe o caminho completo, ex.: "Ração › Úmida › Sachê" (separador ` › `).
- Profundidade ilimitada; a árvore inteira de uma empresa é carregada e montada em memória (volume esperado: dezenas a poucas centenas).
- **Descendentes:** método de domínio `idsDaSubarvore(categoriaId)` (a própria + descendentes), usado pela Fase E; coberto por teste agora.

### 4.3 API — `/api/categorias`

| Endpoint | Perfil | Respostas |
|---|---|---|
| `GET /api/categorias?ativo=` | qualquer autenticado | 200 — lista **plana**, ordenada pelo caminho |
| `POST /api/categorias` | ADMIN | 201 / 400 / 403 / 404 / 409 |
| `PATCH /api/categorias/{id}` | ADMIN | 200 / 400 / 403 / 404 / 409 |
| `PATCH /api/categorias/{id}/inativar` · `/reativar` | ADMIN | 200 / 403 / 404 |
| `DELETE /api/categorias/{id}` | ADMIN | 204 / 403 / 404 / 409 |

Resposta: `id`, `nome`, `parentId` (UUID ou `null`), `caminho`, `nivel` (0 = raiz), `ativo`, `selecionavel` (ativa e sem ancestral inativo), `quantidadeSubcategorias`, `quantidadeProdutos`, `criadoEm`, `atualizadoEm`. O frontend monta a árvore a partir da lista.

## 5. Produto

### 5.1 Novas colunas em `produtos`

| Coluna | Tipo | Regra |
|---|---|---|
| `unidade_id` | `BIGINT` NOT NULL | FK `unidades_medida`; unidade de venda |
| `categoria_id` | `BIGINT` NULL | FK `categorias` |
| `unidade_compra_id` | `BIGINT` NULL | FK `unidades_medida` |
| `fator_conversao` | `NUMERIC(12,4)` NULL | CHECK `> 0` |

- CHECK: `unidade_compra_id` e `fator_conversao` são **ambos nulos ou ambos preenchidos**.
- Unidade de compra igual à de venda → `fator_conversao` deve ser 1 (400 caso contrário).
- Unidade e categoria precisam ser **da mesma empresa** do produto (validado no service).
- Unidade de venda **inativa** só é aceita se já for a unidade atual do produto (edição sem trocar); idem categoria não selecionável. Senão 400.
- As colunas de texto antigas `produtos.categoria` e `produtos.unidade` **deixam de ser lidas e escritas** pela aplicação nesta fase e são **removidas numa migration da Fase B**, depois de conferida a conversão (DEC-020/regra de preservação).

### 5.2 Contrato da API de produtos (muda)
- **Request:** `unidadeId` (UUID, **obrigatório**), `categoriaId` (UUID, opcional), `unidadeCompraId` (opcional), `fatorConversao` (opcional) — substituem `categoria` e `unidade` em texto.
- **Response:** `unidade` `{ id, sigla, descricao, fracionada }`, `categoria` `{ id, nome, caminho }` ou `null`, `unidadeCompra` (mesmo formato de unidade ou `null`), `fatorConversao`, e `conversaoTexto` derivado, ex.: `"1 CX = 12 UN"` (ou `null`).
- RBAC de Produtos inalterado (DEC-025): escrita ADMIN, leitura livre.

## 6. Migração dos dados existentes (migration V6)

Executada numa única migration aditiva, preservando todos os produtos:

1. Cria `unidades_medida` e `categorias`.
2. Para **cada empresa existente**, insere as 10 unidades padrão.
3. **Unidades em texto:** normaliza `upper(trim(unidade))` e aplica sinônimos — `UND`, `UNID`, `UNIDADE`, `UNIDADES` → `UN`; `KILO`, `KILOS`, `QUILO`, `KGS` → `KG`; `LT`, `LTS`, `LITRO`, `LITROS` → `L`; `PC`, `PÇ`, `PECA`, `PEÇA` → `UN`; `CAIXA` → `CX`; `PACOTE` → `PCT`; `DUZIA`, `DÚZIA` → `DZ`; `FARDO` → `FD`. Valores restantes, distintos por empresa, viram **unidades novas** (sigla = valor normalizado, descrição = texto original aparado, não fracionada).
4. Adiciona `produtos.unidade_id`, preenche pelo passo 3; produto **sem unidade** recebe **UN**; torna `unidade_id` NOT NULL.
5. **Categorias em texto:** para cada empresa, cada valor distinto de `lower(trim(categoria))` vira **uma categoria raiz**, com o nome no formato do primeiro produto que o usou (menor `id`), aparado. Vazios são ignorados.
6. Adiciona `produtos.categoria_id` e vincula pelo `lower(trim(categoria))`.
7. Adiciona `unidade_compra_id` e `fator_conversao` (nulos) e os CHECKs.
8. Mantém `produtos.categoria`/`produtos.unidade` intactos (rede de segurança até a Fase B).

Empresas criadas depois da migration recebem as unidades padrão pelo código (hoje o único ponto de criação é o `DevAdminBootstrap`; o futuro onboarding deve chamar o mesmo serviço).

**Verificação obrigatória:** teste de integração contra Postgres (Testcontainers) que monta produtos com textos variados ("un", " Un ", "UND", "kg", "Caixa", "Saco 50", "Mercearia", "mercearia ", vazio/nulo) **no schema da V5** e confere o resultado após a V6 — nenhum produto sem unidade, nenhuma unidade ou categoria duplicada, vínculos corretos. E checagem manual com os 30 produtos de demonstração.

## 7. Frontend

### 7.1 Navegação
A área de Produtos ganha uma sub-navegação com três abas-rota: **Produtos** (`/produtos`), **Categorias** (`/produtos/categorias`) e **Unidades** (`/produtos/unidades`). A sidebar continua com um único item "Produtos". Todas acessíveis a qualquer autenticado; para OPERADOR, modo leitura (ações escondidas), no padrão atual de Produtos.

### 7.2 Unidades (`/produtos/unidades`)
Tabela com sigla, descrição, "fracionada" (Sim/Não), em uso (nº de produtos) e status. Ações: nova, editar, inativar/reativar, excluir — o botão excluir de unidade em uso aparece desabilitado com dica "Em uso por N produto(s)"; se o backend responder 409, mostrar a mensagem dele.

### 7.3 Categorias (`/produtos/categorias`)
- **Árvore expansível** (expandir/recolher por nó, "expandir tudo"), com nome, nº de produtos e status; inativas com estilo atenuado.
- Por nó: **Adicionar subcategoria**, **Renomear**, **Mover** (diálogo com seletor do novo pai, que exclui a própria categoria e seus descendentes, e opção "Mover para a raiz"), **Inativar/Reativar**, **Excluir** (409 mostra o motivo e sugere inativar).
- "Nova categoria" no topo cria uma raiz.
- Navegável por teclado (setas para mover entre nós, Enter/Espaço para expandir), com papéis ARIA de árvore.

### 7.4 Formulário do produto (alterações nesta fase)
- **Unidade de venda:** select obrigatório com as unidades **ativas** ("UN — Unidade").
- **Categoria:** seletor com busca (combobox) que lista as categorias selecionáveis pelo **caminho completo**; qualquer nível pode ser escolhido; opção "Sem categoria". Atalho **"+ Nova"** abre um mini-formulário (nome + pai opcional, pré-preenchido com o termo digitado) que cria a categoria e já a seleciona.
- **Unidade de compra e fator:** no bloco avançado; ao preencher, mostra o texto de ajuda "1 CX = 12 UN".
- Na listagem atual de produtos, categoria passa a mostrar o caminho e a unidade, a sigla.

## 8. Critérios de aceite e testes

**Backend:**
- Migração (IT): cenários do §6 — sinônimos, deduplicação sem diferenciar maiúsculas/espaços, produto sem unidade → UN, categorias raiz sem duplicar, vínculos corretos, colunas antigas preservadas.
- Categorias: ciclo (mover para si / para neto) → 400; nome duplicado entre irmãos (inclusive ao mover) → 409; mesmo nome em pais diferentes → OK; exclusão com subcategoria → 409; com produto → 409; sem vínculos → 204; caminho correto em 3+ níveis; `idsDaSubarvore` (raiz, meio, folha); `selecionavel` falso para ramo sob ancestral inativo; isolamento por empresa (pai de outra empresa → 404).
- Unidades: sigla normalizada; duplicada → 409; exclusão em uso (venda ou compra) → 409; `quantidadeValidaParaUnidade` (inteira × fracionada, zero e negativa).
- Produto: unidade obrigatória; unidade/categoria de outra empresa → 400/404; compra sem fator (ou vice-versa) → 400; mesma unidade com fator ≠ 1 → 400; `conversaoTexto`; unidade inativa só se já for a atual.
- RBAC: escrita ADMIN (403 para OPERADOR) em unidades e categorias; leitura livre.

**Frontend:**
- Árvore (expandir, adicionar subcategoria, mover excluindo descendentes do seletor, 409 na exclusão), unidades (desabilitar excluir em uso), seletor de categoria (busca pelo caminho, "+ Nova" cria e seleciona), select de unidade só ativas, texto "1 CX = 12 UN".

**Revisores:** `data-reviewer` (V6 e migração de dados — obrigatório), `security-reviewer` (novas rotas e RBAC — obrigatório), `back-end-reviewer`, `front-end-reviewer`, `product-ux-reviewer` (árvore e seletor), `qa-reviewer`.

## 10. Ajustes incorporados na implementação (revisões)

**Banco (V6):**
- **FKs compostas `(empresa_id, id)`** em produto → unidade/categoria/unidade de compra e em categoria → pai: o banco rejeita vínculo com outra empresa (além do service).
- CHECKs extras: sigla maiúscula, aparada e não vazia; descrição não vazia; nome de categoria aparado e não vazio; `parent_id <> id`.

**Regras (backend):**
- **Mover e excluir categoria travam a árvore da empresa** (`SELECT … FOR UPDATE` na linha da empresa): dois "mover" cruzados simultâneos não criam ciclo (teste concorrente com Spring + Postgres real).
- Regra "inativa só se já for a atual" vale também para a **unidade de compra**, com mensagem própria: "Esta unidade de compra está inativa. Escolha uma unidade ativa.".
- Sigla revalidada depois de normalizar (ex.: `ß` → `SS`): 400 "A sigla deve ter no máximo 20 caracteres.". `fracionada` obrigatória no request.
- Fator ≤ 0 → 400 "O fator de conversão deve ser maior que zero." (também no service). `conversaoTexto` sem separador de milhar ("1 CX = 1500,5 UN").
- PATCH de categoria substitui nome **e** pai (`parentId` ausente/nulo = categoria principal).

**Telas (frontend):**
- Termo único **"categoria principal"** (em vez de "raiz"/"primeiro nível").
- Árvore: só "Adicionar subcategoria" visível; Renomear/Mover/Inativar/Excluir no menu **"⋯ Mais"**; ícones de ocultar (`EyeOff`/`Eye`) distintos da lixeira; contagem de produtos **da subárvore** com plural correto; ramo sob categoria inativa atenuado com o selo "Oculta — categoria acima inativa"; criação de subcategorias em sequência; foco restaurado após diálogos e edições.
- Excluir categoria com vínculos: o diálogo explica (contagens) e oferece **"Inativar categoria"**.
- Busca no seletor e no mover **por palavras em qualquer ordem**, sem acento ("racao umida" encontra "Ração › Úmida › Sachê").
- Produto:
  - **UN pré-selecionada** em produto novo, com o rótulo "Preço de venda (por {sigla})".
  - Asterisco em Nome, Preço de venda e Unidade de venda.
  - Fator oculto até haver unidade de compra; a unidade de venda não aparece na lista de compra.
  - Rótulo "Quantas {venda} vêm em 1 {compra}?".
  - Custo e Preço mínimo antes da compra.
- Unidades: sigla em maiúsculas enquanto digita.

**Dívidas registradas:** DT-026 (teto da árvore), DT-027 (endurecimentos menores), DT-025 atualizada.

> **Fase B3 (embalagens, DEC-037, V12):** a unidade de compra + fator deixou de existir e virou a embalagem "de compra" ([produtos-embalagens.md](produtos-embalagens.md)). Onde esta spec fala em unidade de compra, vale a embalagem: o uso da unidade (exclusão e contagem `emUso`) passa a contar as unidades de venda e as unidades das embalagens, com cada produto contado uma vez; desligar `fracionada` também é barrado (400, campo `fracionada`) quando um produto com essa unidade de venda tem embalagem de quantidade fracionada: "Há embalagens com quantidade fracionada nesta unidade. Ajuste-as antes de desligar o fracionamento."

## 9. Pontos em aberto (para fases seguintes)
- Remoção das colunas de texto antigas (Fase B).
- Revalidar `fracionada` em unidade com estoque/vendas (Fase D).
- Filtro por categoria com descendentes na listagem (Fase E).
- Unidades padrão em um futuro fluxo de onboarding de empresa.
