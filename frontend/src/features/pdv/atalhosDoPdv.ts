/**
 * Atalhos do PDV (spec `docs/modules/pdv.md` §6.2). O campo "Código ou nome"
 * tem sempre o foco: as teclas de funcao valem sempre; `+`, `−` e `Del` so
 * com o campo vazio, porque fazem parte do texto lido (`542*-1`).
 */

export type AcaoDoPdv =
  | 'BUSCA'
  | 'CLIENTE'
  | 'DESCONTO_ITEM'
  | 'DESCONTO_TOTAL'
  | 'POR_EM_ESPERA'
  | 'VENDAS_EM_ESPERA'
  | 'VENDAS_DO_CAIXA'
  | 'PAGAMENTO'
  | 'IMPRIMIR'
  | 'ANTERIOR'
  | 'PROXIMA'
  | 'MAIS'
  | 'MENOS'
  | 'REMOVER'

export interface TeclaPressionada {
  key: string
  shiftKey: boolean
  ctrlKey: boolean
  altKey: boolean
  metaKey: boolean
}

const TECLAS_DE_FUNCAO: Readonly<Record<string, AcaoDoPdv>> = {
  F2: 'BUSCA',
  F3: 'CLIENTE',
  F4: 'DESCONTO_ITEM',
  F6: 'POR_EM_ESPERA',
  F7: 'VENDAS_EM_ESPERA',
  F8: 'VENDAS_DO_CAIXA',
  F9: 'IMPRIMIR',
  F10: 'PAGAMENTO',
  ArrowUp: 'ANTERIOR',
  ArrowDown: 'PROXIMA',
}

const COM_O_CAMPO_VAZIO: Readonly<Record<string, AcaoDoPdv>> = {
  '+': 'MAIS',
  '-': 'MENOS',
  Delete: 'REMOVER',
}

/** A acao da tecla, ou null quando a tecla segue para o campo ou para o navegador. */
export function acaoDoAtalho(tecla: TeclaPressionada, campoVazio: boolean): AcaoDoPdv | null {
  if (tecla.ctrlKey || tecla.altKey || tecla.metaKey) {
    return null
  }
  if (tecla.key === 'F4' && tecla.shiftKey) {
    return 'DESCONTO_TOTAL'
  }
  const funcao = TECLAS_DE_FUNCAO[tecla.key]
  if (funcao) {
    return funcao
  }
  return campoVazio ? (COM_O_CAMPO_VAZIO[tecla.key] ?? null) : null
}

/**
 * Texto lido que vai para a resolucao do codigo, com a mesma regra do backend
 * (`InterpretadorDeCodigo`): todo texto sem espaco (inclusive Code128
 * alfanumerico, como "RP0012A"). Texto com espaco e busca por nome.
 */
export function ehCodigo(texto: string): boolean {
  const aparado = texto.trim()
  return aparado !== '' && !/\s/.test(aparado)
}

/** Sem nenhum digito ("ração"): se o codigo nao existir, o texto vira busca por nome. */
export function semDigitos(texto: string): boolean {
  return !/\d/.test(texto)
}
