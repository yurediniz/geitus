import { useEffect, useMemo, useRef, type MouseEvent } from 'react'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Loader2, Package } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TODAS_CATEGORIAS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { CLASSE_DO_CARTAO, ConteudoDoCartao } from '@/features/pdv/CartaoDoProduto'
import { chaveDoCatalogo } from '@/features/pdv/pdvQuery'
import { cn } from '@/lib/utils'
import { listarCategorias } from '@/services/categoriaService'
import { listarCatalogo } from '@/services/pdvService'
import type { ProdutoEncontrado } from '@/types/pdv'

export interface CatalogoInicialProps {
  /** A dica sob a faixa ("Digite mais 1 letra…", "Buscando…"). */
  dica: string
  /** A categoria escolhida (null = todas): fica com o campo e nao se perde quando a busca passa pela tela. */
  categoria: string | null
  aoMudarCategoria: (categoria: string | null) => void
  aoEscolher: (produto: ProdutoEncontrado) => void
}

/** O catalogo e invalidado a cada venda e cancelamento: voltar da busca nao precisa reler as paginas. */
const VALIDADE_DO_CATALOGO_MS = 60_000

/** Nada aqui tira o foco do campo de leitura (o clique nao vira foco do botao). */
const manterFocoNoCampo = (event: MouseEvent) => event.preventDefault()

/**
 * O catalogo antes de digitar (DEC-044): a faixa das categorias principais
 * (cada uma com as subcategorias) e os produtos ativos em cards, os mais
 * vendidos primeiro, carregando mais ao rolar. O clique no card lanca 1
 * unidade; o teclado continua no campo (as setas sao das linhas do carrinho).
 */
export function CatalogoInicial({ dica, categoria, aoMudarCategoria, aoEscolher }: CatalogoInicialProps) {
  const fimRef = useRef<HTMLDivElement>(null)

  const categorias = useQuery({
    queryKey: TODAS_CATEGORIAS_QUERY_KEY,
    queryFn: () => listarCategorias(),
    select: (todas) => todas.filter((item) => item.parentId === null && item.selecionavel),
  })
  const catalogo = useInfiniteQuery({
    queryKey: chaveDoCatalogo(categoria),
    queryFn: ({ pageParam, signal }) => listarCatalogo(categoria, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: (ultima, paginas) => (ultima.temMais ? paginas.length : undefined),
    staleTime: VALIDADE_DO_CATALOGO_MS,
    // Trocando de categoria, os cards anteriores ficam (esmaecidos) ate os novos chegarem: sem piscar.
    placeholderData: keepPreviousData,
  })
  // O ranking pode mudar entre uma pagina e outra (outra venda no meio): um produto nunca aparece duas vezes.
  const produtos = useMemo(() => {
    const vistos = new Set<string>()
    return (catalogo.data?.pages ?? [])
      .flatMap((pagina) => pagina.produtos)
      .filter((produto) => !vistos.has(produto.id) && Boolean(vistos.add(produto.id)))
  }, [catalogo.data])
  const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = catalogo
  const trocando = catalogo.isPlaceholderData

  // Rolando ate o fim, a proxima pagina vem sozinha (o botao "Mostrar mais" fica de reserva).
  // Depois de uma falha, so o operador tenta de novo: nada de repetir o pedido sem parar.
  useEffect(() => {
    const fim = fimRef.current
    if (!fim || !hasNextPage || isFetchNextPageError || trocando || typeof IntersectionObserver === 'undefined') {
      return
    }
    const observador = new IntersectionObserver((entradas) => {
      if (entradas.some((entrada) => entrada.isIntersecting) && !isFetchingNextPage) {
        void fetchNextPage()
      }
    })
    observador.observe(fim)
    return () => observador.disconnect()
  }, [hasNextPage, isFetchingNextPage, isFetchNextPageError, trocando, fetchNextPage])

  const opcoes = [{ id: null, nome: 'Todas' }, ...(categorias.data ?? []).map((item) => ({ id: item.id, nome: item.nome }))]
  const nomeDaCategoria = opcoes.find((opcao) => opcao.id === categoria)?.nome ?? 'Todas'

  return (
    <div className="space-y-3">
      {opcoes.length > 1 && (
        // Fixa no topo da coluna: troca-se de categoria sem voltar ao inicio da grade.
        <div
          role="group"
          aria-label="Categorias"
          className="sticky top-0 z-10 -mx-1 flex gap-2 overflow-x-auto bg-card px-1 pt-1 pb-2 [scrollbar-width:thin]"
        >
          {opcoes.map((opcao) => {
            const escolhida = categoria === opcao.id
            return (
              <Button
                key={opcao.id ?? 'todas'}
                type="button"
                variant={escolhida ? 'default' : 'outline'}
                aria-pressed={escolhida}
                onMouseDown={manterFocoNoCampo}
                onClick={() => aoMudarCategoria(opcao.id)}
                className="h-9 shrink-0 rounded-full px-4"
              >
                {opcao.nome}
              </Button>
            )
          })}
        </div>
      )}

      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{categoria ? nomeDaCategoria : 'Produtos'}</span> · mais vendidos
        primeiro · {dica}
      </p>

      {catalogo.isPending ? (
        <p role="status" className="flex items-center gap-2 p-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando produtos…
        </p>
      ) : catalogo.isError && produtos.length === 0 ? (
        <div className="space-y-2">
          <ErroInline mensagem="Não foi possível carregar os produtos." />
          <Button type="button" variant="outline" className="h-11" onClick={() => void catalogo.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : produtos.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-10 text-center">
          <Package className="h-8 w-8 text-muted-foreground/60" aria-hidden="true" />
          <p className="text-muted-foreground">
            {categoria ? 'Nenhum produto ativo nesta categoria.' : 'Nenhum produto ativo cadastrado.'}
          </p>
        </div>
      ) : (
        <>
          <ul
            aria-label="Catálogo"
            aria-busy={trocando}
            className={cn(
              'grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-3 transition-opacity',
              trocando && 'pointer-events-none opacity-50',
            )}
          >
            {produtos.map((produto) => (
              <li key={produto.id}>
                <button
                  type="button"
                  aria-label={`Lançar ${produto.nome}`}
                  onMouseDown={manterFocoNoCampo}
                  onClick={() => aoEscolher(produto)}
                  className={cn(CLASSE_DO_CARTAO, 'w-full hover:border-primary/50 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none')}
                >
                  <ConteudoDoCartao produto={produto} />
                </button>
              </li>
            ))}
          </ul>
          <div ref={fimRef} className="flex flex-col items-center gap-2 pt-1">
            {isFetchNextPageError && <ErroInline mensagem="Não foi possível carregar mais produtos." />}
            {hasNextPage && (
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onMouseDown={manterFocoNoCampo}
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {isFetchNextPageError ? 'Tentar de novo' : 'Mostrar mais'}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
