/**
 * Regras de codigo de barras (EAN-8, UPC-A, EAN-13 e outros formatos).
 *
 * Espelham a regra pura `CodigoBarras` do backend (mesmos casos de teste):
 * a tela avisa e bloqueia o mesmo que a API rejeita, antes do envio.
 */
import type { FormatoCodigoBarras } from '@/types/produto'

/** Tamanhos (so digitos) que podem ser EAN-8, UPC-A ou EAN-13. */
const FORMATO_POR_TAMANHO: Readonly<Record<number, FormatoCodigoBarras>> = {
  8: 'EAN8',
  12: 'UPCA',
  13: 'EAN13',
}

/** Remove todo espaco em branco (pontas, internos e quebras de linha do leitor). */
export function normalizarCodigo(valor: string): string {
  return valor.replace(/\s/g, '')
}

/** Somente digitos e tamanho 8, 12 ou 13: precisa de digito verificador GS1 valido. */
export function ehCandidatoGs1(codigo: string): boolean {
  return /^\d+$/.test(codigo) && codigo.length in FORMATO_POR_TAMANHO
}

/**
 * Digito verificador GS1 (mod 10): da direita para a esquerda, excluindo o
 * verificador, os pesos alternam 3 e 1; o verificador completa a soma ate o
 * proximo multiplo de 10.
 */
export function digitoVerificadorValido(digitos: string): boolean {
  if (!/^\d{2,}$/.test(digitos)) {
    return false
  }
  const corpo = digitos.slice(0, -1)
  let soma = 0
  for (let i = 0; i < corpo.length; i++) {
    const digito = Number(corpo[corpo.length - 1 - i])
    soma += digito * (i % 2 === 0 ? 3 : 1)
  }
  const esperado = (10 - (soma % 10)) % 10
  return esperado === Number(digitos[digitos.length - 1])
}

/**
 * Formato pelo conteudo: candidato GS1 com digito valido vira EAN8/UPCA/EAN13;
 * qualquer outro caso (inclusive candidato com digito invalido) e `OUTRO`.
 */
export function detectarFormato(codigo: string): FormatoCodigoBarras {
  if (ehCandidatoGs1(codigo) && digitoVerificadorValido(codigo)) {
    return FORMATO_POR_TAMANHO[codigo.length] ?? 'OUTRO'
  }
  return 'OUTRO'
}
