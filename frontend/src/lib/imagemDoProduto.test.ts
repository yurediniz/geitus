import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ErroDeImagem,
  LIMITES,
  MENSAGENS_DA_IMAGEM,
  dimensoesAjustadas,
  prepararImagem,
} from '@/lib/imagemDoProduto'

/**
 * O jsdom nao tem canvas nem createImageBitmap: os dois sao simulados. O
 * `toBlob` falso registra cada codificacao (dimensoes do canvas, tipo e
 * qualidade pedidos) e devolve um blob com o tamanho escolhido pelo teste.
 */
interface Codificacao {
  largura: number
  altura: number
  tipo: string
  qualidade: number
}

let codificacoes: Codificacao[]
let tamanhoDoBlob: (codificacao: Codificacao, indice: number) => number
let tipoDevolvido: (tipoPedido: string) => string
let contexto: {
  translate: ReturnType<typeof vi.fn>
  rotate: ReturnType<typeof vi.fn>
  drawImage: ReturnType<typeof vi.fn>
  fillRect: ReturnType<typeof vi.fn>
  fillStyle: string
  imageSmoothingEnabled: boolean
  imageSmoothingQuality: string
}
let fechar: ReturnType<typeof vi.fn>

function simularBitmap(largura: number, altura: number) {
  fechar = vi.fn()
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: largura, height: altura, close: fechar })),
  )
}

function arquivo(tipo = 'image/jpeg', tamanho = 6 * 1024 * 1024, nome = 'foto.jpg'): File {
  const file = new File(['x'], nome, { type: tipo })
  Object.defineProperty(file, 'size', { value: tamanho })
  return file
}

beforeEach(() => {
  codificacoes = []
  tamanhoDoBlob = () => 1000
  tipoDevolvido = (tipo) => tipo
  contexto = {
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => contexto as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    tipo?: string,
    qualidade?: number,
  ) {
    const codificacao = { largura: this.width, altura: this.height, tipo: tipo ?? 'image/png', qualidade: qualidade ?? 1 }
    codificacoes.push(codificacao)
    const tamanho = tamanhoDoBlob(codificacao, codificacoes.length - 1)
    callback(new Blob([new Uint8Array(tamanho)], { type: tipoDevolvido(codificacao.tipo) }))
  })
  simularBitmap(4000, 3000)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('dimensoesAjustadas', () => {
  it('reduz o maior lado ao limite, mantendo a proporcao', () => {
    expect(dimensoesAjustadas(4000, 3000, 1200)).toEqual({ largura: 1200, altura: 900 })
    expect(dimensoesAjustadas(3000, 4000, 200)).toEqual({ largura: 150, altura: 200 })
  })

  it('nao amplia imagens menores que o limite', () => {
    expect(dimensoesAjustadas(300, 200, 1200)).toEqual({ largura: 300, altura: 200 })
  })

  it('nunca chega a zero no lado menor', () => {
    expect(dimensoesAjustadas(5000, 2, 200)).toEqual({ largura: 200, altura: 1 })
  })
})

describe('prepararImagem', () => {
  it('gera a grande com ate 1200 px e a miniatura com 200 px, em WebP', async () => {
    const preparada = await prepararImagem(arquivo(), 0)

    expect(preparada).toMatchObject({ tipo: 'image/webp', largura: 1200, altura: 900 })
    expect(preparada.grande.type).toBe('image/webp')
    expect(preparada.miniatura.type).toBe('image/webp')
    expect(codificacoes).toEqual([
      { largura: 1200, altura: 900, tipo: 'image/webp', qualidade: 0.82 },
      { largura: 200, altura: 150, tipo: 'image/webp', qualidade: 0.8 },
    ])
    expect(fechar).toHaveBeenCalled()
  })

  it('respeita a orientacao da foto (EXIF) ao decodificar', async () => {
    const original = arquivo()
    await prepararImagem(original, 0)

    expect(createImageBitmap).toHaveBeenCalledWith(original, { imageOrientation: 'from-image' })
  })

  it('nao amplia uma imagem menor que os limites', async () => {
    simularBitmap(300, 200)

    const preparada = await prepararImagem(arquivo(), 0)

    expect(preparada).toMatchObject({ largura: 300, altura: 200 })
    expect(codificacoes.map(({ largura, altura }) => [largura, altura])).toEqual([
      [300, 200],
      [200, 133],
    ])
  })

  it('o giro de 90 graus troca largura e altura e roda o desenho', async () => {
    const preparada = await prepararImagem(arquivo(), 90)

    expect(preparada).toMatchObject({ largura: 900, altura: 1200 })
    expect(codificacoes.map(({ largura, altura }) => [largura, altura])).toEqual([
      [900, 1200],
      [150, 200],
    ])
    expect(contexto.rotate).toHaveBeenCalledWith(Math.PI / 2)
    // Desenhada sem girar (1200 x 900), centrada no canvas ja girado.
    expect(contexto.drawImage).toHaveBeenCalledWith(expect.anything(), -600, -450, 1200, 900)
  })

  it('o giro de 180 graus mantem as dimensoes', async () => {
    const preparada = await prepararImagem(arquivo(), 180)

    expect(preparada).toMatchObject({ largura: 1200, altura: 900 })
    expect(contexto.rotate).toHaveBeenCalledWith(Math.PI)
  })

  it('sem WebP no navegador, as duas versoes saem em JPEG com a mesma qualidade', async () => {
    // O navegador sem codificador WebP devolve PNG.
    tipoDevolvido = (tipo) => (tipo === 'image/webp' ? 'image/png' : tipo)

    const preparada = await prepararImagem(arquivo('image/png', 1000, 'foto.png'), 0)

    expect(preparada.tipo).toBe('image/jpeg')
    expect(preparada.grande.type).toBe('image/jpeg')
    expect(preparada.miniatura.type).toBe('image/jpeg')
    expect(codificacoes).toEqual([
      { largura: 1200, altura: 900, tipo: 'image/webp', qualidade: 0.82 },
      { largura: 1200, altura: 900, tipo: 'image/jpeg', qualidade: 0.82 },
      { largura: 200, altura: 150, tipo: 'image/jpeg', qualidade: 0.8 },
    ])
  })

  it('o JPEG recebe fundo branco (a transparencia do PNG nao vira preto)', async () => {
    tipoDevolvido = (tipo) => (tipo === 'image/webp' ? 'image/png' : tipo)

    await prepararImagem(arquivo('image/png', 1000, 'foto.png'), 0)

    expect(contexto.fillRect).toHaveBeenCalled()
  })

  it('acima de 400 KB, reduz a qualidade em passos ate 0,5', async () => {
    // A grande so cabe na qualidade 0,62.
    tamanhoDoBlob = ({ largura, qualidade }) => (largura === 1200 && qualidade > 0.62 ? LIMITES.grande.bytes + 1 : 1000)

    const preparada = await prepararImagem(arquivo(), 0)

    expect(preparada.grande.size).toBe(1000)
    expect(codificacoes.map(({ largura, qualidade }) => [largura, qualidade])).toEqual([
      [1200, 0.82],
      [1200, 0.72],
      [1200, 0.62],
      [200, 0.8],
    ])
  })

  it('sem caber na qualidade 0,5, reduz o lado em 15% e repete', async () => {
    // Na largura 1200 nada cabe; em 1020 cabe ja na primeira qualidade.
    tamanhoDoBlob = ({ largura }) => (largura === 1200 ? LIMITES.grande.bytes + 1 : 1000)

    const preparada = await prepararImagem(arquivo(), 0)

    expect(preparada).toMatchObject({ largura: 1020, altura: 765 })
    expect(codificacoes.map(({ largura, qualidade }) => [largura, qualidade])).toEqual([
      [1200, 0.82],
      [1200, 0.72],
      [1200, 0.62],
      [1200, 0.52],
      [1200, 0.5],
      [1020, 0.82],
      [200, 0.8],
    ])
  })

  it('a miniatura acima de 40 KB tambem reduz a qualidade', async () => {
    tamanhoDoBlob = ({ largura, qualidade }) => (largura === 200 && qualidade > 0.6 ? LIMITES.miniatura.bytes + 1 : 1000)

    await prepararImagem(arquivo(), 0)

    expect(codificacoes.filter(({ largura }) => largura === 200).map(({ qualidade }) => qualidade)).toEqual([0.8, 0.7, 0.6])
  })

  it('se nada couber, recusa com a mensagem de reducao', async () => {
    tamanhoDoBlob = () => LIMITES.grande.bytes + 1

    await expect(prepararImagem(arquivo(), 0)).rejects.toEqual(new ErroDeImagem(MENSAGENS_DA_IMAGEM.naoReduziu))
    expect(MENSAGENS_DA_IMAGEM.naoReduziu).toBe('Não foi possível reduzir esta imagem. Tente outra foto.')
    expect(fechar).toHaveBeenCalled()
  })

  it('recusa o original acima de 15 MB, sem decodificar', async () => {
    await expect(prepararImagem(arquivo('image/jpeg', 16 * 1024 * 1024), 0)).rejects.toEqual(
      new ErroDeImagem('A imagem deve ter no máximo 15 MB.'),
    )
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('aceita o original de exatamente 15 MB', async () => {
    await expect(prepararImagem(arquivo('image/jpeg', LIMITES.originalBytes), 0)).resolves.toMatchObject({
      largura: 1200,
    })
  })

  it('recusa GIF (formato fora de JPG, PNG e WebP)', async () => {
    await expect(prepararImagem(arquivo('image/gif', 1000, 'anima.gif'), 0)).rejects.toEqual(
      new ErroDeImagem('Não foi possível ler esta imagem. Use JPG, PNG ou WebP.'),
    )
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('sem tipo informado, tenta decodificar', async () => {
    await expect(prepararImagem(arquivo('', 1000, 'foto'), 0)).resolves.toMatchObject({ largura: 1200 })
  })

  it('falha ao decodificar mostra a mensagem de leitura', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new DOMException('invalida'))))

    await expect(prepararImagem(arquivo(), 0)).rejects.toEqual(
      new ErroDeImagem('Não foi possível ler esta imagem. Use JPG, PNG ou WebP.'),
    )
  })

  it('o canvas que nao codifica (toBlob nulo) mostra a mensagem de leitura', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback: BlobCallback) => callback(null))

    await expect(prepararImagem(arquivo(), 0)).rejects.toEqual(
      new ErroDeImagem('Não foi possível ler esta imagem. Use JPG, PNG ou WebP.'),
    )
  })
})
