# Estoque

> Decisões: DEC-034 (estoque básico), DEC-038 (custo pela última entrada), DEC-037 (ajuste por embalagem), DEC-039 (fornecedor na compra), DEC-042 (baixa e estorno pela venda), DEC-045 (etapa 12: posição, movimentações e devolução). Pacote `inventory`. Migrations V9, V12, V13, V14, V17 e V18.

> O que está marcado **(etapa 12)** ainda não foi implementado. A marca sai quando a fatia é entregue.

## 1. Objetivo

Saldo do produto controlado por **movimentos imutáveis**: nada altera o saldo sem gravar um movimento, e o passado se corrige com um novo movimento. A entrada por compra registra o custo, que vira o custo do produto. A venda baixa, o cancelamento estorna e a devolução devolve ao estoque (regras no [PDV](pdv.md)). A área **Estoque** mostra a posição e as movimentações de todos os produtos.

## 2. Regras de negócio

**Controle de estoque**
1. Flag `controlaEstoque` por produto, ligada por padrão. Desligada: a tela esconde saldo e ajuste, a listagem mostra "—", `situacaoEstoque` é `null` e o ajuste dá 400 "Este produto não controla estoque.". Na venda, o produto não gera movimento.
2. Desligar com saldo é permitido: saldo e histórico ficam guardados e voltam ao religar. A tela avisa: "O saldo atual de 12 UN fica guardado e volta se você religar o controle."

**Ajuste manual** (só ADMIN)

3. Tipos e o que o usuário informa:

   | Tela | `tipo` | Informa | Variação gravada |
   |---|---|---|---|
   | Entrada | `ENTRADA` | quantidade > 0 | `+quantidade` |
   | Saída | `SAIDA` | quantidade > 0 | `−quantidade` |
   | Contagem | `AJUSTE` | saldo contado ≥ 0 | `contado − saldo atual` |

4. Até 3 casas decimais, e fração só em unidade fracionada ("A unidade UN não aceita quantidade fracionada."). Até 9 dígitos inteiros: "A quantidade deve ter no máximo 9 dígitos inteiros e 3 casas decimais.". O saldo resultante não passa de 999.999.999,999 ("O saldo não pode passar de 999.999.999,999.").
5. **O ajuste manual nunca deixa o saldo negativo:** a saída maior que o saldo dá 400 "Saldo insuficiente: há 3 UN.". Uma contagem igual ao saldo dá 400 "O saldo já é 12 UN.".
6. Motivos por tipo:

   | Tipo | Motivos |
   |---|---|
   | Entrada | `COMPRA` (Compra/recebimento), `DEVOLUCAO_CLIENTE`, `OUTRO` |
   | Saída | `PERDA_AVARIA`, `VENCIDO`, `USO_INTERNO`, `DEVOLUCAO_FORNECEDOR`, `OUTRO` |
   | Contagem | `CONTAGEM` (Contagem/inventário), `OUTRO` |
   | Só do sistema | `ESTOQUE_INICIAL` (cadastro), `VENDA` e `CANCELAMENTO_VENDA` (PDV) |

   Motivo de outro tipo dá 400 "Este motivo não vale para o tipo de movimento escolhido.", e motivo do sistema num ajuste dá 400 "Este motivo é registrado só pelo sistema.". A observação é opcional, com até 200 caracteres, e obrigatória em `OUTRO` ("Descreva o motivo.").
7. **Ajuste por embalagem** (Entrada e Saída, produto com embalagem):
   - a quantidade é o número de embalagens, inteiro e > 0 ("Informe um número inteiro de embalagens.");
   - o movimento é gravado em unidades (± n × quantidade da embalagem), com o retrato da embalagem (rótulo, quantidade e número de embalagens), sem FK;
   - a regra do saldo negativo vale sobre o total em unidades;
   - Contagem e "Zerar estoque" são só em unidades: com embalagem, 400 "A contagem é feita na unidade de venda.";
   - embalagem de outro produto ou removida dá 404 "Embalagem não encontrada.".

**Entrada por compra: custo e fornecedor**

8. Só na Entrada com motivo `COMPRA` o custo é **obrigatório e maior que zero**:
   - custo ausente dá "Informe o custo da compra.";
   - custo zero ou negativo dá "O custo deve ser maior que zero.";
   - custo em outro tipo ou motivo dá "O custo só é informado na entrada por compra.";
   - até 10 dígitos inteiros e 2 casas.

   Em embalagem, o valor digitado é o custo de **1 embalagem**, como na nota. O custo por unidade é a divisão, com 4 casas no movimento.
9. **O custo do produto passa a ser o último custo de entrada**, por unidade, arredondado a centavos (meio para cima), na mesma transação do movimento:
   - se o arredondamento der R$ 0,00, dá 400 "O custo deve ser maior que zero.";
   - o produto guarda a origem `ENTRADA_COMPRA` com a data e a hora do movimento, mesmo quando o valor não mudou;
   - o histórico de preços só ganha uma linha de custo, ligada ao movimento, quando o valor muda.

   Não há custo médio.
10. A edição manual do custo no cadastro grava a origem `EDICAO`. Apagar o custo zera a origem. Uma edição que não mexe no custo não muda nada. Produtos anteriores à V13 ficam sem origem.
11. Na compra, o **fornecedor** é opcional e só aceito ativo:
   - inativo dá "Este fornecedor está inativo.";
   - fora da compra dá "O fornecedor só é informado na entrada por compra.".

   Com fornecedor, na mesma transação: o movimento guarda o fornecedor, que entra na lista do produto (se faltar) e vira o "da última compra". Se o produto já tiver 20 fornecedores, a ligação de um novo dá 400 (detalhe em [fornecedores-e-marcas.md](fornecedores-e-marcas.md)).

**Estoque inicial e exclusão**

12. O cadastro aceita um `estoqueInicial` opcional (> 0, mesmas regras de fração e limite), gravado como a primeira entrada (`ESTOQUE_INICIAL`, origem `CADASTRO`) na mesma transação.
   - Com o controle desligado, 400.
   - No PATCH, 400 "O estoque inicial só pode ser informado no cadastro. Use Ajustar estoque.".
   - No máximo um estoque inicial por produto, partindo do saldo zero.
13. Produto pode ser excluído (`podeExcluir`) sem movimentos, ou quando o **único** movimento é o estoque inicial. Nesse caso o movimento e o saldo são apagados antes do produto, e o diálogo avisa. Qualquer outro movimento dá 409 "Este produto já teve movimentação de estoque e não pode ser excluído. Inative-o.", garantido também pela FK RESTRICT.
14. Produto com movimentos não troca de unidade de venda: "Não é possível trocar a unidade de um produto com movimentação de estoque.". Uma unidade usada por produto movimentado não deixa de ser fracionada: "Esta unidade é usada por produtos com movimentação de estoque.".

**Níveis e situação**

15. Mínimo ≤ ponto de reposição ≤ máximo, quando os dois lados de cada par estão informados (400 com o campo).
16. A situação é calculada (não é coluna) e só existe com o controle ligado:
   - `SEM_ESTOQUE` quando o saldo ≤ 0;
   - `BAIXO` quando o saldo ≤ ponto de reposição, ou ≤ mínimo quando não há ponto;
   - `NORMAL` nos demais casos.

**Concorrência e idempotência**

17. Cada movimento garante a linha de saldo (`INSERT … ON CONFLICT DO NOTHING`) e a trava com `FOR UPDATE`. Ajuste, edição, exclusão, inativar e reativar travam antes a linha do produto. Saídas concorrentes nunca deixam o saldo negativo: a perdedora recebe 400.
18. O ajuste exige uma `chave` (UUID gerado ao abrir o modal), única por empresa:
   - a repetição com os mesmos dados devolve 200 com o movimento já gravado (o primeiro pedido responde 201);
   - a repetição com outro produto ou outros dados dá 409 "Esta operação já foi registrada com outros dados.";
   - entram na comparação: tipo, quantidade, motivo, observação, embalagem, custo e fornecedor.

**Venda** (regras completas no [PDV](pdv.md))

19. A venda grava uma `SAIDA`/`VENDA` por item que controla estoque, ligada ao item. O cancelamento grava a `ENTRADA`/`CANCELAMENTO_VENDA` correspondente, com a mesma quantidade. São no máximo uma baixa e um estorno por item, de origem `VENDA`, sem chave própria (a idempotência é a da venda).
20. **O saldo só fica negativo por venda** (com "Vender sem estoque" ligada). Uma entrada nunca é recusada por saldo negativo, porque não piora o saldo.
21. Os movimentos de origem `VENDA` não podem ser alterados nem apagados.

**Posição de estoque**

22. A posição lista só os produtos que controlam estoque, com o saldo, a situação (regra 16), os níveis, o custo e o **valor em custo** = saldo × custo, a centavos (meio para cima). O valor é `null` sem custo ou com saldo ≤ 0, e o total soma só os valores não nulos.
23. Filtros combinados com E:
   - `busca` e `categoria` com a mesma regra da listagem de produtos ([produtos.md](produtos.md): sem acento, categoria com descendentes);
   - `status`: `ativos` (padrão), `inativos` ou `todos`;
   - `situacao`: `sem` (saldo ≤ 0), `baixo` (inclui os sem estoque, como na listagem de produtos) ou `negativo` (saldo < 0).

   Ordem: `nome` (padrão) / `-nome`, `saldo` / `-saldo`, `valor` / `-valor` (sem valor sempre no fim), com desempate por nome e id. Valor inválido dá 400.
24. O **resumo** vale para o filtro de busca, categoria e status (sem paginação e sem o filtro de situação, para os cards mostrarem as contagens): produtos, sem estoque, baixo, negativos, valor total em custo e quantos produtos com saldo > 0 estão sem custo.
25. **Saldo negativo** (requisito do PDV, seção 6): o produto negativo ganha o selo "Negativo", e o ADMIN tem a ação "Regularizar", que abre o ajuste na Contagem. O ajuste segue as regras 3 a 6: o saldo contado é ≥ 0, e uma entrada também regulariza.

**Movimentações de todos os produtos**

26. Lista os movimentos da empresa, do mais recente ao mais antigo, com filtros por período (`de`/`ate`, datas inclusivas), produto, tipo, motivo e usuário.
   - O período padrão é de 30 dias até hoje.
   - `de` maior que `ate` dá 400 "A data inicial deve ser anterior à final.".
   - Um período maior que 366 dias dá 400 "O período pode ter no máximo 1 ano.".
   - Motivo de outro tipo não dá erro: a lista volta vazia.
27. O movimento de venda, cancelamento ou devolução traz o número da venda. Para o ADMIN, o número abre a venda numa janela, só leitura (itens, pagamentos e cancelamento); para o OPERADOR fica como texto, porque o detalhe só atende o dono do caixa ou o ADMIN.

## 3. Contrato da API

| Método | Rota | Perfil | Observação |
|---|---|---|---|
| POST | `/api/produtos/{id}/estoque/ajustes` | ADMIN | 201 criado · 200 chave repetida · 400 · 403 · 404 · 409 |
| GET | `/api/produtos/{id}/estoque/movimentos?pagina=&tamanho=` | autenticado | `PaginaResponse`, do mais recente ao mais antigo; tamanho de 1 a 100 |
| GET | `/api/estoque/posicao?busca&categoria&status&situacao&ordem&pagina&tamanho` | autenticado | `PaginaResponse` de 25 por padrão (máx. 100) |
| GET | `/api/estoque/posicao/resumo?busca&categoria&status` | autenticado | contagens e valor total (regra 24) |
| GET | `/api/estoque/movimentos?de&ate&produto&tipo&motivo&usuario&pagina&tamanho` | autenticado | `PaginaResponse` de 25 por padrão (máx. 100); datas `AAAA-MM-DD`; `tipo`/`motivo` pelo nome (`SAIDA`, `VENDA`); `usuario` é o id de `/api/usuarios` |

- **Ajuste (request):** `tipo`, `quantidade`, `motivo`, `observacao?`, `chave`, `embalagemId?`, `custo?`, `fornecedorId?`.
- **Movimento (response):** `id`, `tipo`, `motivo`, `origem`, `quantidade` (com sinal), `saldoAnterior`, `saldoNovo`, `observacao`, `usuarioNome`, `criadoEm`, `embalagem { rotulo, quantidadePorEmbalagem, quantidadeDeEmbalagens } | null`, `custoInformado`, `custoUnitario`, `fornecedor { id, nome } | null`.
- **Produto:**
  - o request ganha `controlaEstoque` (obrigatório) e `estoqueInicial` (só no POST);
  - a response ganha `estoqueAtual` (sempre com 3 casas, mesmo com o controle desligado), `situacaoEstoque`, `podeExcluir` e `custoOrigem { tipo, em, quantidade, quantidadeDeEmbalagens, embalagemRotulo } | null`. Na listagem, `custoOrigem` traz só `tipo` e `em`.
- **Histórico de preços:** as linhas de custo trazem `origem` (`EDICAO`/`ENTRADA_COMPRA`) e, na compra, `entrada { quantidade, quantidadeDeEmbalagens, embalagemRotulo }`.
- **Posição:** `id`, `numero`, `codigo`, `nome`, `unidade { sigla, fracionada }`, `categoria { caminho } | null`, `ativo`, `saldo`, `embalagemPrincipal { sigla, quantidade } | null` (a de compra ou a primeira, para a conversão "55 UN (18 CX + 1 UN)"), `situacao`, `estoqueMinimo`, `pontoReposicao`, `estoqueMaximo`, `custo`, `valorEmCusto`. **Resumo:** `produtos`, `semEstoque`, `baixo`, `negativos`, `valorTotalEmCusto`, `semCusto`.
- **Movimentações:** o movimento acima mais `produto { id, numero, nome, unidade { sigla, fracionada } }` e `venda { id, numero } | null`. Produto ou usuário de outra empresa no filtro dá lista vazia, não 404.
- **Erros por campo:** `tipo`, `quantidade`, `motivo`, `observacao`, `custo`, `fornecedorId`; na posição, `situacao`, `status`, `ordem` e `busca`; nas movimentações, `de`, `ate`, `tipo` e `motivo`. Produto de outra empresa dá 404.
- **Origem dos dados:** empresa e usuário do movimento vêm sempre do usuário autenticado. Na listagem, os saldos e o `podeExcluir` saem em lote, sem N+1. O catálogo consulta o estoque por interfaces (`UsoDoProdutoNoEstoque`, `RegistroDeEstoqueInicial`) e não depende do pacote `inventory`.

## 4. Dados

- **`estoque_saldos` (V9):** uma linha por produto, criada no primeiro movimento (sem linha, o saldo é 0). FK composta para o produto, `ON DELETE RESTRICT`. Desde a V17 não tem mais CHECK de saldo ≥ 0.
- **`movimentos_estoque` (V9):**
  - só inserção, com quantidade ≠ 0 e o sinal coerente com o tipo;
  - `saldo_novo = saldo_anterior + quantidade`;
  - CHECK da matriz tipo × motivo;
  - `CADASTRO` ⇒ `ENTRADA`/`ESTOQUE_INICIAL`;
  - chave única por empresa;
  - FKs compostas para produto (RESTRICT) e usuário;
  - índice `(empresa_id, produto_id, criado_em DESC, id DESC)`.
- **V12:** retrato da embalagem no movimento.
- **V13:**
  - `custo_informado` e `custo_unitario`, preenchidos juntos e só em entrada por compra manual. A compra nova exige custo por uma CHECK `NOT VALID`; as compras antigas, sem custo, continuam válidas;
  - `custo_unitario = round(custo_informado / embalagem_quantidade, 4)` com retrato de embalagem, ou igual a `custo_informado` sem retrato;
  - em `produtos`: `custo_origem`/`custo_origem_em`, com `CHECK (custo IS NOT NULL OR custo_origem IS NULL)`;
  - em `produto_historico_precos`: `origem` e `movimento_id`, por FK de três colunas para um movimento do mesmo produto.
- **V14:** `fornecedor_id` no movimento (FK RESTRICT), só em entrada por compra manual.
- **V17:**
  - `item_venda_id`, por FK para o item do mesmo produto, único por (item, motivo);
  - origem `VENDA` ⇔ item preenchido, só com `VENDA`/`CANCELAMENTO_VENDA` e sem chave;
  - `CHECK (saldo_novo >= 0 OR motivo = 'VENDA' OR tipo = 'ENTRADA')`;
  - gatilhos: a baixa tira exatamente a quantidade de estoque do item, o estorno devolve exatamente a baixa, e o movimento de venda é imutável.
- A posição não cria tabela: lê `estoque_saldos` com o produto, com a mesma busca da listagem de produtos.
- **V18:** índice `(empresa_id, criado_em DESC, id DESC)` em `movimentos_estoque`, para as movimentações sem filtro de produto.
- **V19 (etapa 12, devolução):** ver a seção 6.
- `criado_em` dos movimentos é `TIMESTAMP` sem fuso (V9, [DT-030](../technical-debt.md)). O filtro por dia usa o mesmo relógio que grava a coluna.

## 5. Telas

- **Seção Estoque do produto:** interruptor "Controlar estoque"; saldo com o selo da situação e, com embalagem, a conversão pela embalagem principal ("55 UN (18 CX + 1 UN)"); mínimo, ponto e máximo; no cadastro novo, "Estoque inicial (opcional)". O OPERADOR vê, sem ajustar.
- **"Ajustar estoque"** (ADMIN, produto salvo; também no card da lista) só fica bloqueado com alteração pendente de controle, unidade ou embalagens ("Salve as mudanças de controle, unidade ou embalagens antes de ajustar o estoque.").
- **Modal:**
  - tipo Entrada · Saída · Contagem (no histórico, "Ajuste"); na Contagem o rótulo vira "Saldo contado"; seletor "Em" (a compra abre na embalagem de compra);
  - motivo: Entrada abre em Compra/recebimento, Contagem em Contagem/inventário, Saída sem motivo;
  - custo só em Entrada + Compra ("Custo por UN" ou "Custo de 1 CX c/ 18 UN"), vazio com a dica do último custo, "= R$ 10,00 por UN" em embalagem, descartado ao trocar tipo, motivo ou "Em"; fornecedor preenchido com o da última compra;
  - prévia: "2 CX c/ 18 UN = +36 UN · Saldo: 10 UN → 46 UN · Custo: R$ 9,50 → R$ 10,00 por UN"; contagem igual ao saldo em tom neutro, sem confirmar;
  - "Zerar estoque" (saldo > 0) = contagem para 0; o botão diz o que acontece ("Registrar entrada de 36 UN", "Ajustar para 10 UN") e trava no envio; Enter confirma, Esc fecha (não durante o envio);
  - sucesso com o resumo ("Entrada de 36 UN (2 CX c/ 18 UN) registrada. Saldo: 46 UN. Custo atualizado para R$ 10,00."); qualquer falha recarrega o saldo.
- **Nota do custo (Preços):** "Último custo de entrada: R$ 10,00 por UN, em 24/10/2026 (compra de 2 CX c/ 18 UN), de {fornecedor}." ou "Custo editado manualmente em 24/10/2026.". Compra feita na página atualiza o campo Custo se ele não foi mexido; senão avisa que, ao salvar, vale o campo.
- **Histórico:** seção Estoque antes de Preços, cada uma com "Carregar mais"; a linha traz data, usuário, tipo · motivo, "−2 UN", "12 → 10", observação, embalagem, custo e fornecedor.
- **Listagem:** "12 UN" com selo "Estoque baixo"/"Sem estoque"; "—" sem controle.
- **Área Estoque:** item "Estoque" no menu, depois de Produtos, na rota `/estoque`, aberta a qualquer usuário (o OPERADOR lê, sem ações). Abas **Posição** e **Movimentações**, com a aba na URL (`?aba=movimentacoes`; sem ela, a Posição); trocar de aba começa com os filtros da aba de destino limpos.
  - **Posição:** cards do resumo no topo ("Sem estoque 4", "Estoque baixo 12", "Negativos 2", "Valor em estoque R$ 18.430,00 a custo"), e clicar num card aplica o filtro; o valor mostra "3 produtos sem custo ficam fora" quando houver. Os filtros de situação dizem o que incluem ("Sem estoque (zerado ou negativo)", "Baixo ou sem estoque", "Negativo"). Abaixo vêm a busca, os filtros e "Ordenar por", tudo na URL. Tabela a partir de 1.024 px e cards abaixo, no padrão da lista de produtos, com nome (abre o produto), saldo com conversão, selo da situação ("Negativo" em vermelho), níveis, custo e valor. Ações (só ADMIN): "Ajustar" abre o ajuste na Entrada e, no negativo, "Regularizar" abre na Contagem; daqui o modal não traz embalagens nem o fornecedor da última compra (como na lista de produtos). Sucesso com o nome do produto e o resumo do ajuste. Depois de um ajuste a linha e o resumo recarregam. Lista vazia: "Nenhum produto controla estoque ainda." ou "Nenhum produto neste filtro.".
  - **Movimentações:** período com os atalhos Hoje · 7 dias · 30 dias (o padrão) e as datas, produto (busca por nome, código, EAN, SKU ou Nº; vindo da URL, o nome é carregado, e o produto que não existe mais sai do filtro com aviso), tipo, motivo (só os do tipo escolhido, os do sistema incluídos) e usuário (só ADMIN, com os inativos marcados), tudo na URL; período invertido ou maior que 1 ano mostra o erro no filtro e não consulta. A linha traz o produto (abre a página dele), tipo · motivo, data e hora, usuário, "Venda nº 123" quando houver, fornecedor, observação, "−2 UN" e "12 → 10". "Carregar mais" no fim; lista vazia com filtro oferece "Limpar filtros".

## 6. Requisitos vindos do PDV

Ajustes do PDV que dependem do estoque, decididos em 2026-10-26 (DEC-045).

**6.1 Saldo negativo a regularizar.** Com "Vender sem estoque" ligada, a venda pode deixar o saldo negativo (regra 20). A posição mostra esses produtos (filtro, card e selo) e o atalho para corrigir (regra 25).

**6.2 Devolução de item** (etapa 12, última fatia). Hoje o cancelamento só vale com o caixa da venda aberto e manda usar a devolução. Na entrega, as regras de venda e de caixa passam para o [pdv.md](pdv.md) e o [caixa.md](caixa.md), e aqui ficam só as de estoque.

1. **Venda:** só `CONCLUIDA`, de qualquer data e sessão, encontrada pelo número. Exige o caixa aberto de quem devolve, porque o reembolso sai dele. Motivo obrigatório (aparado, até 200) e `chave` de idempotência com a mesma regra do ajuste (regra 18).
2. **Quantidade por linha:** > 0 e ≤ vendida − já devolvida, na unidade da linha ("Só restam 2 UN para devolver nesta linha."), com a regra de fração da unidade. Linha de embalagem devolve número inteiro de embalagens; linha de etiqueta de balança, só a linha inteira.
3. **Valor:** a parte proporcional do líquido da linha (bruto − desconto do item − parte do desconto da venda), a centavos e meio para cima. A devolução que zera a linha leva o resto, e a soma das devoluções nunca passa do líquido.
4. **Reembolso pela forma original:** o usuário distribui o valor entre as formas que a venda recebeu (com uma forma só, ela já vem preenchida). Cada forma vai no máximo até o recebido menos o já devolvido, sem contar o troco no dinheiro. A soma é igual ao valor da devolução. Reembolso em dinheiro não passa da gaveta, com a mesma mensagem do cancelamento.
5. **Caixa:** um movimento `DEVOLUCAO` por forma reembolsada, na sessão aberta, ligado à venda e à devolução, que sai do esperado da forma. No débito, no crédito e no PIX o estorno é feito na maquininha ou no banco e só registrado aqui, então o esperado da sessão nessas formas pode ficar negativo.
6. **Estoque:** para cada linha cujo item baixou estoque na venda, uma `ENTRADA`/`DEVOLUCAO_VENDA` (novo motivo, só do sistema, origem nova `DEVOLUCAO`) com a quantidade de estoque devolvida, ligada ao item da devolução. O destino é escolhido por linha:
   - **Volta ao estoque** (padrão): só a entrada;
   - **Avariado:** a entrada e, logo depois, uma `SAIDA`/`PERDA_AVARIA` de origem `DEVOLUCAO` com a mesma quantidade. O saldo termina onde estava, mesmo que negativo (exceção nova na CHECK de saldo da V17).

   Item que não baixou estoque na venda não gera movimento. O custo, a origem do custo e o fornecedor do produto não mudam. Os movimentos de origem `DEVOLUCAO` são imutáveis, como os de venda.
7. **Venda depois da devolução:** continua `CONCLUIDA`, com a situação de devolução calculada (nenhuma, parcial ou total). Venda com devolução não pode mais ser cancelada ("Esta venda tem devolução e não pode ser cancelada.").
8. **Dados (V19):**
   - `devolucoes` (venda, sessão de caixa, usuário, motivo, chave única por empresa, valor, `TIMESTAMPTZ`) e `itens_devolucao` (item da venda, quantidade, quantidade de estoque, valor, destino), ambas imutáveis;
   - gatilhos garantem: soma devolvida ≤ vendida por item; entrada = quantidade de estoque do item da devolução; reembolsos = valor da devolução.
9. **API:**
   - `GET /api/pdv/devolucoes/venda?numero=` traz a venda com o disponível por linha e por forma;
   - `POST /api/pdv/vendas/{id}/devolucoes` com `{ chave, motivo, itens: [{ itemId, quantidade, destino }], reembolsos: [{ forma, valor }] }` responde 201 (ou 200 na chave repetida) e 400/404/409;
   - o detalhe da venda ganha `devolucoes[]` e a situação de devolução.
10. **Tela:** "Devolver itens" no detalhe da venda (F8) e uma busca de venda por número para as vendas de outras sessões. Quantidade e destino por linha, prévia do valor e das formas, e confirmação que diz o que vai acontecer ("Devolver R$ 24,90 em dinheiro e voltar 3 UN ao estoque").
11. **Perfil e limites:** só o ADMIN devolve (perfil do banco; o OPERADOR recebe 403), porque devolve dinheiro de uma venda de outra sessão. Não há prazo de devolução nem comprovante de devolução no MVP.
12. **Para depois:** o Financeiro registra a saída da devolução (requisito na spec do Financeiro), e o **crédito em loja** entra como mais um destino do reembolso, com spec própria (junto com o Financeiro ou com Clientes).

## 7. Fora do escopo e pendências

Fora do escopo:
- custo médio;
- nota de compra (Compras/NF-e), frete e impostos no custo;
- entrada com vários itens (recebimento de mercadoria) e contagem/inventário em lote;
- sugestão de compra (máximo − saldo);
- vários depósitos, lote, série e validade; grade;
- reserva;
- estorno de um movimento manual (a correção é um novo ajuste);
- crédito em loja, prazo de devolução e troca com nova venda vinculada;
- relatórios e exportação de movimentação (ficam para Relatórios).

Pendências: [DT-028](../technical-debt.md) (auditoria da exclusão), DT-030 (fuso dos carimbos), DT-032 (estoque), DT-036 (custo na entrada), DT-041 (saldo sem garantia no banco).
