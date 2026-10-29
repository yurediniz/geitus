import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { SeloSituacaoEstoque } from '@/features/products/estoque/SeloSituacaoEstoque'

describe('SeloSituacaoEstoque', () => {
  it('não mostra nada na situação regular ou sem controle', () => {
    const { container } = render(
      <>
        <SeloSituacaoEstoque situacao="REGULAR" />
        <SeloSituacaoEstoque situacao={null} />
      </>,
    )

    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    ['NEGATIVO', 'Negativo', 'bg-destructive'],
    ['ZERADO', 'Zerado', 'bg-destructive-soft'],
    ['BAIXO', 'Baixo', 'bg-warning'],
    ['REPOSICAO', 'Reposição', 'bg-warning-soft'],
    ['ALTO', 'Alto', 'bg-info-soft'],
  ] as const)('%s mostra "%s" com texto e ícone', (situacao, texto, classe) => {
    render(<SeloSituacaoEstoque situacao={situacao} />)

    const selo = screen.getByText(texto)
    expect(selo).toHaveClass(classe)
    expect(selo.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
