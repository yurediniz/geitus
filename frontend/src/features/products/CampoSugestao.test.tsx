import { useState } from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { CampoSugestao } from '@/features/products/CampoSugestao'
import { listarSugestoes } from '@/services/produtoService'

vi.mock('@/services/produtoService', () => ({
  listarSugestoes: vi.fn(),
}))

const listarSugestoesMock = vi.mocked(listarSugestoes)

function CampoComEstado({ inicial = '', onEnviar }: { inicial?: string; onEnviar?: () => void }) {
  const [valor, setValor] = useState(inicial)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onEnviar?.()
      }}
    >
      <CampoSugestao id="marca" rotulo="Marca (opcional)" campo="marca" valor={valor} onChange={setValor} maxLength={100} />
      <span hidden data-testid="valor">{valor}</span>
    </form>
  )
}

function renderCampo(props: { inicial?: string; onEnviar?: () => void } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <CampoComEstado {...props} />
    </QueryClientProvider>,
  )
}

function campo(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Marca (opcional)' })
}

describe('CampoSugestao', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    listarSugestoesMock.mockImplementation(async (_campo, termo) =>
      ['Golden', 'Premier', 'GranPlus'].filter((marca) => marca.toLowerCase().includes(termo.trim().toLowerCase())),
    )
  })

  it('ao focar, sugere os mais usados (sem termo) num listbox ligado ao combobox', async () => {
    renderCampo()

    fireEvent.focus(campo())

    const lista = await screen.findByRole('listbox', { name: 'Sugestões de marca' })
    expect(listarSugestoesMock).toHaveBeenCalledWith('marca', '')
    expect(campo()).toHaveAttribute('aria-expanded', 'true')
    expect(campo()).toHaveAttribute('aria-controls', lista.id)
    expect(screen.getAllByRole('option').map((opcao) => opcao.textContent)).toEqual(['Golden', 'Premier', 'GranPlus'])
  })

  it('busca pelo termo digitado depois da pausa (debounce) e escolhe com o mouse', async () => {
    renderCampo()

    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: 'g' } })
    fireEvent.change(campo(), { target: { value: 'go' } })
    fireEvent.change(campo(), { target: { value: 'gol' } })

    await waitFor(() => expect(listarSugestoesMock).toHaveBeenCalledWith('marca', 'gol'))
    // Os termos intermediarios nao viram requisicao.
    expect(listarSugestoesMock).not.toHaveBeenCalledWith('marca', 'go')
    const opcao = await screen.findByRole('option', { name: 'Golden' })

    fireEvent.mouseDown(opcao)

    expect(screen.getByTestId('valor')).toHaveTextContent('Golden')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(campo()).toHaveAttribute('aria-expanded', 'false')
  })

  it('teclado: setas destacam (aria-activedescendant) e Enter escolhe sem enviar o formulário', async () => {
    const onEnviar = vi.fn()
    renderCampo({ onEnviar })

    fireEvent.focus(campo())
    await screen.findByRole('option', { name: 'Golden' })

    fireEvent.keyDown(campo(), { key: 'ArrowDown' })
    fireEvent.keyDown(campo(), { key: 'ArrowDown' })
    const premier = screen.getByRole('option', { name: 'Premier' })
    expect(premier).toHaveAttribute('aria-selected', 'true')
    expect(campo()).toHaveAttribute('aria-activedescendant', premier.id)

    fireEvent.keyDown(campo(), { key: 'Enter' })

    expect(screen.getByTestId('valor')).toHaveTextContent('Premier')
    expect(onEnviar).not.toHaveBeenCalled()
  })

  it('rola a lista até a opção destacada pelo teclado', async () => {
    const rolar = vi.fn()
    const original = Element.prototype.scrollIntoView
    Element.prototype.scrollIntoView = rolar
    try {
      renderCampo()
      fireEvent.focus(campo())
      await screen.findByRole('option', { name: 'Golden' })

      fireEvent.keyDown(campo(), { key: 'ArrowUp' })

      const granplus = screen.getByRole('option', { name: 'GranPlus' })
      expect(granplus).toHaveAttribute('aria-selected', 'true')
      expect(rolar).toHaveBeenCalledWith({ block: 'nearest' })
      expect(rolar.mock.contexts.at(-1)).toBe(granplus)
    } finally {
      Element.prototype.scrollIntoView = original
    }
  })

  it('com a lista aberta e nada destacado, Enter só fecha a lista (não envia)', async () => {
    renderCampo()

    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: 'Pre' } })
    await screen.findByRole('option', { name: 'Premier' })

    // fireEvent devolve false quando o handler chamou preventDefault (sem envio implicito).
    expect(fireEvent.keyDown(campo(), { key: 'Enter' })).toBe(false)

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(campo()).toHaveValue('Pre')

    // Lista fechada: Enter segue o padrao do navegador.
    expect(fireEvent.keyDown(campo(), { key: 'Enter' })).toBe(true)
  })

  it('Esc fecha a lista e mantém o texto', async () => {
    renderCampo()

    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: 'Pre' } })
    await screen.findByRole('option', { name: 'Premier' })

    fireEvent.keyDown(campo(), { key: 'Escape' })

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(campo()).toHaveValue('Pre')
  })

  it('aceita valor novo, que não está nas sugestões', async () => {
    renderCampo()

    fireEvent.focus(campo())
    fireEvent.change(campo(), { target: { value: 'Marca Nova' } })
    await waitFor(() => expect(listarSugestoesMock).toHaveBeenCalledWith('marca', 'Marca Nova'))
    fireEvent.blur(campo())

    expect(screen.getByTestId('valor')).toHaveTextContent('Marca Nova')
    expect(screen.queryByRole('option')).not.toBeInTheDocument()
  })

  it('não repete como sugestão o valor já digitado igual', async () => {
    renderCampo({ inicial: 'Golden' })

    fireEvent.focus(campo())

    await waitFor(() => expect(listarSugestoesMock).toHaveBeenCalledWith('marca', 'Golden'))
    expect(screen.queryByRole('option', { name: 'Golden' })).not.toBeInTheDocument()
  })
})
