import { describe, it, expect, vi, beforeEach } from 'vitest'

import { buscar, salvar } from '@/services/configuracaoCaixaService'
import { apiGet, apiPut } from '@/services/httpClient'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPut: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPutMock = vi.mocked(apiPut)

describe('configuracaoCaixaService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('busca a configuração do caixa, autenticado', async () => {
    apiGetMock.mockResolvedValue({ fechamentoCego: true, atualizadoPorNome: null, atualizadoEm: null })

    await buscar()

    expect(apiGetMock).toHaveBeenCalledWith('/configuracoes/caixa', { autenticada: true })
  })

  it('salva o modo do fechamento', async () => {
    apiPutMock.mockResolvedValue({ fechamentoCego: false, atualizadoPorNome: 'Ana', atualizadoEm: '…' })

    await salvar({ fechamentoCego: false })

    expect(apiPutMock).toHaveBeenCalledWith('/configuracoes/caixa', { fechamentoCego: false }, { autenticada: true })
  })
})
