import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Loader2, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { chaveDaBuscaDeFornecedores } from '@/features/suppliers/fornecedorQuery'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { cn } from '@/lib/utils'
import { listarFornecedores } from '@/services/fornecedorService'
import type { FornecedorItemLista } from '@/types/fornecedor'
import type { FornecedorDoProduto, PaginaResponse } from '@/types/produto'

/** Quantos fornecedores a busca mostra (os primeiros por nome). */
const FORNECEDORES_NA_BUSCA = 10
/** Teto do pedido: os ja escolhidos (escondidos) sao pedidos a mais, ate este limite. */
const MAXIMO_DO_PEDIDO = 30

/** Quantos pedir para sobrarem 10 depois de esconder os ja escolhidos (no maximo 30). */
function tamanhoDoPedido(ocultos: number): number {
  return Math.min(FORNECEDORES_NA_BUSCA + ocultos, MAXIMO_DO_PEDIDO)
}

/** Texto abaixo da lista quando ha mais fornecedores do que os trazidos. */
const MENSAGEM_HA_MAIS = 'Mostrando os 10 primeiros. Digite para buscar os demais.'

export interface BuscaDeFornecedorProps {
  /** Fornecedor escolhido; null = nenhum. */
  valor: FornecedorDoProduto | null
  onChange: (fornecedor: FornecedorDoProduto | null) => void
  /** Texto do gatilho sem valor (ex.: "Nenhum" ou "Adicionar fornecedor"). */
  textoSemValor: string
  /** Oferece a opcao "Nenhum" (limpar). */
  permitirLimpar?: boolean
  /** Fornecedores que nao aparecem como opcao (ex.: os ja escolhidos numa lista). */
  ocultos?: ReadonlySet<string>
  id?: string
  /** Id do rotulo externo: compoe o nome acessivel com o valor atual. */
  idRotulo?: string
  /** Ids extras para o `aria-describedby` do gatilho (ajuda, erro). */
  idsDescricao?: string
  desabilitado?: boolean
  invalido?: boolean
}

function resumoDoItem(item: FornecedorItemLista): FornecedorDoProduto {
  return { id: item.id, numero: item.numero, nome: item.razaoSocial, ativo: item.ativo }
}

interface Opcao {
  /** null = "Nenhum". */
  fornecedor: FornecedorDoProduto | null
  detalhe: string | null
}

/**
 * Combobox de fornecedor com busca no servidor (sem acento, por nome,
 * fantasia, documento, Nº ou representante), so dos ativos (spec B5 §5 e §6).
 * Teclado: setas abrem e percorrem a lista, Enter escolhe, Esc fecha.
 */
export function BuscaDeFornecedor({
  valor,
  onChange,
  textoSemValor,
  permitirLimpar = false,
  ocultos,
  id,
  idRotulo,
  idsDescricao,
  desabilitado = false,
  invalido,
}: BuscaDeFornecedorProps) {
  const idBase = useId()
  const idGatilho = id ?? `${idBase}-gatilho`
  const idValor = `${idBase}-valor`
  const idLista = `${idBase}-lista`
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [indiceAtivo, setIndiceAtivo] = useState(0)
  const listaRef = useRef<HTMLUListElement>(null)
  const termoComAtraso = useBuscaComAtraso(termo.trim())
  const tamanho = tamanhoDoPedido(ocultos?.size ?? 0)

  const consulta = useQuery<PaginaResponse<FornecedorItemLista>>({
    queryKey: chaveDaBuscaDeFornecedores(termoComAtraso, tamanho),
    queryFn: ({ signal }) => listarFornecedores({ busca: termoComAtraso, status: 'ativos', pagina: 1, tamanho }, signal),
    enabled: aberto,
  })

  const opcoes = useMemo<Opcao[]>(() => {
    const encontrados = (consulta.data?.itens ?? [])
      .filter((item) => !ocultos?.has(item.id))
      .slice(0, FORNECEDORES_NA_BUSCA)
      .map<Opcao>((item) => ({
        fornecedor: resumoDoItem(item),
        detalhe: [`Nº ${item.numero}`, item.nomeFantasia].filter(Boolean).join(' · '),
      }))
    const nenhum: Opcao[] = permitirLimpar && termo.trim() === '' ? [{ fornecedor: null, detalhe: null }] : []
    return [...nenhum, ...encontrados]
  }, [consulta.data, ocultos, permitirLimpar, termo])

  const indiceSeguro = opcoes.length === 0 ? -1 : Math.min(indiceAtivo, opcoes.length - 1)
  const idOpcao = (indice: number) => `${idBase}-opcao-${indice}`
  const buscando = termo.trim() !== termoComAtraso || consulta.isFetching
  const trazidos = consulta.data?.itens.length ?? 0
  const total = consulta.data?.totalItens ?? 0
  const semOpcaoDeFornecedor = opcoes.every((opcao) => opcao.fornecedor === null)

  /** O que dizer abaixo da lista (null = nada). */
  const aviso = (): string | null => {
    if (!consulta.isSuccess) {
      return null
    }
    if (semOpcaoDeFornecedor) {
      if (total === 0) {
        return termoComAtraso
          ? `Nenhum fornecedor ativo encontrado para "${termoComAtraso}".`
          : 'Nenhum fornecedor ativo para escolher.'
      }
      if (total <= trazidos) {
        return termoComAtraso
          ? 'Os fornecedores encontrados já foram escolhidos.'
          : 'Todos os fornecedores ativos já foram escolhidos.'
      }
    }
    return total > trazidos ? MENSAGEM_HA_MAIS : null
  }

  useEffect(() => {
    if (indiceSeguro >= 0) {
      listaRef.current?.children.item(indiceSeguro)?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [indiceSeguro])

  const abrir = (proximo: boolean) => {
    setAberto(proximo)
    if (proximo) {
      setTermo('')
      setIndiceAtivo(0)
    }
  }

  const escolher = (opcao: Opcao) => {
    onChange(opcao.fornecedor)
    setAberto(false)
  }

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
      // Enter aqui escolhe; nunca envia o formulario da pagina.
      event.preventDefault()
      event.stopPropagation()
      const opcao = indiceSeguro >= 0 ? opcoes[indiceSeguro] : undefined
      if (opcao) {
        escolher(opcao)
      }
    }
  }

  return (
    <Popover open={aberto} onOpenChange={abrir}>
      <PopoverTrigger asChild disabled={desabilitado}>
        <button
          type="button"
          id={idGatilho}
          aria-labelledby={idRotulo ? `${idRotulo} ${idValor}` : undefined}
          aria-describedby={idsDescricao}
          aria-invalid={invalido ? true : undefined}
          onKeyDown={(event) => {
            if (!aberto && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
              event.preventDefault()
              abrir(true)
            }
          }}
          className={cn(
            'flex h-9 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 text-left text-base shadow-xs transition-[color,box-shadow] outline-none md:text-sm pointer-coarse:h-11',
            'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
            'disabled:cursor-not-allowed disabled:opacity-50',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
          )}
        >
          <span id={idValor} className={cn('truncate', valor === null && 'text-muted-foreground')}>
            {valor ? valor.nome : textoSemValor}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        aria-label="Escolher fornecedor"
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-72 p-0"
      >
        <div className="flex flex-col">
          <div className="relative border-b p-2">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              autoFocus
              role="combobox"
              aria-label="Buscar fornecedor"
              aria-expanded="true"
              aria-controls={idLista}
              aria-autocomplete="list"
              aria-activedescendant={indiceSeguro >= 0 ? idOpcao(indiceSeguro) : undefined}
              value={termo}
              placeholder="Nome, CNPJ/CPF ou Nº"
              onChange={(event) => {
                setTermo(event.target.value)
                setIndiceAtivo(0)
              }}
              onKeyDown={aoTeclarNaBusca}
              className="pl-8"
            />
          </div>

          <ul ref={listaRef} id={idLista} role="listbox" aria-label="Fornecedores" className="max-h-64 overflow-y-auto p-1">
            {opcoes.map((opcao, indice) => {
              const selecionada = (opcao.fornecedor?.id ?? null) === (valor?.id ?? null)
              return (
                <li
                  key={opcao.fornecedor?.id ?? 'nenhum'}
                  id={idOpcao(indice)}
                  role="option"
                  aria-selected={selecionada}
                  data-ativa={indice === indiceSeguro ? true : undefined}
                  onMouseMove={() => setIndiceAtivo(indice)}
                  onClick={() => escolher(opcao)}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                    'data-ativa:bg-accent data-ativa:text-accent-foreground',
                    opcao.fornecedor === null && 'text-muted-foreground',
                  )}
                >
                  <Check className={cn('h-4 w-4 shrink-0', selecionada ? 'opacity-100' : 'opacity-0')} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block break-words">{opcao.fornecedor ? opcao.fornecedor.nome : 'Nenhum'}</span>
                    {opcao.detalhe && (
                      <span className="block text-xs text-muted-foreground tabular-nums">{opcao.detalhe}</span>
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
                Buscando fornecedores...
              </span>
            ) : consulta.isError ? (
              <span className="flex flex-wrap items-center gap-2 text-destructive">
                Não foi possível buscar os fornecedores.
                <Button type="button" variant="outline" size="sm" className="h-9 pointer-coarse:h-11" onClick={() => consulta.refetch()}>
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
