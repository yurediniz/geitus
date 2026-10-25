import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { tocarBipeDeErro } from '@/features/pdv/bipeDeErro'
import { chaveDoCarrinho, guardarCarrinho } from '@/features/pdv/carrinho'
import { LIMITES_DA_LEITURA } from '@/features/pdv/filaDeLeituras'
import { PdvPage } from '@/features/pdv/PdvPage'
import { useAuth } from '@/hooks/useAuth'
import { listarPontos, sessaoAtual } from '@/services/caixaService'
import { listarClientes } from '@/services/clienteService'
import { buscar as buscarConfiguracao } from '@/services/configuracaoPdvService'
import { HttpError } from '@/services/httpClient'
import { buscarProdutos, calcular, resolverCodigo } from '@/services/pdvService'
import { pontoDeTeste, sessaoDeTeste } from '@/test/fixturesCaixa'
import { calculoFalso, itemResolvido, NEXGARD, produtoDoPdv, QUEIJO, RACAO } from '@/test/fixturesPdv'
import type { Cliente } from '@/types/cliente'
import type { CalculoDaVenda, CarrinhoRequest } from '@/types/pdv'

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
}))

const useAuthMock = vi.mocked(useAuth)
const sessaoAtualMock = vi.mocked(sessaoAtual)
const listarPontosMock = vi.mocked(listarPontos)
const buscarConfiguracaoMock = vi.mocked(buscarConfiguracao)
const listarClientesMock = vi.mocked(listarClientes)
const resolverMock = vi.mocked(resolverCodigo)
const buscarProdutosMock = vi.mocked(buscarProdutos)
const calcularMock = vi.mocked(calcular)
const bipeMock = vi.mocked(tocarBipeDeErro)

const EMPRESA = 3
const TEMPO_PADRAO = LIMITES_DA_LEITURA.tempoMaximoMs
const TEMPO_DO_ERRO_PADRAO = LIMITES_DA_LEITURA.tempoDoErroMs
const USUARIO = 7

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

function arvore(queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PdvPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

function renderPdv() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(arvore(queryClient))
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

function total() {
  return screen.getByRole('status', { name: 'Total' })
}

function ultimoCarrinho(): CarrinhoRequest {
  const chamadas = calcularMock.mock.calls
  return chamadas[chamadas.length - 1][0]
}

async function tecla(key: string, extra: { shiftKey?: boolean } = {}) {
  fireEvent.keyDown(await campo(), { key, ...extra })
}

function porCodigo(itens: Record<string, ReturnType<typeof itemResolvido>>) {
  resolverMock.mockImplementation(async (codigo) => {
    const item = itens[codigo]
    if (!item) {
      throw new HttpError(404, 'Código não encontrado.')
    }
    return item
  })
}

describe('PdvPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    definirUsuario()
    sessaoAtualMock.mockResolvedValue(sessaoDeTeste())
    buscarConfiguracaoMock.mockResolvedValue({
      venderSemEstoque: true,
      descontoMaximoOperador: 10,
      atualizadoPorNome: null,
      atualizadoEm: null,
    })
    calcularMock.mockImplementation(async (carrinho) => calculoFalso(carrinho))
    porCodigo({
      '542': itemResolvido(),
      '542*3': itemResolvido({ quantidade: 3, codigoLido: '542*3' }),
      '900': itemResolvido({ produto: NEXGARD, codigoLido: '900' }),
      '2000077010000': itemResolvido({ tipo: 'ETIQUETA', produto: QUEIJO, quantidade: 0.4, codigoLido: '2000077010000' }),
    })
  })

  describe('lançar itens', () => {
    it('foco no campo; vazio, a lista orienta e o total é zero, com o ponto e o operador', async () => {
      renderPdv()

      expect(await campo()).toHaveFocus()
      expect(screen.getByText('Nenhum item. Bipe o código ou digite o nome do produto.')).toBeInTheDocument()
      expect(total()).toHaveTextContent('R$ 0,00')
      expect(screen.getByText('Caixa 1 · Ana Souza')).toBeInTheDocument()
    })

    it('542*3 resolve e o mesmo produto de novo soma na mesma linha; o total é o do servidor', async () => {
      renderPdv()

      await ler('542*3')
      await waitFor(() => expect(linhas()).toHaveLength(1))
      expect(await campo()).toHaveValue('')
      await ler('542')

      await waitFor(() => expect(ultimoCarrinho().itens).toEqual([expect.objectContaining({ produtoId: 'p-racao', quantidade: 4 })]))
      expect(linhas()).toHaveLength(1)
      await waitFor(() => expect(total()).toHaveTextContent('R$ 99,60'))
      expect(resolverMock).toHaveBeenNthCalledWith(1, '542*3', expect.any(AbortSignal))
    })

    it('cada etiqueta da balança vira uma linha nova', async () => {
      renderPdv()

      await ler('2000077010000')
      await waitFor(() => expect(linhas()).toHaveLength(1))
      await ler('2000077010000')

      await waitFor(() => expect(linhas()).toHaveLength(2))
      await waitFor(() =>
        expect(ultimoCarrinho().itens.map((item) => [item.etiqueta, item.codigoLido])).toEqual([
          [true, '2000077010000'],
          [true, '2000077010000'],
        ]),
      )
      expect(within(linhas()[0]).getByText('Balança')).toBeInTheDocument()
    })

    it('código não encontrado: o erro no campo, o bipe e o carrinho sem mudança', async () => {
      renderPdv()

      await ler('123')

      const entrada = await campo()
      await waitFor(() => expect(entrada).toHaveAttribute('aria-invalid', 'true'))
      expect(entrada).toHaveAccessibleDescription('Código 123 não encontrado.')
      expect(bipeMock).toHaveBeenCalledTimes(1)
      expect(linhas()).toHaveLength(0)
      expect(calcularMock).not.toHaveBeenCalled()

      // O erro fica mesmo com outra leitura certa (UX 1); Esc limpa.
      await ler('542')
      await waitFor(() => expect(linhas()).toHaveLength(1))
      expect(entrada).toHaveAttribute('aria-invalid', 'true')
      fireEvent.keyDown(entrada, { key: 'Escape' })
      expect(entrada).not.toHaveAttribute('aria-invalid')
    })

    it('o erro da leitura some sozinho depois de alguns segundos', async () => {
      LIMITES_DA_LEITURA.tempoDoErroMs = 50
      try {
        renderPdv()
        await ler('123')
        expect(await screen.findByText('Código 123 não encontrado.')).toBeInTheDocument()

        await waitFor(() => expect(screen.queryByText('Código 123 não encontrado.')).not.toBeInTheDocument())
      } finally {
        LIMITES_DA_LEITURA.tempoDoErroMs = TEMPO_DO_ERRO_PADRAO
      }
    })

    it('os atalhos da linha ficam escritos sob o campo', async () => {
      renderPdv()
      expect(await screen.findByText('↑ ↓ escolhe a linha · + − quantidade · Del remove')).toBeInTheDocument()
    })

    it('quantidade fracionada sempre com 3 casas', async () => {
      renderPdv()
      await ler('2000077010000')

      await waitFor(() => expect(linhas()).toHaveLength(1))
      expect(linhas()[0]).toHaveTextContent('0,400')
    })

    it('o destaque da linha repete a cada lançamento, inclusive quando soma na mesma linha', async () => {
      renderPdv()
      await ler('542')
      await waitFor(() => expect(linhas()).toHaveLength(1))
      const primeiro = linhas()[0].querySelector('[data-destaque]')?.getAttribute('data-destaque')

      await ler('542')

      await waitFor(() =>
        expect(linhas()[0].querySelector('[data-destaque]')?.getAttribute('data-destaque')).not.toBe(primeiro),
      )
      expect(linhas()[0].querySelector('[data-destaque]')).toHaveClass('motion-safe:animate-[pulse_0.6s_ease-out_1]')
    })

    it('produto inativo: a mensagem do servidor no campo', async () => {
      resolverMock.mockRejectedValue(new HttpError(409, 'Produto inativo — não pode ser vendido.'))
      renderPdv()

      await ler('542')

      await waitFor(() => expect(screen.getByText('Produto inativo — não pode ser vendido.')).toBeInTheDocument())
      expect(bipeMock).toHaveBeenCalled()
    })

    it('troca "UN ▾" para "CX c/ 3 UN" na linha do produto com embalagem', async () => {
      renderPdv()

      await ler('900')
      await waitFor(() => expect(linhas()).toHaveLength(1))
      const seletor = within(linhas()[0]).getByLabelText('Unidade da linha 1')
      fireEvent.change(seletor, { target: { value: 'e-cx3' } })

      await waitFor(() => expect(ultimoCarrinho().itens[0]).toMatchObject({ produtoId: 'p-nexgard', embalagemId: 'e-cx3' }))
      expect(await campo()).toHaveFocus()
    })

    it('o aviso de estoque do cálculo aparece na própria linha', async () => {
      calcularMock.mockImplementation(async (carrinho) =>
        calculoFalso(carrinho, { avisos: [{ campo: 'itens[0]', mensagem: 'Estoque insuficiente (saldo 2 UN)' }] }),
      )
      renderPdv()

      await ler('542')

      await waitFor(() => expect(within(linhas()[0]).getByText('Estoque insuficiente (saldo 2 UN)')).toBeInTheDocument())
    })

    it('código alfanumérico sem espaço (Code128 "RP0012A") vai para a resolução e lança o item', async () => {
      porCodigo({ RP0012A: itemResolvido({ produto: NEXGARD, codigoLido: 'RP0012A' }) })
      renderPdv()

      await ler('RP0012A')

      await waitFor(() => expect(linhas()).toHaveLength(1))
      expect(resolverMock).toHaveBeenCalledWith('RP0012A', expect.any(AbortSignal))
      expect(buscarProdutosMock).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('texto com espaço abre a busca direto, sem consultar o código', async () => {
      buscarProdutosMock.mockResolvedValue([])
      renderPdv()

      await ler('ração x')

      const janela = await screen.findByRole('dialog', { name: 'Buscar produto' })
      expect(within(janela).getByLabelText('Nome do produto')).toHaveValue('ração x')
      expect(resolverMock).not.toHaveBeenCalled()
    })

    it('texto sem dígito que não é código (404) abre a busca, sem erro nem bipe', async () => {
      buscarProdutosMock.mockResolvedValue([])
      renderPdv()

      await ler('ração')

      const janela = await screen.findByRole('dialog', { name: 'Buscar produto' })
      expect(within(janela).getByLabelText('Nome do produto')).toHaveValue('ração')
      expect(resolverMock).toHaveBeenCalledWith('ração', expect.any(AbortSignal))
      expect(bipeMock).not.toHaveBeenCalled()
      expect(screen.queryByText(/não encontrado/)).not.toBeInTheDocument()
    })

    it('contrato novo: etiqueta de produto que não é da balança dá 404 e vira erro de leitura com o código', async () => {
      porCodigo({})
      renderPdv()

      await ler('2000099010000')

      expect(await screen.findByText('Código 2000099010000 não encontrado.')).toBeInTheDocument()
      expect(bipeMock).toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('contrato novo: etiqueta abaixo do preço mínimo vem em itens[i] e marca a linha, bloqueando o pagamento', async () => {
      const mensagem = 'O valor da etiqueta deixa Queijo minas abaixo do preço mínimo (R$ 30,00 por KG).'
      calcularMock.mockImplementation(async (carrinho) => calculoFalso(carrinho, { erros: [{ campo: 'itens[0]', mensagem }] }))
      renderPdv()

      await ler('2000077010000')

      await waitFor(() => expect(within(linhas()[0]).getByText(mensagem)).toBeInTheDocument())
      expect(screen.getByRole('button', { name: /Pagamento/ })).toBeDisabled()
    })

    it('texto que não é código abre a busca por nome; Enter escolhe o produto', async () => {
      buscarProdutosMock.mockResolvedValue([{ ...RACAO, precoVigente: 24.9 }])
      renderPdv()

      await ler('ração')

      const janela = await screen.findByRole('dialog', { name: 'Buscar produto' })
      const busca = within(janela).getByLabelText('Nome do produto')
      expect(busca).toHaveValue('ração')
      await waitFor(() => expect(buscarProdutosMock).toHaveBeenCalledWith('ração', expect.anything()))
      expect(await within(janela).findByRole('option', { name: /Ração X 1kg/ })).toHaveAttribute('aria-selected', 'true')
      fireEvent.keyDown(busca, { key: 'Enter' })

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      await waitFor(() => expect(ultimoCarrinho().itens).toEqual([expect.objectContaining({ produtoId: 'p-racao', codigoLido: null })]))
      await waitFor(async () => expect(await campo()).toHaveFocus())
    })
  })

  describe('atalhos', () => {
    it('F2, F3, F4 e Shift+F4 abrem as janelas; Esc fecha e o foco volta ao campo', async () => {
      buscarProdutosMock.mockResolvedValue([])
      listarClientesMock.mockResolvedValue([])
      renderPdv()
      await ler('542')
      await waitFor(() => expect(linhas()).toHaveLength(1))

      for (const [key, shiftKey, titulo] of [
        ['F2', false, 'Buscar produto'],
        ['F3', false, 'Cliente da venda'],
        ['F4', false, 'Desconto do item'],
        ['F4', true, 'Desconto da venda'],
      ] as const) {
        await tecla(key, { shiftKey })
        const janela = await screen.findByRole('dialog', { name: titulo })
        fireEvent.keyDown(janela, { key: 'Escape' })
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
        expect(await campo()).toHaveFocus()
      }
    })

    it('↑/↓ selecionam a linha; + e − mudam a quantidade; Del remove', async () => {
      renderPdv()
      await ler('542')
      await waitFor(() => expect(linhas()).toHaveLength(1))
      await ler('900')
      await waitFor(() => expect(linhas()).toHaveLength(2))
      // A última lançada fica selecionada.
      expect(linhas()[1]).toHaveAttribute('aria-current', 'true')

      await tecla('ArrowUp')
      expect(linhas()[0]).toHaveAttribute('aria-current', 'true')
      await tecla('+')
      await waitFor(() => expect(ultimoCarrinho().itens[0].quantidade).toBe(2))
      await tecla('-')
      await waitFor(() => expect(ultimoCarrinho().itens[0].quantidade).toBe(1))

      await tecla('ArrowDown')
      expect(linhas()[1]).toHaveAttribute('aria-current', 'true')
      await tecla('Delete')
      await waitFor(() => expect(linhas()).toHaveLength(1))
      expect(linhas()[0]).toHaveTextContent('Ração X 1kg')

      // UX 2: o aviso com Desfazer devolve a linha.
      const aviso = screen.getByText('Nexgard M removido da venda.')
      fireEvent.click(within(aviso.parentElement as HTMLElement).getByRole('button', { name: 'Desfazer' }))
      await waitFor(() => expect(linhas()).toHaveLength(2))
      expect(linhas()[1]).toHaveTextContent('Nexgard M')
      expect(screen.queryByText('Nexgard M removido da venda.')).not.toBeInTheDocument()
    })

    it('Del numa linha com desconto pede confirmação', async () => {
      renderPdv()
      await ler('542')
      await waitFor(() => expect(linhas()).toHaveLength(1))
      await tecla('F4')
      const janela = await screen.findByRole('dialog', { name: 'Desconto do item' })
      fireEvent.click(within(janela).getByRole('radio', { name: '%' }))
      const valor = within(janela).getByLabelText('Desconto (%)')
      fireEvent.change(valor, { target: { value: '5' } })
      fireEvent.submit(valor.closest('form') as HTMLFormElement)
      await waitFor(() =>
        expect(ultimoCarrinho().itens[0].desconto).toEqual({ tipo: 'PERCENTUAL', valor: 5 }),
      )

      await tecla('Delete')
      const confirmar = await screen.findByRole('dialog', { name: 'Remover Ração X 1kg?' })
      fireEvent.click(within(confirmar).getByRole('button', { name: 'Remover' }))

      await waitFor(() => expect(linhas()).toHaveLength(0))
      await waitFor(async () => expect(await campo()).toHaveFocus())
    })

    it('desconto do total em R$ e cliente da venda vão para o cálculo', async () => {
      listarClientesMock.mockResolvedValue([
        { id: 'c-1', numero: 1, nome: 'Maria Silva', cpf: null, telefone: '11999990000' } as Cliente,
      ])
      renderPdv()
      await ler('542')
      await waitFor(() => expect(linhas()).toHaveLength(1))

      await tecla('F4', { shiftKey: true })
      const desconto = await screen.findByRole('dialog', { name: 'Desconto da venda' })
      // UX 11: para o OPERADOR, o limite; e "Voltar" no lugar de "Cancelar".
      expect(desconto).toHaveAccessibleDescription(expect.stringContaining('Seu limite: até 10% da venda.'))
      expect(within(desconto).getByRole('button', { name: 'Voltar' })).toBeInTheDocument()
      expect(within(desconto).queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
      const valor = within(desconto).getByLabelText('Desconto (R$)')
      fireEvent.change(valor, { target: { value: '2,00' } })
      fireEvent.submit(valor.closest('form') as HTMLFormElement)
      await waitFor(() => expect(ultimoCarrinho().desconto).toEqual({ tipo: 'VALOR', valor: 2 }))

      await tecla('F3')
      const cliente = await screen.findByRole('dialog', { name: 'Cliente da venda' })
      fireEvent.change(within(cliente).getByLabelText('Nome, CPF ou telefone'), { target: { value: 'Maria' } })
      fireEvent.click(await within(cliente).findByRole('option', { name: /Maria Silva/ }))

      await waitFor(() => expect(ultimoCarrinho().clienteId).toBe('c-1'))
      expect(listarClientesMock).toHaveBeenCalledWith({ busca: 'Maria', status: 'ativos' })
      expect(screen.getByLabelText('Cliente')).toHaveTextContent('Maria Silva')
    })
  })

  it('Review Focus 1: 5 leituras sem esperar, com o primeiro cálculo pendente, viram 5 linhas em ordem e o total do último', async () => {
    const produtos = ['A', 'B', 'C', 'D', 'E'].map((letra, indice) =>
      produtoDoPdv({ id: `p-${letra}`, nome: `Produto ${letra}`, codigo: 100 + indice }),
    )
    // As respostas chegam fora de ordem.
    const atrasos = [40, 5, 30, 1, 10]
    resolverMock.mockImplementation(
      (codigo) =>
        new Promise((resolve) => {
          const indice = Number(codigo) - 100
          setTimeout(() => resolve(itemResolvido({ produto: produtos[indice], codigoLido: codigo })), atrasos[indice])
        }),
    )
    const sinais: AbortSignal[] = []
    calcularMock.mockImplementation(
      (carrinho, signal) =>
        new Promise<CalculoDaVenda>((resolve, reject) => {
          sinais.push(signal)
          signal.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')))
          // Só o cálculo do carrinho completo responde; os anteriores ficam pendentes até serem cancelados.
          if (carrinho.itens.length === 5) {
            resolve(calculoFalso(carrinho, { total: 123.45 }))
          }
        }),
    )
    renderPdv()

    await ler('100')
    await waitFor(() => expect(calcularMock).toHaveBeenCalledTimes(1))
    const entrada = await campo()
    for (const codigo of ['101', '102', '103', '104']) {
      fireEvent.change(entrada, { target: { value: codigo } })
      fireEvent.keyDown(entrada, { key: 'Enter' })
      // O campo nunca fica bloqueado.
      expect(entrada).not.toBeDisabled()
      expect(entrada).toHaveValue('')
    }

    await waitFor(() => expect(total()).toHaveTextContent('R$ 123,45'))
    expect(linhas().map((linha) => within(linha).getByText(/^Produto /).textContent)).toEqual([
      'Produto A',
      'Produto B',
      'Produto C',
      'Produto D',
      'Produto E',
    ])
    expect(ultimoCarrinho().itens.map((item) => item.produtoId)).toEqual(['p-A', 'p-B', 'p-C', 'p-D', 'p-E'])
    expect(sinais.slice(0, -1).every((sinal) => sinal.aborted)).toBe(true)
    expect(sinais[sinais.length - 1].aborted).toBe(false)
  })

  describe('carrinho no navegador (Review Focus 3)', () => {
    it('recarregar a página mantém o carrinho', async () => {
      const { unmount } = renderPdv()
      await ler('542*3')
      await waitFor(() => expect(linhas()).toHaveLength(1))
      unmount()

      renderPdv()

      await waitFor(() => expect(linhas()).toHaveLength(1))
      expect(linhas()[0]).toHaveTextContent('Ração X 1kg')
      expect(localStorage.getItem(chaveDoCarrinho(EMPRESA, USUARIO))).toContain('"versao":1')
    })

    it.each([
      ['JSON inválido', '{nao e json'],
      ['versão 0', JSON.stringify({ versao: 0, empresaId: EMPRESA, usuarioId: USUARIO, carrinho: { linhas: [], desconto: null, cliente: null } })],
      [
        'de outra empresa',
        guardarCarrinho(
          { linhas: [{ id: 'l', produto: RACAO, embalagemId: null, quantidade: 1, codigoLido: '542', etiqueta: false, desconto: null }], desconto: null, cliente: null },
          99,
          USUARIO,
        ),
      ],
    ])('%s: o carrinho começa vazio, sem erro na tela', async (_caso, texto) => {
      localStorage.setItem(chaveDoCarrinho(EMPRESA, USUARIO), texto)
      renderPdv()

      expect(await screen.findByText('Nenhum item. Bipe o código ou digite o nome do produto.')).toBeInTheDocument()
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })

    it('o carrinho de outro usuário no mesmo navegador não aparece', async () => {
      localStorage.setItem(
        chaveDoCarrinho(EMPRESA, 8),
        guardarCarrinho(
          { linhas: [{ id: 'l', produto: RACAO, embalagemId: null, quantidade: 1, codigoLido: '542', etiqueta: false, desconto: null }], desconto: null, cliente: null },
          EMPRESA,
          8,
        ),
      )
      renderPdv()

      expect(await screen.findByText('Nenhum item. Bipe o código ou digite o nome do produto.')).toBeInTheDocument()
    })
  })

  it('Review Focus 4: o erro de desconto do cálculo aparece, o total continua e o F10 fica bloqueado', async () => {
    calcularMock.mockImplementation(async (carrinho) =>
      calculoFalso(carrinho, { erros: [{ campo: 'desconto', mensagem: 'O desconto passa do subtotal.' }] }),
    )
    renderPdv()
    await ler('542')

    expect(await screen.findByText('O desconto passa do subtotal.')).toBeInTheDocument()
    expect(total()).toHaveTextContent('R$ 24,90')

    await tecla('F10')

    expect(await screen.findByText('Corrija os erros da venda antes de pagar.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pagamento/ })).toBeDisabled()
  })

  it('pagamentos sem valor no cálculo do carrinho não bloqueiam a tela', async () => {
    calcularMock.mockImplementation(async (carrinho) =>
      calculoFalso(carrinho, { erros: [{ campo: 'pagamentos', mensagem: 'Falta pagar R$ 24,90.' }] }),
    )
    renderPdv()
    await ler('542')

    await waitFor(() => expect(total()).toHaveTextContent('R$ 24,90'))
    expect(screen.queryByText('Falta pagar R$ 24,90.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Pagamento/ })).toBeEnabled()
  })

  describe('caixa', () => {
    it('sem caixa aberto: "Abra o caixa para vender." com o botão da mesma janela do Caixa', async () => {
      sessaoAtualMock.mockResolvedValue(null)
      listarPontosMock.mockResolvedValue([pontoDeTeste()])
      renderPdv()

      expect(await screen.findByRole('heading', { name: 'Abra o caixa para vender.' })).toBeInTheDocument()
      fireEvent.click(await screen.findByRole('button', { name: 'Abrir o Caixa 1' }))

      expect(await screen.findByRole('dialog', { name: 'Abrir o Caixa 1' })).toBeInTheDocument()
      expect(screen.queryByLabelText('Código ou nome')).not.toBeInTheDocument()
      // UX 13: sem carrinho guardado, sem a frase.
      expect(screen.queryByText('A venda em andamento continua guardada neste navegador.')).not.toBeInTheDocument()
    })

    it('sem caixa aberto, com carrinho guardado: avisa que a venda continua guardada', async () => {
      sessaoAtualMock.mockResolvedValue(null)
      listarPontosMock.mockResolvedValue([pontoDeTeste()])
      localStorage.setItem(
        chaveDoCarrinho(EMPRESA, USUARIO),
        guardarCarrinho(
          { linhas: [{ id: 'l', produto: RACAO, embalagemId: null, quantidade: 1, codigoLido: '542', etiqueta: false, desconto: null }], desconto: null, cliente: null },
          EMPRESA,
          USUARIO,
        ),
      )
      renderPdv()

      expect(await screen.findByText('A venda em andamento continua guardada neste navegador.')).toBeInTheDocument()
    })

    it('em conferência: "Termine o fechamento do caixa." com o link para o Caixa', async () => {
      sessaoAtualMock.mockResolvedValue(sessaoDeTeste({ status: 'EM_CONFERENCIA' }))
      renderPdv()

      expect(await screen.findByRole('heading', { name: 'Termine o fechamento do caixa.' })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Ir para o Caixa' })).toHaveAttribute('href', '/caixa')
    })

    it('falha ao carregar o caixa: mensagem e "Tentar de novo"', async () => {
      sessaoAtualMock.mockRejectedValueOnce(new HttpError(500, 'Requisicao falhou (HTTP 500).'))
      renderPdv()

      expect(await screen.findByText('Não foi possível carregar o caixa.')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

      expect(await campo()).toBeInTheDocument()
    })
  })

  describe('leituras pendentes (I1)', () => {
    afterEach(() => {
      LIMITES_DA_LEITURA.tempoMaximoMs = TEMPO_PADRAO
    })

    it('F10 logo depois de um bipe ainda pendente é recusado com "Aguarde a leitura…"', async () => {
      renderPdv()
      await ler('542')
      await waitFor(() => expect(screen.getByRole('button', { name: /Pagamento/ })).toBeEnabled())
      resolverMock.mockImplementation(() => new Promise(() => undefined))

      await ler('900')
      await tecla('F10')

      expect(await screen.findByText('Aguarde a leitura…')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Pagamento/ })).toBeDisabled()
      expect(screen.getByRole('status', { name: 'Lendo o código' })).toBeInTheDocument()
      expect(bipeMock).not.toHaveBeenCalled()
    })

    it('leitura travada: depois do tempo máximo, aborta e pede para ler de novo', async () => {
      LIMITES_DA_LEITURA.tempoMaximoMs = 50
      const sinais: AbortSignal[] = []
      resolverMock.mockImplementation(
        (_codigo, signal) =>
          new Promise((_resolve, reject) => {
            if (signal) {
              sinais.push(signal)
              signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
            }
          }),
      )
      renderPdv()

      await ler('542')

      expect(await screen.findByText('Sem resposta do servidor. Leia o código de novo.')).toBeInTheDocument()
      expect(sinais[0].aborted).toBe(true)
      expect(screen.queryByRole('status', { name: 'Lendo o código' })).not.toBeInTheDocument()
      expect(bipeMock).toHaveBeenCalled()
    })

    it('as leituras pendentes são abortadas ao sair da tela', async () => {
      const sinais: AbortSignal[] = []
      resolverMock.mockImplementation((_codigo, signal) => {
        if (signal) {
          sinais.push(signal)
        }
        return new Promise(() => undefined)
      })
      const { unmount } = renderPdv()
      await ler('542')
      await waitFor(() => expect(sinais).toHaveLength(1))

      unmount()

      expect(sinais[0].aborted).toBe(true)
    })
  })

  describe('falhas do cálculo (S1)', () => {
    it.each([
      [new HttpError(503, 'Requisicao falhou (HTTP 503).'), 'O servidor não conseguiu calcular a venda. Tente de novo.'],
      [new HttpError(403, 'Requisicao falhou (HTTP 403).'), 'Você não tem permissão para calcular esta venda.'],
      [new HttpError(401, 'Nao autorizado.'), 'Sua sessão expirou. Entre de novo.'],
      [new HttpError(0, 'Nao foi possivel conectar ao servidor.'), 'Não foi possível calcular a venda. Confira a conexão.'],
    ])('%s mostra a mensagem certa', async (falha, mensagem) => {
      calcularMock.mockRejectedValue(falha)
      renderPdv()
      await ler('542')

      expect(await screen.findByText(mensagem)).toBeInTheDocument()
    })

    it('"Tentar de novo" limpa a falha antes de calcular de novo', async () => {
      calcularMock.mockRejectedValueOnce(new HttpError(503, 'Requisicao falhou (HTTP 503).'))
      renderPdv()
      await ler('542')
      await screen.findByText('O servidor não conseguiu calcular a venda. Tente de novo.')
      calcularMock.mockImplementation(() => new Promise(() => undefined))

      fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

      await waitFor(() =>
        expect(screen.queryByText('O servidor não conseguiu calcular a venda. Tente de novo.')).not.toBeInTheDocument(),
      )
      expect(screen.getByText('Calculando')).toBeInTheDocument()
    })
  })

  it('erros das linhas: na própria linha (sem aria-invalid no item) e numa região viva', async () => {
    calcularMock.mockImplementation(async (carrinho) =>
      calculoFalso(carrinho, { erros: [{ campo: 'itens[0]', mensagem: 'O desconto deixa Ração X 1kg abaixo do preço mínimo.' }] }),
    )
    renderPdv()
    await ler('542')

    await waitFor(() => expect(within(linhas()[0]).getByText('O desconto deixa Ração X 1kg abaixo do preço mínimo.')).toBeInTheDocument())
    expect(linhas()[0]).not.toHaveAttribute('aria-invalid')
    expect(linhas()[0]).toHaveAccessibleDescription('O desconto deixa Ração X 1kg abaixo do preço mínimo.')
    expect(within(linhas()[0]).getByText('com erro')).toHaveClass('sr-only')
    expect(screen.getByRole('alert', { name: 'Erros dos itens' })).toHaveTextContent(
      'Item 1: O desconto deixa Ração X 1kg abaixo do preço mínimo.',
    )
  })

  it('a busca ignora o Enter enquanto o termo digitado ainda não foi buscado (S4)', async () => {
    buscarProdutosMock.mockImplementation(async (texto) =>
      texto === 'ração' ? [{ ...RACAO, precoVigente: 24.9 }] : [{ ...NEXGARD, precoVigente: 89.9 }],
    )
    renderPdv()
    await ler('ração')
    const janela = await screen.findByRole('dialog', { name: 'Buscar produto' })
    const busca = within(janela).getByLabelText('Nome do produto')
    await within(janela).findByRole('option', { name: /Ração X 1kg/ })

    fireEvent.change(busca, { target: { value: 'nexgard' } })
    fireEvent.keyDown(busca, { key: 'Enter' })

    // O Enter não lançou a ração da busca anterior.
    expect(screen.getByRole('dialog', { name: 'Buscar produto' })).toBeInTheDocument()
    expect(await within(janela).findByRole('option', { name: /Nexgard M/ })).toBeInTheDocument()
    fireEvent.keyDown(busca, { key: 'Enter' })
    await waitFor(() => expect(linhas()).toHaveLength(1))
    expect(linhas()[0]).toHaveTextContent('Nexgard M')
  })

  it('o cliente usa setas, destaque e Enter, como a busca de produto', async () => {
    listarClientesMock.mockResolvedValue([
      { id: 'c-1', numero: 1, nome: 'Maria Silva', cpf: null, telefone: null } as Cliente,
      { id: 'c-2', numero: 2, nome: 'Mariana Lopes', cpf: null, telefone: null } as Cliente,
    ])
    renderPdv()
    await ler('542')
    await waitFor(() => expect(linhas()).toHaveLength(1))
    await tecla('F3')
    const janela = await screen.findByRole('dialog', { name: 'Cliente da venda' })
    const campoDoCliente = within(janela).getByLabelText('Nome, CPF ou telefone')
    fireEvent.change(campoDoCliente, { target: { value: 'Mari' } })
    expect(await within(janela).findByRole('option', { name: /Maria Silva/ })).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(campoDoCliente, { key: 'ArrowDown' })
    expect(within(janela).getByRole('option', { name: /Mariana Lopes/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(campoDoCliente, { key: 'Enter' })

    await waitFor(() => expect(screen.getByLabelText('Cliente')).toHaveTextContent('Mariana Lopes'))
  })

  describe('erros de dados do cálculo (A6)', () => {
    it('cálculo 409 itens[0] (produto inativado depois do bipe) marca a linha e bloqueia o F10', async () => {
      calcularMock.mockRejectedValue(
        new HttpError(409, 'Requisicao falhou (HTTP 409).', { 'itens[0]': 'Produto inativo — não pode ser vendido.' }),
      )
      renderPdv()
      await ler('542')

      await waitFor(() => expect(within(linhas()[0]).getByText('Produto inativo — não pode ser vendido.')).toBeInTheDocument())
      expect(linhas()[0]).toHaveAccessibleDescription('Produto inativo — não pode ser vendido.')
      expect(screen.getByRole('button', { name: /Pagamento/ })).toBeDisabled()

      await tecla('F10')

      expect(await screen.findByText('Corrija os erros da venda antes de pagar.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })

    it('cliente inativado: o 404 em clienteId mostra "Cliente não encontrado." e o F3 permite tirar o cliente', async () => {
      listarClientesMock.mockResolvedValue([{ id: 'c-1', numero: 1, nome: 'Maria Silva', cpf: null, telefone: null } as Cliente])
      renderPdv()
      await ler('542')
      await waitFor(() => expect(screen.getByRole('button', { name: /Pagamento/ })).toBeEnabled())
      await tecla('F3')
      const escolha = await screen.findByRole('dialog', { name: 'Cliente da venda' })
      fireEvent.change(within(escolha).getByLabelText('Nome, CPF ou telefone'), { target: { value: 'Maria' } })
      // O cliente foi inativado em outro lugar: o cálculo com ele dá 404 no campo clienteId.
      calcularMock.mockImplementation(async (carrinho) => {
        if (carrinho.clienteId) {
          throw new HttpError(404, 'Requisicao falhou (HTTP 404).', { clienteId: 'Cliente não encontrado.' })
        }
        return calculoFalso(carrinho)
      })
      fireEvent.click(await within(escolha).findByRole('option', { name: /Maria Silva/ }))

      expect(await screen.findByText('Cliente não encontrado.')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Pagamento/ })).toBeDisabled()

      await tecla('F3')
      const janela = await screen.findByRole('dialog', { name: 'Cliente da venda' })
      fireEvent.click(within(janela).getByRole('button', { name: 'Tirar da venda' }))

      await waitFor(() => expect(screen.queryByText('Cliente não encontrado.')).not.toBeInTheDocument())
      expect(screen.getByLabelText('Cliente')).toHaveTextContent('Sem cliente')
      await waitFor(() => expect(screen.getByRole('button', { name: /Pagamento/ })).toBeEnabled())
    })
  })

  it('três leituras em menos de 150 ms viram um cálculo só (A10)', async () => {
    renderPdv()
    const entrada = await campo()
    await waitFor(() => expect(screen.getByText('Caixa 1 · Ana Souza')).toBeInTheDocument())
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      for (const codigo of ['542', '900', '542']) {
        fireEvent.change(entrada, { target: { value: codigo } })
        fireEvent.keyDown(entrada, { key: 'Enter' })
        // 40 ms entre as leituras: cada mudança reinicia a espera do cálculo.
        await act(async () => {
          await vi.advanceTimersByTimeAsync(40)
        })
      }
      expect(linhas()).toHaveLength(2)
      expect(calcularMock).not.toHaveBeenCalled()

      // A espera conta da última mudança do carrinho: 149 ms sem cálculo, 150 ms e um pedido só.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(149)
      })
      expect(calcularMock).not.toHaveBeenCalled()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1)
      })
      expect(calcularMock).toHaveBeenCalledTimes(1)
      expect(ultimoCarrinho().itens.map((item) => [item.produtoId, item.quantidade])).toEqual([
        ['p-racao', 2],
        ['p-nexgard', 1],
      ])
    } finally {
      vi.useRealTimers()
    }
  })

  describe('total sempre da venda atual (I2)', () => {
    it('depois de pôr a venda 1 em espera, a venda 2 não mostra o total da venda 1', async () => {
      renderPdv()
      await ler('542')
      await waitFor(() => expect(total()).toHaveTextContent('R$ 24,90'))
      await tecla('F6')
      await waitFor(() => expect(linhas()).toHaveLength(0))
      expect(total()).toHaveTextContent('R$ 0,00')
      calcularMock.mockImplementation(() => new Promise(() => undefined))

      await ler('900')

      await waitFor(() => expect(linhas()).toHaveLength(1))
      expect(total()).toHaveTextContent('—')
      expect(total()).not.toHaveTextContent('24,90')
    })

    it('carrinho restaurado com o cálculo falhando mostra "—" no total', async () => {
      localStorage.setItem(
        chaveDoCarrinho(EMPRESA, USUARIO),
        guardarCarrinho(
          {
            linhas: [{ id: 'l', produto: RACAO, embalagemId: null, quantidade: 1, codigoLido: '542', etiqueta: false, desconto: null }],
            desconto: null,
            cliente: null,
          },
          EMPRESA,
          USUARIO,
        ),
      )
      calcularMock.mockRejectedValue(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
      renderPdv()

      expect(await screen.findByText('Não foi possível calcular a venda. Confira a conexão.')).toBeInTheDocument()
      expect(total()).toHaveTextContent('—')
    })

    it('F6 sem o cálculo atual guarda a venda em espera sem total ("—" na lista)', async () => {
      calcularMock.mockImplementation(() => new Promise(() => undefined))
      renderPdv()
      await ler('542')
      await waitFor(() => expect(linhas()).toHaveLength(1))

      await tecla('F6')
      await tecla('F7')

      const janela = await screen.findByRole('dialog', { name: 'Vendas em espera' })
      expect(within(janela).getByRole('listitem')).toHaveTextContent('—')
    })
  })

  it('foco permanente (I3): clicar numa área vazia e bipar não perde a leitura', async () => {
    renderPdv()
    const entrada = await campo()
    entrada.blur()
    expect(entrada).not.toHaveFocus()

    // As teclas chegam fora do campo (o jsdom não insere o caractere num campo focado por keydown).
    for (const digito of ['5', '4', '2']) {
      fireEvent.keyDown(document.body, { key: digito })
    }
    expect(entrada).toHaveFocus()
    expect(entrada).toHaveValue('542')
    fireEvent.keyDown(entrada, { key: 'Enter' })

    await waitFor(() => expect(resolverMock).toHaveBeenCalledWith('542', expect.anything()))
    await waitFor(() => expect(linhas()).toHaveLength(1))
  })

  it('os botões do painel devolvem o foco ao campo', async () => {
    renderPdv()
    await ler('542')
    await waitFor(() => expect(linhas()).toHaveLength(1))

    fireEvent.click(screen.getByRole('button', { name: /Pôr em espera/ }))

    await waitFor(() => expect(linhas()).toHaveLength(0))
    expect(await campo()).toHaveFocus()
  })

  it('↓ na busca antes dos resultados não quebra o Enter (I7)', async () => {
    let responder: (produtos: Awaited<ReturnType<typeof buscarProdutos>>) => void = () => undefined
    buscarProdutosMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          responder = resolve
        }),
    )
    renderPdv()
    await ler('ração')
    const janela = await screen.findByRole('dialog', { name: 'Buscar produto' })
    const busca = within(janela).getByLabelText('Nome do produto')
    await waitFor(() => expect(buscarProdutosMock).toHaveBeenCalled())

    fireEvent.keyDown(busca, { key: 'ArrowDown' })
    responder([{ ...RACAO, precoVigente: 24.9 }])
    expect(await within(janela).findByRole('option', { name: /Ração X 1kg/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(busca, { key: 'Enter' })

    await waitFor(() => expect(linhas()).toHaveLength(1))
  })
})
