import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, Loader2, Pencil, Plus, Ruler, RotateCcw, Trash2, XCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  PRODUTOS_QUERY_KEY,
  UNIDADES_QUERY_KEY,
  mensagemErroCatalogo,
} from '@/features/catalog/catalogoQuery'
import { ConfirmarExclusaoDialog } from '@/features/catalog/ConfirmarExclusaoDialog'
import { AvisoSomenteLeitura, FeedbackCatalogo } from '@/features/catalog/FeedbackCatalogo'
import { UnidadeFormulario, type UnidadeCampoFormulario } from '@/features/catalog/UnidadeFormulario'
import { CatalogoNav } from '@/features/products/CatalogoNav'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { HttpError } from '@/services/httpClient'
import {
  atualizarUnidade,
  cadastrarUnidade,
  excluirUnidade,
  inativarUnidade,
  listarUnidades,
  reativarUnidade,
} from '@/services/unidadeService'
import type { UnidadeMedida, UnidadeMedidaRequest } from '@/types/catalogo'

const LISTA_QUERY_KEY = [...UNIDADES_QUERY_KEY, 'todas'] as const

const CAMPOS_DO_FORMULARIO: readonly UnidadeCampoFormulario[] = ['sigla', 'descricao', 'fracionada']

function ehCampoDoFormulario(campo: string): campo is UnidadeCampoFormulario {
  return (CAMPOS_DO_FORMULARIO as readonly string[]).includes(campo)
}

const TEXTOS_ERRO = {
  naoEncontrado: 'Esta unidade não existe mais. A lista foi atualizada.',
  semPermissao: 'Somente administradores podem gerenciar unidades.',
}

function textoEmUso(quantidade: number): string {
  return `Em uso por ${quantidade} produto(s)`
}

/** Tela de Unidades de medida (/produtos/unidades). */
export function UnidadesPage() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const podeGerenciar = usuario?.perfil === 'ADMIN'
  const [formularioAberto, setFormularioAberto] = useState(false)
  const [unidadeEmEdicao, setUnidadeEmEdicao] = useState<UnidadeMedida | null>(null)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [erroCampos, setErroCampos] = useState<Partial<Record<UnidadeCampoFormulario, string>>>()
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [acaoStatusId, setAcaoStatusId] = useState<string | null>(null)
  const [unidadeParaExcluir, setUnidadeParaExcluir] = useState<UnidadeMedida | null>(null)

  const { data: unidades = [], isPending, isError, refetch } = useQuery<UnidadeMedida[]>({
    queryKey: LISTA_QUERY_KEY,
    queryFn: () => listarUnidades(),
  })

  const atualizarCaches = async (incluirProdutos: boolean) => {
    await queryClient.invalidateQueries({ queryKey: UNIDADES_QUERY_KEY })
    if (incluirProdutos) {
      await queryClient.invalidateQueries({ queryKey: PRODUTOS_QUERY_KEY })
    }
  }

  const tratarNaoEncontrada = async (erro: unknown) => {
    if (erro instanceof HttpError && erro.status === 404) {
      await queryClient.invalidateQueries({ queryKey: UNIDADES_QUERY_KEY })
    }
  }

  const salvarMutation = useMutation<UnidadeMedida, unknown, UnidadeMedidaRequest>({
    mutationFn: (dados) =>
      unidadeEmEdicao ? atualizarUnidade(unidadeEmEdicao.id, dados) : cadastrarUnidade(dados),
    onSuccess: async (unidade) => {
      await atualizarCaches(unidadeEmEdicao !== null)
      setMensagemSucesso(
        unidadeEmEdicao
          ? `Unidade ${unidade.sigla} atualizada com sucesso.`
          : `Unidade ${unidade.sigla} cadastrada com sucesso.`,
      )
      setFormularioAberto(false)
      setUnidadeEmEdicao(null)
    },
    onError: async (erro) => {
      const campos: Partial<Record<UnidadeCampoFormulario, string>> = {}
      if (erro instanceof HttpError && erro.status === 400) {
        for (const [campo, mensagem] of Object.entries(erro.campos ?? {})) {
          if (ehCampoDoFormulario(campo)) {
            campos[campo] = mensagem
          }
        }
      }
      if (Object.keys(campos).length > 0) {
        setErroCampos(campos)
        setErroSalvar('Revise os campos destacados.')
      } else {
        setErroSalvar(
          mensagemErroCatalogo(erro, {
            ...TEXTOS_ERRO,
            padrao: 'Não foi possível salvar a unidade. Tente novamente.',
          }),
        )
      }
      await tratarNaoEncontrada(erro)
    },
  })

  const statusMutation = useMutation<UnidadeMedida, unknown, UnidadeMedida>({
    mutationFn: (unidade) => (unidade.ativo ? inativarUnidade(unidade.id) : reativarUnidade(unidade.id)),
    onMutate: (unidade) => {
      setAcaoStatusId(unidade.id)
      setMensagemSucesso(null)
      setErroGeral(null)
    },
    onSuccess: async (atualizada) => {
      await atualizarCaches(false)
      setMensagemSucesso(
        atualizada.ativo
          ? `Unidade ${atualizada.sigla} reativada.`
          : `Unidade ${atualizada.sigla} inativada. Ela deixa de aparecer em novos cadastros.`,
      )
    },
    onError: async (erro) => {
      setErroGeral(
        mensagemErroCatalogo(erro, {
          ...TEXTOS_ERRO,
          padrao: 'Não foi possível alterar o status da unidade. Tente novamente.',
        }),
      )
      await tratarNaoEncontrada(erro)
    },
    onSettled: () => setAcaoStatusId(null),
  })

  const excluirMutation = useMutation<void, unknown, UnidadeMedida>({
    mutationFn: (unidade) => excluirUnidade(unidade.id),
    onSuccess: async (_, unidade) => {
      await atualizarCaches(false)
      setMensagemSucesso(`Unidade ${unidade.sigla} excluída.`)
    },
    onError: async (erro) => {
      // 409 (unidade passou a ser usada): a mensagem do backend explica e sugere inativar.
      setErroGeral(
        mensagemErroCatalogo(erro, {
          ...TEXTOS_ERRO,
          padrao: 'Não foi possível excluir a unidade. Tente novamente.',
        }),
      )
      await tratarNaoEncontrada(erro)
      if (erro instanceof HttpError && erro.status === 409) {
        await queryClient.invalidateQueries({ queryKey: UNIDADES_QUERY_KEY })
      }
    },
    onSettled: () => setUnidadeParaExcluir(null),
  })

  const limparFeedback = () => {
    setMensagemSucesso(null)
    setErroGeral(null)
    setErroSalvar(null)
    setErroCampos(undefined)
  }

  const abrirFormulario = (unidade: UnidadeMedida | null) => {
    limparFeedback()
    setUnidadeEmEdicao(unidade)
    setFormularioAberto(true)
  }

  const cancelarFormulario = () => {
    setFormularioAberto(false)
    setUnidadeEmEdicao(null)
    setErroSalvar(null)
    setErroCampos(undefined)
  }

  const salvar = (dados: UnidadeMedidaRequest) => {
    limparFeedback()
    salvarMutation.mutate(dados)
  }

  const pedirExclusao = (unidade: UnidadeMedida) => {
    limparFeedback()
    setUnidadeParaExcluir(unidade)
  }

  return (
    <div className="space-y-6">
      <CatalogoNav />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Unidades de medida</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Como cada produto é vendido e comprado: unidade, quilo, litro, caixa...
          </p>
        </div>

        {podeGerenciar && (
          <Button type="button" onClick={() => abrirFormulario(null)}>
            <Plus className="h-4 w-4" />
            Nova unidade
          </Button>
        )}
      </div>

      {!podeGerenciar && (
        <AvisoSomenteLeitura texto="Somente administradores podem gerenciar unidades. Você está no modo leitura." />
      )}

      <FeedbackCatalogo sucesso={mensagemSucesso} erro={erroGeral} />

      {podeGerenciar && formularioAberto && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>
              {unidadeEmEdicao ? `Editar unidade ${unidadeEmEdicao.sigla}` : 'Nova unidade'}
            </CardTitle>
            <CardDescription>
              A sigla aparece no produto e no PDV; a descrição ajuda a escolher a unidade certa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UnidadeFormulario
              key={unidadeEmEdicao?.id ?? 'nova'}
              unidade={unidadeEmEdicao}
              salvando={salvarMutation.isPending}
              erro={erroSalvar}
              erroCampos={erroCampos}
              onSalvar={salvar}
              onCancelar={cancelarFormulario}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Unidades cadastradas</CardTitle>
          <CardDescription>
            Unidades inativas continuam válidas nos produtos que já as usam, mas não aparecem em novos cadastros.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando unidades...
            </p>
          )}

          {isError && (
            <div className="space-y-3">
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Não foi possível carregar as unidades.</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!isPending && !isError && unidades.length === 0 && (
            <div className="flex max-w-xl items-start gap-3 rounded-md border border-dashed p-4">
              <Ruler className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">Nenhuma unidade cadastrada.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {podeGerenciar
                    ? 'Cadastre as unidades usadas pelos produtos, como UN, KG ou CX.'
                    : 'Peça a um administrador para cadastrar as unidades usadas pelos produtos.'}
                </p>
                {podeGerenciar && (
                  <Button type="button" size="sm" className="mt-3" onClick={() => abrirFormulario(null)}>
                    <Plus className="h-4 w-4" />
                    Cadastrar unidade
                  </Button>
                )}
              </div>
            </div>
          )}

          {!isPending && !isError && unidades.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-4 font-medium">Sigla</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Descrição</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Fracionada</th>
                    <th scope="col" className="py-2 pr-4 text-right font-medium">Em uso</th>
                    <th scope="col" className="py-2 pr-4 font-medium">Status</th>
                    {podeGerenciar && (
                      <th scope="col" className="py-2 text-right font-medium">
                        <span className="sr-only">Ações</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {unidades.map((unidade) => (
                    <UnidadeLinha
                      key={unidade.id}
                      unidade={unidade}
                      podeGerenciar={podeGerenciar}
                      alterandoStatus={acaoStatusId === unidade.id}
                      onEditar={() => abrirFormulario(unidade)}
                      onAlterarStatus={() => statusMutation.mutate(unidade)}
                      onExcluir={() => pedirExclusao(unidade)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ConfirmarExclusaoDialog
        aberto={unidadeParaExcluir !== null}
        titulo={`Excluir a unidade ${unidadeParaExcluir?.sigla ?? ''}?`}
        descricao="A unidade será removida do cadastro. Esta ação não pode ser desfeita."
        excluindo={excluirMutation.isPending}
        onConfirmar={() => unidadeParaExcluir && excluirMutation.mutate(unidadeParaExcluir)}
        onCancelar={() => setUnidadeParaExcluir(null)}
      />
    </div>
  )
}

interface UnidadeLinhaProps {
  unidade: UnidadeMedida
  podeGerenciar: boolean
  alterandoStatus: boolean
  onEditar: () => void
  onAlterarStatus: () => void
  onExcluir: () => void
}

function UnidadeLinha({
  unidade,
  podeGerenciar,
  alterandoStatus,
  onEditar,
  onAlterarStatus,
  onExcluir,
}: UnidadeLinhaProps) {
  const emUso = unidade.emUso > 0
  const dicaEmUsoId = `unidade-${unidade.id}-em-uso`

  return (
    <tr className={cn('border-b last:border-0', !unidade.ativo && 'text-muted-foreground')}>
      <td className="py-3 pr-4 font-semibold">{unidade.sigla}</td>
      <td className="py-3 pr-4">{unidade.descricao}</td>
      <td className="py-3 pr-4">{unidade.fracionada ? 'Sim' : 'Não'}</td>
      <td className="py-3 pr-4 text-right tabular-nums">{unidade.emUso}</td>
      <td className="py-3 pr-4">
        <span
          className={
            unidade.ativo
              ? 'rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
              : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
          }
        >
          {unidade.ativo ? 'Ativa' : 'Inativa'}
        </span>
      </td>
      {podeGerenciar && (
        <td className="py-2">
          <div className="flex justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 md:size-9"
              onClick={onEditar}
              aria-label={`Editar ${unidade.sigla}`}
              title="Editar"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 md:size-9"
              onClick={onAlterarStatus}
              disabled={alterandoStatus}
              aria-label={`${unidade.ativo ? 'Inativar' : 'Reativar'} ${unidade.sigla}`}
              title={unidade.ativo ? 'Inativar' : 'Reativar'}
            >
              {alterandoStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : unidade.ativo ? (
                <XCircle className="h-4 w-4" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
            </Button>
            {/* Botao desabilitado nao recebe hover: a dica fica no wrapper e no aria-describedby. */}
            <span title={emUso ? textoEmUso(unidade.emUso) : 'Excluir'} className="inline-flex">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 text-destructive hover:text-destructive md:size-9"
                onClick={onExcluir}
                disabled={emUso}
                aria-label={`Excluir ${unidade.sigla}`}
                aria-describedby={emUso ? dicaEmUsoId : undefined}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </span>
            {emUso && (
              <span id={dicaEmUsoId} className="sr-only">
                {textoEmUso(unidade.emUso)}
              </span>
            )}
          </div>
        </td>
      )}
    </tr>
  )
}
