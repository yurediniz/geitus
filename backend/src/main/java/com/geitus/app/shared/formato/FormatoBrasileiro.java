package com.geitus.app.shared.formato;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.Locale;

/**
 * Valores nas mensagens para o usuario, no formato das specs: dinheiro como
 * {@code R$ 1.234,56} (com espaco comum; o {@code NumberFormat} de moeda do JDK
 * usa espaco nao separavel) e quantidade ou percentual sem zeros a direita e
 * com virgula ({@code 2,5}, {@code 10}).
 */
public final class FormatoBrasileiro {

    private static final DecimalFormatSymbols SIMBOLOS = DecimalFormatSymbols.getInstance(Locale.of("pt", "BR"));
    private static final String PADRAO_DO_REAL = "#,##0.00";
    private static final int CASAS_DO_REAL = 2;

    private FormatoBrasileiro() {
        // Apenas metodos estaticos.
    }

    /** {@code R$ 1.234,56}, arredondado a centavos meio para cima. */
    public static String reais(BigDecimal valor) {
        // DecimalFormat nao e thread-safe: um por chamada.
        DecimalFormat formato = new DecimalFormat(PADRAO_DO_REAL, SIMBOLOS);
        return "R$ " + formato.format(valor.setScale(CASAS_DO_REAL, RoundingMode.HALF_UP));
    }

    /** {@code 2,5}, {@code 12}, {@code -1}: sem zeros a direita, sem notacao cientifica. */
    public static String numero(BigDecimal valor) {
        return valor.stripTrailingZeros().toPlainString().replace('.', ',');
    }
}
