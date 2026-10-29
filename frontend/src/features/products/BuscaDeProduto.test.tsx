import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { BuscaDeProduto, type BuscaDeProdutoProps } from '@/features/products/BuscaDeProduto'
import { listarProdutos } from '@/services/produtoService'
import type { Produto } from '@/types/produto'

vi.mock('@/services/produtoService', () => ({
  listarProdutos: vi.fn(),
}))

const listarProdutosMock = vi.mocked(listarProdutos)

/** So os campos que a busca le. */
function produto(numero: number, ativo = true): Produto {
  return { id: `p${numero}`, numero, nome: `Produto ${String(numero).padStart(2, '0')}`, ativo } as Produto
}

function pagina(itens: Produto[], totalItens: number) {
  return { itens, pagina: 0, tamanho: 8, totalItens }
}

function renderBusca(props: Partial<BuscaDeProdutoProps> = {}) {
  const onChange = vi.fn()
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <span id="rotulo">Produto</span>
      <BuscaDeProduto idRotulo="rotulo" valor={null} onChange={onChange} textoSemValor="Todos" {...props} />
    </QueryClientProvider>,
  )
  return onChange
}

function abrir() {
  fireEvent.click(screen.getByRole('button', { name: /^Produto/ }))
}

function opcoes(): string[] {
  return within(screen.getByRole('listbox', { name: 'Produtos' }))
    .queryAllByRole('option')
    .map((opcao) => opcao.textContent ?? '')
}

describe('BuscaDeProduto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sem termo, "Todos" vem primeiro, com ativos e inativos, 8 por vez e o aviso de mais', async () => {
    listarProdutosMock.mockResolvedValue(pagina([produto(1), produto(2, false)], 30))
    renderBusca()

    abrir()

    expect(await screen.findByText('Mostrando os 8 primeiros. Digite para encontrar os outros.')).toBeInTheDocument()
    expect(listarProdutosMock).toHaveBeenCalledWith(
      expect.objectContaining({ busca: '', status: 'todos', tamanho: 8 }),
      expect.anything(),
    )
    expect(opcoes()).toEqual(['Todos', 'Produto 01Nº 1', 'Produto 02Nº 2 · Inativo'])
  })

  it('com termo, busca no servidor depois da pausa e o Enter escolhe a opção ativa', async () => {
    listarProdutosMock.mockResolvedValue(pagina([], 0))
    const onChange = renderBusca()
    abrir()
    await screen.findByText('Nenhum produto cadastrado.')

    listarProdutosMock.mockResolvedValue(pagina([produto(7), produto(8)], 2))
    const campo = screen.getByRole('combobox', { name: 'Buscar produto' })
    fireEvent.change(campo, { target: { value: 'arroz' } })

    await waitFor(() =>
      expect(listarProdutosMock).toHaveBeenLastCalledWith(expect.objectContaining({ busca: 'arroz' }), expect.anything()),
    )
    await waitFor(() => expect(opcoes()).toHaveLength(2))
    // Com termo, nao ha "Todos": a seta para baixo vai para o segundo encontrado.
    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    fireEvent.keyDown(campo, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith({ id: 'p8', numero: 8, nome: 'Produto 08', ativo: true })
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })

  it('Enter antes do resultado do termo digitado espera e escolhe o primeiro encontrado', async () => {
    listarProdutosMock.mockResolvedValue(pagina([produto(1), produto(2)], 2))
    const onChange = renderBusca()
    abrir()
    await waitFor(() => expect(opcoes()).toHaveLength(3))

    listarProdutosMock.mockResolvedValue(pagina([produto(9)], 1))
    const campo = screen.getByRole('combobox', { name: 'Buscar produto' })
    // Leitor de codigo: o termo e o Enter chegam juntos, com a lista antiga ainda na tela.
    fireEvent.change(campo, { target: { value: '7891000315508' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()

    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ id: 'p9', numero: 9, nome: 'Produto 09', ativo: true }))
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('Esc depois do Enter pendente cancela a escolha', async () => {
    listarProdutosMock.mockResolvedValue(pagina([produto(1)], 1))
    const onChange = renderBusca()
    abrir()
    await waitFor(() => expect(opcoes()).toHaveLength(2))

    listarProdutosMock.mockResolvedValue(pagina([produto(9)], 1))
    const campo = screen.getByRole('combobox', { name: 'Buscar produto' })
    fireEvent.change(campo, { target: { value: 'arroz' } })
    fireEvent.keyDown(campo, { key: 'Enter' })
    fireEvent.keyDown(campo, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    // Passa a espera da busca: nada e escolhido.
    await new Promise((resolver) => setTimeout(resolver, 500))
    expect(onChange).not.toHaveBeenCalled()
  })

  it('termo sem resultado diz o que foi buscado', async () => {
    listarProdutosMock.mockResolvedValue(pagina([], 0))
    renderBusca()
    abrir()

    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar produto' }), { target: { value: 'xyz' } })

    expect(await screen.findByText('Nenhum produto encontrado para "xyz".')).toBeInTheDocument()
  })

  it('o gatilho mostra o escolhido e "Todos" limpa a escolha', async () => {
    listarProdutosMock.mockResolvedValue(pagina([produto(1)], 1))
    const onChange = renderBusca({ valor: { id: 'p1', numero: 1, nome: 'Produto 01', ativo: true } })

    expect(screen.getByRole('button', { name: /^Produto\s*Produto 01/ })).toBeInTheDocument()
    abrir()
    fireEvent.click(await screen.findByRole('option', { name: 'Todos' }))

    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('Esc fecha sem escolher', async () => {
    listarProdutosMock.mockResolvedValue(pagina([produto(1)], 1))
    const onChange = renderBusca()
    abrir()
    const campo = await screen.findByRole('combobox', { name: 'Buscar produto' })

    fireEvent.keyDown(campo, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(onChange).not.toHaveBeenCalled()
  })
})
