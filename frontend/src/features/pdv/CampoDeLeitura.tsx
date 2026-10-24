import { useEffect, useRef, useState } from 'react'
import { ScanBarcode } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { ehCodigo } from '@/features/pdv/atalhosDoPdv'
import { FilaDeLeituras } from '@/features/pdv/filaDeLeituras'
import { ID_CAMPO_DE_LEITURA } from '@/features/pdv/focoDoPdv'
import { ehMensagemGenerica } from '@/features/catalog/catalogoQuery'
import { HttpError } from '@/services/httpClient'
import { resolverCodigo } from '@/services/pdvService'
import type { ItemResolvido } from '@/types/pdv'

const ID_ERRO = `${ID_CAMPO_DE_LEITURA}-erro`

/** A mensagem da leitura recusada (spec do PDV §3.1), sem detalhe tecnico. */
function mensagemDaLeitura(erro: unknown): string {
  if (erro instanceof HttpError) {
    if (erro.status === 0) {
      return 'Sem conexão com o servidor. Leia o código de novo.'
    }
    if (erro.status === 400 || erro.status === 404 || erro.status === 409) {
      const doCampo = Object.values(erro.campos ?? {})
      if (doCampo.length > 0) {
        return doCampo.join(' ')
      }
      if (!ehMensagemGenerica(erro.message)) {
        return erro.message
      }
      return erro.status === 404 ? 'Código não encontrado.' : 'Não foi possível ler o código.'
    }
  }
  return 'Não foi possível ler o código. Tente de novo.'
}

export interface CampoDeLeituraProps {
  /** O item resolvido, na ordem das leituras. */
  aoResolver: (item: ItemResolvido) => void
  /** A leitura foi recusada: a mensagem fica no campo. */
  aoRecusar: (mensagem: string) => void
  /** Texto que nao e codigo: abre a busca por nome (na mesma ordem das leituras). */
  aoBuscar: (texto: string) => void
  erro: string | null
  aoDigitar: () => void
}

/**
 * O campo "Código ou nome" (spec do PDV §3.1 e §6.2), com o foco permanente.
 * Enter limpa o campo na hora e o texto vai para a fila: a resolucao e pedida
 * em seguida (sem esperar as anteriores) e o resultado entra no carrinho na
 * ordem das leituras. O campo nunca e bloqueado (Review Focus 1).
 */
export function CampoDeLeitura({ aoResolver, aoRecusar, aoBuscar, erro, aoDigitar }: CampoDeLeituraProps) {
  const [texto, setTexto] = useState('')
  const filaRef = useRef<FilaDeLeituras | null>(null)
  const retornos = useRef({ aoResolver, aoRecusar, aoBuscar })

  useEffect(() => {
    retornos.current = { aoResolver, aoRecusar, aoBuscar }
  }, [aoResolver, aoRecusar, aoBuscar])

  const ler = () => {
    const lido = texto.trim()
    setTexto('')
    if (lido === '') {
      return
    }
    filaRef.current ??= new FilaDeLeituras()
    if (ehCodigo(lido)) {
      filaRef.current.enfileirar(
        resolverCodigo(lido),
        (item) => retornos.current.aoResolver(item),
        (falha) => retornos.current.aoRecusar(mensagemDaLeitura(falha)),
      )
    } else {
      filaRef.current.enfileirar(
        Promise.resolve(lido),
        (busca) => retornos.current.aoBuscar(busca),
        () => undefined,
      )
    }
  }

  return (
    <div className="space-y-1.5">
      <label htmlFor={ID_CAMPO_DE_LEITURA} className="text-sm font-medium">
        Código ou nome
      </label>
      <div className="relative">
        <ScanBarcode
          className="pointer-events-none absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id={ID_CAMPO_DE_LEITURA}
          value={texto}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder="Bipe o código, digite 542*3 ou o nome"
          onChange={(event) => {
            setTexto(event.target.value)
            aoDigitar()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault()
              ler()
            }
          }}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? ID_ERRO : undefined}
          className="h-14 pl-11 text-lg md:text-lg"
        />
      </div>
      {erro && (
        <p id={ID_ERRO} role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}
    </div>
  )
}
