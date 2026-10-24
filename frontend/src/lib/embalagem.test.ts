import { describe, expect, it } from 'vitest'

import {
  conversaoDoSaldo,
  conversaoEmEmbalagens,
  embalagemPrincipal,
  precoCalculadoDaEmbalagem,
  precoVigenteDaUnidade,
  rotuloDaEmbalagem,
  textoEmEmbalagens,
  valorPorUnidade,
  valorPorUnidadeAbaixoDoMinimo,
} from '@/lib/embalagem'

describe('rotuloDaEmbalagem', () => {
  it('monta "{sigla} c/ {quantidade} {sigla de venda}" sem zeros a direita e com virgula', () => {
    expect(rotuloDaEmbalagem('CX', '3', 'UN')).toBe('CX c/ 3 UN')
    expect(rotuloDaEmbalagem('SC', '25,5', 'KG')).toBe('SC c/ 25,5 KG')
    expect(rotuloDaEmbalagem('SC', '25.500', 'KG')).toBe('SC c/ 25,5 KG')
    expect(rotuloDaEmbalagem('CX', 18, 'UN')).toBe('CX c/ 18 UN')
    expect(rotuloDaEmbalagem('FD', '1000', 'UN')).toBe('FD c/ 1000 UN')
  })

  it('quantidade ainda invalida aparece como digitada', () => {
    expect(rotuloDaEmbalagem('CX', ' abc ', 'UN')).toBe('CX c/ abc UN')
  })
})

describe('precoCalculadoDaEmbalagem', () => {
  it('quantidade x preco da unidade, em centavos com meio para cima', () => {
    expect(precoCalculadoDaEmbalagem('3', '89.90')).toBe('269.70')
    expect(precoCalculadoDaEmbalagem('3', '79.9')).toBe('239.70')
    // 25,5 x 12,99 = 331,245 -> 331,25
    expect(precoCalculadoDaEmbalagem('25,5', '12.99')).toBe('331.25')
  })

  it('null sem quantidade valida > 0 ou sem preco', () => {
    expect(precoCalculadoDaEmbalagem('', '10')).toBeNull()
    expect(precoCalculadoDaEmbalagem('0', '10')).toBeNull()
    expect(precoCalculadoDaEmbalagem('abc', '10')).toBeNull()
    expect(precoCalculadoDaEmbalagem('3', '')).toBeNull()
  })
})

describe('precoVigenteDaUnidade', () => {
  const base = {
    precoVenda: '89.90',
    promocaoAtiva: false,
    precoPromocional: '',
    promocaoInicio: '',
    promocaoFim: '',
  }
  const promocao = {
    ...base,
    promocaoAtiva: true,
    precoPromocional: '79.90',
    promocaoInicio: '2026-10-20',
    promocaoFim: '2026-10-31',
  }

  it('sem promocao, o preco de venda', () => {
    expect(precoVigenteDaUnidade(base, '2026-10-24')).toEqual({ preco: '89.90', emPromocao: false })
  })

  it('com a promocao ligada e hoje entre inicio e fim (inclusive), o promocional', () => {
    expect(precoVigenteDaUnidade(promocao, '2026-10-24')).toEqual({ preco: '79.90', emPromocao: true })
    expect(precoVigenteDaUnidade(promocao, '2026-10-20')).toEqual({ preco: '79.90', emPromocao: true })
    expect(precoVigenteDaUnidade(promocao, '2026-10-31')).toEqual({ preco: '79.90', emPromocao: true })
  })

  it('promocao agendada, encerrada, desligada ou sem preco: o preco de venda', () => {
    expect(precoVigenteDaUnidade(promocao, '2026-10-19')).toEqual({ preco: '89.90', emPromocao: false })
    expect(precoVigenteDaUnidade(promocao, '2026-11-01')).toEqual({ preco: '89.90', emPromocao: false })
    expect(precoVigenteDaUnidade({ ...promocao, promocaoAtiva: false }, '2026-10-24').emPromocao).toBe(false)
    expect(precoVigenteDaUnidade({ ...promocao, precoPromocional: '' }, '2026-10-24').emPromocao).toBe(false)
  })
})

describe('valorPorUnidadeAbaixoDoMinimo', () => {
  it('compara preco < minimo x quantidade, sem divisao', () => {
    expect(valorPorUnidadeAbaixoDoMinimo('210.00', '3', '70.00')).toBeNull()
    expect(valorPorUnidadeAbaixoDoMinimo('210.01', '3', '70.00')).toBeNull()
  })

  it('o valor por unidade e truncado a centavos (nunca igual ao minimo)', () => {
    expect(valorPorUnidadeAbaixoDoMinimo('209.99', '3', '70.00')).toBe('69.99')
    expect(valorPorUnidadeAbaixoDoMinimo('209.90', '3', '70.00')).toBe('69.96')
  })

  it('null sem preco, sem minimo ou sem quantidade valida', () => {
    expect(valorPorUnidadeAbaixoDoMinimo('', '3', '70')).toBeNull()
    expect(valorPorUnidadeAbaixoDoMinimo('100', '3', '')).toBeNull()
    expect(valorPorUnidadeAbaixoDoMinimo('100', '', '70')).toBeNull()
  })
})

describe('valorPorUnidade', () => {
  it('preco / quantidade, em centavos com meio para cima', () => {
    expect(valorPorUnidade('209.90', '3')).toBe('69.97')
    expect(valorPorUnidade('100.00', '3')).toBe('33.33')
    expect(valorPorUnidade('331.25', '25,5')).toBe('12.99')
  })

  it('null sem preco ou sem quantidade > 0', () => {
    expect(valorPorUnidade('', '3')).toBeNull()
    expect(valorPorUnidade('10', '0')).toBeNull()
    expect(valorPorUnidade('10', 'abc')).toBeNull()
  })
})

describe('conversaoEmEmbalagens', () => {
  it('so a parte das embalagens, para mostrar menor ao lado do saldo', () => {
    expect(conversaoEmEmbalagens(55, { sigla: 'CX', quantidade: 3 }, 'UN', false)).toBe('18 CX + 1 UN')
    expect(conversaoEmEmbalagens(54, { sigla: 'CX', quantidade: 3 }, 'UN', false)).toBe('18 CX')
    expect(conversaoEmEmbalagens(2, { sigla: 'CX', quantidade: 3 }, 'UN', false)).toBeNull()
  })
})

describe('conversaoDoSaldo', () => {
  const caixa = { sigla: 'CX', quantidade: 3 }

  it('mostra as embalagens inteiras e o resto', () => {
    expect(conversaoDoSaldo(55, caixa, 'UN', false)).toBe('55 UN (18 CX + 1 UN)')
    expect(conversaoDoSaldo(54, caixa, 'UN', false)).toBe('54 UN (18 CX)')
    expect(conversaoDoSaldo(55, { sigla: 'CX', quantidade: 18 }, 'UN', false)).toBe('55 UN (3 CX + 1 UN)')
  })

  it('na unidade fracionada, o resto com ate 3 casas', () => {
    expect(conversaoDoSaldo(60.25, { sigla: 'SC', quantidade: 25.5 }, 'KG', true)).toBe('60,25 KG (2 SC + 9,25 KG)')
  })

  it('null com saldo menor que 1 embalagem ou <= 0', () => {
    expect(conversaoDoSaldo(2, caixa, 'UN', false)).toBeNull()
    expect(conversaoDoSaldo(0, caixa, 'UN', false)).toBeNull()
    expect(conversaoDoSaldo(-6, caixa, 'UN', false)).toBeNull()
  })
})

describe('embalagemPrincipal', () => {
  it('a de compra, senao a primeira', () => {
    const a = { id: 'a', deCompra: false }
    const b = { id: 'b', deCompra: true }
    expect(embalagemPrincipal([a, b])).toBe(b)
    expect(embalagemPrincipal([a, { ...b, deCompra: false }])).toBe(a)
    expect(embalagemPrincipal([])).toBeUndefined()
  })
})

describe('textoEmEmbalagens', () => {
  it('quantas embalagens e qual: "2 CX c/ 18 UN"', () => {
    expect(textoEmEmbalagens(2, 'CX c/ 18 UN')).toBe('2 CX c/ 18 UN')
    expect(textoEmEmbalagens(1200, 'SC c/ 25,5 KG')).toBe('1.200 SC c/ 25,5 KG')
  })
})
