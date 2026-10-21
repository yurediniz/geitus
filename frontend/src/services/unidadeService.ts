import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type { UnidadeMedida, UnidadeMedidaRequest } from '@/types/catalogo'

/**
 * Servico de Unidades de medida. Centraliza as chamadas HTTP de /api/unidades.
 * O `id` das rotas e o UUID publico da unidade. Escrita e somente ADMIN.
 */

/** Lista as unidades da empresa; `ativo` filtra por status quando informado. */
export function listarUnidades(ativo?: boolean): Promise<UnidadeMedida[]> {
  const query = ativo === undefined ? '' : `?ativo=${ativo}`
  return apiGet<UnidadeMedida[]>(`/unidades${query}`, { autenticada: true })
}

export function cadastrarUnidade(dados: UnidadeMedidaRequest): Promise<UnidadeMedida> {
  return apiPost<UnidadeMedida>('/unidades', dados, { autenticada: true })
}

export function atualizarUnidade(id: string, dados: UnidadeMedidaRequest): Promise<UnidadeMedida> {
  return apiPatch<UnidadeMedida>(`/unidades/${id}`, dados, { autenticada: true })
}

export function inativarUnidade(id: string): Promise<UnidadeMedida> {
  return apiPatch<UnidadeMedida>(`/unidades/${id}/inativar`, {}, { autenticada: true })
}

export function reativarUnidade(id: string): Promise<UnidadeMedida> {
  return apiPatch<UnidadeMedida>(`/unidades/${id}/reativar`, {}, { autenticada: true })
}

/** Exclui a unidade (204). Unidade em uso responde 409 com o motivo. */
export function excluirUnidade(id: string): Promise<void> {
  return apiDelete(`/unidades/${id}`, { autenticada: true })
}
