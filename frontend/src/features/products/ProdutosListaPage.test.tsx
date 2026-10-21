import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'

import { ProdutosListaPage } from '@/features/products/ProdutosListaPage'
import { useAuth } from '@/hooks/useAuth'
import { inativarProduto, listarProdutos, reativarProduto } from '@/services/produtoService'
import { listarCategorias } from '@/services/categoriaService'
import { listarUnidades } from '@/services/unidadeService'
import { CX, ID_ARROZ, ID_FEIJAO, produtoAtivo, produtoInativo, produtoSimples, resumo, UN } from '@/test/fixturesProduto'
import type { Produto } from '@/types/produto'

vi.mock('@/services/produtoService', () => ({
  listarProdutos: vi.fn(),
  inativarProduto: vi.fn(),
  reativarProduto: vi.fn(),
}))

vi.mock('@/services/unidadeService', () => ({
  listarUnidades: vi.fn(),
}))

vi.mock('@/services/categoriaService', () => ({
  listarCategorias: vi.fn(),
}))

// Mocka o hook de auth para alternar o perfil (ADMIN gerencia / OPERADOR leitura).
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const listarProdutosMock = vi.mocked(listarProdutos)
const inativarProdutoMock = vi.mocked(inativarProduto)
const reativarProdutoMock = vi.mocked(reativarProduto)
const listarUnidadesMock = vi.mocked(listarUnidades)
const listarCategoriasMock = vi.mocked(listarCategorias)
const useAuthMock = vi.mocked(useAuth)

function definirPerfil(perfil: 'ADMIN' | 'OPERADOR') {
  useAuthMock.mockReturnValue({
    usuario: {
      id: 1,
      nome: 'Ana Souza',
      email: 'ana@mercado.com',
      perfil,
      empresa: { id: 1, nome: 'Mercado Central', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
    },
    token: 'token',
    estaAutenticado: true,
    carregandoSessao: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

/** Destino da navegacao: mostra o caminho e o estado recebidos. */
function SondaProduto() {
  const location = useLocation()
  return (
    <div>
      <p>Página do produto {location.pathname}</p>
      <p data-testid="estado">{JSON.stringify(location.state)}</p>
    </div>
  )
}

function renderLista(entrada: string | { pathname: string; search?: string; state?: unknown } = '/produtos') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      { path: '/produtos', element: <ProdutosListaPage /> },
      { path: '/produtos/novo', element: <SondaProduto /> },
      { path: '/produtos/:id', element: <SondaProduto /> },
    ],
    { initialEntries: [entrada] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

async function cardDoProduto(nome: string): Promise<HTMLElement> {
  // O nome tambem aparece (oculto) no rotulo do link "Editar": busca pelo titulo do card.
  const titulo = await screen.findByRole('heading', { name: nome })
  return titulo.closest('article') as HTMLElement
}

describe('ProdutosListaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
  })

  it('exibe a sub-navegacao do catalogo com Produtos como aba atual', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderLista()

    const nav = await screen.findByRole('navigation', { name: /catálogo/i })
    expect(within(nav).getByRole('link', { name: 'Produtos' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Categorias' })).toHaveAttribute('href', '/produtos/categorias')
    expect(within(nav).getByRole('link', { name: 'Unidades' })).toHaveAttribute('href', '/produtos/unidades')
  })

  it('renderiza o titulo e o estado de carregamento', () => {
    listarProdutosMock.mockReturnValue(new Promise(() => {}))

    renderLista()

    expect(screen.getByRole('heading', { name: 'Produtos' })).toBeInTheDocument()
    expect(screen.getByText(/carregando produtos/i)).toBeInTheDocument()
  })

  it('mostra estado vazio quando nao ha produtos', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderLista()

    expect(await screen.findByText(/nenhum produto encontrado/i)).toBeInTheDocument()
  })

  it('mostra erro ao carregar produtos', async () => {
    listarProdutosMock.mockRejectedValue(new Error('falha'))

    renderLista()

    expect(await screen.findByText(/não foi possível carregar os produtos/i)).toBeInTheDocument()
  })

  it('lista produtos com status visual e dados principais', async () => {
    listarProdutosMock.mockResolvedValue([produtoAtivo, produtoInativo])

    renderLista()

    expect(await screen.findByRole('heading', { name: 'Arroz 5kg' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Feijão 1kg' })).toBeInTheDocument()
    expect(screen.getByText('SKU-ARROZ')).toBeInTheDocument()
    expect(screen.getAllByText('R$ 25,90').length).toBeGreaterThan(0)
    expect(screen.getByText('Inativo')).toBeInTheDocument()
  })

  it('mostra o primeiro codigo de barras e quantos ha alem dele', async () => {
    const produto: Produto = {
      ...produtoAtivo,
      codigosBarras: [
        { codigo: '7891000315507', formato: 'EAN13' },
        { codigo: '96385074', formato: 'EAN8' },
        { codigo: 'ABC-123', formato: 'OUTRO' },
      ],
    }
    listarProdutosMock.mockResolvedValue([produto])

    renderLista()

    const card = await cardDoProduto('Arroz 5kg')
    expect(within(card).getByText('7891000315507 (+2)')).toBeInTheDocument()
  })

  describe('busca e status na URL', () => {
    it('aplica a busca e grava na URL', async () => {
      listarProdutosMock.mockResolvedValue([])

      const router = renderLista()

      await screen.findByText(/nenhum produto encontrado/i)
      fireEvent.change(screen.getByLabelText(/busca/i), { target: { value: ' SKU-ARROZ ' } })
      fireEvent.click(screen.getByRole('button', { name: /buscar/i }))

      await waitFor(() => {
        expect(listarProdutosMock).toHaveBeenLastCalledWith({ busca: 'SKU-ARROZ', status: 'todos' })
      })
      expect(router.state.location.search).toBe('?busca=SKU-ARROZ')
    })

    it('buscar não remonta o campo: o foco continua nele (FE I5)', async () => {
      listarProdutosMock.mockResolvedValue([])

      const router = renderLista()
      await screen.findByText(/nenhum produto encontrado/i)
      const campo = screen.getByLabelText(/busca/i)
      campo.focus()
      fireEvent.change(campo, { target: { value: 'arroz' } })

      // Enter no campo envia o formulario de busca.
      fireEvent.submit(campo.closest('form') as HTMLFormElement)

      await waitFor(() => expect(router.state.location.search).toBe('?busca=arroz'))
      await screen.findByText('Resultados para "arroz".')
      expect(screen.getByLabelText(/busca/i)).toBe(campo)
      expect(campo).toHaveFocus()
      expect(campo).toHaveValue('arroz')
    })

    it('busca mudada por fora (histórico) atualiza o campo', async () => {
      listarProdutosMock.mockResolvedValue([])

      const router = renderLista('/produtos?busca=arroz')
      await screen.findByText('Resultados para "arroz".')
      expect(screen.getByLabelText(/busca/i)).toHaveValue('arroz')

      await act(() => router.navigate('/produtos?busca=feijao'))

      expect(await screen.findByText('Resultados para "feijao".')).toBeInTheDocument()
      expect(screen.getByLabelText(/busca/i)).toHaveValue('feijao')
    })

    it('filtra por status inativo e grava na URL', async () => {
      listarProdutosMock.mockResolvedValue([])

      const router = renderLista()

      await screen.findByText(/nenhum produto encontrado/i)
      fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'inativos' } })

      await waitFor(() => {
        expect(listarProdutosMock).toHaveBeenLastCalledWith({ busca: '', status: 'inativos' })
      })
      expect(router.state.location.search).toBe('?status=inativos')
    })

    it('ao montar com ?busca=arroz&status=inativos, preserva o filtro na tela e na consulta', async () => {
      listarProdutosMock.mockResolvedValue([])

      renderLista('/produtos?busca=arroz&status=inativos')

      await screen.findByText(/nenhum produto encontrado/i)
      expect(listarProdutosMock).toHaveBeenCalledWith({ busca: 'arroz', status: 'inativos' })
      expect(screen.getByLabelText(/busca/i)).toHaveValue('arroz')
      expect(screen.getByLabelText(/status/i)).toHaveValue('inativos')
      expect(screen.getByText('Resultados para "arroz".')).toBeInTheDocument()
    })

    it('status desconhecido na URL vira "todos"', async () => {
      listarProdutosMock.mockResolvedValue([])

      renderLista('/produtos?status=qualquer')

      await screen.findByText(/nenhum produto encontrado/i)
      expect(listarProdutosMock).toHaveBeenCalledWith({ busca: '', status: 'todos' })
    })
  })

  describe('navegacao para a pagina do produto', () => {
    it('"Novo produto" abre /produtos/novo levando a URL da lista', async () => {
      listarProdutosMock.mockResolvedValue([])

      renderLista('/produtos?busca=arroz')

      fireEvent.click(await screen.findByRole('link', { name: /novo produto/i }))

      expect(await screen.findByText('Página do produto /produtos/novo')).toBeInTheDocument()
      expect(screen.getByTestId('estado')).toHaveTextContent(JSON.stringify({ voltarPara: '/produtos?busca=arroz' }))
    })

    it('"Editar" abre a pagina do produto pelo UUID levando a URL da lista', async () => {
      listarProdutosMock.mockResolvedValue([produtoAtivo])

      renderLista('/produtos?busca=arroz&status=ativos')

      const card = await cardDoProduto('Arroz 5kg')
      const editar = within(card).getByRole('link', { name: /editar/i })
      expect(editar).toHaveAccessibleName('Editar Arroz 5kg')
      fireEvent.click(editar)

      expect(await screen.findByText(`Página do produto /produtos/${ID_ARROZ}`)).toBeInTheDocument()
      expect(screen.getByTestId('estado')).toHaveTextContent(
        JSON.stringify({ voltarPara: '/produtos?busca=arroz&status=ativos' }),
      )
    })

    it('mostra a mensagem de sucesso vinda da pagina do produto e a retira do historico', async () => {
      listarProdutosMock.mockResolvedValue([produtoAtivo])

      const router = renderLista({ pathname: '/produtos', search: '?busca=arroz', state: { sucesso: 'Produto cadastrado com sucesso.' } })

      expect(await screen.findByRole('status')).toHaveTextContent('Produto cadastrado com sucesso.')
      await waitFor(() => expect(router.state.location.state).toBeNull())
      expect(router.state.location.search).toBe('?busca=arroz')
      expect(screen.getByText('Produto cadastrado com sucesso.')).toBeInTheDocument()
    })

    it('ignora estado de navegacao sem mensagem valida', async () => {
      listarProdutosMock.mockResolvedValue([])

      renderLista({ pathname: '/produtos', state: { sucesso: 42 } })

      await screen.findByText(/nenhum produto encontrado/i)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
    })
  })

  describe('status do produto', () => {
    it('inativa produto com sucesso', async () => {
      listarProdutosMock.mockResolvedValue([produtoAtivo])
      inativarProdutoMock.mockResolvedValue({ ...produtoAtivo, ativo: false })

      renderLista()

      fireEvent.click(within(await cardDoProduto('Arroz 5kg')).getByRole('button', { name: /inativar/i }))

      await waitFor(() => expect(inativarProdutoMock).toHaveBeenCalledWith(ID_ARROZ))
      expect(await screen.findByText(/produto inativado com sucesso/i)).toBeInTheDocument()
    })

    it('reativa produto com sucesso', async () => {
      listarProdutosMock.mockResolvedValue([produtoInativo])
      reativarProdutoMock.mockResolvedValue({ ...produtoInativo, ativo: true })

      renderLista()

      fireEvent.click(within(await cardDoProduto('Feijão 1kg')).getByRole('button', { name: /reativar/i }))

      await waitFor(() => expect(reativarProdutoMock).toHaveBeenCalledWith(ID_FEIJAO))
      expect(await screen.findByText(/produto reativado com sucesso/i)).toBeInTheDocument()
    })

    it('mostra erro ao alterar status do produto', async () => {
      listarProdutosMock.mockResolvedValue([produtoAtivo])
      inativarProdutoMock.mockRejectedValue(new Error('falha ao inativar'))

      renderLista()

      fireEvent.click(within(await cardDoProduto('Arroz 5kg')).getByRole('button', { name: /inativar/i }))

      expect(await screen.findByText(/não foi possível alterar o status do produto/i)).toBeInTheDocument()
    })
  })

  describe('card do produto', () => {
    it('exibe margem, markup e a marca do produto', async () => {
      listarProdutosMock.mockResolvedValue([produtoAtivo])

      renderLista()

      const card = await cardDoProduto('Arroz 5kg')
      expect(within(card).getByText('Tio João')).toBeInTheDocument()
      expect(within(card).getByText('30,50%')).toBeInTheDocument()
      expect(within(card).getByText('43,89%')).toBeInTheDocument()
    })

    it('omite campos secundários vazios, mantendo preço e status', async () => {
      listarProdutosMock.mockResolvedValue([produtoSimples])

      renderLista()

      const card = await cardDoProduto('Produto Simples')
      expect(within(card).getByText('Preço')).toBeInTheDocument()
      expect(within(card).getByText('R$ 5,00')).toBeInTheDocument()
      expect(within(card).getByText('Ativo')).toBeInTheDocument()
      for (const rotulo of [
        'Custo',
        'SKU',
        'Código de barras',
        'Categoria',
        'Compra',
        'Estoque mínimo',
        'Estoque máximo',
        'Ponto de reposição',
        'Preço mínimo',
        'Margem',
        'Markup',
      ]) {
        expect(within(card).queryByText(rotulo)).not.toBeInTheDocument()
      }
    })

    it('mantém os campos preenchidos visíveis', async () => {
      listarProdutosMock.mockResolvedValue([produtoAtivo])

      renderLista()

      const card = await cardDoProduto('Arroz 5kg')
      for (const rotulo of [
        'Custo',
        'SKU',
        'Código de barras',
        'Categoria',
        'Unidade',
        'Estoque mínimo',
        'Estoque máximo',
        'Ponto de reposição',
        'Preço mínimo',
      ]) {
        expect(within(card).getByText(rotulo)).toBeInTheDocument()
      }
      expect(within(card).getByText('7891000315507')).toBeInTheDocument()
    })

    it('mostra o caminho da categoria, a sigla da unidade e a conversão de compra', async () => {
      const produto: Produto = {
        ...produtoAtivo,
        categoria: { id: 'sache', nome: 'Sachê', caminho: 'Ração › Úmida › Sachê' },
        unidade: resumo(UN),
        unidadeCompra: resumo(CX),
        fatorConversao: 12,
        conversaoTexto: '1 CX = 12 UN',
      }
      listarProdutosMock.mockResolvedValue([produto])

      renderLista()

      const card = await cardDoProduto('Arroz 5kg')
      expect(within(card).getByText('Ração › Úmida › Sachê')).toBeInTheDocument()
      expect(within(card).getByText('UN')).toBeInTheDocument()
      expect(within(card).getByText('1 CX = 12 UN')).toBeInTheDocument()
      expect(within(card).getByText('2 UN')).toBeInTheDocument()
    })

    it('não carrega unidades nem categorias na lista', async () => {
      listarProdutosMock.mockResolvedValue([produtoAtivo])

      renderLista()

      await screen.findByRole('heading', { name: 'Arroz 5kg' })
      expect(listarUnidadesMock).not.toHaveBeenCalled()
      expect(listarCategoriasMock).not.toHaveBeenCalled()
    })
  })

  describe('perfis', () => {
    it('OPERADOR vê a lista em modo leitura e abre o produto só para consulta', async () => {
      definirPerfil('OPERADOR')
      listarProdutosMock.mockResolvedValue([produtoAtivo])

      renderLista()

      const card = await cardDoProduto('Arroz 5kg')
      expect(screen.getByText(/somente administradores podem gerenciar produtos/i)).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /novo produto/i })).not.toBeInTheDocument()
      expect(within(card).queryByRole('link', { name: /editar/i })).not.toBeInTheDocument()
      expect(within(card).queryByRole('button', { name: /inativar/i })).not.toBeInTheDocument()
      expect(within(card).getByRole('link', { name: 'Ver detalhes Arroz 5kg' })).toHaveAttribute(
        'href',
        `/produtos/${ID_ARROZ}`,
      )
    })

    it('ADMIN vê as ações de gestão e o botão de novo produto', async () => {
      listarProdutosMock.mockResolvedValue([produtoAtivo])

      renderLista()

      expect(await screen.findByRole('heading', { name: 'Arroz 5kg' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /novo produto/i })).toHaveAttribute('href', '/produtos/novo')
      expect(screen.getByRole('link', { name: /editar/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /inativar/i })).toBeInTheDocument()
      expect(screen.queryByText(/somente administradores podem gerenciar produtos/i)).not.toBeInTheDocument()
    })
  })

  describe('promoção vigente', () => {
    it('mostra o selo Promoção, o preço promocional e o normal riscado', async () => {
      const emPromocao: Produto = {
        ...produtoAtivo,
        precoVenda: 10,
        promocao: { preco: 8.9, inicio: '2026-11-01', fim: '2026-11-15', situacao: 'VIGENTE' },
        emPromocao: true,
      }
      listarProdutosMock.mockResolvedValue([emPromocao])

      renderLista()

      const card = await cardDoProduto('Arroz 5kg')
      expect(within(card).getByText('Promoção')).toBeInTheDocument()
      expect(within(card).getByText(/^de R\$\s10,00 por R\$\s8,90$/)).toHaveClass('sr-only')
      const riscado = within(card).getByText(/^R\$\s10,00$/)
      expect(riscado.tagName).toBe('S')
      expect(within(card).getByText(/^R\$\s8,90$/)).toBeInTheDocument()
    })

    it.each([
      ['AGENDADA', '2026-12-01', '2026-12-15'],
      ['ENCERRADA', '2026-10-01', '2026-10-15'],
    ] as const)('promoção %s não muda o preço da lista', async (situacao, inicio, fim) => {
      const semPromocaoVigente: Produto = {
        ...produtoAtivo,
        promocao: { preco: 20.9, inicio, fim, situacao },
        emPromocao: false,
      }
      listarProdutosMock.mockResolvedValue([semPromocaoVigente])

      renderLista()

      const card = await cardDoProduto('Arroz 5kg')
      expect(within(card).queryByText('Promoção')).not.toBeInTheDocument()
      expect(within(card).queryByText(/R\$\s20,90/)).not.toBeInTheDocument()
      expect(within(card).getByText(/^R\$\s25,90$/).tagName).not.toBe('S')
    })
  })
})
