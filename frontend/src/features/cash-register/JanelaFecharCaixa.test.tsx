import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { JanelaFecharCaixa } from '@/features/cash-register/JanelaFecharCaixa'
import { contar, fechar } from '@/services/caixaService'
import { HttpError } from '@/services/httpClient'
import { sessaoDeTeste } from '@/test/fixturesCaixa'
import type { SessaoDeCaixa } from '@/types/caixa'

vi.mock('@/services/caixaService', () => ({
  contar: vi.fn(),
  fechar: vi.fn(),
}))

const contarMock = vi.mocked(contar)
const fecharMock = vi.mocked(fechar)

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
const aoConflitoDeEstado = vi.fn()

function renderJanela(sessao: SessaoDeCaixa, deOutraPessoa = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <JanelaFecharCaixa
        aberto
        sessao={sessao}
        deOutraPessoa={deOutraPessoa}
        aoFechar={aoFechar}
        aoConcluir={aoConcluir}
        aoConflitoDeEstado={aoConflitoDeEstado}
      />
    </QueryClientProvider>,
  )
  return screen.getByRole('dialog')
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
        expect(contarMock).toHaveBeenCalledWith(NAO_CEGO.id, { valorContado: 318, justificativa: 'Troco dado a mais' }),
      )
      expect(fecharMock).not.toHaveBeenCalled()
      await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith(expect.objectContaining({ status: 'FECHADA' })))
    })

    it('sem diferença, fecha direto sem justificativa', async () => {
      contarMock.mockResolvedValue({ ...fechada(NAO_CEGO), valorContado: 320, diferenca: 0 })
      renderJanela(NAO_CEGO)

      digitarContado('320,00')
      enviar()

      await waitFor(() => expect(contarMock).toHaveBeenCalledWith(NAO_CEGO.id, { valorContado: 320, justificativa: null }))
      await waitFor(() => expect(aoConcluir).toHaveBeenCalled())
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

      await waitFor(() => expect(contarMock).toHaveBeenCalledWith(CEGO.id, { valorContado: 318, justificativa: null }))
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
      expect(contarMock).toHaveBeenNthCalledWith(2, CEGO.id, { valorContado: 318, justificativa: null })
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

  it('caixa já fechado em outro lugar: avisa quem abriu a janela', async () => {
    contarMock.mockRejectedValue(new HttpError(409, 'Este caixa já foi fechado.'))
    renderJanela(NAO_CEGO)

    digitarContado('320,00')
    enviar()

    await waitFor(() => expect(aoConflitoDeEstado).toHaveBeenCalledWith('Este caixa já foi fechado.'))
  })
})
