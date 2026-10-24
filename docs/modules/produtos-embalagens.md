# Produtos: Embalagens de venda (Fase B3)

> **Status:** **implementada** em 2026-10-24 (migration V12; ajustes da implementação e das revisões no §10). Desenho aprovado em conversa no mesmo dia. Fase intermediária da DEC-030, depois da Fase B2 ([produtos-codigo-e-balanca.md](produtos-codigo-e-balanca.md)) e antes da Fase F (imagem). Decisões na **DEC-037**.

## 1. Motivação
- **Caso que falta:** vender o mesmo produto em formas diferentes, cada uma com o seu código de barras e o seu preço.
  - Exemplo: **Nexgard Combo**, caixa com 3 unidades a **R$ 209,90**, e a unidade avulsa a **R$ 89,90**.
- **Caso já coberto hoje:** a caixa de sachês que chega com 18 UN na nota e é vendida só por unidade (unidade de compra CX, fator 18).
- **Decisão (2026-10-23):** **um produto só, com estoque único na unidade de venda, e uma lista de embalagens.**
  - O usuário propôs dois produtos vinculados com estoques sincronizados; isso foi descartado porque gera estoque fracionado (5 sachês = 0,28 CX), dois saldos e relatórios divididos.
- **Fim da unidade de compra separada:** a unidade de compra atual (unidade + fator) passa a ser uma embalagem marcada "de compra".

## 2. Embalagem

### 2.1 Campos

| Campo | Obrigatório | Regra |
|---|---|---|
| **Unidade** | sim | Uma unidade ativa do cadastro (CX, FD, PCT, DZ…), **diferente da unidade de venda** do produto. |
| **Quantidade** | sim | Quantas unidades de venda a embalagem contém. **Maior que 1.** Com casas decimais (até 3) só se a unidade de venda for **fracionada** (ex.: SC com 25,5 KG); senão, inteira. |
| **Preço** | não | Maior que zero. Vazio, vale o preço calculado (§3.1). |
| **De compra** | — | Booleano, padrão `false`. **No máximo uma** embalagem de compra por produto. |
| **Códigos de barras** | não | Lista de até **5** códigos, com a mesma validação EAN-13/EAN-8/UPC-A da Fase B e o aviso de formato de etiqueta da Fase B2. |

### 2.2 Regras gerais
- **Até 10 embalagens** por produto.
- **Sem repetição:** duas embalagens do mesmo produto não podem ter a mesma unidade **e** a mesma quantidade. CX c/ 12 e CX c/ 24 podem coexistir.
- **Rótulo:** `{sigla} c/ {quantidade} {sigla da unidade de venda}`, com a quantidade sem zeros à direita. Exemplos: "CX c/ 3 UN", "SC c/ 25 KG".
  - O rótulo é derivado, não tem coluna.
  - É usado na tela, no histórico, no movimento de estoque e no PDV.
- **Ordem:** a da lista enviada, guardada em `ordem`.
- **Embalagem principal**, usada para mostrar o estoque convertido (§5.1): a de compra, se houver; senão, a primeira da lista.
- **Unicidade dos códigos de barras:** um código pertence a **um único** produto **ou** embalagem da empresa.
  - O código da unidade não pode estar numa embalagem, nem o contrário.
  - Duas embalagens não podem ter o mesmo código.
- **Remoção:** tirar a embalagem da lista remove a embalagem e os seus códigos de barras.
  - Ainda não há venda; a regra para embalagem já vendida fica para o PDV (§8).
- **Mudança da unidade de venda:**
  - uma embalagem com a mesma unidade da nova unidade de venda dá 400;
  - a regra de casas decimais (§2.1) é conferida de novo.
- **Quem altera:** como o resto do cadastro do produto (ADMIN). O OPERADOR só lê.

### 2.3 Mensagens

| Situação | Mensagem |
|---|---|
| Unidade igual à de venda | "A embalagem precisa de uma unidade diferente da unidade de venda ({sigla})." |
| Quantidade ≤ 1 | "A embalagem precisa conter mais de 1 {sigla da unidade de venda}." |
| Quantidade decimal em unidade não fracionada | "{sigla da unidade de venda} não aceita quantidade fracionada. Informe um número inteiro." |
| Embalagem repetida | "Já existe a embalagem {rótulo} neste produto." |
| Mais de uma de compra | "Só uma embalagem pode ser a de compra." |
| Mais de 10 embalagens | "Informe no máximo 10 embalagens." |
| Mais de 5 códigos na embalagem | "Informe no máximo 5 códigos de barras por embalagem." |
| Código já usado na unidade de outro produto | "O código de barras {código} já está cadastrado no produto "{nome}"." (a mensagem atual, mantida) |
| Código já usado numa embalagem | "Este código já está em uso na embalagem {rótulo} do produto {nome}." |
| Preço abaixo do mínimo | "O preço da embalagem dá {R$ x} por {sigla}, abaixo do preço mínimo ({R$ mínimo})." |

## 3. Preço, margem e histórico

### 3.1 Preço efetivo
- **Com preço próprio:** vale o preço próprio.
  - A promoção da unidade **não** altera esse preço.
  - Promoção própria da embalagem fica fora desta fase.
- **Sem preço próprio:** vale **quantidade × preço vigente da unidade**, arredondado a centavos (meio para cima).
  - O preço vigente é o promocional quando a promoção da unidade vale hoje (fuso `America/Sao_Paulo`, como na Fase C); senão, o preço de venda.
  - Exemplo: CX c/ 3 UN sem preço, unidade a R$ 89,90 → R$ 269,70; com a unidade em promoção a R$ 79,90 → R$ 239,70.
- **O atacado não entra no preço da embalagem.** No PDV, quem decide o atacado é a quantidade total da venda (spec do PDV).
- **Origem do preço** (na resposta): `PROPRIO`, `UNIDADE` ou `PROMOCAO_DA_UNIDADE`.

### 3.2 Margem e markup
- Calculados sobre o **custo da embalagem**, que é **quantidade × custo da unidade**, com as fórmulas da Fase B2 (§5 de [produtos-codigo-e-balanca.md](produtos-codigo-e-balanca.md)).
- Exemplo: Nexgard com custo de R$ 50,00. A CX c/ 3 UN a R$ 209,90 tem custo de R$ 150,00, margem de 28,54% e markup de 39,93%.
- Sem custo, aparece "—".
- **Aviso** (não bloqueia), como o da unidade: "Preço abaixo do custo da embalagem ({R$ custo})."

### 3.3 Preço mínimo
- O preço próprio dividido pela quantidade **não pode** ficar abaixo do **preço mínimo** da unidade (400 com a mensagem de §2.3).
- Exemplo: com o mínimo de R$ 70,00, a CX c/ 3 UN não pode custar menos de R$ 210,00.
- O preço calculado (sem preço próprio) não é conferido: já parte do preço da unidade, que respeita o mínimo.

### 3.4 Histórico de preços
- O histórico de preços (Fase C) ganha o campo `PRECO_EMBALAGEM`, com o **rótulo da embalagem** no momento da alteração.
- **O que gera linha** (só o preço próprio):
  - embalagem criada com preço: vazio → R$ 209,90;
  - preço alterado;
  - preço apagado, que volta ao calculado: R$ 209,90 → vazio;
  - embalagem com preço removida: R$ 209,90 → vazio.
- **Exibição** na seção Histórico: "Preço da embalagem CX c/ 3 UN: R$ 209,90 → R$ 199,90", com data e usuário, como as demais linhas.
- Mudar a quantidade ou a unidade da embalagem **não** gera linha. O rótulo novo aparece nas linhas seguintes.

## 4. Banco — migration `V12__produtos_embalagens.sql`
Aditiva sobre a V11, que não é editada.

- **Tabela nova `produto_embalagens`:**
  - **Colunas:**
    - `id BIGINT` identity PK e `uuid UUID NOT NULL UNIQUE` (gerado na aplicação, DEC-019);
    - `empresa_id BIGINT NOT NULL`, `produto_id BIGINT NOT NULL` e `unidade_id BIGINT NOT NULL`;
    - `quantidade NUMERIC(12,3) NOT NULL` com CHECK `> 1`;
    - `preco NUMERIC(12,2) NULL` com CHECK `> 0`;
    - `de_compra BOOLEAN NOT NULL DEFAULT false`;
    - `ordem SMALLINT NOT NULL` com CHECK `>= 0`;
    - `criado_em` e `atualizado_em TIMESTAMP NOT NULL DEFAULT now()`.
  - **Chaves estrangeiras:**
    - `(empresa_id, produto_id) → produtos (empresa_id, id) ON DELETE CASCADE`;
    - `(empresa_id, unidade_id) → unidades_medida (empresa_id, id)` (RESTRICT).
  - **Unicidades:**
    - `UNIQUE (produto_id, unidade_id, quantidade)` `DEFERRABLE INITIALLY DEFERRED`, para duas embalagens poderem trocar unidade e quantidade no mesmo salvamento (a aplicação recusa a repetição antes);
    - índice único parcial `(produto_id) WHERE de_compra`;
    - `UNIQUE (empresa_id, produto_id, id)`, alvo da FK dos códigos.
  - **Índice:** `(unidade_id)`, para a regra "unidade em uso" do cadastro de unidades.
- **`produto_codigos_barras`:**
  - nova coluna `embalagem_id BIGINT NULL`;
  - FK `(empresa_id, produto_id, embalagem_id) → produto_embalagens (empresa_id, produto_id, id) ON DELETE CASCADE`. Com `MATCH SIMPLE`, um código com `embalagem_id` nulo é da unidade. A FK garante que a embalagem é do mesmo produto;
  - índice `(embalagem_id)`;
  - a unicidade `uq_codigo_barras_empresa (empresa_id, codigo)` continua e passa a valer entre unidade e embalagens;
  - **ordem:** a da unidade fica como está; a de cada embalagem começa em 0.
- **Migração da unidade de compra:**
  - **Casos que não podem ser convertidos:** a migration **para com erro** (`RAISE EXCEPTION` com a quantidade de produtos) se algum produto tem unidade de compra **diferente** da de venda e:
    - `fator_conversao <= 1`; ou
    - fator com casas decimais e unidade de venda não fracionada (regra de §2.1).

    O dado não é descartado em silêncio. No dev não há produto com unidade de compra.
  - **Produtos com unidade de compra diferente da de venda e fator > 1:** viram uma embalagem com:
    - `quantidade = fator_conversao` (de NUMERIC(12,4) para NUMERIC(12,3), sem perda, pois a regra exige até 3 casas; se houver a 4ª casa, também para com erro);
    - `de_compra = true`, `preco = NULL` e `ordem = 0`;
    - `uuid` gerado.
  - **Produtos com unidade de compra igual à de venda** e fator 1: não geram embalagem, porque a informação é vazia. Com fator diferente de 1, a migration também para com erro.
  - **Depois:** saem `unidade_compra_id`, `fator_conversao`, as constraints `fk_produto_unidade_compra`, `ck_produto_fator_positivo` e `ck_produto_compra_coerente`, e o índice `idx_produto_unidade_compra`.
- **`produto_historico_precos`:**
  - nova coluna `embalagem_rotulo VARCHAR(60) NULL`;
  - o CHECK do campo passa a aceitar `PRECO_EMBALAGEM`;
  - CHECK nova: `(campo = 'PRECO_EMBALAGEM') = (embalagem_rotulo IS NOT NULL)`.
  - Sem FK para a embalagem, porque a linha precisa sobreviver à remoção dela.
- **`movimentos_estoque`** (retrato da embalagem no ajuste, §6):
  - novas colunas `embalagem_rotulo VARCHAR(60)`, `embalagem_quantidade NUMERIC(12,3)` (unidades por embalagem) e `quantidade_embalagens INTEGER`, todas `NULL`;
  - CHECK: as três nulas ou as três preenchidas, com `embalagem_quantidade > 1` e `quantidade_embalagens > 0`;
  - CHECK: preenchidas só com `tipo IN ('ENTRADA','SAIDA')`;
  - CHECK: preenchidas, `abs(quantidade) = quantidade_embalagens * embalagem_quantidade`.
  - Sem FK para a embalagem: o movimento é imutável e guarda o retrato.
- **Cadastro de unidades:** a regra "a unidade não pode ser excluída se estiver em uso" e a contagem de produtos que usam a unidade (`UnidadeMedidaRepository`) passam a olhar as embalagens, no lugar de `produtos.unidade_compra_id`. Cada produto continua contado uma vez.

## 5. Tela do produto

### 5.1 Seção "Embalagens"
- **Atalhos:** Geral · Códigos · Preços · **Embalagens** · Estoque · Histórico. A seção nova fica entre Preços e Estoque, com a contagem de erros no atalho, como as demais.
- **Texto de ajuda:** "Outras formas de vender ou comprar este produto, como a caixa com 3. O estoque continua em {sigla}."
- **Estado vazio:** o texto de ajuda e o botão "Adicionar embalagem".
- **Cada embalagem** é um bloco com:
  - **Unidade:** seletor com as unidades ativas, sem a unidade de venda;
  - **"com [quantidade] {sigla de venda}";**
  - **Preço (opcional):** o campo de dinheiro da Fase C. Vazio, mostra a dica "3 × R$ 89,90 = R$ 269,70" (ou "3 × R$ 79,90 (promoção) = R$ 239,70");
  - **margem e markup** do preço efetivo e o aviso de preço abaixo do custo;
  - **códigos de barras:** o mesmo componente de lista da seção Códigos, com Enter para o leitor, limitado a 5;
  - **"Embalagem de compra":** um switch, e ligar numa embalagem desliga na outra;
  - **remover:** um botão de ícone com rótulo acessível "Remover embalagem {rótulo}".
- **"Adicionar embalagem"** depois da lista, até 10.
- **No cadastro novo:** a seção também aparece; as embalagens são gravadas junto com o produto.
- **Erros:** os erros de cada embalagem (do Zod e da API) aparecem no campo certo da embalagem certa.

### 5.2 Outras seções
- **Códigos:** com pelo menos uma embalagem, aparece a linha "Os códigos de barras das embalagens ficam em Embalagens." com link para a seção.
- **Estoque:**
  - o bloco "Unidade e embalagem" **sai**;
  - com embalagem, o saldo mostra a conversão pela embalagem principal (§2.2): "55 UN (18 CX + 1 UN)" e "54 UN (18 CX)". Sem embalagem, nada muda;
  - na unidade fracionada, a conversão usa a parte inteira de embalagens e o resto com até 3 casas.
- **Histórico:** mostra as linhas de `PRECO_EMBALAGEM` e os movimentos com retrato de embalagem: "+36 UN (2 CX c/ 18 UN)".
- **Lista de produtos:** sem mudança visual. A busca por código de barras também acha o produto pelo código de uma embalagem, porque a busca da Fase E já procura em `produto_codigos_barras`; isso precisa de teste.

## 6. Ajustar estoque por embalagem
- **Onde:** no modal "Ajustar estoque", em **Entrada** e **Saída**, quando o produto tem embalagem.
  - Ao lado da quantidade, há um seletor "Em: {sigla de venda} / CX c/ 18 UN / …"; o padrão é a unidade de venda.
  - Na **Entrada** com motivo Compra, o padrão é a embalagem de compra, se houver.
- **Quantidade em embalagem:** inteira e > 0; senão, 400 "Informe um número inteiro de embalagens.".
- **Prévia:** "2 CX c/ 18 UN = +36 UN · saldo 10 → 46".
- **Gravação:**
  - o movimento continua em unidades (`quantidade = ±2 × 18`);
  - o retrato vai em `embalagem_rotulo`, `embalagem_quantidade` e `quantidade_embalagens`;
  - a regra de saldo negativo da Fase D vale sobre o total em unidades.
- **Contagem e "Zerar estoque":** continuam só em unidades.
- **API:** `POST /api/produtos/{id}/estoque/ajustes` ganha `embalagemId` (UUID, opcional). Com ele:
  - a `quantidade` é o **número de embalagens**;
  - com o tipo AJUSTE, dá 400 "A contagem é feita na unidade de venda.";
  - com uma embalagem de outro produto ou inexistente, dá 404 "Embalagem não encontrada.".
  - A resposta do movimento ganha `embalagem: {rotulo, quantidadePorEmbalagem, quantidadeDeEmbalagens} | null`.

## 7. API do produto
- **Request:**
  - **Ganha:** `embalagens: [{ id?, unidadeId, quantidade, preco?, deCompra, codigosBarras: [] }]`.
    - É a lista completa, com o mesmo comportamento da lista de códigos de barras: no PATCH, a lista informada substitui a atual e a lista ausente mantém a atual.
    - `id` (UUID) identifica a embalagem que continua. Embalagem sem `id` é nova, e embalagem ausente da lista é removida.
    - Um `id` de outro produto dá 404 "Embalagem não encontrada.".
  - **Perde:** `unidadeCompraId` e `fatorConversao`.
- **Response:**
  - **Ganha:** `embalagens: [{ id, unidade: {id, sigla, descricao, fracionada}, quantidade, rotulo, preco, precoEfetivo, origemPreco, custo, margem, markup, deCompra, codigosBarras: [{codigo, formato}] }]`, na ordem.
  - **Perde:** `unidadeCompra`, `fatorConversao` e `conversaoTexto`.
  - **Códigos da unidade:** `codigosBarras` do produto continua só com os códigos da unidade.
- **Conflitos:**
  - **409 de código de barras:** traz o campo do código (`codigosBarras[i]` ou `embalagens[j].codigosBarras[i]`) e a mensagem de §2.3.
  - **Corrida:** dois cadastros simultâneos com o mesmo código também dão 409, pelo nome da constraint, como na B2.
- **Validações:** as de §2 e §3.3, com o campo indexado (`embalagens[1].quantidade`).
- **Histórico de preços:** `GET /api/produtos/{id}/historico-precos` traz `embalagemRotulo` nas linhas de `PRECO_EMBALAGEM`.

## 8. Fora desta fase (registrado)
- **Para o PDV (etapa 11):**
  - o código de barras de uma embalagem lança a embalagem, com o seu preço efetivo e a baixa de `quantidade × N` unidades;
  - o código do produto (`542*1`) lança a unidade, e o PDV oferece escolher a embalagem quando o produto tiver embalagens;
  - linhas de embalagens diferentes do mesmo produto na mesma venda. Exemplo do Nexgard com 4 unidades: 1 CX c/ 3 UN a R$ 209,90 + 1 UN a R$ 89,90 = R$ 299,80, com baixa de 4 UN;
  - o item da venda guarda o retrato da embalagem (rótulo, quantidade e preço), e a regra para remover embalagem já vendida (inativar em vez de apagar) é decidida lá;
  - a sugestão "Montar 1 CX + 1 UN?" ao digitar unidades soltas.
- **Promoção e atacado próprios da embalagem.**
- **Embalagem vendida na balança.**
- **Embalagem inativa.**
- **Compras:** a entrada de mercadoria pela nota usa a embalagem de compra; o produto novo vindo em caixa monta as embalagens na importação.

## 9. Testes (critérios de aceite)
- **Backend:**
  - **V12 (IT):**
    - unidade de compra com fator > 1 vira embalagem de compra;
    - fator 1 com a mesma unidade não gera embalagem;
    - fator ≤ 1 com unidade diferente faz a migration falhar;
    - as colunas antigas saem;
    - as CHECKs e a FK de código de barras para embalagem de outro produto;
    - a unicidade de código entre unidade e embalagem;
    - as CHECKs do retrato no movimento.
  - **Embalagens no produto:**
    - criar com embalagens e códigos;
    - editar mantendo o `id`, que preserva os códigos;
    - remover, e os códigos saem junto;
    - PATCH sem a lista mantém as embalagens;
    - cada regra e mensagem de §2.3, incluindo a quantidade decimal em unidade não fracionada e a troca da unidade de venda;
    - limite de 10 embalagens e de 5 códigos;
    - `id` de outro produto → 404;
    - isolamento por empresa.
  - **Preço:**
    - preço próprio;
    - calculado sem promoção (3 × 89,90 = 269,70);
    - calculado com a promoção vigente;
    - promoção vencida volta ao normal;
    - preço próprio ignora a promoção;
    - mínimo por unidade → 400;
    - margem e markup do exemplo do Nexgard (28,54% e 39,93%).
  - **Histórico:** as linhas de `PRECO_EMBALAGEM` em criar com preço, alterar, apagar e remover a embalagem com preço; e nenhuma linha sem mudança.
  - **Conflitos:** código da unidade de outro produto e código de embalagem de outro produto → 409 com a mensagem certa; corrida → 409.
  - **Ajuste:**
    - entrada de 2 CX c/ 18 UN → +36 UN, com o retrato;
    - saída em embalagem respeitando o saldo;
    - AJUSTE com embalagem → 400;
    - embalagem de outro produto → 404.
  - **Busca:** o código de barras de uma embalagem acha o produto na listagem.
  - **Unidades:** uma unidade usada em embalagem não pode ser excluída.
- **Frontend:**
  - **Seção Embalagens:**
    - o atalho e a ordem das seções;
    - o estado vazio;
    - adicionar e remover;
    - a dica do preço calculado (normal e com promoção);
    - margem e markup;
    - os códigos de barras com Enter;
    - "Embalagem de compra" exclusiva;
    - o seletor sem a unidade de venda;
    - os limites;
    - os erros por embalagem (Zod e API) com a contagem no atalho.
  - **Estoque:** o bloco "Unidade e embalagem" saiu; a conversão do saldo ("55 UN (18 CX + 1 UN)").
  - **Ajustar estoque:**
    - o seletor em Entrada e Saída;
    - o padrão de compra na Entrada com motivo Compra;
    - a prévia;
    - a ausência do seletor em Contagem;
    - o envio de `embalagemId`.
  - **Histórico:** as linhas de preço da embalagem e o movimento com retrato.
  - **Códigos:** a linha que aponta para Embalagens.
  - **OPERADOR:** a seção só leitura.

## 10. Ajustes na implementação
- **Banco:**
  - o rótulo do histórico e do movimento é `VARCHAR(60)`, porque cabe até 58 caracteres;
  - a unicidade unidade × quantidade é `DEFERRABLE` e, depois do `flush`, é conferida na hora com `SET CONSTRAINTS … IMMEDIATE`; a violação dá 409, nunca 500;
  - o rótulo não pode ser vazio (CHECK);
  - a V12 valida os dados antes de transformar, e a mensagem de erro traz até 10 `(empresa_id, numero)`.
- **Salvamento:**
  - remoções e inclusões vão ao banco em duas fases, para um código ou uma embalagem trocarem de lugar no mesmo salvamento;
  - o `atualizadoEm` do produto só muda com alteração real nas embalagens.
- **PATCH sem `embalagens`:** as embalagens atuais são conferidas de novo contra a unidade de venda e o preço mínimo do request. Subir o mínimo pode dar 400 em `embalagens[j].preco`.
- **Histórico:** a linha de preço usa o rótulo da embalagem **depois** do salvamento.
- **Ajuste por embalagem:**
  - a chave repetida com outra embalagem (que ainda existe) dá 409 "Esta operação já foi registrada com outros dados.";
  - "Ajustar estoque" fica bloqueado com mudanças não salvas na lista, na unidade ou na quantidade das embalagens: "Salve as mudanças de controle, unidade ou embalagens antes de ajustar o estoque.";
  - depois de um 404 com o modal aberto, o seletor volta à unidade de venda e a quantidade é limpa: "A embalagem escolhida foi removida. Confira a quantidade e tente de novo.";
  - o botão mostra o total: "Registrar entrada de 36 UN";
  - a prévia fica logo abaixo da quantidade: "2 CX c/ 18 UN = +36 UN · Saldo: 10 UN → 46 UN".
- **Unidade:** desligar `fracionada` com embalagem de quantidade fracionada dá 400 (ver [categorias-e-unidades.md](categorias-e-unidades.md)).
- **Textos da tela** (revisão de UX):
  - **ajuda da seção:** "Outras formas de vender ou comprar este produto, como a caixa com 3, cada uma com seu código de barras e preço. O estoque continua em {sigla}.";
  - **campo da quantidade:** rótulo "Contém";
  - **chave de compra:** ajuda "Como o produto chega do fornecedor. Já vem escolhida ao registrar entrada por compra. Só uma por produto." e selo "De compra" no título;
  - **preço vazio:** "Vazio, vende por 3 × R$ 89,90 = R$ 269,70." (ou com "(promoção)"), com o preço calculado como placeholder;
  - **preço próprio:** "Sai a R$ 69,97 por UN (avulso: R$ 269,70).";
  - **saldo:** "55 UN" em destaque e "(18 CX + 1 UN)" menor.
- **Mensagens novas:**
  - "Informe a embalagem."
  - "Informe a unidade da embalagem."
  - "Informe a quantidade da embalagem."
  - "O preço da embalagem deve ser maior que zero."
  - "Limite de 5 códigos de barras atingido."
  - "Limite de 10 embalagens atingido."
  - "Nenhuma embalagem cadastrada." (OPERADOR)
  - "Este código já está na unidade (UN) deste produto."
  - "Este código já está na embalagem CX c/ 3 UN."
- **Conferido no navegador** (2026-10-24):
  - a seção e o scroll-spy;
  - a dica do preço e a margem;
  - os códigos da caixa e o aviso na seção Códigos;
  - o modal com a caixa de compra como padrão, a prévia e o botão com o total;
  - o saldo "36 UN (2 CX)";
  - o Histórico "+36 UN (2 CX c/ 18 UN)" e as linhas de preço da embalagem;
  - o celular sem rolagem lateral.
