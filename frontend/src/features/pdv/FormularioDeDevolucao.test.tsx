import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { FormularioDeDevolucao } from '@/features/pdv/FormularioDeDevolucao'
import { HttpError } from '@/services/httpClient'
import { buscarVendaParaDevolucao, devolverItens } from '@/services/pdvService'
import type { Devolucao, LinhaParaDevolucao, VendaParaDevolucao } from '@/types/pdv'

vi.mock('@/services/pdvService', () => ({
  buscarVendaParaDevolucao: vi.fn(),
  devolverItens: vi.fn(),
}))

const buscarMock = vi.mocked(buscarVendaParaDevolucao)
const devolverMock = vi.mocked(devolverItens)

const VENDA_ID = 'v-8'

function linha(parcial: Partial<LinhaParaDevolucao>): LinhaParaDevolucao {
  return {
    ordem: 1,
    nome: 'Ração Golden 1kg',
    unidade: 'UN',
    embalagemRotulo: null,
    etiqueta: false,
    fracionada: false,
    precoUnitario: 10,
    quantidade: 3,
    devolvida: 0,
    disponivel: 3,
    valorLiquido: 30,
    valorDisponivel: 30,
    ...parcial,
  }
}

function venda(parcial: Partial<VendaParaDevolucao> = {}): VendaParaDevolucao {
  return {
    id: VENDA_ID,
    numero: 8,
    concluidaEm: '2026-10-28T14:00:00Z',
    vendedorNome: 'Ana Souza',
    clienteNome: null,
    total: 30,
    troco: 0,
    linhas: [linha({})],
    formas: [{ forma: 'DINHEIRO', recebido: 30, reembolsado: 0, disponivel: 30 }],
    devolucoes: [],
    ...parcial,
  }
}

const GRAVADA: Devolucao = {
  id: 'd-1',
  vendaId: VENDA_ID,
  vendaNumero: 8,
  valor: 10,
  motivo: 'Defeito',
  criadaEm: '2026-10-29T10:00:00Z',
  usuarioNome: 'Ana Souza',
  itens: [{ ordem: 1, nome: 'Ração Golden 1kg', quantidade: 1, unidade: 'UN', valor: 10, destino: 'AVARIADO' }],
  reembolsos: [{ forma: 'DINHEIRO', valor: 10 }],
}

const aoVoltar = vi.fn()
const aoDevolver = vi.fn()

function renderFormulario() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <FormularioDeDevolucao vendaId={VENDA_ID} numero={8} aoVoltar={aoVoltar} aoDevolver={aoDevolver} />
    </QueryClientProvider>,
  )
}

/** O botao de envio: o texto e a frase da confirmacao. */
function botaoDeEnvio(): HTMLButtonElement {
  return document.querySelector('button[type="submit"]') as HTMLButtonElement
}

function textoSemNbsp(elemento: HTMLElement): string {
  return (elemento.textContent ?? '').replace(/ /g, ' ')
}

function preencherMotivo(texto = 'Defeito') {
  fireEvent.change(screen.getByLabelText(/motivo da devolução/i), { target: { value: texto } })
}

describe('FormularioDeDevolucao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('carrega a venda com o vendido e o que resta de cada linha; ja devolvida aparece sem campo', async () => {
    buscarMock.mockResolvedValue(
      venda({
        linhas: [
          linha({ devolvida: 1, disponivel: 2, valorDisponivel: 20 }),
          linha({ ordem: 2, nome: 'Petisco', quantidade: 1, devolvida: 1, disponivel: 0, valorDisponivel: 0 }),
        ],
      }),
    )
    renderFormulario()

    const itens = await screen.findByRole('list', { name: 'Itens da venda' })
    expect(buscarMock).toHaveBeenCalledWith(8)
    expect(within(itens).getByText('Vendido 3 UN · devolvido 1 UN · restam 2 UN')).toBeInTheDocument()
    expect(within(itens).getByText('Vendido 1 UN · já devolvido')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Devolver (UN)')).toHaveLength(1)
    expect(botaoDeEnvio()).toBeDisabled()
    expect(botaoDeEnvio()).toHaveTextContent('Escolha o que devolver')
  })

  it('limita a quantidade ao que resta e a unidade inteira', async () => {
    buscarMock.mockResolvedValue(venda())
    renderFormulario()

    const campo = await screen.findByLabelText('Devolver (UN)')
    expect(campo).toHaveFocus()
    fireEvent.change(campo, { target: { value: '4' } })
    expect(screen.getByText('Só restam 3 UN para devolver nesta linha.')).toBeInTheDocument()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(botaoDeEnvio()).toBeDisabled()

    fireEvent.change(campo, { target: { value: '1,5' } })
    expect(screen.getByText('Esta unidade não é fracionada: devolva uma quantidade inteira.')).toBeInTheDocument()
  })

  it('com uma forma, o reembolso vem preenchido; a frase diz o valor e o destino escolhido', async () => {
    buscarMock.mockResolvedValue(venda())
    renderFormulario()

    fireEvent.change(await screen.findByLabelText('Devolver (UN)'), { target: { value: '1' } })
    expect(screen.getByLabelText('Dinheiro · até R$ 30,00')).toHaveValue('10,00')
    expect(textoSemNbsp(screen.getByText('Total da devolução').parentElement as HTMLElement)).toBe('Total da devoluçãoR$ 10,00')

    fireEvent.change(screen.getByLabelText('Dinheiro · até R$ 30,00'), { target: { value: '12,00' } })
    expect(textoSemNbsp(screen.getByRole('status'))).toBe('O reembolso precisa somar R$ 10,00 (sobram R$ 2,00).')
    fireEvent.change(screen.getByLabelText('Dinheiro · até R$ 30,00'), { target: { value: '10,00' } })
    expect(textoSemNbsp(botaoDeEnvio())).toBe('Devolver R$ 10,00 em dinheiro e voltar 1 UN ao estoque')

    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'AVARIADO' } })
    expect(textoSemNbsp(botaoDeEnvio())).toBe('Devolver R$ 10,00 em dinheiro e registrar 1 UN como avariado')
  })

  it('a etiqueta de balanca so volta inteira', async () => {
    buscarMock.mockResolvedValue(
      venda({
        linhas: [linha({ unidade: 'KG', etiqueta: true, fracionada: true, quantidade: 1.25, disponivel: 1.25, valorLiquido: 25, valorDisponivel: 25 })],
        formas: [{ forma: 'PIX', recebido: 25, reembolsado: 0, disponivel: 25 }],
      }),
    )
    renderFormulario()

    fireEvent.change(await screen.findByLabelText('Devolver (item de balança, só inteiro)'), { target: { value: 'toda' } })
    expect(textoSemNbsp(botaoDeEnvio())).toBe('Devolver R$ 25,00 no PIX e voltar 1,25 KG ao estoque')
  })

  it('com varias formas, uma soma diferente do total bloqueia; distribuir de novo volta ao automatico', async () => {
    buscarMock.mockResolvedValue(
      venda({
        formas: [
          { forma: 'DINHEIRO', recebido: 10, reembolsado: 0, disponivel: 10 },
          { forma: 'PIX', recebido: 20, reembolsado: 0, disponivel: 20 },
        ],
      }),
    )
    renderFormulario()

    fireEvent.change(await screen.findByLabelText('Devolver (UN)'), { target: { value: '2' } })
    expect(screen.getByLabelText('Dinheiro · até R$ 10,00')).toHaveValue('10,00')
    expect(screen.getByLabelText('PIX · até R$ 20,00')).toHaveValue('10,00')

    fireEvent.change(screen.getByLabelText('PIX · até R$ 20,00'), { target: { value: '5,00' } })
    expect(textoSemNbsp(screen.getByRole('status'))).toBe('Distribua R$ 20,00 entre as formas de pagamento (faltam R$ 5,00).')
    preencherMotivo()
    expect(botaoDeEnvio()).toBeDisabled()

    fireEvent.change(screen.getByLabelText('PIX · até R$ 20,00'), { target: { value: '15,00' } })
    expect(textoSemNbsp(screen.getByRole('status'))).toBe('Distribua R$ 20,00 entre as formas de pagamento (sobram R$ 5,00).')
    expect(botaoDeEnvio()).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'Distribuir sozinho de novo' }))
    expect(screen.getByLabelText('PIX · até R$ 20,00')).toHaveValue('10,00')
    expect(botaoDeEnvio()).toBeEnabled()
  })

  it('sem motivo nao envia; com motivo envia o pedido certo e avisa quem abriu', async () => {
    buscarMock.mockResolvedValue(venda())
    devolverMock.mockResolvedValue(GRAVADA)
    renderFormulario()

    fireEvent.change(await screen.findByLabelText('Devolver (UN)'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'AVARIADO' } })
    fireEvent.click(botaoDeEnvio())
    expect(await screen.findByText('Informe o motivo.')).toBeInTheDocument()
    expect(devolverMock).not.toHaveBeenCalled()

    preencherMotivo('  Defeito ')
    fireEvent.click(botaoDeEnvio())

    await waitFor(() => expect(aoDevolver).toHaveBeenCalledWith(GRAVADA))
    expect(devolverMock).toHaveBeenCalledWith(VENDA_ID, {
      chave: expect.stringMatching(/^[0-9a-f-]{36}$/),
      motivo: 'Defeito',
      itens: [{ ordem: 1, quantidade: 1, destino: 'AVARIADO' }],
      reembolsos: [{ forma: 'DINHEIRO', valor: 10 }],
    })
  })

  it('o 400 aparece no campo da linha e da forma; o 409 no topo', async () => {
    buscarMock.mockResolvedValue(venda())
    devolverMock.mockRejectedValueOnce(
      new HttpError(400, 'Dados invalidos.', {
        'itens[0].quantidade': 'Só restam 2 UN para devolver nesta linha.',
        'reembolsos[0].valor': 'Em Dinheiro restam R$ 5,00 para devolver.',
      }),
    )
    renderFormulario()

    fireEvent.change(await screen.findByLabelText('Devolver (UN)'), { target: { value: '1' } })
    preencherMotivo()
    fireEvent.click(botaoDeEnvio())

    expect(await screen.findByText('Só restam 2 UN para devolver nesta linha.')).toBeInTheDocument()
    expect(screen.getByText('Em Dinheiro restam R$ 5,00 para devolver.')).toBeInTheDocument()

    devolverMock.mockRejectedValueOnce(new HttpError(409, 'O caixa desta sessão está fechado.'))
    fireEvent.click(botaoDeEnvio())
    expect(await screen.findByText('O caixa desta sessão está fechado.')).toBeInTheDocument()
    expect(aoDevolver).not.toHaveBeenCalled()
  })

  it('a venda que nao pode ser devolvida mostra a mensagem do servidor e deixa voltar', async () => {
    buscarMock.mockRejectedValue(new HttpError(409, 'Venda cancelada não pode ter devolução.'))
    renderFormulario()

    expect(await screen.findByText('Venda cancelada não pode ter devolução.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Voltar' }))
    expect(aoVoltar).toHaveBeenCalled()
  })
})
