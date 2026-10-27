import { apiGet, apiPut } from '@/services/httpClient'
import type { ConfiguracaoDoPdv, ConfiguracaoDoPdvRequest } from '@/types/pdv'

/**
 * Configuracao do PDV (/api/configuracoes/pdv, spec do PDV). Leitura
 * para todos os autenticados (a tela do PDV precisa das duas opcoes); alterar
 * so ADMIN (403, conferido tambem pelo perfil do banco).
 */

const CAMINHO = '/configuracoes/pdv'

/** Sem configuracao gravada, o padrao: vender sem estoque ligado e 10% de desconto maximo. */
export function buscar(): Promise<ConfiguracaoDoPdv> {
  return apiGet<ConfiguracaoDoPdv>(CAMINHO, { autenticada: true })
}

export function salvar(dados: ConfiguracaoDoPdvRequest): Promise<ConfiguracaoDoPdv> {
  return apiPut<ConfiguracaoDoPdv>(CAMINHO, dados, { autenticada: true })
}
