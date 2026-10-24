/**
 * Tipos do modulo Caixa (spec `docs/modules/caixa.md` §5.3). Os ids sao os
 * UUIDs publicos; os horarios chegam em ISO-8601 com deslocamento
 * (`2026-10-24T08:02:00-03:00`) e os valores em reais (numero com 2 casas).
 */

/** `ABERTA` -> `EM_CONFERENCIA` -> `FECHADA`, ou `ABERTA` -> `FECHADA` direto. */
export type StatusDaSessao = 'ABERTA' | 'EM_CONFERENCIA' | 'FECHADA'

export const STATUS_DA_SESSAO = ['ABERTA', 'EM_CONFERENCIA', 'FECHADA'] as const satisfies readonly StatusDaSessao[]

/** Movimentos da gaveta: a abertura e o fundo de troco; o sinal sai do tipo (sangria subtrai). */
export type TipoDeMovimentoDeCaixa = 'ABERTURA' | 'SUPRIMENTO' | 'SANGRIA'

/** Os lancamentos que a tela registra no meio do dia. */
export type TipoDeLancamento = Exclude<TipoDeMovimentoDeCaixa, 'ABERTURA'>

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

export interface ContagemRequest {
  valorContado: number
  /** So no modo nao cego (no cego o backend recusa a justificativa junto com a contagem). */
  justificativa: string | null
}

export interface FechamentoRequest {
  justificativa: string
}

export interface MovimentoDeCaixa {
  id: string
  tipo: TipoDeMovimentoDeCaixa
  /** Sempre positivo. */
  valor: number
  /** Nulo na abertura. */
  motivo: string | null
  usuarioNome: string
  criadoEm: string
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
