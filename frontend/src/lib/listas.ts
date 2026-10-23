/** O valor, se for um dos valores validos (ex.: um parametro da URL); senao null. */
export function umDe<T extends string>(validos: readonly T[], valor: string | null | undefined): T | null {
  return validos.find((item) => item === valor) ?? null
}
