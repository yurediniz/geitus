import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { SeloSituacaoEstoque } from '@/features/products/estoque/SeloSituacaoEstoque'

describe('SeloSituacaoEstoque', () => {
  it('não mostra nada na situação normal ou sem controle', () => {
    const { container } = render(
      <>
        <SeloSituacaoEstoque situacao="NORMAL" />
        <SeloSituacaoEstoque situacao={null} saldo={-2} />
      </>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it('mostra "Estoque baixo" e "Sem estoque"', () => {
    render(
      <>
        <SeloSituacaoEstoque situacao="BAIXO" saldo={3} />
        <SeloSituacaoEstoque situacao="SEM_ESTOQUE" saldo={0} />
      </>,
    )

    expect(screen.getByText('Estoque baixo')).toBeInTheDocument()
    expect(screen.getByText('Sem estoque')).toBeInTheDocument()
  })

  it('com saldo negativo mostra "Negativo" no lugar de "Sem estoque"', () => {
    render(<SeloSituacaoEstoque situacao="SEM_ESTOQUE" saldo={-0.5} />)

    expect(screen.getByText('Negativo')).toBeInTheDocument()
    expect(screen.queryByText('Sem estoque')).not.toBeInTheDocument()
  })
})
