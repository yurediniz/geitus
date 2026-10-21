import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type { Categoria, CategoriaRequest } from '@/types/catalogo'

/**
 * Servico de Categorias. Centraliza as chamadas HTTP de /api/categorias.
 * O `id` das rotas e o UUID publico da categoria. Escrita e somente ADMIN.
 */

/** Lista plana das categorias da empresa, ordenada pelo caminho. */
export function listarCategorias(ativo?: boolean): Promise<Categoria[]> {
  const query = ativo === undefined ? '' : `?ativo=${ativo}`
  return apiGet<Categoria[]>(`/categorias${query}`, { autenticada: true })
}

export function cadastrarCategoria(dados: CategoriaRequest): Promise<Categoria> {
  return apiPost<Categoria>('/categorias', dados, { autenticada: true })
}

/** Renomeia e/ou move a categoria (`parentId: null` move para a raiz). */
export function atualizarCategoria(id: string, dados: CategoriaRequest): Promise<Categoria> {
  return apiPatch<Categoria>(`/categorias/${id}`, dados, { autenticada: true })
}

export function inativarCategoria(id: string): Promise<Categoria> {
  return apiPatch<Categoria>(`/categorias/${id}/inativar`, {}, { autenticada: true })
}

export function reativarCategoria(id: string): Promise<Categoria> {
  return apiPatch<Categoria>(`/categorias/${id}/reativar`, {}, { autenticada: true })
}

/** Exclui a categoria (204). Com subcategorias ou produtos responde 409. */
export function excluirCategoria(id: string): Promise<void> {
  return apiDelete(`/categorias/${id}`, { autenticada: true })
}
