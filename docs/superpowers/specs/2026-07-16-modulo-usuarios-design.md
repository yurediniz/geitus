# Design — Módulo Usuários (gestão)

**Data:** 2026-07-16
**Status:** Aprovado — pronto para plano de implementação
**Spec canônica (detalhada):** [`docs/modules/usuarios.md`](../../modules/usuarios.md)

Este é o registro de design (brainstorming). A especificação completa e durável vive em `docs/modules/usuarios.md` (convenção do projeto, junto de `autenticacao.md`/`produtos.md`) — para não duplicar (DEC-022).

## Problema
O domínio `iam` só tem autenticação; não há gestão de usuários. Um ADMIN precisa criar e administrar os usuários da sua empresa, e falta autorização por perfil.

## Decisões (aprovadas)
- **Modelo N:1** (mantém o atual; DEC-024 M:N fica como norte, para depois).
- **Perfis:** `ADMIN` e `OPERADOR` (allow-list). RBAC básico: gestão de usuários exige `ADMIN`.
- **CRUD** de usuários da empresa (isolamento por empresa — DEC-016), **soft delete** (inativar/reativar).
- **Senhas:** ADMIN redefine a de qualquer usuário; cada usuário troca a **própria** senha (exige a senha atual). BCrypt sempre.
- **Autoproteção:** não inativar/rebaixar o **último ADMIN ativo**; ADMIN não inativa a si mesmo.
- **Integridade:** `CHECK (perfil IN ('ADMIN','OPERADOR'))` via migration **V2** (baseline V1 intacto) → `data-reviewer`.
- **RBAC técnico:** `JwtAuthenticationFilter` popula a authority a partir do claim `perfil`; `SecurityConfig` restringe `/api/usuarios/**` a `ADMIN` → `security-reviewer` **obrigatório**.
- **Frontend:** rota `/usuarios` (padrão da página de Produtos) + item na sidebar **só para ADMIN** + ponto para trocar a própria senha.

## Fluxo do CTO
`back-end-executor` + `front-end-executor` → revisores: `back-end-reviewer`, `front-end-reviewer`, **`security-reviewer`** (obrigatório), **`data-reviewer`** (migration), `qa-reviewer`, `product-ux-reviewer`.

## Fora do escopo
M:N/seleção de empresa (DEC-024); recuperação de senha por e-mail; MFA; RBAC granular por permissão; rate limiting.
