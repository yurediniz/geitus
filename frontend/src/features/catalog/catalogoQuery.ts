import { HttpError } from '@/services/httpClient'

/**
 * Chaves de cache do catalogo. Invalidar o prefixo atualiza todas as variacoes
 * (ex.: lista completa nesta area e lista de ativas no formulario do produto).
 */
export const UNIDADES_QUERY_KEY = ['unidades'] as const
export const CATEGORIAS_QUERY_KEY = ['categorias'] as const
/** Listas completas (ativas e inativas), compartilhadas pelas telas do catalogo e pelo formulario do produto. */
export const TODAS_UNIDADES_QUERY_KEY = [...UNIDADES_QUERY_KEY, 'todas'] as const
export const TODAS_CATEGORIAS_QUERY_KEY = [...CATEGORIAS_QUERY_KEY, 'todas'] as const
/** Produtos exibem unidade/categoria: alteracoes no catalogo os deixam desatualizados. */
export const PRODUTOS_QUERY_KEY = ['produtos'] as const
/** Historico de precos de um produto (sob o prefixo de produtos; salvar o produto o invalida). */
export function chaveDoHistoricoDePrecos(produtoId: string) {
  return [...PRODUTOS_QUERY_KEY, produtoId, 'historico-precos'] as const
}

interface TextosErroCatalogo {
  /** Mensagem usada quando nao ha nada mais especifico a dizer. */
  padrao: string
  /** Mensagem para 404 (registro removido por outra pessoa, por exemplo). */
  naoEncontrado: string
  /** Mensagem para 403 (perfil sem permissao). */
  semPermissao: string
}

/**
 * Mensagem sem conteudo util para o usuario: vazia, a generica do httpClient
 * ("Requisicao falhou (HTTP 409).", usada quando o backend nao manda mensagem
 * propria) ou o "Dados invalidos." padrao do 400.
 */
export function ehMensagemGenerica(mensagem: string): boolean {
  return mensagem.trim() === '' || mensagem.startsWith('Requisicao falhou') || mensagem === 'Dados invalidos.'
}

/**
 * Traduz a falha de uma acao do catalogo para pt-BR. Em 409 e 400 o backend
 * envia uma mensagem curada (ex.: "Esta unidade está em uso por 3 produto(s)...")
 * que e exibida como veio; os demais casos usam textos fixos, sem vazar
 * detalhe tecnico.
 */
export function mensagemErroCatalogo(erro: unknown, textos: TextosErroCatalogo): string {
  if (erro instanceof HttpError) {
    if (erro.status === 409 || erro.status === 400) {
      const porCampo = Object.values(erro.campos ?? {}).filter(Boolean)
      if (porCampo.length > 0) {
        return porCampo.join(' ')
      }
      if (!ehMensagemGenerica(erro.message)) {
        return erro.message
      }
    }
    if (erro.status === 403) {
      return textos.semPermissao
    }
    if (erro.status === 404) {
      return textos.naoEncontrado
    }
  }
  return textos.padrao
}
