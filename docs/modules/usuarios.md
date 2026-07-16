# Módulo: Usuários (gestão)

## Objetivo

Permitir que um **ADMIN** gerencie os usuários da **sua empresa** no Geitus: listar, criar, editar, inativar/reativar e redefinir senha, além de cada usuário poder trocar a **própria** senha. Amadurece o domínio `iam` (que hoje só tem autenticação — ver [autenticacao.md](autenticacao.md)) e introduz **autorização por perfil (RBAC básico)**.

## Escopo

- Perfis (allow-list): **`ADMIN`** e **`OPERADOR`**.
  - `ADMIN`: gerencia usuários e usa o sistema.
  - `OPERADOR`: usa o sistema; **não** gerencia usuários.
- **RBAC básico:** rotas de gestão de usuários exigem `ADMIN`.
- **CRUD de usuários** da empresa autenticada (isolamento por empresa — DEC-016).
- **Troca da própria senha** (exige a senha atual).
- **Redefinição de senha** por ADMIN (sem exigir a senha atual do alvo).
- Frontend: tela **`/usuarios`** (lista + criar/editar + inativar/reativar + redefinir senha), item na sidebar **visível só para ADMIN**, e ponto para o usuário trocar a própria senha.

## Fora do escopo

- **Modelo M:N Usuário↔Empresa e seleção de empresa (DEC-024)** — permanece como norte; aqui seguimos no modelo atual **N:1** (cada usuário pertence a uma empresa).
- Recuperação de senha por e-mail (esqueci minha senha), convite por e-mail.
- MFA/2FA, OAuth/SSO.
- RBAC **granular por permissão** (tabela de permissões) — aqui é só por perfil.
- Rate limiting / lockout de login.
- Refresh token, cookie `httpOnly` (limitações herdadas da autenticação).

## Decisões relacionadas (decision-log)

- **DEC-015** — PK interna `BIGINT` identity / `Long`.
- **DEC-016** — usuário vinculado a uma empresa; todo dado derivado do usuário autenticado; acesso a outra empresa → 404.
- **DEC-024** — relação Empresa/Usuário de longo prazo (identidade global + vínculo M:N com perfil por empresa). **Não** implementada aqui; é o norte. Enquanto isso, `perfil` vive em `usuario`.

## Perfis e autorização (RBAC)

- `perfil` passa a ser uma **allow-list** `{ADMIN, OPERADOR}`, validada na aplicação (enum + Bean Validation) e no banco (`CHECK`).
- A **autoridade** de autorização vem do claim `perfil` do JWT: o `JwtAuthenticationFilter` popula a authority correspondente (ex.: `ADMIN`); o `SecurityConfig` passa a restringir `/api/usuarios/**` a `ADMIN`. Hoje a segurança é apenas `authenticated()`; esta é a primeira autorização **por perfil** (por isso o `security-reviewer` é obrigatório).
- A troca da **própria** senha (`/api/usuarios/me/senha`) é permitida a **qualquer** usuário autenticado (não exige ADMIN).

## Modelo de dados

Reutiliza a tabela **`usuario`** (sem nova tabela). Migration **`V2`** (a `V1__baseline.sql` permanece intacta):

- Adiciona `CONSTRAINT ck_usuario_perfil CHECK (perfil IN ('ADMIN','OPERADOR'))`.
- Dados atuais (apenas o admin do bootstrap, perfil `ADMIN`) são compatíveis — a migration é segura.

> A unicidade de e-mail permanece **global** (`uq_usuario_email`), coerente com a identidade global da DEC-024. `senha_hash` continua `VARCHAR(72)` (BCrypt), nunca exposto.

## Endpoints

Todos sob `/api/usuarios`, **autenticados** e isolados pela empresa do usuário autenticado (acesso a usuário de outra empresa → **404**). Salvo indicação, exigem perfil **`ADMIN`**.

| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| `GET` | `/api/usuarios` | ADMIN | Lista usuários da empresa; filtros `busca` (nome/e-mail), `ativo`, `perfil`. |
| `POST` | `/api/usuarios` | ADMIN | Cria usuário (`nome`, `email`, `senha`, `perfil`). E-mail repetido → **409**. |
| `GET` | `/api/usuarios/{id}` | ADMIN | Detalhe de um usuário da empresa. |
| `PATCH` | `/api/usuarios/{id}` | ADMIN | Edita `nome` e `perfil`. |
| `PATCH` | `/api/usuarios/{id}/inativar` | ADMIN | Inativa (soft; nunca exclusão física). |
| `PATCH` | `/api/usuarios/{id}/reativar` | ADMIN | Reativa. |
| `PATCH` | `/api/usuarios/{id}/senha` | ADMIN | Redefine a senha de um usuário (não exige a senha atual do alvo). |
| `PATCH` | `/api/usuarios/me/senha` | autenticado | Troca a **própria** senha (exige `senhaAtual` + `novaSenha`). |

**DTOs:** reutiliza `UsuarioResponse` (id, nome, email, perfil, ativo, criadoEm, atualizadoEm — **sem** `senha_hash`); novos `UsuarioCriarRequest`, `UsuarioAtualizarRequest`, `RedefinirSenhaRequest`, `AlterarSenhaRequest`.

## Regras de negócio e autoproteção

- **Não travar o acesso da empresa:** não é possível **inativar** nem **rebaixar** (mudar o perfil de `ADMIN` para `OPERADOR`) o **último ADMIN ativo** da empresa. Tentativa → **409** (conflito de regra de negócio) com mensagem clara.
- Um ADMIN **não inativa a si mesmo** (evita autolockout acidental) — permanece a via de outro ADMIN.
- **Soft delete:** usuários são inativados, nunca excluídos fisicamente (regra geral do `CLAUDE.md`).
- E-mail obrigatório e único (global); nome obrigatório; perfil ∈ allow-list; senha com **mínimo de 8 caracteres**.
- Login uniforme e demais regras da autenticação permanecem intactos.

## Regras de segurança

- Senha sempre **BCrypt**; `senha_hash` nunca em DTO/resposta/log.
- **RBAC por perfil** aplicado no backend (não confiar no frontend).
- Isolamento por empresa (DEC-016) em todas as operações.
- Troca da própria senha exige a **senha atual** (evita troca por sessão sequestrada sem conhecer a senha).
- Erros padronizados via `ApiError`, sem vazar detalhe interno.
- Não permitir escalar privilégio indevidamente: só ADMIN define/edita perfil.

## Regras de UX

- Item **"Usuários"** na sidebar **visível apenas para ADMIN**; OPERADOR não vê e o guard de rota bloqueia o acesso direto a `/usuarios`.
- Tela `/usuarios` no padrão de **Produtos**: lista com busca e filtro (`ativo`, `perfil`), criar/editar (React Hook Form + Zod), inativar/reativar, redefinir senha. Estados **loading/erro/vazio/sucesso** e feedback claro.
- **Trocar a própria senha:** ponto simples e acessível (ex.: no menu do usuário) — formulário com senha atual + nova senha + confirmação.
- Interface limpa, sem cara de ERP antigo; tokens semânticos da marca.

## Critérios de aceite

**Backend:**
- ADMIN cria/edita/inativa/reativa usuários da sua empresa; OPERADOR recebe **403** nessas rotas.
- Acesso a usuário de outra empresa → **404**.
- E-mail duplicado → 409; campos inválidos → 400; perfil fora da allow-list → 400 (e `CHECK` no banco).
- Não é possível inativar/rebaixar o **último ADMIN ativo** (mensagem clara); ADMIN não inativa a si mesmo.
- Redefinição de senha por ADMIN funciona; troca da própria senha exige a senha atual correta (senha atual incorreta → **400**).
- `senha_hash` nunca aparece nas respostas; senha em BCrypt.
- Migration `V2` aplica o `CHECK` sem quebrar o baseline; queries de repositório exercitadas contra Postgres real.

**Frontend:**
- Sidebar mostra "Usuários" só para ADMIN; rota `/usuarios` bloqueada para OPERADOR.
- CRUD completo com estados tratados e feedback; troca da própria senha funciona.

## Limitações conhecidas

- **Modelo N:1** (um usuário por empresa) — o M:N (DEC-024) fica para depois.
- **Unicidade de e-mail global** (não por empresa).
- **RBAC só por perfil** (sem permissões granulares).
- Sem recuperação de senha por e-mail nem convite; senha inicial é definida pelo ADMIN.
- Limitações herdadas da autenticação (token em `localStorage`, sem refresh token) permanecem.

## Próximos passos futuros

- Modelo de **vínculo M:N + seleção de empresa** (DEC-024), com `security-reviewer` obrigatório.
- Recuperação de senha por e-mail / convite de usuário.
- RBAC granular por permissão (tabela de permissões) quando os módulos operacionais (Caixa, Estoque, Fiscal) exigirem papéis próprios.
