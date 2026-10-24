import { useId, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react'
import { Check, Loader2, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { nomeDaArvoreSchema } from '@/features/catalog/catalogoSchemas'

interface FormularioNomeDaArvoreProps {
  /** Rotulo acessivel do campo (ex.: "Nome da subcategoria de Ração"). */
  rotulo: string
  /** Nome do item no singular ("categoria", "marca"), para a mensagem de nome vazio. */
  singular: string
  valorInicial?: string
  placeholder?: string
  textoSalvar: string
  salvando: boolean
  /** Erro vindo do backend (ex.: nome repetido no mesmo nivel). */
  erro: string | null
  onSalvar: (nome: string) => void
  onCancelar: () => void
  /** Chamado a cada digitacao, para a tela limpar o erro do backend ja exibido. */
  onAlterar?: () => void
}

/**
 * Campo unico de nome usado para criar o item principal, adicionar um subitem
 * e renomear, sempre inline, nas arvores de categorias e de marcas. Enter
 * salva e Esc cancela.
 */
export function FormularioNomeDaArvore({
  rotulo,
  singular,
  valorInicial = '',
  placeholder,
  textoSalvar,
  salvando,
  erro,
  onSalvar,
  onCancelar,
  onAlterar,
}: FormularioNomeDaArvoreProps) {
  const id = useId()
  const erroId = `${id}-erro`
  const [nome, setNome] = useState(valorInicial)
  const [erroLocal, setErroLocal] = useState<string | null>(null)
  const mensagemErro = erroLocal ?? erro
  const schema = useMemo(() => nomeDaArvoreSchema(singular), [singular])

  const aoSubmeter = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const resultado = schema.safeParse(nome)
    if (!resultado.success) {
      setErroLocal(resultado.error.issues[0]?.message ?? 'Nome inválido.')
      return
    }
    setErroLocal(null)
    onSalvar(resultado.data)
  }

  const aoTeclar = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onCancelar()
    }
  }

  return (
    <form onSubmit={aoSubmeter} noValidate className="flex w-full min-w-0 flex-col gap-1.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Input
          id={id}
          autoFocus
          value={nome}
          maxLength={100}
          placeholder={placeholder}
          disabled={salvando}
          aria-label={rotulo}
          aria-invalid={mensagemErro ? true : undefined}
          aria-describedby={mensagemErro ? erroId : undefined}
          onChange={(event) => {
            setNome(event.target.value)
            setErroLocal(null)
            if (erro) {
              onAlterar?.()
            }
          }}
          onKeyDown={aoTeclar}
          className="h-9 min-w-48 flex-1 bg-card"
        />
        <Button type="submit" size="sm" className="h-9" disabled={salvando}>
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {textoSalvar}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={onCancelar} disabled={salvando}>
          <X className="h-4 w-4" />
          Cancelar
        </Button>
      </div>
      {mensagemErro && (
        <p id={erroId} role="alert" className="text-sm text-destructive">
          {mensagemErro}
        </p>
      )}
    </form>
  )
}
