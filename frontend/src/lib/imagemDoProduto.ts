/**
 * Imagem do produto no navegador (spec Fase F §2): decodifica a foto (com a
 * orientacao do EXIF), aplica o giro e gera as duas versoes que sobem para a
 * API, a grande e a miniatura, em WebP (ou JPEG, se o navegador nao codifica
 * WebP), dentro dos tetos de tamanho. O servidor nao recomprime: os limites aqui sao os mesmos dele.
 */

/** Limites iguais aos do backend (lado maximo em px e tamanho em bytes). */
export const LIMITES = {
  grande: { lado: 1200, bytes: 409_600 },
  miniatura: { lado: 200, bytes: 40_960 },
  originalBytes: 15 * 1024 * 1024,
} as const

/** Mensagens da spec §2. */
export const MENSAGENS_DA_IMAGEM = {
  ilegivel: 'Não foi possível ler esta imagem. Use JPG, PNG ou WebP.',
  grandeDemais: 'A imagem deve ter no máximo 15 MB.',
  naoReduziu: 'Não foi possível reduzir esta imagem. Tente outra foto.',
} as const

/** Giro aplicado antes de salvar, no sentido horario. */
export type RotacaoDaImagem = 0 | 90 | 180 | 270

export type TipoDaImagemPreparada = 'image/webp' | 'image/jpeg'

export interface ImagemPreparada {
  grande: Blob
  miniatura: Blob
  /** O mesmo para as duas versoes. */
  tipo: TipoDaImagemPreparada
  /** Dimensoes da grande. */
  largura: number
  altura: number
}

/** Falha esperada ao preparar a imagem, com a mensagem para o usuario. */
export class ErroDeImagem extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ErroDeImagem'
  }
}

const TIPOS_ACEITOS: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp'])

/** Qualidade inicial de cada versao e o piso da reducao. */
const QUALIDADE = { grande: 0.82, miniatura: 0.8, minima: 0.5, passo: 0.1 } as const

/** Cada reducao de dimensao tira 15% do lado; o numero de reducoes e limitado. */
const FATOR_DE_REDUCAO_DO_LADO = 0.85
const MAXIMO_DE_REDUCOES_DO_LADO = 8

/** Dimensoes com o maior lado ate `ladoMaximo`, na mesma proporcao e sem ampliar. */
export function dimensoesAjustadas(
  largura: number,
  altura: number,
  ladoMaximo: number,
): { largura: number; altura: number } {
  const maior = Math.max(largura, altura)
  if (maior <= ladoMaximo) {
    return { largura, altura }
  }
  const escala = ladoMaximo / maior
  return {
    largura: Math.max(1, Math.round(largura * escala)),
    altura: Math.max(1, Math.round(altura * escala)),
  }
}

/** Qualidades tentadas: da inicial ate 0,5, em passos de 0,1 (arredondadas, sem ruido de ponto flutuante). */
function qualidadesAPartirDe(inicial: number): number[] {
  const qualidades: number[] = []
  for (let qualidade = inicial; qualidade > QUALIDADE.minima; qualidade = Math.round((qualidade - QUALIDADE.passo) * 100) / 100) {
    qualidades.push(qualidade)
  }
  qualidades.push(QUALIDADE.minima)
  return qualidades
}

function codificar(canvas: HTMLCanvasElement, tipo: string, qualidade?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ErroDeImagem(MENSAGENS_DA_IMAGEM.ilegivel))),
      tipo,
      qualidade,
    )
  })
}

/** Deteccao do codificador WebP, feita uma vez por carga da pagina (canvas 1x1). */
let suporteAoWebp: Promise<boolean> | null = null

function suportaWebp(): Promise<boolean> {
  suporteAoWebp ??= (async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    try {
      // O navegador sem codificador WebP devolve outro formato (PNG).
      return (await codificar(canvas, 'image/webp')).type === 'image/webp'
    } catch {
      return false
    } finally {
      canvas.width = 0
      canvas.height = 0
    }
  })()
  return suporteAoWebp
}

/** A foto decodificada: o que se desenha e as dimensoes ja na orientacao do EXIF. */
interface FotoDecodificada {
  fonte: CanvasImageSource
  largura: number
  altura: number
  liberar: () => void
}

function doBitmap(bitmap: ImageBitmap): FotoDecodificada {
  return { fonte: bitmap, largura: bitmap.width, altura: bitmap.height, liberar: () => bitmap.close() }
}

/** Ultima reserva: o `<img>` (os navegadores atuais desenham com a orientacao do EXIF). */
async function pelaImagem(arquivo: File): Promise<FotoDecodificada> {
  const url = URL.createObjectURL(arquivo)
  const imagem = new Image()
  imagem.src = url
  try {
    await imagem.decode()
  } catch {
    URL.revokeObjectURL(url)
    throw new ErroDeImagem(MENSAGENS_DA_IMAGEM.ilegivel)
  }
  return {
    fonte: imagem,
    largura: imagem.naturalWidth,
    altura: imagem.naturalHeight,
    liberar: () => URL.revokeObjectURL(url),
  }
}

/**
 * Decodifica com a orientacao do EXIF. Navegador que nao aceita as opcoes
 * (TypeError) tenta sem elas; sem `createImageBitmap`, ou falhando tambem
 * assim, tenta o `<img>`. Arquivo que nao e imagem cai na mensagem de leitura.
 */
async function decodificar(arquivo: File): Promise<FotoDecodificada> {
  if (typeof createImageBitmap !== 'function') {
    return pelaImagem(arquivo)
  }
  try {
    return doBitmap(await createImageBitmap(arquivo, { imageOrientation: 'from-image' }))
  } catch (erro) {
    if (!(erro instanceof TypeError)) {
      throw new ErroDeImagem(MENSAGENS_DA_IMAGEM.ilegivel)
    }
  }
  try {
    return doBitmap(await createImageBitmap(arquivo))
  } catch {
    return pelaImagem(arquivo)
  }
}

function contextoDe(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const contexto = canvas.getContext('2d')
  if (!contexto) {
    throw new ErroDeImagem(MENSAGENS_DA_IMAGEM.ilegivel)
  }
  return contexto
}

/**
 * Redimensiona o canvas e desenha nele: com fundo branco no JPEG (sem
 * transparencia, o transparente do PNG sairia preto) e suavizacao alta.
 * Mudar o tamanho limpa o canvas e o contexto.
 */
function prepararCanvas(
  canvas: HTMLCanvasElement,
  largura: number,
  altura: number,
  tipo: TipoDaImagemPreparada,
  desenhar: (contexto: CanvasRenderingContext2D) => void,
): void {
  canvas.width = largura
  canvas.height = altura
  const contexto = contextoDe(canvas)
  if (tipo === 'image/jpeg') {
    contexto.fillStyle = 'white'
    contexto.fillRect(0, 0, largura, altura)
  }
  contexto.imageSmoothingEnabled = true
  contexto.imageSmoothingQuality = 'high'
  desenhar(contexto)
}

/** Desenha a foto girada, com as dimensoes finais (ja giradas). */
function desenharGirada(foto: FotoDecodificada, rotacao: RotacaoDaImagem, largura: number, altura: number) {
  return (contexto: CanvasRenderingContext2D) => {
    const deLado = rotacao === 90 || rotacao === 270
    // Dimensoes do desenho antes do giro: de lado, a largura do canvas e a altura da imagem.
    const larguraDesenho = deLado ? altura : largura
    const alturaDesenho = deLado ? largura : altura
    contexto.translate(largura / 2, altura / 2)
    if (rotacao !== 0) {
      contexto.rotate((rotacao * Math.PI) / 180)
    }
    contexto.drawImage(foto.fonte, -larguraDesenho / 2, -alturaDesenho / 2, larguraDesenho, alturaDesenho)
  }
}

interface Versao {
  blob: Blob
  largura: number
  altura: number
}

/**
 * Gera uma versao dentro do teto de bytes num canvas: desenha uma vez por
 * dimensao e recodifica em cada qualidade, em passos ate 0,5; se nada couber,
 * reduz o lado em 15% e repete.
 */
async function codificarNoLimite(
  canvas: HTMLCanvasElement,
  dimensoesOriginais: { largura: number; altura: number },
  limite: { lado: number; bytes: number },
  qualidadeInicial: number,
  tipo: TipoDaImagemPreparada,
  desenhar: (largura: number, altura: number) => (contexto: CanvasRenderingContext2D) => void,
): Promise<Versao> {
  let lado = Math.min(limite.lado, Math.max(dimensoesOriginais.largura, dimensoesOriginais.altura))
  for (let reducao = 0; reducao <= MAXIMO_DE_REDUCOES_DO_LADO; reducao++) {
    const { largura, altura } = dimensoesAjustadas(dimensoesOriginais.largura, dimensoesOriginais.altura, lado)
    prepararCanvas(canvas, largura, altura, tipo, desenhar(largura, altura))
    for (const qualidade of qualidadesAPartirDe(qualidadeInicial)) {
      const blob = await codificar(canvas, tipo, qualidade)
      if (blob.size <= limite.bytes) {
        return { blob, largura, altura }
      }
    }
    lado = Math.max(1, Math.round(lado * FATOR_DE_REDUCAO_DO_LADO))
  }
  throw new ErroDeImagem(MENSAGENS_DA_IMAGEM.naoReduziu)
}

/**
 * Prepara a imagem escolhida para o envio: confere tamanho e formato do
 * original, decodifica e gera a grande (girada) e, a partir do canvas dela, a
 * miniatura. Erros esperados saem como `ErroDeImagem`, com a mensagem para o
 * usuario.
 */
export async function prepararImagem(arquivo: File, rotacao: RotacaoDaImagem): Promise<ImagemPreparada> {
  if (arquivo.size > LIMITES.originalBytes) {
    throw new ErroDeImagem(MENSAGENS_DA_IMAGEM.grandeDemais)
  }
  // Sem tipo informado pelo navegador, a decodificacao decide.
  if (arquivo.type !== '' && !TIPOS_ACEITOS.has(arquivo.type)) {
    throw new ErroDeImagem(MENSAGENS_DA_IMAGEM.ilegivel)
  }
  const foto = await decodificar(arquivo)
  const canvasDaGrande = document.createElement('canvas')
  const canvasDaMiniatura = document.createElement('canvas')
  try {
    const tipo: TipoDaImagemPreparada = (await suportaWebp()) ? 'image/webp' : 'image/jpeg'
    const deLado = rotacao === 90 || rotacao === 270
    const girada = { largura: deLado ? foto.altura : foto.largura, altura: deLado ? foto.largura : foto.altura }
    const grande = await codificarNoLimite(canvasDaGrande, girada, LIMITES.grande, QUALIDADE.grande, tipo, (largura, altura) =>
      desenharGirada(foto, rotacao, largura, altura),
    )
    // A miniatura reduz a grande ja girada: mais nitida que redimensionar o original de uma vez, e mais rapida.
    const miniatura = await codificarNoLimite(
      canvasDaMiniatura,
      grande,
      LIMITES.miniatura,
      QUALIDADE.miniatura,
      tipo,
      (largura, altura) => (contexto) => contexto.drawImage(canvasDaGrande, 0, 0, largura, altura),
    )
    return { grande: grande.blob, miniatura: miniatura.blob, tipo, largura: grande.largura, altura: grande.altura }
  } finally {
    foto.liberar()
    // Libera a memoria dos canvas ja (o navegador pode demorar a coletar).
    for (const canvas of [canvasDaGrande, canvasDaMiniatura]) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}
