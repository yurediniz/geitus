# Geitus

**Geitus** é uma plataforma SaaS de gestão para pequenos negócios, com foco em PDV (Ponto de Venda) e ERP básico.

O objetivo não é ser o ERP com mais funcionalidades do mercado, e sim fazer o essencial muito bem, com experiência de uso superior, confiabilidade e inteligência prática.

Público-alvo inicial:

- Mercados
- Pet shops
- Lojas de roupas

> **Status:** MVP em desenvolvimento — etapas 1 a 9 concluídas (fundação, autenticação, layout, empresa, usuários, produtos e clientes); próximo módulo: **Caixa** (etapa 10).

Estado atual do repositório:

- Monorepo estruturado, com CI de backend e frontend em `.github/workflows/`.
- **Autenticação**: login por e-mail/senha (BCrypt), JWT (HS256), proteção de rotas e tela de login.
- **Empresa**: cadastro da empresa do usuário autenticado (`/api/empresas/minha`) — representante legal, fluxo "Já possui CNPJ?" (PF/PJ) e endereço com autofill por CEP. Edição exige ADMIN.
- **Usuários**: gestão dos usuários da empresa (`/api/usuarios`, apenas ADMIN), perfis `ADMIN`/`OPERADOR` e troca/redefinição de senha.
- **Produtos**: cadastro com busca e filtro de status (`/api/produtos`), escrita restrita a ADMIN, unicidade de SKU/código de barras por empresa (409) e margem/markup calculados. Em evolução (DEC-030): Fase A concluída — **categorias em árvore** e **unidades de medida** como cadastros próprios.
- **Clientes**: cadastro rápido de pessoa física (`/api/clientes`, por UUID público) — telefone com indicador de WhatsApp, CPF opcional e único por empresa, busca por nome/CPF/telefone; qualquer usuário cadastra e edita, só ADMIN inativa/reativa.
- Documentação operacional em `docs/` (diretrizes de engenharia, registro de decisões, dívidas técnicas, visão de domínio e especificações por módulo).

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
- JWT (jjwt) e BCrypt para autenticação
- OpenAPI/Swagger via springdoc-openapi (Swagger UI habilitado apenas em desenvolvimento)

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
geitus/
├── backend/            # Aplicação Java + Spring Boot
├── frontend/           # Aplicação React + TypeScript + Vite
├── scripts/            # Scripts de desenvolvimento (ex.: dev-backend.ps1)
├── docs/               # Documentação do projeto
│   ├── engineering-guidelines.md  # Padrões de engenharia
│   ├── decision-log.md            # Registro de decisões
│   ├── technical-debt.md          # Pendências e dívidas técnicas
│   ├── visao-dominio-pdv.md       # Norte de longo prazo do domínio
│   └── modules/                   # Documentação específica de cada módulo
├── .claude/
│   └── agents/         # Agentes especializados (execução e revisão)
├── .github/
│   └── workflows/      # Automações de CI (backend e frontend)
├── CLAUDE.md           # Diretrizes do projeto e regras de negócio
├── README.md
├── .env.example        # Modelo das variáveis de ambiente locais
├── .gitignore
└── .editorconfig
```

---

## Como começar

Pré-requisitos para o desenvolvimento:

- Java 21 (JDK) — o build falha de propósito em outras versões (`maven-enforcer`)
- Maven (via Maven Wrapper incluído no `backend/`)
- Node.js 24 LTS
- Docker — para o PostgreSQL local e para os testes de integração (Testcontainers)
- Git

Passos iniciais (Windows/PowerShell):

```powershell
git clone <url-do-repositorio>
cd geitus

# 1. Variáveis locais (o .env é ignorado pelo Git — preencha JWT_SECRET, senha do banco e admin dev)
Copy-Item .env.example .env

# 2. PostgreSQL local (primeira vez; use a mesma senha do .env)
docker run --name geitus-postgres -e POSTGRES_DB=geitus_db -e POSTGRES_USER=geitus -e POSTGRES_PASSWORD=<senha-do-.env> -p 5432:5432 -d postgres:16
# nas próximas vezes: docker start geitus-postgres

# 3. Backend (carrega o .env e roda spring-boot:run)
.\scripts\dev-backend.ps1

# 4. Frontend (em outro terminal)
cd frontend; npm install; npm run dev
```

Abra `http://localhost:5173`. Detalhes de configuração, testes e endpoints estão em [backend/README.md](backend/README.md) e [frontend/README.md](frontend/README.md).

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
- [docs/technical-debt.md](docs/technical-debt.md) — pendências e dívidas técnicas rastreadas.
- [docs/README.md](docs/README.md) — visão geral da documentação do projeto.
- [docs/modules/README.md](docs/modules/README.md) — organização das especificações por módulo.
- [.claude/agents/cto.md](.claude/agents/cto.md) — o CTO (orquestrador principal) e o catálogo dos agentes de execução e revisão.
