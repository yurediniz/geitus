import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

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
})
