import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'

import { PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { dataHojeSaoPaulo } from '@/features/products/produtoFormulario'
import { ProdutoPage } from '@/features/products/ProdutoPage'
import { HttpError } from '@/services/httpClient'
import { useAuth } from '@/hooks/useAuth'
import {
  atualizarProduto,
  buscarProduto,
  cadastrarProduto,
  excluirProduto,
  inativarProduto,
  listarHistoricoDePrecos,
  listarSugestoes,
  reativarProduto,
  sugerirSku,
} from '@/services/produtoService'
import { cadastrarCategoria, listarCategorias } from '@/services/categoriaService'
import { ajustarEstoque, listarMovimentosDeEstoque } from '@/services/estoqueService'
import { buscarConfiguracaoEtiqueta } from '@/services/etiquetaBalancaService'
import { listarUnidades } from '@/services/unidadeService'
import { CONFIGURACAO_ETIQUETA_PADRAO } from '@/lib/etiquetaBalanca'
import {
  CATEGORIAS,
  CX,
  SC,
  ID_ARROZ,
  KG,
  PCT_INATIVA,
  UN,
  UNIDADES,
  categoria,
  embalagemDaApi,
  produtoAtivo,
  resumo,
  unidade,
} from '@/test/fixturesProduto'
import {
  elementosObservados,
  instalarIntersectionObserverFalso,
  simularInterseccao,
} from '@/test/intersectionObserver'
import type { Categoria } from '@/types/catalogo'
import type { MovimentoEstoque } from '@/types/estoque'
import type { HistoricoPreco, PaginaResponse, Produto, ProdutoRequest } from '@/types/produto'

vi.mock('@/services/produtoService', () => ({
  buscarProduto: vi.fn(),
  cadastrarProduto: vi.fn(),
  atualizarProduto: vi.fn(),
  inativarProduto: vi.fn(),
  reativarProduto: vi.fn(),
  excluirProduto: vi.fn(),
  sugerirSku: vi.fn(),
  listarSugestoes: vi.fn(),
  listarHistoricoDePrecos: vi.fn(),
}))

vi.mock('@/services/estoqueService', () => ({
  ajustarEstoque: vi.fn(),
  listarMovimentosDeEstoque: vi.fn(),
}))

vi.mock('@/services/etiquetaBalancaService', () => ({
  buscarConfiguracaoEtiqueta: vi.fn(),
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
const listarHistoricoDePrecosMock = vi.mocked(listarHistoricoDePrecos)
const ajustarEstoqueMock = vi.mocked(ajustarEstoque)
const listarMovimentosDeEstoqueMock = vi.mocked(listarMovimentosDeEstoque)
const listarUnidadesMock = vi.mocked(listarUnidades)
const buscarConfiguracaoEtiquetaMock = vi.mocked(buscarConfiguracaoEtiqueta)
const listarCategoriasMock = vi.mocked(listarCategorias)
const cadastrarCategoriaMock = vi.mocked(cadastrarCategoria)
const useAuthMock = vi.mocked(useAuth)
// O jsdom nao rola: o mock registra em que elemento a pagina pediu a rolagem.
const scrollIntoViewMock = vi.fn()

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

// --- Acesso aos campos e atalhos ----------------------------------------------

function barraDeAtalhos(): HTMLElement {
  return screen.getByRole('navigation', { name: /seções do produto/i })
}

/** Atalho de uma secao na barra fixa (o nome inclui a contagem de erros, ex.: "Geral (1 erro)"). */
function atalho(nome: RegExp): HTMLElement {
  return within(barraDeAtalhos()).getByRole('link', { name: nome })
}

function secao(nome: RegExp): HTMLElement {
  return screen.getByRole('region', { name: nome })
}

/**
 * Leva a secao Historico para perto da tela: o `IntersectionObserver` falso
 * avisa o elemento observado (as listas so montam depois disso).
 */
function mostrarHistorico() {
  // So o elemento que a secao observa para carregar (a propria secao e observada pelo scroll-spy).
  const regiao = secao(/^histórico$/i)
  const observado = elementosObservados().find((elemento) => elemento !== regiao && regiao.contains(elemento))
  expect(observado).toBeDefined()
  simularInterseccao(observado as Element, true)
}

/**
 * Posicoes de mentira para o scroll-spy (o jsdom nao tem layout): o topo de
 * cada secao, a base da barra fixa e se a pagina chegou ao fim.
 */
function posicionar(
  topos: Partial<Record<string, number>>,
  { fimDaPagina = false, fundoDaBarra = 50, margemDeRolagem = 0 } = {},
) {
  const retangulo = (topo: number) => ({ top: topo, bottom: topo + 300 }) as DOMRect
  for (const [nome, topo] of Object.entries(topos)) {
    const elemento = document.getElementById(`secao-${nome}`)
    if (elemento && topo !== undefined) {
      vi.spyOn(elemento, 'getBoundingClientRect').mockReturnValue(retangulo(topo))
      // O scroll-margin do Tailwind nao existe no jsdom: o teste diz qual e.
      elemento.style.scrollMarginTop = `${margemDeRolagem}px`
    }
  }
  const barra = document.getElementById('produto-barra-fixa')
  if (barra) {
    vi.spyOn(barra, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: fundoDaBarra } as DOMRect)
  }
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: fimDaPagina ? window.innerHeight : 10 * window.innerHeight,
  })
}

/** Elementos em que o `scrollIntoView` foi chamado (o mock guarda o `this`). */
function rolados(): Element[] {
  return scrollIntoViewMock.mock.contexts as Element[]
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
 * Preenche o minimo valido (nome, unidade UN ja escolhida e preco), tudo na secao
 * Geral. O preco vai como o texto da mascara (o `change` segue os digitos).
 */
async function preencherMinimo(nome = 'Café 500g', preco = '12,50') {
  fireEvent.change(campoNome(), { target: { value: nome } })
  await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('un'))
  fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: preco } })
}

/** Campo "Adicionar código" (de barras) da secao Codigos. */
function campoCodigoBarras(): HTMLElement {
  return screen.getByLabelText('Adicionar código')
}

function campoCodigoProduto(): HTMLElement {
  return screen.getByRole('textbox', { name: /^código do produto/i })
}

function interruptorBalanca(): HTMLElement {
  return screen.getByRole('switch', { name: /vendido na balança/i })
}

function botaoSalvar(): HTMLElement {
  return screen.getByRole('button', { name: /^salvar$/i })
}

function rotulosDasOpcoes(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((opcao) => opcao.textContent ?? '')
}

const REQUEST_VAZIO: ProdutoRequest = {
  codigo: null,
  vendidoBalanca: false,
  nome: '',
  nomeCurto: null,
  unidadeId: 'un',
  categoriaId: null,
  marca: null,
  fornecedor: null,
  descricao: null,
  precoVenda: 0,
  custo: null,
  precoMinimo: null,
  promocao: null,
  atacado: null,
  controlaEstoque: true,
  estoqueInicial: null,
  estoqueMinimo: null,
  estoqueMaximo: null,
  pontoReposicao: null,
  codigosBarras: [],
  embalagens: [],
  sku: null,
}

describe('ProdutoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
    listarUnidadesMock.mockResolvedValue(UNIDADES)
    listarCategoriasMock.mockResolvedValue(CATEGORIAS)
    listarSugestoesMock.mockResolvedValue([])
    listarMovimentosDeEstoqueMock.mockResolvedValue({ itens: [], pagina: 0, tamanho: 20, totalItens: 0 })
    buscarConfiguracaoEtiquetaMock.mockResolvedValue({ ...CONFIGURACAO_ETIQUETA_PADRAO, padrao: true })
    instalarIntersectionObserverFalso()
    Element.prototype.scrollIntoView = scrollIntoViewMock
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(document.documentElement, 'scrollHeight')
  })

  describe('tela única com atalhos (Fase B2)', () => {
    it('novo produto: cabeçalho, voltar, os atalhos e as seções na ordem, com Geral ativa', async () => {
      renderNovo()

      await esperarFormulario()
      expect(screen.getByRole('heading', { level: 1, name: 'Novo produto' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /voltar para produtos/i })).toHaveAttribute('href', '/produtos')
      expect(within(barraDeAtalhos()).getAllByRole('link').map((link) => link.textContent)).toEqual([
        'Geral',
        'Códigos',
        'Preços',
        'Embalagens',
        'Estoque',
      ])
      expect(screen.getAllByRole('heading', { level: 2 }).map((titulo) => titulo.textContent)).toEqual([
        'Geral',
        'Códigos',
        'Preços',
        'Embalagens',
        'Estoque',
      ])
      expect(atalho(/geral/i)).toHaveAttribute('aria-current', 'true')
      expect(atalho(/códigos/i)).not.toHaveAttribute('aria-current')
      expect(atalho(/estoque/i)).toHaveAttribute('href', '#secao-estoque')
    })

    it('na edição, o Histórico é a última seção', async () => {
      renderEdicao()
      await esperarFormulario()

      expect(within(barraDeAtalhos()).getAllByRole('link').map((link) => link.textContent)).toEqual([
        'Geral',
        'Códigos',
        'Preços',
        'Embalagens',
        'Estoque',
        'Histórico',
      ])
      expect(secao(/^histórico$/i)).toBeInTheDocument()
    })

    it('o clique no atalho rola até a seção e foca o título dela', async () => {
      renderNovo()
      await esperarFormulario()
      scrollIntoViewMock.mockClear()

      fireEvent.click(atalho(/estoque/i))

      // Rola a secao (o scroll-margin dela deixa o titulo abaixo da barra fixa) e foca o titulo.
      const titulo = screen.getByRole('heading', { level: 2, name: 'Estoque' })
      expect(rolados()).toEqual([secao(/^estoque$/i)])
      expect(secao(/^estoque$/i)).toHaveClass('scroll-mt-32')
      expect(scrollIntoViewMock).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }))
      expect(titulo).toHaveFocus()
      expect(atalho(/estoque/i)).toHaveAttribute('aria-current', 'true')
      expect(atalho(/geral/i)).not.toHaveAttribute('aria-current')
    })

    it('o atalho ativo é a última seção cujo topo passou da linha abaixo da barra', async () => {
      renderNovo()
      await esperarFormulario()

      posicionar({ geral: -900, codigos: -300, precos: 40, embalagens: 300, estoque: 600 })
      simularInterseccao(secao(/^preços$/i), true)
      expect(atalho(/preços/i)).toHaveAttribute('aria-current', 'true')

      posicionar({ geral: -1400, codigos: -800, precos: -400, embalagens: -200, estoque: 58 })
      simularInterseccao(secao(/^estoque$/i), true)
      expect(atalho(/estoque/i)).toHaveAttribute('aria-current', 'true')
      expect(atalho(/preços/i)).not.toHaveAttribute('aria-current')
    })

    it('a seção rolada pelo atalho fica ativa ao terminar, parada na margem de rolagem (geometria do navegador)', async () => {
      renderEdicao()
      await esperarFormulario()

      fireEvent.click(atalho(/estoque/i))
      // Como no Chrome: barra termina em 52, Estoque parou no scroll-margin (128) e Precos ainda aparece acima.
      posicionar(
        { geral: -2200, codigos: -1400, precos: -600, embalagens: -300, estoque: 128, historico: 900 },
        { fundoDaBarra: 52, margemDeRolagem: 128 },
      )
      fireEvent(window, new Event('scrollend'))
      simularInterseccao(secao(/^estoque$/i), true)

      expect(atalho(/estoque/i)).toHaveAttribute('aria-current', 'true')
      expect(atalho(/preços/i)).not.toHaveAttribute('aria-current')
    })

    it('no topo da página, Geral fica ativa', async () => {
      renderEdicao()
      await esperarFormulario()
      fireEvent.click(atalho(/estoque/i))
      fireEvent(window, new Event('scrollend'))

      posicionar(
        { geral: 220, codigos: 1100, precos: 1900, embalagens: 2300, estoque: 2700, historico: 3400 },
        { fundoDaBarra: 52, margemDeRolagem: 128 },
      )
      simularInterseccao(secao(/^geral$/i), true)

      expect(atalho(/geral/i)).toHaveAttribute('aria-current', 'true')
    })

    it('na rolagem manual, a seção passa a ativa quando o topo chega à linha abaixo da barra', async () => {
      renderEdicao()
      await esperarFormulario()
      const linha = 128 + 16

      posicionar({ geral: -900, codigos: -100, precos: linha + 1, embalagens: 500, estoque: 900, historico: 1700 }, { fundoDaBarra: 52, margemDeRolagem: 128 })
      simularInterseccao(secao(/^preços$/i), true)
      expect(atalho(/códigos/i)).toHaveAttribute('aria-current', 'true')

      posicionar({ geral: -901, codigos: -101, precos: linha, embalagens: 499, estoque: 899, historico: 1699 }, { fundoDaBarra: 52, margemDeRolagem: 128 })
      simularInterseccao(secao(/^preços$/i), true)
      expect(atalho(/preços/i)).toHaveAttribute('aria-current', 'true')
    })

    it('no fim da página, a última seção visível fica ativa (mesmo sem passar da linha)', async () => {
      renderNovo()
      await esperarFormulario()

      posicionar({ geral: -900, codigos: -300, precos: 100, embalagens: 300, estoque: 500 }, { fimDaPagina: true })
      fireEvent.scroll(window)
      simularInterseccao(secao(/^estoque$/i), true)

      expect(atalho(/estoque/i)).toHaveAttribute('aria-current', 'true')
    })

    it('o clique no último atalho continua ativo durante a rolagem e o spy volta no scrollend', async () => {
      renderNovo()
      await esperarFormulario()
      posicionar({ geral: -900, codigos: -300, precos: 40, embalagens: 300, estoque: 600 })

      fireEvent.click(atalho(/estoque/i))
      // A rolagem suave passa por Precos: o spy esta travado.
      simularInterseccao(secao(/^preços$/i), true)
      expect(atalho(/estoque/i)).toHaveAttribute('aria-current', 'true')

      fireEvent(window, new Event('scrollend'))
      simularInterseccao(secao(/^preços$/i), true)
      expect(atalho(/preços/i)).toHaveAttribute('aria-current', 'true')
    })

    it('distribui os campos pelas seções: Geral sem código de barras e o Estoque sem a unidade de compra', async () => {
      renderNovo()
      await esperarFormulario()

      const geral = secao(/^geral$/i)
      expect(within(geral).getByLabelText(/^nome curto/i)).toBeInTheDocument()
      expect(within(geral).getByLabelText(/^marca/i)).toBeInTheDocument()
      expect(within(geral).getByLabelText(/^fornecedor principal/i)).toBeInTheDocument()
      expect(within(geral).getByLabelText(/preço de venda/i)).toBeInTheDocument()
      expect(within(geral).queryByLabelText(/código de barras/i)).not.toBeInTheDocument()
      expect(within(geral).queryByRole('heading', { name: 'Unidade e embalagem' })).not.toBeInTheDocument()
      // O status fica no cabecalho (so na edicao).
      expect(screen.queryByRole('heading', { name: 'Status' })).not.toBeInTheDocument()

      const codigos = secao(/^códigos$/i)
      expect(within(codigos).getByLabelText(/^código do produto/i)).toBeInTheDocument()
      expect(within(codigos).getByRole('switch', { name: /vendido na balança/i })).toBeInTheDocument()
      expect(within(codigos).getByLabelText(/^sku/i)).toBeInTheDocument()
      expect(within(codigos).getByLabelText('Adicionar código')).toBeInTheDocument()
      expect(within(codigos).getByText('Nenhum código de barras cadastrado.')).toBeInTheDocument()

      const precos = secao(/^preços$/i)
      expect(within(precos).queryByLabelText(/preço de venda/i)).not.toBeInTheDocument()
      expect(within(precos).getByLabelText(/^custo/i)).toBeInTheDocument()
      expect(within(precos).getByLabelText(/preço mínimo/i)).toBeInTheDocument()

      const estoque = secao(/^estoque$/i)
      expect(within(estoque).getByLabelText(/estoque mínimo/i)).toBeInTheDocument()
      expect(within(estoque).getByLabelText(/ponto de reposição/i)).toBeInTheDocument()
      expect(within(estoque).getByLabelText(/estoque máximo/i)).toBeInTheDocument()
      // A unidade de compra virou a embalagem de compra (Fase B3).
      expect(within(estoque).queryByRole('heading', { name: 'Unidade e embalagem' })).not.toBeInTheDocument()
      expect(within(estoque).queryByLabelText(/unidade de compra/i)).not.toBeInTheDocument()
    })

    it('o Nº do produto fica na linha do título Geral, só na edição', async () => {
      renderEdicao({ ...produtoAtivo, numero: 15 })
      await esperarFormulario()

      const numero = within(secao(/^geral$/i)).getByText('Nº 15')
      expect(numero.closest('p')).toHaveTextContent('Número do produto: Nº 15')
      expect(numero.closest('p')?.parentElement).toContainElement(
        screen.getByRole('heading', { level: 2, name: 'Geral' }),
      )
    })

    it('no cadastro novo não há Nº (ainda não existe)', async () => {
      renderNovo()
      await esperarFormulario()
      expect(within(secao(/^geral$/i)).queryByText(/^Nº /)).not.toBeInTheDocument()
    })

    it('mostra margem e markup derivados do preço (Geral) e do custo', async () => {
      renderNovo()
      await esperarFormulario()
      expect(screen.getByText('Informe o preço de venda em Geral para ver a margem.')).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '25,90' } })
      // O preco de venda aparece sempre no topo do bloco; falta so o custo.
      expect(screen.getByText('R$ 25,90')).toBeInTheDocument()
      expect(screen.getByText('Informe o custo para ver a margem.')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '18,00' } })

      expect(screen.getByText('30,50%')).toBeInTheDocument()
      expect(screen.getByText('43,89%')).toBeInTheDocument()
      expect(screen.getByText('R$ 25,90')).toBeInTheDocument()
    })
  })

  describe('erros na tela única (Review Focus 4)', () => {
    it('erro no Estoque com o usuário no topo: rola até o campo, foca e conta no atalho', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '20' } })
      fireEvent.change(screen.getByLabelText(/estoque máximo/i), { target: { value: '5' } })
      await waitFor(() => expect(campoNome()).toHaveFocus())
      scrollIntoViewMock.mockClear()

      fireEvent.click(botaoSalvar())

      const maximo = screen.getByLabelText(/estoque máximo/i)
      await waitFor(() => expect(maximo).toHaveFocus())
      expect(rolados()).toEqual([maximo])
      expect(scrollIntoViewMock).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }))
      expect(atalho(/estoque/i)).toHaveAccessibleName('Estoque (1 erro)')
      expect(atalho(/estoque/i)).toHaveAttribute('aria-current', 'true')
      expect(within(atalho(/estoque/i)).getByText('1')).toHaveAttribute('aria-hidden', 'true')
      expect(atalho(/geral/i)).toHaveAccessibleName('Geral')
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('com erros em várias seções, rola até o primeiro na ordem da tela', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '-2' } })
      fireEvent.change(screen.getByLabelText(/^sku/i), { target: { value: 'A'.repeat(51) } })

      fireEvent.click(botaoSalvar())

      // Codigos vem antes de Estoque.
      await waitFor(() => expect(screen.getByLabelText(/^sku/i)).toHaveFocus())
      expect(atalho(/códigos/i)).toHaveAttribute('aria-current', 'true')
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(atalho(/estoque/i)).toHaveAccessibleName('Estoque (1 erro)')
    })

    it('409 do servidor em "codigo" leva à seção Códigos, com a mensagem no campo', async () => {
      const mensagem = 'Este código já está em uso no produto Feijão 1kg.'
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, mensagem, { codigo: mensagem }))
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(campoCodigoProduto(), { target: { value: '542' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('O produto não foi salvo. Confira o erro na seção Códigos.')).toBeInTheDocument()
      expect(campoCodigoProduto()).toHaveAccessibleDescription(new RegExp(`${mensagem}$`))
      await waitFor(() => expect(campoCodigoProduto()).toHaveFocus())
      expect(rolados()).toContain(campoCodigoProduto())
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(atalho(/códigos/i)).toHaveAttribute('aria-current', 'true')
    })

    it('409 de código do produto sem `campos` também vai para o campo, pelo texto', async () => {
      const mensagem = 'Este código já está em uso no produto Feijão 1kg.'
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, mensagem))
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(campoCodigoProduto(), { target: { value: '542' } })

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(campoCodigoProduto()).toHaveFocus())
      expect(campoCodigoProduto()).toHaveAccessibleDescription(new RegExp(`${mensagem}$`))
    })
  })

  describe('código do produto e balança (Fase B2)', () => {
    it('código digitado com zeros à esquerda vai como número no PATCH', async () => {
      atualizarProdutoMock.mockResolvedValue(produtoAtivo)
      renderEdicao({ ...produtoAtivo, codigo: null })
      await esperarFormulario()

      fireEvent.change(campoCodigoProduto(), { target: { value: '000542' } })
      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(atualizarProdutoMock).toHaveBeenCalledWith(ID_ARROZ, expect.objectContaining({ codigo: 542 })),
      )
    })

    it('o código gravado aparece sem zeros', async () => {
      renderEdicao({ ...produtoAtivo, codigo: 542 })
      await esperarFormulario()
      expect(campoCodigoProduto()).toHaveValue('542')
    })

    it('código inválido é barrado com a mensagem da API', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(campoCodigoProduto(), { target: { value: '1234567' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('O código do produto deve ter de 1 a 6 dígitos.')).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('"Vendido na balança" sem código bloqueia o salvamento e foca o código', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(interruptorBalanca())
      expect(campoCodigoProduto()).toHaveAccessibleName(/^Código do produto\s*\(obrigatório\)$/)
      // No cadastro o numero ainda nao existe: sem o atalho.
      expect(screen.queryByRole('button', { name: /usar o número do produto/i })).not.toBeInTheDocument()

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Informe o código do produto para vendê-lo na balança.')).toBeInTheDocument()
      await waitFor(() => expect(campoCodigoProduto()).toHaveFocus())
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()

      // Desligar a balanca tira a exigencia (e o erro).
      fireEvent.click(interruptorBalanca())
      expect(screen.queryByText('Informe o código do produto para vendê-lo na balança.')).not.toBeInTheDocument()
    })

    it('na edição, "Usar o número do produto" preenche o código com o Nº', async () => {
      atualizarProdutoMock.mockResolvedValue(produtoAtivo)
      renderEdicao({ ...produtoAtivo, numero: 37, codigo: null })
      await esperarFormulario()
      expect(screen.queryByRole('button', { name: /usar o número do produto/i })).not.toBeInTheDocument()

      fireEvent.click(interruptorBalanca())
      fireEvent.click(screen.getByRole('button', { name: 'Usar o número do produto (37)' }))

      expect(campoCodigoProduto()).toHaveValue('37')
      expect(campoCodigoProduto()).toHaveFocus()
      expect(screen.queryByRole('button', { name: /usar o número do produto/i })).not.toBeInTheDocument()
      fireEvent.click(botaoSalvar())
      await waitFor(() =>
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          ID_ARROZ,
          expect.objectContaining({ codigo: 37, vendidoBalanca: true }),
        ),
      )
    })

    it('produto antigo, sem código, salva com codigo null e balança desligada, sem enviar o número (Review Focus 5)', async () => {
      atualizarProdutoMock.mockResolvedValue(produtoAtivo)
      renderEdicao({ ...produtoAtivo, codigo: null, vendidoBalanca: false })
      await esperarFormulario()
      expect(campoCodigoProduto()).toHaveValue('')
      expect(interruptorBalanca()).toHaveAttribute('aria-checked', 'false')

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atualizarProdutoMock).toHaveBeenCalledTimes(1))
      const [, request] = atualizarProdutoMock.mock.calls[0]
      expect(request).toMatchObject({ codigo: null, vendidoBalanca: false })
      expect(request).not.toHaveProperty('numero')
    })

    it('código de barras com o formato da etiqueta configurada avisa e continua sendo adicionado e salvo', async () => {
      cadastrarProdutoMock.mockResolvedValue(produtoAtivo)
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      await waitFor(() => expect(buscarConfiguracaoEtiquetaMock).toHaveBeenCalled())

      // 13 digitos com o prefixo 2 da etiqueta padrao (e digito EAN valido, como o de um fabricante).
      fireEvent.change(campoCodigoBarras(), { target: { value: '2000542010008' } })
      fireEvent.keyDown(campoCodigoBarras(), { key: 'Enter' })

      expect(
        await screen.findByText(/^Parece uma etiqueta da balança\./),
      ).toBeInTheDocument()
      fireEvent.click(botaoSalvar())
      await waitFor(() =>
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(expect.objectContaining({ codigosBarras: ['2000542010008'] })),
      )
    })

    it('OPERADOR vê o código e a balança desabilitados, sem o atalho do número', async () => {
      definirPerfil('OPERADOR')
      renderEdicao({ ...produtoAtivo, codigo: null, vendidoBalanca: true })
      await esperarFormulario()

      expect(campoCodigoProduto()).toBeDisabled()
      expect(interruptorBalanca()).toBeDisabled()
      expect(screen.queryByRole('button', { name: /usar o número do produto/i })).not.toBeInTheDocument()
    })
  })

  describe('revisão da Fase B2', () => {
    function antes(a: HTMLElement, b: HTMLElement): boolean {
      return Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    }

    it('a seção Códigos traz os códigos de barras, depois o código do produto com a balança e o SKU por último', async () => {
      renderNovo()
      await esperarFormulario()

      const codigos = secao(/^códigos$/i)
      const barras = within(codigos).getByLabelText('Adicionar código')
      const codigo = within(codigos).getByRole('textbox', { name: /^código do produto/i })
      const balanca = within(codigos).getByRole('switch', { name: /vendido na balança/i })
      const sku = within(codigos).getByLabelText(/^sku/i)
      expect(antes(barras, codigo)).toBe(true)
      expect(antes(codigo, balanca)).toBe(true)
      expect(antes(balanca, sku)).toBe(true)
    })

    it('ajudas da seção Códigos e o link para configurar a etiqueta', async () => {
      renderNovo()
      await esperarFormulario()

      expect(campoCodigoProduto()).toHaveAccessibleDescription(
        'O código que você digita no PDV e programa na balança. Até 6 dígitos; zeros à esquerda são ignorados.',
      )
      expect(screen.getByLabelText(/^sku/i)).toHaveAccessibleDescription(
        'Referência para seu controle (ex.: a do fornecedor). Não é usado na venda.',
      )
      expect(interruptorBalanca()).toHaveAccessibleDescription(
        'Ligue para produtos pesados na balança. O PDV lê o código e o valor da etiqueta.',
      )
      expect(screen.getByRole('link', { name: 'Configurar etiqueta' })).toHaveAttribute('href', '/produtos/balanca')
    })

    it('erros em código de barras e no código: vai primeiro ao de barras, com a contagem da seção', async () => {
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', {
          codigosBarras: 'Código de barras inválido.',
          codigo: 'O código do produto deve ter de 1 a 6 dígitos.',
        }),
      )
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(campoCodigoBarras()).toHaveFocus())
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (2 erros)')
    })

    it('o código de barras pendente barrado e o erro na lista contam como um erro só no atalho', async () => {
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { codigosBarras: 'Informe no máximo 20 códigos de barras.' }),
      )
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())
      expect(await screen.findByText('Informe no máximo 20 códigos de barras.')).toBeInTheDocument()

      fireEvent.change(campoCodigoBarras(), { target: { value: '7891000315508' } })
      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(campoCodigoBarras()).toHaveFocus())
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      // Selecionado: o proximo bip do leitor substitui o codigo barrado.
      const campo = campoCodigoBarras() as HTMLInputElement
      expect(campo.selectionStart).toBe(0)
      expect(campo.selectionEnd).toBe(13)
    })

    it('erro sem campo (500) aparece no contêiner fixo, visível com a página rolada', async () => {
      cadastrarProdutoMock.mockRejectedValue(new HttpError(500, 'NullPointerException'))
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()

      fireEvent.click(botaoSalvar())

      const alerta = await screen.findByText('Não foi possível salvar o produto. Tente novamente.')
      expect(document.getElementById('produto-barra-fixa')).toContainElement(alerta)
      expect(document.getElementById('produto-barra-fixa')).toHaveClass('sticky', 'top-0')
      expect(screen.queryByText(/NullPointer/)).not.toBeInTheDocument()
    })

    it('a mensagem de sucesso também fica no contêiner fixo (ex.: cadastrar outro)', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Açúcar a granel', numero: 16, codigo: null })
      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Açúcar a granel')

      fireEvent.click(screen.getByRole('button', { name: /salvar e cadastrar outro/i }))

      const sucesso = await screen.findByText('Produto "Açúcar a granel" cadastrado (Nº 16).')
      expect(document.getElementById('produto-barra-fixa')).toContainElement(sucesso)
    })

    it('Ctrl+Shift+Enter no cadastro novo salva e abre outro', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })
      const router = renderNovo()
      await esperarFormulario()
      await preencherMinimo()

      fireEvent.keyDown(screen.getByLabelText(/preço de venda/i), { key: 'Enter', ctrlKey: true, shiftKey: true })

      expect(await screen.findByText('Produto "Café 500g" cadastrado (Nº 15 · Cód. 542).')).toBeInTheDocument()
      expect(router.state.location.pathname).toBe('/produtos/novo')
      expect(campoNome()).toHaveValue('')
    })

    it('na edição, Ctrl+Shift+Enter só salva', async () => {
      atualizarProdutoMock.mockResolvedValue(produtoAtivo)
      const router = renderEdicao()
      await esperarFormulario()

      fireEvent.keyDown(campoNome(), { key: 'Enter', ctrlKey: true, shiftKey: true })

      await waitFor(() => expect(router.state.location.pathname).toBe('/produtos'))
    })

    it('ligar "Vendido na balança" depois de um envio com erro mostra a exigência do código na hora', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText(/^sku/i), { target: { value: 'A'.repeat(51) } })
      fireEvent.click(botaoSalvar())
      expect(await screen.findByText(/sku deve ter no máximo 50 caracteres/i)).toBeInTheDocument()

      fireEvent.click(interruptorBalanca())

      expect(await screen.findByText('Informe o código do produto para vendê-lo na balança.')).toBeInTheDocument()
    })

    it('a confirmação da calculadora some quando o preço de venda é editado à mão', async () => {
      renderNovo()
      await esperarFormulario()
      fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '10,00' } })
      fireEvent.change(screen.getByLabelText('Margem desejada (%)'), { target: { value: '50' } })
      fireEvent.click(screen.getByRole('button', { name: 'Calcular preço' }))
      expect(screen.getByText(/preço de venda atualizado para/i)).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '21,00' } })

      expect(screen.queryByText(/preço de venda atualizado para/i)).not.toBeInTheDocument()
    })

    describe('tamanho do código na etiqueta configurada', () => {
      beforeEach(() => {
        buscarConfiguracaoEtiquetaMock.mockResolvedValue({
          ...CONFIGURACAO_ETIQUETA_PADRAO,
          digitosCodigo: 4,
          digitosPreenchimento: 1,
          digitosInformacao: 6,
          casasDecimais: 2,
          digitoVerificador: true,
          padrao: false,
        })
      })

      it('com a balança, a ajuda diz quantos dígitos a etiqueta comporta e o envio barra o código maior', async () => {
        renderNovo()
        await esperarFormulario()
        await preencherMinimo()
        fireEvent.click(interruptorBalanca())
        await waitFor(() =>
          expect(campoCodigoProduto()).toHaveAccessibleDescription(/A etiqueta da balança comporta até 4 dígitos\.$/),
        )

        fireEvent.change(campoCodigoProduto(), { target: { value: '12345' } })
        fireEvent.click(botaoSalvar())

        expect(
          await screen.findByText('Este código tem mais dígitos do que a etiqueta da balança comporta (4).'),
        ).toBeInTheDocument()
        await waitFor(() => expect(campoCodigoProduto()).toHaveFocus())
        expect(cadastrarProdutoMock).not.toHaveBeenCalled()
      })

      it('"Usar o número do produto" só aparece se o número couber; senão, diz o motivo', async () => {
        renderEdicao({ ...produtoAtivo, numero: 12345, codigo: null })
        await esperarFormulario()
        await waitFor(() => expect(buscarConfiguracaoEtiquetaMock).toHaveBeenCalled())

        fireEvent.click(interruptorBalanca())

        expect(
          await screen.findByText('O Nº 12345 tem mais dígitos do que a etiqueta da balança comporta (4).'),
        ).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: /usar o número do produto/i })).not.toBeInTheDocument()
      })
    })

    it('erro do servidor em estoqueInicial na edição (campo fora da tela) foca o título Estoque', async () => {
      atualizarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { estoqueInicial: 'O estoque inicial só vale no cadastro.' }),
      )
      renderEdicao()
      await esperarFormulario()
      scrollIntoViewMock.mockClear()

      fireEvent.click(botaoSalvar())

      const titulo = screen.getByRole('heading', { level: 2, name: 'Estoque' })
      await waitFor(() => expect(titulo).toHaveFocus())
      expect(rolados()).toContain(secao(/^estoque$/i))
      expect(atalho(/estoque/i)).toHaveAccessibleName('Estoque (1 erro)')
    })

    it('400 de código grande demais para a etiqueta leva à seção Códigos e foca o código', async () => {
      const mensagem = 'Este código tem mais dígitos do que a etiqueta da balança comporta (4).'
      atualizarProdutoMock.mockRejectedValue(new HttpError(400, 'Dados invalidos.', { codigo: mensagem }))
      renderEdicao({ ...produtoAtivo, codigo: 12345, vendidoBalanca: true })
      await esperarFormulario()

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(campoCodigoProduto()).toHaveFocus())
      expect(campoCodigoProduto()).toHaveAccessibleDescription(new RegExp(`${mensagem.replace(/[().]/g, '\\$&')}$`))
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(atalho(/códigos/i)).toHaveAttribute('aria-current', 'true')
    })
  })

  describe('validação e erro por seção', () => {
    it('erro de preço (seção Geral) leva à Geral e foca o campo', async () => {
      renderNovo()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Café' } })

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atalho(/geral/i)).toHaveAttribute('aria-current', 'true'))
      expect(atalho(/geral/i)).toHaveAccessibleName('Geral (1 erro)')
      expect(atalho(/preços/i)).toHaveAccessibleName('Preços')
      expect(screen.getByText('Informe o preço de venda.')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText(/preço de venda/i)).toHaveFocus())
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('com erros em várias seções, vai para a primeira e marca todas', async () => {
      renderNovo()
      await esperarFormulario()
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '10,00' } })
      fireEvent.change(screen.getByLabelText(/preço mínimo/i), { target: { value: '15,00' } })
      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '-2' } })
      fireEvent.change(screen.getByLabelText(/^sku/i), { target: { value: 'A'.repeat(51) } })

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atalho(/geral/i)).toHaveAttribute('aria-current', 'true'))
      // So o nome vazio na Geral; o preco minimo acima do de venda, em Precos.
      expect(atalho(/geral/i)).toHaveAccessibleName('Geral (1 erro)')
      expect(atalho(/preços/i)).toHaveAccessibleName('Preços (1 erro)')
      expect(atalho(/estoque/i)).toHaveAccessibleName('Estoque (1 erro)')
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(screen.getByText(/informe o nome do produto/i)).toBeInTheDocument()
      await waitFor(() => expect(campoNome()).toHaveFocus())

      expect(screen.getByText(/estoque mínimo não pode ser negativo/i)).toBeInTheDocument()
      expect(screen.getByText(/sku deve ter no máximo 50 caracteres/i)).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('a máscara não aceita sinal: preço e custo nunca ficam negativos', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Produto' })
      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Produto', '-1')
      expect(screen.getByLabelText(/preço de venda/i)).toHaveValue('0,01')
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
      fireEvent.change(screen.getByLabelText(/preço mínimo/i), { target: { value: '15,00' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(/preço mínimo não pode ser maior que o preço de venda/i)).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('barra o submit quando o estoque máximo é menor que o estoque mínimo', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '20' } })
      fireEvent.change(screen.getByLabelText(/estoque máximo/i), { target: { value: '5' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(/estoque máximo não pode ser menor que o estoque mínimo/i)).toBeInTheDocument()
      expect(atalho(/estoque/i)).toHaveAttribute('aria-current', 'true')
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
      fireEvent.change(screen.getByLabelText(/ponto de reposição/i), { target: { value: '8' } })
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

    it('"Salvar e cadastrar outro" mantém unidade, categoria, marca e fornecedor e foca o Nome', async () => {
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
      fireEvent.change(campoCodigoBarras(), { target: { value: '7891000315507' } })
      fireEvent.keyDown(campoCodigoBarras(), { key: 'Enter' })
      fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '2,00' } })
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '3,50' } })

      fireEvent.click(screen.getByRole('button', { name: /salvar e cadastrar outro/i }))

      await waitFor(() =>
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(
          expect.objectContaining({ nome: 'Sachê frango', unidadeId: 'kg', categoriaId: 'sache' }),
        ),
      )
      expect(await screen.findByText('Produto "Sachê frango" cadastrado (Nº 15 · Cód. 542).')).toBeInTheDocument()
      // O proximo produto comeca pelo Nome, no topo da tela (spec B2 §4).
      await waitFor(() => expect(campoNome()).toHaveFocus())
      expect(rolados()).toContain(campoNome())
      expect(atalho(/geral/i)).toHaveAttribute('aria-current', 'true')
      expect(screen.queryByRole('list', { name: /códigos de barras do produto/i })).not.toBeInTheDocument()
      expect(campoNome()).toHaveValue('')
      expect(screen.getByLabelText(/^nome curto/i)).toHaveValue('')
      expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('kg')
      expect(screen.getByRole('button', { name: /^categoria/i })).toHaveTextContent('Ração › Sachê')
      expect(screen.getByLabelText(/^marca/i)).toHaveValue('Golden')
      expect(screen.getByLabelText(/^fornecedor principal/i)).toHaveValue('PremieRpet')
      expect(screen.getByLabelText(/preço de venda/i)).toHaveValue('')
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
      fireEvent.change(screen.getByLabelText(/^sku/i), { target: { value: 'SKU-DUP' } })

      fireEvent.click(screen.getByRole('button', { name: /salvar e cadastrar outro/i }))

      expect(
        await screen.findByText(
          'Já existe um produto com este SKU nesta empresa. Gere outro SKU ou informe um diferente.',
        ),
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/^sku/i)).toHaveValue('SKU-DUP')
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

    it('400 com campos: cada mensagem vai para o seu campo, com a contagem de cada seção (FE I3)', async () => {
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { precoVenda: 'Preço de venda inválido.', sku: 'SKU inválido.' }),
      )

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(
        await screen.findByText('O produto não foi salvo. Confira os erros nas seções Geral e Códigos.'),
      ).toBeInTheDocument()
      expect(atalho(/geral/i)).toHaveAttribute('aria-current', 'true')
      expect(atalho(/geral/i)).toHaveAccessibleName('Geral (1 erro)')
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(screen.getByLabelText(/preço de venda/i)).toHaveAccessibleDescription('Preço de venda inválido.')
      await waitFor(() => expect(screen.getByLabelText(/preço de venda/i)).toHaveFocus())
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
        await screen.findByText('Empresa inválida. O produto não foi salvo. Confira o erro na seção Geral.'),
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
      expect(atalho(/geral/i)).toHaveAccessibleName('Geral')
    })

    it('409 sem mensagem do backend mostra texto amigável, nunca o técnico', async () => {
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, 'Requisicao falhou (HTTP 409).'))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(
        await screen.findByText('Já existe um produto com este código, SKU ou código de barras nesta empresa.'),
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

      expect(await screen.findByText('Produto "Café 500g" cadastrado (Nº 15 · Cód. 542).')).toBeInTheDocument()
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
    it('carrega o produto pelo UUID e preenche as seções', async () => {
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

    it('usar os atalhos das seções não dispara o aviso', async () => {
      const router = renderNovo()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Café' } })
      fireEvent.click(atalho(/estoque/i))
      fireEvent.click(atalho(/códigos/i))

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

    it('409 de código em outro produto (com campos) aparece no campo da seção Códigos, com a contagem', async () => {
      const mensagem = 'O código de barras 7891000315507 já está cadastrado no produto "Feijão 1kg".'
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, mensagem, { codigosBarras: mensagem }))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      lerCodigo('7891000315507')
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('O produto não foi salvo. Confira o erro na seção Códigos.')).toBeInTheDocument()
      expect(atalho(/códigos/i)).toHaveAttribute('aria-current', 'true')
      expect(atalho(/geral/i)).toHaveAccessibleName('Geral')
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(screen.getByText(mensagem)).toBeInTheDocument()
      await waitFor(() => expect(campoCodigoBarras()).toHaveFocus())
      // Nada perdido: o codigo continua na lista.
      expect(screen.getByText('7891000315507')).toBeInTheDocument()

      // Remover o codigo citado tira o resumo do topo (S2).
      fireEvent.click(screen.getByRole('button', { name: 'Remover código 7891000315507' }))
      await waitFor(() =>
        expect(screen.queryByText('O produto não foi salvo. Confira o erro na seção Códigos.')).not.toBeInTheDocument(),
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
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(mensagem)).toBeInTheDocument()
      expect(atalho(/códigos/i)).toHaveAttribute('aria-current', 'true')
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
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
      expect(atalho(/códigos/i)).toHaveAttribute('aria-current', 'true')
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      await waitFor(() => expect(campoCodigoBarras()).toHaveFocus())
    })

    it('409 com campos (sku) marca o SKU pela chave, não pelo texto', async () => {
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(409, 'Conflito ao salvar.', { sku: 'Este SKU já é usado por outro produto.' }),
      )

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('O produto não foi salvo. Confira o erro na seção Códigos.')).toBeInTheDocument()
      expect(atalho(/códigos/i)).toHaveAttribute('aria-current', 'true')
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
      fireEvent.change(campoCodigoBarras(), { target: { value: '7891000315507' } })
      fireEvent.keyDown(campoCodigoBarras(), { key: 'Enter' })
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(mensagem)).toBeInTheDocument()
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
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
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      expect(screen.getByLabelText(/^sku/i)).not.toHaveAttribute('aria-invalid')
      expect(screen.queryByText(/gere outro sku/i)).not.toBeInTheDocument()
    })

    it('400 de limite de códigos marca o campo e a contagem da seção Códigos', async () => {
      cadastrarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Um ou mais campos sao invalidos.', { codigosBarras: 'Informe no máximo 20 códigos de barras.' }),
      )

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Informe no máximo 20 códigos de barras.')).toBeInTheDocument()
      expect(atalho(/códigos/i)).toHaveAttribute('aria-current', 'true')
      expect(atalho(/geral/i)).toHaveAccessibleName('Geral')
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
    })
  })

  describe('SKU sugerido', () => {
    it('"Gerar automaticamente" preenche o SKU, que continua editável', async () => {
      sugerirSkuMock.mockResolvedValue('P000031')

      renderNovo()
      await esperarFormulario()
      fireEvent.click(screen.getByRole('button', { name: /gerar automaticamente/i }))

      await waitFor(() => expect(screen.getByLabelText(/^sku/i)).toHaveValue('P000031'))
      expect(screen.getByLabelText(/^sku/i)).toBeEnabled()
      expect(screen.getByText(/SKU P000031 gerado/)).toBeInTheDocument()
    })

    it('falha ao gerar mostra mensagem amigável', async () => {
      sugerirSkuMock.mockRejectedValue(new HttpError(500, 'Requisicao falhou (HTTP 500).'))

      renderNovo()
      await esperarFormulario()
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
    it('código lido entra na lista da seção Códigos, com o formato', async () => {
      renderNovo()
      await esperarFormulario()

      fireEvent.change(campoCodigoBarras(), { target: { value: '7891000315507' } })
      fireEvent.keyDown(campoCodigoBarras(), { key: 'Enter' })
      fireEvent.change(campoCodigoBarras(), { target: { value: '96385074' } })
      fireEvent.keyDown(campoCodigoBarras(), { key: 'Enter' })

      const lista = within(secao(/^códigos$/i)).getByRole('list', { name: /códigos de barras do produto/i })
      expect(within(lista).getByText('EAN-13')).toBeInTheDocument()
      expect(within(lista).getAllByRole('listitem').map((item) => within(item).getByText(/^\d+$/).textContent)).toEqual([
        '7891000315507',
        '96385074',
      ])
    })

    it('texto digitado e não adicionado conta como alteração', async () => {
      renderNovo()
      await esperarFormulario()

      fireEvent.change(campoCodigoBarras(), { target: { value: '789100031' } })
      expect(campoCodigoBarras()).toHaveValue('789100031')

      fireEvent.click(screen.getByRole('link', { name: /voltar para produtos/i }))
      expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument()
    })

    it('ao salvar, o código pendente válido entra na lista e no request', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(campoCodigoBarras(), { target: { value: ' 7891000315507 ' } })

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(cadastrarProdutoMock).toHaveBeenCalledTimes(1))
      expect(cadastrarProdutoMock.mock.calls[0][0].codigosBarras).toEqual(['7891000315507'])
      expect(cadastrarProdutoMock.mock.calls[0][0]).not.toHaveProperty('codigoPendente')
    })

    it('código pendente barrado não salva: mostra o erro no campo da seção Códigos e o foca', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(campoCodigoBarras(), { target: { value: '7891000315508' } })

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atalho(/códigos/i)).toHaveAttribute('aria-current', 'true'))
      expect(
        screen.getByText('Este código não confere (o último dígito não bate). Leia de novo ou confira os números.'),
      ).toBeInTheDocument()
      expect(screen.getByText('O produto não foi salvo. Confira o erro na seção Códigos.')).toBeInTheDocument()
      expect(atalho(/códigos/i)).toHaveAccessibleName('Códigos (1 erro)')
      await waitFor(() => expect(campoCodigoBarras()).toHaveFocus())
      expect(campoCodigoBarras()).toHaveValue('7891000315508')
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()

      // Corrigir o texto tira o erro e o resumo do topo.
      fireEvent.change(campoCodigoBarras(), { target: { value: '7891000315507' } })
      await waitFor(() =>
        expect(screen.queryByText('O produto não foi salvo. Confira o erro na seção Códigos.')).not.toBeInTheDocument(),
      )
      expect(screen.queryByText(/este código não confere/i)).not.toBeInTheDocument()
    })

    it('com 20 códigos na lista, o pendente ao salvar é barrado pelo limite e nada é enviado', async () => {
      // Ja abre com os 20 (ler 20 codigos um a um deixa o teste lento sem provar nada a mais).
      const vinte = Array.from({ length: 20 }, (_, indice) => ({ codigo: `INT-${indice + 1}`, formato: 'OUTRO' as const }))
      renderEdicao({ ...produtoAtivo, codigosBarras: vinte })
      await esperarFormulario()
      const lista = screen.getByRole('list', { name: /códigos de barras do produto/i })
      expect(within(lista).getAllByRole('listitem')).toHaveLength(20)
      fireEvent.change(campoCodigoBarras(), { target: { value: 'INT-21' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('Limite de 20 códigos de barras atingido.')).toBeInTheDocument()
      expect(screen.getByText('O produto não foi salvo. Confira o erro na seção Códigos.')).toBeInTheDocument()
      await waitFor(() => expect(campoCodigoBarras()).toHaveFocus())
      expect(campoCodigoBarras()).toHaveValue('INT-21')
      expect(within(lista).getAllByRole('listitem')).toHaveLength(20)
      expect(atualizarProdutoMock).not.toHaveBeenCalled()
    })

    it('Ctrl+Enter com código pendente de dígito inválido não salva e foca o campo de código', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(campoCodigoBarras(), { target: { value: '7891000315508' } })

      fireEvent.keyDown(screen.getByLabelText(/preço de venda/i), { key: 'Enter', ctrlKey: true })

      expect(
        await screen.findByText('Este código não confere (o último dígito não bate). Leia de novo ou confira os números.'),
      ).toBeInTheDocument()
      await waitFor(() => expect(campoCodigoBarras()).toHaveFocus())
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('código pendente repetido leva à seção Códigos', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText('Adicionar código'), { target: { value: '96385074' } })
      fireEvent.keyDown(screen.getByLabelText('Adicionar código'), { key: 'Enter' })
      fireEvent.change(screen.getByLabelText('Adicionar código'), { target: { value: '96385074' } })

      fireEvent.click(screen.getByRole('button', { name: /salvar e cadastrar outro/i }))

      expect(await screen.findByText('Este código já está na lista.')).toBeInTheDocument()
      expect(atalho(/códigos/i)).toHaveAttribute('aria-current', 'true')
      expect(screen.getByText('O produto não foi salvo. Confira o erro na seção Códigos.')).toBeInTheDocument()
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
      expect(screen.getByText(/salva e abre outro$/)).toHaveTextContent(
        'Ctrl + Enter salva · Ctrl + Shift + Enter salva e abre outro',
      )
      expect(screen.getByRole('button', { name: /salvar e cadastrar outro/i })).toHaveAttribute(
        'aria-keyshortcuts',
        'Control+Shift+Enter Meta+Shift+Enter',
      )
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
      fireEvent.change(campoCodigoBarras(), { target: { value: '96385074' } })
      fireEvent.keyDown(campoCodigoBarras(), { key: 'Enter', ctrlKey: true })

      await waitFor(() => expect(cadastrarProdutoMock).toHaveBeenCalledTimes(1))
      expect(cadastrarProdutoMock.mock.calls[0][0].codigosBarras).toEqual(['96385074'])
    })

    it('fallback pelo texto (409 de SKU sem campos): o resumo sai ao alterar o SKU', async () => {
      cadastrarProdutoMock.mockRejectedValue(new HttpError(409, 'Já existe um produto com este SKU nesta empresa.'))

      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText(/^sku/i), { target: { value: 'SKU-DUP' } })
      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('O produto não foi salvo. Confira o erro na seção Códigos.')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText(/^sku/i), { target: { value: 'SKU-NOVO' } })

      await waitFor(() =>
        expect(screen.queryByText('O produto não foi salvo. Confira o erro na seção Códigos.')).not.toBeInTheDocument(),
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
      expect(campoCodigoBarras()).toBeDisabled()
      expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument()
      expect(screen.getByLabelText(/^custo/i)).toBeDisabled()
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

  describe('seção Embalagens (Fase B3)', () => {
    const NEXGARD: Produto = { ...produtoAtivo, nome: 'Nexgard Combo', precoVenda: 89.9, custo: 50, precoMinimo: null }
    const CAIXA_COM_3 = embalagemDaApi({ id: 'emb-cx3', unidade: resumo(CX), quantidade: 3, preco: 209.9, codigos: ['7891000100103'] })

    function secaoEmbalagens(): HTMLElement {
      return secao(/^embalagens$/i)
    }

    function botaoAdicionarEmbalagem(): HTMLElement {
      return within(secaoEmbalagens()).getByRole('button', { name: 'Adicionar embalagem' })
    }

    /** Bloco de uma embalagem, pelo titulo (o rotulo, ou "Nova embalagem" enquanto falta a unidade ou a quantidade). */
    function bloco(nome: string | RegExp): HTMLElement {
      return within(secaoEmbalagens()).getByRole('group', { name: nome })
    }

    async function adicionarCaixa(quantidade = '3') {
      fireEvent.click(botaoAdicionarEmbalagem())
      const novo = bloco('Nova embalagem')
      const unidadeSelect = within(novo).getByLabelText(/^unidade/i)
      await waitFor(() => expect(unidadeSelect).toBeEnabled())
      fireEvent.change(unidadeSelect, { target: { value: 'cx' } })
      fireEvent.change(within(novo).getByLabelText(/^com/i), { target: { value: quantidade } })
      return novo
    }

    it('estado vazio: a ajuda com a sigla e "Adicionar embalagem"', async () => {
      renderNovo()
      await esperarFormulario()
      await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('un'))

      expect(
        within(secaoEmbalagens()).getByText(
          'Outras formas de vender ou comprar este produto, como a caixa com 3. O estoque continua em UN.',
        ),
      ).toBeInTheDocument()
      expect(botaoAdicionarEmbalagem()).toBeInTheDocument()
      expect(within(secaoEmbalagens()).queryByRole('group')).not.toBeInTheDocument()
    })

    it('adicionar foca a unidade; o seletor não oferece a unidade de venda', async () => {
      renderNovo()
      await esperarFormulario()
      await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('un'))

      fireEvent.click(botaoAdicionarEmbalagem())

      const unidadeSelect = within(bloco('Nova embalagem')).getByLabelText(/^unidade/i)
      await waitFor(() => expect(unidadeSelect).toHaveFocus())
      expect(rotulosDasOpcoes(unidadeSelect)).toEqual(['Selecione a unidade', 'CX — Caixa', 'KG — Quilograma'])
    })

    it('sem preço próprio, mostra a dica do preço calculado pelo preço de venda', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Nexgard Combo', '89,90')

      const caixa = await adicionarCaixa()

      expect(within(secaoEmbalagens()).getByRole('group', { name: 'CX c/ 3 UN' })).toBe(caixa)
      expect(within(caixa).getByText('3 × R$ 89,90 = R$ 269,70')).toBeInTheDocument()
    })

    it('com a promoção vigente hoje, a dica usa o preço promocional', async () => {
      const hoje = dataHojeSaoPaulo()
      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Nexgard Combo', '89,90')
      fireEvent.click(screen.getByRole('switch', { name: 'Ativar preço promocional' }))
      fireEvent.change(screen.getByLabelText('Preço promocional'), { target: { value: '79,90' } })
      fireEvent.change(screen.getByLabelText('Início'), { target: { value: hoje } })
      fireEvent.change(screen.getByLabelText('Fim'), { target: { value: hoje } })

      const caixa = await adicionarCaixa()

      expect(within(caixa).getByText('3 × R$ 79,90 (promoção) = R$ 239,70')).toBeInTheDocument()
    })

    it('margem e markup do preço efetivo sobre o custo da embalagem, e o aviso abaixo do custo', async () => {
      renderEdicao({ ...NEXGARD, embalagens: [CAIXA_COM_3] })
      await esperarFormulario()

      const caixa = bloco('CX c/ 3 UN')
      const derivados = within(caixa).getByRole('group', { name: /margem e markup da embalagem/i })
      expect(within(derivados).getByText('28,54%')).toBeInTheDocument()
      expect(within(derivados).getByText('39,93%')).toBeInTheDocument()
      expect(within(caixa).getByLabelText(/^preço/i)).toHaveValue('209,90')

      fireEvent.change(within(caixa).getByLabelText(/^preço/i), { target: { value: '100,00' } })
      expect(within(caixa).getByText('Preço abaixo do custo da embalagem (R$ 150,00).')).toBeInTheDocument()
    })

    it('sem custo, margem e markup ficam "—"', async () => {
      renderEdicao({ ...NEXGARD, custo: null, embalagens: [CAIXA_COM_3] })
      await esperarFormulario()

      const derivados = within(bloco('CX c/ 3 UN')).getByRole('group', { name: /margem e markup da embalagem/i })
      expect(within(derivados).getAllByText('—')).toHaveLength(2)
    })

    it('código de barras da embalagem entra com Enter, sem enviar o formulário', async () => {
      atualizarProdutoMock.mockResolvedValue(NEXGARD)
      renderEdicao({ ...NEXGARD, embalagens: [CAIXA_COM_3] })
      await esperarFormulario()

      const caixa = bloco('CX c/ 3 UN')
      expect(within(caixa).getByText('7891000100103')).toBeInTheDocument()
      const entrada = within(caixa).getByLabelText('Adicionar código')
      fireEvent.change(entrada, { target: { value: '7891000100110' } })
      fireEvent.keyDown(entrada, { key: 'Enter' })

      expect(within(caixa).getByText('7891000100110')).toBeInTheDocument()
      expect(entrada).toHaveValue('')
      expect(atualizarProdutoMock).not.toHaveBeenCalled()
      expect(within(caixa).getByText(/até 5 códigos/i)).toBeInTheDocument()
    })

    it('um código que já está na unidade não entra na embalagem', async () => {
      renderEdicao({ ...NEXGARD, embalagens: [CAIXA_COM_3] })
      await esperarFormulario()

      const entrada = within(bloco('CX c/ 3 UN')).getByLabelText('Adicionar código')
      fireEvent.change(entrada, { target: { value: '7891000315507' } })
      fireEvent.keyDown(entrada, { key: 'Enter' })

      expect(within(bloco('CX c/ 3 UN')).getByText('Este código já está em outra lista deste produto.')).toBeInTheDocument()
    })

    it('ligar "Embalagem de compra" numa embalagem desliga na outra', async () => {
      const fardo = embalagemDaApi({ id: 'emb-fd', unidade: resumo(KG), quantidade: 12, preco: null, deCompra: true })
      renderEdicao({ ...NEXGARD, embalagens: [CAIXA_COM_3, fardo] })
      await esperarFormulario()

      const compraDaCaixa = within(bloco('CX c/ 3 UN')).getByRole('switch', { name: 'Embalagem de compra' })
      const compraDoFardo = within(bloco('KG c/ 12 UN')).getByRole('switch', { name: 'Embalagem de compra' })
      expect(compraDoFardo).toHaveAttribute('aria-checked', 'true')

      fireEvent.click(compraDaCaixa)

      expect(compraDaCaixa).toHaveAttribute('aria-checked', 'true')
      expect(compraDoFardo).toHaveAttribute('aria-checked', 'false')
    })

    it('remover tira a embalagem da lista e do request', async () => {
      atualizarProdutoMock.mockResolvedValue(NEXGARD)
      renderEdicao({ ...NEXGARD, embalagens: [CAIXA_COM_3] })
      await esperarFormulario()

      fireEvent.click(within(secaoEmbalagens()).getByRole('button', { name: 'Remover embalagem CX c/ 3 UN' }))

      expect(within(secaoEmbalagens()).queryByRole('group')).not.toBeInTheDocument()
      await waitFor(() => expect(botaoAdicionarEmbalagem()).toHaveFocus())
      fireEvent.click(botaoSalvar())
      await waitFor(() =>
        expect(atualizarProdutoMock).toHaveBeenCalledWith(ID_ARROZ, expect.objectContaining({ embalagens: [] })),
      )
    })

    it('com 10 embalagens, o botão sai e o limite é explicado', async () => {
      const dez = Array.from({ length: 10 }, (_, i) =>
        embalagemDaApi({ id: `emb-${i}`, unidade: resumo(CX), quantidade: i + 2, preco: null }),
      )
      renderEdicao({ ...NEXGARD, embalagens: dez })
      await esperarFormulario()

      expect(within(secaoEmbalagens()).queryByRole('button', { name: 'Adicionar embalagem' })).not.toBeInTheDocument()
      expect(within(secaoEmbalagens()).getByText('Limite de 10 embalagens atingido.')).toBeInTheDocument()
    })

    it('salvar envia as embalagens: a nova sem id e a mantida com id', async () => {
      atualizarProdutoMock.mockResolvedValue(NEXGARD)
      renderEdicao({ ...NEXGARD, embalagens: [CAIXA_COM_3] })
      await esperarFormulario()

      await adicionarCaixa('12')
      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          ID_ARROZ,
          expect.objectContaining({
            embalagens: [
              { id: 'emb-cx3', unidadeId: 'cx', quantidade: 3, preco: 209.9, deCompra: false, codigosBarras: ['7891000100103'] },
              { unidadeId: 'cx', quantidade: 12, preco: null, deCompra: false, codigosBarras: [] },
            ],
          }),
        ),
      )
    })

    it('o código digitado e não adicionado na embalagem entra ao salvar', async () => {
      atualizarProdutoMock.mockResolvedValue(NEXGARD)
      renderEdicao({ ...NEXGARD, embalagens: [CAIXA_COM_3] })
      await esperarFormulario()

      fireEvent.change(within(bloco('CX c/ 3 UN')).getByLabelText('Adicionar código'), { target: { value: 'CX-NEX' } })
      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          ID_ARROZ,
          expect.objectContaining({
            embalagens: [expect.objectContaining({ codigosBarras: ['7891000100103', 'CX-NEX'] })],
          }),
        ),
      )
    })

    it('erro do formulário na quantidade: rola até o campo, foca e conta no atalho', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      const caixa = await adicionarCaixa('1')
      scrollIntoViewMock.mockClear()

      fireEvent.click(botaoSalvar())

      const quantidade = within(caixa).getByLabelText(/^com/i)
      await waitFor(() => expect(quantidade).toHaveFocus())
      expect(rolados()).toEqual([quantidade])
      expect(quantidade).toHaveAccessibleDescription('A embalagem precisa conter mais de 1 UN.')
      expect(atalho(/embalagens/i)).toHaveAccessibleName('Embalagens (1 erro)')
      expect(atalho(/embalagens/i)).toHaveAttribute('aria-current', 'true')
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('fração numa unidade de venda não fracionada é barrada com a mensagem da API', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      const caixa = await adicionarCaixa('2,5')

      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(within(caixa).getByLabelText(/^com/i)).toHaveAccessibleDescription(
          'UN não aceita quantidade fracionada. Informe um número inteiro.',
        ),
      )
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('400 da API em embalagens[0].preco aparece no campo da embalagem certa', async () => {
      const mensagem = 'O preço da embalagem dá R$ 69,96 por UN, abaixo do preço mínimo (R$ 70,00).'
      atualizarProdutoMock.mockRejectedValue(new HttpError(400, 'Dados inválidos.', { 'embalagens[0].preco': mensagem }))
      renderEdicao({ ...NEXGARD, embalagens: [CAIXA_COM_3] })
      await esperarFormulario()

      fireEvent.click(botaoSalvar())

      const preco = within(bloco('CX c/ 3 UN')).getByLabelText(/^preço/i)
      await waitFor(() => expect(preco).toHaveFocus())
      expect(preco).toHaveAccessibleDescription(new RegExp(mensagem.replace(/[().$]/g, '\\$&')))
      expect(atalho(/embalagens/i)).toHaveAccessibleName('Embalagens (1 erro)')
      expect(screen.getByText('O produto não foi salvo. Confira o erro na seção Embalagens.')).toBeInTheDocument()
    })

    it('409 da API num código de embalagem aparece na lista de códigos dela', async () => {
      const mensagem = 'Este código já está em uso na embalagem CX c/ 3 UN do produto Bravecto.'
      atualizarProdutoMock.mockRejectedValue(
        new HttpError(409, mensagem, { 'embalagens[0].codigosBarras[0]': mensagem }),
      )
      renderEdicao({ ...NEXGARD, embalagens: [CAIXA_COM_3] })
      await esperarFormulario()

      fireEvent.click(botaoSalvar())

      expect(await within(bloco('CX c/ 3 UN')).findByText(mensagem)).toBeInTheDocument()
      await waitFor(() => expect(within(bloco('CX c/ 3 UN')).getByLabelText('Adicionar código')).toHaveFocus())
    })

    it('Estoque: o saldo mostra a conversão pela embalagem principal', async () => {
      const caixaDe18 = embalagemDaApi({ id: 'emb-cx18', unidade: resumo(CX), quantidade: 18, preco: null, deCompra: true })
      renderEdicao({ ...NEXGARD, estoqueAtual: 55, embalagens: [CAIXA_COM_3, caixaDe18] })
      await esperarFormulario()

      const saldo = screen.getByRole('group', { name: 'Saldo atual' })
      expect(within(saldo).getByText('55 UN (3 CX + 1 UN)')).toBeInTheDocument()
      expect(within(secao(/^estoque$/i)).queryByRole('heading', { name: 'Unidade e embalagem' })).not.toBeInTheDocument()
    })

    it('Estoque: sem embalagem, o saldo não muda', async () => {
      renderEdicao({ ...NEXGARD, estoqueAtual: 55 })
      await esperarFormulario()
      expect(within(screen.getByRole('group', { name: 'Saldo atual' })).getByText('55 UN')).toBeInTheDocument()
    })

    it('Códigos: com embalagem, aponta para a seção Embalagens', async () => {
      renderEdicao({ ...NEXGARD, embalagens: [CAIXA_COM_3] })
      await esperarFormulario()

      const codigos = secao(/^códigos$/i)
      expect(within(codigos).getByText(/os códigos de barras das embalagens ficam em/i)).toBeInTheDocument()
      const link = within(codigos).getByRole('link', { name: 'Embalagens' })
      expect(link).toHaveAttribute('href', '#secao-embalagens')
      scrollIntoViewMock.mockClear()
      fireEvent.click(link)
      expect(rolados()).toEqual([secaoEmbalagens()])
      expect(screen.getByRole('heading', { level: 2, name: 'Embalagens' })).toHaveFocus()
    })

    it('Códigos: sem embalagem, a linha não aparece', async () => {
      renderEdicao(NEXGARD)
      await esperarFormulario()
      expect(within(secao(/^códigos$/i)).queryByText(/os códigos de barras das embalagens/i)).not.toBeInTheDocument()
    })

    it('OPERADOR vê as embalagens só leitura, sem adicionar nem remover', async () => {
      definirPerfil('OPERADOR')
      renderEdicao({ ...NEXGARD, embalagens: [CAIXA_COM_3] })
      await esperarFormulario()

      const caixa = bloco('CX c/ 3 UN')
      expect(within(caixa).getByLabelText(/^unidade/i)).toBeDisabled()
      expect(within(caixa).getByLabelText(/^com/i)).toBeDisabled()
      expect(within(caixa).getByLabelText(/^preço/i)).toBeDisabled()
      expect(within(caixa).getByRole('switch', { name: 'Embalagem de compra' })).toBeDisabled()
      expect(within(caixa).getByLabelText('Adicionar código')).toBeDisabled()
      expect(within(secaoEmbalagens()).queryByRole('button', { name: /adicionar embalagem/i })).not.toBeInTheDocument()
      expect(within(secaoEmbalagens()).queryByRole('button', { name: /remover embalagem/i })).not.toBeInTheDocument()
    })

    it('OPERADOR sem embalagens vê o estado vazio sem o botão', async () => {
      definirPerfil('OPERADOR')
      renderEdicao(NEXGARD)
      await esperarFormulario()
      expect(within(secaoEmbalagens()).getByText('Nenhuma embalagem cadastrada.')).toBeInTheDocument()
      expect(within(secaoEmbalagens()).queryByRole('button')).not.toBeInTheDocument()
    })

    it('a unidade SC fracionada de venda aceita 25,5 e o rótulo usa vírgula', async () => {
      listarUnidadesMock.mockResolvedValue([...UNIDADES, SC, { ...KG, id: 'kgf', sigla: 'KGF', fracionada: true }])
      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Ração a granel', '12,99')
      await selecionarUnidadeVenda('kgf')

      fireEvent.click(botaoAdicionarEmbalagem())
      const novo = bloco('Nova embalagem')
      fireEvent.change(within(novo).getByLabelText(/^unidade/i), { target: { value: 'sc' } })
      fireEvent.change(within(novo).getByLabelText(/^com/i), { target: { value: '25,5' } })

      const saco = bloco('SC c/ 25,5 KGF')
      expect(within(saco).getByText('25,5 × R$ 12,99 = R$ 331,25')).toBeInTheDocument()
    })
  })

  describe('unidade e categoria', () => {
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

  describe('preços: margem, promoção e atacado (Fase C)', () => {
    const produtoComPromocao: Produto = {
      ...produtoAtivo,
      promocao: { preco: 22.9, inicio: '2026-11-01', fim: '2026-11-15', situacao: 'VIGENTE' },
      emPromocao: true,
      atacado: { preco: 21.5, quantidadeMinima: 12 },
    }

    function interruptorPromocao(): HTMLElement {
      return screen.getByRole('switch', { name: 'Ativar preço promocional' })
    }

    function interruptorAtacado(): HTMLElement {
      return screen.getByRole('switch', { name: 'Ativar preço de atacado' })
    }

    function preencherPromocao(preco: string, inicio: string, fim: string) {
      fireEvent.change(screen.getByLabelText('Preço promocional'), { target: { value: preco } })
      fireEvent.change(screen.getByLabelText('Início'), { target: { value: inicio } })
      fireEvent.change(screen.getByLabelText('Fim'), { target: { value: fim } })
    }

    describe('margem e markup em todos os preços (Fase B2)', () => {
      function derivadosDe(nome: RegExp): HTMLElement {
        return screen.getByRole('group', { name: nome })
      }

      it('mostra margem e markup ao lado do preço promocional, calculados sobre o custo', async () => {
        renderNovo()
        await esperarFormulario()
        await preencherMinimo('Café', '10,00')
        fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '6,00' } })
        fireEvent.click(interruptorPromocao())
        fireEvent.change(screen.getByLabelText('Preço promocional'), { target: { value: '8,90' } })

        const derivados = derivadosDe(/margem e markup do preço promocional/i)
        expect(within(derivados).getByText('32,58%')).toBeInTheDocument()
        expect(within(derivados).getByText('48,33%')).toBeInTheDocument()
      })

      it('mostra margem e markup ao lado do preço de atacado', async () => {
        renderNovo()
        await esperarFormulario()
        await preencherMinimo('Café', '10,00')
        fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '6,00' } })
        fireEvent.click(interruptorAtacado())
        fireEvent.change(screen.getByLabelText('Preço de atacado'), { target: { value: '8,90' } })

        const derivados = derivadosDe(/margem e markup do preço de atacado/i)
        expect(within(derivados).getByText('32,58%')).toBeInTheDocument()
        expect(within(derivados).getByText('48,33%')).toBeInTheDocument()
      })

      it('sem custo, a margem e o markup dos preços especiais aparecem como "—"', async () => {
        renderNovo()
        await esperarFormulario()
        await preencherMinimo('Café', '10,00')
        fireEvent.click(interruptorPromocao())
        fireEvent.change(screen.getByLabelText('Preço promocional'), { target: { value: '8,90' } })

        expect(within(derivadosDe(/margem e markup do preço promocional/i)).getAllByText('—')).toHaveLength(2)
      })

      it('a calculadora calcula pela margem (10 e 30% → R$ 14,29) ou pelo markup (10 e 30% → R$ 13,00)', async () => {
        renderNovo()
        await esperarFormulario()
        fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '10,00' } })
        expect(screen.getByRole('radio', { name: 'Pela margem' })).toBeChecked()

        fireEvent.change(screen.getByLabelText('Margem desejada (%)'), { target: { value: '30' } })
        fireEvent.click(screen.getByRole('button', { name: 'Calcular preço' }))
        expect(screen.getByLabelText(/preço de venda/i)).toHaveValue('14,29')
        expect(screen.getByText(/^preço de venda atualizado para R\$\s14,29 \(margem de 30%\)\.$/i)).toBeInTheDocument()

        fireEvent.click(screen.getByRole('radio', { name: 'Pelo markup' }))
        // Trocar a base tira a confirmacao anterior e o campo passa a ser o do markup.
        expect(screen.queryByText(/preço de venda atualizado/i)).not.toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Markup desejado (%)'), { target: { value: '30' } })
        fireEvent.click(screen.getByRole('button', { name: 'Calcular preço' }))

        expect(screen.getByLabelText(/preço de venda/i)).toHaveValue('13,00')
        expect(screen.getByText(/^preço de venda atualizado para R\$\s13,00 \(markup de 30%\)\.$/i)).toBeInTheDocument()
      })

      it('pelo markup aceita acima de 100% e barra fora de 0 a 9.999,99%', async () => {
        renderNovo()
        await esperarFormulario()
        fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '10,00' } })
        fireEvent.click(screen.getByRole('radio', { name: 'Pelo markup' }))
        const botao = screen.getByRole('button', { name: 'Calcular preço' })
        expect(botao).toHaveAccessibleDescription('Informe o markup desejado.')

        fireEvent.change(screen.getByLabelText('Markup desejado (%)'), { target: { value: '10000' } })
        expect(botao).toBeDisabled()
        expect(botao).toHaveAccessibleDescription('Informe um markup de 0% a 9.999,99%, com até 2 casas (ex.: 45,5).')

        fireEvent.change(screen.getByLabelText('Markup desejado (%)'), { target: { value: '150' } })
        fireEvent.click(botao)
        expect(screen.getByLabelText(/preço de venda/i)).toHaveValue('25,00')
      })

      it('explica margem e markup com os exemplos', async () => {
        renderNovo()
        await esperarFormulario()

        expect(
          screen.getByText(/quanto do preço de venda é lucro, \(preço − custo\) ÷ preço\. Vender a R\$\s15,00 algo que custou R\$\s10,00 dá 33,33%\./),
        ).toBeInTheDocument()
        expect(
          screen.getByText(/quanto se acrescenta sobre o custo, \(preço − custo\) ÷ custo\. O mesmo exemplo dá 50%\./),
        ).toBeInTheDocument()
        // No celular a explicacao recolhe: o botao diz se ela esta aberta.
        const alternar = screen.getByRole('button', { name: 'O que são margem e markup?' })
        expect(alternar).toHaveAttribute('aria-expanded', 'false')
        fireEvent.click(alternar)
        expect(alternar).toHaveAttribute('aria-expanded', 'true')
      })
    })

    it('avisa preço abaixo do custo na Geral, na Preços e nos blocos, sem impedir o salvamento', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café' })
      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Café', '10,00')
      fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '12,00' } })

      // Junto ao preco de venda (Geral) e no bloco de margem (Precos), agora na mesma tela.
      expect(
        screen.getAllByText(/^R\$\s2,00 abaixo do custo \(R\$\s12,00\)\. Vender por este preço dá prejuízo\.$/),
      ).toHaveLength(2)
      fireEvent.click(interruptorPromocao())
      preencherPromocao('8,00', '2026-11-01', '2026-11-15')
      expect(screen.getByLabelText('Preço promocional')).toHaveAccessibleDescription(/abaixo do custo/i)
      fireEvent.click(interruptorAtacado())
      fireEvent.change(screen.getByLabelText('Preço de atacado'), { target: { value: '9,00' } })
      fireEvent.change(screen.getByLabelText(/^quantidade mínima/i), { target: { value: '6' } })
      expect(screen.getByLabelText('Preço de atacado')).toHaveAccessibleDescription(/abaixo do custo/i)
      expect(screen.getByLabelText(/preço de venda/i)).toHaveAccessibleDescription(/abaixo do custo/i)

      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(
          expect.objectContaining({
            precoVenda: 10,
            custo: 12,
            promocao: { preco: 8, inicio: '2026-11-01', fim: '2026-11-15' },
            atacado: { preco: 9, quantidadeMinima: 6 },
          }),
        ),
      )
    })

    it('"Calcular preço" aplica a margem desejada ao preço de venda e confirma', async () => {
      renderNovo()
      await esperarFormulario()
      const botao = screen.getByRole('button', { name: 'Calcular preço' })
      expect(botao).toBeDisabled()
      expect(botao).toHaveAccessibleDescription('Informe o custo para calcular o preço.')

      fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '10,00' } })
      expect(botao).toHaveAccessibleDescription('Informe a margem desejada.')
      fireEvent.change(screen.getByLabelText('Margem desejada (%)'), { target: { value: '100' } })
      expect(botao).toBeDisabled()
      expect(botao).toHaveAccessibleDescription('A margem vai até 99,99%: 100% significaria custo zero.')
      expect(screen.getByLabelText('Margem desejada (%)')).toHaveAttribute('aria-invalid', 'true')
      fireEvent.change(screen.getByLabelText('Margem desejada (%)'), { target: { value: '50' } })
      expect(screen.getByLabelText('Margem desejada (%)')).not.toHaveAttribute('aria-invalid')
      expect(botao).toBeEnabled()

      fireEvent.click(botao)

      expect(screen.getByText(/^preço de venda atualizado para R\$\s20,00 \(margem de 50%\)\.$/i)).toBeInTheDocument()
      expect(screen.getByText('50,00%')).toBeInTheDocument()
      // Mudar o custo tira a confirmacao (o preco ja nao corresponde a ele).
      fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '10,001' } })
      expect(screen.queryByText(/preço de venda atualizado/i)).not.toBeInTheDocument()
      expect(screen.getByLabelText(/preço de venda/i)).toHaveValue('20,00')
    })

    it('preço calculado acima do limite tem dica própria', async () => {
      renderNovo()
      await esperarFormulario()
      fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '99.999.999,99' } })
      fireEvent.change(screen.getByLabelText('Margem desejada (%)'), { target: { value: '99,99' } })

      const botao = screen.getByRole('button', { name: 'Calcular preço' })
      expect(botao).toBeDisabled()
      expect(botao).toHaveAccessibleDescription('O preço calculado passa do limite permitido.')
    })

    it('"Calcular preço" deixa o produto como alterado: sair pede confirmação', async () => {
      renderEdicao()
      await esperarFormulario()
      fireEvent.change(screen.getByLabelText('Margem desejada (%)'), { target: { value: '50' } })
      fireEvent.click(screen.getByRole('button', { name: 'Calcular preço' }))

      fireEvent.click(screen.getByRole('link', { name: /voltar para produtos/i }))

      expect(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).toBeInTheDocument()
    })

    it('desligar a promoção esconde e limpa os campos, e o PATCH vai com promocao: null', async () => {
      atualizarProdutoMock.mockResolvedValue(produtoAtivo)
      renderEdicao(produtoComPromocao)
      await esperarFormulario()
      expect(interruptorPromocao()).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByLabelText('Preço promocional')).toHaveValue('22,90')

      fireEvent.click(interruptorPromocao())
      expect(interruptorPromocao()).toHaveAttribute('aria-checked', 'false')
      expect(screen.queryByLabelText('Preço promocional')).not.toBeInTheDocument()
      fireEvent.click(interruptorPromocao())
      expect(screen.getByLabelText('Preço promocional')).toHaveValue('')
      // Religar sugere o inicio hoje (Sao Paulo) e leva ao preco promocional.
      expect(screen.getByLabelText('Início')).toHaveValue(dataHojeSaoPaulo())
      expect(screen.getByLabelText('Fim')).toHaveValue('')
      await waitFor(() => expect(screen.getByLabelText('Preço promocional')).toHaveFocus())
      fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-11-10' } })
      expect(screen.getByLabelText('Fim')).toHaveAttribute('min', '2026-11-10')
      fireEvent.click(interruptorPromocao())

      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          ID_ARROZ,
          expect.objectContaining({ promocao: null, atacado: { preco: 21.5, quantidadeMinima: 12 } }),
        ),
      )
    })

    it('valida a promoção antes de enviar: fim antes do início leva à seção Preços', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Café', '10,00')
      fireEvent.click(interruptorPromocao())
      preencherPromocao('8,00', '2026-11-15', '2026-11-01')

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atalho(/preços/i)).toHaveAttribute('aria-current', 'true'))
      expect(atalho(/preços/i)).toHaveAccessibleName('Preços (1 erro)')
      expect(screen.getByLabelText('Fim')).toHaveAccessibleDescription('O fim da promoção não pode ser antes do início.')
      await waitFor(() => expect(screen.getByLabelText('Fim')).toHaveFocus())
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('mostra o selo da situação pela data de hoje, e "Remover promoção" desliga o bloco', async () => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date(2026, 10, 5, 12, 0))
      try {
        renderEdicao(produtoComPromocao)
        await esperarFormulario()
        expect(screen.getByText('Vigente até 15/11')).toHaveClass('bg-accent')
        expect(screen.queryByRole('button', { name: 'Remover promoção' })).not.toBeInTheDocument()

        fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-11-10' } })
        expect(screen.getByText('Agendada para 10/11')).toBeInTheDocument()
        expect(screen.queryByRole('button', { name: 'Remover promoção' })).not.toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2027-01-10' } })
        expect(screen.getByText('Agendada para 10/11')).toBeInTheDocument()
        fireEvent.change(screen.getByLabelText('Início'), { target: { value: '2026-10-01' } })
        fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '2026-10-15' } })
        expect(screen.getByText('Encerrada em 15/10. O produto voltou ao preço normal.')).toBeInTheDocument()

        fireEvent.click(screen.getByRole('button', { name: 'Remover promoção' }))
        expect(interruptorPromocao()).toHaveAttribute('aria-checked', 'false')
        expect(interruptorPromocao()).toHaveFocus()
        expect(screen.queryByLabelText('Preço promocional')).not.toBeInTheDocument()
      } finally {
        vi.useRealTimers()
      }
    })

    it('400 em promocao.preco leva à seção Preços com o erro no campo (Review Focus 2)', async () => {
      const mensagem = 'Preço promocional deve ser menor que o preço de venda.'
      atualizarProdutoMock.mockRejectedValue(new HttpError(400, 'Dados invalidos.', { 'promocao.preco': mensagem }))
      renderEdicao(produtoComPromocao)
      await esperarFormulario()

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('O produto não foi salvo. Confira o erro na seção Preços.')).toBeInTheDocument()
      expect(atalho(/preços/i)).toHaveAttribute('aria-current', 'true')
      expect(atalho(/preços/i)).toHaveAccessibleName('Preços (1 erro)')
      expect(interruptorPromocao()).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByLabelText('Preço promocional')).toHaveAccessibleDescription(mensagem)
      await waitFor(() => expect(screen.getByLabelText('Preço promocional')).toHaveFocus())
    })

    it('erro do backend num campo do atacado liga o bloco para mostrá-lo', async () => {
      const mensagem = 'A unidade UN não aceita quantidade fracionada.'
      atualizarProdutoMock.mockRejectedValue(new HttpError(400, 'Dados invalidos.', { 'atacado.quantidadeMinima': mensagem }))
      renderEdicao()
      await esperarFormulario()

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText(mensagem)).toBeInTheDocument()
      expect(interruptorAtacado()).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByLabelText(/^quantidade mínima/i)).toHaveAccessibleDescription(mensagem)
    })

    it('atacado mostra a ajuda com a sigla e o preço', async () => {
      renderEdicao(produtoComPromocao)
      await esperarFormulario()

      expect(interruptorAtacado()).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByLabelText('Quantidade mínima (UN)')).toHaveValue(12)
      expect(screen.getByText(/^A partir de 12 UN, o preço passa a ser R\$\s21,50 por unidade\.$/)).toBeInTheDocument()
      // Com promocao e atacado ligados, a regra do menor preco.
      expect(screen.getByText('Se a promoção e o atacado valerem juntos, a venda usa o menor preço.')).toBeInTheDocument()
      fireEvent.click(interruptorPromocao())
      expect(screen.queryByText(/a venda usa o menor preço/)).not.toBeInTheDocument()
    })

    it('quantidade fracionada no atacado com unidade não fracionada é barrada antes de enviar', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Café', '10,00')
      fireEvent.click(interruptorAtacado())
      fireEvent.change(screen.getByLabelText('Preço de atacado'), { target: { value: '9,00' } })
      fireEvent.change(screen.getByLabelText(/^quantidade mínima/i), { target: { value: '2.5' } })

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atalho(/preços/i)).toHaveAttribute('aria-current', 'true'))
      expect(screen.getByLabelText(/^quantidade mínima/i)).toHaveAccessibleDescription(
        'A unidade UN não aceita quantidade fracionada.',
      )
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('produto antigo, sem promoção nem atacado, salva com os dois nulos (Review Focus 5)', async () => {
      atualizarProdutoMock.mockResolvedValue(produtoAtivo)
      renderEdicao()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Arroz 5kg Tipo 1' } })

      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          ID_ARROZ,
          expect.objectContaining({ nome: 'Arroz 5kg Tipo 1', promocao: null, atacado: null }),
        ),
      )
    })
  })

  describe('seção Histórico (preços)', () => {
    const alteracaoPreco: HistoricoPreco = {
      campo: 'PRECO_VENDA',
      valorAnterior: 10,
      valorNovo: 11.5,
      usuarioNome: 'Ana Souza',
      alteradoEm: '2026-10-21T14:03:12',
      embalagemRotulo: null,
    }
    const cadastroCusto: HistoricoPreco = {
      campo: 'CUSTO',
      valorAnterior: null,
      valorNovo: 8,
      usuarioNome: 'Bruno Lima',
      alteradoEm: '2026-10-20T09:05:00',
      embalagemRotulo: null,
    }

    function pagina(itens: HistoricoPreco[], numero: number, totalItens: number): PaginaResponse<HistoricoPreco> {
      return { itens, pagina: numero, tamanho: 20, totalItens }
    }

    function linhas(): HTMLElement[] {
      return within(screen.getByRole('list', { name: 'Alterações de preço e custo' })).getAllByRole('listitem')
    }

    it('não existe no cadastro de produto novo', async () => {
      renderNovo()
      await esperarFormulario()

      expect(within(barraDeAtalhos()).queryByRole('link', { name: /histórico/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('region', { name: /^histórico$/i })).not.toBeInTheDocument()
      expect(listarHistoricoDePrecosMock).not.toHaveBeenCalled()
    })

    it('só busca quando a seção se aproxima da tela', async () => {
      listarHistoricoDePrecosMock.mockResolvedValue(pagina([alteracaoPreco], 0, 1))
      renderEdicao()
      await esperarFormulario()

      expect(listarHistoricoDePrecosMock).not.toHaveBeenCalled()
      expect(listarMovimentosDeEstoqueMock).not.toHaveBeenCalled()
      mostrarHistorico()

      expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
      expect(listarHistoricoDePrecosMock).toHaveBeenCalledWith(ID_ARROZ, 0)
      const [linha] = linhas()
      expect(within(linha).getByText('Preço de venda')).toBeInTheDocument()
      expect(within(linha).getByText(/^R\$\s10,00 → R\$\s11,50$/)).toHaveAttribute('aria-hidden', 'true')
      // Leitor de tela ouve "de X para Y" no lugar da seta.
      expect(within(linha).getByText(/^de R\$\s10,00 para R\$\s11,50$/)).toHaveClass('sr-only')
      expect(within(linha).getByText('+15,00%')).toBeInTheDocument()
      expect(within(linha).getByText('21/10/2026 14:03')).toBeInTheDocument()
    })

    it('sem valor anterior (cadastro), mostra "(valor inicial)" e a coluna de variação vazia', async () => {
      listarHistoricoDePrecosMock.mockResolvedValue(pagina([cadastroCusto], 0, 1))
      renderEdicao()
      await esperarFormulario()
      mostrarHistorico()

      expect(await screen.findByText('Bruno Lima')).toBeInTheDocument()
      const [linha] = linhas()
      expect(within(linha).getByText('Custo')).toBeInTheDocument()
      expect(within(linha).getByText(/^R\$\s8,00 \(valor inicial\)$/)).toBeInTheDocument()
      expect(within(linha).queryByText(/%$/)).not.toBeInTheDocument()
    })

    it('"Carregar mais" busca a próxima página enquanto houver itens', async () => {
      listarHistoricoDePrecosMock
        .mockResolvedValueOnce(pagina([alteracaoPreco], 0, 2))
        .mockResolvedValueOnce(pagina([cadastroCusto], 1, 2))
      renderEdicao()
      await esperarFormulario()
      mostrarHistorico()
      expect(await screen.findByText('Ana Souza')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }))

      expect(await screen.findByText('Bruno Lima')).toBeInTheDocument()
      expect(listarHistoricoDePrecosMock).toHaveBeenLastCalledWith(ID_ARROZ, 1)
      expect(linhas()).toHaveLength(2)
      expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()
    })

    it('mostra carregando e, sem alterações, o estado vazio', async () => {
      let responder: (valor: PaginaResponse<HistoricoPreco>) => void = () => {}
      listarHistoricoDePrecosMock.mockReturnValue(new Promise((resolve) => (responder = resolve)))
      renderEdicao()
      await esperarFormulario()
      mostrarHistorico()

      expect(screen.getByText('Carregando histórico de preços...')).toBeInTheDocument()
      await act(async () => responder(pagina([], 0, 0)))

      expect(await screen.findByText('Nenhuma alteração de preço ou custo registrada ainda.')).toBeInTheDocument()
      expect(
        screen.getByText('As próximas mudanças de custo e preço de venda aparecem aqui, com data e quem alterou.'),
      ).toBeInTheDocument()
    })

    it('falha ao carregar mostra erro amigável e "Tentar de novo"', async () => {
      listarHistoricoDePrecosMock
        .mockRejectedValueOnce(new HttpError(500, 'NullPointerException em HistoricoService'))
        .mockResolvedValueOnce(pagina([alteracaoPreco], 0, 1))
      renderEdicao()
      await esperarFormulario()
      mostrarHistorico()

      expect(await screen.findByText('Não foi possível carregar o histórico de preços.')).toBeInTheDocument()
      expect(screen.queryByText(/NullPointer/)).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

      expect(await screen.findByText('Ana Souza')).toBeInTheDocument()
      // O botao fica dentro do formulario do produto: tentar de novo nao salva.
      expect(atualizarProdutoMock).not.toHaveBeenCalled()
    })

    it('salvar invalida o histórico do produto no cache (pelo prefixo de produtos)', async () => {
      atualizarProdutoMock.mockResolvedValue(produtoAtivo)
      const queryClient = novoQueryClient()
      const chave = [...PRODUTOS_QUERY_KEY, ID_ARROZ, 'historico-precos']
      queryClient.setQueryData(chave, { pages: [pagina([alteracaoPreco], 0, 1)], pageParams: [0] })
      buscarProdutoMock.mockResolvedValue(produtoAtivo)
      renderPagina(`/produtos/${ID_ARROZ}`, undefined, queryClient)
      await esperarFormulario()
      expect(queryClient.getQueryState(chave)?.isInvalidated).toBe(false)

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(queryClient.getQueryState(chave)?.isInvalidated).toBe(true))
    })

    it('valor novo nulo (custo removido) mostra "sem custo"', async () => {
      listarHistoricoDePrecosMock.mockResolvedValue(
        pagina([{ ...cadastroCusto, valorAnterior: 5, valorNovo: null }], 0, 1),
      )
      renderEdicao()
      await esperarFormulario()
      mostrarHistorico()

      expect(await screen.findByText(/^R\$\s5,00 → sem custo$/)).toBeInTheDocument()
    })

    describe('linhas das embalagens (Fase B3)', () => {
      const precoDaCaixa: HistoricoPreco = {
        campo: 'PRECO_EMBALAGEM',
        valorAnterior: 209.9,
        valorNovo: 199.9,
        embalagemRotulo: 'CX c/ 3 UN',
        usuarioNome: 'Ana Souza',
        alteradoEm: '2026-10-24T10:00:00',
      }

      it('mostra o preço da embalagem com o rótulo e os valores', async () => {
        listarHistoricoDePrecosMock.mockResolvedValue(pagina([precoDaCaixa], 0, 1))
        renderEdicao()
        await esperarFormulario()
        mostrarHistorico()

        await screen.findByText('Ana Souza')
        const [linha] = linhas()
        expect(within(linha).getByText('Preço da embalagem CX c/ 3 UN')).toBeInTheDocument()
        expect(within(linha).getByText(/^R\$\s209,90 → R\$\s199,90$/)).toHaveAttribute('aria-hidden', 'true')
        expect(within(linha).getByText('-4,76%')).toBeInTheDocument()
      })

      it('preço apagado (ou embalagem removida) aparece como "sem preço próprio"; o criado, a partir dele', async () => {
        listarHistoricoDePrecosMock.mockResolvedValue(
          pagina(
            [
              { ...precoDaCaixa, valorAnterior: 209.9, valorNovo: null },
              { ...precoDaCaixa, valorAnterior: null, valorNovo: 209.9 },
            ],
            0,
            2,
          ),
        )
        renderEdicao()
        await esperarFormulario()
        mostrarHistorico()

        await screen.findAllByText('Ana Souza')
        const [apagado, criado] = linhas()
        expect(within(apagado).getByText(/^R\$\s209,90 → sem preço próprio$/)).toBeInTheDocument()
        expect(within(apagado).getByText(/^de R\$\s209,90 para sem preço próprio$/)).toHaveClass('sr-only')
        expect(within(criado).getByText(/^sem preço próprio → R\$\s209,90$/)).toBeInTheDocument()
      })
    })
  })

  describe('preços: teclado e revalidação entre campos', () => {
    it('Enter em "Margem desejada" calcula o preço sem salvar; Ctrl+Enter salva', async () => {
      atualizarProdutoMock.mockResolvedValue(produtoAtivo)
      renderEdicao()
      await esperarFormulario()
      const margem = screen.getByLabelText('Margem desejada (%)')
      fireEvent.change(margem, { target: { value: '50' } })

      expect(fireEvent.keyDown(margem, { key: 'Enter' })).toBe(false)

      expect(screen.getByText(/preço de venda atualizado para R\$\s36,00/i)).toBeInTheDocument()
      expect(atualizarProdutoMock).not.toHaveBeenCalled()

      fireEvent.keyDown(margem, { key: 'Enter', ctrlKey: true })
      await waitFor(() =>
        expect(atualizarProdutoMock).toHaveBeenCalledWith(ID_ARROZ, expect.objectContaining({ precoVenda: 36 })),
      )
    })

    it('Enter em "Margem desejada" sem como calcular só mantém a dica', async () => {
      renderNovo()
      await esperarFormulario()
      const margem = screen.getByLabelText('Margem desejada (%)')
      fireEvent.change(margem, { target: { value: '50' } })

      expect(fireEvent.keyDown(margem, { key: 'Enter' })).toBe(false)

      expect(screen.getByRole('button', { name: 'Calcular preço' })).toHaveAccessibleDescription(
        'Informe o custo para calcular o preço.',
      )
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('depois do envio, mudar o preço de venda revalida o preço mínimo', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Café', '10,00')
      fireEvent.change(screen.getByLabelText(/preço mínimo/i), { target: { value: '15,00' } })
      fireEvent.click(botaoSalvar())
      expect(await screen.findByText(/preço mínimo não pode ser maior que o preço de venda/i)).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '20,00' } })

      await waitFor(() => expect(atalho(/preços/i)).toHaveAccessibleName('Preços'))
    })

    it('trocar a unidade de venda apaga o erro de fração do atacado', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo('Café', '10,00')
      fireEvent.click(screen.getByRole('switch', { name: 'Ativar preço de atacado' }))
      fireEvent.change(screen.getByLabelText('Preço de atacado'), { target: { value: '9,00' } })
      fireEvent.change(screen.getByLabelText(/^quantidade mínima/i), { target: { value: '2.5' } })
      fireEvent.click(botaoSalvar())
      await waitFor(() => expect(atalho(/preços/i)).toHaveAccessibleName('Preços (1 erro)'))

      fireEvent.change(screen.getByLabelText(/unidade de venda/i), { target: { value: 'kg' } })

      await waitFor(() => expect(atalho(/preços/i)).toHaveAccessibleName('Preços'))
    })
  })

  describe('preços: cenários do QA (Fase C)', () => {
    const produtoComPromocao: Produto = {
      ...produtoAtivo,
      promocao: { preco: 22.9, inicio: '2026-11-01', fim: '2026-11-15', situacao: 'VIGENTE' },
      emPromocao: true,
      atacado: null,
    }

    function interruptorPromocao(): HTMLElement {
      return screen.getByRole('switch', { name: 'Ativar preço promocional' })
    }

    it('baixar o preço de venda até a promoção barra o envio no campo promocional (Review Focus 2)', async () => {
      renderEdicao(produtoComPromocao)
      await esperarFormulario()
      fireEvent.change(screen.getByLabelText(/preço de venda/i), { target: { value: '22,90' } })

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atalho(/preços/i)).toHaveAttribute('aria-current', 'true'))
      expect(interruptorPromocao()).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByLabelText('Preço promocional')).toHaveAccessibleDescription(
        'Preço promocional deve ser menor que o preço de venda.',
      )
      await waitFor(() => expect(screen.getByLabelText('Preço promocional')).toHaveFocus())
      expect(atualizarProdutoMock).not.toHaveBeenCalled()
    })

    it('400 em promocao.inicio com o bloco desligado liga a promoção e marca o Início', async () => {
      const mensagem = 'Informe o início da promoção.'
      atualizarProdutoMock.mockRejectedValue(new HttpError(400, 'Dados invalidos.', { 'promocao.inicio': mensagem }))
      renderEdicao()
      await esperarFormulario()

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('O produto não foi salvo. Confira o erro na seção Preços.')).toBeInTheDocument()
      expect(interruptorPromocao()).toHaveAttribute('aria-checked', 'true')
      expect(screen.getByLabelText('Início')).toHaveAccessibleDescription(mensagem)
      await waitFor(() => expect(screen.getByLabelText('Início')).toHaveFocus())
    })

    it('produto em KG com atacado a partir de 2,5 trocado para UN é barrado no campo (Review Focus 3)', async () => {
      const kgFracionado = { ...KG, fracionada: true }
      listarUnidadesMock.mockResolvedValue([CX, kgFracionado, PCT_INATIVA, UN])
      renderEdicao({
        ...produtoAtivo,
        unidade: resumo(kgFracionado),
        atacado: { preco: 21.5, quantidadeMinima: 2.5 },
      })
      await esperarFormulario()
      await selecionarUnidadeVenda('un')

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atalho(/preços/i)).toHaveAttribute('aria-current', 'true'))
      expect(screen.getByLabelText(/^quantidade mínima/i)).toHaveAccessibleDescription(
        'A unidade UN não aceita quantidade fracionada.',
      )
      expect(atualizarProdutoMock).not.toHaveBeenCalled()
    })

    it('o aviso de abaixo do custo some quando o preço chega ao custo', async () => {
      renderNovo()
      await esperarFormulario()
      fireEvent.change(screen.getByLabelText(/^custo/i), { target: { value: '12,00' } })
      const preco = screen.getByLabelText(/preço de venda/i)
      fireEvent.change(preco, { target: { value: '10,00' } })
      expect(preco).toHaveAccessibleDescription(/abaixo do custo/i)

      fireEvent.change(preco, { target: { value: '12,00' } })

      expect(preco).not.toHaveAccessibleDescription(/abaixo do custo/i)
      expect(screen.queryByText(/abaixo do custo/i)).not.toBeInTheDocument()
    })

    it('desligar o interruptor apaga o erro do servidor e o próximo save envia promocao: null', async () => {
      atualizarProdutoMock
        .mockRejectedValueOnce(
          new HttpError(400, 'Dados invalidos.', {
            'promocao.preco': 'Preço promocional deve ser menor que o preço de venda.',
          }),
        )
        .mockResolvedValueOnce(produtoAtivo)
      renderEdicao(produtoComPromocao)
      await esperarFormulario()
      fireEvent.click(botaoSalvar())
      await waitFor(() => expect(atalho(/preços/i)).toHaveAccessibleName('Preços (1 erro)'))

      fireEvent.click(interruptorPromocao())

      expect(atalho(/preços/i)).toHaveAccessibleName('Preços')
      fireEvent.click(botaoSalvar())
      await waitFor(() => expect(atualizarProdutoMock).toHaveBeenCalledTimes(2))
      expect(atualizarProdutoMock).toHaveBeenLastCalledWith(ID_ARROZ, expect.objectContaining({ promocao: null }))
    })

    it('falha no "Carregar mais" do histórico mostra a mensagem sem apagar a lista', async () => {
      const linha: HistoricoPreco = {
        campo: 'PRECO_VENDA',
        valorAnterior: 10,
        valorNovo: 11.5,
        usuarioNome: 'Ana Souza',
        alteradoEm: '2026-10-21T14:03:12',
        embalagemRotulo: null,
      }
      listarHistoricoDePrecosMock
        .mockResolvedValueOnce({ itens: [linha], pagina: 0, tamanho: 20, totalItens: 2 })
        .mockRejectedValueOnce(new HttpError(500, 'Falha interna no banco'))
      renderEdicao()
      await esperarFormulario()
      mostrarHistorico()
      expect(await screen.findByText('Ana Souza')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }))

      expect(
        await screen.findByText('Não foi possível carregar mais alterações. Tente de novo.'),
      ).toBeInTheDocument()
      expect(screen.getByText('Ana Souza')).toBeInTheDocument()
      expect(screen.queryByText(/falha interna/i)).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Carregar mais' })).toBeEnabled()
    })
  })

  describe('seção Estoque (Fase D)', () => {
    const KG_FRACIONADA = { ...KG, fracionada: true }

    function interruptorControle(): HTMLElement {
      return screen.getByRole('switch', { name: 'Controlar estoque' })
    }

    it('cadastro novo: controle ligado e "Estoque inicial (opcional)" com a sigla, sem saldo', async () => {
      renderNovo()
      await esperarFormulario()
      await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toHaveValue('un'))

      expect(interruptorControle()).toHaveAttribute('aria-checked', 'true')
      const campo = screen.getByLabelText('Estoque inicial (opcional)')
      expect(campo).toHaveAttribute('inputmode', 'decimal')
      expect(campo).toHaveAccessibleDescription(/UN/)
      expect(screen.queryByRole('group', { name: 'Saldo atual' })).not.toBeInTheDocument()
      // Niveis tambem aceitam virgula: texto com teclado decimal, nao type="number".
      expect(screen.getByLabelText(/estoque mínimo/i)).toHaveAttribute('inputmode', 'decimal')
      expect(screen.getByLabelText(/estoque mínimo/i)).toHaveAttribute('type', 'text')
    })

    it('edição: mostra o saldo só leitura com o selo da situação, sem o estoque inicial', async () => {
      renderEdicao({ ...produtoAtivo, estoqueAtual: 8, situacaoEstoque: 'BAIXO' })
      await esperarFormulario()

      const saldo = screen.getByRole('group', { name: 'Saldo atual' })
      expect(within(saldo).getByText('8 UN')).toBeInTheDocument()
      expect(within(saldo).getByText('Estoque baixo')).toBeInTheDocument()
      expect(screen.queryByLabelText('Estoque inicial (opcional)')).not.toBeInTheDocument()
    })

    it('situação normal não tem selo', async () => {
      renderEdicao()
      await esperarFormulario()

      const saldo = screen.getByRole('group', { name: 'Saldo atual' })
      expect(within(saldo).getByText('12 UN')).toBeInTheDocument()
      expect(within(saldo).queryByText(/estoque baixo|sem estoque/i)).not.toBeInTheDocument()
    })

    it('desligar o controle esconde o estoque inicial e os níveis; religar mostra de novo', async () => {
      renderNovo()
      await esperarFormulario()

      fireEvent.click(interruptorControle())

      expect(interruptorControle()).toHaveAttribute('aria-checked', 'false')
      expect(screen.queryByLabelText('Estoque inicial (opcional)')).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/estoque mínimo/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/ponto de reposição/i)).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/estoque máximo/i)).not.toBeInTheDocument()

      fireEvent.click(interruptorControle())
      expect(screen.getByLabelText('Estoque inicial (opcional)')).toBeInTheDocument()
      expect(screen.getByLabelText(/estoque mínimo/i)).toBeInTheDocument()
    })

    it('desligar um produto salvo com saldo avisa que o saldo fica guardado (Review Focus 4)', async () => {
      atualizarProdutoMock.mockResolvedValue({ ...produtoAtivo, controlaEstoque: false, situacaoEstoque: null })
      renderEdicao()
      await esperarFormulario()

      fireEvent.click(interruptorControle())

      expect(screen.queryByRole('group', { name: 'Saldo atual' })).not.toBeInTheDocument()
      expect(
        screen.getByText(
          'Ao salvar, o saldo de 12 UN deixa de aparecer e de ser atualizado. Ele fica guardado e volta se você religar o controle.',
        ),
      ).toBeInTheDocument()

      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(atualizarProdutoMock).toHaveBeenCalledWith(ID_ARROZ, expect.objectContaining({ controlaEstoque: false })),
      )
      expect(atualizarProdutoMock.mock.calls[0][1]).not.toHaveProperty('estoqueInicial')
    })

    it('desligar um produto com saldo zero não mostra o aviso', async () => {
      renderEdicao({ ...produtoAtivo, estoqueAtual: 0, situacaoEstoque: 'SEM_ESTOQUE' })
      await esperarFormulario()

      fireEvent.click(interruptorControle())

      expect(screen.queryByText(/fica guardado/)).not.toBeInTheDocument()
    })

    it('produto salvo sem controle abre com o interruptor desligado e sem aviso', async () => {
      renderEdicao({ ...produtoAtivo, controlaEstoque: false, situacaoEstoque: null })
      await esperarFormulario()

      expect(interruptorControle()).toHaveAttribute('aria-checked', 'false')
      expect(screen.queryByRole('group', { name: 'Saldo atual' })).not.toBeInTheDocument()
      expect(screen.queryByText(/fica guardado/)).not.toBeInTheDocument()
    })

    it('"2,5" em KG vai no POST como estoqueInicial: 2.5 (Review Focus 5)', async () => {
      listarUnidadesMock.mockResolvedValue([CX, KG_FRACIONADA, PCT_INATIVA, UN])
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      await selecionarUnidadeVenda('kg')
      expect(screen.getByLabelText('Estoque inicial (opcional)')).toHaveAccessibleDescription(/KG/)
      fireEvent.change(screen.getByLabelText('Estoque inicial (opcional)'), { target: { value: '2,5' } })
      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '1,5' } })

      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(
          expect.objectContaining({ unidadeId: 'kg', controlaEstoque: true, estoqueInicial: 2.5, estoqueMinimo: 1.5 }),
        ),
      )
    })

    it('"2,5" em UN mostra o erro de fração no campo, sem enviar (Review Focus 5)', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText('Estoque inicial (opcional)'), { target: { value: '2,5' } })

      fireEvent.click(botaoSalvar())

      expect(await screen.findByText('A unidade UN não aceita quantidade fracionada.')).toBeInTheDocument()
      expect(atalho(/estoque/i)).toHaveAttribute('aria-current', 'true')
      await waitFor(() => expect(screen.getByLabelText('Estoque inicial (opcional)')).toHaveFocus())
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('com o controle desligado, o POST vai com controlaEstoque: false e sem estoque inicial', async () => {
      cadastrarProdutoMock.mockResolvedValue({ ...produtoAtivo, nome: 'Café 500g' })
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText('Estoque inicial (opcional)'), { target: { value: '3' } })
      fireEvent.click(interruptorControle())

      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(cadastrarProdutoMock).toHaveBeenCalledWith(
          expect.objectContaining({ controlaEstoque: false, estoqueInicial: null }),
        ),
      )
    })

    it('barra o ponto de reposição abaixo do mínimo na seção Estoque', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '5' } })
      fireEvent.change(screen.getByLabelText(/ponto de reposição/i), { target: { value: '3' } })

      fireEvent.click(botaoSalvar())

      expect(
        await screen.findByText('O ponto de reposição não pode ser menor que o estoque mínimo.'),
      ).toBeInTheDocument()
      expect(cadastrarProdutoMock).not.toHaveBeenCalled()
    })

    it('400 do servidor em pontoReposicao leva à seção Estoque com o erro no campo', async () => {
      atualizarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', {
          pontoReposicao: 'O ponto de reposição não pode ser menor que o estoque mínimo.',
        }),
      )
      renderEdicao()
      await esperarFormulario()

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atalho(/estoque/i)).toHaveAttribute('aria-current', 'true'))
      expect(atalho(/estoque/i)).toHaveAccessibleName('Estoque (1 erro)')
      expect(screen.getByText('O ponto de reposição não pode ser menor que o estoque mínimo.')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText(/ponto de reposição/i)).toHaveFocus())
    })

    it('erro num nível guardado aparece mesmo com o controle desligado', async () => {
      atualizarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', {
          estoqueMaximo: 'O estoque máximo não pode ser menor que o ponto de reposição.',
        }),
      )
      renderEdicao({ ...produtoAtivo, controlaEstoque: false, situacaoEstoque: null })
      await esperarFormulario()

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atalho(/estoque/i)).toHaveAttribute('aria-current', 'true'))
      expect(screen.getByLabelText(/estoque máximo/i)).toBeInTheDocument()
      expect(screen.getByText('O estoque máximo não pode ser menor que o ponto de reposição.')).toBeInTheDocument()
      expect(interruptorControle()).toHaveAttribute('aria-checked', 'false')
      expect(screen.getByText('Corrija ou apague estes valores para salvar.')).toBeInTheDocument()

      // Corrigir o valor nao tira o campo da tela (o foco nao some no meio da edicao).
      const maximo = screen.getByLabelText(/estoque máximo/i)
      maximo.focus()
      fireEvent.change(maximo, { target: { value: '' } })

      expect(screen.getByLabelText(/estoque máximo/i)).toBe(maximo)
      expect(maximo).toHaveFocus()
      await waitFor(() =>
        expect(screen.queryByText('O estoque máximo não pode ser menor que o ponto de reposição.')).not.toBeInTheDocument(),
      )
      expect(screen.getByLabelText(/estoque máximo/i)).toBe(maximo)

      // Religar o controle volta ao normal (e desligar de novo esconde os niveis, agora sem erro).
      fireEvent.click(interruptorControle())
      fireEvent.click(interruptorControle())
      expect(screen.queryByLabelText(/estoque máximo/i)).not.toBeInTheDocument()
    })

    it('os níveis mostram a sigla da unidade de venda e explicam o selo de estoque baixo', async () => {
      renderEdicao()
      await esperarFormulario()

      expect(screen.getByLabelText('Estoque mínimo em UN (opcional)')).toBeInTheDocument()
      expect(screen.getByLabelText('Ponto de reposição em UN (opcional)')).toBeInTheDocument()
      expect(screen.getByLabelText('Estoque máximo em UN (opcional)')).toBeInTheDocument()
      expect(
        screen.getByText(
          'O selo Estoque baixo aparece quando o saldo chega ao ponto de reposição (ou ao mínimo, se o ponto estiver vazio).',
        ),
      ).toBeInTheDocument()
    })

    it('depois do envio, mudar o mínimo revalida o ponto de reposição e o máximo', async () => {
      renderNovo()
      await esperarFormulario()
      await preencherMinimo()
      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '5' } })
      fireEvent.change(screen.getByLabelText(/ponto de reposição/i), { target: { value: '3' } })
      fireEvent.click(botaoSalvar())
      expect(
        await screen.findByText('O ponto de reposição não pode ser menor que o estoque mínimo.'),
      ).toBeInTheDocument()

      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '2' } })

      await waitFor(() =>
        expect(screen.queryByText('O ponto de reposição não pode ser menor que o estoque mínimo.')).not.toBeInTheDocument(),
      )

      fireEvent.change(screen.getByLabelText(/estoque máximo/i), { target: { value: '1' } })
      expect(
        await screen.findByText('O estoque máximo não pode ser menor que o ponto de reposição.'),
      ).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText(/ponto de reposição/i), { target: { value: '1' } })
      await waitFor(() =>
        expect(screen.queryByText('O estoque máximo não pode ser menor que o ponto de reposição.')).not.toBeInTheDocument(),
      )
    })

    it('400 do servidor em unidadeId vai ao campo de unidade na seção Geral', async () => {
      atualizarProdutoMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', {
          unidadeId: 'Não é possível trocar a unidade de um produto com movimentação de estoque.',
        }),
      )
      renderEdicao()
      await esperarFormulario()

      fireEvent.click(botaoSalvar())

      await waitFor(() => expect(atalho(/geral/i)).toHaveAttribute('aria-current', 'true'))
      expect(
        screen.getByText('Não é possível trocar a unidade de um produto com movimentação de estoque.'),
      ).toBeInTheDocument()
      await waitFor(() => expect(screen.getByLabelText(/unidade de venda/i)).toHaveFocus())
    })

    it('o diálogo de exclusão avisa que o estoque inicial também será apagado', async () => {
      renderEdicao()
      await esperarFormulario()

      fireEvent.click(screen.getByRole('button', { name: /^excluir$/i }))

      const dialogo = await screen.findByRole('dialog', { name: 'Excluir Arroz 5kg?' })
      expect(within(dialogo).getByText('O estoque inicial de 12 UN também será apagado.')).toBeInTheDocument()
    })

    it('sem saldo, o diálogo de exclusão não fala de estoque', async () => {
      renderEdicao({ ...produtoAtivo, estoqueAtual: 0, situacaoEstoque: 'SEM_ESTOQUE' })
      await esperarFormulario()

      fireEvent.click(screen.getByRole('button', { name: /^excluir$/i }))

      const dialogo = await screen.findByRole('dialog', { name: 'Excluir Arroz 5kg?' })
      expect(within(dialogo).queryByText(/estoque inicial/)).not.toBeInTheDocument()
    })
  })

  describe('ajuste de estoque (Fase D)', () => {
    const SAIDA: MovimentoEstoque = {
      id: 'mov-1',
      tipo: 'SAIDA',
      motivo: 'PERDA_AVARIA',
      origem: 'AJUSTE_MANUAL',
      quantidade: -2,
      saldoAnterior: 12,
      saldoNovo: 10,
      observacao: null,
      usuarioNome: 'Ana Souza',
      criadoEm: '2026-10-21T15:20:00',
      embalagem: null,
    }

    function botaoAjustar(): HTMLElement {
      return screen.getByRole('button', { name: 'Ajustar estoque' })
    }

    /** O botao de confirmar do modal (o rotulo diz a acao, ex.: "Registrar saída"). */
    function confirmarNoModal() {
      const modal = screen.getByRole('dialog', { name: 'Ajustar estoque' })
      fireEvent.click(modal.querySelector('button[type="submit"]') as HTMLElement)
    }

    async function abrirEstoqueDaEdicao(produto: Produto = produtoAtivo) {
      renderEdicao(produto)
      await esperarFormulario()
    }

    function registrarSaidaDeDois() {
      const modal = screen.getByRole('dialog', { name: 'Ajustar estoque' })
      fireEvent.click(within(modal).getByRole('radio', { name: 'Saída' }))
      fireEvent.change(within(modal).getByRole('textbox', { name: /^quantidade/i }), { target: { value: '2' } })
      fireEvent.change(within(modal).getByRole('combobox', { name: /^motivo/i }), { target: { value: 'PERDA_AVARIA' } })
      return modal
    }


    it('o modal oferece as embalagens gravadas do produto (Fase B3)', async () => {
      const caixa = embalagemDaApi({ id: 'emb-cx18', unidade: resumo(CX), quantidade: 18, preco: null, deCompra: true })
      renderEdicao({ ...produtoAtivo, embalagens: [caixa] })
      await esperarFormulario()

      fireEvent.click(screen.getByRole('button', { name: /ajustar estoque/i }))

      const dialogo = await screen.findByRole('dialog', { name: 'Ajustar estoque' })
      expect(within(dialogo).getByRole('combobox', { name: /^em$/i })).toHaveValue('emb-cx18')
    })
    it('ADMIN vê "Ajustar estoque" no produto salvo com controle ligado', async () => {
      await abrirEstoqueDaEdicao()

      expect(botaoAjustar()).toBeEnabled()
      expect(botaoAjustar()).toHaveAttribute('type', 'button')
    })

    it('não aparece para OPERADOR, que ainda vê o saldo', async () => {
      definirPerfil('OPERADOR')
      await abrirEstoqueDaEdicao()

      expect(screen.getByRole('group', { name: 'Saldo atual' })).toHaveTextContent('12 UN')
      expect(screen.queryByRole('button', { name: 'Ajustar estoque' })).not.toBeInTheDocument()
    })

    it('não aparece no cadastro novo', async () => {
      renderNovo()
      await esperarFormulario()
      expect(screen.queryByRole('button', { name: 'Ajustar estoque' })).not.toBeInTheDocument()
    })

    it('desligar o controle na edição tira o botão da tela', async () => {
      await abrirEstoqueDaEdicao()

      fireEvent.click(screen.getByRole('switch', { name: 'Controlar estoque' }))

      expect(screen.queryByRole('button', { name: 'Ajustar estoque' })).not.toBeInTheDocument()
    })

    it('não aparece em produto salvo sem controle de estoque', async () => {
      await abrirEstoqueDaEdicao({ ...produtoAtivo, controlaEstoque: false, situacaoEstoque: null })
      expect(screen.queryByRole('button', { name: 'Ajustar estoque' })).not.toBeInTheDocument()
    })

    it('trocar a unidade de venda bloqueia o ajuste, com a dica alcançável pelo teclado', async () => {
      renderEdicao()
      await esperarFormulario()
      await selecionarUnidadeVenda('kg')

      expect(botaoAjustar()).toHaveAttribute('aria-disabled', 'true')
      expect(botaoAjustar()).toBeEnabled()
      expect(botaoAjustar()).toHaveAccessibleDescription(
        'Salve a mudança de controle ou de unidade antes de ajustar o estoque.',
      )
      fireEvent.click(botaoAjustar())
      expect(screen.queryByRole('dialog', { name: 'Ajustar estoque' })).not.toBeInTheDocument()
    })

    it('produto salvo sem controle e com saldo: ligar mostra o saldo e o ajuste fica bloqueado até salvar', async () => {
      await abrirEstoqueDaEdicao({ ...produtoAtivo, controlaEstoque: false, situacaoEstoque: null })

      fireEvent.click(screen.getByRole('switch', { name: 'Controlar estoque' }))

      expect(screen.getByRole('group', { name: 'Saldo atual' })).toHaveTextContent('12 UN')
      expect(botaoAjustar()).toHaveAttribute('aria-disabled', 'true')
      expect(botaoAjustar()).toHaveAccessibleDescription(
        'Salve a mudança de controle ou de unidade antes de ajustar o estoque.',
      )
    })

    it('desligar e religar o controle volta ao saldo, tira o aviso e libera o ajuste', async () => {
      await abrirEstoqueDaEdicao()
      const interruptor = screen.getByRole('switch', { name: 'Controlar estoque' })

      fireEvent.click(interruptor)
      expect(screen.getByText(/fica guardado/)).toBeInTheDocument()
      fireEvent.click(interruptor)

      expect(screen.getByRole('group', { name: 'Saldo atual' })).toHaveTextContent('12 UN')
      expect(screen.queryByText(/fica guardado/)).not.toBeInTheDocument()
      expect(botaoAjustar()).not.toHaveAttribute('aria-disabled')
    })

    it('outras alterações não bloqueiam: o ajuste mantém o que foi digitado e o formulário segue alterado', async () => {
      ajustarEstoqueMock.mockResolvedValue(SAIDA)
      atualizarProdutoMock.mockResolvedValue(produtoAtivo)
      renderEdicao()
      await esperarFormulario()
      fireEvent.change(campoNome(), { target: { value: 'Arroz Tio João 5kg' } })
      fireEvent.change(screen.getByLabelText(/estoque mínimo/i), { target: { value: '3' } })
      buscarProdutoMock.mockResolvedValue({ ...produtoAtivo, estoqueAtual: 10 })

      expect(botaoAjustar()).not.toHaveAttribute('aria-disabled')
      fireEvent.click(botaoAjustar())
      registrarSaidaDeDois()
      confirmarNoModal()

      expect(await screen.findByText('Saída de 2 UN registrada. Saldo: 10 UN.')).toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('group', { name: 'Saldo atual' })).toHaveTextContent('10 UN'))
      expect(screen.getByLabelText(/estoque mínimo/i)).toHaveValue('3')
      expect(campoNome()).toHaveValue('Arroz Tio João 5kg')

      fireEvent.click(botaoSalvar())

      await waitFor(() =>
        expect(atualizarProdutoMock).toHaveBeenCalledWith(
          ID_ARROZ,
          expect.objectContaining({ nome: 'Arroz Tio João 5kg', estoqueMinimo: 3 }),
        ),
      )
    })

    it('sucesso fecha o modal, mostra a mensagem e atualiza o saldo sem marcar o formulário', async () => {
      ajustarEstoqueMock.mockResolvedValue(SAIDA)
      await abrirEstoqueDaEdicao()
      buscarProdutoMock.mockResolvedValue({ ...produtoAtivo, estoqueAtual: 10 })

      fireEvent.click(botaoAjustar())
      registrarSaidaDeDois()
      confirmarNoModal()

      expect(await screen.findByText('Saída de 2 UN registrada. Saldo: 10 UN.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Ajustar estoque' })).not.toBeInTheDocument()
      await waitFor(() => expect(screen.getByRole('group', { name: 'Saldo atual' })).toHaveTextContent('10 UN'))
      // O ajuste nao e alteracao do formulario: sair nao pede confirmacao e salvar nao foi chamado.
      expect(botaoAjustar()).not.toHaveAttribute('aria-disabled')
      expect(atualizarProdutoMock).not.toHaveBeenCalled()
      await waitFor(() => expect(botaoAjustar()).toHaveFocus())
      fireEvent.click(screen.getByRole('link', { name: /voltar para produtos/i }))
      expect(await screen.findByRole('heading', { name: 'Lista de produtos' })).toBeInTheDocument()
    })

    it('o envio do formulário do modal confirma o ajuste e não envia o formulário do produto', async () => {
      ajustarEstoqueMock.mockResolvedValue(SAIDA)
      await abrirEstoqueDaEdicao()
      fireEvent.click(botaoAjustar())
      const modal = registrarSaidaDeDois()

      await act(async () => {
        fireEvent.submit(within(modal).getByRole('textbox', { name: /^quantidade/i }).closest('form') as HTMLFormElement)
      })

      await waitFor(() => expect(ajustarEstoqueMock).toHaveBeenCalledTimes(1))
      expect(atualizarProdutoMock).not.toHaveBeenCalled()
    })

    it('Ctrl+Enter dentro do modal não salva o produto', async () => {
      await abrirEstoqueDaEdicao()
      fireEvent.click(botaoAjustar())
      const modal = registrarSaidaDeDois()

      fireEvent.keyDown(within(modal).getByRole('textbox', { name: /^quantidade/i }), { key: 'Enter', ctrlKey: true })
      // O salvar do produto e assincrono (validacao do handleSubmit): espera antes de afirmar que nao houve.
      await act(async () => {})

      expect(atualizarProdutoMock).not.toHaveBeenCalled()
      expect(screen.getByRole('dialog', { name: 'Ajustar estoque' })).toBeInTheDocument()
    })
  })

  describe('seção Histórico (estoque, Fase D)', () => {
    const SAIDA: MovimentoEstoque = {
      id: 'mov-2',
      tipo: 'SAIDA',
      motivo: 'PERDA_AVARIA',
      origem: 'AJUSTE_MANUAL',
      quantidade: -2,
      saldoAnterior: 12,
      saldoNovo: 10,
      observacao: 'Caixa amassada',
      usuarioNome: 'Carla Dias',
      criadoEm: '2026-10-21T15:20:00',
      embalagem: null,
    }
    const INICIAL: MovimentoEstoque = {
      id: 'mov-1',
      tipo: 'ENTRADA',
      motivo: 'ESTOQUE_INICIAL',
      origem: 'CADASTRO',
      quantidade: 12,
      saldoAnterior: 0,
      saldoNovo: 12,
      observacao: null,
      usuarioNome: 'Davi Reis',
      criadoEm: '2026-10-20T09:00:00',
      embalagem: null,
    }

    function paginaDeMovimentos(
      itens: MovimentoEstoque[],
      numero: number,
      totalItens: number,
    ): PaginaResponse<MovimentoEstoque> {
      return { itens, pagina: numero, tamanho: 20, totalItens }
    }

    function linhasDeEstoque(): HTMLElement[] {
      return within(screen.getByRole('list', { name: 'Movimentações de estoque' })).getAllByRole('listitem')
    }

    /** Lista do Historico pelo titulo ("Movimentações de estoque" ou "Alterações de preço e custo"). */
    function blocoDoHistorico(nome: string): HTMLElement {
      return screen.getByRole('region', { name: nome })
    }

    beforeEach(() => {
      listarHistoricoDePrecosMock.mockResolvedValue({ itens: [], pagina: 0, tamanho: 20, totalItens: 0 })
    })

    it('o movimento informado em embalagens mostra o retrato junto da quantidade (Fase B3)', async () => {
      const compraEmCaixas: MovimentoEstoque = {
        ...SAIDA,
        id: 'mov-3',
        tipo: 'ENTRADA',
        motivo: 'COMPRA',
        quantidade: 36,
        saldoAnterior: 10,
        saldoNovo: 46,
        observacao: null,
        embalagem: { rotulo: 'CX c/ 18 UN', quantidadePorEmbalagem: 18, quantidadeDeEmbalagens: 2 },
      }
      listarMovimentosDeEstoqueMock.mockResolvedValue(paginaDeMovimentos([compraEmCaixas], 0, 1))
      renderEdicao()
      await esperarFormulario()
      mostrarHistorico()

      const [linha] = await waitFor(() => linhasDeEstoque())
      expect(within(linha).getByText('+36 UN (2 CX c/ 18 UN)')).toBeInTheDocument()
    })

    it('tem as listas de estoque (primeiro) e de preços, cada uma com a sua consulta', async () => {
      listarMovimentosDeEstoqueMock.mockResolvedValue(paginaDeMovimentos([SAIDA], 0, 1))
      renderEdicao()
      await esperarFormulario()
      expect(listarMovimentosDeEstoqueMock).not.toHaveBeenCalled()
      mostrarHistorico()

      expect(await screen.findByText('Carla Dias')).toBeInTheDocument()
      const titulos = within(secao(/^histórico$/i))
        .getAllByRole('heading', { level: 3 })
        .map((titulo) => titulo.textContent)
      expect(titulos).toEqual(['Movimentações de estoque', 'Alterações de preço e custo'])
      expect(listarMovimentosDeEstoqueMock).toHaveBeenCalledWith(ID_ARROZ, 0)
      expect(listarHistoricoDePrecosMock).toHaveBeenCalledWith(ID_ARROZ, 0)
      expect(within(blocoDoHistorico('Alterações de preço e custo')).getByText('Nenhuma alteração de preço ou custo registrada ainda.')).toBeInTheDocument()
    })

    it('a linha mostra tipo e motivo, a quantidade com sinal e sigla, os saldos, a observação, quem e quando', async () => {
      listarMovimentosDeEstoqueMock.mockResolvedValue(paginaDeMovimentos([SAIDA, INICIAL], 0, 2))
      renderEdicao()
      await esperarFormulario()
      mostrarHistorico()
      await screen.findByText('Carla Dias')

      const [saida, inicial] = linhasDeEstoque()
      expect(within(saida).getByText('Saída · Perda/avaria')).toBeInTheDocument()
      expect(within(saida).getByText('−2 UN')).toBeInTheDocument()
      expect(within(saida).getByText('12 → 10')).toHaveAttribute('aria-hidden', 'true')
      expect(within(saida).getByText('saldo de 12 para 10')).toHaveClass('sr-only')
      expect(within(saida).getByText('Caixa amassada')).toBeInTheDocument()
      expect(within(saida).getByText('21/10/2026 15:20')).toBeInTheDocument()
      expect(within(inicial).getByText('Entrada · Estoque inicial')).toBeInTheDocument()
      expect(within(inicial).getByText('+12 UN')).toBeInTheDocument()
      expect(within(inicial).getByText('Davi Reis')).toBeInTheDocument()
    })

    it('"Carregar mais" do estoque busca a página 1 sem mexer na seção de preços', async () => {
      listarMovimentosDeEstoqueMock
        .mockResolvedValueOnce(paginaDeMovimentos([SAIDA], 0, 2))
        .mockResolvedValueOnce(paginaDeMovimentos([INICIAL], 1, 2))
      renderEdicao()
      await esperarFormulario()
      mostrarHistorico()
      await screen.findByText('Carla Dias')

      fireEvent.click(within(blocoDoHistorico('Movimentações de estoque')).getByRole('button', { name: 'Carregar mais' }))

      expect(await screen.findByText('Davi Reis')).toBeInTheDocument()
      expect(listarMovimentosDeEstoqueMock).toHaveBeenLastCalledWith(ID_ARROZ, 1)
      expect(linhasDeEstoque()).toHaveLength(2)
      expect(listarHistoricoDePrecosMock).toHaveBeenCalledTimes(1)
      expect(within(blocoDoHistorico('Movimentações de estoque')).queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()
      // O botao fica no formulario do produto: carregar mais nao salva.
      expect(atualizarProdutoMock).not.toHaveBeenCalled()
    })

    it('mostra carregando e, sem movimentos, o estado vazio', async () => {
      let responder: (valor: PaginaResponse<MovimentoEstoque>) => void = () => {}
      listarMovimentosDeEstoqueMock.mockReturnValue(new Promise((resolve) => (responder = resolve)))
      renderEdicao()
      await esperarFormulario()
      mostrarHistorico()

      expect(within(blocoDoHistorico('Movimentações de estoque')).getByText('Carregando movimentações...')).toBeInTheDocument()
      await act(async () => responder(paginaDeMovimentos([], 0, 0)))

      expect(await within(blocoDoHistorico('Movimentações de estoque')).findByText('Nenhuma movimentação de estoque ainda.')).toBeInTheDocument()
    })

    it('falha ao carregar mostra erro amigável e "Tentar de novo" só na seção de estoque', async () => {
      listarMovimentosDeEstoqueMock
        .mockRejectedValueOnce(new HttpError(500, 'SQLException em movimentos'))
        .mockResolvedValueOnce(paginaDeMovimentos([SAIDA], 0, 1))
      renderEdicao()
      await esperarFormulario()
      mostrarHistorico()

      expect(
        await within(blocoDoHistorico('Movimentações de estoque')).findByText('Não foi possível carregar as movimentações de estoque.'),
      ).toBeInTheDocument()
      expect(screen.queryByText(/SQLException/)).not.toBeInTheDocument()
      expect(within(blocoDoHistorico('Alterações de preço e custo')).queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()

      fireEvent.click(within(blocoDoHistorico('Movimentações de estoque')).getByRole('button', { name: 'Tentar de novo' }))

      expect(await screen.findByText('Carla Dias')).toBeInTheDocument()
      expect(atualizarProdutoMock).not.toHaveBeenCalled()
    })

    it('com o controle desligado, mostra os movimentos que existem e avisa', async () => {
      listarMovimentosDeEstoqueMock.mockResolvedValue(paginaDeMovimentos([SAIDA], 0, 1))
      renderEdicao({ ...produtoAtivo, controlaEstoque: false, situacaoEstoque: null })
      await esperarFormulario()
      mostrarHistorico()

      expect(await screen.findByText('Carla Dias')).toBeInTheDocument()
      expect(within(blocoDoHistorico('Movimentações de estoque')).getByText('Este produto não controla estoque no momento.')).toBeInTheDocument()
    })
  })
})
