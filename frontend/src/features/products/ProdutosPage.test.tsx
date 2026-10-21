import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { ProdutosPage } from '@/features/products/ProdutosPage'
import { HttpError } from '@/services/httpClient'
import { useAuth } from '@/hooks/useAuth'
import {
  atualizarProduto,
  cadastrarProduto,
  inativarProduto,
  listarProdutos,
  reativarProduto,
} from '@/services/produtoService'
import { cadastrarCategoria, listarCategorias } from '@/services/categoriaService'
import { listarUnidades } from '@/services/unidadeService'
import type { Categoria, UnidadeMedida, UnidadeResumo } from '@/types/catalogo'
import type { Produto } from '@/types/produto'

vi.mock('@/services/produtoService', () => ({
  listarProdutos: vi.fn(),
  cadastrarProduto: vi.fn(),
  atualizarProduto: vi.fn(),
  inativarProduto: vi.fn(),
  reativarProduto: vi.fn(),
}))

vi.mock('@/services/unidadeService', () => ({
  listarUnidades: vi.fn(),
}))

vi.mock('@/services/categoriaService', () => ({
  listarCategorias: vi.fn(),
  cadastrarCategoria: vi.fn(),
}))

// Mocka o hook de auth para alternar o perfil (ADMIN gerencia / OPERADOR leitura).
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const listarProdutosMock = vi.mocked(listarProdutos)
const cadastrarProdutoMock = vi.mocked(cadastrarProduto)
const atualizarProdutoMock = vi.mocked(atualizarProduto)
const inativarProdutoMock = vi.mocked(inativarProduto)
const reativarProdutoMock = vi.mocked(reativarProduto)
const listarUnidadesMock = vi.mocked(listarUnidades)
const listarCategoriasMock = vi.mocked(listarCategorias)
const cadastrarCategoriaMock = vi.mocked(cadastrarCategoria)
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

function unidade(id: string, sigla: string, descricao: string, ativo = true): UnidadeMedida {
  return {
    id,
    sigla,
    descricao,
    fracionada: false,
    ativo,
    emUso: 0,
    criadoEm: '2026-10-20T10:00:00',
    atualizadoEm: null,
  }
}

function resumo({ id, sigla, descricao, fracionada }: UnidadeMedida): UnidadeResumo {
  return { id, sigla, descricao, fracionada }
}

const UN = unidade('un', 'UN', 'Unidade')
const KG = unidade('kg', 'KG', 'Quilograma')
const CX = unidade('cx', 'CX', 'Caixa')
const PCT_INATIVA = unidade('pct', 'PCT', 'Pacote', false)
const UNIDADES = [CX, KG, PCT_INATIVA, UN]

function categoria(id: string, nome: string, parentId: string | null, caminho: string): Categoria {
  return {
    id,
    nome,
    parentId,
    caminho,
    nivel: caminho.split(' › ').length - 1,
    ativo: true,
    selecionavel: true,
    quantidadeSubcategorias: 0,
    quantidadeProdutos: 0,
    criadoEm: '2026-10-20T10:00:00',
    atualizadoEm: null,
  }
}

const MERCEARIA = categoria('mercearia', 'Mercearia', null, 'Mercearia')
const RACAO = categoria('racao', 'Ração', null, 'Ração')
const SACHE = categoria('sache', 'Sachê', 'racao', 'Ração › Sachê')
const CATEGORIAS = [MERCEARIA, RACAO, SACHE]

const produtoAtivo: Produto = {
  id: 1,
  nome: 'Arroz 5kg',
  categoria: { id: 'mercearia', nome: 'Mercearia', caminho: 'Mercearia' },
  marca: 'Tio João',
  unidade: resumo(UN),
  unidadeCompra: null,
  fatorConversao: null,
  conversaoTexto: null,
  descricao: null,
  precoVenda: 25.9,
  custo: 18,
  precoMinimo: 20,
  estoqueMinimo: 2,
  estoqueMaximo: 50,
  pontoReposicao: 10,
  codigoBarras: '7891234567890',
  sku: 'SKU-ARROZ',
  ativo: true,
  margem: 30.5,
  markup: 43.89,
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

// Produto minimo: apenas nome e preco de venda; todos os campos opcionais nulos.
const produtoSimples: Produto = {
  id: 3,
  nome: 'Produto Simples',
  categoria: null,
  marca: null,
  unidade: resumo(UN),
  unidadeCompra: null,
  fatorConversao: null,
  conversaoTexto: null,
  descricao: null,
  precoVenda: 5,
  custo: null,
  precoMinimo: null,
  estoqueMinimo: null,
  estoqueMaximo: null,
  pontoReposicao: null,
  codigoBarras: null,
  sku: null,
  ativo: true,
  margem: null,
  markup: null,
  criadoEm: '2026-01-01T00:00:00Z',
  atualizadoEm: null,
}

function renderComProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  // A pagina renderiza a sub-navegacao do catalogo (NavLink), que exige um router.
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/produtos']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

async function abrirFormularioNovo() {
  fireEvent.click(screen.getByRole('button', { name: /novo produto/i }))
  return screen.findByLabelText(/^nome/i)
}

/** Espera as unidades carregarem e escolhe a unidade de venda. */
async function selecionarUnidadeVenda(id = 'un') {
  const select = screen.getByLabelText(/unidade de venda/i)
  await waitFor(() => expect(select).toBeEnabled())
  fireEvent.change(select, { target: { value: id } })
}

/** Campo do fator: o rotulo e dinamico ("Quantas UN vêm em 1 CX?"). */
function campoFator(): HTMLElement {
  return screen.getByLabelText(/^quantas .* vêm em 1 /i)
}

function rotulosDasOpcoes(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((opcao) => opcao.textContent ?? '')
}

async function cardDoProduto(nome: string): Promise<HTMLElement> {
  const item = await screen.findByText(nome)
  return item.closest('article') as HTMLElement
}

describe('ProdutosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
    listarUnidadesMock.mockResolvedValue(UNIDADES)
    listarCategoriasMock.mockResolvedValue(CATEGORIAS)
  })

  it('exibe a sub-navegacao do catalogo com Produtos como aba atual', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderComProviders(<ProdutosPage />)

    const nav = await screen.findByRole('navigation', { name: /catálogo/i })
    expect(within(nav).getByRole('link', { name: 'Produtos' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Categorias' })).toHaveAttribute('href', '/produtos/categorias')
    expect(within(nav).getByRole('link', { name: 'Unidades' })).toHaveAttribute('href', '/produtos/unidades')
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

    expect(screen.getByLabelText(/^nome/i)).toBeInTheDocument()
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
    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Produto' } })
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
    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Produto' } })
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '-1' } })
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
    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Café 500g' } })
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '12.5' } })
    await selecionarUnidadeVenda()
    fireEvent.change(screen.getByLabelText(/sku/i), { target: { value: 'SKU-CAFE' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    await waitFor(() => {
      expect(cadastrarProdutoMock).toHaveBeenCalledWith({
        nome: 'Café 500g',
        unidadeId: 'un',
        categoriaId: null,
        unidadeCompraId: null,
        fatorConversao: null,
        marca: null,
        descricao: null,
        precoVenda: 12.5,
        custo: null,
        precoMinimo: null,
        estoqueMinimo: null,
        estoqueMaximo: null,
        pontoReposicao: null,
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

    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Arroz Tipo 1' } })
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

    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Arroz Tipo 1' } })
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

  it('mostra erro ao salvar produto (rede)', async () => {
    listarProdutosMock.mockResolvedValue([])
    cadastrarProdutoMock.mockRejectedValue(new Error('falha ao salvar'))

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()
    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Produto' } })
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
    await selecionarUnidadeVenda()
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    expect(await screen.findByText(/não foi possível salvar o produto/i)).toBeInTheDocument()
  })

  it('concatena as mensagens de campo quando o backend responde 400', async () => {
    listarProdutosMock.mockResolvedValue([])
    cadastrarProdutoMock.mockRejectedValue(
      new HttpError(400, 'Dados invalidos.', {
        precoVenda: 'Preço de venda inválido.',
        sku: 'SKU inválido.',
      }),
    )

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()
    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Produto' } })
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
    await selecionarUnidadeVenda()
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    expect(
      await screen.findByText(/preço de venda inválido\.\s*sku inválido\./i),
    ).toBeInTheDocument()
  })

  it('mostra a mensagem do backend quando o SKU está duplicado (409)', async () => {
    listarProdutosMock.mockResolvedValue([])
    cadastrarProdutoMock.mockRejectedValue(
      new HttpError(409, 'Já existe um produto com este SKU nesta empresa.'),
    )

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()
    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Produto' } })
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
    await selecionarUnidadeVenda()
    fireEvent.change(screen.getByLabelText(/sku/i), { target: { value: 'SKU-DUP' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    expect(
      await screen.findByText(/já existe um produto com este sku nesta empresa/i),
    ).toBeInTheDocument()
  })

  it('barra o submit quando o preço mínimo é maior que o preço de venda', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()
    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Produto' } })
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/preço mínimo/i), { target: { value: '15' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    expect(
      await screen.findByText(/preço mínimo não pode ser maior que o preço de venda/i),
    ).toBeInTheDocument()
    expect(cadastrarProdutoMock).not.toHaveBeenCalled()
  })

  it('barra o submit quando o estoque máximo é menor que o estoque mínimo', async () => {
    listarProdutosMock.mockResolvedValue([])

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()
    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Produto' } })
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '20' } })
    fireEvent.change(screen.getByLabelText(/estoque máximo/i), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    expect(
      await screen.findByText(/estoque máximo não pode ser menor que o estoque mínimo/i),
    ).toBeInTheDocument()
    expect(cadastrarProdutoMock).not.toHaveBeenCalled()
  })

  it('cadastra produto com os novos campos preenchidos montando o request correto', async () => {
    const produtoCriado: Produto = { ...produtoAtivo, id: 3, nome: 'Ração Premium' }
    listarProdutosMock.mockResolvedValueOnce([]).mockResolvedValueOnce([produtoCriado])
    cadastrarProdutoMock.mockResolvedValue(produtoCriado)

    renderComProviders(<ProdutosPage />)

    await abrirFormularioNovo()
    fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Ração Premium' } })
    fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '90' } })
    await selecionarUnidadeVenda('kg')
    fireEvent.change(screen.getByLabelText(/marca/i), { target: { value: 'GoldPet' } })
    fireEvent.change(screen.getByLabelText(/descrição/i), { target: { value: 'Ração para cães adultos' } })
    fireEvent.change(screen.getByLabelText(/preço mínimo/i), { target: { value: '80' } })
    fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText(/estoque máximo/i), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText(/ponto de reposição/i), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

    await waitFor(() => {
      expect(cadastrarProdutoMock).toHaveBeenCalledWith({
        nome: 'Ração Premium',
        unidadeId: 'kg',
        categoriaId: null,
        unidadeCompraId: null,
        fatorConversao: null,
        marca: 'GoldPet',
        descricao: 'Ração para cães adultos',
        precoVenda: 90,
        custo: null,
        precoMinimo: 80,
        estoqueMinimo: 3,
        estoqueMaximo: 40,
        pontoReposicao: 8,
        codigoBarras: null,
        sku: null,
      })
    })
  })

  it('exibe margem, markup e a marca do produto na lista', async () => {
    listarProdutosMock.mockResolvedValue([produtoAtivo])

    renderComProviders(<ProdutosPage />)

    const item = await screen.findByText('Arroz 5kg')
    const card = item.closest('article') as HTMLElement
    expect(within(card).getByText('Tio João')).toBeInTheDocument()
    expect(within(card).getByText('Margem')).toBeInTheDocument()
    expect(within(card).getByText('30,50%')).toBeInTheDocument()
    expect(within(card).getByText('Markup')).toBeInTheDocument()
    expect(within(card).getByText('43,89%')).toBeInTheDocument()
  })

  it('omite campos secundários vazios no card, mantendo preço e status', async () => {
    listarProdutosMock.mockResolvedValue([produtoSimples])

    renderComProviders(<ProdutosPage />)

    const item = await screen.findByText('Produto Simples')
    const card = item.closest('article') as HTMLElement

    expect(within(card).getByText('Preço')).toBeInTheDocument()
    expect(within(card).getByText('R$ 5,00')).toBeInTheDocument()
    expect(within(card).getByText('Ativo')).toBeInTheDocument()

    expect(within(card).queryByText('Custo')).not.toBeInTheDocument()
    expect(within(card).queryByText('SKU')).not.toBeInTheDocument()
    expect(within(card).queryByText('Código de barras')).not.toBeInTheDocument()
    expect(within(card).queryByText('Categoria')).not.toBeInTheDocument()
    expect(within(card).queryByText('Compra')).not.toBeInTheDocument()
    expect(within(card).queryByText('Estoque mínimo')).not.toBeInTheDocument()
    expect(within(card).queryByText('Estoque máximo')).not.toBeInTheDocument()
    expect(within(card).queryByText('Ponto de reposição')).not.toBeInTheDocument()
    expect(within(card).queryByText('Preço mínimo')).not.toBeInTheDocument()
    expect(within(card).queryByText('Margem')).not.toBeInTheDocument()
    expect(within(card).queryByText('Markup')).not.toBeInTheDocument()
  })

  it('mantém os campos preenchidos visíveis no card', async () => {
    listarProdutosMock.mockResolvedValue([produtoAtivo])

    renderComProviders(<ProdutosPage />)

    const item = await screen.findByText('Arroz 5kg')
    const card = item.closest('article') as HTMLElement

    expect(within(card).getByText('Custo')).toBeInTheDocument()
    expect(within(card).getByText('SKU')).toBeInTheDocument()
    expect(within(card).getByText('SKU-ARROZ')).toBeInTheDocument()
    expect(within(card).getByText('Código de barras')).toBeInTheDocument()
    expect(within(card).getByText('Categoria')).toBeInTheDocument()
    expect(within(card).getByText('Unidade')).toBeInTheDocument()
    expect(within(card).getByText('Estoque mínimo')).toBeInTheDocument()
    expect(within(card).getByText('Estoque máximo')).toBeInTheDocument()
    expect(within(card).getByText('Ponto de reposição')).toBeInTheDocument()
    expect(within(card).getByText('Preço mínimo')).toBeInTheDocument()
  })

  it('OPERADOR vê a lista em modo leitura, sem ações de gestão', async () => {
    definirPerfil('OPERADOR')
    listarProdutosMock.mockResolvedValue([produtoAtivo])

    renderComProviders(<ProdutosPage />)

    expect(await screen.findByText('Arroz 5kg')).toBeInTheDocument()
    expect(screen.getByText(/somente administradores podem gerenciar produtos/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /novo produto/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /inativar/i })).not.toBeInTheDocument()
  })

  it('ADMIN vê as ações de gestão e o botão de novo produto', async () => {
    listarProdutosMock.mockResolvedValue([produtoAtivo])

    renderComProviders(<ProdutosPage />)

    expect(await screen.findByText('Arroz 5kg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /novo produto/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /editar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /inativar/i })).toBeInTheDocument()
    expect(screen.queryByText(/somente administradores podem gerenciar produtos/i)).not.toBeInTheDocument()
  })

  describe('unidade, categoria e conversão de compra', () => {
    it('lista mostra o caminho da categoria, a sigla da unidade e a conversão de compra', async () => {
      const produto: Produto = {
        ...produtoAtivo,
        categoria: { id: 'sache', nome: 'Sachê', caminho: 'Ração › Úmida › Sachê' },
        unidade: resumo(UN),
        unidadeCompra: resumo(CX),
        fatorConversao: 12,
        conversaoTexto: '1 CX = 12 UN',
      }
      listarProdutosMock.mockResolvedValue([produto])

      renderComProviders(<ProdutosPage />)

      const card = await cardDoProduto('Arroz 5kg')
      expect(within(card).getByText('Ração › Úmida › Sachê')).toBeInTheDocument()
      expect(within(card).getByText('UN')).toBeInTheDocument()
      expect(within(card).getByText('Compra')).toBeInTheDocument()
      expect(within(card).getByText('1 CX = 12 UN')).toBeInTheDocument()
      expect(within(card).getByText('2 UN')).toBeInTheDocument()
    })

    it('não carrega unidades nem categorias enquanto o formulário está fechado', async () => {
      listarProdutosMock.mockResolvedValue([produtoAtivo])

      renderComProviders(<ProdutosPage />)

      await screen.findByText('Arroz 5kg')
      expect(listarUnidadesMock).not.toHaveBeenCalled()
      expect(listarCategoriasMock).not.toHaveBeenCalled()
    })

    it('o select de unidade de venda oferece só as unidades ativas no cadastro', async () => {
      listarProdutosMock.mockResolvedValue([])

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      const select = screen.getByLabelText(/unidade de venda/i)
      await waitFor(() => expect(select).toBeEnabled())

      expect(rotulosDasOpcoes(select)).toEqual([
        'Selecione a unidade',
        'CX — Caixa',
        'KG — Quilograma',
        'UN — Unidade',
      ])
      expect(select).toHaveAccessibleName(/^Unidade de venda\s*\(obrigatório\)$/)
    })

    it('marca Nome, Preço de venda e Unidade de venda como obrigatórios, com texto acessível', async () => {
      listarProdutosMock.mockResolvedValue([])

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      expect(screen.getByLabelText(/^nome/i)).toHaveAccessibleName(/^Nome\s*\(obrigatório\)$/)
      expect(screen.getByLabelText(/preço de venda/i)).toHaveAccessibleName(/\(obrigatório\)$/)
      expect(screen.getByLabelText(/^marca/i)).toHaveAccessibleName('Marca (opcional)')
    })

    it('produto novo já vem com UN e o rótulo do preço acompanha a unidade', async () => {
      listarProdutosMock.mockResolvedValue([])

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      const select = screen.getByLabelText(/unidade de venda/i)
      await waitFor(() => expect(select).toHaveValue('un'))
      expect(screen.getByLabelText(/^preço de venda \(por UN\)/i)).toBeInTheDocument()

      fireEvent.change(select, { target: { value: 'kg' } })
      expect(screen.getByLabelText(/^preço de venda \(por KG\)/i)).toBeInTheDocument()

      fireEvent.change(select, { target: { value: '' } })
      expect(screen.getByLabelText(/^preço de venda\*/i)).toBeInTheDocument()
    })

    it('sem UN ativa, a unidade de venda começa vazia', async () => {
      listarProdutosMock.mockResolvedValue([])
      listarUnidadesMock.mockResolvedValue([CX, KG, unidade('un', 'UN', 'Unidade', false)])

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      const select = screen.getByLabelText(/unidade de venda/i)
      await waitFor(() => expect(select).toBeEnabled())
      expect(select).toHaveValue('')
    })

    it('na edição, mantém a unidade atual inativa como opção marcada "(inativa)" e a envia ao salvar', async () => {
      const produtoComPacote: Produto = { ...produtoAtivo, unidade: resumo(PCT_INATIVA) }
      listarProdutosMock.mockResolvedValue([produtoComPacote])
      atualizarProdutoMock.mockResolvedValue(produtoComPacote)

      renderComProviders(<ProdutosPage />)

      const card = await cardDoProduto('Arroz 5kg')
      fireEvent.click(within(card).getByRole('button', { name: /editar/i }))

      const select = screen.getByLabelText(/unidade de venda/i)
      await waitFor(() => expect(select).toBeEnabled())
      expect(rotulosDasOpcoes(select)).toEqual([
        'Selecione a unidade',
        'CX — Caixa',
        'KG — Quilograma',
        'UN — Unidade',
        'PCT — Pacote (inativa)',
      ])
      expect(select).toHaveValue('pct')

      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      await waitFor(() => {
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ unidadeId: 'pct', categoriaId: 'mercearia' }),
        )
      })
    })

    it('unidade de venda obrigatória bloqueia o envio', async () => {
      listarProdutosMock.mockResolvedValue([])

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Café 500g' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '12' } })
      // Desfaz a UN pre-selecionada.
      await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('un'))
      fireEvent.change(screen.getByLabelText(/unidade de venda/i), { target: { value: '' } })
      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      expect(await screen.findByText('Selecione a unidade de venda.')).toBeInTheDocument()
      expect(screen.getByLabelText(/unidade de venda/i)).toHaveAttribute('aria-invalid', 'true')
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('cadastra enviando unidadeId e a categoria escolhida no seletor', async () => {
      listarProdutosMock.mockResolvedValue([])
      cadastrarProdutoMock.mockResolvedValue(produtoAtivo)

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Sachê frango' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '3.5' } })
      await selecionarUnidadeVenda('un')

      const seletor = screen.getByRole('button', { name: /^categoria/i })
      await waitFor(() => expect(seletor).toBeEnabled())
      fireEvent.click(seletor)
      fireEvent.click(await screen.findByRole('option', { name: 'Ração › Sachê' }))
      expect(seletor).toHaveTextContent('Ração › Sachê')

      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      await waitFor(() => {
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(
          expect.objectContaining({ unidadeId: 'un', categoriaId: 'sache', unidadeCompraId: null, fatorConversao: null }),
        )
      })
    })

    it('cria categoria pelo atalho do seletor e a envia no cadastro', async () => {
      listarProdutosMock.mockResolvedValue([])
      cadastrarProdutoMock.mockResolvedValue(produtoAtivo)
      cadastrarCategoriaMock.mockResolvedValue(categoria('petiscos', 'Petiscos', null, 'Petiscos'))

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Bifinho' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '8' } })
      await selecionarUnidadeVenda('un')

      const seletor = screen.getByRole('button', { name: /^categoria/i })
      await waitFor(() => expect(seletor).toBeEnabled())
      fireEvent.click(seletor)
      fireEvent.change(await screen.findByRole('combobox', { name: 'Buscar categoria' }), {
        target: { value: 'Petiscos' },
      })
      fireEvent.click(screen.getByRole('button', { name: /nova categoria/i }))
      fireEvent.click(screen.getByRole('button', { name: /criar e selecionar/i }))

      await waitFor(() => expect(seletor).toHaveTextContent('Petiscos'))
      // Criar a categoria nao pode salvar o produto junto.
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()

      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      await waitFor(() => {
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(expect.objectContaining({ categoriaId: 'petiscos' }))
      })
    })

    it('unidade de compra sem fator bloqueia o envio', async () => {
      listarProdutosMock.mockResolvedValue([])

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Refrigerante' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '6' } })
      await selecionarUnidadeVenda('un')
      fireEvent.change(screen.getByLabelText(/unidade de compra/i), { target: { value: 'cx' } })
      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      expect(
        await screen.findByText('Informe a unidade de compra e o fator de conversão juntos.'),
      ).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('o fator fica oculto sem unidade de compra e é descartado ao limpar a compra', async () => {
      listarProdutosMock.mockResolvedValue([])
      cadastrarProdutoMock.mockResolvedValue(produtoAtivo)

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Refrigerante' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '6' } })
      await selecionarUnidadeVenda('un')
      expect(screen.queryByLabelText(/^quantas/i)).not.toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/unidade de compra/i), { target: { value: 'cx' } })
      expect(screen.getByLabelText('Quantas UN vêm em 1 CX?')).toBeInTheDocument()
      fireEvent.change(campoFator(), { target: { value: '12' } })

      fireEvent.change(screen.getByLabelText(/unidade de compra/i), { target: { value: '' } })
      expect(screen.queryByLabelText(/^quantas/i)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      await waitFor(() => {
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(
          expect.objectContaining({ unidadeCompraId: null, fatorConversao: null }),
        )
      })
    })

    it('fator precisa ser maior que zero', async () => {
      listarProdutosMock.mockResolvedValue([])

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Refrigerante' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '6' } })
      await selecionarUnidadeVenda('un')
      fireEvent.change(screen.getByLabelText(/unidade de compra/i), { target: { value: 'cx' } })
      fireEvent.change(campoFator(), { target: { value: '0' } })
      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      expect(await screen.findByText('O fator de conversão deve ser maior que zero.')).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('a unidade de venda não aparece como compra e trocar a venda para a da compra limpa a compra', async () => {
      listarProdutosMock.mockResolvedValue([])

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      await selecionarUnidadeVenda('un')
      const compra = screen.getByLabelText(/unidade de compra/i)
      expect(rotulosDasOpcoes(compra)).toEqual(['Mesma da venda', 'CX — Caixa', 'KG — Quilograma'])

      fireEvent.change(compra, { target: { value: 'cx' } })
      fireEvent.change(campoFator(), { target: { value: '12' } })
      await selecionarUnidadeVenda('cx')

      expect(compra).toHaveValue('')
      expect(rotulosDasOpcoes(compra)).toEqual(['Mesma da venda', 'KG — Quilograma', 'UN — Unidade'])
      expect(screen.queryByLabelText(/^quantas/i)).not.toBeInTheDocument()
    })

    it('mostra o texto de ajuda "1 CX = 12 UN" e envia a conversão de compra', async () => {
      listarProdutosMock.mockResolvedValue([])
      cadastrarProdutoMock.mockResolvedValue(produtoAtivo)

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Refrigerante lata' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '6' } })
      await selecionarUnidadeVenda('un')
      fireEvent.change(screen.getByLabelText(/unidade de compra/i), { target: { value: 'cx' } })
      fireEvent.change(campoFator(), { target: { value: '12' } })

      expect(screen.getByText('1 CX = 12 UN')).toBeInTheDocument()
      expect(campoFator()).toHaveAccessibleName('Quantas UN vêm em 1 CX?')
      expect(campoFator()).toHaveAccessibleDescription('1 CX = 12 UN')

      fireEvent.change(campoFator(), { target: { value: '1.5000' } })
      expect(screen.getByText('1 CX = 1,5 UN')).toBeInTheDocument()

      fireEvent.change(campoFator(), { target: { value: '12' } })
      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      await waitFor(() => {
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(
          expect.objectContaining({ unidadeId: 'un', unidadeCompraId: 'cx', fatorConversao: 12 }),
        )
      })
    })

    it('na edição, preenche unidade de compra e fator vindos do produto', async () => {
      const produto: Produto = {
        ...produtoAtivo,
        unidadeCompra: resumo(CX),
        fatorConversao: 12,
        conversaoTexto: '1 CX = 12 UN',
      }
      listarProdutosMock.mockResolvedValue([produto])

      renderComProviders(<ProdutosPage />)

      const card = await cardDoProduto('Arroz 5kg')
      fireEvent.click(within(card).getByRole('button', { name: /editar/i }))

      await waitFor(() => expect(screen.getByLabelText(/unidade de compra/i)).toHaveValue('cx'))
      expect(campoFator()).toHaveValue(12)
      expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('un')
      expect(screen.getByRole('button', { name: /^categoria/i })).toHaveTextContent('Mercearia')
      expect(screen.getAllByText('1 CX = 12 UN').length).toBeGreaterThan(0)
    })

    it('mostra a mensagem do backend quando a unidade escolhida está inativa (400)', async () => {
      listarProdutosMock.mockResolvedValue([])
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Esta unidade está inativa. Escolha uma unidade ativa.'),
      )

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Produto' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
      await selecionarUnidadeVenda('un')
      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      expect(
        await screen.findByText('Esta unidade está inativa. Escolha uma unidade ativa.'),
      ).toBeInTheDocument()
    })

    it('após 400 ao salvar, recarrega unidades e categorias para sair da opção obsoleta', async () => {
      listarProdutosMock.mockResolvedValue([])
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Esta unidade está inativa. Escolha uma unidade ativa.'),
      )

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Produto' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
      await selecionarUnidadeVenda('kg')
      expect(listarUnidadesMock).toHaveBeenCalledTimes(1)
      expect(listarCategoriasMock).toHaveBeenCalledTimes(1)
      // KG foi inativada por outra pessoa: a lista recarregada ja nao a oferece.
      listarUnidadesMock.mockResolvedValue([CX, { ...KG, ativo: false }, PCT_INATIVA, UN])
      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      expect(await screen.findByText('Esta unidade está inativa. Escolha uma unidade ativa.')).toBeInTheDocument()
      await waitFor(() => expect(listarUnidadesMock).toHaveBeenCalledTimes(2))
      expect(listarCategoriasMock).toHaveBeenCalledTimes(2)
      await waitFor(() =>
        expect(rotulosDasOpcoes(screen.getByLabelText(/unidade de venda/i))).not.toContain('KG — Quilograma'),
      )
    })

    it('409 sem mensagem do backend mostra texto amigável, nunca o técnico', async () => {
      listarProdutosMock.mockResolvedValue([])
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, 'Requisicao falhou (HTTP 409).'))

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      fireEvent.change(screen.getByLabelText(/^nome/i), { target: { value: 'Produto' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10' } })
      await selecionarUnidadeVenda('un')
      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      expect(
        await screen.findByText('Já existe um produto com este SKU ou código de barras nesta empresa.'),
      ).toBeInTheDocument()
      expect(screen.queryByText(/requisicao falhou/i)).not.toBeInTheDocument()
    })

    it('na edição, mantém a categoria atual inativa e a envia ao salvar', async () => {
      const brinquedos: Categoria = { ...categoria('brinq', 'Brinquedos', null, 'Brinquedos'), ativo: false, selecionavel: false }
      listarCategoriasMock.mockResolvedValue([...CATEGORIAS, brinquedos])
      const produto: Produto = { ...produtoAtivo, categoria: { id: 'brinq', nome: 'Brinquedos', caminho: 'Brinquedos' } }
      listarProdutosMock.mockResolvedValue([produto])
      atualizarProdutoMock.mockResolvedValue(produto)

      renderComProviders(<ProdutosPage />)

      fireEvent.click(within(await cardDoProduto('Arroz 5kg')).getByRole('button', { name: /editar/i }))
      const seletor = screen.getByRole('button', { name: /^categoria/i })
      await waitFor(() => expect(seletor).toHaveTextContent('Brinquedos (inativa)'))
      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      await waitFor(() => {
        expect(atualizarProdutoMock).toHaveBeenCalledWith(1, expect.objectContaining({ categoriaId: 'brinq' }))
      })
    })

    it('na edição, mantém a unidade de compra atual inativa e a envia ao salvar', async () => {
      const produto: Produto = {
        ...produtoAtivo,
        unidadeCompra: resumo(PCT_INATIVA),
        fatorConversao: 6,
        conversaoTexto: '1 PCT = 6 UN',
      }
      listarProdutosMock.mockResolvedValue([produto])
      atualizarProdutoMock.mockResolvedValue(produto)

      renderComProviders(<ProdutosPage />)

      fireEvent.click(within(await cardDoProduto('Arroz 5kg')).getByRole('button', { name: /editar/i }))
      const compra = screen.getByLabelText(/unidade de compra/i)
      await waitFor(() => expect(compra).toBeEnabled())
      expect(rotulosDasOpcoes(compra)).toEqual(['Mesma da venda', 'CX — Caixa', 'KG — Quilograma', 'PCT — Pacote (inativa)'])
      expect(compra).toHaveValue('pct')
      expect(screen.getByLabelText('Quantas UN vêm em 1 PCT?')).toHaveValue(6)
      fireEvent.click(screen.getByRole('button', { name: /salvar produto/i }))

      await waitFor(() => {
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          1,
          expect.objectContaining({ unidadeId: 'un', unidadeCompraId: 'pct', fatorConversao: 6 }),
        )
      })
    })

    it('mostra erro com nova tentativa quando as unidades não carregam', async () => {
      listarProdutosMock.mockResolvedValue([])
      listarUnidadesMock.mockRejectedValueOnce(new Error('falha')).mockResolvedValue(UNIDADES)

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()
      expect(await screen.findByText('Não foi possível carregar as unidades.')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))

      await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toBeEnabled())
      expect(screen.queryByText('Não foi possível carregar as unidades.')).not.toBeInTheDocument()
    })

    it('sem unidades ativas, orienta a cadastrar em Unidades', async () => {
      listarProdutosMock.mockResolvedValue([])
      listarUnidadesMock.mockResolvedValue([PCT_INATIVA])

      renderComProviders(<ProdutosPage />)

      await abrirFormularioNovo()

      expect(await screen.findByText('Nenhuma unidade ativa.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Cadastrar em Unidades' })).toHaveAttribute(
        'href',
        '/produtos/unidades',
      )
    })
  })
})
