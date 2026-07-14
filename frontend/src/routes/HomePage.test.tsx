import type { ReactElement } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { HomePage } from '@/routes/HomePage'

// Evita chamada de rede real ao backend durante o teste.
vi.mock('@/services/healthService', () => ({
  getHealth: vi.fn().mockResolvedValue({
    status: 'UP',
    aplicacao: 'Geitus',
    timestamp: '2026-01-01T00:00:00Z',
  }),
}))

function renderComProviders(ui: ReactElement) {
  const queryClient = new QueryClient()
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('HomePage', () => {
  it('renderiza o título principal do Geitus', () => {
    renderComProviders(<HomePage />)

    expect(
      screen.getByRole('heading', { name: /Geitus — Plataforma de gestão/i }),
    ).toBeInTheDocument()
  })
})
