import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  adicionarItem,
  alterarQuantidade as alterarQuantidadeDaLinha,
  aplicarDesconto as aplicarDescontoNoCarrinho,
  CARRINHO_VAZIO,
  chaveDoCarrinho,
  guardarCarrinho,
  lerGuardado,
  removerLinha,
  trocarEmbalagem as trocarEmbalagemDaLinha,
  type Carrinho,
  type CarrinhoGuardado,
  type ClienteDaVenda,
  type ItemParaLancar,
  type OpcoesDoCarrinho,
  type ResultadoDaMudanca,
  type TentativaDeVenda,
} from '@/features/pdv/carrinho'
import { gerarUuid } from '@/lib/uuid'
import type { DescontoInformado } from '@/types/pdv'

/** Com a tentativa travada, o carrinho nao muda: o reenvio precisa do mesmo corpo. */
export const MENSAGEM_TENTATIVA_PENDENTE =
  'Esta venda tem uma tentativa de pagamento pendente. Abra o pagamento (F10) para tentar de novo ou descartar a tentativa.'

function lerDoNavegador(chave: string): string | null {
  try {
    return localStorage.getItem(chave)
  } catch {
    return null
  }
}

/** Sem espaco ou com o armazenamento bloqueado, o carrinho segue so na memoria (a venda nao para). */
function gravarNoNavegador(chave: string, guardado: CarrinhoGuardado, empresaId: number, usuarioId: number): void {
  const { carrinho, tentativa } = guardado
  try {
    if (carrinho.linhas.length === 0 && carrinho.cliente === null && carrinho.desconto === null && tentativa === null) {
      localStorage.removeItem(chave)
    } else {
      localStorage.setItem(chave, guardarCarrinho(carrinho, empresaId, usuarioId, tentativa))
    }
  } catch {
    // Segue na memoria.
  }
}

/**
 * O carrinho da venda em andamento (spec do PDV), guardado no
 * `localStorage` por empresa e usuario com a tentativa pendente de finalizar
 * (a chave de idempotencia): recarregar a pagina mantem a venda e a chave.
 * As mudancas partem sempre do estado mais recente (uma referencia sincrona),
 * para que varias leituras seguidas, antes de um novo render, nao se percam.
 */
export function useCarrinho(empresaId: number, usuarioId: number, opcoes: OpcoesDoCarrinho) {
  const chave = chaveDoCarrinho(empresaId, usuarioId)
  const [guardado, setGuardado] = useState<CarrinhoGuardado>(() =>
    lerGuardado(lerDoNavegador(chave), empresaId, usuarioId),
  )
  const atualRef = useRef(guardado)
  const opcoesRef = useRef(opcoes)

  useLayoutEffect(() => {
    opcoesRef.current = opcoes
  }, [opcoes])

  // Grava na hora (e nao num efeito): a tela pode sair no mesmo render (ex.: o caixa fechou) e a
  // chave pendente da venda nao pode ficar desatualizada no navegador.
  const gravar = useCallback(
    (novo: CarrinhoGuardado) => {
      atualRef.current = novo
      setGuardado(novo)
      gravarNoNavegador(chave, novo, empresaId, usuarioId)
    },
    [chave, empresaId, usuarioId],
  )

  /** Uma venda nova (limpar, retomar da espera): sem tentativa pendente. */
  const substituir = useCallback((carrinho: Carrinho) => gravar({ carrinho, tentativa: null }), [gravar])

  const mudarCarrinho = useCallback(
    (carrinho: Carrinho) => gravar({ ...atualRef.current, carrinho }),
    [gravar],
  )

  const aplicar = useCallback(
    (mudar: (carrinho: Carrinho) => ResultadoDaMudanca): ResultadoDaMudanca => {
      if (atualRef.current.tentativa?.trava) {
        return { ok: false, erro: MENSAGEM_TENTATIVA_PENDENTE }
      }
      const resultado = mudar(atualRef.current.carrinho)
      if (resultado.ok) {
        mudarCarrinho(resultado.carrinho)
      }
      return resultado
    },
    [mudarCarrinho],
  )

  const acoes = useMemo(
    () => ({
      adicionar: (item: ItemParaLancar) =>
        aplicar((carrinho) => adicionarItem(carrinho, item, gerarUuid(), opcoesRef.current)),
      alterarQuantidade: (linhaId: string, delta: 1 | -1) =>
        aplicar((carrinho) => alterarQuantidadeDaLinha(carrinho, linhaId, delta, opcoesRef.current)),
      trocarEmbalagem: (linhaId: string, embalagemId: string | null) =>
        aplicar((carrinho) => trocarEmbalagemDaLinha(carrinho, linhaId, embalagemId, opcoesRef.current)),
      remover: (linhaId: string) => aplicar((carrinho) => ({ ok: true, carrinho: removerLinha(carrinho, linhaId) })),
      aplicarDesconto: (alvo: string, desconto: DescontoInformado | null) =>
        aplicar((carrinho) => ({ ok: true, carrinho: aplicarDescontoNoCarrinho(carrinho, alvo, desconto) })),
      definirCliente: (cliente: ClienteDaVenda | null) => aplicar((carrinho) => ({ ok: true, carrinho: { ...carrinho, cliente } })),
      /** Desfazer: o carrinho de antes volta, com a mesma tentativa. */
      restaurar: (anterior: Carrinho) => aplicar(() => ({ ok: true, carrinho: anterior })),
      limpar: () => substituir(CARRINHO_VAZIO),
      substituir,
      definirTentativa: (tentativa: TentativaDeVenda | null) => gravar({ ...atualRef.current, tentativa }),
      /** O carrinho mais recente, mesmo antes do proximo render. */
      atual: () => atualRef.current.carrinho,
    }),
    [aplicar, gravar, substituir],
  )

  const { carrinho, tentativa } = guardado
  return { carrinho, tentativa, linhas: carrinho.linhas, desconto: carrinho.desconto, cliente: carrinho.cliente, ...acoes }
}

export type CarrinhoDaTela = ReturnType<typeof useCarrinho>
