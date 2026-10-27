import { apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type {
  AbrirCaixaRequest,
  ContagemRequest,
  FechamentoRequest,
  FiltrosDoHistoricoDeCaixa,
  MovimentoDeCaixaRequest,
  PontoDeCaixa,
  SessaoDeCaixa,
  SessaoDeCaixaResumo,
} from '@/types/caixa'
import type { PaginaResponse } from '@/types/produto'

/**
 * Servico do Caixa (spec `docs/modules/caixa.md`). Centraliza as chamadas
 * de /api/caixa. Empresa e usuario vem sempre do token; os ids sao os UUIDs
 * publicos. Escrita de pontos so ADMIN; lancar, contar e fechar so o dono da
 * sessao ou um ADMIN (o backend responde 404 ao OPERADOR na sessao de outro).
 */

/** Tamanho da pagina do historico. */
export const TAMANHO_PAGINA_HISTORICO = 20

const AUTENTICADA = { autenticada: true } as const

function caminhoDoPonto(id: string): string {
  return `/caixa/pontos/${encodeURIComponent(id)}`
}

function caminhoDaSessao(id: string): string {
  return `/caixa/sessoes/${encodeURIComponent(id)}`
}

/** Pontos com a situacao e o ultimo fundo de troco. Sem `ativo`, ativos e inativos. */
export function listarPontos(ativo?: boolean): Promise<PontoDeCaixa[]> {
  const filtro = ativo === undefined ? '' : `?ativo=${String(ativo)}`
  return apiGet<PontoDeCaixa[]>(`/caixa/pontos${filtro}`, AUTENTICADA)
}

export function criarPonto(nome: string): Promise<PontoDeCaixa> {
  return apiPost<PontoDeCaixa>('/caixa/pontos', { nome }, AUTENTICADA)
}

export function renomearPonto(id: string, nome: string): Promise<PontoDeCaixa> {
  return apiPatch<PontoDeCaixa>(caminhoDoPonto(id), { nome }, AUTENTICADA)
}

/** Com caixa aberto ou em conferencia no ponto, o backend responde 409. */
export function inativarPonto(id: string): Promise<PontoDeCaixa> {
  return apiPatch<PontoDeCaixa>(`${caminhoDoPonto(id)}/inativar`, {}, AUTENTICADA)
}

export function reativarPonto(id: string): Promise<PontoDeCaixa> {
  return apiPatch<PontoDeCaixa>(`${caminhoDoPonto(id)}/reativar`, {}, AUTENTICADA)
}

/** A sessao ABERTA ou EM_CONFERENCIA aberta pelo usuario; `null` quando nao ha (204). */
export async function sessaoAtual(): Promise<SessaoDeCaixa | null> {
  const sessao = await apiGet<SessaoDeCaixa | undefined>('/caixa/sessoes/atual', AUTENTICADA)
  return sessao ?? null
}

/** Abre o caixa no ponto (201; 200 com a mesma sessao quando a chave se repete). */
export function abrir(dados: AbrirCaixaRequest): Promise<SessaoDeCaixa> {
  return apiPost<SessaoDeCaixa>('/caixa/sessoes', dados, AUTENTICADA)
}

/** Sangria ou suprimento (201; 200 quando a chave se repete). Devolve a sessao atualizada. */
export function lancar(sessaoId: string, dados: MovimentoDeCaixaRequest): Promise<SessaoDeCaixa> {
  return apiPost<SessaoDeCaixa>(`${caminhoDaSessao(sessaoId)}/movimentos`, dados, AUTENTICADA)
}

/** Registra a contagem: fecha direto (diferenca zero, ou nao cego com justificativa) ou vai para conferencia. */
export function contar(sessaoId: string, dados: ContagemRequest): Promise<SessaoDeCaixa> {
  return apiPost<SessaoDeCaixa>(`${caminhoDaSessao(sessaoId)}/contagem`, dados, AUTENTICADA)
}

/** Fecha a sessao em conferencia com a justificativa da diferenca. */
export function fechar(sessaoId: string, dados: FechamentoRequest): Promise<SessaoDeCaixa> {
  return apiPost<SessaoDeCaixa>(`${caminhoDaSessao(sessaoId)}/fechamento`, dados, AUTENTICADA)
}

/**
 * Uma pagina do historico, da mais recente para a mais antiga (OPERADOR: so as
 * suas). Filtros vazios nao vao na URL; a pagina 1-based da tela vira 0-based.
 */
export function listarSessoes(
  filtros: FiltrosDoHistoricoDeCaixa,
  signal?: AbortSignal,
): Promise<PaginaResponse<SessaoDeCaixaResumo>> {
  const params = new URLSearchParams()
  if (filtros.pontoId) {
    params.set('pontoId', filtros.pontoId)
  }
  if (filtros.status) {
    params.set('status', filtros.status)
  }
  if (filtros.de) {
    params.set('de', filtros.de)
  }
  if (filtros.ate) {
    params.set('ate', filtros.ate)
  }
  params.set('pagina', String(Math.max(0, filtros.pagina - 1)))
  params.set('tamanho', String(TAMANHO_PAGINA_HISTORICO))
  return apiGet<PaginaResponse<SessaoDeCaixaResumo>>(`/caixa/sessoes?${params.toString()}`, {
    autenticada: true,
    signal,
  })
}

export function buscarSessao(id: string): Promise<SessaoDeCaixa> {
  return apiGet<SessaoDeCaixa>(caminhoDaSessao(id), AUTENTICADA)
}
