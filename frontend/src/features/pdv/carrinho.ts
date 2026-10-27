/**
 * O carrinho do PDV (spec `docs/modules/pdv.md`): a venda em
 * andamento, que vive so no navegador ate finalizar. Regras puras, sem React:
 * soma na mesma linha, etiqueta sempre em linha nova, limites e o saldo com
 * "Vender sem estoque" desligada. Preco, desconto e total sao sempre do
 * servidor (`POST /api/pdv/calculo`).
 */
import { quantidadeParaTexto } from '@/lib/quantidade'
import { ehUrlDeImagemPermitida } from '@/services/httpClient'
import type {
  CarrinhoRequest,
  DescontoInformado,
  FinalizarVendaRequest,
  ItemResolvido,
  PagamentoInformado,
  ProdutoDoPdv,
} from '@/types/pdv'

export const LIMITE_DE_LINHAS = 300
export const QUANTIDADE_MAXIMA = 99_999
const VERSAO_DO_CARRINHO = 1

export interface ClienteDaVenda {
  id: string
  nome: string
}

export interface LinhaDoCarrinho {
  /** Id local da linha (a selecao e os erros seguem a linha, nao a posicao). */
  id: string
  /** O produto como foi lido (nome, unidade, embalagens e saldo para a tela). */
  produto: ProdutoDoPdv
  embalagemId: string | null
  /** Na unidade da linha. */
  quantidade: number
  codigoLido: string | null
  etiqueta: boolean
  desconto: DescontoInformado | null
}

export interface Carrinho {
  linhas: LinhaDoCarrinho[]
  /** Desconto do total. */
  desconto: DescontoInformado | null
  cliente: ClienteDaVenda | null
}

export const CARRINHO_VAZIO: Carrinho = { linhas: [], desconto: null, cliente: null }

/** O item lido (`GET /api/pdv/itens?codigo=`) ou escolhido na busca por nome (sem codigo lido). */
export type ItemParaLancar = Omit<ItemResolvido, 'codigoLido'> & { codigoLido: string | null }

export interface OpcoesDoCarrinho {
  /** Configuracoes › PDV: desligada, recusa o que passa do saldo. */
  venderSemEstoque: boolean
}

/** `linhaId`: a linha criada ou alterada (a tela a seleciona e destaca). */
export type ResultadoDaMudanca = { ok: true; carrinho: Carrinho; linhaId?: string } | { ok: false; erro: string }

function comALinha(resultado: ResultadoDaMudanca, linhaId: string): ResultadoDaMudanca {
  return resultado.ok ? { ...resultado, linhaId } : resultado
}

/** Soma com 3 casas, sem acumular erro de ponto flutuante. */
function somar(a: number, b: number): number {
  return Math.round((a + b) * 1000) / 1000
}

function embalagemDa(linha: LinhaDoCarrinho) {
  return linha.embalagemId === null
    ? null
    : (linha.produto.embalagens.find((embalagem) => embalagem.id === linha.embalagemId) ?? null)
}

/** O rotulo da unidade da linha: a sigla do produto ou o rotulo da embalagem. */
export function unidadeDaLinha(linha: LinhaDoCarrinho): string {
  return embalagemDa(linha)?.rotulo ?? linha.produto.unidade
}

/** O que as linhas do produto baixam do estoque, na unidade de venda (embalagem x quantidade da embalagem). */
export function quantidadeDeEstoque(carrinho: Carrinho, produtoId: string): number {
  return carrinho.linhas
    .filter((linha) => linha.produto.id === produtoId)
    .reduce((soma, linha) => somar(soma, linha.quantidade * (embalagemDa(linha)?.quantidade ?? 1)), 0)
}

/** Recusa o carrinho cujo produto passa do saldo (so com "Vender sem estoque" desligada). */
function conferirEstoque(carrinho: Carrinho, produto: ProdutoDoPdv, opcoes: OpcoesDoCarrinho): ResultadoDaMudanca {
  if (opcoes.venderSemEstoque || !produto.controlaEstoque || produto.saldo === null) {
    return { ok: true, carrinho }
  }
  if (quantidadeDeEstoque(carrinho, produto.id) > produto.saldo) {
    return {
      ok: false,
      erro: `Estoque insuficiente para ${produto.nome} (saldo ${quantidadeParaTexto(produto.saldo)} ${produto.unidade}).`,
    }
  }
  return { ok: true, carrinho }
}

function trocarLinha(carrinho: Carrinho, linhaId: string, mudar: (linha: LinhaDoCarrinho) => LinhaDoCarrinho): Carrinho {
  return { ...carrinho, linhas: carrinho.linhas.map((linha) => (linha.id === linhaId ? mudar(linha) : linha)) }
}

/**
 * Lanca o item lido. Bipar de novo o mesmo produto na mesma unidade ou
 * embalagem (sem etiqueta) soma na linha existente; a etiqueta e sempre uma
 * linha nova. `idNovo` e o id da linha quando ela e criada.
 */
export function adicionarItem(
  carrinho: Carrinho,
  item: ItemParaLancar,
  idNovo: string,
  opcoes: OpcoesDoCarrinho,
): ResultadoDaMudanca {
  const etiqueta = item.tipo === 'ETIQUETA'
  const existente = etiqueta
    ? undefined
    : carrinho.linhas.find(
        (linha) => !linha.etiqueta && linha.produto.id === item.produto.id && linha.embalagemId === item.embalagemId,
      )
  if (existente) {
    const quantidade = somar(existente.quantidade, item.quantidade)
    if (quantidade > QUANTIDADE_MAXIMA) {
      return { ok: false, erro: 'Quantidade acima do permitido.' }
    }
    // O produto relido traz o saldo e as embalagens de agora.
    const novo = trocarLinha(carrinho, existente.id, (linha) => ({ ...linha, produto: item.produto, quantidade }))
    return comALinha(conferirEstoque(novo, item.produto, opcoes), existente.id)
  }
  if (carrinho.linhas.length >= LIMITE_DE_LINHAS) {
    return { ok: false, erro: `A venda atingiu o limite de ${LIMITE_DE_LINHAS} itens.` }
  }
  const linha: LinhaDoCarrinho = {
    id: idNovo,
    produto: item.produto,
    embalagemId: item.embalagemId,
    quantidade: item.quantidade,
    codigoLido: item.codigoLido,
    etiqueta,
    desconto: null,
  }
  return comALinha(conferirEstoque({ ...carrinho, linhas: [...carrinho.linhas, linha] }, item.produto, opcoes), idNovo)
}

/** + / − na linha: de 1 em 1, nunca abaixo de 1 (remover e com o Del). */
export function alterarQuantidade(
  carrinho: Carrinho,
  linhaId: string,
  delta: 1 | -1,
  opcoes: OpcoesDoCarrinho,
): ResultadoDaMudanca {
  const linha = carrinho.linhas.find((item) => item.id === linhaId)
  if (!linha) {
    return { ok: true, carrinho }
  }
  if (linha.etiqueta) {
    return { ok: false, erro: 'A quantidade da etiqueta da balança não pode ser alterada.' }
  }
  const quantidade = somar(linha.quantidade, delta)
  if (quantidade < 1) {
    return { ok: true, carrinho }
  }
  if (quantidade > QUANTIDADE_MAXIMA) {
    return { ok: false, erro: 'Quantidade acima do permitido.' }
  }
  const novo = trocarLinha(carrinho, linhaId, (atual) => ({ ...atual, quantidade }))
  return delta > 0 ? conferirEstoque(novo, linha.produto, opcoes) : { ok: true, carrinho: novo }
}

/** O seletor "UN ▾": troca a linha de unidade para uma embalagem (e de volta), mantendo a quantidade. */
export function trocarEmbalagem(
  carrinho: Carrinho,
  linhaId: string,
  embalagemId: string | null,
  opcoes: OpcoesDoCarrinho,
): ResultadoDaMudanca {
  const linha = carrinho.linhas.find((item) => item.id === linhaId)
  if (!linha || linha.etiqueta) {
    return { ok: true, carrinho }
  }
  const embalagem = linha.produto.embalagens.find((item) => item.id === embalagemId)
  if (embalagem && !Number.isInteger(linha.quantidade)) {
    return { ok: false, erro: `${embalagem.rotulo} não aceita quantidade fracionada. Informe um número inteiro.` }
  }
  const novo = trocarLinha(carrinho, linhaId, (atual) => ({ ...atual, embalagemId: embalagem ? embalagem.id : null }))
  return conferirEstoque(novo, linha.produto, opcoes)
}

export function removerLinha(carrinho: Carrinho, linhaId: string): Carrinho {
  return { ...carrinho, linhas: carrinho.linhas.filter((linha) => linha.id !== linhaId) }
}

/** Desconto de uma linha (pelo id) ou do total (`'TOTAL'`); null remove. */
export function aplicarDesconto(carrinho: Carrinho, alvo: string, desconto: DescontoInformado | null): Carrinho {
  if (alvo === 'TOTAL') {
    return { ...carrinho, desconto }
  }
  return trocarLinha(carrinho, alvo, (linha) => ({ ...linha, desconto }))
}

/** O corpo do calculo e da venda: so ids, quantidades, codigos lidos e descontos (o servidor relê o resto). */
export function paraRequest(carrinho: Carrinho, pagamentos: readonly PagamentoInformado[]): CarrinhoRequest {
  return {
    itens: carrinho.linhas.map((linha) => ({
      produtoId: linha.produto.id,
      embalagemId: linha.embalagemId,
      quantidade: linha.quantidade,
      codigoLido: linha.codigoLido,
      etiqueta: linha.etiqueta,
      desconto: linha.desconto,
    })),
    desconto: carrinho.desconto,
    clienteId: carrinho.cliente?.id ?? null,
    pagamentos: [...pagamentos],
  }
}

/** Chave do carrinho no `localStorage`, por empresa e usuario. */
export function chaveDoCarrinho(empresaId: number, usuarioId: number): string {
  return `geitus.pdv.${empresaId}.${usuarioId}`
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor)
}

function ehTextoOuNulo(valor: unknown): boolean {
  return valor === null || typeof valor === 'string'
}

function ehQuantidade(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor) && valor > 0 && valor <= QUANTIDADE_MAXIMA
}

function ehDesconto(valor: unknown): boolean {
  return (
    valor === null ||
    (ehObjeto(valor) &&
      (valor.tipo === 'PERCENTUAL' || valor.tipo === 'VALOR') &&
      typeof valor.valor === 'number' &&
      Number.isFinite(valor.valor) &&
      valor.valor >= 0)
  )
}

function ehProduto(valor: unknown): boolean {
  return (
    ehObjeto(valor) &&
    typeof valor.id === 'string' &&
    typeof valor.nome === 'string' &&
    typeof valor.unidade === 'string' &&
    typeof valor.fracionada === 'boolean' &&
    typeof valor.controlaEstoque === 'boolean' &&
    (valor.saldo === null || typeof valor.saldo === 'number') &&
    ehTextoOuNulo(valor.miniaturaUrl) &&
    Array.isArray(valor.embalagens) &&
    valor.embalagens.every(
      (embalagem) =>
        ehObjeto(embalagem) &&
        typeof embalagem.id === 'string' &&
        typeof embalagem.rotulo === 'string' &&
        typeof embalagem.quantidade === 'number',
    )
  )
}

function ehLinha(valor: unknown): boolean {
  return (
    ehObjeto(valor) &&
    typeof valor.id === 'string' &&
    ehProduto(valor.produto) &&
    ehTextoOuNulo(valor.embalagemId) &&
    ehQuantidade(valor.quantidade) &&
    ehTextoOuNulo(valor.codigoLido) &&
    typeof valor.etiqueta === 'boolean' &&
    ehDesconto(valor.desconto)
  )
}

/** Se o valor lido do navegador tem o formato do carrinho (cada linha, o desconto e o cliente). */
export function ehCarrinho(valor: unknown): valor is Carrinho {
  return (
    ehObjeto(valor) &&
    Array.isArray(valor.linhas) &&
    valor.linhas.length <= LIMITE_DE_LINHAS &&
    valor.linhas.every(ehLinha) &&
    ehDesconto(valor.desconto) &&
    (valor.cliente === null ||
      (ehObjeto(valor.cliente) && typeof valor.cliente.id === 'string' && typeof valor.cliente.nome === 'string'))
  )
}

/**
 * Por que a tentativa de finalizar ficou travada:
 * - `REDE`: sem resposta; a venda pode ter sido gravada, entao so se reenvia o mesmo corpo;
 * - `OUTROS_DADOS`: o servidor ja tem uma venda com esta chave e outros dados.
 */
export type TravaDaTentativa = 'REDE' | 'OUTROS_DADOS'

/**
 * A tentativa pendente de finalizar a venda (decisao do CTO sobre a spec do
 * PDV): a chave de idempotencia nasce na primeira tentativa e fica com o
 * carrinho, para ser reenviada igual depois de fechar a janela ou recarregar.
 */
export interface TentativaDeVenda {
  chave: string
  /** O corpo da ultima tentativa; com `trava`, e reenviado sem mudar. */
  corpo: FinalizarVendaRequest | null
  trava: TravaDaTentativa | null
}

export interface CarrinhoGuardado {
  carrinho: Carrinho
  tentativa: TentativaDeVenda | null
}

function ehCorpo(valor: unknown, chave: string): valor is FinalizarVendaRequest {
  return (
    ehObjeto(valor) &&
    valor.chave === chave &&
    typeof valor.totalEsperado === 'number' &&
    Array.isArray(valor.itens) &&
    Array.isArray(valor.pagamentos) &&
    valor.pagamentos.every(
      (pagamento) => ehObjeto(pagamento) && typeof pagamento.forma === 'string' && typeof pagamento.valor === 'number',
    ) &&
    ehTextoOuNulo(valor.clienteId) &&
    ehDesconto(valor.desconto)
  )
}

function ehTentativa(valor: unknown): valor is TentativaDeVenda {
  return (
    ehObjeto(valor) &&
    typeof valor.chave === 'string' &&
    valor.chave !== '' &&
    (valor.trava === null || valor.trava === 'REDE' || valor.trava === 'OUTROS_DADOS') &&
    (valor.corpo === null || ehCorpo(valor.corpo, valor.chave))
  )
}

/**
 * O carrinho lido do navegador pode ter sido adulterado: a miniatura so vale
 * sob `/api/imagens/` (a mesma regra do `httpClient`); qualquer outra URL vira null.
 */
export function higienizarCarrinho(carrinho: Carrinho): Carrinho {
  return {
    ...carrinho,
    linhas: carrinho.linhas.map((linha) =>
      linha.produto.miniaturaUrl === null || ehUrlDeImagemPermitida(linha.produto.miniaturaUrl)
        ? linha
        : { ...linha, produto: { ...linha.produto, miniaturaUrl: null } },
    ),
  }
}

/** O texto guardado: o carrinho e a tentativa pendente, com a versao do formato, a empresa e o usuario. */
export function guardarCarrinho(
  carrinho: Carrinho,
  empresaId: number,
  usuarioId: number,
  tentativa: TentativaDeVenda | null = null,
): string {
  return JSON.stringify({ versao: VERSAO_DO_CARRINHO, empresaId, usuarioId, carrinho, tentativa })
}

const NADA_GUARDADO: CarrinhoGuardado = { carrinho: CARRINHO_VAZIO, tentativa: null }

/**
 * Le o carrinho e a tentativa guardados. Corrompido, de outra versao, de outra
 * empresa ou de outro usuario (Review Focus 3): ignorado, o carrinho comeca
 * vazio, sem erro. Tentativa malformada e ignorada, o carrinho fica.
 */
export function lerGuardado(texto: string | null, empresaId: number, usuarioId: number): CarrinhoGuardado {
  if (texto === null) {
    return NADA_GUARDADO
  }
  let guardado: unknown
  try {
    guardado = JSON.parse(texto)
  } catch {
    return NADA_GUARDADO
  }
  if (
    !ehObjeto(guardado) ||
    guardado.versao !== VERSAO_DO_CARRINHO ||
    guardado.empresaId !== empresaId ||
    guardado.usuarioId !== usuarioId ||
    !ehCarrinho(guardado.carrinho)
  ) {
    return NADA_GUARDADO
  }
  return {
    carrinho: higienizarCarrinho(guardado.carrinho),
    tentativa: ehTentativa(guardado.tentativa) ? guardado.tentativa : null,
  }
}

/** So o carrinho guardado (ver `lerGuardado`). */
export function lerCarrinhoGuardado(texto: string | null, empresaId: number, usuarioId: number): Carrinho {
  return lerGuardado(texto, empresaId, usuarioId).carrinho
}
