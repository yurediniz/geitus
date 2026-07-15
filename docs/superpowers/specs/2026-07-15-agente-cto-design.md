# Design — Agente CTO (orquestrador principal do Geitus)

**Data:** 2026-07-15
**Status:** Aprovado e implementado
**Decisão relacionada:** DEC-021

## Problema

A orquestração do Geitus estava difusa: o `CLAUDE.md` dizia que o Claude Code era "engenheiro e orquestrador principal", e o processo (quem executa, quem revisa, revisores obrigatórios, fluxo) vivia separado, no `.claude/agents/AGENTS.md`. Queríamos um **orquestrador explícito e único**, que usasse skills do plugin **Superpowers** e seguisse práticas de **harness engineering**.

## Restrição de arquitetura

No Claude Code, **um subagente não dispara outros subagentes** de forma confiável. Quem consegue disparar executores e revisores é a **sessão de topo**. Logo, o CTO não pode ser um subagente despachável — precisa ser a **persona encarnada pela sessão principal**.

## Decisões

1. **Natureza:** CTO = persona de orquestração no topo. Arquivo `.claude/agents/cto.md` é o manual de operação; **não** deve ser invocado como subagente.
2. **Ponto de entrada único:** toda tarefa começa no CTO (triagem → planeja → delega → verifica) e termina nele (relatório estruturado).
3. **Proporcionalidade:** esforço escalado a tamanho/risco — trivial resolve direto; relevante/crítico roda o ciclo completo.
4. **Skills do Superpowers:** `brainstorming`, `writing-plans`, `dispatching-parallel-agents`, `verification-before-completion`, `requesting-code-review`, `systematic-debugging`.
5. **Fusão do catálogo:** o `AGENTS.md` foi **fundido no `cto.md`** (catálogo do time + protocolo num só arquivo) e **removido**. Referências vivas reapontadas para `cto.md`.
6. **Relatório:** reusa o "Padrão de resposta esperado" do `CLAUDE.md`, com seções por agente/etapa e **"Pendências" obrigatório**.

## Padrões adaptados de referência externa

De um `cto.md` de outro projeto (stack Vercel/Next/Prisma/PostHog) foram adaptados apenas os **padrões**, descartando o específico do stack:

- **Protocolo de autonomia** (A total / B checkpoints), perguntado uma vez por tarefa.
- **Triagem e roteamento** (árvore de decisão + tabela sinal→agente).
- **Dispatch auto-contido** (tarefa + contexto + escopo + saída estruturada).
- **Relatório estruturado** com "Pendências" obrigatório.
- **Padrões transversais fiscalizados** — instanciados com as regras do Geitus (migration Flyway acompanha schema; validação no backend; `BigDecimal` para dinheiro; nada de dado sensível exposto; isolamento por empresa; revisores obrigatórios).

Descartado: tudo de Vercel/Next/Prisma/PostHog/Sentry; a regra "CTO nunca escreve código" (conflita com a persona proporcional, que resolve triviais); a arquitetura de CTO-subagente despachável.

## Harness engineering

O CTO nasce como o primeiro exemplo das práticas que passarão a padronizar todos os agentes: ponto de entrada único, contexto auto-contido por dispatch, ferramentas mínimas por agente, loops de verificação com evidência antes de asserção, saída estruturada e esforço proporcional.

## Arquivos afetados

- **Novo:** `.claude/agents/cto.md`.
- **Removido:** `.claude/agents/AGENTS.md`.
- **Editados:** `CLAUDE.md`, `README.md`, `docs/engineering-guidelines.md`, `docs/decision-log.md` (DEC-021 + reapontamentos), `docs/modules/README.md`.

## Fora do escopo (fase seguinte)

Remodelar os demais agentes (executores e revisores) e arquivos-guia para seguir o checklist de harness engineering — a ser fechado antes da remodelagem.
