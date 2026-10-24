import { describe, it, expect, vi, beforeEach } from 'vitest'

import { buscar, salvar } from '@/services/configuracaoPdvService'
import { apiGet, apiPut } from '@/services/httpClient'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPutMock = vi.mocked(apiPut)

describe('configuracaoPdvService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('busca a configuração do PDV, autenticado', async () => {
    apiGetMock.mockResolvedValue({})

    await buscar()

    expect(apiGetMock).toHaveBeenCalledWith('/configuracoes/pdv', { autenticada: true })
  })

  it('salva as duas opções juntas', async () => {
    apiPutMock.mockResolvedValue({})

    await salvar({ venderSemEstoque: false, descontoMaximoOperador: 12.5 })

    expect(apiPutMock).toHaveBeenCalledWith(
      '/configuracoes/pdv',
      { venderSemEstoque: false, descontoMaximoOperador: 12.5 },
      { autenticada: true },
    )
  })
})
