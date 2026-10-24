import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

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
function renderLayout(entrada = '/') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[entrada]}>
          <Routes>
            <Route path="/" element={<RootLayout />}>
              <Route index element={<div>Conteudo</div>} />
              <Route path="produtos" element={<div>Produtos</div>} />
              <Route path="produtos/categorias" element={<div>Categorias</div>} />
              <Route path="clientes" element={<div>Clientes</div>} />
            </Route>
            <Route path="/login" element={<div>Tela de login</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
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

  it('exibe Produtos como item de navegacao ativo, nao como item em breve', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout('/produtos')

    await screen.findByText('Ana Souza')
    const produtos = screen.getByRole('link', { name: /produtos/i })

    expect(produtos).toHaveAttribute('href', '/produtos')
    expect(produtos).toHaveAttribute('aria-current', 'page')
    expect(screen.getAllByText(/^em breve$/i).length).toBeGreaterThan(0)
  })

  it('mantem Produtos ativo nas sub-rotas do catalogo e Inicio inativo', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout('/produtos/categorias')

    await screen.findByText('Ana Souza')
    expect(screen.getByRole('link', { name: /produtos/i })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /início/i })).not.toHaveAttribute('aria-current')
  })

  it('exibe Clientes como item de navegacao ativo, nao como item em breve', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue({ ...usuarioFake, perfil: 'OPERADOR' })

    renderLayout('/clientes')

    await screen.findByText('Ana Souza')
    const clientes = screen.getByRole('link', { name: /clientes/i })

    expect(clientes).toHaveAttribute('href', '/clientes')
    expect(clientes).toHaveAttribute('aria-current', 'page')
    expect(within(clientes).queryByText(/^em breve$/i)).not.toBeInTheDocument()
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

describe('RootLayout - item de Usuarios por perfil', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('mostra o item "Usuários" na sidebar para ADMIN', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout()

    await screen.findByText('Ana Souza')
    expect(screen.getByRole('link', { name: /usuários/i })).toHaveAttribute('href', '/usuarios')
  })

  it('nao mostra o item "Usuários" para OPERADOR', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue({ ...usuarioFake, perfil: 'OPERADOR' })

    renderLayout()

    await screen.findByText('Ana Souza')
    expect(screen.queryByRole('link', { name: /usuários/i })).not.toBeInTheDocument()
  })
})

describe('RootLayout - Caixa e Configurações', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('Caixa leva a /caixa para todos, sem "em breve"', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue({ ...usuarioFake, perfil: 'OPERADOR' })

    renderLayout()

    await screen.findByText('Ana Souza')
    const caixa = screen.getByRole('link', { name: /^caixa$/i })
    expect(caixa).toHaveAttribute('href', '/caixa')
    expect(within(caixa).queryByText(/^em breve$/i)).not.toBeInTheDocument()
  })

  it('mostra "Configurações" para ADMIN, levando a /configuracoes', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout()

    await screen.findByText('Ana Souza')
    expect(screen.getByRole('link', { name: /configurações/i })).toHaveAttribute('href', '/configuracoes')
  })

  it('OPERADOR não vê "Configurações"', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue({ ...usuarioFake, perfil: 'OPERADOR' })

    renderLayout()

    await screen.findByText('Ana Souza')
    expect(screen.queryByRole('link', { name: /configurações/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Configurações')).not.toBeInTheDocument()
  })
})

describe('RootLayout - navegacao mobile (drawer)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('abre o drawer pelo botao de menu e da acesso a navegacao', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout()
    await screen.findByText('Ana Souza')

    // Sem o drawer aberto nao ha dialogo na tela.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /abrir menu/i }))

    const dialog = await screen.findByRole('dialog')
    // A mesma navegacao da sidebar fica acessivel dentro do drawer.
    expect(within(dialog).getByRole('link', { name: /produtos/i })).toHaveAttribute(
      'href',
      '/produtos',
    )
    expect(within(dialog).getByRole('link', { name: /empresa/i })).toBeInTheDocument()
  })

  it('fecha o drawer ao escolher um item de navegacao', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout()
    await screen.findByText('Ana Souza')

    fireEvent.click(screen.getByRole('button', { name: /abrir menu/i }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.click(within(dialog).getByRole('link', { name: /produtos/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Fechado o drawer, resta o link da sidebar — agora marcado como ativo,
    // confirmando que a navegacao ocorreu.
    expect(screen.getByRole('link', { name: /produtos/i })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})
