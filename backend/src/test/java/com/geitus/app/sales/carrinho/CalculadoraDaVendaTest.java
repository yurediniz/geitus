package com.geitus.app.sales.carrinho;

import static com.geitus.app.sales.carrinho.ProdutosDeTeste.HOJE;
import static com.geitus.app.sales.carrinho.ProdutosDeTeste.embalagem;
import static com.geitus.app.sales.carrinho.ProdutosDeTeste.produto;
import static com.geitus.app.sales.carrinho.ProdutosDeTeste.unidade;
import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.geitus.app.cashier.FormaDePagamento;
import com.geitus.app.catalog.Produto;
import com.geitus.app.catalog.ProdutoEmbalagem;
import com.geitus.app.catalog.balanca.LeituraEtiqueta;
import com.geitus.app.catalog.balanca.TipoInformacaoEtiqueta;
import com.geitus.app.catalog.unidade.UnidadeMedida;
import com.geitus.app.sales.carrinho.ProdutosDeTeste.Precos;

/**
 * Regras da {@link CalculadoraDaVenda} (docs/modules/pdv.md, 3.1 a 3.4 e 8,
 * "Dominio"): etiqueta, preco da unidade com atacado pela soma das linhas,
 * embalagem, descontos com a reparticao e os limites, pagamento e troco.
 */
class CalculadoraDaVendaTest {

    private static final BigDecimal LIMITE_PADRAO = new BigDecimal("10.00");

    private final UnidadeMedida un = unidade("UN", false);
    private final UnidadeMedida kg = unidade("KG", true);
    private final UnidadeMedida cx = unidade("CX", false);

    // ---------- Etiqueta de balanca (3.1) ----------

    @Test
    void etiquetaDeValorEmKgViraQuantidadePeloPreco() {
        Produto queijo = produto("Queijo", kg, Precos.de("25.00"));

        LinhaCalculada linha = umaLinha(etiqueta(queijo, TipoInformacaoEtiqueta.VALOR, "10.000"));

        assertThat(linha.quantidade()).isEqualByComparingTo("0.400");
        assertThat(linha.quantidade().scale()).isEqualTo(3);
        assertThat(linha.precoUnitario()).isEqualByComparingTo("25.00");
        assertThat(linha.valorBruto()).isEqualByComparingTo("10.00");
        assertThat(linha.origem()).isEqualTo(OrigemPrecoDaVenda.ETIQUETA);
        assertThat(linha.etiqueta()).isTrue();
    }

    @Test
    void etiquetaDeValorEmUnMultiploDoPrecoViraQuantidadeInteira() {
        Produto pao = produto("Pão", un, Precos.de("5.00"));

        LinhaCalculada linha = umaLinha(etiqueta(pao, TipoInformacaoEtiqueta.VALOR, "10.000"));

        assertThat(linha.quantidade()).isEqualByComparingTo("2");
        assertThat(linha.precoUnitario()).isEqualByComparingTo("5.00");
        assertThat(linha.valorBruto()).isEqualByComparingTo("10.00");
    }

    @Test
    void etiquetaDeValorEmUnNaoMultiploViraUmaUnidadePeloValor() {
        Produto bolo = produto("Bolo", un, Precos.de("3.00"));

        LinhaCalculada linha = umaLinha(etiqueta(bolo, TipoInformacaoEtiqueta.VALOR, "10.000"));

        assertThat(linha.quantidade()).isEqualByComparingTo("1");
        assertThat(linha.precoUnitario()).isEqualByComparingTo("10.00");
        assertThat(linha.valorBruto()).isEqualByComparingTo("10.00");
    }

    @Test
    void etiquetaDePesoMultiplicaPeloPrecoVigente() {
        Produto queijo = produto("Queijo", kg, Precos.de("25.00").comPromocao("20.00"));

        LinhaCalculada linha = umaLinha(etiqueta(queijo, TipoInformacaoEtiqueta.PESO, "0.350"));

        assertThat(linha.quantidade()).isEqualByComparingTo("0.350");
        assertThat(linha.precoUnitario()).isEqualByComparingTo("20.00");
        assertThat(linha.valorBruto()).isEqualByComparingTo("7.00");
    }

    /** R2: sem preco de venda nao ha divisao; a linha sai zerada com o erro. */
    @Test
    void etiquetaDeProdutoSemPrecoNaoDivide() {
        Produto brinde = produto("Brinde", kg, Precos.de("0.00"));

        CalculoDaVenda calculo = calcular(List.of(etiqueta(brinde, TipoInformacaoEtiqueta.VALOR, "10.000")));

        assertThat(calculo.erros()).startsWith(new ErroDoCalculo("itens[0]", "Produto sem preço de venda."));
        assertThat(calculo.linhas().get(0).quantidade()).isEqualByComparingTo("0");
        assertThat(calculo.linhas().get(0).valorBruto()).isEqualByComparingTo("0");
    }

    @Test
    void etiquetaDePesoEmProdutoNaoFracionadoRecusada() {
        Produto pao = produto("Pão", un, Precos.de("5.00"));

        CalculoDaVenda calculo = calcular(List.of(etiqueta(pao, TipoInformacaoEtiqueta.PESO, "1.000")));

        assertThat(calculo.erros()).contains(new ErroDoCalculo("itens[0]",
                "Etiqueta de peso para produto que não é vendido por peso."));
    }

    // ---------- Preco da linha (3.2) ----------

    @Test
    void atacadoPelaSomaDasLinhasDeUnidade() {
        Produto agua = produto("Água", un, Precos.de("2.00").comAtacado("1.50", "12"));

        CalculoDaVenda calculo = calcular(List.of(daUnidade(1, agua, "7"), daUnidade(2, agua, "5")));

        assertThat(calculo.linhas()).extracting(LinhaCalculada::origem)
                .containsExactly(OrigemPrecoDaVenda.ATACADO, OrigemPrecoDaVenda.ATACADO);
        assertThat(calculo.total()).isEqualByComparingTo("18.00");
    }

    @Test
    void embalagemNaoContaParaOAtacado() {
        Produto agua = produto("Água", un, Precos.de("2.00").comAtacado("1.50", "12"));
        ProdutoEmbalagem fardo = embalagem(agua, cx, "12", null);

        CalculoDaVenda calculo = calcular(List.of(daEmbalagem(1, agua, fardo, "1"), daUnidade(2, agua, "1")));

        assertThat(calculo.linhas().get(0).origem()).isEqualTo(OrigemPrecoDaVenda.EMBALAGEM);
        assertThat(calculo.linhas().get(0).valorBruto()).isEqualByComparingTo("24.00");
        assertThat(calculo.linhas().get(1).origem()).isEqualTo(OrigemPrecoDaVenda.NORMAL);
        assertThat(calculo.linhas().get(1).precoUnitario()).isEqualByComparingTo("2.00");
    }

    @Test
    void nexgardCaixaMaisUnidade() {
        Produto nexgard = produto("Nexgard", un, Precos.de("89.90"));
        ProdutoEmbalagem caixa = embalagem(nexgard, cx, "3", "209.90");

        CalculoDaVenda calculo = calcular(List.of(daEmbalagem(1, nexgard, caixa, "1"), daUnidade(2, nexgard, "1")));

        assertThat(calculo.total()).isEqualByComparingTo("299.80");
        assertThat(calculo.linhas()).extracting(LinhaCalculada::quantidadeEstoque)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("3"), new BigDecimal("1"));
        assertThat(calculo.linhas().get(0).sigla()).isEqualTo("CX");
        assertThat(calculo.erros()).isEmpty();
    }

    @Test
    void quantidadeFracionadaEmUnidadeInteiraRecusada() {
        Produto pao = produto("Pão", un, Precos.de("5.00"));

        CalculoDaVenda calculo = calcular(List.of(daUnidade(1, pao, "1.5")));

        assertThat(calculo.erros()).containsExactly(new ErroDoCalculo("itens[0].quantidade",
                "UN não aceita quantidade fracionada. Informe um número inteiro."));
    }

    // ---------- Desconto (3.3) ----------

    @Test
    void descontoDoItemEmPercentualEEmReais() {
        Produto racao = produto("Ração", un, Precos.de("50.00"));

        CalculoDaVenda calculo = calcular(List.of(
                comDesconto(daUnidade(1, racao, "2"), TipoDesconto.PERCENTUAL, "5"),
                comDesconto(daUnidade(2, racao, "1"), TipoDesconto.VALOR, "2.50")));

        assertThat(calculo.linhas().get(0).descontoItem()).isEqualByComparingTo("5.00");
        assertThat(calculo.linhas().get(1).descontoItem()).isEqualByComparingTo("2.50");
        assertThat(calculo.subtotal()).isEqualByComparingTo("150.00");
        assertThat(calculo.descontoItens()).isEqualByComparingTo("7.50");
        assertThat(calculo.total()).isEqualByComparingTo("142.50");
        assertThat(calculo.erros()).isEmpty();
    }

    @Test
    void descontoDoTotalEmPercentualSobreOSubtotalComOsDescontosDosItens() {
        Produto racao = produto("Ração", un, Precos.de("50.00"));

        CalculoDaVenda calculo = CalculadoraDaVenda.calcular(
                List.of(comDesconto(daUnidade(1, racao, "2"), TipoDesconto.VALOR, "10.00")),
                new DescontoInformado(TipoDesconto.PERCENTUAL, new BigDecimal("5")), List.of(), true, LIMITE_PADRAO,
                HOJE);

        assertThat(calculo.descontoTotal()).isEqualByComparingTo("4.50");
        assertThat(calculo.total()).isEqualByComparingTo("85.50");
    }

    /** O resto dos centavos vai para a linha de maior valor; no empate, a primeira. */
    @Test
    void reparticaoComORestoNaMaiorLinha() {
        Produto item = produto("Item", un, Precos.de("10.00"));

        CalculoDaVenda calculo = CalculadoraDaVenda.calcular(
                List.of(daUnidade(1, item, "1"), daUnidade(2, outro("Item 2"), "1"), daUnidade(3, outro("Item 3"), "1")),
                new DescontoInformado(TipoDesconto.VALOR, new BigDecimal("1.00")), List.of(), true, LIMITE_PADRAO,
                HOJE);

        assertThat(calculo.linhas()).extracting(LinhaCalculada::descontoRateado)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("0.34"), new BigDecimal("0.33"), new BigDecimal("0.33"));
        assertThat(calculo.linhas()).extracting(LinhaCalculada::valorLiquido)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("9.66"), new BigDecimal("9.67"), new BigDecimal("9.67"));
        assertThat(calculo.total()).isEqualByComparingTo("29.00");
    }

    @Test
    void reparticaoProporcionalComORestoNaLinhaDeMaiorValor() {
        CalculoDaVenda calculo = CalculadoraDaVenda.calcular(
                List.of(daUnidade(1, outro("Barato"), "1"), daUnidade(2, produto("Caro", un, Precos.de("20.00")), "1")),
                new DescontoInformado(TipoDesconto.VALOR, new BigDecimal("1.00")), List.of(), true, LIMITE_PADRAO,
                HOJE);

        assertThat(calculo.linhas()).extracting(LinhaCalculada::descontoRateado)
                .usingElementComparator(BigDecimal::compareTo)
                .containsExactly(new BigDecimal("0.33"), new BigDecimal("0.67"));
    }

    @Test
    void limiteDoOperadorDezPorCentoPassaEDezVirgulaZeroUmNao() {
        Produto item = produto("Item", un, Precos.de("100.00"));

        CalculoDaVenda noLimite = CalculadoraDaVenda.calcular(List.of(daUnidade(1, item, "1")),
                new DescontoInformado(TipoDesconto.VALOR, new BigDecimal("10.00")), List.of(), false, LIMITE_PADRAO,
                HOJE);
        CalculoDaVenda acima = CalculadoraDaVenda.calcular(List.of(daUnidade(1, item, "1")),
                new DescontoInformado(TipoDesconto.VALOR, new BigDecimal("10.01")), List.of(), false, LIMITE_PADRAO,
                HOJE);

        assertThat(noLimite.erros()).isEmpty();
        assertThat(acima.erros()).containsExactly(
                new ErroDoCalculo("desconto", "O desconto passa do limite do operador (10%)."));
    }

    @Test
    void adminSemLimitePercentual() {
        Produto item = produto("Item", un, Precos.de("100.00"));

        CalculoDaVenda calculo = CalculadoraDaVenda.calcular(List.of(daUnidade(1, item, "1")),
                new DescontoInformado(TipoDesconto.PERCENTUAL, new BigDecimal("50")), List.of(), true, LIMITE_PADRAO,
                HOJE);

        assertThat(calculo.erros()).isEmpty();
        assertThat(calculo.total()).isEqualByComparingTo("50.00");
    }

    @Test
    void precoMinimoPorUnidadeDeEstoqueNaEmbalagem() {
        Produto racao = produto("Ração", un, Precos.de("10.00").comMinimo("9.50"));
        ProdutoEmbalagem caixa = embalagem(racao, cx, "3", "30.00");

        CalculoDaVenda dentro = calcular(List.of(comDesconto(daEmbalagem(1, racao, caixa, "1"), TipoDesconto.VALOR,
                "1.50")));
        CalculoDaVenda abaixo = calcular(List.of(comDesconto(daEmbalagem(1, racao, caixa, "1"), TipoDesconto.VALOR,
                "1.51")));

        assertThat(dentro.erros()).isEmpty();
        assertThat(abaixo.erros()).containsExactly(new ErroDoCalculo("itens[0]",
                "O desconto deixa Ração abaixo do preço mínimo (R$ 9,50 por UN)."));
    }

    /** Review Focus 4: o desconto do total passa do subtotal (uma linha saiu); o total continua coerente. */
    @Test
    void descontoTotalMaiorQueSubtotal() {
        Produto item = produto("Item", un, Precos.de("10.00"));

        CalculoDaVenda calculo = CalculadoraDaVenda.calcular(List.of(daUnidade(1, item, "1")),
                new DescontoInformado(TipoDesconto.VALOR, new BigDecimal("15.00")), List.of(), true, LIMITE_PADRAO,
                HOJE);

        assertThat(calculo.erros()).containsExactly(new ErroDoCalculo("desconto", "O desconto passa do subtotal."));
        assertThat(calculo.descontoTotal()).isEqualByComparingTo("0");
        assertThat(calculo.total()).isEqualByComparingTo("10.00");
    }

    @Test
    void totalZeroRecusado() {
        Produto item = produto("Item", un, Precos.de("10.00"));

        CalculoDaVenda calculo = calcular(List.of(comDesconto(daUnidade(1, item, "1"), TipoDesconto.PERCENTUAL,
                "100")));

        assertThat(calculo.total()).isEqualByComparingTo("0");
        assertThat(calculo.erros()).containsExactly(
                new ErroDoCalculo("total", "O total da venda precisa ser maior que zero."));
    }

    @Test
    void descontoDoItemAcimaDoValorRecusado() {
        Produto item = produto("Item", un, Precos.de("10.00"));

        CalculoDaVenda calculo = calcular(List.of(comDesconto(daUnidade(1, item, "1"), TipoDesconto.VALOR, "10.01")));

        assertThat(calculo.erros()).containsExactly(
                new ErroDoCalculo("itens[0].desconto", "O desconto passa do valor do item."));
        assertThat(calculo.total()).isEqualByComparingTo("10.00");
    }

    /** BACK-I1: o percentual arredonda para baixo (a favor da loja), entao 10% nunca passa de 10%. */
    @Test
    void percentualArredondaParaBaixoEOOperadorFicaNoLimite() {
        Produto item = produto("Item", un, Precos.de("2.45"));

        CalculoDaVenda calculo = CalculadoraDaVenda.calcular(List.of(daUnidade(1, item, "1")),
                new DescontoInformado(TipoDesconto.PERCENTUAL, new BigDecimal("10")), List.of(), false,
                LIMITE_PADRAO, HOJE);
        CalculoDaVenda doItem = CalculadoraDaVenda.calcular(
                List.of(comDesconto(daUnidade(1, item, "1"), TipoDesconto.PERCENTUAL, "10")), null, List.of(), false,
                LIMITE_PADRAO, HOJE);

        assertThat(calculo.erros()).isEmpty();
        assertThat(calculo.descontoTotal()).isEqualByComparingTo("0.24");
        assertThat(calculo.total()).isEqualByComparingTo("2.21");
        assertThat(doItem.erros()).isEmpty();
        assertThat(doItem.descontoItens()).isEqualByComparingTo("0.24");
    }

    /** SEG-1: um valor gigante e recusado antes de qualquer conta (sem travar a thread). */
    @Test
    void descontoGiganteRecusadoSemCusto() {
        Produto item = produto("Item", un, Precos.de("10.00"));
        BigDecimal gigante = new BigDecimal("1E+400000000");

        CalculoDaVenda calculo = org.junit.jupiter.api.Assertions.assertTimeoutPreemptively(
                java.time.Duration.ofSeconds(2), () -> CalculadoraDaVenda.calcular(
                        List.of(new LinhaParaCalculo(1, item, null, null, null, BigDecimal.ONE,
                                new DescontoInformado(TipoDesconto.VALOR, gigante))),
                        new DescontoInformado(TipoDesconto.PERCENTUAL, gigante), List.of(), true, LIMITE_PADRAO,
                        HOJE));

        assertThat(calculo.erros()).containsExactly(
                new ErroDoCalculo("itens[0].desconto", "O desconto passa do valor do item."),
                new ErroDoCalculo("desconto", "O desconto passa do subtotal."));
        assertThat(calculo.total()).isEqualByComparingTo("10.00");
    }

    @Test
    void etiquetaDeValorAbaixoDoMinimoMesmoSemDesconto() {
        Produto bolo = produto("Bolo", un, Precos.de("3.00").comMinimo("2.80"));

        CalculoDaVenda calculo = calcular(List.of(etiqueta(bolo, TipoInformacaoEtiqueta.VALOR, "2.500")));

        assertThat(calculo.erros()).containsExactly(new ErroDoCalculo("itens[0]",
                "O valor da etiqueta deixa Bolo abaixo do preço mínimo (R$ 2,80 por UN)."));
    }

    // ---------- QA A8 ----------

    @Test
    void descontoDoTotalRepartidoDeixaLinhaAbaixoDoMinimo() {
        Produto comMinimo = produto("Ração premium", un, Precos.de("10.00").comMinimo("9.80"));
        Produto livre = produto("Petisco", un, Precos.de("10.00"));

        CalculoDaVenda calculo = CalculadoraDaVenda.calcular(
                List.of(daUnidade(1, comMinimo, "1"), daUnidade(2, livre, "1")),
                new DescontoInformado(TipoDesconto.VALOR, new BigDecimal("1.00")), List.of(), true, LIMITE_PADRAO,
                HOJE);

        assertThat(calculo.linhas().get(0).descontoRateado()).isEqualByComparingTo("0.50");
        assertThat(calculo.erros()).containsExactly(new ErroDoCalculo("itens[0]",
                "O desconto deixa Ração premium abaixo do preço mínimo (R$ 9,80 por UN)."));
    }

    @Test
    void limiteDoOperadorSomaItemETotal() {
        Produto item = produto("Item", un, Precos.de("100.00"));
        LinhaParaCalculo comSeis = comDesconto(daUnidade(1, item, "1"), TipoDesconto.VALOR, "6.00");
        DescontoInformado cinco = new DescontoInformado(TipoDesconto.VALOR, new BigDecimal("5.00"));

        CalculoDaVenda soDoItem = CalculadoraDaVenda.calcular(List.of(comSeis), null, List.of(), false,
                LIMITE_PADRAO, HOJE);
        CalculoDaVenda soDoTotal = CalculadoraDaVenda.calcular(List.of(daUnidade(1, item, "1")), cinco, List.of(),
                false, LIMITE_PADRAO, HOJE);
        CalculoDaVenda somados = CalculadoraDaVenda.calcular(List.of(comSeis), cinco, List.of(), false,
                LIMITE_PADRAO, HOJE);

        assertThat(soDoItem.erros()).isEmpty();
        assertThat(soDoTotal.erros()).isEmpty();
        assertThat(somados.erros()).containsExactly(
                new ErroDoCalculo("desconto", "O desconto passa do limite do operador (10%)."));
    }

    @Test
    void etiquetaEEmbalagemNaoContamParaOAtacado() {
        Produto agua = produto("Água", un, Precos.de("2.00").comAtacado("1.50", "3"));
        ProdutoEmbalagem fardo = embalagem(agua, cx, "6", null);

        CalculoDaVenda calculo = calcular(List.of(etiqueta(agua, TipoInformacaoEtiqueta.VALOR, "4.000"),
                daEmbalagem(2, agua, fardo, "1"), daUnidade(3, agua, "2")));

        assertThat(calculo.linhas().get(0).quantidade()).isEqualByComparingTo("2");
        assertThat(calculo.linhas()).extracting(LinhaCalculada::origem).containsExactly(OrigemPrecoDaVenda.ETIQUETA,
                OrigemPrecoDaVenda.EMBALAGEM, OrigemPrecoDaVenda.NORMAL);
        assertThat(calculo.linhas().get(2).precoUnitario()).isEqualByComparingTo("2.00");
    }

    @Test
    void atacadoDeixaDeValerQuandoASomaCai() {
        Produto agua = produto("Água", un, Precos.de("2.00").comAtacado("1.50", "12"));

        CalculoDaVenda comDoze = calcular(List.of(daUnidade(1, agua, "7"), daUnidade(2, agua, "5")));
        CalculoDaVenda comOnze = calcular(List.of(daUnidade(1, agua, "7"), daUnidade(2, agua, "4")));

        assertThat(comDoze.linhas()).extracting(LinhaCalculada::origem).containsOnly(OrigemPrecoDaVenda.ATACADO);
        assertThat(comOnze.linhas()).extracting(LinhaCalculada::origem).containsOnly(OrigemPrecoDaVenda.NORMAL);
        assertThat(comOnze.total()).isEqualByComparingTo("22.00");
    }

    /** A promocao vale ate o ultimo dia (inclusive) e deixa de valer no dia seguinte, a partir da meia-noite. */
    @Test
    void promocaoVaiAteOUltimoDiaEVenceNaMeiaNoite() {
        Produto racao = produto("Ração", un, Precos.de("10.00").comPromocao("8.00"));
        java.time.LocalDate ultimoDia = HOJE.plusDays(1);

        CalculoDaVenda noUltimoDia = CalculadoraDaVenda.calcular(List.of(daUnidade(1, racao, "1")), null, List.of(),
                true, LIMITE_PADRAO, ultimoDia);
        CalculoDaVenda noDiaSeguinte = CalculadoraDaVenda.calcular(List.of(daUnidade(1, racao, "1")), null,
                List.of(), true, LIMITE_PADRAO, ultimoDia.plusDays(1));

        assertThat(noUltimoDia.linhas().get(0).origem()).isEqualTo(OrigemPrecoDaVenda.PROMOCIONAL);
        assertThat(noUltimoDia.total()).isEqualByComparingTo("8.00");
        assertThat(noDiaSeguinte.linhas().get(0).origem()).isEqualTo(OrigemPrecoDaVenda.NORMAL);
        assertThat(noDiaSeguinte.total()).isEqualByComparingTo("10.00");
    }

    // ---------- Pagamento (3.4) ----------

    @Test
    void cartaoAcimaDoTotalRecusado() {
        CalculoDaVenda calculo = pagar("50.00", pagamento(FormaDePagamento.DEBITO, "30.00"),
                pagamento(FormaDePagamento.PIX, "25.00"));

        assertThat(calculo.erros()).containsExactly(new ErroDoCalculo("pagamentos",
                "Cartão e PIX não podem passar do total. O troco só sai do dinheiro."));
    }

    @Test
    void faltaPagar() {
        CalculoDaVenda calculo = pagar("71.50", pagamento(FormaDePagamento.PIX, "20.00"));

        assertThat(calculo.faltaPagar()).isEqualByComparingTo("51.50");
        assertThat(calculo.erros()).containsExactly(new ErroDoCalculo("pagamentos", "Falta pagar R$ 51,50."));
    }

    @Test
    void semPagamentoNaoEErroAinda() {
        CalculoDaVenda calculo = pagar("71.50");

        assertThat(calculo.faltaPagar()).isEqualByComparingTo("71.50");
        assertThat(calculo.erros()).isEmpty();
    }

    @Test
    void trocoSoDoDinheiro() {
        CalculoDaVenda calculo = pagar("71.50", pagamento(FormaDePagamento.DINHEIRO, "60.00"),
                pagamento(FormaDePagamento.PIX, "20.00"));

        assertThat(calculo.erros()).isEmpty();
        assertThat(calculo.pago()).isEqualByComparingTo("80.00");
        assertThat(calculo.troco()).isEqualByComparingTo("8.50");
        assertThat(calculo.recebidosPorForma()).containsOnlyKeys(FormaDePagamento.DINHEIRO, FormaDePagamento.PIX);
        assertThat(calculo.recebidosPorForma().get(FormaDePagamento.DINHEIRO)).isEqualByComparingTo("51.50");
        assertThat(calculo.recebidosPorForma().get(FormaDePagamento.PIX)).isEqualByComparingTo("20.00");
    }

    @Test
    void dinheiroTodoEmTrocoSemRecebimentoEmDinheiro() {
        CalculoDaVenda calculo = pagar("10.00", pagamento(FormaDePagamento.PIX, "10.00"),
                pagamento(FormaDePagamento.DINHEIRO, "5.00"));

        assertThat(calculo.erros()).isEmpty();
        assertThat(calculo.troco()).isEqualByComparingTo("5.00");
        assertThat(calculo.recebidosPorForma()).containsOnlyKeys(FormaDePagamento.PIX);
    }

    @Test
    void formaRepetidaRecusada() {
        CalculoDaVenda calculo = pagar("10.00", pagamento(FormaDePagamento.PIX, "5.00"),
                pagamento(FormaDePagamento.PIX, "5.00"));

        assertThat(calculo.erros()).contains(new ErroDoCalculo("pagamentos", "Use uma linha por forma de pagamento."));
    }

    // ---------- Limite de linhas ----------

    @Test
    void limiteDeTrezentasLinhas() {
        Produto item = produto("Item", un, Precos.de("1.00"));
        List<LinhaParaCalculo> linhas = new ArrayList<>();
        for (int ordem = 1; ordem <= 301; ordem++) {
            linhas.add(daUnidade(ordem, item, "1"));
        }

        assertThat(calcular(linhas).erros()).containsExactly(
                new ErroDoCalculo("itens", "A venda atingiu o limite de 300 itens."));
        assertThat(calcular(linhas.subList(0, 300)).erros()).isEmpty();
    }

    // ------------------------------------------------------------------
    // Apoio
    // ------------------------------------------------------------------

    private Produto outro(String nome) {
        return produto(nome, un, Precos.de("10.00"));
    }

    private static CalculoDaVenda calcular(List<LinhaParaCalculo> linhas) {
        return CalculadoraDaVenda.calcular(linhas, null, List.of(), true, LIMITE_PADRAO, HOJE);
    }

    private static LinhaCalculada umaLinha(LinhaParaCalculo linha) {
        CalculoDaVenda calculo = calcular(List.of(linha));
        assertThat(calculo.erros()).isEmpty();
        return calculo.linhas().get(0);
    }

    /** Um item de R$ {@code total} pago com os pagamentos informados. */
    private CalculoDaVenda pagar(String total, PagamentoInformado... pagamentos) {
        Produto item = produto("Item", un, Precos.de(total));
        return CalculadoraDaVenda.calcular(List.of(daUnidade(1, item, "1")), null, List.of(pagamentos), true,
                LIMITE_PADRAO, HOJE);
    }

    private static PagamentoInformado pagamento(FormaDePagamento forma, String valor) {
        return new PagamentoInformado(forma, new BigDecimal(valor));
    }

    private static LinhaParaCalculo daUnidade(int ordem, Produto produto, String quantidade) {
        return new LinhaParaCalculo(ordem, produto, null, null, String.valueOf(produto.getCodigo()),
                new BigDecimal(quantidade), null);
    }

    private static LinhaParaCalculo daEmbalagem(int ordem, Produto produto, ProdutoEmbalagem embalagem,
            String quantidade) {
        return new LinhaParaCalculo(ordem, produto, embalagem, null, "789", new BigDecimal(quantidade), null);
    }

    private static LinhaParaCalculo etiqueta(Produto produto, TipoInformacaoEtiqueta tipo, String valor) {
        return new LinhaParaCalculo(1, produto, null, new LeituraEtiqueta(produto.getCodigo(), tipo,
                new BigDecimal(valor)), "2000542010000", new BigDecimal("99"), null);
    }

    private static LinhaParaCalculo comDesconto(LinhaParaCalculo linha, TipoDesconto tipo, String valor) {
        return new LinhaParaCalculo(linha.ordem(), linha.produto(), linha.embalagem(), linha.etiqueta(),
                linha.codigoLido(), linha.quantidade(), new DescontoInformado(tipo, new BigDecimal(valor)));
    }
}
