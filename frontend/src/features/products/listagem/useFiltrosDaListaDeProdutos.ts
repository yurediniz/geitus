import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { umDe } from '@/lib/listas'
import { ESTOQUE_FILTRO, ORDENS_PRODUTOS, STATUS_FILTRO, type FiltrosDaListaDeProdutos } from '@/types/produto'

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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Maior pagina aceita na URL: acima disso, o backend responderia 400 em laco de "Tentar de novo". */
export const PAGINA_MAXIMA = 1_000_000

function lerPagina(valor: string | null): number {
  if (valor === null || !/^\d+$/.test(valor)) {
    return 1
  }
  const pagina = Number(valor)
  return pagina >= 1 ? Math.min(pagina, PAGINA_MAXIMA) : 1
}

/** Le a URL; qualquer valor desconhecido ou malformado vira o padrao (a URL nao e confiavel). */
function lerFiltros(params: URLSearchParams): FiltrosDaListaDeProdutos {
  const categoria = params.get('categoria')
  return {
    busca: (params.get('busca') ?? '').trim(),
    status: umDe(STATUS_FILTRO, params.get('status')) ?? FILTROS_PADRAO.status,
    categoria: categoria !== null && UUID.test(categoria) ? categoria : null,
    estoque: umDe(ESTOQUE_FILTRO, params.get('estoque')),
    promocao: params.get('promocao') === '1',
    ordem: umDe(ORDENS_PRODUTOS, params.get('ordem')) ?? FILTROS_PADRAO.ordem,
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

/** Quantos filtros restringem a lista fora a busca (o botao "Filtros" do celular mostra o numero). */
function contarFiltros(filtros: FiltrosDaListaDeProdutos): number {
  return [
    filtros.status !== FILTROS_PADRAO.status,
    filtros.categoria !== FILTROS_PADRAO.categoria,
    filtros.estoque !== FILTROS_PADRAO.estoque,
    filtros.promocao !== FILTROS_PADRAO.promocao,
  ].filter(Boolean).length
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

  const quantidadeDeFiltros = contarFiltros(filtros)
  // A ordem e a pagina nao restringem a lista: nao contam como filtro.
  const temFiltroAtivo = filtros.busca !== '' || quantidadeDeFiltros > 0
  return { filtros, alterar, limpar, temFiltroAtivo, quantidadeDeFiltros }
}
