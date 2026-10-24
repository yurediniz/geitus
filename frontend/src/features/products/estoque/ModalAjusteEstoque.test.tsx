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
  embalagem: null,
}

const CHAVE_DO_PRODUTO = [...PRODUTOS_QUERY_KEY, 'detalhe', ID_ARROZ]

/** Props do modal aberto; os callbacks sao recriados a cada `renderModal`. */
const PROPS_PADRAO: ModalAjusteEstoqueProps = {
  aberto: true,
  produtoId: ID_ARROZ,
  saldo: 12,
  sigla: 'UN',
  fracionada: false,
  aoFechar: () => {},
  aoConcluir: () => {},
}

function renderModal(props: Partial<ModalAjusteEstoqueProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const aoConcluir = vi.fn()
  const aoFechar = vi.fn()
  const { rerender } = render(
    <QueryClientProvider client={queryClient}>
      <ModalAjusteEstoque {...PROPS_PADRAO} aoFechar={aoFechar} aoConcluir={aoConcluir} {...props} />
    </QueryClientProvider>,
  )
  return { aoConcluir, aoFechar, queryClient, rerender }
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

/** O botao de confirmar: o rotulo muda com a acao ("Registrar saída", "Zerar estoque"...). */
function botaoConfirmar(): HTMLButtonElement {
  return dialogo().querySelector('button[type="submit"]') as HTMLButtonElement
}

function confirmar() {
  fireEvent.click(botaoConfirmar())
}

/** Regiao viva da previa (anuncia a previa, o erro de saldo e a contagem que confere). */
function regiaoDaPrevia(): HTMLElement {
  return dialogo().querySelector('[aria-live="polite"]') as HTMLElement
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

  describe('abertura e tipo', () => {
    it('abre com o saldo atual, Entrada marcada com Compra/recebimento e o foco no tipo', async () => {
      renderModal()

      expect(within(dialogo()).getByText('Saldo atual: 12 UN')).toBeInTheDocument()
      expect(screen.getByRole('radio', { name: 'Entrada' })).toBeChecked()
      await waitFor(() => expect(screen.getByRole('radio', { name: 'Entrada' })).toHaveFocus())
      expect(campoMotivo()).toHaveValue('COMPRA')
      expect(campoQuantidade()).toHaveAccessibleName('Quantidade (UN)')
      expect(campoQuantidade()).toHaveAttribute('inputmode', 'decimal')
    })

    it('o tipo marcado tem um ícone de check, além da cor', () => {
      renderModal()

      const marcado = screen.getByRole('radio', { name: 'Entrada' }).closest('label') as HTMLElement
      const desmarcado = screen.getByRole('radio', { name: 'Saída' }).closest('label') as HTMLElement
      expect(marcado.querySelector('svg')).not.toBeNull()
      expect(desmarcado.querySelector('svg')).toBeNull()
    })

    it('o motivo é filtrado pelo tipo; a saída abre sem motivo escolhido', () => {
      renderModal()

      expect(rotulosDosMotivos()).toEqual(['Compra/recebimento', 'Devolução de cliente', 'Outro'])

      escolherTipo('Saída')

      expect(rotulosDosMotivos()).toEqual([
        'Selecione o motivo',
        'Perda/avaria',
        'Vencido',
        'Uso interno',
        'Devolução ao fornecedor',
        'Outro',
      ])
      expect(campoMotivo()).toHaveValue('')
    })

    it('"Contagem" pré-seleciona Contagem/inventário e muda o rótulo para "Saldo contado", com ajuda', () => {
      renderModal()

      escolherTipo('Contagem')

      expect(campoMotivo()).toHaveValue('CONTAGEM')
      expect(rotulosDosMotivos()).toEqual(['Contagem/inventário', 'Outro'])
      expect(campoQuantidade()).toHaveAccessibleName('Saldo contado (UN)')
      expect(campoQuantidade()).toHaveAccessibleDescription('Quanto você contou. O sistema calcula a diferença.')
    })

    it('"Outro" exige a observação e leva o foco a ela', async () => {
      renderModal()
      preencherSaida()
      fireEvent.change(campoMotivo(), { target: { value: 'OUTRO' } })
      expect(campoObservacao()).toHaveAccessibleName(/obrigatório/)

      confirmar()

      expect(await screen.findByText('Descreva o motivo.')).toBeInTheDocument()
      await waitFor(() => expect(campoObservacao()).toHaveFocus())
      expect(ajustarEstoqueMock).not.toHaveBeenCalled()
    })
  })

  describe('prévia e botão de confirmar', () => {
    it('mostra a prévia (com a diferença na contagem) e o botão diz a ação', () => {
      renderModal()

      fireEvent.change(campoQuantidade(), { target: { value: '5' } })
      expect(within(regiaoDaPrevia()).getByText('Saldo: 12 UN → 17 UN')).toBeInTheDocument()
      expect(botaoConfirmar()).toHaveTextContent('Registrar entrada')

      escolherTipo('Saída')
      fireEvent.change(campoQuantidade(), { target: { value: '2' } })
      expect(within(regiaoDaPrevia()).getByText('Saldo: 12 UN → 10 UN')).toBeInTheDocument()
      expect(botaoConfirmar()).toHaveTextContent('Registrar saída')

      escolherTipo('Contagem')
      fireEvent.change(campoQuantidade(), { target: { value: '10' } })
      expect(within(regiaoDaPrevia()).getByText('Saldo: 12 UN → 10 UN (−2 UN)')).toBeInTheDocument()
      expect(botaoConfirmar()).toHaveTextContent('Ajustar para 10 UN')
    })

    it('saída acima do saldo mostra o erro na região viva, já ao digitar, e bloqueia o envio', async () => {
      renderModal()
      preencherSaida('13')

      expect(within(regiaoDaPrevia()).getByText('Saldo insuficiente: há 12 UN.')).toBeInTheDocument()
      expect(campoQuantidade()).toHaveAttribute('aria-invalid', 'true')
      expect(campoQuantidade()).toHaveAccessibleDescription('Saldo insuficiente: há 12 UN.')
      expect(screen.queryByText(/^Saldo: /)).not.toBeInTheDocument()

      confirmar()

      await waitFor(() => expect(campoQuantidade()).toHaveFocus())
      // O erro aparece uma vez so (na regiao viva), nao repetido sob o campo.
      expect(screen.getAllByText('Saldo insuficiente: há 12 UN.')).toHaveLength(1)
      expect(ajustarEstoqueMock).not.toHaveBeenCalled()
    })

    it('contagem igual ao saldo confere em tom neutro, e o botão vira "Fechar"', () => {
      const { aoFechar } = renderModal()
      escolherTipo('Contagem')
      fireEvent.change(campoQuantidade(), { target: { value: '12' } })

      expect(
        within(regiaoDaPrevia()).getByText('A contagem confere com o saldo (12 UN). Não há nada a ajustar.'),
      ).toBeInTheDocument()
      expect(campoQuantidade()).not.toHaveAttribute('aria-invalid')
      expect(botaoConfirmar()).toHaveTextContent('Fechar')

      confirmar()

      expect(aoFechar).toHaveBeenCalled()
      expect(ajustarEstoqueMock).not.toHaveBeenCalled()
    })
  })

  describe('Zerar estoque', () => {
    it('preenche Contagem, saldo contado 0 e Contagem/inventário; confirmar envia quantidade 0', async () => {
      ajustarEstoqueMock.mockResolvedValue({ ...MOVIMENTO, tipo: 'AJUSTE', motivo: 'CONTAGEM', quantidade: -12, saldoNovo: 0 })
      renderModal()

      fireEvent.click(within(dialogo()).getByRole('button', { name: 'Zerar estoque' }))

      expect(screen.getByRole('radio', { name: 'Contagem' })).toBeChecked()
      expect(campoQuantidade()).toHaveValue('0')
      expect(campoMotivo()).toHaveValue('CONTAGEM')
      expect(within(regiaoDaPrevia()).getByText('Saldo: 12 UN → 0 UN (−12 UN)')).toBeInTheDocument()
      // O atalho sai da tela depois de aplicado: o unico "Zerar estoque" e o de confirmar.
      expect(within(dialogo()).getAllByRole('button', { name: 'Zerar estoque' })).toEqual([botaoConfirmar()])

      confirmar()

      await waitFor(() => expect(ajustarEstoqueMock).toHaveBeenCalledTimes(1))
      expect(ultimoAjuste()).toMatchObject({ tipo: 'AJUSTE', quantidade: 0, motivo: 'CONTAGEM', observacao: null })
    })

    it('o motivo preenchido pode ser trocado', () => {
      renderModal()
      fireEvent.click(within(dialogo()).getByRole('button', { name: 'Zerar estoque' }))

      fireEvent.change(campoMotivo(), { target: { value: 'OUTRO' } })

      expect(campoMotivo()).toHaveValue('OUTRO')
      expect(campoQuantidade()).toHaveValue('0')
    })

    it('não aparece com saldo zero', () => {
      renderModal({ saldo: 0 })
      expect(within(dialogo()).queryByRole('button', { name: 'Zerar estoque' })).not.toBeInTheDocument()
    })
  })

  describe('quantidade e fração', () => {
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

    it('contagem com saldo contado 0 envia quantidade: 0', async () => {
      ajustarEstoqueMock.mockResolvedValue(MOVIMENTO)
      renderModal()
      escolherTipo('Contagem')
      fireEvent.change(campoQuantidade(), { target: { value: '0' } })

      confirmar()

      await waitFor(() => expect(ajustarEstoqueMock).toHaveBeenCalledTimes(1))
      expect(ultimoAjuste()).toMatchObject({ tipo: 'AJUSTE', quantidade: 0, motivo: 'CONTAGEM' })
    })
  })

  describe('envio e idempotência', () => {
    it('duplo clique em confirmar envia uma vez só e o botão fica desabilitado', async () => {
      ajustarEstoqueMock.mockReturnValue(new Promise(() => {}))
      renderModal()
      preencherSaida()

      confirmar()
      confirmar()

      await waitFor(() => expect(botaoConfirmar()).toBeDisabled())
      expect(ajustarEstoqueMock).toHaveBeenCalledTimes(1)
    })

    it('erro de rede: recarrega o produto e a nova tentativa usa a mesma chave (Review Focus 3)', async () => {
      ajustarEstoqueMock
        .mockRejectedValueOnce(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
        .mockResolvedValueOnce(MOVIMENTO)
      const { aoConcluir, queryClient } = renderModal()
      queryClient.setQueryData(CHAVE_DO_PRODUTO, {})
      preencherSaida()

      confirmar()

      expect(
        await screen.findByText('Não foi possível registrar o ajuste. Confira a conexão e tente de novo.'),
      ).toBeInTheDocument()
      expect(screen.queryByText(/Nao foi possivel conectar/)).not.toBeInTheDocument()
      // O saldo real aparece antes de tentar de novo (o envio pode ter chegado ao servidor).
      expect(queryClient.getQueryState(CHAVE_DO_PRODUTO)?.isInvalidated).toBe(true)
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

    it('o envio do formulário do modal (o Enter num campo) confirma', async () => {
      ajustarEstoqueMock.mockResolvedValue(MOVIMENTO)
      renderModal()
      preencherSaida()

      await act(async () => {
        fireEvent.submit(campoQuantidade().closest('form') as HTMLFormElement)
      })

      expect(ajustarEstoqueMock).toHaveBeenCalledTimes(1)
    })

    it('sucesso: avisa a página com o movimento e invalida os produtos (detalhe, listas e histórico)', async () => {
      ajustarEstoqueMock.mockResolvedValue(MOVIMENTO)
      const { aoConcluir, queryClient } = renderModal()
      const chaves = [
        CHAVE_DO_PRODUTO,
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
  })

  describe('erros do servidor', () => {
    it('400 com campos mostra o erro no campo e leva o foco a ele', async () => {
      ajustarEstoqueMock.mockRejectedValue(
        new HttpError(400, 'Dados invalidos.', { quantidade: 'Saldo insuficiente: há 1 UN.' }),
      )
      renderModal()
      preencherSaida()

      confirmar()

      expect(await screen.findByText('Saldo insuficiente: há 1 UN.')).toBeInTheDocument()
      await waitFor(() => expect(campoQuantidade()).toHaveFocus())
      expect(campoQuantidade()).toHaveAccessibleDescription('Saldo insuficiente: há 1 UN.')
      // Mudar o campo tira o erro do servidor.
      fireEvent.change(campoQuantidade(), { target: { value: '1' } })
      expect(screen.queryByText('Saldo insuficiente: há 1 UN.')).not.toBeInTheDocument()
    })

    it('400 sem campos (produto sem controle) mostra a mensagem no topo, com o foco nela', async () => {
      ajustarEstoqueMock.mockRejectedValue(new HttpError(400, 'Este produto não controla estoque.'))
      renderModal()
      preencherSaida()

      confirmar()

      const alerta = await within(dialogo()).findByRole('alert')
      expect(alerta).toHaveTextContent('Este produto não controla estoque.')
      await waitFor(() => expect(alerta.parentElement).toHaveFocus())
    })

    it('409: texto fixo, recarrega o produto e a próxima tentativa é uma operação nova', async () => {
      ajustarEstoqueMock
        .mockRejectedValueOnce(new HttpError(409, 'Esta operação já foi registrada com outros dados.'))
        .mockResolvedValueOnce(MOVIMENTO)
      const { queryClient } = renderModal()
      queryClient.setQueryData(CHAVE_DO_PRODUTO, { id: ID_ARROZ })
      preencherSaida()

      confirmar()

      expect(await within(dialogo()).findByRole('alert')).toHaveTextContent(
        'Um ajuste deste produto já foi registrado agora há pouco. Confira o saldo atual antes de confirmar de novo.',
      )
      expect(queryClient.getQueryState(CHAVE_DO_PRODUTO)?.isInvalidated).toBe(true)
      const primeira = ultimoAjuste().chave

      confirmar()

      await waitFor(() => expect(ajustarEstoqueMock).toHaveBeenCalledTimes(2))
      expect(ultimoAjuste().chave).not.toBe(primeira)
    })

    it('403, 404 e falha interna usam textos fixos, sem vazar detalhe; 5xx recarrega o produto', async () => {
      ajustarEstoqueMock
        .mockRejectedValueOnce(new HttpError(403, 'Forbidden'))
        .mockRejectedValueOnce(new HttpError(404, 'Not Found'))
        .mockRejectedValueOnce(new HttpError(500, 'NullPointerException'))
      const { queryClient } = renderModal()
      preencherSaida()

      confirmar()
      expect(await screen.findByText('Somente administradores podem ajustar o estoque.')).toBeInTheDocument()

      confirmar()
      expect(await screen.findByText('Este produto não existe mais. Atualize a tela.')).toBeInTheDocument()

      queryClient.setQueryData(CHAVE_DO_PRODUTO, {})
      confirmar()
      expect(
        await screen.findByText('Não foi possível registrar o ajuste. Confira a conexão e tente de novo.'),
      ).toBeInTheDocument()
      expect(queryClient.getQueryState(CHAVE_DO_PRODUTO)?.isInvalidated).toBe(true)
      expect(screen.queryByText(/NullPointer|Forbidden|Not Found/)).not.toBeInTheDocument()
    })
  })

  describe('fechar', () => {
    it('Esc fecha', () => {
      const { aoFechar } = renderModal()

      fireEvent.keyDown(dialogo(), { key: 'Escape' })

      expect(aoFechar).toHaveBeenCalled()
    })

    it('durante o envio, Esc não fecha e não há botão de fechar', async () => {
      ajustarEstoqueMock.mockReturnValue(new Promise(() => {}))
      const { aoFechar } = renderModal()
      preencherSaida()
      confirmar()
      await waitFor(() => expect(botaoConfirmar()).toBeDisabled())
      expect(aoFechar).not.toHaveBeenCalled()

      fireEvent.keyDown(dialogo(), { key: 'Escape' })

      expect(aoFechar).not.toHaveBeenCalled()
      expect(within(dialogo()).queryByRole('button', { name: 'Fechar' })).not.toBeInTheDocument()
    })
  })

  describe('ajuste em embalagens (Fase B3)', () => {
    const FARDO = { id: 'emb-fd6', rotulo: 'FD c/ 6 UN', quantidade: 6, deCompra: false }
    const CAIXA = { id: 'emb-cx18', rotulo: 'CX c/ 18 UN', quantidade: 18, deCompra: true }
    const EMBALAGENS = [FARDO, CAIXA]

    function seletorEm(): HTMLElement {
      return within(dialogo()).getByRole('combobox', { name: 'Em (unidade ou embalagem)' })
    }

    it('o seletor "Em" aparece na Entrada e na Saída, com a sigla de venda e os rótulos; não na Contagem', () => {
      renderModal({ saldo: 10, embalagens: EMBALAGENS })

      expect(rotulosDe(seletorEm())).toEqual(['UN', 'FD c/ 6 UN', 'CX c/ 18 UN'])
      escolherTipo('Saída')
      expect(seletorEm()).toBeInTheDocument()
      escolherTipo('Contagem')
      expect(within(dialogo()).queryByRole('combobox', { name: 'Em (unidade ou embalagem)' })).not.toBeInTheDocument()
      expect(campoQuantidade()).toHaveAccessibleName('Saldo contado (UN)')
    })

    it('sem embalagens, não há seletor', () => {
      renderModal()
      expect(within(dialogo()).queryByRole('combobox', { name: 'Em (unidade ou embalagem)' })).not.toBeInTheDocument()
    })

    it('na Entrada com Compra, o padrão é a embalagem de compra; com outro motivo ou na Saída, a unidade de venda', () => {
      renderModal({ saldo: 10, embalagens: EMBALAGENS })

      expect(seletorEm()).toHaveValue('emb-cx18')
      fireEvent.change(campoMotivo(), { target: { value: 'DEVOLUCAO_CLIENTE' } })
      expect(seletorEm()).toHaveValue('')
      fireEvent.change(campoMotivo(), { target: { value: 'COMPRA' } })
      expect(seletorEm()).toHaveValue('emb-cx18')
      escolherTipo('Saída')
      expect(seletorEm()).toHaveValue('')
    })

    it('a escolha do usuário fica ao trocar o motivo e o tipo', () => {
      renderModal({ saldo: 10, embalagens: EMBALAGENS })

      fireEvent.change(seletorEm(), { target: { value: 'emb-fd6' } })
      fireEvent.change(campoMotivo(), { target: { value: 'DEVOLUCAO_CLIENTE' } })
      expect(seletorEm()).toHaveValue('emb-fd6')
      fireEvent.change(campoMotivo(), { target: { value: 'COMPRA' } })
      expect(seletorEm()).toHaveValue('emb-fd6')
      escolherTipo('Saída')
      expect(seletorEm()).toHaveValue('emb-fd6')
    })

    it('mostra a prévia em embalagens logo abaixo da quantidade, e o botão diz o total', () => {
      renderModal({ saldo: 10, embalagens: EMBALAGENS })

      fireEvent.change(campoQuantidade(), { target: { value: '2' } })

      expect(regiaoDaPrevia()).toHaveTextContent('2 CX c/ 18 UN = +36 UN · Saldo: 10 UN → 46 UN')
      expect(botaoConfirmar()).toHaveTextContent('Registrar entrada de 36 UN')
      // A previa fica entre a linha Quantidade/Em e o motivo.
      expect(regiaoDaPrevia().compareDocumentPosition(campoMotivo()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(seletorEm().compareDocumentPosition(regiaoDaPrevia()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

      escolherTipo('Saída')
      expect(botaoConfirmar()).toHaveTextContent('Registrar saída')
    })

    it('na unidade de venda, o botão continua sem o total', () => {
      renderModal({ saldo: 10, embalagens: EMBALAGENS })
      fireEvent.change(seletorEm(), { target: { value: '' } })
      fireEvent.change(campoQuantidade(), { target: { value: '2' } })

      expect(botaoConfirmar()).toHaveTextContent(/^Registrar entrada$/)
    })

    it('a saída em embalagens respeita o saldo em unidades', () => {
      renderModal({ saldo: 46, embalagens: EMBALAGENS })
      escolherTipo('Saída')
      fireEvent.change(seletorEm(), { target: { value: 'emb-cx18' } })

      fireEvent.change(campoQuantidade(), { target: { value: '3' } })

      expect(regiaoDaPrevia()).toHaveTextContent('Saldo insuficiente: há 46 UN.')
    })

    it('1,5 embalagem é barrado com a mensagem da API, sem enviar', async () => {
      renderModal({ saldo: 10, embalagens: EMBALAGENS })
      fireEvent.change(campoQuantidade(), { target: { value: '1,5' } })

      confirmar()

      await waitFor(() => expect(campoQuantidade()).toHaveFocus())
      expect(campoQuantidade()).toHaveAccessibleDescription('Informe um número inteiro de embalagens.')
      expect(ajustarEstoqueMock).not.toHaveBeenCalled()
    })

    it('envia o embalagemId e a quantidade em embalagens', async () => {
      ajustarEstoqueMock.mockResolvedValue(MOVIMENTO)
      renderModal({ saldo: 10, embalagens: EMBALAGENS })
      fireEvent.change(campoQuantidade(), { target: { value: '2' } })

      confirmar()

      await waitFor(() => expect(ajustarEstoqueMock).toHaveBeenCalledTimes(1))
      expect(ajustarEstoqueMock).toHaveBeenCalledWith(ID_ARROZ, {
        tipo: 'ENTRADA',
        quantidade: 2,
        motivo: 'COMPRA',
        observacao: null,
        chave: expect.any(String),
        embalagemId: 'emb-cx18',
      })
    })

    it('na unidade de venda, o request não leva embalagemId', async () => {
      ajustarEstoqueMock.mockResolvedValue(MOVIMENTO)
      renderModal({ saldo: 10, embalagens: EMBALAGENS })
      fireEvent.change(seletorEm(), { target: { value: '' } })
      fireEvent.change(campoQuantidade(), { target: { value: '2' } })

      confirmar()

      await waitFor(() => expect(ajustarEstoqueMock).toHaveBeenCalledTimes(1))
      expect(ajustarEstoqueMock.mock.calls[0][1]).not.toHaveProperty('embalagemId')
    })

    it('404 com embalagem: avisa, e a recarga sem ela volta o seletor à sigla, limpa a quantidade e foca o seletor', async () => {
      ajustarEstoqueMock.mockRejectedValue(new HttpError(404, 'Embalagem não encontrada.'))
      const { rerender, queryClient } = renderModal({ saldo: 10, embalagens: EMBALAGENS })
      fireEvent.change(campoQuantidade(), { target: { value: '2' } })

      confirmar()

      expect(
        await within(dialogo()).findByText('A embalagem escolhida foi removida. Confira a quantidade e tente de novo.'),
      ).toBeInTheDocument()
      expect(seletorEm()).toHaveValue('emb-cx18')

      // O produto recarregado ja nao tem a caixa.
      rerender(
        <QueryClientProvider client={queryClient}>
          <ModalAjusteEstoque {...PROPS_PADRAO} saldo={10} embalagens={[FARDO]} />
        </QueryClientProvider>,
      )

      await waitFor(() => expect(seletorEm()).toHaveValue(''))
      expect(campoQuantidade()).toHaveValue('')
      await waitFor(() => expect(seletorEm()).toHaveFocus())
      expect(rotulosDe(seletorEm())).toEqual(['UN', 'FD c/ 6 UN'])
    })

    it('404 sem embalagem continua sendo do produto', async () => {
      ajustarEstoqueMock.mockRejectedValue(new HttpError(404, 'Produto não encontrado.'))
      renderModal({ saldo: 10, embalagens: EMBALAGENS })
      fireEvent.change(seletorEm(), { target: { value: '' } })
      fireEvent.change(campoQuantidade(), { target: { value: '2' } })

      confirmar()

      expect(await within(dialogo()).findByText('Este produto não existe mais. Atualize a tela.')).toBeInTheDocument()
    })
  })
})

function rotulosDe(select: HTMLElement): string[] {
  return within(select).getAllByRole('option').map((opcao) => opcao.textContent ?? '')
}
