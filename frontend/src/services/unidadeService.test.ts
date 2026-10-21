import { describe, it, expect, vi, beforeEach } from 'vitest'

import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/httpClient'
import {
  atualizarUnidade,
  cadastrarUnidade,
  excluirUnidade,
  inativarUnidade,
  listarUnidades,
  reativarUnidade,
} from '@/services/unidadeService'
import type { UnidadeMedidaRequest } from '@/types/catalogo'

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

const UNIDADE_ID = '7a1c2b9e-8d4a-4c6f-9b1e-2a7d5c0e4f81'
const dados: UnidadeMedidaRequest = { sigla: 'kg', descricao: 'Quilograma', fracionada: true }

describe('unidadeService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista todas as unidades sem filtro', async () => {
    apiGetMock.mockResolvedValue([])

    await listarUnidades()

    expect(apiGetMock).toHaveBeenCalledWith('/unidades', { autenticada: true })
  })

  it('lista so as ativas com ?ativo=true e so as inativas com ?ativo=false', async () => {
    apiGetMock.mockResolvedValue([])

    await listarUnidades(true)
    await listarUnidades(false)

    expect(apiGetMock).toHaveBeenNthCalledWith(1, '/unidades?ativo=true', { autenticada: true })
    expect(apiGetMock).toHaveBeenNthCalledWith(2, '/unidades?ativo=false', { autenticada: true })
  })

  it('cadastra via POST e atualiza via PATCH pelo UUID', async () => {
    apiPostMock.mockResolvedValue({})
    apiPatchMock.mockResolvedValue({})

    await cadastrarUnidade(dados)
    await atualizarUnidade(UNIDADE_ID, dados)

    expect(apiPostMock).toHaveBeenCalledWith('/unidades', dados, { autenticada: true })
    expect(apiPatchMock).toHaveBeenCalledWith(`/unidades/${UNIDADE_ID}`, dados, { autenticada: true })
  })

  it('inativa e reativa via PATCH', async () => {
    apiPatchMock.mockResolvedValue({})

    await inativarUnidade(UNIDADE_ID)
    await reativarUnidade(UNIDADE_ID)

    expect(apiPatchMock).toHaveBeenNthCalledWith(1, `/unidades/${UNIDADE_ID}/inativar`, {}, {
      autenticada: true,
    })
    expect(apiPatchMock).toHaveBeenNthCalledWith(2, `/unidades/${UNIDADE_ID}/reativar`, {}, {
      autenticada: true,
    })
  })

  it('exclui via DELETE pelo UUID', async () => {
    apiDeleteMock.mockResolvedValue(undefined)

    await excluirUnidade(UNIDADE_ID)

    expect(apiDeleteMock).toHaveBeenCalledWith(`/unidades/${UNIDADE_ID}`, { autenticada: true })
  })
})
