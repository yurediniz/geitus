# Produtos: Embalagens de venda (Fase B3 da evolução de Produtos)

> **Status:** proposta aprovada em conversa em 2026-10-23, ainda sem spec detalhada nem plano. Vem depois da Fase B2 ([produtos-codigo-e-balanca.md](produtos-codigo-e-balanca.md)) e antes da Fase F (imagem). Decisão a registrar em DEC própria quando a spec fechar.

## 1. Motivação
- **Caso real (pet shop):** a caixa de sachês chega com 18 UN na nota (1 CX) e é vendida só por unidade. Isso já é coberto hoje pela unidade de compra (CX) com fator 18.
- **Caso que falta:** vender **as duas formas**, a caixa fechada e a unidade, cada uma com o seu código de barras e o seu preço.
  - Exemplo: **Nexgard Combo**, caixa com 3 unidades a **R$ 209,90**, e a unidade avulsa a **R$ 89,90**.
- **Proposta do usuário:** dois produtos vinculados com estoques que se descontam um no outro.
- **Decisão (2026-10-23):** **um produto só, com estoque único em unidades, e uma lista de embalagens de venda.** Dois produtos sincronizados gerariam estoque fracionado (5 sachês = 0,28 CX), dois saldos para acertar e relatórios divididos.

## 2. Modelo
- **Estoque:** um só, sempre na **unidade de venda principal** (UN).
- **Embalagens de venda:** lista no produto, cada uma com:

| Campo | Regra |
|---|---|
| Unidade/embalagem | sigla (CX, FD, PCT…) |
| Quantidade | quantas unidades principais ela contém (> 1) |
| Código de barras | opcional; entra na mesma regra de unicidade da lista de códigos de barras (um código pertence a um único produto ou embalagem da empresa) |
| Preço | **opcional**. Preenchido, vale esse preço (Nexgard: CX c/ 3 = R$ 209,90). Vazio, vale quantidade × preço da unidade |

- **Unidade de compra:** a atual (unidade de compra + fator, no bloco "Unidade e embalagem" da seção Estoque) passa a ser **uma das embalagens**, marcada como "de compra". Assim a nota "1 CX" vira +N UN.
- **Estoque exibido** em unidades e na embalagem principal: "54 UN (3 CX)".
- **Margem da embalagem:** calculada sobre quantidade × custo da unidade. Para o Nexgard com custo unitário de R$ 50,00: R$ 209,90 contra R$ 150,00 dá margem de 28,54%.

## 3. Venda (para a spec do PDV)
- **Linhas diferentes no carrinho:** o carrinho aceita linhas de **embalagens diferentes do mesmo produto**, cada uma com o seu preço, na mesma venda.
- **Exemplo do Nexgard, 4 unidades:** 1 linha "CX c/ 3" a R$ 209,90 (baixa 3 UN) e 1 linha "UN" a R$ 89,90 (baixa 1 UN), total de **R$ 299,80** e baixa de **4 UN**, numa só venda e num só pagamento.
- **Leitura:** o código da caixa identifica a embalagem CX, e o da unidade identifica a UN.
- **Preço de atacado não é o mecanismo para isso:** ele baratearia cada unidade. Para dar R$ 209,90 em 3, cada unidade sairia por R$ 69,97, e 4 unidades virariam R$ 279,88. O atacado continua para "a partir de N unidades, cada uma por X".
- **Ideia futura:** ao digitar `código*4` de unidades soltas, o PDV sugere "Montar 1 CX + 1 UN?". A decidir na spec do PDV se é automático ou só um aviso.

## 4. Entrada de mercadoria (para a spec de Compras)
- **Produto novo vindo em caixa:** ao importar a nota, a tela pergunta como ele será vendido, se só a unidade ou a unidade e a caixa, e monta as embalagens.

## 5. Pontos a fechar na spec
- **Embalagem com promoção ou atacado próprios:** provavelmente não nesta fase.
- **Embalagem inativa:** se uma embalagem pode ser desativada sem apagar o código.
- **Exibição na listagem:** como a embalagem aparece na lista de produtos.
