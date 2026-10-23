import { useEffect, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'

import type { SecaoProduto } from '@/features/products/produtoFormulario'
import { idDaSecao } from '@/features/products/secoes/rolagem'

function temIntersectionObserver(): boolean {
  return typeof IntersectionObserver !== 'undefined'
}

/**
 * Faixa da tela que define a secao "ativa": abaixo da barra de atalhos fixa e
 * acima da metade de baixo. A primeira secao (na ordem) que cruza essa faixa e a ativa.
 */
const FAIXA_DA_SECAO_ATIVA = '-80px 0px -55% 0px'

/**
 * Scroll-spy da tela unica: a secao visivel, pelo `IntersectionObserver`. O
 * setter deixa marcar a secao na hora (ex.: clique no atalho), antes de a
 * rolagem suave terminar. Sem `IntersectionObserver`, fica na primeira secao.
 */
export function useSecaoAtiva(
  secoes: readonly SecaoProduto[],
): [SecaoProduto, Dispatch<SetStateAction<SecaoProduto>>] {
  const [ativa, setAtiva] = useState<SecaoProduto>(secoes[0] ?? 'geral')
  // A lista muda de identidade a cada render; a chave so muda com as secoes.
  const chave = secoes.join(',')

  useEffect(() => {
    if (!temIntersectionObserver()) {
      return
    }
    const ordem = chave.split(',') as SecaoProduto[]
    const naFaixa = new Set<SecaoProduto>()
    const secaoDoElemento = new Map<Element, SecaoProduto>()
    const observador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          const secao = secaoDoElemento.get(entrada.target)
          if (secao === undefined) {
            continue
          }
          if (entrada.isIntersecting) {
            naFaixa.add(secao)
          } else {
            naFaixa.delete(secao)
          }
        }
        const primeira = ordem.find((secao) => naFaixa.has(secao))
        if (primeira) {
          setAtiva(primeira)
        }
      },
      { rootMargin: FAIXA_DA_SECAO_ATIVA },
    )
    for (const secao of ordem) {
      const elemento = document.getElementById(idDaSecao(secao))
      if (elemento) {
        secaoDoElemento.set(elemento, secao)
        observador.observe(elemento)
      }
    }
    return () => observador.disconnect()
  }, [chave])

  return [ativa, setAtiva]
}

/**
 * Se o elemento ja chegou perto da tela alguma vez (fica `true` depois disso).
 * Usado para so buscar o Historico quando a secao se aproxima. Sem
 * `IntersectionObserver`, e `true` desde o inicio.
 */
export function useJaApareceu(ref: RefObject<Element | null>, margem = '0px 0px 300px 0px'): boolean {
  const [apareceu, setApareceu] = useState(() => !temIntersectionObserver())

  useEffect(() => {
    const elemento = ref.current
    if (apareceu || !elemento || !temIntersectionObserver()) {
      return
    }
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) {
          setApareceu(true)
          observador.disconnect()
        }
      },
      { rootMargin: margem },
    )
    observador.observe(elemento)
    return () => observador.disconnect()
  }, [ref, margem, apareceu])

  return apareceu
}
