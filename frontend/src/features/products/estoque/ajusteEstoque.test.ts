import { describe, expect, it } from 'vitest'

import {
  MENSAGEM_CUSTO_OBRIGATORIO,
  MENSAGEM_CUSTO_POSITIVO,
  ROTULO_MOTIVO,
  ROTULO_TIPO,
  calcularPrevia,
  custoPorUnidade,
  dicaDoUltimoCusto,
  embalagemDoAjuste,
  embalagemPadrao,
  mensagemDeSucesso,
  motivoPadrao,
  motivosDoTipo,
  exigeCusto,
  quantidadeEmUnidades,
  rotuloConfirmar,
  rotuloDoCusto,
  textoDaPrevia,
  textoDaPreviaComCusto,
  textoDoCustoPorUnidade,
  textoMovimento,
  validarAjuste,
  type DadosAjuste,
} from '@/features/products/estoque/ajusteEstoque'
import type { MovimentoEstoque } from '@/types/estoque'

const MOVIMENTO: MovimentoEstoque = {
  id: 'mov-1',
  tipo: 'SAIDA',
  motivo: 'PERDA_AVARIA',
  origem: 'AJUSTE_MANUAL',
  quantidade: -2,
  saldoAnterior: 12,
  saldoNovo: 10,
  observacao: 'Caixa amassada',
  usuarioNome: 'Ana Souza',
  criadoEm: '2026-10-21T15:20:00',
  embalagem: null,
  custoInformado: null,
  custoUnitario: null,
}

/** O "R$" do Intl vem com espaco nao separavel: os textos esperados usam o espaco comum. */
function semNbsp(texto: string | null | undefined): string | null | undefined {
  return texto?.replace(/\u00a0/g, ' ')
}

describe('ajusteEstoque', () => {
  it('motivosDoTipo segue a ordem da spec, sem os motivos do sistema', () => {
    expect(motivosDoTipo('ENTRADA')).toEqual(['COMPRA', 'DEVOLUCAO_CLIENTE', 'OUTRO'])
    expect(motivosDoTipo('SAIDA')).toEqual(['PERDA_AVARIA', 'VENCIDO', 'USO_INTERNO', 'DEVOLUCAO_FORNECEDOR', 'OUTRO'])
    expect(motivosDoTipo('AJUSTE')).toEqual(['CONTAGEM', 'OUTRO'])
  })

  it('motivo pré-selecionado: Compra na entrada, Contagem na contagem e nenhum na saída', () => {
    expect(motivoPadrao('ENTRADA')).toBe('COMPRA')
    expect(motivoPadrao('AJUSTE')).toBe('CONTAGEM')
    expect(motivoPadrao('SAIDA')).toBe('')
  })

  it('rótulos de tipo e motivo em pt-BR', () => {
    expect(ROTULO_TIPO).toEqual({ ENTRADA: 'Entrada', SAIDA: 'Saída', AJUSTE: 'Contagem' })
    expect(ROTULO_MOTIVO.PERDA_AVARIA).toBe('Perda/avaria')
    expect(ROTULO_MOTIVO.ESTOQUE_INICIAL).toBe('Estoque inicial')
    expect(ROTULO_MOTIVO.CONTAGEM).toBe('Contagem/inventário')
  })

  describe('calcularPrevia', () => {
    const ok = (saldoNovo: number, variacao: number) => ({ saldoNovo, variacao, erro: null, confere: null })

    it('entrada soma, saída subtrai e contagem vai para o contado, com a variação', () => {
      expect(calcularPrevia('ENTRADA', 5, 12, 'UN')).toEqual(ok(17, 5))
      expect(calcularPrevia('SAIDA', 2, 12, 'UN')).toEqual(ok(10, -2))
      expect(calcularPrevia('AJUSTE', 10, 12, 'UN')).toEqual(ok(10, -2))
      expect(calcularPrevia('AJUSTE', 0, 12, 'UN')).toEqual(ok(0, -12))
    })

    it('saída igual ao saldo zera; acima dele é saldo insuficiente', () => {
      expect(calcularPrevia('SAIDA', 3, 3, 'UN')).toEqual(ok(0, -3))
      expect(calcularPrevia('SAIDA', 4, 3, 'UN')).toEqual({
        saldoNovo: null,
        variacao: null,
        erro: 'Saldo insuficiente: há 3 UN.',
        confere: null,
      })
      expect(calcularPrevia('SAIDA', 3.001, 3, 'KG').erro).toBe('Saldo insuficiente: há 3 KG.')
    })

    it('contagem igual ao saldo confere (tom neutro, sem erro)', () => {
      expect(calcularPrevia('AJUSTE', 12, 12, 'UN')).toEqual({
        saldoNovo: null,
        variacao: null,
        erro: null,
        confere: 'A contagem confere com o saldo (12 UN). Não há nada a ajustar.',
      })
    })

    it('conta em milésimos, sem erro de ponto flutuante, e formata com vírgula', () => {
      expect(calcularPrevia('SAIDA', 0.1, 0.3, 'KG')).toEqual(ok(0.2, -0.1))
      expect(calcularPrevia('ENTRADA', 0.2, 0.1, 'KG')).toEqual(ok(0.3, 0.2))
      expect(calcularPrevia('AJUSTE', 2.5, 2.5, 'KG').confere).toBe(
        'A contagem confere com o saldo (2,5 KG). Não há nada a ajustar.',
      )
    })
  })

  it('textoDaPrevia: a contagem mostra também a diferença', () => {
    const previa = (tipo: 'ENTRADA' | 'SAIDA' | 'AJUSTE', quantidade: number) =>
      textoDaPrevia(tipo, 12, calcularPrevia(tipo, quantidade, 12, 'UN'), 'UN')
    expect(previa('ENTRADA', 5)).toBe('Saldo: 12 UN → 17 UN')
    expect(previa('SAIDA', 2)).toBe('Saldo: 12 UN → 10 UN')
    expect(previa('AJUSTE', 10)).toBe('Saldo: 12 UN → 10 UN (−2 UN)')
    expect(previa('AJUSTE', 15)).toBe('Saldo: 12 UN → 15 UN (+3 UN)')
    expect(previa('AJUSTE', 0)).toBe('Saldo: 12 UN → 0 UN (−12 UN)')
    expect(previa('AJUSTE', 12)).toBeNull()
    expect(previa('SAIDA', 13)).toBeNull()
  })

  it('rotuloConfirmar diz a ação', () => {
    expect(rotuloConfirmar('ENTRADA', null, 'UN')).toBe('Registrar entrada')
    expect(rotuloConfirmar('SAIDA', calcularPrevia('SAIDA', 2, 12, 'UN'), 'UN')).toBe('Registrar saída')
    expect(rotuloConfirmar('AJUSTE', calcularPrevia('AJUSTE', 10, 12, 'UN'), 'UN')).toBe('Ajustar para 10 UN')
    expect(rotuloConfirmar('AJUSTE', calcularPrevia('AJUSTE', 0, 12, 'UN'), 'UN')).toBe('Zerar estoque')
    expect(rotuloConfirmar('AJUSTE', calcularPrevia('AJUSTE', 12, 12, 'UN'), 'UN')).toBe('Fechar')
    expect(rotuloConfirmar('AJUSTE', null, 'UN')).toBe('Registrar contagem')
  })

  describe('validarAjuste', () => {
    const contexto = { saldo: 12, sigla: 'UN', fracionada: false }
    const saida: DadosAjuste = { tipo: 'SAIDA', quantidade: '2', motivo: 'PERDA_AVARIA', observacao: '' }

    it('dados válidos devolvem a quantidade sem erros', () => {
      expect(validarAjuste(saida, contexto)).toEqual({ quantidade: 2, erros: {}, confere: false })
      expect(validarAjuste({ ...saida, quantidade: '2,5' }, { ...contexto, fracionada: true })).toEqual({
        quantidade: 2.5,
        erros: {},
        confere: false,
      })
    })

    it('quantidade obrigatória, > 0 na entrada e na saída, até 3 casas', () => {
      expect(validarAjuste({ ...saida, quantidade: '' }, contexto).erros).toEqual({ quantidade: 'Informe a quantidade.' })
      expect(validarAjuste({ ...saida, quantidade: '0' }, contexto).erros).toEqual({
        quantidade: 'Informe uma quantidade maior que zero.',
      })
      expect(validarAjuste({ ...saida, quantidade: '-1' }, contexto).erros).toEqual({
        quantidade: 'Informe uma quantidade maior que zero.',
      })
      expect(validarAjuste({ ...saida, quantidade: '1,2345' }, contexto).erros).toEqual({
        quantidade: 'Use no máximo 3 casas decimais.',
      })
    })

    it('na contagem, o saldo contado pode ser zero, mas não negativo nem vazio', () => {
      const contagem: DadosAjuste = { tipo: 'AJUSTE', quantidade: '0', motivo: 'CONTAGEM', observacao: '' }
      expect(validarAjuste(contagem, contexto)).toEqual({ quantidade: 0, erros: {}, confere: false })
      expect(validarAjuste({ ...contagem, quantidade: '' }, contexto).erros).toEqual({
        quantidade: 'Informe o saldo contado.',
      })
      expect(validarAjuste({ ...contagem, quantidade: '-1' }, contexto).erros).toEqual({
        quantidade: 'O saldo contado não pode ser negativo.',
      })
    })

    it('fração só em unidade fracionada', () => {
      expect(validarAjuste({ ...saida, quantidade: '2,5' }, contexto).erros).toEqual({
        quantidade: 'A unidade UN não aceita quantidade fracionada.',
      })
    })

    it('saldo insuficiente barra o envio; contagem igual ao saldo não é erro, mas confere', () => {
      expect(validarAjuste({ ...saida, quantidade: '13' }, contexto).erros).toEqual({
        quantidade: 'Saldo insuficiente: há 12 UN.',
      })
      expect(
        validarAjuste({ tipo: 'AJUSTE', quantidade: '12', motivo: 'CONTAGEM', observacao: '' }, contexto),
      ).toEqual({ quantidade: 12, erros: {}, confere: true })
    })

    it('motivo obrigatório e do tipo; "Outro" exige observação', () => {
      expect(validarAjuste({ ...saida, motivo: '' }, contexto).erros).toEqual({ motivo: 'Selecione o motivo.' })
      expect(validarAjuste({ ...saida, motivo: 'COMPRA' }, contexto).erros).toEqual({ motivo: 'Selecione o motivo.' })
      expect(validarAjuste({ ...saida, motivo: 'OUTRO', observacao: '   ' }, contexto).erros).toEqual({
        observacao: 'Descreva o motivo.',
      })
      expect(validarAjuste({ ...saida, motivo: 'OUTRO', observacao: 'Doação' }, contexto).erros).toEqual({})
    })
  })

  it('mensagemDeSucesso diz o que foi feito e o saldo novo', () => {
    const entrada: MovimentoEstoque = { ...MOVIMENTO, tipo: 'ENTRADA', motivo: 'COMPRA', quantidade: 5, saldoNovo: 17 }
    expect(mensagemDeSucesso(entrada, 'UN')).toBe('Entrada de 5 UN registrada. Saldo: 17 UN.')
    expect(mensagemDeSucesso(MOVIMENTO, 'UN')).toBe('Saída de 2 UN registrada. Saldo: 10 UN.')
    expect(mensagemDeSucesso({ ...MOVIMENTO, tipo: 'AJUSTE', motivo: 'CONTAGEM' }, 'UN')).toBe(
      'Estoque ajustado para 10 UN (−2 UN).',
    )
    expect(
      mensagemDeSucesso({ ...MOVIMENTO, tipo: 'AJUSTE', motivo: 'CONTAGEM', quantidade: 2.5, saldoNovo: 14.5 }, 'KG'),
    ).toBe('Estoque ajustado para 14,5 KG (+2,5 KG).')
    expect(
      mensagemDeSucesso({ ...MOVIMENTO, tipo: 'AJUSTE', motivo: 'CONTAGEM', quantidade: -12, saldoNovo: 0 }, 'UN'),
    ).toBe('Estoque zerado (−12 UN).')
  })

  describe('textoMovimento', () => {
    it('saída: tipo e motivo, quantidade com sinal de menos e a sigla, saldos', () => {
      expect(textoMovimento(MOVIMENTO, 'UN')).toEqual({
        titulo: 'Saída · Perda/avaria',
        quantidade: '−2 UN',
        saldos: '12 → 10',
        saldosFalados: 'saldo de 12 para 10',
        custo: null,
      })
    })

    it('entrada com sinal de mais e fração com vírgula; contagem aparece como "Ajuste"', () => {
      expect(
        textoMovimento(
          {
            ...MOVIMENTO,
            tipo: 'ENTRADA',
            motivo: 'ESTOQUE_INICIAL',
            origem: 'CADASTRO',
            quantidade: 2.5,
            saldoAnterior: 0,
            saldoNovo: 2.5,
          },
          'KG',
        ),
      ).toEqual({
        titulo: 'Entrada · Estoque inicial',
        quantidade: '+2,5 KG',
        saldos: '0 → 2,5',
        saldosFalados: 'saldo de 0 para 2,5',
        custo: null,
      })
      expect(textoMovimento({ ...MOVIMENTO, tipo: 'AJUSTE', motivo: 'CONTAGEM' }, 'UN').titulo).toBe(
        'Ajuste · Contagem/inventário',
      )
    })

    it('movimento informado em embalagens mostra o retrato junto da quantidade', () => {
      const entrada: MovimentoEstoque = {
        ...MOVIMENTO,
        tipo: 'ENTRADA',
        motivo: 'COMPRA',
        quantidade: 36,
        saldoAnterior: 10,
        saldoNovo: 46,
        embalagem: { rotulo: 'CX c/ 18 UN', quantidadePorEmbalagem: 18, quantidadeDeEmbalagens: 2 },
      }
      expect(textoMovimento(entrada, 'UN').quantidade).toBe('+36 UN (2 CX c/ 18 UN)')
    })
  })

  describe('embalagens no ajuste (Fase B3)', () => {
    const FARDO = { id: 'fd6', rotulo: 'FD c/ 6 UN', quantidade: 6, deCompra: false }
    const CAIXA = { id: 'cx18', rotulo: 'CX c/ 18 UN', quantidade: 18, deCompra: true }
    const contexto = { saldo: 10, sigla: 'UN', fracionada: false, embalagens: [FARDO, CAIXA] }
    const entrada: DadosAjuste = {
      tipo: 'ENTRADA',
      quantidade: '2',
      motivo: 'COMPRA',
      observacao: '',
      embalagemId: 'cx18',
      custo: '180.00',
    }

    it('padrão: a embalagem de compra na Entrada com Compra; senão a unidade de venda', () => {
      expect(embalagemPadrao('ENTRADA', 'COMPRA', [FARDO, CAIXA])).toBe('cx18')
      expect(embalagemPadrao('ENTRADA', 'DEVOLUCAO_CLIENTE', [FARDO, CAIXA])).toBe('')
      expect(embalagemPadrao('SAIDA', '', [FARDO, CAIXA])).toBe('')
      expect(embalagemPadrao('ENTRADA', 'COMPRA', [FARDO])).toBe('')
    })

    it('com embalagem, a quantidade é o número de embalagens e o total vai em unidades', () => {
      expect(validarAjuste(entrada, contexto)).toEqual({ quantidade: 2, erros: {}, confere: false })
      expect(quantidadeEmUnidades(entrada, contexto)).toBe(36)
      expect(quantidadeEmUnidades({ ...entrada, embalagemId: '' }, contexto)).toBe(2)
    })

    it('com embalagem, a quantidade é inteira e > 0', () => {
      for (const quantidade of ['1,5', '0', '-1']) {
        expect(validarAjuste({ ...entrada, quantidade }, contexto).erros).toEqual({
          quantidade: 'Informe um número inteiro de embalagens.',
        })
      }
      expect(validarAjuste({ ...entrada, quantidade: '' }, contexto).erros).toEqual({ quantidade: 'Informe a quantidade.' })
    })

    it('o saldo é conferido sobre o total em unidades', () => {
      const saida: DadosAjuste = { ...entrada, tipo: 'SAIDA', motivo: 'PERDA_AVARIA', quantidade: '3' }
      expect(validarAjuste(saida, { ...contexto, saldo: 46 }).erros).toEqual({
        quantidade: 'Saldo insuficiente: há 46 UN.',
      })
      expect(validarAjuste(saida, { ...contexto, saldo: 54 }).erros).toEqual({})
    })

    it('na contagem, a embalagem é ignorada (a contagem é na unidade de venda)', () => {
      const contagem: DadosAjuste = { ...entrada, tipo: 'AJUSTE', motivo: 'CONTAGEM', quantidade: '5' }
      expect(embalagemDoAjuste(contagem, contexto)).toBeUndefined()
      expect(quantidadeEmUnidades(contagem, contexto)).toBe(5)
    })

    it('prévia em embalagens: "2 CX c/ 18 UN = +36 UN · saldo 10 → 46"', () => {
      const previa = calcularPrevia('ENTRADA', 36, 10, 'UN')
      expect(textoDaPrevia('ENTRADA', 10, previa, 'UN', { quantidade: 2, rotulo: 'CX c/ 18 UN' })).toBe(
        '2 CX c/ 18 UN = +36 UN · Saldo: 10 UN → 46 UN',
      )
      const saida = calcularPrevia('SAIDA', 54, 54, 'UN')
      expect(textoDaPrevia('SAIDA', 54, saida, 'UN', { quantidade: 3, rotulo: 'CX c/ 18 UN' })).toBe(
        '3 CX c/ 18 UN = −54 UN · Saldo: 54 UN → 0 UN',
      )
    })

    it('o botão de confirmar em embalagens diz o total em unidades', () => {
      expect(rotuloConfirmar('ENTRADA', calcularPrevia('ENTRADA', 36, 10, 'UN'), 'UN', 36)).toBe(
        'Registrar entrada de 36 UN',
      )
      expect(rotuloConfirmar('SAIDA', calcularPrevia('SAIDA', 36, 54, 'UN'), 'UN', 36)).toBe('Registrar saída de 36 UN')
      expect(rotuloConfirmar('ENTRADA', null, 'UN')).toBe('Registrar entrada')
    })

    it('a mensagem de sucesso diz as embalagens', () => {
      const movimento: MovimentoEstoque = {
        ...MOVIMENTO,
        tipo: 'ENTRADA',
        motivo: 'COMPRA',
        quantidade: 36,
        saldoAnterior: 10,
        saldoNovo: 46,
        embalagem: { rotulo: 'CX c/ 18 UN', quantidadePorEmbalagem: 18, quantidadeDeEmbalagens: 2 },
      }
      expect(mensagemDeSucesso(movimento, 'UN')).toBe('Entrada de 36 UN (2 CX c/ 18 UN) registrada. Saldo: 46 UN.')
    })
  })

  describe('custo na entrada por compra (Fase B4)', () => {
    const contexto = { saldo: 10, sigla: 'UN', fracionada: false }
    const compra: DadosAjuste = { tipo: 'ENTRADA', quantidade: '10', motivo: 'COMPRA', observacao: '', custo: '10.00' }

    it('só a Entrada com motivo Compra exige o custo', () => {
      expect(exigeCusto('ENTRADA', 'COMPRA')).toBe(true)
      expect(exigeCusto('ENTRADA', 'DEVOLUCAO_CLIENTE')).toBe(false)
      expect(exigeCusto('ENTRADA', 'OUTRO')).toBe(false)
      expect(exigeCusto('SAIDA', 'PERDA_AVARIA')).toBe(false)
      expect(exigeCusto('AJUSTE', 'CONTAGEM')).toBe(false)
    })

    it('compra sem custo ou com custo zero é barrada; com custo, passa', () => {
      expect(MENSAGEM_CUSTO_OBRIGATORIO).toBe('Informe o custo da compra.')
      expect(MENSAGEM_CUSTO_POSITIVO).toBe('O custo deve ser maior que zero.')
      expect(validarAjuste(compra, contexto).erros).toEqual({})
      expect(validarAjuste({ ...compra, custo: '' }, contexto).erros).toEqual({ custo: 'Informe o custo da compra.' })
      expect(validarAjuste({ ...compra, custo: undefined }, contexto).erros).toEqual({
        custo: 'Informe o custo da compra.',
      })
      expect(validarAjuste({ ...compra, custo: '0.00' }, contexto).erros).toEqual({
        custo: 'O custo deve ser maior que zero.',
      })
    })

    it('fora da compra, o custo não é validado', () => {
      expect(validarAjuste({ ...compra, motivo: 'DEVOLUCAO_CLIENTE', custo: '' }, contexto).erros).toEqual({})
      const saida: DadosAjuste = { ...compra, tipo: 'SAIDA', motivo: 'PERDA_AVARIA', quantidade: '2', custo: '' }
      expect(validarAjuste(saida, contexto).erros).toEqual({})
    })

    it('custoPorUnidade: o informado na unidade; na embalagem, ÷ quantidade com 4 casas e depois centavos, meio para cima', () => {
      expect(custoPorUnidade('10.00', null)).toBe('10.00')
      expect(custoPorUnidade('180.00', 18)).toBe('10.00')
      // Review Focus 3: 100 / 3 = 33,3333 no movimento e 33,33 no produto.
      expect(custoPorUnidade('100.00', 3)).toBe('33.33')
      expect(custoPorUnidade('200.00', 3)).toBe('66.67')
      // Os dois arredondamentos do backend: 1,34 / 4 = 0,335 -> 0,3350 -> 0,34.
      expect(custoPorUnidade('1.34', 4)).toBe('0.34')
      // 0,03 / 7 = 0,0042857 -> 0,0043 -> 0,00 (a mesma conta, mesmo quando zera).
      expect(custoPorUnidade('0.03', 7)).toBe('0.00')
      // Embalagem fracionada (SC c/ 25,5 KG): 127,50 / 25,5 = 5,00.
      expect(custoPorUnidade('127.50', 25.5)).toBe('5.00')
      expect(custoPorUnidade('', 18)).toBeNull()
      expect(custoPorUnidade('0.00', 18)).toBeNull()
    })

    it('rótulo do campo: por unidade de venda ou da embalagem', () => {
      expect(rotuloDoCusto('UN')).toBe('Custo por UN')
      expect(rotuloDoCusto('UN', { rotulo: 'CX c/ 18 UN' })).toBe('Custo da CX c/ 18 UN')
    })

    it('dica do último custo só com custo no produto (Review Focus 5)', () => {
      expect(semNbsp(dicaDoUltimoCusto(9.5, 'UN'))).toBe('Último custo: R$ 9,50 por UN.')
      expect(dicaDoUltimoCusto(null, 'UN')).toBeNull()
    })

    it('custo por unidade da embalagem: "= R$ 10,00 por UN"', () => {
      expect(semNbsp(textoDoCustoPorUnidade('10.00', 'UN'))).toBe('= R$ 10,00 por UN')
      expect(semNbsp(textoDoCustoPorUnidade('33.33', 'UN'))).toBe('= R$ 33,33 por UN')
    })

    it('prévia com o custo: a mudança, "(sem mudança)" e o primeiro custo', () => {
      const base = '2 CX c/ 18 UN = +36 UN · Saldo: 10 UN → 46 UN'
      expect(semNbsp(textoDaPreviaComCusto(base, '10.00', 9.5, 'UN'))).toBe(
        '2 CX c/ 18 UN = +36 UN · Saldo: 10 UN → 46 UN · Custo: R$ 9,50 → R$ 10,00 por UN',
      )
      expect(semNbsp(textoDaPreviaComCusto(base, '10.00', 10, 'UN'))).toBe(
        '2 CX c/ 18 UN = +36 UN · Saldo: 10 UN → 46 UN · Custo: R$ 10,00 por UN (sem mudança)',
      )
      // Sem custo no produto, nao ha de onde vir a seta.
      expect(semNbsp(textoDaPreviaComCusto(base, '10.00', null, 'UN'))).toBe(
        '2 CX c/ 18 UN = +36 UN · Saldo: 10 UN → 46 UN · Custo: R$ 10,00 por UN',
      )
      // Sem custo digitado, a previa fica como era; sem previa, nada.
      expect(textoDaPreviaComCusto(base, null, 9.5, 'UN')).toBe(base)
      expect(textoDaPreviaComCusto(null, '10.00', 9.5, 'UN')).toBeNull()
    })

    it('a mensagem de sucesso diz o custo novo só quando ele mudou', () => {
      const compraGravada: MovimentoEstoque = {
        ...MOVIMENTO,
        tipo: 'ENTRADA',
        motivo: 'COMPRA',
        quantidade: 36,
        saldoAnterior: 10,
        saldoNovo: 46,
        embalagem: { rotulo: 'CX c/ 18 UN', quantidadePorEmbalagem: 18, quantidadeDeEmbalagens: 2 },
        custoInformado: 180,
        custoUnitario: 10,
      }
      expect(semNbsp(mensagemDeSucesso(compraGravada, 'UN', 9.5))).toBe(
        'Entrada de 36 UN (2 CX c/ 18 UN) registrada. Saldo: 46 UN. Custo atualizado para R$ 10,00.',
      )
      expect(semNbsp(mensagemDeSucesso(compraGravada, 'UN', null))).toBe(
        'Entrada de 36 UN (2 CX c/ 18 UN) registrada. Saldo: 46 UN. Custo atualizado para R$ 10,00.',
      )
      expect(mensagemDeSucesso(compraGravada, 'UN', 10)).toBe('Entrada de 36 UN (2 CX c/ 18 UN) registrada. Saldo: 46 UN.')
      // 33,3333 no movimento e 33,33 no produto: igual ao custo de antes, sem o aviso.
      expect(mensagemDeSucesso({ ...compraGravada, custoInformado: 100, custoUnitario: 33.3333 }, 'UN', 33.33)).toBe(
        'Entrada de 36 UN (2 CX c/ 18 UN) registrada. Saldo: 46 UN.',
      )
    })

    it('o movimento de compra mostra o custo, por embalagem e por unidade', () => {
      const compraEmCaixa: MovimentoEstoque = {
        ...MOVIMENTO,
        tipo: 'ENTRADA',
        motivo: 'COMPRA',
        quantidade: 36,
        saldoAnterior: 10,
        saldoNovo: 46,
        embalagem: { rotulo: 'CX c/ 18 UN', quantidadePorEmbalagem: 18, quantidadeDeEmbalagens: 2 },
        custoInformado: 180,
        custoUnitario: 10,
      }
      expect(semNbsp(textoMovimento(compraEmCaixa, 'UN').custo)).toBe('R$ 180,00 por CX (R$ 10,00 por UN)')
      const emUnidades: MovimentoEstoque = { ...compraEmCaixa, embalagem: null, custoInformado: 10, custoUnitario: 10 }
      expect(semNbsp(textoMovimento(emUnidades, 'UN').custo)).toBe('R$ 10,00 por UN')
      const terco: MovimentoEstoque = { ...compraEmCaixa, custoInformado: 100, custoUnitario: 33.3333 }
      expect(semNbsp(textoMovimento(terco, 'UN').custo)).toBe('R$ 100,00 por CX (R$ 33,33 por UN)')
      expect(textoMovimento(MOVIMENTO, 'UN').custo).toBeNull()
    })
  })
})
