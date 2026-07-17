import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import {
  AlertCircle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Users,
  XCircle,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { CampoSenha } from '@/features/usuarios/CampoSenha'
import { HttpError } from '@/services/httpClient'
import {
  atualizarUsuario,
  criarUsuario,
  inativarUsuario,
  listarUsuarios,
  reativarUsuario,
  redefinirSenhaUsuario,
} from '@/services/usuarioService'
import type {
  Perfil,
  PerfilFiltro,
  Usuario,
  UsuarioStatusFiltro,
} from '@/types/usuario'

const USUARIOS_QUERY_KEY = ['usuarios'] as const

const SENHA_MINIMA = 8

const perfilSchema = z.enum(['ADMIN', 'OPERADOR'])

const nomeSchema = z.string().trim()
  .min(1, 'Informe o nome do usuário.')
  .max(150, 'Nome deve ter no máximo 150 caracteres.')

// Na criacao, e-mail e senha sao exigidos e validados. Na edicao esses campos
// nao sao exibidos nem enviados; o schema de edicao os aceita de forma frouxa
// apenas para que ambos os schemas infiram o mesmo tipo de formulario.
const usuarioCriacaoSchema = z.object({
  nome: nomeSchema,
  perfil: perfilSchema,
  email: z.string().trim()
    .min(1, 'Informe o e-mail.')
    .email('Informe um e-mail válido.')
    .max(180, 'E-mail deve ter no máximo 180 caracteres.'),
  senha: z.string()
    .min(SENHA_MINIMA, `Senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`)
    .max(100, 'Senha deve ter no máximo 100 caracteres.'),
})

const usuarioEdicaoSchema = z.object({
  nome: nomeSchema,
  perfil: perfilSchema,
  email: z.string(),
  senha: z.string(),
})

type UsuarioFormValues = z.infer<typeof usuarioCriacaoSchema>

const valoresIniciais: UsuarioFormValues = {
  nome: '',
  email: '',
  senha: '',
  perfil: 'OPERADOR',
}

function valoresDoUsuario(usuario: Usuario): UsuarioFormValues {
  return {
    nome: usuario.nome,
    email: usuario.email,
    senha: '',
    perfil: usuario.perfil,
  }
}

const rotuloPerfil: Record<Perfil, string> = {
  ADMIN: 'Administrador',
  OPERADOR: 'Operador',
}

function formatarData(valor: string | null): string {
  if (!valor) {
    return 'Não informado'
  }
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) {
    return 'Não informado'
  }
  return data.toLocaleDateString('pt-BR')
}

/**
 * Mensagem generica de 409 (conflito de regra de negocio) surfada pelo
 * httpClient quando o backend nao curou um texto proprio. Nesse caso preferimos
 * o fallback contextual da tela ao texto tecnico.
 */
const FALLBACK_409 = 'Requisicao falhou (HTTP 409).'

/** Mensagem amigavel para falhas ao salvar (criar/editar) um usuario. */
function mensagemErroSalvar(erro: unknown, editando: boolean): string {
  if (erro instanceof HttpError) {
    // 409 e um conflito de regra de negocio (e-mail duplicado, rebaixar o
    // ultimo ADMIN, etc.). O backend envia a mensagem exata do motivo; usa-la
    // evita supor "e-mail" para todo 409.
    if (erro.status === 409 && erro.message && erro.message !== FALLBACK_409) {
      return erro.message
    }
    if (erro.status === 400) {
      const mensagensCampos = erro.campos ? Object.values(erro.campos).filter(Boolean) : []
      if (mensagensCampos.length > 0) {
        return mensagensCampos.join(' ')
      }
      if (erro.message && erro.message !== 'Dados invalidos.') {
        return erro.message
      }
      return 'Revise os dados do usuário e tente novamente.'
    }
  }
  return editando
    ? 'Não foi possível salvar as alterações. Tente novamente.'
    : 'Não foi possível criar o usuário. Tente novamente.'
}

/** Mensagem amigavel para falhas ao alterar o status (inativar/reativar). */
function mensagemErroStatus(erro: unknown): string {
  // 409 aqui pode ser "ultimo ADMIN ativo" ou "ADMIN nao inativa a si mesmo":
  // usa a mensagem exata do backend em vez de supor um motivo fixo.
  if (erro instanceof HttpError && erro.status === 409 && erro.message && erro.message !== FALLBACK_409) {
    return erro.message
  }
  return 'Não foi possível alterar o status do usuário. Tente novamente.'
}

/** Pagina de gestao de usuarios da empresa (restrita a ADMIN pelo guard de rota). */
export function UsuariosPage() {
  const queryClient = useQueryClient()
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [status, setStatus] = useState<UsuarioStatusFiltro>('todos')
  const [perfilFiltro, setPerfilFiltro] = useState<PerfilFiltro>('todos')
  const [formularioAberto, setFormularioAberto] = useState(false)
  const [usuarioEmEdicao, setUsuarioEmEdicao] = useState<Usuario | null>(null)
  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null)
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [acaoStatusId, setAcaoStatusId] = useState<number | null>(null)
  const [usuarioSenha, setUsuarioSenha] = useState<Usuario | null>(null)

  const editando = usuarioEmEdicao !== null

  const usuariosQueryKey = useMemo(
    () => [...USUARIOS_QUERY_KEY, { busca: buscaAplicada, status, perfil: perfilFiltro }],
    [buscaAplicada, status, perfilFiltro],
  )

  const {
    data: usuarios = [],
    isPending,
    isError,
    refetch,
  } = useQuery<Usuario[]>({
    queryKey: usuariosQueryKey,
    queryFn: () => listarUsuarios({ busca: buscaAplicada, status, perfil: perfilFiltro }),
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UsuarioFormValues>({
    resolver: zodResolver(editando ? usuarioEdicaoSchema : usuarioCriacaoSchema),
    defaultValues: valoresIniciais,
  })

  useEffect(() => {
    if (usuarioEmEdicao) {
      reset(valoresDoUsuario(usuarioEmEdicao))
      return
    }
    reset(valoresIniciais)
  }, [usuarioEmEdicao, reset])

  const salvarMutation = useMutation<Usuario, unknown, UsuarioFormValues>({
    mutationFn: (valores) => {
      if (usuarioEmEdicao) {
        return atualizarUsuario(usuarioEmEdicao.id, {
          nome: valores.nome.trim(),
          perfil: valores.perfil,
        })
      }
      return criarUsuario({
        nome: valores.nome.trim(),
        email: valores.email.trim(),
        senha: valores.senha,
        perfil: valores.perfil,
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: USUARIOS_QUERY_KEY })
      setMensagemSucesso(editando ? 'Usuário atualizado com sucesso.' : 'Usuário criado com sucesso.')
      setErroSalvar(null)
      setFormularioAberto(false)
      setUsuarioEmEdicao(null)
      reset(valoresIniciais)
    },
    onError: (erro) => {
      setMensagemSucesso(null)
      setErroSalvar(mensagemErroSalvar(erro, editando))
    },
  })

  const statusMutation = useMutation<Usuario, unknown, { usuario: Usuario; proximoAtivo: boolean }>({
    mutationFn: ({ usuario, proximoAtivo }) =>
      proximoAtivo ? reativarUsuario(usuario.id) : inativarUsuario(usuario.id),
    onMutate: ({ usuario }) => {
      setAcaoStatusId(usuario.id)
    },
    onSuccess: async (_, { proximoAtivo }) => {
      await queryClient.invalidateQueries({ queryKey: USUARIOS_QUERY_KEY })
      setErroGeral(null)
      setMensagemSucesso(proximoAtivo ? 'Usuário reativado com sucesso.' : 'Usuário inativado com sucesso.')
    },
    onError: (erro) => {
      setMensagemSucesso(null)
      setErroGeral(mensagemErroStatus(erro))
    },
    onSettled: () => {
      setAcaoStatusId(null)
    },
  })

  const abrirNovoUsuario = () => {
    setUsuarioEmEdicao(null)
    setFormularioAberto(true)
    setMensagemSucesso(null)
    setErroSalvar(null)
    setErroGeral(null)
    reset(valoresIniciais)
  }

  const abrirEdicao = (usuario: Usuario) => {
    setUsuarioEmEdicao(usuario)
    setFormularioAberto(true)
    setMensagemSucesso(null)
    setErroSalvar(null)
    setErroGeral(null)
  }

  const cancelarFormulario = () => {
    setFormularioAberto(false)
    setUsuarioEmEdicao(null)
    setErroSalvar(null)
    reset(valoresIniciais)
  }

  const aplicarBusca = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBuscaAplicada(busca.trim())
  }

  const aoAlterarCampo = () => {
    setMensagemSucesso(null)
    setErroGeral(null)
  }

  const aoSubmeter = (valores: UsuarioFormValues) => {
    setErroSalvar(null)
    setMensagemSucesso(null)
    salvarMutation.mutate(valores)
  }

  const salvando = salvarMutation.isPending

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Gerencie quem tem acesso ao Geitus na sua empresa e o nível de cada pessoa.
          </p>
        </div>

        <Button type="button" onClick={abrirNovoUsuario}>
          <Plus className="h-4 w-4" />
          Novo usuário
        </Button>
      </div>

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

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={aplicarBusca} className="grid gap-3 lg:grid-cols-[1fr_170px_170px_auto]">
            <div className="space-y-1.5">
              <label htmlFor="busca-usuario" className="text-sm font-medium">
                Busca
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="busca-usuario"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Nome ou e-mail"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="status-usuario" className="text-sm font-medium">
                Status
              </label>
              <select
                id="status-usuario"
                value={status}
                onChange={(event) => setStatus(event.target.value as UsuarioStatusFiltro)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="todos">Todos</option>
                <option value="ativos">Ativos</option>
                <option value="inativos">Inativos</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="perfil-filtro" className="text-sm font-medium">
                Perfil
              </label>
              <select
                id="perfil-filtro"
                value={perfilFiltro}
                onChange={(event) => setPerfilFiltro(event.target.value as PerfilFiltro)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="todos">Todos</option>
                <option value="ADMIN">Administrador</option>
                <option value="OPERADOR">Operador</option>
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

      {formularioAberto && (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle>{editando ? 'Editar usuário' : 'Novo usuário'}</CardTitle>
            <CardDescription>
              {editando
                ? 'Atualize o nome e o perfil. Para trocar a senha use "Redefinir senha".'
                : 'Defina os dados de acesso. O usuário nasce ativo e poderá entrar com o e-mail e a senha informados.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(aoSubmeter)} noValidate className="space-y-4">
              {erroSalvar && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{erroSalvar}</span>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <CampoTexto
                  id="nome"
                  label="Nome"
                  erro={errors.nome?.message}
                  inputProps={register('nome', { onChange: aoAlterarCampo })}
                  disabled={salvando}
                />

                {!editando && (
                  <CampoTexto
                    id="email"
                    label="E-mail"
                    erro={errors.email?.message}
                    inputProps={register('email', { onChange: aoAlterarCampo })}
                    disabled={salvando}
                    type="email"
                    placeholder="pessoa@empresa.com"
                  />
                )}

                <div className="space-y-1.5">
                  <label htmlFor="perfil" className="text-sm font-medium">
                    Perfil
                  </label>
                  <select
                    id="perfil"
                    disabled={salvando}
                    aria-invalid={errors.perfil ? true : undefined}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    {...register('perfil', { onChange: aoAlterarCampo })}
                  >
                    <option value="OPERADOR">Operador</option>
                    <option value="ADMIN">Administrador</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Administrador gerencia usuários; operador apenas usa o sistema.
                  </p>
                  {errors.perfil && (
                    <p className="text-sm text-destructive">{errors.perfil.message}</p>
                  )}
                </div>

                {!editando && (
                  <CampoTexto
                    id="senha"
                    label="Senha"
                    erro={errors.senha?.message}
                    inputProps={register('senha', { onChange: aoAlterarCampo })}
                    disabled={salvando}
                    type="password"
                    autoComplete="new-password"
                    placeholder={`Mínimo de ${SENHA_MINIMA} caracteres`}
                  />
                )}
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={cancelarFormulario} disabled={salvando}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={salvando}>
                  {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                  {salvando ? 'Salvando...' : editando ? 'Salvar alterações' : 'Criar usuário'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Lista de usuários</CardTitle>
          <CardDescription>
            {buscaAplicada
              ? `Resultados para "${buscaAplicada}".`
              : 'Usuários com acesso à empresa autenticada.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isPending && (
            <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando usuários...
            </p>
          )}

          {isError && (
            <div className="space-y-3">
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Não foi possível carregar os usuários.</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!isPending && !isError && usuarios.length === 0 && (
            <div className="flex max-w-xl items-start gap-3 rounded-md border border-dashed p-4">
              <Users className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Nenhum usuário encontrado.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Crie o primeiro usuário ou ajuste os filtros da busca.
                </p>
              </div>
            </div>
          )}

          {!isPending && !isError && usuarios.length > 0 && (
            <div className="grid gap-3">
              {usuarios.map((usuario) => (
                <UsuarioItem
                  key={usuario.id}
                  usuario={usuario}
                  onEditar={() => abrirEdicao(usuario)}
                  onRedefinirSenha={() => {
                    setMensagemSucesso(null)
                    setErroGeral(null)
                    setUsuarioSenha(usuario)
                  }}
                  onAlterarStatus={() =>
                    statusMutation.mutate({ usuario, proximoAtivo: !usuario.ativo })
                  }
                  alterandoStatus={acaoStatusId === usuario.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {usuarioSenha && (
        <RedefinirSenhaDialog
          usuario={usuarioSenha}
          onFechar={() => setUsuarioSenha(null)}
          onSucesso={() => {
            setUsuarioSenha(null)
            setMensagemSucesso('Senha redefinida com sucesso.')
          }}
        />
      )}
    </div>
  )
}

interface CampoTextoProps {
  id: keyof UsuarioFormValues
  label: string
  erro?: string
  disabled?: boolean
  placeholder?: string
  type?: string
  autoComplete?: string
  inputProps: UseFormRegisterReturn
}

function CampoTexto({
  id,
  label,
  erro,
  disabled,
  placeholder,
  type = 'text',
  autoComplete,
  inputProps,
}: CampoTextoProps) {
  const erroId = `${id}-erro`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? erroId : undefined}
        {...inputProps}
      />
      {erro && (
        <p id={erroId} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  )
}

interface UsuarioItemProps {
  usuario: Usuario
  onEditar: () => void
  onRedefinirSenha: () => void
  onAlterarStatus: () => void
  alterandoStatus: boolean
}

function UsuarioItem({
  usuario,
  onEditar,
  onRedefinirSenha,
  onAlterarStatus,
  alterandoStatus,
}: UsuarioItemProps) {
  return (
    <article className="rounded-md border p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-base font-medium">{usuario.nome}</h2>
            <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-accent-foreground">
              {rotuloPerfil[usuario.perfil]}
            </span>
            <span
              className={
                usuario.ativo
                  ? 'rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success'
                  : 'rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground'
              }
            >
              {usuario.ativo ? 'Ativo' : 'Inativo'}
            </span>
          </div>

          <dl className="grid gap-x-4 gap-y-1 text-sm text-muted-foreground sm:grid-cols-2">
            <div>
              <dt className="font-medium text-foreground">E-mail</dt>
              <dd className="truncate" title={usuario.email}>{usuario.email}</dd>
            </div>
            <div>
              <dt className="font-medium text-foreground">Criado em</dt>
              <dd>{formatarData(usuario.criadoEm)}</dd>
            </div>
          </dl>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onEditar}>
            <Pencil className="h-4 w-4" />
            Editar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onRedefinirSenha}>
            <KeyRound className="h-4 w-4" />
            Redefinir senha
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAlterarStatus}
            disabled={alterandoStatus}
          >
            {alterandoStatus ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : usuario.ativo ? (
              <XCircle className="h-4 w-4" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            {usuario.ativo ? 'Inativar' : 'Reativar'}
          </Button>
        </div>
      </div>
    </article>
  )
}

const redefinirSenhaSchema = z
  .object({
    novaSenha: z.string()
      .min(SENHA_MINIMA, `Senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`)
      .max(100, 'Senha deve ter no máximo 100 caracteres.'),
    confirmacao: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((valores) => valores.novaSenha === valores.confirmacao, {
    path: ['confirmacao'],
    message: 'A confirmação não confere com a nova senha.',
  })

type RedefinirSenhaFormValues = z.infer<typeof redefinirSenhaSchema>

interface RedefinirSenhaDialogProps {
  usuario: Usuario
  onFechar: () => void
  onSucesso: () => void
}

/** Formulario administrativo para um ADMIN redefinir a senha de outro usuario. */
function RedefinirSenhaDialog({ usuario, onFechar, onSucesso }: RedefinirSenhaDialogProps) {
  const [erro, setErro] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  // Em listas longas o card fica no fim da pagina; ao abrir, traz o formulario
  // a vista e foca o primeiro campo para deixar claro que a acao respondeu.
  useEffect(() => {
    cardRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    document.getElementById('nova-senha-admin')?.focus({ preventScroll: true })
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RedefinirSenhaFormValues>({
    resolver: zodResolver(redefinirSenhaSchema),
    defaultValues: { novaSenha: '', confirmacao: '' },
  })

  const mutation = useMutation<void, unknown, RedefinirSenhaFormValues>({
    mutationFn: (valores) => redefinirSenhaUsuario(usuario.id, { novaSenha: valores.novaSenha }),
    onSuccess: () => onSucesso(),
    onError: () => setErro('Não foi possível redefinir a senha. Tente novamente.'),
  })

  const aoSubmeter = (valores: RedefinirSenhaFormValues) => {
    setErro(null)
    mutation.mutate(valores)
  }

  const salvando = mutation.isPending

  return (
    <Card ref={cardRef} className="max-w-md">
      <CardHeader>
        <CardTitle>Redefinir senha</CardTitle>
        <CardDescription>
          Defina uma nova senha para <span className="font-medium text-foreground">{usuario.nome}</span>.
          A senha atual não é necessária.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(aoSubmeter)} noValidate className="space-y-4">
          {erro && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{erro}</span>
            </div>
          )}

          <CampoSenha
            id="nova-senha-admin"
            label="Nova senha"
            erro={errors.novaSenha?.message}
            inputProps={register('novaSenha')}
            disabled={salvando}
            placeholder={`Mínimo de ${SENHA_MINIMA} caracteres`}
          />
          <CampoSenha
            id="confirmacao-senha-admin"
            label="Confirmar nova senha"
            erro={errors.confirmacao?.message}
            inputProps={register('confirmacao')}
            disabled={salvando}
          />

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onFechar} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {salvando ? 'Salvando...' : 'Redefinir senha'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
