import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, renderHook, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { chaveDoCarrinho, guardarCarrinho } from '@/features/pdv/carrinho'
import { PdvPage } from '@/features/pdv/PdvPage'
import { nomeDoBloqueio, useAbaDoPdv } from '@/features/pdv/useAbaDoPdv'
import { useAuth } from '@/hooks/useAuth'
import { sessaoAtual } from '@/services/caixaService'
import { buscar as buscarConfiguracao } from '@/services/configuracaoPdvService'
import { calcular } from '@/services/pdvService'
import { sessaoDeTeste } from '@/test/fixturesCaixa'
import { calculoFalso, RACAO } from '@/test/fixturesPdv'
import { locksFalsos } from '@/test/locksFalsos'

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

const EMPRESA = 3
const USUARIO = 7
const BLOQUEIO = nomeDoBloqueio(EMPRESA, USUARIO)
const GUARDADO = guardarCarrinho(
  {
    linhas: [{ id: 'l', produto: RACAO, embalagemId: null, quantidade: 1, codigoLido: '542', etiqueta: false, desconto: null }],
    desconto: null,
    cliente: null,
  },
  EMPRESA,
  USUARIO,
)

function renderPdv() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PdvPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PDV em uma aba só por usuário', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(useAuth).mockReturnValue({
      usuario: {
        id: USUARIO,
        nome: 'Ana Souza',
        email: 'ana@mercado.com',
        perfil: 'OPERADOR',
        empresa: { id: EMPRESA, nome: 'Mercado Central', ativo: true, criadoEm: '2026-01-01T00:00:00Z', atualizadoEm: null },
      },
      token: 'token',
      estaAutenticado: true,
      carregandoSessao: false,
      login: vi.fn(),
      logout: vi.fn(),
    })
    vi.mocked(sessaoAtual).mockResolvedValue(sessaoDeTeste())
    vi.mocked(buscarConfiguracao).mockResolvedValue({
      venderSemEstoque: true,
      descontoMaximoOperador: 10,
      atualizadoPorNome: null,
      atualizadoEm: null,
    })
    vi.mocked(calcular).mockImplementation(async (carrinho) => calculoFalso(carrinho))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('a aba que pega o lock vende; ao sair, o lock é solto', async () => {
    const { unmount } = renderPdv()

    expect(await screen.findByLabelText('Código ou nome')).toBeInTheDocument()
    expect(locksFalsos.estaPreso(BLOQUEIO)).toBe(true)

    unmount()

    await waitFor(() => expect(locksFalsos.estaPreso(BLOQUEIO)).toBe(false))
  })

  it('com o PDV em outra aba: o aviso, nenhuma gravação do carrinho e "Usar aqui" só depois que a outra aba solta', async () => {
    localStorage.setItem(chaveDoCarrinho(EMPRESA, USUARIO), GUARDADO)
    const soltarOutraAba = locksFalsos.segurar(BLOQUEIO)
    const gravar = vi.spyOn(Storage.prototype, 'setItem')
    const apagar = vi.spyOn(Storage.prototype, 'removeItem')
    renderPdv()

    expect(await screen.findByText('O PDV já está aberto em outra aba deste navegador.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Código ou nome')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Usar aqui' }))
    expect(await screen.findByText('Feche a outra aba primeiro.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Código ou nome')).not.toBeInTheDocument()
    // A aba sem o lock nunca grava (nem apaga) o carrinho.
    expect(gravar).not.toHaveBeenCalledWith(chaveDoCarrinho(EMPRESA, USUARIO), expect.anything())
    expect(apagar).not.toHaveBeenCalledWith(chaveDoCarrinho(EMPRESA, USUARIO))
    expect(localStorage.getItem(chaveDoCarrinho(EMPRESA, USUARIO))).toBe(GUARDADO)

    soltarOutraAba()
    fireEvent.click(screen.getByRole('button', { name: 'Usar aqui' }))

    expect(await screen.findByLabelText('Código ou nome')).toBeInTheDocument()
    expect(locksFalsos.estaPreso(BLOQUEIO)).toBe(true)
    // O carrinho guardado aparece na aba que passou a vender.
    expect(await screen.findByText('Ração X 1kg')).toBeInTheDocument()
  })

  describe('sem navigator.locks: BroadcastChannel', () => {
    beforeEach(() => {
      Object.defineProperty(window.navigator, 'locks', { value: undefined, configurable: true })
    })

    afterEach(() => {
      Object.defineProperty(window.navigator, 'locks', { value: locksFalsos, configurable: true })
    })

    it.skipIf(typeof BroadcastChannel !== 'function')('a segunda aba descobre a primeira pelo canal', async () => {
      // Empresa e usuário só deste teste: o canal do Node é compartilhado entre os workers.
      const primeira = renderHook(() => useAbaDoPdv(91_001, 1))
      await waitFor(() => expect(primeira.result.current.situacao).toBe('NESTA_ABA'))

      const segunda = renderHook(() => useAbaDoPdv(91_001, 1))
      await waitFor(() => expect(segunda.result.current.situacao).toBe('EM_OUTRA_ABA'))

      primeira.unmount()
      segunda.result.current.usarAqui()
      await waitFor(() => expect(segunda.result.current.situacao).toBe('NESTA_ABA'))
      segunda.unmount()
    })
  })
})
