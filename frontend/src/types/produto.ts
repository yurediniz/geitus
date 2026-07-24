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
  marca: string | null
  unidade: string | null
  descricao: string | null
  precoVenda: number
  custo: number | null
  precoMinimo: number | null
  estoqueMinimo: number | null
  estoqueMaximo: number | null
  pontoReposicao: number | null
  codigoBarras: string | null
  sku: string | null
  ativo: boolean
  /** Margem sobre a venda (%), derivada; null quando não há custo. Só-leitura. */
  margem: number | null
  /**
   * Markup sobre o custo (%), derivado; null quando não há custo ou quando
   * custo = 0 (evita divisão por zero) — nesse caso a margem ainda vem
   * preenchida. Só-leitura.
   */
  markup: number | null
  criadoEm: string
  atualizadoEm: string | null
}

/** Corpo enviado para cadastro/atualizacao de produto. Não envia margem/markup (derivados). */
export interface ProdutoRequest {
  nome: string
  categoria: string | null
  marca: string | null
  unidade: string | null
  descricao: string | null
  precoVenda: number
  custo: number | null
  precoMinimo: number | null
  estoqueMinimo: number | null
  estoqueMaximo: number | null
  pontoReposicao: number | null
  codigoBarras: string | null
  sku: string | null
}

export type ProdutoStatusFiltro = 'todos' | 'ativos' | 'inativos'

export interface ListarProdutosParams {
  busca?: string
  status?: ProdutoStatusFiltro
}
