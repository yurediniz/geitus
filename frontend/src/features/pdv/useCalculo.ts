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

/** As falhas sem calculo, cada uma com a sua mensagem (S1). */
const MENSAGEM_REDE = 'Não foi possível calcular a venda. Confira a conexão.'
const MENSAGEM_SESSAO = 'Sua sessão expirou. Entre de novo.'
const MENSAGEM_PERMISSAO = 'Você não tem permissão para calcular esta venda.'
const MENSAGEM_SERVIDOR = 'O servidor não conseguiu calcular a venda. Tente de novo.'

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
  /** Sem calculo (rede, sessao, permissao, servidor): a mensagem e `recalcular` tenta de novo. */
  semCalculo: string | null
}

export interface EstadoDoCalculo {
  /** O ultimo calculo desta venda (pode ser de um carrinho anterior dela, enquanto o novo e calculado). */
  calculo: CalculoDaVenda | null
  /** A ordem das linhas do `calculo` exibido. */
  idsDoCalculo: string[]
  /** O calculo exibido e o do carrinho de agora. */
  atualizado: boolean
  calculando: boolean
  /** Erros de dados (404/409) do ultimo envio, no formato das mensagens do calculo. */
  errosDosDados: MensagemDoCalculo[]
  idsDosErros: string[]
  /** Mensagem da falha sem calculo (rede, sessao, permissao, servidor). */
  falhaDoCalculo: string | null
  recalcular: () => void
}

function mensagemSemCalculo(erro: unknown): string {
  if (!(erro instanceof HttpError) || erro.status === 0) {
    return MENSAGEM_REDE
  }
  if (erro.status === 401) {
    return MENSAGEM_SESSAO
  }
  if (erro.status === 403) {
    return MENSAGEM_PERMISSAO
  }
  return erro.status >= 500 ? MENSAGEM_SERVIDOR : MENSAGEM_REDE
}

function falhaDe(erro: unknown, assinatura: string): Falha {
  if (erro instanceof HttpError && (erro.status === 404 || erro.status === 409)) {
    const mensagens = camposParaMensagens(erro.campos)
    if (mensagens.length === 0 && !ehMensagemGenerica(erro.message)) {
      mensagens.push({ campo: null, mensagem: erro.message })
    }
    return { assinatura, mensagens, semCalculo: null }
  }
  return { assinatura, mensagens: [], semCalculo: mensagemSemCalculo(erro) }
}

export interface OpcoesDoCalculo {
  /** Desligado, nao pede calculo (ex.: a janela de pagamento sem pagamentos usa o calculo da tela). */
  ativo?: boolean
}

/**
 * O calculo do servidor para o carrinho (spec do PDV §6.2): cada mudanca pede
 * `POST /api/pdv/calculo` depois de 150 ms sem mudar, e o pedido anterior e
 * cancelado (Review Focus 1). Enquanto calcula, so o ultimo resultado da mesma
 * venda continua na tela (nunca o de outra). A tela mostra sempre o calculo do servidor.
 */
export function useCalculo(
  carrinho: Carrinho,
  pagamentos: readonly PagamentoInformado[] = SEM_PAGAMENTOS,
  { ativo = true }: OpcoesDoCalculo = {},
): EstadoDoCalculo {
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
      // Venda nova: o calculo da anterior nao pode aparecer nela.
      setResposta(null)
      setFalha(null)
      return
    }
    if (!ativo) {
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
  }, [assinatura, vazio, ativo, tentativa])

  const recalcular = useCallback(() => {
    // A falha sai da tela antes da nova tentativa (que mostra "Calculando").
    setFalha(null)
    setTentativa((atual) => atual + 1)
  }, [])

  const falhaAtual = falha?.assinatura === assinatura ? falha : null
  const atualizado = resposta?.assinatura === assinatura
  // Enquanto calcula, so vale o resultado anterior que tem alguma linha do carrinho de agora (a mesma venda).
  const idsAtuais = new Set(carrinho.linhas.map((linha) => linha.id))
  const exibida = !vazio && resposta && (atualizado || resposta.ids.some((id) => idsAtuais.has(id))) ? resposta : null
  return {
    calculo: exibida?.calculo ?? null,
    idsDoCalculo: exibida?.ids ?? [],
    atualizado: vazio || atualizado,
    calculando: ativo && !vazio && !atualizado && falhaAtual === null,
    errosDosDados: falhaAtual?.mensagens ?? [],
    idsDosErros: falhaAtual ? (JSON.parse(falhaAtual.assinatura) as Pedido).ids : [],
    falhaDoCalculo: falhaAtual?.semCalculo ?? null,
    recalcular,
  }
}
