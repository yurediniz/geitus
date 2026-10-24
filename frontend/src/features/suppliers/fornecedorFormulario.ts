import { z } from 'zod'

import {
  apenasDigitos,
  cnpjValido,
  cpfValido,
  mascararCep,
  mascararCnpj,
  mascararCpf,
  mascararTelefone,
  normalizarDigitosTelefone,
  telefoneValido,
  ufValida,
} from '@/lib/documentos'
import type {
  Fornecedor,
  FornecedorRequest,
  RepresentanteRequest,
  TipoPessoaFornecedor,
} from '@/types/fornecedor'

/**
 * Formulario do fornecedor (spec B5 §4): schema com as mensagens de §4.6,
 * valores a partir da API e o request normalizado. Espelha as regras do
 * backend, que continua validando.
 */

export const MAXIMO_REPRESENTANTES = 10
export const MAXIMO_MARCAS = 200
export const IE_ISENTO = 'ISENTO'

const MENSAGEM_TELEFONE = 'Informe um telefone válido com DDD.'
const MENSAGEM_EMAIL = 'E-mail inválido.'

/** Texto opcional com limite de tamanho (o vazio passa). */
function textoAte(maximo: number, mensagem: string) {
  return z.string().max(maximo, mensagem)
}

/** E-mail opcional: vazio passa; preenchido, formato e ate 180. */
const emailOpcional = z
  .string()
  .trim()
  .refine((valor) => valor === '' || z.email().safeParse(valor).success, MENSAGEM_EMAIL)
  .refine((valor) => valor.length <= 180, 'E-mail deve ter no máximo 180 caracteres.')

/** Telefone opcional (com mascara na tela). */
const telefoneOpcional = z.string().refine((valor) => apenasDigitos(valor) === '' || telefoneValido(valor), MENSAGEM_TELEFONE)

const representanteSchema = z.object({
  /** UUID do representante gravado; vazio no novo. */
  id: z.string(),
  nome: z.string().trim().min(1, 'Informe o nome do representante.').max(120, 'Nome deve ter no máximo 120 caracteres.'),
  telefone: telefoneOpcional,
  email: emailOpcional,
})

export type RepresentanteFormValues = z.infer<typeof representanteSchema>

/** Rotulo do nome por tipo de pessoa: "Razão social" no PJ e "Nome" no PF. */
export function rotuloDoNome(tipo: TipoPessoaFornecedor): string {
  return tipo === 'PJ' ? 'Razão social' : 'Nome'
}

/** "CNPJ" ou "CPF". */
export function rotuloDoDocumento(tipo: TipoPessoaFornecedor): string {
  return tipo === 'PJ' ? 'CNPJ' : 'CPF'
}

export const fornecedorSchema = z
  .object({
    tipoPessoa: z.enum(['PJ', 'PF']),
    documento: z.string(),
    razaoSocial: z.string().trim().max(180, 'Deve ter no máximo 180 caracteres.'),
    nomeFantasia: textoAte(180, 'Nome fantasia deve ter no máximo 180 caracteres.'),
    inscricaoEstadual: z.string().trim(),
    cep: z.string(),
    logradouro: textoAte(180, 'Logradouro deve ter no máximo 180 caracteres.'),
    numeroEndereco: textoAte(20, 'Número deve ter no máximo 20 caracteres.'),
    complemento: textoAte(120, 'Complemento deve ter no máximo 120 caracteres.'),
    bairro: textoAte(120, 'Bairro deve ter no máximo 120 caracteres.'),
    municipio: textoAte(120, 'Município deve ter no máximo 120 caracteres.'),
    uf: z.string(),
    telefone: telefoneOpcional,
    email: emailOpcional,
    observacoes: textoAte(500, 'Observações devem ter no máximo 500 caracteres.'),
    representantes: z
      .array(representanteSchema)
      .max(MAXIMO_REPRESENTANTES, `Informe no máximo ${MAXIMO_REPRESENTANTES} representantes.`),
    marcaIds: z.array(z.string()).max(MAXIMO_MARCAS, `Informe no máximo ${MAXIMO_MARCAS} marcas.`),
  })
  .superRefine((valores, ctx) => {
    const pj = valores.tipoPessoa === 'PJ'
    if (valores.razaoSocial === '') {
      ctx.addIssue({ path: ['razaoSocial'], code: 'custom', message: pj ? 'Informe a razão social.' : 'Informe o nome.' })
    }
    if (apenasDigitos(valores.documento) !== '') {
      const valido = pj ? cnpjValido(valores.documento) : cpfValido(valores.documento)
      if (!valido) {
        ctx.addIssue({ path: ['documento'], code: 'custom', message: pj ? 'CNPJ inválido.' : 'CPF inválido.' })
      }
    }
    const ie = valores.inscricaoEstadual
    if (ie !== '') {
      if (!pj) {
        ctx.addIssue({
          path: ['inscricaoEstadual'],
          code: 'custom',
          message: 'Inscrição estadual só para pessoa jurídica.',
        })
      } else if (ie.toUpperCase() !== IE_ISENTO && !/^\d{1,20}$/.test(ie)) {
        ctx.addIssue({ path: ['inscricaoEstadual'], code: 'custom', message: 'Informe só números ou ISENTO.' })
      }
    }
    if (valores.cep.trim() !== '' && apenasDigitos(valores.cep).length !== 8) {
      ctx.addIssue({ path: ['cep'], code: 'custom', message: 'O CEP deve ter 8 dígitos.' })
    }
    if (valores.uf.trim() !== '' && !ufValida(valores.uf)) {
      ctx.addIssue({ path: ['uf'], code: 'custom', message: 'UF inválida.' })
    }
  })

export type FornecedorFormValues = z.infer<typeof fornecedorSchema>

/** Campos de primeiro nivel do formulario, na ordem da tela (foco no primeiro erro). */
export const CAMPOS_NA_ORDEM: readonly (keyof FornecedorFormValues)[] = [
  'tipoPessoa',
  'documento',
  'razaoSocial',
  'nomeFantasia',
  'inscricaoEstadual',
  'cep',
  'logradouro',
  'numeroEndereco',
  'complemento',
  'bairro',
  'municipio',
  'uf',
  'telefone',
  'email',
  'observacoes',
  'representantes',
  'marcaIds',
]

export function valoresIniciais(): FornecedorFormValues {
  return {
    tipoPessoa: 'PJ',
    documento: '',
    razaoSocial: '',
    nomeFantasia: '',
    inscricaoEstadual: '',
    cep: '',
    logradouro: '',
    numeroEndereco: '',
    complemento: '',
    bairro: '',
    municipio: '',
    uf: '',
    telefone: '',
    email: '',
    observacoes: '',
    representantes: [],
    marcaIds: [],
  }
}

export function novoRepresentante(): RepresentanteFormValues {
  return { id: '', nome: '', telefone: '', email: '' }
}

/** Documento com a mascara do tipo. */
export function mascararDocumento(tipo: TipoPessoaFornecedor, valor: string): string {
  return tipo === 'PJ' ? mascararCnpj(valor) : mascararCpf(valor)
}

/** Valores do formulario a partir do fornecedor vindo da API (edicao). */
export function valoresDoFornecedor(fornecedor: Fornecedor): FornecedorFormValues {
  return {
    tipoPessoa: fornecedor.tipoPessoa,
    documento: fornecedor.documento ? mascararDocumento(fornecedor.tipoPessoa, fornecedor.documento) : '',
    razaoSocial: fornecedor.razaoSocial,
    nomeFantasia: fornecedor.nomeFantasia ?? '',
    inscricaoEstadual: fornecedor.inscricaoEstadual ?? '',
    cep: fornecedor.cep ? mascararCep(fornecedor.cep) : '',
    logradouro: fornecedor.logradouro ?? '',
    numeroEndereco: fornecedor.numeroEndereco ?? '',
    complemento: fornecedor.complemento ?? '',
    bairro: fornecedor.bairro ?? '',
    municipio: fornecedor.municipio ?? '',
    uf: fornecedor.uf ?? '',
    telefone: mascararTelefone(fornecedor.telefone ?? ''),
    email: fornecedor.email ?? '',
    observacoes: fornecedor.observacoes ?? '',
    representantes: fornecedor.representantes.map((representante) => ({
      id: representante.id,
      nome: representante.nome,
      telefone: mascararTelefone(representante.telefone ?? ''),
      email: representante.email ?? '',
    })),
    marcaIds: fornecedor.marcas.map((marca) => marca.id),
  }
}

function textoOuNulo(valor: string): string | null {
  const texto = valor.trim()
  return texto === '' ? null : texto
}

function digitosOuNulo(valor: string): string | null {
  const digitos = apenasDigitos(valor)
  return digitos === '' ? null : digitos
}

function telefoneOuNulo(valor: string): string | null {
  const digitos = normalizarDigitosTelefone(valor)
  return digitos === '' ? null : digitos
}

function representanteDoRequest(representante: RepresentanteFormValues): RepresentanteRequest {
  return {
    ...(representante.id ? { id: representante.id } : {}),
    nome: representante.nome.trim(),
    telefone: telefoneOuNulo(representante.telefone),
    email: textoOuNulo(representante.email),
  }
}

/**
 * Corpo do POST/PATCH: textos aparados, vazio como null, documento, CEP e
 * telefones so com digitos, UF e "ISENTO" em maiusculas e a IE nunca no PF.
 * Representantes e marcas vao como listas completas.
 */
export function montarRequest(valores: FornecedorFormValues): FornecedorRequest {
  const pj = valores.tipoPessoa === 'PJ'
  const ie = textoOuNulo(valores.inscricaoEstadual)
  return {
    tipoPessoa: valores.tipoPessoa,
    documento: digitosOuNulo(valores.documento),
    razaoSocial: valores.razaoSocial.trim(),
    nomeFantasia: textoOuNulo(valores.nomeFantasia),
    inscricaoEstadual: pj && ie ? ie.toUpperCase() : null,
    cep: digitosOuNulo(valores.cep),
    logradouro: textoOuNulo(valores.logradouro),
    numeroEndereco: textoOuNulo(valores.numeroEndereco),
    complemento: textoOuNulo(valores.complemento),
    bairro: textoOuNulo(valores.bairro),
    municipio: textoOuNulo(valores.municipio),
    uf: textoOuNulo(valores.uf)?.toUpperCase() ?? null,
    telefone: telefoneOuNulo(valores.telefone),
    email: textoOuNulo(valores.email),
    observacoes: textoOuNulo(valores.observacoes),
    representantes: valores.representantes.map(representanteDoRequest),
    marcaIds: valores.marcaIds,
  }
}

const CAMPOS_DO_FORMULARIO: ReadonlySet<string> = new Set(CAMPOS_NA_ORDEM)

/**
 * Caminho no formulario de uma chave de erro do backend (os campos tem os
 * nomes do request): "representantes[2].nome" -> "representantes.2.nome",
 * "marcaIds[3]" -> "marcaIds". Chave desconhecida -> null (vira mensagem geral).
 */
export function campoDoErroDoServidor(chave: string): string | null {
  const doRepresentante = /^representantes\[(\d+)]\.(nome|telefone|email)$/.exec(chave)
  if (doRepresentante) {
    return `representantes.${doRepresentante[1]}.${doRepresentante[2]}`
  }
  const raiz = chave.split(/[[.]/)[0]
  return CAMPOS_DO_FORMULARIO.has(raiz) ? raiz : null
}
