import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  MessageCircle,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Search,
  Users,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ClienteFormulario, type ClienteCampoFormulario } from '@/features/customers/ClienteFormulario'
import { useAuth } from '@/hooks/useAuth'
import { mascararCpf, mascararTelefone } from '@/lib/documentos'
import {
  atualizarCliente,
  cadastrarCliente,
  inativarCliente,
  listarClientes,
  reativarCliente,
} from '@/services/clienteService'
import { HttpError } from '@/services/httpClient'
import type { Cliente, ClienteRequest, ClienteStatusFiltro } from '@/types/cliente'

const CLIENTES_QUERY_KEY = ['clientes'] as const

type ErroCamposCliente = Partial<Record<ClienteCampoFormulario, string>>

/** Falha ao salvar traduzida para a interface: mensagem geral + erros por campo. */
interface ErroSalvarCliente {
  mensagem: string
  campos?: ErroCamposCliente
}

const CAMPOS_DO_FORMULARIO: readonly ClienteCampoFormulario[] = [
  'nome',
  'cpf',
  'telefone',
  'whatsapp',
  'observacoes',
]

function ehCampoDoFormulario(campo: string): campo is ClienteCampoFormulario {
  return (CAMPOS_DO_FORMULARIO as readonly string[]).includes(campo)
}

const MENSAGEM_CPF_DUPLICADO_CAMPO =
  'Já existe um cliente com este CPF. Busque pelo CPF na lista para usar o cadastro existente.'

/** Traduz a falha ao salvar (pt-BR), sem vazar detalhe interno. */
function interpretarErroSalvar(erro: unknown): ErroSalvarCliente {
  if (erro instanceof HttpError) {
    if (erro.status === 409) {
      // CPF duplicado na empresa: mensagem do backend no topo e orientacao no campo CPF.
      const mensagem =
        erro.message && erro.message.trim() !== ''
          ? erro.message
          : 'Já existe um cliente com este CPF nesta empresa.'
      return { mensagem, campos: { cpf: MENSAGEM_CPF_DUPLICADO_CAMPO } }
    }
    if (erro.status === 400) {
      // Campos conhecidos vao para o proprio campo; os demais ficam na mensagem geral.
      const campos: ErroCamposCliente = {}
      const mensagensSemCampo: string[] = []
      for (const [campo, mensagem] of Object.entries(erro.campos ?? {})) {
        if (!mensagem) {
          continue
        }
        if (ehCampoDoFormulario(campo)) {
          campos[campo] = mensagem
        } else {
          mensagensSemCampo.push(mensagem)
        }
      }
      if (mensagensSemCampo.length > 0) {
        return { mensagem: mensagensSemCampo.join(' '), campos }
      }
      if (Object.keys(campos).length > 0) {
        return { mensagem: 'Revise os campos destacados.', campos }
      }
      if (erro.message && erro.message !== 'Dados invalidos.') {
        return { mensagem: erro.message }
      }
      return { mensagem: 'Revise os dados do cliente e tente novamente.' }
    }
  }
  return { mensagem: 'Não foi possível salvar o cliente. Tente novamente.' }
}

function mensagemErroStatus(erro: unknown): string {
  if (erro instanceof HttpError && erro.status === 403) {
    return 'Somente administradores podem inativar ou reativar clientes.'
  }
  return 'Não foi possível alterar o status do cliente. Tente novamente.'
}

/** Pagina do modulo Clientes: lista com busca/filtro e cadastro rapido. */
export function ClientesPage() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const podeAlterarStatus = usuario?.perfil === 'ADMIN'
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [status, setStatus] = useState<ClienteStatusFiltro>('ativos')
  const [formularioAberto, setFormularioAberto] = useState(false)
  const [clienteEmEdicao, setClienteEmEdicao] = useState<Cliente | null>(null)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [erroCamposSalvar, setErroCamposSalvar] = useState<ErroCamposCliente | undefined>(undefined)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [acaoStatusId, setAcaoStatusId] = useState<string | null>(null)

  const clientesQueryKey = useMemo(
    () => [...CLIENTES_QUERY_KEY, { busca: buscaAplicada, status }],
    [buscaAplicada, status],
  )

  const {
    data: clientes = [],
    isPending,
    isError,
    refetch,
  } = useQuery<Cliente[]>({
    queryKey: clientesQueryKey,
    queryFn: () => listarClientes({ busca: buscaAplicada, status }),
  })

  const salvarMutation = useMutation<Cliente, unknown, ClienteRequest>({
    mutationFn: (request) =>
      clienteEmEdicao ? atualizarCliente(clienteEmEdicao.id, request) : cadastrarCliente(request),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CLIENTES_QUERY_KEY })
      setMensagemSucesso(clienteEmEdicao ? 'Cliente atualizado com sucesso.' : 'Cliente cadastrado com sucesso.')
      setErroSalvar(null)
      setErroCamposSalvar(undefined)
      setFormularioAberto(false)
      setClienteEmEdicao(null)
    },
    onError: (erro) => {
      const { mensagem, campos } = interpretarErroSalvar(erro)
      setMensagemSucesso(null)
      setErroSalvar(mensagem)
      setErroCamposSalvar(campos)
    },
  })

  const statusMutation = useMutation<Cliente, unknown, { cliente: Cliente; proximoAtivo: boolean }>({
    mutationFn: ({ cliente, proximoAtivo }) =>
      proximoAtivo ? reativarCliente(cliente.id) : inativarCliente(cliente.id),
    onMutate: ({ cliente }) => {
      setAcaoStatusId(cliente.id)
    },
    onSuccess: async (_, { proximoAtivo }) => {
      await queryClient.invalidateQueries({ queryKey: CLIENTES_QUERY_KEY })
      setErroGeral(null)
      setMensagemSucesso(proximoAtivo ? 'Cliente reativado com sucesso.' : 'Cliente inativado com sucesso.')
    },
    onError: (erro) => {
      setMensagemSucesso(null)
      setErroGeral(mensagemErroStatus(erro))
    },
    onSettled: () => {
      setAcaoStatusId(null)
    },
  })

  const abrirFormulario = (cliente: Cliente | null) => {
    setClienteEmEdicao(cliente)
    setFormularioAberto(true)
    setMensagemSucesso(null)
    setErroSalvar(null)
    setErroCamposSalvar(undefined)
    setErroGeral(null)
  }

  const cancelarFormulario = () => {
    setFormularioAberto(false)
    setClienteEmEdicao(null)
    setErroSalvar(null)
    setErroCamposSalvar(undefined)
  }

  const salvarCliente = (request: ClienteRequest) => {
    setErroSalvar(null)
    setErroCamposSalvar(undefined)
    setMensagemSucesso(null)
    salvarMutation.mutate(request)
  }

  const aplicarBusca = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBuscaAplicada(busca.trim())
  }

  const estadoVazio = textosEstadoVazio(buscaAplicada, status)

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Cadastre quem compra da empresa e encontre rapidamente por nome, CPF ou telefone.
          </p>
        </div>

        <Button type="button" onClick={() => abrirFormulario(null)}>
          <Plus className="h-4 w-4" />
          Novo cliente
        </Button>
      </div>

      {/* Feedback fixo no topo: continua visivel ao agir sobre um cliente no fim da lista. */}
      {(mensagemSucesso || erroGeral) && (
        <div className="sticky top-0 z-10 space-y-2 bg-background py-2">
          {mensagemSucesso && (
            <div
              role="status"
              className="flex max-w-2xl items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{mensagemSucesso}</span>
            </div>
          )}

          {erroGeral && (
            <div
              role="alert"
              className="flex max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{erroGeral}</span>
            </div>
          )}
        </div>
      )}

      {formularioAberto && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>{clienteEmEdicao ? 'Editar cliente' : 'Novo cliente'}</CardTitle>
            <CardDescription>
              Só o nome é obrigatório. Telefone, CPF e observações ajudam a encontrar o cliente depois.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ClienteFormulario
              key={clienteEmEdicao?.id ?? 'novo'}
              cliente={clienteEmEdicao}
              salvando={salvarMutation.isPending}
              erro={erroSalvar}
              erroCampos={erroCamposSalvar}
              onSalvar={salvarCliente}
              onCancelar={cancelarFormulario}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={aplicarBusca} className="grid gap-3 lg:grid-cols-[1fr_180px_auto]">
            <div className="space-y-1.5">
              <label htmlFor="busca-cliente" className="text-sm font-medium">
                Busca
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="busca-cliente"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar por nome, CPF ou telefone"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="status-cliente" className="text-sm font-medium">
                Status
              </label>
              <select
                id="status-cliente"
                value={status}
                onChange={(event) => setStatus(event.target.value as ClienteStatusFiltro)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="ativos">Ativos</option>
                <option value="inativos">Inativos</option>
                <option value="todos">Todos</option>
              </select>
            </div>

            <div className="flex items-end">
              <Button type="submit" variant="outline" className="w-full lg:w-auto">
                Buscar
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lista de clientes</CardTitle>
          <CardDescription>
            {buscaAplicada ? `Resultados para "${buscaAplicada}".` : 'Clientes cadastrados na empresa.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando clientes...
            </p>
          )}

          {isError && (
            <div className="space-y-3">
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Não foi possível carregar os clientes.</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!isPending && !isError && clientes.length === 0 && (
            <div className="flex max-w-xl items-start gap-3 rounded-md border border-dashed p-4">
              <Users className="mt-0.5 h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">{estadoVazio.titulo}</p>
                <p className="mt-1 text-sm text-muted-foreground">{estadoVazio.texto}</p>
                <Button type="button" size="sm" className="mt-3" onClick={() => abrirFormulario(null)}>
                  <Plus className="h-4 w-4" />
                  Cadastrar cliente
                </Button>
              </div>
            </div>
          )}

          {!isPending && !isError && clientes.length > 0 && (
            <div className="grid gap-3">
              {clientes.map((cliente) => (
                <ClienteItem
                  key={cliente.id}
                  cliente={cliente}
                  podeAlterarStatus={podeAlterarStatus}
                  onEditar={() => abrirFormulario(cliente)}
                  onAlterarStatus={() =>
                    statusMutation.mutate({ cliente, proximoAtivo: !cliente.ativo })
                  }
                  alterandoStatus={acaoStatusId === cliente.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Textos do estado vazio conforme busca e filtro de status. */
function textosEstadoVazio(busca: string, status: ClienteStatusFiltro): { titulo: string; texto: string } {
  if (busca === '' && status === 'ativos') {
    return {
      titulo: 'Nenhum cliente ativo.',
      texto: 'Cadastre um cliente — só o nome já basta — ou troque o filtro para ver os inativos.',
    }
  }
  if (busca === '' && status === 'todos') {
    return {
      titulo: 'Nenhum cliente cadastrado ainda.',
      texto: 'Cadastre o primeiro cliente — só o nome já basta.',
    }
  }
  return {
    titulo: 'Nenhum cliente encontrado.',
    texto: 'Confira o termo digitado ou ajuste o filtro de status.',
  }
}

/** Selo que indica qual numero do cliente e o WhatsApp (texto + icone, nao so cor). */
function SeloWhatsapp() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
      <MessageCircle className="h-3 w-3" aria-hidden="true" />
      WhatsApp
    </span>
  )
}

interface ClienteItemProps {
  cliente: Cliente
  podeAlterarStatus: boolean
  onEditar: () => void
  onAlterarStatus: () => void
  alterandoStatus: boolean
}

function ClienteItem({ cliente, podeAlterarStatus, onEditar, onAlterarStatus, alterandoStatus }: ClienteItemProps) {
  const telefoneEhWhatsapp = cliente.telefone !== null && cliente.whatsapp === cliente.telefone
  const whatsappProprio = !telefoneEhWhatsapp && cliente.whatsapp !== null ? cliente.whatsapp : null

  return (
    <article className="rounded-md border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-medium">{cliente.nome}</h2>
            <span
              className={
                cliente.ativo
                  ? 'rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
                  : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
              }
            >
              {cliente.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </div>

          <dl className="grid gap-x-6 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2 xl:grid-cols-3">
            {cliente.telefone && (
              <div>
                <dt className="sr-only">Telefone</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="tabular-nums text-foreground">{mascararTelefone(cliente.telefone)}</span>
                  {telefoneEhWhatsapp && <SeloWhatsapp />}
                </dd>
              </div>
            )}
            {whatsappProprio && (
              <div>
                <dt className="sr-only">WhatsApp</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span className="tabular-nums text-foreground">{mascararTelefone(whatsappProprio)}</span>
                  <SeloWhatsapp />
                </dd>
              </div>
            )}
            {cliente.cpf && (
              <div className="flex items-center gap-2">
                <dt>CPF</dt>
                <dd className="tabular-nums text-foreground">{mascararCpf(cliente.cpf)}</dd>
              </div>
            )}
          </dl>

          {cliente.observacoes && (
            <p className="line-clamp-2 max-w-prose text-sm text-muted-foreground">{cliente.observacoes}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onEditar}
            aria-label={`Editar ${cliente.nome}`}
          >
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          {podeAlterarStatus && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onAlterarStatus}
              disabled={alterandoStatus}
              aria-label={`${cliente.ativo ? 'Inativar' : 'Reativar'} ${cliente.nome}`}
            >
              {alterandoStatus ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : cliente.ativo ? (
                <XCircle className="h-4 w-4" />
              ) : (
                <RotateCcw className="h-4 w-4" />
              )}
              {cliente.ativo ? 'Inativar' : 'Reativar'}
            </Button>
          )}
        </div>
      </div>
    </article>
  )
}
