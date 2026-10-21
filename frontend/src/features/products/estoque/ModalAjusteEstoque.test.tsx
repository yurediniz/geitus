import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { ModalAjusteEstoque, type ModalAjusteEstoqueProps } from '@/features/products/estoque/ModalAjusteEstoque'
import { ajustarEstoque } from '@/services/estoqueService'
import { HttpError } from '@/services/httpClient'
import { ID_ARROZ } from '@/test/fixturesProduto'
import type { AjusteEstoqueRequest, MovimentoEstoque } from '@/types/estoque'

vi.mock('@/services/estoqueService', () => ({
  ajustarEstoque: vi.fn(),
}))

const ajustarEstoqueMock = vi.mocked(ajustarEstoque)

const MOVIMENTO: MovimentoEstoque = {
  id: 'mov-1',
  tipo: 'SAIDA',
  motivo: 'PERDA_AVARIA',
  origem: 'AJUSTE_MANUAL',
  quantidade: -2,
  saldoAnterior: 12,
  saldoNovo: 10,
  observacao: null,
  usuarioNome: 'Ana Souza',
  criadoEm: '2026-10-21T15:20:00',
}

function renderModal(props: Partial<ModalAjusteEstoqueProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const aoConcluir = vi.fn()
  const aoFechar = vi.fn()
  render(
    <QueryClientProvider client={queryClient}>
      <ModalAjusteEstoque
        aberto
        produtoId={ID_ARROZ}
        saldo={12}
        sigla="UN"
        fracionada={false}
        aoFechar={aoFechar}
        aoConcluir={aoConcluir}
        {...props}
      />
    </QueryClientProvider>,
  )
  return { aoConcluir, aoFechar, queryClient }
}

function dialogo(): HTMLElement {
  return screen.getByRole('dialog', { name: 'Ajustar estoque' })
}

function escolherTipo(nome: string) {
  fireEvent.click(screen.getByRole('radio', { name: nome }))
}

function campoQuantidade(): HTMLElement {
  return screen.getByRole('textbox', { name: /^(quantidade|saldo contado)/i })
}

function campoMotivo(): HTMLElement {
  return screen.getByRole('combobox', { name: /^motivo/i })
}

function campoObservacao(): HTMLElement {
  return screen.getByRole('textbox', { name: /^observação/i })
}

function confirmar() {
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }))
}

function rotulosDosMotivos(): string[] {
  return within(campoMotivo())
    .getAllByRole('option')
    .map((opcao) => opcao.textContent ?? '')
}

/** Saida de 2 UN por perda: o ajuste valido mais comum dos testes. */
function preencherSaida(quantidade = '2') {
  escolherTipo('Saída')
  fireEvent.change(campoQuantidade(), { target: { value: quantidade } })
  fireEvent.change(campoMotivo(), { target: { value: 'PERDA_AVARIA' } })
}

function ultimoAjuste(): AjusteEstoqueRequest {
  const chamadas = ajustarEstoqueMock.mock.calls
  return chamadas[chamadas.length - 1][1]
}

describe('ModalAjusteEstoque', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('abre com o saldo atual, o tipo Entrada marcado e o foco no tipo', async () => {
    renderModal()

    expect(within(dialogo()).getByText('Saldo atual: 12 UN')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Entrada' })).toBeChecked()
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Entrada' })).toHaveFocus())
    expect(campoQuantidade()).toHaveAccessibleName('Quantidade (UN)')
    expect(campoQuantidade()).toHaveAttribute('inputmode', 'decimal')
  })

  it('o motivo é filtrado pelo tipo e muda ao trocar o tipo', () => {
    renderModal()

    expect(rotulosDosMotivos()).toEqual(['Selecione o motivo', 'Compra/recebimento', 'Devolução de cliente', 'Outro'])
    fireEvent.change(campoMotivo(), { target: { value: 'COMPRA' } })

    escolherTipo('Saída')

    expect(rotulosDosMotivos()).toEqual([
      'Selecione o motivo',
      'Perda/avaria',
      'Vencido',
      'Uso interno',
      'Devolução ao fornecedor',
      'Outro',
    ])
    // O motivo de entrada nao vale na saida: volta para "Selecione".
    expect(campoMotivo()).toHaveValue('')
  })

  it('"Contar e ajustar para" pré-seleciona Contagem e muda o rótulo para "Saldo contado"', () => {
    renderModal()

    escolherTipo('Contar e ajustar para')

    expect(campoMotivo()).toHaveValue('CONTAGEM')
    expect(rotulosDosMotivos()).toEqual(['Contagem/inventário', 'Outro'])
    expect(campoQuantidade()).toHaveAccessibleName('Saldo contado (UN)')
  })

  it('"Outro" exige a observação', async () => {
    renderModal()
    preencherSaida()
    fireEvent.change(campoMotivo(), { target: { value: 'OUTRO' } })
    expect(campoObservacao()).toHaveAccessibleName(/obrigatório/)

    confirmar()

    expect(await screen.findByText('Descreva o motivo.')).toBeInTheDocument()
    await waitFor(() => expect(campoObservacao()).toHaveFocus())
    expect(ajustarEstoqueMock).not.toHaveBeenCalled()
  })

  it('mostra a prévia do saldo nos três tipos', () => {
    renderModal()

    fireEvent.change(campoQuantidade(), { target: { value: '5' } })
    expect(screen.getByText('Saldo: 12 UN → 17 UN')).toBeInTheDocument()

    escolherTipo('Saída')
    fireEvent.change(campoQuantidade(), { target: { value: '2' } })
    expect(screen.getByText('Saldo: 12 UN → 10 UN')).toBeInTheDocument()

    escolherTipo('Contar e ajustar para')
    fireEvent.change(campoQuantidade(), { target: { value: '7' } })
    expect(screen.getByText('Saldo: 12 UN → 7 UN')).toBeInTheDocument()
  })

  it('saída acima do saldo mostra o erro já ao digitar e bloqueia o envio', () => {
    renderModal()
    preencherSaida('13')

    expect(screen.getByText('Saldo insuficiente: há 12 UN.')).toBeInTheDocument()
    expect(campoQuantidade()).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByText(/^Saldo: /)).not.toBeInTheDocument()

    confirmar()

    expect(ajustarEstoqueMock).not.toHaveBeenCalled()
  })

  it('"2,5" em UN dá o erro de fração sem enviar (Review Focus 5)', async () => {
    renderModal()
    preencherSaida('2,5')

    confirmar()

    expect(await screen.findByText('A unidade UN não aceita quantidade fracionada.')).toBeInTheDocument()
    expect(ajustarEstoqueMock).not.toHaveBeenCalled()
  })

  it('"2,5" em KG vai como 2.5, com a chave e sem observação vazia', async () => {
    ajustarEstoqueMock.mockResolvedValue({ ...MOVIMENTO, quantidade: -2.5, saldoNovo: 9.5 })
    renderModal({ sigla: 'KG', fracionada: true })
    preencherSaida('2,5')

    confirmar()

    await waitFor(() => expect(ajustarEstoqueMock).toHaveBeenCalledTimes(1))
    expect(ajustarEstoqueMock).toHaveBeenCalledWith(ID_ARROZ, {
      tipo: 'SAIDA',
      quantidade: 2.5,
      motivo: 'PERDA_AVARIA',
      observacao: null,
      chave: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
    })
  })

  it('duplo clique em Confirmar envia uma vez só e o botão fica desabilitado', async () => {
    ajustarEstoqueMock.mockReturnValue(new Promise(() => {}))
    renderModal()
    preencherSaida()

    confirmar()
    confirmar()

    await waitFor(() => expect(screen.getByRole('button', { name: /confirmar|registrando/i })).toBeDisabled())
    expect(ajustarEstoqueMock).toHaveBeenCalledTimes(1)
  })

  it('erro de rede seguido de nova tentativa usa a mesma chave (Review Focus 3)', async () => {
    ajustarEstoqueMock
      .mockRejectedValueOnce(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
      .mockResolvedValueOnce(MOVIMENTO)
    const { aoConcluir } = renderModal()
    preencherSaida()

    confirmar()

    expect(await screen.findByText('Não foi possível registrar o ajuste. Confira a conexão e tente de novo.')).toBeInTheDocument()
    expect(screen.queryByText(/Nao foi possivel conectar/)).not.toBeInTheDocument()
    const primeiraChave = ultimoAjuste().chave

    confirmar()

    await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith(MOVIMENTO))
    expect(ajustarEstoqueMock).toHaveBeenCalledTimes(2)
    expect(ultimoAjuste().chave).toBe(primeiraChave)
  })

  it('cada abertura do modal gera uma chave nova', async () => {
    ajustarEstoqueMock.mockResolvedValue(MOVIMENTO)
    const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
    const props: ModalAjusteEstoqueProps = {
      aberto: true,
      produtoId: ID_ARROZ,
      saldo: 12,
      sigla: 'UN',
      fracionada: false,
      aoFechar: vi.fn(),
      aoConcluir: vi.fn(),
    }
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ModalAjusteEstoque {...props} />
      </QueryClientProvider>,
    )
    preencherSaida()
    confirmar()
    await waitFor(() => expect(ajustarEstoqueMock).toHaveBeenCalledTimes(1))
    const primeira = ultimoAjuste().chave

    for (const aberto of [false, true]) {
      rerender(
        <QueryClientProvider client={queryClient}>
          <ModalAjusteEstoque {...props} aberto={aberto} />
        </QueryClientProvider>,
      )
    }
    preencherSaida()
    confirmar()

    await waitFor(() => expect(ajustarEstoqueMock).toHaveBeenCalledTimes(2))
    expect(ultimoAjuste().chave).not.toBe(primeira)
  })

  it('400 do servidor com campos mostra o erro no campo', async () => {
    ajustarEstoqueMock.mockRejectedValue(
      new HttpError(400, 'Dados invalidos.', { quantidade: 'Saldo insuficiente: há 1 UN.' }),
    )
    renderModal()
    preencherSaida()

    confirmar()

    expect(await screen.findByText('Saldo insuficiente: há 1 UN.')).toBeInTheDocument()
    expect(campoQuantidade()).toHaveAccessibleDescription('Saldo insuficiente: há 1 UN.')
    // Mudar o campo tira o erro do servidor.
    fireEvent.change(campoQuantidade(), { target: { value: '1' } })
    expect(screen.queryByText('Saldo insuficiente: há 1 UN.')).not.toBeInTheDocument()
  })

  it('400 sem campos (produto sem controle) mostra a mensagem no topo', async () => {
    ajustarEstoqueMock.mockRejectedValue(new HttpError(400, 'Este produto não controla estoque.'))
    renderModal()
    preencherSaida()

    confirmar()

    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent('Este produto não controla estoque.')
  })

  it('409 mostra a mensagem no topo, atualiza o produto e a próxima tentativa é uma operação nova', async () => {
    ajustarEstoqueMock
      .mockRejectedValueOnce(new HttpError(409, 'Esta operação já foi registrada com outros dados.'))
      .mockResolvedValueOnce(MOVIMENTO)
    const { queryClient } = renderModal()
    const chaveDoProduto = [...PRODUTOS_QUERY_KEY, 'detalhe', ID_ARROZ]
    queryClient.setQueryData(chaveDoProduto, { id: ID_ARROZ })
    preencherSaida()

    confirmar()

    expect(await within(dialogo()).findByRole('alert')).toHaveTextContent(
      'Esta operação já foi registrada com outros dados.',
    )
    expect(queryClient.getQueryState(chaveDoProduto)?.isInvalidated).toBe(true)
    const primeira = ultimoAjuste().chave

    confirmar()

    await waitFor(() => expect(ajustarEstoqueMock).toHaveBeenCalledTimes(2))
    expect(ultimoAjuste().chave).not.toBe(primeira)
  })

  it('403 e falha interna usam textos fixos, sem vazar detalhe', async () => {
    ajustarEstoqueMock
      .mockRejectedValueOnce(new HttpError(403, 'Forbidden'))
      .mockRejectedValueOnce(new HttpError(500, 'NullPointerException'))
    renderModal()
    preencherSaida()

    confirmar()
    expect(await screen.findByText('Somente administradores podem ajustar o estoque.')).toBeInTheDocument()

    confirmar()
    expect(await screen.findByText('Não foi possível registrar o ajuste. Confira a conexão e tente de novo.')).toBeInTheDocument()
    expect(screen.queryByText(/NullPointer|Forbidden/)).not.toBeInTheDocument()
  })

  it('sucesso: avisa a página com o movimento e invalida os produtos (detalhe, listas e histórico)', async () => {
    ajustarEstoqueMock.mockResolvedValue(MOVIMENTO)
    const { aoConcluir, queryClient } = renderModal()
    const chaves = [
      [...PRODUTOS_QUERY_KEY, 'detalhe', ID_ARROZ],
      [...PRODUTOS_QUERY_KEY, { busca: '', status: 'todos' }],
      [...PRODUTOS_QUERY_KEY, ID_ARROZ, 'movimentos-estoque'],
    ]
    for (const chave of chaves) {
      queryClient.setQueryData(chave, {})
    }
    preencherSaida()

    confirmar()

    await waitFor(() => expect(aoConcluir).toHaveBeenCalledWith(MOVIMENTO))
    for (const chave of chaves) {
      expect(queryClient.getQueryState(chave)?.isInvalidated).toBe(true)
    }
  })

  it('Enter num campo confirma (envio do próprio formulário do modal)', async () => {
    ajustarEstoqueMock.mockResolvedValue(MOVIMENTO)
    renderModal()
    preencherSaida()

    await act(async () => {
      fireEvent.submit(campoQuantidade().closest('form') as HTMLFormElement)
    })

    expect(ajustarEstoqueMock).toHaveBeenCalledTimes(1)
  })

  it('Esc fecha', () => {
    const { aoFechar } = renderModal()

    fireEvent.keyDown(dialogo(), { key: 'Escape' })

    expect(aoFechar).toHaveBeenCalled()
  })
})
