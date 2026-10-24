import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { limparCacheAoEncerrarSessao, queryClient } from '@/app/queryClient'
import { CHAVE_DA_SESSAO_ATUAL, chaveDosPontos } from '@/features/cash-register/caixaQuery'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { getMe } from '@/services/authService'
import { clearStoredToken, setStoredToken } from '@/services/tokenStorage'
import { pontoDeTeste, sessaoDeTeste } from '@/test/fixturesCaixa'

vi.mock('@/services/authService', () => ({
  getMe: vi.fn(),
}))

function BotaoSair() {
  const { logout } = useAuth()
  return (
    <button type="button" onClick={logout}>
      Sair
    </button>
  )
}

describe('queryClient: limpeza do cache ao encerrar a sessão', () => {
  beforeEach(() => {
    queryClient.clear()
    vi.mocked(getMe).mockReturnValue(new Promise(() => {}))
  })

  afterEach(() => {
    queryClient.clear()
    localStorage.clear()
  })

  it('o logout apaga todo o cache, inclusive a sessão de caixa', () => {
    setStoredToken('token-da-ana')
    queryClient.setQueryData(CHAVE_DA_SESSAO_ATUAL, sessaoDeTeste())
    queryClient.setQueryData(chaveDosPontos(true), [pontoDeTeste()])
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BotaoSair />
        </AuthProvider>
      </QueryClientProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }))

    expect(queryClient.getQueryCache().getAll()).toHaveLength(0)
  })

  it('um novo login não vê a sessão de caixa do anterior (401 também encerra a sessão)', () => {
    setStoredToken('token-da-ana')
    queryClient.setQueryData(CHAVE_DA_SESSAO_ATUAL, sessaoDeTeste())

    // O 401 passa pelo mesmo clearStoredToken do logout.
    clearStoredToken()
    setStoredToken('token-do-beto')

    expect(queryClient.getQueryData(CHAVE_DA_SESSAO_ATUAL)).toBeUndefined()
  })

  it('o registro pode ser cancelado', () => {
    const outro = new QueryClient()
    const cancelar = limparCacheAoEncerrarSessao(outro)
    outro.setQueryData(['x'], 1)
    cancelar()

    clearStoredToken()

    expect(outro.getQueryData(['x'])).toBe(1)
  })
})
