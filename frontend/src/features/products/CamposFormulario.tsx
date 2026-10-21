import type { HTMLAttributes, ReactNode } from 'react'
import { Controller, useFormContext, useWatch, type UseFormRegisterReturn } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { AlertCircle, TriangleAlert } from 'lucide-react'

import { CampoMoeda } from '@/components/ui/campo-moeda'
import { Input } from '@/components/ui/input'
import { NativeSelect } from '@/components/ui/native-select'
import {
  textoAbaixoDoCusto,
  type OpcaoUnidade,
  type ProdutoFormValues,
} from '@/features/products/produtoFormulario'

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
  /** Teclado do celular (ex.: "decimal" nas quantidades, que aceitam virgula). */
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
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
  inputMode,
  inputProps,
}: CampoTextoProps) {
  return (
    <EstruturaCampo id={id} label={label} obrigatorio={obrigatorio} erro={erro} ajuda={ajuda}>
      {(ariaDescribedby) => (
        <Input
          id={id}
          type={type}
          step={step}
          min={min}
          maxLength={maxLength}
          inputMode={inputMode}
          placeholder={placeholder}
          disabled={disabled}
          aria-invalid={erro ? true : undefined}
          aria-describedby={ariaDescribedby}
          {...inputProps}
        />
      )}
    </EstruturaCampo>
  )
}

interface EstruturaCampoProps {
  id: string
  label: string
  obrigatorio: boolean
  erro?: string
  ajuda?: ReactNode
  /** Recebe o `aria-describedby` (ajuda e erro presentes) para o controle. */
  children: (ariaDescribedby: string | undefined) => ReactNode
}

/** Label, ajuda e erro em volta de um controle: o mesmo visual para texto e dinheiro. */
function EstruturaCampo({ id, label, obrigatorio, erro, ajuda, children }: EstruturaCampoProps) {
  const erroId = `${id}-erro`
  const ajudaId = `${id}-ajuda`
  const temAjuda = ajuda !== undefined && ajuda !== null && ajuda !== ''
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {obrigatorio && <MarcaObrigatorio />}
      </label>
      {children(idsDescricao(temAjuda && ajudaId, erro && erroId))}
      {temAjuda && (
        <p id={ajudaId} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      )}
      <ErroDoCampo id={erroId} mensagem={erro} />
    </div>
  )
}

/** Campos de dinheiro do formulario (string decimal com ponto, exibidos com a mascara R$). */
export type CampoDinheiro = 'precoVenda' | 'custo' | 'precoMinimo' | 'precoPromocional' | 'precoAtacado'

interface CampoMoedaFormularioProps {
  id: CampoDinheiro
  label: string
  obrigatorio?: boolean
  erro?: string
  ajuda?: ReactNode
  disabled?: boolean
  /**
   * Custo para comparar: com o valor abaixo dele, a ajuda vira o aviso de
   * preco abaixo do custo (o mesmo nos precos de venda, promocional e atacado).
   */
  custo?: string
  /** Chamado a cada mudanca do valor (limpa feedbacks da pagina). */
  aoAlterar?: () => void
}

/** Campo de dinheiro ligado ao formulario (RHF), com label, ajuda e erro iguais aos do `CampoTexto`. */
export function CampoMoedaFormulario({
  id,
  label,
  obrigatorio = false,
  erro,
  ajuda,
  disabled,
  custo,
  aoAlterar,
}: CampoMoedaFormularioProps) {
  const { control } = useFormContext<ProdutoFormValues>()
  const valor = useWatch({ control, name: id })
  const aviso = custo === undefined ? null : textoAbaixoDoCusto(valor, custo)
  return (
    <EstruturaCampo
      id={id}
      label={label}
      obrigatorio={obrigatorio}
      erro={erro}
      ajuda={aviso ? <AvisoAbaixoDoCusto texto={aviso} /> : ajuda}
    >
      {(ariaDescribedby) => (
        <Controller
          control={control}
          name={id}
          render={({ field }) => (
            <CampoMoeda
              id={id}
              name={field.name}
              ref={field.ref}
              value={field.value}
              onChange={(valor) => {
                field.onChange(valor)
                aoAlterar?.()
              }}
              onBlur={field.onBlur}
              disabled={disabled}
              aria-invalid={erro ? true : undefined}
              aria-describedby={ariaDescribedby}
            />
          )}
        />
      )}
    </EstruturaCampo>
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
interface GrupoCamposProps {
  titulo: ReactNode
  descricao?: string
  /** Id do titulo: nomeia a secao; a descricao ganha `${idTitulo}-descricao`. */
  idTitulo?: string
  /** Controle a direita do titulo (ex.: o interruptor de um bloco opcional). */
  acao?: ReactNode
  children?: ReactNode
}

export function GrupoCampos({ titulo, descricao, idTitulo, acao, children }: GrupoCamposProps) {
  return (
    <section aria-labelledby={idTitulo} className="space-y-4 rounded-md bg-muted/40 p-4">
      <div className={acao ? 'flex min-h-11 items-center justify-between gap-4' : undefined}>
        <div>
          <h3 id={idTitulo} className="text-sm font-medium">
            {titulo}
          </h3>
          {descricao && (
            <p id={idTitulo ? `${idTitulo}-descricao` : undefined} className="text-xs text-muted-foreground">
              {descricao}
            </p>
          )}
        </div>
        {acao}
      </div>
      {children}
    </section>
  )
}

/**
 * Aviso de preco abaixo do custo: so informa (nao bloqueia o salvamento). Vai
 * na ajuda do campo, ligado a ele pelo `aria-describedby`; icone + texto, nunca so a cor.
 */
export function AvisoAbaixoDoCusto({ texto }: { texto: string }) {
  return (
    <span className="inline-flex items-start gap-1 font-medium text-warning-soft-foreground">
      <TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{texto}</span>
    </span>
  )
}
