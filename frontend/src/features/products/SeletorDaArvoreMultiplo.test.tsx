import { useState } from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'

import { SeletorCategoriaMultiplo } from '@/features/products/SeletorCategoria'
import { categoria } from '@/test/fixturesProduto'
import type { Categoria } from '@/types/catalogo'

const RACAO = categoria('c-racao', 'Ração', null, 'Ração')
const SACHE = categoria('c-sache', 'Sachê', 'c-racao', 'Ração › Sachê')
const PETISCOS = categoria('c-petiscos', 'Petiscos', null, 'Petiscos')
const INATIVA: Categoria = { ...categoria('c-velha', 'Velha', null, 'Velha'), ativo: false, selecionavel: false }

function Montado({
  iniciais = [],
  categorias = [RACAO, SACHE, PETISCOS, INATIVA],
  maximo = 20,
  aoMudar = vi.fn(),
}: {
  iniciais?: string[]
  categorias?: Categoria[]
  maximo?: number
  aoMudar?: (ids: string[]) => void
}) {
  const [valores, setValores] = useState<string[]>(iniciais)
  return (
    <>
      <span id="rotulo">Categoria</span>
      <SeletorCategoriaMultiplo
        idRotulo="rotulo"
        categorias={categorias}
        valores={valores}
        onChange={(ids) => {
          setValores(ids)
          aoMudar(ids)
        }}
        maximo={maximo}
        incluirInativas
        rotuloTodos="Todas"
      />
    </>
  )
}

function abrir(nome: string | RegExp): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: nome }))
  return screen.getByRole('group', { name: 'Categoria' })
}

describe('SeletorCategoriaMultiplo', () => {
  it('marca e desmarca varias categorias sem fechar; o botao mostra "Ração +1" e o title lista todas', () => {
    const aoMudar = vi.fn()
    render(<Montado aoMudar={aoMudar} />)

    const painel = abrir('Categoria Todas')
    fireEvent.click(within(painel).getByRole('checkbox', { name: 'Petiscos' }))
    fireEvent.click(within(painel).getByRole('checkbox', { name: 'Ração' }))

    // Na ordem da arvore, nao na ordem do clique.
    expect(aoMudar).toHaveBeenLastCalledWith(['c-racao', 'c-petiscos'])
    expect(screen.getByRole('group', { name: 'Categoria' })).toBeInTheDocument()
    const gatilho = screen.getByRole('button', { name: 'Categoria Ração +1' })
    expect(gatilho).toHaveAttribute('title', 'Ração, Petiscos')

    fireEvent.click(within(painel).getByRole('checkbox', { name: 'Ração' }))
    expect(aoMudar).toHaveBeenLastCalledWith(['c-petiscos'])
    expect(screen.getByRole('button', { name: 'Categoria Petiscos' })).toHaveAttribute('title', 'Petiscos')
  })

  it('a busca filtra pelo caminho sem acento e a inativa aparece marcada como tal', () => {
    render(<Montado />)

    const painel = abrir('Categoria Todas')
    expect(within(painel).getByRole('checkbox', { name: 'Velha (inativa)' })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar categoria' }), { target: { value: 'sache' } })

    expect(within(painel).getAllByRole('checkbox').map((caixa) => caixa.closest('label')?.textContent)).toEqual([
      'Ração › Sachê',
    ])
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar categoria' }), { target: { value: 'xyz' } })
    expect(within(painel).getByText('Nenhuma categoria encontrada para "xyz".')).toBeInTheDocument()
  })

  it('"Limpar" fica desabilitado sem nada marcado, desmarca tudo e devolve o foco a busca', () => {
    const aoMudar = vi.fn()
    render(<Montado iniciais={['c-sache']} aoMudar={aoMudar} />)

    abrir('Categoria Sachê')
    expect(screen.getByText('Cada categoria inclui as subcategorias.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))

    expect(aoMudar).toHaveBeenLastCalledWith([])
    expect(screen.getByRole('button', { name: 'Limpar' })).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Buscar categoria' })).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Categoria Todas' })).toBeInTheDocument()
  })

  it('no limite, as caixas nao marcadas ficam desabilitadas com o aviso', () => {
    render(<Montado iniciais={['c-racao', 'c-sache']} maximo={2} />)

    const painel = abrir('Categoria Ração +1')
    expect(within(painel).getByRole('checkbox', { name: 'Petiscos' })).toBeDisabled()
    expect(within(painel).getByRole('checkbox', { name: 'Ração' })).toBeEnabled()
    expect(screen.getByText(/Até 2 categorias\./)).toBeInTheDocument()

    fireEvent.click(within(painel).getByRole('checkbox', { name: 'Ração' }))
    expect(within(painel).getByRole('checkbox', { name: 'Petiscos' })).toBeEnabled()
    expect(screen.queryByText(/Até 2 categorias\./)).not.toBeInTheDocument()
  })

  it('seta para baixo na busca vai para a primeira caixa; as setas andam com volta', () => {
    render(<Montado />)

    const painel = abrir('Categoria Todas')
    const busca = screen.getByRole('textbox', { name: 'Buscar categoria' })
    const [racao, , , velha] = within(painel).getAllByRole('checkbox')
    fireEvent.keyDown(busca, { key: 'ArrowDown' })
    expect(racao).toHaveFocus()
    fireEvent.keyDown(racao, { key: 'ArrowUp' })
    expect(velha).toHaveFocus()
  })

  it('ids que a lista nao conhece (as categorias nao carregaram) contam no texto', () => {
    render(<Montado iniciais={['x-1', 'x-2']} categorias={[]} />)

    expect(screen.getByRole('button', { name: 'Categoria 2 categorias selecionadas' })).toBeInTheDocument()
  })
})
