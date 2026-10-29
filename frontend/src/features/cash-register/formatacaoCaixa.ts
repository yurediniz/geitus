import type {
  FormaDePagamento,
  MovimentoDeCaixa,
  SituacaoDoPonto,
  StatusDaSessao,
  TipoDeMovimentoDeCaixa,
  ValoresPorForma,
} from '@/types/caixa'

/**
 * Formatacao do caixa. Os horarios chegam com deslocamento (ISO-8601) e sao
 * sempre mostrados e comparados no fuso da empresa, America/Sao_Paulo (spec do
 * Caixa), independentemente do fuso do navegador. O dinheiro e contado em
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

/** "Aberto desde 23/10 às 08:02" (aviso do caixa esquecido aberto, spec do Caixa). */
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

/** Zero confere (verde); sobra ou falta em ambar (spec do Caixa). */
export function formatarDiferenca(valor: number): { texto: string; tom: 'ok' | 'alerta' } {
  const centavos = emCentavos(valor)
  if (centavos === 0) {
    return { texto: 'Confere', tom: 'ok' }
  }
  const absoluto = formatarReais(Math.abs(centavos) / 100)
  return { texto: centavos > 0 ? `Sobra de ${absoluto}` : `Falta de ${absoluto}`, tom: 'alerta' }
}

/**
 * Soma dos suprimentos, das sangrias e das vendas em dinheiro (recebimentos
 * menos estornos em `DINHEIRO`) da sessao. Valor oculto (null, modo cego)
 * nunca entra na soma: `completos` diz se todos os valores estavam visiveis
 * (sem isso, os totais nao devem ser mostrados).
 */
export function totaisDosMovimentos(movimentos: readonly MovimentoDeCaixa[]): {
  suprimentos: number
  sangrias: number
  vendasEmDinheiro: number
  devolucoesEmDinheiro: number
  completos: boolean
} {
  let suprimentos = 0
  let sangrias = 0
  let vendasEmDinheiro = 0
  let devolucoesEmDinheiro = 0
  let completos = true
  for (const movimento of movimentos) {
    if (movimento.valor === null) {
      completos = false
    } else if (movimento.tipo === 'SUPRIMENTO') {
      suprimentos += emCentavos(movimento.valor)
    } else if (movimento.tipo === 'SANGRIA') {
      sangrias += emCentavos(movimento.valor)
    } else if (movimento.forma === 'DINHEIRO' && movimento.tipo === 'RECEBIMENTO') {
      vendasEmDinheiro += emCentavos(movimento.valor)
    } else if (movimento.forma === 'DINHEIRO' && movimento.tipo === 'ESTORNO') {
      vendasEmDinheiro -= emCentavos(movimento.valor)
    } else if (movimento.forma === 'DINHEIRO' && movimento.tipo === 'DEVOLUCAO') {
      devolucoesEmDinheiro += emCentavos(movimento.valor)
    }
  }
  return {
    suprimentos: suprimentos / 100,
    sangrias: sangrias / 100,
    vendasEmDinheiro: vendasEmDinheiro / 100,
    devolucoesEmDinheiro: devolucoesEmDinheiro / 100,
    completos,
  }
}

/** "Débito", "Débito e PIX", "Débito, Crédito e PIX". */
function juntarNomes(nomes: readonly string[]): string {
  return nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`
}

/** As formas (fora o dinheiro) com diferenca diferente de zero. */
export function formasComDiferenca(porForma: readonly ValoresPorForma[] | undefined): FormaDePagamento[] {
  // Backend antigo, sem `porForma`: nenhuma forma alem do dinheiro.
  return (porForma ?? [])
    .filter((valores) => valores.forma !== 'DINHEIRO' && valores.diferenca !== null && emCentavos(valores.diferenca) !== 0)
    .map((valores) => valores.forma)
}

/** "falta de R$ 2,00" ou "sobra de R$ 2,00". */
function textoDaSobraOuFalta(centavos: number): string {
  return `${centavos > 0 ? 'sobra' : 'falta'} de ${formatarReais(Math.abs(centavos) / 100)}`
}

/**
 * A mensagem do fechamento:
 * - so com o dinheiro na sessao: "Caixa 2 fechado" ou "Caixa 2 fechado com falta de R$ 2,00";
 * - com mais formas, nomeia cada uma: "... com falta de R$ 2,00 no Débito" ou
 *   "... com falta de R$ 2,00 no Dinheiro e sobra de R$ 1,00 no PIX";
 * - com 3 ou mais formas com diferenca: "... com diferença em Débito, Crédito e PIX. Veja o resumo."
 */
export function mensagemDoFechamento(
  nomeDoPonto: string,
  diferenca: number | null,
  porForma: readonly ValoresPorForma[] | undefined = [],
): string {
  porForma ??= []
  const centavosDoDinheiro = diferenca === null ? 0 : emCentavos(diferenca)
  if (porForma.length <= 1) {
    return centavosDoDinheiro === 0 ? `${nomeDoPonto} fechado` : `${nomeDoPonto} fechado com ${textoDaSobraOuFalta(centavosDoDinheiro)}`
  }
  const comDiferenca: { forma: FormaDePagamento; centavos: number }[] = []
  if (centavosDoDinheiro !== 0) {
    comDiferenca.push({ forma: 'DINHEIRO', centavos: centavosDoDinheiro })
  }
  for (const forma of formasComDiferenca(porForma)) {
    const valores = porForma.find((item) => item.forma === forma)
    comDiferenca.push({ forma, centavos: emCentavos(valores?.diferenca ?? 0) })
  }
  if (comDiferenca.length === 0) {
    return `${nomeDoPonto} fechado`
  }
  if (comDiferenca.length >= 3) {
    return `${nomeDoPonto} fechado com diferença em ${juntarNomes(comDiferenca.map(({ forma }) => ROTULO_DA_FORMA[forma]))}. Veja o resumo.`
  }
  const partes = comDiferenca.map(({ forma, centavos }) => `${textoDaSobraOuFalta(centavos)} no ${ROTULO_DA_FORMA[forma]}`)
  return `${nomeDoPonto} fechado com ${partes.join(' e ')}`
}

export const ROTULO_DA_FORMA: Readonly<Record<FormaDePagamento, string>> = {
  DINHEIRO: 'Dinheiro',
  DEBITO: 'Débito',
  CREDITO: 'Crédito',
  PIX: 'PIX',
}

export const ROTULO_DO_MOVIMENTO: Readonly<Record<TipoDeMovimentoDeCaixa, string>> = {
  ABERTURA: 'Abertura',
  SUPRIMENTO: 'Suprimento',
  SANGRIA: 'Sangria',
  RECEBIMENTO: 'Recebimento',
  ESTORNO: 'Estorno',
  DEVOLUCAO: 'Devolução',
}

export const ROTULO_DO_STATUS: Readonly<Record<StatusDaSessao, string>> = {
  ABERTA: 'Aberto',
  EM_CONFERENCIA: 'Em conferência',
  FECHADA: 'Fechado',
}
