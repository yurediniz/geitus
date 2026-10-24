import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { BuscaDeFornecedor, type BuscaDeFornecedorProps } from '@/features/suppliers/BuscaDeFornecedor'
import { HttpError } from '@/services/httpClient'
import { listarFornecedores } from '@/services/fornecedorService'
import type { FornecedorItemLista } from '@/types/fornecedor'

vi.mock('@/services/fornecedorService', () => ({
  listarFornecedores: vi.fn(),
}))

const listarFornecedoresMock = vi.mocked(listarFornecedores)

function fornecedor(numero: number): FornecedorItemLista {
  return {
    id: `f${numero}`,
    numero,
    razaoSocial: `Fornecedor ${String(numero).padStart(2, '0')}`,
    nomeFantasia: null,
    tipoPessoa: 'PJ',
    documento: null,
    telefone: null,
    representantePrincipal: null,
    quantidadeProdutos: 0,
    ativo: true,
  }
}

function pagina(itens: FornecedorItemLista[], totalItens: number) {
  return { itens, pagina: 0, tamanho: itens.length, totalItens }
}

function renderBusca(props: Partial<BuscaDeFornecedorProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <span id="rotulo">Fornecedores</span>
      <BuscaDeFornecedor idRotulo="rotulo" valor={null} onChange={vi.fn()} textoSemValor="Adicionar fornecedor" {...props} />
    </QueryClientProvider>,
  )
}

function abrir() {
  fireEvent.click(screen.getByRole('button', { name: /^Fornecedores/ }))
}

function opcoes(): string[] {
  return within(screen.getByRole('listbox', { name: 'Fornecedores' }))
    .queryAllByRole('option')
    .map((opcao) => opcao.textContent ?? '')
}

describe('BuscaDeFornecedor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('com os primeiros já escolhidos, pede a mais, mostra 10 e avisa que há mais', async () => {
    // 15 ativos; os 2 primeiros ja estao na lista.
    listarFornecedoresMock.mockResolvedValue(pagina(Array.from({ length: 12 }, (_, i) => fornecedor(i + 1)), 15))
    renderBusca({ ocultos: new Set(['f1', 'f2']) })

    abrir()

    expect(await screen.findByText('Mostrando os 10 primeiros. Digite para buscar os demais.')).toBeInTheDocument()
    expect(listarFornecedoresMock).toHaveBeenCalledWith(
      { busca: '', status: 'ativos', pagina: 1, tamanho: 12 },
      expect.anything(),
    )
    const nomes = opcoes()
    expect(nomes).toHaveLength(10)
    expect(nomes[0]).toContain('Fornecedor 03')
    expect(screen.queryByText('Nenhum fornecedor ativo para escolher.')).not.toBeInTheDocument()
  })

  it('pede no máximo 30, mesmo com muitos escolhidos', async () => {
    listarFornecedoresMock.mockResolvedValue(pagina([], 0))
    renderBusca({ ocultos: new Set(Array.from({ length: 25 }, (_, i) => `x${i}`)) })

    abrir()

    await waitFor(() =>
      expect(listarFornecedoresMock).toHaveBeenCalledWith(expect.objectContaining({ tamanho: 30 }), expect.anything()),
    )
  })

  it('"Nenhum fornecedor ativo para escolher." só quando não há nenhum', async () => {
    listarFornecedoresMock.mockResolvedValue(pagina([], 0))
    renderBusca()

    abrir()

    expect(await screen.findByText('Nenhum fornecedor ativo para escolher.')).toBeInTheDocument()
  })

  it('todos já escolhidos: diz isso, sem "nenhum ativo"', async () => {
    listarFornecedoresMock.mockResolvedValue(pagina([fornecedor(1), fornecedor(2)], 2))
    renderBusca({ ocultos: new Set(['f1', 'f2']) })

    abrir()

    expect(await screen.findByText('Todos os fornecedores ativos já foram escolhidos.')).toBeInTheDocument()
    expect(screen.queryByText('Nenhum fornecedor ativo para escolher.')).not.toBeInTheDocument()
  })

  it('na falha, "Tentar novamente" busca de novo', async () => {
    listarFornecedoresMock.mockRejectedValueOnce(new HttpError(500, 'Requisicao falhou (HTTP 500).'))
    listarFornecedoresMock.mockResolvedValue(pagina([fornecedor(1)], 1))
    renderBusca()

    abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Tentar novamente' }))

    expect(await screen.findByRole('option', { name: /Fornecedor 01/ })).toBeInTheDocument()
    expect(screen.queryByText(/HTTP 500/)).not.toBeInTheDocument()
  })
})
