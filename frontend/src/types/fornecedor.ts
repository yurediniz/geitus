/**
 * Tipos do modulo Fornecedores (Fase B5).
 *
 * Refletem o contrato da API em /api/fornecedores (ver
 * docs/modules/fornecedores-e-marcas.md §4.7). O `id` e o UUID publico; a
 * empresa nunca trafega aqui: e derivada do usuario autenticado. Documento,
 * CEP e telefone vem so com digitos.
 */

import type { MarcaResumo } from '@/types/catalogo'
import type { StatusFiltro } from '@/types/produto'

/** Pessoa juridica (CNPJ, razao social e inscricao estadual) ou fisica (CPF e nome). */
export type TipoPessoaFornecedor = 'PJ' | 'PF'

/**
 * Endereco do fornecedor, em campos no proprio fornecedor (todos opcionais).
 * O numero do endereco e `numeroEndereco` (o `numero` e o Nº do fornecedor).
 */
export interface EnderecoFornecedor {
  /** 8 digitos. */
  cep: string | null
  logradouro: string | null
  /** Numero do endereco (texto: "123", "S/N", "km 4"). */
  numeroEndereco: string | null
  complemento: string | null
  bairro: string | null
  municipio: string | null
  /** Sigla em maiusculas. */
  uf: string | null
}

/** Representante de venda, na ordem da tela (o primeiro aparece na listagem). */
export interface RepresentanteDeVenda {
  id: string
  nome: string
  telefone: string | null
  email: string | null
}

/** Fornecedor conforme retornado pela API (detalhe). */
export interface Fornecedor extends EnderecoFornecedor {
  id: string
  /** Nº sequencial por empresa, gerado na criacao e imutavel. */
  numero: number
  tipoPessoa: TipoPessoaFornecedor
  /** CNPJ (14) no PJ ou CPF (11) no PF; null quando nao informado. */
  documento: string | null
  /** Razao social (PJ) ou nome (PF). */
  razaoSocial: string
  nomeFantasia: string | null
  /** So digitos ou "ISENTO"; sempre null no PF. */
  inscricaoEstadual: string | null
  telefone: string | null
  email: string | null
  observacoes: string | null
  representantes: RepresentanteDeVenda[]
  /** Marcas que vende, com o caminho na arvore ("Boehringer › Nexgard"). */
  marcas: MarcaResumo[]
  quantidadeProdutos: number
  ativo: boolean
  criadoEm: string
  atualizadoEm: string | null
}

/** Representante no request: com `id` mantem, sem `id` cria; ausente da lista e removido. */
export interface RepresentanteRequest {
  id?: string
  nome: string
  telefone: string | null
  email: string | null
}

/** Corpo do POST/PATCH (listas sempre completas). */
export interface FornecedorRequest extends EnderecoFornecedor {
  tipoPessoa: TipoPessoaFornecedor
  documento: string | null
  razaoSocial: string
  nomeFantasia: string | null
  inscricaoEstadual: string | null
  telefone: string | null
  email: string | null
  observacoes: string | null
  representantes: RepresentanteRequest[]
  marcaIds: string[]
}

/** Item da listagem paginada de fornecedores. */
export interface FornecedorItemLista {
  id: string
  numero: number
  razaoSocial: string
  nomeFantasia: string | null
  tipoPessoa: TipoPessoaFornecedor
  documento: string | null
  telefone: string | null
  /** O primeiro representante da lista; null sem representantes. */
  representantePrincipal: { nome: string; telefone: string | null } | null
  quantidadeProdutos: number
  ativo: boolean
}

/** Estado da lista de fornecedores (o mesmo da URL da tela). */
export interface FiltrosDaListaDeFornecedores {
  /** Texto da busca, aparado; vazio = sem busca. */
  busca: string
  status: StatusFiltro
  /** Pagina da tela, comecando em 1 (a API comeca em 0). */
  pagina: number
}

/** Produto ligado ao fornecedor (lista "Produtos que vende"). */
export interface ProdutoDoFornecedor {
  /** UUID do produto. */
  id: string
  numero: number
  nome: string
  codigo: number | null
  sku: string | null
  ativo: boolean
  /** O fornecedor e o "Fornecedor da última compra" deste produto (remover pede confirmacao). */
  fornecedorDaUltimaCompra: boolean
}
