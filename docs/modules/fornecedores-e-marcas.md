# Fornecedores e fabricantes/marcas

> Decisão: DEC-039. Pacotes `supplier` e `catalog.marca`. Migration V14. Itens da seção Catálogo do menu (DEC-049): Produtos · Estoque · Categorias · **Marcas** · **Fornecedores** · Unidades.

## 1. Objetivo

Cadastrar uma vez quem fornece e quem fabrica, e reutilizar no produto e na entrada por compra. Marcas formam uma árvore livre, como as categorias. O fornecedor guarda os dados do emitente da NF-e, os representantes, as marcas e os produtos que vende. Prepara Compras/NF-e sem implementá-las.

## 2. Regras de negócio

**Marcas**
1. Mesmo modelo e mesmas regras das categorias (ver [produtos.md](produtos.md)), trocando "categoria" por "marca":
   - nome de 1 a 100 caracteres, único entre irmãos sem diferenciar maiúsculas;
   - profundidade livre e sem ciclo ("Uma marca não pode ficar dentro dela mesma ou de uma submarca sua.");
   - caminho com " › " (ex.: "Boehringer › Nexgard › Nexgard Combo");
   - inativar tira o ramo do seletor, sem cascata.

   O primeiro nível costuma ser o fabricante (a tela fala em "Novo fabricante"), mas o sistema não diferencia níveis.
2. A exclusão é bloqueada com submarcas, produtos **ou fornecedores** ligados. O 409 traz as contagens: "Não é possível excluir: há 1 submarca(s), 4 produto(s) e 2 fornecedor(es) nesta marca. Mova-os ou inative a marca.".
3. No produto, `marcaId` é opcional e aceita qualquer nível. Marca inativa só é aceita se já for a do produto: senão, "Esta marca está inativa. Escolha uma marca ativa." (a mesma regra vale no fornecedor).
4. A busca de produtos acha pelo **nome** da marca (não pelo caminho). Renomear a marca atualiza a busca dos produtos dela.

**Fornecedor: dados**

5. Só a razão social/nome é obrigatória (1–180): "Informe a razão social." no PJ e "Informe o nome." no PF.
   - Nº sequencial por empresa e imutável (`Numerador`, tipo `FORNECEDOR`).
   - Tipo `PJ` (padrão) ou `PF`. Na edição sem `tipoPessoa`, o tipo atual é mantido.
6. O documento é opcional: CNPJ (14) no PJ e CPF (11) no PF, com dígitos verificadores ("CNPJ inválido."/"CPF inválido.").
   - **Único por empresa** quando informado: "Já existe o fornecedor {nome} com este CNPJ." (ou CPF), 409.
   - Guardado só com dígitos.
7. Demais campos, todos opcionais:
   - nome fantasia (até 180);
   - inscrição estadual, só no PJ: só dígitos (até 20) ou "ISENTO" ("Informe só números ou ISENTO."). No PF dá "Inscrição estadual só para pessoa jurídica.";
   - endereço: CEP com 8 dígitos ("O CEP deve ter 8 dígitos."), logradouro, número, complemento, bairro, município e UF válida ("UF inválida.");
   - telefone (até 20), e-mail validado (até 180, "E-mail inválido.") e observações (até 500).

   O texto é aparado, e o vazio vira nulo. A UF é guardada em maiúsculas.
8. **Representantes:** até 10 ("Informe no máximo 10 representantes."), cada um com nome obrigatório (1–120, "Informe o nome do representante."), telefone (até 20) e e-mail (até 180) opcionais.
   - A ordem é a da tela, e o primeiro aparece na listagem.
   - O request manda a lista completa: com `id` mantém, sem `id` cria, ausente remove. Representante repetido dá "Representante repetido na lista.", e `id` desconhecido dá 404 "Representante não encontrado.".
9. **Marcas que vende:** até 200 itens da árvore, em qualquer nível, sem repetição ("Informe no máximo 200 marcas.").
   - O seletor oferece só as selecionáveis; as inativas já ligadas continuam.
   - Escolher um fabricante **não** inclui os filhos. É só referência, sem efeito em preço ou estoque.

**Fornecedor no produto**

10. O produto tem uma lista de fornecedores (`produto_fornecedores`, **a mesma vista dos dois lados**), com até 20 ("Informe no máximo 20 fornecedores.").
   - Um deles pode ser o **"Fornecedor da última compra"**, que precisa estar na lista: "O fornecedor da última compra precisa estar na lista de fornecedores.". Mandar o último sem a lista dá "Informe a lista de fornecedores.".
   - Fornecedor de outra empresa ou inexistente dá 404.
   - Fornecedor inativo só é aceito se já estiver ligado.
   - No PATCH, `fornecedorIds` ausente mantém a lista.
11. Pela tela do fornecedor, só na edição, é possível ligar e desligar produtos.
   - Ligar um já ligado responde 200 ("{produto} já estava ligado a este fornecedor."); desligar um não ligado dá 404.
   - Um fornecedor inativo não ganha produto novo ("Este fornecedor está inativo.").
   - Ligar o 21º fornecedor de um produto dá 400 "Este produto já tem 20 fornecedores. Tire um da lista do produto para ligar outro.". Na entrada por compra, a compra pode ser registrada sem fornecedor.
12. Remover da lista o fornecedor da última compra **limpa** o "Fornecedor da última compra" do produto. A tela avisa antes: "Este é o fornecedor da última compra de {produto}. Remover mesmo assim?".
13. Na **entrada por compra**, o fornecedor é opcional: entra na lista do produto e vira o da última compra (regras em [estoque.md](estoque.md)).

**Status e exclusão**

14. Inativar tira o fornecedor dos seletores (produto e entrada por compra), mas ele continua onde já está ligado.
15. Excluir só funciona sem produtos ligados e sem movimentos de estoque com ele. Representantes e marcas ligadas saem junto. Senão, 409 "Não é possível excluir: o fornecedor tem {n} produto(s) ligados e {m} entrada(s) registradas. Inative-o.".

**Perfis e dados pessoais**

16. Leitura para qualquer autenticado; toda escrita (cadastro, edição, inativar/reativar, excluir, ligar/desligar produto) só ADMIN.
17. O OPERADOR vê documento (inclusive CPF de fornecedor PF) e contatos, como em Clientes. Mascarar fica para quando houver perfis mais granulares (DT-037).

## 3. Contrato da API

| Método | Rota | Perfil | Observação |
|---|---|---|---|
| GET | `/api/marcas` | autenticado | Lista plana com `caminho`, `nivel`, `selecionavel` e as contagens de submarcas, produtos e fornecedores; `?ativo=` |
| POST | `/api/marcas` | ADMIN | 201 |
| PATCH | `/api/marcas/{id}` · `/{id}/inativar` · `/{id}/reativar` | ADMIN | Renomear e mover |
| DELETE | `/api/marcas/{id}` | ADMIN | 204 · 409 |
| GET | `/api/fornecedores?busca=&status=&pagina=&tamanho=` | autenticado | `PaginaResponse`, 25 por página, por nome; `status` = `ativos` (padrão), `inativos` ou `todos` |
| POST | `/api/fornecedores` | ADMIN | 201 · 400 · 409 |
| GET | `/api/fornecedores/{id}` | autenticado | 404 fora da empresa |
| PATCH | `/api/fornecedores/{id}` · `/{id}/inativar` · `/{id}/reativar` | ADMIN | |
| DELETE | `/api/fornecedores/{id}` | ADMIN | 204 · 409 |
| GET | `/api/fornecedores/{id}/produtos?pagina=&tamanho=` | autenticado | Produtos que vende |
| POST | `/api/fornecedores/{id}/produtos` (`{ produtoId }`) | ADMIN | 201 se cria, 200 se já ligado; o corpo é o item da lista |
| DELETE | `/api/fornecedores/{id}/produtos/{produtoId}` | ADMIN | 204 · 404 |

- **Busca de fornecedores:**
  - sem acento, até 200 caracteres;
  - por nome, nome fantasia, documento (com ou sem máscara, comparado só a partir de 4 dígitos), Nº (exato) e nome do representante.
- **Fornecedor:**
  - o endereço vem em campos planos (`cep`, `logradouro`, `numeroEndereco`, `complemento`, `bairro`, `municipio`, `uf`). O nome `numeroEndereco` evita colidir com o Nº;
  - o request traz ainda `representantes: [{ id?, nome, telefone?, email? }]` e `marcaIds`;
  - a response traz `numero`, `representantes`, `marcas [{ id, nome, caminho }]`, `quantidadeProdutos`, `ativo` e as datas;
  - o item da lista traz `representantePrincipal { nome, telefone } | null`.
- **Produto:**
  - o request usa `marcaId`, `fornecedorIds` e `fornecedorUltimaCompraId`;
  - a response traz `marca { id, nome, caminho } | null`, `fornecedores [{ id, numero, nome }]` e `fornecedorUltimaCompra | null`.

  Não há mais sugestões de texto para marca e fornecedor.

## 4. Dados (V14)

- **`marcas`:** como `categorias`, com índice único do nome entre irmãos, FK do pai e `UNIQUE (empresa_id, id)`.
- **`fornecedores`:**
  - `numero` único por empresa;
  - índice único parcial do documento quando preenchido;
  - CHECKs de documento por tipo, UF, CEP, IE e texto aparado;
  - colunas `busca_normalizada` e `nome_normalizado` mantidas pela aplicação.
- **`fornecedor_representantes`:** com `ordem`, CASCADE pelo fornecedor.
- **`fornecedor_marcas`:** CASCADE pelo fornecedor, RESTRICT pela marca.
- **`produto_fornecedores`:** CASCADE pelo produto, RESTRICT pelo fornecedor.
- **`produtos`:**
  - `marca_id`;
  - `fornecedor_ultima_compra_id`, com FK composta `(empresa_id, id, fornecedor_ultima_compra_id) → produto_fornecedores`, que garante no banco que o último está na lista. A FK é imediata, por isso a aplicação limpa o campo antes de desligar.
- **`movimentos_estoque.fornecedor_id`:** RESTRICT, só em entrada por compra manual.
- **Migração do texto antigo:**
  - as marcas em texto viraram marcas na raiz (deduplicadas sem diferenciar maiúsculas/espaços, com a grafia do menor `id`);
  - os fornecedores em texto viraram fornecedores PJ, ligados e marcados como da última compra;
  - saíram `produtos.marca` e `produtos.fornecedor`.

## 5. Telas

- **Marcas (`/produtos/marcas`, título "Fabricantes e marcas"):** igual à de Categorias (árvore, nova, submarca, renomear, mover, inativar/reativar, excluir), com as contagens "N produtos · M fornecedores".
- **Fornecedores (`/produtos/fornecedores`):**
  - busca enquanto se digita e filtro de status, guardados na URL;
  - tabela a partir de 1024 px e cards abaixo;
  - colunas Nº, Nome (com a fantasia), CNPJ/CPF, telefone, representante, produtos e status;
  - estados vazio ("Nenhum fornecedor cadastrado."), sem resultado, carregando e erro.
- **Cadastro e edição (`/produtos/fornecedores/novo`, `/:id`):**
  - seções Dados · Endereço (busca de CEP) · Contato · Representantes · Marcas que vende (chips com o caminho) · Produtos que vende (só na edição: "Salve o fornecedor para adicionar os produtos.");
  - rodapé fixo, aviso de alterações não salvas, Ctrl+Enter, rolagem até o erro, e o OPERADOR só lê;
  - salvar um novo abre a edição;
  - trocar PJ/PF limpa a IE e o documento, e a IE colada com pontuação é limpa;
  - com produtos ligados, "Excluir" já abre bloqueado e oferece inativar;
  - feedback: "Fornecedor salvo.", "Produto adicionado ao fornecedor." e "Produto removido do fornecedor.".
- **Produto (seção Geral):** seletor de marca igual ao de categoria (busca pelo caminho, "+ Nova"), "Fornecedores" (seleção múltipla com busca, inativos ligados marcados "(inativo)") e "Fornecedor da última compra" (limpa ao tirar da lista).

## 6. Fora do escopo e pendências

Fora do escopo:
- Compras (importação e leitura do XML da NF-e) e contas a pagar;
- consulta de CNPJ em serviço externo;
- preço e código do produto por fornecedor;
- filtro da listagem de produtos por marca ou fornecedor.

Pendências: [DT-037](../technical-debt.md).
