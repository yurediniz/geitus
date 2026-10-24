package com.geitus.app.cashier.sessao;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

/** Valores nas mensagens do caixa no formato da spec: {@code R$ 1.234,56} (espaco comum, sem NBSP). */
class ReaisTest {

    @Test
    void formataComMilharEDuasCasas() {
        assertThat(Reais.formatar(new BigDecimal("1234.5"))).isEqualTo("R$ 1.234,50");
    }

    @Test
    void formataZeroEValoresPequenos() {
        assertThat(Reais.formatar(BigDecimal.ZERO)).isEqualTo("R$ 0,00");
        assertThat(Reais.formatar(new BigDecimal("50.00"))).isEqualTo("R$ 50,00");
    }

    @Test
    void formataOLimiteDoCaixa() {
        assertThat(Reais.formatar(new BigDecimal("9999999999.99"))).isEqualTo("R$ 9.999.999.999,99");
    }
}
