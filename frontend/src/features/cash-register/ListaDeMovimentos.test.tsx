import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { ListaDeMovimentos } from '@/features/cash-register/ListaDeMovimentos'
import { movimentoDeTeste } from '@/test/fixturesCaixa'

describe('ListaDeMovimentos', () => {
  it('recebimento e estorno aparecem com o nº da venda, a forma e o sinal', () => {
    render(
      <ListaDeMovimentos
        movimentos={[
          movimentoDeTeste({ id: 'rec', tipo: 'RECEBIMENTO', forma: 'DEBITO', valor: 74.7, vendaNumero: 128 }),
          movimentoDeTeste({ id: 'est', tipo: 'ESTORNO', forma: 'DINHEIRO', valor: 20, vendaNumero: 127 }),
        ]}
      />,
    )

    const [recebimento, estorno] = within(screen.getByRole('list', { name: 'Movimentos do caixa' })).getAllByRole('listitem')
    expect(recebimento).toHaveTextContent('Recebimento')
    expect(recebimento).toHaveTextContent('Venda nº 128 · Débito')
    expect(recebimento).toHaveTextContent('+ R$ 74,70')
    expect(estorno).toHaveTextContent('Estorno')
    expect(estorno).toHaveTextContent('Venda nº 127 · Dinheiro')
    expect(estorno).toHaveTextContent('− R$ 20,00')
  })

  it('a devolucao de itens aparece com o nº da venda, a forma e o sinal de saida', () => {
    render(
      <ListaDeMovimentos
        movimentos={[movimentoDeTeste({ id: 'dev', tipo: 'DEVOLUCAO', forma: 'DINHEIRO', valor: 29.9, vendaNumero: 8 })]}
      />,
    )

    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent('Devolução')
    expect(item).toHaveTextContent('Venda nº 8 · Dinheiro')
    expect(item).toHaveTextContent('− R$ 29,90')
  })

  it('no modo cego, o recebimento sai sem valor', () => {
    render(
      <ListaDeMovimentos
        movimentos={[movimentoDeTeste({ id: 'rec', tipo: 'RECEBIMENTO', forma: 'PIX', valor: null, vendaNumero: 130 })]}
      />,
    )

    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent('Venda nº 130 · PIX')
    expect(item).toHaveTextContent('Valor no fechamento')
    expect(item).not.toHaveTextContent(/R\$/)
  })
})
