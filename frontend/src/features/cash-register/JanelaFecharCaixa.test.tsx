import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { JanelaFecharCaixa } from '@/features/cash-register/JanelaFecharCaixa'
import { buscarSessao, contar, fechar } from '@/services/caixaService'
import { HttpError } from '@/services/httpClient'
import { sessaoDeTeste } from '@/test/fixturesCaixa'
import type { SessaoDeCaixa } from '@/types/caixa'

vi.mock('@/services/caixaService', () => ({
  contar: vi.fn(),
  fechar: vi.fn(),
  buscarSessao: vi.fn(),
}))

const contarMock = vi.mocked(contar)
const fecharMock = vi.mocked(fechar)
const buscarSessaoMock = vi.mocked(buscarSessao)

const NAO_CEGO = sessaoDeTeste({ fechamentoCego: false, dinheiroNaGaveta: 320 })
// OPERADOR no modo cego: o backend nao manda o esperado enquanto a sessao esta aberta.
const CEGO = sessaoDeTeste({ fechamentoCego: true, dinheiroNaGaveta: null })

function emConferencia(base: SessaoDeCaixa): SessaoDeCaixa {
  return {
    ...base,
    status: 'EM_CONFERENCIA',
    dinheiroNaGaveta: 320,
    valorEsperado: 320,
    valorContado: 318,
    diferenca: -2,
    contadaPorNome: 'Ana Souza',
    contadaEm: '2026-10-24T18:00:00-03:00',
  }
}

function fechada(base: SessaoDeCaixa, justificativa: string | null = null): SessaoDeCaixa {
  return {
    ...emConferencia(base),
    status: 'FECHADA',
    justificativa,
    fechadaPorNome: 'Ana Souza',
    fechadaEm: '2026-10-24T18:01:00-03:00',
  }
}

const aoConcluir = vi.fn()
const aoFechar = vi.fn()
const aoMudarDeEstado = vi.fn()
let queryClient: QueryClient

function arvore(sessao: SessaoDeCaixa, deOutraPessoa: boolean) {
  return (
    <QueryClientProvider client={queryClient}>
      <JanelaFecharCaixa
        aberto
        sessao={sessao}
        deOutraPessoa={deOutraPessoa}
        aoFechar={aoFechar}
        aoConcluir={aoConcluir}
        aoMudarDeEstado={aoMudarDeEstado}
      />
    </QueryClientProvider>
  )
}

function renderJanela(sessao: SessaoDeCaixa, deOutraPessoa = false) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const { rerender } = render(arvore(sessao, deOutraPessoa))
  return Object.assign(screen.getByRole('dialog'), {
    /** A sessao recarregada pela tela (ex.: o modo trocado). */
    trocarSessao: (nova: SessaoDeCaixa) => rerender(arvore(nova, deOutraPessoa)),
  })
}

function campoContado() {
  return screen.getByLabelText('Dinheiro contado na gaveta')
}

function digitarContado(texto: string) {
  fireEvent.change(campoContado(), { target: { value: texto } })
}

function enviar() {
  fireEvent.submit(screen.getByRole('dialog').querySelector('form') as HTMLFormElement)
}

describe('JanelaFecharCaixa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    contarMock.mockReset()
    fecharMock.mockReset()
    buscarSessaoMock.mockReset()
  })

  describe('modo não cego', () => {
    it('foco no campo; o esperado aparece e a diferença atualiza enquanto digita', () => {
      const janela = renderJanela(NAO_CEGO)

      expect(campoContado()).toHaveFocus()
      expect(within(janela).getByText('Esperado R$ 320,00')).toBeInTheDocument()

      digitarContado('320,00')
      expect(within(janela).getByText('Confere')).toBeInTheDocument()
      expect(screen.queryByLabelText(/justificativa/i)).not.toBeInTheDocument()

      digitarContado('318,00')
      expect(within(janela).getByText('Falta de R$ 2,00')).toBeInTheDocument()

      digitarContado('322,50')
      expect(within(janela).getByText('Sobra de R$ 2,50')).toBeInTheDocument()
      expect(within(janela).getByRole('button', { name: 'Fechar caixa' })).toBeInTheDocument()
    })

    it('com diferença, a justificativa é obrigatória e vai no mesmo POST da contagem', async () => {
      contarMock.mockResolvedValue(fechada(NAO_CEGO, 'Troco dado a mais'))
      renderJanela(NAO_CEGO)

      digitarContado('318,00')
      const justificativa = screen.getByLabelText(/justificativa/i)
      enviar()

      expect(await screen.findByText('Explique a diferença para fechar o caixa.')).toBeInTheDocument()
      expect(justificativa).toHaveAttribute('aria-invalid', 'true')
      expect(contarMock).not.toHaveBeenCalled()

      fireEvent.change(justificativa, { target: { value: '  Troco dado a mais ' } })
      enviar()

      await waitFor(() =>
        expect(contarMock).toHaveBeenCalledWith(NAO_CEGO.id, { contagens: { DINHEIRO: 318 }, justificativa: 'Troco dado a mais' }),
      )
      expect(fecharMock).not.toHaveBeenCalled()
      await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith(expect.objectContaining({ status: 'FECHADA' })))
    })

    it('sem diferença, fecha direto sem justificativa', async () => {
      contarMock.mockResolvedValue({ ...fechada(NAO_CEGO), valorContado: 320, diferenca: 0 })
      renderJanela(NAO_CEGO)

      digitarContado('320,00')
      enviar()

      await waitFor(() => expect(contarMock).toHaveBeenCalledWith(NAO_CEGO.id, { contagens: { DINHEIRO: 320 }, justificativa: null }))
      await waitFor(() => expect(aoConcluir).toHaveBeenCalled())
    })

    it('esperado zero: "0,00" confere e a contagem vai com valorContado 0', async () => {
      const gavetaVazia = sessaoDeTeste({ fechamentoCego: false, dinheiroNaGaveta: 0 })
      contarMock.mockResolvedValue({ ...fechada(gavetaVazia), valorEsperado: 0, valorContado: 0, diferenca: 0 })
      const janela = renderJanela(gavetaVazia)

      expect(within(janela).getByText('Esperado R$ 0,00')).toBeInTheDocument()
      digitarContado('0,00')
      expect(within(janela).getByText('Confere')).toBeInTheDocument()
      enviar()

      await waitFor(() => expect(contarMock).toHaveBeenCalledWith(gavetaVazia.id, { contagens: { DINHEIRO: 0 }, justificativa: null }))
      await waitFor(() => expect(aoConcluir).toHaveBeenCalled())
    })

    it('esperado desatualizado: a tela dizia "Confere", o servidor devolve EM_CONFERENCIA e a janela pede a justificativa com a falta real', async () => {
      // Outro lancamento entrou depois que a tela carregou: o esperado real e R$ 340,00.
      contarMock.mockResolvedValue({
        ...emConferencia(NAO_CEGO),
        valorEsperado: 340,
        valorContado: 320,
        diferenca: -20,
      })
      const janela = renderJanela(NAO_CEGO)

      digitarContado('320,00')
      expect(within(janela).getByText('Confere')).toBeInTheDocument()
      enviar()

      const resultado = await within(janela).findByLabelText('Resultado da contagem')
      expect(contarMock).toHaveBeenCalledWith(NAO_CEGO.id, { contagens: { DINHEIRO: 320 }, justificativa: null })
      expect(resultado).toHaveTextContent('EsperadoR$ 340,00')
      expect(resultado).toHaveTextContent('Falta de R$ 20,00')
      await waitFor(() => expect(within(janela).getByLabelText(/justificativa/i)).toHaveFocus())
      expect(aoConcluir).not.toHaveBeenCalled()
      expect(fecharMock).not.toHaveBeenCalled()
    })

    it('campo vazio não vai ao servidor', async () => {
      renderJanela(NAO_CEGO)

      enviar()

      expect(await screen.findByText('Informe o valor contado na gaveta.')).toBeInTheDocument()
      expect(contarMock).not.toHaveBeenCalled()
    })
  })

  describe('modo cego', () => {
    it('só o campo e "Conferir"; depois aparecem o resultado e a justificativa, e "Fechar caixa" chama fechar', async () => {
      contarMock.mockResolvedValue(emConferencia(CEGO))
      fecharMock.mockResolvedValue(fechada(CEGO, 'Troco dado a mais'))
      const janela = renderJanela(CEGO)

      // Nenhum valor em reais na janela (o "R$" sozinho e o prefixo do campo).
      expect(within(janela).queryByText(/R\$\s*\d/)).not.toBeInTheDocument()
      expect(within(janela).queryByLabelText('Resultado da contagem')).not.toBeInTheDocument()
      expect(screen.queryByLabelText(/justificativa/i)).not.toBeInTheDocument()
      digitarContado('318,00')
      // Nada do esperado nem da diferença antes da contagem.
      expect(within(janela).queryByText(/falta de|sobra de|confere/i)).not.toBeInTheDocument()
      fireEvent.click(within(janela).getByRole('button', { name: 'Conferir' }))

      await waitFor(() => expect(contarMock).toHaveBeenCalledWith(CEGO.id, { contagens: { DINHEIRO: 318 }, justificativa: null }))
      const lista = await within(janela).findByLabelText('Resultado da contagem')
      expect(lista).toHaveTextContent('EsperadoR$ 320,00')
      expect(lista).toHaveTextContent('ContadoR$ 318,00')
      expect(lista).toHaveTextContent('Falta de R$ 2,00')
      const justificativa = within(janela).getByLabelText(/justificativa/i)
      await waitFor(() => expect(justificativa).toHaveFocus())

      fireEvent.change(justificativa, { target: { value: 'Troco dado a mais' } })
      fireEvent.click(within(janela).getByRole('button', { name: 'Fechar caixa' }))

      await waitFor(() => expect(fecharMock).toHaveBeenCalledWith(CEGO.id, { justificativa: 'Troco dado a mais' }))
      await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith(expect.objectContaining({ status: 'FECHADA' })))
    })

    it('Enter na justificativa confirma o fechamento', async () => {
      fecharMock.mockResolvedValue(fechada(CEGO, 'Erro no troco'))
      renderJanela(emConferencia(CEGO))

      const justificativa = screen.getByLabelText(/justificativa/i)
      fireEvent.change(justificativa, { target: { value: 'Erro no troco' } })
      fireEvent.keyDown(justificativa, { key: 'Enter' })

      await waitFor(() => expect(fecharMock).toHaveBeenCalledWith(CEGO.id, { justificativa: 'Erro no troco' }))
    })

    it('contagem sem diferença fecha direto, sem passo de justificativa', async () => {
      contarMock.mockResolvedValue({ ...fechada(CEGO), valorContado: 320, diferenca: 0 })
      renderJanela(CEGO)

      digitarContado('320,00')
      enviar()

      await waitFor(() => expect(aoConcluir).toHaveBeenCalled())
      expect(fecharMock).not.toHaveBeenCalled()
    })

    it('retry depois da queda de rede: a contagem repetida (200) mostra o resultado e o passo da justificativa', async () => {
      contarMock.mockRejectedValueOnce(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
      contarMock.mockResolvedValueOnce(emConferencia(CEGO))
      const janela = renderJanela(CEGO)

      digitarContado('318,00')
      fireEvent.click(within(janela).getByRole('button', { name: 'Conferir' }))

      expect(await within(janela).findByRole('alert')).toHaveTextContent(
        'Não foi possível registrar a contagem. Confira a conexão e tente de novo.',
      )
      // O valor digitado continua: basta clicar "Conferir" de novo.
      expect(campoContado()).toHaveValue('318,00')
      fireEvent.click(within(janela).getByRole('button', { name: 'Conferir' }))

      expect(await within(janela).findByLabelText('Resultado da contagem')).toHaveTextContent('Falta de R$ 2,00')
      expect(within(janela).getByLabelText(/justificativa/i)).toBeInTheDocument()
      expect(within(janela).getByRole('button', { name: 'Fechar caixa' })).toBeInTheDocument()
      expect(contarMock).toHaveBeenCalledTimes(2)
      expect(contarMock).toHaveBeenNthCalledWith(2, CEGO.id, { contagens: { DINHEIRO: 318 }, justificativa: null })
      expect(within(janela).queryByRole('alert')).not.toBeInTheDocument()
    })
  })

  it('retomada: sessão EM_CONFERENCIA abre direto no passo da justificativa, com o foco nela', () => {
    const janela = renderJanela(emConferencia(CEGO))

    expect(screen.queryByLabelText('Dinheiro contado na gaveta')).not.toBeInTheDocument()
    expect(within(janela).getByLabelText('Resultado da contagem')).toHaveTextContent('Falta de R$ 2,00')
    expect(within(janela).getByLabelText(/justificativa/i)).toHaveFocus()
  })

  it('justificativa vazia no fechamento não vai ao servidor', async () => {
    renderJanela(emConferencia(CEGO))

    fireEvent.change(screen.getByLabelText(/justificativa/i), { target: { value: '   ' } })
    enviar()

    expect(await screen.findByText('Explique a diferença para fechar o caixa.')).toBeInTheDocument()
    expect(fecharMock).not.toHaveBeenCalled()
  })

  it('ADMIN fechando o caixa de outra pessoa vê o aviso no topo', () => {
    const janela = renderJanela(NAO_CEGO, true)

    expect(within(janela).getByText('Você está fechando o caixa aberto por Ana Souza.')).toBeInTheDocument()
  })

  describe('textos conforme o modo e quem fecha', () => {
    it('modo cego, sem ver o esperado', () => {
      const janela = renderJanela(CEGO)
      expect(janela).toHaveAccessibleDescription(
        'Conte o dinheiro da gaveta e informe o total. Se bater, o caixa fecha na hora. Depois de conferir, a contagem não pode ser alterada.',
      )
    })

    it('modo cego, para quem vê o esperado (ADMIN)', () => {
      const janela = renderJanela({ ...CEGO, dinheiroNaGaveta: 320 })
      expect(janela).toHaveAccessibleDescription(
        'Conte o dinheiro da gaveta e informe o total. A diferença aparece depois de conferir. A contagem não pode ser alterada depois.',
      )
      // Mesmo vendo o esperado na tela, a janela segue o modo cego.
      expect(within(janela).queryByText('Esperado R$ 320,00')).not.toBeInTheDocument()
    })

    it('modo não cego', () => {
      const janela = renderJanela(NAO_CEGO)
      expect(janela).toHaveAccessibleDescription(
        'Conte o dinheiro da gaveta e compare com o esperado. A contagem não pode ser alterada depois.',
      )
    })

    it('em conferência: "Justificar depois" no lugar de "Cancelar", e o exemplo segue o sentido da diferença', () => {
      const janela = renderJanela(emConferencia(CEGO))
      expect(within(janela).getByRole('button', { name: 'Justificar depois' })).toBeInTheDocument()
      expect(within(janela).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
      expect(within(janela).getByLabelText(/justificativa/i)).toHaveAttribute('placeholder', 'Ex.: Troco dado a mais')
    })

    it('com sobra, o exemplo é "Troco dado a menos"', () => {
      renderJanela(NAO_CEGO)
      digitarContado('325,00')
      expect(screen.getByLabelText(/justificativa/i)).toHaveAttribute('placeholder', 'Ex.: Troco dado a menos')
    })
  })

  describe('acessibilidade', () => {
    it('só a diferença é anunciada enquanto se digita', () => {
      const janela = renderJanela(NAO_CEGO)
      digitarContado('318,00')

      const regioesVivas = janela.querySelectorAll('[aria-live]')
      expect(regioesVivas).toHaveLength(1)
      expect(regioesVivas[0]).toHaveTextContent('Falta de R$ 2,00')
      expect(regioesVivas[0]).not.toHaveTextContent('Esperado')
    })

    it('no passo da justificativa, ela é descrita pelo resultado da contagem', () => {
      renderJanela(emConferencia(CEGO))
      expect(screen.getByLabelText(/justificativa/i)).toHaveAccessibleDescription(
        // O "R$" do Intl vem com espaco nao separavel.
        expect.stringMatching(/Contado R\$\s318,00 Diferença Falta de R\$\s2,00/),
      )
    })
  })

  describe('falhas e mudanças de estado', () => {
    it('rede cai no fechamento: a janela e a justificativa ficam, nada é recarregado e o retry fecha', async () => {
      fecharMock.mockRejectedValueOnce(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
      fecharMock.mockResolvedValueOnce(fechada(CEGO, 'Troco dado a mais'))
      const janela = renderJanela(emConferencia(CEGO))
      const invalidar = vi.spyOn(queryClient, 'invalidateQueries')

      fireEvent.change(within(janela).getByLabelText(/justificativa/i), { target: { value: 'Troco dado a mais' } })
      enviar()

      expect(await within(janela).findByRole('alert')).toHaveTextContent(
        'Não foi possível fechar o caixa. Confira a conexão e tente de novo.',
      )
      expect(within(janela).getByLabelText(/justificativa/i)).toHaveValue('Troco dado a mais')
      expect(invalidar).not.toHaveBeenCalled()
      expect(buscarSessaoMock).not.toHaveBeenCalled()

      enviar()
      await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith(expect.objectContaining({ status: 'FECHADA' })))
      expect(fecharMock).toHaveBeenNthCalledWith(2, CEGO.id, { justificativa: 'Troco dado a mais' })
    })

    it('a aba B conta outro valor (409): relê a sessão e, em conferência, avisa quem abriu a janela', async () => {
      contarMock.mockRejectedValue(new HttpError(409, 'A contagem deste caixa já foi registrada.'))
      const contadaNaOutraAba = emConferencia(CEGO)
      buscarSessaoMock.mockResolvedValue(contadaNaOutraAba)
      renderJanela(CEGO)

      digitarContado('300,00')
      enviar()

      await waitFor(() =>
        expect(aoMudarDeEstado).toHaveBeenCalledWith({
          situacao: 'EM_CONFERENCIA',
          sessao: contadaNaOutraAba,
          mensagem: 'A contagem deste caixa já foi registrada.',
        }),
      )
      expect(buscarSessaoMock).toHaveBeenCalledWith(CEGO.id)
    })

    it('a outra aba contou sem diferença (409): a sessão relida está fechada', async () => {
      contarMock.mockRejectedValue(new HttpError(409, 'A contagem deste caixa já foi registrada.'))
      buscarSessaoMock.mockResolvedValue(fechada(CEGO))
      renderJanela(CEGO)

      digitarContado('300,00')
      enviar()

      await waitFor(() => expect(aoMudarDeEstado).toHaveBeenCalledWith(expect.objectContaining({ situacao: 'FECHADA' })))
    })

    it('a releitura falha: decide pelo texto do 409 (fallback)', async () => {
      contarMock.mockRejectedValue(new HttpError(409, 'A contagem deste caixa já foi registrada.'))
      buscarSessaoMock.mockRejectedValue(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
      renderJanela(CEGO)

      digitarContado('300,00')
      enviar()

      await waitFor(() =>
        expect(aoMudarDeEstado).toHaveBeenCalledWith({
          situacao: 'EM_CONFERENCIA',
          sessao: null,
          mensagem: 'A contagem deste caixa já foi registrada.',
        }),
      )
    })

    it('404 na contagem: a sessão não está mais acessível', async () => {
      contarMock.mockRejectedValue(new HttpError(404, 'Requisicao falhou (HTTP 404).'))
      renderJanela(NAO_CEGO)

      digitarContado('320,00')
      enviar()

      await waitFor(() =>
        expect(aoMudarDeEstado).toHaveBeenCalledWith({
          situacao: 'INDISPONIVEL',
          mensagem: 'Este caixa não está mais disponível. A tela foi atualizada.',
        }),
      )
      expect(buscarSessaoMock).not.toHaveBeenCalled()
    })

    it('modo trocado antes da contagem: o 400 da justificativa aparece mesmo com o campo fora da tela', async () => {
      contarMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { justificativa: 'Informe a justificativa depois de ver a diferença.' }),
      )
      const janela = renderJanela(NAO_CEGO)

      digitarContado('318,00')
      fireEvent.change(within(janela).getByLabelText(/justificativa/i), { target: { value: 'Troco' } })
      enviar()
      expect(await within(janela).findByText('Informe a justificativa depois de ver a diferença.')).toBeInTheDocument()

      // A tela recarrega a sessao: agora no modo cego, sem o campo da justificativa.
      janela.trocarSessao(CEGO)

      expect(within(janela).queryByLabelText(/justificativa/i)).not.toBeInTheDocument()
      expect(within(janela).getByRole('alert')).toHaveTextContent('Informe a justificativa depois de ver a diferença.')
      expect(within(janela).getByRole('button', { name: 'Conferir' })).toBeInTheDocument()
    })
  })

  describe('contagem por forma (Dinheiro e Débito)', () => {
    const COM_DEBITO = {
      formasDaContagem: ['DINHEIRO', 'DEBITO'] as SessaoDeCaixa['formasDaContagem'],
      porForma: [
        { forma: 'DINHEIRO' as const, esperado: 320, contado: null, diferenca: null },
        { forma: 'DEBITO' as const, esperado: 120, contado: null, diferenca: null },
      ],
    }
    const NAO_CEGO_COM_DEBITO = sessaoDeTeste({ fechamentoCego: false, dinheiroNaGaveta: 320, ...COM_DEBITO })
    const CEGO_COM_DEBITO = sessaoDeTeste({
      fechamentoCego: true,
      dinheiroNaGaveta: null,
      formasDaContagem: COM_DEBITO.formasDaContagem,
      porForma: COM_DEBITO.porForma.map((valores) => ({ ...valores, esperado: null })),
    })

    function contadoNoDebito() {
      return screen.getByLabelText('Débito contado')
    }

    it('não cego: esperado e diferença ao lado de cada campo; a justificativa única aparece quando qualquer um difere', async () => {
      contarMock.mockResolvedValue(fechada(NAO_CEGO_COM_DEBITO, 'Comprovante perdido'))
      const janela = renderJanela(NAO_CEGO_COM_DEBITO)

      expect(within(janela).getByText('Esperado R$ 320,00')).toBeInTheDocument()
      expect(within(janela).getByText('Esperado R$ 120,00')).toBeInTheDocument()

      digitarContado('320,00')
      fireEvent.change(contadoNoDebito(), { target: { value: '120,00' } })
      expect(within(janela).getAllByText('Confere')).toHaveLength(2)
      expect(screen.queryByLabelText(/justificativa/i)).not.toBeInTheDocument()

      // Só o débito difere: a justificativa (uma só) passa a ser pedida.
      fireEvent.change(contadoNoDebito(), { target: { value: '118,00' } })
      expect(within(janela).getByText('Falta de R$ 2,00')).toBeInTheDocument()
      fireEvent.change(screen.getByLabelText(/justificativa/i), { target: { value: 'Comprovante perdido' } })
      enviar()

      await waitFor(() =>
        expect(contarMock).toHaveBeenCalledWith(NAO_CEGO_COM_DEBITO.id, {
          contagens: { DINHEIRO: 320, DEBITO: 118 },
          justificativa: 'Comprovante perdido',
        }),
      )
      await waitFor(() => expect(aoConcluir).toHaveBeenCalled())
    })

    it('forma sem valor não vai ao servidor: "Informe o valor contado de Débito."', async () => {
      renderJanela(NAO_CEGO_COM_DEBITO)

      digitarContado('320,00')
      enviar()

      expect(await screen.findByText('Informe o valor contado de Débito.')).toBeInTheDocument()
      expect(contadoNoDebito()).toHaveAttribute('aria-invalid', 'true')
      expect(contarMock).not.toHaveBeenCalled()
    })

    it('diferença só fora do dinheiro: o exemplo da justificativa fala da forma', () => {
      renderJanela(NAO_CEGO_COM_DEBITO)

      digitarContado('320,00')
      fireEvent.change(contadoNoDebito(), { target: { value: '118,00' } })

      expect(screen.getByLabelText(/justificativa/i)).toHaveAttribute(
        'placeholder',
        'Ex.: Venda passada no crédito em vez do débito',
      )
    })

    it('o erro do servidor em contagens.DEBITO fica no campo do débito', async () => {
      contarMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { 'contagens.DEBITO': 'Informe o valor contado de Débito.' }),
      )
      renderJanela(NAO_CEGO_COM_DEBITO)

      digitarContado('320,00')
      fireEvent.change(contadoNoDebito(), { target: { value: '120,00' } })
      enviar()

      expect(await screen.findByText('Informe o valor contado de Débito.')).toBeInTheDocument()
      expect(contadoNoDebito()).toHaveAccessibleDescription(expect.stringContaining('Informe o valor contado de Débito.'))
    })

    it('cego: nenhum esperado antes; depois de "Conferir", o resultado de cada forma', async () => {
      contarMock.mockResolvedValue({
        ...emConferencia(CEGO_COM_DEBITO),
        porForma: [
          { forma: 'DINHEIRO', esperado: 320, contado: 320, diferenca: 0 },
          { forma: 'DEBITO', esperado: 120, contado: 118, diferenca: -2 },
        ],
      })
      const janela = renderJanela(CEGO_COM_DEBITO)

      expect(within(janela).queryByText(/Esperado/)).not.toBeInTheDocument()
      digitarContado('320,00')
      fireEvent.change(contadoNoDebito(), { target: { value: '118,00' } })
      expect(within(janela).queryByText(/falta de|sobra de|confere/i)).not.toBeInTheDocument()
      fireEvent.click(within(janela).getByRole('button', { name: 'Conferir' }))

      await waitFor(() =>
        expect(contarMock).toHaveBeenCalledWith(CEGO_COM_DEBITO.id, {
          contagens: { DINHEIRO: 320, DEBITO: 118 },
          justificativa: null,
        }),
      )
      const resultado = await within(janela).findByLabelText('Resultado da contagem')
      const dinheiro = within(resultado).getByRole('group', { name: 'Dinheiro' })
      const debito = within(resultado).getByRole('group', { name: 'Débito' })
      expect(dinheiro).toHaveTextContent('Confere')
      expect(debito).toHaveTextContent('EsperadoR$ 120,00')
      expect(debito).toHaveTextContent('ContadoR$ 118,00')
      expect(debito).toHaveTextContent('Falta de R$ 2,00')
      await waitFor(() => expect(within(janela).getByLabelText(/justificativa/i)).toHaveFocus())
    })
  })
})
