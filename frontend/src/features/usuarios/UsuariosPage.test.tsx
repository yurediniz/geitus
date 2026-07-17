import type { ReactElement } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { UsuariosPage } from '@/features/usuarios/UsuariosPage'
import {
  atualizarUsuario,
  criarUsuario,
  inativarUsuario,
  listarUsuarios,
  reativarUsuario,
  redefinirSenhaUsuario,
} from '@/services/usuarioService'
import { HttpError } from '@/services/httpClient'
import type { Usuario } from '@/types/usuario'

vi.mock('@/services/usuarioService', () => ({
  listarUsuarios: vi.fn(),
  criarUsuario: vi.fn(),
  atualizarUsuario: vi.fn(),
  inativarUsuario: vi.fn(),
  reativarUsuario: vi.fn(),
  redefinirSenhaUsuario: vi.fn(),
}))

const listarUsuariosMock = vi.mocked(listarUsuarios)
const criarUsuarioMock = vi.mocked(criarUsuario)
const atualizarUsuarioMock = vi.mocked(atualizarUsuario)
const inativarUsuarioMock = vi.mocked(inativarUsuario)
const reativarUsuarioMock = vi.mocked(reativarUsuario)
const redefinirSenhaUsuarioMock = vi.mocked(redefinirSenhaUsuario)

const empresa = { id: 1, nome: 'Empresa Teste', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null }

const admin: Usuario = {
  id: 1,
  nome: 'Ana Admin',
  email: 'ana@empresa.com',
  perfil: 'ADMIN',
  ativo: true,
  criadoEm: '2026-01-01T00:00:00Z',
  atualizadoEm: null,
  empresa,
}

const operadorInativo: Usuario = {
  ...admin,
  id: 2,
  nome: 'Beto Operador',
  email: 'beto@empresa.com',
  perfil: 'OPERADOR',
  ativo: false,
}

function renderComProviders(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
}

async function abrirFormularioNovo() {
  fireEvent.click(screen.getByRole('button', { name: /novo usuário/i }))
  return screen.findByLabelText(/^nome$/i)
}

describe('UsuariosPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mostra o estado de carregamento', () => {
    listarUsuariosMock.mockReturnValue(new Promise(() => {}))

    renderComProviders(<UsuariosPage />)

    expect(screen.getByRole('heading', { name: 'Usuários' })).toBeInTheDocument()
    expect(screen.getByText(/carregando usuários/i)).toBeInTheDocument()
  })

  it('mostra o estado vazio quando nao ha usuarios', async () => {
    listarUsuariosMock.mockResolvedValue([])

    renderComProviders(<UsuariosPage />)

    expect(await screen.findByText(/nenhum usuário encontrado/i)).toBeInTheDocument()
  })

  it('lista usuarios com perfil e status', async () => {
    listarUsuariosMock.mockResolvedValue([admin, operadorInativo])

    renderComProviders(<UsuariosPage />)

    const adminItem = await screen.findByText('Ana Admin')
    const operadorItem = screen.getByText('Beto Operador')
    const adminCard = adminItem.closest('article') as HTMLElement
    const operadorCard = operadorItem.closest('article') as HTMLElement

    expect(within(adminCard).getByText('Administrador')).toBeInTheDocument()
    expect(within(operadorCard).getByText('Operador')).toBeInTheDocument()
    expect(within(operadorCard).getByText('Inativo')).toBeInTheDocument()
  })

  it('aplica busca e filtros de status e perfil', async () => {
    listarUsuariosMock.mockResolvedValue([])

    renderComProviders(<UsuariosPage />)
    await screen.findByText(/nenhum usuário encontrado/i)

    fireEvent.change(screen.getByLabelText(/busca/i), { target: { value: 'ana' } })
    fireEvent.change(screen.getByLabelText(/status/i), { target: { value: 'ativos' } })
    fireEvent.change(screen.getByLabelText(/^perfil$/i), { target: { value: 'ADMIN' } })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))

    await waitFor(() => {
      expect(listarUsuariosMock).toHaveBeenLastCalledWith({
        busca: 'ana',
        status: 'ativos',
        perfil: 'ADMIN',
      })
    })
  })

  it('valida e-mail e senha minima antes de criar', async () => {
    listarUsuariosMock.mockResolvedValue([])

    renderComProviders(<UsuariosPage />)
    await abrirFormularioNovo()

    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'Novo' } })
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'email-invalido' } })
    fireEvent.change(screen.getByLabelText(/^senha$/i), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: /criar usuário/i }))

    expect(await screen.findByText(/informe um e-mail válido/i)).toBeInTheDocument()
    expect(screen.getByText(/senha deve ter no mínimo 8 caracteres/i)).toBeInTheDocument()
    expect(criarUsuarioMock).not.toHaveBeenCalled()
  })

  it('cria usuario com sucesso', async () => {
    const criado: Usuario = { ...admin, id: 3, nome: 'Carla', email: 'carla@empresa.com', perfil: 'OPERADOR' }
    listarUsuariosMock.mockResolvedValueOnce([]).mockResolvedValueOnce([criado])
    criarUsuarioMock.mockResolvedValue(criado)

    renderComProviders(<UsuariosPage />)
    await abrirFormularioNovo()

    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'Carla' } })
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'carla@empresa.com' } })
    fireEvent.change(screen.getByLabelText(/^senha$/i), { target: { value: 'senhaSegura123' } })
    fireEvent.click(screen.getByRole('button', { name: /criar usuário/i }))

    await waitFor(() => {
      expect(criarUsuarioMock).toHaveBeenCalledWith({
        nome: 'Carla',
        email: 'carla@empresa.com',
        senha: 'senhaSegura123',
        perfil: 'OPERADOR',
      })
    })
    expect(await screen.findByText(/usuário criado com sucesso/i)).toBeInTheDocument()
  })

  it('mostra a mensagem do backend quando a criação responde 409 (e-mail duplicado)', async () => {
    listarUsuariosMock.mockResolvedValue([])
    criarUsuarioMock.mockRejectedValue(new HttpError(409, 'Já existe um usuário com este e-mail.'))

    renderComProviders(<UsuariosPage />)
    await abrirFormularioNovo()

    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'Carla' } })
    fireEvent.change(screen.getByLabelText(/e-mail/i), { target: { value: 'existe@empresa.com' } })
    fireEvent.change(screen.getByLabelText(/^senha$/i), { target: { value: 'senhaSegura123' } })
    fireEvent.click(screen.getByRole('button', { name: /criar usuário/i }))

    expect(await screen.findByText(/já existe um usuário com este e-mail/i)).toBeInTheDocument()
  })

  it('edita usuario (nome e perfil) sem exibir e-mail nem senha', async () => {
    listarUsuariosMock.mockResolvedValue([admin])
    atualizarUsuarioMock.mockResolvedValue({ ...admin, nome: 'Ana Maria' })

    renderComProviders(<UsuariosPage />)

    const item = await screen.findByText('Ana Admin')
    const card = item.closest('article')
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /editar/i }))

    // No modo edicao, e-mail e senha nao sao exibidos.
    expect(screen.queryByLabelText(/e-mail/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^senha$/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'Ana Maria' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    await waitFor(() => {
      expect(atualizarUsuarioMock).toHaveBeenCalledWith(1, { nome: 'Ana Maria', perfil: 'ADMIN' })
    })
    expect(await screen.findByText(/usuário atualizado com sucesso/i)).toBeInTheDocument()
  })

  it('ao editar, um 409 mostra a mensagem do backend (autoproteção), não a de e-mail', async () => {
    listarUsuariosMock.mockResolvedValue([admin])
    atualizarUsuarioMock.mockRejectedValue(
      new HttpError(409, 'Não é possível rebaixar o último administrador ativo da empresa.'),
    )

    renderComProviders(<UsuariosPage />)

    const item = await screen.findByText('Ana Admin')
    const card = item.closest('article')
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /editar/i }))

    fireEvent.change(screen.getByLabelText(/^nome$/i), { target: { value: 'Ana Maria' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar alterações/i }))

    expect(
      await screen.findByText(/não é possível rebaixar o último administrador ativo/i),
    ).toBeInTheDocument()
    expect(screen.queryByText(/já existe um usuário com este e-mail/i)).not.toBeInTheDocument()
  })

  it('inativa usuario com sucesso', async () => {
    listarUsuariosMock.mockResolvedValue([admin])
    inativarUsuarioMock.mockResolvedValue({ ...admin, ativo: false })

    renderComProviders(<UsuariosPage />)

    const item = await screen.findByText('Ana Admin')
    const card = item.closest('article')
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /inativar/i }))

    await waitFor(() => expect(inativarUsuarioMock).toHaveBeenCalledWith(1))
    expect(await screen.findByText(/usuário inativado com sucesso/i)).toBeInTheDocument()
  })

  it('mostra mensagem de autoprotecao (409) ao inativar o ultimo admin', async () => {
    listarUsuariosMock.mockResolvedValue([admin])
    inativarUsuarioMock.mockRejectedValue(
      new HttpError(409, 'Não é possível inativar o último administrador ativo da empresa.'),
    )

    renderComProviders(<UsuariosPage />)

    const item = await screen.findByText('Ana Admin')
    const card = item.closest('article')
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /inativar/i }))

    expect(
      await screen.findByText(/não é possível inativar o último administrador ativo/i),
    ).toBeInTheDocument()
  })

  it('reativa usuario inativo com sucesso', async () => {
    listarUsuariosMock.mockResolvedValue([operadorInativo])
    reativarUsuarioMock.mockResolvedValue({ ...operadorInativo, ativo: true })

    renderComProviders(<UsuariosPage />)

    const item = await screen.findByText('Beto Operador')
    const card = item.closest('article')
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /reativar/i }))

    await waitFor(() => expect(reativarUsuarioMock).toHaveBeenCalledWith(2))
    expect(await screen.findByText(/usuário reativado com sucesso/i)).toBeInTheDocument()
  })

  it('valida a confirmacao ao redefinir a senha', async () => {
    listarUsuariosMock.mockResolvedValue([admin])

    renderComProviders(<UsuariosPage />)

    const item = await screen.findByText('Ana Admin')
    const card = item.closest('article')
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /redefinir senha/i }))

    const novaSenha = await screen.findByLabelText(/^nova senha$/i)
    const dialogForm = novaSenha.closest('form') as HTMLElement
    fireEvent.change(novaSenha, { target: { value: 'senhaSegura123' } })
    fireEvent.change(screen.getByLabelText(/confirmar nova senha/i), { target: { value: 'diferente123' } })
    fireEvent.click(within(dialogForm).getByRole('button', { name: /redefinir senha/i }))

    expect(await screen.findByText(/a confirmação não confere/i)).toBeInTheDocument()
    expect(redefinirSenhaUsuarioMock).not.toHaveBeenCalled()
  })

  it('redefine a senha com sucesso', async () => {
    listarUsuariosMock.mockResolvedValue([admin])
    redefinirSenhaUsuarioMock.mockResolvedValue(undefined)

    renderComProviders(<UsuariosPage />)

    const item = await screen.findByText('Ana Admin')
    const card = item.closest('article')
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: /redefinir senha/i }))

    const novaSenha = await screen.findByLabelText(/^nova senha$/i)
    const dialogForm = novaSenha.closest('form') as HTMLElement
    fireEvent.change(novaSenha, { target: { value: 'senhaSegura123' } })
    fireEvent.change(screen.getByLabelText(/confirmar nova senha/i), { target: { value: 'senhaSegura123' } })
    fireEvent.click(within(dialogForm).getByRole('button', { name: /redefinir senha/i }))

    await waitFor(() => {
      expect(redefinirSenhaUsuarioMock).toHaveBeenCalledWith(1, { novaSenha: 'senhaSegura123' })
    })
    expect(await screen.findByText(/senha redefinida com sucesso/i)).toBeInTheDocument()
  })

  it('mostra erro ao carregar usuarios', async () => {
    listarUsuariosMock.mockRejectedValue(new Error('falha'))

    renderComProviders(<UsuariosPage />)

    expect(await screen.findByText(/não foi possível carregar os usuários/i)).toBeInTheDocument()
  })
})
