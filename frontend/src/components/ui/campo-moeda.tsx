import * as React from 'react'

import { Input } from '@/components/ui/input'
import { apenasDigitos } from '@/lib/documentos'
import {
  MAXIMO_DIGITOS_MOEDA,
  digitosParaValor,
  formatarMoedaDigitando,
  interpretarValorColado,
  valorParaDigitos,
} from '@/lib/moeda'
import { cn } from '@/lib/utils'

export interface CampoMoedaProps
  extends Omit<React.ComponentProps<'input'>, 'value' | 'defaultValue' | 'onChange' | 'type' | 'inputMode'> {
  /** String decimal com ponto ("12.34"), ou '' sem valor. */
  value: string
  onChange: (valor: string) => void
}

/**
 * Campo de dinheiro pt-BR com prefixo "R$" que preenche da direita para a
 * esquerda enquanto se digita (1 -> 0,01; 1234 -> 12,34):
 * - cada digito entra pela direita e o Backspace tira o ultimo; outros
 *   caracteres sao ignorados; com texto selecionado, digitar substitui tudo;
 * - colar interpreta o texto como numero ("12,5" -> 12,50);
 * - o cursor fica sempre no fim.
 * As teclas sao tratadas no `keydown`; o `change` cobre o que chega sem tecla
 * (teclado virtual, preenchimento automatico), pelos digitos do texto novo.
 */
function CampoMoeda({
  value,
  onChange,
  className,
  ref,
  onKeyDown,
  onPaste,
  onSelect,
  placeholder = '0,00',
  ...props
}: CampoMoedaProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null)
  const exibido = formatarMoedaDigitando(value)

  const atribuirRef = React.useCallback(
    (elemento: HTMLInputElement | null) => {
      inputRef.current = elemento
      if (typeof ref === 'function') {
        ref(elemento)
      } else if (ref) {
        ref.current = elemento
      }
    },
    [ref],
  )

  // Depois de cada mudanca, o cursor volta para o fim (o digito entra pela direita).
  React.useLayoutEffect(() => {
    const input = inputRef.current
    if (input && document.activeElement === input) {
      input.setSelectionRange(input.value.length, input.value.length)
    }
  }, [exibido])

  /** Aplica os digitos novos; alem do limite de 12 a mudanca e ignorada. */
  const aplicarDigitos = (digitos: string) => {
    const significativos = digitos.replace(/^0+/, '')
    if (significativos.length > MAXIMO_DIGITOS_MOEDA) {
      return
    }
    const novo = digitosParaValor(digitos)
    if (novo !== value) {
      onChange(novo)
    }
  }

  const aoTeclar = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event)
    // Atalhos (Ctrl+V, Ctrl+Enter, Ctrl+A...) seguem o navegador e o formulario.
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) {
      return
    }
    const input = event.currentTarget
    const temSelecao = input.selectionStart !== input.selectionEnd
    const atuais = temSelecao ? '' : valorParaDigitos(value)
    if (/^\d$/.test(event.key)) {
      event.preventDefault()
      aplicarDigitos(atuais + event.key)
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      aplicarDigitos(atuais.slice(0, -1))
    } else if (event.key.length === 1) {
      // Letras, sinais e separadores: a mascara ja poe a virgula e os pontos.
      event.preventDefault()
    }
  }

  const aoColar = (event: React.ClipboardEvent<HTMLInputElement>) => {
    onPaste?.(event)
    if (event.defaultPrevented) {
      return
    }
    event.preventDefault()
    const colado = interpretarValorColado(event.clipboardData.getData('text'))
    if (colado !== null && colado !== value) {
      onChange(colado)
    }
  }

  // Clique ou seta no meio do valor: o cursor volta para o fim. Selecao (ex.: Ctrl+A) fica.
  const aoSelecionar = (event: React.SyntheticEvent<HTMLInputElement>) => {
    onSelect?.(event)
    const input = event.currentTarget
    const fim = input.value.length
    if (input.selectionStart === input.selectionEnd && input.selectionStart !== fim) {
      input.setSelectionRange(fim, fim)
    }
  }

  return (
    <div className="relative">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground"
      >
        R$
      </span>
      <Input
        {...props}
        ref={atribuirRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        value={exibido}
        onChange={(event) => aplicarDigitos(apenasDigitos(event.target.value))}
        onKeyDown={aoTeclar}
        onPaste={aoColar}
        onSelect={aoSelecionar}
        className={cn('pl-9 tabular-nums', className)}
      />
    </div>
  )
}

export { CampoMoeda }
