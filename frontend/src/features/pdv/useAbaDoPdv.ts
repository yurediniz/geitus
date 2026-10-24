import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * O PDV fica em uma aba so por usuario neste navegador (achado de seguranca):
 * duas abas do mesmo usuario apagariam o carrinho uma da outra no
 * `localStorage`, inclusive a chave pendente da venda, e a venda poderia se
 * repetir. A aba que vende segura um lock exclusivo (`navigator.locks`); sem
 * Web Locks, um `BroadcastChannel` pergunta se outra aba ja esta vendendo.
 */

export type SituacaoDaAba = 'VERIFICANDO' | 'NESTA_ABA' | 'EM_OUTRA_ABA'

export const MENSAGEM_OUTRA_ABA = 'O PDV já está aberto em outra aba deste navegador.'
const MENSAGEM_FECHE_A_OUTRA = 'Feche a outra aba primeiro.'

/** Quanto o canal espera a resposta de outra aba (so no caminho sem Web Locks). */
const ESPERA_DO_CANAL_MS = 150
/** Uma nova tentativa na abertura: a aba recarregada pode ainda estar soltando o lock. */
const NOVA_TENTATIVA_MS = 100

const PERGUNTA = 'QUEM_VENDE'
const RESPOSTA = 'ESTA_ABA_VENDE'

export function nomeDoBloqueio(empresaId: number, usuarioId: number): string {
  return `geitus.pdv.${empresaId}.${usuarioId}`
}

interface Rodada {
  ativa: boolean
  /** Solta o lock desta rodada (resolve a promessa que o segura). */
  soltar: (() => void) | null
  canal: BroadcastChannel | null
}

function locksDoNavegador(): LockManager | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.locks
}

/** Tenta ficar com o PDV nesta aba; resolve true se conseguiu. */
function tentarFicar(nome: string, rodada: Rodada): Promise<boolean> {
  const locks = locksDoNavegador()
  if (locks) {
    return new Promise((resolve) => {
      locks
        .request(nome, { ifAvailable: true }, (lock) => {
          if (!lock || !rodada.ativa) {
            resolve(false)
            return undefined
          }
          resolve(true)
          // O lock fica preso enquanto esta promessa nao resolve (ate a tela sair ou a aba fechar).
          return new Promise<void>((soltar) => {
            rodada.soltar = soltar
          })
        })
        .catch(() => resolve(false))
    })
  }
  if (typeof BroadcastChannel !== 'function') {
    // Sem nenhum dos dois, nao ha como saber: a aba vende.
    return Promise.resolve(true)
  }
  return new Promise((resolve) => {
    rodada.canal ??= new BroadcastChannel(nome)
    const canal = rodada.canal
    let outraAba = false
    const ouvir = (evento: MessageEvent) => {
      if (evento.data === RESPOSTA) {
        outraAba = true
      }
    }
    canal.addEventListener('message', ouvir)
    canal.postMessage(PERGUNTA)
    setTimeout(() => {
      canal.removeEventListener('message', ouvir)
      resolve(!outraAba && rodada.ativa)
    }, ESPERA_DO_CANAL_MS)
  })
}

export function useAbaDoPdv(empresaId: number, usuarioId: number) {
  const nome = nomeDoBloqueio(empresaId, usuarioId)
  const [situacao, setSituacao] = useState<SituacaoDaAba>('VERIFICANDO')
  const [aviso, setAviso] = useState<string | null>(null)
  const rodadaRef = useRef<Rodada | null>(null)

  useEffect(() => {
    const rodada: Rodada = { ativa: true, soltar: null, canal: null }
    rodadaRef.current = rodada
    setSituacao('VERIFICANDO')
    setAviso(null)
    const decidir = (ficou: boolean) => {
      if (rodada.ativa) {
        setSituacao(ficou ? 'NESTA_ABA' : 'EM_OUTRA_ABA')
      }
    }
    void tentarFicar(nome, rodada).then((ficou) => {
      if (ficou || !rodada.ativa) {
        decidir(ficou)
        return
      }
      setTimeout(() => {
        if (rodada.ativa) {
          void tentarFicar(nome, rodada).then(decidir)
        }
      }, NOVA_TENTATIVA_MS)
    })
    return () => {
      rodada.ativa = false
      rodada.soltar?.()
      rodada.soltar = null
      rodada.canal?.close()
      rodada.canal = null
    }
  }, [nome])

  // Sem Web Locks: a aba que vende responde a pergunta das outras.
  useEffect(() => {
    const canal = rodadaRef.current?.canal
    if (situacao !== 'NESTA_ABA' || !canal) {
      return
    }
    const responder = (evento: MessageEvent) => {
      if (evento.data === PERGUNTA) {
        canal.postMessage(RESPOSTA)
      }
    }
    canal.addEventListener('message', responder)
    return () => canal.removeEventListener('message', responder)
  }, [situacao])

  /** "Usar aqui": so fica com o PDV se a outra aba ja soltou (fechou). */
  const usarAqui = useCallback(() => {
    const rodada = rodadaRef.current
    if (!rodada) {
      return
    }
    setAviso(null)
    void tentarFicar(nome, rodada).then((ficou) => {
      if (!rodada.ativa) {
        return
      }
      if (ficou) {
        setSituacao('NESTA_ABA')
      } else {
        setAviso(MENSAGEM_FECHE_A_OUTRA)
      }
    })
  }, [nome])

  return { situacao, aviso, usarAqui }
}
