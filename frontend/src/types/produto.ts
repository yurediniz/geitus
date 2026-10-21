/**
 * Tipos compartilhados do modulo Produtos.
 *
 * Refletem o contrato da API do backend em /api/produtos. A empresa nao e
 * enviada nem recebida aqui: ela e sempre derivada do usuario autenticado.
 * Unidade e categoria vem dos cadastros do catalogo (ver types/catalogo).
 */

import type { CategoriaResumo, UnidadeResumo } from '@/types/catalogo'

/**
 * Formato reconhecido de um codigo de barras: EAN-8, UPC-A e EAN-13 (so digitos,
 * com digito verificador GS1 valido) ou `OUTRO` (qualquer outro conteudo).
 */
export type FormatoCodigoBarras = 'EAN8' | 'UPCA' | 'EAN13' | 'OUTRO'

/** Codigo de barras do produto, na ordem de exibicao (o primeiro aparece na listagem). */
export interface CodigoBarras {
  codigo: string
  formato: FormatoCodigoBarras
}

/** Campos de texto livre com sugestoes dos valores ja usados na empresa. */
export type CampoSugestaoProduto = 'marca' | 'fornecedor'

/** Produto conforme retornado pela API. */
export interface Produto {
  /** UUID publico do produto (o id numerico interno nao sai na API). */
  id: string
  nome: string
  /** Nome curto informado (ate 30); null quando nao informado. */
  nomeCurto: string | null
  /** Nome usado no cupom e no PDV: o nome curto ou os 30 primeiros caracteres do nome. Só-leitura. */
  nomeCurtoEfetivo: string
  /** Categoria com o caminho completo (ex.: "Ração › Úmida › Sachê"); null = sem categoria. */
  categoria: CategoriaResumo | null
  marca: string | null
  /** Fornecedor principal em texto livre. */
  fornecedor: string | null
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
  /** De 0 a 20 codigos, na ordem de exibicao. */
  codigosBarras: CodigoBarras[]
  sku: string | null
  ativo: boolean
  /** Se o produto pode ser excluido fisicamente (nunca teve venda nem movimentacao). */
  podeExcluir: boolean
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
  nomeCurto: string | null
  /** UUID da unidade de venda (obrigatorio). */
  unidadeId: string
  /** UUID da categoria; null = sem categoria. */
  categoriaId: string | null
  /** UUID da unidade de compra; enviado sempre junto com `fatorConversao`. */
  unidadeCompraId: string | null
  fatorConversao: number | null
  marca: string | null
  fornecedor: string | null
  descricao: string | null
  precoVenda: number
  custo: number | null
  precoMinimo: number | null
  estoqueMinimo: number | null
  estoqueMaximo: number | null
  pontoReposicao: number | null
  /** Lista completa e ordenada: o PATCH substitui a lista gravada (removidos sao apagados). */
  codigosBarras: string[]
  sku: string | null
}

export type ProdutoStatusFiltro = 'todos' | 'ativos' | 'inativos'

export interface ListarProdutosParams {
  busca?: string
  status?: ProdutoStatusFiltro
}
