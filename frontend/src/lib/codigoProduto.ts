/**
 * Regra do codigo do produto (spec produtos-codigo-e-balanca §2): inteiro de
 * 1 a 999999, guardado como numero (000542 = 0542 = 542) e exibido sem zeros
 * a esquerda. Na digitacao, os zeros a esquerda sao aceitos e ignorados.
 */

/** Maior codigo aceito (6 digitos). */
export const CODIGO_PRODUTO_MAXIMO = 999999

/** Quantidade maxima de digitos do codigo, ja sem os zeros a esquerda. */
export const DIGITOS_CODIGO_PRODUTO = 6

/**
 * Interpreta o texto digitado: vazio -> null; so digitos, ate 6 depois de
 * remover os zeros a esquerda e maior que zero -> numero; senao -> 'invalido'.
 */
export function interpretarCodigoProduto(texto: string): number | null | 'invalido' {
  const aparado = texto.trim()
  if (aparado === '') {
    return null
  }
  if (!/^\d+$/.test(aparado)) {
    return 'invalido'
  }
  const semZeros = aparado.replace(/^0+/, '')
  if (semZeros === '' || semZeros.length > DIGITOS_CODIGO_PRODUTO) {
    return 'invalido'
  }
  return Number(semZeros)
}
