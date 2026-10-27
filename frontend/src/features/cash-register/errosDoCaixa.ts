import { ehMensagemGenerica } from '@/features/catalog/catalogoQuery'
import { buscarSessao } from '@/services/caixaService'
import { HttpError } from '@/services/httpClient'
import type { SessaoDeCaixa } from '@/types/caixa'

/** Mensagens do backend (spec do Caixa) que dizem que a sessao mudou de estado em outro lugar. */
export const MENSAGEM_CAIXA_JA_FECHADO = 'Este caixa já foi fechado.'
export const MENSAGEM_CAIXA_EM_CONFERENCIA = 'O caixa está em conferência. Termine o fechamento.'
export const MENSAGEM_CONTAGEM_JA_REGISTRADA = 'A contagem deste caixa já foi registrada.'
/** 404 numa sessao: fora da vista do usuario (outra empresa, ou de outra pessoa para o OPERADOR). */
export const MENSAGEM_SESSAO_INDISPONIVEL = 'Este caixa não está mais disponível. A tela foi atualizada.'

export interface ErroDoServidor<C extends string> {
  /** Erros dos campos que a tela conhece (o resto vai para `geral`). */
  porCampo: Partial<Record<C, string>>
  geral: string | null
}

/**
 * Traduz a falha de uma acao do caixa em erros por campo e uma mensagem geral,
 * sem vazar detalhe tecnico: 400 e 409 trazem a mensagem curada do backend
 * (spec do Caixa); 403 e os demais casos usam textos fixos.
 */
export function lerErroDoServidor<C extends string>(
  erro: unknown,
  campos: readonly C[],
  padrao: string,
): ErroDoServidor<C> {
  if (!(erro instanceof HttpError)) {
    return { porCampo: {}, geral: padrao }
  }
  if (erro.status === 400 || erro.status === 409) {
    const porCampo: Partial<Record<C, string>> = {}
    const restantes: string[] = []
    for (const [campo, mensagem] of Object.entries(erro.campos ?? {})) {
      const conhecido = campos.find((item) => item === campo)
      if (conhecido) {
        porCampo[conhecido] = mensagem
      } else {
        restantes.push(mensagem)
      }
    }
    if (Object.keys(porCampo).length > 0 || restantes.length > 0) {
      return { porCampo, geral: restantes.length > 0 ? restantes.join(' ') : null }
    }
    return { porCampo, geral: ehMensagemGenerica(erro.message) ? padrao : erro.message }
  }
  if (erro.status === 403) {
    return { porCampo: {}, geral: 'Somente administradores podem fazer esta alteração.' }
  }
  return { porCampo: {}, geral: padrao }
}

/**
 * A sessao saiu do estado em que a acao foi tentada (Review Focus 4):
 * - `FECHADA` ou `INDISPONIVEL` (404): a tela sai da sessao;
 * - `EM_CONFERENCIA`: a tela fica na sessao, recarregada.
 * `sessao` e a sessao relida do servidor (null quando so o texto do erro permitiu decidir).
 */
export type MudancaDeEstado =
  | { situacao: 'INDISPONIVEL'; mensagem: string }
  | { situacao: 'FECHADA' | 'EM_CONFERENCIA'; sessao: SessaoDeCaixa | null; mensagem: string }

/** Falha em que o envio pode ter chegado ao servidor sem a resposta voltar (rede, 5xx). */
export function ehFalhaSemResposta(erro: unknown): boolean {
  return !(erro instanceof HttpError) || erro.status === 0 || erro.status >= 500
}

const INDISPONIVEL: MudancaDeEstado = { situacao: 'INDISPONIVEL', mensagem: MENSAGEM_SESSAO_INDISPONIVEL }

/** So quando nao foi possivel reler a sessao: decide pelo texto do 409 (spec do Caixa). */
function mudancaPeloTexto(mensagem: string): MudancaDeEstado | null {
  if (mensagem === MENSAGEM_CAIXA_JA_FECHADO) {
    return { situacao: 'FECHADA', sessao: null, mensagem }
  }
  if (mensagem === MENSAGEM_CAIXA_EM_CONFERENCIA || mensagem === MENSAGEM_CONTAGEM_JA_REGISTRADA) {
    return { situacao: 'EM_CONFERENCIA', sessao: null, mensagem }
  }
  return null
}

/**
 * Depois de um 409 ou 404 num lancamento, contagem ou fechamento, decide pela
 * situacao real da sessao, relida do servidor, e nao pelo texto do erro:
 * - 404 (ou a releitura em 404): a sessao nao esta mais acessivel;
 * - FECHADA ou EM_CONFERENCIA: a sessao mudou em outro lugar;
 * - ABERTA (ou outro erro): `null`, e o erro fica na janela.
 * O texto do 409 so decide quando a releitura falha.
 */
export async function verificarMudancaDeEstado(erro: unknown, sessaoId: string): Promise<MudancaDeEstado | null> {
  if (!(erro instanceof HttpError)) {
    return null
  }
  if (erro.status === 404) {
    return INDISPONIVEL
  }
  if (erro.status !== 409) {
    return null
  }
  const doServidor = ehMensagemGenerica(erro.message) ? null : erro.message
  let atual: SessaoDeCaixa
  try {
    atual = await buscarSessao(sessaoId)
  } catch (falha) {
    if (falha instanceof HttpError && falha.status === 404) {
      return INDISPONIVEL
    }
    return doServidor ? mudancaPeloTexto(doServidor) : null
  }
  if (atual.status === 'ABERTA') {
    return null
  }
  const padrao = atual.status === 'FECHADA' ? MENSAGEM_CAIXA_JA_FECHADO : MENSAGEM_CAIXA_EM_CONFERENCIA
  return { situacao: atual.status, sessao: atual, mensagem: doServidor ?? padrao }
}
