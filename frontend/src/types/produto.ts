/**
 * Tipos compartilhados do modulo Produtos.
 *
 * Refletem o contrato da API do backend em /api/produtos. A empresa nao e
 * enviada nem recebida aqui: ela e sempre derivada do usuario autenticado.
 * Unidade e categoria vem dos cadastros do catalogo (ver types/catalogo).
 */

import type { CategoriaResumo, UnidadeResumo } from '@/types/catalogo'

/** Produto conforme retornado pela API. */
export interface Produto {
  id: number
  nome: string
  /** Categoria com o caminho completo (ex.: "Ração › Úmida › Sachê"); null = sem categoria. */
  categoria: CategoriaResumo | null
  marca: string | null
  /** Unidade de venda (obrigatoria). */
  unidade: UnidadeResumo
  /** Unidade de compra; null quando o produto e comprado na mesma unidade de venda. */
  unidadeCompra: UnidadeResumo | null
  /** Quantas unidades de venda cabem em 1 unidade de compra; null sem unidade de compra. */
  fatorConversao: number | null
  /** Texto derivado pelo backend, ex.: "1 CX = 12 UN"; null sem unidade de compra. Só-leitura. */
  conversaoTexto: string | null
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
  /** UUID da unidade de venda (obrigatorio). */
  unidadeId: string
  /** UUID da categoria; null = sem categoria. */
  categoriaId: string | null
  /** UUID da unidade de compra; enviado sempre junto com `fatorConversao`. */
  unidadeCompraId: string | null
  fatorConversao: number | null
  marca: string | null
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
