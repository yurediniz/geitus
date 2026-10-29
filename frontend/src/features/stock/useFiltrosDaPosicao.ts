import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'

import { PAGINA_MAXIMA, type OpcoesDeAlteracao } from '@/features/products/listagem/useFiltrosDaListaDeProdutos'
import { algunsDe, mesmoValor, umDe } from '@/lib/listas'
import { ORDENS_POSICAO, SITUACOES_POSICAO, STATUS_POSICAO, type FiltrosDaPosicao } from '@/types/estoque'

/** Valores padrao: nao aparecem na URL. */
export const FILTROS_PADRAO_DA_POSICAO: FiltrosDaPosicao = {
  busca: '',
  status: 'ativos',
  categoria: null,
  situacao: [],
  ordem: 'nome',
  pagina: 1,
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function lerPagina(valor: string | null): number {
  if (valor === null || !/^\d+$/.test(valor)) {
    return 1
  }
  const pagina = Number(valor)
  return pagina >= 1 ? Math.min(pagina, PAGINA_MAXIMA) : 1
}

/** Le a URL; qualquer valor desconhecido ou malformado vira o padrao (a URL nao e confiavel). */
function lerFiltros(params: URLSearchParams): FiltrosDaPosicao {
  const categoria = params.get('categoria')
  return {
    busca: (params.get('busca') ?? '').trim(),
    status: umDe(STATUS_POSICAO, params.get('status')) ?? FILTROS_PADRAO_DA_POSICAO.status,
    categoria: categoria !== null && UUID.test(categoria) ? categoria : null,
    situacao: algunsDe(SITUACOES_POSICAO, params.getAll('situacao')),
    ordem: umDe(ORDENS_POSICAO, params.get('ordem')) ?? FILTROS_PADRAO_DA_POSICAO.ordem,
    pagina: lerPagina(params.get('pagina')),
  }
}

/** Escreve so o que difere do padrao, sempre na mesma ordem. */
function escreverFiltros(filtros: FiltrosDaPosicao): URLSearchParams {
  const params = new URLSearchParams()
  if (filtros.busca) {
    params.set('busca', filtros.busca)
  }
  if (filtros.status !== FILTROS_PADRAO_DA_POSICAO.status) {
    params.set('status', filtros.status)
  }
  if (filtros.categoria) {
    params.set('categoria', filtros.categoria)
  }
  for (const situacao of filtros.situacao) {
    params.append('situacao', situacao)
  }
  if (filtros.ordem !== FILTROS_PADRAO_DA_POSICAO.ordem) {
    params.set('ordem', filtros.ordem)
  }
  if (filtros.pagina !== FILTROS_PADRAO_DA_POSICAO.pagina) {
    params.set('pagina', String(filtros.pagina))
  }
  return params
}

/** Quantos filtros restringem a lista fora a busca (o botao "Filtros" do celular mostra o numero). */
function contarFiltros(filtros: FiltrosDaPosicao): number {
  return [
    filtros.status !== FILTROS_PADRAO_DA_POSICAO.status,
    filtros.categoria !== FILTROS_PADRAO_DA_POSICAO.categoria,
    filtros.situacao.length > 0,
  ].filter(Boolean).length
}

const CAMPOS = Object.keys(FILTROS_PADRAO_DA_POSICAO) as (keyof FiltrosDaPosicao)[]

/**
 * Estado da posicao de estoque guardado na URL (`?busca=&status=&categoria=
 * &situacao=&situacao=&ordem=&pagina=`, a situacao repetida por valor), com
 * as mesmas regras da lista de produtos: mudar qualquer coisa alem da pagina
 * volta para a 1; a busca substitui a
 * entrada do historico; alterar sem mudanca real nao mexe na URL.
 */
export function useFiltrosDaPosicao() {
  const [searchParams, setSearchParams] = useSearchParams()
  const filtros = useMemo(() => lerFiltros(searchParams), [searchParams])

  const alterar = useCallback(
    (parcial: Partial<FiltrosDaPosicao>, opcoes: OpcoesDeAlteracao = {}) => {
      const pedido: FiltrosDaPosicao = {
        ...filtros,
        ...parcial,
        busca: (parcial.busca ?? filtros.busca).trim(),
        // Na ordem da lista e sem repetidos, como a URL guarda: a comparacao abaixo e pelo conteudo.
        situacao: algunsDe(SITUACOES_POSICAO, parcial.situacao ?? filtros.situacao),
      }
      const mudou = CAMPOS.filter((campo) => !mesmoValor(pedido[campo], filtros[campo]))
      if (mudou.length === 0) {
        return
      }
      const mudouFiltro = mudou.some((campo) => campo !== 'pagina')
      const proximos = mudouFiltro ? { ...pedido, pagina: 1 } : pedido
      const substituir = opcoes.substituir ?? mudou.includes('busca')
      // flushSync: a URL nova e o proximo render saem juntos. Sem isso, o React Router aplica a
      // navegacao numa transicao, e uma acao logo em seguida (Enter na busca, leitor de codigo)
      // ainda usaria o `alterar` com os filtros antigos e traria de volta o que foi limpo.
      setSearchParams(escreverFiltros(proximos), { replace: substituir, flushSync: true })
    },
    [filtros, setSearchParams],
  )

  const limpar = useCallback(() => {
    setSearchParams(escreverFiltros({ ...FILTROS_PADRAO_DA_POSICAO, ordem: filtros.ordem }), { flushSync: true })
  }, [filtros.ordem, setSearchParams])

  const quantidadeDeFiltros = contarFiltros(filtros)
  const temFiltroAtivo = filtros.busca !== '' || quantidadeDeFiltros > 0
  return { filtros, alterar, limpar, temFiltroAtivo, quantidadeDeFiltros }
}
