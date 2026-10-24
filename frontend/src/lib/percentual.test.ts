import { describe, it, expect } from 'vitest'

import { formatarPercentual, lerPercentual } from '@/lib/percentual'

describe('percentual', () => {
  it.each([
    ['10', 10],
    ['12,5', 12.5],
    ['12.50', 12.5],
    ['0', 0],
    ['100', 100],
    [' 7,25 ', 7.25],
  ])('"%s" vira %d', (texto, valor) => {
    expect(lerPercentual(texto)).toBe(valor)
  })

  it.each(['', '101', '100,01', '-1', '10,123', 'abc', '1.000'])('"%s" não é percentual de 0 a 100 com 2 casas', (texto) => {
    expect(lerPercentual(texto)).toBeNull()
  })

  it('formata com vírgula e 2 casas', () => {
    expect(formatarPercentual(10)).toBe('10,00')
    expect(formatarPercentual(12.5)).toBe('12,50')
  })
})
