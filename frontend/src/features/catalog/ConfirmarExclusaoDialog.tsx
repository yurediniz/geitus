import { Loader2, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface ConfirmarExclusaoDialogProps {
  aberto: boolean
  titulo: string
  descricao: string
  excluindo: boolean
  onConfirmar: () => void
  onCancelar: () => void
}

/** Confirmacao de exclusao fisica (cadastros do catalogo, sem historico). */
export function ConfirmarExclusaoDialog({
  aberto,
  titulo,
  descricao,
  excluindo,
  onConfirmar,
  onCancelar,
}: ConfirmarExclusaoDialogProps) {
  return (
    <Dialog
      open={aberto}
      onOpenChange={(abrir) => {
        if (!abrir && !excluindo) {
          onCancelar()
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancelar} disabled={excluindo}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={onConfirmar} disabled={excluindo}>
            {excluindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Excluir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
