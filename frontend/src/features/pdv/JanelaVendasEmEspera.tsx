import { useRef, useState } from 'react'
import { PauseCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatarHora, formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { devolverFocoAoCampo } from '@/features/pdv/focoDoPdv'
import { descricaoDaVendaEmEspera, type VendaEmEspera } from '@/features/pdv/vendasEmEspera'

export interface JanelaVendasEmEsperaProps {
  aberta: boolean
  vendas: readonly VendaEmEspera[]
  /** Ha uma venda em andamento na tela: retomar pergunta antes. */
  temVendaAberta: boolean
  aoFechar: () => void
  /** `porAtualEmEspera`: a venda da tela vai para a espera antes de retomar. */
  aoRetomar: (id: string, porAtualEmEspera: boolean) => void
  aoDescartar: (id: string) => void
}

type Pergunta = { tipo: 'RETOMAR'; id: string } | { tipo: 'DESCARTAR'; id: string }

/** Vendas em espera (F7; spec do PDV): hora, itens e total, com Retomar e Descartar. */
export function JanelaVendasEmEspera({ aberta, aoFechar, ...props }: JanelaVendasEmEsperaProps) {
  return (
    <Dialog open={aberta} onOpenChange={(abrir) => !abrir && aoFechar()}>
      {aberta && <ConteudoDaEspera {...props} />}
    </Dialog>
  )
}

function ConteudoDaEspera({
  vendas,
  temVendaAberta,
  aoRetomar,
  aoDescartar,
}: Omit<JanelaVendasEmEsperaProps, 'aberta' | 'aoFechar'>) {
  const [pergunta, setPergunta] = useState<Pergunta | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const voltarRef = useRef<HTMLButtonElement>(null)

  return (
    <DialogContent onCloseAutoFocus={devolverFocoAoCampo}>
      <DialogHeader>
        <DialogTitle>Vendas em espera</DialogTitle>
        <DialogDescription>Ao retomar, os preços e o estoque são os de agora.</DialogDescription>
      </DialogHeader>

      {aviso && (
        <p role="status" className="rounded-md bg-muted/60 px-3 py-2 text-sm">
          {aviso}
        </p>
      )}

      {pergunta ? (
        <div className="space-y-4">
          <p className="font-medium">
            {pergunta.tipo === 'RETOMAR' ? 'Pôr a venda atual em espera?' : 'Descartar esta venda em espera?'}
          </p>
          <p className="text-sm text-muted-foreground">
            {pergunta.tipo === 'RETOMAR'
              ? 'A venda que está na tela vai para a espera e a escolhida volta.'
              : 'Os itens desta venda saem da espera e não podem ser recuperados.'}
          </p>
          <DialogFooter>
            <Button
              ref={voltarRef}
              type="button"
              variant="outline"
              className="min-h-11"
              // Descartar nao tem volta: o foco fica no caminho seguro.
              autoFocus={pergunta.tipo === 'DESCARTAR'}
              onClick={() => setPergunta(null)}
            >
              Voltar
            </Button>
            <Button
              type="button"
              variant={pergunta.tipo === 'DESCARTAR' ? 'destructive' : 'default'}
              autoFocus={pergunta.tipo === 'RETOMAR'}
              className="min-h-11"
              onClick={() => {
                if (pergunta.tipo === 'RETOMAR') {
                  aoRetomar(pergunta.id, true)
                } else {
                  aoDescartar(pergunta.id)
                  setAviso('Venda em espera descartada.')
                }
                setPergunta(null)
              }}
            >
              {pergunta.tipo === 'RETOMAR' ? 'Pôr em espera e retomar' : 'Descartar venda'}
            </Button>
          </DialogFooter>
        </div>
      ) : vendas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <PauseCircle className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Nenhuma venda em espera.</p>
          <p className="text-xs text-muted-foreground">Use F6 para pôr a venda da tela em espera.</p>
        </div>
      ) : (
        <ul aria-label="Vendas em espera" className="divide-y">
          {vendas.map((venda) => (
            <li key={venda.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
              <span className="w-12 text-muted-foreground tabular-nums">{formatarHora(venda.criadaEm)}</span>
              <span className="min-w-0 flex-1 truncate">{descricaoDaVendaEmEspera(venda)}</span>
              <span className="font-semibold tabular-nums">{venda.total === null ? '—' : formatarReais(venda.total)}</span>
              <Button
                type="button"
                className="h-11 md:h-9"
                onClick={() => (temVendaAberta ? setPergunta({ tipo: 'RETOMAR', id: venda.id }) : aoRetomar(venda.id, false))}
              >
                Retomar
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-11 md:h-9"
                onClick={() => {
                  setAviso(null)
                  setPergunta({ tipo: 'DESCARTAR', id: venda.id })
                }}
              >
                Descartar
              </Button>
            </li>
          ))}
        </ul>
      )}
    </DialogContent>
  )
}
