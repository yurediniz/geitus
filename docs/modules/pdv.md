# PDV

> DEC-042 (venda), DEC-044 (busca, catálogo, visual, comprovante). Migration V17. Depende de [Caixa](caixa.md), [Produtos](produtos.md) e do [Estoque](estoque.md). Pendências: DT-041.

## 1. Objetivo

Vender no balcão com rapidez (scanner, teclado, total sempre visível). O carrinho vive no navegador; o servidor recalcula tudo e grava a venda inteira, atômica e idempotente, ao finalizar. Nada fiscal.

## 2. Regras de negócio

### Lançar item
1. O campo "Código ou nome" tem sempre o foco. O texto é interpretado nesta ordem:
   - **Etiqueta de balança** (13 dígitos reconhecidos pela configuração da empresa), só de produto "vendido na balança" (outros: "Código não encontrado."). Sempre linha nova, origem `ETIQUETA`, e confere **sempre** o preço mínimo ("O valor da etiqueta deixa {nome} abaixo do preço mínimo (R$ x por {sigla}).").
     - **Valor, unidade fracionada:** quantidade = valor ÷ preço vigente sem atacado (3 casas, meio para cima).
     - **Valor, UN:** precisa ser exatamente o **preço normal** de 1 unidade ("O valor da etiqueta (R$ x) não confere com o preço de {nome} (R$ normal)."); aceita, vira 1 UN cobrada pelas regras normais, somando no atacado com as UN bipadas.
     - **Peso:** quantidade = peso; valor = quantidade × preço vigente sem atacado. Só em unidade fracionada ("Etiqueta de peso para produto que não é vendido por peso.").
   - **`código*quantidade`** ou só o código (quantidade 1): código do produto (zeros à esquerda aceitos) ou código de barras do produto → unidade; código de barras de embalagem → embalagem. Decimal (vírgula ou ponto) só em unidade fracionada; embalagem sempre inteira.
   - Texto **sem espaço** é código (Code128 e alfanuméricos); com espaço é busca. Texto sem dígitos que não é código volta como busca.
2. **Busca ao vivo:** a partir de 3 caracteres (sem `*`), após 250 ms, até 20 produtos **ativos** por nome, código ou código de barras. Enter lança o card ativo se o operador o escolheu com as setas, ou se o texto é um nome (tem espaço ou não tem dígito) e os cards do termo já chegaram (um nome teclado antes dos cards lança quando eles chegam). Fora isso, Enter lê o código — o bipe de uma embalagem nunca vira 1 unidade. Cards do termo anterior ficam esmaecidos e sem clique. Card escolhido entra na mesma fila das leituras e lança 1 unidade.
3. **Catálogo** (antes de digitar): produtos ativos, os **mais vendidos nos últimos 30 dias** (contados por venda concluída) primeiro e o resto por nome, 24 por página, com faixa "Todas" + categorias principais (inclui subcategorias). Clique lança 1 unidade.
4. **Recusas** (carrinho intacto, mensagem no campo com o código lido e bipe): "Código não encontrado."; "Produto inativo — não pode ser vendido."; "{sigla} não aceita quantidade fracionada. Informe um número inteiro."; "A quantidade deve ser maior que zero."; "Quantidade acima do permitido." (> 99.999); com "Vender sem estoque" desligada e saldo menor que o somado no carrinho: "Estoque insuficiente para {nome} (saldo {saldo} {sigla}).".
5. Bipar de novo o mesmo produto na mesma unidade ou embalagem (sem etiqueta) soma na linha. Linha de unidade com embalagens tem o seletor "UN ▾" (troca mantendo a quantidade). Máximo de 300 linhas ("A venda atingiu o limite de 300 itens.").

### Preço e desconto
6. **Unidade:** o menor entre normal, promoção vigente e atacado (empate → promoção); o atacado considera a **soma das linhas de unidade** do produto (embalagem não conta), e todas usam o mesmo preço. **Embalagem:** preço efetivo (próprio, ou quantidade × preço vigente da unidade sem atacado), origem `EMBALAGEM`. Bruto = quantidade × preço, a centavos, meio para cima. **Quantidade de estoque** de uma linha = quantidade × quantidade da embalagem, na unidade de venda (1 linha de UN = a própria quantidade); é o que a venda baixa e o que vale para o estoque insuficiente e o preço mínimo. "Hoje" = data em `America/Sao_Paulo`.
7. Desconto do item (R$ ou %) sobre o bruto da linha, sem passar dele. Desconto da venda (R$ ou %) sobre o subtotal já com os descontos dos itens, sem passar dele, repartido entre as linhas proporcionalmente, em centavos para baixo, com o resto na linha de maior valor (empate: a primeira). **Percentual arredonda para baixo** (10% de R$ 2,45 = R$ 0,24).
8. Total = bruto − descontos, sempre > 0 ("O total da venda precisa ser maior que zero.").
9. OPERADOR: descontos ÷ bruto ≤ "Desconto máximo do operador" ("O desconto passa do limite do operador (10%)."). ADMIN (perfil do **banco**) sem limite.
10. Preço mínimo, para todos: com desconto, líquido ÷ quantidade de estoque não fica abaixo do mínimo ("O desconto deixa {nome} abaixo do preço mínimo (R$ x por {sigla})."). Sem desconto não se confere (promoção, atacado e embalagem já respeitam o mínimo no cadastro), exceto na etiqueta.

### Pagamento e cliente
11. Formas `DINHEIRO`, `DEBITO`, `CREDITO`, `PIX`, uma linha por forma: na tela, repetir a forma soma o valor; a API recusa forma repetida ("Use uma linha por forma de pagamento."). Cartão e PIX juntos não passam do total ("Cartão e PIX não podem passar do total. O troco só sai do dinheiro."); o pago cobre o total ("Falta pagar R$ x."). Troco só do dinheiro. Recebido no caixa por forma = valor (dinheiro: menos o troco; zerado, não há recebimento). Grava os valores normalizados pelo cálculo.
12. Cliente opcional, entre os **ativos** (nome, CPF ou telefone); a venda guarda o cliente e o nome na data.

### Finalizar
13. Recusa mais de 300 linhas antes de travar qualquer coisa. Confere a **chave** (mesma chave e dados → 200 com a venda original, mesmo com o caixa já fechado; outros dados → 409 "Esta operação já foi registrada com outros dados."); trava a sessão `ABERTA` do usuário ("Abra o caixa para vender." / em conferência: "Termine o fechamento do caixa antes de vender."); confere a chave de novo; trava os produtos em ordem de `id`; recalcula o carrinho.
14. Total diferente do `totalEsperado` → 409 "O total da venda mudou. Confira os valores.". Desconto, preço mínimo, pagamento ou saldo (com "Vender sem estoque" desligada) inválidos → 409 com o campo.
15. Grava: venda `CONCLUIDA` com número sequencial por empresa e vendedor = dono da sessão; itens com o retrato (nome, código lido, unidade, embalagem sem FK, etiqueta, quantidades, preço, origem, descontos, custo na data); pagamentos; um movimento `SAIDA`/`VENDA` por linha que controla estoque, ligado ao item; um `RECEBIMENTO` de caixa por forma com recebido > 0.
16. Com "Vender sem estoque" ligada, o saldo fica negativo **só por venda**; entradas são aceitas com saldo negativo; o ajuste manual nunca deixa negativo. Produto sem controle de estoque não gera movimento. Produto vendido não é excluído ("Este produto já foi vendido e não pode ser excluído. Inative-o.").

### Espera e cancelamento
17. Até 5 vendas em espera por empresa e usuário, no navegador ("Venda em espera (2 de 5). Retome com F7."; "Limite de 5 vendas em espera. Retome ou descarte uma (F7)."). Retomar com carrinho aberto pergunta se põe o atual em espera. Preços e estoque são os de agora.
18. Cancelar só com a sessão da venda `ABERTA` ("Esta venda é de um caixa que já foi fechado ou está em conferência. Use devolução."). OPERADOR: vendas das próprias sessões (de outro → 404); ADMIN: qualquer. Motivo obrigatório, aparado, até 200; repetir com o mesmo motivo → 200, com outro → 409 "Esta venda já foi cancelada.".
19. Grava (sessão, depois produtos em ordem de `id`): venda `CANCELADA` (quem, quando, motivo); `ENTRADA`/`CANCELAMENTO_VENDA` por item que baixou, com a quantidade oposta; `ESTORNO` por forma recebida, mesmo valor. Estorno em dinheiro não passa da gaveta ("Não há dinheiro suficiente na gaveta para devolver (R$ x)."; sem valor para OPERADOR no modo cego).

### Idempotência, segurança e configuração
20. A chave nasce na **primeira tentativa** de finalizar, fica com o carrinho no navegador e é reaproveitada em toda nova tentativa (mesmo após recarregar); só muda após sucesso ou recusa definitiva. Falha de rede trava o pagamento ("A última tentativa pode ter sido registrada. Tente de novo com os mesmos valores."), e "Descartar tentativa" manda conferir no F8. 409 de outros dados: "Esta venda pode já ter sido registrada. Confira em Vendas do caixa (F8)."; venda repetida já cancelada: "Esta venda já tinha sido registrada e depois cancelada. Confira em Vendas do caixa (F8).".
21. Uma aba do PDV por usuário no navegador (`navigator.locks`).
22. O servidor recalcula preços, descontos, total e troco e relê a etiqueta (ignora a quantidade enviada); produto, embalagem e cliente são buscados na empresa do usuário (de outra → 404 com o campo); o custo não sai em nenhuma resposta; modo cego como no [Caixa](caixa.md).
23. Configurações › PDV: "Vender sem estoque" (padrão ligado) e "Desconto máximo do operador (%)" (padrão 10,00, 0 a 100, até 2 casas). Todos leem; só ADMIN altera (token e banco); registra quem e quando.

## 3. Contrato da API

Autenticadas; empresa do JWT. Venda de outra empresa (ou, para o OPERADOR, de sessão de outra pessoa) responde 404, inclusive em `GET /vendas/{id}`.

| Método · Rota | Perfil | Observação |
|---|---|---|
| `GET /api/pdv/itens?codigo=` | todos | Item resolvido (`UNIDADE`/`EMBALAGEM`/`ETIQUETA`, quantidade, produto com saldo, miniatura e embalagens); 404 / 409 inativo / 400. Até 60 caracteres |
| `GET /api/pdv/itens?busca=` | todos | Até 20 ativos; até 100 caracteres. Os dois parâmetros ou nenhum → 400 "Informe o código ou o texto da busca." |
| `GET /api/pdv/catalogo?categoria=&pagina=` | todos | `{produtos, temMais}`, 24/página; categoria de outra empresa → vazio; página fora de 0–400 → 400 |
| `POST /api/pdv/calculo` | todos | 200 com o cálculo e os `erros` por campo; 400 só para corpo malformado |
| `POST /api/pdv/vendas` | todos | Carrinho + `chave` + `totalEsperado` · 201 / 200 (chave repetida) / 400 / 409 |
| `GET /api/pdv/vendas` | OPERADOR: próprias sessões · ADMIN: todas | Paginado (20); `sessaoId` (padrão: a atual), `status`, `de`, `ate`, `numero`; sem itens |
| `GET /api/pdv/vendas/{id}` | dono da sessão ou ADMIN | Itens, pagamentos, cancelamento, `podeCancelar` |
| `POST /api/pdv/vendas/{id}/cancelamento` | dono da sessão ou ADMIN | `{motivo}` |
| `GET` · `PUT /api/configuracoes/pdv` | todos · ADMIN | |

Carrinho: `itens[{produtoId, embalagemId, quantidade, codigoLido, etiqueta, desconto{tipo: VALOR|PERCENTUAL, valor}}]`, `desconto`, `clienteId`, `pagamentos[{forma, valor}]`. Valores até 10 inteiros e 2 casas; quantidade até 9 e 3 casas. Erros por campo: `itens[i].quantidade`, `itens[i].desconto`, `itens[i]`, `desconto`, `pagamentos`, `pagamentos[i].valor`, `clienteId`, `motivo`.

## 4. Dados

- **V17:** `vendas` (número e chave únicos por empresa; `CHECK` dos totais; só `CONCLUIDA → CANCELADA`, sem `DELETE`; FK que obriga o vendedor a ser o dono da sessão), `itens_venda` e `pagamentos_venda` (imutáveis; um pagamento por forma), `configuracoes_pdv`. Item → produto com FK `RESTRICT`.
- **Conferência no commit** (constraint trigger deferida): ao menos um item; somas dos itens = totais; pagamentos − troco = total; troco ≤ dinheiro.
- **Estoque:** motivo `CANCELAMENTO_VENDA`; movimento ligado ao item (`item_venda_id`, único por item e motivo); movimentos de venda imutáveis; o `CHECK` de saldo saiu de `estoque_saldos` e virou `saldo_novo >= 0 OR motivo = 'VENDA' OR tipo = 'ENTRADA'` em `movimentos_estoque`.
- **Caixa:** forma, recebimento, estorno e contagem por forma (ver [Caixa](caixa.md)).
- **Gatilhos de coerência:** recebimento igual ao pagamento da venda; baixa igual à quantidade de estoque do item; venda só entra e só é cancelada com a sessão aberta (`FOR SHARE`); o cancelamento só fecha no commit com o estorno de todos os recebimentos.
- **Ordem de travas:** sessão → produtos por `id` → saldos (renomear marca também trava produtos por `id`).

## 5. Telas

- **`/pdv`** (todos; `features/pdv/`), a partir de 1024 px, **modo foco**: sem sidebar, barra grafite com marca, caixa, operador, Em espera (n), Vendas do caixa e Menu. Sem caixa: "Abra o caixa para vender." + "Abrir caixa"; em conferência, link para o Caixa.
- **Esquerda:** campo no topo (foco volta após cada janela; dica "digite 3 letras para buscar · 542*3 lança 3 do código 542") e, abaixo, os cards da busca ou o catálogo.
- **Direita:** cliente; linhas (miniatura, nome, preço com selo Promoção/Atacado/Balança, código lido, desconto, valor, − qtd +, "UN ▾", %, ×; destaque breve na última; avisos na linha); resumo com "Desconto da venda"; **Total da venda** como o maior texto da tela; Ir para pagamento e Pôr em espera. A última venda fica no painel, com o troco em destaque, até o primeiro item da próxima.
- **Atalhos:** F2 campo · F3 cliente · F4 desconto do item · Shift+F4 desconto da venda · F6 pôr em espera · F7 em espera · F8 vendas do caixa · F9 comprovante da última venda ("Finalize a venda para imprimir o comprovante. Para reimprimir, use Vendas do caixa (F8).") · F10 pagamento · ↑/↓ linha (ou card, com a busca na tela) · com o campo vazio: + / − quantidade e Del remove (confirma se houver desconto; "{nome} removido da venda." com Desfazer) · Esc fecha janelas (com uma aberta, ela cuida das teclas).
- **Leitura e cálculo:** erro em vermelho no campo até a próxima recusa, Esc ou 6 s, com bipe baixo (Web Audio); leituras pendentes bloqueiam o F10 ("Aguarde a leitura…", até 8 s). Cada mudança chama o cálculo (150 ms, cancelando o anterior), com indicador sem esconder o total anterior. Carrinho no `localStorage` por empresa e usuário.
- **Pagamento (F10), tela inteira:** Esc volta ao carrinho (no campo de valor, desfaz a forma). Teclas **1 Dinheiro · 2 Débito · 3 Crédito · 4 PIX** escolhem e preenchem o que falta; Enter adiciona ("Usar o que falta" repreenche); cartão/PIX acima do que falta é recusado na hora; formas listadas com remover; **Falta pagar** e **Troco** em destaque; pago completo ("Pagamento completo. Enter finaliza a venda.") → Enter finaliza (botão travado no envio). Os pagamentos ficam guardados ao voltar enquanto o carrinho não muda. "O total da venda mudou": total anterior e novo, "Confirmar e finalizar" ou "Voltar à venda".
- **Concluída:** "Venda nº 128 concluída · Troco R$ 5,00", carrinho vazio, foco no campo, sem tela intermediária, "Imprimir comprovante" (F9); nada imprime sozinho.
- **Comprovante não fiscal** (80 mm, impressão do navegador): dados da empresa, "DOCUMENTO NÃO FISCAL", itens (quantidade × unitário, valor, desconto), totais, descontos, formas, troco, consumidor (ou "CONSUMIDOR NÃO IDENTIFICADO"), nº, data, ponto, operador e o aviso de que não substitui a nota. Cancelada: "*** VENDA CANCELADA ***".
- **F7:** hora, itens, total, Retomar e Descartar (com confirmação). **F8:** vendas da sessão (nº, hora, cliente, formas, troco, total, situação), "Carregar mais", busca por número; detalhe com reimpressão e "Cancelar venda" com motivo.
- **Configurações › PDV:** "Quando ligado, a venda passa mesmo sem saldo e o estoque fica negativo até o ajuste." e "Acima disso, só administradores dão desconto. Nenhum desconto passa do preço mínimo do produto."

## 6. Fora do escopo e pendências

- Fora: TEF, devolução após o fechamento, parcelas, crediário/a prazo, vale/voucher/crédito em loja, link de pagamento, PIX dividido, NSU, orçamento, autorização do ADMIN no balcão, "Montar 1 CX + 1 UN?", PDV offline (a calculadora já está isolada), registro de itens removidos, espera em outro computador, filtro por espécie e por ponto no F8, NFC-e.
- Pendências: [DT-041](../technical-debt.md).
