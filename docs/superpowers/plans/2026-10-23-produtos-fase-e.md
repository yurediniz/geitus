# Produtos Fase E (Listagem) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto, a execução é orquestrada pelo CTO: as tasks 1–3 ficam com o `back-end-executor` e as 4–5 com o `front-end-executor`, com revisores após cada bloco.

**Goal:** lista de produtos paginada no servidor, com busca sem acento enquanto se digita, ordenação, filtros combináveis, tabela/cards e estado na URL.

**Architecture:**
- **Backend:**
  - `TextoDeBusca.normalizar` alimenta duas colunas novas (`busca_normalizada`, `nome_normalizado`), criadas pela V10;
  - `ConsultaDeProdutos` (`NamedParameterJdbcTemplate`) devolve os ids e o total da página com SQL montado só por fragmentos fixos;
  - o service carrega os produtos desses ids com as relações e monta `PaginaResponse<ProdutoResponse>` na mesma ordem.
- **Frontend:**
  - um hook da URL;
  - um hook de busca com atraso;
  - `apiGet` com `AbortSignal`;
  - a lista dividida em filtros, tabela, cards e paginação.

**Tech Stack:** Java 21, Spring Boot 3.5, JPA/Hibernate 6, Spring JDBC (`NamedParameterJdbcTemplate`, já disponível pelo starter do JPA), Flyway, PostgreSQL 16, Testcontainers; React 19, TS, TanStack Query v5, React Router 7, Vitest.

**Spec:** [`docs/modules/produtos-listagem.md`](../../modules/produtos-listagem.md) (DEC-035). Os executores leem a spec inteira.

## Global Constraints
- **Migrations:** só a nova `V10__produtos_busca.sql`; V1–V9 intocadas (DEC-020).
- **Extensões:** nenhuma no PostgreSQL (nada de `unaccent`, `pg_trgm`).
- **Isolamento:** tudo filtrado por `empresa_id` vindo do JWT (DEC-016).
- **SQL nativo:**
  - texto do usuário **nunca** é concatenado; ordem e filtros vêm de enums que mapeiam fragmentos fixos;
  - todos os valores vão como parâmetros nomeados;
  - `LIKE` com `ESCAPE` e os curingas escapados (`PadraoLike`).
- **Paginação:** padrão de 25, máximo de 100, com o `Paginacao.validar` que já existe.
- **Dependências e escopo:** nenhuma dependência nova no backend nem no frontend; nada de fiscal.
- **Commits:** em pt-BR, no padrão `tipo(escopo): descrição`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Busca com espaços Unicode ou só espaços** (NBSP colado de planilha, "   "): é tratada como sem busca e nunca dá 500. Teste na Task 3 (a Fase B já teve esse 500).
2. **Página além do fim depois de filtrar** (estava na página 5 e o filtro deixou 1 página): a API devolve `itens: []` com o total, e a tela vai para a última página válida sem laço de requisições. Testes nas Tasks 3 e 5.
3. **Ordenar por margem ou estoque com produtos sem custo ou sem controle de estoque:** eles ficam no fim nas duas direções, e a paginação não repete nem pula itens entre páginas (desempate por nome e id). Teste na Task 2.
4. **Digitar rápido e apagar tudo** (resposta antiga chegando depois da nova): a tela mostra o resultado do último termo, e apagar tudo volta à lista sem busca. Teste na Task 5.
5. **Categoria excluída ou de outra empresa que ficou na URL:** lista vazia com "Limpar filtros", sem erro. Na tela, o select mostra "Todas" se a categoria não existe mais. Testes nas Tasks 2 e 5.

---

### Task 1: Normalização e V10

**Files:**
- Create: `backend/src/main/java/com/geitus/app/shared/busca/TextoDeBusca.java`
- Create: `backend/src/main/resources/db/migration/V10__produtos_busca.sql`
- Modify: `backend/src/main/java/com/geitus/app/catalog/Produto.java` (colunas `buscaNormalizada` e `nomeNormalizado`, `updatable = true`, sem setter público, recalculadas no construtor e em `atualizarDadosBasicos`)
- Test: `backend/src/test/java/com/geitus/app/shared/busca/TextoDeBuscaTest.java`, `backend/src/test/java/com/geitus/app/catalog/MigracaoV10IT.java` e `ProdutoTest`/`ProdutoServiceTest` (o recálculo)

**Interfaces:**
- **Produces:**
  - `final class TextoDeBusca`:
    - `static String normalizar(String texto)`: NFD → remover `\p{M}` → `toLowerCase(Locale.ROOT)` → `\s+` (também NBSP, U+2007 e U+202F, ou seja, `[\s\p{Z}]+`) → `" "` → `strip`; nulo vira `""`;
    - `static String textoDoProduto(String nome, String nomeCurto, String sku, String marca)`: junta os campos não vazios com espaço e normaliza;
    - `static List<String> palavras(String termo)`: até 5 palavras normalizadas, sem as vazias.
- **SQL de preenchimento na V10:**
  - `lower(translate(x, 'ÀÁÂÃÄÅàáâãäåÈÉÊËèéêëÌÍÎÏìíîïÒÓÔÕÖòóôõöÙÚÛÜùúûüÇçÑñÝýÿ', 'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNnYyy'))` e `regexp_replace(..., '\s+', ' ', 'g')` com `btrim`;
  - colunas criadas nulas → `UPDATE` → `SET NOT NULL`;
  - índices: `ix_produto_empresa_ativo_nome (empresa_id, ativo, nome_normalizado, id)`, `ix_produto_empresa_criado (empresa_id, criado_em DESC, id DESC)` e `ix_produto_empresa_atualizado (empresa_id, (COALESCE(atualizado_em, criado_em)) DESC, id DESC)`.

- [ ] **Step 1:** escrever os testes:
  - `TextoDeBuscaTest`:
    - `"Açúcar  Cristal"` → `"acucar cristal"`;
    - `"ÇÃO"` → `"cao"`;
    - `" a b "` → `"a b"`;
    - `null` → `""`;
    - `textoDoProduto("Ração Golden", null, "P000001", "Premier")` → `"racao golden p000001 premier"`;
    - `palavras("  uniao   acucar  ")` → `["uniao","acucar"]`;
    - `palavras` de 7 palavras devolve as 5 primeiras;
  - `MigracaoV10IT`, que migra até a V9, insere produtos e aplica a V10:
    - `preencheBuscaENomeNormalizados`;
    - `sqlEquivaleAoJavaParaTodasAsLetrasAcentuadas`, que percorre cada caractere da lista acima e combinações dele (por exemplo "Pão de Açúcar", "MAÇÃ", "Café Pilão", "Ñandu", "Ýoga"), comparando o SQL da V10 aplicado via `SELECT` com `TextoDeBusca.normalizar`;
    - `colunasNotNull`;
    - `indicesCriados`;
  - recálculo: `cadastrarPreencheColunasNormalizadas` e `editarNomeMarcaSkuOuNomeCurtoRecalcula`.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar. Atenção: o IT de equivalência precisa cobrir **todas** as letras do `translate`. Se alguma divergir (por exemplo "ÿ"), ajuste o mapa, não o teste.
- [ ] **Step 4:** rodar `./mvnw -q verify`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): colunas normalizadas para busca sem acento (V10)`.

### Task 2: `ConsultaDeProdutos`

**Files:**
- Create, em `backend/src/main/java/com/geitus/app/catalog/listagem/`:
  - `FiltroDeProdutos.java` (record);
  - `OrdemDeProdutos.java` (enum);
  - `StatusFiltro.java` (enum `ATIVOS`, `INATIVOS`, `TODOS`);
  - `EstoqueFiltro.java` (enum `BAIXO`, `SEM`);
  - `ConsultaDeProdutos.java`;
  - `PaginaDeIds.java` (record).
- Test: `backend/src/test/java/com/geitus/app/catalog/listagem/ConsultaDeProdutosIT.java`

**Interfaces:**
- **Produces:**
  - `record FiltroDeProdutos(Long empresaId, List<String> palavras, String termoDeCodigo, StatusFiltro status, Set<Long> categoriaIds, EstoqueFiltro estoque, boolean emPromocao, LocalDate hoje)`:
    - `categoriaIds == null` significa sem filtro;
    - um conjunto vazio significa lista vazia;
    - `termoDeCodigo` pode ser nulo;
  - `enum OrdemDeProdutos { NOME, NOME_DESC, PRECO, PRECO_DESC, MARGEM, MARGEM_DESC, ESTOQUE, ESTOQUE_DESC, RECENTES, ATUALIZADOS; static OrdemDeProdutos doParametro(String) }`, com os parâmetros `nome`, `-nome`, `preco`, `-preco`, `margem`, `-margem`, `estoque`, `-estoque`, `recentes` e `atualizados`. Um valor desconhecido lança `RegraDeNegocioException("Ordenação inválida.", "ordem")`. Cada valor guarda o **fragmento fixo** do ORDER BY;
  - `record PaginaDeIds(List<Long> ids, long total)`;
  - `@Repository class ConsultaDeProdutos { PaginaDeIds buscar(FiltroDeProdutos filtro, OrdemDeProdutos ordem, int pagina, int tamanho) }`.
- **SQL:**
  - base: `FROM produtos p LEFT JOIN estoque_saldos s ON s.empresa_id = p.empresa_id AND s.produto_id = p.id WHERE p.empresa_id = :empresaId`;
  - cada filtro presente acrescenta um `AND` fixo:
    - palavras: `p.busca_normalizada LIKE :palavra0 ESCAPE '\'` e assim por diante, todas com E, mas juntas num `( ... OR EXISTS (SELECT 1 FROM produto_codigos_barras c WHERE c.empresa_id = p.empresa_id AND c.produto_id = p.id AND lower(c.codigo) LIKE :codigo ESCAPE '\') )`;
    - categorias: `p.categoria_id = ANY(:categoriaIds)`, com array;
    - estoque `SEM`: `p.controla_estoque AND COALESCE(s.saldo,0) <= 0`;
    - estoque `BAIXO`: `p.controla_estoque AND (COALESCE(s.saldo,0) <= 0 OR COALESCE(s.saldo,0) <= COALESCE(p.ponto_reposicao, p.estoque_minimo))`;
    - promoção: `p.preco_promocional IS NOT NULL AND :hoje BETWEEN p.promocao_inicio AND p.promocao_fim`.
- **Fragmentos de ordem** (sempre terminando em `, p.nome_normalizado, p.id`):
  - margem: `CASE WHEN p.custo IS NULL OR p.preco_venda = 0 THEN 1 ELSE 0 END, (p.preco_venda - p.custo) / NULLIF(p.preco_venda,0) [DESC]`;
  - estoque: `CASE WHEN p.controla_estoque THEN 0 ELSE 1 END, COALESCE(s.saldo,0) [DESC]`.
- **Duas consultas:** `SELECT count(*)` e `SELECT p.id ... ORDER BY ... LIMIT :tamanho OFFSET :deslocamento`. O deslocamento é `long`.

- [ ] **Step 1:** escrever o `ConsultaDeProdutosIT`, com cenário de duas empresas, categorias em árvore, saldos e promoções criados via services ou JDBC:
  - busca:
    - `buscaSemAcento` ("acucar" encontra "Açúcar Cristal União");
    - `buscaPorPalavrasEmQualquerOrdem` ("uniao acucar");
    - `buscaPorMarca`;
    - `buscaPorParteDoCodigo`;
    - `buscaComCuringasLiterais` ("50%" não casa com tudo);
  - status: `statusAtivosPadrao`, `statusInativos`, `statusTodos`;
  - categoria: `categoriaIncluiDescendentes` e `conjuntoVazioDeCategoriasRetornaNada`;
  - estoque:
    - `estoqueSem`;
    - `estoqueBaixoPeloPonto`;
    - `estoqueBaixoPeloMinimoSemPonto`;
    - `estoqueBaixoIncluiZerados`;
    - `estoqueIgnoraQuemNaoControla`;
  - promoção: `promocaoVigenteNosLimites` (início e fim incluídos; um dia antes e um dia depois, fora);
  - `filtrosCombinados`;
  - ordem:
    - cada valor do enum nas duas direções, com uma asserção de ordem;
    - `margemSemCustoSempreNoFim` e `estoqueSemControleSempreNoFim`, nas duas direções (Review Focus 3);
    - `desempateEstavelEntrePaginas` (10 produtos com o mesmo preço, tamanho 3: a união das páginas tem os 10, sem repetir);
  - paginação: `paginacaoTotalEMeio` e `paginaAlemDoFimVaziaComTotal`;
  - `isolamentoPorEmpresa`.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `./mvnw -q verify`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): consulta paginada de produtos com filtros e ordenacao`.

### Task 3: Service, controller e contrato

**Files:**
- Modify: `catalog/ProdutoService.java` (`listarParaUsuario` com a nova assinatura), `catalog/ProdutoController.java`, `catalog/ProdutoRepository.java` (`buscarComRelacoesPorIds`) e a OpenAPI
- Remove: `buscarPorEmpresa` e `buscarPorEmpresaComBusca` do repositório, e os testes que só os cobriam (migrar o que valer para o IT da Task 2)
- Test: `ProdutoServiceTest`, `ProdutoControllerTest` e `CatalogoServiceIT` (ou `ListagemDeProdutosIT`)

**Interfaces:**
- **Consumes:** as Tasks 1 e 2.
- **Produces:**
  - `ProdutoService.listarParaUsuario(Long idUsuario, ParametrosDaListagem parametros): PaginaResponse<ProdutoResponse>`, com `record ParametrosDaListagem(String busca, String status, UUID categoria, String estoque, Boolean promocao, String ordem, int pagina, int tamanho)`;
  - `ProdutoRepository.buscarComRelacoesPorIds(Long empresaId, Collection<Long> ids): List<Produto>`, uma JPQL com os `JOIN FETCH` atuais e `WHERE p.id IN :ids AND p.empresa.id = :empresaId`. A ordem é reconstruída em memória pelos ids da `PaginaDeIds`.
  - Controller `GET /api/produtos`, com `@RequestParam`:
    - `busca`, `status` (padrão `ativos`), `categoria` (UUID), `estoque`, `promocao`, `ordem` (padrão `nome`), `pagina` (padrão 0) e `tamanho` (padrão 25);
    - devolve `PaginaResponse<ProdutoResponse>`;
    - o parâmetro `ativo` sai.
- **Regras do service:**
  - **`Paginacao.validar`** nos parâmetros de página.
  - **Status e estoque:** `status`/`estoque` inválidos → 400 (`"Status inválido."` / `"Filtro de estoque inválido."`, com `campo`).
  - **`busca`:** normalizar; se `palavras` vier vazia e o termo de código (`CodigoBarras.normalizar`) for nulo, é sem busca (Review Focus 1). Os padrões vêm de `PadraoLike.contem` aplicado a cada palavra e ao termo de código.
  - **Categoria:** UUID de outra empresa ou inexistente → `categoriaIds = Set.of()` (lista vazia). Os ids vêm de `CategoriaArvore.idsDaSubarvore`.
  - **`hoje`:** `SituacaoPromocao.hoje(relogio)`.
  - **Montagem da resposta:** a árvore de categorias uma vez, `usoNoEstoque.resumos` uma vez para os ids da página e `ProdutoResponse.de` na ordem dos ids.

- [ ] **Step 1:** escrever os testes:
  - controller:
    - `listarSemParametrosUsaPadroes` (o mock recebe status `ativos`, ordem `nome`, página 0 e tamanho 25);
    - `ordemInvalida_400ComCampoOrdem`;
    - `statusInvalido_400`;
    - `estoqueInvalido_400`;
    - `categoriaUuidMalformado_400`;
    - `tamanho101_400`;
    - `respostaEhPagina` (JSON com `itens`, `pagina`, `tamanho` e `totalItens`);
  - service: `buscaSoComEspacosUnicodeEhSemBusca` (NBSP, U+2007 e espaços; nunca lança);
  - IT:
    - `listagemPreservaAOrdemDosIds`;
    - `categoriaDeOutraEmpresaRetornaVazio`;
    - `paginaAlemDoFimRetornaTotal`;
    - `numeroDeConsultasConstante` (via `Statistics` do Hibernate somado às consultas JDBC contadas por um spy ou pela contagem de chamadas da `ConsultaDeProdutos`: a página com 3 itens e a com 25 têm o mesmo número de comandos).
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar e atualizar a OpenAPI (parâmetros e resposta paginada).
- [ ] **Step 4:** rodar `./mvnw verify` e reportar as contagens reais.
- [ ] **Step 5:** commit `feat(produtos): listagem paginada com busca, filtros e ordenacao`.

### Task 4: Infraestrutura do frontend (API, URL, atraso, paginação)

**Files:**
- Modify:
  - `frontend/src/services/httpClient.ts`: `apiGet(path, { autenticada, signal })` repassa `signal` ao `fetch`; um aborto lança o `AbortError` original, não um `HttpError` de rede;
  - `frontend/src/services/produtoService.ts`: `listarProdutos(params: FiltrosDaListaDeProdutos & { pagina: number; tamanho?: number }, signal?: AbortSignal): Promise<PaginaResponse<Produto>>`;
  - `frontend/src/types/produto.ts`: `type OrdemProdutos`, `type StatusFiltro = 'ativos' | 'inativos' | 'todos'` e `type EstoqueFiltro = 'baixo' | 'sem'`.
- Create:
  - `frontend/src/features/products/listagem/useFiltrosDaListaDeProdutos.ts`;
  - `frontend/src/hooks/useBuscaComAtraso.ts`;
  - `frontend/src/components/ui/paginacao-lista.tsx`;
  - os testes de cada um.

**Interfaces:**
- **Produces:**
  - `interface FiltrosDaListaDeProdutos { busca: string; status: StatusFiltro; categoria: string | null; estoque: EstoqueFiltro | null; promocao: boolean; ordem: OrdemProdutos; pagina: number /* 1-based */ }`;
  - `useFiltrosDaListaDeProdutos(): { filtros: FiltrosDaListaDeProdutos; alterar(parcial: Partial<FiltrosDaListaDeProdutos>): void; limpar(): void; temFiltroAtivo: boolean }`:
    - lê e escreve `useSearchParams`, sem os valores padrão na URL;
    - qualquer mudança que não seja de `pagina` reinicia a `pagina` em 1;
    - mudança de `busca` usa `replace: true`, e as demais `replace: false`;
    - valores inválidos na URL viram o padrão;
  - `useBuscaComAtraso(valor: string, atrasoMs = 300): string`;
  - `<PaginacaoLista pagina total tamanho aoMudar(pagina) />`: "1–25 de 1.240", Anterior/Próxima, "Página 2 de 50" e um campo numérico para ir a uma página, com `aria-label`s;
  - em `catalogoQuery.ts`: `chaveDaListaDeProdutos(filtros)` = `['produtos', 'lista', filtros]`, debaixo do prefixo `['produtos']` que as mutações já invalidam.

- [ ] **Step 1:** escrever os testes:
  - `httpClient`: `apiGetRepassaSignal` e `abortoNaoViraErroDeRede`;
  - hook da URL:
    - `lePadroesSemParametros`;
    - `escreveSoValoresNaoPadrao`;
    - `mudarFiltroVoltaParaPagina1`;
    - `mudarPaginaMantemFiltros`;
    - `valorInvalidoNaUrlViraPadrao` (`ordem=xyz`, `pagina=-3`, `pagina=abc`);
    - `buscaSubstituiHistorico`;
  - `useBuscaComAtraso` (relógio falso): só emite depois de 300 ms parado;
  - `PaginacaoLista`: os textos "1–25 de 60" e "Página 1 de 3", Anterior desabilitado na primeira, Próxima desabilitado na última e o campo de ir para a página limitado a 1..último;
  - service: a URL com todos os parâmetros, a página 1-based enviada como 0-based e `signal` repassado.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npm test`, `npm run lint` e `npm run typecheck`. Esperado: PASS (os testes da lista atual podem quebrar; eles são reescritos na Task 5).
- [ ] **Step 5:** commit `feat(produtos): infraestrutura de URL, busca com atraso e paginacao da lista`.

### Task 5: Tela da lista (filtros, tabela, cards, estados)

**Files:**
- Create, em `frontend/src/features/products/listagem/`: `FiltrosProdutos.tsx`, `TabelaProdutos.tsx`, `CardsProdutos.tsx` (extraídos dos cards atuais) e `AcoesDoProduto.tsx` (Editar, Ajustar estoque e Inativar/Reativar, compartilhado entre a tabela e os cards)
- Modify: `features/products/ProdutosListaPage.tsx` (só a composição) e `ProdutosListaPage.test.tsx` (reescrito)

**Interfaces:**
- **Consumes:** a Task 4 e o `ModalAjusteEstoque`, `SeloSituacaoEstoque`, `PrecoDoProduto` e selos que já existem.
- **Comportamento:**
  - **Consulta:** `useQuery({ queryKey: chaveDaListaDeProdutos({...filtros, busca: buscaComAtraso}), queryFn: ({ signal }) => listarProdutos(..., signal), placeholderData: keepPreviousData })`.
  - **Busca:** o campo mantém o texto local; Enter força a busca imediata (aplica `alterar({ busca })` na hora). O indicador "Buscando…" aparece quando `isFetching` e o texto difere do último termo aplicado ou a consulta está em andamento.
  - **Categorias:** vêm da consulta de categorias que já existe (o seletor da Fase A). Uma categoria da URL que não está na lista mostra "Todas" no select, e a lista vazia mostra "Limpar filtros".
  - **Tabela e cards:** a tabela com `aria-sort` nos cabeçalhos ordenáveis aparece em `md:` e acima, e os cards em `md:hidden`. Use CSS (`hidden md:table` / `md:hidden`), sem `matchMedia`.
  - **Página além do fim:** se `itens` vier vazio com `totalItens > 0`, chama `alterar({ pagina: últimaPágina })` uma única vez (Review Focus 2), com guarda contra laço.
  - **Troca de página:** `scrollIntoView` no título da lista e foco no título (`tabIndex=-1`).
  - **Estados:**
    - esqueleto na primeira carga;
    - opacidade enquanto `isPlaceholderData`;
    - erro com "Tentar de novo";
    - vazio sem filtro: "Nenhum produto cadastrado ainda." e o botão "Cadastrar produto" (ADMIN);
    - vazio com filtro: "Nenhum produto encontrado para 'x'." ou "Nenhum produto encontrado com os filtros escolhidos.", e "Limpar filtros".
  - **Filtros no celular:** o botão "Filtros (2)" abre e fecha o bloco; no desktop os filtros ficam sempre visíveis.

- [ ] **Step 1:** reescrever o `ProdutosListaPage.test.tsx`:
  - busca:
    - digitar aguarda 300 ms e então chama `listarProdutos` com a `busca`;
    - Enter chama na hora;
    - uma resposta atrasada do termo antigo não aparece (Review Focus 4: dois termos, o primeiro com promessa resolvida depois, e a tela mostra o segundo);
    - apagar tudo volta à lista sem busca;
  - filtros: cada um chama a API com o parâmetro e volta para a página 1;
  - "Limpar filtros" restaura os padrões;
  - ordenação: o clique no cabeçalho Preço alterna `aria-sort` entre `ascending` e `descending`, e o select acompanha;
  - paginação:
    - Próxima chama `pagina: 1` (0-based);
    - a página da URL (`?pagina=3`) é respeitada;
    - página além do fim vai para a última (Review Focus 2);
  - estados: carregando, erro com "Tentar de novo", vazio sem filtro, vazio com filtro e itens antigos visíveis durante a troca;
  - a categoria inexistente da URL mostra "Todas" e "Limpar filtros" (Review Focus 5);
  - ações:
    - Editar navega;
    - Ajustar estoque abre o modal;
    - Inativar e Reativar chamam a API e invalidam;
    - voltar da edição restaura filtros e página.
- [ ] **Step 2:** rodar os testes. Esperado: FAIL.
- [ ] **Step 3:** implementar.
- [ ] **Step 4:** rodar `npm test`, `npm run lint`, `npm run typecheck` e `npm run build`. Esperado: PASS.
- [ ] **Step 5:** commit `feat(produtos): lista com tabela, filtros, ordenacao e paginacao`.

### Task 6 (CTO): integração e documentação
- [ ] Aplicar a V10 no banco de dev com backup antes, conferindo antes e depois (30 produtos com as duas colunas preenchidas).
- [ ] Smoke da API: busca sem acento, por palavras e por código; cada filtro e combinações; cada ordem; paginação; os 400.
- [ ] Navegador:
  - digitar na busca;
  - filtros;
  - ordenar pelo cabeçalho;
  - paginar (com `tamanho` pequeno via URL de teste ou cadastrando produtos);
  - voltar da edição;
  - celular (`resize_window` mobile).
- [ ] Atualizar o status da spec, `produtos.md`, `docs/modules/README.md` (Fase E ✔), os READMEs, `technical-debt.md` (DT-020 resolvida para Produtos e uma DT nova do trigrama, se fizer sentido) e a memória.
- [ ] Rodar `./mvnw verify`, `npm run lint && npm run typecheck && npm test && npm run build` e `git status`.
