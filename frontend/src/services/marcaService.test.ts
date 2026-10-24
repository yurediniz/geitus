import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  atualizarMarca,
  cadastrarMarca,
  excluirMarca,
  inativarMarca,
  listarMarcas,
  reativarMarca,
} from '@/services/marcaService'
import { apiDelete, apiGet, apiPatch, apiPost } from '@/services/httpClient'

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

const MARCA_ID = '6f1c2b9e-8d4a-4c6f-9b1e-2a7d5c0e4f81'
const FABRICANTE_ID = '7a2c2b9e-8d4a-4c6f-9b1e-2a7d5c0e4f81'

describe('marcaService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista as marcas sem filtro e com ?ativo=', async () => {
    apiGetMock.mockResolvedValue([])

    await listarMarcas()
    await listarMarcas(false)

    expect(apiGetMock).toHaveBeenNthCalledWith(1, '/marcas', { autenticada: true })
    expect(apiGetMock).toHaveBeenNthCalledWith(2, '/marcas?ativo=false', { autenticada: true })
  })

  it('cadastra a submarca enviando o parentId', async () => {
    apiPostMock.mockResolvedValue({})

    await cadastrarMarca({ nome: 'Nexgard', parentId: FABRICANTE_ID })

    expect(apiPostMock).toHaveBeenCalledWith('/marcas', { nome: 'Nexgard', parentId: FABRICANTE_ID }, { autenticada: true })
  })

  it('renomeia e move via PATCH /marcas/{id}', async () => {
    apiPatchMock.mockResolvedValue({})

    await atualizarMarca(MARCA_ID, { nome: 'Nexgard Combo', parentId: null })

    expect(apiPatchMock).toHaveBeenCalledWith(
      `/marcas/${MARCA_ID}`,
      { nome: 'Nexgard Combo', parentId: null },
      { autenticada: true },
    )
  })

  it('codifica o id na rota', async () => {
    apiPatchMock.mockResolvedValue({})
    apiDeleteMock.mockResolvedValue(undefined)

    await atualizarMarca('a/b', { nome: 'X', parentId: null })
    await excluirMarca('a/b')

    expect(apiPatchMock).toHaveBeenCalledWith('/marcas/a%2Fb', { nome: 'X', parentId: null }, { autenticada: true })
    expect(apiDeleteMock).toHaveBeenCalledWith('/marcas/a%2Fb', { autenticada: true })
  })

  it('inativa, reativa e exclui', async () => {
    apiPatchMock.mockResolvedValue({})
    apiDeleteMock.mockResolvedValue(undefined)

    await inativarMarca(MARCA_ID)
    await reativarMarca(MARCA_ID)
    await excluirMarca(MARCA_ID)

    expect(apiPatchMock).toHaveBeenNthCalledWith(1, `/marcas/${MARCA_ID}/inativar`, {}, { autenticada: true })
    expect(apiPatchMock).toHaveBeenNthCalledWith(2, `/marcas/${MARCA_ID}/reativar`, {}, { autenticada: true })
    expect(apiDeleteMock).toHaveBeenCalledWith(`/marcas/${MARCA_ID}`, { autenticada: true })
  })
})
