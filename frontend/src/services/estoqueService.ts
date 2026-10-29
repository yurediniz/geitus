import { apiGet, apiPost } from '@/services/httpClient'
import type {
  AjusteEstoqueRequest,
  FiltrosDaPosicao,
  FiltrosDasMovimentacoes,
  MovimentacaoDeEstoque,
  MovimentoEstoque,
  PosicaoDeEstoque,
  ResumoDaPosicao,
} from '@/types/estoque'
import type { PaginaResponse } from '@/types/produto'

/**
 * Servico de estoque do produto. Centraliza as chamadas HTTP de
 * /api/produtos/{id}/estoque. O `produtoId` e o UUID publico do produto.
 */

/** Tamanho padrao da pagina de movimentos (o backend aceita ate 100). */
export const TAMANHO_PAGINA_MOVIMENTOS = 20

function caminhoDoEstoque(produtoId: string): string {
  return `/produtos/${encodeURIComponent(produtoId)}/estoque`
}

/**
 * Registra um ajuste manual (so ADMIN). Responde 201 com o movimento novo, ou
 * 200 com o movimento ja gravado quando a `chave` se repete.
 */
export function ajustarEstoque(produtoId: string, dados: AjusteEstoqueRequest): Promise<MovimentoEstoque> {
  return apiPost<MovimentoEstoque>(`${caminhoDoEstoque(produtoId)}/ajustes`, dados, { autenticada: true })
}

/** Movimentos de estoque do produto, do mais recente para o mais antigo. */
export function listarMovimentosDeEstoque(
  produtoId: string,
  pagina: number,
  tamanho = TAMANHO_PAGINA_MOVIMENTOS,
): Promise<PaginaResponse<MovimentoEstoque>> {
  const searchParams = new URLSearchParams({ pagina: String(pagina), tamanho: String(tamanho) })
  return apiGet<PaginaResponse<MovimentoEstoque>>(`${caminhoDoEstoque(produtoId)}/movimentos?${searchParams.toString()}`, {
    autenticada: true,
  })
}

/** Itens por pagina da posicao de estoque (o backend aceita ate 100). */
export const TAMANHO_PAGINA_POSICAO = 25

/** Busca, status e categoria: os parametros que a posicao e o resumo tem em comum. */
function parametrosDaBusca(filtros: Pick<FiltrosDaPosicao, 'busca' | 'status' | 'categoria'>): URLSearchParams {
  const searchParams = new URLSearchParams()
  const busca = filtros.busca.trim()
  if (busca) {
    searchParams.set('busca', busca)
  }
  searchParams.set('status', filtros.status)
  for (const categoria of filtros.categoria) {
    searchParams.append('categoria', categoria)
  }
  return searchParams
}

/**
 * Posicao de estoque (area Estoque): os produtos que controlam estoque, com
 * saldo, situacao e valor em custo. A `pagina` dos filtros comeca em 1 (a da
 * API, em 0).
 */
export function listarPosicaoDeEstoque(
  filtros: FiltrosDaPosicao,
  signal?: AbortSignal,
): Promise<PaginaResponse<PosicaoDeEstoque>> {
  const searchParams = parametrosDaBusca(filtros)
  for (const situacao of filtros.situacao) {
    searchParams.append('situacao', situacao)
  }
  searchParams.set('ordem', filtros.ordem)
  searchParams.set('pagina', String(Math.max(0, filtros.pagina - 1)))
  searchParams.set('tamanho', String(TAMANHO_PAGINA_POSICAO))
  return apiGet<PaginaResponse<PosicaoDeEstoque>>(`/estoque/posicao?${searchParams.toString()}`, {
    autenticada: true,
    signal,
  })
}

/** Resumo da posicao (contagens e valor total) para a busca, o status e a categoria, sem a situacao. */
export function buscarResumoDaPosicao(
  filtros: Pick<FiltrosDaPosicao, 'busca' | 'status' | 'categoria'>,
  signal?: AbortSignal,
): Promise<ResumoDaPosicao> {
  return apiGet<ResumoDaPosicao>(`/estoque/posicao/resumo?${parametrosDaBusca(filtros).toString()}`, {
    autenticada: true,
    signal,
  })
}

/** Itens por "Carregar mais" nas movimentacoes da area Estoque (o backend aceita ate 100). */
export const TAMANHO_PAGINA_MOVIMENTACOES = 25

/**
 * Movimentacoes de todos os produtos (area Estoque), do mais recente para o
 * mais antigo, no periodo e com os filtros informados. A `pagina` comeca em 0.
 */
export function listarMovimentacoes(
  filtros: FiltrosDasMovimentacoes,
  pagina: number,
  signal?: AbortSignal,
): Promise<PaginaResponse<MovimentacaoDeEstoque>> {
  const searchParams = new URLSearchParams({ de: filtros.de, ate: filtros.ate })
  if (filtros.produto) {
    searchParams.set('produto', filtros.produto)
  }
  if (filtros.tipo) {
    searchParams.set('tipo', filtros.tipo)
  }
  if (filtros.motivo) {
    searchParams.set('motivo', filtros.motivo)
  }
  if (filtros.usuario !== null) {
    searchParams.set('usuario', String(filtros.usuario))
  }
  searchParams.set('pagina', String(pagina))
  searchParams.set('tamanho', String(TAMANHO_PAGINA_MOVIMENTACOES))
  return apiGet<PaginaResponse<MovimentacaoDeEstoque>>(`/estoque/movimentos?${searchParams.toString()}`, {
    autenticada: true,
    signal,
  })
}
