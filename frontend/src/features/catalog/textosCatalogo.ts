/** "1 produto", "5 produtos": quantidade com o substantivo no plural correto. */
export function pluralizar(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`
}

/**
 * Vinculos que impedem excluir uma categoria, em texto corrido e omitindo a
 * parte zerada: "2 subcategorias e 1 produto", "3 produtos". Vazio sem vinculos.
 */
export function descreverVinculos(quantidadeSubcategorias: number, quantidadeProdutos: number): string {
  const partes: string[] = []
  if (quantidadeSubcategorias > 0) {
    partes.push(pluralizar(quantidadeSubcategorias, 'subcategoria', 'subcategorias'))
  }
  if (quantidadeProdutos > 0) {
    partes.push(pluralizar(quantidadeProdutos, 'produto', 'produtos'))
  }
  return partes.join(' e ')
}
