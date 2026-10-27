import { ehFalhaSemResposta } from '@/features/cash-register/errosDoCaixa'
import { ehMensagemGenerica } from '@/features/catalog/catalogoQuery'
import { camposParaMensagens } from '@/features/pdv/mensagensDoCalculo'
import { HttpError } from '@/services/httpClient'
import type { MensagemDoCalculo } from '@/types/pdv'

/** Mensagens do servidor (spec do PDV) que dizem que o caixa do usuario mudou. */
export const MENSAGEM_ABRA_O_CAIXA = 'Abra o caixa para vender.'
export const MENSAGEM_TERMINE_O_FECHAMENTO = 'Termine o fechamento do caixa antes de vender.'
export const MENSAGEM_TOTAL_MUDOU = 'O total da venda mudou. Confira os valores.'
export const MENSAGEM_OUTROS_DADOS = 'Esta operação já foi registrada com outros dados.'
export const MENSAGEM_PODE_TER_SIDO_REGISTRADA = 'Esta venda pode já ter sido registrada. Confira em Vendas do caixa (F8).'
const MENSAGEM_FALHA = 'Não foi possível finalizar a venda. A tela foi atualizada.'

/**
 * O que fazer quando `POST /api/pdv/vendas` falha:
 * - `TOTAL_MUDOU`: mostrar o total anterior e o novo, e reenviar com a mesma chave;
 * - `DADOS`: marcar as linhas (`itens[i]`) ou o cliente, mantendo o carrinho (Review Focus 2);
 * - `CAIXA`: reler a sessao e decidir pelo status real (Review Focus 5);
 * - `INVALIDO`: a mensagem fica na janela (pagamentos);
 * - `REDE`: tudo fica, e a nova tentativa reenvia a mesma chave;
 * - `JA_REGISTRADA`: a chave ja tem uma venda com outros dados; nada de chave nova automatica.
 */
export type FalhaDaVenda =
  | { tipo: 'TOTAL_MUDOU' }
  | { tipo: 'DADOS'; mensagens: MensagemDoCalculo[] }
  | { tipo: 'CAIXA'; mensagem: string }
  | { tipo: 'INVALIDO'; mensagem: string }
  | { tipo: 'REDE' }
  | { tipo: 'JA_REGISTRADA'; mensagem: string }

export function classificarFalhaDaVenda(erro: unknown): FalhaDaVenda {
  if (ehFalhaSemResposta(erro) || !(erro instanceof HttpError)) {
    return { tipo: 'REDE' }
  }
  const mensagemDoServidor = ehMensagemGenerica(erro.message) ? null : erro.message
  if (erro.status === 409 && (erro.campos?.totalEsperado || mensagemDoServidor === MENSAGEM_TOTAL_MUDOU)) {
    return { tipo: 'TOTAL_MUDOU' }
  }
  if (erro.status === 409 && mensagemDoServidor === MENSAGEM_OUTROS_DADOS) {
    return { tipo: 'JA_REGISTRADA', mensagem: MENSAGEM_PODE_TER_SIDO_REGISTRADA }
  }
  if (erro.status === 400) {
    const doCampo = Object.values(erro.campos ?? {})
    return { tipo: 'INVALIDO', mensagem: doCampo.length > 0 ? doCampo.join(' ') : (mensagemDoServidor ?? MENSAGEM_FALHA) }
  }
  const campos = Object.keys(erro.campos ?? {})
  if (erro.status === 409 && campos.length > 0 && campos.every((campo) => campo.startsWith('pagamentos'))) {
    // So os pagamentos: a venda nao mudou, o operador ajusta na propria janela.
    return { tipo: 'INVALIDO', mensagem: Object.values(erro.campos ?? {}).join(' ') }
  }
  if ((erro.status === 404 || erro.status === 409) && erro.campos && campos.length > 0) {
    return { tipo: 'DADOS', mensagens: camposParaMensagens(erro.campos) }
  }
  return { tipo: 'CAIXA', mensagem: mensagemDoServidor ?? MENSAGEM_FALHA }
}
