# Registro de Decisões — ERPell

## Objetivo

Este documento registra as **decisões importantes** do projeto ERPell, seus motivos e impactos.

Ele existe para que futuras sessões do Claude Code, agentes e pessoas entendam **por que** certas escolhas foram feitas, sem depender do histórico de conversas anteriores.

Este registro complementa o `CLAUDE.md` (produto, escopo e regras), o [`docs/engineering-guidelines.md`](engineering-guidelines.md) (padrões técnicos) e o [`.claude/agents/AGENTS.md`](../.claude/agents/AGENTS.md) (papéis de execução e revisão).

---

## Formato de decisão

Use o modelo abaixo para novas decisões:

```markdown
## DEC-000 — Título da decisão

**Data:** AAAA-MM-DD
**Status:** Aceita | Substituída | Em avaliação
**Contexto:**
Descrição do problema ou situação.

**Decisão:**
O que foi decidido.

**Motivo:**
Por que essa decisão foi tomada.

**Impacto:**
Consequências práticas da decisão.

**Observações futuras:**
Pontos para revisitar depois, se houver.
```

---

## Decisões iniciais já tomadas

## DEC-001 — UpeFlow como marca mãe e ERPell como produto

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
O projeto precisava separar empresa/marca mãe do produto ERP/PDV.

**Decisão:**
UpeFlow será a marca/empresa mãe. ERPell será o nome do produto SaaS de PDV com ERP básico.

**Motivo:**
Separar empresa e produto permite que a UpeFlow tenha outros produtos no futuro, enquanto o ERPell mantém foco no sistema de gestão.

**Impacto:**
Documentação, repositório e comunicação técnica devem tratar o ERPell como produto e a UpeFlow como marca mãe.

**Observações futuras:**
Revisitar se a UpeFlow lançar outros produtos que exijam padronização de marca compartilhada.

---

## DEC-002 — MVP como PDV com ERP básico

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
O projeto poderia virar um ERP amplo demais.

**Decisão:**
O MVP será um PDV com ERP básico, focado em vendas, produtos, clientes, caixa, estoque básico, financeiro básico, dashboard e relatórios simples.

**Motivo:**
Reduzir escopo, validar com usuários reais e evitar complexidade prematura.

**Impacto:**
Funcionalidades fiscais, contábeis, e-commerce, marketplace, CRM avançado, mobile e integrações ficam fora do MVP.

**Observações futuras:**
Reavaliar escopo após validação com os primeiros usuários reais.

---

## DEC-003 — Nichos iniciais

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
O usuário possui empresários na família dispostos a testar o sistema.

**Decisão:**
O ERPell será inicialmente validado em mercados, pet shops e lojas de roupas.

**Motivo:**
Esses segmentos possuem necessidades comuns de venda, cadastro de produtos, clientes, caixa e controle básico de estoque.

**Impacto:**
A base do produto deve ser única, mas preparada para adaptações futuras por segmento.

**Observações futuras:**
Mapear diferenças por segmento quando houver especificação de adaptações.

---

## DEC-004 — Stack backend

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
Era necessário escolher uma stack segura, estável e adequada a ERP/PDV.

**Decisão:**
Usar Java 21 LTS, Spring Boot 3.5.x, Maven via Maven Wrapper, PostgreSQL e Flyway.

**Motivo:**
Java e Spring Boot são robustos para regras de negócio, APIs e sistemas de gestão. O Spring Boot 3.5.x foi escolhido em vez do 4.x por estabilidade e menor risco para o MVP.

**Impacto:**
O backend deve seguir arquitetura por domínio/módulo, com migrations versionadas e validação forte no backend.

**Observações futuras:**
Avaliar migração para versões maiores do Spring Boot após a estabilização do MVP.

---

## DEC-005 — Stack frontend

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
Era necessário criar uma interface moderna, fluida e produtiva.

**Decisão:**
Usar React, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Router, React Hook Form, Zod, TanStack Query, Vitest e Testing Library. Node.js 24 LTS como versão recomendada.

**Motivo:**
Essa stack permite desenvolvimento rápido, UI moderna, validação consistente e boa experiência.

**Impacto:**
O frontend deve ser componentizado, tipado e alinhado aos princípios de UX do ERPell.

**Observações futuras:**
Introduzir Zustand apenas quando houver necessidade real de estado global.

---

## DEC-006 — Desenvolvimento direto na branch develop

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
O projeto está em fase inicial, com um único fundador usando Claude Code e orientação externa.

**Decisão:**
Trabalhar diretamente na branch `develop` durante o desenvolvimento inicial. A `main` representa versão estável. PRs serão usados futuramente principalmente para promover `develop` → `main`.

**Motivo:**
Evitar burocracia prematura e acelerar a fase inicial.

**Impacto:**
Commits devem ser pequenos, claros e em português. Não fazer push, merge ou PR para a `main` sem decisão explícita.

**Observações futuras:**
Adotar branches por feature e PRs formais quando houver mais colaboradores.

---

## DEC-007 — Documentação operacional em Markdown

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
A documentação será consumida por IA e atualizada frequentemente.

**Decisão:**
Usar Markdown dentro do repositório como documentação operacional. PDFs não serão usados para o dia a dia do desenvolvimento.

**Motivo:**
Markdown é mais leve, versionável, modular e adequado para o Claude Code.

**Impacto:**
`docs/` deve concentrar especificações, decisões e módulos.

**Observações futuras:**
Criar `docs/modules/` com especificações por módulo antes de implementações significativas.

---

## DEC-008 — Uso de agentes especializados

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
O projeto terá backend, frontend, segurança, dados, QA, UX e CI/CD.

**Decisão:**
Criar agentes especializados em `.claude/agents/`, separando executores e revisores.

**Motivo:**
Melhorar a qualidade sem depender de uma única execução genérica.

**Impacto:**
Executores implementam. Revisores revisam. Segurança e Dados entram obrigatoriamente em tarefas críticas.

**Observações futuras:**
Avaliar novos agentes conforme o projeto crescer.

---

## DEC-009 — Reviewers read-only neste momento

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
Agentes revisores poderiam executar comandos, mas isso confundiria papéis.

**Decisão:**
Revisores devem ser read-only neste momento. `qa-reviewer` e `ci-cd-reviewer` não usam Bash por enquanto.

**Motivo:**
Manter separação clara entre execução e revisão.

**Impacto:**
Revisores apontam problemas e recomendações, mas não alteram arquivos nem executam comandos.

**Observações futuras:**
Reavaliar a concessão de Bash a revisores específicos, se houver necessidade prática.

---

## DEC-010 — PDV Desktop/offline como possibilidade futura

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
Para mercados, o PDV pode exigir altíssima fluidez e operação tolerante a falhas de internet.

**Decisão:**
PDV Desktop/offline é uma possibilidade futura, mas não faz parte do MVP atual.

**Motivo:**
Manter o MVP simples, mas não fechar portas para um PDV local/offline no futuro.

**Impacto:**
O PDV deve futuramente ser arquitetado com atenção ao isolamento de regras de venda, mas sem implementar app desktop/offline agora.

**Observações futuras:**
Especificar a estratégia de isolamento das regras de venda antes de qualquer iniciativa offline.

---

## DEC-011 — Produtos antes de Serviços

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
O sistema poderia tratar produtos e serviços como uma única entidade, mas isso aumentaria a complexidade e poderia confundir a experiência.

**Decisão:**
Inicialmente, o ERPell trabalhará apenas com produtos físicos. Serviços ficarão fora do escopo inicial e poderão ser tratados futuramente em módulo ou aba separada.

**Motivo:**
Mercados e lojas de roupas precisam principalmente de produtos físicos. Separar serviços reduz a complexidade do MVP.

**Impacto:**
O módulo Produtos não deve implementar serviços agora.

**Observações futuras:**
Especificar o tratamento de serviços quando houver demanda validada (ex.: banho e tosa em pet shops).

---

## DEC-012 — OpenAPI/Swagger para documentação da API

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
A API precisa ser documentada de forma útil para desenvolvimento e testes.

**Decisão:**
Usar OpenAPI/Swagger via springdoc-openapi quando endpoints reais forem implementados.

**Motivo:**
Swagger/OpenAPI facilita testar e entender endpoints do backend.

**Impacto:**
O Swagger documenta a API, mas não substitui a documentação de produto, UX, regras de negócio ou decisões arquiteturais. Deve ser usado inicialmente em desenvolvimento e não exposto em produção sem decisão futura.

**Observações futuras:**
Definir explicitamente a exposição (ou não) do Swagger UI em produção.

---

## DEC-013 — Claude Code como orquestrador principal

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
Com a criação dos agentes, o papel do Claude Code mudou.

**Decisão:**
O Claude Code atua como engenheiro/orquestrador principal, coordenando agentes executores e revisores.

**Motivo:**
Permitir execução mais organizada, com revisão especializada.

**Impacto:**
O Claude Code deve seguir o `CLAUDE.md`, o `AGENTS.md`, o `engineering-guidelines` e o `decision-log` quando aplicável.

**Observações futuras:**
Refinar o fluxo de orquestração conforme o volume de tarefas crescer.

---

## DEC-014 — Protocolo de revisão antes e depois das tarefas

**Data:** 2026-07-01
**Status:** Aceita
**Contexto:**
Havia risco de o Claude Code executar prompts sem avaliar conflitos ou sugestões.

**Decisão:**
O Claude Code deve revisar tarefas antes de executar e classificar sugestões após a execução.

**Motivo:**
Evitar alterações fora do escopo e melhorar a tomada de decisão.

**Impacto:**
Tarefas críticas devem parar para confirmação. Sugestões devem ser classificadas em "aplicar agora", "deixar para depois" ou "fora do escopo".

**Observações futuras:**
Ajustar os critérios de parada conforme a maturidade do projeto.

---

## DEC-015 — Padrão de chave primária interna

**Data:** 2026-07-02
**Status:** Aceita
**Contexto:**
Antes de criar as tabelas de negócio (a começar pela autenticação), era necessário padronizar o tipo de chave primária interna. A migration técnica de baseline (`V1__baseline.sql`) usou `SMALLINT`, adequado apenas para aquela tabela descartável, mas não como padrão do schema.

**Decisão:**
Usar `BIGINT` gerado pelo banco como padrão de chave primária interna das tabelas do ERPell, preferencialmente com `GENERATED BY DEFAULT AS IDENTITY` no PostgreSQL e `Long` no Java.

**Motivo:**
É simples, performático, fácil de debugar, adequado ao MVP e evita complexidade prematura.

**Impacto:**
Novas tabelas de negócio devem usar `BIGINT` como PK interna por padrão. Não replicar o uso de `SMALLINT` da baseline técnica. UUID pode ser considerado futuramente para identificadores públicos ou integrações, mas não será a PK interna padrão neste momento.

**Observações futuras:**
Reavaliar o uso de UUID para identificadores expostos publicamente (URLs, integrações) quando o tema surgir.

**Ressalva de uso (`GENERATED BY DEFAULT AS IDENTITY`):** a escolha de `BY DEFAULT` (em vez de `ALWAYS`) é a que melhor casa com `@GeneratedValue(strategy = IDENTITY)` do Hibernate. Em contrapartida, `BY DEFAULT` permite inserir um `id` explícito, o que pode dessincronizar a sequência interna e causar colisão de PK em inserts futuros. Regra: a aplicação **nunca** deve fornecer o `id` manualmente — deixar sempre o banco gerar; não usar a coluna de identidade para carga de dados com IDs fixos (se for inevitável em algum seed, ressincronizar a sequência).

---

## DEC-016 — Vínculo de usuários com empresa desde o início

**Data:** 2026-07-02
**Status:** Aceita
**Contexto:**
O ERPell é um SaaS de gestão para pequenos negócios. Ao modelar a autenticação, é preciso decidir se o usuário já nasce vinculado a uma empresa/tenant.

**Decisão:**
Usuários devem nascer vinculados a uma empresa/tenant desde a modelagem inicial de autenticação, por meio de `empresa_id` ou equivalente.

**Motivo:**
Mesmo sem implementar multiempresa avançado no MVP, o vínculo entre usuário e empresa evita refatoração estrutural futura.

**Impacto:**
A futura migration de autenticação deve considerar esse vínculo desde o início. Isso não significa implementar multiempresa avançado agora, nem o módulo completo de Empresa além do necessário para suportar a autenticação inicial. Se a criação da autenticação exigir uma estrutura mínima de empresa/tenant, isso deve ser tratado na Etapa 5 com revisão obrigatória do `data-reviewer`, sem expandir para o módulo Empresa completo.

**Observações futuras:**
Definir o módulo Empresa completo em etapa própria, com especificação dedicada.
