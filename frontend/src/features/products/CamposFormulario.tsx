import type { ReactNode } from 'react'
import type { UseFormRegisterReturn } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { AlertCircle } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import type { OpcaoUnidade, ProdutoFormValues } from '@/features/products/produtoFormulario'

/**
 * Asterisco dos campos obrigatorios. O "*" e so visual; leitores de tela ouvem
 * "obrigatório" no nome do campo (sem `aria-required`, para nao anunciar duas vezes).
 */
export function MarcaObrigatorio() {
  return (
    <>
      <span className="ml-0.5 text-destructive" aria-hidden="true">
        *
      </span>
      <span className="sr-only"> (obrigatório)</span>
    </>
  )
}

/** Junta os ids de ajuda/erro presentes para o `aria-describedby`. */
function idsDescricao(...ids: (string | false | undefined)[]): string | undefined {
  const presentes = ids.filter((id): id is string => Boolean(id))
  return presentes.length > 0 ? presentes.join(' ') : undefined
}

/** Mensagem de erro sob o campo (ligada ao campo por `aria-describedby`). */
export function ErroDoCampo({ id, mensagem }: { id: string; mensagem?: string }) {
  if (!mensagem) {
    return null
  }
  return (
    <p id={id} className="text-sm text-destructive">
      {mensagem}
    </p>
  )
}

interface CampoTextoProps {
  id: keyof ProdutoFormValues
  label: string
  obrigatorio?: boolean
  erro?: string
  /** Texto de apoio sob o campo (ex.: "1 CX = 12 UN" ou a previa do nome curto). */
  ajuda?: ReactNode
  disabled?: boolean
  placeholder?: string
  type?: string
  step?: string
  min?: string
  maxLength?: number
  inputProps: UseFormRegisterReturn
}

export function CampoTexto({
  id,
  label,
  obrigatorio = false,
  erro,
  ajuda,
  disabled,
  placeholder,
  type = 'text',
  step,
  min,
  maxLength,
  inputProps,
}: CampoTextoProps) {
  const erroId = `${id}-erro`
  const ajudaId = `${id}-ajuda`
  const temAjuda = ajuda !== undefined && ajuda !== null && ajuda !== ''
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {obrigatorio && <MarcaObrigatorio />}
      </label>
      <Input
        id={id}
        type={type}
        step={step}
        min={min}
        maxLength={maxLength}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={erro ? true : undefined}
        aria-describedby={idsDescricao(temAjuda && ajudaId, erro && erroId)}
        {...inputProps}
      />
      {temAjuda && (
        <p id={ajudaId} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      )}
      <ErroDoCampo id={erroId} mensagem={erro} />
    </div>
  )
}

interface CampoSelectProps {
  id: keyof ProdutoFormValues
  label: string
  obrigatorio?: boolean
  erro?: string
  disabled?: boolean
  /** Rotulo da opcao de valor vazio (placeholder ou "nenhuma"). */
  opcaoVazia: string
  opcoes: OpcaoUnidade[]
  selectProps: UseFormRegisterReturn
}

export function CampoSelect({
  id,
  label,
  obrigatorio = false,
  erro,
  disabled,
  opcaoVazia,
  opcoes,
  selectProps,
}: CampoSelectProps) {
  const erroId = `${id}-erro`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {obrigatorio && <MarcaObrigatorio />}
      </label>
      <NativeSelect
        id={id}
        disabled={disabled}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? erroId : undefined}
        {...selectProps}
      >
        <option value="">{opcaoVazia}</option>
        {opcoes.map((opcao) => (
          <option key={opcao.id} value={opcao.id}>
            {opcao.rotulo}
          </option>
        ))}
      </NativeSelect>
      <ErroDoCampo id={erroId} mensagem={erro} />
    </div>
  )
}

interface AvisoCatalogoProps {
  carregouComFalha: boolean
  mensagemFalha: string
  onTentarNovamente: () => void
  semOpcoes?: boolean
  mensagemSemOpcoes?: string
  linkSemOpcoes?: { to: string; rotulo: string }
}

/** Falha ao carregar um cadastro do catalogo (com nova tentativa) ou cadastro vazio. */
export function AvisoCatalogo({
  carregouComFalha,
  mensagemFalha,
  onTentarNovamente,
  semOpcoes = false,
  mensagemSemOpcoes,
  linkSemOpcoes,
}: AvisoCatalogoProps) {
  if (carregouComFalha) {
    return (
      <p role="alert" className="flex flex-wrap items-center gap-x-2 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{mensagemFalha}</span>
        <button
          type="button"
          onClick={onTentarNovamente}
          className="font-medium underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Tentar novamente
        </button>
      </p>
    )
  }
  if (semOpcoes && mensagemSemOpcoes) {
    return (
      <p className="text-sm text-muted-foreground">
        {mensagemSemOpcoes}{' '}
        {linkSemOpcoes && (
          <Link to={linkSemOpcoes.to} className="font-medium text-foreground underline underline-offset-4">
            {linkSemOpcoes.rotulo}
          </Link>
        )}
      </p>
    )
  }
  return null
}

/** Grupo de campos com titulo e descricao curta (separado por fundo, sem borda). */
export function GrupoCampos({
  titulo,
  descricao,
  children,
}: {
  titulo: string
  descricao?: string
  children: ReactNode
}) {
  return (
    <section className="space-y-4 rounded-md bg-muted/40 p-4">
      <div>
        <h3 className="text-sm font-medium">{titulo}</h3>
        {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
      </div>
      {children}
    </section>
  )
}
