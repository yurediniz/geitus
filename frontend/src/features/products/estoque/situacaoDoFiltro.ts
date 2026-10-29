import type { SituacaoDoFiltro } from '@/types/estoque'

/**
 * Rotulos do filtro de situacao, os mesmos na posicao de estoque ("Situação")
 * e na lista de produtos ("Estoque"); `repor` diz o que junta.
 */
export const ROTULOS_DA_SITUACAO_DO_FILTRO: Readonly<Record<SituacaoDoFiltro, string>> = {
  repor: 'Repor (negativo, zerado, baixo ou reposição)',
  negativo: 'Negativo',
  zerado: 'Zerado',
  baixo: 'Baixo',
  reposicao: 'Reposição',
  regular: 'Regular',
  alto: 'Alto',
}
