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
      categoria: [],
      estoque: [],
      promocao: false,
      ordem: 'nome',
      pagina: 1,
    })
    expect(hook().temFiltroAtivo).toBe(false)
  })

  it('le todos os parametros da URL', () => {
    const { hook } = montar(
      `/produtos?busca=arroz&status=todos&categoria=${CATEGORIA}&estoque=zerado&promocao=1&ordem=-margem&pagina=3`,
    )

    expect(hook().filtros).toEqual({
      busca: 'arroz',
      status: 'todos',
      categoria: [CATEGORIA],
      estoque: ['zerado'],
      promocao: true,
      ordem: '-margem',
      pagina: 3,
    })
    expect(hook().temFiltroAtivo).toBe(true)
  })

  it('escreve so os valores diferentes do padrao', () => {
    const { router, hook } = montar()

    act(() => hook().alterar({ status: 'ativos', estoque: ['baixo'], ordem: 'nome', promocao: true }))

    expect(router.state.location.search).toBe('?estoque=baixo&promocao=1')
  })

  it('estoque com varios valores: repetido na URL, na ordem das situacoes e sem repetidos', () => {
    const { router, hook } = montar()

    act(() => hook().alterar({ estoque: ['alto', 'zerado', 'zerado'] }))

    expect(router.state.location.search).toBe('?estoque=zerado&estoque=alto')
    expect(hook().filtros.estoque).toEqual(['zerado', 'alto'])
    expect(hook().quantidadeDeFiltros).toBe(1)
  })

  it('le o estoque repetido da URL e ignora os valores antigos (repor, sem)', () => {
    const { hook } = montar('/produtos?estoque=alto&estoque=repor&estoque=sem&estoque=negativo&estoque=alto')

    expect(hook().filtros.estoque).toEqual(['negativo', 'alto'])
  })

  it('a mesma lista em outra ordem nao mexe na URL', () => {
    const { router, hook } = montar('/produtos?estoque=zerado&estoque=baixo')
    const antes = router.state.location

    act(() => hook().alterar({ estoque: ['baixo', 'zerado'] }))

    expect(router.state.location).toBe(antes)
  })

  it('mudar um filtro volta para a pagina 1', () => {
    const { router, hook } = montar('/produtos?ordem=preco&pagina=4')

    act(() => hook().alterar({ status: 'inativos' }))

    expect(hook().filtros.pagina).toBe(1)
    expect(router.state.location.search).toBe('?status=inativos&ordem=preco')
  })

  it('mudar a pagina mantem os filtros e cria entrada no historico', () => {
    const { router, hook } = montar('/produtos?busca=arroz&estoque=zerado')

    act(() => hook().alterar({ pagina: 2 }))

    expect(router.state.location.search).toBe('?busca=arroz&estoque=zerado&pagina=2')
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

  it('busca com caracteres especiais vai e volta da URL identica', () => {
    const busca = '50% & café+leite'
    const { router, hook } = montar()

    act(() => hook().alterar({ busca }))

    expect(new URLSearchParams(router.state.location.search).get('busca')).toBe(busca)
    expect(hook().filtros.busca).toBe(busca)

    // E reabrindo a lista pela mesma URL (ex.: voltar da edicao).
    const reaberta = montar(`/produtos${router.state.location.search}`)
    expect(reaberta.hook().filtros.busca).toBe(busca)
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
    ['estoque=muito', { estoque: [] }],
    // O valor antigo (antes dos seis niveis) cai em "sem filtro".
    ['estoque=sem', { estoque: [] }],
    ['promocao=talvez', { promocao: false }],
    ['categoria=nao-e-uuid', { categoria: [] }],
    ['busca=%20%20', { busca: '' }],
  ])('valor invalido na URL vira o padrao (%s)', (query, esperado) => {
    const { hook } = montar(`/produtos?${query}`)

    expect(hook().filtros).toMatchObject(esperado)
  })

  it('pagina enorme na URL fica limitada (nao vira 400 no backend)', () => {
    const { hook } = montar('/produtos?pagina=99999999999999999999')

    expect(hook().filtros.pagina).toBe(1_000_000)
  })

  it('conta os filtros ativos fora a busca (botao Filtros do celular)', () => {
    const { hook } = montar(`/produtos?busca=arroz&status=todos&categoria=${CATEGORIA}&promocao=1&ordem=-preco`)

    expect(hook().quantidadeDeFiltros).toBe(3)
  })

  it('so a busca ja e filtro ativo, mas nao entra na contagem', () => {
    const { hook } = montar('/produtos?busca=arroz')

    expect(hook().temFiltroAtivo).toBe(true)
    expect(hook().quantidadeDeFiltros).toBe(0)
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

  it('limpar e buscar logo em seguida nao traz de volta o filtro limpo', () => {
    const { router, hook } = montar('/produtos?estoque=baixo&busca=xyz')

    // Sem act: a acao seguinte (Enter na busca, leitor de codigo) chega antes de qualquer espera.
    hook().limpar()
    hook().alterar({ busca: 'arroz' })

    expect(router.state.location.search).toBe('?busca=arroz')
  })

  it('categorias: uma por parametro, sem repetidos nem invalidas, no maximo 20', () => {
    const outra = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
    const { hook } = montar(`/produtos?categoria=${CATEGORIA}&categoria=nao-uuid&categoria=${outra}&categoria=${CATEGORIA}`)

    expect(hook().filtros.categoria).toEqual([CATEGORIA, outra])
    expect(hook().quantidadeDeFiltros).toBe(1)

    const vinteECinco = Array.from({ length: 25 }, (_, indice) => `00000000-0000-4000-8000-${String(indice).padStart(12, '0')}`)
    const { hook: muitas } = montar(`/produtos?${vinteECinco.map((id) => `categoria=${id}`).join('&')}`)
    expect(muitas().filtros.categoria).toHaveLength(20)
  })

  it('categorias vao para a URL uma por valor; a mesma lista nao mexe na URL', () => {
    const outra = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
    const { router, hook } = montar('/produtos')

    act(() => hook().alterar({ categoria: [CATEGORIA, outra, CATEGORIA] }))

    expect(router.state.location.search).toBe(`?categoria=${CATEGORIA}&categoria=${outra}`)
    const antes = router.state.location
    act(() => hook().alterar({ categoria: [CATEGORIA, outra] }))
    expect(router.state.location).toBe(antes)

    act(() => hook().alterar({ categoria: [] }))
    expect(router.state.location.search).toBe('')
  })
})
