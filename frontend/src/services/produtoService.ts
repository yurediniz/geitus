import { apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type { ListarProdutosParams, Produto, ProdutoRequest } from '@/types/produto'

/**
 * Servico de Produtos. Centraliza as chamadas HTTP para evitar duplicacao de
 * logica de API nos componentes.
 */

function montarQuery(params: ListarProdutosParams = {}): string {
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

/** Lista produtos da empresa do usuario autenticado. */
export function listarProdutos(params: ListarProdutosParams = {}): Promise<Produto[]> {
  return apiGet<Produto[]>(`/produtos${montarQuery(params)}`, { autenticada: true })
}

/** Cadastra um produto na empresa do usuario autenticado. */
export function cadastrarProduto(dados: ProdutoRequest): Promise<Produto> {
  return apiPost<Produto>('/produtos', dados, { autenticada: true })
}

/** Atualiza os dados basicos de um produto da empresa do usuario autenticado. */
export function atualizarProduto(id: number, dados: ProdutoRequest): Promise<Produto> {
  return apiPatch<Produto>(`/produtos/${id}`, dados, { autenticada: true })
}

/** Inativa um produto da empresa do usuario autenticado. */
export function inativarProduto(id: number): Promise<Produto> {
  return apiPatch<Produto>(`/produtos/${id}/inativar`, {}, { autenticada: true })
}

/** Reativa um produto da empresa do usuario autenticado. */
export function reativarProduto(id: number): Promise<Produto> {
  return apiPatch<Produto>(`/produtos/${id}/reativar`, {}, { autenticada: true })
}
