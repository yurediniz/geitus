import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'

import { AuthProvider } from '@/hooks/useAuth'
import { rotasDaAplicacao } from '@/routes/router'
import { getMe } from '@/services/authService'
import { setStoredToken } from '@/services/tokenStorage'
import type { Usuario } from '@/types/auth'

vi.mock('@/services/authService', () => ({
  getMe: vi.fn(),
}))

const getMeMock = vi.mocked(getMe)

const operador: Usuario = {
  id: 2,
  nome: 'Beto Operador',
  email: 'beto@empresa.com',
  perfil: 'OPERADOR',
  empresa: { id: 1, nome: 'Empresa Teste', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
}

function renderApp(entrada: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter(rotasDaAplicacao, { initialEntries: [entrada] })
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  )
  return router
}

describe('rotas: etiqueta de balança em Configurações', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('o endereco antigo /produtos/balanca redireciona para /configuracoes/balanca', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(operador)

    const router = renderApp('/produtos/balanca')

    await waitFor(() => expect(router.state.location.pathname).toBe('/configuracoes/balanca'))
  })

  it('o OPERADOR e barrado em /configuracoes/balanca (so ADMIN)', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(operador)

    renderApp('/configuracoes/balanca')

    expect(await screen.findByText(/acesso restrito/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Etiqueta de balança' })).not.toBeInTheDocument()
  })
})
