/**
 * Regras puras das embalagens de venda (Fase B3, docs/modules/produtos-embalagens.md):
 * rotulo, preco calculado, preco vigente da unidade, preco minimo por unidade,
 * conversao do saldo e embalagem principal. Dinheiro e quantidade sao contados
 * em inteiros (centavos e milesimos), como o `NUMERIC` do backend, sem erro de
 * ponto flutuante. Sem React: testavel isolado.
 */
import { digitosParaValor, valorParaDigitos } from '@/lib/moeda'
import { interpretarQuantidade } from '@/lib/quantidade'

/** Numero pt-BR sem zeros a direita e sem agrupar milhares (25.5 -> "25,5"). */
function numeroSemZeros(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 3, useGrouping: false })
}

/** Quantidade em milesimos (NUMERIC(12,3)); null se o texto nao e uma quantidade > 0. */
function milesimos(quantidade: string | number): number | null {
  const valor = typeof quantidade === 'number' ? quantidade : interpretarQuantidade(quantidade)
  return valor === null || valor <= 0 ? null : Math.round(valor * 1000)
}

/** Centavos de um valor do formulario ("89.90" -> 8990n); null se vazio. */
function centavos(valor: string): bigint | null {
  return valor.trim() === '' ? null : BigInt(valorParaDigitos(valor) || '0')
}

/**
 * Rotulo derivado da embalagem, a mesma regra do backend: "CX c/ 3 UN",
 * "SC c/ 25,5 KG". A quantidade pode vir do formulario (texto com virgula) ou
 * da API (numero); texto que ainda nao e numero aparece como digitado.
 */
export function rotuloDaEmbalagem(sigla: string, quantidade: string | number, siglaDeVenda: string): string {
  const valor = typeof quantidade === 'number' ? quantidade : interpretarQuantidade(quantidade)
  const texto = valor === null ? String(quantidade).trim() : numeroSemZeros(valor)
  return `${sigla} c/ ${texto} ${siglaDeVenda}`
}

/**
 * Preco da embalagem sem preco proprio: quantidade x preco vigente da unidade,
 * arredondado a centavos com meio para cima ("3" e "89.90" -> "269.70"). Null
 * sem quantidade > 0 ou sem preco.
 */
export function precoCalculadoDaEmbalagem(quantidade: string, precoVigente: string): string | null {
  const qtd = milesimos(quantidade)
  const preco = centavos(precoVigente)
  if (qtd === null || preco === null) {
    return null
  }
  // (preco x qtd) / 1000 com meio para cima, em inteiros: (2a + b) / 2b.
  const resultado = (2n * preco * BigInt(qtd) + 1000n) / 2000n
  return digitosParaValor(resultado.toString())
}

/** O que o preco vigente da unidade le do formulario. */
export interface ValoresDoPrecoDaUnidade {
  precoVenda: string
  promocaoAtiva: boolean
  precoPromocional: string
  promocaoInicio: string
  promocaoFim: string
}

/**
 * Preco vigente da unidade na tela: o promocional quando a promocao esta ligada,
 * tem preco e `hoje` (yyyy-mm-dd, fuso de Sao Paulo) cai entre inicio e fim,
 * inclusive; senao, o preco de venda.
 */
export function precoVigenteDaUnidade(
  valores: ValoresDoPrecoDaUnidade,
  hoje: string,
): { preco: string; emPromocao: boolean } {
  const { promocaoAtiva, precoPromocional, promocaoInicio: inicio, promocaoFim: fim } = valores
  const vigente =
    promocaoAtiva && precoPromocional.trim() !== '' && inicio !== '' && fim !== '' && inicio <= hoje && hoje <= fim
  return vigente ? { preco: precoPromocional, emPromocao: true } : { preco: valores.precoVenda, emPromocao: false }
}

/**
 * Preco por unidade de venda de um preco de embalagem, em centavos com meio
 * para cima ("209.90" e "3" -> "69.97"). Null sem preco ou sem quantidade > 0.
 */
export function valorPorUnidade(preco: string, quantidade: string): string | null {
  const valorPreco = centavos(preco)
  const qtd = milesimos(quantidade)
  if (valorPreco === null || qtd === null) {
    return null
  }
  const divisor = BigInt(qtd)
  // (preco x 1000) / qtd com meio para cima, em inteiros: (2a + b) / 2b.
  return digitosParaValor(((2n * valorPreco * 1000n + divisor) / (2n * divisor)).toString())
}

/**
 * Preco proprio abaixo do minimo da unidade (spec §3.3): compara preco < minimo
 * x quantidade, sem divisao. Abaixo, devolve o valor por unidade truncado a
 * centavos (nunca mostra um valor igual ao minimo: 209,99 / 3 -> "69.99");
 * senao, ou faltando algum valor, null.
 */
export function valorPorUnidadeAbaixoDoMinimo(preco: string, quantidade: string, minimo: string): string | null {
  const valorPreco = centavos(preco)
  const valorMinimo = centavos(minimo)
  const qtd = milesimos(quantidade)
  if (valorPreco === null || valorMinimo === null || qtd === null) {
    return null
  }
  const milesimosDaQuantidade = BigInt(qtd)
  if (valorPreco * 1000n >= valorMinimo * milesimosDaQuantidade) {
    return null
  }
  const porUnidade = (valorPreco * 1000n) / milesimosDaQuantidade
  return digitosParaValor(porUnidade.toString())
}

/**
 * O saldo em embalagens (spec §5.2): "18 CX + 1 UN" ou "18 CX", com a parte
 * inteira de embalagens e o resto (com ate 3 casas na unidade fracionada).
 * Null com saldo <= 0 ou menor que 1 embalagem.
 */
export function conversaoEmEmbalagens(
  saldo: number,
  embalagem: { sigla: string; quantidade: number },
  siglaDeVenda: string,
  fracionada: boolean,
): string | null {
  const total = Math.round(saldo * 1000)
  const porEmbalagem = Math.round(embalagem.quantidade * 1000)
  if (total <= 0 || porEmbalagem <= 0 || total < porEmbalagem) {
    return null
  }
  const inteiras = Math.floor(total / porEmbalagem)
  const restoMilesimos = total - inteiras * porEmbalagem
  const resto = fracionada ? restoMilesimos / 1000 : Math.round(restoMilesimos / 1000)
  const restoTexto = resto > 0 ? ` + ${resto.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${siglaDeVenda}` : ''
  return `${inteiras.toLocaleString('pt-BR')} ${embalagem.sigla}${restoTexto}`
}

/** Saldo com a conversao pela embalagem: "55 UN (18 CX + 1 UN)" ou "54 UN (18 CX)"; null como `conversaoEmEmbalagens`. */
export function conversaoDoSaldo(
  saldo: number,
  embalagem: { sigla: string; quantidade: number },
  siglaDeVenda: string,
  fracionada: boolean,
): string | null {
  const emEmbalagens = conversaoEmEmbalagens(saldo, embalagem, siglaDeVenda, fracionada)
  return emEmbalagens === null
    ? null
    : `${saldo.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${siglaDeVenda} (${emEmbalagens})`
}

/** Embalagem principal (spec §2.2): a de compra, se houver; senao, a primeira da lista. */
export function embalagemPrincipal<T extends { deCompra: boolean }>(lista: readonly T[]): T | undefined {
  return lista.find((embalagem) => embalagem.deCompra) ?? lista[0]
}
