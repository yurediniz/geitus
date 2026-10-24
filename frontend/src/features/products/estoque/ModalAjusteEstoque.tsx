import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CampoMoeda } from '@/components/ui/campo-moeda'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import { FORNECEDORES_QUERY_KEY, PRODUTOS_QUERY_KEY, ehMensagemGenerica } from '@/features/catalog/catalogoQuery'
import { ErroInline } from '@/features/catalog/FeedbackCatalogo'
import { ErroDoCampo, MarcaObrigatorio } from '@/features/products/CamposFormulario'
import {
  ROTULO_MOTIVO,
  ROTULO_TIPO,
  TIPOS_MOVIMENTO,
  calcularPrevia,
  custoPorUnidade,
  dicaDoUltimoCusto,
  embalagemDoAjuste,
  embalagemPadrao,
  exigeCusto,
  motivoPadrao,
  motivosDoTipo,
  quantidadeEmUnidades,
  rotuloConfirmar,
  rotuloDoCusto,
  textoDaPrevia,
  textoDoCustoNaPrevia,
  textoDoCustoPorUnidade,
  validarAjuste,
  type CampoAjuste,
  type ContextoAjuste,
  type DadosAjuste,
  type EmbalagemDoAjuste,
  type PreviaSaldo,
} from '@/features/products/estoque/ajusteEstoque'
import { formatarQuantidade } from '@/features/products/formatacaoProduto'
import { BuscaDeFornecedor } from '@/features/suppliers/BuscaDeFornecedor'
import { interpretarQuantidade } from '@/lib/quantidade'
import { gerarUuid } from '@/lib/uuid'
import { cn } from '@/lib/utils'
import { ajustarEstoque } from '@/services/estoqueService'
import { HttpError } from '@/services/httpClient'
import type { AjusteEstoqueRequest, MotivoMovimento, MovimentoEstoque, TipoMovimento } from '@/types/estoque'
import type { FornecedorDoProduto } from '@/types/produto'

export interface ModalAjusteEstoqueProps {
  aberto: boolean
  produtoId: string
  /** Saldo atual do produto (o da pagina, atualizado a cada recarga). */
  saldo: number
  /** Sigla da unidade de venda do produto. */
  sigla: string
  /** Se a unidade de venda aceita quantidade fracionada. */
  fracionada: boolean
  /**
   * Embalagens gravadas do produto (spec B3 §6): com elas, Entrada e Saida
   * ganham o seletor "Em" e a quantidade pode ser informada em embalagens.
   */
  embalagens?: readonly EmbalagemDoAjuste[]
  /**
   * Custo atual do produto (por unidade de venda), para a dica "Último custo"
   * e a previa da entrada por compra (spec B4 §7.1). Null/ausente = sem custo.
   */
  custo?: number | null
  /**
   * Fornecedor que a entrada por compra traz preenchido (spec B5 §6): o da
   * ultima compra, se ativo. Null/ausente = o campo comeca vazio.
   */
  fornecedorDaCompra?: FornecedorDoProduto | null
  aoFechar: () => void
  /** Quem recebe o foco ao fechar (ex.: o botao que abriu; no Safari o clique nao foca o botao). */
  focoAoFechar?: () => HTMLElement | null
  /** Ajuste gravado (201, ou 200 com a chave repetida): quem abriu fecha o modal e avisa. */
  aoConcluir: (movimento: MovimentoEstoque) => void
}

/**
 * Modal "Ajustar estoque" (spec 6.2): tipo, quantidade, o custo da entrada por
 * compra (spec B4 §7.1), motivo, observacao, a previa do saldo e o atalho
 * "Zerar estoque". O conteudo monta a cada
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
  embalagemId: 'ajuste-embalagem',
  custo: 'ajuste-custo',
  motivo: 'ajuste-motivo',
  observacao: 'ajuste-observacao',
  fornecedorId: 'ajuste-fornecedor',
}
const ID_ERRO_GERAL = 'ajuste-erro-geral'
const ID_PREVIA = 'ajuste-previa'
const ID_PREVIA_CUSTO = 'ajuste-previa-custo'
const ID_AJUDA_CONTAGEM = 'ajuste-quantidade-ajuda'
const ID_DICA_CUSTO = 'ajuste-custo-dica'
const ID_CUSTO_POR_UNIDADE = 'ajuste-custo-por-unidade'

/** Ordem de foco quando ha erro (a ordem da tela). */
const ORDEM_CAMPOS: readonly CampoAjuste[] = [
  'tipo',
  'quantidade',
  'embalagemId',
  'custo',
  'fornecedorId',
  'motivo',
  'observacao',
]

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
const MENSAGEM_EMBALAGEM_REMOVIDA =
  'A embalagem escolhida foi removida. Confira a quantidade e o custo e tente de novo.'
const MENSAGEM_FORNECEDOR_REMOVIDO = 'O fornecedor escolhido não existe mais. Escolha outro ou deixe sem fornecedor.'
const MENSAGEM_CONFLITO =
  'Um ajuste deste produto já foi registrado agora há pouco. Confira o saldo atual antes de confirmar de novo.'

/** Previa da quantidade digitada (em unidades de venda); null enquanto ela nao e um numero aceito. */
function previaDe(dados: DadosAjuste, contexto: ContextoAjuste): PreviaSaldo | null {
  const total = quantidadeEmUnidades(dados, contexto)
  return total === null ? null : calcularPrevia(dados.tipo, total, contexto.saldo, contexto.sigla)
}

/** Os erros sem o do custo (o campo saiu da tela). */
function semErroDeCusto(erros: Partial<Record<CampoAjuste, string>>): Partial<Record<CampoAjuste, string>> {
  const { custo: _custo, ...demais } = erros
  return demais
}

/** Sem embalagens por padrao: referencia estavel (o contexto e montado a cada render). */
const SEM_EMBALAGENS: readonly EmbalagemDoAjuste[] = []

type ConteudoAjusteProps = Omit<ModalAjusteEstoqueProps, 'aberto'>

function ConteudoAjuste({
  produtoId,
  saldo,
  sigla,
  fracionada,
  embalagens = SEM_EMBALAGENS,
  custo: custoAtual = null,
  fornecedorDaCompra = null,
  aoFechar,
  focoAoFechar,
  aoConcluir,
}: ConteudoAjusteProps) {
  const queryClient = useQueryClient()
  // Gerada ao abrir; so muda depois de um 409 (a operacao desta chave ja foi registrada).
  const [chave, setChave] = useState(gerarUuid)
  const [dados, setDados] = useState<DadosAjuste>(() => ({
    tipo: 'ENTRADA',
    quantidade: '',
    motivo: motivoPadrao('ENTRADA'),
    observacao: '',
    embalagemId: embalagemPadrao('ENTRADA', motivoPadrao('ENTRADA'), embalagens),
    // Comeca vazio (spec B4 §7.1): o ultimo custo aparece so como dica.
    custo: '',
  }))
  // Fornecedor da compra (spec B5 §6): so vai no envio da Entrada com Compra.
  const [fornecedor, setFornecedor] = useState<FornecedorDoProduto | null>(fornecedorDaCompra)
  // Escolhida no seletor: trocar o tipo ou o motivo deixa de trocar a embalagem pelo padrao.
  const [embalagemEscolhida, setEmbalagemEscolhida] = useState(false)
  const [errosEnvio, setErrosEnvio] = useState<Partial<Record<CampoAjuste, string>>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [focoPendente, setFocoPendente] = useState<AlvoDoFoco | null>(null)
  /** Guarda sincrona contra envio duplo (duplo clique ou Enter repetido antes do novo render). */
  const enviandoRef = useRef(false)
  const contexto: ContextoAjuste = { saldo, sigla, fracionada, embalagens }

  // Saldo, listagem e historico ficam desatualizados: o prefixo de produtos cobre todos.
  const atualizarProdutos = () => void queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })

  const mutation = useMutation<MovimentoEstoque, unknown, AjusteEstoqueRequest>({
    mutationFn: (ajuste) => ajustarEstoque(produtoId, ajuste),
    onSuccess: (movimento, ajuste) => {
      atualizarProdutos()
      if (ajuste.fornecedorId) {
        // O fornecedor pode ter entrado na lista do produto (a contagem de produtos dele mudou).
        void queryClient.invalidateQueries({ queryKey: FORNECEDORES_QUERY_KEY })
      }
      aoConcluir(movimento)
    },
    onError: (erro, ajuste) => {
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
        // Com embalagem, o 404 e dela (removida com o modal aberto); com fornecedor, dele; sem os dois, do produto.
        setErroGeral(
          ajuste.embalagemId
            ? MENSAGEM_EMBALAGEM_REMOVIDA
            : ajuste.fornecedorId
              ? MENSAGEM_FORNECEDOR_REMOVIDO
              : 'Este produto não existe mais. Atualize a tela.',
        )
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

  // A embalagem escolhida saiu do produto (ex.: 404 e a recarga sem ela): o seletor volta a
  // unidade de venda, e a quantidade e o custo, que estavam em embalagens, ficam para ser informados de novo.
  const embalagemSumiu =
    Boolean(dados.embalagemId) && !embalagens.some((embalagem) => embalagem.id === dados.embalagemId)
  useEffect(() => {
    if (!embalagemSumiu) {
      return
    }
    setDados((atuais) => ({ ...atuais, embalagemId: '', quantidade: '', custo: '' }))
    setEmbalagemEscolhida(false)
    setFocoPendente(embalagens.length > 0 ? 'embalagemId' : 'quantidade')
  }, [embalagemSumiu, embalagens.length])

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

  const alterar = (campo: Exclude<CampoAjuste, 'tipo' | 'embalagemId'>, valor: string) => {
    setDados((atuais) => {
      const novos = { ...atuais, [campo]: valor }
      if (campo !== 'motivo') {
        return novos
      }
      // Fora da compra o campo de custo some, e o valor digitado com ele (spec B4 §7.1).
      const custo = exigeCusto(novos.tipo, novos.motivo) ? novos.custo : ''
      // O motivo muda o padrao do seletor (Compra traz a embalagem de compra), ate o usuario escolher.
      const embalagemId = embalagemEscolhida ? novos.embalagemId : embalagemPadrao(novos.tipo, novos.motivo, embalagens)
      return { ...novos, custo, embalagemId }
    })
    setErrosEnvio(({ [campo]: _removido, ...demais }) => (campo === 'motivo' ? semErroDeCusto(demais) : demais))
  }

  const escolherEmbalagem = (embalagemId: string) => {
    // O custo digitado era o de 1 unidade ou de 1 embalagem: com outra escolha, e descartado (com o erro dele).
    setDados((atuais) => (atuais.embalagemId === embalagemId ? atuais : { ...atuais, embalagemId, custo: '' }))
    setEmbalagemEscolhida(true)
    // A quantidade e o custo mudam de sentido (unidades ou embalagens).
    setErrosEnvio(({ quantidade: _quantidade, embalagemId: _embalagem, custo: _custo, ...demais }) => demais)
  }

  const trocarTipo = (tipo: TipoMovimento) => {
    setDados((atuais) => {
      const motivo =
        atuais.motivo !== '' && motivosDoTipo(tipo).includes(atuais.motivo) ? atuais.motivo : motivoPadrao(tipo)
      const embalagemId = embalagemEscolhida ? atuais.embalagemId : embalagemPadrao(tipo, motivo, embalagens)
      // Trocar o tipo descarta o custo digitado (spec B4 §7.1).
      const custo = tipo === atuais.tipo ? atuais.custo : ''
      return { ...atuais, tipo, motivo, embalagemId, custo }
    })
    // A quantidade muda de sentido com o tipo (na contagem e o saldo contado).
    setErrosEnvio({})
  }

  /** Atalho: contagem com saldo contado 0 e motivo Contagem/inventario (que pode ser trocado). */
  const zerar = () => {
    setDados((atuais) => ({ ...atuais, tipo: 'AJUSTE', quantidade: '0', motivo: 'CONTAGEM', custo: '' }))
    setErrosEnvio({})
  }

  const previa = previaDe(dados, contexto)
  const embalagem = embalagemDoAjuste(dados, contexto)
  const comCusto = exigeCusto(dados.tipo, dados.motivo)

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
      // Com embalagem, o numero de embalagens: o backend multiplica.
      quantidade,
      motivo: dados.motivo as MotivoMovimento,
      observacao: dados.observacao.trim() || null,
      chave,
      ...(embalagem ? { embalagemId: embalagem.id } : {}),
      // Com embalagem, o custo de 1 embalagem, como digitado: o backend divide.
      ...(comCusto ? { custo: Number(dados.custo) } : {}),
      // O fornecedor so vai na entrada por compra (fora dela, o backend recusa).
      ...(comCusto && fornecedor ? { fornecedorId: fornecedor.id } : {}),
    })
  }

  const contagem = dados.tipo === 'AJUSTE'
  const comSeletor = !contagem && embalagens.length > 0
  const motivos = motivosDoTipo(dados.tipo)
  const observacaoObrigatoria = dados.motivo === 'OUTRO'
  const saldoAtual = formatarQuantidade(saldo, sigla)
  // A previa so aparece com a quantidade aceita (ex.: fracao em UN nao mostra saldo).
  const quantidadeAceita = !validarAjuste(dados, contexto).erros.quantidade
  const quantidadeDigitada = interpretarQuantidade(dados.quantidade)
  const emEmbalagem =
    embalagem && quantidadeDigitada !== null ? { quantidade: quantidadeDigitada, rotulo: embalagem.rotulo } : undefined
  // Custo por unidade de venda do custo digitado (a conta do backend); null sem custo valido.
  const custoUnidade = comCusto ? custoPorUnidade(dados.custo ?? '', embalagem?.quantidade ?? null) : null
  const previaDoSaldo = previa && quantidadeAceita ? textoDaPrevia(dados.tipo, saldo, previa, sigla, emEmbalagem) : null
  // O custo vai numa linha propria, fora da regiao viva (o campo de custo ja e anunciado), so junto da previa do saldo.
  const custoDaPrevia = previaDoSaldo ? textoDoCustoNaPrevia(custoUnidade, custoAtual, sigla) : null
  const dicaCusto = dicaDoUltimoCusto(custoAtual, sigla, embalagem)
  // So na embalagem: na unidade de venda o custo digitado ja e por unidade.
  const custoPorUnidadeTexto = embalagem && custoUnidade !== null ? textoDoCustoPorUnidade(custoUnidade, sigla) : null
  const erroCusto = errosEnvio.custo
  const descricaoCusto =
    [custoPorUnidadeTexto && ID_CUSTO_POR_UNIDADE, dicaCusto && ID_DICA_CUSTO, erroCusto && `${ID_CAMPO.custo}-erro`]
      .filter(Boolean)
      .join(' ') || undefined
  // Em embalagens, o botao diz o total em unidades ("Registrar entrada de 36 UN").
  const totalEmEmbalagens = emEmbalagem && quantidadeAceita ? (quantidadeEmUnidades(dados, contexto) ?? undefined) : undefined
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

        <div className={cn('gap-3', comSeletor && 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)]')}>
          <div className="space-y-1.5">
            <label htmlFor={ID_CAMPO.quantidade} className="text-sm font-medium">
              {contagem ? `Saldo contado (${sigla})` : comSeletor ? 'Quantidade' : `Quantidade (${sigla})`}
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
          {comSeletor && (
            <div className="space-y-1.5">
              <label htmlFor={ID_CAMPO.embalagemId} className="text-sm font-medium">
                Em
              </label>
              {/* O nome falado diz o que se escolhe; o visivel fica curto, ao lado da quantidade. */}
              <NativeSelect
                id={ID_CAMPO.embalagemId}
                aria-label="Em (unidade ou embalagem)"
                value={dados.embalagemId ?? ''}
                onChange={(event) => escolherEmbalagem(event.target.value)}
                disabled={enviando}
                aria-invalid={errosEnvio.embalagemId ? true : undefined}
                aria-describedby={errosEnvio.embalagemId ? `${ID_CAMPO.embalagemId}-erro` : undefined}
              >
                <option value="">{sigla}</option>
                {embalagens.map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>
                    {opcao.rotulo}
                  </option>
                ))}
              </NativeSelect>
              <ErroDoCampo id={`${ID_CAMPO.embalagemId}-erro`} mensagem={errosEnvio.embalagemId} />
            </div>
          )}
        </div>

        {/* Custo da compra (spec B4 §7.1): so na Entrada com Compra, logo abaixo da quantidade. */}
        {comCusto && (
          <div className="space-y-1.5">
            <label htmlFor={ID_CAMPO.custo} className="text-sm font-medium">
              {rotuloDoCusto(sigla, embalagem)}
              <MarcaObrigatorio />
            </label>
            <CampoMoeda
              id={ID_CAMPO.custo}
              value={dados.custo ?? ''}
              onChange={(valor) => alterar('custo', valor)}
              disabled={enviando}
              aria-invalid={erroCusto ? true : undefined}
              aria-describedby={descricaoCusto}
            />
            {custoPorUnidadeTexto && (
              <p id={ID_CUSTO_POR_UNIDADE} className="text-sm font-medium tabular-nums">
                {custoPorUnidadeTexto}
              </p>
            )}
            {dicaCusto && (
              <p id={ID_DICA_CUSTO} className="text-xs text-muted-foreground tabular-nums">
                {dicaCusto}
              </p>
            )}
            <ErroDoCampo id={`${ID_CAMPO.custo}-erro`} mensagem={erroCusto} />
          </div>
        )}

        {/* Fornecedor da compra (spec B5 §6): opcional, abaixo do custo, so dos ativos. */}
        {comCusto && (
          <div className="space-y-1.5">
            <span id={`${ID_CAMPO.fornecedorId}-rotulo`} className="block text-sm font-medium">
              Fornecedor (opcional)
            </span>
            <BuscaDeFornecedor
              id={ID_CAMPO.fornecedorId}
              idRotulo={`${ID_CAMPO.fornecedorId}-rotulo`}
              valor={fornecedor}
              onChange={(escolhido) => {
                setFornecedor(escolhido)
                setErrosEnvio(({ fornecedorId: _fornecedor, ...demais }) => demais)
              }}
              textoSemValor="Nenhum"
              permitirLimpar
              desabilitado={enviando}
              invalido={Boolean(errosEnvio.fornecedorId)}
              idsDescricao={
                errosEnvio.fornecedorId ? `${ID_CAMPO.fornecedorId}-erro` : `${ID_CAMPO.fornecedorId}-ajuda`
              }
            />
            {!errosEnvio.fornecedorId && (
              <p id={`${ID_CAMPO.fornecedorId}-ajuda`} className="text-xs text-muted-foreground">
                Com fornecedor, ele entra na lista do produto como o da última compra.
              </p>
            )}
            <ErroDoCampo id={`${ID_CAMPO.fornecedorId}-erro`} mensagem={errosEnvio.fornecedorId} />
          </div>
        )}

        <div className="space-y-0.5">
          {/* Regiao viva, logo abaixo da quantidade (e do custo, na compra): a previa do saldo, o erro de
              saldo (antes do envio) ou a contagem que confere. */}
          <div id={ID_PREVIA} aria-live="polite" className="min-h-5 text-sm tabular-nums">
            {erroDaPrevia && <p className="font-medium text-destructive">{erroDaPrevia}</p>}
            {previa?.confere && <p className="text-muted-foreground">{previa.confere}</p>}
            {previaDoSaldo && !erroQuantidade && <p className="font-medium">{previaDoSaldo}</p>}
          </div>
          {/* O custo na previa (spec B4 §7.1), fora da regiao viva: anunciar a cada digito do custo atrapalharia. */}
          {custoDaPrevia && !erroQuantidade && (
            <p id={ID_PREVIA_CUSTO} className="text-sm font-medium tabular-nums">
              {custoDaPrevia}
            </p>
          )}
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
            {rotuloConfirmar(dados.tipo, previa, sigla, totalEmEmbalagens)}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  )
}
