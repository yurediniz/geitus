# ERPell

**ERPell** é o primeiro produto da **UpeFlow**: uma plataforma SaaS de gestão para pequenos negócios, com foco em PDV (Ponto de Venda) e ERP básico.

O objetivo não é ser o ERP com mais funcionalidades do mercado, e sim fazer o essencial muito bem, com experiência de uso superior, confiabilidade e inteligência prática.

Público-alvo inicial:

- Mercados
- Pet shops
- Lojas de roupas

> **Status:** MVP em desenvolvimento.

---

## Stack planejada

### Backend

- Java
- Spring Boot (Spring Web, Spring Data JPA, Spring Security)
- Autenticação com JWT
- Bean Validation
- PostgreSQL
- Flyway (migrations)
- Maven

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- React Router
- React Hook Form + Zod
- TanStack Query
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
├── backend/            # Aplicação Java + Spring Boot (a ser implementada)
├── frontend/           # Aplicação React + TypeScript + Vite (a ser implementada)
├── docs/               # Documentação do projeto
│   └── modules/        # Documentação específica de cada módulo
├── .github/
│   └── workflows/      # Automações de CI/CD (a serem configuradas)
├── CLAUDE.md           # Diretrizes do projeto e regras de negócio
├── README.md
├── .gitignore
└── .editorconfig
```

---

## Como começar

Atualmente o repositório contém apenas a estrutura base do monorepo. Backend, frontend e banco ainda serão implementados de forma incremental.

Pré-requisitos previstos para o desenvolvimento:

- Java (JDK)
- Maven
- Node.js
- PostgreSQL
- Git

Passos iniciais:

```bash
# Clonar o repositório
git clone <url-do-repositorio>
cd erpell
```

As instruções detalhadas de execução do backend e do frontend serão adicionadas conforme cada parte for implementada.

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

- **Branches:** `main` (versão estável), `develop` (funcionalidades em teste), `feature/*`, `fix/*`, `docs/*`.
- **Commits:** padrão próximo ao Conventional Commits (ex.: `feat(products): cria entidade de produto`).
- **Documentação e mensagens:** em português do Brasil.

Consulte o arquivo [CLAUDE.md](CLAUDE.md) para as diretrizes completas de arquitetura, regras de negócio e fluxo de trabalho.
