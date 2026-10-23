import { describe, expect, it } from 'vitest'

import { umDe } from '@/lib/listas'

describe('umDe', () => {
  const CORES = ['azul', 'verde'] as const

  it('devolve o valor quando ele e valido', () => {
    expect(umDe(CORES, 'verde')).toBe('verde')
  })

  it.each([null, undefined, '', 'roxo', 'AZUL'])('devolve null para %s', (valor) => {
    expect(umDe(CORES, valor)).toBeNull()
  })
})
