import { useLayoutEffect, useRef } from 'react'

/** Escolhe quem recebe o foco ao fechar; recebe o elemento que tinha o foco ao abrir. */
export type DestinoFoco = (origem: HTMLElement | null) => HTMLElement | null | undefined

/**
 * Guarda o elemento com foco quando um dialogo abre e o devolve ao fechar.
 * Com `destino`, a tela decide outro alvo (ex.: a origem sumiu da lista).
 * Retorna o handler para o `onCloseAutoFocus` do DialogContent.
 */
export function useFocoDeOrigem(aberto: boolean, destino?: DestinoFoco) {
  const origemRef = useRef<HTMLElement | null>(null)

  // Layout effect: roda antes do foco automatico do dialogo (useEffect do Radix).
  useLayoutEffect(() => {
    if (aberto) {
      const ativo = document.activeElement
      origemRef.current = ativo instanceof HTMLElement && ativo !== document.body ? ativo : null
    }
  }, [aberto])

  return (event: Event) => {
    const origem = origemRef.current
    origemRef.current = null
    const alvo = destino ? destino(origem) : origem
    if (alvo?.isConnected) {
      event.preventDefault()
      alvo.focus()
    }
  }
}
