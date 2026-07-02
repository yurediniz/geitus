# ERPell

**ERPell** é o primeiro produto da **UpeFlow**: uma plataforma SaaS de gestão para pequenos negócios, com foco em PDV (Ponto de Venda) e ERP básico.

O objetivo não é ser o ERP com mais funcionalidades do mercado, e sim fazer o essencial muito bem, com experiência de uso superior, confiabilidade e inteligência prática.

Público-alvo inicial:

- Mercados
- Pet shops
- Lojas de roupas

> **Status:** MVP em desenvolvimento — fase atual: **fundação técnica e documental**, antes da autenticação inicial.

Estado atual do repositório:

- Monorepo estruturado.
- Backend base criado (Spring Boot com health check, tratamento global de erros e migration inicial).
- Frontend base criado (React + Vite com roteamento, providers e componentes base).
- Documentação inicial criada (`CLAUDE.md`, diretrizes de engenharia e registro de decisões).
- CI inicial criado (workflows de backend e frontend em `.github/workflows/`).

---

## Stack

### Backend

- Java 21 LTS
- Spring Boot 3.5.x
- Maven via Maven Wrapper
- Spring Web
- Spring Data JPA
- Spring Security
- Bean Validation
- PostgreSQL
- Flyway
- JWT e BCrypt (quando a autenticação for implementada)
- OpenAPI/Swagger via springdoc-openapi (quando endpoints reais forem implementados)

### Frontend

- Node.js 24 LTS (versão recomendada)
- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Router
- React Hook Form
- Zod
- TanStack Query
- Vitest
- Testing Library
- Zustand (apenas quando houver necessidade real de estado global)

### Banco de dados

- PostgreSQL

### Versionamento

- Git e GitHub

---

## Módulos do MVP

O MVP contempla apenas os módulos essenciais:

- Autenticação
- Layout principal
- Empresa
- Usuários
- Produtos
- Clientes
- PDV
- Caixa
- Estoque básico
- Financeiro básico
- Dashboard básico
- Relatórios básicos
- Configurações básicas

### Fora do escopo inicial

Não fazem parte do MVP (podem ser previstos para o futuro, mas exigem especificação própria): NF-e, NFC-e, SPED, contabilidade avançada, integração bancária, marketplace, e-commerce, aplicativo mobile, CRM avançado, automação de marketing, WhatsApp integrado, multiempresa avançado, API pública, controle fiscal completo, serviços, agendamento, múltiplos estoques e integrações externas.

---

## Estrutura do repositório

O projeto é organizado como monorepo:

```text
erpell/
├── backend/            # Aplicação Java + Spring Boot (base criada)
├── frontend/           # Aplicação React + TypeScript + Vite (base criada)
├── docs/               # Documentação do projeto
│   ├── engineering-guidelines.md  # Padrões de engenharia
│   ├── decision-log.md            # Registro de decisões
│   └── modules/                   # Documentação específica de cada módulo
├── .claude/
│   └── agents/         # Agentes especializados (execução e revisão)
├── .github/
│   └── workflows/      # Automações de CI (backend e frontend)
├── CLAUDE.md           # Diretrizes do projeto e regras de negócio
├── README.md
├── .gitignore
└── .editorconfig
```

---

## Como começar

O repositório já contém as bases do backend e do frontend. As funcionalidades dos módulos serão implementadas de forma incremental.

Pré-requisitos para o desenvolvimento:

- Java 21 (JDK)
- Maven (via Maven Wrapper incluído no `backend/`)
- Node.js 24 LTS
- PostgreSQL
- Git

Passos iniciais:

```bash
# Clonar o repositório
git clone <url-do-repositorio>
cd erpell
```

Instruções específicas de execução do backend e do frontend estão em `backend/README.md` e `frontend/README.md`, e serão detalhadas conforme cada parte evoluir.

---

## Ordem de desenvolvimento

O desenvolvimento segue de forma incremental, na seguinte ordem:

1. Estrutura inicial do repositório
2. Backend base
3. Frontend base
4. Banco PostgreSQL e migrations
5. Autenticação inicial
6. Layout principal
7. Empresa e usuário inicial
8. Produtos
9. Clientes
10. Caixa
11. PDV
12. Estoque básico
13. Financeiro básico
14. Dashboard básico
15. Relatórios básicos

Cada etapa deve ser implementada, testada e versionada antes de avançar.

---

## Convenções

- **Branches:** nesta fase, o trabalho é feito diretamente na `develop`; a `main` representa a versão estável. As branches `feature/*`, `fix/*` e `docs/*` ficam reservadas para uso futuro ou decisão explícita.
- **Commits:** padrão próximo ao Conventional Commits, com descrição em português (ex.: `feat(products): cria entidade de produto`).
- **Documentação e mensagens:** em português do Brasil.

Consulte o arquivo [CLAUDE.md](CLAUDE.md) para as diretrizes completas de arquitetura, regras de negócio e fluxo de trabalho.

---

## Links úteis

- [CLAUDE.md](CLAUDE.md) — diretrizes gerais, arquitetura, stack e regras de negócio.
- [docs/engineering-guidelines.md](docs/engineering-guidelines.md) — padrões de engenharia, código, testes, segurança e revisão.
- [docs/decision-log.md](docs/decision-log.md) — registro de decisões importantes, motivos e impactos.
- [docs/README.md](docs/README.md) — visão geral da documentação do projeto.
- [docs/modules/README.md](docs/modules/README.md) — organização das especificações por módulo.
- [.claude/agents/AGENTS.md](.claude/agents/AGENTS.md) — agentes especializados de execução e revisão.
