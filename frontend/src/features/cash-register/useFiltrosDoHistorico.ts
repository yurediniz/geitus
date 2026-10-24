import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PAGINA_MAXIMA } from '@/features/products/listagem/useFiltrosDaListaDeProdutos'
import { umDe } from '@/lib/listas'
import { STATUS_DA_SESSAO, type FiltrosDoHistoricoDeCaixa } from '@/types/caixa'

/** Valores padrao: nao aparecem na URL. Sem filtro, todas as sessoes visiveis ao usuario. */
export const FILTROS_PADRAO_HISTORICO: FiltrosDoHistoricoDeCaixa = {
  pontoId: '',
  status: '',
  de: '',
  ate: '',
  pagina: 1,
}

/** Nome do parametro na URL de cada filtro. */
const PARAMETRO: Readonly<Record<keyof FiltrosDoHistoricoDeCaixa, string>> = {
  pontoId: 'ponto',
  status: 'situacao',
  de: 'de',
  ate: 'ate',
  pagina: 'pagina',
}

/** O id do ponto e um UUID: outro valor na URL e ignorado. */
const ID_VALIDO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/

function lerData(valor: string | null): string {
  if (valor === null || !DATA_VALIDA.test(valor)) {
    return ''
  }
  // Rejeita datas impossiveis (ex.: 2026-02-31), que o `Date` "corrigiria".
  const data = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(data.getTime()) && data.toISOString().startsWith(valor) ? valor : ''
}

function lerPagina(valor: string | null): number {
  if (valor === null || !/^\d+$/.test(valor)) {
    return 1
  }
  const pagina = Number(valor)
  return pagina >= 1 ? Math.min(pagina, PAGINA_MAXIMA) : 1
}

/** Le a URL; valor desconhecido ou malformado vira o padrao (a URL nao e confiavel). */
function lerFiltros(params: URLSearchParams): FiltrosDoHistoricoDeCaixa {
  const pontoId = params.get(PARAMETRO.pontoId) ?? ''
  return {
    pontoId: ID_VALIDO.test(pontoId) ? pontoId : '',
    status: umDe(STATUS_DA_SESSAO, params.get(PARAMETRO.status)) ?? '',
    de: lerData(params.get(PARAMETRO.de)),
    ate: lerData(params.get(PARAMETRO.ate)),
    pagina: lerPagina(params.get(PARAMETRO.pagina)),
  }
}

const CAMPOS = Object.keys(FILTROS_PADRAO_HISTORICO) as (keyof FiltrosDoHistoricoDeCaixa)[]

/** Escreve so o que difere do padrao. */
function escreverFiltros(filtros: FiltrosDoHistoricoDeCaixa): URLSearchParams {
  const params = new URLSearchParams()
  for (const campo of CAMPOS) {
    if (filtros[campo] !== FILTROS_PADRAO_HISTORICO[campo]) {
      params.set(PARAMETRO[campo], String(filtros[campo]))
    }
  }
  return params
}

/**
 * Filtros do historico do caixa na URL (`?ponto=&situacao=&de=&ate=&pagina=`),
 * no padrao da lista de fornecedores: mudar um filtro volta para a pagina 1.
 */
export function useFiltrosDoHistorico() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filtros = useMemo(() => lerFiltros(searchParams), [searchParams])

  const alterar = useCallback(
    (parcial: Partial<FiltrosDoHistoricoDeCaixa>) => {
      const pedido: FiltrosDoHistoricoDeCaixa = { ...filtros, ...parcial }
      const mudou = CAMPOS.filter((campo) => pedido[campo] !== filtros[campo])
      if (mudou.length === 0) {
        return
      }
      const proximos = mudou.some((campo) => campo !== 'pagina') ? { ...pedido, pagina: 1 } : pedido
      setSearchParams(escreverFiltros(proximos))
    },
    [filtros, setSearchParams],
  )

  const limpar = useCallback(() => setSearchParams(new URLSearchParams()), [setSearchParams])

  const temFiltroAtivo = filtros.pontoId !== '' || filtros.status !== '' || filtros.de !== '' || filtros.ate !== ''
  return { filtros, alterar, limpar, temFiltroAtivo }
}
