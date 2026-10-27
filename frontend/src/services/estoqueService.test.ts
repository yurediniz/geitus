import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  ajustarEstoque,
  buscarResumoDaPosicao,
  listarMovimentosDeEstoque,
  listarPosicaoDeEstoque,
} from '@/services/estoqueService'
import { apiGet, apiPost } from '@/services/httpClient'
import type { AjusteEstoqueRequest, FiltrosDaPosicao } from '@/types/estoque'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPostMock = vi.mocked(apiPost)

const ID = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f'

describe('estoqueService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ajusta o estoque do produto, autenticado, com a chave da operação', async () => {
    const ajuste: AjusteEstoqueRequest = {
      tipo: 'SAIDA',
      quantidade: 2,
      motivo: 'PERDA_AVARIA',
      observacao: 'Caixa amassada',
      chave: '2c1f0000-0000-4000-8000-000000000001',
    }
    apiPostMock.mockResolvedValue({ id: 'mov-1' })

    await ajustarEstoque(ID, ajuste)

    expect(apiPostMock).toHaveBeenCalledWith(`/produtos/${ID}/estoque/ajustes`, ajuste, { autenticada: true })
  })

  it('lista os movimentos paginados (20 por padrão)', async () => {
    apiGetMock.mockResolvedValue({ itens: [], pagina: 0, tamanho: 20, totalItens: 0 })

    await listarMovimentosDeEstoque(ID, 0)
    await listarMovimentosDeEstoque(ID, 2, 50)

    expect(apiGetMock).toHaveBeenNthCalledWith(1, `/produtos/${ID}/estoque/movimentos?pagina=0&tamanho=20`, {
      autenticada: true,
    })
    expect(apiGetMock).toHaveBeenNthCalledWith(2, `/produtos/${ID}/estoque/movimentos?pagina=2&tamanho=50`, {
      autenticada: true,
    })
  })

  it('codifica o id no caminho', async () => {
    apiGetMock.mockResolvedValue({ itens: [], pagina: 0, tamanho: 20, totalItens: 0 })

    await listarMovimentosDeEstoque('a/b', 0)

    expect(apiGetMock).toHaveBeenCalledWith('/produtos/a%2Fb/estoque/movimentos?pagina=0&tamanho=20', {
      autenticada: true,
    })
  })

  describe('posição de estoque', () => {
    const PADRAO: FiltrosDaPosicao = {
      busca: '',
      status: 'ativos',
      categoria: null,
      situacao: null,
      ordem: 'nome',
      pagina: 1,
    }

    it('lista a primeira página com os padrões, 25 por página e a página da API a partir de 0', async () => {
      apiGetMock.mockResolvedValue({ itens: [], pagina: 0, tamanho: 25, totalItens: 0 })

      await listarPosicaoDeEstoque(PADRAO)

      expect(apiGetMock).toHaveBeenCalledWith('/estoque/posicao?status=ativos&ordem=nome&pagina=0&tamanho=25', {
        autenticada: true,
        signal: undefined,
      })
    })

    it('envia busca aparada, categoria, situação, ordem e página', async () => {
      apiGetMock.mockResolvedValue({ itens: [], pagina: 2, tamanho: 25, totalItens: 0 })
      const signal = new AbortController().signal

      await listarPosicaoDeEstoque(
        { busca: ' arroz ', status: 'todos', categoria: ID, situacao: 'negativo', ordem: '-valor', pagina: 3 },
        signal,
      )

      expect(apiGetMock).toHaveBeenCalledWith(
        `/estoque/posicao?busca=arroz&status=todos&categoria=${ID}&situacao=negativo&ordem=-valor&pagina=2&tamanho=25`,
        { autenticada: true, signal },
      )
    })

    it('o resumo leva só busca, status e categoria', async () => {
      apiGetMock.mockResolvedValue({})

      await buscarResumoDaPosicao({ busca: 'leite', status: 'ativos', categoria: null })

      expect(apiGetMock).toHaveBeenCalledWith('/estoque/posicao/resumo?busca=leite&status=ativos', {
        autenticada: true,
        signal: undefined,
      })
    })
  })
})
