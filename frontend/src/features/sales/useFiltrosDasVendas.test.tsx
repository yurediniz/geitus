import { describe, it, expect, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { filtrosDaApi, useFiltrosDasVendas } from '@/features/sales/useFiltrosDasVendas'

vi.mock('@/features/products/produtoFormulario', async (original) => ({
  ...(await original<typeof import('@/features/products/produtoFormulario')>()),
  dataHojeSaoPaulo: () => '2026-10-29',
}))

const PONTO = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f'

type Retorno = ReturnType<typeof useFiltrosDasVendas>

function montar(entrada = '/vendas', ehAdmin = true) {
  const atual: { valor: Retorno | null } = { valor: null }
  function Sonda() {
    atual.valor = useFiltrosDasVendas(ehAdmin)
    return null
  }
  const router = createMemoryRouter([{ path: '/vendas', element: <Sonda /> }], { initialEntries: [entrada] })
  render(<RouterProvider router={router} />)
  const hook = () => {
    if (!atual.valor) {
      throw new Error('hook nao montado')
    }
    return atual.valor
  }
  return { router, hook }
}

describe('useFiltrosDasVendas', () => {
  it('sem parametros: hoje, sem filtros, pagina 1', () => {
    const { hook } = montar()

    expect(hook().filtros).toEqual({
      de: '2026-10-29',
      ate: '2026-10-29',
      status: null,
      numero: '',
      pontoId: null,
      vendedorId: null,
      pagina: 1,
    })
    expect(hook().atalho).toBe('hoje')
    expect(hook().temFiltroAtivo).toBe(false)
    expect(hook().erroDoPeriodo).toBeNull()
  })

  it('le todos os filtros da URL; valores malformados voltam ao padrao', () => {
    const { hook } = montar(
      `/vendas?de=2026-10-01&ate=2026-10-29&status=CANCELADA&numero=128&ponto=${PONTO.toUpperCase()}&vendedor=7&pagina=3`,
    )
    expect(hook().filtros).toEqual({
      de: '2026-10-01',
      ate: '2026-10-29',
      status: 'CANCELADA',
      numero: '128',
      pontoId: PONTO,
      vendedorId: 7,
      pagina: 3,
    })

    const { hook: invalido } = montar('/vendas?de=2026-02-31&status=x&numero=12a&ponto=nao-uuid&vendedor=-1&pagina=0')
    expect(invalido().filtros).toMatchObject({
      de: '2026-10-29',
      status: null,
      numero: '',
      pontoId: null,
      vendedorId: null,
      pagina: 1,
    })
  })

  it('o OPERADOR ignora caixa e vendedor vindos num link', () => {
    const { hook } = montar(`/vendas?ponto=${PONTO}&vendedor=7`, false)

    expect(hook().filtros.pontoId).toBeNull()
    expect(hook().filtros.vendedorId).toBeNull()
  })

  it('mudar um filtro volta para a pagina 1 e escreve so o que difere do padrao', () => {
    const { router, hook } = montar('/vendas?pagina=4')

    act(() => hook().alterar({ status: 'CONCLUIDA' }))
    expect(router.state.location.search).toBe('?status=CONCLUIDA')

    act(() => hook().alterar({ pagina: 2 }))
    expect(router.state.location.search).toBe('?status=CONCLUIDA&pagina=2')

    act(() => hook().escolherAtalho('30'))
    expect(router.state.location.search).toBe('?de=2026-09-30&ate=2026-10-29&status=CONCLUIDA')
    expect(hook().atalho).toBe('30')

    // Escolher um periodo apaga o numero: com numero, o periodo nao valeria.
    act(() => hook().alterar({ numero: '8' }))
    expect(hook().filtros.numero).toBe('8')
    act(() => hook().escolherAtalho('7'))
    expect(hook().filtros.numero).toBe('')
    expect(hook().atalho).toBe('7')

    act(() => hook().limpar())
    expect(router.state.location.search).toBe('')
  })

  it('periodo invertido ou maior que 1 ano vira erro', () => {
    expect(montar('/vendas?de=2026-10-29&ate=2026-10-01').hook().erroDoPeriodo).toBe(
      'A data inicial não pode ser depois da final.',
    )
    expect(montar('/vendas?de=2025-10-28&ate=2026-10-29').hook().erroDoPeriodo).toBe('O período pode ter no máximo 1 ano.')
    expect(montar('/vendas?de=2025-10-29&ate=2026-10-29').hook().erroDoPeriodo).toBeNull()
  })

  it('o pedido da API: sem sessao; com numero, sem o periodo', () => {
    const base = {
      de: '2026-10-01',
      ate: '2026-10-29',
      status: null,
      numero: '',
      pontoId: PONTO,
      vendedorId: 7,
      pagina: 2,
    } as const

    expect(filtrosDaApi(base)).toEqual({
      sessaoId: '',
      status: '',
      de: '2026-10-01',
      ate: '2026-10-29',
      numero: '',
      pontoId: PONTO,
      vendedorId: '7',
      pagina: 2,
    })
    expect(filtrosDaApi({ ...base, numero: '128' })).toMatchObject({ de: '', ate: '', numero: '128' })
  })
})
