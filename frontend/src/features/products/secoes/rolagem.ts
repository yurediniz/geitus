/**
 * Rolagem e foco da tela unica do produto: os ids das secoes e o "rolar ate e
 * focar" usado pelos atalhos e pelos erros ao salvar.
 */
import type { SecaoProduto } from '@/features/products/produtoFormulario'

/** Contêiner fixo no topo (atalhos e avisos): o que fica por baixo dele nao esta visivel. */
export const ID_BARRA_FIXA = 'produto-barra-fixa'

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

function rolarAte(elemento: HTMLElement, bloco: ScrollLogicalPosition) {
  // Alguns ambientes (ex.: jsdom) nao implementam a rolagem.
  if (typeof elemento.scrollIntoView === 'function') {
    elemento.scrollIntoView({ behavior: comportamentoDaRolagem(), block: bloco })
  }
}

/**
 * Rola ate o campo (no centro da tela, longe da barra fixa) e foca nele, sem a
 * rolagem extra do foco. Texto de campo de leitura fica selecionado, para o
 * proximo bip substituir o que estava la.
 */
export function rolarEFocarCampo(elemento: HTMLElement, { selecionar = false }: { selecionar?: boolean } = {}) {
  rolarAte(elemento, 'center')
  elemento.focus({ preventScroll: true })
  if (selecionar && elemento instanceof HTMLInputElement) {
    elemento.select()
  }
}

/**
 * Rola ate a secao (o `scroll-margin` dela deixa o titulo abaixo da barra fixa)
 * e foca o titulo. Devolve false se a secao nao existe.
 */
export function rolarAteASecao(secao: SecaoProduto): boolean {
  const elemento = document.getElementById(idDaSecao(secao))
  const titulo = document.getElementById(idDoTituloDaSecao(secao))
  if (!elemento || !titulo) {
    return false
  }
  rolarAte(elemento, 'start')
  titulo.focus({ preventScroll: true })
  return true
}
