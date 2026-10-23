/**
 * Rolagem e foco da tela unica do produto: os ids das secoes e o "rolar ate e
 * focar" usado pelos atalhos e pelos erros ao salvar.
 */
import type { SecaoProduto } from '@/features/products/produtoFormulario'

export function idDaSecao(secao: SecaoProduto): string {
  return `secao-${secao}`
}

export function idDoTituloDaSecao(secao: SecaoProduto): string {
  return `secao-${secao}-titulo`
}

/** Rolagem suave, salvo quando o sistema pede menos movimento. */
function comportamentoDaRolagem(): ScrollBehavior {
  const reduzir = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return reduzir ? 'auto' : 'smooth'
}

/**
 * Rola ate o elemento e foca nele, sem a rolagem extra do foco. `centro` e para
 * campos (ficam longe da barra de atalhos fixa); `inicio`, para o titulo da secao.
 */
export function rolarEFocar(elemento: HTMLElement, posicao: 'inicio' | 'centro') {
  // Alguns ambientes (ex.: jsdom) nao implementam a rolagem.
  if (typeof elemento.scrollIntoView === 'function') {
    elemento.scrollIntoView({ behavior: comportamentoDaRolagem(), block: posicao === 'inicio' ? 'start' : 'center' })
  }
  elemento.focus({ preventScroll: true })
}
