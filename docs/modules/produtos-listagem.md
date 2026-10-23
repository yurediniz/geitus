# Produtos: Listagem (Fase E da evolução de Produtos)

> **Status:** spec aprovada em 2026-10-23 (desenho aprovado em conversa, com execução autorizada). Quinta das 6 fases da DEC-030; decisões desta fase na **DEC-035**. Depende da Fase D ([produtos-estoque.md](produtos-estoque.md)). Fecha a DT-020 para Produtos. Registro de design: [`docs/superpowers/specs/2026-10-23-produtos-fase-e-design.md`](../superpowers/specs/2026-10-23-produtos-fase-e-design.md).

## 1. Visão geral

Torna a lista de produtos utilizável com milhares de itens:
- **paginação no servidor**, com páginas numeradas;
- **busca enquanto se digita**, sem diferenciar maiúsculas nem acentos, por nome, nome curto, SKU, marca e qualquer código de barras;
- **ordenação** por nome, preço, margem, estoque e data;
- **filtros combináveis**: status, categoria (com as subcategorias), estoque (baixo/sem estoque) e em promoção;
- **tabela** em telas médias e grandes e **cards** no celular;
- **estado na URL**, para voltar da edição exatamente onde se estava.

## 2. Escopo

**Inclui:** item §8 (Listagem) do pedido de evolução, menos a miniatura.

**Não inclui:**

| Item | Onde fica |
|---|---|
| Miniatura do produto na lista | F (imagem) |
| Paginação da lista de Clientes (DT-020) | futuro |
| Índice de trigramas (`pg_trgm`) para a busca | dívida técnica, quando passar de dezenas de milhares de produtos |
| Exportar a lista (CSV/planilha) | futuro |
| Ações em lote (inativar vários) | futuro |

Também fora: fiscal.

## 3. Modelo de dados — migration `V10__produtos_busca.sql`

Aditiva sobre a V9, que **não** é editada.

| Mudança | Regra |
|---|---|
| `produtos.busca_normalizada TEXT NOT NULL` | Nome, nome curto, SKU e marca juntos, normalizados por §4.1 e separados por espaço. Mantida pela aplicação a cada gravação. |
| `produtos.nome_normalizado TEXT NOT NULL` | Só o nome, normalizado por §4.1. Usado para ordenar por nome sem depender de acentos nem da collation do banco. |
| Preenchimento dos existentes | `UPDATE` com a conversão SQL equivalente (§4.1) antes do `NOT NULL`. |
| `ix_produto_empresa_ativo_nome (empresa_id, ativo, nome_normalizado, id)` | Ordenação e filtro padrão. |
| `ix_produto_empresa_criado (empresa_id, criado_em DESC)` | Ordem "mais recentes". |
| `ix_produto_empresa_atualizado (empresa_id, COALESCE(atualizado_em, criado_em) DESC)` | Ordem "atualizados recentemente". |

Sem extensão do PostgreSQL (DEC-030). A busca "contém" percorre os produtos de uma empresa, o que é rápido para milhares de itens.

## 4. Regras

### 4.1 Normalização da busca
- **Função única** `TextoDeBusca.normalizar(String) → String` (backend, pacote `shared.busca`). Ela:
  1. decompõe os acentos (NFD) e remove as marcas (`\p{M}`), o que converte "ç" em "c";
  2. converte para minúsculas (`Locale.ROOT`);
  3. troca qualquer sequência de espaços Unicode por um espaço só;
  4. apara as pontas.

  Texto nulo ou vazio resulta em `""`.
- **Equivalente SQL na V10** (só para os dados existentes): `lower(translate(...))` das letras acentuadas do português para as sem acento, com os espaços colapsados por `regexp_replace`.
  - O mapeamento exato fica no plano, e um teste de integração prova que a conversão SQL e a Java dão o mesmo resultado para os textos do catálogo atual e para todas as letras acentuadas do português.
- **Termo digitado:** passa pela mesma função. Ele é dividido em palavras (até 5; o resto é ignorado), e **cada palavra precisa aparecer** em `busca_normalizada`, em qualquer ordem ("uniao acucar" encontra "Açúcar Cristal União").
  - Os curingas do `LIKE` são escapados (DT-017).
  - Em paralelo, o termo sem espaços é comparado com **qualquer código de barras** do produto, como hoje.
  - O produto entra se casar por texto **ou** por código.

### 4.2 Filtros

| Parâmetro | Valores | Regra |
|---|---|---|
| `busca` | texto | §4.1. Vazio = sem busca. |
| `status` | `ativos` (padrão), `inativos`, `todos` | |
| `categoria` | UUID | A categoria e todas as descendentes (`CategoriaArvore.idsDaSubarvore`). UUID de outra empresa ou inexistente → lista vazia (não revela nada). |
| `estoque` | `baixo`, `sem` | Só produtos com `controla_estoque`. `sem`: saldo ≤ 0. `baixo`: saldo ≤ ponto de reposição, ou ≤ estoque mínimo quando o ponto está vazio, **incluindo os sem estoque** (decisão do usuário). Produto sem nenhum desses níveis entra em `baixo` só se estiver sem estoque. |
| `promocao` | `true` | Promoção vigente hoje (São Paulo, o mesmo `Clock` da Fase C). |

- **Combinação:** todos os filtros se combinam com **E**.
- **Valor inválido** em `status`, `estoque`, `ordem` ou `promocao` → 400 com a mensagem do parâmetro.

### 4.3 Ordenação

| `ordem` | Critério |
|---|---|
| `nome` (padrão, decisão do usuário) / `-nome` | `nome_normalizado` (sem acento e sem diferenciar maiúsculas) |
| `preco` / `-preco` | Preço de venda (o normal, não o promocional) |
| `margem` / `-margem` | `(preco − custo) / preco`; produtos sem custo ou com preço 0 **sempre no fim**, nas duas direções |
| `estoque` / `-estoque` | Saldo; produtos sem controle de estoque **sempre no fim** |
| `recentes` | `criado_em` desc |
| `atualizados` | `COALESCE(atualizado_em, criado_em)` desc |

O desempate é sempre por `nome_normalizado` e depois por `id`, para a paginação ser estável.

### 4.4 Paginação
- **Parâmetros:** `pagina` (0-based) e `tamanho` (padrão **25**, máximo 100), validados pelo `Paginacao.validar` que já existe.
- **Página além do fim:** devolve `itens: []` com o `totalItens` real, e a tela volta para a última página válida.

## 5. API

`GET /api/produtos?busca=&status=&categoria=&estoque=&promocao=&ordem=&pagina=&tamanho=` → `PaginaResponse<ProdutoResponse>` (`itens`, `pagina`, `tamanho`, `totalItens`).

- **`ProdutoResponse`:** igual ao atual, com estoque, promoção e `podeExcluir`, calculados em lote para a página.
- **Contrato:** muda de lista para página. O único consumidor é a tela de produtos. O parâmetro `ativo` (booleano) deixa de existir, substituído por `status`.
- **Implementação:**
  - **Etapa 1:** uma consulta nativa de leitura, `ConsultaDeProdutos`, com `NamedParameterJdbcTemplate`, devolve os **ids** da página e o total. O SQL é montado só a partir de **fragmentos fixos** escolhidos por enums (ordem, filtros), e todos os valores vão como parâmetros nomeados. Nenhum texto do usuário é concatenado.
  - **Etapa 2:** carrega esses produtos com as relações (unidade, categoria, códigos) e devolve **na ordem da etapa 1**.
  - **Acoplamento com o estoque:** a consulta lê `estoque_saldos` via `LEFT JOIN` (acoplamento só de leitura no SQL, documentado). O pacote `catalog` continua sem importar classes de `inventory`.
- **Número de consultas por página:** constante, independente do número de itens (contagem + ids + produtos + resumos de estoque + árvore de categorias).
- **RBAC:** inalterado (GET autenticado).

## 6. Frontend

### 6.1 Barra de filtros
- **Busca** com ícone, sem botão:
  - dispara 300 ms depois de parar de digitar;
  - Enter dispara na hora;
  - mostra o indicador "Buscando…" durante a requisição;
  - as requisições antigas são **canceladas** (`AbortSignal` no `apiGet`), para resposta atrasada nunca sobrescrever a nova;
  - o foco fica no campo enquanto se digita.
- **Status:** select com Ativos / Inativos / Todos.
- **Categoria:** select com busca, mostrando o caminho completo ("Ração › Úmida"), e "Todas".
- **Estoque:** select com Todos / Estoque baixo / Sem estoque.
- **"Só em promoção":** checkbox.
- **Ordenar por:** select com os rótulos de §4.3: "Nome (A–Z)", "Nome (Z–A)", "Menor preço", "Maior preço", "Maior margem", "Menor margem", "Maior estoque", "Menor estoque", "Mais recentes", "Atualizados recentemente".
- **"Limpar filtros":** aparece quando houver qualquer filtro diferente do padrão.
- **Tablet e celular:** os filtros quebram em linhas, e no celular "Filtros" vira um bloco que abre e fecha, com um contador de filtros ativos.

### 6.2 Tabela (≥ 768 px)

| Coluna | Conteúdo | Ordenável |
|---|---|---|
| Nome | nome, com o nome curto e o SKU em texto menor | sim (`nome`) |
| Categoria | caminho completo ou "—" | não |
| Unidade | sigla | não |
| Preço | preço, ou o selo "Promoção" com o promocional e o normal riscado | sim (`preco`) |
| Margem | % ou "—" | sim (`margem`) |
| Estoque | "12 UN" e o selo, ou "—" | sim (`estoque`) |
| Status | selo Ativo/Inativo | não |
| Ações | Editar, Ajustar estoque (ADMIN, com controle), Inativar/Reativar (ADMIN) | — |

- **Cabeçalho:** clicar ordena ascendente e um segundo clique inverte. O cabeçalho tem `aria-sort` e um ícone de direção. O select "Ordenar por" e o cabeçalho ficam sincronizados.
- **Linha:** clicar no nome abre o produto. As ações são botões próprios.

### 6.3 Celular (< 768 px)
- **Cards atuais:** mostram nome, preço com selo, estoque com selo, status e as ações.
- **Ordenação:** só pelo select.

### 6.4 Paginação
- **Rodapé:** "1–25 de 1.240", botões "Anterior" e "Próxima" e "Página 2 de 50", com um campo para ir direto a uma página.
- **Mudança de página:** a página sobe para o topo da lista e o foco vai para o título da lista.
- **Troca de filtro, busca ou ordem:** volta para a página 1.

### 6.5 Estado na URL
- **Parâmetros:** `?busca=&status=&categoria=&estoque=&promocao=1&ordem=&pagina=`. Os valores padrão não aparecem na URL. A `pagina` na URL é **1-based** (a API é 0-based).
- **Busca:** substitui a entrada do histórico (`replace`).
- **Página e filtros:** criam uma entrada, para o "Voltar" do navegador voltar à página anterior.
- **Voltar da edição:** restaura tudo, como já acontece hoje com busca e status.

### 6.6 Estados
- **Carregando a primeira vez:** esqueleto da tabela.
- **Trocando de página ou filtro:** os itens atuais ficam visíveis com opacidade reduzida (`placeholderData: keepPreviousData`), sem piscar.
- **Erro:** mensagem e "Tentar de novo".
- **Vazio sem filtro:** "Nenhum produto cadastrado ainda." e "Cadastrar produto" (ADMIN).
- **Vazio com filtro:** "Nenhum produto encontrado para 'açúcar'." (ou "com os filtros escolhidos") e "Limpar filtros".

### 6.7 Organização
- `ProdutosListaPage` fica só com a composição e é dividida em:
  - `FiltrosProdutos`;
  - `TabelaProdutos`;
  - `CardsProdutos` (os cards atuais);
  - `PaginacaoLista`, genérica em `components/ui`, para reuso em Clientes;
  - o hook `useFiltrosDaListaDeProdutos`, que lê e escreve a URL;
  - o hook `useBuscaComAtraso`, que faz o debounce.
- **Sem dependência nova:** a tabela usa elementos HTML com os tokens do tema.

## 7. Critérios de aceite e testes

**Backend:**
- **`TextoDeBusca`:**
  - "Açúcar  Cristal" → "acucar cristal";
  - "ÇÃO" → "cao";
  - espaços Unicode (NBSP e outros) viram um espaço só;
  - nulo → "".
- **V10 (IT):**
  - os produtos existentes recebem `busca_normalizada` e `nome_normalizado`, iguais à normalização Java;
  - **equivalência** SQL × Java para todas as letras acentuadas da lista e para os 30 nomes do catálogo de exemplo;
  - `NOT NULL` aplicado;
  - os índices existem.
- **Produto:** criar ou editar o nome, o nome curto, o SKU ou a marca atualiza `busca_normalizada` (e o nome atualiza `nome_normalizado`).
- **`ConsultaDeProdutos` (IT com Postgres):**
  - busca:
    - "acucar" encontra "Açúcar";
    - "uniao acucar" encontra "Açúcar Cristal União";
    - busca pela marca;
    - busca por parte de um código de barras;
    - `%` e `_` são literais;
  - cada status;
  - categoria com as descendentes, e categoria de outra empresa → vazio;
  - estoque `sem` e `baixo` (pelo ponto, pelo mínimo sem ponto, incluindo os zerados, excluindo os que não controlam estoque);
  - promoção vigente pelo `Clock`, nos dois limites do período;
  - filtros combinados;
  - cada ordem nas duas direções, com os "sem custo" e "sem controle" no fim e o desempate estável;
  - paginação (total, página no meio, página além do fim);
  - isolamento por empresa.
- **Service e controller:**
  - parâmetros inválidos → 400;
  - os valores padrão;
  - o número de consultas por página é constante;
  - a resposta preserva a ordem dos ids.

**Frontend:**
- **Busca:**
  - debounce de 300 ms (com relógio falso);
  - Enter imediato;
  - uma requisição antiga cancelada não sobrescreve a nova;
  - o indicador "Buscando…".
- **URL:**
  - cada filtro escreve e lê a URL;
  - os valores padrão ficam fora dela;
  - trocar filtro volta para a página 1;
  - a página na URL é 1-based e vai para a API 0-based;
  - voltar da edição restaura tudo.
- **Ordenação:** o clique no cabeçalho alterna e atualiza `aria-sort` e o select.
- **Paginação:** "1–25 de 60", Próxima, Anterior, ir para a página e página além do fim → última.
- **Estados:** carregando, trocando (itens antigos visíveis), erro, vazio sem filtro e vazio com filtro.
- **Layout:** tabela ≥ 768 px e cards abaixo.
- **Ações:** as ações atuais continuam funcionando na tabela e nos cards (Editar, Ajustar estoque, Inativar/Reativar).

## 8. Pontos em aberto
- **Índice de trigramas:** fica para quando um cliente passar de dezenas de milhares de produtos.
- **Clientes:** a lista de Clientes continua sem paginação (DT-020). O componente `PaginacaoLista` fica pronto para ela.
