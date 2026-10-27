import { useId, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { CampoMoeda } from '@/components/ui/campo-moeda'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { devolverFocoAoCampo } from '@/features/pdv/focoDoPdv'
import { ErroDoCampo } from '@/features/products/CamposFormulario'
import { formatarPercentual, lerPercentual } from '@/lib/percentual'
import { cn } from '@/lib/utils'
import type { DescontoInformado, TipoDeDesconto } from '@/types/pdv'

export interface AlvoDoDesconto {
  /** O id da linha, ou `'TOTAL'`. */
  alvo: string
  titulo: 'Desconto do item' | 'Desconto da venda'
  descricao: string
  atual: DescontoInformado | null
}

export interface JanelaDescontoProps {
  /** Null com a janela fechada. */
  desconto: AlvoDoDesconto | null
  /** O limite percentual do OPERADOR; null para o ADMIN (sem limite). */
  limiteDoOperador: number | null
  aoFechar: () => void
  /** Null remove o desconto. */
  aoAplicar: (alvo: string, desconto: DescontoInformado | null) => void
}

const MENSAGEM_VALOR = 'Informe um valor maior que zero.'
const MENSAGEM_PERCENTUAL = 'Informe um percentual de 0 a 100, com até 2 casas.'

/**
 * Desconto do item (F4) e do total (Shift+F4), em R$ ou % (spec do PDV).
 * O limite do operador e o preco minimo sao conferidos pelo servidor: o erro
 * aparece na linha ou no total, e o pagamento fica bloqueado ate corrigir.
 */
export function JanelaDesconto({ desconto, limiteDoOperador, aoFechar, aoAplicar }: JanelaDescontoProps) {
  return (
    <Dialog open={desconto !== null} onOpenChange={(aberta) => !aberta && aoFechar()}>
      {desconto && (
        <ConteudoDoDesconto
          key={desconto.alvo}
          desconto={desconto}
          limiteDoOperador={limiteDoOperador}
          aoAplicar={aoAplicar}
          aoFechar={aoFechar}
        />
      )}
    </Dialog>
  )
}

function ConteudoDoDesconto({
  desconto,
  limiteDoOperador,
  aoAplicar,
  aoFechar,
}: {
  desconto: AlvoDoDesconto
  limiteDoOperador: number | null
  aoAplicar: JanelaDescontoProps['aoAplicar']
  aoFechar: () => void
}) {
  const [tipo, setTipo] = useState<TipoDeDesconto>(desconto.atual?.tipo ?? 'VALOR')
  const [valor, setValor] = useState(() =>
    desconto.atual?.tipo === 'VALOR' ? desconto.atual.valor.toFixed(2) : '',
  )
  const [percentual, setPercentual] = useState(() =>
    desconto.atual?.tipo === 'PERCENTUAL' ? formatarPercentual(desconto.atual.valor) : '',
  )
  const [erro, setErro] = useState<string | null>(null)
  const idCampo = useId()
  const idErro = `${idCampo}-erro`
  const campoRef = useRef<HTMLInputElement>(null)

  const aplicar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (tipo === 'VALOR') {
      const numero = Number(valor)
      if (valor === '' || !(numero > 0)) {
        setErro(MENSAGEM_VALOR)
        return
      }
      aoAplicar(desconto.alvo, { tipo, valor: numero })
      return
    }
    const numero = lerPercentual(percentual)
    if (numero === null || numero <= 0) {
      setErro(MENSAGEM_PERCENTUAL)
      return
    }
    aoAplicar(desconto.alvo, { tipo, valor: numero })
  }

  const propsDoCampo = {
    ref: campoRef,
    id: idCampo,
    'aria-invalid': erro ? true : undefined,
    'aria-describedby': erro ? idErro : undefined,
    className: 'h-11 text-base',
  }

  return (
    <DialogContent
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        campoRef.current?.focus()
      }}
      onCloseAutoFocus={devolverFocoAoCampo}
    >
      <DialogHeader>
        <DialogTitle>{desconto.titulo}</DialogTitle>
        <DialogDescription>
          {desconto.descricao}
          {limiteDoOperador !== null &&
            ` Seu limite: até ${formatarPercentual(limiteDoOperador).replace(/,00$/, '')}% da venda.`}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={aplicar} noValidate className="space-y-4">
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium">Tipo de desconto</legend>
          <div className="inline-flex rounded-md bg-muted p-1">
            {(
              [
                ['VALOR', 'R$'],
                ['PERCENTUAL', '%'],
              ] as const
            ).map(([opcao, rotulo]) => (
              <label
                key={opcao}
                className={cn(
                  'flex h-9 min-w-14 cursor-pointer items-center justify-center rounded px-3 text-sm font-medium has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/50',
                  tipo === opcao ? 'bg-background shadow-sm' : 'text-muted-foreground',
                )}
              >
                <input
                  type="radio"
                  name="tipo-de-desconto"
                  value={opcao}
                  checked={tipo === opcao}
                  onChange={() => {
                    setTipo(opcao)
                    setErro(null)
                    // O campo troca (R$ ou %): o foco vai para o novo.
                    requestAnimationFrame(() => campoRef.current?.focus())
                  }}
                  className="sr-only"
                />
                {rotulo}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor={idCampo} className="text-sm font-medium">
            {tipo === 'VALOR' ? 'Desconto (R$)' : 'Desconto (%)'}
          </label>
          {tipo === 'VALOR' ? (
            <CampoMoeda
              {...propsDoCampo}
              value={valor}
              onChange={(novo) => {
                setValor(novo)
                setErro(null)
              }}
            />
          ) : (
            <Input
              {...propsDoCampo}
              value={percentual}
              inputMode="decimal"
              autoComplete="off"
              onChange={(event) => {
                setPercentual(event.target.value)
                setErro(null)
              }}
            />
          )}
          <ErroDoCampo id={idErro} mensagem={erro ?? undefined} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar}>
            Voltar
          </Button>
          {desconto.atual && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => aoAplicar(desconto.alvo, null)}>
              Remover desconto
            </Button>
          )}
          <Button type="submit" className="min-h-11">
            Aplicar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
