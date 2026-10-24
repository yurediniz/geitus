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

const TOKEN_KEY = 'geitus.token'

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

/** Avisos de fim de sessao: quem guarda dados da sessao em memoria os apaga. */
const avisosDeFimDeSessao = new Set<() => void>()

/**
 * Registra o que fazer quando a sessao termina (logout ou 401, que passam por
 * `clearStoredToken`). Devolve a funcao que cancela o registro.
 */
export function aoEncerrarSessao(aviso: () => void): () => void {
  avisosDeFimDeSessao.add(aviso)
  return () => {
    avisosDeFimDeSessao.delete(aviso)
  }
}

/** Remove o token armazenado (logout / 401) e avisa quem guarda dados da sessao. */
export function clearStoredToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Silencioso.
  }
  for (const aviso of avisosDeFimDeSessao) {
    try {
      aviso()
    } catch {
      // Um aviso que falha nao impede os demais nem o logout.
    }
  }
}
