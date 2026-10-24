import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  aoEncerrarSessao,
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from '@/services/tokenStorage'

describe('tokenStorage', () => {
  afterEach(() => {
    clearStoredToken()
  })

  it('guarda, le e remove o token', () => {
    setStoredToken('abc')
    expect(getStoredToken()).toBe('abc')

    clearStoredToken()

    expect(getStoredToken()).toBeNull()
  })

  it('ao encerrar a sessao (logout ou 401), avisa quem guarda dados da sessao em memoria', () => {
    const limpar = vi.fn()
    const cancelar = aoEncerrarSessao(limpar)

    clearStoredToken()
    expect(limpar).toHaveBeenCalledTimes(1)

    cancelar()
    clearStoredToken()
    expect(limpar).toHaveBeenCalledTimes(1)
  })

  it('um aviso que falha nao impede os demais nem a remocao do token', () => {
    setStoredToken('abc')
    const quebrado = vi.fn(() => {
      throw new Error('falhou')
    })
    const outro = vi.fn()
    const cancelarQuebrado = aoEncerrarSessao(quebrado)
    const cancelarOutro = aoEncerrarSessao(outro)

    clearStoredToken()

    expect(outro).toHaveBeenCalled()
    expect(getStoredToken()).toBeNull()
    cancelarQuebrado()
    cancelarOutro()
  })
})
