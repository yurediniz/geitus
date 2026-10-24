import { describe, it, expect } from 'vitest'

import {
  MAXIMO_MARCAS,
  mascararInscricaoEstadual,
  MAXIMO_REPRESENTANTES,
  campoDoErroDoServidor,
  fornecedorSchema,
  montarRequest,
  valoresDoFornecedor,
  valoresIniciais,
  type FornecedorFormValues,
} from '@/features/suppliers/fornecedorFormulario'
import type { Fornecedor } from '@/types/fornecedor'

function erros(valores: FornecedorFormValues): Record<string, string> {
  const resultado = fornecedorSchema.safeParse(valores)
  if (resultado.success) {
    return {}
  }
  return Object.fromEntries(resultado.error.issues.map((issue) => [issue.path.join('.'), issue.message]))
}

const BASE: FornecedorFormValues = { ...valoresIniciais(), razaoSocial: 'Distribuidora Sul' }

const FORNECEDOR: Fornecedor = {
  id: 'f1',
  numero: 7,
  tipoPessoa: 'PJ',
  documento: '11222333000181',
  razaoSocial: 'Distribuidora Sul Ltda',
  nomeFantasia: 'Dist Sul',
  inscricaoEstadual: 'ISENTO',
  cep: '01001000',
  logradouro: 'Praça da Sé',
  numeroEndereco: '100',
  complemento: null,
  bairro: 'Sé',
  municipio: 'São Paulo',
  uf: 'SP',
  telefone: '1132104000',
  email: 'compras@distsul.com.br',
  observacoes: null,
  representantes: [{ id: 'r1', nome: 'Carlos', telefone: '11987654321', email: null }],
  marcas: [{ id: 'nexgard', nome: 'Nexgard', caminho: 'Boehringer › Nexgard' }],
  quantidadeProdutos: 3,
  ativo: true,
  criadoEm: '2026-10-24T10:00:00',
  atualizadoEm: null,
}

describe('fornecedorFormulario', () => {
  it('so o nome e obrigatorio, com o texto do tipo de pessoa', () => {
    expect(erros(BASE)).toEqual({})
    expect(erros({ ...BASE, razaoSocial: '  ' })).toEqual({ razaoSocial: 'Informe a razão social.' })
    expect(erros({ ...BASE, tipoPessoa: 'PF', razaoSocial: '' })).toEqual({ razaoSocial: 'Informe o nome.' })
  })

  it('valida o CNPJ no PJ e o CPF no PF', () => {
    expect(erros({ ...BASE, documento: '11.222.333/0001-82' })).toEqual({ documento: 'CNPJ inválido.' })
    expect(erros({ ...BASE, documento: '11.222.333/0001-81' })).toEqual({})
    expect(erros({ ...BASE, tipoPessoa: 'PF', documento: '111.444.777-36' })).toEqual({ documento: 'CPF inválido.' })
    expect(erros({ ...BASE, tipoPessoa: 'PF', documento: '111.444.777-35' })).toEqual({})
  })

  it('aceita IE com digitos ou ISENTO so no PJ (Review Focus 4)', () => {
    expect(erros({ ...BASE, inscricaoEstadual: '110.042.490.114' })).toEqual({
      inscricaoEstadual: 'Informe só números ou ISENTO.',
    })
    expect(erros({ ...BASE, inscricaoEstadual: '110042490114' })).toEqual({})
    expect(erros({ ...BASE, inscricaoEstadual: 'isento' })).toEqual({})
    expect(erros({ ...BASE, tipoPessoa: 'PF', inscricaoEstadual: '110042490114' })).toEqual({
      inscricaoEstadual: 'Inscrição estadual só para pessoa jurídica.',
    })
  })

  it('a mascara da IE tira o que nao e digito, mas deixa digitar ISENTO', () => {
    expect(mascararInscricaoEstadual('110.042.490.114')).toBe('110042490114')
    expect(mascararInscricaoEstadual('is')).toBe('IS')
    expect(mascararInscricaoEstadual('isento')).toBe('ISENTO')
    expect(mascararInscricaoEstadual('isentos')).toBe('')
    expect(mascararInscricaoEstadual('12a3')).toBe('123')
  })

  it('o nome longo diz o rotulo do tipo', () => {
    const longo = 'x'.repeat(181)
    expect(erros({ ...BASE, razaoSocial: longo })).toEqual({ razaoSocial: 'Razão social deve ter no máximo 180 caracteres.' })
    expect(erros({ ...BASE, tipoPessoa: 'PF', razaoSocial: longo })).toEqual({
      razaoSocial: 'Nome deve ter no máximo 180 caracteres.',
    })
  })

  it('valida CEP, UF, e-mail e telefone quando informados', () => {
    expect(erros({ ...BASE, cep: '0100-100' })).toEqual({ cep: 'O CEP deve ter 8 dígitos.' })
    expect(erros({ ...BASE, uf: 'XX' })).toEqual({ uf: 'UF inválida.' })
    expect(erros({ ...BASE, email: 'compras@' })).toEqual({ email: 'E-mail inválido.' })
    expect(erros({ ...BASE, telefone: '(11) 1234' })).toEqual({ telefone: 'Informe um telefone válido com DDD.' })
  })

  it('representantes: nome obrigatorio e no maximo 10', () => {
    const representante = { id: '', nome: 'Carlos', telefone: '', email: '' }
    expect(erros({ ...BASE, representantes: [{ ...representante, nome: ' ', telefone: '(11) 98765-4321' }] })).toEqual({
      'representantes.0.nome': 'Informe o nome do representante.',
    })
    // A linha nova totalmente em branco nao e erro: e descartada ao salvar.
    expect(erros({ ...BASE, representantes: [{ ...representante, nome: ' ' }] })).toEqual({})
    // A gravada (com id) apagada ate ficar em branco continua pedindo o nome.
    expect(erros({ ...BASE, representantes: [{ ...representante, id: 'r1', nome: ' ' }] })).toEqual({
      'representantes.0.nome': 'Informe o nome do representante.',
    })
    expect(erros({ ...BASE, representantes: [{ ...representante, email: 'x' }] })).toEqual({
      'representantes.0.email': 'E-mail inválido.',
    })
    const onze = Array.from({ length: MAXIMO_REPRESENTANTES + 1 }, () => representante)
    expect(erros({ ...BASE, representantes: onze })).toEqual({ representantes: 'Informe no máximo 10 representantes.' })
  })

  it('o representante totalmente em branco nao vai no request', () => {
    const request = montarRequest({
      ...BASE,
      representantes: [
        { id: '', nome: '', telefone: '', email: ' ' },
        { id: 'r1', nome: 'Carlos', telefone: '', email: '' },
      ],
    })
    expect(request.representantes).toEqual([{ id: 'r1', nome: 'Carlos', telefone: null, email: null }])
  })

  it('marcas: no maximo 200', () => {
    const marcaIds = Array.from({ length: MAXIMO_MARCAS + 1 }, (_, indice) => `m${indice}`)
    expect(erros({ ...BASE, marcaIds })).toEqual({ marcaIds: 'Informe no máximo 200 marcas.' })
  })

  it('carrega o fornecedor com as mascaras e devolve o mesmo request', () => {
    const valores = valoresDoFornecedor(FORNECEDOR)
    expect(valores).toMatchObject({
      documento: '11.222.333/0001-81',
      cep: '01001-000',
      telefone: '(11) 3210-4000',
      representantes: [{ id: 'r1', nome: 'Carlos', telefone: '(11) 98765-4321', email: '' }],
      marcaIds: ['nexgard'],
    })
    expect(montarRequest(valores)).toEqual({
      tipoPessoa: 'PJ',
      documento: '11222333000181',
      razaoSocial: 'Distribuidora Sul Ltda',
      nomeFantasia: 'Dist Sul',
      inscricaoEstadual: 'ISENTO',
      cep: '01001000',
      logradouro: 'Praça da Sé',
      numeroEndereco: '100',
      complemento: null,
      bairro: 'Sé',
      municipio: 'São Paulo',
      uf: 'SP',
      telefone: '1132104000',
      email: 'compras@distsul.com.br',
      observacoes: null,
      representantes: [{ id: 'r1', nome: 'Carlos', telefone: '11987654321', email: null }],
      marcaIds: ['nexgard'],
    })
  })

  it('o request apara textos, manda vazio como null, o representante novo sem id e nunca a IE no PF', () => {
    const request = montarRequest({
      ...BASE,
      tipoPessoa: 'PF',
      razaoSocial: '  João da Silva ',
      documento: '111.444.777-35',
      inscricaoEstadual: '123',
      uf: 'sp',
      representantes: [{ id: '', nome: ' Ana ', telefone: '', email: '' }],
    })
    expect(request).toMatchObject({
      tipoPessoa: 'PF',
      razaoSocial: 'João da Silva',
      documento: '11144477735',
      inscricaoEstadual: null,
      nomeFantasia: null,
      cep: null,
      uf: 'SP',
      representantes: [{ nome: 'Ana', telefone: null, email: null }],
    })
    expect(request.representantes[0]).not.toHaveProperty('id')
  })

  it('o indice do representante no erro do backend vira o da tela (as linhas em branco nao foram)', () => {
    expect(campoDoErroDoServidor('representantes[0].telefone', [1, 3])).toBe('representantes.1.telefone')
    expect(campoDoErroDoServidor('representantes[1].nome', [1, 3])).toBe('representantes.3.nome')
    expect(campoDoErroDoServidor('representantes[5].nome', [1, 3])).toBe('representantes')
  })

  it('leva as chaves de erro do backend ao campo da tela', () => {
    expect(campoDoErroDoServidor('documento')).toBe('documento')
    expect(campoDoErroDoServidor('cep')).toBe('cep')
    expect(campoDoErroDoServidor('uf')).toBe('uf')
    expect(campoDoErroDoServidor('numeroEndereco')).toBe('numeroEndereco')
    expect(campoDoErroDoServidor('representantes[2].nome')).toBe('representantes.2.nome')
    expect(campoDoErroDoServidor('marcaIds[3]')).toBe('marcaIds')
    expect(campoDoErroDoServidor('desconhecido')).toBeNull()
  })
})
