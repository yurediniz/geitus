# Módulo: PDV (etapa 11)

> Decisões: **DEC-042**. Norte: [`visao-dominio-pdv.md`](../visao-dominio-pdv.md) §3.7 e §4. Diretriz: `CLAUDE.md`, "Módulo PDV". Depende do [Caixa](caixa.md) (DEC-041), das [embalagens](produtos-embalagens.md) (DEC-037), da [etiqueta de balança](produtos-codigo-e-balanca.md) (DEC-036), dos [preços](produtos-precos.md) (DEC-033) e do [estoque](produtos-estoque.md) (DEC-034).

## 1. Motivação e escopo

O PDV é a tela de venda no balcão. Prioriza rapidez, scanner, teclado, poucos cliques e o total sempre visível. Nada fiscal.

**Decisões do usuário (em conversa, 2026-10-24):**
- **Requisitos já combinados antes (2026-10-23):**
  - digitação `código*quantidade`;
  - etiqueta de balança no padrão da Toledo do usuário;
  - qualquer código de barras do produto ou da embalagem;
  - embalagens diferentes do mesmo produto como linhas separadas na mesma venda (Nexgard: 1 CX c/ 3 a R$ 209,90 + 1 UN a R$ 89,90 = R$ 299,80, baixa de 4 UN).
- **Esta entrega inclui:** venda básica, **desconto**, **cancelamento de venda**, **pagamento dividido** e **venda em espera**.
- **Estoque insuficiente:** configurável pelo ADMIN ("Vender sem estoque", ligada por padrão).
- **Desconto:** limite percentual do OPERADOR em Configurações (padrão 10%) e, para todos, nunca abaixo do preço mínimo do produto.
- **Cancelamento:** só enquanto o caixa da venda estiver aberto. O OPERADOR cancela as do próprio caixa; o ADMIN, as de qualquer caixa.
- **Fechamento do caixa com contagem por forma** (dinheiro, débito, crédito, PIX).
- **Abordagem B:** carrinho no navegador e venda gravada inteira, de forma atômica, ao finalizar.

**Fora desta fase (registrado):**
- impressão de cupom ou recibo;
- TEF e maquininha integrada;
- devolução depois do fechamento do caixa;
- parcelas no crédito;
- venda a prazo e crediário;
- outras formas de pagamento (vale, voucher);
- autorização do ADMIN no balcão;
- sugestão "Montar 1 CX + 1 UN?";
- PDV offline;
- registro de itens removidos antes de finalizar;
- venda em espera em outro computador.

## 2. Conceitos

- **Carrinho:** a venda em andamento. Vive no navegador e não existe no servidor até finalizar.
- **Linha:** um item do carrinho. Pode ser:
  - de **unidade**: o produto na unidade de venda;
  - de **embalagem**: por exemplo "CX c/ 3 UN";
  - de **etiqueta**: lida da balança, sempre uma linha nova.
- **Quantidade da linha:** na unidade da linha (3 CX, 1,250 KG).
- **Quantidade de estoque:** o que a linha baixa, na unidade de venda do produto. Para embalagem: quantidade × quantidade da embalagem.
- **Venda:** o registro gravado ao finalizar. Fica `CONCLUIDA`, e depois pode ficar `CANCELADA`.
- **Cálculo:** o resultado das regras de preço, desconto, total e troco, feito sempre pelo servidor (§5.3).

## 3. Regras de negócio

### 3.1 Lançar item
O campo **"Código ou nome"** tem sempre o foco. O texto lido é interpretado nesta ordem:

1. **Etiqueta de balança:** exatamente 13 dígitos que o `LeitorEtiquetaBalanca` reconhece com a configuração da empresa.
   - O produto é o de **código** igual ao lido (número sem zeros à esquerda).
   - **Etiqueta de valor** (`VALOR`): o valor da linha é o valor da etiqueta.
     - Em unidade **fracionada**, a quantidade é valor ÷ preço vigente sem atacado, com 3 casas, arredondada meio para cima.
     - Em unidade **não fracionada** (decisão do usuário, §10): o valor da etiqueta precisa ser **exatamente o preço normal de 1 unidade**; senão, erro "O valor da etiqueta ({R$ x}) não confere com o preço de {nome} ({R$ normal}).". Aceita, a linha é 1 UN com o preço das regras normais (promoção e atacado, §3.2).
   - **Etiqueta de peso** (`PESO`): a quantidade é o peso lido, e o valor é quantidade × preço vigente sem atacado, arredondado a centavos meio para cima. Só vale para produto de unidade fracionada; senão: "Etiqueta de peso para produto que não é vendido por peso.".
   - **Linha nova:** cada etiqueta é sempre uma linha nova, com origem de preço `ETIQUETA`.
2. **`código*quantidade`** ou só o código. A quantidade padrão é 1. O código pode ser:
   - **o código do produto**, numérico com zeros à esquerda aceitos: lança a **unidade**;
   - **um código de barras do produto:** lança a **unidade**;
   - **um código de barras de uma embalagem:** lança a **embalagem**.
   - **Quantidade:** decimal com vírgula ou ponto. Decimal só em unidade fracionada (para embalagem, a quantidade é sempre inteira).
3. **Busca no próprio campo (DEC-044):** com 3 caracteres ou mais, os produtos aparecem enquanto se digita (§5.3: nome, código ou código de barras, só **ativos**, até 20). Setas e Enter (ou o clique no card) lançam 1 unidade.
4. **Catálogo (DEC-044):** antes de digitar, os produtos **ativos** aparecem em cards, os **mais vendidos nos últimos 30 dias** primeiro (vendas concluídas, contadas por venda e não por quantidade) e o resto por nome, em páginas de 24. Uma faixa com as **categorias principais** filtra (a categoria vale com as subcategorias). O clique no card lança 1 unidade.

**Recusas (sem alterar o carrinho, com mensagem no campo e um bipe de erro discreto):**
- "Código não encontrado.";
- "Produto inativo — não pode ser vendido.";
- "{sigla} não aceita quantidade fracionada. Informe um número inteiro.";
- "A quantidade deve ser maior que zero.";
- "Quantidade acima do permitido." (acima de 99.999);
- **com "Vender sem estoque" desligada** e produto que controla estoque com saldo menor que a quantidade de estoque somada no carrinho: "Estoque insuficiente para {nome} (saldo {saldo} {sigla}).".

**Soma na mesma linha:** bipar de novo o mesmo produto na mesma unidade ou embalagem (sem etiqueta) soma na linha existente.

**Troca de embalagem:** uma linha de unidade de produto com embalagens ativas mostra o seletor "UN ▾", que troca a linha para uma embalagem (e de volta), mantendo a quantidade digitada.

**Limite:** no máximo 300 linhas por venda ("A venda atingiu o limite de 300 itens.").

### 3.2 Preço da linha
- **Unidade:** `PrecoDeVenda.resolver(produto, quantidadeTotal, hoje)`, em que `quantidadeTotal` é a **soma das quantidades das linhas de unidade** (não etiqueta, não embalagem) desse produto no carrinho. Vence o menor entre normal, promocional e atacado; empate dá `PROMOCIONAL`. Todas as linhas de unidade do produto usam o mesmo preço.
- **Embalagem:** o preço efetivo da embalagem (`PrecoDaEmbalagem`: o preço próprio, ou quantidade × preço vigente da unidade sem atacado). Origem `EMBALAGEM`.
- **Etiqueta:** §3.1.
- **Valor bruto da linha:** quantidade × preço unitário, arredondado a centavos meio para cima (a etiqueta de valor usa o valor da etiqueta).
- **"Hoje":** a data em `America/Sao_Paulo` do `Clock`.

### 3.3 Desconto
- **Desconto do item:** em R$ ou % sobre o valor bruto da linha. O % é aplicado e arredondado a centavos. Não pode passar do valor da linha.
- **Desconto do total:** em R$ ou % sobre o subtotal depois dos descontos dos itens.
  - É **repartido** entre as linhas proporcionalmente ao valor de cada uma, já com o desconto do item, em centavos, com o resto dado à linha de maior valor.
  - Não pode passar do subtotal.
- **Total:** subtotal bruto − descontos dos itens − desconto do total. Precisa ser **maior que zero** ("O total da venda precisa ser maior que zero.").
- **Limite do OPERADOR:**
  - (descontos dos itens + desconto do total) ÷ subtotal bruto × 100 ≤ `descontoMaximoOperador` (Configurações, padrão 10,00, de 0 a 100);
  - acima disso: "O desconto passa do limite do operador ({10}%).";
  - o ADMIN (perfil do **banco**) não tem limite percentual.
- **Preço mínimo, para todos:** em cada linha de produto com preço mínimo, o valor líquido (com o desconto repartido) ÷ quantidade de estoque não pode ficar abaixo do mínimo. Mensagem: "O desconto deixa {nome} abaixo do preço mínimo ({R$ x} por {sigla}).". A linha de etiqueta segue a mesma regra.

### 3.4 Pagamento
- **Formas:** `DINHEIRO`, `DEBITO`, `CREDITO` e `PIX`, com **uma linha por forma**. Valor > 0, até 2 casas.
- **Cartão e PIX:** a soma de débito, crédito e PIX **não passa do total** ("Cartão e PIX não podem passar do total. O troco só sai do dinheiro.").
- **Valor pago:** a soma de todas as formas **cobre o total** ("Falta pagar {R$ x}.").
- **Troco:** valor pago − total. Só existe quando há dinheiro, e nunca passa do dinheiro (garantido pela regra do cartão e PIX).
- **Recebido por forma** (vai para o caixa): o valor da forma. No dinheiro, o valor menos o troco. Se o dinheiro todo virar troco (líquido zero), não há recebimento em dinheiro.

### 3.5 Cliente
- **Opcional.** Busca por nome, CPF ou telefone entre os clientes **ativos** da empresa.
- **Na venda:** guarda o cliente e o nome dele na data. Cliente inativado depois não altera a venda.

### 3.6 Finalizar
Um único pedido, atômico e idempotente (§5.3). O servidor:

1. resolve o usuário (empresa e perfil do banco);
2. **trava a sessão de caixa `ABERTA` do usuário** (`FOR UPDATE`):
   - sem sessão aberta → 409 "Abra o caixa para vender.";
   - sessão em conferência → 409 "Termine o fechamento do caixa antes de vender.";
3. confere a chave: a mesma chave com os mesmos dados → 200 com a venda gravada; com outros dados → 409 "Esta operação já foi registrada com outros dados.";
4. **trava os produtos** das linhas que controlam estoque, em ordem de `id` (DT-032), e recalcula o carrinho inteiro (§3.1–§3.4) com os dados atuais;
5. se o total recalculado for diferente do `totalEsperado` enviado → 409 "O total da venda mudou. Confira os valores." (a tela chama o cálculo de novo e mostra a diferença);
6. valida desconto, preço mínimo, pagamento e, com "Vender sem estoque" desligada, o saldo (409 com o campo `itens[i]`);
7. **grava**:
   - a venda `CONCLUIDA`, com número sequencial por empresa (`Numerador`, tipo `VENDA`);
   - os itens com a fotografia (§4.2);
   - os pagamentos;
   - **um movimento de estoque `SAIDA`/`VENDA`** por linha de produto que controla estoque, ligado ao item;
   - **um movimento de caixa `RECEBIMENTO`** por forma com recebido > 0, ligado à venda.

**Estoque negativo:** com "Vender sem estoque" ligada, o saldo pode ficar negativo **só por movimento de venda**. O ajuste manual continua não podendo deixar o saldo negativo (regra da Fase D).

**Produto sem controle de estoque:** é vendido sem movimento de estoque.

### 3.7 Venda em espera
- **Onde fica:** no navegador (por empresa e usuário), até **5** vendas, cada uma com hora, quantidade de itens e total.
- **F6:** põe o carrinho atual em espera ("Venda em espera.") e esvazia a tela.
- **Retomar:** com um carrinho em andamento, pergunta "Pôr a venda atual em espera?". Com 5 em espera: "Limite de 5 vendas em espera.".
- **Preços e estoque:** valem os de agora. O cálculo é refeito ao retomar e de novo ao finalizar.

### 3.8 Cancelamento
- **Quando:** só com a sessão de caixa da venda em `ABERTA`. Em conferência ou fechada → 409 "Esta venda é de um caixa que já foi fechado ou está em conferência. Use devolução." (a devolução vem numa fase futura).
- **Quem:** o OPERADOR cancela vendas de sessões abertas por ele. O ADMIN cancela as de qualquer sessão. OPERADOR em venda de outro → 404.
- **Motivo:** obrigatório, aparado, até 200 caracteres.
- **Venda já cancelada:**
  - cancelar de novo com o mesmo motivo → 200;
  - com outro motivo → 409 "Esta venda já foi cancelada.".
- **Grava, na mesma transação** (trava a sessão, depois os produtos em ordem de `id`):
  - a venda `CANCELADA`, com quem cancelou, quando e o motivo;
  - **um movimento de estoque `ENTRADA`/`CANCELAMENTO_VENDA`** por item que baixou estoque;
  - **um movimento de caixa `ESTORNO`** por forma recebida, com o mesmo valor do recebimento.
- **Dinheiro na gaveta:** o estorno em dinheiro não pode passar do dinheiro esperado na gaveta → 409 "Não há dinheiro suficiente na gaveta para devolver ({R$ x}).". No modo cego, para o OPERADOR, a mensagem sai sem o valor.

### 3.9 Caixa: recebimentos e conferência por forma
- **Movimentos:** os movimentos de caixa passam a ter **forma**. Abertura, suprimento e sangria são sempre `DINHEIRO`.
- **Esperado por forma:**
  - `DINHEIRO` = abertura + suprimentos + recebimentos − sangrias − estornos (o que hoje é "dinheiro na gaveta");
  - `DEBITO`, `CREDITO`, `PIX` = recebimentos − estornos.
- **Sangria:** continua limitada ao esperado em dinheiro.
- **Contagem:**
  - o dinheiro é sempre contado;
  - débito, crédito e PIX são contados **quando a forma teve movimento na sessão**;
  - forma faltando → 400 "Informe o valor contado de {Débito}.";
  - forma sem movimento enviada → 400.
- **Diferença:** cada forma tem a sua (contado − esperado).
  - **Todas zero:** fecha direto.
  - **Alguma diferente de zero:** segue as regras do Caixa (modo cego: vai para `EM_CONFERENCIA`; não cego: fecha com a justificativa ou vai para conferência). A **justificativa é uma só** para o fechamento.
- **Modo cego por forma:** enquanto `ABERTA`, o OPERADOR não recebe o esperado de nenhuma forma.
  - Os movimentos `RECEBIMENTO` e `ESTORNO` saem com `valor: null` para ele na tela do caixa, como os lançamentos de outra pessoa (DEC-041).
  - **Limitação aceita (resolve a DT-039):** a lista de vendas do caixa (F8) mostra o total de cada venda, porque o operador precisa dela para atender e cancelar. Quem quiser somar consegue.
- **Fotografia do fechamento:** é gravada por forma (§4.4).

### 3.10 Configurações › PDV
- **"Vender sem estoque":** padrão **ligado**.
- **"Desconto máximo do operador (%)":** padrão **10,00**, de 0 a 100, até 2 casas.
- **Quem lê:** todos, porque a tela do PDV precisa das duas.
- **Quem altera:** só ADMIN, conferido também pelo perfil do banco, como no Caixa.
- **Registro:** guarda quem alterou e quando.

## 4. Banco — migration `V17__pdv.sql`

Aditiva (V1–V16 intactas). Convenções da V9 e da V16:
- PK `BIGINT` mais `uuid` público;
- FKs compostas `(empresa_id, …)`;
- `TIMESTAMPTZ` preenchido pelo `Clock`, truncado em microssegundos.

### 4.1 `vendas`
| Coluna | Tipo | Observações |
|---|---|---|
| `id`, `uuid`, `empresa_id` | | `UNIQUE (empresa_id, id)` |
| `numero` | `BIGINT` | NOT NULL, `UNIQUE (empresa_id, numero)` |
| `sessao_caixa_id` | `BIGINT` | NOT NULL, FK composta → `sessoes_caixa`, `RESTRICT` |
| `usuario_id` | `BIGINT` | NOT NULL, FK composta → `usuario` |
| `cliente_id` | `BIGINT` | NULL, FK composta → `clientes`, `RESTRICT` |
| `cliente_nome` | `VARCHAR` | fotografia; NULL sem cliente |
| `status` | `VARCHAR(10)` | `CHECK IN ('CONCLUIDA','CANCELADA')` |
| `subtotal`, `desconto_itens`, `desconto_total`, `total`, `troco` | `NUMERIC(12,2)` | NOT NULL; `total > 0`; descontos e troco ≥ 0; `total = subtotal − desconto_itens − desconto_total` |
| `chave_idempotencia` | `UUID` | NOT NULL, `UNIQUE (empresa_id, chave_idempotencia)` |
| `concluida_em` | `TIMESTAMPTZ` | NOT NULL |
| `cancelada_por`, `cancelada_em`, `motivo_cancelamento` | | NULL até cancelar; `CHECK` de coerência com o status; motivo aparado e não vazio |

- **Índices:**
  - `(empresa_id, sessao_caixa_id, id DESC)`;
  - `(empresa_id, concluida_em DESC, id DESC)`.
- **Gatilho:** proíbe `DELETE` e permite, como `UPDATE`, só `CONCLUIDA → CANCELADA` com o preenchimento do cancelamento.

### 4.2 `itens_venda`
| Coluna | Tipo | Observações |
|---|---|---|
| `id`, `empresa_id`, `venda_id`, `ordem` | | FK composta → `vendas` `RESTRICT`; `UNIQUE (venda_id, ordem)` |
| `produto_id` | `BIGINT` | NOT NULL, FK composta → `produtos` `RESTRICT` (produto vendido não é excluído) |
| `produto_nome`, `codigo_lido`, `unidade_sigla` | `VARCHAR` | fotografia; `codigo_lido` é o texto lido (NULL na busca por nome) |
| `embalagem_rotulo`, `embalagem_quantidade` | | NULL fora de embalagem; **sem FK** (só fotografia) |
| `etiqueta` | `BOOLEAN` | NOT NULL |
| `quantidade` | `NUMERIC(12,3)` | `> 0` |
| `quantidade_estoque` | `NUMERIC(12,3)` | `> 0` |
| `preco_unitario` | `NUMERIC(12,2)` | `> 0` |
| `origem_preco` | `VARCHAR(12)` | `NORMAL`, `PROMOCIONAL`, `ATACADO`, `EMBALAGEM`, `ETIQUETA` |
| `valor_bruto`, `desconto_item`, `desconto_rateado`, `valor_liquido` | `NUMERIC(12,2)` | `valor_liquido = valor_bruto − desconto_item − desconto_rateado ≥ 0` |
| `custo_unitario` | `NUMERIC(12,4)` | NULL quando o produto não tem custo; custo por unidade de estoque na data |

Imutável: gatilho proíbe `UPDATE` e `DELETE`.

### 4.3 `pagamentos_venda`
- **Colunas:** `id`, `empresa_id`, `venda_id` e `forma` (`CHECK IN ('DINHEIRO','DEBITO','CREDITO','PIX')`), mais `valor` `NUMERIC(12,2) > 0`.
- **Unicidade:** `UNIQUE (venda_id, forma)`.
- **Imutável.**

### 4.4 Caixa
- **`movimentos_caixa`:**
  - `forma` (`VARCHAR(10)` NOT NULL, `DEFAULT 'DINHEIRO'` só para a carga das linhas atuais, removido depois);
  - `tipo` passa a aceitar `RECEBIMENTO` e `ESTORNO`;
  - `venda_id` NULL, FK composta → `vendas`.
  - **`CHECK`s:**
    - `ABERTURA`, `SUPRIMENTO` e `SANGRIA` sempre com `forma = 'DINHEIRO'` e `venda_id` nulo;
    - `RECEBIMENTO` e `ESTORNO` com `venda_id`, `valor > 0` e sem motivo;
    - `UNIQUE (empresa_id, venda_id, tipo, forma)` para os dois tipos.
  - **Sinal:** recebimento soma e estorno subtrai.
- **`contagens_caixa`** (nova):
  - **Colunas:** `empresa_id`, `sessao_caixa_id` (FK composta), `forma` (`DEBITO`, `CREDITO` ou `PIX`) e `valor_esperado`, `valor_contado`, `diferenca` (`NUMERIC(12,2)`, `diferenca = contado − esperado`).
  - **Unicidade:** `UNIQUE (sessao_caixa_id, forma)`.
  - **Imutável:** gravada junto com a contagem.
  - O dinheiro continua nas colunas da própria sessão.
- **`sessoes_caixa`:**
  - o `CHECK` "`EM_CONFERENCIA` exige `diferenca <> 0`" passa a considerar **qualquer** forma (gatilho, porque envolve `contagens_caixa`);
  - a justificativa é exigida quando qualquer forma tem diferença;
  - o `data-reviewer` define a forma exata.

### 4.5 Estoque
- **`movimentos_estoque`:**
  - motivo `CANCELAMENTO_VENDA` (tipo `ENTRADA`, origem `VENDA`);
  - `item_venda_id` NULL, FK composta → `itens_venda`;
  - `UNIQUE (empresa_id, item_venda_id, motivo)`;
  - a chave de idempotência continua nula nos movimentos de venda, porque a idempotência é a da venda (DT-032).
- **Saldo negativo:**
  - sai o `ck_estoque_saldo_nao_negativo` de `estoque_saldos`;
  - entra, em `movimentos_estoque`, `CHECK (saldo_novo >= 0 OR motivo = 'VENDA')`;
  - a configuração "Vender sem estoque" é aplicada no service.

### 4.6 `configuracoes_pdv`
| Coluna | Tipo | Observações |
|---|---|---|
| `empresa_id` | `BIGINT` | PK, FK → `empresa` |
| `vender_sem_estoque` | `BOOLEAN` | NOT NULL, default `true` |
| `desconto_maximo_operador` | `NUMERIC(5,2)` | NOT NULL, default `10.00`, `0 a 100` |
| `atualizado_por`, `atualizado_em` | | NOT NULL; FK composta → `usuario` |

## 5. Backend

### 5.1 Pacotes
- **`sales`** (novo):
  - `sales/carrinho`: interpretação do código, cálculo de preço, desconto, total e troco. Regras puras e testáveis, sem banco no cálculo;
  - `sales/venda`: venda, itens, pagamentos, finalização, cancelamento e listagem;
  - `sales/configuracao`.
- **Dependências:**
  - `sales` depende de `catalog` (produto, preço, embalagem, etiqueta), `inventory` (baixa e estorno), `cashier` (sessão e movimentos), `customer` e `iam`;
  - **nada depende de `sales`**.
  - Para o `cashier`, os recebimentos entram por uma interface do próprio `cashier` (`RecebimentosDoCaixa`), sem o `cashier` conhecer a venda além do id.
- **`sessaoAbertaDoUsuario`** passa a receber `UsuarioAutenticado` e a travar a sessão (DT-039).

### 5.2 Regras de cálculo (domínio puro)
- **`InterpretadorDeCodigo.interpretar(String texto)`** → `Etiqueta(codigoLido)` | `CodigoComQuantidade(codigo, quantidade)` | `Busca(texto)`.
- **`CalculadoraDaVenda.calcular(List<LinhaParaCalculo>, DescontoDoTotal, List<Pagamento>, PerfilEConfiguracao, LocalDate hoje)`** → `CalculoDaVenda` (linhas com preço, origem, bruto, descontos e líquido; subtotal; descontos; total; pago; troco; falta; avisos e erros por campo).
- **Uso:** é a mesma calculadora no `POST /calculo` e na finalização.

### 5.3 Rotas
Todas autenticadas e isoladas pela empresa do JWT. Recurso de outra empresa → 404.

| Método e rota | Perfil | Respostas |
|---|---|---|
| `GET /api/pdv/itens?codigo=` | todos | 200 com o item resolvido; 404 "Código não encontrado."; 409 produto inativo; 400 quantidade inválida |
| `GET /api/pdv/itens?busca=` | todos | 200, até 20 produtos ativos (nome, código, unidade, preço vigente, saldo, miniatura, embalagens) |
| `GET /api/pdv/catalogo?categoria=&pagina=` | todos | 200 `{ produtos, temMais }`: 24 produtos ativos por página, os mais vendidos (30 dias) primeiro e o resto por nome; `categoria` (UUID) inclui as subcategorias, e a de outra empresa responde vazio; 400 página fora de 0–400 |
| `POST /api/pdv/calculo` | todos | 200 `CalculoDaVenda`, mesmo com regras violadas (vêm em `erros`); 400 só para corpo malformado |
| `POST /api/pdv/vendas` | todos | 201 / 200 (chave repetida) / 400 / 409 |
| `GET /api/pdv/vendas` | OPERADOR: das próprias sessões · ADMIN: todas | 200 paginado; filtros `sessaoId` (padrão: a sessão atual do usuário), `status`, `de`, `ate`, `numero` |
| `GET /api/pdv/vendas/{id}` | dono da sessão ou ADMIN | 200 / 404 |
| `POST /api/pdv/vendas/{id}/cancelamento` | dono da sessão ou ADMIN | 200 / 400 / 404 / 409 |
| `GET /api/configuracoes/pdv` | todos | 200 |
| `PUT /api/configuracoes/pdv` | ADMIN | 200 / 400 / 403 |
| `POST /api/caixa/sessoes/{id}/contagem` | dono ou ADMIN | **muda** para `{ contagens: { "DINHEIRO": 318.00, "DEBITO": 120.00 }, justificativa? }` |

**Item resolvido** (`GET /api/pdv/itens?codigo=`):
```json
{ "tipo": "UNIDADE | EMBALAGEM | ETIQUETA", "quantidade": 3,
  "produto": { "id": "uuid", "codigo": 542, "nome": "Ração X 1kg", "unidade": "UN", "fracionada": false,
               "controlaEstoque": true, "saldo": 12.000, "miniaturaUrl": "…",
               "embalagens": [ { "id": "uuid", "rotulo": "CX c/ 3 UN", "quantidade": 3 } ] },
  "embalagemId": null, "codigoLido": "7891234567895" }
```

**Carrinho** (corpo do `/calculo` e base do `/vendas`):
```json
{ "itens": [ { "produtoId": "uuid", "embalagemId": null, "quantidade": 3, "codigoLido": "542*3",
               "etiqueta": false, "desconto": { "tipo": "PERCENTUAL", "valor": 5 } } ],
  "desconto": { "tipo": "VALOR", "valor": 2.00 }, "clienteId": null,
  "pagamentos": [ { "forma": "DINHEIRO", "valor": 50.00 }, { "forma": "PIX", "valor": 20.00 } ] }
```
- **Linha de etiqueta:** traz `etiqueta: true` e `codigoLido` com os 13 dígitos. O servidor lê a etiqueta de novo e **ignora** a quantidade enviada.
- **`/vendas`:** acrescenta `chave` (UUID) e `totalEsperado`.

**Venda** (resposta):
```json
{ "id": "uuid", "numero": 128, "status": "CONCLUIDA", "sessaoId": "uuid", "pontoNome": "Caixa 1",
  "vendedorNome": "Ana Souza", "clienteNome": null, "subtotal": 74.70, "descontoItens": 1.20,
  "descontoTotal": 2.00, "total": 71.50, "troco": 0.00, "concluidaEm": "2026-10-24T18:02:00-03:00",
  "itens": [ { "ordem": 1, "nome": "Ração X 1kg", "embalagemRotulo": null, "quantidade": 3, "unidade": "UN",
               "precoUnitario": 24.90, "origemPreco": "NORMAL", "valorBruto": 74.70, "descontoItem": 1.20,
               "descontoRateado": 2.00, "valorLiquido": 71.50 } ],
  "pagamentos": [ { "forma": "DINHEIRO", "valor": 51.50 }, { "forma": "PIX", "valor": 20.00 } ],
  "cancelamento": null, "podeCancelar": true }
```
- **Custo:** o custo não sai na resposta.
- **Lista de vendas:** a mesma resposta, sem `itens`.

### 5.4 Erros por campo
- `itens[i].quantidade`, `itens[i].desconto`, `itens[i]` (estoque, preço mínimo);
- `desconto`, `pagamentos`, `pagamentos[i].valor`, `clienteId`, `motivo`;
- `contagens.DEBITO` e equivalentes.

## 6. Frontend

### 6.1 Navegação
- **Menu:** o item "PDV" deixa de ser "em breve" e leva a `/pdv`, para todos.
- **Feature:** `features/pdv/`.
- **Configurações:** ganha a seção **PDV**.

### 6.2 Tela `/pdv`
- **Sem caixa aberto:**
  - mostra "Abra o caixa para vender." e o botão **Abrir caixa**, com a mesma janela do Caixa;
  - em conferência, mostra "Termine o fechamento do caixa." com o link para o Caixa.
- **Layout (desktop; mínimo 1024 px):**
  - **Barra superior (grafite, modo foco sem a sidebar):** marca, caixa com a situação, operador, **Em espera (n)** (F7), **Vendas do caixa** (F8) e **Menu**.
  - **Coluna esquerda: campo "Código ou nome" no topo**, com foco permanente (volta sozinho depois de cada janela), e logo abaixo a **busca ao vivo** (DEC-044): com 3 caracteres ou mais (e sem `*`), os produtos ativos aparecem em cards (miniatura, código, preço vigente, saldo). Antes disso, o **catálogo** (§3.1, item 4), com a faixa das categorias principais ("Todas" + uma por categoria) e mais cards ao rolar.
  - **Coluna direita:**
    - cliente (F3);
    - **itens do carrinho**: miniatura, nome, preço unitário (com selo **Promoção**, **Atacado** ou **Balança**), código lido, desconto e valor, com **− quantidade +**, seletor "UN ▾" quando há embalagens, **%** (desconto do item) e **×** (remover). A última linha lançada tem um destaque breve; os avisos aparecem na própria linha ("Estoque insuficiente (saldo 2 UN)");
    - resumo (subtotal, descontos, **Desconto da venda** Shift+F4) e o **Total da venda** em destaque (o maior texto da tela);
    - **Ir para pagamento** (F10) e **Pôr em espera** (F6).
- **Atalhos:** F2 seleciona o campo de busca · F3 cliente · F4 desconto do item selecionado · Shift+F4 desconto do total · F6 pôr em espera · F7 vendas em espera · F8 vendas do caixa · F9 imprimir o comprovante da última venda · F10 pagamento · ↑/↓ seleciona linha (com os cards da busca na tela, ↑/↓ escolhem o card) · + / − quantidade da linha · Del remove a linha (com confirmação se houver desconto) · Esc fecha janelas.
- **Feedback:**
  - erro de leitura: em vermelho no campo e um bipe curto (Web Audio, com volume baixo);
  - linha nova: um destaque breve (sem animação lenta).
- **Cálculo:** cada mudança no carrinho chama `POST /api/pdv/calculo` (com debounce de 150 ms e cancelando o pedido anterior), e a tela mostra o resultado do servidor. Enquanto calcula, o total mostra um indicador discreto, sem esconder o valor anterior.
- **Carrinho no navegador:** guardado em `localStorage` por empresa e usuário. Recarregar a página mantém a venda.

### 6.3 Pagamento (F10)
- **Tela inteira** (DEC-044), com **Voltar ao carrinho** (Esc) na barra: à esquerda, 1. forma e 2. valor; à direita, 3. resumo e pagamentos e 4. conferência dos itens.
- **Formas:** **1 Dinheiro**, **2 Débito**, **3 Crédito** e **4 PIX**. A tecla escolhe a forma e preenche o valor com o que falta pagar; Enter adiciona ("Usar o que falta" repreenche).
- **Formas usadas:** ficam listadas, com remover.
- **Em destaque:** **Falta pagar** e **Troco**.
- **Finalizar:** com o pago cobrindo o total, Enter finaliza. O botão fica desabilitado durante o envio, e a chave é gerada ao abrir a janela.
- **Depois de concluir:**
  - aviso "Venda nº 128 concluída · Troco R$ 5,00";
  - o carrinho fica vazio e o foco volta ao campo;
  - não há tela intermediária;
  - junto do troco, **Imprimir comprovante** (F9). Nada é impresso sem o operador pedir.
- **Comprovante (DEC-044):** cupom de 80 mm no formato de uma NFC-e, mas **não fiscal**: empresa (nome, razão social, CNPJ, IE, endereço, telefone), "DOCUMENTO NÃO FISCAL", itens (nº, descrição, quantidade × unitário, valor e desconto), quantidade de itens, total, descontos, valor a pagar, formas, troco, consumidor (ou "CONSUMIDOR NÃO IDENTIFICADO"), nº da venda, data e hora, ponto e operador, e o aviso de que não substitui a nota fiscal. Venda cancelada sai com "*** VENDA CANCELADA ***". Impressão pela janela do navegador (`@media print`, papel de 80 mm).
- **"O total da venda mudou":** janela com o total anterior e o novo, mais **Confirmar e finalizar** e **Voltar à venda**.
- **Rede caiu:** a janela mantém tudo, e um novo Enter reenvia **a mesma chave**.

### 6.4 Vendas em espera (F7) e vendas do caixa (F8)
- **Em espera:** lista com hora, itens e total, mais **Retomar** e **Descartar** (com confirmação).
- **Vendas do caixa:**
  - lista da sessão atual com nº, hora, cliente, formas, total e situação;
  - o detalhe mostra itens e pagamentos, mais **Imprimir comprovante** (reimpressão) e **Cancelar venda** com o motivo (até 200 caracteres);
  - ADMIN: filtro por ponto e período.

### 6.5 Caixa (muda)
- **Fechar caixa:**
  - um campo por forma: Dinheiro sempre, e Débito, Crédito e PIX quando tiveram movimento (a lista de formas vem na sessão);
  - **modo não cego:** esperado e diferença ao lado de cada campo;
  - **modo cego:** os resultados por forma aparecem depois de "Conferir";
  - uma justificativa única.
- **Resumo do fechamento e histórico:** mostram a tabela por forma.
- **Movimentos `RECEBIMENTO` e `ESTORNO`:** aparecem na lista com o nº da venda.

### 6.6 Configurações › PDV (ADMIN)
- **Interruptor "Vender sem estoque":** "Quando ligado, a venda passa mesmo sem saldo e o estoque fica negativo até o ajuste."
- **Campo "Desconto máximo do operador (%)":** "Acima disso, só administradores dão desconto. Nenhum desconto passa do preço mínimo do produto."

## 7. Segurança
- **Empresa, usuário e perfil:** sempre do JWT mais o banco (resolvedor). Vendedor, cancelador e quem conta são sempre o autenticado.
- **O servidor recalcula tudo:** preço, desconto, total e troco. O valor da etiqueta vem da releitura do código. Nada de preço ou valor vindo do navegador é gravado.
- **Isolamento:** produto, embalagem e cliente são sempre buscados na empresa do usuário. Um id de outra empresa no carrinho → 404 com o campo.
- **Regra do dono:** venda de sessão de outra pessoa → 404 para o OPERADOR.
- **Modo cego:** o esperado por forma nunca sai para o OPERADOR com a sessão `ABERTA` (sessão, contagem, mensagens de estorno). A limitação de §3.9 fica registrada.
- **Custo:** não sai em nenhuma resposta do PDV.
- **Revisores obrigatórios:**
  - `data-reviewer`: V17, mudança do `CHECK` de saldo, gatilhos e contagem por forma;
  - `security-reviewer`: recálculo no servidor, isolamento, regra do dono, cancelamento, modo cego e limite de desconto pelo perfil do banco.

## 8. Testes (critérios de aceite)

**Domínio (unitários):**
- **Interpretador:**
  - `542*3`, `0542*3`, `542*0,750`, `542*0.750`, `*3`, `542*`, `542*-1`;
  - etiqueta válida e inválida;
  - texto → busca.
- **Etiqueta:**
  - `2000542010000` com KG a R$ 25,00/kg → 0,400 KG por R$ 10,00;
  - UN a R$ 5,00 → 2 UN; UN a R$ 3,00 → 1 UN por R$ 10,00;
  - etiqueta de peso em produto não fracionado → recusa.
- **Preço:**
  - atacado pela soma das linhas de unidade (12 UN em duas linhas atinge o atacado de 12);
  - a embalagem não conta para o atacado;
  - Nexgard 1 CX + 1 UN = R$ 299,80 com baixa de 4.
- **Desconto:**
  - % e R$ no item e no total;
  - repartição com o resto de centavos na maior linha;
  - limite de 10% (10,00% passa, 10,01% não);
  - ADMIN sem limite;
  - preço mínimo por unidade de estoque em embalagem.
- **Pagamento:**
  - troco só do dinheiro;
  - cartão acima do total recusado;
  - falta pagar;
  - dinheiro todo virando troco, sem recebimento em dinheiro.

**Banco (Testcontainers):**
- a V17 sobre a V16 com dados (movimentos atuais viram `DINHEIRO`);
- imutabilidade de itens e pagamentos;
- só `CONCLUIDA → CANCELADA`;
- `CHECK` de saldo negativo só por venda;
- contagem por forma e a nova regra de conferência;
- FKs de outra empresa recusadas.

**Backend (ITs):**
- **finalizar:**
  - sem caixa → 409;
  - caixa em conferência → 409;
  - chave repetida → 200;
  - total mudou → 409;
  - "Vender sem estoque" desligada → 409 com campo; ligada → saldo negativo;
  - produto sem controle → sem movimento;
  - recebimentos por forma e estoque baixado com a quantidade da embalagem;
- **concorrência:**
  - duas vendas simultâneas do mesmo produto com "Vender sem estoque" desligada e saldo para só uma → uma passa e a outra recebe 409;
  - duas finalizações com a mesma chave → uma venda;
- **cancelamento:**
  - estorna estoque e caixa;
  - caixa fechado → 409;
  - OPERADOR em venda de outro → 404;
  - estorno em dinheiro acima da gaveta → 409;
  - repetido → 200;
- **contagem por forma:**
  - formas obrigatórias;
  - modo cego por forma;
  - diferença só no cartão → conferência;
- **configuração:** OPERADOR → 403; ADMIN rebaixado com token antigo → 403;
- **isolamento:** produto, cliente e venda de outra empresa → 404.

**Frontend:**
- lançamento por código, quantidade, etiqueta e busca;
- soma na mesma linha e troca de embalagem;
- atalhos;
- cálculo com debounce e cancelamento do pedido anterior;
- pagamento dividido com troco;
- finalizar e limpar;
- total mudou;
- rede caiu com a mesma chave;
- espera (limite de 5, retomar com carrinho aberto);
- cancelamento;
- sem caixa;
- carrinho mantido ao recarregar;
- fechamento do caixa por forma nos dois modos;
- Configurações › PDV.

**Manual (navegador):**
- uma venda real com scanner (ou digitação) e etiqueta;
- Nexgard CX + UN;
- pagamento dividido com troco;
- cancelamento;
- fechamento por forma.

## 9. Pendências resolvidas por este módulo
- **DT-032:**
  - trava dos produtos em ordem de `id` na baixa por venda;
  - chave por consequência (a idempotência é da venda, e os movimentos ficam ligados ao item);
  - registro da trava pessimista.
- **DT-039:**
  - decisão do modo cego com recebimentos (§3.9);
  - `sessaoAbertaDoUsuario` com `UsuarioAutenticado` e trava.
- **DT-028 (parcial):** item de venda referencia o produto com FK `RESTRICT`; produto vendido não é excluído.

## 10. Ajustes na implementação

Decisões tomadas durante a implementação e as revisões (2026-10-24), que completam ou corrigem o texto acima.

**Regras**
- **Etiqueta só de produto vendido na balança.** A releitura da etiqueta só aceita produto com "vendido na balança" marcado; para os outros, "Código não encontrado." (segurança: impede forjar uma etiqueta de R$ 0,01 para qualquer produto). A linha de etiqueta confere **sempre** o preço mínimo, mesmo sem desconto: "O valor da etiqueta deixa {nome} abaixo do preço mínimo ({R$ x} por {sigla}).". A regra antiga "UN não múltiplo = 1 unidade pelo valor" foi **substituída** (ver abaixo).
- **Etiqueta de produto vendido em UN (decisão do usuário):** a etiqueta precisa trazer exatamente o **preço normal** de 1 unidade, nem mais nem menos; senão, erro. Aceita, vira 1 UN cobrada pelas regras normais: promoção vigente e atacado, com as etiquetas de UN somando na quantidade do atacado junto com as unidades bipadas pelo código. Exemplo: Ração Gato 1 kg (normal R$ 10,00, promocional R$ 9,00, atacado R$ 8,50 a partir de 3 UN): a etiqueta de R$ 10,00 é cobrada a R$ 9,00; com 3 unidades na venda, R$ 8,50 cada; etiquetas de R$ 9,00 ou R$ 20,00 dão erro. A origem do preço é a da regra (`NORMAL`, `PROMOCIONAL` ou `ATACADO`). Produto por peso não tem essa conferência: a quantidade sai do valor.
- **Desconto percentual arredonda para baixo** (a favor da loja): X% nunca passa de X%. Exemplo: 10% de R$ 2,45 = R$ 0,24.
- **Preço mínimo nas outras linhas:** só é conferido quando há desconto, porque promoção, atacado e embalagem já são validados contra o mínimo no cadastro.
- **Repartição do desconto do total:** os centavos vão para baixo e o resto vai para a linha de maior valor (empate: a primeira).
- **Estoque negativo:** o banco aceita `saldo_novo >= 0 OR motivo = 'VENDA' OR tipo = 'ENTRADA'`. Sem a entrada, uma compra ou o estorno de outra venda com o saldo ainda negativo (−10 + 5 = −5) seriam recusados. O ajuste manual continua sem deixar negativo.
- **Produto vendido** (com ou sem controle de estoque) não aparece como excluível: "Este produto já foi vendido e não pode ser excluído. Inative-o.".
- **Limites de entrada:**
  - valores com até 10 dígitos inteiros e 2 casas;
  - quantidade com até 9 inteiros e 3 casas;
  - `?codigo=` até 60 caracteres e `?busca=` até 100;
  - a finalização recusa mais de 300 linhas **antes** de travar o caixa e os produtos.
- **`GET /api/pdv/itens`** com `codigo` e `busca` juntos, ou sem nenhum: 400 "Informe o código ou o texto da busca.".
- **Código alfanumérico:** todo texto sem espaço é tratado como código (Code128 e outros); texto com espaço é busca por nome. Um texto sem dígitos que não é código volta ao campo e vira busca.
- **Enter com a busca na tela (DEC-044):** lança o card ativo quando o operador o escolheu com as setas, ou quando o texto é um nome (com espaço ou sem dígito) e os cards do termo já chegaram. Fora isso, o Enter lê o código: um número com cards na tela continua indo para a leitura (o bipe de uma embalagem nunca vira 1 unidade). Um nome com espaço teclado antes de os cards chegarem lança o card ativo quando eles chegam. Escolher um card entra pela mesma fila das leituras. Os cards do termo anterior ficam esmaecidos e sem clique até chegarem os do termo atual.
- **Pagamentos informados** ficam guardados ao voltar ao carrinho (Esc) enquanto o carrinho não muda.
- **Pagamentos gravados** com os valores normalizados pelo cálculo, não os do navegador.
- **Modo cego:** a lista de vendas (F8) mostra, além do total, as formas e o troco de cada venda. A limitação aceita em §3.9 é essa.

**Chave de idempotência (corrige §6.3)**
- **Ciclo da chave:** ela **não** nasce ao abrir a janela de pagamento.
  - Nasce na primeira tentativa de finalizar e fica guardada junto do carrinho, no navegador.
  - É reaproveitada em qualquer nova tentativa, mesmo depois de fechar a janela ou recarregar a página.
  - Só é trocada depois de sucesso ou de uma recusa definitiva.
- **Depois de falha de rede:**
  - o pagamento fica travado, com "A última tentativa pode ter sido registrada. Tente de novo com os mesmos valores.";
  - "Descartar tentativa" pede para conferir em Vendas do caixa (F8) antes de liberar.
- **409 "outros dados":** vira "Esta venda pode já ter sido registrada. Confira em Vendas do caixa (F8).".
- **Venda repetida que volta cancelada:** "Esta venda já tinha sido registrada e depois cancelada. Confira em Vendas do caixa (F8).".
- **Uma aba do PDV por usuário** no mesmo navegador (`navigator.locks`): duas abas apagariam a chave uma da outra e poderiam duplicar a venda.

**Banco (V17)**
- **Vendedor:** é sempre o dono da sessão (FK `fk_venda_sessao_do_vendedor` para `(empresa_id, id, aberta_por)`).
- **Venda conferida no commit:** uma constraint trigger deferida confere a venda inteira no commit:
  - pelo menos um item;
  - somas dos itens iguais aos totais da venda;
  - pagamentos − troco = total;
  - troco ≤ dinheiro.
- **Estornos presos à origem:**
  - o estorno de caixa exige o recebimento da mesma venda, forma e valor, e a aplicação lê os recebimentos gravados;
  - o cancelamento de estoque exige a baixa do mesmo item, com a quantidade oposta.
- **Conferência por forma:**
  - CHECKs da sessão trocados por gatilhos, com o esperado de cada forma conferido de novo na saída de `ABERTA`;
  - a contagem trava a sessão com `FOR NO KEY UPDATE`.
- **Índice da lista por sessão:** `(empresa_id, sessao_caixa_id, concluida_em DESC, id DESC)`.
- **Ordem de travas:** sessão → produtos em ordem de `id` → saldos. O carrinho é montado depois de travar os produtos. A renomeação de marca também trava os produtos em ordem de `id`.

**Frontend**
- **Modo foco:** em `/pdv` a sidebar fica recolhida (botão "Menu"), e o total ajusta a fonte ao tamanho do texto.
- **Última venda:** aparece no painel, abaixo do TOTAL, com o troco em destaque, até o primeiro item da próxima.
- **Pagamento:** débito, crédito e PIX acima do que falta pagar são recusados na hora.
- **Leitura:**
  - leituras pendentes bloqueiam o F10 ("Aguarde a leitura…"), com tempo máximo de 8 s;
  - o erro de leitura fica visível até a próxima recusa, até Esc ou por 6 s, e traz o código lido;
  - o Del mostra "{nome} removido da venda." com Desfazer.
- **F8:** paginação ("Carregar mais") e busca pelo número da venda. O filtro por ponto fica para depois.
