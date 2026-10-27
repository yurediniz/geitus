# Produtos: Identificação e formulário em abas (Fase B da evolução de Produtos)

> **Status:** implementado em 2026-10-21 (migration V7 aplicada; página `/produtos/novo` e `/produtos/:id`). Ajustes das revisões em §6.2, §6.3 e §10. Segunda das 6 fases da DEC-030; decisões desta fase na **DEC-032**. Depende da Fase A ([categorias-e-unidades.md](categorias-e-unidades.md)).

## 1. Visão geral

Completa a **identificação** do produto e reorganiza o cadastro:
- nome curto para cupom/botões do PDV;
- SKU gerado automaticamente;
- **vários códigos de barras** por produto, com validação de EAN-8/EAN-13/UPC-A;
- marca e fornecedor principal com autocomplete;
- exclusão de produto cadastrado por engano;
- **UUID público** do produto (padrão DEC-019);
- **formulário em página própria, com abas**.

Também faz a limpeza combinada na Fase A: remove as colunas de texto antigas `categoria`/`unidade`.

## 2. Escopo

**Inclui:** itens §3 (identificação), §7 (marca e fornecedor principal) e §9 (formulário em abas) do pedido de evolução; retrofit do UUID do produto; migração do código de barras único para a lista de códigos; remoção das colunas antigas.

**Não inclui:**

| Item | Fase |
|---|---|
| Promoção, atacado, histórico de preços, margem → preço, máscara R$ | C |
| Flag "controla estoque", saldo, ajuste, movimentações | D |
| Busca sem acento/por marca, ordenação, filtros, paginação | E |
| Imagem | F |
| Aba **Histórico** (só aparece quando houver histórico — Fases C/D) | C/D |
| Fornecedor como cadastro, código principal marcado, GTIN-14 validado, etiquetas | futuro |

Também fora: fiscal.

## 3. Modelo de dados — migration `V7__produtos_identificacao.sql`

Aditiva sobre a V6 (que **não** é editada). Preserva todos os dados.

### 3.1 `produtos` (alterações)

| Coluna | Mudança | Regra |
|---|---|---|
| `uuid` | **nova** `UUID NOT NULL UNIQUE` | Preenchida com `gen_random_uuid()` para os existentes; para novos, gerada na aplicação (DEC-019/029). Imutável. |
| `nome_curto` | **nova** `VARCHAR(30) NULL` | Aparado; vazio → `NULL`. |
| `fornecedor` | **nova** `VARCHAR(100) NULL` | Fornecedor principal em texto (sem cadastro próprio). |
| `codigo_barras` | **removida** | Depois de copiada para `produto_codigos_barras`. |
| `categoria`, `unidade` (texto) | **removidas** | Substituídas na Fase A por `categoria_id`/`unidade_id`. |
| `uq_produto_empresa_codigo_barras` | **removida** | A unicidade passa para a tabela de códigos. |
| — | **nova** `UNIQUE (empresa_id, id)` (`uq_produto_empresa_id`) | Alvo da FK composta dos códigos. |

`sku` continua `VARCHAR(50)` único por empresa (`uq_produto_empresa_sku`).

### 3.2 `produto_codigos_barras` (nova)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `BIGINT` identity | PK interna |
| `empresa_id` | `BIGINT` NOT NULL | Mesma empresa do produto |
| `produto_id` | `BIGINT` NOT NULL | FK composta `(empresa_id, produto_id) → produtos (empresa_id, id)` **ON DELETE CASCADE** (os códigos são parte do cadastro) |
| `codigo` | `VARCHAR(50)` NOT NULL | Aparado, sem espaços internos; CHECK `codigo = btrim(codigo) AND codigo <> ''` |
| `formato` | `VARCHAR(10)` NOT NULL | `EAN8`, `EAN13`, `UPCA` ou `OUTRO` (CHECK) |
| `ordem` | `SMALLINT` NOT NULL | Ordem de exibição (0 = primeiro) |
| `criado_em` | `TIMESTAMP` NOT NULL DEFAULT `now()` | |

- `UNIQUE (empresa_id, codigo)` (`uq_codigo_barras_empresa`): o mesmo código não pode estar em dois produtos da empresa nem duas vezes no mesmo produto.
- Índice `idx_codigo_barras_produto (produto_id)`.

### 3.3 Migração dos dados
1. Cria `produto_codigos_barras`.
2. Copia cada `produtos.codigo_barras` não vazio para a tabela, com `ordem = 0` e `formato` calculado em SQL pelas regras do §4.3. Um código antigo com dígito verificador inválido entra como `OUTRO`, para não perder dado.
3. Preenche `uuid` dos produtos existentes.
4. Remove `codigo_barras`, `categoria` e `unidade` de `produtos`.

**Verificação:** IT de migração (`target("6")` → dados → `target("7")`) mais checagem no `geitus_db`. Backup antes de aplicar.

## 4. Regras de negócio

### 4.1 Nome e nome curto
- Nome obrigatório (até 150), como hoje.
- Nome curto opcional, até **30** caracteres.
- A API expõe `nomeCurtoEfetivo`, usado por cupom e PDV: o nome curto, ou os **30 primeiros caracteres do nome** (aparados) se ele estiver vazio.

### 4.2 SKU e geração automática
- Opcional; único por empresa (409 se repetido, como hoje).
- **Sugestão automática:** `GET /api/produtos/sku/sugestao` devolve o próximo SKU no padrão **`P` + 6 dígitos** (`P000001`, `P000002`…) da empresa: (maior número entre os SKUs da empresa que seguem exatamente esse padrão) + 1, começando em `P000001`.
  - SKUs manuais fora do padrão são ignorados no cálculo.
  - Passando de 999999, o número cresce (`P1000000`).
- A sugestão **não reserva** o SKU. A unicidade é verificada ao salvar; numa corrida, o 409 orienta a gerar de novo.
- No formulário, o botão **"Gerar automaticamente"** preenche o campo, que continua editável.

### 4.3 Códigos de barras
- Lista de **0 a 20** códigos por produto. Na tela: adicionar, remover e reordenar arrastando ou com setas; o primeiro é o exibido na listagem.
- **Normalização:** remover espaços (inclusive internos); vazio é ignorado.
- **Formato pelo conteúdo** (somente dígitos e tamanho):

| Tamanho (só dígitos) | Formato | Dígito verificador | Inválido → |
|---|---|---|---|
| 8 | `EAN8` | GS1 mod 10 | **400** |
| 12 | `UPCA` | GS1 mod 10 | **400** |
| 13 | `EAN13` | GS1 mod 10 | **400** |
| qualquer outro, ou com letras | `OUTRO` | — | aceito, com aviso |

- Mensagem do 400: `"Código de barras {codigo} com dígito verificador inválido. Confira a leitura."`
- **Formato desconhecido:** aceito e gravado como `OUTRO`. O formulário mostra o aviso (sem bloquear) `"Formato não reconhecido (não é EAN-8, EAN-13 nem UPC-A). Confira antes de salvar."`. A resposta da API traz o `formato` de cada código.
- **Unicidade por empresa (DEC-016):** código já usado em outro produto → **409** `"O código de barras {codigo} já está cadastrado no produto \"{nome}\"."` (o nome é da mesma empresa, nunca de outra). Repetido no mesmo envio → 400 `"Código de barras repetido na lista."`.
- O PATCH substitui a lista inteira; códigos removidos são apagados.

### 4.4 Marca e fornecedor principal
- Marca até 100, fornecedor até 100; texto livre, aparado, vazio → `NULL`.
- **Autocomplete:** `GET /api/produtos/sugestoes?campo=marca|fornecedor&termo=` devolve até **10 valores distintos** já usados na empresa, sem diferenciar maiúsculas, ordenados por frequência de uso e depois alfabeticamente. Termo de até 50 caracteres; sem termo, os 10 mais usados.

### 4.5 Status e exclusão
- Ativo/inativo como hoje (inativar/reativar). Produto inativo continua fora do PDV (regra para a etapa 11).
- **Exclusão física** (`DELETE /api/produtos/{id}`, ADMIN) permitida só se o produto **nunca teve venda nem movimentação de estoque** (DEC-030). Nesta fase ainda não existem vendas nem movimentações, então todo produto pode ser excluído.
  - A verificação é centralizada em `ProdutoService.podeExcluir(produto)`, que as Fases C/D estendem (ex.: movimentos de estoque).
  - Histórico de preços (Fase C) é parte do cadastro e sai junto.
  - A resposta do produto traz `podeExcluir`.
- Bloqueado → **409** `"Este produto já teve movimentação e não pode ser excluído. Inative-o para que não apareça na venda."`.
- Excluir apaga também os códigos de barras (cascade).

### 4.6 UUID público
- Rotas de produto passam a usar o UUID: `/api/produtos/{id}` com `id` = UUID. O id numérico deixa de sair na API.
- UUID malformado → 400 (handler existente).

## 5. API (produtos)

| Endpoint | Perfil | Respostas |
|---|---|---|
| `GET /api/produtos?busca=&ativo=` | autenticado | 200 |
| `GET /api/produtos/{id}` | autenticado | 200 / 400 / 404 |
| `POST /api/produtos` | ADMIN | 201 / 400 / 403 / 409 |
| `PATCH /api/produtos/{id}` | ADMIN | 200 / 400 / 403 / 404 / 409 |
| `PATCH /api/produtos/{id}/inativar` · `/reativar` | ADMIN | 200 / 403 / 404 |
| `DELETE /api/produtos/{id}` | ADMIN | 204 / 403 / 404 / 409 |
| `GET /api/produtos/sku/sugestao` | ADMIN | 200 `{ "sku": "P000031" }` |
| `GET /api/produtos/sugestoes?campo=&termo=` | autenticado | 200 `["Golden", "Premier"]` / 400 (campo inválido) |

- **Request:** adiciona `nomeCurto`, `fornecedor`, `codigosBarras: string[]`; remove `codigoBarras`.
- **Response:** `id` (UUID), `nomeCurto`, `nomeCurtoEfetivo`, `fornecedor`, `codigosBarras: [{ codigo, formato }]` (na ordem), `podeExcluir`; remove `codigoBarras`. O restante é igual à Fase A.
- **Busca (`busca`):** além de nome e SKU, encontra por **nome curto** e por **qualquer código de barras** (comparação exata ou parcial sobre o código normalizado). Os caracteres `%` e `_` do termo são escapados, o que fecha a DT-017 para Produtos. Marca e busca sem acento ficam para a Fase E.
- **RBAC:** inalterado (DEC-025), mais as rotas novas da tabela.

## 6. Frontend

### 6.1 Rotas e navegação
- `/produtos`: listagem (como hoje). Busca e status passam para a URL (`?busca=&status=`), para preservar o estado ao voltar da edição. A listagem completa fica para a Fase E.
- `/produtos/novo` e `/produtos/:id`: **página do produto**, com cabeçalho mostrando o nome (ou "Novo produto"), a seta "Voltar para produtos" e o status.
- "Novo produto" e "Editar" na lista navegam para essas rotas.
- OPERADOR abre a página em **modo leitura**: campos desabilitados, sem Salvar nem Excluir.

### 6.2 Abas (desta fase)
> **Ajuste aprovado pelo usuário após a revisão de UX (2026-10-21):** o cadastro mínimo fica inteiro na aba **Geral**. Preço de venda\* e "Adicionar código de barras" sobem para ela; o status (selo + Inativar/Reativar) vai para o cabeçalho.

1. **Geral:** Nome\*, Nome curto (com contador 0/30 e a prévia "No cupom: {nomeCurtoEfetivo}"), Unidade de venda\*, **Preço de venda (por {sigla})\***, **Adicionar código de barras** (campo compacto, com os códigos como etiquetas removíveis — a mesma lista da aba Códigos), Categoria, Marca (autocomplete), Fornecedor principal (autocomplete), Descrição.
   - Grupo **"Unidade e embalagem"** com unidade de compra e "Quantas X vêm em 1 Y?".
2. **Preços:** Custo, Preço mínimo, margem/markup derivados (só leitura) e o preço de venda como referência do cálculo. A Fase C amplia.
3. **Estoque:** Estoque mínimo, Ponto de reposição, Estoque máximo. A Fase D amplia.
4. **Códigos:** SKU, com o botão "Gerar automaticamente". Lista completa de códigos de barras:
   - campo "Adicionar código" (Enter adiciona, pensado para leitor de código de barras);
   - selo do formato reconhecido, com aviso de `OUTRO` só para códigos adicionados agora (os já gravados mostram só o selo);
   - remover e reordenar (setas só com 2+ códigos).
- **Cabeçalho:** nome, "Voltar para produtos", selo de status, **Inativar/Reativar** e **Excluir** (ADMIN).

**Regras das abas:**
- **Erro em aba não visível:** a aba recebe um indicador (ponto + contagem acessível). Ao salvar com erro, a página vai para a primeira aba com erro e foca o campo.
- **Teclado:** padrão ARIA de abas; ←/→ entre abas.
- **Tablet:** as abas viram rolagem horizontal; campos em uma coluna abaixo de 768px.

### 6.3 Salvar e alterações não salvas
- **"Salvar"** grava e volta para a lista, com a mensagem de sucesso.
- **"Salvar e cadastrar outro"** existe só no modo novo. Grava, mostra o sucesso com o nome do produto e reabre um formulário vazio **mantendo unidade, categoria, marca e fornecedor** (cadastro em sequência), com foco em **"Adicionar código de barras"**, porque quem usa leitor bipa primeiro. Só reseta em caso de sucesso.
- **Teclado:**
  - `/produtos/novo` abre com foco no Nome.
  - No modo novo, Enter num campo de texto **não** envia o formulário.
  - **Ctrl+Enter** (ou Cmd+Enter) salva, com dica visível na barra de ações.
- **Código digitado e não adicionado:** ao salvar, o texto pendente do campo de código é incorporado com as mesmas regras. Se for bloqueado, nada é salvo e o erro aparece no campo.
- **Erros do backend:** marcados no campo pela chave `campos` da resposta (inclusive em 409 de SKU e de código), com salto para a aba do campo.
- **Aviso de alterações não salvas:** com o formulário alterado, sair pela navegação do app (lista, abas Categorias/Unidades, sidebar) abre o diálogo "Descartar alterações?" (Continuar editando / Descartar), via `useBlocker` do React Router. Fechar ou recarregar a aba usa o aviso nativo do navegador (`beforeunload`).
- **Excluir** fica no cabeçalho para ADMIN, quando `podeExcluir`. Pede confirmação com o nome do produto e lembra que inativar é reversível, oferecendo "Inativar" no próprio diálogo. Mostra o 409 se houver bloqueio.

### 6.4 Organização do código
A `ProdutosPage.tsx` atual (~1200 linhas) é dividida em:
- `ProdutosListaPage`;
- `ProdutoPage` (formulário com abas);
- um componente por aba;
- `produtoFormulario.ts`, com schema Zod e mapeamentos;
- `CampoCodigosBarras`, `CampoSugestao` (autocomplete) e um `NativeSelect` compartilhado em `components/ui`.

Nada de dependência nova: abas com `radix-ui` (Tabs), que já está instalado.

## 7. Regras de domínio reutilizáveis
- `CodigoBarras.detectarFormato(String)` e `CodigoBarras.digitoVerificadorValido(String)` (backend) e equivalentes em `lib/codigoBarras.ts` (frontend), com os mesmos casos de teste.
- `ProdutoService.podeExcluir(Produto)`: ponto de extensão para as Fases C/D.

## 8. Critérios de aceite e testes

**Backend:**
- **Migração V7 (IT):** código antigo vira código na tabela, com `formato` correto (EAN-13 válido, EAN-13 com dígito errado → `OUTRO`, interno alfanumérico → `OUTRO`); UUIDs preenchidos e únicos; colunas antigas removidas; produto sem código fica sem códigos; isolamento por empresa.
- **Validação de dígito:** exemplos reais
  - válidos: EAN-13 `7891000315507`, EAN-8 `96385074`, UPC-A `036000291452`;
  - inválidos (último dígito alterado) → 400;
  - 14 dígitos, alfanumérico e 9 dígitos → `OUTRO`.
- **Códigos:**
  - duplicado em outro produto → 409 com o nome do produto;
  - repetido no envio → 400;
  - mais de 20 → 400;
  - PATCH substitui a lista;
  - busca por qualquer código encontra o produto;
  - códigos de outra empresa não conflitam.
- **SKU:** sugestão com SKUs `P000001`, `P000007` e `ABC` → `P000008`; sem SKUs no padrão → `P000001`; isolamento por empresa.
- **Nome curto:** `nomeCurtoEfetivo` com nome curto, sem nome curto (truncado em 30) e nome menor que 30.
- **Sugestões:** distintos, sem diferenciar maiúsculas, ordem por frequência, só da empresa, campo inválido → 400.
- **Exclusão:** ADMIN → 204 e códigos apagados; OPERADOR → 403; outra empresa → 404; `podeExcluir` falso → 409 (testado com o ponto de extensão).
- **UUID:** rotas por UUID; id numérico ausente da resposta; UUID malformado → 400.
- **Busca:** `%`/`_` literais; por nome curto.

**Frontend:**
- **Abas:** navegação, indicador de erro e salto para a aba com erro.
- **Salvar:**
  - Salvar volta à lista;
  - "Salvar e cadastrar outro" mantém unidade, categoria, marca e fornecedor e foca o Nome.
- **Alterações não salvas:** diálogo ao navegar, sem diálogo depois de salvar.
- **Códigos:**
  - Enter adiciona;
  - selo de formato e aviso de `OUTRO`;
  - dígito inválido bloqueia com mensagem;
  - remover e reordenar.
- **SKU:** gerar preenche o campo.
- **Autocomplete:** marca e fornecedor sugerem, e aceitam valor novo.
- **Nome curto:** prévia do cupom.
- **Exclusão:** confirmação, 409 e volta à lista.
- **OPERADOR:** modo leitura.
- **Listagem:** estado na URL preservado ao voltar.

**Revisores:**
- `data-reviewer` (V7) e `security-reviewer` (rotas novas, DELETE, UUID), obrigatórios;
- `back-end-reviewer`, `front-end-reviewer`, `product-ux-reviewer` e `qa-reviewer`.

## 10. Ajustes incorporados na implementação (revisões)

**Banco (V7):** `ck_codigo_barras_codigo` com `codigo !~ '\s'`; CHECKs de `nome_curto`/`fornecedor` aparados e não vazios. Colisão de códigos após normalizar aborta a migração (banco fica na V6).

**Regras (backend):**
- **PATCH sem `codigosBarras` mantém os códigos atuais** (`[]` remove todos), para evitar perda de dado. No cadastro, ausente = sem códigos.
- **Edição dos códigos:** reconciliada por código. O código mantido conserva a linha e o formato gravado, e reordenar não viola a unicidade.
- **`atualizado_em`:** muda quando só os códigos mudam; a resposta do PATCH, inativar e reativar já traz o valor gravado.
- **Erros com `campos`:** os 409/400 de SKU e de códigos trazem `campos: [{campo: 'sku' | 'codigosBarras', mensagem}]`, com a mesma `mensagem`.
- **Busca:** termo só com espaço Unicode (ex.: NBSP) equivale a "sem termo"; antes dava 500.
- **Exclusão:** registra um log `INFO` com usuário, empresa e UUID do produto (rastro provisório até existir auditoria — DT-028).
- **Paginação:** `fail_on_pagination_over_collection_fetch` ligado, para a Fase E não paginar em memória.

**Telas (frontend):** ver §6.2 e §6.3 (essenciais na aba Geral, foco e teclado, código pendente, Inativar no cabeçalho, erros por `campos`). Também:
- formulário montado só com dados atualizados do servidor;
- refetch com erro não apaga o que está sendo editado;
- busca da lista não perde o foco;
- foco restaurado após o 409 de exclusão.

## 9. Pontos em aberto
- **Fase C:** histórico de preços como parte do cadastro (exclusão em cascata) e a aba Histórico.
- **Fase D:** `podeExcluir` passa a considerar movimentações.
- **Futuro:** GTIN-14 com validação própria; código "principal" explícito; fornecedor como cadastro.
