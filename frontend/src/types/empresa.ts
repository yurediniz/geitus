/**
 * Tipos compartilhados do dominio de empresa.
 *
 * Refletem o contrato da API do backend:
 * - GET  /api/empresas/minha  -> `Empresa` (detalhe: representante + endereco)
 * - PATCH /api/empresas/minha -> `EmpresaAtualizarRequest`
 * - GET  /api/auth/me         -> objeto `empresa` aninhado, minimo (`EmpresaResumo`)
 *
 * A empresa e sempre derivada do usuario autenticado (DEC-016): nenhum
 * `empresaId` externo trafega nestes tipos.
 */

/** Distingue empresa formal (com CNPJ) de informal/autonomo (sem CNPJ). */
export type TipoPessoa = 'FISICA' | 'JURIDICA'

/**
 * Empresa aninhada em login/`/auth/me`, mantida minima de proposito: e o que o
 * layout e o `useAuth` consomem. Nao inclui representante/endereco.
 */
export interface EmpresaResumo {
  id: number
  nome: string
  ativo: boolean
  criadoEm: string
  atualizadoEm: string | null
}

/** Representante legal da empresa (sempre presente). */
export interface RepresentanteLegal {
  nome: string
  cpf: string
  telefone: string
  email: string
}

/** Endereco da empresa. `complemento` e opcional (pode vir nulo). */
export interface Endereco {
  cep: string
  logradouro: string
  numero: string
  complemento: string | null
  bairro: string
  municipio: string
  uf: string
}

/**
 * Empresa do usuario autenticado em detalhe, conforme GET /api/empresas/minha.
 * Para `FISICA`, `cnpj`/`razaoSocial`/`inscricaoEstadual` vem nulos.
 */
export interface Empresa {
  id: number
  nome: string
  telefone: string
  email: string
  tipoPessoa: TipoPessoa
  cnpj: string | null
  razaoSocial: string | null
  inscricaoEstadual: string | null
  representanteLegal: RepresentanteLegal
  endereco: Endereco
  ativo: boolean
  criadoEm: string
  atualizadoEm: string | null
}

/** Corpo do representante legal enviado no PATCH. */
export type RepresentanteLegalRequest = RepresentanteLegal

/** Corpo de endereco enviado no PATCH (`complemento` opcional). */
export interface EnderecoRequest {
  cep: string
  logradouro: string
  numero: string
  complemento?: string | null
  bairro: string
  municipio: string
  uf: string
}

/**
 * Corpo enviado para PATCH /api/empresas/minha (espelha o GET, sem
 * `id`/`ativo`/timestamps). Os campos de PJ so se aplicam quando
 * `tipoPessoa === 'JURIDICA'`. A normalizacao para digitos (CPF/CNPJ/
 * telefone/CEP) e responsabilidade do backend.
 */
export interface EmpresaAtualizarRequest {
  nome: string
  telefone: string
  email: string
  tipoPessoa: TipoPessoa
  cnpj?: string | null
  razaoSocial?: string | null
  inscricaoEstadual?: string | null
  representanteLegal: RepresentanteLegalRequest
  endereco: EnderecoRequest
}
