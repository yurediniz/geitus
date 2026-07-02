import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { RootLayout } from '@/components/layout/RootLayout'
import { AuthProvider } from '@/hooks/useAuth'
import { getMe } from '@/services/authService'
import { getStoredToken, setStoredToken } from '@/services/tokenStorage'
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

/** Monta o RootLayout dentro de rotas, com uma tela de login de destino. */
function renderLayout() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<RootLayout />}>
            <Route index element={<div>Conteudo</div>} />
          </Route>
          <Route path="/login" element={<div>Tela de login</div>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  )
}

describe('RootLayout - logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('exibe nome, e-mail e empresa do usuario reidratado', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout()

    expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByText('ana@empresa.com')).toBeInTheDocument()
    expect(screen.getByText('Empresa Teste')).toBeInTheDocument()
  })

  it('o botao Sair limpa a sessao e leva para /login', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout()

    // Aguarda a reidratacao (garante a sessao ativa antes de sair).
    await screen.findByText('Ana Souza')

    // Ha um botao "Sair" na sidebar e outro no cabecalho mobile; usa o primeiro.
    fireEvent.click(screen.getAllByRole('button', { name: /sair/i })[0])

    expect(await screen.findByText(/tela de login/i)).toBeInTheDocument()
    expect(getStoredToken()).toBeNull()
  })
})
