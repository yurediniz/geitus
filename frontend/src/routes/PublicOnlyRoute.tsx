import { Navigate, Outlet } from 'react-router-dom'

import { SessionLoading } from '@/components/SessionLoading'
import { useAuth } from '@/hooks/useAuth'

/**
 * Guard das rotas publicas exclusivas (ex.: /login). Enquanto a sessao esta
 * sendo revalidada no boot, mostra um indicador de carregamento (evita piscar
 * o login antes de confirmar se ha sessao valida). Um usuario ja autenticado e
 * redirecionado para a area principal, evitando reexibir o login.
 */
export function PublicOnlyRoute() {
  const { estaAutenticado, carregandoSessao } = useAuth()

  if (carregandoSessao) {
    return <SessionLoading />
  }

  if (estaAutenticado) {
    return <Navigate to="/" replace />
  }

  return <Outlet />
}
