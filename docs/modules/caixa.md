# Módulo: Caixa (etapa 10)

> Decisões: **DEC-041**. Norte: [`visao-dominio-pdv.md`](../visao-dominio-pdv.md) §3.6. Diretriz inicial: `CLAUDE.md`, "Módulo Caixa".

## 1. Motivação e escopo

O caixa controla o dinheiro da gaveta durante um período de trabalho: quanto entrou como fundo de troco, quanto foi retirado ou colocado no meio do dia e quanto havia no fechamento. É a base do PDV: a venda só será finalizada com caixa aberto e ficará ligada a ele.

**Decisões do usuário (em conversa, 2026-10-24):**
- **O caixa pertence a um ponto de caixa** ("Caixa 1", "Caixa 2"), não à pessoa. Cada ponto tem no máximo uma sessão aberta.
- **Sangria e suprimento entram nesta fase.**
- **Fechamento cego e fechamento com o esperado visível existem os dois.** O ADMIN escolhe o modo nas Configurações.
- **A tela Configurações nasce agora**, com a seção Caixa.
- **Permissões:** o OPERADOR opera o próprio caixa. O ADMIN opera qualquer caixa e cuida dos pontos e das Configurações.
- **Diferença no fechamento exige justificativa**, para mais ou para menos. Caixa fechado não reabre.
- **Abordagem A:** movimentos imutáveis e saldo calculado pela soma.

**Nesta fase:**
- pontos de caixa (cadastro, inativação);
- sessão de caixa: abertura com fundo de troco, sangria, suprimento, contagem e fechamento;
- configuração do modo de fechamento;
- histórico de sessões;
- tela Configurações (seção Caixa).

**Fora desta fase (registrado):**
- **Com o PDV:**
  - recebimento de venda no caixa (tipo `RECEBIMENTO`, forma de pagamento);
  - conferência de cartão e PIX no fechamento;
  - venda exigindo caixa aberto.
- impressão do fechamento;
- relatório consolidado de caixa (módulo Relatórios);
- vínculo do ponto a um computador ou terminal;
- integração da sangria com o Financeiro (sangria para pagar despesa);
- permissões configuráveis por usuário;
- mover a configuração da balança para a tela Configurações.

## 2. Conceitos

- **Ponto de caixa:** a gaveta física de um balcão. A empresa pode ter vários. Nunca é excluído, só inativado.
- **Sessão de caixa:** o período entre a abertura e o fechamento num ponto, aberta por um usuário.
- **Movimento de caixa:** uma alteração de dinheiro na sessão. Nunca muda e nunca é apagado.
- **Dinheiro esperado na gaveta:** abertura + suprimentos − sangrias. Não é coluna: é a soma dos movimentos.
- **Contagem:** o valor que o operador contou na gaveta ao fechar.
- **Diferença:** contado − esperado. Positiva é sobra, negativa é falta.

## 3. Regras de negócio

### 3.1 Pontos de caixa
- **Nome:** obrigatório, até 40 caracteres, aparado. É único na empresa sem diferenciar maiúsculas (`lower(nome)`, como categorias e marcas). Nome repetido → 409 com o campo `nome`.
- **Limite:** até 50 pontos por empresa (409 ao passar).
- **"Caixa 1" automático:** a migration cria um ponto "Caixa 1" para cada empresa existente. Uma empresa que **nunca teve ponto** ganha o "Caixa 1" na primeira consulta de pontos. Assim o cadastro de empresa não depende do caixa. Uma corrida entre duas consultas cai na unicidade e é tratada como "já existe".
- **Inativar:** só sem sessão aberta ou em conferência no ponto (409 "Feche o caixa deste ponto antes de inativá-lo."). Ponto inativo não abre caixa (409 "Este ponto de caixa está inativo.").
- **Último ponto ativo:** pode ser inativado. A tela do caixa mostra "Nenhum ponto de caixa ativo" com o caminho para Configurações (ADMIN) ou "Peça ao administrador" (OPERADOR).

### 3.2 Abertura
- **Quem:** qualquer usuário autenticado e ativo.
- **Fundo de troco:** obrigatório, ≥ 0, até 2 casas e no máximo 9.999.999.999,99. Zero é aceito.
- **Sugestão:** a tela sugere o fundo de troco da abertura anterior do mesmo ponto (`ultimoFundoTroco` na lista de pontos). Sem abertura anterior, o campo vem vazio.
- **Um por ponto:** o ponto não pode ter sessão `ABERTA` ou `EM_CONFERENCIA` (409 "O Caixa 1 já está aberto por Ana Souza.").
- **Um por usuário:** quem abre não pode ter outra sessão `ABERTA` ou `EM_CONFERENCIA` aberta por ele (409 "Você já tem um caixa aberto no Caixa 2."). Vale também para o ADMIN.
- **O que grava:** a sessão (`ABERTA`) e o movimento `ABERTURA` com o valor do fundo, na mesma transação.

### 3.3 Sangria e suprimento
- **Quem:** quem abriu a sessão ou um ADMIN. OPERADOR em sessão de outra pessoa → 404.
- **Só em sessão `ABERTA`.** Em conferência → 409 "O caixa está em conferência. Termine o fechamento."; fechada → 409 "Este caixa já foi fechado.".
- **Valor:** > 0, até 2 casas, no máximo 9.999.999.999,99.
- **Motivo:** obrigatório, aparado, até 200 caracteres.
- **Sangria não passa do dinheiro na gaveta:** se o valor for maior que o esperado → 409.
  - ADMIN ou modo não cego: "A sangria passa do dinheiro na gaveta (R$ 50,00).";
  - OPERADOR no modo cego: "A sangria passa do dinheiro esperado na gaveta." (sem o valor, para não revelar o esperado).

### 3.4 Contagem e fechamento
Estados da sessão: `ABERTA` → `EM_CONFERENCIA` → `FECHADA`, ou `ABERTA` → `FECHADA` direto.

- **Quem:** quem abriu a sessão ou um ADMIN. Quando um ADMIN fecha a sessão de outra pessoa, o fechamento registra o ADMIN.
- **Contagem** (`valorContado`, ≥ 0, até 2 casas):
  - **só em `ABERTA`**;
  - **gravação:** guarda na sessão o `valor_contado`, o `valor_esperado` (calculado na hora; depois disso não entra mais movimento) e a `diferenca`, com quem contou e quando;
  - **diferença zero:** a sessão vai direto para `FECHADA`;
  - **diferença diferente de zero:**
    - **modo cego:** a sessão vai para `EM_CONFERENCIA` e a resposta mostra esperado e diferença. Uma justificativa enviada junto com a contagem → 400 "Informe a justificativa depois de ver a diferença.";
    - **modo não cego:** com justificativa, fecha direto; sem justificativa, vai para `EM_CONFERENCIA`.
- **Fechamento** (`justificativa`, obrigatória, aparada, de 1 a 500 caracteres):
  - só em `EM_CONFERENCIA`;
  - grava a justificativa, quem fechou e quando, e passa a sessão para `FECHADA`.
- **A contagem não muda depois de gravada.** Não existe rota para trocar o valor contado.
- **O modo vale no momento da contagem:** a sessão guarda `fechamento_cego` (o modo que valia quando foi contada). Trocar a configuração depois não afeta sessões já contadas.
- **Caixa fechado não reabre.** Nada na sessão fechada muda (garantido no banco, §4.4).

### 3.5 Caixa esquecido aberto
- **A sessão não fecha sozinha.** Se a data de abertura (no fuso `America/Sao_Paulo`) for anterior a hoje, a tela mostra "Aberto desde 23/10 às 08:02".
- **Quem resolve:** o dono fecha normalmente; o ADMIN pode fechar no lugar dele (§3.4).
- **Usuário inativado com caixa aberto:** o ADMIN fecha.

### 3.6 Modo cego (o que o OPERADOR não vê)
Com `fechamentoCego` ligado e a sessão em `ABERTA`, as respostas ao **OPERADOR** não trazem `dinheiroNaGaveta` (fica `null`). A partir da contagem, todos veem esperado, contado e diferença.

- **O ADMIN sempre vê** o esperado.
- **Limitação aceita:** os movimentos que o próprio operador lançou continuam visíveis com os valores. O modo cego esconde o total, não os lançamentos.

### 3.7 Idempotência
- **Abertura, sangria e suprimento** levam uma `chave` (UUID, obrigatória), gerada pela tela ao abrir a janela e gravada no movimento. É única por empresa.
  - mesma chave e mesmos dados → 200 com o que já foi gravado (a primeira resposta é 201);
  - mesma chave com outros dados → 409 "Esta operação já foi registrada com outros dados.".
- **Contagem e fechamento** são idempotentes pelo estado:
  - repetir a contagem com o mesmo valor numa sessão já contada → 200 com o resultado gravado; outro valor → 409 "A contagem deste caixa já foi registrada.";
  - repetir o fechamento com a mesma justificativa numa sessão fechada → 200; outra justificativa → 409 "Este caixa já foi fechado.".

### 3.8 Concorrência
- **Movimentos, contagem e fechamento travam a linha da sessão** (`SELECT ... FOR UPDATE`) antes de ler o esperado e gravar. Duas sangrias simultâneas não deixam o saldo negativo, e um fechamento não acontece no meio de um lançamento.
- **Abertura:** a unicidade de sessão aberta por ponto e por usuário é garantida no banco (índices parciais, §4.3). Uma corrida de duas aberturas no mesmo ponto devolve 409 com a mesma mensagem de §3.2.

### 3.9 Configuração
- **`fechamentoCego`:** padrão **ligado**. Sem linha na tabela, vale o padrão.
- **Quem altera:** só o ADMIN. A alteração registra quem alterou e quando.
- **Quem lê:** todos os autenticados, porque a tela do caixa precisa do modo.

## 4. Banco — migration `V16__caixa.sql`

Migration aditiva (V1–V15 intactas). Convenções do estoque (V9):
- PK `BIGINT` identity mais `uuid` público (DEC-015, DEC-019);
- isolamento por FKs compostas `(empresa_id, …)` (DEC-016);
- `UNIQUE (empresa_id, id)` como alvo das FKs.

**Diferença de propósito:** os horários são `TIMESTAMPTZ` (§4.5).

### 4.1 `pontos_caixa`
| Coluna | Tipo | Observações |
|---|---|---|
| `id` | `BIGINT` identity | PK |
| `uuid` | `UUID` | NOT NULL, `UNIQUE` |
| `empresa_id` | `BIGINT` | NOT NULL, FK → `empresa(id)` |
| `nome` | `VARCHAR(40)` | NOT NULL, `CHECK (nome = btrim(nome) AND nome <> '')` |
| `ativo` | `BOOLEAN` | NOT NULL, default `true` |
| `criado_em`, `atualizado_em` | `TIMESTAMPTZ` | `criado_em` NOT NULL |

- `UNIQUE (empresa_id, id)`;
- índice único `(empresa_id, lower(nome))`;
- carga: um "Caixa 1" ativo por empresa existente.

### 4.2 `configuracoes_caixa`
| Coluna | Tipo | Observações |
|---|---|---|
| `empresa_id` | `BIGINT` | PK, FK → `empresa(id)` |
| `fechamento_cego` | `BOOLEAN` | NOT NULL, default `true` |
| `atualizado_por` | `BIGINT` | NOT NULL, FK composta `(empresa_id, atualizado_por)` → `usuario` |
| `atualizado_em` | `TIMESTAMPTZ` | NOT NULL |

### 4.3 `sessoes_caixa`
| Coluna | Tipo | Observações |
|---|---|---|
| `id`, `uuid`, `empresa_id` | | como acima; `UNIQUE (empresa_id, id)` |
| `ponto_caixa_id` | `BIGINT` | NOT NULL, FK composta → `pontos_caixa`, `RESTRICT` |
| `status` | `VARCHAR(15)` | `CHECK IN ('ABERTA','EM_CONFERENCIA','FECHADA')` |
| `aberta_por`, `aberta_em` | `BIGINT`, `TIMESTAMPTZ` | NOT NULL; FK composta → `usuario` |
| `fundo_troco` | `NUMERIC(12,2)` | NOT NULL, `>= 0` |
| `fechamento_cego` | `BOOLEAN` | modo usado na contagem; NULL antes dela |
| `valor_esperado`, `valor_contado`, `diferenca` | `NUMERIC(12,2)` | NULL antes da contagem; `valor_contado >= 0` |
| `contada_por`, `contada_em` | `BIGINT`, `TIMESTAMPTZ` | NULL antes da contagem; FK composta → `usuario` |
| `justificativa` | `VARCHAR(500)` | |
| `fechada_por`, `fechada_em` | `BIGINT`, `TIMESTAMPTZ` | NULL até fechar; FK composta → `usuario` |

**Regras no banco:**
- **Uma sessão aberta por ponto:** índice único parcial `(empresa_id, ponto_caixa_id) WHERE status IN ('ABERTA','EM_CONFERENCIA')`.
- **Uma sessão aberta por usuário:** índice único parcial `(empresa_id, aberta_por) WHERE status IN ('ABERTA','EM_CONFERENCIA')`.
- **Coerência por estado (`CHECK`):**
  - `ABERTA` → campos da contagem e do fechamento nulos;
  - `EM_CONFERENCIA` → contagem preenchida, `diferenca <> 0`, fechamento nulo;
  - `FECHADA` → contagem e fechamento preenchidos.
- **Diferença:** `diferenca = valor_contado - valor_esperado`.
- **Justificativa:** `diferenca <> 0` em sessão `FECHADA` exige `justificativa` não vazia.
- **Índice do histórico:** `(empresa_id, aberta_em DESC)`.

### 4.4 `movimentos_caixa`
| Coluna | Tipo | Observações |
|---|---|---|
| `id`, `uuid`, `empresa_id` | | como acima |
| `sessao_caixa_id` | `BIGINT` | NOT NULL, FK composta → `sessoes_caixa`, `RESTRICT` |
| `tipo` | `VARCHAR(15)` | `CHECK IN ('ABERTURA','SUPRIMENTO','SANGRIA')` |
| `valor` | `NUMERIC(12,2)` | sempre positivo (o sinal sai do tipo); `ABERTURA >= 0`, demais `> 0` |
| `motivo` | `VARCHAR(200)` | obrigatório em `SUPRIMENTO` e `SANGRIA`; nulo em `ABERTURA` |
| `usuario_id` | `BIGINT` | NOT NULL, FK composta → `usuario` |
| `chave_idempotencia` | `UUID` | NOT NULL, `UNIQUE (empresa_id, chave_idempotencia)` |
| `criado_em` | `TIMESTAMPTZ` | NOT NULL |

- **Abertura única:** índice único parcial `(empresa_id, sessao_caixa_id) WHERE tipo = 'ABERTURA'`.
- **Índice:** `(empresa_id, sessao_caixa_id, id)`.

**Imutabilidade garantida no banco (gatilhos):**
- `movimentos_caixa`: `BEFORE UPDATE OR DELETE` → erro.
- `sessoes_caixa`:
  - `BEFORE DELETE` → erro;
  - `BEFORE UPDATE` quando `OLD.status = 'FECHADA'` → erro;
  - `BEFORE UPDATE` que mude `empresa_id`, `ponto_caixa_id`, `aberta_por`, `aberta_em` ou `fundo_troco` → erro;
  - `BEFORE UPDATE` que mude a contagem já gravada → erro.

### 4.5 Fuso dos horários (parte da DT-030)
- **Tipo:** as quatro tabelas usam `TIMESTAMPTZ`.
- **Preenchimento:** a aplicação grava `OffsetDateTime`/`Instant` obtido do `Clock` único (`RelogioConfig`, `America/Sao_Paulo`), nunca `LocalDateTime.now()` nem `DEFAULT now()`.
- **API:** os horários saem em ISO-8601 com deslocamento (`2026-10-24T08:02:00-03:00`).
- **"Hoje" do caixa** (aviso de §3.5 e filtro por período) é a data em `America/Sao_Paulo`.
- **As tabelas antigas** continuam na DT-030 (corrigir antes do primeiro deploy).

## 5. Backend

### 5.1 Pacotes
- **`cashier`** (novo):
  - `cashier/ponto` (pontos de caixa);
  - `cashier/sessao` (sessões, movimentos, contagem e fechamento);
  - `cashier/configuracao` (configuração do caixa).
- **Dependências:** `cashier` depende de `iam` (usuário) e `company` (empresa). Nada depende de `cashier` nesta fase. O PDV vai depender dele.
- **Empresa do usuário (DT-025):** o Caixa **não duplica** o `resolverEmpresaId`. Esta fase cria o resolvedor compartilhado em `iam` previsto na DT-025 e o usa no `cashier`. Migrar os services antigos para ele é opcional nesta fase.
- **Paginação (DT-032):** `Paginacao` e `PaginaResponse` vão para `shared`. Os usos atuais mudam só o `import`.

### 5.2 Rotas
Todas autenticadas e isoladas pela empresa do JWT. Recurso de outra empresa → 404.

| Método e rota | Perfil | Respostas |
|---|---|---|
| `GET /api/caixa/pontos` | todos | 200. Lista ativos e inativos (filtro `ativo`), com `situacao` e `ultimoFundoTroco`. Garante o "Caixa 1" (§3.1). |
| `POST /api/caixa/pontos` | ADMIN | 201 / 400 / 409 |
| `PATCH /api/caixa/pontos/{id}` | ADMIN | 200 / 400 / 404 / 409 (renomear) |
| `PATCH /api/caixa/pontos/{id}/inativar` · `/reativar` | ADMIN | 200 / 404 / 409 |
| `GET /api/caixa/sessoes/atual` | todos | 200 com a sessão `ABERTA`/`EM_CONFERENCIA` aberta pelo usuário, ou 204 |
| `POST /api/caixa/sessoes` | todos | 201 / 200 (chave repetida) / 400 / 404 (ponto) / 409 |
| `POST /api/caixa/sessoes/{id}/movimentos` | dono ou ADMIN | 201 / 200 / 400 / 404 / 409 |
| `POST /api/caixa/sessoes/{id}/contagem` | dono ou ADMIN | 200 / 400 / 404 / 409 |
| `POST /api/caixa/sessoes/{id}/fechamento` | dono ou ADMIN | 200 / 400 / 404 / 409 |
| `GET /api/caixa/sessoes` | OPERADOR: as suas · ADMIN: todas | 200 / 400. Paginado; filtros `pontoId`, `status`, `de`, `ate` (datas). |
| `GET /api/caixa/sessoes/{id}` | dono ou ADMIN | 200 / 404 |
| `GET /api/configuracoes/caixa` | todos | 200 `{ fechamentoCego, atualizadoPorNome, atualizadoEm }` |
| `PUT /api/configuracoes/caixa` | ADMIN | 200 / 400 |

**"Dono"** é quem abriu a sessão. OPERADOR em sessão de outra pessoa → 404, como recurso de outra empresa. A regra de perfil das rotas de ponto e configuração fica no `SecurityConfig` (403). A regra de dono fica no service.

### 5.3 Contratos
**Ponto (item da lista):**
```json
{ "id": "uuid", "nome": "Caixa 1", "ativo": true, "ultimoFundoTroco": 150.00,
  "situacao": { "status": "ABERTA", "sessaoId": "uuid", "abertaPorNome": "Ana Souza",
                "abertaEm": "2026-10-24T08:02:00-03:00" } }
```
`situacao` é `null` quando o ponto está livre.

**Abrir:** `{ "pontoId": "uuid", "fundoTroco": 150.00, "chave": "uuid" }`

**Movimento:** `{ "tipo": "SANGRIA", "valor": 200.00, "motivo": "Depósito no cofre", "chave": "uuid" }`

**Contagem:** `{ "valorContado": 318.00, "justificativa": null }`. **Fechamento:** `{ "justificativa": "Troco dado a mais" }`

**Sessão (resposta de todas as rotas de sessão):**
```json
{ "id": "uuid", "ponto": { "id": "uuid", "nome": "Caixa 1" }, "status": "EM_CONFERENCIA",
  "abertaPorNome": "Ana Souza", "abertaEm": "…", "fundoTroco": 150.00,
  "dinheiroNaGaveta": 320.00, "fechamentoCego": true,
  "valorEsperado": 320.00, "valorContado": 318.00, "diferenca": -2.00,
  "contadaPorNome": "Ana Souza", "contadaEm": "…",
  "justificativa": null, "fechadaPorNome": null, "fechadaEm": null,
  "movimentos": [ { "id": "uuid", "tipo": "SANGRIA", "valor": 200.00, "motivo": "Depósito no cofre",
                    "usuarioNome": "Ana Souza", "criadoEm": "…" } ],
  "podeOperar": true }
```
- **`dinheiroNaGaveta`:** o esperado atual. `null` para o OPERADOR no modo cego enquanto `ABERTA` (§3.6).
- **`fechamentoCego`:** com a sessão `ABERTA`, é o modo atual da empresa; depois da contagem, o modo gravado.
- **`movimentos`:** do mais recente para o mais antigo. A lista do histórico traz a sessão **sem** `movimentos`.
- **Erros por campo:** `fundoTroco`, `valor`, `motivo`, `valorContado`, `justificativa`, `nome`, `pontoId`, `tipo`.

## 6. Frontend

### 6.1 Navegação
- **Caixa:** o item "Caixa" do menu deixa de ser "em breve" e leva a `/caixa`, para todos.
- **Configurações:** item novo, só para ADMIN, que leva a `/configuracoes` (protegido por `AdminRoute`).
- **Rotas novas:** `/caixa`, `/caixa/historico` e `/configuracoes`, com a feature nova em `features/cash-register/` e a tela de configurações em `features/settings/`.

### 6.2 `/caixa`: sem caixa aberto
- **Pontos:** a tela lista os pontos ativos com a situação ("Caixa 1 · livre", "Caixa 2 · aberto por Ana às 08:02").
- **Abrir caixa:**
  - o botão "Abrir caixa" no ponto livre abre uma janela com **Fundo de troco** (`CampoMoeda`, foco inicial), preenchida com `ultimoFundoTroco`;
  - Enter confirma, e a chave é gerada ao abrir a janela.
- **Um único ponto ativo:** a escolha é pulada, e a tela mostra direto "Abrir o Caixa 1".
- **Nenhum ponto ativo:** a tela mostra a mensagem de §3.1.

### 6.3 `/caixa`: com caixa aberto
- **Cabeçalho:** "Caixa 1 · aberto por você às 08:02". Com abertura em outro dia, aparece o aviso âmbar "Aberto desde 23/10 às 08:02".
- **Destaque:**
  - "Dinheiro na gaveta **R$ 320,00**";
  - no modo cego, o OPERADOR vê no lugar: "Fechamento cego: o valor esperado aparece depois da contagem.".
- **Ações:** **Suprimento**, **Sangria** e **Fechar caixa**.
  - Sangria e suprimento abrem uma janela pequena com **Valor** (foco inicial) e **Motivo**.
  - O botão de confirmar fica desabilitado durante o envio.
- **Movimentos:** lista com hora, tipo (com cor discreta: sangria em âmbar, suprimento e abertura neutros), valor, motivo e quem lançou.
- **Feedback:** "Caixa aberto", "Sangria de R$ 200,00 registrada", "Suprimento de R$ 50,00 registrado".

### 6.4 Fechar caixa
- **Modo não cego:**
  - campo **"Dinheiro contado na gaveta"**, com o esperado e a diferença ao lado, atualizados enquanto digita;
  - diferença zero em verde ("Confere"); sobra ou falta em âmbar ("Sobra de R$ 2,00" / "Falta de R$ 2,00");
  - com diferença, aparece a **Justificativa** obrigatória;
  - "Fechar caixa" envia a contagem com a justificativa.
- **Modo cego:**
  - só o campo e o botão **"Conferir"**;
  - depois aparece o resultado (esperado, contado, diferença);
  - se houver diferença, aparece a **Justificativa** e o botão **"Fechar caixa"**.
- **Conferência interrompida:** se a janela for fechada em `EM_CONFERENCIA`, a tela do caixa mostra "Contagem registrada · falta a justificativa" e reabre direto nesse passo.
- **ADMIN fechando o caixa de outra pessoa:** aviso no topo da janela: "Você está fechando o caixa aberto por Ana Souza.".
- **Depois de fechar:**
  - aparece o resumo do fechamento (fundo, suprimentos, sangrias, esperado, contado, diferença, justificativa) e o botão **"Abrir novo caixa"**;
  - mensagem: "Caixa fechado" ou "Caixa fechado com falta de R$ 2,00".

### 6.5 ADMIN em `/caixa`
- **Caixas de outras pessoas:** o ADMIN vê os pontos com caixa aberto por outra pessoa e pode abrir qualquer um ("Ver caixa").
- **No caixa de outra pessoa:** a tela é a mesma de §6.3, com o cabeçalho "aberto por Ana Souza".
- **Caixa próprio:** o ADMIN pode abrir o próprio caixa normalmente.

### 6.6 `/caixa/historico`
- **Tabela:**
  - colunas: ponto, aberto por e quando, fechado por e quando, esperado, contado e diferença (verde quando zero, âmbar quando não);
  - estado: "Aberto" ou "Em conferência" para sessões não fechadas;
  - paginação com `PaginacaoLista`.
- **Filtros:** ponto, situação e período (de/até).
- **OPERADOR:** vê só as suas sessões, sem o filtro de quem abriu.
- **Detalhe:** clicar numa sessão abre o painel lateral (`Sheet`) com os movimentos e a fotografia do fechamento.

### 6.7 `/configuracoes` (ADMIN)
- **Estrutura:** página com seções, nesta fase só **Caixa**.
- **Seção Caixa:**
  - **Fechamento cego:** interruptor com a frase "Quem fecha o caixa informa o valor contado sem ver o esperado. A diferença aparece depois da contagem.". Salva ao alternar, com a mensagem "Configuração salva" e o interruptor revertido se falhar.
  - **Pontos de caixa:** lista com nome e situação, **"+ Adicionar ponto"**, renomear em linha, **Inativar/Reativar**.
  - Inativar um ponto com caixa aberto mostra a mensagem do servidor.

### 6.8 Estados e componentes
- **Estados:** carregando, erro com "Tentar de novo", vazio e sucesso em todas as telas.
- **Dinheiro:** `CampoMoeda` (reuso; a validação manual em Android e iOS da DT-031 continua pendente) e formatação `pt-BR` em reais.
- **Dados:** TanStack Query com chaves próprias do caixa. Depois de cada lançamento, invalida a sessão atual e a lista de pontos.

## 7. Segurança
- **Empresa e usuário vêm do JWT.** O usuário do movimento, da contagem e do fechamento é sempre o autenticado.
- **Perfis:**
  - ponto e configuração exigem ADMIN no `SecurityConfig`;
  - a regra "dono ou ADMIN" é aplicada no service e testada com OPERADOR em sessão de outro (404).
- **Modo cego:** o esperado não sai em **nenhuma** resposta ao OPERADOR enquanto a sessão está `ABERTA`, nem na lista de pontos, no histórico, no detalhe ou na mensagem de erro da sangria.
- **Perfil do token:** o perfil vem do token (limitação já registrada na DT-032).
- **Revisores obrigatórios:** `data-reviewer` (V16, gatilhos, índices parciais, `TIMESTAMPTZ`) e `security-reviewer` (perfis, regra do dono, vazamento do esperado no modo cego).

## 8. Testes (critérios de aceite)

**Banco (Testcontainers):**
- a V16 aplica sobre a V15 com dados e cria um "Caixa 1" por empresa;
- duas sessões abertas no mesmo ponto, ou duas abertas pelo mesmo usuário, são recusadas pelo banco;
- `UPDATE` e `DELETE` em `movimentos_caixa` são recusados;
- `UPDATE` em sessão `FECHADA` e `DELETE` em qualquer sessão são recusados;
- `CHECK` de coerência por estado e diferença com justificativa;
- horários gravados com fuso: uma sessão aberta com o `Clock` fixo em `2026-10-24T08:02-03:00` é lida de volta no mesmo instante, com a JVM em UTC.

**Backend:**
- **Abertura:**
  - fundo zero aceito, negativo e com 3 casas recusados;
  - ponto inativo → 409; ponto ocupado → 409 com o nome de quem abriu; usuário com outro caixa → 409;
  - chave repetida → 200 com a mesma sessão; mesma chave com outro fundo → 409.
- **Sangria:**
  - exatamente igual ao esperado é aceita (gaveta fica em R$ 0,00); um centavo a mais → 409;
  - OPERADOR no modo cego recebe a mensagem sem o valor.
- **Duas sangrias simultâneas** que juntas passam do esperado: uma passa e a outra recebe 409.
- **Contagem e fechamento:**
  - diferença zero fecha direto, nos dois modos;
  - modo cego com diferença → `EM_CONFERENCIA`; justificativa junto com a contagem no modo cego → 400;
  - modo não cego com diferença e justificativa → `FECHADA`; sem justificativa → `EM_CONFERENCIA`;
  - nova contagem com outro valor → 409; com o mesmo → 200;
  - lançamento em `EM_CONFERENCIA` ou `FECHADA` → 409;
  - fechamento sem justificativa ou só com espaços → 400.
- **Troca de modo:** trocar o modo depois da contagem não muda a sessão (`fechamentoCego` gravado).
- **Modo cego:** `dinheiroNaGaveta` é `null` para OPERADOR em `ABERTA` em todas as rotas (atual, detalhe, histórico, pontos), e preenchido para ADMIN.
- **Permissões:**
  - OPERADOR em sessão de outro → 404 em detalhe, movimento, contagem e fechamento;
  - OPERADOR em rotas de ponto e configuração (escrita) → 403;
  - ADMIN fecha a sessão de outro e o fechamento registra o ADMIN;
  - sessão e ponto de outra empresa → 404.
- **Pontos:** "Caixa 1" automático só para empresa sem nenhum ponto; nome repetido com outra caixa de letra → 409; inativar com caixa aberto → 409.
- **Histórico:** OPERADOR só vê as suas sessões; filtros por ponto, situação e período (datas em `America/Sao_Paulo`).

**Frontend (Vitest + Testing Library):**
- abrir caixa com a sugestão do fundo, e o pulo da escolha com um único ponto;
- sangria acima do esperado mostra o erro do servidor;
- fechamento não cego mostra a diferença ao vivo e exige justificativa;
- fechamento cego esconde o esperado, mostra o resultado depois de "Conferir" e retoma em `EM_CONFERENCIA` ao recarregar;
- aviso "Aberto desde…" com abertura em outro dia;
- Configurações: interruptor salva e reverte em erro; OPERADOR não vê o item e é barrado em `/configuracoes`;
- histórico com filtros e painel de detalhe.

**Manual (navegador, usuário de teste):**
- abrir, suprimento, sangria, fechar sem diferença e com diferença, nos dois modos;
- ADMIN fechando o caixa de um OPERADOR.

## 9. Integrações futuras (para o PDV)
- **Venda:** a venda vai procurar a sessão `ABERTA` do usuário (`GET /api/caixa/sessoes/atual`) e gravar nela os recebimentos (tipo `RECEBIMENTO`, com forma de pagamento). Recebimento em dinheiro entra no esperado da gaveta.
- **Conferência por forma:** a conferência de cartão e PIX vira uma contagem por forma de pagamento, definida na spec do PDV.
- **Chave de idempotência:** a do movimento já é única por empresa. A venda deve gerar uma chave por recebimento (ver DT-032).
