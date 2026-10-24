import { describe, it, expect } from 'vitest'

import {
  adicionarItem,
  alterarQuantidade,
  aplicarDesconto,
  CARRINHO_VAZIO,
  chaveDoCarrinho,
  guardarCarrinho,
  lerCarrinhoGuardado,
  lerGuardado,
  LIMITE_DE_LINHAS,
  paraRequest,
  quantidadeDeEstoque,
  removerLinha,
  trocarEmbalagem,
  type Carrinho,
  type ResultadoDaMudanca,
} from '@/features/pdv/carrinho'
import { itemResolvido, NEXGARD, QUEIJO, RACAO } from '@/test/fixturesPdv'

const LIVRE = { venderSemEstoque: true }
const CONTROLADO = { venderSemEstoque: false }

function ok(resultado: ResultadoDaMudanca): Carrinho {
  if (!resultado.ok) {
    throw new Error(`Esperava sucesso, veio: ${resultado.erro}`)
  }
  return resultado.carrinho
}

describe('carrinho', () => {
  describe('adicionar', () => {
    it('o mesmo produto na mesma unidade soma na linha existente', () => {
      let carrinho = ok(adicionarItem(CARRINHO_VAZIO, itemResolvido({ quantidade: 3, codigoLido: '542*3' }), 'l-1', LIVRE))
      carrinho = ok(adicionarItem(carrinho, itemResolvido(), 'l-2', LIVRE))

      expect(carrinho.linhas).toHaveLength(1)
      expect(carrinho.linhas[0]).toMatchObject({ id: 'l-1', quantidade: 4, codigoLido: '542*3', etiqueta: false })
    })

    it('a mesma soma vale para a embalagem; unidade e embalagem ficam em linhas separadas', () => {
      let carrinho = ok(
        adicionarItem(CARRINHO_VAZIO, itemResolvido({ tipo: 'EMBALAGEM', produto: NEXGARD, embalagemId: 'e-cx3' }), 'l-1', LIVRE),
      )
      carrinho = ok(adicionarItem(carrinho, itemResolvido({ produto: NEXGARD }), 'l-2', LIVRE))
      carrinho = ok(
        adicionarItem(carrinho, itemResolvido({ tipo: 'EMBALAGEM', produto: NEXGARD, embalagemId: 'e-cx3' }), 'l-3', LIVRE),
      )

      expect(carrinho.linhas.map((linha) => [linha.embalagemId, linha.quantidade])).toEqual([
        ['e-cx3', 2],
        [null, 1],
      ])
      // 2 CX c/ 3 + 1 UN
      expect(quantidadeDeEstoque(carrinho, NEXGARD.id)).toBe(7)
    })

    it('etiqueta é sempre uma linha nova', () => {
      const etiqueta = itemResolvido({ tipo: 'ETIQUETA', produto: QUEIJO, quantidade: 0.4, codigoLido: '2000077010000' })
      let carrinho = ok(adicionarItem(CARRINHO_VAZIO, etiqueta, 'l-1', LIVRE))
      carrinho = ok(adicionarItem(carrinho, etiqueta, 'l-2', LIVRE))

      expect(carrinho.linhas.map((linha) => [linha.id, linha.etiqueta, linha.quantidade])).toEqual([
        ['l-1', true, 0.4],
        ['l-2', true, 0.4],
      ])
    })

    it('soma com 3 casas, sem erro de ponto flutuante', () => {
      let carrinho = ok(adicionarItem(CARRINHO_VAZIO, itemResolvido({ produto: QUEIJO, quantidade: 0.1 }), 'l-1', LIVRE))
      carrinho = ok(adicionarItem(carrinho, itemResolvido({ produto: QUEIJO, quantidade: 0.2 }), 'l-2', LIVRE))

      expect(carrinho.linhas[0].quantidade).toBe(0.3)
    })

    it('limite de 300 linhas', () => {
      let carrinho = CARRINHO_VAZIO
      for (let indice = 0; indice < LIMITE_DE_LINHAS; indice += 1) {
        carrinho = ok(
          adicionarItem(carrinho, itemResolvido({ tipo: 'ETIQUETA', produto: QUEIJO, codigoLido: `e${indice}` }), `l-${indice}`, LIVRE),
        )
      }

      expect(adicionarItem(carrinho, itemResolvido(), 'l-x', LIVRE)).toEqual({
        ok: false,
        erro: 'A venda atingiu o limite de 300 itens.',
      })
    })

    it('quantidade somada acima de 99.999 é recusada', () => {
      const carrinho = ok(adicionarItem(CARRINHO_VAZIO, itemResolvido({ quantidade: 99999 }), 'l-1', LIVRE))

      expect(adicionarItem(carrinho, itemResolvido(), 'l-2', LIVRE)).toEqual({ ok: false, erro: 'Quantidade acima do permitido.' })
    })

    it('com "Vender sem estoque" desligada, recusa o que passa do saldo somado no carrinho', () => {
      const carrinho = ok(adicionarItem(CARRINHO_VAZIO, itemResolvido({ produto: NEXGARD, quantidade: 8 }), 'l-1', CONTROLADO))

      expect(
        adicionarItem(carrinho, itemResolvido({ tipo: 'EMBALAGEM', produto: NEXGARD, embalagemId: 'e-cx3' }), 'l-2', CONTROLADO),
      ).toEqual({ ok: false, erro: 'Estoque insuficiente para Nexgard M (saldo 10 UN).' })
      // Ligada, passa (o estoque fica negativo).
      expect(
        adicionarItem(carrinho, itemResolvido({ tipo: 'EMBALAGEM', produto: NEXGARD, embalagemId: 'e-cx3' }), 'l-2', LIVRE).ok,
      ).toBe(true)
    })

    it('produto sem controle de estoque nunca é recusado pelo saldo', () => {
      const semControle = { ...RACAO, controlaEstoque: false, saldo: null }
      expect(adicionarItem(CARRINHO_VAZIO, itemResolvido({ produto: semControle, quantidade: 500 }), 'l-1', CONTROLADO).ok).toBe(
        true,
      )
    })
  })

  describe('alterar a linha', () => {
    const base = ok(adicionarItem(CARRINHO_VAZIO, itemResolvido({ quantidade: 2 }), 'l-1', LIVRE))

    it('+ e − mudam a quantidade de 1 em 1, nunca abaixo de 1', () => {
      const mais = ok(alterarQuantidade(base, 'l-1', 1, LIVRE))
      expect(mais.linhas[0].quantidade).toBe(3)
      const menos = ok(alterarQuantidade(ok(alterarQuantidade(base, 'l-1', -1, LIVRE)), 'l-1', -1, LIVRE))
      expect(menos.linhas[0].quantidade).toBe(1)
    })

    it('+ respeita o saldo com "Vender sem estoque" desligada', () => {
      const cheio = ok(adicionarItem(CARRINHO_VAZIO, itemResolvido({ quantidade: 12 }), 'l-1', CONTROLADO))
      expect(alterarQuantidade(cheio, 'l-1', 1, CONTROLADO)).toEqual({
        ok: false,
        erro: 'Estoque insuficiente para Ração X 1kg (saldo 12 UN).',
      })
    })

    it('a etiqueta não muda de quantidade', () => {
      const etiqueta = ok(
        adicionarItem(CARRINHO_VAZIO, itemResolvido({ tipo: 'ETIQUETA', produto: QUEIJO, quantidade: 0.4 }), 'l-1', LIVRE),
      )
      expect(alterarQuantidade(etiqueta, 'l-1', 1, LIVRE)).toEqual({
        ok: false,
        erro: 'A quantidade da etiqueta da balança não pode ser alterada.',
      })
    })

    it('troca a unidade pela embalagem (e de volta), mantendo a quantidade', () => {
      const unidade = ok(adicionarItem(CARRINHO_VAZIO, itemResolvido({ produto: NEXGARD, quantidade: 2 }), 'l-1', LIVRE))
      const caixa = ok(trocarEmbalagem(unidade, 'l-1', 'e-cx3', LIVRE))
      expect(caixa.linhas[0]).toMatchObject({ embalagemId: 'e-cx3', quantidade: 2 })
      expect(ok(trocarEmbalagem(caixa, 'l-1', null, LIVRE)).linhas[0]).toMatchObject({ embalagemId: null, quantidade: 2 })
    })

    it('a embalagem não aceita quantidade fracionada', () => {
      const fracionado = { ...NEXGARD, fracionada: true }
      const linha = ok(adicionarItem(CARRINHO_VAZIO, itemResolvido({ produto: fracionado, quantidade: 1.5 }), 'l-1', LIVRE))
      expect(trocarEmbalagem(linha, 'l-1', 'e-cx3', LIVRE)).toEqual({
        ok: false,
        erro: 'CX c/ 3 UN não aceita quantidade fracionada. Informe um número inteiro.',
      })
    })

    it('remove a linha e aplica o desconto do item e do total', () => {
      const comDesconto = aplicarDesconto(base, 'l-1', { tipo: 'PERCENTUAL', valor: 5 })
      expect(comDesconto.linhas[0].desconto).toEqual({ tipo: 'PERCENTUAL', valor: 5 })
      const doTotal = aplicarDesconto(comDesconto, 'TOTAL', { tipo: 'VALOR', valor: 2 })
      expect(doTotal.desconto).toEqual({ tipo: 'VALOR', valor: 2 })
      expect(removerLinha(doTotal, 'l-1').linhas).toEqual([])
    })
  })

  it('vira o corpo do cálculo, com o cliente e os pagamentos', () => {
    const carrinho: Carrinho = {
      ...ok(adicionarItem(CARRINHO_VAZIO, itemResolvido({ quantidade: 3, codigoLido: '542*3' }), 'l-1', LIVRE)),
      cliente: { id: 'c-1', nome: 'Maria' },
      desconto: { tipo: 'VALOR', valor: 2 },
    }

    expect(paraRequest(carrinho, [{ forma: 'PIX', valor: 20 }])).toEqual({
      itens: [{ produtoId: 'p-racao', embalagemId: null, quantidade: 3, codigoLido: '542*3', etiqueta: false, desconto: null }],
      desconto: { tipo: 'VALOR', valor: 2 },
      clienteId: 'c-1',
      pagamentos: [{ forma: 'PIX', valor: 20 }],
    })
  })

  describe('guardado no navegador (Review Focus 3)', () => {
    const carrinho = ok(adicionarItem(CARRINHO_VAZIO, itemResolvido({ quantidade: 3 }), 'l-1', LIVRE))

    it('a chave inclui a empresa e o usuário', () => {
      expect(chaveDoCarrinho(3, 7)).toBe('geitus.pdv.3.7')
    })

    it('ida e volta com versão 1', () => {
      const texto = guardarCarrinho(carrinho, 3, 7)
      expect(JSON.parse(texto)).toMatchObject({ versao: 1, empresaId: 3, usuarioId: 7 })
      expect(lerCarrinhoGuardado(texto, 3, 7)).toEqual(carrinho)
      expect(lerGuardado(texto, 3, 7)).toEqual({ carrinho, tentativa: null })
    })

    it('a tentativa pendente da venda (chave e corpo) vai junto, na mesma estrutura', () => {
      const corpo = { ...paraRequest(carrinho, [{ forma: 'PIX' as const, valor: 74.7 }]), chave: 'c-1', totalEsperado: 74.7 }
      const tentativa = { chave: 'c-1', corpo, trava: 'REDE' as const }
      const texto = guardarCarrinho(carrinho, 3, 7, tentativa)

      expect(lerGuardado(texto, 3, 7)).toEqual({ carrinho, tentativa })
      // Um carrinho vazio com tentativa também é guardado (a chave não pode se perder).
      expect(lerGuardado(guardarCarrinho(CARRINHO_VAZIO, 3, 7, { chave: 'c-2', corpo: null, trava: null }), 3, 7)).toEqual({
        carrinho: CARRINHO_VAZIO,
        tentativa: { chave: 'c-2', corpo: null, trava: null },
      })
    })

    it.each([
      ['https://malicioso.example/rastreio.png', null],
      ['//malicioso.example/x.png', null],
      ['/api/imagens/%2e%2e/auth/me', null],
      ['javascript:alert(1)', null],
      ['/api/imagens/abc/miniatura?assinatura=1', '/api/imagens/abc/miniatura?assinatura=1'],
    ])('miniatura adulterada no navegador (%s) só é aceita sob /api/imagens/', (url, esperado) => {
      const adulterado = { ...carrinho, linhas: [{ ...carrinho.linhas[0], produto: { ...RACAO, miniaturaUrl: url } }] }

      const lido = lerGuardado(guardarCarrinho(adulterado, 3, 7), 3, 7)

      expect(lido.carrinho.linhas).toHaveLength(1)
      expect(lido.carrinho.linhas[0].produto.miniaturaUrl).toBe(esperado)
    })

    it('tentativa malformada é ignorada, o carrinho fica', () => {
      const texto = JSON.stringify({ versao: 1, empresaId: 3, usuarioId: 7, carrinho, tentativa: { chave: 5, trava: 'X' } })
      expect(lerGuardado(texto, 3, 7)).toEqual({ carrinho, tentativa: null })
    })

    it.each([
      ['vazio', null],
      ['JSON inválido', '{nao e json'],
      ['versão antiga', JSON.stringify({ versao: 0, empresaId: 3, usuarioId: 7, carrinho })],
      ['de outra empresa', JSON.stringify({ versao: 1, empresaId: 4, usuarioId: 7, carrinho })],
      ['de outro usuário', JSON.stringify({ versao: 1, empresaId: 3, usuarioId: 8, carrinho })],
      ['linha sem produto', JSON.stringify({ versao: 1, empresaId: 3, usuarioId: 7, carrinho: { ...carrinho, linhas: [{ id: 'x' }] } })],
      [
        'quantidade inválida',
        JSON.stringify({
          versao: 1,
          empresaId: 3,
          usuarioId: 7,
          carrinho: { ...carrinho, linhas: [{ ...carrinho.linhas[0], quantidade: -1 }] },
        }),
      ],
      ['formato errado', JSON.stringify([1, 2, 3])],
    ])('%s: começa vazio', (_caso, texto) => {
      expect(lerCarrinhoGuardado(texto, 3, 7)).toEqual(CARRINHO_VAZIO)
    })
  })
})
