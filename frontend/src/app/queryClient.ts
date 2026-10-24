import { QueryClient } from '@tanstack/react-query'

import { aoEncerrarSessao } from '@/services/tokenStorage'

/**
 * Ao encerrar a sessao (logout ou 401), todo o cache e apagado: os dados de
 * uma sessao (ex.: o caixa aberto) nunca aparecem para o proximo login no
 * mesmo navegador. Devolve a funcao que cancela o registro.
 */
export function limparCacheAoEncerrarSessao(cliente: QueryClient): () => void {
  return aoEncerrarSessao(() => cliente.clear())
}

/**
 * Instancia unica do TanStack Query usada em toda a aplicacao.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Evita refazer a chamada a cada foco da janela durante o desenvolvimento.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

limparCacheAoEncerrarSessao(queryClient)
