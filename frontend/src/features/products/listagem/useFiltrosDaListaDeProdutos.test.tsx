import { describe, it, expect } from 'vitest'
import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { useFiltrosDaListaDeProdutos } from '@/features/products/listagem/useFiltrosDaListaDeProdutos'

const CATEGORIA = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f'

type Retorno = ReturnType<typeof useFiltrosDaListaDeProdutos>

/** Monta o hook dentro de um roteador em memoria e devolve o ultimo retorno. */
function montar(entrada = '/produtos') {
  const atual: { valor: Retorno | null } = { valor: null }
  function Sonda() {
    atual.valor = useFiltrosDaListaDeProdutos()
    return null
  }
  const router = createMemoryRouter([{ path: '/produtos', element: <Sonda /> }], { initialEntries: [entrada] })
  render(<RouterProvider router={router} />)
  const hook = () => {
    if (!atual.valor) {
      throw new Error('hook nao montado')
    }
    return atual.valor
  }
  return { router, hook }
}

describe('useFiltrosDaListaDeProdutos', () => {
  it('le os padroes sem parametros', () => {
    const { hook } = montar()

    expect(hook().filtros).toEqual({
      busca: '',
      status: 'ativos',
      categoria: null,
      estoque: null,
      promocao: false,
      ordem: 'nome',
      pagina: 1,
    })
    expect(hook().temFiltroAtivo).toBe(false)
  })

  it('le todos os parametros da URL', () => {
    const { hook } = montar(
      `/produtos?busca=arroz&status=todos&categoria=${CATEGORIA}&estoque=sem&promocao=1&ordem=-margem&pagina=3`,
    )

    expect(hook().filtros).toEqual({
      busca: 'arroz',
      status: 'todos',
      categoria: CATEGORIA,
      estoque: 'sem',
      promocao: true,
      ordem: '-margem',
      pagina: 3,
    })
    expect(hook().temFiltroAtivo).toBe(true)
  })

  it('escreve so os valores diferentes do padrao', () => {
    const { router, hook } = montar()

    act(() => hook().alterar({ status: 'ativos', estoque: 'baixo', ordem: 'nome', promocao: true }))

    expect(router.state.location.search).toBe('?estoque=baixo&promocao=1')
  })

  it('mudar um filtro volta para a pagina 1', () => {
    const { router, hook } = montar('/produtos?ordem=preco&pagina=4')

    act(() => hook().alterar({ status: 'inativos' }))

    expect(hook().filtros.pagina).toBe(1)
    expect(router.state.location.search).toBe('?status=inativos&ordem=preco')
  })

  it('mudar a pagina mantem os filtros e cria entrada no historico', () => {
    const { router, hook } = montar('/produtos?busca=arroz&estoque=sem')

    act(() => hook().alterar({ pagina: 2 }))

    expect(router.state.location.search).toBe('?busca=arroz&estoque=sem&pagina=2')
    expect(router.state.historyAction).toBe('PUSH')
  })

  it('a busca substitui a entrada do historico (e chega aparada)', () => {
    const { router, hook } = montar('/produtos?pagina=2')

    act(() => hook().alterar({ busca: '  arroz  ' }))

    expect(router.state.location.search).toBe('?busca=arroz')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('a mudanca de filtro (fora a busca) cria entrada no historico', () => {
    const { router, hook } = montar()

    act(() => hook().alterar({ promocao: true }))

    expect(router.state.historyAction).toBe('PUSH')
  })

  it('pode substituir a entrada quando pedido (correcao da pagina)', () => {
    const { router, hook } = montar('/produtos?pagina=9')

    act(() => hook().alterar({ pagina: 2 }, { substituir: true }))

    expect(router.state.location.search).toBe('?pagina=2')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('alterar sem mudanca real nao mexe na URL', () => {
    const { router, hook } = montar('/produtos?busca=arroz&pagina=3')

    act(() => hook().alterar({ busca: 'arroz ' }))

    expect(router.state.location.search).toBe('?busca=arroz&pagina=3')
    expect(router.state.historyAction).toBe('POP')
  })

  it.each([
    ['ordem=xyz', { ordem: 'nome' }],
    ['pagina=-3', { pagina: 1 }],
    ['pagina=abc', { pagina: 1 }],
    ['pagina=0', { pagina: 1 }],
    ['pagina=2.5', { pagina: 1 }],
    ['status=qualquer', { status: 'ativos' }],
    ['estoque=muito', { estoque: null }],
    ['promocao=talvez', { promocao: false }],
    ['categoria=nao-e-uuid', { categoria: null }],
    ['busca=%20%20', { busca: '' }],
  ])('valor invalido na URL vira o padrao (%s)', (query, esperado) => {
    const { hook } = montar(`/produtos?${query}`)

    expect(hook().filtros).toMatchObject(esperado)
  })

  it('limpar restaura os filtros padrao e mantem a ordem', () => {
    const { router, hook } = montar(`/produtos?busca=arroz&status=todos&categoria=${CATEGORIA}&ordem=-preco&pagina=2`)

    act(() => hook().limpar())

    expect(router.state.location.search).toBe('?ordem=-preco')
    expect(hook().temFiltroAtivo).toBe(false)
  })

  it('so a ordem ou a pagina nao contam como filtro ativo', () => {
    const { hook } = montar('/produtos?ordem=-preco&pagina=2')

    expect(hook().temFiltroAtivo).toBe(false)
  })
})
