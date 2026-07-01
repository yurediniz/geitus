import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'

import { queryClient } from '@/app/queryClient'

interface AppProvidersProps {
  children: ReactNode
}

/**
 * Reune os provedores globais da aplicacao (por enquanto, apenas o TanStack Query).
 * Novos provedores (tema, autenticacao, etc.) serao adicionados aqui no futuro.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
