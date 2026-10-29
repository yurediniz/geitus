import { describe, it, expect } from 'vitest'
import { act, render } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'

import { useFiltrosDaPosicao } from '@/features/stock/useFiltrosDaPosicao'

const CATEGORIA = '3f2a9c1e-7b4d-4e8a-9c2f-0a1b2c3d4e5f'

type Retorno = ReturnType<typeof useFiltrosDaPosicao>

/** Monta o hook dentro de um roteador em memoria e devolve o ultimo retorno. */
function montar(entrada = '/estoque') {
  const atual: { valor: Retorno | null } = { valor: null }
  function Sonda() {
    atual.valor = useFiltrosDaPosicao()
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

describe('useFiltrosDaPosicao', () => {
  it('le os padroes sem parametros', () => {
    const { hook } = montar()

    expect(hook().filtros).toEqual({
      busca: '',
      status: 'ativos',
      categoria: null,
      situacao: [],
      ordem: 'nome',
      pagina: 1,
    })
    expect(hook().temFiltroAtivo).toBe(false)
    expect(hook().quantidadeDeFiltros).toBe(0)
  })

  it('le todos os parametros e conta os filtros fora a busca', () => {
    const { hook } = montar(
      `/estoque?busca=leite&status=todos&categoria=${CATEGORIA}&situacao=negativo&ordem=-valor&pagina=3`,
    )

    expect(hook().filtros).toEqual({
      busca: 'leite',
      status: 'todos',
      categoria: CATEGORIA,
      situacao: ['negativo'],
      ordem: '-valor',
      pagina: 3,
    })
    expect(hook().quantidadeDeFiltros).toBe(3)
  })

  it('valores invalidos voltam ao padrao', () => {
    // `sem` e um valor antigo: cai em "sem filtro" (o `repor` e o caso seguinte).
    const { hook } = montar('/estoque?status=x&categoria=nao-uuid&situacao=sem&ordem=preco&pagina=-2')

    expect(hook().filtros).toEqual({
      busca: '',
      status: 'ativos',
      categoria: null,
      situacao: [],
      ordem: 'nome',
      pagina: 1,
    })
  })

  it('situacao com varios valores: repetida na URL, na ordem das situacoes, sem repetidos nem antigos', () => {
    const { router, hook } = montar('/estoque?situacao=alto&situacao=repor&situacao=zerado&situacao=alto')

    expect(hook().filtros.situacao).toEqual(['zerado', 'alto'])
    expect(hook().quantidadeDeFiltros).toBe(1)

    act(() => hook().alterar({ situacao: ['baixo', 'negativo'] }))

    expect(router.state.location.search).toBe('?situacao=negativo&situacao=baixo')
  })

  it('mudar um filtro volta para a pagina 1 e cria uma entrada no historico', () => {
    const { router, hook } = montar('/estoque?pagina=4')
    const entradasAntes = router.state.historyAction

    act(() => hook().alterar({ situacao: ['baixo'] }))

    expect(router.state.location.search).toBe('?situacao=baixo')
    expect(router.state.historyAction).toBe('PUSH')
    expect(entradasAntes).toBe('POP')
  })

  it('so a pagina muda sem voltar para a 1', () => {
    const { router, hook } = montar('/estoque?situacao=zerado')

    act(() => hook().alterar({ pagina: 2 }))

    expect(router.state.location.search).toBe('?situacao=zerado&pagina=2')
  })

  it('a busca substitui a entrada do historico e chega aparada', () => {
    const { router, hook } = montar('/estoque')

    act(() => hook().alterar({ busca: '  arroz ' }))

    expect(router.state.location.search).toBe('?busca=arroz')
    expect(router.state.historyAction).toBe('REPLACE')
  })

  it('alterar sem mudanca real nao mexe na URL', () => {
    const { router, hook } = montar('/estoque?situacao=zerado')
    const antes = router.state.location

    act(() => hook().alterar({ situacao: ['zerado'] }))

    expect(router.state.location).toBe(antes)
  })

  it('limpar tira os filtros e preserva a ordem', () => {
    const { router, hook } = montar(`/estoque?busca=x&status=todos&categoria=${CATEGORIA}&situacao=zerado&ordem=saldo`)

    act(() => hook().limpar())

    expect(router.state.location.search).toBe('?ordem=saldo')
  })

  it('limpar e buscar logo em seguida nao traz de volta o filtro limpo', () => {
    const { router, hook } = montar('/estoque?situacao=baixo&busca=xyz')

    // Sem act: a acao seguinte (Enter na busca, leitor de codigo) chega antes de qualquer espera.
    hook().limpar()
    hook().alterar({ busca: 'teste estoque' })

    expect(router.state.location.search).toBe('?busca=teste+estoque')
  })
})
