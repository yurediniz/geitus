import { Fragment, type ReactNode } from 'react'
import { useInfiniteQuery, type InfiniteData, type QueryKey, type UseInfiniteQueryResult } from '@tanstack/react-query'
import { History, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import type { PaginaResponse } from '@/types/produto'

interface TextosSecaoHistorico {
  carregando: string
  /** Falha da primeira carga (com "Tentar de novo"). */
  erroCarga: string
  /** Falha de "Carregar mais" (a lista carregada continua na tela). */
  erroMais: string
  vazioTitulo: string
  vazioDescricao: string
  /** Nome acessivel da lista. */
  rotuloLista: string
}

export interface SecaoHistoricoProps<T> {
  /** Prefixo dos ids (titulo da secao). */
  id: string
  titulo: string
  chave: QueryKey
  buscar: (pagina: number) => Promise<PaginaResponse<T>>
  textos: TextosSecaoHistorico
  /** Aviso sob o titulo (ex.: o produto nao controla estoque no momento). */
  nota?: ReactNode
  chaveDoItem: (item: T, indice: number) => string | number
  /** Uma linha da lista (um `<li>`). */
  renderizarItem: (item: T) => ReactNode
}

/**
 * Uma secao da aba Historico: lista paginada do mais recente para o mais
 * antigo, 20 por vez com "Carregar mais", com os estados de carregando, erro
 * (com nova tentativa) e vazio. Cada secao tem a propria consulta e paginacao.
 * Os botoes sao `type="button"`: a aba fica dentro do formulario do produto.
 */
export function SecaoHistorico<T>({
  id,
  titulo,
  chave,
  buscar,
  textos,
  nota,
  chaveDoItem,
  renderizarItem,
}: SecaoHistoricoProps<T>) {
  const consulta = useInfiniteQuery({
    queryKey: chave,
    queryFn: ({ pageParam }) => buscar(pageParam),
    initialPageParam: 0,
    getNextPageParam: (ultima, paginas) => {
      const carregados = paginas.reduce((total, pagina) => total + pagina.itens.length, 0)
      // Pagina vazia encerra (o total pode ter mudado entre as consultas).
      return ultima.itens.length > 0 && carregados < ultima.totalItens ? ultima.pagina + 1 : undefined
    },
  })

  return (
    <section aria-labelledby={`${id}-titulo`} className="space-y-3">
      <div className="space-y-1">
        <h3 id={`${id}-titulo`} className="text-sm font-semibold">
          {titulo}
        </h3>
        {nota}
      </div>
      <ConteudoDaSecao consulta={consulta} textos={textos} chaveDoItem={chaveDoItem} renderizarItem={renderizarItem} />
    </section>
  )
}

interface ConteudoDaSecaoProps<T> extends Pick<SecaoHistoricoProps<T>, 'textos' | 'chaveDoItem' | 'renderizarItem'> {
  consulta: UseInfiniteQueryResult<InfiniteData<PaginaResponse<T>>>
}

function ConteudoDaSecao<T>({ consulta, textos, chaveDoItem, renderizarItem }: ConteudoDaSecaoProps<T>) {
  if (consulta.isPending) {
    return (
      <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        {textos.carregando}
      </p>
    )
  }

  // So a falha da primeira carga troca a lista pelo erro; a de "Carregar mais" aparece sob a lista.
  if (consulta.isLoadingError) {
    return (
      <div className="max-w-2xl space-y-3">
        <ErroInline mensagem={textos.erroCarga} />
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={() => consulta.refetch()}>
          Tentar de novo
        </Button>
      </div>
    )
  }

  const itens = consulta.data.pages.flatMap((pagina) => pagina.itens)

  if (itens.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-6 text-center">
        <History className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">{textos.vazioTitulo}</p>
        <p className="text-sm text-muted-foreground">{textos.vazioDescricao}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <ol aria-label={textos.rotuloLista} className="divide-y">
        {itens.map((item, indice) => (
          <Fragment key={chaveDoItem(item, indice)}>{renderizarItem(item)}</Fragment>
        ))}
      </ol>
      {consulta.isFetchNextPageError && <ErroInline mensagem={textos.erroMais} />}
      {consulta.hasNextPage && (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={() => consulta.fetchNextPage()}
          disabled={consulta.isFetchingNextPage}
        >
          {consulta.isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Carregar mais
        </Button>
      )}
    </div>
  )
}
