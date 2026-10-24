import { useEffect, type ReactNode } from 'react'
import { useBlocker } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/** Texto padrao do dialogo; cada tela pode dizer o que foi alterado. */
const DESCRICAO_PADRAO = 'Você fez alterações e ainda não salvou. Se sair agora, as alterações serão perdidas.'

/**
 * Protege alteracoes nao salvas enquanto `ativo`:
 * - navegacao dentro do app (lista, Categorias/Unidades, sidebar) abre o
 *   dialogo "Descartar alteracoes?" via `useBlocker` (exige data router);
 * - fechar ou recarregar a aba usa o aviso nativo (`beforeunload`).
 *
 * So bloqueia troca de caminho: rolar ou usar atalhos dentro da pagina, ou mudar
 * so a query/hash, nao conta. Para sair logo apos salvar, a pagina desativa o aviso
 * e navega no render seguinte (o bloqueio e lido do ultimo render).
 */
export function useAvisoAlteracoesNaoSalvas(
  ativo: boolean,
  descricao: string = DESCRICAO_PADRAO,
): { dialogo: ReactNode } {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => ativo && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!ativo) {
      return
    }
    const avisar = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Navegadores mais antigos so mostram o aviso com returnValue preenchido.
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [ativo])

  const bloqueado = blocker.state === 'blocked'

  const dialogo = (
    <Dialog
      open={bloqueado}
      onOpenChange={(aberto) => {
        if (!aberto && blocker.state === 'blocked') {
          blocker.reset()
        }
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Descartar alterações?</DialogTitle>
          <DialogDescription>{descricao}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* Primeiro botao recebe o foco ao abrir: a acao segura e a padrao. */}
          <Button type="button" variant="outline" onClick={() => blocker.reset?.()}>
            Continuar editando
          </Button>
          <Button type="button" variant="destructive" onClick={() => blocker.proceed?.()}>
            Descartar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )

  return { dialogo }
}
