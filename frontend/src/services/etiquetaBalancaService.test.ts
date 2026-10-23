import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiGet, apiPost, apiPut } from '@/services/httpClient'
import {
  buscarConfiguracaoEtiqueta,
  salvarConfiguracaoEtiqueta,
  testarEtiqueta,
} from '@/services/etiquetaBalancaService'
import { CONFIGURACAO_ETIQUETA_PADRAO } from '@/lib/etiquetaBalanca'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPostMock = vi.mocked(apiPost)
const apiPutMock = vi.mocked(apiPut)

describe('etiquetaBalancaService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('busca a configuracao da empresa via GET autenticado', async () => {
    apiGetMock.mockResolvedValue({ ...CONFIGURACAO_ETIQUETA_PADRAO, padrao: true })

    const configuracao = await buscarConfiguracaoEtiqueta()

    expect(apiGetMock).toHaveBeenCalledWith('/etiqueta-balanca', { autenticada: true })
    expect(configuracao.padrao).toBe(true)
  })

  it('salva a configuracao via PUT', async () => {
    apiPutMock.mockResolvedValue({ configuracao: { ...CONFIGURACAO_ETIQUETA_PADRAO, padrao: false }, produtosComCodigoGrandeDemais: [] })

    await salvarConfiguracaoEtiqueta(CONFIGURACAO_ETIQUETA_PADRAO)

    expect(apiPutMock).toHaveBeenCalledWith('/etiqueta-balanca', CONFIGURACAO_ETIQUETA_PADRAO, { autenticada: true })
  })

  it('testa uma etiqueta com a configuracao da tela via POST', async () => {
    apiPostMock.mockResolvedValue({ leitura: null, produto: null, mensagem: 'Este número não é uma etiqueta neste formato.' })

    await testarEtiqueta('2000542010000', CONFIGURACAO_ETIQUETA_PADRAO)

    expect(apiPostMock).toHaveBeenCalledWith(
      '/etiqueta-balanca/teste',
      { codigoLido: '2000542010000', configuracao: CONFIGURACAO_ETIQUETA_PADRAO },
      { autenticada: true },
    )
  })
})
