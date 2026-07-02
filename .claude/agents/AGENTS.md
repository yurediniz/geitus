# Agentes especializados do ERPell

Este documento descreve os agentes de projeto do Claude Code usados para organizar a **execução** e a **revisão** do ERPell. Os agentes ficam em `.claude/agents/` e são versionados junto com o repositório.

O objetivo é ter uma divisão clara de papéis: quem **implementa** e quem **revisa** — garantindo qualidade, rastreabilidade e aderência ao `CLAUDE.md`.

---

## Agentes disponíveis

### Executores (implementam — podem alterar arquivos)

| Agente | Quando usar | Ferramentas |
|--------|-------------|-------------|
| `back-end-executor` | Implementar backend Spring Boot: controllers, services, DTOs, validações, repositories, migrations Flyway e testes. | Read, Write, Edit, Grep, Glob, Bash |
| `front-end-executor` | Implementar frontend React/TypeScript: rotas, formulários, componentes, estados e integração com a API. | Read, Write, Edit, Grep, Glob, Bash |

### Revisores (apenas revisam — não alteram arquivos)

| Agente | Quando usar | Ferramentas |
|--------|-------------|-------------|
| `back-end-reviewer` | Revisar arquitetura, controllers, services, DTOs, validações, repositories, migrations e testes de backend. | Read, Grep, Glob |
| `front-end-reviewer` | Revisar organização de componentes, tipagem, formulários, estados de loading/erro/sucesso, acessibilidade básica e integração com a API. | Read, Grep, Glob |
| `product-ux-reviewer` | Revisar telas e fluxos importantes quanto à visão de produto e UX (simplicidade, fluidez, clareza, experiência contextual). | Read, Grep, Glob |
| `qa-reviewer` | Revisar cenários de teste, critérios de aceite, casos extremos, fluxos quebrados e validações; sugerir testes. | Read, Grep, Glob |
| `security-reviewer` | Revisar autenticação, JWT, senhas, CORS, permissões, dados sensíveis, variáveis de ambiente, exposição de erros e proteção de rotas. | Read, Grep, Glob |
| `data-reviewer` | Revisar modelagem, PostgreSQL, migrations, constraints, índices, relacionamentos, integridade, histórico e auditoria. | Read, Grep, Glob |
| `ci-cd-reviewer` | Revisar GitHub Actions, pipelines e os comandos de lint, test, typecheck e build. | Read, Grep, Glob |

---

## Quem executa e quem apenas revisa

- **Executam (alteram arquivos):** `back-end-executor` e `front-end-executor`.
- **Apenas revisam (não alteram arquivos):** todos os demais (`back-end-reviewer`, `front-end-reviewer`, `product-ux-reviewer`, `qa-reviewer`, `security-reviewer`, `data-reviewer`, `ci-cd-reviewer`).

---

## Regras de uso

### O executor não aprova a própria entrega

O mesmo agente que **implementa** uma tarefa **não deve aprovar** o próprio trabalho. Toda entrega de backend ou frontend deve passar por, no mínimo, o revisor correspondente (`back-end-reviewer` ou `front-end-reviewer`) antes de ser considerada concluída.

### Segurança e Dados em tarefas críticas

- `security-reviewer` **deve obrigatoriamente** revisar qualquer tarefa que envolva **autenticação, autorização ou segurança**.
- `data-reviewer` **deve obrigatoriamente** revisar qualquer tarefa que **altere o banco de dados ou as migrations**.

### Produto/UX em telas e fluxos

- `product-ux-reviewer` **deve revisar telas e fluxos importantes**, protegendo a simplicidade e a experiência do ERPell — evitando soluções complexas demais, genéricas demais ou com cara de ERP antigo.

### CI/CD em automações

- `ci-cd-reviewer` **deve revisar** sempre que um **workflow ou automação** for criado ou alterado (GitHub Actions, lint, test, typecheck, build).

---

## Fluxo recomendado

1. Definir a tarefa e consultar o `CLAUDE.md` (e a spec do módulo em `docs/`, se existir).
2. Um **executor** implementa a menor parte funcional possível.
3. O **revisor** correspondente revisa a entrega.
4. Aplicar revisores obrigatórios conforme a natureza da tarefa:
   - Mexeu em **segurança/autenticação** → `security-reviewer`.
   - Mexeu em **banco/migrations** → `data-reviewer`.
   - Mexeu em **telas/fluxos** → `product-ux-reviewer`.
   - Mexeu em **workflows/automação** → `ci-cd-reviewer`.
   - Sempre que fizer sentido → `qa-reviewer`.
5. Corrigir os apontamentos e só então concluir a tarefa.

---

## Observações

- Todos os agentes usam `model: inherit` (herdam o modelo da sessão principal) por enquanto.
- **`qa-reviewer` e `ci-cd-reviewer` são read-only neste momento e não usam `Bash`**: eles apenas inspecionam testes, workflows e automações — **não executam comandos** (não rodam `npm test`, `npm run build`, `./mvnw verify` nem os pipelines). Poderão receber `Bash` no futuro, se houver necessidade.
- Não há plugins, MCP ou hooks configurados nesta etapa.
- Estes agentes organizam o processo; as regras de produto e arquitetura continuam definidas no `CLAUDE.md`, que prevalece em caso de conflito.
