/**
 * Regras da etiqueta de balanca (spec produtos-codigo-e-balanca §3).
 *
 * `lerEtiqueta` espelha o `LeitorEtiquetaBalanca` do backend (mesmos casos de
 * teste). Na tela, serve so para a previa e para o aviso de codigo de barras com
 * formato de etiqueta (§3.4): quem decide a leitura de verdade e o backend.
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
    nome: 'Toledo, código 6 + valor 6 (3 casas), sem DV',
    configuracao: CONFIGURACAO_ETIQUETA_PADRAO,
  },
  {
    id: 'toledo-4-0-6-dv',
    nome: 'Toledo, código 4 + 0 + valor 6 (2 casas) + DV',
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
    // A spec chama de "código 5 + valor 5 (2 casas) + DV"; para somar 13 digitos
    // (2 + 5 + 5 + DV = 12) o formato Toledo tem um zero entre o codigo e o valor.
    id: 'toledo-5-0-5-dv',
    nome: 'Toledo, código 5 + 0 + valor 5 (2 casas) + DV',
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
    nome: 'Peso, código 6 + peso 5 (3 casas) + DV',
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

function mesmaConfiguracao(a: ConfiguracaoEtiqueta, b: ConfiguracaoEtiqueta): boolean {
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
 * prefixo (§3.4). Nao confere o digito verificador: e so um aviso.
 */
export function pareceEtiqueta(codigo: string, config: ConfiguracaoEtiqueta | null): boolean {
  if (!config || config.prefixo === '') {
    return false
  }
  return /^\d{13}$/.test(codigo) && codigo.startsWith(config.prefixo)
}

/**
 * Le a etiqueta: so com exatamente 13 digitos comecando pelo prefixo e, com
 * digito verificador, um EAN-13 valido. O codigo e lido sem zeros (000542 ->
 * 542) e a informacao e dividida por 10^casas (010000 com 3 casas -> 10).
 */
export function lerEtiqueta(codigo: string, config: ConfiguracaoEtiqueta): LeituraEtiqueta | null {
  if (totalDigitosEtiqueta(config) !== TAMANHO_ETIQUETA || !pareceEtiqueta(codigo, config)) {
    return null
  }
  if (config.digitoVerificador && !digitoVerificadorValido(codigo)) {
    return null
  }
  const inicioCodigo = config.prefixo.length
  const inicioInformacao = inicioCodigo + config.digitosCodigo + config.digitosPreenchimento
  const codigoProduto = Number(codigo.slice(inicioCodigo, inicioCodigo + config.digitosCodigo))
  const informacao = Number(codigo.slice(inicioInformacao, inicioInformacao + config.digitosInformacao))
  return {
    codigoProduto,
    tipo: config.tipoInformacao,
    valor: informacao / 10 ** config.casasDecimais,
  }
}
