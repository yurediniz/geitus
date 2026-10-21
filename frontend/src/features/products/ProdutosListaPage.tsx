import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Eye, Loader2, Package, Pencil, Plus, RotateCcw, Search, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { AvisoSomenteLeitura, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { formatarMoeda, formatarPercentual, formatarQuantidade } from '@/features/products/formatacaoProduto'
import {
  ROTA_NOVO_PRODUTO,
  rotaDoProduto,
  sucessoDaNavegacao,
  type EstadoParaProduto,
} from '@/features/products/navegacaoProdutos'
import { SeloStatus } from '@/features/products/SeloStatus'
import { useAuth } from '@/hooks/useAuth'
import { inativarProduto, listarProdutos, reativarProduto } from '@/services/produtoService'
import type { Produto, ProdutoStatusFiltro } from '@/types/produto'

const STATUS_VALIDOS: readonly ProdutoStatusFiltro[] = ['todos', 'ativos', 'inativos']

function lerStatus(valor: string | null): ProdutoStatusFiltro {
  return STATUS_VALIDOS.find((status) => status === valor) ?? 'todos'
}

/**
 * Lista de produtos. Busca e status ficam na URL (`?busca=&status=`): voltar da
 * pagina do produto (ou pelo historico) reabre o mesmo filtro.
 */
export function ProdutosListaPage() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const { usuario } = useAuth()
  const somenteLeitura = usuario?.perfil !== 'ADMIN'
  const [searchParams, setSearchParams] = useSearchParams()
  const busca = (searchParams.get('busca') ?? '').trim()
  const status = lerStatus(searchParams.get('status'))

  // Sucesso vindo da pagina do produto: lido uma vez e retirado do historico,
  // para nao reaparecer ao recarregar a pagina.
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(() => sucessoDaNavegacao(location.state))
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [acaoStatusId, setAcaoStatusId] = useState<string | null>(null)
  const temEstadoDeNavegacao = sucessoDaNavegacao(location.state) !== null
  useEffect(() => {
    if (temEstadoDeNavegacao) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
    }
  }, [temEstadoDeNavegacao, navigate, location.pathname, location.search])

  // Leva a URL atual da lista para a pagina do produto voltar ao mesmo filtro.
  const estadoParaProduto: EstadoParaProduto = { voltarPara: `${location.pathname}${location.search}` }

  const produtosQueryKey = useMemo(() => [...PRODUTOS_QUERY_KEY, { busca, status }], [busca, status])

  const {
    data: produtos = [],
    isPending,
    isError,
    refetch,
  } = useQuery<Produto[]>({
    queryKey: produtosQueryKey,
    queryFn: () => listarProdutos({ busca, status }),
  })

  const atualizarFiltros = (novos: { busca: string; status: ProdutoStatusFiltro }) => {
    const proximos = new URLSearchParams()
    if (novos.busca.trim()) {
      proximos.set('busca', novos.busca.trim())
    }
    if (novos.status !== 'todos') {
      proximos.set('status', novos.status)
    }
    // Substitui a entrada: cada busca nao vira um passo no "Voltar" do navegador.
    setSearchParams(proximos, { replace: true })
  }

  const aplicarBusca = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const valor = new FormData(event.currentTarget).get('busca')
    atualizarFiltros({ busca: typeof valor === 'string' ? valor : '', status })
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
        <CardContent className="pt-6">
          {/* `key`: a busca da URL muda por fora (historico, sidebar) e o campo acompanha. */}
          <form key={busca} onSubmit={aplicarBusca} className="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
            <div className="space-y-1.5">
              <label htmlFor="busca-produto" className="text-sm font-medium">
                Busca
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  id="busca-produto"
                  name="busca"
                  type="search"
                  defaultValue={busca}
                  placeholder="Nome, nome curto, SKU ou código de barras"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="status-produto" className="text-sm font-medium">
                Status
              </label>
              <NativeSelect
                id="status-produto"
                value={status}
                onChange={(event) => atualizarFiltros({ busca, status: lerStatus(event.target.value) })}
              >
                <option value="todos">Todos</option>
                <option value="ativos">Ativos</option>
                <option value="inativos">Inativos</option>
              </NativeSelect>
            </div>

            <div className="flex items-end">
              <Button type="submit" variant="outline" className="w-full lg:w-auto">
                Buscar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de produtos</CardTitle>
          <CardDescription>
            {busca ? `Resultados para "${busca}".` : 'Produtos cadastrados na empresa autenticada.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Carregando produtos...
            </p>
          )}

          {isError && (
            <div className="space-y-3">
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Não foi possível carregar os produtos.</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!isPending && !isError && produtos.length === 0 && (
            <div className="flex max-w-xl items-start gap-3 rounded-md border border-dashed p-4">
              <Package className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Nenhum produto encontrado.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Cadastre o primeiro produto ou ajuste os filtros da busca.
                </p>
              </div>
            </div>
          )}

          {!isPending && !isError && produtos.length > 0 && (
            <div className="grid gap-3">
              {produtos.map((produto) => (
                <ProdutoItem
                  key={produto.id}
                  produto={produto}
                  somenteLeitura={somenteLeitura}
                  estadoParaProduto={estadoParaProduto}
                  onAlterarStatus={() => statusMutation.mutate({ produto, proximoAtivo: !produto.ativo })}
                  alterandoStatus={acaoStatusId === produto.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

interface ProdutoItemProps {
  produto: Produto
  somenteLeitura: boolean
  estadoParaProduto: EstadoParaProduto
  onAlterarStatus: () => void
  alterandoStatus: boolean
}

/** "7891000315507" ou "7891000315507 (+2)" quando ha mais codigos. */
function textoCodigos(produto: Produto): string | null {
  const [primeiro, ...demais] = produto.codigosBarras
  if (!primeiro) {
    return null
  }
  return demais.length > 0 ? `${primeiro.codigo} (+${demais.length})` : primeiro.codigo
}

function ProdutoItem({ produto, somenteLeitura, estadoParaProduto, onAlterarStatus, alterandoStatus }: ProdutoItemProps) {
  const margem = formatarPercentual(produto.margem)
  const markup = formatarPercentual(produto.markup)
  const codigos = textoCodigos(produto)

  return (
    <article className="rounded-md border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-medium">{produto.nome}</h2>
            {produto.marca && <span className="truncate text-sm text-muted-foreground">{produto.marca}</span>}
            <SeloStatus ativo={produto.ativo} />
          </div>

          <dl className="grid gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <dt className="font-medium text-foreground">Preço</dt>
              <dd>{formatarMoeda(produto.precoVenda)}</dd>
            </div>
            {produto.custo !== null && (
              <div>
                <dt className="font-medium text-foreground">Custo</dt>
                <dd>{formatarMoeda(produto.custo)}</dd>
              </div>
            )}
            {margem && (
              <div>
                <dt className="font-medium text-foreground">Margem</dt>
                <dd>{margem}</dd>
              </div>
            )}
            {markup && (
              <div>
                <dt className="font-medium text-foreground">Markup</dt>
                <dd>{markup}</dd>
              </div>
            )}
            {produto.precoMinimo !== null && (
              <div>
                <dt className="font-medium text-foreground">Preço mínimo</dt>
                <dd>{formatarMoeda(produto.precoMinimo)}</dd>
              </div>
            )}
            {produto.sku && (
              <div>
                <dt className="font-medium text-foreground">SKU</dt>
                <dd>{produto.sku}</dd>
              </div>
            )}
            {codigos && (
              <div>
                <dt className="font-medium text-foreground">Código de barras</dt>
                <dd>{codigos}</dd>
              </div>
            )}
            {produto.categoria && (
              <div>
                <dt className="font-medium text-foreground">Categoria</dt>
                <dd>{produto.categoria.caminho}</dd>
              </div>
            )}
            <div>
              <dt className="font-medium text-foreground">Unidade</dt>
              <dd title={produto.unidade.descricao}>{produto.unidade.sigla}</dd>
            </div>
            {produto.conversaoTexto && (
              <div>
                <dt className="font-medium text-foreground">Compra</dt>
                <dd>{produto.conversaoTexto}</dd>
              </div>
            )}
            {produto.estoqueMinimo !== null && (
              <div>
                <dt className="font-medium text-foreground">Estoque mínimo</dt>
                <dd>{formatarQuantidade(produto.estoqueMinimo, produto.unidade.sigla)}</dd>
              </div>
            )}
            {produto.estoqueMaximo !== null && (
              <div>
                <dt className="font-medium text-foreground">Estoque máximo</dt>
                <dd>{formatarQuantidade(produto.estoqueMaximo, produto.unidade.sigla)}</dd>
              </div>
            )}
            {produto.pontoReposicao !== null && (
              <div>
                <dt className="font-medium text-foreground">Ponto de reposição</dt>
                <dd>{formatarQuantidade(produto.pontoReposicao, produto.unidade.sigla)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button asChild variant="outline" size="sm">
            <Link to={rotaDoProduto(produto.id)} state={estadoParaProduto}>
              {somenteLeitura ? (
                <Eye className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Pencil className="h-4 w-4" aria-hidden="true" />
              )}
              {somenteLeitura ? 'Ver detalhes' : 'Editar'}{' '}
              <span className="sr-only">{produto.nome}</span>
            </Link>
          </Button>
          {!somenteLeitura && (
            <Button type="button" variant="outline" size="sm" onClick={onAlterarStatus} disabled={alterandoStatus}>
              {alterandoStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : produto.ativo ? (
                <XCircle className="h-4 w-4" aria-hidden="true" />
              ) : (
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
              )}
              {produto.ativo ? 'Inativar' : 'Reativar'}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
