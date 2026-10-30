import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { UnidadesPage } from '@/features/catalog/UnidadesPage'
import { useAuth } from '@/hooks/useAuth'
import { HttpError } from '@/services/httpClient'
import {
  atualizarUnidade,
  cadastrarUnidade,
  excluirUnidade,
  inativarUnidade,
  listarUnidades,
  reativarUnidade,
} from '@/services/unidadeService'
import type { UnidadeMedida } from '@/types/catalogo'

vi.mock('@/services/unidadeService', () => ({
  listarUnidades: vi.fn(),
  cadastrarUnidade: vi.fn(),
  atualizarUnidade: vi.fn(),
  inativarUnidade: vi.fn(),
  reativarUnidade: vi.fn(),
  excluirUnidade: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const listarUnidadesMock = vi.mocked(listarUnidades)
const cadastrarUnidadeMock = vi.mocked(cadastrarUnidade)
const atualizarUnidadeMock = vi.mocked(atualizarUnidade)
const inativarUnidadeMock = vi.mocked(inativarUnidade)
const reativarUnidadeMock = vi.mocked(reativarUnidade)
const excluirUnidadeMock = vi.mocked(excluirUnidade)
const useAuthMock = vi.mocked(useAuth)

function definirPerfil(perfil: 'ADMIN' | 'OPERADOR') {
  useAuthMock.mockReturnValue({
    usuario: {
      id: 1,
      nome: 'Ana Souza',
      email: 'ana@mercado.com',
      perfil,
      empresa: { id: 1, nome: 'Mercado Central', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
    },
    token: 'token',
    estaAutenticado: true,
    carregandoSessao: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

function unidade(parcial: Partial<UnidadeMedida> & Pick<UnidadeMedida, 'id' | 'sigla' | 'descricao'>): UnidadeMedida {
  return {
    fracionada: false,
    ativo: true,
    emUso: 0,
    criadoEm: '2026-10-20T10:00:00',
    atualizadoEm: null,
    ...parcial,
  }
}

const UN = unidade({ id: 'u-un', sigla: 'UN', descricao: 'Unidade', emUso: 3 })
const KG = unidade({ id: 'u-kg', sigla: 'KG', descricao: 'Quilograma', fracionada: true })
const DZ = unidade({ id: 'u-dz', sigla: 'DZ', descricao: 'Dúzia', ativo: false })

function renderPagina() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/produtos/unidades']}>
        <UnidadesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

async function linhaDa(sigla: string): Promise<HTMLElement> {
  const celula = await screen.findByRole('cell', { name: sigla })
  const linha = celula.closest('tr')
  expect(linha).not.toBeNull()
  return linha as HTMLElement
}

describe('UnidadesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    definirPerfil('ADMIN')
  })

  it('lista as unidades com fracionada, uso e status', async () => {
    listarUnidadesMock.mockResolvedValue([DZ, KG, UN])

    renderPagina()

    const linhaUn = await linhaDa('UN')
    expect(listarUnidadesMock).toHaveBeenCalledWith()
    expect(within(linhaUn).getByText('Unidade')).toBeInTheDocument()
    expect(within(linhaUn).getByText('Não')).toBeInTheDocument()
    expect(within(linhaUn).getByText('3')).toBeInTheDocument()
    expect(within(linhaUn).getByText('Ativa')).toBeInTheDocument()
    expect(within(await linhaDa('KG')).getByText('Sim')).toBeInTheDocument()
    expect(within(await linhaDa('DZ')).getByText('Inativa')).toBeInTheDocument()
    // A navegacao do catalogo fica no menu lateral, nao em abas na pagina.
    expect(screen.queryByRole('navigation', { name: 'Catálogo' })).not.toBeInTheDocument()
  })

  it('exibe carregamento e erro com tentar novamente', async () => {
    listarUnidadesMock.mockRejectedValueOnce(new HttpError(500, 'x')).mockResolvedValueOnce([UN])

    renderPagina()

    expect(screen.getByText(/carregando unidades/i)).toBeInTheDocument()
    expect(await screen.findByText('Não foi possível carregar as unidades.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }))
    expect(await linhaDa('UN')).toBeInTheDocument()
  })

  it('converte a sigla para maiusculas ao digitar e exibe a sigla devolvida pelo backend', async () => {
    listarUnidadesMock.mockResolvedValue([UN])
    const criada = unidade({ id: 'u-lt', sigla: 'LT', descricao: 'Litro', fracionada: true })
    cadastrarUnidadeMock.mockResolvedValue(criada)

    renderPagina()
    await linhaDa('UN')
    fireEvent.click(screen.getByRole('button', { name: /nova unidade/i }))
    fireEvent.change(screen.getByLabelText(/^sigla$/i), { target: { value: 'lt' } })
    expect(screen.getByLabelText(/^sigla$/i)).toHaveValue('LT')
    fireEvent.change(screen.getByLabelText(/^descrição$/i), { target: { value: 'Litro' } })
    fireEvent.click(screen.getByLabelText(/aceita quantidade fracionada/i))
    listarUnidadesMock.mockResolvedValue([criada, UN])
    fireEvent.click(screen.getByRole('button', { name: /salvar unidade/i }))

    await waitFor(() =>
      expect(cadastrarUnidadeMock).toHaveBeenCalledWith({ sigla: 'LT', descricao: 'Litro', fracionada: true }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Unidade LT cadastrada com sucesso.')
    expect(await linhaDa('LT')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^sigla$/i)).not.toBeInTheDocument()
  })

  it('valida sigla e descricao obrigatorias sem chamar o backend', async () => {
    listarUnidadesMock.mockResolvedValue([UN])

    renderPagina()
    await linhaDa('UN')
    fireEvent.click(screen.getByRole('button', { name: /nova unidade/i }))
    fireEvent.click(screen.getByRole('button', { name: /salvar unidade/i }))

    expect(await screen.findByText('Informe a sigla.')).toBeInTheDocument()
    expect(screen.getByText('Informe a descrição.')).toBeInTheDocument()
    expect(cadastrarUnidadeMock).not.toHaveBeenCalled()
  })

  it('mostra no formulario a mensagem do backend quando a sigla ja existe (409)', async () => {
    listarUnidadesMock.mockResolvedValue([UN])
    cadastrarUnidadeMock.mockRejectedValue(new HttpError(409, 'Já existe uma unidade com esta sigla.'))

    renderPagina()
    await linhaDa('UN')
    fireEvent.click(screen.getByRole('button', { name: /nova unidade/i }))
    fireEvent.change(screen.getByLabelText(/^sigla$/i), { target: { value: 'un' } })
    fireEvent.change(screen.getByLabelText(/^descrição$/i), { target: { value: 'Unidade' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar unidade/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe uma unidade com esta sigla.')
    expect(screen.getByLabelText(/^sigla$/i)).toBeInTheDocument()
  })

  it('edita uma unidade enviando os dados pelo UUID', async () => {
    listarUnidadesMock.mockResolvedValue([KG])
    atualizarUnidadeMock.mockResolvedValue({ ...KG, descricao: 'Quilo' })

    renderPagina()
    await linhaDa('KG')
    fireEvent.click(screen.getByRole('button', { name: 'Editar KG' }))
    expect(screen.getByLabelText(/^sigla$/i)).toHaveValue('KG')
    fireEvent.change(screen.getByLabelText(/^descrição$/i), { target: { value: 'Quilo' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar unidade/i }))

    await waitFor(() =>
      expect(atualizarUnidadeMock).toHaveBeenCalledWith('u-kg', { sigla: 'KG', descricao: 'Quilo', fracionada: true }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Unidade KG atualizada com sucesso.')
  })

  it('400 em fracionada (produto movimentado) mostra o erro junto ao checkbox', async () => {
    const mensagem = 'Esta unidade é usada por produtos com movimentação de estoque.'
    listarUnidadesMock.mockResolvedValue([KG])
    atualizarUnidadeMock.mockRejectedValue(new HttpError(400, 'Dados invalidos.', { fracionada: mensagem }))

    renderPagina()
    await linhaDa('KG')
    fireEvent.click(screen.getByRole('button', { name: 'Editar KG' }))
    const checkbox = screen.getByLabelText(/aceita quantidade fracionada/i)
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: /salvar unidade/i }))

    expect(await screen.findByText(mensagem)).toBeInTheDocument()
    expect(checkbox).toHaveAttribute('aria-invalid', 'true')
    expect(checkbox).toHaveAccessibleDescription(mensagem)
  })

  it('desabilita excluir quando a unidade esta em uso, com a dica de uso', async () => {
    listarUnidadesMock.mockResolvedValue([UN])

    renderPagina()

    const linha = await linhaDa('UN')
    const excluir = within(linha).getByRole('button', { name: 'Excluir UN' })
    expect(excluir).toBeDisabled()
    expect(excluir).toHaveAccessibleDescription('Em uso por 3 produto(s)')
    expect(excluir.parentElement).toHaveAttribute('title', 'Em uso por 3 produto(s)')
  })

  it('exclui unidade sem uso apos confirmar', async () => {
    listarUnidadesMock.mockResolvedValue([KG])
    excluirUnidadeMock.mockResolvedValue(undefined)

    renderPagina()
    const linha = await linhaDa('KG')
    fireEvent.click(within(linha).getByRole('button', { name: 'Excluir KG' }))
    const dialogo = await screen.findByRole('dialog')
    expect(dialogo).toHaveTextContent('Excluir a unidade KG?')
    listarUnidadesMock.mockResolvedValue([])
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(excluirUnidadeMock).toHaveBeenCalledWith('u-kg'))
    expect(await screen.findByRole('status')).toHaveTextContent('Unidade KG excluída.')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // A linha sumiu: o foco vai para o titulo da lista, nao se perde no body.
    await waitFor(() => expect(screen.getByText('Unidades cadastradas')).toHaveFocus())
  })

  it('cancelar a exclusao devolve o foco ao botao de origem', async () => {
    listarUnidadesMock.mockResolvedValue([KG])

    renderPagina()
    const excluir = within(await linhaDa('KG')).getByRole('button', { name: 'Excluir KG' })
    excluir.focus()
    fireEvent.click(excluir)
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(excluir).toHaveFocus())
  })

  it('exibe a mensagem do backend quando a exclusao responde 409', async () => {
    const mensagem =
      'Esta unidade está em uso por 2 produto(s). Inative-a para que não apareça em novos cadastros.'
    listarUnidadesMock.mockResolvedValue([KG])
    excluirUnidadeMock.mockRejectedValue(new HttpError(409, mensagem))

    renderPagina()
    const linha = await linhaDa('KG')
    fireEvent.click(within(linha).getByRole('button', { name: 'Excluir KG' }))
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(mensagem)
  })

  it('inativa e reativa unidades', async () => {
    listarUnidadesMock.mockResolvedValue([KG, DZ])
    inativarUnidadeMock.mockResolvedValue({ ...KG, ativo: false })
    reativarUnidadeMock.mockResolvedValue({ ...DZ, ativo: true })

    renderPagina()
    fireEvent.click(within(await linhaDa('KG')).getByRole('button', { name: 'Inativar KG' }))
    await waitFor(() => expect(inativarUnidadeMock).toHaveBeenCalledWith('u-kg'))
    expect(await screen.findByRole('status')).toHaveTextContent('Unidade KG inativada.')

    fireEvent.click(within(await linhaDa('DZ')).getByRole('button', { name: 'Reativar DZ' }))
    await waitFor(() => expect(reativarUnidadeMock).toHaveBeenCalledWith('u-dz'))
  })

  it('OPERADOR ve a lista em modo leitura, sem acoes', async () => {
    definirPerfil('OPERADOR')
    listarUnidadesMock.mockResolvedValue([UN, KG])

    renderPagina()

    await linhaDa('UN')
    expect(screen.getByText(/você está no modo leitura/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /nova unidade/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /editar/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /inativar/i })).not.toBeInTheDocument()
  })
})
