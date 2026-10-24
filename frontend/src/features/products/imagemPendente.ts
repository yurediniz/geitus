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
 * Estado levado pela rota quando o cadastro novo salvou o produto mas nao a
 * imagem: a pagina de edicao abre com a imagem pendente e o aviso.
 */
export interface EstadoDaImagemNaoEnviada {
  imagemPendente: Extract<ImagemPendente, { tipo: 'nova' }>
  imagemNaoEnviada: true
}

function ehRotacao(valor: unknown): valor is RotacaoDaImagem {
  return valor === 0 || valor === 90 || valor === 180 || valor === 270
}

function ehPreparada(valor: unknown): valor is ImagemPreparada {
  if (typeof valor !== 'object' || valor === null) {
    return false
  }
  const { grande, miniatura, tipo, largura, altura } = valor as Record<string, unknown>
  return (
    grande instanceof Blob &&
    miniatura instanceof Blob &&
    (tipo === 'image/webp' || tipo === 'image/jpeg') &&
    typeof largura === 'number' &&
    typeof altura === 'number'
  )
}

/** A imagem pendente vinda do `location.state` (nao confiavel: e validada); null sem ela. */
export function imagemNaoEnviadaDaNavegacao(state: unknown): EstadoDaImagemNaoEnviada | null {
  if (typeof state !== 'object' || state === null) {
    return null
  }
  const { imagemPendente, imagemNaoEnviada } = state as Record<string, unknown>
  if (imagemNaoEnviada !== true || typeof imagemPendente !== 'object' || imagemPendente === null) {
    return null
  }
  const { tipo, arquivo, rotacao, preparada } = imagemPendente as Record<string, unknown>
  if (tipo !== 'nova' || !(arquivo instanceof File) || !ehRotacao(rotacao) || !ehPreparada(preparada)) {
    return null
  }
  return { imagemPendente: { tipo, arquivo, rotacao, preparada }, imagemNaoEnviada: true }
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
  }

  const descartar = useCallback(() => {
    pedidoAtual.current++
    setProcessando(false)
    setErro(null)
    setPendente(SEM_MUDANCA_NA_IMAGEM)
  }, [])

  return {
    gravada,
    pendente,
    processando,
    erro,
    alterada: pendente.tipo !== 'nenhuma',
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
