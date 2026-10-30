import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
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
              <Route
                index
                element={
                  <div>
                    Conteudo <Link to="/produtos/categorias">Ir para categorias</Link>
                  </div>
                }
              />
              <Route path="produtos" element={<div>Produtos</div>} />
              <Route path="produtos/categorias" element={<div>Categorias</div>} />
              <Route path="produtos/fornecedores/:id" element={<div>Um fornecedor</div>} />
              <Route path="produtos/:id" element={<div>Um produto</div>} />
              <Route path="configuracoes/balanca" element={<div>Balanca</div>} />
              <Route path="estoque" element={<div>Estoque</div>} />
              <Route path="clientes" element={<div>Clientes</div>} />
              <Route path="pdv" element={<div>Tela do PDV</div>} />
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

  it('em /produtos/categorias o ativo e Categorias (item proprio), nao Produtos nem Inicio', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout('/produtos/categorias')

    await screen.findByText('Ana Souza')
    expect(screen.getByRole('link', { name: 'Categorias' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /produtos/i })).not.toHaveAttribute('aria-current')
    expect(screen.getByRole('link', { name: /início/i })).not.toHaveAttribute('aria-current')
  })

  it('Produtos fica ativo na pagina de um produto', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout('/produtos/p-1')
    await screen.findByText('Ana Souza')
    expect(screen.getByRole('link', { name: /produtos/i })).toHaveAttribute('aria-current', 'page')
  })

  it('Fornecedores fica ativo na pagina de um fornecedor', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout('/produtos/fornecedores/f-1')
    await screen.findByText('Ana Souza')
    expect(screen.getByRole('link', { name: 'Fornecedores' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /produtos/i })).not.toHaveAttribute('aria-current')
  })

  it('exibe Estoque logo depois de Produtos, ativo em /estoque, tambem para o OPERADOR', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue({ ...usuarioFake, perfil: 'OPERADOR' })

    renderLayout('/estoque')

    await screen.findByText('Ana Souza')
    const estoque = screen.getByRole('link', { name: /estoque/i })
    expect(estoque).toHaveAttribute('href', '/estoque')
    expect(estoque).toHaveAttribute('aria-current', 'page')
    const rotulos = screen.getAllByRole('link').map((link) => link.textContent)
    expect(rotulos.indexOf('Estoque')).toBe(rotulos.indexOf('Produtos') + 1)
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

  it('PDV leva a /pdv para todos, sem "em breve"', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue({ ...usuarioFake, perfil: 'OPERADOR' })

    renderLayout()

    await screen.findByText('Ana Souza')
    const pdv = screen.getByRole('link', { name: /^pdv$/i })
    expect(pdv).toHaveAttribute('href', '/pdv')
    expect(within(pdv).queryByText(/^em breve$/i)).not.toBeInTheDocument()
  })

  it('modo foco no /pdv: sem barra lateral nem topo (a barra do PDV traz o "Menu")', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue({ ...usuarioFake, perfil: 'OPERADOR' })

    renderLayout('/pdv')

    await screen.findByText('Tela do PDV')
    expect(screen.getByRole('complementary', { hidden: true })).toHaveClass('hidden')
    expect(screen.getByRole('complementary', { hidden: true })).not.toHaveClass('md:flex')
    expect(screen.queryByRole('banner')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Abrir menu de navegação' })).not.toBeInTheDocument()
  })

  it('fora do /pdv, a barra lateral fica fixa', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue({ ...usuarioFake, perfil: 'OPERADOR' })

    renderLayout('/clientes')

    await screen.findByText('Ana Souza')
    expect(screen.getByRole('complementary', { hidden: true })).toHaveClass('md:flex')
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

  it('ADMIN: a secao Configurações tem Empresa, Usuários, "Caixa e PDV" e Balança', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout('/configuracoes/balanca')

    await screen.findByText('Ana Souza')
    const secao = document.getElementById(
      screen.getByRole('button', { name: 'Configurações' }).getAttribute('aria-controls') ?? '',
    ) as HTMLElement
    expect(within(secao).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Empresa',
      'Usuários',
      'Caixa e PDV',
      'Balança',
    ])
    expect(within(secao).getByRole('link', { name: 'Caixa e PDV' })).toHaveAttribute('href', '/configuracoes')
    expect(within(secao).getByRole('link', { name: 'Caixa e PDV' })).not.toHaveAttribute('aria-current')
    expect(within(secao).getByRole('link', { name: 'Balança' })).toHaveAttribute('aria-current', 'page')
  })

  it('OPERADOR: em Configurações so ve Empresa', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue({ ...usuarioFake, perfil: 'OPERADOR' })

    renderLayout()

    await screen.findByText('Ana Souza')
    expect(screen.getByRole('link', { name: 'Empresa' })).toHaveAttribute('href', '/empresa')
    expect(screen.queryByRole('link', { name: 'Caixa e PDV' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Balança' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Usuários' })).not.toBeInTheDocument()
  })
})

describe('RootLayout - menu em secoes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('mostra as secoes na ordem: Inicio, Vendas, Catalogo, Clientes, Financeiro e Configurações', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout()

    await screen.findByText('Ana Souza')
    const barra = screen.getByRole('complementary', { hidden: true })
    expect(within(barra).getAllByRole('button', { name: /vendas|catálogo|configurações/i }).map((b) => b.textContent)).toEqual([
      'Vendas',
      'Catálogo',
      'Configurações',
    ])
    expect(within(barra).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Início',
      'PDV',
      'Caixa',
      'Vendas',
      'Produtos',
      'Estoque',
      'Categorias',
      'Marcas',
      'Fornecedores',
      'Unidades',
      'Clientes',
      'Empresa',
      'Usuários',
      'Caixa e PDV',
      'Balança',
    ])
  })

  it('o titulo recolhe e expande a secao, e o navegador lembra', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    const { unmount } = renderLayout()

    await screen.findByText('Ana Souza')
    const vendas = screen.getByRole('button', { name: 'Vendas' })
    expect(vendas).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(vendas)
    expect(vendas).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('link', { name: /^pdv$/i })).not.toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('geitus.menu.recolhidas') ?? '[]')).toEqual(['vendas'])

    unmount()
    renderLayout()
    await screen.findByText('Ana Souza')
    expect(screen.getByRole('button', { name: 'Vendas' })).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('button', { name: 'Vendas' }))
    expect(screen.getByRole('link', { name: /^pdv$/i })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('geitus.menu.recolhidas') ?? '[]')).toEqual([])
  })

  it('a secao do item ativo abre sozinha, mesmo recolhida antes; recolher ali mesmo fecha', async () => {
    localStorage.setItem('geitus.menu.recolhidas', JSON.stringify(['catalogo']))
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout('/estoque')

    await screen.findByText('Ana Souza')
    const catalogo = screen.getByRole('button', { name: 'Catálogo' })
    expect(catalogo).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: /estoque/i })).toHaveAttribute('aria-current', 'page')

    fireEvent.click(catalogo)
    expect(catalogo).toHaveAttribute('aria-expanded', 'false')
  })

  it('recolhida numa pagina, a secao reabre ao voltar a essa mesma pagina numa nova visita', async () => {
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout('/produtos/categorias')

    await screen.findByText('Ana Souza')
    const catalogo = screen.getByRole('button', { name: 'Catálogo' })
    fireEvent.click(catalogo)
    expect(catalogo).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(screen.getByRole('link', { name: /início/i }))
    expect(catalogo).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(await screen.findByRole('link', { name: 'Ir para categorias' }))

    // Nova visita a /produtos/categorias: o item ativo nao pode sumir do menu.
    expect(await screen.findByText('Categorias', { selector: 'div' })).toBeInTheDocument()
    expect(catalogo).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('link', { name: /categorias/i })).toHaveAttribute('aria-current', 'page')
  })

  it('valor estragado no navegador nao quebra o menu (tudo aberto)', async () => {
    localStorage.setItem('geitus.menu.recolhidas', '{nao e json')
    setStoredToken('token-valido')
    getMeMock.mockResolvedValue(usuarioFake)

    renderLayout()

    await screen.findByText('Ana Souza')
    expect(screen.getByRole('button', { name: 'Vendas' })).toHaveAttribute('aria-expanded', 'true')
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
