import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { Switch } from '@/components/ui/switch'

function InterruptorDeTeste({ disabled = false, aoAlternar }: { disabled?: boolean; aoAlternar?: (ligado: boolean) => void }) {
  const [ligado, setLigado] = useState(false)
  return (
    <div>
      <label id="rotulo" htmlFor="interruptor">
        Ativar promoção
      </label>
      <Switch
        id="interruptor"
        aria-labelledby="rotulo"
        checked={ligado}
        disabled={disabled}
        onCheckedChange={(valor) => {
          setLigado(valor)
          aoAlternar?.(valor)
        }}
      />
    </div>
  )
}

function interruptor(): HTMLElement {
  return screen.getByRole('switch', { name: 'Ativar promoção' })
}

describe('Switch', () => {
  it('expõe role switch com aria-checked e alterna no clique', () => {
    render(<InterruptorDeTeste />)
    expect(interruptor()).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(interruptor())
    expect(interruptor()).toHaveAttribute('aria-checked', 'true')
  })

  it('clicar no rótulo alterna', () => {
    render(<InterruptorDeTeste />)
    fireEvent.click(screen.getByText('Ativar promoção'))
    expect(interruptor()).toHaveAttribute('aria-checked', 'true')
  })

  it.each([' ', 'Enter'])('a tecla "%s" alterna (uma vez só)', (tecla) => {
    const aoAlternar = vi.fn()
    render(<InterruptorDeTeste aoAlternar={aoAlternar} />)
    expect(fireEvent.keyDown(interruptor(), { key: tecla })).toBe(false)
    fireEvent.keyUp(interruptor(), { key: tecla })
    expect(interruptor()).toHaveAttribute('aria-checked', 'true')
    expect(aoAlternar).toHaveBeenCalledTimes(1)
  })

  it('Ctrl+Enter não alterna (o formulário salva)', () => {
    render(<InterruptorDeTeste />)
    expect(fireEvent.keyDown(interruptor(), { key: 'Enter', ctrlKey: true })).toBe(true)
    expect(interruptor()).toHaveAttribute('aria-checked', 'false')
  })

  it('desabilitado não alterna', () => {
    const aoAlternar = vi.fn()
    render(<InterruptorDeTeste disabled aoAlternar={aoAlternar} />)
    expect(interruptor()).toBeDisabled()
    fireEvent.click(interruptor())
    fireEvent.keyDown(interruptor(), { key: ' ' })
    expect(aoAlternar).not.toHaveBeenCalled()
    expect(interruptor()).toHaveAttribute('aria-checked', 'false')
  })
})
