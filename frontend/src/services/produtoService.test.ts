import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  atualizarProduto,
  buscarProduto,
  cadastrarProduto,
  excluirProduto,
  inativarProduto,
  listarProdutos,
  listarSugestoes,
  reativarProduto,
  sugerirSku,
} from '@/services/produtoService'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type { ProdutoRequest } from '@/types/produto'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  apiDelete: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPostMock = vi.mocked(apiPost)
const apiPatchMock = vi.mocked(apiPatch)
const apiDeleteMock = vi.mocked(apiDelete)

const ID = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f'

const produtoRequest: ProdutoRequest = {
  nome: 'Arroz 5kg',
  nomeCurto: null,
  unidadeId: '6f1c2b8e-0000-4000-8000-000000000001',
  categoriaId: null,
  unidadeCompraId: null,
  fatorConversao: null,
  marca: null,
  fornecedor: null,
  descricao: null,
  precoVenda: 25.9,
  custo: null,
  precoMinimo: null,
  promocao: null,
  atacado: null,
  estoqueMinimo: null,
  estoqueMaximo: null,
  pontoReposicao: null,
  codigosBarras: ['7891000315507'],
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

  it('busca produto pelo UUID', async () => {
    apiGetMock.mockResolvedValue({})

    await buscarProduto(ID)

    expect(apiGetMock).toHaveBeenCalledWith(`/produtos/${ID}`, { autenticada: true })
  })

  it('atualiza produto via PATCH autenticado pelo UUID', async () => {
    apiPatchMock.mockResolvedValue({})

    await atualizarProduto(ID, produtoRequest)

    expect(apiPatchMock).toHaveBeenCalledWith(`/produtos/${ID}`, produtoRequest, { autenticada: true })
  })

  it('inativa e reativa produto via PATCH autenticado pelo UUID', async () => {
    apiPatchMock.mockResolvedValue({})

    await inativarProduto(ID)
    await reativarProduto(ID)

    expect(apiPatchMock).toHaveBeenNthCalledWith(1, `/produtos/${ID}/inativar`, {}, { autenticada: true })
    expect(apiPatchMock).toHaveBeenNthCalledWith(2, `/produtos/${ID}/reativar`, {}, { autenticada: true })
  })

  it('exclui produto via DELETE autenticado pelo UUID', async () => {
    apiDeleteMock.mockResolvedValue(undefined)

    await excluirProduto(ID)

    expect(apiDeleteMock).toHaveBeenCalledWith(`/produtos/${ID}`, { autenticada: true })
  })

  it('codifica o id na rota', async () => {
    apiGetMock.mockResolvedValue({})

    await buscarProduto('a/b')

    expect(apiGetMock).toHaveBeenCalledWith('/produtos/a%2Fb', { autenticada: true })
  })

  it('sugere SKU devolvendo apenas o texto', async () => {
    apiGetMock.mockResolvedValue({ sku: 'P000031' })

    await expect(sugerirSku()).resolves.toBe('P000031')
    expect(apiGetMock).toHaveBeenCalledWith('/produtos/sku/sugestao', { autenticada: true })
  })

  it('lista sugestoes de marca com o termo aparado', async () => {
    apiGetMock.mockResolvedValue(['Golden'])

    await expect(listarSugestoes('marca', ' gol ')).resolves.toEqual(['Golden'])
    expect(apiGetMock).toHaveBeenCalledWith('/produtos/sugestoes?campo=marca&termo=gol', { autenticada: true })
  })

  it('lista sugestoes de fornecedor sem termo (mais usados)', async () => {
    apiGetMock.mockResolvedValue([])

    await listarSugestoes('fornecedor', '  ')

    expect(apiGetMock).toHaveBeenCalledWith('/produtos/sugestoes?campo=fornecedor', { autenticada: true })
  })
})
