import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { CategoriasPage } from '@/features/catalog/CategoriasPage'
import { useAuth } from '@/hooks/useAuth'
import {
  atualizarCategoria,
  cadastrarCategoria,
  excluirCategoria,
  inativarCategoria,
  listarCategorias,
  reativarCategoria,
} from '@/services/categoriaService'
import { HttpError } from '@/services/httpClient'
import type { Categoria } from '@/types/catalogo'

vi.mock('@/services/categoriaService', () => ({
  listarCategorias: vi.fn(),
  cadastrarCategoria: vi.fn(),
  atualizarCategoria: vi.fn(),
  inativarCategoria: vi.fn(),
  reativarCategoria: vi.fn(),
  excluirCategoria: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const listarCategoriasMock = vi.mocked(listarCategorias)
const cadastrarCategoriaMock = vi.mocked(cadastrarCategoria)
const atualizarCategoriaMock = vi.mocked(atualizarCategoria)
const inativarCategoriaMock = vi.mocked(inativarCategoria)
const reativarCategoriaMock = vi.mocked(reativarCategoria)
const excluirCategoriaMock = vi.mocked(excluirCategoria)
const useAuthMock = vi.mocked(useAuth)

function definirPerfil(perfil: 'ADMIN' | 'OPERADOR') {
  useAuthMock.mockReturnValue({
    usuario: {
      id: 1,
      nome: 'Ana Souza',
      email: 'ana@petshop.com',
      perfil,
      empresa: { id: 1, nome: 'Pet Central', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
    },
    token: 'token',
    estaAutenticado: true,
    carregandoSessao: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

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

const RACAO = categoria('racao', 'Ração', null, 'Ração', { quantidadeSubcategorias: 2, quantidadeProdutos: 4 })
const UMIDA = categoria('umida', 'Úmida', 'racao', 'Ração › Úmida', { quantidadeSubcategorias: 1 })
const SECA = categoria('seca', 'Seca', 'racao', 'Ração › Seca')
const SACHE = categoria('sache', 'Sachê', 'umida', 'Ração › Úmida › Sachê', { quantidadeProdutos: 7 })
const BEBIDAS = categoria('bebidas', 'Bebidas', null, 'Bebidas', { ativo: false, selecionavel: false })

const TODAS = [BEBIDAS, RACAO, SECA, UMIDA, SACHE]

function renderPagina() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/produtos/categorias']}>
        <CategoriasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function item(nome: string): HTMLElement {
  return screen.getByRole('treeitem', { name: nome })
}

describe('CategoriasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
  })

  it('renderiza a arvore aninhada recolhida e expande por no e por "Expandir tudo"', async () => {
    listarCategoriasMock.mockResolvedValue(TODAS)

    renderPagina()

    const arvore = await screen.findByRole('tree', { name: 'Categorias' })
    const raizes = within(arvore).getAllByRole('treeitem')
    // Raizes ordenadas por nome, com os filhos recolhidos.
    expect(raizes).toEqual([item('Bebidas'), item('Ração')])
    expect(item('Ração')).toHaveAttribute('aria-level', '1')
    expect(item('Ração')).toHaveAttribute('aria-expanded', 'false')
    expect(item('Bebidas')).not.toHaveAttribute('aria-expanded')
    expect(item('Ração')).toHaveAccessibleDescription('4 produto(s)')
    expect(within(item('Bebidas')).getByText('Inativa')).toBeInTheDocument()
    expect(item('Bebidas')).toHaveAccessibleDescription('0 produto(s), inativa')
    expect(screen.queryByRole('treeitem', { name: 'Úmida' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))

    expect(item('Ração')).toHaveAttribute('aria-expanded', 'true')
    const grupo = within(item('Ração')).getByRole('group')
    expect(within(grupo).getAllByRole('treeitem', { name: /seca|úmida/i })).toHaveLength(2)
    expect(item('Úmida')).toHaveAttribute('aria-level', '2')
    expect(screen.queryByRole('treeitem', { name: 'Sachê' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /expandir tudo/i }))
    expect(item('Sachê')).toHaveAttribute('aria-level', '3')
    expect(item('Sachê')).toHaveAccessibleDescription('7 produto(s)')

    fireEvent.click(screen.getByRole('button', { name: /recolher tudo/i }))
    expect(screen.queryByRole('treeitem', { name: 'Úmida' })).not.toBeInTheDocument()
  })

  it('exibe carregamento, erro e estado vazio', async () => {
    listarCategoriasMock.mockRejectedValueOnce(new HttpError(500, 'x')).mockResolvedValueOnce([])

    renderPagina()

    expect(screen.getByText(/carregando categorias/i)).toBeInTheDocument()
    expect(await screen.findByText('Não foi possível carregar as categorias.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))
    expect(await screen.findByText('Nenhuma categoria ainda.')).toBeInTheDocument()
  })

  it('cria categoria raiz enviando parentId null', async () => {
    listarCategoriasMock.mockResolvedValue([RACAO])
    cadastrarCategoriaMock.mockResolvedValue(categoria('merc', 'Mercearia', null, 'Mercearia'))

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: /nova categoria/i }))
    fireEvent.change(screen.getByLabelText('Nome da nova categoria'), { target: { value: ' Mercearia ' } })
    fireEvent.click(screen.getByRole('button', { name: /criar categoria/i }))

    await waitFor(() =>
      expect(cadastrarCategoriaMock).toHaveBeenCalledWith({ nome: 'Mercearia', parentId: null }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Categoria "Mercearia" criada.')
  })

  it('adiciona subcategoria inline enviando o parentId do no', async () => {
    listarCategoriasMock.mockResolvedValue([RACAO, SECA, UMIDA])
    cadastrarCategoriaMock.mockResolvedValue(categoria('filhote', 'Filhote', 'seca', 'Ração › Seca › Filhote'))

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar subcategoria em Seca' }))
    const campo = screen.getByLabelText('Nome da subcategoria de Seca')
    expect(campo).toHaveFocus()
    fireEvent.change(campo, { target: { value: 'Filhote' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))

    await waitFor(() =>
      expect(cadastrarCategoriaMock).toHaveBeenCalledWith({ nome: 'Filhote', parentId: 'seca' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Subcategoria "Filhote" criada em "Ração › Seca".')
  })

  it('mostra a mensagem do backend quando o nome ja existe no nivel (409)', async () => {
    listarCategoriasMock.mockResolvedValue([RACAO, SECA, UMIDA])
    cadastrarCategoriaMock.mockRejectedValue(
      new HttpError(409, 'Já existe uma categoria com este nome neste nível.'),
    )

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar subcategoria em Ração' }))
    fireEvent.change(screen.getByLabelText('Nome da subcategoria de Ração'), { target: { value: 'seca' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma categoria com este nome neste nível.')
    expect(screen.getByLabelText('Nome da subcategoria de Ração')).toBeInTheDocument()
  })

  it('renomeia inline mantendo o pai atual e cancela com Esc', async () => {
    listarCategoriasMock.mockResolvedValue([RACAO, SECA, UMIDA])
    atualizarCategoriaMock.mockResolvedValue({ ...SECA, nome: 'Seca premium' })

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))

    fireEvent.click(screen.getByRole('button', { name: 'Renomear Seca' }))
    fireEvent.keyDown(screen.getByLabelText('Novo nome para Seca'), { key: 'Escape' })
    expect(screen.queryByLabelText('Novo nome para Seca')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Renomear Seca' }))
    const campo = screen.getByLabelText('Novo nome para Seca')
    expect(campo).toHaveValue('Seca')
    fireEvent.change(campo, { target: { value: 'Seca premium' } })
    fireEvent.submit(campo)

    await waitFor(() =>
      expect(atualizarCategoriaMock).toHaveBeenCalledWith('seca', { nome: 'Seca premium', parentId: 'racao' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Categoria renomeada para "Seca premium".')
  })

  it('o dialogo de mover nao lista a propria categoria nem seus descendentes', async () => {
    listarCategoriasMock.mockResolvedValue(TODAS)

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mover Úmida' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Mover categoria' })
    const opcoes = within(dialogo).getAllByRole('radio')
    const rotulos = opcoes.map((opcao) => opcao.closest('label')?.textContent ?? '')
    expect(rotulos).toHaveLength(4)
    expect(rotulos[0]).toMatch(/^Mover para a raiz/)
    expect(rotulos.some((rotulo) => rotulo.startsWith('Bebidas'))).toBe(true)
    expect(rotulos.some((rotulo) => rotulo.startsWith('Ração › Seca'))).toBe(true)
    expect(rotulos.some((rotulo) => rotulo.includes('Úmida'))).toBe(false)
    // O pai atual vem marcado e o botao Mover so habilita ao escolher outro destino.
    expect(within(dialogo).getByRole('radio', { name: /^Ração.*local atual$/ })).toBeChecked()
    expect(within(dialogo).getByRole('button', { name: 'Mover' })).toBeDisabled()

    // A busca filtra pelo caminho, sem acentos.
    fireEvent.change(within(dialogo).getByLabelText('Buscar destino'), { target: { value: 'seca' } })
    expect(within(dialogo).getAllByRole('radio')).toHaveLength(2)
  })

  it('mover para a raiz envia parentId null', async () => {
    listarCategoriasMock.mockResolvedValue(TODAS)
    atualizarCategoriaMock.mockResolvedValue({ ...UMIDA, parentId: null, caminho: 'Úmida', nivel: 0 })

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mover Úmida' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Mover categoria' })
    fireEvent.click(within(dialogo).getByRole('radio', { name: /mover para a raiz/i }))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Mover' }))

    await waitFor(() =>
      expect(atualizarCategoriaMock).toHaveBeenCalledWith('umida', { nome: 'Úmida', parentId: null }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('"Úmida" agora é uma categoria raiz.')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('mantem o dialogo aberto com a mensagem do backend quando mover falha (409)', async () => {
    listarCategoriasMock.mockResolvedValue(TODAS)
    atualizarCategoriaMock.mockRejectedValue(
      new HttpError(409, 'Já existe uma categoria com este nome neste nível.'),
    )

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mover Seca' }))
    const dialogo = await screen.findByRole('dialog', { name: 'Mover categoria' })
    fireEvent.click(within(dialogo).getByRole('radio', { name: /^Ração › Úmida$/ }))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Mover' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Já existe uma categoria com este nome neste nível.',
    )
    expect(atualizarCategoriaMock).toHaveBeenCalledWith('seca', { nome: 'Seca', parentId: 'umida' })
  })

  it('exclusao bloqueada (409) mostra o motivo enviado pelo backend', async () => {
    const mensagem =
      'Não é possível excluir: há 2 subcategoria(s) e 4 produto(s) nesta categoria. Mova-os ou inative a categoria.'
    listarCategoriasMock.mockResolvedValue(TODAS)
    excluirCategoriaMock.mockRejectedValue(new HttpError(409, mensagem))

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Ração' }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(excluirCategoriaMock).toHaveBeenCalledWith('racao'))
    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('exclui categoria sem vinculos apos confirmar', async () => {
    listarCategoriasMock.mockResolvedValue([BEBIDAS])
    excluirCategoriaMock.mockResolvedValue(undefined)

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Bebidas' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Categoria "Bebidas" excluída.')
  })

  it('inativa e reativa categorias', async () => {
    listarCategoriasMock.mockResolvedValue([BEBIDAS, RACAO])
    inativarCategoriaMock.mockResolvedValue({ ...RACAO, ativo: false })
    reativarCategoriaMock.mockResolvedValue({ ...BEBIDAS, ativo: true })

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Inativar Ração' }))
    await waitFor(() => expect(inativarCategoriaMock).toHaveBeenCalledWith('racao'))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Categoria "Ração" inativada. Ela e suas subcategorias deixam de aparecer no cadastro de produtos.',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Reativar Bebidas' }))
    await waitFor(() => expect(reativarCategoriaMock).toHaveBeenCalledWith('bebidas'))
  })

  it('navega pelo teclado: setas movem o foco, → expande e entra, ← volta ao pai, Enter leva as acoes', async () => {
    listarCategoriasMock.mockResolvedValue(TODAS)

    renderPagina()
    await screen.findByRole('tree')

    // Foco roving: so o primeiro item entra na ordem de Tab.
    expect(item('Bebidas')).toHaveAttribute('tabindex', '0')
    expect(item('Ração')).toHaveAttribute('tabindex', '-1')

    item('Bebidas').focus()
    fireEvent.keyDown(item('Bebidas'), { key: 'ArrowDown' })
    expect(item('Ração')).toHaveFocus()
    expect(item('Ração')).toHaveAttribute('tabindex', '0')

    fireEvent.keyDown(item('Ração'), { key: 'ArrowRight' })
    expect(item('Ração')).toHaveAttribute('aria-expanded', 'true')
    expect(item('Ração')).toHaveFocus()

    fireEvent.keyDown(item('Ração'), { key: 'ArrowRight' })
    expect(item('Seca')).toHaveFocus()

    fireEvent.keyDown(item('Seca'), { key: 'ArrowDown' })
    expect(item('Úmida')).toHaveFocus()

    fireEvent.keyDown(item('Úmida'), { key: 'ArrowLeft' })
    expect(item('Ração')).toHaveFocus()

    fireEvent.keyDown(item('Ração'), { key: 'ArrowLeft' })
    expect(item('Ração')).toHaveAttribute('aria-expanded', 'false')

    fireEvent.keyDown(item('Ração'), { key: 'ArrowUp' })
    expect(item('Bebidas')).toHaveFocus()

    fireEvent.keyDown(item('Bebidas'), { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Adicionar subcategoria em Bebidas' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Adicionar subcategoria em Bebidas' }), { key: 'Escape' })
    expect(item('Bebidas')).toHaveFocus()
  })

  it('OPERADOR ve a arvore em modo leitura, sem acoes, e Enter expande', async () => {
    definirPerfil('OPERADOR')
    listarCategoriasMock.mockResolvedValue(TODAS)

    renderPagina()
    await screen.findByRole('tree')

    expect(screen.getByText(/você está no modo leitura/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /nova categoria/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /renomear|mover|excluir|inativar|adicionar/i })).not.toBeInTheDocument()

    item('Ração').focus()
    fireEvent.keyDown(item('Ração'), { key: 'Enter' })
    expect(item('Ração')).toHaveAttribute('aria-expanded', 'true')
  })
})
