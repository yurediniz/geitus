import { Link, Outlet } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'

import { SessionLoading } from '@/components/SessionLoading'
import { useAuth } from '@/hooks/useAuth'

/**
 * Guard das rotas restritas a ADMIN (ex.: gestao de usuarios).
 *
 * Assume-se aninhado sob o ProtectedRoute (sessao ja garantida). Enquanto a
 * sessao ainda esta sendo revalidada no boot, mostra o indicador de
 * carregamento. Um usuario autenticado sem perfil ADMIN nao e redirecionado
 * para o login (ele esta logado): recebe uma mensagem clara de acesso restrito
 * dentro do layout, sem quebrar a navegacao.
 */
export function AdminRoute() {
  const { usuario, carregandoSessao } = useAuth()

  if (carregandoSessao) {
    return <SessionLoading />
  }

  if (usuario?.perfil !== 'ADMIN') {
    return <AcessoRestrito />
  }

  return <Outlet />
}

/** Estado amigavel exibido quando um usuario sem permissao acessa uma area de ADMIN. */
function AcessoRestrito() {
  return (
    <div className="flex max-w-xl items-start gap-3 rounded-md border border-dashed p-6">
      <ShieldAlert className="mt-0.5 h-6 w-6 shrink-0 text-muted-foreground" />
      <div className="space-y-1">
        <h1 className="text-lg font-semibold tracking-tight">Acesso restrito</h1>
        <p className="text-sm text-muted-foreground">
          Esta área é exclusiva para administradores. Fale com um administrador da sua empresa
          se você precisa de acesso.
        </p>
        <Link to="/" className="inline-block pt-1 text-sm text-primary underline underline-offset-4">
          Voltar para o início
        </Link>
      </div>
    </div>
  )
}
