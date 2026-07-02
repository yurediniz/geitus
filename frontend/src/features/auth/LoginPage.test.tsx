import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { LoginPage } from '@/features/auth/LoginPage'
import { AuthProvider } from '@/hooks/useAuth'
import { login as loginRequest } from '@/services/authService'
import { HttpError } from '@/services/httpClient'

// Mocka o service de auth para evitar rede real e controlar cada cenario.
vi.mock('@/services/authService', () => ({
  login: vi.fn(),
}))

const loginMock = vi.mocked(loginRequest)

function renderLogin() {
  // retry: false deixa o teste rapido e deterministico em caso de erro.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <LoginPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  )
}

/** Preenche email e senha do formulario. */
function preencherCredenciais(email: string, senha: string) {
  fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: email } })
  fireEvent.change(screen.getByLabelText(/senha/i), { target: { value: senha } })
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renderiza os campos e o botao de entrar', () => {
    renderLogin()

    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/senha/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('mostra erros e bloqueia o submit quando os campos estao vazios', async () => {
    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    expect(await screen.findByText(/informe o e-mail/i)).toBeInTheDocument()
    expect(screen.getByText(/informe a senha/i)).toBeInTheDocument()
    // Validacao bloqueia a chamada de API.
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('desabilita o botao e mostra indicador de loading durante o submit', async () => {
    // Promise que nao resolve mantem a mutation pendente (estado de loading).
    loginMock.mockReturnValue(new Promise(() => {}))
    renderLogin()

    preencherCredenciais('ana@empresa.com', 'segredo123')
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    const botao = await screen.findByRole('button', { name: /entrando/i })
    expect(botao).toBeDisabled()
  })

  it('exibe mensagem humana quando as credenciais sao invalidas (401)', async () => {
    loginMock.mockRejectedValue(new HttpError(401, 'Nao autorizado.'))
    renderLogin()

    preencherCredenciais('ana@empresa.com', 'senhaerrada')
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/e-mail ou senha inválidos/i)
  })

  it('chama o service de login com email e senha ao submeter dados validos', async () => {
    loginMock.mockResolvedValue({
      token: 'token-abc',
      usuario: {
        id: 1,
        nome: 'Ana',
        email: 'ana@empresa.com',
        perfil: 'ADMIN',
        empresaId: 1,
      },
    })
    renderLogin()

    preencherCredenciais('ana@empresa.com', 'segredo123')
    fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('ana@empresa.com', 'segredo123')
    })
  })
})
