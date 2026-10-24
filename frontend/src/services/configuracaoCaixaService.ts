import { apiGet, apiPut } from '@/services/httpClient'
import type { ConfiguracaoDoCaixa, ConfiguracaoDoCaixaRequest } from '@/types/caixa'

/**
 * Configuracao do caixa (/api/configuracoes/caixa). Leitura para todos os
 * autenticados (a tela do caixa precisa do modo); alterar so ADMIN (403).
 */

const CAMINHO = '/configuracoes/caixa'

/** Sem configuracao gravada, o backend devolve o padrao (fechamento cego ligado). */
export function buscar(): Promise<ConfiguracaoDoCaixa> {
  return apiGet<ConfiguracaoDoCaixa>(CAMINHO, { autenticada: true })
}

export function salvar(dados: ConfiguracaoDoCaixaRequest): Promise<ConfiguracaoDoCaixa> {
  return apiPut<ConfiguracaoDoCaixa>(CAMINHO, dados, { autenticada: true })
}
