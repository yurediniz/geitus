import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ClipboardCheck, MonitorSmartphone, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CAIXA_QUERY_KEY, CHAVE_DA_SESSAO_ATUAL } from '@/features/cash-register/caixaQuery'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import { PontosParaAbrir } from '@/features/cash-register/PontosParaAbrir'
import { FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { chaveDoCarrinho, lerCarrinhoGuardado } from '@/features/pdv/carrinho'
import { CHAVE_DA_CONFIGURACAO_DO_PDV } from '@/features/pdv/pdvQuery'
import { TelaDeVenda } from '@/features/pdv/TelaDeVenda'
import { MENSAGEM_OUTRA_ABA, useAbaDoPdv } from '@/features/pdv/useAbaDoPdv'
import { useAuth } from '@/hooks/useAuth'
import { useFeedbackDaTela } from '@/hooks/useFeedbackDaTela'
import { sessaoAtual } from '@/services/caixaService'
import { buscar as buscarConfiguracao } from '@/services/configuracaoPdvService'
import type { SessaoDeCaixa } from '@/types/caixa'

/** Se ha uma venda em andamento guardada neste navegador para a empresa e o usuario. */
function temVendaGuardada(empresaId: number, usuarioId: number): boolean {
  try {
    const texto = localStorage.getItem(chaveDoCarrinho(empresaId, usuarioId))
    return lerCarrinhoGuardado(texto, empresaId, usuarioId).linhas.length > 0
  } catch {
    return false
  }
}

/**
 * Tela do PDV (/pdv, spec `docs/modules/pdv.md` §6.2). Sem caixa aberto,
 * pede para abrir (a mesma janela do Caixa); em conferencia, leva ao Caixa;
 * com o caixa aberto, a venda. O carrinho fica no navegador e sobrevive a
 * troca de estado do caixa.
 */
export function PdvPage() {
  const { usuario } = useAuth()
  const queryClient = useQueryClient()
  const { sucesso, erro, avisos } = useFeedbackDaTela()
  const atual = useQuery({ queryKey: CHAVE_DA_SESSAO_ATUAL, queryFn: sessaoAtual })
  const configuracao = useQuery({ queryKey: CHAVE_DA_CONFIGURACAO_DO_PDV, queryFn: buscarConfiguracao })
  // Uma aba so por usuario: a outra aba nunca monta a venda (nem grava o carrinho).
  const aba = useAbaDoPdv(usuario?.empresa.id ?? 0, usuario?.id ?? 0)

  const aoAbrir = (sessao: SessaoDeCaixa) => {
    queryClient.setQueryData(CHAVE_DA_SESSAO_ATUAL, sessao)
    avisos.sucesso('Caixa aberto')
    void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
  }

  const conteudo = () => {
    if (!usuario || atual.data === undefined) {
      return atual.isError ? (
        <ErroAoCarregar mensagem="Não foi possível carregar o caixa." aoTentarDeNovo={() => atual.refetch()} />
      ) : (
        <CarregandoCaixa rotulo="Carregando o PDV" />
      )
    }
    if (atual.data === null) {
      return (
        <section aria-labelledby="pdv-sem-caixa" className="max-w-3xl space-y-4">
          <div className="flex items-start gap-3">
            <Wallet className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div>
              <h2 id="pdv-sem-caixa" className="font-display text-xl font-semibold">
                Abra o caixa para vender.
              </h2>
              {temVendaGuardada(usuario.empresa.id, usuario.id) && (
                <p className="text-sm text-muted-foreground">A venda em andamento continua guardada neste navegador.</p>
              )}
            </div>
          </div>
          <PontosParaAbrir
            ehAdmin={usuario.perfil === 'ADMIN'}
            aoAbrir={aoAbrir}
            aoFalharAoAbrir={(mensagem) => {
              avisos.erro(mensagem)
              void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
            }}
          />
        </section>
      )
    }
    if (atual.data.status !== 'ABERTA') {
      return (
        <section aria-labelledby="pdv-em-conferencia" className="flex max-w-xl items-start gap-3 rounded-md bg-warning-soft p-4">
          <ClipboardCheck className="mt-1 h-5 w-5 shrink-0 text-warning-soft-foreground" aria-hidden="true" />
          <div className="space-y-3">
            <div>
              <h2 id="pdv-em-conferencia" className="font-display text-xl font-semibold">
                Termine o fechamento do caixa.
              </h2>
              <p className="text-sm text-muted-foreground">A contagem foi registrada e falta a justificativa.</p>
            </div>
            <Button asChild className="h-11">
              <Link to="/caixa">Ir para o Caixa</Link>
            </Button>
          </div>
        </section>
      )
    }
    if (aba.situacao === 'VERIFICANDO') {
      return <CarregandoCaixa rotulo="Abrindo o PDV" />
    }
    if (aba.situacao === 'EM_OUTRA_ABA') {
      return (
        <section aria-labelledby="pdv-outra-aba" className="flex max-w-xl items-start gap-3 rounded-md bg-muted/60 p-4">
          <MonitorSmartphone className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-3">
            <div>
              <h2 id="pdv-outra-aba" className="font-display text-xl font-semibold">
                {MENSAGEM_OUTRA_ABA}
              </h2>
              <p className="text-sm text-muted-foreground">Para vender aqui, feche a outra aba e toque em "Usar aqui".</p>
            </div>
            <Button type="button" className="h-11" onClick={aba.usarAqui}>
              Usar aqui
            </Button>
            {aba.aviso && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {aba.aviso}
              </p>
            )}
          </div>
        </section>
      )
    }
    return (
      <TelaDeVenda
        key={`${usuario.empresa.id}.${usuario.id}`}
        sessao={atual.data}
        usuario={usuario}
        configuracao={configuracao.data}
        avisos={avisos}
      />
    )
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">PDV</h1>
      <FeedbackCatalogo sucesso={sucesso} erro={erro} />
      {conteudo()}
    </div>
  )
}
