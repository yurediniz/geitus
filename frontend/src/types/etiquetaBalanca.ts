/**
 * Tipos da etiqueta de balanca (spec produtos-codigo-e-balanca §3 e §8).
 *
 * Refletem o contrato de /api/etiqueta-balanca: uma configuracao por empresa
 * (sem configuracao gravada, a API devolve o padrao com `padrao: true`).
 */

/** O que a etiqueta traz depois do codigo: o valor total (R$) ou o peso (kg). */
export type TipoInformacaoEtiqueta = 'VALOR' | 'PESO'

/** Formato da etiqueta. A soma dos digitos (com o prefixo e o DV) tem de ser 13. */
export interface ConfiguracaoEtiqueta {
  /** 1 ou 2 digitos (ex.: "2"). */
  prefixo: string
  /** De 4 a 6. */
  digitosCodigo: number
  /** De 0 a 2: zeros entre o codigo e a informacao. */
  digitosPreenchimento: number
  tipoInformacao: TipoInformacaoEtiqueta
  /** De 4 a 7. */
  digitosInformacao: number
  /** 2 ou 3. */
  casasDecimais: number
  /** Se ha o digito verificador EAN-13 no fim. */
  digitoVerificador: boolean
}

/** Configuracao como a API devolve: `padrao` diz se a empresa ainda nao gravou a sua. */
export interface ConfiguracaoEtiquetaResponse extends ConfiguracaoEtiqueta {
  padrao: boolean
}

/** Produto "Vendido na balanca" cujo codigo nao cabe no novo tamanho da etiqueta. */
export interface ProdutoComCodigoGrandeDemais {
  id: string
  numero: number
  nome: string
  codigo: number
}

/** Resposta do PUT: a configuracao gravada e o aviso (nao bloqueante) dos produtos afetados. */
export interface SalvarEtiquetaResponse {
  configuracao: ConfiguracaoEtiquetaResponse
  produtosComCodigoGrandeDemais: ProdutoComCodigoGrandeDemais[]
}

/** O que foi lido de uma etiqueta: o codigo do produto e o valor (R$) ou o peso (kg). */
export interface LeituraEtiqueta {
  codigoProduto: number
  tipo: TipoInformacaoEtiqueta
  valor: number
}

/** Produto encontrado pelo codigo lido no teste da etiqueta. */
export interface ProdutoDaEtiqueta {
  id: string
  numero: number
  nome: string
  /** Sigla da unidade de venda (ex.: "KG"). */
  unidade: string
}

/**
 * Resposta do teste da etiqueta: `leitura` null quando o numero nao e uma
 * etiqueta no formato; `produto` null quando o codigo lido nao esta cadastrado.
 * `mensagem` e o texto pronto para a tela.
 */
export interface TesteEtiquetaResponse {
  leitura: LeituraEtiqueta | null
  produto: ProdutoDaEtiqueta | null
  mensagem: string
}
