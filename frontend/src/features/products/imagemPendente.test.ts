import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import {
  esquecerImagemNaoEnviada,
  guardarImagemNaoEnviada,
  imagemNaoEnviadaDaNavegacao,
  proximaRotacao,
  temMarcaDeImagemNaoEnviada,
  useImagemDoProduto,
  useUrlDoBlob,
  type ImagemNova,
} from '@/features/products/imagemPendente'
import { prepararImagem, type ImagemPreparada } from '@/lib/imagemDoProduto'
import { clearStoredToken } from '@/services/tokenStorage'

vi.mock('@/lib/imagemDoProduto', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/imagemDoProduto')>()
  return { ...original, prepararImagem: vi.fn() }
})

vi.mock('@/services/produtoService', () => ({
  baixarImagemDoProduto: vi.fn(),
}))

const ID = '0b9d2f3a-1c4e-4a5b-8c6d-7e8f9a0b1c2d'

function preparada(): ImagemPreparada {
  return {
    grande: new Blob(['g'], { type: 'image/webp' }),
    miniatura: new Blob(['m'], { type: 'image/webp' }),
    tipo: 'image/webp',
    largura: 1200,
    altura: 900,
  }
}

function imagemNova(): ImagemNova {
  return { tipo: 'nova', arquivo: new File(['x'], 'foto.jpg', { type: 'image/jpeg' }), rotacao: 0, preparada: preparada() }
}

describe('proximaRotacao', () => {
  it('soma 90 graus e volta a 0 depois de 270', () => {
    expect(proximaRotacao(0)).toBe(90)
    expect(proximaRotacao(90)).toBe(180)
    expect(proximaRotacao(180)).toBe(270)
    expect(proximaRotacao(270)).toBe(0)
  })
})

describe('imagem nao enviada (cadastro novo -> edicao)', () => {
  afterEach(() => {
    esquecerImagemNaoEnviada(ID)
  })

  it('a marca da rota so vale com imagemNaoEnviada === true', () => {
    expect(temMarcaDeImagemNaoEnviada({ voltarPara: '/produtos', imagemNaoEnviada: true })).toBe(true)
    for (const estado of [null, undefined, 'texto', 1, {}, { imagemNaoEnviada: 'true' }, { imagemNaoEnviada: false }]) {
      expect(temMarcaDeImagemNaoEnviada(estado)).toBe(false)
    }
  })

  it('a imagem fica na memoria, por produto, e nao no estado da rota', () => {
    const imagem = imagemNova()
    guardarImagemNaoEnviada(ID, imagem)

    expect(imagemNaoEnviadaDaNavegacao({ imagemNaoEnviada: true }, ID)).toBe(imagem)
    expect(imagemNaoEnviadaDaNavegacao({ imagemNaoEnviada: true }, 'outro-produto')).toBeNull()
  })

  it('sem a marca na rota (estado invalido ou de outra navegacao), nao ha pendencia', () => {
    guardarImagemNaoEnviada(ID, imagemNova())

    for (const estado of [null, 'texto', { voltarPara: '/produtos' }, { imagemNaoEnviada: 'sim' }]) {
      expect(imagemNaoEnviadaDaNavegacao(estado, ID)).toBeNull()
    }
  })

  it('com a marca mas sem a imagem na memoria (recarregou a pagina), nao ha pendencia', () => {
    expect(imagemNaoEnviadaDaNavegacao({ imagemNaoEnviada: true }, ID)).toBeNull()
  })

  it('o fim da sessao (logout ou 401) apaga as imagens guardadas', () => {
    guardarImagemNaoEnviada(ID, imagemNova())

    clearStoredToken()

    expect(imagemNaoEnviadaDaNavegacao({ imagemNaoEnviada: true }, ID)).toBeNull()
  })

  it('esquecer apaga a imagem guardada', () => {
    guardarImagemNaoEnviada(ID, imagemNova())

    esquecerImagemNaoEnviada(ID)

    expect(imagemNaoEnviadaDaNavegacao({ imagemNaoEnviada: true }, ID)).toBeNull()
  })
})

describe('useUrlDoBlob', () => {
  beforeEach(() => {
    let urls = 0
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: vi.fn(() => `blob:url-${++urls}`), revokeObjectURL: vi.fn() }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('cria a URL do blob, troca e revoga a anterior, e revoga ao desmontar', async () => {
    const primeiro = new Blob(['1'])
    const segundo = new Blob(['2'])
    const { result, rerender, unmount } = renderHook(({ blob }: { blob: Blob | null }) => useUrlDoBlob(blob), {
      initialProps: { blob: primeiro as Blob | null },
    })
    await waitFor(() => expect(result.current).toBe('blob:url-1'))

    rerender({ blob: segundo })
    await waitFor(() => expect(result.current).toBe('blob:url-2'))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-1')

    unmount()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-2')
  })

  it('sem blob, sem URL', () => {
    const { result } = renderHook(() => useUrlDoBlob(null))

    expect(result.current).toBeNull()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})

describe('useImagemDoProduto: ultimo resultado (para o anuncio do quadro)', () => {
  beforeEach(() => {
    vi.mocked(prepararImagem).mockResolvedValue(preparada())
  })

  it('"pronta" depois de preparar, "removida" depois de remover e nada ao descartar', async () => {
    const gravada = { miniaturaUrl: '/m', grandeUrl: '/g', largura: 1, altura: 1, atualizadaEm: 'x' }
    const { result } = renderHook(() => useImagemDoProduto(gravada))
    expect(result.current.ultimoResultado).toBeNull()

    act(() => result.current.escolherArquivo(new File(['x'], 'foto.jpg', { type: 'image/jpeg' })))
    await waitFor(() => expect(result.current.ultimoResultado).toBe('pronta'))

    act(() => result.current.remover())
    expect(result.current.ultimoResultado).toBe('removida')
    expect(result.current.pendente).toEqual({ tipo: 'remover' })

    act(() => result.current.descartar())
    expect(result.current.ultimoResultado).toBeNull()
  })

  it('a imagem inicial (vinda da falha do cadastro) nao anuncia "pronta"', () => {
    const { result } = renderHook(() => useImagemDoProduto(null, imagemNova()))

    expect(result.current.pendente.tipo).toBe('nova')
    expect(result.current.ultimoResultado).toBeNull()
  })
})
