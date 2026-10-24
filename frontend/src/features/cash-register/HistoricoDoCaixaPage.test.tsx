import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { HistoricoDoCaixaPage } from '@/features/cash-register/HistoricoDoCaixaPage'
import { useAuth } from '@/hooks/useAuth'
import { buscarSessao, listarPontos, listarSessoes } from '@/services/caixaService'
import { HttpError } from '@/services/httpClient'
import { movimentoDeTeste, pontoDeTeste, sessaoDeTeste } from '@/test/fixturesCaixa'
import type { SessaoDeCaixa, SessaoDeCaixaResumo } from '@/types/caixa'
import type { PaginaResponse } from '@/types/produto'

vi.mock('@/services/caixaService', () => ({
  TAMANHO_PAGINA_HISTORICO: 20,
  listarPontos: vi.fn(),
  listarSessoes: vi.fn(),
  buscarSessao: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const listarPontosMock = vi.mocked(listarPontos)
const listarSessoesMock = vi.mocked(listarSessoes)
const buscarSessaoMock = vi.mocked(buscarSessao)
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

/** Mostra a URL atual para os testes conferirem os filtros. */
function UrlAtual() {
  const location = useLocation()
  return <output data-testid="url">{`${location.pathname}${location.search}`}</output>
}

function renderPagina(entrada = '/caixa/historico') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[entrada]}>
        <Routes>
          <Route
            path="/caixa/historico"
            element={
              <>
                <HistoricoDoCaixaPage />
                <UrlAtual />
              </>
            }
          />
          <Route path="/caixa" element={<h1>Tela do caixa</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** O id do ponto e um UUID (a URL so aceita esse formato). */
const PONTO_2 = '7c0e8f3a-2b1d-4c5e-9f6a-0b1c2d3e4f50'

function semMovimentos({ movimentos: _movimentos, ...resumo }: SessaoDeCaixa): SessaoDeCaixaResumo {
  return resumo
}

const FECHADA_CONFERE = semMovimentos(
  sessaoDeTeste({
    id: 's-1',
    status: 'FECHADA',
    valorEsperado: 320,
    valorContado: 320,
    diferenca: 0,
    fechadaPorNome: 'Ana Souza',
    fechadaEm: '2026-10-24T18:05:00-03:00',
  }),
)
const FECHADA_COM_FALTA = semMovimentos(
  sessaoDeTeste({
    id: 's-2',
    ponto: { id: PONTO_2, nome: 'Caixa 2' },
    status: 'FECHADA',
    abertaPorNome: 'Beto Lima',
    valorEsperado: 200,
    valorContado: 198,
    diferenca: -2,
    justificativa: 'Troco dado a mais',
    fechadaPorNome: 'Carlos Lima',
    fechadaEm: '2026-10-24T19:00:00-03:00',
  }),
)
const ABERTA = semMovimentos(sessaoDeTeste({ id: 's-3', abertaEm: '2026-10-25T08:00:00-03:00' }))
const EM_CONFERENCIA = semMovimentos(
  sessaoDeTeste({ id: 's-4', status: 'EM_CONFERENCIA', valorEsperado: 100, valorContado: 90, diferenca: -10 }),
)

function pagina(itens: SessaoDeCaixaResumo[], totalItens = itens.length, numero = 0): PaginaResponse<SessaoDeCaixaResumo> {
  return { itens, pagina: numero, tamanho: 20, totalItens }
}

function url() {
  return screen.getByTestId('url').textContent
}

describe('HistoricoDoCaixaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarSessoesMock.mockReset()
    buscarSessaoMock.mockReset()
    definirPerfil('ADMIN')
    listarPontosMock.mockResolvedValue([pontoDeTeste(), pontoDeTeste({ id: PONTO_2, nome: 'Caixa 2', ativo: false })])
    listarSessoesMock.mockResolvedValue(pagina([FECHADA_CONFERE, FECHADA_COM_FALTA, ABERTA, EM_CONFERENCIA]))
  })

  it('mostra as colunas e a diferença com cor (verde quando confere, âmbar quando não)', async () => {
    renderPagina()

    const tabela = await screen.findByRole('table', { name: 'Sessões de caixa' })
    const cabecalhos = within(tabela)
      .getAllByRole('columnheader')
      .map((celula) => celula.textContent)
    expect(cabecalhos).toEqual(['Ponto', 'Aberto por', 'Fechado por', 'Esperado', 'Contado', 'Diferença'])

    const [, confere, falta] = within(tabela).getAllByRole('row')
    expect(confere).toHaveTextContent('Caixa 1')
    expect(confere).toHaveTextContent('Ana Souza')
    expect(confere).toHaveTextContent('24/10/2026 às 08:02')
    expect(confere).toHaveTextContent('24/10/2026 às 18:05')
    expect(confere).toHaveTextContent('R$ 320,00')
    expect(within(confere).getByText('Confere')).toHaveClass('text-success-soft-foreground')
    expect(falta).toHaveTextContent('Caixa 2')
    expect(falta).toHaveTextContent('Carlos Lima')
    expect(within(falta).getByText('Falta de R$ 2,00')).toHaveClass('text-warning-soft-foreground')
  })

  it('sessões não fechadas mostram "Aberto" ou "Em conferência"', async () => {
    renderPagina()

    const tabela = await screen.findByRole('table', { name: 'Sessões de caixa' })
    const [, , , aberta, conferencia] = within(tabela).getAllByRole('row')
    expect(within(aberta).getByText('Aberto')).toBeInTheDocument()
    expect(within(conferencia).getByText('Em conferência')).toBeInTheDocument()
    expect(within(conferencia).getByText('Falta de R$ 10,00')).toBeInTheDocument()
  })

  it('lê os filtros da URL e os manda na consulta', async () => {
    renderPagina(`/caixa/historico?ponto=${PONTO_2}&situacao=FECHADA&de=2026-10-01&ate=2026-10-24&pagina=2`)

    await screen.findByRole('table', { name: 'Sessões de caixa' })
    expect(listarSessoesMock).toHaveBeenCalledWith(
      { pontoId: PONTO_2, status: 'FECHADA', de: '2026-10-01', ate: '2026-10-24', pagina: 2 },
      expect.any(AbortSignal),
    )
    expect(await screen.findByLabelText('Ponto')).toHaveValue(PONTO_2)
    expect(screen.getByLabelText('Situação')).toHaveValue('FECHADA')
    expect(screen.getByLabelText('De')).toHaveValue('2026-10-01')
    expect(screen.getByLabelText('Até')).toHaveValue('2026-10-24')
  })

  it('mudar um filtro vai para a URL (voltando à página 1) e refaz a consulta', async () => {
    renderPagina('/caixa/historico?pagina=3')
    await screen.findByRole('table', { name: 'Sessões de caixa' })
    // Os pontos (ativos e inativos) entram no filtro.
    const ponto = await screen.findByLabelText('Ponto')
    await within(ponto).findByRole('option', { name: 'Caixa 2 (inativo)' })

    fireEvent.change(ponto, { target: { value: PONTO_2 } })
    expect(url()).toBe(`/caixa/historico?ponto=${PONTO_2}`)

    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'EM_CONFERENCIA' } })
    fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-01' } })
    fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-24' } })
    expect(url()).toBe(`/caixa/historico?ponto=${PONTO_2}&situacao=EM_CONFERENCIA&de=2026-10-01&ate=2026-10-24`)

    await waitFor(() =>
      expect(listarSessoesMock).toHaveBeenLastCalledWith(
        { pontoId: PONTO_2, status: 'EM_CONFERENCIA', de: '2026-10-01', ate: '2026-10-24', pagina: 1 },
        expect.any(AbortSignal),
      ),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }))
    expect(url()).toBe('/caixa/historico')
  })

  it('período invertido: avisa e não consulta', async () => {
    renderPagina('/caixa/historico?de=2026-10-24&ate=2026-10-01')

    expect(await screen.findByText('A data inicial é depois da data final.')).toBeInTheDocument()
    expect(listarSessoesMock).not.toHaveBeenCalled()
  })

  it('paginação com PaginacaoLista', async () => {
    listarSessoesMock.mockResolvedValue(pagina([FECHADA_CONFERE], 45))
    renderPagina()

    const paginacao = await screen.findByRole('navigation', { name: 'Paginação' })
    expect(paginacao).toHaveTextContent('1–20 de 45')
    fireEvent.click(within(paginacao).getByRole('button', { name: /próxima/i }))

    expect(url()).toBe('/caixa/historico?pagina=2')
    await waitFor(() =>
      expect(listarSessoesMock).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 }), expect.any(AbortSignal)),
    )
  })

  it('o clique na sessão abre o painel com os movimentos e a justificativa', async () => {
    buscarSessaoMock.mockResolvedValue({
      ...sessaoDeTeste({ ...FECHADA_COM_FALTA }),
      movimentos: [
        movimentoDeTeste({ id: 'm-2', tipo: 'SANGRIA', valor: 50, motivo: 'Depósito no cofre', criadoEm: '2026-10-24T12:30:00-03:00' }),
        movimentoDeTeste({ id: 'm-1', valor: 100, usuarioNome: 'Beto Lima' }),
      ],
    })
    renderPagina()

    const tabela = await screen.findByRole('table', { name: 'Sessões de caixa' })
    fireEvent.click(within(tabela).getByRole('button', { name: /Caixa 2/ }))

    const painel = await screen.findByRole('dialog')
    expect(within(painel).getByRole('heading', { name: 'Caixa 2' })).toBeInTheDocument()
    await waitFor(() => expect(buscarSessaoMock).toHaveBeenCalledWith('s-2'))
    const movimentos = await within(painel).findByRole('list', { name: 'Movimentos do caixa' })
    expect(within(movimentos).getAllByRole('listitem')).toHaveLength(2)
    expect(movimentos).toHaveTextContent('Depósito no cofre')
    expect(movimentos).toHaveTextContent('− R$ 50,00')
    expect(within(painel).getByText('Troco dado a mais')).toBeInTheDocument()
    expect(within(painel).getByText('Fechado por Carlos Lima em 24/10/2026 às 19:00.')).toBeInTheDocument()
  })

  it('falha ao carregar o detalhe: mensagem e "Tentar de novo" no painel', async () => {
    buscarSessaoMock.mockRejectedValueOnce(new HttpError(500, 'Requisicao falhou (HTTP 500).'))
    buscarSessaoMock.mockResolvedValueOnce(sessaoDeTeste({ ...FECHADA_CONFERE }))
    renderPagina()

    const tabela = await screen.findByRole('table', { name: 'Sessões de caixa' })
    fireEvent.click(within(tabela).getAllByRole('button', { name: /Caixa 1/ })[0])

    const painel = await screen.findByRole('dialog')
    expect(await within(painel).findByText('Não foi possível carregar este caixa.')).toBeInTheDocument()
    fireEvent.click(within(painel).getByRole('button', { name: 'Tentar de novo' }))
    expect(await within(painel).findByRole('list', { name: 'Movimentos do caixa' })).toBeInTheDocument()
  })

  it('vazio sem filtro: "Nenhum caixa registrado ainda."', async () => {
    listarSessoesMock.mockResolvedValue(pagina([]))
    renderPagina()

    expect(await screen.findByText('Nenhum caixa registrado ainda.')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Limpar filtros' })).not.toBeInTheDocument()
  })

  it('vazio com filtro: "Nenhum caixa com esses filtros." e "Limpar filtros"', async () => {
    listarSessoesMock.mockResolvedValue(pagina([]))
    renderPagina('/caixa/historico?situacao=EM_CONFERENCIA')

    expect(await screen.findByText('Nenhum caixa com esses filtros.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Limpar filtros' }).length).toBeGreaterThan(0)
  })

  it('?ponto= que não é UUID é ignorado', async () => {
    renderPagina('/caixa/historico?ponto=abc&situacao=FECHADA')

    await screen.findByRole('table', { name: 'Sessões de caixa' })
    expect(listarSessoesMock).toHaveBeenCalledWith(
      { pontoId: '', status: 'FECHADA', de: '', ate: '', pagina: 1 },
      expect.any(AbortSignal),
    )
  })

  it('o clique em qualquer lugar da linha também abre o detalhe', async () => {
    buscarSessaoMock.mockResolvedValue(sessaoDeTeste({ ...FECHADA_CONFERE }))
    renderPagina()

    const tabela = await screen.findByRole('table', { name: 'Sessões de caixa' })
    const [, primeira] = within(tabela).getAllByRole('row')
    expect(primeira).toHaveClass('cursor-pointer')
    // A celula do esperado (fora do botao do nome).
    fireEvent.click(within(primeira).getAllByRole('cell')[3])

    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await waitFor(() => expect(buscarSessaoMock).toHaveBeenCalledTimes(1))
  })

  it('detalhe de caixa aberto: subtítulo "Aberto por …" e, no modo cego sem o esperado, só os movimentos', async () => {
    const abertaCega = sessaoDeTeste({ id: 's-3', fechamentoCego: true, dinheiroNaGaveta: null })
    listarSessoesMock.mockResolvedValue(pagina([semMovimentos(abertaCega)]))
    buscarSessaoMock.mockResolvedValue(abertaCega)
    renderPagina()

    const tabela = await screen.findByRole('table', { name: 'Sessões de caixa' })
    fireEvent.click(within(tabela).getByRole('button', { name: /Caixa 1/ }))

    const painel = await screen.findByRole('dialog')
    expect(painel).toHaveAccessibleDescription('Aberto por Ana Souza em 24/10/2026 às 08:02')
    expect(await within(painel).findByRole('list', { name: 'Movimentos do caixa' })).toBeInTheDocument()
    // Fundo e totais permitiriam calcular o esperado: nao aparecem.
    expect(within(painel).queryByText('Suprimentos')).not.toBeInTheDocument()
    expect(within(painel).queryByText('Sangrias')).not.toBeInTheDocument()
    expect(within(painel).queryByText('Fundo de troco')).not.toBeInTheDocument()
    expect(within(painel).getByText('Fechamento cego: o valor esperado aparece depois da contagem.')).toBeInTheDocument()
  })

  it('erro: mensagem e "Tentar de novo"', async () => {
    listarSessoesMock.mockRejectedValueOnce(new HttpError(500, 'Requisicao falhou (HTTP 500).'))
    renderPagina()

    expect(await screen.findByText('Não foi possível carregar o histórico do caixa.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await screen.findByRole('table', { name: 'Sessões de caixa' })).toBeInTheDocument()
  })

  it('OPERADOR vê o aviso de que a lista traz só os caixas dele', async () => {
    definirPerfil('OPERADOR')
    renderPagina()

    expect(await screen.findByText('Aqui aparecem só os caixas que você abriu.')).toBeInTheDocument()
  })

  it('tem o caminho de volta para o caixa', async () => {
    renderPagina()

    expect(await screen.findByRole('link', { name: /voltar ao caixa/i })).toHaveAttribute('href', '/caixa')
  })
})
