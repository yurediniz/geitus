import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'

import { PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { ProdutoPage } from '@/features/products/ProdutoPage'
import { HttpError } from '@/services/httpClient'
import { useAuth } from '@/hooks/useAuth'
import {
  atualizarProduto,
  buscarProduto,
  cadastrarProduto,
  excluirProduto,
  inativarProduto,
  listarSugestoes,
  reativarProduto,
  sugerirSku,
} from '@/services/produtoService'
import { cadastrarCategoria, listarCategorias } from '@/services/categoriaService'
import { listarUnidades } from '@/services/unidadeService'
import {
  CATEGORIAS,
  CX,
  ID_ARROZ,
  KG,
  PCT_INATIVA,
  UN,
  UNIDADES,
  categoria,
  produtoAtivo,
  resumo,
  unidade,
} from '@/test/fixturesProduto'
import type { Categoria } from '@/types/catalogo'
import type { Produto, ProdutoRequest } from '@/types/produto'

vi.mock('@/services/produtoService', () => ({
  buscarProduto: vi.fn(),
  cadastrarProduto: vi.fn(),
  atualizarProduto: vi.fn(),
  inativarProduto: vi.fn(),
  reativarProduto: vi.fn(),
  excluirProduto: vi.fn(),
  sugerirSku: vi.fn(),
  listarSugestoes: vi.fn(),
}))

vi.mock('@/services/unidadeService', () => ({
  listarUnidades: vi.fn(),
}))

vi.mock('@/services/categoriaService', () => ({
  listarCategorias: vi.fn(),
  cadastrarCategoria: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const buscarProdutoMock = vi.mocked(buscarProduto)
const cadastrarProdutoMock = vi.mocked(cadastrarProduto)
const atualizarProdutoMock = vi.mocked(atualizarProduto)
const inativarProdutoMock = vi.mocked(inativarProduto)
const reativarProdutoMock = vi.mocked(reativarProduto)
const excluirProdutoMock = vi.mocked(excluirProduto)
const sugerirSkuMock = vi.mocked(sugerirSku)
const listarSugestoesMock = vi.mocked(listarSugestoes)
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

/** Lista de produtos de mentira: mostra o filtro e a mensagem recebidos. */
function SondaLista() {
  const location = useLocation()
  const estado = location.state as { sucesso?: string } | null
  return (
    <div>
      <h1>Lista de produtos{location.search}</h1>
      {estado?.sucesso && <p>{estado.sucesso}</p>}
    </div>
  )
}

const ROTAS = [
  { path: '/produtos', element: <SondaLista /> },
  { path: '/produtos/categorias', element: <h1>Página de categorias</h1> },
  { path: '/produtos/unidades', element: <h1>Página de unidades</h1> },
  { path: '/produtos/novo', element: <ProdutoPage /> },
  { path: '/produtos/:id', element: <ProdutoPage /> },
]

function novoQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function renderPagina(caminho: string, state?: unknown, queryClient: QueryClient = novoQueryClient()) {
  const router = createMemoryRouter(ROTAS, { initialEntries: [{ pathname: caminho, state }] })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function renderNovo(state?: unknown) {
  return renderPagina('/produtos/novo', state)
}

function renderEdicao(produto: Produto = produtoAtivo, state?: unknown) {
  buscarProdutoMock.mockResolvedValue(produto)
  return renderPagina(`/produtos/${produto.id}`, state)
}

// --- Acesso aos campos e abas -------------------------------------------------

function aba(nome: RegExp): HTMLElement {
  return screen.getByRole('tab', { name: nome })
}

/** Radix ativa a aba no mousedown (botao principal), como no navegador. */
function abrirAba(nome: RegExp) {
  fireEvent.mouseDown(aba(nome), { button: 0 })
}

function campoNome(): HTMLElement {
  return screen.getByRole('textbox', { name: /^Nome\s*\(obrigatório\)$/ })
}

async function esperarFormulario(): Promise<HTMLElement> {
  return screen.findByRole('textbox', { name: /^Nome\s*\(obrigatório\)$/ })
}

/** Espera as unidades carregarem e escolhe a unidade de venda. */
async function selecionarUnidadeVenda(id = 'un') {
  const select = screen.getByLabelText(/unidade de venda/i)
  await waitFor(() => expect(select).toBeEnabled())
  fireEvent.change(select, { target: { value: id } })
}

/**
 * Preenche o minimo valido (nome, unidade UN ja escolhida e preco), tudo na aba
 * Geral. O preco vai como o texto da mascara (o `change` segue os digitos).
 */
async function preencherMinimo(nome = 'Café 500g', preco = '12,50') {
  fireEvent.change(campoNome(), { target: { value: nome } })
  await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('un'))
  fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: preco } })
}

/** Campo "Adicionar código de barras" da aba Geral (cadastro rapido). */
function campoCodigoGeral(): HTMLElement {
  return screen.getByLabelText('Adicionar código de barras')
}

function botaoSalvar(): HTMLElement {
  return screen.getByRole('button', { name: /^salvar$/i })
}

/** Campo do fator: o rotulo e dinamico ("Quantas UN vêm em 1 CX?"). */
function campoFator(): HTMLElement {
  return screen.getByLabelText(/^quantas .* vêm em 1 /i)
}

function rotulosDasOpcoes(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((opcao) => opcao.textContent ?? '')
}

const REQUEST_VAZIO: ProdutoRequest = {
  nome: '',
  nomeCurto: null,
  unidadeId: 'un',
  categoriaId: null,
  unidadeCompraId: null,
  fatorConversao: null,
  marca: null,
  fornecedor: null,
  descricao: null,
  precoVenda: 0,
  custo: null,
  precoMinimo: null,
  estoqueMinimo: null,
  estoqueMaximo: null,
  pontoReposicao: null,
  codigosBarras: [],
  sku: null,
}

describe('ProdutoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
    listarUnidadesMock.mockResolvedValue(UNIDADES)
    listarCategoriasMock.mockResolvedValue(CATEGORIAS)
    listarSugestoesMock.mockResolvedValue([])
  })

  describe('estrutura e abas', () => {
    it('novo produto: cabeçalho, voltar e as quatro abas com Geral ativa', async () => {
      renderNovo()

      await esperarFormulario()
      expect(screen.getByRole('heading', { level: 1, name: 'Novo produto' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /voltar para produtos/i })).toHaveAttribute('href', '/produtos')
      const lista = screen.getByRole('tablist', { name: /seções do produto/i })
      expect(within(lista).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
        'Geral',
        'Preços',
        'Estoque',
        'Códigos',
      ])
      expect(aba(/geral/i)).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByRole('tabpanel')).toHaveAccessibleName('Geral')
    })

    it('redistribui os campos pelas abas, com os essenciais (preço e código) na Geral', async () => {
      renderNovo()
      await esperarFormulario()

      expect(screen.getByLabelText(/^nome curto/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^marca/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/^fornecedor principal/i)).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Unidade e embalagem' })).toBeInTheDocument()
      expect(screen.getByLabelText(/preço de venda/i)).toBeInTheDocument()
      expect(campoCodigoGeral()).toBeInTheDocument()
      // O status saiu da aba Geral (fica no cabecalho, so na edicao).
      expect(screen.queryByRole('heading', { name: 'Status' })).not.toBeInTheDocument()

      abrirAba(/preços/i)
      expect(screen.queryByLabelText(/preço de venda/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText(/^custo/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/preço mínimo/i)).toBeInTheDocument()

      abrirAba(/estoque/i)
      expect(screen.getByLabelText(/estoque mínimo/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/ponto de reposição/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/estoque máximo/i)).toBeInTheDocument()

      abrirAba(/códigos/i)
      expect(screen.getByLabelText(/^sku/i)).toBeInTheDocument()
      expect(screen.getByText('Nenhum código de barras cadastrado.')).toBeInTheDocument()
    })

    it('teclado: setas trocam de aba (padrão ARIA)', async () => {
      renderNovo()
      await esperarFormulario()

      aba(/geral/i).focus()
      fireEvent.keyDown(aba(/geral/i), { key: 'ArrowRight' })
      await waitFor(() => expect(aba(/preços/i)).toHaveAttribute('aria-selected', 'true'))
      expect(aba(/preços/i)).toHaveFocus()

      fireEvent.keyDown(aba(/preços/i), { key: 'ArrowLeft' })
      await waitFor(() => expect(aba(/geral/i)).toHaveAttribute('aria-selected', 'true'))
    })

    it('valores digitados sobrevivem à troca de aba', async () => {
      renderNovo()
      await esperarFormulario()

      fireEvent.change(campoNome(), { target: { value: 'Café 500g' } })
      abrirAba(/estoque/i)
      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '4' } })
      abrirAba(/geral/i)
      expect(campoNome()).toHaveValue('Café 500g')
      abrirAba(/estoque/i)
      expect(screen.getByLabelText(/estoque mínimo/i)).toHaveValue(4)
    })

    it('mostra margem e markup derivados do preço (aba Geral) e do custo', async () => {
      renderNovo()
      await esperarFormulario()
      abrirAba(/preços/i)
      expect(screen.getByText(/informe o preço de venda \(aba geral\) e o custo/i)).toBeInTheDocument()

      abrirAba(/geral/i)
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '25,90' } })
      abrirAba(/preços/i)
      fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '18,00' } })

      expect(screen.getByText('30,50%')).toBeInTheDocument()
      expect(screen.getByText('43,89%')).toBeInTheDocument()
      expect(screen.getByText('R$ 25,90')).toBeInTheDocument()
    })
  })

  describe('validação e erro por aba', () => {
    it('erro de preço (aba Geral) leva à Geral e foca o campo, mesmo salvando de outra aba', async () => {
      renderNovo()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Café' } })
      abrirAba(/estoque/i)

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(aba(/geral/i)).toHaveAttribute('aria-selected', 'true'))
      expect(aba(/geral/i)).toHaveAccessibleName('Geral (1 erro)')
      expect(aba(/preços/i)).toHaveAccessibleName('Preços')
      expect(screen.getByText('Informe o preço de venda.')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText(/preço de venda/i)).toHaveFocus())
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('com erros em várias abas, vai para a primeira e marca todas', async () => {
      renderNovo()
      await esperarFormulario()
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10,00' } })
      abrirAba(/preços/i)
      fireEvent.change(screen.getByLabelText(/preço mínimo/i), { target: { value: '15,00' } })
      abrirAba(/estoque/i)
      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '-2' } })
      abrirAba(/códigos/i)
      fireEvent.change(screen.getByLabelText(/^sku/i), { target: { value: 'A'.repeat(51) } })

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(aba(/geral/i)).toHaveAttribute('aria-selected', 'true'))
      // So o nome vazio na Geral; o preco minimo acima do de venda, em Precos.
      expect(aba(/geral/i)).toHaveAccessibleName('Geral (1 erro)')
      expect(aba(/preços/i)).toHaveAccessibleName('Preços (1 erro)')
      expect(aba(/estoque/i)).toHaveAccessibleName('Estoque (1 erro)')
      expect(aba(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(screen.getByText(/informe o nome do produto/i)).toBeInTheDocument()
      await waitFor(() => expect(campoNome()).toHaveFocus())

      abrirAba(/estoque/i)
      expect(screen.getByText(/estoque mínimo não pode ser negativo/i)).toBeInTheDocument()
      abrirAba(/códigos/i)
      expect(screen.getByText(/sku deve ter no máximo 50 caracteres/i)).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('a máscara não aceita sinal: preço e custo nunca ficam negativos', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Produto' })
      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Produto', '-1')
      expect(screen.getByLabelText(/preço de venda/i)).toHaveValue('0,01')
      abrirAba(/preços/i)
      fireEvent.keyDown(screen.getByLabelText(/^custo/i), { key: '-' })
      fireEvent.keyDown(screen.getByLabelText(/^custo/i), { key: '5' })
      expect(screen.getByLabelText(/^custo/i)).toHaveValue('0,05')

      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(expect.objectContaining({ precoVenda: 0.01, custo: 0.05 })),
      )
    })

    it('barra o submit quando o preço mínimo é maior que o preço de venda', async () => {
      renderNovo()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Produto' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10,00' } })
      abrirAba(/preços/i)
      fireEvent.change(screen.getByLabelText(/preço mínimo/i), { target: { value: '15,00' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(/preço mínimo não pode ser maior que o preço de venda/i)).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('barra o submit quando o estoque máximo é menor que o estoque mínimo', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      abrirAba(/estoque/i)
      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '20' } })
      fireEvent.change(screen.getByLabelText(/estoque máximo/i), { target: { value: '5' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(/estoque máximo não pode ser menor que o estoque mínimo/i)).toBeInTheDocument()
      expect(aba(/estoque/i)).toHaveAttribute('aria-selected', 'true')
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('marca Nome, Preço de venda e Unidade de venda como obrigatórios, com texto acessível', async () => {
      renderNovo()
      await esperarFormulario()

      expect(campoNome()).toHaveAccessibleName(/^Nome\s*\(obrigatório\)$/)
      expect(screen.getByLabelText(/unidade de venda/i)).toHaveAccessibleName(/^Unidade de venda\s*\(obrigatório\)$/)
      expect(screen.getByLabelText(/^marca/i)).toHaveAccessibleName('Marca (opcional)')
      expect(screen.getByLabelText(/preço de venda/i)).toHaveAccessibleName(/\(obrigatório\)$/)
    })
  })

  describe('salvar', () => {
    it('Salvar cadastra com o request completo e volta para a lista com a mensagem', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })

      const router = renderNovo({ voltarPara: '/produtos?busca=caf' })
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Café 500g' } })
      fireEvent.change(screen.getByLabelText(/^nome curto/i), { target: { value: 'Café' } })
      fireEvent.change(screen.getByLabelText(/^marca/i), { target: { value: 'Pilão' } })
      fireEvent.change(screen.getByLabelText(/^fornecedor principal/i), { target: { value: 'Atacadão' } })
      await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('un'))
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '12,50' } })
      abrirAba(/estoque/i)
      fireEvent.change(screen.getByLabelText(/ponto de reposição/i), { target: { value: '8' } })
      abrirAba(/códigos/i)
      fireEvent.change(screen.getByLabelText(/^sku/i), { target: { value: 'SKU-CAFE' } })

      fireEvent.click(botaoSalvar())

      await waitFor(() => {
        expect(cadastrarProdutoMock).toHaveBeenCalledWith({
          ...REQUEST_VAZIO,
          nome: 'Café 500g',
          nomeCurto: 'Café',
          marca: 'Pilão',
          fornecedor: 'Atacadão',
          precoVenda: 12.5,
          pontoReposicao: 8,
          sku: 'SKU-CAFE',
        })
      })
      expect(await screen.findByRole('heading', { name: 'Lista de produtos?busca=caf' })).toBeInTheDocument()
      expect(screen.getByText('Produto "Café 500g" cadastrado com sucesso.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/produtos')
    })

    it('"Salvar e cadastrar outro" mantém unidade, categoria, marca e fornecedor e foca o código de barras', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Sachê frango' })

      const router = renderNovo()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Sachê frango' } })
      await selecionarUnidadeVenda('kg')
      const seletor = screen.getByRole('button', { name: /^categoria/i })
      await waitFor(() => expect(seletor).toBeEnabled())
      fireEvent.click(seletor)
      fireEvent.click(await screen.findByRole('option', { name: 'Ração › Sachê' }))
      fireEvent.change(screen.getByLabelText(/^marca/i), { target: { value: 'Golden' } })
      fireEvent.change(screen.getByLabelText(/^fornecedor principal/i), { target: { value: 'PremieRpet' } })
      fireEvent.change(screen.getByLabelText(/^nome curto/i), { target: { value: 'Sachê' } })
      fireEvent.change(campoCodigoGeral(), { target: { value: '7891000315507' } })
      fireEvent.keyDown(campoCodigoGeral(), { key: 'Enter' })
      abrirAba(/preços/i)
      fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '2,00' } })
      abrirAba(/geral/i)
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '3,50' } })

      fireEvent.click(screen.getByRole('button', { name: /salvar e cadastrar outro/i }))

      await waitFor(() =>
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(
          expect.objectContaining({ nome: 'Sachê frango', unidadeId: 'kg', categoriaId: 'sache' }),
        ),
      )
      expect(await screen.findByText('Produto "Sachê frango" cadastrado com sucesso.')).toBeInTheDocument()
      // Quem usa leitor bipa o proximo produto primeiro.
      await waitFor(() => expect(campoCodigoGeral()).toHaveFocus())
      expect(aba(/geral/i)).toHaveAttribute('aria-selected', 'true')
      expect(screen.queryByRole('list', { name: /códigos de barras do produto/i })).not.toBeInTheDocument()
      expect(campoNome()).toHaveValue('')
      expect(screen.getByLabelText(/^nome curto/i)).toHaveValue('')
      expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('kg')
      expect(screen.getByRole('button', { name: /^categoria/i })).toHaveTextContent('Ração › Sachê')
      expect(screen.getByLabelText(/^marca/i)).toHaveValue('Golden')
      expect(screen.getByLabelText(/^fornecedor principal/i)).toHaveValue('PremieRpet')
      expect(screen.getByLabelText(/preço de venda/i)).toHaveValue('')
      abrirAba(/preços/i)
      expect(screen.getByLabelText(/^custo/i)).toHaveValue('')
      expect(router.state.location.pathname).toBe('/produtos/novo')

      // O formulario reaberto nao esta "alterado": sair nao pede confirmacao.
      fireEvent.click(screen.getByRole('link', { name: /voltar para produtos/i }))
      expect(await screen.findByRole('heading', { name: 'Lista de produtos' })).toBeInTheDocument()
    })

    it('"Salvar e cadastrar outro" com 409 não limpa o formulário (Review Focus 4)', async () => {
      const mensagem = 'Já existe um produto com este SKU nesta empresa.'
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, mensagem, { sku: mensagem }))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Café 500g')
      fireEvent.change(screen.getByLabelText(/^marca/i), { target: { value: 'Pilão' } })
      abrirAba(/códigos/i)
      fireEvent.change(screen.getByLabelText(/^sku/i), { target: { value: 'SKU-DUP' } })

      fireEvent.click(screen.getByRole('button', { name: /salvar e cadastrar outro/i }))

      expect(
        await screen.findByText(
          'Já existe um produto com este SKU nesta empresa. Gere outro SKU ou informe um diferente.',
        ),
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/^sku/i)).toHaveValue('SKU-DUP')
      abrirAba(/geral/i)
      expect(campoNome()).toHaveValue('Café 500g')
      expect(screen.getByLabelText(/^marca/i)).toHaveValue('Pilão')
      expect(screen.getByLabelText(/preço de venda/i)).toHaveValue('12,50')
    })

    it('"Salvar e cadastrar outro" com 400 também mantém o que foi digitado', async () => {
      cadastrarProdutoMock.mockRejectedValue(new HttpError(400, 'Dados invalidos.', { precoVenda: 'Preço de venda inválido.' }))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Café 500g')

      fireEvent.click(screen.getByRole('button', { name: /salvar e cadastrar outro/i }))

      expect(await screen.findByText('Preço de venda inválido.')).toBeInTheDocument()
      expect(campoNome()).toHaveValue('Café 500g')
    })

    it('"Salvar e cadastrar outro" só existe no cadastro', async () => {
      renderEdicao()
      await esperarFormulario()

      expect(screen.queryByRole('button', { name: /salvar e cadastrar outro/i })).not.toBeInTheDocument()
      expect(botaoSalvar()).toBeInTheDocument()
    })

    it('400 com campos: cada mensagem vai para o seu campo, com o indicador de cada aba (FE I3)', async () => {
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { precoVenda: 'Preço de venda inválido.', sku: 'SKU inválido.' }),
      )

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(
        await screen.findByText('O produto não foi salvo. Confira os erros nas abas Geral e Códigos.'),
      ).toBeInTheDocument()
      expect(aba(/geral/i)).toHaveAttribute('aria-selected', 'true')
      expect(aba(/geral/i)).toHaveAccessibleName('Geral (1 erro)')
      expect(aba(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(screen.getByLabelText(/preço de venda/i)).toHaveAccessibleDescription('Preço de venda inválido.')
      await waitFor(() => expect(screen.getByLabelText(/preço de venda/i)).toHaveFocus())
      abrirAba(/códigos/i)
      // 400 de SKU nao e duplicidade: sem a orientacao de gerar outro.
      expect(screen.getByLabelText(/^sku/i)).toHaveAccessibleDescription(/SKU inválido\.$/)
    })

    it('400 com campo que não é do formulário junta a mensagem ao resumo do topo', async () => {
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { empresaId: 'Empresa inválida.', nome: 'Nome inválido.' }),
      )

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(
        await screen.findByText('Empresa inválida. O produto não foi salvo. Confira o erro na aba Geral.'),
      ).toBeInTheDocument()
      expect(campoNome()).toHaveAccessibleDescription('Nome inválido.')
    })

    it('400 só com campos desconhecidos continua só no topo', async () => {
      cadastrarProdutoMock.mockRejectedValue(new HttpError(400, 'Dados invalidos.', { empresaId: 'Empresa inválida.' }))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Empresa inválida.')).toBeInTheDocument()
      expect(aba(/geral/i)).toHaveAccessibleName('Geral')
    })

    it('409 sem mensagem do backend mostra texto amigável, nunca o técnico', async () => {
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, 'Requisicao falhou (HTTP 409).'))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(
        await screen.findByText('Já existe um produto com este SKU ou código de barras nesta empresa.'),
      ).toBeInTheDocument()
      expect(screen.queryByText(/requisicao falhou/i)).not.toBeInTheDocument()
    })

    it('dois cliques seguidos em Salvar cadastram uma vez só', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()

      fireEvent.click(botaoSalvar())
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Produto "Café 500g" cadastrado com sucesso.')).toBeInTheDocument()
      expect(cadastrarProdutoMock).toHaveBeenCalledTimes(1)
    })

    it('dois cliques seguidos em "Salvar e cadastrar outro" cadastram uma vez só', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      const botao = screen.getByRole('button', { name: /salvar e cadastrar outro/i })

      fireEvent.click(botao)
      fireEvent.click(botao)

      expect(await screen.findByText('Produto "Café 500g" cadastrado com sucesso.')).toBeInTheDocument()
      expect(cadastrarProdutoMock).toHaveBeenCalledTimes(1)
    })

    it('Ctrl+Enter duas vezes seguidas cadastra uma vez só', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      const preco = screen.getByLabelText(/preço de venda/i)

      fireEvent.keyDown(preco, { key: 'Enter', ctrlKey: true })
      fireEvent.keyDown(preco, { key: 'Enter', ctrlKey: true })

      expect(await screen.findByText('Produto "Café 500g" cadastrado com sucesso.')).toBeInTheDocument()
      expect(cadastrarProdutoMock).toHaveBeenCalledTimes(1)
    })

    it('depois de um erro de validação, um novo clique volta a enviar', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })

      renderNovo()
      await esperarFormulario()
      fireEvent.click(botaoSalvar())
      expect(await screen.findByText(/informe o nome do produto/i)).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()

      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(cadastrarProdutoMock).toHaveBeenCalledTimes(1))
    })

    it('depois de uma falha ao salvar, um novo clique volta a enviar', async () => {
      cadastrarProdutoMock
        .mockRejectedValueOnce(new Error('falha de rede'))
        .mockResolvedValueOnce({ ...produtoAtivo, nome: 'Café 500g' })

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())
      expect(await screen.findByText(/não foi possível salvar o produto/i)).toBeInTheDocument()

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Produto "Café 500g" cadastrado com sucesso.')).toBeInTheDocument()
      expect(cadastrarProdutoMock).toHaveBeenCalledTimes(2)
    })

    it('mostra erro genérico ao salvar (rede) e continua na página', async () => {
      cadastrarProdutoMock.mockRejectedValue(new Error('falha ao salvar'))

      const router = renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(/não foi possível salvar o produto/i)).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/produtos/novo')
    })
  })

  describe('edição', () => {
    it('carrega o produto pelo UUID e preenche as abas', async () => {
      renderEdicao({ ...produtoAtivo, nomeCurto: 'Arroz TJ' })

      expect(await screen.findByRole('heading', { level: 1, name: 'Arroz 5kg' })).toBeInTheDocument()
      expect(buscarProdutoMock).toHaveBeenCalledWith(ID_ARROZ)
      expect(screen.getAllByText('Ativo').length).toBeGreaterThan(0)
      expect(campoNome()).toHaveValue('Arroz 5kg')
      expect(screen.getByLabelText(/^nome curto/i)).toHaveValue('Arroz TJ')
      expect(screen.getByLabelText(/^fornecedor principal/i)).toHaveValue('Distribuidora Sul')
      expect(screen.getByLabelText(/preço de venda/i)).toHaveValue('25,90')
      // A mesma lista de codigos aparece em etiquetas na Geral.
      expect(
        within(screen.getByRole('list', { name: /códigos de barras do produto/i })).getByText('7891000315507'),
      ).toBeInTheDocument()
      abrirAba(/códigos/i)
      expect(screen.getByLabelText(/^sku/i)).toHaveValue('SKU-ARROZ')
      expect(screen.getByText('7891000315507')).toBeInTheDocument()
    })

    it('Salvar atualiza pelo UUID mantendo os códigos de barras e volta para a lista', async () => {
      const produto: Produto = {
        ...produtoAtivo,
        codigosBarras: [
          { codigo: '7891000315508', formato: 'OUTRO' },
          { codigo: '96385074', formato: 'EAN8' },
        ],
      }
      atualizarProdutoMock.mockResolvedValue({ ...produto, nome: 'Arroz Tipo 1' })

      const router = renderEdicao(produto, { voltarPara: '/produtos?status=ativos' })
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Arroz Tipo 1' } })
      fireEvent.click(botaoSalvar())

      await waitFor(() => {
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          ID_ARROZ,
          expect.objectContaining({ nome: 'Arroz Tipo 1', codigosBarras: ['7891000315508', '96385074'] }),
        )
      })
      expect(await screen.findByRole('heading', { name: 'Lista de produtos?status=ativos' })).toBeInTheDocument()
      expect(screen.getByText('Produto "Arroz Tipo 1" atualizado com sucesso.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      // replace: o Voltar do navegador nao reabre o formulario ja salvo.
      expect(router.state.historyAction).toBe('REPLACE')
    })

    it('mostra erro ao salvar a edição', async () => {
      atualizarProdutoMock.mockRejectedValue(new Error('falha ao atualizar'))

      renderEdicao()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Arroz Tipo 1' } })
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(/não foi possível salvar o produto/i)).toBeInTheDocument()
    })

    it('produto inexistente mostra aviso e o caminho de volta', async () => {
      buscarProdutoMock.mockRejectedValue(new HttpError(404, 'Requisicao falhou (HTTP 404).'))

      renderPagina('/produtos/9d5e1c2a-0000-4000-8000-000000000000')

      expect(await screen.findByText('Este produto não existe ou foi excluído.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /voltar para produtos/i })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /tentar novamente/i })).not.toBeInTheDocument()
    })

    it('falha ao carregar o produto oferece nova tentativa', async () => {
      buscarProdutoMock.mockRejectedValueOnce(new Error('rede')).mockResolvedValue(produtoAtivo)

      renderPagina(`/produtos/${ID_ARROZ}`)

      expect(await screen.findByText('Não foi possível carregar o produto.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))
      expect(await screen.findByRole('heading', { level: 1, name: 'Arroz 5kg' })).toBeInTheDocument()
    })

    it('refetch que falha depois de abrir não derruba o formulário (FE I1)', async () => {
      excluirProdutoMock.mockRejectedValue(new HttpError(409, 'Este produto já teve movimentação.'))
      buscarProdutoMock.mockResolvedValueOnce(produtoAtivo).mockRejectedValue(new Error('rede'))

      renderPagina(`/produtos/${ID_ARROZ}`)
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Arroz alterado' } })
      fireEvent.click(screen.getByRole('button', { name: /^excluir$/i }))
      const dialogo = await screen.findByRole('dialog')
      fireEvent.click(within(dialogo).getByRole('button', { name: /^excluir$/i }))

      // O 409 recarrega o produto; a recarga falha.
      await waitFor(() => expect(buscarProdutoMock).toHaveBeenCalledTimes(2))
      fireEvent.click(within(dialogo).getByRole('button', { name: /cancelar/i }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      expect(screen.queryByText('Não foi possível carregar o produto.')).not.toBeInTheDocument()
      expect(campoNome()).toHaveValue('Arroz alterado')
    })

    it('com versão antiga no cache, só monta o formulário depois de buscar de novo (FE I2)', async () => {
      const queryClient = novoQueryClient()
      queryClient.setQueryData([...PRODUTOS_QUERY_KEY, 'detalhe', ID_ARROZ], { ...produtoAtivo, nome: 'Arroz antigo' })
      let responder: (produto: Produto) => void = () => undefined
      buscarProdutoMock.mockReturnValue(
        new Promise<Produto>((resolver) => {
          responder = resolver
        }),
      )

      renderPagina(`/produtos/${ID_ARROZ}`, undefined, queryClient)

      expect(await screen.findByText('Carregando produto...')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: /^Nome\s*\(obrigatório\)$/ })).not.toBeInTheDocument()

      await act(async () => responder(produtoAtivo))

      expect(await esperarFormulario()).toHaveValue('Arroz 5kg')
      expect(screen.queryByDisplayValue('Arroz antigo')).not.toBeInTheDocument()
    })

    it('título longo quebra em até duas linhas, sem truncar numa linha (FE S11)', async () => {
      const nome = 'Ração Golden Fórmula Cães Adultos Raças Médias e Grandes Frango e Arroz 15kg'
      renderEdicao({ ...produtoAtivo, nome })

      const titulo = await screen.findByRole('heading', { level: 1, name: nome })
      expect(titulo).toHaveClass('line-clamp-2', 'break-words')
      expect(titulo).not.toHaveClass('truncate')
      expect(titulo).toHaveAttribute('title', nome)
    })

    it('inativa pelo cabeçalho sem perder o que está sendo editado', async () => {
      inativarProdutoMock.mockResolvedValue({ ...produtoAtivo, ativo: false })

      renderEdicao()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Arroz Tipo 1' } })
      const cabecalho = screen.getByRole('banner')
      fireEvent.click(within(cabecalho).getByRole('button', { name: /^inativar$/i }))

      await waitFor(() => expect(inativarProdutoMock).toHaveBeenCalledWith(ID_ARROZ))
      expect(await screen.findByText('Produto inativado com sucesso.')).toBeInTheDocument()
      expect(within(cabecalho).getByRole('button', { name: /^reativar$/i })).toBeInTheDocument()
      expect(within(cabecalho).getByText('Inativo')).toBeInTheDocument()
      expect(campoNome()).toHaveValue('Arroz Tipo 1')
    })

    it('reativa produto inativo pelo cabeçalho', async () => {
      reativarProdutoMock.mockResolvedValue(produtoAtivo)

      renderEdicao({ ...produtoAtivo, ativo: false })
      await esperarFormulario()
      const cabecalho = screen.getByRole('banner')
      expect(within(cabecalho).getByText('Produto inativo não aparece para venda no PDV.')).toBeInTheDocument()
      fireEvent.click(within(cabecalho).getByRole('button', { name: /^reativar$/i }))

      expect(await screen.findByText('Produto reativado com sucesso.')).toBeInTheDocument()
    })
  })

  describe('alterações não salvas (Review Focus 5)', () => {
    it('pede confirmação ao sair com alteração; "Continuar editando" fica e "Descartar" sai', async () => {
      const router = renderEdicao()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Arroz Tipo 1' } })

      fireEvent.click(screen.getByRole('link', { name: /voltar para produtos/i }))

      const dialogo = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
      fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar editando' }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(router.state.location.pathname).toBe(`/produtos/${ID_ARROZ}`)
      expect(campoNome()).toHaveValue('Arroz Tipo 1')

      fireEvent.click(screen.getByRole('link', { name: /voltar para produtos/i }))
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Descartar' }))

      expect(await screen.findByRole('heading', { name: 'Lista de produtos' })).toBeInTheDocument()
      expect(atualizarProdutoMock).not.toHaveBeenCalled()
    })

    it('também protege a saída pelas abas do catálogo', async () => {
      renderNovo()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Café' } })

      const nav = screen.getByRole('navigation', { name: /catálogo/i })
      fireEvent.click(within(nav).getByRole('link', { name: 'Categorias' }))

      expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument()
    })

    it('trocar de aba dentro da página não dispara o aviso', async () => {
      const router = renderNovo()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Café' } })

      abrirAba(/preços/i)
      abrirAba(/códigos/i)

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/produtos/novo')
    })

    it('sem alteração não pede confirmação (nem com a UN pré-selecionada)', async () => {
      renderNovo()
      await esperarFormulario()
      await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('un'))

      fireEvent.click(screen.getByRole('link', { name: /voltar para produtos/i }))

      expect(await screen.findByRole('heading', { name: 'Lista de produtos' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('edição aberta sem mudanças sai direto', async () => {
      renderEdicao()
      await esperarFormulario()
      await waitFor(() => expect(screen.getByRole('button', { name: /^categoria/i })).toBeEnabled())

      fireEvent.click(screen.getByRole('link', { name: /voltar para produtos/i }))

      expect(await screen.findByRole('heading', { name: 'Lista de produtos' })).toBeInTheDocument()
    })

    it('desfazer a alteração tira o aviso', async () => {
      renderEdicao()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Arroz Tipo 1' } })
      fireEvent.change(campoNome(), { target: { value: 'Arroz 5kg' } })

      fireEvent.click(screen.getByRole('link', { name: /voltar para produtos/i }))

      expect(await screen.findByRole('heading', { name: 'Lista de produtos' })).toBeInTheDocument()
    })

    it('fechar/recarregar a aba usa o aviso nativo só com alteração', async () => {
      renderNovo()
      await esperarFormulario()

      const semAlteracao = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(semAlteracao)
      expect(semAlteracao.defaultPrevented).toBe(false)

      fireEvent.change(campoNome(), { target: { value: 'Café' } })
      const comAlteracao = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(comAlteracao)
      expect(comAlteracao.defaultPrevented).toBe(true)
    })
  })

  describe('códigos de barras', () => {
    /** Le um codigo como o leitor: digita e tecla Enter no campo "Adicionar código". */
    function lerCodigo(codigo: string) {
      const campo = screen.getByLabelText('Adicionar código')
      fireEvent.change(campo, { target: { value: codigo } })
      fireEvent.keyDown(campo, { key: 'Enter' })
    }

    it('Enter no campo de código adiciona e não envia o formulário (Review Focus 2)', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      abrirAba(/códigos/i)

      lerCodigo(' 7891000315507\n')

      expect(screen.getByText('7891000315507')).toBeInTheDocument()
      expect(screen.getByText('EAN-13')).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
      expect(screen.getByRole('textbox', { name: 'Adicionar código' })).toHaveValue('')
    })

    it('envia os códigos normalizados na ordem e reordenar envia a nova ordem', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      abrirAba(/códigos/i)
      lerCodigo('7891000315507')
      lerCodigo('9638 5074')
      lerCodigo('ABC-1')
      expect(screen.getByText(/formato não reconhecido/i)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Mover código ABC-1 para cima' }))
      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(cadastrarProdutoMock).toHaveBeenCalledTimes(1))
      expect(cadastrarProdutoMock.mock.calls[0][0].codigosBarras).toEqual(['7891000315507', 'ABC-1', '96385074'])
    })

    it('dígito inválido é bloqueado, mas o código gravado como OUTRO é mantido e salvo (Review Focus 1)', async () => {
      const produto: Produto = {
        ...produtoAtivo,
        codigosBarras: [{ codigo: '7891000315508', formato: 'OUTRO' }],
      }
      atualizarProdutoMock.mockResolvedValue(produto)

      renderEdicao(produto)
      await esperarFormulario()
      abrirAba(/códigos/i)
      expect(screen.getByText('Outro formato')).toBeInTheDocument()

      lerCodigo('96385075')
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Este código não confere (o último dígito não bate). Leia de novo ou confira os números.',
      )

      // Remover e reler o codigo ja gravado nao o bloqueia.
      fireEvent.click(screen.getByRole('button', { name: 'Remover código 7891000315508' }))
      lerCodigo('7891000315508')
      lerCodigo('96385074')
      fireEvent.click(botaoSalvar())

      await waitFor(() => {
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          ID_ARROZ,
          expect.objectContaining({ codigosBarras: ['7891000315508', '96385074'] }),
        )
      })
    })

    it('409 de código em outro produto (com campos) aparece no campo da aba Geral, com indicador', async () => {
      const mensagem = 'O código de barras 7891000315507 já está cadastrado no produto "Feijão 1kg".'
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, mensagem, { codigosBarras: mensagem }))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      abrirAba(/códigos/i)
      lerCodigo('7891000315507')
      abrirAba(/geral/i)
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('O produto não foi salvo. Confira o erro na aba Geral.')).toBeInTheDocument()
      expect(aba(/geral/i)).toHaveAttribute('aria-selected', 'true')
      expect(aba(/geral/i)).toHaveAccessibleName('Geral (1 erro)')
      expect(aba(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(screen.getByText(mensagem)).toBeInTheDocument()
      await waitFor(() => expect(campoCodigoGeral()).toHaveFocus())
      // Nada perdido: o codigo continua na lista.
      expect(screen.getByText('7891000315507')).toBeInTheDocument()

      // Remover o codigo citado tira o resumo do topo (S2).
      fireEvent.click(screen.getByRole('button', { name: 'Remover código 7891000315507' }))
      await waitFor(() =>
        expect(screen.queryByText('O produto não foi salvo. Confira o erro na aba Geral.')).not.toBeInTheDocument(),
      )
    })

    it('400 de dígito inválido (campos.codigosBarras) vai para o campo de códigos', async () => {
      const mensagem = 'Código de barras 7891000315508 com dígito verificador inválido. Confira a leitura.'
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Um ou mais campos sao invalidos.', { codigosBarras: mensagem }),
      )

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      abrirAba(/códigos/i)
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(mensagem)).toBeInTheDocument()
      // Salvando da aba Codigos, que tambem mostra o campo: fica nela.
      expect(aba(/códigos/i)).toHaveAttribute('aria-selected', 'true')
      expect(aba(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
    })

    it('400 com índice (codigosBarras[0], limite de 50 caracteres) vai para o campo de códigos', async () => {
      const mensagem = 'Código de barras deve ter no máximo 50 caracteres.'
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Um ou mais campos sao invalidos.', { 'codigosBarras[0]': mensagem }),
      )

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(mensagem)).toBeInTheDocument()
      expect(aba(/geral/i)).toHaveAttribute('aria-selected', 'true')
      expect(aba(/geral/i)).toHaveAccessibleName('Geral (1 erro)')
      expect(aba(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
    })

    it('409 com campos (sku) marca o SKU pela chave, não pelo texto', async () => {
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(409, 'Conflito ao salvar.', { sku: 'Este SKU já é usado por outro produto.' }),
      )

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('O produto não foi salvo. Confira o erro na aba Códigos.')).toBeInTheDocument()
      expect(aba(/códigos/i)).toHaveAttribute('aria-selected', 'true')
      expect(
        screen.getByText('Este SKU já é usado por outro produto. Gere outro SKU ou informe um diferente.'),
      ).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText(/^sku/i)).toHaveFocus())
    })

    it('409 com campos (codigosBarras) de produto chamado "Etiqueta SKU 100" marca o campo de códigos', async () => {
      const mensagem = 'O código de barras 7891000315507 já está cadastrado no produto "Etiqueta SKU 100".'
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, mensagem, { codigosBarras: mensagem }))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(campoCodigoGeral(), { target: { value: '7891000315507' } })
      fireEvent.keyDown(campoCodigoGeral(), { key: 'Enter' })
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(mensagem)).toBeInTheDocument()
      expect(aba(/geral/i)).toHaveAccessibleName('Geral (1 erro)')
      expect(aba(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(screen.queryByText(/gere outro sku/i)).not.toBeInTheDocument()
    })

    it('fallback pelo texto (sem campos): "Etiqueta SKU 100" no nome não confunde com SKU (FE S1)', async () => {
      const mensagem = 'O código de barras 7891000315507 já está cadastrado no produto "Etiqueta SKU 100".'
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, mensagem))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(mensagem)).toBeInTheDocument()
      expect(aba(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      abrirAba(/códigos/i)
      expect(screen.getByLabelText(/^sku/i)).not.toHaveAttribute('aria-invalid')
      expect(screen.queryByText(/gere outro sku/i)).not.toBeInTheDocument()
    })

    it('400 de limite de códigos marca o campo na Geral (fica nela) e o indicador da aba Códigos', async () => {
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Um ou mais campos sao invalidos.', { codigosBarras: 'Informe no máximo 20 códigos de barras.' }),
      )

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Informe no máximo 20 códigos de barras.')).toBeInTheDocument()
      expect(aba(/geral/i)).toHaveAttribute('aria-selected', 'true')
      expect(aba(/geral/i)).toHaveAccessibleName('Geral (1 erro)')
      expect(aba(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
    })
  })

  describe('SKU sugerido', () => {
    it('"Gerar automaticamente" preenche o SKU, que continua editável', async () => {
      sugerirSkuMock.mockResolvedValue('P000031')

      renderNovo()
      await esperarFormulario()
      abrirAba(/códigos/i)
      fireEvent.click(screen.getByRole('button', { name: /gerar automaticamente/i }))

      await waitFor(() => expect(screen.getByLabelText(/^sku/i)).toHaveValue('P000031'))
      expect(screen.getByLabelText(/^sku/i)).toBeEnabled()
      expect(screen.getByText(/SKU P000031 gerado/)).toBeInTheDocument()
    })

    it('falha ao gerar mostra mensagem amigável', async () => {
      sugerirSkuMock.mockRejectedValue(new HttpError(500, 'Requisicao falhou (HTTP 500).'))

      renderNovo()
      await esperarFormulario()
      abrirAba(/códigos/i)
      fireEvent.click(screen.getByRole('button', { name: /gerar automaticamente/i }))

      // role="alert": a falha e anunciada.
      expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível gerar o SKU. Tente novamente.')
      expect(screen.queryByText(/requisicao falhou/i)).not.toBeInTheDocument()
    })
  })

  describe('marca, fornecedor e nome curto', () => {
    it('marca sugere os valores já usados e envia a escolhida', async () => {
      listarSugestoesMock.mockImplementation(async (campo) => (campo === 'marca' ? ['Golden', 'Premier'] : ['Distribuidora Sul']))
      cadastrarProdutoMock.mockResolvedValue(produtoAtivo)

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      const marca = screen.getByRole('combobox', { name: /^marca/i })
      fireEvent.focus(marca)
      fireEvent.mouseDown(await screen.findByRole('option', { name: 'Golden' }))
      const fornecedor = screen.getByRole('combobox', { name: /^fornecedor principal/i })
      fireEvent.change(fornecedor, { target: { value: 'Fornecedor Novo' } })
      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(cadastrarProdutoMock).toHaveBeenCalledTimes(1))
      expect(cadastrarProdutoMock.mock.calls[0][0]).toMatchObject({ marca: 'Golden', fornecedor: 'Fornecedor Novo' })
      expect(listarSugestoesMock).toHaveBeenCalledWith('marca', '')
    })

    it('nome curto mostra o contador e a prévia do cupom com a regra do backend', async () => {
      renderNovo()
      await esperarFormulario()

      const nomeCurto = screen.getByLabelText(/^nome curto/i)
      expect(nomeCurto).toHaveAccessibleDescription(/usado no cupom.*0 de 30 caracteres/i)

      fireEvent.change(campoNome(), { target: { value: 'Ração Golden Adulto Frango e Arroz 15kg' } })
      expect(nomeCurto).toHaveAccessibleDescription(/No cupom: Ração Golden Adulto Frango e A\s*0 de 30 caracteres/)

      fireEvent.change(nomeCurto, { target: { value: 'Golden Frango 15kg' } })
      expect(nomeCurto).toHaveAccessibleDescription(/No cupom: Golden Frango 15kg\s*18 de 30 caracteres/)
      expect(screen.getByText('18/30')).toBeInTheDocument()
    })
  })

  describe('excluir', () => {
    function botaoExcluir(): HTMLElement {
      return screen.getByRole('button', { name: /^excluir$/i })
    }

    it('confirma pelo diálogo, exclui e volta para a lista com "Produto excluído."', async () => {
      excluirProdutoMock.mockResolvedValue(undefined)

      renderEdicao(produtoAtivo, { voltarPara: '/produtos?busca=arroz' })
      await esperarFormulario()
      // Com alteracao em andamento: excluir nao pede "Descartar alterações?".
      fireEvent.change(campoNome(), { target: { value: 'Arroz alterado' } })
      fireEvent.click(botaoExcluir())

      const dialogo = await screen.findByRole('dialog', { name: 'Excluir Arroz 5kg?' })
      expect(dialogo).toHaveTextContent(
        'Esta ação não pode ser desfeita. Os códigos de barras do produto também serão excluídos.',
      )
      fireEvent.click(within(dialogo).getByRole('button', { name: /^excluir$/i }))

      expect(await screen.findByRole('heading', { name: 'Lista de produtos?busca=arroz' })).toBeInTheDocument()
      expect(excluirProdutoMock).toHaveBeenCalledWith(ID_ARROZ)
      expect(screen.getByText('Produto excluído.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('o diálogo sugere inativar e oferece "Inativar" antes de tentar excluir', async () => {
      inativarProdutoMock.mockResolvedValue({ ...produtoAtivo, ativo: false })

      renderEdicao()
      await esperarFormulario()
      fireEvent.click(botaoExcluir())

      const dialogo = await screen.findByRole('dialog', { name: 'Excluir Arroz 5kg?' })
      expect(dialogo).toHaveTextContent('Se quiser apenas tirar o produto da venda, inative-o; dá para reativar depois.')
      expect(within(dialogo).getByRole('button', { name: /^excluir$/i })).toBeInTheDocument()
      fireEvent.click(within(dialogo).getByRole('button', { name: /^inativar$/i }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(inativarProdutoMock).toHaveBeenCalledWith(ID_ARROZ)
      expect(excluirProdutoMock).not.toHaveBeenCalled()
      expect(await screen.findByText('Produto inativado com sucesso.')).toBeInTheDocument()
    })

    it('produto já inativo: o diálogo não sugere inativar', async () => {
      renderEdicao({ ...produtoAtivo, ativo: false })
      await esperarFormulario()
      fireEvent.click(botaoExcluir())

      const dialogo = await screen.findByRole('dialog')
      expect(dialogo).not.toHaveTextContent(/inative-o/)
      expect(within(dialogo).queryByRole('button', { name: /^inativar$/i })).not.toBeInTheDocument()
    })

    it('cancelar fecha o diálogo e devolve o foco ao botão Excluir', async () => {
      renderEdicao()
      await esperarFormulario()
      botaoExcluir().focus()
      fireEvent.click(botaoExcluir())

      const dialogo = await screen.findByRole('dialog')
      fireEvent.click(within(dialogo).getByRole('button', { name: /cancelar/i }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(botaoExcluir()).toHaveFocus())
      expect(excluirProdutoMock).not.toHaveBeenCalled()
    })

    it('409 mostra a mensagem do backend no diálogo e oferece Inativar', async () => {
      const mensagem =
        'Este produto já teve movimentação e não pode ser excluído. Inative-o para que não apareça na venda.'
      excluirProdutoMock.mockRejectedValue(new HttpError(409, mensagem))
      inativarProdutoMock.mockResolvedValue({ ...produtoAtivo, ativo: false })

      renderEdicao()
      await esperarFormulario()
      fireEvent.click(botaoExcluir())
      const dialogo = await screen.findByRole('dialog')
      fireEvent.click(within(dialogo).getByRole('button', { name: /^excluir$/i }))

      expect(await within(dialogo).findByText(mensagem)).toBeInTheDocument()
      expect(within(dialogo).queryByRole('button', { name: /^excluir$/i })).not.toBeInTheDocument()

      fireEvent.click(within(dialogo).getByRole('button', { name: /inativar/i }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(inativarProdutoMock).toHaveBeenCalledWith(ID_ARROZ)
      expect(await screen.findByText('Produto inativado com sucesso.')).toBeInTheDocument()
    })

    it('409 com o produto recarregado sem podeExcluir: fechar devolve o foco ao título (Excluir sumiu)', async () => {
      excluirProdutoMock.mockRejectedValue(
        new HttpError(409, 'Este produto já teve movimentação e não pode ser excluído.'),
      )
      buscarProdutoMock.mockResolvedValueOnce(produtoAtivo).mockResolvedValue({ ...produtoAtivo, podeExcluir: false })

      renderPagina(`/produtos/${ID_ARROZ}`)
      await esperarFormulario()
      botaoExcluir().focus()
      fireEvent.click(botaoExcluir())
      const dialogo = await screen.findByRole('dialog')
      fireEvent.click(within(dialogo).getByRole('button', { name: /^excluir$/i }))

      expect(await within(dialogo).findByText(/não pode ser excluído/)).toBeInTheDocument()
      // O refetch trouxe podeExcluir:false: o Excluir do cabecalho sai.
      await waitFor(() => expect(buscarProdutoMock).toHaveBeenCalledTimes(2))
      await waitFor(() =>
        expect(within(screen.getByRole('banner', { hidden: true })).queryByRole('button', { name: /^excluir$/i, hidden: true })).not.toBeInTheDocument(),
      )

      fireEvent.click(within(dialogo).getByRole('button', { name: /cancelar/i }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'Arroz 5kg' })).toHaveFocus())
    })

    it('excluir substitui a entrada do histórico (o Voltar não reabre o produto excluído)', async () => {
      excluirProdutoMock.mockResolvedValue(undefined)

      const router = renderEdicao()
      await esperarFormulario()
      fireEvent.click(botaoExcluir())
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^excluir$/i }))

      expect(await screen.findByRole('heading', { name: 'Lista de produtos' })).toBeInTheDocument()
      expect(router.state.historyAction).toBe('REPLACE')
    })

    it('sem podeExcluir ou no cadastro novo, não há botão Excluir', async () => {
      renderEdicao({ ...produtoAtivo, podeExcluir: false })
      await esperarFormulario()
      expect(screen.queryByRole('button', { name: /^excluir$/i })).not.toBeInTheDocument()
    })

    it('cadastro novo não tem Excluir', async () => {
      renderNovo()
      await esperarFormulario()
      expect(screen.queryByRole('button', { name: /^excluir$/i })).not.toBeInTheDocument()
    })
  })

  describe('cadastro rápido e fluxo de cadastro em sequência', () => {
    it('código lido na aba Geral entra na mesma lista da aba Códigos (e volta)', async () => {
      renderNovo()
      await esperarFormulario()

      fireEvent.change(campoCodigoGeral(), { target: { value: '7891000315507' } })
      fireEvent.keyDown(campoCodigoGeral(), { key: 'Enter' })
      expect(within(screen.getByRole('list', { name: /códigos de barras do produto/i })).getByText('7891000315507')).toBeInTheDocument()

      abrirAba(/códigos/i)
      const lista = screen.getByRole('list', { name: /códigos de barras do produto/i })
      expect(within(lista).getByText('7891000315507')).toBeInTheDocument()
      expect(within(lista).getByText('EAN-13')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText('Adicionar código'), { target: { value: '96385074' } })
      fireEvent.keyDown(screen.getByLabelText('Adicionar código'), { key: 'Enter' })

      abrirAba(/geral/i)
      const etiquetas = within(screen.getByRole('list', { name: /códigos de barras do produto/i })).getAllByRole('listitem')
      expect(etiquetas.map((item) => item.textContent)).toEqual(['7891000315507', '96385074'])
    })

    it('texto digitado e não adicionado sobrevive à troca de aba e conta como alteração', async () => {
      renderNovo()
      await esperarFormulario()

      fireEvent.change(campoCodigoGeral(), { target: { value: '789100031' } })
      abrirAba(/códigos/i)
      expect(screen.getByLabelText('Adicionar código')).toHaveValue('789100031')
      abrirAba(/geral/i)
      expect(campoCodigoGeral()).toHaveValue('789100031')

      fireEvent.click(screen.getByRole('link', { name: /voltar para produtos/i }))
      expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument()
    })

    it('ao salvar, o código pendente válido entra na lista e no request', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(campoCodigoGeral(), { target: { value: ' 7891000315507 ' } })

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(cadastrarProdutoMock).toHaveBeenCalledTimes(1))
      expect(cadastrarProdutoMock.mock.calls[0][0].codigosBarras).toEqual(['7891000315507'])
      expect(cadastrarProdutoMock.mock.calls[0][0]).not.toHaveProperty('codigoPendente')
    })

    it('código pendente barrado não salva: mostra o erro no campo da Geral e o foca', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(campoCodigoGeral(), { target: { value: '7891000315508' } })
      abrirAba(/estoque/i)

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(aba(/geral/i)).toHaveAttribute('aria-selected', 'true'))
      expect(
        screen.getByText('Este código não confere (o último dígito não bate). Leia de novo ou confira os números.'),
      ).toBeInTheDocument()
      expect(screen.getByText('O produto não foi salvo. Confira o erro na aba Geral.')).toBeInTheDocument()
      expect(aba(/geral/i)).toHaveAccessibleName('Geral (1 erro)')
      await waitFor(() => expect(campoCodigoGeral()).toHaveFocus())
      expect(campoCodigoGeral()).toHaveValue('7891000315508')
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()

      // Corrigir o texto tira o erro e o resumo do topo.
      fireEvent.change(campoCodigoGeral(), { target: { value: '7891000315507' } })
      await waitFor(() =>
        expect(screen.queryByText('O produto não foi salvo. Confira o erro na aba Geral.')).not.toBeInTheDocument(),
      )
      expect(screen.queryByText(/este código não confere/i)).not.toBeInTheDocument()
    })

    it('com 20 códigos na lista, o pendente ao salvar é barrado pelo limite e nada é enviado', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      for (let indice = 1; indice <= 20; indice += 1) {
        fireEvent.change(campoCodigoGeral(), { target: { value: `INT-${indice}` } })
        fireEvent.keyDown(campoCodigoGeral(), { key: 'Enter' })
      }
      const lista = screen.getByRole('list', { name: /códigos de barras do produto/i })
      expect(within(lista).getAllByRole('listitem')).toHaveLength(20)
      fireEvent.change(campoCodigoGeral(), { target: { value: 'INT-21' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Limite de 20 códigos de barras atingido.')).toBeInTheDocument()
      expect(screen.getByText('O produto não foi salvo. Confira o erro na aba Geral.')).toBeInTheDocument()
      await waitFor(() => expect(campoCodigoGeral()).toHaveFocus())
      expect(campoCodigoGeral()).toHaveValue('INT-21')
      expect(within(lista).getAllByRole('listitem')).toHaveLength(20)
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('Ctrl+Enter com código pendente de dígito inválido não salva e foca o campo de código', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(campoCodigoGeral(), { target: { value: '7891000315508' } })

      fireEvent.keyDown(screen.getByLabelText(/preço de venda/i), { key: 'Enter', ctrlKey: true })

      expect(
        await screen.findByText('Este código não confere (o último dígito não bate). Leia de novo ou confira os números.'),
      ).toBeInTheDocument()
      await waitFor(() => expect(campoCodigoGeral()).toHaveFocus())
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('código pendente repetido, salvando da aba Códigos, fica na aba Códigos', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      abrirAba(/códigos/i)
      fireEvent.change(screen.getByLabelText('Adicionar código'), { target: { value: '96385074' } })
      fireEvent.keyDown(screen.getByLabelText('Adicionar código'), { key: 'Enter' })
      fireEvent.change(screen.getByLabelText('Adicionar código'), { target: { value: '96385074' } })

      fireEvent.click(screen.getByRole('button', { name: /salvar e cadastrar outro/i }))

      expect(await screen.findByText('Este código já está na lista.')).toBeInTheDocument()
      expect(aba(/códigos/i)).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText('O produto não foi salvo. Confira o erro na aba Códigos.')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText('Adicionar código')).toHaveFocus())
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('cadastro novo abre com o foco no Nome', async () => {
      renderNovo()
      await waitFor(() => expect(campoNome()).toHaveFocus())
    })

    it('edição não foca o Nome ao abrir', async () => {
      renderEdicao()
      await esperarFormulario()
      await new Promise((resolver) => setTimeout(resolver, 10))
      expect(campoNome()).not.toHaveFocus()
    })

    it('no cadastro novo, Enter num campo de texto não envia o formulário', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()

      // fireEvent devolve false quando o Enter foi barrado (sem envio implicito).
      expect(fireEvent.keyDown(campoNome(), { key: 'Enter' })).toBe(false)
      expect(fireEvent.keyDown(screen.getByLabelText(/preço de venda/i), { key: 'Enter' })).toBe(false)
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('na edição, Enter segue o padrão do navegador', async () => {
      renderEdicao()
      await esperarFormulario()

      expect(fireEvent.keyDown(campoNome(), { key: 'Enter' })).toBe(true)
    })

    it('Ctrl+Enter salva no cadastro novo, com a dica na barra de ações', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })

      renderNovo()
      await esperarFormulario()
      expect(screen.getByText(/salva$/)).toHaveTextContent('Ctrl + Enter salva')
      expect(botaoSalvar()).toHaveAttribute('aria-keyshortcuts', 'Control+Enter Meta+Enter')
      await preencherMinimo()

      fireEvent.keyDown(screen.getByLabelText(/preço de venda/i), { key: 'Enter', ctrlKey: true })

      await waitFor(() => expect(cadastrarProdutoMock).toHaveBeenCalledTimes(1))
      expect(await screen.findByText('Produto "Café 500g" cadastrado com sucesso.')).toBeInTheDocument()
    })

    it('Cmd+Enter salva na edição, inclusive da descrição', async () => {
      atualizarProdutoMock.mockResolvedValue(produtoAtivo)

      renderEdicao()
      await esperarFormulario()
      fireEvent.keyDown(screen.getByLabelText(/^descrição/i), { key: 'Enter', metaKey: true })

      await waitFor(() => expect(atualizarProdutoMock).toHaveBeenCalledTimes(1))
    })

    it('Ctrl+Enter no campo de código adiciona o pendente e salva', async () => {
      cadastrarProdutoMock.mockResolvedValue(produtoAtivo)

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(campoCodigoGeral(), { target: { value: '96385074' } })
      fireEvent.keyDown(campoCodigoGeral(), { key: 'Enter', ctrlKey: true })

      await waitFor(() => expect(cadastrarProdutoMock).toHaveBeenCalledTimes(1))
      expect(cadastrarProdutoMock.mock.calls[0][0].codigosBarras).toEqual(['96385074'])
    })

    it('fallback pelo texto (409 de SKU sem campos): o resumo sai ao alterar o SKU', async () => {
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, 'Já existe um produto com este SKU nesta empresa.'))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      abrirAba(/códigos/i)
      fireEvent.change(screen.getByLabelText(/^sku/i), { target: { value: 'SKU-DUP' } })
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('O produto não foi salvo. Confira o erro na aba Códigos.')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText(/^sku/i), { target: { value: 'SKU-NOVO' } })

      await waitFor(() =>
        expect(screen.queryByText('O produto não foi salvo. Confira o erro na aba Códigos.')).not.toBeInTheDocument(),
      )
    })
  })

  describe('OPERADOR (modo leitura)', () => {
    it('abre o produto com campos desabilitados, sem ações de escrita, e sai sem aviso', async () => {
      definirPerfil('OPERADOR')

      renderEdicao()
      await esperarFormulario()

      expect(screen.getByText(/você está no modo leitura/i)).toBeInTheDocument()
      expect(campoNome()).toBeDisabled()
      expect(screen.getByLabelText(/unidade de venda/i)).toBeDisabled()
      expect(screen.getByRole('button', { name: /^categoria/i })).toBeDisabled()
      expect(screen.queryByRole('button', { name: /^salvar/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /inativar/i })).not.toBeInTheDocument()
      expect(screen.getByLabelText(/preço de venda/i)).toBeDisabled()
      expect(campoCodigoGeral()).toBeDisabled()
      expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument()
      abrirAba(/preços/i)
      expect(screen.getByLabelText(/^custo/i)).toBeDisabled()
      abrirAba(/códigos/i)
      expect(screen.getByLabelText(/^sku/i)).toBeDisabled()
      expect(screen.queryByRole('button', { name: /gerar automaticamente/i })).not.toBeInTheDocument()
      expect(screen.getByLabelText('Adicionar código')).toBeDisabled()
      expect(screen.getByText('7891000315507')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('link', { name: /voltar para produtos/i }))
      expect(await screen.findByRole('heading', { name: 'Lista de produtos' })).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('não pode abrir o cadastro de produto novo', async () => {
      definirPerfil('OPERADOR')

      renderNovo()

      expect(await screen.findByText('Somente administradores podem cadastrar produtos.')).toBeInTheDocument()
      expect(screen.queryByRole('textbox', { name: /^Nome/ })).not.toBeInTheDocument()
    })
  })

  describe('unidade, categoria e conversão de compra', () => {
    it('o select de unidade de venda oferece só as unidades ativas no cadastro', async () => {
      renderNovo()
      await esperarFormulario()
      const select = screen.getByLabelText(/unidade de venda/i)
      await waitFor(() => expect(select).toBeEnabled())

      expect(rotulosDasOpcoes(select)).toEqual(['Selecione a unidade', 'CX — Caixa', 'KG — Quilograma', 'UN — Unidade'])
    })

    it('produto novo já vem com UN e o rótulo do preço acompanha a unidade', async () => {
      renderNovo()
      await esperarFormulario()
      const select = screen.getByLabelText(/unidade de venda/i)
      await waitFor(() => expect(select).toHaveValue('un'))
      expect(screen.getByLabelText(/^preço de venda \(por UN\)/i)).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/unidade de venda/i), { target: { value: 'kg' } })
      expect(screen.getByLabelText(/^preço de venda \(por KG\)/i)).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/unidade de venda/i), { target: { value: '' } })
      expect(screen.getByLabelText(/^preço de venda\*/i)).toBeInTheDocument()
    })

    it('sem UN ativa, a unidade de venda começa vazia', async () => {
      listarUnidadesMock.mockResolvedValue([CX, KG, unidade('un', 'UN', 'Unidade', false)])

      renderNovo()
      await esperarFormulario()
      const select = screen.getByLabelText(/unidade de venda/i)
      await waitFor(() => expect(select).toBeEnabled())
      expect(select).toHaveValue('')
    })

    it('unidade de venda obrigatória bloqueia o envio', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText(/unidade de venda/i), { target: { value: '' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Selecione a unidade de venda.')).toBeInTheDocument()
      expect(screen.getByLabelText(/unidade de venda/i)).toHaveAttribute('aria-invalid', 'true')
      await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toHaveFocus())
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('na edição, mantém a unidade atual inativa como opção marcada "(inativa)" e a envia ao salvar', async () => {
      const produtoComPacote: Produto = { ...produtoAtivo, unidade: resumo(PCT_INATIVA) }
      atualizarProdutoMock.mockResolvedValue(produtoComPacote)

      renderEdicao(produtoComPacote)
      await esperarFormulario()
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

      fireEvent.click(botaoSalvar())

      await waitFor(() => {
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          ID_ARROZ,
          expect.objectContaining({ unidadeId: 'pct', categoriaId: 'mercearia' }),
        )
      })
    })

    it('cria categoria pelo atalho do seletor e a envia no cadastro', async () => {
      cadastrarProdutoMock.mockResolvedValue(produtoAtivo)
      cadastrarCategoriaMock.mockResolvedValue(categoria('petiscos', 'Petiscos', null, 'Petiscos'))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Bifinho', '8')

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

      fireEvent.click(botaoSalvar())

      await waitFor(() => {
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(expect.objectContaining({ categoriaId: 'petiscos' }))
      })
    })

    it('unidade de compra sem fator bloqueia o envio', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText(/unidade de compra/i), { target: { value: 'cx' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Informe a unidade de compra e o fator de conversão juntos.')).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('o fator fica oculto sem unidade de compra e é descartado ao limpar a compra', async () => {
      cadastrarProdutoMock.mockResolvedValue(produtoAtivo)

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      expect(screen.queryByLabelText(/^quantas/i)).not.toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/unidade de compra/i), { target: { value: 'cx' } })
      expect(screen.getByLabelText('Quantas UN vêm em 1 CX?')).toBeInTheDocument()
      fireEvent.change(campoFator(), { target: { value: '12' } })

      fireEvent.change(screen.getByLabelText(/unidade de compra/i), { target: { value: '' } })
      expect(screen.queryByLabelText(/^quantas/i)).not.toBeInTheDocument()
      fireEvent.click(botaoSalvar())

      await waitFor(() => {
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(
          expect.objectContaining({ unidadeCompraId: null, fatorConversao: null }),
        )
      })
    })

    it('fator precisa ser maior que zero', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText(/unidade de compra/i), { target: { value: 'cx' } })
      fireEvent.change(campoFator(), { target: { value: '0' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('O fator de conversão deve ser maior que zero.')).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('a unidade de venda não aparece como compra e trocar a venda para a da compra limpa a compra', async () => {
      renderNovo()
      await esperarFormulario()
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
      cadastrarProdutoMock.mockResolvedValue(produtoAtivo)

      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Refrigerante lata', '6')
      fireEvent.change(screen.getByLabelText(/unidade de compra/i), { target: { value: 'cx' } })
      fireEvent.change(campoFator(), { target: { value: '12' } })

      expect(screen.getByText('1 CX = 12 UN')).toBeInTheDocument()
      expect(campoFator()).toHaveAccessibleName('Quantas UN vêm em 1 CX?')
      expect(campoFator()).toHaveAccessibleDescription('1 CX = 12 UN')

      fireEvent.change(campoFator(), { target: { value: '1.5000' } })
      expect(screen.getByText('1 CX = 1,5 UN')).toBeInTheDocument()

      fireEvent.change(campoFator(), { target: { value: '12' } })
      fireEvent.click(botaoSalvar())

      await waitFor(() => {
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(
          expect.objectContaining({ unidadeId: 'un', unidadeCompraId: 'cx', fatorConversao: 12 }),
        )
      })
    })

    it('na edição, preenche unidade de compra e fator vindos do produto', async () => {
      renderEdicao({ ...produtoAtivo, unidadeCompra: resumo(CX), fatorConversao: 12, conversaoTexto: '1 CX = 12 UN' })
      await esperarFormulario()

      await waitFor(() => expect(screen.getByLabelText(/unidade de compra/i)).toHaveValue('cx'))
      expect(campoFator()).toHaveValue(12)
      expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('un')
      expect(screen.getByRole('button', { name: /^categoria/i })).toHaveTextContent('Mercearia')
      expect(screen.getByText('1 CX = 12 UN')).toBeInTheDocument()
    })

    it('mostra a mensagem do backend quando a unidade escolhida está inativa (400)', async () => {
      cadastrarProdutoMock.mockRejectedValue(new HttpError(400, 'Esta unidade está inativa. Escolha uma unidade ativa.'))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Esta unidade está inativa. Escolha uma unidade ativa.')).toBeInTheDocument()
    })

    it('após 400 ao salvar, recarrega unidades e categorias para sair da opção obsoleta', async () => {
      cadastrarProdutoMock.mockRejectedValue(new HttpError(400, 'Esta unidade está inativa. Escolha uma unidade ativa.'))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      await selecionarUnidadeVenda('kg')
      expect(listarUnidadesMock).toHaveBeenCalledTimes(1)
      expect(listarCategoriasMock).toHaveBeenCalledTimes(1)
      // KG foi inativada por outra pessoa: a lista recarregada ja nao a oferece.
      listarUnidadesMock.mockResolvedValue([CX, { ...KG, ativo: false }, PCT_INATIVA, UN])
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Esta unidade está inativa. Escolha uma unidade ativa.')).toBeInTheDocument()
      await waitFor(() => expect(listarUnidadesMock).toHaveBeenCalledTimes(2))
      expect(listarCategoriasMock).toHaveBeenCalledTimes(2)
      await waitFor(() =>
        expect(rotulosDasOpcoes(screen.getByLabelText(/unidade de venda/i))).not.toContain('KG — Quilograma'),
      )
    })

    it('na edição, mantém a categoria atual inativa e a envia ao salvar', async () => {
      const brinquedos: Categoria = {
        ...categoria('brinq', 'Brinquedos', null, 'Brinquedos'),
        ativo: false,
        selecionavel: false,
      }
      listarCategoriasMock.mockResolvedValue([...CATEGORIAS, brinquedos])
      const produto: Produto = { ...produtoAtivo, categoria: { id: 'brinq', nome: 'Brinquedos', caminho: 'Brinquedos' } }
      atualizarProdutoMock.mockResolvedValue(produto)

      renderEdicao(produto)
      await esperarFormulario()
      const seletor = screen.getByRole('button', { name: /^categoria/i })
      await waitFor(() => expect(seletor).toHaveTextContent('Brinquedos (inativa)'))
      fireEvent.click(botaoSalvar())

      await waitFor(() => {
        expect(atualizarProdutoMock).toHaveBeenCalledWith(ID_ARROZ, expect.objectContaining({ categoriaId: 'brinq' }))
      })
    })

    it('na edição, mantém a unidade de compra atual inativa e a envia ao salvar', async () => {
      const produto: Produto = {
        ...produtoAtivo,
        unidadeCompra: resumo(PCT_INATIVA),
        fatorConversao: 6,
        conversaoTexto: '1 PCT = 6 UN',
      }
      atualizarProdutoMock.mockResolvedValue(produto)

      renderEdicao(produto)
      await esperarFormulario()
      const compra = screen.getByLabelText(/unidade de compra/i)
      await waitFor(() => expect(compra).toBeEnabled())
      expect(rotulosDasOpcoes(compra)).toEqual(['Mesma da venda', 'CX — Caixa', 'KG — Quilograma', 'PCT — Pacote (inativa)'])
      expect(compra).toHaveValue('pct')
      expect(screen.getByLabelText('Quantas UN vêm em 1 PCT?')).toHaveValue(6)
      fireEvent.click(botaoSalvar())

      await waitFor(() => {
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          ID_ARROZ,
          expect.objectContaining({ unidadeId: 'un', unidadeCompraId: 'pct', fatorConversao: 6 }),
        )
      })
    })

    it('mostra erro com nova tentativa quando as unidades não carregam', async () => {
      listarUnidadesMock.mockRejectedValueOnce(new Error('falha')).mockResolvedValue(UNIDADES)

      renderNovo()
      await esperarFormulario()
      expect(await screen.findByText('Não foi possível carregar as unidades.')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))

      await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toBeEnabled())
      expect(screen.queryByText('Não foi possível carregar as unidades.')).not.toBeInTheDocument()
    })

    it('sem unidades ativas, orienta a cadastrar em Unidades', async () => {
      listarUnidadesMock.mockResolvedValue([PCT_INATIVA])

      renderNovo()
      await esperarFormulario()

      expect(await screen.findByText('Nenhuma unidade ativa.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Cadastrar em Unidades' })).toHaveAttribute('href', '/produtos/unidades')
    })
  })
})
