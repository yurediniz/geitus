import { mascararCnpj, mascararCpf, mascararTelefone } from '@/lib/documentos'
import type { TipoPessoaFornecedor } from '@/types/fornecedor'

/** CNPJ ou CPF formatado ("11.222.333/0001-81"); null sem documento. */
export function documentoFormatado(tipo: TipoPessoaFornecedor, documento: string | null): string | null {
  if (!documento) {
    return null
  }
  return tipo === 'PJ' ? mascararCnpj(documento) : mascararCpf(documento)
}

/** Telefone formatado ("(11) 98765-4321"); null sem telefone. */
export function telefoneFormatado(telefone: string | null): string | null {
  return telefone ? mascararTelefone(telefone) : null
}
