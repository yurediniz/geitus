import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  atualizarProduto,
  cadastrarProduto,
  inativarProduto,
  listarProdutos,
  reativarProduto,
} from '@/services/produtoService'
import { apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type { ProdutoRequest } from '@/types/produto'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPostMock = vi.mocked(apiPost)
const apiPatchMock = vi.mocked(apiPatch)

const produtoRequest: ProdutoRequest = {
  nome: 'Arroz 5kg',
  categoria: null,
  marca: null,
  unidade: 'UN',
  descricao: null,
  precoVenda: 25.9,
  custo: null,
  precoMinimo: null,
  estoqueMinimo: null,
  estoqueMaximo: null,
  pontoReposicao: null,
  codigoBarras: null,
  sku: 'SKU-1',
}

describe('produtoService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista produtos autenticados sem filtros', async () => {
    apiGetMock.mockResolvedValue([])

    await listarProdutos()

    expect(apiGetMock).toHaveBeenCalledWith('/produtos', { autenticada: true })
  })

  it('lista produtos com busca e status ativo', async () => {
    apiGetMock.mockResolvedValue([])

    await listarProdutos({ busca: ' SKU-1 ', status: 'ativos' })

    expect(apiGetMock).toHaveBeenCalledWith('/produtos?busca=SKU-1&ativo=true', { autenticada: true })
  })

  it('codifica busca com espacos e caracteres especiais', async () => {
    apiGetMock.mockResolvedValue([])

    await listarProdutos({ busca: 'café & leite', status: 'todos' })

    expect(apiGetMock).toHaveBeenCalledWith('/produtos?busca=caf%C3%A9+%26+leite', { autenticada: true })
  })

  it('lista produtos com status inativo', async () => {
    apiGetMock.mockResolvedValue([])

    await listarProdutos({ status: 'inativos' })

    expect(apiGetMock).toHaveBeenCalledWith('/produtos?ativo=false', { autenticada: true })
  })

  it('cadastra produto via POST autenticado sem enviar empresaId', async () => {
    apiPostMock.mockResolvedValue({})

    await cadastrarProduto(produtoRequest)

    expect(apiPostMock).toHaveBeenCalledWith('/produtos', produtoRequest, { autenticada: true })
    expect(apiPostMock.mock.calls[0]?.[1]).not.toHaveProperty('empresaId')
  })

  it('atualiza produto via PATCH autenticado', async () => {
    apiPatchMock.mockResolvedValue({})

    await atualizarProduto(7, produtoRequest)

    expect(apiPatchMock).toHaveBeenCalledWith('/produtos/7', produtoRequest, { autenticada: true })
  })

  it('inativa e reativa produto via PATCH autenticado', async () => {
    apiPatchMock.mockResolvedValue({})

    await inativarProduto(7)
    await reativarProduto(7)

    expect(apiPatchMock).toHaveBeenNthCalledWith(1, '/produtos/7/inativar', {}, { autenticada: true })
    expect(apiPatchMock).toHaveBeenNthCalledWith(2, '/produtos/7/reativar', {}, { autenticada: true })
  })
})
