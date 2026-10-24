/** "1 produto", "5 produtos": quantidade com o substantivo no plural correto. */
export function pluralizar(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`
}

/** Uma contagem com o substantivo no singular e no plural (ex.: produtos ligados a uma marca). */
export interface Contagem {
  quantidade: number
  singular: string
  plural: string
}

/**
 * Contagens em texto corrido, omitindo as zeradas: "2 subcategorias e 1 produto",
 * "1 submarca, 4 produtos e 2 fornecedores", "3 produtos". Vazio sem nenhuma.
 */
export function descreverVinculos(contagens: readonly Contagem[]): string {
  const partes = contagens
    .filter((contagem) => contagem.quantidade > 0)
    .map((contagem) => pluralizar(contagem.quantidade, contagem.singular, contagem.plural))
  if (partes.length <= 1) {
    return partes.join('')
  }
  return `${partes.slice(0, -1).join(', ')} e ${partes[partes.length - 1]}`
}

/** "categoria" -> "Categoria". */
export function comMaiuscula(texto: string): string {
  return texto.charAt(0).toLocaleUpperCase('pt-BR') + texto.slice(1)
}
