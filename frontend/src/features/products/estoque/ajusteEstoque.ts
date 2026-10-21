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
  AJUSTE: 'Contagem',
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

/** Motivo ja escolhido ao trocar para o tipo: Compra na entrada e Contagem na contagem; a saida abre sem motivo (spec 6.2). */
export function motivoPadrao(tipo: TipoMovimento): MotivoMovimento | '' {
  if (tipo === 'ENTRADA') {
    return 'COMPRA'
  }
  return tipo === 'AJUSTE' ? 'CONTAGEM' : ''
}

/** Quantidade em milesimos (NUMERIC(12,3)): a conta e feita em inteiros, sem erro de ponto flutuante. */
function emMilesimos(valor: number): number {
  return Math.round(valor * 1000)
}

/** Variacao com sinal e sigla: "−2 UN" ou "+5 UN" (o menos e o sinal tipografico). */
export function formatarVariacaoQuantidade(variacao: number, sigla: string): string {
  return `${variacao < 0 ? '−' : '+'}${formatarQuantidade(Math.abs(variacao), sigla)}`
}

export interface PreviaSaldo {
  /** Saldo depois do movimento; null quando nao ha movimento a fazer. */
  saldoNovo: number | null
  /** Saldo novo menos o atual; null junto com `saldoNovo`. */
  variacao: number | null
  /** Movimento impossivel (saldo insuficiente). */
  erro: string | null
  /** Contagem igual ao saldo: nada a ajustar (tom neutro, nao e erro). */
  confere: string | null
}

/**
 * Saldo depois do movimento: entrada soma, saida subtrai e a contagem vai
 * para o saldo contado. Uma saida maior que o saldo e erro ("Saldo
 * insuficiente: há 3 UN."; nenhum ajuste deixa o saldo negativo); uma
 * contagem igual ao saldo so confere.
 */
export function calcularPrevia(tipo: TipoMovimento, quantidade: number, saldo: number, sigla: string): PreviaSaldo {
  const vazia = { saldoNovo: null, variacao: null, erro: null, confere: null }
  const atual = emMilesimos(saldo)
  const informado = emMilesimos(quantidade)
  if (tipo === 'SAIDA' && informado > atual) {
    return { ...vazia, erro: `Saldo insuficiente: há ${formatarQuantidade(saldo, sigla)}.` }
  }
  if (tipo === 'AJUSTE' && informado === atual) {
    return {
      ...vazia,
      confere: `A contagem confere com o saldo (${formatarQuantidade(saldo, sigla)}). Não há nada a ajustar.`,
    }
  }
  const novo = tipo === 'ENTRADA' ? atual + informado : tipo === 'SAIDA' ? atual - informado : informado
  return { saldoNovo: novo / 1000, variacao: (novo - atual) / 1000, erro: null, confere: null }
}

/** "Saldo: 12 UN → 10 UN"; na contagem, com a diferenca: "Saldo: 12 UN → 10 UN (−2 UN)". Null sem movimento. */
export function textoDaPrevia(tipo: TipoMovimento, saldo: number, previa: PreviaSaldo, sigla: string): string | null {
  if (previa.saldoNovo === null || previa.variacao === null) {
    return null
  }
  const texto = `Saldo: ${formatarQuantidade(saldo, sigla)} → ${formatarQuantidade(previa.saldoNovo, sigla)}`
  return tipo === 'AJUSTE' ? `${texto} (${formatarVariacaoQuantidade(previa.variacao, sigla)})` : texto
}

/**
 * Rotulo do botao de confirmar, com a acao: "Registrar entrada", "Registrar
 * saída", "Ajustar para 10 UN", "Zerar estoque" ou, com a contagem conferindo,
 * "Fechar" (nao ha o que gravar).
 */
export function rotuloConfirmar(tipo: TipoMovimento, previa: PreviaSaldo | null, sigla: string): string {
  if (tipo === 'ENTRADA') {
    return 'Registrar entrada'
  }
  if (tipo === 'SAIDA') {
    return 'Registrar saída'
  }
  if (previa?.confere) {
    return 'Fechar'
  }
  if (previa?.saldoNovo === null || previa?.saldoNovo === undefined) {
    return 'Registrar contagem'
  }
  return previa.saldoNovo === 0 ? 'Zerar estoque' : `Ajustar para ${formatarQuantidade(previa.saldoNovo, sigla)}`
}

/** Mensagem da tela depois do ajuste gravado. */
export function mensagemDeSucesso(movimento: MovimentoEstoque, sigla: string): string {
  const saldoNovo = formatarQuantidade(movimento.saldoNovo, sigla)
  const variacao = formatarVariacaoQuantidade(movimento.quantidade, sigla)
  const quantidade = formatarQuantidade(Math.abs(movimento.quantidade), sigla)
  if (movimento.tipo === 'ENTRADA') {
    return `Entrada de ${quantidade} registrada. Saldo: ${saldoNovo}.`
  }
  if (movimento.tipo === 'SAIDA') {
    return `Saída de ${quantidade} registrada. Saldo: ${saldoNovo}.`
  }
  return movimento.saldoNovo === 0 ? `Estoque zerado (${variacao}).` : `Estoque ajustado para ${saldoNovo} (${variacao}).`
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
  /** Contagem igual ao saldo: nao ha o que gravar (o modal so fecha). */
  confere: boolean
}

/** Primeiro problema da quantidade (formato, sinal, fracao e saldo), na ordem em que o usuario corrige. */
function erroDaQuantidade(
  dados: DadosAjuste,
  contexto: ContextoAjuste,
): { valor: number | null; erro: string | null; confere: boolean } {
  const contagem = dados.tipo === 'AJUSTE'
  const resultado = validarQuantidade(dados.quantidade)
  if ('erro' in resultado) {
    if (resultado.erro === 'vazio') {
      return { valor: null, erro: contagem ? 'Informe o saldo contado.' : 'Informe a quantidade.', confere: false }
    }
    if (resultado.erro === 'negativo') {
      const erro = contagem ? 'O saldo contado não pode ser negativo.' : 'Informe uma quantidade maior que zero.'
      return { valor: null, erro, confere: false }
    }
    return { valor: null, erro: MENSAGEM_QUANTIDADE[resultado.erro], confere: false }
  }
  const valor = resultado.valor
  if (!contagem && valor === 0) {
    return { valor, erro: 'Informe uma quantidade maior que zero.', confere: false }
  }
  if (!contexto.fracionada && !Number.isInteger(valor)) {
    return { valor, erro: `A unidade ${contexto.sigla} não aceita quantidade fracionada.`, confere: false }
  }
  const previa = calcularPrevia(dados.tipo, valor, contexto.saldo, contexto.sigla)
  return { valor, erro: previa.erro, confere: previa.confere !== null }
}

/**
 * Validacao do modal antes do envio: quantidade (formato, > 0 na entrada e na
 * saida, fracao pela unidade e saldo insuficiente), motivo do tipo e
 * observacao obrigatoria em "Outro". A contagem igual ao saldo nao e erro: vem
 * em `confere`.
 */
export function validarAjuste(dados: DadosAjuste, contexto: ContextoAjuste): ResultadoValidacaoAjuste {
  const erros: Partial<Record<CampoAjuste, string>> = {}
  const { valor, erro, confere } = erroDaQuantidade(dados, contexto)
  if (erro) {
    erros.quantidade = erro
  }
  if (dados.motivo === '' || !MOTIVOS_POR_TIPO[dados.tipo].includes(dados.motivo)) {
    erros.motivo = 'Selecione o motivo.'
  } else if (dados.motivo === 'OUTRO' && dados.observacao.trim() === '') {
    erros.observacao = 'Descreva o motivo.'
  }
  return { quantidade: valor, erros, confere }
}

/** Numero pt-BR sem a sigla ("2,5"), como nos saldos da linha do historico. */
function numero(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

export interface TextoMovimento {
  /** "Saída · Perda/avaria" */
  titulo: string
  /** Variacao com sinal e sigla: "−2 UN" ou "+5 UN". */
  quantidade: string
  /** "12 → 10" */
  saldos: string
  /** Os saldos para o leitor de tela, no lugar da seta: "saldo de 12 para 10". */
  saldosFalados: string
}

/** Textos de uma linha de movimento no historico. */
export function textoMovimento(movimento: MovimentoEstoque, sigla: string): TextoMovimento {
  return {
    titulo: `${ROTULO_TIPO_HISTORICO[movimento.tipo]} · ${ROTULO_MOTIVO[movimento.motivo]}`,
    quantidade: formatarVariacaoQuantidade(movimento.quantidade, sigla),
    saldos: `${numero(movimento.saldoAnterior)} → ${numero(movimento.saldoNovo)}`,
    saldosFalados: `saldo de ${numero(movimento.saldoAnterior)} para ${numero(movimento.saldoNovo)}`,
  }
}
