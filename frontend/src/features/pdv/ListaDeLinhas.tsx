import { useEffect, useId, useRef, type MouseEvent } from 'react'
import { AlertCircle, AlertTriangle, Minus, Percent, Plus, ShoppingBasket, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { unidadeDaLinha, type LinhaDoCarrinho } from '@/features/pdv/carrinho'
import { formatarQuantidade, SELO_DA_ORIGEM, textoDoDesconto } from '@/features/pdv/formatacaoPdv'
import { MiniaturaDoProduto } from '@/features/pdv/MiniaturaDoProduto'
import { cn } from '@/lib/utils'
import type { LinhaCalculada } from '@/types/pdv'

const UNIDADE = ''

/** A ultima linha lancada e quantas vezes ja foi lancada (o destaque repete a cada lancamento). */
export interface DestaqueDaLinha {
  linhaId: string
  vez: number
}

export interface ListaDeLinhasProps {
  linhas: readonly LinhaDoCarrinho[]
  /** O calculo de cada linha, pelo id (ausente enquanto a linha nova nao foi calculada). */
  calculoPorLinha: Readonly<Record<string, LinhaCalculada | undefined>>
  errosPorLinha: Readonly<Record<string, string | undefined>>
  avisosPorLinha: Readonly<Record<string, string | undefined>>
  selecionadaId: string | null
  /** A ultima linha lancada: destacada a cada lancamento. */
  destaque: DestaqueDaLinha | null
  aoSelecionar: (linhaId: string) => void
  aoTrocarEmbalagem: (linhaId: string, embalagemId: string | null) => void
  /** Os botoes − e + da linha (os mesmos do teclado). */
  aoMudarQuantidade: (linhaId: string, delta: 1 | -1) => void
  /** O botao % da linha (o mesmo do F4). */
  aoDescontar: (linhaId: string) => void
  /** O botao × da linha (o mesmo do Del). */
  aoRemover: (linhaId: string) => void
}

/**
 * A lista de linhas do PDV (spec do PDV): miniatura, nome, quantidade com − e +,
 * "UN ▾" quando ha embalagens, preco unitario com o selo, desconto e valor. Os
 * valores sao os do servidor; os erros e avisos aparecem na propria linha.
 */
export function ListaDeLinhas(props: ListaDeLinhasProps) {
  const { linhas } = props
  if (linhas.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <ShoppingBasket className="h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
        <p className="text-muted-foreground">Nenhum item ainda.</p>
      </div>
    )
  }
  return (
    <ol aria-label="Itens da venda" className="divide-y">
      {linhas.map((linha, indice) => (
        <ItemDaLista key={linha.id} linha={linha} numero={indice + 1} {...props} />
      ))}
    </ol>
  )
}

function ItemDaLista({
  linha,
  numero,
  calculoPorLinha,
  errosPorLinha,
  avisosPorLinha,
  selecionadaId,
  destaque,
  aoSelecionar,
  aoTrocarEmbalagem,
  aoMudarQuantidade,
  aoDescontar,
  aoRemover,
}: ListaDeLinhasProps & { linha: LinhaDoCarrinho; numero: number }) {
  const itemRef = useRef<HTMLLIElement>(null)
  const idErro = useId()
  const idAviso = useId()
  const calculada = calculoPorLinha[linha.id]
  const erro = errosPorLinha[linha.id]
  const aviso = avisosPorLinha[linha.id]
  const selecionada = linha.id === selecionadaId
  const destacada = destaque?.linhaId === linha.id
  // "Balança" sai pelo campo da linha: a etiqueta de UN volta com a origem normal, promocional ou de atacado.
  // O selo da origem (Promoção, Atacado) sai junto quando for o caso.
  const selos = [
    linha.etiqueta ? SELO_DA_ORIGEM.ETIQUETA : undefined,
    calculada && calculada.origemPreco !== 'ETIQUETA' ? SELO_DA_ORIGEM[calculada.origemPreco] : undefined,
  ].filter((selo): selo is string => selo !== undefined)
  const desconto = calculada ? calculada.descontoItem + calculada.descontoRateado : 0
  // Embalagem e sempre inteira; a unidade fracionada mostra as 3 casas ("0,400 KG").
  const fracionada = linha.produto.fracionada && linha.embalagemId === null
  const nome = linha.produto.nome
  /** Os botoes agem na linha sem seleciona-la de novo pelo clique do item. */
  const naLinha = (acao: () => void) => (event: MouseEvent) => {
    event.stopPropagation()
    acao()
  }

  useEffect(() => {
    if (selecionada) {
      itemRef.current?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [selecionada])

  return (
    <li
      ref={itemRef}
      aria-current={selecionada ? 'true' : undefined}
      aria-describedby={[erro && idErro, aviso && idAviso].filter(Boolean).join(' ') || undefined}
      onClick={() => aoSelecionar(linha.id)}
      className={cn(
        'relative flex cursor-pointer gap-3 rounded-lg px-2 py-2 transition-colors',
        // A selecionada tem a faixa ambar a esquerda: e nela que + / − / F4 / Del agem.
        selecionada ? 'bg-accent/70 shadow-[inset_4px_0_0_var(--color-primary)]' : 'hover:bg-muted/50',
        erro && 'border-l-4 border-destructive bg-destructive/5',
      )}
    >
      {destacada && (
        // A chave muda a cada lancamento: o destaque toca de novo, mesmo quando soma na mesma linha.
        <span
          key={destaque.vez}
          data-destaque={destaque.vez}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-lg bg-primary/25 opacity-0 motion-safe:animate-[geitus-destaque_0.9s_ease-out_1] motion-reduce:hidden"
        />
      )}
      <span className="sr-only">{`Item ${numero}`}</span>
      <MiniaturaDoProduto url={linha.produto.miniaturaUrl} className="size-12" />

      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-0.5">
            <p className="truncate font-medium">
              {nome}
              {erro && <span className="sr-only">com erro</span>}
            </p>
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
              {selos.map((selo) => (
                <span key={selo} className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">
                  {selo}
                </span>
              ))}
              {calculada && <span>{`${formatarReais(calculada.precoUnitario)} / ${unidadeDaLinha(linha)}`}</span>}
              {linha.codigoLido && <span>{`· ${linha.codigoLido}`}</span>}
            </p>
            {(linha.desconto || desconto > 0) && (
              <p className="text-xs text-success-soft-foreground tabular-nums">
                {`Desconto ${linha.desconto ? textoDoDesconto(linha.desconto) : ''}${desconto > 0 ? ` (− ${formatarReais(desconto)})` : ''}`.trim()}
              </p>
            )}
          </div>
          <p className="shrink-0 text-base font-semibold tabular-nums">{calculada ? formatarReais(calculada.valorLiquido) : '—'}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex items-center rounded-lg border bg-card">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-r-none"
              aria-label={`Diminuir a quantidade de ${nome}`}
              // O − nunca deixa a linha abaixo de 1 (remover e com o ×).
              disabled={linha.etiqueta || linha.quantidade - 1 < 1}
              onClick={naLinha(() => aoMudarQuantidade(linha.id, -1))}
            >
              <Minus className="size-3.5" aria-hidden="true" />
            </Button>
            <span className="min-w-10 px-1 text-center text-sm font-semibold tabular-nums">
              {formatarQuantidade(linha.quantidade, fracionada)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 rounded-l-none"
              aria-label={`Aumentar a quantidade de ${nome}`}
              disabled={linha.etiqueta}
              onClick={naLinha(() => aoMudarQuantidade(linha.id, 1))}
            >
              <Plus className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
          {linha.produto.embalagens.length > 0 && !linha.etiqueta ? (
            <NativeSelect
              aria-label={`Unidade da linha ${numero}`}
              value={linha.embalagemId ?? UNIDADE}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => aoTrocarEmbalagem(linha.id, event.target.value === UNIDADE ? null : event.target.value)}
              className="h-8 w-auto min-w-20 py-0 text-sm"
            >
              <option value={UNIDADE}>{linha.produto.unidade}</option>
              {linha.produto.embalagens.map((embalagem) => (
                <option key={embalagem.id} value={embalagem.id}>
                  {embalagem.rotulo}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <span className="px-1 text-sm text-muted-foreground">{unidadeDaLinha(linha)}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 text-success-soft-foreground"
              aria-label={`Desconto de ${nome}`}
              title="Desconto do item (F4)"
              onClick={naLinha(() => aoDescontar(linha.id))}
            >
              <Percent className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-8 text-destructive hover:text-destructive"
              aria-label={`Remover ${nome}`}
              title="Remover (Del)"
              onClick={naLinha(() => aoRemover(linha.id))}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {erro && (
          <p className="flex items-start gap-1 text-sm font-medium text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span id={idErro}>{erro}</span>
          </p>
        )}
        {aviso && (
          <p className="flex items-start gap-1 text-sm text-warning-soft-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span id={idAviso}>{aviso}</span>
          </p>
        )}
      </div>
    </li>
  )
}
