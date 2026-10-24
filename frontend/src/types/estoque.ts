/**
 * Tipos do estoque do produto (Fase D). Refletem o contrato da API em
 * /api/produtos/{id}/estoque. O saldo so muda por movimentacoes imutaveis;
 * a empresa e o usuario do movimento vem sempre do usuario autenticado.
 */

/** Entrada soma, saida subtrai; ajuste leva o saldo a um valor contado. */
export type TipoMovimento = 'ENTRADA' | 'SAIDA' | 'AJUSTE'

/**
 * Motivo do movimento. `ESTOQUE_INICIAL` (cadastro) e `VENDA` (PDV, futuro)
 * sao do sistema e nunca sao aceitos num ajuste manual.
 */
export type MotivoMovimento =
  | 'COMPRA'
  | 'DEVOLUCAO_CLIENTE'
  | 'OUTRO'
  | 'PERDA_AVARIA'
  | 'VENCIDO'
  | 'USO_INTERNO'
  | 'DEVOLUCAO_FORNECEDOR'
  | 'CONTAGEM'
  | 'ESTOQUE_INICIAL'
  | 'VENDA'

/** De onde veio o movimento. */
export type OrigemMovimento = 'AJUSTE_MANUAL' | 'CADASTRO' | 'VENDA'

/**
 * Situacao do saldo calculada pelo backend (so com o controle ligado):
 * SEM_ESTOQUE com saldo <= 0; BAIXO com saldo <= ponto de reposicao (ou <=
 * estoque minimo, sem ponto); NORMAL nos demais casos.
 */
export type SituacaoEstoque = 'NORMAL' | 'BAIXO' | 'SEM_ESTOQUE'

/** Movimento gravado (resposta do ajuste e item da lista de movimentos). */
export interface MovimentoEstoque {
  /** UUID publico do movimento. */
  id: string
  tipo: TipoMovimento
  motivo: MotivoMovimento
  origem: OrigemMovimento
  /** Variacao com sinal: positiva na entrada, negativa na saida. */
  quantidade: number
  saldoAnterior: number
  saldoNovo: number
  observacao: string | null
  usuarioNome: string
  /** Momento da gravacao (yyyy-mm-ddThh:mm:ss, horario do servidor). */
  criadoEm: string
  /** Retrato da embalagem do ajuste informado em embalagens; null quando foi na unidade de venda. */
  embalagem: RetratoEmbalagemMovimento | null
}

/** Embalagem como estava no ajuste (o movimento e imutavel e sobrevive a remocao dela). */
export interface RetratoEmbalagemMovimento {
  /** "CX c/ 18 UN" */
  rotulo: string
  /** Unidades de venda por embalagem (18). */
  quantidadePorEmbalagem: number
  /** Quantas embalagens entraram ou sairam (2). */
  quantidadeDeEmbalagens: number
}

/** Corpo do ajuste manual de estoque. */
export interface AjusteEstoqueRequest {
  tipo: TipoMovimento
  /** Quantidade > 0 na entrada e na saida; no ajuste, o saldo contado (>= 0). */
  quantidade: number
  motivo: MotivoMovimento
  /** Obrigatoria quando o motivo e `OUTRO` (ate 200 caracteres). */
  observacao: string | null
  /** UUID gerado ao abrir o modal: a mesma chave nunca grava dois movimentos. */
  chave: string
  /**
   * UUID da embalagem, so em entrada e saida: a `quantidade` passa a ser o
   * numero (inteiro) de embalagens. Ausente = quantidade na unidade de venda.
   */
  embalagemId?: string
}
