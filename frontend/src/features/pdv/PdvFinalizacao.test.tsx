import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { chaveDoCarrinho, lerCarrinhoGuardado, lerGuardado, type Carrinho } from '@/features/pdv/carrinho'
import { PdvPage } from '@/features/pdv/PdvPage'
import { MENSAGEM_TENTATIVA_PENDENTE } from '@/features/pdv/useCarrinho'
import { chaveDasVendasEmEspera, guardarVendasEmEspera, type VendaEmEspera } from '@/features/pdv/vendasEmEspera'
import { useAuth } from '@/hooks/useAuth'
import { obterEmpresa } from '@/services/empresaService'
import { listarPontos, sessaoAtual } from '@/services/caixaService'
import { buscar as buscarConfiguracao } from '@/services/configuracaoPdvService'
import { HttpError } from '@/services/httpClient'
import {
  buscarVenda,
  buscarVendaParaDevolucao,
  calcular,
  cancelarVenda,
  devolverItens,
  finalizar,
  listarVendas,
  resolverCodigo,
} from '@/services/pdvService'
import { pontoDeTeste, sessaoDeTeste } from '@/test/fixturesCaixa'
import { calculoFalso, itemResolvido, NEXGARD, RACAO, vendaResumo } from '@/test/fixturesPdv'
import type { Empresa } from '@/types/empresa'
import type { CarrinhoRequest, Devolucao, Venda, VendaParaDevolucao } from '@/types/pdv'

vi.mock('@/hooks/useAuth', () => ({ useAuth: vi.fn() }))
vi.mock('@/features/pdv/bipeDeErro', () => ({ tocarBipeDeErro: vi.fn() }))
vi.mock('@/services/caixaService', () => ({
  sessaoAtual: vi.fn(),
  listarPontos: vi.fn(),
  abrir: vi.fn(),
  buscarSessao: vi.fn(),
}))
vi.mock('@/services/configuracaoPdvService', () => ({ buscar: vi.fn() }))
vi.mock('@/services/clienteService', () => ({ listarClientes: vi.fn() }))
vi.mock('@/services/pdvService', () => ({
  resolverCodigo: vi.fn(),
  buscarProdutos: vi.fn(),
  calcular: vi.fn(),
  finalizar: vi.fn(),
  listarVendas: vi.fn(),
  buscarVenda: vi.fn(),
  cancelarVenda: vi.fn(),
  buscarVendaParaDevolucao: vi.fn(),
  devolverItens: vi.fn(),
  listarCatalogo: vi.fn(async () => ({ produtos: [], temMais: false })),
}))
vi.mock('@/services/categoriaService', () => ({ listarCategorias: vi.fn(async () => []) }))
vi.mock('@/services/empresaService', () => ({
  obterEmpresa: vi.fn(async () => {
    throw new Error('Sem a empresa no teste.')
  }),
}))

const useAuthMock = vi.mocked(useAuth)
const sessaoAtualMock = vi.mocked(sessaoAtual)
const listarPontosMock = vi.mocked(listarPontos)
const resolverMock = vi.mocked(resolverCodigo)
const calcularMock = vi.mocked(calcular)
const finalizarMock = vi.mocked(finalizar)
const listarVendasMock = vi.mocked(listarVendas)
const buscarVendaMock = vi.mocked(buscarVenda)
const cancelarVendaMock = vi.mocked(cancelarVenda)
const buscarParaDevolucaoMock = vi.mocked(buscarVendaParaDevolucao)
const devolverItensMock = vi.mocked(devolverItens)

const EMPRESA = 3
const USUARIO = 7
const MENSAGEM_PODE_TER_SIDO_GRAVADA = 'A última tentativa pode ter sido registrada. Tente de novo com os mesmos valores.'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function definirUsuario(perfil: 'ADMIN' | 'OPERADOR' = 'OPERADOR') {
  useAuthMock.mockReturnValue({
    usuario: {
      id: USUARIO,
      nome: 'Ana Souza',
      email: 'ana@mercado.com',
      perfil,
      empresa: { id: EMPRESA, nome: 'Mercado Central', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
    },
    token: 'token',
    estaAutenticado: true,
    carregandoSessao: false,
    login: vi.fn(),
    logout: vi.fn(),
  })
}

let queryClient: QueryClient

function renderPdv() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PdvPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function campo() {
  return screen.findByLabelText('Código ou nome')
}

async function ler(texto: string) {
  const entrada = await campo()
  fireEvent.change(entrada, { target: { value: texto } })
  fireEvent.keyDown(entrada, { key: 'Enter' })
}

function linhas() {
  const lista = screen.queryByRole('list', { name: 'Itens da venda' })
  return lista ? within(lista).queryAllByRole('listitem') : []
}

async function tecla(key: string, alvo?: HTMLElement) {
  fireEvent.keyDown(alvo ?? (await campo()), { key })
}

/** Lanca os itens e espera o calculo do carrinho completo. */
async function lancar(...codigos: string[]) {
  for (const codigo of codigos) {
    const antes = linhas().length
    await ler(codigo)
    await waitFor(() => expect(linhas().length).toBeGreaterThanOrEqual(antes))
  }
  await waitFor(() => expect(screen.getByRole('button', { name: /Ir para pagamento/ })).toBeEnabled())
}

async function abrirPagamento() {
  await tecla('F10')
  return screen.findByRole('dialog', { name: 'Pagamento' })
}

function venda(parcial: Partial<Venda> = {}): Venda {
  return { ...vendaResumo(), itens: [], ...parcial }
}

function guardado(): Carrinho {
  return lerCarrinhoGuardado(localStorage.getItem(chaveDoCarrinho(EMPRESA, USUARIO)), EMPRESA, USUARIO)
}

/** Escolhe a forma pela tecla, troca o valor e adiciona com Enter. */
async function pagar(janela: HTMLElement, teclaDaForma: string, valor?: string) {
  fireEvent.keyDown(within(janela).getByRole('group', { name: 'Formas de pagamento' }), { key: teclaDaForma })
  const campoDoValor = await within(janela).findByLabelText(/^Valor em /)
  if (valor !== undefined) {
    fireEvent.change(campoDoValor, { target: { value: valor } })
  }
  fireEvent.keyDown(campoDoValor, { key: 'Enter' })
}

describe('PDV: pagamento, finalização, espera e vendas do caixa', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    for (const mock of [
      finalizarMock,
      listarVendasMock,
      buscarVendaMock,
      cancelarVendaMock,
      buscarParaDevolucaoMock,
      devolverItensMock,
    ]) {
      mock.mockReset()
    }
    localStorage.clear()
    definirUsuario()
    sessaoAtualMock.mockResolvedValue(sessaoDeTeste())
    vi.mocked(buscarConfiguracao).mockResolvedValue({
      venderSemEstoque: true,
      descontoMaximoOperador: 10,
      atualizadoPorNome: null,
      atualizadoEm: null,
    })
    calcularMock.mockImplementation(async (carrinho: CarrinhoRequest) => {
      const calculo = calculoFalso(carrinho)
      const cartao = carrinho.pagamentos
        .filter((pagamento) => pagamento.forma !== 'DINHEIRO')
        .reduce((soma, pagamento) => soma + pagamento.valor, 0)
      if (cartao > calculo.total) {
        calculo.erros.push({ campo: 'pagamentos', mensagem: 'Cartão e PIX não podem passar do total. O troco só sai do dinheiro.' })
      }
      return calculo
    })
    resolverMock.mockImplementation(async (codigo) => {
      if (codigo === '542*3') {
        return itemResolvido({ quantidade: 3, codigoLido: '542*3' })
      }
      if (codigo === '900') {
        return itemResolvido({ tipo: 'EMBALAGEM', produto: NEXGARD, embalagemId: 'e-cx3', codigoLido: '900' })
      }
      return itemResolvido()
    })
  })

  describe('pagamento (F10)', () => {
    it('voltar ao carrinho guarda os pagamentos informados; mudar o carrinho os descarta', async () => {
      renderPdv()
      await lancar('542*3')
      let janela = await abrirPagamento()
      await pagar(janela, '4', '10.00')
      await within(janela).findByRole('button', { name: 'Remover PIX' })

      fireEvent.click(within(janela).getByRole('button', { name: /Voltar ao carrinho/ }))
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      janela = await abrirPagamento()
      expect(within(janela).getByRole('button', { name: 'Remover PIX' })).toBeInTheDocument()
      await waitFor(() => expect(within(janela).getByText('Falta pagar').nextSibling).toHaveTextContent('R$ 64,70'))

      fireEvent.keyDown(janela, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await lancar('542')
      janela = await abrirPagamento()
      expect(within(janela).queryByRole('button', { name: 'Remover PIX' })).not.toBeInTheDocument()
      expect(within(janela).getByText('Nenhum pagamento ainda.')).toBeInTheDocument()
    })

    it('"Usar o que falta" preenche o valor com o que falta e foca o campo', async () => {
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      fireEvent.keyDown(within(janela).getByRole('group', { name: 'Formas de pagamento' }), { key: '1' })
      const valor = await within(janela).findByLabelText('Valor em Dinheiro')
      fireEvent.change(valor, { target: { value: '5' } })

      fireEvent.click(within(janela).getByRole('button', { name: 'Usar o que falta' }))

      expect(valor).toHaveValue('24,90')
      expect(valor).toHaveFocus()
    })

    it('as teclas 1–4 escolhem a forma e preenchem o que falta pagar', async () => {
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()

      expect(within(janela).getByText('Falta pagar').nextSibling).toHaveTextContent('R$ 24,90')
      fireEvent.keyDown(within(janela).getByRole('group', { name: 'Formas de pagamento' }), { key: '2' })

      const valor = await within(janela).findByLabelText('Valor em Débito')
      expect(valor).toHaveValue('24,90')
      expect(valor).toHaveFocus()
    })

    it('pagamento dividido com troco: Enter finaliza, avisa o nº e o troco, esvazia e devolve o foco', async () => {
      finalizarMock.mockResolvedValue(venda({ numero: 128, total: 74.7, troco: 5.3 }))
      renderPdv()
      await lancar('542*3')
      const janela = await abrirPagamento()

      await pagar(janela, '4', '20,00')
      await waitFor(() => expect(within(janela).getByText('Falta pagar').nextSibling).toHaveTextContent('R$ 54,70'))
      await pagar(janela, '1', '60,00')

      await waitFor(() => expect(within(janela).getByText('Troco').nextSibling).toHaveTextContent('R$ 5,30'))
      expect(within(janela).getByText('Falta pagar').nextSibling).toHaveTextContent('R$ 0,00')
      const usadas = within(janela).getByRole('list', { name: 'Formas usadas' })
      expect(within(usadas).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
        expect.stringContaining('PIX'),
        expect.stringContaining('Dinheiro'),
      ])
      const finalizarVenda = within(janela).getByRole('button', { name: 'Finalizar venda' })
      await waitFor(() => expect(finalizarVenda).toHaveFocus())
      fireEvent.keyDown(finalizarVenda, { key: 'Enter' })
      fireEvent.click(finalizarVenda)

      await waitFor(() => expect(finalizarMock).toHaveBeenCalledTimes(1))
      expect(finalizarMock).toHaveBeenCalledWith(
        expect.objectContaining({
          chave: expect.stringMatching(UUID),
          totalEsperado: 74.7,
          pagamentos: [
            { forma: 'PIX', valor: 20 },
            { forma: 'DINHEIRO', valor: 60 },
          ],
        }),
      )
      // UX 6: a última venda e o troco grande no painel, logo abaixo do TOTAL.
      const ultima = await screen.findByRole('status', { name: 'Última venda' })
      expect(ultima).toHaveTextContent('Venda nº 128 concluída')
      expect(ultima).toHaveTextContent('Troco R$ 5,30')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(linhas()).toHaveLength(0)
      expect(guardado().linhas).toHaveLength(0)
      await waitFor(async () => expect(await campo()).toHaveFocus())

      // O resumo fica até o primeiro item da próxima venda.
      await ler('542')
      await waitFor(() => expect(screen.queryByRole('status', { name: 'Última venda' })).not.toBeInTheDocument())
    })

    it('S9: depois de vender, a busca e os produtos são recarregados (saldo novo)', async () => {
      finalizarMock.mockResolvedValue(venda({ numero: 140, troco: 0 }))
      renderPdv()
      await lancar('542')
      const invalidar = vi.spyOn(queryClient, 'invalidateQueries')
      const janela = await abrirPagamento()
      await pagar(janela, '1')
      await waitFor(() => expect(within(janela).getByRole('button', { name: /Finalizar venda/ })).toBeEnabled())
      fireEvent.click(within(janela).getByRole('button', { name: /Finalizar venda/ }))

      await screen.findByRole('status', { name: 'Última venda' })
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ['pdv', 'busca'] })
      expect(invalidar).toHaveBeenCalledWith({ queryKey: ['produtos'] })
    })

    it('S10: abrir o pagamento não repete o cálculo do carrinho', async () => {
      renderPdv()
      await lancar('542')
      const antes = calcularMock.mock.calls.length

      await abrirPagamento()
      // Timers falsos no lugar da espera real: passa do atraso do cálculo sem depender do relógio.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      try {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000)
        })
      } finally {
        vi.useRealTimers()
      }

      expect(calcularMock.mock.calls.length).toBe(antes)
    })

    it('UX 7: com falta, "Falta pagar" domina; pago, o troco cresce, e o Enter aparece no Finalizar', async () => {
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      expect(within(janela).getByText('Falta pagar').nextSibling).toHaveClass('text-4xl')
      expect(within(janela).getByText('Troco').nextSibling).toHaveClass('text-muted-foreground')

      await pagar(janela, '1', '30,00')

      await waitFor(() => expect(within(janela).getByText('Troco').nextSibling).toHaveClass('text-4xl'))
      expect(within(janela).getByText('Falta pagar').nextSibling).not.toHaveClass('text-4xl')
      expect(janela).toHaveAccessibleDescription('Pagamento completo. Enter finaliza a venda.')
      expect(within(janela).getByRole('button', { name: /Finalizar venda/ })).toHaveTextContent('Enter')
    })

    it('S12: o "Falta pagar" do servidor (campo pagamentos) não aparece como erro', async () => {
      calcularMock.mockImplementation(async (carrinho: CarrinhoRequest) => {
        const calculo = calculoFalso(carrinho)
        if (calculo.faltaPagar > 0) {
          calculo.erros.push({ campo: 'pagamentos', mensagem: 'Falta pagar R$ 24,90.' })
        }
        return calculo
      })
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '1', '10,00')

      await waitFor(() => expect(within(janela).getByText('Falta pagar').nextSibling).toHaveTextContent('R$ 14,90'))
      expect(within(janela).queryByText(/Falta pagar R\$/)).not.toBeInTheDocument()
    })

    it('cartão acima do total: o erro do servidor aparece e "Finalizar venda" fica desabilitado', async () => {
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()

      await pagar(janela, '3', '30,00')

      // UX 7: recusado na hora, sem ir ao servidor.
      expect(
        await within(janela).findByText(
          'Crédito não pode passar do que falta pagar (R$ 24,90). O troco só sai do dinheiro.',
        ),
      ).toBeInTheDocument()
      expect(within(janela).queryByRole('list', { name: 'Formas usadas' })).not.toBeInTheDocument()
      expect(within(janela).getByRole('button', { name: /Finalizar venda/ })).toBeDisabled()
    })

    it('o erro do servidor de cartão acima do total também aparece na janela', async () => {
      // O dinheiro paga parte; o PIX passa do total quando o servidor recalcula com outro preço.
      calcularMock.mockImplementation(async (carrinho: CarrinhoRequest) => {
        const calculo = calculoFalso(carrinho)
        if (carrinho.pagamentos.some((pagamento) => pagamento.forma === 'PIX')) {
          calculo.erros.push({ campo: 'pagamentos', mensagem: 'Cartão e PIX não podem passar do total. O troco só sai do dinheiro.' })
        }
        return calculo
      })
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '4')

      expect(
        await within(janela).findByText('Cartão e PIX não podem passar do total. O troco só sai do dinheiro.'),
      ).toBeInTheDocument()
      expect(within(janela).getByRole('button', { name: /Finalizar venda/ })).toBeDisabled()
    })

    it('"O total da venda mudou": mostra o anterior e o novo; Confirmar reenvia com o novo total e a mesma chave', async () => {
      finalizarMock
        .mockRejectedValueOnce(new HttpError(409, 'O total da venda mudou. Confira os valores.'))
        .mockResolvedValueOnce(venda({ numero: 129, troco: 0 }))
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '1', '50,00')
      await waitFor(() => expect(within(janela).getByRole('button', { name: 'Finalizar venda' })).toBeEnabled())
      // A promoção acabou entre o cálculo e o finalizar.
      calcularMock.mockImplementation(async (carrinho: CarrinhoRequest) => ({
        ...calculoFalso(carrinho),
        total: 26.9,
        subtotal: 26.9,
        faltaPagar: 0,
        troco: 23.1,
      }))
      fireEvent.click(within(janela).getByRole('button', { name: 'Finalizar venda' }))

      const mudou = await screen.findByRole('dialog', { name: 'O total da venda mudou' })
      expect(within(mudou).getByText('Total anterior').nextSibling).toHaveTextContent('R$ 24,90')
      expect(await within(mudou).findByText('R$ 26,90')).toBeInTheDocument()
      fireEvent.click(within(mudou).getByRole('button', { name: 'Confirmar e finalizar' }))

      await waitFor(() => expect(finalizarMock).toHaveBeenCalledTimes(2))
      const [primeira, segunda] = finalizarMock.mock.calls.map(([dados]) => dados)
      expect(primeira.totalEsperado).toBe(24.9)
      expect(segunda.totalEsperado).toBe(26.9)
      expect(segunda.chave).toBe(primeira.chave)
      expect(await screen.findByText('Venda nº 129 concluída')).toBeInTheDocument()
    })

    it('a rede caiu: as formas travam, o aviso aparece e "Tentar de novo" reenvia o mesmo corpo e a mesma chave', async () => {
      finalizarMock
        .mockRejectedValueOnce(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
        .mockResolvedValueOnce(venda({ numero: 130, troco: 0 }))
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '4')
      const finalizarVenda = within(janela).getByRole('button', { name: 'Finalizar venda' })
      await waitFor(() => expect(finalizarVenda).toBeEnabled())
      // A chave já fica guardada com o carrinho na primeira tentativa.
      fireEvent.click(finalizarVenda)
      expect(lerGuardado(localStorage.getItem(chaveDoCarrinho(EMPRESA, USUARIO)), EMPRESA, USUARIO).tentativa?.chave).toMatch(UUID)

      expect(await within(janela).findByText(MENSAGEM_PODE_TER_SIDO_GRAVADA)).toBeInTheDocument()
      for (const forma of within(janela).getAllByRole('button', { name: /Dinheiro|Débito|Crédito|PIX/ })) {
        expect(forma).toBeDisabled()
      }
      expect(within(janela).getByRole('button', { name: 'Remover PIX' })).toBeDisabled()
      expect(guardado().linhas).toHaveLength(1)
      fireEvent.click(within(janela).getByRole('button', { name: 'Tentar de novo' }))

      await waitFor(() => expect(finalizarMock).toHaveBeenCalledTimes(2))
      expect(finalizarMock.mock.calls[1][0]).toEqual(finalizarMock.mock.calls[0][0])
      expect(await screen.findByText('Venda nº 130 concluída')).toBeInTheDocument()
      expect(localStorage.getItem(chaveDoCarrinho(EMPRESA, USUARIO))).toBeNull()
    })

    it('Esc depois da queda de rede mantém a chave e a trava: a nova janela reenvia a mesma chave', async () => {
      finalizarMock.mockRejectedValue(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
      renderPdv()
      await lancar('542')
      let janela = await abrirPagamento()
      await pagar(janela, '4')
      await waitFor(() => expect(within(janela).getByRole('button', { name: 'Finalizar venda' })).toBeEnabled())
      fireEvent.click(within(janela).getByRole('button', { name: 'Finalizar venda' }))
      await within(janela).findByText(MENSAGEM_PODE_TER_SIDO_GRAVADA)
      fireEvent.keyDown(janela, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(await campo()).toHaveFocus()

      janela = await abrirPagamento()
      expect(within(janela).getByText(MENSAGEM_PODE_TER_SIDO_GRAVADA)).toBeInTheDocument()
      expect(within(janela).getByRole('list', { name: 'Formas usadas' })).toHaveTextContent('PIX')
      fireEvent.click(within(janela).getByRole('button', { name: 'Tentar de novo' }))

      await waitFor(() => expect(finalizarMock).toHaveBeenCalledTimes(2))
      expect(finalizarMock.mock.calls[1][0].chave).toBe(finalizarMock.mock.calls[0][0].chave)
    })

    it('recarregar a página depois da queda de rede mantém a chave', async () => {
      finalizarMock
        .mockRejectedValueOnce(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
        .mockResolvedValueOnce(venda({ numero: 131, troco: 0 }))
      const { unmount } = renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '4')
      await waitFor(() => expect(within(janela).getByRole('button', { name: 'Finalizar venda' })).toBeEnabled())
      fireEvent.click(within(janela).getByRole('button', { name: 'Finalizar venda' }))
      await within(janela).findByText(MENSAGEM_PODE_TER_SIDO_GRAVADA)
      unmount()

      renderPdv()
      await waitFor(() => expect(linhas()).toHaveLength(1))
      // Com a tentativa travada, o F10 abre direto na trava, mesmo antes do cálculo.
      await tecla('F10')
      const reaberta = await screen.findByRole('dialog', { name: 'Pagamento' })
      fireEvent.click(within(reaberta).getByRole('button', { name: 'Tentar de novo' }))

      await waitFor(() => expect(finalizarMock).toHaveBeenCalledTimes(2))
      expect(finalizarMock.mock.calls[1][0]).toEqual(finalizarMock.mock.calls[0][0])
      expect(await screen.findByText('Venda nº 131 concluída')).toBeInTheDocument()
    })

    it('a rede caiu e depois o caixa fechou: a tentativa continua com a mesma chave', async () => {
      finalizarMock
        .mockRejectedValueOnce(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
        .mockRejectedValueOnce(new HttpError(409, 'Abra o caixa para vender.'))
        .mockResolvedValueOnce(venda({ numero: 132, troco: 0 }))
      listarPontosMock.mockResolvedValue([pontoDeTeste()])
      const { unmount } = renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '4')
      await waitFor(() => expect(within(janela).getByRole('button', { name: /Finalizar venda/ })).toBeEnabled())
      fireEvent.click(within(janela).getByRole('button', { name: /Finalizar venda/ }))
      await within(janela).findByText(MENSAGEM_PODE_TER_SIDO_GRAVADA)
      const chave = finalizarMock.mock.calls[0][0].chave
      // O ADMIN fechou o caixa antes do "Tentar de novo".
      sessaoAtualMock.mockResolvedValue(null)
      fireEvent.click(within(janela).getByRole('button', { name: 'Tentar de novo' }))

      expect(await screen.findByRole('heading', { name: 'Abra o caixa para vender.' })).toBeInTheDocument()
      expect(lerGuardado(localStorage.getItem(chaveDoCarrinho(EMPRESA, USUARIO)), EMPRESA, USUARIO).tentativa).toMatchObject({
        chave,
        trava: 'REDE',
      })
      unmount()

      // O caixa foi reaberto: a mesma chave volta no "Tentar de novo" (o backend devolve a venda original).
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste())
      renderPdv()
      await waitFor(() => expect(linhas()).toHaveLength(1))
      await tecla('F10')
      const reaberta = await screen.findByRole('dialog', { name: 'Pagamento' })
      fireEvent.click(within(reaberta).getByRole('button', { name: 'Tentar de novo' }))

      await waitFor(() => expect(finalizarMock).toHaveBeenCalledTimes(3))
      expect(finalizarMock.mock.calls.map(([dados]) => dados.chave)).toEqual([chave, chave, chave])
      expect(await screen.findByRole('status', { name: 'Última venda' })).toHaveTextContent('Venda nº 132 concluída')
    })

    it('com a tentativa travada, bipar, +, F6 e Retomar são recusados', async () => {
      finalizarMock.mockRejectedValue(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
      const emEspera: VendaEmEspera = {
        id: 'v-espera',
        criadaEm: '2026-10-24T18:00:00-03:00',
        itens: 1,
        total: 89.9,
        carrinho: {
          linhas: [{ id: 'l-e', produto: NEXGARD, embalagemId: null, quantidade: 1, codigoLido: '900', etiqueta: false, desconto: null }],
          desconto: null,
          cliente: null,
        },
      }
      localStorage.setItem(chaveDasVendasEmEspera(EMPRESA, USUARIO), guardarVendasEmEspera([emEspera], EMPRESA, USUARIO))
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '4')
      await waitFor(() => expect(within(janela).getByRole('button', { name: /Finalizar venda/ })).toBeEnabled())
      fireEvent.click(within(janela).getByRole('button', { name: /Finalizar venda/ }))
      await within(janela).findByText(MENSAGEM_PODE_TER_SIDO_GRAVADA)
      fireEvent.keyDown(janela, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      const corpo = guardado()
      const recusado = await screen.findByText.bind(screen)

      await ler('900')
      expect(await recusado(MENSAGEM_TENTATIVA_PENDENTE)).toBeInTheDocument()
      await tecla('Escape')
      await tecla('+')
      expect(await recusado(MENSAGEM_TENTATIVA_PENDENTE)).toBeInTheDocument()
      await tecla('Escape')
      await tecla('F6')
      expect(await recusado(MENSAGEM_TENTATIVA_PENDENTE)).toBeInTheDocument()
      await tecla('F7')
      const espera = await screen.findByRole('dialog', { name: 'Vendas em espera' })
      fireEvent.click(within(espera).getByRole('button', { name: 'Retomar' }))
      fireEvent.click(await within(espera).findByRole('button', { name: 'Pôr em espera e retomar' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(await recusado(MENSAGEM_TENTATIVA_PENDENTE)).toBeInTheDocument()
      // Nada mudou: o mesmo carrinho (1 Ração), a mesma tentativa e a venda continua em espera.
      expect(guardado()).toEqual(corpo)
      expect(guardado().linhas).toEqual([expect.objectContaining({ quantidade: 1, produto: expect.objectContaining({ id: 'p-racao' }) })])
      expect(lerGuardado(localStorage.getItem(chaveDoCarrinho(EMPRESA, USUARIO)), EMPRESA, USUARIO).tentativa?.trava).toBe('REDE')
      expect(localStorage.getItem(chaveDasVendasEmEspera(EMPRESA, USUARIO))).toContain('v-espera')
    })

    it('"Descartar tentativa" pede confirmação, libera a edição e a próxima tentativa usa outra chave', async () => {
      finalizarMock.mockRejectedValue(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '4')
      await waitFor(() => expect(within(janela).getByRole('button', { name: 'Finalizar venda' })).toBeEnabled())
      fireEvent.click(within(janela).getByRole('button', { name: 'Finalizar venda' }))
      await within(janela).findByText(MENSAGEM_PODE_TER_SIDO_GRAVADA)

      fireEvent.click(within(janela).getByRole('button', { name: 'Descartar tentativa' }))
      expect(
        await within(janela).findByText(
          'Confira em Vendas do caixa (F8) se a venda não foi registrada antes de mudar o pagamento.',
        ),
      ).toBeInTheDocument()
      expect(finalizarMock).toHaveBeenCalledTimes(1)
      fireEvent.click(within(janela).getByRole('button', { name: 'Descartar tentativa' }))

      await waitFor(() => expect(within(janela).queryByText(MENSAGEM_PODE_TER_SIDO_GRAVADA)).not.toBeInTheDocument())
      fireEvent.click(within(janela).getByRole('button', { name: 'Remover PIX' }))
      await pagar(janela, '1')
      await waitFor(() => expect(within(janela).getByRole('button', { name: 'Finalizar venda' })).toBeEnabled())
      fireEvent.click(within(janela).getByRole('button', { name: 'Finalizar venda' }))

      await waitFor(() => expect(finalizarMock).toHaveBeenCalledTimes(2))
      expect(finalizarMock.mock.calls[1][0].chave).not.toBe(finalizarMock.mock.calls[0][0].chave)
      expect(finalizarMock.mock.calls[1][0].pagamentos).toEqual([{ forma: 'DINHEIRO', valor: 24.9 }])
    })

    it('409 "já registrada com outros dados": a mensagem para conferir no F8, sem chave nova', async () => {
      finalizarMock.mockRejectedValue(new HttpError(409, 'Esta operação já foi registrada com outros dados.'))
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '1')
      await waitFor(() => expect(within(janela).getByRole('button', { name: 'Finalizar venda' })).toBeEnabled())
      fireEvent.click(within(janela).getByRole('button', { name: 'Finalizar venda' }))

      expect(
        await within(janela).findByText('Esta venda pode já ter sido registrada. Confira em Vendas do caixa (F8).'),
      ).toBeInTheDocument()
      const chave = finalizarMock.mock.calls[0][0].chave
      expect(lerGuardado(localStorage.getItem(chaveDoCarrinho(EMPRESA, USUARIO)), EMPRESA, USUARIO).tentativa).toMatchObject({
        chave,
        trava: 'OUTROS_DADOS',
      })
      expect(within(janela).queryByRole('button', { name: 'Tentar de novo' })).not.toBeInTheDocument()
      expect(within(janela).getByRole('button', { name: 'Descartar tentativa' })).toBeEnabled()
    })

    it('200 com a venda já cancelada (chave repetida): não diz "concluída", mantém o carrinho e troca a chave', async () => {
      finalizarMock
        .mockResolvedValueOnce(venda({ numero: 128, status: 'CANCELADA', podeCancelar: false }))
        .mockResolvedValueOnce(venda({ numero: 129, troco: 0 }))
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '1')
      await waitFor(() => expect(within(janela).getByRole('button', { name: /Finalizar venda/ })).toBeEnabled())
      fireEvent.click(within(janela).getByRole('button', { name: /Finalizar venda/ }))

      expect(await within(janela).findByRole('alert')).toHaveTextContent(
        'Esta venda já tinha sido registrada e depois cancelada. Confira em Vendas do caixa (F8).',
      )
      expect(screen.queryByRole('status', { name: 'Última venda' })).not.toBeInTheDocument()
      expect(guardado().linhas).toHaveLength(1)
      expect(lerGuardado(localStorage.getItem(chaveDoCarrinho(EMPRESA, USUARIO)), EMPRESA, USUARIO).tentativa).toBeNull()

      fireEvent.click(within(janela).getByRole('button', { name: /Finalizar venda/ }))
      await waitFor(() => expect(finalizarMock).toHaveBeenCalledTimes(2))
      expect(finalizarMock.mock.calls[1][0].chave).not.toBe(finalizarMock.mock.calls[0][0].chave)
    })

    it('Esc com o foco no valor desfaz só a forma escolhida; a janela continua', async () => {
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      fireEvent.keyDown(within(janela).getByRole('group', { name: 'Formas de pagamento' }), { key: '2' })
      const valor = await within(janela).findByLabelText('Valor em Débito')

      fireEvent.keyDown(valor, { key: 'Escape' })

      await waitFor(() => expect(within(janela).queryByLabelText('Valor em Débito')).not.toBeInTheDocument())
      expect(screen.getByRole('dialog', { name: 'Pagamento' })).toBeInTheDocument()
      expect(within(janela).getByRole('group', { name: 'Formas de pagamento' })).toHaveFocus()
    })

    it('"Voltar à venda" depois do total mudou recalcula a tela principal', async () => {
      finalizarMock.mockRejectedValueOnce(new HttpError(409, 'O total da venda mudou. Confira os valores.'))
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '1', '50,00')
      await waitFor(() => expect(within(janela).getByRole('button', { name: 'Finalizar venda' })).toBeEnabled())
      calcularMock.mockImplementation(async (carrinho: CarrinhoRequest) => ({
        ...calculoFalso(carrinho),
        total: 26.9,
        subtotal: 26.9,
      }))
      fireEvent.click(within(janela).getByRole('button', { name: 'Finalizar venda' }))
      const mudou = await screen.findByRole('dialog', { name: 'O total da venda mudou' })
      fireEvent.click(within(mudou).getByRole('button', { name: 'Voltar à venda' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(screen.getByRole('status', { name: 'Total' })).toHaveTextContent('R$ 26,90'))
    })

    it.each([
      [409, 'itens[0]', 'Produto inativo — não pode ser vendido.', 0],
      [404, 'itens[1]', 'A embalagem CX c/ 3 UN não existe mais.', 1],
    ])(
      'Review Focus 2: %d com %s marca a linha em vermelho e o carrinho continua inteiro',
      async (status, campoDoErro, mensagem, indice) => {
        finalizarMock.mockRejectedValue(new HttpError(status, 'Requisicao falhou.', { [campoDoErro]: mensagem }))
        renderPdv()
        await lancar('542', '900')
        const janela = await abrirPagamento()
        await pagar(janela, '1', '500,00')
        await waitFor(() => expect(within(janela).getByRole('button', { name: 'Finalizar venda' })).toBeEnabled())
        fireEvent.click(within(janela).getByRole('button', { name: 'Finalizar venda' }))

        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(linhas()).toHaveLength(2)
        expect(linhas()[indice]).toHaveAccessibleDescription(mensagem)
        expect(within(linhas()[indice]).getByText(mensagem)).toBeInTheDocument()
        expect(within(linhas()[1 - indice]).queryByText('com erro')).not.toBeInTheDocument()
        expect(guardado().linhas).toHaveLength(2)
        expect(screen.getByRole('button', { name: /Ir para pagamento/ })).toBeDisabled()
      },
    )

    it('Review Focus 5: o ADMIN fechou o caixa em outra aba; o carrinho fica e a tela mostra o estado sem caixa', async () => {
      finalizarMock.mockRejectedValue(new HttpError(409, 'Abra o caixa para vender.'))
      listarPontosMock.mockResolvedValue([pontoDeTeste()])
      renderPdv()
      await lancar('542*3')
      const janela = await abrirPagamento()
      await pagar(janela, '1')
      await waitFor(() => expect(within(janela).getByRole('button', { name: 'Finalizar venda' })).toBeEnabled())
      sessaoAtualMock.mockResolvedValue(null)
      fireEvent.click(within(janela).getByRole('button', { name: 'Finalizar venda' }))

      expect(await screen.findByRole('heading', { name: 'Abra o caixa para vender.' })).toBeInTheDocument()
      expect(screen.getByRole('alert')).toHaveTextContent('Abra o caixa para vender.')
      expect(await screen.findByRole('button', { name: 'Abrir o Caixa 1' })).toBeInTheDocument()
      expect(guardado().linhas).toEqual([expect.objectContaining({ quantidade: 3 })])
    })

    it('outro 409 com o caixa ainda aberto: a mensagem fica na janela', async () => {
      finalizarMock.mockRejectedValue(new HttpError(409, 'Venda recusada pelo servidor.'))
      renderPdv()
      await lancar('542')
      const janela = await abrirPagamento()
      await pagar(janela, '1')
      await waitFor(() => expect(within(janela).getByRole('button', { name: 'Finalizar venda' })).toBeEnabled())
      fireEvent.click(within(janela).getByRole('button', { name: 'Finalizar venda' }))

      expect(await within(janela).findByRole('alert')).toHaveTextContent('Venda recusada pelo servidor.')
      expect(sessaoAtualMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('vendas em espera', () => {
    it('F6 põe em espera e esvazia; F7 lista com hora, itens e total; Retomar devolve o carrinho', async () => {
      renderPdv()
      await lancar('542*3')

      await tecla('F6')

      expect(await screen.findByText('Venda em espera (1 de 5). Retome com F7.')).toBeInTheDocument()
      expect(linhas()).toHaveLength(0)
      await tecla('F7')
      const janela = await screen.findByRole('dialog', { name: 'Vendas em espera' })
      const [item] = within(janela).getAllByRole('listitem')
      // UX 4: o primeiro item (ou o cliente) identifica a venda.
      expect(item).toHaveTextContent('Ração X 1kg')
      expect(item).toHaveTextContent('R$ 74,70')
      expect(item).toHaveTextContent(/\d{2}:\d{2}/)
      fireEvent.click(within(item).getByRole('button', { name: 'Retomar' }))

      await waitFor(() => expect(linhas()).toHaveLength(1))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(localStorage.getItem(chaveDasVendasEmEspera(EMPRESA, USUARIO))).toBeNull()
    })

    it('limite de 5 vendas em espera', async () => {
      const cinco: VendaEmEspera[] = Array.from({ length: 5 }, (_, indice) => ({
        id: `v-${indice}`,
        criadaEm: '2026-10-24T18:00:00-03:00',
        itens: 1,
        total: 24.9,
        carrinho: {
          linhas: [{ id: `l-${indice}`, produto: RACAO, embalagemId: null, quantidade: 1, codigoLido: '542', etiqueta: false, desconto: null }],
          desconto: null,
          cliente: null,
        },
      }))
      localStorage.setItem(chaveDasVendasEmEspera(EMPRESA, USUARIO), guardarVendasEmEspera(cinco, EMPRESA, USUARIO))
      renderPdv()
      await lancar('542')

      await tecla('F6')

      expect(await screen.findByText('Limite de 5 vendas em espera. Retome ou descarte uma (F7).')).toBeInTheDocument()
      expect(linhas()).toHaveLength(1)
    })

    it('retomar com um carrinho aberto pergunta; descartar confirma', async () => {
      renderPdv()
      await lancar('542*3')
      await tecla('F6')
      await screen.findByText('Venda em espera (1 de 5). Retome com F7.')
      await lancar('900')

      await tecla('F7')
      let janela = await screen.findByRole('dialog', { name: 'Vendas em espera' })
      fireEvent.click(within(janela).getByRole('button', { name: 'Retomar' }))
      expect(await within(janela).findByText('Pôr a venda atual em espera?')).toBeInTheDocument()
      fireEvent.click(within(janela).getByRole('button', { name: 'Pôr em espera e retomar' }))

      await waitFor(() => expect(linhas()).toHaveLength(1))
      expect(linhas()[0]).toHaveTextContent('Ração X 1kg')

      await tecla('F7')
      janela = await screen.findByRole('dialog', { name: 'Vendas em espera' })
      expect(within(janela).getAllByRole('listitem')).toHaveLength(1)
      expect(within(janela).getByRole('listitem')).toHaveTextContent('Nexgard M')
      fireEvent.click(within(janela).getByRole('button', { name: 'Descartar' }))
      expect(await within(janela).findByText('Descartar esta venda em espera?')).toBeInTheDocument()
      // UX 3: o foco fica em "Voltar" e o botão é destrutivo.
      expect(within(janela).getByRole('button', { name: 'Voltar' })).toHaveFocus()
      expect(within(janela).getByRole('button', { name: 'Descartar venda' })).toHaveAttribute('data-variant', 'destructive')
      fireEvent.click(within(janela).getByRole('button', { name: 'Descartar venda' }))

      expect(await within(janela).findByText('Venda em espera descartada.')).toBeInTheDocument()
      expect(within(janela).getByText('Nenhuma venda em espera.')).toBeInTheDocument()
      // A venda da tela não muda.
      expect(guardado().linhas).toHaveLength(1)
    })
  })

  describe('vendas do caixa (F8)', () => {
    it.each([
      [
        'dinheiro com troco e PIX',
        [
          { forma: 'DINHEIRO' as const, valor: 400 },
          { forma: 'PIX' as const, valor: 46.3 },
        ],
        100,
        'Venda nº 3 cancelada. Devolva ao cliente R$ 300,00 em dinheiro e R$ 46,30 no PIX.',
      ],
      [
        'três formas',
        [
          { forma: 'PIX' as const, valor: 10 },
          { forma: 'DINHEIRO' as const, valor: 20 },
          { forma: 'DEBITO' as const, valor: 30 },
        ],
        0,
        'Venda nº 3 cancelada. Devolva ao cliente R$ 20,00 em dinheiro, R$ 30,00 no débito e R$ 10,00 no PIX.',
      ],
      [
        'crédito e o dinheiro todo virou troco',
        [
          { forma: 'DINHEIRO' as const, valor: 5 },
          { forma: 'CREDITO' as const, valor: 40 },
        ],
        5,
        'Venda nº 3 cancelada. Devolva ao cliente R$ 40,00 no crédito.',
      ],
    ])('a mensagem do cancelamento lista a devolução por forma (%s)', async (_caso, pagamentos, troco, mensagem) => {
      const vendida = venda({ id: 'v-3', numero: 3, pagamentos, troco })
      listarVendasMock.mockResolvedValue({ itens: [vendida], pagina: 0, tamanho: 50, totalItens: 1 })
      buscarVendaMock.mockResolvedValue(vendida)
      cancelarVendaMock.mockResolvedValue({ ...vendida, status: 'CANCELADA', podeCancelar: false })
      renderPdv()
      await campo()
      await tecla('F8')
      const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })
      fireEvent.click(await within(janela).findByRole('button', { name: /Nº 3/ }))
      fireEvent.click(await within(janela).findByRole('button', { name: 'Cancelar venda' }))
      fireEvent.change(within(janela).getByLabelText(/Motivo do cancelamento/), { target: { value: 'Cliente desistiu' } })
      fireEvent.click(within(janela).getByRole('button', { name: 'Confirmar cancelamento' }))

      expect(await within(janela).findByText(mensagem)).toBeInTheDocument()
    })

    it('o detalhe da venda mostra a quantidade fracionada com 3 casas', async () => {
      listarVendasMock.mockResolvedValue({ itens: [vendaResumo()], pagina: 0, tamanho: 50, totalItens: 1 })
      buscarVendaMock.mockResolvedValue(
        venda({
          itens: [
            {
              ordem: 1,
              nome: 'Queijo minas',
              embalagemRotulo: null,
              quantidade: 0.5,
              unidade: 'KG',
              precoUnitario: 25,
              origemPreco: 'ETIQUETA',
              valorBruto: 12.5,
              descontoItem: 0,
              descontoRateado: 0,
              valorLiquido: 12.5,
            },
          ],
        }),
      )
      renderPdv()
      await campo()
      await tecla('F8')
      const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })
      fireEvent.click(await within(janela).findByRole('button', { name: /Nº 128/ }))

      expect(await within(janela).findByText(/^0,500 KG × R\$\s25,00$/)).toBeInTheDocument()
    })

    it('lista a sessão atual; o detalhe mostra itens e pagamentos; cancela com o motivo', async () => {
      listarVendasMock.mockResolvedValue({
        itens: [
          vendaResumo(),
          vendaResumo({ id: 'v-127', numero: 127, status: 'CANCELADA', podeCancelar: false, total: 10 }),
          vendaResumo({ id: 'v-126', numero: 126, situacaoDevolucao: 'PARCIAL' }),
        ],
        pagina: 0,
        tamanho: 50,
        totalItens: 3,
      })
      buscarVendaMock.mockResolvedValue(
        venda({
          itens: [
            {
              ordem: 1,
              nome: 'Ração X 1kg',
              embalagemRotulo: null,
              quantidade: 3,
              unidade: 'UN',
              precoUnitario: 24.9,
              origemPreco: 'NORMAL',
              valorBruto: 74.7,
              descontoItem: 0,
              descontoRateado: 0,
              valorLiquido: 74.7,
            },
          ],
        }),
      )
      cancelarVendaMock.mockResolvedValue(venda({ status: 'CANCELADA', podeCancelar: false }))
      renderPdv()
      await campo()

      await tecla('F8')
      const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })
      await waitFor(() => expect(listarVendasMock).toHaveBeenCalledWith(expect.objectContaining({ sessaoId: 's-ana' }), expect.anything()))
      const lista = await within(janela).findByRole('list', { name: 'Vendas' })
      const [primeira, segunda] = within(lista).getAllByRole('listitem')
      expect(primeira).toHaveTextContent('Nº 128')
      expect(primeira).toHaveTextContent('18:02')
      expect(primeira).toHaveTextContent('Dinheiro')
      expect(primeira).toHaveTextContent('R$ 74,70')
      expect(segunda).toHaveTextContent('Cancelada')
      // DT-042: a lista mostra a devolucao.
      expect(within(lista).getAllByRole('listitem')[2]).toHaveTextContent('Devolução parcial')

      fireEvent.click(within(primeira).getByRole('button', { name: /Nº 128/ }))
      expect(await within(janela).findByText('Ração X 1kg')).toBeInTheDocument()
      fireEvent.click(within(janela).getByRole('button', { name: 'Cancelar venda' }))
      const motivo = within(janela).getByLabelText(/Motivo do cancelamento/)
      expect(motivo).toHaveAttribute('maxLength', '200')
      fireEvent.change(motivo, { target: { value: '  Cliente desistiu ' } })
      fireEvent.click(within(janela).getByRole('button', { name: 'Confirmar cancelamento' }))

      await waitFor(() => expect(cancelarVendaMock).toHaveBeenCalledWith('v-128', 'Cliente desistiu'))
      // UX 15: com dinheiro, quanto devolver.
      expect(
        await within(janela).findByText('Venda nº 128 cancelada. Devolva ao cliente R$ 74,70 em dinheiro.'),
      ).toBeInTheDocument()
    })

    it('motivo vazio não vai ao servidor; o 409 do caixa fechado mostra a mensagem', async () => {
      listarVendasMock.mockResolvedValue({ itens: [vendaResumo()], pagina: 0, tamanho: 50, totalItens: 1 })
      buscarVendaMock.mockResolvedValue(venda())
      cancelarVendaMock.mockRejectedValue(
        new HttpError(409, 'Esta venda é de um caixa que já foi fechado ou está em conferência. Use devolução.'),
      )
      renderPdv()
      await campo()
      await tecla('F8')
      const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })
      fireEvent.click(await within(janela).findByRole('button', { name: /Nº 128/ }))
      fireEvent.click(await within(janela).findByRole('button', { name: 'Cancelar venda' }))

      fireEvent.click(within(janela).getByRole('button', { name: 'Confirmar cancelamento' }))
      expect(await within(janela).findByText('Informe o motivo do cancelamento.')).toBeInTheDocument()
      expect(cancelarVendaMock).not.toHaveBeenCalled()

      fireEvent.change(within(janela).getByLabelText(/Motivo do cancelamento/), { target: { value: 'Erro de digitação' } })
      fireEvent.click(within(janela).getByRole('button', { name: 'Confirmar cancelamento' }))

      expect(await within(janela).findByRole('alert')).toHaveTextContent(
        'Esta venda é de um caixa que já foi fechado ou está em conferência. Use devolução.',
      )
    })

    it('"Carregar mais" traz a próxima página; a busca pelo número filtra a lista', async () => {
      const pagina1 = Array.from({ length: 50 }, (_, indice) =>
        vendaResumo({ id: `v-${200 - indice}`, numero: 200 - indice }),
      )
      listarVendasMock.mockImplementation(async (filtros) => {
        if (filtros.numero === '128') {
          return { itens: [vendaResumo()], pagina: 0, tamanho: 50, totalItens: 1 }
        }
        return filtros.pagina === 1
          ? { itens: pagina1, pagina: 0, tamanho: 50, totalItens: 51 }
          : { itens: [vendaResumo({ id: 'v-150', numero: 150 })], pagina: 1, tamanho: 50, totalItens: 51 }
      })
      renderPdv()
      await campo()
      await tecla('F8')
      const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })
      const lista = await within(janela).findByRole('list', { name: 'Vendas' })
      expect(within(lista).getAllByRole('listitem')).toHaveLength(50)

      fireEvent.click(within(janela).getByRole('button', { name: 'Carregar mais' }))

      await waitFor(() => expect(within(lista).getAllByRole('listitem')).toHaveLength(51))
      expect(listarVendasMock).toHaveBeenCalledWith(expect.objectContaining({ pagina: 2 }), expect.anything())
      expect(within(janela).queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument()

      fireEvent.change(within(janela).getByLabelText('Nº da venda'), { target: { value: '128' } })

      await waitFor(() =>
        expect(listarVendasMock).toHaveBeenCalledWith(
          expect.objectContaining({ numero: '128', sessaoId: 's-ana', pagina: 1 }),
          expect.anything(),
        ),
      )
      await waitFor(() =>
        expect(within(within(janela).getByRole('list', { name: 'Vendas' })).getAllByRole('listitem')).toHaveLength(1),
      )
    })

    describe('devolução de itens', () => {
      const ITEM_128 = {
        ordem: 1,
        nome: 'Ração X 1kg',
        embalagemRotulo: null,
        quantidade: 3,
        unidade: 'UN',
        precoUnitario: 24.9,
        origemPreco: 'NORMAL' as const,
        valorBruto: 74.7,
        descontoItem: 0,
        descontoRateado: 0,
        valorLiquido: 74.7,
      }
      const PARA_DEVOLUCAO: VendaParaDevolucao = {
        id: 'v-128',
        numero: 128,
        concluidaEm: '2026-10-24T21:02:00Z',
        vendedorNome: 'Ana Souza',
        clienteNome: null,
        total: 74.7,
        troco: 0,
        linhas: [
          {
            ordem: 1,
            nome: 'Ração X 1kg',
            unidade: 'UN',
            embalagemRotulo: null,
            etiqueta: false,
            fracionada: false,
            precoUnitario: 24.9,
            quantidade: 3,
            devolvida: 0,
            disponivel: 3,
            valorLiquido: 74.7,
            valorDisponivel: 74.7,
          },
        ],
        formas: [{ forma: 'DINHEIRO', recebido: 74.7, reembolsado: 0, disponivel: 74.7 }],
        devolucoes: [],
      }
      const DEVOLUCAO: Devolucao = {
        id: 'd-1',
        vendaId: 'v-128',
        vendaNumero: 128,
        valor: 24.9,
        motivo: 'Embalagem rasgada',
        criadaEm: '2026-10-25T13:00:00Z',
        usuarioNome: 'Ana Souza',
        itens: [{ ordem: 1, nome: 'Ração X 1kg', quantidade: 1, unidade: 'UN', valor: 24.9, destino: 'AVARIADO' }],
        reembolsos: [{ forma: 'DINHEIRO', valor: 24.9 }],
      }

      async function abrirDetalhe() {
        renderPdv()
        await campo()
        await tecla('F8')
        const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })
        fireEvent.click(await within(janela).findByRole('button', { name: /Nº 128/ }))
        await within(janela).findByText('Ração X 1kg')
        return janela
      }

      it('o ADMIN devolve pelo detalhe; volta ao detalhe com o aviso do reembolso', async () => {
        definirUsuario('ADMIN')
        listarVendasMock.mockResolvedValue({ itens: [vendaResumo()], pagina: 0, tamanho: 50, totalItens: 1 })
        buscarVendaMock.mockResolvedValue(venda({ itens: [ITEM_128], situacaoDevolucao: 'NENHUMA', devolucoes: [] }))
        buscarParaDevolucaoMock.mockResolvedValue(PARA_DEVOLUCAO)
        devolverItensMock.mockResolvedValue(DEVOLUCAO)
        const janela = await abrirDetalhe()

        fireEvent.click(within(janela).getByRole('button', { name: 'Devolver itens' }))
        fireEvent.change(await within(janela).findByLabelText('Devolver (UN)'), { target: { value: '1' } })
        fireEvent.change(within(janela).getByLabelText('Destino'), { target: { value: 'AVARIADO' } })
        fireEvent.change(within(janela).getByLabelText(/Motivo da devolução/), { target: { value: 'Embalagem rasgada' } })
        fireEvent.click(
          within(janela).getByRole('button', { name: /^Devolver R\$\s24,90 em dinheiro e registrar 1 UN como avariado$/ }),
        )

        await waitFor(() =>
          expect(devolverItensMock).toHaveBeenCalledWith(
            'v-128',
            expect.objectContaining({
              itens: [{ ordem: 1, quantidade: 1, destino: 'AVARIADO' }],
              reembolsos: [{ forma: 'DINHEIRO', valor: 24.9 }],
            }),
          ),
        )
        expect(
          await within(janela).findByText('Devolução da venda nº 128 registrada. Devolva ao cliente R$ 24,90 em dinheiro.'),
        ).toBeInTheDocument()
        expect(within(janela).getByRole('button', { name: 'Devolver itens' })).toBeInTheDocument()
      })

      it('o OPERADOR não vê "Devolver itens"', async () => {
        listarVendasMock.mockResolvedValue({ itens: [vendaResumo()], pagina: 0, tamanho: 50, totalItens: 1 })
        buscarVendaMock.mockResolvedValue(venda({ itens: [ITEM_128], situacaoDevolucao: 'NENHUMA', devolucoes: [] }))
        const janela = await abrirDetalhe()

        expect(within(janela).getByRole('button', { name: 'Cancelar venda' })).toBeInTheDocument()
        expect(within(janela).queryByRole('button', { name: 'Devolver itens' })).not.toBeInTheDocument()
      })

      it('venda devolvida por inteiro: o resumo mostra a devolução e o botão some', async () => {
        definirUsuario('ADMIN')
        listarVendasMock.mockResolvedValue({ itens: [vendaResumo()], pagina: 0, tamanho: 50, totalItens: 1 })
        buscarVendaMock.mockResolvedValue(
          venda({
            itens: [ITEM_128],
            podeCancelar: false,
            situacaoDevolucao: 'TOTAL',
            devolucoes: [
              {
                ...DEVOLUCAO,
                valor: 74.7,
                itens: [{ ...DEVOLUCAO.itens[0], quantidade: 3, valor: 74.7 }],
                reembolsos: [{ forma: 'DINHEIRO', valor: 74.7 }],
              },
            ],
          }),
        )
        const janela = await abrirDetalhe()

        const devolucoes = within(janela).getByRole('region', { name: 'Devoluções' })
        expect(devolucoes).toHaveTextContent('Venda devolvida por inteiro')
        expect(devolucoes).toHaveTextContent('3 UN Ração X 1kg (avariado)')
        expect(devolucoes).toHaveTextContent('Embalagem rasgada')
        expect(devolucoes.textContent?.replace(/ /g, ' ')).toContain('Devolvido R$ 74,70 em dinheiro')
        expect(within(janela).queryByRole('button', { name: 'Devolver itens' })).not.toBeInTheDocument()
      })

      it('o ADMIN abre pelo número a venda de outro caixa; número sem venda avisa', async () => {
        definirUsuario('ADMIN')
        listarVendasMock.mockResolvedValue({ itens: [], pagina: 0, tamanho: 50, totalItens: 0 })
        buscarParaDevolucaoMock
          .mockRejectedValueOnce(new HttpError(404, 'Venda nao encontrada.'))
          .mockResolvedValue({ ...PARA_DEVOLUCAO, id: 'v-77', numero: 77 })
        buscarVendaMock.mockResolvedValue(venda({ id: 'v-77', numero: 77, itens: [ITEM_128] }))
        renderPdv()
        await campo()
        await tecla('F8')
        const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })

        fireEvent.change(within(janela).getByLabelText('Nº da venda'), { target: { value: '77' } })
        fireEvent.click(await within(janela).findByRole('button', { name: 'Abrir a venda nº 77 de qualquer caixa' }))
        expect(await within(janela).findByText('Nenhuma venda nº 77 na empresa.')).toBeInTheDocument()

        fireEvent.click(within(janela).getByRole('button', { name: 'Abrir a venda nº 77 de qualquer caixa' }))
        await waitFor(() => expect(buscarVendaMock).toHaveBeenCalledWith('v-77'))
        expect(await within(janela).findByText('Ração X 1kg')).toBeInTheDocument()
      })

      it('o OPERADOR não tem a busca em outro caixa', async () => {
        listarVendasMock.mockResolvedValue({ itens: [], pagina: 0, tamanho: 50, totalItens: 0 })
        renderPdv()
        await campo()
        await tecla('F8')
        const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })

        fireEvent.change(within(janela).getByLabelText('Nº da venda'), { target: { value: '77' } })
        await waitFor(() =>
          expect(listarVendasMock).toHaveBeenCalledWith(expect.objectContaining({ numero: '77' }), expect.anything()),
        )
        expect(within(janela).queryByRole('button', { name: /de qualquer caixa/ })).not.toBeInTheDocument()
      })
    })

    it('sem vendas: o estado vazio; falha: "Tentar de novo"', async () => {
      listarVendasMock
        .mockRejectedValueOnce(new HttpError(500, 'Requisicao falhou (HTTP 500).'))
        .mockResolvedValue({ itens: [], pagina: 0, tamanho: 50, totalItens: 0 })
      renderPdv()
      await campo()
      await tecla('F8')
      const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })

      expect(await within(janela).findByText('Não foi possível carregar as vendas.')).toBeInTheDocument()
      fireEvent.click(within(janela).getByRole('button', { name: 'Tentar de novo' }))
      expect(await within(janela).findByText('Nenhuma venda neste caixa ainda.')).toBeInTheDocument()
    })
  })

  it('UX 15: cancelamento sem dinheiro avisa o estorno', async () => {
    listarVendasMock.mockResolvedValue({ itens: [vendaResumo({ pagamentos: [{ forma: 'PIX', valor: 74.7 }] })], pagina: 0, tamanho: 50, totalItens: 1 })
    buscarVendaMock.mockResolvedValue(venda({ pagamentos: [{ forma: 'PIX', valor: 74.7 }] }))
    cancelarVendaMock.mockResolvedValue(venda({ status: 'CANCELADA', podeCancelar: false, pagamentos: [{ forma: 'PIX', valor: 74.7 }] }))
    renderPdv()
    await campo()
    await tecla('F8')
    const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })
    fireEvent.click(await within(janela).findByRole('button', { name: /Nº 128/ }))
    fireEvent.click(await within(janela).findByRole('button', { name: 'Cancelar venda' }))
    fireEvent.change(within(janela).getByLabelText(/Motivo do cancelamento/), { target: { value: 'Erro' } })
    fireEvent.click(within(janela).getByRole('button', { name: 'Confirmar cancelamento' }))

    expect(await within(janela).findByText('Venda nº 128 cancelada. Devolva ao cliente R$ 74,70 no PIX.')).toBeInTheDocument()
  })

  it('UX 8: total mudou sem cobertura: "Ajustar pagamento" fecha só a janela interna e mantém as formas', async () => {
    finalizarMock.mockRejectedValueOnce(new HttpError(409, 'O total da venda mudou. Confira os valores.'))
    renderPdv()
    await lancar('542')
    const janela = await abrirPagamento()
    await pagar(janela, '4')
    await waitFor(() => expect(within(janela).getByRole('button', { name: /Finalizar venda/ })).toBeEnabled())
    calcularMock.mockImplementation(async (carrinho: CarrinhoRequest) => {
      const calculo = calculoFalso(carrinho)
      const pago = carrinho.pagamentos.reduce((soma, pagamento) => soma + pagamento.valor, 0)
      return { ...calculo, total: 26.9, subtotal: 26.9, faltaPagar: Math.max(0, Math.round((26.9 - pago) * 100) / 100) }
    })
    fireEvent.click(within(janela).getByRole('button', { name: /Finalizar venda/ }))
    const mudou = await screen.findByRole('dialog', { name: 'O total da venda mudou' })
    expect(within(mudou).getByRole('button', { name: 'Confirmar e finalizar' })).toBeDisabled()

    fireEvent.click(await within(mudou).findByRole('button', { name: 'Ajustar pagamento' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'O total da venda mudou' })).not.toBeInTheDocument())
    const pagamento = screen.getByRole('dialog', { name: 'Pagamento' })
    expect(within(pagamento).getByRole('list', { name: 'Formas usadas' })).toHaveTextContent('PIX')
  })
  describe('comprovante não fiscal (F9)', () => {
    const EMPRESA_DO_CUPOM = {
      nome: 'Mercado Central',
      razaoSocial: 'Mercado Central Ltda',
      cnpj: '11222333000181',
      inscricaoEstadual: '123456',
      telefone: '11987654321',
      endereco: {
        cep: '01001000',
        logradouro: 'Rua A',
        numero: '10',
        complemento: null,
        bairro: 'Centro',
        municipio: 'São Paulo',
        uf: 'SP',
      },
    } as Empresa

    function vendaComItens(parcial: Partial<Venda> = {}): Venda {
      return venda({
        numero: 128,
        subtotal: 74.7,
        total: 74.7,
        troco: 5.3,
        pagamentos: [
          { forma: 'PIX', valor: 20 },
          { forma: 'DINHEIRO', valor: 60 },
        ],
        itens: [
          {
            ordem: 1,
            nome: 'Ração X 1kg',
            embalagemRotulo: null,
            quantidade: 3,
            unidade: 'UN',
            precoUnitario: 24.9,
            origemPreco: 'NORMAL',
            valorBruto: 74.7,
            descontoItem: 0,
            descontoRateado: 0,
            valorLiquido: 74.7,
          },
        ],
        ...parcial,
      })
    }

    function cupom() {
      const area = document.getElementById('area-de-impressao')
      if (!area) {
        throw new Error('Sem a área de impressão.')
      }
      return area
    }

    beforeEach(() => {
      vi.mocked(obterEmpresa).mockResolvedValue(EMPRESA_DO_CUPOM)
      window.print = vi.fn()
    })

    it('depois de vender, "Imprimir comprovante" imprime o cupom não fiscal com a empresa, os itens e o troco', async () => {
      finalizarMock.mockResolvedValue(vendaComItens())
      let impresso = ''
      vi.mocked(window.print).mockImplementation(() => {
        impresso = cupom().textContent ?? ''
        window.dispatchEvent(new Event('afterprint'))
      })
      renderPdv()
      await lancar('542*3')
      const janela = await abrirPagamento()
      await pagar(janela, '1', '80,00')
      await waitFor(() => expect(within(janela).getByRole('button', { name: /Finalizar venda/ })).toBeEnabled())
      fireEvent.click(within(janela).getByRole('button', { name: /Finalizar venda/ }))
      const ultima = await screen.findByRole('status', { name: 'Última venda' })

      fireEvent.click(within(ultima).getByRole('button', { name: /Imprimir comprovante/ }))

      await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1))
      expect(impresso).toContain('Mercado Central Ltda')
      expect(impresso).toContain('CNPJ 11.222.333/0001-81')
      expect(impresso).toContain('DOCUMENTO NÃO FISCAL')
      expect(impresso).toContain('Ração X 1kg')
      expect(impresso).toContain('3 UN x 24,90')
      expect(impresso).toContain('Troco R$5,30')
      expect(impresso).toContain('CONSUMIDOR NÃO IDENTIFICADO')
      expect(impresso).toContain('não substitui a nota fiscal')
      // Impresso, o cupom sai da página e o foco volta ao campo.
      await waitFor(() => expect(document.getElementById('area-de-impressao')).toBeNull())
      await waitFor(async () => expect(await campo()).toHaveFocus())

      await tecla('F9')
      await waitFor(() => expect(window.print).toHaveBeenCalledTimes(2))
    })

    it('cancelada no F8 depois de vender, o painel e o F9 passam a mostrar e imprimir a cancelada', async () => {
      const concluida = vendaComItens({ id: 'v-128' })
      const cancelada = vendaComItens({ id: 'v-128', status: 'CANCELADA', podeCancelar: false })
      finalizarMock.mockResolvedValue(concluida)
      listarVendasMock.mockResolvedValue({ itens: [concluida], pagina: 0, tamanho: 50, totalItens: 1 })
      buscarVendaMock.mockResolvedValue({ ...concluida, podeCancelar: true })
      cancelarVendaMock.mockResolvedValue(cancelada)
      let impresso = ''
      vi.mocked(window.print).mockImplementation(() => {
        impresso = cupom().textContent ?? ''
        window.dispatchEvent(new Event('afterprint'))
      })
      renderPdv()
      await lancar('542*3')
      const pagamento = await abrirPagamento()
      await pagar(pagamento, '1', '80,00')
      await waitFor(() => expect(within(pagamento).getByRole('button', { name: /Finalizar venda/ })).toBeEnabled())
      fireEvent.click(within(pagamento).getByRole('button', { name: /Finalizar venda/ }))
      await screen.findByRole('status', { name: 'Última venda' })

      await tecla('F8')
      const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })
      fireEvent.click(await within(janela).findByRole('button', { name: /Nº 128/ }))
      fireEvent.click(await within(janela).findByRole('button', { name: 'Cancelar venda' }))
      fireEvent.change(within(janela).getByLabelText(/Motivo do cancelamento/), { target: { value: 'Desistiu' } })
      fireEvent.click(within(janela).getByRole('button', { name: 'Confirmar cancelamento' }))
      await within(janela).findByText(/Venda nº 128 cancelada/)
      fireEvent.keyDown(janela, { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

      expect(screen.getByRole('status', { name: 'Última venda' })).toHaveTextContent('Venda nº 128 cancelada')
      await tecla('F9')
      await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1))
      expect(impresso).toContain('*** VENDA CANCELADA ***')
    })

    it('F9 sem venda concluída avisa e não imprime', async () => {
      renderPdv()
      await campo()

      await tecla('F9')

      expect(
        await screen.findByText('Finalize a venda para imprimir o comprovante. Para reimprimir, use Vendas do caixa (F8).'),
      ).toBeInTheDocument()
      expect(window.print).not.toHaveBeenCalled()
    })

    it('Vendas do caixa (F8) reimprime o comprovante, com a marca de cancelada', async () => {
      const cancelada = vendaComItens({ id: 'v-9', numero: 9, status: 'CANCELADA', podeCancelar: false })
      listarVendasMock.mockResolvedValue({ itens: [cancelada], pagina: 0, tamanho: 50, totalItens: 1 })
      buscarVendaMock.mockResolvedValue(cancelada)
      let impresso = ''
      vi.mocked(window.print).mockImplementation(() => {
        impresso = cupom().textContent ?? ''
        window.dispatchEvent(new Event('afterprint'))
      })
      renderPdv()
      await campo()

      await tecla('F8')
      const janela = await screen.findByRole('dialog', { name: 'Vendas do caixa' })
      fireEvent.click(await within(janela).findByRole('button', { name: /Nº 9/ }))
      fireEvent.click(await within(janela).findByRole('button', { name: 'Imprimir comprovante' }))

      await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1))
      expect(impresso).toContain('Venda nº 9')
      expect(impresso).toContain('*** VENDA CANCELADA ***')
    })
  })
})
