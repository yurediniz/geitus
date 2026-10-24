import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { FornecedoresPage } from '@/features/suppliers/FornecedoresPage'
import { useAuth } from '@/hooks/useAuth'
import { HttpError } from '@/services/httpClient'
import {
  inativarFornecedor,
  listarFornecedores,
  reativarFornecedor,
  type ListarFornecedoresParams,
} from '@/services/fornecedorService'
import type { FornecedorItemLista } from '@/types/fornecedor'
import type { PaginaResponse } from '@/types/produto'

vi.mock('@/services/fornecedorService', () => ({
  TAMANHO_PAGINA_FORNECEDORES: 25,
  listarFornecedores: vi.fn(),
  inativarFornecedor: vi.fn(),
  reativarFornecedor: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const listarFornecedoresMock = vi.mocked(listarFornecedores)
const inativarFornecedorMock = vi.mocked(inativarFornecedor)
const reativarFornecedorMock = vi.mocked(reativarFornecedor)
const useAuthMock = vi.mocked(useAuth)

function definirPerfil(perfil: 'ADMIN' | 'OPERADOR') {
  useAuthMock.mockReturnValue({
    usuario: {
      id: 1,
      nome: 'Ana Souza',
      email: 'ana@petshop.com',
      perfil,
      empresa: { id: 1, nome: 'Pet Central', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
    },
    token: 'token',
    estaAutenticado: true,
    carregandoSessao: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

const DIST_SUL: FornecedorItemLista = {
  id: 'dist-sul',
  numero: 1,
  razaoSocial: 'Distribuidora Sul Ltda',
  nomeFantasia: 'Dist Sul',
  tipoPessoa: 'PJ',
  documento: '11222333000181',
  telefone: '1132104000',
  representantePrincipal: { nome: 'Carlos Lima', telefone: '11987654321' },
  quantidadeProdutos: 12,
  ativo: true,
}

const JOAO: FornecedorItemLista = {
  id: 'joao',
  numero: 2,
  razaoSocial: 'João da Silva',
  nomeFantasia: null,
  tipoPessoa: 'PF',
  documento: '11144477735',
  telefone: null,
  representantePrincipal: null,
  quantidadeProdutos: 0,
  ativo: false,
}

function paginaCom(itens: FornecedorItemLista[], totalItens = itens.length): PaginaResponse<FornecedorItemLista> {
  return { itens, pagina: 0, tamanho: 25, totalItens }
}

/** Chamadas da lista (sem a consulta "existe algum?", de tamanho 1). */
function chamadasDaLista(): ListarFornecedoresParams[] {
  return listarFornecedoresMock.mock.calls.map(([params]) => params).filter((params) => params.tamanho !== 1)
}

function renderLista(entrada = '/produtos/fornecedores') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const router = createMemoryRouter(
    [
      { path: '/produtos/fornecedores', element: <FornecedoresPage /> },
      { path: '/produtos/fornecedores/novo', element: <h1>Novo fornecedor</h1> },
      { path: '/produtos/fornecedores/:id', element: <h1>Página do fornecedor</h1> },
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

describe('FornecedoresPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mostra a tabela (a partir de 1024 px) e os cards (abaixo) com as colunas da spec', async () => {
    listarFornecedoresMock.mockResolvedValue(paginaCom([DIST_SUL, JOAO]))

    renderLista()

    const tabela = await screen.findByRole('table', { name: '2 fornecedores' })
    expect(tabela.parentElement).toHaveClass('hidden', 'lg:block')
    expect(within(tabela).getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Nº',
      'Nome',
      'CNPJ/CPF',
      'Telefone',
      'Representante',
      'Produtos',
      'Status',
      'Ações',
    ])
    const linha = within(tabela).getAllByRole('row')[1]
    expect(linha).toHaveTextContent('Distribuidora Sul Ltda')
    expect(linha).toHaveTextContent('Dist Sul')
    expect(linha).toHaveTextContent('11.222.333/0001-81')
    expect(linha).toHaveTextContent('(11) 3210-4000')
    expect(linha).toHaveTextContent('Carlos Lima')
    expect(linha).toHaveTextContent('(11) 98765-4321')
    expect(within(tabela).getAllByRole('row')[2]).toHaveTextContent('111.444.777-35')

    const cards = screen.getByRole('list', { name: 'Fornecedores' })
    expect(cards).toHaveClass('lg:hidden')
    expect(within(cards).getByRole('article', { name: 'João da Silva' })).toHaveTextContent('Inativo')
    expect(listarFornecedoresMock).toHaveBeenCalledWith({ busca: '', status: 'ativos', pagina: 1 }, expect.anything())
  })

  it('guarda a busca (enquanto se digita) e o status na URL', async () => {
    listarFornecedoresMock.mockResolvedValue(paginaCom([DIST_SUL]))
    vi.useFakeTimers({ shouldAdvanceTime: true })

    const router = renderLista()
    await screen.findByRole('table')
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar fornecedores' }), { target: { value: ' carlos ' } })
    act(() => vi.advanceTimersByTime(300))

    await waitFor(() => expect(router.state.location.search).toBe('?busca=carlos'))
    await waitFor(() => expect(chamadasDaLista().at(-1)).toEqual({ busca: 'carlos', status: 'ativos', pagina: 1 }))

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'inativos' } })
    await waitFor(() => expect(router.state.location.search).toBe('?busca=carlos&status=inativos'))
    await waitFor(() => expect(chamadasDaLista().at(-1)).toEqual({ busca: 'carlos', status: 'inativos', pagina: 1 }))
  })

  it('abre com a busca e o status da URL', async () => {
    listarFornecedoresMock.mockResolvedValue(paginaCom([JOAO]))

    renderLista('/produtos/fornecedores?busca=joao&status=todos')

    await screen.findByRole('table')
    expect(screen.getByRole('searchbox', { name: 'Buscar fornecedores' })).toHaveValue('joao')
    expect(screen.getByLabelText('Status')).toHaveValue('todos')
    expect(chamadasDaLista()[0]).toEqual({ busca: 'joao', status: 'todos', pagina: 1 })
  })

  it('lista vazia sem nenhum fornecedor: "Nenhum fornecedor cadastrado." com o botão', async () => {
    listarFornecedoresMock.mockResolvedValue(paginaCom([]))

    renderLista()

    const vazio = await screen.findByRole('region', { name: 'Nenhum fornecedor cadastrado.' })
    expect(within(vazio).getByRole('link', { name: 'Novo fornecedor' })).toHaveAttribute(
      'href',
      '/produtos/fornecedores/novo',
    )
  })

  it('busca sem resultado: oferece buscar nos inativos e limpar', async () => {
    listarFornecedoresMock.mockResolvedValue(paginaCom([]))

    renderLista('/produtos/fornecedores?busca=xyz')

    const vazio = await screen.findByRole('region', { name: 'Nenhum fornecedor encontrado para "xyz".' })
    fireEvent.click(within(vazio).getByRole('button', { name: 'Buscar também nos inativos' }))
    await waitFor(() => expect(chamadasDaLista().at(-1)).toEqual({ busca: 'xyz', status: 'todos', pagina: 1 }))
  })

  it('mostra o carregando e, na falha, o erro com "Tentar de novo"', async () => {
    let falhar: (erro: unknown) => void = () => undefined
    listarFornecedoresMock.mockReturnValueOnce(
      new Promise((_, rejeitar) => {
        falhar = rejeitar
      }),
    )

    renderLista()

    expect(screen.getByRole('status', { name: 'Carregando fornecedores' })).toBeInTheDocument()
    act(() => falhar(new HttpError(500, 'Requisicao falhou (HTTP 500).')))
    expect(await screen.findByText('Não foi possível carregar os fornecedores.')).toBeInTheDocument()
    expect(screen.queryByText(/HTTP 500/)).not.toBeInTheDocument()

    listarFornecedoresMock.mockResolvedValue(paginaCom([DIST_SUL]))
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByRole('table')).toBeInTheDocument()
  })

  it('inativa e reativa pela lista com o feedback', async () => {
    listarFornecedoresMock.mockResolvedValue(paginaCom([DIST_SUL, JOAO]))
    inativarFornecedorMock.mockResolvedValue({} as never)
    reativarFornecedorMock.mockResolvedValue({} as never)

    renderLista()

    const tabela = await screen.findByRole('table')
    fireEvent.click(within(tabela).getByRole('button', { name: 'Inativar Distribuidora Sul Ltda' }))
    await waitFor(() => expect(inativarFornecedorMock).toHaveBeenCalledWith('dist-sul'))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Distribuidora Sul Ltda inativado. Ele aparece em Status: Inativos.',
    )

    fireEvent.click(within(tabela).getByRole('button', { name: 'Reativar João da Silva' }))
    await waitFor(() => expect(reativarFornecedorMock).toHaveBeenCalledWith('joao'))
  })

  it('OPERADOR só lê: sem "Novo fornecedor" nem inativar', async () => {
    definirPerfil('OPERADOR')
    listarFornecedoresMock.mockResolvedValue(paginaCom([DIST_SUL]))

    renderLista()

    await screen.findByRole('table')
    expect(
      screen.getByText('Somente administradores podem gerenciar fornecedores. Você está no modo leitura.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Novo fornecedor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Inativar/ })).not.toBeInTheDocument()
  })

  it('o nome abre o fornecedor levando a URL da lista para voltar', async () => {
    listarFornecedoresMock.mockResolvedValue(paginaCom([DIST_SUL]))

    const router = renderLista('/produtos/fornecedores?status=todos')

    const tabela = await screen.findByRole('table')
    fireEvent.click(within(tabela).getByRole('link', { name: 'Distribuidora Sul Ltda' }))
    expect(await screen.findByRole('heading', { name: 'Página do fornecedor' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/produtos/fornecedores/dist-sul')
    expect(router.state.location.state).toEqual({ voltarPara: '/produtos/fornecedores?status=todos' })
  })
})
