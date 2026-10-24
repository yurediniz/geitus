import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import { ResumoDoFechamento } from '@/features/cash-register/ResumoDoFechamento'
import { movimentoDeTeste, sessaoDeTeste } from '@/test/fixturesCaixa'

describe('ResumoDoFechamento', () => {
  it('soma suprimentos e sangrias quando todos os valores estão visíveis', () => {
    render(<ResumoDoFechamento sessao={sessaoDeTeste()} />)

    expect(screen.getByText('Suprimentos').nextSibling).toHaveTextContent('+ R$ 170,00')
    expect(screen.getByText('Sangrias').nextSibling).toHaveTextContent('− R$ 0,00')
  })

  it('com algum valor oculto, não mostra os totais (nunca soma valor nulo)', () => {
    const sessao = sessaoDeTeste({
      movimentos: [movimentoDeTeste({ id: 'oculto', tipo: 'SANGRIA', valor: null, motivo: 'Cofre' }), movimentoDeTeste()],
    })
    render(<ResumoDoFechamento sessao={sessao} />)

    expect(screen.queryByText('Suprimentos')).not.toBeInTheDocument()
    expect(screen.queryByText('Sangrias')).not.toBeInTheDocument()
    expect(screen.getByText('Esperado na gaveta').nextSibling).toHaveTextContent('R$ 320,00')
  })

  it('modo cego sem esperado: só o aviso', () => {
    render(<ResumoDoFechamento sessao={sessaoDeTeste({ fechamentoCego: true, dinheiroNaGaveta: null })} />)

    expect(screen.getByText('Fechamento cego: o valor esperado aparece depois da contagem.')).toBeInTheDocument()
    expect(screen.queryByText('Fundo de troco')).not.toBeInTheDocument()
  })

  it('com vendas em dinheiro, a linha entra na conta do esperado', () => {
    const sessao = sessaoDeTeste({
      dinheiroNaGaveta: 360,
      movimentos: [
        movimentoDeTeste({ id: 'rec', tipo: 'RECEBIMENTO', valor: 50, vendaNumero: 128 }),
        movimentoDeTeste({ id: 'est', tipo: 'ESTORNO', valor: 10, vendaNumero: 127 }),
        movimentoDeTeste({ id: 'pix', tipo: 'RECEBIMENTO', forma: 'PIX', valor: 30, vendaNumero: 129 }),
        movimentoDeTeste(),
      ],
    })
    render(<ResumoDoFechamento sessao={sessao} />)

    // O PIX não entra na gaveta.
    expect(screen.getByText('Vendas em dinheiro').nextSibling).toHaveTextContent('+ R$ 40,00')
  })

  it('com mais de uma forma, mostra a tabela por forma', () => {
    const sessao = sessaoDeTeste({
      status: 'FECHADA',
      valorEsperado: 320,
      valorContado: 320,
      diferenca: 0,
      justificativa: 'Comprovante perdido',
      porForma: [
        { forma: 'DINHEIRO', esperado: 320, contado: 320, diferenca: 0 },
        { forma: 'DEBITO', esperado: 120, contado: 118, diferenca: -2 },
      ],
    })
    render(<ResumoDoFechamento sessao={sessao} />)

    const tabela = screen.getByRole('table', { name: 'Conferência por forma de pagamento' })
    const linhas = within(tabela).getAllByRole('row')
    expect(linhas.map((linha) => linha.textContent?.replace(/\s/g, ' '))).toEqual([
      'FormaEsperadoContadoDiferença',
      'DinheiroR$ 320,00R$ 320,00Confere',
      'DébitoR$ 120,00R$ 118,00Falta de R$ 2,00',
    ])
  })
})
