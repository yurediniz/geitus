import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'

import { EtiquetaBalancaPage } from '@/features/catalog/EtiquetaBalancaPage'
import { useAuth } from '@/hooks/useAuth'
import { CONFIGURACAO_ETIQUETA_PADRAO } from '@/lib/etiquetaBalanca'
import {
  buscarConfiguracaoEtiqueta,
  salvarConfiguracaoEtiqueta,
  testarEtiqueta,
} from '@/services/etiquetaBalancaService'
import { HttpError } from '@/services/httpClient'
import type { ConfiguracaoEtiqueta } from '@/types/etiquetaBalanca'

vi.mock('@/services/etiquetaBalancaService', () => ({
  buscarConfiguracaoEtiqueta: vi.fn(),
  salvarConfiguracaoEtiqueta: vi.fn(),
  testarEtiqueta: vi.fn(),
}))

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}))

const buscarMock = vi.mocked(buscarConfiguracaoEtiqueta)
const salvarMock = vi.mocked(salvarConfiguracaoEtiqueta)
const testarMock = vi.mocked(testarEtiqueta)
const useAuthMock = vi.mocked(useAuth)

function definirPerfil(perfil: 'ADMIN' | 'OPERADOR') {
  useAuthMock.mockReturnValue({
    usuario: {
      id: 1,
      nome: 'Ana Souza',
      email: 'ana@mercado.com',
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
  // Data router: o aviso de alteracoes nao salvas usa o useBlocker.
  const router = createMemoryRouter(
    [
      { path: '/produtos/balanca', element: <EtiquetaBalancaPage /> },
      { path: '/produtos', element: <h1>Lista de produtos</h1> },
    ],
    { initialEntries: ['/produtos/balanca'] },
  )
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return router
}

async function esperarFormulario() {
  return screen.findByLabelText('Modelo')
}

function campo(rotulo: string | RegExp): HTMLElement {
  return screen.getByLabelText(rotulo)
}

function botaoSalvar(): HTMLElement {
  return screen.getByRole('button', { name: 'Salvar configuração' })
}

const MODELO_4_0_6: ConfiguracaoEtiqueta = {
  prefixo: '2',
  digitosCodigo: 4,
  digitosPreenchimento: 1,
  tipoInformacao: 'VALOR',
  digitosInformacao: 6,
  casasDecimais: 2,
  digitoVerificador: true,
}

describe('EtiquetaBalancaPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // mockReset: um Once que sobrou de um teste nao vaza para o proximo.
    salvarMock.mockReset()
    testarMock.mockReset()
    definirPerfil('ADMIN')
    buscarMock.mockResolvedValue({ ...CONFIGURACAO_ETIQUETA_PADRAO, padrao: true })
  })

  it('fica na aba "Balança" do catálogo', async () => {
    renderPagina()
    await esperarFormulario()

    const catalogo = screen.getByRole('navigation', { name: 'Catálogo' })
    expect(within(catalogo).getByRole('link', { name: 'Balança' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { level: 1, name: 'Etiqueta de balança' })).toBeInTheDocument()
  })

  it('abre com o padrão, os campos e a prévia do formato', async () => {
    renderPagina()
    await esperarFormulario()

    expect(campo('Modelo')).toHaveValue('toledo-6-6')
    expect(campo('Prefixo')).toHaveValue('2')
    expect(campo('Dígitos do código')).toHaveValue('6')
    expect(campo('Zeros de preenchimento')).toHaveValue('0')
    expect(campo('A etiqueta traz')).toHaveValue('VALOR')
    expect(campo('Dígitos do valor')).toHaveValue('6')
    expect(campo('Casas decimais')).toHaveValue('3')
    expect(screen.getByRole('switch', { name: /dígito verificador/i })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByText('2 · CCCCCC · VVVVVV (R$, 3 casas) · sem dígito verificador')).toBeInTheDocument()
    expect(screen.getByText('13 de 13 dígitos')).toBeInTheDocument()
    expect(screen.getByText(/ainda não salvou a configuração/i)).toBeInTheDocument()
  })

  it('carregando e falha ao carregar, com nova tentativa', async () => {
    buscarMock.mockRejectedValueOnce(new HttpError(500, 'Falha interna')).mockResolvedValueOnce({
      ...CONFIGURACAO_ETIQUETA_PADRAO,
      padrao: false,
    })
    renderPagina()

    expect(screen.getByText('Carregando a configuração...')).toBeInTheDocument()
    expect(await screen.findByText('Não foi possível carregar a configuração da etiqueta.')).toBeInTheDocument()
    expect(screen.queryByText(/falha interna/i)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))

    expect(await esperarFormulario()).toBeInTheDocument()
    expect(screen.queryByText(/ainda não salvou a configuração/i)).not.toBeInTheDocument()
  })

  it('o modelo pronto preenche os campos e a prévia', async () => {
    renderPagina()
    await esperarFormulario()

    fireEvent.change(campo('Modelo'), { target: { value: 'toledo-4-0-6-dv' } })

    expect(campo('Dígitos do código')).toHaveValue('4')
    expect(campo('Zeros de preenchimento')).toHaveValue('1')
    expect(campo('Casas decimais')).toHaveValue('2')
    expect(screen.getByRole('switch', { name: /dígito verificador/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText('2 · CCCC · 0 · VVVVVV (R$, 2 casas) · com dígito verificador')).toBeInTheDocument()

    fireEvent.change(campo('Modelo'), { target: { value: 'peso-6-5-dv' } })
    expect(campo('A etiqueta traz')).toHaveValue('PESO')
    expect(campo('Dígitos do peso')).toHaveValue('5')
  })

  it('a soma diferente de 13 bloqueia salvar, com a mensagem', async () => {
    renderPagina()
    await esperarFormulario()

    fireEvent.change(campo('Dígitos do código'), { target: { value: '5' } })

    expect(screen.getByText('A etiqueta precisa ter 13 dígitos no total (hoje: 12).')).toBeInTheDocument()
    expect(screen.getByText('12 de 13 dígitos')).toBeInTheDocument()
    expect(botaoSalvar()).toBeDisabled()
    expect(campo('Modelo')).toHaveValue('personalizado')

    fireEvent.change(campo('Zeros de preenchimento'), { target: { value: '1' } })
    expect(screen.queryByText(/precisa ter 13 dígitos/i)).not.toBeInTheDocument()
    expect(botaoSalvar()).toBeEnabled()
  })

  it('prefixo precisa ter 1 ou 2 dígitos', async () => {
    renderPagina()
    await esperarFormulario()

    fireEvent.change(campo('Prefixo'), { target: { value: '' } })

    expect(screen.getByText('O prefixo deve ter 1 ou 2 dígitos.')).toBeInTheDocument()
    expect(botaoSalvar()).toBeDisabled()
  })

  it('testa uma etiqueta com a configuração da tela, ainda não salva', async () => {
    testarMock.mockResolvedValue({
      leitura: { codigoProduto: 542, tipo: 'VALOR', valor: 10 },
      produto: { id: 'p-542', numero: 15, nome: 'Açúcar a granel', unidade: 'KG' },
      mensagem: 'Produto 542 · Açúcar a granel · R$ 10,00',
    })
    renderPagina()
    await esperarFormulario()
    fireEvent.change(campo('Modelo'), { target: { value: 'toledo-4-0-6-dv' } })

    fireEvent.change(campo('Número da etiqueta'), { target: { value: ' 2054200010008 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Testar' }))

    expect(await screen.findByText('Produto 542 · Açúcar a granel · R$ 10,00')).toBeInTheDocument()
    expect(testarMock).toHaveBeenCalledWith('2054200010008', MODELO_4_0_6)
    expect(salvarMock).not.toHaveBeenCalled()
  })

  it('Enter no número da etiqueta testa, e mostra quando o produto não está cadastrado', async () => {
    testarMock.mockResolvedValue({
      leitura: { codigoProduto: 542, tipo: 'VALOR', valor: 10 },
      produto: null,
      mensagem: 'Produto 542 não cadastrado',
    })
    renderPagina()
    await esperarFormulario()

    fireEvent.change(campo('Número da etiqueta'), { target: { value: '2000542010000' } })
    fireEvent.keyDown(campo('Número da etiqueta'), { key: 'Enter' })

    expect(await screen.findByText('Produto 542 não cadastrado')).toBeInTheDocument()
  })

  it('falha no teste mostra mensagem amigável', async () => {
    testarMock.mockRejectedValue(new HttpError(500, 'Falha interna'))
    renderPagina()
    await esperarFormulario()

    fireEvent.change(campo('Número da etiqueta'), { target: { value: '2000542010000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Testar' }))

    expect(await screen.findByText('Não foi possível testar a etiqueta. Tente novamente.')).toBeInTheDocument()
  })

  it('salva e avisa os produtos com código grande demais, sem bloquear', async () => {
    salvarMock.mockResolvedValue({
      configuracao: { ...MODELO_4_0_6, padrao: false },
      produtosComCodigoGrandeDemais: [{ id: 'p-1', numero: 15, nome: 'Açúcar a granel', codigo: 12345 }],
    })
    renderPagina()
    await esperarFormulario()
    fireEvent.change(campo('Modelo'), { target: { value: 'toledo-4-0-6-dv' } })

    fireEvent.click(botaoSalvar())

    expect(await screen.findByText('Configuração da etiqueta salva.')).toBeInTheDocument()
    expect(salvarMock).toHaveBeenCalledWith(MODELO_4_0_6)
    expect(
      screen.getByText('1 produto tem código com mais dígitos do que esta etiqueta comporta.'),
    ).toBeInTheDocument()
    const afetado = screen.getByRole('link', { name: /açúcar a granel/i })
    expect(afetado).toHaveAttribute('href', '/produtos/p-1')
    expect(afetado).toHaveTextContent('Nº 15 · Açúcar a granel · Cód. 12345')
  })

  it('salvar sem afetados só confirma; com dois afetados o aviso vai no plural', async () => {
    salvarMock
      .mockResolvedValueOnce({ configuracao: { ...MODELO_4_0_6, padrao: false }, produtosComCodigoGrandeDemais: [] })
      .mockResolvedValueOnce({
        configuracao: { ...CONFIGURACAO_ETIQUETA_PADRAO, padrao: false },
        produtosComCodigoGrandeDemais: [
          { id: 'p-1', numero: 15, nome: 'Açúcar', codigo: 12345 },
          { id: 'p-2', numero: 16, nome: 'Feijão', codigo: 54321 },
        ],
      })
    renderPagina()
    await esperarFormulario()

    fireEvent.change(campo('Modelo'), { target: { value: 'toledo-4-0-6-dv' } })
    fireEvent.click(botaoSalvar())
    expect(await screen.findByText('Configuração da etiqueta salva.')).toBeInTheDocument()
    expect(screen.queryByText(/comporta/)).not.toBeInTheDocument()

    fireEvent.change(campo('Modelo'), { target: { value: 'toledo-6-6' } })
    fireEvent.click(botaoSalvar())
    expect(
      await screen.findByText('2 produtos têm código com mais dígitos do que esta etiqueta comporta.'),
    ).toBeInTheDocument()
  })

  it('erro ao salvar mostra a mensagem do backend (400) sem vazar detalhe técnico', async () => {
    salvarMock.mockRejectedValueOnce(
      new HttpError(400, 'Dados invalidos.', { prefixo: 'O prefixo deve ter 1 ou 2 dígitos.' }),
    )
    renderPagina()
    await esperarFormulario()

    fireEvent.change(campo('Modelo'), { target: { value: 'toledo-4-0-6-dv' } })
    fireEvent.click(botaoSalvar())

    expect(await screen.findByRole('alert')).toHaveTextContent('O prefixo deve ter 1 ou 2 dígitos.')
  })

  it('mostra um exemplo montado com a configuração, com a legenda de cada grupo', async () => {
    renderPagina()
    await esperarFormulario()

    const previa = screen.getByText('Prévia do formato').closest('[role="status"]') as HTMLElement
    expect(previa).toHaveAttribute('aria-live', 'polite')
    expect(within(previa).getByText('000542')).toBeInTheDocument()
    expect(within(previa).getByText('010000')).toBeInTheDocument()
    expect(within(previa).getByText('código do produto')).toBeInTheDocument()
    expect(within(previa).getByText(/^→ produto 542, R\$\s10,00$/)).toBeInTheDocument()

    fireEvent.change(campo('Modelo'), { target: { value: 'toledo-4-0-6-dv' } })
    expect(within(previa).getByText('verificador')).toBeInTheDocument()
    expect(within(previa).getByText('zeros')).toBeInTheDocument()
  })

  it('Salvar só fica disponível com alterações, avisadas junto ao botão', async () => {
    salvarMock.mockResolvedValue({ configuracao: { ...MODELO_4_0_6, padrao: false }, produtosComCodigoGrandeDemais: [] })
    renderPagina()
    await esperarFormulario()
    expect(botaoSalvar()).toBeDisabled()
    expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument()

    fireEvent.change(campo('Modelo'), { target: { value: 'toledo-4-0-6-dv' } })
    expect(screen.getByText('Alterações não salvas')).toBeInTheDocument()
    expect(botaoSalvar()).toBeEnabled()

    fireEvent.click(botaoSalvar())
    expect(await screen.findByText('Configuração da etiqueta salva.')).toBeInTheDocument()
    expect(screen.queryByText('Alterações não salvas')).not.toBeInTheDocument()
    expect(botaoSalvar()).toBeDisabled()
  })

  it('sair com alterações não salvas pede confirmação', async () => {
    renderPagina()
    await esperarFormulario()
    fireEvent.change(campo('Modelo'), { target: { value: 'toledo-4-0-6-dv' } })

    fireEvent.click(within(screen.getByRole('navigation', { name: 'Catálogo' })).getByRole('link', { name: 'Produtos' }))

    const dialogo = await screen.findByRole('dialog', { name: 'Descartar alterações?' })
    expect(dialogo).toHaveTextContent('Você alterou a etiqueta da balança e ainda não salvou.')
  })

  it('trocar o formato depois de testar limpa o resultado; o teste com formato não salvo avisa', async () => {
    testarMock.mockResolvedValue({ leitura: null, produto: null, mensagem: 'Este número não é uma etiqueta neste formato.' })
    renderPagina()
    await esperarFormulario()

    fireEvent.change(campo('Número da etiqueta'), { target: { value: '2054200010008' } })
    fireEvent.click(screen.getByRole('button', { name: 'Testar' }))
    expect(await screen.findByText('Este número não é uma etiqueta neste formato.')).toBeInTheDocument()
    expect(screen.queryByText('Lido com o formato desta tela, que ainda não foi salvo.')).not.toBeInTheDocument()
    // O proximo bip do leitor substitui o numero.
    const numero = campo('Número da etiqueta') as HTMLInputElement
    await waitFor(() => expect(numero.selectionEnd).toBe(13))
    expect(numero.selectionStart).toBe(0)

    fireEvent.change(campo('Modelo'), { target: { value: 'toledo-4-0-6-dv' } })
    expect(screen.queryByText('Este número não é uma etiqueta neste formato.')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Testar' }))
    expect(await screen.findByText('Este número não é uma etiqueta neste formato.')).toBeInTheDocument()
    expect(screen.getByText('Lido com o formato desta tela, que ainda não foi salvo.')).toBeInTheDocument()
  })

  it('formato inválido desabilita Testar', async () => {
    renderPagina()
    await esperarFormulario()
    fireEvent.change(campo('Número da etiqueta'), { target: { value: '2000542010000' } })
    expect(screen.getByRole('button', { name: 'Testar' })).toBeEnabled()

    fireEvent.change(campo('Dígitos do código'), { target: { value: '5' } })

    expect(screen.getByRole('button', { name: 'Testar' })).toBeDisabled()
    expect(screen.getByText('Corrija o formato para testar.')).toBeInTheDocument()
  })

  it('ajudas dos campos, com o preenchimento acompanhando valor ou peso', async () => {
    renderPagina()
    await esperarFormulario()

    expect(campo('Prefixo')).toHaveAccessibleDescription('Primeiro dígito da etiqueta. Na Toledo, normalmente 2.')
    expect(campo('Casas decimais')).toHaveAccessibleDescription('Com 3 casas, 010000 vira R$ 10,00.')
    expect(campo('Zeros de preenchimento')).toHaveAccessibleDescription(/entre o código e o valor/)
    fireEvent.change(campo('A etiqueta traz'), { target: { value: 'PESO' } })
    expect(campo('Zeros de preenchimento')).toHaveAccessibleDescription(/entre o código e o peso/)
  })

  it('os modelos prontos têm os nomes da balança', async () => {
    renderPagina()
    await esperarFormulario()

    expect(within(campo('Modelo')).getAllByRole('option').map((opcao) => opcao.textContent)).toEqual([
      'Toledo · código 6, valor 6 (3 casas) — padrão',
      'Toledo · código 4, valor 6 (2 casas), com dígito verificador',
      'Toledo · código 5, valor 5 (2 casas), com dígito verificador',
      'Peso · código 6, peso 5 (3 casas), com dígito verificador',
      'Personalizado',
    ])
  })

  it('OPERADOR só lê: campos desabilitados, sem salvar, mas pode testar', async () => {
    definirPerfil('OPERADOR')
    testarMock.mockResolvedValue({ leitura: null, produto: null, mensagem: 'Este número não é uma etiqueta neste formato.' })
    renderPagina()
    await esperarFormulario()

    expect(screen.getByText(/somente administradores podem alterar a etiqueta/i)).toBeInTheDocument()
    expect(campo('Modelo')).toBeDisabled()
    expect(campo('Prefixo')).toBeDisabled()
    expect(campo('Dígitos do código')).toBeDisabled()
    expect(screen.getByRole('switch', { name: /dígito verificador/i })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Salvar configuração' })).not.toBeInTheDocument()

    fireEvent.change(campo('Número da etiqueta'), { target: { value: '123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Testar' }))
    await waitFor(() => expect(testarMock).toHaveBeenCalledWith('123', CONFIGURACAO_ETIQUETA_PADRAO))
    expect(await screen.findByText('Este número não é uma etiqueta neste formato.')).toBeInTheDocument()
  })
})
