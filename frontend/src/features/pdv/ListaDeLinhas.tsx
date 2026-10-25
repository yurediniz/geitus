import { useEffect, useId, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, ImageIcon, ScanBarcode } from 'lucide-react'

import { NativeSelect } from '@/components/ui/native-select'
import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { unidadeDaLinha, type LinhaDoCarrinho } from '@/features/pdv/carrinho'
import { formatarQuantidade, SELO_DA_ORIGEM, textoDoDesconto } from '@/features/pdv/formatacaoPdv'
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
  /** A ultima linha lancada: destacada a cada lancamento, com a miniatura do produto. */
  destaque: DestaqueDaLinha | null
  aoSelecionar: (linhaId: string) => void
  aoTrocarEmbalagem: (linhaId: string, embalagemId: string | null) => void
}

/**
 * A lista de linhas do PDV (spec §6.2): no, nome, codigo lido, "UN ▾" quando
 * ha embalagens, quantidade, preco unitario com o selo, desconto e valor. Os
 * valores sao os do servidor; os erros e avisos aparecem na propria linha.
 */
export function ListaDeLinhas(props: ListaDeLinhasProps) {
  const { linhas } = props
  if (linhas.length === 0) {
    return (
      <div className="flex h-full min-h-48 flex-col items-center justify-center gap-3 rounded-lg bg-muted/40 p-8 text-center">
        <ScanBarcode className="h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-muted-foreground">Nenhum item. Bipe o código ou digite o nome do produto.</p>
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
        'relative grid cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-start gap-x-3 gap-y-1 px-3 py-2.5 transition-colors',
        selecionada ? 'bg-accent/60' : 'hover:bg-muted/50',
        erro && 'border-l-4 border-destructive bg-destructive/5',
      )}
    >
      {destacada && (
        // A chave muda a cada lancamento: o destaque toca de novo, mesmo quando soma na mesma linha.
        <span
          key={destaque.vez}
          data-destaque={destaque.vez}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-md bg-primary/10 motion-safe:animate-[pulse_0.6s_ease-out_1] motion-reduce:hidden"
        />
      )}
      <span className="pt-0.5 text-sm text-muted-foreground tabular-nums">{numero}</span>

      <div className="flex min-w-0 items-start gap-3">
        {destacada && <Miniatura url={linha.produto.miniaturaUrl} />}
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-medium">
            {linha.produto.nome}
            {erro && <span className="sr-only">com erro</span>}
          </p>
          {linha.codigoLido && <p className="text-xs text-muted-foreground tabular-nums">{linha.codigoLido}</p>}
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
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold tabular-nums">{formatarQuantidade(linha.quantidade, fracionada)}</span>
        {linha.produto.embalagens.length > 0 && !linha.etiqueta ? (
          <NativeSelect
            aria-label={`Unidade da linha ${numero}`}
            value={linha.embalagemId ?? UNIDADE}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => aoTrocarEmbalagem(linha.id, event.target.value === UNIDADE ? null : event.target.value)}
            className="h-11 w-auto min-w-20 py-0 text-sm"
          >
            <option value={UNIDADE}>{linha.produto.unidade}</option>
            {linha.produto.embalagens.map((embalagem) => (
              <option key={embalagem.id} value={embalagem.id}>
                {embalagem.rotulo}
              </option>
            ))}
          </NativeSelect>
        ) : (
          <span className="text-muted-foreground">{unidadeDaLinha(linha)}</span>
        )}
      </div>

      <div className="min-w-32 space-y-0.5 text-right text-sm">
        <p className="text-base font-semibold tabular-nums">{calculada ? formatarReais(calculada.valorLiquido) : '—'}</p>
        <p className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground tabular-nums">
          {selos.map((selo) => (
            <span key={selo} className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">
              {selo}
            </span>
          ))}
          {calculada && `${formatarReais(calculada.precoUnitario)} / ${unidadeDaLinha(linha)}`}
        </p>
        {(linha.desconto || desconto > 0) && (
          <p className="text-xs text-success-soft-foreground tabular-nums">
            {`Desconto ${linha.desconto ? textoDoDesconto(linha.desconto) : ''}${desconto > 0 ? ` (− ${formatarReais(desconto)})` : ''}`.trim()}
          </p>
        )}
      </div>
    </li>
  )
}

/** A miniatura da ultima linha lancada; sem imagem (ou se ela falhar), o icone neutro. */
function Miniatura({ url }: { url: string | null }) {
  const [falhou, setFalhou] = useState(false)
  return (
    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
      {url && !falhou ? (
        <img src={url} alt="" decoding="async" onError={() => setFalhou(true)} className="h-full w-full object-contain" />
      ) : (
        <ImageIcon className="size-5 text-muted-foreground/70" aria-hidden="true" />
      )}
    </div>
  )
}
