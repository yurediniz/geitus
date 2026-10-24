import { useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, CalendarX, Clock, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { PaginacaoLista } from '@/components/ui/paginacao-lista'
import { chaveDoHistorico, chaveDosPontos } from '@/features/cash-register/caixaQuery'
import { DetalheDaSessao } from '@/features/cash-register/DetalheDaSessao'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import {
  formasComDiferenca,
  formatarDataHoraCaixa,
  formatarReais,
  ROTULO_DA_FORMA,
  ROTULO_DO_STATUS,
} from '@/features/cash-register/formatacaoCaixa'
import { TextoDaDiferenca } from '@/features/cash-register/ResumoDoFechamento'
import { useFiltrosDoHistorico } from '@/features/cash-register/useFiltrosDoHistorico'
import { useAuth } from '@/hooks/useAuth'
import { umDe } from '@/lib/listas'
import { cn } from '@/lib/utils'
import { listarPontos, listarSessoes } from '@/services/caixaService'
import { STATUS_DA_SESSAO, type SessaoDeCaixaResumo } from '@/types/caixa'

const ALTURA_DO_CONTROLE = 'h-11 md:h-9'
const SEM_VALOR = '—'

/**
 * Historico do caixa (/caixa/historico, spec §6.6): as sessoes da mais recente
 * para a mais antiga, com filtros de ponto, situacao e periodo na URL,
 * paginacao no servidor e o detalhe num painel lateral. O OPERADOR ve so as
 * sessoes que abriu (filtrado no backend).
 */
export function HistoricoDoCaixaPage() {
  const { usuario } = useAuth()
  const ehAdmin = usuario?.perfil === 'ADMIN'
  const { filtros, alterar, limpar, temFiltroAtivo } = useFiltrosDoHistorico()
  const [sessaoAberta, setSessaoAberta] = useState<SessaoDeCaixaResumo | null>(null)
  const idTitulo = useId()
  const idPonto = useId()
  const idSituacao = useId()
  const idDe = useId()
  const idAte = useId()
  const tituloRef = useRef<HTMLHeadingElement>(null)

  const periodoInvertido = filtros.de !== '' && filtros.ate !== '' && filtros.de > filtros.ate

  const pontos = useQuery({ queryKey: chaveDosPontos(), queryFn: () => listarPontos() })
  const consulta = useQuery({
    queryKey: chaveDoHistorico(filtros),
    queryFn: ({ signal }) => listarSessoes(filtros, signal),
    placeholderData: keepPreviousData,
    enabled: !periodoInvertido,
  })

  const mudarPagina = (proxima: number) => {
    alterar({ pagina: proxima })
    tituloRef.current?.scrollIntoView?.({ block: 'start' })
    tituloRef.current?.focus({ preventScroll: true })
  }

  const conteudo = () => {
    if (periodoInvertido) {
      return <Vazio mensagem="A data inicial é depois da data final." aoLimpar={limpar} />
    }
    if (consulta.isPending) {
      return <CarregandoCaixa rotulo="Carregando o histórico" linhas={5} />
    }
    if (consulta.isError && !consulta.data) {
      return (
        <ErroAoCarregar
          mensagem="Não foi possível carregar o histórico do caixa."
          aoTentarDeNovo={() => consulta.refetch()}
        />
      )
    }
    const pagina = consulta.data
    if (pagina.itens.length === 0) {
      return temFiltroAtivo ? (
        <Vazio mensagem="Nenhum caixa com esses filtros." aoLimpar={limpar} />
      ) : (
        <Vazio mensagem="Nenhum caixa registrado ainda." />
      )
    }
    return (
      <div
        aria-busy={consulta.isPlaceholderData}
        className={cn('space-y-4 transition-opacity duration-150', consulta.isPlaceholderData && 'opacity-60')}
      >
        <TabelaDoHistorico sessoes={pagina.itens} idTitulo={idTitulo} aoAbrir={setSessaoAberta} />
        <PaginacaoLista
          pagina={filtros.pagina}
          total={pagina.totalItens}
          tamanho={pagina.tamanho}
          aoMudar={mudarPagina}
          className="border-t pt-4"
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Button asChild variant="ghost" className={cn(ALTURA_DO_CONTROLE, '-ml-3')}>
          <Link to="/caixa">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Voltar ao caixa
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Histórico do caixa</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            {ehAdmin
              ? 'Os caixas abertos e fechados da empresa, do mais recente para o mais antigo.'
              : 'Aqui aparecem só os caixas que você abriu.'}
          </p>
        </div>
      </div>

      <Card>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full space-y-1.5 sm:w-48">
              <label htmlFor={idPonto} className="block text-sm font-medium">
                Ponto
              </label>
              <NativeSelect
                id={idPonto}
                value={filtros.pontoId}
                onChange={(event) => alterar({ pontoId: event.target.value })}
                className={ALTURA_DO_CONTROLE}
              >
                <option value="">Todos os pontos</option>
                {(pontos.data ?? []).map((ponto) => (
                  <option key={ponto.id} value={ponto.id}>
                    {ponto.ativo ? ponto.nome : `${ponto.nome} (inativo)`}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="w-full space-y-1.5 sm:w-44">
              <label htmlFor={idSituacao} className="block text-sm font-medium">
                Situação
              </label>
              <NativeSelect
                id={idSituacao}
                value={filtros.status}
                onChange={(event) => alterar({ status: umDe(STATUS_DA_SESSAO, event.target.value) ?? '' })}
                className={ALTURA_DO_CONTROLE}
              >
                <option value="">Todas</option>
                {STATUS_DA_SESSAO.map((status) => (
                  <option key={status} value={status}>
                    {ROTULO_DO_STATUS[status]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="w-[calc(50%-0.375rem)] space-y-1.5 sm:w-40">
              <label htmlFor={idDe} className="block text-sm font-medium">
                De
              </label>
              <Input
                id={idDe}
                type="date"
                value={filtros.de}
                max={filtros.ate || undefined}
                onChange={(event) => alterar({ de: event.target.value })}
                className={ALTURA_DO_CONTROLE}
              />
            </div>
            <div className="w-[calc(50%-0.375rem)] space-y-1.5 sm:w-40">
              <label htmlFor={idAte} className="block text-sm font-medium">
                Até
              </label>
              <Input
                id={idAte}
                type="date"
                value={filtros.ate}
                min={filtros.de || undefined}
                onChange={(event) => alterar({ ate: event.target.value })}
                className={ALTURA_DO_CONTROLE}
              />
            </div>
            {temFiltroAtivo && (
              <Button type="button" variant="ghost" className={ALTURA_DO_CONTROLE} onClick={limpar}>
                <X className="h-4 w-4" aria-hidden="true" />
                Limpar filtros
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2
            id={idTitulo}
            ref={tituloRef}
            tabIndex={-1}
            className="scroll-mt-4 font-display font-semibold leading-none outline-none"
          >
            Sessões de caixa
          </h2>
        </CardHeader>
        <CardContent>{conteudo()}</CardContent>
      </Card>

      <DetalheDaSessao sessao={sessaoAberta} aoFechar={() => setSessaoAberta(null)} />
    </div>
  )
}

function Vazio({ mensagem, aoLimpar }: { mensagem: string; aoLimpar?: () => void }) {
  const idMensagem = useId()
  return (
    <section
      aria-labelledby={idMensagem}
      className="flex max-w-xl flex-col items-start gap-3 rounded-md bg-muted/50 p-4 sm:flex-row"
    >
      <CalendarX className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="space-y-3">
        <p id={idMensagem} className="text-sm font-medium">
          {mensagem}
        </p>
        {aoLimpar && (
          <Button type="button" variant="outline" className={ALTURA_DO_CONTROLE} onClick={aoLimpar}>
            Limpar filtros
          </Button>
        )}
      </div>
    </section>
  )
}

/**
 * Uma linha da coluna "Abertura / fechamento": "Abriu: Ana Souza 24/10/2026 às 08:02".
 * O nome pode quebrar; a data fica inteira (sem quebra no meio).
 */
function QuemEQuando({ acao, nome, quando }: { acao: 'Abriu' | 'Fechou'; nome: string; quando: string }) {
  return (
    <p className="leading-snug">
      <span className="text-muted-foreground">{`${acao}: `}</span>
      <span>{nome}</span>{' '}
      <span className="whitespace-nowrap text-xs text-muted-foreground">{formatarDataHoraCaixa(quando)}</span>
    </p>
  )
}

function SeloDaSituacao({ status }: { status: SessaoDeCaixaResumo['status'] }) {
  const emConferencia = status === 'EM_CONFERENCIA'
  const Icone = emConferencia ? AlertTriangle : Clock
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
        emConferencia ? 'bg-warning-soft text-warning-soft-foreground' : 'bg-info-soft text-info-soft-foreground',
      )}
    >
      <Icone className="h-3.5 w-3.5" aria-hidden="true" />
      {ROTULO_DO_STATUS[status]}
    </span>
  )
}

function TabelaDoHistorico({
  sessoes,
  idTitulo,
  aoAbrir,
}: {
  sessoes: SessaoDeCaixaResumo[]
  idTitulo: string
  aoAbrir: (sessao: SessaoDeCaixaResumo) => void
}) {
  return (
    // Abertura e fechamento numa coluna so: em 1024 px (sidebar aberta) todas as colunas cabem,
    // com a Diferenca inteira. Abaixo de 36rem a tabela rola na horizontal.
    <div className="overflow-x-auto">
      <table aria-labelledby={idTitulo} className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="text-left text-xs font-medium text-muted-foreground">
            <th scope="col" className="py-2 pr-3 font-medium">
              Ponto
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Abertura / fechamento
            </th>
            <th scope="col" className="whitespace-nowrap py-2 pr-3 text-right font-medium">
              Esperado
            </th>
            <th scope="col" className="whitespace-nowrap py-2 pr-3 text-right font-medium">
              Contado
            </th>
            <th scope="col" className="whitespace-nowrap py-2 text-right font-medium">
              Diferença
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sessoes.map((sessao) => (
            <tr
              key={sessao.id}
              // A linha inteira abre o detalhe com o mouse; o botao no nome e o alvo do teclado e do leitor de tela.
              onClick={() => aoAbrir(sessao)}
              className="cursor-pointer align-top transition-colors hover:bg-muted/50"
            >
              <td className="py-2.5 pr-3">
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    aoAbrir(sessao)
                  }}
                  className="min-h-11 rounded-sm text-left font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 md:min-h-0"
                >
                  {sessao.ponto.nome}
                  <span className="sr-only">{`, aberto em ${formatarDataHoraCaixa(sessao.abertaEm)}`}</span>
                </button>
              </td>
              <td className="space-y-1 py-2.5 pr-3">
                <QuemEQuando acao="Abriu" nome={sessao.abertaPorNome} quando={sessao.abertaEm} />
                {sessao.status === 'FECHADA' && sessao.fechadaPorNome && sessao.fechadaEm ? (
                  <QuemEQuando acao="Fechou" nome={sessao.fechadaPorNome} quando={sessao.fechadaEm} />
                ) : (
                  <SeloDaSituacao status={sessao.status} />
                )}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                {sessao.valorEsperado === null ? SEM_VALOR : formatarReais(sessao.valorEsperado)}
              </td>
              <td className="whitespace-nowrap py-2.5 pr-3 text-right tabular-nums">
                {sessao.valorContado === null ? SEM_VALOR : formatarReais(sessao.valorContado)}
              </td>
              <td className="whitespace-nowrap py-2.5 text-right">
                {sessao.diferenca === null ? (
                  <span className="text-muted-foreground">{SEM_VALOR}</span>
                ) : (
                  <TextoDaDiferenca valor={sessao.diferenca} className="justify-end whitespace-nowrap" />
                )}
                {/* As colunas sao do dinheiro; diferenca em outra forma aparece logo abaixo. */}
                {formasComDiferenca(sessao.porForma).map((forma) => (
                  <p key={forma} className="mt-1 text-xs">
                    <span className="text-muted-foreground">{`${ROTULO_DA_FORMA[forma]}: `}</span>
                    <TextoDaDiferenca
                      valor={sessao.porForma.find((valores) => valores.forma === forma)?.diferenca ?? 0}
                      className="whitespace-nowrap"
                    />
                  </p>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
