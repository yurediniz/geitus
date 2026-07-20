import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
import type { Control, UseFormRegisterReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { AlertCircle, CheckCircle2, Info, Loader2, Lock } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { buscarCep } from '@/services/cepService'
import { atualizarEmpresa, obterEmpresa } from '@/services/empresaService'
import { HttpError } from '@/services/httpClient'
import type { Empresa, EmpresaAtualizarRequest } from '@/types/empresa'

/** Chave de cache da empresa do usuario autenticado. */
const EMPRESA_QUERY_KEY = ['empresa', 'minha'] as const

/** Unidades federativas do Brasil (allow-list; espelha o backend). */
const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const

// --- Normalizacao e mascaras ------------------------------------------------

/** Mantem apenas os digitos de um texto. */
function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** Formata CPF progressivamente: 000.000.000-00. */
function mascararCpf(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

/** Formata CNPJ progressivamente: 00.000.000/0000-00. */
function mascararCnpj(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 14)
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3/$4')
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d)/, '$1.$2.$3/$4-$5')
}

/** Formata telefone BR progressivamente: (00) 0000-0000 ou (00) 00000-0000. */
function mascararTelefone(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11)
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/^\((\d{2})\) (\d{4})(\d)/, '($1) $2-$3')
  }
  return d
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/^\((\d{2})\) (\d{5})(\d)/, '($1) $2-$3')
}

/** Formata CEP progressivamente: 00000-000. */
function mascararCep(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 8)
  return d.replace(/^(\d{5})(\d)/, '$1-$2')
}

// --- Validadores de digitos verificadores -----------------------------------

/** Valida um CPF pelos digitos verificadores. */
function cpfValido(valor: string): boolean {
  const c = apenasDigitos(valor)
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) {
    return false
  }
  let soma = 0
  for (let i = 0; i < 9; i += 1) {
    soma += Number(c[i]) * (10 - i)
  }
  let d1 = (soma * 10) % 11
  if (d1 === 10) {
    d1 = 0
  }
  if (d1 !== Number(c[9])) {
    return false
  }
  soma = 0
  for (let i = 0; i < 10; i += 1) {
    soma += Number(c[i]) * (11 - i)
  }
  let d2 = (soma * 10) % 11
  if (d2 === 10) {
    d2 = 0
  }
  return d2 === Number(c[10])
}

/** Valida um CNPJ pelos digitos verificadores. */
function cnpjValido(valor: string): boolean {
  const c = apenasDigitos(valor)
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) {
    return false
  }
  const calcularDigito = (tamanho: number): number => {
    const pesos =
      tamanho === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < tamanho; i += 1) {
      soma += Number(c[i]) * pesos[i]
    }
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  if (calcularDigito(12) !== Number(c[12])) {
    return false
  }
  return calcularDigito(13) === Number(c[13])
}

/** Telefone BR: DDD + numero (10 ou 11 digitos). */
function telefoneValido(valor: string): boolean {
  const tamanho = apenasDigitos(valor).length
  return tamanho === 10 || tamanho === 11
}

// --- Schema do formulario ---------------------------------------------------

const campoObrigatorio = (mensagem: string) => z.string().trim().min(1, mensagem)

const empresaFormSchema = z
  .object({
    // Representante legal (sempre obrigatorio).
    representanteNome: campoObrigatorio('Informe o nome do representante.')
      .max(180, 'Nome deve ter no máximo 180 caracteres.'),
    representanteCpf: campoObrigatorio('Informe o CPF do representante.')
      .refine(cpfValido, 'Informe um CPF válido.'),
    representanteTelefone: campoObrigatorio('Informe o telefone do representante.')
      .refine(telefoneValido, 'Informe um telefone válido com DDD.'),
    representanteEmail: campoObrigatorio('Informe o e-mail do representante.')
      .email('Informe um e-mail válido.')
      .max(180, 'E-mail deve ter no máximo 180 caracteres.'),

    // Empresa (comuns).
    possuiCnpj: z.enum(['sim', 'nao']),
    nome: campoObrigatorio('Informe o nome da empresa.')
      .max(150, 'Nome deve ter no máximo 150 caracteres.'),
    telefone: campoObrigatorio('Informe o telefone da empresa.')
      .refine(telefoneValido, 'Informe um telefone válido com DDD.'),
    email: campoObrigatorio('Informe o e-mail da empresa.')
      .email('Informe um e-mail válido.')
      .max(180, 'E-mail deve ter no máximo 180 caracteres.'),

    // Empresa (condicionais — apenas quando possui CNPJ).
    cnpj: z.string().trim(),
    razaoSocial: z.string().trim().max(180, 'Razão social deve ter no máximo 180 caracteres.'),
    inscricaoEstadual: z.string().trim().max(20, 'Inscrição estadual deve ter no máximo 20 caracteres.'),

    // Endereco.
    cep: campoObrigatorio('Informe o CEP.')
      .refine((valor) => apenasDigitos(valor).length === 8, 'CEP deve ter 8 dígitos.'),
    logradouro: campoObrigatorio('Informe o logradouro.')
      .max(180, 'Logradouro deve ter no máximo 180 caracteres.'),
    numero: z.string().trim().max(20, 'Número deve ter no máximo 20 caracteres.'),
    semNumero: z.boolean(),
    complemento: z.string().trim().max(120, 'Complemento deve ter no máximo 120 caracteres.'),
    bairro: campoObrigatorio('Informe o bairro.').max(120, 'Bairro deve ter no máximo 120 caracteres.'),
    municipio: campoObrigatorio('Informe o município.').max(120, 'Município deve ter no máximo 120 caracteres.'),
    uf: campoObrigatorio('Selecione o estado.'),
  })
  .superRefine((valores, ctx) => {
    if (valores.possuiCnpj === 'sim') {
      if (!cnpjValido(valores.cnpj)) {
        ctx.addIssue({ path: ['cnpj'], code: z.ZodIssueCode.custom, message: 'Informe um CNPJ válido.' })
      }
      if (valores.razaoSocial.trim() === '') {
        ctx.addIssue({ path: ['razaoSocial'], code: z.ZodIssueCode.custom, message: 'Informe a razão social.' })
      }
    }
    if (!valores.semNumero && valores.numero.trim() === '') {
      ctx.addIssue({
        path: ['numero'],
        code: z.ZodIssueCode.custom,
        message: 'Informe o número ou marque "sem número".',
      })
    }
    if (valores.uf !== '' && !UFS.includes(valores.uf as (typeof UFS)[number])) {
      ctx.addIssue({ path: ['uf'], code: z.ZodIssueCode.custom, message: 'Selecione um estado válido.' })
    }
  })

type EmpresaFormValues = z.infer<typeof empresaFormSchema>

const valoresIniciais: EmpresaFormValues = {
  representanteNome: '',
  representanteCpf: '',
  representanteTelefone: '',
  representanteEmail: '',
  possuiCnpj: 'nao',
  nome: '',
  telefone: '',
  email: '',
  cnpj: '',
  razaoSocial: '',
  inscricaoEstadual: '',
  cep: '',
  logradouro: '',
  numero: '',
  semNumero: false,
  complemento: '',
  bairro: '',
  municipio: '',
  uf: '',
}

/** Converte a empresa carregada nos valores iniciais do formulario (com mascaras). */
function valoresDaEmpresa(empresa: Empresa): EmpresaFormValues {
  const semNumero = empresa.endereco.numero.trim().toUpperCase() === 'S/N'
  return {
    representanteNome: empresa.representanteLegal.nome,
    representanteCpf: mascararCpf(empresa.representanteLegal.cpf),
    representanteTelefone: mascararTelefone(empresa.representanteLegal.telefone),
    representanteEmail: empresa.representanteLegal.email,
    possuiCnpj: empresa.tipoPessoa === 'JURIDICA' ? 'sim' : 'nao',
    nome: empresa.nome,
    telefone: mascararTelefone(empresa.telefone),
    email: empresa.email,
    cnpj: empresa.cnpj ? mascararCnpj(empresa.cnpj) : '',
    razaoSocial: empresa.razaoSocial ?? '',
    inscricaoEstadual: empresa.inscricaoEstadual ?? '',
    cep: mascararCep(empresa.endereco.cep),
    logradouro: empresa.endereco.logradouro,
    numero: semNumero ? '' : empresa.endereco.numero,
    semNumero,
    complemento: empresa.endereco.complemento ?? '',
    bairro: empresa.endereco.bairro,
    municipio: empresa.endereco.municipio,
    uf: empresa.endereco.uf,
  }
}

/** Monta o corpo do PATCH (dados normalizados: CPF/CNPJ/telefone/CEP só dígitos). */
function montarRequest(valores: EmpresaFormValues): EmpresaAtualizarRequest {
  const juridica = valores.possuiCnpj === 'sim'
  const complemento = valores.complemento.trim()
  const inscricao = valores.inscricaoEstadual.trim()
  return {
    nome: valores.nome.trim(),
    telefone: apenasDigitos(valores.telefone),
    email: valores.email.trim(),
    tipoPessoa: juridica ? 'JURIDICA' : 'FISICA',
    cnpj: juridica ? apenasDigitos(valores.cnpj) : null,
    razaoSocial: juridica ? valores.razaoSocial.trim() : null,
    inscricaoEstadual: juridica && inscricao !== '' ? inscricao : null,
    representanteLegal: {
      nome: valores.representanteNome.trim(),
      cpf: apenasDigitos(valores.representanteCpf),
      telefone: apenasDigitos(valores.representanteTelefone),
      email: valores.representanteEmail.trim(),
    },
    endereco: {
      cep: apenasDigitos(valores.cep),
      logradouro: valores.logradouro.trim(),
      numero: valores.semNumero ? 'S/N' : valores.numero.trim(),
      complemento: complemento !== '' ? complemento : null,
      bairro: valores.bairro.trim(),
      municipio: valores.municipio.trim(),
      uf: valores.uf,
    },
  }
}

/** Mensagem generica de 409 surfada pelo httpClient quando o backend nao curou texto. */
const FALLBACK_409 = 'Requisicao falhou (HTTP 409).'

/** Mensagem amigavel (pt-BR) para falhas ao salvar, sem vazar detalhe interno. */
function mensagemErroSalvar(erro: unknown): string {
  if (erro instanceof HttpError) {
    if (erro.status === 403) {
      return 'Você não tem permissão para editar os dados da empresa.'
    }
    if (erro.status === 409) {
      return erro.message && erro.message !== FALLBACK_409
        ? erro.message
        : 'Este CNPJ já está em uso por outra empresa.'
    }
    if (erro.status === 400) {
      const mensagens = erro.campos ? Object.values(erro.campos).filter(Boolean) : []
      if (mensagens.length > 0) {
        return mensagens.join(' ')
      }
      if (erro.message && erro.message !== 'Dados invalidos.') {
        return erro.message
      }
      return 'Revise os dados informados e tente novamente.'
    }
  }
  return 'Não foi possível salvar os dados da empresa. Tente novamente.'
}

/**
 * Pagina de Empresa: cadastro completo (representante legal, dados da empresa
 * com fluxo "Já possui CNPJ?" e endereço com autofill de CEP). ADMIN edita;
 * OPERADOR vê em modo leitura. Trata loading, erro, vazio e sucesso.
 */
export function EmpresaPage() {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const somenteLeitura = usuario?.perfil !== 'ADMIN'

  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const [salvoComSucesso, setSalvoComSucesso] = useState(false)
  const [avisoCep, setAvisoCep] = useState<string | null>(null)
  const [buscandoCep, setBuscandoCep] = useState(false)
  const cepBuscadoRef = useRef<string | null>(null)
  const feedbackRef = useRef<HTMLDivElement>(null)

  const {
    data: empresa,
    isPending,
    isError,
    refetch,
  } = useQuery<Empresa>({
    queryKey: EMPRESA_QUERY_KEY,
    queryFn: obterEmpresa,
  })

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<EmpresaFormValues>({
    resolver: zodResolver(empresaFormSchema),
    defaultValues: valoresIniciais,
  })

  // Sincroniza o formulario com os dados carregados (primeira carga ou refetch).
  useEffect(() => {
    if (empresa) {
      reset(valoresDaEmpresa(empresa))
      cepBuscadoRef.current = apenasDigitos(empresa.endereco.cep)
    }
  }, [empresa, reset])

  const possuiCnpj = watch('possuiCnpj')
  const semNumero = watch('semNumero')

  const mutation = useMutation<Empresa, unknown, EmpresaFormValues>({
    mutationFn: (valores) => atualizarEmpresa(montarRequest(valores)),
    onSuccess: (dados) => {
      queryClient.setQueryData(EMPRESA_QUERY_KEY, dados)
      setSalvoComSucesso(true)
      setErroSalvar(null)
      feedbackRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    },
    onError: (erro) => {
      setSalvoComSucesso(false)
      // CNPJ duplicado: destaca o campo, alem do aviso no topo.
      if (erro instanceof HttpError && erro.status === 409) {
        setError('cnpj', { type: 'server', message: 'Este CNPJ já está em uso por outra empresa.' })
      }
      setErroSalvar(mensagemErroSalvar(erro))
      feedbackRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })
    },
  })

  const salvando = mutation.isPending

  const aoAlterarCampo = () => {
    setSalvoComSucesso(false)
  }

  const aoSubmeter = (valores: EmpresaFormValues) => {
    setErroSalvar(null)
    setSalvoComSucesso(false)
    mutation.mutate(valores)
  }

  // Ao trocar "Já possui CNPJ?", limpa os campos de PJ quando vira "não".
  const aoMudarPossuiCnpj = (evento: ChangeEvent<HTMLInputElement>) => {
    aoAlterarCampo()
    if (evento.target.value === 'nao') {
      setValue('cnpj', '')
      setValue('razaoSocial', '')
      setValue('inscricaoEstadual', '')
      clearErrors(['cnpj', 'razaoSocial', 'inscricaoEstadual'])
    }
  }

  // Marcar "sem número" limpa o campo número e o erro associado.
  const aoMudarSemNumero = (evento: ChangeEvent<HTMLInputElement>) => {
    aoAlterarCampo()
    if (evento.target.checked) {
      setValue('numero', '')
      clearErrors('numero')
    }
  }

  // Autofill do endereco ao completar 8 digitos do CEP (nao-bloqueante).
  const aoAlterarCep = async (valor: string) => {
    const digitos = apenasDigitos(valor)
    setAvisoCep(null)
    if (digitos.length !== 8 || digitos === cepBuscadoRef.current) {
      return
    }
    cepBuscadoRef.current = digitos
    setBuscandoCep(true)
    try {
      const endereco = await buscarCep(digitos)
      if (endereco) {
        setValue('logradouro', endereco.logradouro, { shouldValidate: true })
        setValue('bairro', endereco.bairro, { shouldValidate: true })
        setValue('municipio', endereco.municipio, { shouldValidate: true })
        setValue('uf', endereco.uf, { shouldValidate: true })
        clearErrors(['logradouro', 'bairro', 'municipio', 'uf'])
      } else {
        setAvisoCep('Não encontramos esse CEP. Preencha o endereço manualmente.')
      }
    } finally {
      setBuscandoCep(false)
    }
  }

  const desabilitado = somenteLeitura || salvando

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Empresa</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          Dados cadastrais da empresa vinculada à sua conta: representante legal, empresa e endereço.
        </p>
      </div>

      {isPending && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando dados da empresa...
        </p>
      )}

      {isError && (
        <div className="space-y-3">
          <div
            role="alert"
            className="flex max-w-2xl items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>Não foi possível carregar os dados da empresa.</span>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {!isPending && !isError && !empresa && (
        <p className="text-sm text-muted-foreground">Nenhum dado de empresa disponível.</p>
      )}

      {!isPending && !isError && empresa && (
        <form onSubmit={handleSubmit(aoSubmeter)} noValidate className="space-y-6">
          <div ref={feedbackRef} className="max-w-3xl space-y-3 empty:hidden">
            {somenteLeitura && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0" />
                <span>Somente administradores podem editar os dados da empresa. Você está no modo leitura.</span>
              </div>
            )}
            {erroSalvar && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{erroSalvar}</span>
              </div>
            )}
            {salvoComSucesso && !erroSalvar && (
              <div
                role="status"
                className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success"
              >
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Dados da empresa salvos com sucesso.</span>
              </div>
            )}
          </div>

          {/* Seção: Representante legal */}
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle>Representante legal</CardTitle>
              <CardDescription>Pessoa responsável pela empresa.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <CampoTexto
                  id="representanteNome"
                  label="Nome completo"
                  erro={errors.representanteNome?.message}
                  inputProps={register('representanteNome', { onChange: aoAlterarCampo })}
                  disabled={desabilitado}
                  autoComplete="name"
                />
                <CampoMascarado
                  id="representanteCpf"
                  label="CPF"
                  control={control}
                  name="representanteCpf"
                  mascara={mascararCpf}
                  erro={errors.representanteCpf?.message}
                  disabled={desabilitado}
                  onValorAlterado={aoAlterarCampo}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                />
                <CampoMascarado
                  id="representanteTelefone"
                  label="Telefone"
                  control={control}
                  name="representanteTelefone"
                  mascara={mascararTelefone}
                  erro={errors.representanteTelefone?.message}
                  disabled={desabilitado}
                  onValorAlterado={aoAlterarCampo}
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                />
                <CampoTexto
                  id="representanteEmail"
                  label="E-mail"
                  type="email"
                  erro={errors.representanteEmail?.message}
                  inputProps={register('representanteEmail', { onChange: aoAlterarCampo })}
                  disabled={desabilitado}
                  autoComplete="email"
                  placeholder="pessoa@empresa.com"
                />
              </div>
            </CardContent>
          </Card>

          {/* Seção: Empresa */}
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle>Empresa</CardTitle>
              <CardDescription>Dados de identificação e contato do negócio.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <fieldset className="space-y-2" disabled={desabilitado}>
                <legend className="text-sm font-medium">Já possui CNPJ?</legend>
                <div className="flex flex-wrap gap-4">
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      value="sim"
                      className="h-4 w-4 accent-primary"
                      {...register('possuiCnpj', { onChange: aoMudarPossuiCnpj })}
                    />
                    Sim, tenho CNPJ
                  </label>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="radio"
                      value="nao"
                      className="h-4 w-4 accent-primary"
                      {...register('possuiCnpj', { onChange: aoMudarPossuiCnpj })}
                    />
                    Não tenho CNPJ
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Sem CNPJ, sua identificação fiscal é o CPF do representante legal.
                </p>
              </fieldset>

              <div className="grid gap-4 md:grid-cols-2">
                <CampoTexto
                  id="nome"
                  label="Nome da empresa (nome fantasia)"
                  erro={errors.nome?.message}
                  inputProps={register('nome', { onChange: aoAlterarCampo })}
                  disabled={desabilitado}
                  autoComplete="organization"
                />
                <CampoMascarado
                  id="telefone"
                  label="Telefone"
                  control={control}
                  name="telefone"
                  mascara={mascararTelefone}
                  erro={errors.telefone?.message}
                  disabled={desabilitado}
                  onValorAlterado={aoAlterarCampo}
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                />
                <CampoTexto
                  id="email"
                  label="E-mail"
                  type="email"
                  erro={errors.email?.message}
                  inputProps={register('email', { onChange: aoAlterarCampo })}
                  disabled={desabilitado}
                  placeholder="contato@empresa.com"
                />
              </div>

              {possuiCnpj === 'sim' && (
                <div className="grid gap-4 rounded-md bg-muted/40 p-4 md:grid-cols-2">
                  <CampoMascarado
                    id="cnpj"
                    label="CNPJ"
                    control={control}
                    name="cnpj"
                    mascara={mascararCnpj}
                    erro={errors.cnpj?.message}
                    disabled={desabilitado}
                    onValorAlterado={aoAlterarCampo}
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                  />
                  <CampoTexto
                    id="razaoSocial"
                    label="Razão social"
                    erro={errors.razaoSocial?.message}
                    inputProps={register('razaoSocial', { onChange: aoAlterarCampo })}
                    disabled={desabilitado}
                  />
                  <CampoTexto
                    id="inscricaoEstadual"
                    label="Inscrição estadual (opcional)"
                    erro={errors.inscricaoEstadual?.message}
                    inputProps={register('inscricaoEstadual', { onChange: aoAlterarCampo })}
                    disabled={desabilitado}
                  />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Seção: Endereço */}
          <Card className="max-w-3xl">
            <CardHeader>
              <CardTitle>Endereço</CardTitle>
              <CardDescription>Informe o CEP para preencher o endereço automaticamente.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <CampoMascarado
                    id="cep"
                    label="CEP"
                    control={control}
                    name="cep"
                    mascara={mascararCep}
                    erro={errors.cep?.message}
                    disabled={desabilitado}
                    onValorAlterado={(valor) => {
                      aoAlterarCampo()
                      void aoAlterarCep(valor)
                    }}
                    inputMode="numeric"
                    placeholder="00000-000"
                  />
                  {buscandoCep && (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Buscando endereço...
                    </p>
                  )}
                  {avisoCep && (
                    <p role="status" className="flex items-center gap-1.5 text-xs text-warning-soft-foreground">
                      <Info className="h-3 w-3 shrink-0" />
                      {avisoCep}
                    </p>
                  )}
                </div>

                <CampoTexto
                  id="logradouro"
                  label="Logradouro"
                  erro={errors.logradouro?.message}
                  inputProps={register('logradouro', { onChange: aoAlterarCampo })}
                  disabled={desabilitado}
                  autoComplete="address-line1"
                />

                <div className="space-y-1.5">
                  <label htmlFor="numero" className="text-sm font-medium">
                    Número
                  </label>
                  <Input
                    id="numero"
                    disabled={desabilitado || semNumero}
                    aria-invalid={errors.numero ? true : undefined}
                    aria-describedby={errors.numero ? 'numero-erro' : undefined}
                    {...register('numero', { onChange: aoAlterarCampo })}
                  />
                  <label className="flex min-h-9 items-center gap-2 text-sm text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      disabled={desabilitado}
                      {...register('semNumero', { onChange: aoMudarSemNumero })}
                    />
                    Sem número
                  </label>
                  {errors.numero && (
                    <p id="numero-erro" className="text-sm text-destructive">
                      {errors.numero.message}
                    </p>
                  )}
                </div>

                <CampoTexto
                  id="complemento"
                  label="Complemento (opcional)"
                  erro={errors.complemento?.message}
                  inputProps={register('complemento', { onChange: aoAlterarCampo })}
                  disabled={desabilitado}
                  placeholder="Sala, bloco, referência"
                />

                <CampoTexto
                  id="bairro"
                  label="Bairro"
                  erro={errors.bairro?.message}
                  inputProps={register('bairro', { onChange: aoAlterarCampo })}
                  disabled={desabilitado}
                />

                <CampoTexto
                  id="municipio"
                  label="Município"
                  erro={errors.municipio?.message}
                  inputProps={register('municipio', { onChange: aoAlterarCampo })}
                  disabled={desabilitado}
                />

                <div className="space-y-1.5">
                  <label htmlFor="uf" className="text-sm font-medium">
                    Estado (UF)
                  </label>
                  <select
                    id="uf"
                    disabled={desabilitado}
                    aria-invalid={errors.uf ? true : undefined}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    {...register('uf', { onChange: aoAlterarCampo })}
                  >
                    <option value="">Selecione</option>
                    {UFS.map((uf) => (
                      <option key={uf} value={uf}>
                        {uf}
                      </option>
                    ))}
                  </select>
                  {errors.uf && <p className="text-sm text-destructive">{errors.uf.message}</p>}
                </div>
              </div>
            </CardContent>
          </Card>

          {!somenteLeitura && (
            <div className="flex max-w-3xl justify-end">
              <Button type="submit" disabled={salvando}>
                {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
                {salvando ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  )
}

// --- Campos reutilizaveis ---------------------------------------------------

interface CampoTextoProps {
  id: string
  label: string
  erro?: string
  disabled?: boolean
  placeholder?: string
  type?: string
  autoComplete?: string
  inputProps: UseFormRegisterReturn
}

/** Campo de texto simples ligado ao RHF via `register`. */
function CampoTexto({
  id,
  label,
  erro,
  disabled,
  placeholder,
  type = 'text',
  autoComplete,
  inputProps,
}: CampoTextoProps) {
  const erroId = `${id}-erro`
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        type={type}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
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

interface CampoMascaradoProps {
  id: string
  label: string
  control: Control<EmpresaFormValues>
  name: keyof EmpresaFormValues
  mascara: (valor: string) => string
  erro?: string
  disabled?: boolean
  placeholder?: string
  inputMode?: 'numeric' | 'tel'
  /** Notifica o valor ja mascarado (para limpar feedback e disparar autofill). */
  onValorAlterado?: (valor: string) => void
}

/**
 * Campo com máscara progressiva (CPF, CNPJ, telefone, CEP) ligado ao RHF via
 * `Controller`. Armazena o valor formatado; a normalização para dígitos ocorre
 * no envio (o backend também normaliza).
 */
function CampoMascarado({
  id,
  label,
  control,
  name,
  mascara,
  erro,
  disabled,
  placeholder,
  inputMode,
  onValorAlterado,
}: CampoMascaradoProps) {
  const erroId = `${id}-erro`
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
            inputMode={inputMode}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? erroId : undefined}
            value={typeof field.value === 'string' ? field.value : ''}
            onBlur={field.onBlur}
            onChange={(evento) => {
              const formatado = mascara(evento.target.value)
              field.onChange(formatado)
              onValorAlterado?.(formatado)
            }}
          />
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
