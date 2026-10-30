import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'

import { ProdutosListaPage } from '@/features/products/ProdutosListaPage'
import { useAuth } from '@/hooks/useAuth'
import { inativarProduto, listarProdutos, reativarProduto, type ListarProdutosParams } from '@/services/produtoService'
import { listarCategorias } from '@/services/categoriaService'
import { ajustarEstoque } from '@/services/estoqueService'
import { categoria, ID_ARROZ, ID_FEIJAO, produtoAtivo, produtoInativo, produtoSimples } from '@/test/fixturesProduto'
import type { MovimentoEstoque } from '@/types/estoque'
import type { PaginaResponse, Produto } from '@/types/produto'

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

/** Consulta auxiliar da lista vazia ("existe algum produto?"): tamanho 1, status todos. */
function ehConsultaDeExistencia(params: ListarProdutosParams): boolean {
  return params.tamanho === 1
}

/** Chamadas da lista em si (sem a consulta de existencia). */
function chamadasDaLista(): ListarProdutosParams[] {
  return listarProdutosMock.mock.calls.map(([params]) => params).filter((params) => !ehConsultaDeExistencia(params))
}

/** Parametros da ultima chamada da lista. */
function ultimosParametros(): ListarProdutosParams {
  const chamada = chamadasDaLista().at(-1)
  if (!chamada) {
    throw new Error('listarProdutos nao foi chamado')
  }
  return chamada
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

/** Cliente do ultimo render: os testes esperam as consultas ficarem ociosas em vez de dormir. */
let clienteAtual: QueryClient | null = null

function renderLista(entrada: string | { pathname: string; search?: string; state?: unknown } = '/produtos') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clienteAtual = queryClient
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

/** Espera nenhuma consulta nem mutacao em andamento (no lugar de esperas por tempo). */
async function consultasOciosas(): Promise<void> {
  await waitFor(() => {
    expect(clienteAtual?.isFetching()).toBe(0)
    expect(clienteAtual?.isMutating()).toBe(0)
  })
}

/** Espera a primeira carga da lista terminar (o esqueleto sumir), qualquer que seja o resultado. */
async function listaCarregada(): Promise<void> {
  await waitFor(() => expect(screen.queryByRole('status', { name: /carregando produtos/i })).not.toBeInTheDocument())
  await consultasOciosas()
}

async function cardDoProduto(nome: string): Promise<HTMLElement> {
  const titulo = await screen.findByRole('heading', { name: nome })
  return titulo.closest('article') as HTMLElement
}

async function linhaDoProduto(nome: string): Promise<HTMLElement> {
  const tabela = await screen.findByRole('table')
  return within(tabela).getByRole('link', { name: nome }).closest('tr') as HTMLElement
}

/** Abre o menu "⋯" do produto na area (linha ou card) e devolve o menu. */
function abrirMenu(area: HTMLElement, nome: string): Promise<HTMLElement> {
  fireEvent.click(within(area).getByRole('button', { name: `Mais ações para ${nome}` }))
  return screen.findByRole('menu', { name: `Mais ações para ${nome}` })
}

function campoBusca(): HTMLElement {
  return screen.getByRole('searchbox', { name: /buscar produtos/i })
}

/** Estado vazio da lista: uma regiao nomeada pela propria mensagem. */
function estadoVazio(mensagem: string): Promise<HTMLElement> {
  return screen.findByRole('region', { name: mensagem })
}

function gatilhoCategoria(): HTMLElement {
  return screen.getByRole('button', { name: /^categoria/i })
}

describe('ProdutosListaPage', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
    listarCategoriasMock.mockResolvedValue(CATEGORIAS)
    listarProdutosMock.mockResolvedValue(paginaDe([]))
  })

  it('nao tem mais as abas do catalogo (a navegacao fica no menu lateral)', async () => {
    renderLista()

    await listaCarregada()
    expect(screen.queryByRole('navigation', { name: /catálogo/i })).not.toBeInTheDocument()
  })

  it('consulta com os padroes: ativos, por nome, pagina 1', async () => {
    renderLista()

    await listaCarregada()
    expect(listarProdutosMock).toHaveBeenCalledWith(
      { busca: '', status: 'ativos', categoria: [], estoque: [], promocao: false, ordem: 'nome', pagina: 1 },
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

    it('mostra o erro sem detalhe interno e "Tentar de novo" recarrega', async () => {
      listarProdutosMock.mockRejectedValueOnce(new Error('falha interna xyz'))
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))

      renderLista()

      expect(await screen.findByText('Não foi possível carregar os produtos.')).toBeInTheDocument()
      expect(screen.queryByText(/xyz/)).not.toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

      expect(await cardDoProduto('Arroz 5kg')).toBeInTheDocument()
    })

    it('uma requisicao cancelada (AbortError) nao vira erro na tela', async () => {
      listarProdutosMock.mockImplementation((params, signal) => {
        if (params.busca === 'feij') {
          return new Promise((_, rejeitar) => {
            signal?.addEventListener('abort', () => rejeitar(new DOMException('Abortado.', 'AbortError')))
          })
        }
        return Promise.resolve(paginaDe([produtoAtivo]))
      })
      renderLista()
      await cardDoProduto('Arroz 5kg')

      fireEvent.change(campoBusca(), { target: { value: 'feij' } })
      fireEvent.submit(campoBusca().closest('form') as HTMLFormElement)
      await waitFor(() => expect(chamadasComBusca('feij')).toHaveLength(1))
      fireEvent.change(campoBusca(), { target: { value: 'arroz' } })
      fireEvent.submit(campoBusca().closest('form') as HTMLFormElement)

      await waitFor(() => expect(chamadasComBusca('feij')[0]?.[1]?.aborted).toBe(true))
      expect(await cardDoProduto('Arroz 5kg')).toBeInTheDocument()
      expect(screen.queryByText('Não foi possível carregar os produtos.')).not.toBeInTheDocument()
    })

    it('sem nenhum produto: convida a cadastrar (ADMIN)', async () => {
      renderLista()

      const vazio = await estadoVazio('Nenhum produto cadastrado ainda.')
      expect(within(vazio).getByRole('link', { name: 'Cadastrar produto' })).toHaveAttribute('href', '/produtos/novo')
      expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()
    })

    it('sem nenhum produto, OPERADOR nao ve o cadastro', async () => {
      definirPerfil('OPERADOR')
      renderLista()

      const vazio = await estadoVazio('Nenhum produto cadastrado ainda.')
      expect(within(vazio).queryByRole('link', { name: 'Cadastrar produto' })).not.toBeInTheDocument()
    })

    it('so existem inativos: "Nenhum produto ativo." com "Ver todos"', async () => {
      listarProdutosMock.mockImplementation(async (params) =>
        ehConsultaDeExistencia(params) ? paginaDe([produtoInativo], { tamanho: 1 }) : paginaDe([]),
      )
      const router = renderLista()

      const vazio = await estadoVazio('Nenhum produto ativo.')
      expect(within(vazio).getByRole('link', { name: 'Cadastrar produto' })).toBeInTheDocument()
      fireEvent.click(within(vazio).getByRole('button', { name: 'Ver todos' }))

      await waitFor(() => expect(router.state.location.search).toBe('?status=todos'))
    })

    it('busca vazia com o status padrao oferece buscar nos inativos', async () => {
      const router = renderLista('/produtos?busca=arroz')

      const vazio = await estadoVazio('Nenhum produto ativo encontrado para "arroz".')
      fireEvent.click(within(vazio).getByRole('button', { name: 'Buscar também nos inativos' }))

      await waitFor(() => expect(router.state.location.search).toBe('?busca=arroz&status=todos'))
      expect(ultimosParametros()).toMatchObject({ busca: 'arroz', status: 'todos' })
      expect(await estadoVazio('Nenhum produto encontrado para "arroz".')).toBeInTheDocument()
    })

    it('busca vazia com outros filtros cita o termo e os filtros; "Limpar filtros" restaura', async () => {
      const router = renderLista('/produtos?busca=a%C3%A7%C3%BAcar&estoque=zerado&pagina=2')

      const vazio = await estadoVazio('Nenhum produto encontrado para "açúcar" com os filtros escolhidos.')
      expect(within(vazio).queryByRole('button', { name: 'Buscar também nos inativos' })).not.toBeInTheDocument()
      fireEvent.click(within(vazio).getByRole('button', { name: 'Limpar filtros' }))

      await waitFor(() => expect(router.state.location.search).toBe(''))
      await waitFor(() => expect(ultimosParametros()).toMatchObject({ busca: '', estoque: [], pagina: 1 }))
      expect(campoBusca()).toHaveValue('')
    })

    it('vazio com filtros (sem busca) fala dos filtros escolhidos', async () => {
      renderLista('/produtos?estoque=zerado')

      const vazio = await estadoVazio('Nenhum produto encontrado com os filtros escolhidos.')
      expect(within(vazio).getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument()
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
      // Trocar de pagina nao e busca: o indicador "Buscando…" fica so para a busca.
      expect(screen.queryByText('Buscando…')).not.toBeInTheDocument()
    })
  })

  describe('titulo e total', () => {
    it('sem filtro, o titulo diz o total de produtos e a tabela usa esse titulo', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo], { totalItens: 1240 }))
      renderLista()

      const titulo = await screen.findByRole('heading', { name: '1.240 produtos' })
      expect(screen.getByRole('table')).toHaveAttribute('aria-labelledby', titulo.id)
    })

    it('com filtro, o titulo diz quantos foram encontrados e o total e anunciado', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo], { totalItens: 37 }))
      renderLista('/produtos?busca=arroz')

      expect(await screen.findByRole('heading', { name: '37 produtos encontrados' })).toBeInTheDocument()
      expect(screen.getByText('37 produtos encontrados. Página 1 de 2.')).toHaveAttribute('aria-live', 'polite')
    })

    it('usa o singular com um produto', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista('/produtos?busca=arroz')

      expect(await screen.findByRole('heading', { name: '1 produto encontrado' })).toBeInTheDocument()
    })
  })

  describe('tabela e cards', () => {
    it('a tabela mostra as colunas e os dados, sem coluna de status', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([{ ...produtoAtivo, nomeCurto: 'Arroz TJ' }, produtoSimples]))
      renderLista()

      const tabela = await screen.findByRole('table')
      const cabecalhos = within(tabela)
        .getAllByRole('columnheader')
        .map((th) => th.textContent?.trim())
      expect(cabecalhos).toEqual(['Imagem', 'Nome', 'Categoria', 'Unidade', 'Preço', 'Margem', 'Estoque', 'Ações'])

      const linha = await linhaDoProduto('Arroz 5kg')
      // Linha secundaria da Fase B2: Nº, codigo do produto e SKU (as partes que existirem).
      expect(within(linha).getByText('Nº 15 · Cód. 542 · SKU-ARROZ')).toBeInTheDocument()
      expect(within(linha).getByText('Mercearia')).toBeInTheDocument()
      expect(within(linha).getByText('UN')).toBeInTheDocument()
      expect(within(linha).getByText('30,50%')).toBeInTheDocument()
      expect(within(linha).getByText('12 UN')).toBeInTheDocument()
      expect(within(linha).queryByText('Ativo')).not.toBeInTheDocument()

      const simples = await linhaDoProduto('Produto Simples')
      expect(within(simples).getByText('Nº 3')).toBeInTheDocument()
      expect(within(simples).getAllByText('—').length).toBeGreaterThanOrEqual(2)
      expect(within(simples).getByText('Zerado')).toBeInTheDocument()
    })

    it('o selo "Inativo" aparece ao lado do nome so nos inativos (tabela e card)', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo, produtoInativo]))
      renderLista('/produtos?status=todos')

      expect(within(await linhaDoProduto('Feijão 1kg')).getByText('Inativo')).toBeInTheDocument()
      expect(within(await cardDoProduto('Feijão 1kg')).getByText('Inativo')).toBeInTheDocument()
      expect(within(await linhaDoProduto('Arroz 5kg')).queryByText(/ativo/i)).not.toBeInTheDocument()
      expect(within(await cardDoProduto('Arroz 5kg')).queryByText(/ativo/i)).not.toBeInTheDocument()
    })

    it('tabela a partir de 1024 px (cards abaixo), com rolagem lateral; Categoria e Unidade a partir de 1280 px', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista()

      const tabela = await screen.findByRole('table')
      expect(tabela.parentElement).toHaveClass('hidden', 'lg:block', 'overflow-x-auto')
      for (const coluna of ['Categoria', 'Unidade']) {
        expect(within(tabela).getByRole('columnheader', { name: coluna })).toHaveClass('hidden', 'xl:table-cell')
      }
      expect(within(await linhaDoProduto('Arroz 5kg')).getByText('Mercearia').closest('td')).toHaveClass(
        'hidden',
        'xl:table-cell',
      )
      expect((await cardDoProduto('Arroz 5kg')).closest('ul')).toHaveClass('lg:hidden')
    })

    it('o nome abre o produto levando a URL da lista (tabela e card)', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista('/produtos?busca=arroz&pagina=2')

      const card = await cardDoProduto('Arroz 5kg')
      expect(within(card).getByRole('link', { name: 'Arroz 5kg' })).toHaveAttribute('href', `/produtos/${ID_ARROZ}`)
      fireEvent.click(within(await linhaDoProduto('Arroz 5kg')).getByRole('link', { name: 'Arroz 5kg' }))

      expect(await screen.findByText(`Página do produto /produtos/${ID_ARROZ}`)).toBeInTheDocument()
      expect(screen.getByTestId('estado')).toHaveTextContent(
        JSON.stringify({ voltarPara: '/produtos?busca=arroz&pagina=2' }),
      )
    })

    it('o card e enxuto: marca, preco, estoque e uma linha com o Nº, o codigo e o SKU', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo, produtoSimples]))
      renderLista()

      const card = await cardDoProduto('Arroz 5kg')
      expect(within(card).getByText('Tio João')).toBeInTheDocument()
      expect(within(card).getByText('R$ 25,90')).toBeInTheDocument()
      expect(within(card).getByText('12 UN')).toBeInTheDocument()
      expect(within(card).getByText('Nº 15 · Cód. 542 · SKU-ARROZ')).toBeInTheDocument()
      expect(within(await cardDoProduto('Produto Simples')).getByText('Nº 3')).toBeInTheDocument()
      for (const rotulo of ['Custo', 'Margem', 'Markup', 'Categoria', 'Estoque mínimo', 'Preço mínimo']) {
        expect(within(card).queryByText(rotulo)).not.toBeInTheDocument()
      }
    })

    it('sem SKU, o card mostra o primeiro codigo de barras', async () => {
      listarProdutosMock.mockResolvedValue(
        paginaDe([
          {
            ...produtoAtivo,
            sku: null,
            codigosBarras: [
              { codigo: '7891000315507', formato: 'EAN13' },
              { codigo: '96385074', formato: 'EAN8' },
            ],
          },
        ]),
      )
      renderLista()

      expect(within(await cardDoProduto('Arroz 5kg')).getByText('Nº 15 · Cód. 542 · 7891000315507 (+1)')).toBeInTheDocument()
    })

    it('promocao vigente: selo com icone, promocional e normal riscado (tabela e card)', async () => {
      const emPromocao: Produto = {
        ...produtoAtivo,
        precoVenda: 10,
        promocao: { preco: 8.9, inicio: '2026-11-01', fim: '2026-11-15', situacao: 'VIGENTE' },
        emPromocao: true,
      }
      listarProdutosMock.mockResolvedValue(paginaDe([emPromocao]))
      renderLista()

      for (const area of [await linhaDoProduto('Arroz 5kg'), await cardDoProduto('Arroz 5kg')]) {
        const selo = within(area).getByText('Promoção')
        expect(selo.querySelector('svg')).not.toBeNull()
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

  describe('miniatura (Fase F)', () => {
    const IMAGEM = {
      miniaturaUrl: '/api/imagens/produtos/p/v1/miniatura?expira=1&assinatura=a',
      grandeUrl: '/api/imagens/produtos/p/v1/grande?expira=1&assinatura=b',
      largura: 1200,
      altura: 900,
      atualizadaEm: '2026-10-24T10:00:00',
    }

    /** A miniatura de uma area (linha ou card): o quadro e a imagem dele, se houver. */
    function miniaturaDa(area: HTMLElement): { quadro: HTMLElement; imagem: HTMLImageElement | null } {
      const quadro = area.querySelector<HTMLElement>('[data-miniatura]')
      if (!quadro) {
        throw new Error('miniatura nao encontrada')
      }
      return { quadro, imagem: quadro.querySelector('img') }
    }

    it('com imagem: a miniatura na tabela (40 px, primeira coluna) e no card (56 px), carregada sem pressa', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([{ ...produtoAtivo, imagem: IMAGEM }]))
      renderLista()

      const linha = await linhaDoProduto('Arroz 5kg')
      const card = await cardDoProduto('Arroz 5kg')
      const naTabela = miniaturaDa(linha)
      const noCard = miniaturaDa(card)

      expect(linha.querySelector('td')?.contains(naTabela.quadro)).toBe(true)
      expect(naTabela.quadro).toHaveClass('size-10')
      expect(noCard.quadro).toHaveClass('size-14')
      for (const { imagem } of [naTabela, noCard]) {
        expect(imagem).toHaveAttribute('src', IMAGEM.miniaturaUrl)
        expect(imagem).toHaveAttribute('loading', 'lazy')
        expect(imagem).toHaveAttribute('decoding', 'async')
        // O nome ja esta ao lado: a miniatura e decorativa.
        expect(imagem).toHaveAttribute('alt', '')
        expect(imagem).toHaveClass('object-contain')
      }
    })

    it('sem imagem: o icone neutro no lugar da foto', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista()

      for (const area of [await linhaDoProduto('Arroz 5kg'), await cardDoProduto('Arroz 5kg')]) {
        const { quadro, imagem } = miniaturaDa(area)
        expect(imagem).toBeNull()
        expect(quadro.querySelector('svg')).not.toBeNull()
      }
    })

    it('a imagem que falha ao carregar (URL vencida) volta ao icone (Review Focus 3)', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([{ ...produtoAtivo, imagem: IMAGEM }]))
      renderLista()

      const linha = await linhaDoProduto('Arroz 5kg')
      const { imagem } = miniaturaDa(linha)
      fireEvent.error(imagem as HTMLImageElement)

      const depois = miniaturaDa(linha)
      expect(depois.imagem).toBeNull()
      expect(depois.quadro.querySelector('svg')).not.toBeNull()
      // O card tem a sua propria imagem, que continua.
      expect(miniaturaDa(await cardDoProduto('Arroz 5kg')).imagem).not.toBeNull()
    })

    it('a coluna da miniatura e estreita e fica na tabela desde 1024 px', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista()

      const tabela = await screen.findByRole('table')
      const cabecalho = within(tabela).getByRole('columnheader', { name: 'Imagem' })
      expect(cabecalho).toHaveClass('w-px')
      expect(cabecalho).not.toHaveClass('hidden')
      expect(tabela.parentElement).toHaveClass('hidden', 'lg:block', 'overflow-x-auto')
    })
  })

  describe('busca', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('o campo tem o texto de exemplo e espaco fixo para o indicador', async () => {
      renderLista()
      await listaCarregada()

      expect(campoBusca()).toHaveAttribute('placeholder', 'Nome, SKU, marca ou código')
      expect(campoBusca()).toHaveClass('pr-28')
    })

    it('digitar espera 300 ms parado e entao consulta com a busca', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      const router = renderLista('/produtos?pagina=2')
      await listaCarregada()

      fireEvent.change(campoBusca(), { target: { value: 'arroz' } })
      act(() => vi.advanceTimersByTime(299))
      expect(chamadasComBusca('arroz')).toHaveLength(0)
      expect(router.state.location.search).toBe('?pagina=2')

      act(() => vi.advanceTimersByTime(1))
      await waitFor(() => expect(chamadasComBusca('arroz')).toHaveLength(1))
      expect(ultimosParametros().pagina).toBe(1)
      expect(router.state.location.search).toBe('?busca=arroz')
      expect(router.state.historyAction).toBe('REPLACE')
    })

    it('Enter consulta na hora, sem esperar o atraso', async () => {
      renderLista()
      await listaCarregada()

      fireEvent.change(campoBusca(), { target: { value: 'feijao' } })
      fireEvent.submit(campoBusca().closest('form') as HTMLFormElement)

      await waitFor(() => expect(chamadasComBusca('feijao')).toHaveLength(1))
    })

    it('buscar nao remonta o campo: o foco e o espaco no fim continuam', async () => {
      const router = renderLista()
      await listaCarregada()
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
      await screen.findByRole('searchbox')

      fireEvent.change(campoBusca(), { target: { value: 'feij' } })
      fireEvent.submit(campoBusca().closest('form') as HTMLFormElement)
      await waitFor(() => expect(chamadasComBusca('feij')).toHaveLength(1))
      fireEvent.change(campoBusca(), { target: { value: 'arroz' } })
      fireEvent.submit(campoBusca().closest('form') as HTMLFormElement)
      await cardDoProduto('Arroz 5kg')

      await act(async () => responderAntigo(paginaDe([produtoInativo])))

      expect(screen.getByRole('heading', { name: 'Arroz 5kg' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Feijão 1kg' })).not.toBeInTheDocument()
      expect(chamadasComBusca('feij')[0]?.[1]?.aborted).toBe(true)
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
      await estadoVazio('Nenhum produto ativo encontrado para "arroz".')
      expect(campoBusca()).toHaveValue('arroz')

      await act(() => router.navigate('/produtos?busca=feijao'))

      expect(await estadoVazio('Nenhum produto ativo encontrado para "feijao".')).toBeInTheDocument()
      expect(campoBusca()).toHaveValue('feijao')
    })
  })

  describe('filtros', () => {
    it('os controles seguem a ordem Status, Categoria, Estoque, promocao e Ordenar por', async () => {
      renderLista()
      await screen.findByRole('searchbox')

      const bloco = document.getElementById(
        screen.getByRole('button', { name: 'Filtros' }).getAttribute('aria-controls') ?? '',
      ) as HTMLElement
      const rotulos = Array.from(bloco.querySelectorAll('[data-rotulo-filtro]')).map((rotulo) => rotulo.textContent)
      expect(rotulos).toEqual(['Status', 'Categoria', 'Estoque', 'Só em promoção', 'Ordenar por'])
    })

    it.each([
      ['Status', 'inativos', { status: 'inativos' }, '?status=inativos'],
      ['Ordenar por', '-preco', { ordem: '-preco' }, '?ordem=-preco'],
    ] as const)('%s chama a API com o parametro e volta para a pagina 1', async (rotulo, valor, esperado, search) => {
      const router = renderLista('/produtos?pagina=3')
      await screen.findByRole('searchbox')

      fireEvent.change(screen.getByRole('combobox', { name: rotulo }), { target: { value: valor } })

      await waitFor(() => expect(ultimosParametros()).toMatchObject({ ...esperado, pagina: 1 }))
      expect(router.state.location.search).toBe(search)
      expect(router.state.historyAction).toBe('PUSH')
    })

    it('"Ordenar por" tem as 10 opcoes da spec, na ordem, todas aceitas pelo backend', async () => {
      renderLista()
      await listaCarregada()

      const opcoes = within(screen.getByRole('combobox', { name: 'Ordenar por' }))
        .getAllByRole('option')
        .map((opcao) => [opcao.textContent, (opcao as HTMLOptionElement).value])
      expect(opcoes).toEqual([
        ['Nome (A–Z)', 'nome'],
        ['Nome (Z–A)', '-nome'],
        ['Menor preço', 'preco'],
        ['Maior preço', '-preco'],
        ['Maior margem', '-margem'],
        ['Menor margem', 'margem'],
        ['Maior estoque', '-estoque'],
        ['Menor estoque', 'estoque'],
        ['Mais recentes', 'recentes'],
        ['Atualizados recentemente', 'atualizados'],
      ])
      const aceitosPeloBackend = ['nome', '-nome', 'preco', '-preco', 'margem', '-margem', 'estoque', '-estoque', 'recentes', 'atualizados']
      for (const [, valor] of opcoes) {
        expect(aceitosPeloBackend).toContain(valor)
      }
    })

    it('o filtro de estoque tem as situações da posição e marca várias, que vão para a API e voltam à página 1', async () => {
      const router = renderLista('/produtos?pagina=3')
      await screen.findByRole('searchbox')

      fireEvent.click(screen.getByRole('button', { name: 'Estoque Todos' }))
      const painel = await screen.findByRole('group', { name: 'Estoque' })
      expect(within(painel).getAllByRole('checkbox').map((caixa) => caixa.closest('label')?.textContent)).toEqual([
        'Negativo',
        'Zerado',
        'Baixo',
        'Reposição',
        'Regular',
        'Alto',
      ])
      fireEvent.click(within(painel).getByRole('checkbox', { name: 'Reposição' }))
      await waitFor(() => expect(router.state.location.search).toBe('?estoque=reposicao'))
      expect(router.state.historyAction).toBe('PUSH')
      fireEvent.click(within(screen.getByRole('group', { name: 'Estoque' })).getByRole('checkbox', { name: 'Baixo' }))

      await waitFor(() => expect(ultimosParametros()).toMatchObject({ estoque: ['baixo', 'reposicao'], pagina: 1 }))
      expect(router.state.location.search).toBe('?estoque=baixo&estoque=reposicao')
      expect(screen.getByRole('button', { name: 'Estoque Baixo +1' })).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))
      await waitFor(() => expect(router.state.location.search).toBe(''))
    })

    it('"Só em promoção" chama a API com promocao', async () => {
      const router = renderLista('/produtos?pagina=3')
      await screen.findByRole('searchbox')

      fireEvent.click(screen.getByRole('checkbox', { name: 'Só em promoção' }))

      await waitFor(() => expect(ultimosParametros()).toMatchObject({ promocao: true, pagina: 1 }))
      expect(router.state.location.search).toBe('?promocao=1')
    })

    it('as categorias sao marcadas no seletor (com busca), vao para a API e o painel continua aberto', async () => {
      const router = renderLista('/produtos?pagina=3')
      await screen.findByRole('searchbox')
      expect(gatilhoCategoria()).toHaveTextContent('Todas')
      expect(gatilhoCategoria()).toHaveClass('h-11', 'md:h-9')

      fireEvent.click(gatilhoCategoria())
      fireEvent.change(await screen.findByRole('textbox', { name: 'Buscar categoria' }), { target: { value: 'sache' } })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Ração › Sachê' }))

      await waitFor(() => expect(ultimosParametros()).toMatchObject({ categoria: [ID_SACHE], pagina: 1 }))
      expect(router.state.location.search).toBe(`?categoria=${ID_SACHE}`)
      expect(gatilhoCategoria()).toHaveTextContent('Sachê')
      // O botao mostra so o ultimo trecho; o caminho inteiro fica no title.
      expect(gatilhoCategoria()).toHaveAttribute('title', 'Ração › Sachê')

      fireEvent.change(screen.getByRole('textbox', { name: 'Buscar categoria' }), { target: { value: '' } })
      fireEvent.click(screen.getByRole('checkbox', { name: 'Ração' }))

      // Na ordem da arvore: a Ração antes do Sachê.
      await waitFor(() => expect(ultimosParametros()).toMatchObject({ categoria: [ID_RACAO, ID_SACHE] }))
      expect(router.state.location.search).toBe(`?categoria=${ID_RACAO}&categoria=${ID_SACHE}`)
      expect(gatilhoCategoria()).toHaveTextContent('Ração +1')
      expect(gatilhoCategoria()).toHaveAttribute('title', 'Ração, Ração › Sachê')
    })

    it('categoria que nao existe mais na URL mostra "Todas" e oferece "Limpar filtros"', async () => {
      renderLista(`/produtos?categoria=${ID_SUMIDA}`)

      const vazio = await estadoVazio('Nenhum produto encontrado com os filtros escolhidos.')
      await waitFor(() => expect(gatilhoCategoria()).toHaveTextContent('Todas'))
      expect(ultimosParametros().categoria).toEqual([ID_SUMIDA])
      expect(within(vazio).getByRole('button', { name: 'Limpar filtros' })).toBeInTheDocument()
    })

    it('enquanto as categorias carregam, a categoria da URL e mantida', async () => {
      listarCategoriasMock.mockReturnValue(new Promise(() => {}))
      renderLista(`/produtos?categoria=${ID_SUMIDA}`)

      await estadoVazio('Nenhum produto encontrado com os filtros escolhidos.')
      expect(gatilhoCategoria()).toHaveTextContent('Categoria selecionada')
    })

    it('se as categorias falham, a categoria da URL e mantida e aparece um aviso discreto', async () => {
      listarCategoriasMock.mockRejectedValue(new Error('falha'))
      renderLista(`/produtos?categoria=${ID_RACAO}`)

      expect(await screen.findByText('Não foi possível carregar as categorias.')).toBeInTheDocument()
      expect(gatilhoCategoria()).toHaveTextContent('Categoria selecionada')
      expect(ultimosParametros().categoria).toEqual([ID_RACAO])
    })

    it('a URL preenche os filtros na tela', async () => {
      renderLista(`/produtos?busca=arroz&status=todos&categoria=${ID_RACAO}&estoque=zerado&promocao=1&ordem=-margem`)

      await estadoVazio('Nenhum produto encontrado para "arroz" com os filtros escolhidos.')
      expect(campoBusca()).toHaveValue('arroz')
      expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('todos')
      expect(screen.getByRole('button', { name: 'Estoque Zerado' })).toBeInTheDocument()
      expect(screen.getByRole('combobox', { name: 'Ordenar por' })).toHaveValue('-margem')
      expect(screen.getByRole('checkbox', { name: 'Só em promoção' })).toBeChecked()
      await waitFor(() => expect(gatilhoCategoria()).toHaveTextContent('Ração'))
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

    it('"Limpar filtros" com digitacao pendente limpa o campo e o atraso nao grava a busca de novo', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true })
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      const router = renderLista('/produtos?status=inativos')
      await cardDoProduto('Arroz 5kg')

      fireEvent.change(campoBusca(), { target: { value: 'arr' } })
      fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))

      await waitFor(() => expect(router.state.location.search).toBe(''))
      expect(campoBusca()).toHaveValue('')
      // Passa (com folga) o atraso da busca: nada pode ser gravado.
      act(() => vi.advanceTimersByTime(400))
      await consultasOciosas()
      expect(router.state.location.search).toBe('')
      expect(chamadasComBusca('arr')).toHaveLength(0)
    })

    it('no celular, "Filtros (n)" abre e fecha o bloco e conta os filtros ativos', async () => {
      renderLista('/produtos?estoque=zerado&promocao=1')
      await screen.findByRole('searchbox')

      const alternar = screen.getByRole('button', { name: 'Filtros (2)' })
      expect(alternar).toHaveAttribute('aria-expanded', 'false')
      const bloco = document.getElementById(alternar.getAttribute('aria-controls') ?? '') as HTMLElement
      expect(bloco).toHaveClass('hidden', 'md:grid')

      fireEvent.click(alternar)

      expect(alternar).toHaveAttribute('aria-expanded', 'true')
      expect(bloco).not.toHaveClass('hidden')
    })

    it('no celular, a ordem fora do padrao aparece perto do botao Filtros', async () => {
      renderLista('/produtos?ordem=-preco')
      await screen.findByRole('searchbox')

      expect(screen.getByText('Ordem: Maior preço')).toHaveClass('md:hidden')
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

    it('Nome ja e o padrao: um clique inverte para -nome (descending)', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      const router = renderLista()
      const tabela = await screen.findByRole('table')
      const nome = () => within(tabela).getByRole('columnheader', { name: /nome/i })

      fireEvent.click(within(nome()).getByRole('button'))

      await waitFor(() => expect(nome()).toHaveAttribute('aria-sort', 'descending'))
      expect(ultimosParametros().ordem).toBe('-nome')
      expect(router.state.location.search).toBe('?ordem=-nome')
    })

    it.each([
      ['Margem', 'margem'],
      ['Estoque', 'estoque'],
    ] as const)('%s: o primeiro clique ordena ascendente', async (coluna, ordem) => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista()
      const tabela = await screen.findByRole('table')
      const cabecalho = () => within(tabela).getByRole('columnheader', { name: new RegExp(coluna, 'i') })

      fireEvent.click(within(cabecalho()).getByRole('button'))

      await waitFor(() => expect(cabecalho()).toHaveAttribute('aria-sort', 'ascending'))
      expect(ultimosParametros().ordem).toBe(ordem)
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
      expect(screen.getByRole('heading', { name: '60 produtos encontrados' })).toHaveFocus()
    })

    it('o Voltar do navegador volta para a pagina anterior', async () => {
      listarProdutosMock.mockImplementation(async (params) =>
        paginaDe([params.pagina === 1 ? produtoAtivo : produtoSimples], { pagina: params.pagina - 1, totalItens: 60 }),
      )
      const router = renderLista()
      await cardDoProduto('Arroz 5kg')
      fireEvent.click(screen.getByRole('button', { name: /próxima/i }))
      await cardDoProduto('Produto Simples')

      await act(() => router.navigate(-1))

      expect(await cardDoProduto('Arroz 5kg')).toBeInTheDocument()
      expect(router.state.location.search).toBe('')
      expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()
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
      await consultasOciosas()
      expect(chamadasDaLista().map((params) => params.pagina)).toEqual([5, 2])
    })

    it('inativar o unico item da ultima pagina volta para a anterior, sem laco', async () => {
      let inativado = false
      listarProdutosMock.mockImplementation(async (params) => {
        if (params.pagina === 3) {
          return inativado
            ? paginaDe([], { pagina: 2, totalItens: 50 })
            : paginaDe([produtoAtivo], { pagina: 2, totalItens: 51 })
        }
        return paginaDe([produtoSimples], { pagina: params.pagina - 1, totalItens: inativado ? 50 : 51 })
      })
      inativarProdutoMock.mockImplementation(async () => {
        inativado = true
        return { ...produtoAtivo, ativo: false }
      })
      const router = renderLista('/produtos?pagina=3')
      await cardDoProduto('Arroz 5kg')

      const menu = await abrirMenu(await linhaDoProduto('Arroz 5kg'), 'Arroz 5kg')
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inativar' }))

      expect(await screen.findByText('Arroz 5kg inativado. Ele aparece em Status: Inativos.')).toBeInTheDocument()
      await waitFor(() => expect(router.state.location.search).toBe('?pagina=2'))
      expect(router.state.historyAction).toBe('REPLACE')
      expect(await cardDoProduto('Produto Simples')).toBeInTheDocument()
      await consultasOciosas()
      expect(chamadasDaLista().map((params) => params.pagina)).toEqual([3, 3, 2])
    })

    it('voltar a mesma pagina alem do fim corrige de novo (o esqueleto nao fica preso)', async () => {
      listarProdutosMock.mockImplementation(async (params) =>
        params.pagina === 2
          ? paginaDe([produtoAtivo], { pagina: 1, totalItens: 30 })
          : paginaDe([], { pagina: params.pagina - 1, totalItens: 30 }),
      )
      const router = renderLista('/produtos?pagina=5')
      await cardDoProduto('Arroz 5kg')
      expect(router.state.location.search).toBe('?pagina=2')

      await act(() => router.navigate('/produtos?pagina=5'))

      await waitFor(() => expect(router.state.location.search).toBe('?pagina=2'))
      expect(await cardDoProduto('Arroz 5kg')).toBeInTheDocument()
    })
  })

  describe('navegacao e feedback', () => {
    it('"Novo produto" abre /produtos/novo levando a URL da lista', async () => {
      renderLista('/produtos?busca=arroz')

      fireEvent.click(await screen.findByRole('link', { name: /novo produto/i }))

      expect(await screen.findByText('Página do produto /produtos/novo')).toBeInTheDocument()
      expect(screen.getByTestId('estado')).toHaveTextContent(JSON.stringify({ voltarPara: '/produtos?busca=arroz' }))
    })

    it('"Editar" no menu leva a URL completa da lista (filtros e pagina) para a volta da edicao', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo], { totalItens: 60 }))
      renderLista('/produtos?busca=arroz&estoque=baixo&ordem=-preco&pagina=2')

      const menu = await abrirMenu(await linhaDoProduto('Arroz 5kg'), 'Arroz 5kg')
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Editar' }))

      expect(await screen.findByText(`Página do produto /produtos/${ID_ARROZ}`)).toBeInTheDocument()
      expect(screen.getByTestId('estado')).toHaveTextContent(
        JSON.stringify({ voltarPara: '/produtos?busca=arroz&estoque=baixo&ordem=-preco&pagina=2' }),
      )
    })

    it('voltar da edicao restaura filtros e pagina', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo], { pagina: 1, totalItens: 60 }))
      renderLista({
        pathname: '/produtos',
        search: '?busca=arroz&estoque=baixo&pagina=2',
        state: { sucesso: 'Produto salvo com sucesso.' },
      })

      expect(await screen.findByText('Produto salvo com sucesso.')).toBeInTheDocument()
      await cardDoProduto('Arroz 5kg')
      expect(ultimosParametros()).toMatchObject({ busca: 'arroz', estoque: ['baixo'], pagina: 2 })
      expect(campoBusca()).toHaveValue('arroz')
      expect(screen.getByRole('button', { name: 'Estoque Baixo' })).toBeInTheDocument()
      expect(screen.getByText('Página 2 de 3')).toBeInTheDocument()
    })

    it('a mensagem de sucesso sai do historico sem perder a URL', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      const router = renderLista({
        pathname: '/produtos',
        search: '?busca=arroz',
        state: { sucesso: 'Produto cadastrado com sucesso.' },
      })

      expect(await screen.findByText('Produto cadastrado com sucesso.')).toBeInTheDocument()
      await waitFor(() => expect(router.state.location.state).toBeNull())
      expect(router.state.location.search).toBe('?busca=arroz')
    })
  })

  describe('acoes do produto', () => {
    it('na tabela fica visivel so "Estoque"; Editar e Inativar ficam no menu, Inativar como destrutivo', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista()
      const linha = await linhaDoProduto('Arroz 5kg')

      const estoque = within(linha).getByRole('button', { name: 'Ajustar estoque de Arroz 5kg' })
      expect(estoque).toHaveTextContent('Estoque')
      expect(estoque).toHaveClass('h-11', 'md:h-9')
      expect(within(linha).queryByRole('button', { name: /inativar/i })).not.toBeInTheDocument()

      const menu = await abrirMenu(linha, 'Arroz 5kg')
      expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Editar', 'Inativar'])
      expect(within(menu).getByRole('menuitem', { name: 'Inativar' })).toHaveClass('text-destructive')
    })

    it('inativa pelo menu da tabela, recarrega a lista e mostra o sucesso com o nome', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      inativarProdutoMock.mockResolvedValue({ ...produtoAtivo, ativo: false })
      renderLista()
      const linha = await linhaDoProduto('Arroz 5kg')
      const chamadasAntes = chamadasDaLista().length

      const menu = await abrirMenu(linha, 'Arroz 5kg')
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inativar' }))

      await waitFor(() => expect(inativarProdutoMock).toHaveBeenCalledWith(ID_ARROZ))
      expect(await screen.findByText('Arroz 5kg inativado. Ele aparece em Status: Inativos.')).toBeInTheDocument()
      expect(chamadasDaLista().length).toBeGreaterThan(chamadasAntes)
    })

    it('reativa pelo menu do card', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoInativo]))
      reativarProdutoMock.mockResolvedValue({ ...produtoInativo, ativo: true })
      renderLista('/produtos?status=inativos')

      const menu = await abrirMenu(await cardDoProduto('Feijão 1kg'), 'Feijão 1kg')
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Reativar' }))

      await waitFor(() => expect(reativarProdutoMock).toHaveBeenCalledWith(ID_FEIJAO))
      expect(await screen.findByText('Feijão 1kg reativado.')).toBeInTheDocument()
    })

    it('mostra erro amigavel ao falhar a troca de status', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      inativarProdutoMock.mockRejectedValue(new Error('falha ao inativar'))
      renderLista()

      const menu = await abrirMenu(await cardDoProduto('Arroz 5kg'), 'Arroz 5kg')
      fireEvent.click(within(menu).getByRole('menuitem', { name: 'Inativar' }))

      expect(await screen.findByText('Não foi possível alterar o status do produto. Tente novamente.')).toBeInTheDocument()
    })

    it('OPERADOR abre o produto pelo nome, sem acoes de gestao, e ve o aviso de leitura', async () => {
      definirPerfil('OPERADOR')
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista()

      for (const area of [await linhaDoProduto('Arroz 5kg'), await cardDoProduto('Arroz 5kg')]) {
        expect(within(area).getByRole('link', { name: 'Arroz 5kg' })).toHaveAttribute('href', `/produtos/${ID_ARROZ}`)
        expect(within(area).queryByRole('button', { name: /mais ações|ajustar estoque/i })).not.toBeInTheDocument()
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
      expect(
        within(await linhaDoProduto('Arroz 5kg')).getByRole('button', { name: 'Ajustar estoque de Arroz 5kg' }),
      ).toBeInTheDocument()
    })

    it('o modal aberto pela lista vem com o fornecedor da ultima compra na entrada por compra', async () => {
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      renderLista()
      const card = await cardDoProduto('Arroz 5kg')

      fireEvent.click(within(card).getByRole('button', { name: 'Ajustar estoque de Arroz 5kg' }))

      const modal = await screen.findByRole('dialog', { name: 'Ajustar estoque' })
      expect(within(modal).getByRole('button', { name: /^Fornecedor \(opcional\)/ })).toHaveTextContent(
        'Distribuidora Sul',
      )
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
        embalagem: null,
        custoInformado: null,
        custoUnitario: null,
      }
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      ajustarEstoqueMock.mockResolvedValue(SAIDA)
      const router = renderLista()
      const card = await cardDoProduto('Arroz 5kg')

      fireEvent.click(within(card).getByRole('button', { name: 'Ajustar estoque de Arroz 5kg' }))

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
        expect(within(card).getByRole('button', { name: 'Ajustar estoque de Arroz 5kg' })).toHaveFocus(),
      )
    })

    it('a compra pela lista avisa o custo atualizado (Fase B4)', async () => {
      const COMPRA: MovimentoEstoque = {
        id: 'mov-2',
        tipo: 'ENTRADA',
        motivo: 'COMPRA',
        origem: 'AJUSTE_MANUAL',
        quantidade: 5,
        saldoAnterior: 12,
        saldoNovo: 17,
        observacao: null,
        usuarioNome: 'Ana Souza',
        criadoEm: '2026-10-24T10:15:00',
        embalagem: null,
        custoInformado: 10,
        custoUnitario: 10,
      }
      // O Arroz custa R$ 18,00: a compra a R$ 10,00 muda o custo.
      listarProdutosMock.mockResolvedValue(paginaDe([produtoAtivo]))
      ajustarEstoqueMock.mockResolvedValue(COMPRA)
      renderLista()
      const card = await cardDoProduto('Arroz 5kg')

      fireEvent.click(within(card).getByRole('button', { name: 'Ajustar estoque de Arroz 5kg' }))
      const modal = await screen.findByRole('dialog', { name: 'Ajustar estoque' })
      const campoCusto = within(modal).getByRole('textbox', { name: /^custo por UN/i })
      expect(campoCusto).toHaveAccessibleDescription(/^Último custo: R\$\s18,00 por UN\.$/)
      fireEvent.change(within(modal).getByRole('textbox', { name: /^quantidade/i }), { target: { value: '5' } })
      fireEvent.change(campoCusto, { target: { value: '10,00' } })
      fireEvent.click(modal.querySelector('button[type="submit"]') as HTMLElement)

      expect(
        await screen.findByText(
          /^Arroz 5kg: entrada de 5 UN registrada\. Saldo: 17 UN\. Custo atualizado para R\$\s10,00\.$/,
        ),
      ).toBeInTheDocument()
      expect(ajustarEstoqueMock).toHaveBeenCalledWith(ID_ARROZ, expect.objectContaining({ custo: 10 }))
    })
  })
})
