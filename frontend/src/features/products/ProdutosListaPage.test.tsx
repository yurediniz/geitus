import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'

import { ProdutosListaPage } from '@/features/products/ProdutosListaPage'
import { useAuth } from '@/hooks/useAuth'
import { inativarProduto, listarProdutos, reativarProduto } from '@/services/produtoService'
import { listarCategorias } from '@/services/categoriaService'
import { ajustarEstoque } from '@/services/estoqueService'
import { categoria, ID_ARROZ, ID_FEIJAO, produtoAtivo, produtoInativo, produtoSimples } from '@/test/fixturesProduto'
import type { MovimentoEstoque } from '@/types/estoque'
import type { FiltrosDaListaDeProdutos, PaginaResponse, Produto } from '@/types/produto'

vi.mock('@/services/produtoService', () => ({
  TAMANHO_PAGINA_PRODUTOS: 25,
  listarProdutos: vi.fn(),
  inativarProduto: vi.fn(),
  reativarProduto: vi.fn(),
}))

vi.mock('@/services/estoqueService', () => ({
  ajustarEstoque: vi.fn(),
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
const inativarProdutoMock = vi.mocked(inativarProduto)
const reativarProdutoMock = vi.mocked(reativarProduto)
const listarCategoriasMock = vi.mocked(listarCategorias)
const ajustarEstoqueMock = vi.mocked(ajustarEstoque)
const useAuthMock = vi.mocked(useAuth)

// Categorias com UUID (a URL so aceita UUID em `categoria`).
const ID_RACAO = '7a1b2c3d-0000-4000-8000-000000000001'
const ID_SACHE = '7a1b2c3d-0000-4000-8000-000000000002'
const ID_SUMIDA = '7a1b2c3d-0000-4000-8000-0000000000ff'
const CATEGORIAS = [categoria(ID_RACAO, 'Ração', null, 'Ração'), categoria(ID_SACHE, 'Sachê', ID_RACAO, 'Ração › Sachê')]

function paginaDe(itens: Produto[], extra: Partial<PaginaResponse<Produto>> = {}): PaginaResponse<Produto> {
  return { itens, pagina: 0, tamanho: 25, totalItens: itens.length, ...extra }
}

/** Parametros da ultima chamada a `listarProdutos`. */
function ultimosParametros(): FiltrosDaListaDeProdutos {
  const chamada = listarProdutosMock.mock.lastCall
  if (!chamada) {
    throw new Error('listarProdutos nao foi chamado')
  }
  return chamada[0]
}

function chamadasComBusca(busca: string) {
  return listarProdutosMock.mock.calls.filter(([params]) => params.busca === busca)
}

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

async function linhaDoProduto(nome: string): Promise<HTMLElement> {
  const tabela = await screen.findByRole('table')
  return within(tabela).getByRole('link', { name: nome }).closest('tr') as HTMLElement
}

function campoBusca(): HTMLElement {
  return screen.getByRole('searchbox', { name: /buscar produtos/i })
}

describe('ProdutosListaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
    listarCategoriasMock.mockResolvedValue(CATEGORIAS)
    listarProdutosMock.mockResolvedValue(paginaDe([]))
  })

  it('exibe a sub-navegacao do catalogo com Produtos como aba atual', async () => {
    renderLista()

    const nav = await screen.findByRole('navigation', { name: /catálogo/i })
    expect(within(nav).getByRole('link', { name: 'Produtos' })).toHaveAttribute('aria-current', 'page')
    expect(within(nav).getByRole('link', { name: 'Categorias' })).toHaveAttribute('href', '/produtos/categorias')
  })

  it('consulta com os padroes: ativos, por nome, pagina 1', async () => {
    renderLista()

    await screen.findByText('Nenhum produto cadastrado ainda.')
    expect(listarProdutosMock).toHaveBeenCalledWith(
      { busca: '', status: 'ativos', categoria: null, estoque: null, promocao: false, ordem: 'nome', pagina: 1 },
      expect.any(AbortSignal),
    )
  })

  describe('estados', () => {
    it('mostra o esqueleto na primeira carga', () => {
      listarProdutosMock.mockReturnValue(new Promise(() => {}))

      renderLista()

      expect(screen.getByRole('heading', { name: 'Produtos' })).toBeInTheDocument()
      expect(screen.getByRole('status', { name: /carregando produtos/i })).toBeInTheDocument()
    })

    it('mostra o erro e "Tentar de novo" recarrega', async () => {
      listarProdutosMock.mockRejectedValueOnce(new Error('falha interna xyz'))
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))

      renderLista()

      expect(await screen.findByText('Não foi possível carregar os produtos.')).toBeInTheDocument()
      expect(screen.queryByText(/xyz/)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

      expect(await cardDoProduto('Arroz 5kg')).toBeInTheDocument()
    })

    it('vazio sem filtro: convida a cadastrar (ADMIN)', async () => {
      renderLista()

      expect(await screen.findByText('Nenhum produto cadastrado ainda.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Cadastrar produto' })).toHaveAttribute('href', '/produtos/novo')
      expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()
    })

    it('vazio sem filtro para OPERADOR nao oferece o cadastro', async () => {
      definirPerfil('OPERADOR')
      renderLista()

      expect(await screen.findByText('Nenhum produto cadastrado ainda.')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Cadastrar produto' })).not.toBeInTheDocument()
    })

    it('vazio com busca cita o termo e "Limpar filtros" restaura os padroes', async () => {
      const router = renderLista('/produtos?busca=a%C3%A7%C3%BAcar&estoque=sem&pagina=2')

      expect(await screen.findByText('Nenhum produto encontrado para "açúcar".')).toBeInTheDocument()
      const limpar = screen.getAllByRole('button', { name: 'Limpar filtros' })
      fireEvent.click(limpar[limpar.length - 1] as HTMLElement)

      await waitFor(() => expect(router.state.location.search).toBe(''))
      await waitFor(() => expect(ultimosParametros()).toMatchObject({ busca: '', estoque: null, pagina: 1 }))
      expect(campoBusca()).toHaveValue('')
    })

    it('vazio com filtros (sem busca) fala dos filtros escolhidos', async () => {
      renderLista('/produtos?estoque=sem')

      expect(await screen.findByText('Nenhum produto encontrado com os filtros escolhidos.')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: 'Limpar filtros' }).length).toBeGreaterThan(0)
    })

    it('mantem os itens antigos visiveis (esmaecidos) durante a troca de pagina', async () => {
      listarProdutosMock.mockImplementation(async (params) =>
        params.pagina === 1 ? paginaDe([produtoAtivo], { totalItens: 30 }) : new Promise(() => {}),
      )
      renderLista()
      await cardDoProduto('Arroz 5kg')

      fireEvent.click(screen.getByRole('button', { name: /próxima/i }))

      await waitFor(() => expect(ultimosParametros().pagina).toBe(2))
      expect(screen.getByRole('heading', { name: 'Arroz 5kg' })).toBeInTheDocument()
      expect(screen.getByRole('table').closest('[aria-busy]')).toHaveAttribute('aria-busy', 'true')
    })
  })

  describe('tabela e cards', () => {
    it('a tabela mostra as colunas e os dados do produto', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([{ ...produtoAtivo, nomeCurto: 'Arroz TJ' }, produtoSimples]))
      renderLista()

      const tabela = await screen.findByRole('table')
      const cabecalhos = within(tabela)
        .getAllByRole('columnheader')
        .map((th) => th.textContent?.trim())
      expect(cabecalhos).toEqual(['Nome', 'Categoria', 'Unidade', 'Preço', 'Margem', 'Estoque', 'Status', 'Ações'])

      const linha = await linhaDoProduto('Arroz 5kg')
      expect(within(linha).getByText('Arroz TJ · SKU-ARROZ')).toBeInTheDocument()
      expect(within(linha).getByText('Mercearia')).toBeInTheDocument()
      expect(within(linha).getByText('UN')).toBeInTheDocument()
      expect(within(linha).getByText('30,50%')).toBeInTheDocument()
      expect(within(linha).getByText('12 UN')).toBeInTheDocument()
      expect(within(linha).getByText('Ativo')).toBeInTheDocument()

      const simples = await linhaDoProduto('Produto Simples')
      // Sem categoria e sem custo: "—".
      expect(within(simples).getAllByText('—').length).toBeGreaterThanOrEqual(2)
      expect(within(simples).getByText('Sem estoque')).toBeInTheDocument()
    })

    it('a tabela fica so em telas medias e os cards so no celular (por CSS)', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista()

      expect(await screen.findByRole('table')).toHaveClass('hidden', 'md:table')
      expect((await cardDoProduto('Arroz 5kg')).closest('ul')).toHaveClass('md:hidden')
    })

    it('o nome na tabela abre o produto levando a URL da lista', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista('/produtos?busca=arroz&pagina=2')

      fireEvent.click(within(await linhaDoProduto('Arroz 5kg')).getByRole('link', { name: 'Arroz 5kg' }))

      expect(await screen.findByText(`Página do produto /produtos/${ID_ARROZ}`)).toBeInTheDocument()
      expect(screen.getByTestId('estado')).toHaveTextContent(
        JSON.stringify({ voltarPara: '/produtos?busca=arroz&pagina=2' }),
      )
    })

    it('o card mostra margem, markup, marca e omite os campos vazios', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo, produtoSimples]))
      renderLista()

      const card = await cardDoProduto('Arroz 5kg')
      expect(within(card).getByText('Tio João')).toBeInTheDocument()
      expect(within(card).getByText('30,50%')).toBeInTheDocument()
      expect(within(card).getByText('43,89%')).toBeInTheDocument()
      const simples = await cardDoProduto('Produto Simples')
      for (const rotulo of ['Custo', 'SKU', 'Código de barras', 'Categoria', 'Margem', 'Markup']) {
        expect(within(simples).queryByText(rotulo)).not.toBeInTheDocument()
      }
    })

    it('promocao vigente: selo, promocional e normal riscado (tabela e card)', async () => {
      const emPromocao: Produto = {
        ...produtoAtivo,
        precoVenda: 10,
        promocao: { preco: 8.9, inicio: '2026-11-01', fim: '2026-11-15', situacao: 'VIGENTE' },
        emPromocao: true,
      }
      listarProdutosMock.mockResolvedValue(paginaDe([emPromocao]))
      renderLista()

      for (const area of [await linhaDoProduto('Arroz 5kg'), await cardDoProduto('Arroz 5kg')]) {
        expect(within(area).getByText('Promoção')).toBeInTheDocument()
        expect(within(area).getByText(/^de R\$\s10,00 por R\$\s8,90$/)).toHaveClass('sr-only')
        expect(within(area).getByText(/^R\$\s10,00$/).tagName).toBe('S')
      }
    })

    it('produto sem controle de estoque mostra "—" e o motivo para leitor de tela', async () => {
      listarProdutosMock.mockResolvedValue(
        paginaDe([{ ...produtoAtivo, controlaEstoque: false, estoqueAtual: 12, situacaoEstoque: null }]),
      )
      renderLista()

      const linha = await linhaDoProduto('Arroz 5kg')
      expect(within(linha).getByText('Não controla estoque')).toHaveClass('sr-only')
      expect(within(linha).queryByText(/12 UN/)).not.toBeInTheDocument()
    })
  })

  describe('busca', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('digitar espera 300 ms parado e entao consulta com a busca', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const router = renderLista('/produtos?pagina=2')
      await screen.findByText('Nenhum produto cadastrado ainda.')

      fireEvent.change(campoBusca(), { target: { value: 'arroz' } })
      act(() => vi.advanceTimersByTime(299))
      expect(chamadasComBusca('arroz')).toHaveLength(0)

      act(() => vi.advanceTimersByTime(1))
      await waitFor(() => expect(chamadasComBusca('arroz')).toHaveLength(1))
      expect(ultimosParametros().pagina).toBe(1)
      expect(router.state.location.search).toBe('?busca=arroz')
      expect(router.state.historyAction).toBe('REPLACE')
    })

    it('Enter consulta na hora, sem esperar o atraso', async () => {
      renderLista()
      await screen.findByText('Nenhum produto cadastrado ainda.')

      fireEvent.change(campoBusca(), { target: { value: 'feijao' } })
      fireEvent.submit(campoBusca().closest('form') as HTMLFormElement)

      await waitFor(() => expect(chamadasComBusca('feijao')).toHaveLength(1))
    })

    it('buscar nao remonta o campo: o foco e o espaco no fim continuam', async () => {
      const router = renderLista()
      await screen.findByText('Nenhum produto cadastrado ainda.')
      const campo = campoBusca()
      campo.focus()

      fireEvent.change(campo, { target: { value: 'arroz ' } })

      await waitFor(() => expect(router.state.location.search).toBe('?busca=arroz'))
      expect(campoBusca()).toBe(campo)
      expect(campo).toHaveFocus()
      expect(campo).toHaveValue('arroz ')
    })

    it('uma resposta atrasada do termo antigo nao aparece', async () => {
      let responderAntigo: (pagina: PaginaResponse<Produto>) => void = () => {}
      listarProdutosMock.mockImplementation((params) => {
        if (params.busca === 'feij') {
          return new Promise((resolver) => {
            responderAntigo = resolver
          })
        }
        if (params.busca === 'arroz') {
          return Promise.resolve(paginaDe([produtoAtivo]))
        }
        return Promise.resolve(paginaDe([]))
      })
      renderLista()
      await screen.findByText('Nenhum produto cadastrado ainda.')

      fireEvent.change(campoBusca(), { target: { value: 'feij' } })
      fireEvent.submit(campoBusca().closest('form') as HTMLFormElement)
      await waitFor(() => expect(chamadasComBusca('feij')).toHaveLength(1))
      fireEvent.change(campoBusca(), { target: { value: 'arroz' } })
      fireEvent.submit(campoBusca().closest('form') as HTMLFormElement)
      await cardDoProduto('Arroz 5kg')

      await act(async () => responderAntigo(paginaDe([produtoInativo])))

      expect(screen.getByRole('heading', { name: 'Arroz 5kg' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Feijão 1kg' })).not.toBeInTheDocument()
      // A requisicao do termo antigo foi cancelada.
      const signalAntigo = chamadasComBusca('feij')[0]?.[1]
      expect(signalAntigo?.aborted).toBe(true)
    })

    it('apagar tudo volta a lista sem busca', async () => {
      listarProdutosMock.mockImplementation(async (params) =>
        params.busca === '' ? paginaDe([produtoAtivo, produtoInativo]) : paginaDe([produtoAtivo]),
      )
      const router = renderLista('/produtos?busca=arroz')
      await cardDoProduto('Arroz 5kg')
      expect(screen.queryByRole('heading', { name: 'Feijão 1kg' })).not.toBeInTheDocument()

      fireEvent.change(campoBusca(), { target: { value: '' } })

      expect(await cardDoProduto('Feijão 1kg')).toBeInTheDocument()
      expect(router.state.location.search).toBe('')
    })

    it('mostra "Buscando…" enquanto a busca nao chegou', async () => {
      listarProdutosMock.mockImplementation((params) =>
        params.busca === 'arroz' ? new Promise(() => {}) : Promise.resolve(paginaDe([produtoAtivo])),
      )
      renderLista()
      await cardDoProduto('Arroz 5kg')
      expect(screen.queryByText('Buscando…')).not.toBeInTheDocument()

      fireEvent.change(campoBusca(), { target: { value: 'arroz' } })

      expect(screen.getByText('Buscando…')).toBeInTheDocument()
      await waitFor(() => expect(chamadasComBusca('arroz')).toHaveLength(1))
      expect(screen.getByText('Buscando…')).toBeInTheDocument()
    })

    it('busca mudada por fora (historico) atualiza o campo', async () => {
      const router = renderLista('/produtos?busca=arroz')
      await screen.findByText('Nenhum produto encontrado para "arroz".')
      expect(campoBusca()).toHaveValue('arroz')

      await act(() => router.navigate('/produtos?busca=feijao'))

      expect(await screen.findByText('Nenhum produto encontrado para "feijao".')).toBeInTheDocument()
      expect(campoBusca()).toHaveValue('feijao')
    })
  })

  describe('filtros', () => {
    it.each([
      ['Status', 'inativos', { status: 'inativos' }, '?status=inativos'],
      ['Estoque', 'baixo', { estoque: 'baixo' }, '?estoque=baixo'],
      ['Ordenar por', '-preco', { ordem: '-preco' }, '?ordem=-preco'],
    ] as const)('%s chama a API com o parametro e volta para a pagina 1', async (rotulo, valor, esperado, search) => {
      const router = renderLista('/produtos?pagina=3')
      await screen.findByText(/nenhum produto/i)

      fireEvent.change(screen.getByRole('combobox', { name: rotulo }), { target: { value: valor } })

      await waitFor(() => expect(ultimosParametros()).toMatchObject({ ...esperado, pagina: 1 }))
      expect(router.state.location.search).toBe(search)
      expect(router.state.historyAction).toBe('PUSH')
    })

    it('"Só em promoção" chama a API com promocao', async () => {
      const router = renderLista('/produtos?pagina=3')
      await screen.findByText(/nenhum produto/i)

      fireEvent.click(screen.getByRole('checkbox', { name: 'Só em promoção' }))

      await waitFor(() => expect(ultimosParametros()).toMatchObject({ promocao: true, pagina: 1 }))
      expect(router.state.location.search).toBe('?promocao=1')
    })

    it('a categoria e escolhida pelo seletor com busca e vai para a API', async () => {
      const router = renderLista('/produtos?pagina=3')
      await screen.findByText(/nenhum produto/i)
      const gatilho = screen.getByRole('button', { name: /categoria/i })
      expect(gatilho).toHaveTextContent('Todas')

      fireEvent.click(gatilho)
      fireEvent.click(await screen.findByRole('option', { name: 'Ração › Sachê' }))

      await waitFor(() => expect(ultimosParametros()).toMatchObject({ categoria: ID_SACHE, pagina: 1 }))
      expect(router.state.location.search).toBe(`?categoria=${ID_SACHE}`)
      expect(screen.getByRole('button', { name: /categoria/i })).toHaveTextContent('Ração › Sachê')
    })

    it('categoria que nao existe mais na URL mostra "Todas" e oferece "Limpar filtros"', async () => {
      renderLista(`/produtos?categoria=${ID_SUMIDA}`)

      expect(await screen.findByText('Nenhum produto encontrado com os filtros escolhidos.')).toBeInTheDocument()
      await waitFor(() => expect(listarCategoriasMock).toHaveBeenCalled())
      await waitFor(() => expect(screen.getByRole('button', { name: /categoria/i })).toHaveTextContent('Todas'))
      expect(ultimosParametros().categoria).toBe(ID_SUMIDA)
      expect(screen.getAllByRole('button', { name: 'Limpar filtros' }).length).toBeGreaterThan(0)
    })

    it('a URL preenche os filtros na tela', async () => {
      renderLista(`/produtos?busca=arroz&status=todos&categoria=${ID_RACAO}&estoque=sem&promocao=1&ordem=-margem`)

      await screen.findByText('Nenhum produto encontrado para "arroz".')
      expect(campoBusca()).toHaveValue('arroz')
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('todos')
      expect(screen.getByRole('combobox', { name: 'Estoque' })).toHaveValue('sem')
      expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('-margem')
      expect(screen.getByRole('checkbox', { name: 'Só em promoção' })).toBeChecked()
      await waitFor(() => expect(screen.getByRole('button', { name: /categoria/i })).toHaveTextContent('Ração'))
    })

    it('"Limpar filtros" na barra so aparece com filtro e restaura os padroes', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      const router = renderLista('/produtos?status=inativos&ordem=-preco')
      await cardDoProduto('Arroz 5kg')

      fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))

      await waitFor(() => expect(router.state.location.search).toBe('?ordem=-preco'))
      expect(ultimosParametros()).toMatchObject({ status: 'ativos', ordem: '-preco' })
      expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()
    })

    it('no celular, "Filtros (n)" abre e fecha o bloco e conta os filtros ativos', async () => {
      renderLista('/produtos?estoque=sem&promocao=1')
      await screen.findByText(/nenhum produto/i)

      const alternar = screen.getByRole('button', { name: 'Filtros (2)' })
      expect(alternar).toHaveAttribute('aria-expanded', 'false')
      const bloco = document.getElementById(alternar.getAttribute('aria-controls') ?? '') as HTMLElement
      expect(bloco).toHaveClass('hidden', 'md:grid')

      fireEvent.click(alternar)

      expect(alternar).toHaveAttribute('aria-expanded', 'true')
      expect(bloco).not.toHaveClass('hidden')
    })
  })

  describe('ordenacao pelo cabecalho', () => {
    it('Preço alterna aria-sort entre ascending e descending e o select acompanha', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista()
      const tabela = await screen.findByRole('table')
      const cabecalho = () => within(tabela).getByRole('columnheader', { name: /preço/i })
      expect(within(tabela).getByRole('columnheader', { name: /nome/i })).toHaveAttribute('aria-sort', 'ascending')
      expect(cabecalho()).not.toHaveAttribute('aria-sort')

      fireEvent.click(within(cabecalho()).getByRole('button'))

      await waitFor(() => expect(cabecalho()).toHaveAttribute('aria-sort', 'ascending'))
      expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('preco')
      expect(ultimosParametros().ordem).toBe('preco')

      fireEvent.click(within(cabecalho()).getByRole('button'))

      await waitFor(() => expect(cabecalho()).toHaveAttribute('aria-sort', 'descending'))
      expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('-preco')
      expect(ultimosParametros().ordem).toBe('-preco')
    })

    it('o select muda o cabecalho ordenado', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista()
      const tabela = await screen.findByRole('table')

      fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar por' }), { target: { value: '-estoque' } })

      await waitFor(() =>
        expect(within(tabela).getByRole('columnheader', { name: /estoque/i })).toHaveAttribute('aria-sort', 'descending'),
      )
      expect(within(tabela).getByRole('columnheader', { name: /nome/i })).not.toHaveAttribute('aria-sort')
    })
  })

  describe('paginacao', () => {
    it('Próxima consulta a pagina seguinte, cria entrada no historico e foca o titulo da lista', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo], { totalItens: 60 }))
      const router = renderLista('/produtos?busca=arroz')
      await cardDoProduto('Arroz 5kg')
      expect(screen.getByText('1–25 de 60')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: /próxima/i }))

      await waitFor(() => expect(ultimosParametros()).toMatchObject({ busca: 'arroz', pagina: 2 }))
      expect(router.state.location.search).toBe('?busca=arroz&pagina=2')
      expect(router.state.historyAction).toBe('PUSH')
      expect(screen.getByRole('heading', { name: 'Lista de produtos' })).toHaveFocus()
    })

    it('respeita a pagina da URL', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo], { pagina: 2, totalItens: 60 }))
      renderLista('/produtos?pagina=3')

      await cardDoProduto('Arroz 5kg')
      expect(ultimosParametros().pagina).toBe(3)
      expect(screen.getByText('Página 3 de 3')).toBeInTheDocument()
    })

    it('pagina alem do fim vai para a ultima uma unica vez (sem laco)', async () => {
      listarProdutosMock.mockImplementation(async (params) =>
        params.pagina === 2
          ? paginaDe([produtoAtivo], { pagina: 1, totalItens: 30 })
          : paginaDe([], { pagina: params.pagina - 1, totalItens: 30 }),
      )
      const router = renderLista('/produtos?estoque=baixo&pagina=5')

      await cardDoProduto('Arroz 5kg')
      expect(router.state.location.search).toBe('?estoque=baixo&pagina=2')
      expect(router.state.historyAction).toBe('REPLACE')
      expect(listarProdutosMock.mock.calls.map(([params]) => params.pagina)).toEqual([5, 2])
    })
  })

  describe('navegacao e feedback', () => {
    it('"Novo produto" abre /produtos/novo levando a URL da lista', async () => {
      renderLista('/produtos?busca=arroz')

      fireEvent.click(await screen.findByRole('link', { name: /novo produto/i }))

      expect(await screen.findByText('Página do produto /produtos/novo')).toBeInTheDocument()
      expect(screen.getByTestId('estado')).toHaveTextContent(JSON.stringify({ voltarPara: '/produtos?busca=arroz' }))
    })

    it('"Editar" leva a URL completa da lista (filtros e pagina) para a volta da edicao', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo], { totalItens: 60 }))
      renderLista('/produtos?busca=arroz&estoque=baixo&ordem=-preco&pagina=2')

      const editar = within(await cardDoProduto('Arroz 5kg')).getByRole('link', { name: 'Editar Arroz 5kg' })
      fireEvent.click(editar)

      expect(await screen.findByText(`Página do produto /produtos/${ID_ARROZ}`)).toBeInTheDocument()
      expect(screen.getByTestId('estado')).toHaveTextContent(
        JSON.stringify({ voltarPara: '/produtos?busca=arroz&estoque=baixo&ordem=-preco&pagina=2' }),
      )
    })

    it('voltar da edicao restaura filtros e pagina', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo], { pagina: 1, totalItens: 60 }))
      renderLista({ pathname: '/produtos', search: '?busca=arroz&estoque=baixo&pagina=2', state: { sucesso: 'Produto salvo com sucesso.' } })

      expect(await screen.findByText('Produto salvo com sucesso.')).toBeInTheDocument()
      await cardDoProduto('Arroz 5kg')
      expect(ultimosParametros()).toMatchObject({ busca: 'arroz', estoque: 'baixo', pagina: 2 })
      expect(campoBusca()).toHaveValue('arroz')
      expect(screen.getByRole('combobox', { name: 'Estoque' })).toHaveValue('baixo')
      expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    })

    it('a mensagem de sucesso sai do historico sem perder a URL', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      const router = renderLista({ pathname: '/produtos', search: '?busca=arroz', state: { sucesso: 'Produto cadastrado com sucesso.' } })

      expect(await screen.findByText('Produto cadastrado com sucesso.')).toBeInTheDocument()
      await waitFor(() => expect(router.state.location.state).toBeNull())
      expect(router.state.location.search).toBe('?busca=arroz')
    })
  })

  describe('acoes do produto', () => {
    it('inativa pela tabela, recarrega a lista e mostra o sucesso', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      inativarProdutoMock.mockResolvedValue({ ...produtoAtivo, ativo: false })
      renderLista()
      const linha = await linhaDoProduto('Arroz 5kg')
      const chamadasAntes = listarProdutosMock.mock.calls.length

      fireEvent.click(within(linha).getByRole('button', { name: 'Inativar Arroz 5kg' }))

      await waitFor(() => expect(inativarProdutoMock).toHaveBeenCalledWith(ID_ARROZ))
      expect(await screen.findByText('Produto inativado com sucesso.')).toBeInTheDocument()
      expect(listarProdutosMock.mock.calls.length).toBeGreaterThan(chamadasAntes)
    })

    it('reativa pelo card', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoInativo]))
      reativarProdutoMock.mockResolvedValue({ ...produtoInativo, ativo: true })
      renderLista('/produtos?status=inativos')

      fireEvent.click(within(await cardDoProduto('Feijão 1kg')).getByRole('button', { name: 'Reativar Feijão 1kg' }))

      await waitFor(() => expect(reativarProdutoMock).toHaveBeenCalledWith(ID_FEIJAO))
      expect(await screen.findByText('Produto reativado com sucesso.')).toBeInTheDocument()
    })

    it('mostra erro amigavel ao falhar a troca de status', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      inativarProdutoMock.mockRejectedValue(new Error('falha ao inativar'))
      renderLista()

      fireEvent.click(within(await cardDoProduto('Arroz 5kg')).getByRole('button', { name: 'Inativar Arroz 5kg' }))

      expect(await screen.findByText('Não foi possível alterar o status do produto. Tente novamente.')).toBeInTheDocument()
    })

    it('OPERADOR ve so "Ver detalhes" (tabela e card) e o aviso de leitura', async () => {
      definirPerfil('OPERADOR')
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista()

      for (const area of [await linhaDoProduto('Arroz 5kg'), await cardDoProduto('Arroz 5kg')]) {
        expect(within(area).getByRole('link', { name: 'Ver detalhes Arroz 5kg' })).toHaveAttribute(
          'href',
          `/produtos/${ID_ARROZ}`,
        )
        expect(within(area).queryByRole('button', { name: /inativar|ajustar estoque/i })).not.toBeInTheDocument()
      }
      expect(screen.getByText(/somente administradores podem gerenciar produtos/i)).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /novo produto/i })).not.toBeInTheDocument()
    })

    it('"Ajustar estoque" so aparece para quem controla estoque', async () => {
      listarProdutosMock.mockResolvedValue(
        paginaDe([produtoAtivo, { ...produtoInativo, controlaEstoque: false, situacaoEstoque: null }]),
      )
      renderLista()

      expect(within(await linhaDoProduto('Feijão 1kg')).queryByRole('button', { name: /ajustar estoque/i })).toBeNull()
      expect(within(await linhaDoProduto('Arroz 5kg')).getByRole('button', { name: 'Ajustar estoque Arroz 5kg' })).toBeInTheDocument()
    })

    it('"Ajustar estoque" abre o modal; no sucesso recarrega e devolve o foco ao botao de origem', async () => {
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
      }
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      ajustarEstoqueMock.mockResolvedValue(SAIDA)
      const router = renderLista()
      const card = await cardDoProduto('Arroz 5kg')

      fireEvent.click(within(card).getByRole('button', { name: 'Ajustar estoque Arroz 5kg' }))

      const modal = await screen.findByRole('dialog', { name: 'Ajustar estoque' })
      expect(within(modal).getByText('Saldo atual: 12 UN')).toBeInTheDocument()
      fireEvent.click(within(modal).getByRole('radio', { name: 'Saída' }))
      fireEvent.change(within(modal).getByRole('textbox', { name: /^quantidade/i }), { target: { value: '2' } })
      fireEvent.change(within(modal).getByRole('combobox', { name: /^motivo/i }), { target: { value: 'PERDA_AVARIA' } })
      listarProdutosMock.mockResolvedValue(paginaDe([{ ...produtoAtivo, estoqueAtual: 10 }]))
      fireEvent.click(modal.querySelector('button[type="submit"]') as HTMLElement)

      expect(await screen.findByText('Arroz 5kg: saída de 2 UN registrada. Saldo: 10 UN.')).toBeInTheDocument()
      expect(ajustarEstoqueMock).toHaveBeenCalledWith(ID_ARROZ, expect.objectContaining({ tipo: 'SAIDA', quantidade: 2 }))
      await waitFor(async () => expect(within(await linhaDoProduto('Arroz 5kg')).getByText('10 UN')).toBeInTheDocument())
      expect(router.state.location.pathname).toBe('/produtos')
      await waitFor(() =>
        expect(within(card).getByRole('button', { name: 'Ajustar estoque Arroz 5kg' })).toHaveFocus(),
      )
    })
  })
})
