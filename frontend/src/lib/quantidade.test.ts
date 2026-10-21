import { describe, expect, it } from 'vitest'

import { interpretarQuantidade, quantidadeParaTexto, validarQuantidade } from '@/lib/quantidade'

describe('quantidade', () => {
  it('interpretarQuantidade aceita vírgula ou ponto, com até 3 casas', () => {
    expect(interpretarQuantidade('2,5')).toBe(2.5)
    expect(interpretarQuantidade('2.5')).toBe(2.5)
    expect(interpretarQuantidade(' 12 ')).toBe(12)
    expect(interpretarQuantidade('0,125')).toBe(0.125)
    expect(interpretarQuantidade('0')).toBe(0)
  })

  it('interpretarQuantidade devolve null para texto inválido, vazio ou fora do limite', () => {
    expect(interpretarQuantidade('1,2345')).toBeNull()
    expect(interpretarQuantidade('abc')).toBeNull()
    expect(interpretarQuantidade('')).toBeNull()
    expect(interpretarQuantidade('   ')).toBeNull()
    expect(interpretarQuantidade('-2')).toBeNull()
    expect(interpretarQuantidade('1e3')).toBeNull()
    expect(interpretarQuantidade('2,')).toBeNull()
    // NUMERIC(12,3): ate 9 digitos inteiros.
    expect(interpretarQuantidade('999999999,999')).toBe(999999999.999)
    expect(interpretarQuantidade('1000000000')).toBeNull()
  })

  it('validarQuantidade explica o problema', () => {
    expect(validarQuantidade('2,5')).toEqual({ valor: 2.5 })
    expect(validarQuantidade('')).toEqual({ erro: 'vazio' })
    expect(validarQuantidade('-2')).toEqual({ erro: 'negativo' })
    expect(validarQuantidade('-2,5')).toEqual({ erro: 'negativo' })
    expect(validarQuantidade('abc')).toEqual({ erro: 'invalido' })
    expect(validarQuantidade('1,2345')).toEqual({ erro: 'casas' })
    expect(validarQuantidade('1234567890')).toEqual({ erro: 'limite' })
  })

  it('quantidadeParaTexto mostra a vírgula do pt-BR, sem agrupar milhares', () => {
    expect(quantidadeParaTexto(2.5)).toBe('2,5')
    expect(quantidadeParaTexto(1500)).toBe('1500')
    expect(quantidadeParaTexto(0.125)).toBe('0,125')
    expect(quantidadeParaTexto(null)).toBe('')
  })
})
