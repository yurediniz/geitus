/**
 * Dados de teste do PDV. So dados e um calculo falso (soma simples): os mocks
 * de servico ficam em cada arquivo de teste.
 */
import type { CalculoDaVenda, CarrinhoRequest, ItemResolvido, ProdutoDoPdv, VendaResumo } from '@/types/pdv'

export function produtoDoPdv(parcial: Partial<ProdutoDoPdv> = {}): ProdutoDoPdv {
  return {
    id: 'p-racao',
    codigo: 542,
    nome: 'Ração X 1kg',
    unidade: 'UN',
    fracionada: false,
    controlaEstoque: true,
    saldo: 12,
    miniaturaUrl: null,
    embalagens: [],
    ...parcial,
  }
}

export const RACAO = produtoDoPdv()
export const NEXGARD = produtoDoPdv({
  id: 'p-nexgard',
  codigo: 900,
  nome: 'Nexgard M',
  saldo: 10,
  embalagens: [{ id: 'e-cx3', rotulo: 'CX c/ 3 UN', quantidade: 3 }],
})
export const QUEIJO = produtoDoPdv({ id: 'p-queijo', codigo: 77, nome: 'Queijo minas', unidade: 'KG', fracionada: true })

export function itemResolvido(parcial: Partial<ItemResolvido> = {}): ItemResolvido {
  return { tipo: 'UNIDADE', quantidade: 1, produto: RACAO, embalagemId: null, codigoLido: '542', ...parcial }
}

/** Precos de teste por produto (e por embalagem), so para o calculo falso. */
export const PRECOS: Readonly<Record<string, number>> = {
  'p-racao': 24.9,
  'p-nexgard': 89.9,
  'e-cx3': 209.9,
  'p-queijo': 25,
}

function emCentavos(valor: number): number {
  return Math.round(valor * 100)
}

/** Calculo falso: preco x quantidade, sem desconto, com pagamento e troco. */
export function calculoFalso(carrinho: CarrinhoRequest, parcial: Partial<CalculoDaVenda> = {}): CalculoDaVenda {
  const linhas = carrinho.itens.map((item, indice) => {
    const preco = PRECOS[item.embalagemId ?? item.produtoId] ?? 1
    const bruto = emCentavos(preco * item.quantidade) / 100
    return {
      ordem: indice + 1,
      quantidade: item.quantidade,
      quantidadeEstoque: item.quantidade,
      precoUnitario: preco,
      origemPreco: item.etiqueta ? ('ETIQUETA' as const) : item.embalagemId ? ('EMBALAGEM' as const) : ('NORMAL' as const),
      valorBruto: bruto,
      descontoItem: 0,
      descontoRateado: 0,
      valorLiquido: bruto,
    }
  })
  const total = linhas.reduce((soma, linha) => soma + emCentavos(linha.valorLiquido), 0)
  const pago = carrinho.pagamentos.reduce((soma, pagamento) => soma + emCentavos(pagamento.valor), 0)
  return {
    linhas,
    subtotal: total / 100,
    descontoItens: 0,
    descontoTotal: 0,
    total: total / 100,
    pago: pago / 100,
    troco: Math.max(0, pago - total) / 100,
    faltaPagar: Math.max(0, total - pago) / 100,
    erros: [],
    avisos: [],
    ...parcial,
  }
}

export function vendaResumo(parcial: Partial<VendaResumo> = {}): VendaResumo {
  return {
    id: 'v-128',
    numero: 128,
    status: 'CONCLUIDA',
    sessaoId: 's-ana',
    pontoNome: 'Caixa 1',
    vendedorNome: 'Ana Souza',
    clienteNome: null,
    subtotal: 74.7,
    descontoItens: 0,
    descontoTotal: 0,
    total: 74.7,
    troco: 0,
    concluidaEm: '2026-10-24T18:02:00-03:00',
    pagamentos: [{ forma: 'DINHEIRO', valor: 74.7 }],
    cancelamento: null,
    podeCancelar: true,
    ...parcial,
  }
}
