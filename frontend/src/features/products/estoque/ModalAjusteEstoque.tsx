import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'

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
  motivoPadrao,
  motivosDoTipo,
  rotuloConfirmar,
  textoDaPrevia,
  validarAjuste,
  type CampoAjuste,
  type DadosAjuste,
  type PreviaSaldo,
} from '@/features/products/estoque/ajusteEstoque'
import { formatarQuantidade } from '@/features/products/formatacaoProduto'
import { validarQuantidade } from '@/lib/quantidade'
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
  /** Ajuste gravado (201, ou 200 com a chave repetida): quem abriu fecha o modal e avisa. */
  aoConcluir: (movimento: MovimentoEstoque) => void
}

/**
 * Modal "Ajustar estoque" (spec 6.2): tipo, quantidade, motivo, observacao, a
 * previa do saldo e o atalho "Zerar estoque". O conteudo monta a cada
 * abertura, e com ele a `chave` de idempotencia: novas tentativas na mesma
 * abertura (ex.: depois de um erro de rede) reaproveitam a chave, e o backend
 * nao grava o movimento duas vezes.
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
const ID_ERRO_GERAL = 'ajuste-erro-geral'
const ID_PREVIA = 'ajuste-previa'
const ID_AJUDA_CONTAGEM = 'ajuste-quantidade-ajuda'

/** Ordem de foco quando ha erro (a ordem da tela). */
const ORDEM_CAMPOS: readonly CampoAjuste[] = ['tipo', 'quantidade', 'motivo', 'observacao']

function ehCampoAjuste(chave: string): chave is CampoAjuste {
  return (ORDEM_CAMPOS as readonly string[]).includes(chave)
}

function idDoTipo(tipo: TipoMovimento): string {
  return `${ID_CAMPO.tipo}-${tipo}`
}

/** Onde o foco vai depois de um erro: o primeiro campo com erro ou a mensagem do topo. */
type AlvoDoFoco = CampoAjuste | 'topo'

function primeiroCampoComErro(erros: Partial<Record<CampoAjuste, string>>): CampoAjuste | undefined {
  return ORDEM_CAMPOS.find((campo) => erros[campo])
}

const MENSAGEM_FALHA = 'Não foi possível registrar o ajuste. Confira a conexão e tente de novo.'
const MENSAGEM_CONFLITO =
  'Um ajuste deste produto já foi registrado agora há pouco. Confira o saldo atual antes de confirmar de novo.'

/** Previa da quantidade digitada; null enquanto ela nao e um numero aceito. */
function previaDe(dados: DadosAjuste, saldo: number, sigla: string): PreviaSaldo | null {
  const resultado = validarQuantidade(dados.quantidade)
  return 'valor' in resultado ? calcularPrevia(dados.tipo, resultado.valor, saldo, sigla) : null
}

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
  const [dados, setDados] = useState<DadosAjuste>({
    tipo: 'ENTRADA',
    quantidade: '',
    motivo: motivoPadrao('ENTRADA'),
    observacao: '',
  })
  const [errosEnvio, setErrosEnvio] = useState<Partial<Record<CampoAjuste, string>>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [focoPendente, setFocoPendente] = useState<AlvoDoFoco | null>(null)
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
      // Em qualquer falha o saldo e recarregado: o envio pode ter chegado ao
      // servidor (rede, 5xx) ou o saldo pode ter mudado (400, 409). A previa e
      // a nova tentativa partem do saldo real.
      atualizarProdutos()
      if (erro instanceof HttpError && erro.status === 400) {
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
        const semCampos = Object.keys(porCampo).length === 0 && restantes.length === 0
        if (semCampos) {
          setErroGeral(ehMensagemGenerica(erro.message) ? 'Revise os dados do ajuste e tente de novo.' : erro.message)
        } else {
          setErroGeral(restantes.length > 0 ? restantes.join(' ') : null)
        }
        setFocoPendente(primeiroCampoComErro(porCampo) ?? 'topo')
        return
      }
      if (erro instanceof HttpError && erro.status === 409) {
        // A chave ja gravou outra operacao (ex.: um envio que parecia ter falhado):
        // a proxima confirmacao e uma operacao nova.
        setChave(gerarUuid())
        setErroGeral(MENSAGEM_CONFLITO)
      } else if (erro instanceof HttpError && erro.status === 403) {
        setErroGeral('Somente administradores podem ajustar o estoque.')
      } else if (erro instanceof HttpError && erro.status === 404) {
        setErroGeral('Este produto não existe mais. Atualize a tela.')
      } else {
        setErroGeral(MENSAGEM_FALHA)
      }
      setFocoPendente('topo')
    },
    onSettled: () => {
      enviandoRef.current = false
    },
  })
  const enviando = mutation.isPending

  // O foco do erro so pode ir ao campo depois que o envio termina e os campos voltam a ficar habilitados.
  useEffect(() => {
    if (focoPendente === null || enviando) {
      return
    }
    const id =
      focoPendente === 'topo' ? ID_ERRO_GERAL : focoPendente === 'tipo' ? idDoTipo(dados.tipo) : ID_CAMPO[focoPendente]
    document.getElementById(id)?.focus()
    setFocoPendente(null)
  }, [focoPendente, enviando, dados.tipo])

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
    // A quantidade muda de sentido com o tipo (na contagem e o saldo contado).
    setErrosEnvio({})
  }

  /** Atalho: contagem com saldo contado 0 e motivo Contagem/inventario (que pode ser trocado). */
  const zerar = () => {
    setDados((atuais) => ({ ...atuais, tipo: 'AJUSTE', quantidade: '0', motivo: 'CONTAGEM' }))
    setErrosEnvio({})
  }

  const previa = previaDe(dados, saldo, sigla)

  const confirmar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // O modal fica (na arvore do React) dentro do formulario do produto: o envio nao pode subir ate ele.
    event.stopPropagation()
    if (enviandoRef.current || enviando) {
      return
    }
    const { quantidade, erros, confere } = validarAjuste(dados, contexto)
    const camposComErro = Object.keys(erros).length > 0
    if (confere && !camposComErro) {
      // A contagem confere com o saldo: nao ha o que gravar.
      aoFechar()
      return
    }
    if (quantidade === null || camposComErro) {
      // O erro de saldo ja esta na regiao da previa: nao se repete sob o campo.
      const { quantidade: erroQuantidade, ...demais } = erros
      setErrosEnvio(erroQuantidade && erroQuantidade === previa?.erro ? demais : erros)
      setFocoPendente(primeiroCampoComErro(erros) ?? null)
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

  const contagem = dados.tipo === 'AJUSTE'
  const motivos = motivosDoTipo(dados.tipo)
  const observacaoObrigatoria = dados.motivo === 'OUTRO'
  const saldoAtual = formatarQuantidade(saldo, sigla)
  // A previa so aparece com a quantidade aceita (ex.: fracao em UN nao mostra saldo).
  const quantidadeAceita = !validarAjuste(dados, contexto).erros.quantidade
  const textoPrevia = previa && quantidadeAceita ? textoDaPrevia(dados.tipo, saldo, previa, sigla) : null
  const erroDaPrevia = errosEnvio.quantidade ? null : (previa?.erro ?? null)
  const erroQuantidade = errosEnvio.quantidade
  const quantidadeInvalida = Boolean(erroQuantidade || erroDaPrevia)
  const descricaoQuantidade =
    [
      contagem && ID_AJUDA_CONTAGEM,
      erroQuantidade && `${ID_CAMPO.quantidade}-erro`,
      erroDaPrevia && ID_PREVIA,
    ]
      .filter(Boolean)
      .join(' ') || undefined
  const zerado = contagem && previa?.saldoNovo === 0

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
      // Durante o envio o modal nao fecha: o resultado precisa chegar a tela. Le o ref (o Radix
      // pode chamar o handler de um render anterior).
      onEscapeKeyDown={(event) => enviandoRef.current && event.preventDefault()}
      onInteractOutside={(event) => enviandoRef.current && event.preventDefault()}
    >
      <DialogHeader>
        <DialogTitle>Ajustar estoque</DialogTitle>
        <DialogDescription>{`Saldo atual: ${saldoAtual}`}</DialogDescription>
      </DialogHeader>

      <form onSubmit={confirmar} noValidate className="space-y-4">
        {erroGeral && (
          // tabIndex -1: recebe o foco quando o erro nao e de um campo.
          <div id={ID_ERRO_GERAL} tabIndex={-1} className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            <ErroInline mensagem={erroGeral} />
          </div>
        )}

        <fieldset className="space-y-1.5" aria-describedby={errosEnvio.tipo ? `${ID_CAMPO.tipo}-erro` : undefined}>
          <legend className="text-sm font-medium">Tipo</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TIPOS_MOVIMENTO.map((tipo) => {
              const marcado = dados.tipo === tipo
              return (
                <label
                  key={tipo}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-input bg-background px-3 text-center text-sm font-medium transition-colors',
                    // Marcado: cor, borda dupla e check (nunca so a cor).
                    'has-checked:border-primary has-checked:bg-accent has-checked:text-accent-foreground has-checked:ring-2 has-checked:ring-primary',
                    'has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50',
                    'has-disabled:cursor-not-allowed has-disabled:opacity-50',
                  )}
                >
                  <input
                    type="radio"
                    id={idDoTipo(tipo)}
                    name="ajuste-tipo"
                    value={tipo}
                    checked={marcado}
                    onChange={() => trocarTipo(tipo)}
                    disabled={enviando}
                    className="sr-only"
                  />
                  {marcado && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                  {ROTULO_TIPO[tipo]}
                </label>
              )
            })}
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
            aria-invalid={quantidadeInvalida ? true : undefined}
            aria-describedby={descricaoQuantidade}
            className="tabular-nums"
          />
          {contagem && (
            <p id={ID_AJUDA_CONTAGEM} className="text-xs text-muted-foreground">
              Quanto você contou. O sistema calcula a diferença.
            </p>
          )}
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
            {motivoPadrao(dados.tipo) === '' && <option value="">Selecione o motivo</option>}
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

        {/* Regiao viva: a previa, o erro de saldo (antes do envio) ou a contagem que confere. */}
        <div id={ID_PREVIA} aria-live="polite" className="min-h-5 text-sm tabular-nums">
          {erroDaPrevia && <p className="font-medium text-destructive">{erroDaPrevia}</p>}
          {previa?.confere && <p className="text-muted-foreground">{previa.confere}</p>}
          {textoPrevia && !erroQuantidade && <p className="font-medium">{textoPrevia}</p>}
        </div>

        <DialogFooter>
          {saldo > 0 && !zerado && (
            <Button
              type="button"
              variant="ghost"
              className="min-h-11 sm:mr-auto"
              onClick={zerar}
              disabled={enviando}
            >
              Zerar estoque
            </Button>
          )}
          <Button type="button" variant="outline" className="min-h-11" onClick={aoFechar} disabled={enviando}>
            Cancelar
          </Button>
          <Button type="submit" className="min-h-11" disabled={enviando}>
            {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {rotuloConfirmar(dados.tipo, previa, sigla)}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
