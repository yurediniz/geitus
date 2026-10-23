import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'

describe('useBuscaComAtraso', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('comeca com o valor inicial', () => {
    const { result } = renderHook(() => useBuscaComAtraso('arroz'))

    expect(result.current).toBe('arroz')
  })

  it('so emite o novo valor depois de 300 ms parado', () => {
    const { result, rerender } = renderHook(({ valor }) => useBuscaComAtraso(valor), {
      initialProps: { valor: '' },
    })

    rerender({ valor: 'a' })
    act(() => vi.advanceTimersByTime(200))
    rerender({ valor: 'ar' })
    act(() => vi.advanceTimersByTime(299))
    expect(result.current).toBe('')

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe('ar')
  })

  it('aceita outro atraso', () => {
    const { result, rerender } = renderHook(({ valor }) => useBuscaComAtraso(valor, 100), {
      initialProps: { valor: '' },
    })

    rerender({ valor: 'feijao' })
    act(() => vi.advanceTimersByTime(100))

    expect(result.current).toBe('feijao')
  })
})
