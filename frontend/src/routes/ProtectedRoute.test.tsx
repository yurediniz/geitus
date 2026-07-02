import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { getMe } from '@/services/authService'
import { setStoredToken } from '@/services/tokenStorage'
import type { Usuario } from '@/types/auth'

// Mocka a reidratacao (GET /api/auth/me) para controlar o boot com token.
vi.mock('@/services/authService', () => ({
  getMe: vi.fn(),
}))

const getMeMock = vi.mocked(getMe)

const usuarioFake: Usuario = {
  id: 1,
  nome: 'Ana Souza',
  email: 'ana@empresa.com',
  perfil: 'ADMIN',
  empresa: { id: 1, nome: 'Empresa Teste', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
}

/**
 * Monta uma arvore minima de rotas: uma area privada sob ProtectedRoute e uma
 * pagina publica de login, para observar o redirecionamento.
 */
function renderComRota(entrada: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Area privada</div>} />
          </Route>
          <Route path="/login" element={<div>Tela de login</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('ProtectedRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('redireciona para /login quando nao ha token', () => {
    renderComRota('/')

    expect(screen.getByText(/tela de login/i)).toBeInTheDocument()
    expect(screen.queryByText(/area privada/i)).not.toBeInTheDocument()
  })

  it('mostra o loading enquanto revalida a sessao e depois renderiza a area privada', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderComRota('/')

    // Enquanto a reidratacao nao termina, mostra o indicador de carregamento.
    expect(screen.getByText(/carregando/i)).toBeInTheDocument()
    expect(screen.queryByText(/area privada/i)).not.toBeInTheDocument()

    // Concluida a reidratacao, a area privada e renderizada.
    expect(await screen.findByText(/area privada/i)).toBeInTheDocument()
  })

  it('redireciona para /login quando a revalidacao da sessao falha (token invalido)', async () => {
    setStoredToken('token-invalido')
    getMeMock.mockRejectedValue(new Error('falha'))

    renderComRota('/')

    expect(await screen.findByText(/tela de login/i)).toBeInTheDocument()
    expect(screen.queryByText(/area privada/i)).not.toBeInTheDocument()
  })
})
