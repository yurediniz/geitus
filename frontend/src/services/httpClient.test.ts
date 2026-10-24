import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  apiDelete,
  apiGet,
  apiPost,
  apiPostComStatus,
  apiPut,
  apiPutMultipart,
  HttpError,
  setUnauthorizedHandler,
} from '@/services/httpClient'
import { getStoredToken } from '@/services/tokenStorage'

// Mocka o tokenStorage para controlar o token sem depender do localStorage.
vi.mock('@/services/tokenStorage', () => ({
  getStoredToken: vi.fn(),
}))

const getStoredTokenMock = vi.mocked(getStoredToken)

/** Cria um Response fake com status e (opcionalmente) um corpo JSON. */
function respostaFake(status: number, corpo?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (corpo === undefined) {
        throw new Error('sem corpo')
      }
      return corpo
    },
  } as unknown as Response
}

/** Extrai os headers passados ao fetch como um objeto simples. */
function headersDaChamada(): Record<string, string> {
  const chamada = vi.mocked(globalThis.fetch).mock.calls[0]
  const init = chamada?.[1] as RequestInit | undefined
  return (init?.headers ?? {}) as Record<string, string>
}

describe('httpClient', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    getStoredTokenMock.mockReturnValue(null)
    setUnauthorizedHandler(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    setUnauthorizedHandler(null)
  })

  describe('injecao do token (Authorization)', () => {
    it('injeta Authorization: Bearer <token> em chamada autenticada com token salvo', async () => {
      getStoredTokenMock.mockReturnValue('token-abc')
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(200, { ok: true }))

      await apiGet('/auth/me', { autenticada: true })

      expect(headersDaChamada().Authorization).toBe('Bearer token-abc')
    })

    it('NAO injeta Authorization quando a chamada nao e autenticada', async () => {
      getStoredTokenMock.mockReturnValue('token-abc')
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(200, { ok: true }))

      await apiGet('/health')

      expect(headersDaChamada().Authorization).toBeUndefined()
    })

    it('NAO injeta Authorization em chamada autenticada sem token salvo', async () => {
      getStoredTokenMock.mockReturnValue(null)
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(200, { ok: true }))

      await apiGet('/auth/me', { autenticada: true })

      expect(headersDaChamada().Authorization).toBeUndefined()
    })
  })

  describe('tratamento de 401 (sessao expirada)', () => {
    it('dispara o handler de 401 registrado quando a chamada e autenticada', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(401))

      await expect(apiGet('/auth/me', { autenticada: true })).rejects.toMatchObject({
        status: 401,
      })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('dispara o handler de 401 tambem em POST autenticado (simetria com GET)', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(401))

      await expect(
        apiPost('/algum-recurso', { valor: 1 }, { autenticada: true }),
      ).rejects.toMatchObject({ status: 401 })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('NAO dispara o handler quando a chamada NAO e autenticada', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(401))

      await expect(apiPost('/auth/login', { email: 'a', senha: 'b' })).rejects.toMatchObject({
        status: 401,
      })
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('mapeamento de erros', () => {
    it('normaliza a lista de campos do backend (ApiError.CampoInvalido) em Record', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        respostaFake(400, {
          mensagem: 'Um ou mais campos sao invalidos.',
          campos: [{ campo: 'telefone', mensagem: 'Telefone inválido.' }],
        }),
      )

      const erro = await apiPost('/clientes', {}).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(HttpError)
      expect((erro as HttpError).campos).toEqual({ telefone: 'Telefone inválido.' })
    })

    it('ignora itens malformados na lista de campos', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        respostaFake(400, {
          campos: [{ campo: 'nome', mensagem: 'Informe o nome.' }, { campo: 'cpf' }, 'texto', null],
        }),
      )

      const erro = await apiPost('/clientes', {}).catch((e: unknown) => e)
      expect((erro as HttpError).campos).toEqual({ nome: 'Informe o nome.' })
    })

    it('mantem undefined quando o corpo 400 nao traz campos', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(400, { mensagem: 'CPF inválido.' }))

      const erro = await apiPost('/clientes', {}).catch((e: unknown) => e)
      expect((erro as HttpError).campos).toBeUndefined()
    })

    it('aceita campos ja no formato Record', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        respostaFake(400, { mensagem: 'Um ou mais campos sao invalidos.', campos: { email: 'Informe o e-mail.' } }),
      )

      await expect(apiPost('/auth/login', {})).rejects.toMatchObject({
        status: 400,
        message: 'Um ou mais campos sao invalidos.',
        campos: { email: 'Informe o e-mail.' },
      })
    })

    it('preserva a mensagem de regra de negocio em 400 sem campos', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        respostaFake(400, { mensagem: 'Já existe um produto com este SKU nesta empresa.' }),
      )

      await expect(apiPost('/produtos', {})).rejects.toMatchObject({
        status: 400,
        message: 'Já existe um produto com este SKU nesta empresa.',
      })
    })

    it('mapeia 400 sem corpo para HttpError sem campos', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(400))

      const erro = await apiPost('/auth/login', {}).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(HttpError)
      expect((erro as HttpError).status).toBe(400)
      expect((erro as HttpError).campos).toBeUndefined()
    })

    it('surface a mensagem de regra de negocio em 409 (conflito)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        respostaFake(409, { mensagem: 'Não é possível rebaixar o último administrador ativo da empresa.' }),
      )

      await expect(apiPost('/usuarios', {}, { autenticada: true })).rejects.toMatchObject({
        status: 409,
        message: 'Não é possível rebaixar o último administrador ativo da empresa.',
      })
    })

    it('normaliza os campos tambem no 409 (conflito de um campo)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        respostaFake(409, {
          mensagem: 'Já existe um produto com este SKU nesta empresa.',
          campos: [{ campo: 'sku', mensagem: 'Já existe um produto com este SKU nesta empresa.' }],
        }),
      )

      await expect(apiPost('/produtos', {}, { autenticada: true })).rejects.toMatchObject({
        status: 409,
        message: 'Já existe um produto com este SKU nesta empresa.',
        campos: { sku: 'Já existe um produto com este SKU nesta empresa.' },
      })
    })

    it('409 sem campos continua com campos undefined', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(409, { mensagem: 'Conflito.' }))

      const erro = await apiPost('/usuarios', {}, { autenticada: true }).catch((e: unknown) => e)
      expect((erro as HttpError).campos).toBeUndefined()
    })

    it('junta mensagens diferentes do mesmo campo repetido na lista', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        respostaFake(400, {
          campos: [
            { campo: 'codigosBarras', mensagem: 'Código repetido.' },
            { campo: 'codigosBarras', mensagem: 'Dígito inválido.' },
            { campo: 'codigosBarras', mensagem: 'Dígito inválido.' },
          ],
        }),
      )

      const erro = await apiPost('/produtos', {}).catch((e: unknown) => e)
      expect((erro as HttpError).campos).toEqual({ codigosBarras: 'Código repetido. Dígito inválido.' })
    })

    it('usa fallback generico em 409 sem corpo', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(409))

      const erro = await apiPost('/usuarios', {}, { autenticada: true }).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(HttpError)
      expect((erro as HttpError).status).toBe(409)
      expect((erro as HttpError).message).toBe('Requisicao falhou (HTTP 409).')
    })

    it('mapeia demais status de erro para HttpError com o status correspondente', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(500))

      await expect(apiGet('/health')).rejects.toMatchObject({ status: 500 })
    })

    it('mapeia falha de rede para HttpError com status 0', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('network error'))

      const erro = await apiGet('/health').catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(HttpError)
      expect((erro as HttpError).status).toBe(0)
    })

    it('falha de rede em POST tambem resulta em status 0', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('network error'))

      const erro = await apiPost('/auth/login', {}).catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(HttpError)
      expect((erro as HttpError).status).toBe(0)
    })
  })

  describe('cancelamento (AbortSignal)', () => {
    it('apiGet repassa o signal ao fetch', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(200, []))
      const controle = new AbortController()

      await apiGet('/produtos', { autenticada: true, signal: controle.signal })

      const init = vi.mocked(globalThis.fetch).mock.calls[0]?.[1] as RequestInit | undefined
      expect(init?.signal).toBe(controle.signal)
    })

    it('aborto nao vira erro de rede: lanca o AbortError original', async () => {
      const aborto = new DOMException('The operation was aborted.', 'AbortError')
      vi.mocked(globalThis.fetch).mockRejectedValue(aborto)
      const controle = new AbortController()
      controle.abort()

      const erro = await apiGet('/produtos', { signal: controle.signal }).catch((e: unknown) => e)

      expect(erro).toBe(aborto)
      expect(erro).not.toBeInstanceOf(HttpError)
    })
  })

  describe('respostas de sucesso', () => {
    it('retorna o corpo JSON em GET bem-sucedido', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(200, { valor: 42 }))

      const dados = await apiGet<{ valor: number }>('/health')
      expect(dados).toEqual({ valor: 42 })
    })

    it('retorna undefined em resposta 204 sem corpo (nao tenta parsear JSON)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(204))

      const dados = await apiPost('/usuarios/me/senha', { senhaAtual: 'a', novaSenha: 'b' }, { autenticada: true })
      expect(dados).toBeUndefined()
    })

    it('apiPostComStatus devolve o status junto do corpo (201 criou, 200 ja existia)', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(respostaFake(201, { id: 'a' }))
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(respostaFake(200, { id: 'a' }))

      await expect(apiPostComStatus('/x', {}, { autenticada: true })).resolves.toEqual({ status: 201, corpo: { id: 'a' } })
      await expect(apiPostComStatus('/x', {}, { autenticada: true })).resolves.toEqual({ status: 200, corpo: { id: 'a' } })
    })

    it('envia o corpo serializado e Content-Type JSON em POST', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(200, { ok: true }))

      await apiPost('/auth/login', { email: 'ana@empresa.com', senha: 'x' })

      const chamada = vi.mocked(globalThis.fetch).mock.calls[0]
      const init = chamada?.[1] as RequestInit
      expect(init.method).toBe('POST')
      expect(init.body).toBe(JSON.stringify({ email: 'ana@empresa.com', senha: 'x' }))
      expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    })
  })
  describe('apiPut', () => {
    it('envia PUT autenticado com o corpo JSON e retorna o corpo da resposta', async () => {
      getStoredTokenMock.mockReturnValue('token-abc')
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(200, { ok: true }))

      const dados = await apiPut('/etiqueta-balanca', { prefixo: '2' }, { autenticada: true })

      const chamada = vi.mocked(globalThis.fetch).mock.calls[0]
      const init = chamada?.[1] as RequestInit
      expect(String(chamada?.[0])).toMatch(/\/etiqueta-balanca$/)
      expect(init.method).toBe('PUT')
      expect(init.body).toBe(JSON.stringify({ prefixo: '2' }))
      expect(headersDaChamada().Authorization).toBe('Bearer token-abc')
      expect(headersDaChamada()['Content-Type']).toBe('application/json')
      expect(dados).toEqual({ ok: true })
    })

    it('mantem os campos do 400 e o status 0 em falha de rede', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        respostaFake(400, { mensagem: 'Dados inválidos.', campos: [{ campo: 'prefixo', mensagem: 'x' }] }),
      )
      await expect(apiPut('/etiqueta-balanca', {}, { autenticada: true })).rejects.toMatchObject({
        status: 400,
        campos: { prefixo: 'x' },
      })

      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new TypeError('network error'))
      await expect(apiPut('/etiqueta-balanca', {})).rejects.toMatchObject({ status: 0 })
    })
  })

  describe('apiDelete', () => {
    it('envia DELETE autenticado e retorna undefined em 204 sem corpo', async () => {
      getStoredTokenMock.mockReturnValue('token-abc')
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(204))

      const dados = await apiDelete('/categorias/abc', { autenticada: true })

      const chamada = vi.mocked(globalThis.fetch).mock.calls[0]
      const init = chamada?.[1] as RequestInit
      expect(String(chamada?.[0])).toMatch(/\/categorias\/abc$/)
      expect(init.method).toBe('DELETE')
      expect(init.body).toBeUndefined()
      expect(headersDaChamada().Authorization).toBe('Bearer token-abc')
      expect(headersDaChamada()['Content-Type']).toBeUndefined()
      expect(dados).toBeUndefined()
    })

    it('surface a mensagem do backend em 409 no DELETE', async () => {
      vi.mocked(globalThis.fetch).mockResolvedValue(
        respostaFake(409, { mensagem: 'Esta unidade está em uso por 3 produto(s).' }),
      )

      await expect(apiDelete('/unidades/abc', { autenticada: true })).rejects.toMatchObject({
        status: 409,
        message: 'Esta unidade está em uso por 3 produto(s).',
      })
    })

    it('dispara o handler de 401 em DELETE autenticado', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(401))

      await expect(apiDelete('/unidades/abc', { autenticada: true })).rejects.toMatchObject({
        status: 401,
      })
      expect(handler).toHaveBeenCalledTimes(1)
    })

    it('falha de rede em DELETE resulta em status 0', async () => {
      vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('network error'))

      const erro = await apiDelete('/unidades/abc').catch((e: unknown) => e)
      expect(erro).toBeInstanceOf(HttpError)
      expect((erro as HttpError).status).toBe(0)
    })
  })

  describe('apiPutMultipart', () => {
    it('envia PUT autenticado com o FormData, sem Content-Type manual (o navegador poe o boundary)', async () => {
      getStoredTokenMock.mockReturnValue('token-abc')
      vi.mocked(globalThis.fetch).mockResolvedValue(respostaFake(200, { ok: true }))
      const formulario = new FormData()
      formulario.append('grande', new Blob(['g']), 'grande.webp')

      const dados = await apiPutMultipart('/produtos/abc/imagem', formulario)

      const chamada = vi.mocked(globalThis.fetch).mock.calls[0]
      const init = chamada?.[1] as RequestInit
      expect(String(chamada?.[0])).toMatch(/\/produtos\/abc\/imagem$/)
      expect(init.method).toBe('PUT')
      expect(init.body).toBe(formulario)
      expect(headersDaChamada().Authorization).toBe('Bearer token-abc')
      expect(headersDaChamada()['Content-Type']).toBeUndefined()
      expect(dados).toEqual({ ok: true })
    })

    it('mantem a mensagem do 400, o handler de 401 e o status 0 em falha de rede', async () => {
      const handler = vi.fn()
      setUnauthorizedHandler(handler)
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        respostaFake(400, { mensagem: 'Formato de imagem não aceito. Use WebP ou JPEG.' }),
      )
      await expect(apiPutMultipart('/x', new FormData())).rejects.toMatchObject({
        status: 400,
        message: 'Formato de imagem não aceito. Use WebP ou JPEG.',
      })

      vi.mocked(globalThis.fetch).mockResolvedValueOnce(respostaFake(401))
      await expect(apiPutMultipart('/x', new FormData())).rejects.toMatchObject({ status: 401 })
      expect(handler).toHaveBeenCalledTimes(1)

      vi.mocked(globalThis.fetch).mockRejectedValueOnce(new TypeError('network error'))
      await expect(apiPutMultipart('/x', new FormData())).rejects.toMatchObject({ status: 0 })
    })
  })
})
