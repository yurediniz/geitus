import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PAGINA_MAXIMA } from '@/features/products/listagem/useFiltrosDaListaDeProdutos'
import { umDe } from '@/lib/listas'
import type { FiltrosDaListaDeFornecedores } from '@/types/fornecedor'
import { STATUS_FILTRO } from '@/types/produto'

/** Valores padrao: nao aparecem na URL. */
export const FILTROS_PADRAO_FORNECEDORES: FiltrosDaListaDeFornecedores = {
  busca: '',
  status: 'ativos',
  pagina: 1,
}

function lerPagina(valor: string | null): number {
  if (valor === null || !/^\d+$/.test(valor)) {
    return 1
  }
  const pagina = Number(valor)
  return pagina >= 1 ? Math.min(pagina, PAGINA_MAXIMA) : 1
}

/** Le a URL; valor desconhecido ou malformado vira o padrao (a URL nao e confiavel). */
function lerFiltros(params: URLSearchParams): FiltrosDaListaDeFornecedores {
  return {
    busca: (params.get('busca') ?? '').trim(),
    status: umDe(STATUS_FILTRO, params.get('status')) ?? FILTROS_PADRAO_FORNECEDORES.status,
    pagina: lerPagina(params.get('pagina')),
  }
}

/** Escreve so o que difere do padrao. */
function escreverFiltros(filtros: FiltrosDaListaDeFornecedores): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.busca) {
    params.set('busca', filtros.busca)
  }
  if (filtros.status !== FILTROS_PADRAO_FORNECEDORES.status) {
    params.set('status', filtros.status)
  }
  if (filtros.pagina !== FILTROS_PADRAO_FORNECEDORES.pagina) {
    params.set('pagina', String(filtros.pagina))
  }
  return params
}

const CAMPOS = Object.keys(FILTROS_PADRAO_FORNECEDORES) as (keyof FiltrosDaListaDeFornecedores)[]

/**
 * Estado da lista de fornecedores na URL (`?busca=&status=&pagina=`), como a
 * lista de produtos: mudar a busca ou o status volta para a pagina 1; a busca
 * substitui a entrada do historico (cada letra nao vira um "Voltar").
 */
export function useFiltrosDaListaDeFornecedores() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filtros = useMemo(() => lerFiltros(searchParams), [searchParams])

  const alterar = useCallback(
    (parcial: Partial<FiltrosDaListaDeFornecedores>, opcoes: { substituir?: boolean } = {}) => {
      const pedido: FiltrosDaListaDeFornecedores = {
        ...filtros,
        ...parcial,
        busca: (parcial.busca ?? filtros.busca).trim(),
      }
      const mudou = CAMPOS.filter((campo) => pedido[campo] !== filtros[campo])
      if (mudou.length === 0) {
        return
      }
      const proximos = mudou.some((campo) => campo !== 'pagina') ? { ...pedido, pagina: 1 } : pedido
      setSearchParams(escreverFiltros(proximos), { replace: opcoes.substituir ?? mudou.includes('busca') })
    },
    [filtros, setSearchParams],
  )

  const limpar = useCallback(() => setSearchParams(new URLSearchParams()), [setSearchParams])

  const temFiltroAtivo = filtros.busca !== '' || filtros.status !== FILTROS_PADRAO_FORNECEDORES.status
  return { filtros, alterar, limpar, temFiltroAtivo }
}
