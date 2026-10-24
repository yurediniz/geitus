import type { HTMLAttributes, ReactNode } from 'react'
import { Controller, useFormContext, type FieldPath } from 'react-hook-form'

import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ErroDoCampo, MarcaObrigatorio } from '@/features/products/CamposFormulario'
import type { FornecedorFormValues } from '@/features/suppliers/fornecedorFormulario'

/** Caminho de um campo do formulario, usado tambem como id do elemento ("razaoSocial", "representantes.0.nome"). */
export type CampoDoFornecedor = FieldPath<FornecedorFormValues>

interface PropsComuns {
  nome: CampoDoFornecedor
  rotulo: string
  obrigatorio?: boolean
  erro?: string
  ajuda?: ReactNode
  desabilitado: boolean
  placeholder?: string
  maxLength?: number
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
  autoComplete?: string
  type?: string
  /** Acao a direita do campo (ex.: o botao "Isento"). */
  acessorio?: ReactNode
  /** Chamado a cada alteracao (a pagina limpa o feedback). */
  aoAlterar: () => void
}

interface EstruturaProps {
  id: string
  rotulo: string
  obrigatorio: boolean
  erro?: string
  ajuda?: ReactNode
  children: (ariaDescribedby: string | undefined) => ReactNode
}

function Estrutura({ id, rotulo, obrigatorio, erro, ajuda, children }: EstruturaProps) {
  const erroId = `${id}-erro`
  const ajudaId = `${id}-ajuda`
  const temAjuda = ajuda !== undefined && ajuda !== null && ajuda !== ''
  const descricao = [temAjuda ? ajudaId : null, erro ? erroId : null].filter(Boolean).join(' ') || undefined
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
        {obrigatorio && <MarcaObrigatorio />}
      </label>
      {children(descricao)}
      {temAjuda && (
        <p id={ajudaId} className="text-xs text-muted-foreground">
          {ajuda}
        </p>
      )}
      <ErroDoCampo id={erroId} mensagem={erro} />
    </div>
  )
}

/** Campo de texto ligado ao formulario do fornecedor pelo `register`. */
export function CampoDeTexto({
  nome,
  rotulo,
  obrigatorio = false,
  erro,
  ajuda,
  desabilitado,
  placeholder,
  maxLength,
  inputMode,
  autoComplete,
  type = 'text',
  acessorio,
  aoAlterar,
}: PropsComuns) {
  const { register } = useFormContext<FornecedorFormValues>()
  return (
    <Estrutura id={nome} rotulo={rotulo} obrigatorio={obrigatorio} erro={erro} ajuda={ajuda}>
      {(ariaDescribedby) => (
        <div className="flex gap-2">
          <Input
            id={nome}
            type={type}
            placeholder={placeholder}
            maxLength={maxLength}
            inputMode={inputMode}
            autoComplete={autoComplete}
            disabled={desabilitado}
            aria-invalid={erro ? true : undefined}
            aria-describedby={ariaDescribedby}
            {...register(nome, { onChange: aoAlterar })}
          />
          {acessorio}
        </div>
      )}
    </Estrutura>
  )
}

interface CampoComMascaraProps extends PropsComuns {
  mascara: (valor: string) => string
  /** Recebe o valor ja formatado (ex.: o CEP, para buscar o endereco). */
  aoMudarValor?: (formatado: string) => void
}

/** Campo com mascara (documento, CEP, telefone): guarda o valor formatado; o request leva so os digitos. */
export function CampoComMascara({
  nome,
  rotulo,
  obrigatorio = false,
  erro,
  ajuda,
  desabilitado,
  placeholder,
  inputMode = 'numeric',
  autoComplete,
  mascara,
  aoMudarValor,
  aoAlterar,
}: CampoComMascaraProps) {
  const { control } = useFormContext<FornecedorFormValues>()
  return (
    <Controller
      control={control}
      name={nome}
      render={({ field }) => (
        <Estrutura id={nome} rotulo={rotulo} obrigatorio={obrigatorio} erro={erro} ajuda={ajuda}>
          {(ariaDescribedby) => (
            <Input
              id={nome}
              ref={field.ref}
              name={field.name}
              inputMode={inputMode}
              autoComplete={autoComplete}
              placeholder={placeholder}
              disabled={desabilitado}
              aria-invalid={erro ? true : undefined}
              aria-describedby={ariaDescribedby}
              value={typeof field.value === 'string' ? field.value : ''}
              onBlur={field.onBlur}
              onChange={(evento) => {
                const formatado = mascara(evento.target.value)
                field.onChange(formatado)
                aoAlterar()
                aoMudarValor?.(formatado)
              }}
            />
          )}
        </Estrutura>
      )}
    />
  )
}

/** Card de uma secao da pagina do fornecedor, com titulo nomeando a regiao. */
export function SecaoDoFornecedor({
  id,
  titulo,
  descricao,
  acessorio,
  children,
}: {
  id: string
  titulo: string
  descricao?: string
  acessorio?: ReactNode
  children: ReactNode
}) {
  const idTitulo = `${id}-titulo`
  return (
    <section id={id} aria-labelledby={idTitulo} className="scroll-mt-24">
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div>
              <h2 id={idTitulo} tabIndex={-1} className="font-brand text-lg font-semibold tracking-tight outline-none">
                {titulo}
              </h2>
              {descricao && <p className="mt-1 text-sm text-muted-foreground">{descricao}</p>}
            </div>
            {acessorio}
          </div>
          {children}
        </CardContent>
      </Card>
    </section>
  )
}
