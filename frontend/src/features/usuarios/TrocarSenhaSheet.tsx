import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { z } from 'zod'
import { AlertCircle, CheckCircle2, KeyRound, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { CampoSenha } from '@/features/usuarios/CampoSenha'
import { HttpError } from '@/services/httpClient'
import { alterarPropriaSenha } from '@/services/usuarioService'

const SENHA_MINIMA = 8

const schema = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.'),
    novaSenha: z.string()
      .min(SENHA_MINIMA, `Senha deve ter no mínimo ${SENHA_MINIMA} caracteres.`)
      .max(100, 'Senha deve ter no máximo 100 caracteres.'),
    confirmacao: z.string().min(1, 'Confirme a nova senha.'),
  })
  .refine((valores) => valores.novaSenha === valores.confirmacao, {
    path: ['confirmacao'],
    message: 'A confirmação não confere com a nova senha.',
  })

type FormValues = z.infer<typeof schema>

const valoresIniciais: FormValues = { senhaAtual: '', novaSenha: '', confirmacao: '' }

/** Mensagem amigavel para falhas ao trocar a propria senha. */
function mensagemErro(erro: unknown): string {
  if (erro instanceof HttpError && erro.status === 400) {
    return 'A senha atual está incorreta.'
  }
  return 'Não foi possível trocar a senha. Tente novamente.'
}

/**
 * Painel (Sheet) para o proprio usuario trocar a sua senha. Fica acessivel no
 * rodape de sessao do layout, para qualquer usuario autenticado (nao exige
 * ADMIN). Exige a senha atual e confirma a nova senha antes de enviar.
 */
export function TrocarSenhaSheet() {
  const [aberto, setAberto] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: valoresIniciais,
  })

  // Ao fechar/reabrir o painel, limpa o formulario e as mensagens.
  useEffect(() => {
    if (!aberto) {
      reset(valoresIniciais)
      setErro(null)
      setSucesso(false)
    }
  }, [aberto, reset])

  const mutation = useMutation<void, unknown, FormValues>({
    mutationFn: (valores) =>
      alterarPropriaSenha({ senhaAtual: valores.senhaAtual, novaSenha: valores.novaSenha }),
    onSuccess: () => {
      setErro(null)
      setSucesso(true)
      reset(valoresIniciais)
    },
    onError: (falha) => {
      setSucesso(false)
      setErro(mensagemErro(falha))
    },
  })

  const aoSubmeter = (valores: FormValues) => {
    setErro(null)
    setSucesso(false)
    mutation.mutate(valores)
  }

  const salvando = mutation.isPending

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          <KeyRound className="h-4 w-4" />
          Trocar senha
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Trocar minha senha</SheetTitle>
          <SheetDescription>
            Confirme a senha atual e defina uma nova senha de acesso.
          </SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit(aoSubmeter)} noValidate className="flex flex-1 flex-col gap-4 p-4">
          {sucesso && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>Senha alterada com sucesso.</span>
            </div>
          )}

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
            id="senha-atual"
            label="Senha atual"
            autoComplete="current-password"
            erro={errors.senhaAtual?.message}
            inputProps={register('senhaAtual')}
            disabled={salvando}
          />
          <CampoSenha
            id="nova-senha"
            label="Nova senha"
            erro={errors.novaSenha?.message}
            inputProps={register('novaSenha')}
            disabled={salvando}
            placeholder={`Mínimo de ${SENHA_MINIMA} caracteres`}
          />
          <CampoSenha
            id="confirmar-nova-senha"
            label="Confirmar nova senha"
            erro={errors.confirmacao?.message}
            inputProps={register('confirmacao')}
            disabled={salvando}
          />

          <SheetFooter className="px-0">
            <Button type="submit" disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
              {salvando ? 'Salvando...' : 'Trocar senha'}
            </Button>
            <SheetClose asChild>
              <Button type="button" variant="outline" disabled={salvando}>
                Fechar
              </Button>
            </SheetClose>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  )
}
