import { describe, it, expect } from 'vitest'

import { destinoDaLista, rotuloDoVoltar } from '@/features/products/navegacaoProdutos'

describe('navegacaoProdutos', () => {
  it('volta para a lista de produtos com a busca', () => {
    expect(destinoDaLista({ voltarPara: '/produtos?busca=arroz' })).toBe('/produtos?busca=arroz')
    expect(rotuloDoVoltar('/produtos?busca=arroz')).toBe('Voltar para produtos')
  })

  it('volta para a área Estoque com a aba e os filtros', () => {
    const destino = '/estoque?aba=movimentacoes&tipo=SAIDA'
    expect(destinoDaLista({ voltarPara: destino })).toBe(destino)
    expect(destinoDaLista({ voltarPara: '/estoque' })).toBe('/estoque')
    expect(rotuloDoVoltar(destino)).toBe('Voltar para o estoque')
  })

  it('qualquer outro destino (ou nenhum) cai na lista de produtos', () => {
    expect(destinoDaLista({ voltarPara: 'https://exemplo.com' })).toBe('/produtos')
    expect(destinoDaLista({ voltarPara: '/estoquex' })).toBe('/produtos')
    expect(destinoDaLista({ voltarPara: '/caixa' })).toBe('/produtos')
    expect(destinoDaLista(null)).toBe('/produtos')
  })
})
