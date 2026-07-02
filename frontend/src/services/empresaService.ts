import { apiGet, apiPatch } from '@/services/httpClient'
import type { Empresa } from '@/types/empresa'

/**
 * Servico de empresa. Centraliza as chamadas relacionadas a empresa do
 * usuario autenticado para nao duplicar logica de API entre componentes.
 */

/** Retorna a empresa do usuario autenticado. Chama GET /api/empresas/minha. */
export function getMinhaEmpresa(): Promise<Empresa> {
  return apiGet<Empresa>('/empresas/minha', { autenticada: true })
}

/**
 * Atualiza o nome da empresa do usuario autenticado. Chama
 * PATCH /api/empresas/minha.
 */
export function atualizarMinhaEmpresa(nome: string): Promise<Empresa> {
  return apiPatch<Empresa>('/empresas/minha', { nome }, { autenticada: true })
}
