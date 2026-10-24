import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Package, Plus, Search, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PaginacaoLista } from '@/components/ui/paginacao-lista'
import { FORNECEDORES_QUERY_KEY, PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { ConfirmarExclusaoDialog } from '@/features/catalog/ConfirmarExclusaoDialog'
import { FILTROS_PADRAO } from '@/features/products/listagem/useFiltrosDaListaDeProdutos'
import { rotaDoProduto } from '@/features/products/navegacaoProdutos'
import { SeloStatus } from '@/features/products/SeloStatus'
import { chaveDosProdutosDoFornecedor } from '@/features/suppliers/fornecedorQuery'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { HttpError } from '@/services/httpClient'
import {
  adicionarProdutoAoFornecedor,
  listarProdutosDoFornecedor,
  removerProdutoDoFornecedor,
} from '@/services/fornecedorService'
import { listarProdutos } from '@/services/produtoService'
import type { ProdutoDoFornecedor } from '@/types/fornecedor'
import type { PaginaResponse, Produto } from '@/types/produto'

/** Resultados da busca de produto para adicionar (os primeiros, por nome). */
const TAMANHO_DA_BUSCA = 8

interface ProdutosDoFornecedorProps {
  fornecedorId: string
  somenteLeitura: boolean
  /** Feedback da pagina: "Produto adicionado ao fornecedor." / "Produto removido do fornecedor." ou o erro. */
  aoInformar: (feedback: { sucesso: string } | { erro: string }) => void
}

function mensagemDeErro(erro: unknown, acao: 'adicionar' | 'remover'): string {
  if (erro instanceof HttpError) {
    if (erro.status === 403) {
      return 'Somente administradores podem alterar os produtos do fornecedor.'
    }
    if (erro.status === 404) {
      return 'O produto ou o fornecedor não existe mais. A lista foi atualizada.'
    }
  }
  return acao === 'adicionar'
    ? 'Não foi possível adicionar o produto. Tente novamente.'
    : 'Não foi possível remover o produto. Tente novamente.'
}

/**
 * Produtos que vende (spec B5 §4.4 e §8.3, secao 6), so na edicao: busca de
 * produto por nome ou codigo com "Adicionar" e a lista paginada (Nº, nome,
 * codigo) com "Remover". E a mesma lista que aparece no produto. Remover o
 * fornecedor da ultima compra de um produto pede confirmacao (o backend limpa
 * esse campo do produto).
 */
export function ProdutosDoFornecedor({ fornecedorId, somenteLeitura, aoInformar }: ProdutosDoFornecedorProps) {
  const queryClient = useQueryClient()
  const idBusca = useId()
  const idResultados = useId()
  const [pagina, setPagina] = useState(1)
  const [termo, setTermo] = useState('')
  const [confirmando, setConfirmando] = useState<ProdutoDoFornecedor | null>(null)
  const termoComAtraso = useBuscaComAtraso(termo.trim())

  const listaQuery = useQuery<PaginaResponse<ProdutoDoFornecedor>>({
    queryKey: chaveDosProdutosDoFornecedor(fornecedorId, pagina),
    queryFn: () => listarProdutosDoFornecedor(fornecedorId, pagina),
    placeholderData: keepPreviousData,
  })

  const buscaQuery = useQuery<PaginaResponse<Produto>>({
    queryKey: [...PRODUTOS_QUERY_KEY, 'busca-para-fornecedor', termoComAtraso],
    queryFn: ({ signal }) =>
      listarProdutos({ ...FILTROS_PADRAO, busca: termoComAtraso, status: 'todos', tamanho: TAMANHO_DA_BUSCA }, signal),
    enabled: !somenteLeitura && termoComAtraso !== '',
  })

  const atualizar = async () => {
    // A lista, o "quantidadeProdutos" do fornecedor e os fornecedores dos produtos mudam juntos.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: FORNECEDORES_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY, refetchType: 'none' }),
    ])
  }

  const adicionarMutation = useMutation<void, unknown, Produto>({
    mutationFn: (produto) => adicionarProdutoAoFornecedor(fornecedorId, produto.id),
    onSuccess: async () => {
      await atualizar()
      setTermo('')
      aoInformar({ sucesso: 'Produto adicionado ao fornecedor.' })
    },
    onError: async (erro) => {
      await atualizar()
      aoInformar({ erro: mensagemDeErro(erro, 'adicionar') })
    },
  })

  const removerMutation = useMutation<void, unknown, ProdutoDoFornecedor>({
    mutationFn: (produto) => removerProdutoDoFornecedor(fornecedorId, produto.id),
    onSuccess: async () => {
      await atualizar()
      aoInformar({ sucesso: 'Produto removido do fornecedor.' })
    },
    onError: async (erro) => {
      await atualizar()
      aoInformar({ erro: mensagemDeErro(erro, 'remover') })
    },
    onSettled: () => setConfirmando(null),
  })

  const pedirRemocao = (produto: ProdutoDoFornecedor) => {
    if (produto.fornecedorDaUltimaCompra) {
      setConfirmando(produto)
      return
    }
    removerMutation.mutate(produto)
  }

  const dados = listaQuery.data
  const itens = dados?.itens ?? []
  const resultados = buscaQuery.data?.itens ?? []
  const buscando = termo.trim() !== '' && (termo.trim() !== termoComAtraso || buscaQuery.isFetching)

  return (
    <div className="space-y-4">
      {!somenteLeitura && (
        <div className="max-w-xl space-y-2">
          <label htmlFor={idBusca} className="text-sm font-medium">
            Adicionar produto
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id={idBusca}
              type="search"
              value={termo}
              autoComplete="off"
              placeholder="Buscar pelo nome ou código"
              aria-controls={idResultados}
              onChange={(event) => setTermo(event.target.value)}
              onKeyDown={(event) => {
                // Enter aqui nao salva o fornecedor: a busca ja acontece enquanto se digita.
                if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey) {
                  event.preventDefault()
                }
              }}
              className="h-11 pl-9 md:h-9"
            />
          </div>
          <div id={idResultados} aria-live="polite">
            {buscando && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Buscando produtos...
              </p>
            )}
            {!buscando && termoComAtraso !== '' && buscaQuery.isError && (
              <p className="text-sm text-destructive">Não foi possível buscar os produtos.</p>
            )}
            {!buscando && termoComAtraso !== '' && buscaQuery.isSuccess && resultados.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum produto encontrado para "{termoComAtraso}".</p>
            )}
            {!buscando && resultados.length > 0 && termoComAtraso !== '' && (
              <ul className="divide-y rounded-md border" aria-label="Produtos encontrados">
                {resultados.map((produto) => (
                  <li key={produto.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{produto.nome}</span>
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        Nº {produto.numero}
                        {produto.codigo !== null && ` · Cód. ${produto.codigo}`}
                        {!produto.ativo && ' · Inativo'}
                      </span>
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-11 shrink-0 md:h-9"
                      disabled={adicionarMutation.isPending}
                      aria-label={`Adicionar ${produto.nome}`}
                      onClick={() => adicionarMutation.mutate(produto)}
                    >
                      {adicionarMutation.isPending && adicionarMutation.variables?.id === produto.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Plus className="h-4 w-4" aria-hidden="true" />
                      )}
                      Adicionar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {listaQuery.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando produtos do fornecedor...
        </p>
      ) : listaQuery.isError && !dados ? (
        <div className="space-y-3">
          <div
            role="alert"
            className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Não foi possível carregar os produtos do fornecedor.</span>
          </div>
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => listaQuery.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : itens.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Package className="h-4 w-4" aria-hidden="true" />
          Nenhum produto ligado a este fornecedor.
        </p>
      ) : (
        <div className="space-y-3">
          <ul className="divide-y rounded-md border" aria-label="Produtos que vende">
            {itens.map((produto) => (
              <li key={produto.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={rotaDoProduto(produto.id)}
                      className="font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
                    >
                      {produto.nome}
                    </Link>
                    {!produto.ativo && <SeloStatus ativo={false} />}
                    {produto.fornecedorDaUltimaCompra && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        Última compra
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Nº {produto.numero}
                    {produto.codigo !== null && ` · Cód. ${produto.codigo}`}
                  </p>
                </div>
                {!somenteLeitura && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 text-muted-foreground hover:text-destructive md:h-9"
                    disabled={removerMutation.isPending}
                    aria-label={`Remover ${produto.nome}`}
                    onClick={() => pedirRemocao(produto)}
                  >
                    {removerMutation.isPending && removerMutation.variables?.id === produto.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    Remover
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {dados && (
            <PaginacaoLista pagina={pagina} total={dados.totalItens} tamanho={dados.tamanho} aoMudar={setPagina} />
          )}
        </div>
      )}

      <ConfirmarExclusaoDialog
        aberto={confirmando !== null}
        titulo="Remover o produto do fornecedor?"
        descricao={
          <p>{`Este é o fornecedor da última compra de ${confirmando?.nome ?? ''}. Remover mesmo assim?`}</p>
        }
        excluindo={false}
        podeExcluir={false}
        alternativa={{
          rotulo: 'Remover',
          icone: Trash2,
          executando: removerMutation.isPending,
          onExecutar: () => confirmando && removerMutation.mutate(confirmando),
        }}
        onConfirmar={() => undefined}
        onCancelar={() => setConfirmando(null)}
      />
    </div>
  )
}
