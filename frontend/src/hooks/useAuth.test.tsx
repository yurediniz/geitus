import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { getMe } from '@/services/authService'
import { setStoredToken, getStoredToken } from '@/services/tokenStorage'
import type { LoginResponse, Usuario } from '@/types/auth'

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

const loginResponseFake: LoginResponse = {
  token: 'token-do-login',
  usuario: usuarioFake,
}

/** Consumidor minimo que expoe o estado e as acoes de auth para os testes. */
function Consumidor() {
  const { usuario, estaAutenticado, carregandoSessao, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="autenticado">{String(estaAutenticado)}</span>
      <span data-testid="carregando">{String(carregandoSessao)}</span>
      <span data-testid="usuario">{usuario ? usuario.nome : 'sem-usuario'}</span>
      <button type="button" onClick={() => login(loginResponseFake)}>
        entrar
      </button>
      <button type="button" onClick={logout}>
        sair
      </button>
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

describe('AuthProvider - estado de carregando sessao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('inicia carregandoSessao=true quando ha token no boot e volta a false apos reidratar', async () => {
    setStoredToken('token-valido')
    // Promise controlada para observar o estado intermediario de carregamento.
    let resolver: (u: Usuario) => void = () => {}
    getMeMock.mockReturnValue(
      new Promise<Usuario>((resolve) => {
        resolver = resolve
      }),
    )

    renderComProvider()

    // Enquanto getMe nao resolve, a sessao esta carregando.
    expect(screen.getByTestId('carregando')).toHaveTextContent('true')

    resolver(usuarioFake)

    await waitFor(() => {
      expect(screen.getByTestId('carregando')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('usuario')).toHaveTextContent('Ana Souza')
  })

  it('mantem carregandoSessao=false quando nao ha token', () => {
    renderComProvider()

    expect(screen.getByTestId('carregando')).toHaveTextContent('false')
  })

  it('encerra carregandoSessao (false) quando a reidratacao falha', async () => {
    setStoredToken('token-invalido')
    getMeMock.mockRejectedValue(new Error('falha'))

    renderComProvider()

    await waitFor(() => {
      expect(screen.getByTestId('carregando')).toHaveTextContent('false')
    })
    expect(screen.getByTestId('autenticado')).toHaveTextContent('false')
  })
})

describe('AuthProvider - login e logout explicitos', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('logout explicito limpa token e sessao (estaAutenticado=false)', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderComProvider()

    // Aguarda a reidratacao para garantir a sessao ativa antes do logout.
    expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
    expect(screen.getByTestId('autenticado')).toHaveTextContent('true')

    fireEvent.click(screen.getByRole('button', { name: /sair/i }))

    expect(screen.getByTestId('autenticado')).toHaveTextContent('false')
    expect(screen.getByTestId('usuario')).toHaveTextContent('sem-usuario')
    expect(getStoredToken()).toBeNull()
  })

  it('login explicito registra token e usuario sem chamar getMe', () => {
    renderComProvider()

    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    expect(screen.getByTestId('autenticado')).toHaveTextContent('true')
    expect(screen.getByTestId('usuario')).toHaveTextContent('Ana Souza')
    expect(screen.getByTestId('carregando')).toHaveTextContent('false')
    expect(getStoredToken()).toBe('token-do-login')
    // Login ja traz o usuario: nao deve disparar reidratacao.
    expect(getMeMock).not.toHaveBeenCalled()
  })
})
