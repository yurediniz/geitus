import { useId } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { CAIXA_QUERY_KEY, CHAVE_DA_CONFIGURACAO_DO_CAIXA } from '@/features/cash-register/caixaQuery'
import { lerErroDoServidor } from '@/features/cash-register/errosDoCaixa'
import { formatarDataHoraCaixa } from '@/features/cash-register/formatacaoCaixa'
import { PontosDeCaixa } from '@/features/settings/PontosDeCaixa'
import type { AvisosDaTela } from '@/hooks/useFeedbackDaTela'
import { buscar, salvar } from '@/services/configuracaoCaixaService'
import type { ConfiguracaoDoCaixa } from '@/types/caixa'

const FRASE_DO_FECHAMENTO_CEGO =
  'Quem fecha o caixa informa o valor contado sem ver o esperado. A diferença aparece depois da contagem.'
const MENSAGEM_FALHA_AO_SALVAR = 'Não foi possível salvar a configuração. Tente de novo.'

/** Secao Caixa das Configuracoes: o modo do fechamento e os pontos de caixa. */
export function SecaoCaixa({ avisos }: { avisos: AvisosDaTela }) {
  const idTitulo = useId()

  return (
    <section aria-labelledby={idTitulo}>
      <Card>
        <CardHeader>
          <h2 id={idTitulo} className="font-display text-lg font-semibold leading-none">
            Caixa
          </h2>
          <p className="text-sm text-muted-foreground">Como o caixa é fechado e quais pontos de caixa a empresa usa.</p>
        </CardHeader>
        <CardContent className="space-y-8">
          <FechamentoCego avisos={avisos} />
          <PontosDeCaixa avisos={avisos} />
        </CardContent>
      </Card>
    </section>
  )
}

/**
 * Interruptor do fechamento cego: salva ao alternar, ja mostrando o novo
 * estado; se a gravacao falhar, volta ao que era e avisa.
 */
function FechamentoCego({ avisos }: { avisos: AvisosDaTela }) {
  const queryClient = useQueryClient()
  const idInterruptor = useId()
  const idRotulo = useId()
  const idFrase = useId()

  const consulta = useQuery({ queryKey: CHAVE_DA_CONFIGURACAO_DO_CAIXA, queryFn: buscar })

  const mutation = useMutation<ConfiguracaoDoCaixa, unknown, boolean, { anterior?: ConfiguracaoDoCaixa }>({
    mutationFn: (fechamentoCego) => salvar({ fechamentoCego }),
    onMutate: async (fechamentoCego) => {
      await queryClient.cancelQueries({ queryKey: CHAVE_DA_CONFIGURACAO_DO_CAIXA })
      const anterior = queryClient.getQueryData<ConfiguracaoDoCaixa>(CHAVE_DA_CONFIGURACAO_DO_CAIXA)
      if (anterior) {
        queryClient.setQueryData<ConfiguracaoDoCaixa>(CHAVE_DA_CONFIGURACAO_DO_CAIXA, { ...anterior, fechamentoCego })
      }
      return { anterior }
    },
    onSuccess: (configuracao) => {
      queryClient.setQueryData(CHAVE_DA_CONFIGURACAO_DO_CAIXA, configuracao)
      avisos.sucesso('Configuração salva')
    },
    onError: (erro, _pedido, contexto) => {
      if (contexto?.anterior) {
        queryClient.setQueryData(CHAVE_DA_CONFIGURACAO_DO_CAIXA, contexto.anterior)
      }
      avisos.erro(lerErroDoServidor(erro, [], MENSAGEM_FALHA_AO_SALVAR).geral ?? MENSAGEM_FALHA_AO_SALVAR)
    },
    // O modo aparece na tela do caixa (sessoes abertas): todo o cache do caixa e recarregado.
    onSettled: () => queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY }),
  })

  if (consulta.isPending) {
    return (
      <div role="status" aria-label="Carregando a configuração do caixa" className="space-y-2">
        <div aria-hidden="true" className="h-5 w-48 animate-pulse rounded bg-muted" />
        <div aria-hidden="true" className="h-4 w-full max-w-md animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (consulta.isError) {
    return (
      <div className="space-y-3">
        <div
          role="alert"
          className="flex max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Não foi possível carregar a configuração do caixa.</span>
        </div>
        <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => consulta.refetch()}>
          Tentar de novo
        </Button>
      </div>
    )
  }

  const configuracao = consulta.data
  const alteracao =
    configuracao.atualizadoPorNome && configuracao.atualizadoEm
      ? `Alterado por ${configuracao.atualizadoPorNome} em ${formatarDataHoraCaixa(configuracao.atualizadoEm)}.`
      : null

  return (
    <div className="flex items-start justify-between gap-6">
      <div className="max-w-xl space-y-1">
        <label id={idRotulo} htmlFor={idInterruptor} className="block text-sm font-medium">
          Fechamento cego
        </label>
        <p id={idFrase} className="text-sm text-muted-foreground">
          {FRASE_DO_FECHAMENTO_CEGO}
        </p>
        {alteracao && (
          <p className="text-xs text-muted-foreground">
            {alteracao}
          </p>
        )}
      </div>
      <Switch
        id={idInterruptor}
        checked={configuracao.fechamentoCego}
        onCheckedChange={(ligado) => mutation.mutate(ligado)}
        disabled={mutation.isPending}
        aria-labelledby={idRotulo}
        aria-describedby={idFrase}
        className="mt-1"
      />
    </div>
  )
}
