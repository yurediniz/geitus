import { chaveDoHistoricoDePrecos } from '@/features/catalog/catalogoQuery'
import { SecaoHistorico } from '@/features/products/abas/SecaoHistorico'
import { SecaoMovimentosEstoque } from '@/features/products/estoque/SecaoMovimentosEstoque'
import { formatarDataHora, formatarMoeda, formatarVariacao } from '@/features/products/formatacaoProduto'
import { listarHistoricoDePrecos } from '@/services/produtoService'
import type { CampoHistoricoPreco, HistoricoPreco } from '@/types/produto'

const ROTULO_CAMPO: Readonly<Record<CampoHistoricoPreco, string>> = {
  CUSTO: 'Custo',
  PRECO_VENDA: 'Preço de venda',
}

export interface AbaHistoricoProps {
  produtoId: string
  /** Sigla da unidade de venda (quantidades dos movimentos de estoque). */
  sigla: string
  controlaEstoque: boolean
}

/**
 * Aba Historico (so na edicao), em duas secoes com paginacao propria: as
 * movimentacoes de estoque (primeiro) e as alteracoes de custo e de preco de
 * venda. O conteudo da aba so monta quando ela e aberta, entao as consultas
 * tambem so rodam ai.
 */
export function AbaHistorico({ produtoId, sigla, controlaEstoque }: AbaHistoricoProps) {
  return (
    <div className="space-y-8">
      <SecaoMovimentosEstoque produtoId={produtoId} sigla={sigla} controlaEstoque={controlaEstoque} />
      <SecaoHistorico<HistoricoPreco>
        id="historico-precos"
        titulo="Preços"
        chave={chaveDoHistoricoDePrecos(produtoId)}
        buscar={(pagina) => listarHistoricoDePrecos(produtoId, pagina)}
        textos={{
          carregando: 'Carregando histórico de preços...',
          erroCarga: 'Não foi possível carregar o histórico de preços.',
          erroMais: 'Não foi possível carregar mais alterações. Tente de novo.',
          vazioTitulo: 'Nenhuma alteração de preço registrada ainda.',
          vazioDescricao: 'As próximas mudanças de custo e preço de venda aparecem aqui, com data e quem alterou.',
          rotuloLista: 'Alterações de preço',
        }}
        // Sem id publico na linha: a posicao e estavel (a lista so cresce no fim).
        chaveDoItem={(_, indice) => indice}
        renderizarItem={(item) => <LinhaHistorico item={item} />}
      />
    </div>
  )
}

/**
 * Valores da alteracao: "R$ 10,00 → R$ 11,50" (leitor de tela ouve "de X para
 * Y"), "R$ 10,00 (valor inicial)" no cadastro e "R$ 5,00 → sem custo" quando o
 * custo foi removido.
 */
function ValoresDaAlteracao({ anterior, novo }: { anterior: number | null; novo: number | null }) {
  if (anterior === null) {
    return <span>{`${formatarMoeda(novo)} (valor inicial)`}</span>
  }
  const textoNovo = novo === null ? 'sem custo' : formatarMoeda(novo)
  return (
    <span>
      <span aria-hidden="true">{`${formatarMoeda(anterior)} → ${textoNovo}`}</span>
      <span className="sr-only">{`de ${formatarMoeda(anterior)} para ${textoNovo}`}</span>
    </span>
  )
}

/** Uma alteracao: campo e valores em destaque; quando e quem, como apoio. */
function LinhaHistorico({ item }: { item: HistoricoPreco }) {
  const variacao = formatarVariacao(item.valorAnterior, item.valorNovo)
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{ROTULO_CAMPO[item.campo]}</p>
        <p className="text-xs text-muted-foreground">
          <span>{formatarDataHora(item.alteradoEm)}</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, por </span>
          <span>{item.usuarioNome}</span>
        </p>
      </div>
      <div className="flex items-baseline gap-3 text-sm tabular-nums">
        <ValoresDaAlteracao anterior={item.valorAnterior} novo={item.valorNovo} />
        {/* Coluna sempre presente, para os valores ficarem alinhados entre as linhas. */}
        <span className="w-20 text-right font-medium">{variacao}</span>
      </div>
    </li>
  )
}
