import type { MensagemDoCalculo } from '@/types/pdv'

/** `itens[3]`, `itens[3].desconto`, `itens[3].quantidade` -> 3. */
const CAMPO_DA_LINHA = /^itens\[(\d+)\]/

export interface MensagensSeparadas {
  /** Por id da linha (as mensagens da mesma linha juntas). */
  porLinha: Record<string, string>
  /** As demais (desconto, pagamentos, total), com o campo. */
  outras: MensagemDoCalculo[]
}

/**
 * Separa as mensagens do servidor pelas linhas do carrinho que foi enviado.
 * `ids` e a ordem das linhas daquele envio (os indices do servidor seguem ela).
 */
export function separarMensagens(mensagens: readonly MensagemDoCalculo[], ids: readonly string[]): MensagensSeparadas {
  const porLinha: Record<string, string> = {}
  const outras: MensagemDoCalculo[] = []
  for (const mensagem of mensagens) {
    const indice = mensagem.campo ? CAMPO_DA_LINHA.exec(mensagem.campo) : null
    const id = indice ? ids[Number(indice[1])] : undefined
    if (id) {
      porLinha[id] = porLinha[id] ? `${porLinha[id]} ${mensagem.mensagem}` : mensagem.mensagem
    } else {
      outras.push(mensagem)
    }
  }
  return { porLinha, outras }
}

/** `campos` de um HttpError (404/409 do calculo ou da venda) no formato das mensagens do calculo. */
export function camposParaMensagens(campos: Record<string, string> | undefined): MensagemDoCalculo[] {
  return Object.entries(campos ?? {}).map(([campo, mensagem]) => ({ campo, mensagem }))
}

/** Os pagamentos so importam na janela de pagamento: na tela, "Falta pagar" nao e erro. */
export function ehDoPagamento(mensagem: MensagemDoCalculo): boolean {
  return mensagem.campo !== null && mensagem.campo.startsWith('pagamentos')
}
