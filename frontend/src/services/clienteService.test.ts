import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  atualizarCliente,
  cadastrarCliente,
  inativarCliente,
  listarClientes,
  reativarCliente,
} from '@/services/clienteService'
import { apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type { ClienteRequest } from '@/types/cliente'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPostMock = vi.mocked(apiPost)
const apiPatchMock = vi.mocked(apiPatch)

const CLIENTE_ID = '3f1c2b9e-8d4a-4c6f-9b1e-2a7d5c0e4f81'

const clienteRequest: ClienteRequest = {
  nome: 'Ana Souza',
  cpf: '11144477735',
  telefone: '11987654321',
  telefoneEWhatsapp: true,
  whatsapp: null,
  observacoes: null,
}

describe('clienteService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista clientes autenticados sem filtros', async () => {
    apiGetMock.mockResolvedValue([])

    await listarClientes()

    expect(apiGetMock).toHaveBeenCalledWith('/clientes', { autenticada: true })
  })

  it('lista clientes com busca aparada e status ativo', async () => {
    apiGetMock.mockResolvedValue([])

    await listarClientes({ busca: ' ana ', status: 'ativos' })

    expect(apiGetMock).toHaveBeenCalledWith('/clientes?busca=ana&ativo=true', { autenticada: true })
  })

  it('codifica busca com mascara de telefone', async () => {
    apiGetMock.mockResolvedValue([])

    await listarClientes({ busca: '(11) 98765', status: 'todos' })

    expect(apiGetMock).toHaveBeenCalledWith('/clientes?busca=%2811%29+98765', { autenticada: true })
  })

  it('lista clientes com status inativo', async () => {
    apiGetMock.mockResolvedValue([])

    await listarClientes({ status: 'inativos' })

    expect(apiGetMock).toHaveBeenCalledWith('/clientes?ativo=false', { autenticada: true })
  })

  it('cadastra cliente via POST autenticado sem enviar empresaId', async () => {
    apiPostMock.mockResolvedValue({})

    await cadastrarCliente(clienteRequest)

    expect(apiPostMock).toHaveBeenCalledWith('/clientes', clienteRequest, { autenticada: true })
    expect(apiPostMock.mock.calls[0]?.[1]).not.toHaveProperty('empresaId')
  })

  it('atualiza cliente pelo UUID via PATCH autenticado', async () => {
    apiPatchMock.mockResolvedValue({})

    await atualizarCliente(CLIENTE_ID, clienteRequest)

    expect(apiPatchMock).toHaveBeenCalledWith(`/clientes/${CLIENTE_ID}`, clienteRequest, {
      autenticada: true,
    })
  })

  it('inativa e reativa cliente pelo UUID via PATCH autenticado', async () => {
    apiPatchMock.mockResolvedValue({})

    await inativarCliente(CLIENTE_ID)
    await reativarCliente(CLIENTE_ID)

    expect(apiPatchMock).toHaveBeenNthCalledWith(1, `/clientes/${CLIENTE_ID}/inativar`, {}, {
      autenticada: true,
    })
    expect(apiPatchMock).toHaveBeenNthCalledWith(2, `/clientes/${CLIENTE_ID}/reativar`, {}, {
      autenticada: true,
    })
  })
})
