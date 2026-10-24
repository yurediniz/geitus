import { describe, it, expect, vi, afterEach } from 'vitest'

import { tocarBipeDeErro } from '@/features/pdv/bipeDeErro'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bipeDeErro', () => {
  it('sem Web Audio, não faz nada e não quebra', () => {
    vi.stubGlobal('AudioContext', undefined)
    expect(() => tocarBipeDeErro()).not.toThrow()
  })

  it('toca um bipe curto com volume 0,1', () => {
    const oscilador = {
      type: '',
      frequency: { value: 0 },
      connect: vi.fn((destino: unknown) => destino),
      start: vi.fn(),
      stop: vi.fn(),
    }
    const ganho = { gain: { value: 1 }, connect: vi.fn((destino: unknown) => destino) }
    class ContextoFalso {
      currentTime = 10
      destination = {}
      state = 'running'
      createOscillator = () => oscilador
      createGain = () => ganho
      resume = vi.fn()
    }
    vi.stubGlobal('AudioContext', ContextoFalso)

    tocarBipeDeErro()

    expect(ganho.gain.value).toBe(0.1)
    expect(oscilador.start).toHaveBeenCalled()
    expect(oscilador.stop).toHaveBeenCalledWith(expect.any(Number))
    expect(oscilador.stop.mock.calls[0][0]).toBeLessThanOrEqual(10.2)
  })

  it('falha do navegador ao tocar fica em silêncio', () => {
    class ContextoQueFalha {
      constructor() {
        throw new Error('sem permissão')
      }
    }
    vi.stubGlobal('AudioContext', ContextoQueFalha)
    expect(() => tocarBipeDeErro()).not.toThrow()
  })
})
