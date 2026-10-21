import { useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { PRODUTOS_QUERY_KEY, ehMensagemGenerica } from '@/features/catalog/catalogoQuery'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { ErroDoCampo, MarcaObrigatorio } from '@/features/products/CamposFormulario'
import {
  ROTULO_MOTIVO,
  ROTULO_TIPO,
  TIPOS_MOVIMENTO,
  calcularPrevia,
  erroDaPrevia,
  motivoPadrao,
  motivosDoTipo,
  validarAjuste,
  type CampoAjuste,
  type DadosAjuste,
} from '@/features/products/estoque/ajusteEstoque'
import { formatarQuantidade } from '@/features/products/formatacaoProduto'
import { gerarUuid } from '@/lib/uuid'
import { cn } from '@/lib/utils'
import { ajustarEstoque } from '@/services/estoqueService'
import { HttpError } from '@/services/httpClient'
import type { AjusteEstoqueRequest, MotivoMovimento, MovimentoEstoque, TipoMovimento } from '@/types/estoque'

export interface ModalAjusteEstoqueProps {
  aberto: boolean
  produtoId: string
  /** Saldo atual do produto (o da pagina, atualizado a cada recarga). */
  saldo: number
  /** Sigla da unidade de venda do produto. */
  sigla: string
  /** Se a unidade de venda aceita quantidade fracionada. */
  fracionada: boolean
  aoFechar: () => void
  /** Quem recebe o foco ao fechar (ex.: o botao que abriu; no Safari o clique nao foca o botao). */
  focoAoFechar?: () => HTMLElement | null
  /** Ajuste gravado (201, ou 200 com a chave repetida): a pagina fecha o modal e avisa. */
  aoConcluir: (movimento: MovimentoEstoque) => void
}

/**
 * Modal "Ajustar estoque" (spec 6.2): tipo, quantidade, motivo, observacao e a
 * previa do saldo. O conteudo monta a cada abertura, e com ele a `chave` de
 * idempotencia: novas tentativas na mesma abertura (ex.: depois de um erro de
 * rede) reaproveitam a chave, e o backend nao grava o movimento duas vezes.
 */
export function ModalAjusteEstoque({ aberto, aoFechar, ...props }: ModalAjusteEstoqueProps) {
  return (
    <Dialog
      open={aberto}
      onOpenChange={(abrir) => {
        if (!abrir) {
          aoFechar()
        }
      }}
    >
      {aberto && <ConteudoAjuste {...props} aoFechar={aoFechar} />}
    </Dialog>
  )
}

const ID_CAMPO: Readonly<Record<CampoAjuste, string>> = {
  tipo: 'ajuste-tipo',
  quantidade: 'ajuste-quantidade',
  motivo: 'ajuste-motivo',
  observacao: 'ajuste-observacao',
}

/** Ordem de foco quando ha erro (a ordem da tela). */
const ORDEM_CAMPOS: readonly CampoAjuste[] = ['tipo', 'quantidade', 'motivo', 'observacao']

function ehCampoAjuste(chave: string): chave is CampoAjuste {
  return (ORDEM_CAMPOS as readonly string[]).includes(chave)
}

function idDoTipo(tipo: TipoMovimento): string {
  return `${ID_CAMPO.tipo}-${tipo}`
}

/** Foca o primeiro campo com erro (o grupo de tipo pelo radio marcado). */
function focarPrimeiroErro(erros: Partial<Record<CampoAjuste, string>>, tipo: TipoMovimento) {
  const campo = ORDEM_CAMPOS.find((alvo) => erros[alvo])
  if (campo) {
    document.getElementById(campo === 'tipo' ? idDoTipo(tipo) : ID_CAMPO[campo])?.focus()
  }
}

const MENSAGEM_FALHA = 'Não foi possível registrar o ajuste. Confira a conexão e tente de novo.'

type ConteudoAjusteProps = Omit<ModalAjusteEstoqueProps, 'aberto'>

function ConteudoAjuste({
  produtoId,
  saldo,
  sigla,
  fracionada,
  aoFechar,
  focoAoFechar,
  aoConcluir,
}: ConteudoAjusteProps) {
  const queryClient = useQueryClient()
  // Gerada ao abrir; so muda depois de um 409 (a operacao desta chave ja foi registrada).
  const [chave, setChave] = useState(gerarUuid)
  const [dados, setDados] = useState<DadosAjuste>({ tipo: 'ENTRADA', quantidade: '', motivo: '', observacao: '' })
  const [errosEnvio, setErrosEnvio] = useState<Partial<Record<CampoAjuste, string>>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  /** Guarda sincrona contra envio duplo (duplo clique ou Enter repetido antes do novo render). */
  const enviandoRef = useRef(false)
  const contexto = { saldo, sigla, fracionada }

  // Saldo, listagem e historico ficam desatualizados: o prefixo de produtos cobre todos.
  const atualizarProdutos = () => void queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })

  const mutation = useMutation<MovimentoEstoque, unknown, AjusteEstoqueRequest>({
    mutationFn: (ajuste) => ajustarEstoque(produtoId, ajuste),
    onSuccess: (movimento) => {
      atualizarProdutos()
      aoConcluir(movimento)
    },
    onError: (erro) => {
      if (!(erro instanceof HttpError)) {
        setErroGeral(MENSAGEM_FALHA)
        return
      }
      if (erro.status === 400) {
        // O saldo pode ter mudado por outra pessoa (ex.: "Saldo insuficiente: há 1 UN.").
        atualizarProdutos()
        const porCampo: Partial<Record<CampoAjuste, string>> = {}
        const restantes: string[] = []
        for (const [campo, mensagem] of Object.entries(erro.campos ?? {})) {
          if (ehCampoAjuste(campo)) {
            porCampo[campo] = mensagem
          } else {
            restantes.push(mensagem)
          }
        }
        setErrosEnvio(porCampo)
        focarPrimeiroErro(porCampo, dados.tipo)
        const semCampos = Object.keys(porCampo).length === 0 && restantes.length === 0
        if (semCampos) {
          setErroGeral(ehMensagemGenerica(erro.message) ? 'Revise os dados do ajuste e tente de novo.' : erro.message)
        } else {
          setErroGeral(restantes.length > 0 ? restantes.join(' ') : null)
        }
        return
      }
      if (erro.status === 409) {
        // A chave ja gravou outra operacao (ex.: um envio que parecia ter falhado):
        // o saldo e recarregado e a proxima confirmacao e uma operacao nova.
        atualizarProdutos()
        setChave(gerarUuid())
        setErroGeral(
          ehMensagemGenerica(erro.message) ? 'Esta operação já foi registrada com outros dados.' : erro.message,
        )
        return
      }
      if (erro.status === 403) {
        setErroGeral('Somente administradores podem ajustar o estoque.')
      } else if (erro.status === 404) {
        setErroGeral('Este produto não existe mais. Atualize a tela.')
      } else {
        setErroGeral(MENSAGEM_FALHA)
      }
    },
    onSettled: () => {
      enviandoRef.current = false
    },
  })
  const enviando = mutation.isPending

  const alterar = (campo: Exclude<CampoAjuste, 'tipo'>, valor: string) => {
    setDados((atuais) => ({ ...atuais, [campo]: valor }))
    setErrosEnvio(({ [campo]: _removido, ...demais }) => demais)
  }

  const trocarTipo = (tipo: TipoMovimento) => {
    setDados((atuais) => ({
      ...atuais,
      tipo,
      motivo: atuais.motivo !== '' && motivosDoTipo(tipo).includes(atuais.motivo) ? atuais.motivo : motivoPadrao(tipo),
    }))
    // A quantidade muda de sentido com o tipo (no ajuste e o saldo contado).
    setErrosEnvio({})
  }

  const confirmar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // O modal fica (na arvore do React) dentro do formulario do produto: o envio nao pode subir ate ele.
    event.stopPropagation()
    if (enviandoRef.current || enviando) {
      return
    }
    const { quantidade, erros } = validarAjuste(dados, contexto)
    if (quantidade === null || Object.keys(erros).length > 0) {
      setErrosEnvio(erros)
      focarPrimeiroErro(erros, dados.tipo)
      return
    }
    enviandoRef.current = true
    setErroGeral(null)
    mutation.mutate({
      tipo: dados.tipo,
      quantidade,
      motivo: dados.motivo as MotivoMovimento,
      observacao: dados.observacao.trim() || null,
      chave,
    })
  }

  // Ao digitar: o erro de saldo (insuficiente ou igual) aparece antes do envio; os demais, no envio.
  const aoVivo = validarAjuste(dados, contexto)
  const erroQuantidade = errosEnvio.quantidade ?? erroDaPrevia(dados, contexto) ?? undefined
  const saldoNovo =
    aoVivo.quantidade !== null && !aoVivo.erros.quantidade
      ? calcularPrevia(dados.tipo, aoVivo.quantidade, saldo, sigla).saldoNovo
      : null
  const contagem = dados.tipo === 'AJUSTE'
  const motivos = motivosDoTipo(dados.tipo)
  const observacaoObrigatoria = dados.motivo === 'OUTRO'
  const saldoAtual = formatarQuantidade(saldo, sigla)
  const descricaoQuantidade = erroQuantidade ? `${ID_CAMPO.quantidade}-erro` : undefined

  return (
    <DialogContent
      showCloseButton={!enviando}
      // O foco comeca no tipo (o radio marcado).
      onOpenAutoFocus={(event) => {
        event.preventDefault()
        document.getElementById(idDoTipo(dados.tipo))?.focus()
      }}
      onCloseAutoFocus={(event) => {
        const alvo = focoAoFechar?.()
        if (alvo?.isConnected) {
          event.preventDefault()
          alvo.focus()
        }
      }}
      // Durante o envio o modal nao fecha: o resultado precisa chegar a tela.
      onEscapeKeyDown={(event) => enviando && event.preventDefault()}
      onInteractOutside={(event) => enviando && event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>Ajustar estoque</DialogTitle>
        <DialogDescription>{`Saldo atual: ${saldoAtual}`}</DialogDescription>
      </DialogHeader>

      <form onSubmit={confirmar} noValidate className="space-y-4">
        {erroGeral && <ErroInline mensagem={erroGeral} />}

        <fieldset className="space-y-1.5" aria-describedby={errosEnvio.tipo ? `${ID_CAMPO.tipo}-erro` : undefined}>
          <legend className="text-sm font-medium">Tipo</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TIPOS_MOVIMENTO.map((tipo) => (
              <label
                key={tipo}
                className={cn(
                  'flex min-h-11 cursor-pointer items-center justify-center rounded-md border border-input bg-background px-3 text-center text-sm font-medium transition-colors',
                  'has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground',
                  'has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
                )}
              >
                <input
                  type="radio"
                  id={idDoTipo(tipo)}
                  name="ajuste-tipo"
                  value={tipo}
                  checked={dados.tipo === tipo}
                  onChange={() => trocarTipo(tipo)}
                  disabled={enviando}
                  className="sr-only"
                />
                {ROTULO_TIPO[tipo]}
              </label>
            ))}
          </div>
          <ErroDoCampo id={`${ID_CAMPO.tipo}-erro`} mensagem={errosEnvio.tipo} />
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor={ID_CAMPO.quantidade} className="text-sm font-medium">
            {`${contagem ? 'Saldo contado' : 'Quantidade'} (${sigla})`}
          </label>
          <Input
            id={ID_CAMPO.quantidade}
            inputMode="decimal"
            autoComplete="off"
            value={dados.quantidade}
            onChange={(event) => alterar('quantidade', event.target.value)}
            disabled={enviando}
            aria-invalid={erroQuantidade ? true : undefined}
            aria-describedby={descricaoQuantidade}
            className="tabular-nums"
          />
          <ErroDoCampo id={`${ID_CAMPO.quantidade}-erro`} mensagem={erroQuantidade} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ID_CAMPO.motivo} className="text-sm font-medium">
            Motivo
          </label>
          <NativeSelect
            id={ID_CAMPO.motivo}
            value={dados.motivo}
            onChange={(event) => alterar('motivo', event.target.value)}
            disabled={enviando}
            aria-invalid={errosEnvio.motivo ? true : undefined}
            aria-describedby={errosEnvio.motivo ? `${ID_CAMPO.motivo}-erro` : undefined}
          >
            {!contagem && <option value="">Selecione o motivo</option>}
            {motivos.map((motivo) => (
              <option key={motivo} value={motivo}>
                {ROTULO_MOTIVO[motivo]}
              </option>
            ))}
          </NativeSelect>
          <ErroDoCampo id={`${ID_CAMPO.motivo}-erro`} mensagem={errosEnvio.motivo} />
        </div>

        <div className="space-y-1.5">
          <label htmlFor={ID_CAMPO.observacao} className="text-sm font-medium">
            Observação
            {observacaoObrigatoria ? <MarcaObrigatorio /> : ' (opcional)'}
          </label>
          <Input
            id={ID_CAMPO.observacao}
            value={dados.observacao}
            onChange={(event) => alterar('observacao', event.target.value)}
            maxLength={200}
            disabled={enviando}
            aria-invalid={errosEnvio.observacao ? true : undefined}
            aria-describedby={errosEnvio.observacao ? `${ID_CAMPO.observacao}-erro` : undefined}
          />
          <ErroDoCampo id={`${ID_CAMPO.observacao}-erro`} mensagem={errosEnvio.observacao} />
        </div>

        {/* Previa do saldo: some enquanto a quantidade tem erro (o erro ja diz o motivo). */}
        <p aria-live="polite" className="min-h-5 text-sm font-medium tabular-nums">
          {saldoNovo !== null && (
            <>
              <span aria-hidden="true">{`Saldo: ${saldoAtual} → ${formatarQuantidade(saldoNovo, sigla)}`}</span>
              <span className="sr-only">{`O saldo passa de ${saldoAtual} para ${formatarQuantidade(saldoNovo, sigla)}.`}</span>
            </>
          )}
        </p>

        <DialogFooter>
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" className="min-h-11" disabled={enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Confirmar
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
