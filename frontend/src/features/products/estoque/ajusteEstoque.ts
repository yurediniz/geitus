/**
 * Regras do ajuste de estoque na tela (spec 4.2 e 4.3), sem React: motivos
 * por tipo, previa do saldo, validacao do modal e o texto de uma linha do
 * historico. O backend aplica as mesmas regras; aqui elas evitam o envio.
 */
import { formatarQuantidade } from '@/features/products/formatacaoProduto'
import { MENSAGEM_QUANTIDADE, validarQuantidade } from '@/lib/quantidade'
import type { MotivoMovimento, MovimentoEstoque, TipoMovimento } from '@/types/estoque'

/** Tipos na ordem do modal. */
export const TIPOS_MOVIMENTO: readonly TipoMovimento[] = ['ENTRADA', 'SAIDA', 'AJUSTE']

/** Rotulo do tipo no modal. */
export const ROTULO_TIPO: Readonly<Record<TipoMovimento, string>> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Contar e ajustar para',
}

/** Rotulo do tipo na linha do historico (o do modal e uma instrucao, nao um nome). */
const ROTULO_TIPO_HISTORICO: Readonly<Record<TipoMovimento, string>> = {
  ENTRADA: 'Entrada',
  SAIDA: 'Saída',
  AJUSTE: 'Ajuste',
}

export const ROTULO_MOTIVO: Readonly<Record<MotivoMovimento, string>> = {
  COMPRA: 'Compra/recebimento',
  DEVOLUCAO_CLIENTE: 'Devolução de cliente',
  OUTRO: 'Outro',
  PERDA_AVARIA: 'Perda/avaria',
  VENCIDO: 'Vencido',
  USO_INTERNO: 'Uso interno',
  DEVOLUCAO_FORNECEDOR: 'Devolução ao fornecedor',
  CONTAGEM: 'Contagem/inventário',
  ESTOQUE_INICIAL: 'Estoque inicial',
  VENDA: 'Venda',
}

/** Motivos manuais de cada tipo, na ordem da spec (os do sistema ficam de fora). */
const MOTIVOS_POR_TIPO: Readonly<Record<TipoMovimento, readonly MotivoMovimento[]>> = {
  ENTRADA: ['COMPRA', 'DEVOLUCAO_CLIENTE', 'OUTRO'],
  SAIDA: ['PERDA_AVARIA', 'VENCIDO', 'USO_INTERNO', 'DEVOLUCAO_FORNECEDOR', 'OUTRO'],
  AJUSTE: ['CONTAGEM', 'OUTRO'],
}

export function motivosDoTipo(tipo: TipoMovimento): MotivoMovimento[] {
  return [...MOTIVOS_POR_TIPO[tipo]]
}

/** Motivo ja escolhido ao trocar para o tipo (so a contagem vem marcada, spec 6.2). */
export function motivoPadrao(tipo: TipoMovimento): MotivoMovimento | '' {
  return tipo === 'AJUSTE' ? 'CONTAGEM' : ''
}

/** Quantidade em milesimos (NUMERIC(12,3)): a conta e feita em inteiros, sem erro de ponto flutuante. */
function emMilesimos(valor: number): number {
  return Math.round(valor * 1000)
}

export interface PreviaSaldo {
  /** Saldo depois do movimento; null quando o movimento nao pode ser feito. */
  saldoNovo: number | null
  erro: string | null
}

/**
 * Saldo depois do movimento: entrada soma, saida subtrai e o ajuste vai para o
 * saldo contado. Erros: "Saldo insuficiente: há 3 UN." (nenhum ajuste deixa o
 * saldo negativo) e "O saldo já é 12 UN." (ajuste sem mudanca).
 */
export function calcularPrevia(tipo: TipoMovimento, quantidade: number, saldo: number, sigla: string): PreviaSaldo {
  const atual = emMilesimos(saldo)
  const informado = emMilesimos(quantidade)
  if (tipo === 'SAIDA' && informado > atual) {
    return { saldoNovo: null, erro: `Saldo insuficiente: há ${formatarQuantidade(saldo, sigla)}.` }
  }
  if (tipo === 'AJUSTE' && informado === atual) {
    return { saldoNovo: null, erro: `O saldo já é ${formatarQuantidade(saldo, sigla)}.` }
  }
  const novo = tipo === 'ENTRADA' ? atual + informado : tipo === 'SAIDA' ? atual - informado : informado
  return { saldoNovo: novo / 1000, erro: null }
}

/** O que o usuario preencheu no modal (textos como digitados). */
export interface DadosAjuste {
  tipo: TipoMovimento
  quantidade: string
  motivo: MotivoMovimento | ''
  observacao: string
}

/** O que o modal sabe do produto. */
export interface ContextoAjuste {
  saldo: number
  sigla: string
  /** Se a unidade de venda aceita fracao. */
  fracionada: boolean
}

export type CampoAjuste = 'tipo' | 'quantidade' | 'motivo' | 'observacao'

export interface ResultadoValidacaoAjuste {
  /** Quantidade lida (com virgula ou ponto); null se o campo tem erro de formato. */
  quantidade: number | null
  erros: Partial<Record<CampoAjuste, string>>
}

/** Primeiro problema da quantidade (formato, sinal, fracao e saldo), na ordem em que o usuario corrige. */
function erroDaQuantidade(dados: DadosAjuste, contexto: ContextoAjuste): { valor: number | null; erro: string | null } {
  const contagem = dados.tipo === 'AJUSTE'
  const resultado = validarQuantidade(dados.quantidade)
  if ('erro' in resultado) {
    if (resultado.erro === 'vazio') {
      return { valor: null, erro: contagem ? 'Informe o saldo contado.' : 'Informe a quantidade.' }
    }
    if (resultado.erro === 'negativo') {
      return {
        valor: null,
        erro: contagem ? 'O saldo contado não pode ser negativo.' : 'Informe uma quantidade maior que zero.',
      }
    }
    return { valor: null, erro: MENSAGEM_QUANTIDADE[resultado.erro] }
  }
  const valor = resultado.valor
  if (!contagem && valor === 0) {
    return { valor, erro: 'Informe uma quantidade maior que zero.' }
  }
  if (!contexto.fracionada && !Number.isInteger(valor)) {
    return { valor, erro: `A unidade ${contexto.sigla} não aceita quantidade fracionada.` }
  }
  return { valor, erro: calcularPrevia(dados.tipo, valor, contexto.saldo, contexto.sigla).erro }
}

/**
 * Validacao do modal antes do envio: quantidade (formato, > 0 na entrada e na
 * saida, fracao pela unidade, saldo insuficiente e ajuste sem mudanca), motivo
 * do tipo e observacao obrigatoria em "Outro".
 */
export function validarAjuste(dados: DadosAjuste, contexto: ContextoAjuste): ResultadoValidacaoAjuste {
  const erros: Partial<Record<CampoAjuste, string>> = {}
  const { valor, erro } = erroDaQuantidade(dados, contexto)
  if (erro) {
    erros.quantidade = erro
  }
  if (dados.motivo === '' || !MOTIVOS_POR_TIPO[dados.tipo].includes(dados.motivo)) {
    erros.motivo = 'Selecione o motivo.'
  } else if (dados.motivo === 'OUTRO' && dados.observacao.trim() === '') {
    erros.observacao = 'Descreva o motivo.'
  }
  return { quantidade: valor, erros }
}

/** Erro da quantidade que ja aparece ao digitar (saldo insuficiente e mesmo saldo), antes do envio. */
export function erroDaPrevia(dados: DadosAjuste, contexto: ContextoAjuste): string | null {
  const resultado = validarQuantidade(dados.quantidade)
  return 'valor' in resultado
    ? calcularPrevia(dados.tipo, resultado.valor, contexto.saldo, contexto.sigla).erro
    : null
}

/** Numero pt-BR sem a sigla ("2,5"), como nos saldos da linha do historico. */
function numero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

export interface TextoMovimento {
  /** "Saída · Perda/avaria" */
  titulo: string
  /** Variacao com sinal e sigla: "−2 UN" ou "+5 UN" (o menos e o sinal tipografico). */
  quantidade: string
  /** "12 → 10" */
  saldos: string
  /** Os saldos para o leitor de tela, no lugar da seta: "saldo de 12 para 10". */
  saldosFalados: string
}

/** Textos de uma linha de movimento no historico. */
export function textoMovimento(movimento: MovimentoEstoque, sigla: string): TextoMovimento {
  const sinal = movimento.quantidade < 0 ? '−' : '+'
  return {
    titulo: `${ROTULO_TIPO_HISTORICO[movimento.tipo]} · ${ROTULO_MOTIVO[movimento.motivo]}`,
    quantidade: `${sinal}${formatarQuantidade(Math.abs(movimento.quantidade), sigla)}`,
    saldos: `${numero(movimento.saldoAnterior)} → ${numero(movimento.saldoNovo)}`,
    saldosFalados: `saldo de ${numero(movimento.saldoAnterior)} para ${numero(movimento.saldoNovo)}`,
  }
}
