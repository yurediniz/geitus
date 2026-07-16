# Plano de Implementação — Módulo Usuários (gestão)

> **Execução:** este plano é executado pelo **fluxo do CTO** (dispatch de `back-end-executor` e `front-end-executor` + revisores), não pelo subagente genérico do Superpowers — temos executores especializados (DEC-021). Cada tarefa termina em um entregável testável e um portão de revisão.

**Spec canônica:** [`docs/modules/usuarios.md`](../../modules/usuarios.md). **Design:** [`docs/superpowers/specs/2026-07-16-modulo-usuarios-design.md`](../specs/2026-07-16-modulo-usuarios-design.md).

**Goal:** permitir que um ADMIN gerencie os usuários da sua empresa (CRUD, perfis, senhas) com RBAC básico, no modelo N:1.

**Architecture:** backend Spring Boot no domínio `iam` (service + controller + DTOs + migration V2 do CHECK de perfil; RBAC via authority derivada do claim `perfil` do JWT e restrição de rota no `SecurityConfig`); frontend React com tela `/usuarios` (padrão da página de Produtos) + item de sidebar só-ADMIN + troca da própria senha.

**Tech Stack:** Java 21, Spring Boot 3.5 (Web, Data JPA, Security, Bean Validation), Flyway, BCrypt, JWT (jjwt); React 19, TypeScript, Vite, Tailwind v4, shadcn/ui, React Router 7, React Hook Form + Zod, TanStack Query.

## Global Constraints

- **Isolamento por empresa (DEC-016):** empresa sempre do usuário autenticado (`@AuthenticationPrincipal Long idUsuario`); acesso a usuário de outra empresa → **404**.
- **Perfis:** allow-list `{ADMIN, OPERADOR}`; `perfil` fora da lista → 400; CHECK no banco.
- **RBAC:** rotas `/api/usuarios/**` de gestão exigem **ADMIN**; `PATCH /api/usuarios/me/senha` exige apenas autenticado.
- **Senha:** BCrypt sempre; mínimo **8 caracteres**; `senha_hash` **nunca** em DTO/resposta/log.
- **Soft delete:** inativar/reativar; nunca exclusão física.
- **E-mail:** obrigatório, único **global** (`uq_usuario_email`); duplicado → **409**.
- **Autoproteção:** não inativar/rebaixar o **último ADMIN ativo** da empresa (→ **409**); ADMIN não inativa a si mesmo.
- **Migrations append-only:** baseline `V1__baseline.sql` intacto; nova migration é **V2**.
- **Erros** via `ApiError` (`@RestControllerAdvice`), sem vazar detalhe interno.
- **Testes:** queries de repositório exercitadas contra **Postgres real** (a lição do `@WebMvcTest`+`@MockBean`).
- **Git:** trabalhar na `develop`; commits pequenos em pt-BR.

---

## Backend

### Task B1 — Perfil (allow-list) + migration V2 (CHECK)

**Files:**
- Create: `backend/src/main/java/com/geitus/app/iam/Perfil.java` (enum `ADMIN`, `OPERADOR`; helper de validação/`fromString`).
- Create: `backend/src/main/resources/db/migration/V2__usuario_perfil_check.sql` — `ALTER TABLE usuario ADD CONSTRAINT ck_usuario_perfil CHECK (perfil IN ('ADMIN','OPERADOR'));`
- Test: `backend/src/test/java/com/geitus/app/iam/PerfilTest.java`.

**Deliverable:** perfil validável na aplicação + constraint no banco. Dados atuais (só `ADMIN`) compatíveis.
**Tests:** `Perfil.fromString` aceita ADMIN/OPERADOR (case definido) e rejeita valor inválido; a migration aplica sobre o baseline (validar no smoke/integração).
**Portão:** `data-reviewer` (migration).

### Task B2 — RBAC: authority a partir do claim `perfil` + restrição de rota

**Files:**
- Modify: `backend/src/main/java/com/geitus/app/iam/JwtAuthenticationFilter.java` — ao autenticar, adicionar a authority derivada do claim `perfil` (ex.: `SimpleGrantedAuthority("ROLE_ADMIN")` ou authority `ADMIN`) ao `Authentication`.
- Modify: `backend/src/main/java/com/geitus/app/config/SecurityConfig.java` — restringir mutações de `/api/usuarios/**` a `ADMIN` (via `requestMatchers(...).hasRole/hasAuthority("ADMIN")`), mantendo `PATCH /api/usuarios/me/senha` apenas autenticado; habilitar method security se optar por `@PreAuthorize`.
- Test: `backend/src/test/java/com/geitus/app/iam/UsuarioRbacTest.java` (ou dentro do controller test).

**Interfaces (Produces):** o `Authentication` do request passa a expor a authority do perfil; controllers/rotas podem exigir `ADMIN`.
**Deliverable:** OPERADOR autenticado recebe **403** em rota de gestão; ADMIN recebe 2xx; rota `me/senha` acessível a ambos.
**Tests:** rota protegida com token OPERADOR → 403; com token ADMIN → 200; sem token → 401; ordem das regras no `SecurityConfig` não afeta as rotas públicas/login.
**Portão:** `security-reviewer` (obrigatório — autorização).

### Task B3 — `UsuarioService` + DTOs + repository

**Files:**
- Create: `iam/UsuarioService.java` (regras + isolamento + autoproteção).
- Modify: `iam/UsuarioRepository.java` — queries por empresa: listar com filtros (`busca` por nome/e-mail, `ativo`, `perfil`), `findByEmpresa_IdAndId`, `existsByEmail`, e contagem de ADMIN ativos por empresa (para a autoproteção). Split `buscar` com/sem termo (evitar o bug do `lower(bytea)` — ver DT/lição de JPQL).
- Create: `iam/dto/UsuarioCriarRequest.java`, `iam/dto/UsuarioAtualizarRequest.java`, `iam/dto/RedefinirSenhaRequest.java`, `iam/dto/AlterarSenhaRequest.java`. Reutiliza `iam/dto/UsuarioResponse.java`.
- Exceção de regra de negócio: seguir o padrão de erro do projeto (`@RestControllerAdvice`/`ApiError`); usar/mapear uma exceção de domínio para o caso do último-ADMIN e do e-mail duplicado (avaliar mover `RegraDeNegocioException` para `shared` ou criar equivalente no `iam` — decisão do executor, registrar).
- Test: `backend/src/test/java/com/geitus/app/iam/UsuarioServiceTest.java` (package-private, mesmo pacote).

**Interfaces (Produces):** `listar(idUsuario, filtros) → List<UsuarioResponse>`; `criar(idUsuario, UsuarioCriarRequest) → UsuarioResponse`; `buscar(idUsuario, id) → UsuarioResponse`; `atualizar(idUsuario, id, UsuarioAtualizarRequest) → UsuarioResponse`; `inativar/reativar(idUsuario, id)`; `redefinirSenha(idUsuario, id, RedefinirSenhaRequest)`; `alterarPropriaSenha(idUsuario, AlterarSenhaRequest)`. Todos resolvem a empresa a partir do `idUsuario` autenticado.
**Deliverable:** regras completas com testes de unidade.
**Tests (cobrir):** criar (BCrypt aplicado, e-mail duplicado → 409, perfil inválido → 400, senha < 8 → 400); isolamento (id de outra empresa → 404); atualizar nome/perfil; inativar/reativar; **autoproteção** (inativar/rebaixar último ADMIN ativo → 409; ADMIN não inativa a si mesmo); redefinir senha (ADMIN); trocar própria senha (senha atual errada → 400); `senha_hash` fora do `UsuarioResponse`.
**Portão:** `back-end-reviewer`.

### Task B4 — `UsuarioController` (endpoints) + integração real

**Files:**
- Create: `iam/UsuarioController.java` — mapeia os 8 endpoints da spec para o `UsuarioService`, com `@Valid`, `@AuthenticationPrincipal Long idUsuario`, status HTTP corretos.
- Test: `backend/src/test/java/com/geitus/app/iam/UsuarioControllerTest.java` (`@WebMvcTest` com service mockado — contratos HTTP, RBAC 403, validações 400) **+** um teste de **integração** que exercita as queries do repositório contra Postgres real (listar com/sem filtro, contagem de ADMIN) — não confiar só no `@WebMvcTest`.

**Consumes:** métodos do `UsuarioService` (Task B3); RBAC (Task B2).
**Deliverable:** API `/api/usuarios` funcional ponta a ponta.
**Tests:** os 8 endpoints com status corretos; 403 para OPERADOR; 404 cross-empresa; 409 e-mail/último-ADMIN; 400 validações; `me/senha` acessível a autenticado.
**Portão:** `back-end-reviewer` + `security-reviewer` + `qa-reviewer`. Rodar `./mvnw test` e `./mvnw verify` + smoke real (login ADMIN cria/edita/inativa; login OPERADOR → 403).

---

## Frontend

### Task F1 — Serviço, tipos, rota e sidebar (só-ADMIN)

**Files:**
- Create: `frontend/src/services/usuarioService.ts` (`apiGet/apiPost/apiPatch` sobre `/usuarios`, autenticado).
- Create/Modify: tipos em `frontend/src/types/` (Usuario, Perfil, requests).
- Modify: `frontend/src/routes/router.tsx` — rota `/usuarios` sob um guard que exige perfil **ADMIN** (reaproveitar `useAuth`; OPERADOR → redirect/404 amigável).
- Modify: `frontend/src/components/layout/RootLayout.tsx` — item **"Usuários"** em `itensNavegacao`, **visível só para ADMIN** (condicional pelo `usuario.perfil`), com ícone lucide.
- Test: componentes/guard (sidebar mostra Usuários só p/ ADMIN; rota bloqueada p/ OPERADOR).

**Deliverable:** navegação e serviço prontos; acesso restrito por perfil.
**Portão:** `front-end-reviewer`.

### Task F2 — Página de Usuários (lista + CRUD + senha)

**Files:**
- Create: `frontend/src/features/usuarios/UsuariosPage.tsx` (lista com busca + filtros `ativo`/`perfil`, estados loading/erro/vazio/sucesso — padrão de `features/products/ProdutosPage.tsx`).
- Create: formulário criar/editar (React Hook Form + Zod; nome, e-mail, perfil, senha na criação), ações inativar/reativar e **redefinir senha** (ADMIN).
- Test: fluxo CRUD, validações, estados, feedback.

**Consumes:** `usuarioService` (F1).
**Deliverable:** gestão de usuários completa na UI.
**Portão:** `front-end-reviewer` + `product-ux-reviewer`.

### Task F3 — Trocar a própria senha

**Files:**
- Create: UI simples de "trocar minha senha" (ex.: item no menu do usuário / seção), com senha atual + nova + confirmação, chamando `PATCH /api/usuarios/me/senha`.
- Test: validação (confirmação != nova → erro; senha atual errada → feedback do 400), estados.

**Deliverable:** qualquer usuário troca a própria senha.
**Portão:** `front-end-reviewer` + `product-ux-reviewer`.

---

## Ordem e paralelismo
- **Backend primeiro** B1 → B2 → B3 → B4 (B3/B4 dependem de B2; B1 é independente e pode ir junto com B2).
- **Frontend** F1 → F2 → F3 após o backend expor a API (F1 pode começar em paralelo com o backend usando o contrato da spec; F2/F3 precisam da API para o smoke).
- Revisores por tarefa conforme os portões; **`security-reviewer` obrigatório** (RBAC) e **`data-reviewer` obrigatório** (migration V2).

## Documentação
- Ao final, atualizar `docs/modules/README.md` (ponteiro para `usuarios.md`) e revisar limitações/decisões se algo mudar.
