import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AdminRoute } from '@/routes/AdminRoute'
import { AuthProvider } from '@/hooks/useAuth'
import { getMe } from '@/services/authService'
import { setStoredToken } from '@/services/tokenStorage'
import type { Usuario } from '@/types/auth'

// Mocka a reidratacao (GET /api/auth/me) para controlar o perfil do usuario.
vi.mock('@/services/authService', () => ({
  getMe: vi.fn(),
}))

const getMeMock = vi.mocked(getMe)

const usuarioAdmin: Usuario = {
  id: 1,
  nome: 'Ana Admin',
  email: 'ana@empresa.com',
  perfil: 'ADMIN',
  empresa: { id: 1, nome: 'Empresa Teste', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
}

const usuarioOperador: Usuario = { ...usuarioAdmin, id: 2, nome: 'Beto Operador', perfil: 'OPERADOR' }

function renderComGuard() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/usuarios']}>
        <Routes>
          <Route element={<AdminRoute />}>
            <Route path="/usuarios" element={<div>Gestão de usuários</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('AdminRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('permite o acesso quando o usuario e ADMIN', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioAdmin)

    renderComGuard()

    expect(await screen.findByText(/gestão de usuários/i)).toBeInTheDocument()
    expect(screen.queryByText(/acesso restrito/i)).not.toBeInTheDocument()
  })

  it('bloqueia com mensagem amigavel quando o usuario e OPERADOR', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioOperador)

    renderComGuard()

    expect(await screen.findByText(/acesso restrito/i)).toBeInTheDocument()
    expect(screen.queryByText(/gestão de usuários/i)).not.toBeInTheDocument()
  })
})
