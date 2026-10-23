import { apiGet, apiPost, apiPut } from '@/services/httpClient'
import type {
  ConfiguracaoEtiqueta,
  ConfiguracaoEtiquetaResponse,
  SalvarEtiquetaResponse,
  TesteEtiquetaResponse,
} from '@/types/etiquetaBalanca'

/**
 * Servico da etiqueta de balanca (/api/etiqueta-balanca). Leitura e teste para
 * todos os perfis; salvar so ADMIN (o backend responde 403 ao OPERADOR).
 */

const CAMINHO = '/etiqueta-balanca'

/** A configuracao da empresa, ou o padrao (`padrao: true`) quando ainda nao foi gravada. */
export function buscarConfiguracaoEtiqueta(): Promise<ConfiguracaoEtiquetaResponse> {
  return apiGet<ConfiguracaoEtiquetaResponse>(CAMINHO, { autenticada: true })
}

/** Grava a configuracao e devolve os produtos cujo codigo ficou grande demais (aviso, nao bloqueia). */
export function salvarConfiguracaoEtiqueta(configuracao: ConfiguracaoEtiqueta): Promise<SalvarEtiquetaResponse> {
  return apiPut<SalvarEtiquetaResponse>(CAMINHO, configuracao, { autenticada: true })
}

/** Le um numero com a configuracao da tela (ainda nao salva) e procura o produto pelo codigo. */
export function testarEtiqueta(codigoLido: string, configuracao: ConfiguracaoEtiqueta): Promise<TesteEtiquetaResponse> {
  return apiPost<TesteEtiquetaResponse>(`${CAMINHO}/teste`, { codigoLido, configuracao }, { autenticada: true })
}
