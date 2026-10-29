/**
 * Tipos do modulo Caixa (spec `docs/modules/caixa.md`). Os ids sao os
 * UUIDs publicos; os horarios chegam em ISO-8601 com deslocamento
 * (`2026-10-24T08:02:00-03:00`) e os valores em reais (numero com 2 casas).
 */

/** `ABERTA` -> `EM_CONFERENCIA` -> `FECHADA`, ou `ABERTA` -> `FECHADA` direto. */
export type StatusDaSessao = 'ABERTA' | 'EM_CONFERENCIA' | 'FECHADA'

export const STATUS_DA_SESSAO = ['ABERTA', 'EM_CONFERENCIA', 'FECHADA'] as const satisfies readonly StatusDaSessao[]

/**
 * Formas de pagamento (spec `docs/modules/pdv.md`). Abertura,
 * suprimento e sangria sao sempre em dinheiro; recebimentos e estornos de
 * venda podem ser de qualquer forma.
 */
export type FormaDePagamento = 'DINHEIRO' | 'DEBITO' | 'CREDITO' | 'PIX'

export const FORMAS_DE_PAGAMENTO = ['DINHEIRO', 'DEBITO', 'CREDITO', 'PIX'] as const satisfies readonly FormaDePagamento[]

/**
 * Movimentos do caixa: a abertura e o fundo de troco; o sinal sai do tipo
 * (sangria, estorno e devolucao subtraem). `RECEBIMENTO` e `ESTORNO` vem das
 * vendas do PDV; `DEVOLUCAO` e o reembolso de uma devolucao de itens, no caixa
 * de quem devolveu (a venda pode ser de outro caixa).
 */
export type TipoDeMovimentoDeCaixa = 'ABERTURA' | 'SUPRIMENTO' | 'SANGRIA' | 'RECEBIMENTO' | 'ESTORNO' | 'DEVOLUCAO'

/** Os lancamentos que a tela registra no meio do dia. */
export type TipoDeLancamento = 'SUPRIMENTO' | 'SANGRIA'

/** Sessao aberta ou em conferencia num ponto; `null` no ponto livre. */
export interface SituacaoDoPonto {
  status: Exclude<StatusDaSessao, 'FECHADA'>
  sessaoId: string
  abertaPorNome: string
  abertaEm: string
}

/** Item da lista de pontos de caixa. */
export interface PontoDeCaixa {
  id: string
  nome: string
  ativo: boolean
  /** Fundo de troco da abertura anterior do ponto (sugestao); null sem abertura anterior. */
  ultimoFundoTroco: number | null
  situacao: SituacaoDoPonto | null
}

export interface PontoDeCaixaRequest {
  nome: string
}

export interface AbrirCaixaRequest {
  pontoId: string
  fundoTroco: number
  /** Chave de idempotencia gerada ao abrir a janela. */
  chave: string
}

export interface MovimentoDeCaixaRequest {
  tipo: TipoDeLancamento
  valor: number
  motivo: string
  chave: string
}

/**
 * Contagem por forma (spec do PDV): o dinheiro sempre; debito, credito e
 * PIX so quando a forma teve movimento na sessao (`formasDaContagem`).
 */
export interface ContagemRequest {
  contagens: Partial<Record<FormaDePagamento, number>>
  /** So no modo nao cego (no cego o backend recusa a justificativa junto com a contagem). */
  justificativa: string | null
}

export interface FechamentoRequest {
  justificativa: string
}

export interface MovimentoDeCaixa {
  id: string
  tipo: TipoDeMovimentoDeCaixa
  /** Sempre `DINHEIRO` na abertura, no suprimento e na sangria. */
  forma: FormaDePagamento
  /** Numero da venda do recebimento ou do estorno; null nos demais tipos. */
  vendaNumero: number | null
  /**
   * Sempre positivo. Null para o OPERADOR no modo cego, com a sessao aberta,
   * nos lancamentos feitos por outra pessoa e nos recebimentos e estornos de
   * venda (o valor aparece no fechamento).
   */
  valor: number | null
  /** Nulo na abertura. */
  motivo: string | null
  usuarioNome: string
  criadoEm: string
}

/** Esperado, contado e diferenca de uma forma de pagamento na sessao. */
export interface ValoresPorForma {
  forma: FormaDePagamento
  /** Null para o OPERADOR no modo cego enquanto a sessao esta ABERTA. */
  esperado: number | null
  /** Null antes da contagem. */
  contado: number | null
  /** Contado - esperado; null antes da contagem. */
  diferenca: number | null
}

/** A sessao como sai no historico (sem os movimentos). */
export interface SessaoDeCaixaResumo {
  id: string
  ponto: { id: string; nome: string }
  status: StatusDaSessao
  abertaPorNome: string
  abertaEm: string
  fundoTroco: number
  /** O esperado atual; null para o OPERADOR no modo cego enquanto a sessao esta ABERTA. */
  dinheiroNaGaveta: number | null
  /** Com a sessao ABERTA, o modo atual da empresa; depois da contagem, o modo gravado. */
  fechamentoCego: boolean
  valorEsperado: number | null
  valorContado: number | null
  /** Contado - esperado: positiva e sobra, negativa e falta. */
  diferenca: number | null
  contadaPorNome: string | null
  contadaEm: string | null
  justificativa: string | null
  fechadaPorNome: string | null
  fechadaEm: string | null
  /** Se o usuario pode lancar, contar e fechar (dono ou ADMIN, sessao nao fechada). */
  podeOperar: boolean
  /** Os valores de cada forma contada (o dinheiro primeiro). */
  porForma: ValoresPorForma[]
  /** As formas que a contagem pede: o dinheiro sempre e as que tiveram movimento. */
  formasDaContagem: FormaDePagamento[]
}

/** Resposta de todas as rotas de uma sessao: com os movimentos, do mais recente para o mais antigo. */
export interface SessaoDeCaixa extends SessaoDeCaixaResumo {
  movimentos: MovimentoDeCaixa[]
}

export interface ConfiguracaoDoCaixa {
  fechamentoCego: boolean
  /** Null enquanto a empresa usa o padrao (nunca alterado). */
  atualizadoPorNome: string | null
  atualizadoEm: string | null
}

export interface ConfiguracaoDoCaixaRequest {
  fechamentoCego: boolean
}

/** Filtros do historico (na URL). Texto vazio = sem o filtro; `pagina` comeca em 1. */
export interface FiltrosDoHistoricoDeCaixa {
  pontoId: string
  status: StatusDaSessao | ''
  /** Datas `AAAA-MM-DD` (dia em America/Sao_Paulo). */
  de: string
  ate: string
  pagina: number
}
