# Caixa

> Decisões: DEC-041 (Caixa), DEC-042 (recebimentos e conferência por forma). Migrations V16 e V17. Pendências: DT-040.

## 1. Objetivo

Controlar o dinheiro de cada gaveta num período de trabalho: fundo de troco, sangrias, suprimentos, recebimentos do PDV e o fechamento comparando o esperado com o contado. O caixa pertence a um **ponto** (a gaveta do balcão), não à pessoa. A venda só é finalizada com caixa aberto e fica ligada a ele.

## 2. Regras de negócio

### Pontos de caixa
1. Nome obrigatório, aparado, até 40 caracteres, único na empresa sem diferenciar maiúsculas ("Já existe um ponto de caixa com este nome.", 409, campo `nome`). No máximo 50 pontos ("A empresa já tem o limite de 50 pontos de caixa.", 409).
2. Ponto nunca é excluído, só inativado. Inativar exige o ponto sem sessão aberta ou em conferência ("Feche o caixa deste ponto antes de inativá-lo."). Ponto inativo não abre caixa ("Este ponto de caixa está inativo."). O último ponto ativo pode ser inativado; a tela então mostra "Nenhum ponto de caixa ativo" (ADMIN: caminho para Configurações; OPERADOR: "Peça ao administrador").
3. "Caixa 1" automático: a V16 criou um por empresa; empresa que **nunca** teve ponto ganha o "Caixa 1" na primeira consulta de pontos (corrida tratada como "já existe").

### Sessão: abertura
4. Qualquer usuário ativo abre. Fundo de troco obrigatório, ≥ 0 (zero vale), 2 casas, até 9.999.999.999,99. A tela sugere o fundo da abertura anterior do mesmo ponto.
5. Uma sessão `ABERTA`/`EM_CONFERENCIA` por ponto ("O Caixa 1 já está aberto por Ana Souza.") e uma por usuário, inclusive ADMIN ("Você já tem um caixa aberto no Caixa 2."). Ordem das conferências: chave repetida → caixa do usuário → caixa do ponto. Garantido também no banco (índices parciais).
6. Grava a sessão `ABERTA` e o movimento `ABERTURA` na mesma transação.

### Movimentos
7. Tipos: `ABERTURA`, `SUPRIMENTO`, `SANGRIA` (sempre em `DINHEIRO`) e, vindos do PDV, `RECEBIMENTO` e `ESTORNO` (com forma e venda). Valor sempre positivo; o sinal vem do tipo. Movimento nunca muda nem é apagado.
8. Sangria e suprimento: só quem abriu a sessão ou um ADMIN (OPERADOR em sessão de outro → 404); só em `ABERTA` ("O caixa está em conferência. Termine o fechamento." / "Este caixa já foi fechado."). Valor > 0, 2 casas, no máximo 9.999.999.999,99; motivo obrigatório, aparado, até 200 caracteres.
9. Suprimento que deixaria o esperado acima de 9.999.999.999,99 → 400 "O valor passa do limite do caixa." (campo `valor`).
10. Sangria não passa do dinheiro esperado (409): "A sangria passa do dinheiro na gaveta (R$ 50,00)." para ADMIN ou modo não cego; "A sangria passa do dinheiro esperado na gaveta." (sem o valor) para OPERADOR no modo cego.
11. Esperado por forma = soma dos movimentos: `DINHEIRO` = abertura + suprimentos + recebimentos − sangrias − estornos; `DEBITO`, `CREDITO`, `PIX` = recebimentos − estornos. Não há coluna de saldo.

### Contagem e fechamento
12. Estados: `ABERTA` → `EM_CONFERENCIA` → `FECHADA`, ou `ABERTA` → `FECHADA`. Quem: o dono ou um ADMIN; o ADMIN que fecha o caixa de outro fica registrado.
13. Contagem só em `ABERTA`. O dinheiro é sempre contado; débito, crédito e PIX só quando a forma teve movimento na sessão (faltando: "Informe o valor contado de Débito.", 400; forma sem movimento enviada → 400). Valor contado ≥ 0, 2 casas ("O valor contado não pode ser negativo."). Grava, por forma, esperado (calculado na hora), contado e diferença (contado − esperado), com quem contou e quando, e o modo (cego ou não) que valia no momento.
14. Todas as diferenças zero → `FECHADA`. Alguma diferente de zero:
    - **modo cego:** vai para `EM_CONFERENCIA` e só então mostra esperado e diferenças. Justificativa junto com a contagem → 400 "Informe a justificativa depois de ver a diferença." **sempre**, mesmo com diferença zero (senão a recusa revelaria o esperado);
    - **modo não cego:** com justificativa, fecha direto; sem, vai para `EM_CONFERENCIA`. Justificativa enviada com diferença zero é ignorada.
15. Fechamento só em `EM_CONFERENCIA` (em `ABERTA`: "Conte o dinheiro da gaveta antes de fechar o caixa.", 409). Justificativa única para todas as formas, obrigatória, aparada, 1–500 caracteres.
16. A contagem não muda depois de gravada, e caixa fechado não reabre (garantido no banco). Trocar o modo depois da contagem não afeta a sessão.
17. A sessão não fecha sozinha. Aberta em outro dia (`America/Sao_Paulo`): a tela avisa "Aberto desde 23/10 às 08:02". Usuário inativado com caixa aberto: o ADMIN fecha.

### Modo cego
18. Configuração `fechamentoCego`, padrão **ligado**; só o ADMIN altera (perfil do token e do banco; ADMIN rebaixado com token antigo → 403), todos leem; registra quem alterou e quando.
19. Com o modo ligado e a sessão `ABERTA`, o OPERADOR não recebe o esperado de nenhuma forma em nenhuma resposta (sessão atual, detalhe, histórico, lista de pontos, mensagens de sangria e de estorno): `dinheiroNaGaveta` sai `null`, e os movimentos lançados por outra pessoa e os `RECEBIMENTO`/`ESTORNO` saem com `valor: null` ("Valor no fechamento" na tela). O ADMIN sempre vê. Limitação aceita: o operador vê os valores dos próprios lançamentos, e a lista de vendas do PDV (F8) mostra total, formas e troco de cada venda.

### Idempotência e concorrência
20. Abertura, sangria e suprimento levam `chave` (UUID, única por empresa): mesma chave e mesmos dados → 200 com o já gravado (a primeira é 201); outros dados → 409 "Esta operação já foi registrada com outros dados.".
21. Contagem e fechamento são idempotentes pelo estado: mesmo valor/justificativa → 200; outro → 409 "A contagem deste caixa já foi registrada." / "Este caixa já foi fechado.".
22. Movimentos, contagem e fechamento travam a sessão antes de ler o esperado (duas sangrias simultâneas não deixam saldo negativo). Recebimentos do PDV travam a sessão **antes** de inserir. A busca da sessão para vender devolve só `ABERTA`, nunca `EM_CONFERENCIA`.

### Horários
23. Tabelas do caixa usam `TIMESTAMPTZ` preenchido pelo `Clock` (`America/Sao_Paulo`), truncado em microssegundos; a API devolve ISO-8601 com deslocamento. O "hoje" do caixa (aviso e filtros) é a data em `America/Sao_Paulo`.

## 3. Contrato da API

Todas autenticadas; empresa do JWT; recurso de outra empresa ou sessão de outra pessoa (para OPERADOR) → 404. "Dono" = quem abriu a sessão.

| Método · Rota | Perfil | Observação |
|---|---|---|
| `GET /api/caixa/pontos?ativo=` | todos | Lista com `situacao` (sessão aberta, quem, quando) e `ultimoFundoTroco`; garante o "Caixa 1" |
| `POST /api/caixa/pontos` | ADMIN | 201 / 400 / 409 |
| `PATCH /api/caixa/pontos/{id}` | ADMIN | Renomear |
| `PATCH /api/caixa/pontos/{id}/inativar` · `/reativar` | ADMIN | 409 com caixa aberto |
| `GET /api/caixa/sessoes/atual` | todos | Sessão `ABERTA`/`EM_CONFERENCIA` do usuário, ou 204 |
| `POST /api/caixa/sessoes` | todos | `{pontoId, fundoTroco, chave}` · 201 / 200 (chave repetida) / 409 |
| `POST /api/caixa/sessoes/{id}/movimentos` | dono ou ADMIN | `{tipo: SANGRIA\|SUPRIMENTO, valor, motivo, chave}` |
| `POST /api/caixa/sessoes/{id}/contagem` | dono ou ADMIN | `{contagens: {DINHEIRO: 318.00, DEBITO: 120.00}, justificativa?}` |
| `POST /api/caixa/sessoes/{id}/fechamento` | dono ou ADMIN | `{justificativa}` |
| `GET /api/caixa/sessoes` | OPERADOR: as suas · ADMIN: todas | Paginado (padrão 20, máx. 100); filtros `pontoId`, `status`, `de`, `ate` ("A data inicial não pode ser depois da final.", campo `de`) |
| `GET /api/caixa/sessoes/{id}` | dono ou ADMIN | Com movimentos (mais recente primeiro); a lista do histórico vem sem eles |
| `GET /api/configuracoes/caixa` | todos | `{fechamentoCego, atualizadoPorNome, atualizadoEm}` |
| `PUT /api/configuracoes/caixa` | ADMIN | |

A sessão traz `dinheiroNaGaveta` (regra 19), `fechamentoCego` (o da empresa enquanto `ABERTA`, o gravado depois), a fotografia da contagem e do fechamento por forma, `podeOperar` e os movimentos (recebimento e estorno com o nº da venda).

Erros por campo: `fundoTroco`, `valor`, `motivo`, `contagens.<FORMA>`, `justificativa`, `nome`, `pontoId`, `tipo`. Outras mensagens: "Escolha sangria ou suprimento.", "Informe o motivo.", "O motivo deve ter até 200 caracteres.", "Informe o nome do ponto de caixa.", "O nome do ponto de caixa deve ter até 40 caracteres.", "Ponto de caixa não encontrado.", "Caixa não encontrado.".

## 4. Dados

- **V16:** `pontos_caixa` (nome único por `lower`), `configuracoes_caixa`, `sessoes_caixa` (fotografia do dinheiro na própria sessão), `movimentos_caixa` (chave de idempotência única por empresa — desde a V17 nula em recebimento e estorno, cuja idempotência é a da venda; uma `ABERTURA` por sessão). CHECKs de coerência por estado: em `ABERTA` os campos de contagem e fechamento são nulos (`ck_sessao_caixa_aberta`), em `FECHADA` preenchidos (`ck_sessao_caixa_fechada`); diferença = contado − esperado garantida no banco (`ck_sessao_caixa_diferenca`, `ck_contagem_caixa_diferenca`). PK `BIGINT` + `uuid` público; FKs compostas `(empresa_id, …)`.
- **Uma sessão aberta por ponto e por usuário:** índices únicos parciais `WHERE status IN ('ABERTA','EM_CONFERENCIA')` (as consultas usam o mesmo predicado).
- **Gatilhos de imutabilidade:** movimento não muda nem é apagado; movimento só entra em sessão `ABERTA` (lida com `FOR SHARE`); sessão não é apagada, nasce `ABERTA`, não muda depois de `FECHADA`, não troca empresa/ponto/quem abriu/abertura/fundo/`id`/`uuid` nem a contagem gravada, e não vai de `ABERTA` a `FECHADA` com diferença no modo cego.
- **V17:** `movimentos_caixa` ganha `forma` e `venda_id`; tipos `RECEBIMENTO`/`ESTORNO` exigem venda, valor > 0, sem motivo, únicos por `(venda, tipo, forma)`; o estorno exige o recebimento da mesma venda, forma e valor. `contagens_caixa` guarda a contagem de débito, crédito e PIX (o dinheiro fica na sessão). A coerência por estado (conferência exige alguma diferença; diferença exige justificativa) passou para gatilhos, que conferem de novo o esperado de cada forma na saída de `ABERTA`; a contagem trava a sessão com `FOR NO KEY UPDATE`.
- Índices: histórico por `aberta_em DESC` e `(empresa_id, ponto_caixa_id, aberta_em DESC, id DESC)` (último fundo, filtro por ponto).

## 5. Telas

- **Menu:** "Caixa" (`/caixa`, todos) e "Configurações" (`/configuracoes`, só ADMIN, `AdminRoute`). Código em `features/cash-register/` e `features/settings/`.
- **`/caixa` sem caixa aberto:** pontos ativos com a situação ("Caixa 1 · livre", "Caixa 2 · aberto por Ana às 08:02"); "Abrir caixa" abre a janela do fundo de troco (foco no campo, sugestão preenchida, Enter confirma, chave gerada ao abrir). Com um só ponto ativo, mostra direto "Abrir o Caixa 1". Todos ocupados: "Todos os caixas estão em uso".
- **`/caixa` com caixa aberto:** cabeçalho com ponto e quem abriu; "Dinheiro na gaveta R$ 320,00" (no modo cego, para o OPERADOR: "Fechamento cego: o valor esperado aparece depois da contagem."); botões Suprimento, Sangria e Fechar caixa (janelas com Valor e Motivo, botão desabilitado durante o envio); lista de movimentos (sangria em âmbar). Feedback: "Caixa aberto", "Sangria de R$ 200,00 registrada", "Suprimento de R$ 50,00 registrado".
- **Fechar caixa:** um campo por forma (Dinheiro sempre; Débito, Crédito e PIX se tiveram movimento). Não cego: esperado e diferença ao lado, ao vivo ("Confere" em verde; "Sobra/Falta de R$ 2,00" em âmbar), justificativa quando houver diferença. Cego: botão "Conferir", depois o resultado e, se houver diferença, a justificativa e "Fechar caixa"; a janela avisa que a contagem não pode ser alterada depois. Em conferência interrompida, a tela mostra "Contagem registrada · falta a justificativa" e o botão "Justificar e fechar" (a janela não abre sozinha). ADMIN no caixa de outro: aviso "Você está fechando o caixa aberto por Ana Souza.". Depois: resumo do fechamento por forma, "Caixa fechado" ou "Caixa 2 fechado com falta de R$ 2,00" e "Abrir novo caixa".
- **ADMIN:** vê os pontos com caixa de outras pessoas e entra neles ("Ver caixa").
- **`/caixa/historico`:** tabela paginada (ponto, aberto por/quando, fechado por/quando, esperado, contado, diferença em verde/âmbar, "Aberto"/"Em conferência"), filtros de ponto, situação e período; OPERADOR só vê as suas. Detalhe em painel lateral com movimentos e o fechamento por forma.
- **`/configuracoes` › Caixa (ADMIN):** interruptor "Fechamento cego" ("Quem fecha o caixa informa o valor contado sem ver o esperado. A diferença aparece depois da contagem."), salvo ao alternar ("Configuração salva", revertido se falhar); pontos com adicionar, renomear em linha, inativar/reativar.
- **Comportamento:** em qualquer 409 de lançamento, contagem ou fechamento, a tela relê a sessão e decide pelo `status` real. O logout limpa o cache de dados do navegador. Dinheiro com `CampoMoeda` e formato pt-BR.

## 6. Fora do escopo e pendências

- Fora: impressão do fechamento, relatório consolidado (módulo Relatórios), vínculo do ponto a um computador, sangria integrada ao Financeiro, permissões configuráveis por usuário, configuração da balança em Configurações.
- Pendências: [DT-040](../technical-debt.md) (banco, backend, UX e testes), oráculo da sangria no modo cego (DT-039/DT-041), fuso das tabelas antigas (DT-030).
