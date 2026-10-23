import { describe, expect, it } from 'vitest'

import { CODIGO_PRODUTO_MAXIMO, interpretarCodigoProduto } from '@/lib/codigoProduto'

describe('interpretarCodigoProduto', () => {
  it.each([
    ['000542', 542],
    ['0542', 542],
    ['542', 542],
    ['1', 1],
    ['999999', 999999],
    [' 542 ', 542],
  ] as const)('"%s" vira o numero %d (zeros a esquerda ignorados)', (texto, esperado) => {
    expect(interpretarCodigoProduto(texto)).toBe(esperado)
  })

  it.each(['', '   '])('"%s" (vazio) vira null', (texto) => {
    expect(interpretarCodigoProduto(texto)).toBeNull()
  })

  it.each(['0', '000000', '1234567', '12a', '-5', '5.4', '5,4'])('"%s" e invalido', (texto) => {
    expect(interpretarCodigoProduto(texto)).toBe('invalido')
  })

  it('o maximo e 999999 (6 digitos)', () => {
    expect(CODIGO_PRODUTO_MAXIMO).toBe(999999)
  })
})
