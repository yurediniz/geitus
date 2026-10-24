import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CampoMoeda } from '@/components/ui/campo-moeda'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { CAIXA_QUERY_KEY } from '@/features/cash-register/caixaQuery'
import {
  ehFalhaSemResposta,
  lerErroDoServidor,
  verificarMudancaDeEstado,
  type MudancaDeEstado,
} from '@/features/cash-register/errosDoCaixa'
import { manterFocoMovidoPelaTela } from '@/features/cash-register/focoDoCaixa'
import { formatarReais } from '@/features/cash-register/formatacaoCaixa'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { ErroDoCampo, MarcaObrigatorio } from '@/features/products/CamposFormulario'
import { gerarUuid } from '@/lib/uuid'
import { lancar } from '@/services/caixaService'
import { HttpError } from '@/services/httpClient'
import type { MovimentoDeCaixaRequest, SessaoDeCaixa, TipoDeLancamento } from '@/types/caixa'

export interface JanelaMovimentoProps {
  sessao: SessaoDeCaixa
  /** Sangria ou suprimento; null com a janela fechada. */
  tipo: TipoDeLancamento | null
  aoFechar: () => void
  /** Lancamento gravado (201, ou 200 com a chave repetida). */
  aoConcluir: (lancamento: MovimentoDeCaixaRequest, sessao: SessaoDeCaixa) => void
  /** A sessao mudou em outro lugar (fechada, em conferencia, fora da vista): quem abriu fecha a janela e avisa. */
  aoMudarDeEstado: (mudanca: MudancaDeEstado) => void
}

type CampoMovimento = 'valor' | 'motivo'
const CAMPOS: readonly CampoMovimento[] = ['valor', 'motivo']
const TAMANHO_MAXIMO_DO_MOTIVO = 200

const TEXTOS: Readonly<
  Record<TipoDeLancamento, { titulo: string; descricao: string; exemplo: string; confirmar: string; falha: string }>
> = {
  SANGRIA: {
    titulo: 'Sangria',
    descricao: 'Retirada de dinheiro da gaveta do',
    exemplo: 'Ex.: Depósito no cofre',
    confirmar: 'Registrar sangria',
    falha: 'Não foi possível registrar a sangria. Confira a conexão e tente de novo.',
  },
  SUPRIMENTO: {
    titulo: 'Suprimento',
    descricao: 'Dinheiro colocado na gaveta do',
    exemplo: 'Ex.: Reforço de troco',
    confirmar: 'Registrar suprimento',
    falha: 'Não foi possível registrar o suprimento. Confira a conexão e tente de novo.',
  },
}

/**
 * Janela pequena de sangria e suprimento (spec §6.3): Valor (foco inicial) e
 * Motivo; Enter confirma e o botao fica desabilitado durante o envio. A chave
 * e gerada a cada abertura e reaproveitada na nova tentativa.
 */
export function JanelaMovimento({ tipo, aoFechar, ...props }: JanelaMovimentoProps) {
  return (
    <Dialog
      open={tipo !== null}
      onOpenChange={(abrir) => {
        if (!abrir) {
          aoFechar()
        }
      }}
    >
      {tipo && <ConteudoMovimento key={tipo} tipo={tipo} aoFechar={aoFechar} {...props} />}
    </Dialog>
  )
}

function ConteudoMovimento({
  sessao,
  tipo,
  aoFechar,
  aoConcluir,
  aoMudarDeEstado,
}: Omit<JanelaMovimentoProps, 'tipo'> & { tipo: TipoDeLancamento }) {
  const queryClient = useQueryClient()
  const textos = TEXTOS[tipo]
  const [chave, setChave] = useState(gerarUuid)
  const [valor, setValor] = useState('')
  const [motivo, setMotivo] = useState('')
  const [erros, setErros] = useState<Partial<Record<CampoMovimento, string>>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [focoPendente, setFocoPendente] = useState<CampoMovimento | null>(null)
  const valorRef = useRef<HTMLInputElement>(null)
  const motivoRef = useRef<HTMLInputElement>(null)
  const enviandoRef = useRef(false)
  const idValor = `movimento-${tipo}-valor`
  const idMotivo = `movimento-${tipo}-motivo`
  const idGaveta = `movimento-${tipo}-gaveta`

  const mutation = useMutation<SessaoDeCaixa, unknown, MovimentoDeCaixaRequest>({
    mutationFn: (dados) => lancar(sessao.id, dados),
    onSuccess: (atualizada, dados) => aoConcluir(dados, atualizada),
    onError: async (erro) => {
      if (!ehFalhaSemResposta(erro)) {
        // 409/404: decide pela situacao real da sessao, relida do servidor.
        const mudanca = await verificarMudancaDeEstado(erro, sessao.id)
        if (mudanca) {
          // Quem abriu a janela avisa e recarrega a sessao.
          aoMudarDeEstado(mudanca)
          return
        }
        // A sessao continua aberta: o esperado pode ter mudado.
        void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
      }
      if (erro instanceof HttpError && erro.status === 409) {
        // A chave pode ja ter gravado outra operacao ("registrada com outros dados"): a proxima e nova.
        setChave(gerarUuid())
      }
      // Falha de rede: a mesma chave vai na nova tentativa (o backend nao grava duas vezes).
      const { porCampo, geral } = lerErroDoServidor(erro, CAMPOS, textos.falha)
      setErros(porCampo)
      setErroGeral(geral)
      setFocoPendente(CAMPOS.find((campo) => porCampo[campo]) ?? null)
    },
    onSettled: () => {
      enviandoRef.current = false
    },
  })
  const enviando = mutation.isPending

  useEffect(() => {
    if (focoPendente === null || enviando) {
      return
    }
    const alvo = focoPendente === 'valor' ? valorRef : motivoRef
    alvo.current?.focus()
    setFocoPendente(null)
  }, [focoPendente, enviando])

  const confirmar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (enviandoRef.current || enviando) {
      return
    }
    const aparado = motivo.trim()
    const novos: Partial<Record<CampoMovimento, string>> = {}
    if (valor === '' || Number(valor) <= 0) {
      novos.valor = 'Informe um valor maior que zero.'
    }
    if (aparado === '') {
      novos.motivo = 'Informe o motivo.'
    }
    if (Object.keys(novos).length > 0) {
      setErros(novos)
      setFocoPendente(CAMPOS.find((campo) => novos[campo]) ?? null)
      return
    }
    enviandoRef.current = true
    setErros({})
    setErroGeral(null)
    mutation.mutate({ tipo, valor: Number(valor), motivo: aparado, chave })
  }

  const naGaveta = tipo === 'SANGRIA' && sessao.dinheiroNaGaveta !== null ? sessao.dinheiroNaGaveta : null
  const descricaoValor =
    [naGaveta !== null && idGaveta, erros.valor && `${idValor}-erro`].filter(Boolean).join(' ') || undefined

  return (
    <DialogContent
      className="max-w-md"
      showCloseButton={!enviando}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        valorRef.current?.focus()
      }}
      onCloseAutoFocus={manterFocoMovidoPelaTela}
      onEscapeKeyDown={(event) => enviandoRef.current && event.preventDefault()}
      onInteractOutside={(event) => enviandoRef.current && event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{textos.titulo}</DialogTitle>
        <DialogDescription>{`${textos.descricao} ${sessao.ponto.nome}.`}</DialogDescription>
      </DialogHeader>

      <form onSubmit={confirmar} noValidate className="space-y-4">
        {erroGeral && <ErroInline mensagem={erroGeral} />}

        <div className="space-y-1.5">
          <label htmlFor={idValor} className="text-sm font-medium">
            Valor
            <MarcaObrigatorio />
          </label>
          <CampoMoeda
            ref={valorRef}
            id={idValor}
            value={valor}
            onChange={(novo) => {
              setValor(novo)
              setErros(({ valor: _valor, ...demais }) => demais)
            }}
            disabled={enviando}
            aria-invalid={erros.valor ? true : undefined}
            aria-describedby={descricaoValor}
            className="h-11 text-base"
          />
          {naGaveta !== null && (
            <p id={idGaveta} className="text-xs text-muted-foreground tabular-nums">
              {`Na gaveta: ${formatarReais(naGaveta)}`}
            </p>
          )}
          <ErroDoCampo id={`${idValor}-erro`} mensagem={erros.valor} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={idMotivo} className="text-sm font-medium">
            Motivo
            <MarcaObrigatorio />
          </label>
          <Input
            ref={motivoRef}
            id={idMotivo}
            value={motivo}
            onChange={(event) => {
              setMotivo(event.target.value)
              setErros(({ motivo: _motivo, ...demais }) => demais)
            }}
            placeholder={textos.exemplo}
            maxLength={TAMANHO_MAXIMO_DO_MOTIVO}
            autoComplete="off"
            disabled={enviando}
            aria-invalid={erros.motivo ? true : undefined}
            aria-describedby={erros.motivo ? `${idMotivo}-erro` : undefined}
            className="h-11"
          />
          <ErroDoCampo id={`${idMotivo}-erro`} mensagem={erros.motivo} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" className="min-h-11" disabled={enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {textos.confirmar}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
