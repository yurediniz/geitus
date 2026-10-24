# Produtos Fase B5 (Fornecedores e Fabricantes/Marcas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Neste projeto, a execução é orquestrada pelo CTO: as tasks 1–5 ficam com o `back-end-executor` e as 6–8 com o `front-end-executor`, em paralelo, **depois que a Fase B4 estiver commitada** (a B5 amplia o modal e o ajuste da B4).

**Goal:** a aba Marcas (árvore como Categorias), a aba Fornecedores (cadastro com representantes, marcas e produtos que vende), o produto com marca do cadastro e lista de fornecedores com o da última compra, e o fornecedor opcional na entrada por compra.

**Architecture:**
- **Backend:**
  - a árvore das Categorias vira um componente genérico (`catalog/arvore`), usado por Categorias e Marcas;
  - Marcas ficam em `catalog/marca`;
  - Fornecedores ficam num domínio novo, `supplier` (`com.geitus.app.supplier`), como `customer`;
  - a ligação produto ↔ fornecedor (`produto_fornecedores`) pertence ao catalog, que a expõe ao supplier e ao inventory por interfaces;
  - uma migration V14 com a migração do texto.
- **Frontend:**
  - os componentes da árvore de Categorias ganham textos parametrizados e passam a servir às Marcas;
  - uma feature nova, `features/suppliers` (lista e formulário);
  - o produto e o modal de ajuste ganham os campos de fornecedor.

**Tech Stack:** Java 21, Spring Boot 3.5, JPA/Hibernate 6, Flyway, PostgreSQL 16, Testcontainers; React 19, TS, RHF + Zod 4, TanStack Query v5, React Router 7, Vitest.

**Spec:** [`docs/modules/fornecedores-e-marcas.md`](../../modules/fornecedores-e-marcas.md) (DEC-039). As regras das marcas estão em [`categorias-e-unidades.md`](../../modules/categorias-e-unidades.md) §4, e a base do ajuste em [`produtos-custo-entrada.md`](../../modules/produtos-custo-entrada.md) (B4).

## Global Constraints
- **Migrations:** só a nova `V14__fornecedores_marcas.sql`; V1–V13 intocadas. A migração do texto confere e para com `RAISE EXCEPTION` se algum produto ficar sem ligação.
- **Isolamento:** por empresa (DEC-016), com FKs compostas. Só UUID é exposto (DEC-019). Fornecedor e marca de outra empresa dão 404.
- **Perfis:** leitura para qualquer autenticado; escrita (marcas, fornecedores, produtos do fornecedor) só ADMIN, em `SecurityConfig`.
- **Validação:** CNPJ, CPF e telefone com os validadores de `shared/validation` (`Cnpj`, `Cpf`, `Telefone`), e o CEP com a busca de CEP já usada em Empresa (`services/cepService.ts`).
- **Limites:** 10 representantes, 200 marcas por fornecedor, 20 fornecedores por produto, 25 por página.
- **Mensagens:** as exatas da spec §3.1, §4.6, §5 e §6.
- **Listagem de fornecedores:** paginada e com busca sem acento, nos padrões da Fase E (`PaginaResponse`, `TextoDeBusca`, SQL só com fragmentos fixos).
- **Dependências e escopo:** nenhuma dependência nova; nada de NF-e, consulta externa de CNPJ, contas a pagar ou filtro da listagem por marca/fornecedor.
- **Commits:** em pt-BR, com pathspec `-- backend/` ou `-- frontend/`, sem `add -A`/`stash`, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **Fornecedor removido da lista do produto (pela tela do produto ou pela do fornecedor) quando ele é o da última compra.** Esperado: o campo do produto é limpo **antes** de apagar a ligação, nunca 500 pela FK composta. Testes nas Tasks 4 e 5.
2. **Duas marcas em texto que diferem só por maiúsculas e espaços ("Golden", "golden ") em produtos diferentes.** Esperado: uma marca só, com a grafia do produto de menor `id`, e os dois produtos ligados. O mesmo para fornecedores. Teste na Task 2.
3. **Renomear uma marca usada por 30 produtos.** Esperado: a busca da listagem acha os 30 pelo nome novo e não acha pelo antigo, numa transação só e sem N+1 por produto (um `UPDATE` em lote). Teste na Task 3.
4. **Fornecedor PF com IE informada, ou troca de PJ para PF com IE preenchida.** Esperado: 400 "Inscrição estadual só para pessoa jurídica."; na tela, a IE some e é limpa ao trocar para PF. Testes nas Tasks 4 e 7.
5. **Entrada por compra com fornecedor num produto em que ele ainda não está na lista, com a mesma chave repetida.** Esperado: uma ligação só, um movimento só, e o último fornecedor definido. Com outro fornecedor na mesma chave, 409. Teste na Task 5.

---

### Task 1: Árvore genérica (refatoração, sem mudança de comportamento)

**Files:**
- Create:
  - `backend/src/main/java/com/geitus/app/catalog/arvore/Arvore.java`;
  - `catalog/arvore/NoDaArvore.java` (interface).
- Modify:
  - `catalog/categoria/CategoriaArvore.java`: delega à `Arvore<Categoria>`, ou é substituída por ela, mantendo a API pública que os usos atuais chamam;
  - `catalog/categoria/Categoria.java`: implementa `NoDaArvore`.
- Test: `ArvoreTest` (unitário). Os testes atuais de categoria continuam verdes, sem edição de asserção.

**Interfaces:**
- **Produces:**
  - `interface NoDaArvore { Long getId(); Long getPaiId(); String getNome(); boolean isAtivo(); UUID getUuid(); }`;
  - `final class Arvore<T extends NoDaArvore>`, com:
    - `static <T> Arvore<T> de(List<T>)`;
    - `caminho(Long)` (separador " › ") e `nivel(Long)`;
    - `selecionavel(Long)`;
    - `buscarPeloUuid(UUID)`;
    - `idsDaSubarvore(Long)`;
    - `criariaCiclo(Long id, Long novoPaiId)`;
    - `quantidadeFilhos(Long)`;
    - `nomeEmUsoEntreIrmaos(Long paiId, String nome, Long ignorarId)`;
    - `ordenadosPorCaminho()`.

- [ ] Escrever `ArvoreTest` com os casos que hoje estão em `CategoriaArvore`:
  - caminho;
  - ciclo;
  - subárvore;
  - nome entre irmãos sem diferenciar maiúsculas;
  - selecionável com ancestral inativo.
- [ ] Extrair e rodar `./mvnw verify`.
- [ ] Commit `refactor(catalogo): arvore generica para categorias e marcas`.

### Task 2: V14 e entidades

**Files:**
- Create:
  - `backend/src/main/resources/db/migration/V14__fornecedores_marcas.sql`;
  - `catalog/marca/Marca.java`;
  - `supplier/Fornecedor.java`, `supplier/RepresentanteDeVenda.java`, `supplier/package-info.java`;
  - `catalog/ProdutoFornecedor.java` (entidade da ligação, PK composta `@EmbeddedId`).
- Modify:
  - `catalog/Produto.java`:
    - remove `marca` e `fornecedor` (texto);
    - adiciona `marca` (`@ManyToOne Marca`), `fornecedores` (coleção de `ProdutoFornecedor`) e `fornecedorUltimaCompraId`;
    - `TextoDeBusca.textoDoProduto` recebe o nome da marca.
  - `shared/numeracao/TipoNumeracao.java`: `FORNECEDOR`.
  - `inventory/MovimentoEstoque.java`: `fornecedorId` (`Long`, nulo, `updatable=false`).
  - O mínimo de `ProdutoService` e dos DTOs para compilar. O contrato novo vem nas Tasks 3 e 5.
- Test: `backend/src/test/java/com/geitus/app/catalog/MigracaoV14IT.java`.

**Interfaces:**
- **Produces:**
  - `Marca implements NoDaArvore`;
  - `Fornecedor`: campos da spec §4.1, `numero`, `representantes` (`@OneToMany`, cascade, `orphanRemoval`, `@OrderBy("ordem")`) e `marcas` (`@ManyToMany` em `fornecedor_marcas`);
  - `ProdutoFornecedor(empresa, produto, fornecedorId)`. O catalog guarda o id do fornecedor, sem `@ManyToOne` para `supplier`, para não criar dependência de pacote. O nome vem pela interface da Task 5.
- **V14:** exatamente a spec §7, inclusive a ordem da migração do texto, mais a coluna `fornecedores.busca_normalizada TEXT COLLATE "C" NOT NULL` (Task 4), preenchida na migração com o nome normalizado como na V10.
  - Ponto de atenção para a FK composta `produtos (empresa_id, id, fornecedor_ultima_compra_id) → produto_fornecedores`: excluir o produto apaga as ligações em cascata enquanto a linha do produto ainda as referencia. Confirme no IT que a exclusão física de um produto **com** o último fornecedor funciona. Se não funcionar, use `DEFERRABLE INITIALLY DEFERRED` nessa FK.

- [ ] Escrever `MigracaoV14IT`:
  - "Golden" e "golden " → uma marca na raiz, com os dois produtos ligados (Review Focus 2);
  - marcas iguais em empresas diferentes → uma marca por empresa;
  - fornecedor do texto → criado, numerado, na lista e como último;
  - colunas `marca` e `fornecedor` removidas;
  - CHECKs do fornecedor: documento 14 no PJ e 11 no PF, UF, CEP, IE dígitos ou ISENTO, texto aparado;
  - documento único por empresa (o nulo repetido passa);
  - nome de marca repetido entre irmãos → violação;
  - último fornecedor fora da lista → violação da FK;
  - produto com último fornecedor excluído → passa;
  - `fornecedor_id` no movimento só em ENTRADA + COMPRA;
  - fornecedor e marca de outra empresa nas ligações → FK;
  - `numeracoes` com `FORNECEDOR`.
- [ ] Ver falhar, implementar e rodar `./mvnw verify`.
- [ ] Commit `feat(catalogo): migration V14 de fornecedores e marcas`.

### Task 3: Marcas (API) e marca no produto

**Files:**
- Create: `catalog/marca/MarcaRepository.java`, `MarcaService.java`, `MarcaController.java` e `dto/*`, espelhando `catalog/categoria`.
- Modify:
  - `ProdutoRequest` (`marcaId`) e `ProdutoResponse` (`marca: {id, nome, caminho}`);
  - `ProdutoService` (resolve e valida a marca como faz com a categoria; remove a sugestão `campo=marca`);
  - `SecurityConfig` (`/api/marcas/**`).
- Test: `MarcaServiceTest`, `MarcaControllerIT` (ou o IT de catálogo existente) e o IT do produto.

**Interfaces:**
- **Produces:**
  - `/api/marcas`, com a resposta da spec §3.2;
  - `MarcaService.renomear(...)` atualiza `busca_normalizada` dos produtos da marca com **um** `UPDATE` em lote (Review Focus 3). O texto do produto é recalculado em Java por `TextoDeBusca.textoDoProduto(nome, nomeCurto, sku, nomeDaMarca)`: os produtos da marca são lidos numa consulta só e gravados com `batchUpdate` do `NamedParameterJdbcTemplate`, sem carregar entidades, na transação do renomear.
- **Exclusão:** conta submarcas, produtos **e fornecedores** (`fornecedor_marcas`) e dá 409 com a mensagem da spec §3.1.

- [ ] Testes:
  - **Árvore:** todas as regras de Categorias com os textos de marca (criar, mover, ciclo, nome entre irmãos, inativar, excluir com cada tipo de vínculo);
  - **Produto:** `marcaId` de outra empresa → 404; marca inativa só se já for a atual; a busca pelo nome da marca;
  - **Renomear:** a busca acha pelo nome novo e não pelo antigo (Review Focus 3);
  - **Sugestão:** `GET /api/produtos/sugestoes?campo=marca` → 400.
- [ ] Commit `feat(catalogo): cadastro de marcas e marca no produto`.

### Task 4: Fornecedores (API)

**Files:**
- Create:
  - `supplier/FornecedorRepository.java`, `FornecedorService.java`, `FornecedorController.java`;
  - `supplier/listagem/ConsultaDeFornecedores.java`;
  - `supplier/dto/*`.
- Modify: `SecurityConfig` (`/api/fornecedores/**`).
- Test: `FornecedorServiceTest` e `FornecedorIT`.

**Interfaces:**
- **Consumes:**
  - `Numerador`;
  - validadores de `shared/validation`;
  - `MarcaRepository` (para os `marcaIds`);
  - a interface `ProdutosDoFornecedor` declarada no catalog (Task 5) para a lista de produtos e as contagens.
  - Como essa interface pertence à Task 5, a Task 4 a **declara** e a Task 5 a implementa; para os testes da Task 4, use a implementação real se a Task 5 já existir, ou um dublê.
- **Produces:**
  - os endpoints da spec §4.7, com request, response e item da listagem exatamente como na spec;
  - campos de erro: `razaoSocial`, `documento`, `inscricaoEstadual`, `cep`, `uf`, `email`, `telefone`, `representantes[j].nome`, `representantes` e `marcaIds`;
  - busca sem acento por nome, fantasia, documento (só dígitos do termo), Nº (termo numérico) e nome do representante. Use a coluna `fornecedores.busca_normalizada TEXT COLLATE "C" NOT NULL`, criada pela V14 (Task 2) e calculada em Java a cada gravação (razão social, nome fantasia e nomes dos representantes, normalizados com `TextoDeBusca`). O documento e o Nº são comparados nas próprias colunas.
- **Exclusão:** 409 com a mensagem da spec §4.5, com as contagens de produtos (pela interface) e de movimentos (pela consulta ao inventory, também por interface do inventory ou do catalog).

- [ ] Testes:
  - **Cadastro e validações:**
    - só a razão social obrigatória;
    - CNPJ e CPF inválidos e repetidos (mensagem com o nome do outro);
    - IE: dígitos, ISENTO, e no PF dá 400 (Review Focus 4);
    - CEP e UF;
    - e-mail e telefone.
  - **Listas do fornecedor:**
    - representantes (lista completa com `id`, ordem, limite 10, nome obrigatório indexado);
    - marcas (limite 200, repetida, de outra empresa → 404).
  - **Busca e listagem:** cada critério da busca; paginação e status.
  - **Status e exclusão:** inativar e reativar; excluir sem vínculos → 204; com produto ou movimento → 409.
  - **Acesso:** OPERADOR na escrita → 403; isolamento entre empresas.
- [ ] Commit `feat(fornecedores): cadastro de fornecedores com representantes e marcas`.

### Task 5: Fornecedores no produto, produtos do fornecedor e entrada por compra

**Files:**
- Create:
  - `catalog/ProdutosDoFornecedor.java` (interface, implementada no catalog);
  - `catalog/FornecedoresDoProduto.java` (`@Component` com as regras de §5);
  - `catalog/NomesDeFornecedores.java` (interface implementada no `supplier`, para o catalog obter número, nome e ativo dos fornecedores por id, em lote).
- Modify:
  - `ProdutoRequest` (`fornecedorIds`, `fornecedorUltimaCompraId`) e `ProdutoResponse` (`fornecedores`, `fornecedorUltimaCompra`); remove a sugestão `campo=fornecedor`;
  - `supplier/FornecedorController`: os três endpoints de produtos do fornecedor;
  - `inventory/dto/AjusteEstoqueRequest.java` (`fornecedorId`) e `MovimentoEstoqueResponse` (`fornecedor: {id, nome} | null`);
  - `inventory/EstoqueService.java`;
  - a nota do custo da B4 (`custoOrigem` ganha `fornecedorNome`).
- Test: `ProdutoFornecedoresIT`, a parte de produtos no `FornecedorIT` e o `EstoqueServiceIT`.

**Interfaces:**
- **Produces:**
  - `ProdutosDoFornecedor`, com:
    - `pagina(empresaId, fornecedorId, pagina, tamanho)`;
    - `ligar(empresaId, fornecedorId, produtoUuid)`, idempotente: 201 na criação e 200 se já existia;
    - `desligar(empresaId, fornecedorId, produtoUuid)`, que limpa o último antes (Review Focus 1);
    - `contar(empresaId, fornecedorId)`.
  - `FornecedoresDoProduto.aplicar(produto, fornecedorIds, ultimaCompraId)`, com as regras e mensagens de §5, até 20, e o último na lista.
  - `FornecedoresDoProduto.registrarCompra(produto, fornecedorId)`: liga se faltar e define o último. É usado pelo inventory na transação do ajuste.
- **Ajuste**, regras novas depois das da B4:
  - `fornecedorId` fora de ENTRADA + COMPRA → 400 "O fornecedor só é informado na entrada por compra.";
  - inexistente ou de outra empresa → 404;
  - inativo → 400 "Este fornecedor está inativo.".
  - Na idempotência, o `fornecedorId` também entra na comparação.
- **Response do produto:** `fornecedores` ordenados por nome, com `{id, numero, nome, ativo}`.

- [ ] Testes:
  - **No produto:**
    - lista e último;
    - último fora da lista → 400;
    - outra empresa → 404;
    - inativo novo → 400, e o já ligado é aceito;
    - limite de 20;
    - PATCH sem a lista mantém;
    - tirar da lista o último limpa o campo (Review Focus 1).
  - **Pelo fornecedor:** ligar duas vezes → uma ligação; desligar o último limpa o campo do produto.
  - **Entrada por compra com fornecedor novo:** ligado, último definido, `fornecedor_id` no movimento.
  - **Erros e idempotência:** fornecedor em SAIDA → 400; inativo → 400; chave repetida igual → um movimento e uma ligação, e com outro fornecedor → 409 (Review Focus 5).
  - **Respostas:** `custoOrigem.fornecedorNome` e o movimento com o fornecedor.
- [ ] Commit `feat(fornecedores): fornecedores no produto e na entrada por compra`.

### Task 6: Frontend — abas e Marcas

**Files:**
- Modify:
  - `features/products/CatalogoNav.tsx`: abas na ordem da spec §2;
  - as rotas;
  - `features/catalog/ArvoreCategorias.tsx`, `MoverCategoriaDialog.tsx`, `FormularioNomeCategoria.tsx`, `ConfirmarExclusaoDialog.tsx` e `textosCatalogo.ts`: ficam genéricos, por uma configuração de textos e serviço (`tipo: 'categoria' | 'marca'`), sem duplicar componentes;
  - `features/products/SeletorCategoria.tsx`: vira um `SeletorDaArvore`, que serve a categoria e a marca.
- Create:
  - `features/catalog/MarcasPage.tsx` (+ teste);
  - `services/marcaService.ts` (+ teste);
  - os tipos em `types/catalogo.ts`.
- Modify o produto:
  - `secoes/SecaoGeral.tsx`: o campo Marca vira o seletor, e o `CampoSugestao` de marca sai;
  - `produtoFormulario.ts` (`marcaId`);
  - `types/produto.ts`.
- Test: `MarcasPage.test.tsx`, `CategoriasPage.test.tsx` (continua verde) e `ProdutoPage.test.tsx`.

- [ ] Testes:
  - a ordem das abas;
  - a tela de Marcas com título "Fabricantes e marcas" e as contagens "N produtos · M fornecedores";
  - criar submarca, mover, inativar e excluir com 409;
  - no produto, o seletor de marca com busca pelo caminho e "+ Nova";
  - o request com `marcaId`.
- [ ] Commit `feat(catalogo): aba de marcas e seletor de marca no produto`.

### Task 7: Frontend — Fornecedores (lista e formulário)

**Files:**
- Create:
  - `features/suppliers/FornecedoresPage.tsx` (lista);
  - `FornecedorPage.tsx` (cadastro e edição);
  - `fornecedorFormulario.ts` (Zod e mapeamentos);
  - `secoes/*`;
  - `ProdutosDoFornecedor.tsx`;
  - `services/fornecedorService.ts`;
  - `types/fornecedor.ts`;
  - os testes.
- Modify: `lib/documentos.ts`, com `mascararCnpj` e `cnpjValido` se ainda não existirem (veja a tela de Empresa).

**Reaproveitado:**
- o hook de alterações não salvas;
- a barra fixa e o rodapé da tela do produto, se forem genéricos (senão, só o padrão);
- `CampoSugestao` não entra;
- a busca de CEP (`cepService.buscarCep`);
- o filtro na URL da listagem de produtos (`useFiltrosDaListaDeProdutos` como modelo).

**Textos:** os da spec §8.2, §8.3 e §4.6.

- [ ] Testes:
  - **Lista:**
    - busca e status na URL;
    - tabela ≥ 1024 px e cards abaixo;
    - estados vazio ("Nenhum fornecedor cadastrado."), sem resultado, carregando e erro.
  - **Formulário — dados:**
    - PJ/PF trocando os rótulos ("Razão social"/"Nome") e escondendo e limpando a IE (Review Focus 4);
    - máscaras de CNPJ/CPF e telefone;
    - "Isento";
    - CEP preenchendo o endereço;
    - mensagens de §4.6.
  - **Formulário — listas:**
    - representantes com "+ Adicionar representante", remover e limite;
    - marcas como chips com o caminho.
  - **Produtos que vende:**
    - adicionar, remover e a confirmação do último;
    - "Salve o fornecedor para adicionar os produtos." no cadastro novo.
  - **Comportamento:** alterações não salvas; OPERADOR só lê; feedbacks.
- [ ] Commit `feat(fornecedores): telas de lista e cadastro de fornecedores`.

### Task 8: Frontend — fornecedores no produto e no ajuste

**Files:**
- Modify:
  - `secoes/SecaoGeral.tsx`: "Fornecedores" (seleção múltipla com busca, até 20, inativos marcados) e "Fornecedor da última compra"; o `CampoSugestao` de fornecedor sai;
  - `produtoFormulario.ts`;
  - `estoque/ModalAjusteEstoque.tsx`: o campo "Fornecedor" em Entrada + Compra, preenchido com o último;
  - `SecaoPrecos.tsx`: a nota do custo com o fornecedor;
  - o Histórico: "· Fornecedor: {nome}";
  - os tipos.

- [ ] Testes:
  - **Produto:** tirar da lista o último limpa o campo; o request tem `fornecedorIds` e `fornecedorUltimaCompraId`.
  - **Modal:** o campo só em Entrada + Compra, preenchido com o último; o envio de `fornecedorId`.
  - **Textos:** a nota do custo com "de {fornecedor}" e a linha do histórico.
- [ ] Commit `feat(fornecedores): fornecedores no produto e na entrada por compra (tela)`.

### Task 9: CTO

- [ ] **Revisores:**
  - `data-reviewer` (V14 e migração do texto, obrigatório);
  - `security-reviewer` (endpoints novos, dados de contato e documento, isolamento, obrigatório);
  - `back-end-reviewer`, `front-end-reviewer`, `product-ux-reviewer` (telas novas) e `qa-reviewer`.
- [ ] **Dev:** backup do banco, V14 aplicada e conferência (22 marcas na raiz, produtos ligados, 0 fornecedores migrados).
- [ ] **Smoke da API** e conferência no navegador:
  - abas;
  - marcas;
  - fornecedor completo com representantes, marcas e produtos;
  - produto;
  - entrada por compra com fornecedor;
  - celular.
- [ ] **Documentação:**
  - status e ajustes da spec;
  - `produtos.md`, `categorias-e-unidades.md` e o README dos módulos (um módulo novo, Fornecedores);
  - os READMEs;
  - a dívida técnica;
  - a memória.
- [ ] **Validação final:** `./mvnw verify` e o conjunto do frontend.
