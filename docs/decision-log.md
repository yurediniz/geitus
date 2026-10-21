# Registro de Decisões — Geitus

## Objetivo

Este documento registra as **decisões importantes** do projeto Geitus, seus motivos e impactos.

> Nota de rebrand: até 2026-07-14 o projeto se chamava **ERPell** (produto) sob a marca-mãe **UpeFlow**. A partir da **DEC-018**, passou a ter **marca única Geitus**. Menções a "ERPell"/"UpeFlow" no texto histórico de decisões anteriores referem-se ao mesmo projeto.

Ele existe para que futuras sessões do Claude Code, agentes e pessoas entendam **por que** certas escolhas foram feitas, sem depender do histórico de conversas anteriores.

Este registro complementa o `CLAUDE.md` (produto, escopo e regras), o [`docs/engineering-guidelines.md`](engineering-guidelines.md) (padrões técnicos) e o [`.claude/agents/cto.md`](../.claude/agents/cto.md) (orquestração e papéis de execução e revisão).

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

> **Substituída pela DEC-018** (2026-07-14): o projeto passou a ter **marca única Geitus**, sem distinção entre marca-mãe e produto, e sem os nomes ERPell/UpeFlow. O texto abaixo é mantido como registro histórico; menções a "ERPell"/"UpeFlow" em decisões anteriores referem-se ao mesmo projeto, hoje chamado Geitus.

**Data:** 2026-07-01
**Status:** Substituída (ver DEC-018)
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

---

## DEC-017 — Claude Code como único orquestrador (remoção do Codex)

**Data:** 2026-07-14
**Status:** Aceita
**Contexto:**
Durante as Etapas 6 e 7, o Codex foi usado como segundo orquestrador, com um `AGENTS.md` na raiz (espelho do `CLAUDE.md`) e agentes próprios em `.codex/`. A duplicação dos documentos-guia exigia sincronização manual entre `CLAUDE.md` e `AGENTS.md`, e o drift entre eles já havia começado.

**Decisão:**
O ERPell passa a usar **apenas o Claude Code** como engenheiro/orquestrador principal. O `AGENTS.md` da raiz e o diretório `.codex/` foram removidos do repositório.

**Motivo:**
Eliminar a dupla manutenção de documentos-guia quase idênticos (~1000 linhas espelhadas) e o risco de divergência entre eles, simplificando o fluxo de trabalho.

**Impacto:**
`CLAUDE.md` volta a ser a única fonte de orientação de orquestração. Os agentes especializados continuam definidos em `.claude/agents/` (à época, catalogados em `.claude/agents/AGENTS.md`; hoje em `.claude/agents/cto.md` — ver DEC-021). Nenhuma regra de produto, escopo, arquitetura ou segurança foi alterada por esta decisão.

**Observações futuras:**
Se outra ferramenta de orquestração for adotada no futuro, preferir referenciar os documentos existentes em `docs/` em vez de duplicar o conteúdo do `CLAUDE.md`.

---

## DEC-018 — Marca única Geitus e reorganização de pacotes por domínio

**Data:** 2026-07-14
**Status:** Aceita
**Contexto:**
O projeto adotou a modelagem conceitual de um PDV completo (documento de visão do domínio) e, junto disso, decidiu-se unificar a identidade: não haverá mais distinção entre marca-mãe (UpeFlow) e produto (ERPell). Substitui a DEC-001.

**Decisão:**
- **Marca única "Geitus"** — os nomes ERPell e UpeFlow deixam de existir em todo o repositório (código, banco, documentação, agentes).
- **Raiz do pacote Java:** `com.upeflow.erpell` → **`com.geitus.app`** (reservando `com.geitus.*` para eventuais artefatos futuros, ex.: `com.geitus.fiscal`).
- **Organização por domínio/contexto de negócio** (não por entidade): `iam` (auth+usuário), `company`, `catalog` (produtos), `config`, `shared`; domínios futuros (`pricing`, `customer`, `inventory`, `cashier`, `sales`, `finance`, `fiscal`, `commission`) nascem quando o módulo entrar em desenvolvimento.
- **Banco de desenvolvimento:** `geitus_db`.

**Motivo:**
Simplicidade de marca; a organização por domínio dá coesão, isolabilidade (ex.: o fiscal pode virar artefato próprio) e prepara o terreno para Spring Modulith quando os domínios crescerem.

**Impacto:**
Rebrand mecânico em todo o repositório (Fase 0b), sem mudança de comportamento. As migrations foram tratadas na sequência pela **DEC-020** (consolidação do baseline), que removeu o nome legado do banco enquanto o projeto ainda é pré-produção. A modelagem completa passa a ser o norte de longo prazo, adotada de forma incremental.

**Observações futuras:**
Introduzir Spring Modulith a partir do módulo de Vendas; avaliar `com.geitus.fiscal` como artefato separado quando o subsistema fiscal for implementado.

---

## DEC-019 — Chave primária BIGINT interna + UUID público

**Data:** 2026-07-14
**Status:** Aceita
**Contexto:**
A modelagem de referência usa UUID em todas as entidades; o projeto já usa `BIGINT` identity (DEC-015) na base implementada (empresa, usuário, produtos). Era preciso conciliar sem retrabalhar o que existe.

**Decisão:**
Manter **`BIGINT GENERATED BY DEFAULT AS IDENTITY` como PK interna** (DEC-015 permanece) e adicionar, nas entidades expostas na API, um **identificador público `UUID`** (único, gerado na criação) para uso em URLs e integrações externas. Refina a DEC-015 (que já previa UUID para identificadores públicos como observação futura).

**Motivo:**
Não expõe o id sequencial interno em URLs/integrações e não obriga a migrar as PKs já existentes; aproveita o melhor dos dois (PK performática interna + identificador opaco externo).

**Impacto:**
Novos módulos já nascem com o UUID público. Empresa/Produto recebem o UUID em uma etapa de retrofit dedicada (muda o contrato de URL — não urgente). Onde aplicado, as rotas passam a usar o UUID em vez do `id` numérico.

**Observações futuras:**
Definir se o UUID público entra por migration com `DEFAULT gen_random_uuid()` (pgcrypto) ou gerado na aplicação; padronizar antes do retrofit.

---

## DEC-020 — Consolidação do baseline das migrations (enquanto pré-produção)

**Data:** 2026-07-15
**Status:** Aceita
**Contexto:**
Após o rebrand (DEC-018), sobravam no banco vestígios do nome antigo: uma tabela-marcador técnica `erpell_baseline` (criada só para validar o Flyway) e comentários "ERPell", presos nas migrations `V1__baseline.sql`, `V2__auth_inicial.sql` e `V3__produtos.sql`. A regra usual "migration aplicada é imutável" (protege o checksum do Flyway) levaria a manter esse legado. Mas o projeto ainda é **pré-produção**: não há deploy, não há outros desenvolvedores com bancos próprios, e o único banco (`geitus_db` de desenvolvimento) é **descartável**.

**Decisão:**
Consolidar as três migrations em um **único `V1__baseline.sql` limpo** (cria `empresa`, `usuario`, `produtos`, com todas as constraints e índices), **remover a tabela `erpell_baseline`** e apagar `V2`/`V3`. O `geitus_db` é recriado do zero.

**Motivo:**
A regra de imutabilidade de migration existe para proteger **bancos que já aplicaram a migration e não podem ser recriados** (produção, ambientes compartilhados). Nada disso existe ainda, então o checksum não é um obstáculo real — e este é o momento mais barato para limpar. Um baseline único e limpo dá um ponto de partida melhor para o schema.

**Impacto:**
Schema idêntico ao anterior (validado pelo `data-reviewer`: tabelas, tipos, FKs, UNIQUEs, CHECKs e índices preservados; `ddl-auto: validate`). Nenhuma mudança de comportamento na aplicação.

**Regra a partir de agora (limite desta decisão):**
Consolidar/editar migrations aplicadas é permitido **apenas enquanto não houver produção nem bancos compartilhados** que não possamos recriar. **A partir do primeiro deploy/base compartilhada, as migrations voltam a ser append-only** (V2, V3, ... aditivas; nunca editar uma já aplicada) — ver a lição registrada em `docs/engineering-guidelines.md`.

---

## DEC-021 — Agente CTO como orquestrador único e adoção de práticas de harness engineering

**Data:** 2026-07-15
**Status:** Aceita
**Contexto:**
A orquestração estava descrita de forma difusa: o `CLAUDE.md` dizia que o Claude Code atuava como "engenheiro e orquestrador principal", e o processo (quem executa, quem revisa, revisores obrigatórios, fluxo) vivia no `.claude/agents/AGENTS.md`, separado do catálogo do time. Com a instalação do plugin **Superpowers**, surgiu a oportunidade de formalizar um orquestrador explícito que usasse suas skills. Restrição de arquitetura: no Claude Code, **um subagente não dispara outros subagentes** de forma confiável — quem dispara é a sessão de topo.

**Decisão:**
- Criar o **`.claude/agents/cto.md`**: o **CTO**, orquestrador principal e **ponto de entrada único** — persona **encarnada pela sessão de topo** (não é para ser invocado como subagente). Toda tarefa começa nele (triagem → planeja → delega → verifica) e termina nele (relatório estruturado), com esforço **proporcional** ao tamanho/risco.
- **Fundir o `AGENTS.md` no `cto.md`** (catálogo do time + protocolo de orquestração num só arquivo) e **remover** o `.claude/agents/AGENTS.md`. Todas as referências vivas foram reapontadas para `cto.md`.
- O CTO usa skills do **Superpowers** no seu método: `brainstorming`, `writing-plans`, `dispatching-parallel-agents`, `verification-before-completion`, `requesting-code-review`, `systematic-debugging`.
- Adotar **práticas de harness engineering** como padrão dos agentes e processos: ponto de entrada único, contexto auto-contido por dispatch, ferramentas mínimas por agente, loops de verificação com evidência antes de asserção, saída estruturada e esforço proporcional.

**Motivo:**
Um orquestrador explícito e único elimina a orquestração difusa e a duplicação entre `AGENTS.md` e `CLAUDE.md`; a persona no topo respeita a restrição de subagentes; as práticas de harness engineering tornam a execução mais previsível e auditável.

**Impacto:**
`CLAUDE.md` passa a apontar o `cto.md` como manual de operação e ponto de entrada; `AGENTS.md` deixa de existir. Nenhuma regra de produto, escopo, segurança ou arquitetura de código foi alterada — só a forma de orquestrar. Referências atualizadas em `CLAUDE.md`, `README.md`, `docs/engineering-guidelines.md`, `docs/decision-log.md` e `docs/modules/README.md`.

**Observações futuras:**
**Remodelar os demais agentes** (executores e revisores) e os arquivos-guia para seguir as práticas de harness engineering, após fechar um checklist curto de padronização. A inspiração de estrutura veio de um `cto.md` de outro projeto (stack Vercel/Next/Prisma), do qual foram adaptados apenas os padrões (autonomia, triagem, dispatch auto-contido, relatório estruturado, padrões transversais fiscalizados) — descartando o que era específico daquele stack.

---

## DEC-022 — Divisão de responsabilidade dos guias: `CLAUDE.md` (o quê) × `cto.md` (o como)

**Data:** 2026-07-16
**Status:** Aceita
**Contexto:**
Após a remodelagem dos agentes (DEC-021), o `CLAUDE.md` — documento **lido em toda tarefa** — ainda repetia o **processo de orquestração** que já vivia no `cto.md`: roteamento de reviewers (em "Agentes especializados" e "Uso proporcional de agentes"), "parar e pedir confirmação" (no "Protocolo de execução" e na Parte 8 do `cto.md`), formato de relatório/classificação (no "Protocolo" e no "Padrão de resposta") e proporcionalidade/economia (em quatro seções + `cto.md`). O próprio "Modo econômico de contexto" era uma lista verbosa de meta-instruções paga em todas as tarefas — contraditório com a economia que pregava. Duplicação em documento sempre carregado custa tokens e gera drift (como já ocorreu com o antigo `AGENTS.md`).

**Decisão:**
Adotar uma divisão clara de responsabilidade entre os guias, com **cada regra em um único lugar**:
- **`CLAUDE.md` = o "quê"**: produto, escopo do MVP, regras de negócio, stack, padrões e as **regras que prevalecem** (a lista canônica "Deve parar e pedir confirmação", a classificação de sugestões, os revisores obrigatórios, "economia não dispensa validações/revisores", "conflito → `CLAUDE.md` prevalece").
- **`cto.md` = o "como"**: triagem, autonomia, roteamento de agentes, regras do time, dispatch auto-contido, verificação e formato de relatório.
- Deduplicar o `CLAUDE.md` contra o `cto.md`: condensar "Modo econômico de contexto" a um princípio; reduzir "Fluxo de trabalho", "Uso proporcional de agentes" e as "Regras de uso" dos agentes a ponteiros; manter no "Protocolo de execução" apenas o que prevalece. O `cto.md` (Parte 8) passa a **apontar** para a lista canônica do `CLAUDE.md`.

**Motivo:**
Otimização de desempenho (harness engineering): o documento sempre carregado fica mais enxuto (~75 linhas a menos), sem perder nenhuma regra; a economia real passa a vir da **estrutura** (docs modulares, dispatch auto-contido, `CLAUDE.md` menor), não de uma política verbosa lida em toda tarefa. Menos duplicação = menos drift.

**Impacto:**
Nenhuma regra de negócio, escopo, segurança ou padrão técnico foi perdida — apenas movida para um único dono e referenciada nos demais. Títulos de seção do `CLAUDE.md` foram preservados para não quebrar referências (`cto.md`, `engineering-guidelines`). Arquivos tocados: `CLAUDE.md`, `.claude/agents/cto.md`.

**Observações futuras:**
Corte opcional maior (não feito agora): reduzir as **diretrizes de módulo** no `CLAUDE.md` (Produtos/PDV/Caixa/Clientes/Financeiro) a resumos + ponteiro, movendo o detalhe para specs próprias em `docs/modules/` (várias ainda não existem). Avaliar quando cada módulo entrar em desenvolvimento.

---

## DEC-023 — Princípios Geitus de domínio (PDV) e norte de longo prazo

**Data:** 2026-07-16
**Status:** Aceita
**Contexto:**
Adotamos a modelagem conceitual completa do PDV Geitus (~49 entidades, fluxos, capacidades e regras) como **norte de longo prazo** (ver DEC-018), a ser seguido de forma **incremental**. Faltava (a) um documento de visão curado desse norte e (b) a formalização dos princípios que regem como cada módulo é construído.

**Decisão:**
- Criar o **`docs/visao-dominio-pdv.md`**: visão de domínio **curada por contexto** (identidade/organização, catálogo, preços, clientes, estoque, caixa, vendas/PDV, financeiro, fiscal, comissões, transversais), marcando **MVP × futuro** e reconciliando com as decisões do projeto (PK BIGINT interno + UUID público — DEC-015/019; isolamento por empresa — DEC-016). É norte, **não** escopo do MVP (o `CLAUDE.md` prevalece no escopo).
- Formalizar os **princípios Geitus** como decisão do projeto:
  1. Venda como agregado central;
  2. Produto como elemento contínuo (capacidades calculadas, não "completo/incompleto");
  3. **Movimentos como fonte de verdade** (saldos derivados de movimentos imutáveis; correção por estorno/ajuste);
  4. **Snapshots na venda** (o item congela os dados usados);
  5. **Capacidades progressivas** (exigir só o necessário à ação/capacidade em uso);
  6. **Idempotência** da conclusão e suas consequências;
  7. **Separação comercial × fiscal** (falha fiscal não apaga a venda; fiscal é subsistema à parte);
  8. Conclusão **transacional** + eventos internos;
  9. Concorrência de estoque controlada;
  10. Histórico imutável (cancelamento/devolução/estorno/ajuste).

**Motivo:**
Dar um destino claro e consultável para cada módulo nascer alinhado, sem inflar o MVP. Os princípios evitam decisões locais que comprometeriam consistência (ex.: editar saldo em vez de gerar movimento; não congelar snapshot na venda).

**Impacto:**
Nenhuma implementação agora — é documentação/norte. Os módulos futuros (Clientes → Caixa → PDV → Estoque → Financeiro) seguem estes princípios; `data-reviewer` e `product-ux-reviewer` passam a checá-los quando aplicável. Fiscal, comissões, variações, lote/série, preços/promoções e multiloja permanecem faseados.

**Observações futuras:**
Direções arquiteturais registradas no doc de visão (Spring Modulith a partir de Vendas; eventos internos; máquina de estados; motor de capacidades; motor de regras; modo offline do PDV; observabilidade) — avaliar em cada etapa. A relação Empresa/Usuário e a dispensa do `Estabelecimento` (cada unidade = Empresa) foram definidas na **DEC-024**.

---

## DEC-024 — Relação Empresa × Usuário: identidade global, vínculo M:N e unidade = Empresa

**Data:** 2026-07-16
**Status:** Aceita
**Contexto:**
A modelagem de referência organiza multiloja como Empresa → Estabelecimento → Terminal (uma Empresa com várias unidades). O Geitus atual tem `usuario.empresa_id` **único** (1 usuário → 1 empresa, DEC-016). Precisávamos definir como tratar multiunidade e múltiplos acessos, evitando a complexidade fiscal de Matriz/Filial, que **não** está no escopo.

**Decisão:**
- **Usuário = identidade global** (um e-mail/login, uma senha). Loga uma vez.
- **Cada unidade/loja/filial é uma Empresa própria e isolada.** O Geitus **não** usa a entidade `Estabelecimento` nem a relação Matriz/Filial. Onde a modelagem referencia `estabelecimento_id`, no Geitus vale `empresa_id`; `TerminalPDV`/`Caixa` penduram na Empresa quando o PDV entrar.
- **Vínculo Usuário↔Empresa (M:N):** uma associação carrega o **perfil e o status por empresa**. Um usuário pode ser **ADMIN** (responsável da Empresa, acima de todos) em uma e **operador** em outra.
- **Login → seleção de Empresa ativa:** um único vínculo entra direto (tela adiantada); vários vínculos exibem uma tela de seleção. A Empresa ativa é o tenant da sessão.
- **Sessão/segurança (refina a DEC-016):** o token carrega a **Empresa ativa** (reemitido na seleção) + o perfil do usuário nela; o backend **valida o vínculo** em toda requisição; acesso a Empresa sem vínculo → **404**. O isolamento por empresa continua valendo, agora pela Empresa ativa selecionada.

**Motivo:**
Tratar cada unidade como Empresa isolada evita a complexidade fiscal de Matriz/Filial (fora do escopo) e mantém o multi-tenant limpo; o vínculo M:N + seleção pós-login é o padrão consagrado de SaaS (troca de workspace) e serve bem ao pequeno negócio com mais de uma loja.

**Impacto:**
Refina a **DEC-016** (empresa deixa de ser "a única do usuário" e passa a ser "a Empresa ativa selecionada, validada por vínculo"). Muda o modelo atual: `usuario.empresa_id` único evoluirá para **usuário (identidade) + vínculo usuário–empresa** (perfil por empresa), exigindo migration + refactor de auth (token com empresa ativa) e uma tela de seleção no frontend — **não agora** (registrado só como norte na Fase 1; implementação agendada para a maturação do módulo de Usuários). Consequência: relatório consolidado entre unidades de um mesmo dono exigirá agregação cross-empresa no futuro.

**Observações futuras:**
Quando implementar: modelar `usuario` (identidade global, e-mail único global) + `usuario_empresa` (usuario_id, empresa_id, perfil, status); ajustar o login para o fluxo de seleção; o `security-reviewer` é **obrigatório** (mudança no modelo de autenticação/autorização) e o `data-reviewer` na migration. A migration deve **preservar dados**: popular `usuario_empresa` a partir do par atual `usuario.empresa_id` + `usuario.perfil` **antes** de remover essas colunas (sem exclusão física). O modelo atual é **N:1** (não 1:1): `usuario.empresa_id` não é único.

## DEC-025 — RBAC de Produtos: escrita exige ADMIN, leitura livre

**Data:** 2026-07-23
**Status:** Aceita
**Contexto:**
Na auditoria de maturação do módulo Produtos, os endpoints de escrita (cadastrar, atualizar, inativar, reativar) exigiam apenas autenticação — qualquer perfil, inclusive OPERADOR, podia alterar cadastro, **preço e custo** de produtos. A spec de Produtos não restringia por perfil, mas Empresa (`PATCH /api/empresas/minha`) e Usuários (`/api/usuarios/**`) já tratam escrita como **ADMIN-only**.

**Decisão:**
- **Escrita em Produtos exige `ADMIN`:** `POST /api/produtos` e `PATCH /api/produtos/**` (dados, inativar, reativar) → `hasRole("ADMIN")`.
- **Leitura livre a qualquer autenticado:** `GET /api/produtos` e `GET /api/produtos/{id}` seguem apenas autenticados. OPERADOR vê o catálogo, mas não o altera.
- **Frontend:** a rota `/produtos` continua acessível a qualquer autenticado; o **controle é na página** (modo leitura para OPERADOR: ações escondidas + aviso), espelhando o padrão de Empresa (não usa `AdminRoute`).

**Motivo:**
Alinha Produtos ao padrão já consolidado (Empresa/Usuários) e protege dados sensíveis de gestão (preço/custo) de alteração por operador de PDV. Backend continua sendo a autoridade (o modo leitura do frontend é só UX).

**Impacto:**
Mudança localizada no `SecurityConfig` (matchers por método) + testes de controller (OPERADOR → 403 em escrita; ADMIN → 200). Frontend ganha modo leitura para OPERADOR. Conecta com a futura regra de histórico de alteração de preço/custo.

## DEC-026 — Conflito de unicidade padronizado em HTTP 409 + mapeamento global de DataIntegrityViolationException

**Data:** 2026-07-23
**Status:** Aceita
**Contexto:**
SKU/código de barras duplicado em Produtos retornava **400**, enquanto CNPJ (Empresa) e e-mail (Usuários) retornavam **409 CONFLICT**. Além disso, havia a janela TOCTOU (DT-015): entre a checagem `existsBy...` e o `save`, duas requisições concorrentes escapavam da validação e a segunda gravação emergia como `DataIntegrityViolationException` → **500** em vez de 409.

**Decisão:**
- **Conflito de unicidade retorna 409** em todo o backend: SKU/código de barras duplicado em Produtos passa de 400 → **409** (via exceção de conflito nomeada, mantendo `RegraDeNegocioException` → 400 para nome/preço/custo/estoque).
- **Mapear `DataIntegrityViolationException` → 409** no `GlobalExceptionHandler`, com mensagem genérica de conflito (sem vazar detalhe de banco). Cobre a corrida TOCTOU em Produtos, Empresa e Usuários de uma vez.

**Motivo:**
Consistência de contrato entre módulos (o cliente/frontend trata conflito de unicidade da mesma forma em todo lugar) e correção do status na corrida concorrente. Fecha o débito **DT-015**.

**Impacto:**
Ajuste no `GlobalExceptionHandler` + exceção de conflito no `catalog`; testes de Produtos atualizados (duplicidade → 409). Spec `produtos.md` atualizada (400 → 409). **Resolve DT-015.**

## DEC-027 — Adoção de Testcontainers para testes de integração de repositório

**Data:** 2026-07-23
**Status:** Aceita
**Contexto:**
As queries de repositório (isolamento por empresa, unicidade por empresa, busca case-insensitive) eram validadas apenas contra mocks (`@WebMvcTest`+`@MockBean`, `@Mock` do repositório) e por smoke manual do CTO contra o `geitus_db`. A lição do `lower(bytea)` (bug de SQL só reproduzível contra Postgres) mostrou que mocks não pegam esses defeitos. Débito registrado como **DT-019**.

**Decisão:**
- **Adotar Testcontainers** (dependência de teste, versão gerenciada pelo Spring Boot) para testes de integração de repositório contra **Postgres real**.
- Primeiro alvo: `ProdutoRepositoryIT` (`@DataJpaTest` + `@Testcontainers` + `PostgreSQLContainer`), cobrindo isolamento cross-empresa, busca case-insensitive (nome/SKU/código), filtro `ativo` e unicidade/NULLs que não colidem.

**Motivo:**
Fechar a lacuna de cobertura das queries — justamente as garantias mais críticas da spec (isolamento e unicidade por empresa) — com testes automáticos contra o banco real, não presumidos por mock. Fecha o débito **DT-019** para Produtos.

**Impacto:**
Nova dependência de teste (Testcontainers) e requisito de **Docker disponível no ambiente de teste/CI**. Padrão reutilizável para os próximos módulos com queries (Vendas/Estoque). **Resolve DT-019** (para o módulo Produtos; estende-se aos demais conforme forem cobertos).

## DEC-028 — Incremento cadastral do Produto (campos + derivados) alinhado à modelagem

**Data:** 2026-07-24
**Status:** Aceita
**Contexto:**
A maturação anterior de Produtos foi auditoria/endurecimento (RBAC, 409, Testcontainers) sem incrementar campos — diferente de Empresa e Usuários, que absorveram partes da modelagem conceitual do PDV (`geitus_pdv_modelagem_completa.md`). O `Produto` tinha ~10 campos; a modelagem descreve um Produto muito mais rico, com grupos progressivos de capacidades. Decidiu-se um incremento **equilibrado** (utilidade imediata + hints estruturais de baixo custo), respeitando a filosofia da própria modelagem ("obrigatório só o necessário para uma venda comum; campos extras só quando a capacidade for usada").

**Decisão:**
- **Migration V4 (aditiva, nullable):** adiciona à tabela `produtos` as colunas `marca VARCHAR(100)`, `descricao VARCHAR(1000)`, `estoque_maximo NUMERIC(12,3)`, `ponto_reposicao NUMERIC(12,3)` e `preco_minimo NUMERIC(12,2)`, com CHECKs `>= 0` (nullable-safe) nos numéricos. V1/V2/V3 intactas.
- **Derivados (sem coluna):** a `ProdutoResponse` calcula `markup` = (preço − custo)/custo × 100 e `margem` = (preço − custo)/preço × 100, quando há custo; `null` caso contrário (e `markup` `null` quando `custo = 0`). Alinha ao princípio "calcular automaticamente".
- **Validações:** não-negativos nos novos numéricos + **cruzadas** (quando ambos informados): `preco_minimo ≤ preco_venda` e `estoque_maximo ≥ estoque_minimo` (igualdade permitida), no service (não como CHECK de banco).
- **Frontend:** `marca` nos campos comuns; preço mínimo/estoque máximo/ponto de reposição/descrição no bloco avançado; margem/markup exibidos na lista (só quando há custo).

**Motivo:**
Aproxima o Produto da modelagem com utilidade imediata para os segmentos-alvo (marca, descrição) e prepara o terreno para Estoque/PDV (hints), sem trazer a complexidade de ERP/fiscal. Mudança aditiva e de baixo risco.

**Impacto:**
Migration V4 + entidade/DTO/service/response + frontend + testes (incl. `ProdutoRepositoryIT` contra Postgres). `data-reviewer` acionado (migration). **Fora do escopo (norte futuro):** status como enum de ciclo de vida (fica o booleano `ativo`), fiscal (NCM/CEST/origem/CFOP/CST/IBS/CBS), variações e atributos, lote/série/validade, multi-estoque, tabelas de preço/promoções, imagem/upload, peso/dimensões, marca/categoria como entidades, múltiplos códigos/GTIN/PLU, campos de serviço.

## DEC-029 — Módulo Clientes: RBAC de escrita aberta, CPF único por empresa e primeiro UUID público

**Data:** 2026-10-20
**Status:** Aceita
**Contexto:**
A etapa 9 (Clientes) cria o domínio `customer`. O cliente é opcional na venda e precisa ser cadastrado rapidamente no balcão — inclusive por operadores. É também o primeiro módulo novo depois da DEC-019, que previa UUID público para entidades expostas, mas deixava em aberto a forma de geração. Os validadores de CPF/telefone existiam apenas em `company.validation`.

**Decisão:**
- **RBAC:** cadastrar e editar clientes é permitido a qualquer usuário autenticado (ADMIN ou OPERADOR); **inativar/reativar exige ADMIN**. Leitura livre a autenticados.
- **Documento:** apenas **pessoa física** nesta etapa; CPF opcional, validado por dígitos e **único por empresa** (`UNIQUE (empresa_id, cpf)`; duplicado → 409, DEC-026).
- **Contato:** um telefone principal + indicador `telefone_e_whatsapp` (padrão `true`); coluna `whatsapp` só quando o número for diferente; a API expõe o WhatsApp **resolvido**. Telefones não são únicos.
- **UUID público (aplica e fecha a observação da DEC-019):** gerado **na aplicação** (`UUID.randomUUID()`) na criação, coluna `UUID NOT NULL UNIQUE` com `DEFAULT gen_random_uuid()` como rede de segurança (nativo no PostgreSQL 13+, sem pgcrypto). Rotas usam o UUID (`/api/clientes/{id}` com `id` = UUID); o id `BIGINT` nunca é exposto. Padrão para os próximos módulos e para o retrofit de Empresa/Produtos.
- **Validadores compartilhados:** `Cpf`, `Cnpj`, `Telefone` (anotações/validators), `Documentos` e `Telefones` saem de `company.validation` para **`shared.validation`**.

**Motivo:**
Operação rápida no balcão sem depender do dono, mantendo com o ADMIN a ação que afeta o PDV (inativação); evitar duplicidade pelo único identificador forte disponível (CPF); "cadastrar uma vez" no contato; fechar a pendência do UUID com uma regra simples e testável; e eliminar acoplamento entre domínios antes do Spring Modulith.

**Impacto:**
Migration `V5__clientes.sql`, pacote `customer` (entidade, repository, service, controller, DTOs), matchers no `SecurityConfig`, `ClienteRepositoryIT` (Testcontainers), página `/clientes` no frontend e refatoração de pacote dos validadores (sem mudança de comportamento). Spec: `docs/modules/clientes.md`. Revisores obrigatórios: `data-reviewer` e `security-reviewer`.

**Observações futuras:**
Pessoa jurídica, endereço, e-mail e data de nascimento entram quando uma capacidade exigir (fiscal, entrega, relacionamento). Paginação da listagem registrada como DT-020.

## DEC-030 — Evolução do cadastro de produtos em 6 fases (amplia o escopo do MVP de Produtos)

**Data:** 2026-10-20
**Status:** Aceita
**Contexto:**
Para o uso diário de um comércio, o cadastro de produtos (texto livre para categoria e unidade, um código de barras, sem promoções nem estoque) ficou insuficiente. O usuário pediu um cadastro mais completo, **sem nada fiscal**. Vários itens pedidos estavam explicitamente fora do escopo registrado: `produtos.md` §3 (promoções/tabela de preços) e a DEC-028 (categoria/unidade como entidades, múltiplos códigos). O estoque com movimentações é a etapa 12 da ordem do `CLAUDE.md`, e o PDV (etapa 11) ainda não existe.

**Decisão:**
- Ampliar o escopo de Produtos, executado em **6 fases**, cada uma com spec → plano → execução → revisão:
  - **A** — Categorias hierárquicas e Unidades de medida (cadastros próprios, migração dos textos).
  - **B** — Identificação (nome curto, SKU automático, múltiplos códigos de barras com validação EAN-8/EAN-13/UPC-A, fornecedor principal, autocomplete) e formulário em abas.
  - **C** — Preços (promocional com vigência, atacado por quantidade mínima, histórico de custo/preço, margem → preço, máscara pt-BR).
  - **D** — Estoque básico **antecipado** (flag "controla estoque", movimentos imutáveis como fonte de verdade, ajuste com motivo, indicadores) — cumpre parte da etapa 12.
  - **E** — Listagem (paginação no servidor, busca em tempo real sem acento, ordenação, filtros, estado na URL).
  - **F** — Imagem do produto (PostgreSQL, comprimida no navegador).
- Regras "na venda" (fracionamento, preço vigente promocional/atacado, busca por qualquer código) entram como **regras de domínio testadas**, consumidas quando o PDV existir.
- Busca sem acento por **coluna normalizada** mantida pela aplicação (sem extensão `unaccent`).
- **Exclusão física de produto** permitida apenas quando nunca houve movimentação/venda; caso contrário, só inativação.
- Códigos de barras e SKU continuam **únicos por empresa** (multi-tenant, DEC-016).
- Continua **fora**: fiscal (NCM, CFOP, CST, impostos), variações/grade, lote/série/validade, múltiplos estoques, marca e fornecedor como entidades.

**Motivo:**
Decisão do usuário para tornar o produto útil ao comércio desde o MVP, mantendo o fiscal à parte. A divisão em fases mantém cada entrega pequena, testável e revisável, e respeita "primeiro funcionar bem" do `CLAUDE.md`.

**Impacto:**
Substitui, para Produtos, os itens correspondentes de "fora do escopo" de `produtos.md` §3 e da DEC-028. Antecipa parte da etapa 12 antes da etapa 10 (Caixa). Cada fase registra suas decisões de modelagem em DEC própria (a Fase A na DEC-031).

**Observações futuras:**
Revisar a ordem do `CLAUDE.md` ("Ordem recomendada de desenvolvimento") ao concluir a Fase D, já que parte do Estoque básico terá sido entregue.

## DEC-031 — Categorias hierárquicas e Unidades de medida por empresa (Fase A)

**Data:** 2026-10-20
**Status:** Aceita
**Contexto:**
Primeira fase da DEC-030. Categoria e unidade eram texto livre no produto, com variações do mesmo valor e sem noção de hierarquia ou de quantidade fracionada.

**Decisão:**
- **Unidades de medida por empresa** (`unidades_medida`): sigla única por empresa (maiúscula, até 20), descrição, `fracionada`, `ativo`; 10 padrões (UN, KG, G, L, ML, M, CX, PCT, DZ, FD — fracionadas: KG, G, L, ML, M) semeados para cada empresa. Exclusão só sem uso.
- **Categorias em árvore** (`categorias` com `parent_id`), profundidade ilimitada; nome único entre irmãos sem diferenciar maiúsculas; ciclos impedidos no service; exclusão física só sem subcategorias e sem produtos; inativação **sem cascata** (o ramo sai do seletor, nada é alterado).
- **Produto:** `unidade_id` obrigatório, `categoria_id` opcional (qualquer nível), `unidade_compra_id` + `fator_conversao` (ambos ou nenhum).
- **Migração V6** converte os textos atuais (com sinônimos de unidade e deduplicação sem diferenciar maiúsculas/espaços), atribui UN a produtos sem unidade e **preserva** as colunas de texto antigas até a Fase B.
- Identificador público UUID nas novas entidades (DEC-019/029). Escrita ADMIN, leitura livre (padrão DEC-025).

**Motivo:**
Unidades por empresa dão autonomia sem cadastro global a manter; árvore com `parent_id` é o modelo mais simples que atende profundidade ilimitada; inativação sem cascata é reversível; preservar as colunas antigas protege contra erro de migração.

**Impacto:**
Migration V6, entidades e telas novas em `catalog`, mudança no contrato da API de produtos (`categoria`/`unidade` passam de texto a objetos; request com `unidadeId`/`categoriaId`). Spec: `docs/modules/categorias-e-unidades.md`.

**Observações futuras:**
Remover `produtos.categoria`/`produtos.unidade` na Fase B; revalidar a troca de `fracionada` quando houver estoque (Fase D).
