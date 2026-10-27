/**
 * Regras da etiqueta de balanca (spec de Produtos).
 *
 * `lerEtiqueta` espelha o `LeitorEtiquetaBalanca` do backend (mesmos casos de
 * teste), para o PDV no futuro; hoje a tela usa so `pareceEtiqueta` (aviso de
 * codigo de barras com formato de etiqueta), a previa e o exemplo. Quem
 * decide a leitura de verdade e o backend (teste de etiqueta).
 */
import { digitoVerificadorValido } from '@/lib/codigoBarras'
import type { ConfiguracaoEtiqueta, LeituraEtiqueta } from '@/types/etiquetaBalanca'

/** Toda etiqueta tem 13 digitos (o tamanho de um EAN-13). */
export const TAMANHO_ETIQUETA = 13

/** Configuracao usada pelas empresas que ainda nao gravaram a sua. */
export const CONFIGURACAO_ETIQUETA_PADRAO: ConfiguracaoEtiqueta = {
  prefixo: '2',
  digitosCodigo: 6,
  digitosPreenchimento: 0,
  tipoInformacao: 'VALOR',
  digitosInformacao: 6,
  casasDecimais: 3,
  digitoVerificador: false,
}

export interface ModeloDeEtiqueta {
  id: string
  nome: string
  configuracao: ConfiguracaoEtiqueta
}

/** Modelos prontos da tela "Balança" (o primeiro e o padrao). */
export const MODELOS_DE_ETIQUETA: readonly ModeloDeEtiqueta[] = [
  {
    id: 'toledo-6-6',
    nome: 'Toledo · código 6, valor 6 (3 casas) — padrão',
    configuracao: CONFIGURACAO_ETIQUETA_PADRAO,
  },
  {
    id: 'toledo-4-0-6-dv',
    nome: 'Toledo · código 4, valor 6 (2 casas), com dígito verificador',
    configuracao: {
      prefixo: '2',
      digitosCodigo: 4,
      digitosPreenchimento: 1,
      tipoInformacao: 'VALOR',
      digitosInformacao: 6,
      casasDecimais: 2,
      digitoVerificador: true,
    },
  },
  {
    // Para somar 13 digitos (2 + 5 + 5 + DV = 12), o formato Toledo tem um zero
    // entre o codigo e o valor (o nome segue o que o usuario ve na balanca).
    id: 'toledo-5-0-5-dv',
    nome: 'Toledo · código 5, valor 5 (2 casas), com dígito verificador',
    configuracao: {
      prefixo: '2',
      digitosCodigo: 5,
      digitosPreenchimento: 1,
      tipoInformacao: 'VALOR',
      digitosInformacao: 5,
      casasDecimais: 2,
      digitoVerificador: true,
    },
  },
  {
    id: 'peso-6-5-dv',
    nome: 'Peso · código 6, peso 5 (3 casas), com dígito verificador',
    configuracao: {
      prefixo: '2',
      digitosCodigo: 6,
      digitosPreenchimento: 0,
      tipoInformacao: 'PESO',
      digitosInformacao: 5,
      casasDecimais: 3,
      digitoVerificador: true,
    },
  },
]

/** Total de digitos da etiqueta no formato (precisa ser 13). */
export function totalDigitosEtiqueta(config: ConfiguracaoEtiqueta): number {
  return (
    config.prefixo.length +
    config.digitosCodigo +
    config.digitosPreenchimento +
    config.digitosInformacao +
    (config.digitoVerificador ? 1 : 0)
  )
}

/** Se as duas configuracoes tem o mesmo formato. */
export function mesmaConfiguracao(a: ConfiguracaoEtiqueta, b: ConfiguracaoEtiqueta): boolean {
  return (
    a.prefixo === b.prefixo &&
    a.digitosCodigo === b.digitosCodigo &&
    a.digitosPreenchimento === b.digitosPreenchimento &&
    a.tipoInformacao === b.tipoInformacao &&
    a.digitosInformacao === b.digitosInformacao &&
    a.casasDecimais === b.casasDecimais &&
    a.digitoVerificador === b.digitoVerificador
  )
}

/** O modelo pronto igual a configuracao, ou null quando ela e personalizada. */
export function modeloDaConfiguracao(config: ConfiguracaoEtiqueta): ModeloDeEtiqueta | null {
  return MODELOS_DE_ETIQUETA.find((modelo) => mesmaConfiguracao(modelo.configuracao, config)) ?? null
}

/**
 * Previa legivel do formato, ex.: "2 · CCCCCC · VVVVVV (R$, 3 casas) · sem
 * dígito verificador". Os zeros de preenchimento aparecem como "0".
 */
export function descreverFormatoEtiqueta(config: ConfiguracaoEtiqueta): string {
  const ehValor = config.tipoInformacao === 'VALOR'
  const partes = [config.prefixo || '?', 'C'.repeat(config.digitosCodigo)]
  if (config.digitosPreenchimento > 0) {
    partes.push('0'.repeat(config.digitosPreenchimento))
  }
  const letra = ehValor ? 'V' : 'P'
  const unidade = ehValor ? 'R$' : 'kg'
  partes.push(`${letra.repeat(config.digitosInformacao)} (${unidade}, ${config.casasDecimais} casas)`)
  partes.push(config.digitoVerificador ? 'com dígito verificador' : 'sem dígito verificador')
  return partes.join(' · ')
}

/**
 * Se o numero tem o formato da etiqueta configurada: 13 digitos comecando pelo
 * prefixo. Nao confere o digito verificador: e so um aviso.
 */
export function pareceEtiqueta(codigo: string, config: ConfiguracaoEtiqueta | null): boolean {
  if (!config || config.prefixo === '') {
    return false
  }
  return /^\d{13}$/.test(codigo) && codigo.startsWith(config.prefixo)
}

/** "010000" com 3 casas -> 10, montado como texto ("010.000") para nao herdar erro de ponto flutuante. */
function comCasasDecimais(digitos: string, casas: number): number {
  const inteiros = digitos.slice(0, digitos.length - casas) || '0'
  return Number(`${inteiros}.${digitos.slice(digitos.length - casas)}`)
}

/**
 * Le a etiqueta: so com exatamente 13 digitos comecando pelo prefixo e, com
 * digito verificador, um EAN-13 valido. O codigo e lido sem zeros (000542 ->
 * 542) e tem de ser de 1 a 999999; o preenchimento tem de ser zeros; a
 * informacao e dividida por 10^casas (010000 com 3 casas -> 10).
 */
export function lerEtiqueta(codigo: string, config: ConfiguracaoEtiqueta): LeituraEtiqueta | null {
  if (totalDigitosEtiqueta(config) !== TAMANHO_ETIQUETA || !pareceEtiqueta(codigo, config)) {
    return null
  }
  if (config.digitoVerificador && !digitoVerificadorValido(codigo)) {
    return null
  }
  const inicioCodigo = config.prefixo.length
  const fimCodigo = inicioCodigo + config.digitosCodigo
  const inicioInformacao = fimCodigo + config.digitosPreenchimento
  const codigoProduto = Number(codigo.slice(inicioCodigo, fimCodigo))
  if (codigoProduto === 0 || !/^0*$/.test(codigo.slice(fimCodigo, inicioInformacao))) {
    return null
  }
  const informacao = codigo.slice(inicioInformacao, inicioInformacao + config.digitosInformacao)
  return {
    codigoProduto,
    tipo: config.tipoInformacao,
    valor: comCasasDecimais(informacao, config.casasDecimais),
  }
}

/** Um pedaco do exemplo de etiqueta, com a legenda que vai embaixo dele. */
export interface GrupoDoExemplo {
  digitos: string
  legenda: string
}

/** Etiqueta de exemplo montada com a configuracao, e o que ela significa. */
export interface ExemploDeEtiqueta {
  grupos: GrupoDoExemplo[]
  /** Ex.: "produto 542, R$ 10,00" ou "produto 542, 0,750 kg". */
  significado: string
}

/** Codigo de produto do exemplo (cabe em qualquer tamanho de codigo aceito, de 4 a 6). */
const CODIGO_DO_EXEMPLO = 542

function formatarInformacao(valor: number, config: ConfiguracaoEtiqueta): string {
  if (config.tipoInformacao === 'VALOR') {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  return `${valor.toLocaleString('pt-BR', { minimumFractionDigits: config.casasDecimais })} kg`
}

/** Digito verificador GS1 (mod 10) que completa o corpo. */
function calcularDigitoVerificador(corpo: string): number {
  let soma = 0
  for (let i = 0; i < corpo.length; i++) {
    soma += Number(corpo[corpo.length - 1 - i]) * (i % 2 === 0 ? 3 : 1)
  }
  return (10 - (soma % 10)) % 10
}

/**
 * Exemplo montado com a configuracao: "2 000542 010000 -> produto 542, R$ 10,00"
 * (R$ 10,00 ou 0,750 kg; R$ 1,00 ou 0,075 kg quando o maior nao cabe). Com
 * preenchimento, os zeros aparecem; com DV, o digito calculado. Null com o
 * formato invalido.
 */
export function exemploDeEtiqueta(config: ConfiguracaoEtiqueta): ExemploDeEtiqueta | null {
  if (!/^\d{1,2}$/.test(config.prefixo) || totalDigitosEtiqueta(config) !== TAMANHO_ETIQUETA) {
    return null
  }
  const opcoes = config.tipoInformacao === 'VALOR' ? [10, 1] : [0.75, 0.075]
  const informacao = opcoes
    .map((valor) => ({ valor, digitos: String(Math.round(valor * 10 ** config.casasDecimais)) }))
    .find(({ digitos }) => digitos.length <= config.digitosInformacao) ?? { valor: 0, digitos: '0' }
  const grupos: GrupoDoExemplo[] = [
    { digitos: config.prefixo, legenda: 'início' },
    { digitos: String(CODIGO_DO_EXEMPLO).padStart(config.digitosCodigo, '0'), legenda: 'código do produto' },
  ]
  if (config.digitosPreenchimento > 0) {
    grupos.push({ digitos: '0'.repeat(config.digitosPreenchimento), legenda: 'zeros' })
  }
  grupos.push({
    digitos: informacao.digitos.padStart(config.digitosInformacao, '0'),
    legenda: config.tipoInformacao === 'VALOR' ? 'valor' : 'peso',
  })
  if (config.digitoVerificador) {
    const corpo = grupos.map((grupo) => grupo.digitos).join('')
    grupos.push({ digitos: String(calcularDigitoVerificador(corpo)), legenda: 'verificador' })
  }
  return {
    grupos,
    significado: `produto ${CODIGO_DO_EXEMPLO}, ${formatarInformacao(informacao.valor, config)}`,
  }
}
