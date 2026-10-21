# Geitus — Frontend

Frontend do **Geitus**, a plataforma SaaS de gestão para pequenos negócios. Contém a aplicação React com o layout principal, **autenticação** (login + proteção de rotas) e as páginas de **Empresa** (`/empresa`), **Usuários** (`/usuarios`), **Produtos** (`/produtos`) e **Clientes** (`/clientes`). As telas dos demais módulos (PDV, caixa, financeiro) ainda não foram implementadas.

---

## Stack

- Node.js 24 LTS (versão recomendada)
- React + TypeScript
- Vite
- Tailwind CSS (v4)
- shadcn/ui
- React Router
- TanStack Query
- React Hook Form + Zod (usados nos formulários de login, empresa, usuários e produtos)
- Vitest + Testing Library (testes)
- Oxlint (lint)
- npm (gerenciador de pacotes)

---

## O que já existe nesta etapa

- Projeto React + TypeScript + Vite configurado.
- Tailwind CSS v4 com tokens de tema (claro/escuro) e atalho de importação `@` para `src`.
- Layout base: sidebar com a identidade do Geitus, cabeçalho e área principal com espaço para as rotas futuras.
- Roteamento com React Router, separado em **rotas públicas** (`/login`) e **rotas privadas** (área principal), com um guard de autenticação.
- **Autenticação**: tela de login, estado de sessão e proteção de rotas (ver seção "Autenticação" abaixo).
- **Empresa** (`/empresa`): cadastro da empresa do usuário autenticado (representante legal, "Já possui CNPJ?", endereço com autofill por CEP); edição apenas para ADMIN, leitura para os demais. Nome da empresa visível na sidebar.
- **Usuários** (`/usuarios`, apenas ADMIN via `AdminRoute`): listagem, criação, edição, inativação/reativação e redefinição de senha; qualquer usuário pode trocar a própria senha.
- **Produtos** (`/produtos`): listagem com busca e filtro de status, cadastro, edição, inativação e reativação, margem/markup na lista; modo leitura para OPERADOR.
- **Categorias** (`/produtos/categorias`) e **Unidades** (`/produtos/unidades`), em abas dentro de Produtos: árvore de categorias (subcategorias, mover, inativar, excluir) e cadastro de unidades com fracionamento. No formulário de produto: unidade de venda (select), categoria (seletor com busca pelo caminho e "+ Nova") e unidade de compra + fator.
- **Clientes** (`/clientes`): cadastro rápido (nome, telefone com "Este número é WhatsApp", CPF e observações), busca por nome/CPF/telefone e filtro de status; qualquer perfil cadastra e edita, inativar/reativar só ADMIN. Máscaras e validações de CPF/telefone compartilhadas em `lib/documentos.ts`.
- Cartão de **status do backend** consumindo `GET /api/health`, com tratamento de **carregando**, **sucesso** e **erro**.
- Cliente HTTP base (`services/httpClient.ts`, com `apiGet`/`apiPost`/`apiPatch` e injeção de token) e serviços de API por domínio.

### O que ainda NÃO existe (próximas etapas)

- Refresh token e recuperação de senha.
- Seleção de empresa ativa (DEC-024 — norte futuro).
- Módulos: PDV, caixa, financeiro, dashboard real.

---

## Autenticação

A área principal do Geitus exige login. O fluxo mínimo desta etapa:

- `/login` — tela pública (sem sidebar). Valida e-mail e senha com React Hook Form + Zod e chama `POST /api/auth/login`.
- Ao autenticar com sucesso, o token e o usuário ficam disponíveis via `hooks/useAuth`, e o usuário é levado para a área principal (`/`).
- As rotas privadas ficam sob um `ProtectedRoute`: **sem token, o acesso é redirecionado para `/login`**.
- Um usuário já autenticado que abrir `/login` é redirecionado para `/`.
- O botão **Sair** (sidebar / cabeçalho no mobile) limpa a sessão e volta para `/login`.
- Chamadas autenticadas que recebem **401** limpam o token e redirecionam para `/login` (sessão expirada).
- **Carregando sessão (boot):** quando há um token salvo, o usuário é revalidado via `GET /api/auth/me` antes de os guards decidirem o redirect. Enquanto essa revalidação ocorre, um indicador discreto de carregamento é exibido — isso evita o "flicker" (área privada sem nome/e-mail) e o "piscar" do login antes de detectar um token inválido.

### Como acessar o login

1. Suba o backend (com o endpoint `POST /api/auth/login` disponível) e o frontend (`npm run dev`).
2. Abra `http://localhost:5173`. Sem sessão ativa, você é redirecionado para `http://localhost:5173/login`.
3. Informe e-mail e senha de um usuário válido e clique em **Entrar**.

### Armazenamento do token — limitação conhecida

O token JWT é guardado no **`localStorage`** (`services/tokenStorage.ts`), uma decisão **pragmática do MVP**.

> **Limitação de segurança (XSS):** o `localStorage` é acessível por qualquer script na página, portanto o token fica exposto a ataques de Cross-Site Scripting. Além disso, **não há refresh token** neste MVP. Uma abordagem mais robusta (cookie `httpOnly` + refresh token) fica para uma etapa futura. Toda leitura/escrita do token passa por `tokenStorage.ts` para facilitar essa troca de estratégia.

---

## Estrutura de pastas

Segue a organização definida no CLAUDE.md:

```text
src/
├── app/           # Provedores globais e configuração do TanStack Query
├── components/    # Componentes de UI genéricos
│   ├── layout/    # Shell principal (sidebar + área de conteúdo)
│   └── ui/        # Componentes do shadcn/ui (adicionados sob demanda)
├── features/      # Módulos de domínio (auth, company, customers, products, usuarios)
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

Em desenvolvimento **não é preciso configurar nada**: as chamadas para `/api` são encaminhadas ao backend pelo proxy do Vite (`vite.config.ts`), sem depender de CORS. Para sobrescrever, o Vite lê o arquivo `.env` na pasta `frontend/` (não o `.env` da raiz):

```bash
cp .env.example .env
```

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `VITE_API_BASE_URL` | `/api` | URL base da API usada pelo cliente HTTP (inclui o prefixo `/api`) |
| `VITE_DEV_API_TARGET` | `http://localhost:8080` | Destino do proxy de desenvolvimento para `/api` |

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

1. Suba o backend (da raiz do repositório, com um PostgreSQL disponível e o `.env` preenchido — ver `../backend/README.md`):
   ```powershell
   .\scripts\dev-backend.ps1
   ```
2. Suba o frontend:
   ```bash
   npm run dev
   ```
3. Abra `http://localhost:5173`. O cartão **"Status do backend"** deve exibir:
   - **Carregando** enquanto consulta;
   - **Conectado (UP)** com o nome da aplicação, em caso de sucesso;
   - **Backend indisponível** com a mensagem do erro, se o backend estiver fora do ar.

Como o proxy do Vite encaminha `/api` para o backend, nenhuma configuração adicional é necessária em desenvolvimento (o CORS do backend também libera `http://localhost:5173`, caso a API seja chamada diretamente).
