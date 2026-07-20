import { apiGet, apiPatch } from '@/services/httpClient'
import type { Empresa, EmpresaAtualizarRequest } from '@/types/empresa'

/**
 * Servico de empresa. Centraliza as chamadas relacionadas a empresa do usuario
 * autenticado para nao duplicar logica de API entre componentes. A empresa e
 * sempre derivada do usuario autenticado (DEC-016): nenhum `empresaId` externo.
 */

/**
 * Retorna a empresa do usuario autenticado, em detalhe (representante legal,
 * dados da empresa e endereco). Chama GET /api/empresas/minha.
 */
export function obterEmpresa(): Promise<Empresa> {
  return apiGet<Empresa>('/empresas/minha', { autenticada: true })
}

/**
 * Atualiza os dados cadastrais da empresa do usuario autenticado (exige ADMIN
 * no backend). Chama PATCH /api/empresas/minha e retorna o cadastro atualizado.
 */
export function atualizarEmpresa(dados: EmpresaAtualizarRequest): Promise<Empresa> {
  return apiPatch<Empresa>('/empresas/minha', dados, { autenticada: true })
}
