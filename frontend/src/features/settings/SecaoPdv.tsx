import { useId, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { lerErroDoServidor } from '@/features/cash-register/errosDoCaixa'
import { formatarDataHoraCaixa } from '@/features/cash-register/formatacaoCaixa'
import { CHAVE_DA_CONFIGURACAO_DO_PDV } from '@/features/pdv/pdvQuery'
import { ErroDoCampo } from '@/features/products/CamposFormulario'
import type { AvisosDaTela } from '@/hooks/useFeedbackDaTela'
import { formatarPercentual, lerPercentual } from '@/lib/percentual'
import { buscar, salvar } from '@/services/configuracaoPdvService'
import type { ConfiguracaoDoPdv, ConfiguracaoDoPdvRequest } from '@/types/pdv'

const FRASE_DO_ESTOQUE = 'Quando ligado, a venda passa mesmo sem saldo e o estoque fica negativo até o ajuste.'
const FRASE_DO_DESCONTO =
  'Acima disso, só administradores dão desconto. Nenhum desconto passa do preço mínimo do produto.'
const MENSAGEM_FALHA_AO_SALVAR = 'Não foi possível salvar a configuração. Tente de novo.'
const MENSAGEM_PERCENTUAL_INVALIDO = 'Informe um percentual de 0 a 100, com até 2 casas.'

/** Secao PDV das Configuracoes (spec do PDV): vender sem estoque e o desconto maximo do operador. */
export function SecaoPdv({ avisos }: { avisos: AvisosDaTela }) {
  const idTitulo = useId()
  const consulta = useQuery({ queryKey: CHAVE_DA_CONFIGURACAO_DO_PDV, queryFn: buscar })

  const conteudo = () => {
    if (consulta.isPending) {
      return (
        <div role="status" aria-label="Carregando a configuração do PDV" className="space-y-2">
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
            <span>Não foi possível carregar a configuração do PDV.</span>
          </div>
          <Button type="button" variant="outline" className="h-11 md:h-9" onClick={() => consulta.refetch()}>
            Tentar de novo
          </Button>
        </div>
      )
    }
    return <OpcoesDoPdv configuracao={consulta.data} avisos={avisos} />
  }

  return (
    <section aria-labelledby={idTitulo}>
      <Card>
        <CardHeader>
          <h2 id={idTitulo} className="font-display text-lg font-semibold leading-none">
            PDV
          </h2>
          <p className="text-sm text-muted-foreground">O que o PDV permite na hora da venda.</p>
        </CardHeader>
        <CardContent>{conteudo()}</CardContent>
      </Card>
    </section>
  )
}

interface Gravacao {
  dados: ConfiguracaoDoPdvRequest
  /** O aviso de sucesso, a partir da configuracao gravada. */
  mensagem: (salva: ConfiguracaoDoPdv) => string
}

/**
 * As duas opcoes. Cada uma salva sozinha (a outra vai com o valor atual), ja
 * mostrando o novo estado; se a gravacao falhar, volta ao que era e avisa.
 */
function OpcoesDoPdv({ configuracao, avisos }: { configuracao: ConfiguracaoDoPdv; avisos: AvisosDaTela }) {
  const queryClient = useQueryClient()
  const idInterruptor = useId()
  const idRotulo = useId()
  const idFraseDoEstoque = useId()
  const idCampo = useId()
  const idFraseDoDesconto = useId()
  const [texto, setTexto] = useState(() => formatarPercentual(configuracao.descontoMaximoOperador))
  const [erroDoCampo, setErroDoCampo] = useState<string | null>(null)

  const mutation = useMutation<ConfiguracaoDoPdv, unknown, Gravacao, { anterior?: ConfiguracaoDoPdv }>({
    mutationFn: ({ dados }) => salvar(dados),
    onMutate: async ({ dados }) => {
      await queryClient.cancelQueries({ queryKey: CHAVE_DA_CONFIGURACAO_DO_PDV })
      const anterior = queryClient.getQueryData<ConfiguracaoDoPdv>(CHAVE_DA_CONFIGURACAO_DO_PDV)
      if (anterior) {
        queryClient.setQueryData<ConfiguracaoDoPdv>(CHAVE_DA_CONFIGURACAO_DO_PDV, { ...anterior, ...dados })
      }
      return { anterior }
    },
    onSuccess: (salva, { mensagem }) => {
      queryClient.setQueryData(CHAVE_DA_CONFIGURACAO_DO_PDV, salva)
      setTexto(formatarPercentual(salva.descontoMaximoOperador))
      avisos.sucesso(mensagem(salva))
    },
    onError: (erro, _pedido, contexto) => {
      if (contexto?.anterior) {
        queryClient.setQueryData(CHAVE_DA_CONFIGURACAO_DO_PDV, contexto.anterior)
        setTexto(formatarPercentual(contexto.anterior.descontoMaximoOperador))
      }
      avisos.erro(lerErroDoServidor(erro, [], MENSAGEM_FALHA_AO_SALVAR).geral ?? MENSAGEM_FALHA_AO_SALVAR)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: CHAVE_DA_CONFIGURACAO_DO_PDV }),
  })

  const salvarPercentual = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const valor = lerPercentual(texto)
    if (valor === null) {
      setErroDoCampo(MENSAGEM_PERCENTUAL_INVALIDO)
      return
    }
    setErroDoCampo(null)
    mutation.mutate({
      dados: { venderSemEstoque: configuracao.venderSemEstoque, descontoMaximoOperador: valor },
      mensagem: (salva) => `Desconto máximo do operador: ${formatarPercentual(salva.descontoMaximoOperador)}%`,
    })
  }

  const alteracao =
    configuracao.atualizadoPorNome && configuracao.atualizadoEm
      ? `Alterado por ${configuracao.atualizadoPorNome} em ${formatarDataHoraCaixa(configuracao.atualizadoEm)}.`
      : null
  const descricaoDoCampo = [idFraseDoDesconto, erroDoCampo && `${idCampo}-erro`].filter(Boolean).join(' ')

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-6">
        <div className="max-w-xl space-y-1">
          <label id={idRotulo} htmlFor={idInterruptor} className="block text-sm font-medium">
            Vender sem estoque
          </label>
          <p id={idFraseDoEstoque} className="text-sm text-muted-foreground">
            {FRASE_DO_ESTOQUE}
          </p>
        </div>
        <Switch
          id={idInterruptor}
          checked={configuracao.venderSemEstoque}
          onCheckedChange={(ligado) =>
            mutation.mutate({
              dados: { venderSemEstoque: ligado, descontoMaximoOperador: configuracao.descontoMaximoOperador },
              mensagem: (salva) => (salva.venderSemEstoque ? 'Vender sem estoque ligado' : 'Vender sem estoque desligado'),
            })
          }
          disabled={mutation.isPending}
          aria-labelledby={idRotulo}
          aria-describedby={idFraseDoEstoque}
          className="mt-1"
        />
      </div>

      <form onSubmit={salvarPercentual} noValidate className="max-w-xl space-y-1.5">
        <label htmlFor={idCampo} className="block text-sm font-medium">
          Desconto máximo do operador (%)
        </label>
        <p id={idFraseDoDesconto} className="text-sm text-muted-foreground">
          {FRASE_DO_DESCONTO}
        </p>
        <div className="flex items-start gap-2 pt-1">
          <Input
            id={idCampo}
            value={texto}
            inputMode="decimal"
            autoComplete="off"
            onChange={(event) => {
              setTexto(event.target.value)
              setErroDoCampo(null)
            }}
            disabled={mutation.isPending}
            aria-invalid={erroDoCampo ? true : undefined}
            aria-describedby={descricaoDoCampo}
            className="h-11 w-28 text-base tabular-nums md:h-9 md:text-sm"
          />
          <Button type="submit" variant="outline" className="h-11 md:h-9" disabled={mutation.isPending}>
            Salvar
          </Button>
        </div>
        <ErroDoCampo id={`${idCampo}-erro`} mensagem={erroDoCampo ?? undefined} />
      </form>

      {alteracao && <p className="text-xs text-muted-foreground">{alteracao}</p>}
    </div>
  )
}
