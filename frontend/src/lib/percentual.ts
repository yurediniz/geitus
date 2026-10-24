/**
 * Percentuais digitados (desconto maximo do operador, desconto em %): de 0 a
 * 100, com virgula ou ponto e ate 2 casas, o mesmo do `NUMERIC(5,2)` do backend.
 */

const PERCENTUAL = /^(\d{1,3})(?:[.,](\d{1,2}))?$/

/** "12,5" ou "12.5" -> 12.5; null vazio, fora de 0 a 100 ou com mais de 2 casas. */
export function lerPercentual(texto: string): number | null {
  const partes = PERCENTUAL.exec(texto.trim())
  if (!partes) {
    return null
  }
  const valor = Number(`${partes[1]}.${partes[2] ?? '0'}`)
  return valor <= 100 ? valor : null
}

/** 10 -> "10,00" */
export function formatarPercentual(valor: number): string {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
