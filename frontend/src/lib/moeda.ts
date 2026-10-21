/**
 * Mascara de dinheiro pt-BR que preenche da direita para a esquerda (1 -> 0,01;
 * 1234 -> 12,34). O valor do formulario e sempre a string decimal com ponto
 * ("12.34"), a mesma que o schema e a API usam: estas funcoes so convertem
 * entre ele, os digitos digitados e o texto exibido. Sem React: testavel isolado.
 */
import { apenasDigitos } from '@/lib/documentos'

/** 10 inteiros + 2 decimais, o mesmo do `NUMERIC(12,2)` e do `@Digits` do backend. */
export const MAXIMO_DIGITOS_MOEDA = 12

const VALOR_DECIMAL = /^(\d*)(?:\.(\d*))?$/

/** Digitos sem zeros a esquerda. */
function semZerosAEsquerda(digitos: string): string {
  return digitos.replace(/^0+/, '')
}

/**
 * Digitos (na ordem digitada) para a string decimal com ponto: os dois ultimos
 * sao os centavos ("1234" -> "12.34", "1" -> "0.01"). Sem digitos -> ''; so
 * zeros -> "0.00".
 */
export function digitosParaValor(digitos: string): string {
  const somenteDigitos = apenasDigitos(digitos)
  if (somenteDigitos === '') {
    return ''
  }
  const completos = semZerosAEsquerda(somenteDigitos).padStart(3, '0')
  return `${completos.slice(0, -2)}.${completos.slice(-2)}`
}

/**
 * Digitos significativos de um valor do formulario ("12.34" -> "1234",
 * "10" -> "1000", "0.00" -> ''). Valor que nao e decimal -> ''.
 */
export function valorParaDigitos(valor: string): string {
  const partes = VALOR_DECIMAL.exec(valor.trim())
  if (!partes) {
    return ''
  }
  const [, inteiros, decimais = ''] = partes
  return semZerosAEsquerda(`${inteiros}${decimais.padEnd(2, '0').slice(0, 2)}`)
}

/** Texto exibido no campo ("1234.56" -> "1.234,56"); '' para vazio ou invalido. */
export function formatarMoedaDigitando(valor: string): string {
  const texto = valor.trim()
  if (texto === '' || !VALOR_DECIMAL.test(texto)) {
    return ''
  }
  const digitos = valorParaDigitos(texto).padStart(3, '0')
  const inteiros = digitos.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${inteiros},${digitos.slice(-2)}`
}

/** Separa inteiros e decimais de um texto so com digitos, "." e ","; null se nao formar numero. */
function separarPartes(texto: string): { inteiros: string; decimais: string } | null {
  const ultimaVirgula = texto.lastIndexOf(',')
  const ultimoPonto = texto.lastIndexOf('.')
  if (ultimaVirgula >= 0 && ultimoPonto >= 0) {
    // Os dois separadores: o ultimo e o decimal ("1.234,56" e "1,234.56").
    const posicao = Math.max(ultimaVirgula, ultimoPonto)
    return { inteiros: texto.slice(0, posicao).replace(/[.,]/g, ''), decimais: texto.slice(posicao + 1) }
  }
  const separador = ultimaVirgula >= 0 ? ',' : ultimoPonto >= 0 ? '.' : null
  if (separador === null) {
    return { inteiros: texto, decimais: '' }
  }
  const grupos = texto.split(separador)
  // Um separador so e decimal, exceto o ponto seguido de 3 digitos ("1.234" = mil duzentos e trinta e quatro).
  if (grupos.length === 2 && !(separador === '.' && grupos[1].length === 3)) {
    return { inteiros: grupos[0], decimais: grupos[1] }
  }
  // Varios separadores iguais: separadores de milhar, em grupos de 3.
  if (grupos.slice(1).every((grupo) => grupo.length === 3)) {
    return { inteiros: grupos.join(''), decimais: '' }
  }
  return null
}

/**
 * Texto colado interpretado como numero, nao como sequencia de digitos:
 * "12,5" -> "12.50", "1.234,56" -> "1234.56", "R$ 9,90" -> "9.90". Mais de 2
 * casas arredondam para centavos (meio para cima). Texto que nao forma numero,
 * ou que passa de 12 digitos, -> null (a colagem e ignorada).
 */
export function interpretarValorColado(texto: string): string | null {
  const limpo = texto.replace(/R\$/gi, '').replace(/\s/g, '')
  if (!/^[\d.,]*\d[\d.,]*$/.test(limpo)) {
    return null
  }
  const partes = separarPartes(limpo)
  if (!partes || !/^\d*$/.test(partes.decimais)) {
    return null
  }
  const centavosTruncados = semZerosAEsquerda(`${partes.inteiros}${partes.decimais.padEnd(2, '0').slice(0, 2)}`)
  if (centavosTruncados.length > MAXIMO_DIGITOS_MOEDA) {
    return null
  }
  const arredondaParaCima = Number(partes.decimais.charAt(2) || '0') >= 5
  // Ate 12 digitos cabem com folga no inteiro exato do Number.
  const centavos = Number(centavosTruncados || '0') + (arredondaParaCima ? 1 : 0)
  const digitos = String(centavos)
  if (digitos.length > MAXIMO_DIGITOS_MOEDA) {
    return null
  }
  return digitosParaValor(digitos)
}
