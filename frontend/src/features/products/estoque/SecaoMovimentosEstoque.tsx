import { Info } from 'lucide-react'

import { chaveDosMovimentosDeEstoque } from '@/features/catalog/catalogoQuery'
import { ListaHistorico } from '@/features/products/secoes/ListaHistorico'
import { textoMovimento } from '@/features/products/estoque/ajusteEstoque'
import { formatarDataHora } from '@/features/products/formatacaoProduto'
import { listarMovimentosDeEstoque } from '@/services/estoqueService'
import type { MovimentoEstoque } from '@/types/estoque'

export interface SecaoMovimentosEstoqueProps {
  produtoId: string
  /** Sigla da unidade de venda (as quantidades do historico estao nela). */
  sigla: string
  /** Com o controle desligado, os movimentos que existem continuam aqui, com um aviso. */
  controlaEstoque: boolean
}

/** Lista "Estoque" da secao Historico: as movimentacoes do produto, da mais recente para a mais antiga. */
export function SecaoMovimentosEstoque({ produtoId, sigla, controlaEstoque }: SecaoMovimentosEstoqueProps) {
  return (
    <ListaHistorico<MovimentoEstoque>
      id="historico-estoque"
      titulo="Movimentações de estoque"
      chave={chaveDosMovimentosDeEstoque(produtoId)}
      buscar={(pagina) => listarMovimentosDeEstoque(produtoId, pagina)}
      nota={
        !controlaEstoque && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Este produto não controla estoque no momento.
          </p>
        )
      }
      textos={{
        carregando: 'Carregando movimentações...',
        erroCarga: 'Não foi possível carregar as movimentações de estoque.',
        erroMais: 'Não foi possível carregar mais movimentações. Tente de novo.',
        vazioTitulo: 'Nenhuma movimentação de estoque ainda.',
        vazioDescricao: 'Entradas, saídas e contagens aparecem aqui, com data e quem registrou.',
        rotuloLista: 'Movimentações de estoque',
      }}
      chaveDoItem={(movimento) => movimento.id}
      renderizarItem={(movimento) => <LinhaMovimento movimento={movimento} sigla={sigla} />}
    />
  )
}

/** Um movimento: tipo e motivo em destaque; quando, quem e a observacao como apoio; quantidade e saldos a direita. */
function LinhaMovimento({ movimento, sigla }: { movimento: MovimentoEstoque; sigla: string }) {
  const { titulo, quantidade, saldos, saldosFalados, custo, fornecedor } = textoMovimento(movimento, sigla)
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-xs text-muted-foreground">
          <span>{formatarDataHora(movimento.criadoEm)}</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, por </span>
          <span>{movimento.usuarioNome}</span>
          {/* Na entrada por compra com fornecedor (spec B5 §6): "· Fornecedor: Distribuidora Sul". */}
          {fornecedor && (
            <>
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, </span>
              <span>{fornecedor}</span>
            </>
          )}
        </p>
        {movimento.observacao && <p className="text-sm text-muted-foreground break-words">{movimento.observacao}</p>}
      </div>
      <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5 text-sm tabular-nums">
        <span>
          <span className="font-semibold">{quantidade}</span>
          {/* Na entrada por compra, o custo (spec B4 §7.2): "· R$ 180,00 por CX (R$ 10,00 por UN)". */}
          {custo && <span className="text-muted-foreground">{` · ${custo}`}</span>}
        </span>
        <span className="text-muted-foreground">
          <span aria-hidden="true">{saldos}</span>
          <span className="sr-only">{saldosFalados}</span>
        </span>
      </div>
    </li>
  )
}
