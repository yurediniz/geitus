import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  adicionarItem,
  alterarQuantidade as alterarQuantidadeDaLinha,
  aplicarDesconto as aplicarDescontoNoCarrinho,
  CARRINHO_VAZIO,
  chaveDoCarrinho,
  guardarCarrinho,
  lerCarrinhoGuardado,
  removerLinha,
  trocarEmbalagem as trocarEmbalagemDaLinha,
  type Carrinho,
  type ClienteDaVenda,
  type ItemParaLancar,
  type OpcoesDoCarrinho,
  type ResultadoDaMudanca,
} from '@/features/pdv/carrinho'
import { gerarUuid } from '@/lib/uuid'
import type { DescontoInformado } from '@/types/pdv'

function lerDoNavegador(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

/** Sem espaco ou com o armazenamento bloqueado, o carrinho segue so na memoria (a venda nao para). */
function gravarNoNavegador(chave: string, carrinho: Carrinho, empresaId: number, usuarioId: number): void {
  try {
    if (carrinho.linhas.length === 0 && carrinho.cliente === null && carrinho.desconto === null) {
      localStorage.removeItem(chave)
    } else {
      localStorage.setItem(chave, guardarCarrinho(carrinho, empresaId, usuarioId))
    }
  } catch {
    // Segue na memoria.
  }
}

/**
 * O carrinho da venda em andamento (spec do PDV §6.2), guardado no
 * `localStorage` por empresa e usuario: recarregar a pagina mantem a venda.
 * As mudancas partem sempre do estado mais recente (uma referencia sincrona),
 * para que varias leituras seguidas, antes de um novo render, nao se percam.
 */
export function useCarrinho(empresaId: number, usuarioId: number, opcoes: OpcoesDoCarrinho) {
  const chave = chaveDoCarrinho(empresaId, usuarioId)
  const [carrinho, setCarrinho] = useState<Carrinho>(() =>
    lerCarrinhoGuardado(lerDoNavegador(chave), empresaId, usuarioId),
  )
  const atualRef = useRef(carrinho)
  const opcoesRef = useRef(opcoes)

  useLayoutEffect(() => {
    opcoesRef.current = opcoes
  }, [opcoes])

  useEffect(() => {
    gravarNoNavegador(chave, carrinho, empresaId, usuarioId)
  }, [chave, carrinho, empresaId, usuarioId])

  const substituir = useCallback((novo: Carrinho) => {
    atualRef.current = novo
    setCarrinho(novo)
  }, [])

  const aplicar = useCallback(
    (resultado: ResultadoDaMudanca): ResultadoDaMudanca => {
      if (resultado.ok) {
        substituir(resultado.carrinho)
      }
      return resultado
    },
    [substituir],
  )

  const acoes = useMemo(
    () => ({
      adicionar: (item: ItemParaLancar) => aplicar(adicionarItem(atualRef.current, item, gerarUuid(), opcoesRef.current)),
      alterarQuantidade: (linhaId: string, delta: 1 | -1) =>
        aplicar(alterarQuantidadeDaLinha(atualRef.current, linhaId, delta, opcoesRef.current)),
      trocarEmbalagem: (linhaId: string, embalagemId: string | null) =>
        aplicar(trocarEmbalagemDaLinha(atualRef.current, linhaId, embalagemId, opcoesRef.current)),
      remover: (linhaId: string) => substituir(removerLinha(atualRef.current, linhaId)),
      aplicarDesconto: (alvo: string, desconto: DescontoInformado | null) =>
        substituir(aplicarDescontoNoCarrinho(atualRef.current, alvo, desconto)),
      definirCliente: (cliente: ClienteDaVenda | null) => substituir({ ...atualRef.current, cliente }),
      limpar: () => substituir(CARRINHO_VAZIO),
      substituir,
      /** O carrinho mais recente, mesmo antes do proximo render. */
      atual: () => atualRef.current,
    }),
    [aplicar, substituir],
  )

  return { carrinho, linhas: carrinho.linhas, desconto: carrinho.desconto, cliente: carrinho.cliente, ...acoes }
}

export type CarrinhoDaTela = ReturnType<typeof useCarrinho>
