import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Plus, Search, SearchX, Truck, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { PaginacaoLista } from '@/components/ui/paginacao-lista'
import { FORNECEDORES_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { AvisoSomenteLeitura, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { sucessoDaNavegacao } from '@/features/products/navegacaoProdutos'
import { chaveDaListaDeFornecedores, FORNECEDORES_EXISTENTES_QUERY_KEY } from '@/features/suppliers/fornecedorQuery'
import { ListaDeFornecedores } from '@/features/suppliers/ListaDeFornecedores'
import { ROTA_NOVO_FORNECEDOR, type EstadoParaFornecedor } from '@/features/suppliers/navegacaoFornecedores'
import {
  FILTROS_PADRAO_FORNECEDORES,
  useFiltrosDaListaDeFornecedores,
} from '@/features/suppliers/useFiltrosDaListaDeFornecedores'
import { useAuth } from '@/hooks/useAuth'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { umDe } from '@/lib/listas'
import { cn } from '@/lib/utils'
import { inativarFornecedor, listarFornecedores, reativarFornecedor } from '@/services/fornecedorService'
import type { FornecedorItemLista } from '@/types/fornecedor'
import { STATUS_FILTRO, type PaginaResponse, type StatusFiltro } from '@/types/produto'

const ALTURA_DO_CONTROLE = 'h-11 md:h-9'

const ROTULOS_DE_STATUS: Record<StatusFiltro, string> = {
  ativos: 'Ativos',
  inativos: 'Inativos',
  todos: 'Todos',
}

/** "12 fornecedores" ou, com filtro, "3 fornecedores encontrados" (singular com 1). */
function tituloDaLista(total: number | undefined, filtrado: boolean): string {
  if (!total) {
    return 'Lista de fornecedores'
  }
  const quantidade = total.toLocaleString('pt-BR')
  if (filtrado) {
    return total === 1 ? '1 fornecedor encontrado' : `${quantidade} fornecedores encontrados`
  }
  return total === 1 ? '1 fornecedor' : `${quantidade} fornecedores`
}

/**
 * Lista de fornecedores (/produtos/fornecedores, spec B5 §8.2): paginada no
 * servidor, com busca enquanto se digita e filtro de status guardados na URL.
 */
export function FornecedoresPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const { usuario } = useAuth()
  const somenteLeitura = usuario?.perfil !== 'ADMIN'
  const { filtros, alterar, limpar, temFiltroAtivo } = useFiltrosDaListaDeFornecedores()
  const idDoTitulo = useId()
  const idBusca = useId()
  const idStatus = useId()

  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(() => sucessoDaNavegacao(location.state))
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [alterandoStatusId, setAlterandoStatusId] = useState<string | null>(null)
  const temEstadoDeNavegacao = sucessoDaNavegacao(location.state) !== null
  useEffect(() => {
    // A mensagem vinda da pagina do fornecedor e lida uma vez e sai do historico.
    if (temEstadoDeNavegacao) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
    }
  }, [temEstadoDeNavegacao, navigate, location.pathname, location.search])

  const estadoParaFornecedor: EstadoParaFornecedor = { voltarPara: `${location.pathname}${location.search}` }

  // Busca: texto local, aplicado na URL 300 ms depois de parar de digitar ou no Enter.
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

  const consulta = useQuery<PaginaResponse<FornecedorItemLista>>({
    queryKey: chaveDaListaDeFornecedores(filtros),
    queryFn: ({ signal }) => listarFornecedores(filtros, signal),
    placeholderData: keepPreviousData,
  })
  const { data: pagina, isPending, isError, isFetching, isPlaceholderData, refetch } = consulta
  const buscando = textoBusca.trim() !== filtros.busca || (isPlaceholderData && filtros.busca !== '')

  // Pagina alem do fim (o filtro deixou menos paginas): vai para a ultima.
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

  // Lista vazia sem filtro (ativos): existe algum inativo?
  const vazioSemFiltro = pagina !== undefined && !isPlaceholderData && pagina.totalItens === 0 && !temFiltroAtivo
  const existentesQuery = useQuery<PaginaResponse<FornecedorItemLista>>({
    queryKey: FORNECEDORES_EXISTENTES_QUERY_KEY,
    queryFn: ({ signal }) =>
      listarFornecedores({ ...FILTROS_PADRAO_FORNECEDORES, status: 'todos', tamanho: 1 }, signal),
    enabled: vazioSemFiltro,
  })

  const tituloRef = useRef<HTMLHeadingElement>(null)
  const mudarPagina = (proxima: number) => {
    alterar({ pagina: proxima })
    tituloRef.current?.scrollIntoView?.({ block: 'start' })
    tituloRef.current?.focus({ preventScroll: true })
  }

  const statusMutation = useMutation<unknown, unknown, FornecedorItemLista>({
    mutationFn: (fornecedor) =>
      fornecedor.ativo ? inativarFornecedor(fornecedor.id) : reativarFornecedor(fornecedor.id),
    onMutate: (fornecedor) => setAlterandoStatusId(fornecedor.id),
    onSuccess: async (_, fornecedor) => {
      await queryClient.invalidateQueries({ queryKey: FORNECEDORES_QUERY_KEY })
      setErroGeral(null)
      setMensagemSucesso(
        fornecedor.ativo
          ? `${fornecedor.razaoSocial} inativado. Ele aparece em Status: Inativos.`
          : `${fornecedor.razaoSocial} reativado.`,
      )
    },
    onError: () => {
      setMensagemSucesso(null)
      setErroGeral('Não foi possível alterar o status do fornecedor. Tente novamente.')
    },
    onSettled: () => setAlterandoStatusId(null),
  })

  const buscarAgora = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    alterar({ busca: textoBusca })
  }

  const itens = pagina?.itens ?? []
  const titulo = tituloDaLista(pagina?.totalItens, temFiltroAtivo)
  const anuncio =
    pagina && !isPlaceholderData && pagina.totalItens > 0
      ? `${titulo}. Página ${filtros.pagina.toLocaleString('pt-BR')} de ${ultimaPagina.toLocaleString('pt-BR')}.`
      : ''

  const linkDeCadastro = !somenteLeitura && (
    <Button asChild className={ALTURA_DO_CONTROLE}>
      <Link to={ROTA_NOVO_FORNECEDOR} state={estadoParaFornecedor}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Novo fornecedor
      </Link>
    </Button>
  )
  const botaoLimpar = (
    <Button type="button" variant="outline" className={ALTURA_DO_CONTROLE} onClick={limparTudo}>
      Limpar filtros
    </Button>
  )

  const conteudoVazio = (): ReactNode => {
    if (filtros.busca) {
      return (
        <ListaVazia mensagem={`Nenhum fornecedor encontrado para "${filtros.busca}".`} comFiltro>
          {filtros.status === 'ativos' && (
            <Button type="button" className={ALTURA_DO_CONTROLE} onClick={() => alterar({ status: 'todos' })}>
              Buscar também nos inativos
            </Button>
          )}
          {botaoLimpar}
        </ListaVazia>
      )
    }
    if (temFiltroAtivo) {
      return (
        <ListaVazia mensagem="Nenhum fornecedor encontrado com o filtro escolhido." comFiltro>
          {botaoLimpar}
        </ListaVazia>
      )
    }
    if (existentesQuery.isPending) {
      return <EsqueletoDaLista />
    }
    if (existentesQuery.data?.totalItens === 0) {
      return <ListaVazia mensagem="Nenhum fornecedor cadastrado.">{linkDeCadastro}</ListaVazia>
    }
    return (
      <ListaVazia mensagem="Nenhum fornecedor ativo.">
        <Button
          type="button"
          variant="outline"
          className={ALTURA_DO_CONTROLE}
          onClick={() => alterar({ status: 'todos' })}
        >
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
          <h1 className="text-2xl font-semibold tracking-tight">Fornecedores</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Quem vende para a empresa: dados da nota de compra, representantes, marcas e produtos de cada um.
          </p>
        </div>
        {!somenteLeitura && (
          <Button asChild className="pointer-coarse:h-11">
            <Link to={ROTA_NOVO_FORNECEDOR} state={estadoParaFornecedor}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo fornecedor
            </Link>
          </Button>
        )}
      </div>

      {somenteLeitura && (
        <AvisoSomenteLeitura texto="Somente administradores podem gerenciar fornecedores. Você está no modo leitura." />
      )}

      <FeedbackCatalogo sucesso={mensagemSucesso} erro={erroGeral} />

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <form role="search" onSubmit={buscarAgora} className="relative min-w-0 flex-1 basis-64">
              <label htmlFor={idBusca} className="sr-only">
                Buscar fornecedores
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id={idBusca}
                type="search"
                value={textoBusca}
                onChange={(event) => setTextoBusca(event.target.value)}
                placeholder="Nome, fantasia, CNPJ/CPF, Nº ou representante"
                autoComplete="off"
                className={cn(ALTURA_DO_CONTROLE, 'pl-9 pr-28 [&::-webkit-search-cancel-button]:appearance-none')}
              />
              <span
                aria-live="polite"
                className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 text-xs text-muted-foreground"
              >
                {buscando && (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    <span>Buscando…</span>
                  </>
                )}
              </span>
            </form>
            <div className="w-full space-y-1.5 sm:w-44">
              <label htmlFor={idStatus} className="block text-sm font-medium">
                Status
              </label>
              <NativeSelect
                id={idStatus}
                value={filtros.status}
                onChange={(event) => alterar({ status: umDe(STATUS_FILTRO, event.target.value) ?? 'ativos' })}
                className={ALTURA_DO_CONTROLE}
              >
                {STATUS_FILTRO.map((status) => (
                  <option key={status} value={status}>
                    {ROTULOS_DE_STATUS[status]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            {temFiltroAtivo && (
              <Button type="button" variant="ghost" className={ALTURA_DO_CONTROLE} onClick={limparTudo}>
                <X className="h-4 w-4" aria-hidden="true" />
                Limpar filtros
              </Button>
            )}
          </div>
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
                <span>Não foi possível carregar os fornecedores.</span>
              </div>
              <Button type="button" variant="outline" className={ALTURA_DO_CONTROLE} onClick={() => refetch()}>
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
              <ListaDeFornecedores
                fornecedores={itens}
                somenteLeitura={somenteLeitura}
                estadoParaFornecedor={estadoParaFornecedor}
                alterandoStatusId={alterandoStatusId}
                aoAlterarStatus={(fornecedor) => statusMutation.mutate(fornecedor)}
                idDoTitulo={idDoTitulo}
              />
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
    </div>
  )
}

function EsqueletoDaLista() {
  return (
    <div role="status" aria-label="Carregando fornecedores" className="space-y-3">
      <span className="sr-only">Carregando fornecedores...</span>
      {Array.from({ length: 5 }, (_, indice) => (
        <div key={indice} aria-hidden="true" className="flex items-center gap-4">
          <div className="h-4 w-10 animate-pulse rounded bg-muted" />
          <div className="h-4 flex-1 animate-pulse rounded bg-muted" />
          <div className="hidden h-4 w-32 animate-pulse rounded bg-muted md:block" />
          <div className="hidden h-4 w-24 animate-pulse rounded bg-muted md:block" />
        </div>
      ))}
    </div>
  )
}

/** Estado vazio: regiao nomeada pela mensagem, com as acoes possiveis. */
function ListaVazia({
  mensagem,
  comFiltro = false,
  children,
}: {
  mensagem: string
  comFiltro?: boolean
  children?: ReactNode
}) {
  const idMensagem = useId()
  const Icone = comFiltro ? SearchX : Truck
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
