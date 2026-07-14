import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { BackendStatus } from '@/components/BackendStatus'
import { getHealth } from '@/services/healthService'

// Mocka o service de health para evitar chamada de rede real e permitir
// controlar cada estado (loading, sucesso e erro) por teste.
vi.mock('@/services/healthService', () => ({
  getHealth: vi.fn(),
}))

const getHealthMock = vi.mocked(getHealth)

function renderComProviders(ui: ReactElement) {
  // retry: false evita reexecucoes da query no caso de erro, deixando o
  // teste rapido e deterministico.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('BackendStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('exibe o estado de carregamento enquanto a query esta pendente', () => {
    // Promise que nunca resolve mantem a query em estado pendente.
    getHealthMock.mockReturnValue(new Promise(() => {}))

    renderComProviders(<BackendStatus />)

    expect(screen.getByText(/verificando conexão com o servidor/i)).toBeInTheDocument()
  })

  it('exibe "Conectado" e o nome da aplicação quando a query tem sucesso', async () => {
    getHealthMock.mockResolvedValue({
      status: 'UP',
      aplicacao: 'Geitus',
      timestamp: '2026-01-01T00:00:00Z',
    })

    renderComProviders(<BackendStatus />)

    expect(await screen.findByText(/conectado/i)).toBeInTheDocument()
    expect(screen.getByText(/Geitus/)).toBeInTheDocument()
  })

  it('exibe "Backend indisponível" quando a query falha', async () => {
    getHealthMock.mockRejectedValue(new Error('Falha de conexão'))

    renderComProviders(<BackendStatus />)

    expect(await screen.findByText(/backend indisponível/i)).toBeInTheDocument()
  })
})
