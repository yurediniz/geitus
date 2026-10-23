import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Package, Plus, SearchX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PaginacaoLista } from '@/components/ui/paginacao-lista'
import { chaveDaListaDeProdutos, PRODUTOS_QUERY_KEY, TODAS_CATEGORIAS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { AvisoSomenteLeitura, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { mensagemDeSucesso } from '@/features/products/estoque/ajusteEstoque'
import { ModalAjusteEstoque } from '@/features/products/estoque/ModalAjusteEstoque'
import { CardsProdutos } from '@/features/products/listagem/CardsProdutos'
import { FiltrosProdutos } from '@/features/products/listagem/FiltrosProdutos'
import { TabelaProdutos } from '@/features/products/listagem/TabelaProdutos'
import { useFiltrosDaListaDeProdutos } from '@/features/products/listagem/useFiltrosDaListaDeProdutos'
import { ROTA_NOVO_PRODUTO, sucessoDaNavegacao, type EstadoParaProduto } from '@/features/products/navegacaoProdutos'
import { useAuth } from '@/hooks/useAuth'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { cn } from '@/lib/utils'
import { listarCategorias } from '@/services/categoriaService'
import { inativarProduto, listarProdutos, reativarProduto } from '@/services/produtoService'
import type { Categoria } from '@/types/catalogo'
import type { PaginaResponse, Produto } from '@/types/produto'

/** Produto com o modal "Ajustar estoque" aberto e o botao que o abriu (recebe o foco ao fechar). */
interface Ajuste {
  produto: Produto
  origem: HTMLElement
}

/**
 * Lista de produtos paginada no servidor, com busca enquanto se digita,
 * filtros e ordenacao. Todo o estado fica na URL (ver
 * useFiltrosDaListaDeProdutos): voltar da pagina do produto reabre a lista
 * exatamente onde estava.
 */
export function ProdutosListaPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const { usuario } = useAuth()
  const somenteLeitura = usuario?.perfil !== 'ADMIN'
  const { filtros, alterar, limpar, temFiltroAtivo } = useFiltrosDaListaDeProdutos()

  // Sucesso vindo da pagina do produto: lido uma vez e retirado do historico,
  // para nao reaparecer ao recarregar a pagina.
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(() => sucessoDaNavegacao(location.state))
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [acaoStatusId, setAcaoStatusId] = useState<string | null>(null)
  const [ajuste, setAjuste] = useState<Ajuste | null>(null)
  const temEstadoDeNavegacao = sucessoDaNavegacao(location.state) !== null
  useEffect(() => {
    if (temEstadoDeNavegacao) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
    }
  }, [temEstadoDeNavegacao, navigate, location.pathname, location.search])

  // Leva a URL atual da lista para a pagina do produto voltar ao mesmo lugar.
  const estadoParaProduto: EstadoParaProduto = { voltarPara: `${location.pathname}${location.search}` }

  // --- Busca: texto local, aplicado na URL 300 ms depois de parar de digitar ou no Enter.
  const [textoBusca, setTextoBusca] = useState(filtros.busca)
  const [buscaDaUrl, setBuscaDaUrl] = useState(filtros.busca)
  if (filtros.busca !== buscaDaUrl) {
    setBuscaDaUrl(filtros.busca)
    // So reescreve o campo quando a URL mudou por fora (historico, "Limpar
    // filtros"); a busca do proprio campo chega aparada e nao pode comer o
    // espaco que a pessoa acabou de digitar.
    if (filtros.busca !== textoBusca.trim()) {
      setTextoBusca(filtros.busca)
    }
  }
  const buscaComAtraso = useBuscaComAtraso(textoBusca)
  const ultimaBuscaComAtraso = useRef(buscaComAtraso)
  useEffect(() => {
    // So reage quando o valor com atraso muda: uma mudanca da URL por fora
    // (historico) nao pode ser sobrescrita pelo texto antigo do campo.
    if (buscaComAtraso === ultimaBuscaComAtraso.current) {
      return
    }
    ultimaBuscaComAtraso.current = buscaComAtraso
    alterar({ busca: buscaComAtraso })
  }, [buscaComAtraso, alterar])

  // --- Consulta: cada combinacao de filtros e uma entrada do cache; a troca
  // cancela a requisicao anterior (signal) e mantem os itens atuais na tela.
  const consulta = useQuery<PaginaResponse<Produto>>({
    queryKey: chaveDaListaDeProdutos(filtros),
    queryFn: ({ signal }) => listarProdutos(filtros, signal),
    placeholderData: keepPreviousData,
  })
  const { data: pagina, isPending, isError, isFetching, isPlaceholderData, refetch } = consulta
  const buscando = textoBusca.trim() !== filtros.busca || (isFetching && filtros.busca !== '')

  const categoriasQuery = useQuery<Categoria[]>({
    queryKey: TODAS_CATEGORIAS_QUERY_KEY,
    queryFn: () => listarCategorias(),
  })
  const categorias = categoriasQuery.data ?? []
  // Categoria da URL que nao existe mais (ou de outra empresa): o seletor
  // mostra "Todas"; a lista vem vazia e oferece "Limpar filtros".
  const categoriaExibida =
    filtros.categoria !== null && categorias.some((categoria) => categoria.id === filtros.categoria)
      ? filtros.categoria
      : null

  // --- Pagina alem do fim (ex.: estava na 5 e o filtro deixou 2): vai para a
  // ultima, substituindo a entrada do historico. A pagina pedida so diminui,
  // entao nao ha laco; a marca evita repetir a mesma correcao.
  const ultimaPagina = pagina ? Math.max(1, Math.ceil(pagina.totalItens / pagina.tamanho)) : 1
  const alemDoFim =
    pagina !== undefined &&
    !isPlaceholderData &&
    pagina.itens.length === 0 &&
    pagina.totalItens > 0 &&
    filtros.pagina > ultimaPagina
  const correcaoFeita = useRef<string | null>(null)
  useEffect(() => {
    if (!alemDoFim) {
      return
    }
    const marca = JSON.stringify(filtros)
    if (correcaoFeita.current === marca) {
      return
    }
    correcaoFeita.current = marca
    alterar({ pagina: ultimaPagina }, { substituir: true })
  }, [alemDoFim, filtros, ultimaPagina, alterar])

  const tituloRef = useRef<HTMLHeadingElement>(null)
  const mudarPagina = (proxima: number) => {
    alterar({ pagina: proxima })
    tituloRef.current?.scrollIntoView?.({ block: 'start' })
    tituloRef.current?.focus({ preventScroll: true })
  }

  const statusMutation = useMutation<Produto, unknown, { produto: Produto; proximoAtivo: boolean }>({
    mutationFn: ({ produto, proximoAtivo }) =>
      proximoAtivo ? reativarProduto(produto.id) : inativarProduto(produto.id),
    onMutate: ({ produto }) => {
      setAcaoStatusId(produto.id)
    },
    onSuccess: async (_, { proximoAtivo }) => {
      await queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })
      setErroGeral(null)
      setMensagemSucesso(proximoAtivo ? 'Produto reativado com sucesso.' : 'Produto inativado com sucesso.')
    },
    onError: () => {
      setMensagemSucesso(null)
      setErroGeral('Não foi possível alterar o status do produto. Tente novamente.')
    },
    onSettled: () => {
      setAcaoStatusId(null)
    },
  })

  const propsDaLista = {
    somenteLeitura,
    estadoParaProduto,
    alterandoStatusId: acaoStatusId,
    aoAlterarStatus: (produto: Produto) => statusMutation.mutate({ produto, proximoAtivo: !produto.ativo }),
    aoAjustarEstoque: (produto: Produto, origem: HTMLElement) => setAjuste({ produto, origem }),
  }

  const itens = pagina?.itens ?? []

  return (
    <div className="space-y-6">
      <CatalogoNav />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Produtos</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Cadastre e mantenha os itens físicos vendidos pela empresa.
          </p>
        </div>

        {!somenteLeitura && (
          <Button asChild>
            <Link to={ROTA_NOVO_PRODUTO} state={estadoParaProduto}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo produto
            </Link>
          </Button>
        )}
      </div>

      {somenteLeitura && (
        <AvisoSomenteLeitura texto="Somente administradores podem gerenciar produtos. Você está no modo leitura." />
      )}

      <FeedbackCatalogo sucesso={mensagemSucesso} erro={erroGeral} />

      <Card>
        <CardContent>
          <FiltrosProdutos
            filtros={filtros}
            alterar={alterar}
            limpar={limpar}
            temFiltroAtivo={temFiltroAtivo}
            textoBusca={textoBusca}
            aoDigitarBusca={setTextoBusca}
            aoBuscarAgora={() => alterar({ busca: textoBusca })}
            buscando={buscando}
            categorias={categorias}
            categoriaExibida={categoriaExibida}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 ref={tituloRef} tabIndex={-1} className="scroll-mt-4 font-display font-semibold leading-none outline-none">
            Lista de produtos
          </h2>
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
                <span>Não foi possível carregar os produtos.</span>
              </div>
              <Button type="button" variant="outline" onClick={() => refetch()}>
                Tentar de novo
              </Button>
            </div>
          ) : itens.length === 0 ? (
            <ListaVazia
              comFiltro={temFiltroAtivo}
              busca={filtros.busca}
              podeCadastrar={!somenteLeitura}
              aoLimpar={limpar}
              estadoParaProduto={estadoParaProduto}
            />
          ) : (
            <div
              aria-busy={isPlaceholderData}
              className={cn('space-y-4 transition-opacity duration-150', isPlaceholderData && 'opacity-60')}
            >
              <TabelaProdutos produtos={itens} ordem={filtros.ordem} aoOrdenar={(ordem) => alterar({ ordem })} {...propsDaLista} />
              <CardsProdutos produtos={itens} {...propsDaLista} />
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
          produtoId={ajuste.produto.id}
          saldo={ajuste.produto.estoqueAtual}
          sigla={ajuste.produto.unidade.sigla}
          fracionada={ajuste.produto.unidade.fracionada}
          aoFechar={() => setAjuste(null)}
          focoAoFechar={() => (ajuste.origem.isConnected ? ajuste.origem : null)}
          aoConcluir={(movimento) => {
            // O modal ja invalidou os produtos: a lista recarrega com o saldo novo.
            const mensagem = mensagemDeSucesso(movimento, ajuste.produto.unidade.sigla)
            setAjuste(null)
            setErroGeral(null)
            setMensagemSucesso(`${ajuste.produto.nome}: ${mensagem.charAt(0).toLowerCase()}${mensagem.slice(1)}`)
          }}
        />
      )}
    </div>
  )
}

/** Esqueleto da primeira carga (e da correcao de pagina alem do fim). */
function EsqueletoDaLista() {
  return (
    <div role="status" aria-label="Carregando produtos" className="space-y-3">
      <span className="sr-only">Carregando produtos...</span>
      {Array.from({ length: 5 }, (_, indice) => (
        <div key={indice} aria-hidden="true" className="flex items-center gap-4">
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-muted md:block" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
          <div className="hidden h-4 w-16 animate-pulse rounded bg-muted md:block" />
        </div>
      ))}
    </div>
  )
}

interface ListaVaziaProps {
  comFiltro: boolean
  busca: string
  podeCadastrar: boolean
  aoLimpar: () => void
  estadoParaProduto: EstadoParaProduto
}

function ListaVazia({ comFiltro, busca, podeCadastrar, aoLimpar, estadoParaProduto }: ListaVaziaProps) {
  if (comFiltro) {
    return (
      <div className="flex max-w-xl flex-col items-start gap-3 rounded-md bg-muted/50 p-4 sm:flex-row">
        <SearchX className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {busca
              ? `Nenhum produto encontrado para "${busca}".`
              : 'Nenhum produto encontrado com os filtros escolhidos.'}
          </p>
          <Button type="button" variant="outline" onClick={aoLimpar}>
            Limpar filtros
          </Button>
        </div>
      </div>
    )
  }
  return (
    <div className="flex max-w-xl flex-col items-start gap-3 rounded-md bg-muted/50 p-4 sm:flex-row">
      <Package className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-3">
        <p className="text-sm font-medium">Nenhum produto cadastrado ainda.</p>
        {podeCadastrar && (
          <Button asChild>
            <Link to={ROTA_NOVO_PRODUTO} state={estadoParaProduto}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Cadastrar produto
            </Link>
          </Button>
        )}
      </div>
    </div>
  )
}
