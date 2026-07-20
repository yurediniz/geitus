import { describe, it, expect, vi, beforeEach } from 'vitest'

import { atualizarEmpresa, obterEmpresa } from '@/services/empresaService'
import { apiGet, apiPatch } from '@/services/httpClient'
import type { EmpresaAtualizarRequest } from '@/types/empresa'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPatchMock = vi.mocked(apiPatch)

const requestJuridica: EmpresaAtualizarRequest = {
  nome: 'Mercado Central',
  telefone: '11999990000',
  email: 'contato@mercado.com',
  tipoPessoa: 'JURIDICA',
  cnpj: '11222333000181',
  razaoSocial: 'Mercado Central LTDA',
  inscricaoEstadual: null,
  representanteLegal: {
    nome: 'Ana Souza',
    cpf: '39053344705',
    telefone: '11988887777',
    email: 'ana@mercado.com',
  },
  endereco: {
    cep: '01001000',
    logradouro: 'Praça da Sé',
    numero: 'S/N',
    complemento: null,
    bairro: 'Sé',
    municipio: 'São Paulo',
    uf: 'SP',
  },
}

describe('empresaService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('obtem a empresa autenticada via GET /empresas/minha', async () => {
    apiGetMock.mockResolvedValue({})

    await obterEmpresa()

    expect(apiGetMock).toHaveBeenCalledWith('/empresas/minha', { autenticada: true })
  })

  it('atualiza a empresa via PATCH /empresas/minha enviando o corpo completo', async () => {
    apiPatchMock.mockResolvedValue({})

    await atualizarEmpresa(requestJuridica)

    expect(apiPatchMock).toHaveBeenCalledWith('/empresas/minha', requestJuridica, {
      autenticada: true,
    })
  })

  it('nao injeta empresaId no corpo do PATCH (empresa vem do token)', async () => {
    apiPatchMock.mockResolvedValue({})

    await atualizarEmpresa(requestJuridica)

    expect(apiPatchMock.mock.calls[0]?.[1]).not.toHaveProperty('empresaId')
  })
})
