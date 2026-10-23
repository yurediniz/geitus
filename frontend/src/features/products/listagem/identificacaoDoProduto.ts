import type { Produto } from '@/types/produto'

/** Primeiro codigo de barras, com quantos mais existem ("789... (+2)"); null sem codigos. */
function primeiroCodigoDeBarras(produto: Produto): string | null {
  const [primeiro, ...demais] = produto.codigosBarras
  if (!primeiro) {
    return null
  }
  return demais.length > 0 ? `${primeiro.codigo} (+${demais.length})` : primeiro.codigo
}

/**
 * Linha secundaria da lista (spec B2 §6): "Nº 15 · Cód. 542 · SKU", com as
 * partes que existirem (o Nº sempre existe; o codigo sai sem zeros). Nos cards,
 * sem SKU, entra o primeiro codigo de barras no lugar.
 */
export function identificacaoDoProduto(
  produto: Produto,
  { codigoDeBarrasSemSku = false }: { codigoDeBarrasSemSku?: boolean } = {},
): string {
  const partes = [`Nº ${produto.numero}`]
  if (produto.codigo !== null) {
    partes.push(`Cód. ${produto.codigo}`)
  }
  const final = produto.sku ?? (codigoDeBarrasSemSku ? primeiroCodigoDeBarras(produto) : null)
  if (final) {
    partes.push(final)
  }
  return partes.join(' · ')
}
