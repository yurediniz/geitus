import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PAGINA_MAXIMA } from '@/features/products/listagem/useFiltrosDaListaDeProdutos'
import { dataHojeSaoPaulo } from '@/features/products/produtoFormulario'
import {
  ATALHOS_DE_PERIODO,
  diasEntre,
  lerData,
  MENSAGEM_PERIODO_LONGO,
  somarDias,
  type AtalhoDePeriodo,
} from '@/features/stock/useFiltrosDasMovimentacoes'
import { umDe } from '@/lib/listas'
import type { FiltrosDeVendas, StatusDaVenda } from '@/types/pdv'

/** O mesmo dia vale: a mensagem nao fala em "anterior" (a do backend de Vendas e a mesma). */
export const MENSAGEM_DATA_INICIAL_DEPOIS = 'A data inicial não pode ser depois da final.'

/** Filtros da tela Vendas, como ficam na URL. */
export interface FiltrosDaTelaDeVendas {
  /** Datas `AAAA-MM-DD`; sem elas na URL, hoje. */
  de: string
  ate: string
  status: StatusDaVenda | null
  /** So digitos; preenchido, a busca vale para qualquer data. */
  numero: string
  /** So o ADMIN filtra por ponto (UUID) e por vendedor (id do usuario). */
  pontoId: string | null
  vendedorId: number | null
  pagina: number
}

export const STATUS_DO_FILTRO: readonly StatusDaVenda[] = ['CONCLUIDA', 'CANCELADA']

/** Maior distancia entre as duas datas (366 dias contando as duas), como no backend. */
const DIAS_ENTRE_DATAS_NO_MAXIMO = 365
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUMERO = /^\d{1,9}$/

function lerPagina(valor: string | null): number {
  if (valor === null || !/^\d+$/.test(valor)) {
    return 1
  }
  const pagina = Number(valor)
  return pagina >= 1 ? Math.min(pagina, PAGINA_MAXIMA) : 1
}

/** Le a URL; valor desconhecido ou malformado vira o padrao (a URL nao e confiavel). */
function lerFiltros(params: URLSearchParams, hoje: string, ehAdmin: boolean): FiltrosDaTelaDeVendas {
  const ate = lerData(params.get('ate')) ?? hoje
  const de = lerData(params.get('de')) ?? ate
  const numero = params.get('numero') ?? ''
  const pontoId = params.get('ponto')
  const vendedor = params.get('vendedor')
  return {
    de,
    ate,
    status: umDe(STATUS_DO_FILTRO, params.get('status')),
    numero: NUMERO.test(numero) ? numero : '',
    // Sem os filtros na tela (OPERADOR), ponto e vendedor vindos num link nao filtram escondido.
    pontoId: ehAdmin && pontoId !== null && UUID.test(pontoId) ? pontoId.toLowerCase() : null,
    vendedorId: ehAdmin && vendedor !== null && /^\d{1,18}$/.test(vendedor) ? Number(vendedor) : null,
    pagina: lerPagina(params.get('pagina')),
  }
}

function ehOPeriodoPadrao(filtros: Pick<FiltrosDaTelaDeVendas, 'de' | 'ate'>, hoje: string): boolean {
  return filtros.de === hoje && filtros.ate === hoje
}

/** So o que difere do padrao, sempre na mesma ordem. */
function escreverFiltros(filtros: FiltrosDaTelaDeVendas, hoje: string): URLSearchParams {
  const params = new URLSearchParams()
  if (!ehOPeriodoPadrao(filtros, hoje)) {
    params.set('de', filtros.de)
    params.set('ate', filtros.ate)
  }
  if (filtros.status) {
    params.set('status', filtros.status)
  }
  if (filtros.numero) {
    params.set('numero', filtros.numero)
  }
  if (filtros.pontoId) {
    params.set('ponto', filtros.pontoId)
  }
  if (filtros.vendedorId !== null) {
    params.set('vendedor', String(filtros.vendedorId))
  }
  if (filtros.pagina > 1) {
    params.set('pagina', String(filtros.pagina))
  }
  return params
}

const CAMPOS: readonly (keyof FiltrosDaTelaDeVendas)[] = [
  'de',
  'ate',
  'status',
  'numero',
  'pontoId',
  'vendedorId',
  'pagina',
]

/** O pedido da lista: com numero, sem o periodo (a busca vale para qualquer data); sem sessao. */
export function filtrosDaApi(filtros: FiltrosDaTelaDeVendas): FiltrosDeVendas {
  const porNumero = filtros.numero !== ''
  return {
    sessaoId: '',
    status: filtros.status ?? '',
    de: porNumero ? '' : filtros.de,
    ate: porNumero ? '' : filtros.ate,
    numero: filtros.numero,
    pontoId: filtros.pontoId ?? '',
    vendedorId: filtros.vendedorId === null ? '' : String(filtros.vendedorId),
    pagina: filtros.pagina,
  }
}

/**
 * Estado da tela Vendas guardado na URL (`/vendas?de=&ate=&status=&numero=
 * &ponto=&vendedor=&pagina=`). Sem datas, hoje. Mudar um filtro volta para a
 * pagina 1. O periodo invertido ou maior que 1 ano vira `erroDoPeriodo` (sem
 * numero, a lista nao e consultada). Sem `ehAdmin`, ponto e vendedor da URL
 * sao ignorados.
 */
export function useFiltrosDasVendas(ehAdmin: boolean) {
  const [searchParams, setSearchParams] = useSearchParams()
  const hoje = dataHojeSaoPaulo()
  const filtros = useMemo(() => lerFiltros(searchParams, hoje, ehAdmin), [searchParams, hoje, ehAdmin])

  const alterar = useCallback(
    // `substituir`: troca a entrada do historico (ex.: cada tecla do numero nao vira um Voltar).
    (parcial: Partial<FiltrosDaTelaDeVendas>, { substituir = false }: { substituir?: boolean } = {}) => {
      const pedido: FiltrosDaTelaDeVendas = { ...filtros, ...parcial }
      if (parcial.pagina === undefined) {
        pedido.pagina = 1
      }
      if (CAMPOS.every((campo) => pedido[campo] === filtros[campo])) {
        return
      }
      // flushSync: a URL nova e o proximo render saem juntos (ver useFiltrosDaListaDeProdutos).
      setSearchParams(escreverFiltros(pedido, hoje), { replace: substituir, flushSync: true })
    },
    [filtros, hoje, setSearchParams],
  )

  const limpar = useCallback(() => {
    setSearchParams(new URLSearchParams(), { flushSync: true })
  }, [setSearchParams])

  const escolherAtalho = useCallback(
    (atalho: AtalhoDePeriodo) => {
      const { dias } = ATALHOS_DE_PERIODO.find((opcao) => opcao.id === atalho) ?? ATALHOS_DE_PERIODO[0]
      // Escolher um periodo apaga o numero: com numero, o periodo nao vale.
      alterar({ de: somarDias(hoje, -(dias - 1)), ate: hoje, numero: '' })
    },
    [alterar, hoje],
  )

  const atalho: AtalhoDePeriodo | null =
    filtros.ate === hoje
      ? (ATALHOS_DE_PERIODO.find((opcao) => filtros.de === somarDias(hoje, -(opcao.dias - 1)))?.id ?? null)
      : null
  const distancia = diasEntre(filtros.de, filtros.ate)
  const erroDoPeriodo =
    distancia < 0 ? MENSAGEM_DATA_INICIAL_DEPOIS : distancia > DIAS_ENTRE_DATAS_NO_MAXIMO ? MENSAGEM_PERIODO_LONGO : null
  const temFiltroAtivo =
    !ehOPeriodoPadrao(filtros, hoje) ||
    filtros.status !== null ||
    filtros.numero !== '' ||
    filtros.pontoId !== null ||
    filtros.vendedorId !== null

  return { filtros, alterar, limpar, escolherAtalho, atalho, erroDoPeriodo, temFiltroAtivo, hoje }
}
