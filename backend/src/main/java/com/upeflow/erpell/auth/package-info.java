/**
 * Modulo de autenticacao do ERPell.
 *
 * <p>Contem o login por e-mail/senha (BCrypt), a emissao e validacao de JWT
 * (HS256), o filtro de autenticacao por Bearer token e o endpoint de dados do
 * usuario autenticado. Nao implementa refresh token, recuperacao de senha, MFA,
 * OAuth/SSO, RBAC avancado, rate limiting nem lockout (fora do escopo do MVP).
 * Ver CLAUDE.md e docs/decision-log.md (DEC-016).
 */
package com.upeflow.erpell.auth;
