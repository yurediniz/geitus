import { useRef } from 'react'

import { chaveDoHistoricoDePrecos } from '@/features/catalog/catalogoQuery'
import { ListaHistorico } from '@/features/products/secoes/ListaHistorico'
import { useJaApareceu } from '@/features/products/secoes/useSecaoVisivel'
import { SecaoMovimentosEstoque } from '@/features/products/estoque/SecaoMovimentosEstoque'
import { formatarDataHora, formatarMoeda, formatarVariacao } from '@/features/products/formatacaoProduto'
import { listarHistoricoDePrecos } from '@/services/produtoService'
import type { CampoHistoricoPreco, HistoricoPreco } from '@/types/produto'

const ROTULO_CAMPO: Readonly<Record<CampoHistoricoPreco, string>> = {
  CUSTO: 'Custo',
  PRECO_VENDA: 'Preço de venda',
  PRECO_EMBALAGEM: 'Preço da embalagem',
}

/** Valor vazio de cada campo: custo removido ou embalagem sem preco proprio (vale o calculado). */
const SEM_VALOR: Readonly<Record<CampoHistoricoPreco, string>> = {
  CUSTO: 'sem custo',
  PRECO_VENDA: 'sem preço',
  PRECO_EMBALAGEM: 'sem preço próprio',
}

/** Nome da linha: o campo e, no preco de embalagem, o rotulo dela na epoca ("Preço da embalagem CX c/ 3 UN"). */
function rotuloDaLinha(item: HistoricoPreco): string {
  return item.campo === 'PRECO_EMBALAGEM' && item.embalagemRotulo
    ? `${ROTULO_CAMPO.PRECO_EMBALAGEM} ${item.embalagemRotulo}`
    : ROTULO_CAMPO[item.campo]
}

export interface SecaoHistoricoProps {
  produtoId: string
  /** Sigla da unidade de venda (quantidades dos movimentos de estoque). */
  sigla: string
  controlaEstoque: boolean
}

/**
 * Secao Historico (so na edicao), em duas listas com paginacao propria: as
 * movimentacoes de estoque (primeiro) e as alteracoes de custo e de preco de
 * venda. As listas so montam quando a secao se aproxima da tela, entao as
 * consultas tambem so rodam ai (spec B2 §4).
 */
export function SecaoHistorico({ produtoId, sigla, controlaEstoque }: SecaoHistoricoProps) {
  const ref = useRef<HTMLDivElement>(null)
  const apareceu = useJaApareceu(ref)

  if (!apareceu) {
    return (
      <div ref={ref} className="min-h-24">
        <p className="text-sm text-muted-foreground">Movimentações de estoque e alterações de preço do produto.</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <SecaoMovimentosEstoque produtoId={produtoId} sigla={sigla} controlaEstoque={controlaEstoque} />
      <ListaHistorico<HistoricoPreco>
        id="historico-precos"
        titulo="Alterações de preço e custo"
        chave={chaveDoHistoricoDePrecos(produtoId)}
        buscar={(pagina) => listarHistoricoDePrecos(produtoId, pagina)}
        textos={{
          carregando: 'Carregando histórico de preços...',
          erroCarga: 'Não foi possível carregar o histórico de preços.',
          erroMais: 'Não foi possível carregar mais alterações. Tente de novo.',
          vazioTitulo: 'Nenhuma alteração de preço ou custo registrada ainda.',
          vazioDescricao:
            'As próximas mudanças de custo e de preço (inclusive das embalagens) aparecem aqui, com data e quem alterou.',
          rotuloLista: 'Alterações de preço e custo',
        }}
        // Sem id publico na linha: a chave e a posicao (as paginas carregadas nao mudam de lugar; o
        // historico e recarregado do zero quando o produto e salvo).
        chaveDoItem={(_, indice) => indice}
        renderizarItem={(item) => <LinhaHistorico item={item} />}
      />
    </div>
  )
}

/**
 * Valores da alteracao: "R$ 10,00 → R$ 11,50" (leitor de tela ouve "de X para
 * Y"), "R$ 10,00 (valor inicial)" no cadastro e "R$ 5,00 → sem custo" quando o
 * custo foi removido. Na embalagem, o vazio e "sem preço próprio" dos dois
 * lados (criada com preco, preco apagado ou embalagem removida).
 */
function ValoresDaAlteracao({ item }: { item: HistoricoPreco }) {
  const { valorAnterior: anterior, valorNovo: novo } = item
  const vazio = SEM_VALOR[item.campo]
  if (anterior === null && item.campo !== 'PRECO_EMBALAGEM') {
    return <span>{`${formatarMoeda(novo)} (valor inicial)`}</span>
  }
  const textoAnterior = anterior === null ? vazio : formatarMoeda(anterior)
  const textoNovo = novo === null ? vazio : formatarMoeda(novo)
  return (
    <span>
      <span aria-hidden="true">{`${textoAnterior} → ${textoNovo}`}</span>
      <span className="sr-only">{`de ${textoAnterior} para ${textoNovo}`}</span>
    </span>
  )
}

/** Uma alteracao: campo e valores em destaque; quando e quem, como apoio. */
function LinhaHistorico({ item }: { item: HistoricoPreco }) {
  const variacao = formatarVariacao(item.valorAnterior, item.valorNovo)
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium">{rotuloDaLinha(item)}</p>
        <p className="text-xs text-muted-foreground">
          <span>{formatarDataHora(item.alteradoEm)}</span>
          <span aria-hidden="true"> · </span>
          <span className="sr-only">, por </span>
          <span>{item.usuarioNome}</span>
        </p>
      </div>
      <div className="flex items-baseline gap-3 text-sm tabular-nums">
        <ValoresDaAlteracao item={item} />
        {/* Coluna sempre presente, para os valores ficarem alinhados entre as linhas. */}
        <span className="w-20 text-right font-medium">{variacao}</span>
      </div>
    </li>
  )
}
