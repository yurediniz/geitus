import { useEffect } from 'react'
import { Controller, useForm, type Control, type UseFormRegisterReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { AlertCircle, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  apenasDigitos,
  cpfValido,
  mascararCpf,
  mascararTelefone,
  normalizarDigitosTelefone,
  telefoneValido,
} from '@/lib/documentos'
import type { Cliente, ClienteRequest } from '@/types/cliente'

const OBSERVACOES_MAX = 500

const MENSAGEM_TELEFONE = 'Informe um telefone válido com DDD.'

/** Schema do formulario: espelha as regras do backend (nome obrigatorio; demais opcionais, mas validos). */
const clienteSchema = z.object({
  nome: z.string().trim()
    .min(1, 'Informe o nome do cliente.')
    .max(150, 'Nome deve ter no máximo 150 caracteres.'),
  telefone: z.string()
    .refine((valor) => apenasDigitos(valor) === '' || telefoneValido(valor), MENSAGEM_TELEFONE),
  telefoneEWhatsapp: z.boolean(),
  whatsapp: z.string(),
  cpf: z.string()
    .refine((valor) => apenasDigitos(valor) === '' || cpfValido(valor), 'Informe um CPF válido.'),
  observacoes: z.string().trim()
    .max(OBSERVACOES_MAX, `Observações devem ter no máximo ${OBSERVACOES_MAX} caracteres.`),
}).superRefine((valores, ctx) => {
  // O WhatsApp proprio so e considerado quando o telefone nao e o WhatsApp.
  if (
    !valores.telefoneEWhatsapp &&
    apenasDigitos(valores.whatsapp) !== '' &&
    !telefoneValido(valores.whatsapp)
  ) {
    ctx.addIssue({ path: ['whatsapp'], code: 'custom', message: 'Informe um WhatsApp válido com DDD.' })
  }
})

type ClienteFormValues = z.infer<typeof clienteSchema>

const valoresIniciais: ClienteFormValues = {
  nome: '',
  telefone: '',
  telefoneEWhatsapp: true,
  whatsapp: '',
  cpf: '',
  observacoes: '',
}

function valoresDoCliente(cliente: Cliente): ClienteFormValues {
  return {
    nome: cliente.nome,
    telefone: mascararTelefone(cliente.telefone ?? ''),
    telefoneEWhatsapp: cliente.telefoneEWhatsapp,
    // Com telefoneEWhatsapp, a API devolve o proprio telefone em `whatsapp`; nao repete no campo.
    whatsapp: cliente.telefoneEWhatsapp ? '' : mascararTelefone(cliente.whatsapp ?? ''),
    cpf: mascararCpf(cliente.cpf ?? ''),
    observacoes: cliente.observacoes ?? '',
  }
}

function digitosOuNulo(valor: string): string | null {
  const digitos = apenasDigitos(valor)
  return digitos === '' ? null : digitos
}

/** Telefone em digitos sem o codigo do pais (+55); vazio -> null. */
function telefoneOuNulo(valor: string): string | null {
  const digitos = normalizarDigitosTelefone(valor)
  return digitos === '' ? null : digitos
}

function textoOuNulo(valor: string): string | null {
  const texto = valor.trim()
  return texto === '' ? null : texto
}

/** Monta o request com digitos puros e vazio -> null; WhatsApp proprio so quando desmarcado. */
function montarRequest(valores: ClienteFormValues): ClienteRequest {
  return {
    nome: valores.nome.trim(),
    cpf: digitosOuNulo(valores.cpf),
    telefone: telefoneOuNulo(valores.telefone),
    telefoneEWhatsapp: valores.telefoneEWhatsapp,
    whatsapp: valores.telefoneEWhatsapp ? null : telefoneOuNulo(valores.whatsapp),
    observacoes: textoOuNulo(valores.observacoes),
  }
}

/** Campos do formulario que podem receber erro vindo do backend. */
export type ClienteCampoFormulario = 'nome' | 'cpf' | 'telefone' | 'whatsapp' | 'observacoes'

export interface ClienteFormularioProps {
  /** Cliente em edicao; `null` para cadastro novo. */
  cliente: Cliente | null
  salvando: boolean
  /** Mensagem amigavel de falha ao salvar (ja traduzida pela pagina). */
  erro: string | null
  /** Erros do backend por campo (ex.: 409 de CPF, `campos` de um 400), marcados no proprio campo. */
  erroCampos?: Partial<Record<ClienteCampoFormulario, string>>
  onSalvar: (request: ClienteRequest) => void
  onCancelar: () => void
}

/**
 * Formulario rapido de cliente (cadastro no balcao): Nome -> Telefone (+ "e WhatsApp")
 * -> WhatsApp proprio (so quando desmarcado) -> CPF -> Observacoes.
 */
export function ClienteFormulario({
  cliente,
  salvando,
  erro,
  erroCampos,
  onSalvar,
  onCancelar,
}: ClienteFormularioProps) {
  const {
    register,
    control,
    handleSubmit,
    watch,
    setFocus,
    setError,
    formState: { errors },
  } = useForm<ClienteFormValues>({
    resolver: zodResolver(clienteSchema),
    defaultValues: cliente ? valoresDoCliente(cliente) : valoresIniciais,
  })

  useEffect(() => {
    setFocus('nome')
  }, [setFocus])

  // Erros do backend viram erro no proprio campo; o primeiro recebe o foco.
  useEffect(() => {
    if (!erroCampos) {
      return
    }
    const entradas = Object.entries(erroCampos) as [ClienteCampoFormulario, string | undefined][]
    let focou = false
    for (const [campo, mensagem] of entradas) {
      if (mensagem) {
        setError(campo, { type: 'server', message: mensagem }, { shouldFocus: !focou })
        focou = true
      }
    }
  }, [erroCampos, setError])

  const telefoneEWhatsapp = watch('telefoneEWhatsapp')
  const tamanhoObservacoes = watch('observacoes').length

  const aoSubmeter = (valores: ClienteFormValues) => {
    onSalvar(montarRequest(valores))
  }

  return (
    <form onSubmit={handleSubmit(aoSubmeter)} noValidate className="space-y-4">
      {/* Numero de registro (so leitura, imutavel): so existe depois de salvar. */}
      {cliente && (
        <dl className="space-y-0.5">
          <dt className="text-sm text-muted-foreground">Nº do Cliente</dt>
          <dd className="text-base font-semibold tabular-nums">{cliente.numero}</dd>
        </dl>
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

      <CampoTexto
        id="nome"
        label="Nome"
        erro={errors.nome?.message}
        disabled={salvando}
        autoComplete="off"
        maxLength={150}
        inputProps={register('nome')}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <CampoMascarado
            id="telefone"
            label="Telefone (opcional)"
            name="telefone"
            control={control}
            mascara={mascararTelefone}
            erro={errors.telefone?.message}
            disabled={salvando}
            placeholder="(00) 00000-0000"
          />
          <label className="flex min-h-11 items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              disabled={salvando}
              {...register('telefoneEWhatsapp')}
            />
            Este número é WhatsApp
          </label>
        </div>

        {!telefoneEWhatsapp && (
          <CampoMascarado
            id="whatsapp"
            label="Outro número de WhatsApp (opcional)"
            descricao="Deixe em branco se o cliente não usa WhatsApp."
            name="whatsapp"
            control={control}
            mascara={mascararTelefone}
            erro={errors.whatsapp?.message}
            disabled={salvando}
            placeholder="(00) 00000-0000"
          />
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CampoMascarado
          id="cpf"
          label="CPF (opcional)"
          name="cpf"
          control={control}
          mascara={mascararCpf}
          erro={errors.cpf?.message}
          disabled={salvando}
          placeholder="000.000.000-00"
          inputMode="numeric"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="observacoes" className="text-sm font-medium">
            Observações (opcional)
          </label>
          <span id="observacoes-contador" className="text-xs tabular-nums text-muted-foreground">
            {tamanhoObservacoes}/{OBSERVACOES_MAX}
          </span>
        </div>
        <textarea
          id="observacoes"
          rows={3}
          maxLength={OBSERVACOES_MAX}
          disabled={salvando}
          aria-invalid={errors.observacoes ? true : undefined}
          aria-describedby={idsDescricao('observacoes-contador', errors.observacoes ? 'observacoes-erro' : undefined)}
          placeholder="Preferências, referências ou outras anotações"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive"
          {...register('observacoes')}
        />
        {errors.observacoes && (
          <p id="observacoes-erro" className="text-sm text-destructive">
            {errors.observacoes.message}
          </p>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvando}>
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
          {salvando ? 'Salvando...' : 'Salvar cliente'}
        </Button>
      </div>
    </form>
  )
}

/** Junta os ids de apoio (descricao, contador, erro) para `aria-describedby`. */
function idsDescricao(...ids: (string | undefined)[]): string | undefined {
  const presentes = ids.filter(Boolean)
  return presentes.length > 0 ? presentes.join(' ') : undefined
}

interface CampoTextoProps {
  id: string
  label: string
  erro?: string
  disabled?: boolean
  autoComplete?: string
  maxLength?: number
  inputProps: UseFormRegisterReturn
}

function CampoTexto({ id, label, erro, disabled, autoComplete, maxLength, inputProps }: CampoTextoProps) {
  const erroId = `${id}-erro`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        disabled={disabled}
        autoComplete={autoComplete}
        maxLength={maxLength}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? erroId : undefined}
        {...inputProps}
      />
      {erro && (
        <p id={erroId} className="text-sm text-destructive">
          {erro}
        </p>
      )}
    </div>
  )
}

type CampoMascaradoNome = 'telefone' | 'whatsapp' | 'cpf'

interface CampoMascaradoProps {
  id: string
  label: string
  /** Texto de apoio exibido abaixo do campo (ligado via `aria-describedby`). */
  descricao?: string
  name: CampoMascaradoNome
  control: Control<ClienteFormValues>
  mascara: (valor: string) => string
  erro?: string
  disabled?: boolean
  placeholder?: string
  inputMode?: 'numeric' | 'tel'
}

/**
 * Campo com mascara progressiva (CPF/telefone) ligado ao RHF via `Controller`.
 * Guarda o valor formatado; a normalizacao para digitos ocorre no envio.
 */
function CampoMascarado({
  id,
  label,
  descricao,
  name,
  control,
  mascara,
  erro,
  disabled,
  placeholder,
  inputMode = 'tel',
}: CampoMascaradoProps) {
  const erroId = `${id}-erro`
  const descricaoId = `${id}-descricao`
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="space-y-1.5">
          <label htmlFor={id} className="text-sm font-medium">
            {label}
          </label>
          <Input
            id={id}
            ref={field.ref}
            inputMode={inputMode}
            autoComplete="off"
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={erro ? true : undefined}
            aria-describedby={idsDescricao(descricao ? descricaoId : undefined, erro ? erroId : undefined)}
            value={field.value}
            onBlur={field.onBlur}
            onChange={(evento) => field.onChange(mascara(evento.target.value))}
          />
          {descricao && (
            <p id={descricaoId} className="text-xs text-muted-foreground">
              {descricao}
            </p>
          )}
          {erro && (
            <p id={erroId} className="text-sm text-destructive">
              {erro}
            </p>
          )}
        </div>
      )}
    />
  )
}
