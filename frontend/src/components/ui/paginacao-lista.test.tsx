import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { PaginacaoLista } from '@/components/ui/paginacao-lista'

function renderPaginacao(pagina: number, total = 60, tamanho = 25) {
  const aoMudar = vi.fn()
  const resultado = render(<PaginacaoLista pagina={pagina} total={total} tamanho={tamanho} aoMudar={aoMudar} />)
  return { aoMudar, ...resultado }
}

function campoIrPara(): HTMLElement {
  return screen.getByRole('spinbutton', { name: /ir para a página/i })
}

describe('PaginacaoLista', () => {
  it('mostra o intervalo, o total e a pagina atual', () => {
    renderPaginacao(1)

    expect(screen.getByText('1–25 de 60')).toBeInTheDocument()
    expect(screen.getByText('Página 1 de 3')).toBeInTheDocument()
  })

  it('formata os numeros em pt-BR e limita o fim ao total na ultima pagina', () => {
    renderPaginacao(50, 1240)

    expect(screen.getByText('1.226–1.240 de 1.240')).toBeInTheDocument()
    expect(screen.getByText('Página 50 de 50')).toBeInTheDocument()
  })

  it('Anterior fica desabilitado na primeira pagina', () => {
    const { aoMudar } = renderPaginacao(1)

    expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /próxima/i }))
    expect(aoMudar).toHaveBeenCalledWith(2)
  })

  it('Proxima fica desabilitado na ultima pagina', () => {
    const { aoMudar } = renderPaginacao(3)

    expect(screen.getByRole('button', { name: /próxima/i })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: /anterior/i }))
    expect(aoMudar).toHaveBeenCalledWith(2)
  })

  it('o campo vai direto para a pagina digitada', () => {
    const { aoMudar } = renderPaginacao(1)

    fireEvent.change(campoIrPara(), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Ir' }))

    expect(aoMudar).toHaveBeenCalledWith(3)
  })

  it.each([
    ['99', 3],
    ['0', 1],
    ['-4', 1],
  ])('o campo limita a pagina a 1..ultima (%s vira %i)', (digitado, esperado) => {
    const { aoMudar } = renderPaginacao(2)
    const campo = campoIrPara()

    fireEvent.change(campo, { target: { value: digitado } })
    fireEvent.submit(campo.closest('form') as HTMLFormElement)

    expect(aoMudar).toHaveBeenCalledWith(esperado)
    expect(campo).toHaveValue(esperado)
  })

  it('ir para a pagina atual ou valor vazio nao chama aoMudar', () => {
    const { aoMudar } = renderPaginacao(2)
    const campo = campoIrPara()

    fireEvent.submit(campo.closest('form') as HTMLFormElement)
    fireEvent.change(campo, { target: { value: '' } })
    fireEvent.submit(campo.closest('form') as HTMLFormElement)

    expect(aoMudar).not.toHaveBeenCalled()
    expect(campo).toHaveValue(2)
  })

  it('o campo acompanha a pagina vinda de fora', () => {
    const { rerender } = renderPaginacao(1)

    rerender(<PaginacaoLista pagina={3} total={60} tamanho={25} aoMudar={vi.fn()} />)

    expect(campoIrPara()).toHaveValue(3)
  })

  it('com uma pagina so, mostra o total sem os controles', () => {
    renderPaginacao(1, 3)

    expect(screen.getByText('1–3 de 3')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /próxima/i })).not.toBeInTheDocument()
  })
})
