import { afterEach, describe, expect, it, vi } from 'vitest'

import { gerarUuid } from '@/lib/uuid'

const FORMATO_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('gerarUuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('gera UUIDs v4 diferentes', () => {
    const primeiro = gerarUuid()
    expect(primeiro).toMatch(FORMATO_V4)
    expect(gerarUuid()).not.toBe(primeiro)
  })

  it('fora de contexto seguro (sem randomUUID), monta o v4 com getRandomValues', () => {
    const original = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: original.getRandomValues.bind(original) })

    const uuid = gerarUuid()

    expect(uuid).toMatch(FORMATO_V4)
  })
})
