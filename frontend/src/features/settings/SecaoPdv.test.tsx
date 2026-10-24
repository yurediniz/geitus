import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { SecaoPdv } from '@/features/settings/SecaoPdv'
import { useFeedbackDaTela } from '@/hooks/useFeedbackDaTela'
import { buscar, salvar } from '@/services/configuracaoPdvService'
import { HttpError } from '@/services/httpClient'
import type { ConfiguracaoDoPdv } from '@/types/pdv'

vi.mock('@/services/configuracaoPdvService', () => ({
  buscar: vi.fn(),
  salvar: vi.fn(),
}))

const buscarMock = vi.mocked(buscar)
const salvarMock = vi.mocked(salvar)

const PADRAO: ConfiguracaoDoPdv = {
  venderSemEstoque: true,
  descontoMaximoOperador: 10,
  atualizadoPorNome: null,
  atualizadoEm: null,
}

function Tela() {
  const { sucesso, erro, avisos } = useFeedbackDaTela()
  return (
    <>
      <FeedbackCatalogo sucesso={sucesso} erro={erro} />
      <SecaoPdv avisos={avisos} />
    </>
  )
}

function renderSecao() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <Tela />
    </QueryClientProvider>,
  )
}

function interruptor() {
  return screen.findByRole('switch', { name: 'Vender sem estoque' })
}

function campoDoDesconto() {
  return screen.findByLabelText('Desconto máximo do operador (%)')
}

describe('SecaoPdv', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    salvarMock.mockReset()
    buscarMock.mockResolvedValue(PADRAO)
  })

  it('mostra o interruptor e o percentual com as frases da spec', async () => {
    renderSecao()

    expect(screen.getByRole('heading', { level: 2, name: 'PDV' })).toBeInTheDocument()
    const campo = await interruptor()
    expect(campo).toHaveAttribute('aria-checked', 'true')
    expect(campo).toHaveAccessibleDescription(
      'Quando ligado, a venda passa mesmo sem saldo e o estoque fica negativo até o ajuste.',
    )
    const desconto = await campoDoDesconto()
    expect(desconto).toHaveValue('10,00')
    expect(desconto).toHaveAccessibleDescription(
      'Acima disso, só administradores dão desconto. Nenhum desconto passa do preço mínimo do produto.',
    )
  })

  it('o interruptor salva as duas opções e avisa', async () => {
    salvarMock.mockResolvedValue({ ...PADRAO, venderSemEstoque: false })
    renderSecao()

    fireEvent.click(await interruptor())

    await waitFor(() => expect(salvarMock).toHaveBeenCalledWith({ venderSemEstoque: false, descontoMaximoOperador: 10 }))
    expect(await screen.findByRole('status')).toHaveTextContent('Vender sem estoque desligado')
  })

  it('em erro, o interruptor volta ao que era e a mensagem aparece', async () => {
    salvarMock.mockRejectedValue(new HttpError(0, 'Nao foi possivel conectar ao servidor.'))
    renderSecao()

    const campo = await interruptor()
    fireEvent.click(campo)

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível salvar a configuração. Tente de novo.')
    await waitFor(() => expect(campo).toHaveAttribute('aria-checked', 'true'))
  })

  it('o percentual aceita vírgula e salva com Enter', async () => {
    salvarMock.mockResolvedValue({ ...PADRAO, descontoMaximoOperador: 12.5 })
    renderSecao()

    const campo = await campoDoDesconto()
    fireEvent.change(campo, { target: { value: '12,5' } })
    fireEvent.submit(campo.closest('form') as HTMLFormElement)

    await waitFor(() => expect(salvarMock).toHaveBeenCalledWith({ venderSemEstoque: true, descontoMaximoOperador: 12.5 }))
    expect(await screen.findByRole('status')).toHaveTextContent('Desconto máximo do operador: 12,50%')
    expect(campo).toHaveValue('12,50')
  })

  it.each(['101', '-1', '10,123', 'abc', ''])('percentual inválido "%s" não vai ao servidor', async (texto) => {
    renderSecao()

    const campo = await campoDoDesconto()
    fireEvent.change(campo, { target: { value: texto } })
    fireEvent.submit(campo.closest('form') as HTMLFormElement)

    expect(await screen.findByText('Informe um percentual de 0 a 100, com até 2 casas.')).toBeInTheDocument()
    expect(campo).toHaveAttribute('aria-invalid', 'true')
    expect(salvarMock).not.toHaveBeenCalled()
  })

  it('erro ao salvar o percentual: o campo volta ao valor salvo', async () => {
    salvarMock.mockRejectedValue(new HttpError(403, 'Requisicao falhou (HTTP 403).'))
    renderSecao()

    const campo = await campoDoDesconto()
    fireEvent.change(campo, { target: { value: '15' } })
    fireEvent.submit(campo.closest('form') as HTMLFormElement)

    expect(await screen.findByRole('alert')).toHaveTextContent('Somente administradores podem fazer esta alteração.')
    await waitFor(() => expect(campo).toHaveValue('10,00'))
  })

  it('falha ao carregar: mensagem e "Tentar de novo"', async () => {
    buscarMock.mockRejectedValueOnce(new HttpError(500, 'Requisicao falhou (HTTP 500).'))
    renderSecao()

    expect(await screen.findByText('Não foi possível carregar a configuração do PDV.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }))

    expect(await interruptor()).toBeInTheDocument()
  })
})
