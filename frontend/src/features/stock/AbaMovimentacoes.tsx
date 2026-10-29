import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import type { ProdutoEscolhido } from '@/features/products/BuscaDeProduto'
import { textoMovimento } from '@/features/products/estoque/ajusteEstoque'
import { formatarDataHora } from '@/features/products/formatacaoProduto'
import { ListaHistorico } from '@/features/products/secoes/ListaHistorico'
import { rotaDoProduto, type EstadoParaProduto } from '@/features/products/navegacaoProdutos'
import { chaveDasMovimentacoes } from '@/features/stock/estoqueQuery'
import { FiltrosDasMovimentacoes } from '@/features/stock/FiltrosDasMovimentacoes'
import { JanelaDaVenda } from '@/features/stock/JanelaDaVenda'
import { useFiltrosDasMovimentacoes } from '@/features/stock/useFiltrosDasMovimentacoes'
import { listarMovimentacoes } from '@/services/estoqueService'
import { HttpError } from '@/services/httpClient'
import { buscarProduto } from '@/services/produtoService'
import { listarUsuarios } from '@/services/usuarioService'
import type { MovimentacaoDeEstoque } from '@/types/estoque'
import type { Produto } from '@/types/produto'
import type { Usuario } from '@/types/usuario'

type VendaDoMovimento = NonNullable<MovimentacaoDeEstoque['venda']>

/** Venda com a janela aberta e o botao que a abriu (recebe o foco ao fechar). */
interface VendaAberta {
  venda: VendaDoMovimento
  origem: HTMLElement
}

const PRODUTO_NAO_ENCONTRADO = 'Produto do filtro não encontrado.'

/** Lista de usuarios do filtro (prefixo `usuarios`: a gestao de usuarios invalida). */
const USUARIOS_DO_FILTRO_QUERY_KEY = ['usuarios', 'filtro-das-movimentacoes'] as const

/**
 * Aba Movimentacoes da area Estoque (spec de Estoque, regras 26 e 27): os
 * movimentos de todos os produtos, do mais recente para o mais antigo, com
 * periodo, produto, tipo, motivo e (so ADMIN) usuario na URL e "Carregar mais".
 * O ADMIN abre a venda do movimento numa janela; o OPERADOR ve so o numero (a
 * rota do detalhe so atende o dono do caixa ou o ADMIN).
 */
export function AbaMovimentacoes({ admin }: { admin: boolean }) {
  const location = useLocation()
  const { filtros, alterar, limpar, escolherAtalho, atalho, erroDoPeriodo, temFiltroAtivo, hoje } =
    useFiltrosDasMovimentacoes(admin)

  // /api/usuarios e so do ADMIN: o OPERADOR nao ve o filtro de usuario.
  const usuariosQuery = useQuery<Usuario[]>({
    queryKey: USUARIOS_DO_FILTRO_QUERY_KEY,
    queryFn: () => listarUsuarios(),
    enabled: admin,
    select: (usuarios) => [...usuarios].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  })

  // --- Produto do filtro: o escolhido na busca ja traz o nome; vindo da URL (link, "Voltar"), busca pelo id.
  const [produtoEscolhido, setProdutoEscolhido] = useState<ProdutoEscolhido | null>(null)
  const [avisoDoProduto, setAvisoDoProduto] = useState<string | null>(null)
  const produtoDaUrl = filtros.produto
  const conhecido = produtoEscolhido !== null && produtoEscolhido.id === produtoDaUrl
  const produtoQuery = useQuery<Produto>({
    queryKey: [...PRODUTOS_QUERY_KEY, 'filtro-das-movimentacoes', produtoDaUrl],
    queryFn: () => buscarProduto(produtoDaUrl ?? ''),
    enabled: produtoDaUrl !== null && !conhecido,
    retry: false,
  })
  const produtoSumiu = produtoQuery.error instanceof HttpError && produtoQuery.error.status === 404
  useEffect(() => {
    // Produto excluido (ou de outra empresa): o filtro sai da URL, com um aviso. Substitui a entrada
    // do historico: o Voltar do navegador nao cai de novo na URL com o produto.
    if (produtoSumiu) {
      setAvisoDoProduto(PRODUTO_NAO_ENCONTRADO)
      alterar({ produto: null }, { substituir: true })
    }
  }, [produtoSumiu, alterar])
  const produtoDoFiltro = ((): ProdutoEscolhido | null => {
    if (produtoDaUrl === null) {
      return null
    }
    if (conhecido) {
      return produtoEscolhido
    }
    const dados = produtoQuery.data
    if (dados) {
      return { id: dados.id, numero: dados.numero, nome: dados.nome, ativo: dados.ativo }
    }
    return { id: produtoDaUrl, numero: 0, nome: produtoQuery.isError ? 'Produto escolhido' : 'Carregando produto…', ativo: true }
  })()
  const escolherProduto = (produto: ProdutoEscolhido | null) => {
    setProdutoEscolhido(produto)
    setAvisoDoProduto(null)
    alterar({ produto: produto?.id ?? null })
  }

  const limparTudo = () => {
    setAvisoDoProduto(null)
    limpar()
  }

  const [vendaAberta, setVendaAberta] = useState<VendaAberta | null>(null)

  // Leva a URL atual para a pagina do produto voltar a esta aba, com os mesmos filtros.
  const estadoParaProduto: EstadoParaProduto = { voltarPara: `${location.pathname}${location.search}` }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent>
          <FiltrosDasMovimentacoes
            filtros={filtros}
            alterar={alterar}
            escolherAtalho={escolherAtalho}
            atalho={atalho}
            erroDoPeriodo={erroDoPeriodo}
            hoje={hoje}
            aoLimpar={limparTudo}
            temFiltroAtivo={temFiltroAtivo}
            produto={produtoDoFiltro}
            aoEscolherProduto={escolherProduto}
            avisoDoProduto={
              avisoDoProduto ??
              (produtoQuery.isError && !produtoSumiu ? 'Não foi possível carregar o produto do filtro.' : null)
            }
            usuarios={admin ? usuariosQuery.data : undefined}
            carregandoUsuarios={admin && usuariosQuery.isPending}
            erroNosUsuarios={admin && usuariosQuery.isError}
          />
        </CardContent>
      </Card>

      {/* Periodo invalido: o erro aparece no proprio filtro e a lista nao e consultada. */}
      {!erroDoPeriodo && (
        <Card>
          <CardContent>
            <ListaHistorico<MovimentacaoDeEstoque>
              id="movimentacoes-estoque"
              titulo="Movimentações"
              nivelDoTitulo={2}
              chave={chaveDasMovimentacoes(filtros)}
              buscar={(pagina) => listarMovimentacoes(filtros, pagina)}
              textos={{
                carregando: 'Carregando movimentações...',
                erroCarga: 'Não foi possível carregar as movimentações.',
                erroMais: 'Não foi possível carregar mais movimentações. Tente de novo.',
                vazioTitulo: 'Nenhuma movimentação neste período.',
                vazioDescricao: 'Entradas, saídas, contagens e vendas aparecem aqui, com data e quem registrou.',
                rotuloLista: 'Movimentações de estoque',
              }}
              acaoDoVazio={
                temFiltroAtivo && (
                  <Button type="button" variant="outline" className="h-11 md:h-9" onClick={limparTudo}>
                    Limpar filtros
                  </Button>
                )
              }
              chaveDoItem={(movimento) => movimento.id}
              renderizarItem={(movimento) => (
                <LinhaDaMovimentacao
                  movimento={movimento}
                  estadoParaProduto={estadoParaProduto}
                  aoAbrirVenda={admin ? (venda, origem) => setVendaAberta({ venda, origem }) : undefined}
                />
              )}
            />
          </CardContent>
        </Card>
      )}

      {vendaAberta && (
        <JanelaDaVenda
          venda={vendaAberta.venda}
          aoFechar={() => setVendaAberta(null)}
          // O botao pode ter sido recriado pela lista: entao procura o da mesma venda.
          focoAoFechar={() =>
            vendaAberta.origem.isConnected
              ? vendaAberta.origem
              : document.querySelector<HTMLElement>(`[data-venda="${CSS.escape(vendaAberta.venda.id)}"]`)
          }
        />
      )}
    </div>
  )
}

/**
 * Um movimento: o produto (abre a pagina dele) e tipo · motivo em destaque;
 * quando, quem, a venda e o fornecedor como apoio; quantidade e saldos a direita.
 */
function LinhaDaMovimentacao({
  movimento,
  estadoParaProduto,
  aoAbrirVenda,
}: {
  movimento: MovimentacaoDeEstoque
  estadoParaProduto: EstadoParaProduto
  /** Abre a venda do movimento (so o ADMIN), com o botao que abriu; sem ele, o numero fica como texto. */
  aoAbrirVenda?: (venda: VendaDoMovimento, origem: HTMLElement) => void
}) {
  const { titulo, quantidade, saldos, saldosFalados, custo, fornecedor } = textoMovimento(
    movimento,
    movimento.produto.unidade.sigla,
  )
  const { venda } = movimento
  const apoio: { chave: string; conteudo: ReactNode }[] = [{ chave: 'usuario', conteudo: movimento.usuarioNome }]
  if (venda) {
    // Espacos nao separaveis: "Venda nº 8" nao quebra no celular.
    const texto = `Venda\u00a0nº\u00a0${venda.numero}`
    apoio.push({
      chave: 'venda',
      conteudo: aoAbrirVenda ? (
        <button
          type="button"
          data-venda={venda.id}
          onClick={(event) => aoAbrirVenda(venda, event.currentTarget)}
          className="rounded-sm font-medium text-primary underline underline-offset-2 outline-none hover:text-primary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          {texto}
        </button>
      ) : (
        texto
      ),
    })
  }
  if (fornecedor) {
    apoio.push({ chave: 'fornecedor', conteudo: fornecedor })
  }
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm">
          <Link
            to={rotaDoProduto(movimento.produto.id)}
            state={estadoParaProduto}
            className="font-medium text-foreground underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            {movimento.produto.nome}
          </Link>
          <span className="text-xs text-muted-foreground tabular-nums">{` · Nº ${movimento.produto.numero}`}</span>
        </p>
        <p className="text-sm">{titulo}</p>
        <p className="text-xs text-muted-foreground">
          <span>{formatarDataHora(movimento.criadoEm)}</span>
          {apoio.map((parte) => (
            <span key={parte.chave}>
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, </span>
              {parte.conteudo}
            </span>
          ))}
        </p>
        {movimento.observacao && <p className="text-sm text-muted-foreground break-words">{movimento.observacao}</p>}
      </div>
      <div className="flex flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5 text-sm tabular-nums">
        <span>
          <span className="font-semibold">{quantidade}</span>
          {custo && <span className="text-muted-foreground">{` · ${custo}`}</span>}
        </span>
        <span className="text-muted-foreground">
          <span aria-hidden="true">{saldos}</span>
          <span className="sr-only">{saldosFalados}</span>
        </span>
      </div>
    </li>
  )
}
