/**
 * Tipos compartilhados do modulo Produtos.
 *
 * Refletem o contrato da API do backend em /api/produtos. A empresa nao e
 * enviada nem recebida aqui: ela e sempre derivada do usuario autenticado.
 * Unidade e categoria vem dos cadastros do catalogo (ver types/catalogo).
 */

import type { CategoriaResumo, UnidadeResumo } from '@/types/catalogo'
import type { SituacaoEstoque } from '@/types/estoque'

/**
 * Formato reconhecido de um codigo de barras: EAN-8, UPC-A e EAN-13 (so digitos,
 * com digito verificador GS1 valido) ou `OUTRO` (qualquer outro conteudo).
 */
export type FormatoCodigoBarras = 'EAN8' | 'UPCA' | 'EAN13' | 'OUTRO'

/** Codigo de barras do produto, na ordem de exibicao (o primeiro aparece na listagem). */
export interface CodigoBarras {
  codigo: string
  formato: FormatoCodigoBarras
}

/**
 * Situacao da promocao na data de hoje (fuso America/Sao_Paulo), calculada pelo
 * backend: AGENDADA antes do inicio, VIGENTE do inicio ao fim (inclusive) e
 * ENCERRADA depois do fim.
 */
export type SituacaoPromocao = 'AGENDADA' | 'VIGENTE' | 'ENCERRADA'

/** Preco promocional com vigencia por datas (yyyy-mm-dd, inicio e fim inclusivos). */
export interface PromocaoProduto {
  preco: number
  inicio: string
  fim: string
  situacao: SituacaoPromocao
}

/** Preco de atacado: vale a partir da quantidade minima (uma unica faixa por produto). */
export interface AtacadoProduto {
  preco: number
  quantidadeMinima: number
}

/** Promocao enviada no POST/PATCH (a situacao e sempre derivada pelo backend). */
export type PromocaoRequest = Omit<PromocaoProduto, 'situacao'>

/**
 * De onde vem o preco efetivo da embalagem (spec B3 §3.1): o preco proprio, a
 * quantidade x preco de venda da unidade ou x preco promocional vigente dela.
 */
export type OrigemPrecoEmbalagem = 'PROPRIO' | 'UNIDADE' | 'PROMOCAO_DA_UNIDADE'

/**
 * Embalagem de venda do produto (Fase B3): outra forma de vender ou comprar o
 * mesmo produto, com estoque unico na unidade de venda.
 */
export interface Embalagem {
  /** UUID publico da embalagem. */
  id: string
  /** Unidade da embalagem (CX, FD, PCT...), diferente da de venda. */
  unidade: UnidadeResumo
  /** Quantas unidades de venda a embalagem contem (> 1). */
  quantidade: number
  /** Derivado: "CX c/ 3 UN". Só-leitura. */
  rotulo: string
  /** Preco proprio; null = vale o calculado. */
  preco: number | null
  /** Preco que vale hoje (proprio ou calculado). Só-leitura. */
  precoEfetivo: number
  origemPreco: OrigemPrecoEmbalagem
  /** Quantidade x custo da unidade; null sem custo. Só-leitura. */
  custo: number | null
  /** Margem do preco efetivo sobre o custo da embalagem (%); null sem custo. Só-leitura. */
  margem: number | null
  /** Markup sobre o custo da embalagem (%); null sem custo ou com custo 0. Só-leitura. */
  markup: number | null
  /** Embalagem de compra (no maximo uma por produto). */
  deCompra: boolean
  /** De 0 a 5 codigos, na ordem de exibicao. */
  codigosBarras: CodigoBarras[]
}

/** Embalagem enviada no POST/PATCH do produto. */
export interface EmbalagemRequest {
  /** UUID da embalagem que continua; ausente na embalagem nova. */
  id?: string
  unidadeId: string
  quantidade: number
  /** null = sem preco proprio (vale o calculado). */
  preco: number | null
  deCompra: boolean
  codigosBarras: string[]
}

/**
 * De onde veio o custo atual do produto (Fase B4): da ultima entrada por compra
 * ou de uma edicao no cadastro.
 */
export type OrigemDoCusto = 'ENTRADA_COMPRA' | 'EDICAO'

/** Origem do custo atual do produto (spec B4 §4). */
export interface CustoOrigem {
  tipo: OrigemDoCusto
  /** Quando a origem foi registrada (yyyy-mm-ddThh:mm:ss, horario do servidor). */
  em: string
  /** Quantidade da ultima entrada por compra, em unidades de venda; null em `EDICAO`. */
  quantidade: number | null
  /** Rotulo da embalagem da ultima compra ("CX c/ 18 UN"); null em `EDICAO` ou com a compra em unidades. */
  embalagemRotulo: string | null
}

/** Campos de texto livre com sugestoes dos valores ja usados na empresa. */
export type CampoSugestaoProduto = 'marca' | 'fornecedor'

/** Produto conforme retornado pela API. */
export interface Produto {
  /** UUID publico do produto (o id numerico interno nao sai na API). */
  id: string
  /** Numero de registro (1, 2, 3... por empresa), gerado na criacao e imutavel. Só-leitura. */
  numero: number
  /** Codigo do produto (1 a 999999, exibido sem zeros); null quando nao informado. */
  codigo: number | null
  /** Vendido na balanca (etiqueta com o codigo do produto); exige o `codigo`. */
  vendidoBalanca: boolean
  nome: string
  /** Nome curto informado (ate 30); null quando nao informado. */
  nomeCurto: string | null
  /** Nome usado no cupom e no PDV: o nome curto ou os 30 primeiros caracteres do nome. Só-leitura. */
  nomeCurtoEfetivo: string
  /** Categoria com o caminho completo (ex.: "Ração › Úmida › Sachê"); null = sem categoria. */
  categoria: CategoriaResumo | null
  marca: string | null
  /** Fornecedor principal em texto livre. */
  fornecedor: string | null
  /** Unidade de venda (obrigatoria). */
  unidade: UnidadeResumo
  descricao: string | null
  precoVenda: number
  custo: number | null
  /** De onde veio o custo atual; null sem custo ou com a origem desconhecida (custo anterior a Fase B4). */
  custoOrigem: CustoOrigem | null
  precoMinimo: number | null
  /** Promocao gravada (vigente, agendada ou encerrada); null sem promocao. */
  promocao: PromocaoProduto | null
  /** Se a promocao esta vigente hoje (`promocao.situacao === 'VIGENTE'`). Só-leitura. */
  emPromocao: boolean
  /** Preco de atacado; null sem atacado. */
  atacado: AtacadoProduto | null
  /** Se o produto controla estoque (padrao ligado). Desligado, o saldo fica guardado. */
  controlaEstoque: boolean
  /**
   * Saldo atual, derivado das movimentacoes. Vem mesmo com o controle
   * desligado (fica guardado e volta ao religar). So-leitura.
   */
  estoqueAtual: number
  /** Situacao do saldo; null com o controle desligado. So-leitura. */
  situacaoEstoque: SituacaoEstoque | null
  estoqueMinimo: number | null
  estoqueMaximo: number | null
  pontoReposicao: number | null
  /** De 0 a 20 codigos da unidade de venda, na ordem de exibicao (os das embalagens ficam nelas). */
  codigosBarras: CodigoBarras[]
  /** Embalagens de venda (ate 10), na ordem gravada. */
  embalagens: Embalagem[]
  sku: string | null
  ativo: boolean
  /** Se o produto pode ser excluido fisicamente (nunca teve venda nem movimentacao). */
  podeExcluir: boolean
  /** Margem sobre a venda (%), derivada; null quando não há custo. Só-leitura. */
  margem: number | null
  /**
   * Markup sobre o custo (%), derivado; null quando não há custo ou quando
   * custo = 0 (evita divisão por zero) — nesse caso a margem ainda vem
   * preenchida. Só-leitura.
   */
  markup: number | null
  criadoEm: string
  atualizadoEm: string | null
}

/**
 * Corpo enviado para cadastro/atualizacao de produto. Não envia margem/markup
 * (derivados) nem o `numero` (gerado pelo backend e imutavel).
 */
export interface ProdutoRequest {
  /** Codigo do produto ja como numero (zeros a esquerda removidos); null = sem codigo. */
  codigo: number | null
  vendidoBalanca: boolean
  nome: string
  nomeCurto: string | null
  /** UUID da unidade de venda (obrigatorio). */
  unidadeId: string
  /** UUID da categoria; null = sem categoria. */
  categoriaId: string | null
  marca: string | null
  fornecedor: string | null
  descricao: string | null
  precoVenda: number
  custo: number | null
  precoMinimo: number | null
  /** null = sem promocao (remove a gravada). O formulario sempre envia o estado completo. */
  promocao: PromocaoRequest | null
  /** null = sem atacado (remove o gravado). */
  atacado: AtacadoProduto | null
  controlaEstoque: boolean
  /**
   * So no cadastro (POST), > 0 e com o controle ligado: vira a primeira
   * entrada (motivo Estoque inicial). O PATCH nao envia a chave.
   */
  estoqueInicial?: number | null
  estoqueMinimo: number | null
  estoqueMaximo: number | null
  pontoReposicao: number | null
  /** Lista completa e ordenada: o PATCH substitui a lista gravada (removidos sao apagados). */
  codigosBarras: string[]
  /**
   * Lista completa e ordenada das embalagens: o PATCH substitui a gravada (a
   * ausente da lista e removida com os seus codigos; a sem `id` e nova).
   */
  embalagens: EmbalagemRequest[]
  sku: string | null
}

/** Filtro de status da lista de produtos (`ativos` e o padrao). */
export const STATUS_FILTRO = ['ativos', 'inativos', 'todos'] as const
export type StatusFiltro = (typeof STATUS_FILTRO)[number]

/** Filtro de estoque da lista: `baixo` inclui os sem estoque; so produtos que controlam estoque. */
export const ESTOQUE_FILTRO = ['baixo', 'sem'] as const
export type EstoqueFiltro = (typeof ESTOQUE_FILTRO)[number]

/**
 * Ordenacao da lista (parametro `ordem` da API), na ordem do select da tela;
 * o `-` inverte a direcao. `recentes` e `atualizados` sao sempre do mais novo
 * para o mais antigo.
 */
export const ORDENS_PRODUTOS = [
  'nome',
  '-nome',
  'preco',
  '-preco',
  '-margem',
  'margem',
  '-estoque',
  'estoque',
  'recentes',
  'atualizados',
] as const
export type OrdemProdutos = (typeof ORDENS_PRODUTOS)[number]

/** Estado da lista de produtos (o mesmo da URL da tela). */
export interface FiltrosDaListaDeProdutos {
  /** Texto da busca, aparado; vazio = sem busca. */
  busca: string
  status: StatusFiltro
  /** UUID da categoria (inclui as subcategorias); null = todas. */
  categoria: string | null
  /** null = sem filtro de estoque. */
  estoque: EstoqueFiltro | null
  /** So produtos com promocao vigente hoje. */
  promocao: boolean
  ordem: OrdemProdutos
  /** Pagina da tela, comecando em 1 (a API comeca em 0). */
  pagina: number
}

/** Campo cujo valor gerou a linha do historico de precos (`PRECO_EMBALAGEM`: o preco proprio de uma embalagem). */
export type CampoHistoricoPreco = 'CUSTO' | 'PRECO_VENDA' | 'PRECO_EMBALAGEM'

/** Uma alteracao de custo, de preco de venda ou do preco de uma embalagem (gravada pelo backend ao salvar o produto). */
export interface HistoricoPreco {
  campo: CampoHistoricoPreco
  /** null no cadastro, quando o custo estava vazio ou quando a embalagem estava sem preco proprio. */
  valorAnterior: number | null
  /** null quando o custo foi removido ou a embalagem ficou sem preco proprio (ou saiu do produto). */
  valorNovo: number | null
  /** Rotulo da embalagem no momento da alteracao ("CX c/ 3 UN"); so em `PRECO_EMBALAGEM`. */
  embalagemRotulo: string | null
  /** De onde veio a alteracao de custo (so em `CUSTO`; null nos precos). */
  origem: OrigemDoCusto | null
  /** A entrada por compra que mudou o custo; so com a origem `ENTRADA_COMPRA`. */
  entrada: EntradaDoHistoricoPreco | null
  usuarioNome: string
  /** Momento da gravacao (yyyy-mm-ddThh:mm:ss, horario do servidor). */
  alteradoEm: string
}

/** Quantidade e embalagem da entrada por compra ligada a uma linha de custo. */
export interface EntradaDoHistoricoPreco {
  /** Em unidades de venda (36). */
  quantidade: number
  /** "CX c/ 18 UN"; null com a compra em unidades. */
  embalagemRotulo: string | null
}

/** Pagina de uma consulta paginada do backend (`pagina` comeca em 0). */
export interface PaginaResponse<T> {
  itens: T[]
  pagina: number
  tamanho: number
  totalItens: number
}
