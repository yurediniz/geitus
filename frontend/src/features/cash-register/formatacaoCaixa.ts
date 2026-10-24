import type { MovimentoDeCaixa, SituacaoDoPonto, StatusDaSessao, TipoDeMovimentoDeCaixa } from '@/types/caixa'

/**
 * Formatacao do caixa. Os horarios chegam com deslocamento (ISO-8601) e sao
 * sempre mostrados e comparados no fuso da empresa, America/Sao_Paulo (spec
 * §4.5), independentemente do fuso do navegador. O dinheiro e contado em
 * centavos inteiros para nao acumular erro de ponto flutuante.
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

const REAIS = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

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

/** "23/10 às 08:02" */
function formatarDiaEHora(valor: string): string {
  const partes = partesEmSaoPaulo(new Date(valor))
  return partes ? `${partes.dia}/${partes.mes} às ${partes.hora}:${partes.minuto}` : valor
}

/** "Aberto desde 23/10 às 08:02" (aviso do caixa esquecido aberto, spec §3.5). */
export function textoAbertoDesde(abertaEm: string): string {
  return `Aberto desde ${formatarDiaEHora(abertaEm)}`
}

/** Dia "AAAA-MM-DD" do instante em America/Sao_Paulo; null se nao for data. */
function diaEmSaoPaulo(instante: Date): string | null {
  const partes = partesEmSaoPaulo(instante)
  return partes ? `${partes.ano}-${partes.mes}-${partes.dia}` : null
}

/** Se a data de abertura (em America/Sao_Paulo) e anterior a hoje (tambem em America/Sao_Paulo). */
export function abertoEmOutroDia(abertaEm: string, hoje: Date): boolean {
  const diaDaAbertura = diaEmSaoPaulo(new Date(abertaEm))
  const diaDeHoje = diaEmSaoPaulo(hoje)
  return diaDaAbertura !== null && diaDeHoje !== null && diaDaAbertura < diaDeHoje
}

/** "às 08:02" no mesmo dia; "desde 23/10 às 08:02" quando foi aberto em outro dia. */
export function textoDaAbertura(abertaEm: string, hoje: Date): string {
  return abertoEmOutroDia(abertaEm, hoje) ? `desde ${formatarDiaEHora(abertaEm)}` : `às ${formatarHora(abertaEm)}`
}

/**
 * Situacao do ponto, a mesma em todas as listas (escolha do ponto, outros
 * caixas abertos e Configuracoes): "livre", "aberto por Ana Souza às 08:02"
 * (ou "desde 23/10 às 08:02") ou "em conferência · Ana Souza". Minuscula: vem
 * depois do nome do ponto ("Caixa 1 · livre").
 */
export function textoDaSituacaoDoPonto(situacao: SituacaoDoPonto | null, hoje: Date): string {
  if (!situacao) {
    return 'livre'
  }
  if (situacao.status === 'EM_CONFERENCIA') {
    return `em conferência · ${situacao.abertaPorNome}`
  }
  return `aberto por ${situacao.abertaPorNome} ${textoDaAbertura(situacao.abertaEm, hoje)}`
}

/** "R$ 1.234,56" (pt-BR). */
export function formatarReais(valor: number): string {
  return REAIS.format(valor)
}

function emCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/** Contado - esperado, em reais, calculado em centavos. */
export function diferencaEntre(contado: number, esperado: number): number {
  return (emCentavos(contado) - emCentavos(esperado)) / 100
}

/** Zero confere (verde); sobra ou falta em ambar (spec §6.4). */
export function formatarDiferenca(valor: number): { texto: string; tom: 'ok' | 'alerta' } {
  const centavos = emCentavos(valor)
  if (centavos === 0) {
    return { texto: 'Confere', tom: 'ok' }
  }
  const absoluto = formatarReais(Math.abs(centavos) / 100)
  return { texto: centavos > 0 ? `Sobra de ${absoluto}` : `Falta de ${absoluto}`, tom: 'alerta' }
}

/** Soma dos suprimentos e das sangrias da sessao. */
export function totaisDosMovimentos(movimentos: readonly MovimentoDeCaixa[]): { suprimentos: number; sangrias: number } {
  let suprimentos = 0
  let sangrias = 0
  for (const movimento of movimentos) {
    if (movimento.tipo === 'SUPRIMENTO') {
      suprimentos += emCentavos(movimento.valor)
    } else if (movimento.tipo === 'SANGRIA') {
      sangrias += emCentavos(movimento.valor)
    }
  }
  return { suprimentos: suprimentos / 100, sangrias: sangrias / 100 }
}

/** "Caixa 2 fechado" ou "Caixa 2 fechado com falta de R$ 2,00" / "com sobra de R$ 2,00". */
export function mensagemDoFechamento(nomeDoPonto: string, diferenca: number | null): string {
  const centavos = diferenca === null ? 0 : emCentavos(diferenca)
  if (centavos === 0) {
    return `${nomeDoPonto} fechado`
  }
  const absoluto = formatarReais(Math.abs(centavos) / 100)
  return `${nomeDoPonto} fechado com ${centavos > 0 ? 'sobra' : 'falta'} de ${absoluto}`
}

export const ROTULO_DO_MOVIMENTO: Readonly<Record<TipoDeMovimentoDeCaixa, string>> = {
  ABERTURA: 'Abertura',
  SUPRIMENTO: 'Suprimento',
  SANGRIA: 'Sangria',
}

export const ROTULO_DO_STATUS: Readonly<Record<StatusDaSessao, string>> = {
  ABERTA: 'Aberto',
  EM_CONFERENCIA: 'Em conferência',
  FECHADA: 'Fechado',
}
