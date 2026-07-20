/**
 * Tipos compartilhados do modulo de gestao de Usuarios.
 *
 * Refletem o contrato da API do backend em /api/usuarios. A empresa nao e
 * enviada: ela e sempre derivada do usuario autenticado (DEC-016). O
 * `UsuarioResponse` do backend traz a empresa aninhada e os timestamps.
 */
import type { EmpresaResumo } from '@/types/empresa'

/** Perfis de acesso (allow-list) do Geitus. */
export type Perfil = 'ADMIN' | 'OPERADOR'

/** Usuario da empresa, conforme retornado pela gestao de usuarios (nunca inclui senha). */
export interface Usuario {
  id: number
  nome: string
  email: string
  perfil: Perfil
  ativo: boolean
  criadoEm: string
  atualizadoEm: string | null
  empresa: EmpresaResumo
}

/** Corpo enviado para criar um usuario (senha exigida apenas na criacao). */
export interface UsuarioCriarRequest {
  nome: string
  email: string
  senha: string
  perfil: Perfil
}

/** Corpo enviado para editar um usuario (apenas nome e perfil). */
export interface UsuarioAtualizarRequest {
  nome: string
  perfil: Perfil
}

/** Corpo enviado por um ADMIN para redefinir a senha de outro usuario. */
export interface RedefinirSenhaRequest {
  novaSenha: string
}

/** Corpo enviado pelo proprio usuario para trocar a sua senha. */
export interface AlterarSenhaRequest {
  senhaAtual: string
  novaSenha: string
}

export type UsuarioStatusFiltro = 'todos' | 'ativos' | 'inativos'

export type PerfilFiltro = 'todos' | Perfil

export interface ListarUsuariosParams {
  busca?: string
  status?: UsuarioStatusFiltro
  perfil?: PerfilFiltro
}
