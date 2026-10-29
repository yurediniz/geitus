import { describe, it, expect, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import {
  MENSAGEM_PERIODO_INVERTIDO,
  MENSAGEM_PERIODO_LONGO,
  motivosDoFiltro,
  somarDias,
  useFiltrosDasMovimentacoes,
} from '@/features/stock/useFiltrosDasMovimentacoes'

vi.mock('@/features/products/produtoFormulario', async (original) => ({
  ...(await original<typeof import('@/features/products/produtoFormulario')>()),
  dataHojeSaoPaulo: () => '2026-10-29',
}))

type Retorno = ReturnType<typeof useFiltrosDasMovimentacoes>

/** Monta o hook dentro de um roteador em memoria e devolve o ultimo retorno. */
function montar(entrada = '/estoque?aba=movimentacoes') {
  const atual: { valor: Retorno | null } = { valor: null }
  function Sonda() {
    atual.valor = useFiltrosDasMovimentacoes()
    return null
  }
  const router = createMemoryRouter([{ path: '/estoque', element: <Sonda /> }], { initialEntries: [entrada] })
  render(<RouterProvider router={router} />)
  const hook = () => {
    if (!atual.valor) {
      throw new Error('hook nao montado')
    }
    return atual.valor
  }
  return { router, hook }
}

describe('useFiltrosDasMovimentacoes', () => {
  it('sem parametros, os ultimos 30 dias contando hoje e o atalho de 30 dias', () => {
    const { hook } = montar()

    expect(hook().filtros).toEqual({ de: '2026-09-30', ate: '2026-10-29', produto: null, tipo: null, motivo: null, usuario: null })
    expect(hook().atalho).toBe('30')
    expect(hook().temFiltroAtivo).toBe(false)
    expect(hook().erroDoPeriodo).toBeNull()
  })

  it('le todos os parametros', () => {
    const { hook } = montar(
      '/estoque?aba=movimentacoes&de=2026-10-01&ate=2026-10-10&produto=3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02&tipo=SAIDA&motivo=VENDA&usuario=7',
    )

    expect(hook().filtros).toEqual({
      de: '2026-10-01',
      ate: '2026-10-10',
      produto: '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02',
      tipo: 'SAIDA',
      motivo: 'VENDA',
      usuario: 7,
    })
    expect(hook().atalho).toBeNull()
    expect(hook().temFiltroAtivo).toBe(true)
  })

  it('valores invalidos voltam ao padrao, e o motivo que o tipo nao tem e ignorado', () => {
    const { hook } = montar('/estoque?aba=movimentacoes&de=2026-02-31&ate=ontem&produto=nao-uuid&tipo=x&usuario=abc')
    expect(hook().filtros).toEqual({ de: '2026-09-30', ate: '2026-10-29', produto: null, tipo: null, motivo: null, usuario: null })

    const outro = montar('/estoque?aba=movimentacoes&tipo=ENTRADA&motivo=VENDA')
    expect(outro.hook().filtros.motivo).toBeNull()
  })

  it('os atalhos escrevem o periodo e o de 30 dias volta a URL limpa', () => {
    const { router, hook } = montar()

    act(() => hook().escolherAtalho('hoje'))
    expect(router.state.location.search).toBe('?aba=movimentacoes&de=2026-10-29&ate=2026-10-29')
    expect(hook().atalho).toBe('hoje')

    act(() => hook().escolherAtalho('7'))
    expect(router.state.location.search).toBe('?aba=movimentacoes&de=2026-10-23&ate=2026-10-29')
    expect(hook().atalho).toBe('7')

    act(() => hook().escolherAtalho('30'))
    expect(router.state.location.search).toBe('?aba=movimentacoes')
  })

  it('o produto entra na URL e conta como filtro', () => {
    const { router, hook } = montar()

    act(() => hook().alterar({ produto: '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02' }))

    expect(router.state.location.search).toBe('?aba=movimentacoes&produto=3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e02')
    expect(hook().temFiltroAtivo).toBe(true)
  })

  it('trocar o tipo tira o motivo que ele nao tem e mantem o que ele tem', () => {
    const { router, hook } = montar('/estoque?aba=movimentacoes&motivo=OUTRO')

    act(() => hook().alterar({ tipo: 'AJUSTE' }))
    expect(router.state.location.search).toBe('?aba=movimentacoes&tipo=AJUSTE&motivo=OUTRO')

    act(() => hook().alterar({ motivo: 'CONTAGEM' }))
    act(() => hook().alterar({ tipo: 'SAIDA' }))
    expect(router.state.location.search).toBe('?aba=movimentacoes&tipo=SAIDA')
  })

  it('periodo invertido ou maior que 1 ano vira erro', () => {
    expect(montar('/estoque?aba=movimentacoes&de=2026-10-20&ate=2026-10-10').hook().erroDoPeriodo).toBe(
      MENSAGEM_PERIODO_INVERTIDO,
    )
    expect(montar('/estoque?aba=movimentacoes&de=2025-10-28&ate=2026-10-29').hook().erroDoPeriodo).toBe(
      MENSAGEM_PERIODO_LONGO,
    )
    expect(montar('/estoque?aba=movimentacoes&de=2025-10-29&ate=2026-10-29').hook().erroDoPeriodo).toBeNull()
  })

  it('limpar e filtrar logo em seguida nao traz de volta o filtro limpo', () => {
    const { router, hook } = montar('/estoque?aba=movimentacoes&tipo=SAIDA&usuario=7')

    // Sem act: a acao seguinte chega antes de qualquer espera.
    hook().limpar()
    hook().alterar({ tipo: 'ENTRADA' })

    expect(router.state.location.search).toBe('?aba=movimentacoes&tipo=ENTRADA')
  })

  it('oferece os motivos do tipo, os do sistema incluidos, e todos sem tipo', () => {
    expect(motivosDoFiltro('SAIDA')).toContain('VENDA')
    expect(motivosDoFiltro('ENTRADA')).toEqual(
      expect.arrayContaining(['ESTOQUE_INICIAL', 'CANCELAMENTO_VENDA', 'COMPRA']),
    )
    expect(motivosDoFiltro('AJUSTE')).toEqual(['CONTAGEM', 'OUTRO'])
    expect(motivosDoFiltro(null).filter((motivo) => motivo === 'OUTRO')).toHaveLength(1)
    expect(motivosDoFiltro(null).at(-1)).toBe('OUTRO')
  })

  it('soma dias atravessando o mes', () => {
    expect(somarDias('2026-10-01', -1)).toBe('2026-09-30')
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01')
  })
})
