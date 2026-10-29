/**
 * Regras da devolucao de itens na tela (spec de Estoque, 6.2), sem React: a
 * quantidade de cada linha, o valor previsto, o reembolso inicial e a frase da
 * confirmacao. O backend aplica as mesmas regras e decide; aqui elas evitam o
 * envio e mostram o que vai acontecer. Dinheiro em centavos e quantidade em
 * milesimos, para a conta nao errar por ponto flutuante.
 */
import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { MENSAGEM_QUANTIDADE, quantidadeParaTexto, validarQuantidade } from '@/lib/quantidade'
import type { FormaDePagamento } from '@/types/caixa'
import type { DestinoDaDevolucao, FormaParaReembolso, LinhaParaDevolucao } from '@/types/pdv'

/** A forma na frase da devolucao, em minusculas: "em dinheiro", "no débito", "no crédito", "no PIX". */
export const DEVOLUCAO_NA_FORMA: Readonly<Record<FormaDePagamento, string>> = {
  DINHEIRO: 'em dinheiro',
  DEBITO: 'no débito',
  CREDITO: 'no crédito',
  PIX: 'no PIX',
}

/** "a", "a e b", "a, b e c". */
export function juntarComE(partes: readonly string[]): string {
  return partes.length <= 1 ? (partes[0] ?? '') : `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
}

export const MENSAGEM_ETIQUETA_INTEIRA = 'Item de balança só volta inteiro.'
export const MENSAGEM_EMBALAGENS_INTEIRAS = 'Devolva um número inteiro de embalagens.'
export const MENSAGEM_UNIDADE_INTEIRA = 'Esta unidade não é fracionada: devolva uma quantidade inteira.'

function centavos(valor: number): number {
  return Math.round(valor * 100)
}

function milesimos(valor: number): number {
  return Math.round(valor * 1000)
}

/** "2 UN", "1,25 KG", "1 CX c/ 12 UN". */
export function comUnidade(quantidade: number, unidade: string): string {
  return `${quantidadeParaTexto(quantidade)} ${unidade}`
}

/** A quantidade digitada numa linha: 0 sem devolver, o valor conferido ou o erro do campo. */
export type QuantidadeDaLinha = { quantidade: number } | { erro: string }

/**
 * Confere o texto do campo da linha: vazio ou zero nao devolve; inteira em
 * unidade nao fracionada e em embalagem; ate 3 casas; a etiqueta so inteira;
 * no maximo o disponivel.
 */
export function quantidadeDaLinha(linha: LinhaParaDevolucao, texto: string): QuantidadeDaLinha {
  if (texto.trim() === '') {
    return { quantidade: 0 }
  }
  const resultado = validarQuantidade(texto)
  if ('erro' in resultado) {
    return {
      erro: resultado.erro === 'vazio' || resultado.erro === 'negativo'
        ? MENSAGEM_QUANTIDADE.invalido
        : MENSAGEM_QUANTIDADE[resultado.erro],
    }
  }
  const quantidade = resultado.valor
  if (quantidade === 0) {
    return { quantidade: 0 }
  }
  if (linha.etiqueta && milesimos(quantidade) !== milesimos(linha.quantidade)) {
    return { erro: MENSAGEM_ETIQUETA_INTEIRA }
  }
  if (!Number.isInteger(quantidade) && (linha.embalagemRotulo !== null || !linha.fracionada)) {
    return { erro: linha.embalagemRotulo !== null ? MENSAGEM_EMBALAGENS_INTEIRAS : MENSAGEM_UNIDADE_INTEIRA }
  }
  if (milesimos(quantidade) > milesimos(linha.disponivel)) {
    return { erro: `Só restam ${comUnidade(linha.disponivel, linha.unidade)} para devolver nesta linha.` }
  }
  return { quantidade }
}

/**
 * O valor previsto da linha: a parte proporcional do liquido, meio para cima,
 * sem passar do que resta; quem zera a linha leva o resto (a mesma conta do
 * backend).
 */
export function valorPrevisto(linha: LinhaParaDevolucao, quantidade: number): number {
  if (quantidade <= 0) {
    return 0
  }
  const resta = centavos(linha.valorDisponivel)
  if (milesimos(quantidade) === milesimos(linha.disponivel)) {
    return resta / 100
  }
  const proporcional = Math.round(
    (centavos(linha.valorLiquido) * milesimos(quantidade)) / milesimos(linha.quantidade),
  )
  return Math.min(proporcional, resta) / 100
}

/**
 * O reembolso que ja vem preenchido (regra 4): com uma forma, ela leva tudo;
 * com varias, o valor e distribuido na ordem das formas ate o disponivel de
 * cada uma. Cada valor e uma string decimal ("12.34") do `CampoMoeda`; '' sem
 * valor.
 */
export function reembolsoInicial(
  formas: readonly FormaParaReembolso[],
  valor: number,
): Partial<Record<FormaDePagamento, string>> {
  let restante = centavos(valor)
  const reembolso: Partial<Record<FormaDePagamento, string>> = {}
  for (const forma of formas) {
    const parte = Math.min(restante, Math.max(0, centavos(forma.disponivel)))
    reembolso[forma.forma] = parte > 0 ? (parte / 100).toFixed(2) : ''
    restante -= parte
  }
  return reembolso
}

/** A soma dos valores digitados, em reais. */
export function somaDoReembolso(reembolso: Partial<Record<FormaDePagamento, string>>): number {
  return (
    Object.values(reembolso).reduce((soma, texto) => soma + (texto ? centavos(Number(texto)) : 0), 0) / 100
  )
}

/** Uma linha que vai ser devolvida, para a frase. */
export interface LinhaDaFrase {
  quantidade: number
  unidade: string
  destino: DestinoDaDevolucao
}

/**
 * O que a confirmacao vai fazer, numa frase: "Devolver R$ 24,90 em dinheiro e
 * voltar 3 UN ao estoque", "... e registrar 1 UN como avariado". Sem valor
 * (linha de liquido zero): "Registrar a devolução e voltar 1 UN ao estoque".
 */
export function fraseDaConfirmacao(
  reembolsos: readonly { forma: FormaDePagamento; valor: number }[],
  linhas: readonly LinhaDaFrase[],
): string {
  const dinheiro = reembolsos
    .filter((reembolso) => reembolso.valor > 0)
    .map((reembolso) => `${formatarReais(reembolso.valor)} ${DEVOLUCAO_NA_FORMA[reembolso.forma]}`)
  // Soma por unidade: duas linhas de 1 UN viram "2 UN", nao "1 UN e 1 UN".
  const doDestino = (destino: DestinoDaDevolucao) => {
    const porUnidade = new Map<string, number>()
    for (const linha of linhas.filter((item) => item.destino === destino)) {
      porUnidade.set(linha.unidade, (porUnidade.get(linha.unidade) ?? 0) + milesimos(linha.quantidade))
    }
    return [...porUnidade].map(([unidade, total]) => comUnidade(total / 1000, unidade))
  }
  const acoes = [
    ...(doDestino('ESTOQUE').length > 0 ? [`voltar ${juntarComE(doDestino('ESTOQUE'))} ao estoque`] : []),
    ...(doDestino('AVARIADO').length > 0 ? [`registrar ${juntarComE(doDestino('AVARIADO'))} como avariado`] : []),
  ]
  const inicio = dinheiro.length > 0 ? `Devolver ${juntarComE(dinheiro)}` : 'Registrar a devolução'
  return acoes.length > 0 ? `${inicio} e ${juntarComE(acoes)}` : inicio
}
