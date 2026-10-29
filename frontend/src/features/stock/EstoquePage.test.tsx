import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { EstoquePage } from '@/features/stock/EstoquePage'
import { useAuth } from '@/hooks/useAuth'
import { listarCategorias } from '@/services/categoriaService'
import { ajustarEstoque, buscarResumoDaPosicao, listarPosicaoDeEstoque } from '@/services/estoqueService'
import type { FiltrosDaPosicao, MovimentoEstoque, PosicaoDeEstoque, ResumoDaPosicao } from '@/types/estoque'
import type { PaginaResponse } from '@/types/produto'

vi.mock('@/services/estoqueService', () => ({
  TAMANHO_PAGINA_POSICAO: 25,
  listarPosicaoDeEstoque: vi.fn(),
  buscarResumoDaPosicao: vi.fn(),
  ajustarEstoque: vi.fn(),
}))

vi.mock('@/services/categoriaService', () => ({
  listarCategorias: vi.fn(),
  cadastrarCategoria: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const listarPosicaoMock = vi.mocked(listarPosicaoDeEstoque)
const resumoMock = vi.mocked(buscarResumoDaPosicao)
const ajustarEstoqueMock = vi.mocked(ajustarEstoque)
const listarCategoriasMock = vi.mocked(listarCategorias)
const useAuthMock = vi.mocked(useAuth)

const ID_LEITE = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e01'
const ID_ARROZ = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02'

function item(extra: Partial<PosicaoDeEstoque>): PosicaoDeEstoque {
  return {
    id: ID_LEITE,
    numero: 15,
    codigo: 542,
    nome: 'Leite Integral',
    unidade: { sigla: 'UN', fracionada: false },
    categoria: { caminho: 'Laticínios' },
    ativo: true,
    saldo: 55,
    situacao: 'REGULAR',
    estoqueMinimo: 5,
    pontoReposicao: 10,
    estoqueMaximo: null,
    custo: 4.5,
    valorEmCusto: 247.5,
    embalagemPrincipal: { sigla: 'CX', quantidade: 12 },
    ...extra,
  }
}

const NEGATIVO = item({
  id: ID_ARROZ,
  numero: 16,
  codigo: null,
  nome: 'Arroz 5 kg',
  categoria: null,
  saldo: -3,
  situacao: 'NEGATIVO',
  valorEmCusto: null,
  embalagemPrincipal: null,
})

const RESUMO: ResumoDaPosicao = {
  produtos: 2,
  negativos: 1,
  zerados: 0,
  baixo: 0,
  reposicao: 0,
  alto: 0,
  valorTotalEmCusto: 247.5,
  semCusto: 0,
}

function paginaDe(itens: PosicaoDeEstoque[]): PaginaResponse<PosicaoDeEstoque> {
  return { itens, pagina: 0, tamanho: 25, totalItens: itens.length }
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

let clienteAtual: QueryClient | null = null

function renderPagina(entrada = '/estoque') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  clienteAtual = queryClient
  const router = createMemoryRouter([{ path: '/estoque', element: <EstoquePage /> }], { initialEntries: [entrada] })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

async function carregada(): Promise<void> {
  await waitFor(() => expect(screen.queryByRole('status', { name: /carregando o estoque/i })).not.toBeInTheDocument())
  await waitFor(() => expect(clienteAtual?.isFetching()).toBe(0))
}

function ultimosFiltros(): FiltrosDaPosicao {
  const chamada = listarPosicaoMock.mock.calls.at(-1)
  if (!chamada) {
    throw new Error('listarPosicaoDeEstoque nao foi chamado')
  }
  return chamada[0]
}

/** Linha da tabela (a partir de 1.024 px) com o nome do produto. */
function linhaDe(nome: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(nome) })
}

describe('EstoquePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
    listarCategoriasMock.mockResolvedValue([])
    resumoMock.mockResolvedValue(RESUMO)
    listarPosicaoMock.mockResolvedValue(paginaDe([item({}), NEGATIVO]))
  })

  it('mostra o resumo, a lista com saldo, conversão, selo, custo e valor', async () => {
    renderPagina()
    await carregada()

    expect(screen.getByRole('heading', { level: 1, name: 'Estoque' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '2 produtos' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^negativo\s*1$/i })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText('R$ 247,50', { selector: 'span.text-xl' })).toBeInTheDocument()

    const leite = linhaDe('Leite Integral')
    expect(within(leite).getByText('55 UN')).toBeInTheDocument()
    expect(within(leite).getByText('(4 CX + 7 UN)')).toBeInTheDocument()
    expect(within(leite).getByText('Nº 15 · Cód. 542')).toBeInTheDocument()
    expect(within(leite).getByText('R$ 4,50')).toBeInTheDocument()
    expect(within(leite).getByText('R$ 247,50')).toBeInTheDocument()
    expect(within(leite).getByRole('link', { name: 'Leite Integral' })).toHaveAttribute('href', `/produtos/${ID_LEITE}`)

    const arroz = linhaDe('Arroz 5 kg')
    expect(within(arroz).getByText('-3 UN')).toBeInTheDocument()
    expect(within(arroz).getByText('Negativo')).toBeInTheDocument()
    expect(within(arroz).getByText('Sem saldo')).toBeInTheDocument()
  })

  it('os cinco cards mostram as contagens exclusivas, sem a linha "inclui"', async () => {
    resumoMock.mockResolvedValue({ ...RESUMO, negativos: 1, zerados: 2, baixo: 3, reposicao: 4, alto: 5 })
    renderPagina()
    await carregada()

    for (const [titulo, quantidade] of [
      ['Negativo', 1],
      ['Zerado', 2],
      ['Baixo', 3],
      ['Reposição', 4],
      ['Alto', 5],
    ] as const) {
      expect(await screen.findByRole('button', { name: new RegExp(`^${titulo}\\s*${quantidade}$`, 'i') })).toHaveAttribute(
        'aria-pressed',
        'false',
      )
    }
    expect(screen.queryByText(/inclui|também em/i)).not.toBeInTheDocument()
  })

  it('o filtro "Situação" tem as mesmas opções da lista de produtos e vai para a URL', async () => {
    const router = renderPagina()
    await carregada()

    const situacao = screen.getByRole('combobox', { name: 'Situação' })
    expect(within(situacao).getAllByRole('option').map((opcao) => (opcao as HTMLOptionElement).value)).toEqual([
      '',
      'repor',
      'negativo',
      'zerado',
      'baixo',
      'reposicao',
      'regular',
      'alto',
    ])
    fireEvent.change(situacao, { target: { value: 'repor' } })

    await waitFor(() => expect(router.state.location.search).toBe('?situacao=repor'))
    await waitFor(() => expect(ultimosFiltros().situacao).toBe('repor'))
  })

  it('o card de situação liga e desliga o filtro na URL', async () => {
    const router = renderPagina()
    await carregada()

    fireEvent.click(screen.getByRole('button', { name: /^negativo\s*\d/i }))

    await waitFor(() => expect(router.state.location.search).toBe('?situacao=negativo'))
    await waitFor(() => expect(ultimosFiltros().situacao).toBe('negativo'))
    expect(screen.getByRole('button', { name: /^negativo\s*\d/i })).toHaveAttribute('aria-pressed', 'true')
    // O resumo nao depende da situacao: nao consulta de novo.
    expect(resumoMock).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /^negativo\s*\d/i }))

    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('lê os filtros da URL e ignora valores inválidos', async () => {
    renderPagina('/estoque?situacao=baixo&ordem=-valor&status=xyz&pagina=2')
    await carregada()

    expect(ultimosFiltros()).toEqual({
      busca: '',
      status: 'ativos',
      categoria: null,
      situacao: 'baixo',
      ordem: '-valor',
      pagina: 2,
    })
  })

  it('o cabeçalho Saldo ordena pela coluna e inverte no segundo clique', async () => {
    const router = renderPagina()
    await carregada()

    fireEvent.click(screen.getByRole('button', { name: /^saldo/i }))
    await waitFor(() => expect(router.state.location.search).toBe('?ordem=saldo'))
    await carregada()

    fireEvent.click(screen.getByRole('button', { name: /^saldo/i }))
    await waitFor(() => expect(router.state.location.search).toBe('?ordem=-saldo'))
  })

  it('"Regularizar" só aparece no negativo e abre o ajuste na Contagem', async () => {
    renderPagina()
    await carregada()

    expect(within(linhaDe('Leite Integral')).queryByRole('button', { name: /regularizar/i })).not.toBeInTheDocument()

    fireEvent.click(within(linhaDe('Arroz 5 kg')).getByRole('button', { name: 'Regularizar o estoque de Arroz 5 kg' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Ajustar estoque' })
    expect(within(dialogo).getByRole('radio', { name: 'Contagem' })).toBeChecked()
    expect(within(dialogo).getByText('Saldo atual: -3 UN')).toBeInTheDocument()
    expect(within(dialogo).getByText('Arroz 5 kg')).toBeInTheDocument()
    expect(within(dialogo).getByText(/saldo ficou negativo por vendas sem estoque/i)).toBeInTheDocument()
  })

  it('o primeiro clique em Valor ordena do maior para o menor', async () => {
    const router = renderPagina()
    await carregada()

    fireEvent.click(screen.getByRole('button', { name: /^valor/i }))

    await waitFor(() => expect(router.state.location.search).toBe('?ordem=-valor'))
  })

  it('"Ajustar" abre o ajuste na Entrada', async () => {
    renderPagina()
    await carregada()

    fireEvent.click(within(linhaDe('Leite Integral')).getByRole('button', { name: 'Ajustar o estoque de Leite Integral' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Ajustar estoque' })
    expect(within(dialogo).getByRole('radio', { name: 'Entrada' })).toBeChecked()
    expect(within(dialogo).getByText('Saldo atual: 55 UN')).toBeInTheDocument()
  })

  it('regularizar com sucesso mostra o resumo com o nome do produto e fecha o modal', async () => {
    const movimento: MovimentoEstoque = {
      id: 'mov-1',
      tipo: 'AJUSTE',
      motivo: 'CONTAGEM',
      origem: 'AJUSTE_MANUAL',
      quantidade: 8,
      saldoAnterior: -3,
      saldoNovo: 5,
      observacao: null,
      usuarioNome: 'Ana Souza',
      criadoEm: '2026-10-27T10:00:00',
      embalagem: null,
      custoInformado: null,
      custoUnitario: null,
    }
    ajustarEstoqueMock.mockResolvedValue(movimento)
    renderPagina()
    await carregada()

    fireEvent.click(within(linhaDe('Arroz 5 kg')).getByRole('button', { name: 'Regularizar o estoque de Arroz 5 kg' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Ajustar estoque' })
    fireEvent.change(within(dialogo).getByRole('textbox', { name: /saldo contado/i }), { target: { value: '5' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: /ajustar para 5 un/i }))

    expect(await screen.findByText(/^Arroz 5 kg: /)).toBeInTheDocument()
    expect(ajustarEstoqueMock).toHaveBeenCalledWith(ID_ARROZ, expect.objectContaining({ tipo: 'AJUSTE', quantidade: 5 }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('o OPERADOR lê sem ações e vê o aviso de leitura', async () => {
    definirPerfil('OPERADOR')
    renderPagina()
    await carregada()

    expect(screen.getByText(/somente administradores podem ajustar o estoque/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /regularizar|ajustar o estoque/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Ações' })).not.toBeInTheDocument()
  })

  it('vazio sem filtro convida a ir para Produtos', async () => {
    listarPosicaoMock.mockResolvedValue(paginaDe([]))
    renderPagina()
    await carregada()

    expect(screen.getByText('Nenhum produto ativo controla estoque.', { selector: 'p.font-medium' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para Produtos' })).toHaveAttribute('href', '/produtos')
    expect(screen.getByRole('button', { name: 'Ver também os inativos' })).toBeInTheDocument()
  })

  it('vazio com filtro oferece limpar os filtros', async () => {
    listarPosicaoMock.mockResolvedValue(paginaDe([]))
    const router = renderPagina('/estoque?situacao=negativo')
    await carregada()

    expect(screen.getAllByText('Nenhum produto neste filtro.')).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: /limpar filtros/i })[0])
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('se o resumo falhar, avisa e oferece tentar de novo', async () => {
    resumoMock.mockRejectedValueOnce(new Error('rede'))
    renderPagina()
    await carregada()

    expect(screen.getByText('Não foi possível carregar o resumo do estoque.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar carregar o resumo de novo' }))

    expect(await screen.findByRole('button', { name: /^negativo\s*1$/i })).toBeInTheDocument()
  })

  it('vazio com o status Todos conta como filtro e oferece limpar', async () => {
    listarPosicaoMock.mockResolvedValue(paginaDe([]))
    resumoMock.mockResolvedValue({ ...RESUMO, produtos: 0, negativos: 0, valorTotalEmCusto: 0 })
    renderPagina('/estoque?status=todos')
    await carregada()

    expect(screen.getByText('Nenhum produto neste filtro.', { selector: 'p.font-medium' })).toBeInTheDocument()
  })

  it('erro ao carregar mostra o alerta e tenta de novo', async () => {
    listarPosicaoMock.mockRejectedValueOnce(new Error('rede'))
    renderPagina()

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar o estoque.')
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('heading', { level: 2, name: '2 produtos' })).toBeInTheDocument()
  })
})
