import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { EstoquePage } from '@/features/stock/EstoquePage'
import { useAuth } from '@/hooks/useAuth'
import { listarCategorias } from '@/services/categoriaService'
import { buscarResumoDaPosicao, listarMovimentacoes, listarPosicaoDeEstoque } from '@/services/estoqueService'
import { HttpError } from '@/services/httpClient'
import { buscarVenda } from '@/services/pdvService'
import { buscarProduto, listarProdutos } from '@/services/produtoService'
import { listarUsuarios } from '@/services/usuarioService'
import type { FiltrosDasMovimentacoes, MovimentacaoDeEstoque } from '@/types/estoque'
import type { Venda } from '@/types/pdv'
import type { PaginaResponse, Produto } from '@/types/produto'
import type { Usuario } from '@/types/usuario'

vi.mock('@/services/estoqueService', () => ({
  TAMANHO_PAGINA_POSICAO: 25,
  listarPosicaoDeEstoque: vi.fn(),
  buscarResumoDaPosicao: vi.fn(),
  listarMovimentacoes: vi.fn(),
  ajustarEstoque: vi.fn(),
}))

vi.mock('@/services/usuarioService', () => ({
  listarUsuarios: vi.fn(),
}))

vi.mock('@/services/produtoService', () => ({
  listarProdutos: vi.fn(),
  buscarProduto: vi.fn(),
}))

vi.mock('@/services/pdvService', () => ({
  buscarVenda: vi.fn(),
}))

vi.mock('@/services/categoriaService', () => ({
  listarCategorias: vi.fn(),
  cadastrarCategoria: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

vi.mock('@/features/products/produtoFormulario', async (original) => ({
  ...(await original<typeof import('@/features/products/produtoFormulario')>()),
  dataHojeSaoPaulo: () => '2026-10-29',
}))

const listarMovimentacoesMock = vi.mocked(listarMovimentacoes)
const listarUsuariosMock = vi.mocked(listarUsuarios)
const listarProdutosMock = vi.mocked(listarProdutos)
const buscarProdutoMock = vi.mocked(buscarProduto)
const buscarVendaMock = vi.mocked(buscarVenda)
const useAuthMock = vi.mocked(useAuth)

const ID_ARROZ = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02'
const ABA = '/estoque?aba=movimentacoes'

function movimento(extra: Partial<MovimentacaoDeEstoque>): MovimentacaoDeEstoque {
  return {
    id: 'mov-1',
    tipo: 'SAIDA',
    motivo: 'VENDA',
    origem: 'VENDA',
    quantidade: -2,
    saldoAnterior: 12,
    saldoNovo: 10,
    observacao: null,
    usuarioNome: 'Ana Souza',
    criadoEm: '2026-10-29T10:15:00',
    embalagem: null,
    custoInformado: null,
    custoUnitario: null,
    fornecedor: null,
    produto: { id: ID_ARROZ, numero: 16, nome: 'Arroz 5 kg', unidade: { sigla: 'UN', fracionada: false } },
    venda: { id: 'venda-1', numero: 123 },
    ...extra,
  }
}

const AJUSTE = movimento({
  id: 'mov-2',
  tipo: 'AJUSTE',
  motivo: 'CONTAGEM',
  origem: 'AJUSTE_MANUAL',
  quantidade: 3,
  saldoAnterior: -3,
  saldoNovo: 0,
  observacao: 'Regularizado após contagem',
  usuarioNome: 'Admin Geral',
  venda: null,
})

function paginaDe(itens: MovimentacaoDeEstoque[], totalItens = itens.length, pagina = 0): PaginaResponse<MovimentacaoDeEstoque> {
  return { itens, pagina, tamanho: 25, totalItens }
}

function usuario(id: number, nome: string, ativo = true): Usuario {
  return {
    id,
    nome,
    email: `${id}@mercado.com`,
    perfil: 'OPERADOR',
    ativo,
    criadoEm: '2026-01-01T00:00:00Z',
    atualizadoEm: null,
    empresa: { id: 1, nome: 'Mercado Central', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
  }
}

/** Produto da busca e do `buscarProduto` (so os campos que a tela le). */
function produto(id: string, nome: string, numero: number): Produto {
  return { id, nome, numero, ativo: true } as Produto
}

const VENDA: Venda = {
  id: 'venda-1',
  numero: 123,
  status: 'CONCLUIDA',
  sessaoId: 'sessao-1',
  pontoNome: 'Caixa 1',
  concluidaEm: '2026-10-29T10:15:00-03:00',
  vendedorNome: 'Ana Souza',
  clienteNome: null,
  itens: [
    {
      ordem: 1,
      nome: 'Arroz 5 kg',
      embalagemRotulo: null,
      quantidade: 2,
      unidade: 'UN',
      precoUnitario: 25,
      origemPreco: 'NORMAL',
      valorBruto: 50,
      descontoItem: 0,
      descontoRateado: 0,
      valorLiquido: 50,
    },
  ],
  subtotal: 50,
  descontoItens: 0,
  descontoTotal: 0,
  total: 50,
  pagamentos: [{ forma: 'PIX', valor: 50 }],
  troco: 0,
  cancelamento: null,
  podeCancelar: false,
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

function renderPagina(entrada = ABA) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter([{ path: '/estoque', element: <EstoquePage /> }], { initialEntries: [entrada] })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function ultimosFiltros(): FiltrosDasMovimentacoes {
  const chamada = listarMovimentacoesMock.mock.calls.at(-1)
  if (!chamada) {
    throw new Error('listarMovimentacoes nao foi chamado')
  }
  return chamada[0]
}

async function listaCarregada(): Promise<HTMLElement> {
  return screen.findByRole('list', { name: 'Movimentações de estoque' })
}

describe('Aba Movimentações', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
    vi.mocked(listarCategorias).mockResolvedValue([])
    vi.mocked(buscarResumoDaPosicao).mockResolvedValue({
      produtos: 0,
      semEstoque: 0,
      baixo: 0,
      negativos: 0,
      valorTotalEmCusto: 0,
      semCusto: 0,
    })
    vi.mocked(listarPosicaoDeEstoque).mockResolvedValue({ itens: [], pagina: 0, tamanho: 25, totalItens: 0 })
    listarMovimentacoesMock.mockResolvedValue(paginaDe([movimento({}), AJUSTE]))
    listarUsuariosMock.mockResolvedValue([usuario(8, 'Bruno'), usuario(7, 'Ana Souza'), usuario(9, 'Carla', false)])
  })

  it('lista do mais recente com produto, tipo e motivo, quantidade, saldos, usuário e venda', async () => {
    renderPagina()
    const lista = await listaCarregada()

    expect(screen.getByRole('tab', { name: 'Movimentações' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { level: 2, name: 'Movimentações' })).toBeInTheDocument()
    const [venda, ajuste] = within(lista).getAllByRole('listitem')
    expect(within(venda).getByRole('link', { name: 'Arroz 5 kg' })).toHaveAttribute('href', `/produtos/${ID_ARROZ}`)
    expect(within(venda).getByText('Saída · Venda')).toBeInTheDocument()
    expect(within(venda).getByText('−2 UN')).toBeInTheDocument()
    expect(within(venda).getByText('12 → 10')).toBeInTheDocument()
    expect(within(venda).getByText('Venda nº 123')).toBeInTheDocument()
    expect(within(venda).getByText('Ana Souza')).toBeInTheDocument()
    expect(within(ajuste).getByText('Ajuste · Contagem/inventário')).toBeInTheDocument()
    expect(within(ajuste).getByText('Regularizado após contagem')).toBeInTheDocument()
    expect(within(ajuste).queryByText(/Venda nº/)).not.toBeInTheDocument()
    // Sem filtros na URL: os ultimos 30 dias.
    expect(ultimosFiltros()).toEqual({ de: '2026-09-30', ate: '2026-10-29', produto: null, tipo: null, motivo: null, usuario: null })
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('carrega mais pela próxima página', async () => {
    listarMovimentacoesMock.mockResolvedValueOnce(paginaDe([movimento({})], 2))
    listarMovimentacoesMock.mockResolvedValueOnce(paginaDe([AJUSTE], 2, 1))
    renderPagina()
    await listaCarregada()

    fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }))

    await waitFor(() => expect(screen.getByText('Regularizado após contagem')).toBeInTheDocument())
    expect(listarMovimentacoesMock.mock.calls.at(-1)?.[1]).toBe(1)
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()
  })

  it('atalho e tipo filtram pela URL, e o motivo mostra só os do tipo', async () => {
    const router = renderPagina()
    await listaCarregada()

    fireEvent.click(screen.getByRole('button', { name: 'Hoje' }))
    await waitFor(() => expect(router.state.location.search).toBe('?aba=movimentacoes&de=2026-10-29&ate=2026-10-29'))

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'AJUSTE' } })
    await waitFor(() => expect(ultimosFiltros().tipo).toBe('AJUSTE'))
    const motivos = within(screen.getByLabelText('Motivo')).getAllByRole('option').map((opcao) => opcao.textContent)
    expect(motivos).toEqual(['Todos', 'Contagem/inventário', 'Outro'])
  })

  it('o ADMIN filtra por usuário, com os nomes em ordem e o inativo marcado', async () => {
    renderPagina()
    await listaCarregada()

    const select = await screen.findByLabelText('Usuário')
    await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(4))
    expect(within(select).getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
      'Todos',
      'Ana Souza',
      'Bruno',
      'Carla (inativo)',
    ])

    fireEvent.change(select, { target: { value: '8' } })

    await waitFor(() => expect(ultimosFiltros().usuario).toBe(8))
  })

  it('o OPERADOR lê sem o filtro de usuário e sem consultar os usuários', async () => {
    definirPerfil('OPERADOR')
    renderPagina()
    await listaCarregada()

    expect(screen.queryByLabelText('Usuário')).not.toBeInTheDocument()
    expect(listarUsuariosMock).not.toHaveBeenCalled()
  })

  it('para o OPERADOR, um usuário vindo na URL não filtra escondido', async () => {
    definirPerfil('OPERADOR')
    renderPagina(`${ABA}&usuario=8`)
    await listaCarregada()

    expect(ultimosFiltros().usuario).toBeNull()
  })

  it('período invertido mostra o erro e não consulta a lista', async () => {
    renderPagina(`${ABA}&de=2026-10-20&ate=2026-10-10`)

    expect(await screen.findByRole('alert')).toHaveTextContent('A data inicial deve ser anterior à final.')
    expect(listarMovimentacoesMock).not.toHaveBeenCalled()
  })

  it('lista vazia com filtro oferece limpar os filtros', async () => {
    listarMovimentacoesMock.mockResolvedValue(paginaDe([]))
    const router = renderPagina(`${ABA}&tipo=SAIDA`)

    expect(await screen.findByText('Nenhuma movimentação neste período.')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: /limpar filtros/i }).at(-1) as HTMLElement)

    await waitFor(() => expect(router.state.location.search).toBe('?aba=movimentacoes'))
  })

  it('escolher um produto na busca filtra pela URL e mostra o nome', async () => {
    listarProdutosMock.mockResolvedValue({ itens: [produto('3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02', 'Arroz 5 kg', 16)], pagina: 0, tamanho: 8, totalItens: 1 })
    const router = renderPagina()
    await listaCarregada()

    fireEvent.click(screen.getByRole('button', { name: /produto\s*todos/i }))
    fireEvent.click(await screen.findByRole('option', { name: /arroz 5 kg/i }))

    await waitFor(() => expect(router.state.location.search).toBe('?aba=movimentacoes&produto=3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02'))
    await waitFor(() => expect(ultimosFiltros().produto).toBe('3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02'))
    expect(screen.getByRole('button', { name: /produto\s*arroz 5 kg/i })).toBeInTheDocument()
    // O nome ja veio da busca: nao consulta o produto.
    expect(buscarProdutoMock).not.toHaveBeenCalled()
  })

  it('vindo da URL, o nome do produto é carregado pelo id', async () => {
    buscarProdutoMock.mockResolvedValue(produto('3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02', 'Arroz 5 kg', 16))
    renderPagina(`${ABA}&produto=3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02`)

    expect(await screen.findByRole('button', { name: /produto\s*arroz 5 kg/i })).toBeInTheDocument()
    expect(buscarProdutoMock).toHaveBeenCalledWith('3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02')
    expect(ultimosFiltros().produto).toBe('3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02')
  })

  it('produto da URL que não existe mais sai do filtro com um aviso', async () => {
    buscarProdutoMock.mockRejectedValue(new HttpError(404, 'Produto não encontrado.'))
    const router = renderPagina(`${ABA}&produto=3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02`)

    expect(await screen.findByText('Produto do filtro não encontrado.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.search).toBe('?aba=movimentacoes'))
    // Substitui a entrada do historico: o Voltar do navegador nao volta para o produto inexistente.
    expect(router.state.historyAction).toBe('REPLACE')
    expect(screen.getByRole('button', { name: /produto\s*todos/i })).toBeInTheDocument()
  })

  it('o ADMIN abre a venda do movimento numa janela', async () => {
    buscarVendaMock.mockResolvedValue(VENDA)
    renderPagina()
    await listaCarregada()

    const botao = screen.getByRole('button', { name: /^Venda\snº\s123$/ })
    fireEvent.click(botao)

    const janela = await screen.findByRole('dialog', { name: 'Venda nº 123' })
    expect(await within(janela).findByRole('list', { name: 'Itens da venda nº 123' })).toBeInTheDocument()
    expect(within(janela).getByText('Arroz 5 kg')).toBeInTheDocument()
    expect(within(janela).getByText('Total')).toBeInTheDocument()
    expect(buscarVendaMock).toHaveBeenCalledWith('venda-1')

    // O "Fechar" do rodape (o X do canto tem o mesmo nome).
    fireEvent.click(within(janela).getAllByRole('button', { name: 'Fechar' }).at(-1) as HTMLElement)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(botao).toHaveFocus()
  })

  it('venda que não está mais disponível mostra a mensagem', async () => {
    buscarVendaMock.mockRejectedValue(new HttpError(404, 'Venda não encontrada.'))
    renderPagina()
    await listaCarregada()

    fireEvent.click(screen.getByRole('button', { name: /^Venda\snº\s123$/ }))

    const janela = await screen.findByRole('dialog', { name: 'Venda nº 123' })
    expect(await within(janela).findByText('Esta venda não está mais disponível.')).toBeInTheDocument()
    expect(buscarVendaMock).toHaveBeenCalledTimes(1)
  })

  it('para o OPERADOR, o número da venda é só texto', async () => {
    definirPerfil('OPERADOR')
    renderPagina()
    await listaCarregada()

    expect(screen.getByText('Venda nº 123')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Venda\snº\s123$/ })).not.toBeInTheDocument()
  })

  it('as abas trocam pela URL, e a Posição continua sendo a aba padrão', async () => {
    const router = renderPagina('/estoque?situacao=negativo')

    expect(await screen.findByRole('tab', { name: 'Posição' })).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByRole('tab', { name: 'Movimentações' }))
    await waitFor(() => expect(router.state.location.search).toBe('?aba=movimentacoes'))
    await listaCarregada()

    fireEvent.keyDown(screen.getByRole('tab', { name: 'Movimentações' }), { key: 'ArrowLeft' })

    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.getByRole('tab', { name: 'Posição' })).toHaveFocus()
  })
})
