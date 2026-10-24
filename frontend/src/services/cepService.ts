/**
 * Consulta de CEP via ViaCEP (https://viacep.com.br), usada para autofill de
 * endereco no cadastro da empresa.
 *
 * Este servico e proposital e intencionalmente isolado do `httpClient` da nossa
 * API: e uma chamada publica a um terceiro (sem token, outra base URL, outro
 * contrato de erro). Por isso usa `fetch` direto.
 *
 * A consulta e nao-bloqueante: qualquer falha (CEP invalido, `{ erro: true }`
 * ou falha de rede) retorna `null` em vez de lancar, para a interface degradar
 * para digitacao manual sem interromper o preenchimento.
 */

/** Trecho de endereco que o ViaCEP consegue preencher automaticamente. */
export interface EnderecoViaCep {
  logradouro: string
  bairro: string
  municipio: string
  uf: string
}

/** Formato relevante da resposta do ViaCEP (campos usados no autofill). */
interface ViaCepResposta {
  erro?: boolean | string
  logradouro?: string
  bairro?: string
  localidade?: string
  uf?: string
}

/** Mantem apenas os digitos do CEP informado (ex.: "01001-000" -> "01001000"). */
function apenasDigitos(cep: string): string {
  return cep.replace(/\D/g, '')
}

/**
 * Busca o endereco de um CEP no ViaCEP.
 *
 * @param cep CEP em qualquer formato; e normalizado para 8 digitos.
 * @returns o trecho de endereco encontrado, ou `null` quando o CEP nao tem 8
 *   digitos, nao existe (`{ erro: true }`) ou a chamada falha.
 */
export async function buscarCep(cep: string): Promise<EnderecoViaCep | null> {
  const resultado = await consultarCep(cep)
  return resultado.tipo === 'encontrado' ? resultado.endereco : null
}

/**
 * Resultado da consulta de CEP que separa o CEP inexistente da falha da
 * consulta (rede, ViaCEP fora do ar, resposta invalida): na falha, a tela
 * pode oferecer buscar de novo.
 */
export type ResultadoCep =
  | { tipo: 'encontrado'; endereco: EnderecoViaCep }
  | { tipo: 'nao-encontrado' }
  | { tipo: 'falha' }

/** Consulta o CEP no ViaCEP sem lancar: CEP sem 8 digitos ou inexistente e `nao-encontrado`. */
export async function consultarCep(cep: string): Promise<ResultadoCep> {
  const digitos = apenasDigitos(cep)
  if (digitos.length !== 8) {
    return { tipo: 'nao-encontrado' }
  }

  let resposta: Response
  try {
    resposta = await fetch(`https://viacep.com.br/ws/${digitos}/json/`)
  } catch {
    // Falha de rede / ViaCEP indisponivel: degrada para digitacao manual.
    return { tipo: 'falha' }
  }

  // 400 e o formato recusado pelo ViaCEP; os demais erros sao do servico.
  if (!resposta.ok) {
    return resposta.status === 400 ? { tipo: 'nao-encontrado' } : { tipo: 'falha' }
  }

  let corpo: ViaCepResposta
  try {
    corpo = (await resposta.json()) as ViaCepResposta
  } catch {
    return { tipo: 'falha' }
  }

  // ViaCEP sinaliza CEP inexistente com `erro` (booleano ou string "true").
  if (corpo.erro) {
    return { tipo: 'nao-encontrado' }
  }

  return {
    tipo: 'encontrado',
    endereco: {
      logradouro: corpo.logradouro ?? '',
      bairro: corpo.bairro ?? '',
      municipio: corpo.localidade ?? '',
      uf: corpo.uf ?? '',
    },
  }
}
