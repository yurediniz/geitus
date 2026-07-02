import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { getMe } from '@/services/authService'
import { setUnauthorizedHandler } from '@/services/httpClient'
import {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from '@/services/tokenStorage'
import type { LoginResponse, Usuario } from '@/types/auth'

/**
 * Estado e acoes de autenticacao expostos pela aplicacao.
 *
 * Optou-se por um Context simples (sem Zustand): o estado de auth e pequeno,
 * lido em poucos pontos e nao exige a maquinaria de uma store global.
 */
interface AuthContextValue {
  token: string | null
  usuario: Usuario | null
  estaAutenticado: boolean
  /** Registra o resultado de um login bem-sucedido (token + usuario). */
  login: (dados: LoginResponse) => void
  /** Limpa a sessao (token + usuario). */
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

interface AuthProviderProps {
  children: ReactNode
  /** Ponto de extensao para testes: injeta um redirecionamento no 401. */
  onUnauthorized?: () => void
}

/**
 * Provedor de autenticacao. Inicializa o token a partir do armazenamento e
 * mantem o usuario da sessao em memoria.
 */
export function AuthProvider({ children, onUnauthorized }: AuthProviderProps) {
  const [token, setToken] = useState<string | null>(() => getStoredToken())
  const [usuario, setUsuario] = useState<Usuario | null>(null)

  const logout = useCallback(() => {
    clearStoredToken()
    setToken(null)
    setUsuario(null)
  }, [])

  const login = useCallback((dados: LoginResponse) => {
    setStoredToken(dados.token)
    setToken(dados.token)
    setUsuario(dados.usuario)
  }, [])

  // Registra no httpClient a acao para 401 em chamadas autenticadas:
  // limpar a sessao e (opcionalmente) redirecionar para /login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout()
      onUnauthorized?.()
    })
    return () => setUnauthorizedHandler(null)
  }, [logout, onUnauthorized])

  // Reidrata o usuario apos um F5: com token no armazenamento mas sem usuario
  // em memoria, busca o usuario via GET /api/auth/me. O ref garante que a
  // chamada ocorra uma unica vez, evitando loops de re-render / requisicoes
  // repetidas. Em caso de falha (ex.: token invalido/expirado), faz logout —
  // um 401 ja dispara o mesmo fluxo pelo handler de nao-autorizado.
  const reidratacaoIniciada = useRef(false)
  useEffect(() => {
    if (!token || usuario || reidratacaoIniciada.current) {
      return
    }
    reidratacaoIniciada.current = true

    let cancelado = false
    getMe()
      .then((dados) => {
        if (!cancelado) {
          setUsuario(dados)
        }
      })
      .catch(() => {
        // Falha ao reidratar: sessao invalida. Limpa o token de forma segura.
        logout()
      })

    return () => {
      cancelado = true
    }
  }, [token, usuario, logout])

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      usuario,
      estaAutenticado: token !== null,
      login,
      logout,
    }),
    [token, usuario, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/** Acessa o contexto de autenticacao. Deve estar dentro de <AuthProvider>. */
export function useAuth(): AuthContextValue {
  const contexto = useContext(AuthContext)
  if (contexto === null) {
    throw new Error('useAuth deve ser usado dentro de <AuthProvider>.')
  }
  return contexto
}
