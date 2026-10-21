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

function botaoMais(nome: string): HTMLElement {
  return screen.getByRole('button', { name: `Mais ações para ${nome}` })
}

/** Abre o menu "Mais" do no e escolhe a acao. */
async function escolherNoMenu(nome: string, acao: string) {
  fireEvent.click(botaoMais(nome))
  const menu = await screen.findByRole('menu', { name: `Mais ações para ${nome}` })
  fireEvent.click(within(menu).getByRole('menuitem', { name: acao }))
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
    // Contagem da subarvore (4 diretos + 7 em Sachê), com plural correto.
    expect(item('Ração')).toHaveAccessibleDescription('11 produtos')
    expect(within(item('Ração')).getAllByText('11 produtos').length).toBeGreaterThan(0)
    expect(within(item('Bebidas')).getByText('Inativa')).toBeInTheDocument()
    // Sem produtos na subarvore: nao mostra "0".
    expect(item('Bebidas')).toHaveAccessibleDescription('inativa')
    expect(within(item('Bebidas')).queryByText(/produto/)).not.toBeInTheDocument()
    expect(screen.queryByRole('treeitem', { name: 'Úmida' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))

    expect(item('Ração')).toHaveAttribute('aria-expanded', 'true')
    const grupo = within(item('Ração')).getByRole('group')
    expect(within(grupo).getAllByRole('treeitem', { name: /seca|úmida/i })).toHaveLength(2)
    expect(item('Úmida')).toHaveAttribute('aria-level', '2')
    expect(screen.queryByRole('treeitem', { name: 'Sachê' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /expandir tudo/i }))
    expect(item('Sachê')).toHaveAttribute('aria-level', '3')
    expect(item('Sachê')).toHaveAccessibleDescription('7 produtos')
    expect(item('Úmida')).toHaveAccessibleDescription('7 produtos')

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

  it('cria categorias principais em sequencia enviando parentId null', async () => {
    listarCategoriasMock.mockResolvedValue([RACAO])
    cadastrarCategoriaMock
      .mockResolvedValueOnce(categoria('merc', 'Mercearia', null, 'Mercearia'))
      .mockResolvedValueOnce(categoria('hig', 'Higiene', null, 'Higiene'))

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Nova categoria principal' }))
    fireEvent.change(screen.getByLabelText('Nome da nova categoria principal'), { target: { value: ' Mercearia ' } })
    fireEvent.click(screen.getByRole('button', { name: /criar categoria/i }))

    await waitFor(() =>
      expect(cadastrarCategoriaMock).toHaveBeenCalledWith({ nome: 'Mercearia', parentId: null }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Categoria "Mercearia" criada.')
    // O campo continua aberto, vazio e com foco para a proxima.
    await waitFor(() => expect(screen.getByLabelText('Nome da nova categoria principal')).toHaveValue(''))
    expect(screen.getByLabelText('Nome da nova categoria principal')).toHaveFocus()

    fireEvent.change(screen.getByLabelText('Nome da nova categoria principal'), { target: { value: 'Higiene' } })
    fireEvent.click(screen.getByRole('button', { name: /criar categoria/i }))
    expect(await screen.findByText('Categoria "Higiene" criada.')).toBeInTheDocument()

    // Esc fecha e devolve o foco ao botao que abriu o formulario.
    fireEvent.keyDown(screen.getByLabelText('Nome da nova categoria principal'), { key: 'Escape' })
    expect(screen.queryByLabelText('Nome da nova categoria principal')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nova categoria principal' })).toHaveFocus()
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
    // Criacao em sequencia: campo limpo e com foco; Esc fecha e volta ao no pai.
    await waitFor(() => expect(screen.getByLabelText('Nome da subcategoria de Seca')).toHaveValue(''))
    expect(screen.getByLabelText('Nome da subcategoria de Seca')).toHaveFocus()
    fireEvent.keyDown(screen.getByLabelText('Nome da subcategoria de Seca'), { key: 'Escape' })
    expect(screen.queryByLabelText('Nome da subcategoria de Seca')).not.toBeInTheDocument()
    expect(item('Seca')).toHaveFocus()
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
    // A primeira digitacao limpa o erro do backend.
    fireEvent.change(screen.getByLabelText('Nome da subcategoria de Ração'), { target: { value: 'seca 2' } })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('renomeia inline mantendo o pai atual, cancela com Esc e devolve o foco ao no', async () => {
    listarCategoriasMock.mockResolvedValue([RACAO, SECA, UMIDA])
    atualizarCategoriaMock.mockResolvedValue({ ...SECA, nome: 'Seca premium' })

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))

    await escolherNoMenu('Seca', 'Renomear')
    fireEvent.keyDown(await screen.findByLabelText('Novo nome para Seca'), { key: 'Escape' })
    expect(screen.queryByLabelText('Novo nome para Seca')).not.toBeInTheDocument()
    expect(item('Seca')).toHaveFocus()

    await escolherNoMenu('Seca', 'Renomear')
    const campo = await screen.findByLabelText('Novo nome para Seca')
    expect(campo).toHaveValue('Seca')
    fireEvent.change(campo, { target: { value: 'Seca premium' } })
    fireEvent.submit(campo)

    await waitFor(() =>
      expect(atualizarCategoriaMock).toHaveBeenCalledWith('seca', { nome: 'Seca premium', parentId: 'racao' }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Categoria renomeada para "Seca premium".')
    expect(screen.queryByLabelText('Novo nome para Seca')).not.toBeInTheDocument()
    expect(item('Seca')).toHaveFocus()
  })

  it('o dialogo de mover nao lista a propria categoria nem seus descendentes', async () => {
    listarCategoriasMock.mockResolvedValue(TODAS)

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))
    await escolherNoMenu('Úmida', 'Mover')

    const dialogo = await screen.findByRole('dialog', { name: 'Mover categoria' })
    const opcoes = within(dialogo).getAllByRole('radio')
    const rotulos = opcoes.map((opcao) => opcao.closest('label')?.textContent ?? '')
    expect(rotulos).toHaveLength(4)
    expect(rotulos[0]).toMatch(/^Tornar categoria principal/)
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

  it('tornar categoria principal envia parentId null e foca o no movido', async () => {
    const umidaPrincipal = { ...UMIDA, parentId: null, caminho: 'Úmida', nivel: 0 }
    const sachePrincipal = { ...SACHE, caminho: 'Úmida › Sachê' }
    listarCategoriasMock.mockResolvedValue(TODAS)
    atualizarCategoriaMock.mockResolvedValue(umidaPrincipal)

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))
    await escolherNoMenu('Úmida', 'Mover')
    const dialogo = await screen.findByRole('dialog', { name: 'Mover categoria' })
    fireEvent.click(within(dialogo).getByRole('radio', { name: /tornar categoria principal/i }))
    listarCategoriasMock.mockResolvedValue([BEBIDAS, { ...RACAO, quantidadeSubcategorias: 1 }, SECA, umidaPrincipal, sachePrincipal])
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Mover' }))

    await waitFor(() =>
      expect(atualizarCategoriaMock).toHaveBeenCalledWith('umida', { nome: 'Úmida', parentId: null }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('"Úmida" agora é uma categoria principal.')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Depois do refetch, o foco vai ao no na nova posicao (agora no primeiro nivel).
    await waitFor(() => expect(item('Úmida')).toHaveFocus())
    expect(item('Úmida')).toHaveAttribute('aria-level', '1')
  })

  it('cancelar o dialogo de mover devolve o foco ao botao "Mais" do no', async () => {
    listarCategoriasMock.mockResolvedValue(TODAS)

    renderPagina()
    await screen.findByRole('tree')
    await escolherNoMenu('Bebidas', 'Mover')
    const dialogo = await screen.findByRole('dialog', { name: 'Mover categoria' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(botaoMais('Bebidas')).toHaveFocus())
  })

  it('mantem o dialogo aberto com a mensagem do backend quando mover falha (409)', async () => {
    listarCategoriasMock.mockResolvedValue(TODAS)
    atualizarCategoriaMock.mockRejectedValue(
      new HttpError(409, 'Já existe uma categoria com este nome neste nível.'),
    )

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))
    await escolherNoMenu('Seca', 'Mover')
    const dialogo = await screen.findByRole('dialog', { name: 'Mover categoria' })
    fireEvent.click(within(dialogo).getByRole('radio', { name: /^Ração › Úmida$/ }))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Mover' }))

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Já existe uma categoria com este nome neste nível.',
    )
    expect(atualizarCategoriaMock).toHaveBeenCalledWith('seca', { nome: 'Seca', parentId: 'umida' })
  })

  it('excluir categoria com vinculos ja explica o motivo e oferece inativar', async () => {
    listarCategoriasMock.mockResolvedValue(TODAS)
    inativarCategoriaMock.mockResolvedValue({ ...RACAO, ativo: false })

    renderPagina()
    await screen.findByRole('tree')
    await escolherNoMenu('Ração', 'Excluir')
    const dialogo = await screen.findByRole('dialog', { name: 'Não é possível excluir "Ração"' })

    expect(dialogo).toHaveTextContent(
      'Esta categoria tem 2 subcategorias e 4 produtos, por isso não pode ser excluída.',
    )
    expect(dialogo).toHaveTextContent('Ela deixa de aparecer no cadastro de produtos; os produtos continuam com ela.')
    expect(within(dialogo).queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Inativar categoria' }))

    await waitFor(() => expect(inativarCategoriaMock).toHaveBeenCalledWith('racao'))
    expect(excluirCategoriaMock).not.toHaveBeenCalled()
    expect(await screen.findByRole('status')).toHaveTextContent('Categoria "Ração" inativada.')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(botaoMais('Ração')).toHaveFocus())
  })

  it('omite a parte zerada dos vinculos e usa o singular', async () => {
    listarCategoriasMock.mockResolvedValue(TODAS)

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Ração' }))
    await escolherNoMenu('Úmida', 'Excluir')

    expect(await screen.findByRole('dialog')).toHaveTextContent(
      'Esta categoria tem 1 subcategoria, por isso não pode ser excluída.',
    )
  })

  it('exclusao recusada por corrida (409) mostra o motivo enviado pelo backend', async () => {
    const mensagem =
      'Não é possível excluir: há 1 subcategoria(s) e 0 produto(s) nesta categoria. Mova-os ou inative a categoria.'
    listarCategoriasMock.mockResolvedValue(TODAS)
    excluirCategoriaMock.mockRejectedValue(new HttpError(409, mensagem))

    renderPagina()
    await screen.findByRole('tree')
    await escolherNoMenu('Bebidas', 'Excluir')
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir a categoria "Bebidas"?' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(excluirCategoriaMock).toHaveBeenCalledWith('bebidas'))
    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // A lista e recarregada para refletir os vinculos novos.
    await waitFor(() => expect(listarCategoriasMock).toHaveBeenCalledTimes(2))
  })

  it('exclui categoria sem vinculos e leva o foco ao no vizinho', async () => {
    listarCategoriasMock.mockResolvedValue([BEBIDAS, { ...RACAO, quantidadeSubcategorias: 0 }])
    excluirCategoriaMock.mockResolvedValue(undefined)

    renderPagina()
    await screen.findByRole('tree')
    await escolherNoMenu('Bebidas', 'Excluir')
    const dialogo = await screen.findByRole('dialog')
    listarCategoriasMock.mockResolvedValue([{ ...RACAO, quantidadeSubcategorias: 0 }])
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Categoria "Bebidas" excluída.')
    await waitFor(() => expect(screen.queryByRole('treeitem', { name: 'Bebidas' })).not.toBeInTheDocument())
    await waitFor(() => expect(item('Ração')).toHaveFocus())
  })

  it('inativa e reativa categorias pelo menu', async () => {
    listarCategoriasMock.mockResolvedValue([BEBIDAS, RACAO])
    inativarCategoriaMock.mockResolvedValue({ ...RACAO, ativo: false })
    reativarCategoriaMock.mockResolvedValue({ ...BEBIDAS, ativo: true })

    renderPagina()
    await screen.findByRole('tree')
    await escolherNoMenu('Ração', 'Inativar')
    await waitFor(() => expect(inativarCategoriaMock).toHaveBeenCalledWith('racao'))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Categoria "Ração" inativada. Ela e suas subcategorias deixam de aparecer no cadastro de produtos.',
    )

    await escolherNoMenu('Bebidas', 'Reativar')
    await waitFor(() => expect(reativarCategoriaMock).toHaveBeenCalledWith('bebidas'))
  })

  it('menu "Mais" segue o padrao de menu: foco no primeiro item, setas, Esc volta ao botao', async () => {
    listarCategoriasMock.mockResolvedValue([BEBIDAS])

    renderPagina()
    await screen.findByRole('tree')
    // So "Adicionar subcategoria" fica visivel na linha; o resto esta no menu.
    expect(screen.queryByRole('button', { name: /renomear|mover|excluir|inativar/i })).not.toBeInTheDocument()
    expect(botaoMais('Bebidas')).toHaveAttribute('aria-haspopup', 'menu')

    fireEvent.click(botaoMais('Bebidas'))
    const menu = await screen.findByRole('menu', { name: 'Mais ações para Bebidas' })
    const itens = within(menu).getAllByRole('menuitem')
    expect(itens.map((opcao) => opcao.textContent)).toEqual(['Renomear', 'Mover', 'Reativar', 'Excluir'])
    expect(itens[0]).toHaveFocus()

    fireEvent.keyDown(itens[0], { key: 'ArrowDown' })
    expect(itens[1]).toHaveFocus()
    fireEvent.keyDown(itens[1], { key: 'ArrowUp' })
    fireEvent.keyDown(itens[0], { key: 'ArrowUp' })
    expect(itens[3]).toHaveFocus()
    fireEvent.keyDown(itens[3], { key: 'Home' })
    expect(itens[0]).toHaveFocus()

    fireEvent.keyDown(itens[0], { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(botaoMais('Bebidas')).toHaveFocus())
  })

  it('ramo sob categoria inativa fica atenuado e explica na propria linha', async () => {
    const sucos = categoria('sucos', 'Sucos', 'bebidas', 'Bebidas › Sucos', { selecionavel: false, quantidadeProdutos: 1 })
    listarCategoriasMock.mockResolvedValue([BEBIDAS, sucos])

    renderPagina()
    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Bebidas' }))

    expect(within(item('Sucos')).getByText('Oculta — categoria acima inativa')).toBeInTheDocument()
    expect(item('Sucos')).toHaveAccessibleDescription('1 produto, oculta — categoria acima inativa')
    expect(screen.getByText('Sucos')).toHaveClass('text-muted-foreground')
    // A contagem do pai inclui a subarvore.
    expect(item('Bebidas')).toHaveAccessibleDescription('1 produto, inativa')
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
    expect(
      screen.queryByRole('button', { name: /renomear|mover|excluir|inativar|adicionar|mais ações/i }),
    ).not.toBeInTheDocument()

    item('Ração').focus()
    fireEvent.keyDown(item('Ração'), { key: 'Enter' })
    expect(item('Ração')).toHaveAttribute('aria-expanded', 'true')
  })
})
