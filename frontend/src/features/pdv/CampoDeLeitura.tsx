import { useEffect, useRef, useState } from 'react'
import { Loader2, ScanBarcode } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { ehMensagemGenerica } from '@/features/catalog/catalogoQuery'
import { acaoDoAtalho, ehCodigo } from '@/features/pdv/atalhosDoPdv'
import { FilaDeLeituras, LIMITES_DA_LEITURA } from '@/features/pdv/filaDeLeituras'
import { ID_CAMPO_DE_LEITURA } from '@/features/pdv/focoDoPdv'
import { HttpError } from '@/services/httpClient'
import { resolverCodigo } from '@/services/pdvService'
import type { ItemResolvido } from '@/types/pdv'

const ID_ERRO = `${ID_CAMPO_DE_LEITURA}-erro`
const ID_AVISO = `${ID_CAMPO_DE_LEITURA}-aviso`
const MENSAGEM_SEM_RESPOSTA = 'Sem resposta do servidor. Leia o código de novo.'

/** O codigo do texto lido, sem a quantidade ("542*3" -> "542"). */
function codigoDoTexto(lido: string): string {
  return lido.split('*')[0] || lido
}

/** A mensagem da leitura recusada (spec do PDV §3.1), com o codigo lido e sem detalhe tecnico. */
function mensagemDaLeitura(erro: unknown, lido: string): string {
  if (erro instanceof HttpError) {
    if (erro.status === 0) {
      return 'Sem conexão com o servidor. Leia o código de novo.'
    }
    if (erro.status === 400 || erro.status === 404 || erro.status === 409) {
      const doCampo = Object.values(erro.campos ?? {})
      if (doCampo.length > 0) {
        return doCampo.join(' ')
      }
      if (erro.status === 404 && (ehMensagemGenerica(erro.message) || erro.message === 'Código não encontrado.')) {
        // Com o codigo, o operador ve qual bipe falhou mesmo depois de outras leituras.
        return `Código ${codigoDoTexto(lido)} não encontrado.`
      }
      return ehMensagemGenerica(erro.message) ? 'Não foi possível ler o código.' : erro.message
    }
  }
  return 'Não foi possível ler o código. Tente de novo.'
}

/** Alvo onde a tecla e do proprio elemento (nao vai para o campo de leitura). */
function ehEditavel(alvo: EventTarget | null): boolean {
  return (
    alvo instanceof HTMLElement &&
    (alvo.isContentEditable || alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT')
  )
}

export interface CampoDeLeituraProps {
  /** O item resolvido, na ordem das leituras. */
  aoResolver: (item: ItemResolvido) => void
  /** A leitura foi recusada: a mensagem fica no campo. */
  aoRecusar: (mensagem: string) => void
  /** Texto que nao e codigo: abre a busca por nome (na mesma ordem das leituras). */
  aoBuscar: (texto: string) => void
  /** Quantas leituras ainda esperam o servidor (a venda nao pode ser paga enquanto houver). */
  aoMudarPendentes: (pendentes: number) => void
  erro: string | null
  /** Aviso discreto sob o campo (ex.: "Aguarde a leitura…"). */
  aviso: string | null
  aoDigitar: () => void
  /** Esc no campo tira o erro da leitura. */
  aoLimparErro: () => void
  /** Sem janela aberta: uma tecla digitada fora do campo vem para ele (o foco e permanente). */
  capturarTeclas: boolean
}

/**
 * O campo "Código ou nome" (spec do PDV §3.1 e §6.2), com o foco permanente.
 * Enter limpa o campo na hora e o texto vai para a fila: a resolucao e pedida
 * em seguida (sem esperar as anteriores), com tempo maximo, e o resultado
 * entra no carrinho na ordem das leituras. O campo nunca e bloqueado (Review
 * Focus 1). Ao sair da tela, as leituras pendentes sao abortadas.
 */
export function CampoDeLeitura({
  aoResolver,
  aoRecusar,
  aoBuscar,
  aoMudarPendentes,
  erro,
  aviso,
  aoDigitar,
  aoLimparErro,
  capturarTeclas,
}: CampoDeLeituraProps) {
  const [texto, setTexto] = useState('')
  const [pendentes, setPendentes] = useState(0)
  const campoRef = useRef<HTMLInputElement>(null)
  const filaRef = useRef<FilaDeLeituras | null>(null)
  const controles = useRef(new Set<AbortController>())
  const montado = useRef(true)
  const retornos = useRef({ aoResolver, aoRecusar, aoBuscar, aoMudarPendentes, aoDigitar })

  useEffect(() => {
    retornos.current = { aoResolver, aoRecusar, aoBuscar, aoMudarPendentes, aoDigitar }
  }, [aoResolver, aoRecusar, aoBuscar, aoMudarPendentes, aoDigitar])

  useEffect(() => {
    montado.current = true
    const emAndamento = controles.current
    return () => {
      montado.current = false
      for (const controle of emAndamento) {
        controle.abort()
      }
      emAndamento.clear()
    }
  }, [])

  // Foco permanente: uma tecla digitavel fora de um campo editavel (sem janela aberta) vai para o campo.
  useEffect(() => {
    if (!capturarTeclas) {
      return
    }
    const aoTeclar = (event: KeyboardEvent) => {
      const campo = campoRef.current
      if (
        !campo ||
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.key.length !== 1 ||
        event.key === ' ' ||
        ehEditavel(event.target) ||
        // + e − com o campo vazio sao atalhos da linha.
        acaoDoAtalho(event, campo.value === '') !== null
      ) {
        return
      }
      event.preventDefault()
      campo.focus()
      setTexto((atual) => atual + event.key)
      retornos.current.aoDigitar()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [capturarTeclas])

  const fila = () => {
    filaRef.current ??= new FilaDeLeituras((quantas) => {
      if (montado.current) {
        setPendentes(quantas)
        retornos.current.aoMudarPendentes(quantas)
      }
    })
    return filaRef.current
  }

  const resolverComTempoMaximo = (lido: string) => {
    const controle = new AbortController()
    const estado = { estourou: false }
    const temporizador = setTimeout(() => {
      estado.estourou = true
      controle.abort()
    }, LIMITES_DA_LEITURA.tempoMaximoMs)
    controles.current.add(controle)
    const pedido = resolverCodigo(lido, controle.signal).finally(() => {
      clearTimeout(temporizador)
      controles.current.delete(controle)
    })
    return { pedido, estado }
  }

  const ler = () => {
    const lido = texto.trim()
    setTexto('')
    if (lido === '') {
      return
    }
    if (ehCodigo(lido)) {
      const { pedido, estado } = resolverComTempoMaximo(lido)
      fila().enfileirar(
        pedido,
        (item) => montado.current && retornos.current.aoResolver(item),
        (falha) =>
          montado.current &&
          retornos.current.aoRecusar(estado.estourou ? MENSAGEM_SEM_RESPOSTA : mensagemDaLeitura(falha, lido)),
      )
    } else {
      fila().enfileirar(
        Promise.resolve(lido),
        (busca) => montado.current && retornos.current.aoBuscar(busca),
        () => undefined,
      )
    }
  }

  const descricao = [erro && ID_ERRO, aviso && ID_AVISO].filter(Boolean).join(' ') || undefined

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
          ref={campoRef}
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
            } else if (event.key === 'Escape') {
              aoLimparErro()
            }
          }}
          aria-invalid={erro ? true : undefined}
          aria-describedby={descricao}
          className="h-14 pr-11 pl-11 text-lg md:text-lg"
        />
        {pendentes > 0 && (
          <span
            role="status"
            aria-label="Lendo o código"
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground"
          >
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </span>
        )}
      </div>
      {erro && (
        <p id={ID_ERRO} role="alert" className="text-sm font-medium text-destructive">
          {erro}
        </p>
      )}
      {aviso && (
        <p id={ID_AVISO} className="text-sm text-muted-foreground">
          {aviso}
        </p>
      )}
      <p className="text-xs text-muted-foreground">↑ ↓ escolhe a linha · + − quantidade · Del remove</p>
    </div>
  )
}
