import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { textoMovimento } from '@/features/products/estoque/ajusteEstoque'
import { formatarDataHora } from '@/features/products/formatacaoProduto'
import { ListaHistorico } from '@/features/products/secoes/ListaHistorico'
import { rotaDoProduto, type EstadoParaProduto } from '@/features/products/navegacaoProdutos'
import { chaveDasMovimentacoes } from '@/features/stock/estoqueQuery'
import { FiltrosDasMovimentacoes } from '@/features/stock/FiltrosDasMovimentacoes'
import { useFiltrosDasMovimentacoes } from '@/features/stock/useFiltrosDasMovimentacoes'
import { listarMovimentacoes } from '@/services/estoqueService'
import { listarUsuarios } from '@/services/usuarioService'
import type { MovimentacaoDeEstoque } from '@/types/estoque'
import type { Usuario } from '@/types/usuario'

/** Lista de usuarios do filtro (prefixo `usuarios`: a gestao de usuarios invalida). */
const USUARIOS_DO_FILTRO_QUERY_KEY = ['usuarios', 'filtro-das-movimentacoes'] as const

/**
 * Aba Movimentacoes da area Estoque (spec de Estoque, regras 26 e 27): os
 * movimentos de todos os produtos, do mais recente para o mais antigo, com
 * periodo, tipo, motivo e (so ADMIN) usuario na URL e "Carregar mais".
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
            aoLimpar={limpar}
            temFiltroAtivo={temFiltroAtivo}
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
                  <Button type="button" variant="outline" className="h-11 md:h-9" onClick={limpar}>
                    Limpar filtros
                  </Button>
                )
              }
              chaveDoItem={(movimento) => movimento.id}
              renderizarItem={(movimento) => (
                <LinhaDaMovimentacao movimento={movimento} estadoParaProduto={estadoParaProduto} />
              )}
            />
          </CardContent>
        </Card>
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
}: {
  movimento: MovimentacaoDeEstoque
  estadoParaProduto: EstadoParaProduto
}) {
  const { titulo, quantidade, saldos, saldosFalados, custo, fornecedor } = textoMovimento(
    movimento,
    movimento.produto.unidade.sigla,
  )
  const apoio = [
    movimento.usuarioNome,
    // Espacos nao separaveis: "Venda nº 8" nao quebra no celular.
    movimento.venda && `Venda\u00a0nº\u00a0${movimento.venda.numero}`,
    fornecedor,
  ].filter((parte): parte is string => Boolean(parte))
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
            <span key={parte}>
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, </span>
              {parte}
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
