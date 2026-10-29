/**
 * Os valores validos entre os recebidos (ex.: um parametro repetido da URL),
 * sem repetidos e na ordem de `validos`; os desconhecidos somem.
 */
export function algunsDe<T extends string>(validos: readonly T[], valores: readonly string[]): T[] {
  return validos.filter((item) => valores.includes(item))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Os UUIDs validos entre os recebidos (ex.: a categoria repetida na URL), sem
 * repetidos, na ordem em que chegaram e no maximo `maximo`; o resto some.
 */
export function uuidsUnicos(valores: readonly string[], maximo: number): string[] {
  // Em minusculas, como a API devolve: "ABC…" e "abc…" contam uma vez e casam com a arvore.
  return [...new Set(valores.filter((valor) => UUID.test(valor)).map((valor) => valor.toLowerCase()))].slice(0, maximo)
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
