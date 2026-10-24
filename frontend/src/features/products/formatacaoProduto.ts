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

/**
 * Variacao percentual de um valor para outro, com sinal ("+15,00%", "-10,00%");
 * null quando nao e calculavel (sem anterior, sem novo ou anterior zero).
 */
export function formatarVariacao(anterior: number | null, novo: number | null): string | null {
  if (anterior === null || novo === null || anterior === 0) {
    return null
  }
  const variacao = Math.round(((novo - anterior) / anterior) * 10000) / 100
  const texto = formatarPercentual(variacao)
  return variacao > 0 ? `+${texto}` : texto
}

/** So a data "24/10/2026" de um `LocalDateTime` do backend, com as mesmas regras de `formatarDataHora`. */
export function formatarData(valor: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor)
  if (!partes) {
    return valor
  }
  const [, ano, mes, dia] = partes
  return `${dia}/${mes}/${ano}`
}

/**
 * Data e hora "21/10/2026 14:03" de um `LocalDateTime` do backend
 * ("2026-10-21T14:03:12"), lidas do texto e exibidas como vieram, sem
 * conversao de fuso (o valor nao traz fuso). Texto fora do formato volta como veio.
 */
export function formatarDataHora(valor: string): string {
  const partes = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(valor)
  if (!partes) {
    return valor
  }
  const [, ano, mes, dia, hora, minuto] = partes
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`
}
