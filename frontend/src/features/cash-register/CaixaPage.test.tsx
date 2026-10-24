import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { CaixaPage } from '@/features/cash-register/CaixaPage'
import { useAuth } from '@/hooks/useAuth'
import { abrir, buscarSessao, contar, fechar, lancar, listarPontos, sessaoAtual } from '@/services/caixaService'
import { HttpError } from '@/services/httpClient'
import { ABERTA_AS_0802, pontoDeTeste, sessaoDeTeste } from '@/test/fixturesCaixa'
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

const CAIXA_2_DA_ANA = pontoDeTeste({
  id: 'p-2',
  nome: 'Caixa 2',
  ultimoFundoTroco: null,
  situacao: { status: 'ABERTA', sessaoId: 's-ana', abertaPorNome: 'Ana Souza', abertaEm: ABERTA_AS_0802 },
})

function fechadaCom(sessao: SessaoDeCaixa, contado: number, diferenca: number, justificativa: string | null) {
  return {
    ...sessao,
    status: 'FECHADA' as const,
    valorEsperado: sessao.dinheiroNaGaveta,
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
  })

  afterEach(() => {
    vi.useRealTimers()
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
      const fundo = within(screen.getByRole('dialog')).getByLabelText('Fundo de troco')
      expect(fundo).toHaveValue('150,00')
      expect(fundo).toHaveFocus()
      enviarJanela()

      await waitFor(() =>
        expect(abrirMock).toHaveBeenCalledWith({ pontoId: 'p-1', fundoTroco: 150, chave: expect.any(String) }),
      )
      expect(await screen.findByRole('status')).toHaveTextContent('Caixa aberto')
      expect(
        await screen.findByRole('heading', { name: 'Caixa 1 · aberto por você às 08:02' }),
      ).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('sem abertura anterior, o fundo vem vazio e é obrigatório (zero é aceito)', async () => {
      listarPontosMock.mockResolvedValue([pontoDeTeste({ ultimoFundoTroco: null })])
      abrirMock.mockResolvedValue(sessaoDeTeste())
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Caixa 1' }))
      const fundo = within(screen.getByRole('dialog')).getByLabelText('Fundo de troco')
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

      enviarJanela()
      await waitFor(() => expect(abrirMock).toHaveBeenCalledTimes(2))
      const [primeiraChave, segundaChave] = abrirMock.mock.calls.map(([dados]) => dados.chave)
      expect(segundaChave).toBe(primeiraChave)
    })

    it('ponto ocupado (409): a mensagem do servidor aparece na janela', async () => {
      abrirMock.mockRejectedValue(new HttpError(409, 'O Caixa 1 já está aberto por Ana Souza.'))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Caixa 1' }))
      enviarJanela()

      expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent(
        'O Caixa 1 já está aberto por Ana Souza.',
      )
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
    it('destaca "Dinheiro na gaveta R$ 320,00" e lista os movimentos', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste())
      renderPagina()

      const destaque = await screen.findByRole('region', { name: 'Dinheiro na gaveta' })
      expect(destaque).toHaveTextContent('R$ 320,00')
      const movimentos = screen.getByRole('list', { name: 'Movimentos do caixa' })
      const [suprimento, abertura] = within(movimentos).getAllByRole('listitem')
      expect(suprimento).toHaveTextContent('10:15')
      expect(suprimento).toHaveTextContent('Suprimento')
      expect(suprimento).toHaveTextContent('Reforço de troco')
      expect(suprimento).toHaveTextContent('R$ 170,00')
      expect(abertura).toHaveTextContent('Abertura')
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

    it('aberto em outro dia: aviso "Aberto desde 23/10 às 08:02"', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste({ abertaEm: '2026-10-23T08:02:00-03:00' }))
      renderPagina()

      expect(await screen.findByText('Aberto desde 23/10 às 08:02')).toBeInTheDocument()
    })

    it('sangria registrada: avisa "Sangria de R$ 200,00 registrada" e recarrega a sessão', async () => {
      const sessao = sessaoDeTeste()
      sessaoAtualMock.mockResolvedValue(sessao)
      lancarMock.mockResolvedValue({ ...sessao, dinheiroNaGaveta: 120 })
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Sangria' }))
      const janela = screen.getByRole('dialog')
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

    it('sangria acima do esperado: a janela mostra o 409 do servidor', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste({ dinheiroNaGaveta: 50 }))
      lancarMock.mockRejectedValue(new HttpError(409, 'A sangria passa do dinheiro na gaveta (R$ 50,00).'))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Sangria' }))
      const janela = screen.getByRole('dialog')
      fireEvent.change(within(janela).getByLabelText(/valor/i), { target: { value: '50,01' } })
      fireEvent.change(within(janela).getByLabelText(/motivo/i), { target: { value: 'Depósito no cofre' } })
      enviarJanela()

      expect(await within(janela).findByRole('alert')).toHaveTextContent(
        'A sangria passa do dinheiro na gaveta (R$ 50,00).',
      )
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })

    it('aba B com o caixa fechado na aba A: mostra a mensagem, recarrega a sessão e volta à escolha do ponto', async () => {
      sessaoAtualMock.mockResolvedValueOnce(sessaoDeTeste()).mockResolvedValue(null)
      lancarMock.mockRejectedValue(new HttpError(409, 'Este caixa já foi fechado.'))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Sangria' }))
      const janela = screen.getByRole('dialog')
      fireEvent.change(within(janela).getByLabelText(/valor/i), { target: { value: '10,00' } })
      fireEvent.change(within(janela).getByLabelText(/motivo/i), { target: { value: 'Depósito no cofre' } })
      enviarJanela()

      expect(await screen.findByRole('alert')).toHaveTextContent('Este caixa já foi fechado.')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(await screen.findByRole('button', { name: 'Abrir o Caixa 1' })).toBeInTheDocument()
      expect(sessaoAtualMock).toHaveBeenCalledTimes(2)
      expect(screen.getByRole('alert')).toHaveTextContent('Este caixa já foi fechado.')
    })

    it('em conferência ao abrir a tela: "Contagem registrada · falta a justificativa" e a janela abre na justificativa', async () => {
      sessaoAtualMock.mockResolvedValue(
        sessaoDeTeste({
          status: 'EM_CONFERENCIA',
          fechamentoCego: true,
          valorEsperado: 320,
          valorContado: 318,
          diferenca: -2,
          contadaPorNome: 'Ana Souza',
          contadaEm: '2026-10-24T18:00:00-03:00',
        }),
      )
      renderPagina()

      expect(await screen.findByText('Contagem registrada · falta a justificativa')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Sangria' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Suprimento' })).not.toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Informar justificativa' }))
      const janela = screen.getByRole('dialog')
      expect(within(janela).queryByLabelText('Dinheiro contado na gaveta')).not.toBeInTheDocument()
      expect(within(janela).getByLabelText(/justificativa/i)).toHaveFocus()
    })

    it('fechar o próprio caixa: resumo do fechamento e "Abrir novo caixa"', async () => {
      const sessao = sessaoDeTeste()
      sessaoAtualMock.mockResolvedValueOnce(sessao).mockResolvedValue(null)
      contarMock.mockResolvedValue(fechadaCom(sessao, 318, -2, 'Troco dado a mais'))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Fechar caixa' }))
      const janela = screen.getByRole('dialog')
      fireEvent.change(within(janela).getByLabelText('Dinheiro contado na gaveta'), { target: { value: '318,00' } })
      fireEvent.change(within(janela).getByLabelText(/justificativa/i), { target: { value: 'Troco dado a mais' } })
      enviarJanela()

      expect(await screen.findByRole('status')).toHaveTextContent('Caixa fechado com falta de R$ 2,00')
      expect(screen.getByRole('heading', { name: 'Caixa 1 fechado' })).toBeInTheDocument()
      expect(screen.getByText('Troco dado a mais')).toBeInTheDocument()
      expect(screen.getByText('Falta de R$ 2,00')).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Abrir novo caixa' }))
      expect(await screen.findByRole('button', { name: 'Abrir o Caixa 1' })).toBeInTheDocument()
    })
  })

  describe('ADMIN', () => {
    it('sem caixa próprio, vê "Ver caixa" no ponto aberto por outra pessoa', async () => {
      definirPerfil('ADMIN', 'Carlos Lima')
      listarPontosMock.mockResolvedValue([pontoDeTeste(), CAIXA_2_DA_ANA])
      buscarSessaoMock.mockResolvedValue(sessaoDeTeste({ ponto: { id: 'p-2', nome: 'Caixa 2' } }))
      renderPagina()

      fireEvent.click(await screen.findByRole('button', { name: 'Ver caixa do Caixa 2' }))

      await waitFor(() => expect(buscarSessaoMock).toHaveBeenCalledWith('s-ana'))
      expect(
        await screen.findByRole('heading', { name: 'Caixa 2 · aberto por Ana Souza às 08:02' }),
      ).toBeInTheDocument()
    })

    it('com o próprio caixa aberto, fecha o caixa da OPERADORA e volta ao próprio caixa', async () => {
      definirPerfil('ADMIN', 'Carlos Lima')
      const propria = sessaoDeTeste({ id: 's-carlos', abertaPorNome: 'Carlos Lima', dinheiroNaGaveta: 500 })
      const daAna = sessaoDeTeste({ id: 's-ana', ponto: { id: 'p-2', nome: 'Caixa 2' }, dinheiroNaGaveta: 100 })
      sessaoAtualMock.mockResolvedValue(propria)
      listarPontosMock.mockResolvedValue([
        pontoDeTeste({
          situacao: { status: 'ABERTA', sessaoId: 's-carlos', abertaPorNome: 'Carlos Lima', abertaEm: ABERTA_AS_0802 },
        }),
        CAIXA_2_DA_ANA,
      ])
      buscarSessaoMock.mockResolvedValue(daAna)
      contarMock.mockResolvedValue({ ...fechadaCom(daAna, 100, 0, null), fechadaPorNome: 'Carlos Lima' })
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
      expect(await screen.findByRole('status')).toHaveTextContent('Caixa fechado')
      expect(await screen.findByRole('heading', { name: 'Caixa 1 · aberto por você às 08:02' })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Dinheiro na gaveta' })).toHaveTextContent('R$ 500,00')
      // Nada foi feito na sessao do ADMIN.
      expect(contarMock).toHaveBeenCalledTimes(1)
      expect(fecharMock).not.toHaveBeenCalled()
      expect(lancarMock).not.toHaveBeenCalled()
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
