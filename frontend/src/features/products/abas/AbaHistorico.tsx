import { useInfiniteQuery } from '@tanstack/react-query'
import { History, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { chaveDoHistoricoDePrecos } from '@/features/catalog/catalogoQuery'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { formatarDataHora, formatarMoeda, formatarVariacao } from '@/features/products/formatacaoProduto'
import { listarHistoricoDePrecos } from '@/services/produtoService'
import type { CampoHistoricoPreco, HistoricoPreco } from '@/types/produto'

const ROTULO_CAMPO: Readonly<Record<CampoHistoricoPreco, string>> = {
  CUSTO: 'Custo',
  PRECO_VENDA: 'Preço de venda',
}

export interface AbaHistoricoProps {
  produtoId: string
}

/**
 * Aba Historico (so na edicao): as alteracoes de custo e de preco de venda,
 * da mais recente para a mais antiga, 20 por vez com "Carregar mais". O
 * conteudo da aba so monta quando ela e aberta, entao a consulta tambem so
 * roda ai. Na Fase D entram as movimentacoes de estoque.
 */
export function AbaHistorico({ produtoId }: AbaHistoricoProps) {
  const historicoQuery = useInfiniteQuery({
    queryKey: chaveDoHistoricoDePrecos(produtoId),
    queryFn: ({ pageParam }) => listarHistoricoDePrecos(produtoId, pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, paginas) => {
      const carregados = paginas.reduce((total, pagina) => total + pagina.itens.length, 0)
      // Pagina vazia encerra (o total pode ter mudado entre as consultas).
      return ultima.itens.length > 0 && carregados < ultima.totalItens ? ultima.pagina + 1 : undefined
    },
  })

  if (historicoQuery.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando histórico...
      </p>
    )
  }

  // So a falha da primeira carga troca a lista pelo erro; a de "Carregar mais" aparece sob a lista.
  if (historicoQuery.isLoadingError) {
    return (
      <div className="max-w-2xl space-y-3">
        <ErroInline mensagem="Não foi possível carregar o histórico de preços." />
        {/* type="button": a aba fica dentro do formulario do produto. */}
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => historicoQuery.refetch()}>
          Tentar de novo
        </Button>
      </div>
    )
  }

  const itens = historicoQuery.data.pages.flatMap((pagina) => pagina.itens)

  if (itens.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <History className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">Nenhuma alteração de preço registrada ainda.</p>
        <p className="text-sm text-muted-foreground">
          As próximas mudanças de custo e preço de venda aparecem aqui, com data e quem alterou.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ol aria-label="Alterações de preço" className="divide-y">
        {itens.map((item, indice) => (
          // Sem id publico na linha: a posicao e estavel (a lista so cresce no fim).
          <LinhaHistorico key={indice} item={item} />
        ))}
      </ol>
      {historicoQuery.isFetchNextPageError && (
        <ErroInline mensagem="Não foi possível carregar mais alterações. Tente de novo." />
      )}
      {historicoQuery.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => historicoQuery.fetchNextPage()}
          disabled={historicoQuery.isFetchingNextPage}
        >
          {historicoQuery.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Carregar mais
        </Button>
      )}
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
