/**
 * Tipos compartilhados do modulo Clientes.
 *
 * Refletem o contrato da API do backend em /api/clientes. O `id` e o UUID
 * publico do cliente (o id numerico interno nunca e exposto). A empresa nao e
 * enviada nem recebida aqui: ela e sempre derivada do usuario autenticado.
 */

/** Cliente conforme retornado pela API. CPF e telefones vem so com digitos. */
export interface Cliente {
  id: string
  /** Numero de registro (1, 2, 3... por empresa), gerado na criacao e imutavel. */
  numero: number
  nome: string
  cpf: string | null
  telefone: string | null
  /** Quando true, o WhatsApp e o proprio telefone. */
  telefoneEWhatsapp: boolean
  /** WhatsApp ja resolvido pela API (o telefone, quando `telefoneEWhatsapp`). */
  whatsapp: string | null
  observacoes: string | null
  ativo: boolean
  criadoEm: string
  atualizadoEm: string | null
}

/**
 * Corpo enviado para cadastro/atualizacao de cliente. O PATCH substitui todos
 * os dados cadastrais: campo opcional `null` limpa o valor. `ativo` so muda
 * pelos endpoints de inativar/reativar.
 */
export interface ClienteRequest {
  nome: string
  cpf: string | null
  telefone: string | null
  telefoneEWhatsapp: boolean
  /** Ignorado (gravado null) quando `telefoneEWhatsapp` e true. */
  whatsapp: string | null
  observacoes: string | null
}

export type ClienteStatusFiltro = 'todos' | 'ativos' | 'inativos'

export interface ListarClientesParams {
  busca?: string
  status?: ClienteStatusFiltro
}
