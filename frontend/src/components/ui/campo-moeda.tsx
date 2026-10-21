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

/** `beforeinput` que trazem um texto inteiro (nao um digito digitado): interpretado como numero. */
const INSERCOES_DE_TEXTO: ReadonlySet<string> = new Set(['insertFromPaste', 'insertFromDrop', 'insertReplacementText'])
/** Apagar so o ultimo digito; os demais `delete*` (palavra, linha, recorte) limpam o campo. */
const APAGAR_UM: ReadonlySet<string> = new Set(['deleteContentBackward', 'deleteContentForward'])

/**
 * Campo de dinheiro pt-BR com prefixo "R$" que preenche da direita para a
 * esquerda enquanto se digita (1 -> 0,01; 1234 -> 12,34):
 * - cada digito entra pela direita e o Backspace tira o ultimo; outros
 *   caracteres sao ignorados; com texto selecionado, digitar substitui tudo;
 * - texto inserido de uma vez (colar, arrastar, ditado) e interpretado como
 *   numero ("12,5" -> 12,50) e substitui o valor;
 * - o cursor fica sempre no fim.
 * Tres camadas, a primeira que trata cancela as seguintes: `keydown` e `paste`
 * (teclado fisico), `beforeinput` (teclado virtual, arrastar, ditado) e, como
 * ultimo recurso, o `change` (preenchimento automatico ou `beforeinput` que o
 * navegador nao deixa cancelar).
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

  /** Digitos sobre os quais a edicao age: com texto selecionado, nenhum (a edicao substitui tudo). */
  const digitosParaEditar = (input: HTMLInputElement) =>
    input.selectionStart !== input.selectionEnd ? '' : valorParaDigitos(value)

  const inserirDigito = (input: HTMLInputElement, digito: string) => aplicarDigitos(digitosParaEditar(input) + digito)

  const apagar = (input: HTMLInputElement, tudo: boolean) =>
    aplicarDigitos(tudo ? '' : digitosParaEditar(input).slice(0, -1))

  /** Texto inteiro (colado, arrastado, ditado): vira o valor; se nao formar numero, e ignorado. */
  const inserirTexto = (texto: string) => {
    const valor = interpretarValorColado(texto)
    if (valor !== null && valor !== value) {
      onChange(valor)
    }
  }

  const aoTeclar = (event: React.KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) {
      return
    }
    const input = event.currentTarget
    const comModificador = event.ctrlKey || event.metaKey || event.altKey
    if (event.key === 'Backspace' || event.key === 'Delete') {
      event.preventDefault()
      // Com Ctrl/Alt/Cmd e "apagar palavra": numa mascara, o valor inteiro.
      apagar(input, comModificador)
      return
    }
    // Atalhos (Ctrl+V, Ctrl+Enter, Ctrl+A...) seguem o navegador e o formulario.
    if (comModificador) {
      return
    }
    if (/^\d$/.test(event.key)) {
      event.preventDefault()
      inserirDigito(input, event.key)
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
    inserirTexto(event.clipboardData.getData('text'))
  }

  // `beforeinput` nativo: o `onBeforeInput` do React nao traz o `inputType`.
  // Reinscrito a cada render para ler o valor atual.
  React.useEffect(() => {
    const input = inputRef.current
    if (!input) {
      return
    }
    const aoAntesDeInserir = (event: InputEvent) => {
      // Composicao (IME) nao pode ser cancelada em todos os navegadores: fica com o `change`.
      if (!event.cancelable || event.inputType === 'insertCompositionText') {
        return
      }
      if (event.inputType.startsWith('delete')) {
        event.preventDefault()
        apagar(input, !APAGAR_UM.has(event.inputType))
        return
      }
      const texto = event.data ?? event.dataTransfer?.getData('text') ?? ''
      if (INSERCOES_DE_TEXTO.has(event.inputType) || texto.length > 1) {
        event.preventDefault()
        inserirTexto(texto)
      } else if (event.inputType === 'insertText') {
        event.preventDefault()
        if (/^\d$/.test(texto)) {
          inserirDigito(input, texto)
        }
      }
    }
    input.addEventListener('beforeinput', aoAntesDeInserir)
    return () => input.removeEventListener('beforeinput', aoAntesDeInserir)
  })

  /**
   * Ultimo recurso: um caractere a mais ou a menos e digitacao (segue os
   * digitos do texto novo); um texto inteiro novo (preenchimento automatico) e
   * interpretado como numero, ou pelos digitos se nao formar numero.
   */
  const aoMudar = (event: React.ChangeEvent<HTMLInputElement>) => {
    const texto = event.target.value
    const digitacao = texto.length <= exibido.length + 1
    const valorDoTexto = digitacao ? null : interpretarValorColado(texto)
    if (valorDoTexto === null) {
      aplicarDigitos(apenasDigitos(texto))
    } else if (valorDoTexto !== value) {
      onChange(valorDoTexto)
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
        onChange={aoMudar}
        onKeyDown={aoTeclar}
        onPaste={aoColar}
        onSelect={aoSelecionar}
        className={cn('pl-9 tabular-nums', className)}
      />
    </div>
  )
}

export { CampoMoeda }
