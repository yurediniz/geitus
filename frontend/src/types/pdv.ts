/**
 * Tipos do modulo PDV (spec `docs/modules/pdv.md`). Os ids sao os UUIDs
 * publicos; os horarios chegam em ISO-8601 com deslocamento e os valores em
 * reais (2 casas), as quantidades com ate 3 casas. O custo nunca vem da API.
 */
import type { FormaDePagamento } from '@/types/caixa'

/** Como o codigo lido foi lancado: a unidade de venda, uma embalagem ou a etiqueta da balanca. */
export type TipoDoItemResolvido = 'UNIDADE' | 'EMBALAGEM' | 'ETIQUETA'

/** De onde veio o preco unitario da linha (selos Promocao, Atacado e Balanca). */
export type OrigemPrecoDaVenda = 'NORMAL' | 'PROMOCIONAL' | 'ATACADO' | 'EMBALAGEM' | 'ETIQUETA'

export interface EmbalagemDoPdv {
  id: string
  /** "CX c/ 3 UN" */
  rotulo: string
  /** Quantas unidades de venda a embalagem tem. */
  quantidade: number
}

/** O produto como o PDV precisa dele (sem custo). */
export interface ProdutoDoPdv {
  id: string
  codigo: number | null
  nome: string
  /** Sigla da unidade de venda ("UN", "KG"). */
  unidade: string
  fracionada: boolean
  controlaEstoque: boolean
  /** Saldo atual na unidade de venda; null sem controle de estoque. */
  saldo: number | null
  miniaturaUrl: string | null
  /** So as embalagens ativas. */
  embalagens: EmbalagemDoPdv[]
}

/** Resposta de `GET /api/pdv/itens?codigo=`. */
export interface ItemResolvido {
  tipo: TipoDoItemResolvido
  /** Na unidade da linha (3 CX, 0,400 KG). */
  quantidade: number
  produto: ProdutoDoPdv
  embalagemId: string | null
  codigoLido: string
}

/** Item de `GET /api/pdv/itens?busca=` (ate 20 produtos ativos). */
export interface ProdutoEncontrado extends ProdutoDoPdv {
  /** O preco vigente da unidade (sem atacado). */
  precoVigente: number
}

/** Resposta de `GET /api/pdv/catalogo`: paginas de 24, os mais vendidos primeiro. */
export interface CatalogoDoPdv {
  produtos: ProdutoEncontrado[]
  temMais: boolean
}

export type TipoDeDesconto = 'PERCENTUAL' | 'VALOR'

export interface DescontoInformado {
  tipo: TipoDeDesconto
  /** Percentual (0 a 100) ou reais. */
  valor: number
}

export interface PagamentoInformado {
  forma: FormaDePagamento
  valor: number
}

export interface ItemDoCarrinhoRequest {
  produtoId: string
  embalagemId: string | null
  quantidade: number
  /** O texto lido; null quando o produto veio da busca por nome. */
  codigoLido: string | null
  /** Etiqueta da balanca: o servidor rele `codigoLido` e ignora a quantidade. */
  etiqueta: boolean
  desconto: DescontoInformado | null
}

/** Corpo do `POST /api/pdv/calculo` e base do `POST /api/pdv/vendas`. */
export interface CarrinhoRequest {
  itens: ItemDoCarrinhoRequest[]
  desconto: DescontoInformado | null
  clienteId: string | null
  pagamentos: PagamentoInformado[]
}

export interface FinalizarVendaRequest extends CarrinhoRequest {
  /** Gerada ao abrir a janela de pagamento; reenviada igual em cada nova tentativa. */
  chave: string
  totalEsperado: number
}

export interface LinhaCalculada {
  ordem: number
  quantidade: number
  /** O que a linha baixa, na unidade de venda do produto. */
  quantidadeEstoque: number
  precoUnitario: number
  origemPreco: OrigemPrecoDaVenda
  valorBruto: number
  descontoItem: number
  descontoRateado: number
  valorLiquido: number
}

/** Erro ou aviso do calculo; `campo` e `itens[i]`, `itens[i].desconto`, `desconto`, `pagamentos`... */
export interface MensagemDoCalculo {
  campo: string | null
  mensagem: string
}

/** Resposta do `POST /api/pdv/calculo`: 200 mesmo com regras violadas (em `erros`). */
export interface CalculoDaVenda {
  /** Na mesma ordem dos itens enviados. */
  linhas: LinhaCalculada[]
  subtotal: number
  descontoItens: number
  descontoTotal: number
  total: number
  pago: number
  troco: number
  faltaPagar: number
  erros: MensagemDoCalculo[]
  avisos: MensagemDoCalculo[]
}

export type StatusDaVenda = 'CONCLUIDA' | 'CANCELADA'

export interface ItemDaVenda {
  ordem: number
  nome: string
  embalagemRotulo: string | null
  quantidade: number
  unidade: string
  precoUnitario: number
  origemPreco: OrigemPrecoDaVenda
  valorBruto: number
  descontoItem: number
  descontoRateado: number
  valorLiquido: number
}

export interface CancelamentoDaVenda {
  canceladaPorNome: string
  canceladaEm: string
  motivo: string
}

/** A venda como sai da lista (sem `itens`). */
export interface VendaResumo {
  id: string
  numero: number
  status: StatusDaVenda
  sessaoId: string
  pontoNome: string
  vendedorNome: string
  clienteNome: string | null
  subtotal: number
  descontoItens: number
  descontoTotal: number
  total: number
  troco: number
  concluidaEm: string
  pagamentos: PagamentoInformado[]
  cancelamento: CancelamentoDaVenda | null
  podeCancelar: boolean
}

export interface Venda extends VendaResumo {
  itens: ItemDaVenda[]
  /** So no detalhe (e nas respostas de finalizar e cancelar); a lista nao traz. */
  situacaoDevolucao?: SituacaoDeDevolucao
  devolucoes?: Devolucao[]
}

/** Devolucao de itens (spec de Estoque, 6.2): para onde vai o item devolvido. */
export type DestinoDaDevolucao = 'ESTOQUE' | 'AVARIADO'

export type SituacaoDeDevolucao = 'NENHUMA' | 'PARCIAL' | 'TOTAL'

/** Uma devolucao gravada: as linhas com o destino e o reembolso por forma. */
export interface Devolucao {
  id: string
  vendaId: string
  vendaNumero: number
  valor: number
  motivo: string
  criadaEm: string
  usuarioNome: string
  itens: {
    ordem: number
    nome: string
    /** Na unidade da linha. */
    quantidade: number
    /** "UN" ou o rotulo da embalagem ("CX c/ 12 UN"). */
    unidade: string
    valor: number
    destino: DestinoDaDevolucao
  }[]
  /** Vazio na devolucao de valor zero. */
  reembolsos: { forma: FormaDePagamento; valor: number }[]
}

/** Uma linha da venda para a devolucao: o vendido, o devolvido e o que ainda pode voltar. */
export interface LinhaParaDevolucao {
  ordem: number
  nome: string
  /** O que a quantidade conta: a sigla ou o rotulo da embalagem. */
  unidade: string
  embalagemRotulo: string | null
  /** Etiqueta de balanca: so volta inteira. */
  etiqueta: boolean
  /** Aceita fracao (ate 3 casas); a embalagem nunca. */
  fracionada: boolean
  precoUnitario: number
  quantidade: number
  devolvida: number
  disponivel: number
  valorLiquido: number
  valorDisponivel: number
}

/** Uma forma que a venda recebeu: no dinheiro, sem o troco. */
export interface FormaParaReembolso {
  forma: FormaDePagamento
  recebido: number
  reembolsado: number
  disponivel: number
}

/** `GET /pdv/devolucoes/venda?numero=` (so ADMIN). */
export interface VendaParaDevolucao {
  id: string
  numero: number
  concluidaEm: string
  vendedorNome: string
  clienteNome: string | null
  total: number
  troco: number
  linhas: LinhaParaDevolucao[]
  formas: FormaParaReembolso[]
  devolucoes: Devolucao[]
}

/** `POST /pdv/vendas/{id}/devolucoes`: as linhas pela ordem na venda; o reembolso por forma. */
export interface DevolucaoRequest {
  chave: string
  motivo: string
  itens: { ordem: number; quantidade: number; destino: DestinoDaDevolucao }[]
  reembolsos: { forma: FormaDePagamento; valor: number }[]
}

/** Filtros da lista de vendas; texto vazio = sem o filtro; `pagina` comeca em 1. */
export interface FiltrosDeVendas {
  /** Vazio: a sessao atual do usuario (padrao do backend). */
  sessaoId: string
  status: StatusDaVenda | ''
  /** Datas `AAAA-MM-DD`. */
  de: string
  ate: string
  numero: string
  pagina: number
}

export interface ConfiguracaoDoPdv {
  venderSemEstoque: boolean
  /** De 0 a 100, ate 2 casas. */
  descontoMaximoOperador: number
  /** Null enquanto a empresa usa o padrao. */
  atualizadoPorNome: string | null
  atualizadoEm: string | null
}

export interface ConfiguracaoDoPdvRequest {
  venderSemEstoque: boolean
  descontoMaximoOperador: number
}
