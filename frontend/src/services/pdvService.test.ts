import { describe, it, expect, vi, beforeEach } from 'vitest'

import { apiGet, apiPost, apiPostComStatus } from '@/services/httpClient'
import {
  buscarProdutos,
  buscarVenda,
  calcular,
  cancelarVenda,
  finalizar,
  listarVendas,
  resolverCodigo,
  TAMANHO_PAGINA_VENDAS,
} from '@/services/pdvService'
import type { CarrinhoRequest } from '@/types/pdv'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPostComStatus: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPostMock = vi.mocked(apiPost)
const apiPostComStatusMock = vi.mocked(apiPostComStatus)

const AUT = { autenticada: true }
const VENDA = '9a8b7c6d-0000-4000-8000-000000000128'
const CARRINHO: CarrinhoRequest = {
  itens: [{ produtoId: 'p-1', embalagemId: null, quantidade: 3, codigoLido: '542*3', etiqueta: false, desconto: null }],
  desconto: null,
  clienteId: null,
  pagamentos: [],
}

describe('pdvService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolve o código lido, codificado na URL', async () => {
    apiGetMock.mockResolvedValue({})

    await resolverCodigo('542*0,750')

    expect(apiGetMock).toHaveBeenCalledWith('/pdv/itens?codigo=542*0%2C750', AUT)
  })

  it('busca produtos ativos por nome, com o signal', async () => {
    apiGetMock.mockResolvedValue([])
    const controle = new AbortController()

    await buscarProdutos('ração x', controle.signal)

    expect(apiGetMock).toHaveBeenCalledWith('/pdv/itens?busca=ra%C3%A7%C3%A3o+x', {
      autenticada: true,
      signal: controle.signal,
    })
  })

  it('calcula o carrinho com o signal (o pedido anterior é cancelado)', async () => {
    apiPostMock.mockResolvedValue({})
    const controle = new AbortController()

    await calcular(CARRINHO, controle.signal)

    expect(apiPostMock).toHaveBeenCalledWith('/pdv/calculo', CARRINHO, { autenticada: true, signal: controle.signal })
  })

  it('finaliza com a chave e o total esperado e devolve a venda (201 ou 200)', async () => {
    const venda = { id: VENDA, numero: 128 }
    apiPostComStatusMock.mockResolvedValue({ status: 200, corpo: venda })
    const dados = { ...CARRINHO, chave: 'c-1', totalEsperado: 74.7 }

    await expect(finalizar(dados)).resolves.toBe(venda)
    expect(apiPostComStatusMock).toHaveBeenCalledWith('/pdv/vendas', dados, AUT)
  })

  it('lista as vendas: sem filtros, a sessão atual; com filtros, só os preenchidos', async () => {
    apiGetMock.mockResolvedValue({ itens: [], pagina: 0, tamanho: 20, totalItens: 0 })

    await listarVendas({ sessaoId: '', status: '', de: '', ate: '', numero: '', pagina: 1 })
    await listarVendas({ sessaoId: 's-1', status: 'CANCELADA', de: '2026-10-01', ate: '2026-10-24', numero: '128', pagina: 2 })

    expect(apiGetMock).toHaveBeenNthCalledWith(1, `/pdv/vendas?pagina=0&tamanho=${TAMANHO_PAGINA_VENDAS}`, {
      autenticada: true,
      signal: undefined,
    })
    expect(apiGetMock).toHaveBeenNthCalledWith(
      2,
      `/pdv/vendas?sessaoId=s-1&status=CANCELADA&de=2026-10-01&ate=2026-10-24&numero=128&pagina=1&tamanho=${TAMANHO_PAGINA_VENDAS}`,
      { autenticada: true, signal: undefined },
    )
  })

  it('busca e cancela a venda pelo id', async () => {
    apiGetMock.mockResolvedValue({})
    apiPostMock.mockResolvedValue({})

    await buscarVenda(VENDA)
    await cancelarVenda(VENDA, 'Cliente desistiu')

    expect(apiGetMock).toHaveBeenCalledWith(`/pdv/vendas/${VENDA}`, AUT)
    expect(apiPostMock).toHaveBeenCalledWith(`/pdv/vendas/${VENDA}/cancelamento`, { motivo: 'Cliente desistiu' }, AUT)
  })
})
