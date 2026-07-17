import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { TrocarSenhaSheet } from '@/features/usuarios/TrocarSenhaSheet'
import { alterarPropriaSenha } from '@/services/usuarioService'
import { HttpError } from '@/services/httpClient'

vi.mock('@/services/usuarioService', () => ({
  alterarPropriaSenha: vi.fn(),
}))

const alterarPropriaSenhaMock = vi.mocked(alterarPropriaSenha)

function renderComProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

/** Abre o painel e retorna o formulario, para escopar os botoes. */
async function abrirPainel() {
  fireEvent.click(screen.getByRole('button', { name: /trocar senha/i }))
  const senhaAtual = await screen.findByLabelText(/senha atual/i)
  return senhaAtual.closest('form') as HTMLElement
}

describe('TrocarSenhaSheet', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('valida quando a confirmacao nao confere com a nova senha', async () => {
    renderComProviders(<TrocarSenhaSheet />)
    const form = await abrirPainel()

    fireEvent.change(screen.getByLabelText(/senha atual/i), { target: { value: 'atual123' } })
    fireEvent.change(screen.getByLabelText(/^nova senha$/i), { target: { value: 'senhaSegura123' } })
    fireEvent.change(screen.getByLabelText(/confirmar nova senha/i), { target: { value: 'diferente123' } })
    fireEvent.click(within(form).getByRole('button', { name: /trocar senha/i }))

    expect(await screen.findByText(/a confirmação não confere/i)).toBeInTheDocument()
    expect(alterarPropriaSenhaMock).not.toHaveBeenCalled()
  })

  it('mostra feedback amigavel quando a senha atual esta incorreta (400)', async () => {
    alterarPropriaSenhaMock.mockRejectedValue(new HttpError(400, 'Dados invalidos.'))

    renderComProviders(<TrocarSenhaSheet />)
    const form = await abrirPainel()

    fireEvent.change(screen.getByLabelText(/senha atual/i), { target: { value: 'errada12' } })
    fireEvent.change(screen.getByLabelText(/^nova senha$/i), { target: { value: 'senhaSegura123' } })
    fireEvent.change(screen.getByLabelText(/confirmar nova senha/i), { target: { value: 'senhaSegura123' } })
    fireEvent.click(within(form).getByRole('button', { name: /trocar senha/i }))

    expect(await screen.findByText(/a senha atual está incorreta/i)).toBeInTheDocument()
  })

  it('troca a senha com sucesso', async () => {
    alterarPropriaSenhaMock.mockResolvedValue(undefined)

    renderComProviders(<TrocarSenhaSheet />)
    const form = await abrirPainel()

    fireEvent.change(screen.getByLabelText(/senha atual/i), { target: { value: 'atual123' } })
    fireEvent.change(screen.getByLabelText(/^nova senha$/i), { target: { value: 'senhaSegura123' } })
    fireEvent.change(screen.getByLabelText(/confirmar nova senha/i), { target: { value: 'senhaSegura123' } })
    fireEvent.click(within(form).getByRole('button', { name: /trocar senha/i }))

    await waitFor(() => {
      expect(alterarPropriaSenhaMock).toHaveBeenCalledWith({
        senhaAtual: 'atual123',
        novaSenha: 'senhaSegura123',
      })
    })
    expect(await screen.findByText(/senha alterada com sucesso/i)).toBeInTheDocument()
  })
})
