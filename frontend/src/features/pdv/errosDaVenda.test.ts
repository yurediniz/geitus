import { describe, it, expect } from 'vitest'

import { classificarFalhaDaVenda, MENSAGEM_ABRA_O_CAIXA, MENSAGEM_TERMINE_O_FECHAMENTO } from '@/features/pdv/errosDaVenda'
import { HttpError } from '@/services/httpClient'

describe('classificarFalhaDaVenda', () => {
  it('total mudou: pelo campo totalEsperado ou pela mensagem', () => {
    expect(classificarFalhaDaVenda(new HttpError(409, 'O total da venda mudou. Confira os valores.'))).toEqual({
      tipo: 'TOTAL_MUDOU',
    })
    expect(
      classificarFalhaDaVenda(new HttpError(409, 'Requisicao falhou (HTTP 409).', { totalEsperado: 'O total mudou.' })),
    ).toEqual({ tipo: 'TOTAL_MUDOU' })
  })

  it('itens[i] e clienteId (409 ou 404) marcam as linhas e o carrinho fica', () => {
    expect(
      classificarFalhaDaVenda(
        new HttpError(404, 'Requisicao falhou (HTTP 404).', { 'itens[1]': 'A embalagem CX c/ 3 UN não existe mais.' }),
      ),
    ).toEqual({ tipo: 'DADOS', mensagens: [{ campo: 'itens[1]', mensagem: 'A embalagem CX c/ 3 UN não existe mais.' }] })
    expect(
      classificarFalhaDaVenda(new HttpError(404, 'Requisicao falhou (HTTP 404).', { clienteId: 'Cliente não encontrado.' })),
    ).toEqual({ tipo: 'DADOS', mensagens: [{ campo: 'clienteId', mensagem: 'Cliente não encontrado.' }] })
  })

  it('sem caixa ou em conferência: o caixa pode ter mudado (a tela relê a sessão)', () => {
    expect(classificarFalhaDaVenda(new HttpError(409, MENSAGEM_ABRA_O_CAIXA))).toEqual({
      tipo: 'CAIXA',
      mensagem: MENSAGEM_ABRA_O_CAIXA,
    })
    expect(classificarFalhaDaVenda(new HttpError(409, MENSAGEM_TERMINE_O_FECHAMENTO))).toEqual({
      tipo: 'CAIXA',
      mensagem: MENSAGEM_TERMINE_O_FECHAMENTO,
    })
  })

  it('outro 409 sem campo também relê o caixa, com a mensagem do servidor', () => {
    expect(classificarFalhaDaVenda(new HttpError(409, 'Venda recusada.'))).toEqual({
      tipo: 'CAIXA',
      mensagem: 'Venda recusada.',
    })
  })

  it('409 "já registrada com outros dados" é um caso próprio, com a mensagem para conferir no F8', () => {
    expect(classificarFalhaDaVenda(new HttpError(409, 'Esta operação já foi registrada com outros dados.'))).toEqual({
      tipo: 'JA_REGISTRADA',
      mensagem: 'Esta venda pode já ter sido registrada. Confira em Vendas do caixa (F8).',
    })
  })

  it('400: os erros dos pagamentos e o resto na mensagem geral', () => {
    expect(
      classificarFalhaDaVenda(
        new HttpError(400, 'Dados invalidos.', { pagamentos: 'Cartão e PIX não podem passar do total. O troco só sai do dinheiro.' }),
      ),
    ).toEqual({ tipo: 'INVALIDO', mensagem: 'Cartão e PIX não podem passar do total. O troco só sai do dinheiro.' })
  })

  it('409 só com campos de pagamento fica na janela como inválido (S2)', () => {
    expect(
      classificarFalhaDaVenda(
        new HttpError(409, 'Requisicao falhou.', { 'pagamentos[1].valor': 'Cartão e PIX não podem passar do total.' }),
      ),
    ).toEqual({ tipo: 'INVALIDO', mensagem: 'Cartão e PIX não podem passar do total.' })
  })

  it('rede ou 5xx: a mesma chave na nova tentativa', () => {
    expect(classificarFalhaDaVenda(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))).toEqual({ tipo: 'REDE' })
    expect(classificarFalhaDaVenda(new HttpError(503, 'Requisicao falhou (HTTP 503).'))).toEqual({ tipo: 'REDE' })
    expect(classificarFalhaDaVenda(new Error('x'))).toEqual({ tipo: 'REDE' })
  })

  it('403 e 404 sem campo: mensagem fixa', () => {
    expect(classificarFalhaDaVenda(new HttpError(404, 'Requisicao falhou (HTTP 404).'))).toEqual({
      tipo: 'CAIXA',
      mensagem: 'Não foi possível finalizar a venda. A tela foi atualizada.',
    })
  })
})
