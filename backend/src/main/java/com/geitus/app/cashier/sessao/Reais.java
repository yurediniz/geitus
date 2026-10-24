package com.geitus.app.cashier.sessao;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/**
 * Valores em reais nas mensagens do caixa, no formato da spec:
 * {@code R$ 1.234,56}, com espaco comum (o {@code NumberFormat} de moeda do
 * JDK usa espaco nao separavel).
 */
final class Reais {

    private static final DecimalFormatSymbols SIMBOLOS = DecimalFormatSymbols.getInstance(Locale.of("pt", "BR"));
    private static final String PADRAO = "#,##0.00";

    private Reais() {
        // Apenas metodos estaticos.
    }

    static String formatar(BigDecimal valor) {
        // DecimalFormat nao e thread-safe: um por chamada.
        DecimalFormat formato = new DecimalFormat(PADRAO, SIMBOLOS);
        return "R$ " + formato.format(valor.setScale(2, RoundingMode.HALF_UP));
    }
}
