/**
 * Tipos compartilhados do modulo Produtos.
 *
 * Refletem o contrato da API do backend em /api/produtos. A empresa nao e
 * enviada nem recebida aqui: ela e sempre derivada do usuario autenticado.
 */

/** Produto conforme retornado pela API. */
export interface Produto {
  id: number
  nome: string
  categoria: string | null
  unidade: string | null
  precoVenda: number
  custo: number | null
  estoqueMinimo: number | null
  codigoBarras: string | null
  sku: string | null
  ativo: boolean
  criadoEm: string
  atualizadoEm: string | null
}

/** Corpo enviado para cadastro/atualizacao de produto. */
export interface ProdutoRequest {
  nome: string
  categoria: string | null
  unidade: string | null
  precoVenda: number
  custo: number | null
  estoqueMinimo: number | null
  codigoBarras: string | null
  sku: string | null
}

export type ProdutoStatusFiltro = 'todos' | 'ativos' | 'inativos'

export interface ListarProdutosParams {
  busca?: string
  status?: ProdutoStatusFiltro
}
