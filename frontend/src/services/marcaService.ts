import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type { Marca, MarcaRequest } from '@/types/catalogo'

/**
 * Servico de Fabricantes e marcas (Fase B5). Centraliza as chamadas HTTP de
 * /api/marcas, com os mesmos endpoints de /api/categorias. O `id` das rotas e
 * o UUID publico da marca. Escrita e somente ADMIN.
 */

function caminhoDaMarca(id: string): string {
  return `/marcas/${encodeURIComponent(id)}`
}

/** Lista plana das marcas da empresa, ordenada pelo caminho. */
export function listarMarcas(ativo?: boolean): Promise<Marca[]> {
  const query = ativo === undefined ? '' : `?ativo=${ativo}`
  return apiGet<Marca[]>(`/marcas${query}`, { autenticada: true })
}

export function cadastrarMarca(dados: MarcaRequest): Promise<Marca> {
  return apiPost<Marca>('/marcas', dados, { autenticada: true })
}

/** Renomeia e/ou move a marca (`parentId: null` move para a raiz). */
export function atualizarMarca(id: string, dados: MarcaRequest): Promise<Marca> {
  return apiPatch<Marca>(caminhoDaMarca(id), dados, { autenticada: true })
}

export function inativarMarca(id: string): Promise<Marca> {
  return apiPatch<Marca>(`${caminhoDaMarca(id)}/inativar`, {}, { autenticada: true })
}

export function reativarMarca(id: string): Promise<Marca> {
  return apiPatch<Marca>(`${caminhoDaMarca(id)}/reativar`, {}, { autenticada: true })
}

/** Exclui a marca (204). Com submarcas, produtos ou fornecedores responde 409. */
export function excluirMarca(id: string): Promise<void> {
  return apiDelete(caminhoDaMarca(id), { autenticada: true })
}
