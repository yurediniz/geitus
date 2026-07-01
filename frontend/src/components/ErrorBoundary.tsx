import { Component, type ErrorInfo, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  temErro: boolean
}

/**
 * Captura erros inesperados de renderizacao da interface e exibe uma mensagem
 * clara, evitando que a aplicacao inteira quebre (tela em branco).
 *
 * Mantido simples de proposito: apenas registra o erro no console, sem enviar
 * para nenhum sistema de logging externo.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { temErro: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { temErro: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Erro inesperado na interface:', error, info)
  }

  private readonly recarregar = () => {
    window.location.reload()
  }

  render() {
    if (this.state.temErro) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
          <div className="max-w-md space-y-4 text-center">
            <h1 className="text-xl font-semibold">Algo deu errado</h1>
            <p className="text-muted-foreground">
              Ocorreu um erro inesperado na interface. Tente recarregar a página.
            </p>
            <Button onClick={this.recarregar}>Recarregar página</Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
