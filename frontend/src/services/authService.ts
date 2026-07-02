import { apiGet, apiPost } from '@/services/httpClient'
import type { LoginRequest, LoginResponse, Usuario } from '@/types/auth'

/**
 * Servico de autenticacao. Centraliza as chamadas de auth para nao duplicar
 * logica de API entre componentes (ver httpClient para injecao do token e
 * tratamento de 401).
 */

/**
 * Autentica o usuario. Chama POST /api/auth/login.
 *
 * Em caso de credenciais invalidas o backend responde 401 e o httpClient
 * lanca um HttpError com mensagem generica (sem detalhe tecnico).
 */
export function login(email: string, senha: string): Promise<LoginResponse> {
  const corpo: LoginRequest = { email, senha }
  return apiPost<LoginResponse>('/auth/login', corpo)
}

/**
 * Retorna o usuario autenticado. Chama GET /api/auth/me com o token atual.
 * Um 401 aqui dispara o fluxo de sessao expirada (ver httpClient).
 */
export function getMe(): Promise<Usuario> {
  return apiGet<Usuario>('/auth/me', { autenticada: true })
}
