import { describe, it, expect } from 'vitest'

import {
  apenasDigitos,
  cpfValido,
  mascararCpf,
  mascararTelefone,
  normalizarDigitosTelefone,
  telefoneValido,
} from '@/lib/documentos'

describe('documentos', () => {
  it('mantem apenas os digitos', () => {
    expect(apenasDigitos('(11) 98765-4321')).toBe('11987654321')
    expect(apenasDigitos('')).toBe('')
  })

  it('mascara CPF progressivamente', () => {
    expect(mascararCpf('11144477735')).toBe('111.444.777-35')
    expect(mascararCpf('1114')).toBe('111.4')
  })

  it('mascara telefone celular e fixo', () => {
    expect(mascararTelefone('11987654321')).toBe('(11) 98765-4321')
    expect(mascararTelefone('1133224455')).toBe('(11) 3322-4455')
  })

  it('remove o codigo do pais so quando ha +55 ou 13 digitos', () => {
    expect(normalizarDigitosTelefone('+55 11 98765-4321')).toBe('11987654321')
    expect(normalizarDigitosTelefone('+55 11 3322-4455')).toBe('1133224455')
    expect(normalizarDigitosTelefone('5511987654321')).toBe('11987654321')
    expect(normalizarDigitosTelefone('11987654321')).toBe('11987654321')
    // DDD 55 (RS) sem codigo do pais permanece intacto, inclusive com digito a mais.
    expect(normalizarDigitosTelefone('55987654321')).toBe('55987654321')
    expect(normalizarDigitosTelefone('551133224455')).toBe('551133224455')
  })

  it('mascara telefone colado com codigo do pais sem tratar o 55 como DDD', () => {
    expect(mascararTelefone('+55 11 98765-4321')).toBe('(11) 98765-4321')
    expect(mascararTelefone('+55 11 3322-4455')).toBe('(11) 3322-4455')
    expect(mascararTelefone('5511987654321')).toBe('(11) 98765-4321')
    expect(mascararTelefone('11987654321')).toBe('(11) 98765-4321')
  })

  it('nao reinterpreta digito a mais em numero com DDD 55: so corta o excedente', () => {
    expect(mascararTelefone('(55) 99876-54321')).toBe('(55) 99876-5432')
    expect(mascararTelefone('551133224455')).toBe('(55) 11332-2445')
  })

  it('valida CPF pelos digitos verificadores', () => {
    expect(cpfValido('111.444.777-35')).toBe(true)
    expect(cpfValido('111.111.111-11')).toBe(false)
    expect(cpfValido('111.444.777-36')).toBe(false)
  })

  it('valida telefone com 10 ou 11 digitos e DDD entre 11 e 99', () => {
    expect(telefoneValido('(11) 98765-4321')).toBe(true)
    expect(telefoneValido('(99) 3322-4455')).toBe(true)
    expect(telefoneValido('(01) 98765-4321')).toBe(false)
    expect(telefoneValido('(10) 98765-4321')).toBe(false)
    expect(telefoneValido('(11) 9876-543')).toBe(false)
    expect(telefoneValido('+55 11 98765-4321')).toBe(true)
  })
})
