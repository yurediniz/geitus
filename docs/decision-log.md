# Registro de Decisões — Geitus

## Objetivo

Este documento registra as **decisões importantes** do projeto Geitus, seus motivos e impactos.

> Nota de rebrand: até 2026-07-14 o projeto se chamava **ERPell** (produto) sob a marca-mãe **UpeFlow**. A partir da **DEC-018**, passou a ter **marca única Geitus**. Menções a "ERPell"/"UpeFlow" no texto histórico de decisões anteriores referem-se ao mesmo projeto.

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
`CLAUDE.md` volta a ser a única fonte de orientação de orquestração. Os agentes especializados continuam definidos em `.claude/agents/` (ver `.claude/agents/AGENTS.md`). Nenhuma regra de produto, escopo, arquitetura ou segurança foi alterada por esta decisão.

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
