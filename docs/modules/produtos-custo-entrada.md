# Produtos: Custo na entrada por compra (Fase B4)

> **Status:** **implementada** em 2026-10-24 (migration V13; ajustes no §10). Desenho aprovado em conversa no mesmo dia. Fase intermediária da DEC-030, depois da Fase B3 ([produtos-embalagens.md](produtos-embalagens.md)) e antes da Fase B5 ([fornecedores-e-marcas.md](fornecedores-e-marcas.md)). Decisões na **DEC-038**.

## 1. Motivação
- **O problema:** hoje a entrada de estoque por compra grava só a quantidade. O custo do produto é digitado à parte e fica desatualizado.
- **Pedido do usuário:**
  - a entrada por compra **exige o custo**;
  - o custo do produto passa a ser **o último preço de entrada**;
  - a tela diz de onde veio o custo e avisa quando ele foi **editado** depois;
  - o histórico mostra a origem.

## 2. Entrada por compra com custo

### 2.1 Regra
- **Quando o custo é exigido:** só no ajuste manual **ENTRADA** com motivo **COMPRA** (Compra/recebimento). Os demais motivos de entrada, Saída, Contagem, "Zerar estoque" e o estoque inicial do cadastro ficam como estão.
- **O que se digita:** o custo é **obrigatório e maior que zero**.
  - Em **unidade de venda**, é o custo de 1 unidade.
  - Em **embalagem** (Fase B3), é o custo de **1 embalagem**, como vem na nota.
- **Custo por unidade:** em embalagem, é `custo informado ÷ quantidade da embalagem`, guardado com 4 casas no movimento. Exemplo: 2 CX c/ 18 UN a R$ 180,00 a caixa → R$ 10,0000 por UN.
- **Limites:** até 10 dígitos inteiros e 2 casas, como os preços.

### 2.2 Efeito no produto
- **Custo do produto:** recebe o custo por unidade **arredondado a centavos** (meio para cima). Exemplo: CX c/ 3 a R$ 100,00 → R$ 33,3333 no movimento → **R$ 33,33** no produto.
- **Mesma transação:** o movimento, o saldo e o custo são gravados juntos. A falha de um desfaz tudo.
- **Origem do custo:** o produto guarda a origem do custo atual e quando ela foi registrada (§4), como `ENTRADA_COMPRA`, mesmo que o valor não tenha mudado.
- **Histórico:** se o valor mudou, grava uma linha de custo com a origem "Entrada de compra" (§3). Se não mudou, nenhuma linha é criada, mas a data do último custo de entrada é atualizada.
- **Produto sem controle de estoque:** continua sem ajuste (regra da Fase D), então a regra não se aplica.

### 2.3 Mensagens

| Situação | Mensagem | Campo |
|---|---|---|
| Compra sem custo | "Informe o custo da compra." | `custo` |
| Custo zero ou negativo | "O custo deve ser maior que zero." | `custo` |
| Custo em outro tipo ou motivo | "O custo só é informado na entrada por compra." | `custo` |

## 3. Histórico de preços
- **Origem nas linhas de custo:** `produto_historico_precos` ganha `origem` em linhas de `CUSTO`, com dois valores:
  - `EDICAO`: o custo mudou pelo cadastro do produto;
  - `ENTRADA_COMPRA`: o custo mudou por uma entrada por compra.
- **Linhas antigas de custo:** recebem `EDICAO`, porque só o cadastro alterava o custo até aqui.
- **Outros campos** (`PRECO_VENDA`, `PRECO_EMBALAGEM`): ficam com `origem` nula.
- **Exibição** (seção Histórico, "Alterações de preço e custo"):
  - "Custo: R$ 9,50 → R$ 10,00 · Entrada de compra (2 CX c/ 18 UN)";
  - "Custo: R$ 10,00 → R$ 10,50 · Editado".
  - O detalhe da entrada (quantidade e embalagem) vem do movimento ligado à linha (§5).

## 4. Origem do custo no produto
- **Colunas novas em `produtos`:** `custo_origem` (`ENTRADA_COMPRA`, `EDICAO` ou nulo) e `custo_origem_em` (data e hora).
- **Quando cada uma é preenchida:**
  - **entrada por compra:** `ENTRADA_COMPRA` com a data do movimento, mesmo sem mudar o valor;
  - **cadastro ou edição do produto que muda o custo:** `EDICAO` com a data da alteração;
  - **custo apagado:** `custo_origem` e `custo_origem_em` ficam nulos;
  - **edição que não mexe no custo:** nada muda.
- **Produtos existentes:** ficam com origem nula, porque a origem é desconhecida, e não mostram nota.
- **Na tela** (seção Preços, abaixo do campo Custo):
  - origem `ENTRADA_COMPRA`: "Último custo de entrada: R$ 10,00 por UN, em 24/10/2026 (compra de 2 CX c/ 18 UN).", com a embalagem só quando a entrada foi em embalagem (sem ela: "… por UN, em 24/10/2026.");
  - origem `EDICAO`: "Custo editado manualmente em 24/10/2026.";
  - origem nula: nenhuma nota.
- **Response do produto:** ganha `custoOrigem: { tipo, em, quantidade, quantidadeDeEmbalagens, embalagemRotulo } | null`. Na listagem, só `tipo` e `em`, sem consulta a mais.
  - `quantidade` (em unidades) e `embalagemRotulo` vêm só na entrada por compra, do último movimento de compra.
  - `embalagemRotulo` é nulo quando a entrada foi em unidades.

## 5. Banco — migration `V13__custo_entrada.sql`
Aditiva sobre a V12, que não é editada.
- **`movimentos_estoque`:**
  - `custo_informado NUMERIC(12,2) NULL`: o valor digitado, por unidade ou por embalagem;
  - `custo_unitario NUMERIC(14,4) NULL`: o custo por unidade de venda;
  - CHECK: os dois nulos ou os dois preenchidos e `> 0`;
  - CHECK: preenchidos **só** com `tipo = 'ENTRADA' AND motivo = 'COMPRA' AND origem = 'AJUSTE_MANUAL'`.
    - A obrigação inversa (compra nova exige custo) é uma CHECK `NOT VALID` (`ck_movimento_estoque_compra_exige_custo`): vale para todo INSERT e UPDATE, sem conferir as compras antigas, que não têm custo. Não se roda `VALIDATE CONSTRAINT` nela.
  - CHECK: com retrato de embalagem, `custo_unitario = round(custo_informado / embalagem_quantidade, 4)`; sem retrato, `custo_unitario = custo_informado`.
- **`produtos`:**
  - `custo_origem VARCHAR(20) NULL` com CHECK `IN ('ENTRADA_COMPRA','EDICAO')`;
  - `custo_origem_em TIMESTAMP NULL`;
  - CHECK: os dois nulos ou os dois preenchidos;
  - CHECK: `custo IS NOT NULL OR custo_origem IS NULL`.
- **`produto_historico_precos`:**
  - `origem VARCHAR(20) NULL` com CHECK `IN ('EDICAO','ENTRADA_COMPRA')`;
  - CHECK: `(campo = 'CUSTO') = (origem IS NOT NULL)`, aplicada depois de preencher as linhas antigas;
  - `movimento_id BIGINT NULL`, com FK composta `(empresa_id, produto_id, movimento_id) → movimentos_estoque (empresa_id, produto_id, id)` (RESTRICT, porque o movimento é imutável), que garante que o movimento é do mesmo produto. Ligação preenchida se e somente se `origem = ENTRADA_COMPRA`, e essa linha sempre tem `valor_novo`.
  - A V13 cria `UNIQUE (empresa_id, produto_id, id)` em `movimentos_estoque`, alvo da FK.
- **Preenchimento das linhas existentes:** `origem = 'EDICAO'` nas linhas de `CUSTO`.

## 6. API
- **`POST /api/produtos/{id}/estoque/ajustes`:**
  - ganha `custo` (decimal, opcional no schema), obrigatório pela regra de §2.1;
  - com `embalagemId`, é o custo de 1 embalagem;
  - a resposta do movimento ganha `custoInformado` e `custoUnitario`.
- **Idempotência:** a chave repetida com outro `custo` dá 409 "Esta operação já foi registrada com outros dados.". Com o mesmo custo, devolve o movimento gravado.
- **`GET /api/produtos/{id}`:** ganha `custoOrigem` (§4).
- **`GET /api/produtos/{id}/historico-precos`:** as linhas ganham `origem` e, em `ENTRADA_COMPRA`, `entrada: { quantidade, quantidadeDeEmbalagens, embalagemRotulo }`.
- **`GET /api/produtos/{id}/estoque/movimentos`:** os movimentos de compra trazem `custoInformado` e `custoUnitario`.
- **Perfil:** o ajuste continua só ADMIN.

## 7. Tela

### 7.1 Modal "Ajustar estoque"
- **Campo "Custo":** aparece só em **Entrada** com motivo **Compra/recebimento**, logo abaixo da linha Quantidade/Em.
  - É o campo de dinheiro da Fase C (preenche da direita para a esquerda), obrigatório.
  - **Rótulo:** "Custo por UN" na unidade de venda, ou "Custo de 1 CX c/ 18 UN" em embalagem.
  - **Começa vazio**, com a dica "Último custo: R$ 9,50 por UN." (em embalagem: "Último custo: R$ 9,50 por UN (R$ 171,00 a CX c/ 18 UN)."). Sem custo no produto, a dica não aparece.
  - **Em embalagem**, mostra "= R$ 10,00 por UN" ao digitar (o custo por unidade arredondado a centavos, como no produto).
- **Prévia:** inclui o custo, por exemplo "2 CX c/ 18 UN = +36 UN · Saldo: 10 UN → 46 UN · Custo: R$ 9,50 → R$ 10,00 por UN". Com o custo igual ao atual, mostra "Custo: R$ 10,00 por UN (sem mudança)".
- **Trocar de motivo, de tipo ou de "Em":** o valor digitado é descartado (em motivo e tipo, o campo também some). A embalagem removida com o modal aberto também limpa o custo.
- **Aviso de sucesso:** "Entrada de 36 UN (2 CX c/ 18 UN) registrada. Saldo: 46 UN. Custo atualizado para R$ 10,00."

### 7.2 Tela do produto
- **Seção Preços:** a nota de origem do custo (§4) fica abaixo do campo Custo.
- **Ao salvar o produto com o custo alterado à mão:** a nota passa a "Custo editado manualmente em …", que vem do backend depois de salvar.
- **Seção Histórico:**
  - as linhas de custo mostram a origem;
  - o movimento de compra mostra o custo: "+36 UN (2 CX c/ 18 UN) · R$ 180,00 por CX (R$ 10,00 por UN)".

## 8. Fora desta fase
- **Fornecedor na entrada por compra:** Fase B5.
- **Custo médio ponderado.** O custo é o último de entrada, por decisão do usuário.
- **Nota fiscal de compra (Compras), frete e impostos no custo.**
- **Histórico de custo por embalagem.**

## 9. Testes (critérios de aceite)
- **Backend:**
  - **V13 (IT):**
    - as linhas antigas de custo recebem `EDICAO`;
    - as CHECKs de custo no movimento (custo em saída ou em outro motivo barrado, custo só num dos dois campos barrado, coerência com o retrato; compra antiga sem custo continua válida);
    - as CHECKs de origem no produto e no histórico;
    - a FK do histórico para o movimento.
  - **Ajuste:**
    - entrada por compra em UN com custo 10,00 → custo do produto 10,00, origem `ENTRADA_COMPRA`, linha de histórico com o movimento;
    - em 2 CX c/ 18 UN a 180,00 → custo unitário 10,0000;
    - CX c/ 3 a 100,00 → 33,3333 no movimento e 33,33 no produto;
    - compra sem custo → 400;
    - custo 0 → 400;
    - custo em Saída ou em Contagem, ou em Entrada com outro motivo → 400;
    - custo igual ao atual → nenhuma linha de histórico, mas a data da origem é atualizada;
    - chave repetida com outro custo → 409;
    - falha de saldo ou de validação → nada gravado, nem o custo.
  - **Produto:**
    - editar o custo → origem `EDICAO`, linha de histórico `EDICAO`;
    - apagar o custo → origem nula;
    - editar outro campo → origem mantida;
    - `custoOrigem` na response com a quantidade e o rótulo do último movimento de compra.
  - **Isolamento:** a origem e o movimento ligado são sempre da mesma empresa.
- **Frontend:**
  - **Modal:**
    - o campo aparece só em Entrada + Compra;
    - o rótulo em UN e em embalagem;
    - a dica do último custo;
    - "= R$ 10,00 por UN" em embalagem;
    - a prévia com o custo, e "(sem mudança)";
    - o erro "Informe o custo da compra." ao confirmar sem custo;
    - trocar de motivo descarta o custo;
    - o envio de `custo`.
  - **Preços:** as três formas da nota de origem.
  - **Histórico:** "Entrada de compra (2 CX c/ 18 UN)", "Editado" e o custo no movimento.

## 10. Ajustes na implementação
- **Data da origem:** `ENTRADA_COMPRA` usa a data e a hora do próprio movimento.
- **Custo zero:** um custo por unidade que arredonde a R$ 0,00 no produto (ex.: R$ 0,10 por CX c/ 1000) dá 400 "O custo deve ser maior que zero.".
- **Banco:** o custo da compra nova é exigido também por uma CHECK `NOT VALID`, e o histórico aponta para um movimento do mesmo produto por FK de três colunas (§5).
- **Prévia:** a linha do custo fica num parágrafo próprio, abaixo do saldo, fora da região anunciada a cada dígito.
- **Formulário do produto:** depois de uma compra feita na própria página, o campo Custo é atualizado com o custo novo, se o usuário não o tinha alterado. Se tinha, o valor fica e aparece "A entrada de compra mudou o custo para R$ 10,00. Ao salvar, vale o valor deste campo.". Com o campo diferente do gravado, Preços avisa "Ao salvar, o custo passa a contar como editado manualmente.".
