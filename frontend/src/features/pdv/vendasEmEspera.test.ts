import { describe, it, expect } from 'vitest'

import { CARRINHO_VAZIO, type Carrinho } from '@/features/pdv/carrinho'
import {
  chaveDasVendasEmEspera,
  descricaoDaVendaEmEspera,
  guardarVendasEmEspera,
  lerVendasEmEspera,
  LIMITE_DE_VENDAS_EM_ESPERA,
  porEmEspera,
  tirarDaEspera,
  type VendaEmEspera,
} from '@/features/pdv/vendasEmEspera'
import { RACAO } from '@/test/fixturesPdv'

const CARRINHO: Carrinho = {
  ...CARRINHO_VAZIO,
  linhas: [{ id: 'l-1', produto: RACAO, embalagemId: null, quantidade: 3, codigoLido: '542*3', etiqueta: false, desconto: null }],
}
const AGORA = '2026-10-24T18:02:00-03:00'

function espera(id: string): VendaEmEspera {
  return { id, criadaEm: AGORA, itens: 1, total: 74.7, carrinho: CARRINHO }
}

describe('vendasEmEspera', () => {
  it('a chave é a do carrinho com ".espera"', () => {
    expect(chaveDasVendasEmEspera(3, 7)).toBe('geitus.pdv.3.7.espera')
  })

  it('põe em espera com a hora, a quantidade de itens e o total', () => {
    expect(porEmEspera([], CARRINHO, 74.7, AGORA, 'v-1')).toEqual({
      ok: true,
      vendas: [{ id: 'v-1', criadaEm: AGORA, itens: 1, total: 74.7, carrinho: CARRINHO }],
    })
  })

  it('no máximo 5', () => {
    const cinco = Array.from({ length: LIMITE_DE_VENDAS_EM_ESPERA }, (_, indice) => espera(`v-${indice}`))
    expect(porEmEspera(cinco, CARRINHO, 10, AGORA, 'v-x')).toEqual({
      ok: false,
      erro: 'Limite de 5 vendas em espera. Retome ou descarte uma (F7).',
    })
  })

  it('descreve a venda pelo cliente ou pelo primeiro item', () => {
    const tres: Carrinho = {
      ...CARRINHO,
      linhas: [CARRINHO.linhas[0], { ...CARRINHO.linhas[0], id: 'l-2' }, { ...CARRINHO.linhas[0], id: 'l-3' }],
    }
    expect(descricaoDaVendaEmEspera(espera('a'))).toBe('Ração X 1kg')
    expect(descricaoDaVendaEmEspera({ ...espera('a'), itens: 3, carrinho: tres })).toBe('Ração X 1kg e mais 2')
    expect(
      descricaoDaVendaEmEspera({ ...espera('a'), itens: 3, carrinho: { ...tres, cliente: { id: 'c', nome: 'Maria Souza' } } }),
    ).toBe('Maria Souza · 3 itens')
    expect(
      descricaoDaVendaEmEspera({ ...espera('a'), carrinho: { ...CARRINHO, cliente: { id: 'c', nome: 'Maria Souza' } } }),
    ).toBe('Maria Souza · 1 item')
  })

  it('tira da espera pelo id', () => {
    expect(tirarDaEspera([espera('a'), espera('b')], 'a').map((venda) => venda.id)).toEqual(['b'])
  })

  it('ida e volta no navegador; corrompido, de outra versão ou de outro usuário começa vazio', () => {
    const texto = guardarVendasEmEspera([espera('a')], 3, 7)
    expect(lerVendasEmEspera(texto, 3, 7)).toEqual([espera('a')])
    expect(lerVendasEmEspera('{x', 3, 7)).toEqual([])
    expect(lerVendasEmEspera(null, 3, 7)).toEqual([])
    expect(lerVendasEmEspera(texto, 3, 8)).toEqual([])
    expect(lerVendasEmEspera(texto.replace('"versao":1', '"versao":2'), 3, 7)).toEqual([])
    expect(
      lerVendasEmEspera(JSON.stringify({ versao: 1, empresaId: 3, usuarioId: 7, vendas: [{ id: 'a', carrinho: {} }] }), 3, 7),
    ).toEqual([])
  })
})
