/**
 * Mascaras e validacoes de documentos de pessoa fisica (CPF e telefone BR).
 *
 * Compartilhadas entre Empresa e Clientes. Espelham as regras do backend
 * (`shared.validation`) para o formulario nao aceitar o que a API rejeita.
 */

// --- Normalizacao e mascaras ------------------------------------------------

/** Mantem apenas os digitos de um texto. */
export function apenasDigitos(valor: string): string {
  return valor.replace(/\D/g, '')
}

/** Formata CPF progressivamente: 000.000.000-00. */
export function mascararCpf(valor: string): string {
  const d = apenasDigitos(valor).slice(0, 11)
  return d
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

/**
 * Digitos de um telefone BR sem o codigo do pais: quando ha 12 ou 13 digitos
 * comecando com 55 (ex.: numero colado como "+55 11 98765-4321"), remove o
 * prefixo. Evita que o "55" vire DDD e corte o final do numero.
 */
export function normalizarDigitosTelefone(valor: string): string {
  const d = apenasDigitos(valor)
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) {
    return d.slice(2)
  }
  return d
}

/** Formata telefone BR progressivamente: (00) 0000-0000 ou (00) 00000-0000. */
export function mascararTelefone(valor: string): string {
  const d = normalizarDigitosTelefone(valor).slice(0, 11)
  if (d.length <= 10) {
    return d
      .replace(/^(\d{2})(\d)/, '($1) $2')
      .replace(/^\((\d{2})\) (\d{4})(\d)/, '($1) $2-$3')
  }
  return d
    .replace(/^(\d{2})(\d)/, '($1) $2')
    .replace(/^\((\d{2})\) (\d{5})(\d)/, '($1) $2-$3')
}

// --- Validadores ------------------------------------------------------------

/** Valida um CPF pelos digitos verificadores. */
export function cpfValido(valor: string): boolean {
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

/**
 * Telefone BR: DDD + numero (10 ou 11 digitos), com DDD entre 11 e 99 —
 * igual ao `Telefones.valido` do backend.
 */
export function telefoneValido(valor: string): boolean {
  const d = normalizarDigitosTelefone(valor)
  if (d.length !== 10 && d.length !== 11) {
    return false
  }
  const ddd = Number(d.slice(0, 2))
  return ddd >= 11 && ddd <= 99
}
