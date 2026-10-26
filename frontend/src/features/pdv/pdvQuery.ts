import type { FiltrosDeVendas } from '@/types/pdv'

/**
 * Chaves de cache do PDV, sob o prefixo `['pdv']`. O carrinho nao fica no
 * cache (vive no `localStorage`); a sessao de caixa usa as chaves do Caixa.
 */
export const PDV_QUERY_KEY = ['pdv'] as const

export const CHAVE_DA_CONFIGURACAO_DO_PDV = [...PDV_QUERY_KEY, 'configuracao'] as const

export function chaveDaBuscaDeProdutos(texto: string) {
  return [...PDV_QUERY_KEY, 'busca', texto] as const
}

/** A empresa do usuario (cabecalho do comprovante): a mesma chave da tela Empresa, que divide o cache. */
export const CHAVE_DA_EMPRESA = ['empresa', 'minha'] as const

/** O catalogo de uma categoria (null = todas); as paginas ficam juntas (useInfiniteQuery). */
export function chaveDoCatalogo(categoria: string | null) {
  return [...PDV_QUERY_KEY, 'catalogo', categoria] as const
}

export function chaveDasVendas(filtros: FiltrosDeVendas) {
  return [...PDV_QUERY_KEY, 'vendas', filtros] as const
}

export function chaveDaVenda(id: string) {
  return [...PDV_QUERY_KEY, 'venda', id] as const
}
