import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Pencil, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CAIXA_QUERY_KEY, chaveDosPontos } from '@/features/cash-register/caixaQuery'
import { lerErroDoServidor } from '@/features/cash-register/errosDoCaixa'
import { ErroDoCampo } from '@/features/products/CamposFormulario'
import type { AvisosDaTela } from '@/hooks/useFeedbackDaTela'
import { cn } from '@/lib/utils'
import { criarPonto, inativarPonto, listarPontos, reativarPonto, renomearPonto } from '@/services/caixaService'
import type { PontoDeCaixa } from '@/types/caixa'

/** Limite do nome no backend (spec §3.1). */
const TAMANHO_MAXIMO_DO_NOME = 40
const ALTURA_DO_CONTROLE = 'h-11 md:h-9'
const MENSAGEM_NOME_VAZIO = 'Informe o nome do ponto.'

/** Situacao do ponto na lista ("Livre", "Aberto por Ana Souza"); inativo nao tem sessao. */
function textoDaSituacao(ponto: PontoDeCaixa): string | null {
  if (ponto.situacao) {
    return ponto.situacao.status === 'EM_CONFERENCIA'
      ? `Em conferência · ${ponto.situacao.abertaPorNome}`
      : `Aberto por ${ponto.situacao.abertaPorNome}`
  }
  return ponto.ativo ? 'Livre' : null
}

/**
 * Pontos de caixa (spec §6.7): lista com nome e situacao, "Adicionar ponto",
 * renomear em linha e inativar/reativar. Conflitos (nome repetido, limite,
 * caixa aberto no ponto) mostram a mensagem do servidor.
 */
export function PontosDeCaixa({ avisos }: { avisos: AvisosDaTela }) {
  const queryClient = useQueryClient()
  const idTitulo = useId()
  const [adicionando, setAdicionando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [alterandoStatusId, setAlterandoStatusId] = useState<string | null>(null)

  const consulta = useQuery({ queryKey: chaveDosPontos(), queryFn: () => listarPontos() })
  const atualizar = () => queryClient.invalidateQueries({ queryKey: CAIXA_QUERY_KEY })

  const statusMutation = useMutation<PontoDeCaixa, unknown, PontoDeCaixa>({
    mutationFn: (ponto) => (ponto.ativo ? inativarPonto(ponto.id) : reativarPonto(ponto.id)),
    onMutate: (ponto) => setAlterandoStatusId(ponto.id),
    onSuccess: (_resposta, ponto) => {
      avisos.sucesso(ponto.ativo ? `${ponto.nome} inativado.` : `${ponto.nome} reativado.`)
    },
    onError: (erro, ponto) => {
      const padrao = `Não foi possível ${ponto.ativo ? 'inativar' : 'reativar'} o ${ponto.nome}. Tente de novo.`
      avisos.erro(lerErroDoServidor(erro, [], padrao).geral ?? padrao)
    },
    onSettled: () => {
      setAlterandoStatusId(null)
      void atualizar()
    },
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 id={idTitulo} className="text-sm font-medium">
            Pontos de caixa
          </h3>
          <p className="text-sm text-muted-foreground">Cada ponto é uma gaveta, com no máximo um caixa aberto.</p>
        </div>
        {!adicionando && consulta.isSuccess && (
          <Button type="button" variant="outline" className={ALTURA_DO_CONTROLE} onClick={() => setAdicionando(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar ponto
          </Button>
        )}
      </div>

      {adicionando && (
        <FormularioDoNome
          rotulo="Nome do novo ponto"
          valorInicial=""
          textoConfirmar="Adicionar"
          enviar={criarPonto}
          aoConcluir={(ponto) => {
            setAdicionando(false)
            avisos.sucesso(`${ponto.nome} adicionado.`)
            void atualizar()
          }}
          aoCancelar={() => setAdicionando(false)}
        />
      )}

      {consulta.isPending ? (
        <div role="status" aria-label="Carregando pontos de caixa" className="space-y-2">
          {Array.from({ length: 2 }, (_, indice) => (
            <div key={indice} aria-hidden="true" className="h-11 animate-pulse rounded-md bg-muted" />
          ))}
        </div>
      ) : consulta.isError ? (
        <div className="space-y-3">
          <div
            role="alert"
            className="flex max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Não foi possível carregar os pontos de caixa.</span>
          </div>
          <Button type="button" variant="outline" className={ALTURA_DO_CONTROLE} onClick={() => consulta.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : consulta.data.length === 0 ? (
        <p className="rounded-md bg-muted/50 p-4 text-sm font-medium">Nenhum ponto de caixa cadastrado.</p>
      ) : (
        <ul aria-labelledby={idTitulo} className="divide-y rounded-md bg-muted/30">
          {consulta.data.map((ponto) => (
            <ItemDoPonto
              key={ponto.id}
              ponto={ponto}
              editando={editandoId === ponto.id}
              alterandoStatus={alterandoStatusId === ponto.id}
              aoEditar={() => setEditandoId(ponto.id)}
              aoTerminarEdicao={() => setEditandoId(null)}
              aoRenomear={(renomeado) => {
                setEditandoId(null)
                avisos.sucesso(`Ponto renomeado para ${renomeado.nome}.`)
                void atualizar()
              }}
              aoAlterarStatus={() => statusMutation.mutate(ponto)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface ItemDoPontoProps {
  ponto: PontoDeCaixa
  editando: boolean
  alterandoStatus: boolean
  aoEditar: () => void
  aoTerminarEdicao: () => void
  aoRenomear: (ponto: PontoDeCaixa) => void
  aoAlterarStatus: () => void
}

function ItemDoPonto({
  ponto,
  editando,
  alterandoStatus,
  aoEditar,
  aoTerminarEdicao,
  aoRenomear,
  aoAlterarStatus,
}: ItemDoPontoProps) {
  const idNome = useId()
  const situacao = textoDaSituacao(ponto)
  const botaoRenomear = useRef<HTMLButtonElement>(null)
  const voltarFoco = useRef(false)

  // Ao sair da edicao (salvar ou cancelar), o foco volta ao botao "Renomear".
  useEffect(() => {
    if (!editando && voltarFoco.current) {
      voltarFoco.current = false
      botaoRenomear.current?.focus()
    }
  }, [editando])

  if (editando) {
    return (
      <li aria-labelledby={idNome} className="px-3 py-3">
        <span id={idNome} className="sr-only">
          {ponto.nome}
        </span>
        <FormularioDoNome
          rotulo={`Novo nome do ${ponto.nome}`}
          valorInicial={ponto.nome}
          textoConfirmar="Salvar"
          enviar={(nome) => renomearPonto(ponto.id, nome)}
          aoConcluir={(renomeado) => {
            voltarFoco.current = true
            aoRenomear(renomeado)
          }}
          aoCancelar={() => {
            voltarFoco.current = true
            aoTerminarEdicao()
          }}
          semAlteracao={(nome) => nome === ponto.nome}
        />
      </li>
    )
  }

  return (
    <li aria-labelledby={idNome} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p id={idNome} className={cn('truncate text-sm font-medium', !ponto.ativo && 'text-muted-foreground')}>
          {ponto.nome}
        </p>
        {situacao && <p className="text-xs text-muted-foreground">{situacao}</p>}
      </div>
      {!ponto.ativo && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Inativo</span>
      )}
      <div className="flex gap-1">
        <Button
          ref={botaoRenomear}
          type="button"
          variant="ghost"
          className={ALTURA_DO_CONTROLE}
          aria-label={`Renomear ${ponto.nome}`}
          onClick={aoEditar}
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          Renomear
        </Button>
        <Button
          type="button"
          variant="outline"
          className={ALTURA_DO_CONTROLE}
          aria-label={`${ponto.ativo ? 'Inativar' : 'Reativar'} ${ponto.nome}`}
          onClick={aoAlterarStatus}
          disabled={alterandoStatus}
        >
          {alterandoStatus && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {ponto.ativo ? 'Inativar' : 'Reativar'}
        </Button>
      </div>
    </li>
  )
}

interface FormularioDoNomeProps {
  rotulo: string
  valorInicial: string
  textoConfirmar: string
  enviar: (nome: string) => Promise<PontoDeCaixa>
  aoConcluir: (ponto: PontoDeCaixa) => void
  aoCancelar: () => void
  /** Nome igual ao atual: so encerra a edicao, sem chamar o servidor. */
  semAlteracao?: (nome: string) => boolean
}

/** Campo do nome em linha (adicionar ou renomear): Enter salva, Esc cancela; foco ao aparecer. */
function FormularioDoNome({
  rotulo,
  valorInicial,
  textoConfirmar,
  enviar,
  aoConcluir,
  aoCancelar,
  semAlteracao,
}: FormularioDoNomeProps) {
  const idCampo = useId()
  const idErro = useId()
  const campoRef = useRef<HTMLInputElement>(null)
  const [nome, setNome] = useState(valorInicial)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    campoRef.current?.focus()
    campoRef.current?.select()
  }, [])

  const mutation = useMutation<PontoDeCaixa, unknown, string>({
    mutationFn: (aparado) => enviar(aparado),
    onSuccess: aoConcluir,
    onError: (falha) => {
      const padrao = 'Não foi possível salvar o ponto. Tente de novo.'
      const { porCampo, geral } = lerErroDoServidor(falha, ['nome'], padrao)
      setErro(porCampo.nome ?? geral ?? padrao)
    },
  })
  const enviando = mutation.isPending

  // Com erro, o foco volta ao campo (depois do envio, quando ele deixa de estar desabilitado).
  useEffect(() => {
    if (erro && !enviando) {
      campoRef.current?.focus()
    }
  }, [erro, enviando])

  const confirmar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (enviando) {
      return
    }
    const aparado = nome.trim()
    if (aparado === '') {
      setErro(MENSAGEM_NOME_VAZIO)
      return
    }
    if (semAlteracao?.(aparado)) {
      aoCancelar()
      return
    }
    setErro(null)
    mutation.mutate(aparado)
  }

  return (
    <form onSubmit={confirmar} noValidate className="flex flex-wrap items-start gap-2">
      <div className="min-w-0 flex-1 basis-56 space-y-1.5">
        <label htmlFor={idCampo} className="sr-only">
          {rotulo}
        </label>
        <Input
          ref={campoRef}
          id={idCampo}
          value={nome}
          onChange={(event) => {
            setNome(event.target.value)
            setErro(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              aoCancelar()
            }
          }}
          placeholder="Ex.: Caixa 2"
          maxLength={TAMANHO_MAXIMO_DO_NOME}
          autoComplete="off"
          disabled={enviando}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? idErro : undefined}
          className={ALTURA_DO_CONTROLE}
        />
        <ErroDoCampo id={idErro} mensagem={erro ?? undefined} />
      </div>
      <Button type="submit" className={ALTURA_DO_CONTROLE} disabled={enviando}>
        {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        {textoConfirmar}
      </Button>
      <Button
        type="button"
        variant="ghost"
        className={ALTURA_DO_CONTROLE}
        onClick={aoCancelar}
        disabled={enviando}
      >
        Cancelar
      </Button>
    </form>
  )
}
