/**
 * Cliente HTTP base para as chamadas ao backend do Geitus.
 *
 * Por padrao usa o caminho relativo "/api", que em desenvolvimento e
 * encaminhado ao backend pelo proxy do Vite (ver vite.config.ts). Pode ser
 * sobrescrita pela variavel de ambiente VITE_API_BASE_URL (ver .env.example).
 */
import { getStoredToken } from '@/services/tokenStorage'

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api'

/**
 * Erro padronizado de requisicao HTTP, com o status retornado pelo servidor.
 *
 * Quando o backend responde com um corpo ApiError (ex.: validacao 400 com
 * `campos`), os detalhes ficam disponiveis em `campos` para uso opcional pela
 * interface. A mensagem de `Error` permanece generica.
 */
export class HttpError extends Error {
  readonly status: number
  /** Erros por campo, quando o backend os fornece (validacao 400 ou conflito 409 de um campo). */
  readonly campos?: Record<string, string>

  constructor(status: number, message: string, campos?: Record<string, string>) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.campos = campos
  }
}

/**
 * Callback invocado quando uma chamada autenticada recebe 401.
 *
 * A camada de autenticacao registra aqui a acao de "sessao expirada"
 * (limpar token + redirecionar para /login), mantendo o httpClient
 * desacoplado do roteamento e do estado de auth.
 */
type UnauthorizedHandler = () => void
let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

/**
 * Formato do corpo de erro padronizado do backend (ApiError). O backend envia
 * `campos` como lista de `{ campo, mensagem }` (ApiError.CampoInvalido); o
 * tipo fica `unknown` porque o corpo nao e confiavel e e normalizado abaixo.
 */
interface ApiErrorBody {
  mensagem?: string
  campos?: unknown
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null
}

/**
 * Converte `campos` do corpo de erro em `Record<campo, mensagem>`. Aceita a
 * lista do backend e, por compatibilidade, um objeto ja nesse formato. Itens
 * malformados sao ignorados; sem nenhum campo valido, retorna undefined. O
 * mesmo campo repetido na lista junta as mensagens diferentes (sem perder nenhuma).
 */
function normalizarCampos(campos: unknown): Record<string, string> | undefined {
  const resultado: Record<string, string> = {}
  if (Array.isArray(campos)) {
    const mensagensPorCampo = new Map<string, Set<string>>()
    for (const item of campos) {
      if (ehObjeto(item) && typeof item.campo === 'string' && typeof item.mensagem === 'string') {
        const mensagens = mensagensPorCampo.get(item.campo) ?? new Set<string>()
        mensagens.add(item.mensagem)
        mensagensPorCampo.set(item.campo, mensagens)
      }
    }
    for (const [campo, mensagens] of mensagensPorCampo) {
      resultado[campo] = [...mensagens].join(' ')
    }
  } else if (ehObjeto(campos)) {
    for (const [campo, mensagem] of Object.entries(campos)) {
      if (typeof mensagem === 'string') {
        resultado[campo] = mensagem
      }
    }
  }
  return Object.keys(resultado).length > 0 ? resultado : undefined
}

/** Extrai o corpo padronizado de erro, quando presente e no formato esperado. */
async function lerCorpoDoErro(resposta: Response): Promise<ApiErrorBody | undefined> {
  try {
    const corpo = (await resposta.json()) as ApiErrorBody
    if (corpo && typeof corpo === 'object') {
      return corpo
    }
  } catch {
    // Corpo ausente ou nao-JSON: sem detalhes adicionais.
  }
  return undefined
}

/** Monta os headers da requisicao, injetando Authorization quando autenticada. */
function montarHeaders(autenticada: boolean, temCorpo: boolean): HeadersInit {
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (temCorpo) {
    headers['Content-Type'] = 'application/json'
  }
  if (autenticada) {
    const token = getStoredToken()
    if (token) {
      headers.Authorization = `Bearer ${token}`
    }
  }
  return headers
}

/**
 * Trata o status da resposta: dispara o handler de 401 (sessao expirada) e
 * lanca HttpError com a mensagem generica adequada. Nunca expoe detalhes
 * tecnicos do servidor na mensagem.
 */
async function tratarErro(resposta: Response, autenticada: boolean): Promise<never> {
  if (resposta.status === 401) {
    if (autenticada) {
      unauthorizedHandler?.()
    }
    throw new HttpError(401, 'Nao autorizado.')
  }

  if (resposta.status === 400) {
    const corpo = await lerCorpoDoErro(resposta)
    throw new HttpError(400, corpo?.mensagem ?? 'Dados invalidos.', normalizarCampos(corpo?.campos))
  }

  if (resposta.status === 409) {
    // Conflito de regra de negocio (ex.: e-mail duplicado, ultimo ADMIN). O
    // backend curou uma mensagem clara em `ApiError.mensagem`; surface-a para a
    // interface exibir o motivo correto, sem vazar detalhe interno. Quando o
    // conflito e de um campo (ex.: SKU ou codigo de barras duplicado), `campos`
    // diz qual, para a tela marcar o campo sem depender do texto.
    const corpo = await lerCorpoDoErro(resposta)
    throw new HttpError(409, corpo?.mensagem ?? 'Requisicao falhou (HTTP 409).', normalizarCampos(corpo?.campos))
  }

  throw new HttpError(resposta.status, `Requisicao falhou (HTTP ${resposta.status}).`)
}

/** Rejeicao do `fetch` causada por cancelamento (AbortSignal), e nao por falha de rede. */
function ehAborto(erro: unknown): boolean {
  return ehObjeto(erro) && erro.name === 'AbortError'
}

/**
 * Executa um GET no caminho informado e retorna o corpo em JSON.
 *
 * @param path caminho relativo a URL base (ex.: "/health")
 * @param opcoes.autenticada injeta o header Authorization: Bearer <token>
 * @param opcoes.signal cancela a requisicao (ex.: o signal do TanStack Query
 *   quando a busca muda). O cancelamento relanca o AbortError original, para
 *   nao ser confundido com servidor fora do ar.
 */
export async function apiGet<T>(
  path: string,
  opcoes: { autenticada?: boolean; signal?: AbortSignal } = {},
): Promise<T> {
  const autenticada = opcoes.autenticada ?? false
  let resposta: Response
  try {
    resposta = await fetch(`${baseUrl}${path}`, {
      headers: montarHeaders(autenticada, false),
      signal: opcoes.signal,
    })
  } catch (erro) {
    if (ehAborto(erro) || opcoes.signal?.aborted) {
      throw erro
    }
    // Falha de rede (backend fora do ar, CORS bloqueado, etc.)
    throw new HttpError(0, 'Nao foi possivel conectar ao servidor.')
  }

  if (!resposta.ok) {
    await tratarErro(resposta, autenticada)
  }

  if (resposta.status === 204) {
    return undefined as T
  }

  return (await resposta.json()) as T
}

/**
 * Executa um POST no caminho informado com corpo JSON e retorna o corpo em JSON.
 *
 * @param path caminho relativo a URL base (ex.: "/auth/login")
 * @param corpo objeto serializado como JSON no corpo da requisicao
 * @param opcoes.autenticada injeta o header Authorization: Bearer <token>
 */
export async function apiPost<T>(
  path: string,
  corpo: unknown,
  opcoes: { autenticada?: boolean } = {},
): Promise<T> {
  return (await apiPostComStatus<T>(path, corpo, opcoes)).corpo
}

/**
 * POST que devolve tambem o status de sucesso, para quando ele tem sentido
 * (ex.: 201 criou, 200 ja existia). Mesmo tratamento de erro e de 204 do `apiPost`.
 */
export async function apiPostComStatus<T>(
  path: string,
  corpo: unknown,
  opcoes: { autenticada?: boolean } = {},
): Promise<{ status: number; corpo: T }> {
  const autenticada = opcoes.autenticada ?? false
  let resposta: Response
  try {
    resposta = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: montarHeaders(autenticada, true),
      body: JSON.stringify(corpo),
    })
  } catch {
    throw new HttpError(0, 'Nao foi possivel conectar ao servidor.')
  }

  if (!resposta.ok) {
    await tratarErro(resposta, autenticada)
  }

  if (resposta.status === 204) {
    return { status: resposta.status, corpo: undefined as T }
  }

  return { status: resposta.status, corpo: (await resposta.json()) as T }
}

/** PATCH e PUT: corpo JSON, mesmo tratamento de erro e de 204 do POST. */
async function enviarComCorpo<T>(
  metodo: 'PATCH' | 'PUT',
  path: string,
  corpo: unknown,
  opcoes: { autenticada?: boolean },
): Promise<T> {
  const autenticada = opcoes.autenticada ?? false
  let resposta: Response
  try {
    resposta = await fetch(`${baseUrl}${path}`, {
      method: metodo,
      headers: montarHeaders(autenticada, true),
      body: JSON.stringify(corpo),
    })
  } catch {
    throw new HttpError(0, 'Nao foi possivel conectar ao servidor.')
  }

  if (!resposta.ok) {
    await tratarErro(resposta, autenticada)
  }

  if (resposta.status === 204) {
    return undefined as T
  }

  return (await resposta.json()) as T
}

/**
 * Executa um PATCH no caminho informado com corpo JSON e retorna o corpo em JSON.
 *
 * @param path caminho relativo a URL base (ex.: "/empresas/minha")
 * @param corpo objeto serializado como JSON no corpo da requisicao
 * @param opcoes.autenticada injeta o header Authorization: Bearer <token>
 */
export function apiPatch<T>(path: string, corpo: unknown, opcoes: { autenticada?: boolean } = {}): Promise<T> {
  return enviarComCorpo<T>('PATCH', path, corpo, opcoes)
}

/**
 * Executa um PUT (substituicao completa do recurso) com corpo JSON e retorna o
 * corpo em JSON.
 *
 * @param path caminho relativo a URL base (ex.: "/etiqueta-balanca")
 * @param corpo objeto serializado como JSON no corpo da requisicao
 * @param opcoes.autenticada injeta o header Authorization: Bearer <token>
 */
export function apiPut<T>(path: string, corpo: unknown, opcoes: { autenticada?: boolean } = {}): Promise<T> {
  return enviarComCorpo<T>('PUT', path, corpo, opcoes)
}

/**
 * Executa um PUT autenticado com corpo `multipart/form-data` (ex.: a imagem do
 * produto) e retorna o corpo em JSON. Sem `Content-Type` manual: o navegador o
 * monta com o boundary das partes. Mesmo tratamento de erro e de 204 do PUT.
 *
 * @param path caminho relativo a URL base (ex.: "/produtos/{id}/imagem")
 * @param formulario partes enviadas no corpo
 */
export async function apiPutMultipart<T>(path: string, formulario: FormData): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(`${baseUrl}${path}`, {
      method: 'PUT',
      headers: montarHeaders(true, false),
      body: formulario,
    })
  } catch {
    throw new HttpError(0, 'Nao foi possivel conectar ao servidor.')
  }

  if (!resposta.ok) {
    await tratarErro(resposta, true)
  }

  if (resposta.status === 204) {
    return undefined as T
  }

  return (await resposta.json()) as T
}

/**
 * Executa um DELETE no caminho informado. Exclusoes bem-sucedidas costumam
 * responder 204 sem corpo; nesse caso retorna undefined.
 *
 * @param path caminho relativo a URL base (ex.: "/categorias/{id}")
 * @param opcoes.autenticada injeta o header Authorization: Bearer <token>
 */
export async function apiDelete<T = void>(
  path: string,
  opcoes: { autenticada?: boolean } = {},
): Promise<T> {
  const autenticada = opcoes.autenticada ?? false
  let resposta: Response
  try {
    resposta = await fetch(`${baseUrl}${path}`, {
      method: 'DELETE',
      headers: montarHeaders(autenticada, false),
    })
  } catch {
    throw new HttpError(0, 'Nao foi possivel conectar ao servidor.')
  }

  if (!resposta.ok) {
    await tratarErro(resposta, autenticada)
  }

  if (resposta.status === 204) {
    return undefined as T
  }

  return (await resposta.json()) as T
}
