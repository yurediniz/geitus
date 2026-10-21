import { describe, expect, it } from 'vitest'

import {
  detectarFormato,
  digitoVerificadorValido,
  ehCandidatoGs1,
  normalizarCodigo,
} from '@/lib/codigoBarras'

// Mesmos casos do CodigoBarrasTest do backend.
describe('codigoBarras', () => {
  describe('formatos validos', () => {
    it.each([
      ['7891000315507', 'EAN13'],
      ['96385074', 'EAN8'],
      ['036000291452', 'UPCA'],
    ] as const)('%s e %s com digito valido', (codigo, formato) => {
      expect(ehCandidatoGs1(codigo)).toBe(true)
      expect(digitoVerificadorValido(codigo)).toBe(true)
      expect(detectarFormato(codigo)).toBe(formato)
    })
  })

  describe('digito verificador invalido', () => {
    it.each(['7891000315508', '96385075', '036000291453'])(
      '%s e candidato GS1 com digito invalido e cai em OUTRO',
      (codigo) => {
        expect(ehCandidatoGs1(codigo)).toBe(true)
        expect(digitoVerificadorValido(codigo)).toBe(false)
        expect(detectarFormato(codigo)).toBe('OUTRO')
      },
    )
  })

  describe('formato nao reconhecido', () => {
    it.each(['12345678901234', '123456789', 'ABC123'])('%s nao e candidato GS1 e e OUTRO', (codigo) => {
      expect(ehCandidatoGs1(codigo)).toBe(false)
      expect(detectarFormato(codigo)).toBe('OUTRO')
    })
  })

  describe('normalizarCodigo', () => {
    it('remove espacos das pontas, internos e quebra de linha', () => {
      expect(normalizarCodigo(' 7891 000315507\n')).toBe('7891000315507')
    })

    it('texto so com espacos vira vazio', () => {
      expect(normalizarCodigo('  ')).toBe('')
    })
  })
})
