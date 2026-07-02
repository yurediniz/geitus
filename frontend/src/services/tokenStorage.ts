/**
 * Armazenamento do token de autenticacao.
 *
 * Decisao pragmatica do MVP: o token JWT e guardado no localStorage.
 *
 * LIMITACAO CONHECIDA (seguranca): o localStorage e acessivel por qualquer
 * script na pagina, portanto vulneravel a XSS. Nao ha refresh token no MVP.
 * Uma abordagem mais segura (cookie httpOnly + refresh) fica para uma etapa
 * futura. Ver frontend/README.md.
 *
 * Todo o acesso ao token passa por este modulo para centralizar a decisao e
 * facilitar uma futura troca de estrategia.
 */

const TOKEN_KEY = 'erpell.token'

/** Le o token armazenado, ou null se nao houver. */
export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // Ambientes sem localStorage (ex.: alguns testes) nao devem quebrar.
    return null
  }
}

/** Persiste o token de autenticacao. */
export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    // Silencioso: se o armazenamento falhar, o app segue sem persistir.
  }
}

/** Remove o token armazenado (logout / 401). */
export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Silencioso.
  }
}
