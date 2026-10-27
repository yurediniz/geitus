import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CampoMoeda } from '@/components/ui/campo-moeda'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CAIXA_QUERY_KEY } from '@/features/cash-register/caixaQuery'
import { ehFalhaSemResposta, lerErroDoServidor } from '@/features/cash-register/errosDoCaixa'
import { manterFocoMovidoPelaTela } from '@/features/cash-register/focoDoCaixa'
import { ErroDoCampo, MarcaObrigatorio } from '@/features/products/CamposFormulario'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { gerarUuid } from '@/lib/uuid'
import { abrir } from '@/services/caixaService'
import { HttpError } from '@/services/httpClient'
import type { AbrirCaixaRequest, PontoDeCaixa, SessaoDeCaixa } from '@/types/caixa'

export interface JanelaAbrirCaixaProps {
  /** O ponto a abrir; null com a janela fechada. */
  ponto: PontoDeCaixa | null
  aoFechar: () => void
  /** Caixa aberto (201, ou 200 com a chave repetida). */
  aoConcluir: (sessao: SessaoDeCaixa) => void
  /**
   * 409 ou 404: o ponto ou o caixa do usuario mudou em outro lugar (inativado, ocupado,
   * caixa ja aberto em outra aba). A tela recarrega e pode trocar (ex.: lista sem ponto
   * ativo, ou o caixa aberto): quem abriu fecha a janela e leva a mensagem para o aviso do topo.
   */
  aoMudarOPonto: (mensagem: string) => void
}

const ID_CAMPO = 'abrir-caixa-fundo'
const ID_AJUDA = 'abrir-caixa-fundo-ajuda'
const ID_ERRO = 'abrir-caixa-fundo-erro'
const MENSAGEM_FALHA = 'Não foi possível abrir o caixa. Confira a conexão e tente de novo.'
const MENSAGEM_PONTO_REMOVIDO = 'Este ponto de caixa não existe mais. A lista foi atualizada.'

/**
 * Janela "Abrir caixa" (spec do Caixa): o fundo de troco, sugerido pela abertura
 * anterior do ponto, com o foco no campo; Enter confirma. O conteudo monta a
 * cada abertura, e com ele a chave de idempotencia: a nova tentativa depois de
 * uma falha de rede reenvia a mesma chave e o backend nao abre duas vezes.
 */
export function JanelaAbrirCaixa({ ponto, aoFechar, ...props }: JanelaAbrirCaixaProps) {
  return (
    <Dialog
      open={ponto !== null}
      onOpenChange={(abrirJanela) => {
        if (!abrirJanela) {
          aoFechar()
        }
      }}
    >
      {ponto && <ConteudoAbrirCaixa key={ponto.id} ponto={ponto} aoFechar={aoFechar} {...props} />}
    </Dialog>
  )
}

function ConteudoAbrirCaixa({
  ponto,
  aoFechar,
  aoConcluir,
  aoMudarOPonto,
}: JanelaAbrirCaixaProps & { ponto: PontoDeCaixa }) {
  const queryClient = useQueryClient()
  // Gerada ao abrir a janela; a nova tentativa depois de uma falha de rede reenvia a mesma.
  const [chave] = useState(gerarUuid)
  const [fundo, setFundo] = useState(() => (ponto.ultimoFundoTroco === null ? '' : ponto.ultimoFundoTroco.toFixed(2)))
  const [erroDoCampo, setErroDoCampo] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const campoRef = useRef<HTMLInputElement>(null)
  /** Guarda sincrona contra envio duplo (Enter repetido antes do novo render). */
  const enviandoRef = useRef(false)

  const mutation = useMutation<SessaoDeCaixa, unknown, AbrirCaixaRequest>({
    mutationFn: (dados) => abrir(dados),
    onSuccess: (sessao) => aoConcluir(sessao),
    onError: (erro) => {
      // O ponto pode ter sido ocupado ou inativado. Numa falha de rede a tela fica como esta
      // (a nova tentativa reenvia a mesma chave).
      if (!ehFalhaSemResposta(erro)) {
        void queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })
      }
      if (erro instanceof HttpError && erro.status === 404) {
        aoMudarOPonto(MENSAGEM_PONTO_REMOVIDO)
        return
      }
      if (erro instanceof HttpError && erro.status === 409) {
        // A janela fecha (uma nova abertura gera outra chave) e a mensagem vai para o topo,
        // porque a tela recarregada pode nao ter mais esta janela.
        aoMudarOPonto(lerErroDoServidor(erro, [], MENSAGEM_FALHA).geral ?? MENSAGEM_FALHA)
        return
      }
      const { porCampo, geral } = lerErroDoServidor(erro, ['fundoTroco'], MENSAGEM_FALHA)
      setErroDoCampo(porCampo.fundoTroco ?? null)
      setErroGeral(geral)
    },
    onSettled: () => {
      enviandoRef.current = false
    },
  })
  const enviando = mutation.isPending

  // Com erro no campo, o foco volta a ele depois do envio (quando deixa de estar desabilitado).
  useEffect(() => {
    if (erroDoCampo && !enviando) {
      campoRef.current?.focus()
    }
  }, [erroDoCampo, enviando])

  const confirmar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (enviandoRef.current || enviando) {
      return
    }
    if (fundo === '') {
      setErroDoCampo('Informe o fundo de troco. Pode ser R$ 0,00.')
      return
    }
    enviandoRef.current = true
    setErroDoCampo(null)
    setErroGeral(null)
    mutation.mutate({ pontoId: ponto.id, fundoTroco: Number(fundo), chave })
  }

  const descricao = [ponto.ultimoFundoTroco !== null && ID_AJUDA, erroDoCampo && ID_ERRO].filter(Boolean).join(' ')

  return (
    <DialogContent
      showCloseButton={!enviando}
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        campoRef.current?.focus()
      }}
      onCloseAutoFocus={manterFocoMovidoPelaTela}
      // Durante o envio a janela nao fecha: o resultado precisa chegar a tela.
      onEscapeKeyDown={(event) => enviandoRef.current && event.preventDefault()}
      onInteractOutside={(event) => enviandoRef.current && event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>{`Abrir o ${ponto.nome}`}</DialogTitle>
        <DialogDescription>Conte o dinheiro que fica na gaveta para o troco.</DialogDescription>
      </DialogHeader>

      <form onSubmit={confirmar} noValidate className="space-y-4">
        {erroGeral && <ErroInline mensagem={erroGeral} />}

        <div className="space-y-1.5">
          <label htmlFor={ID_CAMPO} className="text-sm font-medium">
            Fundo de troco
            <MarcaObrigatorio />
          </label>
          <CampoMoeda
            ref={campoRef}
            id={ID_CAMPO}
            value={fundo}
            onChange={(valor) => {
              setFundo(valor)
              setErroDoCampo(null)
            }}
            disabled={enviando}
            aria-invalid={erroDoCampo ? true : undefined}
            aria-describedby={descricao || undefined}
            className="h-11 text-base"
          />
          {ponto.ultimoFundoTroco !== null && (
            <p id={ID_AJUDA} className="text-xs text-muted-foreground">
              Sugestão: o fundo da abertura anterior deste ponto.
            </p>
          )}
          <ErroDoCampo id={ID_ERRO} mensagem={erroDoCampo ?? undefined} />
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" className="min-h-11" disabled={enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Abrir caixa
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
