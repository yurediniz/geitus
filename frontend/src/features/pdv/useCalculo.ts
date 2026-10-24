import { useCallback, useEffect, useMemo, useState } from 'react'

import { paraRequest, type Carrinho } from '@/features/pdv/carrinho'
import { camposParaMensagens } from '@/features/pdv/mensagensDoCalculo'
import { ehMensagemGenerica } from '@/features/catalog/catalogoQuery'
import { HttpError } from '@/services/httpClient'
import { calcular } from '@/services/pdvService'
import type { CalculoDaVenda, CarrinhoRequest, MensagemDoCalculo, PagamentoInformado } from '@/types/pdv'

/** Espera depois da ultima mudanca antes de pedir o calculo (spec do PDV §6.2). */
export const ATRASO_DO_CALCULO_MS = 150

const SEM_PAGAMENTOS: readonly PagamentoInformado[] = []
const FALHA_DE_REDE = 'Não foi possível calcular a venda. Confira a conexão.'

interface Pedido {
  carrinho: CarrinhoRequest
  /** Os ids das linhas, na ordem enviada (os `itens[i]` do servidor seguem ela). */
  ids: string[]
}

interface Resposta {
  assinatura: string
  calculo: CalculoDaVenda
  ids: string[]
}

interface Falha {
  assinatura: string
  /** 404/409: produto, embalagem ou cliente que nao existe mais ou foi inativado (com o campo). */
  mensagens: MensagemDoCalculo[]
  /** Sem resposta do servidor: o calculo e pedido de novo por `recalcular`. */
  deRede: boolean
}

export interface EstadoDoCalculo {
  /** O ultimo calculo recebido (pode ser de um carrinho anterior, enquanto o novo e calculado). */
  calculo: CalculoDaVenda | null
  /** A ordem das linhas do `calculo` exibido. */
  idsDoCalculo: string[]
  /** O calculo exibido e o do carrinho de agora. */
  atualizado: boolean
  calculando: boolean
  /** Erros de dados (404/409) do ultimo envio, no formato das mensagens do calculo. */
  errosDosDados: MensagemDoCalculo[]
  idsDosErros: string[]
  /** Mensagem de falha sem resposta (rede). */
  falhaDeRede: string | null
  recalcular: () => void
}

function falhaDe(erro: unknown, assinatura: string): Falha {
  if (erro instanceof HttpError && (erro.status === 404 || erro.status === 409)) {
    const mensagens = camposParaMensagens(erro.campos)
    if (mensagens.length === 0 && !ehMensagemGenerica(erro.message)) {
      mensagens.push({ campo: null, mensagem: erro.message })
    }
    return { assinatura, mensagens, deRede: false }
  }
  return { assinatura, mensagens: [], deRede: true }
}

/**
 * O calculo do servidor para o carrinho (spec do PDV §6.2): cada mudanca pede
 * `POST /api/pdv/calculo` depois de 150 ms sem mudar, e o pedido anterior e
 * cancelado (Review Focus 1). Enquanto calcula, o ultimo resultado continua
 * na tela. A tela mostra sempre o calculo do servidor.
 */
export function useCalculo(carrinho: Carrinho, pagamentos: readonly PagamentoInformado[] = SEM_PAGAMENTOS): EstadoDoCalculo {
  const assinatura = useMemo(() => {
    const pedido: Pedido = { carrinho: paraRequest(carrinho, pagamentos), ids: carrinho.linhas.map((linha) => linha.id) }
    return JSON.stringify(pedido)
  }, [carrinho, pagamentos])
  const vazio = carrinho.linhas.length === 0
  const [resposta, setResposta] = useState<Resposta | null>(null)
  const [falha, setFalha] = useState<Falha | null>(null)
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    if (vazio) {
      return
    }
    const pedido = JSON.parse(assinatura) as Pedido
    const controle = new AbortController()
    const temporizador = setTimeout(() => {
      calcular(pedido.carrinho, controle.signal)
        .then((calculo) => {
          if (!controle.signal.aborted) {
            setResposta({ assinatura, calculo, ids: pedido.ids })
            setFalha(null)
          }
        })
        .catch((erro: unknown) => {
          if (!controle.signal.aborted) {
            setFalha(falhaDe(erro, assinatura))
          }
        })
    }, ATRASO_DO_CALCULO_MS)
    return () => {
      clearTimeout(temporizador)
      // O carrinho mudou (ou a tela saiu): o pedido em andamento nao serve mais.
      controle.abort()
    }
  }, [assinatura, vazio, tentativa])

  const recalcular = useCallback(() => setTentativa((atual) => atual + 1), [])

  const falhaAtual = falha?.assinatura === assinatura ? falha : null
  const atualizado = resposta?.assinatura === assinatura
  return {
    calculo: vazio ? null : (resposta?.calculo ?? null),
    idsDoCalculo: vazio ? [] : (resposta?.ids ?? []),
    atualizado: vazio || atualizado,
    calculando: !vazio && !atualizado && falhaAtual === null,
    errosDosDados: falhaAtual?.mensagens ?? [],
    idsDosErros: falhaAtual ? (JSON.parse(falhaAtual.assinatura) as Pedido).ids : [],
    falhaDeRede: falhaAtual?.deRede ? FALHA_DE_REDE : null,
    recalcular,
  }
}
