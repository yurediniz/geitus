import { describe, it, expect, vi, beforeEach } from 'vitest'

import {
  alterarPropriaSenha,
  atualizarUsuario,
  criarUsuario,
  inativarUsuario,
  listarUsuarios,
  reativarUsuario,
  redefinirSenhaUsuario,
} from '@/services/usuarioService'
import { apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type { UsuarioCriarRequest } from '@/types/usuario'

vi.mock('@/services/httpClient', () => ({
  apiGet: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
}))

const apiGetMock = vi.mocked(apiGet)
const apiPostMock = vi.mocked(apiPost)
const apiPatchMock = vi.mocked(apiPatch)

const criarRequest: UsuarioCriarRequest = {
  nome: 'Maria',
  email: 'maria@empresa.com',
  senha: 'senhaSegura123',
  perfil: 'OPERADOR',
}

describe('usuarioService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lista usuarios autenticados sem filtros', async () => {
    apiGetMock.mockResolvedValue([])

    await listarUsuarios()

    expect(apiGetMock).toHaveBeenCalledWith('/usuarios', { autenticada: true })
  })

  it('lista usuarios com busca, status ativo e perfil', async () => {
    apiGetMock.mockResolvedValue([])

    await listarUsuarios({ busca: ' maria ', status: 'ativos', perfil: 'ADMIN' })

    expect(apiGetMock).toHaveBeenCalledWith('/usuarios?busca=maria&ativo=true&perfil=ADMIN', {
      autenticada: true,
    })
  })

  it('omite o perfil quando o filtro e "todos" e usa ativo=false para inativos', async () => {
    apiGetMock.mockResolvedValue([])

    await listarUsuarios({ status: 'inativos', perfil: 'todos' })

    expect(apiGetMock).toHaveBeenCalledWith('/usuarios?ativo=false', { autenticada: true })
  })

  it('cria usuario via POST autenticado', async () => {
    apiPostMock.mockResolvedValue({})

    await criarUsuario(criarRequest)

    expect(apiPostMock).toHaveBeenCalledWith('/usuarios', criarRequest, { autenticada: true })
  })

  it('atualiza nome e perfil via PATCH autenticado', async () => {
    apiPatchMock.mockResolvedValue({})

    await atualizarUsuario(5, { nome: 'Maria Silva', perfil: 'ADMIN' })

    expect(apiPatchMock).toHaveBeenCalledWith(
      '/usuarios/5',
      { nome: 'Maria Silva', perfil: 'ADMIN' },
      { autenticada: true },
    )
  })

  it('inativa e reativa usuario via PATCH autenticado', async () => {
    apiPatchMock.mockResolvedValue({})

    await inativarUsuario(5)
    await reativarUsuario(5)

    expect(apiPatchMock).toHaveBeenNthCalledWith(1, '/usuarios/5/inativar', {}, { autenticada: true })
    expect(apiPatchMock).toHaveBeenNthCalledWith(2, '/usuarios/5/reativar', {}, { autenticada: true })
  })

  it('redefine a senha de um usuario via PATCH autenticado', async () => {
    apiPatchMock.mockResolvedValue(undefined)

    await redefinirSenhaUsuario(5, { novaSenha: 'novaSenha123' })

    expect(apiPatchMock).toHaveBeenCalledWith(
      '/usuarios/5/senha',
      { novaSenha: 'novaSenha123' },
      { autenticada: true },
    )
  })

  it('troca a propria senha via PATCH autenticado', async () => {
    apiPatchMock.mockResolvedValue(undefined)

    await alterarPropriaSenha({ senhaAtual: 'atual123', novaSenha: 'novaSenha123' })

    expect(apiPatchMock).toHaveBeenCalledWith(
      '/usuarios/me/senha',
      { senhaAtual: 'atual123', novaSenha: 'novaSenha123' },
      { autenticada: true },
    )
  })
})
