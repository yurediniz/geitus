import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { EmpresaPage } from '@/features/company/EmpresaPage'
import { atualizarEmpresa, obterEmpresa } from '@/services/empresaService'
import { buscarCep } from '@/services/cepService'
import { HttpError } from '@/services/httpClient'
import { useAuth } from '@/hooks/useAuth'
import type { Empresa } from '@/types/empresa'

// Mocka o service de empresa para evitar rede real e controlar cada cenario.
vi.mock('@/services/empresaService', () => ({
  obterEmpresa: vi.fn(),
  atualizarEmpresa: vi.fn(),
}))

// Mocka o autofill de CEP (chamada a terceiro) — controlado por teste.
vi.mock('@/services/cepService', () => ({
  buscarCep: vi.fn(),
}))

// Mocka o hook de auth para alternar o perfil (ADMIN edita / OPERADOR leitura).
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const getMinhaEmpresaMock = vi.mocked(obterEmpresa)
const atualizarMinhaEmpresaMock = vi.mocked(atualizarEmpresa)
const buscarCepMock = vi.mocked(buscarCep)
const useAuthMock = vi.mocked(useAuth)

function definirPerfil(perfil: 'ADMIN' | 'OPERADOR') {
  useAuthMock.mockReturnValue({
    usuario: {
      id: 1,
      nome: 'Ana Souza',
      email: 'ana@mercado.com',
      perfil,
      empresa: { id: 1, nome: 'Mercado Central', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
    },
    token: 'token',
    estaAutenticado: true,
    carregandoSessao: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

const empresaJuridica: Empresa = {
  id: 1,
  nome: 'Mercado Central',
  telefone: '11999990000',
  email: 'contato@mercado.com',
  tipoPessoa: 'JURIDICA',
  cnpj: '11222333000181',
  razaoSocial: 'Mercado Central LTDA',
  inscricaoEstadual: null,
  representanteLegal: {
    nome: 'Ana Souza',
    cpf: '39053344705',
    telefone: '11988887777',
    email: 'ana@mercado.com',
  },
  endereco: {
    cep: '01001000',
    logradouro: 'Praça da Sé',
    numero: '100',
    complemento: null,
    bairro: 'Sé',
    municipio: 'São Paulo',
    uf: 'SP',
  },
  ativo: true,
  criadoEm: '2026-01-15T00:00:00Z',
  atualizadoEm: null,
}

const empresaFisica: Empresa = {
  ...empresaJuridica,
  tipoPessoa: 'FISICA',
  cnpj: null,
  razaoSocial: null,
  inscricaoEstadual: null,
}

function renderComProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

describe('EmpresaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
  })

  it('mostra o indicador de carregamento enquanto busca os dados', () => {
    getMinhaEmpresaMock.mockReturnValue(new Promise(() => {}))

    renderComProviders(<EmpresaPage />)

    expect(screen.getByText(/carregando dados da empresa/i)).toBeInTheDocument()
  })

  it('exibe mensagem de erro quando a busca falha', async () => {
    getMinhaEmpresaMock.mockRejectedValue(new Error('falha de rede'))

    renderComProviders(<EmpresaPage />)

    expect(
      await screen.findByText(/não foi possível carregar os dados da empresa/i),
    ).toBeInTheDocument()
  })

  it('preenche o formulario com os dados da empresa carregada (PJ)', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaJuridica)

    renderComProviders(<EmpresaPage />)

    expect(await screen.findByDisplayValue('Mercado Central')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Mercado Central LTDA')).toBeInTheDocument()
    // CNPJ mascarado a partir dos digitos.
    expect(screen.getByDisplayValue('11.222.333/0001-81')).toBeInTheDocument()
    // "Sim, tenho CNPJ" selecionado.
    expect(screen.getByRole('radio', { name: /sim, tenho cnpj/i })).toBeChecked()
  })

  it('ADMIN salva a empresa PJ com dados normalizados em digitos', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaJuridica)
    atualizarMinhaEmpresaMock.mockResolvedValue(empresaJuridica)

    renderComProviders(<EmpresaPage />)

    await screen.findByDisplayValue('Mercado Central')
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    await waitFor(() => {
      expect(atualizarMinhaEmpresaMock).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: 'Mercado Central',
          tipoPessoa: 'JURIDICA',
          cnpj: '11222333000181',
          razaoSocial: 'Mercado Central LTDA',
          telefone: '11999990000',
          representanteLegal: expect.objectContaining({ cpf: '39053344705', telefone: '11988887777' }),
          endereco: expect.objectContaining({ cep: '01001000', numero: '100', uf: 'SP' }),
        }),
      )
    })
    expect(await screen.findByText(/dados da empresa salvos com sucesso/i)).toBeInTheDocument()
  })

  it('ADMIN salva empresa PF sem CNPJ (tipoPessoa FISICA, cnpj nulo)', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaFisica)
    atualizarMinhaEmpresaMock.mockResolvedValue(empresaFisica)

    renderComProviders(<EmpresaPage />)

    await screen.findByDisplayValue('Mercado Central')
    // Campos de PJ nao aparecem quando "nao".
    expect(screen.queryByLabelText(/^cnpj$/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    await waitFor(() => {
      expect(atualizarMinhaEmpresaMock).toHaveBeenCalledWith(
        expect.objectContaining({ tipoPessoa: 'FISICA', cnpj: null, razaoSocial: null }),
      )
    })
  })

  it('alterna "Já possui CNPJ?" revelando e ocultando os campos de PJ', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaFisica)

    renderComProviders(<EmpresaPage />)

    await screen.findByDisplayValue('Mercado Central')
    expect(screen.queryByLabelText(/^cnpj$/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /sim, tenho cnpj/i }))
    expect(await screen.findByLabelText(/^cnpj$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/razão social/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /não tenho cnpj/i }))
    await waitFor(() => {
      expect(screen.queryByLabelText(/^cnpj$/i)).not.toBeInTheDocument()
    })
  })

  it('exige CNPJ válido e razão social quando é PJ', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaFisica)

    renderComProviders(<EmpresaPage />)

    await screen.findByDisplayValue('Mercado Central')
    fireEvent.click(screen.getByRole('radio', { name: /sim, tenho cnpj/i }))
    await screen.findByLabelText(/^cnpj$/i)
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    expect(await screen.findByText(/informe um cnpj válido/i)).toBeInTheDocument()
    expect(screen.getByText(/informe a razão social/i)).toBeInTheDocument()
    expect(atualizarMinhaEmpresaMock).not.toHaveBeenCalled()
  })

  it('valida o CPF do representante pelos dígitos verificadores', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaJuridica)

    renderComProviders(<EmpresaPage />)

    const campoCpf = await screen.findByLabelText(/^cpf$/i)
    fireEvent.change(campoCpf, { target: { value: '11111111111' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    expect(await screen.findByText(/informe um cpf válido/i)).toBeInTheDocument()
    expect(atualizarMinhaEmpresaMock).not.toHaveBeenCalled()
  })

  it('preenche o endereço via CEP (autofill)', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaJuridica)
    buscarCepMock.mockResolvedValue({
      logradouro: 'Avenida Paulista',
      bairro: 'Bela Vista',
      municipio: 'São Paulo',
      uf: 'SP',
    })

    renderComProviders(<EmpresaPage />)

    const campoCep = await screen.findByLabelText(/^cep$/i)
    fireEvent.change(campoCep, { target: { value: '01310100' } })

    await waitFor(() => {
      expect(buscarCepMock).toHaveBeenCalledWith('01310100')
    })
    expect(await screen.findByDisplayValue('Avenida Paulista')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Bela Vista')).toBeInTheDocument()
  })

  it('mostra aviso e mantém preenchimento manual quando o CEP não é encontrado', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaJuridica)
    buscarCepMock.mockResolvedValue(null)

    renderComProviders(<EmpresaPage />)

    const campoCep = await screen.findByLabelText(/^cep$/i)
    fireEvent.change(campoCep, { target: { value: '99999999' } })

    expect(await screen.findByText(/não encontramos esse cep/i)).toBeInTheDocument()
  })

  it('marca "sem número" e grava "S/N" no envio', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaJuridica)
    atualizarMinhaEmpresaMock.mockResolvedValue(empresaJuridica)

    renderComProviders(<EmpresaPage />)

    await screen.findByDisplayValue('Mercado Central')
    const numero = screen.getByLabelText(/^número$/i)
    expect(numero).toBeEnabled()
    fireEvent.click(screen.getByLabelText(/sem número/i))
    expect(numero).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    await waitFor(() => {
      expect(atualizarMinhaEmpresaMock).toHaveBeenCalledWith(
        expect.objectContaining({ endereco: expect.objectContaining({ numero: 'S/N' }) }),
      )
    })
  })

  it('destaca o campo CNPJ e avisa quando o backend responde 409', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaJuridica)
    atualizarMinhaEmpresaMock.mockRejectedValue(
      new HttpError(409, 'CNPJ já cadastrado para outra empresa.'),
    )

    renderComProviders(<EmpresaPage />)

    await screen.findByDisplayValue('Mercado Central')
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    expect(await screen.findByText(/cnpj já cadastrado para outra empresa/i)).toBeInTheDocument()
    // Erro tambem no campo CNPJ.
    expect(screen.getByText(/este cnpj já está em uso por outra empresa/i)).toBeInTheDocument()
  })

  it('OPERADOR vê os dados em modo leitura, sem botão salvar', async () => {
    definirPerfil('OPERADOR')
    getMinhaEmpresaMock.mockResolvedValue(empresaJuridica)

    renderComProviders(<EmpresaPage />)

    expect(await screen.findByText(/somente administradores podem editar/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /salvar alterações/i })).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Mercado Central')).toBeDisabled()
  })

  it('mostra mensagem amigável quando a atualização falha por rede', async () => {
    getMinhaEmpresaMock.mockResolvedValue(empresaJuridica)
    atualizarMinhaEmpresaMock.mockRejectedValue(new Error('falha ao salvar'))

    renderComProviders(<EmpresaPage />)

    await screen.findByDisplayValue('Mercado Central')
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    expect(
      await screen.findByText(/não foi possível salvar os dados da empresa/i),
    ).toBeInTheDocument()
  })
})
