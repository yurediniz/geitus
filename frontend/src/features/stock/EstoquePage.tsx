import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertCircle, Boxes, SearchX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PaginacaoLista } from '@/components/ui/paginacao-lista'
import { TODAS_CATEGORIAS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { AvisoSomenteLeitura, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { mensagemDeSucesso } from '@/features/products/estoque/ajusteEstoque'
import { ModalAjusteEstoque } from '@/features/products/estoque/ModalAjusteEstoque'
import { ROTA_PRODUTOS, type EstadoParaProduto } from '@/features/products/navegacaoProdutos'
import { CardsDoResumo } from '@/features/stock/CardsDoResumo'
import { chaveDaPosicao, chaveDoResumo } from '@/features/stock/estoqueQuery'
import { FiltrosDaPosicao } from '@/features/stock/FiltrosDaPosicao'
import { CardsDaPosicao, TabelaDaPosicao } from '@/features/stock/ListaDaPosicao'
import { useFiltrosDaPosicao } from '@/features/stock/useFiltrosDaPosicao'
import { useAuth } from '@/hooks/useAuth'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { cn } from '@/lib/utils'
import { listarCategorias } from '@/services/categoriaService'
import { buscarResumoDaPosicao, listarPosicaoDeEstoque } from '@/services/estoqueService'
import type { Categoria } from '@/types/catalogo'
import type { PosicaoDeEstoque, ResumoDaPosicao, TipoMovimento } from '@/types/estoque'
import type { PaginaResponse } from '@/types/produto'

/** Item com o modal de ajuste aberto, o tipo inicial e o botao que o abriu (recebe o foco ao fechar). */
interface Ajuste {
  item: PosicaoDeEstoque
  tipo: TipoMovimento
  origem: HTMLElement
}

const ALTURA_DO_BOTAO = 'h-11 md:h-9'

/** "1.240 produtos" ou, com filtro, "37 produtos encontrados" (singular com 1). */
function tituloDaLista(total: number | undefined, filtrado: boolean): string {
  if (!total) {
    return 'Produtos'
  }
  const quantidade = total.toLocaleString('pt-BR')
  if (filtrado) {
    return total === 1 ? '1 produto encontrado' : `${quantidade} produtos encontrados`
  }
  return total === 1 ? '1 produto' : `${quantidade} produtos`
}

/**
 * Area Estoque (spec de Estoque, regras 22 a 25): a posicao de todos os
 * produtos que controlam estoque, com o resumo em cards, busca, filtros e
 * ordem na URL, e o ajuste (so ADMIN) pelo mesmo modal do produto. O produto
 * com saldo negativo (venda com "Vender sem estoque") ganha "Regularizar",
 * que abre o ajuste na Contagem.
 */
export function EstoquePage() {
  const location = useLocation()
  const { usuario } = useAuth()
  const somenteLeitura = usuario?.perfil !== 'ADMIN'
  const { filtros, alterar, limpar, temFiltroAtivo, quantidadeDeFiltros } = useFiltrosDaPosicao()
  const idDoTitulo = useId()

  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [ajuste, setAjuste] = useState<Ajuste | null>(null)

  // Leva a URL atual da posicao para a pagina do produto voltar ao mesmo lugar.
  const estadoParaProduto: EstadoParaProduto = { voltarPara: `${location.pathname}${location.search}` }

  // --- Busca: texto local, aplicado na URL 300 ms depois de parar de digitar ou no Enter
  // (mesmo comportamento da lista de produtos).
  const [textoBusca, setTextoBusca] = useState(filtros.busca)
  const [buscaDaUrl, setBuscaDaUrl] = useState(filtros.busca)
  if (filtros.busca !== buscaDaUrl) {
    setBuscaDaUrl(filtros.busca)
    if (filtros.busca !== textoBusca.trim()) {
      setTextoBusca(filtros.busca)
    }
  }
  const buscaComAtraso = useBuscaComAtraso(textoBusca)
  const ultimaBuscaComAtraso = useRef(buscaComAtraso)
  useEffect(() => {
    if (buscaComAtraso === ultimaBuscaComAtraso.current) {
      return
    }
    ultimaBuscaComAtraso.current = buscaComAtraso
    alterar({ busca: buscaComAtraso })
  }, [buscaComAtraso, alterar])

  const limparTudo = () => {
    setTextoBusca('')
    limpar()
  }

  const consulta = useQuery<PaginaResponse<PosicaoDeEstoque>>({
    queryKey: chaveDaPosicao(filtros),
    queryFn: ({ signal }) => listarPosicaoDeEstoque(filtros, signal),
    placeholderData: keepPreviousData,
  })
  const { data: pagina, isPending, isError, isFetching, isPlaceholderData, refetch } = consulta
  const buscando = textoBusca.trim() !== filtros.busca || (isPlaceholderData && filtros.busca !== '')

  const resumoQuery = useQuery<ResumoDaPosicao>({
    queryKey: chaveDoResumo(filtros),
    queryFn: ({ signal }) => buscarResumoDaPosicao(filtros, signal),
    placeholderData: keepPreviousData,
  })

  const categoriasQuery = useQuery<Categoria[]>({
    queryKey: TODAS_CATEGORIAS_QUERY_KEY,
    queryFn: () => listarCategorias(),
  })
  const categorias = categoriasQuery.data ?? []
  const categoriaExibida =
    categoriasQuery.isSuccess && !categorias.some((categoria) => categoria.id === filtros.categoria)
      ? null
      : filtros.categoria

  // Pagina alem do fim (ex.: o filtro deixou menos itens): vai para a ultima, substituindo o historico.
  const ultimaPagina = pagina ? Math.max(1, Math.ceil(pagina.totalItens / pagina.tamanho)) : 1
  const alemDoFim =
    pagina !== undefined &&
    !isPlaceholderData &&
    pagina.itens.length === 0 &&
    pagina.totalItens > 0 &&
    filtros.pagina > ultimaPagina
  useEffect(() => {
    if (alemDoFim && !isFetching) {
      alterar({ pagina: ultimaPagina }, { substituir: true })
    }
  }, [alemDoFim, isFetching, ultimaPagina, alterar])

  const tituloRef = useRef<HTMLHeadingElement>(null)
  const mudarPagina = (proxima: number) => {
    alterar({ pagina: proxima })
    tituloRef.current?.scrollIntoView?.({ block: 'start' })
    tituloRef.current?.focus({ preventScroll: true })
  }

  const propsDaLista = {
    somenteLeitura,
    estadoParaProduto,
    aoAjustar: (item: PosicaoDeEstoque, tipo: TipoMovimento, origem: HTMLElement) => setAjuste({ item, tipo, origem }),
  }

  const itens = pagina?.itens ?? []
  const titulo = tituloDaLista(pagina?.totalItens, temFiltroAtivo)
  const anuncio =
    pagina && !isPlaceholderData && pagina.totalItens > 0
      ? `${titulo}. Página ${filtros.pagina.toLocaleString('pt-BR')} de ${ultimaPagina.toLocaleString('pt-BR')}.`
      : ''

  const conteudoVazio = (): ReactNode =>
    temFiltroAtivo ? (
      <ListaVazia mensagem="Nenhum produto neste filtro." comFiltro>
        <Button type="button" variant="outline" className={ALTURA_DO_BOTAO} onClick={limparTudo}>
          Limpar filtros
        </Button>
      </ListaVazia>
    ) : (
      // Sem filtro, o status e o padrao (ativos): pode haver inativos que controlam estoque.
      <ListaVazia mensagem="Nenhum produto ativo controla estoque.">
        <Button type="button" variant="outline" className={ALTURA_DO_BOTAO} onClick={() => alterar({ status: 'todos' })}>
          Ver também os inativos
        </Button>
        <Button asChild variant="outline" className={ALTURA_DO_BOTAO}>
          <Link to={ROTA_PRODUTOS}>Ir para Produtos</Link>
        </Button>
      </ListaVazia>
    )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Estoque</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Saldo, situação e valor a custo de todos os produtos que controlam estoque.
        </p>
      </div>

      {somenteLeitura && (
        <AvisoSomenteLeitura texto="Somente administradores podem ajustar o estoque. Você está no modo leitura." />
      )}

      <FeedbackCatalogo sucesso={mensagemSucesso} erro={null} />

      <div className="space-y-2">
        <CardsDoResumo
          resumo={resumoQuery.data}
          situacao={filtros.situacao}
          aoEscolher={(situacao) => alterar({ situacao })}
        />
        {resumoQuery.isError && !resumoQuery.data && (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            Não foi possível carregar o resumo do estoque.
            <Button
              type="button"
              variant="link"
              className="h-auto p-0"
              aria-label="Tentar carregar o resumo de novo"
              onClick={() => resumoQuery.refetch()}
            >
              Tentar de novo
            </Button>
          </p>
        )}
      </div>

      <Card>
        <CardContent>
          <FiltrosDaPosicao
            filtros={filtros}
            alterar={alterar}
            aoLimpar={limparTudo}
            temFiltroAtivo={temFiltroAtivo}
            quantidadeDeFiltros={quantidadeDeFiltros}
            textoBusca={textoBusca}
            aoDigitarBusca={setTextoBusca}
            aoBuscarAgora={() => alterar({ busca: textoBusca })}
            buscando={buscando}
            categorias={categorias}
            categoriaExibida={categoriaExibida}
            erroNasCategorias={categoriasQuery.isError}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2
            id={idDoTitulo}
            ref={tituloRef}
            tabIndex={-1}
            className="scroll-mt-4 font-display font-semibold leading-none outline-none"
          >
            {titulo}
          </h2>
          <p aria-live="polite" className="sr-only">
            {anuncio}
          </p>
        </CardHeader>
        <CardContent>
          {isPending || alemDoFim ? (
            <EsqueletoDaLista />
          ) : isError && !pagina ? (
            <div className="space-y-3">
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Não foi possível carregar o estoque.</span>
              </div>
              <Button type="button" variant="outline" className={ALTURA_DO_BOTAO} onClick={() => refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : itens.length === 0 ? (
            conteudoVazio()
          ) : (
            <div
              aria-busy={isPlaceholderData}
              className={cn('space-y-4 transition-opacity duration-150', isPlaceholderData && 'opacity-60')}
            >
              <TabelaDaPosicao
                itens={itens}
                ordem={filtros.ordem}
                aoOrdenar={(ordem) => alterar({ ordem })}
                idDoTitulo={idDoTitulo}
                {...propsDaLista}
              />
              <CardsDaPosicao itens={itens} {...propsDaLista} />
              {pagina && (
                <PaginacaoLista
                  pagina={filtros.pagina}
                  total={pagina.totalItens}
                  tamanho={pagina.tamanho}
                  aoMudar={mudarPagina}
                  className="border-t pt-4"
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {ajuste && (
        <ModalAjusteEstoque
          aberto
          produtoId={ajuste.item.id}
          saldo={ajuste.item.saldo}
          sigla={ajuste.item.unidade.sigla}
          fracionada={ajuste.item.unidade.fracionada}
          custo={ajuste.item.custo}
          tipoInicial={ajuste.tipo}
          aoFechar={() => setAjuste(null)}
          focoAoFechar={() => (ajuste.origem.isConnected ? ajuste.origem : null)}
          aoConcluir={(movimento) => {
            // O modal ja invalidou o estoque: a posicao e o resumo recarregam com o saldo novo.
            const mensagem = mensagemDeSucesso(movimento, ajuste.item.unidade.sigla, ajuste.item.custo)
            setAjuste(null)
            setMensagemSucesso(`${ajuste.item.nome}: ${mensagem.charAt(0).toLowerCase()}${mensagem.slice(1)}`)
          }}
        />
      )}
    </div>
  )
}

function EsqueletoDaLista() {
  return (
    <div role="status" aria-label="Carregando o estoque" className="space-y-3">
      <span className="sr-only">Carregando o estoque...</span>
      {Array.from({ length: 5 }, (_, indice) => (
        <div key={indice} aria-hidden="true" className="flex items-center gap-4">
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="hidden h-4 w-20 animate-pulse rounded bg-muted md:block" />
        </div>
      ))}
    </div>
  )
}

function ListaVazia({ mensagem, comFiltro = false, children }: { mensagem: string; comFiltro?: boolean; children?: ReactNode }) {
  const idMensagem = useId()
  const Icone = comFiltro ? SearchX : Boxes
  return (
    <section
      aria-labelledby={idMensagem}
      className="flex max-w-xl flex-col items-start gap-3 rounded-md bg-muted/50 p-4 sm:flex-row"
    >
      <Icone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-3">
        <p id={idMensagem} className="text-sm font-medium">
          {mensagem}
        </p>
        {children && <div className="flex flex-wrap gap-2">{children}</div>}
      </div>
    </section>
  )
}
