import { apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type { Cliente, ClienteRequest, ListarClientesParams } from '@/types/cliente'

/**
 * Servico de Clientes. Centraliza as chamadas HTTP para evitar duplicacao de
 * logica de API nos componentes. O `id` das rotas e o UUID publico do cliente.
 */

function montarQuery(params: ListarClientesParams = {}): string {
  const searchParams = new URLSearchParams()
  const busca = params.busca?.trim()

  if (busca) {
    searchParams.set('busca', busca)
  }

  if (params.status === 'ativos') {
    searchParams.set('ativo', 'true')
  }

  if (params.status === 'inativos') {
    searchParams.set('ativo', 'false')
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

/** Lista clientes da empresa do usuario autenticado. */
export function listarClientes(params: ListarClientesParams = {}): Promise<Cliente[]> {
  return apiGet<Cliente[]>(`/clientes${montarQuery(params)}`, { autenticada: true })
}

/** Cadastra um cliente na empresa do usuario autenticado. */
export function cadastrarCliente(dados: ClienteRequest): Promise<Cliente> {
  return apiPost<Cliente>('/clientes', dados, { autenticada: true })
}

/** Atualiza os dados cadastrais de um cliente da empresa do usuario autenticado. */
export function atualizarCliente(id: string, dados: ClienteRequest): Promise<Cliente> {
  return apiPatch<Cliente>(`/clientes/${id}`, dados, { autenticada: true })
}

/** Inativa um cliente da empresa do usuario autenticado (somente ADMIN). */
export function inativarCliente(id: string): Promise<Cliente> {
  return apiPatch<Cliente>(`/clientes/${id}/inativar`, {}, { autenticada: true })
}

/** Reativa um cliente da empresa do usuario autenticado (somente ADMIN). */
export function reativarCliente(id: string): Promise<Cliente> {
  return apiPatch<Cliente>(`/clientes/${id}/reativar`, {}, { autenticada: true })
}
