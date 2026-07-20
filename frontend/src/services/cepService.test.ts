import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { buscarCep } from '@/services/cepService'

/** Monta um `Response` fake com o corpo JSON informado. */
function respostaJson(corpo: unknown, ok = true): Response {
  return {
    ok,
    json: async () => corpo,
  } as unknown as Response
}

describe('cepService', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('retorna o trecho de endereco em caso de sucesso, mapeando localidade -> municipio', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(
      respostaJson({
        logradouro: 'Praça da Sé',
        bairro: 'Sé',
        localidade: 'São Paulo',
        uf: 'SP',
      }),
    )

    const resultado = await buscarCep('01001-000')

    expect(resultado).toEqual({
      logradouro: 'Praça da Sé',
      bairro: 'Sé',
      municipio: 'São Paulo',
      uf: 'SP',
    })
  })

  it('normaliza o CEP para 8 digitos antes de consultar o ViaCEP', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(respostaJson({ localidade: 'São Paulo', uf: 'SP' }))

    await buscarCep(' 01001-000 ')

    expect(fetchMock).toHaveBeenCalledWith('https://viacep.com.br/ws/01001000/json/')
  })

  it('retorna null sem consultar quando o CEP nao tem 8 digitos', async () => {
    const fetchMock = vi.mocked(fetch)

    const resultado = await buscarCep('123')

    expect(resultado).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('retorna null quando o ViaCEP responde { erro: true }', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(respostaJson({ erro: true }))

    const resultado = await buscarCep('00000000')

    expect(resultado).toBeNull()
  })

  it('retorna null em falha de rede (sem lancar)', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockRejectedValue(new Error('falha de rede'))

    await expect(buscarCep('01001000')).resolves.toBeNull()
  })

  it('retorna null quando o ViaCEP responde com status de erro', async () => {
    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValue(respostaJson({}, false))

    const resultado = await buscarCep('01001000')

    expect(resultado).toBeNull()
  })
})
