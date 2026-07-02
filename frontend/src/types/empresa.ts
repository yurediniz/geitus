/**
 * Tipos compartilhados do dominio de empresa.
 *
 * Refletem o contrato fixo da API do backend (GET /api/empresas/minha e
 * PATCH /api/empresas/minha, alem do objeto `empresa` aninhado em
 * GET /api/auth/me).
 */

/** Empresa do usuario autenticado, conforme retornado pela API. */
export interface Empresa {
  id: number
  nome: string
  ativo: boolean
  criadoEm: string
  atualizadoEm: string | null
}
