import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { FILTROS_PADRAO } from '@/features/products/listagem/useFiltrosDaListaDeProdutos'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { cn } from '@/lib/utils'
import { listarProdutos } from '@/services/produtoService'
import type { PaginaResponse, Produto } from '@/types/produto'

/** Quantos produtos a busca mostra (os primeiros por nome). */
const PRODUTOS_NA_BUSCA = 8

/** O produto escolhido, com o que o gatilho e a opcao mostram. */
export interface ProdutoEscolhido {
  /** UUID publico do produto. */
  id: string
  numero: number
  nome: string
  ativo: boolean
}

export interface BuscaDeProdutoProps {
  /** Produto escolhido; null = nenhum. */
  valor: ProdutoEscolhido | null
  onChange: (produto: ProdutoEscolhido | null) => void
  /** Texto do gatilho sem valor e da opcao que limpa (ex.: "Todos"). */
  textoSemValor: string
  id?: string
  /** Id do rotulo externo: compoe o nome acessivel com o valor atual. */
  idRotulo?: string
  className?: string
}

function resumoDoProduto(produto: Produto): ProdutoEscolhido {
  return { id: produto.id, numero: produto.numero, nome: produto.nome, ativo: produto.ativo }
}

/** Detalhe da opcao: "Nº 15" ou "Nº 15 · Inativo". */
function detalheDoProduto(produto: ProdutoEscolhido): string {
  return produto.ativo ? `Nº ${produto.numero}` : `Nº ${produto.numero} · Inativo`
}

/**
 * Combobox de produto com busca no servidor, com a mesma busca da lista de
 * produtos (nome sem acento, codigo, EAN, SKU ou Nº), ativos e inativos, no
 * padrao do `BuscaDeFornecedor`. A primeira opcao (sem termo) limpa a escolha.
 * Teclado: setas abrem e percorrem a lista, Enter escolhe, Esc fecha.
 */
export function BuscaDeProduto({ valor, onChange, textoSemValor, id, idRotulo, className }: BuscaDeProdutoProps) {
  const idBase = useId()
  const idGatilho = id ?? `${idBase}-gatilho`
  const idValor = `${idBase}-valor`
  const idLista = `${idBase}-lista`
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [indiceAtivo, setIndiceAtivo] = useState(0)
  // Enter antes do resultado do termo atual (digitacao rapida, leitor de codigo): escolhe quando chegar.
  const [enterPendente, setEnterPendente] = useState(false)
  const listaRef = useRef<HTMLUListElement>(null)
  const termoComAtraso = useBuscaComAtraso(termo.trim())

  const consulta = useQuery<PaginaResponse<Produto>>({
    queryKey: [...PRODUTOS_QUERY_KEY, 'busca-de-produto', termoComAtraso],
    queryFn: ({ signal }) =>
      listarProdutos({ ...FILTROS_PADRAO, busca: termoComAtraso, status: 'todos', tamanho: PRODUTOS_NA_BUSCA }, signal),
    enabled: aberto,
  })

  const opcoes = useMemo<(ProdutoEscolhido | null)[]>(() => {
    const encontrados = (consulta.data?.itens ?? []).map(resumoDoProduto)
    // Sem termo, "Todos" vem primeiro para limpar a escolha.
    return termo.trim() === '' ? [null, ...encontrados] : encontrados
  }, [consulta.data, termo])

  const indiceSeguro = opcoes.length === 0 ? -1 : Math.min(indiceAtivo, opcoes.length - 1)
  const idOpcao = (indice: number) => `${idBase}-opcao-${indice}`
  const buscando = termo.trim() !== termoComAtraso || consulta.isFetching
  const trazidos = consulta.data?.itens.length ?? 0
  const total = consulta.data?.totalItens ?? 0

  /** O que dizer abaixo da lista (null = nada). */
  const aviso = (): string | null => {
    if (!consulta.isSuccess) {
      return null
    }
    if (total === 0) {
      return termoComAtraso ? `Nenhum produto encontrado para "${termoComAtraso}".` : 'Nenhum produto cadastrado.'
    }
    if (total <= trazidos) {
      return null
    }
    return termoComAtraso
      ? `Mostrando os ${PRODUTOS_NA_BUSCA} primeiros resultados. Digite mais para refinar.`
      : `Mostrando os ${PRODUTOS_NA_BUSCA} primeiros. Digite para encontrar os outros.`
  }

  useEffect(() => {
    if (indiceSeguro >= 0) {
      listaRef.current?.children.item(indiceSeguro)?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [indiceSeguro])

  const abrir = (proximo: boolean) => {
    setAberto(proximo)
    // Fechar (Esc, clique fora) cancela o Enter que esperava a busca.
    setEnterPendente(false)
    if (proximo) {
      setTermo('')
      setIndiceAtivo(0)
    }
  }

  const escolher = (produto: ProdutoEscolhido | null) => {
    setEnterPendente(false)
    onChange(produto)
    setAberto(false)
  }

  useEffect(() => {
    if (!enterPendente || !aberto || buscando) {
      return
    }
    setEnterPendente(false)
    const primeiro = opcoes[0]
    if (primeiro !== undefined) {
      onChange(primeiro)
      setAberto(false)
    }
  }, [enterPendente, aberto, buscando, opcoes, onChange])

  const aoTeclarNaBusca = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const passo = event.key === 'ArrowDown' ? 1 : -1
      setIndiceAtivo((indice) =>
        opcoes.length === 0 ? 0 : (Math.min(indice, opcoes.length - 1) + passo + opcoes.length) % opcoes.length,
      )
      return
    }
    if (event.key === 'Enter') {
      // Enter aqui escolhe; nunca envia um formulario da pagina.
      event.preventDefault()
      event.stopPropagation()
      // A lista na tela ainda e a do termo anterior: espera a do termo digitado.
      if (buscando) {
        setEnterPendente(true)
        return
      }
      if (indiceSeguro >= 0) {
        escolher(opcoes[indiceSeguro] ?? null)
      }
    }
  }

  return (
    <Popover open={aberto} onOpenChange={abrir}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={idGatilho}
          aria-labelledby={idRotulo ? `${idRotulo} ${idValor}` : undefined}
          onKeyDown={(event) => {
            if (!aberto && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault()
              abrir(true)
            }
          }}
          className={cn(
            'flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            className,
          )}
        >
          <span id={idValor} className={cn('truncate', valor === null && 'text-muted-foreground')}>
            {valor ? valor.nome : textoSemValor}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent aria-label="Escolher produto" align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <div className="flex flex-col">
          <div className="relative border-b p-2">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              role="combobox"
              aria-label="Buscar produto"
              aria-expanded="true"
              aria-controls={idLista}
              aria-autocomplete="list"
              aria-activedescendant={indiceSeguro >= 0 ? idOpcao(indiceSeguro) : undefined}
              value={termo}
              placeholder="Nome, código, EAN, SKU ou Nº"
              onChange={(event) => {
                setTermo(event.target.value)
                setIndiceAtivo(0)
                setEnterPendente(false)
              }}
              onKeyDown={aoTeclarNaBusca}
              className="pl-8"
            />
          </div>

          <ul ref={listaRef} id={idLista} role="listbox" aria-label="Produtos" className="max-h-64 overflow-y-auto p-1">
            {opcoes.map((produto, indice) => {
              const selecionada = (produto?.id ?? null) === (valor?.id ?? null)
              return (
                <li
                  key={produto?.id ?? 'todos'}
                  id={idOpcao(indice)}
                  role="option"
                  aria-selected={selecionada}
                  data-ativa={indice === indiceSeguro ? true : undefined}
                  onMouseMove={() => setIndiceAtivo(indice)}
                  onClick={() => escolher(produto)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                    'data-ativa:bg-accent data-ativa:text-accent-foreground',
                    produto === null && 'text-muted-foreground',
                  )}
                >
                  <Check className={cn('h-4 w-4 shrink-0', selecionada ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block break-words">{produto ? produto.nome : textoSemValor}</span>
                    {produto && (
                      <span className="block text-xs text-muted-foreground tabular-nums">{detalheDoProduto(produto)}</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>

          <div aria-live="polite" className="px-3 pb-3 text-sm text-muted-foreground empty:hidden">
            {buscando ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Buscando produtos...
              </span>
            ) : consulta.isError ? (
              <span className="flex flex-wrap items-center gap-2 text-destructive">
                Não foi possível buscar os produtos.
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 pointer-coarse:h-11"
                  onClick={() => consulta.refetch()}
                >
                  Tentar novamente
                </Button>
              </span>
            ) : (
              aviso()
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
