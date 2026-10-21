# Design — Evolução do cadastro de produtos · Fase D (Estoque básico)

**Data:** 2026-10-21
**Status:** Implementado em 2026-10-21 (plano: `docs/superpowers/plans/2026-10-21-produtos-fase-d.md`)
**Spec canônica:** [`docs/modules/produtos-estoque.md`](../../modules/produtos-estoque.md) · Decisão: DEC-034

## Escopo da fase
Item §6 (Estoque) do pedido de evolução (DEC-030), a seção de movimentações da aba Histórico (§9) e o bloqueio de exclusão de produto movimentado (DT-028). Antecipa parte da etapa 12 do `CLAUDE.md`.

## Decisões do usuário (2026-10-21)

| Tema | Escolha |
|---|---|
| Ajuste manual deixando saldo negativo | **Bloquear** (saída maior que o saldo é recusada) |
| Estoque inicial | **Campo opcional no cadastro**, que vira a primeira entrada |
| Quem ajusta | **Só ADMIN** (OPERADOR vê saldo e movimentos) |
| Motivo | **Lista por tipo + observação**, obrigatória em "Outro" |
| Exclusão | Permitida quando não há movimento **ou o único é o estoque inicial do cadastro** |

## Decisões do CTO (revisáveis na spec)
- **Saldo em tabela própria (`estoque_saldos`) + movimentos só de inserção (`movimentos_estoque`)**, no pacote novo `inventory`. Leitura barata na listagem, consistência garantida no banco (`saldo_novo = saldo_anterior + quantidade`, saldo ≥ 0) e lock `FOR UPDATE` na linha do saldo. Descartados: coluna em `produtos` (mistura catálogo e estoque) e saldo somado a cada leitura (caro).
- **Quantidade com sinal** no movimento e tipo AJUSTE informado como "saldo contado". O usuário pensa em "contei 10", e a variação é calculada.
- **Idempotência por `chave` gerada na tela**: duplo clique ou repetição não duplicam o movimento (princípio 6 da visão de domínio).
- **FK RESTRICT** de movimentos e saldos para produto (DT-028). A exclusão com só o estoque inicial apaga o movimento e o saldo explicitamente.
- **Desligar "controla estoque" é permitido**, guardando saldo e histórico.
- **Trava de unidade**: produto movimentado não troca de unidade de venda, e uma unidade usada por produto movimentado não deixa de ser fracionada (DEC-031).
- **Situação BAIXO** pelo ponto de reposição, ou pelo mínimo quando o ponto não existe.
- **Entrada sem custo**: o custo médio fica para Compras.
- **Fronteira `catalog` ↔ `inventory` por interfaces definidas em `catalog`**, para o catálogo não depender do estoque.
