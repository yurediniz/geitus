import { useCallback, useEffect, useState } from 'react'

import { chaveDoCarrinho, ehCarrinho, type Carrinho } from '@/features/pdv/carrinho'

/**
 * Vendas em espera (spec do PDV §3.7): no navegador, por empresa e usuario,
 * ate 5. Cada uma guarda o carrinho, a hora, a quantidade de itens e o total
 * do ultimo calculo (so para a lista): ao retomar, preco e estoque sao os de
 * agora, porque o calculo e refeito.
 */

export const LIMITE_DE_VENDAS_EM_ESPERA = 5
const VERSAO = 1

export interface VendaEmEspera {
  id: string
  criadaEm: string
  /** Quantidade de linhas. */
  itens: number
  /** O total do ultimo calculo, quando havia. */
  total: number | null
  carrinho: Carrinho
}

export type ResultadoDaEspera = { ok: true; vendas: VendaEmEspera[] } | { ok: false; erro: string }

export function chaveDasVendasEmEspera(empresaId: number, usuarioId: number): string {
  return `${chaveDoCarrinho(empresaId, usuarioId)}.espera`
}

export function porEmEspera(
  vendas: readonly VendaEmEspera[],
  carrinho: Carrinho,
  total: number | null,
  agora: string,
  id: string,
): ResultadoDaEspera {
  if (vendas.length >= LIMITE_DE_VENDAS_EM_ESPERA) {
    return { ok: false, erro: `Limite de ${LIMITE_DE_VENDAS_EM_ESPERA} vendas em espera.` }
  }
  return { ok: true, vendas: [...vendas, { id, criadaEm: agora, itens: carrinho.linhas.length, total, carrinho }] }
}

export function tirarDaEspera(vendas: readonly VendaEmEspera[], id: string): VendaEmEspera[] {
  return vendas.filter((venda) => venda.id !== id)
}

export function guardarVendasEmEspera(vendas: readonly VendaEmEspera[], empresaId: number, usuarioId: number): string {
  return JSON.stringify({ versao: VERSAO, empresaId, usuarioId, vendas })
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function ehVendaEmEspera(valor: unknown): valor is VendaEmEspera {
  return (
    ehObjeto(valor) &&
    typeof valor.id === 'string' &&
    typeof valor.criadaEm === 'string' &&
    typeof valor.itens === 'number' &&
    (valor.total === null || typeof valor.total === 'number') &&
    ehCarrinho(valor.carrinho)
  )
}

/** Corrompido, de outra versao, de outra empresa ou de outro usuario: nenhuma venda em espera. */
export function lerVendasEmEspera(texto: string | null, empresaId: number, usuarioId: number): VendaEmEspera[] {
  if (texto === null) {
    return []
  }
  let guardado: unknown
  try {
    guardado = JSON.parse(texto)
  } catch {
    return []
  }
  if (
    !ehObjeto(guardado) ||
    guardado.versao !== VERSAO ||
    guardado.empresaId !== empresaId ||
    guardado.usuarioId !== usuarioId ||
    !Array.isArray(guardado.vendas) ||
    guardado.vendas.length > LIMITE_DE_VENDAS_EM_ESPERA ||
    !guardado.vendas.every(ehVendaEmEspera)
  ) {
    return []
  }
  return guardado.vendas
}

/** As vendas em espera do usuario, gravadas no navegador a cada mudanca. */
export function useVendasEmEspera(empresaId: number, usuarioId: number) {
  const chave = chaveDasVendasEmEspera(empresaId, usuarioId)
  const [vendas, setVendas] = useState<VendaEmEspera[]>(() => {
    try {
      return lerVendasEmEspera(localStorage.getItem(chave), empresaId, usuarioId)
    } catch {
      return []
    }
  })

  useEffect(() => {
    try {
      if (vendas.length === 0) {
        localStorage.removeItem(chave)
      } else {
        localStorage.setItem(chave, guardarVendasEmEspera(vendas, empresaId, usuarioId))
      }
    } catch {
      // Segue na memoria.
    }
  }, [chave, vendas, empresaId, usuarioId])

  const substituir = useCallback((novas: VendaEmEspera[]) => setVendas(novas), [])
  return { vendas, substituir }
}
