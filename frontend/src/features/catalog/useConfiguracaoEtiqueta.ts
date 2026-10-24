import { useQuery } from '@tanstack/react-query'

import { ETIQUETA_BALANCA_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { buscarConfiguracaoEtiqueta } from '@/services/etiquetaBalancaService'
import type { ConfiguracaoEtiquetaResponse } from '@/types/etiquetaBalanca'

/** A etiqueta muda pouco: a configuracao fica em cache por 5 minutos. */
const TEMPO_CONFIGURACAO_ETIQUETA = 5 * 60 * 1000

/**
 * Configuracao da etiqueta de balanca da empresa, compartilhada pelo cadastro
 * do produto (tamanho do codigo e aviso nos codigos de barras). Se a busca
 * falhar, quem usa segue sem ela (o backend continua validando).
 */
export function useConfiguracaoEtiqueta() {
  return useQuery<ConfiguracaoEtiquetaResponse>({
    queryKey: ETIQUETA_BALANCA_QUERY_KEY,
    queryFn: () => buscarConfiguracaoEtiqueta(),
    staleTime: TEMPO_CONFIGURACAO_ETIQUETA,
  })
}
