import { Plus } from 'lucide-react'

import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { formatarQuantidade } from '@/features/pdv/formatacaoPdv'
import { MiniaturaDoProduto } from '@/features/pdv/MiniaturaDoProduto'
import { cn } from '@/lib/utils'
import type { ProdutoEncontrado } from '@/types/pdv'

/** A moldura do card (busca e catalogo); o destaque do card ativo vem de quem usa. */
export const CLASSE_DO_CARTAO =
  'flex h-full cursor-pointer flex-col rounded-xl border bg-card p-3 text-left transition-[border-color,box-shadow] duration-150'

/** O miolo do card do produto: miniatura, nome, codigo, preco vigente, saldo e o "+". */
export function ConteudoDoCartao({ produto }: { produto: ProdutoEncontrado }) {
  return (
    <>
      <MiniaturaDoProduto url={produto.miniaturaUrl} className={produto.miniaturaUrl ? 'h-20 w-full' : 'h-12 w-full'} />
      <p className="mt-3 line-clamp-2 leading-snug font-medium">{produto.nome}</p>
      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
        {[produto.codigo !== null && `Cód. ${produto.codigo}`, produto.unidade].filter(Boolean).join(' · ')}
      </p>
      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div className="min-w-0">
          <p className="font-display text-lg leading-tight font-bold tabular-nums">{formatarReais(produto.precoVigente)}</p>
          <Saldo produto={produto} />
        </div>
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
        >
          <Plus className="size-5" />
        </span>
      </div>
    </>
  )
}

/** O saldo com um ponto de cor: sem saldo em vermelho (a venda segue a regra "Vender sem estoque"). */
function Saldo({ produto }: { produto: ProdutoEncontrado }) {
  if (produto.saldo === null) {
    return null
  }
  const semSaldo = produto.saldo <= 0
  return (
    <p className={cn('flex items-center gap-1.5 text-xs tabular-nums', semSaldo ? 'text-destructive' : 'text-muted-foreground')}>
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', semSaldo ? 'bg-destructive' : 'bg-success')} />
      {semSaldo
        ? produto.saldo < 0
          ? `Sem estoque (saldo ${formatarQuantidade(produto.saldo, produto.fracionada)} ${produto.unidade})`
          : 'Sem estoque'
        : `${formatarQuantidade(produto.saldo, produto.fracionada)} ${produto.unidade} em estoque`}
    </p>
  )
}
