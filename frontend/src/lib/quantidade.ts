/**
 * Quantidades de estoque digitadas pelo usuario. O backend guarda
 * `NUMERIC(12,3)`: ate 9 digitos inteiros e 3 casas decimais. Os campos sao
 * texto (`inputMode="decimal"`) para aceitar a virgula do pt-BR.
 */

const MAXIMO_DIGITOS_INTEIROS = 9
const MAXIMO_CASAS_DECIMAIS = 3

/** Por que o texto nao e uma quantidade aceita. */
export type ProblemaQuantidade = 'vazio' | 'negativo' | 'invalido' | 'casas' | 'limite'

export type ResultadoQuantidade = { valor: number } | { erro: ProblemaQuantidade }

/** Le "2,5" ou "2.5" (sem sinal, sem separador de milhar) e diz o que falta quando nao da. */
export function validarQuantidade(texto: string): ResultadoQuantidade {
  const aparado = texto.trim()
  if (aparado === '') {
    return { erro: 'vazio' }
  }
  const partes = /^(-?)(\d+)(?:[.,](\d+))?$/.exec(aparado)
  if (!partes) {
    return { erro: 'invalido' }
  }
  const [, sinal, inteiros, decimais = ''] = partes
  if (sinal === '-') {
    return { erro: 'negativo' }
  }
  if (decimais.length > MAXIMO_CASAS_DECIMAIS) {
    return { erro: 'casas' }
  }
  if (inteiros.replace(/^0+(?=\d)/, '').length > MAXIMO_DIGITOS_INTEIROS) {
    return { erro: 'limite' }
  }
  return { valor: Number(decimais ? `${inteiros}.${decimais}` : inteiros) }
}

/** Quantidade do texto ("2,5" -> 2.5); null se vazio ou fora das regras. */
export function interpretarQuantidade(texto: string): number | null {
  const resultado = validarQuantidade(texto)
  return 'valor' in resultado ? resultado.valor : null
}

/** Mensagens dos problemas que valem para qualquer campo de quantidade. */
export const MENSAGEM_QUANTIDADE: Readonly<Record<Exclude<ProblemaQuantidade, 'vazio' | 'negativo'>, string>> = {
  invalido: 'Informe um número válido.',
  casas: 'Use no máximo 3 casas decimais.',
  limite: 'Use no máximo 9 dígitos inteiros.',
}

/** Valor da API no campo de texto, com virgula e sem agrupar milhares (2.5 -> "2,5"). */
export function quantidadeParaTexto(valor: number | null): string {
  return valor === null
    ? ''
    : valor.toLocaleString('pt-BR', { maximumFractionDigits: MAXIMO_CASAS_DECIMAIS, useGrouping: false })
}
