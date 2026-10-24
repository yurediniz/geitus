import { describe, it, expect } from 'vitest'

import { FilaDeLeituras } from '@/features/pdv/filaDeLeituras'

function adiado<T>() {
  let resolver: (valor: T) => void = () => undefined
  let rejeitar: (erro: unknown) => void = () => undefined
  const promessa = new Promise<T>((ok, falha) => {
    resolver = ok
    rejeitar = falha
  })
  return { promessa, resolver, rejeitar }
}

describe('FilaDeLeituras', () => {
  it('aplica os resultados na ordem das leituras, mesmo que cheguem fora de ordem', async () => {
    const fila = new FilaDeLeituras()
    const aplicados: string[] = []
    const primeira = adiado<string>()
    const segunda = adiado<string>()
    const terceira = adiado<string>()

    fila.enfileirar(primeira.promessa, (valor) => aplicados.push(valor), () => aplicados.push('erro'))
    fila.enfileirar(segunda.promessa, (valor) => aplicados.push(valor), () => aplicados.push('erro'))
    fila.enfileirar(terceira.promessa, (valor) => aplicados.push(valor), () => aplicados.push('erro'))

    terceira.resolver('C')
    segunda.rejeitar(new Error('404'))
    await Promise.resolve()
    expect(aplicados).toEqual([])

    primeira.resolver('A')
    await fila.ociosa()

    expect(aplicados).toEqual(['A', 'erro', 'C'])
  })

  it('um erro ao aplicar não trava a fila', async () => {
    const fila = new FilaDeLeituras()
    const aplicados: string[] = []

    fila.enfileirar(
      Promise.resolve('A'),
      () => {
        throw new Error('quebrou')
      },
      () => undefined,
    )
    fila.enfileirar(Promise.resolve('B'), (valor) => aplicados.push(valor), () => undefined)
    await fila.ociosa()

    expect(aplicados).toEqual(['B'])
  })
})
