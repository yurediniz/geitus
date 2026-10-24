import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { MarcasPage } from '@/features/catalog/MarcasPage'
import { useAuth } from '@/hooks/useAuth'
import { HttpError } from '@/services/httpClient'
import {
  atualizarMarca,
  cadastrarMarca,
  excluirMarca,
  inativarMarca,
  listarMarcas,
} from '@/services/marcaService'
import type { Marca } from '@/types/catalogo'

vi.mock('@/services/marcaService', () => ({
  listarMarcas: vi.fn(),
  cadastrarMarca: vi.fn(),
  atualizarMarca: vi.fn(),
  inativarMarca: vi.fn(),
  reativarMarca: vi.fn(),
  excluirMarca: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const listarMarcasMock = vi.mocked(listarMarcas)
const cadastrarMarcaMock = vi.mocked(cadastrarMarca)
const atualizarMarcaMock = vi.mocked(atualizarMarca)
const inativarMarcaMock = vi.mocked(inativarMarca)
const excluirMarcaMock = vi.mocked(excluirMarca)
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

function marca(id: string, nome: string, parentId: string | null, caminho: string, extras: Partial<Marca> = {}): Marca {
  return {
    id,
    nome,
    parentId,
    caminho,
    nivel: caminho.split(' › ').length - 1,
    ativo: true,
    selecionavel: true,
    quantidadeSubmarcas: 0,
    quantidadeProdutos: 0,
    quantidadeFornecedores: 0,
    criadoEm: '2026-10-24T10:00:00',
    atualizadoEm: null,
    ...extras,
  }
}

const BOEHRINGER = marca('boehringer', 'Boehringer', null, 'Boehringer', {
  quantidadeSubmarcas: 1,
  quantidadeProdutos: 4,
  quantidadeFornecedores: 2,
})
const NEXGARD = marca('nexgard', 'Nexgard', 'boehringer', 'Boehringer › Nexgard', { quantidadeProdutos: 3 })
const NESTLE = marca('nestle', 'Nestlé', null, 'Nestlé', { quantidadeFornecedores: 1 })
const GOLDEN = marca('golden', 'Golden', null, 'Golden')

const TODAS = [BOEHRINGER, NEXGARD, GOLDEN, NESTLE]

function renderPagina() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/produtos/marcas']}>
        <MarcasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function item(nome: string): HTMLElement {
  return screen.getByRole('treeitem', { name: nome })
}

async function escolherNoMenu(nome: string, acao: string) {
  fireEvent.click(screen.getByRole('button', { name: `Mais ações para ${nome}` }))
  const menu = await screen.findByRole('menu', { name: `Mais ações para ${nome}` })
  fireEvent.click(within(menu).getByRole('menuitem', { name: acao }))
}

describe('MarcasPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
  })

  it('mostra as abas na ordem da spec com Marcas atual e o titulo "Fabricantes e marcas"', async () => {
    listarMarcasMock.mockResolvedValue(TODAS)

    renderPagina()

    const abas = within(screen.getByRole('navigation', { name: 'Catálogo' })).getAllByRole('link')
    expect(abas.map((aba) => aba.textContent)).toEqual([
      'Produtos',
      'Categorias',
      'Marcas',
      'Fornecedores',
      'Unidades',
      'Balança',
    ])
    expect(within(screen.getByRole('navigation', { name: 'Catálogo' })).getByRole('link', { name: 'Marcas' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Fabricantes e marcas' })).toBeInTheDocument()
    expect(await screen.findByRole('tree', { name: 'Marcas' })).toBeInTheDocument()
  })

  it('mostra as contagens "N produtos · M fornecedores" (produtos da subarvore e fornecedores diretos)', async () => {
    listarMarcasMock.mockResolvedValue(TODAS)

    renderPagina()

    await screen.findByRole('tree')
    // 4 diretos + 3 em Nexgard; 2 fornecedores ligados a Boehringer.
    expect(within(item('Boehringer')).getByText('7 produtos · 2 fornecedores')).toBeInTheDocument()
    expect(item('Boehringer')).toHaveAccessibleDescription('7 produtos, 2 fornecedores')
    expect(item('Nestlé')).toHaveAccessibleDescription('1 fornecedor')
    expect(within(item('Golden')).queryByText(/produto|fornecedor/)).not.toBeInTheDocument()
  })

  it('mostra o estado vazio com a orientacao das marcas', async () => {
    listarMarcasMock.mockResolvedValue([])

    renderPagina()

    expect(await screen.findByText('Nenhuma marca ainda.')).toBeInTheDocument()
    expect(
      screen.getByText('Crie o primeiro fabricante, como Boehringer ou Nestlé, e as marcas dentro dele.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Criar fabricante' })).toBeInTheDocument()
  })

  it('cria uma submarca dentro do fabricante', async () => {
    listarMarcasMock.mockResolvedValue(TODAS)
    cadastrarMarcaMock.mockResolvedValue(marca('frontline', 'Frontline', 'boehringer', 'Boehringer › Frontline'))

    renderPagina()

    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar submarca em Boehringer' }))
    fireEvent.change(screen.getByLabelText('Nome da submarca de Boehringer'), { target: { value: ' Frontline ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }))

    await waitFor(() => expect(cadastrarMarcaMock).toHaveBeenCalledWith({ nome: 'Frontline', parentId: 'boehringer' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Submarca "Frontline" criada em "Boehringer".')
  })

  it('valida o nome vazio com o texto da marca', async () => {
    listarMarcasMock.mockResolvedValue(TODAS)

    renderPagina()

    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Novo fabricante' }))
    expect(screen.getByLabelText('Nome do novo fabricante')).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Criar fabricante' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o nome da marca.')
    expect(cadastrarMarcaMock).not.toHaveBeenCalled()
  })

  it('move a marca para a raiz e mostra o ciclo recusado pelo backend no dialogo', async () => {
    listarMarcasMock.mockResolvedValue(TODAS)
    atualizarMarcaMock.mockRejectedValueOnce(
      new HttpError(400, 'Uma marca não pode ficar dentro dela mesma ou de uma submarca sua.'),
    )
    atualizarMarcaMock.mockResolvedValueOnce({ ...NEXGARD, parentId: null, caminho: 'Nexgard', nivel: 0 })

    renderPagina()

    await screen.findByRole('tree')
    fireEvent.click(screen.getByRole('button', { name: 'Expandir Boehringer' }))
    await escolherNoMenu('Nexgard', 'Mover')
    const dialogo = await screen.findByRole('dialog', { name: 'Mover marca' })
    // A propria marca e as suas submarcas nao sao destino.
    expect(within(dialogo).queryByRole('radio', { name: /^Boehringer › Nexgard/ })).not.toBeInTheDocument()

    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Golden' }))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Mover' }))
    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(
      'Uma marca não pode ficar dentro dela mesma ou de uma submarca sua.',
    )

    fireEvent.click(within(dialogo).getByRole('radio', { name: 'Mover para o primeiro nível (fabricante)' }))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Mover' }))
    await waitFor(() => expect(atualizarMarcaMock).toHaveBeenLastCalledWith('nexgard', { nome: 'Nexgard', parentId: null }))
    expect(await screen.findByRole('status')).toHaveTextContent('"Nexgard" agora está no primeiro nível (fabricante).')
  })

  it('inativa a marca avisando que ela sai dos cadastros de produtos e fornecedores', async () => {
    listarMarcasMock.mockResolvedValue(TODAS)
    inativarMarcaMock.mockResolvedValue({ ...GOLDEN, ativo: false, selecionavel: false })

    renderPagina()

    await screen.findByRole('tree')
    await escolherNoMenu('Golden', 'Inativar')

    await waitFor(() => expect(inativarMarcaMock).toHaveBeenCalledWith('golden'))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Marca "Golden" inativada. Ela e suas submarcas deixam de aparecer nos cadastros de produtos e fornecedores.',
    )
  })

  it('nao exclui marca com submarca, produtos e fornecedores e oferece inativar', async () => {
    listarMarcasMock.mockResolvedValue(TODAS)

    renderPagina()

    await screen.findByRole('tree')
    await escolherNoMenu('Boehringer', 'Excluir')

    const dialogo = await screen.findByRole('dialog', { name: 'Não é possível excluir "Boehringer"' })
    expect(dialogo).toHaveTextContent(
      'Esta marca tem 1 submarca, 4 produtos e 2 fornecedores diretamente nela, por isso não pode ser excluída.',
    )
    expect(dialogo).toHaveTextContent(
      'Ela deixa de aparecer nos cadastros de produtos e fornecedores; os produtos e fornecedores continuam com ela.',
    )
    expect(within(dialogo).queryByRole('button', { name: 'Excluir' })).not.toBeInTheDocument()
    expect(within(dialogo).getByRole('button', { name: 'Inativar marca' })).toBeInTheDocument()
  })

  it('mostra o 409 do backend ao excluir (vinculo criado enquanto o dialogo estava aberto)', async () => {
    const mensagem =
      'Não é possível excluir: há 0 submarca(s), 0 produto(s) e 1 fornecedor(es) nesta marca. Mova-os ou inative a marca.'
    listarMarcasMock.mockResolvedValue(TODAS)
    excluirMarcaMock.mockRejectedValue(new HttpError(409, mensagem))

    renderPagina()

    await screen.findByRole('tree')
    await escolherNoMenu('Golden', 'Excluir')
    const dialogo = await screen.findByRole('dialog', { name: 'Excluir a marca "Golden"?' })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(excluirMarcaMock).toHaveBeenCalledWith('golden'))
    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem)
  })

  it('OPERADOR so le: sem acoes e com o aviso de modo leitura', async () => {
    definirPerfil('OPERADOR')
    listarMarcasMock.mockResolvedValue(TODAS)

    renderPagina()

    await screen.findByRole('tree')
    expect(
      screen.getByText('Somente administradores podem gerenciar marcas. Você está no modo leitura.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Novo fabricante' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Mais ações/ })).not.toBeInTheDocument()
  })
})
