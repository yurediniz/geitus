import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'

import { queryClient } from '@/app/queryClient'
import { AuthProvider } from '@/hooks/useAuth'

interface AppProvidersProps {
  children: ReactNode
  /** Acao executada quando uma chamada autenticada recebe 401 (sessao expirada). */
  onUnauthorized?: () => void
}

/**
 * Reune os provedores globais da aplicacao: TanStack Query e autenticacao.
 * Novos provedores (tema, etc.) serao adicionados aqui no futuro.
 */
export function AppProviders({ children, onUnauthorized }: AppProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider onUnauthorized={onUnauthorized}>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
