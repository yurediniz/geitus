import { ehFalhaSemResposta } from '@/features/cash-register/errosDoCaixa'
import { ehMensagemGenerica } from '@/features/catalog/catalogoQuery'
import { camposParaMensagens } from '@/features/pdv/mensagensDoCalculo'
import { HttpError } from '@/services/httpClient'
import type { MensagemDoCalculo } from '@/types/pdv'

/** Mensagens do servidor (spec do PDV §3.6) que dizem que o caixa do usuario mudou. */
export const MENSAGEM_ABRA_O_CAIXA = 'Abra o caixa para vender.'
export const MENSAGEM_TERMINE_O_FECHAMENTO = 'Termine o fechamento do caixa antes de vender.'
export const MENSAGEM_TOTAL_MUDOU = 'O total da venda mudou. Confira os valores.'
const MENSAGEM_FALHA = 'Não foi possível finalizar a venda. A tela foi atualizada.'

/**
 * O que fazer quando `POST /api/pdv/vendas` falha:
 * - `TOTAL_MUDOU`: mostrar o total anterior e o novo, e reenviar com a mesma chave;
 * - `DADOS`: marcar as linhas (`itens[i]`) ou o cliente, mantendo o carrinho (Review Focus 2);
 * - `CAIXA`: reler a sessao e decidir pelo status real (Review Focus 5);
 * - `INVALIDO`: a mensagem fica na janela (pagamentos);
 * - `REDE`: tudo fica, e a nova tentativa reenvia a mesma chave.
 */
export type FalhaDaVenda =
  | { tipo: 'TOTAL_MUDOU' }
  | { tipo: 'DADOS'; mensagens: MensagemDoCalculo[] }
  | { tipo: 'CAIXA'; mensagem: string }
  | { tipo: 'INVALIDO'; mensagem: string }
  | { tipo: 'REDE' }

export function classificarFalhaDaVenda(erro: unknown): FalhaDaVenda {
  if (ehFalhaSemResposta(erro) || !(erro instanceof HttpError)) {
    return { tipo: 'REDE' }
  }
  const mensagemDoServidor = ehMensagemGenerica(erro.message) ? null : erro.message
  if (erro.status === 409 && (erro.campos?.totalEsperado || mensagemDoServidor === MENSAGEM_TOTAL_MUDOU)) {
    return { tipo: 'TOTAL_MUDOU' }
  }
  if (erro.status === 400) {
    const doCampo = Object.values(erro.campos ?? {})
    return { tipo: 'INVALIDO', mensagem: doCampo.length > 0 ? doCampo.join(' ') : (mensagemDoServidor ?? MENSAGEM_FALHA) }
  }
  if ((erro.status === 404 || erro.status === 409) && erro.campos && Object.keys(erro.campos).length > 0) {
    return { tipo: 'DADOS', mensagens: camposParaMensagens(erro.campos) }
  }
  return { tipo: 'CAIXA', mensagem: mensagemDoServidor ?? MENSAGEM_FALHA }
}
