# Fornecedores e Fabricantes/Marcas (Fase B5)

> **Status:** spec final, desenho aprovado em conversa em 2026-10-24. Fase intermediária da DEC-030, depois da Fase B4 ([produtos-custo-entrada.md](produtos-custo-entrada.md)) e antes da Fase F (imagem). Decisões na **DEC-039**.

## 1. Motivação
- **Hoje** a marca e o "Fornecedor principal" do produto são **texto livre** com autocomplete. Não há cadastro de fornecedor, nem como agrupar marcas por fabricante.
- **Pedido do usuário:**
  - duas abas novas em Produtos: **Fornecedores** e **Fabricantes/Marcas**;
  - **fornecedor:**
    - os dados do emitente da NF-e de compra;
    - representantes de venda (nome e telefone, vários, com "+");
    - as marcas e os produtos que ele vende;
  - **Fabricantes/Marcas** com a mesma lógica das Categorias.
- **Decisões do usuário (2026-10-24):**
  - marcas em **árvore livre**;
  - no fornecedor, **só o nome é obrigatório**;
  - o produto tem **vários fornecedores**, e um deles é o **"Fornecedor da última compra"**;
  - a lista é a mesma vista dos dois lados.
- **Fora desta fase:** nota fiscal de compra (Compras). Os campos ficam prontos para ela.

## 2. Abas de Produtos
- **Ordem:** Produtos · Categorias · **Marcas** · **Fornecedores** · Unidades · Balança.
- **Rotas:** `/produtos/marcas`, `/produtos/fornecedores`, `/produtos/fornecedores/novo` e `/produtos/fornecedores/:id`.
- **Título da tela de marcas:** "Fabricantes e marcas". A aba se chama "Marcas".

## 3. Fabricantes e marcas

### 3.1 Modelo e regras
- **Mesmo modelo e mesmas regras das Categorias** ([categorias-e-unidades.md](categorias-e-unidades.md) §4), trocando "categoria" por "marca":
  - tabela `marcas` (`id`, `uuid`, `empresa_id`, `parent_id`, `nome` 1–100, `ativo`, `criado_em`, `atualizado_em`);
  - nome único entre irmãos, sem diferenciar maiúsculas;
  - profundidade livre, sem ciclos;
  - caminho com " › " (ex.: "Boehringer › Nexgard › Nexgard Combo");
  - inativar tira o ramo do seletor, sem cascata.
- **Uso esperado:** o primeiro nível é o fabricante, e os seguintes são marcas e linhas. O sistema não diferencia os níveis.
- **Exclusão:** bloqueada se houver submarcas, produtos **ou fornecedores** ligados (409, com as contagens, ex.: "Não é possível excluir: há 1 submarca(s), 4 produto(s) e 2 fornecedor(es) nesta marca. Mova-os ou inative a marca.").
- **Mensagens:** as das Categorias, com "marca" e "submarca" no lugar de "categoria" e "subcategoria".
  - Ciclo: "Uma marca não pode ficar dentro dela mesma ou de uma submarca sua."

### 3.2 API `/api/marcas`
- **Endpoints:** os mesmos de `/api/categorias` (listar plano, criar, renomear/mover, inativar, reativar, excluir).
- **Perfis:** leitura para qualquer autenticado; escrita só ADMIN.
- **Resposta:** `id`, `nome`, `parentId`, `caminho`, `nivel`, `ativo`, `selecionavel`, `quantidadeSubmarcas`, `quantidadeProdutos`, `quantidadeFornecedores`, `criadoEm` e `atualizadoEm`.

### 3.3 No produto
- **Seletor de marca:** o campo de texto "Marca" (seção Geral) vira um seletor igual ao de categoria, com busca pelo caminho e "+ Nova", e qualquer nível pode ser escolhido.
- **Contrato:**
  - o request troca `marca` (texto) por `marcaId` (UUID, opcional);
  - a response traz `marca: { id, nome, caminho } | null`.
- **Busca da listagem:** continua achando o produto pelo **nome da marca escolhida** (não o caminho).
  - Renomear uma marca atualiza a busca dos produtos dela.
  - A sugestão `GET /api/produtos/sugestoes?campo=marca` deixa de existir.
- **Marca inativa:** como a categoria inativa, só é aceita se já for a marca atual do produto.

## 4. Fornecedores

### 4.1 Dados

| Campo | Obrigatório | Regra |
|---|---|---|
| Nº | gerado | Sequencial por empresa, imutável (`Numerador`, tipo `FORNECEDOR`), como em produtos e clientes. |
| Tipo | sim (padrão PJ) | `PJ` ou `PF`. |
| CNPJ / CPF | não | Só dígitos. CNPJ (14) no PJ e CPF (11) no PF, com dígitos verificadores validados como em Empresa e Clientes. **Único por empresa** quando informado. |
| Razão social / Nome | **sim** | 1–180. O rótulo é "Razão social" no PJ e "Nome" no PF. |
| Nome fantasia | não | até 180. |
| Inscrição estadual | não | até 20, só dígitos, ou "ISENTO" (o botão "Isento" preenche). Só no PJ. |
| Endereço | não | CEP (8 dígitos, com a busca de CEP de Empresa), logradouro, número, complemento, bairro, município e UF (sigla válida). Todos opcionais. |
| Telefone | não | até 20, com máscara. |
| E-mail | não | formato validado, até 180. |
| Observações | não | até 500. |
| Status | — | ativo/inativo. |

- **Normalização:** texto aparado; vazio vira nulo; documento e CEP guardados só com dígitos; UF em maiúsculas.

### 4.2 Representantes de venda
- **Lista com "+ Adicionar representante",** até **10**.
  - Nome obrigatório (1–120), telefone opcional (até 20) e e-mail opcional (até 180).
  - A ordem é a da tela. O primeiro aparece na listagem.
- **Lista completa no request**, como as embalagens (B3): `id` mantém, sem `id` cria, ausente remove.

### 4.3 Marcas que vende
- **Lista de itens da árvore de marcas** (qualquer nível), até 200.
  - Seletor com busca pelo caminho, que oferece só as selecionáveis. As inativas já ligadas continuam.
  - Sem repetição.
- **Escolher um fabricante não inclui os filhos automaticamente.** É uma lista de referência, sem efeito em preço ou estoque.

### 4.4 Produtos que vende
- **Ligação:** tabela `produto_fornecedores`, **a mesma lista** que aparece no produto (§5).
- **Na tela do fornecedor** (só na edição): busca de produto por nome ou código, botão "Adicionar" e lista paginada com "Remover".
- **Remover um fornecedor que é o da última compra do produto** limpa o "Fornecedor da última compra" desse produto. Isso é avisado na confirmação: "Este é o fornecedor da última compra de {produto}. Remover mesmo assim?".

### 4.5 Status e exclusão
- **Inativar:** o fornecedor some dos seletores (produto e entrada por compra) e continua onde já está ligado.
- **Excluir:** só se não houver **produtos ligados** nem **movimentos de estoque** com ele. Representantes e marcas ligadas saem junto.
  - Senão, 409: "Não é possível excluir: o fornecedor tem {n} produto(s) ligados e {m} entrada(s) registradas. Inative-o."

### 4.6 Mensagens

| Situação | Mensagem | Campo |
|---|---|---|
| Sem nome | "Informe a razão social." (PJ) / "Informe o nome." (PF) | `razaoSocial` |
| Documento inválido | "CNPJ inválido." / "CPF inválido." | `documento` |
| Documento repetido | "Já existe o fornecedor {nome} com este CNPJ." / "… com este CPF." | `documento` |
| IE inválida | "Informe só números ou ISENTO." | `inscricaoEstadual` |
| IE no PF | "Inscrição estadual só para pessoa jurídica." | `inscricaoEstadual` |
| CEP inválido | "O CEP deve ter 8 dígitos." | `cep` |
| UF inválida | "UF inválida." | `uf` |
| E-mail inválido | "E-mail inválido." | `email` |
| Representante sem nome | "Informe o nome do representante." | `representantes[j].nome` |
| Mais de 10 representantes | "Informe no máximo 10 representantes." | `representantes` |
| Mais de 200 marcas | "Informe no máximo 200 marcas." | `marcaIds` |

### 4.7 API `/api/fornecedores`

| Endpoint | Perfil | Respostas |
|---|---|---|
| `GET /api/fornecedores?busca=&status=&pagina=&tamanho=` | autenticado | 200, `PaginaResponse`, 25 por página, ordem por nome |
| `POST /api/fornecedores` | ADMIN | 201 / 400 / 409 |
| `GET /api/fornecedores/{id}` | autenticado | 200 / 404 |
| `PATCH /api/fornecedores/{id}` | ADMIN | 200 / 400 / 404 / 409 |
| `PATCH /api/fornecedores/{id}/inativar` · `/reativar` | ADMIN | 200 / 404 |
| `DELETE /api/fornecedores/{id}` | ADMIN | 204 / 404 / 409 |
| `GET /api/fornecedores/{id}/produtos?pagina=&tamanho=` | autenticado | 200 |
| `POST /api/fornecedores/{id}/produtos` (`{ produtoId }`) | ADMIN | 201 (ou 200 se já ligado) / 404 |
| `DELETE /api/fornecedores/{id}/produtos/{produtoId}` | ADMIN | 204 / 404 |

- **Busca:** sem acento, como a de produtos, por nome, nome fantasia, documento (com ou sem máscara), Nº e nome do representante.
- **Status:** `ativos` (padrão), `inativos` ou `todos`.
- **Request:** os campos de §4.1 e mais `representantes: [{ id?, nome, telefone?, email? }]` e `marcaIds: [UUID]`.
- **Response:** os campos, `numero`, `representantes`, `marcas: [{ id, nome, caminho }]`, `quantidadeProdutos`, `ativo` e as datas.
- **Listagem (item):** `id`, `numero`, `razaoSocial`, `nomeFantasia`, `tipoPessoa`, `documento`, `telefone`, `representantePrincipal: { nome, telefone } | null`, `quantidadeProdutos` e `ativo`.

## 5. Fornecedores no produto
- **Seção Geral:** o campo de texto "Fornecedor principal" sai, e entram dois campos:
  - **"Fornecedores":** seleção múltipla com busca, só dos ativos (os inativos já ligados aparecem marcados "(inativo)"), até 20;
  - **"Fornecedor da última compra":** escolhe um dos fornecedores da lista, ou nenhum. Ao tirar da lista o fornecedor que está nesse campo, o campo é limpo.
- **Contrato:**
  - o request troca `fornecedor` (texto) por `fornecedorIds: [UUID]` e `fornecedorUltimaCompraId: UUID | null`. No PATCH, `fornecedorIds` ausente mantém a lista;
  - a response traz `fornecedores: [{ id, numero, nome }]` e `fornecedorUltimaCompra: { id, numero, nome } | null`.
- **Regras:**
  - o fornecedor da última compra tem de estar na lista: senão, 400 "O fornecedor da última compra precisa estar na lista de fornecedores.";
  - fornecedor de outra empresa ou inexistente dá 404;
  - fornecedor inativo só é aceito se já estiver ligado.
- **A sugestão `campo=fornecedor` deixa de existir.**

## 6. Fornecedor na entrada por compra (amplia a Fase B4)
- **Campo opcional "Fornecedor"** no modal "Ajustar estoque", em Entrada + Compra, abaixo do custo:
  - seletor com busca, só dos ativos;
  - vem preenchido com o fornecedor da última compra do produto.
- **Ao gravar com fornecedor**, na mesma transação:
  - o movimento guarda `fornecedor_id`;
  - o fornecedor entra na lista do produto, se ainda não estiver;
  - passa a ser o **fornecedor da última compra**.
- **Sem fornecedor:** nada muda nos fornecedores do produto.
- **Fornecedor fora da compra:** em outro tipo ou motivo, dá 400 "O fornecedor só é informado na entrada por compra.".
- **Idempotência:** a chave repetida com outro fornecedor dá 409.
- **Histórico:** o movimento mostra "· Fornecedor: {nome}".
- **Nota do custo** (B4): passa a citar o fornecedor, "Último custo de entrada: R$ 10,00 em 24/10/2026 (2 CX c/ 18 UN), de {fornecedor}.".

## 7. Banco — migration `V14__fornecedores_marcas.sql`
Aditiva sobre a V13, que não é editada.
- **`marcas`:** como `categorias` (V6), com as mesmas constraints, índice único de nome entre irmãos e FK do pai, e `UNIQUE (empresa_id, id)`.
- **`fornecedores`:**
  - colunas de §4.1, com `numero BIGINT NOT NULL` e `UNIQUE (empresa_id, numero)`;
  - índice único parcial `(empresa_id, documento) WHERE documento IS NOT NULL`;
  - CHECKs de tamanho do documento por tipo, de UF, de CEP só dígitos, da IE (`ISENTO` ou dígitos) e de texto aparado;
  - `UNIQUE (empresa_id, id)`.
- **`fornecedor_representantes`:** `id`, `uuid`, `empresa_id`, `fornecedor_id` (FK composta, `ON DELETE CASCADE`), `nome`, `telefone`, `email`, `ordem`.
- **`fornecedor_marcas`:** `(empresa_id, fornecedor_id, marca_id)` como PK, com FKs compostas (`CASCADE` pelo fornecedor e `RESTRICT` pela marca) e índice em `marca_id`.
- **`produto_fornecedores`:** `(empresa_id, produto_id, fornecedor_id)` como PK, com FKs compostas (`CASCADE` pelo produto e `RESTRICT` pelo fornecedor) e índice em `fornecedor_id`.
- **`produtos`:**
  - `marca_id BIGINT NULL`, com FK composta para `marcas`;
  - `fornecedor_ultima_compra_id BIGINT NULL`, com **FK composta `(empresa_id, id, fornecedor_ultima_compra_id) → produto_fornecedores (empresa_id, produto_id, fornecedor_id)`**, que garante no banco que o último está na lista;
  - índices.
- **`movimentos_estoque`:**
  - `fornecedor_id BIGINT NULL`, com FK composta para `fornecedores` (RESTRICT);
  - CHECK: só com `tipo = 'ENTRADA' AND motivo = 'COMPRA' AND origem = 'AJUSTE_MANUAL'`.
- **`numeracoes`:** o CHECK do tipo passa a aceitar `FORNECEDOR`.
- **Migração do texto, nesta ordem:**
  1. **Marcas:** para cada empresa, os valores distintos de `produtos.marca` (aparados, sem diferenciar maiúsculas) viram marcas **na raiz**. O nome é a primeira grafia encontrada (menor `id` de produto). Cada produto recebe o `marca_id` da sua.
  2. **Fornecedores:** os valores distintos de `produtos.fornecedor` viram fornecedores (tipo PJ, só a razão social), numerados por ordem de nome. Cada produto passa a ter o seu na lista e como fornecedor da última compra. No dev não há nenhum.
  3. **Conferência** (`RAISE EXCEPTION` se falhar): todo produto que tinha texto ficou ligado.
  4. **Remoção:** saem `produtos.marca` e `produtos.fornecedor`, e a constraint `ck_produto_fornecedor_valido`.
  5. `numeracoes` recebe o máximo de `FORNECEDOR` por empresa.
- **Busca:** `busca_normalizada` continua com o nome da marca. A V14 não a recalcula, porque o texto é o mesmo. A aplicação passa a montá-la com o nome da marca escolhida.

## 8. Telas

### 8.1 Fabricantes e marcas (`/produtos/marcas`)
- **Igual à tela de Categorias:** árvore, nova, submarca, renomear, mover, inativar/reativar e excluir.
- **Contagens:** "N produtos · M fornecedores".

### 8.2 Fornecedores, lista (`/produtos/fornecedores`)
- **Busca e filtro:** busca enquanto se digita e filtro de status, guardados na URL, como em Produtos.
- **Formato:** tabela a partir de 1024 px e cards abaixo disso, também como em Produtos.
- **Colunas:** Nº, Nome (com o nome fantasia abaixo), CNPJ/CPF formatado, telefone, representante (nome e telefone), produtos e status.
- **Ações:** "+ Novo fornecedor", abrir, inativar/reativar.
- **Estados:** vazio ("Nenhum fornecedor cadastrado." com o botão), sem resultado na busca, carregando e erro.

### 8.3 Fornecedor, cadastro e edição
- **Página própria**, com seções na ordem abaixo e o rodapé Salvar/Cancelar fixo, como no produto:
  1. **Dados:**
     - Nº, na edição;
     - tipo PJ/PF;
     - CNPJ/CPF com máscara;
     - razão social/nome;
     - nome fantasia;
     - inscrição estadual com o botão "Isento", só no PJ.
  2. **Endereço:** CEP com busca, que preenche logradouro, bairro, município e UF, mais os demais campos.
  3. **Contato:** telefone, e-mail e observações.
  4. **Representantes:** lista com "+ Adicionar representante" (nome, telefone e e-mail) e remover.
  5. **Marcas que vende:** seletor da árvore, com as escolhidas como chips com o caminho.
  6. **Produtos que vende:** só na edição, com busca e "Adicionar", lista paginada (Nº, nome, código) com "Remover" e o aviso da última compra (§4.4). No cadastro novo: "Salve o fornecedor para adicionar os produtos."
- **Comportamento:** como na tela do produto:
  - aviso de alterações não salvas;
  - Ctrl+Enter para salvar;
  - erros rolando até o campo;
  - o OPERADOR só lê.
- **Feedback:** "Fornecedor salvo.", "Produto adicionado ao fornecedor." e "Produto removido do fornecedor."

### 8.4 Produto
- **Seção Geral:** o seletor de marca (§3.3) e os campos "Fornecedores" e "Fornecedor da última compra" (§5).
- **Modal de ajuste:** o campo "Fornecedor" (§6).
- **Histórico:** o movimento com o fornecedor.

## 9. Fora desta fase
- **Compras:** importação de NF-e e leitura do XML.
- **Consulta de CNPJ em serviço externo.**
- **Preço de compra por fornecedor e código do produto no fornecedor** (registrado na B2 para Compras).
- **Filtro da listagem de produtos por marca ou fornecedor.**
- **Contas a pagar.**

## 10. Testes (critérios de aceite)
- **Backend:**
  - **V14 (IT):**
    - marcas criadas das variações "Golden" e "golden " como uma só, na raiz, com os produtos ligados;
    - fornecedor criado do texto e ligado como último;
    - colunas antigas removidas;
    - CHECKs e FKs (inclusive a do último fornecedor fora da lista barrada);
    - `numeracoes` com `FORNECEDOR`.
  - **Marcas:** as regras de Categorias (ciclo, nome entre irmãos, exclusão com submarca, produto ou fornecedor, inativo fora do seletor, caminho); renomear atualiza a busca dos produtos.
  - **Fornecedores:**
    - só o nome obrigatório;
    - CNPJ/CPF validados e únicos;
    - IE (dígitos, ISENTO, não no PF);
    - CEP e UF;
    - representantes (lista completa, limite, ordem);
    - marcas (limite, repetição, de outra empresa → 404);
    - busca por nome, fantasia, documento com máscara, Nº e representante;
    - paginação e status;
    - excluir com produto ou movimento → 409;
    - inativar;
    - OPERADOR → 403 na escrita;
    - isolamento por empresa.
  - **Produtos do fornecedor:**
    - adicionar (idempotente);
    - remover;
    - remover o da última compra limpa o campo do produto.
  - **Produto:**
    - `marcaId`;
    - `fornecedorIds` e `fornecedorUltimaCompraId` (fora da lista → 400; outra empresa → 404; inativo só se já ligado);
    - PATCH sem a lista mantém;
    - as sugestões de marca e fornecedor removidas.
  - **Entrada por compra:**
    - com fornecedor → movimento com fornecedor, ligado ao produto e marcado como último;
    - fornecedor em outro motivo → 400;
    - chave repetida com outro fornecedor → 409;
    - fornecedor inativo → 400 "Este fornecedor está inativo.".
- **Frontend:**
  - **Abas:** a ordem e as rotas.
  - **Marcas:** a tela como a de Categorias.
  - **Lista de fornecedores:**
    - busca e status na URL;
    - tabela e cards;
    - estados vazio, sem resultado, carregando e erro.
  - **Formulário do fornecedor:**
    - PJ/PF trocando os rótulos e escondendo a IE;
    - máscaras;
    - busca de CEP;
    - representantes com "+" e remover;
    - marcas;
    - produtos (adicionar, remover, aviso da última compra);
    - mensagens de §4.6;
    - alterações não salvas;
    - OPERADOR só lê.
  - **Produto:**
    - o seletor de marca;
    - "Fornecedores" e "Fornecedor da última compra" (limpa ao tirar da lista).
  - **Modal:**
    - o campo Fornecedor só em Entrada + Compra;
    - vem preenchido com o da última compra;
    - o envio.

## 11. Ajustes na implementação
- **Contrato do endereço:** campos planos (`cep`, `logradouro`, `numeroEndereco`, `complemento`, `bairro`, `municipio`, `uf`). `numeroEndereco` evita colidir com o Nº do fornecedor (`numero`).
- **Ligar produto ao fornecedor:** `POST /api/fornecedores/{id}/produtos` responde com o item da lista no corpo (201 quando cria, 200 quando já estava ligado). Na tela, o 200 mostra "{produto} já estava ligado a este fornecedor.".
- **Limite de 20 fornecedores por produto** (decisão do CTO na revisão): ligar pela tela do fornecedor ou pela entrada por compra um fornecedor novo num produto que já tem 20 dá 400 "Este produto já tem 20 fornecedores. Tire um da lista do produto para ligar outro.". A compra pode ser registrada sem fornecedor.
- **Regras e mensagens além da spec:**
  - "Informe no máximo 20 fornecedores." (`fornecedorIds`);
  - "Informe a lista de fornecedores." quando vem o último sem a lista;
  - "Representante repetido na lista." e "Representante não encontrado." (404);
  - "Esta marca está inativa. Escolha uma marca ativa." (marca nova inativa no produto e no fornecedor);
  - um fornecedor inativo não ganha produto novo pela tela dele ("Este fornecedor está inativo.");
  - desligar um produto que não está ligado dá 404;
  - na edição sem `tipoPessoa`, o tipo atual é mantido.
- **Busca de fornecedores:** até 200 caracteres; o documento só é comparado com 4 dígitos ou mais no termo, e o Nº é exato.
- **Banco:** colunas `busca_normalizada` e `nome_normalizado` em `fornecedores`; a FK do "último fornecedor" é imediata, e a aplicação limpa o campo antes de desligar.
- **Tela:**
  - salvar um fornecedor novo abre a edição dele (para ligar os produtos);
  - trocar PJ/PF limpa a IE e o documento;
  - com produtos ligados, "Excluir" abre já bloqueado e oferece inativar;
  - na árvore de marcas, os textos falam em "fabricante" ("Novo fabricante", "Mover para o primeiro nível (fabricante)");
  - a IE colada com pontuação é limpa automaticamente.
- **Visibilidade:** o OPERADOR vê documento e contatos do fornecedor e dos representantes, como em Clientes (decisão registrada na DEC-039; revisar quando houver perfis mais granulares).
