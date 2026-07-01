/**
 * Cliente HTTP base para as chamadas ao backend do ERPell.
 *
 * A URL base vem da variavel de ambiente VITE_API_BASE_URL (ver .env.example).
 * Em desenvolvimento, o padrao aponta para o backend local em /api.
 */
const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080/api'

/**
 * Erro padronizado de requisicao HTTP, com o status retornado pelo servidor.
 */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/**
 * Executa um GET no caminho informado e retorna o corpo em JSON.
 *
 * @param path caminho relativo a URL base (ex.: "/health")
 */
export async function apiGet<T>(path: string): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(`${baseUrl}${path}`, {
      headers: { Accept: 'application/json' },
    })
  } catch {
    // Falha de rede (backend fora do ar, CORS bloqueado, etc.)
    throw new HttpError(0, 'Nao foi possivel conectar ao servidor.')
  }

  if (!resposta.ok) {
    throw new HttpError(resposta.status, `Requisicao falhou (HTTP ${resposta.status}).`)
  }

  return (await resposta.json()) as T
}
