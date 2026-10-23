import { formatarMoeda, formatarQuantidade } from '@/features/products/formatacaoProduto'
import { SeloSituacaoEstoque } from '@/features/products/estoque/SeloSituacaoEstoque'
import type { Produto } from '@/types/produto'

/**
 * Preco da lista: com promocao vigente, o promocional em destaque, o normal
 * riscado e o selo "Promoção" (leitores de tela ouvem "de R$ X por R$ Y").
 * Promocao agendada ou encerrada nao muda nada.
 */
export function PrecoDoProduto({ produto }: { produto: Produto }) {
  if (!produto.emPromocao || produto.promocao === null) {
    return <span className="tabular-nums">{formatarMoeda(produto.precoVenda)}</span>
  }
  const normal = formatarMoeda(produto.precoVenda)
  const promocional = formatarMoeda(produto.promocao.preco)
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="sr-only">{`de ${normal} por ${promocional}`}</span>
      <span aria-hidden="true" className="font-semibold text-foreground tabular-nums">
        {promocional}
      </span>
      <s aria-hidden="true" className="text-muted-foreground tabular-nums">
        {normal}
      </s>
      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">Promoção</span>
    </span>
  )
}

/**
 * Saldo da lista: "12 UN" com o selo "Estoque baixo" ou "Sem estoque"; "—"
 * para produto sem controle de estoque (o saldo guardado nao aparece).
 */
export function EstoqueDoProduto({ produto }: { produto: Produto }) {
  if (!produto.controlaEstoque) {
    return <SemValor motivo="Não controla estoque" />
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="tabular-nums">{formatarQuantidade(produto.estoqueAtual, produto.unidade.sigla)}</span>
      <SeloSituacaoEstoque situacao={produto.situacaoEstoque} />
    </span>
  )
}

/** "—" visual com o motivo para leitor de tela (o travessao sozinho nao diz nada). */
export function SemValor({ motivo }: { motivo: string }) {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">{motivo}</span>
    </>
  )
}
