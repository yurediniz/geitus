import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { VendasPage } from '@/features/sales/VendasPage'
import { useAuth } from '@/hooks/useAuth'
import { listarPontos } from '@/services/caixaService'
import { HttpError } from '@/services/httpClient'
import { buscarVenda, listarVendas } from '@/services/pdvService'
import { listarUsuarios } from '@/services/usuarioService'
import { pontoDeTeste } from '@/test/fixturesCaixa'
import { vendaResumo } from '@/test/fixturesPdv'
import type { FiltrosDeVendas, Venda, VendaResumo } from '@/types/pdv'
import type { Usuario } from '@/types/usuario'

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/features/products/produtoFormulario', async (original) => ({
  ...(await original<typeof import('@/features/products/produtoFormulario')>()),
  dataHojeSaoPaulo: () => '2026-10-29',
}))
vi.mock('@/services/pdvService', () => ({
  listarVendas: vi.fn(),
  buscarVenda: vi.fn(),
  cancelarVenda: vi.fn(),
  buscarVendaParaDevolucao: vi.fn(),
  devolverItens: vi.fn(),
}))
vi.mock('@/services/caixaService', () => ({ listarPontos: vi.fn() }))
vi.mock('@/services/usuarioService', () => ({ listarUsuarios: vi.fn() }))
vi.mock('@/services/empresaService', () => ({
  obterEmpresa: vi.fn(async () => {
    throw new Error('Sem a empresa no teste.')
  }),
}))

const useAuthMock = vi.mocked(useAuth)
const listarVendasMock = vi.mocked(listarVendas)
const buscarVendaMock = vi.mocked(buscarVenda)
const listarPontosMock = vi.mocked(listarPontos)
const listarUsuariosMock = vi.mocked(listarUsuarios)

const PONTO_2 = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f'

function definirUsuario(perfil: 'ADMIN' | 'OPERADOR') {
  useAuthMock.mockReturnValue({
    usuario: {
      id: 7,
      nome: 'Ana Souza',
      email: 'ana@mercado.com',
      perfil,
      empresa: { id: 3, nome: 'Mercado Central', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
    },
    token: 'token',
    estaAutenticado: true,
    carregandoSessao: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

function pagina(itens: VendaResumo[], totalItens = itens.length) {
  return { itens, pagina: 0, tamanho: 50, totalItens }
}

function usuario(parcial: Partial<Usuario>): Usuario {
  return {
    id: 7,
    nome: 'Ana Souza',
    email: 'ana@mercado.com',
    perfil: 'OPERADOR',
    ativo: true,
    criadoEm: '2026-01-01T00:00:00Z',
    atualizadoEm: null,
    empresa: { id: 3, nome: 'Mercado Central', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
    ...parcial,
  }
}

function renderPagina(entrada = '/vendas') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const router = createMemoryRouter([{ path: '/vendas', element: <VendasPage /> }], { initialEntries: [entrada] })
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

function ultimoPedido(): FiltrosDeVendas {
  return listarVendasMock.mock.calls.at(-1)?.[0] as FiltrosDeVendas
}

describe('VendasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarVendasMock.mockReset()
    listarPontosMock.mockResolvedValue([pontoDeTeste(), pontoDeTeste({ id: PONTO_2, nome: 'Caixa 2' })])
    listarUsuariosMock.mockResolvedValue([
      usuario({ id: 7, nome: 'Ana Souza' }),
      usuario({ id: 9, nome: 'Bruno Lima', ativo: false }),
    ])
  })

  it('ADMIN: hoje por padrao, a tabela com caixa, vendedor, formas, total e os selos', async () => {
    definirUsuario('ADMIN')
    listarVendasMock.mockResolvedValue(
      pagina([
        vendaResumo({ situacaoDevolucao: 'PARCIAL', clienteNome: 'Maria' }),
        vendaResumo({ id: 'v-127', numero: 127, status: 'CANCELADA', podeCancelar: false, situacaoDevolucao: 'NENHUMA' }),
        vendaResumo({ id: 'v-126', numero: 126, situacaoDevolucao: 'TOTAL', pontoNome: 'Caixa 2', vendedorNome: 'Bruno Lima' }),
      ]),
    )
    renderPagina()

    const tabela = await screen.findByRole('table', { name: '3 vendas' })
    expect(ultimoPedido()).toMatchObject({ sessaoId: '', de: '2026-10-29', ate: '2026-10-29', numero: '', pagina: 1 })
    const [, primeira, segunda, terceira] = within(tabela).getAllByRole('row')
    expect(primeira).toHaveTextContent('Nº 128')
    expect(primeira).toHaveTextContent('24/10/2026 às 18:02')
    expect(primeira).toHaveTextContent('Caixa 1')
    expect(primeira).toHaveTextContent('Ana Souza')
    expect(primeira).toHaveTextContent('Maria')
    expect(primeira).toHaveTextContent('Dinheiro')
    expect(primeira).toHaveTextContent('Devolução parcial')
    expect(segunda).toHaveTextContent('Cancelada')
    expect(terceira).toHaveTextContent('Devolvida')
    expect(screen.getByRole('button', { name: 'Hoje' })).toHaveAttribute('aria-pressed', 'true')
    expect(await screen.findByRole('option', { name: 'Bruno Lima (inativo)' })).toBeInTheDocument()
  })

  it('ADMIN filtra por caixa e por vendedor, na URL e no pedido, voltando a pagina 1', async () => {
    definirUsuario('ADMIN')
    listarVendasMock.mockResolvedValue(pagina([vendaResumo()]))
    const router = renderPagina('/vendas?pagina=3')

    await screen.findByRole('table')
    fireEvent.change(await screen.findByLabelText('Caixa'), { target: { value: PONTO_2 } })
    await waitFor(() => expect(ultimoPedido()).toMatchObject({ pontoId: PONTO_2, pagina: 1 }))
    expect(router.state.location.search).toBe(`?ponto=${PONTO_2}`)

    fireEvent.change(await screen.findByLabelText('Vendedor'), { target: { value: '9' } })
    await waitFor(() => expect(ultimoPedido()).toMatchObject({ pontoId: PONTO_2, vendedorId: '9' }))
    expect(router.state.location.search).toBe(`?ponto=${PONTO_2}&vendedor=9`)
  })

  it('OPERADOR: so as proprias vendas, sem caixa e vendedor; ponto e vendedor da URL nao valem', async () => {
    definirUsuario('OPERADOR')
    listarVendasMock.mockResolvedValue(pagina([vendaResumo()]))
    renderPagina(`/vendas?ponto=${PONTO_2}&vendedor=9`)

    await screen.findByRole('table')
    expect(screen.getByText('As vendas que você fez, da mais recente para a mais antiga.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Caixa')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Vendedor')).not.toBeInTheDocument()
    expect(ultimoPedido()).toMatchObject({ pontoId: '', vendedorId: '' })
    expect(listarUsuariosMock).not.toHaveBeenCalled()
    expect(listarPontosMock).not.toHaveBeenCalled()
  })

  it('o numero procura em qualquer data: o pedido vai sem periodo e o periodo fica esmaecido', async () => {
    definirUsuario('ADMIN')
    listarVendasMock.mockResolvedValue(pagina([]))
    const router = renderPagina('/vendas?de=2026-10-01&ate=2026-10-29')

    expect(await screen.findByText('Nenhuma venda neste período.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nº da venda'), { target: { value: '42' } })

    await waitFor(() => expect(ultimoPedido()).toMatchObject({ numero: '42', de: '', ate: '' }))
    expect(router.state.location.search).toContain('numero=42')
    expect(await screen.findByText('Nenhuma venda nº 42.')).toBeInTheDocument()
    expect(screen.getByText('Buscando em todas as datas. Apague o número para filtrar pelo período.')).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole('button', { name: 'Limpar filtros' })[0])
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.getByLabelText('Nº da venda')).toHaveValue('')
  })

  it('periodo invertido nao consulta e mostra o erro', async () => {
    definirUsuario('ADMIN')
    listarVendasMock.mockResolvedValue(pagina([]))
    renderPagina('/vendas?de=2026-10-29&ate=2026-10-01')

    expect(await screen.findByRole('alert')).toHaveTextContent('A data inicial não pode ser depois da final.')
    expect(screen.getByText('Corrija o período para ver as vendas.')).toBeInTheDocument()
    expect(listarVendasMock).not.toHaveBeenCalled()
  })

  it('falha: "Tentar de novo" consulta outra vez', async () => {
    definirUsuario('ADMIN')
    listarVendasMock
      .mockRejectedValueOnce(new HttpError(500, 'Requisicao falhou (HTTP 500).'))
      .mockResolvedValue(pagina([vendaResumo()]))
    renderPagina()

    expect(await screen.findByText('Não foi possível carregar as vendas.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('paginacao: a proxima pagina vai para a URL e para o pedido', async () => {
    definirUsuario('ADMIN')
    listarVendasMock.mockResolvedValue(pagina([vendaResumo()], 120))
    const router = renderPagina()

    await screen.findByRole('table', { name: '120 vendas' })
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }))

    await waitFor(() => expect(ultimoPedido()).toMatchObject({ pagina: 2 }))
    expect(router.state.location.search).toBe('?pagina=2')
  })

  it('a linha abre a venda numa janela com o detalhe; fechar devolve o foco a linha', async () => {
    definirUsuario('ADMIN')
    listarVendasMock.mockResolvedValue(pagina([vendaResumo()]))
    const venda: Venda = {
      ...vendaResumo(),
      situacaoDevolucao: 'NENHUMA',
      devolucoes: [],
      itens: [
        {
          ordem: 1,
          nome: 'Ração X 1kg',
          embalagemRotulo: null,
          quantidade: 3,
          unidade: 'UN',
          precoUnitario: 24.9,
          origemPreco: 'NORMAL',
          valorBruto: 74.7,
          descontoItem: 0,
          descontoRateado: 0,
          valorLiquido: 74.7,
        },
      ],
    }
    buscarVendaMock.mockResolvedValue(venda)
    renderPagina()

    const tabela = await screen.findByRole('table')
    const botao = within(tabela).getByRole('button', { name: 'Nº 128' })
    botao.focus()
    fireEvent.click(botao)

    const janela = await screen.findByRole('dialog', { name: 'Venda nº 128' })
    expect(await within(janela).findByText('Ração X 1kg')).toBeInTheDocument()
    expect(within(janela).getByRole('button', { name: 'Imprimir comprovante' })).toBeInTheDocument()
    expect(within(janela).getByRole('button', { name: 'Cancelar venda' })).toBeInTheDocument()
    expect(within(janela).getByRole('button', { name: 'Devolver itens' })).toBeInTheDocument()

    fireEvent.click(within(janela).getByRole('button', { name: 'Vendas' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(within(tabela).getByRole('button', { name: 'Nº 128' })).toHaveFocus())
  })
})
