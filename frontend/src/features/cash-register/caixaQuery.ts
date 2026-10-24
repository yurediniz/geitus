import type { FiltrosDoHistoricoDeCaixa } from '@/types/caixa'

/**
 * Chaves de cache do caixa, todas sob o prefixo `['caixa']`: depois de cada
 * mutacao (abrir, lancar, contar, fechar, pontos e configuracao) invalidar o
 * prefixo atualiza a sessao atual, os pontos, o historico e a configuracao.
 */
export const CAIXA_QUERY_KEY = ['caixa'] as const

/** Lista de pontos; sem `ativo`, ativos e inativos. */
export function chaveDosPontos(ativo?: boolean) {
  return [...CAIXA_QUERY_KEY, 'pontos', ativo ?? 'todos'] as const
}

/** Sessao aberta pelo usuario (ou null). */
export const CHAVE_DA_SESSAO_ATUAL = [...CAIXA_QUERY_KEY, 'sessao-atual'] as const

export function chaveDaSessao(id: string) {
  return [...CAIXA_QUERY_KEY, 'sessao', id] as const
}

export function chaveDoHistorico(filtros: FiltrosDoHistoricoDeCaixa) {
  return [...CAIXA_QUERY_KEY, 'historico', filtros] as const
}

export const CHAVE_DA_CONFIGURACAO_DO_CAIXA = [...CAIXA_QUERY_KEY, 'configuracao'] as const
