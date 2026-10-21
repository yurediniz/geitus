import type { ReactNode } from 'react'
import { Loader2, Trash2, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useFocoDeOrigem, type DestinoFoco } from '@/features/catalog/useFocoDeOrigem'

/**
 * Acao mais branda oferecida junto de "Excluir" (ex.: inativar); quando a
 * exclusao nao e possivel, vira a acao principal.
 */
export interface AcaoAlternativa {
  rotulo: string
  icone: LucideIcon
  executando: boolean
  onExecutar: () => void
}

interface ConfirmarExclusaoDialogProps {
  aberto: boolean
  titulo: string
  descricao: ReactNode
  excluindo: boolean
  onConfirmar: () => void
  onCancelar: () => void
  /**
   * `false` quando ja se sabe que a exclusao sera recusada (ex.: ha vinculos):
   * o botao "Excluir" some e, se houver, a `alternativa` vira a acao principal.
   * Com a exclusao possivel, a `alternativa` aparece como acao secundaria.
   */
  podeExcluir?: boolean
  alternativa?: AcaoAlternativa
  /** Quem recebe o foco ao fechar; padrao: o elemento que o tinha ao abrir. */
  destinoFoco?: DestinoFoco
}

/** Confirmacao de exclusao fisica (cadastros do catalogo, sem historico). */
export function ConfirmarExclusaoDialog({
  aberto,
  titulo,
  descricao,
  excluindo,
  onConfirmar,
  onCancelar,
  podeExcluir = true,
  alternativa,
  destinoFoco,
}: ConfirmarExclusaoDialogProps) {
  const devolverFoco = useFocoDeOrigem(aberto, destinoFoco)
  const ocupado = excluindo || (alternativa?.executando ?? false)
  const IconeAlternativa = alternativa?.icone

  return (
    <Dialog
      open={aberto}
      onOpenChange={(abrir) => {
        if (!abrir && !ocupado) {
          onCancelar()
        }
      }}
    >
      <DialogContent onCloseAutoFocus={devolverFoco}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">{descricao}</div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancelar} disabled={ocupado}>
            {podeExcluir || alternativa ? 'Cancelar' : 'Fechar'}
          </Button>
          {alternativa && IconeAlternativa && (
            <Button
              type="button"
              variant={podeExcluir ? 'outline' : 'default'}
              onClick={alternativa.onExecutar}
              disabled={ocupado}
            >
              {alternativa.executando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <IconeAlternativa className="h-4 w-4" />
              )}
              {alternativa.rotulo}
            </Button>
          )}
          {podeExcluir && (
            <Button type="button" variant="destructive" onClick={onConfirmar} disabled={ocupado}>
              {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Excluir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
