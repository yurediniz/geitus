import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { getMe } from '@/services/authService'
import { setStoredToken, getStoredToken } from '@/services/tokenStorage'
import type { Usuario } from '@/types/auth'

// Mocka o service de auth para controlar a reidratacao (GET /api/auth/me).
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

/** Consumidor minimo que expoe o estado de auth para os testes. */
function Consumidor() {
  const { usuario, estaAutenticado } = useAuth()
  return (
    <div>
      <span data-testid="autenticado">{String(estaAutenticado)}</span>
      <span data-testid="usuario">{usuario ? usuario.nome : 'sem-usuario'}</span>
    </div>
  )
}

function renderComProvider() {
  return render(
    <AuthProvider>
      <Consumidor />
    </AuthProvider>,
  )
}

describe('AuthProvider - reidratacao do usuario no boot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('reidrata o usuario via getMe quando ha token e nao ha usuario', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderComProvider()

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
    expect(getMeMock).toHaveBeenCalledTimes(1)
  })

  it('nao chama getMe quando nao ha token', () => {
    renderComProvider()

    expect(getMeMock).not.toHaveBeenCalled()
    expect(screen.getByTestId('autenticado')).toHaveTextContent('false')
  })

  it('faz logout (limpa token) quando a reidratacao falha', async () => {
    setStoredToken('token-invalido')
    getMeMock.mockRejectedValue(new Error('falha'))

    renderComProvider()

    await waitFor(() => {
      expect(getStoredToken()).toBeNull()
    })
    expect(screen.getByTestId('autenticado')).toHaveTextContent('false')
  })
})
