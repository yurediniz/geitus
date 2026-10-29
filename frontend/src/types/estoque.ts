/**
 * Tipos do estoque do produto (Fase D). Refletem o contrato da API em
 * /api/produtos/{id}/estoque. O saldo so muda por movimentacoes imutaveis;
 * a empresa e o usuario do movimento vem sempre do usuario autenticado.
 */

/** Entrada soma, saida subtrai; ajuste leva o saldo a um valor contado. */
export type TipoMovimento = 'ENTRADA' | 'SAIDA' | 'AJUSTE'

/**
 * Motivo do movimento. `ESTOQUE_INICIAL` (cadastro), `VENDA` e
 * `CANCELAMENTO_VENDA` (PDV) sao do sistema e nunca sao aceitos num ajuste manual.
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
  | 'CANCELAMENTO_VENDA'

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
  /**
   * Custo digitado na entrada por compra (Fase B4): o de 1 unidade de venda ou,
   * com embalagem, o de 1 embalagem. Null nos demais movimentos (e nas compras
   * gravadas antes da Fase B4).
   */
  custoInformado: number | null
  /** Custo por unidade de venda, com 4 casas (informado / unidades da embalagem); null junto com `custoInformado`. */
  custoUnitario: number | null
  /** Fornecedor da entrada por compra (Fase B5); null nos demais movimentos ou sem fornecedor. */
  fornecedor?: { id: string; nome: string } | null
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
  /**
   * Custo da compra (Fase B4): obrigatorio e > 0 so na ENTRADA com motivo
   * COMPRA, e ausente nos demais. Com `embalagemId`, e o custo de 1 embalagem
   * (o backend divide pela quantidade dela).
   */
  custo?: number
  /**
   * Fornecedor da compra (Fase B5): opcional, so na ENTRADA com motivo COMPRA.
   * Com ele, o fornecedor entra na lista do produto e vira o da ultima compra.
   */
  fornecedorId?: string
}

/** Filtro de situacao da posicao de estoque: `baixo` inclui os sem estoque e `negativo` esta contido em `sem`. */
export const SITUACOES_POSICAO = ['sem', 'baixo', 'negativo'] as const
export type SituacaoDaPosicao = (typeof SITUACOES_POSICAO)[number]

/** Ordens da posicao de estoque (com `-` = decrescente); sem valor fica sempre no fim. */
export const ORDENS_POSICAO = ['nome', '-nome', 'saldo', '-saldo', 'valor', '-valor'] as const
export type OrdemDaPosicao = (typeof ORDENS_POSICAO)[number]

/** Status da posicao (os mesmos da listagem de produtos). */
export const STATUS_POSICAO = ['ativos', 'inativos', 'todos'] as const
export type StatusDaPosicao = (typeof STATUS_POSICAO)[number]

/** Estado da posicao guardado na URL (pagina a partir de 1). */
export interface FiltrosDaPosicao {
  busca: string
  status: StatusDaPosicao
  categoria: string | null
  situacao: SituacaoDaPosicao | null
  ordem: OrdemDaPosicao
  pagina: number
}

/** Linha de `GET /api/estoque/posicao` (spec de Estoque, regra 22): so produtos que controlam estoque. */
export interface PosicaoDeEstoque {
  /** UUID publico do produto. */
  id: string
  numero: number
  codigo: number | null
  nome: string
  unidade: { sigla: string; fracionada: boolean }
  categoria: { caminho: string } | null
  ativo: boolean
  /** Saldo atual (pode ser negativo pela venda com "Vender sem estoque"). */
  saldo: number
  situacao: SituacaoEstoque
  estoqueMinimo: number | null
  pontoReposicao: number | null
  estoqueMaximo: number | null
  custo: number | null
  /** Saldo x custo; null sem custo ou com saldo <= 0. */
  valorEmCusto: number | null
  /** A de compra ou a primeira, para a conversao "55 UN (18 CX + 1 UN)"; null sem embalagem. */
  embalagemPrincipal: { sigla: string; quantidade: number } | null
}

/** `GET /api/estoque/posicao/resumo` (regra 24): busca, categoria e status, sem a situacao. */
export interface ResumoDaPosicao {
  produtos: number
  semEstoque: number
  baixo: number
  negativos: number
  valorTotalEmCusto: number
  /** Com saldo > 0 e sem custo: ficam fora do valor total. */
  semCusto: number
}

/** Estado da aba Movimentacoes guardado na URL: periodo em datas inclusivas (AAAA-MM-DD). */
export interface FiltrosDasMovimentacoes {
  de: string
  ate: string
  tipo: TipoMovimento | null
  motivo: MotivoMovimento | null
  /** Id do usuario que registrou (o mesmo de `/api/usuarios`); o filtro so aparece para o ADMIN. */
  usuario: number | null
}

/** Linha de `GET /api/estoque/movimentos` (spec de Estoque, regras 26 e 27): o movimento com o produto e a venda. */
export interface MovimentacaoDeEstoque extends MovimentoEstoque {
  produto: {
    /** UUID publico do produto. */
    id: string
    numero: number
    nome: string
    /** Unidade de venda: as quantidades do movimento estao nela. */
    unidade: { sigla: string; fracionada: boolean }
  }
  /** Venda da baixa ou do cancelamento; null nos demais movimentos. */
  venda: { id: string; numero: number } | null
}
