/**
 * Formatacao do caixa. Os horarios chegam com deslocamento (ISO-8601) e sao
 * sempre mostrados e comparados no fuso da empresa, America/Sao_Paulo (spec
 * §4.5), independentemente do fuso do navegador.
 */

export const FUSO_DO_CAIXA = 'America/Sao_Paulo'

const PARTES_DA_DATA = new Intl.DateTimeFormat('pt-BR', {
  timeZone: FUSO_DO_CAIXA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

interface PartesDaData {
  ano: string
  mes: string
  dia: string
  hora: string
  minuto: string
}

/** Ano, mes, dia, hora e minuto do instante em America/Sao_Paulo; null se nao for data. */
function partesEmSaoPaulo(instante: Date): PartesDaData | null {
  if (Number.isNaN(instante.getTime())) {
    return null
  }
  const partes = Object.fromEntries(PARTES_DA_DATA.formatToParts(instante).map((parte) => [parte.type, parte.value]))
  return { ano: partes.year, mes: partes.month, dia: partes.day, hora: partes.hour, minuto: partes.minute }
}

/** "08:02" */
export function formatarHora(valor: string): string {
  const partes = partesEmSaoPaulo(new Date(valor))
  return partes ? `${partes.hora}:${partes.minuto}` : valor
}

/** "24/10/2026 às 08:02" */
export function formatarDataHoraCaixa(valor: string): string {
  const partes = partesEmSaoPaulo(new Date(valor))
  return partes ? `${partes.dia}/${partes.mes}/${partes.ano} às ${partes.hora}:${partes.minuto}` : valor
}
