import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { SeletorCategoria, type SeletorCategoriaProps } from '@/features/products/SeletorCategoria'
import { cadastrarCategoria } from '@/services/categoriaService'
import { HttpError } from '@/services/httpClient'
import type { Categoria } from '@/types/catalogo'

vi.mock('@/services/categoriaService', () => ({
  cadastrarCategoria: vi.fn(),
}))

const cadastrarCategoriaMock = vi.mocked(cadastrarCategoria)

function categoria(
  id: string,
  nome: string,
  parentId: string | null,
  caminho: string,
  extras: Partial<Categoria> = {},
): Categoria {
  return {
    id,
    nome,
    parentId,
    caminho,
    nivel: caminho.split(' › ').length - 1,
    ativo: true,
    selecionavel: true,
    quantidadeSubcategorias: 0,
    quantidadeProdutos: 0,
    criadoEm: '2026-10-20T10:00:00',
    atualizadoEm: null,
    ...extras,
  }
}

const RACAO = categoria('racao', 'Ração', null, 'Ração')
const UMIDA = categoria('umida', 'Úmida', 'racao', 'Ração › Úmida')
const SACHE = categoria('sache', 'Sachê', 'umida', 'Ração › Úmida › Sachê')
const MERCEARIA = categoria('mercearia', 'Mercearia', null, 'Mercearia')
// Ramo inativo: a raiz esta inativa e o filho fica nao selecionavel por heranca.
const BRINQUEDOS = categoria('brinquedos', 'Brinquedos', null, 'Brinquedos', { ativo: false, selecionavel: false })
const BOLINHAS = categoria('bolinhas', 'Bolinhas', 'brinquedos', 'Brinquedos › Bolinhas', { selecionavel: false })

const CATEGORIAS = [BRINQUEDOS, BOLINHAS, MERCEARIA, RACAO, UMIDA, SACHE]

/** Envolve o seletor com estado proprio, como no formulario do produto. */
function SeletorComEstado(props: Partial<SeletorCategoriaProps> & { onChangeSpy?: (id: string | null) => void }) {
  const { onChangeSpy, valor: valorInicial = null, ...resto } = props
  const [valor, setValor] = useState<string | null>(valorInicial)
  return (
    <>
      <label id="categoria-rotulo" htmlFor="categoria">
        Categoria
      </label>
      <SeletorCategoria
        id="categoria"
        idRotulo="categoria-rotulo"
        categorias={CATEGORIAS}
        podeCriar
        {...resto}
        valor={valor}
        onChange={(id) => {
          setValor(id)
          onChangeSpy?.(id)
        }}
      />
    </>
  )
}

function renderSeletor(props: Partial<SeletorCategoriaProps> & { onChangeSpy?: (id: string | null) => void } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const invalidarSpy = vi.spyOn(queryClient, 'invalidateQueries')
  render(
    <QueryClientProvider client={queryClient}>
      <SeletorComEstado {...props} />
    </QueryClientProvider>,
  )
  return { invalidarSpy }
}

function gatilho() {
  return screen.getByRole('button', { name: /^categoria/i })
}

function abrir() {
  fireEvent.click(gatilho())
  return screen.findByRole('listbox', { name: 'Categorias' })
}

describe('SeletorCategoria', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('mostra "Sem categoria" quando nao ha valor e compoe o nome acessivel com o valor', () => {
    renderSeletor()

    expect(gatilho()).toHaveAccessibleName('Categoria Sem categoria')
    expect(gatilho()).toHaveAttribute('aria-haspopup', 'listbox')
    expect(gatilho()).toHaveAttribute('aria-expanded', 'false')
  })

  it('lista so as categorias selecionaveis pelo caminho, mais "Sem categoria"', async () => {
    renderSeletor()

    const lista = await abrir()
    const rotulos = within(lista).getAllByRole('option').map((opcao) => opcao.textContent)

    expect(rotulos).toEqual(['Sem categoria', 'Mercearia', 'Ração', 'Ração › Úmida', 'Ração › Úmida › Sachê'])
    expect(within(lista).queryByText(/brinquedos/i)).not.toBeInTheDocument()
  })

  it('busca pelo caminho sem diferenciar acentos nem maiusculas', async () => {
    renderSeletor()

    await abrir()
    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar categoria' }), { target: { value: 'SACHE' } })

    const opcoes = screen.getAllByRole('option')
    expect(opcoes).toHaveLength(1)
    expect(opcoes[0]).toHaveTextContent('Ração › Úmida › Sachê')
  })

  it('busca "umida" encontra a subcategoria pelo caminho completo', async () => {
    renderSeletor()

    await abrir()
    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar categoria' }), { target: { value: 'umida' } })

    expect(screen.getByRole('option', { name: 'Ração › Úmida › Sachê' })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Mercearia' })).not.toBeInTheDocument()
  })

  it('escolhe uma categoria pelo clique e fecha a lista', async () => {
    const onChangeSpy = vi.fn()
    renderSeletor({ onChangeSpy })

    await abrir()
    fireEvent.click(screen.getByRole('option', { name: 'Ração › Úmida' }))

    expect(onChangeSpy).toHaveBeenCalledWith('umida')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(gatilho()).toHaveTextContent('Ração › Úmida')
  })

  it('"Sem categoria" envia null', async () => {
    const onChangeSpy = vi.fn()
    renderSeletor({ onChangeSpy, valor: 'mercearia' })

    expect(gatilho()).toHaveTextContent('Mercearia')
    await abrir()
    fireEvent.click(screen.getByRole('option', { name: 'Sem categoria' }))

    expect(onChangeSpy).toHaveBeenCalledWith(null)
  })

  it('navega pelo teclado: seta abre, setas movem e Enter escolhe', async () => {
    const onChangeSpy = vi.fn()
    renderSeletor({ onChangeSpy })

    fireEvent.keyDown(gatilho(), { key: 'ArrowDown' })
    const busca = await screen.findByRole('combobox', { name: 'Buscar categoria' })

    // Comeca no valor atual ("Sem categoria"); duas setas para baixo levam a "Ração".
    expect(busca).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id)
    fireEvent.keyDown(busca, { key: 'ArrowDown' })
    fireEvent.keyDown(busca, { key: 'ArrowDown' })
    expect(busca).toHaveAttribute('aria-activedescendant', screen.getByRole('option', { name: 'Ração' }).id)
    fireEvent.keyDown(busca, { key: 'Enter' })

    expect(onChangeSpy).toHaveBeenCalledWith('racao')
  })

  it('Esc fecha a lista sem alterar o valor', async () => {
    const onChangeSpy = vi.fn()
    renderSeletor({ onChangeSpy })

    await abrir()
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Buscar categoria' }), { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(onChangeSpy).not.toHaveBeenCalled()
  })

  it('mantem a categoria atual inativa como valor e opcao, marcada "(inativa)"', async () => {
    renderSeletor({
      valor: 'bolinhas',
      valorAtual: { id: 'bolinhas', nome: 'Bolinhas', caminho: 'Brinquedos › Bolinhas' },
    })

    expect(gatilho()).toHaveTextContent('Brinquedos › Bolinhas (inativa)')
    await abrir()
    expect(screen.getByRole('option', { name: 'Brinquedos › Bolinhas (inativa)' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    // O resto do ramo inativo continua fora da lista.
    expect(screen.queryByRole('option', { name: /^Brinquedos$/ })).not.toBeInTheDocument()
  })

  it('"+ Nova categoria" cria com o termo buscado, invalida o cache e seleciona a nova', async () => {
    const nova = categoria('petiscos', 'Petiscos', 'racao', 'Ração › Petiscos')
    cadastrarCategoriaMock.mockResolvedValue(nova)
    const onChangeSpy = vi.fn()
    const onCriada = vi.fn()
    const { invalidarSpy } = renderSeletor({ onChangeSpy, onCriada })

    await abrir()
    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar categoria' }), { target: { value: 'Petiscos' } })
    fireEvent.click(screen.getByRole('button', { name: /nova categoria/i }))

    const formulario = screen.getByRole('form', { name: 'Nova categoria' })
    expect(within(formulario).getByLabelText('Nome da categoria')).toHaveValue('Petiscos')
    fireEvent.change(within(formulario).getByLabelText(/dentro de/i), { target: { value: 'racao' } })
    fireEvent.click(within(formulario).getByRole('button', { name: /criar e selecionar/i }))

    await waitFor(() => {
      expect(cadastrarCategoriaMock).toHaveBeenCalledWith({ nome: 'Petiscos', parentId: 'racao' })
    })
    await waitFor(() => expect(onChangeSpy).toHaveBeenCalledWith('petiscos'))
    expect(onCriada).toHaveBeenCalledWith(nova)
    await waitFor(() => expect(invalidarSpy).toHaveBeenCalledWith({ queryKey: ['categorias'] }))
    // Mesmo antes do refetch, o gatilho ja mostra a nova categoria.
    expect(gatilho()).toHaveTextContent('Ração › Petiscos')
  })

  it('cria categoria principal quando nenhum pai e escolhido', async () => {
    cadastrarCategoriaMock.mockResolvedValue(categoria('higiene', 'Higiene', null, 'Higiene'))
    renderSeletor()

    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /nova categoria/i }))
    fireEvent.change(screen.getByLabelText('Nome da categoria'), { target: { value: 'Higiene' } })
    fireEvent.click(screen.getByRole('button', { name: /criar e selecionar/i }))

    await waitFor(() => {
      expect(cadastrarCategoriaMock).toHaveBeenCalledWith({ nome: 'Higiene', parentId: null })
    })
  })

  it('valida o nome da nova categoria antes de enviar', async () => {
    renderSeletor()

    await abrir()
    fireEvent.click(screen.getByRole('button', { name: /nova categoria/i }))
    fireEvent.click(screen.getByRole('button', { name: /criar e selecionar/i }))

    expect(await screen.findByText('Informe o nome da categoria.')).toBeInTheDocument()
    expect(cadastrarCategoriaMock).not.toHaveBeenCalled()
  })

  it('mostra a mensagem do backend quando o nome ja existe no nivel (409)', async () => {
    cadastrarCategoriaMock.mockRejectedValue(
      new HttpError(409, 'Já existe uma categoria com este nome neste nível.'),
    )
    renderSeletor()

    await abrir()
    fireEvent.change(screen.getByRole('combobox', { name: 'Buscar categoria' }), { target: { value: 'Mercearia' } })
    fireEvent.click(screen.getByRole('button', { name: /nova categoria/i }))
    fireEvent.click(screen.getByRole('button', { name: /criar e selecionar/i }))

    expect(await screen.findByText('Já existe uma categoria com este nome neste nível.')).toBeInTheDocument()
  })

  it('sem permissao de criar (OPERADOR) nao mostra "+ Nova categoria"', async () => {
    renderSeletor({ podeCriar: false })

    await abrir()

    expect(screen.queryByRole('button', { name: /nova categoria/i })).not.toBeInTheDocument()
  })

  it('fica desabilitado quando solicitado', () => {
    renderSeletor({ desabilitado: true })

    expect(gatilho()).toBeDisabled()
  })
})
