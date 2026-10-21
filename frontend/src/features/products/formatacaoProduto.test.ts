import { describe, expect, it } from 'vitest'

import { formatarDataHora, formatarVariacao } from '@/features/products/formatacaoProduto'

describe('formatacaoProduto', () => {
  describe('formatarVariacao', () => {
    it.each([
      [10, 11.5, '+15,00%'],
      [10, 9, '-10,00%'],
      [10, 10.01, '+0,10%'],
      [3, 4, '+33,33%'],
    ])('de %s para %s -> %s', (anterior, novo, texto) => {
      expect(formatarVariacao(anterior, novo)).toBe(texto)
    })

    it.each([
      [0, 5],
      [null, 5],
      [5, null],
      [null, null],
    ])('de %s para %s nao e calculavel (null)', (anterior, novo) => {
      expect(formatarVariacao(anterior, novo)).toBeNull()
    })
  })

  describe('formatarDataHora', () => {
    it('le data e hora do texto, sem converter fuso', () => {
      expect(formatarDataHora('2026-10-21T14:03:12')).toBe('21/10/2026 14:03')
      expect(formatarDataHora('2026-01-02T00:05:59.123')).toBe('02/01/2026 00:05')
    })

    it('texto fora do formato volta como veio', () => {
      expect(formatarDataHora('ontem')).toBe('ontem')
    })
  })
})
