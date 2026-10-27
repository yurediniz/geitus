package com.geitus.app.catalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

/**
 * Formulas de margem e markup (docs/modules/produtos.md),
 * usadas pelo produto e pelas embalagens (Fase B3, 3.2).
 */
class MargemEMarkupTest {

    @Test
    void calculaMargemEMarkupDoExemploDoNexgard() {
        BigDecimal preco = new BigDecimal("209.90");
        BigDecimal custo = new BigDecimal("150.00");

        assertThat(MargemEMarkup.margem(preco, custo)).isEqualByComparingTo("28.54");
        assertThat(MargemEMarkup.markup(preco, custo)).isEqualByComparingTo("39.93");
        assertThat(MargemEMarkup.margem(preco, custo).scale()).isEqualTo(2);
    }

    @Test
    void semCustoNaoCalcula() {
        assertThat(MargemEMarkup.margem(new BigDecimal("10.00"), null)).isNull();
        assertThat(MargemEMarkup.markup(new BigDecimal("10.00"), null)).isNull();
    }

    @Test
    void custoZeroNaoTemMarkup() {
        assertThat(MargemEMarkup.markup(new BigDecimal("10.00"), BigDecimal.ZERO)).isNull();
        assertThat(MargemEMarkup.margem(new BigDecimal("10.00"), BigDecimal.ZERO)).isEqualByComparingTo("100");
    }

    @Test
    void precoZeroNaoTemMargem() {
        assertThat(MargemEMarkup.margem(BigDecimal.ZERO, new BigDecimal("5.00"))).isNull();
    }
}
