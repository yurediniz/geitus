import { apiGet, apiPatch, apiPost } from '@/services/httpClient'
import type {
  AlterarSenhaRequest,
  ListarUsuariosParams,
  RedefinirSenhaRequest,
  Usuario,
  UsuarioAtualizarRequest,
  UsuarioCriarRequest,
} from '@/types/usuario'

/**
 * Servico de gestao de Usuarios. Centraliza as chamadas HTTP para evitar
 * duplicacao de logica de API nos componentes (ver httpClient para injecao do
 * token e tratamento de erros). Todas as rotas sao autenticadas e a empresa e
 * sempre derivada do usuario autenticado (DEC-016).
 */

function montarQuery(params: ListarUsuariosParams = {}): string {
  const searchParams = new URLSearchParams()
  const busca = params.busca?.trim()

  if (busca) {
    searchParams.set('busca', busca)
  }

  if (params.status === 'ativos') {
    searchParams.set('ativo', 'true')
  }

  if (params.status === 'inativos') {
    searchParams.set('ativo', 'false')
  }

  if (params.perfil && params.perfil !== 'todos') {
    searchParams.set('perfil', params.perfil)
  }

  const query = searchParams.toString()
  return query ? `?${query}` : ''
}

/** Lista os usuarios da empresa do usuario autenticado (com filtros opcionais). */
export function listarUsuarios(params: ListarUsuariosParams = {}): Promise<Usuario[]> {
  return apiGet<Usuario[]>(`/usuarios${montarQuery(params)}`, { autenticada: true })
}

/** Cria um usuario na empresa do usuario autenticado. */
export function criarUsuario(dados: UsuarioCriarRequest): Promise<Usuario> {
  return apiPost<Usuario>('/usuarios', dados, { autenticada: true })
}

/** Atualiza nome e perfil de um usuario da empresa do usuario autenticado. */
export function atualizarUsuario(id: number, dados: UsuarioAtualizarRequest): Promise<Usuario> {
  return apiPatch<Usuario>(`/usuarios/${id}`, dados, { autenticada: true })
}

/** Inativa (soft delete) um usuario da empresa do usuario autenticado. */
export function inativarUsuario(id: number): Promise<Usuario> {
  return apiPatch<Usuario>(`/usuarios/${id}/inativar`, {}, { autenticada: true })
}

/** Reativa um usuario da empresa do usuario autenticado. */
export function reativarUsuario(id: number): Promise<Usuario> {
  return apiPatch<Usuario>(`/usuarios/${id}/reativar`, {}, { autenticada: true })
}

/** Redefine a senha de um usuario da empresa (acao administrativa; responde 204). */
export function redefinirSenhaUsuario(id: number, dados: RedefinirSenhaRequest): Promise<void> {
  return apiPatch<void>(`/usuarios/${id}/senha`, dados, { autenticada: true })
}

/** Troca a propria senha do usuario autenticado (exige a senha atual; responde 204). */
export function alterarPropriaSenha(dados: AlterarSenhaRequest): Promise<void> {
  return apiPatch<void>('/usuarios/me/senha', dados, { autenticada: true })
}
