import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Modulo = typeof import('@/lib/imagemDoProduto')

/**
 * O jsdom nao tem canvas nem createImageBitmap: os dois sao simulados. O
 * `toBlob` falso registra cada codificacao (dimensoes do canvas, tipo e
 * qualidade pedidos) e devolve um blob com o tamanho escolhido pelo teste. A
 * deteccao do WebP (canvas 1x1) fica fora da lista. O modulo e importado de
 * novo a cada teste, porque guarda o resultado da deteccao.
 */
interface Codificacao {
  largura: number
  altura: number
  tipo: string
  qualidade: number
}

let lib: Modulo
let codificacoes: Codificacao[]
let deteccoesDeWebp: number
let canvasCriados: HTMLCanvasElement[]
let tamanhoDoBlob: (codificacao: Codificacao, indice: number) => number
let tipoDevolvido: (tipoPedido: string) => string
let contexto: {
  translate: ReturnType<typeof vi.fn>
  rotate: ReturnType<typeof vi.fn>
  drawImage: ReturnType<typeof vi.fn>
  fillRect: ReturnType<typeof vi.fn>
  setTransform: ReturnType<typeof vi.fn>
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

/** Os canvas das versoes (sem o 1x1 da deteccao do WebP). */
function canvasDasVersoes(): HTMLCanvasElement[] {
  return canvasCriados.filter((canvas) => canvas.dataset.deteccao === undefined)
}

beforeEach(async () => {
  vi.resetModules()
  codificacoes = []
  deteccoesDeWebp = 0
  canvasCriados = []
  tamanhoDoBlob = () => 1000
  tipoDevolvido = (tipo) => tipo
  contexto = {
    translate: vi.fn(),
    rotate: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    setTransform: vi.fn(),
    fillStyle: '',
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
  }
  const criarOriginal = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((nome: string, opcoes?: ElementCreationOptions) => {
    const elemento = criarOriginal(nome, opcoes)
    if (elemento instanceof HTMLCanvasElement) {
      canvasCriados.push(elemento)
    }
    return elemento
  }) as typeof document.createElement)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => contexto as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    callback: BlobCallback,
    tipo?: string,
    qualidade?: number,
  ) {
    const pedido = tipo ?? 'image/png'
    if (this.width === 1 && this.height === 1) {
      this.dataset.deteccao = ''
      deteccoesDeWebp++
      callback(new Blob(['x'], { type: tipoDevolvido(pedido) }))
      return
    }
    const codificacao = { largura: this.width, altura: this.height, tipo: pedido, qualidade: qualidade ?? 1 }
    codificacoes.push(codificacao)
    const tamanho = tamanhoDoBlob(codificacao, codificacoes.length - 1)
    callback(new Blob([new Uint8Array(tamanho)], { type: tipoDevolvido(pedido) }))
  })
  simularBitmap(4000, 3000)
  lib = await import('@/lib/imagemDoProduto')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('dimensoesAjustadas', () => {
  it('reduz o maior lado ao limite, mantendo a proporcao', () => {
    expect(lib.dimensoesAjustadas(4000, 3000, 1200)).toEqual({ largura: 1200, altura: 900 })
    expect(lib.dimensoesAjustadas(3000, 4000, 200)).toEqual({ largura: 150, altura: 200 })
  })

  it('nao amplia imagens menores que o limite', () => {
    expect(lib.dimensoesAjustadas(300, 200, 1200)).toEqual({ largura: 300, altura: 200 })
  })

  it('nunca chega a zero no lado menor', () => {
    expect(lib.dimensoesAjustadas(5000, 2, 200)).toEqual({ largura: 200, altura: 1 })
  })
})

describe('prepararImagem', () => {
  it('gera a grande com ate 1200 px e a miniatura com 200 px, em WebP', async () => {
    const preparada = await lib.prepararImagem(arquivo(), 0)

    expect(preparada).toMatchObject({ tipo: 'image/webp', largura: 1200, altura: 900 })
    expect(preparada.grande.type).toBe('image/webp')
    expect(preparada.miniatura.type).toBe('image/webp')
    expect(codificacoes).toEqual([
      { largura: 1200, altura: 900, tipo: 'image/webp', qualidade: 0.82 },
      { largura: 200, altura: 150, tipo: 'image/webp', qualidade: 0.8 },
    ])
    expect(fechar).toHaveBeenCalled()
  })

  it('a miniatura sai do canvas da grande (sem decodificar nem girar de novo)', async () => {
    await lib.prepararImagem(arquivo(), 90)

    expect(contexto.drawImage).toHaveBeenCalledTimes(2)
    const [fonte, x, y, largura, altura] = contexto.drawImage.mock.calls[1]
    expect(fonte).toBeInstanceOf(HTMLCanvasElement)
    expect([x, y, largura, altura]).toEqual([0, 0, 150, 200])
    expect(contexto.rotate).toHaveBeenCalledTimes(1)
  })

  it('um canvas por versao, zerado no fim', async () => {
    await lib.prepararImagem(arquivo(), 0)

    const canvas = canvasDasVersoes()
    expect(canvas).toHaveLength(2)
    for (const usado of canvas) {
      expect([usado.width, usado.height]).toEqual([0, 0])
    }
  })

  it('detecta o WebP uma vez so e reaproveita o resultado', async () => {
    await lib.prepararImagem(arquivo(), 0)
    await lib.prepararImagem(arquivo(), 90)

    expect(deteccoesDeWebp).toBe(1)
  })

  it('respeita a orientacao da foto (EXIF) ao decodificar', async () => {
    const original = arquivo()
    await lib.prepararImagem(original, 0)

    expect(createImageBitmap).toHaveBeenCalledWith(original, { imageOrientation: 'from-image' })
  })

  it('nao amplia uma imagem menor que os limites', async () => {
    simularBitmap(300, 200)

    const preparada = await lib.prepararImagem(arquivo(), 0)

    expect(preparada).toMatchObject({ largura: 300, altura: 200 })
    expect(codificacoes.map(({ largura, altura }) => [largura, altura])).toEqual([
      [300, 200],
      [200, 133],
    ])
  })

  it('o giro de 90 graus troca largura e altura e roda o desenho', async () => {
    const preparada = await lib.prepararImagem(arquivo(), 90)

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
    const preparada = await lib.prepararImagem(arquivo(), 180)

    expect(preparada).toMatchObject({ largura: 1200, altura: 900 })
    expect(contexto.rotate).toHaveBeenCalledWith(Math.PI)
  })

  it('o giro de 270 graus troca largura e altura e roda tres quartos de volta', async () => {
    const preparada = await lib.prepararImagem(arquivo(), 270)

    expect(preparada).toMatchObject({ largura: 900, altura: 1200 })
    expect(contexto.rotate).toHaveBeenCalledWith((3 * Math.PI) / 2)
  })

  it('sem WebP no navegador, vai direto para JPEG nas duas versoes, com a mesma qualidade', async () => {
    // O navegador sem codificador WebP devolve PNG.
    tipoDevolvido = (tipo) => (tipo === 'image/webp' ? 'image/png' : tipo)

    const preparada = await lib.prepararImagem(arquivo('image/png', 1000, 'foto.png'), 0)

    expect(preparada.tipo).toBe('image/jpeg')
    expect(preparada.grande.type).toBe('image/jpeg')
    expect(preparada.miniatura.type).toBe('image/jpeg')
    expect(codificacoes).toEqual([
      { largura: 1200, altura: 900, tipo: 'image/jpeg', qualidade: 0.82 },
      { largura: 200, altura: 150, tipo: 'image/jpeg', qualidade: 0.8 },
    ])
  })

  it('o JPEG recebe fundo branco (a transparencia do PNG nao vira preto)', async () => {
    tipoDevolvido = (tipo) => (tipo === 'image/webp' ? 'image/png' : tipo)

    await lib.prepararImagem(arquivo('image/png', 1000, 'foto.png'), 0)

    expect(contexto.fillRect).toHaveBeenCalled()
  })

  it('o WebP mantem a transparencia (sem fundo)', async () => {
    await lib.prepararImagem(arquivo('image/png', 1000, 'foto.png'), 0)

    expect(contexto.fillRect).not.toHaveBeenCalled()
  })

  it('acima de 400 KB, reduz a qualidade em passos ate 0,5, sem desenhar de novo', async () => {
    // A grande so cabe na qualidade 0,62.
    tamanhoDoBlob = ({ largura, qualidade }) => (largura === 1200 && qualidade > 0.62 ? lib.LIMITES.grande.bytes + 1 : 1000)

    const preparada = await lib.prepararImagem(arquivo(), 0)

    expect(preparada.grande.size).toBe(1000)
    expect(codificacoes.map(({ largura, qualidade }) => [largura, qualidade])).toEqual([
      [1200, 0.82],
      [1200, 0.72],
      [1200, 0.62],
      [200, 0.8],
    ])
    // Um desenho da grande e um da miniatura: cada qualidade so recodifica.
    expect(contexto.drawImage).toHaveBeenCalledTimes(2)
  })

  it('sem caber na qualidade 0,5, reduz o lado em 15% e repete', async () => {
    // Na largura 1200 nada cabe; em 1020 cabe ja na primeira qualidade.
    tamanhoDoBlob = ({ largura }) => (largura === 1200 ? lib.LIMITES.grande.bytes + 1 : 1000)

    const preparada = await lib.prepararImagem(arquivo(), 0)

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
    expect(contexto.drawImage).toHaveBeenCalledTimes(3)
  })

  it('a miniatura acima de 40 KB tambem reduz a qualidade', async () => {
    tamanhoDoBlob = ({ largura, qualidade }) =>
      largura === 200 && qualidade > 0.6 ? lib.LIMITES.miniatura.bytes + 1 : 1000

    await lib.prepararImagem(arquivo(), 0)

    expect(codificacoes.filter(({ largura }) => largura === 200).map(({ qualidade }) => qualidade)).toEqual([0.8, 0.7, 0.6])
  })

  it('se nada couber, recusa com a mensagem de reducao', async () => {
    tamanhoDoBlob = () => lib.LIMITES.grande.bytes + 1

    await expect(lib.prepararImagem(arquivo(), 0)).rejects.toEqual(
      new lib.ErroDeImagem('Não foi possível reduzir esta imagem. Tente outra foto.'),
    )
    expect(lib.MENSAGENS_DA_IMAGEM.naoReduziu).toBe('Não foi possível reduzir esta imagem. Tente outra foto.')
    expect(fechar).toHaveBeenCalled()
    for (const usado of canvasDasVersoes()) {
      expect([usado.width, usado.height]).toEqual([0, 0])
    }
  })

  it('recusa o original acima de 15 MB, sem decodificar', async () => {
    await expect(lib.prepararImagem(arquivo('image/jpeg', 16 * 1024 * 1024), 0)).rejects.toEqual(
      new lib.ErroDeImagem('A imagem deve ter no máximo 15 MB.'),
    )
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('aceita o original de exatamente 15 MB', async () => {
    await expect(lib.prepararImagem(arquivo('image/jpeg', lib.LIMITES.originalBytes), 0)).resolves.toMatchObject({
      largura: 1200,
    })
  })

  it('recusa GIF (formato fora de JPG, PNG e WebP)', async () => {
    await expect(lib.prepararImagem(arquivo('image/gif', 1000, 'anima.gif'), 0)).rejects.toEqual(
      new lib.ErroDeImagem('Não foi possível ler esta imagem. Use JPG, PNG ou WebP.'),
    )
    expect(createImageBitmap).not.toHaveBeenCalled()
  })

  it('sem tipo informado, tenta decodificar', async () => {
    await expect(lib.prepararImagem(arquivo('', 1000, 'foto'), 0)).resolves.toMatchObject({ largura: 1200 })
  })

  it('falha ao decodificar mostra a mensagem de leitura', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new DOMException('invalida'))))

    await expect(lib.prepararImagem(arquivo(), 0)).rejects.toEqual(
      new lib.ErroDeImagem('Não foi possível ler esta imagem. Use JPG, PNG ou WebP.'),
    )
  })

  it('o canvas que nao codifica (toBlob nulo) mostra a mensagem de leitura', async () => {
    vi.mocked(HTMLCanvasElement.prototype.toBlob).mockImplementation((callback: BlobCallback) => callback(null))

    await expect(lib.prepararImagem(arquivo(), 0)).rejects.toEqual(
      new lib.ErroDeImagem('Não foi possível ler esta imagem. Use JPG, PNG ou WebP.'),
    )
  })

  describe('decodificacao de reserva', () => {
    it('sem suporte as opcoes (TypeError), decodifica sem elas', async () => {
      fechar = vi.fn()
      const decodificar = vi.fn(async (_arquivo: Blob, opcoes?: ImageBitmapOptions) => {
        if (opcoes) {
          throw new TypeError('opcoes nao suportadas')
        }
        return { width: 4000, height: 3000, close: fechar }
      })
      vi.stubGlobal('createImageBitmap', decodificar)

      const preparada = await lib.prepararImagem(arquivo(), 0)

      expect(preparada).toMatchObject({ largura: 1200, altura: 900 })
      expect(decodificar).toHaveBeenCalledTimes(2)
      expect(decodificar.mock.calls[1]).toHaveLength(1)
      expect(fechar).toHaveBeenCalled()
    })

    describe('pelo HTMLImageElement', () => {
      let decode: ReturnType<typeof vi.fn>

      beforeEach(() => {
        decode = vi.fn(async () => undefined)
        Object.defineProperty(HTMLImageElement.prototype, 'decode', { configurable: true, value: decode })
        Object.defineProperty(HTMLImageElement.prototype, 'naturalWidth', { configurable: true, get: () => 4000 })
        Object.defineProperty(HTMLImageElement.prototype, 'naturalHeight', { configurable: true, get: () => 3000 })
        vi.stubGlobal(
          'URL',
          Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:original'), revokeObjectURL: vi.fn() }),
        )
      })

      afterEach(() => {
        for (const propriedade of ['decode', 'naturalWidth', 'naturalHeight']) {
          Reflect.deleteProperty(HTMLImageElement.prototype, propriedade)
        }
      })

      it('sem createImageBitmap, decodifica pela imagem e desenha dela', async () => {
        vi.stubGlobal('createImageBitmap', undefined)

        const preparada = await lib.prepararImagem(arquivo(), 0)

        expect(preparada).toMatchObject({ largura: 1200, altura: 900 })
        expect(decode).toHaveBeenCalled()
        expect(contexto.drawImage.mock.calls[0][0]).toBeInstanceOf(HTMLImageElement)
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original')
      })

      it('createImageBitmap falhando com e sem opcoes, tenta a imagem por ultimo', async () => {
        vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new TypeError('nao suportado'))))

        await expect(lib.prepararImagem(arquivo(), 0)).resolves.toMatchObject({ largura: 1200 })
        expect(decode).toHaveBeenCalled()
      })

      it('a imagem que nao decodifica mostra a mensagem de leitura', async () => {
        vi.stubGlobal('createImageBitmap', undefined)
        decode.mockRejectedValue(new DOMException('invalida'))

        await expect(lib.prepararImagem(arquivo(), 0)).rejects.toEqual(
          new lib.ErroDeImagem('Não foi possível ler esta imagem. Use JPG, PNG ou WebP.'),
        )
        expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:original')
      })
    })
  })
})
