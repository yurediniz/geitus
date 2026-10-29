import { CircleAlert, CircleCheck, CircleMinus, PackagePlus, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react'

import { SITUACOES_DO_FILTRO, type SituacaoDoFiltro } from '@/types/estoque'

/**
 * Rotulos do filtro de situacao, os mesmos na posicao de estoque ("Situação")
 * e na lista de produtos ("Estoque").
 */
export const ROTULOS_DA_SITUACAO_DO_FILTRO: Readonly<Record<SituacaoDoFiltro, string>> = {
  negativo: 'Negativo',
  zerado: 'Zerado',
  baixo: 'Baixo',
  reposicao: 'Reposição',
  regular: 'Regular',
  alto: 'Alto',
}

/** Os icones dos selos da situacao (`SeloSituacaoEstoque`); Regular, que nao tem selo, ganha o seu. */
const ICONE_DA_SITUACAO: Readonly<Record<SituacaoDoFiltro, LucideIcon>> = {
  negativo: CircleMinus,
  zerado: CircleAlert,
  baixo: TriangleAlert,
  reposicao: PackagePlus,
  regular: CircleCheck,
  alto: TrendingUp,
}

/** As opcoes do filtro de multisselecao, na ordem da spec (regra 16). */
export const OPCOES_DA_SITUACAO_DO_FILTRO = SITUACOES_DO_FILTRO.map((valor) => ({
  valor,
  rotulo: ROTULOS_DA_SITUACAO_DO_FILTRO[valor],
  Icone: ICONE_DA_SITUACAO[valor],
}))
