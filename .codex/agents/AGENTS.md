# Agentes especializados do ERPell no Codex

Este documento descreve os agentes de projeto do Codex usados para organizar a **execução** e a **revisão** do ERPell. Os agentes ficam em `.codex/agents/*.toml` e são versionados junto com o repositório.

O objetivo é ter uma divisão clara de papéis: quem **implementa** e quem **revisa**, garantindo qualidade, rastreabilidade e aderência ao `AGENTS.md`.

O `AGENTS.md` da raiz prevalece em caso de conflito.

---

## Agentes disponíveis

### Executores (implementam — podem alterar arquivos)

| Agente | Quando usar |
|--------|-------------|
| `back-end-executor` | Implementar backend Spring Boot: controllers, services, DTOs, validações, repositories, migrations Flyway e testes. |
| `front-end-executor` | Implementar frontend React/TypeScript: rotas, formulários, componentes, estados e integração com a API. |

### Revisores (apenas revisam — não alteram arquivos)

| Agente | Quando usar |
|--------|-------------|
| `back-end-reviewer` | Revisar arquitetura, controllers, services, DTOs, validações, repositories, migrations e testes de backend. |
| `front-end-reviewer` | Revisar organização de componentes, tipagem, formulários, estados de loading/erro/sucesso, acessibilidade básica e integração com a API. |
| `product-ux-reviewer` | Revisar telas e fluxos importantes quanto à visão de produto e UX: simplicidade, fluidez, clareza e experiência contextual. |
| `qa-reviewer` | Revisar cenários de teste, critérios de aceite, casos extremos, fluxos quebrados e validações. |
| `security-reviewer` | Revisar autenticação, autorização, JWT, senhas, CORS, permissões, dados sensíveis, variáveis de ambiente, exposição de erros e proteção de rotas. |
| `data-reviewer` | Revisar modelagem, PostgreSQL, migrations, constraints, índices, relacionamentos, integridade, histórico e auditoria. |
| `ci-cd-reviewer` | Revisar GitHub Actions, pipelines e comandos de lint, test, typecheck e build. |

---

## Quem executa e quem apenas revisa

* **Executam e podem alterar arquivos:** `back-end-executor` e `front-end-executor`.
* **Apenas revisam e não alteram arquivos:** `back-end-reviewer`, `front-end-reviewer`, `product-ux-reviewer`, `qa-reviewer`, `security-reviewer`, `data-reviewer` e `ci-cd-reviewer`.

O executor que implementa uma entrega **não deve aprovar** o próprio trabalho. A aprovação deve vir do reviewer correspondente ou dos reviewers obrigatórios da tarefa.

---

## Regras de uso proporcional

* Não acionar todos os reviewers por padrão; usar apenas os agentes necessários para a tarefa.
* `back-end-reviewer` deve revisar entregas relevantes de backend.
* `front-end-reviewer` deve revisar entregas relevantes de frontend.
* `security-reviewer` é **obrigatório** em tarefas de autenticação, autorização, JWT, senhas, permissões, CORS, dados sensíveis e proteção de rotas.
* `data-reviewer` é **obrigatório** em tarefas com banco de dados, migrations, modelagem, constraints, índices ou integridade.
* `product-ux-reviewer` deve revisar telas, fluxos importantes e decisões que afetem a experiência.
* `qa-reviewer` deve revisar testes, critérios de aceite, bugs críticos e fluxos sensíveis.
* `ci-cd-reviewer` deve revisar workflows, pipelines e automações.
* Auditorias completas com múltiplos reviewers devem ser reservadas para marcos importantes ou tarefas críticas.

---

## Observações operacionais

* Os agentes do Codex são definidos em `.codex/agents/*.toml`.
* `qa-reviewer` e `ci-cd-reviewer` são read-only neste momento e não executam comandos.
* Revisores devem ser objetivos, focar riscos reais e evitar repetir análise extensa quando a tarefa for simples.
* Executores devem evitar planos longos quando a tarefa for pequena e clara.
* O modo econômico de contexto do `AGENTS.md` também se aplica aos agentes: consultar apenas documentos relevantes para a tarefa e não transformar ajustes pequenos em auditorias completas.
* As regras de produto, arquitetura, Git, segurança, documentação e qualidade continuam definidas no `AGENTS.md`.
