import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { ClientesPage } from '@/features/customers/ClientesPage'
import { HttpError } from '@/services/httpClient'
import { useAuth } from '@/hooks/useAuth'
import {
  atualizarCliente,
  cadastrarCliente,
  inativarCliente,
  listarClientes,
  reativarCliente,
} from '@/services/clienteService'
import type { Cliente } from '@/types/cliente'

vi.mock('@/services/clienteService', () => ({
  listarClientes: vi.fn(),
  cadastrarCliente: vi.fn(),
  atualizarCliente: vi.fn(),
  inativarCliente: vi.fn(),
  reativarCliente: vi.fn(),
}))

// Mocka o hook de auth para alternar o perfil (ADMIN inativa/reativa; OPERADOR nao).
vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const listarClientesMock = vi.mocked(listarClientes)
const cadastrarClienteMock = vi.mocked(cadastrarCliente)
const atualizarClienteMock = vi.mocked(atualizarCliente)
const inativarClienteMock = vi.mocked(inativarCliente)
const reativarClienteMock = vi.mocked(reativarCliente)
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

const ID_MARIA = '3f1c2b9e-1d2a-4c3b-8e7f-0a1b2c3d4e5f'
const ID_JOAO = '7a8b9c0d-1e2f-4a3b-9c8d-7e6f5a4b3c2d'

const clienteAtivo: Cliente = {
  id: ID_MARIA,
  nome: 'Maria Silva',
  cpf: '11144477735',
  telefone: '11987654321',
  telefoneEWhatsapp: true,
  whatsapp: '11987654321',
  observacoes: null,
  ativo: true,
  criadoEm: '2026-10-20T00:00:00Z',
  atualizadoEm: null,
}

const clienteInativo: Cliente = {
  id: ID_JOAO,
  nome: 'João Pereira',
  cpf: null,
  telefone: '1133224455',
  telefoneEWhatsapp: false,
  whatsapp: '11912345678',
  observacoes: null,
  ativo: false,
  criadoEm: '2026-10-20T00:00:00Z',
  atualizadoEm: null,
}

function renderComProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

async function abrirFormularioNovo() {
  fireEvent.click(await screen.findByRole('button', { name: /novo cliente/i }))
  return screen.findByLabelText(/^nome$/i)
}

function salvar() {
  fireEvent.click(screen.getByRole('button', { name: /salvar cliente/i }))
}

async function cartaoDoCliente(nome: string): Promise<HTMLElement> {
  const titulo = await screen.findByText(nome)
  const card = titulo.closest('article')
  expect(card).not.toBeNull()
  return card as HTMLElement
}

describe('ClientesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
  })

  it('lista clientes ativos por padrao', async () => {
    listarClientesMock.mockResolvedValue([clienteAtivo])

    renderComProviders(<ClientesPage />)

    const card = await cartaoDoCliente('Maria Silva')
    expect(listarClientesMock).toHaveBeenCalledWith({ busca: '', status: 'ativos' })
    expect(screen.getByLabelText(/status/i)).toHaveValue('ativos')
    expect(within(card).getByText('(11) 98765-4321')).toBeInTheDocument()
    expect(within(card).getByText('WhatsApp')).toBeInTheDocument()
    expect(within(card).getByText('Ativo')).toBeInTheDocument()
  })

  it('mostra o whatsapp proprio quando difere do telefone', async () => {
    listarClientesMock.mockResolvedValue([clienteInativo])

    renderComProviders(<ClientesPage />)

    const card = await cartaoDoCliente('João Pereira')
    expect(within(card).getByText('(11) 3322-4455')).toBeInTheDocument()
    expect(within(card).getByText('(11) 91234-5678')).toBeInTheDocument()
    expect(within(card).getByText('Inativo')).toBeInTheDocument()
  })

  it('exibe estado de carregamento', () => {
    listarClientesMock.mockReturnValue(new Promise(() => {}))

    renderComProviders(<ClientesPage />)

    expect(screen.getByRole('heading', { name: 'Clientes' })).toBeInTheDocument()
    expect(screen.getByText(/carregando clientes/i)).toBeInTheDocument()
  })

  it('exibe estado vazio', async () => {
    listarClientesMock.mockResolvedValue([])

    renderComProviders(<ClientesPage />)

    expect(await screen.findByText(/nenhum cliente cadastrado ainda/i)).toBeInTheDocument()
  })

  it('exibe estado vazio de busca quando ha termo aplicado', async () => {
    listarClientesMock.mockResolvedValue([])

    renderComProviders(<ClientesPage />)

    await screen.findByText(/nenhum cliente cadastrado ainda/i)
    fireEvent.change(screen.getByLabelText(/busca/i), { target: { value: '(11) 98765' } })
    fireEvent.click(screen.getByRole('button', { name: /^buscar$/i }))

    await waitFor(() => {
      expect(listarClientesMock).toHaveBeenLastCalledWith({ busca: '(11) 98765', status: 'ativos' })
    })
    expect(await screen.findByText(/nenhum cliente encontrado/i)).toBeInTheDocument()
  })

  it('exibe erro com tentar novamente', async () => {
    listarClientesMock.mockRejectedValueOnce(new Error('falha')).mockResolvedValueOnce([clienteAtivo])

    renderComProviders(<ClientesPage />)

    expect(await screen.findByText(/não foi possível carregar os clientes/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))

    expect(await screen.findByText('Maria Silva')).toBeInTheDocument()
    expect(listarClientesMock).toHaveBeenCalledTimes(2)
  })

  it('cadastra cliente com telefone como whatsapp', async () => {
    const criado: Cliente = { ...clienteAtivo, nome: 'Ana', cpf: null }
    listarClientesMock.mockResolvedValueOnce([]).mockResolvedValue([criado])
    cadastrarClienteMock.mockResolvedValue(criado)

    renderComProviders(<ClientesPage />)

    const nome = await abrirFormularioNovo()
    await waitFor(() => expect(nome).toHaveFocus())
    expect(screen.getByRole('checkbox', { name: /este número é whatsapp/i })).toBeChecked()

    fireEvent.change(nome, { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText(/^telefone/i), { target: { value: '11987654321' } })
    expect(screen.getByLabelText(/^telefone/i)).toHaveValue('(11) 98765-4321')
    salvar()

    await waitFor(() => {
      expect(cadastrarClienteMock).toHaveBeenCalledWith({
        nome: 'Ana',
        cpf: null,
        telefone: '11987654321',
        telefoneEWhatsapp: true,
        whatsapp: null,
        observacoes: null,
      })
    })
    expect(await screen.findByText('Cliente cadastrado com sucesso.')).toBeInTheDocument()
  })

  it('desmarcar whatsapp mostra campo proprio e envia o numero', async () => {
    listarClientesMock.mockResolvedValue([])
    cadastrarClienteMock.mockResolvedValue({ ...clienteInativo, ativo: true })

    renderComProviders(<ClientesPage />)

    const nome = await abrirFormularioNovo()
    expect(screen.queryByLabelText(/^whatsapp/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /este número é whatsapp/i }))
    const whatsapp = await screen.findByLabelText(/^whatsapp/i)

    fireEvent.change(nome, { target: { value: 'João Pereira' } })
    fireEvent.change(screen.getByLabelText(/^telefone/i), { target: { value: '1133224455' } })
    fireEvent.change(whatsapp, { target: { value: '11912345678' } })
    salvar()

    await waitFor(() => {
      expect(cadastrarClienteMock).toHaveBeenCalledWith({
        nome: 'João Pereira',
        cpf: null,
        telefone: '1133224455',
        telefoneEWhatsapp: false,
        whatsapp: '11912345678',
        observacoes: null,
      })
    })
  })

  it('telefone colado com +55 e enviado sem o codigo do pais', async () => {
    listarClientesMock.mockResolvedValue([])
    cadastrarClienteMock.mockResolvedValue({ ...clienteAtivo, nome: 'Ana', cpf: null })

    renderComProviders(<ClientesPage />)

    const nome = await abrirFormularioNovo()
    fireEvent.change(nome, { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText(/^telefone/i), { target: { value: '+55 11 98765-4321' } })
    expect(screen.getByLabelText(/^telefone/i)).toHaveValue('(11) 98765-4321')
    salvar()

    await waitFor(() => {
      expect(cadastrarClienteMock).toHaveBeenCalledWith(
        expect.objectContaining({ telefone: '11987654321' }),
      )
    })
  })

  it('valida cpf invalido no formulario', async () => {
    listarClientesMock.mockResolvedValue([])

    renderComProviders(<ClientesPage />)

    const nome = await abrirFormularioNovo()
    fireEvent.change(nome, { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText(/^cpf/i), { target: { value: '11111111111' } })
    expect(screen.getByLabelText(/^cpf/i)).toHaveValue('111.111.111-11')
    salvar()

    expect(await screen.findByText('Informe um CPF válido.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^cpf/i)).toHaveAttribute('aria-invalid', 'true')
    expect(cadastrarClienteMock).not.toHaveBeenCalled()
  })

  it('valida nome obrigatorio', async () => {
    listarClientesMock.mockResolvedValue([])

    renderComProviders(<ClientesPage />)

    await abrirFormularioNovo()
    salvar()

    expect(await screen.findByText('Informe o nome do cliente.')).toBeInTheDocument()
    expect(cadastrarClienteMock).not.toHaveBeenCalled()
  })

  it('exibe mensagem do backend em 409', async () => {
    listarClientesMock.mockResolvedValue([])
    cadastrarClienteMock.mockRejectedValue(
      new HttpError(409, 'Já existe um cliente com este CPF nesta empresa.'),
    )

    renderComProviders(<ClientesPage />)

    const nome = await abrirFormularioNovo()
    fireEvent.change(nome, { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText(/^cpf/i), { target: { value: '111.444.777-35' } })
    salvar()

    expect(
      await screen.findByText('Já existe um cliente com este CPF nesta empresa.'),
    ).toBeInTheDocument()
    expect(cadastrarClienteMock).toHaveBeenCalledWith(expect.objectContaining({ cpf: '11144477735' }))
  })

  it('exibe as mensagens de campos quando o backend responde 400', async () => {
    listarClientesMock.mockResolvedValue([])
    cadastrarClienteMock.mockRejectedValue(
      new HttpError(400, 'Dados invalidos.', { telefone: 'Telefone inválido.' }),
    )

    renderComProviders(<ClientesPage />)

    const nome = await abrirFormularioNovo()
    fireEvent.change(nome, { target: { value: 'Ana' } })
    salvar()

    expect(await screen.findByText('Telefone inválido.')).toBeInTheDocument()
  })

  it('edita cliente marcando o telefone como whatsapp', async () => {
    listarClientesMock.mockResolvedValue([clienteInativo])
    atualizarClienteMock.mockResolvedValue({ ...clienteInativo, telefoneEWhatsapp: true })

    renderComProviders(<ClientesPage />)

    const card = await cartaoDoCliente('João Pereira')
    fireEvent.click(within(card).getByRole('button', { name: /editar/i }))

    expect(await screen.findByLabelText(/^nome$/i)).toHaveValue('João Pereira')
    expect(screen.getByLabelText(/^whatsapp/i)).toHaveValue('(11) 91234-5678')
    fireEvent.click(screen.getByRole('checkbox', { name: /este número é whatsapp/i }))
    expect(screen.queryByLabelText(/^whatsapp/i)).not.toBeInTheDocument()
    salvar()

    await waitFor(() => {
      expect(atualizarClienteMock).toHaveBeenCalledWith(ID_JOAO, {
        nome: 'João Pereira',
        cpf: null,
        telefone: '1133224455',
        telefoneEWhatsapp: true,
        whatsapp: null,
        observacoes: null,
      })
    })
    expect(await screen.findByText('Cliente atualizado com sucesso.')).toBeInTheDocument()
  })

  it('operador nao ve inativar mas ve novo cliente e editar', async () => {
    definirPerfil('OPERADOR')
    listarClientesMock.mockResolvedValue([clienteAtivo, clienteInativo])

    renderComProviders(<ClientesPage />)

    await cartaoDoCliente('Maria Silva')
    expect(screen.getByRole('button', { name: /novo cliente/i })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /editar/i })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: /inativar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /reativar/i })).not.toBeInTheDocument()
  })

  it('admin inativa cliente', async () => {
    listarClientesMock.mockResolvedValue([clienteAtivo])
    inativarClienteMock.mockResolvedValue({ ...clienteAtivo, ativo: false })

    renderComProviders(<ClientesPage />)

    const card = await cartaoDoCliente('Maria Silva')
    fireEvent.click(within(card).getByRole('button', { name: /inativar/i }))

    await waitFor(() => {
      expect(inativarClienteMock).toHaveBeenCalledWith(ID_MARIA)
    })
    expect(await screen.findByText('Cliente inativado com sucesso.')).toBeInTheDocument()
  })

  it('admin reativa cliente', async () => {
    listarClientesMock.mockResolvedValue([clienteInativo])
    reativarClienteMock.mockResolvedValue({ ...clienteInativo, ativo: true })

    renderComProviders(<ClientesPage />)

    const card = await cartaoDoCliente('João Pereira')
    fireEvent.click(within(card).getByRole('button', { name: /reativar/i }))

    await waitFor(() => {
      expect(reativarClienteMock).toHaveBeenCalledWith(ID_JOAO)
    })
    expect(await screen.findByText('Cliente reativado com sucesso.')).toBeInTheDocument()
  })
})
