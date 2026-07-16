import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { AlertCircle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { login as loginRequest } from '@/services/authService'
import { HttpError } from '@/services/httpClient'
import type { LoginResponse } from '@/types/auth'

/** Schema de validacao do formulario de login. */
const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Informe o e-mail.')
    .email('Informe um e-mail valido.'),
  senha: z.string().min(1, 'Informe a senha.'),
})

type LoginFormValues = z.infer<typeof loginSchema>

/** Traduz o erro de login em uma mensagem humana, sem detalhe tecnico. */
function mensagemDeErro(erro: unknown): string {
  if (erro instanceof HttpError && erro.status === 0) {
    return 'Não foi possível conectar ao servidor. Tente novamente.'
  }
  // 401 (credenciais invalidas) e qualquer outro caso caem numa mensagem
  // generica, sem expor detalhe interno.
  return 'E-mail ou senha inválidos.'
}

/**
 * Tela de login do Geitus. Layout limpo e centralizado, fora do RootLayout
 * (sem sidebar). Trata loading, erro e validacao de campos.
 */
export function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [erroLogin, setErroLogin] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', senha: '' },
  })

  const mutation = useMutation<LoginResponse, unknown, LoginFormValues>({
    mutationFn: (valores) => loginRequest(valores.email, valores.senha),
    onSuccess: (dados) => {
      login(dados)
      navigate('/', { replace: true })
    },
    onError: (erro) => {
      setErroLogin(mensagemDeErro(erro))
    },
  })

  const aoSubmeter = (valores: LoginFormValues) => {
    setErroLogin(null)
    mutation.mutate(valores)
  }

  const carregando = mutation.isPending

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-lg font-bold text-primary-foreground">
            G
          </span>
          <div>
            <p className="font-brand text-lg font-semibold tracking-tight">Geitus</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Entrar</CardTitle>
            <CardDescription>Acesse sua conta para continuar.</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleSubmit(aoSubmeter)} noValidate className="space-y-4">
              {erroLogin && (
                <div
                  role="alert"
                  className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{erroLogin}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label htmlFor="email" className="text-sm font-medium">
                  E-mail
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@empresa.com"
                  // Foca o e-mail ao montar para agilizar o login (menos cliques).
                  autoFocus
                  disabled={carregando}
                  aria-invalid={errors.email ? true : undefined}
                  aria-describedby={errors.email ? 'email-erro' : undefined}
                  {...register('email')}
                />
                {errors.email && (
                  <p id="email-erro" className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="senha" className="text-sm font-medium">
                  Senha
                </label>
                <Input
                  id="senha"
                  type="password"
                  autoComplete="current-password"
                  placeholder="Sua senha"
                  disabled={carregando}
                  aria-invalid={errors.senha ? true : undefined}
                  aria-describedby={errors.senha ? 'senha-erro' : undefined}
                  {...register('senha')}
                />
                {errors.senha && (
                  <p id="senha-erro" className="text-sm text-destructive">
                    {errors.senha.message}
                  </p>
                )}
              </div>

              <Button type="submit" className="w-full" disabled={carregando}>
                {carregando && <Loader2 className="h-4 w-4 animate-spin" />}
                {carregando ? 'Entrando...' : 'Entrar'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
