/**
 * IntersectionObserver de mentira para os testes (o jsdom nao tem um). Guarda
 * os elementos observados e deixa o teste dizer quando um deles entra ou sai
 * da tela, chamando o callback como o navegador faria.
 */
import { act } from '@testing-library/react'
import { vi } from 'vitest'

interface Observador {
  callback: IntersectionObserverCallback
  elementos: Set<Element>
  instancia: IntersectionObserver
}

const observadores = new Set<Observador>()

class IntersectionObserverFalso {
  readonly root = null
  readonly rootMargin: string
  readonly thresholds: readonly number[] = [0]
  private readonly registro: Observador

  constructor(callback: IntersectionObserverCallback, opcoes?: IntersectionObserverInit) {
    this.rootMargin = opcoes?.rootMargin ?? '0px'
    this.registro = { callback, elementos: new Set(), instancia: this as unknown as IntersectionObserver }
    observadores.add(this.registro)
  }

  observe(elemento: Element) {
    this.registro.elementos.add(elemento)
  }

  unobserve(elemento: Element) {
    this.registro.elementos.delete(elemento)
  }

  disconnect() {
    this.registro.elementos.clear()
    observadores.delete(this.registro)
  }

  takeRecords(): IntersectionObserverEntry[] {
    return []
  }
}

/** Troca o IntersectionObserver global pelo falso (desfeito por `vi.unstubAllGlobals`). */
export function instalarIntersectionObserverFalso() {
  observadores.clear()
  vi.stubGlobal('IntersectionObserver', IntersectionObserverFalso)
}

/** Avisa os observadores do elemento que ele entrou (ou saiu) da area observada. */
export function simularInterseccao(elemento: Element, visivel: boolean) {
  const entrada = {
    target: elemento,
    isIntersecting: visivel,
    intersectionRatio: visivel ? 1 : 0,
    time: 0,
    boundingClientRect: elemento.getBoundingClientRect(),
    intersectionRect: elemento.getBoundingClientRect(),
    rootBounds: null,
  } as IntersectionObserverEntry
  act(() => {
    for (const observador of [...observadores]) {
      if (observador.elementos.has(elemento)) {
        observador.callback([entrada], observador.instancia)
      }
    }
  })
}
