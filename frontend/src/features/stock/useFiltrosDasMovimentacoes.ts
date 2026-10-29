import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { dataHojeSaoPaulo } from '@/features/products/produtoFormulario'
import { umDe } from '@/lib/listas'
import type { FiltrosDasMovimentacoes, MotivoMovimento, TipoMovimento } from '@/types/estoque'

/** Valor do parametro `aba` da area Estoque na aba Movimentacoes (sem ele, a Posicao). */
export const ABA_MOVIMENTACOES = 'movimentacoes'

const TIPOS: readonly TipoMovimento[] = ['ENTRADA', 'SAIDA', 'AJUSTE']

/** Motivos que cada tipo pode ter, os do sistema incluidos (o filtro so oferece os do tipo escolhido). */
const MOTIVOS_POR_TIPO: Readonly<Record<TipoMovimento, readonly MotivoMovimento[]>> = {
  ENTRADA: ['COMPRA', 'DEVOLUCAO_CLIENTE', 'ESTOQUE_INICIAL', 'CANCELAMENTO_VENDA', 'DEVOLUCAO_VENDA', 'OUTRO'],
  SAIDA: ['VENDA', 'PERDA_AVARIA', 'VENCIDO', 'USO_INTERNO', 'DEVOLUCAO_FORNECEDOR', 'OUTRO'],
  AJUSTE: ['CONTAGEM', 'OUTRO'],
}

/** Sem tipo, todos os motivos uma vez so, com "Outro" (que vale para os tres tipos) no fim. */
const TODOS_OS_MOTIVOS: readonly MotivoMovimento[] = [
  ...new Set(TIPOS.flatMap((tipo) => MOTIVOS_POR_TIPO[tipo]).filter((motivo) => motivo !== 'OUTRO')),
  'OUTRO',
]

/** Motivos oferecidos no filtro: os do tipo, ou todos sem tipo. */
export function motivosDoFiltro(tipo: TipoMovimento | null): readonly MotivoMovimento[] {
  return tipo === null ? TODOS_OS_MOTIVOS : MOTIVOS_POR_TIPO[tipo]
}

/** Atalhos de periodo, todos terminando hoje. */
export const ATALHOS_DE_PERIODO = [
  { id: 'hoje', rotulo: 'Hoje', dias: 1 },
  { id: '7', rotulo: '7 dias', dias: 7 },
  { id: '30', rotulo: '30 dias', dias: 30 },
] as const
export type AtalhoDePeriodo = (typeof ATALHOS_DE_PERIODO)[number]['id']

/** O periodo padrao (sem `de`/`ate` na URL): os ultimos 30 dias, como no backend. */
const DIAS_DO_PADRAO = 30
/** Maior distancia entre as duas datas (366 dias contando as duas), como no backend. */
const DIAS_ENTRE_DATAS_NO_MAXIMO = 365

export const MENSAGEM_PERIODO_INVERTIDO = 'A data inicial deve ser anterior à final.'
export const MENSAGEM_PERIODO_LONGO = 'O período pode ter no máximo 1 ano.'

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DIA_EM_MS = 24 * 60 * 60 * 1000

function lerData(valor: string | null): string | null {
  if (valor === null || !DATA_VALIDA.test(valor)) {
    return null
  }
  // Rejeita datas impossiveis (ex.: 2026-02-31), que o `Date` "corrigiria".
  const data = new Date(`${valor}T00:00:00Z`)
  return !Number.isNaN(data.getTime()) && data.toISOString().startsWith(valor) ? valor : null
}

/** Soma dias a uma data AAAA-MM-DD (negativo subtrai). */
export function somarDias(data: string, dias: number): string {
  return new Date(Date.parse(`${data}T00:00:00Z`) + dias * DIA_EM_MS).toISOString().slice(0, 10)
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_EM_MS)
}

/** Le a URL; valor desconhecido ou malformado vira o padrao (a URL nao e confiavel). */
function lerFiltros(params: URLSearchParams, hoje: string, podeFiltrarUsuario: boolean): FiltrosDasMovimentacoes {
  const ate = lerData(params.get('ate')) ?? hoje
  const de = lerData(params.get('de')) ?? somarDias(ate, -(DIAS_DO_PADRAO - 1))
  const produto = params.get('produto')
  const tipo = umDe(TIPOS, params.get('tipo'))
  const usuario = params.get('usuario')
  return {
    de,
    ate,
    produto: produto !== null && UUID.test(produto) ? produto : null,
    tipo,
    // Motivo que o tipo nao tem e ignorado: o select nao teria como mostra-lo.
    motivo: umDe(motivosDoFiltro(tipo), params.get('motivo')),
    // Sem o filtro na tela (OPERADOR), um `usuario` vindo num link nao filtra escondido.
    usuario: podeFiltrarUsuario && usuario !== null && /^\d{1,18}$/.test(usuario) ? Number(usuario) : null,
  }
}

function ehOPeriodoPadrao(filtros: Pick<FiltrosDasMovimentacoes, 'de' | 'ate'>, hoje: string): boolean {
  return filtros.ate === hoje && filtros.de === somarDias(hoje, -(DIAS_DO_PADRAO - 1))
}

/** Escreve a aba e so o que difere do padrao, sempre na mesma ordem. */
function escreverFiltros(filtros: FiltrosDasMovimentacoes, hoje: string): URLSearchParams {
  const params = new URLSearchParams({ aba: ABA_MOVIMENTACOES })
  if (!ehOPeriodoPadrao(filtros, hoje)) {
    params.set('de', filtros.de)
    params.set('ate', filtros.ate)
  }
  if (filtros.produto) {
    params.set('produto', filtros.produto)
  }
  if (filtros.tipo) {
    params.set('tipo', filtros.tipo)
  }
  if (filtros.motivo) {
    params.set('motivo', filtros.motivo)
  }
  if (filtros.usuario !== null) {
    params.set('usuario', String(filtros.usuario))
  }
  return params
}

const CAMPOS: readonly (keyof FiltrosDasMovimentacoes)[] = ['de', 'ate', 'produto', 'tipo', 'motivo', 'usuario']

/**
 * Estado da aba Movimentacoes guardado na URL (`?aba=movimentacoes&de=&ate=
 * &produto=&tipo=&motivo=&usuario=`). Sem datas, os ultimos 30 dias. Trocar o tipo tira
 * o motivo que ele nao tem. O periodo invertido ou maior que 1 ano vira
 * `erroDoPeriodo` (a lista nao e consultada). Sem `podeFiltrarUsuario` (so o
 * ADMIN ve o filtro), o `usuario` da URL e ignorado.
 */
export function useFiltrosDasMovimentacoes(podeFiltrarUsuario = true) {
  const [searchParams, setSearchParams] = useSearchParams()
  const hoje = dataHojeSaoPaulo()
  const filtros = useMemo(
    () => lerFiltros(searchParams, hoje, podeFiltrarUsuario),
    [searchParams, hoje, podeFiltrarUsuario],
  )

  const alterar = useCallback(
    // `substituir`: troca a entrada do historico (ex.: tirar um filtro invalido sem prender o Voltar).
    (parcial: Partial<FiltrosDasMovimentacoes>, { substituir = false }: { substituir?: boolean } = {}) => {
      const pedido: FiltrosDasMovimentacoes = { ...filtros, ...parcial }
      if (pedido.motivo !== null && !motivosDoFiltro(pedido.tipo).includes(pedido.motivo)) {
        pedido.motivo = null
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
    setSearchParams(new URLSearchParams({ aba: ABA_MOVIMENTACOES }), { flushSync: true })
  }, [setSearchParams])

  const escolherAtalho = useCallback(
    (atalho: AtalhoDePeriodo) => {
      const { dias } = ATALHOS_DE_PERIODO.find((opcao) => opcao.id === atalho) ?? ATALHOS_DE_PERIODO[2]
      alterar({ de: somarDias(hoje, -(dias - 1)), ate: hoje })
    },
    [alterar, hoje],
  )

  const atalho: AtalhoDePeriodo | null =
    filtros.ate === hoje
      ? (ATALHOS_DE_PERIODO.find((opcao) => filtros.de === somarDias(hoje, -(opcao.dias - 1)))?.id ?? null)
      : null
  const distancia = diasEntre(filtros.de, filtros.ate)
  const erroDoPeriodo =
    distancia < 0 ? MENSAGEM_PERIODO_INVERTIDO : distancia > DIAS_ENTRE_DATAS_NO_MAXIMO ? MENSAGEM_PERIODO_LONGO : null
  const temFiltroAtivo =
    !ehOPeriodoPadrao(filtros, hoje) ||
    filtros.produto !== null ||
    filtros.tipo !== null ||
    filtros.motivo !== null ||
    filtros.usuario !== null

  return { filtros, alterar, limpar, escolherAtalho, atalho, erroDoPeriodo, temFiltroAtivo, hoje }
}
