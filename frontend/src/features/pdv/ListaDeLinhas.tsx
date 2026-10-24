import { useEffect, useRef, useState } from 'react'
import { AlertCircle, AlertTriangle, ImageIcon, ScanBarcode } from 'lucide-react'

import { NativeSelect } from '@/components/ui/native-select'
import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { unidadeDaLinha, type LinhaDoCarrinho } from '@/features/pdv/carrinho'
import { formatarQuantidade, SELO_DA_ORIGEM, textoDoDesconto } from '@/features/pdv/formatacaoPdv'
import { cn } from '@/lib/utils'
import type { LinhaCalculada } from '@/types/pdv'

const UNIDADE = ''

export interface ListaDeLinhasProps {
  linhas: readonly LinhaDoCarrinho[]
  /** O calculo de cada linha, pelo id (ausente enquanto a linha nova nao foi calculada). */
  calculoPorLinha: Readonly<Record<string, LinhaCalculada | undefined>>
  errosPorLinha: Readonly<Record<string, string | undefined>>
  avisosPorLinha: Readonly<Record<string, string | undefined>>
  selecionadaId: string | null
  /** A ultima linha lancada: destacada, com a miniatura do produto. */
  ultimaId: string | null
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
  ultimaId,
  aoSelecionar,
  aoTrocarEmbalagem,
}: ListaDeLinhasProps & { linha: LinhaDoCarrinho; numero: number }) {
  const itemRef = useRef<HTMLLIElement>(null)
  const calculada = calculoPorLinha[linha.id]
  const erro = errosPorLinha[linha.id]
  const aviso = avisosPorLinha[linha.id]
  const selecionada = linha.id === selecionadaId
  const ultima = linha.id === ultimaId
  const selo = calculada ? SELO_DA_ORIGEM[calculada.origemPreco] : linha.etiqueta ? SELO_DA_ORIGEM.ETIQUETA : undefined
  const desconto = calculada ? calculada.descontoItem + calculada.descontoRateado : 0

  useEffect(() => {
    if (selecionada) {
      itemRef.current?.scrollIntoView?.({ block: 'nearest' })
    }
  }, [selecionada])

  return (
    <li
      ref={itemRef}
      aria-current={selecionada ? 'true' : undefined}
      aria-invalid={erro ? true : undefined}
      onClick={() => aoSelecionar(linha.id)}
      className={cn(
        'grid cursor-pointer grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-start gap-x-3 gap-y-1 px-3 py-2.5 transition-colors',
        selecionada ? 'bg-accent/60' : 'hover:bg-muted/50',
        ultima && 'animate-[pulse_0.6s_ease-out_1]',
        erro && 'border-l-4 border-destructive bg-destructive/5',
      )}
    >
      <span className="pt-0.5 text-sm text-muted-foreground tabular-nums">{numero}</span>

      <div className="flex min-w-0 items-start gap-3">
        {ultima && <Miniatura url={linha.produto.miniaturaUrl} />}
        <div className="min-w-0 space-y-0.5">
          <p className="truncate font-medium">{linha.produto.nome}</p>
          {linha.codigoLido && <p className="text-xs text-muted-foreground tabular-nums">{linha.codigoLido}</p>}
          {erro && (
            <p className="flex items-start gap-1 text-sm font-medium text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {erro}
            </p>
          )}
          {aviso && (
            <p className="flex items-start gap-1 text-sm text-warning-soft-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {aviso}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="font-semibold tabular-nums">{formatarQuantidade(linha.quantidade)}</span>
        {linha.produto.embalagens.length > 0 && !linha.etiqueta ? (
          <NativeSelect
            aria-label={`Unidade da linha ${numero}`}
            value={linha.embalagemId ?? UNIDADE}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => aoTrocarEmbalagem(linha.id, event.target.value === UNIDADE ? null : event.target.value)}
            className="h-9 w-auto min-w-20 py-0 text-sm"
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
          {selo && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-medium text-accent-foreground">
              {selo}
            </span>
          )}
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
