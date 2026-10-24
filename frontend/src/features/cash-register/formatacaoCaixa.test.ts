import { describe, it, expect } from 'vitest'

import { formatarDataHoraCaixa, formatarHora } from '@/features/cash-register/formatacaoCaixa'

describe('formatacaoCaixa', () => {
  describe('horários em America/Sao_Paulo', () => {
    it('hora "08:02" de um instante com deslocamento, qualquer que seja o fuso de origem', () => {
      expect(formatarHora('2026-10-24T08:02:00-03:00')).toBe('08:02')
      expect(formatarHora('2026-10-24T11:02:00Z')).toBe('08:02')
    })

    it('data e hora "24/10/2026 às 08:02"', () => {
      expect(formatarDataHoraCaixa('2026-10-24T08:02:00-03:00')).toBe('24/10/2026 às 08:02')
      // 02:30 UTC do dia 25 ainda é 23:30 do dia 24 em São Paulo.
      expect(formatarDataHoraCaixa('2026-10-25T02:30:00Z')).toBe('24/10/2026 às 23:30')
    })

    it('valor que não é data fica como veio', () => {
      expect(formatarHora('ontem')).toBe('ontem')
    })
  })
})
