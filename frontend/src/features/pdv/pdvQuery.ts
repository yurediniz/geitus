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

export function chaveDasVendas(filtros: FiltrosDeVendas) {
  return [...PDV_QUERY_KEY, 'vendas', filtros] as const
}

export function chaveDaVenda(id: string) {
  return [...PDV_QUERY_KEY, 'venda', id] as const
}
