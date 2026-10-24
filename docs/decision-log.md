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

## DEC-032 — Identificação do produto e formulário em abas (Fase B)

**Data:** 2026-10-21
**Status:** Aceita
**Contexto:**
Segunda fase da DEC-030. O produto tinha um único código de barras, sem nome curto, sem geração de SKU, sem exclusão e com o id numérico exposto na API (o retrofit de UUID previsto na DEC-019 ainda não tinha sido feito). O formulário inline na lista ficou grande demais para receber as abas pedidas.

**Decisão:**
- **Múltiplos códigos de barras** em `produto_codigos_barras` (0–20 por produto), únicos **por empresa**; formato detectado pelo conteúdo — EAN-8/UPC-A/EAN-13 (só dígitos, 8/12/13) exigem dígito verificador válido (400 se inválido); outros formatos são aceitos como `OUTRO`, com aviso na tela.
- **Nome curto** opcional (até 30); `nomeCurtoEfetivo` = nome curto ou os 30 primeiros caracteres do nome.
- **SKU sugerido** no padrão `P` + 6 dígitos por empresa (maior existente + 1), sem reserva; unicidade garantida no salvar (409).
- **Marca e fornecedor principal** em texto, com autocomplete dos valores já usados na empresa.
- **Exclusão física** de produto (ADMIN) só quando nunca houve venda/movimentação — verificação centralizada em `podeExcluir`, estendida nas Fases C/D; códigos saem em cascata.
- **UUID público do produto** (retrofit da DEC-019): rotas por UUID; id numérico deixa de ser exposto.
- **Formulário em página própria** (`/produtos/novo`, `/produtos/:id`) com abas Geral, Preços, Estoque, Códigos (Histórico nas Fases C/D), "Salvar e cadastrar outro" e aviso de alterações não salvas.
- **Migration V7** cria a tabela de códigos, migra o código atual, preenche os UUIDs e remove as colunas de texto antigas (`categoria`, `unidade`) e `codigo_barras`.

**Motivo:**
Atende o pedido de identificação completa sem fiscal; códigos por empresa preservam o isolamento (DEC-016); UUID antes de Preços/Estoque/PDV evita retrabalho; a página própria dá espaço às abas e permite proteger alterações não salvas.

**Impacto:**
Contrato da API de produtos muda (UUID, `codigosBarras`, `nomeCurto`, `fornecedor`, `podeExcluir`); frontend reorganizado em rotas novas. Spec: `docs/modules/produtos-identificacao-e-formulario.md`. Revisores obrigatórios: `data-reviewer` (V7) e `security-reviewer` (DELETE, UUID, rotas novas).

**Observações futuras:**
GTIN-14 com validação própria, código "principal" explícito e fornecedor como cadastro ficam para quando houver necessidade.

## DEC-033 — Preços do produto: promoção, atacado e histórico (Fase C)

**Data:** 2026-10-21
**Status:** Aceita
**Contexto:**
Terceira fase da DEC-030. O produto tinha só preço de venda, custo e preço mínimo, com margem/markup derivados. Faltavam promoção com vigência, preço de atacado, histórico de alterações (exigido pelo `CLAUDE.md`, "alteração de preço"), cálculo do preço pela margem e máscara monetária.

**Decisão:**
- **Promoção** por datas (início e fim obrigatórios, inclusivos, fuso `America/Sao_Paulo` via `Clock`) e **atacado** com uma faixa (preço + quantidade mínima > 1), ambos como colunas em `produtos`. Os dois precisam ser menores que o preço de venda e não podem ficar abaixo do preço mínimo.
- **Preço aplicado na venda** = o menor entre normal, promocional vigente e atacado atingido (empate → promocional). É regra de domínio (`PrecoDeVenda.resolver`), sem endpoint, consumida pelo PDV.
- **Histórico** de custo e preço de venda em `produto_historico_precos` (só inserção, valor anterior/novo, usuário, data), incluindo os valores iniciais do cadastro e sem preenchimento retroativo. Leitura para qualquer autenticado.
- **Máscara monetária** que preenche da direita para a esquerda enquanto se digita (1234 → 12,34), em todos os campos de dinheiro do produto.
- **Preço pela margem desejada** calculado só no frontend, sem gravar a margem.
- **Migration V8** aditiva: colunas novas nulas, tabela de histórico e `UNIQUE (empresa_id, id)` em `usuario` para a FK composta.

**Motivo:**
Decisões do usuário (vigência por datas, menor preço vence, uma faixa, histórico de custo/preço, máscara durante a digitação). Colunas no produto e tabela de histórico específica são o modelo mais simples que atende sem preparar futuro não pedido.

**Impacto:**
Contrato da API de produtos ganha `promocao`, `atacado` e `emPromocao`, mais o endpoint `GET /api/produtos/{id}/historico-precos`; aba Histórico no formulário; selo "Promoção" na listagem. Spec: `docs/modules/produtos-precos.md`. Revisores obrigatórios: `data-reviewer` (V8) e `security-reviewer` (endpoint de histórico).

**Observações futuras:**
Várias promoções agendadas, mais faixas de atacado, fuso por empresa e restrição do custo por perfil ficam para quando houver necessidade.

## DEC-034 — Estoque básico antecipado: saldo por movimentações (Fase D)

**Data:** 2026-10-21
**Status:** Aceita
**Contexto:**
Quarta fase da DEC-030, antecipando parte da etapa 12 (Estoque básico). O produto tinha só níveis de referência (mínimo, ponto de reposição, máximo), sem saldo. O `CLAUDE.md` exige estoque calculado por movimentações e a visão de domínio pede movimentos imutáveis, concorrência controlada e idempotência.

**Decisão:**
- Pacote novo `inventory` com `movimentos_estoque` (só inserção, quantidade com sinal, saldo anterior e novo, tipo, motivo, origem, usuário e chave de idempotência) e `estoque_saldos` (saldo ≥ 0 por produto), atualizados na mesma transação com lock `FOR UPDATE`.
- Flag `controla_estoque` em `produtos` (padrão true). Desligar guarda saldo e histórico.
- Tipos Entrada, Saída e "Contar e ajustar para", com motivos por tipo e observação obrigatória em "Outro". Ajuste manual nunca deixa saldo negativo. Só ADMIN ajusta.
- Estoque inicial opcional no cadastro, gravado como a primeira entrada (origem `CADASTRO`).
- Exclusão física só sem movimentos ou quando o único é o estoque inicial do cadastro. FKs RESTRICT de movimentos e saldos para produto (DT-028).
- Produto movimentado não troca de unidade de venda, e unidade usada por produto movimentado não deixa de ser fracionada.
- Situação calculada `SEM_ESTOQUE`/`BAIXO`/`NORMAL` para a listagem.
- Migration V9.

**Motivo:**
Decisões do usuário (bloquear negativo, estoque inicial no cadastro, só ADMIN, lista de motivos, exclusão com só o estoque inicial). Saldo em tabela própria dá leitura barata e consistência garantida no banco, sem misturar catálogo e estoque.

**Impacto:**
Contrato de produtos ganha `controlaEstoque`, `estoqueInicial`, `estoqueAtual` e `situacaoEstoque`. Endpoints novos `POST /api/produtos/{id}/estoque/ajustes` e `GET /api/produtos/{id}/estoque/movimentos`. A aba Histórico ganha a seção Estoque. Spec: `docs/modules/produtos-estoque.md`. Revisores obrigatórios: `data-reviewer` (V9, consistência do saldo) e `security-reviewer` (ajuste só ADMIN, isolamento).

**Observações futuras:**
Baixa por venda, venda sem estoque e reserva entram com o PDV. Custo médio entra com Compras. Revisar a "Ordem recomendada de desenvolvimento" do `CLAUDE.md` ao concluir a fase (DEC-030).

## DEC-035 — Listagem de produtos paginada, com busca sem acento e filtros (Fase E)

**Data:** 2026-10-23
**Status:** Aceita
**Contexto:**
Quinta fase da DEC-030. A lista carregava todos os produtos de uma vez (DT-020), a busca só rodava com botão, sem ignorar acentos nem procurar por marca, e não havia ordenação nem filtros por categoria, estoque ou promoção.

**Decisão:**
- `GET /api/produtos` passa a devolver `PaginaResponse` (25 por página, máximo 100), com `busca`, `status` (`ativos` padrão/`inativos`/`todos`), `categoria` (com descendentes), `estoque` (`baixo` inclui sem estoque/`sem`), `promocao` (vigente hoje) e `ordem` (nome, preço, margem, estoque, recentes, atualizados).
- Consulta de leitura em SQL nativo (`ConsultaDeProdutos`, `NamedParameterJdbcTemplate`) em duas etapas: ids e total, depois os produtos com as relações na mesma ordem. SQL só com fragmentos fixos escolhidos por enums.
- Colunas `busca_normalizada` e `nome_normalizado` mantidas pela aplicação (`TextoDeBusca.normalizar`). A migration V10 preenche os existentes e cria os índices. Sem extensão do PostgreSQL.
- Tela com tabela a partir de 1.024 px (Categoria e Unidade a partir de 1.280 px) e cards abaixo disso, busca enquanto se digita (300 ms, com cancelamento das requisições antigas), páginas numeradas e todo o estado na URL.

**Motivo:**
Decisões do usuário (páginas numeradas, tabela, filtro de estoque, Nome A–Z). A consulta em duas etapas é a forma mais simples de filtrar e ordenar no banco por dados de catálogo, estoque e promoção sem misturar os pacotes.

**Impacto:**
Contrato de `GET /api/produtos` muda de lista para página (o parâmetro `ativo` vira `status`). A `ProdutosListaPage` é reorganizada. Fecha a DT-020 para Produtos. Spec: `docs/modules/produtos-listagem.md`. Revisores obrigatórios: `data-reviewer` (V10, índices, SQL nativo) e `security-reviewer` (montagem do SQL, isolamento).

**Observações futuras:**
Índice de trigramas quando houver dezenas de milhares de produtos por empresa; paginação de Clientes reutilizando `PaginacaoLista`.

## DEC-036 — Número de registro, código do produto, etiqueta de balança e formulário em tela única (Fase B2)

**Data:** 2026-10-23
**Status:** Aceita
**Contexto:**
A loja vende produtos a granel e itens pesados na balança Toledo Prix 4, cuja etiqueta traz o código do produto programado na balança e o valor total. O Geitus não tinha esse código nem um número de registro sequencial por empresa. O formulário em abas da Fase B escondia informação e erros, e a margem e o markup não apareciam nos preços de promoção e de atacado.

**Decisão:**
- **Número** sequencial por empresa (produto e cliente agora, venda no PDV), imutável, gerado por `numeracoes` com incremento atômico na transação da criação. Não é a PK.
- **Código do produto** inteiro de 1 a 999999, opcional, único por empresa, exibido sem zeros; obrigatório com a flag "Vendido na balança" (KG e UN).
- **SKU** inalterado e fora da venda.
- **Configuração da etiqueta de balança** por empresa (padrão do usuário: `2` + código 6 + valor 6 com 3 casas, sem DV), com leitor como regra de domínio, modelos prontos e teste de etiqueta.
- **Formulário do produto em tela única** com atalhos fixos, nesta ordem: Geral (com o Nº), Códigos, Preços, Estoque (com "Unidade e embalagem") e Histórico.
- **Margem e markup** em todos os preços, e calculadora pela margem ou pelo markup, com explicação.
- **Migration V11.**

**Motivo:**
Decisões do usuário em conversa (várias versões do modelo dos códigos até esta). O número fora da PK preserva o isolamento multiempresa e a estabilidade das chaves. O código numérico separado do SKU elimina a ambiguidade na venda.

**Impacto:**
- Contratos de produto e cliente ganham `numero`; o de produto ganha `codigo` e `vendidoBalanca`.
- Endpoints novos `/api/etiqueta-balanca`.
- Aba "Balança" em Produtos.
- Formulário do produto reorganizado.
- Spec: `docs/modules/produtos-codigo-e-balanca.md`.
- Revisores obrigatórios: `data-reviewer` (V11, numeração) e `security-reviewer` (endpoints novos, número imutável).

**Observações futuras:**
- A Fase B3 (embalagens de venda) vem em seguida.
- O PDV usa o leitor da etiqueta, o `código*quantidade` e o `Numerador` da venda.
- Códigos do fornecedor ficam para Compras.

## DEC-037 — Embalagens de venda: um produto, estoque único e lista de embalagens (Fase B3)

**Data:** 2026-10-24
**Status:** Aceita
**Contexto:**
A loja vende o mesmo produto em formas diferentes, cada uma com o seu código de barras e o seu preço (Nexgard Combo: caixa com 3 a R$ 209,90 e unidade a R$ 89,90). O Geitus só tinha a unidade de compra com fator, usada apenas para exibir a conversão. O usuário propôs dois produtos vinculados com estoques sincronizados.

**Decisão:**
- **Um produto, estoque único na unidade de venda, e uma lista de até 10 embalagens.**
  - Cada embalagem tem unidade diferente da de venda, quantidade > 1 (decimal só em unidade de venda fracionada), preço opcional, marca "de compra" (no máximo uma) e até 5 códigos de barras.
- **Unidade de compra vira embalagem:** a unidade de compra + fator deixa de existir e vira a embalagem "de compra" (migração na V12, que para com erro em vez de descartar dado inconvertível).
- **Códigos de barras das embalagens** em `produto_codigos_barras`, com `embalagem_id`. Assim, a unicidade por empresa vale entre unidade e embalagens sem trigger.
- **Preço efetivo:**
  - o preço próprio, que não é afetado pela promoção da unidade;
  - sem preço próprio, quantidade × preço vigente da unidade (com a promoção, se houver);
  - o atacado fica para o PDV.
- **Margem e markup** sobre quantidade × custo; o preço mínimo é conferido por unidade.
- **Histórico:** a alteração do preço próprio entra no histórico de preços (`PRECO_EMBALAGEM`, com o rótulo).
- **Tela:** nova seção "Embalagens" entre Preços e Estoque; o bloco "Unidade e embalagem" sai do Estoque.
- **Ajuste de estoque** em Entrada e Saída pode ser informado em embalagens, com o movimento gravado em unidades e o retrato da embalagem no próprio movimento.
- **Sem código numérico próprio** da embalagem: no PDV, o código do produto lança a unidade e o PDV oferece escolher a embalagem.
- **Migration V12.**

**Motivo:**
Dois produtos sincronizados gerariam estoque fracionado, dois saldos e relatórios divididos. O preço de atacado não resolve o caso, porque baratearia cada unidade. As demais escolhas (seção própria, preço que segue a promoção, ajuste por embalagem, sem código próprio) são decisões do usuário em conversa.

**Impacto:**
- O contrato do produto ganha `embalagens` e perde `unidadeCompraId`, `fatorConversao`, `unidadeCompra` e `conversaoTexto`.
- O ajuste de estoque ganha `embalagemId`.
- Muda o formulário do produto.
- Spec: `docs/modules/produtos-embalagens.md`.
- Revisor obrigatório: `data-reviewer` (V12, migração da unidade de compra, FK composta dos códigos).

**Observações futuras:**
- O PDV lança a embalagem pelo código de barras, aceita linhas de embalagens diferentes na mesma venda e guarda o retrato da embalagem no item.
- A regra para remover uma embalagem já vendida é decidida no PDV.
- Promoção e atacado próprios da embalagem e embalagem inativa ficam para depois.

## DEC-038 — Custo obrigatório na entrada por compra; custo do produto é o último de entrada (Fase B4)

**Data:** 2026-10-24
**Status:** Aceita
**Contexto:**
A entrada de estoque por compra gravava só a quantidade, e o custo do produto era digitado à parte, ficando desatualizado. O usuário pediu que a entrada por compra exija o custo, que ele atualize o custo do produto, e que a tela e o histórico mostrem a origem do custo (entrada ou edição manual).

**Decisão:**
- **Custo exigido:** na entrada manual com motivo Compra, maior que zero. Em embalagem, é o custo de 1 embalagem, como na nota; o custo por unidade é a divisão, com 4 casas no movimento.
- **Custo do produto:** passa a ser o **último custo de entrada**, por unidade e arredondado a centavos, gravado na mesma transação do movimento. Não há custo médio.
- **Origem no produto:** o produto guarda a origem do custo atual (`ENTRADA_COMPRA` ou `EDICAO`) e a data. A tela mostra "Último custo de entrada …" ou "Custo editado manualmente em …".
- **Histórico de preços:** as linhas de custo ganham a origem e, na compra, a ligação com o movimento.
- **Campo vazio:** o custo começa vazio no modal, com a dica do último custo, para obrigar a conferência com a nota.
- **Migration V13:** a obrigação "compra exige custo" fica na aplicação e numa CHECK `NOT VALID` no banco (vale para os movimentos novos; os antigos, sem custo, não são conferidos). O histórico aponta para o movimento do mesmo produto.

**Motivo:**
Decisões do usuário em conversa: o custo é o último preço de entrada e, em embalagem, digita-se o custo da caixa.

**Impacto:**
- O ajuste de estoque ganha `custo`; o movimento ganha `custoInformado` e `custoUnitario`.
- O produto ganha `custoOrigem`; o histórico ganha `origem` e `entrada`.
- Spec: `docs/modules/produtos-custo-entrada.md`.
- Revisor obrigatório: `data-reviewer` (V13).

**Observações futuras:**
- A Fase B5 acrescenta o fornecedor na entrada por compra.
- Compras (NF-e) reaproveita a regra do custo de entrada.

## DEC-039 — Cadastros de Fornecedores e de Fabricantes/Marcas (Fase B5; amplia o escopo do MVP de Produtos)

**Data:** 2026-10-24
**Status:** Aceita
**Contexto:**
Marca e "Fornecedor principal" eram texto livre no produto. O usuário pediu duas abas novas em Produtos:
- **Fornecedores:** os dados do emitente da NF-e, representantes de venda, e as marcas e os produtos que cada um vende;
- **Fabricantes/Marcas:** com a mesma lógica das Categorias.

**Decisão:**
- **Marcas:** árvore livre igual à de Categorias (o primeiro nível costuma ser o fabricante). O produto aponta para qualquer nível (`marca_id`). As marcas em texto viram itens na raiz.
- **Fornecedores:**
  - cadastro com só a razão social/nome obrigatória;
  - CNPJ/CPF validado e único quando informado, IE (ou ISENTO), endereço com busca de CEP, contato e Nº sequencial;
  - até 10 representantes (nome, telefone e e-mail);
  - até 200 marcas que vende;
  - lista de produtos que vende.
- **Fornecedores no produto:** o produto tem vários fornecedores (`produto_fornecedores`, a mesma lista vista dos dois lados), e um deles é o **"Fornecedor da última compra"**. Uma FK composta garante no banco que o último está na lista.
- **Entrada por compra:** ganha o fornecedor opcional, que entra na lista do produto e vira o da última compra.
- **Texto livre:** os campos de texto `marca` e `fornecedor` e as suas sugestões deixam de existir.
- **Migration V14.**

**Motivo:**
Decisões do usuário em conversa: árvore livre, só o nome obrigatório e "Fornecedor da última compra" no lugar de "principal". Cadastrar uma vez e reutilizar (CLAUDE.md, Consistência) prepara a futura entrada de NF-e (Compras) sem implementá-la.

**Impacto:**
- **Escopo:** amplia o escopo do MVP de Produtos com o cadastro de fornecedores; Compras e NF-e continuam fora.
- **Contrato do produto:** troca `marca` e `fornecedor` por `marcaId`, `fornecedorIds` e `fornecedorUltimaCompraId`.
- **Endpoints novos:** `/api/marcas` e `/api/fornecedores`.
- **Telas novas:** as abas Marcas e Fornecedores.
- **Spec:** `docs/modules/fornecedores-e-marcas.md`.
- **Revisores obrigatórios:** `data-reviewer` (V14 e migração do texto) e `security-reviewer` (dados de contato e documento, isolamento e perfis).

**Observações futuras:**
- **Compras:** importação de NF-e (cria ou atualiza o fornecedor pelo CNPJ), preço e código por fornecedor, e contas a pagar.
- **Listagem de produtos:** filtro por marca e por fornecedor.
- **Dados pessoais:** o OPERADOR vê documento (inclusive CPF de fornecedor pessoa física) e contatos, como em Clientes. Mascarar para o OPERADOR fica para quando houver perfis mais granulares (apontado pelo security-reviewer na B5).

## DEC-040 — Imagem do produto no PostgreSQL com URLs assinadas (Fase F)

**Data:** 2026-10-24
**Status:** Aceita
**Contexto:**
A DEC-030 previu a Fase F (imagem do produto no PostgreSQL, comprimida no navegador), e a Fase E reservou para ela a miniatura na lista. O login guarda o JWT no navegador e o envia em cabeçalho, então uma tag `<img>` comum não consegue ler uma rota protegida.

**Decisão:**
- **Uma imagem por produto.** Entra por arquivo, câmera do celular ou arrastar e soltar, e é exibida inteira, sem recorte (decisões do usuário).
- **Compressão no navegador:** o navegador gera a versão grande (até 1200 px e 400 KB) e a miniatura (até 200 px e 40 KB), em WebP, com JPEG quando o WebP não é suportado. O servidor só confere o tipo real, os tamanhos e as dimensões, sem recomprimir e sem biblioteca nova.
- **Banco:** tabela `produto_imagens` separada de `produtos` (V15), com `versao` UUID trocada a cada envio.
- **Entrega por URLs assinadas** (HMAC-SHA256, com o segredo próprio `GEITUS_IMAGEM_SEGREDO`), válidas até o fim do dia UTC seguinte. A rota de leitura não exige JWT e responde com `nosniff` e cache longo. A troca da versão muda a URL.
- **Gravação:** a imagem segue o Salvar da tela do produto. Envio e remoção são só ADMIN.

**Motivo:**
- **URLs assinadas:** permitem `<img>` e cache do navegador sem expor uma rota protegida pelo JWT. As alternativas (buscar com token e criar blob, ou embutir base64 na listagem) eram mais lentas ou pesavam em toda listagem.
- **Tabela separada:** evita carregar bytes nas consultas de produto.

**Impacto:**
- O contrato do produto ganha `imagem`.
- Endpoints novos: `PUT/DELETE /api/produtos/{id}/imagem` e `GET /api/imagens/produtos/...`.
- Segredo novo no `.env`.
- Spec: `docs/modules/produtos-imagem.md`.
- Revisores obrigatórios: `data-reviewer` (V15, bytea) e `security-reviewer` (rota sem JWT, assinatura, upload e tipos de arquivo).

**Observações futuras:**
- O PDV usa a mesma `miniaturaUrl`.
- Armazenamento externo (S3) quando o volume justificar: acompanhar `pg_total_relation_size('produto_imagens')` e avaliar acima de 5 GB. Backups em `pg_dump -Fc`.
- Encerra as 6 fases da DEC-030.
