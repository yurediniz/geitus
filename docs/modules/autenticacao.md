# Autenticação

## 1. Objetivo

Login por e-mail e senha com JWT, base de todos os módulos: toda rota exige usuário autenticado, exceto as públicas listadas abaixo. Decisões: DEC-012, DEC-015, DEC-016 (norte de longo prazo na DEC-024).

## 2. Regras de negócio

1. Senha só com hash **BCrypt**; `senha_hash` nunca aparece em DTO, resposta ou log.
2. **Login uniforme:** senha errada, usuário inexistente e usuário inativo dão o mesmo **401** com a mensagem genérica "Credenciais inválidas." (não revela se o e-mail existe).
3. **JWT HS256**, stateless, com claims mínimos: `subject` = id do usuário, `perfil` e `empresaId` (nada sensível). Assinatura e expiração conferidas; token inválido, expirado ou adulterado → 401. A authority vem do claim `perfil` (`ROLE_ADMIN`/`ROLE_OPERADOR`).
4. **Segredo com fail-fast:** a aplicação não sobe se `JWT_SECRET` faltar, tiver menos de 32 bytes (256 bits) ou for um valor de exemplo público (o do `.env.example` ou o da documentação). O valor nunca é exibido.
5. Expiração por `JWT_EXPIRATION` (ms; padrão 86 400 000 = 24 h). Sem refresh token: a sessão dura até expirar.
6. `GET /api/auth/me` recarrega o usuário e bloqueia inativo (401).
7. A empresa (tenant) vem sempre do usuário autenticado, nunca de parâmetro; recurso de outra empresa → 404 (DEC-016).
8. CSRF desligado (sem cookie de sessão); `httpBasic` e `formLogin` desligados.
9. **CORS** restrito: origens por variável de ambiente, `allowCredentials(false)`, cabeçalhos `Authorization`, `Content-Type` e `Accept`.
10. Erros no formato `ApiError` (400/401/403), sem stack trace, nome de classe ou detalhe interno.
11. Segredos só em variáveis de ambiente; `.env` não é versionado; `.env.example` só com valores fictícios.
12. **Swagger/OpenAPI** só no perfil `dev`: `springdoc.*.enabled` é `false` por padrão e `true` no `application-dev.yml`; o `SecurityConfig` só libera os caminhos com ele ligado.
13. **Admin de desenvolvimento:** não há usuário com senha fixa no código. O `DevAdminBootstrap` cria, de forma idempotente, uma empresa e um ADMIN só com o perfil `dev` **e** `GEITUS_BOOTSTRAP_DEV_ADMIN=true`. Recusa a subida com senha de menos de 8 caracteres ou igual ao marcador do `.env.example`.

## 3. Contrato da API

| Método | Rota | Perfil | Observação |
|---|---|---|---|
| POST | `/api/auth/login` | público | `{email, senha}` → 200 `{token, usuario}`; 401 genérico; 400 com `campos` |
| GET | `/api/auth/me` | autenticado | `UsuarioResponse`: `id`, `nome`, `email`, `perfil`, `ativo`, `criadoEm`, `atualizadoEm`, `empresa` |

Rotas públicas: `POST /api/auth/login`, `GET /api/health`, `/actuator/health/**`, `GET` das imagens assinadas (ver [`produtos.md`](produtos.md)) e o Swagger só no `dev`. Todo o resto exige JWT válido (`Authorization: Bearer <jwt>`).

## 4. Dados

Variáveis de ambiente (segredo do JWT, expiração, bootstrap do admin de dev): [`backend/README.md`](../../backend/README.md) e `.env.example`.

Tabelas `empresa` e `usuario` no `V1__baseline.sql` (consolidado pela DEC-020):
- `usuario.empresa_id` NOT NULL com FK para `empresa` (DEC-016);
- `uq_usuario_email`: e-mail **único global**, não por empresa, coerente com a identidade global da DEC-024;
- `senha_hash VARCHAR(72)`;
- perfil restrito a `ADMIN`/`OPERADOR` pela `ck_usuario_perfil` (V2).

## 5. Telas

- `/login`: limpa, centralizada, sem sidebar.
  - Loading no envio, com botão desabilitado.
  - Mensagem humana para credencial inválida ("E-mail ou senha inválidos.") e outra para falha de conexão.
  - Validação por campo (React Hook Form + Zod) com `aria-invalid`, `aria-describedby` e `role="alert"`.
- `PublicOnlyRoute` leva o usuário autenticado que abre `/login` para a área principal; `ProtectedRoute` manda quem não tem token para `/login`.
- No boot, com token salvo, a sessão é revalidada por `GET /api/auth/me` antes dos guards decidirem, com um indicador discreto (sem piscar a área privada nem o login).
- Logout limpa a sessão e volta para `/login`. Um 401 em chamada autenticada faz o mesmo.
- O token é lido e gravado só pelo `tokenStorage.ts`, para facilitar a troca de estratégia.

## 6. Fora do escopo e pendências

Fora: recuperação de senha, MFA/2FA, OAuth/SSO, permissões granulares, multiempresa avançado (DEC-024).

Limitações conhecidas (em [`technical-debt.md`](../technical-debt.md)):
- **DT-011** — sem rate limiting nem lockout no login (canal teórico de timing: o BCrypt só roda para usuário existente).
- **DT-013** — token no `localStorage` (exposto a XSS) e sem refresh token; a troca por cookie httpOnly exige revisar CSRF/CORS.
- **DT-016** — e-mail sensível a maiúsculas.
- **DT-018** — usuário inativado (ou ADMIN rebaixado) mantém acesso até o token expirar nas rotas que não recarregam o usuário.
- **DT-030** — carimbos `TIMESTAMP` sem fuso nas tabelas antigas.
