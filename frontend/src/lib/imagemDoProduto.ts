/**
 * Imagem do produto no navegador (spec Fase F §2): decodifica a foto (com a
 * orientacao do EXIF), aplica o giro e gera as duas versoes que sobem para a
 * API, a grande e a miniatura, em WebP (ou JPEG sem WebP), dentro dos tetos
 * de tamanho. O servidor nao recomprime: os limites aqui sao os mesmos dele.
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
  /** Object URL da grande, para a previa (quem usa revoga). */
  previa: string
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

function codificar(canvas: HTMLCanvasElement, tipo: string, qualidade: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ErroDeImagem(MENSAGENS_DA_IMAGEM.ilegivel))),
      tipo,
      qualidade,
    )
  })
}

/** Desenha a imagem girada num canvas com as dimensoes finais (ja giradas). */
function desenhar(
  imagem: ImageBitmap,
  rotacao: RotacaoDaImagem,
  largura: number,
  altura: number,
  fundoBranco: boolean,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const contexto = canvas.getContext('2d')
  if (!contexto) {
    throw new ErroDeImagem(MENSAGENS_DA_IMAGEM.ilegivel)
  }
  if (fundoBranco) {
    // O JPEG nao tem transparencia: sem o fundo, o transparente do PNG sai preto.
    contexto.fillStyle = 'white'
    contexto.fillRect(0, 0, largura, altura)
  }
  contexto.imageSmoothingEnabled = true
  contexto.imageSmoothingQuality = 'high'
  const deLado = rotacao === 90 || rotacao === 270
  // Dimensoes do desenho antes do giro: de lado, a largura do canvas e a altura da imagem.
  const larguraDesenho = deLado ? altura : largura
  const alturaDesenho = deLado ? largura : altura
  contexto.translate(largura / 2, altura / 2)
  if (rotacao !== 0) {
    contexto.rotate((rotacao * Math.PI) / 180)
  }
  contexto.drawImage(imagem, -larguraDesenho / 2, -alturaDesenho / 2, larguraDesenho, alturaDesenho)
  return canvas
}

interface Versao {
  blob: Blob
  tipo: TipoDaImagemPreparada
  largura: number
  altura: number
}

/**
 * Gera uma versao dentro do teto de bytes: tenta as qualidades em passos ate
 * 0,5 e, se nada couber, reduz o lado em 15% e repete. `tipo` nulo descobre o
 * formato: pede WebP e, se o navegador devolver outro, refaz em JPEG.
 */
async function gerarVersao(
  imagem: ImageBitmap,
  rotacao: RotacaoDaImagem,
  limite: { lado: number; bytes: number },
  qualidadeInicial: number,
  tipoDefinido: TipoDaImagemPreparada | null,
): Promise<Versao> {
  const deLado = rotacao === 90 || rotacao === 270
  const larguraGirada = deLado ? imagem.height : imagem.width
  const alturaGirada = deLado ? imagem.width : imagem.height
  let tipo = tipoDefinido
  let lado = Math.min(limite.lado, Math.max(larguraGirada, alturaGirada))
  for (let reducao = 0; reducao <= MAXIMO_DE_REDUCOES_DO_LADO; reducao++) {
    const { largura, altura } = dimensoesAjustadas(larguraGirada, alturaGirada, lado)
    for (const qualidade of qualidadesAPartirDe(qualidadeInicial)) {
      let blob: Blob
      if (tipo === null) {
        blob = await codificar(desenhar(imagem, rotacao, largura, altura, false), 'image/webp', qualidade)
        tipo = blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
        if (tipo === 'image/jpeg') {
          blob = await codificar(desenhar(imagem, rotacao, largura, altura, true), tipo, qualidade)
        }
      } else {
        blob = await codificar(desenhar(imagem, rotacao, largura, altura, tipo === 'image/jpeg'), tipo, qualidade)
      }
      if (blob.size <= limite.bytes) {
        return { blob, tipo, largura, altura }
      }
    }
    lado = Math.max(1, Math.round(lado * FATOR_DE_REDUCAO_DO_LADO))
  }
  throw new ErroDeImagem(MENSAGENS_DA_IMAGEM.naoReduziu)
}

async function decodificar(arquivo: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(arquivo, { imageOrientation: 'from-image' })
  } catch {
    throw new ErroDeImagem(MENSAGENS_DA_IMAGEM.ilegivel)
  }
}

/**
 * Prepara a imagem escolhida para o envio: confere tamanho e formato do
 * original, decodifica, gira e gera a grande e a miniatura. Erros esperados
 * saem como `ErroDeImagem`, com a mensagem para o usuario.
 */
export async function prepararImagem(arquivo: File, rotacao: RotacaoDaImagem): Promise<ImagemPreparada> {
  if (arquivo.size > LIMITES.originalBytes) {
    throw new ErroDeImagem(MENSAGENS_DA_IMAGEM.grandeDemais)
  }
  // Sem tipo informado pelo navegador, a decodificacao decide.
  if (arquivo.type !== '' && !TIPOS_ACEITOS.has(arquivo.type)) {
    throw new ErroDeImagem(MENSAGENS_DA_IMAGEM.ilegivel)
  }
  const imagem = await decodificar(arquivo)
  try {
    const grande = await gerarVersao(imagem, rotacao, LIMITES.grande, QUALIDADE.grande, null)
    const miniatura = await gerarVersao(imagem, rotacao, LIMITES.miniatura, QUALIDADE.miniatura, grande.tipo)
    return {
      grande: grande.blob,
      miniatura: miniatura.blob,
      tipo: grande.tipo,
      largura: grande.largura,
      altura: grande.altura,
      previa: URL.createObjectURL(grande.blob),
    }
  } finally {
    imagem.close()
  }
}
