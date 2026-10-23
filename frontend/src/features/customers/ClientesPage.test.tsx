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
  numero: 12,
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
  numero: 13,
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

  it('mostra o Nº do cliente no card e no topo do formulario de edicao (Fase B2)', async () => {
    listarClientesMock.mockResolvedValue([clienteAtivo])

    renderComProviders(<ClientesPage />)

    const card = await cartaoDoCliente('Maria Silva')
    expect(within(card).getByText('Nº 12')).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: /editar/i }))
    const termo = await screen.findByText('Nº do Cliente')
    expect(termo.nextElementSibling).toHaveTextContent('12')
  })

  it('no cadastro novo o formulario nao mostra o Nº (ainda nao existe)', async () => {
    listarClientesMock.mockResolvedValue([])

    renderComProviders(<ClientesPage />)
    await abrirFormularioNovo()

    expect(screen.queryByText('Nº do Cliente')).not.toBeInTheDocument()
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

  it('estado vazio com filtro ativos orienta e o botao abre o cadastro', async () => {
    listarClientesMock.mockResolvedValue([])

    renderComProviders(<ClientesPage />)

    expect(await screen.findByText('Nenhum cliente ativo.')).toBeInTheDocument()
    expect(
      screen.getByText('Cadastre um cliente — só o nome já basta — ou troque o filtro para ver os inativos.'),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Cadastrar cliente' }))

    expect(await screen.findByLabelText(/^nome$/i)).toHaveValue('')
    expect(screen.getByRole('button', { name: /salvar cliente/i })).toBeInTheDocument()
  })

  it('estado vazio com filtro todos indica que nao ha clientes cadastrados', async () => {
    listarClientesMock.mockResolvedValue([])

    renderComProviders(<ClientesPage />)

    await screen.findByText('Nenhum cliente ativo.')
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'todos' } })

    expect(await screen.findByText('Nenhum cliente cadastrado ainda.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cadastrar cliente' })).toBeInTheDocument()
  })

  it('exibe estado vazio de busca quando ha termo aplicado', async () => {
    listarClientesMock.mockResolvedValue([])

    renderComProviders(<ClientesPage />)

    await screen.findByText('Nenhum cliente ativo.')
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
    expect(screen.queryByLabelText(/outro número de whatsapp/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('checkbox', { name: /este número é whatsapp/i }))
    const whatsapp = await screen.findByLabelText(/outro número de whatsapp/i)

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

  it('409 orienta buscar com filtro Todos', async () => {
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
      await screen.findByText(
        'Já existe um cliente com este CPF (ele pode estar inativo). Busque pelo CPF com o filtro "Todos". Se estiver inativo, um administrador pode reativá-lo.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^cpf/i)).toHaveAttribute('aria-invalid', 'true')
    // A mensagem do backend continua no topo do formulario.
    expect(screen.getByText('Já existe um cliente com este CPF nesta empresa.')).toBeInTheDocument()
  })

  it('troca de status mantem a busca aplicada', async () => {
    listarClientesMock.mockResolvedValue([])

    renderComProviders(<ClientesPage />)

    await screen.findByText('Nenhum cliente ativo.')
    fireEvent.change(screen.getByLabelText(/busca/i), { target: { value: 'ana' } })
    fireEvent.click(screen.getByRole('button', { name: /^buscar$/i }))
    await waitFor(() => {
      expect(listarClientesMock).toHaveBeenLastCalledWith({ busca: 'ana', status: 'ativos' })
    })

    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'inativos' } })

    await waitFor(() => {
      expect(listarClientesMock).toHaveBeenLastCalledWith({ busca: 'ana', status: 'inativos' })
    })
  })

  it('exibe as mensagens de campos no proprio campo quando o backend responde 400', async () => {
    listarClientesMock.mockResolvedValue([])
    // `campos` ja no formato normalizado pelo httpClient (Record campo -> mensagem).
    cadastrarClienteMock.mockRejectedValue(
      new HttpError(400, 'Um ou mais campos sao invalidos.', { telefone: 'Telefone inválido.' }),
    )

    renderComProviders(<ClientesPage />)

    const nome = await abrirFormularioNovo()
    fireEvent.change(nome, { target: { value: 'Ana' } })
    salvar()

    expect(await screen.findByText('Telefone inválido.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^telefone/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Revise os campos destacados.')).toBeInTheDocument()
  })

  it('exibe a mensagem do backend em 400 sem campos', async () => {
    listarClientesMock.mockResolvedValue([])
    cadastrarClienteMock.mockRejectedValue(new HttpError(400, 'CPF inválido.'))

    renderComProviders(<ClientesPage />)

    const nome = await abrirFormularioNovo()
    fireEvent.change(nome, { target: { value: 'Ana' } })
    salvar()

    expect(await screen.findByText('CPF inválido.')).toBeInTheDocument()
    expect(screen.queryByText('Revise os dados do cliente e tente novamente.')).not.toBeInTheDocument()
  })

  it('telefone com DDD 10 bloqueia o envio', async () => {
    listarClientesMock.mockResolvedValue([])

    renderComProviders(<ClientesPage />)

    const nome = await abrirFormularioNovo()
    fireEvent.change(nome, { target: { value: 'Ana' } })
    fireEvent.change(screen.getByLabelText(/^telefone/i), { target: { value: '10987654321' } })
    salvar()

    expect(await screen.findByText('Informe um telefone válido com DDD.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^telefone/i)).toHaveAttribute('aria-invalid', 'true')
    expect(cadastrarClienteMock).not.toHaveBeenCalled()
  })

  it('whatsapp proprio invalido bloqueia o envio', async () => {
    listarClientesMock.mockResolvedValue([])

    renderComProviders(<ClientesPage />)

    const nome = await abrirFormularioNovo()
    fireEvent.change(nome, { target: { value: 'Ana' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /este número é whatsapp/i }))
    const whatsapp = await screen.findByLabelText(/outro número de whatsapp/i)
    expect(screen.getByText('Deixe em branco se o cliente não usa WhatsApp.')).toBeInTheDocument()
    fireEvent.change(whatsapp, { target: { value: '1198765' } })
    salvar()

    expect(await screen.findByText('Informe um WhatsApp válido com DDD.')).toBeInTheDocument()
    expect(whatsapp).toHaveAttribute('aria-invalid', 'true')
    expect(cadastrarClienteMock).not.toHaveBeenCalled()
  })

  it('apagar o CPF na edicao envia cpf null', async () => {
    listarClientesMock.mockResolvedValue([clienteAtivo])
    atualizarClienteMock.mockResolvedValue({ ...clienteAtivo, cpf: null })

    renderComProviders(<ClientesPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Maria Silva' }))
    const cpf = await screen.findByLabelText(/^cpf/i)
    expect(cpf).toHaveValue('111.444.777-35')
    fireEvent.change(cpf, { target: { value: '' } })
    salvar()

    await waitFor(() => {
      expect(atualizarClienteMock).toHaveBeenCalledWith(ID_MARIA, expect.objectContaining({ cpf: null }))
    })
  })

  it('desmarcar whatsapp na edicao de cliente com telefone como whatsapp mostra o campo vazio', async () => {
    listarClientesMock.mockResolvedValue([clienteAtivo])

    renderComProviders(<ClientesPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Editar Maria Silva' }))
    const checkbox = await screen.findByRole('checkbox', { name: /este número é whatsapp/i })
    expect(checkbox).toBeChecked()
    fireEvent.click(checkbox)

    expect(await screen.findByLabelText(/outro número de whatsapp/i)).toHaveValue('')
  })

  it('edita cliente marcando o telefone como whatsapp', async () => {
    listarClientesMock.mockResolvedValue([clienteInativo])
    atualizarClienteMock.mockResolvedValue({ ...clienteInativo, telefoneEWhatsapp: true })

    renderComProviders(<ClientesPage />)

    const card = await cartaoDoCliente('João Pereira')
    fireEvent.click(within(card).getByRole('button', { name: /editar/i }))

    expect(await screen.findByLabelText(/^nome$/i)).toHaveValue('João Pereira')
    expect(screen.getByLabelText(/outro número de whatsapp/i)).toHaveValue('(11) 91234-5678')
    fireEvent.click(screen.getByRole('checkbox', { name: /este número é whatsapp/i }))
    expect(screen.queryByLabelText(/outro número de whatsapp/i)).not.toBeInTheDocument()
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

  it('403 ao inativar explica que so administradores alteram o status', async () => {
    listarClientesMock.mockResolvedValue([clienteAtivo])
    inativarClienteMock.mockRejectedValue(new HttpError(403, 'Requisicao falhou (HTTP 403).'))

    renderComProviders(<ClientesPage />)

    fireEvent.click(await screen.findByRole('button', { name: 'Inativar Maria Silva' }))

    expect(
      await screen.findByText('Somente administradores podem inativar ou reativar clientes.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Somente administradores podem inativar ou reativar clientes.',
    )
  })
})
