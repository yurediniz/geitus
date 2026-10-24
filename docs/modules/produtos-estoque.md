# Produtos: Estoque básico (Fase D da evolução de Produtos)

> **Status:** implementado em 2026-10-21 (migration V9 aplicada). Ajustes das revisões e decisões do usuário em §10. Quarta das 6 fases da DEC-030; decisões desta fase na **DEC-034**. Depende da Fase C ([produtos-precos.md](produtos-precos.md)). Antecipa parte da etapa 12 (Estoque básico) do `CLAUDE.md`. Registro de design: [`docs/superpowers/specs/2026-10-21-produtos-fase-d-design.md`](../superpowers/specs/2026-10-21-produtos-fase-d-design.md).

## 1. Visão geral

Dá ao produto um **estoque controlado por movimentações**:
- flag **"controla estoque"** por produto;
- **saldo atual só leitura**, alterado apenas por **movimentações imutáveis** (entrada, saída e ajuste para um valor exato), cada uma com motivo, usuário e saldo anterior e novo;
- **estoque inicial** opcional no cadastro, registrado como a primeira entrada;
- indicadores **"estoque baixo"** e **"sem estoque"** na listagem;
- bloqueio da **exclusão** de produto que movimentou.

Segue os princípios da visão de domínio (`docs/visao-dominio-pdv.md`):
- **movimentos como fonte de verdade:** nada edita o saldo sem gerar um movimento;
- **correção por novo movimento:** o passado não é editado;
- **concorrência controlada:** dois ajustes simultâneos não erram o saldo;
- **idempotência:** a mesma operação nunca é aplicada duas vezes.

O PDV ainda não existe. A origem `VENDA` fica reservada, sem tela nem código que a produza nesta fase.

## 2. Escopo

**Inclui:** item §6 (Estoque) do pedido de evolução, a seção de movimentações da aba Histórico (§9) e o bloqueio de exclusão previsto na DEC-030 e na DT-028.

**Não inclui:**

| Item | Onde fica |
|---|---|
| Baixa de estoque pela venda, venda sem estoque, reserva | PDV (etapa 11) |
| Custo médio e nota de compra | futuro (Compras). A entrada por compra com custo veio na Fase B4 ([produtos-custo-entrada.md](produtos-custo-entrada.md)) |
| Vários locais ou depósitos, lote, série, validade | futuro (fora do MVP) |
| Filtro "estoque baixo/sem estoque" e ordenação por estoque na listagem | E |
| Estorno ou cancelamento de um movimento | futuro (a correção é um novo ajuste) |
| Relatórios de movimentação | etapa 15 |

Também fora: fiscal.

## 3. Modelo de dados — migration `V9__estoque_basico.sql`

Aditiva sobre a V8, que **não** é editada. Preserva todos os dados.

### 3.1 `produtos` (coluna nova)

| Coluna | Tipo | Regra |
|---|---|---|
| `controla_estoque` | `BOOLEAN NOT NULL DEFAULT true` | Os produtos existentes passam a controlar estoque, com saldo zero |

### 3.2 `estoque_saldos` (nova)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `BIGINT` identity | PK interna |
| `empresa_id` | `BIGINT NOT NULL` | |
| `produto_id` | `BIGINT NOT NULL` | FK composta `(empresa_id, produto_id) → produtos (empresa_id, id)` **ON DELETE RESTRICT**; `UNIQUE (empresa_id, produto_id)` |
| `saldo` | `NUMERIC(12,3) NOT NULL DEFAULT 0` | CHECK `saldo >= 0` |
| `atualizado_em` | `TIMESTAMP NOT NULL` | Momento do último movimento |

- **Criação da linha:** a linha nasce no primeiro movimento do produto. Sem linha, o saldo é 0.
- **Quem altera o saldo:** só o serviço de estoque, na mesma transação do movimento.

### 3.3 `movimentos_estoque` (nova)

| Coluna | Tipo | Regra |
|---|---|---|
| `id` | `BIGINT` identity | PK interna |
| `uuid` | `UUID NOT NULL UNIQUE` | Identificador público (DEC-019) |
| `empresa_id` | `BIGINT NOT NULL` | |
| `produto_id` | `BIGINT NOT NULL` | FK composta → `produtos (empresa_id, id)` **ON DELETE RESTRICT** (DT-028) |
| `tipo` | `VARCHAR(10) NOT NULL` | CHECK `IN ('ENTRADA','SAIDA','AJUSTE')` |
| `motivo` | `VARCHAR(30) NOT NULL` | CHECK na lista de §4.3 |
| `origem` | `VARCHAR(20) NOT NULL` | CHECK `IN ('AJUSTE_MANUAL','CADASTRO','VENDA')` |
| `quantidade` | `NUMERIC(12,3) NOT NULL` | Variação com sinal (+ entrada, − saída); CHECK `quantidade <> 0` |
| `saldo_anterior` | `NUMERIC(12,3) NOT NULL` | CHECK `>= 0` |
| `saldo_novo` | `NUMERIC(12,3) NOT NULL` | CHECK `>= 0` e CHECK `saldo_novo = saldo_anterior + quantidade` |
| `observacao` | `VARCHAR(200) NULL` | Aparada; vazio → `NULL` |
| `usuario_id` | `BIGINT NOT NULL` | FK composta `(empresa_id, usuario_id) → usuario (empresa_id, id)` (alvo `uq_usuario_empresa_id`, da V8) |
| `chave_idempotencia` | `UUID NULL` | `UNIQUE (empresa_id, chave_idempotencia)` |
| `criado_em` | `TIMESTAMP NOT NULL` | Momento da gravação |

- **CHECKs de coerência:**
  - `tipo = 'ENTRADA'` ⇒ `quantidade > 0`;
  - `tipo = 'SAIDA'` ⇒ `quantidade < 0`;
  - `origem = 'CADASTRO'` ⇒ `tipo = 'ENTRADA' AND motivo = 'ESTOQUE_INICIAL'`.
- **Índice:** `(empresa_id, produto_id, criado_em DESC, id DESC)`, para a aba Histórico.
- **Só inserção:** a aplicação nunca altera nem apaga um movimento. A única exceção é a exclusão do produto descrita em §4.7.

## 4. Regras de negócio

### 4.1 Controla estoque
- **Padrão:** ligado no cadastro.
- **Desligado:**
  - a aba Estoque esconde o saldo e o botão de ajuste;
  - a listagem mostra "—";
  - `situacaoEstoque` vem `null`;
  - não se aceitam ajustes (400 "Este produto não controla estoque.").
- **Desligar com saldo:** é permitido. O saldo e o histórico ficam guardados e voltam a aparecer se o controle for religado. A tela avisa antes ("O saldo atual de 12 UN fica guardado e volta se você religar o controle.").
- **Venda (futuro PDV):** produto sem controle de estoque não gera movimento.

### 4.2 Tipos de movimento e quantidade

| Tipo (tela) | `tipo` | O usuário informa | Variação gravada |
|---|---|---|---|
| Entrada | `ENTRADA` | quantidade > 0 | `+quantidade` |
| Saída | `SAIDA` | quantidade > 0 | `−quantidade` |
| Contagem | `AJUSTE` | **saldo novo** ≥ 0 | `saldo novo − saldo atual` |

- **Casas decimais:** até 3. Quantidade com fração só se a unidade de venda for **fracionada** (400 "A unidade UN não aceita quantidade fracionada.").
- **Limite:** a quantidade respeita o `NUMERIC(12,3)` (9 dígitos inteiros).
- **Saldo insuficiente:** uma saída maior que o saldo dá 400 "Saldo insuficiente: há 3 UN." **Nenhum ajuste manual deixa o saldo negativo** (decisão do usuário). O banco também garante isso.
- **Ajuste sem mudança:** um ajuste para o mesmo valor do saldo dá 400 "O saldo já é 12 UN."

### 4.3 Motivos

| Tipo | Motivos (`motivo` — texto na tela) |
|---|---|
| Entrada | `COMPRA` — Compra/recebimento · `DEVOLUCAO_CLIENTE` — Devolução de cliente · `OUTRO` — Outro |
| Saída | `PERDA_AVARIA` — Perda/avaria · `VENCIDO` — Vencido · `USO_INTERNO` — Uso interno · `DEVOLUCAO_FORNECEDOR` — Devolução ao fornecedor · `OUTRO` — Outro |
| Ajuste | `CONTAGEM` — Contagem/inventário · `OUTRO` — Outro |
| Sistema | `ESTOQUE_INICIAL` — Estoque inicial (só origem `CADASTRO`) · `VENDA` — Venda (reservado ao PDV) |

- **Motivo fora do tipo:** um motivo que não é do tipo informado dá 400. `ESTOQUE_INICIAL` e `VENDA` nunca são aceitos num ajuste manual.
- **Observação:** opcional, até 200 caracteres. É **obrigatória quando o motivo é `OUTRO`** ("Descreva o motivo.").

### 4.4 Estoque inicial
- **No cadastro:** `estoqueInicial` é opcional e > 0, com as mesmas regras de fração e limite de §4.2. Se informado com `controlaEstoque` ligado, o cadastro cria o primeiro movimento (ENTRADA, `ESTOQUE_INICIAL`, origem `CADASTRO`) na mesma transação.
- **Combinações rejeitadas:** `estoqueInicial` com `controlaEstoque` desligado → 400. `estoqueInicial` no PATCH → 400 ("O estoque inicial só pode ser informado no cadastro. Use Ajustar estoque.").

### 4.5 Concorrência e idempotência
- **Concorrência:** cada movimento garante a linha do saldo com `INSERT ... ON CONFLICT (empresa_id, produto_id) DO NOTHING` e depois a bloqueia (`SELECT ... FOR UPDATE`). Assim, dois ajustes simultâneos, inclusive o primeiro de um produto, produzem a cadeia correta de saldo anterior → novo.
- **Idempotência:** a tela gera uma `chave` (UUID) ao abrir o modal. Um segundo pedido com a mesma chave na mesma empresa **não cria outro movimento**: responde 200 com o movimento já gravado. A resposta normal do primeiro pedido é 201. Isso cobre o duplo clique e a repetição por rede lenta.
- **Mesma chave para outro produto ou dados diferentes:** 409 ("Esta operação já foi registrada com outros dados.").

### 4.6 Níveis de referência e situação
- **Validação dos níveis:** mínimo ≤ ponto de reposição ≤ máximo, quando os dois lados estão informados (400, com o campo). Isso amplia a regra atual de máximo ≥ mínimo.
- **Situação (calculada, não é coluna), só com controle ligado:**
  - `SEM_ESTOQUE` se saldo ≤ 0;
  - `BAIXO` se saldo ≤ ponto de reposição, ou ≤ estoque mínimo quando o ponto não está informado;
  - `NORMAL` nos demais casos.

### 4.7 Exclusão do produto
- **`podeExcluir`** é verdadeiro quando o produto **não tem movimentos** ou quando o **único** movimento é o estoque inicial do cadastro (origem `CADASTRO`). Decisão do usuário, para permitir excluir um produto cadastrado por engano.
- **Como a exclusão acontece:** no segundo caso, o movimento inicial e a linha de saldo são apagados na mesma transação, antes do produto. É a única situação em que um movimento é apagado. O log INFO da exclusão (Fase B) registra também que havia estoque inicial (só ids e a quantidade).
- **Qualquer outro movimento** → 409 "Este produto já teve movimentação de estoque e não pode ser excluído. Inative-o." O banco garante a mesma regra pela FK RESTRICT.
- **Fronteira entre pacotes:** o catálogo consulta essa condição por uma interface (`UsoDoProdutoNoEstoque`, definida em `catalog` e implementada em `inventory`), com os métodos:
  - `resumos(Long empresaId, Collection<Long> produtoIds)`, que devolve, por produto, um `ResumoDeEstoque` (saldo, total de movimentos e movimentos que não são o estoque inicial, de onde saem `temMovimentos()` e `permiteExcluir()`), em no máximo 2 consultas;
  - `algumProdutoDaUnidadeTemMovimentos(Long empresaId, Long unidadeId)`;
  - e a interface `RegistroDeEstoqueInicial` (`registrar` e `removerParaExclusao`), usada no cadastro e na exclusão.

  Assim o catálogo não depende do pacote de estoque. Na listagem, a consulta é feita **em lote**, sem N+1.

### 4.8 Unidade de produto movimentado
- **Troca de unidade de venda:** um produto com movimentos não pode trocá-la (400 "Não é possível trocar a unidade de um produto com movimentação de estoque."). Isso preserva o significado das quantidades.
- **Unidade deixando de ser fracionada:** uma unidade não pode passar de fracionada para não fracionada se algum produto com movimentos a usa (400 "Esta unidade é usada por produtos com movimentação de estoque."). Cumpre a observação futura da DEC-031.

## 5. API

| Endpoint | Perfil | Respostas |
|---|---|---|
| `POST /api/produtos/{id}/estoque/ajustes` | ADMIN | 201 / 200 (chave repetida) / 400 / 403 / 404 / 409 |
| `GET /api/produtos/{id}/estoque/movimentos?pagina=0&tamanho=20` | autenticado | 200 / 400 / 404 |
| `POST/PATCH /api/produtos` | ADMIN | como hoje, com os campos novos |

**Ajuste (request):**
```json
{ "tipo": "SAIDA", "quantidade": 2, "motivo": "PERDA_AVARIA", "observacao": "Caixa amassada", "chave": "2c1f…" }
```
`chave` é obrigatória.

**Ajuste (response) e item da lista de movimentos:**
```json
{ "id": "uuid", "tipo": "SAIDA", "motivo": "PERDA_AVARIA", "origem": "AJUSTE_MANUAL",
  "quantidade": -2.000, "saldoAnterior": 12.000, "saldoNovo": 10.000,
  "observacao": "Caixa amassada", "usuarioNome": "Ana Souza", "criadoEm": "2026-10-21T15:20:00" }
```

- **Lista de movimentos:** `PaginaResponse` (`itens`, `pagina`, `tamanho`, `totalItens`), do mais recente para o mais antigo. Valem os mesmos limites do histórico de preços (tamanho de 1 a 100, deslocamento até `Integer.MAX_VALUE`). Produto de outra empresa → 404.
- **Erros por campo:** `quantidade`, `motivo`, `observacao` e `tipo`.

**Produto:**
- **Request:** ganha `controlaEstoque` (boolean, obrigatório) e `estoqueInicial` (só no POST).
- **Response:**
  - `controlaEstoque`;
  - `estoqueAtual`: o saldo, mesmo com o controle desligado, porque fica guardado;
  - `situacaoEstoque` (`NORMAL` / `BAIXO` / `SEM_ESTOQUE` / `null`);
  - `podeExcluir`, que segue §4.7.

  A listagem carrega os saldos **em uma única consulta**.

**Segurança:**
- `POST .../estoque/ajustes` cai na regra `POST /api/produtos/**` (ADMIN) que já existe. Um teste confirma o 403 para OPERADOR.
- A empresa sempre vem do JWT, e o usuário do movimento é sempre o autenticado.

## 6. Frontend

### 6.1 Aba Estoque
- **Interruptor "Controlar estoque"** no topo, ligado por padrão. Desligar um produto salvo com saldo mostra o aviso de §4.1.
- **Com controle ligado:**
  - **saldo atual** em destaque ("12 UN"), só leitura, com o selo da situação;
  - botão **"Ajustar estoque"**, só para ADMIN e só em produto já salvo. Ele só fica bloqueado quando a alteração pendente **afeta o estoque** (`controlaEstoque` ou unidade de venda), com a dica "Salve a mudança de controle ou de unidade antes de ajustar o estoque.". Outras alterações pendentes, como nome ou preço, não bloqueiam e continuam no formulário (decisão do usuário, 2026-10-21);
  - **no cadastro novo:** campo **"Estoque inicial (opcional)"**, com a sigla da unidade, no lugar do saldo;
  - **mínimo, ponto de reposição e máximo**, com a validação de §4.6 no Zod.
- **OPERADOR:** vê o saldo e o histórico, sem o botão.

### 6.2 Modal "Ajustar estoque"
1. **Tipo:** grupo de três opções (Entrada, Saída, **Contagem**). "Contagem" substitui o rótulo "Contar e ajustar para" (decisão do usuário); no histórico, o tipo continua aparecendo como "Ajuste".
2. **Quantidade:** com a sigla. Na Contagem, o rótulo vira "Saldo contado", com a ajuda "Quanto você contou. O sistema calcula a diferença.". Aceita vírgula e só aceita fração se a unidade for fracionada.
3. **Motivo:** select filtrado pelo tipo. **Entrada** abre com "Compra/recebimento" e **Contagem** com "Contagem/inventário", ambos pré-selecionados (decisão do usuário). **Saída** abre sem motivo, para a escolha ser consciente.
4. **Observação:** obrigatória em "Outro".
5. **Prévia:**
   - entrada e saída: "Saldo: 12 UN → 10 UN";
   - contagem: mostra também a diferença, "Saldo: 12 UN → 10 UN (−2 UN)";
   - uma saída maior que o saldo mostra o erro antes do envio;
   - contagem igual ao saldo aparece em tom neutro, "A contagem confere com o saldo (12 UN). Não há nada a ajustar.", e não pode ser confirmada.
6. **"Zerar estoque"** (pedido do usuário):
   - botão secundário no modal, visível só com saldo > 0;
   - um clique preenche: tipo Contagem, saldo contado 0 e motivo "Contagem/inventário" (que pode ser trocado);
   - a prévia mostra "Saldo: 12 UN → 0 UN (−12 UN)" e o botão de confirmar vira "Zerar estoque";
   - no backend é um ajuste para 0, sem regra nova.
7. **Confirmação:**
   - o botão diz o que vai acontecer: "Registrar entrada", "Registrar saída", "Ajustar para 10 UN" ou "Zerar estoque";
   - fica desabilitado durante o envio, e a `chave` é gerada ao abrir o modal;
   - em caso de sucesso, o modal fecha e aparece a mensagem do que foi feito: "Entrada de 5 UN registrada. Saldo: 17 UN.", "Saída de 2 UN registrada. Saldo: 10 UN.", "Estoque ajustado para 10 UN (−2 UN)." ou "Estoque zerado (−12 UN)." (na lista, com o nome do produto antes);
   - o saldo da página, a listagem e o histórico são atualizados (invalidação do cache);
   - o ajuste não marca o formulário do produto como alterado.
8. **Teclado:** Enter confirma e Esc fecha. O foco começa no tipo.
9. **Onde o modal abre:** na aba Estoque do produto e num atalho **"Ajustar estoque"** no card da lista de produtos, que abre o mesmo modal (só ADMIN, com o controle ligado), por decisão do usuário.

### 6.3 Aba Histórico
- **Seções:** duas, **"Estoque"** (primeiro) e **"Preços"** (a da Fase C). Cada uma tem a própria paginação "Carregar mais".
- **Linha de estoque:**
  - data e hora e usuário;
  - tipo e motivo ("Saída · Perda/avaria");
  - a quantidade com sinal e a sigla ("−2 UN");
  - "12 → 10" e a observação, quando houver.
- **A aba aparece** na edição, como hoje.

### 6.4 Listagem
- **Coluna Estoque:**
  - "12 UN" com o selo **"Estoque baixo"** (tom de aviso) ou **"Sem estoque"** (tom destrutivo suave);
  - "—" para produto sem controle de estoque;
  - botão **"Ajustar estoque"** no card (só ADMIN, com o controle ligado), que abre o modal de §6.2 sem sair da lista.

## 7. Organização do código
- **Backend:** pacote novo **`com.geitus.app.inventory`**, que nasce agora conforme o mapa do `CLAUDE.md`, com:
  - `MovimentoEstoque`, `EstoqueSaldo`, os enums `TipoMovimento`, `MotivoMovimento` e `OrigemMovimento`;
  - `EstoqueService`, os repositórios, `EstoqueController` e os DTOs;
  - a implementação de `UsoDoProdutoNoEstoque`.

  O `ProdutoService` chama o `EstoqueService` para o estoque inicial (§4.4) por meio de uma interface pequena (`RegistroDeEstoqueInicial`), definida em `catalog`.
- **Frontend:**
  - em `features/products/estoque/`: `ModalAjusteEstoque`, `SaldoDoProduto`, `SeloSituacaoEstoque`, a seção de estoque da aba Histórico e as funções puras (`calcularVariacao`, `motivosDoTipo`, `textoMovimento`);
  - `services/estoqueService.ts` e `types/estoque.ts`.

## 8. Critérios de aceite e testes

**Backend:**
- **Migração V9 (IT):**
  - os produtos existentes ficam com `controla_estoque = true`;
  - as tabelas começam vazias;
  - os CHECKs recusam: saldo negativo, `saldo_novo ≠ anterior + quantidade`, entrada com quantidade negativa, `CADASTRO` com outro motivo e quantidade 0;
  - a FK RESTRICT barra excluir produto com movimento;
  - a FK composta recusa usuário de outra empresa;
  - a `chave` é única por empresa.
- **Serviço de estoque:**
  - entrada, saída e ajuste (para cima e para baixo);
  - saída igual ao saldo é aceita e deixa 0; saída um centésimo acima é recusada;
  - ajuste para o mesmo valor → 400;
  - fração em UN → 400; em KG, aceita;
  - motivo fora do tipo → 400;
  - `OUTRO` sem observação → 400;
  - produto sem controle → 400;
  - chave repetida → 200 com o mesmo movimento e um único registro; mesma chave com outros dados → 409;
  - **concorrência (IT):** dois ajustes em paralelo sobre o mesmo produto deixam a cadeia correta e o saldo final certo.
- **Estoque inicial:**
  - cria a entrada no cadastro, e nada é gravado se o cadastro falhar;
  - com controle desligado → 400;
  - no PATCH → 400.
- **Exclusão:**
  - sem movimento → 204;
  - só com o estoque inicial → 204, apagando o movimento e o saldo;
  - com um ajuste → 409, e `podeExcluir` falso;
  - `podeExcluir` na listagem em lote (o teste conta as consultas).
- **Unidade:**
  - troca de unidade com movimento → 400, e sem movimento → OK;
  - desligar `fracionada` de unidade usada por produto movimentado → 400.
- **Níveis:** mínimo > ponto → 400; ponto > máximo → 400.
- **Situação:** `SEM_ESTOQUE`, `BAIXO` pelo ponto, `BAIXO` pelo mínimo sem ponto, `NORMAL` e `null` sem controle.
- **Endpoints:**
  - OPERADOR ajustando → 403;
  - sem token → 401;
  - produto de outra empresa → 404;
  - UUID malformado → 400;
  - paginação com os limites;
  - OPERADOR lendo os movimentos → 200.

**Frontend:**
- **Modal:**
  - motivos filtrados por tipo;
  - observação obrigatória em "Outro";
  - prévia do saldo nos três tipos;
  - saída acima do saldo bloqueada antes do envio;
  - fração em UN bloqueada;
  - "Confirmar" desabilitado durante o envio (duplo clique não envia duas vezes);
  - a mesma `chave` numa nova tentativa depois de erro de rede;
  - erro 400 do servidor no campo;
  - sucesso fecha, mostra a mensagem e atualiza o saldo.
- **Aba Estoque:**
  - o interruptor esconde e mostra os blocos;
  - o aviso ao desligar com saldo;
  - estoque inicial só no modo novo;
  - "Ajustar estoque" ausente para OPERADOR, ausente no modo novo e desabilitado com alterações pendentes.
- **Zod:** mínimo ≤ ponto ≤ máximo.
- **Histórico:** a seção Estoque com estados, paginação e o texto da linha.
- **Listagem:** os selos de situação e "—" sem controle.

## 9. Pontos em aberto
- **Venda sem estoque no PDV:** será decidida na spec do PDV (a visão de domínio prevê uma autorização especial).
- **Revisar a ordem do `CLAUDE.md`:** ao concluir esta fase, revisar a "Ordem recomendada de desenvolvimento", como pede a DEC-030, porque parte do Estoque básico terá sido entregue.

## 10. Ajustes incorporados na implementação (revisões e decisões do usuário)
- **Decisões do usuário durante a revisão de UX (2026-10-21):**
  - o bloqueio do "Ajustar estoque" vale só para alterações pendentes de controle ou de unidade;
  - Entrada pré-seleciona "Compra/recebimento";
  - atalho "Ajustar estoque" no card da lista;
  - o tipo se chama "Contagem";
  - **"Zerar estoque"** no modal (§6.2).
- **Banco (V9):** além de §3.3, o banco garante:
  - a matriz tipo × motivo de §4.3;
  - `ESTOQUE_INICIAL` só com origem `CADASTRO`;
  - o estoque inicial parte do saldo zero;
  - no máximo um estoque inicial por produto (índice único parcial).

  Assim, a exclusão nunca apaga mais que o movimento inicial.
- **Travas:** ajuste, edição, exclusão, inativar e reativar travam a linha do produto (`FOR UPDATE`) antes de qualquer escrita, e o ajuste trava em seguida a linha do saldo. Não há ciclo de travas, e saídas concorrentes nunca deixam o saldo negativo (a perdedora recebe 400).
- **Idempotência:** a observação também conta na comparação. Mesma chave com outra observação → 409.
- **Listagem:** saldos e contagens com um único parâmetro de array (`= ANY`), sem limite de quantidade de produtos.
- **Saldo:** sempre com 3 casas (`0.000` sem movimento).
- **Limite de quantidade:** "A quantidade deve ter no máximo 9 dígitos inteiros e 3 casas decimais.".
- **Tela de Unidades:** o erro de "desligar fracionada" aparece junto ao checkbox.
- **Modal:**
  - a Contagem igual ao saldo aparece em tom neutro, com o botão "Fechar";
  - toda falha do ajuste recarrega o saldo da página;
  - o foco vai ao campo com erro do servidor;
  - Esc não fecha o modal durante o envio.
- **Exclusão:** quando há estoque inicial, o diálogo avisa que ele também será apagado.
- **Dívidas registradas:** DT-028 (parcialmente resolvida) e DT-032 (endurecimentos e regras obrigatórias para o PDV).
