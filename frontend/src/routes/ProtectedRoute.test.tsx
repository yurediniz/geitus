import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { AuthProvider } from '@/hooks/useAuth'
import { ProtectedRoute } from '@/routes/ProtectedRoute'
import { setStoredToken } from '@/services/tokenStorage'

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
    localStorage.clear()
  })

  it('redireciona para /login quando nao ha token', () => {
    renderComRota('/')

    expect(screen.getByText(/tela de login/i)).toBeInTheDocument()
    expect(screen.queryByText(/area privada/i)).not.toBeInTheDocument()
  })

  it('renderiza a area privada quando ha token', () => {
    setStoredToken('token-valido')

    renderComRota('/')

    expect(screen.getByText(/area privada/i)).toBeInTheDocument()
  })
})
