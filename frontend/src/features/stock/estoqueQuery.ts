import type { FiltrosDaPosicao } from '@/types/estoque'

/** Prefixo de tudo o que a area Estoque guarda no cache (o ajuste de estoque invalida). */
export const ESTOQUE_QUERY_KEY = ['estoque'] as const

export function chaveDaPosicao(filtros: FiltrosDaPosicao) {
  return [...ESTOQUE_QUERY_KEY, 'posicao', filtros] as const
}

/** O resumo nao depende da situacao, da ordem nem da pagina. */
export function chaveDoResumo(filtros: Pick<FiltrosDaPosicao, 'busca' | 'status' | 'categoria'>) {
  return [...ESTOQUE_QUERY_KEY, 'resumo', { busca: filtros.busca, status: filtros.status, categoria: filtros.categoria }] as const
}
