# ERPell — Frontend

Frontend do **ERPell**, a plataforma SaaS de gestão da **UpeFlow**. Esta é a **base inicial**: sobe a aplicação React com o layout principal, o roteamento e um cartão de status que consome o health check do backend. As telas dos módulos ainda **não** foram implementadas.

---

## Stack

- Node.js 24 LTS (versão recomendada)
- React + TypeScript
- Vite
- Tailwind CSS (v4)
- shadcn/ui (preparado — tokens, `cn` e `components.json` prontos)
- React Router
- TanStack Query
- React Hook Form + Zod (preparados para os formulários das próximas etapas)
- Vitest + Testing Library (testes)
- Oxlint (lint)
- npm (gerenciador de pacotes)

---

## O que já existe nesta etapa

- Projeto React + TypeScript + Vite configurado.
- Tailwind CSS v4 com tokens de tema (claro/escuro) e atalho de importação `@` para `src`.
- Layout base: sidebar com a identidade do ERPell, cabeçalho e área principal com espaço para as rotas futuras.
- Roteamento com React Router (página inicial + página de "não encontrada").
- Cartão de **status do backend** consumindo `GET /api/health`, com tratamento de **carregando**, **sucesso** e **erro**.
- Cliente HTTP base (`services/httpClient.ts`) e serviço de health (`services/healthService.ts`).

### O que ainda NÃO existe (próximas etapas)

- Autenticação e telas de login.
- Módulos: produtos, clientes, PDV, caixa, financeiro, dashboard real.

---

## Estrutura de pastas

Segue a organização definida no CLAUDE.md:

```text
src/
├── app/           # Provedores globais e configuração do TanStack Query
├── components/    # Componentes de UI genéricos
│   ├── layout/    # Shell principal (sidebar + área de conteúdo)
│   └── ui/        # Componentes do shadcn/ui (adicionados sob demanda)
├── features/      # Módulos de domínio (reservado para as próximas etapas)
├── hooks/         # Hooks reutilizáveis
├── lib/           # Utilitários (ex.: cn)
├── routes/        # Páginas e configuração de rotas
├── services/      # Cliente HTTP e serviços de API
├── styles/        # CSS global e tokens de tema
└── types/         # Tipos compartilhados
```

---

## Pré-requisitos

- **Node.js 24** e **npm** instalados (`node -v` deve indicar a versão 24).
- Para testar a integração, o **backend** deve estar rodando (ver `../backend/README.md`).

---

## Configuração (variáveis de ambiente)

O Vite lê variáveis do arquivo `.env` na raiz do frontend. Copie o exemplo e ajuste se necessário:

```bash
cp .env.example .env
```

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `VITE_API_BASE_URL` | `http://localhost:8080/api` | URL base da API do backend (inclui o prefixo `/api`) |

---

## Como executar

```bash
npm install       # instala as dependências
npm run dev       # sobe o servidor de desenvolvimento (http://localhost:5173)
```

Scripts disponíveis:

| Script | Descrição |
|--------|-----------|
| `npm run dev` | Servidor de desenvolvimento com HMR |
| `npm run lint` | Análise estática com Oxlint |
| `npm run typecheck` | Verificação de tipos (TypeScript) |
| `npm test` | Testes com Vitest (Testing Library) |
| `npm run build` | Build de produção (typecheck + Vite) |
| `npm run preview` | Serve localmente o build de produção |

---

## Como testar a integração com /api/health

1. Suba o backend (na pasta `backend/`, com um PostgreSQL disponível):
   ```bash
   ./mvnw spring-boot:run
   ```
2. Suba o frontend:
   ```bash
   npm run dev
   ```
3. Abra `http://localhost:5173`. O cartão **"Status do backend"** deve exibir:
   - **Carregando** enquanto consulta;
   - **Conectado (UP)** com o nome da aplicação, em caso de sucesso;
   - **Backend indisponível** com a mensagem do erro, se o backend estiver fora do ar.

O CORS do backend já libera a origem `http://localhost:5173`, portanto nenhuma configuração adicional é necessária em desenvolvimento.
