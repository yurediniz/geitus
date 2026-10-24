import { describe, it, expect } from 'vitest'

import { camposParaMensagens, ehDoPagamento, separarMensagens } from '@/features/pdv/mensagensDoCalculo'

describe('mensagensDoCalculo', () => {
  it('liga itens[i] à linha do envio e deixa o resto separado', () => {
    const { porLinha, outras } = separarMensagens(
      [
        { campo: 'itens[1]', mensagem: 'Produto inativo — não pode ser vendido.' },
        { campo: 'itens[0].desconto', mensagem: 'O desconto passa do limite do operador (10%).' },
        { campo: 'itens[0]', mensagem: 'O desconto deixa Ração abaixo do preço mínimo.' },
        { campo: 'itens[9]', mensagem: 'Linha que não existe mais.' },
        { campo: 'desconto', mensagem: 'O desconto passa do subtotal.' },
        { campo: null, mensagem: 'O total da venda precisa ser maior que zero.' },
      ],
      ['l-a', 'l-b'],
    )

    expect(porLinha).toEqual({
      'l-a': 'O desconto passa do limite do operador (10%). O desconto deixa Ração abaixo do preço mínimo.',
      'l-b': 'Produto inativo — não pode ser vendido.',
    })
    expect(outras.map((mensagem) => mensagem.campo)).toEqual(['itens[9]', 'desconto', null])
  })

  it('campos do HttpError viram mensagens; pagamentos são da janela de pagamento', () => {
    expect(camposParaMensagens({ 'itens[0]': 'A embalagem CX c/ 3 UN não existe mais.' })).toEqual([
      { campo: 'itens[0]', mensagem: 'A embalagem CX c/ 3 UN não existe mais.' },
    ])
    expect(camposParaMensagens(undefined)).toEqual([])
    expect(ehDoPagamento({ campo: 'pagamentos[1].valor', mensagem: 'x' })).toBe(true)
    expect(ehDoPagamento({ campo: 'desconto', mensagem: 'x' })).toBe(false)
    expect(ehDoPagamento({ campo: null, mensagem: 'x' })).toBe(false)
  })
})
