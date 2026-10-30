# Usuários

## 1. Objetivo

O ADMIN gerencia os usuários da **sua** empresa: listar, criar, editar, inativar/reativar e redefinir senha. Cada usuário troca a própria senha. Introduz o RBAC por perfil. Modelo atual N:1 (cada usuário pertence a uma empresa); o vínculo M:N da DEC-024 é o norte, ainda não implementado. Login e JWT: [`autenticacao.md`](autenticacao.md).

## 2. Regras de negócio

1. **Perfis (allow-list):** `ADMIN` gerencia usuários e usa o sistema; `OPERADOR` só usa o sistema. Validado na aplicação (enum) e no banco (`CHECK`).
2. **RBAC no backend:** toda rota `/api/usuarios/**` exige ADMIN (OPERADOR → 403), exceto `PATCH /api/usuarios/me/senha`, que é para qualquer autenticado. Só o ADMIN define ou edita perfil.
3. **Isolamento:** todas as operações valem só na empresa do usuário autenticado; usuário de outra empresa → **404**.
4. **Criação:** nome obrigatório, e-mail obrigatório e **único global** (repetido → **409** "Já existe um usuário com este e-mail."), perfil da allow-list e senha com **mínimo de 8 caracteres**. A senha inicial é definida pelo ADMIN.
5. **Edição:** só `nome` e `perfil`.
6. **Autoproteção** (409):
   - não se pode inativar nem rebaixar (ADMIN → OPERADOR) o **último ADMIN ativo** da empresa ("A empresa precisa de ao menos um administrador ativo.");
   - um ADMIN **não inativa a si mesmo** ("Você não pode inativar o próprio usuário.").
7. **Sem exclusão física:** usuário só é inativado/reativado. Inativo não consegue logar (ver autenticação).
8. **Redefinir senha (ADMIN):** não exige a senha atual do alvo.
9. **Trocar a própria senha:** exige a senha atual correta (incorreta → **400** "Senha atual incorreta.") e a nova com o mesmo mínimo.
10. Senha sempre em BCrypt; `senha_hash` nunca em resposta ou log. Erros em `ApiError`.

## 3. Contrato da API

| Método | Rota | Perfil | Observação |
|---|---|---|---|
| GET | `/api/usuarios` | ADMIN | Filtros `busca` (nome/e-mail), `ativo`, `perfil` |
| POST | `/api/usuarios` | ADMIN | `{nome, email, senha, perfil}` → 201; 409 e-mail repetido |
| GET | `/api/usuarios/{id}` | ADMIN | Detalhe |
| PATCH | `/api/usuarios/{id}` | ADMIN | `{nome, perfil}` |
| PATCH | `/api/usuarios/{id}/inativar` | ADMIN | 409 nas regras de autoproteção |
| PATCH | `/api/usuarios/{id}/reativar` | ADMIN | |
| PATCH | `/api/usuarios/{id}/senha` | ADMIN | `{novaSenha}` |
| PATCH | `/api/usuarios/me/senha` | autenticado | `{senhaAtual, novaSenha}` |

`{id}` ainda é o id numérico: o retrofit para UUID público (DEC-019) está pendente. Resposta `UsuarioResponse`: `id`, `nome`, `email`, `perfil`, `ativo`, `criadoEm`, `atualizadoEm`, `empresa`.

## 4. Dados

Tabela `usuario` (V1):
- `ck_usuario_perfil` em `('ADMIN','OPERADOR')` (V2);
- `uq_usuario_email` global;
- `uq_usuario_empresa_id (empresa_id, id)` (V8), alvo das FKs compostas de histórico, caixa e vendas.

## 5. Telas

- `/usuarios` sob `AdminRoute`: o item "Usuários" (seção Configurações do menu) só aparece para ADMIN, e o acesso direto do OPERADOR é bloqueado.
- Lista com busca e filtros (`ativo`, `perfil`), criar/editar (React Hook Form + Zod), inativar/reativar e redefinir senha; estados de carregando, erro, vazio e sucesso.
- **Trocar a própria senha:** pelo menu do usuário (`TrocarSenhaSheet`), com senha atual, nova senha e confirmação.

## 6. Fora do escopo e pendências

- Fora: vínculo M:N e seleção de empresa (DEC-024), recuperação de senha e convite por e-mail, MFA, permissões granulares por recurso.
- Pendências:
  - DT-016 (e-mail sensível a maiúsculas);
  - DT-017 (curingas do LIKE na busca de usuários);
  - DT-018 (inativado mantém o token até expirar);
  - id numérico nas rotas (DEC-019).
