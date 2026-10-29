import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Package, Plus, SearchX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { PaginacaoLista } from '@/components/ui/paginacao-lista'
import {
  chaveDaListaDeProdutos,
  PRODUTOS_EXISTENTES_QUERY_KEY,
  PRODUTOS_QUERY_KEY,
  TODAS_CATEGORIAS_QUERY_KEY,
} from '@/features/catalog/catalogoQuery'
import { AvisoSomenteLeitura, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { mensagemDeSucesso } from '@/features/products/estoque/ajusteEstoque'
import { ModalAjusteEstoque } from '@/features/products/estoque/ModalAjusteEstoque'
import { CardsProdutos } from '@/features/products/listagem/CardsProdutos'
import { fornecedorParaACompra } from '@/features/products/fornecedoresGravados'
import { FiltrosProdutos } from '@/features/products/listagem/FiltrosProdutos'
import { TabelaProdutos } from '@/features/products/listagem/TabelaProdutos'
import { FILTROS_PADRAO, useFiltrosDaListaDeProdutos } from '@/features/products/listagem/useFiltrosDaListaDeProdutos'
import { ROTA_NOVO_PRODUTO, sucessoDaNavegacao, type EstadoParaProduto } from '@/features/products/navegacaoProdutos'
import { useAuth } from '@/hooks/useAuth'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { cn } from '@/lib/utils'
import { listarCategorias } from '@/services/categoriaService'
import { inativarProduto, listarProdutos, reativarProduto } from '@/services/produtoService'
import type { Categoria } from '@/types/catalogo'
import type { FiltrosDaListaDeProdutos, PaginaResponse, Produto } from '@/types/produto'

/** Produto com o modal "Ajustar estoque" aberto e o botao que o abriu (recebe o foco ao fechar). */
interface Ajuste {
  produto: Produto
  origem: HTMLElement
}

const ALTURA_DO_BOTAO = 'h-11 md:h-9'

/** "1.240 produtos" ou, com filtro, "37 produtos encontrados" (singular com 1). */
function tituloDaLista(total: number | undefined, filtrado: boolean): string {
  if (!total) {
    return 'Lista de produtos'
  }
  const quantidade = total.toLocaleString('pt-BR')
  if (filtrado) {
    return total === 1 ? '1 produto encontrado' : `${quantidade} produtos encontrados`
  }
  return total === 1 ? '1 produto' : `${quantidade} produtos`
}

/** Algum filtro que restringe alem da busca (o status "todos" nao restringe). */
function temRestricao(filtros: FiltrosDaListaDeProdutos): boolean {
  return (
    filtros.status === 'inativos' || filtros.categoria.length > 0 || filtros.estoque.length > 0 || filtros.promocao
  )
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
  const { filtros, alterar, limpar, temFiltroAtivo, quantidadeDeFiltros } = useFiltrosDaListaDeProdutos()
  const idDoTitulo = useId()

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
    // So reescreve o campo quando a URL mudou por fora (historico); a busca do
    // proprio campo chega aparada e nao pode comer o espaco recem-digitado.
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

  // "Limpar filtros" tambem limpa o texto pendente: senao o atraso gravaria a busca de novo.
  const limparTudo = () => {
    setTextoBusca('')
    limpar()
  }

  // --- Consulta: cada combinacao de filtros e uma entrada do cache; a troca
  // cancela a requisicao anterior (signal) e mantem os itens atuais na tela.
  const consulta = useQuery<PaginaResponse<Produto>>({
    queryKey: chaveDaListaDeProdutos(filtros),
    queryFn: ({ signal }) => listarProdutos(filtros, signal),
    placeholderData: keepPreviousData,
  })
  const { data: pagina, isPending, isError, isFetching, isPlaceholderData, refetch } = consulta
  // So a busca liga o indicador: digitacao pendente ou a consulta de outro termo a caminho.
  const buscando = textoBusca.trim() !== filtros.busca || (isPlaceholderData && filtros.busca !== '')

  const categoriasQuery = useQuery<Categoria[]>({
    queryKey: TODAS_CATEGORIAS_QUERY_KEY,
    queryFn: () => listarCategorias(),
  })
  const categorias = categoriasQuery.data ?? []
  // Categorias da URL que nao existem mais (ou de outra empresa) saem do seletor;
  // sem nenhuma, ele mostra "Todas" e a lista vazia oferece "Limpar filtros".
  // Durante a carga ou se as categorias falharem, as da URL continuam (nao da
  // para saber se existem).
  const categoriaExibida = categoriasQuery.isSuccess
    ? filtros.categoria.filter((id) => categorias.some((categoria) => categoria.id === id))
    : filtros.categoria

  // --- Pagina alem do fim (ex.: estava na 5 e o filtro deixou 2): vai para a
  // ultima, substituindo a entrada do historico. So com a resposta final
  // (`!isFetching`); a pagina pedida so diminui, entao nao ha laco.
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

  // --- Lista vazia sem filtro com o status padrao (ativos): existe algum inativo?
  const vazioSemFiltro = pagina !== undefined && !isPlaceholderData && pagina.totalItens === 0 && !temFiltroAtivo
  const existentesQuery = useQuery<PaginaResponse<Produto>>({
    queryKey: PRODUTOS_EXISTENTES_QUERY_KEY,
    queryFn: ({ signal }) => listarProdutos({ ...FILTROS_PADRAO, status: 'todos', tamanho: 1 }, signal),
    enabled: vazioSemFiltro,
  })

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
    onSuccess: async (_, { produto, proximoAtivo }) => {
      await queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })
      setErroGeral(null)
      setMensagemSucesso(
        proximoAtivo ? `${produto.nome} reativado.` : `${produto.nome} inativado. Ele aparece em Status: Inativos.`,
      )
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
  const titulo = tituloDaLista(pagina?.totalItens, temFiltroAtivo)
  const anuncio =
    pagina && !isPlaceholderData && pagina.totalItens > 0
      ? `${titulo}. Página ${filtros.pagina.toLocaleString('pt-BR')} de ${ultimaPagina.toLocaleString('pt-BR')}.`
      : ''

  const linkDeCadastro = !somenteLeitura && (
    <Button asChild className={ALTURA_DO_BOTAO}>
      <Link to={ROTA_NOVO_PRODUTO} state={estadoParaProduto}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Cadastrar produto
      </Link>
    </Button>
  )
  const botaoLimpar = (
    <Button type="button" variant="outline" className={ALTURA_DO_BOTAO} onClick={limparTudo}>
      Limpar filtros
    </Button>
  )

  const conteudoVazio = (): ReactNode => {
    const busca = filtros.busca
    if (busca && temRestricao(filtros)) {
      return (
        <ListaVazia mensagem={`Nenhum produto encontrado para "${busca}" com os filtros escolhidos.`} comFiltro>
          {botaoLimpar}
        </ListaVazia>
      )
    }
    if (busca && filtros.status === 'ativos') {
      return (
        <ListaVazia mensagem={`Nenhum produto ativo encontrado para "${busca}".`} comFiltro>
          <Button type="button" className={ALTURA_DO_BOTAO} onClick={() => alterar({ status: 'todos' })}>
            Buscar também nos inativos
          </Button>
          {botaoLimpar}
        </ListaVazia>
      )
    }
    if (busca) {
      return (
        <ListaVazia mensagem={`Nenhum produto encontrado para "${busca}".`} comFiltro>
          {botaoLimpar}
        </ListaVazia>
      )
    }
    if (temFiltroAtivo) {
      return (
        <ListaVazia mensagem="Nenhum produto encontrado com os filtros escolhidos." comFiltro>
          {botaoLimpar}
        </ListaVazia>
      )
    }
    if (existentesQuery.isPending) {
      return <EsqueletoDaLista />
    }
    if (existentesQuery.data?.totalItens === 0) {
      return <ListaVazia mensagem="Nenhum produto cadastrado ainda.">{linkDeCadastro}</ListaVazia>
    }
    // Existem inativos (ou nao deu para saber): texto neutro.
    return (
      <ListaVazia mensagem="Nenhum produto ativo.">
        <Button type="button" variant="outline" className={ALTURA_DO_BOTAO} onClick={() => alterar({ status: 'todos' })}>
          Ver todos
        </Button>
        {linkDeCadastro}
      </ListaVazia>
    )
  }

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
                <span>Não foi possível carregar os produtos.</span>
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
              <TabelaProdutos
                produtos={itens}
                ordem={filtros.ordem}
                aoOrdenar={(ordem) => alterar({ ordem })}
                idDoTitulo={idDoTitulo}
                {...propsDaLista}
              />
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
          custo={ajuste.produto.custo}
          fornecedorDaCompra={fornecedorParaACompra(ajuste.produto)}
          nome={ajuste.produto.nome}
          aoFechar={() => setAjuste(null)}
          focoAoFechar={() => (ajuste.origem.isConnected ? ajuste.origem : null)}
          aoConcluir={(movimento) => {
            // O modal ja invalidou os produtos: a lista recarrega com o saldo novo.
            const mensagem = mensagemDeSucesso(movimento, ajuste.produto.unidade.sigla, ajuste.produto.custo)
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

/** Estado vazio: regiao nomeada pela mensagem, com as acoes possiveis. */
function ListaVazia({ mensagem, comFiltro = false, children }: { mensagem: string; comFiltro?: boolean; children?: ReactNode }) {
  const idMensagem = useId()
  const Icone = comFiltro ? SearchX : Package
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
