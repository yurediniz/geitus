import { formatarDataHoraCaixa, formatarReais, ROTULO_DA_FORMA } from '@/features/cash-register/formatacaoCaixa'
import { formatarQuantidade } from '@/features/pdv/formatacaoPdv'
import type { Venda } from '@/types/pdv'

/**
 * O que a venda e, so leitura: cliente, itens, descontos, total, pagamentos,
 * troco e o aviso de cancelada. Usado no detalhe das vendas do caixa (PDV) e
 * na janela da venda da area Estoque; as acoes ficam com quem usa.
 */
export function ResumoDaVenda({ venda }: { venda: Venda }) {
  return (
    <>
      {venda.clienteNome && <p className="text-sm">{`Cliente: ${venda.clienteNome}`}</p>}

      <ul aria-label={`Itens da venda nº ${venda.numero}`} className="divide-y text-sm">
        {venda.itens.map((item) => (
          <li key={item.ordem} className="flex items-start justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="font-medium">{item.nome}</p>
              <p className="text-xs text-muted-foreground tabular-nums">
                {/* O item da venda nao diz se a unidade e fracionada: quantidade quebrada sai com 3 casas, como na lista. */}
                {`${formatarQuantidade(item.quantidade, item.embalagemRotulo === null && !Number.isInteger(item.quantidade))} ${item.embalagemRotulo ?? item.unidade} × ${formatarReais(item.precoUnitario)}`}
              </p>
            </div>
            <span className="shrink-0 font-semibold tabular-nums">{formatarReais(item.valorLiquido)}</span>
          </li>
        ))}
      </ul>

      <dl className="space-y-1 rounded-md bg-muted/60 px-3 py-2 text-sm">
        {venda.descontoItens + venda.descontoTotal > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Descontos</dt>
            <dd className="tabular-nums">{`− ${formatarReais(venda.descontoItens + venda.descontoTotal)}`}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatarReais(venda.total)}</dd>
        </div>
        {venda.pagamentos.map((pagamento) => (
          <div key={pagamento.forma} className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{ROTULO_DA_FORMA[pagamento.forma]}</dt>
            <dd className="tabular-nums">{formatarReais(pagamento.valor)}</dd>
          </div>
        ))}
        {venda.troco > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">Troco</dt>
            <dd className="tabular-nums">{formatarReais(venda.troco)}</dd>
          </div>
        )}
      </dl>

      {venda.cancelamento && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {`Cancelada por ${venda.cancelamento.canceladaPorNome} em ${formatarDataHoraCaixa(venda.cancelamento.canceladaEm)}: ${venda.cancelamento.motivo}`}
        </p>
      )}
    </>
  )
}
