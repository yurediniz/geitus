import { useRef } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { devolverFocoAoCampo } from '@/features/pdv/focoDoPdv'

export interface Confirmacao {
  titulo: string
  descricao: string
  confirmar: string
  aoConfirmar: () => void
}

/** Confirmacao curta do PDV (remover linha com desconto, descartar venda em espera). Enter confirma. */
export function JanelaConfirmar({ confirmacao, aoFechar }: { confirmacao: Confirmacao | null; aoFechar: () => void }) {
  const confirmarRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={confirmacao !== null} onOpenChange={(aberta) => !aberta && aoFechar()}>
      {confirmacao && (
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            confirmarRef.current?.focus()
          }}
          onCloseAutoFocus={devolverFocoAoCampo}
          className="sm:max-w-md"
        >
          <DialogHeader>
            <DialogTitle>{confirmacao.titulo}</DialogTitle>
            <DialogDescription>{confirmacao.descricao}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>
              Voltar
            </Button>
            <Button ref={confirmarRef} type="button" className="min-h-11" onClick={confirmacao.aoConfirmar}>
              {confirmacao.confirmar}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}
