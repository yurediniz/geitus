import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { atualizarMinhaEmpresa, getMinhaEmpresa } from '@/services/empresaService'
import type { Empresa } from '@/types/empresa'

/** Chave de cache da empresa do usuario autenticado. */
const EMPRESA_QUERY_KEY = ['empresa', 'minha'] as const

/** Schema de validacao do formulario de edicao do nome da empresa. */
const empresaSchema = z.object({
  nome: z.string().trim().min(1, 'Informe o nome da empresa.'),
})

type EmpresaFormValues = z.infer<typeof empresaSchema>

/** Formata uma data ISO em formato curto e legivel (dd/mm/aaaa). */
function formatarData(dataIso: string): string {
  const data = new Date(dataIso)
  if (Number.isNaN(data.getTime())) {
    return dataIso
  }
  return data.toLocaleDateString('pt-BR')
}

/**
 * Pagina de empresa: exibe os dados da empresa do usuario autenticado e
 * permite editar o nome. Trata loading, erro, vazio e sucesso.
 */
export function EmpresaPage() {
  const queryClient = useQueryClient()
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [salvoComSucesso, setSalvoComSucesso] = useState(false)

  const {
    data: empresa,
    isPending,
    isError,
    refetch,
  } = useQuery<Empresa>({
    queryKey: EMPRESA_QUERY_KEY,
    queryFn: getMinhaEmpresa,
  })

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EmpresaFormValues>({
    resolver: zodResolver(empresaSchema),
    defaultValues: { nome: '' },
  })

  // Sincroniza o formulario com os dados carregados (ex.: primeira carga ou refetch).
  useEffect(() => {
    if (empresa) {
      reset({ nome: empresa.nome })
    }
  }, [empresa, reset])

  const mutation = useMutation<Empresa, unknown, EmpresaFormValues>({
    mutationFn: (valores) => atualizarMinhaEmpresa(valores.nome),
    onSuccess: (dados) => {
      queryClient.setQueryData(EMPRESA_QUERY_KEY, dados)
      setSalvoComSucesso(true)
    },
    onError: () => {
      setErroSalvar('Não foi possível salvar as alterações. Tente novamente.')
    },
  })

  const aoSubmeter = (valores: EmpresaFormValues) => {
    setErroSalvar(null)
    setSalvoComSucesso(false)
    mutation.mutate(valores)
  }

  const aoAlterarNome = () => {
    setSalvoComSucesso(false)
  }

  const salvando = mutation.isPending

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Empresa</h1>
        <p className="mt-1 text-muted-foreground">
          Dados da empresa vinculada à sua conta.
        </p>
      </div>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Dados da empresa</CardTitle>
          <CardDescription>Atualize o nome exibido no sistema.</CardDescription>
        </CardHeader>

        <CardContent>
          {isPending && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando dados da empresa...
            </p>
          )}

          {isError && (
            <div className="space-y-3">
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Não foi possível carregar os dados da empresa.</span>
              </div>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Tentar novamente
              </Button>
            </div>
          )}

          {!isPending && !isError && !empresa && (
            <p className="text-sm text-muted-foreground">
              Nenhum dado de empresa disponível.
            </p>
          )}

          {!isPending && !isError && empresa && (
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

              {salvoComSucesso && !erroSalvar && (
                <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>Dados salvos com sucesso.</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="nome" className="text-sm font-medium">
                  Nome da empresa
                </label>
                <Input
                  id="nome"
                  autoComplete="organization"
                  disabled={salvando}
                  aria-invalid={errors.nome ? true : undefined}
                  aria-describedby={errors.nome ? 'nome-erro' : undefined}
                  {...register('nome', { onChange: aoAlterarNome })}
                />
                {errors.nome && (
                  <p id="nome-erro" className="text-sm text-destructive">
                    {errors.nome.message}
                  </p>
                )}
              </div>

              <dl className="grid grid-cols-2 gap-2 text-sm">
                <dt className="text-muted-foreground">Status</dt>
                <dd>{empresa.ativo ? 'Ativa' : 'Inativa'}</dd>
                <dt className="text-muted-foreground">Criada em</dt>
                <dd>{formatarData(empresa.criadoEm)}</dd>
              </dl>

              <Button type="submit" disabled={salvando}>
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                {salvando ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
