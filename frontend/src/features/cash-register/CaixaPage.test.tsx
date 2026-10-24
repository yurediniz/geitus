import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { CaixaPage } from '@/features/cash-register/CaixaPage'
import { useAuth } from '@/hooks/useAuth'
import { abrir, buscarSessao, contar, fechar, lancar, listarPontos, sessaoAtual } from '@/services/caixaService'
import { HttpError } from '@/services/httpClient'
import { ABERTA_AS_0802, movimentoDeTeste, pontoDeTeste, sessaoDeTeste } from '@/test/fixturesCaixa'
import type { SessaoDeCaixa } from '@/types/caixa'

vi.mock('@/services/caixaService', () => ({
  listarPontos: vi.fn(),
  sessaoAtual: vi.fn(),
  abrir: vi.fn(),
  lancar: vi.fn(),
  contar: vi.fn(),
  fechar: vi.fn(),
  buscarSessao: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const listarPontosMock = vi.mocked(listarPontos)
const sessaoAtualMock = vi.mocked(sessaoAtual)
const abrirMock = vi.mocked(abrir)
const lancarMock = vi.mocked(lancar)
const contarMock = vi.mocked(contar)
const fecharMock = vi.mocked(fechar)
const buscarSessaoMock = vi.mocked(buscarSessao)
const useAuthMock = vi.mocked(useAuth)

function definirPerfil(perfil: 'ADMIN' | 'OPERADOR', nome = 'Ana Souza') {
  useAuthMock.mockReturnValue({
    usuario: {
      id: 1,
      nome,
      email: 'usuario@mercado.com',
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

function renderPagina() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/caixa']}>
        <Routes>
          <Route path="/caixa" element={<CaixaPage />} />
          <Route path="/configuracoes" element={<h1>Tela de configurações</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

/** Promessa controlada pelo teste (o envio fica pendente ate resolver ou rejeitar). */
function adiada<T>() {
  let resolver: (valor: T) => void = () => {}
  let rejeitar: (erro: unknown) => void = () => {}
  const promessa = new Promise<T>((res, rej) => {
    resolver = res
    rejeitar = rej
  })
  return { promessa, resolver, rejeitar }
}

function enviarJanela() {
  fireEvent.submit(screen.getByRole('dialog').querySelector('form') as HTMLFormElement)
}

/** Abre a janela de sangria e preenche valor e motivo. */
async function prepararSangria(valor: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Sangria' }))
  const janela = screen.getByRole('dialog')
  fireEvent.change(within(janela).getByLabelText(/valor/i), { target: { value: valor } })
  fireEvent.change(within(janela).getByLabelText(/motivo/i), { target: { value: 'Depósito no cofre' } })
  return janela
}

function aviso() {
  return document.getElementById('caixa-aviso') as HTMLElement
}

const CAIXA_2_DA_ANA = pontoDeTeste({
  id: 'p-2',
  nome: 'Caixa 2',
  ultimoFundoTroco: null,
  situacao: { status: 'ABERTA', sessaoId: 's-ana', abertaPorNome: 'Ana Souza', abertaEm: ABERTA_AS_0802 },
})

function emConferencia(sessao: SessaoDeCaixa): SessaoDeCaixa {
  return {
    ...sessao,
    status: 'EM_CONFERENCIA',
    valorEsperado: 320,
    valorContado: 318,
    diferenca: -2,
    contadaPorNome: 'Ana Souza',
    contadaEm: '2026-10-24T18:00:00-03:00',
  }
}

function fechadaCom(sessao: SessaoDeCaixa, contado: number, diferenca: number, justificativa: string | null) {
  return {
    ...sessao,
    status: 'FECHADA' as const,
    valorEsperado: sessao.dinheiroNaGaveta ?? sessao.valorEsperado,
    valorContado: contado,
    diferenca,
    contadaPorNome: 'Ana Souza',
    contadaEm: '2026-10-24T18:00:00-03:00',
    justificativa,
    fechadaPorNome: 'Ana Souza',
    fechadaEm: '2026-10-24T18:00:00-03:00',
    podeOperar: false,
  }
}

describe('CaixaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const mock of [listarPontosMock, sessaoAtualMock, abrirMock, lancarMock, contarMock, fecharMock, buscarSessaoMock]) {
      mock.mockReset()
    }
    // "Hoje" fixo em Sao Paulo: so o Date e falso (os timers continuam reais).
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T12:00:00-03:00'))
    definirPerfil('OPERADOR')
    sessaoAtualMock.mockResolvedValue(null)
    listarPontosMock.mockResolvedValue([pontoDeTeste()])
    // Releitura da sessao depois de um 409: por padrao ela continua aberta.
    buscarSessaoMock.mockResolvedValue(sessaoDeTeste())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('subtítulo da página e link para o histórico', async () => {
    renderPagina()

    expect(screen.getByText('O dinheiro da gaveta do seu turno.')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Histórico' })).toHaveAttribute('href', '/caixa/historico')
  })

  describe('sem caixa aberto', () => {
    it('lista os pontos ativos com a situação; o OPERADOR não vê o caixa de outra pessoa', async () => {
      listarPontosMock.mockResolvedValue([pontoDeTeste(), CAIXA_2_DA_ANA])
      definirPerfil('OPERADOR', 'Beto Lima')
      renderPagina()

      const lista = await screen.findByRole('list', { name: 'Escolha o ponto de caixa' })
      const [caixa1, caixa2] = within(lista).getAllByRole('listitem')
      expect(caixa1).toHaveTextContent('Caixa 1 · livre')
      expect(within(caixa1).getByRole('button', { name: 'Abrir caixa no Caixa 1' })).toBeInTheDocument()
      expect(caixa2).toHaveTextContent('Caixa 2 · aberto por Ana Souza às 08:02')
      expect(within(caixa2).queryByRole('button')).not.toBeInTheDocument()
      expect(listarPontosMock).toHaveBeenCalledWith(true)
    })

    it('caixa esquecido aberto de outro dia aparece em âmbar, com o relógio', async () => {
      listarPontosMock.mockResolvedValue([
        pontoDeTeste(),
        {
          ...CAIXA_2_DA_ANA,
          situacao: { status: 'ABERTA', sessaoId: 's-ana', abertaPorNome: 'Ana Souza', abertaEm: '2026-10-23T08:02:00-03:00' },
        },
      ])
      renderPagina()

      const situacao = await screen.findByText('aberto por Ana Souza desde 23/10 às 08:02')
      expect(situacao).toHaveClass('text-warning-soft-foreground')
      expect(situacao.querySelector('svg')).not.toBeNull()
      expect(screen.getByText('livre')).toHaveClass('text-muted-foreground')
    })

    it('todos os caixas em uso: o OPERADOR é orientado', async () => {
      listarPontosMock.mockResolvedValue([CAIXA_2_DA_ANA])
      renderPagina()

      expect(await screen.findByRole('heading', { name: 'Todos os caixas estão em uso' })).toBeInTheDocument()
      expect(
        screen.getByText('Peça para fecharem um caixa ou peça ao administrador para cadastrar outro ponto.'),
      ).toBeInTheDocument()
    })

    it('todos os caixas em uso: o ADMIN pode ver os caixas ou ir para Configurações', async () => {
      definirPerfil('ADMIN', 'Carlos Lima')
      listarPontosMock.mockResolvedValue([CAIXA_2_DA_ANA])
      renderPagina()

      expect(await screen.findByRole('heading', { name: 'Todos os caixas estão em uso' })).toBeInTheDocument()
      expect(screen.getByText(/Você pode ver os caixas abertos ou cadastrar outro ponto em/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Configurações' })).toHaveAttribute('href', '/configuracoes')
      expect(screen.getByRole('button', { name: 'Ver caixa do Caixa 2' })).toBeInTheDocument()
    })

    it('um único ponto ativo e livre: "Abrir o Caixa 1" direto', async () => {
      renderPagina()

      expect(await screen.findByRole('button', { name: 'Abrir o Caixa 1' })).toBeInTheDocument()
      expect(screen.queryByRole('list', { name: 'Escolha o ponto de caixa' })).not.toBeInTheDocument()
    })

    it('abrir: fundo sugerido pelo último fundo, foco no campo, Enter abre e mostra "Caixa aberto"', async () => {
      const aberta = sessaoDeTeste({ movimentos: [], dinheiroNaGaveta: 150 })
      abrirMock.mockResolvedValue(aberta)
      sessaoAtualMock.mockResolvedValueOnce(null).mockResolvedValue(aberta)
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Caixa 1' }))
      const fundo = within(screen.getByRole('dialog')).getByLabelText(/fundo de troco/i)
      expect(fundo).toHaveValue('150,00')
      expect(fundo).toHaveFocus()
      expect(within(screen.getByRole('dialog')).getByText('(obrigatório)')).toBeInTheDocument()
      enviarJanela()

      await waitFor(() =>
        expect(abrirMock).toHaveBeenCalledWith({ pontoId: 'p-1', fundoTroco: 150, chave: expect.any(String) }),
      )
      expect(await screen.findByRole('status')).toHaveTextContent('Caixa aberto')
      expect(
        await screen.findByRole('heading', { name: 'Caixa 1 · aberto por você às 08:02' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(aviso()).toHaveFocus())
    })

    it('sem abertura anterior, o fundo vem vazio e é obrigatório (zero é aceito)', async () => {
      listarPontosMock.mockResolvedValue([pontoDeTeste({ ultimoFundoTroco: null })])
      abrirMock.mockResolvedValue(sessaoDeTeste())
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Caixa 1' }))
      const fundo = within(screen.getByRole('dialog')).getByLabelText(/fundo de troco/i)
      expect(fundo).toHaveValue('')
      enviarJanela()
      expect(await screen.findByText('Informe o fundo de troco. Pode ser R$ 0,00.')).toBeInTheDocument()
      expect(abrirMock).not.toHaveBeenCalled()

      fireEvent.change(fundo, { target: { value: '0,00' } })
      enviarJanela()
      await waitFor(() => expect(abrirMock).toHaveBeenCalledWith(expect.objectContaining({ fundoTroco: 0 })))
    })

    it('o botão fica desabilitado durante o envio e a nova tentativa reenvia a mesma chave', async () => {
      const primeiro = adiada<SessaoDeCaixa>()
      abrirMock.mockReturnValueOnce(primeiro.promessa).mockResolvedValueOnce(sessaoDeTeste())
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Caixa 1' }))
      const janela = screen.getByRole('dialog')
      enviarJanela()

      await waitFor(() => expect(within(janela).getByRole('button', { name: 'Abrir caixa' })).toBeDisabled())
      // Enter repetido durante o envio nao manda de novo.
      enviarJanela()
      expect(abrirMock).toHaveBeenCalledTimes(1)

      primeiro.rejeitar(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
      expect(await within(janela).findByRole('alert')).toHaveTextContent(
        'Não foi possível abrir o caixa. Confira a conexão e tente de novo.',
      )
      expect(within(janela).getByRole('button', { name: 'Abrir caixa' })).toBeEnabled()
      // Falha de rede: a tela nao recarrega (a janela e a chave ficam).
      expect(listarPontosMock).toHaveBeenCalledTimes(1)

      enviarJanela()
      await waitFor(() => expect(abrirMock).toHaveBeenCalledTimes(2))
      const [primeiraChave, segundaChave] = abrirMock.mock.calls.map(([dados]) => dados.chave)
      expect(segundaChave).toBe(primeiraChave)
    })

    it('ponto ocupado (409): a janela fecha e a mensagem do servidor vai para o aviso do topo', async () => {
      abrirMock.mockRejectedValue(new HttpError(409, 'O Caixa 1 já está aberto por Ana Souza.'))
      listarPontosMock
        .mockResolvedValueOnce([pontoDeTeste()])
        .mockResolvedValue([{ ...CAIXA_2_DA_ANA, id: 'p-1', nome: 'Caixa 1' }])
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Caixa 1' }))
      enviarJanela()

      expect(await screen.findByRole('alert')).toHaveTextContent('O Caixa 1 já está aberto por Ana Souza.')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByRole('heading', { name: 'Todos os caixas estão em uso' })).toBeInTheDocument()
      await waitFor(() => expect(aviso()).toHaveFocus())
    })

    it('ponto inativado em outra aba: o 409 aparece mesmo quando não sobra ponto ativo', async () => {
      abrirMock.mockRejectedValue(new HttpError(409, 'Este ponto de caixa está inativo.'))
      listarPontosMock.mockResolvedValueOnce([pontoDeTeste()]).mockResolvedValue([])
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Caixa 1' }))
      enviarJanela()

      expect(await screen.findByText('Nenhum ponto de caixa ativo')).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Este ponto de caixa está inativo.')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('outra aba já abriu o caixa: mostra o caixa aberto e avisa', async () => {
      const abertaNaOutraAba = sessaoDeTeste({ ponto: { id: 'p-2', nome: 'Caixa 2' } })
      sessaoAtualMock.mockResolvedValueOnce(null).mockResolvedValue(abertaNaOutraAba)
      abrirMock.mockRejectedValue(new HttpError(409, 'Você já tem um caixa aberto no Caixa 2.'))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Caixa 1' }))
      enviarJanela()

      expect(
        await screen.findByRole('heading', { name: 'Caixa 2 · aberto por você às 08:02' }),
      ).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Você já tem um caixa aberto no Caixa 2.')
    })

    it('último fundo de troco zero preenche o campo com "0,00"', async () => {
      listarPontosMock.mockResolvedValue([pontoDeTeste({ ultimoFundoTroco: 0 })])
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Caixa 1' }))

      expect(within(screen.getByRole('dialog')).getByLabelText(/fundo de troco/i)).toHaveValue('0,00')
    })

    it('nenhum ponto ativo: o ADMIN vê o caminho para Configurações', async () => {
      definirPerfil('ADMIN', 'Carlos Lima')
      listarPontosMock.mockResolvedValue([])
      renderPagina()

      expect(await screen.findByText('Nenhum ponto de caixa ativo')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ir para Configurações' })).toHaveAttribute('href', '/configuracoes')
    })

    it('nenhum ponto ativo: o OPERADOR é orientado a pedir ao administrador', async () => {
      listarPontosMock.mockResolvedValue([])
      renderPagina()

      expect(await screen.findByText('Nenhum ponto de caixa ativo')).toBeInTheDocument()
      expect(screen.getByText('Peça ao administrador para ativar um ponto de caixa.')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: /configurações/i })).not.toBeInTheDocument()
    })

    it('falha ao carregar: mensagem e "Tentar de novo"', async () => {
      sessaoAtualMock.mockRejectedValueOnce(new HttpError(500, 'Requisicao falhou (HTTP 500).'))
      renderPagina()

      expect(await screen.findByText('Não foi possível carregar o caixa.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

      expect(await screen.findByRole('button', { name: 'Abrir o Caixa 1' })).toBeInTheDocument()
    })
  })

  describe('com caixa aberto', () => {
    it('destaca "Dinheiro na gaveta R$ 320,00", com Sangria antes de Suprimento, e lista os movimentos com sinal', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste())
      renderPagina()

      const destaque = await screen.findByRole('region', { name: 'Dinheiro na gaveta' })
      expect(destaque).toHaveTextContent('R$ 320,00')
      const botoes = screen.getAllByRole('button').map((botao) => botao.textContent)
      expect(botoes.indexOf('Sangria')).toBeLessThan(botoes.indexOf('Suprimento'))
      const movimentos = screen.getByRole('list', { name: 'Movimentos do caixa' })
      const [suprimento, abertura] = within(movimentos).getAllByRole('listitem')
      expect(suprimento).toHaveTextContent('10:15')
      expect(suprimento).toHaveTextContent('Suprimento')
      expect(suprimento).toHaveTextContent('Reforço de troco')
      expect(suprimento).toHaveTextContent('+ R$ 170,00')
      expect(abertura).toHaveTextContent('Abertura')
      expect(abertura).toHaveTextContent('R$ 150,00')
      expect(abertura).not.toHaveTextContent(/[+−] R\$/)
      expect(screen.queryByText(/aberto desde/i)).not.toBeInTheDocument()
    })

    it('no modo cego, o OPERADOR vê a frase no lugar do valor esperado', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste({ fechamentoCego: true, dinheiroNaGaveta: null }))
      renderPagina()

      expect(
        await screen.findByText('Fechamento cego: o valor esperado aparece depois da contagem.'),
      ).toBeInTheDocument()
      expect(screen.queryByRole('region', { name: 'Dinheiro na gaveta' })).not.toBeInTheDocument()
    })

    it('gaveta zerada: mostra "R$ 0,00", e não a frase do modo cego', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste({ fechamentoCego: true, dinheiroNaGaveta: 0 }))
      renderPagina()

      expect(await screen.findByRole('region', { name: 'Dinheiro na gaveta' })).toHaveTextContent('R$ 0,00')
      expect(screen.queryByText(/Fechamento cego: o valor esperado/)).not.toBeInTheDocument()
    })

    it('modo cego: o lançamento de outra pessoa (valor oculto) mostra "Valor no fechamento", sem somar', async () => {
      sessaoAtualMock.mockResolvedValue(
        sessaoDeTeste({
          fechamentoCego: true,
          dinheiroNaGaveta: null,
          movimentos: [
            movimentoDeTeste({
              id: 'mov-do-admin',
              tipo: 'SANGRIA',
              valor: null,
              motivo: 'Depósito no cofre',
              usuarioNome: 'Carlos Lima',
              criadoEm: '2026-10-24T11:00:00-03:00',
            }),
            movimentoDeTeste(),
          ],
        }),
      )
      renderPagina()

      const movimentos = await screen.findByRole('list', { name: 'Movimentos do caixa' })
      const [doAdmin, abertura] = within(movimentos).getAllByRole('listitem')
      expect(within(doAdmin).getByText('Valor no fechamento')).toHaveClass('text-muted-foreground')
      expect(doAdmin).not.toHaveTextContent(/R\$/)
      expect(abertura).toHaveTextContent('R$ 150,00')
    })

    it('rede cai na sangria: a janela fica, a sessão não é relida e o retry reenvia a mesma chave', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste())
      lancarMock
        .mockRejectedValueOnce(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
        .mockResolvedValueOnce(sessaoDeTeste())
      renderPagina()

      const janela = await prepararSangria('20,00')
      enviarJanela()

      expect(await within(janela).findByRole('alert')).toHaveTextContent(
        'Não foi possível registrar a sangria. Confira a conexão e tente de novo.',
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(buscarSessaoMock).not.toHaveBeenCalled()
      expect(sessaoAtualMock).toHaveBeenCalledTimes(1)

      enviarJanela()
      expect(await screen.findByRole('status')).toHaveTextContent('Sangria de R$ 20,00 registrada')
      expect(lancarMock).toHaveBeenCalledTimes(2)
      expect(lancarMock.mock.calls[0][1].chave === lancarMock.mock.calls[1][1].chave).toBe(true)
    })

    it('suprimento acima do limite: o 400 do campo valor fica no campo Valor, com aria-invalid e foco', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste())
      lancarMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { valor: 'O valor passa do limite do caixa.' }),
      )
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Suprimento' }))
      const janela = screen.getByRole('dialog')
      const valor = within(janela).getByLabelText(/valor/i)
      fireEvent.change(valor, { target: { value: '9.999.999.999,00' } })
      const motivo = within(janela).getByLabelText(/motivo/i)
      fireEvent.change(motivo, { target: { value: 'Reforço de troco' } })
      motivo.focus()
      enviarJanela()

      expect(await within(janela).findByText('O valor passa do limite do caixa.')).toBeInTheDocument()
      expect(valor).toHaveAttribute('aria-invalid', 'true')
      expect(valor).toHaveAccessibleDescription('O valor passa do limite do caixa.')
      await waitFor(() => expect(valor).toHaveFocus())
      expect(within(janela).queryByRole('alert')).not.toBeInTheDocument()
    })

    it('aberto em outro dia: título sem hora e o aviso para fechar e abrir um novo', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste({ abertaEm: '2026-10-23T08:02:00-03:00' }))
      renderPagina()

      expect(await screen.findByRole('heading', { name: 'Caixa 1 · aberto por você' })).toBeInTheDocument()
      expect(
        screen.getByText('Aberto desde 23/10 às 08:02. Feche este caixa e abra um novo para hoje.'),
      ).toBeInTheDocument()
    })

    it('sangria registrada: avisa "Sangria de R$ 200,00 registrada" e recarrega a sessão', async () => {
      const sessao = sessaoDeTeste()
      sessaoAtualMock.mockResolvedValue(sessao)
      lancarMock.mockResolvedValue({ ...sessao, dinheiroNaGaveta: 120 })
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Sangria' }))
      const janela = screen.getByRole('dialog')
      expect(janela).toHaveAccessibleDescription('Retirada de dinheiro da gaveta do Caixa 1.')
      const valor = within(janela).getByLabelText(/valor/i)
      expect(valor).toHaveFocus()
      expect(within(janela).getByText('Na gaveta: R$ 320,00')).toBeInTheDocument()
      fireEvent.change(valor, { target: { value: '200,00' } })
      fireEvent.change(within(janela).getByLabelText(/motivo/i), { target: { value: 'Depósito no cofre' } })
      enviarJanela()

      await waitFor(() =>
        expect(lancarMock).toHaveBeenCalledWith('s-ana', {
          tipo: 'SANGRIA',
          valor: 200,
          motivo: 'Depósito no cofre',
          chave: expect.any(String),
        }),
      )
      expect(await screen.findByRole('status')).toHaveTextContent('Sangria de R$ 200,00 registrada')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(sessaoAtualMock).toHaveBeenCalledTimes(2))
    })

    it('suprimento registrado: avisa "Suprimento de R$ 50,00 registrado"', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste())
      lancarMock.mockResolvedValue(sessaoDeTeste())
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Suprimento' }))
      const janela = screen.getByRole('dialog')
      expect(janela).toHaveAccessibleDescription('Dinheiro colocado na gaveta do Caixa 1.')
      fireEvent.change(within(janela).getByLabelText(/valor/i), { target: { value: '50,00' } })
      fireEvent.change(within(janela).getByLabelText(/motivo/i), { target: { value: 'Reforço de troco' } })
      enviarJanela()

      expect(await screen.findByRole('status')).toHaveTextContent('Suprimento de R$ 50,00 registrado')
      expect(lancarMock).toHaveBeenCalledWith('s-ana', expect.objectContaining({ tipo: 'SUPRIMENTO', valor: 50 }))
    })

    it('valor e motivo obrigatórios na sangria', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste())
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Sangria' }))
      enviarJanela()

      expect(await screen.findByText('Informe um valor maior que zero.')).toBeInTheDocument()
      expect(screen.getByText('Informe o motivo.')).toBeInTheDocument()
      expect(lancarMock).not.toHaveBeenCalled()
    })

    it('sangria acima do esperado: relê a sessão (ainda aberta) e a janela mostra o 409 do servidor', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste({ dinheiroNaGaveta: 50 }))
      lancarMock.mockRejectedValue(new HttpError(409, 'A sangria passa do dinheiro na gaveta (R$ 50,00).'))
      renderPagina()

      const janela = await prepararSangria('50,01')
      enviarJanela()

      expect(await within(janela).findByRole('alert')).toHaveTextContent(
        'A sangria passa do dinheiro na gaveta (R$ 50,00).',
      )
      expect(buscarSessaoMock).toHaveBeenCalledWith('s-ana')
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('409 "registrada com outros dados": a nova tentativa vai com outra chave', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste())
      lancarMock
        .mockRejectedValueOnce(new HttpError(409, 'Esta operação já foi registrada com outros dados.'))
        .mockResolvedValueOnce(sessaoDeTeste())
      renderPagina()

      const janela = await prepararSangria('20,00')
      enviarJanela()
      expect(await within(janela).findByRole('alert')).toHaveTextContent(
        'Esta operação já foi registrada com outros dados.',
      )

      enviarJanela()
      await waitFor(() => expect(lancarMock).toHaveBeenCalledTimes(2))
      const [primeiraChave, segundaChave] = lancarMock.mock.calls.map(([, dados]) => dados.chave)
      expect(segundaChave).not.toBe(primeiraChave)
    })

    it('aba B com o caixa fechado na aba A: relê a sessão (fechada), avisa e volta à escolha do ponto', async () => {
      sessaoAtualMock.mockResolvedValueOnce(sessaoDeTeste()).mockResolvedValue(null)
      lancarMock.mockRejectedValue(new HttpError(409, 'Este caixa já foi fechado.'))
      buscarSessaoMock.mockResolvedValue(fechadaCom(sessaoDeTeste(), 320, 0, null))
      renderPagina()

      await prepararSangria('10,00')
      enviarJanela()

      expect(await screen.findByRole('alert')).toHaveTextContent('Este caixa já foi fechado.')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByRole('button', { name: 'Abrir o Caixa 1' })).toBeInTheDocument()
      expect(sessaoAtualMock).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('alert')).toHaveTextContent('Este caixa já foi fechado.')
      await waitFor(() => expect(aviso()).toHaveFocus())
    })

    it('404 na sangria: volta à tela inicial com a mensagem', async () => {
      sessaoAtualMock.mockResolvedValueOnce(sessaoDeTeste()).mockResolvedValue(null)
      lancarMock.mockRejectedValue(new HttpError(404, 'Requisicao falhou (HTTP 404).'))
      renderPagina()

      await prepararSangria('10,00')
      enviarJanela()

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Este caixa não está mais disponível. A tela foi atualizada.',
      )
      expect(await screen.findByRole('button', { name: 'Abrir o Caixa 1' })).toBeInTheDocument()
      expect(buscarSessaoMock).not.toHaveBeenCalled()
    })

    it('a aba B conta outro valor (409): fecha a janela, avisa no topo e mostra a conferência', async () => {
      const sessao = sessaoDeTeste({ fechamentoCego: true, dinheiroNaGaveta: null })
      sessaoAtualMock.mockResolvedValueOnce(sessao).mockResolvedValue(emConferencia(sessao))
      contarMock.mockRejectedValue(new HttpError(409, 'A contagem deste caixa já foi registrada.'))
      buscarSessaoMock.mockResolvedValue(emConferencia(sessao))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Fechar caixa' }))
      const janela = screen.getByRole('dialog')
      fireEvent.change(within(janela).getByLabelText('Dinheiro contado na gaveta'), { target: { value: '300,00' } })
      enviarJanela()

      expect(await screen.findByRole('alert')).toHaveTextContent('A contagem deste caixa já foi registrada.')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByText('Contagem registrada · falta a justificativa')).toBeInTheDocument()
      await waitFor(() => expect(aviso()).toHaveFocus())
    })

    it('modo trocado antes da contagem: o 400 "Informe a justificativa depois de ver a diferença." aparece', async () => {
      const naoCego = sessaoDeTeste({ fechamentoCego: false, dinheiroNaGaveta: 320 })
      // Depois do 400 a tela relê a sessao, agora no modo cego (o OPERADOR deixa de ver o esperado).
      sessaoAtualMock
        .mockResolvedValueOnce(naoCego)
        .mockResolvedValue({ ...naoCego, fechamentoCego: true, dinheiroNaGaveta: null })
      contarMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { justificativa: 'Informe a justificativa depois de ver a diferença.' }),
      )
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Fechar caixa' }))
      const janela = screen.getByRole('dialog')
      fireEvent.change(within(janela).getByLabelText('Dinheiro contado na gaveta'), { target: { value: '318,00' } })
      fireEvent.change(within(janela).getByLabelText(/justificativa/i), { target: { value: 'Troco' } })
      enviarJanela()

      expect(await within(janela).findByRole('button', { name: 'Conferir' })).toBeInTheDocument()
      expect(within(janela).getByRole('alert')).toHaveTextContent('Informe a justificativa depois de ver a diferença.')
      expect(within(janela).getByLabelText('Dinheiro contado na gaveta')).toHaveValue('318,00')
    })

    it('em conferência ao abrir a tela: "Contagem registrada · falta a justificativa" e "Justificar e fechar"', async () => {
      sessaoAtualMock.mockResolvedValue(emConferencia(sessaoDeTeste({ fechamentoCego: true })))
      renderPagina()

      expect(await screen.findByText('Contagem registrada · falta a justificativa')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Sangria' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Suprimento' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Justificar e fechar' }))
      const janela = screen.getByRole('dialog')
      expect(within(janela).queryByLabelText('Dinheiro contado na gaveta')).not.toBeInTheDocument()
      expect(within(janela).getByLabelText(/justificativa/i)).toHaveFocus()
      expect(within(janela).getByRole('button', { name: 'Justificar depois' })).toBeInTheDocument()
    })

    it('rede cai no fechamento: a janela fica sem recarregar, e o retry mostra "Caixa 1 fechado…" e o resumo', async () => {
      const sessao = emConferencia(sessaoDeTeste({ fechamentoCego: true }))
      sessaoAtualMock.mockResolvedValueOnce(sessao).mockResolvedValue(null)
      fecharMock
        .mockRejectedValueOnce(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
        .mockResolvedValueOnce(fechadaCom(sessao, 318, -2, 'Troco dado a mais'))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Justificar e fechar' }))
      const janela = screen.getByRole('dialog')
      fireEvent.change(within(janela).getByLabelText(/justificativa/i), { target: { value: 'Troco dado a mais' } })
      enviarJanela()

      expect(await within(janela).findByRole('alert')).toHaveTextContent(
        'Não foi possível fechar o caixa. Confira a conexão e tente de novo.',
      )
      expect(within(janela).getByLabelText(/justificativa/i)).toHaveValue('Troco dado a mais')
      expect(sessaoAtualMock).toHaveBeenCalledTimes(1)

      enviarJanela()

      expect(await screen.findByRole('status')).toHaveTextContent('Caixa 1 fechado com falta de R$ 2,00')
      expect(screen.getByRole('heading', { name: 'Caixa 1 fechado' })).toBeInTheDocument()
      expect(screen.getByText('Troco dado a mais')).toBeInTheDocument()
    })

    it('404 no fechamento: volta à tela inicial com a mensagem', async () => {
      sessaoAtualMock.mockResolvedValueOnce(emConferencia(sessaoDeTeste({ fechamentoCego: true }))).mockResolvedValue(null)
      fecharMock.mockRejectedValue(new HttpError(404, 'Requisicao falhou (HTTP 404).'))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Justificar e fechar' }))
      const janela = screen.getByRole('dialog')
      fireEvent.change(within(janela).getByLabelText(/justificativa/i), { target: { value: 'Troco' } })
      enviarJanela()

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Este caixa não está mais disponível. A tela foi atualizada.',
      )
      expect(await screen.findByRole('button', { name: 'Abrir o Caixa 1' })).toBeInTheDocument()
    })

    it('fechar o próprio caixa: resumo com o foco no título e "Abrir novo caixa", mesmo antes da recarga', async () => {
      const sessao = sessaoDeTeste()
      // Depois de fechar, a recarga da sessao atual fica pendente: a tela usa o cache ja limpo.
      sessaoAtualMock.mockResolvedValueOnce(sessao).mockReturnValue(new Promise<SessaoDeCaixa | null>(() => {}))
      contarMock.mockResolvedValue(fechadaCom(sessao, 318, -2, 'Troco dado a mais'))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Fechar caixa' }))
      const janela = screen.getByRole('dialog')
      fireEvent.change(within(janela).getByLabelText('Dinheiro contado na gaveta'), { target: { value: '318,00' } })
      fireEvent.change(within(janela).getByLabelText(/justificativa/i), { target: { value: 'Troco dado a mais' } })
      enviarJanela()

      expect(await screen.findByRole('status')).toHaveTextContent('Caixa 1 fechado com falta de R$ 2,00')
      const titulo = screen.getByRole('heading', { name: 'Caixa 1 fechado' })
      await waitFor(() => expect(titulo).toHaveFocus())
      expect(screen.getByText('Troco dado a mais')).toBeInTheDocument()
      expect(screen.getByText('Falta de R$ 2,00')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Abrir novo caixa' }))
      expect(await screen.findByRole('button', { name: 'Abrir o Caixa 1' })).toBeInTheDocument()
    })
  })

  describe('ADMIN', () => {
    it('sem caixa próprio, vê "Ver caixa" no ponto aberto por outra pessoa, com o aviso de que lança no próprio nome', async () => {
      definirPerfil('ADMIN', 'Carlos Lima')
      listarPontosMock.mockResolvedValue([pontoDeTeste(), CAIXA_2_DA_ANA])
      buscarSessaoMock.mockResolvedValue(sessaoDeTeste({ ponto: { id: 'p-2', nome: 'Caixa 2' } }))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Ver caixa do Caixa 2' }))

      await waitFor(() => expect(buscarSessaoMock).toHaveBeenCalledWith('s-ana'))
      expect(
        await screen.findByRole('heading', { name: 'Caixa 2 · aberto por Ana Souza às 08:02' }),
      ).toBeInTheDocument()
      expect(
        screen.getByText('Você está no caixa de Ana Souza. O que você lançar fica registrado no seu nome.'),
      ).toHaveClass('bg-info-soft')
    })

    it('com o próprio caixa aberto, fecha o caixa da OPERADORA: resumo "Caixa 2 fechado" e "Voltar" ao próprio caixa', async () => {
      definirPerfil('ADMIN', 'Carlos Lima')
      const propria = sessaoDeTeste({ id: 's-carlos', abertaPorNome: 'Carlos Lima', dinheiroNaGaveta: 500 })
      const daAna = sessaoDeTeste({ id: 's-ana', ponto: { id: 'p-2', nome: 'Caixa 2' }, dinheiroNaGaveta: 100 })
      const daAnaFechada = { ...fechadaCom(daAna, 100, 0, null), fechadaPorNome: 'Carlos Lima' }
      sessaoAtualMock.mockResolvedValue(propria)
      listarPontosMock.mockResolvedValue([
        pontoDeTeste({
          situacao: { status: 'ABERTA', sessaoId: 's-carlos', abertaPorNome: 'Carlos Lima', abertaEm: ABERTA_AS_0802 },
        }),
        CAIXA_2_DA_ANA,
      ])
      buscarSessaoMock.mockResolvedValueOnce(daAna).mockResolvedValue(daAnaFechada)
      contarMock.mockResolvedValue(daAnaFechada)
      renderPagina()

      // O proprio caixa, com os outros caixas abertos logo abaixo (sem o proprio).
      expect(await screen.findByRole('heading', { name: 'Caixa 1 · aberto por você às 08:02' })).toBeInTheDocument()
      const outros = await screen.findByRole('region', { name: 'Outros caixas abertos' })
      expect(within(outros).getAllByRole('listitem')).toHaveLength(1)
      fireEvent.click(within(outros).getByRole('button', { name: 'Ver caixa do Caixa 2' }))

      expect(
        await screen.findByRole('heading', { name: 'Caixa 2 · aberto por Ana Souza às 08:02' }),
      ).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Fechar caixa' }))
      const janela = screen.getByRole('dialog')
      expect(within(janela).getByText('Você está fechando o caixa aberto por Ana Souza.')).toBeInTheDocument()
      fireEvent.change(within(janela).getByLabelText('Dinheiro contado na gaveta'), { target: { value: '100,00' } })
      expect(within(janela).getByText('Confere')).toBeInTheDocument()
      fireEvent.click(within(janela).getByRole('button', { name: 'Fechar caixa' }))

      await waitFor(() => expect(contarMock).toHaveBeenCalledWith('s-ana', { valorContado: 100, justificativa: null }))
      expect(await screen.findByRole('status')).toHaveTextContent('Caixa 2 fechado')
      const titulo = await screen.findByRole('heading', { name: 'Caixa 2 fechado' })
      await waitFor(() => expect(titulo).toHaveFocus())
      expect(screen.getByText('Fechado por Carlos Lima em 24/10/2026 às 18:00.')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
      expect(await screen.findByRole('heading', { name: 'Caixa 1 · aberto por você às 08:02' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Dinheiro na gaveta' })).toHaveTextContent('R$ 500,00')
      // Nada foi feito na sessao do ADMIN.
      expect(contarMock).toHaveBeenCalledTimes(1)
      expect(fecharMock).not.toHaveBeenCalled()
      expect(lancarMock).not.toHaveBeenCalled()
    })

    it('no caixa de outra pessoa, um 409 de conferência mantém o ADMIN nele, recarregado', async () => {
      definirPerfil('ADMIN', 'Carlos Lima')
      listarPontosMock.mockResolvedValue([pontoDeTeste(), CAIXA_2_DA_ANA])
      const daAna = sessaoDeTeste({ id: 's-ana', ponto: { id: 'p-2', nome: 'Caixa 2' } })
      buscarSessaoMock.mockResolvedValueOnce(daAna).mockResolvedValue(emConferencia(daAna))
      lancarMock.mockRejectedValue(new HttpError(409, 'O caixa está em conferência. Termine o fechamento.'))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Ver caixa do Caixa 2' }))
      await screen.findByRole('heading', { name: 'Caixa 2 · aberto por Ana Souza às 08:02' })
      await prepararSangria('10,00')
      enviarJanela()

      expect(await screen.findByRole('alert')).toHaveTextContent('O caixa está em conferência. Termine o fechamento.')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByText('Contagem registrada · falta a justificativa')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Caixa 2 · aberto por Ana Souza às 08:02' })).toBeInTheDocument()
    })

    it('"Voltar" sai do caixa da outra pessoa', async () => {
      definirPerfil('ADMIN', 'Carlos Lima')
      listarPontosMock.mockResolvedValue([pontoDeTeste(), CAIXA_2_DA_ANA])
      buscarSessaoMock.mockResolvedValue(sessaoDeTeste({ ponto: { id: 'p-2', nome: 'Caixa 2' } }))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Ver caixa do Caixa 2' }))
      fireEvent.click(await screen.findByRole('button', { name: 'Voltar' }))

      expect(await screen.findByRole('list', { name: 'Escolha o ponto de caixa' })).toBeInTheDocument()
    })
  })
})
