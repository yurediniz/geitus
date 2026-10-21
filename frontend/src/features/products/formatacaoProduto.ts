/** Formatacao pt-BR dos valores do produto (lista e pagina do produto). */

export function formatarMoeda(valor: number | null): string {
  if (valor === null) {
    return 'Não informado'
  }
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Quantidade formatada (pt-BR) com a sigla da unidade; "Não informado" se nula. */
export function formatarQuantidade(valor: number | null, sigla: string): string {
  if (valor === null) {
    return 'Não informado'
  }
  return `${valor.toLocaleString('pt-BR')} ${sigla}`
}

/** Percentual derivado (margem/markup) formatado como "X,XX%"; null quando não há valor. */
export function formatarPercentual(valor: number | null): string | null {
  if (valor === null) {
    return null
  }
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}
