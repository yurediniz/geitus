import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

import type { SecaoProduto } from '@/features/products/produtoFormulario'
import { ID_BARRA_FIXA, idDaSecao } from '@/features/products/secoes/rolagem'

function temIntersectionObserver(): boolean {
  return typeof IntersectionObserver !== 'undefined'
}

/** Folga abaixo da linha: a secao que acabou de chegar nela (ex.: rolada pelo atalho) ja conta. */
const FOLGA_DA_LINHA = 16

/** Tempo maximo da trava do spy depois de uma rolagem programatica, se o `scrollend` nao vier. */
const TEMPO_MAXIMO_DA_TRAVA = 1200

/** Onde termina a barra fixa (atalhos e avisos) no topo da tela. */
function fundoDaBarra(): number {
  const barra = document.getElementById(ID_BARRA_FIXA)
  return barra ? barra.getBoundingClientRect().bottom : 0
}

/** O `scroll-margin-top` real da secao (onde o atalho a deixa ao rolar); 0 se nao houver. */
function margemDeRolagem(elemento: HTMLElement): number {
  const margem = Number.parseFloat(window.getComputedStyle(elemento).scrollMarginTop)
  return Number.isFinite(margem) ? margem : 0
}

/**
 * Linha de ativacao da secao: abaixo da barra fixa e, no minimo, na margem de
 * rolagem da secao. Assim a secao rolada pelo atalho (que para na margem, e nao
 * colada na barra) fica ativa quando a rolagem termina.
 */
function linhaDeAtivacao(elemento: HTMLElement, barra: number): number {
  return Math.max(barra, margemDeRolagem(elemento)) + FOLGA_DA_LINHA
}

/** Se a pagina chegou ao fim (as ultimas secoes podem nunca passar pela linha). */
function noFimDaPagina(): boolean {
  return window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 2
}

/**
 * A secao ativa pela posicao na tela: a ultima cujo topo ja chegou a linha de
 * ativacao (abaixo da barra fixa e na margem de rolagem); no fim da pagina, a
 * ultima secao visivel. Antes da primeira chegar a linha, a primeira.
 */
function calcularSecaoAtiva(ordem: readonly SecaoProduto[]): SecaoProduto | null {
  const topos = ordem
    .map((secao) => ({ secao, elemento: document.getElementById(idDaSecao(secao)) }))
    .filter((item): item is { secao: SecaoProduto; elemento: HTMLElement } => item.elemento !== null)
    .map(({ secao, elemento }) => ({ secao, elemento, topo: elemento.getBoundingClientRect().top }))
  if (topos.length === 0) {
    return null
  }
  if (noFimDaPagina()) {
    const visiveis = topos.filter(({ topo }) => topo < window.innerHeight)
    return visiveis[visiveis.length - 1]?.secao ?? topos[topos.length - 1].secao
  }
  const barra = fundoDaBarra()
  const acima = topos.filter(({ elemento, topo }) => topo <= linhaDeAtivacao(elemento, barra))
  return acima[acima.length - 1]?.secao ?? topos[0].secao
}

/**
 * Scroll-spy da tela unica (spec B2 §4). O `IntersectionObserver` avisa quando
 * uma secao entra ou sai da tela, e a rolagem avisa o fim da pagina; nos dois
 * casos a secao ativa e recalculada pela posicao (`calcularSecaoAtiva`).
 *
 * `marcar` destaca a secao na hora (clique no atalho, ir ate um erro) e trava o
 * spy ate a rolagem programatica terminar (`scrollend`, com um tempo maximo de
 * reserva), para a rolagem suave nao "passar" pelos atalhos do caminho. Sem
 * `IntersectionObserver`, fica na primeira secao ate ser marcada.
 */
export function useSecaoAtiva(secoes: readonly SecaoProduto[]): [SecaoProduto, (secao: SecaoProduto) => void] {
  const [ativa, setAtiva] = useState<SecaoProduto>(secoes[0] ?? 'geral')
  const travadoRef = useRef(false)
  const liberarRef = useRef<(() => void) | null>(null)
  // A lista muda de identidade a cada render; a chave so muda com as secoes.
  const chave = secoes.join(',')

  useEffect(() => {
    if (!temIntersectionObserver()) {
      return
    }
    const ordem = chave.split(',') as SecaoProduto[]
    let quadro = 0
    const recalcular = () => {
      if (travadoRef.current) {
        return
      }
      const secao = calcularSecaoAtiva(ordem)
      if (secao) {
        setAtiva(secao)
      }
    }
    const observador = new IntersectionObserver(recalcular, { threshold: [0, 1] })
    for (const secao of ordem) {
      const elemento = document.getElementById(idDaSecao(secao))
      if (elemento) {
        observador.observe(elemento)
      }
    }
    // O fim da pagina nao cruza nenhuma secao: a rolagem tambem recalcula (um por quadro).
    const aoRolar = () => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(recalcular)
    }
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => {
      observador.disconnect()
      window.removeEventListener('scroll', aoRolar)
      cancelAnimationFrame(quadro)
    }
  }, [chave])

  useEffect(() => () => liberarRef.current?.(), [])

  const marcar = useCallback((secao: SecaoProduto) => {
    setAtiva(secao)
    liberarRef.current?.()
    travadoRef.current = true
    let timer = 0
    const liberar = () => {
      travadoRef.current = false
      window.clearTimeout(timer)
      window.removeEventListener('scrollend', liberar)
      liberarRef.current = null
    }
    timer = window.setTimeout(liberar, TEMPO_MAXIMO_DA_TRAVA)
    window.addEventListener('scrollend', liberar)
    liberarRef.current = liberar
  }, [])

  return [ativa, marcar]
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
