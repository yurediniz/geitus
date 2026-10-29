package com.geitus.app.cashier.sessao;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class TipoDeMovimentoDeCaixaTest {

    private static final BigDecimal DEZ = new BigDecimal("10.00");

    @Test
    void sangriaEstornoEDevolucaoSubtraemDoEsperado() {
        assertThat(TipoDeMovimentoDeCaixa.SANGRIA.comSinal(DEZ)).isEqualByComparingTo("-10.00");
        assertThat(TipoDeMovimentoDeCaixa.ESTORNO.comSinal(DEZ)).isEqualByComparingTo("-10.00");
        assertThat(TipoDeMovimentoDeCaixa.DEVOLUCAO.comSinal(DEZ)).isEqualByComparingTo("-10.00");
        assertThat(TipoDeMovimentoDeCaixa.ABERTURA.comSinal(DEZ)).isEqualByComparingTo("10.00");
        assertThat(TipoDeMovimentoDeCaixa.SUPRIMENTO.comSinal(DEZ)).isEqualByComparingTo("10.00");
        assertThat(TipoDeMovimentoDeCaixa.RECEBIMENTO.comSinal(DEZ)).isEqualByComparingTo("10.00");
    }

    @Test
    void recebimentoEstornoEDevolucaoSaoDaVendaENaoSaoLancaveis() {
        assertThat(TipoDeMovimentoDeCaixa.DEVOLUCAO.daVenda()).isTrue();
        assertThat(TipoDeMovimentoDeCaixa.RECEBIMENTO.daVenda()).isTrue();
        assertThat(TipoDeMovimentoDeCaixa.ESTORNO.daVenda()).isTrue();
        assertThat(TipoDeMovimentoDeCaixa.SANGRIA.daVenda()).isFalse();
        assertThat(TipoDeMovimentoDeCaixa.DEVOLUCAO.lancavel()).isFalse();
    }
}
