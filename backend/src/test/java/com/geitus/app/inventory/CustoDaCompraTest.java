package com.geitus.app.inventory;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

import com.geitus.app.catalog.CustoDeEntrada;

/**
 * Conta do custo da compra (Fase B4, docs/modules/estoque.md):
 * o por unidade e o digitado em unidades, ou a divisao pela embalagem
 * com 4 casas, meio para cima; as escalas sao as das colunas da V13.
 */
class CustoDaCompraTest {

    private static RetratoDaEmbalagem caixaCom(String unidades) {
        return new RetratoDaEmbalagem("CX c/ " + unidades + " UN", new BigDecimal(unidades), 1);
    }

    @Test
    void emUnidadesOPorUnidadeEODigitado() {
        CustoDaCompra custo = CustoDaCompra.de(new BigDecimal("10"), null);

        assertThat(custo.informado()).isEqualTo(new BigDecimal("10.00"));
        assertThat(custo.porUnidade()).isEqualTo(new BigDecimal("10.0000"));
    }

    @Test
    void emEmbalagemDivideComQuatroCasas() {
        assertThat(CustoDaCompra.de(new BigDecimal("180.00"), caixaCom("18")).porUnidade())
                .isEqualTo(new BigDecimal("10.0000"));
        assertThat(CustoDaCompra.de(new BigDecimal("100.00"), caixaCom("3")).porUnidade())
                .isEqualTo(new BigDecimal("33.3333"));
        assertThat(CustoDaCompra.de(new BigDecimal("200.00"), caixaCom("3")).porUnidade())
                .isEqualTo(new BigDecimal("66.6667"));
    }

    /** Unidade fracionada: SC c/ 25,5 KG a R$ 127,50 = R$ 5,0000 por KG. */
    @Test
    void sacoDeVinteECincoEMeio() {
        RetratoDaEmbalagem saco = new RetratoDaEmbalagem("SC c/ 25,5 KG", new BigDecimal("25.5"), 1);

        assertThat(CustoDaCompra.de(new BigDecimal("127.50"), saco).porUnidade()).isEqualTo(new BigDecimal("5.0000"));
    }

    /** CX c/ 101 a R$ 0,50 = 0,00495 -> 0,0050 no movimento e 0,01 no produto (meio para cima, duas vezes). */
    @Test
    void centavoArredondadoParaCimaNoProduto() {
        CustoDaCompra custo = CustoDaCompra.de(new BigDecimal("0.50"), caixaCom("101"));

        assertThat(custo.porUnidade()).isEqualTo(new BigDecimal("0.0050"));
        assertThat(CustoDeEntrada.custoDoProduto(custo.porUnidade())).isEqualTo(new BigDecimal("0.01"));
        assertThat(custo.positivo()).isTrue();
    }

    @Test
    void positivoSoComOsDoisMaioresQueZero() {
        assertThat(CustoDaCompra.de(new BigDecimal("0.01"), null).positivo()).isTrue();
        assertThat(CustoDaCompra.de(BigDecimal.ZERO, null).positivo()).isFalse();
        assertThat(CustoDaCompra.de(new BigDecimal("-1"), null).positivo()).isFalse();
        // R$ 0,01 numa embalagem de 1000 UN arredonda a 0,0000 por UN.
        assertThat(CustoDaCompra.de(new BigDecimal("0.01"), caixaCom("1000")).positivo()).isFalse();
        // R$ 0,10 por CX c/ 1000 = 0,0001 por UN, mas 0,00 no custo do produto (centavos).
        assertThat(CustoDaCompra.de(new BigDecimal("0.10"), caixaCom("1000")).positivo()).isFalse();
        // R$ 5,00 por CX c/ 1000 = 0,005 -> 0,01 no produto (meio para cima).
        assertThat(CustoDaCompra.de(new BigDecimal("5.00"), caixaCom("1000")).positivo()).isTrue();
    }
}
