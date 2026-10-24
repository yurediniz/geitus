import { ehMensagemGenerica } from '@/features/catalog/catalogoQuery'
import { HttpError } from '@/services/httpClient'

/** Mensagens do backend (spec §3) que dizem que a sessao mudou de estado em outro lugar. */
export const MENSAGEM_CAIXA_JA_FECHADO = 'Este caixa já foi fechado.'
export const MENSAGEM_CAIXA_EM_CONFERENCIA = 'O caixa está em conferência. Termine o fechamento.'
/** 404 numa sessao: removida da vista do usuario (outra empresa, ou de outra pessoa para o OPERADOR). */
export const MENSAGEM_SESSAO_INDISPONIVEL = 'Este caixa não está mais disponível. A tela foi atualizada.'

export interface ErroDoServidor<C extends string> {
  /** Erros dos campos que a tela conhece (o resto vai para `geral`). */
  porCampo: Partial<Record<C, string>>
  geral: string | null
}

/**
 * Traduz a falha de uma acao do caixa em erros por campo e uma mensagem geral,
 * sem vazar detalhe tecnico: 400 e 409 trazem a mensagem curada do backend
 * (spec §3); 403 e os demais casos usam textos fixos.
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
 * A sessao nao aceita mais a acao porque mudou em outro lugar (fechada ou em
 * conferencia em outra aba, ou fora da vista do usuario): a tela deve fechar a
 * janela, mostrar a mensagem e recarregar a sessao (Review Focus 4).
 */
export function mensagemDeConflitoDeEstado(erro: unknown): string | null {
  if (!(erro instanceof HttpError)) {
    return null
  }
  if (erro.status === 404) {
    return MENSAGEM_SESSAO_INDISPONIVEL
  }
  if (erro.status === 409 && (erro.message === MENSAGEM_CAIXA_JA_FECHADO || erro.message === MENSAGEM_CAIXA_EM_CONFERENCIA)) {
    return erro.message
  }
  return null
}
