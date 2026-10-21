import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { CampoMoeda } from '@/components/ui/campo-moeda'

/** Campo controlado como no formulario: o estado guarda a string decimal com ponto. */
function CampoDeTeste({ inicial = '', aoMudar }: { inicial?: string; aoMudar?: (valor: string) => void }) {
  const [valor, setValor] = useState(inicial)
  return (
    <div>
      <label htmlFor="preco">Preço</label>
      <CampoMoeda
        id="preco"
        value={valor}
        onChange={(novo) => {
          setValor(novo)
          aoMudar?.(novo)
        }}
      />
    </div>
  )
}

function campo(): HTMLInputElement {
  return screen.getByLabelText('Preço')
}

function digitar(teclas: string) {
  for (const tecla of teclas) {
    fireEvent.keyDown(campo(), { key: tecla })
  }
}

function colar(texto: string) {
  fireEvent.paste(campo(), { clipboardData: { getData: () => texto } })
}

describe('CampoMoeda', () => {
  it('preenche da direita para a esquerda enquanto digita, com o valor em string decimal', () => {
    const aoMudar = vi.fn()
    render(<CampoDeTeste aoMudar={aoMudar} />)

    digitar('1')
    expect(campo()).toHaveValue('0,01')
    digitar('2')
    expect(campo()).toHaveValue('0,12')
    digitar('3')
    expect(campo()).toHaveValue('1,23')
    digitar('4')
    expect(campo()).toHaveValue('12,34')
    expect(aoMudar).toHaveBeenLastCalledWith('12.34')
    digitar('56')
    expect(campo()).toHaveValue('1.234,56')
    expect(aoMudar).toHaveBeenLastCalledWith('1234.56')
  })

  it('Backspace remove o último dígito; apagar tudo deixa o campo vazio', () => {
    const aoMudar = vi.fn()
    render(<CampoDeTeste aoMudar={aoMudar} />)
    digitar('1234')

    fireEvent.keyDown(campo(), { key: 'Backspace' })
    expect(campo()).toHaveValue('1,23')
    fireEvent.keyDown(campo(), { key: 'Backspace' })
    fireEvent.keyDown(campo(), { key: 'Backspace' })
    fireEvent.keyDown(campo(), { key: 'Backspace' })
    expect(campo()).toHaveValue('')
    expect(aoMudar).toHaveBeenLastCalledWith('')
  })

  it('ignora letras e outros caracteres', () => {
    render(<CampoDeTeste />)
    digitar('1a,b.-2 ')
    expect(campo()).toHaveValue('0,12')
  })

  it('ignora o 13º dígito', () => {
    render(<CampoDeTeste />)
    digitar('1234567890123')
    expect(campo()).toHaveValue('1.234.567.890,12')
  })

  it('zeros a esquerda são descartados', () => {
    render(<CampoDeTeste />)
    digitar('0012')
    expect(campo()).toHaveValue('0,12')
  })

  it.each([
    ['12,5', '12,50'],
    ['12.50', '12,50'],
    ['1.234,56', '1.234,56'],
    ['R$ 9,90', '9,90'],
  ])('colar "%s" exibe %s (interpretado como número)', (texto, exibido) => {
    render(<CampoDeTeste />)
    colar(texto)
    expect(campo()).toHaveValue(exibido)
  })

  it('colar texto que não forma número é ignorado', () => {
    render(<CampoDeTeste inicial="9.90" />)
    colar('abc')
    expect(campo()).toHaveValue('9,90')
  })

  it('com valor 10,00, digitar 5 exibe 100,05 (Review Focus 4)', () => {
    render(<CampoDeTeste inicial="10" />)
    expect(campo()).toHaveValue('10,00')

    campo().setSelectionRange(5, 5)
    digitar('5')
    expect(campo()).toHaveValue('100,05')
  })

  it('com todo o texto selecionado, digitar 5 exibe 0,05 (Review Focus 4)', () => {
    render(<CampoDeTeste inicial="10" />)

    campo().setSelectionRange(0, campo().value.length)
    digitar('5')
    expect(campo()).toHaveValue('0,05')
  })

  it('com parte do texto selecionada, digitar substitui todos os dígitos; Backspace limpa', () => {
    render(<CampoDeTeste inicial="1234.56" />)

    campo().setSelectionRange(0, 2)
    digitar('7')
    expect(campo()).toHaveValue('0,07')

    campo().setSelectionRange(0, 4)
    fireEvent.keyDown(campo(), { key: 'Backspace' })
    expect(campo()).toHaveValue('')
  })

  it('mudança direta do texto (teclado virtual, preenchimento automático) segue os dígitos', () => {
    render(<CampoDeTeste inicial="10" />)
    fireEvent.change(campo(), { target: { value: '10,005' } })
    expect(campo()).toHaveValue('100,05')
    fireEvent.change(campo(), { target: { value: '100,0' } })
    expect(campo()).toHaveValue('10,00')
  })

  it('mostra o prefixo R$, associa o label e usa teclado numérico', () => {
    render(<CampoDeTeste inicial="9.9" />)

    expect(screen.getByText('R$')).toBeVisible()
    expect(campo()).toHaveAttribute('inputmode', 'numeric')
    expect(campo()).toHaveAttribute('type', 'text')
    expect(campo()).toHaveValue('9,90')
  })

  it('as teclas tratadas pela máscara cancelam o padrão do navegador', () => {
    render(<CampoDeTeste />)
    expect(fireEvent.keyDown(campo(), { key: '5' })).toBe(false)
    expect(fireEvent.keyDown(campo(), { key: 'a' })).toBe(false)
    expect(fireEvent.keyDown(campo(), { key: 'Backspace' })).toBe(false)
    expect(fireEvent.paste(campo(), { clipboardData: { getData: () => '1' } })).toBe(false)
  })

  it('Delete também remove o último dígito', () => {
    render(<CampoDeTeste inicial="12.34" />)
    fireEvent.keyDown(campo(), { key: 'Delete' })
    expect(campo()).toHaveValue('1,23')
  })

  it('Ctrl ou Alt + Backspace (apagar palavra) limpa o campo', () => {
    const aoMudar = vi.fn()
    render(<CampoDeTeste inicial="12.34" aoMudar={aoMudar} />)
    expect(fireEvent.keyDown(campo(), { key: 'Backspace', ctrlKey: true })).toBe(false)
    expect(campo()).toHaveValue('')
    expect(aoMudar).toHaveBeenLastCalledWith('')

    fireEvent.keyDown(campo(), { key: '7' })
    fireEvent.keyDown(campo(), { key: 'Backspace', altKey: true })
    expect(campo()).toHaveValue('')
  })

  it('digitar 0 mostra 0,00; depois 5 mostra 0,05', () => {
    const aoMudar = vi.fn()
    render(<CampoDeTeste aoMudar={aoMudar} />)
    digitar('0')
    expect(campo()).toHaveValue('0,00')
    expect(aoMudar).toHaveBeenLastCalledWith('0.00')
    digitar('5')
    expect(campo()).toHaveValue('0,05')
  })

  it('com 0,00, Backspace deixa o campo vazio', () => {
    const aoMudar = vi.fn()
    render(<CampoDeTeste inicial="0.00" aoMudar={aoMudar} />)
    fireEvent.keyDown(campo(), { key: 'Backspace' })
    expect(campo()).toHaveValue('')
    expect(aoMudar).toHaveBeenLastCalledWith('')
  })

  it('colar sobre um valor existente substitui o valor', () => {
    render(<CampoDeTeste inicial="9.90" />)
    colar('12,5')
    expect(campo()).toHaveValue('12,50')
  })

  it('o cursor volta para o fim quando é posto no meio do valor', () => {
    render(<CampoDeTeste inicial="1234.56" />)
    campo().setSelectionRange(1, 1)
    fireEvent.select(campo())
    expect(campo().selectionStart).toBe('1.234,56'.length)
    expect(campo().selectionEnd).toBe('1.234,56'.length)
  })

  describe('texto que chega sem tecla nem paste (beforeinput)', () => {
    function antesDeInserir(inputType: string, data: string | null = null): boolean {
      return fireEvent(campo(), new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true }))
    }

    it.each(['insertFromPaste', 'insertFromDrop', 'insertReplacementText'])(
      '%s é interpretado como número',
      (inputType) => {
        render(<CampoDeTeste inicial="9.90" />)
        expect(antesDeInserir(inputType, '12,5')).toBe(false)
        expect(campo()).toHaveValue('12,50')
      },
    )

    it('vários caracteres de uma vez (ditado, atalho do teclado virtual) são interpretados como número', () => {
      render(<CampoDeTeste />)
      expect(antesDeInserir('insertText', '12,5')).toBe(false)
      expect(campo()).toHaveValue('12,50')
    })

    it('um dígito entra pela direita; outro caractere é ignorado', () => {
      render(<CampoDeTeste inicial="1" />)
      expect(antesDeInserir('insertText', '5')).toBe(false)
      expect(campo()).toHaveValue('10,05')
      expect(antesDeInserir('insertText', 'x')).toBe(false)
      expect(campo()).toHaveValue('10,05')
    })

    it('apagar remove o último dígito; apagar palavra limpa', () => {
      render(<CampoDeTeste inicial="12.34" />)
      expect(antesDeInserir('deleteContentBackward')).toBe(false)
      expect(campo()).toHaveValue('1,23')
      expect(antesDeInserir('deleteWordBackward')).toBe(false)
      expect(campo()).toHaveValue('')
    })
  })

  it('vários caracteres chegando só pelo change (preenchimento automático) são interpretados como número', () => {
    render(<CampoDeTeste />)
    fireEvent.change(campo(), { target: { value: '12,5' } })
    expect(campo()).toHaveValue('12,50')
  })

  it('Enter e atalhos com Ctrl passam adiante (o formulário salva)', () => {
    render(<CampoDeTeste />)
    expect(fireEvent.keyDown(campo(), { key: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(campo(), { key: 'v', ctrlKey: true })).toBe(true)
    expect(fireEvent.keyDown(campo(), { key: 'Tab' })).toBe(true)
  })
})
