import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  atualizarCategoria,
  cadastrarCategoria,
  excluirCategoria,
  inativarCategoria,
  listarCategorias,
  reativarCategoria,
} from '@/services/categoriaService'
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

const CATEGORIA_ID = '9b1c2b9e-8d4a-4c6f-9b1e-2a7d5c0e4f81'
const PAI_ID = '1d2c2b9e-8d4a-4c6f-9b1e-2a7d5c0e4f81'

describe('categoriaService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista categorias sem filtro e com ?ativo=', async () => {
    apiGetMock.mockResolvedValue([])

    await listarCategorias()
    await listarCategorias(true)

    expect(apiGetMock).toHaveBeenNthCalledWith(1, '/categorias', { autenticada: true })
    expect(apiGetMock).toHaveBeenNthCalledWith(2, '/categorias?ativo=true', { autenticada: true })
  })

  it('cadastra subcategoria enviando o parentId', async () => {
    apiPostMock.mockResolvedValue({})

    await cadastrarCategoria({ nome: 'Úmida', parentId: PAI_ID })

    expect(apiPostMock).toHaveBeenCalledWith(
      '/categorias',
      { nome: 'Úmida', parentId: PAI_ID },
      { autenticada: true },
    )
  })

  it('move para a raiz enviando parentId null via PATCH', async () => {
    apiPatchMock.mockResolvedValue({})

    await atualizarCategoria(CATEGORIA_ID, { nome: 'Sachê', parentId: null })

    expect(apiPatchMock).toHaveBeenCalledWith(
      `/categorias/${CATEGORIA_ID}`,
      { nome: 'Sachê', parentId: null },
      { autenticada: true },
    )
  })

  it('inativa e reativa via PATCH', async () => {
    apiPatchMock.mockResolvedValue({})

    await inativarCategoria(CATEGORIA_ID)
    await reativarCategoria(CATEGORIA_ID)

    expect(apiPatchMock).toHaveBeenNthCalledWith(1, `/categorias/${CATEGORIA_ID}/inativar`, {}, {
      autenticada: true,
    })
    expect(apiPatchMock).toHaveBeenNthCalledWith(2, `/categorias/${CATEGORIA_ID}/reativar`, {}, {
      autenticada: true,
    })
  })

  it('exclui via DELETE /categorias/{id}', async () => {
    apiDeleteMock.mockResolvedValue(undefined)

    await excluirCategoria(CATEGORIA_ID)

    expect(apiDeleteMock).toHaveBeenCalledWith(`/categorias/${CATEGORIA_ID}`, { autenticada: true })
  })
})
