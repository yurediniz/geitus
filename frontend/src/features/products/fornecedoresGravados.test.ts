import { describe, it, expect } from 'vitest'

import { mesclarFornecedores, type FornecedoresGravados } from '@/features/products/fornecedoresGravados'

const SUL = { id: 'sul', numero: 1, nome: 'Distribuidora Sul', ativo: true }
const NORTE = { id: 'norte', numero: 2, nome: 'Atacadão Norte', ativo: true }
const LESTE = { id: 'leste', numero: 3, nome: 'Leste Pet', ativo: true }

function gravados(lista: FornecedoresGravados['lista'], ultimaCompraId: string | null = null): FornecedoresGravados {
  return { lista, ultimaCompraId }
}

describe('mesclarFornecedores', () => {
  it('a compra com fornecedor novo entra na lista e vira o da ultima compra, mantendo o que o usuario mudou', () => {
    const anterior = gravados([SUL], 'sul')
    const gravado = gravados([NORTE, SUL], 'norte')
    // Na tela, o usuario ja tinha adicionado LESTE.
    const naTela = gravados([SUL, LESTE], 'sul')

    expect(mesclarFornecedores(anterior, gravado, naTela)).toEqual(gravados([SUL, LESTE, NORTE], 'norte'))
  })

  it('o da ultima compra escolhido pelo usuario fica', () => {
    const anterior = gravados([SUL, LESTE], 'sul')
    const gravado = gravados([NORTE, SUL, LESTE], 'norte')
    const naTela = gravados([SUL, LESTE], 'leste')

    expect(mesclarFornecedores(anterior, gravado, naTela)).toEqual(gravados([SUL, LESTE, NORTE], 'leste'))
  })

  it('o desligado no banco sai da lista da tela e limpa a ultima compra se era ele (Review Focus 1)', () => {
    const anterior = gravados([SUL, LESTE], 'sul')
    const gravado = gravados([LESTE], null)
    const naTela = gravados([SUL, LESTE], 'sul')

    expect(mesclarFornecedores(anterior, gravado, naTela)).toEqual(gravados([LESTE], null))
  })

  it('o fornecedor que o usuario tirou da tela nao volta', () => {
    const anterior = gravados([SUL, LESTE], 'sul')
    const gravado = gravados([NORTE, SUL, LESTE], 'norte')
    const naTela = gravados([SUL], 'sul')

    expect(mesclarFornecedores(anterior, gravado, naTela)).toEqual(gravados([SUL, NORTE], 'norte'))
  })
})
