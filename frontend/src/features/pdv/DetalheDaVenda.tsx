import { useId, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Ban, Loader2, PackageOpen, Printer } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DialogFooter } from '@/components/ui/dialog'
import { CAIXA_QUERY_KEY } from '@/features/cash-register/caixaQuery'
import { CarregandoCaixa, ErroAoCarregar } from '@/features/cash-register/EstadosDoCaixa'
import { lerErroDoServidor } from '@/features/cash-register/errosDoCaixa'
import { PRODUTOS_QUERY_KEY } from '@/features/catalog/catalogoQuery'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { cabecalhoDaVenda } from '@/features/pdv/formatacaoPdv'
import { chaveDaVenda, PDV_QUERY_KEY } from '@/features/pdv/pdvQuery'
import { ResumoDaVenda } from '@/features/pdv/ResumoDaVenda'
import { ErroDoCampo, MarcaObrigatorio } from '@/features/products/CamposFormulario'
import { HttpError } from '@/services/httpClient'
import { buscarVenda, cancelarVenda } from '@/services/pdvService'
import type { Venda } from '@/types/pdv'

const TAMANHO_MAXIMO_DO_MOTIVO = 200
const MENSAGEM_SEM_MOTIVO = 'Informe o motivo do cancelamento.'
const FALHA_AO_CANCELAR = 'Não foi possível cancelar a venda. Confira a conexão e tente de novo.'
const VENDA_INDISPONIVEL = 'Esta venda não está mais disponível.'

export interface DetalheDaVendaProps {
  vendaId: string
  ehAdmin: boolean
  aoVoltar: () => void
  aoImprimir: (venda: Venda) => void
  aoCancelar: (venda: Venda) => void
  /** Abre "Devolver itens" (so ADMIN, venda concluida com algo a devolver). */
  aoDevolver: (venda: Venda) => void
}

/**
 * O detalhe de uma venda (spec do PDV), dentro de um `Dialog`: itens,
 * pagamentos, cancelamento e devolucoes, com "Imprimir comprovante",
 * "Cancelar venda" (quando o servidor diz `podeCancelar`, com o motivo) e,
 * para o ADMIN, "Devolver itens". Usado pelo F8 do PDV e pela tela Vendas; o
 * foco ao fechar fica com quem abre a janela.
 */
export function DetalheDaVenda({ vendaId, ehAdmin, aoVoltar, aoImprimir, aoCancelar, aoDevolver }: DetalheDaVendaProps) {
  const queryClient = useQueryClient()
  const consulta = useQuery({ queryKey: chaveDaVenda(vendaId), queryFn: () => buscarVenda(vendaId) })
  const [cancelando, setCancelando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erroDoMotivo, setErroDoMotivo] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const idMotivo = useId()

  const cancelamento = useMutation<Venda, unknown, string>({
    mutationFn: (texto) => cancelarVenda(vendaId, texto),
    onSuccess: (venda) => {
      queryClient.setQueryData(chaveDaVenda(vendaId), venda)
      setCancelando(false)
      aoCancelar(venda)
      // O estorno muda o caixa, a lista de vendas e o saldo dos produtos.
      void queryClient.invalidateQueries({ queryKey: [...PDV_QUERY_KEY, 'vendas'] })
      void queryClient.invalidateQueries({ queryKey: [...PDV_QUERY_KEY, 'busca'] })
      void queryClient.invalidateQueries({ queryKey: [...PDV_QUERY_KEY, 'catalogo'] })
      void queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })
      void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
    },
    onError: (falha) => {
      if (falha instanceof HttpError && falha.status === 404) {
        setErro(VENDA_INDISPONIVEL)
        return
      }
      const { porCampo, geral } = lerErroDoServidor(falha, ['motivo'], FALHA_AO_CANCELAR)
      setErroDoMotivo(porCampo.motivo ?? null)
      setErro(geral)
    },
  })

  const confirmar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const texto = motivo.trim()
    if (texto === '') {
      setErroDoMotivo(MENSAGEM_SEM_MOTIVO)
      return
    }
    setErro(null)
    setErroDoMotivo(null)
    cancelamento.mutate(texto)
  }

  if (consulta.isPending) {
    return <CarregandoCaixa rotulo="Carregando a venda" />
  }
  if (consulta.isError) {
    return (
      <ErroAoCarregar mensagem="Não foi possível carregar a venda." aoTentarDeNovo={() => consulta.refetch()}>
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={aoVoltar}>
          Voltar
        </Button>
      </ErroAoCarregar>
    )
  }
  const venda = consulta.data
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={aoVoltar}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Vendas
        </Button>
        <p className="text-sm text-muted-foreground">{cabecalhoDaVenda(venda)}</p>
      </div>

      <ResumoDaVenda venda={venda} />

      {erro && <ErroInline mensagem={erro} />}

      {cancelando ? (
        <form onSubmit={confirmar} noValidate className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor={idMotivo} className="text-sm font-medium">
              Motivo do cancelamento
              <MarcaObrigatorio />
            </label>
            <textarea
              id={idMotivo}
              value={motivo}
              autoFocus
              rows={2}
              maxLength={TAMANHO_MAXIMO_DO_MOTIVO}
              onChange={(event) => {
                setMotivo(event.target.value)
                setErroDoMotivo(null)
              }}
              disabled={cancelamento.isPending}
              aria-invalid={erroDoMotivo ? true : undefined}
              aria-describedby={erroDoMotivo ? `${idMotivo}-erro` : undefined}
              placeholder="Ex.: Cliente desistiu da compra"
              className="w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-base shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive md:text-sm"
            />
            <ErroDoCampo id={`${idMotivo}-erro`} mensagem={erroDoMotivo ?? undefined} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setCancelando(false)}
              disabled={cancelamento.isPending}
            >
              Voltar
            </Button>
            <Button type="submit" variant="destructive" className="min-h-11" disabled={cancelamento.isPending}>
              {cancelamento.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </form>
      ) : (
        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => aoImprimir(venda)}>
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimir comprovante
          </Button>
          {venda.podeCancelar && venda.status === 'CONCLUIDA' && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => setCancelando(true)}>
              <Ban className="h-4 w-4" aria-hidden="true" />
              Cancelar venda
            </Button>
          )}
          {ehAdmin && venda.status === 'CONCLUIDA' && venda.situacaoDevolucao !== 'TOTAL' && (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => aoDevolver(venda)}>
              <PackageOpen className="h-4 w-4" aria-hidden="true" />
              Devolver itens
            </Button>
          )}
        </DialogFooter>
      )}
    </div>
  )
}
