import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { ConfiguracoesPage } from '@/features/settings/ConfiguracoesPage'
import { useAuth } from '@/hooks/useAuth'
import { AdminRoute } from '@/routes/AdminRoute'
import { criarPonto, inativarPonto, listarPontos, reativarPonto, renomearPonto } from '@/services/caixaService'
import { buscar, salvar } from '@/services/configuracaoCaixaService'
import { HttpError } from '@/services/httpClient'
import type { ConfiguracaoDoCaixa, PontoDeCaixa } from '@/types/caixa'

vi.mock('@/services/configuracaoCaixaService', () => ({
  buscar: vi.fn(),
  salvar: vi.fn(),
}))

vi.mock('@/services/caixaService', () => ({
  listarPontos: vi.fn(),
  criarPonto: vi.fn(),
  renomearPonto: vi.fn(),
  inativarPonto: vi.fn(),
  reativarPonto: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const buscarMock = vi.mocked(buscar)
const salvarMock = vi.mocked(salvar)
const listarPontosMock = vi.mocked(listarPontos)
const criarPontoMock = vi.mocked(criarPonto)
const renomearPontoMock = vi.mocked(renomearPonto)
const inativarPontoMock = vi.mocked(inativarPonto)
const reativarPontoMock = vi.mocked(reativarPonto)
const useAuthMock = vi.mocked(useAuth)

function definirPerfil(perfil: 'ADMIN' | 'OPERADOR') {
  useAuthMock.mockReturnValue({
    usuario: {
      id: 1,
      nome: 'Carlos Lima',
      email: 'carlos@mercado.com',
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

const CONFIGURACAO_PADRAO: ConfiguracaoDoCaixa = { fechamentoCego: true, atualizadoPorNome: null, atualizadoEm: null }

const CAIXA_1: PontoDeCaixa = { id: 'p-1', nome: 'Caixa 1', ativo: true, ultimoFundoTroco: 150, situacao: null }
const CAIXA_2: PontoDeCaixa = {
  id: 'p-2',
  nome: 'Caixa 2',
  ativo: true,
  ultimoFundoTroco: null,
  situacao: { status: 'ABERTA', sessaoId: 's-2', abertaPorNome: 'Ana Souza', abertaEm: '2026-10-24T08:02:00-03:00' },
}
const BALCAO: PontoDeCaixa = { id: 'p-3', nome: 'Balcão', ativo: false, ultimoFundoTroco: null, situacao: null }

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/configuracoes']}>
        <Routes>
          <Route element={<AdminRoute />}>
            <Route path="/configuracoes" element={<ConfiguracoesPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function interruptor() {
  return screen.findByRole('switch', { name: 'Fechamento cego' })
}

function listaDePontos() {
  return screen.getByRole('list', { name: 'Pontos de caixa' })
}

describe('ConfiguracoesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    salvarMock.mockReset()
    criarPontoMock.mockReset()
    renomearPontoMock.mockReset()
    inativarPontoMock.mockReset()
    definirPerfil('ADMIN')
    buscarMock.mockResolvedValue(CONFIGURACAO_PADRAO)
    listarPontosMock.mockResolvedValue([CAIXA_1, CAIXA_2, BALCAO])
    // "Hoje" fixo (a situacao do ponto mostra a hora da abertura): so o Date e falso.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T12:00:00-03:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('mostra a seção Caixa com o interruptor do fechamento cego e a frase da spec', async () => {
    renderPagina()

    expect(screen.getByRole('heading', { level: 1, name: 'Configurações' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Caixa' })).toBeInTheDocument()
    const campo = await interruptor()
    expect(campo).toHaveAttribute('aria-checked', 'true')
    expect(campo).toHaveAccessibleDescription(
      'Quem fecha o caixa informa o valor contado sem ver o esperado. A diferença aparece depois da contagem. ' +
        'Administradores continuam vendo o esperado. A mudança vale também para os caixas abertos que ainda não foram contados.',
    )
  })

  it('o interruptor salva ao alternar e mostra "Fechamento cego desligado"', async () => {
    const salva: ConfiguracaoDoCaixa = {
      fechamentoCego: false,
      atualizadoPorNome: 'Carlos Lima',
      atualizadoEm: '2026-10-24T09:15:00-03:00',
    }
    salvarMock.mockImplementation(async () => {
      // Depois de gravar, o servidor devolve o novo modo tambem na leitura.
      buscarMock.mockResolvedValue(salva)
      return salva
    })
    renderPagina()

    fireEvent.click(await interruptor())

    await waitFor(() => expect(salvarMock).toHaveBeenCalledWith({ fechamentoCego: false }))
    expect(await screen.findByRole('status')).toHaveTextContent('Fechamento cego desligado')
    expect(await interruptor()).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('Alterado por Carlos Lima em 24/10/2026 às 09:15.')).toBeInTheDocument()
  })

  it('em erro, o interruptor volta ao que era e a mensagem aparece', async () => {
    salvarMock.mockRejectedValue(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
    renderPagina()

    const campo = await interruptor()
    fireEvent.click(campo)

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar a configuração. Tente de novo.')
    await waitFor(() => expect(campo).toHaveAttribute('aria-checked', 'true'))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('falha ao carregar a configuração: mensagem e "Tentar de novo"', async () => {
    buscarMock.mockRejectedValueOnce(new HttpError(500, 'Requisicao falhou (HTTP 500).'))
    renderPagina()

    expect(await screen.findByText('Não foi possível carregar a configuração do caixa.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await interruptor()).toBeInTheDocument()
    expect(buscarMock).toHaveBeenCalledTimes(2)
  })

  it('lista os pontos com a situação e o status', async () => {
    renderPagina()

    const caixa1 = await screen.findByRole('listitem', { name: 'Caixa 1' })
    // A mesma frase da tela do caixa (a primeira letra fica maiuscula pelo CSS).
    expect(within(caixa1).getByText('livre')).toBeInTheDocument()
    const caixa2 = screen.getByRole('listitem', { name: 'Caixa 2' })
    expect(within(caixa2).getByText('aberto por Ana Souza às 08:02')).toBeInTheDocument()
    const balcao = screen.getByRole('listitem', { name: 'Balcão' })
    expect(within(balcao).getByText('Inativo')).toBeInTheDocument()
    expect(within(balcao).getByRole('button', { name: 'Reativar Balcão' })).toBeInTheDocument()
    expect(listarPontosMock).toHaveBeenCalledWith()
  })

  it('adiciona um ponto e avisa', async () => {
    criarPontoMock.mockResolvedValue({ ...CAIXA_1, id: 'p-4', nome: 'Caixa 3' })
    renderPagina()
    await screen.findByRole('listitem', { name: 'Caixa 1' })

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ponto' }))
    const nome = screen.getByLabelText('Nome do novo ponto')
    expect(nome).toHaveFocus()
    fireEvent.change(nome, { target: { value: '  Caixa 3 ' } })
    fireEvent.submit(nome.closest('form') as HTMLFormElement)

    await waitFor(() => expect(criarPontoMock).toHaveBeenCalledWith('Caixa 3'))
    expect(await screen.findByRole('status')).toHaveTextContent('Caixa 3 adicionado.')
    expect(screen.queryByLabelText('Nome do novo ponto')).not.toBeInTheDocument()
    // A lista e recarregada (prefixo ['caixa'] invalidado).
    await waitFor(() => expect(listarPontosMock).toHaveBeenCalledTimes(2))
  })

  it('nome repetido: a mensagem do servidor fica no campo', async () => {
    criarPontoMock.mockRejectedValue(
      new HttpError(409, 'Já existe um ponto de caixa com este nome.', { nome: 'Já existe um ponto de caixa com este nome.' }),
    )
    renderPagina()
    await screen.findByRole('listitem', { name: 'Caixa 1' })

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ponto' }))
    const nome = screen.getByLabelText('Nome do novo ponto')
    fireEvent.change(nome, { target: { value: 'caixa 1' } })
    fireEvent.submit(nome.closest('form') as HTMLFormElement)

    expect(await screen.findByText('Já existe um ponto de caixa com este nome.')).toBeInTheDocument()
    expect(nome).toHaveAttribute('aria-invalid', 'true')
    expect(nome).toHaveAccessibleDescription('Já existe um ponto de caixa com este nome.')
  })

  it('nome vazio não vai ao servidor', async () => {
    renderPagina()
    await screen.findByRole('listitem', { name: 'Caixa 1' })

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar ponto' }))
    const nome = screen.getByLabelText('Nome do novo ponto')
    fireEvent.submit(nome.closest('form') as HTMLFormElement)

    expect(await screen.findByText('Informe o nome do ponto.')).toBeInTheDocument()
    expect(criarPontoMock).not.toHaveBeenCalled()
  })

  it('renomeia em linha (Enter salva) e Esc cancela', async () => {
    renomearPontoMock.mockResolvedValue({ ...CAIXA_1, nome: 'Caixa Principal' })
    renderPagina()
    const caixa1 = await screen.findByRole('listitem', { name: 'Caixa 1' })

    fireEvent.click(within(caixa1).getByRole('button', { name: 'Renomear Caixa 1' }))
    let campo = within(caixa1).getByLabelText('Novo nome do Caixa 1')
    expect(campo).toHaveValue('Caixa 1')
    expect(campo).toHaveFocus()
    fireEvent.keyDown(campo, { key: 'Escape' })
    expect(within(caixa1).queryByLabelText('Novo nome do Caixa 1')).not.toBeInTheDocument()

    fireEvent.click(within(caixa1).getByRole('button', { name: 'Renomear Caixa 1' }))
    campo = within(caixa1).getByLabelText('Novo nome do Caixa 1')
    fireEvent.change(campo, { target: { value: 'Caixa Principal' } })
    fireEvent.submit(campo.closest('form') as HTMLFormElement)

    await waitFor(() => expect(renomearPontoMock).toHaveBeenCalledWith('p-1', 'Caixa Principal'))
    expect(await screen.findByRole('status')).toHaveTextContent('Ponto renomeado para Caixa Principal.')
  })

  it('inativar um ponto com caixa aberto mostra a mensagem do servidor', async () => {
    inativarPontoMock.mockRejectedValue(new HttpError(409, 'Feche o caixa deste ponto antes de inativá-lo.'))
    renderPagina()
    const caixa2 = await screen.findByRole('listitem', { name: 'Caixa 2' })

    fireEvent.click(within(caixa2).getByRole('button', { name: 'Inativar Caixa 2' }))

    await waitFor(() => expect(inativarPontoMock).toHaveBeenCalledWith('p-2'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Feche o caixa deste ponto antes de inativá-lo.')
  })

  it('ligar o fechamento cego avisa "Fechamento cego ligado"', async () => {
    buscarMock.mockResolvedValue({ ...CONFIGURACAO_PADRAO, fechamentoCego: false })
    salvarMock.mockResolvedValue({ ...CONFIGURACAO_PADRAO, fechamentoCego: true })
    renderPagina()

    const campo = await interruptor()
    expect(campo).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(campo)

    expect(await screen.findByRole('status')).toHaveTextContent('Fechamento cego ligado')
  })

  it('inativa e reativa', async () => {
    inativarPontoMock.mockResolvedValue({ ...CAIXA_1, ativo: false })
    reativarPontoMock.mockResolvedValue({ ...BALCAO, ativo: true })
    renderPagina()
    await screen.findByRole('listitem', { name: 'Caixa 1' })

    fireEvent.click(screen.getByRole('button', { name: 'Inativar Caixa 1' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Caixa 1 inativado.')

    fireEvent.click(screen.getByRole('button', { name: 'Reativar Balcão' }))
    await waitFor(() => expect(reativarPontoMock).toHaveBeenCalledWith('p-3'))
    expect(await screen.findByText('Balcão reativado.')).toBeInTheDocument()
    expect(listaDePontos()).toBeInTheDocument()
  })

  it('OPERADOR em /configuracoes é barrado pelo AdminRoute e nada é buscado', async () => {
    definirPerfil('OPERADOR')
    renderPagina()

    expect(await screen.findByText(/acesso restrito/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Configurações' })).not.toBeInTheDocument()
    expect(buscarMock).not.toHaveBeenCalled()
    expect(listarPontosMock).not.toHaveBeenCalled()
  })
})
