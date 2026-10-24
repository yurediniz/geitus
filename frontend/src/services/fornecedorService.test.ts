import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  adicionarProdutoAoFornecedor,
  atualizarFornecedor,
  buscarFornecedor,
  cadastrarFornecedor,
  excluirFornecedor,
  inativarFornecedor,
  listarFornecedores,
  listarProdutosDoFornecedor,
  reativarFornecedor,
  removerProdutoDoFornecedor,
} from '@/services/fornecedorService'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type { FornecedorRequest } from '@/types/fornecedor'

vi.mock('@/services/httpClient', () => ({
  apiDelete: vi.fn(),
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPostMock = vi.mocked(apiPost)
const apiPatchMock = vi.mocked(apiPatch)
const apiDeleteMock = vi.mocked(apiDelete)

const ID = '5e1c2b9e-8d4a-4c6f-9b1e-2a7d5c0e4f81'
const PRODUTO_ID = '8b2c2b9e-8d4a-4c6f-9b1e-2a7d5c0e4f81'

const REQUEST: FornecedorRequest = {
  tipoPessoa: 'PJ',
  documento: '11222333000181',
  razaoSocial: 'Distribuidora Sul Ltda',
  nomeFantasia: null,
  inscricaoEstadual: 'ISENTO',
  endereco: { cep: null, logradouro: null, numero: null, complemento: null, bairro: null, municipio: null, uf: null },
  telefone: null,
  email: null,
  observacoes: null,
  representantes: [{ nome: 'Carlos', telefone: null, email: null }],
  marcaIds: [],
}

describe('fornecedorService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista com busca aparada, status e a pagina 0-based', async () => {
    apiGetMock.mockResolvedValue({ itens: [], pagina: 0, tamanho: 25, totalItens: 0 })
    const signal = new AbortController().signal

    await listarFornecedores({ busca: ' sul ', status: 'ativos', pagina: 3 }, signal)
    await listarFornecedores({ busca: '', status: 'todos', pagina: 1, tamanho: 10 })

    expect(apiGetMock).toHaveBeenNthCalledWith(1, '/fornecedores?busca=sul&status=ativos&pagina=2&tamanho=25', {
      autenticada: true,
      signal,
    })
    expect(apiGetMock).toHaveBeenNthCalledWith(2, '/fornecedores?status=todos&pagina=0&tamanho=10', {
      autenticada: true,
      signal: undefined,
    })
  })

  it('busca, cadastra e atualiza pelo UUID', async () => {
    apiGetMock.mockResolvedValue({})
    apiPostMock.mockResolvedValue({})
    apiPatchMock.mockResolvedValue({})

    await buscarFornecedor(ID)
    await cadastrarFornecedor(REQUEST)
    await atualizarFornecedor(ID, REQUEST)

    expect(apiGetMock).toHaveBeenCalledWith(`/fornecedores/${ID}`, { autenticada: true })
    expect(apiPostMock).toHaveBeenCalledWith('/fornecedores', REQUEST, { autenticada: true })
    expect(apiPatchMock).toHaveBeenCalledWith(`/fornecedores/${ID}`, REQUEST, { autenticada: true })
  })

  it('inativa, reativa e exclui', async () => {
    apiPatchMock.mockResolvedValue({})
    apiDeleteMock.mockResolvedValue(undefined)

    await inativarFornecedor(ID)
    await reativarFornecedor(ID)
    await excluirFornecedor(ID)

    expect(apiPatchMock).toHaveBeenNthCalledWith(1, `/fornecedores/${ID}/inativar`, {}, { autenticada: true })
    expect(apiPatchMock).toHaveBeenNthCalledWith(2, `/fornecedores/${ID}/reativar`, {}, { autenticada: true })
    expect(apiDeleteMock).toHaveBeenCalledWith(`/fornecedores/${ID}`, { autenticada: true })
  })

  it('lista, liga e desliga os produtos do fornecedor', async () => {
    apiGetMock.mockResolvedValue({ itens: [], pagina: 1, tamanho: 25, totalItens: 0 })
    apiPostMock.mockResolvedValue(undefined)
    apiDeleteMock.mockResolvedValue(undefined)

    await listarProdutosDoFornecedor(ID, 2)
    await adicionarProdutoAoFornecedor(ID, PRODUTO_ID)
    await removerProdutoDoFornecedor(ID, PRODUTO_ID)

    expect(apiGetMock).toHaveBeenCalledWith(`/fornecedores/${ID}/produtos?pagina=1&tamanho=25`, { autenticada: true })
    expect(apiPostMock).toHaveBeenCalledWith(`/fornecedores/${ID}/produtos`, { produtoId: PRODUTO_ID }, {
      autenticada: true,
    })
    expect(apiDeleteMock).toHaveBeenCalledWith(`/fornecedores/${ID}/produtos/${PRODUTO_ID}`, { autenticada: true })
  })
})
