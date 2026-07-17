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
  /** Erros de validacao por campo, quando o backend os fornece (HTTP 400). */
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

/** Formato do corpo de erro padronizado do backend (ApiError). */
interface ApiErrorBody {
  mensagem?: string
  campos?: Record<string, string>
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
    const campos = corpo?.campos && typeof corpo.campos === 'object' ? corpo.campos : undefined
    throw new HttpError(400, corpo?.mensagem ?? 'Dados invalidos.', campos)
  }

  if (resposta.status === 409) {
    // Conflito de regra de negocio (ex.: e-mail duplicado, ultimo ADMIN). O
    // backend curou uma mensagem clara em `ApiError.mensagem`; surface-a para a
    // interface exibir o motivo correto, sem vazar detalhe interno.
    const corpo = await lerCorpoDoErro(resposta)
    throw new HttpError(409, corpo?.mensagem ?? 'Requisicao falhou (HTTP 409).')
  }

  throw new HttpError(resposta.status, `Requisicao falhou (HTTP ${resposta.status}).`)
}

/**
 * Executa um GET no caminho informado e retorna o corpo em JSON.
 *
 * @param path caminho relativo a URL base (ex.: "/health")
 * @param opcoes.autenticada injeta o header Authorization: Bearer <token>
 */
export async function apiGet<T>(
  path: string,
  opcoes: { autenticada?: boolean } = {},
): Promise<T> {
  const autenticada = opcoes.autenticada ?? false
  let resposta: Response
  try {
    resposta = await fetch(`${baseUrl}${path}`, {
      headers: montarHeaders(autenticada, false),
    })
  } catch {
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
export async function apiPatch<T>(
  path: string,
  corpo: unknown,
  opcoes: { autenticada?: boolean } = {},
): Promise<T> {
  const autenticada = opcoes.autenticada ?? false
  let resposta: Response
  try {
    resposta = await fetch(`${baseUrl}${path}`, {
      method: 'PATCH',
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
