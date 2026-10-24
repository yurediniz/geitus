import { describe, it, expect } from 'vitest'

import { acaoDoAtalho, ehCodigo } from '@/features/pdv/atalhosDoPdv'

function tecla(key: string, extra: Partial<Record<'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {}) {
  return { key, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, ...extra }
}

describe('atalhosDoPdv', () => {
  it.each([
    ['F2', 'BUSCA'],
    ['F3', 'CLIENTE'],
    ['F4', 'DESCONTO_ITEM'],
    ['F6', 'POR_EM_ESPERA'],
    ['F7', 'VENDAS_EM_ESPERA'],
    ['F8', 'VENDAS_DO_CAIXA'],
    ['F10', 'PAGAMENTO'],
    ['ArrowUp', 'ANTERIOR'],
    ['ArrowDown', 'PROXIMA'],
  ])('%s -> %s', (key, acao) => {
    expect(acaoDoAtalho(tecla(key), false)).toBe(acao)
  })

  it('Shift+F4 é o desconto do total', () => {
    expect(acaoDoAtalho(tecla('F4', { shiftKey: true }), true)).toBe('DESCONTO_TOTAL')
  })

  it('+, − e Del só com o campo vazio (senão são parte do código, como 542*-1)', () => {
    expect(acaoDoAtalho(tecla('+'), true)).toBe('MAIS')
    expect(acaoDoAtalho(tecla('-'), true)).toBe('MENOS')
    expect(acaoDoAtalho(tecla('Delete'), true)).toBe('REMOVER')
    expect(acaoDoAtalho(tecla('+'), false)).toBeNull()
    expect(acaoDoAtalho(tecla('-'), false)).toBeNull()
    expect(acaoDoAtalho(tecla('Delete'), false)).toBeNull()
  })

  it('com Ctrl, Alt ou Cmd, o atalho é do navegador', () => {
    expect(acaoDoAtalho(tecla('F2', { ctrlKey: true }), true)).toBeNull()
    expect(acaoDoAtalho(tecla('F10', { altKey: true }), true)).toBeNull()
    expect(acaoDoAtalho(tecla('F4', { metaKey: true }), true)).toBeNull()
  })

  it('letras e números não são atalhos', () => {
    expect(acaoDoAtalho(tecla('a'), true)).toBeNull()
    expect(acaoDoAtalho(tecla('5'), true)).toBeNull()
    expect(acaoDoAtalho(tecla('Enter'), true)).toBeNull()
  })

  it.each([
    ['542', true],
    ['542*3', true],
    ['542*0,750', true],
    ['*3', true],
    ['542*-1', true],
    ['7891234567895', true],
    ['RP0012A', true],
    ['racao', true],
    ['ração', true],
    ['  RP0012A  ', true],
    ['ração x', false],
    ['RP 0012', false],
    ['', false],
    ['   ', false],
  ])('"%s" é código: %s', (texto, esperado) => {
    expect(ehCodigo(texto)).toBe(esperado)
  })
})
