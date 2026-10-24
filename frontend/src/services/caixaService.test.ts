import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  abrir,
  buscarSessao,
  contar,
  criarPonto,
  fechar,
  inativarPonto,
  lancar,
  listarPontos,
  listarSessoes,
  reativarPonto,
  renomearPonto,
  sessaoAtual,
} from '@/services/caixaService'
import { apiGet, apiPatch, apiPost } from '@/services/httpClient'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPostMock = vi.mocked(apiPost)
const apiPatchMock = vi.mocked(apiPatch)

const AUT = { autenticada: true }
const PONTO = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f'
const SESSAO = '9a8b7c6d-0000-4000-8000-000000000001'
const CHAVE = '2c1f0000-0000-4000-8000-000000000001'

describe('caixaService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('pontos', () => {
    it('lista todos, ou so os ativos / inativos', async () => {
      apiGetMock.mockResolvedValue([])

      await listarPontos()
      await listarPontos(true)
      await listarPontos(false)

      expect(apiGetMock).toHaveBeenNthCalledWith(1, '/caixa/pontos', AUT)
      expect(apiGetMock).toHaveBeenNthCalledWith(2, '/caixa/pontos?ativo=true', AUT)
      expect(apiGetMock).toHaveBeenNthCalledWith(3, '/caixa/pontos?ativo=false', AUT)
    })

    it('cria, renomeia, inativa e reativa', async () => {
      apiPostMock.mockResolvedValue({})
      apiPatchMock.mockResolvedValue({})

      await criarPonto('Caixa 2')
      await renomearPonto(PONTO, 'Balcão')
      await inativarPonto(PONTO)
      await reativarPonto(PONTO)

      expect(apiPostMock).toHaveBeenCalledWith('/caixa/pontos', { nome: 'Caixa 2' }, AUT)
      expect(apiPatchMock).toHaveBeenNthCalledWith(1, `/caixa/pontos/${PONTO}`, { nome: 'Balcão' }, AUT)
      expect(apiPatchMock).toHaveBeenNthCalledWith(2, `/caixa/pontos/${PONTO}/inativar`, {}, AUT)
      expect(apiPatchMock).toHaveBeenNthCalledWith(3, `/caixa/pontos/${PONTO}/reativar`, {}, AUT)
    })

    it('codifica o id no caminho', async () => {
      apiPatchMock.mockResolvedValue({})

      await inativarPonto('a/b')

      expect(apiPatchMock).toHaveBeenCalledWith('/caixa/pontos/a%2Fb/inativar', {}, AUT)
    })
  })

  describe('sessões', () => {
    it('sessão atual: devolve a sessão, ou null quando o servidor responde 204', async () => {
      const sessao = { id: SESSAO }
      apiGetMock.mockResolvedValueOnce(sessao)
      apiGetMock.mockResolvedValueOnce(undefined)

      await expect(sessaoAtual()).resolves.toBe(sessao)
      await expect(sessaoAtual()).resolves.toBeNull()
      expect(apiGetMock).toHaveBeenCalledWith('/caixa/sessoes/atual', AUT)
    })

    it('abre com o ponto, o fundo de troco e a chave', async () => {
      apiPostMock.mockResolvedValue({})

      await abrir({ pontoId: PONTO, fundoTroco: 150, chave: CHAVE })

      expect(apiPostMock).toHaveBeenCalledWith('/caixa/sessoes', { pontoId: PONTO, fundoTroco: 150, chave: CHAVE }, AUT)
    })

    it('lança, conta e fecha na sessão', async () => {
      apiPostMock.mockResolvedValue({})
      const movimento = { tipo: 'SANGRIA' as const, valor: 200, motivo: 'Depósito no cofre', chave: CHAVE }

      await lancar(SESSAO, movimento)
      await contar(SESSAO, { valorContado: 318, justificativa: null })
      await fechar(SESSAO, { justificativa: 'Troco dado a mais' })

      expect(apiPostMock).toHaveBeenNthCalledWith(1, `/caixa/sessoes/${SESSAO}/movimentos`, movimento, AUT)
      expect(apiPostMock).toHaveBeenNthCalledWith(
        2,
        `/caixa/sessoes/${SESSAO}/contagem`,
        { valorContado: 318, justificativa: null },
        AUT,
      )
      expect(apiPostMock).toHaveBeenNthCalledWith(
        3,
        `/caixa/sessoes/${SESSAO}/fechamento`,
        { justificativa: 'Troco dado a mais' },
        AUT,
      )
    })

    it('busca a sessão pelo id', async () => {
      apiGetMock.mockResolvedValue({})

      await buscarSessao(SESSAO)

      expect(apiGetMock).toHaveBeenCalledWith(`/caixa/sessoes/${SESSAO}`, AUT)
    })

    it('histórico: só os filtros preenchidos, com a página 0-based e o signal', async () => {
      apiGetMock.mockResolvedValue({ itens: [], pagina: 0, tamanho: 20, totalItens: 0 })
      const controle = new AbortController()

      await listarSessoes({ pontoId: '', status: '', de: '', ate: '', pagina: 1 }, controle.signal)
      await listarSessoes({ pontoId: PONTO, status: 'FECHADA', de: '2026-10-01', ate: '2026-10-24', pagina: 3 })

      expect(apiGetMock).toHaveBeenNthCalledWith(1, '/caixa/sessoes?pagina=0&tamanho=20', {
        autenticada: true,
        signal: controle.signal,
      })
      expect(apiGetMock).toHaveBeenNthCalledWith(
        2,
        `/caixa/sessoes?pontoId=${PONTO}&status=FECHADA&de=2026-10-01&ate=2026-10-24&pagina=2&tamanho=20`,
        { autenticada: true, signal: undefined },
      )
    })
  })
})
