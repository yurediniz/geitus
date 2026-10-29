import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import { FiltroMultiplo } from '@/components/ui/filtro-multiplo'

type Cor = 'azul' | 'verde' | 'roxo'

const OPCOES = [
  { valor: 'azul', rotulo: 'Azul' },
  { valor: 'verde', rotulo: 'Verde' },
  { valor: 'roxo', rotulo: 'Roxo' },
] as const

function Montado({ iniciais = [], aoMudar = vi.fn() }: { iniciais?: Cor[]; aoMudar?: (valores: Cor[]) => void }) {
  const [valores, setValores] = useState<Cor[]>(iniciais)
  return (
    <>
      <span id="rotulo">Cor</span>
      <FiltroMultiplo
        idRotulo="rotulo"
        opcoes={OPCOES}
        valores={valores}
        onChange={(novos) => {
          aoMudar(novos)
          setValores(novos)
        }}
        rotuloTodos="Todas"
      />
    </>
  )
}

function abrir(nome: string) {
  fireEvent.click(screen.getByRole('button', { name: nome }))
  return screen.getByRole('group', { name: 'Cor' })
}

describe('FiltroMultiplo', () => {
  it('sem nada marcado mostra "Todas"; marcar não fecha o painel e devolve na ordem das opções', () => {
    const aoMudar = vi.fn()
    render(<Montado aoMudar={aoMudar} />)

    const painel = abrir('Cor Todas')
    fireEvent.click(within(painel).getByRole('checkbox', { name: 'Roxo' }))
    fireEvent.click(within(screen.getByRole('group', { name: 'Cor' })).getByRole('checkbox', { name: 'Azul' }))

    expect(aoMudar).toHaveBeenLastCalledWith(['azul', 'roxo'])
    expect(screen.getByRole('group', { name: 'Cor' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cor Azul +1' })).toBeInTheDocument()
  })

  it('uma marcada mostra o rótulo dela; desmarcar tira só aquela', () => {
    const aoMudar = vi.fn()
    render(<Montado iniciais={['verde', 'roxo']} aoMudar={aoMudar} />)

    const painel = abrir('Cor Verde +1')
    expect(within(painel).getByRole('checkbox', { name: 'Verde' })).toBeChecked()
    fireEvent.click(within(painel).getByRole('checkbox', { name: 'Roxo' }))

    expect(aoMudar).toHaveBeenLastCalledWith(['verde'])
    expect(screen.getByRole('button', { name: 'Cor Verde' })).toBeInTheDocument()
  })

  it('"Limpar" fica desabilitado sem nada marcado e desmarca tudo', () => {
    const aoMudar = vi.fn()
    render(<Montado iniciais={['azul']} aoMudar={aoMudar} />)

    const painel = abrir('Cor Azul')
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))

    expect(aoMudar).toHaveBeenLastCalledWith([])
    // O botao fica desabilitado: o foco vai para a primeira caixa, nao para o body.
    expect(within(painel).getAllByRole('checkbox')[0]).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Limpar' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cor Todas' })).toBeInTheDocument()
  })

  it('as setas andam entre as caixas (com volta) e Esc fecha', () => {
    render(<Montado />)

    const painel = abrir('Cor Todas')
    const [azul, verde, roxo] = within(painel).getAllByRole('checkbox')
    azul.focus()
    fireEvent.keyDown(azul, { key: 'ArrowDown' })
    expect(verde).toHaveFocus()
    fireEvent.keyDown(verde, { key: 'ArrowUp' })
    fireEvent.keyDown(azul, { key: 'ArrowUp' })
    expect(roxo).toHaveFocus()

    fireEvent.keyDown(roxo, { key: 'Escape' })
    expect(screen.queryByRole('group', { name: 'Cor' })).not.toBeInTheDocument()
  })
})
