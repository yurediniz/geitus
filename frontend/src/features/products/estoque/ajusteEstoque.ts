/**
 * Regras do ajuste de estoque na tela (spec de Estoque), sem React: motivos
 * por tipo, previa do saldo, validacao do modal e o texto de uma linha do
 * historico. O backend aplica as mesmas regras; aqui elas evitam o envio.
 */
import { formatarMoeda, formatarQuantidade } from '@/features/products/formatacaoProduto'
import { textoEmEmbalagens } from '@/lib/embalagem'
import { digitosParaValor, valorParaDigitos } from '@/lib/moeda'
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
  CANCELAMENTO_VENDA: 'Cancelamento de venda',
  DEVOLUCAO_VENDA: 'Devolução de venda',
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

/** Motivo ja escolhido ao trocar para o tipo: Compra na entrada e Contagem na contagem; a saida abre sem motivo (spec de Estoque). */
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

/** Quantas embalagens e qual, para a previa do ajuste informado em embalagens. */
export interface QuantidadeEmEmbalagem {
  quantidade: number
  rotulo: string
}

/**
 * "Saldo: 12 UN → 10 UN"; na contagem, com a diferenca: "Saldo: 12 UN → 10 UN
 * (−2 UN)"; em embalagens (spec de Produtos): "2 CX c/ 18 UN = +36 UN · saldo 10 → 46".
 * Null sem movimento.
 */
export function textoDaPrevia(
  tipo: TipoMovimento,
  saldo: number,
  previa: PreviaSaldo,
  sigla: string,
  emEmbalagem?: QuantidadeEmEmbalagem,
): string | null {
  if (previa.saldoNovo === null || previa.variacao === null) {
    return null
  }
  const texto = `Saldo: ${formatarQuantidade(saldo, sigla)} → ${formatarQuantidade(previa.saldoNovo, sigla)}`
  if (emEmbalagem) {
    const variacao = formatarVariacaoQuantidade(previa.variacao, sigla)
    return `${textoEmEmbalagens(emEmbalagem.quantidade, emEmbalagem.rotulo)} = ${variacao} · ${texto}`
  }
  return tipo === 'AJUSTE' ? `${texto} (${formatarVariacaoQuantidade(previa.variacao, sigla)})` : texto
}

/**
 * Rotulo do botao de confirmar, com a acao: "Registrar entrada", "Registrar
 * saída", "Ajustar para 10 UN", "Zerar estoque" ou, com a contagem conferindo,
 * "Fechar" (nao ha o que gravar). Informado em embalagens, a entrada e a saida
 * dizem o total em unidades (`totalEmEmbalagens`): "Registrar entrada de 36 UN".
 */
export function rotuloConfirmar(
  tipo: TipoMovimento,
  previa: PreviaSaldo | null,
  sigla: string,
  totalEmEmbalagens?: number,
): string {
  const total = totalEmEmbalagens === undefined ? '' : ` de ${formatarQuantidade(totalEmEmbalagens, sigla)}`
  if (tipo === 'ENTRADA') {
    return `Registrar entrada${total}`
  }
  if (tipo === 'SAIDA') {
    return `Registrar saída${total}`
  }
  if (previa?.confere) {
    return 'Fechar'
  }
  if (previa?.saldoNovo === null || previa?.saldoNovo === undefined) {
    return 'Registrar contagem'
  }
  return previa.saldoNovo === 0 ? 'Zerar estoque' : `Ajustar para ${formatarQuantidade(previa.saldoNovo, sigla)}`
}

/**
 * Mensagem da tela depois do ajuste gravado. Na entrada por compra, com o
 * custo do produto antes do ajuste (`custoAnterior`), avisa o custo novo
 * quando ele mudou: "... Custo atualizado para R$ 10,00." (spec de Estoque).
 */
export function mensagemDeSucesso(movimento: MovimentoEstoque, sigla: string, custoAnterior?: number | null): string {
  const saldoNovo = formatarQuantidade(movimento.saldoNovo, sigla)
  const variacao = formatarVariacaoQuantidade(movimento.quantidade, sigla)
  const quantidade = `${formatarQuantidade(Math.abs(movimento.quantidade), sigla)}${textoDoRetrato(movimento)}`
  if (movimento.tipo === 'ENTRADA') {
    const custoNovo = movimento.custoUnitario === null ? null : centavosDoCustoUnitario(movimento.custoUnitario)
    const custoMudou =
      custoNovo !== null && custoAnterior !== undefined && (custoAnterior === null || centavosDe(custoAnterior) !== custoNovo)
    const aviso = custoMudou ? ` Custo atualizado para ${formatarMoeda(Number(custoNovo) / 100)}.` : ''
    return `Entrada de ${quantidade} registrada. Saldo: ${saldoNovo}.${aviso}`
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
  /** UUID da embalagem em que a quantidade foi informada; ''/ausente = na unidade de venda. */
  embalagemId?: string
  /**
   * Custo da compra no formato do campo de dinheiro ("180.00"), so na Entrada
   * com Compra: o de 1 unidade de venda ou, com embalagem, o de 1 embalagem.
   * ''/ausente = nao informado.
   */
  custo?: string
}

/** Embalagem gravada do produto, como o modal a oferece. */
export interface EmbalagemDoAjuste {
  id: string
  /** "CX c/ 18 UN" */
  rotulo: string
  /** Unidades de venda por embalagem. */
  quantidade: number
  deCompra: boolean
}

/** O que o modal sabe do produto. */
export interface ContextoAjuste {
  saldo: number
  sigla: string
  /** Se a unidade de venda aceita fracao. */
  fracionada: boolean
  /** Embalagens gravadas do produto (vazio = sem o seletor "Em"). */
  embalagens?: readonly EmbalagemDoAjuste[]
}

export type CampoAjuste = 'tipo' | 'quantidade' | 'embalagemId' | 'custo' | 'fornecedorId' | 'motivo' | 'observacao'

/**
 * Embalagem que o seletor "Em" traz ao trocar o tipo ou o motivo (spec de Produtos):
 * a de compra na Entrada com motivo Compra; senao, a unidade de venda ('').
 */
export function embalagemPadrao(
  tipo: TipoMovimento,
  motivo: MotivoMovimento | '',
  embalagens: readonly EmbalagemDoAjuste[],
): string {
  return tipo === 'ENTRADA' && motivo === 'COMPRA' ? (embalagens.find((embalagem) => embalagem.deCompra)?.id ?? '') : ''
}

/** A embalagem do ajuste: so na entrada e na saida (a contagem e sempre na unidade de venda). */
export function embalagemDoAjuste(dados: DadosAjuste, contexto: ContextoAjuste): EmbalagemDoAjuste | undefined {
  if (dados.tipo === 'AJUSTE' || !dados.embalagemId) {
    return undefined
  }
  return contexto.embalagens?.find((embalagem) => embalagem.id === dados.embalagemId)
}

/** Total em unidades de venda da quantidade digitada (x a embalagem, se houver); null se o texto nao e numero. */
export function quantidadeEmUnidades(dados: DadosAjuste, contexto: ContextoAjuste): number | null {
  const resultado = validarQuantidade(dados.quantidade)
  if (!('valor' in resultado)) {
    return null
  }
  const embalagem = embalagemDoAjuste(dados, contexto)
  // Em milesimos, como o NUMERIC(12,3) do backend.
  return embalagem ? Math.round(resultado.valor * embalagem.quantidade * 1000) / 1000 : resultado.valor
}

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
      const naEmbalagem = embalagemDoAjuste(dados, contexto) ? MENSAGEM_EMBALAGENS_INTEIRAS : null
      const erro = contagem ? 'O saldo contado não pode ser negativo.' : (naEmbalagem ?? 'Informe uma quantidade maior que zero.')
      return { valor: null, erro, confere: false }
    }
    return { valor: null, erro: MENSAGEM_QUANTIDADE[resultado.erro], confere: false }
  }
  const valor = resultado.valor
  const embalagem = embalagemDoAjuste(dados, contexto)
  if (embalagem && (valor <= 0 || !Number.isInteger(valor))) {
    return { valor, erro: MENSAGEM_EMBALAGENS_INTEIRAS, confere: false }
  }
  if (!contagem && valor === 0) {
    return { valor, erro: 'Informe uma quantidade maior que zero.', confere: false }
  }
  const total = quantidadeEmUnidades(dados, contexto) ?? valor
  if (!contexto.fracionada && !Number.isInteger(total)) {
    return { valor, erro: `A unidade ${contexto.sigla} não aceita quantidade fracionada.`, confere: false }
  }
  const previa = calcularPrevia(dados.tipo, total, contexto.saldo, contexto.sigla)
  return { valor, erro: previa.erro, confere: previa.confere !== null }
}

/** Quantidade em embalagens com fracao, zero ou negativa (a mensagem da API, spec de Produtos). */
export const MENSAGEM_EMBALAGENS_INTEIRAS = 'Informe um número inteiro de embalagens.'

/**
 * Validacao do modal antes do envio: quantidade (formato, > 0 na entrada e na
 * saida, fracao pela unidade e saldo insuficiente), o custo da entrada por
 * compra (obrigatorio e > 0), motivo do tipo e observacao obrigatoria em
 * "Outro". A contagem igual ao saldo nao e erro: vem em `confere`.
 */
export function validarAjuste(dados: DadosAjuste, contexto: ContextoAjuste): ResultadoValidacaoAjuste {
  const erros: Partial<Record<CampoAjuste, string>> = {}
  const { valor, erro, confere } = erroDaQuantidade(dados, contexto)
  if (erro) {
    erros.quantidade = erro
  }
  if (exigeCusto(dados.tipo, dados.motivo)) {
    const custo = dados.custo?.trim() ?? ''
    if (custo === '') {
      erros.custo = MENSAGEM_CUSTO_OBRIGATORIO
    } else if (!(Number(custo) > 0)) {
      erros.custo = MENSAGEM_CUSTO_POSITIVO
    } else {
      // Na embalagem, o custo por unidade (o que o produto recebe) tambem precisa passar de zero:
      // CX c/ 1000 a R$ 0,10 da R$ 0,0001, que vira R$ 0,00 no produto.
      const embalagem = embalagemDoAjuste(dados, contexto)
      if (embalagem && custoPorUnidade(custo, embalagem.quantidade) === '0.00') {
        erros.custo = MENSAGEM_CUSTO_POSITIVO
      }
    }
  }
  if (dados.motivo === '' || !MOTIVOS_POR_TIPO[dados.tipo].includes(dados.motivo)) {
    erros.motivo = 'Selecione o motivo.'
  } else if (dados.motivo === 'OUTRO' && dados.observacao.trim() === '') {
    erros.observacao = 'Descreva o motivo.'
  }
  return { quantidade: valor, erros, confere }
}

// --- Custo da entrada por compra (Fase B4, docs/modules/estoque.md) ---

export const MENSAGEM_CUSTO_OBRIGATORIO = 'Informe o custo da compra.'
export const MENSAGEM_CUSTO_POSITIVO = 'O custo deve ser maior que zero.'

/** So a Entrada com motivo Compra/recebimento exige (e aceita) o custo (spec de Estoque). */
export function exigeCusto(tipo: TipoMovimento, motivo: MotivoMovimento | ''): boolean {
  return tipo === 'ENTRADA' && motivo === 'COMPRA'
}

/** Divisao inteira com meio para cima (numerador e divisor > 0): (2a + b) / 2b. */
function dividirArredondando(numerador: bigint, divisor: bigint): bigint {
  return (2n * numerador + divisor) / (2n * divisor)
}

/** Centavos de um valor em reais (custo do produto, NUMERIC(12,2)). */
function centavosDe(valor: number): bigint {
  return BigInt(valorParaDigitos(valor.toFixed(2)) || '0')
}

/** Centavos do custo unitario do movimento (NUMERIC(14,4)), meio para cima: o custo que o produto recebe. */
function centavosDoCustoUnitario(valor: number): bigint {
  const [inteiros, decimais = ''] = valor.toFixed(4).split('.')
  return dividirArredondando(BigInt(`${inteiros}${decimais}`), 100n)
}

/**
 * Custo por unidade de venda de um custo digitado ("180.00" e 18 -> "10.00"),
 * a mesma conta do backend: na embalagem, informado / quantidade com 4 casas
 * (o do movimento) e depois a centavos (o do produto), as duas meio para cima
 * ("100.00" e 3 -> 33,3333 -> "33.33"). Sem embalagem, o proprio custo. Null
 * sem custo ou com custo zero.
 */
export function custoPorUnidade(custoInformado: string, quantidadePorEmbalagem: number | null): string | null {
  const centavos = BigInt(valorParaDigitos(custoInformado) || '0')
  if (centavos <= 0n) {
    return null
  }
  if (quantidadePorEmbalagem === null) {
    return digitosParaValor(centavos.toString())
  }
  // Quantidade em milesimos (NUMERIC(12,3)): custo / quantidade em decimos de milesimo = centavos x 100.000 / milesimos.
  const milesimos = BigInt(Math.round(quantidadePorEmbalagem * 1000))
  const quatroCasas = dividirArredondando(centavos * 100_000n, milesimos)
  return digitosParaValor(dividirArredondando(quatroCasas, 100n).toString())
}

/** Rotulo do campo: "Custo por UN" na unidade de venda; "Custo de 1 CX c/ 18 UN" na embalagem. */
export function rotuloDoCusto(sigla: string, embalagem?: { rotulo: string }): string {
  return embalagem ? `Custo de 1 ${embalagem.rotulo}` : `Custo por ${sigla}`
}

/**
 * "Último custo: R$ 9,50 por UN."; em embalagem, com o custo dela (custo x
 * quantidade, a centavos com meio para cima): "Último custo: R$ 9,50 por UN
 * (R$ 171,00 a CX c/ 18 UN).". Null sem custo no produto.
 */
export function dicaDoUltimoCusto(
  custoAtual: number | null,
  sigla: string,
  embalagem?: { rotulo: string; quantidade: number },
): string | null {
  if (custoAtual === null) {
    return null
  }
  const porUnidade = `${formatarMoeda(custoAtual)} por ${sigla}`
  if (!embalagem) {
    return `Último custo: ${porUnidade}.`
  }
  // Em milesimos (NUMERIC(12,3)): centavos x milesimos / 1000.
  const milesimos = BigInt(Math.round(embalagem.quantidade * 1000))
  const centavosDaEmbalagem = dividirArredondando(centavosDe(custoAtual) * milesimos, 1000n)
  const daEmbalagem = formatarMoeda(Number(centavosDaEmbalagem) / 100)
  return `Último custo: ${porUnidade} (${daEmbalagem} a ${embalagem.rotulo}).`
}

/** "= R$ 10,00 por UN": o custo por unidade de uma compra em embalagem. */
export function textoDoCustoPorUnidade(custoUnidade: string, sigla: string): string {
  return `= ${formatarMoeda(Number(custoUnidade))} por ${sigla}`
}

/**
 * O custo na previa do ajuste (spec de Estoque), numa linha propria abaixo da do
 * saldo: "Custo: R$ 9,50 → R$ 10,00 por UN", "Custo: R$ 10,00 por UN (sem
 * mudança)" com o custo igual ao atual e "Custo: R$ 10,00 por UN" no produto
 * ainda sem custo. Null sem custo digitado.
 */
export function textoDoCustoNaPrevia(custoUnidade: string | null, custoAtual: number | null, sigla: string): string | null {
  if (custoUnidade === null) {
    return null
  }
  const novo = `${formatarMoeda(Number(custoUnidade))} por ${sigla}`
  if (custoAtual === null) {
    return `Custo: ${novo}`
  }
  const igual = centavosDe(custoAtual) === BigInt(valorParaDigitos(custoUnidade) || '0')
  return igual ? `Custo: ${novo} (sem mudança)` : `Custo: ${formatarMoeda(custoAtual)} → ${novo}`
}

/** Sigla da embalagem pelo rotulo ("CX c/ 18 UN" -> "CX"), como o backend o monta. */
export function siglaDoRotulo(rotulo: string): string {
  return rotulo.split(' c/ ')[0]
}

/** Custo do movimento de compra: "R$ 180,00 por CX (R$ 10,00 por UN)" ou "R$ 10,00 por UN"; null sem custo. */
function textoDoCustoDoMovimento(movimento: MovimentoEstoque, sigla: string): string | null {
  const { custoInformado, custoUnitario, embalagem } = movimento
  if (custoInformado === null || custoUnitario === null) {
    return null
  }
  const informado = formatarMoeda(custoInformado)
  if (!embalagem) {
    return `${informado} por ${sigla}`
  }
  const porUnidade = formatarMoeda(Number(centavosDoCustoUnitario(custoUnitario)) / 100)
  return `${informado} por ${siglaDoRotulo(embalagem.rotulo)} (${porUnidade} por ${sigla})`
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
  /** Custo da entrada por compra: "R$ 180,00 por CX (R$ 10,00 por UN)"; null nos demais movimentos. */
  custo: string | null
  /** "Fornecedor: Distribuidora Sul" da entrada por compra com fornecedor (spec de Fornecedores e marcas); null sem. */
  fornecedor: string | null
}

/** " (2 CX c/ 18 UN)" do movimento informado em embalagens; '' sem o retrato. */
function textoDoRetrato(movimento: MovimentoEstoque): string {
  const { embalagem } = movimento
  return embalagem ? ` (${textoEmEmbalagens(embalagem.quantidadeDeEmbalagens, embalagem.rotulo)})` : ''
}

/** Textos de uma linha de movimento no historico. */
export function textoMovimento(movimento: MovimentoEstoque, sigla: string): TextoMovimento {
  return {
    titulo: `${ROTULO_TIPO_HISTORICO[movimento.tipo]} · ${ROTULO_MOTIVO[movimento.motivo]}`,
    quantidade: `${formatarVariacaoQuantidade(movimento.quantidade, sigla)}${textoDoRetrato(movimento)}`,
    saldos: `${numero(movimento.saldoAnterior)} → ${numero(movimento.saldoNovo)}`,
    saldosFalados: `saldo de ${numero(movimento.saldoAnterior)} para ${numero(movimento.saldoNovo)}`,
    custo: textoDoCustoDoMovimento(movimento, sigla),
    fornecedor: movimento.fornecedor ? `Fornecedor: ${movimento.fornecedor.nome}` : null,
  }
}
