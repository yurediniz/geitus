/**
 * Os valores validos entre os recebidos (ex.: um parametro repetido da URL),
 * sem repetidos e na ordem de `validos`; os desconhecidos somem.
 */
export function algunsDe<T extends string>(validos: readonly T[], valores: readonly string[]): T[] {
  return validos.filter((item) => valores.includes(item))
}

/** Mesmo valor; listas comparadas pelo conteudo, na ordem (os filtros as guardam ja ordenadas). */
export function mesmoValor(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, indice) => item === b[indice])
  }
  return a === b
}

/** O valor, se for um dos valores validos (ex.: um parametro da URL); senao null. */
export function umDe<T extends string>(validos: readonly T[], valor: string | null | undefined): T | null {
  return validos.find((item) => item === valor) ?? null
}
