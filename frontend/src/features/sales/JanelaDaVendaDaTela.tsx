import { useState } from 'react'

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DetalheDaVenda } from '@/features/pdv/DetalheDaVenda'
import { FormularioDeDevolucao } from '@/features/pdv/FormularioDeDevolucao'
import { mensagemDaDevolucao, mensagemDoCancelamento } from '@/features/pdv/mensagensDaVenda'
import type { Venda } from '@/types/pdv'

export interface JanelaDaVendaDaTelaProps {
  /** A venda aberta (o numero ja aparece no titulo enquanto carrega). */
  venda: { id: string; numero: number }
  ehAdmin: boolean
  aoFechar: () => void
  aoImprimir: (venda: Venda) => void
  /** Elemento que recebe o foco ao fechar (a linha que abriu a janela). */
  focoAoFechar: () => HTMLElement | null
}

/**
 * A venda aberta na tela Vendas: o mesmo detalhe do F8 (reimprimir, cancelar
 * quando o servidor deixa e, para o ADMIN, "Devolver itens"), com o aviso do
 * que devolver ao cliente depois. O cancelamento e a devolucao ja invalidam a
 * lista (as chaves `['pdv', ...]`). O foco volta a linha ao fechar.
 */
export function JanelaDaVendaDaTela({ venda, ehAdmin, aoFechar, aoImprimir, focoAoFechar }: JanelaDaVendaDaTelaProps) {
  const [devolvendo, setDevolvendo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  return (
    <Dialog open onOpenChange={(abrir) => !abrir && aoFechar()}>
      <DialogContent
        className="sm:max-w-2xl"
        onCloseAutoFocus={(event) => {
          const alvo = focoAoFechar()
          if (alvo) {
            event.preventDefault()
            alvo.focus()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{`Venda nº ${venda.numero}`}</DialogTitle>
          <DialogDescription>Itens, pagamentos, cancelamento e devoluções da venda.</DialogDescription>
        </DialogHeader>

        {aviso && (
          <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
            {aviso}
          </p>
        )}

        {devolvendo ? (
          <FormularioDeDevolucao
            vendaId={venda.id}
            numero={venda.numero}
            aoVoltar={() => setDevolvendo(false)}
            aoDevolver={(devolucao) => {
              setAviso(mensagemDaDevolucao(devolucao))
              setDevolvendo(false)
            }}
          />
        ) : (
          <DetalheDaVenda
            vendaId={venda.id}
            ehAdmin={ehAdmin}
            aoVoltar={aoFechar}
            aoImprimir={aoImprimir}
            aoCancelar={(cancelada) => setAviso(mensagemDoCancelamento(cancelada))}
            aoDevolver={() => {
              setAviso(null)
              setDevolvendo(true)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
