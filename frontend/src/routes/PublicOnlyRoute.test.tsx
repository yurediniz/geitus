import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { PublicOnlyRoute } from '@/routes/PublicOnlyRoute'
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
  empresaId: 1,
}

/**
 * Monta uma arvore minima: /login sob PublicOnlyRoute e a area principal em "/"
 * protegida por ProtectedRoute (espelhando o router real), alem de uma rota
 * privada extra ("/produtos") para provar que rotas privadas seguem acessiveis
 * ao usuario autenticado.
 */
function renderComRota(entrada: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<div>Tela de login</div>} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Area principal</div>} />
            <Route path="/produtos" element={<div>Produtos</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('PublicOnlyRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('permite que um usuario nao autenticado acesse /login', () => {
    renderComRota('/login')

    expect(screen.getByText(/tela de login/i)).toBeInTheDocument()
    expect(screen.queryByText(/area principal/i)).not.toBeInTheDocument()
  })

  it('redireciona um usuario autenticado de /login para a area principal', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderComRota('/login')

    // Enquanto reidrata a sessao, mostra o loading (sem decidir o redirect).
    expect(screen.getByText(/carregando/i)).toBeInTheDocument()

    // Concluida a reidratacao, o usuario autenticado e levado para "/".
    expect(await screen.findByText(/area principal/i)).toBeInTheDocument()
    expect(screen.queryByText(/tela de login/i)).not.toBeInTheDocument()
  })

  it('redireciona especificamente para "/" e mantem rotas privadas acessiveis ao autenticado', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    // Ao acessar /login autenticado, o destino e exatamente a area principal ("/").
    const { unmount } = renderComRota('/login')

    expect(await screen.findByText(/area principal/i)).toBeInTheDocument()
    // Nao caiu em outra rota privada (ex.: /produtos): o redirect e para "/".
    expect(screen.queryByText(/^produtos$/i)).not.toBeInTheDocument()

    unmount()

    // E a rota privada segue acessivel diretamente para o usuario autenticado.
    renderComRota('/produtos')
    expect(await screen.findByText(/^produtos$/i)).toBeInTheDocument()
    expect(screen.queryByText(/tela de login/i)).not.toBeInTheDocument()
  })
})
