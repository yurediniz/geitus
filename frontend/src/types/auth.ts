/**
 * Tipos compartilhados do dominio de autenticacao.
 *
 * Refletem o contrato fixo da API do backend (POST /api/auth/login e
 * GET /api/auth/me). Ver frontend/README.md para detalhes do fluxo.
 */
import type { Empresa } from '@/types/empresa'

/** Usuario autenticado, conforme retornado pela API. */
export interface Usuario {
  id: number
  nome: string
  email: string
  perfil: string
  empresa: Empresa
}

/** Corpo enviado para POST /api/auth/login. */
export interface LoginRequest {
  email: string
  senha: string
}

/** Resposta de sucesso (200) de POST /api/auth/login. */
export interface LoginResponse {
  token: string
  usuario: Usuario
}
