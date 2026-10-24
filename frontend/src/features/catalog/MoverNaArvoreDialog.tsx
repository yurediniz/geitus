import { useMemo, useState, type FormEvent } from 'react'
import { FolderInput, Loader2, Search } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import type { TextosDaArvore } from '@/features/catalog/cadastrosEmArvore'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { useFocoDeOrigem, type DestinoFoco } from '@/features/catalog/useFocoDeOrigem'
import { filtrarPorTermo, idsDescendentes } from '@/lib/arvoreCategorias'
import type { ItemDaArvore } from '@/types/catalogo'

/** Valor do radio que representa "Tornar ... principal" (parentId null). */
const DESTINO_PRINCIPAL = ''

interface MoverNaArvoreDialogProps<T extends ItemDaArvore> {
  /** Item a mover; `null` mantem o dialogo fechado. */
  item: T | null
  itens: T[]
  textos: TextosDaArvore
  salvando: boolean
  erro: string | null
  onConfirmar: (parentId: string | null) => void
  onCancelar: () => void
  /** Quem recebe o foco ao fechar; padrao: o elemento que o tinha ao abrir. */
  destinoFoco?: DestinoFoco
}

/**
 * Dialogo para escolher o novo pai de um item da arvore (categoria, marca). Os
 * destinos sao listados pelo caminho completo e nunca incluem o proprio item
 * nem seus descendentes (evita ciclo antes mesmo do backend recusar).
 */
export function MoverNaArvoreDialog<T extends ItemDaArvore>({
  item,
  itens,
  textos,
  salvando,
  erro,
  onConfirmar,
  onCancelar,
  destinoFoco,
}: MoverNaArvoreDialogProps<T>) {
  const devolverFoco = useFocoDeOrigem(item !== null, destinoFoco)
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(abrir) => {
        if (!abrir && !salvando) {
          onCancelar()
        }
      }}
    >
      <DialogContent onCloseAutoFocus={devolverFoco}>
        {item && (
          <ConteudoMover
            key={item.id}
            item={item}
            itens={itens}
            textos={textos}
            salvando={salvando}
            erro={erro}
            onConfirmar={onConfirmar}
            onCancelar={onCancelar}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

interface ConteudoMoverProps<T extends ItemDaArvore> extends Omit<MoverNaArvoreDialogProps<T>, 'item' | 'destinoFoco'> {
  item: T
}

function ConteudoMover<T extends ItemDaArvore>({
  item,
  itens,
  textos,
  salvando,
  erro,
  onConfirmar,
  onCancelar,
}: ConteudoMoverProps<T>) {
  const paiAtual = item.parentId ?? DESTINO_PRINCIPAL
  const [destino, setDestino] = useState<string>(paiAtual)
  const [busca, setBusca] = useState('')

  const destinosPossiveis = useMemo(() => {
    const bloqueados = idsDescendentes(itens, item.id)
    return itens
      .filter((candidato) => !bloqueados.has(candidato.id))
      .sort((a, b) => a.caminho.localeCompare(b.caminho, 'pt-BR'))
  }, [itens, item.id])

  const destinosFiltrados = filtrarPorTermo(destinosPossiveis, busca)

  const aoSubmeter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (destino !== paiAtual) {
      onConfirmar(destino === DESTINO_PRINCIPAL ? null : destino)
    }
  }

  return (
    <form onSubmit={aoSubmeter} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Mover {textos.singular}</DialogTitle>
        <DialogDescription>
          Escolha onde &quot;{item.caminho}&quot; vai ficar. As {textos.subPlural} e os produtos vão junto.
        </DialogDescription>
      </DialogHeader>

      {erro && <ErroInline mensagem={erro} />}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Buscar destino"
          aria-label="Buscar destino"
          className="pl-9"
          disabled={salvando}
        />
      </div>

      <fieldset className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border p-1" disabled={salvando}>
        <legend className="sr-only">Novo local da {textos.singular}</legend>
        <OpcaoDestino
          nome={`destino-${textos.singular}`}
          valor={DESTINO_PRINCIPAL}
          rotulo={`Tornar ${textos.singular} principal`}
          atual={paiAtual === DESTINO_PRINCIPAL}
          selecionado={destino === DESTINO_PRINCIPAL}
          onSelecionar={setDestino}
          destaque
        />
        {destinosFiltrados.map((candidato) => (
          <OpcaoDestino
            key={candidato.id}
            nome={`destino-${textos.singular}`}
            valor={candidato.id}
            rotulo={candidato.caminho}
            inativa={!candidato.ativo}
            atual={paiAtual === candidato.id}
            selecionado={destino === candidato.id}
            onSelecionar={setDestino}
          />
        ))}
        {destinosFiltrados.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {busca.trim()
              ? `Nenhuma ${textos.singular} encontrada para a busca.`
              : `Não há outras ${textos.plural} para usar como destino.`}
          </p>
        )}
      </fieldset>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvando || destino === paiAtual}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderInput className="h-4 w-4" />}
          Mover
        </Button>
      </DialogFooter>
    </form>
  )
}

interface OpcaoDestinoProps {
  /** Nome do grupo de radios. */
  nome: string
  valor: string
  rotulo: string
  atual: boolean
  selecionado: boolean
  onSelecionar: (valor: string) => void
  inativa?: boolean
  destaque?: boolean
}

function OpcaoDestino({ nome, valor, rotulo, atual, selecionado, onSelecionar, inativa, destaque }: OpcaoDestinoProps) {
  // Nome acessivel explicito: os spans visuais seriam lidos colados ("Raçãolocal atual").
  const rotuloAcessivel = [rotulo, inativa ? 'inativa' : null, atual ? 'local atual' : null]
    .filter(Boolean)
    .join(', ')
  return (
    <label
      className={
        selecionado
          ? 'flex min-h-11 cursor-pointer items-center gap-3 rounded-md bg-accent px-3 text-sm text-accent-foreground'
          : 'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm hover:bg-muted/60'
      }
    >
      <input
        type="radio"
        name={nome}
        value={valor}
        checked={selecionado}
        onChange={() => onSelecionar(valor)}
        aria-label={rotuloAcessivel}
        className="h-4 w-4 accent-primary"
      />
      <span className={destaque ? 'font-medium' : undefined}>{rotulo}</span>
      {inativa && <span className="text-xs text-muted-foreground">(inativa)</span>}
      {atual && <span className="ml-auto text-xs text-muted-foreground">local atual</span>}
    </label>
  )
}
