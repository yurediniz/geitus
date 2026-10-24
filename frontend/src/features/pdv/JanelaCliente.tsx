import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Loader2, UserRound, UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import type { ClienteDaVenda } from '@/features/pdv/carrinho'
import { devolverFocoAoCampo } from '@/features/pdv/focoDoPdv'
import { PDV_QUERY_KEY } from '@/features/pdv/pdvQuery'
import { useBuscaComAtraso } from '@/hooks/useBuscaComAtraso'
import { mascararCpf, mascararTelefone } from '@/lib/documentos'
import { listarClientes } from '@/services/clienteService'

export interface JanelaClienteProps {
  aberta: boolean
  clienteAtual: ClienteDaVenda | null
  aoFechar: () => void
  aoEscolher: (cliente: ClienteDaVenda | null) => void
}

/** Cliente da venda (F3; spec do PDV §3.5): opcional, entre os clientes ativos, por nome, CPF ou telefone. */
export function JanelaCliente({ aberta, clienteAtual, aoFechar, aoEscolher }: JanelaClienteProps) {
  return (
    <Dialog open={aberta} onOpenChange={(abrir) => !abrir && aoFechar()}>
      {aberta && <ConteudoDoCliente clienteAtual={clienteAtual} aoEscolher={aoEscolher} />}
    </Dialog>
  )
}

function ConteudoDoCliente({
  clienteAtual,
  aoEscolher,
}: {
  clienteAtual: ClienteDaVenda | null
  aoEscolher: (cliente: ClienteDaVenda | null) => void
}) {
  const [texto, setTexto] = useState('')
  const busca = useBuscaComAtraso(texto.trim(), 250)
  const idCampo = useId()
  const consulta = useQuery({
    queryKey: [...PDV_QUERY_KEY, 'clientes', busca],
    queryFn: () => listarClientes({ busca, status: 'ativos' }),
    enabled: busca !== '',
  })
  const clientes = busca === '' ? [] : (consulta.data ?? []).filter((cliente) => cliente.ativo !== false)

  return (
    <DialogContent onCloseAutoFocus={devolverFocoAoCampo}>
      <DialogHeader>
        <DialogTitle>Cliente da venda</DialogTitle>
        <DialogDescription>Opcional. Busque entre os clientes ativos.</DialogDescription>
      </DialogHeader>

      {clienteAtual && (
        <div className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            <UserRound className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="truncate font-medium">{clienteAtual.nome}</span>
          </span>
          <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={() => aoEscolher(null)}>
            <UserX className="h-4 w-4" aria-hidden="true" />
            Tirar da venda
          </Button>
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor={idCampo} className="text-sm font-medium">
          Nome, CPF ou telefone
        </label>
        <Input
          id={idCampo}
          value={texto}
          autoFocus
          autoComplete="off"
          onChange={(event) => setTexto(event.target.value)}
          onKeyDown={(event) => {
            const [primeiro] = clientes
            if (event.key === 'Enter' && primeiro) {
              event.preventDefault()
              aoEscolher({ id: primeiro.id, nome: primeiro.nome })
            }
          }}
          className="h-11 text-base"
        />
      </div>

      {busca === '' ? null : consulta.isPending ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Buscando…
        </p>
      ) : consulta.isError ? (
        <div className="space-y-2">
          <ErroInline mensagem="Não foi possível buscar os clientes." />
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => consulta.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : clientes.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum cliente ativo encontrado.</p>
      ) : (
        <ul aria-label="Clientes encontrados" className="max-h-72 divide-y overflow-y-auto">
          {clientes.map((cliente) => (
            <li key={cliente.id}>
              <button
                type="button"
                onClick={() => aoEscolher({ id: cliente.id, nome: cliente.nome })}
                className="flex min-h-11 w-full flex-col items-start rounded-md px-3 py-2 text-left outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="font-medium">{cliente.nome}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {[cliente.cpf && mascararCpf(cliente.cpf), cliente.telefone && mascararTelefone(cliente.telefone)]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </DialogContent>
  )
}
