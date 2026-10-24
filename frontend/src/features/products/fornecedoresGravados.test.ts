import { describe, it, expect } from 'vitest'

import {
  aplicarCompra,
  fornecedorParaACompra,
  mesclarFornecedores,
  type FornecedoresGravados,
} from '@/features/products/fornecedoresGravados'
import { produtoAtivo } from '@/test/fixturesProduto'

const SUL = { id: 'sul', numero: 1, nome: 'Distribuidora Sul', ativo: true }
const NORTE = { id: 'norte', numero: 2, nome: 'Atacadão Norte', ativo: true }
const LESTE = { id: 'leste', numero: 3, nome: 'Leste Pet', ativo: true }

function gravados(lista: FornecedoresGravados['lista'], ultimaCompraId: string | null = null): FornecedoresGravados {
  return { lista, ultimaCompraId }
}

describe('fornecedorParaACompra', () => {
  it('traz o da ultima compra quando ele esta ativo na lista', () => {
    expect(fornecedorParaACompra({ ...produtoAtivo, fornecedores: [SUL], fornecedorUltimaCompra: SUL })).toEqual(SUL)
  })

  it('o ultimo inativo nao e oferecido', () => {
    const inativo = { ...SUL, ativo: false }
    expect(fornecedorParaACompra({ ...produtoAtivo, fornecedores: [inativo], fornecedorUltimaCompra: SUL })).toBeNull()
  })

  it('o ultimo fora da lista nao e oferecido; sem ultimo, nada', () => {
    expect(fornecedorParaACompra({ ...produtoAtivo, fornecedores: [NORTE], fornecedorUltimaCompra: SUL })).toBeNull()
    expect(fornecedorParaACompra({ ...produtoAtivo, fornecedores: [SUL], fornecedorUltimaCompra: null })).toBeNull()
  })
})

describe('aplicarCompra', () => {
  it('poe o comprado na lista (uma vez so) e como o da ultima compra', () => {
    expect(aplicarCompra(gravados([SUL], 'sul'), NORTE)).toEqual(gravados([SUL, NORTE], 'norte'))
    expect(aplicarCompra(gravados([SUL, NORTE], 'sul'), NORTE)).toEqual(gravados([SUL, NORTE], 'norte'))
    // Tirado da tela e comprado de novo: volta.
    expect(aplicarCompra(gravados([], null), SUL)).toEqual(gravados([SUL], 'sul'))
  })
})

describe('mesclarFornecedores', () => {
  it('a compra com fornecedor novo entra na lista e vira o da ultima compra, mantendo o que o usuario mudou', () => {
    const anterior = gravados([SUL], 'sul')
    const gravado = gravados([NORTE, SUL], 'norte')
    // Na tela, o usuario ja tinha adicionado LESTE.
    const naTela = gravados([SUL, LESTE], 'sul')

    expect(mesclarFornecedores(anterior, gravado, naTela)).toEqual(gravados([SUL, LESTE, NORTE], 'norte'))
  })

  it('a compra nova define o da ultima compra, mesmo com outro escolhido na tela', () => {
    const anterior = gravados([SUL, LESTE], 'sul')
    const gravado = gravados([NORTE, SUL, LESTE], 'norte')
    const naTela = gravados([SUL, LESTE], 'leste')

    expect(mesclarFornecedores(anterior, gravado, naTela)).toEqual(gravados([SUL, LESTE, NORTE], 'norte'))
  })

  it('sem mudanca da ultima compra no banco, fica a escolha da tela', () => {
    const anterior = gravados([SUL, LESTE], 'sul')
    const gravado = gravados([NORTE, SUL, LESTE], 'sul')
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
