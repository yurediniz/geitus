# Produtos (catálogo)

Decisões: DEC-025, DEC-028, DEC-030 a DEC-033, DEC-035 a DEC-037, DEC-040. Estoque e custo de entrada: [`estoque.md`](estoque.md). Fornecedores e marcas: [`fornecedores-e-marcas.md`](fornecedores-e-marcas.md).

## 1. Objetivo

Cadastro dos produtos físicos que o negócio vende: identificação (número, código, SKU, códigos de barras), unidade e categoria, preços (normal, promoção, atacado), embalagens de venda, imagem e uma listagem rápida para milhares de itens. É a base do PDV, do estoque e dos relatórios. Sem nada fiscal e sem serviços.

## 2. Regras de negócio

### 2.1 Produto
1. Pertence a uma empresa, derivada do usuário autenticado (DEC-016). Recurso de outra empresa → 404.
2. **Obrigatórios:** nome (até 150), preço de venda (≥ 0) e unidade de venda. Os demais são opcionais.
3. Custo, preço mínimo, estoque mínimo, estoque máximo e ponto de reposição, quando informados, são ≥ 0. Quando ambos existem: preço mínimo ≤ preço de venda e estoque máximo ≥ estoque mínimo (400, conferido no service).
4. **Texto opcional vazio vira `NULL`** (SKU, nome curto, descrição etc.); vários `NULL` não conflitam nas unicidades.
5. **Margem e markup são calculados, nunca gravados:** margem = (preço − custo) ÷ preço; markup = (preço − custo) ÷ custo; 2 casas, meio para cima. Sem custo → `null` (markup também `null` com custo 0). Valem para o preço de venda, o promocional, o de atacado e o efetivo de cada embalagem (§2.6).
6. Preço de venda abaixo do custo é permitido, com aviso que não bloqueia: "R$ 0,50 abaixo do custo (R$ 5,00). Vender por este preço dá prejuízo." Vale também para promoção, atacado e embalagem.
7. **Status:** ativo/inativo (inativar/reativar). Produto inativo não aparece para venda no PDV e continua nos relatórios históricos.
8. **Exclusão física** (ADMIN) só quando o produto nunca teve venda nem movimentação de estoque, ou quando o único movimento é o estoque inicial do cadastro (`podeExcluir`, calculado em lote na listagem). Bloqueada → 409 "Este produto já foi vendido e não pode ser excluído. Inative-o." (vendido) ou "Este produto já teve movimentação de estoque e não pode ser excluído. Inative-o." (com movimento). Saem em cascata códigos, embalagens, histórico de preços e imagem. A exclusão é registrada em log INFO (usuário, empresa, UUID); auditoria persistente é a DT-028.
9. **Escrita** (cadastrar, editar, inativar, reativar, excluir, imagem, sugestão de SKU) exige ADMIN; **leitura** é livre a qualquer autenticado (DEC-025). OPERADOR vê o catálogo em modo leitura, inclusive custo e margem (restringir por perfil fica para quando houver perfis mais granulares).
10. Edições simultâneas: a edição lê o produto com `SELECT … FOR UPDATE`. Conflito otimista (`@Version`) é a DT-029.

### 2.2 Identificação
1. **Número:** 1, 2, 3… por empresa, gerado na criação pelo `Numerador` (`numeracoes`, incremento atômico na mesma transação; falha não consome número), imutável e nunca reaproveitado. Não é a PK. Nunca é aceito no request. Clientes e vendas usam o mesmo mecanismo.
2. **UUID público:** as rotas usam o UUID; o id numérico nunca sai na API. UUID malformado → 400.
3. **Nome curto:** opcional, até 30. `nomeCurtoEfetivo` = nome curto ou os 30 primeiros caracteres do nome (aparados); é o nome do cupom e do PDV.
4. **Código do produto:** inteiro 1–999999, opcional, único por empresa, guardado como número e exibido sem zeros (000542 = 542; zeros à esquerda aceitos na digitação; número com casas decimais → 400).
   - Fora do intervalo → 400 "O código do produto deve ter de 1 a 6 dígitos.".
   - Repetido → 409 "Este código já está em uso no produto {nome}." (campo `codigo`), inclusive numa corrida, pelo nome da constraint.
5. **Vendido na balança:** booleano (KG ou UN). Marcado, exige o código ("Informe o código do produto para vendê-lo na balança.") e que o código caiba na etiqueta configurada ("Este código tem mais dígitos do que a etiqueta da balança comporta ({n})."). A troca do código é livre hoje; bloqueá-la para produto já vendido é a DT-034.
6. **SKU:** opcional, alfanumérico, único por empresa (409), fora da venda. `GET /api/produtos/sku/sugestao` (ADMIN) sugere `P` + 6 dígitos: maior SKU da empresa exatamente nesse padrão + 1, começando em `P000001` (passa de 999999 crescendo os dígitos). Não reserva; a unicidade é conferida ao salvar.
7. **Códigos de barras:** 0 a 20 por produto (mais 5 por embalagem, §2.6), na ordem enviada (o primeiro é o exibido). Espaços removidos (inclusive internos); vazio ignorado.
   - Formato pelo conteúdo: só dígitos com 8 (`EAN8`), 12 (`UPCA`) ou 13 (`EAN13`) exigem dígito verificador GS1 válido, senão 400 "Código de barras {codigo} com dígito verificador inválido. Confira a leitura.". Qualquer outro (inclusive com letras) é aceito como `OUTRO`, com aviso que não bloqueia.
   - **Únicos por empresa** entre a unidade e todas as embalagens: em outro produto → 409 "O código de barras {codigo} já está cadastrado no produto "{nome}"."; numa embalagem → 409 "Este código já está em uso na embalagem {rótulo} do produto {nome}."; repetido no envio → 400 "Código de barras repetido na lista.".
   - Código com o formato da etiqueta de balança configurada (13 dígitos com o prefixo) gera aviso que não bloqueia.
   - Erros de código e de SKU vêm com `campos` (`codigosBarras`, `embalagens[j].codigosBarras`, `sku`).
8. **Listas no PATCH** (`codigosBarras`, `embalagens`, `fornecedorIds`): lista informada substitui a atual (`[]` remove tudo); ausente ou `null` mantém a atual. No cadastro, ausente = vazia. A edição dos códigos é reconciliada por código (o mantido conserva o formato gravado; reordenar não viola a unicidade).

### 2.3 Unidades de medida (por empresa)
1. Toda empresa tem 10 padrões: UN, KG, G, L, ML, M, CX, PCT, DZ, FD (fracionadas: KG, G, L, ML, M), criadas pela migration e pelo código para empresas novas. São registros comuns (editáveis, inativáveis, excluíveis).
2. Sigla obrigatória, até 20, gravada em maiúsculas e aparada (revalidada depois de normalizar, ex.: `ß` → `SS`); única por empresa (409). Descrição obrigatória, até 60. `fracionada` obrigatória no request.
3. **Excluir** só se nenhum produto a usa como unidade de venda nem numa embalagem; senão 409 "Esta unidade está em uso por N produto(s). Inative-a para que não apareça em novos cadastros." (cada produto contado uma vez; `emUso` na resposta).
4. Unidade inativa continua válida nos produtos que já a usam, mas não é oferecida em novos cadastros; no produto, unidade inativa só é aceita se já for a atual (400).
5. Desligar `fracionada` é barrado se um produto com essa unidade de venda tem embalagem de quantidade fracionada (400, campo `fracionada`): "Há embalagens com quantidade fracionada nesta unidade. Ajuste-as antes de desligar o fracionamento.". Unidade usada por produto movimentado não deixa de ser fracionada ([`estoque.md`](estoque.md)).
6. **Regra de domínio:** quantidade > 0 e, em unidade não fracionada, inteira.

### 2.4 Categorias (árvore por empresa)
1. Árvore com `parent_id`, profundidade livre (teto é a DT-026); nome obrigatório (até 100), único entre irmãos sem diferenciar maiúsculas (409, inclusive ao mover). O pai precisa ser da mesma empresa (404); pai inativo é permitido.
2. **Mover/renomear:** o PATCH substitui nome e pai (pai ausente/nulo = categoria principal). Mover para si mesma ou para um descendente → 400 "Uma categoria não pode ficar dentro dela mesma ou de uma subcategoria sua.". Mover e excluir travam a árvore da empresa (`FOR UPDATE` na empresa), para movimentos cruzados não criarem ciclo.
3. **Excluir** só sem subcategorias e sem produtos (ativos ou não); senão 409 com as contagens ("Não é possível excluir: há 2 subcategoria(s) e 5 produto(s) nesta categoria. Mova-os ou inative a categoria."). Sem vínculos → exclusão física (é cadastro, não histórico).
4. **Inativar** não mexe em filhos nem produtos: a categoria e todo o ramo deixam de ser oferecidos no seletor (`selecionavel` falso); o produto pode manter a categoria atual. Reativar devolve o ramo. No produto, categoria não selecionável só é aceita se já for a atual.
5. Cada categoria expõe o caminho completo ("Ração › Úmida › Sachê"). O filtro da listagem usa a categoria e todas as descendentes. A mesma árvore e as mesmas regras servem às Marcas ([`fornecedores-e-marcas.md`](fornecedores-e-marcas.md)).

### 2.5 Preços
1. **Promoção:** preço, início e fim juntos (ou nenhum). Preço > 0, menor que o preço de venda ("Preço promocional deve ser menor que o preço de venda.") e não abaixo do preço mínimo ("Preço promocional não pode ser menor que o preço mínimo."); fim ≥ início. Datas no passado e promoção encerrada são permitidas (não bloqueiam a edição).
2. **Vigência:** do início ao fim, inclusive, pela data de hoje em `America/Sao_Paulo` (`Clock` injetável). Situação calculada: `AGENDADA` (hoje < início), `VIGENTE`, `ENCERRADA` (hoje > fim); `emPromocao` = vigente.
3. **Atacado:** uma faixa por produto — preço e quantidade mínima juntos (ou nenhum). Preço > 0, menor que o preço de venda e não abaixo do mínimo; quantidade mínima > 1 ("A quantidade mínima do atacado deve ser maior que 1."), até 3 casas, inteira em unidade não fracionada ("A unidade {sigla} não aceita quantidade fracionada.").
4. Reduzir o preço de venda para igual ou abaixo da promoção ou do atacado é barrado pela mesma regra (erro no campo da promoção/atacado). `promocao` ou `atacado` nulo/ausente = sem promoção/atacado.
5. **Preço aplicado na venda** (`PrecoDeVenda.resolver(produto, quantidade, data)`): candidatos normal, promocional vigente e atacado (quantidade ≥ mínima); **vence o menor**; empate entre promoção e atacado → `PROMOCIONAL`. Quantidade ≤ 0 → exceção. Consumido pelo PDV.
6. **Preço pela margem ou pelo markup** (só no frontend, nada é gravado): margem → preço = custo ÷ (1 − margem), margem de 0 a 99,99%; markup → preço = custo × (1 + markup), de 0 a 9.999,99%; centavos, meio para cima. Exige custo > 0.
7. **Origem do custo** e "custo = último custo de entrada por compra": [`estoque.md`](estoque.md).

### 2.6 Embalagens de venda
1. Um produto tem estoque único na unidade de venda e até **10 embalagens**. Cada uma: unidade ativa diferente da de venda; quantidade > 1 (até 3 casas, decimal só se a unidade de venda for fracionada); preço próprio opcional (> 0); "de compra" (no máximo uma por produto); até 5 códigos de barras. A antiga unidade de compra + fator virou a embalagem "de compra".
2. Não pode haver duas embalagens com a mesma unidade **e** quantidade ("Já existe a embalagem {rótulo} neste produto."). Rótulo derivado: `{sigla} c/ {quantidade} {sigla de venda}` ("CX c/ 3 UN"), sem zeros à direita.
3. **Mensagens:** "A embalagem precisa de uma unidade diferente da unidade de venda ({sigla})."; "A embalagem precisa conter mais de 1 {sigla}."; "{sigla} não aceita quantidade fracionada. Informe um número inteiro."; "Só uma embalagem pode ser a de compra."; "Informe no máximo 10 embalagens."; "Informe no máximo 5 códigos de barras por embalagem.".
4. **Preço efetivo:** o próprio (a promoção da unidade não o altera); sem preço próprio, quantidade × preço vigente da unidade (com a promoção, se vigente), em centavos. O atacado não entra no preço da embalagem — no PDV, decide a quantidade total da venda. Origem na resposta: `PROPRIO`, `UNIDADE` ou `PROMOCAO_DA_UNIDADE`.
5. Margem e markup sobre o custo da embalagem (quantidade × custo da unidade). O preço próprio ÷ quantidade não pode ficar abaixo do preço mínimo: "O preço da embalagem dá {R$ x} por {sigla}, abaixo do preço mínimo ({R$ mínimo})."; o preço calculado não é conferido. Um PATCH sem `embalagens` também reconfere as atuais contra a unidade de venda e o mínimo do request.
6. **Embalagem principal** (para mostrar o saldo convertido, "55 UN (18 CX + 1 UN)"): a de compra, se houver; senão a primeira.
7. Remover a embalagem remove os seus códigos. Mudar a unidade de venda para a unidade de uma embalagem → 400. `id` de embalagem de outro produto → 404 "Embalagem não encontrada.".
8. O ajuste de estoque em Entrada/Saída pode ser informado em embalagens ([`estoque.md`](estoque.md)).

### 2.7 Histórico de preços
1. Só inserção: custo (`CUSTO`), preço de venda (`PRECO_VENDA`) e preço próprio de embalagem (`PRECO_EMBALAGEM`, com o rótulo depois do salvamento), com valor anterior e novo, usuário e momento, na mesma transação do produto.
2. No cadastro registra o preço de venda e o custo (se houver). Na edição, uma linha por campo que realmente mudou (comparação numérica: 10,0 = 10,00); custo removido → valor novo vazio. Embalagem: criada com preço, preço alterado, apagado (volta ao calculado) ou embalagem com preço removida. Mudar unidade ou quantidade da embalagem não gera linha.
3. Inativar/reativar e mudanças de códigos, promoção ou atacado não geram linha. Leitura para qualquer autenticado, paginada (padrão 20, máximo 100; página grande demais → 400 "A página informada é grande demais."), do mais recente ao mais antigo.

### 2.8 Imagem
1. Uma imagem por produto, gravada no PostgreSQL. O navegador gera duas versões, sem recorte: grande (até 1200 px, ≤ 400 KB) e miniatura (até 200 px, ≤ 40 KB), em WebP (JPEG se o navegador não codificar WebP), reduzindo qualidade e depois dimensão para caber. Entrada: JPG, PNG ou WebP até 15 MB, por arquivo, câmera ou arrastar; orientação EXIF respeitada; "Girar" 90°.
2. O servidor não recomprime; confere, nesta ordem: as duas partes ("Envie a imagem grande e a miniatura."), tipo real pelos primeiros bytes — WebP ou JPEG, iguais nas duas ("Formato de imagem não aceito. Use WebP ou JPEG."), tamanhos, dimensões lidas do cabeçalho e limites de px; acima do limite do multipart → 413. Envio e remoção só ADMIN, registrados em log; remover sem imagem → 404 "Imagem não encontrada.".
3. Cada envio gera uma `versao` nova. A leitura é por **URL assinada** (HMAC-SHA256 com `GEITUS_IMAGEM_SEGREDO` — ≥ 32 bytes, diferente do `JWT_SECRET` e do exemplo, senão a aplicação não sobe), válida até o fim do dia UTC seguinte, sem JWT. Assinatura inválida ou vencida → 403 sem corpo; versão trocada ou produto inexistente → 404. A resposta leva `nosniff`, CSP `sandbox`, CORP `same-site` e cache `private, immutable`.
4. A imagem segue o **Salvar** da tela (conta como alteração não salva) e pode ser trocada também em produto inativo. Produto salvo e imagem com erro → "Produto salvo, mas a imagem não foi enviada. Tente de novo.", com a imagem pendente mantida.

### 2.9 Listagem e busca
1. Paginada no servidor (25 por página, máximo 100). Página além do fim → itens vazios com o total real.
2. **Busca** (até 200 caracteres) sem acento e sem diferenciar maiúsculas: até 5 palavras, todas precisam aparecer, em qualquer ordem, no nome, nome curto, SKU ou marca (coluna normalizada mantida pela aplicação, `TextoDeBusca.normalizar`); ou o termo sem espaços casa (parcial) com qualquer código de barras do produto ou das embalagens; termo só de dígitos também acha por número e por código do produto ("0542" → 542). `%` e `_` são literais.
3. **Filtros** (combinados com E): `status` (`ativos` padrão, `inativos`, `todos`); `categoria` (uma ou mais, até 20, com o parâmetro repetido ou separado por vírgula; cada uma com as descendentes, somadas com OU; categoria de outra empresa ou inexistente é ignorada e, se nenhuma valer, a lista volta vazia; mais de 20 → 400 "Escolha até 20 categorias."); `estoque` (uma ou mais situações de [estoque.md](estoque.md), regra 16: `negativo`, `zerado`, `baixo`, `reposicao`, `regular`, `alto`, com o parâmetro repetido ou separado por vírgula, combinadas com OU; só produtos que controlam estoque); `promocao=true` (vigente hoje). Valor inválido → 400.
4. **Ordem:** `nome` (padrão) / `-nome`, `preco` / `-preco` (o normal), `margem` / `-margem` (sem custo ou com preço 0 sempre no fim), `estoque` / `-estoque` (sem controle sempre no fim), `recentes`, `atualizados`. Desempate por nome normalizado e id.
5. Número de consultas por página constante (sem N+1), inclusive estoque, `podeExcluir` e imagens.

### 2.10 Etiqueta de balança (configuração por empresa)
1. Campos e padrão: prefixo `2` (1–2 dígitos), código 6 (4–6), preenchimento 0 (0–2 zeros), informação `VALOR` (ou `PESO`) com 6 dígitos (4–7) e 3 casas (2 ou 3), sem dígito verificador. A soma precisa dar 13. Sem configuração gravada vale o padrão.
2. **Leitura** (`LeitorEtiquetaBalanca`, usada pelo PDV): só 13 dígitos começando pelo prefixo, preenchimento igual a zero, código ≠ 0 e, com DV, EAN-13 válido. Código sem zeros; informação ÷ 10^casas. Ex.: `2000542010000` → produto 542, R$ 10,00.
3. Salvar só ADMIN (registrado em log); o salvamento avisa, sem bloquear, quais produtos da balança têm código grande demais para o novo formato. O teste de etiqueta lê com a configuração da tela (ainda não salva) e procura o produto pelo código.

## 3. Contrato da API

`{id}` é sempre o UUID. Todas as rotas exigem JWT, exceto a leitura da imagem.

| Método | Rota | Perfil | Observação |
|---|---|---|---|
| GET | `/api/produtos?busca&status&categoria&estoque&promocao&ordem&pagina&tamanho` | autenticado | `PaginaResponse<ProdutoResponse>` |
| GET | `/api/produtos/{id}` | autenticado | 404 fora da empresa |
| POST | `/api/produtos` | ADMIN | 201; 400 com `campos`; 409 SKU/código/código de barras |
| PATCH | `/api/produtos/{id}` | ADMIN | listas: §2.2.8 |
| PATCH | `/api/produtos/{id}/inativar` · `/reativar` | ADMIN | |
| DELETE | `/api/produtos/{id}` | ADMIN | 204; 409 se não pode excluir |
| GET | `/api/produtos/sku/sugestao` | ADMIN | `{ sku }` |
| GET | `/api/produtos/{id}/historico-precos?pagina&tamanho` | autenticado | |
| PUT · DELETE | `/api/produtos/{id}/imagem` | ADMIN | `multipart` com `grande` e `miniatura`; 200 / 204 |
| GET | `/api/imagens/produtos/{produtoId}/{versao}/{grande\|miniatura}?expira&assinatura` | pública (assinatura) | outros métodos negados |
| GET · POST · PATCH · DELETE | `/api/unidades`, `/api/unidades/{id}` (+ `/inativar`, `/reativar`) | GET autenticado, resto ADMIN | `?ativo=` no GET |
| GET · POST · PATCH · DELETE | `/api/categorias`, `/api/categorias/{id}` (+ `/inativar`, `/reativar`) | GET autenticado, resto ADMIN | lista plana ordenada pelo caminho; `?ativo=` no GET |
| GET | `/api/etiqueta-balanca` | autenticado | configuração ou padrão (`padrao`) |
| PUT | `/api/etiqueta-balanca` | ADMIN | devolve `produtosComCodigoGrandeDemais` |
| POST | `/api/etiqueta-balanca/teste` | autenticado | `{ codigoLido, configuracao }` → leitura, produto e mensagem |

- **`ProdutoResponse`:** `id`, `numero`, `codigo`, `vendidoBalanca`, nome, `nomeCurto`, `nomeCurtoEfetivo`, `unidade`, `categoria` (com `caminho`), marca e fornecedores, preços, `margem`, `markup`, `promocao` (com `situacao`), `emPromocao`, `atacado`, `codigosBarras` (`codigo`, `formato`, só da unidade), `embalagens` (com `rotulo`, `precoEfetivo`, `origemPreco`, custo, margem, markup), estoque ([`estoque.md`](estoque.md)), `podeExcluir`, `imagem` (`miniaturaUrl`, `grandeUrl` relativas e assinadas, dimensões). Nunca expõe `empresaId` nem a entidade.
- **Erros:** 400 com `campos` (índices em listas: `embalagens[1].quantidade`); 409 de unicidade com o campo; 404 sem revelar outra empresa.

## 4. Dados

| Tabela | Essencial | Migration |
|---|---|---|
| `produtos` | Unicidades por empresa: `sku`, `numero`, `codigo` (parcial). CHECKs ≥ 0 e de "tudo ou nada" da promoção e do atacado. `vendido_balanca` exige `codigo`. `busca_normalizada` e `nome_normalizado` (`COLLATE "C"`). `UNIQUE (empresa_id, id)` como alvo das FKs compostas. | V1, V4, V6–V8, V10, V11 |
| `unidades_medida` | Sigla única por empresa, maiúscula e aparada. | V6 |
| `categorias` | Nome único entre irmãos (`lower`); `parent_id <> id`; FK do pai sem cascata. | V6 |
| `produto_codigos_barras` | `UNIQUE (empresa_id, codigo)`, valendo entre unidade e embalagens; `embalagem_id` nulo = da unidade; cascata com o produto e a embalagem. | V7, V12 |
| `produto_embalagens` | Unidade × quantidade única (`DEFERRABLE`); uma "de compra" por produto (índice parcial); quantidade > 1. | V12 |
| `produto_historico_precos` | Só inserção; valor anterior ≠ novo; FK composta para o usuário; cascata com o produto. | V8, V12, V13 |
| `numeracoes` | `(empresa_id, tipo)` com o último número. | V11 |
| `configuracoes_etiqueta_balanca` | Uma por empresa; intervalos e soma = 13 por CHECK. | V11 |
| `produto_imagens` | Uma por produto, separada de `produtos`; `versao` única; tipo e limites de bytes/px por CHECK; `STORAGE EXTERNAL`. | V15 |

FKs compostas `(empresa_id, id)` garantem no banco que unidade, categoria, embalagem, códigos, histórico e imagem são da mesma empresa do produto.

## 5. Telas

- **Navegação:** a área Produtos tem as abas Produtos (`/produtos`), Categorias, Marcas, Fornecedores, Unidades e Balança (`/produtos/balanca`). OPERADOR vê tudo em modo leitura.
- **Lista (`/produtos`):** busca enquanto digita (300 ms, Enter imediato, requisições antigas canceladas), filtros, "Ordenar por" e cabeçalhos ordenáveis (`aria-sort`), tudo na URL (página 1-based; trocar filtro volta à página 1). Tabela a partir de 1.024 px (Categoria e Unidade a partir de 1.280 px, sem rolagem lateral) e cards abaixo. Miniatura (40 px na tabela, 56 px nos cards; ícone neutro sem imagem ou se falhar). Linha secundária "Nº 15 · Cód. 542 · SKU"; selo "Promoção" com o preço normal riscado; selo "Inativo" junto ao nome. Ações: Estoque visível; Editar e Inativar/Reativar no "⋯".
- **Produto (`/produtos/novo`, `/produtos/:id`):** tela única com barra de atalhos fixa — Geral (com Nº e imagem) · Códigos (códigos de barras, depois código do produto — com o atalho "Usar o número do produto" (só na edição e quando o número cabe no código e na etiqueta) — e "Vendido na balança", depois SKU) · Preços · Embalagens · Estoque · Histórico (só na edição, carregado ao se aproximar). O atalho mostra a contagem de erros; ao salvar com erro, rola até o primeiro campo. UN pré-selecionada em produto novo. Código de barras digitado e não adicionado entra no salvamento. Rodapé fixo com Salvar (volta para a lista) e "Salvar e cadastrar outro" (só no novo; mantém unidade, categoria, marca e a lista de fornecedores e foca o Nome). Ctrl+Enter salva; Ctrl+Shift+Enter salva e abre outro. Aviso de alterações não salvas ao sair. Excluir no cabeçalho, com confirmação que oferece "Inativar".
- **Campo de dinheiro (`CampoMoeda`):** preenche da direita para a esquerda enquanto se digita (1234 → 12,34), prefixo R$, apagar tudo deixa vazio, limite de 12 dígitos; colagem interpretada como número (`R$ 9,90` → 9,90).
- **Categorias:** árvore expansível navegável por teclado; "Adicionar subcategoria" visível e o resto no "⋯"; mover exclui a própria categoria e os descendentes do seletor; excluir com vínculos explica e oferece inativar; ramo sob categoria inativa atenuado. Seletores buscam por palavras, sem acento, pelo caminho; "+ Nova" cria e seleciona.
- **Balança:** campos, prévia do formato, modelos prontos (Toledo 6+6 sem DV — padrão; Toledo 4+0+6 com DV; Toledo 5+0+5 com DV; peso 6+5 com DV) e "Testar etiqueta".

## 6. Fora do escopo e pendências

- **Fora:** fiscal (NCM, CFOP, impostos), serviços, variações/grade, kits, lote e validade, múltiplos estoques, preço por cliente ou canal, várias promoções ou faixas de atacado, promoção e atacado próprios da embalagem, embalagem na balança ou inativa, várias imagens, recorte, armazenamento externo de imagem, exportar para o MGV da Toledo, importação em massa e exportação da lista.
- **Pendências:** DT-026 e DT-027 (categorias), DT-028 (auditoria da exclusão), DT-029 (identificação e concorrência), DT-031 e DT-035 (organização do `ProdutoService`), DT-033 (listagem), DT-034 (código e balança), DT-035 (embalagens no PDV), DT-038 (imagem), DT-030 (fuso dos carimbos das tabelas do catálogo) — ver [`technical-debt.md`](../technical-debt.md).
