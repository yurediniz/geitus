import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ProdutosPage } from '@/features/products/ProdutosPage'
import {
  atualizarProduto,
  cadastrarProduto,
  inativarProduto,
  listarProdutos,
  reativarProduto,
} from '@/services/produtoService'
import type { Produto } from '@/types/produto'

vi.mock('@/services/produtoService', () => ({
  listarProdutos: vi.fn(),
  cadastrarProduto: vi.fn(),
  atualizarProduto: vi.fn(),
  inativarProduto: vi.fn(),
  reativarProduto: vi.fn(),
}))

const listarProdutosMock = vi.mocked(listarProdutos)
const cadastrarProdutoMock = vi.mocked(cadastrarProduto)
const atualizarProdutoMock = vi.mocked(atualizarProduto)
const inativarProdutoMock = vi.mocked(inativarProduto)
const reativarProdutoMock = vi.mocked(reativarProduto)

const produtoAtivo: Produto = {
  id: 1,
  nome: 'Arroz 5kg',
  categoria: 'Mercearia',
  unidade: 'UN',
  precoVenda: 25.9,
  custo: 18,
  estoqueMinimo: 2,
  codigoBarras: '7891234567890',
  sku: 'SKU-ARROZ',
  ativo: true,
  criadoEm: '2026-01-01T00:00:00Z',
  atualizadoEm: null,
}

const produtoInativo: Produto = {
  ...produtoAtivo,
  id: 2,
  nome: 'Feijão 1kg',
  sku: 'SKU-FEIJAO',
  codigoBarras: null,
  ativo: false,
}

function renderComProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

async function abrirFormularioNovo() {
  fireEvent.click(screen.getByRole('button', { name: /novo produto/i }))
  return screen.findByLabelText(/^nome$/i)
}

describe('ProdutosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renderiza o titulo e o estado de carregamento', () => {
    listarProdutosMock.mockReturnValue(new Promise(() => {}))

    renderComProviders(<ProdutosPage />)

    expect(screen.getByRole('heading', { name: 'Produtos' })).toBeInTheDocument()
    expect(screen.getByText(/carregando produtos/i)).toBeInTheDocument()
  })

  it('mostra estado vazio quando nao ha produtos', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderComProviders(<ProdutosPage />)

    expect(await screen.findByText(/nenhum produto encontrado/i)).toBeInTheDocument()
  })

  it('lista produtos com status visual e dados principais', async () => {
    listarProdutosMock.mockResolvedValue([produtoAtivo, produtoInativo])

    renderComProviders(<ProdutosPage />)

    expect(await screen.findByText('Arroz 5kg')).toBeInTheDocument()
    expect(screen.getByText('Feijão 1kg')).toBeInTheDocument()
    expect(screen.getByText('SKU-ARROZ')).toBeInTheDocument()
    expect(screen.getAllByText('R$ 25,90').length).toBeGreaterThan(0)
    expect(screen.getByText('Inativo')).toBeInTheDocument()
  })

  it('aplica busca por nome, SKU ou codigo de barras', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderComProviders(<ProdutosPage />)

    await screen.findByText(/nenhum produto encontrado/i)
    fireEvent.change(screen.getByLabelText(/busca/i), { target: { value: 'SKU-ARROZ' } })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))

    await waitFor(() => {
      expect(listarProdutosMock).toHaveBeenLastCalledWith({ busca: 'SKU-ARROZ', status: 'todos' })
    })
  })

  it('filtra por status inativo', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderComProviders(<ProdutosPage />)

    await screen.findByText(/nenhum produto encontrado/i)
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'inativos' } })

    await waitFor(() => {
      expect(listarProdutosMock).toHaveBeenLastCalledWith({ busca: '', status: 'inativos' })
    })
  })

  it('abre o formulario de novo produto', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()

    expect(screen.getByLabelText(/^nome$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/preço de venda/i)).toBeInTheDocument()
  })

  it('valida nome obrigatorio antes de cadastrar', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    expect(await screen.findByText(/informe o nome do produto/i)).toBeInTheDocument()
    expect(cadastrarProdutoMock).not.toHaveBeenCalled()
  })

  it('valida preco obrigatorio e nao negativo', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()
    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'Produto' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    expect(await screen.findByText(/informe o preço de venda/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '-1' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    expect(await screen.findByText(/preço de venda não pode ser negativo/i)).toBeInTheDocument()
  })

  it('valida custo negativo, estoque minimo negativo e limite de SKU', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()
    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'Produto' } })
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/^custo$/i), { target: { value: '-1' } })
    fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '-2' } })
    fireEvent.change(screen.getByLabelText(/sku/i), { target: { value: 'A'.repeat(51) } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    expect(await screen.findByText(/custo não pode ser negativo/i)).toBeInTheDocument()
    expect(screen.getByText(/estoque mínimo não pode ser negativo/i)).toBeInTheDocument()
    expect(screen.getByText(/sku deve ter no máximo 50 caracteres/i)).toBeInTheDocument()
    expect(cadastrarProdutoMock).not.toHaveBeenCalled()
  })

  it('cadastra produto com sucesso e atualiza a lista', async () => {
    const produtoCriado: Produto = { ...produtoAtivo, nome: 'Café 500g', sku: 'SKU-CAFE' }
    listarProdutosMock.mockResolvedValueOnce([]).mockResolvedValueOnce([produtoCriado])
    cadastrarProdutoMock.mockResolvedValue(produtoCriado)

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()
    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'Café 500g' } })
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '12.5' } })
    fireEvent.change(screen.getByLabelText(/sku/i), { target: { value: 'SKU-CAFE' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    await waitFor(() => {
      expect(cadastrarProdutoMock).toHaveBeenCalledWith({
        nome: 'Café 500g',
        categoria: null,
        unidade: null,
        precoVenda: 12.5,
        custo: null,
        estoqueMinimo: null,
        codigoBarras: null,
        sku: 'SKU-CAFE',
      })
    })
    expect(await screen.findByText(/produto cadastrado com sucesso/i)).toBeInTheDocument()
    expect(await screen.findByText('Café 500g')).toBeInTheDocument()
  })

  it('edita produto com sucesso', async () => {
    listarProdutosMock.mockResolvedValue([produtoAtivo])
    atualizarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Arroz Tipo 1' })

    renderComProviders(<ProdutosPage />)

    const item = await screen.findByText('Arroz 5kg')
    const card = item.closest('article')
    expect(card).not.toBeNull()
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /editar/i }))

    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'Arroz Tipo 1' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    await waitFor(() => {
      expect(atualizarProdutoMock).toHaveBeenCalledWith(1, expect.objectContaining({ nome: 'Arroz Tipo 1' }))
    })
    expect(await screen.findByText(/produto atualizado com sucesso/i)).toBeInTheDocument()
  })

  it('mostra erro ao salvar edicao de produto', async () => {
    listarProdutosMock.mockResolvedValue([produtoAtivo])
    atualizarProdutoMock.mockRejectedValue(new Error('falha ao atualizar'))

    renderComProviders(<ProdutosPage />)

    const item = await screen.findByText('Arroz 5kg')
    const card = item.closest('article')
    expect(card).not.toBeNull()
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /editar/i }))

    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'Arroz Tipo 1' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    expect(await screen.findByText(/não foi possível salvar o produto/i)).toBeInTheDocument()
  })

  it('inativa produto com sucesso', async () => {
    listarProdutosMock.mockResolvedValue([produtoAtivo])
    inativarProdutoMock.mockResolvedValue({ ...produtoAtivo, ativo: false })

    renderComProviders(<ProdutosPage />)

    const item = await screen.findByText('Arroz 5kg')
    const card = item.closest('article')
    expect(card).not.toBeNull()
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /inativar/i }))

    await waitFor(() => {
      expect(inativarProdutoMock).toHaveBeenCalledWith(1)
    })
    expect(await screen.findByText(/produto inativado com sucesso/i)).toBeInTheDocument()
  })

  it('mostra erro ao alterar status do produto', async () => {
    listarProdutosMock.mockResolvedValue([produtoAtivo])
    inativarProdutoMock.mockRejectedValue(new Error('falha ao inativar'))

    renderComProviders(<ProdutosPage />)

    const item = await screen.findByText('Arroz 5kg')
    const card = item.closest('article')
    expect(card).not.toBeNull()
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /inativar/i }))

    expect(await screen.findByText(/não foi possível alterar o status do produto/i)).toBeInTheDocument()
  })

  it('reativa produto com sucesso', async () => {
    listarProdutosMock.mockResolvedValue([produtoInativo])
    reativarProdutoMock.mockResolvedValue({ ...produtoInativo, ativo: true })

    renderComProviders(<ProdutosPage />)

    const item = await screen.findByText('Feijão 1kg')
    const card = item.closest('article')
    expect(card).not.toBeNull()
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /reativar/i }))

    await waitFor(() => {
      expect(reativarProdutoMock).toHaveBeenCalledWith(2)
    })
    expect(await screen.findByText(/produto reativado com sucesso/i)).toBeInTheDocument()
  })

  it('mostra erro ao carregar produtos', async () => {
    listarProdutosMock.mockRejectedValue(new Error('falha'))

    renderComProviders(<ProdutosPage />)

    expect(await screen.findByText(/não foi possível carregar os produtos/i)).toBeInTheDocument()
  })

  it('mostra erro ao salvar produto', async () => {
    listarProdutosMock.mockResolvedValue([])
    cadastrarProdutoMock.mockRejectedValue(new Error('falha ao salvar'))

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()
    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'Produto' } })
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    expect(await screen.findByText(/não foi possível salvar o produto/i)).toBeInTheDocument()
  })
})
