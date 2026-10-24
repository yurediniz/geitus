import { describe, it, expect } from 'vitest'

import {
  abertoEmOutroDia,
  diferencaEntre,
  formatarDataHoraCaixa,
  formatarDiferenca,
  formatarHora,
  formatarReais,
  mensagemDoFechamento,
  ROTULO_DA_FORMA,
  textoAbertoDesde,
  textoDaAbertura,
  textoDaSituacaoDoPonto,
  totaisDosMovimentos,
} from '@/features/cash-register/formatacaoCaixa'
import type { MovimentoDeCaixa } from '@/types/caixa'

/** O "R$" do Intl vem com espaco nao separavel: os textos esperados usam o espaco comum. */
function semNbsp(texto: string): string {
  return texto.replace(/ /g, ' ')
}

function movimento(
  tipo: MovimentoDeCaixa['tipo'],
  valor: number | null,
  forma: MovimentoDeCaixa['forma'] = 'DINHEIRO',
): MovimentoDeCaixa {
  const vendaNumero = tipo === 'RECEBIMENTO' || tipo === 'ESTORNO' ? 128 : null
  return {
    id: `${tipo}-${forma}-${valor}`,
    tipo,
    forma,
    vendaNumero,
    valor,
    motivo: null,
    usuarioNome: 'Ana',
    criadoEm: '2026-10-24T08:02:00-03:00',
  }
}

describe('formatacaoCaixa', () => {
  describe('horários em America/Sao_Paulo', () => {
    it('hora "08:02" de um instante com deslocamento, qualquer que seja o fuso de origem', () => {
      expect(formatarHora('2026-10-24T08:02:00-03:00')).toBe('08:02')
      expect(formatarHora('2026-10-24T11:02:00Z')).toBe('08:02')
    })

    it('data e hora "24/10/2026 às 08:02"', () => {
      expect(formatarDataHoraCaixa('2026-10-24T08:02:00-03:00')).toBe('24/10/2026 às 08:02')
      // 02:30 UTC do dia 25 ainda é 23:30 do dia 24 em São Paulo.
      expect(formatarDataHoraCaixa('2026-10-25T02:30:00Z')).toBe('24/10/2026 às 23:30')
    })

    it('valor que não é data fica como veio', () => {
      expect(formatarHora('ontem')).toBe('ontem')
    })

    it('"Aberto desde 23/10 às 08:02"', () => {
      expect(textoAbertoDesde('2026-10-23T08:02:00-03:00')).toBe('Aberto desde 23/10 às 08:02')
    })
  })

  describe('abertoEmOutroDia (data de abertura x hoje, em São Paulo)', () => {
    const abertura = '2026-10-23T08:02:00-03:00'

    it('mesmo dia: falso; dia seguinte: verdadeiro', () => {
      expect(abertoEmOutroDia(abertura, new Date('2026-10-23T23:59:00-03:00'))).toBe(false)
      expect(abertoEmOutroDia(abertura, new Date('2026-10-24T00:00:00-03:00'))).toBe(true)
    })

    it('aberto às 23:30 de São Paulo (02:30 UTC do dia seguinte): o aviso só aparece no dia seguinte de São Paulo', () => {
      const as2330 = '2026-10-25T02:30:00Z'
      // 23:50 do dia 24 em São Paulo (02:50 UTC do dia 25): ainda é o mesmo dia.
      expect(abertoEmOutroDia(as2330, new Date('2026-10-25T02:50:00Z'))).toBe(false)
      expect(abertoEmOutroDia(as2330, new Date('2026-10-25T03:00:00Z'))).toBe(true)
    })

    it('data inválida: falso (sem aviso)', () => {
      expect(abertoEmOutroDia('ontem', new Date())).toBe(false)
    })
  })

  describe('textoDaAbertura', () => {
    it('no mesmo dia, "às 08:02"; em outro dia, "desde 23/10 às 08:02"', () => {
      expect(textoDaAbertura('2026-10-24T08:02:00-03:00', new Date('2026-10-24T10:00:00-03:00'))).toBe('às 08:02')
      expect(textoDaAbertura('2026-10-23T08:02:00-03:00', new Date('2026-10-24T10:00:00-03:00'))).toBe(
        'desde 23/10 às 08:02',
      )
    })
  })

  describe('dinheiro', () => {
    it('formata em reais pt-BR', () => {
      expect(semNbsp(formatarReais(1234.56))).toBe('R$ 1.234,56')
      expect(semNbsp(formatarReais(0))).toBe('R$ 0,00')
    })

    it('diferença: "Confere" (ok), "Sobra de" e "Falta de" (alerta)', () => {
      expect(formatarDiferenca(0)).toEqual({ texto: 'Confere', tom: 'ok' })
      const sobra = formatarDiferenca(2)
      expect(semNbsp(sobra.texto)).toBe('Sobra de R$ 2,00')
      expect(sobra.tom).toBe('alerta')
      const falta = formatarDiferenca(-2)
      expect(semNbsp(falta.texto)).toBe('Falta de R$ 2,00')
      expect(falta.tom).toBe('alerta')
    })

    it('diferencaEntre conta em centavos (sem erro de ponto flutuante)', () => {
      expect(diferencaEntre(0.3, 0.1 + 0.2)).toBe(0)
      expect(diferencaEntre(318, 320)).toBe(-2)
      expect(diferencaEntre(100.1, 100)).toBe(0.1)
    })

    it('totais de suprimentos e sangrias dos movimentos', () => {
      const totais = totaisDosMovimentos([
        movimento('ABERTURA', 150),
        movimento('SUPRIMENTO', 50.1),
        movimento('SUPRIMENTO', 0.2),
        movimento('SANGRIA', 200),
      ])
      expect(totais).toEqual({ suprimentos: 50.3, sangrias: 200, vendasEmDinheiro: 0, completos: true })
    })

    it('valor oculto (modo cego) nunca entra na soma e marca os totais como incompletos', () => {
      const totais = totaisDosMovimentos([
        movimento('ABERTURA', 150),
        { ...movimento('SANGRIA', 0), valor: null },
        movimento('SUPRIMENTO', 10),
      ])
      expect(totais).toEqual({ suprimentos: 10, sangrias: 0, vendasEmDinheiro: 0, completos: false })
    })

    it('vendas em dinheiro: recebimentos menos estornos, só do dinheiro', () => {
      const totais = totaisDosMovimentos([
        movimento('RECEBIMENTO', 50.1),
        movimento('RECEBIMENTO', 0.2),
        movimento('ESTORNO', 10),
        movimento('RECEBIMENTO', 99, 'PIX'),
        movimento('ESTORNO', 5, 'DEBITO'),
      ])
      expect(totais).toEqual({ suprimentos: 0, sangrias: 0, vendasEmDinheiro: 40.3, completos: true })
    })

    it('rótulo das formas de pagamento', () => {
      expect(ROTULO_DA_FORMA).toEqual({ DINHEIRO: 'Dinheiro', DEBITO: 'Débito', CREDITO: 'Crédito', PIX: 'PIX' })
    })

    it('mensagem do fechamento com diferença em outra forma', () => {
      const porForma = [
        { forma: 'DINHEIRO' as const, esperado: 100, contado: 100, diferenca: 0 },
        { forma: 'DEBITO' as const, esperado: 50, contado: 48, diferenca: -2 },
        { forma: 'PIX' as const, esperado: 10, contado: 11, diferenca: 1 },
      ]
      expect(mensagemDoFechamento('Caixa 1', 0, porForma)).toBe('Caixa 1 fechado com diferença em Débito e PIX')
      expect(semNbsp(mensagemDoFechamento('Caixa 1', -2, porForma.slice(0, 2)))).toBe(
        'Caixa 1 fechado com falta de R$ 2,00 e diferença em Débito',
      )
      expect(mensagemDoFechamento('Caixa 1', 0, porForma.slice(0, 1))).toBe('Caixa 1 fechado')
    })

    it('mensagem do fechamento com o nome do ponto e a diferença', () => {
      expect(mensagemDoFechamento('Caixa 2', 0)).toBe('Caixa 2 fechado')
      expect(mensagemDoFechamento('Caixa 1', null)).toBe('Caixa 1 fechado')
      expect(semNbsp(mensagemDoFechamento('Caixa 2', -2))).toBe('Caixa 2 fechado com falta de R$ 2,00')
      expect(semNbsp(mensagemDoFechamento('Caixa 1', 3.5))).toBe('Caixa 1 fechado com sobra de R$ 3,50')
    })

    it('situação do ponto: livre, aberto (com a hora ou desde o outro dia) e em conferência', () => {
      const hoje = new Date('2026-10-24T12:00:00-03:00')
      const aberta = { status: 'ABERTA' as const, sessaoId: 's', abertaPorNome: 'Ana Souza', abertaEm: '2026-10-24T08:02:00-03:00' }
      expect(textoDaSituacaoDoPonto(null, hoje)).toBe('livre')
      expect(textoDaSituacaoDoPonto(aberta, hoje)).toBe('aberto por Ana Souza às 08:02')
      expect(textoDaSituacaoDoPonto({ ...aberta, abertaEm: '2026-10-23T08:02:00-03:00' }, hoje)).toBe(
        'aberto por Ana Souza desde 23/10 às 08:02',
      )
      expect(textoDaSituacaoDoPonto({ ...aberta, status: 'EM_CONFERENCIA' }, hoje)).toBe('em conferência · Ana Souza')
    })
  })
})
