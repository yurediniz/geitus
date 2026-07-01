import { QueryClient } from '@tanstack/react-query'

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
