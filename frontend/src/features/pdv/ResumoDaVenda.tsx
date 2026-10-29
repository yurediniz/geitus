import { formatarDataHoraCaixa, formatarReais, ROTULO_DA_FORMA } from '@/features/cash-register/formatacaoCaixa'
import { comUnidade, DEVOLUCAO_NA_FORMA, juntarComE } from '@/features/pdv/devolucao'
import { formatarQuantidade } from '@/features/pdv/formatacaoPdv'
import type { Devolucao, Venda } from '@/types/pdv'

/**
 * O que a venda e, so leitura: cliente, itens, descontos, total, pagamentos,
 * troco, o aviso de cancelada e as devolucoes. Usado no detalhe das vendas do caixa (PDV) e
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

      {venda.devolucoes && venda.devolucoes.length > 0 && (
        <section aria-label="Devoluções" className="space-y-2 rounded-md bg-warning-soft px-3 py-2 text-sm">
          <p className="font-medium text-warning-soft-foreground">
            {venda.situacaoDevolucao === 'TOTAL' ? 'Venda devolvida por inteiro' : 'Devolução parcial'}
          </p>
          <ul className="space-y-2">
            {venda.devolucoes.map((devolucao) => (
              <LinhaDaDevolucao key={devolucao.id} devolucao={devolucao} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}

/** "29/10/2026 13:41 · Fulano · motivo", os itens com o destino e o reembolso. */
function LinhaDaDevolucao({ devolucao }: { devolucao: Devolucao }) {
  const itens = devolucao.itens.map(
    (item) =>
      `${comUnidade(item.quantidade, item.unidade)} ${item.nome}${item.destino === 'AVARIADO' ? ' (avariado)' : ''}`,
  )
  const reembolsos = devolucao.reembolsos.map(
    (reembolso) => `${formatarReais(reembolso.valor)} ${DEVOLUCAO_NA_FORMA[reembolso.forma]}`,
  )
  return (
    <li>
      <p className="text-xs text-muted-foreground">
        {`${formatarDataHoraCaixa(devolucao.criadaEm)} · ${devolucao.usuarioNome} · ${devolucao.motivo}`}
      </p>
      <p>{juntarComE(itens)}</p>
      <p className="tabular-nums">{reembolsos.length > 0 ? `Devolvido ${juntarComE(reembolsos)}` : 'Sem valor a devolver'}</p>
    </li>
  )
}
