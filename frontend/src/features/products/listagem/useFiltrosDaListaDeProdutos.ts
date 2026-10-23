import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { EstoqueFiltro, FiltrosDaListaDeProdutos, OrdemProdutos, StatusFiltro } from '@/types/produto'

/** Valores padrao: nao aparecem na URL. */
export const FILTROS_PADRAO: FiltrosDaListaDeProdutos = {
  busca: '',
  status: 'ativos',
  categoria: null,
  estoque: null,
  promocao: false,
  ordem: 'nome',
  pagina: 1,
}

const STATUS: readonly StatusFiltro[] = ['ativos', 'inativos', 'todos']
const ESTOQUES: readonly EstoqueFiltro[] = ['baixo', 'sem']
export const ORDENS: readonly OrdemProdutos[] = [
  'nome',
  '-nome',
  'preco',
  '-preco',
  'margem',
  '-margem',
  'estoque',
  '-estoque',
  'recentes',
  'atualizados',
]

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function umDe<T extends string>(validos: readonly T[], valor: string | null): T | null {
  return validos.find((item) => item === valor) ?? null
}

function lerPagina(valor: string | null): number {
  if (valor === null || !/^\d+$/.test(valor)) {
    return 1
  }
  const pagina = Number(valor)
  return Number.isSafeInteger(pagina) && pagina >= 1 ? pagina : 1
}

/** Le a URL; qualquer valor desconhecido ou malformado vira o padrao (a URL nao e confiavel). */
function lerFiltros(params: URLSearchParams): FiltrosDaListaDeProdutos {
  const categoria = params.get('categoria')
  return {
    busca: (params.get('busca') ?? '').trim(),
    status: umDe(STATUS, params.get('status')) ?? FILTROS_PADRAO.status,
    categoria: categoria !== null && UUID.test(categoria) ? categoria : null,
    estoque: umDe(ESTOQUES, params.get('estoque')),
    promocao: params.get('promocao') === '1',
    ordem: umDe(ORDENS, params.get('ordem')) ?? FILTROS_PADRAO.ordem,
    pagina: lerPagina(params.get('pagina')),
  }
}

/** Escreve so o que difere do padrao, sempre na mesma ordem. */
function escreverFiltros(filtros: FiltrosDaListaDeProdutos): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.busca) {
    params.set('busca', filtros.busca)
  }
  if (filtros.status !== FILTROS_PADRAO.status) {
    params.set('status', filtros.status)
  }
  if (filtros.categoria) {
    params.set('categoria', filtros.categoria)
  }
  if (filtros.estoque) {
    params.set('estoque', filtros.estoque)
  }
  if (filtros.promocao) {
    params.set('promocao', '1')
  }
  if (filtros.ordem !== FILTROS_PADRAO.ordem) {
    params.set('ordem', filtros.ordem)
  }
  if (filtros.pagina !== FILTROS_PADRAO.pagina) {
    params.set('pagina', String(filtros.pagina))
  }
  return params
}

/** Filtros de verdade (a ordem e a pagina nao restringem a lista). */
function temFiltro(filtros: FiltrosDaListaDeProdutos): boolean {
  return (
    filtros.busca !== FILTROS_PADRAO.busca ||
    filtros.status !== FILTROS_PADRAO.status ||
    filtros.categoria !== FILTROS_PADRAO.categoria ||
    filtros.estoque !== FILTROS_PADRAO.estoque ||
    filtros.promocao !== FILTROS_PADRAO.promocao
  )
}

const CAMPOS = Object.keys(FILTROS_PADRAO) as (keyof FiltrosDaListaDeProdutos)[]

export interface OpcoesDeAlteracao {
  /** Substitui a entrada do historico (ex.: corrigir uma pagina alem do fim). */
  substituir?: boolean
}

/**
 * Estado da lista de produtos guardado na URL (`?busca=&status=&categoria=
 * &estoque=&promocao=1&ordem=&pagina=`), para "Voltar" e a volta da edicao
 * reabrirem a lista onde estava.
 *
 * - Mudar qualquer coisa alem da pagina volta para a pagina 1.
 * - A busca substitui a entrada do historico (cada letra nao vira um "Voltar");
 *   filtros, ordem e pagina criam uma entrada nova.
 * - Alterar sem mudanca real nao mexe na URL.
 */
export function useFiltrosDaListaDeProdutos() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filtros = useMemo(() => lerFiltros(searchParams), [searchParams])

  const alterar = useCallback(
    (parcial: Partial<FiltrosDaListaDeProdutos>, opcoes: OpcoesDeAlteracao = {}) => {
      const pedido: FiltrosDaListaDeProdutos = {
        ...filtros,
        ...parcial,
        busca: (parcial.busca ?? filtros.busca).trim(),
      }
      const mudou = CAMPOS.filter((campo) => pedido[campo] !== filtros[campo])
      if (mudou.length === 0) {
        return
      }
      const mudouFiltro = mudou.some((campo) => campo !== 'pagina')
      const proximos = mudouFiltro ? { ...pedido, pagina: 1 } : pedido
      const substituir = opcoes.substituir ?? mudou.includes('busca')
      setSearchParams(escreverFiltros(proximos), { replace: substituir })
    },
    [filtros, setSearchParams],
  )

  const limpar = useCallback(() => {
    setSearchParams(escreverFiltros({ ...FILTROS_PADRAO, ordem: filtros.ordem }))
  }, [filtros.ordem, setSearchParams])

  return { filtros, alterar, limpar, temFiltroAtivo: temFiltro(filtros) }
}
