import { useEffect, useState } from 'react'

/**
 * Devolve `valor` so depois de ele ficar `atrasoMs` sem mudar (debounce), para
 * a busca enquanto se digita nao disparar uma requisicao por letra.
 */
export function useBuscaComAtraso(valor: string, atrasoMs = 300): string {
  const [atrasado, setAtrasado] = useState(valor)

  useEffect(() => {
    const temporizador = setTimeout(() => setAtrasado(valor), atrasoMs)
    return () => clearTimeout(temporizador)
  }, [valor, atrasoMs])

  return atrasado
}
