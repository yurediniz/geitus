import { useCallback, useEffect, useRef, useState } from 'react'

import {
  ErroDeImagem,
  MENSAGENS_DA_IMAGEM,
  prepararImagem,
  type ImagemPreparada,
  type RotacaoDaImagem,
} from '@/lib/imagemDoProduto'
import { baixarImagemDoProduto } from '@/services/produtoService'
import type { ImagemDoProduto } from '@/types/produto'

/**
 * Mudanca da imagem ainda nao salva (spec Fase F §5.1): ela segue o Salvar da
 * tela. `nova` guarda o arquivo original e a rotacao acumulada, para cada giro
 * recomprimir a partir dele, e as versoes ja prontas para o envio.
 */
export type ImagemPendente =
  | { tipo: 'nenhuma' }
  | { tipo: 'nova'; arquivo: File; rotacao: RotacaoDaImagem; preparada: ImagemPreparada }
  | { tipo: 'remover' }

export type ImagemNova = Extract<ImagemPendente, { tipo: 'nova' }>

export const SEM_MUDANCA_NA_IMAGEM: ImagemPendente = { tipo: 'nenhuma' }

/** Mensagem quando o produto foi salvo e a imagem nao (spec §5.1). */
export const MENSAGEM_IMAGEM_NAO_ENVIADA = 'Produto salvo, mas a imagem não foi enviada. Tente de novo.'

/** Falha ao baixar a imagem gravada para girar (URL vencida, rede). */
export const MENSAGEM_IMAGEM_GRAVADA_INDISPONIVEL = 'Não foi possível carregar a imagem gravada. Tente de novo.'

/** Cada giro soma 90 graus no sentido horario. */
export function proximaRotacao(rotacao: RotacaoDaImagem): RotacaoDaImagem {
  const proxima = (rotacao + 90) % 360
  return proxima === 90 || proxima === 180 || proxima === 270 ? proxima : 0
}

/**
 * Marca levada pela rota quando o cadastro novo salvou o produto mas nao a
 * imagem: a pagina de edicao abre com a imagem pendente e o aviso. A imagem
 * (arquivo e versoes) fica so na memoria, nunca no `history.state`.
 */
export interface EstadoDaImagemNaoEnviada {
  imagemNaoEnviada: true
}

/** Imagens que nao subiram no cadastro novo, por id do produto, ate a edicao as ler. */
const imagensNaoEnviadas = new Map<string, ImagemNova>()

export function guardarImagemNaoEnviada(produtoId: string, imagem: ImagemNova): void {
  imagensNaoEnviadas.set(produtoId, imagem)
}

export function esquecerImagemNaoEnviada(produtoId: string): void {
  imagensNaoEnviadas.delete(produtoId)
}

/** Se o `location.state` (nao confiavel) traz a marca de imagem nao enviada. */
export function temMarcaDeImagemNaoEnviada(state: unknown): boolean {
  return typeof state === 'object' && state !== null && (state as Record<string, unknown>).imagemNaoEnviada === true
}

/**
 * A imagem que nao subiu, quando a rota traz a marca e ela ainda esta na
 * memoria. Depois de recarregar a pagina (F5) a memoria esta vazia: sem
 * pendencia. Nao apaga: quem consome chama `esquecerImagemNaoEnviada`.
 */
export function imagemNaoEnviadaDaNavegacao(state: unknown, produtoId: string): ImagemNova | null {
  return temMarcaDeImagemNaoEnviada(state) ? (imagensNaoEnviadas.get(produtoId) ?? null) : null
}

/** O que o quadro da imagem precisa para mostrar e mudar a imagem. */
export interface ControleDaImagem {
  /** A imagem gravada no produto (null sem imagem ou no cadastro). */
  gravada: ImagemDoProduto | null
  pendente: ImagemPendente
  /** Comprimindo (ao escolher ou girar). */
  processando: boolean
  /** Erro ao ler ou reduzir o arquivo escolhido, para o quadro. */
  erro: string | null
  /** Ha mudanca na imagem a salvar. */
  alterada: boolean
  /** O que acabou de acontecer, para o anuncio do quadro (null no inicio e depois de descartar). */
  ultimoResultado: 'pronta' | 'removida' | null
  escolherArquivo: (arquivo: File) => void
  girar: () => void
  remover: () => void
  /** Volta a "sem mudanca" (depois de salvar). */
  descartar: () => void
}

/**
 * Estado da imagem pendente da pagina do produto. A compressao roda ao
 * escolher o arquivo (erro na hora e previa fiel) e de novo a cada giro, a
 * partir do original na memoria; o Salvar so envia as versoes prontas. Se
 * duas compressoes se cruzarem, vale a ultima pedida.
 */
export function useImagemDoProduto(
  gravada: ImagemDoProduto | null,
  inicial: ImagemPendente = SEM_MUDANCA_NA_IMAGEM,
): ControleDaImagem {
  const [pendente, setPendente] = useState<ImagemPendente>(inicial)
  const [processando, setProcessando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ultimoResultado, setUltimoResultado] = useState<'pronta' | 'removida' | null>(null)
  const pedidoAtual = useRef(0)

  const preparar = useCallback(async (obterArquivo: () => Promise<File>, rotacao: RotacaoDaImagem) => {
    const pedido = ++pedidoAtual.current
    setProcessando(true)
    setErro(null)
    try {
      const arquivo = await obterArquivo()
      const preparada = await prepararImagem(arquivo, rotacao)
      if (pedido === pedidoAtual.current) {
        setPendente({ tipo: 'nova', arquivo, rotacao, preparada })
        setUltimoResultado('pronta')
      }
    } catch (falha) {
      if (pedido === pedidoAtual.current) {
        setErro(falha instanceof ErroDeImagem ? falha.message : MENSAGENS_DA_IMAGEM.ilegivel)
      }
    } finally {
      if (pedido === pedidoAtual.current) {
        setProcessando(false)
      }
    }
  }, [])

  const escolherArquivo = useCallback(
    (arquivo: File) => {
      void preparar(async () => arquivo, 0)
    },
    [preparar],
  )

  const girar = () => {
    if (pendente.tipo === 'nova') {
      const { arquivo } = pendente
      void preparar(async () => arquivo, proximaRotacao(pendente.rotacao))
      return
    }
    if (pendente.tipo === 'nenhuma' && gravada) {
      // Sem o original, gira a versao grande gravada.
      const url = gravada.grandeUrl
      void preparar(async () => {
        let blob: Blob
        try {
          blob = await baixarImagemDoProduto(url)
        } catch {
          throw new ErroDeImagem(MENSAGEM_IMAGEM_GRAVADA_INDISPONIVEL)
        }
        return new File([blob], 'imagem', { type: blob.type })
      }, 90)
    }
  }

  const remover = () => {
    pedidoAtual.current++
    setProcessando(false)
    setErro(null)
    setPendente(gravada ? { tipo: 'remover' } : SEM_MUDANCA_NA_IMAGEM)
    setUltimoResultado('removida')
  }

  const descartar = useCallback(() => {
    pedidoAtual.current++
    setProcessando(false)
    setErro(null)
    setPendente(SEM_MUDANCA_NA_IMAGEM)
    setUltimoResultado(null)
  }, [])

  return {
    gravada,
    pendente,
    processando,
    erro,
    alterada: pendente.tipo !== 'nenhuma',
    ultimoResultado,
    escolherArquivo,
    girar,
    remover,
    descartar,
  }
}

/**
 * Object URL de um blob (a previa da imagem pendente), revogada quando o blob
 * muda ou o componente sai. Criada no efeito, para o StrictMode nao revogar a
 * URL ainda em uso.
 */
export function useUrlDoBlob(blob: Blob | null): string | null {
  const [url, setUrl] = useState<{ blob: Blob; url: string } | null>(null)
  useEffect(() => {
    if (!blob) {
      return
    }
    const criada = URL.createObjectURL(blob)
    setUrl({ blob, url: criada })
    return () => URL.revokeObjectURL(criada)
  }, [blob])
  return blob && url?.blob === blob ? url.url : null
}
