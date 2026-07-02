import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { EmpresaPage } from '@/features/company/EmpresaPage'
import { atualizarMinhaEmpresa, getMinhaEmpresa } from '@/services/empresaService'
import type { Empresa } from '@/types/empresa'

// Mocka o service de empresa para evitar rede real e controlar cada cenario.
vi.mock('@/services/empresaService', () => ({
  getMinhaEmpresa: vi.fn(),
  atualizarMinhaEmpresa: vi.fn(),
}))

const getMinhaEmpresaMock = vi.mocked(getMinhaEmpresa)
const atualizarMinhaEmpresaMock = vi.mocked(atualizarMinhaEmpresa)

const empresaFake: Empresa = {
  id: 1,
  nome: 'Mercado Central',
  ativo: true,
  criadoEm: '2026-01-15T00:00:00Z',
  atualizadoEm: null,
}

function renderComProviders(ui: ReactElement) {
  // retry: false deixa o teste rapido e deterministico em caso de erro.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('EmpresaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mostra o indicador de carregamento enquanto busca os dados', () => {
    getMinhaEmpresaMock.mockReturnValue(new Promise(() => {}))

    renderComProviders(<EmpresaPage />)

    expect(screen.getByText(/carregando dados da empresa/i)).toBeInTheDocument()
  })

  it('exibe os dados da empresa apos o carregamento', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaFake)

    renderComProviders(<EmpresaPage />)

    expect(await screen.findByDisplayValue('Mercado Central')).toBeInTheDocument()
    expect(screen.getByText('Ativa')).toBeInTheDocument()
  })

  it('exibe mensagem de erro quando a busca falha', async () => {
    getMinhaEmpresaMock.mockRejectedValue(new Error('falha de rede'))

    renderComProviders(<EmpresaPage />)

    expect(
      await screen.findByText(/não foi possível carregar os dados da empresa/i),
    ).toBeInTheDocument()
  })

  it('bloqueia o submit e nao chama o service quando o nome fica vazio', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaFake)

    renderComProviders(<EmpresaPage />)

    const campoNome = await screen.findByLabelText(/nome da empresa/i)
    fireEvent.change(campoNome, { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    expect(await screen.findByText(/informe o nome da empresa/i)).toBeInTheDocument()
    expect(atualizarMinhaEmpresaMock).not.toHaveBeenCalled()
  })

  it('salva o novo nome e mostra feedback de sucesso', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaFake)
    const empresaAtualizada: Empresa = { ...empresaFake, nome: 'Mercado Central II' }
    atualizarMinhaEmpresaMock.mockResolvedValue(empresaAtualizada)

    renderComProviders(<EmpresaPage />)

    const campoNome = await screen.findByLabelText(/nome da empresa/i)
    fireEvent.change(campoNome, { target: { value: 'Mercado Central II' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    await waitFor(() => {
      expect(atualizarMinhaEmpresaMock).toHaveBeenCalledWith('Mercado Central II')
    })
    expect(await screen.findByText(/dados salvos com sucesso/i)).toBeInTheDocument()
  })

  it('limpa o feedback de sucesso quando o nome volta a ser editado', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaFake)
    const empresaAtualizada: Empresa = { ...empresaFake, nome: 'Mercado Central II' }
    atualizarMinhaEmpresaMock.mockResolvedValue(empresaAtualizada)

    renderComProviders(<EmpresaPage />)

    const campoNome = await screen.findByLabelText(/nome da empresa/i)
    fireEvent.change(campoNome, { target: { value: 'Mercado Central II' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    expect(await screen.findByText(/dados salvos com sucesso/i)).toBeInTheDocument()

    fireEvent.change(campoNome, { target: { value: 'Mercado Central III' } })

    expect(screen.queryByText(/dados salvos com sucesso/i)).not.toBeInTheDocument()
  })

  it('exibe mensagem de erro quando a atualizacao falha', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaFake)
    atualizarMinhaEmpresaMock.mockRejectedValue(new Error('falha ao salvar'))

    renderComProviders(<EmpresaPage />)

    const campoNome = await screen.findByLabelText(/nome da empresa/i)
    fireEvent.change(campoNome, { target: { value: 'Novo Nome' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    expect(
      await screen.findByText(/não foi possível salvar as alterações/i),
    ).toBeInTheDocument()
  })
})
