/**
 * Modulo de identidade e acesso (IAM) do Geitus.
 *
 * <p>Reune autenticacao e usuarios. Contem o login por e-mail/senha (BCrypt), a
 * emissao e validacao de JWT (HS256), o filtro de autenticacao por Bearer token,
 * o endpoint de dados do usuario autenticado e a entidade {@code Usuario} com seu
 * repositorio. Todo usuario nasce vinculado a uma empresa (DEC-016). Nao implementa
 * refresh token, recuperacao de senha, MFA, OAuth/SSO, RBAC avancado, rate limiting
 * nem lockout (fora do escopo do MVP). Ver CLAUDE.md e docs/decision-log.md (DEC-016).
 */
package com.geitus.app.iam;
